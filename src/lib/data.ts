
// src/lib/data.ts
import type { User, Professional, Patient, Service, Appointment, AppointmentFormData, ProfessionalFormData, AppointmentStatus, ServiceFormData, Contract, PeriodicReminder, ImportantNote, PeriodicReminderFormData, ImportantNoteFormData } from '@/types';
import { LOCATIONS, USER_ROLES, SERVICES as SERVICES_CONSTANTS, APPOINTMENT_STATUS, LocationId, ServiceId as ConstantServiceId, APPOINTMENT_STATUS_DISPLAY, PAYMENT_METHODS, TIME_SLOTS, DAYS_OF_WEEK } from './constants';
import type { DayOfWeekId } from './constants';
import { formatISO, parseISO, addDays, setHours, setMinutes, startOfDay, endOfDay, isSameDay as dateFnsIsSameDay, startOfMonth, endOfMonth, subDays, isEqual, isBefore, isAfter, getDate, getYear, getMonth, setMonth, setYear, getHours, addMinutes as dateFnsAddMinutes, isWithinInterval, getDay, format, differenceInCalendarDays, areIntervalsOverlapping, parse, differenceInDays } from 'date-fns';
import { es } from 'date-fns/locale';
import { firestore, useMockDatabase as globalUseMockDatabase, app as firebaseApp } from './firebase-config';
import { collection, addDoc, getDocs, doc, getDoc, updateDoc, query, where, deleteDoc, writeBatch, serverTimestamp, Timestamp, runTransaction, setDoc, QueryConstraint, orderBy, limit, startAfter,getCountFromServer, CollectionReference, DocumentData, documentId } from 'firebase/firestore';


// Determine if using mock database based on environment variable
const useMockDatabase = globalUseMockDatabase;

// --- Helper to convert Firestore Timestamps to ISO strings and vice-versa ---
const toFirestoreTimestamp = (date: Date | string | undefined | null): Timestamp | null => {
  if (!date) return null;
  try {
    const d = typeof date === 'string' ? parseISO(date) : date;
    if (isNaN(d.getTime())) {
      console.warn(`Invalid date value provided to toFirestoreTimestamp: ${date}`);
      return null;
    }
    return Timestamp.fromDate(d);
  } catch (error) {
    console.error(`Error converting date to Firestore Timestamp: ${date}`, error);
    return null;
  }
};

const fromFirestoreTimestamp = (timestamp: Timestamp | undefined | null): string | null => {
  if (!timestamp) return null;
  try {
    return timestamp.toDate().toISOString();
  } catch (error) {
    console.error("Error converting Firestore Timestamp to ISO String:", timestamp, error);
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
        // Check for Firestore Timestamp nested objects (like in a map)
        let isNestedTimestampObject = false;
        if (typeof data[key].seconds === 'number' && typeof data[key].nanoseconds === 'number') {
            try {
                const nestedDate = new Timestamp(data[key].seconds, data[key].nanoseconds).toDate();
                if (!isNaN(nestedDate.getTime())) {
                    data[key] = nestedDate.toISOString();
                    isNestedTimestampObject = true;
                }
            } catch (e) {
                // Not a valid Timestamp structure, proceed to recursive call
            }
        }
        if (!isNestedTimestampObject) {
             data[key] = convertDocumentData(data[key]); // Recursive call for nested maps
        }

      } else if (Array.isArray(data[key])) {
        data[key] = data[key].map(item => 
          (item && typeof item === 'object' && !(item instanceof Timestamp) && !(item instanceof Date)) ? convertDocumentData(item) : item
        );
      }
    }
  } catch (error) {
    console.error("Error in convertDocumentData processing key:", error);
    // Potentially return data as-is or handle error more gracefully
  }
  return data;
};
// --- End Helper ---


// --- Initial Mock Data Definitions ---
const generateId = (): string => {
  try {
    return Math.random().toString(36).substr(2, 9) + Date.now().toString(36);
  } catch (error) {
    console.error("Error in generateId:", error);
    return "fallback_id_" + Date.now(); // Fallback
  }
};

const todayMock = new Date(2025, 4, 13); // Tuesday, May 13, 2025 (month is 0-indexed)
const yesterdayMock = subDays(todayMock, 1);
const twoDaysAgoMock = subDays(todayMock, 2);
const tomorrowMock = addDays(todayMock,1);
const fixedFutureDateForRegistry = new Date(2025, 4, 9);
const april15_2025 = new Date(2025, 3, 15);
const april16_2025 = new Date(2025, 3, 16);
const april20_2025 = new Date(2025, 3, 20);
const april22_2025 = new Date(2025, 3, 22);
const april30_2025 = new Date(2025, 3, 30);


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
    // Ensure first two professionals per location have active contracts based on todayMock
    if (i < 2) {
        const contractStartDate = subDays(todayMock, 60); // Active for 2 months already
        const contractEndDate = addDays(todayMock, 90);   // Active for 3 more months
        currentContract = {
            id: generateId(),
            startDate: formatISO(contractStartDate, { representation: 'date' }),
            endDate: formatISO(contractEndDate, { representation: 'date' }),
            notes: `Contrato activo para ${location.name} prof ${i + 1}`,
            empresa: `Empresa Footprints ${location.name}`,
        };
    } else { // For subsequent professionals, vary contract status
        if (i % 4 === 0) { // Another active contract
            const contractStartDate = subDays(todayMock, Math.floor(Math.random() * 30) + 15); // Started 15-45 days ago
            const contractEndDate = addDays(todayMock, Math.floor(Math.random() * 75) + 15); // Ends in 15-90 days
            currentContract = {
                id: generateId(),
                startDate: formatISO(contractStartDate, { representation: 'date' }),
                endDate: formatISO(contractEndDate, { representation: 'date' }),
                notes: `Contrato estándar activo ${i + 1}`,
                empresa: (i % 2 === 0) ? 'Empresa A' : 'Empresa B',
            };
        } else if (i % 4 === 1) { // Expired contract
             const contractStartDate = subDays(todayMock, 120);
             const contractEndDate = subDays(todayMock, 30); // Expired 30 days ago
             currentContract = {
                 id: generateId(),
                 startDate: formatISO(contractStartDate, { representation: 'date' }),
                 endDate: formatISO(contractEndDate, { representation: 'date' }),
                 notes: `Contrato vencido ${i + 1}`,
                 empresa: 'Empresa Expirada C',
             };
        } else if (i % 4 === 2) { // Contract about to expire
            const contractStartDate = subDays(todayMock, 75);
            const contractEndDate = addDays(todayMock, 10); // Expires in 10 days
             currentContract = {
                 id: generateId(),
                 startDate: formatISO(contractStartDate, { representation: 'date' }),
                 endDate: formatISO(contractEndDate, { representation: 'date' }),
                 notes: `Contrato próximo a vencer ${i + 1}`,
                 empresa: 'Empresa D Limitada',
             };
        }
        // if i % 4 === 3, currentContract remains null (no contract)
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
      contractHistory: currentContract && isBefore(parseISO(currentContract.endDate), todayMock) ? [currentContract] : [], // Add to history if expired
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
    id: 'appt001', patientId: 'pat001', locationId: LOCATIONS[0].id, professionalId: initialMockProfessionalsData.find(p => p.locationId === LOCATIONS[0].id && getContractDisplayStatus(p.currentContract, yesterdayMock) === 'Activo')?.id || initialMockProfessionalsData[0]?.id, serviceId: initialMockServicesData[0].id, appointmentDateTime: formatISO(setHours(setMinutes(yesterdayMock, 0), 10)), durationMinutes: initialMockServicesData[0].defaultDuration, status: APPOINTMENT_STATUS.COMPLETED, amountPaid: initialMockServicesData[0].price, paymentMethod: PAYMENT_METHODS[0], staffNotes: "Tratamiento exitoso, paciente refiere mejoría.", attachedPhotos: ["https://placehold.co/200x200.png?text=Appt001" as string], addedServices: [{ serviceId: initialMockServicesData[2].id, price: initialMockServicesData[2].price }], createdAt: formatISO(subDays(yesterdayMock,1)), updatedAt: formatISO(yesterdayMock),
  },
  {
    id: 'appt002', patientId: 'pat002', locationId: LOCATIONS[1].id, professionalId: initialMockProfessionalsData.find(p => p.locationId === LOCATIONS[1].id && getContractDisplayStatus(p.currentContract, todayMock) === 'Activo')?.id || initialMockProfessionalsData[1]?.id, serviceId: initialMockServicesData[1].id, appointmentDateTime: formatISO(setHours(setMinutes(startOfDay(todayMock), 30), 9)), durationMinutes: initialMockServicesData[1].defaultDuration, status: APPOINTMENT_STATUS.BOOKED, bookingObservations: "Paciente refiere dolor agudo.", createdAt: formatISO(subDays(todayMock,1)), updatedAt: formatISO(subDays(todayMock,1)), attachedPhotos: [], addedServices: [],
  },
  {
    id: 'appt003', patientId: 'pat003', locationId: LOCATIONS[0].id, professionalId: initialMockProfessionalsData.find(p => p.locationId === LOCATIONS[0].id && getContractDisplayStatus(p.currentContract, todayMock) === 'Activo' && p.id !== (initialMockProfessionalsData.find(pr => pr.locationId === LOCATIONS[0].id)?.id || initialMockProfessionalsData[0]?.id))?.id || initialMockProfessionalsData[0]?.id, serviceId: initialMockServicesData[2].id, appointmentDateTime: formatISO(setHours(setMinutes(startOfDay(todayMock), 0), 14)), durationMinutes: initialMockServicesData[2].defaultDuration, status: APPOINTMENT_STATUS.CONFIRMED, actualArrivalTime: "13:55", createdAt: formatISO(subDays(todayMock,2)), updatedAt: formatISO(startOfDay(todayMock)), attachedPhotos: ["https://placehold.co/200x200.png?text=Appt003" as string], addedServices: [],
  },
  {
    id: 'appt004', patientId: 'pat004', locationId: LOCATIONS[2].id, professionalId: initialMockProfessionalsData.find(p => p.locationId === LOCATIONS[2].id && getContractDisplayStatus(p.currentContract, twoDaysAgoMock) === 'Activo')?.id || initialMockProfessionalsData[2]?.id, serviceId: initialMockServicesData[3].id, appointmentDateTime: formatISO(setHours(setMinutes(twoDaysAgoMock, 0), 11)), durationMinutes: initialMockServicesData[3].defaultDuration, status: APPOINTMENT_STATUS.COMPLETED, amountPaid: initialMockServicesData[3].price, paymentMethod: PAYMENT_METHODS[1], staffNotes: "Todo en orden. Próxima revisión en 1 mes.", createdAt: formatISO(subDays(twoDaysAgoMock,1)), updatedAt: formatISO(twoDaysAgoMock), attachedPhotos: ["https://placehold.co/200x200.png?text=Appt004_1" as string, "https://placehold.co/200x200.png?text=Appt004_2" as string], addedServices: [],
  },
  {
    id: 'appt005', patientId: 'pat005', locationId: LOCATIONS[1].id, professionalId: null, serviceId: initialMockServicesData[0].id, appointmentDateTime: formatISO(setHours(setMinutes(startOfDay(tomorrowMock), 0), 16)), durationMinutes: initialMockServicesData[0].defaultDuration, status: APPOINTMENT_STATUS.BOOKED, createdAt: formatISO(startOfDay(todayMock)), updatedAt: formatISO(startOfDay(todayMock)), attachedPhotos: [], addedServices: [],
  },
  {
    id: 'appt006', patientId: 'pat001', locationId: LOCATIONS[0].id, professionalId: initialMockProfessionalsData.find(p => p.locationId === LOCATIONS[0].id && getContractDisplayStatus(p.currentContract, todayMock) === 'Activo')?.id || initialMockProfessionalsData[0]?.id, serviceId: initialMockServicesData[4].id, appointmentDateTime: formatISO(setHours(setMinutes(startOfDay(todayMock), 30), 11)), durationMinutes: initialMockServicesData[4].defaultDuration, status: APPOINTMENT_STATUS.BOOKED, bookingObservations: "Estudio de pisada solicitado por el Dr. Pérez.", createdAt: formatISO(startOfDay(todayMock)), updatedAt: formatISO(startOfDay(todayMock)), attachedPhotos: [], addedServices: [],
  },
  { id: 'appt007', patientId: 'pat002', locationId: LOCATIONS[3].id, professionalId: initialMockProfessionalsData.find(p => p.locationId === LOCATIONS[3].id && getContractDisplayStatus(p.currentContract, subDays(startOfDay(todayMock), 3)) === 'Activo')?.id, serviceId: initialMockServicesData[0].id, appointmentDateTime: formatISO(setHours(setMinutes(subDays(startOfDay(todayMock), 3), 0), 15)), durationMinutes: initialMockServicesData[0].defaultDuration, status: APPOINTMENT_STATUS.COMPLETED, amountPaid: initialMockServicesData[0].price, paymentMethod: PAYMENT_METHODS[2], staffNotes: "Paciente nuevo, buena primera impresión.", createdAt: formatISO(subDays(startOfDay(todayMock), 4)), updatedAt: formatISO(subDays(startOfDay(todayMock), 3)), attachedPhotos: ["https://placehold.co/200x200.png?text=Appt007" as string], addedServices: [], },
  { id: 'appt008', patientId: 'pat003', locationId: LOCATIONS[4].id, professionalId: initialMockProfessionalsData.find(p => p.locationId === LOCATIONS[4].id && getContractDisplayStatus(p.currentContract, todayMock) === 'Activo')?.id, serviceId: initialMockServicesData[1].id, appointmentDateTime: formatISO(setHours(setMinutes(startOfDay(todayMock), 0), 10)), durationMinutes: initialMockServicesData[1].defaultDuration, status: APPOINTMENT_STATUS.BOOKED, createdAt: formatISO(subDays(startOfDay(todayMock), 1)), updatedAt: formatISO(subDays(startOfDay(todayMock), 1)), attachedPhotos: [], addedServices: [], },
  { id: 'appt009', patientId: 'pat004', locationId: LOCATIONS[5].id, professionalId: initialMockProfessionalsData.find(p => p.locationId === LOCATIONS[5].id && getContractDisplayStatus(p.currentContract, subDays(startOfDay(todayMock), 5)) === 'Activo')?.id, serviceId: initialMockServicesData[2].id, appointmentDateTime: formatISO(setHours(setMinutes(subDays(startOfDay(todayMock), 5), 30), 14)), durationMinutes: initialMockServicesData[2].defaultDuration, status: APPOINTMENT_STATUS.COMPLETED, amountPaid: initialMockServicesData[2].price ? initialMockServicesData[2].price! + 20 : 70, paymentMethod: PAYMENT_METHODS[3], staffNotes: "Se realizó quiropodia y tratamiento adicional para uña encarnada.", addedServices: [{ serviceId: initialMockServicesData[1].id, price: 20 }], attachedPhotos: ["https://placehold.co/200x200.png?text=Appt009" as string], createdAt: formatISO(subDays(startOfDay(todayMock), 6)), updatedAt: formatISO(subDays(startOfDay(todayMock), 5)), },
  { id: 'appt010', patientId: 'pat005', locationId: LOCATIONS[0].id, serviceId: initialMockServicesData[3].id, appointmentDateTime: formatISO(setHours(setMinutes(addDays(startOfDay(todayMock), 2), 0), 17)), durationMinutes: initialMockServicesData[3].defaultDuration, status: APPOINTMENT_STATUS.BOOKED, preferredProfessionalId: initialMockProfessionalsData.find(p => p.locationId === LOCATIONS[0].id && p.lastName.includes('Higuereta') && getContractDisplayStatus(p.currentContract, addDays(startOfDay(todayMock), 2)) === 'Activo' )?.id, bookingObservations: "Solo puede por la tarde.", createdAt: formatISO(startOfDay(todayMock)), updatedAt: formatISO(startOfDay(todayMock)), attachedPhotos: [], addedServices: [], },

  { id: 'appt_registry_test_1', patientId: initialMockPatientsData[0].id, locationId: LOCATIONS[0].id, professionalId: initialMockProfessionalsData.find(p => p.locationId === LOCATIONS[0].id && p.firstName === 'Profesional 1' && getContractDisplayStatus(p.currentContract, fixedFutureDateForRegistry) === 'Activo')?.id, serviceId: initialMockServicesData[0].id, appointmentDateTime: formatISO(setHours(setMinutes(fixedFutureDateForRegistry, 0), 10)), durationMinutes: initialMockServicesData[0].defaultDuration, status: APPOINTMENT_STATUS.COMPLETED, amountPaid: initialMockServicesData[0].price, paymentMethod: PAYMENT_METHODS[0], createdAt: formatISO(fixedFutureDateForRegistry), updatedAt: formatISO(fixedFutureDateForRegistry), addedServices: [], attachedPhotos: [] },
  { id: 'appt_registry_test_2', patientId: initialMockPatientsData[1].id, locationId: LOCATIONS[1].id, professionalId: initialMockProfessionalsData.find(p => p.locationId === LOCATIONS[1].id && p.firstName === 'Profesional 1' && getContractDisplayStatus(p.currentContract, fixedFutureDateForRegistry) === 'Activo')?.id, serviceId: initialMockServicesData[1].id, appointmentDateTime: formatISO(setHours(setMinutes(fixedFutureDateForRegistry, 30), 11)), durationMinutes: initialMockServicesData[1].defaultDuration, status: APPOINTMENT_STATUS.COMPLETED, amountPaid: initialMockServicesData[1].price, paymentMethod: PAYMENT_METHODS[1], createdAt: formatISO(fixedFutureDateForRegistry), updatedAt: formatISO(fixedFutureDateForRegistry), addedServices: [], attachedPhotos: [] },
  { id: 'appt_registry_test_3', patientId: initialMockPatientsData[2].id, locationId: LOCATIONS[0].id, professionalId: initialMockProfessionalsData.find(p => p.locationId === LOCATIONS[0].id && p.firstName === 'Profesional 2' && getContractDisplayStatus(p.currentContract, fixedFutureDateForRegistry) === 'Activo')?.id, serviceId: initialMockServicesData[2].id, appointmentDateTime: formatISO(setHours(setMinutes(fixedFutureDateForRegistry, 0), 14)), durationMinutes: initialMockServicesData[2].defaultDuration, status: APPOINTMENT_STATUS.COMPLETED, amountPaid: initialMockServicesData[2].price, paymentMethod: PAYMENT_METHODS[2], createdAt: formatISO(fixedFutureDateForRegistry), updatedAt: formatISO(fixedFutureDateForRegistry), addedServices: [], attachedPhotos: [] },
  {
    id: 'appt_april_001',
    patientId: 'pat001',
    locationId: LOCATIONS[0].id,
    professionalId: initialMockProfessionalsData.find(p => p.id === 'prof-higuereta-1' && getContractDisplayStatus(p.currentContract, april20_2025) === 'Activo')?.id,
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
    professionalId: initialMockProfessionalsData.find(p => p.id === 'prof-san_antonio-1' && getContractDisplayStatus(p.currentContract, april22_2025) === 'Activo')?.id,
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
  {
    id: 'appt_today_hig_1',
    patientId: 'pat001',
    locationId: 'higuereta',
    professionalId: initialMockProfessionalsData.find(p => p.id === 'prof-higuereta-1' && getContractDisplayStatus(p.currentContract, todayMock) === 'Activo')?.id,
    serviceId: initialMockServicesData[0].id,
    appointmentDateTime: formatISO(setHours(setMinutes(startOfDay(todayMock), 0), 10)),
    durationMinutes: 30,
    status: APPOINTMENT_STATUS.BOOKED,
    createdAt: formatISO(subDays(todayMock, 1)),
    updatedAt: formatISO(subDays(todayMock, 1)),
    attachedPhotos: [],
    addedServices: []
  },
  {
    id: 'appt_today_hig_2',
    patientId: 'pat002',
    locationId: 'higuereta',
    professionalId: initialMockProfessionalsData.find(p => p.id === 'prof-higuereta-2' && getContractDisplayStatus(p.currentContract, todayMock) === 'Activo')?.id,
    serviceId: initialMockServicesData[1].id,
    appointmentDateTime: formatISO(setHours(setMinutes(startOfDay(todayMock), 30), 10)),
    durationMinutes: 45,
    status: APPOINTMENT_STATUS.CONFIRMED,
    actualArrivalTime: "10:25",
    createdAt: formatISO(subDays(todayMock, 1)),
    updatedAt: formatISO(startOfDay(todayMock)),
    attachedPhotos: [],
    addedServices: []
  },
  {
    id: 'appt_past_completed_1',
    patientId: 'pat003',
    locationId: 'san_antonio',
    professionalId: initialMockProfessionalsData.find(p => p.id === 'prof-san_antonio-1' && getContractDisplayStatus(p.currentContract, subDays(startOfDay(todayMock), 7)) === 'Activo')?.id,
    serviceId: initialMockServicesData[2].id,
    appointmentDateTime: formatISO(setHours(setMinutes(subDays(startOfDay(todayMock), 7), 0), 14)),
    durationMinutes: 60,
    status: APPOINTMENT_STATUS.COMPLETED,
    amountPaid: 80,
    paymentMethod: 'Efectivo',
    staffNotes: "Paciente satisfecho con el tratamiento.",
    createdAt: formatISO(subDays(todayMock, 8)),
    updatedAt: formatISO(subDays(todayMock, 7)),
    attachedPhotos: ["https://placehold.co/200x200.png?text=PastAppt1" as string],
    addedServices: []
  },
  {
    id: 'appt_upcoming_1',
    patientId: 'pat004',
    locationId: 'eden_benavides',
    professionalId: initialMockProfessionalsData.find(p => p.id === 'prof-eden_benavides-1' && getContractDisplayStatus(p.currentContract, addDays(startOfDay(todayMock), 3)) === 'Activo')?.id,
    serviceId: initialMockServicesData[0].id,
    appointmentDateTime: formatISO(setHours(setMinutes(addDays(startOfDay(todayMock), 3), 0), 16)),
    durationMinutes: 30,
    status: APPOINTMENT_STATUS.BOOKED,
    bookingObservations: "Recordar traer exámenes anteriores.",
    createdAt: formatISO(startOfDay(todayMock)),
    updatedAt: formatISO(startOfDay(todayMock)),
    attachedPhotos: [],
    addedServices: []
  },
  { id: 'appt_2nd_quin_april_hig_1', patientId: 'pat001', locationId: 'higuereta', professionalId: initialMockProfessionalsData.find(p => p.id === 'prof-higuereta-1' && getContractDisplayStatus(p.currentContract, new Date(2025, 3, 18)) === 'Activo')?.id, serviceId: initialMockServicesData[0].id, appointmentDateTime: formatISO(setHours(setMinutes(new Date(2025, 3, 18), 0), 10)), durationMinutes: 30, status: APPOINTMENT_STATUS.COMPLETED, amountPaid: 60, paymentMethod: 'Efectivo', createdAt: formatISO(new Date(2025, 3, 18)), updatedAt: formatISO(new Date(2025, 3, 18)) },
  { id: 'appt_2nd_quin_april_sa_1', patientId: 'pat004', locationId: 'san_antonio', professionalId: initialMockProfessionalsData.find(p => p.id === 'prof-san_antonio-1' && getContractDisplayStatus(p.currentContract, new Date(2025, 3, 25)) === 'Activo')?.id, serviceId: initialMockServicesData[1].id, appointmentDateTime: formatISO(setHours(setMinutes(new Date(2025, 3, 25), 0), 15)), durationMinutes: 45, status: APPOINTMENT_STATUS.COMPLETED, amountPaid: 70, paymentMethod: 'Tarjeta de Crédito', createdAt: formatISO(new Date(2025, 3, 25)), updatedAt: formatISO(new Date(2025, 3, 25)) },
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
  try {
    if (typeof window !== 'undefined') {
      if (!(window as any).__globalMockDB) {
        (window as any).__globalMockDB = {
          users: JSON.parse(JSON.stringify(initialMockUsersData)),
          professionals: JSON.parse(JSON.stringify(initialMockProfessionalsData)),
          patients: JSON.parse(JSON.stringify(initialMockPatientsData)),
          services: JSON.parse(JSON.stringify(initialMockServicesData)),
          appointments: JSON.parse(JSON.stringify(initialMockAppointmentsData)),
          periodicReminders: JSON.parse(JSON.stringify(initialMockPeriodicRemindersData)),
          importantNotes: JSON.parse(JSON.stringify(initialMockImportantNotesData)),
        };
      }
      return (window as any).__globalMockDB;
    } else {
      if (!globalMockDB) {
        globalMockDB = {
          users: JSON.parse(JSON.stringify(initialMockUsersData)),
          professionals: JSON.parse(JSON.stringify(initialMockProfessionalsData)),
          patients: JSON.parse(JSON.stringify(initialMockPatientsData)),
          services: JSON.parse(JSON.stringify(initialMockServicesData)),
          appointments: JSON.parse(JSON.stringify(initialMockAppointmentsData)),
          periodicReminders: JSON.parse(JSON.stringify(initialMockPeriodicRemindersData)),
          importantNotes: JSON.parse(JSON.stringify(initialMockImportantNotesData)),
        };
      }
      return globalMockDB;
    }
  } catch (error) {
    console.error("Error initializing global mock store:", error);
    // Return a default empty structure if initialization fails
    return {
      users: [], professionals: [], patients: [], services: [], appointments: [], periodicReminders: [], importantNotes: []
    };
  }
}

const mockDB = initializeGlobalMockStore();

// --- Helper to convert a Firestore document snapshot to a typed object ---
interface BaseEntity { id: string; }

const docToData = <T extends BaseEntity>(docSnap: any): T | undefined => {
  try {
    if (!docSnap.exists()) return undefined;
    return { id: docSnap.id, ...convertDocumentData(docSnap.data()) } as T;
  } catch (error) {
    console.error("Error in docToData:", error);
    return undefined;
  }
};

const docsToData = <T extends BaseEntity>(querySnapshot: any): T[] => {
  try {
    return querySnapshot.docs.map((docSnap: any) => ({ id: docSnap.id, ...convertDocumentData(docSnap.data()) } as T));
  } catch (error) {
    console.error("Error in docsToData:", error);
    return [];
  }
};


// --- Auth ---
export const getUserByUsername = async (username: string): Promise<User | undefined> => {
  try {
    if (useMockDatabase) {
        return mockDB.users.find(u => u.username === username);
    }
    if (!firestore) {
      console.warn("Firestore not initialized in getUserByUsername. Using mock as fallback.");
      return mockDB.users.find(u => u.username === username);
    }
    const usersCol = collection(firestore, 'usuarios');
    const q = query(usersCol, where('username', '==', username));
    const snapshot = await getDocs(q);
    if (snapshot.empty) return undefined;
    return { id: snapshot.docs[0].id, ...convertDocumentData(snapshot.docs[0].data()) } as User;
  } catch (error) {
    console.error("Error in getUserByUsername:", error);
    return undefined;
  }
};

// --- Professionals ---
export type ContractDisplayStatus = 'Activo' | 'Próximo a Vencer' | 'Vencido' | 'Sin Contrato';

export const getContractDisplayStatus = (contract: Contract | null | undefined, referenceDateParam?: Date): ContractDisplayStatus => {
  try {
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
  } catch (error) {
    console.error("Error in getContractDisplayStatus:", error);
    return 'Sin Contrato'; // Fallback
  }
};


export const getProfessionals = async (locationId?: LocationId): Promise<(Professional & { contractDisplayStatus: ContractDisplayStatus })[]> => {
  const currentReferenceDate = new Date();
  try {
    if (useMockDatabase) {
        let professionalsResult = locationId
            ? mockDB.professionals.filter(p => p.locationId === locationId)
            : [...mockDB.professionals];

        const { start: quincenaStart, end: quincenaEnd } = getCurrentQuincenaDateRange();

        const appointmentsForPeriod = (mockDB.appointments || []).filter(appt => {
            const apptDate = parseISO(appt.appointmentDateTime);
            return appt.status === APPOINTMENT_STATUS.COMPLETED &&
                   isWithinInterval(apptDate, { start: startOfDay(quincenaStart), end: endOfDay(quincenaEnd) }) &&
                   (locationId ? appt.locationId === locationId : true);
        });
        return professionalsResult.map(prof => {
            const profAppointments = appointmentsForPeriod.filter(appt => appt.professionalId === prof.id);
            const earnings = profAppointments.reduce((sum, appt) => sum + (appt.amountPaid || 0), 0);
            return ({
                ...prof,
                biWeeklyEarnings: earnings,
                contractDisplayStatus: getContractDisplayStatus(prof.currentContract, currentReferenceDate)
            })
        }).sort((a,b) => `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`));
    }

    if (!firestore) {
      console.warn("Firestore not initialized in getProfessionals. Falling back to mock data.");
      return mockDB.professionals.map(p => ({ ...p, contractDisplayStatus: getContractDisplayStatus(p.currentContract, currentReferenceDate) })).sort((a,b) => `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`));
    }

    const professionalsCol = collection(firestore, 'profesionales');
    let qConstraints: QueryConstraint[] = [];
    if (locationId) {
      qConstraints.push(where('locationId', '==', locationId));
    }
    qConstraints.push(orderBy('firstName'), orderBy('lastName'));
    const q = query(professionalsCol, ...qConstraints);
    const snapshot = await getDocs(q);
    let professionalsList = snapshot.docs.map(d => ({ id: d.id, ...convertDocumentData(d.data()) }) as Professional);

    const { start: quincenaStart, end: quincenaEnd } = getCurrentQuincenaDateRange();
    const appointmentsCol = collection(firestore, 'citas');
    const appointmentsQueryConstraints: QueryConstraint[] = [
        where('status', '==', APPOINTMENT_STATUS.COMPLETED),
        where('appointmentDateTime', '>=', toFirestoreTimestamp(startOfDay(quincenaStart))!),
        where('appointmentDateTime', '<=', toFirestoreTimestamp(endOfDay(quincenaEnd))!),
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
            contractDisplayStatus: getContractDisplayStatus(prof.currentContract, currentReferenceDate)
        })
    });
  } catch (error) {
    console.error("Error in getProfessionals:", error);
    return []; // Fallback
  }
};

export const getProfessionalById = async (id: string): Promise<Professional | undefined> => {
  const currentReferenceDate = new Date();
  try {
    if (useMockDatabase) {
        const prof = mockDB.professionals.find(p => p.id === id);
        return prof ? { ...prof, contractDisplayStatus: getContractDisplayStatus(prof.currentContract, currentReferenceDate) } : undefined;
    }
    if (!firestore) {
      console.warn("Firestore not initialized in getProfessionalById. Falling back to mock data for ID:", id);
      const prof = mockDB.professionals.find(p => p.id === id);
      return prof ? { ...prof, contractDisplayStatus: getContractDisplayStatus(prof.currentContract, currentReferenceDate) } : undefined;
    }
    const docRef = doc(firestore, 'profesionales', id);
    const docSnap = await getDoc(docRef);
    if (!docSnap.exists()) return undefined;
    const profData = { id: docSnap.id, ...convertDocumentData(docSnap.data()) } as Professional;
    return { ...profData, contractDisplayStatus: getContractDisplayStatus(profData.currentContract, currentReferenceDate) };
  } catch (error) {
    console.error(`Error in getProfessionalById for ID ${id}:`, error);
    return undefined;
  }
};

export const addProfessional = async (data: ProfessionalFormData): Promise<Professional> => {
  const newId = data.id || generateId();
  try {
    if (useMockDatabase) {
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
          phone: data.phone === undefined ? undefined : (data.phone || undefined),
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
        id: newId,
        ...professionalToSave,
        biWeeklyEarnings: 0,
      };
      mockDB.professionals.push(newProfessional);
      return newProfessional;
    }

    if (!firestore) throw new Error("Firestore not initialized in addProfessional");

    const { id, ...professionalData } = data;
    const dataToSave: any = { ...professionalData };
    dataToSave.phone = dataToSave.phone === undefined ? null : (dataToSave.phone || null);
    dataToSave.currentContract_notes = dataToSave.currentContract_notes === undefined ? null : (dataToSave.currentContract_notes || null);
    dataToSave.currentContract_empresa = dataToSave.currentContract_empresa === undefined ? null : (dataToSave.currentContract_empresa || null);


    let currentContractForFirestore: any = null;
    if (dataToSave.currentContract_startDate && dataToSave.currentContract_endDate) {
        currentContractForFirestore = {
            id: generateId(),
            startDate: toFirestoreTimestamp(dataToSave.currentContract_startDate),
            endDate: toFirestoreTimestamp(dataToSave.currentContract_endDate),
            notes: dataToSave.currentContract_notes,
            empresa: dataToSave.currentContract_empresa,
        }
    }
    dataToSave.currentContract = currentContractForFirestore;
    delete dataToSave.currentContract_startDate;
    delete dataToSave.currentContract_endDate;
    delete dataToSave.currentContract_notes;
    delete dataToSave.currentContract_empresa;


    if (dataToSave.customScheduleOverrides) {
        dataToSave.customScheduleOverrides = dataToSave.customScheduleOverrides.map((ov: any) => ({
            ...ov,
            date: toFirestoreTimestamp(ov.date)
        }));
    } else {
        dataToSave.customScheduleOverrides = [];
    }

    const workScheduleForFirestore: any = {};
    if (dataToSave.workSchedule) {
        for (const dayId_raw in dataToSave.workSchedule) {
            const dayId = dayId_raw as DayOfWeekId;
            workScheduleForFirestore[dayId] = dataToSave.workSchedule[dayId] || { isWorking: false, startTime: '00:00', endTime: '00:00' };
        }
    }
    dataToSave.workSchedule = workScheduleForFirestore;
    dataToSave.contractHistory = dataToSave.contractHistory || [];
    dataToSave.biWeeklyEarnings = 0;


    const docRef = doc(firestore, 'profesionales', newId);
    await setDoc(docRef, dataToSave);
    const savedDoc = await getDoc(docRef);
    return { id: newId, ...convertDocumentData(savedDoc.data()!) } as Professional;
  } catch (error) {
    console.error("Error in addProfessional:", error);
    throw error; // Re-throw
  }
};

export const updateProfessional = async (id: string, data: Partial<ProfessionalFormData>): Promise<Professional | undefined> => {
  try {
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
    delete dataToUpdate.id;

    dataToUpdate.phone = data.phone === null ? null : (data.phone ?? undefined); // Use undefined to remove field if explicitly set to empty string and it was optional
    dataToUpdate.currentContract_notes = data.currentContract_notes === null ? null : (data.currentContract_notes ?? undefined);
    dataToUpdate.currentContract_empresa = data.currentContract_empresa === null ? null : (data.currentContract_empresa ?? undefined);


    if (data.customScheduleOverrides) {
        dataToUpdate.customScheduleOverrides = data.customScheduleOverrides.map((ov: any) => ({
            ...ov,
            date: toFirestoreTimestamp(ov.date)
        }));
    }

    if (data.workSchedule) {
        const workScheduleForFirestore: any = {};
        for (const dayId_raw in data.workSchedule) {
            const dayId = dayId_raw as DayOfWeekId;
            workScheduleForFirestore[dayId] = data.workSchedule[dayId] || { isWorking: false, startTime: '00:00', endTime: '00:00' };
        }
        dataToUpdate.workSchedule = workScheduleForFirestore;
    }

    const currentProfDoc = await getDoc(docRef);
    if (currentProfDoc.exists()) {
        const currentProfData = convertDocumentData(currentProfDoc.data()) as Professional;
        let contractHistory = currentProfData.contractHistory || [];
        let currentContractForFirestore: any = currentProfData.currentContract;

        let contractFieldsTouchedInPayload = false;
        const newProposedContractData: Partial<Contract> = {};

        if (data.hasOwnProperty('currentContract_startDate')) {
            newProposedContractData.startDate = data.currentContract_startDate ? formatISO(data.currentContract_startDate, { representation: 'date' }) : undefined;
            contractFieldsTouchedInPayload = true;
        }
        if (data.hasOwnProperty('currentContract_endDate')) {
            newProposedContractData.endDate = data.currentContract_endDate ? formatISO(data.currentContract_endDate, { representation: 'date' }) : undefined;
            contractFieldsTouchedInPayload = true;
        }
        if (data.hasOwnProperty('currentContract_notes')) {
            newProposedContractData.notes = data.currentContract_notes === null ? undefined : (data.currentContract_notes ?? undefined);
            contractFieldsTouchedInPayload = true;
        }
        if (data.hasOwnProperty('currentContract_empresa')) {
            newProposedContractData.empresa = data.currentContract_empresa === null ? undefined : (data.currentContract_empresa ?? undefined);
            contractFieldsTouchedInPayload = true;
        }

        if (contractFieldsTouchedInPayload) {
            const oldContract = currentProfData.currentContract;
            const isCreatingNewContractInstance =
                (newProposedContractData.startDate && newProposedContractData.endDate) &&
                (!oldContract ||
                 oldContract.startDate !== newProposedContractData.startDate ||
                 oldContract.endDate !== newProposedContractData.endDate ||
                 (oldContract.notes || '') !== (newProposedContractData.notes || '') ||
                 (oldContract.empresa || '') !== (newProposedContractData.empresa || '')
                );

            if (isCreatingNewContractInstance) {
                if (oldContract && oldContract.id && !contractHistory.find(h => h.id === oldContract.id)) {
                    contractHistory.push(oldContract);
                }
                currentContractForFirestore = {
                    id: generateId(),
                    startDate: newProposedContractData.startDate!,
                    endDate: newProposedContractData.endDate!,
                    notes: newProposedContractData.notes,
                    empresa: newProposedContractData.empresa,
                };
            } else if (oldContract && (newProposedContractData.startDate !== undefined || newProposedContractData.endDate !== undefined || newProposedContractData.notes !== undefined || newProposedContractData.empresa !== undefined)) {
                 currentContractForFirestore = {
                    ...oldContract,
                    startDate: newProposedContractData.startDate !== undefined ? newProposedContractData.startDate : oldContract.startDate,
                    endDate: newProposedContractData.endDate !== undefined ? newProposedContractData.endDate : oldContract.endDate,
                    notes: newProposedContractData.notes !== undefined ? newProposedContractData.notes : oldContract.notes,
                    empresa: newProposedContractData.empresa !== undefined ? newProposedContractData.empresa : oldContract.empresa,
                };
            } else if ((!newProposedContractData.startDate || !newProposedContractData.endDate) && contractFieldsTouchedInPayload) {
                 if (oldContract && oldContract.id && !contractHistory.find(h => h.id === oldContract.id)) {
                    contractHistory.push(oldContract);
                 }
                currentContractForFirestore = null;
            }
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
    }

    // Remove fields from dataToUpdate that were only for form handling
    delete dataToUpdate.currentContract_startDate;
    delete dataToUpdate.currentContract_endDate;
    delete dataToUpdate.currentContract_notes;
    delete dataToUpdate.currentContract_empresa;

    await updateDoc(docRef, dataToUpdate);
    const updatedDocSnap = await getDoc(docRef);
    return updatedDocSnap.exists() ? { id: updatedDocSnap.id, ...convertDocumentData(updatedDocSnap.data()) } as Professional : undefined;
  } catch (error) {
    console.error(`Error in updateProfessional for ID ${id}:`, error);
    throw error; // Re-throw
  }
};

// --- Patients ---
const PATIENTS_PER_PAGE = 8;
export const getPatients = async (options: { page?: number, limit?: number, searchTerm?: string, filterToday?: boolean, adminSelectedLocation?: LocationId | 'all', user?: User | null, lastVisiblePatientId?: string | null } = {}): Promise<{patients: Patient[], totalCount: number, lastVisiblePatientId?: string | null}> => {
  const { page = 1, limit: queryLimit = PATIENTS_PER_PAGE, searchTerm, filterToday, adminSelectedLocation, user, lastVisiblePatientId: startAfterId } = options;

  try {
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
          const todayForFilter = startOfDay(new Date()); // Use actual today
          const isAdminOrContador = user.role === USER_ROLES.ADMIN || user.role === USER_ROLES.CONTADOR;
          const effectiveLocationId = isAdminOrContador
          ? (adminSelectedLocation === 'all' ? undefined : adminSelectedLocation)
          : user.locationId;

          const dailyAppointments = (mockDB.appointments || []).filter(appt =>
            appt.appointmentDateTime && dateFnsIsSameDay(parseISO(appt.appointmentDateTime), todayForFilter) &&
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
        const mockResult = mockDB.patients.sort((a,b) => `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`));
        return { patients: mockResult.slice(0, queryLimit), totalCount: mockResult.length, lastVisiblePatientId: mockResult[queryLimit-1]?.id || null };
    }

    const patientsCol = collection(firestore, 'pacientes') as CollectionReference<Omit<Patient, 'id'>>;
    let qConstraints: QueryConstraint[] = [];


    if (filterToday && user) {
        const todayForFilterFirestore = startOfDay(new Date()); // Use actual today
        const isAdminOrContador = user.role === USER_ROLES.ADMIN || user.role === USER_ROLES.CONTADOR;
        const effectiveLocationId = isAdminOrContador ? (adminSelectedLocation === 'all' ? undefined : adminSelectedLocation) : user.locationId;

        const appointmentsTodayCol = collection(firestore, 'citas');
        let apptQueryConstraints: QueryConstraint[] = [
          where('appointmentDateTime', '>=', toFirestoreTimestamp(startOfDay(todayForFilterFirestore))!),
          where('appointmentDateTime', '<=', toFirestoreTimestamp(endOfDay(todayForFilterFirestore))!),
          where('status', 'in', [APPOINTMENT_STATUS.BOOKED, APPOINTMENT_STATUS.CONFIRMED])
        ];
        if (effectiveLocationId) {
            apptQueryConstraints.push(where('locationId', '==', effectiveLocationId));
        }
        const dailyAppointmentsSnap = await getDocs(query(appointmentsTodayCol, ...apptQueryConstraints));
        const patientIdsWithAppointmentsToday = new Set(dailyAppointmentsSnap.docs.map(d => d.data().patientId as string));

        if (patientIdsWithAppointmentsToday.size === 0) return { patients: [], totalCount: 0, lastVisiblePatientId: null };
        
        const patientIdsArray = Array.from(patientIdsWithAppointmentsToday);
        // Firestore 'in' query limit is 30 values.
        if (patientIdsArray.length > 0 && patientIdsArray.length <= 30) {
            qConstraints.push(where(documentId(), 'in', patientIdsArray));
        } else if (patientIdsArray.length > 30) {
            // Handle more than 30 patient IDs (e.g., multiple queries or different strategy)
            console.warn("More than 30 patients with appointments today. Patient list may be incomplete due to Firestore 'in' query limits. Fetching all and filtering client-side for now.");
            // Fallback: fetch all (or a larger set) and filter client-side, or implement pagination for this specific case.
            // For now, we'll proceed without this specific 'in' filter if > 30, and it will be filtered later if searchTerm is also applied.
            // This means totalCount might be inaccurate if filterToday is true and patientIds > 30.
        } else {
           return { patients: [], totalCount: 0, lastVisiblePatientId: null }; // No patients with appointments today
        }
    }

    const baseQueryForCount = query(patientsCol, ...qConstraints.filter(c => !(c.type === 'orderBy' || c.type === 'limit' || c.type === 'startAfter')));
    const totalSnapshot = await getCountFromServer(baseQueryForCount);
    let totalCount = totalSnapshot.data().count;

    qConstraints.push(orderBy('firstName'), orderBy('lastName'));
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

    // Client-side filtering if searchTerm is present OR if filterToday had too many patient IDs
    if (searchTerm) {
        const lowerSearchTerm = searchTerm.toLowerCase();
        patientsData = patientsData.filter(p =>
          `${p.firstName} ${p.lastName}`.toLowerCase().includes(lowerSearchTerm) ||
          (p.phone && p.phone.includes(searchTerm))
        );
        if(!filterToday || (filterToday && Array.from(patientIdsWithAppointmentsToday || []).length > 30)) {
             totalCount = patientsData.length; // Recalculate totalCount if client-side filtering was significant
        }
    }
     if (filterToday && Array.from(patientIdsWithAppointmentsToday || []).length > 30 && !searchTerm) {
        // If we had to skip the 'in' filter due to >30 IDs and there's no search term, we need to client-filter for "today's patients" now.
        patientsData = patientsData.filter(p => (patientIdsWithAppointmentsToday || new Set()).has(p.id));
        totalCount = patientsData.length;
    }


    const newLastVisibleId = patientsData.length > 0 ? patientsData[patientsData.length - 1].id : null;
    return { patients: patientsData, totalCount, lastVisiblePatientId: newLastVisibleId };
  } catch (error) {
    console.error("Error in getPatients:", error);
    return { patients: [], totalCount: 0, lastVisiblePatientId: null }; // Fallback
  }
};

export const getPatientById = async (id: string): Promise<Patient | undefined> => {
  try {
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
  } catch (error) {
    console.error(`Error in getPatientById for ID ${id}:`, error);
    return undefined;
  }
};

export const findPatient = async (firstName: string, lastName: string): Promise<Patient | undefined> => {
  try {
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
  } catch (error) {
    console.error("Error in findPatient:", error);
    return undefined;
  }
};

export const addPatient = async (data: Omit<Patient, 'id'>): Promise<Patient> => {
  try {
    if (useMockDatabase) {
      const newPatient: Patient = {
        id: generateId(),
        ...data,
        age: data.age === undefined ? null : data.age,
        phone: data.phone || undefined,
        isDiabetic: data.isDiabetic || false,
        notes: data.notes || undefined,
        preferredProfessionalId: data.preferredProfessionalId || undefined,
      };
      mockDB.patients.push(newPatient);
      return newPatient;
    }
    if (!firestore) throw new Error("Firestore not initialized in addPatient");
    const patientData = {
        ...data,
        phone: data.phone || null, // Store empty string as null
        age: data.age ?? null,
        isDiabetic: data.isDiabetic || false,
        notes: data.notes || null,
        preferredProfessionalId: data.preferredProfessionalId || null,
    };
    const docRef = await addDoc(collection(firestore, 'pacientes'), patientData);
    return { id: docRef.id, ...patientData } as Patient;
  } catch (error) {
    console.error("Error in addPatient:", error);
    throw error; // Re-throw
  }
};

export const updatePatient = async (id: string, data: Partial<Patient>): Promise<Patient | undefined> => {
  try {
    if (useMockDatabase) {
        const index = mockDB.patients.findIndex(p => p.id === id);
        if (index !== -1) {
            const patientToUpdate = { ...mockDB.patients[index], ...data };
             if (data.hasOwnProperty('age') && data.age === null) {
                patientToUpdate.age = null;
            }
            if (data.hasOwnProperty('phone') && (data.phone === '' || data.phone === null)) {
                patientToUpdate.phone = undefined;
            }
            if (data.hasOwnProperty('notes') && (data.notes === '' || data.notes === null)) {
                patientToUpdate.notes = undefined;
            }
            mockDB.patients[index] = patientToUpdate;
            return mockDB.patients[index];
        }
        return undefined;
    }
    if (!firestore) throw new Error("Firestore not initialized in updatePatient");
    const docRef = doc(firestore, 'pacientes', id);
    const updateData: any = { ...data }; // Use 'any' to allow field deletion if needed
    delete updateData.id;

    // Convert empty strings or explicit nulls for optional fields to Firestore's null
    if (updateData.hasOwnProperty('phone')) {
      updateData.phone = updateData.phone || null;
    }
    if (updateData.hasOwnProperty('age')) {
      updateData.age = updateData.age ?? null;
    }
    if (updateData.hasOwnProperty('notes')) {
      updateData.notes = updateData.notes || null;
    }
    if (updateData.hasOwnProperty('preferredProfessionalId')) {
      updateData.preferredProfessionalId = updateData.preferredProfessionalId || null;
    }
    if (updateData.hasOwnProperty('isDiabetic')) {
      updateData.isDiabetic = updateData.isDiabetic || false;
    }


    await updateDoc(docRef, updateData);
    const updatedDocSnap = await getDoc(docRef);
    return updatedDocSnap.exists() ? { id: updatedDocSnap.id, ...convertDocumentData(updatedDocSnap.data()) } as Patient : undefined;
  } catch (error) {
    console.error(`Error in updatePatient for ID ${id}:`, error);
    throw error; // Re-throw
  }
};

// --- Services ---
export const getServices = async (): Promise<Service[]> => {
  try {
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
  } catch (error) {
    console.error("Error in getServices:", error);
    return []; // Fallback
  }
};

export const getServiceById = async (id: string): Promise<Service | undefined> => {
  try {
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
  } catch (error) {
    console.error(`Error in getServiceById for ID ${id}:`, error);
    return undefined;
  }
};

export const addService = async (data: ServiceFormData): Promise<Service> => {
  try {
    const totalDurationMinutes = (data.defaultDuration.hours * 60) + data.defaultDuration.minutes;
    const newServiceData: Omit<Service, 'id'> = {
      name: data.name,
      defaultDuration: totalDurationMinutes,
      price: data.price ?? undefined, // Handle optional price correctly
    };
    if (useMockDatabase) {
      const newService: Service = {
        id: data.id || generateId(),
        ...newServiceData,
      };
      mockDB.services.push(newService);
      return newService;
    }
    if (!firestore) throw new Error("Firestore not initialized in addService");
    const dataToSave = {
      ...newServiceData,
      price: newServiceData.price === undefined ? null : newServiceData.price, // Store undefined as null
    };
    const docRef = doc(firestore, 'servicios', data.id || generateId()); // Use provided ID or generate
    await setDoc(docRef, dataToSave);
    return { id: docRef.id, ...newServiceData };
  } catch (error) {
    console.error("Error in addService:", error);
    throw error; // Re-throw
  }
};

export const updateService = async (id: string, data: Partial<ServiceFormData>): Promise<Service | undefined> => {
  try {
    if (useMockDatabase) {
        const index = mockDB.services.findIndex(s => s.id === id);
        if (index !== -1) {
            const serviceToUpdate = { ...mockDB.services[index] };
            if (data.name) serviceToUpdate.name = data.name;
            if (data.defaultDuration) {
              serviceToUpdate.defaultDuration = (data.defaultDuration.hours * 60) + data.defaultDuration.minutes;
            }
            if (data.hasOwnProperty('price')) {
              serviceToUpdate.price = data.price === null ? undefined : data.price;
            }
            mockDB.services[index] = serviceToUpdate;
            return mockDB.services[index];
        }
        return undefined;
    }
    if (!firestore) throw new Error("Firestore not initialized in updateService");
    const docRef = doc(firestore, 'servicios', id);
    const updateData: any = {};
    if (data.name) updateData.name = data.name;
    if (data.defaultDuration) {
      updateData.defaultDuration = (data.defaultDuration.hours * 60) + data.defaultDuration.minutes;
    }
    if (data.hasOwnProperty('price')) {
      updateData.price = data.price === undefined || data.price === null ? null : data.price;
    }


    await updateDoc(docRef, updateData);
    const updatedDocSnap = await getDoc(docRef);
    return updatedDocSnap.exists() ? { id: updatedDocSnap.id, ...convertDocumentData(updatedDocSnap.data()) } as Service : undefined;
  } catch (error) {
    console.error(`Error in updateService for ID ${id}:`, error);
    throw error; // Re-throw
  }
};


// --- Appointments ---
const populateAppointmentFull = async (apptData: any): Promise<Appointment> => {
  try {
    if (useMockDatabase) {
        const patient = apptData.patientId ? mockDB.patients.find(p => p.id === apptData.patientId) : undefined;
        const professional = apptData.professionalId ? mockDB.professionals.find(p => p.id === apptData.professionalId) : undefined;
        const service = apptData.serviceId ? mockDB.services.find(s => s.id === apptData.serviceId) : undefined;
        let addedServicesPopulated: Appointment['addedServices'] = [];
        if (apptData.addedServices && Array.isArray(apptData.addedServices)) {
            addedServicesPopulated = apptData.addedServices.map((as: any) => {
                const addedService = as.serviceId ? mockDB.services.find(s => s.id === as.serviceId) : undefined;
                const addedProfessional = as.professionalId ? mockDB.professionals.find(p => p.id === as.professionalId) : undefined;
                return ({ serviceId: as.serviceId, professionalId: as.professionalId, price: as.price, service: addedService, professional: addedProfessional });
            });
        }
        return { ...apptData, patient, professional, service, addedServices: addedServicesPopulated } as Appointment;
    }
    // Firestore logic
    const patient = apptData.patientId ? await getPatientById(apptData.patientId) : undefined;
    const professional = apptData.professionalId ? await getProfessionalById(apptData.professionalId) : undefined;
    const service = apptData.serviceId ? await getServiceById(apptData.serviceId) : undefined;

    let addedServicesPopulated: Appointment['addedServices'] = [];
    if (apptData.addedServices && Array.isArray(apptData.addedServices)) {
        addedServicesPopulated = await Promise.all(
            apptData.addedServices.map(async (as: any) => {
                const addedService = as.serviceId ? await getServiceById(as.serviceId) : undefined;
                const addedProfessional = as.professionalId ? await getProfessionalById(as.professionalId) : undefined;
                return ({ serviceId: as.serviceId, professionalId: as.professionalId, price: as.price, service: addedService, professional: addedProfessional });
            })
        );
    }
    return { ...apptData, patient, professional, service, addedServices: addedServicesPopulated } as Appointment;
  } catch (error) {
    console.error("Error in populateAppointmentFull:", error);
    return { ...apptData } as Appointment; // Return partially populated or original data on error
  }
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
  const queryLimit = queryLimitParam ?? (restFilters.statuses && (Array.isArray(restFilters.statuses) || typeof restFilters.statuses === 'string') ? APPOINTMENTS_PER_PAGE_HISTORY : 1000);

  try {
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

      const populatedAppointmentsPromises = filteredMockAppointments.map(appt => populateAppointmentFull(appt));
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
      if (targetLocationIds.length > 0 && targetLocationIds.length <= 30) { // Firestore 'in' query limit
          qConstraints.push(where('locationId', 'in', targetLocationIds));
      } else if (targetLocationIds.length > 30) {
          console.warn("More than 30 locationIds for appointment filter. Querying for all locations and filtering client-side. This might be slow.");
          // No locationId filter applied at Firestore level, will be filtered client-side if necessary
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
      if (statusesToFilter.length > 0 && statusesToFilter.length <= 30) { // Firestore 'in' query limit
          qConstraints.push(where('status', 'in', statusesToFilter));
      } else if (statusesToFilter.length > 30) {
           console.warn("More than 30 statuses for appointment filter. Querying without status filter and filtering client-side. This might be slow.");
          // No status filter applied at Firestore level, will be filtered client-side
      }
    }

    const isFetchingPastStatusesFs = restFilters.statuses && (
      (Array.isArray(restFilters.statuses) && restFilters.statuses.some(s => [APPOINTMENT_STATUS.COMPLETED, APPOINTMENT_STATUS.CANCELLED_CLIENT, APPOINTMENT_STATUS.CANCELLED_STAFF, APPOINTMENT_STATUS.NO_SHOW].includes(s as AppointmentStatus))) ||
      (typeof restFilters.statuses === 'string' && [APPOINTMENT_STATUS.COMPLETED, APPOINTMENT_STATUS.CANCELLED_CLIENT, APPOINTMENT_STATUS.CANCELLED_STAFF, APPOINTMENT_STATUS.NO_SHOW].includes(restFilters.statuses as AppointmentStatus))
    );
    qConstraints.push(orderBy('appointmentDateTime', isFetchingPastStatusesFs ? 'desc' : 'asc'));

    const countQueryConstraints = qConstraints.filter(c => !(c.type === 'orderBy' || c.type === 'limit' || c.type === 'startAfter'));
    const totalSnapshot = await getCountFromServer(query(appointmentsCol, ...countQueryConstraints));
    let totalCount = totalSnapshot.data().count;

    if (startAfterId) {
      const lastVisibleDoc = await getDoc(doc(appointmentsCol, startAfterId));
      if (lastVisibleDoc.exists()) {
        qConstraints.push(startAfter(lastVisibleDoc));
      }
    }
    qConstraints.push(limit(queryLimit));

    const q = query(appointmentsCol, ...qConstraints);
    const snapshot = await getDocs(q);
    let appointmentsData = snapshot.docs.map(d => ({ id: d.id, ...convertDocumentData(d.data()) }) as Appointment);

    // Client-side filtering for cases where Firestore 'in' limit was exceeded
    if (restFilters.locationId && Array.isArray(restFilters.locationId) && restFilters.locationId.length > 30) {
        appointmentsData = appointmentsData.filter(appt => (restFilters.locationId as LocationId[]).includes(appt.locationId));
        totalCount = appointmentsData.length; // Recalculate if filtered client-side
    }
    if (restFilters.statuses && Array.isArray(restFilters.statuses) && restFilters.statuses.length > 30) {
        appointmentsData = appointmentsData.filter(appt => (restFilters.statuses as AppointmentStatus[]).includes(appt.status));
        totalCount = appointmentsData.length; // Recalculate
    }


    const populatedAppointments = await Promise.all(appointmentsData.map(populateAppointmentFull));
    const newLastVisibleId = populatedAppointments.length > 0 ? populatedAppointments[populatedAppointments.length - 1].id : null;
    return { appointments: populatedAppointments, totalCount, lastVisibleAppointmentId: newLastVisibleId };
  } catch (error) {
    console.error("Error in getAppointments:", error);
    return { appointments: [], totalCount: 0, lastVisibleAppointmentId: null }; // Fallback
  }
};


export const getAppointmentById = async (id: string): Promise<Appointment | undefined> => {
  try {
    if (useMockDatabase) {
        const appt = mockDB.appointments.find(a => a.id === id);
        return appt ? populateAppointmentFull(appt) : undefined;
    }
    if (!firestore) {
      console.warn("Firestore not initialized in getAppointmentById. Falling back to mock data for ID:", id);
      const appt = mockDB.appointments.find(a => a.id === id);
      return appt ? populateAppointmentFull(appt) : undefined;
    }
    const docRef = doc(firestore, 'citas', id);
    const docSnap = await getDoc(docRef);
    if (!docSnap.exists()) return undefined;
    const apptData = { id: docSnap.id, ...convertDocumentData(docSnap.data()) } as Appointment;
    return populateAppointmentFull(apptData);
  } catch (error) {
    console.error(`Error in getAppointmentById for ID ${id}:`, error);
    return undefined;
  }
};

export const addAppointment = async (data: AppointmentFormData & { isExternalProfessional?: boolean; externalProfessionalOriginLocationId?: LocationId | null } ): Promise<Appointment> => {
  try {
    const service = useMockDatabase
      ? mockDB.services.find(s => s.id === data.serviceId)
      : await getServiceById(data.serviceId as string);

    if (!service) throw new Error(`Service with ID ${data.serviceId} not found.`);

    const appointmentDateHours = parseInt(data.appointmentTime.split(':')[0]);
    const appointmentDateMinutes = parseInt(data.appointmentTime.split(':')[1]);
    const appointmentDateTimeObject = setMinutes(setHours(data.appointmentDate, appointmentDateHours), appointmentDateMinutes);
    const appointmentDateTime = formatISO(appointmentDateTimeObject);
    const appointmentDuration = service.defaultDuration || 60;
    const appointmentEndTime = dateFnsAddMinutes(parseISO(appointmentDateTime), appointmentDuration);


    let patientId = data.existingPatientId;
    if (!patientId) {
      const existingPatient = useMockDatabase
        ? mockDB.patients.find(p => p.firstName.toLowerCase() === data.patientFirstName.toLowerCase() && p.lastName.toLowerCase() === data.patientLastName.toLowerCase())
        : await findPatient(data.patientFirstName, data.patientLastName);
      if (existingPatient) {
        patientId = existingPatient.id;
      } else {
        const newPatient = await addPatient({
          firstName: data.patientFirstName,
          lastName: data.patientLastName,
          phone: data.patientPhone || undefined,
          age: data.patientAge,
          isDiabetic: data.isDiabetic || false,
        });
        patientId = newPatient.id;
      }
    }

    let actualProfessionalId: string | undefined | null = data.preferredProfessionalId;
    let isExternalProfAssignment = data.isExternalProfessional || false;
    let externalProfOriginLocId: LocationId | null = data.externalProfessionalOriginLocationId || null;
    let finalBookingObservations = data.bookingObservations || '';


    if (!actualProfessionalId || actualProfessionalId === ANY_PROFESSIONAL_VALUE) {
      console.log("Attempting to auto-assign professional...");
      const allProfsResponse = useMockDatabase ? { professionals: mockDB.professionals, totalCount: mockDB.professionals.length } : await getProfessionals(); // Fetch all if not mock
      const allProfs = Array.isArray(allProfsResponse) ? allProfsResponse : (allProfsResponse.professionals || []);


      const professionalsToConsider = data.searchExternal
        ? allProfs
        : allProfs.filter(p => p.locationId === data.locationId);

      let appointmentsOnDateForConsideredProfs: Appointment[];
       const appointmentsResult = useMockDatabase
        ? { appointments: mockDB.appointments.filter(appt => dateFnsIsSameDay(parseISO(appt.appointmentDateTime), appointmentDateTimeObject)), totalCount:0 }
        : await getAppointments({ date: appointmentDateTimeObject, statuses: [APPOINTMENT_STATUS.BOOKED, APPOINTMENT_STATUS.CONFIRMED] });

      appointmentsOnDateForConsideredProfs = Array.isArray(appointmentsResult) ? appointmentsResult : (appointmentsResult.appointments || []);


      for (const prof of professionalsToConsider) {
        const availability = getProfessionalAvailabilityForDate(prof, appointmentDateTimeObject);
        if (availability) {
          const profWorkStartTime = parse(`${format(data.appointmentDate, 'yyyy-MM-dd')} ${availability.startTime}`, 'yyyy-MM-dd HH:mm', new Date());
          const profWorkEndTime = parse(`${format(data.appointmentDate, 'yyyy-MM-dd')} ${availability.endTime}`, 'yyyy-MM-dd HH:mm', new Date());

          if (!isWithinInterval(appointmentDateTimeObject, { start: profWorkStartTime, end: dateFnsAddMinutes(profWorkEndTime, -appointmentDuration +1) })) {
            continue;
          }

          const isOverlappingWithExisting = appointmentsOnDateForConsideredProfs.some(existingAppt =>
            existingAppt.professionalId === prof.id &&
            areIntervalsOverlapping(
              { start: appointmentDateTimeObject, end: appointmentEndTime },
              { start: parseISO(existingAppt.appointmentDateTime), end: dateFnsAddMinutes(parseISO(existingAppt.appointmentDateTime), existingAppt.durationMinutes) }
            )
          );

          if (!isOverlappingWithExisting) {
            actualProfessionalId = prof.id;
            if (data.searchExternal && prof.locationId !== data.locationId) {
              isExternalProfAssignment = true;
              externalProfOriginLocId = prof.locationId;
              const externalNote = `Profesional ${prof.firstName} ${prof.lastName} de sede ${LOCATIONS.find(l=>l.id === prof.locationId)?.name} se movilizará.`;
              if (finalBookingObservations && !finalBookingObservations.includes(externalNote)) {
                finalBookingObservations += `; ${externalNote}`;
              } else if (!finalBookingObservations) {
                finalBookingObservations = externalNote;
              }
            } else {
              isExternalProfAssignment = false;
              externalProfOriginLocId = null;
            }
            console.log(`Auto-assigned professional ${actualProfessionalId}`);
            break;
          }
        }
      }
      if (!actualProfessionalId || actualProfessionalId === ANY_PROFESSIONAL_VALUE) {
        console.log("No professional could be auto-assigned.");
         actualProfessionalId = null;
      }
    }


    const newAppointmentRaw: Omit<Appointment, 'id' | 'createdAt' | 'updatedAt' | 'patient' | 'service' | 'professional'|'addedServices'|'attachedPhotos'> = {
      patientId: patientId!,
      locationId: data.locationId,
      serviceId: data.serviceId,
      professionalId: actualProfessionalId,
      appointmentDateTime: appointmentDateTime,
      durationMinutes: appointmentDuration,
      status: APPOINTMENT_STATUS.BOOKED,
      bookingObservations: finalBookingObservations.trim() || undefined,
      isExternalProfessional: isExternalProfAssignment,
      externalProfessionalOriginLocationId: externalProfOriginLocId,
    };

    if (useMockDatabase) {
      const newAppointment: Appointment = {
        id: generateId(),
        ...newAppointmentRaw,
        addedServices: [],
        attachedPhotos: [],
        createdAt: formatISO(new Date()),
        updatedAt: formatISO(new Date()),
      };
      const populatedAppt = await populateAppointmentFull(newAppointment);
      mockDB.appointments.push(populatedAppt);
      return populatedAppt;
    }

    if (!firestore) throw new Error("Firestore not initialized in addAppointment");

    const firestoreReadyData: any = {
        ...newAppointmentRaw,
        appointmentDateTime: toFirestoreTimestamp(newAppointmentRaw.appointmentDateTime),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        addedServices: [],
        attachedPhotos: [],
    };

    const docRef = await addDoc(collection(firestore, 'citas'), firestoreReadyData);
    const newAppointmentSnapshot = await getDoc(docRef);
    const newAppointmentData = {id: newAppointmentSnapshot.id, ...convertDocumentData(newAppointmentSnapshot.data()!) } as Appointment;
    return populateAppointmentFull(newAppointmentData);
  } catch (error) {
    console.error("Error in addAppointment:", error);
    throw error; // Re-throw
  }
};


export const updateAppointment = async (id: string, data: Partial<Appointment>): Promise<Appointment | undefined> => {
  try {
    if (useMockDatabase) {
      const index = mockDB.appointments.findIndex(a => a.id === id);
      if (index !== -1) {
        const originalAppointment = mockDB.appointments[index];
        const updatedAppointmentRaw = {
          ...originalAppointment,
          ...data,
          updatedAt: formatISO(new Date()),
        };
        const populatedAppointment = await populateAppointmentFull(updatedAppointmentRaw);
        mockDB.appointments[index] = populatedAppointment;
        return populatedAppointment;
      }
      return undefined;
    }

    if (!firestore) throw new Error("Firestore not initialized in updateAppointment");
    const docRef = doc(firestore, 'citas', id);

    const dataToUpdate: any = { ...data };
    delete dataToUpdate.id;
    delete dataToUpdate.patient;
    delete dataToUpdate.professional;
    delete dataToUpdate.service;

    if (dataToUpdate.appointmentDateTime && typeof dataToUpdate.appointmentDateTime === 'string') {
      dataToUpdate.appointmentDateTime = toFirestoreTimestamp(dataToUpdate.appointmentDateTime);
    } else if (dataToUpdate.appointmentDateTime && dataToUpdate.appointmentDateTime instanceof Date) {
      dataToUpdate.appointmentDateTime = toFirestoreTimestamp(dataToUpdate.appointmentDateTime);
    }

    if (dataToUpdate.addedServices && Array.isArray(dataToUpdate.addedServices)) {
        dataToUpdate.addedServices = dataToUpdate.addedServices.map((as: any) => ({
            serviceId: as.serviceId,
            professionalId: as.professionalId || null,
            price: as.price || null,
        }));
    }
    dataToUpdate.updatedAt = serverTimestamp();

    await updateDoc(docRef, dataToUpdate);
    const updatedDocSnap = await getDoc(docRef);
    if (!updatedDocSnap.exists()) return undefined;
    const updatedAppointmentData = { id: updatedDocSnap.id, ...convertDocumentData(updatedDocSnap.data()) } as Appointment;
    return populateAppointmentFull(updatedAppointmentData);
  } catch (error) {
    console.error(`Error in updateAppointment for ID ${id}:`, error);
    throw error; // Re-throw
  }
};

export const getPatientAppointmentHistory = async (
  patientId: string,
  options: { page?: number, limit?: number, lastVisibleAppointmentId?: string | null } = {}
): Promise<{ appointments: Appointment[], totalCount: number, lastVisibleAppointmentId?: string | null }> => {
  const { page = 1, limit: queryLimit = APPOINTMENTS_PER_PAGE_HISTORY, lastVisibleAppointmentId: startAfterId } = options;
  const todayForFilter = startOfDay(new Date()); // Use actual today
  const pastStatuses: AppointmentStatus[] = [APPOINTMENT_STATUS.COMPLETED, APPOINTMENT_STATUS.NO_SHOW, APPOINTMENT_STATUS.CANCELLED_CLIENT, APPOINTMENT_STATUS.CANCELLED_STAFF];

  try {
    if (useMockDatabase) {
      let historyAppointments = (mockDB.appointments || []).filter(appt =>
        appt.patientId === patientId &&
        appt.appointmentDateTime && parseISO(appt.appointmentDateTime) < todayForFilter &&
        pastStatuses.includes(appt.status)
      );
      historyAppointments.sort((a, b) => parseISO(b.appointmentDateTime).getTime() - parseISO(a.appointmentDateTime).getTime());
      const populatedHistoryPromises = historyAppointments.map(populateAppointmentFull);
      let populatedHistory = await Promise.all(populatedHistoryPromises);
      const totalCount = populatedHistory.length;
      const startIndex = (page - 1) * queryLimit;
      const paginatedAppointments = populatedHistory.slice(startIndex, startIndex + queryLimit);
      const newLastVisibleId = paginatedAppointments.length > 0 ? paginatedAppointments[paginatedAppointments.length -1].id : null;
      return { appointments: paginatedAppointments, totalCount, lastVisibleAppointmentId: newLastVisibleId };
    }

    if (!firestore) {
      console.warn("Firestore not initialized in getPatientAppointmentHistory. Falling back to mock data for patient:", patientId);
      let mockHistory = (mockDB.appointments || []).filter(appt =>
        appt.patientId === patientId &&
        appt.appointmentDateTime && parseISO(appt.appointmentDateTime) < todayForFilter &&
        pastStatuses.includes(appt.status)
      ).sort((a, b) => parseISO(b.appointmentDateTime).getTime() - parseISO(a.appointmentDateTime).getTime());
      const populatedMockHistory = await Promise.all(mockHistory.map(populateAppointmentFull));
      return { appointments: populatedMockHistory.slice(0, queryLimit), totalCount: mockHistory.length, lastVisibleAppointmentId: mockHistory[queryLimit-1]?.id || null };
    }

    const appointmentsCol = collection(firestore, 'citas') as CollectionReference<Omit<Appointment, 'id'|'patient'|'professional'|'service'>>;
    let qConstraints: QueryConstraint[] = [
        where('patientId', '==', patientId),
        where('appointmentDateTime', '<', toFirestoreTimestamp(todayForFilter)!),
        where('status', 'in', pastStatuses),
        orderBy('appointmentDateTime', 'desc')
    ];

    const countQueryConstraints = qConstraints.filter(c => !(c.type === 'orderBy' || c.type === 'limit' || c.type === 'startAfter'));
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
    const populatedAppointments = await Promise.all(appointmentsData.map(populateAppointmentFull));
    const newLastVisibleId = populatedAppointments.length > 0 ? populatedAppointments[populatedAppointments.length - 1].id : null;
    return { appointments: populatedAppointments, totalCount, lastVisibleAppointmentId: newLastVisibleId };
  } catch (error) {
    console.error(`Error in getPatientAppointmentHistory for patient ID ${patientId}:`, error);
    return { appointments: [], totalCount: 0, lastVisibleAppointmentId: null }; // Fallback
  }
};

// --- Utils ---
export const getCurrentQuincenaDateRange = (): { start: Date; end: Date } => {
  try {
    const todayForQuincena = new Date(); // Use actual current date
    const currentYear = getYear(todayForQuincena);
    const currentMonth = getMonth(todayForQuincena);
    const currentDay = getDate(todayForQuincena);
    let startDate: Date;
    let endDate: Date;
    if (currentDay <= 15) {
      startDate = startOfMonth(setMonth(setYear(new Date(), currentYear), currentMonth));
      endDate = dateFnsAddMinutes(startOfDay(addDays(startDate, 14)), (24*60)-1);
    } else {
      startDate = addDays(startOfMonth(setMonth(setYear(new Date(), currentYear), currentMonth)), 15);
      endDate = endOfMonth(setMonth(setYear(new Date(), currentYear), currentMonth));
    }
    return { start: startOfDay(startDate), end: endOfDay(endDate) };
  } catch (error) {
    console.error("Error in getCurrentQuincenaDateRange:", error);
    // Fallback to current day for safety, though this might not be ideal for reports
    const todayFallback = new Date();
    return { start: startOfDay(todayFallback), end: endOfDay(todayFallback) };
  }
};

export const getProfessionalAppointmentsForDate = async (professionalId: string, date: Date): Promise<Appointment[]> => {
  try {
    if (useMockDatabase) {
      const targetDate = startOfDay(date);
      const professionalAppointments = (mockDB.appointments || [])
        .filter(appt =>
          appt.professionalId === professionalId &&
          appt.appointmentDateTime && dateFnsIsSameDay(parseISO(appt.appointmentDateTime), targetDate) &&
          (appt.status === APPOINTMENT_STATUS.BOOKED || appt.status === APPOINTMENT_STATUS.CONFIRMED)
        )
        .sort((a, b) => parseISO(a.appointmentDateTime).getTime() - parseISO(b.appointmentDateTime).getTime());
      return Promise.all(professionalAppointments.map(populateAppointmentFull));
    }

    if (!firestore) {
      console.warn("Firestore not initialized in getProfessionalAppointmentsForDate. Falling back to mock for prof ID:", professionalId);
      const targetDate = startOfDay(date);
      const mockAppointments = (mockDB.appointments || [])
        .filter(appt =>
          appt.professionalId === professionalId &&
          appt.appointmentDateTime && dateFnsIsSameDay(parseISO(appt.appointmentDateTime), targetDate) &&
          (appt.status === APPOINTMENT_STATUS.BOOKED || appt.status === APPOINTMENT_STATUS.CONFIRMED)
        )
        .sort((a, b) => parseISO(a.appointmentDateTime).getTime() - parseISO(b.appointmentDateTime).getTime());
      return Promise.all(mockAppointments.map(populateAppointmentFull));
    }

    const appointmentsCol = collection(firestore, 'citas');
    const q = query(appointmentsCol,
      where('professionalId', '==', professionalId),
      where('appointmentDateTime', '>=', toFirestoreTimestamp(startOfDay(date))!),
      where('appointmentDateTime', '<=', toFirestoreTimestamp(endOfDay(date))!),
      where('status', 'in', [APPOINTMENT_STATUS.BOOKED, APPOINTMENT_STATUS.CONFIRMED]),
      orderBy('appointmentDateTime', 'asc')
    );
    const snapshot = await getDocs(q);
    const appointmentsData = snapshot.docs.map(d => ({ id: d.id, ...convertDocumentData(d.data()) }) as Appointment);
    return Promise.all(appointmentsData.map(populateAppointmentFull));
  } catch (error) {
    console.error(`Error in getProfessionalAppointmentsForDate for prof ID ${professionalId} and date ${date}:`, error);
    return []; // Fallback
  }
};


export function getProfessionalAvailabilityForDate(
  professional: Professional,
  targetDate: Date
): { startTime: string; endTime: string; notes?: string } | null {
  try {
    const contractStatus = getContractDisplayStatus(professional.currentContract, targetDate);
    if (contractStatus !== 'Activo') {
      return null;
    }
    const dateToCheck = startOfDay(targetDate);
    const targetDateString = format(dateToCheck, 'yyyy-MM-dd');

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
      const dayOfWeekIndex = getDay(dateToCheck); // Sunday is 0, Monday is 1, etc.
      const dayKey = DAYS_OF_WEEK.find((_, index) => index === dayOfWeekIndex)?.id as DayOfWeekId | undefined;

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
  } catch (error) {
    console.error("Error in getProfessionalAvailabilityForDate:", error);
    return null; // Fallback
  }
}

// --- Periodic Reminders CRUD ---
export const getPeriodicReminders = async (): Promise<PeriodicReminder[]> => {
  try {
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
  } catch (error) {
    console.error("Error in getPeriodicReminders:", error);
    return []; // Fallback
  }
};

export const addPeriodicReminder = async (data: Omit<PeriodicReminder, 'id' | 'createdAt' | 'updatedAt'>): Promise<PeriodicReminder> => {
  try {
    if (useMockDatabase) {
      const newReminder: PeriodicReminder = {
        id: generateId(),
        ...data,
        dueDate: formatISO(parseISO(data.dueDate), { representation: 'date' }), // Ensure date only
        createdAt: formatISO(new Date()),
        updatedAt: formatISO(new Date()),
      };
      mockDB.periodicReminders.push(newReminder);
      return newReminder;
    }
    if (!firestore) throw new Error("Firestore not initialized in addPeriodicReminder");
    const reminderData = {
      ...data,
      dueDate: toFirestoreTimestamp(formatISO(parseISO(data.dueDate), { representation: 'date' })), // Date only
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    const docRef = await addDoc(collection(firestore, 'recordatorios'), reminderData);
    // For consistency, re-fetch or construct the returned object carefully
    const savedData = (await getDoc(docRef)).data();
    return {
      id: docRef.id,
      ...data, // original data with correct types
      dueDate: formatISO(parseISO(data.dueDate), {representation: 'date'}),
      createdAt: savedData?.createdAt ? fromFirestoreTimestamp(savedData.createdAt as Timestamp) : new Date().toISOString(),
      updatedAt: savedData?.updatedAt ? fromFirestoreTimestamp(savedData.updatedAt as Timestamp) : new Date().toISOString(),
     } as PeriodicReminder;
  } catch (error) {
    console.error("Error in addPeriodicReminder:", error);
    throw error; // Re-throw
  }
};

export const updatePeriodicReminder = async (id: string, data: Partial<Omit<PeriodicReminder, 'id' | 'createdAt' | 'updatedAt'>> & {dueDate: string}): Promise<PeriodicReminder | undefined> => {
  try {
    if (useMockDatabase) {
      const index = mockDB.periodicReminders.findIndex(r => r.id === id);
      if (index !== -1) {
        mockDB.periodicReminders[index] = {
          ...mockDB.periodicReminders[index],
          ...data,
          dueDate: formatISO(parseISO(data.dueDate), { representation: 'date' }),
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
      updateData.dueDate = toFirestoreTimestamp(formatISO(parseISO(updateData.dueDate), {representation: 'date'}));
    }
    updateData.updatedAt = serverTimestamp();
    await updateDoc(docRef, updateData);
    const updatedDocSnap = await getDoc(docRef);
    return updatedDocSnap.exists() ? { id: updatedDocSnap.id, ...convertDocumentData(updatedDocSnap.data()) } as PeriodicReminder : undefined;
  } catch (error) {
    console.error(`Error in updatePeriodicReminder for ID ${id}:`, error);
    throw error; // Re-throw
  }
};

export const deletePeriodicReminder = async (id: string): Promise<boolean> => {
  try {
    if (useMockDatabase) {
      const initialLength = mockDB.periodicReminders.length;
      mockDB.periodicReminders = mockDB.periodicReminders.filter(r => r.id !== id);
      return mockDB.periodicReminders.length < initialLength;
    }
    if (!firestore) throw new Error("Firestore not initialized in deletePeriodicReminder");
    await deleteDoc(doc(firestore, 'recordatorios', id));
    return true;
  } catch (error) {
    console.error(`Error in deletePeriodicReminder for ID ${id}:`, error);
    return false;
  }
};

// --- Important Notes CRUD ---
export const getImportantNotes = async (): Promise<ImportantNote[]> => {
  try {
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
  } catch (error) {
    console.error("Error in getImportantNotes:", error);
    return []; // Fallback
  }
};

export const addImportantNote = async (data: Omit<ImportantNote, 'id' | 'createdAt' | 'updatedAt'>): Promise<ImportantNote> => {
  try {
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
    const savedData = (await getDoc(docRef)).data();
    return {
      id: docRef.id,
      ...data,
      createdAt: savedData?.createdAt ? fromFirestoreTimestamp(savedData.createdAt as Timestamp) : new Date().toISOString(),
      updatedAt: savedData?.updatedAt ? fromFirestoreTimestamp(savedData.updatedAt as Timestamp) : new Date().toISOString(),
    } as ImportantNote;
  } catch (error) {
    console.error("Error in addImportantNote:", error);
    throw error; // Re-throw
  }
};

export const updateImportantNote = async (id: string, data: Partial<Omit<ImportantNote, 'id' | 'createdAt' | 'updatedAt'>>): Promise<ImportantNote | undefined> => {
  try {
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
  } catch (error) {
    console.error(`Error in updateImportantNote for ID ${id}:`, error);
    throw error; // Re-throw
  }
};

export const deleteImportantNote = async (id: string): Promise<boolean> => {
  try {
    if (useMockDatabase) {
        const initialLength = mockDB.importantNotes.length;
        mockDB.importantNotes = mockDB.importantNotes.filter(n => n.id !== id);
        return mockDB.importantNotes.length < initialLength;
    }
    if (!firestore) throw new Error("Firestore not initialized in deleteImportantNote");
    await deleteDoc(doc(firestore, 'notasImportantes', id));
    return true;
  } catch (error) {
    console.error(`Error in deleteImportantNote for ID ${id}:`, error);
    return false;
  }
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
      const dataToSave: any = {...userData};
      // In a real scenario, password would be hashed here before saving.
      // For mock seeding, we are using the plain password as is in the mock.
      dataToSave.password = "admin"; // Ensure all mock users seeded to Firestore have 'admin' as password
      batch.set(userRef, dataToSave);
    });

    // Seed Services
    console.log(`Seeding ${initialMockServicesData.length} services...`);
    initialMockServicesData.forEach(service => {
      const { id, ...serviceData } = service;
      const serviceRef = doc(firestore, "servicios", id);
      batch.set(serviceRef, {
        ...serviceData,
        price: serviceData.price ?? null, // Ensure undefined price is stored as null
      });
    });

    // Seed Professionals
    console.log(`Seeding ${initialMockProfessionalsData.length} professionals...`);
    initialMockProfessionalsData.forEach(prof => {
      const { id, biWeeklyEarnings, ...profData } = prof;
      const professionalRef = doc(firestore, "profesionales", id);
      const dataToSave: any = { ...profData };
      dataToSave.phone = profData.phone || null;

      if (dataToSave.currentContract) {
          dataToSave.currentContract.startDate = toFirestoreTimestamp(dataToSave.currentContract.startDate);
          dataToSave.currentContract.endDate = toFirestoreTimestamp(dataToSave.currentContract.endDate);
          dataToSave.currentContract.notes = dataToSave.currentContract.notes || null;
          dataToSave.currentContract.empresa = dataToSave.currentContract.empresa || null;
      } else {
          dataToSave.currentContract = null;
      }
      if (dataToSave.contractHistory && Array.isArray(dataToSave.contractHistory)) {
          dataToSave.contractHistory = dataToSave.contractHistory.map((ch: Contract) => ({
              ...ch,
              startDate: toFirestoreTimestamp(ch.startDate),
              endDate: toFirestoreTimestamp(ch.endDate),
              notes: ch.notes || null,
              empresa: ch.empresa || null,
          }));
      } else {
        dataToSave.contractHistory = [];
      }
      if (dataToSave.customScheduleOverrides && Array.isArray(dataToSave.customScheduleOverrides)) {
          dataToSave.customScheduleOverrides = dataToSave.customScheduleOverrides.map((ov: any) => ({
              ...ov,
              date: toFirestoreTimestamp(ov.date)
          }));
      } else {
        dataToSave.customScheduleOverrides = [];
      }
      dataToSave.biWeeklyEarnings = 0; // Initialize this, it's calculated on read
      batch.set(professionalRef, dataToSave);
    });

    // Seed Patients
    console.log(`Seeding ${initialMockPatientsData.length} patients...`);
    initialMockPatientsData.forEach(patient => {
      const { id, ...patientData } = patient;
      const patientRef = doc(firestore, "pacientes", id);
      batch.set(patientRef, {
        ...patientData,
        phone: patientData.phone || null,
        age: patientData.age ?? null,
        isDiabetic: patientData.isDiabetic || false,
        preferredProfessionalId: patientData.preferredProfessionalId || null,
        notes: patientData.notes || null,
      });
    });

    // Seed Appointments
    console.log(`Seeding ${initialMockAppointmentsData.length} appointments...`);
    initialMockAppointmentsData.forEach(appt => {
      const { id, patient, professional, service, addedServices, ...apptData } = appt;
      const appointmentRef = doc(firestore, "citas", id);
      const dataToSave: any = { ...apptData };
      dataToSave.appointmentDateTime = toFirestoreTimestamp(dataToSave.appointmentDateTime);
      dataToSave.createdAt = dataToSave.createdAt ? toFirestoreTimestamp(dataToSave.createdAt) : serverTimestamp();
      dataToSave.updatedAt = dataToSave.updatedAt ? toFirestoreTimestamp(dataToSave.updatedAt) : serverTimestamp();
      dataToSave.professionalId = dataToSave.professionalId || null;
      dataToSave.bookingObservations = dataToSave.bookingObservations || null;
      dataToSave.actualArrivalTime = dataToSave.actualArrivalTime || null;
      dataToSave.paymentMethod = dataToSave.paymentMethod || null;
      dataToSave.amountPaid = dataToSave.amountPaid ?? null;
      dataToSave.staffNotes = dataToSave.staffNotes || null;
      dataToSave.attachedPhotos = dataToSave.attachedPhotos || [];
      dataToSave.isExternalProfessional = dataToSave.isExternalProfessional || false;
      dataToSave.externalProfessionalOriginLocationId = dataToSave.externalProfessionalOriginLocationId || null;

      if (addedServices && Array.isArray(addedServices)) {
        dataToSave.addedServices = addedServices.map((as: any) => ({
            serviceId: as.serviceId,
            professionalId: as.professionalId || null,
            price: as.price ?? null,
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
        dataToSave.description = dataToSave.description || null;
        dataToSave.amount = dataToSave.amount ?? null;
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
    throw error; // Re-throw
  }
};

// Function to clear all data from specified collections in Firestore
export const clearFirestoreData = async (): Promise<void> => {
  if (useMockDatabase) {
    console.warn("Clear function called, but useMockDatabase is true. No data will be cleared from Firestore.");
    return;
  }
  if (!firestore) {
    throw new Error("Firestore not initialized. Cannot clear data.");
  }

  const collectionsToClear = ['usuarios', 'servicios', 'profesionales', 'pacientes', 'citas', 'recordatorios', 'notasImportantes', 'sedes'];
  console.log("Starting to clear Firestore data from collections:", collectionsToClear.join(', '));

  try {
    for (const collectionName of collectionsToClear) {
      console.log(`Clearing collection: ${collectionName}...`);
      const collectionRef = collection(firestore, collectionName);
      const snapshot = await getDocs(collectionRef);
      if (snapshot.empty) {
        console.log(`Collection ${collectionName} is already empty.`);
        continue;
      }
      const subBatch = writeBatch(firestore);
      snapshot.docs.forEach(docPayload => {
        subBatch.delete(docPayload.ref);
      });
      await subBatch.commit();
      console.log(`Collection ${collectionName} cleared successfully.`);
    }
    console.log("All specified Firestore collections cleared successfully!");
  } catch (error) {
    console.error("Error clearing Firestore data:", error);
    throw error; // Re-throw
  }
};
