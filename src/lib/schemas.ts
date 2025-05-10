import { z } from 'zod';
import { LOCATIONS, SERVICES, TIME_SLOTS, PROFESSIONAL_SPECIALIZATIONS, PAYMENT_METHODS, APPOINTMENT_STATUS } from './constants';

export const LoginSchema = z.object({
  username: z.string().min(1, { message: 'El nombre de usuario es requerido.' }),
  password: z.string().min(1, { message: 'La contraseña es requerida.' }),
});
export type LoginFormData = z.infer<typeof LoginSchema>;

const locationIds = LOCATIONS.map(loc => loc.id);
const serviceIds = SERVICES.map(s => s.id);
const professionalSpecializationValues = PROFESSIONAL_SPECIALIZATIONS.map(spec => spec);
const paymentMethodValues = PAYMENT_METHODS.map(pm => pm);
const appointmentStatusValues = Object.values(APPOINTMENT_STATUS);


export const AppointmentFormSchema = z.object({
  patientFirstName: z.string().min(2, "Nombre del paciente es requerido (mínimo 2 caracteres)."),
  patientLastName: z.string().min(2, "Apellido del paciente es requerido (mínimo 2 caracteres)."),
  patientPhone: z.string().optional(),
  patientEmail: z.string().email("Email inválido.").optional().or(z.literal('')),
  existingPatientId: z.string().optional().nullable(),
  
  locationId: z.string().refine(val => locationIds.includes(val as any), { message: "Sede inválida."}),
  serviceId: z.string().refine(val => serviceIds.includes(val as any), { message: "Servicio inválido."}),
  appointmentDate: z.date({ required_error: "Fecha de la cita es requerida."}),
  appointmentTime: z.string().refine(val => TIME_SLOTS.includes(val), { message: "Hora inválida."}),
  preferredProfessionalId: z.string().optional().nullable(),
  bookingObservations: z.string().optional(),
});

export const ProfessionalFormSchema = z.object({
  id: z.string().optional(),
  firstName: z.string().min(2, "Nombre es requerido."),
  lastName: z.string().min(2, "Apellido es requerido."),
  locationId: z.string().refine(val => locationIds.includes(val as any), { message: "Sede inválida."}),
  specializations: z.array(z.string().refine(val => professionalSpecializationValues.includes(val as any))).min(1, "Debe seleccionar al menos una especialización."),
  email: z.string().email("Email inválido.").optional().or(z.literal('')),
  phone: z.string().optional(),
});

export const AppointmentUpdateSchema = z.object({
  status: z.string().refine(val => appointmentStatusValues.includes(val as any), {message: "Estado inválido"}),
  actualArrivalTime: z.string().optional().nullable(), // HH:MM
  professionalId: z.string().optional().nullable(), // Attending professional
  durationMinutes: z.number().int().positive().optional().nullable(),
  paymentMethod: z.string().refine(val => paymentMethodValues.includes(val as any), {message: "Método de pago inválido"}).optional().nullable(),
  amountPaid: z.number().positive().optional().nullable(),
  staffNotes: z.string().optional().nullable(),
  addedServices: z.array(z.object({
    serviceId: z.string().refine(val => serviceIds.includes(val as any), { message: "Servicio adicional inválido."}),
    professionalId: z.string().optional().nullable(),
    price: z.number().positive().optional().nullable(),
  })).optional().nullable(),
});
