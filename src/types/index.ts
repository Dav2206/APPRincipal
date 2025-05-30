
import type { LocationId, UserRole, PaymentMethod, AppointmentStatus, DayOfWeekId } from '@/lib/constants';

export interface BaseEntity {
  id: string;
}

export interface User extends BaseEntity {
  username: string;
  password?: string; // Password should ideally be handled securely and not stored plaintext
  role: UserRole;
  locationId?: LocationId | null; // Allow null for admin/contador
  name: string;
  useruid?: string; // Firebase Auth UID
}

export interface Contract {
  id: string;
  startDate: string; // ISO Date string
  endDate: string;   // ISO Date string
  notes?: string | null;
  empresa?: string | null;
}

export interface Professional extends BaseEntity {
  firstName: string;
  lastName: string;
  locationId: LocationId;
  phone?: string | null;
  isManager?: boolean; 

  biWeeklyEarnings?: number;

  workSchedule: {
    [key in DayOfWeekId]?: { startTime: string; endTime: string; isWorking?: boolean; } | null;
  };

  customScheduleOverrides?: Array<{
    id: string;
    date: string; // ISO Date string 'YYYY-MM-DD'
    isWorking: boolean;
    startTime?: string;
    endTime?: string;
    notes?: string | null;
  }>;

  currentContract?: Contract | null;
  contractHistory?: Contract[];
}

export interface Patient extends BaseEntity {
  firstName: string;
  lastName: string;
  phone?: string | null;
  age?: number | null;
  isDiabetic?: boolean;
  preferredProfessionalId?: string | null;
  notes?: string | null;
}

export interface Service {
  id: string;
  name: string;
  defaultDuration: number; // in minutes
  price?: number | null;
}

export interface AddedServiceItem {
  serviceId: string;
  professionalId?: string | null;
  price?: number | null;
  service?: Service; // Populated for display
  professional?: Professional; // Populated for display
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
  durationMinutes: number; // Duration of the main service
  totalCalculatedDurationMinutes?: number; // Total duration including added services
  preferredProfessionalId?: string | null;
  bookingObservations?: string | null;
  status: AppointmentStatus;
  actualArrivalTime?: string | null;
  addedServices?: AddedServiceItem[];
  paymentMethod?: PaymentMethod | null;
  amountPaid?: number | null;
  staffNotes?: string | null;
  attachedPhotos?: string[];
  createdAt?: string;
  updatedAt?: string;
  isExternalProfessional?: boolean;
  externalProfessionalOriginLocationId?: LocationId | null;
  isTravelBlock?: boolean;
  _deleted?: boolean; // Flag for UI handling of deleted items
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
  addedServices?: Partial<AddedServiceItem>[];
};

export type ProfessionalFormData = {
  id?: string;
  firstName: string;
  lastName: string;
  locationId: LocationId;
  phone?: string | null;
  isManager?: boolean;

  workSchedule: {
    [key in DayOfWeekId]?: { startTime?: string; endTime?: string; isWorking?: boolean };
  };

  customScheduleOverrides?: Array<{
    id: string;
    date: Date;
    isWorking: boolean;
    startTime?: string;
    endTime?: string;
    notes?: string | null;
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
  price?: number | null;
};

export type ContractEditFormData = {
  startDate: Date | null;
  endDate: Date | null;
  empresa?: string | null;
};

export interface PeriodicReminder extends BaseEntity {
  title: string;
  description?: string | null;
  dueDate: string; // ISO Date string 'YYYY-MM-DD'
  recurrence: 'once' | 'monthly' | 'quarterly' | 'annually';
  amount?: number | null;
  status: 'pending' | 'paid';
  createdAt?: string; // ISO Date string
  updatedAt?: string; // ISO Date string
}

export interface PeriodicReminderFormData {
  title: string;
  description?: string | null;
  dueDate: Date;
  recurrence: 'once' | 'monthly' | 'quarterly' | 'annually';
  amount?: number | null;
  status: 'pending' | 'paid';
}

export interface ImportantNote extends BaseEntity {
  title: string;
  content: string;
  createdAt?: string; // ISO Date string
  updatedAt?: string; // ISO Date string
}

export interface ImportantNoteFormData {
  id?: string;
  title: string;
  content: string;
}
