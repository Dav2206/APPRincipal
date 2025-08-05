
'use server';
/**
 * @fileOverview Un bot de IA que procesa solicitudes de citas desde WhatsApp.
 * IMPORTANTE: Este es un placeholder funcional para la lógica.
 * NO está conectado a la API de WhatsApp, pero la lógica está lista.
 *
 * - handleWhatsAppMessage - Procesa un mensaje de texto para agendar una cita.
 * - WhatsAppInput - El tipo de entrada para la función (mensaje del usuario).
 * - WhatsAppOutput - El tipo de salida (la respuesta a enviar al usuario).
 */

import { ai } from '@/ai/genkit';
import { z } from 'zod';
import { getServices, addAppointment, getProfessionalAvailabilityForDate, getAppointments, getProfessionals } from '@/lib/data';
import { format, parse, addMinutes, areIntervalsOverlapping, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';


// Esquema de entrada: el mensaje de texto del usuario
const WhatsAppInputSchema = z.object({
  from: z.string().describe('El número de teléfono del usuario o el identificador del grupo.'),
  message: z.string().describe('El contenido del mensaje de texto para agendar una cita.'),
});
export type WhatsAppInput = z.infer<typeof WhatsAppInputSchema>;

// Esquema de salida: la respuesta que se enviaría de vuelta
const WhatsAppOutputSchema = z.object({
  reply: z.string().describe('El mensaje de respuesta para el usuario, confirmando o indicando el problema.'),
});
export type WhatsAppOutput = z.infer<typeof WhatsAppOutputSchema>;

// Esquema para la extracción de datos del mensaje
const ExtractedInfoSchema = z.object({
  patientName: z.string().describe('El nombre completo del paciente.'),
  requestedService: z.string().describe('El servicio que el paciente desea, por ejemplo, "quiropodia".'),
  requestedDate: z.string().describe('La fecha deseada en formato YYYY-MM-DD.'),
  requestedTime: z.string().describe('La hora deseada en formato HH:mm (24 horas).'),
});


/**
 * Esta función procesaría un mensaje de WhatsApp para agendar una cita.
 *
 * @param input El mensaje recibido del usuario/grupo.
 * @returns Una respuesta a ser enviada de vuelta.
 */
export async function handleWhatsAppMessage(input: WhatsAppInput): Promise<WhatsAppOutput> {
  return await whatsAppBotFlow(input);
}


const whatsAppBotFlow = ai.defineFlow(
  {
    name: 'whatsAppBotFlow',
    inputSchema: WhatsAppInputSchema,
    outputSchema: WhatsAppOutputSchema,
  },
  async ({ message }) => {
    // 1. Extraer la información clave del mensaje de texto
    const extractionPrompt = ai.definePrompt({
      name: 'extractAppointmentInfoFromWhatsAppPrompt',
      input: { schema: z.object({ messageText: z.string(), currentDate: z.string() }) },
      output: { schema: ExtractedInfoSchema },
      prompt: `Extrae la siguiente información del mensaje de texto. La fecha actual es {{currentDate}}.
      - Nombre del paciente (patientName)
      - Servicio solicitado (requestedService)
      - Fecha deseada (requestedDate), si mencionan "mañana" o un día de la semana, conviértelo a YYYY-MM-DD.
      - Hora deseada (requestedTime) en formato HH:mm.

      Mensaje: """{{messageText}}"""`,
    });
    
    const extractionResult = await extractionPrompt({
        messageText: message,
        currentDate: format(new Date(), 'yyyy-MM-dd'),
    });

    if (!extractionResult.output) {
      return { reply: 'Lo siento, no pude entender completamente la solicitud. Por favor, asegúrate de incluir nombre, servicio, fecha y hora.' };
    }
    
    const { patientName, requestedService, requestedDate, requestedTime } = extractionResult.output;
    
    // 2. Encontrar el servicio y su duración
    const services = await getServices();
    const service = services.find(s => s.name.toLowerCase().includes(requestedService.toLowerCase()));
    
    if (!service) {
      return { reply: `No se encontró el servicio "${requestedService}". Servicios disponibles: ${services.map(s => s.name).join(', ')}.` };
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
        reply: `✅ Cita agendada para ${firstName}!
        
Servicio: ${service.name}
Profesional: ${availableProfessional.firstName}
Fecha: ${format(appointmentDate, "EEEE, d 'de' MMMM", { locale: es })}
Hora: ${format(appointmentDate, 'h:mm a')}`,
      };
    } else {
      return {
        reply: `❌ No hay disponibilidad para "${service.name}" en la fecha y hora solicitadas. Por favor, intenta con otro horario.`,
      };
    }
  }
);

// Para hacer esto funcional, se necesitaría:
// 1. Una cuenta de WhatsApp Business API.
// 2. Un servidor separado (como una Firebase Function) para ser el webhook.
// 3. Este webhook recibiría los mensajes de Meta/WhatsApp y llamaría a `handleWhatsAppMessage`.
// 4. El webhook usaría la API de WhatsApp para enviar la `reply` de vuelta al grupo o usuario.
