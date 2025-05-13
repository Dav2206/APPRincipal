
// src/lib/data.ts
import type { User, Professional, Patient, Service, Appointment, AppointmentFormData, ProfessionalFormData, AppointmentStatus, ServiceFormData } from '@/types';
import { LOCATIONS, USER_ROLES, SERVICES as SERVICES_CONSTANTS, APPOINTMENT_STATUS, LocationId, ServiceId as ConstantServiceId, APPOINTMENT_STATUS_DISPLAY, PAYMENT_METHODS } from './constants';
import { formatISO, parseISO, addDays, setHours, setMinutes, startOfDay, endOfDay, addMinutes, isSameDay as dateFnsIsSameDay, startOfMonth, endOfMonth, differenceInYears, subDays, isEqual, isBefore, isAfter, getDate, getYear, getMonth, setMonth, setYear } from 'date-fns';

const ANY_PROFESSIONAL_VALUE = "_any_professional_placeholder_";

// --- Mock Data Configuration ---
export const useMockDatabase = true; 


// --- Initial Mock Data Definitions ---
const initialMockUsersData: User[] = [
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

const initialMockProfessionalsData: Professional[] = LOCATIONS.flatMap((location, locIndex) =>
  Array.from({ length: 2 }, (_, i) => ({
    id: `prof-${location.id}-${i + 1}`,
    firstName: `Profesional ${i + 1}`,
    lastName: location.name.split(' ')[0],
    locationId: location.id,
    phone: `9876543${locIndex}${i + 1}`,
  }))
);

const initialMockPatientsData: Patient[] = [
  { id: 'pat001', firstName: 'Ana', lastName: 'García', phone: '111222333', age: 39, dateOfBirth: '15-05', preferredProfessionalId: initialMockProfessionalsData[0]?.id, notes: 'Paciente regular, prefiere citas por la mañana.', isDiabetic: false },
  { id: 'pat002', firstName: 'Luis', lastName: 'Martínez', phone: '444555666', age: 31, dateOfBirth: '20-11', notes: 'Primera visita.', isDiabetic: true },
  { id: 'pat003', firstName: 'Elena', lastName: 'Ruiz', phone: '777888999', age: 23, dateOfBirth: '01-07', isDiabetic: false },
  { id: 'pat004', firstName: 'Carlos', lastName: 'Vargas', phone: '222333444', age: 54, dateOfBirth: '25-03', isDiabetic: true, notes: "Sensibilidad en el pie izquierdo." },
  { id: 'pat005', firstName: 'Sofía', lastName: 'Chávez', phone: '555666777', age: 25, dateOfBirth: '05-12', isDiabetic: false, preferredProfessionalId: initialMockProfessionalsData[1]?.id },
];

const initialMockServicesData: Service[] = SERVICES_CONSTANTS.map((s_const, index) => ({
  id: s_const.id as string,
  name: s_const.name,
  defaultDuration: s_const.defaultDuration,
  price: (50 + index * 10), 
}));

const today = new Date();
const yesterday = subDays(today, 1);
const twoDaysAgo = subDays(today, 2);
const tomorrow = addDays(today,1);
const fixedFutureDateForRegistry = new Date(2025, 4, 9); 

const initialMockAppointmentsData: Appointment[] = [
  {
    id: 'appt001', patientId: 'pat001', locationId: LOCATIONS[0].id, professionalId: initialMockProfessionalsData.find(p => p.locationId === LOCATIONS[0].id)?.id || initialMockProfessionalsData[0]?.id, serviceId: initialMockServicesData[0].id, appointmentDateTime: formatISO(setHours(setMinutes(yesterday, 0), 10)), durationMinutes: initialMockServicesData[0].defaultDuration, status: APPOINTMENT_STATUS.COMPLETED, amountPaid: initialMockServicesData[0].price, paymentMethod: PAYMENT_METHODS[0], staffNotes: "Tratamiento exitoso, paciente refiere mejoría.", attachedPhotos: ["https://picsum.photos/seed/appt001_1/200/200"], addedServices: [{ serviceId: initialMockServicesData[2].id, price: initialMockServicesData[2].price, service: initialMockServicesData[2] }], createdAt: formatISO(subDays(yesterday,1)), updatedAt: formatISO(yesterday),
  },
  {
    id: 'appt002', patientId: 'pat002', locationId: LOCATIONS[1].id, professionalId: initialMockProfessionalsData.find(p => p.locationId === LOCATIONS[1].id)?.id || initialMockProfessionalsData[1]?.id, serviceId: initialMockServicesData[1].id, appointmentDateTime: formatISO(setHours(setMinutes(startOfDay(today), 30), 9)), durationMinutes: initialMockServicesData[1].defaultDuration, status: APPOINTMENT_STATUS.BOOKED, bookingObservations: "Paciente refiere dolor agudo.", createdAt: formatISO(subDays(today,1)), updatedAt: formatISO(subDays(today,1)), attachedPhotos: [], addedServices: [],
  },
  {
    id: 'appt003', patientId: 'pat003', locationId: LOCATIONS[0].id, professionalId: initialMockProfessionalsData.find(p => p.locationId === LOCATIONS[0].id && p.id !== (initialMockProfessionalsData.find(pr => pr.locationId === LOCATIONS[0].id)?.id || initialMockProfessionalsData[0]?.id))?.id || initialMockProfessionalsData[0]?.id, serviceId: initialMockServicesData[2].id, appointmentDateTime: formatISO(setHours(setMinutes(startOfDay(today), 0), 14)), durationMinutes: initialMockServicesData[2].defaultDuration, status: APPOINTMENT_STATUS.CONFIRMED, actualArrivalTime: "13:55", createdAt: formatISO(subDays(today,2)), updatedAt: formatISO(startOfDay(today)), attachedPhotos: ["https://picsum.photos/seed/appt003_1/200/200"], addedServices: [],
  },
  {
    id: 'appt004', patientId: 'pat004', locationId: LOCATIONS[2].id, professionalId: initialMockProfessionalsData.find(p => p.locationId === LOCATIONS[2].id)?.id || initialMockProfessionalsData[2]?.id, serviceId: initialMockServicesData[3].id, appointmentDateTime: formatISO(setHours(setMinutes(twoDaysAgo, 0), 11)), durationMinutes: initialMockServicesData[3].defaultDuration, status: APPOINTMENT_STATUS.COMPLETED, amountPaid: initialMockServicesData[3].price, paymentMethod: PAYMENT_METHODS[1], staffNotes: "Todo en orden. Próxima revisión en 1 mes.", createdAt: formatISO(subDays(twoDaysAgo,1)), updatedAt: formatISO(twoDaysAgo), attachedPhotos: ["https://picsum.photos/seed/appt004_1/200/200", "https://picsum.photos/seed/appt004_2/200/200"], addedServices: [],
  },
  {
    id: 'appt005', patientId: 'pat005', locationId: LOCATIONS[1].id, professionalId: null, serviceId: initialMockServicesData[0].id, appointmentDateTime: formatISO(setHours(setMinutes(startOfDay(tomorrow), 0), 16)), durationMinutes: initialMockServicesData[0].defaultDuration, status: APPOINTMENT_STATUS.BOOKED, createdAt: formatISO(startOfDay(today)), updatedAt: formatISO(startOfDay(today)), attachedPhotos: [], addedServices: [],
  },
  {
    id: 'appt006', patientId: 'pat001', locationId: LOCATIONS[0].id, professionalId: initialMockProfessionalsData.find(p => p.locationId === LOCATIONS[0].id)?.id || initialMockProfessionalsData[0]?.id, serviceId: initialMockServicesData[4].id, appointmentDateTime: formatISO(setHours(setMinutes(startOfDay(today), 30), 11)), durationMinutes: initialMockServicesData[4].defaultDuration, status: APPOINTMENT_STATUS.BOOKED, bookingObservations: "Estudio de pisada solicitado por el Dr. Pérez.", createdAt: formatISO(startOfDay(today)), updatedAt: formatISO(startOfDay(today)), attachedPhotos: [], addedServices: [],
  },
  { id: 'appt007', patientId: 'pat002', locationId: LOCATIONS[3].id, professionalId: initialMockProfessionalsData.find(p => p.locationId === LOCATIONS[3].id)?.id, serviceId: initialMockServicesData[0].id, appointmentDateTime: formatISO(setHours(setMinutes(subDays(startOfDay(today), 3), 0), 15)), durationMinutes: initialMockServicesData[0].defaultDuration, status: APPOINTMENT_STATUS.COMPLETED, amountPaid: initialMockServicesData[0].price, paymentMethod: PAYMENT_METHODS[2], staffNotes: "Paciente nuevo, buena primera impresión.", createdAt: formatISO(subDays(startOfDay(today), 4)), updatedAt: formatISO(subDays(startOfDay(today), 3)), attachedPhotos: ["https://picsum.photos/seed/appt007_1/200/200"], addedServices: [], },
  { id: 'appt008', patientId: 'pat003', locationId: LOCATIONS[4].id, professionalId: initialMockProfessionalsData.find(p => p.locationId === LOCATIONS[4].id)?.id, serviceId: initialMockServicesData[1].id, appointmentDateTime: formatISO(setHours(setMinutes(startOfDay(today), 0), 10)), durationMinutes: initialMockServicesData[1].defaultDuration, status: APPOINTMENT_STATUS.BOOKED, createdAt: formatISO(subDays(startOfDay(today), 1)), updatedAt: formatISO(subDays(startOfDay(today), 1)), attachedPhotos: [], addedServices: [], },
  { id: 'appt009', patientId: 'pat004', locationId: LOCATIONS[5].id, professionalId: initialMockProfessionalsData.find(p => p.locationId === LOCATIONS[5].id)?.id, serviceId: initialMockServicesData[2].id, appointmentDateTime: formatISO(setHours(setMinutes(subDays(startOfDay(today), 5), 30), 14)), durationMinutes: initialMockServicesData[2].defaultDuration, status: APPOINTMENT_STATUS.COMPLETED, amountPaid: initialMockServicesData[2].price ? initialMockServicesData[2].price! + 20 : 70, paymentMethod: PAYMENT_METHODS[3], staffNotes: "Se realizó quiropodia y tratamiento adicional para uña encarnada.", addedServices: [{ serviceId: initialMockServicesData[1].id, price: 20, service: initialMockServicesData[1] }], attachedPhotos: ["https://picsum.photos/seed/appt009_1/200/200"], createdAt: formatISO(subDays(startOfDay(today), 6)), updatedAt: formatISO(subDays(startOfDay(today), 5)), },
  { id: 'appt010', patientId: 'pat005', locationId: LOCATIONS[0].id, serviceId: initialMockServicesData[3].id, appointmentDateTime: formatISO(setHours(setMinutes(addDays(startOfDay(today), 2), 0), 17)), durationMinutes: initialMockServicesData[3].defaultDuration, status: APPOINTMENT_STATUS.BOOKED, preferredProfessionalId: initialMockProfessionalsData.find(p => p.locationId === LOCATIONS[0].id && p.lastName.includes('Higuereta'))?.id, bookingObservations: "Solo puede por la tarde.", createdAt: formatISO(startOfDay(today)), updatedAt: formatISO(startOfDay(today)), attachedPhotos: [], addedServices: [], },
  { id: 'appt_registry_test_1', patientId: initialMockPatientsData[0].id, locationId: LOCATIONS[0].id, professionalId: initialMockProfessionalsData.find(p => p.locationId === LOCATIONS[0].id && p.firstName === 'Profesional 1')?.id, serviceId: initialMockServicesData[0].id, appointmentDateTime: formatISO(setHours(setMinutes(fixedFutureDateForRegistry, 0), 10)), durationMinutes: initialMockServicesData[0].defaultDuration, status: APPOINTMENT_STATUS.COMPLETED, amountPaid: initialMockServicesData[0].price, paymentMethod: PAYMENT_METHODS[0], createdAt: formatISO(fixedFutureDateForRegistry), updatedAt: formatISO(fixedFutureDateForRegistry), addedServices: [], attachedPhotos: [] },
  { id: 'appt_registry_test_2', patientId: initialMockPatientsData[1].id, locationId: LOCATIONS[1].id, professionalId: initialMockProfessionalsData.find(p => p.locationId === LOCATIONS[1].id && p.firstName === 'Profesional 1')?.id, serviceId: initialMockServicesData[1].id, appointmentDateTime: formatISO(setHours(setMinutes(fixedFutureDateForRegistry, 30), 11)), durationMinutes: initialMockServicesData[1].defaultDuration, status: APPOINTMENT_STATUS.COMPLETED, amountPaid: initialMockServicesData[1].price, paymentMethod: PAYMENT_METHODS[1], createdAt: formatISO(fixedFutureDateForRegistry), updatedAt: formatISO(fixedFutureDateForRegistry), addedServices: [], attachedPhotos: [] },
  { id: 'appt_registry_test_3', patientId: initialMockPatientsData[2].id, locationId: LOCATIONS[0].id, professionalId: initialMockProfessionalsData.find(p => p.locationId === LOCATIONS[0].id && p.firstName === 'Profesional 2')?.id, serviceId: initialMockServicesData[2].id, appointmentDateTime: formatISO(setHours(setMinutes(fixedFutureDateForRegistry, 0), 14)), durationMinutes: initialMockServicesData[2].defaultDuration, status: APPOINTMENT_STATUS.COMPLETED, amountPaid: initialMockServicesData[2].price, paymentMethod: PAYMENT_METHODS[2], createdAt: formatISO(fixedFutureDateForRegistry), updatedAt: formatISO(fixedFutureDateForRegistry), addedServices: [], attachedPhotos: [] }
];


interface MockDB {
  users: User[];
  professionals: Professional[];
  patients: Patient[];
  services: Service[];
  appointments: Appointment[];
}

function initializeGlobalMockStore(): MockDB {
  const globalAsAny = global as any;
  if (!globalAsAny._mockDB) {
    globalAsAny._mockDB = {
      users: [...initialMockUsersData],
      professionals: [...initialMockProfessionalsData],
      patients: [...initialMockPatientsData],
      services: [...initialMockServicesData],
      appointments: [...initialMockAppointmentsData],
    };
  }
  return globalAsAny._mockDB;
}

const mockDB = useMockDatabase ? initializeGlobalMockStore() : ({} as MockDB); 

const generateId = (): string => {
  return Math.random().toString(36).substr(2, 9);
};

export const getUserByUsername = async (username: string): Promise<User | undefined> => {
    if (useMockDatabase) {
        return mockDB.users.find(u => u.username === username);
    }
    throw new Error("Real database not implemented for getUserByUsername");
};

export const getProfessionals = async (locationId?: LocationId): Promise<Professional[]> => {
    if (useMockDatabase) {
        let professionalsResult = locationId 
            ? mockDB.professionals.filter(p => p.locationId === locationId)
            : [...mockDB.professionals];

        const today = new Date();
        const currentYear = getYear(today);
        const currentMonth = getMonth(today);
        const currentDay = getDate(today);
        const currentQuincena = currentDay <= 15 ? 1 : 2;

        const startDate = currentQuincena === 1 
            ? startOfMonth(setMonth(setYear(new Date(), currentYear), currentMonth))
            : addDays(startOfMonth(setMonth(setYear(new Date(), currentYear), currentMonth)), 15);
        
        const endDate = currentQuincena === 1
            ? addDays(startOfMonth(setMonth(setYear(new Date(), currentYear), currentMonth)), 14)
            : endOfMonth(setMonth(setYear(new Date(), currentYear), currentMonth));

        const appointmentsForPeriod = (mockDB.appointments || []).filter(appt => {
            const apptDate = parseISO(appt.appointmentDateTime);
            return appt.status === APPOINTMENT_STATUS.COMPLETED &&
                   apptDate >= startDate &&
                   apptDate <= endDate;
        });

        professionalsResult = professionalsResult.map(prof => {
            const profAppointments = appointmentsForPeriod.filter(appt => appt.professionalId === prof.id);
            const earnings = profAppointments.reduce((sum, appt) => sum + (appt.amountPaid || 0), 0);
            return { ...prof, biWeeklyEarnings: earnings };
        });

        return professionalsResult;
    }
    throw new Error("Real database not implemented for getProfessionals");
};

export const getProfessionalById = async (id: string): Promise<Professional | undefined> => {
    if (useMockDatabase) {
        return mockDB.professionals.find(p => p.id === id);
    }
    throw new Error("Real database not implemented for getProfessionalById");
};

export const addProfessional = async (data: Omit<ProfessionalFormData, 'id'>): Promise<Professional> => {
  const newProfessionalData: Omit<Professional, 'id' | 'biWeeklyEarnings'> = {
    firstName: data.firstName,
    lastName: data.lastName,
    locationId: data.locationId,
    phone: data.phone,
  };

  if (useMockDatabase) {
    const newProfessional: Professional = {
      id: generateId(),
      ...newProfessionalData,
      biWeeklyEarnings: 0,
    };
    mockDB.professionals.push(newProfessional);
    return newProfessional;
  }
  throw new Error("Real database not implemented for addProfessional");
};

export const updateProfessional = async (id: string, data: Partial<ProfessionalFormData>): Promise<Professional | undefined> => {
    const updatePayload = { ...data };

    if (useMockDatabase) {
        const index = mockDB.professionals.findIndex(p => p.id === id);
        if (index !== -1) {
            mockDB.professionals[index] = { ...mockDB.professionals[index], ...updatePayload } as Professional;
            return mockDB.professionals[index];
        }
        return undefined;
    }
    throw new Error("Real database not implemented for updateProfessional");
};

const PATIENTS_PER_PAGE = 8;
export const getPatients = async (options: { page?: number, limit?: number, searchTerm?: string, filterToday?: boolean, adminSelectedLocation?: LocationId | 'all', user?: User | null, lastVisiblePatientId?: string | null } = {}): Promise<{patients: Patient[], totalCount: number, lastVisiblePatientId?: string | null}> => {
  const { page = 1, limit: queryLimit = PATIENTS_PER_PAGE, searchTerm, filterToday, adminSelectedLocation, user, lastVisiblePatientId: startAfterId } = options;

  if (useMockDatabase) { 
    let filteredMockPatients = [...mockDB.patients];
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

        const dailyAppointments = (mockDB.appointments || []).filter(appt =>
          appt.appointmentDateTime && dateFnsIsSameDay(parseISO(appt.appointmentDateTime), todayIsoDate) &&
          (effectiveLocationId ? appt.locationId === effectiveLocationId : true)
        );
        const patientIdsWithAppointmentsToday = new Set(dailyAppointments.map(app => app.patientId));
        filteredMockPatients = filteredMockPatients.filter(p => patientIdsWithAppointmentsToday.has(p.id));
    }
    filteredMockPatients.sort((a,b) => `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`));
    const totalCount = filteredMockPatients.length;
    
    let paginatedPatients = [];
    let newLastVisibleId: string | null = null;

    if (startAfterId) {
        const lastIndex = filteredMockPatients.findIndex(p => p.id === startAfterId);
        if (lastIndex !== -1) {
            paginatedPatients = filteredMockPatients.slice(lastIndex + 1, lastIndex + 1 + queryLimit);
        } else {
            paginatedPatients = filteredMockPatients.slice(0, queryLimit);
        }
    } else {
         const startIndex = (page - 1) * queryLimit;
         paginatedPatients = filteredMockPatients.slice(startIndex, startIndex + queryLimit);
    }
    
    newLastVisibleId = paginatedPatients.length > 0 ? paginatedPatients[paginatedPatients.length - 1].id : null;

    return { patients: paginatedPatients, totalCount, lastVisiblePatientId: newLastVisibleId };
  }
  throw new Error("Real database not implemented for getPatients");
};

export const getPatientById = async (id: string): Promise<Patient | undefined> => {
    if (useMockDatabase) {
        return mockDB.patients.find(p => p.id === id);
    }
    throw new Error("Real database not implemented for getPatientById");
};

export const findPatient = async (firstName: string, lastName: string): Promise<Patient | undefined> => {
    if (useMockDatabase) {
        return mockDB.patients.find(p => p.firstName.toLowerCase() === firstName.toLowerCase() && p.lastName.toLowerCase() === lastName.toLowerCase());
    }
    throw new Error("Real database not implemented for findPatient");
};

export const addPatient = async (data: Partial<Omit<Patient, 'id'>>): Promise<Patient> => {
  const newPatientData: Omit<Patient, 'id'> = {
    firstName: data.firstName!,
    lastName: data.lastName!,
    phone: data.phone,
    age: data.age === undefined ? null : data.age,
    isDiabetic: data.isDiabetic || false,
    dateOfBirth: (data as any).birthDay && (data as any).birthMonth ? `${(data as any).birthDay}-${(data as any).birthMonth}` : data.dateOfBirth,
    notes: data.notes,
    preferredProfessionalId: data.preferredProfessionalId,
  };
  if (useMockDatabase) {
    const newPatient: Patient = {
      id: generateId(),
      ...newPatientData,
    };
    mockDB.patients.push(newPatient);
    return newPatient;
  }
  throw new Error("Real database not implemented for addPatient");
};

export const updatePatient = async (id: string, data: Partial<Patient>): Promise<Patient | undefined> => {
    if (useMockDatabase) {
        const index = mockDB.patients.findIndex(p => p.id === id);
        if (index !== -1) {
            const patientToUpdate = { ...mockDB.patients[index], ...data };
            if ((data as any).birthDay && (data as any).birthMonth) {
                patientToUpdate.dateOfBirth = `${(data as any).birthDay}-${(data as any).birthMonth}`;
            } else if (data.dateOfBirth === undefined && ((data as any).birthDay || (data as any).birthMonth)) {
                // If only one part of birthday is provided, or it's meant to be cleared
                patientToUpdate.dateOfBirth = undefined;
            }
            // Remove temporary fields if they exist
            delete (patientToUpdate as any).birthDay;
            delete (patientToUpdate as any).birthMonth;

            mockDB.patients[index] = patientToUpdate;
            return mockDB.patients[index];
        }
        return undefined;
    }
    throw new Error("Real database not implemented for updatePatient");
};

export const getServices = async (): Promise<Service[]> => {
    if (useMockDatabase) {
        return [...mockDB.services].sort((a, b) => a.name.localeCompare(b.name));
    }
    throw new Error("Real database not implemented for getServices");
};

export const getServiceById = async (id: string): Promise<Service | undefined> => {
    if (useMockDatabase) {
        return mockDB.services.find(s => s.id === id);
    }
    throw new Error("Real database not implemented for getServiceById");
};

export const addService = async (data: ServiceFormData): Promise<Service> => {
  const newServiceData: Omit<Service, 'id'> = {
    name: data.name,
    defaultDuration: data.defaultDuration,
    price: data.price,
  };
  if (useMockDatabase) {
    const newService: Service = {
      id: data.id || generateId(), 
      ...newServiceData,
    };
    mockDB.services.push(newService);
    return newService;
  }
  throw new Error("Real database not implemented for addService");
};

export const updateService = async (id: string, data: Partial<ServiceFormData>): Promise<Service | undefined> => {
    if (useMockDatabase) {
        const index = mockDB.services.findIndex(s => s.id === id);
        if (index !== -1) {
            mockDB.services[index] = { ...mockDB.services[index], ...data } as Service;
            return mockDB.services[index];
        }
        return undefined;
    }
    throw new Error("Real database not implemented for updateService");
};


const populateAppointment = async (apptData: any): Promise<Appointment> => {
    const patient = useMockDatabase ? mockDB.patients.find(p => p.id === apptData.patientId) : undefined; /* await getPatientById(apptData.patientId); */
    const professional = apptData.professionalId ? (useMockDatabase ? mockDB.professionals.find(p => p.id === apptData.professionalId) : undefined /* await getProfessionalById(apptData.professionalId) */) : undefined;
    const service = apptData.serviceId ? (useMockDatabase ? mockDB.services.find(s => s.id === apptData.serviceId) : undefined /* await getServiceById(apptData.serviceId as string) */) : undefined;

    let addedServicesPopulated = [];
    if (apptData.addedServices && Array.isArray(apptData.addedServices)) {
        addedServicesPopulated = await Promise.all(
            apptData.addedServices.map(async (as: any) => ({
                ...as,
                service: as.serviceId ? (useMockDatabase ? mockDB.services.find(s => s.id === as.serviceId) : undefined /* await getServiceById(as.serviceId as string) */) : undefined,
                professional: as.professionalId ? (useMockDatabase ? mockDB.professionals.find(p => p.id === as.professionalId) : undefined /* await getProfessionalById(as.professionalId) */) : undefined,
            }))
        );
    }
    
    return {
        ...apptData,
        patient,
        professional,
        service,
        addedServices: addedServicesPopulated,
    } as Appointment;
};


const APPOINTMENTS_PER_PAGE_HISTORY = 8;
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
  const { page = 1, limit: queryLimitParam, lastVisibleAppointmentId: startAfterId, ...restFilters } = filters;
  const queryLimit = queryLimitParam ?? (restFilters.statuses ? APPOINTMENTS_PER_PAGE_HISTORY : 1000); 

  if (useMockDatabase) { 
    let currentMockAppointments = mockDB.appointments || [];
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
          try { return dateFnsIsSameDay(parseISO(appt.appointmentDateTime), targetDate); } catch (e) { return false; }
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
        (Array.isArray(restFilters.statuses) && restFilters.statuses.some(s => [APPOINTMENT_STATUS.COMPLETED, APPOINTMENT_STATUS.CANCELLED_CLIENT, APPOINTMENT_STATUS.CANCELLED_STAFF, APPOINTMENT_STATUS.NO_SHOW].includes(s as AppointmentStatus))) ||
        (typeof restFilters.statuses === 'string' && [APPOINTMENT_STATUS.COMPLETED, APPOINTMENT_STATUS.CANCELLED_CLIENT, APPOINTMENT_STATUS.CANCELLED_STAFF, APPOINTMENT_STATUS.NO_SHOW].includes(restFilters.statuses as AppointmentStatus))
    );

    filteredMockAppointments.sort((a, b) => {
        const dateA = parseISO(a.appointmentDateTime).getTime();
        const dateB = parseISO(b.appointmentDateTime).getTime();
        return isFetchingPastStatuses ? dateB - dateA : dateA - dateB;
    });

    const populatedAppointmentsPromises = filteredMockAppointments.map(appt => populateAppointment(appt));
    const populatedAppointments = await Promise.all(populatedAppointmentsPromises);
    
    const totalCount = populatedAppointments.length;

    let paginatedResult = [];
    if (startAfterId) {
        const lastIdx = populatedAppointments.findIndex(a => a.id === startAfterId);
        if (lastIdx !== -1) {
            paginatedResult = populatedAppointments.slice(lastIdx + 1, lastIdx + 1 + queryLimit);
        } else {
            paginatedResult = populatedAppointments.slice(0, queryLimit);
        }
    } else {
        const startIndex = (page - 1) * queryLimit;
        paginatedResult = populatedAppointments.slice(startIndex, startIndex + queryLimit);
    }
    
    const newLastVisibleId = paginatedResult.length > 0 ? paginatedResult[paginatedResult.length -1].id : null;
    return { appointments: populatedAppointments, totalCount, lastVisibleAppointmentId: newLastVisibleId };
  }
  throw new Error("Real database not implemented for getAppointments");
};


export const getAppointmentById = async (id: string): Promise<Appointment | undefined> => {
    if (useMockDatabase) {
        const appt = mockDB.appointments.find(a => a.id === id);
        return appt ? populateAppointment(appt) : undefined;
    }
    throw new Error("Real database not implemented for getAppointmentById");
};

export const addAppointment = async (data: AppointmentFormData & { patientDateOfBirth?: string }): Promise<Appointment> => {
  let patientId = data.existingPatientId;
  if (!patientId) {
    let existingPatient = await findPatient(data.patientFirstName, data.patientLastName);
    if (existingPatient) {
      patientId = existingPatient.id;
       const patientUpdates: Partial<Patient> = {};
       if (data.isDiabetic !== undefined && existingPatient.isDiabetic !== data.isDiabetic) patientUpdates.isDiabetic = data.isDiabetic;
       if (data.patientAge !== undefined && existingPatient.age !== data.patientAge) patientUpdates.age = data.patientAge;
       if (data.patientDateOfBirth && existingPatient.dateOfBirth !== data.patientDateOfBirth) patientUpdates.dateOfBirth = data.patientDateOfBirth;
       if (Object.keys(patientUpdates).length > 0) {
          await updatePatient(patientId, patientUpdates);
      }
    } else {
      const newPatient = await addPatient({
        firstName: data.patientFirstName,
        lastName: data.patientLastName,
        phone: data.patientPhone,
        age: data.patientAge,
        dateOfBirth: data.patientDateOfBirth,
        isDiabetic: data.isDiabetic || false,
        notes: '', 
        preferredProfessionalId: undefined, 
      });
      patientId = newPatient.id;
    }
  } else {
      const existingPatientDetails = await getPatientById(patientId);
      if (existingPatientDetails) {
        const patientUpdates: Partial<Patient> = {};
        if (data.isDiabetic !== undefined && data.isDiabetic !== existingPatientDetails.isDiabetic) patientUpdates.isDiabetic = data.isDiabetic;
        if (data.patientAge !== undefined && data.patientAge !== existingPatientDetails.age) patientUpdates.age = data.patientAge;
        if (data.patientDateOfBirth && existingPatientDetails.dateOfBirth !== data.patientDateOfBirth) patientUpdates.dateOfBirth = data.patientDateOfBirth;
        if (Object.keys(patientUpdates).length > 0) {
          await updatePatient(patientId, patientUpdates);
        }
      }
  }

  const service = await getServiceById(data.serviceId as string);
  if (!service) {
      throw new Error(`Service with ID ${data.serviceId} not found.`);
  }
  const appointmentDateHours = parseInt(data.appointmentTime.split(':')[0]);
  const appointmentDateMinutes = parseInt(data.appointmentTime.split(':')[1]);
  
  const appointmentDateTimeObject = setMinutes(setHours(data.appointmentDate, appointmentDateHours), appointmentDateMinutes);
  const appointmentDateTime = formatISO(appointmentDateTimeObject);
  const appointmentDuration = service.defaultDuration || 60;
  const appointmentEndTime = addMinutes(appointmentDateTimeObject, appointmentDuration);

  let actualProfessionalId: string | undefined | null = undefined;

  if (data.preferredProfessionalId && data.preferredProfessionalId !== ANY_PROFESSIONAL_VALUE) {
    const preferredProf = await getProfessionalById(data.preferredProfessionalId);
    if (preferredProf && preferredProf.locationId === data.locationId) {
      actualProfessionalId = preferredProf.id;
    } else {
      actualProfessionalId = null; 
    }
  } else {
     actualProfessionalId = null; 
  }


  if (actualProfessionalId === null) { 
    const allProfessionalsInLocation = await getProfessionals(data.locationId);
    const appointmentsOnDateResult = await getAppointments({
      locationId: data.locationId,
      date: data.appointmentDate,
      statuses: [APPOINTMENT_STATUS.BOOKED, APPOINTMENT_STATUS.CONFIRMED] 
    });
    const existingAppointmentsForDay = appointmentsOnDateResult.appointments || [];

    for (const prof of allProfessionalsInLocation) {
      let isProfBusy = false;
      for (const existingAppt of existingAppointmentsForDay) {
        if (existingAppt.professionalId === prof.id) {
          const existingApptStartTime = parseISO(existingAppt.appointmentDateTime);
          const existingApptEndTime = addMinutes(existingApptStartTime, existingAppt.durationMinutes);
          if (isBefore(appointmentDateTimeObject, existingApptEndTime) && isAfter(appointmentEndTime, existingApptStartTime)) {
            isProfBusy = true;
            break;
          }
        }
      }
      if (!isProfBusy) {
        actualProfessionalId = prof.id;
        break;
      }
    }
  }


  const newAppointmentData: Omit<Appointment, 'id' | 'createdAt' | 'updatedAt' | 'patient' | 'service' | 'professional'> = {
    patientId: patientId!,
    locationId: data.locationId,
    serviceId: data.serviceId,
    professionalId: actualProfessionalId,
    appointmentDateTime: appointmentDateTime,
    durationMinutes: appointmentDuration,
    preferredProfessionalId: (data.preferredProfessionalId === ANY_PROFESSIONAL_VALUE || !data.preferredProfessionalId) ? undefined : data.preferredProfessionalId,
    bookingObservations: data.bookingObservations || undefined,
    status: APPOINTMENT_STATUS.BOOKED,
    attachedPhotos: [],
    addedServices: [],
  };

  if (useMockDatabase) {
    const newAppointment: Appointment = {
      id: generateId(),
      ...newAppointmentData,
      createdAt: formatISO(new Date()),
      updatedAt: formatISO(new Date()),
    };
    const populatedNewAppointment = await populateAppointment(newAppointment);
    mockDB.appointments.push(populatedNewAppointment);
    return populatedNewAppointment;
  }
  throw new Error("Real database not implemented for addAppointment");
};

export const updateAppointment = async (id: string, data: Partial<Appointment>): Promise<Appointment | undefined> => {
  const updateData: any = { ...data, updatedAt: formatISO(new Date()) };
  
  if (useMockDatabase) {
    const index = mockDB.appointments.findIndex(a => a.id === id);
    if (index !== -1) {
        const originalAppointment = mockDB.appointments[index];
        
        let newAppointmentDateTime = originalAppointment.appointmentDateTime;
        if (data.appointmentDate && data.appointmentTime) {
            const datePart = data.appointmentDate; 
            const [hours, minutes] = (data.appointmentTime as string).split(':').map(Number);
            newAppointmentDateTime = formatISO(setMinutes(setHours(datePart as Date, hours), minutes));
        } else if (data.appointmentDate) { 
            const timePart = parseISO(originalAppointment.appointmentDateTime);
            const [hours, minutes] = [getHours(timePart), getMinutes(timePart)];
            newAppointmentDateTime = formatISO(setMinutes(setHours(data.appointmentDate as Date, hours), minutes));
        } else if (data.appointmentTime) { 
            const datePart = parseISO(originalAppointment.appointmentDateTime);
            const [hours, minutes] = (data.appointmentTime as string).split(':').map(Number);
            newAppointmentDateTime = formatISO(setMinutes(setHours(datePart, hours), minutes));
        }
        
        const updatedAppointmentRaw = {
            ...originalAppointment,
            ...data,
            appointmentDateTime: newAppointmentDateTime, 
            updatedAt: formatISO(new Date()),
        };
        
        delete updatedAppointmentRaw.patient;
        delete updatedAppointmentRaw.professional;
        delete updatedAppointmentRaw.service;
        if (updatedAppointmentRaw.addedServices) {
            updatedAppointmentRaw.addedServices = updatedAppointmentRaw.addedServices.map((as: any) => ({
                serviceId: as.serviceId,
                professionalId: as.professionalId,
                price: as.price
            }));
        }


        const populatedAppointment = await populateAppointment(updatedAppointmentRaw);
        mockDB.appointments[index] = populatedAppointment;
        return populatedAppointment;
    }
    return undefined;
  }
  throw new Error("Real database not implemented for updateAppointment");
};

export const getPatientAppointmentHistory = async (
  patientId: string,
  options: { page?: number, limit?: number, lastVisibleAppointmentId?: string | null } = {}
): Promise<{ appointments: Appointment[], totalCount: number, lastVisibleAppointmentId?: string | null }> => {
  const { page = 1, limit: queryLimit = APPOINTMENTS_PER_PAGE_HISTORY, lastVisibleAppointmentId: startAfterId } = options;
  const todayDate = startOfDay(new Date());
  const pastStatuses: AppointmentStatus[] = [APPOINTMENT_STATUS.COMPLETED, APPOINTMENT_STATUS.NO_SHOW, APPOINTMENT_STATUS.CANCELLED_CLIENT, APPOINTMENT_STATUS.CANCELLED_STAFF];

  if (useMockDatabase) { 
    const historyAppointments = (mockDB.appointments || []).filter(appt =>
      appt.patientId === patientId &&
      appt.appointmentDateTime && parseISO(appt.appointmentDateTime) < todayDate &&
      pastStatuses.includes(appt.status)
    ).sort((a, b) => parseISO(b.appointmentDateTime).getTime() - parseISO(a.appointmentDateTime).getTime());

    const populatedHistoryPromises = historyAppointments.map(appt => populateAppointment(appt));
    const populatedHistory = await Promise.all(populatedHistoryPromises);
    
    const totalCount = populatedHistory.length;
    let paginatedAppointments = [];

    if (startAfterId) {
        const lastIdx = populatedHistory.findIndex(a => a.id === startAfterId);
        if (lastIdx !== -1) {
            paginatedAppointments = populatedHistory.slice(lastIdx + 1, lastIdx + 1 + queryLimit);
        } else {
            paginatedAppointments = populatedHistory.slice(0, queryLimit);
        }
    } else {
        const startIndex = (page - 1) * queryLimit;
        paginatedAppointments = populatedHistory.slice(startIndex, startIndex + queryLimit);
    }

    const newLastVisibleId = paginatedAppointments.length > 0 ? paginatedAppointments[paginatedAppointments.length -1].id : null;
    return { appointments: populatedAppointments, totalCount, lastVisibleAppointmentId: newLastVisibleId };
  }
  throw new Error("Real database not implemented for getPatientAppointmentHistory");
};

export const getCurrentQuincenaDateRange = (): { start: Date; end: Date } => {
  const today = new Date();
  const currentYear = getYear(today);
  const currentMonth = getMonth(today);
  const currentDay = getDate(today);
  
  let startDate: Date;
  let endDate: Date;

  if (currentDay <= 15) {
    startDate = startOfMonth(setMonth(setYear(new Date(), currentYear), currentMonth));
    endDate = addDays(startDate, 14); 
  } else {
    startDate = addDays(startOfMonth(setMonth(setYear(new Date(), currentYear), currentMonth)), 15); 
    endDate = endOfMonth(setMonth(setYear(new Date(), currentYear), currentMonth));
  }
  return { start: startOfDay(startDate), end: endOfDay(endDate) };
};

