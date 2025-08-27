

import { z } from 'zod';
import { TIME_SLOTS, APPOINTMENT_STATUS, APPOINTMENT_STATUS_DISPLAY, DAYS_OF_WEEK } from '@/lib/constants';
import type { DayOfWeekId, LocationId } from '@/lib/constants';
import { getDay, differenceInCalendarDays, parseISO } from 'date-fns';

export const LoginSchema = z.object({
  username: z.string().min(1, { message: 'El nombre de usuario es requerido.' }),
  password: z.string().min(1, { message: 'La contraseña es requerida.' }),
});
export type LoginFormData = z.infer<typeof LoginSchema>;

const appointmentStatusKeys = Object.keys(APPOINTMENT_STATUS) as (keyof typeof APPOINTMENT_STATUS)[];
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
  isForFamilyMember: z.boolean().optional(),
  familyMemberRelation: z.string().optional().nullable(),

  locationId: z.string().min(1, "Sede es requerida."),
  serviceId: z.string().min(1, "Servicio es requerido."),
  appointmentDate: z.date({ required_error: "Fecha de la cita es requerida."}),
  appointmentTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, "Hora inválida. Use formato HH:MM."),
  professionalOriginLocationId: z.string().optional(),
  preferredProfessionalId: z.string().optional().nullable(),
  bookingObservations: z.string().optional().nullable(),
  addedServices: z.array(z.object({
    serviceId: z.string().min(1, "Servicio adicional inválido."),
    professionalId: z.string().optional().nullable(),
    amountPaid: z.coerce.number().positive("El monto pagado debe ser positivo.").optional().nullable(),
    startTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, "Formato HH:MM").optional().nullable(),
  })).optional().nullable(),
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
    if (data.isForFamilyMember && !data.familyMemberRelation) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Debe seleccionar el parentesco del familiar.",
            path: ["familyMemberRelation"],
        });
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
  locationId: z.string().min(1, "Sede es requerida."),
  phone: z.string().optional().nullable(),
  isManager: z.boolean().optional(),
  birthDay: z.coerce.number().int().min(1).max(31).optional().nullable(),
  birthMonth: z.coerce.number().int().min(1).max(12).optional().nullable(),
  baseSalary: z.coerce.number().positive("El sueldo base debe ser un número positivo.").optional().nullable(),
  commissionRate: z.coerce.number().min(0, "La tasa no puede ser negativa").max(100, "La tasa no puede ser mayor a 100").optional().nullable(),
  commissionDeductible: z.coerce.number().min(0, "El deducible no puede ser negativo").optional().nullable(),
  afp: z.coerce.number().min(0, "AFP no puede ser negativo.").optional().nullable(),
  seguro: z.coerce.number().min(0, "Seguro no puede ser negativo.").optional().nullable(),


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
      overrideType: z.enum(['descanso', 'turno_especial', 'traslado'], { required_error: "Debe seleccionar un tipo de excepción."}),
      startTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, "Formato HH:MM").optional().nullable(),
      endTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, "Formato HH:MM").optional().nullable(),
      notes: z.string().optional().nullable(),
      locationId: z.string().optional().nullable(),
    }).refine(data => {
      if (data.overrideType === 'traslado') {
        return !!data.locationId;
      }
      return true;
    }, {
      message: "Debe seleccionar una sede de destino para un traslado.",
      path: ["locationId"],
    }).refine(data => {
      if (data.overrideType === 'turno_especial' || data.overrideType === 'traslado') {
        return data.startTime && data.endTime && data.startTime < data.endTime;
      }
      return true;
    }, {
      message: "Para turnos especiales o traslados, inicio y fin son requeridos, y inicio debe ser antes que fin.",
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
  appointmentTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, "Hora inválida. Use formato HH:MM.").optional(),
  actualArrivalTime: z.string().optional().nullable(),
  professionalId: z.string().optional().nullable(),
  duration: z.object({
    hours: z.coerce.number().int().min(0, "Horas no pueden ser negativas.").default(0),
    minutes: z.coerce.number().int().min(0, "Minutos no pueden ser más de 59.").default(30),
  }).refine(data => (data.hours * 60 + data.minutes) > 0, {
    message: "La duración total debe ser mayor a 0 minutos.",
    path: ["root"],
  }).optional(),
  paymentMethod: z.string().min(1, { message: "El método de pago es requerido si se completa." }).optional().nullable(),
  amountPaid: z.coerce.number().min(0, "El monto pagado no puede ser negativo.").optional().nullable(),
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
    minutes: z.coerce.number().int().min(0, "Minutos no pueden ser más de 59.").default(30),
  }).refine(data => (data.hours * 60 + data.minutes) > 0, {
    message: "La duración total debe ser mayor a 0 minutos.",
    path: ["root"],
  }),
  price: z.coerce.number().min(0, "El precio no puede ser negativo.").optional().nullable(),
  materialsUsed: z.array(z.object({
    materialId: z.string().min(1, "Debe seleccionar un material del catálogo."),
    quantity: z.coerce.number().min(0.01, "La cantidad debe ser mayor a 0."),
  })).optional(),
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
  category: z.enum(['insumos', 'servicios', 'impuestos', 'otros'], {
    required_error: "La categoría es requerida.",
  }),
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

export const MaterialFormSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(2, "El nombre del insumo es requerido."),
  unit: z.string().min(1, "La unidad es requerida (ej: 'unidad', 'caja', 'par')."),
});
export type MaterialFormData = z.infer<typeof MaterialFormSchema>;
