
import type { User, Professional, Patient, Service, Appointment, AppointmentFormData, ProfessionalFormData, AppointmentStatus, ServiceFormData } from '@/types';
import { LOCATIONS, USER_ROLES, SERVICES as SERVICES_CONSTANTS, APPOINTMENT_STATUS, LocationId, ServiceId as ConstantServiceId, APPOINTMENT_STATUS_DISPLAY, PAYMENT_METHODS } from './constants';
import { formatISO, parseISO, addDays, setHours, setMinutes, startOfDay, endOfDay, addMinutes, isSameDay as dateFnsIsSameDay, startOfMonth, endOfMonth } from 'date-fns';
import { firestore } from './firebase/firebase-config'; // Firebase setup - Corrected import path
import { collection, addDoc, getDocs, doc, getDoc, updateDoc, query, where, deleteDoc, writeBatch, serverTimestamp, Timestamp, runTransaction, setDoc, QueryConstraint, orderBy, limit, startAfter,getCountFromServer, CollectionReference, DocumentData, documentId } from 'firebase/firestore';

// --- Helper to convert Firestore Timestamps to ISO strings and vice-versa ---
const processTimestampsForFirestore = (data: any): any => {
  if (!data) return data; // Return if data is null or undefined
  const processedData = { ...data };
  for (const key in processedData) {
    if (processedData[key] instanceof Date) {
      // Convert Date objects to Firestore Timestamps before saving
      processedData[key] = Timestamp.fromDate(processedData[key]);
    }
  }
  return processedData;
};

const processTimestampsFromFirestore = (data: any): any => {
  if (!data) return null;
  const processedData = { ...data };
  for (const key in processedData) {
    if (processedData[key] instanceof Timestamp) {
      processedData[key] = formatISO(processedData[key].toDate());
    } else if (Array.isArray(processedData[key])) {
      processedData[key] = processedData[key].map(item =>
        typeof item === 'object' && item !== null ? processTimestampsFromFirestore(item) : item
      );
    } else if (typeof processedData[key] === 'object' && processedData[key] !== null && !(processedData[key] instanceof Date)) {
      processedData[key] = processTimestampsFromFirestore(processedData[key]);
    }
  }
  return processedData;
};

// --- Auth ---
export const getUserByUsername = async (username: string): Promise<User | undefined> => {
  if (!firestore) {
    console.error("Firestore is not initialized in getUserByUsername.");
    return undefined;
  }
  try {
    const usersRef = collection(firestore, 'users');
    const q = query(usersRef, where('username', '==', username));
    const querySnapshot = await getDocs(q);
    if (querySnapshot.empty) {
      return undefined;
    }
    const userData = querySnapshot.docs[0].data() as Omit<User, 'id'>;
    return { id: querySnapshot.docs[0].id, ...userData };
  } catch (error) {
    console.error("Error fetching user by username:", error);
    return undefined;
  }
};

// --- Professionals ---
export const getProfessionals = async (locationId?: LocationId): Promise<Professional[]> => {
  if (!firestore) {
    console.error("Firestore is not initialized in getProfessionals.");
    return [];
  }
  try {
    const professionalsRef = collection(firestore, 'professionals');
    let q = query(professionalsRef);
    if (locationId) {
      q = query(professionalsRef, where('locationId', '==', locationId));
    }
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Professional));
  } catch (error) {
    console.error("Error fetching professionals:", error);
    return [];
  }
};

export const getProfessionalById = async (id: string): Promise<Professional | undefined> => {
   if (!firestore) {
    console.error("Firestore is not initialized in getProfessionalById.");
    return undefined;
  }
  try {
    const profDocRef = doc(firestore, 'professionals', id);
    const docSnap = await getDoc(profDocRef);
    if (docSnap.exists()) {
      return { id: docSnap.id, ...docSnap.data() } as Professional;
    }
    return undefined;
  } catch (error) {
    console.error("Error fetching professional by ID:", error);
    return undefined;
  }
};

export const addProfessional = async (data: Omit<ProfessionalFormData, 'id'>): Promise<Professional> => {
  if (!firestore) {
    console.error("Firestore is not initialized in addProfessional.");
    throw new Error("Firestore not initialized");
  }
  try {
    const professionalData = {
      ...data,
      biWeeklyEarnings: 0, // Initialize earnings
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    const docRef = await addDoc(collection(firestore, 'professionals'), professionalData);
    // Fetch the just added document to get all fields including server timestamps resolved
    const newDocSnap = await getDoc(docRef);
    if (!newDocSnap.exists()) {
      throw new Error("Failed to fetch the newly added professional.");
    }
    return { id: newDocSnap.id, ...newDocSnap.data() } as Professional;
  } catch (error) {
    console.error("Error adding professional:", error);
    throw error;
  }
};

export const updateProfessional = async (id: string, data: Partial<ProfessionalFormData>): Promise<Professional | undefined> => {
  if (!firestore) {
    console.error("Firestore is not initialized in updateProfessional.");
    return undefined;
  }
  try {
    const profDocRef = doc(firestore, 'professionals', id);
    const professionalUpdateData: Partial<Professional> = { // Ensure type compatibility
      ...data,
      updatedAt: serverTimestamp() as any, // Cast to any to satisfy Timestamp type if data is partial
    };
    await updateDoc(profDocRef, professionalUpdateData);
    const updatedDoc = await getDoc(profDocRef);
    if (updatedDoc.exists()) {
      return { id: updatedDoc.id, ...updatedDoc.data() } as Professional;
    }
    return undefined;
  } catch (error) {
    console.error("Error updating professional:", error);
    return undefined;
  }
};

// --- Patients ---
export const getPatients = async (options: { page?: number, limit?: number, searchTerm?: string, filterToday?: boolean, adminSelectedLocation?: LocationId | 'all', user?: User | null, lastVisibleDoc?: DocumentData } = {}): Promise<{patients: Patient[], totalCount: number, lastDoc?: DocumentData}> => {
  if (!firestore) {
    console.error("Firestore is not initialized in getPatients.");
    return { patients: [], totalCount: 0 };
  }

  const { page = 1, limit: pageSize = PATIENTS_PER_PAGE_DEFAULT, searchTerm, filterToday, adminSelectedLocation, user, lastVisibleDoc: lastVisibleDocument } = options;

  try {
    const patientsRef = collection(firestore, 'patients') as CollectionReference<DocumentData>;
    let qConstraints: QueryConstraint[] = [];
    let countQueryConstraints: QueryConstraint[] = [];


    if (searchTerm) {
       // Firestore does not support direct 'contains' or 'like' queries for partial string matching on multiple fields efficiently.
       // For a more robust search, consider a third-party search service like Algolia or Elasticsearch,
       // or a simpler approach of fetching then filtering if the dataset is small enough.
       // This example will try a prefix search on firstName, lastName. Phone/email require exact match or different strategy.
       qConstraints.push(where('firstName', '>=', searchTerm), where('firstName', '<=', searchTerm + '\uf8ff'));
       // For lastName, it's harder to combine with firstName prefix search in Firestore directly.
       // A more complex solution or client-side filtering might be needed for multi-field partial search.
       // countQueryConstraints = [...qConstraints]; // Apply same filters to count
    }


    if (filterToday && user) {
        const today = startOfDay(new Date());
         const isAdminOrContador = user?.role === USER_ROLES.ADMIN || user?.role === USER_ROLES.CONTADOR;
         const effectiveLocationId = isAdminOrContador
           ? (adminSelectedLocation === 'all' ? undefined : adminSelectedLocation)
           : user?.locationId;

        const dailyAppointmentsResult = await getAppointments({ date: today, locationId: effectiveLocationId as LocationId | undefined });
        const patientIdsWithAppointmentsToday = dailyAppointmentsResult.appointments.map(app => app.patientId);

        if (patientIdsWithAppointmentsToday.length > 0) {
            // Firestore 'in' query has a limit of 30 items per query.
            // If more than 30 patients have appointments, this will need to be batched.
            const idChunks = [];
            for (let i = 0; i < patientIdsWithAppointmentsToday.length; i += 30) {
                idChunks.push(patientIdsWithAppointmentsToday.slice(i, i + 30));
            }
            // This implementation will only filter by the first chunk if patientIdsWithAppointmentsToday > 30
            // A proper solution would involve multiple queries and merging results, or a different data model.
            if(idChunks.length > 0){
                 qConstraints.push(where(documentId(), 'in', idChunks[0]));
                 countQueryConstraints.push(where(documentId(), 'in', idChunks[0]));
            } else {
                 // No patients have appointments today, so the result should be empty
                 return { patients: [], totalCount: 0 };
            }
        } else {
             // No patients have appointments today, so the result should be empty
            return { patients: [], totalCount: 0 };
        }
    }
    
    countQueryConstraints = [...countQueryConstraints, ...qConstraints.filter(c => c.type !== 'limit' && c.type !== 'startAfter' && c.type !== 'orderBy')];


    const countQuery = query(patientsRef, ...countQueryConstraints);
    const countSnapshot = await getCountFromServer(countQuery);
    const totalCount = countSnapshot.data().count;

    qConstraints.push(orderBy('firstName'), orderBy('lastName'));
    if (page > 1 && lastVisibleDocument) {
      qConstraints.push(startAfter(lastVisibleDocument));
    }
    qConstraints.push(limit(pageSize));

    const querySnapshot = await getDocs(query(patientsRef, ...qConstraints));
    const patientsData = querySnapshot.docs.map(doc => processTimestampsFromFirestore({ id: doc.id, ...doc.data() }) as Patient);
    const lastFetchedDoc = querySnapshot.docs[querySnapshot.docs.length - 1];

    return { patients: patientsData, totalCount, lastDoc: lastFetchedDoc };
  } catch (error) {
    console.error("Error fetching patients with pagination:", error);
    // Fallback to client-side filtering if specific server-side filtering fails or is too complex for this setup
    // This is a simplified fallback and might not be performant for large datasets.
    const allPatientsSnapshot = await getDocs(query(collection(firestore, 'patients'), orderBy('firstName'), orderBy('lastName')));
    let allPatients = allPatientsSnapshot.docs.map(doc => processTimestampsFromFirestore({ id: doc.id, ...doc.data() }) as Patient);
     if (searchTerm) {
        allPatients = allPatients.filter(p =>
          `${p.firstName} ${p.lastName}`.toLowerCase().includes(searchTerm.toLowerCase()) ||
          (p.phone && p.phone.includes(searchTerm)) ||
          (p.email && p.email.toLowerCase().includes(searchTerm.toLowerCase()))
        );
      }
      // Note: filterToday logic would need to be re-applied here if this fallback is critical.
      const totalFilteredCount = allPatients.length;
      const startIndex = (page - 1) * pageSize;
      const paginatedPatients = allPatients.slice(startIndex, startIndex + pageSize);
      return { patients: paginatedPatients, totalCount: totalFilteredCount, lastDoc: undefined };
  }
};
const PATIENTS_PER_PAGE_DEFAULT = 20;


export const getPatientById = async (id: string): Promise<Patient | undefined> => {
  if (!firestore) {
    console.error("Firestore is not initialized in getPatientById.");
    return undefined;
  }
  try {
    const patientDocRef = doc(firestore, 'patients', id);
    const docSnap = await getDoc(patientDocRef);
    if (docSnap.exists()) {
      return processTimestampsFromFirestore({ id: docSnap.id, ...docSnap.data() }) as Patient;
    }
    return undefined;
  } catch (error) {
    console.error("Error fetching patient by ID:", error);
    return undefined;
  }
};

export const findPatient = async (firstName: string, lastName: string): Promise<Patient | undefined> => {
  if (!firestore) {
    console.error("Firestore is not initialized in findPatient.");
    return undefined;
  }
  try {
    const patientsRef = collection(firestore, 'patients');
    const q = query(patientsRef, where('firstName', '==', firstName), where('lastName', '==', lastName));
    const querySnapshot = await getDocs(q);
    if (querySnapshot.empty) {
      return undefined;
    }
    const patientData = querySnapshot.docs[0].data();
    return processTimestampsFromFirestore({ id: querySnapshot.docs[0].id, ...patientData }) as Patient;
  } catch (error) {
    console.error("Error finding patient:", error);
    return undefined;
  }
}

export const addPatient = async (data: Omit<Patient, 'id'>): Promise<Patient> => {
  if (!firestore) {
    console.error("Firestore is not initialized in addPatient.");
    throw new Error("Firestore not initialized");
  }
  try {
    const patientData = {
      ...data,
      isDiabetic: data.isDiabetic || false,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    const docRef = await addDoc(collection(firestore, 'patients'), processTimestampsForFirestore(patientData));
    const newDocSnap = await getDoc(docRef);
    if (!newDocSnap.exists()) {
      throw new Error("Failed to fetch the newly added patient.");
    }
    return processTimestampsFromFirestore({ id: newDocSnap.id, ...newDocSnap.data() }) as Patient;
  } catch (error) {
    console.error("Error adding patient:", error);
    throw error;
  }
}

export const updatePatient = async (id: string, data: Partial<Patient>): Promise<Patient | undefined> => {
  if (!firestore) {
    console.error("Firestore is not initialized in updatePatient.");
    return undefined;
  }
  try {
    const patientDocRef = doc(firestore, 'patients', id);
    const patientUpdateData = {
      ...data,
      updatedAt: serverTimestamp(),
    };
    await updateDoc(patientDocRef, processTimestampsForFirestore(patientUpdateData));
    const updatedDoc = await getDoc(patientDocRef);
    if (updatedDoc.exists()) {
      return processTimestampsFromFirestore({ id: updatedDoc.id, ...updatedDoc.data() }) as Patient;
    }
    return undefined;
  } catch (error) {
    console.error("Error updating patient:", error);
    return undefined;
  }
};

// --- Services ---
export const getServices = async (): Promise<Service[]> => {
  if (!firestore) {
    console.error("Firestore is not initialized in getServices.");
    return [];
  }
  try {
    const servicesRef = collection(firestore, 'services');
    const querySnapshot = await getDocs(query(servicesRef, orderBy("name")));
    return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Service));
  } catch (error) {
    console.error("Error fetching services:", error);
    return [];
  }
};

export const getServiceById = async (id: string): Promise<Service | undefined> => {
  if (!firestore) {
    console.error("Firestore is not initialized in getServiceById.");
    return undefined;
  }
  try {
    const serviceDocRef = doc(firestore, 'services', id);
    const docSnap = await getDoc(serviceDocRef);
    if (docSnap.exists()) {
      return { id: docSnap.id, ...docSnap.data() } as Service;
    }
    return undefined;
  } catch (error) {
    console.error("Error fetching service by ID:", error);
    return undefined;
  }
}

const slugify = (text: string): string => {
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^\w-]+/g, '')
    .replace(/--+/g, '-');
};

export const addService = async (data: ServiceFormData): Promise<Service> => {
  if (!firestore) {
    console.error("Firestore is not initialized in addService.");
    throw new Error("Firestore not initialized");
  }
  try {
    let id = data.id;
    if (!id) {
      let slug = slugify(data.name);
      const servicesRef = collection(firestore, 'services');
      let q = query(servicesRef, where(documentId(), '==', slug));
      let querySnapshot = await getDocs(q);
      let attempt = 0;
      while (!querySnapshot.empty && attempt < 5) {
        attempt++;
        slug = `${slugify(data.name)}-${Date.now().toString().slice(-4)}${attempt}`;
        q = query(servicesRef, where(documentId(), '==', slug));
        querySnapshot = await getDocs(q);
      }
      if (!querySnapshot.empty && attempt >= 5) {
        throw new Error("Could not generate unique ID for service.");
      }
      id = slug;
    }

    const newServiceData = {
      // id is implicit as document ID
      name: data.name,
      defaultDuration: data.defaultDuration,
      price: data.price,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    const serviceDocRef = doc(firestore, 'services', id);
    await setDoc(serviceDocRef, newServiceData);

    const newDocSnap = await getDoc(serviceDocRef);
    if (!newDocSnap.exists()) {
      throw new Error("Failed to fetch the newly added service.");
    }
    return { id: newDocSnap.id, ...newDocSnap.data() } as Service;
  } catch (error) {
    console.error("Error adding service:", error);
    throw error;
  }
};

export const updateService = async (id: string, data: Partial<ServiceFormData>): Promise<Service | undefined> => {
  if (!firestore) {
    console.error("Firestore is not initialized in updateService.");
    return undefined;
  }
  try {
    const serviceDocRef = doc(firestore, 'services', id);
    const serviceUpdateData = {
      ...data,
      updatedAt: serverTimestamp(),
    };
    await updateDoc(serviceDocRef, serviceUpdateData);
    const updatedDoc = await getDoc(serviceDocRef);
    if (updatedDoc.exists()) {
      return { id: updatedDoc.id, ...updatedDoc.data() } as Service;
    }
    return undefined;
  } catch (error) {
    console.error("Error updating service:", error);
    return undefined;
  }
};

// --- Appointments ---
const APPOINTMENTS_PER_PAGE_DEFAULT = 8;

export const getAppointments = async (filters: {
  locationId?: LocationId | LocationId[] | undefined;
  date?: Date,
  dateRange?: { start: Date; end: Date };
  statuses?: AppointmentStatus | AppointmentStatus[];
  patientId?: string,
  professionalId?: string,
  page?: number,
  limit?: number,
  lastVisibleDoc?: DocumentData
}): Promise<{ appointments: Appointment[], totalCount: number, lastDoc?: DocumentData }> => {
  if (!firestore) {
    console.error("Firestore is not initialized in getAppointments.");
    return { appointments: [], totalCount: 0 };
  }
  try {
    const appointmentsRef = collection(firestore, 'appointments') as CollectionReference<DocumentData>;
    let qConstraints: QueryConstraint[] = [];

    if (filters.locationId) {
      const locationsToFilter = Array.isArray(filters.locationId) ? filters.locationId : [filters.locationId];
      if (locationsToFilter.length > 0) {
        qConstraints.push(where('locationId', 'in', locationsToFilter));
      }
    }
    if (filters.patientId) {
      qConstraints.push(where('patientId', '==', filters.patientId));
    }
    if (filters.professionalId) {
      qConstraints.push(where('professionalId', '==', filters.professionalId));
    }
    if (filters.date) {
      const dayStart = startOfDay(filters.date);
      const dayEnd = endOfDay(filters.date);
      qConstraints.push(where('appointmentDateTime', '>=', Timestamp.fromDate(dayStart)), where('appointmentDateTime', '<=', Timestamp.fromDate(dayEnd)));
    }
    if (filters.dateRange) {
      const rangeStart = startOfDay(filters.dateRange.start);
      const rangeEnd = endOfDay(filters.dateRange.end);
      qConstraints.push(where('appointmentDateTime', '>=', Timestamp.fromDate(rangeStart)), where('appointmentDateTime', '<=', Timestamp.fromDate(rangeEnd)));
    }
    if (filters.statuses) {
      const statusesToFilter = Array.isArray(filters.statuses) ? filters.statuses : [filters.statuses];
      if (statusesToFilter.length > 0) {
        qConstraints.push(where('status', 'in', statusesToFilter));
      }
    }

    const isFetchingPastStatuses = filters.statuses && (
        (Array.isArray(filters.statuses) && filters.statuses.some(s => [APPOINTMENT_STATUS.COMPLETED, APPOINTMENT_STATUS.CANCELLED_CLIENT, APPOINTMENT_STATUS.CANCELLED_STAFF, APPOINTMENT_STATUS.NO_SHOW].includes(s))) ||
        (typeof filters.statuses === 'string' && [APPOINTMENT_STATUS.COMPLETED, APPOINTMENT_STATUS.CANCELLED_CLIENT, APPOINTMENT_STATUS.CANCELLED_STAFF, APPOINTMENT_STATUS.NO_SHOW].includes(filters.statuses))
    );

    if (isFetchingPastStatuses) {
      qConstraints.push(orderBy('appointmentDateTime', 'desc'));
    } else {
      qConstraints.push(orderBy('appointmentDateTime', 'asc'));
    }


    let totalCount = 0;
    const countQueryConstraints = qConstraints.filter(c => c.type !== 'limit' && c.type !== 'startAfter' && c.type !== 'orderBy');
    const countQuery = query(appointmentsRef, ...countQueryConstraints);
    const countSnapshot = await getCountFromServer(countQuery);
    totalCount = countSnapshot.data().count;

    const pageSize = filters.limit || APPOINTMENTS_PER_PAGE_DEFAULT;

    if (filters.page && filters.page > 1 && filters.lastVisibleDoc) {
        qConstraints.push(startAfter(filters.lastVisibleDoc));
    }
    qConstraints.push(limit(pageSize));

    const querySnapshot = await getDocs(query(appointmentsRef, ...qConstraints));
    const appointmentsData = querySnapshot.docs.map(doc => processTimestampsFromFirestore({ id: doc.id, ...doc.data() }) as Appointment);

    const populatedAppointments = await Promise.all(appointmentsData.map(async appt => {
      const [patient, professional, service] = await Promise.all([
        appt.patientId ? getPatientById(appt.patientId) : Promise.resolve(undefined),
        appt.professionalId ? getProfessionalById(appt.professionalId) : Promise.resolve(undefined),
        appt.serviceId ? getServiceById(appt.serviceId) : Promise.resolve(undefined),
      ]);

      const addedServicesPopulated = appt.addedServices ? await Promise.all(appt.addedServices.map(async as => {
        const [addedService, addedProfessional] = await Promise.all([
            as.serviceId ? getServiceById(as.serviceId) : Promise.resolve(undefined),
            as.professionalId ? getProfessionalById(as.professionalId) : Promise.resolve(undefined),
        ]);
        return { ...as, service: addedService, professional: addedProfessional };
      })) : undefined;

      return { ...appt, patient, professional, service, addedServices: addedServicesPopulated };
    }));

    const lastDoc = querySnapshot.docs[querySnapshot.docs.length - 1];
    return { appointments: populatedAppointments, totalCount, lastDoc };

  } catch (error) {
    console.error("Error fetching appointments:", error);
    return { appointments: [], totalCount: 0 };
  }
};

export const getAppointmentById = async (id: string): Promise<Appointment | undefined> => {
  if (!firestore) {
    console.error("Firestore is not initialized in getAppointmentById.");
    return undefined;
  }
  try {
    const apptDocRef = doc(firestore, 'appointments', id);
    const docSnap = await getDoc(apptDocRef);
    if (docSnap.exists()) {
      const apptData = processTimestampsFromFirestore({ id: docSnap.id, ...docSnap.data() }) as Appointment;
      const [patient, professional, service] = await Promise.all([
        apptData.patientId ? getPatientById(apptData.patientId) : Promise.resolve(undefined),
        apptData.professionalId ? getProfessionalById(apptData.professionalId) : Promise.resolve(undefined),
        apptData.serviceId ? getServiceById(apptData.serviceId) : Promise.resolve(undefined),
      ]);
      const addedServicesPopulated = apptData.addedServices ? await Promise.all(apptData.addedServices.map(async as => {
         const [addedService, addedProfessional] = await Promise.all([
            as.serviceId ? getServiceById(as.serviceId) : Promise.resolve(undefined),
            as.professionalId ? getProfessionalById(as.professionalId) : Promise.resolve(undefined),
        ]);
        return { ...as, service: addedService, professional: addedProfessional };
      })) : undefined;

      return { ...apptData, patient, professional, service, addedServices: addedServicesPopulated };
    }
    return undefined;
  } catch (error) {
    console.error("Error fetching appointment by ID:", error);
    return undefined;
  }
};

export const addAppointment = async (data: AppointmentFormData): Promise<Appointment> => {
  if (!firestore) {
    console.error("Firestore is not initialized in addAppointment.");
    throw new Error("Firestore not initialized");
  }

  try {
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
          email: data.patientEmail,
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

    const service = await getServiceById(data.serviceId);
    const appointmentDateHours = parseInt(data.appointmentTime.split(':')[0]);
    const appointmentDateMinutes = parseInt(data.appointmentTime.split(':')[1]);
    const appointmentDateTime = setMinutes(setHours(data.appointmentDate, appointmentDateHours), appointmentDateMinutes);

    const newAppointmentData: Omit<Appointment, 'id' | 'patient' | 'professional' | 'service'> & { patientId: string } = {
      patientId: patientId!,
      locationId: data.locationId,
      serviceId: data.serviceId,
      appointmentDateTime: formatISO(appointmentDateTime),
      durationMinutes: service?.defaultDuration || 60,
      preferredProfessionalId: data.preferredProfessionalId === "_any_professional_placeholder_" ? undefined : data.preferredProfessionalId,
      bookingObservations: data.bookingObservations,
      status: APPOINTMENT_STATUS.BOOKED,
      attachedPhotos: [],
      createdAt: formatISO(new Date()),
      updatedAt: formatISO(new Date()),
    };

    const docRef = await addDoc(collection(firestore, 'appointments'), processTimestampsForFirestore({
      ...newAppointmentData,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }));

    const createdAppointment = await getAppointmentById(docRef.id);
    if (!createdAppointment) throw new Error("Failed to fetch created appointment");

    return createdAppointment;

  } catch (error) {
    console.error("Error adding appointment:", error);
    throw error;
  }
};

export const updateAppointment = async (id: string, data: Partial<Appointment>): Promise<Appointment | undefined> => {
  if (!firestore) {
    console.error("Firestore is not initialized in updateAppointment.");
    return undefined;
  }
  try {
    const apptDocRef = doc(firestore, 'appointments', id);

    const updateData: Partial<Appointment> = { ...data, updatedAt: formatISO(new Date()) };

    if (typeof data.appointmentDateTime === 'string') {
      updateData.appointmentDateTime = formatISO(parseISO(data.appointmentDateTime));
    }

    await updateDoc(apptDocRef, processTimestampsForFirestore({ ...updateData, updatedAt: serverTimestamp() }));

    const updatedDoc = await getDoc(apptDocRef);
    if (updatedDoc.exists()) {
      return getAppointmentById(updatedDoc.id);
    }
    return undefined;

  } catch (error) {
    console.error("Error updating appointment:", error);
    return undefined;
  }
};

const HISTORY_APPOINTMENTS_PER_PAGE = 8;

export const getPatientAppointmentHistory = async (
  patientId: string,
  options: { page?: number, limit?: number, lastVisibleDoc?: DocumentData } = {}
): Promise<{ appointments: Appointment[], totalCount: number, lastDoc?: DocumentData }> => {
  if (!firestore) {
    console.error("Firestore is not initialized in getPatientAppointmentHistory.");
    return { appointments: [], totalCount: 0 };
  }
  try {
    const { page = 1, limit: pageSize = HISTORY_APPOINTMENTS_PER_PAGE, lastVisibleDoc } = options;
    const today = startOfDay(new Date());
    const appointmentsRef = collection(firestore, 'appointments') as CollectionReference<DocumentData>;

    let qConstraints: QueryConstraint[] = [
      where('patientId', '==', patientId),
      where('appointmentDateTime', '<', Timestamp.fromDate(today)),
      where('status', 'in', [
        APPOINTMENT_STATUS.COMPLETED,
        APPOINTMENT_STATUS.NO_SHOW,
        APPOINTMENT_STATUS.CANCELLED_CLIENT,
        APPOINTMENT_STATUS.CANCELLED_STAFF
      ]),
      orderBy('appointmentDateTime', 'desc')
    ];

    const countQuery = query(appointmentsRef, ...qConstraints.filter(c => c.type !== 'limit' && c.type !== 'startAt' && c.type !== 'startAfter'));
    const countSnapshot = await getCountFromServer(countQuery);
    const totalCount = countSnapshot.data().count;

    if (page > 1 && lastVisibleDoc) {
      qConstraints.push(startAfter(lastVisibleDoc));
    }
    qConstraints.push(limit(pageSize));

    const querySnapshot = await getDocs(query(appointmentsRef, ...qConstraints));
    const historyAppointments = querySnapshot.docs.map(doc => processTimestampsFromFirestore({ id: doc.id, ...doc.data() }) as Appointment);

    const populatedHistory = await Promise.all(historyAppointments.map(async appt => {
      const [professional, service] = await Promise.all([
         appt.professionalId ? getProfessionalById(appt.professionalId) : Promise.resolve(undefined),
         appt.serviceId ? getServiceById(appt.serviceId) : Promise.resolve(undefined),
      ]);
      const addedServicesPopulated = appt.addedServices ? await Promise.all(appt.addedServices.map(async as => {
        const [addedService, addedProfessional] = await Promise.all([
            as.serviceId ? getServiceById(as.serviceId) : Promise.resolve(undefined),
            as.professionalId ? getProfessionalById(as.professionalId) : Promise.resolve(undefined),
        ]);
        return { ...as, service: addedService, professional: addedProfessional };
      })) : undefined;
      return { ...appt, professional, service, addedServices: addedServicesPopulated };
    }));

    const newLastDoc = querySnapshot.docs[querySnapshot.docs.length - 1];
    return { appointments: populatedHistory, totalCount, lastDoc: newLastDoc };

  } catch (error) {
    console.error("Error fetching patient appointment history:", error);
    return { appointments: [], totalCount: 0 };
  }
};

// --- Data Seeding/Initialization ---
export const seedInitialData = async () => {
  if (!firestore) {
    console.warn("Firestore is not initialized. Skipping data seeding.");
    return;
  }
  console.log("Starting data seeding if collections are empty...");

  const batch = writeBatch(firestore);
  let operationsCount = 0;

  const usersColRef = collection(firestore, "users");
  const usersCountSnap = await getCountFromServer(query(usersColRef));
  if (usersCountSnap.data().count === 0) {
    console.log("Seeding users...");
    const initialUsers: User[] = [
      { id: 'admin001-seed', username: 'Admin', password: 'admin', role: USER_ROLES.ADMIN, name: 'Administrator' },
      { id: 'contador001-seed', username: 'Contador', password: 'admin', role: USER_ROLES.CONTADOR, name: 'Contador Principal' },
      ...LOCATIONS.map(loc => ({
        id: `user-${loc.id}-seed`,
        username: loc.name,
        password: 'admin',
        role: USER_ROLES.LOCATION_STAFF,
        locationId: loc.id,
        name: `${loc.name} Staff`
      }))
    ];
    initialUsers.forEach(user => {
      const userDocRef = doc(usersColRef, user.id);
      batch.set(userDocRef, user);
      operationsCount++;
    });
  } else {
    // console.log("Users collection not empty. Skipping user seeding.");
  }

  const professionalsColRef = collection(firestore, "professionals");
  const profsCountSnap = await getCountFromServer(query(professionalsColRef));
  if (profsCountSnap.data().count === 0) {
    console.log("Seeding professionals...");
    const initialProfessionals: Omit<Professional, 'id'>[] = [];
    LOCATIONS.forEach((location, locIndex) => {
      for (let i = 1; i <= 2; i++) {
        initialProfessionals.push({
          firstName: `Profesional ${i}`,
          lastName: location.name.split(' ')[0],
          locationId: location.id,
          phone: `9876543${locIndex}${i}`,
          biWeeklyEarnings: Math.floor(Math.random() * 1500) + 300,
        });
      }
    });
    initialProfessionals.forEach(profData => {
      const profDocRef = doc(professionalsColRef); // Let Firestore auto-generate ID
      batch.set(profDocRef, {...profData, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
      operationsCount++;
    });
  } else {
    // console.log("Professionals collection not empty. Skipping professional seeding.");
  }

  const patientsColRef = collection(firestore, "patients");
  const patientsCountSnap = await getCountFromServer(query(patientsColRef));
  if (patientsCountSnap.data().count === 0) {
    console.log("Seeding patients...");
    const initialPatientsData: Omit<Patient, 'id'>[] = [
      { firstName: 'Ana', lastName: 'García', phone: '111222333', email: 'ana.garcia@example.com', notes: 'Paciente regular, prefiere citas por la mañana.', dateOfBirth: '1985-05-15', isDiabetic: false },
      { firstName: 'Luis', lastName: 'Martínez', phone: '444555666', email: 'luis.martinez@example.com', notes: 'Primera visita.', dateOfBirth: '1992-11-20', isDiabetic: true },
    ];
     // Try to get a seeded professional to link
    const someProfSnapshot = await getDocs(query(professionalsColRef, limit(1)));
    if (!someProfSnapshot.empty) {
        initialPatientsData[0].preferredProfessionalId = someProfSnapshot.docs[0].id;
    }


    initialPatientsData.forEach(patientData => {
      const patientDocRef = doc(patientsColRef); // Let Firestore auto-generate ID
      batch.set(patientDocRef, processTimestampsForFirestore({...patientData, createdAt: serverTimestamp(), updatedAt: serverTimestamp() }));
      operationsCount++;
    });
  } else {
    // console.log("Patients collection not empty. Skipping patient seeding.");
  }

  const servicesColRef = collection(firestore, "services");
  const servicesCountSnap = await getCountFromServer(query(servicesColRef));
  if (servicesCountSnap.data().count === 0) {
    console.log("Seeding services...");
    SERVICES_CONSTANTS.forEach(s_const => {
      const serviceDocRef = doc(servicesColRef, s_const.id); // Use predefined ID from constants
      batch.set(serviceDocRef, {
        name: s_const.name,
        defaultDuration: s_const.defaultDuration,
        price: Math.floor(Math.random() * 50) + 50,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      operationsCount++;
    });
  } else {
    // console.log("Services collection not empty. Skipping service seeding.");
  }

  if (operationsCount > 0) {
    try {
      await batch.commit();
      console.log(`Data seeding committed successfully (${operationsCount} operations).`);
    } catch (error) {
      console.error("Error committing seed batch:", error);
    }
  } else {
    // console.log("No data seeding operations were performed.");
  }
};

// This block ensures seeding check runs only client-side in development
if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
  const runSeedCheck = async () => {
    // Wait for Firestore to be available from firebase-config
    // This is a simple polling mechanism, consider a more robust solution if needed
    let attempts = 0;
    const maxAttempts = 10;
    const interval = setInterval(async () => {
      attempts++;
      if (firestore) {
        clearInterval(interval);
        try {
          const usersColRef = collection(firestore, "users");
          const usersCountSnap = await getCountFromServer(query(usersColRef));
          if (usersCountSnap.data().count === 0) {
            console.log("Attempting initial data seed in development (client-side check)...");
            await seedInitialData();
          } else {
            // console.log("Users collection not empty, skipping seed (client-side check).")
          }
        } catch (e) {
          console.error("Error during seed check (client-side):", e);
        }
      } else if (attempts > maxAttempts) {
        clearInterval(interval);
        console.warn("Firestore instance not available after multiple attempts for seed check (client-side).");
      }
    }, 500); // Check every 500ms
  };
  // runSeedCheck(); // Auto-seeding commented out. Can be run manually or via a dev script.
}
