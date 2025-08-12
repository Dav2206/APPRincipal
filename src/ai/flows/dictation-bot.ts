
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
    serviceShorthands: z.array(z.string()).optional().describe('Una lista de abreviaturas de los servicios solicitados (ej. ["podo", "refle"]).'),
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
      const serviceListForPrompt = services.map(s => `- "${s.name}" (abreviaturas posibles: ${s.name.substring(0,4).toLowerCase()}, ${s.name.split(' ')[0].toLowerCase()})`).join('\n');

      const extractionPrompt = ai.definePrompt({
          name: 'extractInfoFromShorthandPrompt',
          input: { schema: z.object({ command: z.string(), currentDate: z.string(), serviceList: z.string() }) },
          output: { schema: ExtractedInfoSchema },
          prompt: `Eres un asistente experto en agendamiento para una clínica podológica. Tu tarea es interpretar comandos de texto muy cortos. La fecha actual es {{currentDate}}.

Reglas de interpretación:
1.  **Formato:** El comando suele ser \`[HORA] [NOMBRE PACIENTE] [SERVICIO 1] y [SERVICIO 2] con [PROFESIONAL]\`. Ejemplo: \`9 carlos sanchez podo y mano con maria\`.
2.  **Paciente Sin Cita:** Si el comando incluye "sin cita", "de paso" o "walk in", el nombre del paciente es "Cliente de Paso". No intentes extraer un nombre real.
3.  **Servicios Múltiples:** El usuario puede pedir varios servicios usando "y" o "+". Extrae todas las abreviaturas en el array \`serviceShorthands\`. Ejemplo: "podo y mano" -> ["podo", "mano"].
4.  **Hora:** Un número entre 9 y 12 se refiere a la mañana (9 AM). Un número entre 1 y 8 se refiere a la tarde, conviértelo a 24h (1=13:00, 8=20:00). Puede incluir media hora, como \`9 30\`. La palabra "ahora" se refiere a la hora actual. La hora de fin de atención es a las 8:30 PM (20:30).
5.  **Fecha:** Si no se especifica una fecha, asume hoy (\`{{currentDate}}\`). Si dice "mañana", calcula la fecha correspondiente.
6.  **Servicios y Abreviaturas:** El usuario usará abreviaturas. Mapea la abreviatura al servicio completo. Aquí tienes una lista de servicios y sus posibles abreviaturas para ayudarte:
    {{serviceList}}
    - 'p', 'podo', 'pie', 'quiro' -> Quiropodia / Podología
    - 'm', 'mano', 'mani' -> Manicura
7.  **Profesional:** Si se menciona "con [nombre]", extrae el nombre del profesional.
8.  **Claridad:** Si el comando es ambiguo o incompleto (ej. falta servicio o paciente), marca \`isClear\` como \`false\`.

**Comando a analizar:** "{{command}}"`,
      });
      
      const { output: extractedInfo } = await extractionPrompt({ command, currentDate, serviceList: serviceListForPrompt });
      
      if (!extractedInfo || !extractedInfo.isClear || !extractedInfo.patientName || !extractedInfo.serviceShorthands || extractedInfo.serviceShorthands.length === 0 || !extractedInfo.requestedDate || !extractedInfo.requestedTime) {
        return { success: false, message: "No pude entender el comando. Por favor, usa un formato como '9 Carlos Sanchez podo y mano'." };
      }

      const matchedServices: Service[] = [];
      const problematicShorthands: string[] = [];

      for (const shorthand of extractedInfo.serviceShorthands) {
          const sh = shorthand.toLowerCase();
          let service: Service | null = null;
          
          if (sh.includes('podo') || sh.includes('quiro') || sh === 'p' || sh.includes('pie')) {
            service = services.find(s => s.name.toLowerCase().includes('podología') || s.name.toLowerCase().includes('quiropodia')) || null;
          } else if (sh.includes('mano') || sh.includes('mani') || sh === 'm') {
            service = services.find(s => s.name.toLowerCase().includes('manicur')) || null; // Changed to 'manicur'
          } else {
             service = services.find(s => s.name.toLowerCase().includes(sh) || s.name.substring(0,4).toLowerCase() === sh) || null;
          }

          if (service) {
            matchedServices.push(service);
          } else {
            problematicShorthands.push(shorthand);
          }
      }

      if (problematicShorthands.length > 0) {
        return { success: false, message: `No se encontró ningún servicio para las abreviaturas: "${problematicShorthands.join(', ')}".` };
      }

      if (matchedServices.length === 0) {
          return { success: false, message: `No se encontró ningún servicio que coincida con lo solicitado.` };
      }
      
      const [firstName, ...lastNameParts] = extractedInfo.patientName.split(' ');
      const appointmentDate = parse(`${extractedInfo.requestedDate} ${extractedInfo.requestedTime}`, 'yyyy-MM-dd HH:mm', new Date());

      const mainService = matchedServices[0];
      const addedServices = matchedServices.slice(1).map(s => ({
          serviceId: s.id,
          professionalId: null, // Dejar que la lógica de negocio asigne o el usuario edite
      }));
      
      const isWalkIn = extractedInfo.patientName.toLowerCase() === 'cliente de paso';

      const suggestedChanges = {
          patientFirstName: firstName,
          patientLastName: lastNameParts.join(' ') || ' ',
          serviceId: mainService.id,
          locationId: locationId,
          appointmentDate: appointmentDate,
          appointmentTime: extractedInfo.requestedTime,
          preferredProfessionalId: null, // This will be handled by the logic that finds an available professional.
          addedServices: addedServices,
          isWalkIn: isWalkIn, // Mark as walk-in patient
      };

      const confirmationMessage = `He entendido la solicitud. Por favor, confirme los siguientes datos para la cita:
- Paciente: ${extractedInfo.patientName} ${isWalkIn ? "(Sin Cita)" : ""}
- Servicio(s): ${matchedServices.map(s => s.name).join(', ')}
- Fecha: ${format(appointmentDate, 'PPP', {locale: es})}
- Hora: ${format(appointmentDate, 'p', {locale: es})}
- Sede: (Se usará la sede actualmente seleccionada en la app)
- Profesional: ${extractedInfo.professionalName || 'Cualquiera disponible'}

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

    