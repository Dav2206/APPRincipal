import type { LocationId, UserRole, PaymentMethod, AppointmentStatus, DayOfWeekId } from '@/lib/constants';

export interface BaseEntity {
  id: string;
}

export interface User extends BaseEntity {
  username: string;
  password?: string;
  role: UserRole;
  locationId?: LocationId;
  name: string;
}

export interface Professional extends BaseEntity {
  firstName: string;
  lastName: string;
  locationId: LocationId;
  phone?: string;
  biWeeklyEarnings?: number;
  
  workSchedule: {
    // Allow each day to have a schedule object with start/end times and an isWorking flag, or be null if not configured
    [key in DayOfWeekId]?: { startTime: string; endTime: string; isWorking?: boolean; } | null;
  };

  rotationType: 'none' | 'biWeeklySunday';
  rotationStartDate: string | null; // ISO Date string "YYYY-MM-DD", should be a Sunday if rotationType is 'biWeeklySunday'
  compensatoryDayOffChoice: DayOfWeekId | null; // e.g., 'monday', relevant if rotationType is 'biWeeklySunday'

  customScheduleOverrides?: Array<{
    id: string;
    date: string; // ISO date string "YYYY-MM-DD"
    isWorking: boolean;
    startTime?: string;
    endTime?: string;
    notes?: string;
  }>;
}

export interface Patient extends BaseEntity {
  firstName: string;
  lastName: string;
  phone?: string;
  age?: number | null;
  birthDay?: number | null; 
  birthMonth?: number | null;
  isDiabetic?: boolean;
  preferredProfessionalId?: string;
  notes?: string;
}

export interface Service {
  id: string;
  name: string;
  defaultDuration: number;
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
}

export type AppointmentFormData = {
  patientFirstName: string;
  patientLastName: string;
  patientPhone?: string | null;
  patientAge?: number | null;
  existingPatientId?: string | null;
  isDiabetic?: boolean;
  birthDay?: number | null;
  birthMonth?: number | null;

  locationId: LocationId;
  serviceId: string;
  appointmentDate: Date;
  appointmentTime: string;
  preferredProfessionalId?: string | null;
  bookingObservations?: string | null;
};

export type ProfessionalFormData = {
  id?: string;
  firstName: string;
  lastName: string;
  locationId: LocationId;
  phone?: string | null;
  
  workSchedule: {
    // For each day (Mon-Sat in form), isWorking flag and optional start/end times
    [key in Exclude<DayOfWeekId, 'sunday'>]?: { startTime?: string; endTime?: string; isWorking?: boolean };
  };
  
  rotationType: 'none' | 'biWeeklySunday';
  rotationStartDate?: Date | null; 
  compensatoryDayOffChoice?: DayOfWeekId | null;
  
  customScheduleOverrides?: Array<{
    id: string;
    date: Date;
    isWorking: boolean;
    startTime?: string;
    endTime?: string;
    notes?: string;
  }>;
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
