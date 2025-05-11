
import type { User, Professional, Patient, Service, Appointment, AppointmentFormData, ProfessionalFormData, AppointmentStatus, ServiceFormData } from '@/types';
import { LOCATIONS, USER_ROLES, SERVICES as SERVICES_CONSTANTS, PROFESSIONAL_SPECIALIZATIONS, APPOINTMENT_STATUS, LocationId, ServiceId as ConstantServiceId, APPOINTMENT_STATUS_DISPLAY, PAYMENT_METHODS } from './constants';
import { formatISO, parseISO, addDays, setHours, setMinutes, startOfDay, endOfDay, addMinutes, isSameDay as dateFnsIsSameDay } from 'date-fns';
import { firestore } from './firebase-config'; // Firebase setup
import { collection, addDoc, getDocs, doc, getDoc, updateDoc, query, where, deleteDoc, writeBatch, serverTimestamp, Timestamp, runTransaction, arrayUnion, arrayRemove } from 'firebase/firestore';

// --- Helper to convert Firestore Timestamps to ISO strings and vice-versa ---
const processTimestampsForFirestore = (data: any): any => {
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
      // Convert Firestore Timestamps to ISO strings after fetching
      // For appointmentDateTime, just convert to Date then to ISO.
      // For createdAt/updatedAt, they are already stored as Timestamps by serverTimestamp typically.
      processedData[key] = formatISO(processedData[key].toDate());
    } else if (Array.isArray(processedData[key])) {
      // Recursively process arrays (e.g., for addedServices, attachedPhotos)
      processedData[key] = processedData[key].map(item => 
        typeof item === 'object' && item !== null ? processTimestampsFromFirestore(item) : item
      );
    } else if (typeof processedData[key] === 'object' && processedData[key] !== null) {
      // Recursively process nested objects
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
    // Assuming username is unique
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
    return { id: docRef.id, ...data, biWeeklyEarnings: 0 }; // Return with ID
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
    const professionalUpdateData = {
      ...data,
      updatedAt: serverTimestamp(),
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
export const getPatients = async (): Promise<Patient[]> => {
  if (!firestore) {
    console.error("Firestore is not initialized in getPatients.");
    return [];
  }
  try {
    const patientsRef = collection(firestore, 'patients');
    const querySnapshot = await getDocs(patientsRef);
    return querySnapshot.docs.map(doc => processTimestampsFromFirestore({ id: doc.id, ...doc.data() }) as Patient);
  } catch (error) {
    console.error("Error fetching patients:", error);
    return [];
  }
};

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
    // Assuming first name + last name is unique enough for this context, or take the first result
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
    return { id: docRef.id, ...data, isDiabetic: data.isDiabetic || false };
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
    const querySnapshot = await getDocs(servicesRef);
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
      // Check if slug already exists and append timestamp if it does (simple uniqueness)
      const servicesRef = collection(firestore, 'services');
      const q = query(servicesRef, where('id', '==', slug));
      const querySnapshot = await getDocs(q);
      if (!querySnapshot.empty) {
        slug = `${slug}-${Date.now()}`;
      }
      id = slug;
    }
    
    const newServiceData = {
      id, // Firestore allows setting custom ID with setDoc, or auto-gen with addDoc. Here, we manage ID.
      name: data.name,
      defaultDuration: data.defaultDuration,
      price: data.price,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    const serviceDocRef = doc(firestore, 'services', id);
    await setDoc(serviceDocRef, newServiceData); // Use setDoc because we are defining the ID

    return { id, name: data.name, defaultDuration: data.defaultDuration, price: data.price };
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
export const getAppointments = async (filters: { 
  locationId?: LocationId | LocationId[] | undefined; 
  date?: Date, 
  dateRange?: { start: Date; end: Date };
  statuses?: AppointmentStatus | AppointmentStatus[]; // Renamed from 'status' for clarity
  patientId?: string, 
  professionalId?: string 
}): Promise<Appointment[]> => {
  if (!firestore) {
    console.error("Firestore is not initialized in getAppointments.");
    return [];
  }
  try {
    let q = query(collection(firestore, 'appointments'));

    if (filters.locationId) {
      const locationsToFilter = Array.isArray(filters.locationId) ? filters.locationId : [filters.locationId];
      if (locationsToFilter.length > 0) {
        q = query(q, where('locationId', 'in', locationsToFilter));
      }
    }
    if (filters.patientId) {
      q = query(q, where('patientId', '==', filters.patientId));
    }
    if (filters.professionalId) {
      q = query(q, where('professionalId', '==', filters.professionalId));
    }
    if (filters.date) {
      // Firestore range queries on timestamps require start and end of the day
      const dayStart = startOfDay(filters.date);
      const dayEnd = endOfDay(filters.date);
      q = query(q, where('appointmentDateTime', '>=', Timestamp.fromDate(dayStart)), where('appointmentDateTime', '<=', Timestamp.fromDate(dayEnd)));
    }
    if (filters.dateRange) {
      const rangeStart = startOfDay(filters.dateRange.start);
      const rangeEnd = endOfDay(filters.dateRange.end);
      q = query(q, where('appointmentDateTime', '>=', Timestamp.fromDate(rangeStart)), where('appointmentDateTime', '<=', Timestamp.fromDate(rangeEnd)));
    }
    if (filters.statuses) {
      const statusesToFilter = Array.isArray(filters.statuses) ? filters.statuses : [filters.statuses];
      if (statusesToFilter.length > 0) {
        q = query(q, where('status', 'in', statusesToFilter));
      }
    }
  
    const querySnapshot = await getDocs(q);
    const appointmentsData = querySnapshot.docs.map(doc => processTimestampsFromFirestore({ id: doc.id, ...doc.data() }) as Appointment);
    
    // Populate patient, professional, service details (client-side join)
    // This can be optimized by fetching all related data in batches if performance is an issue.
    const populatedAppointments = await Promise.all(appointmentsData.map(async appt => {
      const patient = appt.patientId ? await getPatientById(appt.patientId) : undefined;
      const professional = appt.professionalId ? await getProfessionalById(appt.professionalId) : undefined;
      const service = appt.serviceId ? await getServiceById(appt.serviceId) : undefined;
      
      const addedServicesPopulated = appt.addedServices ? await Promise.all(appt.addedServices.map(async as => ({
        ...as,
        service: as.serviceId ? await getServiceById(as.serviceId) : undefined,
        professional: as.professionalId ? await getProfessionalById(as.professionalId) : undefined,
      }))) : undefined;

      return {
        ...appt,
        patient,
        professional,
        service,
        addedServices: addedServicesPopulated,
      };
    }));

    return populatedAppointments.sort((a, b) => parseISO(a.appointmentDateTime).getTime() - parseISO(b.appointmentDateTime).getTime());

  } catch (error) {
    console.error("Error fetching appointments:", error);
    return [];
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
      // Populate related data
      const patient = apptData.patientId ? await getPatientById(apptData.patientId) : undefined;
      const professional = apptData.professionalId ? await getProfessionalById(apptData.professionalId) : undefined;
      const service = apptData.serviceId ? await getServiceById(apptData.serviceId) : undefined;
      const addedServicesPopulated = apptData.addedServices ? await Promise.all(apptData.addedServices.map(async as => ({
        ...as,
        service: as.serviceId ? await getServiceById(as.serviceId) : undefined,
        professional: as.professionalId ? await getProfessionalById(as.professionalId) : undefined,
      }))) : undefined;

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

    // Handle patient creation or update within a transaction if needed, or separately
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
    } else { // Existing patient, check if any details need update (simplified: just diabetic status for now)
      const existingPatientDetails = await getPatientById(patientId);
      if (existingPatientDetails && data.isDiabetic !== undefined && data.isDiabetic !== existingPatientDetails.isDiabetic) {
        await updatePatient(patientId, { isDiabetic: data.isDiabetic });
      }
    }
    
    const service = await getServiceById(data.serviceId);
    const appointmentDateHours = parseInt(data.appointmentTime.split(':')[0]);
    const appointmentDateMinutes = parseInt(data.appointmentTime.split(':')[1]);
    const appointmentDateTime = setMinutes(setHours(data.appointmentDate, appointmentDateHours), appointmentDateMinutes);

    const newAppointmentData: Omit<Appointment, 'id' | 'createdAt' | 'updatedAt' | 'patient' | 'professional' | 'service'> & { patientId: string } = {
      patientId: patientId!,
      locationId: data.locationId,
      serviceId: data.serviceId,
      appointmentDateTime: formatISO(appointmentDateTime), // Stored as ISO string, will be converted to Timestamp by helper
      durationMinutes: service?.defaultDuration || 60,
      preferredProfessionalId: data.preferredProfessionalId === "_any_professional_placeholder_" ? undefined : data.preferredProfessionalId,
      bookingObservations: data.bookingObservations,
      status: APPOINTMENT_STATUS.BOOKED,
      attachedPhotos: [],
    };
    
    const docRef = await addDoc(collection(firestore, 'appointments'), processTimestampsForFirestore({
      ...newAppointmentData,
      createdAt: serverTimestamp(), // Let Firestore handle this
      updatedAt: serverTimestamp(),
    }));

    // For returning the created appointment, fetch it again to get server-generated timestamps resolved
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
    
    // Ensure Timestamps are handled correctly if dates are being updated
    const updateData = {
      ...data,
      updatedAt: serverTimestamp(),
    };
    // If appointmentDateTime is in data and is a string, convert to Date for processTimestampsForFirestore
    if (typeof data.appointmentDateTime === 'string') {
      updateData.appointmentDateTime = parseISO(data.appointmentDateTime);
    }


    await updateDoc(apptDocRef, processTimestampsForFirestore(updateData));
    
    // Fetch and return the updated document
    const updatedDoc = await getDoc(apptDocRef);
    if (updatedDoc.exists()) {
      const apptData = processTimestampsFromFirestore({ id: updatedDoc.id, ...updatedDoc.data() }) as Appointment;
      const patient = apptData.patientId ? await getPatientById(apptData.patientId) : undefined;
      const professional = apptData.professionalId ? await getProfessionalById(apptData.professionalId) : undefined;
      const service = apptData.serviceId ? await getServiceById(apptData.serviceId) : undefined;
       const addedServicesPopulated = apptData.addedServices ? await Promise.all(apptData.addedServices.map(async as => ({
        ...as,
        service: as.serviceId ? await getServiceById(as.serviceId) : undefined,
        professional: as.professionalId ? await getProfessionalById(as.professionalId) : undefined,
      }))) : undefined;
      return { ...apptData, patient, professional, service, addedServices: addedServicesPopulated };
    }
    return undefined;

  } catch (error) {
    console.error("Error updating appointment:", error);
    return undefined;
  }
};


export const getPatientAppointmentHistory = async (patientId: string): Promise<Appointment[]> => {
  if (!firestore) {
    console.error("Firestore is not initialized in getPatientAppointmentHistory.");
    return [];
  }
  try {
    const today = startOfDay(new Date());
    const appointmentsRef = collection(firestore, 'appointments');
    const q = query(
      appointmentsRef, 
      where('patientId', '==', patientId),
      where('appointmentDateTime', '<', Timestamp.fromDate(today)), // Appointments before today
      where('status', 'in', [
        APPOINTMENT_STATUS.COMPLETED, 
        APPOINTMENT_STATUS.NO_SHOW, 
        APPOINTMENT_STATUS.CANCELLED_CLIENT, 
        APPOINTMENT_STATUS.CANCELLED_STAFF
      ])
    );

    const querySnapshot = await getDocs(q);
    const historyAppointments = querySnapshot.docs.map(doc => processTimestampsFromFirestore({ id: doc.id, ...doc.data() }) as Appointment);

    // Populate related data (similar to getAppointments)
    const populatedHistory = await Promise.all(historyAppointments.map(async appt => {
      const professional = appt.professionalId ? await getProfessionalById(appt.professionalId) : undefined;
      const service = appt.serviceId ? await getServiceById(appt.serviceId) : undefined;
      const addedServicesPopulated = appt.addedServices ? await Promise.all(appt.addedServices.map(async as => ({
        ...as,
        service: as.serviceId ? await getServiceById(as.serviceId) : undefined,
        professional: as.professionalId ? await getProfessionalById(as.professionalId) : undefined,
      }))) : undefined;
      // Patient data is already part of the `patient` object in `Appointment` type if needed, or assume we only need IDs here.
      // For full patient details on each history item, you might adjust the query or subsequent fetches.
      return { ...appt, professional, service, addedServices: addedServicesPopulated };
    }));
    
    return populatedHistory.sort((a,b) => parseISO(b.appointmentDateTime).getTime() - parseISO(a.appointmentDateTime).getTime());

  } catch (error) {
    console.error("Error fetching patient appointment history:", error);
    return [];
  }
};


// --- Data Seeding/Initialization (Example - not for production use without care) ---
export const seedInitialData = async () => {
  if (!firestore) {
    console.error("Firestore is not initialized for seeding.");
    return;
  }
  console.log("Starting data seeding...");

  const batch = writeBatch(firestore);

  // Seed Users
  const usersColRef = collection(firestore, "users");
  const existingUsersSnap = await getDocs(query(usersColRef, where("username", "in", ["Admin", "Contador", ...LOCATIONS.map(l => l.name)])));
  if (existingUsersSnap.empty) {
    console.log("Seeding users...");
    const initialUsers: User[] = [
      { id: 'admin001-seed', username: 'Admin', password: 'admin', role: USER_ROLES.ADMIN, name: 'Administrator' },
      { id: 'contador001-seed', username: 'Contador', password: 'admin', role: USER_ROLES.CONTADOR, name: 'Contador Principal' },
      ...LOCATIONS.map(loc => ({
        id: `user-${loc.id}-seed`,
        username: loc.name,
        password: 'admin', // In a real app, hash passwords securely
        role: USER_ROLES.LOCATION_STAFF,
        locationId: loc.id,
        name: `${loc.name} Staff`
      }))
    ];
    initialUsers.forEach(user => {
      const userDocRef = doc(usersColRef, user.id); // Using predefined IDs for simplicity in seeding
      batch.set(userDocRef, user);
    });
  } else {
    console.log("Users collection already has initial data or is not empty. Skipping user seeding.");
  }


  // Seed Professionals
  const professionalsColRef = collection(firestore, "professionals");
  const existingProfsSnap = await getDocs(professionalsColRef); // Simple check for emptiness
  if (existingProfsSnap.empty) {
    console.log("Seeding professionals...");
    const initialProfessionals: Professional[] = [];
    LOCATIONS.forEach((location, locIndex) => {
      for (let i = 1; i <= 2; i++) { // Reduced number for faster seeding
        initialProfessionals.push({
          id: `prof-${location.id}-${i}-seed`,
          firstName: `Profesional ${i}`,
          lastName: location.name.split(' ')[0],
          locationId: location.id,
          specializations: [PROFESSIONAL_SPECIALIZATIONS[i % PROFESSIONAL_SPECIALIZATIONS.length]],
          email: `prof${i}.${location.id}@example.com`,
          phone: `9876543${locIndex}${i}`,
          biWeeklyEarnings: Math.floor(Math.random() * 1500) + 300,
        });
      }
    });
    initialProfessionals.forEach(prof => {
      const profDocRef = doc(professionalsColRef, prof.id);
      batch.set(profDocRef, prof);
    });
  } else {
    console.log("Professionals collection not empty. Skipping professional seeding.");
  }

  // Seed Patients
  const patientsColRef = collection(firestore, "patients");
  const existingPatientsSnap = await getDocs(patientsColRef);
  if (existingPatientsSnap.empty) {
    console.log("Seeding patients...");
    const initialPatients: Patient[] = [
      { id: 'pat001-seed', firstName: 'Ana', lastName: 'García', phone: '111222333', email: 'ana.garcia@example.com', preferredProfessionalId: `prof-${LOCATIONS[0].id}-1-seed`, notes: 'Paciente regular, prefiere citas por la mañana.', dateOfBirth: '1985-05-15', isDiabetic: false },
      { id: 'pat002-seed', firstName: 'Luis', lastName: 'Martínez', phone: '444555666', email: 'luis.martinez@example.com', notes: 'Primera visita.', dateOfBirth: '1992-11-20', isDiabetic: true },
    ];
    initialPatients.forEach(patient => {
      const patientDocRef = doc(patientsColRef, patient.id);
      batch.set(patientDocRef, processTimestampsForFirestore(patient));
    });
  } else {
    console.log("Patients collection not empty. Skipping patient seeding.");
  }

  // Seed Services
  const servicesColRef = collection(firestore, "services");
  const existingServicesSnap = await getDocs(servicesColRef);
  if (existingServicesSnap.empty) {
    console.log("Seeding services...");
    const initialServices: Service[] = SERVICES_CONSTANTS.map(s_const => ({
        id: s_const.id,
        name: s_const.name,
        defaultDuration: s_const.defaultDuration,
        price: Math.floor(Math.random() * 50) + 50,
    }));
    initialServices.forEach(service => {
      const serviceDocRef = doc(servicesColRef, service.id);
      batch.set(serviceDocRef, service);
    });
  } else {
    console.log("Services collection not empty. Skipping service seeding.");
  }
  
  // Seed Appointments (Simplified version)
  // It's complex to seed appointments realistically due to dependencies.
  // This is a very basic example. For real seeding, ensure patientId, professionalId, serviceId exist.
  const appointmentsColRef = collection(firestore, "appointments");
  const existingAppointmentsSnap = await getDocs(appointmentsColRef);
  if (existingAppointmentsSnap.empty && !existingPatientsSnap.empty && !existingProfsSnap.empty && !existingServicesSnap.empty) {
    console.log("Seeding a few sample appointments...");
    // Fetch seeded items to use their IDs
    const seededPatients = (await getDocs(patientsColRef)).docs.map(d => ({id: d.id, ...d.data()}) as Patient);
    const seededProfs = (await getDocs(professionalsColRef)).docs.map(d => ({id: d.id, ...d.data()}) as Professional);
    const seededServices = (await getDocs(servicesColRef)).docs.map(d => ({id: d.id, ...d.data()}) as Service);

    if (seededPatients.length > 0 && seededProfs.length > 0 && seededServices.length > 0) {
        const sampleAppointment: Omit<Appointment, 'id' | 'createdAt' | 'updatedAt'> = {
            patientId: seededPatients[0].id,
            locationId: LOCATIONS[0].id,
            professionalId: seededProfs.find(p=>p.locationId === LOCATIONS[0].id)?.id || seededProfs[0].id,
            serviceId: seededServices[0].id,
            appointmentDateTime: formatISO(addDays(startOfDay(new Date()), -1)), // Yesterday
            durationMinutes: seededServices[0].defaultDuration,
            status: APPOINTMENT_STATUS.COMPLETED,
            amountPaid: seededServices[0].price,
            paymentMethod: PAYMENT_METHODS[0],
            createdAt: formatISO(new Date()), // Will be overwritten by serverTimestamp
            updatedAt: formatISO(new Date()), // Will be overwritten by serverTimestamp
        };
        const apptDocRef = doc(collection(firestore, "appointments")); // Auto-generate ID
        batch.set(apptDocRef, processTimestampsForFirestore({
            ...sampleAppointment,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
        }));
    }
  } else {
    console.log("Appointments collection not empty or dependencies missing. Skipping appointment seeding.");
  }


  try {
    await batch.commit();
    console.log("Data seeding committed successfully.");
  } catch (error) {
    console.error("Error committing seed batch:", error);
  }
};


// Example of how you might call seeding, perhaps on app startup in dev mode
// if (process.env.NODE_ENV === 'development') {
//   // Check if DB is empty or needs seeding
//   const professionalsRef = collection(firestore, 'professionals');
//   getDocs(professionalsRef).then(snap => {
//     if (snap.empty) {
//       seedInitialData().then(() => console.log("Initial data seeding completed."));
//     }
//   });
// }
```