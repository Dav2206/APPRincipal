
// src/lib/data.ts
import type { User, Professional, Patient, Service, Appointment, AppointmentFormData, ProfessionalFormData, AppointmentStatus, ServiceFormData, Contract, PeriodicReminder, ImportantNote, PeriodicReminderFormData, ImportantNoteFormData } from '@/types';
import { LOCATIONS, USER_ROLES, SERVICES as SERVICES_CONSTANTS, APPOINTMENT_STATUS, LocationId, ServiceId as ConstantServiceId, APPOINTMENT_STATUS_DISPLAY, PAYMENT_METHODS, TIME_SLOTS, DAYS_OF_WEEK } from './constants';
import type { DayOfWeekId } from './constants';
import { formatISO, parseISO, addDays, setHours, setMinutes, startOfDay, endOfDay, isSameDay as dateFnsIsSameDay, startOfMonth, endOfMonth, subDays, isEqual, isBefore, isAfter, getDate, getYear, getMonth, setMonth, setYear, getHours, addMinutes as dateFnsAddMinutes, isWithinInterval, getDay, format, differenceInCalendarDays, areIntervalsOverlapping, parse } from 'date-fns';
import { es } from 'date-fns/locale';
import { firestore, useMockDatabase as globalUseMockDatabase } from './firebase-config'; // Centralized mock flag
import { collection, addDoc, getDocs, doc, getDoc, updateDoc, query, where, deleteDoc, writeBatch, serverTimestamp, Timestamp, runTransaction, setDoc, QueryConstraint, orderBy, limit, startAfter,getCountFromServer, CollectionReference, DocumentData, documentId } from 'firebase/firestore';


// Determine if using mock database based on environment variable
// const useMockDatabase = globalUseMockDatabase;
// Forzando useMockDatabase a true para desarrollo actual
const useMockDatabase = true;
console.log("[data.ts] FORZANDO useMockDatabase a:", useMockDatabase);


// --- Helper to convert Firestore Timestamps to ISO strings and vice-versa ---
const toFirestoreTimestamp = (date: Date | string | undefined | null): Timestamp | null => {
  if (!date) return null;
  try {
    const d = typeof date === 'string' ? parseISO(date) : date;
    if (isNaN(d.getTime())) {
      console.warn(`[data.ts] Invalid date value provided to toFirestoreTimestamp: ${date}`);
      return null;
    }
    return Timestamp.fromDate(d);
  } catch (error) {
    console.error(`[data.ts] Error converting date to Firestore Timestamp: ${date}`, error);
    return null;
  }
};

const fromFirestoreTimestamp = (timestamp: Timestamp | undefined | null): string | null => {
  if (!timestamp) return null;
  try {
    return timestamp.toDate().toISOString();
  } catch (error) {
    console.error("[data.ts] Error converting Firestore Timestamp to ISO String:", timestamp, error);
    return null;
  }
};

const convertDocumentData = (docData: DocumentData): any => {
  if (!docData) return null;
  const data = { ...docData };
  try {
    for (const key in data) {
      if (data[key] instanceof Timestamp) {
        data[key] = fromFirestoreTimestamp(data[key]);
      } else if (data[key] && typeof data[key] === 'object' && !Array.isArray(data[key]) && !(data[key] instanceof Date) && Object.keys(data[key]).length > 0) {
        let isNestedTimestampObject = false;
        if (typeof data[key].seconds === 'number' && typeof data[key].nanoseconds === 'number') {
            try {
                const nestedDate = new Timestamp(data[key].seconds, data[key].nanoseconds).toDate();
                if (!isNaN(nestedDate.getTime())) {
                    data[key] = nestedDate.toISOString();
                    isNestedTimestampObject = true;
                }
            } catch (e) {
                // Not a valid Timestamp structure, proceed with recursive conversion
            }
        }
        if (!isNestedTimestampObject) {
             data[key] = convertDocumentData(data[key]);
        }
      } else if (Array.isArray(data[key])) {
        data[key] = data[key].map(item =>
          (item && typeof item === 'object' && !(item instanceof Timestamp) && !(item instanceof Date)) ? convertDocumentData(item) : item
        );
      }
    }
  } catch (error) {
    console.error("[data.ts] Error in convertDocumentData processing key:", error);
  }
  return data;
};
// --- End Helper ---

// --- Contract Status Helper ---
export type ContractDisplayStatus = 'Activo' | 'Próximo a Vencer' | 'Vencido' | 'Sin Contrato' | 'No Vigente Aún';

export function getContractDisplayStatus(contract: Contract | null | undefined, referenceDateParam?: Date): ContractDisplayStatus {
  try {
    const referenceDate = startOfDay(referenceDateParam || new Date());
    if (!contract || !contract.startDate || !contract.endDate) {
        return 'Sin Contrato';
    }

    const { startDate: startDateStr, endDate: endDateStr } = contract;

    if (typeof startDateStr !== 'string' || typeof endDateStr !== 'string') {
        console.warn("[data.ts] getContractDisplayStatus: Invalid contract date types (expected strings):", contract);
        return 'Sin Contrato';
    }
     if (startDateStr.length === 0 || endDateStr.length === 0) {
        console.warn("[data.ts] getContractDisplayStatus: Contract date strings are empty:", contract);
        return 'Sin Contrato';
    }

    let startDate: Date;
    let endDate: Date;

    try {
        startDate = parseISO(startDateStr);
        endDate = parseISO(endDateStr);
    } catch (e) {
        console.error("[data.ts] getContractDisplayStatus: Error parsing contract dates from strings:", e, contract);
        return 'Sin Contrato';
    }

    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
        console.warn("[data.ts] getContractDisplayStatus: Invalid date strings after parsing:", contract, { startDateStr, endDateStr, startDate, endDate });
        return 'Sin Contrato';
    }
    
    if (isBefore(referenceDate, startDate)) {
        return 'No Vigente Aún';
    }
    if (isAfter(referenceDate, endDate)) {
        return 'Vencido';
    }

    const daysUntilExpiry = differenceInCalendarDays(endDate, referenceDate);
    if (daysUntilExpiry <= 15) { // Example: 15 days warning
        return 'Próximo a Vencer';
    }
    return 'Activo';
  } catch (error) {
    console.error("[data.ts] Error in getContractDisplayStatus:", error, "Contract:", contract, "Reference Date:", referenceDateParam);
    return 'Sin Contrato';
  }
}
// --- End Contract Status Helper ---

// --- Initial Mock Data Definitions ---
const generateId = (): string => {
  try {
    return Math.random().toString(36).substr(2, 9) + Date.now().toString(36);
  } catch (error) {
    console.error("[data.ts] Error in generateId:", error);
    return "fallback_id_" + Date.now();
  }
};

const todayMock = new Date(2025, 4, 13); // Tuesday, May 13, 2025 (month is 0-indexed)
const yesterdayMock = subDays(todayMock, 1);
const tomorrowMock = addDays(todayMock,1);

const initialMockUsersData: User[] = [
  { id: 'admin001', username: 'Admin', password: 'admin', role: USER_ROLES.ADMIN, name: 'Administrador General del Sistema', locationId: undefined },
  { id: 'contador001', username: 'Contador', password: 'admin', role: USER_ROLES.CONTADOR, name: 'Contador Principal', locationId: undefined },
  { id: 'user-higuereta', username: 'HigueretaStaff', password: 'admin', role: USER_ROLES.LOCATION_STAFF, locationId: 'higuereta', name: 'Personal Sede Higuereta' },
  { id: 'user-eden_benavides', username: 'EdenBenavidesStaff', password: 'admin', role: USER_ROLES.LOCATION_STAFF, locationId: 'eden_benavides', name: 'Personal Sede Edén Benavides' },
  { id: 'user-crucetas', username: 'CrucetasStaff', password: 'admin', role: USER_ROLES.LOCATION_STAFF, locationId: 'crucetas', name: 'Personal Sede Crucetas' },
  { id: 'user-carpaccio', username: 'CarpaccioStaff', password: 'admin', role: USER_ROLES.LOCATION_STAFF, locationId: 'carpaccio', name: 'Personal Sede Carpaccio' },
  { id: 'user-vista_alegre', username: 'VistaAlegreStaff', password: 'admin', role: USER_ROLES.LOCATION_STAFF, locationId: 'vista_alegre', name: 'Personal Sede Vista Alegre' },
  { id: 'user-san_antonio', username: 'SanAntonioStaff', password: 'admin', role: USER_ROLES.LOCATION_STAFF, locationId: 'san_antonio', name: 'Personal Sede San Antonio' },
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
    const baseSchedule: Professional['workSchedule'] = {};
    DAYS_OF_WEEK.forEach(dayInfo => {
        baseSchedule[dayInfo.id] = {
            isWorking: true,
            startTime: dayInfo.id === 'saturday' ? '09:00' : (dayInfo.id === 'sunday' ? '10:00' : '10:00'),
            endTime: dayInfo.id === 'saturday' ? '18:00' : (dayInfo.id === 'sunday' ? '18:00' : '19:00'),
        };
    });

    let currentContract: Contract | null = null;
    let contractHistory: Contract[] = [];
    
    if (i < 2) { // Ensure first two professionals in each location have an active contract
      const contractStartDate = subDays(todayMock, 60);
      const contractEndDate = addDays(todayMock, 90);
      currentContract = {
        id: generateId(),
        startDate: formatISO(contractStartDate, { representation: 'date' }),
        endDate: formatISO(contractEndDate, { representation: 'date' }),
        notes: `Contrato activo para ${location.name} prof ${i + 1}`,
        empresa: (i % 2 === 0) ? `Empresa Footprints ${location.name}` : `Servicios Podológicos Globales`,
      };
    } else { // For subsequent professionals, vary contract status
      const contractType = i % 4;
      if (contractType === 0) { // Active contract
        const contractStartDate = subDays(todayMock, Math.floor(Math.random() * 100) + 30);
        const contractEndDate = addDays(todayMock, Math.floor(Math.random() * 120) + 30);
         currentContract = {
             id: generateId(),
             startDate: formatISO(contractStartDate, { representation: 'date' }),
             endDate: formatISO(contractEndDate, { representation: 'date' }),
             notes: `Contrato variado ${i + 1}`,
             empresa: (i % 3 === 0) ? `Consultores ${String.fromCharCode(65 + i)}` : undefined,
         };
      } else if (contractType === 1) { // Expired contract
         const expiredContractStartDate = subDays(todayMock, 150);
         const expiredContractEndDate = subDays(todayMock, 30);
         contractHistory.push({
             id: generateId(),
             startDate: formatISO(expiredContractStartDate, { representation: 'date' }),
             endDate: formatISO(expiredContractEndDate, { representation: 'date' }),
             notes: `Contrato vencido ${i + 1}`,
             empresa: 'Empresa Antigua SA',
         });
         currentContract = null;
      } else if (contractType === 2) { // Contract about to expire
        const nearExpiryStartDate = subDays(todayMock, 75);
        const nearExpiryEndDate = addDays(todayMock, 10); 
         currentContract = {
             id: generateId(),
             startDate: formatISO(nearExpiryStartDate, { representation: 'date' }),
             endDate: formatISO(nearExpiryEndDate, { representation: 'date' }),
             notes: `Contrato próximo a vencer ${i + 1}`,
             empresa: 'Gestiones Rápidas SRL',
         };
      }
    }
    
    let customOverrides: Professional['customScheduleOverrides'] = [];
    if (location.id === 'higuereta' && i === 0) { 
        customOverrides = [
            { id: generateId(), date: formatISO(addDays(todayMock, 3), {representation: 'date'}), isWorking: false, notes: "Descanso programado"}, 
            { id: generateId(), date: formatISO(addDays(todayMock, 7), {representation: 'date'}), isWorking: true, startTime: "14:00", endTime: "20:00", notes: "Turno especial tarde"} 
        ];
    }
     if (location.id === 'san_antonio' && i === 1) { 
        customOverrides = [
            { id: generateId(), date: formatISO(todayMock, {representation: 'date'}), isWorking: false, notes: "Cita médica personal"},
        ];
    }

    return {
      id: `prof-${location.id}-${i + 1}`,
      firstName: `P${i + 1}`,
      lastName: `${location.name.split(' ')[0]}`,
      locationId: location.id,
      phone: `9${String(locIndex).padStart(1, '0')}${String(i + 1).padStart(1, '0')}123456`,
      birthDay: (i % 5 === 0) ? (i % 28) + 1 : null, 
      birthMonth: (i % 5 === 0) ? ((i*2) % 12) + 1 : null,
      biWeeklyEarnings: 0,
      workSchedule: baseSchedule,
      customScheduleOverrides: customOverrides,
      currentContract: currentContract,
      contractHistory: contractHistory,
    };
  });
});

const initialMockPatientsData: Patient[] = Array.from({ length: 50 }, (_, i) => ({
  id: `pat${String(i + 1).padStart(3, '0')}`,
  firstName: `Paciente ${String.fromCharCode(65 + (i % 26))}${i > 25 ? String.fromCharCode(65 + Math.floor(i/26)-1) : '' }`,
  lastName: `Test${i + 1}`,
  phone: `9000000${String(i).padStart(2, '0')}`,
  age: i % 3 === 0 ? undefined : (20 + (i % 50)),
  isDiabetic: i % 7 === 0,
  preferredProfessionalId: i % 3 === 0 ? initialMockProfessionalsData[i % initialMockProfessionalsData.length]?.id : undefined,
  notes: i % 5 === 0 ? `Observación importante para paciente ${i + 1}. Tiene preferencia por horarios de mañana.` : undefined,
}));

const initialMockServicesData: Service[] = [...SERVICES_CONSTANTS];

const initialMockAppointmentsData: Appointment[] = [
  // Completed yesterday
  {
    id: 'appt001', patientId: 'pat001', locationId: LOCATIONS[0].id, professionalId: initialMockProfessionalsData.find(p => p.locationId === LOCATIONS[0].id && getContractDisplayStatus(p.currentContract, yesterdayMock) === 'Activo')?.id || initialMockProfessionalsData[0]?.id, serviceId: initialMockServicesData[0].id, appointmentDateTime: formatISO(setHours(setMinutes(yesterdayMock, 0), 10)), durationMinutes: initialMockServicesData[0].defaultDuration, status: APPOINTMENT_STATUS.COMPLETED, amountPaid: initialMockServicesData[0].price, paymentMethod: PAYMENT_METHODS[0], staffNotes: "Tratamiento exitoso, paciente refiere mejoría.", attachedPhotos: ["https://placehold.co/200x200.png?text=Appt001" as string], addedServices: [{ serviceId: initialMockServicesData[2].id, price: initialMockServicesData[2].price }], createdAt: formatISO(subDays(yesterdayMock,1)), updatedAt: formatISO(yesterdayMock),
  },
  // Booked for today
  {
    id: 'appt002', patientId: 'pat002', locationId: LOCATIONS[1].id, professionalId: initialMockProfessionalsData.find(p => p.locationId === LOCATIONS[1].id && getContractDisplayStatus(p.currentContract, todayMock) === 'Activo')?.id || initialMockProfessionalsData[1]?.id, serviceId: initialMockServicesData[1].id, appointmentDateTime: formatISO(setHours(setMinutes(startOfDay(todayMock), 30), 9)), durationMinutes: initialMockServicesData[1].defaultDuration, status: APPOINTMENT_STATUS.BOOKED, bookingObservations: "Paciente refiere dolor agudo.", createdAt: formatISO(subDays(todayMock,1)), updatedAt: formatISO(subDays(todayMock,1)), attachedPhotos: [], addedServices: [],
  },
  // Confirmed for today (later)
  {
    id: 'appt003', patientId: 'pat003', locationId: LOCATIONS[0].id, professionalId: initialMockProfessionalsData.find(p => p.locationId === LOCATIONS[0].id && getContractDisplayStatus(p.currentContract, todayMock) === 'Activo')?.id || initialMockProfessionalsData[2]?.id, serviceId: initialMockServicesData[2].id, appointmentDateTime: formatISO(setHours(setMinutes(startOfDay(todayMock), 0), 14)), durationMinutes: initialMockServicesData[2].defaultDuration, status: APPOINTMENT_STATUS.CONFIRMED, actualArrivalTime: "13:55", createdAt: formatISO(subDays(todayMock,2)), updatedAt: formatISO(todayMock),
  },
  // Cancelled for today
  {
    id: 'appt004', patientId: 'pat004', locationId: LOCATIONS[2].id, professionalId: initialMockProfessionalsData.find(p => p.locationId === LOCATIONS[2].id && getContractDisplayStatus(p.currentContract, todayMock) === 'Activo')?.id || initialMockProfessionalsData[3]?.id, serviceId: initialMockServicesData[3].id, appointmentDateTime: formatISO(setHours(setMinutes(startOfDay(todayMock), 0), 11)), durationMinutes: initialMockServicesData[3].defaultDuration, status: APPOINTMENT_STATUS.CANCELLED_CLIENT, createdAt: formatISO(subDays(todayMock,1)), updatedAt: formatISO(todayMock),
  },
  // Completed in April 2025 for Higuereta (Prof P1 Higuereta)
  {
    id: 'appt_registry_001', patientId: 'pat005', locationId: 'higuereta', professionalId: 'prof-higuereta-1', serviceId: 'quiropodia', appointmentDateTime: formatISO(setHours(setMinutes(new Date(2025, 3, 18), 0), 10)), durationMinutes: 60, status: APPOINTMENT_STATUS.COMPLETED, amountPaid: 80, paymentMethod: 'Efectivo', staffNotes: "Servicio completado, para prueba de registro.", createdAt: formatISO(new Date(2025, 3, 18)), updatedAt: formatISO(new Date(2025, 3, 18)),
  },
  // Completed in April 2025 for San Antonio (Prof P1 San Antonio)
  {
    id: 'appt_registry_002', patientId: 'pat006', locationId: 'san_antonio', professionalId: 'prof-san_antonio-1', serviceId: 'tratamiento_unas', appointmentDateTime: formatISO(setHours(setMinutes(new Date(2025, 3, 25), 30), 15)), durationMinutes: 45, status: APPOINTMENT_STATUS.COMPLETED, amountPaid: 60, paymentMethod: 'Tarjeta de Crédito', staffNotes: "Tratamiento de uñas complejo.", createdAt: formatISO(new Date(2025, 3, 25)), updatedAt: formatISO(new Date(2025, 3, 25)),
  },
  // Booked for Prof P1 Higuereta Today (to test overlaps)
  {
    id: 'appt_overlap_001', patientId: 'pat007', locationId: 'higuereta', professionalId: 'prof-higuereta-1', serviceId: 'consulta_general', appointmentDateTime: formatISO(setHours(setMinutes(startOfDay(todayMock), 0), 10)), durationMinutes: 30, status: APPOINTMENT_STATUS.BOOKED, createdAt: formatISO(todayMock), updatedAt: formatISO(todayMock),
  },
  // Booked for Prof P1 Higuereta Today (overlaps with appt_overlap_001)
  {
    id: 'appt_overlap_002', patientId: 'pat008', locationId: 'higuereta', professionalId: 'prof-higuereta-1', serviceId: 'reflexologia', appointmentDateTime: formatISO(setHours(setMinutes(startOfDay(todayMock), 15), 10)), durationMinutes: 45, status: APPOINTMENT_STATUS.BOOKED, createdAt: formatISO(todayMock), updatedAt: formatISO(todayMock),
  },
];

const initialMockPeriodicRemindersData: PeriodicReminder[] = [
  { id: 'rem001', title: 'Pago IGV Abril 2025', dueDate: formatISO(new Date(2025, 4, 15), { representation: 'date' }), recurrence: 'monthly', amount: 350.50, status: 'pending', createdAt: formatISO(new Date(2025, 3, 20)), updatedAt: formatISO(new Date(2025, 3, 20))},
  { id: 'rem002', title: 'Servicio de Limpieza Oficina', dueDate: formatISO(subDays(new Date(), 5), { representation: 'date' }), recurrence: 'monthly', amount: 120.00, status: 'pending', createdAt: formatISO(subDays(new Date(), 35)), updatedAt: formatISO(subDays(new Date(), 35))}, // Vencido
  { id: 'rem003', title: 'Cuota Préstamo Banco X', dueDate: formatISO(addDays(new Date(), 2), { representation: 'date' }), recurrence: 'monthly', amount: 780.00, status: 'pending', createdAt: formatISO(subDays(new Date(), 28)), updatedAt: formatISO(subDays(new Date(), 28))}, // Próximo a vencer
];

const initialMockImportantNotesData: ImportantNote[] = [
  { id: 'note001', title: 'Protocolo Cierre de Caja Diario', content: 'Recordar verificar todos los POS, efectivo contado y reporte Z antes de cerrar.', createdAt: formatISO(subDays(new Date(), 2)) },
  { id: 'note002', title: 'Contacto Proveedor Principal Insumos', content: 'Juan Pérez - JP Insumos Médicos - Cel: 987654321 - Correo: jperez@jpinsumos.com. Pedidos los lunes.', createdAt: formatISO(subDays(new Date(), 10)) },
];

// Mock Database Store
interface MockDB {
  users: User[];
  professionals: Professional[];
  patients: Patient[];
  services: Service[];
  appointments: Appointment[];
  periodicReminders: PeriodicReminder[];
  importantNotes: ImportantNote[];
}

let mockDB: MockDB = {
  users: [],
  professionals: [],
  patients: [],
  services: [],
  appointments: [],
  periodicReminders: [],
  importantNotes: [],
};

export const initializeGlobalMockStore = () => {
  console.log("[data.ts] initializeGlobalMockStore called. Current useMockDatabase:", useMockDatabase);
  if (mockDB.users.length === 0 && mockDB.professionals.length === 0 && mockDB.appointments.length === 0) {
    mockDB = {
      users: [...initialMockUsersData],
      professionals: [...initialMockProfessionalsData],
      patients: [...initialMockPatientsData],
      services: [...initialMockServicesData],
      appointments: [...initialMockAppointmentsData],
      periodicReminders: [...initialMockPeriodicRemindersData],
      importantNotes: [...initialMockImportantNotesData],
    };
    console.log("[data.ts] MockDB initialized with new data.");
  } else {
    console.log("[data.ts] MockDB already has data, skipping re-initialization.");
  }
};

if (useMockDatabase) {
  initializeGlobalMockStore();
}


// --- Auth ---
export const getUserByUsername = async (username: string): Promise<User | undefined> => {
  try {
    if (useMockDatabase) {
      console.log(`[data.ts] getUserByUsername (mock) for: ${username}`);
      const user = mockDB.users.find(u => u.username.toLowerCase() === username.toLowerCase());
      if (user) return { ...user };
      console.warn(`[data.ts] getUserByUsername (mock): User ${username} not found.`);
      return undefined;
    }
    if (!firestore) {
      console.error("[data.ts] getUserByUsername: Firestore is not initialized. Cannot fetch user.");
      throw new Error("Firestore not initialized");
    }
    console.log(`[data.ts] getUserByUsername (Firestore) for: ${username}`);
    const usersCol = collection(firestore, 'usuarios');
    const q = query(usersCol, where('username', '==', username));
    const snapshot = await getDocs(q);

    if (snapshot.empty) {
      console.warn(`[data.ts] getUserByUsername (Firestore): No user found with username: ${username}`);
      return undefined;
    }
    const userDoc = snapshot.docs[0];
    const userData = { id: userDoc.id, ...convertDocumentData(userDoc.data()) } as User;
    console.log(`[data.ts] getUserByUsername (Firestore): User found:`, userData);
    return userData;
  } catch (error) {
    console.error(`[data.ts] Error fetching user by username "${username}":`, error);
    // No retornar mock data aquí, dejar que el AuthProvider maneje el error de forma más centralizada.
    throw error;
  }
};


// --- Professionals ---
export const getProfessionals = async (locationId?: LocationId): Promise<(Professional & { contractDisplayStatus: ContractDisplayStatus })[]> => {
  let professionalsToProcess: Professional[];
  const currentSystemDate = new Date(); // Use real current date for status calculation

  try {
    if (useMockDatabase) {
      console.log("[data.ts] getProfessionals (mock) for locationId:", locationId);
      professionalsToProcess = locationId ? mockDB.professionals.filter(p => p.locationId === locationId) : [...mockDB.professionals];
    } else {
      if (!firestore) {
        console.warn("[data.ts] getProfessionals: Firestore not available, falling back to mock data.");
        professionalsToProcess = locationId ? initialMockProfessionalsData.filter(p => p.locationId === locationId) : [...initialMockProfessionalsData];
      } else {
        const professionalsCol = collection(firestore, 'profesionales');
        let qConstraints: QueryConstraint[] = [orderBy("lastName"), orderBy("firstName")];
        if (locationId) {
          qConstraints.unshift(where('locationId', '==', locationId));
        }
        const finalQuery = query(professionalsCol, ...qConstraints);
        const snapshot = await getDocs(finalQuery);
        professionalsToProcess = snapshot.docs.map(docSnap => ({ id: docSnap.id, ...convertDocumentData(docSnap.data()) } as Professional));

        if (professionalsToProcess.length === 0) {
            console.warn(`[data.ts] Firestore 'profesionales' query returned no results for locationId '${locationId || 'all'}'. Falling back to mock for this context if applicable.`);
            professionalsToProcess = locationId ? initialMockProfessionalsData.filter(p => p.locationId === locationId) : [...initialMockProfessionalsData];
        }
      }
    }
    
    return professionalsToProcess.map(prof => ({
      ...prof,
      contractDisplayStatus: getContractDisplayStatus(prof.currentContract, currentSystemDate)
    })).sort((a,b) => `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`));

  } catch (error) {
    console.error("[data.ts] Error in getProfessionals, falling back to basic mock data:", error);
    professionalsToProcess = locationId ? initialMockProfessionalsData.filter(p => p.locationId === locationId) : [...initialMockProfessionalsData];
    return professionalsToProcess.map(prof => ({
      ...prof,
      contractDisplayStatus: getContractDisplayStatus(prof.currentContract, currentSystemDate)
    })).sort((a,b) => `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`));
  }
};


export const getProfessionalById = async (id: string): Promise<Professional | undefined> => {
  try {
    if (useMockDatabase) {
      const professional = mockDB.professionals.find(p => p.id === id);
      return professional ? { ...professional } : undefined;
    }
    if (!firestore) {
      console.warn("[data.ts] getProfessionalById: Firestore not available, falling back to mock data.");
      return initialMockProfessionalsData.find(p => p.id === id);
    }
    const docRef = doc(firestore, 'profesionales', id);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      return { id: docSnap.id, ...convertDocumentData(docSnap.data()) } as Professional;
    }
    return undefined;
  } catch (error) {
    console.error(`[data.ts] Error fetching professional by ID "${id}", falling back to mock:`, error);
    return initialMockProfessionalsData.find(p => p.id === id);
  }
};

export const addProfessional = async (data: Omit<ProfessionalFormData, 'id'>): Promise<Professional> => {
  try {
    const newProfessionalData: Omit<Professional, 'id'> = {
      firstName: data.firstName,
      lastName: data.lastName,
      locationId: data.locationId,
      phone: data.phone || null,
      birthDay: data.birthDay || null,
      birthMonth: data.birthMonth || null,
      biWeeklyEarnings: 0,
      workSchedule: {},
      customScheduleOverrides: data.customScheduleOverrides?.map(ov => ({
        ...ov,
        id: ov.id || generateId(),
        date: formatISO(ov.date, { representation: 'date' }),
        startTime: ov.isWorking ? ov.startTime : undefined,
        endTime: ov.isWorking ? ov.endTime : undefined,
        notes: ov.notes || null,
      })) || [],
      currentContract: (data.currentContract_startDate && data.currentContract_endDate) ? {
        id: generateId(),
        startDate: formatISO(data.currentContract_startDate, { representation: 'date' }),
        endDate: formatISO(data.currentContract_endDate, { representation: 'date' }),
        notes: data.currentContract_notes || null,
        empresa: data.currentContract_empresa || null,
      } : null,
      contractHistory: [],
    };

    if (data.workSchedule) {
      (Object.keys(data.workSchedule) as Array<DayOfWeekId>).forEach(dayId => {
        const dayData = data.workSchedule![dayId];
        if (dayData) {
          newProfessionalData.workSchedule[dayId] = {
            startTime: dayData.startTime || '00:00',
            endTime: dayData.endTime || '00:00',
            isWorking: dayData.isWorking === undefined ? true : dayData.isWorking,
          };
        }
      });
    }
    
    if (useMockDatabase) {
      const newId = generateId();
      const newProfWithId = { ...newProfessionalData, id: newId } as Professional;
      mockDB.professionals.push(newProfWithId);
      return { ...newProfWithId };
    }

    if (!firestore) {
      console.error("[data.ts] addProfessional: Firestore is not initialized.");
      throw new Error("Firestore not initialized. Professional not added.");
    }

    const firestoreData: any = { ...newProfessionalData };
    if (firestoreData.currentContract) {
      firestoreData.currentContract.startDate = toFirestoreTimestamp(firestoreData.currentContract.startDate);
      firestoreData.currentContract.endDate = toFirestoreTimestamp(firestoreData.currentContract.endDate);
    }
    if (firestoreData.customScheduleOverrides) {
      firestoreData.customScheduleOverrides = firestoreData.customScheduleOverrides.map((ov: any) => ({
        ...ov,
        date: toFirestoreTimestamp(ov.date),
      }));
    }
    Object.keys(firestoreData).forEach(key => {
      if (firestoreData[key] === undefined) firestoreData[key] = null;
    });


    const docRef = await addDoc(collection(firestore, 'profesionales'), firestoreData);
    return { ...newProfessionalData, id: docRef.id } as Professional;
  } catch (error) {
    console.error("[data.ts] Error adding professional:", error);
    throw error;
  }
};

export const updateProfessional = async (id: string, data: Partial<ProfessionalFormData>): Promise<Professional | undefined> => {
  try {
    const professionalToUpdate: Partial<Professional> = {
      ...data,
      phone: data.phone === undefined ? undefined : (data.phone || null),
      birthDay: data.birthDay === undefined ? undefined : (data.birthDay || null),
      birthMonth: data.birthMonth === undefined ? undefined : (data.birthMonth || null),
    };

    if (data.customScheduleOverrides !== undefined) {
      professionalToUpdate.customScheduleOverrides = data.customScheduleOverrides?.map(ov => ({
        ...ov,
        id: ov.id || generateId(),
        date: formatISO(ov.date, { representation: 'date' }),
        startTime: ov.isWorking ? ov.startTime : undefined,
        endTime: ov.isWorking ? ov.endTime : undefined,
        notes: ov.notes || null,
      })) || [];
    }
    
    let newCurrentContractData: Contract | null | undefined = undefined;
    if (data.hasOwnProperty('currentContract_startDate') || data.hasOwnProperty('currentContract_endDate') || data.hasOwnProperty('currentContract_notes') || data.hasOwnProperty('currentContract_empresa')) {
        if (data.currentContract_startDate && data.currentContract_endDate) {
            newCurrentContractData = {
                id: data.id || generateId(), 
                startDate: formatISO(data.currentContract_startDate, { representation: 'date' }),
                endDate: formatISO(data.currentContract_endDate, { representation: 'date' }),
                notes: data.currentContract_notes || null,
                empresa: data.currentContract_empresa || null,
            };
        } else {
            newCurrentContractData = null;
        }
    }

    if (useMockDatabase) {
      const index = mockDB.professionals.findIndex(p => p.id === id);
      if (index === -1) return undefined;
      
      const existingProfessional = mockDB.professionals[index];
      if (newCurrentContractData !== undefined) {
        if (existingProfessional.currentContract && newCurrentContractData && existingProfessional.currentContract.id !== newCurrentContractData.id) {
          if (!existingProfessional.contractHistory) existingProfessional.contractHistory = [];
          if (!existingProfessional.contractHistory.find(ch => ch.id === existingProfessional.currentContract!.id)) {
            existingProfessional.contractHistory.push(existingProfessional.currentContract);
          }
        } else if (existingProfessional.currentContract && newCurrentContractData === null) {
           if (!existingProfessional.contractHistory) existingProfessional.contractHistory = [];
           if (!existingProfessional.contractHistory.find(ch => ch.id === existingProfessional.currentContract!.id)) {
            existingProfessional.contractHistory.push(existingProfessional.currentContract);
           }
        }
        professionalToUpdate.currentContract = newCurrentContractData;
      }
      mockDB.professionals[index] = { ...existingProfessional, ...professionalToUpdate } as Professional;
      return { ...mockDB.professionals[index] };
    }

    if (!firestore) {
      console.error("[data.ts] updateProfessional: Firestore is not initialized.");
      throw new Error("Firestore not initialized. Professional not updated.");
    }

    const docRef = doc(firestore, 'profesionales', id);
    const professionalDoc = await getDoc(docRef);
    if (!professionalDoc.exists()) {
        console.warn(`[data.ts] Professional with ID ${id} not found in Firestore for update.`);
        return undefined;
    }
    const existingFirestoreProfessional = { id: professionalDoc.id, ...convertDocumentData(professionalDoc.data()) } as Professional;
    
    const firestoreUpdateData: any = { ...professionalToUpdate };

    if (professionalToUpdate.customScheduleOverrides) {
      firestoreUpdateData.customScheduleOverrides = professionalToUpdate.customScheduleOverrides.map((ov: any) => ({
        ...ov,
        id: ov.id || generateId(), // Ensure ID for new overrides
        date: toFirestoreTimestamp(ov.date),
      }));
    }
    
    if (newCurrentContractData !== undefined) {
        firestoreUpdateData.currentContract = newCurrentContractData ? {
            ...newCurrentContractData,
            id: newCurrentContractData.id || generateId(), // Ensure new contract has an ID
            startDate: toFirestoreTimestamp(newCurrentContractData.startDate)!,
            endDate: toFirestoreTimestamp(newCurrentContractData.endDate)!,
        } : null;

        const newContractHistory = [...(existingFirestoreProfessional.contractHistory || [])];
        if (existingFirestoreProfessional.currentContract && newCurrentContractData && existingFirestoreProfessional.currentContract.id !== newCurrentContractData.id) {
           if (!newContractHistory.find(ch => ch.id === existingFirestoreProfessional.currentContract!.id)) {
             newContractHistory.push({
                ...existingFirestoreProfessional.currentContract,
                startDate: existingFirestoreProfessional.currentContract.startDate,
                endDate: existingFirestoreProfessional.currentContract.endDate,
             });
           }
        } else if (existingFirestoreProfessional.currentContract && newCurrentContractData === null) {
            if (!newContractHistory.find(ch => ch.id === existingFirestoreProfessional.currentContract!.id)) {
             newContractHistory.push({
                ...existingFirestoreProfessional.currentContract,
                startDate: existingFirestoreProfessional.currentContract.startDate,
                endDate: existingFirestoreProfessional.currentContract.endDate,
             });
           }
        }
        firestoreUpdateData.contractHistory = newContractHistory.map(ch => ({
            ...ch,
            startDate: toFirestoreTimestamp(ch.startDate)!,
            endDate: toFirestoreTimestamp(ch.endDate)!,
        }));
    }

    if (firestoreUpdateData.workSchedule) {
        firestoreUpdateData.workSchedule = {...existingFirestoreProfessional.workSchedule, ...firestoreUpdateData.workSchedule};
    }

    Object.keys(firestoreUpdateData).forEach(key => {
        if (firestoreUpdateData[key] === undefined) firestoreUpdateData[key] = null;
    });

    await updateDoc(docRef, firestoreUpdateData);
    const updatedDocSnap = await getDoc(docRef);
    return { id: updatedDocSnap.id, ...convertDocumentData(updatedDocSnap.data()) } as Professional;

  } catch (error) {
    console.error(`[data.ts] Error updating professional "${id}":`, error);
    throw error;
  }
};

export function getProfessionalAvailabilityForDate(
  professional: Professional,
  targetDate: Date
): { startTime: string; endTime: string; notes?: string; reason?: string } | null {
  try {
    const contractStatus = getContractDisplayStatus(professional.currentContract, targetDate);
    // console.log(`[Availability] Prof ${professional.firstName} ${professional.lastName} - Contract Status for ${format(targetDate, 'yyyy-MM-dd')}: ${contractStatus}`);

    if (contractStatus !== 'Activo') {
      return { startTime: '', endTime: '', reason: `No laborable (Contrato: ${contractStatus})` };
    }

    const dateToCheck = startOfDay(targetDate);
    const targetDateString = formatISO(dateToCheck, { representation: 'date' });
    // console.log(`[Availability] Prof ${professional.firstName} - Checking for date: ${targetDateString}`);


    if (professional.customScheduleOverrides) {
      const override = professional.customScheduleOverrides.find(
        ov => ov.date === targetDateString
      );
      if (override) {
        // console.log(`[Availability] Prof ${professional.firstName} - Found override:`, override);
        if (override.isWorking && override.startTime && override.endTime) {
          return { startTime: override.startTime, endTime: override.endTime, notes: override.notes, reason: `Horario especial (${override.notes || 'Anulación'})` };
        }
        return { startTime: '', endTime: '', reason: `Descansando (Anulación${override.notes ? `: ${override.notes}` : ''})` };
      }
    }

    if (professional.workSchedule) {
      const dayOfWeekIndex = getDay(dateToCheck); // 0 for Sunday, 1 for Monday, etc.
      const dayKey = DAYS_OF_WEEK.find(d => d.id === (['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as DayOfWeekId[])[dayOfWeekIndex])?.id;
      // console.log(`[Availability] Prof ${professional.firstName} - DayKey for ${targetDateString}: ${dayKey}`);


      if (dayKey) {
          const dailySchedule = professional.workSchedule[dayKey];
          // console.log(`[Availability] Prof ${professional.firstName} - Base schedule for ${dayKey}:`, dailySchedule);
          if (dailySchedule) {
            if (dailySchedule.isWorking === false) {
              return { startTime: '', endTime: '', reason: `Descansando (Horario base: ${DAYS_OF_WEEK.find(d=>d.id === dayKey)?.name} libre)` };
            }
            if ((dailySchedule.isWorking === true || dailySchedule.isWorking === undefined) && dailySchedule.startTime && dailySchedule.endTime) {
                return { startTime: dailySchedule.startTime, endTime: dailySchedule.endTime, reason: "Horario base" };
            }
          }
      }
    }
    // console.log(`[Availability] Prof ${professional.firstName} - No specific schedule found, defaulting to not available.`);
    return { startTime: '', endTime: '', reason: "Descansando (Sin horario definido o no laborable)" };
  } catch (error) {
    console.error("[data.ts] Error in getProfessionalAvailabilityForDate:", error, "Professional:", professional, "TargetDate:", targetDate);
    return { startTime: '', endTime: '', reason: "Error al determinar disponibilidad" };
  }
}

// --- Patients ---
export const getPatients = async (options?: { page?: number; limit?: number; searchTerm?: string; filterToday?: boolean; adminSelectedLocation?: LocationId | 'all' | null; user?: User | null; lastVisiblePatientId?: string | null }): Promise<{patients: Patient[], totalCount: number, lastVisiblePatientId: string | null}> => {
  const { page = 1, limit: pageSize = 10, searchTerm = '', filterToday = false, adminSelectedLocation, user, lastVisiblePatientId: startAfterId } = options || {};

  try {
    if (useMockDatabase) {
      let filteredPatients = [...mockDB.patients];
      if (searchTerm) {
        const lowerSearchTerm = searchTerm.toLowerCase();
        filteredPatients = filteredPatients.filter(p =>
          `${p.firstName} ${p.lastName}`.toLowerCase().includes(lowerSearchTerm) ||
          (p.phone && p.phone.includes(searchTerm))
        );
      }
      const totalCount = filteredPatients.length;
      const startIndex = (page - 1) * pageSize;
      const paginatedPatients = filteredPatients.slice(startIndex, startIndex + pageSize);
      
      return {
          patients: paginatedPatients.map(p => ({ ...p })),
          totalCount: totalCount,
          lastVisiblePatientId: paginatedPatients.length > 0 ? paginatedPatients[paginatedPatients.length - 1].id : null,
      };
    }

    if (!firestore) {
      console.warn("[data.ts] getPatients: Firestore not available, falling back to mock data.");
      return { patients: initialMockPatientsData.slice(0, pageSize), totalCount: initialMockPatientsData.length, lastVisiblePatientId: null };
    }

    const patientsCol = collection(firestore, 'pacientes') as CollectionReference<DocumentData>;
    let queryConstraints: QueryConstraint[] = [];
    
    if (searchTerm) {
       queryConstraints.push(where('firstName', '>=', searchTerm.charAt(0).toUpperCase() + searchTerm.slice(1).toLowerCase()));
       queryConstraints.push(where('firstName', '<=', searchTerm.charAt(0).toUpperCase() + searchTerm.slice(1).toLowerCase() + '\uf8ff'));
    }

    queryConstraints.push(orderBy('firstName'));
    queryConstraints.push(orderBy('lastName'));

    const countQuery = query(patientsCol, ...queryConstraints.filter(c => (c as any)._type !== 'limit' && (c as any)._type !== 'startAfter'));
    const countSnapshot = await getCountFromServer(countQuery);
    const totalCount = countSnapshot.data().count;
    
    if (page > 1 && startAfterId) {
        const lastVisibleDoc = await getDoc(doc(patientsCol, startAfterId));
        if (lastVisibleDoc.exists()) {
            queryConstraints.push(startAfter(lastVisibleDoc));
        } else {
            console.warn(`[data.ts] getPatients: lastVisiblePatientId ${startAfterId} not found. Fetching from beginning of page ${page}.`);
        }
    }
    
    queryConstraints.push(limit(pageSize));

    const finalQuery = query(patientsCol, ...queryConstraints);
    const snapshot = await getDocs(finalQuery);
    
    const patients = snapshot.docs.map(docSnap => ({ id: docSnap.id, ...convertDocumentData(docSnap.data()) } as Patient));
    const newLastVisibleId = snapshot.docs.length > 0 ? snapshot.docs[snapshot.docs.length - 1].id : null;

    let finalPatients = patients;
    if (searchTerm && !queryConstraints.some(c => (c as any)._field?.segments.join('.') === 'firstName' && (c as any)._op === '>=')) { 
        const lowerSearchTerm = searchTerm.toLowerCase();
        finalPatients = patients.filter(p =>
            `${p.firstName} ${p.lastName}`.toLowerCase().includes(lowerSearchTerm) ||
            (p.phone && p.phone.includes(searchTerm))
        );
    }

    return { patients: finalPatients, totalCount, lastVisiblePatientId: newLastVisibleId };

  } catch (error) {
    console.error("[data.ts] Error fetching patients from Firestore:", error);
    return { patients: initialMockPatientsData.slice(0, pageSize), totalCount: initialMockPatientsData.length, lastVisiblePatientId: null };
  }
};

export async function findPatient(firstName: string, lastName: string): Promise<Patient | undefined> {
  try {
    if (useMockDatabase) {
      return mockDB.patients.find(p => p.firstName.toLowerCase() === firstName.toLowerCase() && p.lastName.toLowerCase() === lastName.toLowerCase());
    }
    if (!firestore) throw new Error("Firestore not initialized");
    const patientsCol = collection(firestore, 'pacientes');
    const q = query(patientsCol, where('firstName', '==', firstName), where('lastName', '==', lastName));
    const snapshot = await getDocs(q);
    if (snapshot.empty) return undefined;
    return { id: snapshot.docs[0].id, ...convertDocumentData(snapshot.docs[0].data()) } as Patient;
  } catch (error) {
    console.error("[data.ts] Error in findPatient:", error);
    throw error;
  }
}

export async function addPatient(data: Omit<Patient, 'id'>): Promise<Patient> {
  try {
    const newPatientData = {
      ...data,
      phone: data.phone || null,
      age: data.age === undefined ? null : (data.age || null),
      isDiabetic: data.isDiabetic || false,
      notes: data.notes || null,
    };

    if (useMockDatabase) {
      const newId = generateId();
      const newPatient = { ...newPatientData, id: newId };
      mockDB.patients.push(newPatient);
      return { ...newPatient };
    }
    if (!firestore) throw new Error("Firestore not initialized");
    const firestoreData = {...newPatientData};
    Object.keys(firestoreData).forEach(key => {
        if ((firestoreData as any)[key] === undefined) (firestoreData as any)[key] = null;
    });
    const docRef = await addDoc(collection(firestore, 'pacientes'), firestoreData);
    return { ...newPatientData, id: docRef.id } as Patient;
  } catch (error) {
    console.error("[data.ts] Error in addPatient:", error);
    throw error;
  }
}

export async function updatePatient(id: string, data: Partial<Patient>): Promise<Patient | undefined> {
  try {
    const patientUpdateData: Partial<Patient> = { ...data };
    if (data.hasOwnProperty('phone')) patientUpdateData.phone = data.phone || null;
    if (data.hasOwnProperty('age')) patientUpdateData.age = data.age === undefined ? null : (data.age || null);
    if (data.hasOwnProperty('isDiabetic')) patientUpdateData.isDiabetic = data.isDiabetic || false;
    if (data.hasOwnProperty('notes')) patientUpdateData.notes = data.notes || null;

    if (useMockDatabase) {
      const index = mockDB.patients.findIndex(p => p.id === id);
      if (index === -1) return undefined;
      mockDB.patients[index] = { ...mockDB.patients[index], ...patientUpdateData };
      return { ...mockDB.patients[index] };
    }
    if (!firestore) throw new Error("Firestore not initialized");
    const docRef = doc(firestore, 'pacientes', id);
    const firestoreUpdate: any = {...patientUpdateData};
    Object.keys(firestoreUpdate).forEach(key => {
        if (firestoreUpdate[key] === undefined) firestoreUpdate[key] = null;
    });
    await updateDoc(docRef, firestoreUpdate);
    const updatedDoc = await getDoc(docRef);
    if (!updatedDoc.exists()) return undefined;
    return { id: updatedDoc.id, ...convertDocumentData(updatedDoc.data()) } as Patient;
  } catch (error) {
    console.error("[data.ts] Error in updatePatient:", error);
    throw error;
  }
}

export async function getPatientById(id: string): Promise<Patient | undefined> {
  try {
    if (useMockDatabase) {
      return mockDB.patients.find(p => p.id === id);
    }
    if (!firestore) throw new Error("Firestore not initialized");
    const docRef = doc(firestore, 'pacientes', id);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      return { id: docSnap.id, ...convertDocumentData(docSnap.data()) } as Patient;
    }
    return undefined;
  } catch (error) {
    console.error("[data.ts] Error in getPatientById:", error);
    throw error;
  }
}

// --- Services ---
export async function getServices(): Promise<Service[]> {
  try {
    if (useMockDatabase) {
      return [...mockDB.services];
    }
    if (!firestore) {
      console.warn("[data.ts] getServices: Firestore not available, falling back to mock.");
      return [...initialMockServicesData];
    }
    const snapshot = await getDocs(collection(firestore, 'servicios'));
    if (snapshot.empty) {
        console.warn("[data.ts] Firestore 'servicios' collection is empty. Falling back to mock.");
        return [...initialMockServicesData];
    }
    return snapshot.docs.map(docSnap => ({ id: docSnap.id, ...convertDocumentData(docSnap.data()) } as Service));
  } catch (error) {
    console.error("[data.ts] Error fetching services, falling back to mock:", error);
    return [...initialMockServicesData];
  }
}

export async function addService(data: ServiceFormData): Promise<Service> {
  try {
    const newServiceData = {
      name: data.name,
      defaultDuration: (data.defaultDuration.hours * 60) + data.defaultDuration.minutes,
      price: data.price === undefined ? null : (data.price || null),
    };
    if (useMockDatabase) {
      const newId = data.id || generateId(); 
      const newService = { ...newServiceData, id: newId };
      if (!mockDB.services.find(s => s.id === newId)) {
          mockDB.services.push(newService);
      } else {
          const index = mockDB.services.findIndex(s => s.id === newId);
          mockDB.services[index] = newService;
      }
      return { ...newService };
    }
    if (!firestore) throw new Error("Firestore not initialized");
    const firestoreData: any = {...newServiceData};
    Object.keys(firestoreData).forEach(key => {
        if (firestoreData[key] === undefined) firestoreData[key] = null;
    });

    if (data.id) {
      const docRef = doc(firestore, 'servicios', data.id);
      await setDoc(docRef, firestoreData);
      return { ...newServiceData, id: data.id };
    } else {
      const docRef = await addDoc(collection(firestore, 'servicios'), firestoreData);
      return { ...newServiceData, id: docRef.id };
    }
  } catch (error) {
    console.error("[data.ts] Error in addService:", error);
    throw error;
  }
}

export async function updateService(id: string, data: Partial<ServiceFormData>): Promise<Service | undefined> {
  try {
    const serviceUpdateData: Partial<Omit<Service, 'id'>> = {};
    if (data.name) serviceUpdateData.name = data.name;
    if (data.defaultDuration) serviceUpdateData.defaultDuration = (data.defaultDuration.hours * 60) + data.defaultDuration.minutes;
    if (data.hasOwnProperty('price')) serviceUpdateData.price = data.price === undefined ? null : (data.price || null);

    if (useMockDatabase) {
      const index = mockDB.services.findIndex(s => s.id === id);
      if (index === -1) return undefined;
      mockDB.services[index] = { ...mockDB.services[index], ...serviceUpdateData };
      return { ...mockDB.services[index] };
    }
    if (!firestore) throw new Error("Firestore not initialized");
    const docRef = doc(firestore, 'servicios', id);
    const firestoreUpdate: any = {...serviceUpdateData};
    Object.keys(firestoreUpdate).forEach(key => {
        if (firestoreUpdate[key] === undefined) firestoreUpdate[key] = null;
    });
    await updateDoc(docRef, firestoreUpdate);
    const updatedDoc = await getDoc(docRef);
    if (!updatedDoc.exists()) return undefined;
    return { id: updatedDoc.id, ...convertDocumentData(updatedDoc.data()) } as Service;
  } catch (error) {
    console.error("[data.ts] Error in updateService:", error);
    throw error;
  }
}

// --- Appointments ---
export async function getAppointments(filters: { locationId?: LocationId | 'all' | null; date?: Date; statuses?: AppointmentStatus[]; dateRange?: { start: Date; end: Date } }): Promise<{ appointments: Appointment[], totalCount?: number }> {
  const { locationId, date, statuses, dateRange } = filters;
  try {
    if (useMockDatabase) {
      let filteredAppointments = [...mockDB.appointments];
      if (locationId && locationId !== 'all') {
        filteredAppointments = filteredAppointments.filter(a => a.locationId === locationId);
      }
      if (date) {
        const targetDate = startOfDay(date);
        filteredAppointments = filteredAppointments.filter(a => dateFnsIsSameDay(parseISO(a.appointmentDateTime), targetDate));
      }
      if (statuses && statuses.length > 0) {
        filteredAppointments = filteredAppointments.filter(a => statuses.includes(a.status));
      }
      if (dateRange) {
          const rangeStart = startOfDay(dateRange.start);
          const rangeEnd = endOfDay(dateRange.end);
          filteredAppointments = filteredAppointments.filter(a => {
              const apptDate = parseISO(a.appointmentDateTime);
              return isWithinInterval(apptDate, {start: rangeStart, end: rangeEnd});
          });
      }
      filteredAppointments = filteredAppointments.map(appt => ({
        ...appt,
        patient: mockDB.patients.find(p => p.id === appt.patientId),
        service: mockDB.services.find(s => s.id === appt.serviceId),
        professional: mockDB.professionals.find(p => p.id === appt.professionalId),
      }));
      return { appointments: filteredAppointments.sort((a,b) => parseISO(a.appointmentDateTime).getTime() - parseISO(b.appointmentDateTime).getTime()) };
    }

    if (!firestore) {
      console.warn("[data.ts] getAppointments: Firestore not available. Falling back to mock data or empty array.");
      return { appointments: [] };
    }
    const citasCol = collection(firestore, 'citas');
    let qConstraints: QueryConstraint[] = [];

    if (locationId && locationId !== 'all') {
      qConstraints.push(where('locationId', '==', locationId));
    }
    if (date) {
      qConstraints.push(where('appointmentDateTime', '>=', toFirestoreTimestamp(startOfDay(date))!));
      qConstraints.push(where('appointmentDateTime', '<=', toFirestoreTimestamp(endOfDay(date))!));
    }
    if (statuses && statuses.length > 0) {
      if (statuses.length === 1) {
        qConstraints.push(where('status', '==', statuses[0]));
      } else {
        qConstraints.push(where('status', 'in', statuses));
      }
    }
     if (dateRange) {
        qConstraints.push(where('appointmentDateTime', '>=', toFirestoreTimestamp(startOfDay(dateRange.start))!));
        qConstraints.push(where('appointmentDateTime', '<=', toFirestoreTimestamp(endOfDay(dateRange.end))!));
    }

    qConstraints.push(orderBy('appointmentDateTime'));

    const finalQuery = query(citasCol, ...qConstraints);
    const snapshot = await getDocs(finalQuery);

    if (snapshot.empty) {
      console.warn("[data.ts] Firestore 'citas' query returned no results with current filters. Falling back to mock if applicable, or empty array.");
      return { appointments: [] };
    }
    
    const appointmentsData = snapshot.docs.map(docSnap => ({ id: docSnap.id, ...convertDocumentData(docSnap.data()) } as Appointment));

    const populatedAppointments = await Promise.all(appointmentsData.map(async appt => {
      const [patientData, serviceData, professionalData] = await Promise.all([
        appt.patientId ? getDoc(doc(firestore, 'pacientes', appt.patientId)) : Promise.resolve(null),
        appt.serviceId ? getDoc(doc(firestore, 'servicios', appt.serviceId)) : Promise.resolve(null),
        appt.professionalId ? getDoc(doc(firestore, 'profesionales', appt.professionalId)) : Promise.resolve(null),
      ]);
      return {
        ...appt,
        patient: patientData?.exists() ? { id: patientData.id, ...convertDocumentData(patientData.data()) } as Patient : undefined,
        service: serviceData?.exists() ? { id: serviceData.id, ...convertDocumentData(serviceData.data()) } as Service : undefined,
        professional: professionalData?.exists() ? { id: professionalData.id, ...convertDocumentData(professionalData.data()) } as Professional : undefined,
      };
    }));

    return { appointments: populatedAppointments.sort((a,b) => parseISO(a.appointmentDateTime).getTime() - parseISO(b.appointmentDateTime).getTime()) };

  } catch (error) {
    console.error("[data.ts] Error fetching appointments from Firestore:", error);
    return { appointments: [] };
  }
}

export async function getAppointmentById(id: string): Promise<Appointment | undefined> {
  try {
    if (useMockDatabase) {
      const appt = mockDB.appointments.find(a => a.id === id);
      if (!appt) return undefined;
      return {
        ...appt,
        patient: mockDB.patients.find(p => p.id === appt.patientId),
        service: mockDB.services.find(s => s.id === appt.serviceId),
        professional: mockDB.professionals.find(p => p.id === appt.professionalId),
      };
    }
    if (!firestore) throw new Error("Firestore not initialized");
    const docRef = doc(firestore, 'citas', id);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      const apptData = { id: docSnap.id, ...convertDocumentData(docSnap.data()) } as Appointment;
      const [patientData, serviceData, professionalData] = await Promise.all([
          apptData.patientId ? getDoc(doc(firestore, 'pacientes', apptData.patientId)) : Promise.resolve(null),
          apptData.serviceId ? getDoc(doc(firestore, 'servicios', apptData.serviceId)) : Promise.resolve(null),
          apptData.professionalId ? getDoc(doc(firestore, 'profesionales', apptData.professionalId)) : Promise.resolve(null),
        ]);
      return {
          ...apptData,
          patient: patientData?.exists() ? { id: patientData.id, ...convertDocumentData(patientData.data()) } as Patient : undefined,
          service: serviceData?.exists() ? { id: serviceData.id, ...convertDocumentData(serviceData.data()) } as Service : undefined,
          professional: professionalData?.exists() ? { id: professionalData.id, ...convertDocumentData(professionalData.data()) } as Professional : undefined,
      }
    }
    return undefined;
  } catch (error) {
    console.error("[data.ts] Error in getAppointmentById:", error);
    throw error;
  }
}

export async function getPatientAppointmentHistory(patientId: string): Promise<{appointments: Appointment[]}> {
  try {
    if (useMockDatabase) {
        const history = mockDB.appointments.filter(a => a.patientId === patientId).map(appt => ({
            ...appt,
            service: mockDB.services.find(s => s.id === appt.serviceId),
            professional: mockDB.professionals.find(p => p.id === appt.professionalId)
        })).sort((a,b) => parseISO(b.appointmentDateTime).getTime() - parseISO(a.appointmentDateTime).getTime());
        return {appointments: history};
    }
     if (!firestore) {
        console.warn("[data.ts] getPatientAppointmentHistory: Firestore not initialized, returning empty history.");
        return { appointments: [] };
    }
    const q = query(collection(firestore, 'citas'), where('patientId', '==', patientId), orderBy('appointmentDateTime', 'desc'));
    const snapshot = await getDocs(q);
    const appointments = await Promise.all(snapshot.docs.map(async docSnap => {
        const apptData = { id: docSnap.id, ...convertDocumentData(docSnap.data()) } as Appointment;
        const serviceData = apptData.serviceId ? await getDoc(doc(firestore, 'servicios', apptData.serviceId)) : null;
        const professionalData = apptData.professionalId ? await getDoc(doc(firestore, 'profesionales', apptData.professionalId)) : null;
        return {
            ...apptData,
            service: serviceData?.exists() ? { id: serviceData.id, ...convertDocumentData(serviceData.data()) } as Service : undefined,
            professional: professionalData?.exists() ? { id: professionalData.id, ...convertDocumentData(professionalData.data()) } as Professional : undefined,
        };
    }));
    return {appointments};
  } catch (error) {
      console.error(`[data.ts] Error fetching appointment history for patient ${patientId}:`, error);
      return {appointments: []};
  }
}

export async function addAppointment(data: AppointmentFormData & { isExternalProfessional?: boolean; externalProfessionalOriginLocationId?: LocationId | null }): Promise<Appointment> {
  try {
    const service = useMockDatabase 
        ? mockDB.services.find(s => s.id === data.serviceId) 
        : await getDoc(doc(firestore!, 'servicios', data.serviceId)).then(d => d.exists() ? {id: d.id, ...convertDocumentData(d.data())} as Service : undefined) ;
    if (!service) throw new Error("Servicio no encontrado para la cita.");

    const appointmentDateTimeObject = parse(`${format(data.appointmentDate, 'yyyy-MM-dd')} ${data.appointmentTime}`, 'yyyy-MM-dd HH:mm', new Date());
    const appointmentDateTime = formatISO(appointmentDateTimeObject);
    const appointmentDuration = service.defaultDuration || 60;
    const appointmentEndTime = dateFnsAddMinutes(parseISO(appointmentDateTime), appointmentDuration);

    let actualProfessionalId: string | undefined | null = undefined;
    let isExternal = data.isExternalProfessional || false;
    let externalOriginLocId = data.externalProfessionalOriginLocationId || null;

    if (data.preferredProfessionalId && data.preferredProfessionalId !== '_any_professional_placeholder_') {
      actualProfessionalId = data.preferredProfessionalId;
      const profDetails = useMockDatabase ? mockDB.professionals.find(p => p.id === actualProfessionalId) : await getProfessionalById(actualProfessionalId);
      if (profDetails && profDetails.locationId !== data.locationId) {
          isExternal = true;
          externalOriginLocId = profDetails.locationId;
      }
    } else {
      console.log(`[data.ts] addAppointment: No preferred professional. Attempting auto-assignment for ${data.locationId} at ${data.appointmentTime} on ${format(data.appointmentDate, 'yyyy-MM-dd')}`);
      
      let professionalsToConsider: Professional[];
      if (useMockDatabase) {
          professionalsToConsider = data.searchExternal 
              ? mockDB.professionals 
              : mockDB.professionals.filter(p => p.locationId === data.locationId);
      } else {
          professionalsToConsider = data.searchExternal
              ? (await getProfessionals()).map(p => p as Professional) // Cast since getProfessionals returns with ContractDisplayStatus
              : (await getProfessionals(data.locationId)).map(p => p as Professional);
      }
      console.log(`[data.ts] Professionals to consider for auto-assignment: ${professionalsToConsider.length}`);

      const existingAppointmentsForDayResponse = useMockDatabase 
          ? { appointments: mockDB.appointments.filter(a => dateFnsIsSameDay(parseISO(a.appointmentDateTime), data.appointmentDate)) }
          : await getAppointments({date: data.appointmentDate}); // Get all for the day, will filter by prof later
      const existingAppointmentsForDay = existingAppointmentsForDayResponse.appointments;


      for (const prof of professionalsToConsider) {
          if (data.searchExternal && prof.locationId === data.locationId) {
            console.log(`[data.ts] Skipping local prof ${prof.firstName} during external search.`);
            continue;
          }

          const availability = getProfessionalAvailabilityForDate(prof, data.appointmentDate);
          console.log(`[data.ts] Checking prof ${prof.firstName} ${prof.lastName}. Availability:`, availability);

          if (availability && availability.startTime && availability.endTime) {
              const profWorkStartTime = parse(`${format(data.appointmentDate, 'yyyy-MM-dd')} ${availability.startTime}`, 'yyyy-MM-dd HH:mm', new Date());
              const profWorkEndTime = parse(`${format(data.appointmentDate, 'yyyy-MM-dd')} ${availability.endTime}`, 'yyyy-MM-dd HH:mm', new Date());

              if (!isWithinInterval(appointmentDateTimeObject, { start: profWorkStartTime, end: dateFnsAddMinutes(profWorkEndTime, -appointmentDuration +1) })) {
                   console.log(`[data.ts] Prof ${prof.firstName} ${prof.lastName} not assigned: Appt outside work hours (${availability.startTime}-${availability.endTime}). Appt: ${data.appointmentTime}-${format(appointmentEndTime, 'HH:mm')}`);
                  continue;
              }

              const isOverlappingExisting = existingAppointmentsForDay.some(existingAppt =>
                  existingAppt.professionalId === prof.id &&
                  areIntervalsOverlapping(
                      { start: appointmentDateTimeObject, end: appointmentEndTime },
                      { start: parseISO(existingAppt.appointmentDateTime), end: dateFnsAddMinutes(parseISO(existingAppt.appointmentDateTime), existingAppt.durationMinutes) }
                  )
              );

              if (!isOverlappingExisting) {
                  actualProfessionalId = prof.id;
                  if (prof.locationId !== data.locationId) {
                      isExternal = true;
                      externalOriginLocId = prof.locationId;
                       console.log(`[data.ts] Prof ${prof.firstName} ${prof.lastName} (External from ${externalOriginLocId}) auto-assigned.`);
                  } else {
                      console.log(`[data.ts] Prof ${prof.firstName} ${prof.lastName} (Local) auto-assigned.`);
                  }
                  break; 
              } else {
                   console.log(`[data.ts] Prof ${prof.firstName} ${prof.lastName} not assigned: Overlaps with existing appointment.`);
              }
          } else {
               console.log(`[data.ts] Prof ${prof.firstName} ${prof.lastName} not assigned: Not available on ${format(data.appointmentDate, 'yyyy-MM-dd')} (Reason: ${availability?.reason || 'Unknown'})`);
          }
      }
      if (!actualProfessionalId) {
          console.warn(`[data.ts] addAppointment: No professional available for auto-assignment. Booking without professional.`);
      }
    }

    const newAppointmentData: Omit<Appointment, 'id' | 'patient' | 'service' | 'professional'> = {
      patientId: data.existingPatientId || (await addPatient({ firstName: data.patientFirstName, lastName: data.patientLastName, phone: data.patientPhone, age: data.patientAge, isDiabetic: data.isDiabetic })).id,
      locationId: data.locationId,
      professionalId: actualProfessionalId,
      serviceId: data.serviceId,
      appointmentDateTime,
      durationMinutes: appointmentDuration,
      status: APPOINTMENT_STATUS.BOOKED,
      bookingObservations: data.bookingObservations || undefined,
      createdAt: formatISO(new Date()),
      updatedAt: formatISO(new Date()),
      isExternalProfessional: isExternal,
      externalProfessionalOriginLocationId: externalOriginLocId,
    };

    if (useMockDatabase) {
      const newId = generateId();
      const fullAppointment = { ...newAppointmentData, id: newId } as Appointment;
      mockDB.appointments.push(fullAppointment);
      return { 
          ...fullAppointment,
          patient: mockDB.patients.find(p => p.id === fullAppointment.patientId),
          service: mockDB.services.find(s => s.id === fullAppointment.serviceId),
          professional: mockDB.professionals.find(p => p.id === fullAppointment.professionalId)
      };
    }
    if (!firestore) throw new Error("Firestore not initialized");

    const firestoreData: any = {
      ...newAppointmentData,
      appointmentDateTime: toFirestoreTimestamp(newAppointmentData.appointmentDateTime)!,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    Object.keys(firestoreData).forEach(key => firestoreData[key] === undefined && delete firestoreData[key]);

    const docRef = await addDoc(collection(firestore, 'citas'), firestoreData);
    return { ...newAppointmentData, id: docRef.id } as Appointment;
  } catch (error) {
    console.error("[data.ts] Error in addAppointment:", error);
    throw error;
  }
}

export async function updateAppointment(id: string, data: Partial<Appointment>): Promise<Appointment | undefined> {
  try {
    if (useMockDatabase) {
      const index = mockDB.appointments.findIndex(a => a.id === id);
      if (index === -1) return undefined;
      
      const appointmentToUpdate = {...mockDB.appointments[index], ...data, updatedAt: formatISO(new Date())};
      
      if (data.appointmentDate && data.appointmentTime) { 
          const datePart = data.appointmentDate as unknown as Date; // Assuming it comes as Date from form
          const timePart = data.appointmentTime;
          const [hours, minutes] = timePart.split(':').map(Number);
          const finalDateObject = setMinutes(setHours(datePart, hours), minutes);
          appointmentToUpdate.appointmentDateTime = formatISO(finalDateObject);
      } else if (data.appointmentDateTime && typeof data.appointmentDateTime === 'string') {
          appointmentToUpdate.appointmentDateTime = data.appointmentDateTime;
      }

      mockDB.appointments[index] = appointmentToUpdate;
      return { 
          ...appointmentToUpdate,
          patient: mockDB.patients.find(p => p.id === appointmentToUpdate.patientId),
          service: mockDB.services.find(s => s.id === appointmentToUpdate.serviceId),
          professional: mockDB.professionals.find(p => p.id === appointmentToUpdate.professionalId)
      };
    }
    if (!firestore) throw new Error("Firestore not initialized");
    const docRef = doc(firestore, 'citas', id);
    
    const firestoreUpdateData: any = { ...data, updatedAt: serverTimestamp() };
    
    if (data.appointmentDate && data.appointmentTime && typeof data.appointmentDate === 'object' && typeof data.appointmentTime === 'string') {
      const datePart = data.appointmentDate as Date;
      const timePart = data.appointmentTime;
      const [hours, minutes] = timePart.split(':').map(Number);
      const finalDateObject = setMinutes(setHours(datePart, hours), minutes);
      firestoreUpdateData.appointmentDateTime = toFirestoreTimestamp(finalDateObject);
      delete firestoreUpdateData.appointmentDate; 
      delete firestoreUpdateData.appointmentTime;
    } else if (data.appointmentDateTime && typeof data.appointmentDateTime === 'string') {
      firestoreUpdateData.appointmentDateTime = toFirestoreTimestamp(data.appointmentDateTime);
    }

    Object.keys(firestoreUpdateData).forEach(key => {
      if (firestoreUpdateData[key] === undefined) {
        delete firestoreUpdateData[key];
      }
      if (Array.isArray(firestoreUpdateData[key])) {
          firestoreUpdateData[key] = firestoreUpdateData[key].map((item: any) => {
              if(item && typeof item === 'object') {
                  const convertedItem: any = {...item};
                  return convertedItem;
              }
              return item;
          });
      }
    });

    await updateDoc(docRef, firestoreUpdateData);
    const updatedDoc = await getDoc(docRef);
    if (!updatedDoc.exists()) return undefined;
    return { id: updatedDoc.id, ...convertDocumentData(updatedDoc.data()) } as Appointment;
  } catch (error) {
    console.error("[data.ts] Error in updateAppointment:", error);
    throw error;
  }
}

// --- Periodic Reminders ---
export async function getPeriodicReminders(): Promise<PeriodicReminder[]> {
  try {
    if (useMockDatabase) return [...mockDB.periodicReminders].sort((a,b) => parseISO(a.dueDate).getTime() - parseISO(b.dueDate).getTime());
    if (!firestore) {
      console.warn("[data.ts] getPeriodicReminders: Firestore not available, returning mock data.");
      return [...initialMockPeriodicRemindersData].sort((a,b) => parseISO(a.dueDate).getTime() - parseISO(b.dueDate).getTime());
    }
    const snapshot = await getDocs(query(collection(firestore, 'recordatorios'), orderBy('dueDate')));
    if (snapshot.empty && initialMockPeriodicRemindersData.length > 0) {
        console.warn("[data.ts] Firestore 'recordatorios' collection is empty. Falling back to mock data if available.");
        return [...initialMockPeriodicRemindersData].sort((a,b) => parseISO(a.dueDate).getTime() - parseISO(b.dueDate).getTime());
    }
    return snapshot.docs.map(d => ({ id: d.id, ...convertDocumentData(d.data()) } as PeriodicReminder));
  } catch (e) {
    console.error("[data.ts] Error fetching periodic reminders, falling back to mock:", e);
    return [...initialMockPeriodicRemindersData].sort((a,b) => parseISO(a.dueDate).getTime() - parseISO(b.dueDate).getTime());
  }
}

export async function addPeriodicReminder(data: PeriodicReminderFormData): Promise<PeriodicReminder> {
  try {
    const newReminder: Omit<PeriodicReminder, 'id' | 'createdAt' | 'updatedAt'> = {
      title: data.title,
      description: data.description || undefined,
      dueDate: formatISO(data.dueDate, { representation: 'date' }),
      recurrence: data.recurrence,
      amount: data.amount ?? undefined,
      status: data.status,
    };
    if (useMockDatabase) {
      const newId = generateId();
      const fullReminder = { ...newReminder, id: newId, createdAt: formatISO(new Date()), updatedAt: formatISO(new Date()) };
      mockDB.periodicReminders.push(fullReminder);
      return fullReminder;
    }
    if (!firestore) throw new Error("Firestore not initialized");
    const firestoreData: any = {
      ...newReminder,
      dueDate: toFirestoreTimestamp(newReminder.dueDate)!,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    Object.keys(firestoreData).forEach(key => {
        if (firestoreData[key] === undefined) firestoreData[key] = null;
    });
    const docRef = await addDoc(collection(firestore, 'recordatorios'), firestoreData);
    return { ...newReminder, id: docRef.id, createdAt: formatISO(new Date()), updatedAt: formatISO(new Date()) };
  } catch (error) {
    console.error("[data.ts] Error in addPeriodicReminder:", error);
    throw error;
  }
}

export async function updatePeriodicReminder(id: string, data: Partial<PeriodicReminderFormData> & { id: string, dueDate: string }): Promise<PeriodicReminder | undefined> {
  try {
    const updateData: Partial<Omit<PeriodicReminder, 'id' | 'createdAt' | 'updatedAt'>> = {};
    if (data.title) updateData.title = data.title;
    if (data.hasOwnProperty('description')) updateData.description = data.description || undefined;
    if (data.dueDate) updateData.dueDate = formatISO(parseISO(data.dueDate), { representation: 'date' });
    if (data.recurrence) updateData.recurrence = data.recurrence;
    if (data.hasOwnProperty('amount')) updateData.amount = data.amount ?? undefined;
    if (data.status) updateData.status = data.status;
    
    if (useMockDatabase) {
      const index = mockDB.periodicReminders.findIndex(r => r.id === id);
      if (index === -1) return undefined;
      mockDB.periodicReminders[index] = { ...mockDB.periodicReminders[index], ...updateData, updatedAt: formatISO(new Date()) };
      return mockDB.periodicReminders[index];
    }
    if (!firestore) throw new Error("Firestore not initialized");
    const docRef = doc(firestore, 'recordatorios', id);
    const firestoreUpdate: any = {...updateData, updatedAt: serverTimestamp()};
    if (updateData.dueDate) firestoreUpdate.dueDate = toFirestoreTimestamp(updateData.dueDate);
    Object.keys(firestoreUpdate).forEach(key => {
        if (firestoreUpdate[key] === undefined) firestoreUpdate[key] = null;
    });

    await updateDoc(docRef, firestoreUpdate);
    const updatedDoc = await getDoc(docRef);
    if (!updatedDoc.exists()) return undefined;
    return { id: updatedDoc.id, ...convertDocumentData(updatedDoc.data()) } as PeriodicReminder;
  } catch (error) {
    console.error("[data.ts] Error in updatePeriodicReminder:", error);
    throw error;
  }
}

export async function deletePeriodicReminder(id: string): Promise<void> {
  try {
    if (useMockDatabase) {
      mockDB.periodicReminders = mockDB.periodicReminders.filter(r => r.id !== id);
      return;
    }
    if (!firestore) throw new Error("Firestore not initialized");
    await deleteDoc(doc(firestore, 'recordatorios', id));
  } catch (error) {
    console.error("[data.ts] Error in deletePeriodicReminder:", error);
    throw error;
  }
}

// --- Important Notes ---
export async function getImportantNotes(): Promise<ImportantNote[]> {
  try {
    if (useMockDatabase) return [...mockDB.importantNotes].sort((a,b) => parseISO(b.createdAt!).getTime() - parseISO(a.createdAt!).getTime());
    if (!firestore) {
        console.warn("[data.ts] getImportantNotes: Firestore not available, returning mock data.");
        return [...initialMockImportantNotesData].sort((a,b) => parseISO(b.createdAt!).getTime() - parseISO(a.createdAt!).getTime());
    }
    const snapshot = await getDocs(query(collection(firestore, 'notasImportantes'), orderBy('createdAt', 'desc')));
    if (snapshot.empty && initialMockImportantNotesData.length > 0) {
        console.warn("[data.ts] Firestore 'notasImportantes' collection is empty. Returning mock data if available.");
        return [...initialMockImportantNotesData].sort((a,b) => parseISO(b.createdAt!).getTime() - parseISO(a.createdAt!).getTime());
    }
    return snapshot.docs.map(d => ({ id: d.id, ...convertDocumentData(d.data()) } as ImportantNote));
  } catch (e) {
      console.error("[data.ts] Error fetching important notes, falling back to mock:", e);
      return [...initialMockImportantNotesData].sort((a,b) => parseISO(b.createdAt!).getTime() - parseISO(a.createdAt!).getTime());
  }
}

export async function addImportantNote(data: ImportantNoteFormData): Promise<ImportantNote> {
  try {
    const newNote: Omit<ImportantNote, 'id'|'createdAt'|'updatedAt'> = { title: data.title, content: data.content };
    if (useMockDatabase) {
        const newId = generateId();
        const fullNote = { ...newNote, id: newId, createdAt: formatISO(new Date()), updatedAt: formatISO(new Date()) };
        mockDB.importantNotes.push(fullNote);
        return fullNote;
    }
    if (!firestore) throw new Error("Firestore not initialized");
    const firestoreData = { ...newNote, createdAt: serverTimestamp(), updatedAt: serverTimestamp() };
    const docRef = await addDoc(collection(firestore, 'notasImportantes'), firestoreData);
    return { ...newNote, id: docRef.id, createdAt: formatISO(new Date()), updatedAt: formatISO(new Date()) };
  } catch (error) {
    console.error("[data.ts] Error in addImportantNote:", error);
    throw error;
  }
}

export async function updateImportantNote(id: string, data: Partial<ImportantNoteFormData>): Promise<ImportantNote | undefined> {
  try {
    if (useMockDatabase) {
        const index = mockDB.importantNotes.findIndex(n => n.id === id);
        if (index === -1) return undefined;
        mockDB.importantNotes[index] = { ...mockDB.importantNotes[index], ...data, updatedAt: formatISO(new Date()) };
        return mockDB.importantNotes[index];
    }
    if (!firestore) throw new Error("Firestore not initialized");
    const docRef = doc(firestore, 'notasImportantes', id);
    await updateDoc(docRef, { ...data, updatedAt: serverTimestamp() });
    const updatedDoc = await getDoc(docRef);
    if (!updatedDoc.exists()) return undefined;
    return { id: updatedDoc.id, ...convertDocumentData(updatedDoc.data()) } as ImportantNote;
  } catch (error) {
    console.error("[data.ts] Error in updateImportantNote:", error);
    throw error;
  }
}

export async function deleteImportantNote(id: string): Promise<void> {
  try {
    if (useMockDatabase) {
        mockDB.importantNotes = mockDB.importantNotes.filter(n => n.id !== id);
        return;
    }
    if (!firestore) throw new Error("Firestore not initialized");
    await deleteDoc(doc(firestore, 'notasImportantes', id));
  } catch (error) {
    console.error("[data.ts] Error in deleteImportantNote:", error);
    throw error;
  }
}

// --- Seed Firestore with Mock Data ---
export const seedFirestoreWithMockData = async () => {
  if (!firestore) {
    console.error("[data.ts] seedFirestoreWithMockData: Firestore is not initialized. Cannot seed data.");
    throw new Error("Firestore not initialized");
  }
  if (useMockDatabase) {
    console.warn("[data.ts] seedFirestoreWithMockData: Application is in useMockDatabase mode. Seeding to Firestore will not occur.");
    return;
  }

  console.log("[data.ts] Starting to seed Firestore with mock data...");
  const batch = writeBatch(firestore);

  try {
    initialMockUsersData.forEach(user => {
      const { id, ...userData } = user;
      const userToSeed = { ...userData, password: "admin" }; 
      const userRef = doc(firestore, 'usuarios', id);
      batch.set(userRef, userToSeed);
    });

    initialMockServicesData.forEach(service => {
      const { id, ...serviceData } = service;
      const serviceRef = doc(firestore, 'servicios', id);
      batch.set(serviceRef, serviceData);
    });
    
    LOCATIONS.forEach(location => {
        const sedeRef = doc(firestore, 'sedes', location.id);
        batch.set(sedeRef, { name: location.name });
    });

    initialMockProfessionalsData.forEach(prof => {
      const { id, ...profData } = prof;
      const firestoreProfData: any = { ...profData };
      if (profData.currentContract) {
        firestoreProfData.currentContract.startDate = toFirestoreTimestamp(profData.currentContract.startDate);
        firestoreProfData.currentContract.endDate = toFirestoreTimestamp(profData.currentContract.endDate);
      }
      if (profData.contractHistory) {
        firestoreProfData.contractHistory = profData.contractHistory.map(ch => ({
          ...ch,
          startDate: toFirestoreTimestamp(ch.startDate),
          endDate: toFirestoreTimestamp(ch.endDate),
        }));
      }
      if (profData.customScheduleOverrides) {
        firestoreProfData.customScheduleOverrides = profData.customScheduleOverrides.map(ov => ({
          ...ov,
          date: toFirestoreTimestamp(ov.date),
        }));
      }
      const profRef = doc(firestore, 'profesionales', id);
      batch.set(profRef, firestoreProfData);
    });

    initialMockPatientsData.forEach(patient => {
      const { id, ...patientData } = patient;
      const patientRef = doc(firestore, 'pacientes', id);
      batch.set(patientRef, patientData);
    });

    initialMockAppointmentsData.forEach(appt => {
      const { id, patient, professional, service, ...apptData } = appt;
      const firestoreApptData: any = { ...apptData };
      firestoreApptData.appointmentDateTime = toFirestoreTimestamp(apptData.appointmentDateTime);
      if (apptData.createdAt) firestoreApptData.createdAt = toFirestoreTimestamp(apptData.createdAt);
      if (apptData.updatedAt) firestoreApptData.updatedAt = toFirestoreTimestamp(apptData.updatedAt);
      
      const apptRef = doc(firestore, 'citas', id);
      batch.set(apptRef, firestoreApptData);
    });

    initialMockPeriodicRemindersData.forEach(reminder => {
        const { id, ...reminderData } = reminder;
        const firestoreReminderData: any = {...reminderData};
        firestoreReminderData.dueDate = toFirestoreTimestamp(reminderData.dueDate);
        if (reminderData.createdAt) firestoreReminderData.createdAt = toFirestoreTimestamp(reminderData.createdAt);
        if (reminderData.updatedAt) firestoreReminderData.updatedAt = toFirestoreTimestamp(reminderData.updatedAt);
        const reminderRef = doc(firestore, 'recordatorios', id);
        batch.set(reminderRef, firestoreReminderData);
    });

    initialMockImportantNotesData.forEach(note => {
        const { id, ...noteData } = note;
        const firestoreNoteData: any = {...noteData};
        if (noteData.createdAt) firestoreNoteData.createdAt = toFirestoreTimestamp(noteData.createdAt);
        if (noteData.updatedAt) firestoreNoteData.updatedAt = toFirestoreTimestamp(noteData.updatedAt);
        const noteRef = doc(firestore, 'notasImportantes', id);
        batch.set(noteRef, firestoreNoteData);
    });

    await batch.commit();
    console.log("[data.ts] Firestore successfully seeded with all mock data!");

  } catch (error) {
    console.error("[data.ts] Error seeding Firestore with mock data:", error);
    throw error;
  }
};
