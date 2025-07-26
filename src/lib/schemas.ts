
import { z } from 'zod';
import { LOCATIONS, TIME_SLOTS, PAYMENT_METHODS, APPOINTMENT_STATUS_DISPLAY, DAYS_OF_WEEK } from './constants';
import type { DayOfWeekId } from './constants';
import { getDay, differenceInCalendarDays, parseISO } from 'date-fns';

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
  isWalkIn: z.boolean().optional(),

  locationId: z.string().refine(val => locationIds.includes(val as any), { message: "Sede inválida."}),
  serviceId: z.string().min(1, "Servicio es requerido."),
  appointmentDate: z.date({ required_error: "Fecha de la cita es requerida."}),
  appointmentTime: z.string().refine(val => TIME_SLOTS.includes(val), { message: "Hora inválida."}),
  preferredProfessionalId: z.string().optional().nullable(),
  bookingObservations: z.string().optional().nullable(),
  searchExternal: z.boolean().optional(),
  addedServices: z.array(z.object({
    serviceId: z.string().min(1, "Servicio adicional inválido."),
    professionalId: z.string().optional().nullable(),
    amountPaid: z.coerce.number().positive("El monto pagado debe ser positivo.").optional().nullable(),
    startTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, "Formato HH:MM").optional().nullable(),
  })).optional().nullable(),
   // Campos de AppointmentUpdateFormData que no están aquí
   status: z.string().optional(),
   actualArrivalTime: z.string().optional().nullable(),
   durationMinutes: z.number().optional(),
   paymentMethod: z.string().optional().nullable(),
   amountPaid: z.number().optional().nullable(),
   staffNotes: z.string().optional().nullable(),
   attachedPhotos: z.array(z.object({ url: z.string() })).optional().nullable(),

}).superRefine((data, ctx) => {
    if (!data.isWalkIn) {
      if (data.patientFirstName.trim().length < 2) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Nombre del paciente es requerido.",
          path: ["patientFirstName"],
        });
      }
      if (data.patientLastName.trim().length < 2) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Apellido del paciente es requerido.",
          path: ["patientLastName"],
        });
      }
    }
  });


export type AppointmentFormData = z.infer<typeof AppointmentFormSchema>;

const DayScheduleSchema = z.object({
  isWorking: z.boolean().optional(),
  startTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, "Formato HH:MM").optional().nullable(),
  endTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, "Formato HH:MM").optional().nullable(),
}).refine(data => {
  if (data.isWorking) return data.startTime && data.endTime && data.startTime < data.endTime;
  return true;}, {message: "Si trabaja, inicio y fin son requeridos, y inicio debe ser antes que fin.", path: ["startTime"],});

export const ProfessionalFormSchema = z.object({
  id: z.string().optional(),
  firstName: z.string().min(2, "Nombre es requerido."),
  lastName: z.string().min(2, "Apellido es requerido."),
  locationId: z.string().refine(val => locationIds.includes(val as any), { message: "Sede inválida." }),
  phone: z.string().optional().nullable(),
  isManager: z.boolean().optional(), // Nuevo campo para gerente
  birthDay: z.coerce.number().int().min(1).max(31).optional().nullable(),
  birthMonth: z.coerce.number().int().min(1).max(12).optional().nullable(),

  workSchedule: z.object(
    DAYS_OF_WEEK.reduce((acc, day) => {
        acc[day.id as DayOfWeekId] = DayScheduleSchema.optional();
        return acc;
      }, {} as Record<DayOfWeekId, z.ZodOptional<typeof DayScheduleSchema>>)
  ).optional(),

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

  currentContract_startDate: z.date().optional().nullable(),
  currentContract_endDate: z.date().optional().nullable(),
  currentContract_notes: z.string().max(100, "Notas del contrato no deben exceder 100 caracteres.").optional().nullable(),
  currentContract_empresa: z.string().max(100, "Nombre de empresa no debe exceder 100 caracteres.").optional().nullable(),
}).refine(data => {
  if (data.currentContract_startDate && data.currentContract_endDate) {
    return data.currentContract_endDate >= data.currentContract_startDate;
  }
  return true;
}, {
  message: "La fecha de fin del contrato debe ser igual o posterior a la fecha de inicio.",
  path: ["currentContract_endDate"],
});
export type ProfessionalFormData = z.infer<typeof ProfessionalFormSchema>;


export const AppointmentUpdateSchema = z.object({
  status: z.string().refine(val => appointmentStatusKeys.includes(val as any), {message: "Estado inválido"}),
  serviceId: z.string().min(1, "Servicio es requerido.").optional(),
  appointmentDate: z.date({ required_error: "Fecha de la cita es requerida."}).optional(),
  appointmentTime: z.string().refine(val => TIME_SLOTS.includes(val), { message: "Hora inválida."}).optional(),
  actualArrivalTime: z.string().optional().nullable(),
  professionalId: z.string().optional().nullable(),
  durationMinutes: z.coerce.number().int().min(0, "La duración debe ser un número positivo o cero.").optional().nullable(), // Permitir cero
  paymentMethod: z.string().refine(val => paymentMethodValues.includes(val as any), {message: "Método de pago inválido"}).optional().nullable(),
  amountPaid: z.coerce.number().min(0, "El monto pagado no puede ser negativo.").optional().nullable(), // Permitir cero
  staffNotes: z.string().optional().nullable(),
  attachedPhotos: z.array(z.object({ url: z.string() })).optional().nullable(),
  addedServices: z.array(z.object({ 
    serviceId: z.string().min(1, "Servicio adicional inválido."),
    professionalId: z.string().optional().nullable(),
    amountPaid: z.coerce.number().positive("El monto pagado debe ser positivo.").optional().nullable(),
    startTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, "Formato HH:MM").optional().nullable(),
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
    path: ["root"],
  }),
  price: z.coerce.number().min(0, "El precio no puede ser negativo.").optional().nullable(),
});
export type ServiceFormData = z.infer<typeof ServiceFormSchema>;

export const ContractEditFormSchema = z.object({
  startDate: z.date({ required_error: "La fecha de inicio del contrato es requerida."}).nullable(),
  endDate: z.date({ required_error: "La fecha de fin del contrato es requerida."}).nullable(),
  empresa: z.string().max(100, "Nombre de empresa no debe exceder 100 caracteres.").optional().nullable(),
}).refine(data => {
  if (data.startDate && data.endDate) {
    return data.endDate >= data.startDate;
  }
  return true;
}, {
  message: "La fecha de fin del contrato debe ser igual o posterior a la fecha de inicio.",
  path: ["endDate"],
});
export type ContractEditFormData = z.infer<typeof ContractEditFormSchema>;

export const PeriodicReminderFormSchema = z.object({
  title: z.string().min(1, "El título es requerido."),
  description: z.string().optional().nullable(),
  dueDate: z.date({ required_error: "La fecha de vencimiento es requerida." }),
  recurrence: z.enum(['once', 'monthly', 'quarterly', 'annually'], {
    required_error: "La recurrencia es requerida.",
    invalid_type_error: "Seleccione una recurrencia válida."
  }),
  amount: z.coerce.number().positive("El monto debe ser un número positivo.").optional().nullable(),
  status: z.enum(['pending', 'paid'], {
    required_error: "El estado es requerido.",
    invalid_type_error: "Seleccione un estado válido."
  }),
});
export type PeriodicReminderFormData = z.infer<typeof PeriodicReminderFormSchema>;

export const ImportantNoteFormSchema = z.object({
  id: z.string().optional(),
  title: z.string().min(1, "El título es requerido."),
  content: z.string().min(1, "El contenido es requerido."),
});
export type ImportantNoteFormData = z.infer<typeof ImportantNoteFormSchema>;
