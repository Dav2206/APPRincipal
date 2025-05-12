
import { z } from 'zod';
import { LOCATIONS, TIME_SLOTS, PAYMENT_METHODS, APPOINTMENT_STATUS_DISPLAY, PROFESSIONAL_SPECIALIZATIONS } from './constants';

export const LoginSchema = z.object({
  username: z.string().min(1, { message: 'El nombre de usuario es requerido.' }),
  password: z.string().min(1, { message: 'La contraseña es requerida.' }),
});
export type LoginFormData = z.infer<typeof LoginSchema>;

const locationIds = LOCATIONS.map(loc => loc.id);
const paymentMethodValues = PAYMENT_METHODS.map(pm => pm);
const appointmentStatusKeys = Object.keys(APPOINTMENT_STATUS_DISPLAY) as (keyof typeof APPOINTMENT_STATUS_DISPLAY)[];
const professionalSpecializationValues = PROFESSIONAL_SPECIALIZATIONS.map(spec => spec);


export const PatientFormSchema = z.object({
  id: z.string().optional(),
  firstName: z.string().min(2, "Nombre es requerido."),
  lastName: z.string().min(2, "Apellido es requerido."),
  phone: z.string().optional(),
  dateOfBirth: z.string().optional().refine(val => !val || /^\d{4}-\d{2}-\d{2}$/.test(val), {
    message: "Formato de fecha debe ser YYYY-MM-DD",
  }).or(z.literal('')),
  isDiabetic: z.boolean().optional(),
  notes: z.string().optional(),
});
export type PatientFormData = z.infer<typeof PatientFormSchema>;


export const AppointmentFormSchema = z.object({
  patientFirstName: z.string().min(2, "Nombre del paciente es requerido (mínimo 2 caracteres)."),
  patientLastName: z.string().min(2, "Apellido del paciente es requerido (mínimo 2 caracteres)."),
  patientPhone: z.string().optional(),
  patientDateOfBirth: z.string().optional().refine(val => !val || /^\d{4}-\d{2}-\d{2}$/.test(val), { // YYYY-MM-DD format
    message: "Formato de fecha de nacimiento debe ser YYYY-MM-DD.",
  }).or(z.literal('')),
  existingPatientId: z.string().optional().nullable(),
  isDiabetic: z.boolean().optional(), 
  
  locationId: z.string().refine(val => locationIds.includes(val as any), { message: "Sede inválida."}),
  serviceId: z.string().min(1, "Servicio es requerido."), 
  appointmentDate: z.date({ required_error: "Fecha de la cita es requerida."}),
  appointmentTime: z.string().refine(val => TIME_SLOTS.includes(val), { message: "Hora inválida."}),
  preferredProfessionalId: z.string().optional().nullable(),
  bookingObservations: z.string().optional(),
});

export type AppointmentFormData = z.infer<typeof AppointmentFormSchema>;

export const ProfessionalFormSchema = z.object({
  id: z.string().optional(),
  firstName: z.string().min(2, "Nombre es requerido."),
  lastName: z.string().min(2, "Apellido es requerido."),
  locationId: z.string().refine(val => locationIds.includes(val as any), { message: "Sede inválida."}),
  phone: z.string().optional(),
  specializations: z.array(z.string().refine(val => professionalSpecializationValues.includes(val as any), { message: "Especialización inválida."})).optional().default([]),
});
export type ProfessionalFormData = z.infer<typeof ProfessionalFormSchema>;


export const AppointmentUpdateSchema = z.object({
  status: z.string().refine(val => appointmentStatusKeys.includes(val as any), {message: "Estado inválido"}),
  serviceId: z.string().min(1, "Servicio es requerido.").optional(), 
  actualArrivalTime: z.string().optional().nullable(), // HH:MM
  professionalId: z.string().optional().nullable(), // Attending professional
  durationMinutes: z.number().int().positive().optional().nullable(),
  paymentMethod: z.string().refine(val => paymentMethodValues.includes(val as any), {message: "Método de pago inválido"}).optional().nullable(),
  amountPaid: z.number().positive().optional().nullable(),
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
  defaultDuration: z.coerce.number().int().positive("La duración debe ser un número positivo."),
  price: z.coerce.number().positive("El precio debe ser un número positivo.").optional().nullable(),
});
export type ServiceFormData = z.infer<typeof ServiceFormSchema>;

