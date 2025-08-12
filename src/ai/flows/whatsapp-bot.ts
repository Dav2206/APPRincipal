
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
  intent: z.enum(['agendar', 'reprogramar', 'confirmar_llegada', 'confirmar_pago', 'consulta', 'otro'])
    .describe('La intención del mensaje del usuario. Por ejemplo, "reprograma 6pm" -> reprogramar. "Llegó" -> confirmar_llegada.'),
  patientName: z.string().describe('El nombre completo del paciente.').optional(),
  patientPhone: z.string().describe('El número de teléfono del paciente, si se menciona.').optional(),
  requestedService: z.string().describe('El servicio que el paciente desea, ej. "quiropodia", "uñero", "corte de uñas".').optional(),
  requestedDate: z.string().describe('La fecha deseada en formato YYYY-MM-DD.').optional(),
  requestedTime: z.string().describe('La hora deseada en formato HH:mm (24 horas).').optional(),
  professionalName: z.string().describe('El nombre del profesional solicitado, si se menciona.').optional(),
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
    
    // Divide el mensaje en líneas y filtra las que estén vacías.
    const lines = message.split('\n').filter(line => line.trim() !== '');

    if (lines.length > 1) {
      // Procesamiento por lotes si hay múltiples líneas
      const results = await Promise.all(lines.map(line => processSingleAppointmentRequest(line)));
      const summary = results.map((result, index) => `Línea ${index + 1}: ${result}`).join('\n');
      return { reply: `Resumen del procesamiento por lotes:\n\n${summary}` };
    } else {
      // Procesamiento de una sola línea
      const result = await processSingleAppointmentRequest(message);
      return { reply: result };
    }
  }
);


/**
 * Procesa una única línea de solicitud de cita.
 * @param messageLine La línea de texto a procesar.
 * @returns Un string con el resultado de la operación para esa línea.
 */
async function processSingleAppointmentRequest(messageLine: string): Promise<string> {
    // 1. Extraer la información clave del mensaje de texto
    const extractionPrompt = ai.definePrompt({
      name: 'extractAppointmentInfoFromWhatsAppPrompt',
      input: { schema: z.object({ messageText: z.string(), currentDate: z.string() }) },
      output: { schema: ExtractedInfoSchema },
      prompt: `Analiza el siguiente mensaje de texto y extrae la información clave. La fecha actual es {{currentDate}}.
      
      **Reglas de Interpretación Avanzadas**:
      1.  **Ignorar Prefijo:** Ignora completamente prefijos de chat como \`[9:45 a.m., 6/8/2025] Luisa Alvarado: \` y analiza solo el comando real.
      2.  **Intención (intent):** Determina la intención principal:
          - 'agendar': Si el mensaje busca crear una cita. (Ej: "11.30am Nicole Delgado, P", "Pie sin cita, est atendiendo Judith", "12 Silvia Barrueto podo( San Antonio sube)").
          - 'reprogramar': Si contiene "reprograma" o "adelanta". (Ej: "reprograma 6pm", "adelanta 4pm").
          - 'confirmar_llegada': Si indica que un cliente ha llegado, está en camino, o que no llega. (Ej: "Llegó", "en camino", "No llega", "Llegaron", "Llegó recién").
          - 'confirmar_pago': Si contiene montos de dinero y nombres. (Ej: "50 heiddy , Isabel 55 y 20 de propina", "115 de victoria", "Judith 15 Cassi 50").
          - 'consulta': Si es una pregunta o una confirmación de estado. (Ej: "Atiende victoria", "Quien sube?", "Sube de San Antonio").
          - 'otro': Para otros casos como saludos, links, o mensajes no relacionados. (Ej: "Buenos días", "Ok", "https://vt.tiktok.com/ZSS7cUxbw/").
      3.  **Nombre Paciente (patientName):**
          - Extrae el nombre completo. Si contiene paréntesis como "Eliana Yoshika(esposo)" o "Silvia Barrueto podo( San Antonio sube)", el nombre del paciente es el que está antes del paréntesis.
          - Si dice "Sin cita", "Din cita", o similar, el nombre es "Cliente de Paso". En estos casos, el nombre real podría estar en la misma línea o en una posterior (ej. "Pie sin cita\nMarta Sampen").
      4.  **Teléfono (patientPhone):** Si se menciona un número de 9 dígitos, extráelo. (ej. "Marta Sampen\n994213947").
      5.  **Servicio (requestedService):**
          - "P", "podo", "pie" significan "quiropodia".
          - "M", "mano", "manicure" significan "manicura".
          - "Tx", "tratamiento", "revisión", "curación", "limpieza", "uñero", "férula" son tipos de servicios podológicos. Extráelos.
          - Si hay varios como "P+M", "podo + férula", "P+M+2 uñas acrilicas", extrae el primero como principal ("quiropodia", "manicura").
          - Si faltara el servicio (ej. "10 30 Jeff cortéz"), el campo debe quedar vacío.
      6.  **Profesional (professionalName):** Si se menciona "con [nombre]", "atiende [nombre]" o el nombre de un profesional aparece al final, extrae el nombre.
      7.  **Fecha (requestedDate):** Si no se especifica (ej. "mañana"), asume la fecha actual ({{currentDate}}).
      8.  **Hora (requestedTime):** Extrae la hora en formato HH:mm (24h). "1.30pm" es "13:30". "9" es "09:00". Si dice "ahora" o es un mensaje de "Sin cita" sin hora, usa la hora actual.

      Mensaje a analizar: """{{messageText}}"""`,
    });
    
    const extractionResult = await extractionPrompt({
        messageText: messageLine,
        currentDate: format(new Date(), 'yyyy-MM-dd'),
    });

    if (!extractionResult.output) {
      return '❌ No se pudo entender la solicitud. Asegúrate de incluir nombre, servicio, fecha y hora.';
    }
    
    const { intent, patientName, patientPhone, requestedService, requestedDate, requestedTime, professionalName } = extractionResult.output;
    
    if (intent !== 'agendar' || !requestedService || !requestedDate || !requestedTime || !patientName) {
      return `He entendido que la intención es '${intent}' ${patientName ? `para '${patientName}'` : ''}. La lógica para esta acción aún no está implementada o la información es incompleta.`;
    }

    // 2. Encontrar el servicio y su duración
    const services = await getServices();
    let service = services.find(s => s.name.toLowerCase().includes(requestedService.toLowerCase()));
    
    if (!service) {
      // Fallback para servicios podológicos
      if (['podo', 'pie', 'quiro', 'uñero', 'curación', 'revisión', 'tratamiento', 'limpieza'].some(term => requestedService.toLowerCase().includes(term))) {
        service = services.find(s => s.name.toLowerCase().includes('quiropodia') || s.name.toLowerCase().includes('podología'));
      }
    }

    if (!service) {
      return `❌ No se encontró el servicio "${requestedService}".`;
    }

    // 3. Verificar la disponibilidad
    const appointmentDate = parse(`${requestedDate} ${requestedTime}`, 'yyyy-MM-dd HH:mm', new Date());
    const professionals = await getProfessionals();
    const appointmentsForDay = await getAppointments({ date: appointmentDate });

    let availableProfessional = null;
    
    const candidates = professionalName 
      ? professionals.filter(p => `${p.firstName} ${p.lastName}`.toLowerCase().includes(professionalName.toLowerCase()))
      : professionals;

    for (const prof of candidates) {
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
        patientPhone: patientPhone,
        locationId: availableProfessional.locationId,
        serviceId: service.id,
        appointmentDate,
        appointmentTime: format(appointmentDate, 'HH:mm'),
        preferredProfessionalId: availableProfessional.id,
      });

      return `✅ Cita agendada para ${firstName} - ${format(appointmentDate, 'h:mm a')} con ${availableProfessional.firstName}.`;
    } else {
      return `❌ No hay disponibilidad para "${service.name}" ${professionalName ? `con ${professionalName}`: ''} en la fecha y hora solicitadas para ${patientName}.`;
    }
}


// Para hacer esto funcional, se necesitaría:
// 1. Una cuenta de WhatsApp Business API.
// 2. Un servidor separado (como una Firebase Function) para ser el webhook.
// 3. Este webhook recibiría los mensajes de Meta/WhatsApp y llamaría a `handleWhatsAppMessage`.
// 4. El webhook usaría la API de WhatsApp para enviar la `reply` de vuelta al grupo o usuario.

    

    
