
// src/lib/data.ts
import type { User, Professional, Patient, Service, Appointment, AppointmentFormData, ProfessionalFormData, AppointmentStatus, ServiceFormData, Contract, PeriodicReminder, ImportantNote, PeriodicReminderFormData, ImportantNoteFormData } from '@/types';
import { LOCATIONS, USER_ROLES, SERVICES as SERVICES_CONSTANTS, APPOINTMENT_STATUS, LocationId, ServiceId as ConstantServiceId, APPOINTMENT_STATUS_DISPLAY, PAYMENT_METHODS, TIME_SLOTS, DAYS_OF_WEEK } from './constants';
import type { DayOfWeekId } from './constants';
import { formatISO, parseISO, addDays, setHours, setMinutes, startOfDay, endOfDay, isSameDay as dateFnsIsSameDay, startOfMonth, endOfMonth, subDays, isEqual, isBefore, isAfter, getDate, getYear, getMonth, setMonth, setYear, getHours, addMinutes as dateFnsAddMinutes, isWithinInterval, getDay, format, differenceInCalendarDays, areIntervalsOverlapping, parse } from 'date-fns';
import { es } from 'date-fns/locale';
import { firestore, useMockDatabase as globalUseMockDatabase } from './firebase-config'; // Centralized mock flag
import { collection, addDoc, getDocs, doc, getDoc, updateDoc, query, where, deleteDoc, writeBatch, serverTimestamp, Timestamp, runTransaction, setDoc, QueryConstraint, orderBy, limit, startAfter,getCountFromServer, CollectionReference, DocumentData, documentId } from 'firebase/firestore';

// Esta constante ahora se define localmente en data.ts y se basa en la variable de entorno
const useMockDatabaseEnvData = process.env.NEXT_PUBLIC_USE_MOCK_DATABASE;
const useMockDatabaseData = useMockDatabaseEnvData === 'true';

console.log(`[data.ts] Configuración interna de useMockDatabaseData: ${useMockDatabaseData} (basado en NEXT_PUBLIC_USE_MOCK_DATABASE='${useMockDatabaseEnvData}')`);


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
    // console.error("[data.ts] Error converting Firestore Timestamp to ISO String:", timestamp, error);
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

export function getContractDisplayStatus(contract: Contract | null | undefined, referenceDateParam?: Date | string): ContractDisplayStatus {
  const currentSystemDate = new Date();
  let referenceDate: Date;

  if (referenceDateParam) {
    if (typeof referenceDateParam === 'string') {
      try {
        referenceDate = startOfDay(parseISO(referenceDateParam));
        if (isNaN(referenceDate.getTime())) {
          console.warn(`[data.ts] getContractDisplayStatus: Invalid referenceDateParam string after parsing. Falling back to currentSystemDate. Original:`, referenceDateParam);
          referenceDate = startOfDay(currentSystemDate);
        }
      } catch (e) {
        console.warn(`[data.ts] getContractDisplayStatus: Error parsing referenceDateParam string. Falling back to currentSystemDate. Original:`, referenceDateParam, "Error:", e);
        referenceDate = startOfDay(currentSystemDate);
      }
    } else if (referenceDateParam instanceof Date && !isNaN(referenceDateParam.getTime())) {
      referenceDate = startOfDay(referenceDateParam);
    }
     else {
      // console.warn(`[data.ts] getContractDisplayStatus: Invalid referenceDateParam (not string or valid Date). Falling back to currentSystemDate. Param:`, referenceDateParam);
      referenceDate = startOfDay(currentSystemDate);
    }
  } else {
    referenceDate = startOfDay(currentSystemDate);
  }

  // console.log(`[getContractDisplayStatus] Prof: ${professional?.firstName} ${professional?.lastName}, Contract ID: ${contract?.id}, Ref Date: ${formatISO(referenceDate)}`);


  if (!contract || !contract.startDate || !contract.endDate) {
    // console.log(`[getContractDisplayStatus] No contract or invalid dates. Returning 'Sin Contrato'. Contract:`, contract);
    return 'Sin Contrato';
  }

  const { startDate: startDateStr, endDate: endDateStr } = contract;

  if (typeof startDateStr !== 'string' || typeof endDateStr !== 'string' || startDateStr.length === 0 || endDateStr.length === 0) {
    // console.warn("[data.ts] getContractDisplayStatus: Invalid contract dates (not strings or empty). Contract:", contract);
    return 'Sin Contrato';
  }

  let startDate: Date;
  let endDate: Date;

  try {
    startDate = parseISO(startDateStr);
    endDate = parseISO(endDateStr);
  } catch (e) {
    console.error("[data.ts] getContractDisplayStatus: Error parsing contract date strings. Contract:", contract, "Error:", e);
    return 'Sin Contrato';
  }

  if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
    // console.warn("[data.ts] getContractDisplayStatus: Contract dates are NaN after parsing. Original:", { startDateStr, endDateStr }, "Parsed:", { startDate, endDate });
    return 'Sin Contrato';
  }
  
  // console.log(`[getContractDisplayStatus] Contract ID: ${contract.id}, Parsed Start: ${formatISO(startDate)}, Parsed End: ${formatISO(endDate)}`);


  if (isBefore(referenceDate, startOfDay(startDate))) {
    // console.log(`[getContractDisplayStatus] Reference date is BEFORE contract start. Returning 'No Vigente Aún'.`);
    return 'No Vigente Aún';
  }
  if (isAfter(referenceDate, endOfDay(endDate))) { // Use endOfDay for endDate to include the whole last day
    // console.log(`[getContractDisplayStatus] Reference date is AFTER contract end. Returning 'Vencido'.`);
    return 'Vencido';
  }

  const daysUntilExpiry = differenceInCalendarDays(endOfDay(endDate), referenceDate);
  // console.log(`[getContractDisplayStatus] Days until expiry: ${daysUntilExpiry}`);
  if (daysUntilExpiry <= 15 && daysUntilExpiry >= 0) {
    // console.log(`[getContractDisplayStatus] Contract is Próximo a Vencer (Days until expiry: ${daysUntilExpiry}).`);
    return 'Próximo a Vencer';
  }
  // console.log(`[getContractDisplayStatus] Contract is Activo.`);
  return 'Activo';
}
// --- End Contract Status Helper ---


// --- Initial Mock Data Definitions ---
const generateId = (): string => {
  try {
    return Math.random().toString(36).substring(2, 11) + Date.now().toString(36).substring(2, 7);
  } catch (error) {
    console.error("[data.ts] Error in generateId:", error);
    return "fallback_id_" + Date.now();
  }
};

const todayMock = new Date(2025, 4, 20); // Martes, 20 de Mayo de 2025 (month is 0-indexed)
const yesterdayMock = subDays(todayMock, 1); // 19 de Mayo 2025
const tomorrowMock = addDays(todayMock,1); // 21 de Mayo 2025


const initialMockUsersData: User[] = [
  { id: 'admin001', username: "admin@footprints.com", password: 'admin', role: USER_ROLES.ADMIN, name: 'Administrador General del Sistema', locationId: null },
  { id: 'contador001', username: "contador@footprints.com", password: 'admin', role: USER_ROLES.CONTADOR, name: 'Contador Principal', locationId: null },
  { id: 'user-higuereta', username: "higuereta@footprints.com", password: 'admin', role: USER_ROLES.LOCATION_STAFF, locationId: 'higuereta', name: 'Personal Sede Higuereta' },
  { id: 'user-eden_benavides', username: "edenbenavides@footprints.com", password: 'admin', role: USER_ROLES.LOCATION_STAFF, locationId: 'eden_benavides', name: 'Personal Sede Edén Benavides' },
  { id: 'user-crucetas', username: "crucetas@footprints.com", password: 'admin', role: USER_ROLES.LOCATION_STAFF, locationId: 'crucetas', name: 'Personal Sede Crucetas' },
  { id: 'user-carpaccio', username: "carpaccio@footprints.com", password: 'admin', role: USER_ROLES.LOCATION_STAFF, locationId: 'carpaccio', name: 'Personal Sede Carpaccio' },
  { id: 'user-vista_alegre', username: "vistaalegre@footprints.com", password: 'admin', role: USER_ROLES.LOCATION_STAFF, locationId: 'vista_alegre', name: 'Personal Sede Vista Alegre' },
  { id: 'user-san_antonio', username: "sanantonio@footprints.com", password: 'admin', role: USER_ROLES.LOCATION_STAFF, locationId: 'san_antonio', name: 'Personal Sede San Antonio' },
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
  const numProfessionals = professionalCounts[location.id] || 2; // Asegura al menos 2 por defecto
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
    
    // Asegurar que los primeros 2 profesionales de CADA sede tengan un contrato activo
    if (i < 2) { 
      const contractStartDate = subDays(todayMock, 60); 
      const contractEndDate = addDays(todayMock, 90); 
      currentContract = {
        id: generateId(),
        startDate: formatISO(contractStartDate, { representation: 'date' }),
        endDate: formatISO(contractEndDate, { representation: 'date' }),
        notes: `Contrato activo para ${location.name} prof ${i + 1}`,
        empresa: (i % 2 === 0) ? `Empresa Footprints ${location.name}` : `Servicios Podológicos Globales`,
      };
    } else { // Para los profesionales restantes, variar los estados de contrato
      const contractType = (i + locIndex) % 5; 
      if (contractType === 0) { // Vencido
         const expiredContractStartDate = subDays(todayMock, 150);
         const expiredContractEndDate = subDays(todayMock, 30);
         contractHistory.push({
             id: generateId(),
             startDate: formatISO(expiredContractStartDate, { representation: 'date' }),
             endDate: formatISO(expiredContractEndDate, { representation: 'date' }),
             notes: `Contrato vencido prof ${i + 1} en ${location.name}`,
             empresa: 'Empresa Antigua SA',
         });
         currentContract = null;
      } else if (contractType === 1) { // Próximo a Vencer
        const nearExpiryStartDate = subDays(todayMock, 75);
        const nearExpiryEndDate = addDays(todayMock, 10); 
         currentContract = {
             id: generateId(),
             startDate: formatISO(nearExpiryStartDate, { representation: 'date' }),
             endDate: formatISO(nearExpiryEndDate, { representation: 'date' }),
             notes: `Contrato próximo a vencer prof ${i + 1} en ${location.name}`,
             empresa: 'Gestiones Rápidas SRL',
         };
      } else if (contractType === 2) { // Activo pero diferente duración
        const contractStartDate = subDays(todayMock, Math.floor(Math.random() * 30) + 15);
        const contractEndDate = addDays(todayMock, Math.floor(Math.random() * 45) + 20);
        currentContract = {
          id: generateId(),
          startDate: formatISO(contractStartDate, { representation: 'date' }),
          endDate: formatISO(contractEndDate, { representation: 'date' }),
          notes: `Otro contrato activo para prof ${i + 1} en ${location.name}`,
          empresa: (i % 3 === 0) ? `Podólogos Asociados ${location.name}` : undefined,
        };
      } else if (contractType === 3) { // No Vigente Aún
        const futureContractStartDate = addDays(todayMock, 5);
        const futureContractEndDate = addDays(todayMock, 95);
        currentContract = {
          id: generateId(),
          startDate: formatISO(futureContractStartDate, { representation: 'date' }),
          endDate: formatISO(futureContractEndDate, { representation: 'date' }),
          notes: `Contrato futuro para prof ${i + 1} en ${location.name}`,
          empresa: 'Nuevos Horizontes Podológicos',
        };
      }
      // contractType === 4 resultará en Sin Contrato (currentContract remains null)
    }
    
    let customOverrides: Professional['customScheduleOverrides'] = [];
    // Ejemplo: el primer profesional de Higuereta tiene un descanso hoy (todayMock)
    if (location.id === 'higuereta' && i === 0) { 
        customOverrides = [
            { id: generateId(), date: formatISO(todayMock, {representation: 'date'}), isWorking: false, notes: "Descanso programado hoy"}, 
            { id: generateId(), date: formatISO(addDays(todayMock, 7), {representation: 'date'}), isWorking: true, startTime: "14:00", endTime: "20:00", notes: "Turno especial tarde"} 
        ];
    }
    // Ejemplo: el primer profesional de San Antonio descansa hoy
    if (location.id === 'san_antonio' && i === 0) { 
        customOverrides = [
            { id: generateId(), date: formatISO(todayMock, {representation: 'date'}), isWorking: false, notes: "Cita médica personal hoy"},
        ];
    }

    return {
      id: `prof-${location.id}-${i + 1}`,
      firstName: `Profesional ${String.fromCharCode(65 + i)}${i>=26 ? String.fromCharCode(65 + Math.floor(i/26)-1) : ''}`, // Para nombres más variados si hay muchos
      lastName: `${location.name.split(' ')[0]}`,
      locationId: location.id,
      phone: `9${String(locIndex).padStart(1, '0')}${String(i + 1).padStart(2, '0')}12345`,
      isManager: (location.id === 'higuereta' && i === 0) || (location.id === 'san_antonio' && i === 0), // Make first prof in Higuereta & San Antonio a manager
      biWeeklyEarnings: Math.random() * 500 + 100, 
      workSchedule: baseSchedule,
      customScheduleOverrides: customOverrides,
      currentContract: currentContract,
      contractHistory: contractHistory,
      birthDay: null, // Removido por ahora
      birthMonth: null, // Removido por ahora
    };
  });
});


const initialMockPatientsData: Patient[] = Array.from({ length: 150 }, (_, i) => ({
  id: `pat${String(i + 1).padStart(3, '0')}`,
  firstName: `Paciente ${String.fromCharCode(65 + (i % 26))}${i > 25 ? String.fromCharCode(65 + Math.floor(i/26)-1) : '' }`,
  lastName: `Test${i + 1}`,
  phone: (i % 2 === 0) ? `9000000${String(i).padStart(2, '0')}` : undefined,
  age: i % 3 === 0 ? null : (20 + (i % 50)),
  isDiabetic: i % 7 === 0,
  preferredProfessionalId: i % 3 === 0 ? initialMockProfessionalsData[i % initialMockProfessionalsData.length]?.id : undefined,
  notes: i % 5 === 0 ? `Observación importante para paciente ${i + 1}. Tiene preferencia por horarios de mañana.` : undefined,
}));

const initialMockServicesData: Service[] = [...SERVICES_CONSTANTS.map(s => ({...s, price: Math.floor(Math.random() * 50) + 50 }))];

const initialMockAppointmentsData: Appointment[] = [
  {
    id: 'appt001', patientId: 'pat001', locationId: LOCATIONS[0].id, professionalId: initialMockProfessionalsData.find(p => p.locationId === LOCATIONS[0].id && getContractDisplayStatus(p.currentContract, yesterdayMock) === 'Activo')?.id || initialMockProfessionalsData[0]?.id, serviceId: initialMockServicesData[0].id, appointmentDateTime: formatISO(setHours(setMinutes(yesterdayMock, 0), 10)), durationMinutes: initialMockServicesData[0].defaultDuration, status: APPOINTMENT_STATUS.COMPLETED, amountPaid: initialMockServicesData[0].price, paymentMethod: PAYMENT_METHODS[0], staffNotes: "Tratamiento exitoso, paciente refiere mejoría.", attachedPhotos: [`https://placehold.co/200x200.png?text=Appt001_Foto1&data-ai-hint=foot care` as string, `https://placehold.co/200x200.png?text=Appt001_Foto2&data-ai-hint=medical x-ray` as string ], addedServices: [{ serviceId: initialMockServicesData[2].id, price: initialMockServicesData[2].price, professionalId: initialMockProfessionalsData.find(p => p.locationId === LOCATIONS[0].id && getContractDisplayStatus(p.currentContract, yesterdayMock) === 'Activo')?.id || initialMockProfessionalsData[0]?.id }], createdAt: formatISO(subDays(yesterdayMock,1)), updatedAt: formatISO(yesterdayMock),
  },
  {
    id: 'appt002', patientId: 'pat002', locationId: LOCATIONS[1].id, professionalId: initialMockProfessionalsData.find(p => p.locationId === LOCATIONS[1].id && getContractDisplayStatus(p.currentContract, todayMock) === 'Activo')?.id || initialMockProfessionalsData.find(p=>p.locationId === LOCATIONS[1].id)?.id, serviceId: initialMockServicesData[1].id, appointmentDateTime: formatISO(setHours(setMinutes(startOfDay(todayMock), 30), 9)), durationMinutes: initialMockServicesData[1].defaultDuration, status: APPOINTMENT_STATUS.BOOKED, bookingObservations: "Paciente refiere dolor agudo.", createdAt: formatISO(subDays(todayMock,1)), updatedAt: formatISO(subDays(todayMock,1)), attachedPhotos: [], addedServices: [],
  },
  {
    id: 'appt003', patientId: 'pat003', locationId: LOCATIONS[0].id, professionalId: initialMockProfessionalsData.find(p => p.locationId === LOCATIONS[0].id && getContractDisplayStatus(p.currentContract, todayMock) === 'Activo')?.id || initialMockProfessionalsData.find(p=>p.locationId === LOCATIONS[0].id)?.id, serviceId: initialMockServicesData[2].id, appointmentDateTime: formatISO(setHours(setMinutes(startOfDay(todayMock), 0), 14)), durationMinutes: initialMockServicesData[2].defaultDuration, status: APPOINTMENT_STATUS.CONFIRMED, actualArrivalTime: "13:55", createdAt: formatISO(subDays(todayMock,2)), updatedAt: formatISO(todayMock),
    addedServices: [
      { serviceId: initialMockServicesData[0].id, professionalId: initialMockProfessionalsData.find(p => p.locationId === LOCATIONS[0].id)?.id, price: initialMockServicesData[0].price },
      { serviceId: initialMockServicesData[1].id, price: initialMockServicesData[1].price }
    ]
  },
  {
    id: 'appt004', patientId: 'pat004', locationId: LOCATIONS[2].id, professionalId: initialMockProfessionalsData.find(p => p.locationId === LOCATIONS[2].id && getContractDisplayStatus(p.currentContract, todayMock) === 'Activo')?.id || initialMockProfessionalsData.find(p=>p.locationId === LOCATIONS[2].id)?.id, serviceId: initialMockServicesData[3].id, appointmentDateTime: formatISO(setHours(setMinutes(startOfDay(todayMock), 0), 11)), durationMinutes: initialMockServicesData[3].defaultDuration, status: APPOINTMENT_STATUS.CANCELLED_CLIENT, createdAt: formatISO(subDays(todayMock,1)), updatedAt: formatISO(todayMock), attachedPhotos: [], addedServices: [],
  },
  {
    id: 'appt-today-01', patientId: 'pat005', locationId: 'higuereta', professionalId: 'prof-higuereta-3', serviceId: 'quiropodia', 
    appointmentDateTime: formatISO(setHours(setMinutes(startOfDay(todayMock), 0), 10)), durationMinutes: 60, status: APPOINTMENT_STATUS.BOOKED,
    createdAt: formatISO(todayMock), updatedAt: formatISO(todayMock), attachedPhotos: [], addedServices: [],
  },
  {
    id: 'appt-today-02', patientId: 'pat006', locationId: 'higuereta', professionalId: 'prof-higuereta-4', serviceId: 'consulta_general', 
    appointmentDateTime: formatISO(setHours(setMinutes(startOfDay(todayMock), 30), 11)), durationMinutes: 30, status: APPOINTMENT_STATUS.CONFIRMED, actualArrivalTime: "11:25",
    createdAt: formatISO(todayMock), updatedAt: formatISO(todayMock), attachedPhotos: [], addedServices: [],
  },
  {
    id: 'appt-today-03', patientId: 'pat007', locationId: 'san_antonio', professionalId: 'prof-san_antonio-2', serviceId: 'tratamiento_unas', 
    appointmentDateTime: formatISO(setHours(setMinutes(startOfDay(todayMock), 0), 15)), durationMinutes: 45, status: APPOINTMENT_STATUS.BOOKED,
    createdAt: formatISO(todayMock), updatedAt: formatISO(todayMock), attachedPhotos: [], addedServices: [],
  },
  {
    id: 'appt-today-comp-01', patientId: 'pat008', locationId: 'higuereta', professionalId: 'prof-higuereta-5', serviceId: 'reflexologia', 
    appointmentDateTime: formatISO(setHours(setMinutes(startOfDay(todayMock), 0), 9)), durationMinutes: 45, status: APPOINTMENT_STATUS.COMPLETED, amountPaid: 75, paymentMethod: 'Yape/Plin',
    createdAt: formatISO(todayMock), updatedAt: formatISO(todayMock), attachedPhotos: [], addedServices: [],
  },
  {
    id: 'appt-yesterday-01', patientId: 'pat009', locationId: 'crucetas', professionalId: initialMockProfessionalsData.find(p=>p.locationId==='crucetas' && getContractDisplayStatus(p.currentContract, yesterdayMock) === 'Activo')?.id, serviceId: 'quiropodia',
    appointmentDateTime: formatISO(setHours(setMinutes(startOfDay(yesterdayMock), 0), 12)), durationMinutes: 60, status: APPOINTMENT_STATUS.COMPLETED, amountPaid: 80, paymentMethod: 'Efectivo',
    createdAt: formatISO(yesterdayMock), updatedAt: formatISO(yesterdayMock), attachedPhotos: [], addedServices: [],
  },
  {
    id: 'appt-tomorrow-01', patientId: 'pat010', locationId: 'eden_benavides', professionalId: initialMockProfessionalsData.find(p=>p.locationId==='eden_benavides' && getContractDisplayStatus(p.currentContract, tomorrowMock) === 'Activo')?.id, serviceId: 'consulta_general',
    appointmentDateTime: formatISO(setHours(setMinutes(startOfDay(tomorrowMock), 0), 16)), durationMinutes: 30, status: APPOINTMENT_STATUS.BOOKED,
    createdAt: formatISO(todayMock), updatedAt: formatISO(todayMock), attachedPhotos: [], addedServices: [],
  },
  { 
    id: 'appt_reg_q2_abril_001', patientId: 'pat011', locationId: 'higuereta', professionalId: 'prof-higuereta-1', serviceId: 'quiropodia',
    appointmentDateTime: formatISO(new Date(2025, 3, 18, 10, 0)), durationMinutes: 60, status: APPOINTMENT_STATUS.COMPLETED, amountPaid: 85, paymentMethod: 'Tarjeta de Crédito',
    createdAt: formatISO(new Date(2025, 3, 18)), updatedAt: formatISO(new Date(2025, 3, 18)),
  },
  { 
    id: 'appt_reg_q2_abril_002', patientId: 'pat012', locationId: 'san_antonio', professionalId: 'prof-san_antonio-1', serviceId: 'tratamiento_unas',
    appointmentDateTime: formatISO(new Date(2025, 3, 25, 15, 30)), durationMinutes: 45, status: APPOINTMENT_STATUS.COMPLETED, amountPaid: 65, paymentMethod: 'Efectivo',
    createdAt: formatISO(new Date(2025, 3, 25)), updatedAt: formatISO(new Date(2025, 3, 25)),
  },
  {
    id: 'appt-today-eden-01', patientId: 'pat013', locationId: 'eden_benavides', professionalId: initialMockProfessionalsData.find(p => p.locationId === 'eden_benavides' && getContractDisplayStatus(p.currentContract, todayMock) === 'Activo')?.id || 'prof-eden_benavides-1', serviceId: 'quiropodia',
    appointmentDateTime: formatISO(setHours(setMinutes(startOfDay(todayMock), 0), 11)), durationMinutes: 60, status: APPOINTMENT_STATUS.BOOKED,
    createdAt: formatISO(todayMock), updatedAt: formatISO(todayMock), attachedPhotos: [], addedServices: [],
  },
  {
    id: 'appt-today-crucetas-01', patientId: 'pat014', locationId: 'crucetas', professionalId: initialMockProfessionalsData.find(p => p.locationId === 'crucetas' && getContractDisplayStatus(p.currentContract, todayMock) === 'Activo')?.id || 'prof-crucetas-1', serviceId: 'consulta_general',
    appointmentDateTime: formatISO(setHours(setMinutes(startOfDay(todayMock), 30), 14)), durationMinutes: 30, status: APPOINTMENT_STATUS.CONFIRMED, actualArrivalTime: "14:25",
    createdAt: formatISO(todayMock), updatedAt: formatISO(todayMock), attachedPhotos: [], addedServices: [],
  },
  {
    id: 'appt-today-carpaccio-01', patientId: 'pat015', locationId: 'carpaccio', professionalId: initialMockProfessionalsData.find(p => p.locationId === 'carpaccio' && getContractDisplayStatus(p.currentContract, todayMock) === 'Activo')?.id || 'prof-carpaccio-1', serviceId: 'tratamiento_unas',
    appointmentDateTime: formatISO(setHours(setMinutes(startOfDay(todayMock), 0), 16)), durationMinutes: 45, status: APPOINTMENT_STATUS.COMPLETED, amountPaid: 70, paymentMethod: 'Tarjeta de Débito',
    createdAt: formatISO(todayMock), updatedAt: formatISO(todayMock), attachedPhotos: [], addedServices: [],
  },
  {
    id: 'appt-today-vista_alegre-01', patientId: 'pat016', locationId: 'vista_alegre', professionalId: initialMockProfessionalsData.find(p => p.locationId === 'vista_alegre' && getContractDisplayStatus(p.currentContract, todayMock) === 'Activo')?.id || 'prof-vista_alegre-1', serviceId: 'reflexologia',
    appointmentDateTime: formatISO(setHours(setMinutes(startOfDay(todayMock), 0), 10)), durationMinutes: 45, status: APPOINTMENT_STATUS.BOOKED,
    createdAt: formatISO(todayMock), updatedAt: formatISO(todayMock), attachedPhotos: [], addedServices: [],
  },
  // Cita para profesional de San Antonio en Higuereta (traslado)
  {
    id: 'appt-external-01',
    patientId: 'pat020',
    locationId: 'higuereta', // Cita es EN Higuereta
    professionalId: initialMockProfessionalsData.find(p => p.locationId === 'san_antonio' && getContractDisplayStatus(p.currentContract, todayMock) === 'Activo' && !p.isManager)?.id || 'prof-san_antonio-2', // Profesional DE San Antonio
    serviceId: 'quiropodia',
    appointmentDateTime: formatISO(setHours(setMinutes(startOfDay(todayMock), 0), 16)), // Martes 16:00
    durationMinutes: 60,
    status: APPOINTMENT_STATUS.BOOKED,
    bookingObservations: "Profesional de San Antonio atiende en Higuereta.",
    isExternalProfessional: true,
    externalProfessionalOriginLocationId: 'san_antonio',
    createdAt: formatISO(subDays(todayMock, 1)),
    updatedAt: formatISO(subDays(todayMock, 1)),
    attachedPhotos: [],
    addedServices: [],
  },
   // Travel block for the external professional
  {
    id: `travel-${initialMockProfessionalsData.find(p => p.locationId === 'san_antonio' && getContractDisplayStatus(p.currentContract, todayMock) === 'Activo' && !p.isManager)?.id || 'prof-san_antonio-2'}-to-higuereta`,
    patientId: `travel-block-${initialMockProfessionalsData.find(p => p.locationId === 'san_antonio' && getContractDisplayStatus(p.currentContract, todayMock) === 'Activo' && !p.isManager)?.id || 'prof-san_antonio-2'}`,
    locationId: 'higuereta', // Destination of travel
    professionalId: initialMockProfessionalsData.find(p => p.locationId === 'san_antonio' && getContractDisplayStatus(p.currentContract, todayMock) === 'Activo' && !p.isManager)?.id || 'prof-san_antonio-2',
    serviceId: 'travel', // Special serviceId for travel
    appointmentDateTime: formatISO(setHours(setMinutes(startOfDay(todayMock), 0), 15)), // 1 hour before appointment
    durationMinutes: 60, // Travel time
    status: APPOINTMENT_STATUS.BOOKED, // Or a specific travel status
    isTravelBlock: true,
    bookingObservations: "Bloqueo por traslado a Higuereta",
    createdAt: formatISO(subDays(todayMock, 1)),
    updatedAt: formatISO(subDays(todayMock, 1)),
  },
];


const initialMockPeriodicRemindersData: PeriodicReminder[] = [
  { id: 'rem001', title: 'Pago IGV Mayo 2025', dueDate: formatISO(new Date(2025, 4, 20), { representation: 'date' }), recurrence: 'monthly', amount: 350.50, status: 'pending', createdAt: formatISO(new Date(2025, 3, 20)), updatedAt: formatISO(new Date(2025, 3, 20))},
  { id: 'rem002', title: 'Servicio de Limpieza Oficina', dueDate: formatISO(subDays(new Date(), 5), { representation: 'date' }), recurrence: 'monthly', amount: 120.00, status: 'pending', createdAt: formatISO(subDays(new Date(), 35)), updatedAt: formatISO(subDays(new Date(), 35))}, // Vencido
  { id: 'rem003', title: 'Cuota Préstamo Banco X', dueDate: formatISO(addDays(new Date(), 2), { representation: 'date' }), recurrence: 'monthly', amount: 780.00, status: 'pending', createdAt: formatISO(subDays(new Date(), 28)), updatedAt: formatISO(subDays(new Date(), 28))}, // Próximo a vencer
  { id: 'rem004', title: 'Suscripción Software Contable', dueDate: formatISO(addDays(new Date(), 10), { representation: 'date' }), recurrence: 'annually', amount: 500.00, status: 'pending', createdAt: formatISO(subDays(new Date(), 355)), updatedAt: formatISO(subDays(new Date(), 355))},
  { id: 'rem005', title: 'Alquiler Local Higuereta - Junio', dueDate: formatISO(new Date(getYear(new Date()), getMonth(new Date()) + 1, 5), { representation: 'date' }), recurrence: 'monthly', amount: 1200.00, status: 'pending', createdAt: formatISO(new Date()), updatedAt: formatISO(new Date())},
];

const initialMockImportantNotesData: ImportantNote[] = [
  { id: 'note001', title: 'Protocolo Cierre de Caja Diario', content: 'Recordar verificar todos los POS, efectivo contado y reporte Z antes de cerrar. Arqueo debe ser firmado por el encargado de turno.', createdAt: formatISO(subDays(new Date(), 2)), updatedAt: formatISO(subDays(new Date(), 2)) },
  { id: 'note002', title: 'Contacto Proveedor Principal Insumos', content: 'Juan Pérez - JP Insumos Médicos - Cel: 987654321 - Correo: jperez@jpinsumos.com. Pedidos los lunes antes de las 12pm para entrega el miércoles.', createdAt: formatISO(subDays(new Date(), 10)), updatedAt: formatISO(subDays(new Date(), 10)) },
  { id: 'note003', title: 'Mantenimiento Equipos Podológicos', content: 'Revisión y calibración programada para el 15 de Junio (próximo mes). Coordinar con servicio técnico "Podotec".', createdAt: formatISO(subDays(new Date(), 1)), updatedAt: formatISO(subDays(new Date(), 1)) },
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
  if (useMockDatabaseData) {
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
      console.log("[data.ts] MockDB initialized with new data because it was empty AND useMockDatabaseData is true.");
    } else if (mockDB.users.length > 0 || mockDB.professionals.length > 0 || mockDB.appointments.length > 0) {
       console.log("[data.ts] MockDB already has data. Not re-initializing.");
    }
  } else {
    console.log("[data.ts] initializeGlobalMockStore: useMockDatabaseData is false. MockDB will not be populated with initial mock data, and will be reset if it had data.");
    mockDB = { users: [], professionals: [], patients: [], services: [], appointments: [], periodicReminders: [], importantNotes: [] };
  }
};

initializeGlobalMockStore();


// --- Auth ---
export async function getUserByUsername(identity: string): Promise<User | undefined> {
  console.log(`[data.ts] getUserByUsername (useMockDatabaseData: ${useMockDatabaseData}) for identity: ${identity}`);
  try {
    if (useMockDatabaseData) {
      const user = mockDB.users.find(u => u.username.toLowerCase() === identity.toLowerCase());
      if (user) {
        console.log(`[data.ts] getUserByUsername (mock): User ${identity} found.`);
        return { ...user };
      }
      console.warn(`[data.ts] getUserByUsername (mock): User ${identity} not found.`);
      return undefined;
    }

    if (!firestore) {
      console.error("[data.ts] getUserByUsername (Firestore): Firestore is not initialized. Cannot fetch user.");
      return undefined;
    }
    const usersCol = collection(firestore, 'usuarios');
    // Asumimos que 'username' en Firestore es el email que usa Firebase Auth
    const q = query(usersCol, where('username', '==', identity));
    const snapshot = await getDocs(q);

    if (snapshot.empty) {
      console.warn(`[data.ts] getUserByUsername (Firestore): No se encontró ningún usuario con username: ${identity}`);
      return undefined;
    }
    // Asumimos que username es único, por lo que solo debería haber un documento
    const userDoc = snapshot.docs[0];
    const userData = { id: userDoc.id, ...convertDocumentData(userDoc.data()) } as User;
    console.log(`[data.ts] getUserByUsername (Firestore): User ${identity} found with ID: ${userData.id}`);
    return userData;
  } catch (error: any) {
    console.error(`[data.ts] Error en getUserByUsername para "${identity}":`, error);
    if (error.code === 'unavailable') {
       console.error("[data.ts] Firestore is unavailable. Check connection and Firebase/Firestore status.");
    } else if (error.message && error.message.includes("firestore/indexes?create_composite")) {
       console.error("[data.ts] Firestore query requires an index. Please create it using the link in the error message:", error.message);
    }
    return undefined;
  }
}


// --- Professionals ---
export async function getProfessionals (locationId?: LocationId): Promise<(Professional & { contractDisplayStatus: ContractDisplayStatus })[]> {
  let professionalsToProcess: Professional[];
  const currentSystemDate = new Date(); 

  try {
    if (useMockDatabaseData) {
      professionalsToProcess = locationId ? mockDB.professionals.filter(p => p.locationId === locationId) : [...mockDB.professionals];
    } else {
      if (!firestore) {
        console.warn("[data.ts] getProfessionals: Firestore not available, falling back to mock data for this call.");
        professionalsToProcess = locationId ? initialMockProfessionalsData.filter(p => p.locationId === locationId) : [...initialMockProfessionalsData];
      } else {
        const professionalsCol = collection(firestore, 'profesionales');
        let qConstraints: QueryConstraint[] = [];
        if (locationId) {
          qConstraints.push(where('locationId', '==', locationId));
        }
        qConstraints.push(orderBy("lastName"), orderBy("firstName"));
        
        const finalQuery = query(professionalsCol, ...qConstraints);
        const snapshot = await getDocs(finalQuery);
        professionalsToProcess = snapshot.docs.map(docSnap => ({ id: docSnap.id, ...convertDocumentData(docSnap.data()) } as Professional));
        
        if (snapshot.empty && initialMockProfessionalsData.length > 0 && useMockDatabaseData) { 
            console.warn(`[data.ts] Firestore 'profesionales' query returned no results for locationId '${locationId || 'all'}'. Falling back to mock list if empty, for UI stability during setup.`);
            professionalsToProcess = professionalsToProcess.length > 0 ? professionalsToProcess : (locationId ? initialMockProfessionalsData.filter(p => p.locationId === locationId) : [...initialMockProfessionalsData]);
        } else if (snapshot.empty && locationId) {
           // console.warn(`[data.ts] Firestore 'profesionales' query returned no results for locationId '${locationId}'. This might be correct if no professionals are in this location.`);
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
}


export async function getProfessionalById (id: string): Promise<Professional | undefined> {
  try {
    if (useMockDatabaseData) {
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
}

export async function addProfessional (data: Omit<ProfessionalFormData, 'id'>): Promise<Professional> {
  try {
    const newProfessionalData: Omit<Professional, 'id' | 'biWeeklyEarnings'> = {
      firstName: data.firstName,
      lastName: data.lastName,
      locationId: data.locationId,
      phone: data.phone || null,
      birthDay: data.birthDay === undefined || data.birthDay === 0 ? null : data.birthDay,
      birthMonth: data.birthMonth === undefined || data.birthMonth === 0 ? null : data.birthMonth,
      isManager: data.isManager || false,
      workSchedule: {}, // Inicializado vacío, se poblará abajo
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
        if (dayData) { // Asegurarse que dayData existe
          newProfessionalData.workSchedule[dayId] = {
            startTime: dayData.startTime || '00:00',
            endTime: dayData.endTime || '00:00',
            // Si isWorking es undefined (ej. no se tocó el checkbox), asumir true si hay horas.
            // Si se tocó, será true o false.
            isWorking: dayData.isWorking === undefined ? (!!dayData.startTime && !!dayData.endTime) : dayData.isWorking,
          };
        } else {
          // Si no hay datos para el día, asumir que no trabaja.
           newProfessionalData.workSchedule[dayId] = { startTime: '00:00', endTime: '00:00', isWorking: false };
        }
      });
    } else {
        // Si no se proporciona workSchedule, inicializar todos los días como no laborables.
        DAYS_OF_WEEK.forEach(dayInfo => {
             newProfessionalData.workSchedule[dayInfo.id] = { startTime: '00:00', endTime: '00:00', isWorking: false };
        });
    }
    
    if (useMockDatabaseData) {
      const newId = generateId();
      const newProfWithId = { ...newProfessionalData, id: newId, biWeeklyEarnings: 0 } as Professional;
      mockDB.professionals.push(newProfWithId);
      return { ...newProfWithId };
    }

    if (!firestore) {
      console.error("[data.ts] addProfessional: Firestore is not initialized.");
      throw new Error("Firestore not initialized. Professional not added.");
    }

    const firestoreData: any = { ...newProfessionalData, biWeeklyEarnings: 0 };
    firestoreData.phone = firestoreData.phone ?? null; // Asegura null si es undefined
    firestoreData.birthDay = firestoreData.birthDay ?? null;
    firestoreData.birthMonth = firestoreData.birthMonth ?? null;
    firestoreData.isManager = firestoreData.isManager ?? false;
   
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
      id: ch.id || generateId(),
      startDate: toFirestoreTimestamp(ch.startDate),
      endDate: toFirestoreTimestamp(ch.endDate),
      notes: ch.notes ?? null,
      empresa: ch.empresa ?? null,
    })) : [];


    const docRef = await addDoc(collection(firestore, 'profesionales'), firestoreData);
    return { ...newProfessionalData, id: docRef.id, biWeeklyEarnings: 0 } as Professional;
  } catch (error) {
    console.error("[data.ts] Error adding professional:", error);
    throw error;
  }
}

export async function updateProfessional (id: string, data: Partial<ProfessionalFormData>): Promise<Professional | undefined> {
  try {
    const professionalToUpdate: Partial<Omit<Professional, 'id'|'biWeeklyEarnings'>> = {
      firstName: data.firstName,
      lastName: data.lastName,
      locationId: data.locationId,
      phone: data.phone === undefined ? null : (data.phone || null),
      birthDay: data.birthDay === undefined || data.birthDay === 0 ? null : data.birthDay,
      birthMonth: data.birthMonth === undefined || data.birthMonth === 0 ? null : data.birthMonth,
      isManager: data.isManager === undefined ? false : data.isManager,
    };

    if (data.workSchedule !== undefined) {
        professionalToUpdate.workSchedule = {};
        (Object.keys(data.workSchedule) as Array<DayOfWeekId>).forEach(dayId => {
            const dayData = data.workSchedule![dayId];
            if (dayData) {
                professionalToUpdate.workSchedule![dayId] = {
                    startTime: dayData.startTime || '00:00',
                    endTime: dayData.endTime || '00:00',
                    isWorking: dayData.isWorking === undefined ? (!!dayData.startTime && !!dayData.endTime) : dayData.isWorking,
                };
            } else {
                 professionalToUpdate.workSchedule![dayId] = { startTime: '00:00', endTime: '00:00', isWorking: false };
            }
        });
    }

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
    const existingProfForContract = useMockDatabaseData ? mockDB.professionals.find(p=>p.id === id) : await getProfessionalById(id);

    if (data.hasOwnProperty('currentContract_startDate') || data.hasOwnProperty('currentContract_endDate') || data.hasOwnProperty('currentContract_notes') || data.hasOwnProperty('currentContract_empresa')) {
        if (data.currentContract_startDate && data.currentContract_endDate) {
            const oldContractId = existingProfForContract?.currentContract?.id;
            const dataHasChanged = 
              !oldContractId ||
              (data.currentContract_startDate && formatISO(data.currentContract_startDate, {representation: 'date'}) !== existingProfForContract?.currentContract?.startDate) ||
              (data.currentContract_endDate && formatISO(data.currentContract_endDate, {representation: 'date'}) !== existingProfForContract?.currentContract?.endDate) ||
              ((data.currentContract_notes ?? null) !== (existingProfForContract?.currentContract?.notes ?? null)) ||
              ((data.currentContract_empresa ?? null) !== (existingProfForContract?.currentContract?.empresa ?? null));

            newCurrentContractData = {
                id: dataHasChanged ? generateId() : oldContractId!,
                startDate: formatISO(data.currentContract_startDate, { representation: 'date' }),
                endDate: formatISO(data.currentContract_endDate, { representation: 'date' }),
                notes: data.currentContract_notes || null,
                empresa: data.currentContract_empresa || null,
            };
        } else { 
            newCurrentContractData = null; 
        }
    }


    if (useMockDatabaseData) {
      const index = mockDB.professionals.findIndex(p => p.id === id);
      if (index === -1) return undefined;
      
      const existingProfessional = mockDB.professionals[index];
      const updatedHistory = [...(existingProfessional.contractHistory || [])];

      if (newCurrentContractData !== undefined) { 
        if (existingProfessional.currentContract && newCurrentContractData && existingProfessional.currentContract.id !== newCurrentContractData.id) {
           if (!updatedHistory.find(ch => ch.id === existingProfessional.currentContract!.id)) {
            updatedHistory.push(existingProfessional.currentContract);
          }
        } else if (existingProfessional.currentContract && newCurrentContractData === null) { 
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
    // Campos opcionales que si no vienen en 'data' no deben enviarse para evitar borrar datos existentes
    // si el formulario no los envía.
    const fieldsToUpdate: Record<string, any> = {};
    if (data.hasOwnProperty('firstName')) fieldsToUpdate.firstName = data.firstName;
    if (data.hasOwnProperty('lastName')) fieldsToUpdate.lastName = data.lastName;
    if (data.hasOwnProperty('locationId')) fieldsToUpdate.locationId = data.locationId;
    if (data.hasOwnProperty('phone')) fieldsToUpdate.phone = data.phone || null;
    if (data.hasOwnProperty('birthDay')) fieldsToUpdate.birthDay = data.birthDay === 0 ? null : (data.birthDay || null);
    if (data.hasOwnProperty('birthMonth')) fieldsToUpdate.birthMonth = data.birthMonth === 0 ? null : (data.birthMonth || null);
    if (data.hasOwnProperty('isManager')) fieldsToUpdate.isManager = data.isManager || false;
    if (data.hasOwnProperty('workSchedule')) fieldsToUpdate.workSchedule = professionalToUpdate.workSchedule;
    if (data.hasOwnProperty('customScheduleOverrides')) {
       fieldsToUpdate.customScheduleOverrides = (professionalToUpdate.customScheduleOverrides || []).map((ov: any) => ({
        ...ov,
        date: toFirestoreTimestamp(ov.date),
        startTime: ov.startTime ?? null,
        endTime: ov.endTime ?? null,
        notes: ov.notes ?? null,
      }));
    }
   
    if (newCurrentContractData !== undefined) { 
        fieldsToUpdate.currentContract = newCurrentContractData ? {
            ...newCurrentContractData,
            id: newCurrentContractData.id || generateId(), 
            startDate: toFirestoreTimestamp(newCurrentContractData.startDate)!,
            endDate: toFirestoreTimestamp(newCurrentContractData.endDate)!,
            notes: newCurrentContractData.notes ?? null,
            empresa: newCurrentContractData.empresa ?? null,
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
        fieldsToUpdate.contractHistory = newContractHistory.map(ch => ({
            ...ch,
            id: ch.id || generateId(),
            startDate: toFirestoreTimestamp(ch.startDate)!, 
            endDate: toFirestoreTimestamp(ch.endDate)!,
            notes: ch.notes ?? null,
            empresa: ch.empresa ?? null,
        }));
    }


    if (Object.keys(fieldsToUpdate).length > 0) {
      await updateDoc(docRef, fieldsToUpdate);
    }
    const updatedDocSnap = await getDoc(docRef);
    return { id: updatedDocSnap.id, ...convertDocumentData(updatedDocSnap.data()) } as Professional;

  } catch (error) {
    console.error(`[data.ts] Error updating professional "${id}":`, error);
    throw error;
  }
}

export function getProfessionalAvailabilityForDate(
  professional: Professional,
  targetDate: Date
): { startTime: string; endTime: string; notes?: string; reason?: string } | null {
  // console.log(`[Availability] Prof ${professional.firstName} ${professional.lastName} (ID: ${professional.id}, Loc: ${professional.locationId}) - Checking for date: ${formatISO(targetDate, {representation: 'date'})}`);
  try {
    const targetDateOnly = startOfDay(targetDate); 
    const targetDateString = formatISO(targetDateOnly, { representation: 'date' });
    
    const contractStatus = getContractDisplayStatus(professional.currentContract, targetDateOnly);
    // console.log(`[Availability] Prof ${professional.firstName} (ID: ${professional.id}) - Contract Status for ${targetDateString}: ${contractStatus}`);
    
    if (contractStatus !== 'Activo' && contractStatus !== 'Próximo a Vencer') {
        // console.log(`[Availability] Prof ${professional.firstName} (ID: ${professional.id}) - Contract not active/upcoming for ${targetDateString}. Status: ${contractStatus}`);
        return { startTime: '', endTime: '', reason: `Contrato: ${contractStatus}` };
    }


    if (professional.customScheduleOverrides) {
      const override = professional.customScheduleOverrides.find(
        ov => {
            try {
                // Ensure ov.date is a string before parsing
                if (typeof ov.date !== 'string') {
                    // console.warn(`[Availability] Prof ${professional.firstName} (ID: ${professional.id}) - Invalid date type in override, skipping:`, ov);
                    return false;
                }
                return dateFnsIsSameDay(parseISO(ov.date), targetDateOnly);
            } catch (e) {
                // console.warn(`[Availability] Prof ${professional.firstName} (ID: ${professional.id}) - Error parsing date in override, skipping:`, ov, e);
                return false;
            }
        }
      );
      if (override) {
        // console.log(`[Availability] Prof ${professional.firstName} (ID: ${professional.id}) - Found override for ${targetDateString}:`, override);
        if (override.isWorking && override.startTime && override.endTime) {
          return { startTime: override.startTime, endTime: override.endTime, notes: override.notes || undefined, reason: `Horario especial (${override.notes || 'Anulación'})` };
        }
        return { startTime: '', endTime: '', reason: `Descansando (Anulación${override.notes ? `: ${override.notes}` : ''})` };
      }
    }

    if (professional.workSchedule) {
      const dayOfWeekIndex = getDay(targetDateOnly); 
      const dayKey = DAYS_OF_WEEK.find(d => d.id === (['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as DayOfWeekId[])[dayOfWeekIndex])?.id;
      // console.log(`[Availability] Prof ${professional.firstName} (ID: ${professional.id}) - DayKey for ${targetDateString}: ${dayKey}`);

      if (dayKey) {
          const dailySchedule = professional.workSchedule[dayKey];
          // console.log(`[Availability] Prof ${professional.firstName} (ID: ${professional.id}) - Base schedule for ${dayKey}:`, dailySchedule);
          if (dailySchedule) {
            if (dailySchedule.isWorking === false) { 
              // console.log(`[Availability] Prof ${professional.firstName} (ID: ${professional.id}) - Not working on ${dayKey} based on workSchedule.`);
              return { startTime: '', endTime: '', reason: `Descansando (Horario base: ${DAYS_OF_WEEK.find(d=>d.id === dayKey)?.name} libre)` };
            }
            if ((dailySchedule.isWorking === true || dailySchedule.isWorking === undefined) && dailySchedule.startTime && dailySchedule.endTime) { // isWorking undefined treated as true if times are set
                // console.log(`[Availability] Prof ${professional.firstName} (ID: ${professional.id}) - Working on ${dayKey} from ${dailySchedule.startTime} to ${dailySchedule.endTime} based on workSchedule.`);
                return { startTime: dailySchedule.startTime, endTime: dailySchedule.endTime, reason: "Horario base" };
            }
          }
      }
    }
    // console.log(`[Availability] Prof ${professional.firstName} (ID: ${professional.id}) - No specific schedule found for ${targetDateString}, defaulting to not available.`);
    return { startTime: '', endTime: '', reason: `Descansando (Sin horario base definido para ${DAYS_OF_WEEK[getDay(targetDateOnly)].name})` };
  } catch (error) {
    console.error("[data.ts] Error in getProfessionalAvailabilityForDate:", error, "Professional:", professional, "TargetDate:", targetDate);
    return { startTime: '', endTime: '', reason: "Error al determinar disponibilidad" };
  }
}

// --- Patients ---
export async function getPatients (options?: { page?: number; limit?: number; searchTerm?: string; filterToday?: boolean; adminSelectedLocation?: LocationId | 'all' | null; user?: User | null; lastVisiblePatientId?: string | null }): Promise<{patients: Patient[], totalCount: number, lastVisiblePatientId: string | null}> {
  const { page = 1, limit: pageSize = 10, searchTerm = '', filterToday = false, adminSelectedLocation, user, lastVisiblePatientId: startAfterId } = options || {};

  try {
    if (useMockDatabaseData) {
      let filteredPatients = [...mockDB.patients];
      if (searchTerm) {
        const lowerSearchTerm = searchTerm.toLowerCase();
        filteredPatients = filteredPatients.filter(p =>
          `${p.firstName} ${p.lastName}`.toLowerCase().includes(lowerSearchTerm) ||
          (p.phone && p.phone.includes(searchTerm))
        );
      }
      if (filterToday) {
        const today = startOfDay(new Date()); 
        const appointmentsToday = mockDB.appointments.filter(appt => 
          dateFnsIsSameDay(parseISO(appt.appointmentDateTime), today) &&
          (appt.status === APPOINTMENT_STATUS.BOOKED || appt.status === APPOINTMENT_STATUS.CONFIRMED)
        );
        const patientIdsWithAppointmentsToday = new Set(appointmentsToday.map(app => app.patientId));
        filteredPatients = filteredPatients.filter(p => patientIdsWithAppointmentsToday.has(p.id));
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
      console.warn("[data.ts] getPatients: Firestore not available. Returning empty results or mock based on config.");
      return { patients: initialMockPatientsData.slice(0, pageSize), totalCount: initialMockPatientsData.length, lastVisiblePatientId: null };
    }

    const patientsCol = collection(firestore, 'pacientes') as CollectionReference<DocumentData>;
    let queryConstraints: QueryConstraint[] = [];
    let countQueryConstraints: QueryConstraint[] = [];
    
    if (searchTerm) {
       const nameParts = searchTerm.split(' ').filter(part => part.length > 0);
       if (nameParts.length > 0 && nameParts[0]) {
         const firstPartProcessed = nameParts[0].charAt(0).toUpperCase() + nameParts[0].slice(1).toLowerCase();
         queryConstraints.push(where('firstName', '>=', firstPartProcessed));
         queryConstraints.push(where('firstName', '<=', firstPartProcessed + '\uf8ff'));
         countQueryConstraints.push(where('firstName', '>=', firstPartProcessed));
         countQueryConstraints.push(where('firstName', '<=', firstPartProcessed + '\uf8ff'));
       }
    }

    queryConstraints.push(orderBy('firstName')); 
    queryConstraints.push(orderBy('lastName'));


    let patientIdsWithAppointmentsToday: Set<string> | null = null;
    if (filterToday) {
        const today = startOfDay(new Date());
        const effectiveLocationId = (user?.role === USER_ROLES.ADMIN || user?.role === USER_ROLES.CONTADOR)
            ? (adminSelectedLocation === 'all' ? undefined : adminSelectedLocation as LocationId)
            : user?.locationId;

        const appointmentsResponse = await getAppointments({ 
            date: today,
            locationId: effectiveLocationId || undefined,
            statuses: [APPOINTMENT_STATUS.BOOKED, APPOINTMENT_STATUS.CONFIRMED]
        });
        patientIdsWithAppointmentsToday = new Set((appointmentsResponse.appointments || []).map(app => app.patientId));
        
        if (patientIdsWithAppointmentsToday.size > 0) {
            if (patientIdsWithAppointmentsToday.size <= 30) { 
                queryConstraints.push(where(documentId(), 'in', Array.from(patientIdsWithAppointmentsToday)));
                countQueryConstraints.push(where(documentId(), 'in', Array.from(patientIdsWithAppointmentsToday)));
            } else {
                console.warn("[data.ts] getPatients (Firestore): Too many patients with appointments today for 'in' query. Client-side filtering will be less efficient.");
                // Fallback to client-side filtering if too many IDs for "in" query
            }
        } else { 
             queryConstraints.push(where(documentId(), '==', 'non_existent_dummy_id_to_force_empty_result'));
             countQueryConstraints.push(where(documentId(), '==', 'non_existent_dummy_id_to_force_empty_result'));
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
            // console.warn(`[data.ts] getPatients (Firestore): lastVisiblePatientId ${startAfterId} not found. Fetching from beginning of page ${page}.`);
        }
    }
    
    queryConstraints.push(limit(pageSize));

    const finalQuery = query(patientsCol, ...queryConstraints);
    const snapshot = await getDocs(finalQuery);
    
    let patients = snapshot.docs.map(docSnap => ({ id: docSnap.id, ...convertDocumentData(docSnap.data()) } as Patient));
    const newLastVisibleId = snapshot.docs.length > 0 ? snapshot.docs[snapshot.docs.length - 1].id : null;

    if (searchTerm && (!queryConstraints.some(c => typeof c !== 'function' && (c as any)._fieldPath?.segments.join('.') === 'firstName') && !(filterToday && patientIdsWithAppointmentsToday && patientIdsWithAppointmentsToday.size > 30))) { 
        const lowerSearchTerm = searchTerm.toLowerCase();
        patients = patients.filter(p =>
            (`${p.firstName} ${p.lastName}`.toLowerCase().includes(lowerSearchTerm) ||
            (p.phone && p.phone.includes(searchTerm)))
        );
    }
     if (filterToday && patientIdsWithAppointmentsToday && patientIdsWithAppointmentsToday.size > 30) {
        patients = patients.filter(p => patientIdsWithAppointmentsToday!.has(p.id));
        totalCount = patients.length; // Recalculate totalCount if client-side filtering was applied
    }
    
    return { patients, totalCount, lastVisiblePatientId: newLastVisibleId };

  } catch (error) {
    console.error("[data.ts] Error fetching patients from Firestore:", error);
    const lowerSearchTerm = searchTerm.toLowerCase();
    const fallbackPatients = initialMockPatientsData.filter(p =>
        `${p.firstName} ${p.lastName}`.toLowerCase().includes(lowerSearchTerm) ||
        (p.phone && p.phone.includes(searchTerm))
    );
    const startIndex = (page - 1) * pageSize;
    const paginatedFallback = fallbackPatients.slice(startIndex, startIndex + pageSize);
    return { 
        patients: paginatedFallback, 
        totalCount: fallbackPatients.length, 
        lastVisiblePatientId: paginatedFallback.length > 0 ? paginatedFallback[paginatedFallback.length - 1].id : null 
    };
  }
}

export async function findPatient (firstName: string, lastName: string): Promise<Patient | undefined> {
  try {
    if (useMockDatabaseData) {
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

export async function addPatient (data: Omit<Patient, 'id'>): Promise<Patient> {
  try {
    const newPatientData: Omit<Patient, 'id'> = {
      firstName: data.firstName,
      lastName: data.lastName,
      phone: data.phone || null,
      age: data.age ?? null,
      isDiabetic: data.isDiabetic || false,
      notes: data.notes || null,
      preferredProfessionalId: data.preferredProfessionalId || undefined,
    };

    if (useMockDatabaseData) {
      const newId = generateId();
      const newPatient = { ...newPatientData, id: newId };
      mockDB.patients.push(newPatient);
      return { ...newPatient };
    }
    if (!firestore) {
      console.error("[data.ts] addPatient: Firestore is not initialized.");
      throw new Error("Firestore not initialized. Patient not added.");
    }

    const firestoreData: any = {...newPatientData};
    firestoreData.phone = firestoreData.phone ?? null;
    firestoreData.age = firestoreData.age ?? null;
    firestoreData.isDiabetic = firestoreData.isDiabetic ?? false;
    firestoreData.notes = firestoreData.notes ?? null;
    firestoreData.preferredProfessionalId = firestoreData.preferredProfessionalId ?? null;

    const docRef = await addDoc(collection(firestore, 'pacientes'), firestoreData);
    return { ...newPatientData, id: docRef.id } as Patient;
  } catch (error) {
    console.error("[data.ts] Error in addPatient:", error);
    throw error;
  }
}

export async function updatePatient (id: string, data: Partial<Patient>): Promise<Patient | undefined> {
  try {
    const patientUpdateData: Partial<Patient> = { ...data };
    if (data.hasOwnProperty('phone')) patientUpdateData.phone = data.phone || null;
    if (data.hasOwnProperty('age')) patientUpdateData.age = data.age ?? null;
    if (data.hasOwnProperty('isDiabetic')) patientUpdateData.isDiabetic = data.isDiabetic || false;
    if (data.hasOwnProperty('notes')) patientUpdateData.notes = data.notes || null;
    if (data.hasOwnProperty('preferredProfessionalId')) patientUpdateData.preferredProfessionalId = data.preferredProfessionalId || undefined;

    if (useMockDatabaseData) {
      const index = mockDB.patients.findIndex(p => p.id === id);
      if (index === -1) return undefined;
      mockDB.patients[index] = { ...mockDB.patients[index], ...patientUpdateData };
      return { ...mockDB.patients[index] };
    }
    if (!firestore) {
      console.error("[data.ts] updatePatient: Firestore is not initialized.");
      throw new Error("Firestore not initialized. Patient not updated.");
    }
    const docRef = doc(firestore, 'pacientes', id);
    
    const firestoreUpdate: any = {...patientUpdateData};
    Object.keys(firestoreUpdate).forEach(key => {
        if (firestoreUpdate[key] === undefined) {
            if (['phone', 'age', 'notes', 'preferredProfessionalId'].includes(key)) {
                 firestoreUpdate[key] = null;
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

export async function getPatientById (id: string): Promise<Patient | undefined> {
  try {
    if (useMockDatabaseData) {
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
    throw error; 
  }
}

// --- Services ---
export async function getServices (): Promise<Service[]> {
  try {
    if (useMockDatabaseData) {
      return [...mockDB.services];
    }
    if (!firestore) {
      console.warn("[data.ts] getServices: Firestore not available, falling back to mock.");
      return [...initialMockServicesData];
    }
    const snapshot = await getDocs(query(collection(firestore, 'servicios'), orderBy('name')));
    if (snapshot.empty && initialMockServicesData.length > 0 && useMockDatabaseData) { 
        console.warn("[data.ts] Firestore 'servicios' collection is empty. Falling back to mock data for UI stability.");
        return [...initialMockServicesData];
    }
    return snapshot.docs.map(docSnap => ({ id: docSnap.id, ...convertDocumentData(docSnap.data()) } as Service));
  } catch (error) {
    console.error("[data.ts] Error fetching services, falling back to mock:", error);
    return [...initialMockServicesData];
  }
}

export async function addService (data: ServiceFormData): Promise<Service> {
  try {
    const newServiceData = {
      name: data.name,
      defaultDuration: (data.defaultDuration.hours * 60) + data.defaultDuration.minutes,
      price: data.price ?? null,
    };
    if (useMockDatabaseData) {
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
    firestoreData.price = firestoreData.price ?? null;


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

export async function updateService (id: string, data: Partial<ServiceFormData>): Promise<Service | undefined> {
  try {
    const serviceUpdateData: Partial<Omit<Service, 'id'>> = {};
    if (data.name) serviceUpdateData.name = data.name;
    if (data.defaultDuration) serviceUpdateData.defaultDuration = (data.defaultDuration.hours * 60) + data.defaultDuration.minutes;
    if (data.hasOwnProperty('price')) serviceUpdateData.price = data.price ?? null;

    if (useMockDatabaseData) {
      const index = mockDB.services.findIndex(s => s.id === id);
      if (index === -1) return undefined;
      mockDB.services[index] = { ...mockDB.services[index], ...serviceUpdateData };
      return { ...mockDB.services[index] };
    }
    if (!firestore) {
      console.error("[data.ts] updateService: Firestore is not initialized.");
      throw new Error("Firestore not initialized. Service not updated.");
    }
    const docRef = doc(firestore, 'servicios', id);
    
    const firestoreUpdate: any = {...serviceUpdateData};
    if (firestoreUpdate.hasOwnProperty('price')) {
      firestoreUpdate.price = firestoreUpdate.price ?? null;
    }

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
export async function getAppointments (filters: { locationId?: LocationId | 'all' | null; date?: Date; statuses?: AppointmentStatus[]; dateRange?: { start: Date; end: Date } }): Promise<{ appointments: Appointment[], totalCount?: number }> {
  const { locationId, date, statuses, dateRange } = filters;
  // console.log(`[data.ts] getAppointments called with filters:`, filters, `(useMockDatabaseData: ${useMockDatabaseData})`);
  try {
    let appointmentsData: Appointment[];
    let allServices: Service[] = [];

    if (useMockDatabaseData) {
      let filteredAppointments = [...mockDB.appointments];
      if (locationId && locationId !== 'all') {
        filteredAppointments = filteredAppointments.filter(a => a.locationId === locationId);
      }
      if (date) {
        const targetDate = startOfDay(date);
        filteredAppointments = filteredAppointments.filter(a => {
          try {
            return dateFnsIsSameDay(parseISO(a.appointmentDateTime), targetDate);
          } catch (e) { return false; }
        });
      }
      if (statuses && statuses.length > 0) {
        filteredAppointments = filteredAppointments.filter(a => statuses.includes(a.status));
      }
      if (dateRange) {
          const rangeStart = startOfDay(dateRange.start);
          const rangeEnd = endOfDay(dateRange.end);
          filteredAppointments = filteredAppointments.filter(a => {
            try {
              const apptDate = parseISO(a.appointmentDateTime);
              return isWithinInterval(apptDate, {start: rangeStart, end: rangeEnd});
            } catch (e) { return false; }
          });
      }
      appointmentsData = filteredAppointments;
      allServices = [...mockDB.services];
    } else {
      if (!firestore) {
        console.warn("[data.ts] getAppointments (Firestore): Firestore not available. Falling back to mock for this call.");
        appointmentsData = locationId && locationId !== 'all' ? initialMockAppointmentsData.filter(a => a.locationId === locationId) : [...initialMockAppointmentsData];
        allServices = [...initialMockServicesData];
      } else {
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
            if (statuses.length <= 30) { 
                 qConstraints.push(where('status', 'in', statuses));
            } else {
                console.warn("[data.ts] getAppointments (Firestore): Too many statuses for 'in' query. Firestore limits to 30. Fetching all and filtering client-side (less efficient).");
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

        if (snapshot.empty && !(locationId && locationId === 'all' && !date && (!statuses || statuses.length === 0) && !dateRange) ) {
          console.warn("[data.ts] Firestore 'citas' query returned no results with current filters. Falling back to mock if applicable, or empty array.");
          if(useMockDatabaseData) {
              appointmentsData = initialMockAppointmentsData.filter(a => statuses ? statuses.includes(a.status) : true);
              allServices = [...initialMockServicesData];
          } else {
            appointmentsData = [];
          }
        } else {
          appointmentsData = snapshot.docs.map(docSnap => ({ id: docSnap.id, ...convertDocumentData(docSnap.data()) } as Appointment));
        }
        
        if (statuses && statuses.length > 30 && qConstraints.every(c => typeof c !== 'function' && ( (c as any)._fieldPath?.segments.join('.') !== 'status' || (c as any)._op !== 'in'))) {
            appointmentsData = appointmentsData.filter(a => statuses.includes(a.status));
        }
        
        // Fetch all services to populate addedServices names if using Firestore
        const servicesSnapshot = await getDocs(collection(firestore, 'servicios'));
        allServices = servicesSnapshot.docs.map(docSnap => ({ id: docSnap.id, ...convertDocumentData(docSnap.data()) } as Service));
      }
    }
    
    const populatedAppointments = await Promise.all(appointmentsData.map(async appt => {
      const [patientData, serviceData, professionalData] = await Promise.all([
        appt.patientId ? (useMockDatabaseData ? mockDB.patients.find(p => p.id === appt.patientId) : getDoc(doc(firestore!, 'pacientes', appt.patientId))) : Promise.resolve(null),
        appt.serviceId ? (useMockDatabaseData ? mockDB.services.find(s => s.id === appt.serviceId) : getDoc(doc(firestore!, 'servicios', appt.serviceId))) : Promise.resolve(null),
        appt.professionalId ? (useMockDatabaseData ? mockDB.professionals.find(p => p.id === appt.professionalId) : getDoc(doc(firestore!, 'profesionales', appt.professionalId))) : Promise.resolve(null),
      ]);

      const populatedAddedServices = appt.addedServices?.map(as => {
        const foundService = allServices.find(s => s.id === as.serviceId);
        const foundProfessional = as.professionalId ? (useMockDatabaseData ? mockDB.professionals.find(p=> p.id === as.professionalId) : null /* Fetch if needed */) : undefined;
        return {
          ...as,
          service: foundService,
          professional: foundProfessional, // This part is not fully populated from Firestore yet in this map
        };
      });

      return {
        ...appt,
        patient: useMockDatabaseData ? patientData as Patient : (patientData?.exists() ? { id: (patientData as any).id, ...convertDocumentData(patientData.data()) } as Patient : undefined),
        service: useMockDatabaseData ? serviceData as Service : (serviceData?.exists() ? { id: (serviceData as any).id, ...convertDocumentData(serviceData.data()) } as Service : undefined),
        professional: useMockDatabaseData ? professionalData as Professional : (professionalData?.exists() ? { id: (professionalData as any).id, ...convertDocumentData(professionalData.data()) } as Professional : undefined),
        addedServices: populatedAddedServices,
      };
    }));

    return { appointments: populatedAppointments.sort((a,b) => parseISO(a.appointmentDateTime).getTime() - parseISO(b.appointmentDateTime).getTime()) };

  } catch (error) {
    console.error("[data.ts] Error fetching appointments:", error);
     if (useMockDatabaseData) { 
        let filteredAppointments = [...mockDB.appointments];
         if (locationId && locationId !== 'all') filteredAppointments = filteredAppointments.filter(a => a.locationId === locationId);
        return { appointments: filteredAppointments };
    }
    return { appointments: [] }; 
  }
}

export async function getAppointmentById (id: string): Promise<Appointment | undefined> {
  try {
    if (useMockDatabaseData) {
      const appt = mockDB.appointments.find(a => a.id === id);
      if (!appt) return undefined;
      const allServices = [...mockDB.services];
      const populatedAddedServices = appt.addedServices?.map(as => ({
        ...as,
        service: allServices.find(s => s.id === as.serviceId),
        professional: as.professionalId ? mockDB.professionals.find(p => p.id === as.professionalId) : undefined,
      }));
      return {
        ...appt,
        patient: mockDB.patients.find(p => p.id === appt.patientId),
        service: mockDB.services.find(s => s.id === appt.serviceId),
        professional: mockDB.professionals.find(p => p.id === appt.professionalId),
        addedServices: populatedAddedServices,
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
      const servicesSnapshot = await getDocs(collection(firestore, 'servicios'));
      const allServices = servicesSnapshot.docs.map(sDoc => ({ id: sDoc.id, ...convertDocumentData(sDoc.data()) } as Service));

      const [patientData, serviceData, professionalData] = await Promise.all([
          apptData.patientId ? getDoc(doc(firestore, 'pacientes', apptData.patientId)) : Promise.resolve(null),
          apptData.serviceId ? getDoc(doc(firestore, 'servicios', apptData.serviceId)) : Promise.resolve(null),
          apptData.professionalId ? getDoc(doc(firestore, 'profesionales', apptData.professionalId)) : Promise.resolve(null),
        ]);

      const populatedAddedServices = await Promise.all( (apptData.addedServices || []).map(async as => {
        const foundService = allServices.find(s => s.id === as.serviceId);
        let foundProfessional;
        if (as.professionalId) {
            const profDoc = await getDoc(doc(firestore!, 'profesionales', as.professionalId));
            foundProfessional = profDoc.exists() ? {id: profDoc.id, ...convertDocumentData(profDoc.data())} as Professional : undefined;
        }
        return { ...as, service: foundService, professional: foundProfessional };
      }));

      return {
          ...apptData,
          patient: patientData?.exists() ? { id: patientData.id, ...convertDocumentData(patientData.data()) } as Patient : undefined,
          service: serviceData?.exists() ? { id: serviceData.id, ...convertDocumentData(serviceData.data()) } as Service : undefined,
          professional: professionalData?.exists() ? { id: professionalData.id, ...convertDocumentData(professionalData.data()) } as Professional : undefined,
          addedServices: populatedAddedServices
      }
    }
    return undefined;
  } catch (error) {
    console.error("[data.ts] Error in getAppointmentById:", error);
    throw error;
  }
}

export async function getPatientAppointmentHistory (patientId: string): Promise<{appointments: Appointment[]}> {
  try {
    if (useMockDatabaseData) {
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
        const serviceData = apptData.serviceId ? await getDoc(doc(firestore!, 'servicios', apptData.serviceId)) : null;
        const professionalData = apptData.professionalId ? await getDoc(doc(firestore!, 'profesionales', apptData.professionalId)) : null;
        
        let populatedAddedServices = [];
        if (apptData.addedServices && apptData.addedServices.length > 0) {
            const allServicesSnapshot = await getDocs(collection(firestore!, 'servicios'));
            const allServicesList = allServicesSnapshot.docs.map(sDoc => ({id: sDoc.id, ...convertDocumentData(sDoc.data())} as Service));
            populatedAddedServices = await Promise.all(apptData.addedServices.map(async as => {
                const foundService = allServicesList.find(s => s.id === as.serviceId);
                let foundProfessional;
                if (as.professionalId) {
                    const profDoc = await getDoc(doc(firestore!, 'profesionales', as.professionalId));
                    foundProfessional = profDoc.exists() ? {id: profDoc.id, ...convertDocumentData(profDoc.data())} as Professional : undefined;
                }
                return {...as, service: foundService, professional: foundProfessional };
            }));
        }

        return {
            ...apptData,
            service: serviceData?.exists() ? { id: serviceData.id, ...convertDocumentData(serviceData.data()) } as Service : undefined,
            professional: professionalData?.exists() ? { id: professionalData.id, ...convertDocumentData(professionalData.data()) } as Professional : undefined,
            addedServices: populatedAddedServices
        };
    }));
    return {appointments};
  } catch (error) {
      console.error(`[data.ts] Error fetching appointment history for patient ${patientId}:`, error);
      return {appointments: []};
  }
}

export async function addAppointment (data: AppointmentFormData & { isExternalProfessional?: boolean; externalProfessionalOriginLocationId?: LocationId | null; addedServices?: any[] }): Promise<Appointment> {
  console.log(`[data.ts] addAppointment: Iniciando creación. Usando mockDB: ${useMockDatabaseData}.`);
  // console.log(`[data.ts] addAppointment: Datos recibidos:`, JSON.stringify(data, null, 2).substring(0,1000));

  try {
    let service: Service | undefined;
    if (useMockDatabaseData) {
        service = mockDB.services.find(s => s.id === data.serviceId);
    } else if (firestore) {
        const serviceDoc = await getDoc(doc(firestore, 'servicios', data.serviceId));
        if (serviceDoc.exists()) {
            service = {id: serviceDoc.id, ...convertDocumentData(serviceDoc.data())} as Service;
        }
    }
    if (!service) {
      console.error(`[data.ts] addAppointment: Servicio principal con ID ${data.serviceId} no encontrado.`);
      throw new Error(`Servicio principal con ID ${data.serviceId} no encontrado.`);
    }

    const appointmentDateTimeObject = parse(`${format(data.appointmentDate, 'yyyy-MM-dd')} ${data.appointmentTime}`, 'yyyy-MM-dd HH:mm', new Date());
    const appointmentDateTime = formatISO(appointmentDateTimeObject);
    const appointmentDuration = service.defaultDuration || 60;
    const appointmentEndTime = dateFnsAddMinutes(parseISO(appointmentDateTime), appointmentDuration);

    let actualProfessionalId: string | undefined | null = undefined;
    let isExternal = data.isExternalProfessional || false;
    let externalOriginLocId = data.externalProfessionalOriginLocationId || null;

    // console.log(`[data.ts] addAppointment: Buscando profesional. Preferido: ${data.preferredProfessionalId}, SearchExternal: ${data.searchExternal}`);

    if (data.preferredProfessionalId && data.preferredProfessionalId !== '_any_professional_placeholder_') {
      actualProfessionalId = data.preferredProfessionalId;
      const profDetails = useMockDatabaseData
        ? mockDB.professionals.find(p => p.id === actualProfessionalId)
        : await getProfessionalById(actualProfessionalId); 
      if (profDetails && profDetails.locationId !== data.locationId) {
          isExternal = true;
          externalOriginLocId = profDetails.locationId;
          // console.log(`[data.ts] addAppointment: Profesional preferido ${profDetails.firstName} es externo (de ${externalOriginLocId}).`);
      } else if (profDetails) {
          // console.log(`[data.ts] addAppointment: Profesional preferido ${profDetails.firstName} es local.`);
      } else {
        console.warn(`[data.ts] addAppointment: Profesional preferido con ID ${actualProfessionalId} no encontrado.`);
        actualProfessionalId = null; 
      }
    } else {
      // console.log(`[data.ts] addAppointment: No se especificó profesional preferido. Intentando auto-asignación para sede ${data.locationId} en ${format(appointmentDateTimeObject, 'yyyy-MM-dd HH:mm')}. SearchExternal: ${data.searchExternal}`);
      let professionalsToConsider: Professional[];
      if (useMockDatabaseData) {
          professionalsToConsider = data.searchExternal 
              ? mockDB.professionals 
              : mockDB.professionals.filter(p => p.locationId === data.locationId && !p.isManager);
          if (!data.searchExternal) {
              // console.log(`[data.ts] addAppointment (Mock): Buscando profesional disponible solo en la sede: ${data.locationId}. Candidatos (no gerentes): ${professionalsToConsider.length}`);
          }
      } else { 
          const allProfsForConsideration = await getProfessionals(data.searchExternal ? undefined : data.locationId);
          professionalsToConsider = allProfsForConsideration.filter(p => !p.isManager).map(p => p as Professional); 
           if (!data.searchExternal) {
              // console.log(`[data.ts] addAppointment (Firestore): Buscando profesional disponible solo en la sede: ${data.locationId}. Encontrados (no gerentes): ${professionalsToConsider.length}`);
          }
      }
      
      const appointmentsForSlotCheckResponse = await getAppointments({ 
        date: data.appointmentDate,
        locationId: data.searchExternal && !useMockDatabaseData ? 'all' : data.locationId, 
        statuses: [APPOINTMENT_STATUS.BOOKED, APPOINTMENT_STATUS.CONFIRMED] // Considerar completadas tambien para evitar superposicion
      });
      const existingAppointmentsForDay = appointmentsForSlotCheckResponse.appointments || [];
      // console.log(`[data.ts] addAppointment: Citas existentes para el día/sede a verificar superposición: ${existingAppointmentsForDay.length}`);

      for (const prof of professionalsToConsider) {
          if (data.searchExternal && prof.locationId !== data.locationId) {
            // Prioritize local professionals IF available, even if searchExternal is true
            const localProfessionals = professionalsToConsider.filter(p => p.locationId === data.locationId);
            const localProfessionalsAvailable = localProfessionals.some(localProf => {
                const pAvailability = getProfessionalAvailabilityForDate(localProf, data.appointmentDate);
                if (!pAvailability || !pAvailability.startTime || !pAvailability.endTime) return false;
                const pWorkStartTime = parse(`${format(data.appointmentDate, 'yyyy-MM-dd')} ${pAvailability.startTime}`, 'yyyy-MM-dd HH:mm', new Date());
                const pWorkEndTime = parse(`${format(data.appointmentDate, 'yyyy-MM-dd')} ${pAvailability.endTime}`, 'yyyy-MM-dd HH:mm', new Date());
                if (!isWithinInterval(appointmentDateTimeObject, { start: pWorkStartTime, end: dateFnsAddMinutes(pWorkEndTime, -(appointmentDuration -1) ) })) return false;
                
                return !existingAppointmentsForDay.some(existingAppt =>
                    existingAppt.professionalId === localProf.id && !existingAppt.isTravelBlock &&
                    areIntervalsOverlapping(
                        { start: appointmentDateTimeObject, end: appointmentEndTime },
                        { start: parseISO(existingAppt.appointmentDateTime), end: dateFnsAddMinutes(parseISO(existingAppt.appointmentDateTime), existingAppt.durationMinutes) }
                    )
                );
            });
            if (localProfessionalsAvailable) {
                // console.log(`[data.ts] addAppointment: Saltando profesional externo ${prof.firstName} (ID: ${prof.id}) porque hay profesionales locales disponibles.`);
                continue; 
            }
          }

          const availability = getProfessionalAvailabilityForDate(prof, data.appointmentDate);
          // console.log(`[data.ts] addAppointment: Verificando disponibilidad de ${prof.firstName} (ID: ${prof.id}, Sede: ${prof.locationId}). Availability:`, availability ? {...availability} : null);
          if (availability && availability.startTime && availability.endTime) {
              const profWorkStartTime = parse(`${format(data.appointmentDate, 'yyyy-MM-dd')} ${availability.startTime}`, 'yyyy-MM-dd HH:mm', new Date());
              const profWorkEndTime = parse(`${format(data.appointmentDate, 'yyyy-MM-dd')} ${availability.endTime}`, 'yyyy-MM-dd HH:mm', new Date());
              
              // Check if appointment slot is within professional's working hours
              if (!isWithinInterval(appointmentDateTimeObject, { start: profWorkStartTime, end: dateFnsAddMinutes(profWorkEndTime, -(appointmentDuration -1) ) })) { 
                  // console.log(`[data.ts] addAppointment: ${prof.firstName} (ID: ${prof.id}) no disponible: Cita (${format(appointmentDateTimeObject, 'HH:mm')}-${format(appointmentEndTime, 'HH:mm')}) fuera de horario laboral (${availability.startTime}-${availability.endTime}).`);
                  continue;
              }
              
              const isOverlappingExisting = existingAppointmentsForDay.some(existingAppt =>
                  existingAppt.professionalId === prof.id && !existingAppt.isTravelBlock &&
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
                       console.log(`[data.ts] addAppointment: Profesional ${prof.firstName} ${prof.lastName} (ID: ${prof.id}, Externo de ${externalOriginLocId}) auto-asignado.`);
                  } else {
                      // console.log(`[data.ts] addAppointment: Profesional ${prof.firstName} ${prof.lastName} (ID: ${prof.id}, Local) auto-asignado.`);
                  }
                  break; 
              } else {
                // console.log(`[data.ts] addAppointment: ${prof.firstName} (ID: ${prof.id}) está ocupado (superposición).`);
              }
          } else {
            // console.log(`[data.ts] addAppointment: ${prof.firstName} (ID: ${prof.id}) no tiene disponibilidad definida para hoy o no trabaja (Razón: ${availability?.reason}).`);
          }
      }
      if (!actualProfessionalId) {
        console.warn(`[data.ts] addAppointment: No se pudo auto-asignar un profesional disponible para sede ${data.locationId} en el horario solicitado. Se guardará sin profesional.`);
      }
    }

    const newAppointmentData: Omit<Appointment, 'id' | 'patient' | 'service' | 'professional'> = {
      patientId: data.existingPatientId || (await addPatient({ firstName: data.patientFirstName, lastName: data.patientLastName, phone: data.patientPhone, age: data.patientAge, isDiabetic: data.isDiabetic })).id,
      locationId: data.locationId,
      professionalId: actualProfessionalId || null, 
      serviceId: data.serviceId,
      appointmentDateTime,
      durationMinutes: appointmentDuration,
      status: APPOINTMENT_STATUS.BOOKED,
      bookingObservations: data.bookingObservations || undefined,
      createdAt: formatISO(new Date()),
      updatedAt: formatISO(new Date()),
      isExternalProfessional: isExternal,
      externalProfessionalOriginLocationId: externalOriginLocId,
      addedServices: data.addedServices?.map(as => ({
        serviceId: as.serviceId,
        professionalId: as.professionalId || null,
        price: as.price ?? null,
      })) || [],
    };

    if (useMockDatabaseData) {
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
    if (!firestore) {
      console.error("[data.ts] addAppointment: Firestore no está inicializado.");
      throw new Error("Firestore not initialized. Appointment not added.");
    }

    const firestoreData: any = {
      ...newAppointmentData,
      appointmentDateTime: toFirestoreTimestamp(newAppointmentData.appointmentDateTime)!,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      professionalId: newAppointmentData.professionalId ?? null, 
      bookingObservations: newAppointmentData.bookingObservations ?? null,
      externalProfessionalOriginLocationId: newAppointmentData.externalProfessionalOriginLocationId ?? null,
      addedServices: (newAppointmentData.addedServices || []).map(as => ({
        serviceId: as.serviceId,
        professionalId: as.professionalId || null,
        price: as.price === undefined ? null : as.price,
      })),
    };
    firestoreData.amountPaid = firestoreData.amountPaid ?? null;
    firestoreData.paymentMethod = firestoreData.paymentMethod ?? null;
    firestoreData.staffNotes = firestoreData.staffNotes ?? null;
    firestoreData.attachedPhotos = firestoreData.attachedPhotos ?? [];


    const docRef = await addDoc(collection(firestore, 'citas'), firestoreData);
    const createdAppointment = { ...newAppointmentData, id: docRef.id } as Appointment; 
    return createdAppointment; 
  } catch (error) {
    console.error("[data.ts] Error en addAppointment:", error);
    throw error;
  }
}

export async function updateAppointment (id: string, data: Partial<Appointment>): Promise<Appointment | undefined> {
  try {
    const updatePayload: Partial<Appointment> = { ...data };
    
    if ((data as any).appointmentDate && (data as any).appointmentTime && typeof (data as any).appointmentDate === 'object' && typeof (data as any).appointmentTime === 'string') {
        const datePart = (data as any).appointmentDate as Date;
        const timePart = (data as any).appointmentTime as string;
        const [hours, minutes] = timePart.split(':').map(Number);
        if (!isNaN(hours) && !isNaN(minutes)) {
            const finalDateObject = setMinutes(setHours(datePart, hours), minutes);
            updatePayload.appointmentDateTime = formatISO(finalDateObject);
        } else {
            // console.warn("[data.ts] updateAppointment: Invalid timePart for appointmentTime:", timePart);
        }
        delete (updatePayload as any).appointmentDate; 
        delete (updatePayload as any).appointmentTime;
    } else if (data.appointmentDateTime && typeof data.appointmentDateTime !== 'string' && (data.appointmentDateTime instanceof Date)) {
        updatePayload.appointmentDateTime = formatISO(data.appointmentDateTime as unknown as Date);
    }


    if (useMockDatabaseData) {
      const index = mockDB.appointments.findIndex(a => a.id === id);
      if (index === -1) return undefined;
      
      const appointmentToUpdate = {...mockDB.appointments[index], ...updatePayload, updatedAt: formatISO(new Date())};
      mockDB.appointments[index] = appointmentToUpdate;
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
    
    if (firestoreUpdateData.addedServices && Array.isArray(firestoreUpdateData.addedServices)) {
      firestoreUpdateData.addedServices = firestoreUpdateData.addedServices.map((as: any) => ({
        serviceId: as.serviceId,
        professionalId: as.professionalId || null,
        price: as.price === undefined ? null : as.price,
      }));
    }

    const optionalFieldsToNullify = ['bookingObservations', 'actualArrivalTime', 'paymentMethod', 'amountPaid', 'staffNotes', 'professionalId', 'externalProfessionalOriginLocationId'];
    optionalFieldsToNullify.forEach(key => {
        if (firestoreUpdateData.hasOwnProperty(key) && firestoreUpdateData[key] === undefined) {
            firestoreUpdateData[key] = null;
        }
    });
    if (firestoreUpdateData.hasOwnProperty('addedServices') && firestoreUpdateData.addedServices === undefined) {
        firestoreUpdateData.addedServices = [];
    }
    if (firestoreUpdateData.hasOwnProperty('attachedPhotos') && firestoreUpdateData.attachedPhotos === undefined) {
        firestoreUpdateData.attachedPhotos = [];
    }

    await updateDoc(docRef, firestoreUpdateData);
    const updatedDoc = await getDoc(docRef);
    if (!updatedDoc.exists()) {
      return undefined;
    }
    const apptData = { id: updatedDoc.id, ...convertDocumentData(updatedDoc.data()) } as Appointment;
      const servicesSnapshot = await getDocs(collection(firestore, 'servicios'));
      const allServices = servicesSnapshot.docs.map(sDoc => ({ id: sDoc.id, ...convertDocumentData(sDoc.data()) } as Service));
      
      const [patientData, serviceData, professionalData] = await Promise.all([
          apptData.patientId ? getDoc(doc(firestore, 'pacientes', apptData.patientId)) : Promise.resolve(null),
          apptData.serviceId ? getDoc(doc(firestore, 'servicios', apptData.serviceId)) : Promise.resolve(null),
          apptData.professionalId ? getDoc(doc(firestore, 'profesionales', apptData.professionalId)) : Promise.resolve(null),
        ]);

      const populatedAddedServices = await Promise.all( (apptData.addedServices || []).map(async as => {
        const foundService = allServices.find(s => s.id === as.serviceId);
        let foundProfessional;
        if (as.professionalId) {
            const profDoc = await getDoc(doc(firestore!, 'profesionales', as.professionalId));
            foundProfessional = profDoc.exists() ? {id: profDoc.id, ...convertDocumentData(profDoc.data())} as Professional : undefined;
        }
        return { ...as, service: foundService, professional: foundProfessional };
      }));

      return {
          ...apptData,
          patient: patientData?.exists() ? { id: (patientData as any).id, ...convertDocumentData(patientData.data()) } as Patient : undefined,
          service: serviceData?.exists() ? { id: (serviceData as any).id, ...convertDocumentData(serviceData.data()) } as Service : undefined,
          professional: professionalData?.exists() ? { id: (professionalData as any).id, ...convertDocumentData(professionalData.data()) } as Professional : undefined,
          addedServices: populatedAddedServices,
      }
  } catch (error) {
    console.error("[data.ts] Error en updateAppointment:", error);
    throw error;
  }
}

export async function deleteAppointment(appointmentId: string): Promise<boolean> {
  try {
    if (useMockDatabaseData) {
      const initialLength = mockDB.appointments.length;
      mockDB.appointments = mockDB.appointments.filter(appt => appt.id !== appointmentId);
      return mockDB.appointments.length < initialLength;
    }
    if (!firestore) {
      console.error("[data.ts] deleteAppointment: Firestore is not initialized.");
      throw new Error("Firestore not initialized. Appointment not deleted.");
    }
    const docRef = doc(firestore, 'citas', appointmentId);
    await deleteDoc(docRef);
    return true;
  } catch (error) {
    console.error(`[data.ts] Error deleting appointment ${appointmentId}:`, error);
    return false;
  }
}

// --- Periodic Reminders ---
export async function getPeriodicReminders(): Promise<PeriodicReminder[]> {
  try {
    if (useMockDatabaseData) return [...mockDB.periodicReminders].sort((a,b) => parseISO(a.dueDate).getTime() - parseISO(b.dueDate).getTime());
    if (!firestore) {
      console.warn("[data.ts] getPeriodicReminders: Firestore not available, returning mock data.");
      return [...initialMockPeriodicRemindersData].sort((a,b) => parseISO(a.dueDate).getTime() - parseISO(b.dueDate).getTime());
    }
    const snapshot = await getDocs(query(collection(firestore, 'recordatorios'), orderBy('dueDate')));
    if (snapshot.empty && initialMockPeriodicRemindersData.length > 0 && useMockDatabaseData) {
        console.warn("[data.ts] Firestore 'recordatorios' collection is empty. Falling back to mock data for UI stability.");
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
    if (useMockDatabaseData) {
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
    firestoreData.description = firestoreData.description ?? null;
    firestoreData.amount = firestoreData.amount ?? null;

    const docRef = await addDoc(collection(firestore, 'recordatorios'), firestoreData);
    const createdData = await getDoc(docRef);
    if (!createdData.exists()) throw new Error("Failed to create reminder in Firestore");
    return { id: docRef.id, ...convertDocumentData(createdData.data()) } as PeriodicReminder;

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
    
    if (useMockDatabaseData) {
      const index = mockDB.periodicReminders.findIndex(r => r.id === id);
      if (index === -1) return undefined;
      mockDB.periodicReminders[index] = { ...mockDB.periodicReminders[index], ...updateData, updatedAt: formatISO(new Date()) };
      return mockDB.periodicReminders[index];
    }
    if (!firestore) {
      console.error("[data.ts] updatePeriodicReminder: Firestore is not initialized.");
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
    if (useMockDatabaseData) {
      mockDB.periodicReminders = mockDB.periodicReminders.filter(r => r.id !== id);
      return;
    }
    if (!firestore) {
      console.error("[data.ts] deletePeriodicReminder: Firestore is not initialized.");
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
    if (useMockDatabaseData) return [...mockDB.importantNotes].sort((a,b) => parseISO(b.createdAt!).getTime() - parseISO(a.createdAt!).getTime());
    if (!firestore) {
        console.warn("[data.ts] getImportantNotes: Firestore not available, returning mock data.");
        return [...initialMockImportantNotesData].sort((a,b) => parseISO(b.createdAt!).getTime() - parseISO(a.createdAt!).getTime());
    }
    const snapshot = await getDocs(query(collection(firestore, 'notasImportantes'), orderBy('createdAt', 'desc')));
    if (snapshot.empty && initialMockImportantNotesData.length > 0 && useMockDatabaseData) {
         console.warn("[data.ts] Firestore 'notasImportantes' collection is empty. Falling back to mock data for UI stability.");
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
    if (useMockDatabaseData) {
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
    const createdData = await getDoc(docRef);
    if (!createdData.exists()) throw new Error("Failed to create note in Firestore");
    return { id: docRef.id, ...convertDocumentData(createdData.data()) } as ImportantNote;
  } catch (error) {
    console.error("[data.ts] Error in addImportantNote:", error);
    throw error;
  }
}

export async function updateImportantNote(id: string, data: Partial<ImportantNoteFormData>): Promise<ImportantNote | undefined> {
  try {
    if (useMockDatabaseData) {
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
    if (useMockDatabaseData) {
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
  if (useMockDatabaseData) {
    console.warn("[data.ts] seedFirestoreWithMockData: Application is in useMockDatabaseData mode. Seeding to Firestore will not occur as it would be redundant with mockDB.");
    return;
  }
  if (!firestore) {
    console.error("[data.ts] seedFirestoreWithMockData: Firestore is not initialized. Cannot seed data.");
    throw new Error("Firestore not initialized. Seeding aborted.");
  }

  console.log("[data.ts] Starting to seed Firestore with mock data...");
  const batch = writeBatch(firestore);

  try {
    initialMockUsersData.forEach(user => {
      const { id, ...userData } = user;
      const userToSeed: any = { ...userData, password: "admin" }; // Use "admin" for seed
      userToSeed.locationId = userToSeed.locationId ?? null;
      const userRef = doc(firestore, 'usuarios', id);
      batch.set(userRef, userToSeed);
    });
    console.log(`[data.ts] ${initialMockUsersData.length} users prepared for batch.`);

    initialMockServicesData.forEach(service => {
      const { id, ...serviceData } = service;
      const firestoreService: any = {...serviceData};
      firestoreService.price = firestoreService.price ?? null;
      const serviceRef = doc(firestore, 'servicios', id);
      batch.set(serviceRef, firestoreService);
    });
    console.log(`[data.ts] ${initialMockServicesData.length} services prepared for batch.`);
    
    LOCATIONS.forEach(location => {
        const sedeRef = doc(firestore, 'sedes', location.id);
        batch.set(sedeRef, { name: location.name });
    });
    console.log(`[data.ts] ${LOCATIONS.length} sedes prepared for batch.`);

    initialMockProfessionalsData.forEach(prof => {
      const { id, ...profData } = prof;
      const firestoreProfData: any = { ...profData };
      
      if (profData.currentContract && profData.currentContract.startDate && profData.currentContract.endDate) {
        firestoreProfData.currentContract.startDate = toFirestoreTimestamp(profData.currentContract.startDate);
        firestoreProfData.currentContract.endDate = toFirestoreTimestamp(profData.currentContract.endDate);
        firestoreProfData.currentContract.notes = profData.currentContract.notes ?? null;
        firestoreProfData.currentContract.empresa = profData.currentContract.empresa ?? null;
      } else {
        firestoreProfData.currentContract = null;
      }

      firestoreProfData.contractHistory = (profData.contractHistory || []).map(ch => ({
        ...ch,
        id: ch.id || generateId(),
        startDate: toFirestoreTimestamp(ch.startDate),
        endDate: toFirestoreTimestamp(ch.endDate),
        notes: ch.notes ?? null,
        empresa: ch.empresa ?? null,
      }));

      firestoreProfData.customScheduleOverrides = (profData.customScheduleOverrides || []).map(ov => ({
        ...ov,
        id: ov.id || generateId(),
        date: toFirestoreTimestamp(ov.date),
        startTime: ov.startTime ?? null,
        endTime: ov.endTime ?? null,
        notes: ov.notes ?? null,
      }));

      firestoreProfData.phone = firestoreProfData.phone ?? null;
      firestoreProfData.biWeeklyEarnings = firestoreProfData.biWeeklyEarnings ?? 0;
      firestoreProfData.birthDay = firestoreProfData.birthDay ?? null;
      firestoreProfData.birthMonth = firestoreProfData.birthMonth ?? null;
      firestoreProfData.isManager = firestoreProfData.isManager ?? false;


      const profRef = doc(firestore, 'profesionales', id);
      batch.set(profRef, firestoreProfData);
    });
    console.log(`[data.ts] ${initialMockProfessionalsData.length} professionals prepared for batch.`);

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
    console.log(`[data.ts] ${initialMockPatientsData.length} patients prepared for batch.`);

    initialMockAppointmentsData.forEach(appt => {
      const { id, patient, professional, service, ...apptData } = appt; 
      const firestoreApptData: any = { ...apptData };
      firestoreApptData.appointmentDateTime = toFirestoreTimestamp(apptData.appointmentDateTime);
      firestoreApptData.createdAt = apptData.createdAt ? toFirestoreTimestamp(apptData.createdAt) : serverTimestamp();
      firestoreApptData.updatedAt = apptData.updatedAt ? toFirestoreTimestamp(apptData.updatedAt) : serverTimestamp();
      
      firestoreApptData.professionalId = firestoreApptData.professionalId ?? null;
      firestoreApptData.bookingObservations = firestoreApptData.bookingObservations ?? null;
      firestoreApptData.actualArrivalTime = firestoreApptData.actualArrivalTime ?? null;
      firestoreApptData.paymentMethod = firestoreApptData.paymentMethod ?? null;
      firestoreApptData.amountPaid = firestoreApptData.amountPaid ?? null;
      firestoreApptData.staffNotes = firestoreApptData.staffNotes ?? null;
      firestoreApptData.attachedPhotos = firestoreApptData.attachedPhotos ?? [];
      firestoreApptData.addedServices = (firestoreApptData.addedServices || []).map((as: any) => ({
        serviceId: as.serviceId,
        professionalId: as.professionalId || null,
        price: as.price === undefined ? null : as.price,
      }));
      firestoreApptData.isExternalProfessional = firestoreApptData.isExternalProfessional ?? false;
      firestoreApptData.externalProfessionalOriginLocationId = firestoreApptData.externalProfessionalOriginLocationId ?? null;

      const apptRef = doc(firestore, 'citas', id);
      batch.set(apptRef, firestoreApptData);
    });
    console.log(`[data.ts] ${initialMockAppointmentsData.length} appointments prepared for batch.`);

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
    console.log(`[data.ts] ${initialMockPeriodicRemindersData.length} reminders prepared for batch.`);

    initialMockImportantNotesData.forEach(note => {
        const { id, ...noteData } = note;
        const firestoreNoteData: any = {...noteData};
        firestoreNoteData.createdAt = noteData.createdAt ? toFirestoreTimestamp(noteData.createdAt) : serverTimestamp();
        firestoreNoteData.updatedAt = noteData.updatedAt ? toFirestoreTimestamp(noteData.updatedAt) : serverTimestamp();
        
        const noteRef = doc(firestore, 'notasImportantes', id);
        batch.set(noteRef, firestoreNoteData);
    });
    console.log(`[data.ts] ${initialMockImportantNotesData.length} important notes prepared for batch.`);

    await batch.commit();
    console.log("[data.ts] Firestore successfully seeded with all mock data!");

  } catch (error) {
    console.error("[data.ts] Error seeding Firestore with mock data:", error);
    throw error;
  }
};


export {
  mockDB, 
};
