
"use client";

import React, { useState, useEffect, useMemo } from 'react';
import { useForm, Controller, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { AppointmentFormSchema, type AppointmentFormData as FormSchemaType } from '@/lib/schemas';
import type { LocationId } from '@/lib/constants';
import type { Professional, Patient, Service, Appointment, Location } from '@/types';
import { useAuth } from '@/contexts/auth-provider';
import { useAppState } from '@/contexts/app-state-provider';
import { USER_ROLES, TIME_SLOTS, APPOINTMENT_STATUS } from '@/lib/constants';
import { getServices, addAppointment, getPatientById, getProfessionalAvailabilityForDate, getAppointments, getLocations } from '@/lib/data';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { CalendarIcon, ClockIcon, UserPlus, Building, Briefcase, ConciergeBell, Edit3, Loader2, UserRound, AlertCircle, Shuffle, ShoppingBag, PlusCircle, Trash2, ChevronsUpDown, Check, Footprints } from 'lucide-react';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { format, parse, parseISO, addMinutes, areIntervalsOverlapping, startOfDay, isBefore, isAfter } from 'date-fns';
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
const DEFAULT_SERVICE_ID_PLACEHOLDER = "_default_service_id_placeholder_"; // Puede que ya no sea necesario
const NO_SELECTION_PLACEHOLDER = "_no_selection_placeholder_";


export function AppointmentForm({
  isOpen,
  onOpenChange,
  onAppointmentCreated,
  initialData,
  defaultDate,
  allProfessionals: allSystemProfessionals,
  currentLocationProfessionals: professionalsForCurrentLocationProp
}: AppointmentFormProps) {
  const { user } = useAuth();
  const { selectedLocationId: adminSelectedLocation } = useAppState();
  const { toast } = useToast();

  const [locations, setLocations] = useState<Location[]>([]);
  const [servicesList, setServicesList] = useState<Service[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingServices, setIsLoadingServices] = useState(true);
  const [showPatientHistory, setShowPatientHistory] = useState(false);
  const [currentPatientForHistory, setCurrentPatientForHistory] = useState<Patient | null>(null);

  const [appointmentsForSelectedDate, setAppointmentsForSelectedDate] = useState<Appointment[]>([]);
  const [isLoadingAppointments, setIsLoadingAppointments] = useState(false);
  const [availableProfessionalsForTimeSlot, setAvailableProfessionalsForTimeSlot] = useState<Professional[]>([]);
  const [slotAvailabilityMessage, setSlotAvailabilityMessage] = useState<string | React.ReactNode>('');

  const [serviceSearchTerm, setServiceSearchTerm] = useState('');
  const [serviceSearchPopoverOpen, setServiceSearchPopoverOpen] = useState(false);


  const isAdminOrContador = user?.role === USER_ROLES.ADMIN || user?.role === USER_ROLES.CONTADOR;
  
  useEffect(() => {
    async function loadLocations() {
        if (isOpen) {
            const fetchedLocations = await getLocations();
            setLocations(fetchedLocations);
        }
    }
    loadLocations();
  }, [isOpen]);

  const defaultLocation = user?.role === USER_ROLES.LOCATION_STAFF
    ? user.locationId
    : (isAdminOrContador && adminSelectedLocation && adminSelectedLocation !== 'all'
        ? adminSelectedLocation
        : (isAdminOrContador && locations.length > 0 ? locations[0].id : undefined)
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
      isWalkIn: initialData?.isWalkIn || false,
      locationId: initialData?.locationId || defaultLocation || (locations.length > 0 ? locations[0].id : ''),
      serviceId: initialData?.serviceId || '',
      appointmentDate: initialData?.appointmentDate || defaultDate || new Date(),
      appointmentTime: initialData?.appointmentTime || TIME_SLOTS.find(slot => slot === "10:00") || TIME_SLOTS[0],
      preferredProfessionalId: initialData?.preferredProfessionalId || ANY_PROFESSIONAL_VALUE,
      bookingObservations: initialData?.bookingObservations || '',
      searchExternal: initialData?.searchExternal || false,
      addedServices: initialData?.addedServices || [],
    },
  });
  
  useEffect(() => {
     if (locations.length > 0 && !form.getValues('locationId')) {
        const newDefaultLocation = user?.role === USER_ROLES.LOCATION_STAFF
            ? user.locationId
            : (isAdminOrContador && adminSelectedLocation && adminSelectedLocation !== 'all'
                ? adminSelectedLocation
                : (isAdminOrContador ? locations[0].id : undefined)
            );
        if(newDefaultLocation) form.setValue('locationId', newDefaultLocation);
    }
  }, [locations, form, user, isAdminOrContador, adminSelectedLocation]);


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
  const watchIsWalkIn = form.watch('isWalkIn');


  useEffect(() => {
    async function loadInitialServices() {
      setIsLoadingServices(true);
      try {
        const fetchedServices = await getServices();
        setServicesList(fetchedServices || []);
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
    if (isOpen && initialData?.locationId !== watchLocationId) { 
        form.setValue('searchExternal', false);
        form.setValue('preferredProfessionalId', ANY_PROFESSIONAL_VALUE);
    }
  }, [watchLocationId, isOpen, form, initialData?.locationId]);

  useEffect(() => {
    if (watchIsWalkIn) {
      // Clear patient search and personal details
      form.setValue('existingPatientId', null);
      form.setValue('patientFirstName', 'Cliente');
      form.setValue('patientLastName', 'de Paso');
      form.setValue('patientPhone', '');
      form.setValue('patientAge', null);
      form.setValue('isDiabetic', false);
      setCurrentPatientForHistory(null);
      setShowPatientHistory(false);
    } else {
       // If unchecking, clear the walk-in values
       if(form.getValues('patientFirstName') === 'Cliente' && form.getValues('patientLastName') === 'de Paso'){
          form.setValue('patientFirstName', '');
          form.setValue('patientLastName', '');
       }
    }
  }, [watchIsWalkIn, form]);


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
          statuses: [APPOINTMENT_STATUS.BOOKED, APPOINTMENT_STATUS.CONFIRMED, APPOINTMENT_STATUS.COMPLETED] 
        });
        setAppointmentsForSelectedDate(result.appointments || []);
      } catch (error) {
        console.error("[AppointmentForm] Error fetching appointments for slot check:", error);
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
    if (!isOpen || !watchAppointmentDate || !watchAppointmentTime || !watchServiceId || servicesList.length === 0 || isLoadingAppointments ) {
      setAvailableProfessionalsForTimeSlot([]);
      setSlotAvailabilityMessage('');
      return;
    }

    const selectedService = servicesList.find(s => s.id === watchServiceId);
    if (!selectedService) {
      setAvailableProfessionalsForTimeSlot([]);
      setSlotAvailabilityMessage('Por favor, seleccione un servicio principal válido.');
      return;
    }

    const appointmentDuration = selectedService.defaultDuration;
    const proposedStartTime = parse(`${format(watchAppointmentDate, 'yyyy-MM-dd')} ${watchAppointmentTime}`, 'yyyy-MM-dd HH:mm', new Date());
    const proposedEndTime = addMinutes(proposedStartTime, appointmentDuration);

    let professionalsToConsider: Professional[] = [];
    if(watchSearchExternal && Array.isArray(allSystemProfessionals)){
        professionalsToConsider = allSystemProfessionals;
    } else if (Array.isArray(professionalsForCurrentLocationProp)) {
        professionalsToConsider = professionalsForCurrentLocationProp;
    }

    const availableProfs: Professional[] = [];
    for (const prof of professionalsToConsider) {
       const dailyAvailability = getProfessionalAvailabilityForDate(prof, watchAppointmentDate);

       if (!dailyAvailability || !dailyAvailability.isWorking || !dailyAvailability.startTime || !dailyAvailability.endTime) {
         continue;
       }

       // Check if the professional should be considered for THIS location on THIS day
       if (dailyAvailability.workingLocationId !== watchLocationId) {
         continue;
       }

      const profWorkStartTime = parse(`${format(watchAppointmentDate, 'yyyy-MM-dd')} ${dailyAvailability.startTime}`, 'yyyy-MM-dd HH:mm', new Date());
      const profWorkEndTime = parse(`${format(watchAppointmentDate, 'yyyy-MM-dd')} ${dailyAvailability.endTime}`, 'yyyy-MM-dd HH:mm', new Date());

      if (isBefore(proposedStartTime, profWorkStartTime) || isAfter(proposedEndTime, profWorkEndTime)) {
        continue;
      }

      let isBusy = false;
      const appointmentsForThisProfAndDay = (appointmentsForSelectedDate || []).filter(
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
          break;
        }
      }
      if (!isBusy) {
        availableProfs.push(prof);
      }
    }
    
    setAvailableProfessionalsForTimeSlot(availableProfs.sort((a,b) => `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`)));
    if (availableProfs.length === 0) {
        let baseMessage = 'No hay profesionales disponibles para este horario y servicio.';
        if(!watchServiceId || !selectedService) {
             baseMessage = 'Por favor, seleccione un servicio principal válido para ver la disponibilidad.';
        }
        setSlotAvailabilityMessage(
            <>
              {baseMessage}
              {watchSearchExternal && " (incluyendo otras sedes)."}
              {!watchSearchExternal && professionalsForCurrentLocationProp?.length > 0 && allSystemProfessionals?.length > professionalsForCurrentLocationProp.length && 
                <span className="block text-xs mt-1">Pruebe marcando "Buscar profesional en otras sedes".</span>
              }
            </>
        );
    } else {
      setSlotAvailabilityMessage('');
    }
  }, [
      isOpen, 
      watchAppointmentDate, 
      watchAppointmentTime, 
      watchServiceId, 
      servicesList, 
      professionalsForCurrentLocationProp, 
      allSystemProfessionals, 
      appointmentsForSelectedDate, 
      isLoadingAppointments, 
      watchSearchExternal, 
      watchLocationId
    ]);


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

    if (!data.serviceId || servicesList.length === 0) {
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
        patientPhone: (data.existingPatientId && user?.role !== USER_ROLES.ADMIN) ? undefined : data.patientPhone,
        isDiabetic: data.isDiabetic || false,
        patientAge: data.patientAge === 0 ? null : data.patientAge, 
        bookingObservations: data.bookingObservations?.trim() || undefined,
        addedServices: validAddedServices,
      };

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
        serviceId: servicesList.length > 0 ? servicesList[0].id : '',
        appointmentTime: TIME_SLOTS.find(slot => slot === "10:00") || TIME_SLOTS[0], 
        preferredProfessionalId: ANY_PROFESSIONAL_VALUE,
        patientFirstName: '',
        patientLastName: '',
        patientPhone: '',
        patientAge: null,
        isDiabetic: false,
        existingPatientId: null,
        isWalkIn: false,
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
    if (servicesList.length === 0 && !form.getValues('serviceId')) return true;
    if (!form.getValues('serviceId')) return true; 

    const preferredProfId = watchPreferredProfessionalId;
    
    if (preferredProfId && preferredProfId !== ANY_PROFESSIONAL_VALUE) {
      const isChosenProfAvailable = availableProfessionalsForTimeSlot.find(p => p.id === preferredProfId);
      if (!isChosenProfAvailable) {
          return true;
      }
    } else if (preferredProfId === ANY_PROFESSIONAL_VALUE && availableProfessionalsForTimeSlot.length === 0) {
        return true;
    }
    return false;
  }, [isLoading, isLoadingServices, isLoadingAppointments, servicesList, availableProfessionalsForTimeSlot, watchPreferredProfessionalId, form]);


  if (!isOpen) return null;

  const checkboxDisabledReason = isLoadingServices || servicesList.length === 0 || isLoadingAppointments;

  const filteredServices = serviceSearchTerm
    ? servicesList.filter(service =>
        service.name.toLowerCase().includes(serviceSearchTerm.toLowerCase())
      )
    : servicesList;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => {
      if (!open) {
        form.reset({
          ...form.formState.defaultValues,
          appointmentDate: defaultDate || new Date(),
          locationId: initialData?.locationId || defaultLocation || (locations.length > 0 ? locations[0].id : ''),
          serviceId: servicesList.length > 0 ? servicesList[0].id : '',
          appointmentTime: TIME_SLOTS.find(slot => slot === "10:00") || TIME_SLOTS[0], 
          preferredProfessionalId: ANY_PROFESSIONAL_VALUE,
          patientFirstName: '',
          patientLastName: '',
          patientPhone: '',
          patientAge: null,
          isDiabetic: false,
          isWalkIn: false,
          existingPatientId: null,
          bookingObservations: '',
          searchExternal: false,
          addedServices: [],
        });
        setCurrentPatientForHistory(null);
        setShowPatientHistory(false);
        setSlotAvailabilityMessage('');
        setServiceSearchTerm('');
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
                  name="isWalkIn"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center space-x-3 space-y-0 rounded-md border p-3 shadow-sm bg-amber-50 border-amber-200">
                      <FormControl>
                        <Checkbox
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                      <div className="space-y-1 leading-none">
                        <FormLabel className="flex items-center gap-1.5"><Footprints size={16} />Cliente de Paso (Sin Registro)</FormLabel>
                        <FormDescription className="text-xs">
                          Marcar para clientes no habituales sin registrar sus datos.
                        </FormDescription>
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="existingPatientId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Paciente Registrado</FormLabel>
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
                        disabled={watchIsWalkIn}
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
                        <FormControl><Input placeholder="Ej: Juan" {...field} disabled={!!form.getValues("existingPatientId") || watchIsWalkIn} /></FormControl>
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
                        <FormControl><Input placeholder="Ej: Pérez" {...field} disabled={!!form.getValues("existingPatientId") || watchIsWalkIn} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                 {!watchIsWalkIn && (
                    <>
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
                    </>
                 )}


                {showPatientHistory && currentPatientForHistory && !watchIsWalkIn && (
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
                          {locations.map(loc => (
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
                    <FormItem className="flex flex-col">
                      <FormLabel>Servicio Principal</FormLabel>
                      <Popover open={serviceSearchPopoverOpen} onOpenChange={setServiceSearchPopoverOpen}>
                        <PopoverTrigger asChild>
                          <FormControl>
                            <Button
                              variant="outline"
                              role="combobox"
                              className={cn(
                                "w-full justify-between",
                                !field.value && "text-muted-foreground"
                              )}
                              disabled={isLoadingServices || servicesList.length === 0}
                            >
                              {isLoadingServices ? "Cargando servicios..." : 
                                field.value
                                ? servicesList.find(
                                    (service) => service.id === field.value
                                  )?.name
                                : (servicesList.length > 0 ? "Seleccionar servicio" : "No hay servicios")}
                              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                            </Button>
                          </FormControl>
                        </PopoverTrigger>
                        <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
                          <Command>
                            <CommandInput
                              placeholder="Buscar servicio..."
                              value={serviceSearchTerm}
                              onValueChange={setServiceSearchTerm}
                            />
                            <CommandList>
                              <CommandEmpty>No se encontró servicio.</CommandEmpty>
                              <CommandGroup>
                                {filteredServices.slice(0, 4).map((service) => (
                                  <CommandItem
                                    value={service.name}
                                    key={service.id}
                                    onSelect={() => {
                                      form.setValue("serviceId", service.id);
                                      setServiceSearchPopoverOpen(false);
                                      setServiceSearchTerm('');
                                    }}
                                  >
                                    <Check
                                      className={cn(
                                        "mr-2 h-4 w-4",
                                        service.id === field.value
                                          ? "opacity-100"
                                          : "opacity-0"
                                      )}
                                    />
                                    {service.name}
                                  </CommandItem>
                                ))}
                              </CommandGroup>
                            </CommandList>
                          </Command>
                        </PopoverContent>
                      </Popover>
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
                          onValueChange={(value) => field.onChange(value)}
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
                                  {prof.firstName} {prof.lastName} {watchSearchExternal && prof.locationId !== watchLocationId ? `(Sede: ${locations.find(l=>l.id === prof.locationId)?.name || 'Externa'})` : ''}
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
                        onClick={() => appendAddedService({ serviceId: servicesList?.length ? servicesList[0].id : '', professionalId: NO_SELECTION_PLACEHOLDER, startTime: null, price: undefined })}
                      >
                        <PlusCircle className="mr-2 h-4 w-4" /> Agregar
                      </Button>
                    </div>
                    {addedServiceFields.map((item, index) => (
                      <div key={item.id} className="p-3 border rounded-md space-y-3 bg-muted/50 relative grid grid-cols-1 sm:grid-cols-2 gap-3">
                         <Button type="button" variant="ghost" size="icon" className="absolute top-1 right-1 h-6 w-6" onClick={() => removeAddedService(index)}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        <FormField
                          control={form.control}
                          name={`addedServices.${index}.serviceId`}
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-xs">Servicio Adicional {index + 1}</FormLabel>
                              <Select onValueChange={field.onChange} value={field.value || ''} disabled={!servicesList?.length}>
                                <FormControl><SelectTrigger><SelectValue placeholder={servicesList?.length ? "Seleccionar servicio" : "No hay servicios"} /></SelectTrigger></FormControl>
                                <SelectContent>
                                   {!servicesList?.length && <SelectItem value="" disabled>No hay servicios</SelectItem>}
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
                          name={`addedServices.${index}.startTime`}
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-xs">Hora de Inicio (Opcional)</FormLabel>
                              <Select
                                onValueChange={(value) => field.onChange(value === NO_SELECTION_PLACEHOLDER ? null : value)}
                                value={field.value || NO_SELECTION_PLACEHOLDER}
                              >
                                <FormControl>
                                  <SelectTrigger>
                                    <SelectValue placeholder="Misma hora principal" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  <SelectItem value={NO_SELECTION_PLACEHOLDER}>Misma hora principal</SelectItem>
                                  {TIME_SLOTS.map(slot => (
                                    <SelectItem key={`${slot}-${index}`} value={slot}>
                                      {slot}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
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

        <DialogFooter className="pt-4 border-t flex-col-reverse sm:flex-row sm:justify-end sm:gap-2">
          <DialogClose asChild>
            <Button variant="outline" onClick={() => {
               form.reset({
                ...form.formState.defaultValues,
                appointmentDate: defaultDate || new Date(),
                locationId: initialData?.locationId || defaultLocation || (locations.length > 0 ? locations[0].id : ''),
                serviceId: servicesList.length > 0 ? servicesList[0].id : '',
                appointmentTime: TIME_SLOTS.find(slot => slot === "10:00") || TIME_SLOTS[0], 
                preferredProfessionalId: ANY_PROFESSIONAL_VALUE,
                patientFirstName: '',
                patientLastName: '',
                patientPhone: '',
                patientAge: null,
                isDiabetic: false,
                isWalkIn: false,
                existingPatientId: null,
                bookingObservations: '',
                searchExternal: false,
                addedServices: [],
              });
              setCurrentPatientForHistory(null);
              setShowPatientHistory(false);
              setSlotAvailabilityMessage('');
              setServiceSearchTerm('');
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
