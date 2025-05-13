import type { User, Professional, Patient, Service, Appointment, AppointmentFormData, ProfessionalFormData, AppointmentStatus, ServiceFormData } from '@/types';
import { LOCATIONS, USER_ROLES, SERVICES as SERVICES_CONSTANTS, APPOINTMENT_STATUS, LocationId, ServiceId as ConstantServiceId, APPOINTMENT_STATUS_DISPLAY, PAYMENT_METHODS } from './constants';
import { formatISO, parseISO, addDays, setHours, setMinutes, startOfDay, endOfDay, addMinutes, isSameDay as dateFnsIsSameDay, startOfMonth, endOfMonth, differenceInYears, subDays } from 'date-fns';
import { firestore } from './firebase-config'; 
import { collection, addDoc, getDocs, doc, getDoc, updateDoc, query, where, deleteDoc, writeBatch, serverTimestamp, Timestamp, runTransaction, setDoc, QueryConstraint, orderBy, limit, startAfter,getCountFromServer, CollectionReference, DocumentData, documentId } from 'firebase/firestore';

// --- Helper to convert Firestore Timestamps to ISO strings and vice-versa ---
const fromTimestampToISO = (timestamp: Timestamp | undefined): string | undefined => {
  if (!timestamp) return undefined;
  try {
    return timestamp.toDate().toISOString();
  } catch (error) {
    console.warn("Failed to convert Firestore Timestamp to ISO string:", timestamp, error);
    return undefined;
  }
}

const fromDateToTimestamp = (date: Date | string | undefined): Timestamp | undefined => {
  if (!date) return undefined;
  try {
    const dateObj = typeof date === 'string' ? parseISO(date) : date;
    if (isNaN(dateObj.getTime())) {
      console.warn("Invalid date string provided for Firestore Timestamp conversion:", date);
      return undefined;
    }
    return Timestamp.fromDate(dateObj);
  } catch (error) {
    console.warn("Failed to convert Date/ISO string to Firestore Timestamp:", date, error);
    return undefined;
  }
}

const ANY_PROFESSIONAL_VALUE = "_any_professional_placeholder_";

// --- Mock Data Configuration ---
export const useMockDatabase = process.env.NEXT_PUBLIC_USE_MOCK_DATABASE === 'true';
console.log("Data layer: Using mock database:", useMockDatabase);


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
    biWeeklyEarnings: (500 + (locIndex * 100) + (i * 50)), // Deterministic value
  }))
);

const initialMockPatientsData: Patient[] = [
  { id: 'pat001', firstName: 'Ana', lastName: 'García', phone: '111222333', preferredProfessionalId: initialMockProfessionalsData[0]?.id, notes: 'Paciente regular, prefiere citas por la mañana.', dateOfBirth: '1985-05-15', isDiabetic: false },
  { id: 'pat002', firstName: 'Luis', lastName: 'Martínez', phone: '444555666', notes: 'Primera visita.', dateOfBirth: '1992-11-20', isDiabetic: true },
  { id: 'pat003', firstName: 'Elena', lastName: 'Ruiz', phone: '777888999', dateOfBirth: '2000-07-01', isDiabetic: false },
  { id: 'pat004', firstName: 'Carlos', lastName: 'Vargas', phone: '222333444', dateOfBirth: '1970-03-25', isDiabetic: true, notes: "Sensibilidad en el pie izquierdo." },
  { id: 'pat005', firstName: 'Sofía', lastName: 'Chávez', phone: '555666777', dateOfBirth: '1998-12-05', isDiabetic: false, preferredProfessionalId: initialMockProfessionalsData[1]?.id },
];

const initialMockServicesData: Service[] = SERVICES_CONSTANTS.map((s_const, index) => ({
  id: s_const.id as string,
  name: s_const.name,
  defaultDuration: s_const.defaultDuration,
  price: (50 + index * 10), // Deterministic price
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

// --- Global Mock Database Store ---
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
    console.log("Initializing global mock DB store...");
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

// --- Auth ---
export const getUserByUsername = async (username: string): Promise<User | undefined> => {
    if (!useMockDatabase) {
        if (!firestore) throw new Error("Firestore is not initialized.");
        const usersRef = collection(firestore, 'users');
        const q = query(usersRef, where('username', '==', username));
        const querySnapshot = await getDocs(q);
        if (!querySnapshot.empty) {
            const userDoc = querySnapshot.docs[0];
            return { id: userDoc.id, ...userDoc.data() } as User;
        }
        return undefined;
    } else {
        return mockDB.users.find(u => u.username === username);
    }
};

// --- Professionals ---
export const getProfessionals = async (locationId?: LocationId): Promise<Professional[]> => {
    if (!useMockDatabase) {
        if (!firestore) throw new Error("Firestore is not initialized.");
        const professionalsRef = collection(firestore, 'professionals');
        let q;
        if (locationId) {
            q = query(professionalsRef, where('locationId', '==', locationId));
        } else {
            q = query(professionalsRef);
        }
        const querySnapshot = await getDocs(q);
        return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Professional));
    } else {
        if (locationId) {
            return mockDB.professionals.filter(p => p.locationId === locationId);
        }
        return [...mockDB.professionals];
    }
};

export const getProfessionalById = async (id: string): Promise<Professional | undefined> => {
    if (!useMockDatabase) {
        if (!firestore) throw new Error("Firestore is not initialized.");
        const docRef = doc(firestore, 'professionals', id);
        const docSnap = await getDoc(docRef);
        return docSnap.exists() ? { id: docSnap.id, ...docSnap.data() } as Professional : undefined;
    } else {
        return mockDB.professionals.find(p => p.id === id);
    }
};

export const addProfessional = async (data: Omit<ProfessionalFormData, 'id'>): Promise<Professional> => {
  const newProfessionalData: Omit<Professional, 'id' | 'biWeeklyEarnings' | 'specializations'> = { // Removed specializations from here too
    firstName: data.firstName,
    lastName: data.lastName,
    locationId: data.locationId,
    phone: data.phone,
  };

  if (!useMockDatabase) {
    if (!firestore) throw new Error("Firestore is not initialized.");
    const docRef = await addDoc(collection(firestore, 'professionals'), newProfessionalData);
    return { id: docRef.id, ...newProfessionalData, biWeeklyEarnings: 0, specializations: data.specializations || [] };
  } else {
    const newProfessional: Professional = {
      id: generateId(),
      ...newProfessionalData,
      biWeeklyEarnings: 0,
      specializations: data.specializations || [],
    };
    mockDB.professionals.push(newProfessional);
    return newProfessional;
  }
};

export const updateProfessional = async (id: string, data: Partial<ProfessionalFormData>): Promise<Professional | undefined> => {
    const updatePayload = { ...data };
    // Ensure specializations is handled correctly for Firestore (e.g., if it's an array)
    if (updatePayload.specializations === undefined) {
        delete updatePayload.specializations; // Or set to null if your schema allows
    }

    if (!useMockDatabase) {
        if (!firestore) throw new Error("Firestore is not initialized.");
        const docRef = doc(firestore, 'professionals', id);
        await updateDoc(docRef, updatePayload);
        const updatedDoc = await getDoc(docRef);
        return updatedDoc.exists() ? { id: updatedDoc.id, ...updatedDoc.data() } as Professional : undefined;
    } else {
        const index = mockDB.professionals.findIndex(p => p.id === id);
        if (index !== -1) {
            mockDB.professionals[index] = { ...mockDB.professionals[index], ...updatePayload } as Professional;
            return mockDB.professionals[index];
        }
        return undefined;
    }
};

// --- Patients ---
const PATIENTS_PER_PAGE = 8;
export const getPatients = async (options: { page?: number, limit?: number, searchTerm?: string, filterToday?: boolean, adminSelectedLocation?: LocationId | 'all', user?: User | null, lastVisiblePatientId?: string | null } = {}): Promise<{patients: Patient[], totalCount: number, lastVisiblePatientId?: string | null}> => {
  const { page = 1, limit: queryLimit = PATIENTS_PER_PAGE, searchTerm, filterToday, adminSelectedLocation, user, lastVisiblePatientId: startAfterId } = options;

  if (!useMockDatabase) {
    if (!firestore) throw new Error("Firestore is not initialized.");
    const patientsRef = collection(firestore, 'patients') as CollectionReference<DocumentData>;
    let constraints: QueryConstraint[] = [];

    if (searchTerm) {
      const lowerSearchTerm = searchTerm.toLowerCase();
      // This is a simplified search. For robust search, consider dedicated search services or more complex query structures.
      // Creating a 'searchableName' field in lowercase in your documents could help.
      // Example: constraints.push(where('searchableName', '>=', lowerSearchTerm), where('searchableName', '<=', lowerSearchTerm + '\uf8ff'));
      // For now, we'll stick to a lastName based search for Firestore as an example
      constraints.push(orderBy('lastName'), where('lastName', '>=', lowerSearchTerm), where('lastName', '<=', lowerSearchTerm + '\uf8ff'));
    }

    if (filterToday && user) {
        const todayStart = startOfDay(new Date());
        const todayEnd = endOfDay(new Date());
        const isAdminOrContador = user.role === USER_ROLES.ADMIN || user.role === USER_ROLES.CONTADOR;
        const effectiveLocationId = isAdminOrContador
            ? (adminSelectedLocation === 'all' ? undefined : adminSelectedLocation)
            : user.locationId;

        const appointmentsQueryConstraints: QueryConstraint[] = [
            where('appointmentDateTime', '>=', fromDateToTimestamp(todayStart)),
            where('appointmentDateTime', '<=', fromDateToTimestamp(todayEnd)),
        ];
        if (effectiveLocationId) {
            appointmentsQueryConstraints.push(where('locationId', '==', effectiveLocationId));
        }
        const dailyAppointmentsQuery = query(collection(firestore, 'appointments'), ...appointmentsQueryConstraints);
        const dailyAppointmentsSnap = await getDocs(dailyAppointmentsQuery);
        const patientIdsWithAppointmentsToday = new Set(dailyAppointmentsSnap.docs.map(d => d.data().patientId as string));

        if (patientIdsWithAppointmentsToday.size > 0) {
            const patientIdsArray = Array.from(patientIdsWithAppointmentsToday).slice(0,30); // Firestore 'in' query limit
            if(patientIdsArray.length > 0) {
                 constraints.push(where(documentId(), 'in', patientIdsArray));
            } else {
                return { patients: [], totalCount: 0, lastVisiblePatientId: null };
            }
        } else {
            return { patients: [], totalCount: 0, lastVisiblePatientId: null };
        }
    }
    
    const countQuery = query(patientsRef, ...constraints.filter(c => !(c.type === 'limit' || c.type === 'start_after' || c.type === 'order_by')));
    const totalCountSnapshot = await getCountFromServer(countQuery);
    const totalCount = totalCountSnapshot.data().count;

    constraints.push(orderBy('firstName'), orderBy('lastName')); 
    if (startAfterId) {
        const lastVisibleDoc = await getDoc(doc(patientsRef, startAfterId));
        if (lastVisibleDoc.exists()) {
            constraints.push(startAfter(lastVisibleDoc));
        }
    }
    constraints.push(limit(queryLimit));
    
    const finalQuery = query(patientsRef, ...constraints);
    const querySnapshot = await getDocs(finalQuery);
    
    const fetchedPatients = querySnapshot.docs.map(d => ({ id: d.id, ...d.data() } as Patient));
    const newLastVisibleId = fetchedPatients.length > 0 ? fetchedPatients[fetchedPatients.length - 1].id : null;

    return { patients: fetchedPatients, totalCount, lastVisiblePatientId: newLastVisibleId };

  } else { 
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
};

export const getPatientById = async (id: string): Promise<Patient | undefined> => {
    if (!useMockDatabase) {
        if (!firestore) throw new Error("Firestore is not initialized.");
        const docRef = doc(firestore, 'patients', id);
        const docSnap = await getDoc(docRef);
        return docSnap.exists() ? { id: docSnap.id, ...docSnap.data() } as Patient : undefined;
    } else {
        return mockDB.patients.find(p => p.id === id);
    }
};

export const findPatient = async (firstName: string, lastName: string): Promise<Patient | undefined> => {
    if (!useMockDatabase) {
        if (!firestore) throw new Error("Firestore is not initialized.");
        const q = query(collection(firestore, 'patients'), where('firstName', '==', firstName), where('lastName', '==', lastName), limit(1));
        const querySnapshot = await getDocs(q);
        if (!querySnapshot.empty) {
            const docSnap = querySnapshot.docs[0];
            return { id: docSnap.id, ...docSnap.data() } as Patient;
        }
        return undefined;
    } else {
        return mockDB.patients.find(p => p.firstName.toLowerCase() === firstName.toLowerCase() && p.lastName.toLowerCase() === lastName.toLowerCase());
    }
};

export const addPatient = async (data: Omit<Patient, 'id'>): Promise<Patient> => {
  const newPatientData: Omit<Patient, 'id'> = {
    ...data,
    isDiabetic: data.isDiabetic || false,
  };
  if (!useMockDatabase) {
    if (!firestore) throw new Error("Firestore is not initialized.");
    const docRef = await addDoc(collection(firestore, 'patients'), newPatientData);
    return { id: docRef.id, ...newPatientData };
  } else {
    const newPatient: Patient = {
      id: generateId(),
      ...newPatientData,
    };
    mockDB.patients.push(newPatient);
    return newPatient;
  }
};

export const updatePatient = async (id: string, data: Partial<Patient>): Promise<Patient | undefined> => {
    if (!useMockDatabase) {
        if (!firestore) throw new Error("Firestore is not initialized.");
        const docRef = doc(firestore, 'patients', id);
        await updateDoc(docRef, data);
        const updatedDoc = await getDoc(docRef);
        return updatedDoc.exists() ? { id: updatedDoc.id, ...updatedDoc.data() } as Patient : undefined;
    } else {
        const index = mockDB.patients.findIndex(p => p.id === id);
        if (index !== -1) {
            mockDB.patients[index] = { ...mockDB.patients[index], ...data } as Patient;
            return mockDB.patients[index];
        }
        return undefined;
    }
};

// --- Services ---
export const getServices = async (): Promise<Service[]> => {
    if (!useMockDatabase) {
        if (!firestore) throw new Error("Firestore is not initialized.");
        const servicesRef = collection(firestore, 'services');
        const q = query(servicesRef, orderBy('name'));
        const querySnapshot = await getDocs(q);
        return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Service));
    } else {
        return [...mockDB.services].sort((a, b) => a.name.localeCompare(b.name));
    }
};

export const getServiceById = async (id: string): Promise<Service | undefined> => {
    if (!useMockDatabase) {
        if (!firestore) throw new Error("Firestore is not initialized.");
        const docRef = doc(firestore, 'services', id);
        const docSnap = await getDoc(docRef);
        return docSnap.exists() ? { id: docSnap.id, ...docSnap.data() } as Service : undefined;
    } else {
        return mockDB.services.find(s => s.id === id);
    }
};

export const addService = async (data: ServiceFormData): Promise<Service> => {
  const newServiceData: Omit<Service, 'id'> = {
    name: data.name,
    defaultDuration: data.defaultDuration,
    price: data.price,
  };
  if (!useMockDatabase) {
    if (!firestore) throw new Error("Firestore is not initialized.");
    const docRef = await addDoc(collection(firestore, 'services'), newServiceData);
    return { id: docRef.id, ...newServiceData };
  } else {
    const newService: Service = {
      id: data.id || generateId(), 
      ...newServiceData,
    };
    mockDB.services.push(newService);
    return newService;
  }
};

export const updateService = async (id: string, data: Partial<ServiceFormData>): Promise<Service | undefined> => {
    if (!useMockDatabase) {
        if (!firestore) throw new Error("Firestore is not initialized.");
        const docRef = doc(firestore, 'services', id);
        await updateDoc(docRef, data);
        const updatedDoc = await getDoc(docRef);
        return updatedDoc.exists() ? { id: updatedDoc.id, ...updatedDoc.data() } as Service : undefined;
    } else {
        const index = mockDB.services.findIndex(s => s.id === id);
        if (index !== -1) {
            mockDB.services[index] = { ...mockDB.services[index], ...data } as Service;
            return mockDB.services[index];
        }
        return undefined;
    }
};


const populateAppointment = async (apptData: any): Promise<Appointment> => {
    const patient = useMockDatabase ? mockDB.patients.find(p => p.id === apptData.patientId) : await getPatientById(apptData.patientId);
    const professional = apptData.professionalId ? (useMockDatabase ? mockDB.professionals.find(p => p.id === apptData.professionalId) : await getProfessionalById(apptData.professionalId)) : undefined;
    const service = apptData.serviceId ? (useMockDatabase ? mockDB.services.find(s => s.id === apptData.serviceId) : await getServiceById(apptData.serviceId as string)) : undefined;

    let addedServicesPopulated = [];
    if (apptData.addedServices && Array.isArray(apptData.addedServices)) {
        addedServicesPopulated = await Promise.all(
            apptData.addedServices.map(async (as: any) => ({
                ...as,
                service: as.serviceId ? (useMockDatabase ? mockDB.services.find(s => s.id === as.serviceId) : await getServiceById(as.serviceId as string)) : undefined,
                professional: as.professionalId ? (useMockDatabase ? mockDB.professionals.find(p => p.id === as.professionalId) : await getProfessionalById(as.professionalId)) : undefined,
            }))
        );
    }
    
    return {
        ...apptData,
        appointmentDateTime: typeof apptData.appointmentDateTime === 'object' && apptData.appointmentDateTime.toDate ? fromTimestampToISO(apptData.appointmentDateTime as Timestamp) : apptData.appointmentDateTime,
        createdAt: typeof apptData.createdAt === 'object' && apptData.createdAt.toDate ? fromTimestampToISO(apptData.createdAt as Timestamp) : apptData.createdAt,
        updatedAt: typeof apptData.updatedAt === 'object' && apptData.updatedAt.toDate ? fromTimestampToISO(apptData.updatedAt as Timestamp) : apptData.updatedAt,
        patient,
        professional,
        service,
        addedServices: addedServicesPopulated,
    } as Appointment;
};


// --- Appointments ---
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
  const queryLimit = queryLimitParam ?? (restFilters.statuses ? APPOINTMENTS_PER_PAGE_HISTORY : 1000); // Default high for non-history view

  if (!useMockDatabase) {
    if (!firestore) throw new Error("Firestore is not initialized.");
    const appointmentsRef = collection(firestore, 'appointments') as CollectionReference<DocumentData>;
    let constraints: QueryConstraint[] = [];

    if (restFilters.locationId) {
        const locationsToFilter = Array.isArray(restFilters.locationId) ? restFilters.locationId : [restFilters.locationId];
        if (locationsToFilter.length > 0 && locationsToFilter[0] !== undefined) {
            constraints.push(where('locationId', 'in', locationsToFilter));
        }
    }
    if (restFilters.patientId) constraints.push(where('patientId', '==', restFilters.patientId));
    if (restFilters.professionalId) constraints.push(where('professionalId', '==', restFilters.professionalId));
    
    if (restFilters.date) {
        const targetDateStart = startOfDay(restFilters.date);
        const targetDateEnd = endOfDay(restFilters.date);
        constraints.push(where('appointmentDateTime', '>=', fromDateToTimestamp(targetDateStart)));
        constraints.push(where('appointmentDateTime', '<=', fromDateToTimestamp(targetDateEnd)));
    } else if (restFilters.dateRange) {
        constraints.push(where('appointmentDateTime', '>=', fromDateToTimestamp(restFilters.dateRange.start)));
        constraints.push(where('appointmentDateTime', '<=', fromDateToTimestamp(restFilters.dateRange.end)));
    }

    if (restFilters.statuses) {
        const statusesToFilter = Array.isArray(restFilters.statuses) ? restFilters.statuses : [restFilters.statuses];
        if (statusesToFilter.length > 0) {
            constraints.push(where('status', 'in', statusesToFilter));
        }
    }

    const isFetchingPastStatuses = restFilters.statuses && (
        (Array.isArray(restFilters.statuses) && restFilters.statuses.some(s => [APPOINTMENT_STATUS.COMPLETED, APPOINTMENT_STATUS.CANCELLED_CLIENT, APPOINTMENT_STATUS.CANCELLED_STAFF, APPOINTMENT_STATUS.NO_SHOW].includes(s as AppointmentStatus))) ||
        (typeof restFilters.statuses === 'string' && [APPOINTMENT_STATUS.COMPLETED, APPOINTMENT_STATUS.CANCELLED_CLIENT, APPOINTMENT_STATUS.CANCELLED_STAFF, APPOINTMENT_STATUS.NO_SHOW].includes(restFilters.statuses as AppointmentStatus))
    );
    
    const sortOrder = isFetchingPastStatuses ? 'desc' : 'asc';
    constraints.push(orderBy('appointmentDateTime', sortOrder));

    const countQuery = query(appointmentsRef, ...constraints.filter(c => !(c.type === 'limit' || c.type === 'start_after' || c.type === 'order_by'))); 
    const totalCountSnapshot = await getCountFromServer(countQuery);
    const totalCount = totalCountSnapshot.data().count;

    if (startAfterId) {
        const lastVisibleDoc = await getDoc(doc(appointmentsRef, startAfterId));
        if (lastVisibleDoc.exists()) {
            constraints.push(startAfter(lastVisibleDoc));
        }
    }
    constraints.push(limit(queryLimit));

    const finalQuery = query(appointmentsRef, ...constraints);
    const querySnapshot = await getDocs(finalQuery);
    
    const populatedAppointmentsPromises = querySnapshot.docs.map(d => populateAppointment({id: d.id, ...d.data()}));
    const populatedAppointments = await Promise.all(populatedAppointmentsPromises);
    
    const newLastVisibleId = populatedAppointments.length > 0 ? populatedAppointments[populatedAppointments.length -1].id : null;
    return { appointments: populatedAppointments, totalCount, lastVisibleAppointmentId: newLastVisibleId };

  } else { 
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
    return { appointments: paginatedResult, totalCount, lastVisibleAppointmentId: newLastVisibleId };
  }
};


export const getAppointmentById = async (id: string): Promise<Appointment | undefined> => {
    if (!useMockDatabase) {
        if (!firestore) throw new Error("Firestore is not initialized.");
        const docRef = doc(firestore, 'appointments', id);
        const docSnap = await getDoc(docRef);
        return docSnap.exists() ? populateAppointment({id: docSnap.id, ...docSnap.data()}) : undefined;
    } else {
        const appt = mockDB.appointments.find(a => a.id === id);
        return appt ? populateAppointment(appt) : undefined;
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
    const preferredProf = useMockDatabase 
      ? mockDB.professionals.find(p => p.id === data.preferredProfessionalId && p.locationId === data.locationId)
      : await getProfessionalById(data.preferredProfessionalId); // Assuming getProfessionalById handles location check or you do it after
    
    if (preferredProf && preferredProf.locationId === data.locationId) {
      actualProfessionalId = preferredProf.id;
    } else {
      console.warn(`Preferred professional ${data.preferredProfessionalId} not found or not in location ${data.locationId}. Appointment will be unassigned.`);
      actualProfessionalId = null;
    }
  } else {
    actualProfessionalId = null;
  }

  const appointmentDateTime = formatISO(setMinutes(setHours(data.appointmentDate, appointmentDateHours), appointmentDateMinutes));

  const newAppointmentData: Omit<Appointment, 'id' | 'createdAt' | 'updatedAt' | 'patient' | 'service' | 'professional'> & { appointmentDateTime: string | Timestamp, createdAt?: Timestamp, updatedAt?: Timestamp } = {
    patientId: patientId!,
    locationId: data.locationId,
    serviceId: data.serviceId,
    professionalId: actualProfessionalId,
    appointmentDateTime: useMockDatabase ? appointmentDateTime : fromDateToTimestamp(appointmentDateTime)!,
    durationMinutes: service?.defaultDuration || 60,
    preferredProfessionalId: data.preferredProfessionalId === ANY_PROFESSIONAL_VALUE ? undefined : data.preferredProfessionalId,
    bookingObservations: data.bookingObservations,
    status: APPOINTMENT_STATUS.BOOKED,
    attachedPhotos: [],
    addedServices: [],
  };

  if (!useMockDatabase) {
    if (!firestore) throw new Error("Firestore is not initialized.");
    const submissionData = { ...newAppointmentData, createdAt: serverTimestamp(), updatedAt: serverTimestamp() };
    const docRef = await addDoc(collection(firestore, 'appointments'), submissionData);
    const createdDoc = await getDoc(docRef);
    return populateAppointment({id: createdDoc.id, ...createdDoc.data()});
  } else {
    const newAppointment: Appointment = {
      id: generateId(),
      ...newAppointmentData,
      appointmentDateTime: appointmentDateTime, 
      createdAt: formatISO(new Date()),
      updatedAt: formatISO(new Date()),
    };
    const populatedNewAppointment = await populateAppointment(newAppointment);
    mockDB.appointments.push(populatedNewAppointment);
    return populatedNewAppointment;
  }
};

export const updateAppointment = async (id: string, data: Partial<Appointment>): Promise<Appointment | undefined> => {
  const updateData: any = { ...data, updatedAt: useMockDatabase ? formatISO(new Date()) : serverTimestamp() };
  
  if (data.appointmentDateTime && !useMockDatabase) {
    updateData.appointmentDateTime = fromDateToTimestamp(data.appointmentDateTime);
  } else if (data.appointmentDateTime && useMockDatabase) {
    // Ensure it's a string for mock DB
    updateData.appointmentDateTime = typeof data.appointmentDateTime === 'object' 
        ? formatISO(data.appointmentDateTime) 
        : data.appointmentDateTime;
  }


  if (!useMockDatabase) {
    if (!firestore) throw new Error("Firestore is not initialized.");
    const docRef = doc(firestore, 'appointments', id);
    delete updateData.patient;
    delete updateData.professional;
    delete updateData.service;
    if (updateData.addedServices) {
        updateData.addedServices = updateData.addedServices.map((as: any) => ({
            serviceId: as.serviceId,
            professionalId: as.professionalId,
            price: as.price
        }));
    }
    await updateDoc(docRef, updateData);
    const updatedDoc = await getDoc(docRef);
    return updatedDoc.exists() ? populateAppointment({id: updatedDoc.id, ...updatedDoc.data()}) : undefined;
  } else {
    const index = mockDB.appointments.findIndex(a => a.id === id);
    if (index !== -1) {
      mockDB.appointments[index] = {
        ...mockDB.appointments[index],
        ...data, 
        updatedAt: formatISO(new Date()), 
      };
      const updatedPopulatedAppointment = await populateAppointment(mockDB.appointments[index]);
      mockDB.appointments[index] = updatedPopulatedAppointment;
      return updatedPopulatedAppointment;
    }
    return undefined;
  }
};

export const getPatientAppointmentHistory = async (
  patientId: string,
  options: { page?: number, limit?: number, lastVisibleAppointmentId?: string | null } = {}
): Promise<{ appointments: Appointment[], totalCount: number, lastVisibleAppointmentId?: string | null }> => {
  const { page = 1, limit: queryLimit = APPOINTMENTS_PER_PAGE_HISTORY, lastVisibleAppointmentId: startAfterId } = options;
  const todayDate = startOfDay(new Date());
  const pastStatuses: AppointmentStatus[] = [APPOINTMENT_STATUS.COMPLETED, APPOINTMENT_STATUS.NO_SHOW, APPOINTMENT_STATUS.CANCELLED_CLIENT, APPOINTMENT_STATUS.CANCELLED_STAFF];

  if (!useMockDatabase) {
    if (!firestore) throw new Error("Firestore is not initialized.");
    const appointmentsRef = collection(firestore, 'appointments') as CollectionReference<DocumentData>;
    let constraints: QueryConstraint[] = [
        where('patientId', '==', patientId),
        where('appointmentDateTime', '<', fromDateToTimestamp(todayDate)!),
        where('status', 'in', pastStatuses),
        orderBy('appointmentDateTime', 'desc')
    ];

    const countQuery = query(appointmentsRef, ...constraints.filter(c => !(c.type === 'limit' || c.type === 'start_after' || c.type === 'order_by')));
    const totalCountSnapshot = await getCountFromServer(countQuery);
    const totalCount = totalCountSnapshot.data().count;

    if (startAfterId) {
        const lastVisibleDoc = await getDoc(doc(appointmentsRef, startAfterId));
        if (lastVisibleDoc.exists()) {
            constraints.push(startAfter(lastVisibleDoc));
        }
    }
    constraints.push(limit(queryLimit));

    const finalQuery = query(appointmentsRef, ...constraints);
    const querySnapshot = await getDocs(finalQuery);
    
    const populatedAppointmentsPromises = querySnapshot.docs.map(d => populateAppointment({id: d.id, ...d.data()}));
    const populatedAppointments = await Promise.all(populatedAppointmentsPromises);
    
    const newLastVisibleId = populatedAppointments.length > 0 ? populatedAppointments[populatedAppointments.length -1].id : null;
    return { appointments: populatedAppointments, totalCount, lastVisibleAppointmentId: newLastVisibleId };

  } else { 
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
    return { appointments: paginatedAppointments, totalCount, lastVisibleAppointmentId: newLastVisibleId };
  }
};
