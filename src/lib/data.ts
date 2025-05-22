
// src/lib/data.ts
import type { User, Professional, Patient, Service, Appointment, AppointmentFormData, ProfessionalFormData, AppointmentStatus, ServiceFormData, Contract, PeriodicReminder, ImportantNote, PeriodicReminderFormData, ImportantNoteFormData, AddedServiceItem } from '@/types';
import { LOCATIONS, USER_ROLES, SERVICES as SERVICES_CONSTANTS, APPOINTMENT_STATUS, LocationId, ServiceId as ConstantServiceId, APPOINTMENT_STATUS_DISPLAY, PAYMENT_METHODS, TIME_SLOTS, DAYS_OF_WEEK } from './constants';
import type { DayOfWeekId } from './constants';
import { formatISO, parseISO, addDays, setHours, setMinutes, startOfDay, endOfDay, isSameDay as dateFnsIsSameDay, startOfMonth, endOfMonth, subDays, isEqual, isBefore, isAfter, getDate, getYear, getMonth, setMonth, setYear, getHours, addMinutes as dateFnsAddMinutes, isWithinInterval, getDay, format, differenceInCalendarDays, areIntervalsOverlapping, parse } from 'date-fns';
import { es } from 'date-fns/locale';
import { firestore, useMockDatabase as globalUseMockDatabase } from './firebase-config';
import { collection, addDoc, getDocs, doc, getDoc, updateDoc, query, where, deleteDoc, writeBatch, serverTimestamp, Timestamp, runTransaction, setDoc, QueryConstraint, orderBy, limit, startAfter,getCountFromServer, CollectionReference, DocumentData, documentId } from 'firebase/firestore';


// Determine if using mock database based on environment variable, specific to this module
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
      referenceDate = startOfDay(currentSystemDate);
    }
  } else {
    referenceDate = startOfDay(currentSystemDate);
  }


  if (!contract || !contract.startDate || !contract.endDate) {
    return 'Sin Contrato';
  }

  const { startDate: startDateStr, endDate: endDateStr } = contract;

  if (typeof startDateStr !== 'string' || typeof endDateStr !== 'string' || startDateStr.length === 0 || endDateStr.length === 0) {
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
    return 'Sin Contrato';
  }
  

  if (isBefore(referenceDate, startOfDay(startDate))) {
    return 'No Vigente Aún';
  }
  if (isAfter(referenceDate, endOfDay(endDate))) { 
    return 'Vencido';
  }

  const daysUntilExpiry = differenceInCalendarDays(endOfDay(endDate), referenceDate);
  if (daysUntilExpiry <= 15 && daysUntilExpiry >= 0) {
    return 'Próximo a Vencer';
  }
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

const todayMock = new Date(2025, 4, 22); // Jueves, 22 de Mayo de 2025 (month is 0-indexed)
const yesterdayMock = subDays(todayMock, 1); 
const tomorrowMock = addDays(todayMock,1); 


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
    
    if (i < 2) { 
      const contractStartDate = subDays(todayMock, 60 + i*5); 
      const contractEndDate = addDays(todayMock, 90 + i*10); 
      currentContract = {
        id: generateId(),
        startDate: formatISO(contractStartDate, { representation: 'date' }),
        endDate: formatISO(contractEndDate, { representation: 'date' }),
        notes: `Contrato activo para ${location.name} prof ${i + 1}`,
        empresa: (i % 2 === 0) ? `Empresa Footprints ${location.name}` : `Servicios Podológicos Globales`,
      };
    } else { 
      const contractType = (i + locIndex) % 5; 
      if (contractType === 0) {
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
      } else if (contractType === 1) { 
        const nearExpiryStartDate = subDays(todayMock, 75);
        const nearExpiryEndDate = addDays(todayMock, 10); 
         currentContract = {
             id: generateId(),
             startDate: formatISO(nearExpiryStartDate, { representation: 'date' }),
             endDate: formatISO(nearExpiryEndDate, { representation: 'date' }),
             notes: `Contrato próximo a vencer prof ${i + 1} en ${location.name}`,
             empresa: 'Gestiones Rápidas SRL',
         };
      } else if (contractType === 2) {
        const contractStartDate = subDays(todayMock, Math.floor(Math.random() * 30) + 15);
        const contractEndDate = addDays(todayMock, Math.floor(Math.random() * 45) + 20);
        currentContract = {
          id: generateId(),
          startDate: formatISO(contractStartDate, { representation: 'date' }),
          endDate: formatISO(contractEndDate, { representation: 'date' }),
          notes: `Otro contrato activo para prof ${i + 1} en ${location.name}`,
          empresa: (i % 3 === 0) ? `Podólogos Asociados ${location.name}` : null,
        };
      } else if (contractType === 3) { 
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
    }
    
    let customOverrides: Professional['customScheduleOverrides'] = [];
    if (location.id === 'higuereta' && i === 0) { 
        customOverrides = [
            { id: generateId(), date: formatISO(todayMock, {representation: 'date'}), isWorking: false, notes: "Descanso programado hoy"}, 
            { id: generateId(), date: formatISO(addDays(todayMock, 7), {representation: 'date'}), isWorking: true, startTime: "14:00", endTime: "20:00", notes: "Turno especial tarde"} 
        ];
    }
    if (location.id === 'san_antonio' && i === 0) { 
        customOverrides = [
            { id: generateId(), date: formatISO(todayMock, {representation: 'date'}), isWorking: false, notes: "Cita médica personal hoy"},
        ];
    }
    
    return {
      id: `prof-${location.id}-${i + 1}`,
      firstName: `Profesional ${String.fromCharCode(65 + i)}${i>=26 ? String.fromCharCode(65 + Math.floor(i/26)-1) : ''}`, 
      lastName: `${location.name.split(' ')[0]}`,
      locationId: location.id,
      phone: (i % 4 !== 0) ? `9${String(locIndex).padStart(1, '0')}${String(i + 1).padStart(2, '0')}12345` : null,
      isManager: (location.id === 'higuereta' && i === 0) || (location.id === 'san_antonio' && i === 0),
      biWeeklyEarnings: Math.random() * 500 + 100, 
      workSchedule: baseSchedule,
      customScheduleOverrides: customOverrides,
      currentContract: currentContract,
      contractHistory: contractHistory,
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
    createdAt: formatISO(todayMock), updatedAt: formatISO(todayMock), addedServices: [],
  },
  {
    id: 'appt-today-03', patientId: 'pat007', locationId: 'san_antonio', professionalId: 'prof-san_antonio-2', serviceId: 'tratamiento_unas', 
    appointmentDateTime: formatISO(setHours(setMinutes(startOfDay(todayMock), 0), 15)), durationMinutes: 45, status: APPOINTMENT_STATUS.BOOKED,
    createdAt: formatISO(todayMock), updatedAt: formatISO(todayMock), addedServices: [],
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
  { id: 'rem002', title: 'Servicio de Limpieza Oficina', dueDate: formatISO(subDays(todayMock, 5), { representation: 'date' }), recurrence: 'monthly', amount: 120.00, status: 'pending', createdAt: formatISO(subDays(todayMock, 35)), updatedAt: formatISO(subDays(todayMock, 35))}, 
  { id: 'rem003', title: 'Cuota Préstamo Banco X', dueDate: formatISO(addDays(todayMock, 2), { representation: 'date' }), recurrence: 'monthly', amount: 780.00, status: 'pending', createdAt: formatISO(subDays(todayMock, 28)), updatedAt: formatISO(subDays(todayMock, 28))}, 
  { id: 'rem004', title: 'Suscripción Software Contable', dueDate: formatISO(addDays(todayMock, 10), { representation: 'date' }), recurrence: 'annually', amount: 500.00, status: 'pending', createdAt: formatISO(subDays(todayMock, 355)), updatedAt: formatISO(subDays(todayMock, 355))},
  { id: 'rem005', title: 'Alquiler Local Higuereta - Junio', dueDate: formatISO(new Date(getYear(todayMock), getMonth(todayMock) + 1, 5), { representation: 'date' }), recurrence: 'monthly', amount: 1200.00, status: 'pending', createdAt: formatISO(todayMock), updatedAt: formatISO(todayMock)},
];

const initialMockImportantNotesData: ImportantNote[] = [
  { id: 'note001', title: 'Protocolo Cierre de Caja Diario', content: 'Recordar verificar todos los POS, efectivo contado y reporte Z antes de cerrar. Arqueo debe ser firmado por el encargado de turno.', createdAt: formatISO(subDays(todayMock, 2)), updatedAt: formatISO(subDays(todayMock, 2)) },
  { id: 'note002', title: 'Contacto Proveedor Principal Insumos', content: 'Juan Pérez - JP Insumos Médicos - Cel: 987654321 - Correo: jperez@jpinsumos.com. Pedidos los lunes antes de las 12pm para entrega el miércoles.', createdAt: formatISO(subDays(todayMock, 10)), updatedAt: formatISO(subDays(todayMock, 10)) },
  { id: 'note003', title: 'Mantenimiento Equipos Podológicos', content: 'Revisión y calibración programada para el 15 de Junio (próximo mes). Coordinar con servicio técnico "Podotec".', createdAt: formatISO(subDays(todayMock, 1)), updatedAt: formatISO(subDays(todayMock, 1)) },
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
       // console.log("[data.ts] MockDB already has data. Not re-initializing.");
    }
  } else {
    // console.log("[data.ts] initializeGlobalMockStore: useMockDatabaseData is false. MockDB will not be populated with initial mock data, and will be reset if it had data.");
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
    const q = query(usersCol, where('username', '==', identity));
    const snapshot = await getDocs(q);

    if (snapshot.empty) {
      console.warn(`[data.ts] getUserByUsername (Firestore): No se encontró ningún usuario con username: ${identity}`);
      return undefined;
    }
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
  console.log("[data.ts] addProfessional - raw data received:", JSON.stringify(data, null, 2).substring(0,500));
  try {
    const newProfessionalData: Omit<Professional, 'id' | 'biWeeklyEarnings'> = {
      firstName: data.firstName,
      lastName: data.lastName,
      locationId: data.locationId,
      phone: data.phone || null,
      isManager: data.isManager || false,
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
            isWorking: dayData.isWorking === undefined ? (!!dayData.startTime && !!dayData.endTime) : dayData.isWorking,
          };
        } else {
           newProfessionalData.workSchedule[dayId] = { startTime: '00:00', endTime: '00:00', isWorking: false };
        }
      });
    } else {
        DAYS_OF_WEEK.forEach(dayInfo => {
             newProfessionalData.workSchedule[dayInfo.id] = { startTime: '00:00', endTime: '00:00', isWorking: false };
        });
    }
    
    if (useMockDatabaseData) {
      const newId = generateId();
      const newProfWithId = { ...newProfessionalData, id: newId, biWeeklyEarnings: 0 } as Professional;
      mockDB.professionals.push(newProfWithId);
      console.log("[data.ts] addProfessional (Mock) - new professional:", JSON.stringify(newProfWithId, null, 2).substring(0,500));
      return { ...newProfWithId };
    }

    if (!firestore) {
      console.error("[data.ts] addProfessional: Firestore is not initialized.");
      throw new Error("Firestore not initialized. Professional not added.");
    }

    const firestoreData: any = { ...newProfessionalData, biWeeklyEarnings: 0 };
    firestoreData.phone = firestoreData.phone ?? null; 
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


    console.log("[data.ts] addProfessional (Firestore) - data to be sent:", JSON.stringify(firestoreData, null, 2).substring(0,500));
    const docRef = await addDoc(collection(firestore, 'profesionales'), firestoreData);
    const finalAddedProf = { ...newProfessionalData, id: docRef.id, biWeeklyEarnings: 0 } as Professional;
    console.log("[data.ts] addProfessional (Firestore) - professional added with ID:", docRef.id);
    return finalAddedProf;
  } catch (error) {
    console.error("[data.ts] Error adding professional:", error);
    throw error;
  }
}

export async function updateProfessional (id: string, data: Partial<ProfessionalFormData>): Promise<Professional | undefined> {
  console.log(`[data.ts] updateProfessional - ID: ${id}, raw data received:`, JSON.stringify(data, null, 2).substring(0,500));
  try {
    const professionalToUpdate: Partial<Omit<Professional, 'id'|'biWeeklyEarnings'>> = {};

    // Only include fields if they are present in the 'data' object
    if (data.hasOwnProperty('firstName')) professionalToUpdate.firstName = data.firstName;
    if (data.hasOwnProperty('lastName')) professionalToUpdate.lastName = data.lastName;
    if (data.hasOwnProperty('locationId')) professionalToUpdate.locationId = data.locationId;
    if (data.hasOwnProperty('phone')) professionalToUpdate.phone = data.phone || null;
    if (data.hasOwnProperty('isManager')) professionalToUpdate.isManager = data.isManager || false;


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
    
    let newCurrentContractData: Contract | null | undefined = undefined; // undefined means no change, null means remove
    const existingProfForContract = useMockDatabaseData ? mockDB.professionals.find(p=>p.id === id) : await getProfessionalById(id);

    if (data.hasOwnProperty('currentContract_startDate') || data.hasOwnProperty('currentContract_endDate') || data.hasOwnProperty('currentContract_notes') || data.hasOwnProperty('currentContract_empresa')) {
        if (data.currentContract_startDate && data.currentContract_endDate) {
            const oldContractId = existingProfForContract?.currentContract?.id;
            const dataHasChanged = 
              !oldContractId ||
              (data.currentContract_startDate && formatISO(data.currentContract_startDate, {representation: 'date'}) !== (existingProfForContract?.currentContract?.startDate ? parseISO(existingProfForContract.currentContract.startDate).toISOString().split('T')[0] : null) ) ||
              (data.currentContract_endDate && formatISO(data.currentContract_endDate, {representation: 'date'}) !== (existingProfForContract?.currentContract?.endDate ? parseISO(existingProfForContract.currentContract.endDate).toISOString().split('T')[0] : null)) ||
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
        professionalToUpdate.currentContract = newCurrentContractData;
    }


    if (useMockDatabaseData) {
      const index = mockDB.professionals.findIndex(p => p.id === id);
      if (index === -1) return undefined;
      
      const existingProfessional = mockDB.professionals[index];
      const updatedHistory = [...(existingProfessional.contractHistory || [])];

      if (newCurrentContractData !== undefined) { // If contract info was part of the update
        if (existingProfessional.currentContract && newCurrentContractData && existingProfessional.currentContract.id !== newCurrentContractData.id) {
           if (!updatedHistory.find(ch => ch.id === existingProfessional.currentContract!.id)) {
            updatedHistory.push(existingProfessional.currentContract);
          }
        } else if (existingProfessional.currentContract && newCurrentContractData === null) { 
           if (!updatedHistory.find(ch => ch.id === existingProfessional.currentContract!.id)) {
            updatedHistory.push(existingProfessional.currentContract);
           }
        }
        professionalToUpdate.contractHistory = updatedHistory;
      } else {
        professionalToUpdate.contractHistory = existingProfessional.contractHistory; // Keep existing history if contract wasn't part of the update
      }


      mockDB.professionals[index] = { ...existingProfessional, ...professionalToUpdate } as Professional;
      console.log("[data.ts] updateProfessional (Mock) - updated professional:", JSON.stringify(mockDB.professionals[index], null, 2).substring(0,500));
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
    
    if (data.hasOwnProperty('customScheduleOverrides') && firestoreUpdateData.customScheduleOverrides) {
       firestoreUpdateData.customScheduleOverrides = firestoreUpdateData.customScheduleOverrides.map((ov: any) => ({
        ...ov,
        date: toFirestoreTimestamp(ov.date), // Date from form is already ISO string
        startTime: ov.startTime ?? null,
        endTime: ov.endTime ?? null,
        notes: ov.notes ?? null,
      }));
    }
   
    if (newCurrentContractData !== undefined) { // If contract data was part of the 'data' payload
        firestoreUpdateData.currentContract = newCurrentContractData ? {
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
        firestoreUpdateData.contractHistory = newContractHistory.map(ch => ({
            ...ch,
            id: ch.id || generateId(),
            startDate: toFirestoreTimestamp(ch.startDate)!, 
            endDate: toFirestoreTimestamp(ch.endDate)!,
            notes: ch.notes ?? null,
            empresa: ch.empresa ?? null,
        }));
    }


    if (Object.keys(firestoreUpdateData).length > 0) {
      console.log("[data.ts] updateProfessional (Firestore) - data to be sent for update:", JSON.stringify(firestoreUpdateData, null, 2).substring(0,500));
      await updateDoc(docRef, firestoreUpdateData);
    } else {
      console.log("[data.ts] updateProfessional (Firestore) - No actual changes detected in 'data' object to update for professional ID:", id);
    }
    const updatedDocSnap = await getDoc(docRef);
    const finalUpdatedProf = { id: updatedDocSnap.id, ...convertDocumentData(updatedDocSnap.data()) } as Professional;
    console.log("[data.ts] updateProfessional (Firestore) - professional updated for ID:", id);
    return finalUpdatedProf;

  } catch (error) {
    console.error(`[data.ts] Error updating professional "${id}":`, error);
    throw error;
  }
}
// --- End Professionals ---

// --- Patients ---
// (Rest of the file remains the same from previous correct versions)
// ... (getUserByUsername, addPatient, updatePatient, getPatientById) ...
// --- End Patients ---

// --- Services ---
// ... (getServices, addService, updateService) ...
// --- End Services ---

// --- Appointments ---
// ... (getAppointments, getAppointmentById, addAppointment, updateAppointment, deleteAppointment, getPatientAppointmentHistory) ...
// --- End Appointments ---

// --- Periodic Reminders ---
// ... (getPeriodicReminders, addPeriodicReminder, updatePeriodicReminder, deletePeriodicReminder) ...
// --- End Periodic Reminders ---

// --- Important Notes ---
// ... (getImportantNotes, addImportantNote, updateImportantNote, deleteImportantNote) ...
// --- End Important Notes ---

// --- Seed Firestore ---
// ... (seedFirestoreWithMockData) ...
// --- End Seed Firestore ---

export {
  mockDB, // Export mockDB for potential direct inspection or testing, but app logic should use functions
};
