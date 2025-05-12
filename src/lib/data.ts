import type { User, Professional, Patient, Service, Appointment, AppointmentFormData, ProfessionalFormData, AppointmentStatus, ServiceFormData } from '@/types';
import { LOCATIONS, USER_ROLES, SERVICES as SERVICES_CONSTANTS, APPOINTMENT_STATUS, LocationId, ServiceId as ConstantServiceId, APPOINTMENT_STATUS_DISPLAY, PAYMENT_METHODS, PROFESSIONAL_SPECIALIZATIONS } from './constants';
import { formatISO, parseISO, addDays, subDays, setHours, setMinutes, startOfDay, endOfDay, addMinutes, isSameDay as dateFnsIsSameDay, startOfMonth, endOfMonth } from 'date-fns';

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
    // specializations: i % 2 === 0 ? [PROFESSIONAL_SPECIALIZATIONS[0], PROFESSIONAL_SPECIALIZATIONS[2]] : [PROFESSIONAL_SPECIALIZATIONS[1]],
    // email: `prof${locIndex}${i+1}@example.com`,
    biWeeklyEarnings: Math.floor(Math.random() * 1500) + 300,
  }))
);

let mockPatients: Patient[] = [
  { id: 'pat001', firstName: 'Ana', lastName: 'García', phone: '111222333', email: 'ana.garcia@example.com', preferredProfessionalId: mockProfessionals[0]?.id, notes: 'Paciente regular, prefiere citas por la mañana.', dateOfBirth: '1985-05-15', isDiabetic: false },
  { id: 'pat002', firstName: 'Luis', lastName: 'Martínez', phone: '444555666', email: 'luis.martinez@example.com', notes: 'Primera visita.', dateOfBirth: '1992-11-20', isDiabetic: true },
  { id: 'pat003', firstName: 'Elena', lastName: 'Ruiz', phone: '777888999', email: 'elena.ruiz@example.com', dateOfBirth: '2000-07-01', isDiabetic: false },
  { id: 'pat004', firstName: 'Carlos', lastName: 'Vargas', phone: '222333444', email: 'carlos.vargas@example.com', dateOfBirth: '1970-03-25', isDiabetic: true, notes: "Sensibilidad en el pie izquierdo." },
  { id: 'pat005', firstName: 'Sofía', lastName: 'Chávez', phone: '555666777', email: 'sofia.chavez@example.com', dateOfBirth: '1998-12-05', isDiabetic: false, preferredProfessionalId: mockProfessionals[1]?.id },
];

let mockServices: Service[] = SERVICES_CONSTANTS.map(s_const => ({
  id: s_const.id,
  name: s_const.name,
  defaultDuration: s_const.defaultDuration,
  price: Math.floor(Math.random() * 50) + 50,
}));

let mockAppointments: Appointment[] = []; // Declare mockAppointments here

const today = new Date();
const yesterday = subDays(today, 1);
const twoDaysAgo = subDays(today, 2);
const tomorrow = addDays(today,1);

mockAppointments = [
  {
    id: 'appt001',
    patientId: 'pat001',
    locationId: LOCATIONS[0].id,
    professionalId: mockProfessionals.find(p => p.locationId === LOCATIONS[0].id)?.id || mockProfessionals[0]?.id,
    serviceId: mockServices[0].id,
    appointmentDateTime: formatISO(setHours(setMinutes(yesterday, 0), 10)), // Yesterday 10:00
    durationMinutes: mockServices[0].defaultDuration,
    status: APPOINTMENT_STATUS.COMPLETED,
    amountPaid: mockServices[0].price,
    paymentMethod: PAYMENT_METHODS[0],
    staffNotes: "Tratamiento exitoso, paciente refiere mejoría.",
    attachedPhotos: ["https://picsum.photos/seed/appt001_1/200/200"],
    addedServices: [{ serviceId: mockServices[2].id, price: mockServices[2].price, service: mockServices[2] }],
    createdAt: formatISO(subDays(yesterday,1)), // Created before appointment
    updatedAt: formatISO(yesterday), // Updated at appointment time
  },
  {
    id: 'appt002',
    patientId: 'pat002',
    locationId: LOCATIONS[1].id,
    professionalId: mockProfessionals.find(p => p.locationId === LOCATIONS[1].id)?.id || mockProfessionals[1]?.id,
    serviceId: mockServices[1].id,
    appointmentDateTime: formatISO(setHours(setMinutes(today, 30), 9)), // Today 09:30
    durationMinutes: mockServices[1].defaultDuration,
    status: APPOINTMENT_STATUS.BOOKED,
    bookingObservations: "Paciente refiere dolor agudo.",
    createdAt: formatISO(subDays(today,1)),
    updatedAt: formatISO(subDays(today,1)),
    attachedPhotos: [],
    addedServices: [],
  },
  {
    id: 'appt003',
    patientId: 'pat003',
    locationId: LOCATIONS[0].id,
    professionalId: mockProfessionals.find(p => p.locationId === LOCATIONS[0].id && p.id !== (mockProfessionals.find(pr => pr.locationId === LOCATIONS[0].id)?.id || mockProfessionals[0]?.id))?.id || mockProfessionals[0]?.id,
    serviceId: mockServices[2].id,
    appointmentDateTime: formatISO(setHours(setMinutes(today, 0), 14)), // Today 14:00
    durationMinutes: mockServices[2].defaultDuration,
    status: APPOINTMENT_STATUS.CONFIRMED,
    actualArrivalTime: "13:55",
    createdAt: formatISO(subDays(today,2)),
    updatedAt: formatISO(today), // Updated today when confirmed
    attachedPhotos: ["https://picsum.photos/seed/appt003_1/200/200"],
    addedServices: [],
  },
  {
    id: 'appt004',
    patientId: 'pat004',
    locationId: LOCATIONS[2].id,
    professionalId: mockProfessionals.find(p => p.locationId === LOCATIONS[2].id)?.id || mockProfessionals[2]?.id,
    serviceId: mockServices[3].id,
    appointmentDateTime: formatISO(setHours(setMinutes(twoDaysAgo, 0), 11)), // Two days ago 11:00
    durationMinutes: mockServices[3].defaultDuration,
    status: APPOINTMENT_STATUS.COMPLETED,
    amountPaid: mockServices[3].price,
    paymentMethod: PAYMENT_METHODS[1],
    staffNotes: "Todo en orden. Próxima revisión en 1 mes.",
    createdAt: formatISO(subDays(twoDaysAgo,1)),
    updatedAt: formatISO(twoDaysAgo),
    attachedPhotos: ["https://picsum.photos/seed/appt004_1/200/200", "https://picsum.photos/seed/appt004_2/200/200"],
    addedServices: [],
  },
  {
    id: 'appt005',
    patientId: 'pat005',
    locationId: LOCATIONS[1].id,
    professionalId: mockProfessionals.find(p => p.locationId === LOCATIONS[1].id && p.id !== (mockProfessionals.find(pr => pr.locationId === LOCATIONS[1].id)?.id || mockProfessionals[1]?.id))?.id || mockProfessionals[1]?.id,
    serviceId: mockServices[0].id,
    appointmentDateTime: formatISO(setHours(setMinutes(tomorrow, 0), 16)), // Tomorrow 16:00
    durationMinutes: mockServices[0].defaultDuration,
    status: APPOINTMENT_STATUS.BOOKED,
    createdAt: formatISO(today),
    updatedAt: formatISO(today),
    attachedPhotos: [],
    addedServices: [],
  },
  {
    id: 'appt006',
    patientId: 'pat001',
    locationId: LOCATIONS[0].id,
    professionalId: mockProfessionals.find(p => p.locationId === LOCATIONS[0].id)?.id || mockProfessionals[0]?.id,
    serviceId: mockServices[4].id,
    appointmentDateTime: formatISO(setHours(setMinutes(today, 30), 11)), // Today 11:30
    durationMinutes: mockServices[4].defaultDuration,
    status: APPOINTMENT_STATUS.BOOKED,
    bookingObservations: "Estudio de pisada solicitado por el Dr. Pérez.",
    createdAt: formatISO(today),
    updatedAt: formatISO(today),
    attachedPhotos: [],
    addedServices: [],
  },
  {
    id: 'appt007',
    patientId: 'pat002',
    locationId: LOCATIONS[3].id, // Carpaccio
    professionalId: mockProfessionals.find(p => p.locationId === LOCATIONS[3].id)?.id,
    serviceId: mockServices[0].id,
    appointmentDateTime: formatISO(setHours(setMinutes(subDays(today, 3), 0), 15)), // 3 days ago 15:00
    durationMinutes: mockServices[0].defaultDuration,
    status: APPOINTMENT_STATUS.COMPLETED,
    amountPaid: mockServices[0].price,
    paymentMethod: PAYMENT_METHODS[2],
    staffNotes: "Paciente nuevo, buena primera impresión.",
    createdAt: formatISO(subDays(today, 4)),
    updatedAt: formatISO(subDays(today, 3)),
    attachedPhotos: ["https://picsum.photos/seed/appt007_1/200/200"],
    addedServices: [],
    },
    {
    id: 'appt008',
    patientId: 'pat003',
    locationId: LOCATIONS[4].id, // Vista Alegre
    professionalId: mockProfessionals.find(p => p.locationId === LOCATIONS[4].id)?.id,
    serviceId: mockServices[1].id,
    appointmentDateTime: formatISO(setHours(setMinutes(today, 0), 10)), // Today 10:00
    durationMinutes: mockServices[1].defaultDuration,
    status: APPOINTMENT_STATUS.BOOKED,
    createdAt: formatISO(subDays(today, 1)),
    updatedAt: formatISO(subDays(today, 1)),
    attachedPhotos: [],
    addedServices: [],
    },
    {
    id: 'appt009',
    patientId: 'pat004',
    locationId: LOCATIONS[5].id, // San Antonio
    professionalId: mockProfessionals.find(p => p.locationId === LOCATIONS[5].id)?.id,
    serviceId: mockServices[2].id,
    appointmentDateTime: formatISO(setHours(setMinutes(subDays(today, 5), 30), 14)), // 5 days ago 14:30
    durationMinutes: mockServices[2].defaultDuration,
    status: APPOINTMENT_STATUS.COMPLETED,
    amountPaid: mockServices[2].price ? mockServices[2].price + 20 : 70, // Example of added service cost
    paymentMethod: PAYMENT_METHODS[3],
    staffNotes: "Se realizó quiropodia y tratamiento adicional para uña encarnada.",
    addedServices: [{ serviceId: mockServices[1].id, price: 20, service: mockServices[1] }],
    attachedPhotos: ["https://picsum.photos/seed/appt009_1/200/200"],
    createdAt: formatISO(subDays(today, 6)),
    updatedAt: formatISO(subDays(today, 5)),
    },
    {
    id: 'appt010',
    patientId: 'pat005',
    locationId: LOCATIONS[0].id, // Higuereta
    serviceId: mockServices[3].id,
    appointmentDateTime: formatISO(setHours(setMinutes(addDays(today, 2), 0), 17)), // In 2 days 17:00
    durationMinutes: mockServices[3].defaultDuration,
    status: APPOINTMENT_STATUS.BOOKED,
    preferredProfessionalId: mockProfessionals.find(p => p.locationId === LOCATIONS[0].id && p.lastName.includes('Higuereta'))?.id, // Prefers a prof from Higuereta
    bookingObservations: "Solo puede por la tarde.",
    createdAt: formatISO(today),
    updatedAt: formatISO(today),
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
    firstName: data.firstName,
    lastName: data.lastName,
    locationId: data.locationId,
    phone: data.phone,
    // specializations: data.specializations,
    // email: data.email,
    biWeeklyEarnings: 0, // Initial value
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
export const getPatients = async (options: { page?: number, limit?: number, searchTerm?: string, filterToday?: boolean, adminSelectedLocation?: LocationId | 'all', user?: User | null } = {}): Promise<{patients: Patient[], totalCount: number}> => {
  const { page = 1, limit = 8, searchTerm, filterToday, adminSelectedLocation, user } = options;
  let filteredPatients = [...mockPatients];

  if (searchTerm) {
    const lowerSearchTerm = searchTerm.toLowerCase();
    filteredPatients = filteredPatients.filter(p =>
      `${p.firstName} ${p.lastName}`.toLowerCase().includes(lowerSearchTerm) ||
      (p.phone && p.phone.includes(searchTerm)) ||
      (p.email && p.email.toLowerCase().includes(lowerSearchTerm))
    );
  }
  
  if (filterToday && user) {
    const todayIsoDate = startOfDay(new Date());
    const isAdminOrContador = user.role === USER_ROLES.ADMIN || user.role === USER_ROLES.CONTADOR;
    const effectiveLocationId = isAdminOrContador
       ? (adminSelectedLocation === 'all' ? undefined : adminSelectedLocation)
       : user.locationId;

    const dailyAppointments = mockAppointments.filter(appt =>
      dateFnsIsSameDay(parseISO(appt.appointmentDateTime), todayIsoDate) &&
      (effectiveLocationId ? appt.locationId === effectiveLocationId : true)
    );
    const patientIdsWithAppointmentsToday = new Set(dailyAppointments.map(app => app.patientId));
    filteredPatients = filteredPatients.filter(p => patientIdsWithAppointmentsToday.has(p.id));
  }
  
  filteredPatients.sort((a,b) => `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`));

  const totalCount = filteredPatients.length;
  const startIndex = (page - 1) * limit;
  const paginatedPatients = filteredPatients.slice(startIndex, startIndex + limit);
  
  return { patients: paginatedPatients, totalCount };
};

export const getPatientById = async (id: string): Promise<Patient | undefined> => {
  return mockPatients.find(p => p.id === id);
};

export const findPatient = async (firstName: string, lastName: string): Promise<Patient | undefined> => {
  return mockPatients.find(p => p.firstName.toLowerCase() === firstName.toLowerCase() && p.lastName.toLowerCase() === lastName.toLowerCase());
}

export const addPatient = async (data: Omit<Patient, 'id'>): Promise<Patient> => {
  const newPatient: Patient = {
    id: generateId(),
    ...data,
    isDiabetic: data.isDiabetic || false, // Ensure default
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
}): Promise<{ appointments: Appointment[], totalCount: number }> => {
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
    professional: appt.professionalId ? mockProfessionals.find(prof => prof.id === appt.professionalId) : undefined,
    service: mockServices.find(s => s.id === appt.serviceId),
    addedServices: appt.addedServices?.map(as => ({
      ...as,
      service: mockServices.find(s => s.id === as.serviceId),
      professional: as.professionalId ? mockProfessionals.find(p => p.id === as.professionalId) : undefined,
    }))
  }));

  const totalCount = populatedAppointments.length;
  const page = filters.page || 1;
  const limit = filters.limit || (isFetchingPastStatuses ? 8 : Infinity); 
  const startIndex = (page - 1) * limit;
  const paginatedAppointments = populatedAppointments.slice(startIndex, startIndex + limit);

  return { appointments: paginatedAppointments, totalCount };
};

export const getAppointmentById = async (id: string): Promise<Appointment | undefined> => {
  const appt = mockAppointments.find(a => a.id === id);
  if (appt) {
    return {
      ...appt,
      patient: mockPatients.find(p => p.id === appt.patientId),
      professional: appt.professionalId ? mockProfessionals.find(prof => prof.id === appt.professionalId) : undefined,
      service: mockServices.find(s => s.id === appt.serviceId),
      addedServices: appt.addedServices?.map(as => ({
        ...as,
        service: mockServices.find(s => s.id === as.serviceId),
        professional: as.professionalId ? mockProfessionals.find(p => p.id === as.professionalId) : undefined,
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
  return getAppointmentById(newAppointment.id) as Promise<Appointment>; 
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
    mockAppointments[index] = updatedAppointment as Appointment; // This might be problematic if updatedAppointment doesn't match Appointment structure due to partials
    return getAppointmentById(id);
  }
  return undefined;
};

export const getPatientAppointmentHistory = async (
  patientId: string,
  options: { page?: number, limit?: number } = {}
): Promise<{ appointments: Appointment[], totalCount: number }> => {
  const todayDate = startOfDay(new Date());
  const historyAppointments = mockAppointments.filter(appt =>
    appt.patientId === patientId &&
    parseISO(appt.appointmentDateTime) < todayDate &&
    [APPOINTMENT_STATUS.COMPLETED, APPOINTMENT_STATUS.NO_SHOW, APPOINTMENT_STATUS.CANCELLED_CLIENT, APPOINTMENT_STATUS.CANCELLED_STAFF].includes(appt.status)
  ).sort((a, b) => parseISO(b.appointmentDateTime).getTime() - parseISO(a.appointmentDateTime).getTime());

  const populatedHistory = historyAppointments.map(appt => ({
    ...appt,
    patient: mockPatients.find(p => p.id === appt.patientId),
    professional: appt.professionalId ? mockProfessionals.find(prof => prof.id === appt.professionalId) : undefined,
    service: mockServices.find(s => s.id === appt.serviceId),
     addedServices: appt.addedServices?.map(as => ({
        ...as,
        service: mockServices.find(s => s.id === as.serviceId),
        professional: as.professionalId ? mockProfessionals.find(p => p.id === as.professionalId) : undefined,
    }))
  }));
  
  const totalCount = populatedHistory.length;
  const page = options.page || 1;
  const limit = options.limit || 8;
  const startIndex = (page - 1) * limit;
  const paginatedAppointments = populatedHistory.slice(startIndex, startIndex + limit);

  return { appointments: paginatedAppointments, totalCount };
};


export const seedInitialData = async () => {
  console.log("Mock data is initialized via direct array definitions.");
};

