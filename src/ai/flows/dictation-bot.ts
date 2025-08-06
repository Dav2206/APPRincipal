
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
import { getServices, addAppointment, findPatient, getProfessionalAvailabilityForDate, getAppointments, getProfessionals } from '@/lib/data';
import { format, parse, startOfDay, addMinutes, areIntervalsOverlapping, parseISO, set } from 'date-fns';
import { es } from 'date-fns/locale';

// Esquema de entrada: el comando de texto del usuario y contexto adicional
export type DictationInput = z.infer<typeof DictationInputSchema>;
const DictationInputSchema = z.object({
  command: z.string().describe('El comando de texto dado por el usuario para gestionar una cita.'),
  locationId: z.string().describe('El ID de la sede actualmente seleccionada en la aplicación.'),
  currentDate: z.string().describe('La fecha actual en formato YYYY-MM-DD para resolver fechas relativas como "mañana".'),
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
    isClear: z.boolean().describe("¿El comando es claro y contiene suficiente información para actuar?"),
    patientName: z.string().optional().describe('El nombre completo del paciente.'),
    serviceShorthand: z.string().optional().describe('La abreviatura del servicio (ej. "podo", "refle").'),
    requestedDate: z.string().optional().describe('La fecha deseada en formato YYYY-MM-DD.'),
    requestedTime: z.string().optional().describe('La hora deseada en formato HH:mm (24 horas).'),
    professionalName: z.string().optional().describe('El nombre del profesional solicitado.'),
}).describe("Información extraída del comando del usuario.");


/**
 * Función principal que procesa un comando de dictado.
 * @param input El comando de texto del usuario y su contexto.
 * @returns Un objeto con el resultado de la operación.
 */
export async function processDictation(input: DictationInput): Promise<DictationOutput> {
  return await dictationBotFlow(input);
}


const dictationBotFlow = ai.defineFlow(
  {
    name: 'dictationBotFlow',
    inputSchema: DictationInputSchema,
    outputSchema: DictationOutputSchema,
  },
  async ({ command, locationId, currentDate }) => {
    
    try {
      const services = await getServices();
      const serviceListForPrompt = services.map(s => `- "${s.name}" (abreviatura: ${s.name.substring(0,4).toLowerCase()})`).join('\n');

      const extractionPrompt = ai.definePrompt({
          name: 'extractInfoFromShorthandPrompt',
          input: { schema: z.object({ command: z.string(), currentDate: z.string(), serviceList: z.string() }) },
          output: { schema: ExtractedInfoSchema },
          prompt: `Eres un asistente experto en agendamiento para una clínica podológica. Tu tarea es interpretar comandos de texto muy cortos. La fecha actual es {{currentDate}}.

Reglas de interpretación:
1.  **Formato:** El comando suele ser \`[HORA] [NOMBRE PACIENTE] [SERVICIO]\`. Ejemplo: \`9 carlos sanchez podo\`.
2.  **Hora:**
    -   Un número entre 9 y 12 se refiere a la mañana (9 AM, 10 AM, etc.).
    -   Un número entre 1 y 8 se refiere a la tarde (1 PM, 2 PM, etc.). Debes convertirlo a formato 24h (1=13:00, 8=20:00).
    -   Puede incluir media hora, como \`9 30\` o \`8 30\`.
    -   La hora de fin de atención es a las 8:30 PM (20:30).
3.  **Fecha:** Si no se especifica una fecha, asume que es para el día de hoy (\`{{currentDate}}\`). Si dice "mañana", calcula la fecha correspondiente.
4.  **Servicio:** El usuario usará abreviaturas. Mapea la abreviatura al servicio completo. Aquí tienes una lista de servicios y sus posibles abreviaturas para ayudarte:
    {{serviceList}}
    Si el servicio es "podo", es "Quiropodia".
5.  **Profesional:** Si no se menciona un nombre de profesional, déjalo en blanco.
6.  **Claridad:** Si el comando es ambiguo o no sigue el formato, marca \`isClear\` como \`false\`.

**Comando a analizar:** "{{command}}"`,
      });
      
      const { output: extractedInfo } = await extractionPrompt({ command, currentDate, serviceList: serviceListForPrompt });
      
      if (!extractedInfo || !extractedInfo.isClear || !extractedInfo.patientName || !extractedInfo.serviceShorthand || !extractedInfo.requestedDate || !extractedInfo.requestedTime) {
        return { success: false, message: "No pude entender el comando. Por favor, usa un formato como '9 Carlos Sanchez podo'." };
      }

      // Lógica de búsqueda de servicio mejorada
      const shorthand = extractedInfo.serviceShorthand.toLowerCase();
      let service = null;

      // 1. Búsqueda exacta (el caballo)
      if (shorthand.includes('podo') || shorthand.includes('quiro')) {
        service = services.find(s => s.name.toLowerCase() === 'podología' || s.name.toLowerCase() === 'quiropodia') || null;
      }
      
      // 2. Búsqueda sin paréntesis
      if (!service) {
        service = services.find(s => s.name.toLowerCase().includes(shorthand) && !s.name.includes('(')) || null;
      }

      // 3. Búsqueda general como último recurso
      if (!service) {
        service = services.find(s => s.name.toLowerCase().includes(shorthand) || s.name.substring(0,4).toLowerCase() === shorthand) || null;
      }
      
      if (!service) {
          return { success: false, message: `No se encontró un servicio para la abreviatura "${extractedInfo.serviceShorthand}".` };
      }
      
      const [firstName, ...lastNameParts] = extractedInfo.patientName.split(' ');
      const appointmentDate = parse(`${extractedInfo.requestedDate} ${extractedInfo.requestedTime}`, 'yyyy-MM-dd HH:mm', new Date());

      const suggestedChanges = {
          patientFirstName: firstName,
          patientLastName: lastNameParts.join(' ') || ' ',
          serviceId: service.id,
          locationId: locationId,
          appointmentDate: appointmentDate,
          appointmentTime: extractedInfo.requestedTime,
          preferredProfessionalId: null, // Dejamos que la lógica de negocio asigne uno aleatorio
      };

      const confirmationMessage = `He entendido la solicitud. Por favor, confirme los siguientes datos para la cita:
- Paciente: ${extractedInfo.patientName}
- Servicio: ${service.name}
- Fecha: ${format(appointmentDate, 'PPP', {locale: es})}
- Hora: ${format(appointmentDate, 'p', {locale: es})}
- Sede: (Se usará la sede actualmente seleccionada en la app)

¿Desea crear la cita con estos datos?`;

      return { 
        success: true, 
        message: confirmationMessage,
        confirmationRequired: true,
        suggestedChanges,
      };
    } catch (error: any) {
        console.error("[dictationBotFlow] Error calling Genkit AI:", error);
        if (error.message && error.message.includes('503')) {
             return {
                success: false,
                message: "El servicio de IA está sobrecargado en este momento. Por favor, intente de nuevo en unos segundos."
            };
        }
        return {
            success: false,
            message: "Ocurrió un error inesperado al procesar el comando. Por favor, revise la consola para más detalles."
        };
    }
  }
);
