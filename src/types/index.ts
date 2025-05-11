
import type { LocationId, UserRole, ProfessionalSpecialization, PaymentMethod, AppointmentStatus } from '@/lib/constants';

export interface BaseEntity {
  id: string;
}

export interface User extends BaseEntity {
  username: string;
  // In a real app, this would be a password hash. For this demo, plain text.
  password?: string; 
  role: UserRole;
  locationId?: LocationId; // For location_staff role
  name: string; // Full name or display name
}

export interface Professional extends BaseEntity {
  firstName: string;
  lastName: string;
  locationId: LocationId;
  specializations: ProfessionalSpecialization[];
  email?: string;
  phone?: string;
  // For "cuánto dinero están generando por quincena" - simplistic placeholder
  biWeeklyEarnings?: number; 
}

export interface Patient extends BaseEntity {
  firstName: string;
  lastName: string;
  phone?: string;
  email?: string;
  dateOfBirth?: string; // YYYY-MM-DD
  isDiabetic?: boolean; // New field
  // For "historial del paciente"
  preferredProfessionalId?: string;
  notes?: string; // General notes or observations about the patient
}

export interface Service {
  id: string; // Changed from ServiceId to string for dynamic services
  name: string;
  defaultDuration: number; // in minutes
  price?: number; // Optional: can be set per appointment
}

export interface Appointment extends BaseEntity {
  patientId: string;
  patient?: Patient; // Populated for display
  locationId: LocationId;
  professionalId?: string | null; // Attending professional, can be initially null
  professional?: Professional; // Populated for display
  serviceId: string; // Changed from ServiceId to string
  service?: Service; // Populated for display
  appointmentDateTime: string; // ISO string for date and time
  durationMinutes: number; // Actual duration
  
  // Booking time details
  preferredProfessionalId?: string | null;
  bookingObservations?: string;

  // Post-booking / Confirmation details
  status: AppointmentStatus;
  actualArrivalTime?: string; // HH:MM
  addedServices?: { serviceId: string; professionalId?: string | null; price?: number | null; service?: Service, professional?: Professional }[]; // Changed serviceId to string
  paymentMethod?: PaymentMethod;
  amountPaid?: number;
  staffNotes?: string; // Notes by staff after service
  attachedPhotos?: string[]; // Array of data URIs for attached photos

  createdAt: string; // ISO string
  updatedAt: string; // ISO string
}

// For forms
export type AppointmentFormData = {
  patientFirstName: string;
  patientLastName: string;
  patientPhone?: string;
  patientEmail?: string;
  patientDateOfBirth?: string; // YYYY-MM-DD
  existingPatientId?: string | null; // To link if patient exists
  isDiabetic?: boolean; // New field for appointment form if creating new patient
  locationId: LocationId;
  serviceId: string; // Changed from ServiceId to string
  appointmentDate: Date;
  appointmentTime: string; // e.g., "10:30"
  preferredProfessionalId?: string | null;
  bookingObservations?: string;
};

export type ProfessionalFormData = Omit<Professional, 'biWeeklyEarnings'>;

// Export AppointmentStatus to be available for other modules if needed directly
export type { AppointmentStatus };

export type ServiceFormData = {
  id?: string;
  name: string;
  defaultDuration: number;
  price?: number;
};

