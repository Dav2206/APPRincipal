
import type { User, Professional, Patient, Service, Appointment, AppointmentFormData, ProfessionalFormData, AppointmentStatus, ServiceFormData } from '@/types';
import { LOCATIONS, USER_ROLES, SERVICES as SERVICES_CONSTANTS, APPOINTMENT_STATUS, LocationId, ServiceId as ConstantServiceId, APPOINTMENT_STATUS_DISPLAY, PAYMENT_METHODS } from './constants';
import { formatISO, parseISO, addDays, subDays, setHours, setMinutes, startOfDay, endOfDay, addMinutes, isSameDay as dateFnsIsSameDay, startOfMonth, endOfMonth, differenceInYears } from 'date-fns';
// import { firestore } from './firebase-config'; // Firebase setup - Corrected import path
// import { collection, addDoc, getDocs, doc, getDoc, updateDoc, query, where, deleteDoc, writeBatch, serverTimestamp, Timestamp, runTransaction, setDoc, QueryConstraint, orderBy, limit, startAfter,getCountFromServer, CollectionReference, DocumentData, documentId } from 'firebase/firestore';

// --- Helper to convert Firestore Timestamps to ISO strings and vice-versa ---
// const fromTimestampToISO = (timestamp: Timestamp | undefined): string | undefined => {
//   return timestamp?.toDate().toISOString();
// }
// const fromDateToTimestamp = (date: Date | string | undefined): Timestamp | undefined => {
//   if (!date) return undefined;
//   return Timestamp.fromDate(typeof date === 'string' ? parseISO(date) : date);
// }

const ANY_PROFESSIONAL_VALUE = "_any_professional_placeholder_";

// --- Mock Data Storage (Used if firestore is not available or useMockDatabase is true) ---
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
  { id: 'pat001', firstName: 'Ana', lastName: 'García', phone: '111222333', preferredProfessionalId: mockProfessionals[0]?.id, notes: 'Paciente regular, prefiere citas por la mañana.', dateOfBirth: '1985-05-15', isDiabetic: false },
  { id: 'pat002', firstName: 'Luis', lastName: 'Martínez', phone: '444555666', notes: 'Primera visita.', dateOfBirth: '1992-11-20', isDiabetic: true },
  { id: 'pat003', firstName: 'Elena', lastName: 'Ruiz', phone: '777888999', dateOfBirth: '2000-07-01', isDiabetic: false },
  { id: 'pat004', firstName: 'Carlos', lastName: 'Vargas', phone: '222333444', dateOfBirth: '1970-03-25', isDiabetic: true, notes: "Sensibilidad en el pie izquierdo." },
  { id: 'pat005', firstName: 'Sofía', lastName: 'Chávez', phone: '555666777', dateOfBirth: '1998-12-05', isDiabetic: false, preferredProfessionalId: mockProfessionals[1]?.id },
];


let mockServices: Service[] = SERVICES_CONSTANTS.map(s_const => ({
  id: s_const.id as string,
  name: s_const.name,
  defaultDuration: s_const.defaultDuration,
  price: Math.floor(Math.random() * 50) + 50,
}));

const today = new Date();
const yesterday = subDays(today, 1);
const twoDaysAgo = subDays(today, 2);
const tomorrow = addDays(today,1);
const fixedFutureDateForRegistry = new Date(2025, 4, 9); // May 9, 2025 (Month is 0-indexed)


const initialMockAppointments: Appointment[] = [
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
    appointmentDateTime: formatISO(setHours(setMinutes(startOfDay(today), 30), 9)), // Today 09:30
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
    appointmentDateTime: formatISO(setHours(setMinutes(startOfDay(today), 0), 14)), // Today 14:00
    durationMinutes: mockServices[2].defaultDuration,
    status: APPOINTMENT_STATUS.CONFIRMED,
    actualArrivalTime: "13:55",
    createdAt: formatISO(subDays(today,2)),
    updatedAt: formatISO(startOfDay(today)), // Updated today when confirmed
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
    professionalId: null,
    serviceId: mockServices[0].id,
    appointmentDateTime: formatISO(setHours(setMinutes(startOfDay(tomorrow), 0), 16)), // Tomorrow 16:00
    durationMinutes: mockServices[0].defaultDuration,
    status: APPOINTMENT_STATUS.BOOKED,
    createdAt: formatISO(startOfDay(today)),
    updatedAt: formatISO(startOfDay(today)),
    attachedPhotos: [],
    addedServices: [],
  },
  {
    id: 'appt006',
    patientId: 'pat001',
    locationId: LOCATIONS[0].id,
    professionalId: mockProfessionals.find(p => p.locationId === LOCATIONS[0].id)?.id || mockProfessionals[0]?.id,
    serviceId: mockServices[4].id,
    appointmentDateTime: formatISO(setHours(setMinutes(startOfDay(today), 30), 11)), // Today 11:30
    durationMinutes: mockServices[4].defaultDuration,
    status: APPOINTMENT_STATUS.BOOKED,
    bookingObservations: "Estudio de pisada solicitado por el Dr. Pérez.",
    createdAt: formatISO(startOfDay(today)),
    updatedAt: formatISO(startOfDay(today)),
    attachedPhotos: [],
    addedServices: [],
  },
  {
    id: 'appt007',
    patientId: 'pat002',
    locationId: LOCATIONS[3].id,
    professionalId: mockProfessionals.find(p => p.locationId === LOCATIONS[3].id)?.id,
    serviceId: mockServices[0].id,
    appointmentDateTime: formatISO(setHours(setMinutes(subDays(startOfDay(today), 3), 0), 15)),
    durationMinutes: mockServices[0].defaultDuration,
    status: APPOINTMENT_STATUS.COMPLETED,
    amountPaid: mockServices[0].price,
    paymentMethod: PAYMENT_METHODS[2],
    staffNotes: "Paciente nuevo, buena primera impresión.",
    createdAt: formatISO(subDays(startOfDay(today), 4)),
    updatedAt: formatISO(subDays(startOfDay(today), 3)),
    attachedPhotos: ["https://picsum.photos/seed/appt007_1/200/200"],
    addedServices: [],
    },
    {
    id: 'appt008',
    patientId: 'pat003',
    locationId: LOCATIONS[4].id,
    professionalId: mockProfessionals.find(p => p.locationId === LOCATIONS[4].id)?.id,
    serviceId: mockServices[1].id,
    appointmentDateTime: formatISO(setHours(setMinutes(startOfDay(today), 0), 10)),
    durationMinutes: mockServices[1].defaultDuration,
    status: APPOINTMENT_STATUS.BOOKED,
    createdAt: formatISO(subDays(startOfDay(today), 1)),
    updatedAt: formatISO(subDays(startOfDay(today), 1)),
    attachedPhotos: [],
    addedServices: [],
    },
    {
    id: 'appt009',
    patientId: 'pat004',
    locationId: LOCATIONS[5].id,
    professionalId: mockProfessionals.find(p => p.locationId === LOCATIONS[5].id)?.id,
    serviceId: mockServices[2].id,
    appointmentDateTime: formatISO(setHours(setMinutes(subDays(startOfDay(today), 5), 30), 14)),
    durationMinutes: mockServices[2].defaultDuration,
    status: APPOINTMENT_STATUS.COMPLETED,
    amountPaid: mockServices[2].price ? mockServices[2].price + 20 : 70,
    paymentMethod: PAYMENT_METHODS[3],
    staffNotes: "Se realizó quiropodia y tratamiento adicional para uña encarnada.",
    addedServices: [{ serviceId: mockServices[1].id, price: 20, service: mockServices[1] }],
    attachedPhotos: ["https://picsum.photos/seed/appt009_1/200/200"],
    createdAt: formatISO(subDays(startOfDay(today), 6)),
    updatedAt: formatISO(subDays(startOfDay(today), 5)),
    },
    {
    id: 'appt010',
    patientId: 'pat005',
    locationId: LOCATIONS[0].id,
    serviceId: mockServices[3].id,
    appointmentDateTime: formatISO(setHours(setMinutes(addDays(startOfDay(today), 2), 0), 17)),
    durationMinutes: mockServices[3].defaultDuration,
    status: APPOINTMENT_STATUS.BOOKED,
    preferredProfessionalId: mockProfessionals.find(p => p.locationId === LOCATIONS[0].id && p.lastName.includes('Higuereta'))?.id,
    bookingObservations: "Solo puede por la tarde.",
    createdAt: formatISO(startOfDay(today)),
    updatedAt: formatISO(startOfDay(today)),
    attachedPhotos: [],
    addedServices: [],
  },
  {
    id: 'appt_registry_test_1',
    patientId: mockPatients[0].id,
    locationId: LOCATIONS[0].id,
    professionalId: mockProfessionals.find(p => p.locationId === LOCATIONS[0].id && p.firstName === 'Profesional 1')?.id,
    serviceId: mockServices[0].id,
    appointmentDateTime: formatISO(setHours(setMinutes(fixedFutureDateForRegistry, 0), 10)),
    durationMinutes: mockServices[0].defaultDuration,
    status: APPOINTMENT_STATUS.COMPLETED,
    amountPaid: mockServices[0].price,
    paymentMethod: PAYMENT_METHODS[0],
    createdAt: formatISO(fixedFutureDateForRegistry),
    updatedAt: formatISO(fixedFutureDateForRegistry),
    addedServices: [],
    attachedPhotos: []
  },
  {
    id: 'appt_registry_test_2',
    patientId: mockPatients[1].id,
    locationId: LOCATIONS[1].id,
    professionalId: mockProfessionals.find(p => p.locationId === LOCATIONS[1].id && p.firstName === 'Profesional 1')?.id,
    serviceId: mockServices[1].id,
    appointmentDateTime: formatISO(setHours(setMinutes(fixedFutureDateForRegistry, 30), 11)),
    durationMinutes: mockServices[1].defaultDuration,
    status: APPOINTMENT_STATUS.COMPLETED,
    amountPaid: mockServices[1].price,
    paymentMethod: PAYMENT_METHODS[1],
    createdAt: formatISO(fixedFutureDateForRegistry),
    updatedAt: formatISO(fixedFutureDateForRegistry),
    addedServices: [],
    attachedPhotos: []
  },
   {
    id: 'appt_registry_test_3',
    patientId: mockPatients[2].id,
    locationId: LOCATIONS[0].id,
    professionalId: mockProfessionals.find(p => p.locationId === LOCATIONS[0].id && p.firstName === 'Profesional 2')?.id,
    serviceId: mockServices[2].id,
    appointmentDateTime: formatISO(setHours(setMinutes(fixedFutureDateForRegistry, 0), 14)),
    durationMinutes: mockServices[2].defaultDuration,
    status: APPOINTMENT_STATUS.COMPLETED,
    amountPaid: mockServices[2].price,
    paymentMethod: PAYMENT_METHODS[2],
    createdAt: formatISO(fixedFutureDateForRegistry),
    updatedAt: formatISO(fixedFutureDateForRegistry),
    addedServices: [],
    attachedPhotos: []
  }
];

let mockAppointments: Appointment[] = Array.isArray(global.mockAppointments) ? global.mockAppointments : [...initialMockAppointments];
if (typeof global.mockAppointments === 'undefined') {
  global.mockAppointments = mockAppointments;
}


const useMockDatabase = true; // FORCE MOCK DATABASE
const firestore = undefined; // Explicitly set to undefined when using mock

const generateId = (): string => {
  return Math.random().toString(36).substr(2, 9);
};


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
  const newProfessionalData: Omit<Professional, 'id' | 'biWeeklyEarnings'> = {
    firstName: data.firstName,
    lastName: data.lastName,
    locationId: data.locationId,
    phone: data.phone,
  };

  const newProfessional: Professional = {
    id: generateId(),
    ...newProfessionalData,
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
const PATIENTS_PER_PAGE = 8;
export const getPatients = async (options: { page?: number, limit?: number, searchTerm?: string, filterToday?: boolean, adminSelectedLocation?: LocationId | 'all', user?: User | null, lastVisiblePatientId?: string | null } = {}): Promise<{patients: Patient[], totalCount: number, lastVisiblePatientId?: string | null}> => {
  const { page = 1, limit: queryLimit = PATIENTS_PER_PAGE, searchTerm, filterToday, adminSelectedLocation, user, lastVisiblePatientId } = options;

  try {
    let filteredMockPatients = [...mockPatients];
    if (searchTerm) {
        const lowerSearchTerm = searchTerm.toLowerCase();
        filteredMockPatients = filteredMockPatients.filter(p =>
        `${p.firstName} ${p.lastName}`.toLowerCase().includes(lowerSearchTerm) ||
        (p.phone && p.phone.includes(searchTerm))
        );
    }
    if (filterToday && user) {
        const todayIsoDate = startOfDay(new Date());
        const isAdminOrContador = user.role === USER_ROLES.ADMIN || user.role === USER_ROLES.CONTADOR;
        const effectiveLocationId = isAdminOrContador
        ? (adminSelectedLocation === 'all' ? undefined : adminSelectedLocation)
        : user.locationId;

        const dailyAppointments = (mockAppointments || []).filter(appt =>
          appt.appointmentDateTime && dateFnsIsSameDay(parseISO(appt.appointmentDateTime), todayIsoDate) &&
          (effectiveLocationId ? appt.locationId === effectiveLocationId : true)
        );
        const patientIdsWithAppointmentsToday = new Set(dailyAppointments.map(app => app.patientId));
        filteredMockPatients = filteredMockPatients.filter(p => patientIdsWithAppointmentsToday.has(p.id));
    }
    filteredMockPatients.sort((a,b) => `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`));
    const totalCount = filteredMockPatients.length;
    const startIndex = (page - 1) * queryLimit;
    const paginatedPatients = filteredMockPatients.slice(startIndex, startIndex + queryLimit);
    const newLastVisibleId = paginatedPatients.length > 0 ? paginatedPatients[paginatedPatients.length - 1].id : null;

    return { patients: paginatedPatients, totalCount, lastVisiblePatientId: newLastVisibleId };
  } catch (error) {
    console.error("Error in getPatients:", error);
    return { patients: [], totalCount: 0, lastVisiblePatientId: null };
  }
};


export const getPatientById = async (id: string): Promise<Patient | undefined> => {
    return mockPatients.find(p => p.id === id);
};

export const findPatient = async (firstName: string, lastName: string): Promise<Patient | undefined> => {
    return mockPatients.find(p => p.firstName.toLowerCase() === firstName.toLowerCase() && p.lastName.toLowerCase() === lastName.toLowerCase());
};

export const addPatient = async (data: Omit<Patient, 'id'>): Promise<Patient> => {
  const newPatientData: Omit<Patient, 'id'> = {
    ...data,
    isDiabetic: data.isDiabetic || false,
  };

  const newPatient: Patient = {
    id: generateId(),
    ...newPatientData,
  };
  mockPatients.push(newPatient);
  return newPatient;
};

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
};

export const addService = async (data: ServiceFormData): Promise<Service> => {
  const newServiceData: Omit<Service, 'id'> = {
    name: data.name,
    defaultDuration: data.defaultDuration,
    price: data.price,
  };
  const newService: Service = {
    id: data.id || generateId(),
    ...newServiceData,
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


const populateAppointment = async (apptData: Appointment): Promise<Appointment> => {
    const patient = await getPatientById(apptData.patientId);
    const professional = apptData.professionalId ? await getProfessionalById(apptData.professionalId) : undefined;
    const service = apptData.serviceId ? await getServiceById(apptData.serviceId as string) : undefined;

    let addedServicesPopulated = [];
    if (apptData.addedServices && Array.isArray(apptData.addedServices)) {
        addedServicesPopulated = await Promise.all(
            apptData.addedServices.map(async (as: any) => ({
                ...as,
                service: as.serviceId ? await getServiceById(as.serviceId as string) : undefined,
                professional: as.professionalId ? await getProfessionalById(as.professionalId) : undefined,
            }))
        );
    }
    
    return {
        ...apptData,
        patient,
        professional,
        service,
        addedServices: addedServicesPopulated,
    };
};


// --- Appointments ---
const APPOINTMENTS_PER_PAGE = 8;
export const getAppointments = async (filters: {
  locationId?: LocationId | LocationId[] | undefined;
  date?: Date;
  dateRange?: { start: Date; end: Date };
  statuses?: AppointmentStatus | AppointmentStatus[];
  patientId?: string;
  professionalId?: string;
  page?: number;
  limit?: number;
  lastVisibleAppointmentId?: string | null;
}): Promise<{ appointments: Appointment[], totalCount: number, lastVisibleAppointmentId?: string | null }> => {
  try {
    const { page = 1, limit: queryLimit = APPOINTMENTS_PER_PAGE, lastVisibleAppointmentId, ...restFilters } = filters;

    let currentMockAppointments = mockAppointments || [];
    let filteredMockAppointments = [...currentMockAppointments];

    if (restFilters.locationId) {
        const locationsToFilter = Array.isArray(restFilters.locationId) ? restFilters.locationId : [restFilters.locationId];
        if (locationsToFilter.length > 0 && locationsToFilter[0] !== undefined) { 
            filteredMockAppointments = filteredMockAppointments.filter(appt => locationsToFilter.includes(appt.locationId));
        }
    }
    if (restFilters.patientId) {
        filteredMockAppointments = filteredMockAppointments.filter(appt => appt.patientId === restFilters.patientId);
    }
    if (restFilters.professionalId) {
        filteredMockAppointments = filteredMockAppointments.filter(appt => appt.professionalId === restFilters.professionalId);
    }
    if (restFilters.date) {
      const targetDate = startOfDay(restFilters.date);
      filteredMockAppointments = filteredMockAppointments.filter(appt => {
          if (!appt.appointmentDateTime || typeof appt.appointmentDateTime !== 'string') return false;
          try {
              return dateFnsIsSameDay(parseISO(appt.appointmentDateTime), targetDate);
          } catch (e) { return false; }
      });
    }
    if (restFilters.dateRange) {
        const start = startOfDay(restFilters.dateRange.start);
        const end = endOfDay(restFilters.dateRange.end);
        filteredMockAppointments = filteredMockAppointments.filter(appt => {
            if (!appt.appointmentDateTime || typeof appt.appointmentDateTime !== 'string') return false;
            try {
                const apptDate = parseISO(appt.appointmentDateTime);
                return apptDate >= start && apptDate <= end;
            } catch (e) { return false; }
        });
    }
    if (restFilters.statuses) {
        const statusesToFilter = Array.isArray(restFilters.statuses) ? restFilters.statuses : [restFilters.statuses];
        if (statusesToFilter.length > 0) {
            filteredMockAppointments = filteredMockAppointments.filter(appt => statusesToFilter.includes(appt.status));
        }
    }
    
    const isFetchingPastStatuses = restFilters.statuses && (
        (Array.isArray(restFilters.statuses) && restFilters.statuses.some(s => [APPOINTMENT_STATUS.COMPLETED, APPOINTMENT_STATUS.CANCELLED_CLIENT, APPOINTMENT_STATUS.CANCELLED_STAFF, APPOINTMENT_STATUS.NO_SHOW].includes(s))) ||
        (typeof restFilters.statuses === 'string' && [APPOINTMENT_STATUS.COMPLETED, APPOINTMENT_STATUS.CANCELLED_CLIENT, APPOINTMENT_STATUS.CANCELLED_STAFF, APPOINTMENT_STATUS.NO_SHOW].includes(restFilters.statuses as string))
    );

    filteredMockAppointments.sort((a, b) => {
        const dateA = parseISO(a.appointmentDateTime).getTime();
        const dateB = parseISO(b.appointmentDateTime).getTime();
        return isFetchingPastStatuses ? dateB - dateA : dateA - dateB;
    });

    const populatedAppointmentsPromises = filteredMockAppointments.map(appt => populateAppointment(appt));
    const populatedAppointments = await Promise.all(populatedAppointmentsPromises);
    
    const totalCount = populatedAppointments.length;
    const startIndex = (page - 1) * queryLimit;
    const paginatedAppointments = populatedAppointments.slice(startIndex, startIndex + queryLimit);
    const newLastVisibleId = paginatedAppointments.length > 0 ? paginatedAppointments[paginatedAppointments.length -1].id : null;
    return { appointments: paginatedAppointments, totalCount, lastVisibleAppointmentId: newLastVisibleId };
  } catch (error) {
    console.error("Error in getAppointments:", error);
    return { appointments: [], totalCount: 0, lastVisibleAppointmentId: null };
  }
};


export const getAppointmentById = async (id: string): Promise<Appointment | undefined> => {
    const appt = mockAppointments.find(a => a.id === id);
    if (appt) {
      return populateAppointment(appt);
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
        dateOfBirth: data.patientDateOfBirth,
        isDiabetic: data.isDiabetic || false,
        notes: '', 
        preferredProfessionalId: undefined, 
      });
      patientId = newPatient.id;
    }
  } else {
      const existingPatientDetails = await getPatientById(patientId);
      if (existingPatientDetails && data.isDiabetic !== undefined && data.isDiabetic !== existingPatientDetails.isDiabetic) {
        await updatePatient(patientId, { isDiabetic: data.isDiabetic });
      }
  }

  const service = await getServiceById(data.serviceId as string);
  const appointmentDateHours = parseInt(data.appointmentTime.split(':')[0]);
  const appointmentDateMinutes = parseInt(data.appointmentTime.split(':')[1]);
  
  let actualProfessionalId: string | undefined | null = undefined;
  if (data.preferredProfessionalId && data.preferredProfessionalId !== ANY_PROFESSIONAL_VALUE) {
    const preferredProf = mockProfessionals.find(p => p.id === data.preferredProfessionalId && p.locationId === data.locationId);
    if (preferredProf) {
      actualProfessionalId = preferredProf.id;
    } else {
      console.warn(`Preferred professional ${data.preferredProfessionalId} not found or not in location ${data.locationId}. Appointment will be unassigned.`);
      actualProfessionalId = null;
    }
  } else {
    actualProfessionalId = null;
  }

  const newAppointmentData: Omit<Appointment, 'id' | 'createdAt' | 'updatedAt' | 'patient' | 'service' | 'professional'> = {
    patientId: patientId!,
    locationId: data.locationId,
    serviceId: data.serviceId,
    professionalId: actualProfessionalId,
    appointmentDateTime: formatISO(setMinutes(setHours(data.appointmentDate, appointmentDateHours), appointmentDateMinutes)),
    durationMinutes: service?.defaultDuration || 60,
    preferredProfessionalId: data.preferredProfessionalId === ANY_PROFESSIONAL_VALUE ? undefined : data.preferredProfessionalId,
    bookingObservations: data.bookingObservations,
    status: APPOINTMENT_STATUS.BOOKED,
    attachedPhotos: [],
    addedServices: [],
  };

  const newAppointment: Appointment = {
    id: generateId(),
    ...newAppointmentData,
    createdAt: formatISO(new Date()),
    updatedAt: formatISO(new Date()),
    patient: await getPatientById(patientId!), 
    service: service, 
    professional: actualProfessionalId ? await getProfessionalById(actualProfessionalId) : undefined,
  };
  mockAppointments.push(newAppointment);
  global.mockAppointments = mockAppointments; // Update global mock data
  return newAppointment;
};

export const updateAppointment = async (id: string, data: Partial<Appointment>): Promise<Appointment | undefined> => {
  const index = mockAppointments.findIndex(a => a.id === id);
  if (index !== -1) {
    mockAppointments[index] = {
      ...mockAppointments[index],
      ...data, 
      updatedAt: formatISO(new Date()),
    };
    
    const updatedMockEntry = mockAppointments[index];
    const fullyPopulatedAppointment = await populateAppointment(updatedMockEntry);
    
    mockAppointments[index] = fullyPopulatedAppointment;
    global.mockAppointments = mockAppointments; // Update global mock data
    
    return fullyPopulatedAppointment;
  }
  return undefined;
};


export const getPatientAppointmentHistory = async (
  patientId: string,
  options: { page?: number, limit?: number, lastVisibleAppointmentId?: string | null } = {}
): Promise<{ appointments: Appointment[], totalCount: number, lastVisibleAppointmentId?: string | null }> => {
  try {
    const { page = 1, limit: queryLimit = APPOINTMENTS_PER_PAGE, lastVisibleAppointmentId } = options;

    const todayDate = startOfDay(new Date());
    const historyAppointments = (mockAppointments || []).filter(appt =>
      appt.patientId === patientId &&
      appt.appointmentDateTime && parseISO(appt.appointmentDateTime) < todayDate &&
      [APPOINTMENT_STATUS.COMPLETED, APPOINTMENT_STATUS.NO_SHOW, APPOINTMENT_STATUS.CANCELLED_CLIENT, APPOINTMENT_STATUS.CANCELLED_STAFF].includes(appt.status)
    ).sort((a, b) => parseISO(b.appointmentDateTime).getTime() - parseISO(a.appointmentDateTime).getTime());

    const populatedHistoryPromises = historyAppointments.map(appt => populateAppointment(appt));
    const populatedHistory = await Promise.all(populatedHistoryPromises);
    
    const totalCount = populatedHistory.length;
    const startIndex = (page - 1) * queryLimit;
    const paginatedAppointments = populatedHistory.slice(startIndex, startIndex + queryLimit);
    const newLastVisibleId = paginatedAppointments.length > 0 ? paginatedAppointments[paginatedAppointments.length -1].id : null;
    return { appointments: paginatedAppointments, totalCount, lastVisibleAppointmentId: newLastVisibleId };
  } catch (error) {
    console.error("Error in getPatientAppointmentHistory:", error);
    return { appointments: [], totalCount: 0, lastVisibleAppointmentId: null };
  }
};

if (typeof global !== 'undefined') {
  (global as any).mockAppointments = mockAppointments;
}
