
"use client";

import React, { useState, useEffect } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { AppointmentFormSchema, type AppointmentFormData as FormSchemaType } from '@/lib/schemas';
import type { LocationId } from '@/lib/constants';
import type { Professional, Patient, Service } from '@/types';
import { useAuth } from '@/contexts/auth-provider';
import { useAppState } from '@/contexts/app-state-provider';
import { USER_ROLES, LOCATIONS, TIME_SLOTS } from '@/lib/constants';
import { getProfessionals, getServices, addAppointment, getPatientById } from '@/lib/data';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { CalendarIcon, ClockIcon, UserPlus, Building, Briefcase, ConciergeBell, Edit3, Loader2, Cake, UserRound } from 'lucide-react';
import { format, parse, differenceInYears, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { PatientSearchField } from './patient-search-field';
import { PatientHistoryPanel } from './patient-history-panel';
import { AttendancePredictionTool } from './attendance-prediction-tool';
import { useToast } from '@/hooks/use-toast';


interface AppointmentFormProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onAppointmentCreated: () => void;
  initialData?: Partial<FormSchemaType>;
  defaultDate?: Date;
}

const ANY_PROFESSIONAL_VALUE = "_any_professional_placeholder_";
const DEFAULT_SERVICE_ID_PLACEHOLDER = "_default_service_id_placeholder_"; 

const days = Array.from({ length: 31 }, (_, i) => String(i + 1).padStart(2, '0'));
const months = Array.from({ length: 12 }, (_, i) => ({
  value: String(i + 1).padStart(2, '0'),
  label: new Date(2000, i, 1).toLocaleString('es', { month: 'long' }),
}));


export function AppointmentForm({ isOpen, onOpenChange, onAppointmentCreated, initialData, defaultDate }: AppointmentFormProps) {
  const { user } = useAuth();
  const { selectedLocationId: adminSelectedLocation } = useAppState();
  const { toast } = useToast();

  const [professionals, setProfessionals] = useState<Professional[]>([]);
  const [servicesList, setServicesList] = useState<Service[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingServices, setIsLoadingServices] = useState(true);
  const [showPatientHistory, setShowPatientHistory] = useState(false);
  const [currentPatientForHistory, setCurrentPatientForHistory] = useState<Patient | null>(null);

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
      patientBirthDay: initialData?.patientBirthDay || '',
      patientBirthMonth: initialData?.patientBirthMonth || '',
      existingPatientId: initialData?.existingPatientId || null,
      isDiabetic: initialData?.isDiabetic || false,
      locationId: initialData?.locationId || defaultLocation || LOCATIONS[0].id,
      serviceId: initialData?.serviceId || DEFAULT_SERVICE_ID_PLACEHOLDER, 
      appointmentDate: initialData?.appointmentDate || defaultDate || new Date(),
      appointmentTime: initialData?.appointmentTime || TIME_SLOTS[4], 
      preferredProfessionalId: initialData?.preferredProfessionalId || ANY_PROFESSIONAL_VALUE,
      bookingObservations: initialData?.bookingObservations || '',
    },
  });
  
  const watchLocationId = form.watch('locationId');
  const watchExistingPatientId = form.watch('existingPatientId');

  useEffect(() => {
    async function loadInitialServices() {
      setIsLoadingServices(true);
      try {
        const fetchedServices = await getServices();
        setServicesList(fetchedServices.services || []);
        if (form.getValues('serviceId') === DEFAULT_SERVICE_ID_PLACEHOLDER && fetchedServices.services && fetchedServices.services.length > 0) {
          form.setValue('serviceId', fetchedServices.services[0].id);
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
    async function loadProfessionals(location: LocationId) {
      const profs = await getProfessionals(location);
      setProfessionals(profs || []);
    }
    if (watchLocationId) {
      loadProfessionals(watchLocationId as LocationId);
    }
  }, [watchLocationId]);

  useEffect(() => {
    async function fetchAndSetPatientForHistory(patientId: string) {
      const patient = await getPatientById(patientId);
      setCurrentPatientForHistory(patient || null);
      setShowPatientHistory(!!patient);
      if (patient) {
        form.setValue('isDiabetic', patient.isDiabetic || false);
        form.setValue('patientAge', patient.age ?? null);
        if (patient.dateOfBirth && patient.dateOfBirth.includes('-')) {
          const [day, month] = patient.dateOfBirth.split('-');
          form.setValue('patientBirthDay', day);
          form.setValue('patientBirthMonth', month);
        } else {
          form.setValue('patientBirthDay', '');
          form.setValue('patientBirthMonth', '');
        }
      }
    }
    if (watchExistingPatientId) {
      fetchAndSetPatientForHistory(watchExistingPatientId);
    } else {
      setCurrentPatientForHistory(null);
      setShowPatientHistory(false);
      form.setValue('isDiabetic', false); 
      form.setValue('patientAge', null);
      form.setValue('patientBirthDay', '');
      form.setValue('patientBirthMonth', '');
    }
  }, [watchExistingPatientId, form]);


  const handlePatientSelect = (patient: Patient | null) => {
    if (patient) {
      form.setValue('existingPatientId', patient.id);
      form.setValue('patientFirstName', patient.firstName);
      form.setValue('patientLastName', patient.lastName);
      form.setValue('patientPhone', (user?.role === USER_ROLES.ADMIN ? patient.phone : "Teléfono Restringido") || '');
      form.setValue('patientAge', patient.age ?? null);
      if (patient.dateOfBirth && patient.dateOfBirth.includes('-')) {
        const [day, month] = patient.dateOfBirth.split('-');
        form.setValue('patientBirthDay', day);
        form.setValue('patientBirthMonth', month);
      } else {
        form.setValue('patientBirthDay', '');
        form.setValue('patientBirthMonth', '');
      }
      form.setValue('isDiabetic', patient.isDiabetic || false);
      setCurrentPatientForHistory(patient);
      setShowPatientHistory(true);
    } else {
      form.setValue('existingPatientId', null);
      form.setValue('patientFirstName', '');
      form.setValue('patientLastName', '');
      form.setValue('patientPhone', '');
      form.setValue('patientAge', null);
      form.setValue('patientBirthDay', '');
      form.setValue('patientBirthMonth', '');
      form.setValue('isDiabetic', false);
      setCurrentPatientForHistory(null);
      setShowPatientHistory(false);
    }
  };


  async function onSubmit(data: FormSchemaType) {
    setIsLoading(true);
    try {
      const patientDateOfBirth = (data.patientBirthDay && data.patientBirthMonth) 
        ? `${data.patientBirthDay}-${data.patientBirthMonth}` 
        : undefined;

      const submitData = {
        ...data,
        patientDateOfBirth: patientDateOfBirth, 
        preferredProfessionalId: data.preferredProfessionalId === ANY_PROFESSIONAL_VALUE ? null : data.preferredProfessionalId,
        patientPhone: (data.existingPatientId && user?.role !== USER_ROLES.ADMIN) ? undefined : data.patientPhone,
        isDiabetic: data.isDiabetic || false,
        patientAge: data.patientAge === 0 ? null : data.patientAge, 
      };
      console.log("Submitting appointment data:", submitData);
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
        patientBirthDay: '',
        patientBirthMonth: '',
        isDiabetic: false,
        existingPatientId: null,
        bookingObservations: '',
      });
      setCurrentPatientForHistory(null);
      setShowPatientHistory(false);
    } catch (error) {
      console.error("Error creating appointment:", error);
      toast({
        title: "Error al Agendar",
        description: "No se pudo crear la cita. Intente nuevamente.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  }

  if (!isOpen) return null;

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
          patientBirthDay: '',
          patientBirthMonth: '',
          isDiabetic: false,
          existingPatientId: null,
          bookingObservations: '',
        });
        setCurrentPatientForHistory(null);
        setShowPatientHistory(false);
      }
      onOpenChange(open);
    }}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-2xl flex items-center gap-2">
            <CalendarIcon className="text-primary"/>
            {initialData?.patientFirstName ? 'Editar Cita' : 'Agendar Nueva Cita'}
          </DialogTitle>
          <DialogDescription>
            Complete los detalles para la nueva cita.
          </DialogDescription>
        </DialogHeader>
        
        <div className="flex-grow overflow-y-auto pr-2 -mr-2">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="grid grid-cols-1 md:grid-cols-2 gap-6 py-4">
              <div className="md:col-span-2 space-y-4 p-4 border rounded-lg shadow-sm bg-card">
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
                          form.setValue('patientBirthDay', '');
                          form.setValue('patientBirthMonth', '');
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
                          disabled={!!form.getValues("existingPatientId")}
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
                        <FormControl><Input type="number" placeholder="Ej: 30" {...field} onChange={e => field.onChange(e.target.value === '' ? null : parseInt(e.target.value,10) || null)} disabled={!!form.getValues("existingPatientId")} value={field.value ?? ''} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                 <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-end">
                 <FormField
                    control={form.control}
                    name="patientBirthDay"
                    render={({ field }) => (
                    <FormItem>
                        <FormLabel className="flex items-center gap-1"><Cake size={16}/>Día de Cumpleaños (Opcional)</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value || ""} disabled={!!form.getValues("existingPatientId")}>
                        <FormControl>
                            <SelectTrigger><SelectValue placeholder="Día" /></SelectTrigger>
                        </FormControl>
                        <SelectContent>
                            {days.map(d => <SelectItem key={`day-${d}`} value={d}>{d}</SelectItem>)}
                        </SelectContent>
                        </Select>
                        <FormMessage />
                    </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="patientBirthMonth"
                    render={({ field }) => (
                    <FormItem>
                         <FormLabel>Mes de Cumpleaños (Opcional)</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value || ""} disabled={!!form.getValues("existingPatientId")}>
                        <FormControl>
                            <SelectTrigger><SelectValue placeholder="Mes" /></SelectTrigger>
                        </FormControl>
                        <SelectContent>
                            {months.map(m => <SelectItem key={`month-${m.value}`} value={m.value}>{m.label}</SelectItem>)}
                        </SelectContent>
                        </Select>
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

              <div className="space-y-4 p-4 border rounded-lg shadow-sm bg-card">
                 <h3 className="text-lg font-semibold flex items-center gap-2"><ConciergeBell /> Detalles de la Cita</h3>
                <FormField
                  control={form.control}
                  name="locationId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="flex items-center gap-1"><Building size={16}/>Sede</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value} disabled={(user?.role === USER_ROLES.LOCATION_STAFF && !isAdminOrContador) || isLoadingServices || servicesList.length === 0}>
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
                      <FormLabel>Servicio</FormLabel>
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
                              disabled={(date) => date < new Date(new Date().setHours(0,0,0,0))}
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
              </div>
              
              <div className="space-y-4 p-4 border rounded-lg shadow-sm bg-card">
                <h3 className="text-lg font-semibold flex items-center gap-2"><Briefcase /> Profesional y Observaciones</h3>
                <FormField
                  control={form.control}
                  name="preferredProfessionalId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Profesional Preferido (Opcional)</FormLabel>
                      <Select
                        onValueChange={(value) => field.onChange(value === ANY_PROFESSIONAL_VALUE ? null : value)}
                        value={field.value || ANY_PROFESSIONAL_VALUE}
                        disabled={isLoadingServices || servicesList.length === 0 || professionals.length === 0}
                      >
                        <FormControl>
                          <SelectTrigger><SelectValue placeholder={professionals.length > 0 ? "Cualquier profesional" : "No hay profesionales"} /></SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value={ANY_PROFESSIONAL_VALUE}>Cualquier profesional</SelectItem>
                          {professionals.map(prof => (
                            <SelectItem key={prof.id} value={prof.id}>{prof.firstName} {prof.lastName}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
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
                          placeholder="Ej: El paciente tiene movilidad reducida, requiere un podólogo con experiencia en pie diabético, etc."
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
                patientBirthDay: '',
                patientBirthMonth: '',
                isDiabetic: false,
                existingPatientId: null,
                bookingObservations: '',
              });
              setCurrentPatientForHistory(null);
              setShowPatientHistory(false);
              onOpenChange(false);
            }}>Cancelar</Button>
          </DialogClose>
          <Button type="submit" onClick={form.handleSubmit(onSubmit)} disabled={isLoading || isLoadingServices || servicesList.length === 0}>
            {(isLoading || isLoadingServices) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {initialData?.patientFirstName ? 'Actualizar Cita' : 'Agendar Cita'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

