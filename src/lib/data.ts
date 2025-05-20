
// src/lib/data.ts
import type { User, Professional, Patient, Service, Appointment, AppointmentFormData, ProfessionalFormData, AppointmentStatus, ServiceFormData, Contract, PeriodicReminder, ImportantNote, ImportantNoteFormData, PeriodicReminderFormData } from '@/types';
import { LOCATIONS, USER_ROLES, SERVICES as SERVICES_CONSTANTS, APPOINTMENT_STATUS, LocationId, ServiceId as ConstantServiceId, APPOINTMENT_STATUS_DISPLAY, PAYMENT_METHODS, TIME_SLOTS, DAYS_OF_WEEK } from './constants';
import type { DayOfWeekId } from './constants';
import { formatISO, parseISO, addDays, setHours, setMinutes, startOfDay, endOfDay, isSameDay as dateFnsIsSameDay, startOfMonth, endOfMonth, subDays, isEqual, isBefore, isAfter, getDate, getYear, getMonth, setMonth, setYear, getHours, addMinutes as dateFnsAddMinutes, isWithinInterval, getDay, format, differenceInCalendarDays, areIntervalsOverlapping, parse, differenceInDays } from 'date-fns';
import { es } from 'date-fns/locale';
import { firestore, useMockDatabase } from './firebase-config'; // Centralized mock flag
import { collection, addDoc, getDocs, doc, getDoc, updateDoc, query, where, deleteDoc, writeBatch, serverTimestamp, Timestamp, runTransaction, setDoc, QueryConstraint, orderBy, limit, startAfter, getCountFromServer, documentId, CollectionReference, DocumentData } from 'firebase/firestore';


const generateId = (): string => {
  return Math.random().toString(36).substr(2, 9) + Date.now().toString(36);
};
const ANY_PROFESSIONAL_VALUE = "_any_professional_placeholder_";

// --- Firestore Data Conversion Helpers ---
const toFirestoreTimestamp = (date: Date | string | undefined | null): Timestamp | null => {
  if (!date) return null;
  const d = typeof date === 'string' ? parseISO(date) : date;
  return Timestamp.fromDate(d);
};

const fromFirestoreTimestamp = (timestamp: Timestamp | undefined | null): string | null => {
  if (!timestamp) return null;
  return timestamp.toDate().toISOString();
};

const convertDocumentData = (docData: DocumentData): any => {
  const data = { ...docData };
  for (const key in data) {
    if (data[key] instanceof Timestamp) {
      data[key] = fromFirestoreTimestamp(data[key]);
    } else if (typeof data[key] === 'object' && data[key] !== null && !Array.isArray(data[key])) {
      // Recursively convert nested objects (like workSchedule, currentContract)
      data[key] = convertDocumentData(data[key]);
    } else if (Array.isArray(data[key])) {
      // Recursively convert objects within arrays (like customScheduleOverrides, contractHistory)
      data[key] = data[key].map(item => (typeof item === 'object' && item !== null && !(item instanceof Timestamp)) ? convertDocumentData(item) : item);
    }
  }
  return data;
};


// --- Initial Mock Data Definitions ---
const todayMock = new Date(2025, 4, 13); // Tuesday, May 13, 2025 (month is 0-indexed)
const yesterdayMock = subDays(todayMock, 1);
const twoDaysAgoMock = subDays(todayMock, 2);
const tomorrowMock = addDays(todayMock,1);
const fixedFutureDateForRegistry = new Date(2025, 4, 9); 
const april20_2025 = new Date(2025, 3, 20); 
const april22_2025 = new Date(2025, 3, 22); 


const initialMockUsersData: User[] = [
  { id: 'admin001', username: 'Admin', password: 'admin', role: USER_ROLES.ADMIN, name: 'Administrador General del Sistema', locationId: undefined },
  { id: 'contador001', username: 'Contador', password: 'admin', role: USER_ROLES.CONTADOR, name: 'Contador del Sistema', locationId: undefined },
  { id: 'user-higuereta', username: 'HigueretaStaff', password: 'admin', role: USER_ROLES.LOCATION_STAFF, locationId: 'higuereta', name: 'Personal de Sede Higuereta' },
  { id: 'user-eden_benavides', username: 'EdenBenavidesStaff', password: 'admin', role: USER_ROLES.LOCATION_STAFF, locationId: 'eden_benavides', name: 'Personal de Sede Edén Benavides' },
  { id: 'user-crucetas', username: 'CrucetasStaff', password: 'admin', role: USER_ROLES.LOCATION_STAFF, locationId: 'crucetas', name: 'Personal de Sede Crucetas' },
  { id: 'user-carpaccio', username: 'CarpaccioStaff', password: 'admin', role: USER_ROLES.LOCATION_STAFF, locationId: 'carpaccio', name: 'Personal de Sede Carpaccio' },
  { id: 'user-vista_alegre', username: 'VistaAlegreStaff', password: 'admin', role: USER_ROLES.LOCATION_STAFF, locationId: 'vista_alegre', name: 'Personal de Sede Vista Alegre' },
  { id: 'user-san_antonio', username: 'SanAntonioStaff', password: 'admin', role: USER_ROLES.LOCATION_STAFF, locationId: 'san_antonio', name: 'Personal de Sede San Antonio' },
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
    const baseSchedule: { [key in DayOfWeekId]?: { startTime: string; endTime: string; isWorking?: boolean } | null } = {};
    DAYS_OF_WEEK.forEach(dayInfo => {
        baseSchedule[dayInfo.id] = {
            isWorking: true,
            startTime: dayInfo.id === 'saturday' ? '09:00' : (dayInfo.id === 'sunday' ? '10:00' : '10:00'),
            endTime: dayInfo.id === 'saturday' ? '18:00' : (dayInfo.id === 'sunday' ? '18:00' : '19:00'),
        };
    });
    
    let currentContract: Contract | null = null;
    if (i < 2) { // Ensure first two professionals per location have active contracts
        const contractStartDate = subDays(todayMock, 60); 
        const contractEndDate = addDays(todayMock, 90);   
        currentContract = {
            id: generateId(),
            startDate: formatISO(contractStartDate, { representation: 'date' }),
            endDate: formatISO(contractEndDate, { representation: 'date' }),
            notes: `Contrato activo para ${location.name} prof ${i + 1}`,
            empresa: `Empresa Footprints ${location.name}`,
        };
    } else { 
        if (i % 3 === 0) { 
            const contractStartDate = subDays(todayMock, 30);
            const contractEndDate = addDays(todayMock, Math.floor(Math.random() * 60) + 30); // Random active duration
            currentContract = {
                id: generateId(),
                startDate: formatISO(contractStartDate, { representation: 'date' }),
                endDate: formatISO(contractEndDate, { representation: 'date' }),
                notes: `Contrato estándar activo ${i + 1}`,
                empresa: (i % 2 === 0) ? 'Empresa A' : 'Empresa B',
            };
        } else if (i % 3 === 1) { 
             const contractStartDate = subDays(todayMock, 120);
             const contractEndDate = subDays(todayMock, 30); 
             currentContract = {
                 id: generateId(),
                 startDate: formatISO(contractStartDate, { representation: 'date' }),
                 endDate: formatISO(contractEndDate, { representation: 'date' }),
                 notes: `Contrato vencido ${i + 1}`,
                 empresa: 'Empresa Expirada C',
             };
        }
    }
    return {
      id: `prof-${location.id}-${i + 1}`,
      firstName: `Profesional ${i + 1}`,
      lastName: location.name.split(' ')[0],
      locationId: location.id,
      phone: `9876543${locIndex}${i + 1}`,
      biWeeklyEarnings: Math.random() * 1500 + 500,
      workSchedule: baseSchedule,
      customScheduleOverrides: [],
      currentContract: currentContract,
      contractHistory: [],
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
  {
    id: 'appt001', patientId: 'pat001', locationId: LOCATIONS[0].id, professionalId: initialMockProfessionalsData.find(p => p.locationId === LOCATIONS[0].id)?.id || initialMockProfessionalsData[0]?.id, serviceId: initialMockServicesData[0].id, appointmentDateTime: formatISO(setHours(setMinutes(yesterdayMock, 0), 10)), durationMinutes: initialMockServicesData[0].defaultDuration, status: APPOINTMENT_STATUS.COMPLETED, amountPaid: initialMockServicesData[0].price, paymentMethod: PAYMENT_METHODS[0], staffNotes: "Tratamiento exitoso, paciente refiere mejoría.", attachedPhotos: ["https://placehold.co/200x200.png?text=Appt001" as string], addedServices: [{ serviceId: initialMockServicesData[2].id, price: initialMockServicesData[2].price }], createdAt: formatISO(subDays(yesterdayMock,1)), updatedAt: formatISO(yesterdayMock),
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
  { id: 'appt009', patientId: 'pat004', locationId: LOCATIONS[5].id, professionalId: initialMockProfessionalsData.find(p => p.locationId === LOCATIONS[5].id)?.id, serviceId: initialMockServicesData[2].id, appointmentDateTime: formatISO(setHours(setMinutes(subDays(startOfDay(todayMock), 5), 30), 14)), durationMinutes: initialMockServicesData[2].defaultDuration, status: APPOINTMENT_STATUS.COMPLETED, amountPaid: initialMockServicesData[2].price ? initialMockServicesData[2].price! + 20 : 70, paymentMethod: PAYMENT_METHODS[3], staffNotes: "Se realizó quiropodia y tratamiento adicional para uña encarnada.", addedServices: [{ serviceId: initialMockServicesData[1].id, price: 20 }], attachedPhotos: ["https://placehold.co/200x200.png?text=Appt009" as string], createdAt: formatISO(subDays(startOfDay(todayMock), 6)), updatedAt: formatISO(subDays(startOfDay(todayMock), 5)), },
  { id: 'appt010', patientId: 'pat005', locationId: LOCATIONS[0].id, serviceId: initialMockServicesData[3].id, appointmentDateTime: formatISO(setHours(setMinutes(addDays(startOfDay(todayMock), 2), 0), 17)), durationMinutes: initialMockServicesData[3].defaultDuration, status: APPOINTMENT_STATUS.BOOKED, preferredProfessionalId: initialMockProfessionalsData.find(p => p.locationId === LOCATIONS[0].id && p.lastName.includes('Higuereta'))?.id, bookingObservations: "Solo puede por la tarde.", createdAt: formatISO(startOfDay(todayMock)), updatedAt: formatISO(startOfDay(todayMock)), attachedPhotos: [], addedServices: [], },
  
  { id: 'appt_registry_test_1', patientId: initialMockPatientsData[0].id, locationId: LOCATIONS[0].id, professionalId: initialMockProfessionalsData.find(p => p.locationId === LOCATIONS[0].id && p.firstName === 'Profesional 1')?.id, serviceId: initialMockServicesData[0].id, appointmentDateTime: formatISO(setHours(setMinutes(fixedFutureDateForRegistry, 0), 10)), durationMinutes: initialMockServicesData[0].defaultDuration, status: APPOINTMENT_STATUS.COMPLETED, amountPaid: initialMockServicesData[0].price, paymentMethod: PAYMENT_METHODS[0], createdAt: formatISO(fixedFutureDateForRegistry), updatedAt: formatISO(fixedFutureDateForRegistry), addedServices: [], attachedPhotos: [] },
  { id: 'appt_registry_test_2', patientId: initialMockPatientsData[1].id, locationId: LOCATIONS[1].id, professionalId: initialMockProfessionalsData.find(p => p.locationId === LOCATIONS[1].id && p.firstName === 'Profesional 1')?.id, serviceId: initialMockServicesData[1].id, appointmentDateTime: formatISO(setHours(setMinutes(fixedFutureDateForRegistry, 30), 11)), durationMinutes: initialMockServicesData[1].defaultDuration, status: APPOINTMENT_STATUS.COMPLETED, amountPaid: initialMockServicesData[1].price, paymentMethod: PAYMENT_METHODS[1], createdAt: formatISO(fixedFutureDateForRegistry), updatedAt: formatISO(fixedFutureDateForRegistry), addedServices: [], attachedPhotos: [] },
  { id: 'appt_registry_test_3', patientId: initialMockPatientsData[2].id, locationId: LOCATIONS[0].id, professionalId: initialMockProfessionalsData.find(p => p.locationId === LOCATIONS[0].id && p.firstName === 'Profesional 2')?.id, serviceId: initialMockServicesData[2].id, appointmentDateTime: formatISO(setHours(setMinutes(fixedFutureDateForRegistry, 0), 14)), durationMinutes: initialMockServicesData[2].defaultDuration, status: APPOINTMENT_STATUS.COMPLETED, amountPaid: initialMockServicesData[2].price, paymentMethod: PAYMENT_METHODS[2], createdAt: formatISO(fixedFutureDateForRegistry), updatedAt: formatISO(fixedFutureDateForRegistry), addedServices: [], attachedPhotos: [] },
  {
    id: 'appt_april_001',
    patientId: 'pat001', 
    locationId: LOCATIONS[0].id, 
    professionalId: initialMockProfessionalsData.find(p => p.id === 'prof-higuereta-1')?.id,
    serviceId: initialMockServicesData[0].id, 
    appointmentDateTime: formatISO(setHours(setMinutes(april20_2025, 0), 10)), 
    durationMinutes: initialMockServicesData[0].defaultDuration,
    status: APPOINTMENT_STATUS.COMPLETED,
    amountPaid: initialMockServicesData[0].price,
    paymentMethod: PAYMENT_METHODS[0], 
    createdAt: formatISO(april20_2025),
    updatedAt: formatISO(april20_2025),
    attachedPhotos: [],
    addedServices: [],
  },
  {
    id: 'appt_april_002',
    patientId: 'pat004', 
    locationId: LOCATIONS[5].id, 
    professionalId: initialMockProfessionalsData.find(p => p.id === 'prof-san_antonio-1')?.id,
    serviceId: initialMockServicesData[1].id, 
    appointmentDateTime: formatISO(setHours(setMinutes(april22_2025, 30), 14)), 
    durationMinutes: initialMockServicesData[1].defaultDuration,
    status: APPOINTMENT_STATUS.COMPLETED,
    amountPaid: initialMockServicesData[1].price,
    paymentMethod: PAYMENT_METHODS[1], 
    createdAt: formatISO(april22_2025),
    updatedAt: formatISO(april22_2025),
    attachedPhotos: [],
    addedServices: [],
  },
];

const initialMockPeriodicRemindersData: PeriodicReminder[] = [
  { id: 'rem001', title: 'Pago IGV Mensual', dueDate: formatISO(setMonth(setYear(new Date(), 2025), 4), { representation: 'date'}), recurrence: 'monthly', amount: 350.00, status: 'pending', createdAt: formatISO(new Date()), updatedAt: formatISO(new Date()) },
  { id: 'rem002', title: 'Servicio de Luz Oficina', dueDate: formatISO(addDays(todayMock, 2), { representation: 'date'}), recurrence: 'monthly', amount: 120.50, status: 'pending', createdAt: formatISO(new Date()), updatedAt: formatISO(new Date()) },
  { id: 'rem003', title: 'Cuota Préstamo Banco X', dueDate: formatISO(subDays(todayMock, 10), { representation: 'date'}), recurrence: 'monthly', amount: 1200.00, status: 'paid', createdAt: formatISO(new Date()), updatedAt: formatISO(new Date()) },
  { id: 'rem004', title: 'Renovación SOAT Camioneta', dueDate: formatISO(addDays(todayMock, 40), { representation: 'date'}), recurrence: 'annually', amount: 450.00, status: 'pending', createdAt: formatISO(new Date()), updatedAt: formatISO(new Date()) },
  { id: 'rem005', title: 'Alquiler Local Principal', dueDate: formatISO(subDays(todayMock, 3), { representation: 'date'}), recurrence: 'monthly', amount: 2500.00, status: 'pending', createdAt: formatISO(new Date()), updatedAt: formatISO(new Date()) },
  { id: 'rem006', title: 'Declaración Anual Impuestos', dueDate: formatISO(addDays(todayMock, 1), { representation: 'date'}), recurrence: 'annually', amount: 150.00, status: 'pending', createdAt: formatISO(new Date()), updatedAt: formatISO(new Date()) },
];

const initialMockImportantNotesData: ImportantNote[] = [
    { id: 'note001', title: 'Procedimiento Nuevo Quiropodia', content: 'Revisar el nuevo protocolo para quiropodia avanzada que se implementará desde el 01/06/2025. Capacitación pendiente para todo el personal.', createdAt: formatISO(subDays(todayMock, 5)), updatedAt: formatISO(subDays(todayMock, 5))},
    { id: 'note002', title: 'Contacto Proveedor Insumos', content: 'Sr. Pérez - 999888777. Llamar la primera semana de cada mes para pedidos.', createdAt: formatISO(subDays(todayMock, 15)), updatedAt: formatISO(subDays(todayMock, 10))},
    { id: 'note003', title: 'Ideas Campaña Día de la Madre', content: 'Ofrecer 2x1 en reflexología. Crear paquetes especiales con descuento.', createdAt: formatISO(subDays(todayMock, 30)), updatedAt: formatISO(subDays(todayMock, 30))},
];


interface MockDB {
  users: User[];
  professionals: Professional[];
  patients: Patient[];
  services: Service[];
  appointments: Appointment[];
  periodicReminders: PeriodicReminder[];
  importantNotes: ImportantNote[];
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
        periodicReminders: [...initialMockPeriodicRemindersData],
        importantNotes: [...initialMockImportantNotesData],
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
        periodicReminders: [...initialMockPeriodicRemindersData],
        importantNotes: [...initialMockImportantNotesData],
      };
    }
    return globalMockDB;
  }
}

const mockDB = initializeGlobalMockStore();

// --- Helper to convert a Firestore document snapshot to a typed object ---
const docToData = <T extends BaseEntity>(docSnap: DocumentSnapshot): T | undefined => {
  if (!docSnap.exists()) return undefined;
  return { id: docSnap.id, ...convertDocumentData(docSnap.data()) } as T;
};

const docsToData = <T extends BaseEntity>(querySnapshot: QuerySnapshot): T[] => {
  return querySnapshot.docs.map(docSnap => ({ id: docSnap.id, ...convertDocumentData(docSnap.data()) } as T));
};

// --- Auth ---
export const getUserByUsername = async (username: string): Promise<User | undefined> => {
    if (useMockDatabase) {
        return mockDB.users.find(u => u.username === username);
    }
    if (!firestore) {
      console.error("Firestore not initialized in getUserByUsername");
      return undefined; // Or fallback to mock if desired for reads
    }
    const usersCol = collection(firestore, 'usuarios'); // 'usuarios' is the Spanish collection name
    const q = query(usersCol, where('username', '==', username));
    const snapshot = await getDocs(q);
    if (snapshot.empty) return undefined;
    return { id: snapshot.docs[0].id, ...convertDocumentData(snapshot.docs[0].data()) } as User;
};

// --- Professionals ---
export type ContractDisplayStatus = 'Activo' | 'Próximo a Vencer' | 'Vencido' | 'Sin Contrato';

export const getContractDisplayStatus = (contract: Contract | null | undefined, referenceDateParam?: Date): ContractDisplayStatus => {
    const referenceDate = startOfDay(referenceDateParam || new Date()); 
    if (!contract || !contract.endDate) {
        return 'Sin Contrato';
    }
    const endDate = parseISO(contract.endDate);

    if (isBefore(endDate, referenceDate)) {
        return 'Vencido';
    }
    const daysUntilExpiry = differenceInCalendarDays(endDate, referenceDate);
    if (daysUntilExpiry <= 15) { 
        return 'Próximo a Vencer';
    }
    return 'Activo';
};


export const getProfessionals = async (locationId?: LocationId): Promise<(Professional & { contractDisplayStatus: ContractDisplayStatus })[]> => {
    if (useMockDatabase) {
        let professionalsResult = locationId
            ? mockDB.professionals.filter(p => p.locationId === locationId)
            : [...mockDB.professionals];
        // Mock biWeeklyEarnings calculation
        const todayForEarnings = startOfDay(new Date());
        const currentYear = getYear(todayForEarnings);
        const currentMonth = getMonth(todayForEarnings);
        const currentDay = getDate(todayForEarnings);
        const currentQuincena = currentDay <= 15 ? 1 : 2;
        const startDate = currentQuincena === 1 ? startOfMonth(setMonth(setYear(new Date(), currentYear), currentMonth)) : addDays(startOfMonth(setMonth(setYear(new Date(), currentYear), currentMonth)), 15);
        const endDate = currentQuincena === 1 ? addDays(startOfMonth(setMonth(setYear(new Date(), currentYear), currentMonth)), 14) : endOfMonth(setMonth(setYear(new Date(), currentYear), currentMonth));
        const appointmentsForPeriod = (mockDB.appointments || []).filter(appt => {
            const apptDate = parseISO(appt.appointmentDateTime);
            return appt.status === APPOINTMENT_STATUS.COMPLETED &&
                   isWithinInterval(apptDate, { start: startOfDay(startDate), end: endOfDay(endDate) }) &&
                   (locationId ? appt.locationId === locationId : true); 
        });
        return professionalsResult.map(prof => {
            const profAppointments = appointmentsForPeriod.filter(appt => appt.professionalId === prof.id);
            const earnings = profAppointments.reduce((sum, appt) => sum + (appt.amountPaid || 0), 0);
            return ({ 
                ...prof, 
                biWeeklyEarnings: earnings,
                contractDisplayStatus: getContractDisplayStatus(prof.currentContract, new Date()) 
            })
        });
    }

    if (!firestore) {
      console.warn("Firestore not initialized in getProfessionals. Falling back to mock data.");
      return mockDB.professionals.map(p => ({ ...p, contractDisplayStatus: getContractDisplayStatus(p.currentContract, new Date()) }));
    }

    const professionalsCol = collection(firestore, 'profesionales');
    let qConstraints: QueryConstraint[] = [];
    if (locationId) {
      qConstraints.push(where('locationId', '==', locationId));
    }
    const q = query(professionalsCol, ...qConstraints);
    const snapshot = await getDocs(q);
    let professionalsList = snapshot.docs.map(d => ({ id: d.id, ...convertDocumentData(d.data()) }) as Professional);

    // Calculate biWeeklyEarnings (this part can be performance-intensive)
    const todayForEarnings = startOfDay(new Date());
    const currentYear = getYear(todayForEarnings);
    const currentMonth = getMonth(todayForEarnings);
    const currentDay = getDate(todayForEarnings);
    const currentQuincena = currentDay <= 15 ? 1 : 2;
    const startDate = currentQuincena === 1 ? startOfMonth(setMonth(setYear(new Date(), currentYear), currentMonth)) : addDays(startOfMonth(setMonth(setYear(new Date(), currentYear), currentMonth)), 15);
    const endDate = currentQuincena === 1 ? addDays(startOfMonth(setMonth(setYear(new Date(), currentYear), currentMonth)), 14) : endOfMonth(setMonth(setYear(new Date(), currentYear), currentMonth));
    
    const appointmentsCol = collection(firestore, 'citas');
    const appointmentsQueryConstraints: QueryConstraint[] = [
        where('status', '==', APPOINTMENT_STATUS.COMPLETED),
        where('appointmentDateTime', '>=', toFirestoreTimestamp(startOfDay(startDate))),
        where('appointmentDateTime', '<=', toFirestoreTimestamp(endOfDay(endDate))),
    ];
    if (locationId) {
        appointmentsQueryConstraints.push(where('locationId', '==', locationId));
    }
    const appointmentsSnapshot = await getDocs(query(appointmentsCol, ...appointmentsQueryConstraints));
    const appointmentsForPeriod = appointmentsSnapshot.docs.map(d => ({ id: d.id, ...convertDocumentData(d.data()) }) as Appointment);

    return professionalsList.map(prof => {
        const profAppointments = appointmentsForPeriod.filter(appt => appt.professionalId === prof.id);
        const earnings = profAppointments.reduce((sum, appt) => sum + (appt.amountPaid || 0), 0);
        return ({ 
            ...prof, 
            biWeeklyEarnings: earnings,
            contractDisplayStatus: getContractDisplayStatus(prof.currentContract, new Date()) 
        })
    });
};

export const getProfessionalById = async (id: string): Promise<Professional | undefined> => {
    if (useMockDatabase) {
        const prof = mockDB.professionals.find(p => p.id === id);
        return prof ? { ...prof, contractDisplayStatus: getContractDisplayStatus(prof.currentContract, new Date()) } : undefined;
    }
    if (!firestore) {
      console.warn("Firestore not initialized in getProfessionalById. Falling back to mock data for ID:", id);
      const prof = mockDB.professionals.find(p => p.id === id);
      return prof ? { ...prof, contractDisplayStatus: getContractDisplayStatus(prof.currentContract, new Date()) } : undefined;
    }
    const docRef = doc(firestore, 'profesionales', id);
    const docSnap = await getDoc(docRef);
    if (!docSnap.exists()) return undefined;
    const profData = { id: docSnap.id, ...convertDocumentData(docSnap.data()) } as Professional;
    return { ...profData, contractDisplayStatus: getContractDisplayStatus(profData.currentContract, new Date()) };
};

export const addProfessional = async (data: ProfessionalFormData): Promise<Professional> => {
    if (useMockDatabase) {
      // ... (mock implementation remains the same)
      let currentContract: Contract | null = null;
      if (data.currentContract_startDate && data.currentContract_endDate) {
          currentContract = {
              id: generateId(), 
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
        id: data.id || generateId(), 
        ...professionalToSave,
        biWeeklyEarnings: 0, 
      };
      mockDB.professionals.push(newProfessional);
      return newProfessional;
    }

    if (!firestore) throw new Error("Firestore not initialized in addProfessional");

    const { id, ...professionalData } = data; // Exclude 'id' if present, Firestore generates it or we set it via setDoc
    
    const dataToSave: any = { ...professionalData };
    if (dataToSave.currentContract_startDate) dataToSave.currentContract_startDate = toFirestoreTimestamp(dataToSave.currentContract_startDate);
    if (dataToSave.currentContract_endDate) dataToSave.currentContract_endDate = toFirestoreTimestamp(dataToSave.currentContract_endDate);
    if (dataToSave.customScheduleOverrides) {
        dataToSave.customScheduleOverrides = dataToSave.customScheduleOverrides.map((ov: any) => ({
            ...ov,
            date: toFirestoreTimestamp(ov.date)
        }));
    }
    // Transform workSchedule if necessary
    const workScheduleForFirestore: any = {};
    if (dataToSave.workSchedule) {
        for (const dayId in dataToSave.workSchedule) {
            workScheduleForFirestore[dayId] = dataToSave.workSchedule[dayId];
        }
    }
    dataToSave.workSchedule = workScheduleForFirestore;

    const docRef = await addDoc(collection(firestore, 'profesionales'), dataToSave);
    return { id: docRef.id, ...data, biWeeklyEarnings:0 } as Professional; // Return with the new ID
};

export const updateProfessional = async (id: string, data: Partial<ProfessionalFormData>): Promise<Professional | undefined> => {
    if (useMockDatabase) {
        // ... (mock implementation remains the same)
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
             if (data.hasOwnProperty('currentContract_notes')) { 
                newProposedContractData.notes = data.currentContract_notes === null ? undefined : (data.currentContract_notes || undefined);
                contractFieldsTouchedInPayload = true;
            }
            if (data.hasOwnProperty('currentContract_empresa')) { 
                newProposedContractData.empresa = data.currentContract_empresa === null ? undefined : (data.currentContract_empresa || undefined);
                contractFieldsTouchedInPayload = true;
            }


            if (contractFieldsTouchedInPayload) {
                const isCreatingNewContractInstance = 
                    (newProposedContractData.startDate && newProposedContractData.endDate) && 
                    (!oldContract || 
                     oldContract.startDate !== newProposedContractData.startDate || 
                     oldContract.endDate !== newProposedContractData.endDate ||
                     (oldContract.notes || '') !== (newProposedContractData.notes || '') || 
                     (oldContract.empresa || '') !== (newProposedContractData.empresa || '')   
                    );

                if (isCreatingNewContractInstance) {
                    if (oldContract && oldContract.id && !professionalToUpdate.contractHistory?.find(h => h.id === oldContract!.id)) {
                        professionalToUpdate.contractHistory = [...(professionalToUpdate.contractHistory || []), oldContract];
                    }
                    professionalToUpdate.currentContract = {
                        id: generateId(), 
                        startDate: newProposedContractData.startDate!,
                        endDate: newProposedContractData.endDate!,
                        notes: newProposedContractData.notes,
                        empresa: newProposedContractData.empresa,
                    };
                } else if (oldContract && (newProposedContractData.notes !== undefined || newProposedContractData.empresa !== undefined || newProposedContractData.startDate !== undefined || newProposedContractData.endDate !== undefined)) {
                    professionalToUpdate.currentContract = {
                        ...oldContract,
                        startDate: newProposedContractData.startDate !== undefined ? newProposedContractData.startDate : oldContract.startDate,
                        endDate: newProposedContractData.endDate !== undefined ? newProposedContractData.endDate : oldContract.endDate,
                        notes: newProposedContractData.notes !== undefined ? newProposedContractData.notes : oldContract.notes,
                        empresa: newProposedContractData.empresa !== undefined ? newProposedContractData.empresa : oldContract.empresa,
                    };
                 } else if (!newProposedContractData.startDate && !newProposedContractData.endDate && !contractFieldsTouchedInPayload && oldContract) {
                     professionalToUpdate.currentContract = oldContract;
                } else if ((!newProposedContractData.startDate || !newProposedContractData.endDate) && contractFieldsTouchedInPayload) {
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
    if (!firestore) throw new Error("Firestore not initialized in updateProfessional");
    const docRef = doc(firestore, 'profesionales', id);
    
    const dataToUpdate: any = { ...data };
    // Convert dates to Timestamps
    if (dataToUpdate.currentContract_startDate) dataToUpdate.currentContract_startDate = toFirestoreTimestamp(dataToUpdate.currentContract_startDate);
    if (dataToUpdate.currentContract_endDate) dataToUpdate.currentContract_endDate = toFirestoreTimestamp(dataToUpdate.currentContract_endDate);
    if (dataToUpdate.customScheduleOverrides) {
        dataToUpdate.customScheduleOverrides = dataToUpdate.customScheduleOverrides.map((ov: any) => ({
            ...ov,
            date: toFirestoreTimestamp(ov.date)
        }));
    }
    // Transform workSchedule if necessary
    if (dataToUpdate.workSchedule) {
        const workScheduleForFirestore: any = {};
        for (const dayId in dataToUpdate.workSchedule) {
            workScheduleForFirestore[dayId] = dataToUpdate.workSchedule[dayId];
        }
        dataToUpdate.workSchedule = workScheduleForFirestore;
    }
    
    // Handle contract history logic (simplified for direct update, complex logic should be in a transaction)
    const currentProfDoc = await getDoc(docRef);
    if (currentProfDoc.exists()) {
        const currentProfData = currentProfDoc.data() as Professional;
        let contractHistory = currentProfData.contractHistory || [];
        let currentContractForFirestore = currentProfData.currentContract;

        const oldContract = currentProfData.currentContract;
        let newContractData: Partial<Contract> = {};
        let contractChanged = false;

        if (data.hasOwnProperty('currentContract_startDate')) {
            newContractData.startDate = data.currentContract_startDate ? formatISO(data.currentContract_startDate, { representation: 'date' }) : undefined;
            contractChanged = true;
        }
        if (data.hasOwnProperty('currentContract_endDate')) {
            newContractData.endDate = data.currentContract_endDate ? formatISO(data.currentContract_endDate, { representation: 'date' }) : undefined;
            contractChanged = true;
        }
        if (data.hasOwnProperty('currentContract_notes')) {
            newContractData.notes = data.currentContract_notes ?? undefined;
            contractChanged = true;
        }
        if (data.hasOwnProperty('currentContract_empresa')) {
            newContractData.empresa = data.currentContract_empresa ?? undefined;
            contractChanged = true;
        }

        if (contractChanged) {
            if (newContractData.startDate && newContractData.endDate) { // Creating or significantly changing a contract
                if (oldContract && oldContract.id && oldContract.id !== (newContractData.id || oldContract.id)) { // If old contract exists and IDs differ or new one has no ID yet
                    if (!contractHistory.find(h => h.id === oldContract.id)) {
                        contractHistory.push(oldContract);
                    }
                }
                currentContractForFirestore = {
                    id: oldContract?.id && !newContractData.id && newContractData.startDate === oldContract.startDate && newContractData.endDate === oldContract.endDate ? oldContract.id : generateId(), // Preserve ID if only notes/empresa change
                    startDate: newContractData.startDate,
                    endDate: newContractData.endDate,
                    notes: newContractData.notes,
                    empresa: newContractData.empresa
                };
            } else if (!newContractData.startDate && !newContractData.endDate) { // Removing contract
                if (oldContract && oldContract.id && !contractHistory.find(h => h.id === oldContract.id)) {
                    contractHistory.push(oldContract);
                }
                currentContractForFirestore = null;
            }
            dataToUpdate.currentContract = currentContractForFirestore ? {
                ...currentContractForFirestore,
                startDate: toFirestoreTimestamp(currentContractForFirestore.startDate),
                endDate: toFirestoreTimestamp(currentContractForFirestore.endDate),
            } : null;
            dataToUpdate.contractHistory = contractHistory.map(ch => ({
                ...ch,
                startDate: toFirestoreTimestamp(ch.startDate),
                endDate: toFirestoreTimestamp(ch.endDate),
            }));
        } else {
            // Ensure existing contract dates are converted if not touched by payload
            if (dataToUpdate.currentContract) {
                dataToUpdate.currentContract.startDate = toFirestoreTimestamp(dataToUpdate.currentContract.startDate);
                dataToUpdate.currentContract.endDate = toFirestoreTimestamp(dataToUpdate.currentContract.endDate);
            }
            if (dataToUpdate.contractHistory) {
                 dataToUpdate.contractHistory = dataToUpdate.contractHistory.map((ch:Contract) => ({
                    ...ch,
                    startDate: toFirestoreTimestamp(ch.startDate),
                    endDate: toFirestoreTimestamp(ch.endDate)
                 }));
            }
        }
    }


    await updateDoc(docRef, dataToUpdate);
    const updatedDocSnap = await getDoc(docRef);
    return updatedDocSnap.exists() ? { id: updatedDocSnap.id, ...convertDocumentData(updatedDocSnap.data()) } as Professional : undefined;
};

// --- Patients ---
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
    const startIndex = (page - 1) * queryLimit;
    const paginatedPatients = filteredMockPatients.slice(startIndex, startIndex + queryLimit);
    const newLastVisibleId = paginatedPatients.length > 0 ? paginatedPatients[paginatedPatients.length - 1].id : null;
    return { patients: paginatedPatients, totalCount, lastVisiblePatientId: newLastVisibleId };
  }

  if (!firestore) {
      console.warn("Firestore not initialized in getPatients. Falling back to mock data.");
      return { patients: mockDB.patients.slice(0, queryLimit), totalCount: mockDB.patients.length, lastVisiblePatientId: mockDB.patients[queryLimit-1]?.id || null };
  }

  const patientsCol = collection(firestore, 'pacientes') as CollectionReference<Omit<Patient, 'id'>>;
  let qConstraints: QueryConstraint[] = [];

  // Note: Firestore requires composite indexes for most combined where/orderBy queries.
  // Simple searchTerm filtering might need to be done client-side after a broader fetch if complex,
  // or use a more advanced search solution like Algolia/Typesense.
  // For now, basic orderBy and pagination. Search term might be inefficient or require specific indexes.

  if (searchTerm) {
    // Firestore does not support partial string matching (LIKE '%term%') directly in queries for general fields.
    // You might need to implement a more sophisticated search or filter client-side.
    // A common workaround is to store an array of keywords or use third-party search services.
    // For simplicity, this example will filter client-side *after* fetching, which is not ideal for large datasets.
    // OR, if you have specific fields you expect to search on (e.g., exact match on phone), you can add `where` clauses.
    console.warn("Search term filtering with Firestore is basic in this example and may be inefficient or require specific indexing/search services for optimal performance.");
  }

  if (filterToday && user) {
      const today = startOfDay(new Date());
      const isAdminOrContador = user.role === USER_ROLES.ADMIN || user.role === USER_ROLES.CONTADOR;
      const effectiveLocationId = isAdminOrContador ? (adminSelectedLocation === 'all' ? undefined : adminSelectedLocation) : user.locationId;

      const appointmentsTodayCol = collection(firestore, 'citas');
      let apptQueryConstraints: QueryConstraint[] = [
        where('appointmentDateTime', '>=', toFirestoreTimestamp(startOfDay(today))),
        where('appointmentDateTime', '<=', toFirestoreTimestamp(endOfDay(today))),
        where('status', 'in', [APPOINTMENT_STATUS.BOOKED, APPOINTMENT_STATUS.CONFIRMED])
      ];
      if (effectiveLocationId) {
          apptQueryConstraints.push(where('locationId', '==', effectiveLocationId));
      }
      const dailyAppointmentsSnap = await getDocs(query(appointmentsTodayCol, ...apptQueryConstraints));
      const patientIdsWithAppointmentsToday = new Set(dailyAppointmentsSnap.docs.map(d => d.data().patientId as string));
      
      if (patientIdsWithAppointmentsToday.size === 0) return { patients: [], totalCount: 0, lastVisiblePatientId: null }; // No patients with appts today
      // Firestore doesn't directly support `whereIn` with more than 30 elements in OR queries,
      // so if many patients, this might need chunking or a different approach.
      // For this example, assuming the number of patients with appts today is manageable for a `whereIn` query.
      qConstraints.push(where(documentId(), 'in', Array.from(patientIdsWithAppointmentsToday)));
  }
  
  qConstraints.push(orderBy('firstName'), orderBy('lastName'));

  // Get total count (this is a separate read, consider if needed for every call)
  // For more complex filtering (like searchTerm not on indexed fields), total count might be harder to get accurately without fetching all and filtering client-side.
  const countQuery = query(patientsCol, ...qConstraints.filter(c => !c.toString().includes('orderBy') && !c.toString().includes('limit') && !c.toString().includes('startAfter'))); // remove pagination for count
  const totalSnapshot = await getCountFromServer(countQuery);
  const totalCount = totalSnapshot.data().count;
  
  if (startAfterId) {
      const lastVisibleDoc = await getDoc(doc(patientsCol, startAfterId));
      if (lastVisibleDoc.exists()) {
          qConstraints.push(startAfter(lastVisibleDoc));
      }
  }
  qConstraints.push(limit(queryLimit));

  const q = query(patientsCol, ...qConstraints);
  const snapshot = await getDocs(q);
  let patientsData = snapshot.docs.map(d => ({ id: d.id, ...convertDocumentData(d.data()) }) as Patient);
  
  // Client-side search term filtering if it wasn't possible/efficient with Firestore query
  if (searchTerm) {
      const lowerSearchTerm = searchTerm.toLowerCase();
      patientsData = patientsData.filter(p =>
        `${p.firstName} ${p.lastName}`.toLowerCase().includes(lowerSearchTerm) ||
        (p.phone && p.phone.includes(searchTerm))
      );
  }

  const newLastVisibleId = patientsData.length > 0 ? patientsData[patientsData.length - 1].id : null;
  return { patients: patientsData, totalCount, lastVisiblePatientId: newLastVisibleId };
};

export const getPatientById = async (id: string): Promise<Patient | undefined> => {
    if (useMockDatabase) {
        return mockDB.patients.find(p => p.id === id);
    }
    if (!firestore) {
      console.warn("Firestore not initialized in getPatientById. Falling back to mock data for ID:", id);
      return mockDB.patients.find(p => p.id === id);
    }
    const docRef = doc(firestore, 'pacientes', id);
    const docSnap = await getDoc(docRef);
    return docSnap.exists() ? { id: docSnap.id, ...convertDocumentData(docSnap.data()) } as Patient : undefined;
};

export const findPatient = async (firstName: string, lastName: string): Promise<Patient | undefined> => {
    if (useMockDatabase) {
        return mockDB.patients.find(p => p.firstName.toLowerCase() === firstName.toLowerCase() && p.lastName.toLowerCase() === lastName.toLowerCase());
    }
     if (!firestore) {
      console.warn("Firestore not initialized in findPatient. Falling back to mock data.");
      return mockDB.patients.find(p => p.firstName.toLowerCase() === firstName.toLowerCase() && p.lastName.toLowerCase() === lastName.toLowerCase());
    }
    const patientsCol = collection(firestore, 'pacientes');
    const q = query(patientsCol, where('firstName', '==', firstName), where('lastName', '==', lastName));
    const snapshot = await getDocs(q);
    if (snapshot.empty) return undefined;
    return { id: snapshot.docs[0].id, ...convertDocumentData(snapshot.docs[0].data()) } as Patient;
};

export const addPatient = async (data: Partial<Omit<Patient, 'id'>>): Promise<Patient> => {
  if (useMockDatabase) {
    const newPatient: Patient = {
      id: generateId(),
      firstName: data.firstName!,
      lastName: data.lastName!,
      phone: data.phone,
      age: data.age === undefined ? null : data.age,
      isDiabetic: data.isDiabetic || false,
      notes: data.notes,
      preferredProfessionalId: data.preferredProfessionalId,
    };
    mockDB.patients.push(newPatient);
    return newPatient;
  }
  if (!firestore) throw new Error("Firestore not initialized in addPatient");
  const patientData = {
      firstName: data.firstName!,
      lastName: data.lastName!,
      phone: data.phone || null,
      age: data.age ?? null,
      isDiabetic: data.isDiabetic || false,
      notes: data.notes || null,
      preferredProfessionalId: data.preferredProfessionalId || null,
  };
  const docRef = await addDoc(collection(firestore, 'pacientes'), patientData);
  return { id: docRef.id, ...patientData } as Patient;
};

export const updatePatient = async (id: string, data: Partial<Patient>): Promise<Patient | undefined> => {
    if (useMockDatabase) {
        const index = mockDB.patients.findIndex(p => p.id === id);
        if (index !== -1) {
            const patientToUpdate = { ...mockDB.patients[index], ...data };
             if (data.hasOwnProperty('age') && data.age === null) { 
                patientToUpdate.age = null;
            }
            mockDB.patients[index] = patientToUpdate;
            return mockDB.patients[index];
        }
        return undefined;
    }
    if (!firestore) throw new Error("Firestore not initialized in updatePatient");
    const docRef = doc(firestore, 'pacientes', id);
    const updateData = { ...data };
    delete updateData.id; // ID should not be in the update payload itself

    await updateDoc(docRef, updateData);
    const updatedDocSnap = await getDoc(docRef);
    return updatedDocSnap.exists() ? { id: updatedDocSnap.id, ...convertDocumentData(updatedDocSnap.data()) } as Patient : undefined;
};

// --- Services ---
export const getServices = async (): Promise<Service[]> => {
    if (useMockDatabase) {
        return [...mockDB.services].sort((a, b) => a.name.localeCompare(b.name));
    }
    if (!firestore) {
      console.warn("Firestore not initialized in getServices. Falling back to mock data.");
      return [...mockDB.services].sort((a, b) => a.name.localeCompare(b.name));
    }
    const servicesCol = collection(firestore, 'servicios');
    const q = query(servicesCol, orderBy('name'));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(d => ({ id: d.id, ...convertDocumentData(d.data()) }) as Service);
};

export const getServiceById = async (id: string): Promise<Service | undefined> => {
    if (useMockDatabase) {
        return mockDB.services.find(s => s.id === id);
    }
    if (!firestore) {
      console.warn("Firestore not initialized in getServiceById. Falling back to mock data for ID:", id);
      return mockDB.services.find(s => s.id === id);
    }
    const docRef = doc(firestore, 'servicios', id);
    const docSnap = await getDoc(docRef);
    return docSnap.exists() ? { id: docSnap.id, ...convertDocumentData(docSnap.data()) } as Service : undefined;
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
      id: data.id || generateId(), // Mock can use provided ID or generate
      ...newServiceData,
    };
    mockDB.services.push(newService);
    return newService;
  }
  if (!firestore) throw new Error("Firestore not initialized in addService");
  // For Firestore, we usually let it generate the ID, or use setDoc if ID is predefined (like from constants)
  const docRef = doc(firestore, 'servicios', data.id || generateId()); // Use data.id if provided (e.g. from constants), else generate
  await setDoc(docRef, newServiceData);
  return { id: docRef.id, ...newServiceData };
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
    if (!firestore) throw new Error("Firestore not initialized in updateService");
    const docRef = doc(firestore, 'servicios', id);
    const updateData: Partial<Omit<Service, 'id'>> = {};
    if (data.name) updateData.name = data.name;
    if (data.defaultDuration) {
      updateData.defaultDuration = (data.defaultDuration.hours * 60) + data.defaultDuration.minutes;
    }
    if (data.price !== undefined) updateData.price = data.price;
    
    await updateDoc(docRef, updateData);
    const updatedDocSnap = await getDoc(docRef);
    return updatedDocSnap.exists() ? { id: updatedDocSnap.id, ...convertDocumentData(updatedDocSnap.data()) } as Service : undefined;
};


// --- Appointments ---
const populateAppointmentFull = async (apptData: any): Promise<Appointment> => { // Renamed to avoid conflict
    const patient = apptData.patientId ? await getPatientById(apptData.patientId) : undefined;
    const professional = apptData.professionalId ? await getProfessionalById(apptData.professionalId) : undefined;
    const service = apptData.serviceId ? await getServiceById(apptData.serviceId) : undefined;

    let addedServicesPopulated: Appointment['addedServices'] = [];
    if (apptData.addedServices && Array.isArray(apptData.addedServices)) {
        addedServicesPopulated = await Promise.all(
            apptData.addedServices.map(async (as: any) => {
                const addedService = as.serviceId ? await getServiceById(as.serviceId) : undefined;
                const addedProfessional = as.professionalId ? await getProfessionalById(as.professionalId) : undefined;
                return ({
                    serviceId: as.serviceId,
                    professionalId: as.professionalId,
                    price: as.price,
                    service: addedService, 
                    professional: addedProfessional,
                });
            })
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

    const populatedAppointmentsPromises = filteredMockAppointments.map(appt => populateAppointmentFull(appt)); // Use renamed function
    let populatedAppointmentsResult = await Promise.all(populatedAppointmentsPromises);
    const totalCount = populatedAppointmentsResult.length;
    const startIndex = (page - 1) * queryLimit;
    const paginatedResult = populatedAppointmentsResult.slice(startIndex, startIndex + queryLimit);
    const newLastVisibleId = paginatedResult.length > 0 ? paginatedResult[paginatedResult.length -1].id : null;
    return { appointments: paginatedResult, totalCount, lastVisibleAppointmentId: newLastVisibleId };
  }

  if (!firestore) {
      console.warn("Firestore not initialized in getAppointments. Falling back to mock data.");
      const mockResults = mockDB.appointments.slice(0, queryLimit);
      const populatedMockResults = await Promise.all(mockResults.map(populateAppointmentFull));
      return { appointments: populatedMockResults, totalCount: mockDB.appointments.length, lastVisibleAppointmentId: mockResults[queryLimit-1]?.id || null };
  }

  const appointmentsCol = collection(firestore, 'citas') as CollectionReference<Omit<Appointment, 'id'|'patient'|'professional'|'service'>>;
  let qConstraints: QueryConstraint[] = [];

  if (restFilters.locationId) {
    const targetLocationIds = Array.isArray(restFilters.locationId) ? restFilters.locationId : [restFilters.locationId];
    if (targetLocationIds.length > 0) {
        // Firestore doesn't support OR queries on different fields directly in this manner.
        // You'd typically fetch for `locationId` and then separately for `externalProfessionalOriginLocationId` if they are disjoint sets.
        // For simplicity here, we'll just query by `locationId`. If external logic is critical, it needs a more complex query strategy or client-side merge.
        qConstraints.push(where('locationId', 'in', targetLocationIds));
    }
  }
  if (restFilters.patientId) qConstraints.push(where('patientId', '==', restFilters.patientId));
  if (restFilters.professionalId) qConstraints.push(where('professionalId', '==', restFilters.professionalId));

  if (restFilters.date) {
    const targetDateStart = toFirestoreTimestamp(startOfDay(restFilters.date));
    const targetDateEnd = toFirestoreTimestamp(endOfDay(restFilters.date));
    if (targetDateStart && targetDateEnd) {
        qConstraints.push(where('appointmentDateTime', '>=', targetDateStart));
        qConstraints.push(where('appointmentDateTime', '<=', targetDateEnd));
    }
  }
  if (restFilters.dateRange) {
    const rangeStart = toFirestoreTimestamp(startOfDay(restFilters.dateRange.start));
    const rangeEnd = toFirestoreTimestamp(endOfDay(restFilters.dateRange.end));
    if (rangeStart && rangeEnd) {
        qConstraints.push(where('appointmentDateTime', '>=', rangeStart));
        qConstraints.push(where('appointmentDateTime', '<=', rangeEnd));
    }
  }
  if (restFilters.statuses) {
    const statusesToFilter = Array.isArray(restFilters.statuses) ? restFilters.statuses : [restFilters.statuses];
    if (statusesToFilter.length > 0) {
        qConstraints.push(where('status', 'in', statusesToFilter));
    }
  }
  
  const isFetchingPastStatuses = restFilters.statuses && (
    (Array.isArray(restFilters.statuses) && restFilters.statuses.some(s => [APPOINTMENT_STATUS.COMPLETED, APPOINTMENT_STATUS.CANCELLED_CLIENT, APPOINTMENT_STATUS.CANCELLED_STAFF, APPOINTMENT_STATUS.NO_SHOW].includes(s as AppointmentStatus))) ||
    (typeof restFilters.statuses === 'string' && [APPOINTMENT_STATUS.COMPLETED, APPOINTMENT_STATUS.CANCELLED_CLIENT, APPOINTMENT_STATUS.CANCELLED_STAFF, APPOINTMENT_STATUS.NO_SHOW].includes(restFilters.statuses as AppointmentStatus))
  );
  qConstraints.push(orderBy('appointmentDateTime', isFetchingPastStatuses ? 'desc' : 'asc'));

  // Count query (adjust constraints if needed for count)
  const countQueryConstraints = qConstraints.filter(c => !c.toString().includes('orderBy') && !c.toString().includes('limit') && !c.toString().includes('startAfter'));
  const totalSnapshot = await getCountFromServer(query(appointmentsCol, ...countQueryConstraints));
  const totalCount = totalSnapshot.data().count;

  if (startAfterId) {
    const lastVisibleDoc = await getDoc(doc(appointmentsCol, startAfterId));
    if (lastVisibleDoc.exists()) {
      qConstraints.push(startAfter(lastVisibleDoc));
    }
  }
  qConstraints.push(limit(queryLimit));

  const q = query(appointmentsCol, ...qConstraints);
  const snapshot = await getDocs(q);
  const appointmentsData = snapshot.docs.map(d => ({ id: d.id, ...convertDocumentData(d.data()) }) as Appointment); // Use Appointment type
  
  const populatedAppointments = await Promise.all(appointmentsData.map(populateAppointmentFull)); // Use renamed function
  const newLastVisibleId = populatedAppointments.length > 0 ? populatedAppointments[populatedAppointments.length - 1].id : null;
  return { appointments: populatedAppointments, totalCount, lastVisibleAppointmentId: newLastVisibleId };
};


export const getAppointmentById = async (id: string): Promise<Appointment | undefined> => {
    if (useMockDatabase) {
        const appt = mockDB.appointments.find(a => a.id === id);
        return appt ? populateAppointmentFull(appt) : undefined; // Use renamed function
    }
    if (!firestore) {
      console.warn("Firestore not initialized in getAppointmentById. Falling back to mock data for ID:", id);
      const appt = mockDB.appointments.find(a => a.id === id);
      return appt ? populateAppointmentFull(appt) : undefined; // Use renamed function
    }
    const docRef = doc(firestore, 'citas', id);
    const docSnap = await getDoc(docRef);
    if (!docSnap.exists()) return undefined;
    const apptData = { id: docSnap.id, ...convertDocumentData(docSnap.data()) } as Appointment;
    return populateAppointmentFull(apptData); // Use renamed function
};

export const addAppointment = async (data: AppointmentFormData & { isExternalProfessional?: boolean; externalProfessionalOriginLocationId?: LocationId | null } ): Promise<Appointment> => {
  if (useMockDatabase) {
    let patientId = data.existingPatientId;
    if (!patientId) {
      let existingPatient = mockDB.patients.find(p => p.firstName.toLowerCase() === data.patientFirstName.toLowerCase() && p.lastName.toLowerCase() === data.patientLastName.toLowerCase());
      if (existingPatient) {
        patientId = existingPatient.id;
      } else {
        const newPatient = await addPatient({ // Uses mock addPatient
          firstName: data.patientFirstName,
          lastName: data.patientLastName,
          phone: data.patientPhone || undefined,
          age: data.age,
          isDiabetic: data.isDiabetic || false,
        });
        patientId = newPatient.id;
      }
    }

    const service = mockDB.services.find(s => s.id === data.serviceId);
    if (!service) throw new Error(`Mock Service with ID ${data.serviceId} not found.`);
    
    const appointmentDateHours = parseInt(data.appointmentTime.split(':')[0]);
    const appointmentDateMinutes = parseInt(data.appointmentTime.split(':')[1]);
    const appointmentDateTimeObject = setMinutes(setHours(data.appointmentDate, appointmentDateHours), appointmentDateMinutes);
    const appointmentDateTime = formatISO(appointmentDateTimeObject);
    
    const newAppointmentRaw: Omit<Appointment, 'id' | 'createdAt' | 'updatedAt' | 'patient' | 'service' | 'professional'|'addedServices'|'attachedPhotos'> = {
      patientId: patientId!,
      locationId: data.locationId,
      serviceId: data.serviceId,
      professionalId: data.preferredProfessionalId === ANY_PROFESSIONAL_VALUE ? null : data.preferredProfessionalId,
      appointmentDateTime: appointmentDateTime,
      durationMinutes: service.defaultDuration || 60,
      status: APPOINTMENT_STATUS.BOOKED,
      bookingObservations: data.bookingObservations || undefined,
      isExternalProfessional: data.isExternalProfessional || false,
      externalProfessionalOriginLocationId: data.isExternalProfessional ? data.externalProfessionalOriginLocationId : null,
    };
    const newAppointment: Appointment = {
      id: generateId(),
      ...newAppointmentRaw,
      addedServices: [],
      attachedPhotos: [],
      createdAt: formatISO(new Date()), 
      updatedAt: formatISO(new Date()),
    };
    const populatedAppt = await populateAppointmentFull(newAppointment); // Use renamed function
    mockDB.appointments.push(populatedAppt);
    return populatedAppt;
  }

  if (!firestore) throw new Error("Firestore not initialized in addAppointment");

  let patientId = data.existingPatientId;
  if (!patientId) {
    let existingPatient = await findPatient(data.patientFirstName, data.patientLastName); // Uses Firestore findPatient
    if (existingPatient) {
      patientId = existingPatient.id;
      // Potentially update existing patient fields if they changed in the form (e.g., isDiabetic, age)
       const patientUpdates: Partial<Patient> = {};
       if (data.isDiabetic !== undefined && existingPatient.isDiabetic !== data.isDiabetic) patientUpdates.isDiabetic = data.isDiabetic;
       if (data.age !== undefined && data.age !== existingPatient.age) patientUpdates.age = data.age;
       if (Object.keys(patientUpdates).length > 0) {
          await updatePatient(patientId, patientUpdates); // Uses Firestore updatePatient
      }
    } else {
      const newPatient = await addPatient({ // Uses Firestore addPatient
        firstName: data.patientFirstName,
        lastName: data.patientLastName,
        phone: data.patientPhone || undefined,
        age: data.age,
        isDiabetic: data.isDiabetic || false,
      });
      patientId = newPatient.id;
    }
  } else {
      // If existingPatientId is provided, ensure patient details like age/isDiabetic are up-to-date from form
      const existingPatientDetails = await getPatientById(patientId); // Uses Firestore getPatientById
      if (existingPatientDetails) {
        const patientUpdates: Partial<Patient> = {};
        if (data.isDiabetic !== undefined && data.isDiabetic !== existingPatientDetails.isDiabetic) patientUpdates.isDiabetic = data.isDiabetic;
        if (data.age !== undefined && data.age !== existingPatientDetails.age) patientUpdates.age = data.age;
        if (Object.keys(patientUpdates).length > 0) {
          await updatePatient(patientId, patientUpdates); // Uses Firestore updatePatient
        }
      }
  }

  const service = await getServiceById(data.serviceId as string); // Uses Firestore getServiceById
  if (!service) throw new Error(`Service with ID ${data.serviceId} not found.`);
  
  const appointmentDateHours = parseInt(data.appointmentTime.split(':')[0]);
  const appointmentDateMinutes = parseInt(data.appointmentTime.split(':')[1]);
  const appointmentDateTimeObject = setMinutes(setHours(data.appointmentDate, appointmentDateHours), appointmentDateMinutes);
  
  const appointmentDataToSave: Omit<Appointment, 'id' | 'createdAt' | 'updatedAt' | 'patient' | 'service' | 'professional'|'addedServices'|'attachedPhotos'> = {
    patientId: patientId!,
    locationId: data.locationId,
    serviceId: data.serviceId,
    professionalId: data.preferredProfessionalId === ANY_PROFESSIONAL_VALUE ? null : data.preferredProfessionalId,
    appointmentDateTime: formatISO(appointmentDateTimeObject), // Keep as ISO string for consistency, convert to Timestamp before saving
    durationMinutes: service.defaultDuration || 60,
    status: APPOINTMENT_STATUS.BOOKED,
    bookingObservations: data.bookingObservations || undefined,
    isExternalProfessional: data.isExternalProfessional || false,
    externalProfessionalOriginLocationId: data.isExternalProfessional ? data.externalProfessionalOriginLocationId : null,
  };
  
  const firestoreReadyData: any = {
      ...appointmentDataToSave,
      appointmentDateTime: toFirestoreTimestamp(appointmentDataToSave.appointmentDateTime),
      createdAt: serverTimestamp(), // Firestore server timestamp
      updatedAt: serverTimestamp(),
      addedServices: [], // Initialize as empty
      attachedPhotos: [], // Initialize as empty
  };

  const docRef = await addDoc(collection(firestore, 'citas'), firestoreReadyData);
  const newAppointmentSnapshot = await getDoc(docRef);
  const newAppointmentData = {id: newAppointmentSnapshot.id, ...convertDocumentData(newAppointmentSnapshot.data()!) } as Appointment;
  return populateAppointmentFull(newAppointmentData); // Use renamed function
};


export const updateAppointment = async (id: string, data: Partial<Appointment>): Promise<Appointment | undefined> => {
  if (useMockDatabase) {
    const index = mockDB.appointments.findIndex(a => a.id === id);
    if (index !== -1) {
      const originalAppointment = mockDB.appointments[index];
      const updatedAppointmentRaw = {
        ...originalAppointment,
        ...data,
        updatedAt: formatISO(new Date()),
      };
      // Ensure nested objects are handled if they are part of `data`
      const populatedAppointment = await populateAppointmentFull(updatedAppointmentRaw); // Use renamed function
      mockDB.appointments[index] = populatedAppointment;
      return populatedAppointment;
    }
    return undefined;
  }

  if (!firestore) throw new Error("Firestore not initialized in updateAppointment");
  const docRef = doc(firestore, 'citas', id);
  
  const dataToUpdate: any = { ...data };
  delete dataToUpdate.id; // Firestore doc ID is not part of data
  delete dataToUpdate.patient; // Remove populated fields
  delete dataToUpdate.professional;
  delete dataToUpdate.service;

  if (dataToUpdate.appointmentDateTime && typeof dataToUpdate.appointmentDateTime === 'string') {
    dataToUpdate.appointmentDateTime = toFirestoreTimestamp(dataToUpdate.appointmentDateTime);
  }
  if (dataToUpdate.addedServices && Array.isArray(dataToUpdate.addedServices)) {
      dataToUpdate.addedServices = dataToUpdate.addedServices.map((as: any) => ({
          serviceId: as.serviceId,
          professionalId: as.professionalId || null,
          price: as.price || null,
          // Do not store nested service/professional objects here
      }));
  }
  dataToUpdate.updatedAt = serverTimestamp();

  await updateDoc(docRef, dataToUpdate);
  const updatedDocSnap = await getDoc(docRef);
  if (!updatedDocSnap.exists()) return undefined;
  const updatedAppointmentData = { id: updatedDocSnap.id, ...convertDocumentData(updatedDocSnap.data()) } as Appointment;
  return populateAppointmentFull(updatedAppointmentData); // Use renamed function
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
    const populatedHistoryPromises = historyAppointments.map(populateAppointmentFull); // Use renamed function
    let populatedHistory = await Promise.all(populatedHistoryPromises);
    const totalCount = populatedHistory.length;
    const startIndex = (page - 1) * queryLimit;
    const paginatedAppointments = populatedHistory.slice(startIndex, startIndex + queryLimit);
    const newLastVisibleId = paginatedAppointments.length > 0 ? paginatedAppointments[paginatedAppointments.length -1].id : null;
    return { appointments: paginatedAppointments, totalCount, lastVisibleAppointmentId: newLastVisibleId };
  }

  if (!firestore) {
    console.warn("Firestore not initialized in getPatientAppointmentHistory. Falling back to mock data for patient:", patientId);
    // Fallback logic can be similar to mock one
    let mockHistory = (mockDB.appointments || []).filter(appt =>
      appt.patientId === patientId &&
      appt.appointmentDateTime && parseISO(appt.appointmentDateTime) < today &&
      pastStatuses.includes(appt.status)
    ).sort((a, b) => parseISO(b.appointmentDateTime).getTime() - parseISO(a.appointmentDateTime).getTime());
    const populatedMockHistory = await Promise.all(mockHistory.map(populateAppointmentFull));
    return { appointments: populatedMockHistory.slice(0, queryLimit), totalCount: mockHistory.length, lastVisibleAppointmentId: mockHistory[queryLimit-1]?.id || null };
  }

  const appointmentsCol = collection(firestore, 'citas') as CollectionReference<Omit<Appointment, 'id'|'patient'|'professional'|'service'>>;
  let qConstraints: QueryConstraint[] = [
      where('patientId', '==', patientId),
      where('appointmentDateTime', '<', toFirestoreTimestamp(today)), // Firestore uses Timestamp
      where('status', 'in', pastStatuses),
      orderBy('appointmentDateTime', 'desc')
  ];
  
  // Count query
  const countQueryConstraints = qConstraints.filter(c => !c.toString().includes('orderBy') && !c.toString().includes('limit') && !c.toString().includes('startAfter'));
  const totalSnapshot = await getCountFromServer(query(appointmentsCol, ...countQueryConstraints));
  const totalCount = totalSnapshot.data().count;

  if (startAfterId) {
    const lastVisibleDoc = await getDoc(doc(appointmentsCol, startAfterId));
    if (lastVisibleDoc.exists()) {
      qConstraints.push(startAfter(lastVisibleDoc));
    }
  }
  qConstraints.push(limit(queryLimit));

  const q = query(appointmentsCol, ...qConstraints);
  const snapshot = await getDocs(q);
  const appointmentsData = snapshot.docs.map(d => ({ id: d.id, ...convertDocumentData(d.data()) }) as Appointment);
  const populatedAppointments = await Promise.all(appointmentsData.map(populateAppointmentFull)); // Use renamed function
  const newLastVisibleId = populatedAppointments.length > 0 ? populatedAppointments[populatedAppointments.length - 1].id : null;
  return { appointments: populatedAppointments, totalCount, lastVisibleAppointmentId: newLastVisibleId };
};

// --- Utils ---
export const getCurrentQuincenaDateRange = (): { start: Date; end: Date } => {
  const today = new Date(); 
  const currentYear = getYear(today);
  const currentMonth = getMonth(today);
  const currentDay = getDate(today);
  let startDate: Date;
  let endDate: Date;
  if (currentDay <= 15) {
    startDate = startOfMonth(setMonth(setYear(new Date(), currentYear), currentMonth));
    endDate = dateFnsAddMinutes(startOfDay(addDays(startDate, 14)), (24*60)-1); // End of the 15th day
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
    return Promise.all(professionalAppointments.map(populateAppointmentFull)); // Use renamed function
  }
  
  if (!firestore) {
    console.warn("Firestore not initialized in getProfessionalAppointmentsForDate. Falling back to mock for prof ID:", professionalId);
    // Fallback to mock
    const targetDate = startOfDay(date);
    const mockAppointments = (mockDB.appointments || [])
      .filter(appt =>
        appt.professionalId === professionalId &&
        dateFnsIsSameDay(parseISO(appt.appointmentDateTime), targetDate) &&
        (appt.status === APPOINTMENT_STATUS.BOOKED || appt.status === APPOINTMENT_STATUS.CONFIRMED)
      )
      .sort((a, b) => parseISO(a.appointmentDateTime).getTime() - parseISO(b.appointmentDateTime).getTime());
    return Promise.all(mockAppointments.map(populateAppointmentFull));
  }

  const appointmentsCol = collection(firestore, 'citas');
  const q = query(appointmentsCol, 
    where('professionalId', '==', professionalId),
    where('appointmentDateTime', '>=', toFirestoreTimestamp(startOfDay(date))),
    where('appointmentDateTime', '<=', toFirestoreTimestamp(endOfDay(date))),
    where('status', 'in', [APPOINTMENT_STATUS.BOOKED, APPOINTMENT_STATUS.CONFIRMED]),
    orderBy('appointmentDateTime', 'asc')
  );
  const snapshot = await getDocs(q);
  const appointmentsData = snapshot.docs.map(d => ({ id: d.id, ...convertDocumentData(d.data()) }) as Appointment);
  return Promise.all(appointmentsData.map(populateAppointmentFull)); // Use renamed function
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
    const dayKey = DAYS_OF_WEEK[(targetDayOfWeekJs + 6) % 7].id as DayOfWeekId; 
    if (dayKey) { 
        const dailySchedule = professional.workSchedule[dayKey];
        if (dailySchedule) { 
        if (dailySchedule.isWorking === false) return null; 
        if ((dailySchedule.isWorking === true || dailySchedule.isWorking === undefined) && dailySchedule.startTime && dailySchedule.endTime) {
            return { startTime: dailySchedule.startTime, endTime: dailySchedule.endTime };
        }
        return null; 
        }
    }
  }
  return null; 
}

// --- Periodic Reminders CRUD ---
export const getPeriodicReminders = async (): Promise<PeriodicReminder[]> => {
  if (useMockDatabase) {
    return [...mockDB.periodicReminders].sort((a, b) => parseISO(a.dueDate).getTime() - parseISO(b.dueDate).getTime());
  }
   if (!firestore) {
    console.warn("Firestore not initialized in getPeriodicReminders. Falling back to mock data.");
    return [...mockDB.periodicReminders].sort((a, b) => parseISO(a.dueDate).getTime() - parseISO(b.dueDate).getTime());
  }
  const remindersCol = collection(firestore, 'recordatorios');
  const q = query(remindersCol, orderBy('dueDate', 'asc'));
  const snapshot = await getDocs(q);
  return snapshot.docs.map(d => ({ id: d.id, ...convertDocumentData(d.data()) }) as PeriodicReminder);
};

export const addPeriodicReminder = async (data: Omit<PeriodicReminder, 'id' | 'createdAt' | 'updatedAt'>): Promise<PeriodicReminder> => {
  if (useMockDatabase) {
    const newReminder: PeriodicReminder = {
      id: generateId(),
      ...data,
      createdAt: formatISO(new Date()),
      updatedAt: formatISO(new Date()),
    };
    mockDB.periodicReminders.push(newReminder);
    return newReminder;
  }
  if (!firestore) throw new Error("Firestore not initialized in addPeriodicReminder");
  const reminderData = {
    ...data,
    dueDate: toFirestoreTimestamp(data.dueDate), // Convert string to Timestamp for Firestore
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  const docRef = await addDoc(collection(firestore, 'recordatorios'), reminderData);
  // To return the full object with ID and converted dates, we'd ideally fetch it back or construct carefully
  return { id: docRef.id, ...data, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
};

export const updatePeriodicReminder = async (id: string, data: Partial<Omit<PeriodicReminder, 'id' | 'createdAt' | 'updatedAt'>> & {dueDate: string}): Promise<PeriodicReminder | undefined> => {
  if (useMockDatabase) {
    const index = mockDB.periodicReminders.findIndex(r => r.id === id);
    if (index !== -1) {
      mockDB.periodicReminders[index] = {
        ...mockDB.periodicReminders[index],
        ...data,
        updatedAt: formatISO(new Date()),
      };
      return mockDB.periodicReminders[index];
    }
    return undefined;
  }
  if (!firestore) throw new Error("Firestore not initialized in updatePeriodicReminder");
  const docRef = doc(firestore, 'recordatorios', id);
  const updateData: any = { ...data };
  if (updateData.dueDate && typeof updateData.dueDate === 'string') {
    updateData.dueDate = toFirestoreTimestamp(updateData.dueDate);
  }
  updateData.updatedAt = serverTimestamp();
  await updateDoc(docRef, updateData);
  const updatedDocSnap = await getDoc(docRef);
  return updatedDocSnap.exists() ? { id: updatedDocSnap.id, ...convertDocumentData(updatedDocSnap.data()) } as PeriodicReminder : undefined;
};

export const deletePeriodicReminder = async (id: string): Promise<boolean> => {
  if (useMockDatabase) {
    const initialLength = mockDB.periodicReminders.length;
    mockDB.periodicReminders = mockDB.periodicReminders.filter(r => r.id !== id);
    return mockDB.periodicReminders.length < initialLength;
  }
  if (!firestore) throw new Error("Firestore not initialized in deletePeriodicReminder");
  await deleteDoc(doc(firestore, 'recordatorios', id));
  return true; // Assume success if no error
};

// --- Important Notes CRUD ---
export const getImportantNotes = async (): Promise<ImportantNote[]> => {
    if (useMockDatabase) {
        return [...mockDB.importantNotes].sort((a,b) => parseISO(b.createdAt || new Date(0).toISOString()).getTime() - parseISO(a.createdAt || new Date(0).toISOString()).getTime());
    }
     if (!firestore) {
      console.warn("Firestore not initialized in getImportantNotes. Falling back to mock data.");
      return [...mockDB.importantNotes].sort((a,b) => parseISO(b.createdAt || new Date(0).toISOString()).getTime() - parseISO(a.createdAt || new Date(0).toISOString()).getTime());
    }
    const notesCol = collection(firestore, 'notasImportantes');
    const q = query(notesCol, orderBy('createdAt', 'desc'));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(d => ({ id: d.id, ...convertDocumentData(d.data()) }) as ImportantNote);
};

export const addImportantNote = async (data: Omit<ImportantNote, 'id' | 'createdAt' | 'updatedAt'>): Promise<ImportantNote> => {
    if (useMockDatabase) {
        const newNote: ImportantNote = {
            id: generateId(),
            ...data,
            createdAt: formatISO(new Date()),
            updatedAt: formatISO(new Date()),
        };
        mockDB.importantNotes.push(newNote);
        return newNote;
    }
    if (!firestore) throw new Error("Firestore not initialized in addImportantNote");
    const noteData = {
      ...data,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    const docRef = await addDoc(collection(firestore, 'notasImportantes'), noteData);
    return { id: docRef.id, ...data, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
};

export const updateImportantNote = async (id: string, data: Partial<Omit<ImportantNote, 'id' | 'createdAt' | 'updatedAt'>>): Promise<ImportantNote | undefined> => {
    if (useMockDatabase) {
        const index = mockDB.importantNotes.findIndex(n => n.id === id);
        if (index !== -1) {
            mockDB.importantNotes[index] = {
                ...mockDB.importantNotes[index],
                ...data,
                updatedAt: formatISO(new Date()),
            };
            return mockDB.importantNotes[index];
        }
        return undefined;
    }
    if (!firestore) throw new Error("Firestore not initialized in updateImportantNote");
    const docRef = doc(firestore, 'notasImportantes', id);
    const updateData = { ...data, updatedAt: serverTimestamp() };
    await updateDoc(docRef, updateData);
    const updatedDocSnap = await getDoc(docRef);
    return updatedDocSnap.exists() ? { id: updatedDocSnap.id, ...convertDocumentData(updatedDocSnap.data()) } as ImportantNote : undefined;
};

export const deleteImportantNote = async (id: string): Promise<boolean> => {
    if (useMockDatabase) {
        const initialLength = mockDB.importantNotes.length;
        mockDB.importantNotes = mockDB.importantNotes.filter(n => n.id !== id);
        return mockDB.importantNotes.length < initialLength;
    }
    if (!firestore) throw new Error("Firestore not initialized in deleteImportantNote");
    await deleteDoc(doc(firestore, 'notasImportantes', id));
    return true;
};

// --- Seed Firestore with Mock Data ---
export const seedFirestoreWithMockData = async (): Promise<void> => {
  if (useMockDatabase) {
    console.warn("Seed function called, but useMockDatabase is true. No data will be written to Firestore.");
    return;
  }
  if (!firestore) {
    throw new Error("Firestore not initialized. Cannot seed data.");
  }

  console.log("Starting to seed Firestore with mock data...");
  const batch = writeBatch(firestore);

  try {
    // Seed Users
    console.log(`Seeding ${initialMockUsersData.length} users...`);
    initialMockUsersData.forEach(user => {
      const { id, ...userData } = user;
      const userRef = doc(firestore, "usuarios", id);
      batch.set(userRef, userData);
    });

    // Seed Services
    console.log(`Seeding ${initialMockServicesData.length} services...`);
    initialMockServicesData.forEach(service => {
      const { id, ...serviceData } = service;
      const serviceRef = doc(firestore, "servicios", id);
      batch.set(serviceRef, serviceData);
    });

    // Seed Professionals
    console.log(`Seeding ${initialMockProfessionalsData.length} professionals...`);
    initialMockProfessionalsData.forEach(prof => {
      const { id, biWeeklyEarnings, ...profData } = prof; // Exclude biWeeklyEarnings if not stored
      const professionalRef = doc(firestore, "profesionales", id);
      const dataToSave: any = { ...profData };
      if (dataToSave.currentContract) {
          dataToSave.currentContract.startDate = toFirestoreTimestamp(dataToSave.currentContract.startDate);
          dataToSave.currentContract.endDate = toFirestoreTimestamp(dataToSave.currentContract.endDate);
      }
      if (dataToSave.contractHistory) {
          dataToSave.contractHistory = dataToSave.contractHistory.map((ch: Contract) => ({
              ...ch,
              startDate: toFirestoreTimestamp(ch.startDate),
              endDate: toFirestoreTimestamp(ch.endDate)
          }));
      }
      if (dataToSave.customScheduleOverrides) {
          dataToSave.customScheduleOverrides = dataToSave.customScheduleOverrides.map((ov: any) => ({
              ...ov,
              date: toFirestoreTimestamp(ov.date)
          }));
      }
      batch.set(professionalRef, dataToSave);
    });

    // Seed Patients
    console.log(`Seeding ${initialMockPatientsData.length} patients...`);
    initialMockPatientsData.forEach(patient => {
      const { id, ...patientData } = patient;
      const patientRef = doc(firestore, "pacientes", id);
      batch.set(patientRef, patientData);
    });

    // Seed Appointments
    console.log(`Seeding ${initialMockAppointmentsData.length} appointments...`);
    initialMockAppointmentsData.forEach(appt => {
      const { id, patient, professional, service, ...apptData } = appt; // Exclude populated fields
      const appointmentRef = doc(firestore, "citas", id);
      const dataToSave: any = { ...apptData };
      dataToSave.appointmentDateTime = toFirestoreTimestamp(dataToSave.appointmentDateTime);
      dataToSave.createdAt = dataToSave.createdAt ? toFirestoreTimestamp(dataToSave.createdAt) : serverTimestamp();
      dataToSave.updatedAt = dataToSave.updatedAt ? toFirestoreTimestamp(dataToSave.updatedAt) : serverTimestamp();
       // Ensure addedServices is an array of simple objects if it exists
      if (dataToSave.addedServices && Array.isArray(dataToSave.addedServices)) {
        dataToSave.addedServices = dataToSave.addedServices.map((as: any) => ({
            serviceId: as.serviceId,
            professionalId: as.professionalId || null,
            price: as.price || null,
        }));
      } else {
        dataToSave.addedServices = [];
      }
      batch.set(appointmentRef, dataToSave);
    });

    // Seed Periodic Reminders
    console.log(`Seeding ${initialMockPeriodicRemindersData.length} reminders...`);
    initialMockPeriodicRemindersData.forEach(reminder => {
        const { id, ...reminderData } = reminder;
        const reminderRef = doc(firestore, "recordatorios", id);
        const dataToSave: any = { ...reminderData };
        dataToSave.dueDate = toFirestoreTimestamp(dataToSave.dueDate);
        dataToSave.createdAt = dataToSave.createdAt ? toFirestoreTimestamp(dataToSave.createdAt) : serverTimestamp();
        dataToSave.updatedAt = dataToSave.updatedAt ? toFirestoreTimestamp(dataToSave.updatedAt) : serverTimestamp();
        batch.set(reminderRef, dataToSave);
    });

    // Seed Important Notes
    console.log(`Seeding ${initialMockImportantNotesData.length} notes...`);
    initialMockImportantNotesData.forEach(note => {
        const { id, ...noteData } = note;
        const noteRef = doc(firestore, "notasImportantes", id);
        const dataToSave: any = { ...noteData };
        dataToSave.createdAt = dataToSave.createdAt ? toFirestoreTimestamp(dataToSave.createdAt) : serverTimestamp();
        dataToSave.updatedAt = dataToSave.updatedAt ? toFirestoreTimestamp(dataToSave.updatedAt) : serverTimestamp();
        batch.set(noteRef, dataToSave);
    });


    await batch.commit();
    console.log("Firestore seeded successfully with mock data!");
  } catch (error) {
    console.error("Error seeding Firestore:", error);
    throw error; // Re-throw to allow UI to catch it
  }
};
