import type { LocationId, UserRole, PaymentMethod, AppointmentStatus, DayOfWeekId } from '@/lib/constants';

export interface BaseEntity {
  id: string;
}

export interface User extends BaseEntity {
  username: string;
  password?: string; // Password should ideally be handled securely and not stored plaintext
  role: UserRole;
  locationId?: LocationId;
  name: string;
}

export interface Contract {
  id: string; // Added ID to the contract itself for easier history management
  startDate: string; // ISO Date string
  endDate: string;   // ISO Date string
  notes?: string;
  empresa?: string; // Company associated with the contract
}

export interface Professional extends BaseEntity {
  firstName: string;
  lastName: string;
  locationId: LocationId;
  phone?: string;
  birthDay?: number | null; // Optional day of birth (1-31)
  birthMonth?: number | null; // Optional month of birth (1-12)
  biWeeklyEarnings?: number;
  
  workSchedule: {
    [key in DayOfWeekId]?: { startTime: string; endTime: string; isWorking?: boolean; } | null;
  };

  customScheduleOverrides?: Array<{
    id: string; // Unique ID for the override itself
    date: string; // ISO Date string 'YYYY-MM-DD'
    isWorking: boolean;
    startTime?: string; // e.g., "09:00"
    endTime?: string;   // e.g., "17:00"
    notes?: string;
  }>;

  currentContract?: Contract | null;
  contractHistory?: Contract[];
}

export interface Patient extends BaseEntity {
  firstName: string;
  lastName: string;
  phone?: string;
  age?: number | null; 
  isDiabetic?: boolean;
  preferredProfessionalId?: string; // ID of a Professional
  notes?: string;
}

export interface Service {
  id: string; 
  name: string;
  defaultDuration: number; // in minutes
  price?: number;
}

export interface Appointment extends BaseEntity {
  patientId: string;
  patient?: Patient; 
  locationId: LocationId;
  professionalId?: string | null; 
  professional?: Professional; 
  serviceId: string; 
  service?: Service; 
  appointmentDateTime: string; 
  durationMinutes: number;
  preferredProfessionalId?: string | null;
  bookingObservations?: string;
  status: AppointmentStatus;
  actualArrivalTime?: string; 
  addedServices?: { serviceId: string; professionalId?: string | null; price?: number | null; service?: Service, professional?: Professional }[];
  paymentMethod?: PaymentMethod;
  amountPaid?: number;
  staffNotes?: string;
  attachedPhotos?: string[]; 
  createdAt?: string; 
  updatedAt?: string; 
  isExternalProfessional?: boolean; 
  externalProfessionalOriginLocationId?: LocationId | null; 
  isTravelBlock?: boolean; 
}

export type AppointmentFormData = {
  patientFirstName: string;
  patientLastName: string;
  patientPhone?: string | null;
  patientAge?: number | null; 
  existingPatientId?: string | null;
  isDiabetic?: boolean;

  locationId: LocationId;
  serviceId: string; 
  appointmentDate: Date; 
  appointmentTime: string; 
  preferredProfessionalId?: string | null; 
  bookingObservations?: string | null;
  searchExternal?: boolean; 
};

export type ProfessionalFormData = {
  id?: string;
  firstName: string;
  lastName: string;
  locationId: LocationId;
  phone?: string | null;
  birthDay?: number | null;
  birthMonth?: number | null;
  
  workSchedule: {
    [key in DayOfWeekId]?: { startTime?: string; endTime?: string; isWorking?: boolean };
  };
  
  customScheduleOverrides?: Array<{
    id: string; 
    date: Date; 
    isWorking: boolean;
    startTime?: string;
    endTime?: string;
    notes?: string;
  }>;
  currentContract_startDate?: Date | null;
  currentContract_endDate?: Date | null;
  currentContract_notes?: string | null;
  currentContract_empresa?: string | null; 
};

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

// Schema for editing contract on ContractsPage
export type ContractEditFormData = {
  startDate: Date | null;
  endDate: Date | null;
  empresa?: string | null;
};

export interface PeriodicReminder extends BaseEntity {
  title: string;
  description?: string;
  dueDate: string; // ISO Date string 'YYYY-MM-DD'
  recurrence: 'once' | 'monthly' | 'quarterly' | 'annually';
  amount?: number;
  status: 'pending' | 'paid';
  createdAt?: string; // ISO Date string
  updatedAt?: string; // ISO Date string
}

export interface PeriodicReminderFormData {
  title: string;
  description?: string | null;
  dueDate: Date; // In the form, it's a Date object from react-day-picker
  recurrence: 'once' | 'monthly' | 'quarterly' | 'annually';
  amount?: number | null; // Form might deal with undefined or null for optional numbers
  status: 'pending' | 'paid';
}
