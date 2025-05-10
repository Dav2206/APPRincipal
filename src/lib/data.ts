import type { User, Professional, Patient, Service, Appointment, AppointmentFormData, ProfessionalFormData } from '@/types';
import { LOCATIONS, USER_ROLES, SERVICES, PROFESSIONAL_SPECIALIZATIONS, APPOINTMENT_STATUS, LocationId, ServiceId } from './constants';
import { formatISO, parseISO, addDays, setHours, setMinutes, startOfDay, addMinutes } from 'date-fns';

let users: User[] = [
  { id: 'admin001', username: 'Admin', password: 'admin', role: USER_ROLES.ADMIN, name: 'Administrator' },
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
  { id: 'pat001', firstName: 'Ana', lastName: 'García', phone: '111222333', email: 'ana.garcia@example.com', preferredProfessionalId: professionals[0].id, notes: 'Paciente regular, prefiere citas por la mañana.', dateOfBirth: '1985-05-15' },
  { id: 'pat002', firstName: 'Luis', lastName: 'Martínez', phone: '444555666', email: 'luis.martinez@example.com', notes: 'Primera visita.', dateOfBirth: '1992-11-20' },
  { id: 'pat003', firstName: 'Sofía', lastName: 'Rodríguez', phone: '777888999', email: 'sofia.rodriguez@example.com', preferredProfessionalId: professionals[2].id, dateOfBirth: '1978-02-10' },
  { id: 'pat004', firstName: 'Carlos', lastName: 'López', phone: '123123123', email: 'carlos.lopez@example.com', notes: 'Suele llegar 5 minutos tarde.', dateOfBirth: '2000-07-30' },
  { id: 'pat005', firstName: 'Elena', lastName: 'Pérez', phone: '456456456', email: 'elena.perez@example.com', dateOfBirth: '1995-09-05' },
];

const mockServices: Service[] = SERVICES.map(s => ({
    ...s,
    price: Math.floor(Math.random() * 50) + 50, // Random price between 50-100
}));


let appointments: Appointment[] = [];
const today = new Date();
const numDays = 5; // Generate appointments for a few days around today

for (let dayOffset = -Math.floor(numDays / 2); dayOffset <= Math.floor(numDays / 2); dayOffset++) {
  const currentDate = addDays(startOfDay(today), dayOffset);
  LOCATIONS.forEach(location => {
    const locationProfessionals = professionals.filter(p => p.locationId === location.id);
    if (locationProfessionals.length === 0) return;

    const appointmentsPerDay = Math.floor(Math.random() * 15) + 5; // 5 to 20 appts per day/location for demo
    for (let i = 0; i < appointmentsPerDay; i++) {
      const randomPatient = patients[Math.floor(Math.random() * patients.length)];
      const randomService = mockServices[Math.floor(Math.random() * mockServices.length)];
      const randomProfessional = locationProfessionals[Math.floor(Math.random() * locationProfessionals.length)];
      
      const hour = 8 + Math.floor(Math.random() * 10); // 8 AM to 5 PM
      const minute = Math.random() > 0.5 ? 30 : 0;
      const appointmentDateTime = setMinutes(setHours(currentDate, hour), minute);
      
      const statusKeys = Object.values(APPOINTMENT_STATUS);
      const randomStatus = statusKeys[Math.floor(Math.random() * statusKeys.length)];

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
        createdAt: formatISO(new Date()),
        updatedAt: formatISO(new Date()),
        ...(randomStatus === APPOINTMENT_STATUS.COMPLETED && {
            actualArrivalTime: `${String(hour).padStart(2, '0')}:${String(minute + Math.floor(Math.random()*10-5)).padStart(2, '0')}`, // slight variation
            amountPaid: randomService.price,
            paymentMethod: 'Efectivo',
            addedServices: Math.random() > 0.8 ? [{ serviceId: mockServices[1].id, professionalId: locationProfessionals[0].id, price: mockServices[1].price }] : undefined,
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
    biWeeklyEarnings: 0, // Initialize earnings
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
  return patients;
};

export const getPatientById = async (id: string): Promise<Patient | undefined> => {
  return patients.find(p => p.id === id);
};

export const findPatient = async (firstName: string, lastName: string): Promise<Patient | undefined> => {
  return patients.find(p => p.firstName.toLowerCase() === firstName.toLowerCase() && p.lastName.toLowerCase() === lastName.toLowerCase());
}

export const addPatient = async (data: Omit<Patient, 'id'>): Promise<Patient> => {
  const newPatient: Patient = {
    ...data,
    id: `pat-${Date.now()}`,
  };
  patients.push(newPatient);
  return newPatient;
}

// --- Services ---
export const getServices = async (): Promise<Service[]> => {
  return mockServices;
};

export const getServiceById = async (id: ServiceId): Promise<Service | undefined> => {
  return mockServices.find(s => s.id === id);
}

// --- Appointments ---
export const getAppointments = async (filters: { locationId?: LocationId, date?: Date, patientId?: string, professionalId?: string }): Promise<Appointment[]> => {
  let filteredAppointments = [...appointments];

  if (filters.locationId) {
    filteredAppointments = filteredAppointments.filter(a => a.locationId === filters.locationId);
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
  
  // Populate related data
  return filteredAppointments.map(appt => ({
    ...appt,
    patient: patients.find(p => p.id === appt.patientId),
    professional: professionals.find(p => p.id === appt.professionalId),
    service: mockServices.find(s => s.id === appt.serviceId),
    // Ensure addedServices are mapped with their details if necessary (e.g. service name) - for now, direct pass-through
    addedServices: appt.addedServices?.map(as => ({
      ...as,
      service: mockServices.find(s => s.id === as.serviceId),
      professional: professionals.find(p => p.id === as.professionalId)
    })) || undefined
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
    })) || undefined
  };
};

export const addAppointment = async (data: AppointmentFormData): Promise<Appointment> => {
  let patientId = data.existingPatientId;
  if (!patientId) {
    let existingPatient = await findPatient(data.patientFirstName, data.patientLastName);
    if (existingPatient) {
      patientId = existingPatient.id;
    } else {
      const newPatient = await addPatient({
        firstName: data.patientFirstName,
        lastName: data.patientLastName,
        phone: data.patientPhone,
        email: data.patientEmail,
      });
      patientId = newPatient.id;
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
    preferredProfessionalId: data.preferredProfessionalId || undefined,
    bookingObservations: data.bookingObservations,
    status: APPOINTMENT_STATUS.BOOKED,
    // addedServices is not part of initial booking form
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
  
  // Ensure professionalId in addedServices is handled if it's a placeholder or empty string
  const processedData = {
    ...data,
    addedServices: data.addedServices?.map(as => ({
      ...as,
      professionalId: as.professionalId === "NO_SELECTION_PLACEHOLDER" || as.professionalId === "" ? null : as.professionalId
    }))
  };
  
  appointments[index] = { 
    ...appointments[index], 
    ...processedData, // Use processedData
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
    })) || undefined
  };
};

// Patient History specific functions
export const getPatientAppointmentHistory = async (patientId: string): Promise<Appointment[]> => {
  return (await getAppointments({ patientId }))
    .filter(a => a.status === APPOINTMENT_STATUS.COMPLETED || a.status === APPOINTMENT_STATUS.NO_SHOW || a.status === APPOINTMENT_STATUS.CANCELLED_CLIENT || a.status === APPOINTMENT_STATUS.CANCELLED_STAFF)
    .sort((a,b) => parseISO(b.appointmentDateTime).getTime() - parseISO(a.appointmentDateTime).getTime());
};
