
'use server';
/**
 * @fileOverview Un bot de IA que procesa solicitudes de citas por correo electrónico.
 *
 * - handleEmailRequest - Procesa el cuerpo de un correo para agendar una cita.
 * - EmailRequestInput - El tipo de entrada para la función (el cuerpo del email).
 * - EmailRequestOutput - El tipo de salida (la respuesta a enviar al cliente).
 */

import { ai } from '@/ai/genkit';
import { z } from 'zod';
import { getServices, addAppointment, getProfessionalAvailabilityForDate, getAppointments, getProfessionals } from '@/lib/data';
import { format, parse, startOfDay, addMinutes, areIntervalsOverlapping, parseISO, set } from 'date-fns';
import { es } from 'date-fns/locale';

// Esquema de entrada: el cuerpo del correo electrónico
const EmailRequestInputSchema = z.object({
  emailBody: z.string().describe('El contenido completo del correo electrónico del cliente solicitando una cita.'),
});
export type EmailRequestInput = z.infer<typeof EmailRequestInputSchema>;

// Esquema de salida: la respuesta que se enviaría al cliente
const EmailRequestOutputSchema = z.object({
  reply: z.string().describe('La respuesta de correo electrónico para el cliente, confirmando la cita o indicando por qué no se pudo agendar.'),
});
export type EmailRequestOutput = z.infer<typeof EmailRequestOutputSchema>;

// Esquema para la extracción de datos del correo
const ExtractedInfoSchema = z.object({
  patientName: z.string().describe('El nombre completo del paciente.'),
  requestedService: z.string().describe('El servicio que el paciente desea, por ejemplo, "quiropodia" o "tratamiento de uñas".'),
  requestedDate: z.string().describe('La fecha deseada en formato YYYY-MM-DD.'),
  requestedTime: z.string().describe('La hora deseada en formato HH:mm (24 horas).'),
});

/**
 * Función principal que maneja una solicitud de cita por correo electrónico.
 * @param input El cuerpo del correo electrónico.
 * @returns Una respuesta para el cliente.
 */
export async function handleEmailRequest(input: EmailRequestInput): Promise<EmailRequestOutput> {
  return await emailBotFlow(input);
}

const emailBotFlow = ai.defineFlow(
  {
    name: 'emailBotFlow',
    inputSchema: EmailRequestInputSchema,
    outputSchema: EmailRequestOutputSchema,
  },
  async ({ emailBody }) => {
    // 1. Extraer la información clave del correo electrónico
    const extractionPrompt = ai.definePrompt({
      name: 'extractAppointmentInfoPrompt',
      input: { schema: z.object({ emailBody: z.string(), currentDate: z.string() }) },
      output: { schema: ExtractedInfoSchema },
      prompt: `Extrae la siguiente información del cuerpo del correo electrónico. La fecha actual es {{currentDate}}.
      - Nombre del paciente (patientName)
      - Servicio solicitado (requestedService)
      - Fecha deseada (requestedDate), si mencionan "mañana" o un día de la semana, conviértelo a YYYY-MM-DD.
      - Hora deseada (requestedTime) en formato HH:mm.

      Email: """{{emailBody}}"""`,
    });
    
    const extractionResult = await extractionPrompt({
        emailBody,
        currentDate: format(new Date(), 'yyyy-MM-dd'),
    });

    if (!extractionResult.output) {
      return { reply: 'Lo siento, no pude entender completamente tu solicitud. Por favor, asegúrate de incluir tu nombre, el servicio deseado, y la fecha y hora.' };
    }
    
    const { patientName, requestedService, requestedDate, requestedTime } = extractionResult.output;
    
    // 2. Encontrar el servicio y su duración
    const services = await getServices();
    const service = services.find(s => s.name.toLowerCase().includes(requestedService.toLowerCase()));
    
    if (!service) {
      return { reply: `Lo siento, no ofrecemos el servicio de "${requestedService}". Nuestros servicios disponibles son: ${services.map(s => s.name).join(', ')}.` };
    }

    // 3. Verificar la disponibilidad
    const appointmentDate = parse(`${requestedDate} ${requestedTime}`, 'yyyy-MM-dd HH:mm', new Date());
    const professionals = await getProfessionals();
    const appointmentsForDay = await getAppointments({ date: appointmentDate });

    let availableProfessional = null;
    for (const prof of professionals) {
      if (prof.isManager) continue;

      const availability = getProfessionalAvailabilityForDate(prof, appointmentDate);
      if (!availability || !availability.isWorking) continue;

      const workStart = parse(`${requestedDate} ${availability.startTime}`, 'yyyy-MM-dd HH:mm', new Date());
      const workEnd = parse(`${requestedDate} ${availability.endTime}`, 'yyyy-MM-dd HH:mm', new Date());
      const proposedEnd = addMinutes(appointmentDate, service.defaultDuration);

      if (appointmentDate < workStart || proposedEnd > workEnd) continue;

      const isBusy = appointmentsForDay.appointments.some(appt => {
        if (appt.professionalId !== prof.id) return false;
        const existingStart = parseISO(appt.appointmentDateTime);
        const existingEnd = addMinutes(existingStart, appt.durationMinutes);
        return areIntervalsOverlapping({ start: appointmentDate, end: proposedEnd }, { start: existingStart, end: existingEnd });
      });

      if (!isBusy) {
        availableProfessional = prof;
        break;
      }
    }

    // 4. Agendar la cita o responder con el error
    if (availableProfessional) {
      const [firstName, ...lastNameParts] = patientName.split(' ');
      const lastName = lastNameParts.join(' ');
      
      await addAppointment({
        patientFirstName: firstName,
        patientLastName: lastName || 'Apellido', // Fallback
        locationId: availableProfessional.locationId,
        serviceId: service.id,
        appointmentDate,
        appointmentTime: format(appointmentDate, 'HH:mm'),
        preferredProfessionalId: availableProfessional.id,
      });

      return {
        reply: `¡Hola ${firstName}!
        
Tu cita ha sido agendada con éxito.

Servicio: ${service.name}
Profesional: ${availableProfessional.firstName} ${availableProfessional.lastName}
Fecha: ${format(appointmentDate, "EEEE, d 'de' MMMM 'de' yyyy", { locale: es })}
Hora: ${format(appointmentDate, 'h:mm a')}

¡Te esperamos!`,
      };
    } else {
      return {
        reply: `Hola ${patientName},
        
Lamentablemente, no tenemos disponibilidad para "${service.name}" en la fecha y hora que solicitaste. 
Por favor, intenta con otro horario.

Gracias por tu comprensión.`,
      };
    }
  }
);
