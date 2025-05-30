
// src/lib/data.ts
import type { User, Professional, Patient, Service, Appointment, AppointmentFormData, ProfessionalFormData, AppointmentStatus, ServiceFormData, Contract, PeriodicReminder, ImportantNote, PeriodicReminderFormData, ImportantNoteFormData, AddedServiceItem } from '@/types';
import { LOCATIONS, USER_ROLES, SERVICES as SERVICES_CONSTANTS, APPOINTMENT_STATUS, LocationId, ServiceId as ConstantServiceId, APPOINTMENT_STATUS_DISPLAY, PAYMENT_METHODS, TIME_SLOTS, DAYS_OF_WEEK } from './constants';
import type { DayOfWeekId } from './constants';
import { formatISO, parseISO, addDays, setHours, setMinutes, startOfDay, endOfDay, isSameDay as dateFnsIsSameDay, startOfMonth, endOfMonth, subDays, isEqual, isBefore, isAfter, getDate, getYear, getMonth, setMonth, setYear, getHours, addMinutes as dateFnsAddMinutes, isWithinInterval, getDay, format, differenceInCalendarDays, areIntervalsOverlapping, parse } from 'date-fns';
import { es } from 'date-fns/locale';
import { firestore, useMockDatabase as globalUseMockDatabase } from './firebase-config'; // Centralized mock flag
import { collection, addDoc, getDocs, doc, getDoc, updateDoc, query, where, deleteDoc, writeBatch, serverTimestamp, Timestamp, runTransaction, setDoc, QueryConstraint, orderBy, limit, startAfter,getCountFromServer, CollectionReference, DocumentData, documentId } from 'firebase/firestore';

console.log(`[data.ts] Valor de globalUseMockDatabase importado de firebase-config.ts: ${globalUseMockDatabase}`);


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
          // console.warn(`[data.ts] getContractDisplayStatus: Invalid referenceDateParam string after parsing. Falling back to currentSystemDate. Original:`, referenceDateParam);
          referenceDate = startOfDay(currentSystemDate);
        }
      } catch (e) {
        // console.warn(`[data.ts] getContractDisplayStatus: Error parsing referenceDateParam string. Falling back to currentSystemDate. Original:`, referenceDateParam, "Error:", e);
        referenceDate = startOfDay(currentSystemDate);
      }
    } else if (referenceDateParam instanceof Date && !isNaN(referenceDateParam.getTime())) {
      referenceDate = startOfDay(referenceDateParam);
    } else {
      // console.warn("[data.ts] getContractDisplayStatus: Invalid referenceDateParam type or NaN date. Falling back to currentSystemDate. Original:", referenceDateParam);
      referenceDate = startOfDay(currentSystemDate);
    }
  } else {
    referenceDate = startOfDay(currentSystemDate);
  }

  // console.log(`[data.ts] getContractDisplayStatus - Reference Date: ${formatISO(referenceDate)}`);

  if (!contract || !contract.startDate || !contract.endDate) {
    // console.log("[data.ts] getContractDisplayStatus - No contract or no start/end date. Status: Sin Contrato");
    return 'Sin Contrato';
  }

  const { startDate: startDateStr, endDate: endDateStr } = contract;

  if (typeof startDateStr !== 'string' || typeof endDateStr !== 'string' || startDateStr.length === 0 || endDateStr.length === 0) {
    // console.log("[data.ts] getContractDisplayStatus - Contract start/end date strings are invalid. Status: Sin Contrato. Contract:", contract);
    return 'Sin Contrato';
  }

  let startDate: Date;
  let endDate: Date;

  try {
    startDate = parseISO(startDateStr);
    endDate = parseISO(endDateStr);
  } catch (e) {
    // console.error("[data.ts] getContractDisplayStatus: Error parsing contract date strings. Contract:", contract, "Error:", e);
    return 'Sin Contrato'; 
  }

  if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
    // console.log("[data.ts] getContractDisplayStatus - Parsed contract start/end dates are NaN. Status: Sin Contrato. Parsed Start:", startDate, "Parsed End:", endDate);
    return 'Sin Contrato';
  }
  
  // console.log(`[data.ts] getContractDisplayStatus - Contract Start: ${formatISO(startOfDay(startDate))}, Contract End: ${formatISO(endOfDay(endDate))}`);

  if (isBefore(referenceDate, startOfDay(startDate))) {
    // console.log(`[data.ts] getContractDisplayStatus - Reference date is before contract start. Status: No Vigente Aún`);
    return 'No Vigente Aún';
  }
  if (isAfter(referenceDate, endOfDay(endDate))) { 
    // console.log(`[data.ts] getContractDisplayStatus - Reference date is after contract end. Status: Vencido`);
    return 'Vencido';
  }

  const daysUntilExpiry = differenceInCalendarDays(endOfDay(endDate), referenceDate);
  if (daysUntilExpiry <= 15 && daysUntilExpiry >= 0) {
    // console.log(`[data.ts] getContractDisplayStatus - Days until expiry: ${daysUntilExpiry}. Status: Próximo a Vencer`);
    return 'Próximo a Vencer';
  }
  // console.log(`[data.ts] getContractDisplayStatus - Contract is active. Status: Activo`);
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



// --- Auth ---
export const getUserByUsername = async (username: string): Promise<User | undefined> => {
  
    if (!firestore) {
      console.warn("Firestore not initialized in getUserByUsername. Using mock as fallback.");
      return mockDB.users.find(u => u.username === username);
    }
    const usersCol = collection(firestore, 'usuarios');
    const q = query(usersCol, where('username', '==', username));
    const snapshot = await getDocs(q);
    if (snapshot.empty) return undefined;
    return { id: snapshot.docs[0].id, ...convertDocumentData(snapshot.docs[0].data()) } as User;
};


// --- Professionals ---

export async function getProfessionals (locationId?: LocationId): Promise<(Professional & { contractDisplayStatus: ContractDisplayStatus })[]> {
  const currentSystemDate = new Date();

  try {
    if (!firestore) {
      console.warn("[data.ts] getProfessionals: Firestore not available, returning empty array."); // Mensaje actualizado
      return []; // Retorna un array vacío
    }

    const professionalsCol = collection(firestore, 'profesionales') as CollectionReference<DocumentData>;
    let qConstraints: QueryConstraint[] = [];
    if (locationId) {
      qConstraints.push(where('locationId', '==', locationId));
    }
    // qConstraints.push(orderBy("lastName"), orderBy("firstName")); // Esto requiere un índice compuesto

    const finalQuery = query(professionalsCol, ...qConstraints);
    const snapshot = await getDocs(finalQuery);
    let fetchedProfessionals = snapshot.docs.map(docSnap => ({ id: docSnap.id, ...convertDocumentData(docSnap.data()) } as Professional));

    // Se elimina el bloque que dependía de snapshot.empty y globalUseMockDatabase

    fetchedProfessionals.sort((a, b) => {
      const nameA = `${a.firstName || ''} ${a.lastName || ''}`.toLowerCase();
      const nameB = `${b.firstName || ''} ${b.lastName || ''}`.toLowerCase();
      return nameA.localeCompare(nameB);
    });

    return fetchedProfessionals.map(prof => ({
      ...prof,
      contractDisplayStatus: getContractDisplayStatus(prof.currentContract, currentSystemDate)
    }));

  } catch (error: any) {
    console.error("[data.ts] Error in getProfessionals. Query was for locationId:", locationId, "Error:", error); // Mensaje actualizado
    if (error.message && error.message.includes("firestore/indexes?create_composite")) {
        console.error("[data.ts] Firestore query in getProfessionals requires an index. Please create it using the link in the error message:", error.message);
    }
    // En caso de error, retorna un array vacío en lugar de datos simulados
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
  try {
    const newProfessionalData: Omit<Professional, 'id' | 'biWeeklyEarnings'> = {
      firstName: data.firstName,
      lastName: data.lastName,
      locationId: data.locationId,
      phone: data.phone || null,
      isManager: data.isManager || false,
      birthDay: data.birthDay ?? null,
      birthMonth: data.birthMonth ?? null,
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
  } catch (error) {
    console.error("[data.ts] Error adding professional:", error);
    throw error;
  }
}

export async function updateProfessional (id: string, data: Partial<ProfessionalFormData>): Promise<Professional | undefined> {
  try {
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
    const existingProfForContract = await getProfessionalById(id);

    const contractFieldsPresent = ['currentContract_startDate', 'currentContract_endDate', 'currentContract_notes', 'currentContract_empresa']
        .some(field => data.hasOwnProperty(field));

    if (contractFieldsPresent) {
        if (data.currentContract_startDate && data.currentContract_endDate) {
            const oldContractId = existingProfForContract?.currentContract?.id;
            
            const existingStartDate = existingProfForContract?.currentContract?.startDate ? parseISO(existingProfForContract.currentContract.startDate).toISOString().split('T')[0] : null;
            const newStartDate = data.currentContract_startDate ? formatISO(data.currentContract_startDate, {representation: 'date'}) : null;
            
            const existingEndDate = existingProfForContract?.currentContract?.endDate ? parseISO(existingProfForContract.currentContract.endDate).toISOString().split('T')[0] : null;
            const newEndDate = data.currentContract_endDate ? formatISO(data.currentContract_endDate, {representation: 'date'}) : null;

            const dataHasChanged = 
              !oldContractId ||
              (newStartDate !== existingStartDate) ||
              (newEndDate !== existingEndDate) ||
              ((data.currentContract_notes ?? null) !== (existingProfForContract?.currentContract?.notes ?? null)) ||
              ((data.currentContract_empresa ?? null) !== (existingProfForContract?.currentContract?.empresa ?? null));

            newCurrentContractData = {
                id: dataHasChanged ? generateId() : oldContractId!,
                startDate: formatISO(data.currentContract_startDate, { representation: 'date' }),
                endDate: formatISO(data.currentContract_endDate, { representation: 'date' }),
                notes: data.currentContract_notes || null,
                empresa: data.currentContract_empresa || null,
            };
        } else if (data.hasOwnProperty('currentContract_startDate') && data.currentContract_startDate === null && data.hasOwnProperty('currentContract_endDate') && data.currentContract_endDate === null) {
            newCurrentContractData = null;
        } else if (existingProfForContract?.currentContract) {
            newCurrentContractData = { ...existingProfForContract.currentContract };
            if (data.hasOwnProperty('currentContract_notes')) newCurrentContractData.notes = data.currentContract_notes || null;
            if (data.hasOwnProperty('currentContract_empresa')) newCurrentContractData.empresa = data.currentContract_empresa || null;
        }
         else { 
            newCurrentContractData = null;
        }
        professionalToUpdate.currentContract = newCurrentContractData;
    }

  

    if (!firestore) {
      console.error("[data.ts] updateProfessional: Firestore is not initialized.");
      throw new Error("Firestore not initialized. Professional not updated.");
    }

    const docRef = doc(firestore, 'profesionales', id);
    const professionalDocSnap = await getDoc(docRef); 
    if (!professionalDocSnap.exists()) {
        console.warn(`[data.ts] Professional with ID ${id} not found in Firestore for update.`);
        return undefined;
    }
    const existingFirestoreProfessional = { id: professionalDocSnap.id, ...convertDocumentData(professionalDocSnap.data()) } as Professional;
    
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
    const snapshot = await getDocs(query(servicesCol, orderBy("name")));
    if (snapshot.empty ) {
        console.warn("[data.ts] Firestore 'servicios' collection is empty. add services manually if this is not expected.");
    }
    return snapshot.docs.map(docSnap => ({ id: docSnap.id, ...convertDocumentData(docSnap.data()) } as Service));
  } catch (error) {
    console.error("[data.ts] Error fetching services from Firestore, returning empty array:", error);
    return [];
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
}

export async function getAppointments(options: GetAppointmentsOptions = {}): Promise<{ appointments: Appointment[] }> {
  const { locationId, professionalId, patientId, date, dateRange, statuses } = options;
  
  try {
     if (!firestore) {
      console.warn("[data.ts] getAppointments: Firestore not available, returning empty array.");
      return { appointments: [] };
    }
    
    const appointmentsCol = collection(firestore, 'citas') as CollectionReference<DocumentData>;
    let qConstraints: QueryConstraint[] = [];

    if (locationId) qConstraints.push(where('locationId', '==', locationId));
    if (professionalId) qConstraints.push(where('professionalId', '==', professionalId));
    if (patientId) qConstraints.push(where('patientId', '==', patientId));
    
    if (date) {
      qConstraints.push(where('appointmentDateTime', '>=', toFirestoreTimestamp(startOfDay(date))!));
      qConstraints.push(where('appointmentDateTime', '<=', toFirestoreTimestamp(endOfDay(date))!));
    }
    if (dateRange) {
      qConstraints.push(where('appointmentDateTime', '>=', toFirestoreTimestamp(startOfDay(dateRange.start))!));
      qConstraints.push(where('appointmentDateTime', '<=', toFirestoreTimestamp(endOfDay(dateRange.end))!));
    }
    if (statuses && statuses.length > 0) {
      if (statuses.length === 1) { 
        qConstraints.push(where('status', '==', statuses[0]));
      } else if (statuses.length <= 30) { 
        qConstraints.push(where('status', 'in', statuses));
      } else {
        console.warn("[data.ts] getAppointments: Too many statuses for 'in' query. Fetching all and filtering client-side for statuses.");
      }
    }
    qConstraints.push(orderBy('appointmentDateTime', 'asc'));

    const finalQuery = query(appointmentsCol, ...qConstraints);
    const snapshot = await getDocs(finalQuery);

    if (snapshot.empty) {
      console.warn("[data.ts] Firestore 'citas' query returned no results with current filters.");
    }
    
    const allServicesFromDb = await getServices(); 
    const allProfessionalsFromDb = await getProfessionals(); // Get all professionals to populate names

    const appointmentsFromDb = await Promise.all(snapshot.docs.map(async docSnap => {
      const apptData = { id: docSnap.id, ...convertDocumentData(docSnap.data()) } as Appointment;
      
      if(apptData.patientId) apptData.patient = await getPatientById(apptData.patientId);
      if(apptData.professionalId) apptData.professional = allProfessionalsFromDb.find(p => p.id === apptData.professionalId); // Use cached list
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

    let finalAppointments = appointmentsFromDb;
    if (statuses && statuses.length > 30) {
        finalAppointments = appointmentsFromDb.filter(a => statuses.includes(a.status));
    }

    return { appointments: finalAppointments };

  } catch (error: any) {
    console.error("[data.ts] Error in getAppointments. Options:", options, "Error:", error);
    if (error.message && error.message.includes("firestore/indexes?create_composite")) {
        console.error("[data.ts] Firestore query in getAppointments requires an index. Please create it using the link in the error message:", error.message);
    }
    return { appointments: [] }; 
  }
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
  }
  return undefined;
}

export async function addAppointment(data: AppointmentFormData): Promise<Appointment> {
  console.log(`[data.ts] addAppointment.  Form data received:`, data);

  const allServicesList = await getServices();
  const service = allServicesList.find(s => s.id === data.serviceId);

  if (!service) {
    console.error(`[data.ts] addAppointment: Servicio principal con ID ${data.serviceId} no encontrado.`);
    throw new Error(`Servicio principal con ID ${data.serviceId} no encontrado.`);
  }
  const mainServiceDuration = service.defaultDuration;

  let totalDuration = mainServiceDuration;
  if (data.addedServices && data.addedServices.length > 0) {
    data.addedServices.forEach(as => {
      const addedSvc = allServicesList.find(s => s.id === as.serviceId);
      if (addedSvc) {
        totalDuration += addedSvc.defaultDuration;
      }
    });
  }

  const [hours, minutes] = data.appointmentTime.split(':').map(Number);
  const appointmentDateTimeObject = setMinutes(setHours(startOfDay(data.appointmentDate), hours), minutes);
  const appointmentDateTime = formatISO(appointmentDateTimeObject);
  const appointmentEndTime = dateFnsAddMinutes(appointmentDateTimeObject, totalDuration);

  let patientIdToUse = data.existingPatientId;
  if (!patientIdToUse) {
    const newPatientData: Omit<Patient, 'id'> = {
      firstName: data.patientFirstName,
      lastName: data.patientLastName,
      phone: data.patientPhone || null,
      age: data.patientAge ?? null,
      isDiabetic: data.isDiabetic || false,
    };
    const createdPatient = await addPatient(newPatientData);
    patientIdToUse = createdPatient.id;
  }

  let actualProfessionalId: string | undefined | null = data.preferredProfessionalId === '_any_professional_placeholder_' ? null : data.preferredProfessionalId;
  let isExternal = false;
  let externalOrigin: LocationId | null = null;
  let travelBlockAppointment: Omit<Appointment, 'id'> | null = null;

  if (!actualProfessionalId || actualProfessionalId === null) {
    console.log(`[data.ts] addAppointment: No preferred professional. Attempting auto-assignment. searchExternal: ${data.searchExternal}`);
    let professionalsToConsider: Professional[] = [];
    {
        const allProfsResult = await getProfessionals(data.searchExternal ? undefined : data.locationId);
        professionalsToConsider = allProfsResult.map(p => p as Professional);
    }
    console.log(`[data.ts] addAppointment: Professionals to consider for auto-assignment (${professionalsToConsider.length}):`, professionalsToConsider.map(p=>p.id));


    const appointmentsForDayResponse = await getAppointments({
      locationId: data.searchExternal ? undefined : data.locationId, 
      date: data.appointmentDate,
      statuses: [APPOINTMENT_STATUS.BOOKED, APPOINTMENT_STATUS.CONFIRMED, APPOINTMENT_STATUS.COMPLETED]
    });
    const existingAppointmentsForDay = appointmentsForDayResponse.appointments || [];
     console.log(`[data.ts] addAppointment: Existing appointments for day/location check (${existingAppointmentsForDay.length}):`, existingAppointmentsForDay.map(a => ({prof:a.professionalId, time: a.appointmentDateTime, loc:a.locationId})));

    for (const prof of professionalsToConsider) {
      if (prof.isManager && !data.preferredProfessionalId) { // Skip managers in auto-assignment unless explicitly chosen
        console.log(`[data.ts] addAppointment: Skipping manager ${prof.id} in auto-assignment.`);
        continue;
      }

      const availability = getProfessionalAvailabilityForDate(prof, data.appointmentDate);
      // console.log(`[data.ts] addAppointment: Checking prof ${prof.id}. Availability for ${format(data.appointmentDate, 'yyyy-MM-dd')}:`, availability);
      if (!availability || !availability.isWorking || !availability.startTime || !availability.endTime) {
        console.log(`[data.ts] addAppointment: Prof ${prof.id} not available or not working (isWorking: ${availability?.isWorking}, startTime: ${availability?.startTime}, endTime: ${availability?.endTime}).`);
        continue;
      }
      
      const profWorkStartTime = parse(`${format(data.appointmentDate, 'yyyy-MM-dd')} ${availability.startTime}`, 'yyyy-MM-dd HH:mm', new Date());
      const profWorkEndTime = parse(`${format(data.appointmentDate, 'yyyy-MM-dd')} ${availability.endTime}`, 'yyyy-MM-dd HH:mm', new Date());

      if (!isWithinInterval(appointmentDateTimeObject, { start: profWorkStartTime, end: dateFnsAddMinutes(profWorkEndTime, -(totalDuration -1)) })) {
         console.log(`[data.ts] addAppointment: Prof ${prof.id} work hours (${availability.startTime}-${availability.endTime}) do not fully cover proposed slot ${format(appointmentDateTimeObject, 'HH:mm')} - ${format(appointmentEndTime, 'HH:mm')}.`);
        continue;
      }

      // Filter for existing appointments for THIS professional on THIS day
      const existingAppointmentsForThisProfAndDay = existingAppointmentsForDay.filter(
        (appt) => appt.professionalId === prof.id
      );

      const isOverlappingWithExisting = existingAppointmentsForThisProfAndDay.some(existingAppt => {
        if (existingAppt.isTravelBlock && existingAppt.locationId !== data.locationId) { // If it's a travel block to another location, it means the prof is busy
           console.log(`[data.ts] addAppointment: Prof ${prof.id} has travel block to ${existingAppt.locationId} at ${existingAppt.appointmentDateTime}.`);
           return true; // Consider busy
        }
        if (existingAppt.isTravelBlock && existingAppt.locationId === data.locationId) { // If it's travel block TO this location, it's fine for now
           return false;
        }
        const existingStart = parseISO(existingAppt.appointmentDateTime);
        const existingEnd = dateFnsAddMinutes(existingStart, existingAppt.totalCalculatedDurationMinutes || existingAppt.durationMinutes);
        const overlap = areIntervalsOverlapping({ start: appointmentDateTimeObject, end: appointmentEndTime }, { start: existingStart, end: existingEnd });
        if(overlap) console.log(`[data.ts] addAppointment: Prof ${prof.id} has overlapping appointment ${existingAppt.id} from ${format(existingStart, 'HH:mm')} to ${format(existingEnd, 'HH:mm')}.`);
        return overlap;
      });

      if (!isOverlappingWithExisting) {
        actualProfessionalId = prof.id;
        if (data.searchExternal && prof.locationId !== data.locationId) {
          isExternal = true;
          externalOrigin = prof.locationId;
          console.log(`[data.ts] addAppointment: Auto-assigned external prof ${prof.id} from ${prof.locationId} to sede ${data.locationId}`);
          
          // Create travel block
          const travelDuration = 60; // Assume 1 hour travel time
          travelBlockAppointment = {
            patientId: `travel-block-${prof.id}-${formatISO(appointmentDateTimeObject, {representation: 'date'})}`,
            locationId: data.locationId, // Destination of travel is the appointment's location
            professionalId: prof.id,
            serviceId: 'travel', // Special serviceId for travel
            appointmentDateTime: formatISO(dateFnsAddMinutes(appointmentDateTimeObject, -travelDuration)),
            durationMinutes: travelDuration,
            totalCalculatedDurationMinutes: travelDuration,
            status: APPOINTMENT_STATUS.BOOKED, 
            isTravelBlock: true,
            bookingObservations: `Bloqueo por traslado a ${LOCATIONS.find(l=>l.id === data.locationId)?.name || 'sede'} desde ${LOCATIONS.find(l=>l.id === externalOrigin)?.name || 'origen'}`,
            createdAt: formatISO(new Date()),
            updatedAt: formatISO(new Date()),
            isExternalProfessional: false, // The travel block itself isn't "external" in the same way
            externalProfessionalOriginLocationId: null, // Travel block is for the prof at their origin or destination
          };

        } else {
          console.log(`[data.ts] addAppointment: Auto-assigned local prof ${prof.id} to sede ${data.locationId}`);
        }
        break; 
      } else if (!data.preferredProfessionalId) { // Log only if auto-assign failed for this prof
        console.log(`[data.ts] addAppointment: Prof ${prof.id} is busy (overlapping appointment or travel block).`);
      }
    }
     if (!actualProfessionalId) {
        console.warn(`[data.ts] addAppointment: No professional available for auto-assignment for the selected slot and service.`);
    }
  } else {
     const preferredProf = (await getProfessionals()).find(p => p.id === actualProfessionalId); // Fetch all and find
     if (preferredProf && preferredProf.locationId !== data.locationId) {
         isExternal = true;
         externalOrigin = preferredProf.locationId;
         console.log(`[data.ts] addAppointment: Preferred prof ${actualProfessionalId} is external from ${externalOrigin}. Creating travel block.`);
          const travelDuration = 60; 
          travelBlockAppointment = {
            patientId: `travel-block-${preferredProf.id}-${formatISO(appointmentDateTimeObject, {representation: 'date'})}`,
            locationId: data.locationId, 
            professionalId: preferredProf.id,
            serviceId: 'travel', 
            appointmentDateTime: formatISO(dateFnsAddMinutes(appointmentDateTimeObject, -travelDuration)),
            durationMinutes: travelDuration,
            totalCalculatedDurationMinutes: travelDuration,
            status: APPOINTMENT_STATUS.BOOKED, 
            isTravelBlock: true,
            bookingObservations: `Bloqueo por traslado a ${LOCATIONS.find(l=>l.id === data.locationId)?.name || 'sede'} desde ${LOCATIONS.find(l=>l.id === externalOrigin)?.name || 'origen'}`,
            createdAt: formatISO(new Date()),
            updatedAt: formatISO(new Date()),
            isExternalProfessional: false,
            externalProfessionalOriginLocationId: null,
          };
     }
  }

  const newAppointmentData: Omit<Appointment, 'id'> = {
    patientId: patientIdToUse!,
    locationId: data.locationId,
    professionalId: actualProfessionalId || null,
    serviceId: data.serviceId,
    appointmentDateTime,
    durationMinutes: mainServiceDuration,
    totalCalculatedDurationMinutes: totalDuration,
    status: APPOINTMENT_STATUS.BOOKED,
    bookingObservations: data.bookingObservations || null,
    createdAt: formatISO(new Date()),
    updatedAt: formatISO(new Date()),
    isExternalProfessional: isExternal,
    externalProfessionalOriginLocationId: externalOrigin,
    addedServices: data.addedServices?.map(as => ({
        serviceId: as.serviceId!, 
        professionalId: as.professionalId === '_no_selection_placeholder_' ? null : (as.professionalId || null),
        price: as.price ?? null,
    })) || [],
  };


  if (!firestore) throw new Error("Firestore not initialized");
  
  const batch = writeBatch(firestore);

  const firestoreAppointmentData = {
      ...newAppointmentData,
      appointmentDateTime: toFirestoreTimestamp(newAppointmentData.appointmentDateTime),
      createdAt: toFirestoreTimestamp(newAppointmentData.createdAt),
      updatedAt: toFirestoreTimestamp(newAppointmentData.updatedAt),
  };
  const newApptDocRef = doc(collection(firestore, 'citas')); // Create new doc ref for appt
  batch.set(newApptDocRef, firestoreAppointmentData);
  console.log("[data.ts] addAppointment (Firestore): New appointment prepared for batch:", newApptDocRef.id);

  if (travelBlockAppointment) {
    const firestoreTravelBlockData = {
        ...travelBlockAppointment,
        appointmentDateTime: toFirestoreTimestamp(travelBlockAppointment.appointmentDateTime),
        createdAt: toFirestoreTimestamp(travelBlockAppointment.createdAt),
        updatedAt: toFirestoreTimestamp(travelBlockAppointment.updatedAt),
    };
    const newTravelBlockDocRef = doc(collection(firestore, 'citas')); // Create new doc ref for travel block
    batch.set(newTravelBlockDocRef, firestoreTravelBlockData);
    console.log("[data.ts] addAppointment (Firestore): New travel block prepared for batch:", newTravelBlockDocRef.id);
  }
  
  await batch.commit();
  console.log("[data.ts] addAppointment (Firestore): Batch committed successfully.");

  return { id: newApptDocRef.id, ...newAppointmentData }; 
}

export async function updateAppointment (id: string, data: Partial<AppointmentUpdateFormData>): Promise<Appointment | undefined> {
  console.log(`[data.ts] updateAppointment.  ID: ${id}. Data:`, data);
  
  let appointmentToUpdate: Partial<Omit<Appointment, 'id' | 'createdAt'>> = {};
  let originalAppointment: Appointment | undefined;

   if (firestore) {
    const docSnap = await getDoc(doc(firestore, 'citas', id));
    if (docSnap.exists()) {
      originalAppointment = {id: docSnap.id, ...convertDocumentData(docSnap.data())} as Appointment;
    }
  }
  if (!originalAppointment) {
    console.warn(`[data.ts] updateAppointment: Appointment with ID ${id} not found.`);
    return undefined;
  }


  if (data.status) appointmentToUpdate.status = data.status;
  if (data.serviceId) appointmentToUpdate.serviceId = data.serviceId;
  
  const serviceForDuration =

 (await getServices()).find(s => s.id === (data.serviceId || originalAppointment.serviceId));

  const mainServiceDuration = data.durationMinutes ?? serviceForDuration?.defaultDuration ?? originalAppointment.durationMinutes ?? 60;
  appointmentToUpdate.durationMinutes = mainServiceDuration;


  if (data.appointmentDate && data.appointmentTime) {
    const [hours, minutes] = data.appointmentTime.split(':').map(Number);
    const newDateTime = setMinutes(setHours(startOfDay(data.appointmentDate), hours), minutes);
    appointmentToUpdate.appointmentDateTime = formatISO(newDateTime);
  } else if (data.appointmentDate) { 
    const existingTime = getHours(parseISO(originalAppointment.appointmentDateTime)) + ":" + getMinutes(parseISO(originalAppointment.appointmentDateTime));
    const [hours, minutes] = existingTime.split(':').map(Number);
    const newDateTime = setMinutes(setHours(startOfDay(data.appointmentDate), hours), minutes);
    appointmentToUpdate.appointmentDateTime = formatISO(newDateTime);
  } else if (data.appointmentTime) { 
    const existingDate = parseISO(originalAppointment.appointmentDateTime);
    const [hours, minutes] = data.appointmentTime.split(':').map(Number);
    const newDateTime = setMinutes(setHours(existingDate, hours), minutes);
    appointmentToUpdate.appointmentDateTime = formatISO(setMinutes(setHours(existingDate, hours), minutes));
  }


  if (data.hasOwnProperty('actualArrivalTime')) appointmentToUpdate.actualArrivalTime = data.actualArrivalTime || null;
  if (data.hasOwnProperty('professionalId')) appointmentToUpdate.professionalId = data.professionalId === '_no_selection_placeholder_' ? null : (data.professionalId || null);
  
  if (data.hasOwnProperty('paymentMethod')) appointmentToUpdate.paymentMethod = data.paymentMethod || null;
  if (data.hasOwnProperty('amountPaid')) appointmentToUpdate.amountPaid = data.amountPaid === undefined ? null : data.amountPaid;
  if (data.hasOwnProperty('staffNotes')) appointmentToUpdate.staffNotes = data.staffNotes || null;
  if (data.hasOwnProperty('attachedPhotos')) appointmentToUpdate.attachedPhotos = data.attachedPhotos || [];
  
  if (data.hasOwnProperty('addedServices')) {
    appointmentToUpdate.addedServices = (data.addedServices || []).map((as: { serviceId: any; professionalId: string; price: any; }) => ({
      serviceId: as.serviceId!,
      professionalId: as.professionalId === '_no_selection_placeholder_' ? null : (as.professionalId || null),
      price: as.price ?? null,
    }));
  }

  if (data.serviceId || data.hasOwnProperty('addedServices') || data.hasOwnProperty('durationMinutes')) {
    let totalDuration = appointmentToUpdate.durationMinutes || mainServiceDuration; 
    const allServicesList = await getServices();
    
    const servicesToSum = appointmentToUpdate.addedServices || originalAppointment.addedServices || [];

    servicesToSum.forEach(as => {
      const addedSvc = allServicesList.find(s => s.id === as.serviceId);
      if (addedSvc) {
        totalDuration += addedSvc.defaultDuration;
      }
    });
    appointmentToUpdate.totalCalculatedDurationMinutes = totalDuration;
  }


  appointmentToUpdate.updatedAt = formatISO(new Date());


  if (!firestore) throw new Error("Firestore not initialized");
  
  const docRef = doc(firestore, 'citas', id);
  const firestoreUpdateData = { ...appointmentToUpdate } as any; 
  if (firestoreUpdateData.appointmentDateTime) firestoreUpdateData.appointmentDateTime = toFirestoreTimestamp(firestoreUpdateData.appointmentDateTime);
  if (firestoreUpdateData.updatedAt) firestoreUpdateData.updatedAt = toFirestoreTimestamp(firestoreUpdateData.updatedAt);
  
  Object.keys(firestoreUpdateData).forEach(key => {
    if (firestoreUpdateData[key] === undefined) {
      firestoreUpdateData[key] = null; 
    }
  });
  
  await updateDoc(docRef, firestoreUpdateData);
  console.log("[data.ts] updateAppointment (Firestore): Appointment updated:", id);
  
  const updatedDoc = await getDoc(docRef);
  if(updatedDoc.exists()){
      let populatedUpdatedAppt = {id: updatedDoc.id, ...convertDocumentData(updatedDoc.data())} as Appointment;
      // Repopulate service, patient, professional etc. for the return value
      const allServices = await getServices();
      const allProfessionals = await getProfessionals();
      if (populatedUpdatedAppt.patientId) populatedUpdatedAppt.patient = await getPatientById(populatedUpdatedAppt.patientId);
      if (populatedUpdatedAppt.professionalId) populatedUpdatedAppt.professional = allProfessionals.find(p => p.id === populatedUpdatedAppt.professionalId);
      populatedUpdatedAppt.service = allServices.find(s => s.id === populatedUpdatedAppt.serviceId);
      if (populatedUpdatedAppt.addedServices && populatedUpdatedAppt.addedServices.length > 0) {
          populatedUpdatedAppt.addedServices = populatedUpdatedAppt.addedServices.map(as => {
              const serviceDetail = allServices.find(s => s.id === as.serviceId);
              const profDetail = as.professionalId ? allProfessionals.find(p => p.id === as.professionalId) : undefined;
              return {...as, service: serviceDetail ? {...serviceDetail}: undefined, professional: profDetail ? {...profDetail} : undefined };
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
    const docRef = doc(firestore, 'citas', appointmentId);
    await deleteDoc(docRef);
    console.log(`[data.ts] deleteAppointment (Firestore): Appointment ${appointmentId} deleted successfully.`);
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
export function getProfessionalAvailabilityForDate(
  professional: Professional,
  targetDate: Date
): { startTime: string; endTime: string; isWorking: boolean; reason?: string, notes?: string } | null {
  const contractStatus = getContractDisplayStatus(professional.currentContract, targetDate);

  if (contractStatus !== 'Activo' && contractStatus !== 'Próximo a Vencer') {
    // console.log(`[Availability] Prof ${professional.id} - Contract not active or near expiry on ${formatISO(targetDate)}. Status: ${contractStatus}. Not available.`);
    return { startTime: '', endTime: '', isWorking: false, reason: `Contrato: ${contractStatus}` };
  }

  const targetDateISO = formatISO(targetDate, { representation: 'date' });
  const customOverride = professional.customScheduleOverrides?.find(
    (override) => override.date === targetDateISO
  );

  if (customOverride) {
    // console.log(`[Availability] Prof ${professional.id} - Found custom override for ${targetDateISO}:`, customOverride);
    if (!customOverride.isWorking) {
      return { startTime: '', endTime: '', isWorking: false, reason: `Descansando (Anulación: ${customOverride.notes || 'Sin especificar'})`, notes: customOverride.notes || undefined };
    }
    if (customOverride.startTime && customOverride.endTime) {
      return {
        startTime: customOverride.startTime,
        endTime: customOverride.endTime,
        isWorking: true,
        reason: `Horario Especial (Anulación: ${customOverride.notes || 'Sin especificar'})`,
        notes: customOverride.notes || undefined
      };
    }
  }

  const dayOfWeekIndex = getDay(targetDate); 
  const dayOfWeekId = DAYS_OF_WEEK[(dayOfWeekIndex + 6) % 7].id as DayOfWeekId; 
  
  const baseSchedule = professional.workSchedule?.[dayOfWeekId];
  // console.log(`[Availability] Prof ${professional.id} - Base schedule for ${dayOfWeekId} (${format(targetDate, 'EEEE', {locale: es})}):`, baseSchedule);

  if (baseSchedule && baseSchedule.isWorking && baseSchedule.startTime && baseSchedule.endTime) {
    return {
      startTime: baseSchedule.startTime,
      endTime: baseSchedule.endTime,
      isWorking: true,
      reason: "Horario base",
    };
  }
  // console.log(`[Availability] Prof ${professional.id} - Not working based on base schedule or missing start/end times for ${dayOfWeekId} on ${targetDateISO}.`);
  return { startTime: '', endTime: '', isWorking: false, reason: `Descansando (Horario base: ${format(targetDate, 'EEEE', {locale: es})} libre)` };
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
