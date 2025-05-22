
"use client";

import React, { useState, useEffect, useMemo } from 'react';
import { useForm, Controller, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { AppointmentFormSchema, type AppointmentFormData as FormSchemaType } from '@/lib/schemas';
import type { LocationId } from '@/lib/constants';
import type { Professional, Patient, Service, Appointment } from '@/types';
import { useAuth } from '@/contexts/auth-provider';
import { useAppState } from '@/contexts/app-state-provider';
import { USER_ROLES, LOCATIONS, TIME_SLOTS, APPOINTMENT_STATUS } from '@/lib/constants';
import { getServices, addAppointment, getPatientById, getProfessionalAvailabilityForDate, getAppointments } from '@/lib/data';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { CalendarIcon, ClockIcon, UserPlus, Building, Briefcase, ConciergeBell, Edit3, Loader2, UserRound, AlertCircle, Shuffle, ShoppingBag, PlusCircle, Trash2 } from 'lucide-react';
import { format, parse, parseISO, addMinutes, areIntervalsOverlapping, startOfDay } from 'date-fns';
import { es } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { PatientSearchField } from './patient-search-field';
import { PatientHistoryPanel } from './patient-history-panel';
import { AttendancePredictionTool } from './attendance-prediction-tool';
import { useToast } from '@/hooks/use-toast';
import { Alert, AlertDescription } from '@/components/ui/alert';


interface AppointmentFormProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onAppointmentCreated: () => void;
  initialData?: Partial<FormSchemaType>;
  defaultDate?: Date;
  allProfessionals: Professional[];
  currentLocationProfessionals: Professional[];
}

const ANY_PROFESSIONAL_VALUE = "_any_professional_placeholder_";
const DEFAULT_SERVICE_ID_PLACEHOLDER = "_default_service_id_placeholder_";
const NO_SELECTION_PLACEHOLDER = "_no_selection_placeholder_";


export function AppointmentForm({
  isOpen,
  onOpenChange,
  onAppointmentCreated,
  initialData,
  defaultDate,
  allProfessionals: allSystemProfessionals, // Renamed for clarity inside component
  currentLocationProfessionals: professionalsForCurrentLocationProp // Renamed for clarity
}: AppointmentFormProps) {
  const { user } = useAuth();
  const { selectedLocationId: adminSelectedLocation } = useAppState();
  const { toast } = useToast();

  const [servicesList, setServicesList] = useState<Service[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingServices, setIsLoadingServices] = useState(true);
  const [showPatientHistory, setShowPatientHistory] = useState(false);
  const [currentPatientForHistory, setCurrentPatientForHistory] = useState<Patient | null>(null);

  const [appointmentsForSelectedDate, setAppointmentsForSelectedDate] = useState<Appointment[]>([]);
  const [isLoadingAppointments, setIsLoadingAppointments] = useState(false);
  const [availableProfessionalsForTimeSlot, setAvailableProfessionalsForTimeSlot] = useState<Professional[]>([]);
  const [slotAvailabilityMessage, setSlotAvailabilityMessage] = useState<string>('');


  const isAdminOrContador = user?.role === USER_ROLES.ADMIN || user?.role === USER_ROLES.CONTADOR;
  const defaultLocation = user?.role === USER_ROLES.LOCATION_STAFF
    ? user.locationId
    : (isAdminOrContador && adminSelectedLocation && adminSelectedLocation !== 'all'
        ? adminSelectedLocation
        : (isAdminOrContador ? LOCATIONS[0].id : undefined)
    );

  const form = useForm<FormSchemaType>({
    resolver: zodResolver(AppointmentFormSchema),
    defaultValues: {
      patientFirstName: initialData?.patientFirstName || '',
      patientLastName: initialData?.patientLastName || '',
      patientPhone: initialData?.patientPhone || '',
      patientAge: initialData?.patientAge ?? null,
      existingPatientId: initialData?.existingPatientId || null,
      isDiabetic: initialData?.isDiabetic || false,
      locationId: initialData?.locationId || defaultLocation || LOCATIONS[0].id,
      serviceId: initialData?.serviceId || DEFAULT_SERVICE_ID_PLACEHOLDER,
      appointmentDate: initialData?.appointmentDate || defaultDate || new Date(),
      appointmentTime: initialData?.appointmentTime || TIME_SLOTS[4], // Default to 10:00 AM
      preferredProfessionalId: initialData?.preferredProfessionalId || ANY_PROFESSIONAL_VALUE,
      bookingObservations: initialData?.bookingObservations || '',
      searchExternal: initialData?.searchExternal || false,
      addedServices: initialData?.addedServices || [],
    },
  });

  const { fields: addedServiceFields, append: appendAddedService, remove: removeAddedService } = useFieldArray({
    control: form.control,
    name: "addedServices",
  });

  const watchLocationId = form.watch('locationId');
  const watchExistingPatientId = form.watch('existingPatientId');
  const watchAppointmentDate = form.watch('appointmentDate');
  const watchAppointmentTime = form.watch('appointmentTime');
  const watchServiceId = form.watch('serviceId');
  const watchPreferredProfessionalId = form.watch('preferredProfessionalId');
  const watchSearchExternal = form.watch('searchExternal');


  useEffect(() => {
    async function loadInitialServices() {
      setIsLoadingServices(true);
      try {
        const fetchedServices = await getServices();
        setServicesList(fetchedServices || []);
        if (form.getValues('serviceId') === DEFAULT_SERVICE_ID_PLACEHOLDER && fetchedServices && fetchedServices.length > 0) {
          form.setValue('serviceId', fetchedServices[0].id);
        }
      } catch (error) {
        console.error("Failed to load services for form:", error);
        setServicesList([]);
        toast({ title: "Error", description: "No se pudieron cargar los servicios.", variant: "destructive" });
      } finally {
        setIsLoadingServices(false);
      }
    }
    if (isOpen) {
        loadInitialServices();
    }
  }, [isOpen, form, toast]);

  useEffect(() => {
    if (isOpen && initialData?.locationId !== watchLocationId) { // Reset if location changes from initial or form open
        form.setValue('searchExternal', false);
        form.setValue('preferredProfessionalId', ANY_PROFESSIONAL_VALUE);
    }
  }, [watchLocationId, isOpen, form, initialData?.locationId]);


  useEffect(() => {
    async function fetchAppointmentsForSlotCheck() {
      if (!isOpen || !watchLocationId || !watchAppointmentDate) {
        setAppointmentsForSelectedDate([]);
        return;
      }
      setIsLoadingAppointments(true);
      try {
        const result = await getAppointments({
          locationId: watchLocationId as LocationId,
          date: watchAppointmentDate,
          statuses: [APPOINTMENT_STATUS.BOOKED, APPOINTMENT_STATUS.CONFIRMED, APPOINTMENT_STATUS.COMPLETED] // Include completed to check for overlaps
        });
        setAppointmentsForSelectedDate(result.appointments || []);
      } catch (error) {
        console.error("Error fetching appointments for slot check:", error);
        setAppointmentsForSelectedDate([]);
      } finally {
        setIsLoadingAppointments(false);
      }
    }
    if (isOpen) {
      fetchAppointmentsForSlotCheck();
    }
  }, [isOpen, watchLocationId, watchAppointmentDate]);


  useEffect(() => {
    console.log("[AppointmentForm] Recalculating available professionals. Watched values:", {
      isOpen,
      date: watchAppointmentDate ? format(watchAppointmentDate, 'yyyy-MM-dd') : 'N/A',
      time: watchAppointmentTime,
      serviceId: watchServiceId,
      servicesListLength: servicesList.length,
      isLoadingAppointments,
      searchExternal: watchSearchExternal,
      formLocationId: watchLocationId,
      prop_professionalsForCurrentLocationLength: professionalsForCurrentLocationProp.length,
      prop_allSystemProfessionalsLength: allSystemProfessionals.length,
    });

    if (!isOpen || !watchAppointmentDate || !watchAppointmentTime || !watchServiceId || servicesList.length === 0 || isLoadingAppointments ) {
      console.log("[AppointmentForm] Skipping available professionals calculation due to missing data or loading state.");
      const defaultProfsToShow = watchSearchExternal ? allSystemProfessionals : professionalsForCurrentLocationProp.filter(prof => prof.locationId === watchLocationId);
      setAvailableProfessionalsForTimeSlot(defaultProfsToShow.filter(prof => {
        const availability = getProfessionalAvailabilityForDate(prof, watchAppointmentDate);
        // Basic check: is working and has defined hours?
        return availability !== null && availability.startTime !== '' && availability.endTime !== '';
      }));
      setSlotAvailabilityMessage('');
      return;
    }

    const selectedService = servicesList.find(s => s.id === watchServiceId);
    if (!selectedService) {
      setAvailableProfessionalsForTimeSlot([]);
      setSlotAvailabilityMessage('Por favor, seleccione un servicio principal válido.');
      console.log("[AppointmentForm] No valid main service selected.");
      return;
    }

    const appointmentDuration = selectedService.defaultDuration;
    const proposedStartTime = parse(`${format(watchAppointmentDate, 'yyyy-MM-dd')} ${watchAppointmentTime}`, 'yyyy-MM-dd HH:mm', new Date());
    const proposedEndTime = addMinutes(proposedStartTime, appointmentDuration);
    console.log(`[AppointmentForm] Proposed appointment slot: ${format(proposedStartTime, 'HH:mm')} - ${format(proposedEndTime, 'HH:mm')} (Duration: ${appointmentDuration}m)`);

    const professionalsToConsider = watchSearchExternal ? allSystemProfessionals : professionalsForCurrentLocationProp;
    const availableProfs: Professional[] = [];
    console.log(`[AppointmentForm] Professionals to consider (searchExternal: ${watchSearchExternal}, formLocationId: ${watchLocationId}): ${professionalsToConsider.length} professionals.`);

    for (const prof of professionalsToConsider) {
      // If not searching externally, only consider professionals from the form's selected location.
      if (!watchSearchExternal && prof.locationId !== watchLocationId) {
        // This log is mostly for debugging if professionalsForCurrentLocationProp was not pre-filtered correctly.
        // console.log(`[AppointmentForm] INTERNAL SKIP ${prof.firstName} ${prof.lastName} (ID: ${prof.id}): Not in selected form location '${watchLocationId}'. Professional's location: '${prof.locationId}'. This should ideally not happen if professionalsForCurrentLocationProp is correctly filtered.`);
        continue;
      }

      const dailyAvailability = getProfessionalAvailabilityForDate(prof, watchAppointmentDate);
      // Use JSON.stringify then parse to get a clean loggable object, avoiding potential circular references or complex Proxy objects.
      console.log(`[AppointmentForm] Checking Prof: ${prof.firstName} ${prof.lastName} (ID: ${prof.id}, Loc: ${prof.locationId}). Daily Availability for ${format(watchAppointmentDate, 'yyyy-MM-dd')}:`, dailyAvailability ? JSON.parse(JSON.stringify(dailyAvailability)) : null);


      if (!dailyAvailability || !dailyAvailability.startTime || !dailyAvailability.endTime) {
        console.log(`[AppointmentForm] SKIPPED ${prof.firstName} ${prof.lastName}: No daily availability or missing start/end times. Reason from availability: ${dailyAvailability?.reason || 'No specific reason provided by getProfessionalAvailabilityForDate'}`);
        continue;
      }

      const profWorkStartTime = parse(`${format(watchAppointmentDate, 'yyyy-MM-dd')} ${dailyAvailability.startTime}`, 'yyyy-MM-dd HH:mm', new Date());
      const profWorkEndTime = parse(`${format(watchAppointmentDate, 'yyyy-MM-dd')} ${dailyAvailability.endTime}`, 'yyyy-MM-dd HH:mm', new Date());

      if (proposedStartTime < profWorkStartTime || proposedEndTime > profWorkEndTime) {
        console.log(`[AppointmentForm] SKIPPED ${prof.firstName} ${prof.lastName}: Appointment time (${format(proposedStartTime, 'HH:mm')}-${format(proposedEndTime, 'HH:mm')}) is outside of their work hours (${dailyAvailability.startTime}-${dailyAvailability.endTime}).`);
        continue;
      }

      let isBusy = false;
      const appointmentsForThisProfAndDay = appointmentsForSelectedDate.filter(
        (appt) => appt.professionalId === prof.id && !appt.isTravelBlock
      );

      for (const existingAppt of appointmentsForThisProfAndDay) {
        const existingApptStartTime = parseISO(existingAppt.appointmentDateTime);
        const existingApptEndTime = addMinutes(existingApptStartTime, existingAppt.durationMinutes);
        if (areIntervalsOverlapping(
          { start: proposedStartTime, end: proposedEndTime },
          { start: existingApptStartTime, end: existingApptEndTime }
        )) {
          isBusy = true;
          console.log(`[AppointmentForm] SKIPPED ${prof.firstName} ${prof.lastName}: Busy due to overlap with existing appointment ${existingAppt.id} (${format(existingApptStartTime, 'HH:mm')}-${format(existingApptEndTime, 'HH:mm')}).`);
          break;
        }
      }
      if (!isBusy) {
        availableProfs.push(prof);
        console.log(`[AppointmentForm] ADDED ${prof.firstName} ${prof.lastName} (ID: ${prof.id}, Loc: ${prof.locationId}) to available list for this slot.`);
      }
    }

    setAvailableProfessionalsForTimeSlot(availableProfs.sort((a,b) => `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`)));
    if (availableProfs.length === 0) {
        const baseMessage = 'No hay profesionales disponibles para este horario y servicio.';
        setSlotAvailabilityMessage(watchSearchExternal ? `${baseMessage} (incluyendo otras sedes).` : `${baseMessage} Pruebe buscando en otras sedes si la opción está disponible.`);
        console.log("[AppointmentForm] No professionals available for the selected slot after all checks.");
    } else {
      setSlotAvailabilityMessage('');
      console.log(`[AppointmentForm] Calculation complete. ${availableProfs.length} professionals available for this slot.`);
    }

  }, [isOpen, watchAppointmentDate, watchAppointmentTime, watchServiceId, servicesList, professionalsForCurrentLocationProp, allSystemProfessionals, appointmentsForSelectedDate, isLoadingAppointments, watchSearchExternal, watchLocationId]);


  useEffect(() => {
    async function fetchAndSetPatientForHistory(patientId: string) {
      const patient = await getPatientById(patientId);
      setCurrentPatientForHistory(patient || null);
      setShowPatientHistory(!!patient);
      if (patient) {
        form.setValue('isDiabetic', patient.isDiabetic || false);
        form.setValue('patientAge', patient.age ?? null);
      }
    }
    if (watchExistingPatientId) {
      fetchAndSetPatientForHistory(watchExistingPatientId);
    } else {
      setCurrentPatientForHistory(null);
      setShowPatientHistory(false);
      // Don't reset isDiabetic and patientAge here if they were part of initialData or manual input for a new patient
    }
  }, [watchExistingPatientId, form]);


  const handlePatientSelect = (patient: Patient | null) => {
    if (patient) {
      form.setValue('existingPatientId', patient.id);
      form.setValue('patientFirstName', patient.firstName);
      form.setValue('patientLastName', patient.lastName);
      form.setValue('patientPhone', (user?.role === USER_ROLES.ADMIN ? patient.phone : "Teléfono Restringido") || '');
      form.setValue('patientAge', patient.age ?? null);
      form.setValue('isDiabetic', patient.isDiabetic || false);
      setCurrentPatientForHistory(patient);
      setShowPatientHistory(true);
    } else { 
      form.setValue('existingPatientId', null);
      form.setValue('patientFirstName', '');
      form.setValue('patientLastName', '');
      form.setValue('patientPhone', '');
      form.setValue('patientAge', null);
      form.setValue('isDiabetic', false);
      setCurrentPatientForHistory(null);
      setShowPatientHistory(false);
    }
  };


  async function onSubmit(data: FormSchemaType) {
    setIsLoading(true);
    console.log("[AppointmentForm] onSubmit: Datos crudos del formulario:", JSON.stringify(data, null, 2));

    if (data.serviceId === DEFAULT_SERVICE_ID_PLACEHOLDER && servicesList.length > 0) {
      data.serviceId = servicesList[0].id; // Fallback if somehow placeholder is still selected
    } else if (data.serviceId === DEFAULT_SERVICE_ID_PLACEHOLDER || !servicesList.find(s => s.id === data.serviceId)) {
        toast({ title: "Error de Validación", description: "Servicio principal es requerido o inválido.", variant: "destructive" });
        setIsLoading(false);
        return;
    }
    
    const validAddedServices = (data.addedServices || []).map(as => ({
      ...as,
      serviceId: as.serviceId === DEFAULT_SERVICE_ID_PLACEHOLDER && servicesList.length > 0 ? servicesList[0].id : as.serviceId,
      professionalId: as.professionalId === NO_SELECTION_PLACEHOLDER ? null : as.professionalId,
    })).filter(as => as.serviceId && as.serviceId !== DEFAULT_SERVICE_ID_PLACEHOLDER);

    try {
      const submitData: FormSchemaType & { isExternalProfessional?: boolean; externalProfessionalOriginLocationId?: LocationId | null; addedServices?: FormSchemaType['addedServices'] } = {
        ...data,
        preferredProfessionalId: data.preferredProfessionalId === ANY_PROFESSIONAL_VALUE ? null : data.preferredProfessionalId,
        patientPhone: (data.existingPatientId && user?.role !== USER_ROLES.ADMIN) ? undefined : data.patientPhone, // Send undefined to not update if restricted
        isDiabetic: data.isDiabetic || false,
        patientAge: data.patientAge === 0 ? null : data.patientAge, 
        bookingObservations: data.bookingObservations?.trim() || undefined,
        // isExternalProfessional and externalProfessionalOriginLocationId will be set by addAppointment
        addedServices: validAddedServices,
      };
      console.log("[AppointmentForm] onSubmit: Datos procesados para enviar a addAppointment:", JSON.stringify(submitData, null, 2));

      await addAppointment(submitData);
      toast({
        title: "Cita Agendada",
        description: `La cita para ${data.patientFirstName} ${data.patientLastName} ha sido creada exitosamente.`,
        variant: "default",
      });
      onAppointmentCreated();
      onOpenChange(false); 
      form.reset({ 
        ...form.formState.defaultValues,
        appointmentDate: defaultDate || new Date(),
        locationId: data.locationId, 
        serviceId: servicesList.length > 0 ? servicesList[0].id : DEFAULT_SERVICE_ID_PLACEHOLDER,
        appointmentTime: TIME_SLOTS[4], 
        preferredProfessionalId: ANY_PROFESSIONAL_VALUE,
        patientFirstName: '',
        patientLastName: '',
        patientPhone: '',
        patientAge: null,
        isDiabetic: false,
        existingPatientId: null,
        bookingObservations: '',
        searchExternal: false,
        addedServices: [],
      });
      setCurrentPatientForHistory(null);
      setShowPatientHistory(false);
    } catch (error) {
      console.error("Error creating appointment:", error);
      toast({
        title: "Error al Agendar",
        description: (error instanceof Error && error.message) ? error.message : "No se pudo crear la cita. Verifique la disponibilidad o contacte soporte.",
        variant: "destructive",
        duration: 7000,
      });
    } finally {
      setIsLoading(false);
    }
  }

  const isSubmitDisabled = useMemo(() => {
    if (isLoading || isLoadingServices || isLoadingAppointments ) return true;
    if (servicesList.length === 0 && form.getValues('serviceId') === DEFAULT_SERVICE_ID_PLACEHOLDER) return true;
    if (form.getValues('serviceId') === DEFAULT_SERVICE_ID_PLACEHOLDER) return true; // Must select a main service

    const preferredProfId = watchPreferredProfessionalId;
    
    if (preferredProfId && preferredProfId !== ANY_PROFESSIONAL_VALUE) {
      // If a specific professional is chosen, they MUST be in the available list for that slot.
      const isChosenProfAvailable = availableProfessionalsForTimeSlot.find(p => p.id === preferredProfId);
      if (!isChosenProfAvailable) {
          console.log(`[AppointmentForm] Submit DISABLED: Preferred professional ${preferredProfId} is not in the available list for the slot.`);
          return true;
      }
    } else if (preferredProfId === ANY_PROFESSIONAL_VALUE && availableProfessionalsForTimeSlot.length === 0) {
        // If "any professional" is chosen, but the list of available professionals for that slot is empty.
        console.log(`[AppointmentForm] Submit DISABLED: "Any professional" selected, but no professionals are available for this slot.`);
        return true;
    }
    return false;
  }, [isLoading, isLoadingServices, isLoadingAppointments, servicesList, availableProfessionalsForTimeSlot, watchPreferredProfessionalId, form]);


  if (!isOpen) return null;

  const checkboxDisabledReason = (availableProfessionalsForTimeSlot.length > 0 && !watchSearchExternal) || isLoadingServices || servicesList.length === 0 || isLoadingAppointments;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => {
      if (!open) {
        form.reset({
          ...form.formState.defaultValues,
          appointmentDate: defaultDate || new Date(),
          locationId: initialData?.locationId || defaultLocation || LOCATIONS[0].id,
          serviceId: servicesList.length > 0 ? servicesList[0].id : DEFAULT_SERVICE_ID_PLACEHOLDER,
          appointmentTime: TIME_SLOTS[4], 
          preferredProfessionalId: ANY_PROFESSIONAL_VALUE,
          patientFirstName: '',
          patientLastName: '',
          patientPhone: '',
          patientAge: null,
          isDiabetic: false,
          existingPatientId: null,
          bookingObservations: '',
          searchExternal: false,
          addedServices: [],
        });
        setCurrentPatientForHistory(null);
        setShowPatientHistory(false);
        setSlotAvailabilityMessage('');
      }
      onOpenChange(open);
    }}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-2xl flex items-center gap-2">
            <CalendarIcon className="text-primary"/>
            Agendar Nueva Cita
          </DialogTitle>
          <DialogDescription>
            Complete los detalles para la nueva cita.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-grow overflow-y-auto pr-2 -mr-2"> 
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="grid grid-cols-1 md:grid-cols-2 gap-6 py-4">
              
              <div className="md:col-span-1 space-y-4 p-4 border rounded-lg shadow-sm bg-card">
                <h3 className="text-lg font-semibold flex items-center gap-2"><UserPlus /> Información del Paciente</h3>
                <FormField
                  control={form.control}
                  name="existingPatientId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Paciente</FormLabel>
                      <PatientSearchField
                        onPatientSelect={handlePatientSelect}
                        selectedPatientId={field.value}
                        onClear={() => { 
                          form.setValue('existingPatientId', null);
                          form.setValue('patientFirstName', '');
                          form.setValue('patientLastName', '');
                          form.setValue('patientPhone', '');
                          form.setValue('patientAge', null);
                          form.setValue('isDiabetic', false);
                          setCurrentPatientForHistory(null);
                          setShowPatientHistory(false);
                        }}
                      />
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="patientFirstName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Nombre(s)</FormLabel>
                        <FormControl><Input placeholder="Ej: Juan" {...field} disabled={!!form.getValues("existingPatientId")} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="patientLastName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Apellido(s)</FormLabel>
                        <FormControl><Input placeholder="Ej: Pérez" {...field} disabled={!!form.getValues("existingPatientId")} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="patientPhone"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Teléfono (Opcional)</FormLabel>
                        <FormControl><Input
                          type="tel"
                          placeholder={(!!form.getValues("existingPatientId") && user?.role !== USER_ROLES.ADMIN) ? "Teléfono Restringido" : "Ej: 987654321"}
                          {...field}
                          value={field.value || ''}
                          disabled={!!form.getValues("existingPatientId") && user?.role !== USER_ROLES.ADMIN}
                        /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="patientAge"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="flex items-center gap-1"><UserRound size={16}/>Edad (Opcional)</FormLabel>
                        <FormControl><Input type="number" placeholder="Ej: 30" {...field} onChange={e => field.onChange(e.target.value === '' ? null : parseInt(e.target.value,10) || null)} disabled={!!form.getValues("existingPatientId")} value={field.value ?? ''}/></FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <FormField
                    control={form.control}
                    name="isDiabetic"
                    render={({ field }) => (
                    <FormItem className="flex flex-row items-center space-x-3 space-y-0 rounded-md border p-3 shadow-sm h-fit">
                        <FormControl>
                        <Checkbox
                            checked={field.value}
                            onCheckedChange={field.onChange}
                            disabled={!!form.getValues("existingPatientId")}
                        />
                        </FormControl>
                        <div className="space-y-1 leading-none">
                        <FormLabel className={!!form.getValues("existingPatientId") ? "text-muted-foreground" : ""}>
                            ¿Paciente diabético?
                        </FormLabel>
                        </div>
                        <FormMessage />
                    </FormItem>
                    )}
                  />


                {showPatientHistory && currentPatientForHistory && (
                  <div className="mt-4 space-y-2">
                     <PatientHistoryPanel patient={currentPatientForHistory} />
                     <AttendancePredictionTool patientId={currentPatientForHistory.id} />
                  </div>
                )}
              </div>

              
              <div className="md:col-span-1 space-y-4 p-4 border rounded-lg shadow-sm bg-card">
                 <h3 className="text-lg font-semibold flex items-center gap-2"><ConciergeBell /> Detalles de la Cita</h3>
                <FormField
                  control={form.control}
                  name="locationId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="flex items-center gap-1"><Building size={16}/>Sede</FormLabel>
                      <Select onValueChange={(value) => { field.onChange(value); form.setValue('searchExternal', false); form.setValue('preferredProfessionalId', ANY_PROFESSIONAL_VALUE);}} value={field.value || ""} disabled={(user?.role === USER_ROLES.LOCATION_STAFF && !isAdminOrContador) || isLoadingServices || servicesList.length === 0}>
                        <FormControl>
                          <SelectTrigger><SelectValue placeholder="Seleccionar sede" /></SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {LOCATIONS.map(loc => (
                            <SelectItem key={loc.id} value={loc.id}>{loc.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="serviceId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Servicio Principal</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value === DEFAULT_SERVICE_ID_PLACEHOLDER && servicesList.length > 0 ? servicesList[0].id : field.value} disabled={isLoadingServices || servicesList.length === 0}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder={isLoadingServices ? "Cargando servicios..." : (servicesList.length > 0 ? "Seleccionar servicio" : "No hay servicios")} />
                           </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {isLoadingServices && <SelectItem value={DEFAULT_SERVICE_ID_PLACEHOLDER} disabled>Cargando...</SelectItem>}
                          {!isLoadingServices && servicesList.length === 0 && <SelectItem value={DEFAULT_SERVICE_ID_PLACEHOLDER} disabled>No hay servicios</SelectItem>}
                          {!isLoadingServices && servicesList.map(serv => (
                            <SelectItem key={serv.id} value={serv.id}>{serv.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="appointmentDate"
                    render={({ field }) => (
                      <FormItem className="flex flex-col">
                        <FormLabel className="flex items-center gap-1"><CalendarIcon size={16}/>Fecha de la Cita</FormLabel>
                        <Popover>
                          <PopoverTrigger asChild>
                            <FormControl>
                              <Button
                                variant={"outline"}
                                className={cn(
                                  "pl-3 text-left font-normal",
                                  !field.value && "text-muted-foreground"
                                )}
                                disabled={isLoadingServices || servicesList.length === 0}
                              >
                                {field.value ? (
                                  format(field.value, "PPP", { locale: es })
                                ) : (
                                  <span>Seleccionar fecha</span>
                                )}
                                <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                              </Button>
                            </FormControl>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="start">
                            <Calendar
                              mode="single"
                              selected={field.value}
                              onSelect={field.onChange}
                              disabled={(date) => date < startOfDay(new Date())} 
                              initialFocus
                            />
                          </PopoverContent>
                        </Popover>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="appointmentTime"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="flex items-center gap-1"><ClockIcon size={16}/>Hora de la Cita</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value} disabled={isLoadingServices || servicesList.length === 0}>
                          <FormControl>
                            <SelectTrigger><SelectValue placeholder="Seleccionar hora" /></SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {TIME_SLOTS.map(slot => (
                              <SelectItem key={slot} value={slot}>{slot}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                
                <div className="space-y-2">
                  <h4 className="text-md font-semibold flex items-center gap-2"><Briefcase /> Profesional y Observaciones</h4>
                   <FormField
                      control={form.control}
                      name="searchExternal"
                      render={({ field }) => (
                          <FormItem className="flex flex-row items-center space-x-3 space-y-0 rounded-md border p-3 shadow-sm">
                              <FormControl>
                                  <Checkbox
                                      checked={field.value}
                                      onCheckedChange={(checked) => {
                                          const isChecked = Boolean(checked);
                                          field.onChange(isChecked);
                                          form.setValue('preferredProfessionalId', ANY_PROFESSIONAL_VALUE);
                                      }}
                                      disabled={checkboxDisabledReason}
                                      id="searchExternalCheckbox"
                                  />
                              </FormControl>
                              <div className="space-y-1 leading-none">
                                  <Label htmlFor="searchExternalCheckbox" className={cn("cursor-pointer", checkboxDisabledReason && "text-muted-foreground")}>
                                      Buscar profesional en otras sedes
                                  </Label>
                                  {checkboxDisabledReason && !isLoadingAppointments && !isLoadingServices && (
                                      <FormDescription className="text-xs">
                                          {availableProfessionalsForTimeSlot.length > 0 ? "Deshabilitado porque hay profesionales locales disponibles." : (servicesList.length === 0 ? "Seleccione un servicio primero." : "No hay profesionales disponibles.")}
                                      </FormDescription>
                                  )}
                              </div>
                          </FormItem>
                      )}
                  />
                  <FormField
                    control={form.control}
                    name="preferredProfessionalId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Profesional Preferido (Opcional)</FormLabel>
                        <Select
                          onValueChange={(value) => field.onChange(value === ANY_PROFESSIONAL_VALUE ? null : value)}
                          value={field.value || ANY_PROFESSIONAL_VALUE}
                          disabled={isLoadingServices || servicesList.length === 0 || isLoadingAppointments }
                        >
                          <FormControl>
                            <SelectTrigger>
                                <SelectValue placeholder={
                                    (isLoadingAppointments || isLoadingServices) ? "Cargando..." :
                                    (availableProfessionalsForTimeSlot.length > 0 || watchSearchExternal) ? "Cualquier profesional disponible" :
                                    "No hay profesionales disponibles"
                                } />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value={ANY_PROFESSIONAL_VALUE}>Cualquier profesional disponible</SelectItem>
                            {availableProfessionalsForTimeSlot.map(prof => (
                              <SelectItem key={prof.id} value={prof.id}>
                                  {prof.firstName} {prof.lastName} {watchSearchExternal && prof.locationId !== watchLocationId ? `(Sede: ${LOCATIONS.find(l=>l.id === prof.locationId)?.name || 'Externa'})` : ''}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                         {slotAvailabilityMessage && (
                            <Alert variant={availableProfessionalsForTimeSlot.length > 0 ? "default" : "destructive"} className="mt-2 text-xs p-2">
                              <AlertCircle className="h-4 w-4" />
                              <AlertDescription>{slotAvailabilityMessage}</AlertDescription>
                            </Alert>
                          )}
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="bookingObservations"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="flex items-center gap-1"><Edit3 size={16}/>Observaciones Adicionales (Opcional)</FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder="Ej: El paciente tiene movilidad reducida, etc."
                            className="resize-none"
                            {...field}
                            value={field.value || ''}
                            disabled={isLoadingServices || servicesList.length === 0}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                {!isLoadingServices && servicesList && servicesList.length > 0 && (
                  <div className="space-y-3 pt-3 mt-3 border-t">
                    <div className="flex justify-between items-center">
                      <h4 className="text-md font-semibold flex items-center gap-2"><ShoppingBag/> Servicios Adicionales</h4>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => appendAddedService({ serviceId: servicesList?.length ? servicesList[0].id : DEFAULT_SERVICE_ID_PLACEHOLDER, professionalId: NO_SELECTION_PLACEHOLDER, price: undefined })}
                      >
                        <PlusCircle className="mr-2 h-4 w-4" /> Agregar
                      </Button>
                    </div>
                    {addedServiceFields.map((item, index) => (
                      <div key={item.id} className="p-3 border rounded-md space-y-3 bg-muted/50 relative">
                         <Button type="button" variant="ghost" size="icon" className="absolute top-1 right-1 h-6 w-6" onClick={() => removeAddedService(index)}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        <FormField
                          control={form.control}
                          name={`addedServices.${index}.serviceId`}
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-xs">Servicio Adicional {index + 1}</FormLabel>
                              <Select onValueChange={field.onChange} value={field.value} disabled={!servicesList?.length}>
                                <FormControl><SelectTrigger><SelectValue placeholder={servicesList?.length ? "Seleccionar servicio" : "No hay servicios"} /></SelectTrigger></FormControl>
                                <SelectContent>
                                   {!servicesList?.length && <SelectItem value={DEFAULT_SERVICE_ID_PLACEHOLDER} disabled>No hay servicios</SelectItem>}
                                   {servicesList?.map(s => <SelectItem key={`added-${s.id}-${index}`} value={s.id}>{s.name}</SelectItem>)}
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name={`addedServices.${index}.professionalId`}
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-xs">Profesional (Opcional)</FormLabel>
                              <Select onValueChange={(value) => field.onChange(value === NO_SELECTION_PLACEHOLDER ? null : value)} value={field.value || NO_SELECTION_PLACEHOLDER}>
                               <FormControl><SelectTrigger><SelectValue placeholder="Mismo prof. / Cualquiera" /></SelectTrigger></FormControl>
                                <SelectContent>
                                  <SelectItem value={NO_SELECTION_PLACEHOLDER}>Mismo prof. / Cualquiera</SelectItem>
                                  {availableProfessionalsForTimeSlot.map(p => <SelectItem key={`added-prof-${p.id}-${index}`} value={p.id}>{p.firstName} {p.lastName}</SelectItem>)}
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name={`addedServices.${index}.price`}
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-xs">Precio (S/) (Opcional)</FormLabel>
                              <FormControl><Input type="number" step="0.01" placeholder="Ej: 50.00" {...field} value={field.value ?? ""} onChange={e => field.onChange(e.target.value ? parseFloat(e.target.value) : undefined)} /></FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                    ))}
                    <FormField control={form.control} name="addedServices" render={() => <FormMessage />} />
                  </div>
                )}


              </div>
            </form>
          </Form>
        </div>

        <DialogFooter className="pt-4 border-t">
          <DialogClose asChild>
            <Button variant="outline" onClick={() => {
               form.reset({
                ...form.formState.defaultValues,
                appointmentDate: defaultDate || new Date(),
                locationId: initialData?.locationId || defaultLocation || LOCATIONS[0].id,
                serviceId: servicesList.length > 0 ? servicesList[0].id : DEFAULT_SERVICE_ID_PLACEHOLDER,
                appointmentTime: TIME_SLOTS[4], 
                preferredProfessionalId: ANY_PROFESSIONAL_VALUE,
                patientFirstName: '',
                patientLastName: '',
                patientPhone: '',
                patientAge: null,
                isDiabetic: false,
                existingPatientId: null,
                bookingObservations: '',
                searchExternal: false,
                addedServices: [],
              });
              setCurrentPatientForHistory(null);
              setShowPatientHistory(false);
              setSlotAvailabilityMessage('');
              onOpenChange(false);
            }}>Cancelar</Button>
          </DialogClose>
          <Button type="submit" onClick={form.handleSubmit(onSubmit)} disabled={isSubmitDisabled}>
            {(isLoading || isLoadingServices || isLoadingAppointments ) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Agendar Cita
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
