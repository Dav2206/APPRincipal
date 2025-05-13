import { z } from 'zod';
import { LOCATIONS, TIME_SLOTS, PAYMENT_METHODS, APPOINTMENT_STATUS_DISPLAY, DAYS_OF_WEEK } from './constants';
import type { DayOfWeekId } from './constants';
import { getDay } from 'date-fns';

export const LoginSchema = z.object({
  username: z.string().min(1, { message: 'El nombre de usuario es requerido.' }),
  password: z.string().min(1, { message: 'La contraseña es requerida.' }),
});
export type LoginFormData = z.infer<typeof LoginSchema>;

const locationIds = LOCATIONS.map(loc => loc.id);
const paymentMethodValues = PAYMENT_METHODS.map(pm => pm);
const appointmentStatusKeys = Object.keys(APPOINTMENT_STATUS_DISPLAY) as (keyof typeof APPOINTMENT_STATUS_DISPLAY)[];
const dayOfWeekIds = DAYS_OF_WEEK.map(day => day.id);

const COMPENSATORY_DAY_OFF_PLACEHOLDER_VALUE = "--none--";

export const PatientFormSchema = z.object({
  id: z.string().optional(),
  firstName: z.string().min(2, "Nombre es requerido."),
  lastName: z.string().min(2, "Apellido es requerido."),
  phone: z.string().optional().nullable(),
  age: z.coerce.number().int().min(0, "La edad no puede ser negativa.").optional().nullable(),
  birthDay: z.coerce.number().int().min(1).max(31).optional().nullable(),
  birthMonth: z.coerce.number().int().min(0).max(11).optional().nullable(), // 0 for January, 11 for December
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
  birthDay: z.coerce.number().int().min(1).max(31).optional().nullable(),
  birthMonth: z.coerce.number().int().min(0).max(11).optional().nullable(),

  locationId: z.string().refine(val => locationIds.includes(val as any), { message: "Sede inválida."}),
  serviceId: z.string().min(1, "Servicio es requerido."),
  appointmentDate: z.date({ required_error: "Fecha de la cita es requerida."}),
  appointmentTime: z.string().refine(val => TIME_SLOTS.includes(val), { message: "Hora inválida."}),
  preferredProfessionalId: z.string().optional().nullable(),
  bookingObservations: z.string().optional().nullable(),
});

export type AppointmentFormData = z.infer<typeof AppointmentFormSchema>;

const DayScheduleSchema = z.object({
  isWorking: z.boolean().optional(),
  startTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, "Formato HH:MM").optional().nullable(),
  endTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, "Formato HH:MM").optional().nullable(),
}).refine(data => {
  if (data.isWorking) {
    return data.startTime && data.endTime && data.startTime < data.endTime;
  }
  return true;
}, {
  message: "Si trabaja, inicio y fin son requeridos, y inicio debe ser antes que fin.",
  path: ["startTime"],
});

export const ProfessionalFormSchema = z.object({
  id: z.string().optional(),
  firstName: z.string().min(2, "Nombre es requerido."),
  lastName: z.string().min(2, "Apellido es requerido."),
  locationId: z.string().refine(val => locationIds.includes(val as any), { message: "Sede inválida." }),
  phone: z.string().optional().nullable(),

  workSchedule: z.object(
    DAYS_OF_WEEK.filter(day => day.id !== 'sunday') // Base schedule for Mon-Sat
      .reduce((acc, day) => {
        acc[day.id as Exclude<DayOfWeekId, 'sunday'>] = DayScheduleSchema.optional();
        return acc;
      }, {} as Record<Exclude<DayOfWeekId, 'sunday'>, z.ZodOptional<typeof DayScheduleSchema>>)
  ).optional(),
  
  rotationType: z.enum(['none', 'biWeeklySunday']).default('none'),
  rotationStartDate: z.date().optional().nullable(),
  compensatoryDayOffChoice: z.enum(['monday', 'tuesday', 'wednesday', 'thursday', COMPENSATORY_DAY_OFF_PLACEHOLDER_VALUE]).optional().nullable()
    .transform(value => value === COMPENSATORY_DAY_OFF_PLACEHOLDER_VALUE ? null : value),


  customScheduleOverrides: z.array(
    z.object({
      id: z.string(),
      date: z.date({ required_error: "La fecha es requerida para la anulación." }),
      isWorking: z.boolean(),
      startTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, "Formato HH:MM").optional().nullable(),
      endTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, "Formato HH:MM").optional().nullable(),
      notes: z.string().optional().nullable(),
    }).refine(data => {
      if (data.isWorking) {
        return data.startTime && data.endTime && data.startTime < data.endTime;
      }
      return true;
    }, {
      message: "Si trabaja, inicio y fin son requeridos, y inicio debe ser antes que fin.",
      path: ["startTime"], 
    })
  ).optional().nullable(),
}).refine(data => {
  if (data.rotationType === 'biWeeklySunday') {
    if (!data.rotationStartDate) {
      return false; // rotationStartDate is required for biWeeklySunday
    }
    if (getDay(data.rotationStartDate) !== 0) {
      return false; // rotationStartDate must be a Sunday
    }
    if (!data.compensatoryDayOffChoice) { // null is a valid "not selected" choice after transform
        return false; // compensatoryDayOffChoice is required, which means a day must be selected or explicitly "none"
    }
  }
  return true;
}, {
  message: "Para rotación bi-semanal de domingo, se requiere una fecha de inicio (que sea domingo) y un día de compensación (Lunes-Jueves).",
  path: ["rotationStartDate"], // Or a more general path if needed
});
export type ProfessionalFormData = z.infer<typeof ProfessionalFormSchema>;


export const AppointmentUpdateSchema = z.object({
  status: z.string().refine(val => appointmentStatusKeys.includes(val as any), {message: "Estado inválido"}),
  serviceId: z.string().min(1, "Servicio es requerido.").optional(),
  appointmentDate: z.date({ required_error: "Fecha de la cita es requerida."}).optional(),
  appointmentTime: z.string().refine(val => TIME_SLOTS.includes(val), { message: "Hora inválida."}).optional(),
  actualArrivalTime: z.string().optional().nullable(), // HH:MM
  professionalId: z.string().optional().nullable(), // Attending professional
  durationMinutes: z.coerce.number().int().positive("La duración debe ser un número positivo.").optional().nullable(),
  paymentMethod: z.string().refine(val => paymentMethodValues.includes(val as any), {message: "Método de pago inválido"}).optional().nullable(),
  amountPaid: z.coerce.number().positive("El monto pagado debe ser un número positivo.").optional().nullable(),
  staffNotes: z.string().optional().nullable(),
  attachedPhotos: z.array(z.string().startsWith("data:image/", { message: "Debe ser un data URI de imagen válido." })).optional().nullable(),
  addedServices: z.array(z.object({
    serviceId: z.string().min(1, "Servicio adicional inválido."),
    professionalId: z.string().optional().nullable(),
    price: z.coerce.number().positive().optional().nullable(),
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
