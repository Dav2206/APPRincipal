
export const LOCATIONS = [
  { id: 'higuereta', name: 'Higuereta' },
  { id: 'eden_benavides', name: 'Edén Benavides' },
  { id: 'crucetas', name: 'Crucetas' },
  { id: 'carpaccio', name: 'Carpaccio' },
  { id: 'vista_alegre', name: 'Vista Alegre' },
  { id: 'san_antonio', name: 'San Antonio' },
] as const;

export type LocationId = typeof LOCATIONS[number]['id'];

export const USER_ROLES = {
  ADMIN: 'admin',
  LOCATION_STAFF: 'location_staff',
} as const;

export type UserRole = typeof USER_ROLES[keyof typeof USER_ROLES];

export const SERVICES = [
  { id: 'consulta_general', name: 'Consulta General', defaultDuration: 30 }, // duration in minutes
  { id: 'tratamiento_unas', name: 'Tratamiento de Uñas', defaultDuration: 45 },
  { id: 'quiropodia', name: 'Quiropodia', defaultDuration: 60 },
  { id: 'reflexologia', name: 'Reflexología Podal', defaultDuration: 45 },
  { id: 'estudio_pisada', name: 'Estudio de la Pisada', defaultDuration: 60 },
] as const;

export type ServiceId = typeof SERVICES[number]['id'];

export const PROFESSIONAL_SPECIALIZATIONS = [
  'Podología General',
  'Podología Deportiva',
  'Podología Pediátrica',
  'Biomecánica',
] as const;

export type ProfessionalSpecialization = typeof PROFESSIONAL_SPECIALIZATIONS[number];

export const PAYMENT_METHODS = ['Efectivo', 'Tarjeta de Crédito', 'Tarjeta de Débito', 'Transferencia', 'Yape/Plin'] as const;
export type PaymentMethod = typeof PAYMENT_METHODS[number];

export const APPOINTMENT_STATUS = {
  BOOKED: 'booked',
  CONFIRMED: 'confirmed', // Client arrival confirmed
  COMPLETED: 'completed', // Service finished and paid
  CANCELLED_CLIENT: 'cancelled_client',
  CANCELLED_STAFF: 'cancelled_staff',
  NO_SHOW: 'no_show',
} as const;

export type AppointmentStatus = typeof APPOINTMENT_STATUS[keyof typeof APPOINTMENT_STATUS];

export const APPOINTMENT_STATUS_DISPLAY: Record<AppointmentStatus, string> = {
  [APPOINTMENT_STATUS.BOOKED]: 'Reservado',
  [APPOINTMENT_STATUS.CONFIRMED]: 'Confirmado en Sede',
  [APPOINTMENT_STATUS.COMPLETED]: 'Completado',
  [APPOINTMENT_STATUS.CANCELLED_CLIENT]: 'Cancelado (Cliente)',
  [APPOINTMENT_STATUS.CANCELLED_STAFF]: 'Cancelado (Staff)',
  [APPOINTMENT_STATUS.NO_SHOW]: 'No se presentó',
};


export const TIME_SLOTS = Array.from({ length: (20 - 8) * 2 }, (_, i) => { // From 8 AM to 8 PM, 30 min slots
  const hour = Math.floor(i / 2) + 8;
  const minute = (i % 2) * 30;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
});
