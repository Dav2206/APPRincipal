
import type { User, Professional, Patient, Service, Appointment, AppointmentFormData, ProfessionalFormData, AppointmentStatus, ServiceFormData } from '@/types';
import { LOCATIONS, USER_ROLES, SERVICES as SERVICES_CONSTANTS, APPOINTMENT_STATUS, LocationId, ServiceId as ConstantServiceId, APPOINTMENT_STATUS_DISPLAY, PAYMENT_METHODS } from './constants';
import { formatISO, parseISO, addDays, setHours, setMinutes, startOfDay, endOfDay, addMinutes, isSameDay as dateFnsIsSameDay, startOfMonth, endOfMonth } from 'date-fns';
// Removed Firestore imports as we are reverting to mock

// --- Mock Data Storage ---
let mockUsers: User[] = [
  { id: 'admin001', username: 'Admin', password: 'admin', role: USER_ROLES.ADMIN, name: 'Administrator' },
  { id: 'contador001', username: 'Contador', password: 'admin', role: USER_ROLES.CONTADOR, name: 'Contador Principal' },
  ...LOCATIONS.map(loc => ({
    id: `user-${loc.id}`,
    username: loc.name,
    password: 'admin',
    role: USER_ROLES.LOCATION_STAFF,
    locationId: loc.id,
    name: `${loc.name} Staff`
  }))
];

let mockProfessionals: Professional[] = LOCATIONS.flatMap((location, locIndex) => 
  Array.from({ length: 2 }, (_, i) => ({
    id: `prof-${location.id}-${i + 1}`,
    firstName: `Profesional ${i + 1}`,
    lastName: location.name.split(' ')[0],
    locationId: location.id,
    phone: `9876543${locIndex}${i + 1}`,
    biWeeklyEarnings: Math.floor(Math.random() * 1500) + 300,
  }))
);

let mockPatients: Patient[] = [
  { id: 'pat001', firstName: 'Ana', lastName: 'García', phone: '111222333', email: 'ana.garcia@example.com', preferredProfessionalId: mockProfessionals[0]?.id, notes: 'Paciente regular, prefiere citas por la mañana.', dateOfBirth: '1985-05-15', isDiabetic: false },
  { id: 'pat002', firstName: 'Luis', lastName: 'Martínez', phone: '444555666', email: 'luis.martinez@example.com', notes: 'Primera visita.', dateOfBirth: '1992-11-20', isDiabetic: true },
  { id: 'pat003', firstName: 'Elena', lastName: 'Ruiz', phone: '777888999', email: 'elena.ruiz@example.com', dateOfBirth: '2000-07-01', isDiabetic: false },
];

let mockServices: Service[] = SERVICES_CONSTANTS.map(s_const => ({
  id: s_const.id,
  name: s_const.name,
  defaultDuration: s_const.defaultDuration,
  price: Math.floor(Math.random() * 50) + 50,
}));

let mockAppointments: Appointment[] = [
  {
    id: 'appt001',
    patientId: 'pat001',
    locationId: LOCATIONS[0].id,
    professionalId: mockProfessionals.find(p => p.locationId === LOCATIONS[0].id)?.id || mockProfessionals[0]?.id,
    serviceId: mockServices[0].id,
    appointmentDateTime: formatISO(addDays(startOfDay(new Date()), -1)), // Yesterday
    durationMinutes: mockServices[0].defaultDuration,
    status: APPOINTMENT_STATUS.COMPLETED,
    amountPaid: mockServices[0].price,
    paymentMethod: PAYMENT_METHODS[0],
    createdAt: formatISO(new Date()),
    updatedAt: formatISO(new Date()),
    attachedPhotos: [],
    addedServices: [],
  },
  {
    id: 'appt002',
    patientId: 'pat002',
    locationId: LOCATIONS[1].id,
    professionalId: mockProfessionals.find(p => p.locationId === LOCATIONS[1].id)?.id || mockProfessionals[1]?.id,
    serviceId: mockServices[1].id,
    appointmentDateTime: formatISO(startOfDay(new Date())), // Today
    durationMinutes: mockServices[1].defaultDuration,
    status: APPOINTMENT_STATUS.BOOKED,
    createdAt: formatISO(new Date()),
    updatedAt: formatISO(new Date()),
    attachedPhotos: [],
    addedServices: [],
  }
];

const generateId = () => Math.random().toString(36).substr(2, 9);

// --- Auth ---
export const getUserByUsername = async (username: string): Promise<User | undefined> => {
  return mockUsers.find(u => u.username === username);
};

// --- Professionals ---
export const getProfessionals = async (locationId?: LocationId): Promise<Professional[]> => {
  if (locationId) {
    return mockProfessionals.filter(p => p.locationId === locationId);
  }
  return [...mockProfessionals];
};

export const getProfessionalById = async (id: string): Promise<Professional | undefined> => {
  return mockProfessionals.find(p => p.id === id);
};

export const addProfessional = async (data: Omit<ProfessionalFormData, 'id'>): Promise<Professional> => {
  const newProfessional: Professional = {
    id: generateId(),
    ...data,
    biWeeklyEarnings: 0,
  };
  mockProfessionals.push(newProfessional);
  return newProfessional;
};

export const updateProfessional = async (id: string, data: Partial<ProfessionalFormData>): Promise<Professional | undefined> => {
  const index = mockProfessionals.findIndex(p => p.id === id);
  if (index !== -1) {
    mockProfessionals[index] = { ...mockProfessionals[index], ...data } as Professional;
    return mockProfessionals[index];
  }
  return undefined;
};

// --- Patients ---
export const getPatients = async (options: { page?: number, limit?: number, searchTerm?: string, filterToday?: boolean, adminSelectedLocation?: LocationId | 'all', user?: User | null, lastVisibleDoc?: any } = {}): Promise<{patients: Patient[], totalCount: number, lastDoc?: any}> => {
  const { page = 1, limit = 8, searchTerm, filterToday, adminSelectedLocation, user } = options;
  let filteredPatients = [...mockPatients];

  if (searchTerm) {
    filteredPatients = filteredPatients.filter(p =>
      `${p.firstName} ${p.lastName}`.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (p.phone && p.phone.includes(searchTerm))
    );
  }

  if (filterToday && user) {
    const today = startOfDay(new Date());
    const isAdminOrContador = user.role === USER_ROLES.ADMIN || user.role === USER_ROLES.CONTADOR;
    const effectiveLocationId = isAdminOrContador
       ? (adminSelectedLocation === 'all' ? undefined : adminSelectedLocation)
       : user.locationId;

    const dailyAppointments = mockAppointments.filter(appt =>
      dateFnsIsSameDay(parseISO(appt.appointmentDateTime), today) &&
      (effectiveLocationId ? appt.locationId === effectiveLocationId : true)
    );
    const patientIdsWithAppointmentsToday = new Set(dailyAppointments.map(app => app.patientId));
    filteredPatients = filteredPatients.filter(p => patientIdsWithAppointmentsToday.has(p.id));
  }
  
  filteredPatients.sort((a,b) => `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`));

  const totalCount = filteredPatients.length;
  const startIndex = (page - 1) * limit;
  const paginatedPatients = filteredPatients.slice(startIndex, startIndex + limit);
  
  return { patients: paginatedPatients, totalCount, lastDoc: undefined }; // lastDoc not really applicable for mock
};

export const getPatientById = async (id: string): Promise<Patient | undefined> => {
  return mockPatients.find(p => p.id === id);
};

export const findPatient = async (firstName: string, lastName: string): Promise<Patient | undefined> => {
  return mockPatients.find(p => p.firstName === firstName && p.lastName === lastName);
}

export const addPatient = async (data: Omit<Patient, 'id'>): Promise<Patient> => {
  const newPatient: Patient = {
    id: generateId(),
    ...data,
    isDiabetic: data.isDiabetic || false,
  };
  mockPatients.push(newPatient);
  return newPatient;
}

export const updatePatient = async (id: string, data: Partial<Patient>): Promise<Patient | undefined> => {
  const index = mockPatients.findIndex(p => p.id === id);
  if (index !== -1) {
    mockPatients[index] = { ...mockPatients[index], ...data } as Patient;
    return mockPatients[index];
  }
  return undefined;
};

// --- Services ---
export const getServices = async (): Promise<Service[]> => {
  return [...mockServices].sort((a, b) => a.name.localeCompare(b.name));
};

export const getServiceById = async (id: string): Promise<Service | undefined> => {
  return mockServices.find(s => s.id === id);
}

export const addService = async (data: ServiceFormData): Promise<Service> => {
  const newService: Service = {
    id: data.id || generateId(),
    ...data,
  };
  mockServices.push(newService);
  return newService;
};

export const updateService = async (id: string, data: Partial<ServiceFormData>): Promise<Service | undefined> => {
  const index = mockServices.findIndex(s => s.id === id);
  if (index !== -1) {
    mockServices[index] = { ...mockServices[index], ...data } as Service;
    return mockServices[index];
  }
  return undefined;
};

// --- Appointments ---
export const getAppointments = async (filters: {
  locationId?: LocationId | LocationId[] | undefined;
  date?: Date;
  dateRange?: { start: Date; end: Date };
  statuses?: AppointmentStatus | AppointmentStatus[];
  patientId?: string;
  professionalId?: string;
  page?: number;
  limit?: number;
  lastVisibleDoc?: any;
}): Promise<{ appointments: Appointment[], totalCount: number, lastDoc?: any }> => {
  let filteredAppointments = [...mockAppointments];

  if (filters.locationId) {
    const locationsToFilter = Array.isArray(filters.locationId) ? filters.locationId : [filters.locationId];
    if (locationsToFilter.length > 0) {
      filteredAppointments = filteredAppointments.filter(appt => locationsToFilter.includes(appt.locationId));
    }
  }
  if (filters.patientId) {
    filteredAppointments = filteredAppointments.filter(appt => appt.patientId === filters.patientId);
  }
  if (filters.professionalId) {
    filteredAppointments = filteredAppointments.filter(appt => appt.professionalId === filters.professionalId);
  }
  if (filters.date) {
    filteredAppointments = filteredAppointments.filter(appt => dateFnsIsSameDay(parseISO(appt.appointmentDateTime), filters.date!));
  }
  if (filters.dateRange) {
    const start = startOfDay(filters.dateRange.start);
    const end = endOfDay(filters.dateRange.end);
    filteredAppointments = filteredAppointments.filter(appt => {
      const apptDate = parseISO(appt.appointmentDateTime);
      return apptDate >= start && apptDate <= end;
    });
  }
  if (filters.statuses) {
    const statusesToFilter = Array.isArray(filters.statuses) ? filters.statuses : [filters.statuses];
    if (statusesToFilter.length > 0) {
      filteredAppointments = filteredAppointments.filter(appt => statusesToFilter.includes(appt.status));
    }
  }

  const isFetchingPastStatuses = filters.statuses && (
    (Array.isArray(filters.statuses) && filters.statuses.some(s => [APPOINTMENT_STATUS.COMPLETED, APPOINTMENT_STATUS.CANCELLED_CLIENT, APPOINTMENT_STATUS.CANCELLED_STAFF, APPOINTMENT_STATUS.NO_SHOW].includes(s))) ||
    (typeof filters.statuses === 'string' && [APPOINTMENT_STATUS.COMPLETED, APPOINTMENT_STATUS.CANCELLED_CLIENT, APPOINTMENT_STATUS.CANCELLED_STAFF, APPOINTMENT_STATUS.NO_SHOW].includes(filters.statuses))
  );

  filteredAppointments.sort((a, b) => {
    const dateA = parseISO(a.appointmentDateTime).getTime();
    const dateB = parseISO(b.appointmentDateTime).getTime();
    return isFetchingPastStatuses ? dateB - dateA : dateA - dateB;
  });
  
  const populatedAppointments = filteredAppointments.map(appt => ({
    ...appt,
    patient: mockPatients.find(p => p.id === appt.patientId),
    professional: mockProfessionals.find(prof => prof.id === appt.professionalId),
    service: mockServices.find(s => s.id === appt.serviceId),
    addedServices: appt.addedServices?.map(as => ({
      ...as,
      service: mockServices.find(s => s.id === as.serviceId),
      professional: mockProfessionals.find(p => p.id === as.professionalId),
    }))
  }));

  const totalCount = populatedAppointments.length;
  const page = filters.page || 1;
  const limit = filters.limit || (isFetchingPastStatuses ? 8 : Infinity); // Limit for history, otherwise all for current day view
  const startIndex = (page - 1) * limit;
  const paginatedAppointments = populatedAppointments.slice(startIndex, startIndex + limit);

  return { appointments: paginatedAppointments, totalCount, lastDoc: undefined };
};

export const getAppointmentById = async (id: string): Promise<Appointment | undefined> => {
  const appt = mockAppointments.find(a => a.id === id);
  if (appt) {
    return {
      ...appt,
      patient: mockPatients.find(p => p.id === appt.patientId),
      professional: mockProfessionals.find(prof => prof.id === appt.professionalId),
      service: mockServices.find(s => s.id === appt.serviceId),
      addedServices: appt.addedServices?.map(as => ({
        ...as,
        service: mockServices.find(s => s.id === as.serviceId),
        professional: mockProfessionals.find(p => p.id === as.professionalId),
      }))
    };
  }
  return undefined;
};

export const addAppointment = async (data: AppointmentFormData): Promise<Appointment> => {
  let patientId = data.existingPatientId;
  if (!patientId) {
    let existingPatient = await findPatient(data.patientFirstName, data.patientLastName);
    if (existingPatient) {
      patientId = existingPatient.id;
       if (data.isDiabetic !== undefined && existingPatient.isDiabetic !== data.isDiabetic) {
          await updatePatient(patientId, { isDiabetic: data.isDiabetic });
      }
    } else {
      const newPatient = await addPatient({
        firstName: data.patientFirstName,
        lastName: data.patientLastName,
        phone: data.patientPhone,
        email: data.patientEmail,
        dateOfBirth: data.patientDateOfBirth,
        isDiabetic: data.isDiabetic || false,
      });
      patientId = newPatient.id;
    }
  } else {
      const existingPatientDetails = await getPatientById(patientId);
      if (existingPatientDetails && data.isDiabetic !== undefined && data.isDiabetic !== existingPatientDetails.isDiabetic) {
        await updatePatient(patientId, { isDiabetic: data.isDiabetic });
      }
  }

  const service = await getServiceById(data.serviceId);
  const appointmentDateHours = parseInt(data.appointmentTime.split(':')[0]);
  const appointmentDateMinutes = parseInt(data.appointmentTime.split(':')[1]);
  const appointmentDateTime = setMinutes(setHours(data.appointmentDate, appointmentDateHours), appointmentDateMinutes);

  const newAppointment: Appointment = {
    id: generateId(),
    patientId: patientId!,
    locationId: data.locationId,
    serviceId: data.serviceId,
    appointmentDateTime: formatISO(appointmentDateTime),
    durationMinutes: service?.defaultDuration || 60,
    preferredProfessionalId: data.preferredProfessionalId === "_any_professional_placeholder_" ? undefined : data.preferredProfessionalId,
    bookingObservations: data.bookingObservations,
    status: APPOINTMENT_STATUS.BOOKED,
    createdAt: formatISO(new Date()),
    updatedAt: formatISO(new Date()),
    attachedPhotos: [],
    addedServices: [],
  };
  mockAppointments.push(newAppointment);
  return getAppointmentById(newAppointment.id) as Promise<Appointment>; // Ensure full population
};

export const updateAppointment = async (id: string, data: Partial<Appointment>): Promise<Appointment | undefined> => {
  const index = mockAppointments.findIndex(a => a.id === id);
  if (index !== -1) {
    const updatedAppointment = {
      ...mockAppointments[index],
      ...data,
      updatedAt: formatISO(new Date()),
    };
    // Ensure professional and service are re-fetched/re-assigned if their IDs changed
    if (data.professionalId !== undefined) {
        updatedAppointment.professional = await getProfessionalById(data.professionalId || '');
    }
    if (data.serviceId !== undefined) {
        updatedAppointment.service = await getServiceById(data.serviceId);
    }
     if (data.addedServices) {
        updatedAppointment.addedServices = await Promise.all(data.addedServices.map(async as => ({
            ...as,
            service: as.serviceId ? await getServiceById(as.serviceId) : undefined,
            professional: as.professionalId ? await getProfessionalById(as.professionalId) : undefined
        })));
    }
    mockAppointments[index] = updatedAppointment as Appointment;
    return getAppointmentById(id); // return populated one
  }
  return undefined;
};

export const getPatientAppointmentHistory = async (
  patientId: string,
  options: { page?: number, limit?: number, lastVisibleDoc?: any } = {}
): Promise<{ appointments: Appointment[], totalCount: number, lastDoc?: any }> => {
  const today = startOfDay(new Date());
  const historyAppointments = mockAppointments.filter(appt =>
    appt.patientId === patientId &&
    parseISO(appt.appointmentDateTime) < today &&
    [APPOINTMENT_STATUS.COMPLETED, APPOINTMENT_STATUS.NO_SHOW, APPOINTMENT_STATUS.CANCELLED_CLIENT, APPOINTMENT_STATUS.CANCELLED_STAFF].includes(appt.status)
  ).sort((a, b) => parseISO(b.appointmentDateTime).getTime() - parseISO(a.appointmentDateTime).getTime());

  const populatedHistory = historyAppointments.map(appt => ({
    ...appt,
    patient: mockPatients.find(p => p.id === appt.patientId),
    professional: mockProfessionals.find(prof => prof.id === appt.professionalId),
    service: mockServices.find(s => s.id === appt.serviceId),
     addedServices: appt.addedServices?.map(as => ({
        ...as,
        service: mockServices.find(s => s.id === as.serviceId),
        professional: mockProfessionals.find(p => p.id === as.professionalId),
    }))
  }));
  
  const totalCount = populatedHistory.length;
  const page = options.page || 1;
  const limit = options.limit || 8;
  const startIndex = (page - 1) * limit;
  const paginatedAppointments = populatedHistory.slice(startIndex, startIndex + limit);

  return { appointments: paginatedAppointments, totalCount, lastDoc: undefined };
};


// --- Data Seeding/Initialization (Example - for development) ---
// This function is just for demonstration or initial setup in a dev environment.
// In a real app, this would be handled differently or not at all for production.
export const seedInitialData = async () => {
  // Seeding is done by initializing the mock arrays above.
  // No further action needed here for the mock setup.
  console.log("Mock data is initialized.");
};

// If running in a Node.js-like environment for development, you might call seedInitialData.
// For a browser environment (Next.js client/server components), this typically isn't called directly like this.
// if (typeof process !== 'undefined' && process.env.NODE_ENV === 'development') {
//   // Check if DB is "empty" (mock arrays are empty)
//   if (mockProfessionals.length === 0) { // Example check
//     // seedInitialData(); // Not strictly necessary as arrays are initialized above.
//     console.log("Mock data was initialized (or re-initialized if arrays were cleared).");
//   }
// }
