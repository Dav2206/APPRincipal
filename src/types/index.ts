

import type { LocationId, UserRole, PaymentMethod, AppointmentStatus, DayOfWeekId } from '../lib/constants';

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

export interface Location {
    id: LocationId;
    name: string;
    paymentMethods: PaymentMethod[];
}

export interface PaymentGroup {
  id: string;
  name: string;
  methods: string[];
}

export interface GroupingPreset {
  id: string;
  name: string;
  groups: PaymentGroup[];
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
  birthDay?: number | null;
  birthMonth?: number | null;
  baseSalary?: number | null;
  commissionRate?: number | null;
  commissionDeductible?: number | null;
  discounts?: number | null;
  afp?: number | null;
  seguro?: number | null;


  biWeeklyEarnings?: number;

  workSchedule: {
    [key in DayOfWeekId]?: { startTime: string; endTime: string; isWorking?: boolean; } | null;
  };

  customScheduleOverrides?: Array<{
    id: string;
    date: string; // ISO Date string 'YYYY-MM-DD'
    overrideType: 'descanso' | 'turno_especial' | 'traslado';
    isWorking: boolean;
    startTime?: string;
    endTime?: string;
    locationId?: LocationId | null; // Used for 'traslado' type
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

export interface Material extends BaseEntity {
  name: string;
  unit: string; // e.g., 'unidad', 'par', 'caja'
}

export interface ServiceMaterial {
  materialId: string; // Link to Material entity
  quantity: number;
}

export interface Service extends BaseEntity {
  name: string;
  defaultDuration: number; // in minutes
  price?: number | null;
  materialsUsed?: ServiceMaterial[];
}

export interface AddedServiceItem {
  serviceId: string;
  professionalId?: string | null;
  amountPaid?: number | null;
  startTime?: string | null; 
  service?: Service; // Populated for display
  professional?: Professional; // Populated for display
}

export interface Appointment extends BaseEntity {
  patientId: string | null;
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
  originalAppointmentId?: string; // Link to the main appointment for travel blocks
  _deleted?: boolean; // Flag for UI handling of deleted items
  isForFamilyMember?: boolean;
  familyMemberRelation?: string | null;
}

export type AppointmentFormData = {
  patientFirstName: string;
  patientLastName: string;
  patientPhone?: string | null;
  patientAge?: number | null;
  existingPatientId?: string | null;
  isDiabetic?: boolean;
  isWalkIn?: boolean;

  locationId: LocationId;
  serviceId: string;
  appointmentDate: Date;
  appointmentTime: string;
  searchExternal?: boolean; // New flag for UI
  professionalOriginLocationId?: string;
  preferredProfessionalId?: string | null;
  bookingObservations?: string | null;
  addedServices?: Partial<AddedServiceItem>[];
  isForFamilyMember?: boolean;
  familyMemberRelation?: string | null;
};

export type ProfessionalFormData = {
  id?: string;
  firstName: string;
  lastName: string;
  locationId: LocationId;
  phone?: string | null;
  isManager?: boolean;
  birthDay?: number | null;
  birthMonth?: number | null;
  baseSalary?: number | null;
  commissionRate?: number | null;
  commissionDeductible?: number | null;
  afp?: number | null;
  seguro?: number | null;

  workSchedule: {
    [key in DayOfWeekId]?: { startTime?: string; endTime?: string; isWorking?: boolean };
  };

  customScheduleOverrides?: Array<{
    id: string;
    date: Date;
    overrideType: 'descanso' | 'turno_especial' | 'traslado';
    startTime?: string;
    endTime?: string;
    locationId?: LocationId | null;
    notes?: string | null;
  }>;
  currentContract_startDate?: Date | null;
  currentContract_endDate?: Date | null;
  currentContract_notes?: string | null;
  currentContract_empresa?: string | null;
};

export type AppointmentUpdateFormData = {
  status: AppointmentStatus;
  serviceId?: string;
  appointmentDate?: Date;
  appointmentTime?: string;
  actualArrivalTime?: string | null;
  professionalId?: string | null;
  duration?: {
    hours: number;
    minutes: number;
  };
  durationMinutes?: number | null; // This will be calculated from duration
  paymentMethod?: PaymentMethod | null;
  amountPaid?: number | null;
  staffNotes?: string | null;
  attachedPhotos?: { url: string }[];
  addedServices?: Partial<AddedServiceItem>[];
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
  materialsUsed?: {
    materialId: string;
    quantity: number;
  }[];
};

export type ContractEditFormData = {
  startDate: Date | null;
  endDate: Date | null;
  empresa?: string | null;
};

export interface PeriodicReminder extends BaseEntity {
  title: string;
  description?: string | null;
  category: 'insumos' | 'servicios' | 'impuestos' | 'otros';
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
  category: 'insumos' | 'servicios' | 'impuestos' | 'otros';
  dueDate: Date;
  recurrence: 'once' | 'monthly' | 'quarterly' | 'annually';
  amount?: number | null;
  status: 'pending' | 'paid';
}

export interface ImportantNote extends BaseEntity {
  id?: string;
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

export interface ProfessionalDetails {
  professionalId: string;
  professionalName: string;
  period: string;
  details: {
    appointmentDateTime: string;
    patientName: string;
    serviceName: string;
    locationName: string;
    totalValue: number;
    paymentMethod?: string | null;
  }[];
}

export type MaterialFormData = {
  id?: string;
  name: string;
  unit: string;
};
    