
import type { LocationId, UserRole, PaymentMethod, AppointmentStatus } from '@/lib/constants';

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
  phone?: string;
  biWeeklyEarnings?: number;
}

export interface Patient extends BaseEntity {
  firstName: string;
  lastName: string;
  phone?: string;
  age?: number | null; 
  isDiabetic?: boolean;
  preferredProfessionalId?: string;
  notes?: string; // General notes or observations about the patient
}

export interface Service {
  id: string;
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
  serviceId: string;
  service?: Service; // Populated for display
  appointmentDateTime: string; // ISO string for date and time
  durationMinutes: number; // Actual duration

  // Booking time details
  preferredProfessionalId?: string | null;
  bookingObservations?: string;

  // Post-booking / Confirmation details
  status: AppointmentStatus;
  actualArrivalTime?: string; // HH:MM
  addedServices?: { serviceId: string; professionalId?: string | null; price?: number | null; service?: Service, professional?: Professional }[];
  paymentMethod?: PaymentMethod;
  amountPaid?: number;
  staffNotes?: string; // Notes by staff after service
  attachedPhotos?: string[]; // Array of data URIs for attached photos

  createdAt?: string; // ISO string - Optional as it will be set by Firestore
  updatedAt?: string; // ISO string - Optional as it will be set by Firestore
}

// For forms
export type AppointmentFormData = {
  patientFirstName: string;
  patientLastName: string;
  patientPhone?: string;
  patientAge?: number | null; 
  existingPatientId?: string | null; // To link if patient exists
  isDiabetic?: boolean;
  locationId: LocationId;
  serviceId: string;
  appointmentDate: Date;
  appointmentTime: string; // e.g., "10:30"
  preferredProfessionalId?: string | null;
  bookingObservations?: string;
};

export type ProfessionalFormData = Omit<Professional, 'biWeeklyEarnings' | 'id' > & {
  id?: string;
};


// Export AppointmentStatus to be available for other modules if needed directly
export type { AppointmentStatus };

export type ServiceFormData = {
  id?: string;
  name: string;
  defaultDuration: { // Changed to object for form input
    hours: number;
    minutes: number;
  };
  price?: number;
};
