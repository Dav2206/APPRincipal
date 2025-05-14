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
  startDate: string; // ISO Date string
  endDate: string;   // ISO Date string
  notes?: string;
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
  // Removed email as per previous request
  age?: number | null; // Made age optional
  // Removed dateOfBirth and birthMonth/birthDay as per previous requests
  isDiabetic?: boolean;
  preferredProfessionalId?: string; // ID of a Professional
  notes?: string;
}

export interface Service {
  id: string; // Or ServiceId if you have a strict enum/type for service IDs
  name: string;
  defaultDuration: number; // in minutes
  price?: number;
}

export interface Appointment extends BaseEntity {
  patientId: string;
  patient?: Patient; // Populated on fetch
  locationId: LocationId;
  professionalId?: string | null; // ID of a Professional
  professional?: Professional; // Populated on fetch
  serviceId: string; // ID of a Service
  service?: Service; // Populated on fetch
  appointmentDateTime: string; // ISO DateTime string
  durationMinutes: number;
  preferredProfessionalId?: string | null;
  bookingObservations?: string;
  status: AppointmentStatus;
  actualArrivalTime?: string; // e.g., "14:05"
  addedServices?: { serviceId: string; professionalId?: string | null; price?: number | null; service?: Service, professional?: Professional }[];
  paymentMethod?: PaymentMethod;
  amountPaid?: number;
  staffNotes?: string;
  attachedPhotos?: string[]; // Array of data URIs or URLs
  createdAt?: string; // ISO DateTime string
  updatedAt?: string; // ISO DateTime string
  isExternalProfessional?: boolean; // True if professional is working at a location different from their base
  externalProfessionalOriginLocationId?: LocationId | null; // If isExternalProfessional is true, this is their base location
  isTravelBlock?: boolean; // Used in schedule to denote a professional is away at another clinic location
}

// This type is for the form data when creating/editing an appointment
export type AppointmentFormData = {
  patientFirstName: string;
  patientLastName: string;
  patientPhone?: string | null;
  patientAge?: number | null; 
  existingPatientId?: string | null;
  isDiabetic?: boolean;

  locationId: LocationId;
  serviceId: string; // Service ID
  appointmentDate: Date; // Date object for picker
  appointmentTime: string; // e.g., "10:00" from TIME_SLOTS
  preferredProfessionalId?: string | null; // Professional ID or placeholder
  bookingObservations?: string | null;
  searchExternal?: boolean; // For searching professionals in other locations
};

export type ProfessionalFormData = {
  id?: string;
  firstName: string;
  lastName: string;
  locationId: LocationId;
  phone?: string | null;
  
  workSchedule: {
    // Each day can be individually set
    [key in DayOfWeekId]?: { startTime?: string; endTime?: string; isWorking?: boolean };
  };
  
  customScheduleOverrides?: Array<{
    id: string; // Unique ID for the override itself
    date: Date; // Date object for picker
    isWorking: boolean;
    startTime?: string;
    endTime?: string;
    notes?: string;
  }>;
  currentContract_startDate?: Date | null;
  currentContract_endDate?: Date | null;
  currentContract_notes?: string | null;
  // contractHistory is not directly edited in the main form, but managed via currentContract updates
};

export type { AppointmentStatus }; // Re-export for convenience

export type ServiceFormData = {
  id?: string;
  name: string;
  defaultDuration: { 
    hours: number;
    minutes: number;
  };
  price?: number;
};