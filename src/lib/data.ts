
// src/lib/data.ts
import type { User, Professional, Patient, Service, Appointment, AppointmentFormData, ProfessionalFormData, AppointmentStatus, ServiceFormData, Contract, PeriodicReminder, ImportantNote, PeriodicReminderFormData, ImportantNoteFormData } from '@/types';
import { LOCATIONS, USER_ROLES, SERVICES as SERVICES_CONSTANTS, APPOINTMENT_STATUS, LocationId, ServiceId as ConstantServiceId, APPOINTMENT_STATUS_DISPLAY, PAYMENT_METHODS, TIME_SLOTS, DAYS_OF_WEEK } from './constants';
import type { DayOfWeekId } from './constants';
import { formatISO, parseISO, addDays, setHours, setMinutes, startOfDay, endOfDay, isSameDay as dateFnsIsSameDay, startOfMonth, endOfMonth, subDays, isEqual, isBefore, isAfter, getDate, getYear, getMonth, setMonth, setYear, getHours, addMinutes as dateFnsAddMinutes, isWithinInterval, getDay, format, differenceInCalendarDays, areIntervalsOverlapping, parse } from 'date-fns';
import { es } from 'date-fns/locale';
import { firestore, useMockDatabase as globalUseMockDatabase } from './firebase-config'; 
import { collection, addDoc, getDocs, doc, getDoc, updateDoc, query, where, deleteDoc, writeBatch, serverTimestamp, Timestamp, runTransaction, setDoc, QueryConstraint, orderBy, limit, startAfter,getCountFromServer, CollectionReference, DocumentData, documentId } from 'firebase/firestore';

// Esta constante ahora se basa directamente en la importación de firebase-config
// para asegurar consistencia en toda la app sobre si usar mocks o Firebase real.
console.log(`[data.ts] globalUseMockDatabase (importado de firebase-config): ${globalUseMockDatabase}`);


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
  const currentSystemDate = new Date();
  const referenceDate = startOfDay(referenceDateParam || currentSystemDate);
  
  // console.log(`[getContractDisplayStatus] Referencia: ${formatISO(referenceDate)}, Contrato:`, contract ? {startDate: contract.startDate, endDate: contract.endDate} : "N/A");

  if (!contract || !contract.startDate || !contract.endDate) {
      // console.log("[getContractDisplayStatus] Sin contrato o fechas inválidas.");
      return 'Sin Contrato';
  }

  const { startDate: startDateStr, endDate: endDateStr } = contract;

  if (typeof startDateStr !== 'string' || typeof endDateStr !== 'string' || startDateStr.length === 0 || endDateStr.length === 0) {
      console.warn("[getContractDisplayStatus] Fechas de contrato inválidas (no son strings o están vacías):", contract);
      return 'Sin Contrato';
  }

  let startDate: Date;
  let endDate: Date;

  try {
      startDate = parseISO(startDateStr);
      endDate = parseISO(endDateStr);
  } catch (e) {
      console.error("[getContractDisplayStatus] Error parseando fechas de contrato:", e, contract);
      return 'Sin Contrato';
  }

  if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      console.warn("[getContractDisplayStatus] Fechas de contrato inválidas después del parseo:", { startDateStr, endDateStr, startDate, endDate });
      return 'Sin Contrato';
  }
  
  if (isBefore(referenceDate, startDate)) {
      // console.log(`[getContractDisplayStatus] Contrato aún no vigente. Inicio: ${formatISO(startDate)}`);
      return 'No Vigente Aún';
  }
  if (isAfter(referenceDate, endDate)) {
      // console.log(`[getContractDisplayStatus] Contrato vencido. Fin: ${formatISO(endDate)}`);
      return 'Vencido';
  }

  const daysUntilExpiry = differenceInCalendarDays(endDate, referenceDate);
  if (daysUntilExpiry <= 15 && daysUntilExpiry >= 0) { // Ensure it's not already past
      // console.log(`[getContractDisplayStatus] Contrato próximo a vencer en ${daysUntilExpiry} días.`);
      return 'Próximo a Vencer';
  }
  // console.log(`[getContractDisplayStatus] Contrato activo. Fin: ${formatISO(endDate)}, Días restantes: ${daysUntilExpiry}`);
  return 'Activo';
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
  { id: 'admin001', username: 'Admin', password: 'admin', role: USER_ROLES.ADMIN, name: 'Administrador General del Sistema', locationId: null as unknown as undefined},
  { id: 'contador001', username: 'Contador', password: 'admin', role: USER_ROLES.CONTADOR, name: 'Contador del Sistema', locationId: null as unknown as undefined },
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
    
    // Ensure first two professionals in each location have an active contract
    if (i < 2) { 
      const contractStartDate = subDays(todayMock, 60); // Start 60 days before todayMock
      const contractEndDate = addDays(todayMock, 90);   // End 90 days after todayMock
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
      } // else, no current contract (contractType === 3)
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
      biWeeklyEarnings: 0, // Initialize, will be calculated
      workSchedule: baseSchedule,
      customScheduleOverrides: customOverrides,
      currentContract: currentContract,
      contractHistory: contractHistory,
    };
  });
});

const initialMockPatientsData: Patient[] = Array.from({ length: 150 }, (_, i) => ({ // Increased patient count
  id: `pat${String(i + 1).padStart(3, '0')}`,
  firstName: `Paciente ${String.fromCharCode(65 + (i % 26))}${i > 25 ? String.fromCharCode(65 + Math.floor(i/26)-1) : '' }`,
  lastName: `Test${i + 1}`,
  phone: `9000000${String(i).padStart(2, '0')}`,
  age: i % 3 === 0 ? undefined : (20 + (i % 50)),
  isDiabetic: i % 7 === 0,
  preferredProfessionalId: i % 3 === 0 ? initialMockProfessionalsData[i % initialMockProfessionalsData.length]?.id : undefined,
  notes: i % 5 === 0 ? `Observación importante para paciente ${i + 1}. Tiene preferencia por horarios de mañana.` : undefined,
}));

const initialMockServicesData: Service[] = [...SERVICES_CONSTANTS.map(s => ({...s, price: Math.floor(Math.random() * 50) + 50 }))]; // Add random prices


const initialMockAppointmentsData: Appointment[] = [
  // Completed yesterday for different locations to test history
  {
    id: 'appt001', patientId: 'pat001', locationId: LOCATIONS[0].id, professionalId: initialMockProfessionalsData.find(p => p.locationId === LOCATIONS[0].id && getContractDisplayStatus(p.currentContract, yesterdayMock) === 'Activo')?.id || initialMockProfessionalsData[0]?.id, serviceId: initialMockServicesData[0].id, appointmentDateTime: formatISO(setHours(setMinutes(yesterdayMock, 0), 10)), durationMinutes: initialMockServicesData[0].defaultDuration, status: APPOINTMENT_STATUS.COMPLETED, amountPaid: initialMockServicesData[0].price, paymentMethod: PAYMENT_METHODS[0], staffNotes: "Tratamiento exitoso, paciente refiere mejoría.", attachedPhotos: ["https://placehold.co/200x200.png?text=Appt001" as string], addedServices: [{ serviceId: initialMockServicesData[2].id, price: initialMockServicesData[2].price }], createdAt: formatISO(subDays(yesterdayMock,1)), updatedAt: formatISO(yesterdayMock),
  },
  {
    id: 'appt_hist_001', patientId: 'pat010', locationId: LOCATIONS[1].id, professionalId: initialMockProfessionalsData.find(p => p.locationId === LOCATIONS[1].id && getContractDisplayStatus(p.currentContract, subDays(todayMock, 5)) === 'Activo')?.id || initialMockProfessionalsData.find(p=>p.locationId === LOCATIONS[1].id)?.id, serviceId: initialMockServicesData[1].id, appointmentDateTime: formatISO(setHours(setMinutes(subDays(todayMock, 5), 0), 11)), durationMinutes: initialMockServicesData[1].defaultDuration, status: APPOINTMENT_STATUS.COMPLETED, amountPaid: initialMockServicesData[1].price, paymentMethod: PAYMENT_METHODS[1], createdAt: formatISO(subDays(todayMock,6)), updatedAt: formatISO(subDays(todayMock,5))
  },
  // Booked for today
  {
    id: 'appt002', patientId: 'pat002', locationId: LOCATIONS[1].id, professionalId: initialMockProfessionalsData.find(p => p.locationId === LOCATIONS[1].id && getContractDisplayStatus(p.currentContract, todayMock) === 'Activo')?.id || initialMockProfessionalsData.find(p=>p.locationId === LOCATIONS[1].id)?.id, serviceId: initialMockServicesData[1].id, appointmentDateTime: formatISO(setHours(setMinutes(startOfDay(todayMock), 30), 9)), durationMinutes: initialMockServicesData[1].defaultDuration, status: APPOINTMENT_STATUS.BOOKED, bookingObservations: "Paciente refiere dolor agudo.", createdAt: formatISO(subDays(todayMock,1)), updatedAt: formatISO(subDays(todayMock,1)), attachedPhotos: [], addedServices: [],
  },
  // Confirmed for today (later)
  {
    id: 'appt003', patientId: 'pat003', locationId: LOCATIONS[0].id, professionalId: initialMockProfessionalsData.find(p => p.locationId === LOCATIONS[0].id && getContractDisplayStatus(p.currentContract, todayMock) === 'Activo')?.id || initialMockProfessionalsData.find(p=>p.locationId === LOCATIONS[0].id)?.id, serviceId: initialMockServicesData[2].id, appointmentDateTime: formatISO(setHours(setMinutes(startOfDay(todayMock), 0), 14)), durationMinutes: initialMockServicesData[2].defaultDuration, status: APPOINTMENT_STATUS.CONFIRMED, actualArrivalTime: "13:55", createdAt: formatISO(subDays(todayMock,2)), updatedAt: formatISO(todayMock),
  },
  // Cancelled for today
  {
    id: 'appt004', patientId: 'pat004', locationId: LOCATIONS[2].id, professionalId: initialMockProfessionalsData.find(p => p.locationId === LOCATIONS[2].id && getContractDisplayStatus(p.currentContract, todayMock) === 'Activo')?.id || initialMockProfessionalsData.find(p=>p.locationId === LOCATIONS[2].id)?.id, serviceId: initialMockServicesData[3].id, appointmentDateTime: formatISO(setHours(setMinutes(startOfDay(todayMock), 0), 11)), durationMinutes: initialMockServicesData[3].defaultDuration, status: APPOINTMENT_STATUS.CANCELLED_CLIENT, createdAt: formatISO(subDays(todayMock,1)), updatedAt: formatISO(todayMock),
  },
  // More completed appointments for registry testing (April 2025)
  {
    id: 'appt_registry_001', patientId: 'pat005', locationId: 'higuereta', professionalId: 'prof-higuereta-1', serviceId: 'quiropodia', appointmentDateTime: formatISO(setHours(setMinutes(new Date(2025, 3, 18), 0), 10)), durationMinutes: 60, status: APPOINTMENT_STATUS.COMPLETED, amountPaid: 80, paymentMethod: 'Efectivo', staffNotes: "Servicio completado, para prueba de registro.", createdAt: formatISO(new Date(2025, 3, 18)), updatedAt: formatISO(new Date(2025, 3, 18)),
  },
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
  // console.log("[data.ts] initializeGlobalMockStore called. Current globalUseMockDatabase:", globalUseMockDatabase);
  if (globalUseMockDatabase) { // Solo inicializa si globalUseMockDatabase es true
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
      console.log("[data.ts] MockDB initialized with new data because it was empty and globalUseMockDatabase is true.");
    } else {
      console.log("[data.ts] MockDB already has data, or globalUseMockDatabase is false. Skipping re-initialization with mock data.");
    }
  } else {
    console.log("[data.ts] initializeGlobalMockStore: globalUseMockDatabase is false, MockDB will not be populated with initial mock data.");
    // Clear mockDB if not using it, to ensure no stale mock data is accidentally used if the flag changes.
    mockDB = { users: [], professionals: [], patients: [], services: [], appointments: [], periodicReminders: [], importantNotes: [] };
  }
};

// Call initializeGlobalMockStore when this module is loaded if in mock mode.
// This ensures mockDB is populated if globalUseMockDatabase is true from the start.
if (globalUseMockDatabase) {
  initializeGlobalMockStore();
}


// --- Auth ---
export const getUserByUsername = async (username: string): Promise<User | undefined> => {
  try {
    if (globalUseMockDatabase) {
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
    console.log(`[data.ts] getUserByUsername (Firestore) buscando por username: ${username}`);
    const usersCol = collection(firestore, 'usuarios');
    const q = query(usersCol, where('username', '==', username));
    const snapshot = await getDocs(q);

    if (snapshot.empty) {
      console.warn(`[data.ts] getUserByUsername (Firestore): No se encontró ningún usuario con username: ${username}`);
      return undefined;
    }
    const userDoc = snapshot.docs[0];
    const userData = { id: userDoc.id, ...convertDocumentData(userDoc.data()) } as User;
    console.log(`[data.ts] getUserByUsername (Firestore): Usuario encontrado:`, userData);
    return userData;
  } catch (error) {
    console.error(`[data.ts] Error en getUserByUsername (Firestore) para "${username}":`, error);
    throw error; // Re-throw para que el AuthProvider pueda manejarlo
  }
};


// --- Professionals ---
export const getProfessionals = async (locationId?: LocationId): Promise<(Professional & { contractDisplayStatus: ContractDisplayStatus })[]> => {
  let professionalsToProcess: Professional[];
  const currentSystemDate = new Date(); 

  try {
    if (globalUseMockDatabase) {
      // console.log("[data.ts] getProfessionals (mock) for locationId:", locationId);
      professionalsToProcess = locationId ? mockDB.professionals.filter(p => p.locationId === locationId) : [...mockDB.professionals];
    } else {
      if (!firestore) {
        console.warn("[data.ts] getProfessionals: Firestore not available, falling back to mock data for this call.");
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

        if (professionalsToProcess.length === 0 && !locationId) { // If asking for ALL and get none, maybe seed hasn't run
            console.warn(`[data.ts] Firestore 'profesionales' query returned no results for locationId '${locationId || 'all'}'.`);
        }
      }
    }
    
    return professionalsToProcess.map(prof => ({
      ...prof,
      contractDisplayStatus: getContractDisplayStatus(prof.currentContract, currentSystemDate)
    })).sort((a,b) => `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`));

  } catch (error) {
    console.error("[data.ts] Error in getProfessionals, falling back to basic mock data to prevent crash:", error);
    professionalsToProcess = locationId ? initialMockProfessionalsData.filter(p => p.locationId === locationId) : [...initialMockProfessionalsData];
    return professionalsToProcess.map(prof => ({
      ...prof,
      contractDisplayStatus: getContractDisplayStatus(prof.currentContract, currentSystemDate)
    })).sort((a,b) => `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`));
  }
};


export const getProfessionalById = async (id: string): Promise<Professional | undefined> => {
  try {
    if (globalUseMockDatabase) {
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
    
    if (globalUseMockDatabase) {
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
    firestoreData.biWeeklyEarnings = firestoreData.biWeeklyEarnings ?? null; // Ensure null not undefined
    firestoreData.phone = firestoreData.phone ?? null;
    firestoreData.birthDay = firestoreData.birthDay ?? null;
    firestoreData.birthMonth = firestoreData.birthMonth ?? null;

    if (firestoreData.currentContract) {
      firestoreData.currentContract.startDate = toFirestoreTimestamp(firestoreData.currentContract.startDate);
      firestoreData.currentContract.endDate = toFirestoreTimestamp(firestoreData.currentContract.endDate);
      firestoreData.currentContract.notes = firestoreData.currentContract.notes ?? null;
      firestoreData.currentContract.empresa = firestoreData.currentContract.empresa ?? null;
    } else {
      firestoreData.currentContract = null;
    }
    if (firestoreData.customScheduleOverrides) {
      firestoreData.customScheduleOverrides = firestoreData.customScheduleOverrides.map((ov: any) => ({
        ...ov,
        date: toFirestoreTimestamp(ov.date),
        startTime: ov.startTime ?? null,
        endTime: ov.endTime ?? null,
        notes: ov.notes ?? null,
      }));
    } else {
      firestoreData.customScheduleOverrides = [];
    }
     firestoreData.contractHistory = firestoreData.contractHistory ? firestoreData.contractHistory.map((ch:any) => ({
      ...ch,
      startDate: toFirestoreTimestamp(ch.startDate),
      endDate: toFirestoreTimestamp(ch.endDate),
      notes: ch.notes ?? null,
      empresa: ch.empresa ?? null,
    })) : [];


    const docRef = await addDoc(collection(firestore, 'profesionales'), firestoreData);
    return { ...newProfessionalData, id: docRef.id } as Professional;
  } catch (error) {
    console.error("[data.ts] Error adding professional:", error);
    throw error;
  }
};

export const updateProfessional = async (id: string, data: Partial<ProfessionalFormData>): Promise<Professional | undefined> => {
  try {
    const professionalToUpdate: Partial<Omit<Professional, 'id'|'biWeeklyEarnings'>> = {
      ...data,
      phone: data.phone === undefined ? undefined : (data.phone || null), // Handle empty string as null
      birthDay: data.birthDay === undefined ? undefined : (data.birthDay || null),
      birthMonth: data.birthMonth === undefined ? undefined : (data.birthMonth || null),
    };
    delete (professionalToUpdate as any).id; // Do not update ID

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
                // id: data.id || generateId(), // This was an error, currentContract doesn't have the professional's ID
                id: generateId(), // Generate new ID for the new contract instance
                startDate: formatISO(data.currentContract_startDate, { representation: 'date' }),
                endDate: formatISO(data.currentContract_endDate, { representation: 'date' }),
                notes: data.currentContract_notes || null,
                empresa: data.currentContract_empresa || null,
            };
        } else {
            newCurrentContractData = null; // Explicitly set to null if dates are missing
        }
    }


    if (globalUseMockDatabase) {
      const index = mockDB.professionals.findIndex(p => p.id === id);
      if (index === -1) return undefined;
      
      const existingProfessional = mockDB.professionals[index];
      const updatedHistory = [...(existingProfessional.contractHistory || [])];

      if (newCurrentContractData !== undefined) { // If currentContract fields were part of the form submission
        if (existingProfessional.currentContract && newCurrentContractData && existingProfessional.currentContract.id !== newCurrentContractData.id) {
           // Only archive if the contract instance is actually different
           if (!updatedHistory.find(ch => ch.id === existingProfessional.currentContract!.id)) {
            updatedHistory.push(existingProfessional.currentContract);
          }
        } else if (existingProfessional.currentContract && newCurrentContractData === null) {
           // If new contract is null (cleared), archive the old one
           if (!updatedHistory.find(ch => ch.id === existingProfessional.currentContract!.id)) {
            updatedHistory.push(existingProfessional.currentContract);
           }
        }
        professionalToUpdate.currentContract = newCurrentContractData;
        professionalToUpdate.contractHistory = updatedHistory;
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
    firestoreUpdateData.phone = firestoreUpdateData.phone ?? null;
    firestoreUpdateData.birthDay = firestoreUpdateData.birthDay ?? null;
    firestoreUpdateData.birthMonth = firestoreUpdateData.birthMonth ?? null;


    if (firestoreUpdateData.customScheduleOverrides) {
      firestoreUpdateData.customScheduleOverrides = firestoreUpdateData.customScheduleOverrides.map((ov: any) => ({
        ...ov,
        id: ov.id || generateId(), 
        date: toFirestoreTimestamp(ov.date),
        startTime: ov.startTime ?? null,
        endTime: ov.endTime ?? null,
        notes: ov.notes ?? null,
      }));
    } else if (data.hasOwnProperty('customScheduleOverrides')) { // if explicitly set to empty array or null
        firestoreUpdateData.customScheduleOverrides = [];
    }
    
    if (newCurrentContractData !== undefined) { // If currentContract fields were part of the form submission
        firestoreUpdateData.currentContract = newCurrentContractData ? {
            ...newCurrentContractData,
            id: newCurrentContractData.id || generateId(), // Ensure new contract has an ID
            startDate: toFirestoreTimestamp(newCurrentContractData.startDate)!,
            endDate: toFirestoreTimestamp(newCurrentContractData.endDate)!,
            notes: newCurrentContractData.notes ?? null,
            empresa: newCurrentContractData.empresa ?? null,
        } : null;

        const newContractHistory = [...(existingFirestoreProfessional.contractHistory || [])];
        if (existingFirestoreProfessional.currentContract && newCurrentContractData && existingFirestoreProfessional.currentContract.id !== newCurrentContractData.id) {
           if (!newContractHistory.find(ch => ch.id === existingFirestoreProfessional.currentContract!.id)) {
             newContractHistory.push({ // Push the actual ISO string dates
                ...existingFirestoreProfessional.currentContract,
                startDate: existingFirestoreProfessional.currentContract.startDate, 
                endDate: existingFirestoreProfessional.currentContract.endDate,
             });
           }
        } else if (existingFirestoreProfessional.currentContract && newCurrentContractData === null) { // Contract is being removed
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
            startDate: toFirestoreTimestamp(ch.startDate)!, // Convert to Timestamp for Firestore
            endDate: toFirestoreTimestamp(ch.endDate)!,
            notes: ch.notes ?? null,
            empresa: ch.empresa ?? null,
        }));
    }


    if (firestoreUpdateData.workSchedule) {
        const finalWorkSchedule: any = {};
        for (const dayId of DAYS_OF_WEEK.map(d => d.id)) {
            const existingDaySchedule = existingFirestoreProfessional.workSchedule?.[dayId as DayOfWeekId];
            const newDaySchedule = firestoreUpdateData.workSchedule[dayId as DayOfWeekId];
            finalWorkSchedule[dayId] = {
                isWorking: newDaySchedule?.isWorking ?? existingDaySchedule?.isWorking ?? false,
                startTime: newDaySchedule?.startTime ?? existingDaySchedule?.startTime ?? "00:00",
                endTime: newDaySchedule?.endTime ?? existingDaySchedule?.endTime ?? "00:00",
            };
        }
        firestoreUpdateData.workSchedule = finalWorkSchedule;
    }


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
    // console.log(`[Availability] Prof ${professional.firstName} ${professional.lastName} (ID: ${professional.id}) - Contract Status for ${format(targetDate, 'yyyy-MM-dd')}: ${contractStatus}`);

    if (contractStatus !== 'Activo') {
      return { startTime: '', endTime: '', reason: `No laborable (Contrato: ${contractStatus})` };
    }

    const dateToCheck = startOfDay(targetDate);
    const targetDateString = formatISO(dateToCheck, { representation: 'date' });
    // console.log(`[Availability] Prof ${professional.firstName} (ID: ${professional.id}) - Checking for date: ${targetDateString}`);


    if (professional.customScheduleOverrides) {
      const override = professional.customScheduleOverrides.find(
        ov => ov.date === targetDateString
      );
      if (override) {
        // console.log(`[Availability] Prof ${professional.firstName} (ID: ${professional.id}) - Found override:`, override);
        if (override.isWorking && override.startTime && override.endTime) {
          return { startTime: override.startTime, endTime: override.endTime, notes: override.notes || undefined, reason: `Horario especial (${override.notes || 'Anulación'})` };
        }
        return { startTime: '', endTime: '', reason: `Descansando (Anulación${override.notes ? `: ${override.notes}` : ''})` };
      }
    }

    if (professional.workSchedule) {
      const dayOfWeekIndex = getDay(dateToCheck); 
      const dayKey = DAYS_OF_WEEK.find(d => d.id === (['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as DayOfWeekId[])[dayOfWeekIndex])?.id;
      // console.log(`[Availability] Prof ${professional.firstName} (ID: ${professional.id}) - DayKey for ${targetDateString}: ${dayKey}`);


      if (dayKey) {
          const dailySchedule = professional.workSchedule[dayKey];
          // console.log(`[Availability] Prof ${professional.firstName} (ID: ${professional.id}) - Base schedule for ${dayKey}:`, dailySchedule);
          if (dailySchedule) {
            if (dailySchedule.isWorking === false) { // Explicitly not working
              return { startTime: '', endTime: '', reason: `Descansando (Horario base: ${DAYS_OF_WEEK.find(d=>d.id === dayKey)?.name} libre)` };
            }
            // isWorking might be true or undefined (implicit true if times are set)
            if ((dailySchedule.isWorking === true || dailySchedule.isWorking === undefined) && dailySchedule.startTime && dailySchedule.endTime) {
                return { startTime: dailySchedule.startTime, endTime: dailySchedule.endTime, reason: "Horario base" };
            }
          }
      }
    }
    // console.log(`[Availability] Prof ${professional.firstName} (ID: ${professional.id}) - No specific schedule found, defaulting to not available.`);
    return { startTime: '', endTime: '', reason: "Descansando (Sin horario definido)" };
  } catch (error) {
    console.error("[data.ts] Error in getProfessionalAvailabilityForDate:", error, "Professional:", professional, "TargetDate:", targetDate);
    return { startTime: '', endTime: '', reason: "Error al determinar disponibilidad" };
  }
}

// --- Patients ---
export const getPatients = async (options?: { page?: number; limit?: number; searchTerm?: string; filterToday?: boolean; adminSelectedLocation?: LocationId | 'all' | null; user?: User | null; lastVisiblePatientId?: string | null }): Promise<{patients: Patient[], totalCount: number, lastVisiblePatientId: string | null}> => {
  const { page = 1, limit: pageSize = 10, searchTerm = '', filterToday = false, adminSelectedLocation, user, lastVisiblePatientId: startAfterId } = options || {};

  try {
    if (globalUseMockDatabase) {
      let filteredPatients = [...mockDB.patients];
      if (searchTerm) {
        const lowerSearchTerm = searchTerm.toLowerCase();
        filteredPatients = filteredPatients.filter(p =>
          `${p.firstName} ${p.lastName}`.toLowerCase().includes(lowerSearchTerm) ||
          (p.phone && p.phone.includes(searchTerm))
        );
      }
      // filterToday logic for mockDB would require fetching mock appointments for today.
      // For simplicity, this is omitted for mockDB in this specific pagination.
      
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
      console.warn("[data.ts] getPatients: Firestore not available. Returning empty results or mock based on config.");
      // Fallback to mock if Firestore is completely unavailable.
      return { patients: initialMockPatientsData.slice(0, pageSize), totalCount: initialMockPatientsData.length, lastVisiblePatientId: null };
    }

    const patientsCol = collection(firestore, 'pacientes') as CollectionReference<DocumentData>;
    let queryConstraints: QueryConstraint[] = [];
    
    // Firestore does not support case-insensitive search or 'contains' on multiple fields directly for non-exact matches like this.
    // For robust search, a dedicated search service (e.g., Algolia, Typesense) is recommended.
    // Simple prefix search on firstName (if searchTerm is provided)
    if (searchTerm) {
       const nameParts = searchTerm.split(' ');
       if (nameParts.length > 0 && nameParts[0]) {
         queryConstraints.push(where('firstName', '>=', nameParts[0].charAt(0).toUpperCase() + nameParts[0].slice(1).toLowerCase()));
         queryConstraints.push(where('firstName', '<=', nameParts[0].charAt(0).toUpperCase() + nameParts[0].slice(1).toLowerCase() + '\uf8ff'));
       }
    }

    queryConstraints.push(orderBy('firstName')); // Primary sort
    if (searchTerm && searchTerm.split(' ').length > 1) { // If more than one word, assume lastName might be involved
        queryConstraints.push(orderBy('lastName'));
    } else {
        queryConstraints.push(orderBy('lastName')); // Default secondary sort
    }


    // Count total matching documents (without pagination for searchTerm, or all if no searchTerm)
    // For a more accurate totalCount with complex client-side filtering after fetch, this server-side count might not be perfect.
    let countQueryConstraints = [...queryConstraints.filter(c => (c as any)._op !== 'orderBy' && (c as any)._field?.segments.join('.') !== 'firstName' && (c as any)._field?.segments.join('.') !== 'lastName')]; // Remove orderBy for count
    if (searchTerm) {
       // If searchTerm is present, the count might be inaccurate without client-side post-filtering for full name or phone.
       // For now, we'll count based on the prefix search on firstName for simplicity if searchTerm is present.
       // This is a limitation of Firestore's querying for "contains" like behavior.
       if (countQueryConstraints.length === 0 && searchTerm) { // only if no other where clauses
          const nameParts = searchTerm.split(' ');
          if (nameParts.length > 0 && nameParts[0]) {
            countQueryConstraints.push(where('firstName', '>=', nameParts[0].charAt(0).toUpperCase() + nameParts[0].slice(1).toLowerCase()));
            countQueryConstraints.push(where('firstName', '<=', nameParts[0].charAt(0).toUpperCase() + nameParts[0].slice(1).toLowerCase() + '\uf8ff'));
          }
       }
    }

    const countQuery = query(patientsCol, ...countQueryConstraints);
    const countSnapshot = await getCountFromServer(countQuery);
    let totalCount = countSnapshot.data().count;
    
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
    
    let patients = snapshot.docs.map(docSnap => ({ id: docSnap.id, ...convertDocumentData(docSnap.data()) } as Patient));
    const newLastVisibleId = snapshot.docs.length > 0 ? snapshot.docs[snapshot.docs.length - 1].id : null;

    // Client-side filtering if searchTerm was more complex (e.g., full name or phone)
    // This is because Firestore doesn't support 'contains' or case-insensitive on multiple fields easily
    if (searchTerm) {
        const lowerSearchTerm = searchTerm.toLowerCase();
        patients = patients.filter(p =>
            (`${p.firstName} ${p.lastName}`.toLowerCase().includes(lowerSearchTerm) ||
            (p.phone && p.phone.includes(searchTerm)))
        );
        // If client-side filtering changes the count, update totalCount for this page's context
        // This is not ideal as totalCount from server might differ from filtered list length.
        // totalCount = patients.length; // This would be only for current page, not overall.
    }

    return { patients, totalCount, lastVisiblePatientId: newLastVisibleId };

  } catch (error) {
    console.error("[data.ts] Error fetching patients from Firestore:", error);
    // Fallback to mock if there's a Firestore error
    return { patients: initialMockPatientsData.slice(0, pageSize), totalCount: initialMockPatientsData.length, lastVisiblePatientId: null };
  }
};

export async function findPatient(firstName: string, lastName: string): Promise<Patient | undefined> {
  try {
    if (globalUseMockDatabase) {
      return mockDB.patients.find(p => p.firstName.toLowerCase() === firstName.toLowerCase() && p.lastName.toLowerCase() === lastName.toLowerCase());
    }
    if (!firestore) {
      console.warn("[data.ts] findPatient: Firestore not available. Returning undefined.");
      return undefined;
    }
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
    const newPatientData: Omit<Patient, 'id'> = {
      firstName: data.firstName,
      lastName: data.lastName,
      phone: data.phone || null,
      age: data.age === undefined ? null : (data.age || null),
      isDiabetic: data.isDiabetic || false,
      notes: data.notes || null,
      preferredProfessionalId: data.preferredProfessionalId || undefined,
    };

    if (globalUseMockDatabase) {
      const newId = generateId();
      const newPatient = { ...newPatientData, id: newId };
      mockDB.patients.push(newPatient);
      return { ...newPatient };
    }
    if (!firestore) {
      console.error("[data.ts] addPatient: Firestore not initialized.");
      throw new Error("Firestore not initialized. Patient not added.");
    }

    const firestoreData: any = {...newPatientData};
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
    if (data.hasOwnProperty('preferredProfessionalId')) patientUpdateData.preferredProfessionalId = data.preferredProfessionalId || undefined;


    if (globalUseMockDatabase) {
      const index = mockDB.patients.findIndex(p => p.id === id);
      if (index === -1) return undefined;
      mockDB.patients[index] = { ...mockDB.patients[index], ...patientUpdateData };
      return { ...mockDB.patients[index] };
    }
    if (!firestore) {
      console.error("[data.ts] updatePatient: Firestore not initialized.");
      throw new Error("Firestore not initialized. Patient not updated.");
    }
    const docRef = doc(firestore, 'pacientes', id);
    
    const firestoreUpdate: any = {...patientUpdateData};
    // Ensure undefined fields are converted to null or handled as per Firestore requirements
    Object.keys(firestoreUpdate).forEach(key => {
        if (firestoreUpdate[key] === undefined) {
            // If a field is explicitly passed as undefined in `data`, it means we might want to remove it.
            // However, updateDoc with undefined might not remove it. For explicit removal, use deleteField().
            // For now, we'll set to null if it's a known optional field, or delete if it was truly meant to be removed.
            // This part needs careful handling based on desired behavior for undefined.
            // For simplicity, let's convert to null if it was optional.
            if (['phone', 'age', 'notes', 'preferredProfessionalId'].includes(key)) {
                 firestoreUpdate[key] = null;
            } else {
                delete firestoreUpdate[key]; // Or handle as error if undefined is not expected for other fields
            }
        }
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
    if (globalUseMockDatabase) {
      return mockDB.patients.find(p => p.id === id);
    }
    if (!firestore) {
      console.warn("[data.ts] getPatientById: Firestore not available. Returning undefined.");
      return undefined;
    }
    const docRef = doc(firestore, 'pacientes', id);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      return { id: docSnap.id, ...convertDocumentData(docSnap.data()) } as Patient;
    }
    return undefined;
  } catch (error) {
    console.error("[data.ts] Error in getPatientById:", error);
    throw error; // Or return undefined based on desired error handling
  }
}

// --- Services ---
export async function getServices(): Promise<Service[]> {
  try {
    if (globalUseMockDatabase) {
      return [...mockDB.services];
    }
    if (!firestore) {
      console.warn("[data.ts] getServices: Firestore not available, falling back to mock.");
      return [...initialMockServicesData];
    }
    const snapshot = await getDocs(query(collection(firestore, 'servicios'), orderBy('name')));
    if (snapshot.empty) {
        console.warn("[data.ts] Firestore 'servicios' collection is empty. Falling back to mock if available.");
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
    if (globalUseMockDatabase) {
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
    if (!firestore) {
      console.error("[data.ts] addService: Firestore is not initialized.");
      throw new Error("Firestore not initialized. Service not added.");
    }

    const firestoreData: any = {...newServiceData};
    Object.keys(firestoreData).forEach(key => {
        if ((firestoreData as any)[key] === undefined) (firestoreData as any)[key] = null;
    });

    if (data.id) { // if ID is provided, it's an update/set rather than add
      const docRef = doc(firestore, 'servicios', data.id);
      await setDoc(docRef, firestoreData); // Use setDoc for upsert behavior if ID is known
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

    if (globalUseMockDatabase) {
      const index = mockDB.services.findIndex(s => s.id === id);
      if (index === -1) return undefined;
      mockDB.services[index] = { ...mockDB.services[index], ...serviceUpdateData };
      return { ...mockDB.services[index] };
    }
    if (!firestore) {
      console.error("[data.ts] updateService: Firestore not initialized.");
      throw new Error("Firestore not initialized. Service not updated.");
    }
    const docRef = doc(firestore, 'servicios', id);
    
    const firestoreUpdate: any = {...serviceUpdateData};
    Object.keys(firestoreUpdate).forEach(key => {
        if (firestoreUpdate[key] === undefined) firestoreUpdate[key] = null; // Or handle deletion
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
    if (globalUseMockDatabase) {
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
      console.warn("[data.ts] getAppointments: Firestore not available. Returning empty array.");
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
        // Firestore 'in' queries are limited to 10 items, and only one 'in', 'array-contains-any', or '!=' can be used in a query.
        // If more than 10 statuses or multiple 'in' are needed, this will require multiple queries or different data modeling.
        if (statuses.length <= 30) { // Firestore limit for IN queries on a single field
             qConstraints.push(where('status', 'in', statuses));
        } else {
            console.warn("[data.ts] getAppointments: Too many statuses for 'in' query. Firestore limits to 30. Fetching all and filtering client-side (less efficient).");
            // Fetch all and filter client-side, or implement multiple queries if this becomes a performance issue.
        }
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
      // console.warn("[data.ts] Firestore 'citas' query returned no results with current filters. Returning empty array.");
      return { appointments: [] };
    }
    
    let appointmentsData = snapshot.docs.map(docSnap => ({ id: docSnap.id, ...convertDocumentData(docSnap.data()) } as Appointment));

    // Client-side filtering if statuses.length > 10 (as Firestore 'in' was skipped)
    if (statuses && statuses.length > 30 && qConstraints.every(c => (c as any)._field?.segments.join('.') !== 'status' || (c as any)._op !== 'in')) {
        appointmentsData = appointmentsData.filter(a => statuses.includes(a.status));
    }


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
    return { appointments: [] }; // Fallback on error
  }
}

export async function getAppointmentById(id: string): Promise<Appointment | undefined> {
  try {
    if (globalUseMockDatabase) {
      const appt = mockDB.appointments.find(a => a.id === id);
      if (!appt) return undefined;
      return {
        ...appt,
        patient: mockDB.patients.find(p => p.id === appt.patientId),
        service: mockDB.services.find(s => s.id === appt.serviceId),
        professional: mockDB.professionals.find(p => p.id === appt.professionalId),
      };
    }
    if (!firestore) {
      console.warn("[data.ts] getAppointmentById: Firestore not available. Returning undefined.");
      return undefined;
    }
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
    if (globalUseMockDatabase) {
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
    let service: Service | undefined;
    if (globalUseMockDatabase) {
        service = mockDB.services.find(s => s.id === data.serviceId);
    } else if (firestore) {
        const serviceDoc = await getDoc(doc(firestore, 'servicios', data.serviceId));
        if (serviceDoc.exists()) {
            service = {id: serviceDoc.id, ...convertDocumentData(serviceDoc.data())} as Service;
        }
    }
    if (!service) throw new Error(`Servicio con ID ${data.serviceId} no encontrado.`);

    const appointmentDateTimeObject = parse(`${format(data.appointmentDate, 'yyyy-MM-dd')} ${data.appointmentTime}`, 'yyyy-MM-dd HH:mm', new Date());
    const appointmentDateTime = formatISO(appointmentDateTimeObject);
    const appointmentDuration = service.defaultDuration || 60;
    const appointmentEndTime = dateFnsAddMinutes(parseISO(appointmentDateTime), appointmentDuration);

    let actualProfessionalId: string | undefined | null = undefined;
    let isExternal = data.isExternalProfessional || false;
    let externalOriginLocId = data.externalProfessionalOriginLocationId || null;

    if (data.preferredProfessionalId && data.preferredProfessionalId !== '_any_professional_placeholder_') {
      actualProfessionalId = data.preferredProfessionalId;
      // Check if this preferred professional is external
      const profDetails = globalUseMockDatabase 
        ? mockDB.professionals.find(p => p.id === actualProfessionalId)
        : await getProfessionalById(actualProfessionalId); // Assumes getProfessionalById fetches from Firestore if not mock
      
      if (profDetails && profDetails.locationId !== data.locationId) {
          isExternal = true;
          externalOriginLocId = profDetails.locationId;
          console.log(`[data.ts] addAppointment: Profesional preferido ${profDetails.firstName} es externo. Origen: ${externalOriginLocId}`);
      } else if (profDetails) {
          console.log(`[data.ts] addAppointment: Profesional preferido ${profDetails.firstName} es local.`);
      }
    } else {
      console.log(`[data.ts] addAppointment: No se especificó profesional preferido. Intentando auto-asignación para sede ${data.locationId} en ${formatISO(appointmentDateTimeObject)}.`);
      
      let professionalsToConsider: Professional[];
      if (globalUseMockDatabase) {
          professionalsToConsider = data.searchExternal 
              ? mockDB.professionals 
              : mockDB.professionals.filter(p => p.locationId === data.locationId);
           console.log(`[data.ts] addAppointment (Mock): ${data.searchExternal ? 'Todas las sedes' : `Sede ${data.locationId}`}. Profesionales a considerar: ${professionalsToConsider.length}`);
      } else { // Firestore
          const allProfsForConsideration = await getProfessionals(data.searchExternal ? undefined : data.locationId);
          professionalsToConsider = allProfsForConsideration.map(p => p as Professional); 
          console.log(`[data.ts] addAppointment (Firestore): ${data.searchExternal ? 'Todas las sedes' : `Sede ${data.locationId}`}. Profesionales a considerar: ${professionalsToConsider.length}`);
      }

      const existingAppointmentsForDayResponse = await getAppointments({ // This will use Firestore or mock based on globalUseMockDatabase
        date: data.appointmentDate,
        locationId: data.searchExternal ? 'all' : data.locationId, // Fetch for all locations if searching external, or just current
        statuses: [APPOINTMENT_STATUS.BOOKED, APPOINTMENT_STATUS.CONFIRMED]
      });
      const existingAppointmentsForDay = existingAppointmentsForDayResponse.appointments || [];
      console.log(`[data.ts] addAppointment: Citas existentes para el día ${formatISO(data.appointmentDate)} (para el contexto de búsqueda): ${existingAppointmentsForDay.length}`);

      for (const prof of professionalsToConsider) {
          if (data.searchExternal && prof.locationId === data.locationId) {
            // console.log(`[data.ts] addAppointment: Saltando profesional local ${prof.firstName} durante búsqueda externa.`);
            continue;
          }

          const availability = getProfessionalAvailabilityForDate(prof, data.appointmentDate);
          // console.log(`[data.ts] addAppointment: Verificando disponibilidad para ${prof.firstName} ${prof.lastName} (ID: ${prof.id}). Disponible hoy:`, availability);

          if (availability && availability.startTime && availability.endTime) {
              const profWorkStartTime = parse(`${format(data.appointmentDate, 'yyyy-MM-dd')} ${availability.startTime}`, 'yyyy-MM-dd HH:mm', new Date());
              const profWorkEndTime = parse(`${format(data.appointmentDate, 'yyyy-MM-dd')} ${availability.endTime}`, 'yyyy-MM-dd HH:mm', new Date());
              
              // Check if appointment slot is within professional's working hours
              if (!isWithinInterval(appointmentDateTimeObject, { start: profWorkStartTime, end: dateFnsAddMinutes(profWorkEndTime, -appointmentDuration + 1) })) {
                  // console.log(`[data.ts] addAppointment: Profesional ${prof.firstName} no asignado: Cita fuera de horario laboral (${availability.startTime}-${availability.endTime}). Cita: ${data.appointmentTime}-${format(appointmentEndTime, 'HH:mm')}`);
                  continue;
              }

              // Check for overlaps ONLY with appointments of THIS professional or appointments AT THE TARGET LOCATION for this slot
              const relevantExistingAppointments = existingAppointmentsForDay.filter(existingAppt => 
                existingAppt.professionalId === prof.id || // Appointments of this professional anywhere
                (existingAppt.locationId === data.locationId && // OR appointments at target location for this slot
                 areIntervalsOverlapping(
                    { start: appointmentDateTimeObject, end: appointmentEndTime },
                    { start: parseISO(existingAppt.appointmentDateTime), end: dateFnsAddMinutes(parseISO(existingAppt.appointmentDateTime), existingAppt.durationMinutes) }
                  ) && !existingAppt.professionalId // Consider unassigned slots at target location as busy
                )
              );
              
              const isOverlappingExisting = relevantExistingAppointments.some(existingAppt =>
                  existingAppt.professionalId === prof.id && // Must be an appointment of this professional
                  areIntervalsOverlapping(
                      { start: appointmentDateTimeObject, end: appointmentEndTime },
                      { start: parseISO(existingAppt.appointmentDateTime), end: dateFnsAddMinutes(parseISO(existingAppt.appointmentDateTime), existingAppt.durationMinutes) }
                  )
              );

              if (!isOverlappingExisting) {
                  actualProfessionalId = prof.id;
                  if (prof.locationId !== data.locationId) { // This implies data.searchExternal was true
                      isExternal = true;
                      externalOriginLocId = prof.locationId;
                       console.log(`[data.ts] addAppointment: Profesional ${prof.firstName} ${prof.lastName} (ID: ${prof.id}, Externo de ${externalOriginLocId}) auto-asignado.`);
                  } else {
                      console.log(`[data.ts] addAppointment: Profesional ${prof.firstName} ${prof.lastName} (ID: ${prof.id}, Local) auto-asignado.`);
                  }
                  break; 
              } else {
                  // console.log(`[data.ts] addAppointment: Profesional ${prof.firstName} no asignado: Se superpone con cita existente.`);
              }
          } else {
              // console.log(`[data.ts] addAppointment: Profesional ${prof.firstName} no asignado: No disponible el ${format(data.appointmentDate, 'yyyy-MM-dd')} (Razón: ${availability?.reason || 'Desconocida'})`);
          }
      }
      if (!actualProfessionalId) {
          console.warn(`[data.ts] addAppointment: No se pudo auto-asignar un profesional disponible para sede ${data.locationId} en el horario solicitado.`);
      }
    }

    const newAppointmentData: Omit<Appointment, 'id' | 'patient' | 'service' | 'professional'> = {
      patientId: data.existingPatientId || (await addPatient({ firstName: data.patientFirstName, lastName: data.patientLastName, phone: data.patientPhone, age: data.patientAge, isDiabetic: data.isDiabetic })).id,
      locationId: data.locationId,
      professionalId: actualProfessionalId || null, // Ensure null if undefined
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

    if (globalUseMockDatabase) {
      const newId = generateId();
      const fullAppointment = { ...newAppointmentData, id: newId } as Appointment;
      mockDB.appointments.push(fullAppointment);
      console.log("[data.ts] addAppointment (Mock): Cita añadida al mockDB:", fullAppointment);
      return { 
          ...fullAppointment,
          patient: mockDB.patients.find(p => p.id === fullAppointment.patientId),
          service: mockDB.services.find(s => s.id === fullAppointment.serviceId),
          professional: mockDB.professionals.find(p => p.id === fullAppointment.professionalId)
      };
    }
    if (!firestore) {
      console.error("[data.ts] addAppointment: Firestore no está inicializado.");
      throw new Error("Firestore not initialized. Appointment not added.");
    }

    const firestoreData: any = {
      ...newAppointmentData,
      appointmentDateTime: toFirestoreTimestamp(newAppointmentData.appointmentDateTime)!,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      professionalId: newAppointmentData.professionalId ?? null, // Explicitly null
      bookingObservations: newAppointmentData.bookingObservations ?? null,
      externalProfessionalOriginLocationId: newAppointmentData.externalProfessionalOriginLocationId ?? null,
    };
    // Ensure other potentially undefined fields are null for Firestore
    firestoreData.amountPaid = firestoreData.amountPaid ?? null;
    firestoreData.paymentMethod = firestoreData.paymentMethod ?? null;
    firestoreData.staffNotes = firestoreData.staffNotes ?? null;
    firestoreData.attachedPhotos = firestoreData.attachedPhotos ?? [];
    firestoreData.addedServices = firestoreData.addedServices ?? [];


    const docRef = await addDoc(collection(firestore, 'citas'), firestoreData);
    console.log("[data.ts] addAppointment (Firestore): Cita añadida a Firestore con ID:", docRef.id);
    // Fetch the newly created appointment to return it with populated fields if needed, or construct manually
    const createdAppointment = { ...newAppointmentData, id: docRef.id } as Appointment;
    // For simplicity, we'll return the data as is, the UI can re-fetch if it needs fully populated objects.
    return createdAppointment; 
  } catch (error) {
    console.error("[data.ts] Error en addAppointment:", error);
    throw error;
  }
}

export async function updateAppointment(id: string, data: Partial<Appointment>): Promise<Appointment | undefined> {
  try {
    const updatePayload: Partial<Appointment> = { ...data };
     // Ensure timestamps are handled correctly if date/time are passed separately
    if (data.appointmentDate && data.appointmentTime && typeof data.appointmentDate === 'object' && typeof data.appointmentTime === 'string') {
        const datePart = data.appointmentDate as Date;
        const timePart = data.appointmentTime as string;
        const [hours, minutes] = timePart.split(':').map(Number);
        const finalDateObject = setMinutes(setHours(datePart, hours), minutes);
        updatePayload.appointmentDateTime = formatISO(finalDateObject);
        delete updatePayload.appointmentDate; // Remove separate fields if combined
        delete updatePayload.appointmentTime;
    } else if (data.appointmentDateTime && typeof data.appointmentDateTime !== 'string') {
        // If it's a Date object from a form, convert to ISO string
        updatePayload.appointmentDateTime = formatISO(data.appointmentDateTime as unknown as Date);
    }


    if (globalUseMockDatabase) {
      const index = mockDB.appointments.findIndex(a => a.id === id);
      if (index === -1) return undefined;
      
      const appointmentToUpdate = {...mockDB.appointments[index], ...updatePayload, updatedAt: formatISO(new Date())};
      mockDB.appointments[index] = appointmentToUpdate;
      console.log("[data.ts] updateAppointment (Mock): Cita actualizada en mockDB:", appointmentToUpdate);
      return { 
          ...appointmentToUpdate,
          patient: mockDB.patients.find(p => p.id === appointmentToUpdate.patientId),
          service: mockDB.services.find(s => s.id === appointmentToUpdate.serviceId),
          professional: mockDB.professionals.find(p => p.id === appointmentToUpdate.professionalId)
      };
    }
    if (!firestore) {
      console.error("[data.ts] updateAppointment: Firestore no está inicializado.");
      throw new Error("Firestore not initialized. Appointment not updated.");
    }
    const docRef = doc(firestore, 'citas', id);
    
    const firestoreUpdateData: any = { ...updatePayload, updatedAt: serverTimestamp() };
    
    if (firestoreUpdateData.appointmentDateTime && typeof firestoreUpdateData.appointmentDateTime === 'string') {
      firestoreUpdateData.appointmentDateTime = toFirestoreTimestamp(firestoreUpdateData.appointmentDateTime);
    }
    // Convert other date fields if they exist in payload
    if (firestoreUpdateData.createdAt && typeof firestoreUpdateData.createdAt === 'string') {
      firestoreUpdateData.createdAt = toFirestoreTimestamp(firestoreUpdateData.createdAt);
    }


    // Ensure undefined fields are handled correctly (e.g., convert to null or use FieldValue.delete() if needed)
    Object.keys(firestoreUpdateData).forEach(key => {
      if (firestoreUpdateData[key] === undefined) {
        firestoreUpdateData[key] = null; // Default to null for optional fields not explicitly removed
      }
      if (key === 'addedServices' && !Array.isArray(firestoreUpdateData[key])) {
        firestoreUpdateData[key] = []; // Ensure it's an array if present
      }
      if (key === 'attachedPhotos' && !Array.isArray(firestoreUpdateData[key])) {
        firestoreUpdateData[key] = []; // Ensure it's an array if present
      }
    });


    await updateDoc(docRef, firestoreUpdateData);
    const updatedDoc = await getDoc(docRef);
    if (!updatedDoc.exists()) {
      console.warn(`[data.ts] updateAppointment (Firestore): Documento no encontrado después de actualizar ID: ${id}`);
      return undefined;
    }
    console.log("[data.ts] updateAppointment (Firestore): Cita actualizada en Firestore, ID:", id);
    return { id: updatedDoc.id, ...convertDocumentData(updatedDoc.data()) } as Appointment;
  } catch (error) {
    console.error("[data.ts] Error en updateAppointment:", error);
    throw error;
  }
}

// --- Periodic Reminders ---
export async function getPeriodicReminders(): Promise<PeriodicReminder[]> {
  try {
    if (globalUseMockDatabase) return [...mockDB.periodicReminders].sort((a,b) => parseISO(a.dueDate).getTime() - parseISO(b.dueDate).getTime());
    if (!firestore) {
      console.warn("[data.ts] getPeriodicReminders: Firestore not available, returning mock data.");
      return [...initialMockPeriodicRemindersData].sort((a,b) => parseISO(a.dueDate).getTime() - parseISO(b.dueDate).getTime());
    }
    const snapshot = await getDocs(query(collection(firestore, 'recordatorios'), orderBy('dueDate')));
    if (snapshot.empty && initialMockPeriodicRemindersData.length > 0) {
        // console.warn("[data.ts] Firestore 'recordatorios' collection is empty. Falling back to mock data if available.");
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
    if (globalUseMockDatabase) {
      const newId = generateId();
      const fullReminder = { ...newReminder, id: newId, createdAt: formatISO(new Date()), updatedAt: formatISO(new Date()) };
      mockDB.periodicReminders.push(fullReminder);
      return fullReminder;
    }
    if (!firestore) {
      console.error("[data.ts] addPeriodicReminder: Firestore is not initialized.");
      throw new Error("Firestore not initialized. Reminder not added.");
    }
    const firestoreData: any = {
      ...newReminder,
      dueDate: toFirestoreTimestamp(newReminder.dueDate)!,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    // Ensure optional fields are null if undefined for Firestore
    firestoreData.description = firestoreData.description ?? null;
    firestoreData.amount = firestoreData.amount ?? null;

    const docRef = await addDoc(collection(firestore, 'recordatorios'), firestoreData);
    return { ...newReminder, id: docRef.id, createdAt: formatISO(new Date()), updatedAt: formatISO(new Date()) };
  } catch (error) {
    console.error("[data.ts] Error in addPeriodicReminder:", error);
    throw error;
  }
}

export async function updatePeriodicReminder(id: string, data: Partial<PeriodicReminderFormData> & { id?: string, dueDate?: string | Date }): Promise<PeriodicReminder | undefined> {
  try {
    const updateData: Partial<Omit<PeriodicReminder, 'id' | 'createdAt' | 'updatedAt'>> = {};
    if (data.title) updateData.title = data.title;
    if (data.hasOwnProperty('description')) updateData.description = data.description || undefined;
    if (data.dueDate) {
        const dateToFormat = typeof data.dueDate === 'string' ? parseISO(data.dueDate) : data.dueDate;
        updateData.dueDate = formatISO(dateToFormat, { representation: 'date' });
    }
    if (data.recurrence) updateData.recurrence = data.recurrence;
    if (data.hasOwnProperty('amount')) updateData.amount = data.amount ?? undefined;
    if (data.status) updateData.status = data.status;
    
    if (globalUseMockDatabase) {
      const index = mockDB.periodicReminders.findIndex(r => r.id === id);
      if (index === -1) return undefined;
      mockDB.periodicReminders[index] = { ...mockDB.periodicReminders[index], ...updateData, updatedAt: formatISO(new Date()) };
      return mockDB.periodicReminders[index];
    }
    if (!firestore) {
      console.error("[data.ts] updatePeriodicReminder: Firestore not initialized.");
      throw new Error("Firestore not initialized. Reminder not updated.");
    }
    const docRef = doc(firestore, 'recordatorios', id);
    const firestoreUpdate: any = {...updateData, updatedAt: serverTimestamp()};
    if (updateData.dueDate) firestoreUpdate.dueDate = toFirestoreTimestamp(updateData.dueDate);
    
    firestoreUpdate.description = firestoreUpdate.description ?? null;
    firestoreUpdate.amount = firestoreUpdate.amount ?? null;


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
    if (globalUseMockDatabase) {
      mockDB.periodicReminders = mockDB.periodicReminders.filter(r => r.id !== id);
      return;
    }
    if (!firestore) {
      console.error("[data.ts] deletePeriodicReminder: Firestore not initialized.");
      throw new Error("Firestore not initialized. Reminder not deleted.");
    }
    await deleteDoc(doc(firestore, 'recordatorios', id));
  } catch (error) {
    console.error("[data.ts] Error in deletePeriodicReminder:", error);
    throw error;
  }
}

// --- Important Notes ---
export async function getImportantNotes(): Promise<ImportantNote[]> {
  try {
    if (globalUseMockDatabase) return [...mockDB.importantNotes].sort((a,b) => parseISO(b.createdAt!).getTime() - parseISO(a.createdAt!).getTime());
    if (!firestore) {
        console.warn("[data.ts] getImportantNotes: Firestore not available, returning mock data.");
        return [...initialMockImportantNotesData].sort((a,b) => parseISO(b.createdAt!).getTime() - parseISO(a.createdAt!).getTime());
    }
    const snapshot = await getDocs(query(collection(firestore, 'notasImportantes'), orderBy('createdAt', 'desc')));
    if (snapshot.empty && initialMockImportantNotesData.length > 0) {
        // console.warn("[data.ts] Firestore 'notasImportantes' collection is empty. Returning mock data if available.");
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
    if (globalUseMockDatabase) {
        const newId = generateId();
        const fullNote = { ...newNote, id: newId, createdAt: formatISO(new Date()), updatedAt: formatISO(new Date()) };
        mockDB.importantNotes.push(fullNote);
        return fullNote;
    }
    if (!firestore) {
      console.error("[data.ts] addImportantNote: Firestore is not initialized.");
      throw new Error("Firestore not initialized. Note not added.");
    }
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
    if (globalUseMockDatabase) {
        const index = mockDB.importantNotes.findIndex(n => n.id === id);
        if (index === -1) return undefined;
        mockDB.importantNotes[index] = { ...mockDB.importantNotes[index], ...data, updatedAt: formatISO(new Date()) };
        return mockDB.importantNotes[index];
    }
    if (!firestore) {
      console.error("[data.ts] updateImportantNote: Firestore is not initialized.");
      throw new Error("Firestore not initialized. Note not updated.");
    }
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
    if (globalUseMockDatabase) {
        mockDB.importantNotes = mockDB.importantNotes.filter(n => n.id !== id);
        return;
    }
    if (!firestore) {
      console.error("[data.ts] deleteImportantNote: Firestore is not initialized.");
      throw new Error("Firestore not initialized. Note not deleted.");
    }
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
    throw new Error("Firestore not initialized. Seeding aborted.");
  }
  if (globalUseMockDatabase) {
    console.warn("[data.ts] seedFirestoreWithMockData: Application is in globalUseMockDatabase mode (using in-memory mock). Seeding to Firestore will not occur to prevent accidental overwrite if this flag is misinterpreted.");
    return;
  }

  console.log("[data.ts] Starting to seed Firestore with mock data...");
  const batch = writeBatch(firestore);

  try {
    // Seed Users
    initialMockUsersData.forEach(user => {
      const { id, ...userData } = user;
      // En el mock, la contraseña es 'admin'. Para Firestore, si usas Firebase Auth, este campo es más de referencia.
      // Si no usas Firebase Auth, necesitarías un sistema de hash para la contraseña.
      const userToSeed = { ...userData, password: "admin" }; 
      const userRef = doc(firestore, 'usuarios', id);
      batch.set(userRef, userToSeed);
    });

    // Seed Services
    initialMockServicesData.forEach(service => {
      const { id, ...serviceData } = service;
      const serviceRef = doc(firestore, 'servicios', id);
      batch.set(serviceRef, serviceData);
    });
    
    // Seed Locations (Sedes)
    LOCATIONS.forEach(location => {
        const sedeRef = doc(firestore, 'sedes', location.id);
        batch.set(sedeRef, { name: location.name });
    });

    // Seed Professionals
    initialMockProfessionalsData.forEach(prof => {
      const { id, ...profData } = prof;
      const firestoreProfData: any = { ...profData };
      
      // Convert dates in currentContract to Timestamps
      if (profData.currentContract && profData.currentContract.startDate && profData.currentContract.endDate) {
        firestoreProfData.currentContract.startDate = toFirestoreTimestamp(profData.currentContract.startDate);
        firestoreProfData.currentContract.endDate = toFirestoreTimestamp(profData.currentContract.endDate);
        firestoreProfData.currentContract.notes = profData.currentContract.notes ?? null;
        firestoreProfData.currentContract.empresa = profData.currentContract.empresa ?? null;
      } else {
        firestoreProfData.currentContract = null;
      }

      // Convert dates in contractHistory to Timestamps
      if (profData.contractHistory) {
        firestoreProfData.contractHistory = profData.contractHistory.map(ch => ({
          ...ch,
          startDate: toFirestoreTimestamp(ch.startDate),
          endDate: toFirestoreTimestamp(ch.endDate),
          notes: ch.notes ?? null,
          empresa: ch.empresa ?? null,
        }));
      } else {
          firestoreProfData.contractHistory = [];
      }

      // Convert dates in customScheduleOverrides to Timestamps
      if (profData.customScheduleOverrides) {
        firestoreProfData.customScheduleOverrides = profData.customScheduleOverrides.map(ov => ({
          ...ov,
          date: toFirestoreTimestamp(ov.date),
          startTime: ov.startTime ?? null,
          endTime: ov.endTime ?? null,
          notes: ov.notes ?? null,
        }));
      } else {
          firestoreProfData.customScheduleOverrides = [];
      }

      // Ensure optional fields are null if undefined
      firestoreProfData.phone = firestoreProfData.phone ?? null;
      firestoreProfData.birthDay = firestoreProfData.birthDay ?? null;
      firestoreProfData.birthMonth = firestoreProfData.birthMonth ?? null;
      firestoreProfData.biWeeklyEarnings = firestoreProfData.biWeeklyEarnings ?? 0;


      const profRef = doc(firestore, 'profesionales', id);
      batch.set(profRef, firestoreProfData);
    });

    // Seed Patients
    initialMockPatientsData.forEach(patient => {
      const { id, ...patientData } = patient;
      const firestorePatientData: any = { ...patientData };
      firestorePatientData.phone = firestorePatientData.phone ?? null;
      firestorePatientData.age = firestorePatientData.age ?? null;
      firestorePatientData.isDiabetic = firestorePatientData.isDiabetic ?? false;
      firestorePatientData.preferredProfessionalId = firestorePatientData.preferredProfessionalId ?? null;
      firestorePatientData.notes = firestorePatientData.notes ?? null;

      const patientRef = doc(firestore, 'pacientes', id);
      batch.set(patientRef, firestorePatientData);
    });

    // Seed Appointments
    initialMockAppointmentsData.forEach(appt => {
      const { id, patient, professional, service, ...apptData } = appt; // Exclude populated fields
      const firestoreApptData: any = { ...apptData };
      firestoreApptData.appointmentDateTime = toFirestoreTimestamp(apptData.appointmentDateTime);
      firestoreApptData.createdAt = apptData.createdAt ? toFirestoreTimestamp(apptData.createdAt) : serverTimestamp();
      firestoreApptData.updatedAt = apptData.updatedAt ? toFirestoreTimestamp(apptData.updatedAt) : serverTimestamp();
      
      // Ensure optional fields are null
      firestoreApptData.professionalId = firestoreApptData.professionalId ?? null;
      firestoreApptData.bookingObservations = firestoreApptData.bookingObservations ?? null;
      firestoreApptData.actualArrivalTime = firestoreApptData.actualArrivalTime ?? null;
      firestoreApptData.paymentMethod = firestoreApptData.paymentMethod ?? null;
      firestoreApptData.amountPaid = firestoreApptData.amountPaid ?? null;
      firestoreApptData.staffNotes = firestoreApptData.staffNotes ?? null;
      firestoreApptData.attachedPhotos = firestoreApptData.attachedPhotos ?? [];
      firestoreApptData.addedServices = firestoreApptData.addedServices ?? [];
      firestoreApptData.isExternalProfessional = firestoreApptData.isExternalProfessional ?? false;
      firestoreApptData.externalProfessionalOriginLocationId = firestoreApptData.externalProfessionalOriginLocationId ?? null;


      const apptRef = doc(firestore, 'citas', id);
      batch.set(apptRef, firestoreApptData);
    });

    // Seed Periodic Reminders
    initialMockPeriodicRemindersData.forEach(reminder => {
        const { id, ...reminderData } = reminder;
        const firestoreReminderData: any = {...reminderData};
        firestoreReminderData.dueDate = toFirestoreTimestamp(reminderData.dueDate);
        firestoreReminderData.createdAt = reminderData.createdAt ? toFirestoreTimestamp(reminderData.createdAt) : serverTimestamp();
        firestoreReminderData.updatedAt = reminderData.updatedAt ? toFirestoreTimestamp(reminderData.updatedAt) : serverTimestamp();
        firestoreReminderData.description = firestoreReminderData.description ?? null;
        firestoreReminderData.amount = firestoreReminderData.amount ?? null;

        const reminderRef = doc(firestore, 'recordatorios', id);
        batch.set(reminderRef, firestoreReminderData);
    });

    // Seed Important Notes
    initialMockImportantNotesData.forEach(note => {
        const { id, ...noteData } = note;
        const firestoreNoteData: any = {...noteData};
        firestoreNoteData.createdAt = noteData.createdAt ? toFirestoreTimestamp(noteData.createdAt) : serverTimestamp();
        firestoreNoteData.updatedAt = noteData.updatedAt ? toFirestoreTimestamp(noteData.updatedAt) : serverTimestamp();
        
        const noteRef = doc(firestore, 'notasImportantes', id);
        batch.set(noteRef, firestoreNoteData);
    });

    await batch.commit();
    console.log("[data.ts] Firestore successfully seeded with all mock data!");

  } catch (error) {
    console.error("[data.ts] Error seeding Firestore with mock data:", error);
    throw error; // Re-throw to allow UI to catch and display an error
  }
};

// Initialize mock store if in mock mode (runs once on module load)
if (globalUseMockDatabase) {
  initializeGlobalMockStore();
}

    