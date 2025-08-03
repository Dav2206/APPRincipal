
// src/lib/data.ts
import type { User, Professional, Patient, Service, Appointment, AppointmentFormData, ProfessionalFormData, AppointmentStatus, ServiceFormData, Contract, PeriodicReminder, ImportantNote, PeriodicReminderFormData, ImportantNoteFormData, AddedServiceItem, AppointmentUpdateFormData, Location } from '@/types';
import { USER_ROLES, APPOINTMENT_STATUS, APPOINTMENT_STATUS_DISPLAY, TIME_SLOTS, DAYS_OF_WEEK, LOCATIONS_FALLBACK } from '@/lib/constants';
import type { LocationId, DayOfWeekId } from '@/lib/constants';
import { formatISO, parseISO, addDays, setHours, setMinutes, startOfDay, endOfDay, isSameDay as dateFnsIsSameDay, startOfMonth, endOfMonth, subDays, isEqual, isBefore, isAfter, getDate, getYear, getMonth, setMonth, setYear, getHours, addMinutes as dateFnsAddMinutes, isWithinInterval, getDay, format, differenceInCalendarDays, areIntervalsOverlapping, parse } from 'date-fns';
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
  firestoreData.phone = firestoreData.phone ?? null; 
  firestoreData.isManager = firestoreData.isManager ?? false;
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

    const professionalToUpdate: Partial<Omit<Professional, 'id'|'biWeeklyEarnings'>> = {};

    if (data.hasOwnProperty('firstName')) professionalToUpdate.firstName = data.firstName;
    if (data.hasOwnProperty('lastName')) professionalToUpdate.lastName = data.lastName;
    if (data.hasOwnProperty('locationId')) professionalToUpdate.locationId = data.locationId;
    if (data.hasOwnProperty('phone')) professionalToUpdate.phone = data.phone || null;
    if (data.hasOwnProperty('isManager')) professionalToUpdate.isManager = data.isManager || false;
    if (data.hasOwnProperty('birthDay')) professionalToUpdate.birthDay = data.birthDay ?? null;
    if (data.hasOwnProperty('birthMonth')) professionalToUpdate.birthMonth = data.birthMonth ?? null;

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
      professionalToUpdate.customScheduleOverrides = (data.customScheduleOverrides || []).map(ov => ({
        ...ov,
        id: ov.id || generateId(),
        date: typeof ov.date === 'string' ? ov.date : formatISO(ov.date, { representation: 'date' }),
        overrideType: ov.overrideType || 'descanso',
        isWorking: ov.overrideType !== 'descanso',
        startTime: ov.overrideType !== 'descanso' ? ov.startTime : undefined,
        endTime: ov.overrideType !== 'descanso' ? ov.endTime : undefined,
        locationId: ov.overrideType === 'traslado' ? ov.locationId : undefined,
        notes: ov.notes || null,
      }));
    }
    
    let newCurrentContractData: Contract | null | undefined = undefined; 
    
    const contractFieldsPresent = ['currentContract_startDate', 'currentContract_endDate', 'currentContract_notes', 'currentContract_empresa']
        .some(field => data.hasOwnProperty(field));

    if (contractFieldsPresent) {
        if (data.currentContract_startDate && data.currentContract_endDate) {
            const oldContractId = existingFirestoreProfessional?.currentContract?.id;
            
            const existingStartDate = existingFirestoreProfessional?.currentContract?.startDate ? parseISO(existingFirestoreProfessional.currentContract.startDate).toISOString().split('T')[0] : null;
            const newStartDate = data.currentContract_startDate ? formatISO(data.currentContract_startDate, {representation: 'date'}) : null;
            
            const existingEndDate = existingFirestoreProfessional?.currentContract?.endDate ? parseISO(existingFirestoreProfessional.currentContract.endDate).toISOString().split('T')[0] : null;
            const newEndDate = data.currentContract_endDate ? formatISO(data.currentContract_endDate, {representation: 'date'}) : null;

            const dataHasChanged = 
              !oldContractId ||
              (newStartDate !== existingStartDate) ||
              (newEndDate !== existingEndDate) ||
              ((data.currentContract_notes ?? null) !== (existingFirestoreProfessional?.currentContract?.notes ?? null)) ||
              ((data.currentContract_empresa ?? null) !== (existingFirestoreProfessional?.currentContract?.empresa ?? null));

            newCurrentContractData = {
                id: dataHasChanged ? generateId() : oldContractId!,
                startDate: formatISO(data.currentContract_startDate, { representation: 'date' }),
                endDate: formatISO(data.currentContract_endDate, { representation: 'date' }),
                notes: data.currentContract_notes || null,
                empresa: data.currentContract_empresa || null,
            };
        } else if (data.hasOwnProperty('currentContract_startDate') && data.currentContract_startDate === null && data.hasOwnProperty('currentContract_endDate') && data.currentContract_endDate === null) {
            newCurrentContractData = null;
        } else if (existingFirestoreProfessional?.currentContract) {
            newCurrentContractData = { ...existingFirestoreProfessional.currentContract };
            if (data.hasOwnProperty('currentContract_notes')) newCurrentContractData.notes = data.currentContract_notes || null;
            if (data.hasOwnProperty('currentContract_empresa')) newCurrentContractData.empresa = data.currentContract_empresa || null;
        }
         else { 
            newCurrentContractData = null;
        }
        professionalToUpdate.currentContract = newCurrentContractData;
    }

    const firestoreUpdateData: any = { ...professionalToUpdate };
    firestoreUpdateData.phone = firestoreUpdateData.phone ?? null;
    firestoreUpdateData.isManager = firestoreUpdateData.isManager ?? false;
    firestoreUpdateData.birthDay = firestoreUpdateData.birthDay ?? null;
    firestoreUpdateData.birthMonth = firestoreUpdateData.birthMonth ?? null;
    
    if (firestoreUpdateData.hasOwnProperty('customScheduleOverrides') && firestoreUpdateData.customScheduleOverrides) {
       firestoreUpdateData.customScheduleOverrides = firestoreUpdateData.customScheduleOverrides.map((ov: any) => ({
        ...ov,
        date: toFirestoreTimestamp(ov.date), 
        startTime: ov.startTime ?? null,
        endTime: ov.endTime ?? null,
        notes: ov.notes ?? null,
        locationId: ov.locationId ?? null,
      }));
    }
   
    if (newCurrentContractData !== undefined) { 
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
      await updateDoc(docRef, firestoreUpdateData);
    } else {
      console.log("[data.ts] updateProfessional (Firestore) - No actual changes detected to update for ID:", id);
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
    let queryConstraints: QueryConstraint[] = [];
    let countQueryConstraints: QueryConstraint[] = [];
    
    if (filterToday && user) {
        const today = startOfDay(new Date());
        const effectiveLocationId = (user.role === USER_ROLES.ADMIN || user.role === USER_ROLES.CONTADOR)
            ? (adminSelectedLocation === 'all' ? undefined : adminSelectedLocation as LocationId)
            : user.locationId;

        const dailyAppointmentsResponse = await getAppointments({ date: today, locationId: effectiveLocationId });
        const patientIdsWithApptsToday = (dailyAppointmentsResponse.appointments || []).map(appt => appt.patientId);

        if (patientIdsWithApptsToday.length > 0) {
            if (patientIdsWithApptsToday.length <= 30) { // Firestore 'in' query limit
                queryConstraints.push(where(documentId(), 'in', patientIdsWithApptsToday));
                countQueryConstraints.push(where(documentId(), 'in', patientIdsWithApptsToday));
            } else {
                console.warn("[data.ts] More than 30 patients with appointments today. Fetching all and filtering client-side for 'filterToday'.");
                // No specific Firestore constraint here, will filter client-side
            }
        } else {
            return { patients: [], totalCount: 0, lastVisiblePatientId: null }; // No patients match if no appts today
        }
    }

    // Add sorting after all potential 'where' clauses that might restrict it
    queryConstraints.push(orderBy('lastName'), orderBy('firstName'));

    if (page > 1 && lastVisibleId) {
      const lastVisibleDoc = await getDoc(doc(patientsCol, lastVisibleId));
      if (lastVisibleDoc.exists()) {
        queryConstraints.push(startAfter(lastVisibleDoc));
      }
    }
    queryConstraints.push(limit(pageSize));

    const finalQuery = query(patientsCol, ...queryConstraints);
    const snapshot = await getDocs(finalQuery);
    let fetchedPatients = snapshot.docs.map(docSnap => ({ id: docSnap.id, ...convertDocumentData(docSnap.data()) } as Patient));
    
    if (searchTerm) {
        fetchedPatients = fetchedPatients.filter(p =>
            (`${p.firstName || ''} ${p.lastName || ''}`.toLowerCase().includes(searchTerm.toLowerCase()) ||
            (user?.role === USER_ROLES.ADMIN && p.phone && p.phone.includes(searchTerm)))
        );
    }

    // If filterToday was applied client-side due to >30 IDs
    if (filterToday && user && (countQueryConstraints.length === 0 || !countQueryConstraints.some(c => (c as any)._f?.toString().includes(documentId()._key.path.segments.join('/')))) ) { // Heuristic to check if Firestore filter was applied
      const today = startOfDay(new Date());
      const effectiveLocationId = (user.role === USER_ROLES.ADMIN || user.role === USER_ROLES.CONTADOR)
          ? (adminSelectedLocation === 'all' ? undefined : adminSelectedLocation as LocationId)
          : user.locationId;
      const dailyAppointmentsResponse = await getAppointments({ date: today, locationId: effectiveLocationId });
      const patientIdsWithApptsToday = new Set((dailyAppointmentsResponse.appointments || []).map(appt => appt.patientId));
      fetchedPatients = fetchedPatients.filter(p => patientIdsWithApptsToday.has(p.id));
    }
    
    const totalCountSnapshot = await getCountFromServer(query(patientsCol, ...countQueryConstraints));
    let totalCount = totalCountSnapshot.data().count;

    if (searchTerm && (!countQueryConstraints.some(c => (c as any)._f?.toString().includes('searchTerm')))) { // If search is client-side, totalCount might be inaccurate
        console.warn("[data.ts] Total count for patients might be inaccurate with client-side search term filtering.");
        // Potentially re-fetch all matching search term then count, or accept inaccuracy. For now, it's based on pre-search filters.
    }
    if (filterToday && user && (countQueryConstraints.length === 0 || !countQueryConstraints.some(c => (c as any)._f?.toString().includes(documentId()._key.path.segments.join('/'))))) {
      totalCount = fetchedPatients.length; // If filterToday was client-side, totalCount is the length of the client-filtered array.
    }


    const newLastVisibleId = fetchedPatients.length > 0 ? fetchedPatients[fetchedPatients.length - 1].id : null;

    return { patients: fetchedPatients, totalCount, lastVisiblePatientId: newLastVisibleId };

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


export async function addService (data: ServiceFormData): Promise<Service> {
  const totalDurationMinutes = (data.defaultDuration.hours * 60) + data.defaultDuration.minutes;
  const newServiceData = {
    name: data.name,
    defaultDuration: totalDurationMinutes,
    price: data.price ?? null,
  };

  
  if (!firestore) throw new Error("Firestore not initialized");
  const docRef = await addDoc(collection(firestore, 'servicios'), newServiceData);
  return { id: docRef.id, ...newServiceData };
}

export async function updateService (id: string, data: Partial<ServiceFormData>): Promise<Service | undefined> {
  const serviceUpdateData: Partial<Omit<Service, 'id'>> = {};
  if (data.name) serviceUpdateData.name = data.name;
  if (data.defaultDuration) {
    serviceUpdateData.defaultDuration = (data.defaultDuration.hours * 60) + data.defaultDuration.minutes;
  }
  if (data.hasOwnProperty('price')) serviceUpdateData.price = data.price ?? null;


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
  statuses?: AppointmentStatus[];
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
                return {...as, service: serviceDetail ? {...serviceDetail} : undefined, professional: profDetail ? {...profDetail} : undefined };
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
    
    let assignedProf: Professional | undefined;
    if (professionalIdToAssign) {
        assignedProf = await getProfessionalById(professionalIdToAssign);
        // Check if this is a temporary transfer (not a full-day override)
        const availability = getProfessionalAvailabilityForDate(assignedProf!, data.appointmentDate);
        if (assignedProf && availability?.workingLocationId !== data.locationId) {
            isExternalProfessional = true;
            externalProfessionalOriginLocationId = assignedProf.locationId;
            console.log(`[data.ts] addAppointment: Profesional ${assignedProf.firstName} es externo (traslado temporal). Origen: ${externalProfessionalOriginLocationId}, Destino: ${data.locationId}`);
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
      isExternalProfessional,
      externalProfessionalOriginLocationId,
      actualArrivalTime: null, // Initial value
      paymentMethod: null,
      amountPaid: null,
      staffNotes: null,
      attachedPhotos: [],
      addedServices: (data.addedServices || []).map((as) => ({
        serviceId: as.serviceId!,
        professionalId: as.professionalId === '_no_selection_placeholder_' ? null : (as.professionalId || null),
        amountPaid: null,
        startTime: as.startTime ?? null,
      })),
      totalCalculatedDurationMinutes: totalDurationForSlotCheck,
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
    delete mainAppointmentFirestoreData.preferredProfessionalId;
    batch.set(mainAppointmentRef, mainAppointmentFirestoreData);
    console.log(`[data.ts] addAppointment (batch): Main appointment queued for creation with ID ${mainAppointmentRef.id}.`);

    if (isExternalProfessional && externalProfessionalOriginLocationId && professionalIdToAssign) {
      const travelBlockRef = doc(collection(firestore, 'citas'));
      const travelBlockData: Omit<Appointment, 'id' | 'createdAt' | 'updatedAt'> = {
        patientId: null,
        professionalId: professionalIdToAssign,
        serviceId: 'travel',
        locationId: externalProfessionalOriginLocationId, 
        appointmentDateTime: formatISO(proposedStartTime),
        durationMinutes: totalDurationForSlotCheck,
        totalCalculatedDurationMinutes: totalDurationForSlotCheck,
        status: 'booked',
        isTravelBlock: true,
        bookingObservations: `Traslado a ${LOCATIONS.find(l => l.id === data.locationId)?.name || 'otra sede'}`,
        externalProfessionalOriginLocationId: externalProfessionalOriginLocationId,
        isExternalProfessional: false,
        addedServices: [],
        amountPaid: null,
        paymentMethod: null,
        staffNotes: null,
        attachedPhotos: [],
      };
      const travelBlockFirestoreData = {
        ...travelBlockData,
        appointmentDateTime: toFirestoreTimestamp(travelBlockData.appointmentDateTime),
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
  const appointmentToUpdate: { [key: string]: any } = {};

  Object.keys(data).forEach(key => {
    if (key !== 'attachedPhotos') {
      appointmentToUpdate[key] = (data as any)[key];
    }
  });

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
      console.log(`[data.ts] Fotos marcadas para eliminar de Storage:`, photosToDelete);
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

  if (firestoreUpdateData.addedServices) {
    firestoreUpdateData.addedServices = firestoreUpdateData.addedServices.map((as: any) => {
        const cleanedService: any = {};
        for (const key in as) {
            if (as[key] !== undefined) cleanedService[key] = as[key];
             else cleanedService[key] = null;
        }
        delete cleanedService.service;
        delete cleanedService.professional;
        return cleanedService;
    });
  }
  
  if (data.appointmentDate && data.appointmentTime) {
      const [hours, minutes] = data.appointmentTime.split(':').map(Number);
      const finalDateObject = setMinutes(setHours(data.appointmentDate, hours), minutes);
      firestoreUpdateData.appointmentDateTime = toFirestoreTimestamp(finalDateObject);
  } else if (firestoreUpdateData.appointmentDateTime) {
    firestoreUpdateData.appointmentDateTime = toFirestoreTimestamp(firestoreUpdateData.appointmentDateTime);
  }
  
  delete firestoreUpdateData.appointmentDate;
  delete firestoreUpdateData.appointmentTime;
  
  console.log(`[data.ts] Objeto final enviado para actualización en Firestore (ID: ${id}):`, firestoreUpdateData);
  await updateDoc(docRef, firestoreUpdateData);

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
    const mainAppointmentRef = doc(firestore, 'citas', appointmentId);
    const mainAppointmentSnap = await getDoc(mainAppointmentRef);

    if (!mainAppointmentSnap.exists()) {
      console.warn(`[data.ts] deleteAppointment: Appointment with ID ${appointmentId} not found.`);
      return true; // Already gone, so success.
    }

    const mainAppointmentData = convertDocumentData(mainAppointmentSnap.data()) as Appointment;
    const batch = writeBatch(firestore);

    // Delete the main appointment
    batch.delete(mainAppointmentRef);
    console.log(`[data.ts] deleteAppointment (batch): Queued main appointment ${appointmentId} for deletion.`);

    // If it was an external professional's appointment, find and delete the corresponding travel block
    if (mainAppointmentData.isExternalProfessional && mainAppointmentData.externalProfessionalOriginLocationId && mainAppointmentData.professionalId) {
      console.log(`[data.ts] This is an external professional's appointment. Searching for travel block to delete.`);
      const appointmentsCol = collection(firestore, 'citas');
      
      const startOfDayForQuery = toFirestoreTimestamp(startOfDay(parseISO(mainAppointmentData.appointmentDateTime)));
      const endOfDayForQuery = toFirestoreTimestamp(endOfDay(parseISO(mainAppointmentData.appointmentDateTime)));

      if (!startOfDayForQuery || !endOfDayForQuery) {
          console.error("[data.ts] Could not create a valid date range for travel block query.");
          // We proceed with deleting only the main appointment to avoid leaving it orphaned.
          await batch.commit();
          return true; 
      }
      
      const travelBlockQuery = query(
        appointmentsCol,
        where('isTravelBlock', '==', true),
        where('professionalId', '==', mainAppointmentData.professionalId),
        where('appointmentDateTime', '>=', startOfDayForQuery),
        where('appointmentDateTime', '<=', endOfDayForQuery)
      );

      const travelBlockSnapshot = await getDocs(travelBlockQuery);
      
      if (!travelBlockSnapshot.empty) {
        // Find the specific travel block that matches by origin location and duration.
        const blockToDelete = travelBlockSnapshot.docs.find(doc => {
            const blockData = doc.data() as Appointment;
            return blockData.locationId === mainAppointmentData.externalProfessionalOriginLocationId &&
                   blockData.durationMinutes === mainAppointmentData.totalCalculatedDurationMinutes;
        });

        if(blockToDelete) {
           console.log(`[data.ts] deleteAppointment (batch): Found and queued travel block ${blockToDelete.id} for deletion.`);
           batch.delete(blockToDelete.ref);
        } else {
             console.warn(`[data.ts] Could not find a matching travel block to delete for appointment ${appointmentId}. It may have been deleted manually or data mismatch.`);
        }
      } else {
        console.warn(`[data.ts] Could not find any travel blocks for professional ${mainAppointmentData.professionalId} on that day.`);
      }
    }

    await batch.commit();
    console.log(`[data.ts] deleteAppointment (batch): Batch committed successfully.`);
    return true;
  } catch (error) {
    console.error(`[data.ts] deleteAppointment (Firestore): Error deleting appointment ${appointmentId}:`, error);
    return false;
  }
}


export async function getPatientAppointmentHistory(patientId: string): Promise<{appointments: Appointment[]}> {
    return getAppointments({ patientId });
}


// --- End Appointments ---

// --- Professional Availability ---
export function getProfessionalAvailabilityForDate(professional: Professional, targetDate: Date): { startTime: string; endTime: string; isWorking: boolean; reason?: string, notes?: string, workingLocationId?: LocationId | null } | null {
  const contractStatus = getContractDisplayStatus(professional.currentContract, targetDate);
  const targetDateISO = formatISO(targetDate, { representation: 'date' });
  const customOverride = professional.customScheduleOverrides?.find(
    (override) => parseISO(override.date).toISOString().split('T')[0] === targetDateISO
  );

  // Determine the authoritative working location for the day
  let authoritativeLocationId: LocationId | null = professional.locationId;
  let reason = "Horario base";
  if (customOverride) {
      if (customOverride.overrideType === 'traslado' && customOverride.locationId) {
          authoritativeLocationId = customOverride.locationId;
          reason = `Traslado (${customOverride.notes || 'Día completo'})`;
      } else if (customOverride.overrideType === 'turno_especial') {
          // It's a special shift, so the location is their base location.
          authoritativeLocationId = professional.locationId;
          reason = `Turno Especial (${customOverride.notes || 'Sin especificar'})`;
      } else if (customOverride.overrideType === 'descanso') {
          return { startTime: '', endTime: '', isWorking: false, reason: `Descansando (${customOverride.notes || 'Sin especificar'})`, workingLocationId: authoritativeLocationId };
      }
  }
  
  // Contract status is a hard blocker, regardless of location.
  if (contractStatus !== 'Activo' && contractStatus !== 'Próximo a Vencer') {
    return { startTime: '', endTime: '', isWorking: false, reason: `Contrato: ${contractStatus}`, workingLocationId: authoritativeLocationId };
  }

  // Use override schedule if it exists and is not a descanso
  if (customOverride && customOverride.isWorking && customOverride.startTime && customOverride.endTime) {
    return {
      startTime: customOverride.startTime,
      endTime: customOverride.endTime,
      isWorking: true,
      reason,
      workingLocationId: authoritativeLocationId,
    };
  }

  // If no applicable override, use base schedule
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

  // If no override, contract is active, but base schedule says not working
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

export async function updatePeriodicReminder(id: string, data: Partial<PeriodicReminderFormData> & {id: string, dueDate: string}): Promise<PeriodicReminder | undefined> {
   const reminderUpdateData: Partial<Omit<PeriodicReminder, 'id' | 'createdAt'>> = {
    ...data,
    dueDate: typeof data.dueDate === 'string' ? data.dueDate : formatISO(data.dueDate, { representation: 'date'}),
    amount: data.amount ?? null,
    updatedAt: formatISO(new Date()),
  };
  delete (reminderUpdateData as any).id;



  if (!firestore) throw new Error("Firestore not initialized for updatePeriodicReminder");

  const docRef = doc(firestore, 'recordatorios', id);
  const firestoreUpdate: any = {...reminderUpdateData};
  if (firestoreUpdate.dueDate) firestoreUpdate.dueDate = toFirestoreTimestamp(firestoreUpdate.dueDate);
  if (firestoreUpdate.updatedAt) firestoreUpdate.updatedAt = toFirestoreTimestamp(firestoreUpdate.updatedAt);
  
  await updateDoc(docRef, firestoreUpdate);
  const updatedDoc = await getDoc(docRef);
  return updatedDoc.exists() ? { id: updatedDoc.id, ...convertDocumentData(updatedDoc.data()) } as PeriodicReminder : undefined;
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

