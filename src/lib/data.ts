
// src/lib/data.ts
import type { User, Professional, Patient, Service, Appointment, AppointmentFormData, ProfessionalFormData, AppointmentStatus, ServiceFormData, Contract, PeriodicReminder, ImportantNote, PeriodicReminderFormData, ImportantNoteFormData, AddedServiceItem, AppointmentUpdateFormData, Location, PaymentGroup, GroupingPreset, Material, MaterialFormData } from '@/types';
import { USER_ROLES, APPOINTMENT_STATUS, APPOINTMENT_STATUS_DISPLAY, TIME_SLOTS, DAYS_OF_WEEK, LOCATIONS_FALLBACK } from '@/lib/constants';
import type { LocationId, DayOfWeekId } from '@/lib/constants';
import { formatISO, parseISO, addDays, setHours, setMinutes, startOfDay, endOfDay, isSameDay as dateFnsIsSameDay, startOfMonth, endOfMonth, subDays, isEqual, isBefore, isAfter, getDate, getYear, getMonth, setMonth, setYear, getHours, addMinutes as dateFnsAddMinutes, isWithinInterval, getDay, format, differenceInCalendarDays, areIntervalsOverlapping, parse, addMonths, addQuarters, addYears } from 'date-fns';
import { es } from 'date-fns/locale';
import { firestore, useMockDatabase as globalUseMockDatabase, storage } from './firebase-config'; // Centralized mock flag
import { collection, addDoc, getDocs, doc, getDoc, updateDoc, query, where, deleteDoc, writeBatch, serverTimestamp, Timestamp, runTransaction, setDoc, QueryConstraint, orderBy, limit, startAfter,getCountFromServer, CollectionReference, DocumentData, documentId } from 'firebase/firestore';
import { ref as storageRef, uploadString, getDownloadURL, deleteObject } from 'firebase/storage';

console.log(`[data.ts] Valor de globalUseMockDatabase importado de firebase-config.ts: ${globalUseMockDatabase}`);

// --- Helper to generate unique IDs ---
const generateId = (): string => {
  try {
    return Math.random().toString(36).substring(2, 11) + Date.now().toString(36).substring(2, 7);
  } catch (error) {
    console.error("[data.ts] Error in generateId:", error);
    return "fallback_id_" + Date.now();
  }
};

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
          referenceDate = startOfDay(currentSystemDate);
        }
      } catch (e) {
        referenceDate = startOfDay(currentSystemDate);
      }
    } else if (referenceDateParam instanceof Date && !isNaN(referenceDateParam.getTime())) {
      referenceDate = startOfDay(referenceDateParam);
    } else {
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


// --- Auth ---
export const getUserByUsername = async (identity: string): Promise<User | undefined> => {
    if (!firestore) {
      console.warn("Firestore not initialized in getUserByUsername.");
      return undefined;
    }
    const usersCol = collection(firestore, 'usuarios');
    
    // Attempt to find by username first
    const usernameQuery = query(usersCol, where('username', '==', identity));
    const usernameSnapshot = await getDocs(usernameQuery);
    if (!usernameSnapshot.empty) {
      return { id: usernameSnapshot.docs[0].id, ...convertDocumentData(usernameSnapshot.docs[0].data()) } as User;
    }

    // If not found, attempt to find by email
    const emailQuery = query(usersCol, where('email', '==', identity));
    const emailSnapshot = await getDocs(emailQuery);
    if (!emailSnapshot.empty) {
      return { id: emailSnapshot.docs[0].id, ...convertDocumentData(emailSnapshot.docs[0].data()) } as User;
    }

    return undefined;
};

// --- Locations ---
export const getLocations = async (): Promise<Location[]> => {
  if (!firestore) {
    console.warn("[data.ts] Firestore not initialized, returning fallback locations.");
    return [...LOCATIONS_FALLBACK];
  }

  try {
    const locationsCol = collection(firestore, 'sedes');
    const snapshot = await getDocs(locationsCol);
    
    const dbLocations = snapshot.docs.map(doc => ({
      id: doc.id as LocationId,
      ...doc.data()
    })) as Location[];

    // This ensures that even if Firestore has extra locations, only the ones defined in constants are used.
    // And if a location from constants is missing in DB, it's still available in the app.
    const mergedLocations = LOCATIONS_FALLBACK.map(fallbackLoc => {
        const dbLoc = dbLocations.find(l => l.id === fallbackLoc.id);
        if (dbLoc) {
            // If location exists in DB, use its payment methods if they exist, otherwise fallback's
            return {
                ...fallbackLoc,
                paymentMethods: (Array.isArray(dbLoc.paymentMethods) && dbLoc.paymentMethods.length > 0) 
                                ? dbLoc.paymentMethods 
                                : (fallbackLoc.paymentMethods || []),
            };
        }
        return fallbackLoc; // Fallback if not in DB
    });

    return mergedLocations;

  } catch (error) {
    console.error("[data.ts] Error fetching locations from Firestore, returning fallback list:", error);
    return [...LOCATIONS_FALLBACK];
  }
};

export const updateLocationPaymentMethods = async (
  locationId: LocationId,
  paymentMethods: string[]
): Promise<boolean> => {
  if (!firestore) {
    console.error('Firestore not initialized for updateLocationPaymentMethods');
    return false;
  }
  try {
    const docRef = doc(firestore, 'sedes', locationId);
    
    // Use setDoc with merge:true. This creates the document if it doesn't exist,
    // or updates the specific fields if it does, without overwriting other fields.
    await setDoc(docRef, { paymentMethods }, { merge: true });

    return true;
  } catch (error) {
    console.error(
      `Error setting/updating payment methods for location ${locationId}:`,
      error
    );
    return false;
  }
};


// --- Professionals ---
export async function getProfessionals(locationId?: LocationId): Promise<(Professional & { contractDisplayStatus: ContractDisplayStatus })[]> {
  const currentSystemDate = new Date();
  if (!firestore) {
    console.warn("[data.ts] getProfessionals: Firestore not available, returning empty array.");
    return [];
  }
  try {
    const professionalsCol = collection(firestore, 'profesionales') as CollectionReference<DocumentData>;
    let queryConstraints: QueryConstraint[] = [];

    if (locationId) {
      queryConstraints.push(where('locationId', '==', locationId));
    }

    queryConstraints.push(orderBy('lastName'), orderBy('firstName'));

    const finalQuery = query(professionalsCol, ...queryConstraints);
    const snapshot = await getDocs(finalQuery);

    const fetchedProfessionals = snapshot.docs.map(docSnap => ({ id: docSnap.id, ...convertDocumentData(docSnap.data()) } as Professional));

    return fetchedProfessionals.map(prof => ({
      ...prof,
      contractDisplayStatus: getContractDisplayStatus(prof.currentContract, currentSystemDate)
    }));

  } catch (error: any) {
    console.error("[data.ts] Error in getProfessionals. Query was for locationId:", locationId, "Error:", error);
    if (error.message && error.message.includes("firestore/indexes?create_composite")) {
      console.error("[data.ts] Firestore query in getProfessionals requires an index. Please create it using the link in the error message:", error.message);
    }
    return [];
  }
}


export async function getProfessionalById (id: string): Promise<Professional | undefined> {
  try {
    if (!firestore) {
      console.warn("[data.ts] getProfessionalById: Firestore not available, returning undefined.");
      return undefined;
    }
    const docRef = doc(firestore, 'profesionales', id);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      return { id: docSnap.id, ...convertDocumentData(docSnap.data()) } as Professional;
    }
    return undefined;
  } catch (error) {
    console.error(`[data.ts] Error fetching professional by ID "${id}":`, error);
    return undefined;
  }
}

export async function addProfessional (data: Omit<ProfessionalFormData, 'id'>): Promise<Professional> {
  const newProfessionalData: Omit<Professional, 'id' | 'biWeeklyEarnings'> = {
    firstName: data.firstName,
    lastName: data.lastName,
    locationId: data.locationId,
    phone: data.phone || null,
    isManager: data.isManager || false,
    birthDay: data.birthDay ?? null,
    birthMonth: data.birthMonth ?? null,
    baseSalary: data.baseSalary ?? null,
    commissionRate: data.commissionRate ? data.commissionRate / 100 : null,
    commissionDeductible: data.commissionDeductible ?? null,
    discounts: 0,
    afp: data.afp ?? null,
    seguro: data.seguro ?? null,
    workSchedule: {}, 
    customScheduleOverrides: (data.customScheduleOverrides || []).map(ov => ({
      ...ov,
      id: ov.id || generateId(),
      date: formatISO(ov.date, { representation: 'date' }),
      overrideType: ov.overrideType || 'descanso',
      isWorking: ov.overrideType !== 'descanso',
      startTime: ov.overrideType !== 'descanso' ? ov.startTime : undefined,
      endTime: ov.overrideType !== 'descanso' ? ov.endTime : undefined,
      locationId: ov.overrideType === 'traslado' ? ov.locationId : undefined,
      notes: ov.notes || null,
    })),
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

  if (!firestore) {
    console.error("[data.ts] addProfessional: Firestore is not initialized.");
    throw new Error("Firestore not initialized. Professional not added.");
  }

  const firestoreData: any = { ...newProfessionalData, biWeeklyEarnings: 0 };
  
  // Sanitize all root-level optional fields to be null if they are undefined
  firestoreData.phone = firestoreData.phone ?? null; 
  firestoreData.isManager = firestoreData.isManager ?? false;
  firestoreData.birthDay = firestoreData.birthDay ?? null;
  firestoreData.birthMonth = firestoreData.birthMonth ?? null;
  firestoreData.baseSalary = firestoreData.baseSalary ?? null;
  firestoreData.commissionRate = firestoreData.commissionRate ?? null;
  firestoreData.commissionDeductible = firestoreData.commissionDeductible ?? null;
  firestoreData.discounts = firestoreData.discounts ?? null;
  firestoreData.afp = firestoreData.afp ?? null;
  firestoreData.seguro = firestoreData.seguro ?? null;
 
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
      locationId: ov.locationId ?? null,
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
  const finalAddedProf = { ...newProfessionalData, id: docRef.id, biWeeklyEarnings: 0 } as Professional;
  return finalAddedProf;
}

export async function updateProfessional (id: string, data: Partial<ProfessionalFormData>): Promise<Professional | undefined> {
  try {
    if (!firestore) {
      console.error("[data.ts] updateProfessional: Firestore is not initialized.");
      throw new Error("Firestore not initialized. Professional not updated.");
    }
    
    const docRef = doc(firestore, 'profesionales', id);
    const existingProfSnap = await getDoc(docRef);
    if (!existingProfSnap.exists()) {
        console.warn(`[data.ts] Professional with ID ${id} not found.`);
        return undefined;
    }
    const existingFirestoreProfessional = { id: existingProfSnap.id, ...convertDocumentData(existingProfSnap.data()) } as Professional;

    const firestoreUpdateData: { [key: string]: any } = {};
    
    const plainFields: (keyof ProfessionalFormData)[] = [
      'firstName', 'lastName', 'locationId', 'phone', 'isManager', 'birthDay', 
      'birthMonth', 'baseSalary', 'commissionDeductible', 'discounts', 'afp', 'seguro'
    ];

    plainFields.forEach(key => {
      if (data.hasOwnProperty(key)) {
        // Explicitly check for undefined and convert to null before sending to Firestore
        firestoreUpdateData[key] = (data as any)[key] === undefined ? null : (data as any)[key];
      }
    });
    
    if (data.hasOwnProperty('commissionRate')) {
      if (typeof data.commissionRate === 'number' && !isNaN(data.commissionRate)) {
        firestoreUpdateData.commissionRate = data.commissionRate / 100;
      } else {
        firestoreUpdateData.commissionRate = null;
      }
    }
    
    if (data.workSchedule) {
      // Create a full copy of the existing schedule to prevent data loss
      const newWorkSchedule = JSON.parse(JSON.stringify(existingFirestoreProfessional.workSchedule || {}));
      
      // Initialize all days if they don't exist in the copy
      DAYS_OF_WEEK.forEach(day => {
        if (!newWorkSchedule[day.id]) {
          newWorkSchedule[day.id] = { isWorking: false, startTime: '00:00', endTime: '00:00' };
        }
      });
      
      // Now, safely update only the days provided in the partial `data`
      for (const dayId in data.workSchedule) {
        if (data.workSchedule.hasOwnProperty(dayId)) {
           newWorkSchedule[dayId as DayOfWeekId] = data.workSchedule[dayId as DayOfWeekId];
        }
      }
      firestoreUpdateData.workSchedule = newWorkSchedule;
    }

    if (data.customScheduleOverrides) {
      firestoreUpdateData.customScheduleOverrides = (data.customScheduleOverrides || []).map(ov => ({
        ...ov,
        date: toFirestoreTimestamp(ov.date),
        notes: ov.notes ?? null,
      }));
    }
    
    const hasNewContractDates = data.currentContract_startDate && data.currentContract_endDate;
    
    if (hasNewContractDates) {
        const newStartDate = data.currentContract_startDate;
        const newEndDate = data.currentContract_endDate;
        
        const oldContract = existingFirestoreProfessional.currentContract;
        const newContract: Contract = {
            id: generateId(),
            startDate: formatISO(newStartDate, { representation: 'date' }),
            endDate: formatISO(newEndDate, { representation: 'date' }),
            notes: data.currentContract_notes ?? oldContract?.notes ?? null,
            empresa: data.currentContract_empresa ?? oldContract?.empresa ?? null,
        };
        
        firestoreUpdateData.currentContract = {
            ...newContract,
            startDate: toFirestoreTimestamp(newContract.startDate),
            endDate: toFirestoreTimestamp(newContract.endDate),
        };
        
        if (oldContract) {
            const history = (existingFirestoreProfessional.contractHistory || []).filter(h => h.id !== oldContract.id);
            history.push({ ...oldContract, startDate: oldContract.startDate, endDate: oldContract.endDate });
            firestoreUpdateData.contractHistory = history.map(ch => ({
              ...ch,
              startDate: toFirestoreTimestamp(ch.startDate),
              endDate: toFirestoreTimestamp(ch.endDate),
            }));
        }
    } else { // Handle updates to only notes or empresa without changing dates
       if (data.hasOwnProperty('currentContract_notes')) {
         firestoreUpdateData['currentContract.notes'] = data.currentContract_notes ?? null;
       }
       if (data.hasOwnProperty('currentContract_empresa')) {
         firestoreUpdateData['currentContract.empresa'] = data.currentContract_empresa ?? null;
       }
    }

    if (Object.keys(firestoreUpdateData).length > 0) {
      await updateDoc(docRef, firestoreUpdateData);
    } else {
      console.log("[data.ts] updateProfessional - No actual changes detected to update for ID:", id);
    }
    const updatedDocSnap = await getDoc(docRef);
    const finalUpdatedProf = { id: updatedDocSnap.id, ...convertDocumentData(updatedDocSnap.data()) } as Professional;
    return finalUpdatedProf;

  } catch (error) {
    console.error(`[data.ts] Error updating professional "${id}":`, error);
    throw error;
  }
}

// --- End Professionals ---

// --- Patients ---
export async function getPatients (options?: { page?: number, limit?: number, searchTerm?: string, filterToday?: boolean, adminSelectedLocation?: LocationId | 'all' | null, user?: User | null, lastVisiblePatientId?: string | null }): Promise<{ patients: Patient[], totalCount: number, lastVisiblePatientId: string | null }> {
  const { page = 1, limit: pageSize = 10, searchTerm, filterToday, adminSelectedLocation, user, lastVisiblePatientId: lastVisibleId } = options || {};

  try {
   
    if (!firestore) {
      console.warn("[data.ts] getPatients: Firestore not available, returning empty results.");
      return { patients: [], totalCount: 0, lastVisiblePatientId: null };
    }

    const patientsCol = collection(firestore, 'pacientes') as CollectionReference<DocumentData>;
    let allPatients: Patient[] = [];

    // Fetch all patients since search is client-side
    const snapshotAll = await getDocs(query(patientsCol, orderBy('lastName'), orderBy('firstName')));
    allPatients = snapshotAll.docs.map(docSnap => ({ id: docSnap.id, ...convertDocumentData(docSnap.data()) } as Patient));

    let filteredPatients = allPatients;

    if (searchTerm) {
      filteredPatients = filteredPatients.filter(p =>
          (`${p.firstName || ''} ${p.lastName || ''}`.toLowerCase().includes(searchTerm.toLowerCase()) ||
          (user?.role === USER_ROLES.ADMIN && p.phone && p.phone.includes(searchTerm)))
      );
    }

    if (filterToday && user) {
        const today = startOfDay(new Date());
        const effectiveLocationId = (user.role === USER_ROLES.ADMIN || user.role === USER_ROLES.CONTADOR)
            ? (adminSelectedLocation === 'all' ? undefined : adminSelectedLocation as LocationId)
            : user.locationId;

        const dailyAppointmentsResponse = await getAppointments({ date: today, locationId: effectiveLocationId });
        const patientIdsWithApptsToday = new Set((dailyAppointmentsResponse.appointments || []).map(appt => appt.patientId));
        
        filteredPatients = filteredPatients.filter(p => patientIdsWithApptsToday.has(p.id));
    }
    
    const totalCount = filteredPatients.length;
    const startIndex = (page - 1) * pageSize;
    const paginatedPatients = filteredPatients.slice(startIndex, startIndex + pageSize);
    const newLastVisibleId = paginatedPatients.length > 0 ? paginatedPatients[paginatedPatients.length - 1].id : null;

    return { patients: paginatedPatients, totalCount, lastVisiblePatientId: newLastVisibleId };

  } catch (error: any) {
    console.error("[data.ts] Error in getPatients:", error);
     if (error.message && error.message.includes("firestore/indexes?create_composite")) {
        console.error("[data.ts] Firestore query in getPatients requires an index. Please create it using the link in the error message:", error.message);
    }
    return { patients: [], totalCount: 0, lastVisiblePatientId: null }; 
  }
}

export async function addPatient (data: Omit<Patient, 'id'>): Promise<Patient> {
  const patientData = {
    ...data,
    phone: data.phone || null,
    age: data.age === undefined || data.age === 0 ? null : data.age,
    isDiabetic: data.isDiabetic || false,
    preferredProfessionalId: data.preferredProfessionalId || null,
    notes: data.notes || null,
  };

  
  if (!firestore) throw new Error("Firestore not initialized");
  const docRef = await addDoc(collection(firestore, 'pacientes'), patientData);
  return { id: docRef.id, ...patientData };
}

export async function updatePatient (id: string, data: Partial<Patient>): Promise<Patient | undefined> {
   const patientUpdateData = { ...data };
    if (patientUpdateData.hasOwnProperty('phone')) patientUpdateData.phone = patientUpdateData.phone || null;
    if (patientUpdateData.hasOwnProperty('age')) patientUpdateData.age = patientUpdateData.age === undefined || patientUpdateData.age === 0 ? null : patientUpdateData.age;
    if (patientUpdateData.hasOwnProperty('isDiabetic')) patientUpdateData.isDiabetic = patientUpdateData.isDiabetic || false;
    if (patientUpdateData.hasOwnProperty('preferredProfessionalId')) patientUpdateData.preferredProfessionalId = patientUpdateData.preferredProfessionalId || null;
    if (patientUpdateData.hasOwnProperty('notes')) patientUpdateData.notes = patientUpdateData.notes || null;


 
  if (!firestore) throw new Error("Firestore not initialized");
  const docRef = doc(firestore, 'pacientes', id);
  await updateDoc(docRef, patientUpdateData);
  const updatedDoc = await getDoc(docRef);
  return updatedDoc.exists() ? { id: updatedDoc.id, ...convertDocumentData(updatedDoc.data()) } as Patient : undefined;
}

export async function getPatientById (id: string): Promise<Patient | undefined> {
 
  if (!firestore) {
     console.warn("[data.ts] getPatientById: Firestore not available, returning undefined.");
     return undefined;
  }
  const docRef = doc(firestore, 'pacientes', id);
  const docSnap = await getDoc(docRef);
  return docSnap.exists() ? { id: docSnap.id, ...convertDocumentData(docSnap.data()) } as Patient : undefined;
}

export async function findPatient(firstName: string, lastName: string): Promise<Patient | null> {
  
  if (!firestore) return null;
  const patientsCol = collection(firestore, 'pacientes');
  const q = query(patientsCol, where('firstName', '==', firstName), where('lastName', '==', lastName));
  const snapshot = await getDocs(q);
  if (snapshot.empty) return null;
  return { id: snapshot.docs[0].id, ...convertDocumentData(snapshot.docs[0].data()) } as Patient;
}

// --- End Patients ---

// --- Materials ---
export async function getMaterials(): Promise<Material[]> {
  if (!firestore) {
    console.warn("[data.ts] getMaterials: Firestore not available, returning empty array.");
    return [];
  }
  try {
    const materialsCol = collection(firestore, 'insumos');
    const q = query(materialsCol, orderBy("name"));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(docSnap => ({ id: docSnap.id, ...convertDocumentData(docSnap.data()) } as Material));
  } catch (error) {
    console.error("[data.ts] Error fetching materials from Firestore:", error);
    return [];
  }
}

export async function addMaterial(data: MaterialFormData): Promise<Material> {
  if (!firestore) throw new Error("Firestore not initialized");
  const newMaterialData = {
    name: data.name,
    unit: data.unit,
  };
  const docRef = await addDoc(collection(firestore, 'insumos'), newMaterialData);
  return { id: docRef.id, ...newMaterialData };
}

export async function getMaterialConsumption(options: { dateRange: { start: Date; end: Date }, locationId?: LocationId }): Promise<{ materialId: string, quantity: number }[]> {
    if (!firestore) {
        console.warn("[data.ts] getMaterialConsumption: Firestore not available, returning empty array.");
        return [];
    }
    try {
        const { start, end } = options.dateRange;

        const appointmentsResponse = await getAppointments({
            dateRange: { start, end },
            statuses: [APPOINTMENT_STATUS.COMPLETED],
            locationId: options.locationId,
        });

        if (!appointmentsResponse || !Array.isArray(appointmentsResponse.appointments)) {
            console.warn("[data.ts] getMaterialConsumption: getAppointments did not return a valid array.");
            return [];
        }

        const allServices = await getServices();
        if (!allServices || allServices.length === 0) {
            return [];
        }
        
        const materialConsumptionMap = new Map<string, { materialId: string, quantity: number }>();

        for (const appt of appointmentsResponse.appointments) {
            const servicesPerformed: { serviceId: string }[] = [];
            
            // Add main service
            if (appt.serviceId) {
                servicesPerformed.push({ serviceId: appt.serviceId });
            }
            
            // Add added services
            if (appt.addedServices && appt.addedServices.length > 0) {
                appt.addedServices.forEach(as => {
                    if (as.serviceId) servicesPerformed.push({ serviceId: as.serviceId });
                });
            }

            for (const performed of servicesPerformed) {
                const serviceDetails = allServices.find(s => s.id === performed.serviceId);
                
                if (serviceDetails && serviceDetails.materialsUsed && serviceDetails.materialsUsed.length > 0) {
                    for (const material of serviceDetails.materialsUsed) {
                        const existing = materialConsumptionMap.get(material.materialId) || { materialId: material.materialId, quantity: 0 };
                        materialConsumptionMap.set(material.materialId, {
                            ...existing,
                            quantity: existing.quantity + material.quantity,
                        });
                    }
                }
            }
        }
        
        return Array.from(materialConsumptionMap.values());

    } catch (error) {
        console.error("[data.ts] Error calculating material consumption on-the-fly:", error);
        return [];
    }
}


// --- Services ---
export async function getServices(): Promise<Service[]> {
  
  if (!firestore) {
     console.warn("[data.ts] getServices: Firestore not available, returning empty array");
     return []; 
  }
  try {
    const servicesCol = collection(firestore, 'servicios');
    const q = query(servicesCol, orderBy("name"));
    const snapshot = await getDocs(q);
    if (snapshot.empty ) {
        console.warn("[data.ts] Firestore 'servicios' collection is empty. add services manually if this is not expected.");
    }
    return snapshot.docs.map(docSnap => ({ id: docSnap.id, ...convertDocumentData(docSnap.data()) } as Service));
  } catch (error) {
    console.error("[data.ts] Error fetching services from Firestore, returning empty array:", error);
    return [];
  }
}

export async function getServiceById(id: string): Promise<Service | undefined> {
    if (!firestore) {
        console.warn("[data.ts] getServiceById: Firestore not available, returning undefined.");
        return undefined;
    }
    try {
        const docRef = doc(firestore, 'servicios', id);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
            return { id: docSnap.id, ...convertDocumentData(docSnap.data()) } as Service;
        }
        return undefined;
    } catch (error) {
        console.error(`[data.ts] Error fetching service by ID "${id}":`, error);
        return undefined;
    }
}


export async function addService(data: ServiceFormData): Promise<Service> {
  const totalDurationMinutes = (data.defaultDuration.hours * 60) + data.defaultDuration.minutes;
  const newServiceData = {
    name: data.name,
    defaultDuration: totalDurationMinutes,
    price: data.price ?? null,
    materialsUsed: data.materialsUsed?.filter(m => m.materialId && m.quantity > 0) || [],
  };
  
  if (!firestore) throw new Error("Firestore not initialized");
  const docRef = await addDoc(collection(firestore, 'servicios'), newServiceData);
  return { id: docRef.id, ...newServiceData };
}

export async function updateService(id: string, data: Partial<ServiceFormData>): Promise<Service | undefined> {
  const serviceUpdateData: Partial<Omit<Service, 'id'>> = {};
  if (data.name) serviceUpdateData.name = data.name;
  if (data.defaultDuration) {
    serviceUpdateData.defaultDuration = (data.defaultDuration.hours * 60) + data.defaultDuration.minutes;
  }
  if (data.hasOwnProperty('price')) serviceUpdateData.price = data.price ?? null;
  if (data.hasOwnProperty('materialsUsed')) {
    serviceUpdateData.materialsUsed = data.materialsUsed?.filter(m => m.materialId && m.quantity > 0) || [];
  }

  if (!firestore) throw new Error("Firestore not initialized");
  const docRef = doc(firestore, 'servicios', id);
  await updateDoc(docRef, serviceUpdateData);
  const updatedDoc = await getDoc(docRef);
  return updatedDoc.exists() ? { id: updatedDoc.id, ...convertDocumentData(updatedDoc.data()) } as Service : undefined;
}
// --- End Services ---

// --- Appointments ---
interface GetAppointmentsOptions {
  locationId?: LocationId | undefined;
  professionalId?: string;
  patientId?: string;
  date?: Date;
  dateRange?: { start: Date; end: Date };
  statuses?: (keyof typeof APPOINTMENT_STATUS)[];
  professionalIds?: string[];
}

export async function getAppointments(options: GetAppointmentsOptions = {}): Promise<{ appointments: Appointment[] }> {
    const { locationId, professionalId, patientId, date, dateRange, statuses, professionalIds } = options;

    try {
        if (!firestore) {
            console.warn("[data.ts] getAppointments: Firestore not available, returning empty array.");
            return { appointments: [] };
        }
        const LOCATIONS = await getLocations();

        const appointmentsCol = collection(firestore, 'citas') as CollectionReference<DocumentData>;
        let queryConstraints: QueryConstraint[] = [];

        // This is a special case for the daily schedule view to correctly fetch travel blocks
        if (date && (professionalId || (professionalIds && professionalIds.length > 0))) {
            const profIdsToQuery = professionalId ? [professionalId] : professionalIds || [];
            if (profIdsToQuery.length > 0) {
                const appointmentPromises = profIdsToQuery.map(profId => {
                    const singleProfQuery = query(
                        appointmentsCol,
                        where('professionalId', '==', profId),
                        where('appointmentDateTime', '>=', toFirestoreTimestamp(startOfDay(date))!),
                        where('appointmentDateTime', '<=', toFirestoreTimestamp(endOfDay(date))!)
                    );
                    return getDocs(singleProfQuery);
                });
                const snapshots = await Promise.all(appointmentPromises);
                const allDocs = snapshots.flatMap(snapshot => snapshot.docs);
                const uniqueDocs = Array.from(new Map(allDocs.map(doc => [doc.id, doc])).values());

                let combinedAppointments = uniqueDocs.map(docSnap => ({ id: docSnap.id, ...convertDocumentData(docSnap.data()) } as Appointment));
                
                // Now filter by location client-side, because a professional might have appointments in multiple locations in one day (travel)
                if (locationId) {
                    combinedAppointments = combinedAppointments.filter(appt => appt.locationId === locationId);
                }

                // Client-side status filtering if needed
                if (statuses && statuses.length > 0) {
                    combinedAppointments = combinedAppointments.filter(appt => statuses.includes(appt.status));
                }

                 const appointmentsWithDetails = await populateAppointmentDetails(combinedAppointments);
                 return { appointments: appointmentsWithDetails.sort((a,b) => parseISO(a.appointmentDateTime).getTime() - parseISO(b.appointmentDateTime).getTime()) };
            }
        }
        
        if (locationId) queryConstraints.push(where('locationId', '==', locationId));
        if (professionalId) queryConstraints.push(where('professionalId', '==', professionalId));
        if (patientId) queryConstraints.push(where('patientId', '==', patientId));
        
        if (date) {
            queryConstraints.push(where('appointmentDateTime', '>=', toFirestoreTimestamp(startOfDay(date))!));
            queryConstraints.push(where('appointmentDateTime', '<=', toFirestoreTimestamp(endOfDay(date))!));
        }

        if (dateRange) {
            queryConstraints.push(where('appointmentDateTime', '>=', toFirestoreTimestamp(startOfDay(dateRange.start))!));
            queryConstraints.push(where('appointmentDateTime', '<=', toFirestoreTimestamp(endOfDay(dateRange.end))!));
        }
       
        if (statuses && statuses.length > 0) {
            if (statuses.length <= 10) { // Firestore 'in' query limit
                queryConstraints.push(where('status', 'in', statuses));
            } else {
                console.warn("[data.ts] getAppointments: More than 10 statuses provided. This filter will be applied client-side.");
            }
        }
        
        queryConstraints.push(orderBy('appointmentDateTime', 'asc'));

        const finalQuery = query(appointmentsCol, ...queryConstraints);
        const snapshot = await getDocs(finalQuery);
        let combinedAppointments = snapshot.docs.map(docSnap => ({ id: docSnap.id, ...convertDocumentData(docSnap.data()) } as Appointment));

        // Client-side filtering if necessary for large status arrays
        if (statuses && statuses.length > 10) {
             combinedAppointments = combinedAppointments.filter(appt => statuses.includes(appt.status));
        }

        const appointmentsWithDetails = await populateAppointmentDetails(combinedAppointments);
        return { appointments: appointmentsWithDetails };

    } catch (error: any) {
        console.error("[data.ts] Error in getAppointments. Options:", options, "Error:", error);
        if (error.message && error.message.includes("firestore/indexes?create_composite")) {
            console.error("[data.ts] Firestore query in getAppointments requires an index. Please create it using the link in the error message:", error.message);
        }
        return { appointments: [] };
    }
}

async function populateAppointmentDetails(appointments: Appointment[]): Promise<Appointment[]> {
    if (appointments.length === 0) return [];
    
    const allServicesFromDb = await getServices();
    const allProfessionalsFromDb = await getProfessionals(); // Fetches all professionals, may need optimization if slow

    return Promise.all(appointments.map(async apptData => {
        if(apptData.patientId) apptData.patient = await getPatientById(apptData.patientId);
        if(apptData.professionalId) apptData.professional = allProfessionalsFromDb.find(p => p.id === apptData.professionalId);
        apptData.service = allServicesFromDb.find(s => s.id === apptData.serviceId);

        if (apptData.addedServices && apptData.addedServices.length > 0) {
            apptData.addedServices = apptData.addedServices.map(as => {
                const serviceDetail = allServicesFromDb.find(s => s.id === as.serviceId);
                const profDetail = as.professionalId ? allProfessionalsFromDb.find(p => p.id === as.professionalId) : undefined;
                return {...as, service: serviceDetail, professional: profDetail };
            });
        }

        let totalDuration = apptData.durationMinutes || 0;
        if (apptData.addedServices) {
            apptData.addedServices.forEach(as => {
                if (as.service && as.service.defaultDuration) {
                    totalDuration += as.service.defaultDuration;
                }
            });
        }
        apptData.totalCalculatedDurationMinutes = totalDuration;
        return apptData;
    }));
}



export async function getAppointmentById(id: string): Promise<Appointment | undefined> {

 if (!firestore) {
 console.warn("[data.ts] getAppointmentById: Firestore not available, returning undefined.");
 return undefined;
 }
 const docRef = doc(firestore, 'citas', id);
 const docSnap = await getDoc(docRef);
 if (docSnap.exists()) {
 const apptData = { id: docSnap.id, ...convertDocumentData(docSnap.data()) } as Appointment;
 const allServices = await getServices();
 const allProfessionals = await getProfessionals();

 if (apptData.patientId) apptData.patient = await getPatientById(apptData.patientId);
 if (apptData.professionalId) apptData.professional = allProfessionals.find(p => p.id === apptData.professionalId);
 if (apptData.serviceId) {
 apptData.service = allServices.find(s => s.id === apptData.serviceId);
 }
 if (apptData.addedServices && apptData.addedServices.length > 0) {
 apptData.addedServices = apptData.addedServices.map(as => {
 const serviceDetail = allServices.find(s => s.id === as.serviceId);
 const profDetail = as.professionalId ? allProfessionals.find(p => p.id === as.professionalId) : undefined;
 return {...as, service: serviceDetail, professional: profDetail };
 });
 }
 let totalDuration = apptData.durationMinutes || 0;
 if (apptData.addedServices) {
 apptData.addedServices.forEach(as => {
 if (as.service && as.service.defaultDuration) {
 totalDuration += as.service.defaultDuration;
 }
 });
 }
 apptData.totalCalculatedDurationMinutes = totalDuration;
 return apptData;
 }
 return undefined;
}

export async function addAppointment(data: AppointmentFormData): Promise<Appointment> {
  console.log("[data.ts] addAppointment: Datos de entrada recibidos:", data);

  if (!firestore) {
    console.error("[data.ts] addAppointment: Firestore not initialized.");
    throw new Error("Firestore not initialized. Appointment not added.");
  }
  const LOCATIONS = await getLocations();

  try {
    const allServicesList = await getServices();
    const mainService = allServicesList.find(s => s.id === data.serviceId);
    
    if (!mainService) {
      throw new Error(`Servicio principal con ID ${data.serviceId} no encontrado.`);
    }
    const mainServiceDuration = mainService.defaultDuration || 30;

    let totalDurationForSlotCheck = mainServiceDuration;
    if (data.addedServices) {
      data.addedServices.forEach(as => {
        const addedSvcInfo = allServicesList.find(s => s.id === as.serviceId);
        if (addedSvcInfo) totalDurationForSlotCheck += addedSvcInfo.defaultDuration;
      });
    }

    let patientId: string | null = data.existingPatientId || null;
    let newPatient: Patient | null = null;
    if (!patientId && !data.isWalkIn) {
      newPatient = await addPatient({
        firstName: data.patientFirstName,
        lastName: data.patientLastName,
        phone: data.patientPhone,
        age: data.patientAge,
        isDiabetic: data.isDiabetic,
        preferredProfessionalId: null,
        notes: null
      });
      patientId = newPatient.id;
    }

    const proposedStartTime = parse(`${format(data.appointmentDate, 'yyyy-MM-dd')} ${data.appointmentTime}`, 'yyyy-MM-dd HH:mm', new Date());
    
    let professionalIdToAssign: string | null = data.preferredProfessionalId === '_any_professional_placeholder_' ? null : data.preferredProfessionalId;
    
    let isExternalProfessional = false;
    let externalProfessionalOriginLocationId: LocationId | null = null;
    
    if (!professionalIdToAssign) {
      console.log("[data.ts] addAppointment: Buscando profesional disponible...");
      const allProfessionals = await getProfessionals(); // Fetch all to check for transfers
      
      const appointmentsForDay = await getAppointments({
        date: data.appointmentDate,
        statuses: [APPOINTMENT_STATUS.BOOKED, APPOINTMENT_STATUS.CONFIRMED, APPOINTMENT_STATUS.COMPLETED] // Widen status check
      });

      const proposedEndTime = dateFnsAddMinutes(proposedStartTime, totalDurationForSlotCheck);

      for (const prof of allProfessionals) {
        if(prof.isManager) continue; 
        
        const availability = getProfessionalAvailabilityForDate(prof, data.appointmentDate);

        // A professional is a candidate if they are working at the target location (natively or full-day transfer)
        // OR if we are doing a per-appointment transfer from their working location.
        const isWorkingAtTargetLocation = availability?.isWorking && availability.workingLocationId === data.locationId;
        const isAvailableForTempTransfer = availability?.isWorking && data.professionalOriginLocationId === availability.workingLocationId;

        if (!isWorkingAtTargetLocation && !isAvailableForTempTransfer) {
            continue;
        }

        const profWorkStartTime = parse(`${format(data.appointmentDate, 'yyyy-MM-dd')} ${availability!.startTime}`, 'yyyy-MM-dd HH:mm', new Date());
        const profWorkEndTime = parse(`${format(data.appointmentDate, 'yyyy-MM-dd')} ${availability!.endTime}`, 'yyyy-MM-dd HH:mm', new Date());
        
        if (isBefore(proposedStartTime, profWorkStartTime) || isAfter(proposedEndTime, profWorkEndTime)) continue;
        
        let isBusy = false;
        // Check for conflicts at their actual working location for the day
        const profAppointments = appointmentsForDay.appointments.filter(a => a.professionalId === prof.id && a.locationId === availability!.workingLocationId);

        for (const existingAppt of profAppointments) {
          const existingApptStartTime = parseISO(existingAppt.appointmentDateTime);
          const existingApptEndTime = dateFnsAddMinutes(existingApptStartTime, existingAppt.totalCalculatedDurationMinutes || existingAppt.durationMinutes);
          if (areIntervalsOverlapping({ start: proposedStartTime, end: proposedEndTime }, { start: existingApptStartTime, end: existingApptEndTime })) {
            isBusy = true;
            break;
          }
        }
        if (!isBusy) {
          professionalIdToAssign = prof.id;
          console.log(`[data.ts] addAppointment: Profesional disponible encontrado y asignado: ${prof.firstName} ${prof.lastName}`);
          break;
        }
      }
      if (!professionalIdToAssign) {
        throw new Error("No hay profesionales disponibles en el horario seleccionado. Por favor, elija otro horario o un profesional específico.");
      }
    }
    
    // Correctly determine if the assigned professional is external for THIS appointment
    if (professionalIdToAssign) {
        const assignedProf = await getProfessionalById(professionalIdToAssign);
        const availabilityOnDay = assignedProf ? getProfessionalAvailabilityForDate(assignedProf, data.appointmentDate) : null;
        
        // It's an external professional for this specific appointment IF their authoritative working location for the day
        // is NOT the same as the appointment's location.
        if (availabilityOnDay && availabilityOnDay.isWorking && availabilityOnDay.workingLocationId !== data.locationId) {
            isExternalProfessional = true;
            // The origin is their authoritative working location for the day.
            externalProfessionalOriginLocationId = availabilityOnDay.workingLocationId;
            console.log(`[data.ts] addAppointment: Profesional ${assignedProf?.firstName} es externo (traslado por cita). Origen autorizado: ${externalProfessionalOriginLocationId}, Destino cita: ${data.locationId}`);
        }
    }


    const newAppointmentData: Omit<Appointment, 'id' | 'createdAt' | 'updatedAt'> = {
      patientId: patientId,
      professionalId: professionalIdToAssign,
      serviceId: data.serviceId,
      locationId: data.locationId,
      appointmentDateTime: formatISO(proposedStartTime),
      status: 'booked',
      durationMinutes: mainServiceDuration,
      preferredProfessionalId: data.preferredProfessionalId === '_any_professional_placeholder_' ? null : data.preferredProfessionalId, // Save the preference
      isExternalProfessional,
      externalProfessionalOriginLocationId,
      actualArrivalTime: null, // Initial value
      paymentMethod: null,
      amountPaid: null,
      staffNotes: null,
      attachedPhotos: [],
      addedServices: (data.addedServices || []).map((as) => ({
        serviceId: as.serviceId!,
        professionalId: as.professionalId || professionalIdToAssign, // Inherit if null
        amountPaid: null,
        startTime: as.startTime ?? null,
      })),
      totalCalculatedDurationMinutes: totalDurationForSlotCheck,
      isForFamilyMember: data.isForFamilyMember || false,
      familyMemberRelation: data.isForFamilyMember ? data.familyMemberRelation : null,
      bookingObservations: data.bookingObservations ?? null,
    };

    const batch = writeBatch(firestore);

    const mainAppointmentRef = doc(collection(firestore, 'citas'));
    const mainAppointmentFirestoreData: any = {
      ...newAppointmentData,
      appointmentDateTime: toFirestoreTimestamp(newAppointmentData.appointmentDateTime),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      addedServices: newAppointmentData.addedServices?.map(as => ({ ...as })) || [],
    };
    
    batch.set(mainAppointmentRef, mainAppointmentFirestoreData);
    console.log(`[data.ts] addAppointment (batch): Main appointment queued for creation with ID ${mainAppointmentRef.id}.`);

    if (isExternalProfessional && externalProfessionalOriginLocationId && professionalIdToAssign) {
      const travelBlockRef = doc(collection(firestore, 'citas'));
      const travelBlockData: Partial<Appointment> = {
        isTravelBlock: true,
        originalAppointmentId: mainAppointmentRef.id, // Link to the main appointment
        professionalId: professionalIdToAssign,
        locationId: externalProfessionalOriginLocationId, 
        appointmentDateTime: formatISO(proposedStartTime),
        durationMinutes: totalDurationForSlotCheck,
        totalCalculatedDurationMinutes: totalDurationForSlotCheck,
        status: 'booked',
        bookingObservations: `Traslado a ${LOCATIONS.find(l => l.id === data.locationId)?.name || 'otra sede'}`,
      };
      const travelBlockFirestoreData = {
        ...travelBlockData,
        appointmentDateTime: toFirestoreTimestamp(travelBlockData.appointmentDateTime!),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      batch.set(travelBlockRef, travelBlockFirestoreData);
      console.log(`[data.ts] addAppointment (batch): Travel block queued for creation in origin location ${externalProfessionalOriginLocationId} with ID ${travelBlockRef.id}.`);
    }

    await batch.commit();
    console.log("[data.ts] addAppointment (batch): Batch committed successfully.");

    const newDocSnap = await getDoc(mainAppointmentRef);
    if (newDocSnap.exists()) {
      let addedAppt = { id: newDocSnap.id, ...convertDocumentData(newDocSnap.data()) } as Appointment;
      const allProfessionals = await getProfessionals();
      if (addedAppt.patientId) addedAppt.patient = await getPatientById(addedAppt.patientId);
      if (addedAppt.professionalId) addedAppt.professional = allProfessionals.find(p => p.id === addedAppt.professionalId);
      addedAppt.service = allServicesList.find(s => s.id === addedAppt.serviceId);
      if (addedAppt.addedServices && addedAppt.addedServices.length > 0) {
        addedAppt.addedServices = addedAppt.addedServices.map(as => {
          const serviceDetail = allServicesList.find(s => s.id === as.serviceId);
          const profDetail = as.professionalId ? allProfessionals.find(p => p.id === as.professionalId) : undefined;
          return { ...as, service: serviceDetail, professional: profDetail };
        });
      }
      return addedAppt;
    } else {
      console.error("[data.ts] addAppointment: Failed to fetch newly created appointment document after batch commit.");
      return { id: mainAppointmentRef.id, ...newAppointmentData, createdAt: formatISO(new Date()), updatedAt: formatISO(new Date()) } as Appointment;
    }
  } catch (error) {
    console.error("[data.ts] Error adding appointment:", error);
    throw error;
  }
}

// Helper function to find and manage travel blocks
async function manageRelatedTravelBlock(
  batch: ReturnType<typeof writeBatch>,
  mainAppointmentId: string,
  updatedAppointmentData: Partial<Appointment>,
  oldAppointmentData: Appointment
) {
  if (!firestore) return;
  const appointmentsCol = collection(firestore, 'citas');

  // 1. Find and delete the OLD travel block, if it exists
  const oldTravelBlockQuery = query(appointmentsCol, where('originalAppointmentId', '==', mainAppointmentId));
  const oldTravelBlockSnapshot = await getDocs(oldTravelBlockQuery);
  oldTravelBlockSnapshot.forEach(doc => {
    console.log(`[manageRelatedTravelBlock] Found old travel block ${doc.id} to delete.`);
    batch.delete(doc.ref);
  });

  // 2. If the updated appointment is STILL an external one, create a NEW travel block
  if (updatedAppointmentData.isExternalProfessional && updatedAppointmentData.externalProfessionalOriginLocationId && updatedAppointmentData.professionalId) {
    const travelBlockRef = doc(collection(firestore, 'citas'));
    const LOCATIONS = await getLocations();
    const travelBlockData: Partial<Appointment> = {
      isTravelBlock: true,
      originalAppointmentId: mainAppointmentId,
      professionalId: updatedAppointmentData.professionalId,
      locationId: updatedAppointmentData.externalProfessionalOriginLocationId,
      appointmentDateTime: updatedAppointmentData.appointmentDateTime,
      durationMinutes: updatedAppointmentData.totalCalculatedDurationMinutes,
      totalCalculatedDurationMinutes: updatedAppointmentData.totalCalculatedDurationMinutes,
      status: 'booked',
      bookingObservations: `Traslado a ${LOCATIONS.find(l => l.id === updatedAppointmentData.locationId)?.name || 'otra sede'}`,
      createdAt: oldAppointmentData.createdAt, // Keep original creation date if needed
      updatedAt: serverTimestamp(),
    };
    const firestoreTravelBlockData = { ...travelBlockData };
    if (firestoreTravelBlockData.appointmentDateTime) {
      firestoreTravelBlockData.appointmentDateTime = toFirestoreTimestamp(firestoreTravelBlockData.appointmentDateTime);
    }
     if (firestoreTravelBlockData.createdAt) {
      firestoreTravelBlockData.createdAt = toFirestoreTimestamp(firestoreTravelBlockData.createdAt);
    }
    batch.set(travelBlockRef, firestoreTravelBlockData);
    console.log(`[manageRelatedTravelBlock] Queued new travel block ${travelBlockRef.id} for creation.`);
  }
}



export async function updateAppointment(
  id: string,
  data: Partial<AppointmentUpdateFormData>,
  originalPhotos: { url: string }[] = []
): Promise<Appointment | undefined> {
  console.log(`[data.ts] updateAppointment: Iniciando actualización para cita ID ${id}`, data);

  if (!firestore || !storage) {
    throw new Error("Firestore o Storage no están inicializados.");
  }

  const docRef = doc(firestore, 'citas', id);
  const oldAppointmentSnap = await getDoc(docRef);
  if (!oldAppointmentSnap.exists()) {
    console.warn(`[data.ts] updateAppointment: No se encontró la cita con ID ${id}.`);
    return undefined;
  }
  const oldAppointmentData = { id: oldAppointmentSnap.id, ...convertDocumentData(oldAppointmentSnap.data()) } as Appointment;
  const wasCompleted = oldAppointmentData.status === APPOINTMENT_STATUS.COMPLETED;
  const isBecomingCompleted = data.status === APPOINTMENT_STATUS.COMPLETED;

  const appointmentToUpdate: { [key: string]: any } = {};

  Object.keys(data).forEach(key => {
    if (key !== 'attachedPhotos') {
      appointmentToUpdate[key] = (data as any)[key];
    }
  });

  // Handle duration separately
  if (data.duration) {
    appointmentToUpdate.durationMinutes = (data.duration.hours || 0) * 60 + (data.duration.minutes || 0);
    delete appointmentToUpdate.duration; // Remove the object from the update data
  }

  // Photo handling logic
  if (data.attachedPhotos !== undefined) {
    const newPhotoDataUris = (data.attachedPhotos || []).map(p => p && p.url).filter(url => url && url.startsWith('data:image/'));
    const existingPhotoUrlsFromForm = (data.attachedPhotos || []).map(p => p && p.url).filter(url => url && (url.startsWith('http') || url.startsWith('gs://')));
    
    const newUploadedUrls = await Promise.all(
      newPhotoDataUris.map(async (dataUri) => {
        const photoName = generateId();
        const photoRef = storageRef(storage, `appointment-photos/${id}/${photoName}`);
        console.log(`[data.ts] Subiendo nueva imagen a: ${photoRef.fullPath}`);
        const snapshot = await uploadString(photoRef, dataUri, 'data_url');
        return getDownloadURL(snapshot.ref);
      })
    );
    
    appointmentToUpdate.attachedPhotos = [...existingPhotoUrlsFromForm, ...newUploadedUrls];
    console.log(`[data.ts] URLs de fotos finales para Firestore:`, appointmentToUpdate.attachedPhotos);
    
    const originalPhotoUrls = originalPhotos.map(p => p.url);
    const photosToDelete = originalPhotoUrls.filter(originalUrl => !existingPhotoUrlsFromForm.includes(originalUrl));
    
    if (photosToDelete.length > 0) {
      console.log(`[data.ts] Fotos marcadas para eliminación de Storage:`, photosToDelete);
      await Promise.all(photosToDelete.map(async (url) => {
        try {
          if (url && url.startsWith('http')) {
            const photoRef = storageRef(storage, url);
            await deleteObject(photoRef);
            console.log(`[data.ts] Imagen eliminada de Storage: ${url}`);
          }
        } catch (error: any) {
          if (error.code !== 'storage/object-not-found') {
            console.error(`[data.ts] Error eliminando foto ${url}:`, error);
          } else {
            console.warn(`[data.ts] Imagen no encontrada en Storage al intentar eliminar, se omite: ${url}`);
          }
        }
      }));
    }
  }

  const firestoreUpdateData: { [key: string]: any } = { ...appointmentToUpdate, updatedAt: serverTimestamp() };
  
  for (const key in firestoreUpdateData) {
    if (firestoreUpdateData[key] === undefined) {
      firestoreUpdateData[key] = null;
    }
  }

  // Correction for Added Services Professional ID Inheritance
  if (firestoreUpdateData.addedServices) {
    const mainProfId = firestoreUpdateData.professionalId === '_no_selection_placeholder_' 
      ? oldAppointmentData.professionalId 
      : firestoreUpdateData.professionalId || oldAppointmentData.professionalId;
    
    firestoreUpdateData.addedServices = firestoreUpdateData.addedServices.map((as: any) => {
      const cleanedService: any = {};
      for (const key in as) {
        if (as[key] !== undefined) cleanedService[key] = as[key];
      }
      if (cleanedService.professionalId === '_no_selection_placeholder_' || cleanedService.professionalId === undefined || cleanedService.professionalId === null) {
        cleanedService.professionalId = mainProfId;
      }
      delete cleanedService.service;
      delete cleanedService.professional;
      return cleanedService;
    });
  }

  // Special logic for appointmentDateTime
  let finalDateObject;
  if (data.status === APPOINTMENT_STATUS.CONFIRMED && data.actualArrivalTime) {
      const datePart = data.appointmentDate || parseISO(oldAppointmentData.appointmentDateTime);
      const [hours, minutes] = data.actualArrivalTime.split(':').map(Number);
      finalDateObject = setMinutes(setHours(datePart, hours), minutes);
      firestoreUpdateData.appointmentDateTime = toFirestoreTimestamp(finalDateObject);
  } else if (data.appointmentDate && data.appointmentTime) {
      const [hours, minutes] = data.appointmentTime.split(':').map(Number);
      finalDateObject = setMinutes(setHours(data.appointmentDate, hours), minutes);
      firestoreUpdateData.appointmentDateTime = toFirestoreTimestamp(finalDateObject);
  } else if (firestoreUpdateData.appointmentDateTime) {
    firestoreUpdateData.appointmentDateTime = toFirestoreTimestamp(firestoreUpdateData.appointmentDateTime);
  }
  
  delete firestoreUpdateData.appointmentDate;
  delete firestoreUpdateData.appointmentTime;

  // New logic to determine if the appointment is now external
  const allServicesList = await getServices();
  const mainService = allServicesList.find(s => s.id === (data.serviceId || oldAppointmentData.serviceId));
  let totalDuration = firestoreUpdateData.durationMinutes || mainService?.defaultDuration || 0;
  if(data.addedServices) {
      data.addedServices.forEach(as => {
          const addedSvcInfo = allServicesList.find(s => s.id === as.serviceId);
          if (addedSvcInfo) totalDuration += addedSvcInfo.defaultDuration;
      });
  }
  firestoreUpdateData.totalCalculatedDurationMinutes = totalDuration;
  
  const assignedProfessionalId = data.professionalId === '_no_selection_placeholder_' ? null : data.professionalId || oldAppointmentData.professionalId;
  firestoreUpdateData.professionalId = assignedProfessionalId;

  if (assignedProfessionalId) {
      const assignedProf = await getProfessionalById(assignedProfessionalId);
      const availabilityOnDay = assignedProf ? getProfessionalAvailabilityForDate(assignedProf, data.appointmentDate || parseISO(oldAppointmentData.appointmentDateTime)) : null;
      if (availabilityOnDay && availabilityOnDay.isWorking && availabilityOnDay.workingLocationId !== oldAppointmentData.locationId) {
          firestoreUpdateData.isExternalProfessional = true;
          firestoreUpdateData.externalProfessionalOriginLocationId = availabilityOnDay.workingLocationId;
      } else {
          firestoreUpdateData.isExternalProfessional = false;
          firestoreUpdateData.externalProfessionalOriginLocationId = null;
      }
  } else {
       firestoreUpdateData.isExternalProfessional = false;
       firestoreUpdateData.externalProfessionalOriginLocationId = null;
  }
  
  const batch = writeBatch(firestore);
  batch.update(docRef, firestoreUpdateData);

  const finalUpdatedDataForTravelBlock = { 
    ...oldAppointmentData, 
    ...firestoreUpdateData, 
    appointmentDateTime: finalDateObject ? formatISO(finalDateObject) : oldAppointmentData.appointmentDateTime
  };

  await manageRelatedTravelBlock(batch, id, finalUpdatedDataForTravelBlock, oldAppointmentData);
  

  await batch.commit();

  const updatedDoc = await getDoc(docRef);
  if (updatedDoc.exists()) {
    let populatedUpdatedAppt = {id: updatedDoc.id, ...convertDocumentData(updatedDoc.data())} as Appointment;
    const allServices = await getServices();
    const allProfessionals = await getProfessionals();
    if (populatedUpdatedAppt.patientId) populatedUpdatedAppt.patient = await getPatientById(populatedUpdatedAppt.patientId);
    if (populatedUpdatedAppt.professionalId) populatedUpdatedAppt.professional = allProfessionals.find(p => p.id === populatedUpdatedAppt.professionalId);
    populatedUpdatedAppt.service = allServices.find(s => s.id === populatedUpdatedAppt.serviceId);
    if (populatedUpdatedAppt.addedServices?.length) {
      populatedUpdatedAppt.addedServices = populatedUpdatedAppt.addedServices.map(as => {
        const serviceDetail = allServices.find(s => s.id === as.serviceId);
        const profDetail = as.professionalId ? allProfessionals.find(p => p.id === as.professionalId) : undefined;
        return {...as, service: serviceDetail, professional: profDetail };
      });
    }
    return populatedUpdatedAppt;
  }
  return undefined;
}


export async function deleteAppointment(appointmentId: string): Promise<boolean> {
  console.log(`[data.ts] deleteAppointment. ID: ${appointmentId}`);

  if (!firestore) {
    console.error("[data.ts] deleteAppointment: Firestore not initialized.");
    throw new Error("Firestore not initialized. Appointment not deleted.");
  }
  try {
    const batch = writeBatch(firestore);
    const mainAppointmentRef = doc(firestore, 'citas', appointmentId);
    
    // Also find and delete the related travel block
    const travelBlockQuery = query(collection(firestore, 'citas'), where('originalAppointmentId', '==', appointmentId));
    const travelBlockSnapshot = await getDocs(travelBlockQuery);
    
    if (!travelBlockSnapshot.empty) {
      const travelBlockDoc = travelBlockSnapshot.docs[0];
      console.log(`[data.ts] deleteAppointment (batch): Found and queued travel block ${travelBlockDoc.id} for deletion.`);
      batch.delete(travelBlockDoc.ref);
    } else {
      console.log(`[data.ts] deleteAppointment: No associated travel block found for appointment ${appointmentId}.`);
    }

    // Delete the main appointment
    batch.delete(mainAppointmentRef);
    console.log(`[data.ts] deleteAppointment (batch): Queued main appointment ${appointmentId} for deletion.`);

    await batch.commit();
    console.log(`[data.ts] deleteAppointment (batch): Batch committed successfully for appointment ${appointmentId} and its travel block (if any).`);
    return true;
  } catch (error) {
    console.error(`[data.ts] deleteAppointment (Firestore): Error deleting appointment ${appointmentId}:`, error);
    return false;
  }
}

export async function updateAppointmentProfessional(appointmentId: string, newProfessionalId: string): Promise<Appointment | undefined> {
    if (!firestore) {
        throw new Error("Firestore not initialized.");
    }
    const docRef = doc(firestore, 'citas', appointmentId);
    await updateDoc(docRef, {
        professionalId: newProfessionalId,
        updatedAt: serverTimestamp(),
    });

    const updatedAppointment = await getAppointmentById(appointmentId);
    return updatedAppointment;
}

export async function updateAppointmentDateTime(appointmentId: string, newDateTime: Date): Promise<Appointment | undefined> {
    if (!firestore) {
        throw new Error("Firestore not initialized.");
    }
    const batch = writeBatch(firestore);
    const mainAppointmentRef = doc(firestore, 'citas', appointmentId);
    
    // Update the main appointment
    batch.update(mainAppointmentRef, {
        appointmentDateTime: toFirestoreTimestamp(newDateTime),
        updatedAt: serverTimestamp(),
    });
    
    // Find and update the related travel block, if it exists
    const travelBlockQuery = query(collection(firestore, 'citas'), where('originalAppointmentId', '==', appointmentId));
    const travelBlockSnapshot = await getDocs(travelBlockQuery);
    
    if (!travelBlockSnapshot.empty) {
        const travelBlockDoc = travelBlockSnapshot.docs[0];
        batch.update(travelBlockDoc.ref, {
            appointmentDateTime: toFirestoreTimestamp(newDateTime),
            updatedAt: serverTimestamp(),
        });
        console.log(`[data.ts] Queued update for travel block ${travelBlockDoc.id} time.`);
    }

    await batch.commit();

    return getAppointmentById(appointmentId);
}

export async function updateAddedServiceProfessional(appointmentId: string, serviceId: string, newProfessionalId: string): Promise<Appointment | undefined> {
    if (!firestore) {
        throw new Error("Firestore not initialized.");
    }
    const docRef = doc(firestore, 'citas', appointmentId);
    
    await runTransaction(firestore, async (transaction) => {
        const apptDoc = await transaction.get(docRef);
        if (!apptDoc.exists()) {
            throw new Error("Appointment not found!");
        }

        const apptData = apptDoc.data() as Appointment;
        const addedServices = apptData.addedServices || [];
        let serviceUpdated = false;

        const updatedAddedServices = addedServices.map(as => {
            if (as.serviceId === serviceId && !serviceUpdated) { // Update only the first match
                serviceUpdated = true;
                return { ...as, professionalId: newProfessionalId };
            }
            return as;
        });

        if (serviceUpdated) {
            transaction.update(docRef, { 
                addedServices: updatedAddedServices,
                updatedAt: serverTimestamp() 
            });
        }
    });

    return await getAppointmentById(appointmentId);
}


export async function getPatientAppointmentHistory(patientId: string): Promise<{appointments: Appointment[]}> {
    return getAppointments({ patientId });
}


// --- End Appointments ---

// --- Professional Availability ---
export function getProfessionalAvailabilityForDate(professional: Professional, targetDate: Date): { startTime: string; endTime: string; isWorking: boolean; reason?: string, notes?: string, workingLocationId?: LocationId | null } | null {
  const targetDateISO = format(targetDate, 'yyyy-MM-dd');

  // First, check for a specific override for the target date.
  const customOverride = professional.customScheduleOverrides?.find(
    (override) => format(parseISO(override.date), 'yyyy-MM-dd') === targetDateISO
  );

  if (customOverride) {
    const workingLocationId = customOverride.overrideType === 'traslado' ? customOverride.locationId : professional.locationId;
    if (customOverride.overrideType === 'descanso') {
      return { startTime: '', endTime: '', isWorking: false, reason: `Descansando (${customOverride.notes || 'Sin especificar'})`, workingLocationId };
    }
    if (customOverride.isWorking && customOverride.startTime && customOverride.endTime) {
      const reason = customOverride.overrideType === 'traslado' 
        ? `Traslado (${customOverride.notes || 'Día completo'})` 
        : `Turno Especial (${customOverride.notes || 'Sin especificar'})`;
      return {
        startTime: customOverride.startTime,
        endTime: customOverride.endTime,
        isWorking: true,
        reason,
        workingLocationId,
      };
    }
  }

  // If no override, use the base weekly schedule.
  const dayOfWeekIndex = getDay(targetDate); // Sunday is 0, Monday is 1, etc.
  const dayOfWeekId = DAYS_OF_WEEK[(dayOfWeekIndex + 6) % 7].id as DayOfWeekId; // Adjust to make Monday 0 -> 'monday'
  const baseSchedule = professional.workSchedule?.[dayOfWeekId];

  if (baseSchedule && baseSchedule.isWorking && baseSchedule.startTime && baseSchedule.endTime) {
    return {
      startTime: baseSchedule.startTime,
      endTime: baseSchedule.endTime,
      isWorking: true,
      reason: "Horario base",
      workingLocationId: professional.locationId,
    };
  }

  // If no override and base schedule says not working.
  return { startTime: '', endTime: '', isWorking: false, reason: `Descansando (Horario base: ${format(targetDate, 'EEEE', {locale: es})} libre)`, workingLocationId: professional.locationId };
}
// --- End Professional Availability ---


// --- Periodic Reminders ---
export async function getPeriodicReminders(): Promise<PeriodicReminder[]> {
 
  if (!firestore) {
    console.warn("[data.ts] getPeriodicReminders: Firestore not available, returning empty array.");
    return [];
  }
  try {
    const remindersCol = collection(firestore, 'recordatorios');
    const q = query(remindersCol, orderBy("dueDate", "asc"));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(docSnap => ({ id: docSnap.id, ...convertDocumentData(docSnap.data()) } as PeriodicReminder));
  } catch (error) {
    console.error("[data.ts] Error fetching periodic reminders from Firestore:", error);
    return [];
  }
}

export async function addPeriodicReminder(data: PeriodicReminderFormData): Promise<PeriodicReminder> {
  const newReminderData = {
    ...data,
    dueDate: formatISO(data.dueDate, { representation: 'date'}),
    amount: data.amount ?? null,
    createdAt: formatISO(new Date()),
    updatedAt: formatISO(new Date()),
  };


  if (!firestore) throw new Error("Firestore not initialized for addPeriodicReminder");

  const firestoreData = {
    ...newReminderData,
    dueDate: toFirestoreTimestamp(newReminderData.dueDate),
    createdAt: toFirestoreTimestamp(newReminderData.createdAt),
    updatedAt: toFirestoreTimestamp(newReminderData.updatedAt),
  };
  const docRef = await addDoc(collection(firestore, 'recordatorios'), firestoreData);
  return { id: docRef.id, ...newReminderData };
}

export async function updatePeriodicReminder(id: string, data: Partial<PeriodicReminderFormData>): Promise<PeriodicReminder | undefined> {
  if (!firestore) throw new Error("Firestore not initialized for updatePeriodicReminder");

  return runTransaction(firestore, async (transaction) => {
    const reminderRef = doc(firestore, "recordatorios", id);
    const reminderSnap = await transaction.get(reminderRef);
    if (!reminderSnap.exists()) {
      throw new Error(`Recordatorio con ID ${id} no encontrado.`);
    }
    
    const currentReminderData = convertDocumentData(reminderSnap.data());
    const currentReminderDueDate = currentReminderData.dueDate ? parseISO(currentReminderData.dueDate) : null;


    if(!currentReminderDueDate){
        throw new Error("El recordatorio actual no tiene una fecha de vencimiento válida.");
    }
    
    // First, update the current reminder
    const updateData: Partial<PeriodicReminder> = {
      ...data,
      updatedAt: formatISO(new Date()),
    };
     if (data.dueDate) {
      updateData.dueDate = typeof data.dueDate === 'string' ? data.dueDate : formatISO(data.dueDate, { representation: 'date'});
    }

    const firestoreUpdateData: any = {...updateData};
    if (firestoreUpdateData.dueDate) firestoreUpdateData.dueDate = toFirestoreTimestamp(firestoreUpdateData.dueDate);
    if (firestoreUpdateData.updatedAt) firestoreUpdateData.updatedAt = toFirestoreTimestamp(firestoreUpdateData.updatedAt);
    
    transaction.update(reminderRef, firestoreUpdateData);

    // If marking as paid and it's recurring, create the next one
    if (data.status === 'paid' && currentReminderData.recurrence !== 'once') {
      let nextDueDate: Date;
      switch (currentReminderData.recurrence) {
        case 'monthly': nextDueDate = addMonths(currentReminderDueDate, 1); break;
        case 'quarterly': nextDueDate = addQuarters(currentReminderDueDate, 1); break;
        case 'annually': nextDueDate = addYears(currentReminderDueDate, 1); break;
        default: nextDueDate = currentReminderDueDate;
      }
      
      const nextReminderData: Omit<PeriodicReminder, 'id'> = {
        title: currentReminderData.title,
        description: currentReminderData.description,
        category: currentReminderData.category,
        dueDate: formatISO(nextDueDate, { representation: 'date' }),
        recurrence: currentReminderData.recurrence,
        amount: currentReminderData.amount,
        status: 'pending',
        createdAt: formatISO(new Date()),
        updatedAt: formatISO(new Date()),
      };
      
      const nextReminderFirestoreData: any = {
          ...nextReminderData,
          dueDate: toFirestoreTimestamp(nextReminderData.dueDate),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
      };
      
      const newReminderRef = doc(collection(firestore, "recordatorios"));
      transaction.set(newReminderRef, nextReminderFirestoreData);
    }
    
    const finalDocSnap = await getDoc(reminderRef);
    if (!finalDocSnap.exists()) return undefined;
    
    return { id: finalDocSnap.id, ...convertDocumentData(finalDocSnap.data()) } as PeriodicReminder;

  });
}



export async function deletePeriodicReminder(reminderId: string): Promise<boolean> {
  
  if (!firestore) throw new Error("Firestore not initialized for deletePeriodicReminder");
  try {
    await deleteDoc(doc(firestore, 'recordatorios', reminderId));
    return true;
  } catch (error) {
    console.error(`Error deleting periodic reminder ${reminderId}:`, error);
    return false;
  }
}
// --- End Periodic Reminders ---


// --- Important Notes ---
export async function getImportantNotes(): Promise<ImportantNote[]> {

   if (!firestore) {
    console.warn("[data.ts] getImportantNotes: Firestore not available, returning empty array.");
    return [];
  }
  try {
    const notesCol = collection(firestore, 'notasImportantes');
    const q = query(notesCol, orderBy("createdAt", "desc"));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(docSnap => ({ id: docSnap.id, ...convertDocumentData(docSnap.data()) } as ImportantNote));
  } catch (error) {
    console.error("[data.ts] Error fetching important notes from Firestore:", error);
    return [];
  }
}

export async function addImportantNote(data: ImportantNoteFormData): Promise<ImportantNote> {
  const newNoteData = {
    ...data,
    createdAt: formatISO(new Date()),
    updatedAt: formatISO(new Date()),
  };

  if (!firestore) throw new Error("Firestore not initialized for addImportantNote");
  
  const firestoreData = {
    ...newNoteData,
    createdAt: toFirestoreTimestamp(newNoteData.createdAt),
    updatedAt: toFirestoreTimestamp(newNoteData.updatedAt),
  };
  const docRef = await addDoc(collection(firestore, 'notasImportantes'), firestoreData);
  return { id: docRef.id, ...newNoteData };
}

export async function updateImportantNote(id: string, data: Partial<ImportantNoteFormData>): Promise<ImportantNote | undefined> {
  const noteUpdateData = {
    ...data,
    updatedAt: formatISO(new Date()),
  };

  if (!firestore) throw new Error("Firestore not initialized for updateImportantNote");

  const docRef = doc(firestore, 'notasImportantes', id);
  const firestoreUpdate: any = {...noteUpdateData};
  if (firestoreUpdate.updatedAt) firestoreUpdate.updatedAt = toFirestoreTimestamp(firestoreUpdate.updatedAt);

  await updateDoc(docRef, firestoreUpdate);
  const updatedDoc = await getDoc(docRef);
  return updatedDoc.exists() ? { id: updatedDoc.id, ...convertDocumentData(updatedDoc.data()) } as ImportantNote : undefined;
}

export async function deleteImportantNote(noteId: string): Promise<boolean> {

  if (!firestore) throw new Error("Firestore not initialized for deleteImportantNote");
  try {
    await deleteDoc(doc(firestore, 'notasImportantes', noteId));
    return true;
  } catch (error) {
    console.error(`Error deleting important note ${noteId}:`, error);
    return false;
  }
}
// --- End Important Notes ---

// --- Configuration Functions ---
export async function getGroupingPresets(): Promise<GroupingPreset[]> {
  if (!firestore) return [];
  try {
    const configDocRef = doc(firestore, 'configuracion', 'groupingPresets');
    const docSnap = await getDoc(configDocRef);
    if (docSnap.exists()) {
      return (docSnap.data().presets || []) as GroupingPreset[];
    }
    return [];
  } catch (error) {
    console.error("Error fetching grouping presets:", error);
    return [];
  }
}

export async function saveGroupingPresets(presets: GroupingPreset[]): Promise<void> {
  if (!firestore) throw new Error("Firestore not initialized.");
  try {
    const configDocRef = doc(firestore, 'configuracion', 'groupingPresets');
    await setDoc(configDocRef, { presets });
  } catch (error) {
    console.error("Error saving grouping presets:", error);
    throw error;
  }
}


// --- Maintenance Functions ---
export async function cleanupOrphanedTravelBlocks(): Promise<number> {
  if (!firestore) {
    console.error("Firestore not initialized for cleanup.");
    throw new Error("Firestore not initialized.");
  }
  
  console.log("Starting cleanup of orphaned travel blocks...");
  const appointmentsCol = collection(firestore, 'citas');
  const travelBlocksQuery = query(appointmentsCol, where('isTravelBlock', '==', true));
  const travelBlocksSnapshot = await getDocs(travelBlocksQuery);

  if (travelBlocksSnapshot.empty) {
    console.log("No travel blocks found to check. Cleanup finished.");
    return 0;
  }

  const mainAppointmentIds = travelBlocksSnapshot.docs
    .map(doc => doc.data().originalAppointmentId)
    .filter(id => id); // Filter out any blocks that might not have the ID

  if (mainAppointmentIds.length === 0) {
    console.log("No travel blocks with originalAppointmentId found. Checking for blocks without the link...");
    // This part handles very old blocks that might not have the linking field.
    const batch = writeBatch(firestore);
    let orphanCount = 0;
    travelBlocksSnapshot.docs.forEach(doc => {
      if (!doc.data().originalAppointmentId) {
        console.log(`Found orphan travel block (no originalAppointmentId): ${doc.id}. Deleting.`);
        batch.delete(doc.ref);
        orphanCount++;
      }
    });
    if(orphanCount > 0){
      await batch.commit();
      console.log(`Deleted ${orphanCount} legacy orphaned blocks.`);
    }
    return orphanCount;
  }


  // Split into chunks of 30 for the 'in' query limit
  const idChunks: string[][] = [];
  for (let i = 0; i < mainAppointmentIds.length; i += 30) {
    idChunks.push(mainAppointmentIds.slice(i, i + 30));
  }

  const existingMainAppointmentIds = new Set<string>();
  
  for (const chunk of idChunks) {
    const mainAppointmentsQuery = query(appointmentsCol, where(documentId(), 'in', chunk));
    const mainAppointmentsSnapshot = await getDocs(mainAppointmentsQuery);
    mainAppointmentsSnapshot.forEach(doc => existingMainAppointmentIds.add(doc.id));
  }
  
  const batch = writeBatch(firestore);
  let deletedCount = 0;

  travelBlocksSnapshot.forEach(doc => {
    const travelBlock = doc.data();
    if (!travelBlock.originalAppointmentId || !existingMainAppointmentIds.has(travelBlock.originalAppointmentId)) {
      console.log(`Found orphan travel block: ${doc.id}. Linked appointment ${travelBlock.originalAppointmentId} does not exist. Deleting.`);
      batch.delete(doc.ref);
      deletedCount++;
    }
  });

  if (deletedCount > 0) {
    await batch.commit();
    console.log(`Successfully deleted ${deletedCount} orphaned travel blocks.`);
  } else {
    console.log("No orphaned travel blocks found to delete.");
  }

  return deletedCount;
}

export async function findPotentialDuplicatePatients(): Promise<{ group: Patient[], reason: string }[]> {
  if (!firestore) return [];

  const patientsCol = collection(firestore, 'pacientes');
  const snapshot = await getDocs(patientsCol);
  const allPatients = snapshot.docs.map(d => ({ ...d.data(), id: d.id } as Patient));

  const normalize = (str: string | null | undefined) => {
    return (str || '')
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "") // Remove accents
      .replace(/\s+/g, ''); // Remove all spaces
  };

  const groups: { [key: string]: { patients: Set<string>, reason: string } } = {};

  const addPatientToGroup = (key: string, patient: Patient, reason: string) => {
    if (!key) return;
    if (!groups[key]) {
      groups[key] = { patients: new Set(), reason };
    }
    groups[key].patients.add(patient.id);
  };

  // Create initial groups based on different keys
  allPatients.forEach(patient => {
    const fullName = normalize(`${patient.firstName} ${patient.lastName}`);
    const phone = patient.phone ? patient.phone.replace(/\s/g, '') : null;

    addPatientToGroup(fullName, patient, 'Coincidencia de Nombre Similar');
    
    if (phone && phone.length > 5) {
      addPatientToGroup(`phone:${phone}`, patient, 'Mismo Número de Teléfono');
    }
  });

  // Merge overlapping groups
  const mergedGroups: Set<string>[] = [];
  const patientToGroupMap = new Map<string, Set<string>>();

  Object.values(groups).forEach(groupData => {
    if (groupData.patients.size > 1) {
      let mergedTo: Set<string> | undefined;
      for (const patientId of groupData.patients) {
        if (patientToGroupMap.has(patientId)) {
          mergedTo = patientToGroupMap.get(patientId);
          break;
        }
      }

      if (!mergedTo) {
        mergedTo = new Set(groupData.patients);
        mergedGroups.push(mergedTo);
      } else {
        for (const patientId of groupData.patients) {
          mergedTo.add(patientId);
        }
      }

      for (const patientId of groupData.patients) {
        patientToGroupMap.set(patientId, mergedTo);
      }
    }
  });
  
  // Format the final result
  const finalResult = mergedGroups.map(patientIdSet => {
    const patientGroup = Array.from(patientIdSet)
      .map(id => allPatients.find(p => p.id === id))
      .filter((p): p is Patient => p !== undefined)
      .sort((a,b) => (a.lastName || '').localeCompare(b.lastName || ''));

    // Determine the most likely reason for grouping
    let reason = "Coincidencia de Nombre Similar";
    const phones = new Set(patientGroup.map(p => p.phone).filter(Boolean));
    if (patientGroup.length > phones.size && phones.size > 0) {
        reason = "Mismo Número de Teléfono"
    }
    
    return { group: patientGroup, reason };
  }).filter(g => g.group.length > 1);

  return finalResult;
}


export async function mergePatients(primaryPatientId: string, duplicateIds: string[]): Promise<void> {
  if (!firestore) throw new Error("Firestore not initialized.");

  await runTransaction(firestore, async (transaction) => {
    const appointmentsCol = collection(firestore, 'citas');
    const patientsCol = collection(firestore, 'pacientes');

    // 1. Re-assign appointments from duplicates to the primary patient
    for (const duplicateId of duplicateIds) {
      const appointmentsQuery = query(appointmentsCol, where('patientId', '==', duplicateId));
      const appointmentsSnapshot = await getDocs(appointmentsQuery);
      
      appointmentsSnapshot.forEach(doc => {
        transaction.update(doc.ref, { patientId: primaryPatientId });
      });
    }

    // 2. Delete the duplicate patient documents
    for (const duplicateId of duplicateIds) {
      const patientRef = doc(patientsCol, duplicateId);
      transaction.delete(patientRef);
    }
  });
}

// --- End Maintenance ---

// --- Rotations ---
export async function markDayAsHoliday(day: Date): Promise<number> {
    if (!firestore) {
        console.error("Firestore not initialized.");
        throw new Error("Firestore not initialized.");
    }

    const professionals = await getProfessionals();
    const activeProfessionals = professionals.filter(prof => {
        const status = getContractDisplayStatus(prof.currentContract, day);
        return status === 'Activo' || status === 'Próximo a Vencer';
    });

    const batch = writeBatch(firestore);
    const dateISO = format(day, "yyyy-MM-dd");

    activeProfessionals.forEach(prof => {
        const profRef = doc(firestore, 'profesionales', prof.id);
        const existingOverrides = prof.customScheduleOverrides || [];
        
        const existingOverrideIndex = existingOverrides.findIndex(ov => format(parseISO(ov.date), 'yyyy-MM-dd') === dateISO);

        const newOverride = {
            id: existingOverrideIndex > -1 ? existingOverrides[existingOverrideIndex].id : `override_${generateId()}`,
            date: dateISO,
            overrideType: 'descanso' as const,
            isWorking: false,
            notes: 'Feriado',
        };

        if (existingOverrideIndex > -1) {
            existingOverrides[existingOverrideIndex] = newOverride;
        } else {
            existingOverrides.push(newOverride);
        }

        const firestoreOverrides = existingOverrides.map(ov => ({
            ...ov,
            date: toFirestoreTimestamp(ov.date),
        }));

        batch.update(profRef, { customScheduleOverrides: firestoreOverrides });
    });

    await batch.commit();
    return activeProfessionals.length;
}


// --- End Rotations ---
