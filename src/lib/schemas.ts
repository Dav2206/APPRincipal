import { z } from 'zod';
import { LOCATIONS, TIME_SLOTS, PAYMENT_METHODS, APPOINTMENT_STATUS_DISPLAY, DAYS_OF_WEEK } from './constants';
import type { DayOfWeekId } from './constants';

export const LoginSchema = z.object({
  username: z.string().min(1, { message: 'El nombre de usuario es requerido.' }),
  password: z.string().min(1, { message: 'La contraseña es requerida.' }),
});
export type LoginFormData = z.infer<typeof LoginSchema>;

const locationIds = LOCATIONS.map(loc => loc.id);
const paymentMethodValues = PAYMENT_METHODS.map(pm => pm);
const appointmentStatusKeys = Object.keys(APPOINTMENT_STATUS_DISPLAY) as (keyof typeof APPOINTMENT_STATUS_DISPLAY)[];
const dayOfWeekIds = DAYS_OF_WEEK.map(day => day.id);


export const PatientFormSchema = z.object({
  id: z.string().optional(),
  firstName: z.string().min(2, "Nombre es requerido."),
  lastName: z.string().min(2, "Apellido es requerido."),
  phone: z.string().optional().nullable(),
  age: z.coerce.number().int().min(0, "La edad no puede ser negativa.").optional().nullable(),
  isDiabetic: z.boolean().optional(),
  notes: z.string().optional().nullable(),
});
export type PatientFormData = z.infer<typeof PatientFormSchema>;


export const AppointmentFormSchema = z.object({
  patientFirstName: z.string().min(2, "Nombre del paciente es requerido (mínimo 2 caracteres)."),
  patientLastName: z.string().min(2, "Apellido del paciente es requerido (mínimo 2 caracteres)."),
  patientPhone: z.string().optional().nullable(),
  patientAge: z.coerce.number().int().min(0, "La edad del paciente no puede ser negativa.").optional().nullable(),
  existingPatientId: z.string().optional().nullable(),
  isDiabetic: z.boolean().optional(),

  locationId: z.string().refine(val => locationIds.includes(val as any), { message: "Sede inválida."}),
  serviceId: z.string().min(1, "Servicio es requerido."),
  appointmentDate: z.date({ required_error: "Fecha de la cita es requerida."}),
  appointmentTime: z.string().refine(val => TIME_SLOTS.includes(val), { message: "Hora inválida."}),
  preferredProfessionalId: z.string().optional().nullable(),
  bookingObservations: z.string().optional().nullable(),
});

export type AppointmentFormData = z.infer<typeof AppointmentFormSchema>;

export const ProfessionalFormSchema = z.object({
  id: z.string().optional(),
  firstName: z.string().min(2, "Nombre es requerido."),
  lastName: z.string().min(2, "Apellido es requerido."),
  locationId: z.string().refine(val => locationIds.includes(val as any), { message: "Sede inválida."}),
  phone: z.string().optional().nullable(),

  // Horario Semanal Base (opcional)
  workDays: z.array(z.string().refine(val => dayOfWeekIds.includes(val as DayOfWeekId), { message: "Día inválido."})).min(0, "Debe seleccionar días de trabajo o definir anulaciones.").optional(),
  startTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, "Formato de hora inválido (HH:MM)").optional(),
  endTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, "Formato de hora inválido (HH:MM)").optional(),

  // Anulaciones o Horarios Específicos
  customScheduleOverrides: z.array(
    z.object({
      id: z.string(), // Para react-hook-form useFieldArray
      date: z.date({ required_error: "La fecha es requerida para la anulación." }),
      isWorking: z.boolean(),
      startTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, "Formato de hora inválido (HH:MM)").optional().nullable(),
      endTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, "Formato de hora inválido (HH:MM)").optional().nullable(),
      notes: z.string().optional().nullable(),
    }).refine(data => {
      if (data.isWorking) {
        // Si está trabajando, startTime y endTime son requeridos y endTime debe ser mayor que startTime
        return data.startTime && data.endTime && data.startTime < data.endTime;
      }
      return true; // Si no está trabajando, no se requieren startTime/endTime
    }, {
      message: "Si trabaja, la hora de inicio y fin son requeridas, y la de inicio debe ser anterior a la de fin.",
      path: ["startTime"], 
    })
  ).optional().nullable(),
}).refine(data => {
  // Validación para el horario base si se definen workDays
  if (data.workDays && data.workDays.length > 0) {
      if (!data.startTime || !data.endTime) {
          return false; // startTime y endTime son requeridos si hay workDays
      }
      const [startHour, startMinute] = data.startTime.split(':').map(Number);
      const [endHour, endMinute] = data.endTime.split(':').map(Number);
      return (startHour * 60 + startMinute) < (endHour * 60 + endMinute);
  }
  return true; // Si no hay workDays, esta validación de horario base no aplica
}, {
  message: "Si se definen días base, la hora de inicio y fin son requeridas, y la de inicio debe ser anterior a la de fin.",
  path: ["startTime"], // Path para el error del horario base
});
export type ProfessionalFormData = z.infer<typeof ProfessionalFormSchema>;


export const AppointmentUpdateSchema = z.object({
  status: z.string().refine(val => appointmentStatusKeys.includes(val as any), {message: "Estado inválido"}),
  serviceId: z.string().min(1, "Servicio es requerido.").optional(),
  appointmentDate: z.date({ required_error: "Fecha de la cita es requerida."}).optional(),
  appointmentTime: z.string().refine(val => TIME_SLOTS.includes(val), { message: "Hora inválida."}).optional(),
  actualArrivalTime: z.string().optional().nullable(), // HH:MM
  professionalId: z.string().optional().nullable(), // Attending professional
  durationMinutes: z.number().int().positive("La duración debe ser un número positivo.").optional().nullable(),
  paymentMethod: z.string().refine(val => paymentMethodValues.includes(val as any), {message: "Método de pago inválido"}).optional().nullable(),
  amountPaid: z.number().positive("El monto pagado debe ser un número positivo.").optional().nullable(),
  staffNotes: z.string().optional().nullable(),
  attachedPhotos: z.array(z.string().startsWith("data:image/", { message: "Debe ser un data URI de imagen válido." })).optional().nullable(),
  addedServices: z.array(z.object({
    serviceId: z.string().min(1, "Servicio adicional inválido."),
    professionalId: z.string().optional().nullable(),
    price: z.number().positive().optional().nullable(),
  })).optional().nullable(),
});

export const ServiceFormSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(2, "Nombre del servicio es requerido."),
  defaultDuration: z.object({
    hours: z.coerce.number().int().min(0, "Horas no pueden ser negativas.").max(23, "Horas no pueden ser más de 23.").default(0),
    minutes: z.coerce.number().int().min(0, "Minutos no pueden ser negativos.").max(59, "Minutos no pueden ser más de 59.").default(30),
  }).refine(data => (data.hours * 60 + data.minutes) > 0, {
    message: "La duración total debe ser mayor a 0 minutos.",
    path: ["defaultDuration"], 
  }),
  price: z.coerce.number().positive("El precio debe ser un número positivo.").optional().nullable(),
});
export type ServiceFormData = z.infer<typeof ServiceFormSchema>;

