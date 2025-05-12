
import type { User, Professional, Patient, Service, Appointment, AppointmentFormData, ProfessionalFormData, AppointmentStatus, ServiceFormData } from '@/types';
import { LOCATIONS, USER_ROLES, SERVICES as SERVICES_CONSTANTS, APPOINTMENT_STATUS, LocationId, ServiceId as ConstantServiceId, APPOINTMENT_STATUS_DISPLAY, PAYMENT_METHODS } from './constants';
import { formatISO, parseISO, addDays, subDays, setHours, setMinutes, startOfDay, endOfDay, addMinutes, isSameDay as dateFnsIsSameDay, startOfMonth, endOfMonth, differenceInDays } from 'date-fns';
import { firestore } from './firebase-config'; // Firebase setup - Corrected import path
import { collection, addDoc, getDocs, doc, getDoc, updateDoc, query, where, deleteDoc, writeBatch, serverTimestamp, Timestamp, runTransaction, setDoc, QueryConstraint, orderBy, limit, startAfter,getCountFromServer, CollectionReference, DocumentData, documentId } from 'firebase/firestore';

// --- Helper to convert Firestore Timestamps to ISO strings and vice-versa ---
const fromTimestampToISO = (timestamp: Timestamp | undefined): string | undefined => {
  return timestamp?.toDate().toISOString();
}
const fromDateToTimestamp = (date: Date | string | undefined): Timestamp | undefined => {
  if (!date) return undefined;
  return Timestamp.fromDate(typeof date === 'string' ? parseISO(date) : date);
}

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
  id: s_const.id as string, // Ensure id is string
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

let mockAppointments: Appointment[] = [...initialMockAppointments];

const useMockDatabase = true; 

const generateId = () => {
  if (firestore && !useMockDatabase) {
    return doc(collection(firestore, 'dummy')).id;
  }
  return Math.random().toString(36).substr(2, 9);
};


// --- Auth ---
export const getUserByUsername = async (username: string): Promise<User | undefined> => {
  if (useMockDatabase) {
    return mockUsers.find(u => u.username === username);
  }
  try {
    if (!firestore) throw new Error("Firestore is not initialized.");
    const usersRef = collection(firestore, 'users') as CollectionReference<Omit<User, 'id'>>;
    const q = query(usersRef, where('username', '==', username));
    const querySnapshot = await getDocs(q);
    if (!querySnapshot.empty) {
      const docSnap = querySnapshot.docs[0];
      return { id: docSnap.id, ...docSnap.data() } as User;
    }
    return undefined;
  } catch (error) {
    console.error("Error fetching user by username:", error);
    throw error;
  }
};

// --- Professionals ---
export const getProfessionals = async (locationId?: LocationId): Promise<Professional[]> => {
   if (useMockDatabase) {
    if (locationId) {
      return mockProfessionals.filter(p => p.locationId === locationId);
    }
    return [...mockProfessionals];
  }
  try {
    if (!firestore) throw new Error("Firestore is not initialized.");
    const professionalsRef = collection(firestore, 'professionals') as CollectionReference<Omit<Professional, 'id'>>;
    let q;
    if (locationId) {
      q = query(professionalsRef, where('locationId', '==', locationId));
    } else {
      q = query(professionalsRef);
    }
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() } as Professional));
  } catch (error) {
    console.error("Error fetching professionals:", error);
    return []; 
  }
};

export const getProfessionalById = async (id: string): Promise<Professional | undefined> => {
  if (useMockDatabase) {
    return mockProfessionals.find(p => p.id === id);
  }
  try {
    if (!firestore) throw new Error("Firestore is not initialized.");
    const docRef = doc(firestore, 'professionals', id);
    const docSnap = await getDoc(docRef);
    return docSnap.exists() ? { id: docSnap.id, ...docSnap.data() } as Professional : undefined;
  } catch (error) {
    console.error("Error fetching professional by ID:", error);
    throw error;
  }
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
    mockProfessionals.push(newProfessional);
    return newProfessional;
  }

  try {
    if (!firestore) throw new Error("Firestore is not initialized.");
    const docRef = await addDoc(collection(firestore, 'professionals'), newProfessionalData);
    return { id: docRef.id, ...newProfessionalData, biWeeklyEarnings: 0 };
  } catch (error) {
    console.error("Error adding professional:", error);
    throw error;
  }
};

export const updateProfessional = async (id: string, data: Partial<ProfessionalFormData>): Promise<Professional | undefined> => {
  if (useMockDatabase) {
    const index = mockProfessionals.findIndex(p => p.id === id);
    if (index !== -1) {
      mockProfessionals[index] = { ...mockProfessionals[index], ...data } as Professional;
      return mockProfessionals[index];
    }
    return undefined;
  }
  try {
    if (!firestore) throw new Error("Firestore is not initialized.");
    const docRef = doc(firestore, 'professionals', id);
    await updateDoc(docRef, data);
    const updatedDoc = await getDoc(docRef);
    return updatedDoc.exists() ? { id: updatedDoc.id, ...updatedDoc.data() } as Professional : undefined;
  } catch (error) {
    console.error("Error updating professional:", error);
    throw error;
  }
};

// --- Patients ---
export const getPatients = async (options: { page?: number, limit?: number, searchTerm?: string, filterToday?: boolean, adminSelectedLocation?: LocationId | 'all', user?: User | null, lastVisiblePatientId?: string | null } = {}): Promise<{patients: Patient[], totalCount: number, lastVisiblePatientId?: string | null}> => {
  const { page = 1, limit: queryLimit = PATIENTS_PER_PAGE, searchTerm, filterToday, adminSelectedLocation, user, lastVisiblePatientId } = options;

  if (useMockDatabase) {
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

        const dailyAppointments = mockAppointments.filter(appt =>
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
  }

  try {
    if (!firestore) throw new Error("Firestore is not initialized.");
    const patientsRef = collection(firestore, 'patients');
    const queryConstraints: QueryConstraint[] = [];

    if (searchTerm) {
         console.warn("Search term filtering with Firestore is simplified in this mock and may not be performant for large datasets.");
    }

    if (filterToday && user) {
        const todayStart = Timestamp.fromDate(startOfDay(new Date()));
        const todayEnd = Timestamp.fromDate(endOfDay(new Date()));
        const isAdminOrContador = user.role === USER_ROLES.ADMIN || user.role === USER_ROLES.CONTADOR;
        const effectiveLocationId = isAdminOrContador
            ? (adminSelectedLocation === 'all' ? undefined : adminSelectedLocation)
            : user.locationId;

        const appointmentsTodayQueryConstraints: QueryConstraint[] = [
            where('appointmentDateTime', '>=', todayStart),
            where('appointmentDateTime', '<=', todayEnd),
        ];
        if (effectiveLocationId) {
            appointmentsTodayQueryConstraints.push(where('locationId', '==', effectiveLocationId));
        }
        const appointmentsTodayQuery = query(collection(firestore, 'appointments'), ...appointmentsTodayQueryConstraints);
        const appointmentsSnapshot = await getDocs(appointmentsTodayQuery);
        const patientIdsWithAppointmentsToday = new Set(appointmentsSnapshot.docs.map(doc => doc.data().patientId));

        if (patientIdsWithAppointmentsToday.size > 0) {
            queryConstraints.push(where(documentId(), 'in', Array.from(patientIdsWithAppointmentsToday).slice(0,30)));
        } else {
             return { patients: [], totalCount: 0, lastVisiblePatientId: null }; 
        }
    }


    queryConstraints.push(orderBy('lastName'), orderBy('firstName'));

    if (lastVisiblePatientId && page > 1) {
        const lastDoc = await getDoc(doc(firestore, 'patients', lastVisiblePatientId));
        if (lastDoc.exists()) {
            queryConstraints.push(startAfter(lastDoc));
        }
    }
    queryConstraints.push(limit(queryLimit));

    const q = query(patientsRef, ...queryConstraints);
    const querySnapshot = await getDocs(q);
    let patientsData = querySnapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() } as Patient));

    if (searchTerm) {
        const lowerSearchTerm = searchTerm.toLowerCase();
        patientsData = patientsData.filter(p =>
        `${p.firstName} ${p.lastName}`.toLowerCase().includes(lowerSearchTerm) ||
        (p.phone && p.phone.includes(searchTerm))
        );
    }
    
    const countQuery = query(collection(firestore, 'patients'), ...(queryConstraints.filter(c => !(c.type === 'limit' || c.type === 'startAfter')))); 
    const countSnapshot = await getCountFromServer(countQuery);
    const totalCount = countSnapshot.data().count;

    const newLastVisiblePatientId = querySnapshot.docs.length > 0 ? querySnapshot.docs[querySnapshot.docs.length - 1].id : null;

    return { patients: patientsData, totalCount, lastVisiblePatientId: newLastVisiblePatientId };
  } catch (error) {
    console.error("Error fetching patients:", error);
    return { patients: [], totalCount: 0, lastVisiblePatientId: null };
  }
};

const PATIENTS_PER_PAGE = 8;


export const getPatientById = async (id: string): Promise<Patient | undefined> => {
  if (useMockDatabase) {
    return mockPatients.find(p => p.id === id);
  }
  try {
    if (!firestore) throw new Error("Firestore is not initialized.");
    const docRef = doc(firestore, 'patients', id);
    const docSnap = await getDoc(docRef);
    return docSnap.exists() ? { id: docSnap.id, ...docSnap.data() } as Patient : undefined;
  } catch (error) {
    console.error("Error fetching patient by ID:", error);
    throw error;
  }
};

export const findPatient = async (firstName: string, lastName: string): Promise<Patient | undefined> => {
  if (useMockDatabase) {
    return mockPatients.find(p => p.firstName.toLowerCase() === firstName.toLowerCase() && p.lastName.toLowerCase() === lastName.toLowerCase());
  }
  try {
    if (!firestore) throw new Error("Firestore is not initialized.");
    const patientsRef = collection(firestore, 'patients') as CollectionReference<Omit<Patient, 'id'>>;
    const q = query(patientsRef, where('firstName', '==', firstName), where('lastName', '==', lastName));
    const querySnapshot = await getDocs(q);
    if (!querySnapshot.empty) {
      const docSnap = querySnapshot.docs[0];
      return { id: docSnap.id, ...docSnap.data() } as Patient;
    }
    return undefined;
  } catch (error) {
    console.error("Error finding patient:", error);
    throw error;
  }
};

export const addPatient = async (data: Omit<Patient, 'id'>): Promise<Patient> => {
  const newPatientData: Omit<Patient, 'id'> = {
    ...data,
    isDiabetic: data.isDiabetic || false,
  };

  if (useMockDatabase) {
    const newPatient: Patient = {
      id: generateId(),
      ...newPatientData,
    };
    mockPatients.push(newPatient);
    return newPatient;
  }

  try {
    if (!firestore) throw new Error("Firestore is not initialized.");
    const docRef = await addDoc(collection(firestore, 'patients'), newPatientData);
    return { id: docRef.id, ...newPatientData };
  } catch (error) {
    console.error("Error adding patient:", error);
    throw error;
  }
};

export const updatePatient = async (id: string, data: Partial<Patient>): Promise<Patient | undefined> => {
  if (useMockDatabase) {
    const index = mockPatients.findIndex(p => p.id === id);
    if (index !== -1) {
      mockPatients[index] = { ...mockPatients[index], ...data } as Patient;
      return mockPatients[index];
    }
    return undefined;
  }
  try {
    if (!firestore) throw new Error("Firestore is not initialized.");
    const docRef = doc(firestore, 'patients', id);
    await updateDoc(docRef, data);
    const updatedDoc = await getDoc(docRef);
    return updatedDoc.exists() ? { id: updatedDoc.id, ...updatedDoc.data() } as Patient : undefined;
  } catch (error) {
    console.error("Error updating patient:", error);
    throw error;
  }
};

// --- Services ---
export const getServices = async (): Promise<Service[]> => {
  if (useMockDatabase) {
    return [...mockServices].sort((a, b) => a.name.localeCompare(b.name));
  }
  try {
    if (!firestore) throw new Error("Firestore is not initialized.");
    const servicesRef = collection(firestore, 'services') as CollectionReference<Omit<Service, 'id'>>;
    const q = query(servicesRef, orderBy('name'));
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() } as Service));
  } catch (error) {
    console.error("Error fetching services:", error);
    return [];
  }
};

export const getServiceById = async (id: string): Promise<Service | undefined> => {
  if (useMockDatabase) {
    return mockServices.find(s => s.id === id);
  }
  try {
    if (!firestore) throw new Error("Firestore is not initialized.");
    const docRef = doc(firestore, 'services', id);
    const docSnap = await getDoc(docRef);
    return docSnap.exists() ? { id: docSnap.id, ...docSnap.data() } as Service : undefined;
  } catch (error) {
    console.error("Error fetching service by ID:", error);
    throw error;
  }
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
    mockServices.push(newService);
    return newService;
  }
  try {
    if (!firestore) throw new Error("Firestore is not initialized.");
    const docRef = await addDoc(collection(firestore, 'services'), newServiceData);
    return { id: docRef.id, ...newServiceData };
  } catch (error) {
    console.error("Error adding service:", error);
    throw error;
  }
};

export const updateService = async (id: string, data: Partial<ServiceFormData>): Promise<Service | undefined> => {
  if (useMockDatabase) {
    const index = mockServices.findIndex(s => s.id === id);
    if (index !== -1) {
      mockServices[index] = { ...mockServices[index], ...data } as Service;
      return mockServices[index];
    }
    return undefined;
  }
  try {
    if (!firestore) throw new Error("Firestore is not initialized.");
    const docRef = doc(firestore, 'services', id);
    await updateDoc(docRef, data);
    const updatedDoc = await getDoc(docRef);
    return updatedDoc.exists() ? { id: updatedDoc.id, ...updatedDoc.data() } as Service : undefined;
  } catch (error) {
    console.error("Error updating service:", error);
    throw error;
  }
};


const populateAppointment = async (apptData: DocumentData): Promise<Appointment> => {
    const patient = apptData.patientId ? await getPatientById(apptData.patientId) : undefined;
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
        appointmentDateTime: fromTimestampToISO(apptData.appointmentDateTime as Timestamp),
        createdAt: fromTimestampToISO(apptData.createdAt as Timestamp),
        updatedAt: fromTimestampToISO(apptData.updatedAt as Timestamp),
        patient,
        professional,
        service,
        addedServices: addedServicesPopulated,
    } as Appointment;
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
  lastVisibleAppointmentId?: string | null;
}): Promise<{ appointments: Appointment[], totalCount: number, lastVisibleAppointmentId?: string | null }> => {
    const { page = 1, limit: queryLimit = APPOINTMENTS_PER_PAGE, lastVisibleAppointmentId, ...restFilters } = filters;

    if (useMockDatabase) {
        let filteredMockAppointments = [...mockAppointments];

        if (restFilters.locationId) {
            const locationsToFilter = Array.isArray(restFilters.locationId) ? restFilters.locationId : [restFilters.locationId];
            if (locationsToFilter.length > 0) {
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
          filteredMockAppointments = filteredMockAppointments.filter(appt => {
              if (!appt.appointmentDateTime || typeof appt.appointmentDateTime !== 'string') return false;
              try {
                  return dateFnsIsSameDay(parseISO(appt.appointmentDateTime), startOfDay(restFilters.date!));
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

        const populatedAppointmentsPromises = filteredMockAppointments.map(async appt => ({
            ...appt,
            patient: await getPatientById(appt.patientId),
            professional: appt.professionalId ? await getProfessionalById(appt.professionalId) : undefined,
            service: await getServiceById(appt.serviceId as string),
            addedServices: appt.addedServices ? await Promise.all(appt.addedServices.map(async as => ({
            ...as,
            service: await getServiceById(as.serviceId as string),
            professional: as.professionalId ? await getProfessionalById(as.professionalId) : undefined,
            }))) : [],
        }));
        const populatedAppointments = await Promise.all(populatedAppointmentsPromises);
        
        const totalCount = populatedAppointments.length;
        const startIndex = (page - 1) * queryLimit;
        const paginatedAppointments = populatedAppointments.slice(startIndex, startIndex + queryLimit);
        const newLastVisibleId = paginatedAppointments.length > 0 ? paginatedAppointments[paginatedAppointments.length -1].id : null;
        return { appointments: paginatedAppointments, totalCount, lastVisibleAppointmentId: newLastVisibleId };
    }

    try {
        if (!firestore) throw new Error("Firestore is not initialized.");
        const appointmentsRef = collection(firestore, 'appointments');
        const queryConstraints: QueryConstraint[] = [];

        if (restFilters.locationId) {
            const locations = Array.isArray(restFilters.locationId) ? restFilters.locationId : [restFilters.locationId];
            if (locations.length > 0 && locations.length <= 10) { 
                queryConstraints.push(where('locationId', 'in', locations));
            } else if (locations.length === 1) {
                 queryConstraints.push(where('locationId', '==', locations[0]));
            }
        }
        if (restFilters.patientId) queryConstraints.push(where('patientId', '==', restFilters.patientId));
        if (restFilters.professionalId) queryConstraints.push(where('professionalId', '==', restFilters.professionalId));
        if (restFilters.date) {
            queryConstraints.push(where('appointmentDateTime', '>=', Timestamp.fromDate(startOfDay(restFilters.date))));
            queryConstraints.push(where('appointmentDateTime', '<=', Timestamp.fromDate(endOfDay(restFilters.date))));
        }
        if (restFilters.dateRange) {
             queryConstraints.push(where('appointmentDateTime', '>=', Timestamp.fromDate(startOfDay(restFilters.dateRange.start))));
            queryConstraints.push(where('appointmentDateTime', '<=', Timestamp.fromDate(endOfDay(restFilters.dateRange.end))));
        }
        if (restFilters.statuses) {
            const statuses = Array.isArray(restFilters.statuses) ? restFilters.statuses : [restFilters.statuses];
             if (statuses.length > 0 && statuses.length <= 10) {
                queryConstraints.push(where('status', 'in', statuses));
            } else if (statuses.length === 1) {
                 queryConstraints.push(where('status', '==', statuses[0]));
            }
        }

        const isFetchingPastStatuses = restFilters.statuses && (
            (Array.isArray(restFilters.statuses) && restFilters.statuses.some(s => [APPOINTMENT_STATUS.COMPLETED, APPOINTMENT_STATUS.CANCELLED_CLIENT, APPOINTMENT_STATUS.CANCELLED_STAFF, APPOINTMENT_STATUS.NO_SHOW].includes(s))) ||
            (typeof restFilters.statuses === 'string' && [APPOINTMENT_STATUS.COMPLETED, APPOINTMENT_STATUS.CANCELLED_CLIENT, APPOINTMENT_STATUS.CANCELLED_STAFF, APPOINTMENT_STATUS.NO_SHOW].includes(restFilters.statuses as string))
        );

        queryConstraints.push(orderBy('appointmentDateTime', isFetchingPastStatuses ? 'desc' : 'asc'));


        if (lastVisibleAppointmentId && page > 1) {
            const lastDoc = await getDoc(doc(firestore, 'appointments', lastVisibleAppointmentId));
            if(lastDoc.exists()){
                 queryConstraints.push(startAfter(lastDoc));
            }
        }
        queryConstraints.push(limit(queryLimit));


        const q = query(appointmentsRef, ...queryConstraints);
        const querySnapshot = await getDocs(q);
        
        const appointmentsDataPromises = querySnapshot.docs.map(docSnap => populateAppointment({ id: docSnap.id, ...docSnap.data() }));
        const appointmentsData = await Promise.all(appointmentsDataPromises);

        const countQuery = query(collection(firestore, 'appointments'), ...(queryConstraints.filter(c => !(c.type === 'limit' || c.type === 'startAfter'))));
        const countSnapshot = await getCountFromServer(countQuery);
        const totalCount = countSnapshot.data().count;
        
        const newLastVisibleId = querySnapshot.docs.length > 0 ? querySnapshot.docs[querySnapshot.docs.length - 1].id : null;

        return { appointments: appointmentsData, totalCount, lastVisibleAppointmentId: newLastVisibleId };

    } catch (error) {
        console.error("Error fetching appointments:", error);
        return { appointments: [], totalCount: 0, lastVisibleAppointmentId: null };
    }
};
const APPOINTMENTS_PER_PAGE = 8;


export const getAppointmentById = async (id: string): Promise<Appointment | undefined> => {
  if (useMockDatabase) {
    const appt = mockAppointments.find(a => a.id === id);
    if (appt) {
      return {
        ...appt,
        patient: await getPatientById(appt.patientId),
        professional: appt.professionalId ? await getProfessionalById(appt.professionalId) : undefined,
        service: await getServiceById(appt.serviceId as string),
        addedServices: appt.addedServices ? await Promise.all(appt.addedServices.map(async as => ({
          ...as,
          service: await getServiceById(as.serviceId as string),
          professional: as.professionalId ? await getProfessionalById(as.professionalId) : undefined,
        }))) : [],
      };
    }
    return undefined;
  }
  try {
    if (!firestore) throw new Error("Firestore is not initialized.");
    const docRef = doc(firestore, 'appointments', id);
    const docSnap = await getDoc(docRef);
    return docSnap.exists() ? populateAppointment({ id: docSnap.id, ...docSnap.data() }) : undefined;
  } catch (error) {
    console.error("Error fetching appointment by ID:", error);
    throw error;
  }
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


  if (useMockDatabase) {
    const newAppointment: Appointment = {
      id: generateId(),
      ...newAppointmentData,
      createdAt: formatISO(new Date()),
      updatedAt: formatISO(new Date()),
      patient: await getPatientById(patientId!),
      service: await getServiceById(data.serviceId as string),
      professional: actualProfessionalId ? await getProfessionalById(actualProfessionalId) : undefined,
    };
    mockAppointments.push(newAppointment); 
    return newAppointment; 
  }

  try {
    if (!firestore) throw new Error("Firestore is not initialized.");
    const dataToSave = {
        ...newAppointmentData,
        appointmentDateTime: fromDateToTimestamp(newAppointmentData.appointmentDateTime),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
    };
    const docRef = await addDoc(collection(firestore, 'appointments'), dataToSave);
    const savedDoc = await getDoc(docRef); 
    return populateAppointment({ id: savedDoc.id, ...savedDoc.data() });
  } catch (error) {
    console.error("Error adding appointment:", error);
    throw error;
  }
};

export const updateAppointment = async (id: string, data: Partial<Appointment>): Promise<Appointment | undefined> => {
  if (useMockDatabase) {
    const index = mockAppointments.findIndex(a => a.id === id);
    if (index !== -1) {
      // Merge existing data with new partial data
      const updatedAppointmentData = {
        ...mockAppointments[index],
        ...data,
        updatedAt: formatISO(new Date()),
      };

      // Repopulate nested objects based on the IDs in updatedAppointmentData
      const patient = await getPatientById(updatedAppointmentData.patientId);
      const professional = updatedAppointmentData.professionalId
        ? await getProfessionalById(updatedAppointmentData.professionalId)
        : undefined;
      const service = await getServiceById(updatedAppointmentData.serviceId as string);
      
      let addedServicesPopulated = updatedAppointmentData.addedServices;
      if (updatedAppointmentData.addedServices) {
        addedServicesPopulated = await Promise.all(updatedAppointmentData.addedServices.map(async as => ({
          ...as,
          service: as.serviceId ? await getServiceById(as.serviceId as string) : undefined,
          professional: as.professionalId ? await getProfessionalById(as.professionalId) : undefined,
        })));
      }

      mockAppointments[index] = {
        ...updatedAppointmentData,
        patient,
        professional,
        service,
        addedServices: addedServicesPopulated,
      };
      return mockAppointments[index];
    }
    return undefined;
  }

  // Firestore logic
  try {
    if (!firestore) throw new Error("Firestore is not initialized.");
    const docRef = doc(firestore, 'appointments', id);
    const updatePayload: Partial<DocumentData> = { ...data };

    // Remove nested objects before sending to Firestore if they are meant to be populated client-side
    delete updatePayload.patient;
    delete updatePayload.professional;
    delete updatePayload.service;
    // For addedServices, only store IDs or simple objects if not fully denormalizing
    if (updatePayload.addedServices) {
      updatePayload.addedServices = updatePayload.addedServices.map(as => ({
        serviceId: as.serviceId,
        professionalId: as.professionalId,
        price: as.price,
      }));
    }


    if (data.appointmentDateTime) {
      updatePayload.appointmentDateTime = fromDateToTimestamp(data.appointmentDateTime);
    }
    updatePayload.updatedAt = serverTimestamp();


    await updateDoc(docRef, updatePayload);
    const updatedDoc = await getDoc(docRef);
    return updatedDoc.exists() ? populateAppointment({ id: updatedDoc.id, ...updatedDoc.data() }) : undefined;
  } catch (error) {
    console.error("Error updating appointment:", error);
    throw error;
  }
};

export const getPatientAppointmentHistory = async (
  patientId: string,
  options: { page?: number, limit?: number, lastVisibleAppointmentId?: string | null } = {}
): Promise<{ appointments: Appointment[], totalCount: number, lastVisibleAppointmentId?: string | null }> => {
    const { page = 1, limit: queryLimit = APPOINTMENTS_PER_PAGE, lastVisibleAppointmentId } = options;

    if (useMockDatabase) {
        const todayDate = startOfDay(new Date());
        const historyAppointments = mockAppointments.filter(appt =>
          appt.patientId === patientId &&
          appt.appointmentDateTime && parseISO(appt.appointmentDateTime) < todayDate &&
          [APPOINTMENT_STATUS.COMPLETED, APPOINTMENT_STATUS.NO_SHOW, APPOINTMENT_STATUS.CANCELLED_CLIENT, APPOINTMENT_STATUS.CANCELLED_STAFF].includes(appt.status)
        ).sort((a, b) => parseISO(b.appointmentDateTime).getTime() - parseISO(a.appointmentDateTime).getTime());

        const populatedHistoryPromises = historyAppointments.map(async appt => ({
        ...appt,
        patient: await getPatientById(appt.patientId),
        professional: appt.professionalId ? await getProfessionalById(appt.professionalId) : undefined,
        service: await getServiceById(appt.serviceId as string),
        addedServices: appt.addedServices ? await Promise.all(appt.addedServices.map(async as => ({
            ...as,
            service: await getServiceById(as.serviceId as string),
            professional: as.professionalId ? await getProfessionalById(as.professionalId) : undefined,
        }))) : []
        }));
        const populatedHistory = await Promise.all(populatedHistoryPromises);
        
        const totalCount = populatedHistory.length;
        const startIndex = (page - 1) * queryLimit;
        const paginatedAppointments = populatedHistory.slice(startIndex, startIndex + queryLimit);
        const newLastVisibleId = paginatedAppointments.length > 0 ? paginatedAppointments[paginatedAppointments.length -1].id : null;
        return { appointments: paginatedAppointments, totalCount, lastVisibleAppointmentId: newLastVisibleId };
    }

    try {
        if (!firestore) throw new Error("Firestore is not initialized.");
        const appointmentsRef = collection(firestore, 'appointments');
        const queryConstraints: QueryConstraint[] = [
            where('patientId', '==', patientId),
            where('appointmentDateTime', '<', Timestamp.fromDate(startOfDay(new Date()))),
            where('status', 'in', [APPOINTMENT_STATUS.COMPLETED, APPOINTMENT_STATUS.NO_SHOW, APPOINTMENT_STATUS.CANCELLED_CLIENT, APPOINTMENT_STATUS.CANCELLED_STAFF]),
            orderBy('appointmentDateTime', 'desc'),
        ];

        if (lastVisibleAppointmentId && page > 1) {
            const lastDoc = await getDoc(doc(firestore, 'appointments', lastVisibleAppointmentId));
            if(lastDoc.exists()){
                queryConstraints.push(startAfter(lastDoc));
            }
        }
        queryConstraints.push(limit(queryLimit));

        const q = query(appointmentsRef, ...queryConstraints);
        const querySnapshot = await getDocs(q);

        const appointmentsDataPromises = querySnapshot.docs.map(docSnap => populateAppointment({id: docSnap.id, ...docSnap.data()}));
        const appointmentsData = await Promise.all(appointmentsDataPromises);
        
        const countQueryConstraints = [
            where('patientId', '==', patientId),
            where('appointmentDateTime', '<', Timestamp.fromDate(startOfDay(new Date()))),
            where('status', 'in', [APPOINTMENT_STATUS.COMPLETED, APPOINTMENT_STATUS.NO_SHOW, APPOINTMENT_STATUS.CANCELLED_CLIENT, APPOINTMENT_STATUS.CANCELLED_STAFF]),
        ];
        const countQuery = query(collection(firestore, 'appointments'), ...countQueryConstraints);
        const countSnapshot = await getCountFromServer(countQuery);
        const totalCount = countSnapshot.data().count;

        const newLastVisibleId = querySnapshot.docs.length > 0 ? querySnapshot.docs[querySnapshot.docs.length - 1].id : null;

        return { appointments: appointmentsData, totalCount, lastVisibleAppointmentId: newLastVisibleId };
    } catch (error) {
        console.error("Error fetching patient appointment history:", error);
        return { appointments: [], totalCount: 0, lastVisibleAppointmentId: null };
    }
};


export const seedInitialData = async () => {
    if (!firestore || useMockDatabase) {
        console.log("Using mock data. Seeding is not applicable as data is in-memory.");
        return;
    }
    console.log("Attempting to seed Firestore with initial data if collections are empty...");

    const collectionsToSeed: { name: string, data: any[], checkField?: string }[] = [
        { name: 'users', data: mockUsers.map(({id, ...rest}) => rest), checkField: 'username' }, 
        { name: 'professionals', data: mockProfessionals.map(({id, ...rest}) => rest) },
        { name: 'patients', data: mockPatients.map(({id, ...rest}) => rest) },
        { name: 'services', data: mockServices.map(({id, ...rest}) => rest) },
        { name: 'appointments', data: initialMockAppointments.map(({id, createdAt, updatedAt, patient, professional, service, addedServices, appointmentDateTime, ...rest}) => ({
            ...rest,
            appointmentDateTime: fromDateToTimestamp(appointmentDateTime)
        }))},
    ];

    const batch = writeBatch(firestore);
    let operationsCount = 0;

    for (const { name, data, checkField } of collectionsToSeed) {
        const collectionRef = collection(firestore, name);
        const snapshot = await getDocs(query(collectionRef, limit(1))); 

        if (snapshot.empty) {
            console.log(`Collection '${name}' is empty. Seeding data...`);
            for (const item of data) {
                let docExists = false;
                if (checkField && item[checkField]) {
                    const checkQuery = query(collectionRef, where(checkField, '==', item[checkField]), limit(1));
                    const checkSnapshot = await getDocs(checkQuery);
                    if (!checkSnapshot.empty) {
                        docExists = true;
                        console.log(`Document in '${name}' with ${checkField}='${item[checkField]}' already exists. Skipping.`);
                    }
                }

                if (!docExists) {
                    const docToCreate = { ...item };
                    if (name === 'appointments') { 
                        docToCreate.createdAt = serverTimestamp();
                        docToCreate.updatedAt = serverTimestamp();
                    }
                    const newDocRef = doc(collectionRef); 
                    batch.set(newDocRef, docToCreate);
                    operationsCount++;
                    if (operationsCount >= 499) { 
                        console.warn("Firestore batch limit nearing. Committing current batch.");
                        await batch.commit();
                        // batch = writeBatch(firestore); // This was incorrect; create a new batch
                        const newBatch = writeBatch(firestore); // Create a new batch
                        // copy operations from old batch to new batch or re-evaluate how batching is done for >500
                        // For simplicity, the current seeder doesn't handle >500 ops correctly after first commit.
                        // This part needs a more robust implementation if seeding >500 items.
                        // This example will just log a warning and stop adding to the *original* batch.
                        console.error("Seeding more than 500 items requires handling multiple batches. Current seeder version is simplified.");
                        return; 
                    }
                }
            }
        } else {
            console.log(`Collection '${name}' is not empty. Skipping seed.`);
        }
    }

    if (operationsCount > 0) {
        try {
            await batch.commit();
            console.log("Firestore successfully seeded with initial data where collections were empty.");
        } catch (error) {
            console.error("Error committing batch for seeding Firestore:", error);
        }
    } else {
        console.log("No new data seeded to Firestore (collections might not be empty or no data to seed).");
    }
};


if (process.env.NODE_ENV === 'development' && !useMockDatabase) { 
    // seedInitialData().catch(console.error);
    console.log("Automatic seeding in development is currently commented out in data.ts. Uncomment to enable.");
}
