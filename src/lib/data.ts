
import type { User, Professional, Patient, Service, Appointment, AppointmentFormData, ProfessionalFormData, AppointmentStatus, ServiceFormData } from '@/types';
import { LOCATIONS, USER_ROLES, SERVICES as SERVICES_CONSTANTS, PROFESSIONAL_SPECIALIZATIONS, APPOINTMENT_STATUS, LocationId, ServiceId as ConstantServiceId, APPOINTMENT_STATUS_DISPLAY, PAYMENT_METHODS } from './constants';
import { formatISO, parseISO, addDays, setHours, setMinutes, startOfDay, endOfDay, addMinutes } from 'date-fns';

let users: User[] = [
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

let professionals: Professional[] = [];
LOCATIONS.forEach((location, locIndex) => {
  for (let i = 1; i <= 5; i++) {
    professionals.push({
      id: `prof-${location.id}-${i}`,
      firstName: `Profesional ${i}`,
      lastName: location.name.split(' ')[0],
      locationId: location.id,
      specializations: [PROFESSIONAL_SPECIALIZATIONS[i % PROFESSIONAL_SPECIALIZATIONS.length]],
      email: `prof${i}.${location.id}@example.com`,
      phone: `9876543${locIndex}${i}`,
      biWeeklyEarnings: Math.floor(Math.random() * 2000) + 500,
    });
  }
});

let patients: Patient[] = [
  { id: 'pat001', firstName: 'Ana', lastName: 'García', phone: '111222333', email: 'ana.garcia@example.com', preferredProfessionalId: professionals[0].id, notes: 'Paciente regular, prefiere citas por la mañana.', dateOfBirth: '1985-05-15', isDiabetic: false },
  { id: 'pat002', firstName: 'Luis', lastName: 'Martínez', phone: '444555666', email: 'luis.martinez@example.com', notes: 'Primera visita.', dateOfBirth: '1992-11-20', isDiabetic: true },
  { id: 'pat003', firstName: 'Sofía', lastName: 'Rodríguez', phone: '777888999', email: 'sofia.rodriguez@example.com', preferredProfessionalId: professionals[2].id, dateOfBirth: '1978-02-10', isDiabetic: false },
  { id: 'pat004', firstName: 'Carlos', lastName: 'López', phone: '123123123', email: 'carlos.lopez@example.com', notes: 'Suele llegar 5 minutos tarde.', dateOfBirth: '2000-07-30', isDiabetic: true },
  { id: 'pat005', firstName: 'Elena', lastName: 'Pérez', phone: '456456456', email: 'elena.perez@example.com', dateOfBirth: '1995-09-05', isDiabetic: false },
  { id: 'pat006', firstName: 'Jorge', lastName: 'Sanchez', phone: '101010101', email: 'jorge.sanchez@example.com', dateOfBirth: '1988-03-22', notes: 'Alergico al latex.', isDiabetic: false },
  { id: 'pat007', firstName: 'Laura', lastName: 'Gomez', phone: '202020202', email: 'laura.gomez@example.com', dateOfBirth: '1999-12-01', preferredProfessionalId: professionals[1].id, isDiabetic: true },
];

// Initialize mockServices from SERVICES_CONSTANTS, making it the mutable source of truth
let mockServices: Service[] = SERVICES_CONSTANTS.map(s_const => ({
    id: s_const.id, // Keep original ID from constants
    name: s_const.name,
    defaultDuration: s_const.defaultDuration,
    price: Math.floor(Math.random() * 50) + 50, // Random price between 50-100 for default services
}));


let appointments: Appointment[] = [];
const today = new Date();
const numDays = 30; 

const placeholderPhotoDataUri = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";


for (let dayOffset = -Math.floor(numDays / 2); dayOffset <= Math.floor(numDays / 2); dayOffset++) {
  const currentDate = addDays(startOfDay(today), dayOffset);
  LOCATIONS.forEach(location => {
    const locationProfessionals = professionals.filter(p => p.locationId === location.id);
    if (locationProfessionals.length === 0) return;

    const appointmentsPerDay = Math.floor(Math.random() * 10) + 3; 
    for (let i = 0; i < appointmentsPerDay; i++) {
      const randomPatient = patients[Math.floor(Math.random() * patients.length)];
      const randomService = mockServices[Math.floor(Math.random() * mockServices.length)];
      const randomProfessional = locationProfessionals[Math.floor(Math.random() * locationProfessionals.length)];
      
      const hour = 8 + Math.floor(Math.random() * 10); 
      const minute = Math.random() > 0.5 ? 30 : 0;
      const appointmentDateTime = setMinutes(setHours(currentDate, hour), minute);
      
      const statusKeys = Object.values(APPOINTMENT_STATUS);
      let randomStatus = statusKeys[Math.floor(Math.random() * statusKeys.length)];

      if (randomStatus === APPOINTMENT_STATUS.COMPLETED && appointmentDateTime > today) {
        randomStatus = APPOINTMENT_STATUS.BOOKED;
      }
      if (randomStatus === APPOINTMENT_STATUS.BOOKED && appointmentDateTime < startOfDay(today)) {
         randomStatus = APPOINTMENT_STATUS.COMPLETED; 
      }

      const addedServiceExample = mockServices.length > 1 ? mockServices[1] : undefined;

      appointments.push({
        id: `appt-${location.id}-${dayOffset}-${i}`,
        patientId: randomPatient.id,
        locationId: location.id,
        professionalId: randomProfessional.id,
        serviceId: randomService.id,
        appointmentDateTime: formatISO(appointmentDateTime),
        durationMinutes: randomService.defaultDuration,
        status: randomStatus,
        bookingObservations: Math.random() > 0.7 ? 'Requiere atención especial.' : undefined,
        attachedPhotos: Math.random() > 0.85 ? [placeholderPhotoDataUri] : [],
        createdAt: formatISO(new Date()),
        updatedAt: formatISO(new Date()),
        ...(randomStatus === APPOINTMENT_STATUS.COMPLETED && {
            actualArrivalTime: `${String(hour).padStart(2, '0')}:${String(minute + Math.floor(Math.random()*10-5)).padStart(2, '0')}`, 
            amountPaid: (randomService.price || 0) + (Math.random() > 0.5 && addedServiceExample ? (addedServiceExample.price || 0) : 0),
            paymentMethod: PAYMENT_METHODS[Math.floor(Math.random() * PAYMENT_METHODS.length)],
            addedServices: Math.random() > 0.8 && addedServiceExample ? [{ serviceId: addedServiceExample.id, professionalId: locationProfessionals[0].id, price: addedServiceExample.price }] : undefined,
        })
      });
    }
  });
}

// --- Auth ---
export const getUserByUsername = async (username: string): Promise<User | undefined> => {
  return users.find(user => user.username.toLowerCase() === username.toLowerCase());
};

// --- Locations ---
export const getLocations = async (): Promise<typeof LOCATIONS> => {
  return LOCATIONS;
};

// --- Professionals ---
export const getProfessionals = async (locationId?: LocationId): Promise<Professional[]> => {
  if (locationId) {
    return professionals.filter(p => p.locationId === locationId);
  }
  return professionals;
};

export const getProfessionalById = async (id: string): Promise<Professional | undefined> => {
  return professionals.find(p => p.id === id);
};

export const addProfessional = async (data: Omit<ProfessionalFormData, 'id'>): Promise<Professional> => {
  const newProfessional: Professional = {
    ...data,
    id: `prof-${Date.now()}`,
    biWeeklyEarnings: 0, 
  };
  professionals.push(newProfessional);
  return newProfessional;
};

export const updateProfessional = async (id: string, data: Partial<ProfessionalFormData>): Promise<Professional | undefined> => {
  const index = professionals.findIndex(p => p.id === id);
  if (index === -1) return undefined;
  professionals[index] = { ...professionals[index], ...data };
  return professionals[index];
};


// --- Patients ---
export const getPatients = async (): Promise<Patient[]> => {
  return JSON.parse(JSON.stringify(patients)); // Deep copy
};

export const getPatientById = async (id: string): Promise<Patient | undefined> => {
  const patient = patients.find(p => p.id === id);
  return patient ? JSON.parse(JSON.stringify(patient)) : undefined;
};

export const findPatient = async (firstName: string, lastName: string): Promise<Patient | undefined> => {
  const patient = patients.find(p => p.firstName.toLowerCase() === firstName.toLowerCase() && p.lastName.toLowerCase() === lastName.toLowerCase());
  return patient ? JSON.parse(JSON.stringify(patient)) : undefined;
}

export const addPatient = async (data: Omit<Patient, 'id'>): Promise<Patient> => {
  const newPatient: Patient = {
    ...data,
    id: `pat-${Date.now()}`,
    isDiabetic: data.isDiabetic || false,
  };
  patients.push(newPatient);
  return JSON.parse(JSON.stringify(newPatient));
}

// --- Services ---
export const getServices = async (): Promise<Service[]> => {
  // Return a deep copy to prevent direct modification of the mockServices array from outside
  return JSON.parse(JSON.stringify(mockServices));
};

export const getServiceById = async (id: string): Promise<Service | undefined> => {
  const service = mockServices.find(s => s.id === id);
  return service ? JSON.parse(JSON.stringify(service)) : undefined;
}

// Function to generate a slug from a string
const slugify = (text: string): string => {
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')           // Replace spaces with -
    .replace(/[^\w-]+/g, '')       // Remove all non-word chars
    .replace(/--+/g, '-');          // Replace multiple - with single -
};

export const addService = async (data: ServiceFormData): Promise<Service> => {
  let id = data.id;
  if (!id) {
    let slug = slugify(data.name);
    // Ensure ID is unique
    if (mockServices.some(s => s.id === slug)) {
      slug = `${slug}-${Date.now()}`;
    }
    id = slug;
  }
  
  const newService: Service = {
    id,
    name: data.name,
    defaultDuration: data.defaultDuration,
    price: data.price,
  };
  mockServices.push(newService);
  return JSON.parse(JSON.stringify(newService));
};

export const updateService = async (id: string, data: Partial<ServiceFormData>): Promise<Service | undefined> => {
  const index = mockServices.findIndex(s => s.id === id);
  if (index === -1) return undefined;
  
  // If name is being updated, and it's a slug-based ID that might change, handle ID regeneration or disallow ID change.
  // For simplicity, we assume ID doesn't change during update here.
  // If the original ID was a slug of the old name, and the name changes, the ID might become out of sync.
  // This could be handled by ensuring IDs are immutable or by more complex logic if IDs should reflect names.
  
  mockServices[index] = { ...mockServices[index], ...data };
  return JSON.parse(JSON.stringify(mockServices[index]));
};


// --- Appointments ---
export const getAppointments = async (filters: { 
  locationId?: LocationId | LocationId[] | undefined; 
  date?: Date, 
  dateRange?: { start: Date; end: Date };
  status?: AppointmentStatus | AppointmentStatus[];
  patientId?: string, 
  professionalId?: string 
}): Promise<Appointment[]> => {
  let filteredAppointments = [...appointments];

  if (filters.locationId) {
    const locationsToFilter = Array.isArray(filters.locationId) ? filters.locationId : [filters.locationId];
    if (locationsToFilter.length > 0) { 
        filteredAppointments = filteredAppointments.filter(a => locationsToFilter.includes(a.locationId));
    }
  }
  if (filters.patientId) {
    filteredAppointments = filteredAppointments.filter(a => a.patientId === filters.patientId);
  }
  if (filters.professionalId) {
    filteredAppointments = filteredAppointments.filter(a => a.professionalId === filters.professionalId);
  }
  if (filters.date) {
    const filterDateString = formatISO(startOfDay(filters.date), { representation: 'date' });
    filteredAppointments = filteredAppointments.filter(a => formatISO(parseISO(a.appointmentDateTime), { representation: 'date' }) === filterDateString);
  }
  if (filters.dateRange) {
    const rangeStart = startOfDay(filters.dateRange.start);
    const rangeEnd = endOfDay(filters.dateRange.end);
    filteredAppointments = filteredAppointments.filter(a => {
      const apptDate = parseISO(a.appointmentDateTime);
      return apptDate >= rangeStart && apptDate <= rangeEnd;
    });
  }
  if (filters.status) {
    const statusesToFilter = Array.isArray(filters.status) ? filters.status : [filters.status];
    filteredAppointments = filteredAppointments.filter(a => statusesToFilter.includes(a.status));
  }
  
  return filteredAppointments.map(appt => ({
    ...appt,
    patient: patients.find(p => p.id === appt.patientId),
    professional: professionals.find(p => p.id === appt.professionalId),
    service: mockServices.find(s => s.id === appt.serviceId),
    addedServices: appt.addedServices?.map(as => ({
      ...as,
      service: mockServices.find(s => s.id === as.serviceId),
      professional: professionals.find(p => p.id === as.professionalId)
    })) || undefined,
    attachedPhotos: appt.attachedPhotos || [], 
  })).sort((a, b) => parseISO(a.appointmentDateTime).getTime() - parseISO(b.appointmentDateTime).getTime());
};

export const getAppointmentById = async (id: string): Promise<Appointment | undefined> => {
  const appt = appointments.find(a => a.id === id);
  if (!appt) return undefined;
  return {
    ...appt,
    patient: patients.find(p => p.id === appt.patientId),
    professional: professionals.find(p => p.id === appt.professionalId),
    service: mockServices.find(s => s.id === appt.serviceId),
    addedServices: appt.addedServices?.map(as => ({
      ...as,
      service: mockServices.find(s => s.id === as.serviceId),
      professional: professionals.find(p => p.id === as.professionalId)
    })) || undefined,
    attachedPhotos: appt.attachedPhotos || [], 
  };
};

export const addAppointment = async (data: AppointmentFormData): Promise<Appointment> => {
  let patientId = data.existingPatientId;
  if (!patientId) {
    let existingPatient = await findPatient(data.patientFirstName, data.patientLastName);
    if (existingPatient) {
      patientId = existingPatient.id;
      // Update existing patient's isDiabetic status if provided and different
      if (data.isDiabetic !== undefined && existingPatient.isDiabetic !== data.isDiabetic) {
        const patientIdx = patients.findIndex(p => p.id === patientId);
        if (patientIdx !== -1) {
          patients[patientIdx].isDiabetic = data.isDiabetic;
        }
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
      const existingPatientDetails = patients.find(p=>p.id === patientId);
      if(existingPatientDetails) {
          const updatedPatientInfo: Partial<Patient> = {};
          if(data.patientFirstName !== existingPatientDetails.firstName) updatedPatientInfo.firstName = data.patientFirstName;
          if(data.patientLastName !== existingPatientDetails.lastName) updatedPatientInfo.lastName = data.patientLastName;
          if(data.patientEmail !== existingPatientDetails.email) updatedPatientInfo.email = data.patientEmail;
          if(data.patientDateOfBirth && data.patientDateOfBirth !== existingPatientDetails.dateOfBirth) updatedPatientInfo.dateOfBirth = data.patientDateOfBirth;
          if (data.patientPhone && data.patientPhone !== existingPatientDetails.phone) {
             updatedPatientInfo.phone = data.patientPhone;
          }
          if (data.isDiabetic !== undefined && data.isDiabetic !== existingPatientDetails.isDiabetic) {
            updatedPatientInfo.isDiabetic = data.isDiabetic;
          }

          if(Object.keys(updatedPatientInfo).length > 0){
              const patientIdx = patients.findIndex(p => p.id === patientId);
              if(patientIdx !== -1) {
                  patients[patientIdx] = {...patients[patientIdx], ...updatedPatientInfo};
              }
          }
      }
  }

  const service = await getServiceById(data.serviceId);
  const appointmentDateTime = setMinutes(setHours(data.appointmentDate, parseInt(data.appointmentTime.split(':')[0])), parseInt(data.appointmentTime.split(':')[1]));

  const newAppointmentData: Omit<Appointment, 'id' | 'createdAt' | 'updatedAt' | 'patient' | 'professional' | 'service'> & { patientId: string } = {
    patientId: patientId!,
    locationId: data.locationId,
    serviceId: data.serviceId,
    appointmentDateTime: formatISO(appointmentDateTime),
    durationMinutes: service?.defaultDuration || 60,
    preferredProfessionalId: data.preferredProfessionalId === "_any_professional_placeholder_" ? undefined : data.preferredProfessionalId,
    bookingObservations: data.bookingObservations,
    status: APPOINTMENT_STATUS.BOOKED,
    attachedPhotos: [], 
  };
  
  const newAppointmentEntry: Appointment = {
    ...newAppointmentData,
    id: `appt-${Date.now()}`,
    createdAt: formatISO(new Date()),
    updatedAt: formatISO(new Date()),
  };

  appointments.push(newAppointmentEntry);
  return {
    ...newAppointmentEntry,
    patient: patients.find(p => p.id === newAppointmentEntry.patientId),
    service: mockServices.find(s => s.id === newAppointmentEntry.serviceId),
  };
};

export const updateAppointment = async (id: string, data: Partial<Appointment>): Promise<Appointment | undefined> => {
  const index = appointments.findIndex(a => a.id === id);
  if (index === -1) return undefined;
  
  const processedData = {
    ...data,
    addedServices: data.addedServices?.map(as => ({
      ...as,
      professionalId: as.professionalId === "NO_SELECTION_PLACEHOLDER" || as.professionalId === "" ? null : as.professionalId
    })),
    attachedPhotos: Array.isArray(data.attachedPhotos) ? data.attachedPhotos.filter(photo => photo && typeof photo === 'string' && photo.startsWith("data:image/")) : (appointments[index].attachedPhotos || []).filter(photo => photo && typeof photo === 'string' && photo.startsWith("data:image/")),
  };
  
  appointments[index] = { 
    ...appointments[index], 
    ...processedData, 
    updatedAt: formatISO(new Date()) 
  };
  
  return {
    ...appointments[index],
    patient: patients.find(p => p.id === appointments[index].patientId),
    professional: professionals.find(p => p.id === appointments[index].professionalId),
    service: mockServices.find(s => s.id === appointments[index].serviceId),
    addedServices: appointments[index].addedServices?.map(as => ({
      ...as,
      service: mockServices.find(s => s.id === as.serviceId),
      professional: professionals.find(p => p.id === as.professionalId)
    })) || undefined,
    attachedPhotos: appointments[index].attachedPhotos || [],
  };
};

export const getPatientAppointmentHistory = async (patientId: string): Promise<Appointment[]> => {
  return (await getAppointments({ patientId }))
    .filter(a => a.status === APPOINTMENT_STATUS.COMPLETED || a.status === APPOINTMENT_STATUS.NO_SHOW || a.status === APPOINTMENT_STATUS.CANCELLED_CLIENT || a.status === APPOINTMENT_STATUS.CANCELLED_STAFF)
    .sort((a,b) => parseISO(b.appointmentDateTime).getTime() - parseISO(a.appointmentDateTime).getTime());
};

