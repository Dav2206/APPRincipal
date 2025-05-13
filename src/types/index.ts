
import type { LocationId, UserRole, PaymentMethod, AppointmentStatus, DayOfWeekId } from '@/lib/constants';

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
  
  // Horario Semanal Base (opcional, puede servir como plantilla o para días sin anulación)
  workSchedule?: {
    [key in DayOfWeekId]?: { startTime: string; endTime: string } | null;
  };

  // Anulaciones o Horarios Específicos
  customScheduleOverrides?: Array<{
    id: string; // Unique ID for each override, useful for form handling
    date: string; // Fecha específica en formato ISO "YYYY-MM-DD"
    isWorking: boolean; // True si trabaja, false si es un día libre anulando el workSchedule base
    startTime?: string; // "HH:MM", solo si isWorking es true
    endTime?: string; // "HH:MM", solo si isWorking es true
    notes?: string; // Opcional, para notas sobre este turno específico
  }>;
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

export type ProfessionalFormData = Omit<Professional, 'id' | 'biWeeklyEarnings' | 'workSchedule' | 'customScheduleOverrides'> & {
  id?: string;
  
  // Para el formulario, podría ser más fácil manejar workSchedule como antes
  // y tener una sección separada para los customScheduleOverrides.
  workDays: DayOfWeekId[]; // Días de la semana base
  startTime: string;   // Hora de inicio base
  endTime: string;     // Hora de fin base
  
  // Para el formulario de anulaciones
  customScheduleOverrides?: Array<{
    id: string; // Important for useFieldArray key
    date: Date; // Usamos Date para el DatePicker y luego convertimos a string ISO
    isWorking: boolean;
    startTime?: string;
    endTime?: string;
    notes?: string;
  }>;
};


// Export AppointmentStatus to be available for other modules if needed directly
export type { AppointmentStatus };

export type ServiceFormData = {
  id?: string;
  name: string;
  defaultDuration: { 
    hours: number;
    minutes: number;
  };
  price?: number;
};

