
'use server';
/**
 * @fileOverview Un bot de IA que interpreta comandos de dictado para gestionar citas.
 *
 * - processDictation - Procesa un comando de texto para realizar acciones.
 * - DictationInput - El tipo de entrada para la función (el comando del usuario).
 * - DictationOutput - El tipo de salida (el resultado de la acción).
 */

import { ai } from '@/ai/genkit';
import { z } from 'zod';
import { getServices, addAppointment, getProfessionalAvailabilityForDate, getAppointments, getProfessionals, findPatient, updateAppointment } from '@/lib/data';
import { format, parse, startOfDay, addMinutes, areIntervalsOverlapping, parseISO, set } from 'date-fns';
import { es } from 'date-fns/locale';

// Esquema de entrada: el comando de texto del usuario
export type DictationInput = z.infer<typeof DictationInputSchema>;
const DictationInputSchema = z.object({
  command: z.string().describe('El comando de texto dado por el usuario para gestionar una cita.'),
});

// Esquema de salida: la respuesta que se mostrará al usuario
export type DictationOutput = z.infer<typeof DictationOutputSchema>;
const DictationOutputSchema = z.object({
  success: z.boolean().describe('Indica si la operación fue exitosa.'),
  message: z.string().describe('Un mensaje para el usuario resumiendo el resultado de la operación.'),
  confirmationRequired: z.boolean().optional().describe('Indica si se necesita confirmación del usuario.'),
  suggestedChanges: z.any().optional().describe('Un objeto con los cambios sugeridos para que el usuario los confirme.'),
});

// Esquema para la extracción de la intención y entidades del comando
const ExtractedInfoSchema = z.object({
  intent: z.enum(['agendar', 'reagendar', 'cancelar', 'consultar', 'otro'])
    .describe('La intención principal del comando del usuario: agendar, reagendar, cancelar o consultar.'),
  patientName: z.string().optional().describe('El nombre completo del paciente.'),
  requestedService: z.string().optional().describe('El servicio que el paciente desea, por ejemplo, "quiropodia".'),
  requestedDate: z.string().optional().describe('La fecha deseada en formato YYYY-MM-DD.'),
  requestedTime: z.string().optional().describe('La hora deseada en formato HH:mm (24 horas).'),
  newDate: z.string().optional().describe('La nueva fecha para un reagendamiento, en formato YYYY-MM-DD.'),
  newTime: z.string().optional().describe('La nueva hora para un reagendamiento, en formato HH:mm (24 horas).'),
});


/**
 * Función principal que procesa un comando de dictado.
 * @param input El comando de texto del usuario.
 * @returns Un objeto con el resultado de la operación.
 */
export async function processDictation(input: DictationInput): Promise<DictationOutput> {
  return await dictationBotFlow(input);
}


const findAppointmentTool = ai.defineTool(
  {
    name: 'findAppointmentTool',
    description: 'Busca una cita existente para un paciente en una fecha específica.',
    inputSchema: z.object({
        patientName: z.string().describe('Nombre del paciente'),
        date: z.string().describe('Fecha de la cita en formato YYYY-MM-DD'),
    }),
    outputSchema: z.object({
        id: z.string(),
        patient: z.string(),
        service: z.string(),
        dateTime: z.string(),
    }).array(),
  },
  async ({ patientName, date }) => {
    console.log(`[Tool] Buscando citas para ${patientName} en fecha ${date}`);
    const targetDate = parse(date, 'yyyy-MM-dd', new Date());
    const { appointments } = await getAppointments({ date: targetDate });
    const patientAppointments = appointments.filter(appt => 
      `${appt.patient?.firstName} ${appt.patient?.lastName}`.toLowerCase().includes(patientName.toLowerCase())
    );
    return patientAppointments.map(appt => ({
        id: appt.id,
        patient: `${appt.patient?.firstName} ${appt.patient?.lastName}`,
        service: appt.service?.name || 'Desconocido',
        dateTime: appt.appointmentDateTime,
    }));
  }
);


const dictationBotFlow = ai.defineFlow(
  {
    name: 'dictationBotFlow',
    inputSchema: DictationInputSchema,
    outputSchema: DictationOutputSchema,
    tools: [findAppointmentTool],
  },
  async ({ command }) => {
    
    const llmResponse = await ai.generate({
      prompt: `Analiza el siguiente comando de un administrador de clínica y decide qué acción tomar. La fecha actual es ${format(new Date(), 'yyyy-MM-dd')}.

      Comando: "${command}"

      1.  **Extrae la intención**: ¿Quiere 'agendar', 'reagendar' o 'cancelar' una cita?
      2.  **Extrae las entidades**: Nombre del paciente, servicio, fecha y hora. Si es reagendar, extrae también la nueva fecha y hora.
      3.  **Planifica los pasos**:
          *   Si la intención es **'reagendar'** o **'cancelar'**, primero DEBES usar la herramienta \`findAppointmentTool\` para encontrar la cita existente.
          *   Si no encuentras una cita única, responde que necesitas más detalles para identificar la cita.
          *   Una vez identificada la cita, realiza la acción solicitada (reagendar o cancelar).
          *   Si la intención es **'agendar'**, procede directamente a crear la cita.
      
      Responde con un JSON que contenga el plan de acción.`,
      model: ai.model('gemini-1.5-flash-latest'),
      output: {
        schema: z.object({
            thoughts: z.string().describe("Tus pensamientos sobre cómo procesar el comando."),
            plan: z.string().describe("Una descripción paso a paso de lo que vas a hacer."),
            extractedInfo: ExtractedInfoSchema,
        })
      }
    });

    const { plan, extractedInfo } = llmResponse.output!;

    if (extractedInfo.intent === 'reagendar' || extractedInfo.intent === 'cancelar') {
        if (!extractedInfo.patientName || !extractedInfo.requestedDate) {
            return { success: false, message: "Para reagendar o cancelar, necesito el nombre del paciente y la fecha original de la cita."};
        }

        const foundAppointments = await findAppointmentTool({ patientName: extractedInfo.patientName, date: extractedInfo.requestedDate });
        
        if (foundAppointments.length === 0) {
            return { success: false, message: `No se encontraron citas para "${extractedInfo.patientName}" en la fecha indicada.` };
        }
        if (foundAppointments.length > 1) {
            return { success: false, message: `Se encontraron múltiples citas para "${extractedInfo.patientName}". Por favor, sea más específico.` };
        }

        const appointmentToChange = foundAppointments[0];
        
        if (extractedInfo.intent === 'cancelar') {
            await updateAppointment(appointmentToChange.id, { status: 'cancelled_staff' });
            return { success: true, message: `Cita cancelada exitosamente para ${appointmentToChange.patient} del ${format(parseISO(appointmentToChange.dateTime), 'PPP p', {locale: es})}.`};
        }
        
        if (extractedInfo.intent === 'reagendar' && extractedInfo.newDate && extractedInfo.newTime) {
            const newDateTime = parse(`${extractedInfo.newDate} ${extractedInfo.newTime}`, 'yyyy-MM-dd HH:mm', new Date());
            await updateAppointment(appointmentToChange.id, { appointmentDate: newDateTime, appointmentTime: extractedInfo.newTime });
            return { success: true, message: `Cita de ${appointmentToChange.patient} reagendada para el ${format(newDateTime, 'PPP p', {locale: es})}.`};
        }
    }


    if(extractedInfo.intent === 'agendar') {
        const { patientName, requestedService, requestedDate, requestedTime } = extractedInfo;
        if (!patientName || !requestedService || !requestedDate || !requestedTime) {
            return { success: false, message: "Para agendar, necesito al menos nombre, servicio, fecha y hora." };
        }
        
        const services = await getServices();
        const service = services.find(s => s.name.toLowerCase().includes(requestedService.toLowerCase()));

        if (!service) {
            return { success: false, message: `Servicio "${requestedService}" no encontrado.` };
        }
        
        const [firstName, ...lastNameParts] = patientName.split(' ');
        const appointmentDate = parse(`${requestedDate} ${requestedTime}`, 'yyyy-MM-dd HH:mm', new Date());

        const suggestedChanges = {
            patientFirstName: firstName,
            patientLastName: lastNameParts.join(' ') || ' ',
            serviceId: service.id,
            locationId: 'higuereta', // Hardcoded a sede principal por simplicidad del bot
            appointmentDate: appointmentDate,
            appointmentTime: requestedTime,
        };

        const confirmationMessage = `Por favor, confirme los siguientes datos para la cita:
- Paciente: ${patientName}
- Servicio: ${service.name}
- Fecha: ${format(appointmentDate, 'PPP', {locale: es})}
- Hora: ${requestedTime}
- Sede: Higuereta (predeterminado)`;

        return { 
          success: true, 
          message: confirmationMessage,
          confirmationRequired: true,
          suggestedChanges,
        };
    }

    return { success: false, message: `No pude entender el comando. Intenciones soportadas: agendar, reagendar, cancelar.` };
  }
);
