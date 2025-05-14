
// src/lib/data.ts
import type { User, Professional, Patient, Service, Appointment, AppointmentFormData, ProfessionalFormData, AppointmentStatus, ServiceFormData, Contract } from '@/types';
import { LOCATIONS, USER_ROLES, SERVICES as SERVICES_CONSTANTS, APPOINTMENT_STATUS, LocationId, ServiceId as ConstantServiceId, APPOINTMENT_STATUS_DISPLAY, PAYMENT_METHODS, TIME_SLOTS, DAYS_OF_WEEK } from './constants';
import type { DayOfWeekId } from './constants';
import { formatISO, parseISO, addDays, setHours, setMinutes, startOfDay, endOfDay, isSameDay as dateFnsIsSameDay, startOfMonth, endOfMonth, differenceInYears, subDays, isEqual, isBefore, isAfter, getDate, getYear, getMonth, setMonth, setYear, getHours, addMinutes as dateFnsAddMinutes, isWithinInterval, getDay, format, differenceInCalendarDays, areIntervalsOverlapping, parse } from 'date-fns';
import { es } from 'date-fns/locale';
import { useMockDatabase as globalUseMockDatabase } from './firebase-config'; // Centralized mock flag


const generateId = (): string => {
  return Math.random().toString(36).substr(2, 9);
};

const ANY_PROFESSIONAL_VALUE = "_any_professional_placeholder_";
export const useMockDatabase = globalUseMockDatabase;


// --- Initial Mock Data Definitions ---
// todayMock is used for consistent mock data generation relative to a fixed point in time.
// For dynamic calculations (e.g., current contract status, current quincena), use new Date().
const todayMock = new Date(2025, 4, 13); // Tuesday, May 13, 2025
const yesterdayMock = subDays(todayMock, 1);
const twoDaysAgoMock = subDays(todayMock, 2);
const tomorrowMock = addDays(todayMock,1);
const fixedFutureDateForRegistry = new Date(2025, 4, 9); // May 9, 2025
const april20_2025 = new Date(2025, 3, 20); // April 20, 2025 (month is 0-indexed)
const april22_2025 = new Date(2025, 3, 22); // April 22, 2025


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

const professionalCounts: Record<LocationId, number> = {
  higuereta: 15,
  eden_benavides: 2,
  crucetas: 2,
  carpaccio: 2,
  vista_alegre: 2,
  san_antonio: 8,
};

const initialMockProfessionalsData: Professional[] = LOCATIONS.flatMap((location, locIndex) => {
  const numProfessionals = professionalCounts[location.id] || 2;
  return Array.from({ length: numProfessionals }, (_, i) => {
    const baseSchedule: { [key in DayOfWeekId]?: { startTime: string; endTime: string; isWorking?: boolean } | null } = {
      monday: { startTime: '10:00', endTime: '19:00', isWorking: true },
      tuesday: { startTime: '10:00', endTime: '19:00', isWorking: true },
      wednesday: { startTime: '10:00', endTime: '19:00', isWorking: true },
      thursday: { startTime: '10:00', endTime: '19:00', isWorking: true },
      friday: { startTime: '10:00', endTime: '19:00', isWorking: true },
      saturday: { startTime: '09:00', endTime: '18:00', isWorking: true },
      sunday: { isWorking: true, startTime: '10:00', endTime: '18:00' },
    };
    
    const isSecondProfHiguereta = location.id === 'higuereta' && i === 1;
    const isThirdProfHiguereta = location.id === 'higuereta' && i === 2;

    let currentContract: Contract | null = null;
    // Ensure first two professionals in each location have an active contract relative to todayMock
    if (i < 2) {
        const contractStartDate = subDays(todayMock, 60); // Started ~2 months before todayMock
        const contractEndDate = addDays(todayMock, 90);   // Ends ~3 months after todayMock
        currentContract = {
            id: generateId(),
            startDate: formatISO(contractStartDate, { representation: 'date' }),
            endDate: formatISO(contractEndDate, { representation: 'date' }),
            notes: `Contrato activo para ${location.name} prof ${i + 1}`,
            empresa: `Empresa Principal ${location.name}`,
        };
    } else {
        // For other professionals, use a varied logic (some active, some expired, some none)
        if (i % 3 === 0) { // Every 3rd one (after the first two) gets an active contract
            const contractStartDate = subDays(todayMock, 30);
            const contractEndDate = addDays(todayMock, 60);
            currentContract = {
                id: generateId(),
                startDate: formatISO(contractStartDate, { representation: 'date' }),
                endDate: formatISO(contractEndDate, { representation: 'date' }),
                notes: `Contrato estándar activo ${i + 1}`,
                empresa: (i % 2 === 0) ? 'Empresa A' : 'Empresa B',
            };
        } else if (i % 3 === 1) { // Next one gets an expired contract
             const contractStartDate = subDays(todayMock, 120);
             const contractEndDate = subDays(todayMock, 30); // Expired 30 days ago
             currentContract = {
                 id: generateId(),
                 startDate: formatISO(contractStartDate, { representation: 'date' }),
                 endDate: formatISO(contractEndDate, { representation: 'date' }),
                 notes: `Contrato vencido ${i + 1}`,
                 empresa: 'Empresa Expirada',
             };
        }
        // else: no contract for this one (i % 3 === 2)
    }


    return {
      id: `prof-${location.id}-${i + 1}`,
      firstName: `Profesional ${i + 1}`,
      lastName: location.name.split(' ')[0],
      locationId: location.id,
      phone: `9876543${locIndex}${i + 1}`,
      biWeeklyEarnings: Math.random() * 1500 + 500,
      workSchedule: baseSchedule,
      customScheduleOverrides: isSecondProfHiguereta ? [
        { id: generateId(), date: formatISO(addDays(todayMock, 7), { representation: 'date' }), isWorking: true, startTime: '10:00', endTime: '14:00', notes: 'Turno especial Tarde' },
        { id: generateId(), date: formatISO(addDays(todayMock, 3 ), { representation: 'date' }), isWorking: false, notes: 'Día libre por compensación' }
      ] : isThirdProfHiguereta ? [
        { id: generateId(), date: formatISO(addDays(todayMock,1), { representation: 'date' }), isWorking: false, notes: 'Descanso programado' } 
      ] : [],
      currentContract: currentContract,
      contractHistory: currentContract && i % 4 === 0 ? [{ 
        id: generateId(),
        startDate: formatISO(subDays(todayMock, 180), { representation: 'date' }),
        endDate: formatISO(subDays(todayMock, 91), { representation: 'date' }),
        notes: 'Contrato anterior',
        empresa: 'Empresa Antigua C',
      }] : [],
    };
  });
});


const initialMockPatientsData: Patient[] = [
  { id: 'pat001', firstName: 'Ana', lastName: 'García', phone: '111222333', age: 39, preferredProfessionalId: initialMockProfessionalsData.find(p => p.locationId === 'higuereta')?.id, notes: 'Paciente regular, prefiere citas por la mañana.', isDiabetic: false },
  { id: 'pat002', firstName: 'Luis', lastName: 'Martínez', phone: '444555666', age: 31, notes: 'Primera visita.', isDiabetic: true },
  { id: 'pat003', firstName: 'Elena', lastName: 'Ruiz', phone: '777888999', age: 23, isDiabetic: false },
  { id: 'pat004', firstName: 'Carlos', lastName: 'Vargas', phone: '222333444', age: 54, isDiabetic: true, notes: "Sensibilidad en el pie izquierdo." },
  { id: 'pat005', firstName: 'Sofía', lastName: 'Chávez', phone: '555666777', age: 25, isDiabetic: false, preferredProfessionalId: initialMockProfessionalsData.find(p => p.locationId === 'higuereta' && p.firstName === 'Profesional 2')?.id },
];

const initialMockServicesData: Service[] = SERVICES_CONSTANTS.map((s_const, index) => ({
  id: s_const.id as string,
  name: s_const.name,
  defaultDuration: s_const.defaultDuration,
  price: (50 + index * 10),
}));


const initialMockAppointmentsData: Appointment[] = [
  // Existing appointments...
  {
    id: 'appt001', patientId: 'pat001', locationId: LOCATIONS[0].id, professionalId: initialMockProfessionalsData.find(p => p.locationId === LOCATIONS[0].id)?.id || initialMockProfessionalsData[0]?.id, serviceId: initialMockServicesData[0].id, appointmentDateTime: formatISO(setHours(setMinutes(yesterdayMock, 0), 10)), durationMinutes: initialMockServicesData[0].defaultDuration, status: APPOINTMENT_STATUS.COMPLETED, amountPaid: initialMockServicesData[0].price, paymentMethod: PAYMENT_METHODS[0], staffNotes: "Tratamiento exitoso, paciente refiere mejoría.", attachedPhotos: ["https://placehold.co/200x200.png?text=Appt001" as string], addedServices: [{ serviceId: initialMockServicesData[2].id, price: initialMockServicesData[2].price, service: initialMockServicesData[2] }], createdAt: formatISO(subDays(yesterdayMock,1)), updatedAt: formatISO(yesterdayMock),
  },
  {
    id: 'appt002', patientId: 'pat002', locationId: LOCATIONS[1].id, professionalId: initialMockProfessionalsData.find(p => p.locationId === LOCATIONS[1].id)?.id || initialMockProfessionalsData[1]?.id, serviceId: initialMockServicesData[1].id, appointmentDateTime: formatISO(setHours(setMinutes(startOfDay(todayMock), 30), 9)), durationMinutes: initialMockServicesData[1].defaultDuration, status: APPOINTMENT_STATUS.BOOKED, bookingObservations: "Paciente refiere dolor agudo.", createdAt: formatISO(subDays(todayMock,1)), updatedAt: formatISO(subDays(todayMock,1)), attachedPhotos: [], addedServices: [],
  },
  {
    id: 'appt003', patientId: 'pat003', locationId: LOCATIONS[0].id, professionalId: initialMockProfessionalsData.find(p => p.locationId === LOCATIONS[0].id && p.id !== (initialMockProfessionalsData.find(pr => pr.locationId === LOCATIONS[0].id)?.id || initialMockProfessionalsData[0]?.id))?.id || initialMockProfessionalsData[0]?.id, serviceId: initialMockServicesData[2].id, appointmentDateTime: formatISO(setHours(setMinutes(startOfDay(todayMock), 0), 14)), durationMinutes: initialMockServicesData[2].defaultDuration, status: APPOINTMENT_STATUS.CONFIRMED, actualArrivalTime: "13:55", createdAt: formatISO(subDays(todayMock,2)), updatedAt: formatISO(startOfDay(todayMock)), attachedPhotos: ["https://placehold.co/200x200.png?text=Appt003" as string], addedServices: [],
  },
  {
    id: 'appt004', patientId: 'pat004', locationId: LOCATIONS[2].id, professionalId: initialMockProfessionalsData.find(p => p.locationId === LOCATIONS[2].id)?.id || initialMockProfessionalsData[2]?.id, serviceId: initialMockServicesData[3].id, appointmentDateTime: formatISO(setHours(setMinutes(twoDaysAgoMock, 0), 11)), durationMinutes: initialMockServicesData[3].defaultDuration, status: APPOINTMENT_STATUS.COMPLETED, amountPaid: initialMockServicesData[3].price, paymentMethod: PAYMENT_METHODS[1], staffNotes: "Todo en orden. Próxima revisión en 1 mes.", createdAt: formatISO(subDays(twoDaysAgoMock,1)), updatedAt: formatISO(twoDaysAgoMock), attachedPhotos: ["https://placehold.co/200x200.png?text=Appt004_1" as string, "https://placehold.co/200x200.png?text=Appt004_2" as string], addedServices: [],
  },
  {
    id: 'appt005', patientId: 'pat005', locationId: LOCATIONS[1].id, professionalId: null, serviceId: initialMockServicesData[0].id, appointmentDateTime: formatISO(setHours(setMinutes(startOfDay(tomorrowMock), 0), 16)), durationMinutes: initialMockServicesData[0].defaultDuration, status: APPOINTMENT_STATUS.BOOKED, createdAt: formatISO(startOfDay(todayMock)), updatedAt: formatISO(startOfDay(todayMock)), attachedPhotos: [], addedServices: [],
  },
  {
    id: 'appt006', patientId: 'pat001', locationId: LOCATIONS[0].id, professionalId: initialMockProfessionalsData.find(p => p.locationId === LOCATIONS[0].id)?.id || initialMockProfessionalsData[0]?.id, serviceId: initialMockServicesData[4].id, appointmentDateTime: formatISO(setHours(setMinutes(startOfDay(todayMock), 30), 11)), durationMinutes: initialMockServicesData[4].defaultDuration, status: APPOINTMENT_STATUS.BOOKED, bookingObservations: "Estudio de pisada solicitado por el Dr. Pérez.", createdAt: formatISO(startOfDay(todayMock)), updatedAt: formatISO(startOfDay(todayMock)), attachedPhotos: [], addedServices: [],
  },
  { id: 'appt007', patientId: 'pat002', locationId: LOCATIONS[3].id, professionalId: initialMockProfessionalsData.find(p => p.locationId === LOCATIONS[3].id)?.id, serviceId: initialMockServicesData[0].id, appointmentDateTime: formatISO(setHours(setMinutes(subDays(startOfDay(todayMock), 3), 0), 15)), durationMinutes: initialMockServicesData[0].defaultDuration, status: APPOINTMENT_STATUS.COMPLETED, amountPaid: initialMockServicesData[0].price, paymentMethod: PAYMENT_METHODS[2], staffNotes: "Paciente nuevo, buena primera impresión.", createdAt: formatISO(subDays(startOfDay(todayMock), 4)), updatedAt: formatISO(subDays(startOfDay(todayMock), 3)), attachedPhotos: ["https://placehold.co/200x200.png?text=Appt007" as string], addedServices: [], },
  { id: 'appt008', patientId: 'pat003', locationId: LOCATIONS[4].id, professionalId: initialMockProfessionalsData.find(p => p.locationId === LOCATIONS[4].id)?.id, serviceId: initialMockServicesData[1].id, appointmentDateTime: formatISO(setHours(setMinutes(startOfDay(todayMock), 0), 10)), durationMinutes: initialMockServicesData[1].defaultDuration, status: APPOINTMENT_STATUS.BOOKED, createdAt: formatISO(subDays(startOfDay(todayMock), 1)), updatedAt: formatISO(subDays(startOfDay(todayMock), 1)), attachedPhotos: [], addedServices: [], },
  { id: 'appt009', patientId: 'pat004', locationId: LOCATIONS[5].id, professionalId: initialMockProfessionalsData.find(p => p.locationId === LOCATIONS[5].id)?.id, serviceId: initialMockServicesData[2].id, appointmentDateTime: formatISO(setHours(setMinutes(subDays(startOfDay(todayMock), 5), 30), 14)), durationMinutes: initialMockServicesData[2].defaultDuration, status: APPOINTMENT_STATUS.COMPLETED, amountPaid: initialMockServicesData[2].price ? initialMockServicesData[2].price! + 20 : 70, paymentMethod: PAYMENT_METHODS[3], staffNotes: "Se realizó quiropodia y tratamiento adicional para uña encarnada.", addedServices: [{ serviceId: initialMockServicesData[1].id, price: 20, service: initialMockServicesData[1] }], attachedPhotos: ["https://placehold.co/200x200.png?text=Appt009" as string], createdAt: formatISO(subDays(startOfDay(todayMock), 6)), updatedAt: formatISO(subDays(startOfDay(todayMock), 5)), },
  { id: 'appt010', patientId: 'pat005', locationId: LOCATIONS[0].id, serviceId: initialMockServicesData[3].id, appointmentDateTime: formatISO(setHours(setMinutes(addDays(startOfDay(todayMock), 2), 0), 17)), durationMinutes: initialMockServicesData[3].defaultDuration, status: APPOINTMENT_STATUS.BOOKED, preferredProfessionalId: initialMockProfessionalsData.find(p => p.locationId === LOCATIONS[0].id && p.lastName.includes('Higuereta'))?.id, bookingObservations: "Solo puede por la tarde.", createdAt: formatISO(startOfDay(todayMock)), updatedAt: formatISO(startOfDay(todayMock)), attachedPhotos: [], addedServices: [], },
  
  // Registry test appointments for May 9, 2025
  { id: 'appt_registry_test_1', patientId: initialMockPatientsData[0].id, locationId: LOCATIONS[0].id, professionalId: initialMockProfessionalsData.find(p => p.locationId === LOCATIONS[0].id && p.firstName === 'Profesional 1')?.id, serviceId: initialMockServicesData[0].id, appointmentDateTime: formatISO(setHours(setMinutes(fixedFutureDateForRegistry, 0), 10)), durationMinutes: initialMockServicesData[0].defaultDuration, status: APPOINTMENT_STATUS.COMPLETED, amountPaid: initialMockServicesData[0].price, paymentMethod: PAYMENT_METHODS[0], createdAt: formatISO(fixedFutureDateForRegistry), updatedAt: formatISO(fixedFutureDateForRegistry), addedServices: [], attachedPhotos: [] },
  { id: 'appt_registry_test_2', patientId: initialMockPatientsData[1].id, locationId: LOCATIONS[1].id, professionalId: initialMockProfessionalsData.find(p => p.locationId === LOCATIONS[1].id && p.firstName === 'Profesional 1')?.id, serviceId: initialMockServicesData[1].id, appointmentDateTime: formatISO(setHours(setMinutes(fixedFutureDateForRegistry, 30), 11)), durationMinutes: initialMockServicesData[1].defaultDuration, status: APPOINTMENT_STATUS.COMPLETED, amountPaid: initialMockServicesData[1].price, paymentMethod: PAYMENT_METHODS[1], createdAt: formatISO(fixedFutureDateForRegistry), updatedAt: formatISO(fixedFutureDateForRegistry), addedServices: [], attachedPhotos: [] },
  { id: 'appt_registry_test_3', patientId: initialMockPatientsData[2].id, locationId: LOCATIONS[0].id, professionalId: initialMockProfessionalsData.find(p => p.locationId === LOCATIONS[0].id && p.firstName === 'Profesional 2')?.id, serviceId: initialMockServicesData[2].id, appointmentDateTime: formatISO(setHours(setMinutes(fixedFutureDateForRegistry, 0), 14)), durationMinutes: initialMockServicesData[2].defaultDuration, status: APPOINTMENT_STATUS.COMPLETED, amountPaid: initialMockServicesData[2].price, paymentMethod: PAYMENT_METHODS[2], createdAt: formatISO(fixedFutureDateForRegistry), updatedAt: formatISO(fixedFutureDateForRegistry), addedServices: [], attachedPhotos: [] },

  // New appointments for April 2025
  {
    id: 'appt_april_001',
    patientId: 'pat001', // Ana García
    locationId: LOCATIONS[0].id, // Higuereta
    professionalId: initialMockProfessionalsData.find(p => p.id === 'prof-higuereta-1')?.id,
    serviceId: initialMockServicesData[0].id, // Consulta General
    appointmentDateTime: formatISO(setHours(setMinutes(april20_2025, 0), 10)), // April 20, 2025, 10:00 AM
    durationMinutes: initialMockServicesData[0].defaultDuration,
    status: APPOINTMENT_STATUS.COMPLETED,
    amountPaid: initialMockServicesData[0].price,
    paymentMethod: PAYMENT_METHODS[0], // Efectivo
    createdAt: formatISO(april20_2025),
    updatedAt: formatISO(april20_2025),
    attachedPhotos: [],
    addedServices: [],
  },
  {
    id: 'appt_april_002',
    patientId: 'pat004', // Carlos Vargas
    locationId: LOCATIONS[5].id, // San Antonio
    professionalId: initialMockProfessionalsData.find(p => p.id === 'prof-san_antonio-1')?.id,
    serviceId: initialMockServicesData[1].id, // Tratamiento de Uñas
    appointmentDateTime: formatISO(setHours(setMinutes(april22_2025, 30), 14)), // April 22, 2025, 02:30 PM
    durationMinutes: initialMockServicesData[1].defaultDuration,
    status: APPOINTMENT_STATUS.COMPLETED,
    amountPaid: initialMockServicesData[1].price,
    paymentMethod: PAYMENT_METHODS[1], // Tarjeta de Crédito
    createdAt: formatISO(april22_2025),
    updatedAt: formatISO(april22_2025),
    attachedPhotos: [],
    addedServices: [],
  },
];


interface MockDB {
  users: User[];
  professionals: Professional[];
  patients: Patient[];
  services: Service[];
  appointments: Appointment[];
}

let globalMockDB: MockDB | null = null;

function initializeGlobalMockStore(): MockDB {
  if (typeof window !== 'undefined') {
    if (!(window as any).__globalMockDB) {
      (window as any).__globalMockDB = {
        users: [...initialMockUsersData],
        professionals: [...initialMockProfessionalsData],
        patients: [...initialMockPatientsData],
        services: [...initialMockServicesData],
        appointments: [...initialMockAppointmentsData],
      };
    }
    return (window as any).__globalMockDB;
  } else {
    if (!globalMockDB) {
      globalMockDB = {
        users: [...initialMockUsersData],
        professionals: [...initialMockProfessionalsData],
        patients: [...initialMockPatientsData],
        services: [...initialMockServicesData],
        appointments: [...initialMockAppointmentsData],
      };
    }
    return globalMockDB;
  }
}

const mockDB = initializeGlobalMockStore();


export const getUserByUsername = async (username: string): Promise<User | undefined> => {
    if (useMockDatabase) {
        return mockDB.users.find(u => u.username === username);
    }
    throw new Error("User retrieval not implemented for non-mock database or mockDB not available.");
};

export type ContractDisplayStatus = 'Activo' | 'Próximo a Vencer' | 'Vencido' | 'Sin Contrato';

export const getContractDisplayStatus = (contract: Contract | null | undefined, referenceDateParam?: Date): ContractDisplayStatus => {
    const referenceDate = startOfDay(referenceDateParam || new Date()); // Use current date if no referenceDate is passed
    if (!contract || !contract.endDate) {
        return 'Sin Contrato';
    }
    const endDate = parseISO(contract.endDate);

    if (isBefore(endDate, referenceDate)) {
        return 'Vencido';
    }
    const daysUntilExpiry = differenceInCalendarDays(endDate, referenceDate);
    if (daysUntilExpiry <= 15) { // Contract expires in 15 days or less
        return 'Próximo a Vencer';
    }
    return 'Activo';
};


export const getProfessionals = async (locationId?: LocationId): Promise<(Professional & { contractDisplayStatus: ContractDisplayStatus })[]> => {
    if (useMockDatabase) {
        let professionalsResult = locationId
            ? mockDB.professionals.filter(p => p.locationId === locationId)
            : [...mockDB.professionals];

        // Calculate biWeeklyEarnings based on the *actual current date's* fortnight
        const todayForEarnings = startOfDay(new Date()); 
        const currentYear = getYear(todayForEarnings);
        const currentMonth = getMonth(todayForEarnings);
        const currentDay = getDate(todayForEarnings);
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
                   isWithinInterval(apptDate, { start: startOfDay(startDate), end: endOfDay(endDate) }) &&
                   (locationId ? appt.locationId === locationId : true); 
        });

        const professionalsWithStatus = professionalsResult.map(prof => {
            const profAppointments = appointmentsForPeriod.filter(appt => appt.professionalId === prof.id);
            const earnings = profAppointments.reduce((sum, appt) => sum + (appt.amountPaid || 0), 0);
            // Contract display status should also use the actual current date for relevance on the Professionals page
            return { 
                ...prof, 
                biWeeklyEarnings: earnings,
                contractDisplayStatus: getContractDisplayStatus(prof.currentContract, new Date())
            };
        });

        return professionalsWithStatus;
    }
    throw new Error("Professional retrieval not implemented for non-mock database or mockDB not available.");
};

export const getProfessionalById = async (id: string): Promise<Professional | undefined> => {
    if (useMockDatabase) {
        const prof = mockDB.professionals.find(p => p.id === id);
        if (prof) {
            // Pass current date to getContractDisplayStatus for accurate status
            return { ...prof, contractDisplayStatus: getContractDisplayStatus(prof.currentContract, new Date()) } as Professional & { contractDisplayStatus: ContractDisplayStatus};
        }
        return undefined;
    }
    throw new Error("Professional retrieval not implemented for non-mock database or mockDB not available.");
};

export const addProfessional = async (data: ProfessionalFormData): Promise<Professional> => {
  if (useMockDatabase) {
    let currentContract: Contract | null = null;
    if (data.currentContract_startDate && data.currentContract_endDate) {
        currentContract = {
            id: generateId(), // Always generate new ID for a new contract instance
            startDate: formatISO(data.currentContract_startDate, { representation: 'date' }),
            endDate: formatISO(data.currentContract_endDate, { representation: 'date' }),
            notes: data.currentContract_notes || undefined,
            empresa: data.currentContract_empresa || undefined,
        };
    }

    const professionalToSave: Omit<Professional, 'id' | 'biWeeklyEarnings'> = {
        firstName: data.firstName,
        lastName: data.lastName,
        locationId: data.locationId,
        phone: data.phone || undefined,
        workSchedule: {},
        customScheduleOverrides: data.customScheduleOverrides?.map(ov => ({
            id: ov.id || generateId(),
            date: formatISO(ov.date, { representation: 'date' }),
            isWorking: ov.isWorking,
            startTime: ov.isWorking ? ov.startTime : undefined,
            endTime: ov.isWorking ? ov.endTime : undefined,
            notes: ov.notes,
        })) || [],
        currentContract: currentContract,
        contractHistory: [], 
    };

    if (data.workSchedule) {
      (Object.keys(data.workSchedule) as Array<DayOfWeekId>).forEach(dayId => {
        const dayData = data.workSchedule![dayId];
        if (dayData) {
          professionalToSave.workSchedule[dayId] = {
            startTime: dayData.startTime || '00:00',
            endTime: dayData.endTime || '00:00',
            isWorking: dayData.isWorking === undefined ? true : dayData.isWorking
          };
        } else {
          professionalToSave.workSchedule[dayId] = {startTime: '00:00', endTime: '00:00', isWorking: false};
        }
      });
    } else {
       DAYS_OF_WEEK.forEach(day => {
           professionalToSave.workSchedule[day.id] = {startTime: '00:00', endTime: '00:00', isWorking: false};
       });
    }


    const newProfessional: Professional = {
      id: data.id || generateId(), // Use provided ID if editing, else generate new
      ...professionalToSave,
      biWeeklyEarnings: 0, // Initialize earnings
    };
    mockDB.professionals.push(newProfessional);
    return newProfessional;
  }
  throw new Error("Professional creation not implemented for non-mock database or mockDB not available.");
};

export const updateProfessional = async (id: string, data: Partial<ProfessionalFormData>): Promise<Professional | undefined> => {
    if (useMockDatabase) {
        const index = mockDB.professionals.findIndex(p => p.id === id);
        if (index !== -1) {
            const professionalToUpdate = { ...mockDB.professionals[index] };
            const oldContract = professionalToUpdate.currentContract ? { ...professionalToUpdate.currentContract } : null;
            
            if(data.firstName) professionalToUpdate.firstName = data.firstName;
            if(data.lastName) professionalToUpdate.lastName = data.lastName;
            if(data.locationId) professionalToUpdate.locationId = data.locationId;
            professionalToUpdate.phone = data.phone === null ? undefined : (data.phone ?? professionalToUpdate.phone);


            if (data.workSchedule) {
                professionalToUpdate.workSchedule = { ...professionalToUpdate.workSchedule };
                 (Object.keys(data.workSchedule) as Array<DayOfWeekId>).forEach(dayId => {
                    const dayData = data.workSchedule![dayId];
                    if (dayData) {
                        professionalToUpdate.workSchedule[dayId] = {
                            startTime: dayData.startTime || '00:00',
                            endTime: dayData.endTime || '00:00',
                            isWorking: dayData.isWorking === undefined ? true : dayData.isWorking
                        };
                    } else {
                         professionalToUpdate.workSchedule[dayId] = {startTime: '00:00', endTime: '00:00', isWorking: false};
                    }
                });
            }

            if (data.customScheduleOverrides) {
                professionalToUpdate.customScheduleOverrides = data.customScheduleOverrides.map(ov => ({
                    id: ov.id || generateId(),
                    date: formatISO(ov.date, { representation: 'date' }),
                    isWorking: ov.isWorking,
                    startTime: ov.isWorking ? ov.startTime : undefined,
                    endTime: ov.isWorking ? ov.endTime : undefined,
                    notes: ov.notes,
                }));
            }
            
            let newProposedContractData: Partial<Contract> = {};
            let contractFieldsTouchedInPayload = false;

            if (data.hasOwnProperty('currentContract_startDate')) {
                newProposedContractData.startDate = data.currentContract_startDate ? formatISO(data.currentContract_startDate, { representation: 'date' }) : undefined;
                contractFieldsTouchedInPayload = true;
            }
            if (data.hasOwnProperty('currentContract_endDate')) {
                newProposedContractData.endDate = data.currentContract_endDate ? formatISO(data.currentContract_endDate, { representation: 'date' }) : undefined;
                contractFieldsTouchedInPayload = true;
            }
             if (data.hasOwnProperty('currentContract_notes')) { // Check explicitly for null/undefined to allow clearing
                newProposedContractData.notes = data.currentContract_notes === null ? undefined : (data.currentContract_notes || undefined);
                contractFieldsTouchedInPayload = true;
            }
            if (data.hasOwnProperty('currentContract_empresa')) { // Check explicitly for null/undefined
                newProposedContractData.empresa = data.currentContract_empresa === null ? undefined : (data.currentContract_empresa || undefined);
                contractFieldsTouchedInPayload = true;
            }


            if (contractFieldsTouchedInPayload) {
                 // This logic handles both new contracts and modifications to existing ones.
                // A "new" contract is created if start/end dates are provided and they differ from an existing one,
                // or if no current contract exists.
                const isCreatingNewContractInstance = 
                    (newProposedContractData.startDate && newProposedContractData.endDate) && 
                    (!oldContract || 
                     oldContract.startDate !== newProposedContractData.startDate || 
                     oldContract.endDate !== newProposedContractData.endDate ||
                     (oldContract.notes || '') !== (newProposedContractData.notes || '') ||  // Consider notes/empresa changes for new instance
                     (oldContract.empresa || '') !== (newProposedContractData.empresa || '')
                    );

                if (isCreatingNewContractInstance) {
                    if (oldContract && oldContract.id && !professionalToUpdate.contractHistory?.find(h => h.id === oldContract!.id)) {
                        professionalToUpdate.contractHistory = [...(professionalToUpdate.contractHistory || []), oldContract];
                    }
                    professionalToUpdate.currentContract = {
                        id: generateId(), // New contract instance gets a new ID
                        startDate: newProposedContractData.startDate!,
                        endDate: newProposedContractData.endDate!,
                        notes: newProposedContractData.notes,
                        empresa: newProposedContractData.empresa,
                    };
                } else if (oldContract && (newProposedContractData.notes !== undefined || newProposedContractData.empresa !== undefined)) {
                    // Just updating notes/empresa on the existing current contract
                    professionalToUpdate.currentContract = {
                        ...oldContract,
                        notes: newProposedContractData.notes !== undefined ? newProposedContractData.notes : oldContract.notes,
                        empresa: newProposedContractData.empresa !== undefined ? newProposedContractData.empresa : oldContract.empresa,
                    };
                } else if (!newProposedContractData.startDate && !newProposedContractData.endDate && !newProposedContractData.notes && !newProposedContractData.empresa && oldContract) {
                     // This case should mean fields were cleared to remove the contract
                    if (oldContract && oldContract.id && !professionalToUpdate.contractHistory?.find(h => h.id === oldContract!.id)) {
                        professionalToUpdate.contractHistory = [...(professionalToUpdate.contractHistory || []), oldContract];
                    }
                    professionalToUpdate.currentContract = null;
                }
            }


            mockDB.professionals[index] = professionalToUpdate;
            return professionalToUpdate;
        }
        return undefined;
    }
    throw new Error("Professional update not implemented for non-mock database or mockDB not available.");
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
        const today = startOfDay(new Date()); 
        const isAdminOrContador = user.role === USER_ROLES.ADMIN || user.role === USER_ROLES.CONTADOR;
        const effectiveLocationId = isAdminOrContador
        ? (adminSelectedLocation === 'all' ? undefined : adminSelectedLocation)
        : user.locationId;

        const dailyAppointments = (mockDB.appointments || []).filter(appt =>
          appt.appointmentDateTime && dateFnsIsSameDay(parseISO(appt.appointmentDateTime), today) &&
          (effectiveLocationId ? appt.locationId === effectiveLocationId : true) &&
          (appt.status === APPOINTMENT_STATUS.BOOKED || appt.status === APPOINTMENT_STATUS.CONFIRMED)
        );
        const patientIdsWithAppointmentsToday = new Set(dailyAppointments.map(app => app.patientId));
        filteredMockPatients = filteredMockPatients.filter(p => patientIdsWithAppointmentsToday.has(p.id));
    }
    filteredMockPatients.sort((a,b) => `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`));
    const totalCount = filteredMockPatients.length;

    let paginatedPatients: Patient[] = [];
    let newLastVisibleId: string | null = null;

    if (startAfterId) {
        const lastIndex = filteredMockPatients.findIndex(p => p.id === startAfterId);
        if (lastIndex !== -1) {
            paginatedPatients = filteredMockPatients.slice(lastIndex + 1, lastIndex + 1 + queryLimit);
        } else {
            // Fallback if lastVisibleId is somehow invalid or not found, start from page 1
            const startIndex = (page - 1) * queryLimit; // Recalculate startIndex for safety
            paginatedPatients = filteredMockPatients.slice(startIndex, startIndex + queryLimit);
        }
    } else {
         const startIndex = (page - 1) * queryLimit;
         paginatedPatients = filteredMockPatients.slice(startIndex, startIndex + queryLimit);
    }
    
    newLastVisibleId = paginatedPatients.length > 0 ? paginatedPatients[paginatedPatients.length - 1].id : null;

    return { patients: paginatedPatients, totalCount, lastVisiblePatientId: newLastVisibleId };
  }
  throw new Error("Patient retrieval not implemented for non-mock database or mockDB not available.");
};

export const getPatientById = async (id: string): Promise<Patient | undefined> => {
    if (useMockDatabase) {
        return mockDB.patients.find(p => p.id === id);
    }
    throw new Error("Patient retrieval not implemented for non-mock database or mockDB not available.");
};

export const findPatient = async (firstName: string, lastName: string): Promise<Patient | undefined> => {
    if (useMockDatabase) {
        return mockDB.patients.find(p => p.firstName.toLowerCase() === firstName.toLowerCase() && p.lastName.toLowerCase() === lastName.toLowerCase());
    }
    throw new Error("Patient retrieval not implemented for non-mock database or mockDB not available.");
};

export const addPatient = async (data: Partial<Omit<Patient, 'id'>>): Promise<Patient> => {
  const newPatientData: Omit<Patient, 'id'> = {
    firstName: data.firstName!,
    lastName: data.lastName!,
    phone: data.phone,
    age: data.age === undefined ? null : data.age,
    isDiabetic: data.isDiabetic || false,
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
  throw new Error("Patient creation not implemented for non-mock database or mockDB not available.");
};

export const updatePatient = async (id: string, data: Partial<Patient>): Promise<Patient | undefined> => {
    if (useMockDatabase) {
        const index = mockDB.patients.findIndex(p => p.id === id);
        if (index !== -1) {
            const patientToUpdate = { ...mockDB.patients[index], ...data };
             if (data.hasOwnProperty('age') && data.age === null) { // Explicitly allow setting age to null
                patientToUpdate.age = null;
            }
            mockDB.patients[index] = patientToUpdate;
            return mockDB.patients[index];
        }
        return undefined;
    }
    throw new Error("Patient update not implemented for non-mock database or mockDB not available.");
};

export const getServices = async (): Promise<Service[]> => {
    if (useMockDatabase) {
        return [...mockDB.services].sort((a, b) => a.name.localeCompare(b.name));
    }
    throw new Error("Service retrieval not implemented for non-mock database or mockDB not available.");
};

export const getServiceById = async (id: string): Promise<Service | undefined> => {
    if (useMockDatabase) {
        return mockDB.services.find(s => s.id === id);
    }
    throw new Error("Service retrieval not implemented for non-mock database or mockDB not available.");
};

export const addService = async (data: ServiceFormData): Promise<Service> => {
  const totalDurationMinutes = (data.defaultDuration.hours * 60) + data.defaultDuration.minutes;
  const newServiceData: Omit<Service, 'id'> = {
    name: data.name,
    defaultDuration: totalDurationMinutes,
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
  throw new Error("Service creation not implemented for non-mock database or mockDB not available.");
};

export const updateService = async (id: string, data: Partial<ServiceFormData>): Promise<Service | undefined> => {
    if (useMockDatabase) {
        const index = mockDB.services.findIndex(s => s.id === id);
        if (index !== -1) {
            const serviceToUpdate = { ...mockDB.services[index] };
            if (data.name) serviceToUpdate.name = data.name;
            if (data.defaultDuration) {
              serviceToUpdate.defaultDuration = (data.defaultDuration.hours * 60) + data.defaultDuration.minutes;
            }
            if (data.price !== undefined) serviceToUpdate.price = data.price;

            mockDB.services[index] = serviceToUpdate;
            return mockDB.services[index];
        }
        return undefined;
    }
    throw new Error("Service update not implemented for non-mock database or mockDB not available.");
};


const populateAppointment = async (apptData: any): Promise<Appointment> => {
    const patient = useMockDatabase ? mockDB.patients.find(p => p.id === apptData.patientId) : undefined;
    const professional = apptData.professionalId ? (useMockDatabase ? mockDB.professionals.find(p => p.id === apptData.professionalId) : undefined ) : undefined;
    const service = apptData.serviceId ? (useMockDatabase ? mockDB.services.find(s => s.id === apptData.serviceId) : undefined ) : undefined;

    let addedServicesPopulated = [];
    if (apptData.addedServices && Array.isArray(apptData.addedServices)) {
        addedServicesPopulated = await Promise.all(
            apptData.addedServices.map(async (as: any) => ({
                ...as,
                service: as.serviceId ? (useMockDatabase ? mockDB.services.find(s => s.id === as.serviceId) : undefined ) : undefined,
                professional: as.professionalId ? (useMockDatabase ? mockDB.professionals.find(p => p.id === as.professionalId) : undefined ) : undefined,
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
      const targetLocationIds = Array.isArray(restFilters.locationId) ? restFilters.locationId : [restFilters.locationId];
      if (targetLocationIds.length > 0) {
          filteredMockAppointments = filteredMockAppointments.filter(appt =>
              targetLocationIds.includes(appt.locationId) ||
              (appt.isExternalProfessional && appt.externalProfessionalOriginLocationId && targetLocationIds.includes(appt.externalProfessionalOriginLocationId))
          );
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
    let populatedAppointmentsResult = await Promise.all(populatedAppointmentsPromises);

    const totalCount = populatedAppointmentsResult.length;
    let paginatedResult: Appointment[] = [];

    if (startAfterId) {
        const lastIdx = populatedAppointmentsResult.findIndex(a => a.id === startAfterId);
        if (lastIdx !== -1) {
            paginatedResult = populatedAppointmentsResult.slice(lastIdx + 1, lastIdx + 1 + queryLimit);
        } else {
            // Fallback if lastVisibleId is somehow invalid or not found, start from page 1
            paginatedResult = populatedAppointmentsResult.slice(0, queryLimit);
        }
    } else {
        const startIndex = (page - 1) * queryLimit;
        paginatedResult = populatedAppointmentsResult.slice(startIndex, startIndex + queryLimit);
    }

    const newLastVisibleId = paginatedResult.length > 0 ? paginatedResult[paginatedResult.length -1].id : null;
    return { appointments: paginatedResult, totalCount, lastVisibleAppointmentId: newLastVisibleId };
  }
  throw new Error("Appointment retrieval not implemented for non-mock database or mockDB not available.");
};


export const getAppointmentById = async (id: string): Promise<Appointment | undefined> => {
    if (useMockDatabase) {
        const appt = mockDB.appointments.find(a => a.id === id);
        return appt ? populateAppointment(appt) : undefined;
    }
    throw new Error("Appointment retrieval not implemented for non-mock database or mockDB not available.");
};

export const addAppointment = async (data: AppointmentFormData & { isExternalProfessional?: boolean; externalProfessionalOriginLocationId?: LocationId | null } ): Promise<Appointment> => {
  let patientId = data.existingPatientId;
  if (!patientId) {
    let existingPatient = await findPatient(data.patientFirstName, data.patientLastName);
    if (existingPatient) {
      patientId = existingPatient.id;
       const patientUpdates: Partial<Patient> = {};
       if (data.isDiabetic !== undefined && existingPatient.isDiabetic !== data.isDiabetic) patientUpdates.isDiabetic = data.isDiabetic;
       if (data.age !== undefined && existingPatient.age !== data.age) patientUpdates.age = data.age;
       if (Object.keys(patientUpdates).length > 0) {
          await updatePatient(patientId, patientUpdates);
      }
    } else {
      const newPatient = await addPatient({
        firstName: data.patientFirstName,
        lastName: data.patientLastName,
        phone: data.patientPhone || undefined,
        age: data.age,
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
        if (data.age !== undefined && data.age !== existingPatientDetails.age) patientUpdates.age = data.age;
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
  const appointmentEndTime = dateFnsAddMinutes(parseISO(appointmentDateTime), appointmentDuration);

  let actualProfessionalId: string | undefined | null = undefined;

  if (data.preferredProfessionalId && data.preferredProfessionalId !== ANY_PROFESSIONAL_VALUE) {
    const preferredProf = await getProfessionalById(data.preferredProfessionalId);
    if (preferredProf) {
        if (data.searchExternal || preferredProf.locationId === data.locationId) {
            actualProfessionalId = preferredProf.id;
            if (data.searchExternal && preferredProf.locationId !== data.locationId) {
                data.isExternalProfessional = true;
                data.externalProfessionalOriginLocationId = preferredProf.locationId;
            } else {
                data.isExternalProfessional = false;
                data.externalProfessionalOriginLocationId = null;
            }
        } else {
            actualProfessionalId = null;
        }
    } else {
      actualProfessionalId = null;
    }
  } else {
     actualProfessionalId = null;
  }


  if (actualProfessionalId === null) {
    const professionalsToConsider = data.searchExternal
      ? await getProfessionals() 
      : await getProfessionals(data.locationId); 

    const appointmentsOnDateResult = await getAppointments({
      locationId: data.searchExternal ? undefined : data.locationId, 
      date: data.appointmentDate,
      statuses: [APPOINTMENT_STATUS.BOOKED, APPOINTMENT_STATUS.CONFIRMED]
    });
    const existingAppointmentsForDay = appointmentsOnDateResult.appointments || [];

    for (const prof of professionalsToConsider) {
      if (data.searchExternal && prof.locationId === data.locationId) continue;
      if (!data.searchExternal && prof.locationId !== data.locationId) continue;


      const availability = getProfessionalAvailabilityForDate(prof, data.appointmentDate);
      if (!availability) continue;

      const profWorkStartTime = parse(`${format(data.appointmentDate, 'yyyy-MM-dd')} ${availability.startTime}`, 'yyyy-MM-dd HH:mm', new Date());
      const profWorkEndTime = parse(`${format(data.appointmentDate, 'yyyy-MM-dd')} ${availability.endTime}`, 'yyyy-MM-dd HH:mm', new Date());

      if (!isWithinInterval(appointmentDateTimeObject, { start: profWorkStartTime, end: dateFnsAddMinutes(profWorkEndTime, -appointmentDuration +1) })) { 
          continue;
      }

      let isProfBusy = false;
      const profExistingAppointments = existingAppointmentsForDay.filter(ea => ea.professionalId === prof.id);

      for (const existingAppt of profExistingAppointments) {
        const existingApptStartTime = parseISO(existingAppt.appointmentDateTime);
        const existingApptEndTime = dateFnsAddMinutes(existingApptStartTime, existingAppt.durationMinutes);

        if (areIntervalsOverlapping(
            {start: appointmentDateTimeObject, end: appointmentEndTime},
            {start: existingApptStartTime, end: existingApptEndTime}
        )) {
            isProfBusy = true;
            break;
        }
      }
      if (!isProfBusy) {
        actualProfessionalId = prof.id;
        if (data.searchExternal && prof.locationId !== data.locationId) {
            data.isExternalProfessional = true;
            data.externalProfessionalOriginLocationId = prof.locationId;
        } else {
            data.isExternalProfessional = false;
            data.externalProfessionalOriginLocationId = null;
        }
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
    isExternalProfessional: data.isExternalProfessional || false,
    externalProfessionalOriginLocationId: data.isExternalProfessional ? data.externalProfessionalOriginLocationId : null,
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
  throw new Error("Appointment creation not implemented for non-mock database or mockDB not available.");
};

export const updateAppointment = async (id: string, data: Partial<Appointment>): Promise<Appointment | undefined> => {
  if (useMockDatabase) {
    const index = mockDB.appointments.findIndex(a => a.id === id);
    if (index !== -1) {
      const originalAppointment = mockDB.appointments[index];

      let updatedAppointmentRaw = {
        ...originalAppointment,
        ...data,
        updatedAt: formatISO(new Date()), 
      };

      if (data.patientId && originalAppointment.patient?.id !== data.patientId) {
          delete (updatedAppointmentRaw as any).patient;
      }
      if (data.professionalId && originalAppointment.professional?.id !== data.professionalId) {
          delete (updatedAppointmentRaw as any).professional;
      }
       if (data.hasOwnProperty('professionalId') && data.professionalId === null && originalAppointment.professional){
          delete (updatedAppointmentRaw as any).professional;
      }
      if (data.serviceId && originalAppointment.service?.id !== data.serviceId) {
          delete (updatedAppointmentRaw as any).service;
      }

      if (data.addedServices) {
        updatedAppointmentRaw.addedServices = data.addedServices.map(as => ({
          serviceId: as.serviceId,
          professionalId: as.professionalId,
          price: as.price,
        }));
      }

      if (data.hasOwnProperty('isExternalProfessional')) {
        updatedAppointmentRaw.isExternalProfessional = data.isExternalProfessional;
      }
      if (data.hasOwnProperty('externalProfessionalOriginLocationId')) {
        updatedAppointmentRaw.externalProfessionalOriginLocationId = data.externalProfessionalOriginLocationId;
      }


      const populatedAppointment = await populateAppointment(updatedAppointmentRaw);
      mockDB.appointments[index] = populatedAppointment;
      return populatedAppointment;
    }
    return undefined;
  }
  throw new Error("Appointment update not implemented for non-mock database or mockDB not available.");
};

export const getPatientAppointmentHistory = async (
  patientId: string,
  options: { page?: number, limit?: number, lastVisibleAppointmentId?: string | null } = {}
): Promise<{ appointments: Appointment[], totalCount: number, lastVisibleAppointmentId?: string | null }> => {
  const { page = 1, limit: queryLimit = APPOINTMENTS_PER_PAGE_HISTORY, lastVisibleAppointmentId: startAfterId } = options;
  const today = startOfDay(new Date()); 
  const pastStatuses: AppointmentStatus[] = [APPOINTMENT_STATUS.COMPLETED, APPOINTMENT_STATUS.NO_SHOW, APPOINTMENT_STATUS.CANCELLED_CLIENT, APPOINTMENT_STATUS.CANCELLED_STAFF];

  if (useMockDatabase) {
    let historyAppointments = (mockDB.appointments || []).filter(appt =>
      appt.patientId === patientId &&
      appt.appointmentDateTime && parseISO(appt.appointmentDateTime) < today &&
      pastStatuses.includes(appt.status)
    );
    
    historyAppointments.sort((a, b) => parseISO(b.appointmentDateTime).getTime() - parseISO(a.appointmentDateTime).getTime());
    
    const populatedHistoryPromises = historyAppointments.map(appt => populateAppointment(appt));
    let populatedHistory = await Promise.all(populatedHistoryPromises);

    const totalCount = populatedHistory.length;
    let paginatedAppointments: Appointment[] = [];

    if (startAfterId) {
        const lastIdx = populatedHistory.findIndex(a => a.id === startAfterId);
        if (lastIdx !== -1) {
            paginatedAppointments = populatedHistory.slice(lastIdx + 1, lastIdx + 1 + queryLimit);
        } else {
            // Fallback if lastVisibleId is somehow invalid or not found, start from page 1
            paginatedAppointments = populatedHistory.slice(0, queryLimit);
        }
    } else {
        const startIndex = (page - 1) * queryLimit;
        paginatedAppointments = populatedHistory.slice(startIndex, startIndex + queryLimit);
    }

    const newLastVisibleId = paginatedAppointments.length > 0 ? paginatedAppointments[paginatedAppointments.length -1].id : null;
    return { appointments: paginatedAppointments, totalCount, lastVisibleAppointmentId: newLastVisibleId };
  }
  throw new Error("Patient appointment history retrieval not implemented for non-mock database or mockDB not available.");
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
    endDate = dateFnsAddMinutes(startOfDay(startDate), (15 * 24 * 60) -1); // Ends on day 15 at 23:59
  } else {
    startDate = addDays(startOfMonth(setMonth(setYear(new Date(), currentYear), currentMonth)), 15);
    endDate = endOfMonth(setMonth(setYear(new Date(), currentYear), currentMonth));
  }
  return { start: startOfDay(startDate), end: endOfDay(endDate) };
};

export const getProfessionalAppointmentsForDate = async (professionalId: string, date: Date): Promise<Appointment[]> => {
  if (useMockDatabase) {
    const targetDate = startOfDay(date);
    const professionalAppointments = (mockDB.appointments || [])
      .filter(appt =>
        appt.professionalId === professionalId &&
        dateFnsIsSameDay(parseISO(appt.appointmentDateTime), targetDate) &&
        (appt.status === APPOINTMENT_STATUS.BOOKED || appt.status === APPOINTMENT_STATUS.CONFIRMED)
      )
      .sort((a, b) => parseISO(a.appointmentDateTime).getTime() - parseISO(b.appointmentDateTime).getTime());

    const populatedAppointments = await Promise.all(professionalAppointments.map(populateAppointment));
    return populatedAppointments;
  }
  throw new Error("Professional appointments retrieval not implemented for non-mock database or mockDB not available.");
};


export function getProfessionalAvailabilityForDate(
  professional: Professional,
  targetDate: Date 
): { startTime: string; endTime: string; notes?: string } | null {
  
  const contractStatus = getContractDisplayStatus(professional.currentContract, targetDate);
  if (contractStatus !== 'Activo') {
    return null; 
  }

  const dateToCheck = startOfDay(targetDate); 
  const targetDateString = format(dateToCheck, 'yyyy-MM-dd');
  const targetDayOfWeekJs = getDay(dateToCheck); 

  if (professional.customScheduleOverrides) {
    const override = professional.customScheduleOverrides.find(
      ov => ov.date === targetDateString
    );
    if (override) {
      if (override.isWorking && override.startTime && override.endTime) {
        return { startTime: override.startTime, endTime: override.endTime, notes: override.notes };
      }
      return null; 
    }
  }
  
  if (professional.workSchedule) {
    // JavaScript's getDay(): Sunday is 0, Monday is 1, ..., Saturday is 6
    // Our DAYS_OF_WEEK: Monday is 0, ..., Sunday is 6
    // Adjust: (targetDayOfWeekJs + 6) % 7 maps JS Sunday (0) to our Sunday (6), JS Monday (1) to our Monday (0), etc.
    const dayKey = DAYS_OF_WEEK[(targetDayOfWeekJs + 6) % 7].id as DayOfWeekId; 
    
    if (dayKey) { 
        const dailySchedule = professional.workSchedule[dayKey];
        if (dailySchedule) { 
        if (dailySchedule.isWorking === false) return null; // Explicitly not working

        // If isWorking is true or undefined (implicit true), and times are set:
        if ((dailySchedule.isWorking === true || dailySchedule.isWorking === undefined) && dailySchedule.startTime && dailySchedule.endTime) {
            return { startTime: dailySchedule.startTime, endTime: dailySchedule.endTime };
        }
        return null; // Incomplete schedule for a working day
        }
    }
  }
  return null; // No schedule defined for the day
}
