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
    [key in DayOfWeekId]?: { startTime: string; endTime: string; isWorking?: boolean; } | null;
  };

  rotationType: 'none' | 'biWeeklySunday';
  rotationStartDate: string | null; 
  compensatoryDayOffChoice: DayOfWeekId | null; 

  customScheduleOverrides?: Array<{
    id: string;
    date: string; 
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
  isExternalProfessional?: boolean; // New field
  externalProfessionalOriginLocationId?: LocationId | null; // New field
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
  searchExternal?: boolean; // New field to indicate if searching in other locations
};

export type ProfessionalFormData = {
  id?: string;
  firstName: string;
  lastName: string;
  locationId: LocationId;
  phone?: string | null;
  
  workSchedule: {
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

