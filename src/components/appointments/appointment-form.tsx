
"use client";

import React, { useState, useEffect } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { AppointmentFormSchema, type AppointmentFormData as FormSchemaType } from '@/lib/schemas';
import type { LocationId, ServiceId } from '@/lib/constants';
import type { Professional, Patient, Service } from '@/types';
import { useAuth } from '@/contexts/auth-provider';
import { useAppState } from '@/contexts/app-state-provider';
import { USER_ROLES, LOCATIONS, SERVICES, TIME_SLOTS } from '@/lib/constants';
import { getProfessionals, getServices, addAppointment, getPatientById } from '@/lib/data';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { CalendarIcon, ClockIcon, UserPlus, Building, Briefcase, ConciergeBell, Edit3, Loader2 } from 'lucide-react';
import { format, parse } from 'date-fns';
import { es } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { PatientSearchField } from './patient-search-field';
import { PatientHistoryPanel } from './patient-history-panel'; 
import { AttendancePredictionTool } from './attendance-prediction-tool'; 
import { useToast } from '@/hooks/use-toast';


interface AppointmentFormProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onAppointmentCreated: () => void; // Callback after successful creation
  initialData?: Partial<FormSchemaType>; // For editing, not fully implemented yet
  defaultDate?: Date;
}

const ANY_PROFESSIONAL_VALUE = "_any_professional_placeholder_";

export function AppointmentForm({ isOpen, onOpenChange, onAppointmentCreated, initialData, defaultDate }: AppointmentFormProps) {
  const { user } = useAuth();
  const { selectedLocationId: adminSelectedLocation } = useAppState();
  const { toast } = useToast();

  const [professionals, setProfessionals] = useState<Professional[]>([]);
  const [services, setServicesList] = useState<Service[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showPatientHistory, setShowPatientHistory] = useState(false);
  const [currentPatientForHistory, setCurrentPatientForHistory] = useState<Patient | null>(null);

  const isAdminOrContador = user?.role === USER_ROLES.ADMIN || user?.role === USER_ROLES.CONTADOR;
  const defaultLocation = user?.role === USER_ROLES.LOCATION_STAFF 
    ? user.locationId 
    : (isAdminOrContador && adminSelectedLocation && adminSelectedLocation !== 'all' 
        ? adminSelectedLocation 
        : (isAdminOrContador ? LOCATIONS[0].id : undefined) // if admin/contador & 'all' selected, default to first location
    );


  const form = useForm<FormSchemaType>({
    resolver: zodResolver(AppointmentFormSchema),
    defaultValues: {
      patientFirstName: initialData?.patientFirstName || '',
      patientLastName: initialData?.patientLastName || '',
      patientPhone: initialData?.patientPhone || '',
      patientEmail: initialData?.patientEmail || '',
      existingPatientId: initialData?.existingPatientId || null,
      locationId: initialData?.locationId || defaultLocation || LOCATIONS[0].id,
      serviceId: initialData?.serviceId || SERVICES[0].id,
      appointmentDate: initialData?.appointmentDate || defaultDate || new Date(),
      appointmentTime: initialData?.appointmentTime || TIME_SLOTS[4], // Default to 10:00 AM
      preferredProfessionalId: initialData?.preferredProfessionalId || ANY_PROFESSIONAL_VALUE,
      bookingObservations: initialData?.bookingObservations || '',
    },
  });
  
  const watchLocationId = form.watch('locationId');
  const watchExistingPatientId = form.watch('existingPatientId');

  useEffect(() => {
    async function loadData() {
      const servicesData = await getServices();
      setServicesList(servicesData);
    }
    loadData();
  }, []);

  useEffect(() => {
    async function loadProfessionals(location: LocationId) {
      const profs = await getProfessionals(location);
      setProfessionals(profs);
    }
    if (watchLocationId) {
      loadProfessionals(watchLocationId as LocationId);
    }
  }, [watchLocationId]);

  useEffect(() => {
    // When existingPatientId changes, fetch patient details for history panel
    async function fetchAndSetPatientForHistory(patientId: string) {
      const patient = await getPatientById(patientId);
      setCurrentPatientForHistory(patient || null);
      setShowPatientHistory(!!patient);
    }
    if (watchExistingPatientId) {
      fetchAndSetPatientForHistory(watchExistingPatientId);
    } else {
      setCurrentPatientForHistory(null);
      setShowPatientHistory(false);
    }
  }, [watchExistingPatientId]);


  const handlePatientSelect = (patient: Patient | null) => {
    if (patient) {
      form.setValue('existingPatientId', patient.id);
      form.setValue('patientFirstName', patient.firstName);
      form.setValue('patientLastName', patient.lastName);
      form.setValue('patientPhone', patient.phone || '');
      form.setValue('patientEmail', patient.email || '');
      setCurrentPatientForHistory(patient);
      setShowPatientHistory(true);
    } else {
      form.setValue('existingPatientId', null);
      setCurrentPatientForHistory(null);
      setShowPatientHistory(false);
    }
  };


  async function onSubmit(data: FormSchemaType) {
    setIsLoading(true);
    try {
      const submitData = {
        ...data,
        preferredProfessionalId: data.preferredProfessionalId === ANY_PROFESSIONAL_VALUE ? null : data.preferredProfessionalId,
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
        locationId: data.locationId, // Keep the selected location for the next booking in this session
        serviceId: SERVICES[0].id, 
        appointmentTime: TIME_SLOTS[4], 
        preferredProfessionalId: ANY_PROFESSIONAL_VALUE,
        patientFirstName: '',
        patientLastName: '',
        patientPhone: '',
        patientEmail: '',
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
          serviceId: SERVICES[0].id,
          appointmentTime: TIME_SLOTS[4], 
          preferredProfessionalId: ANY_PROFESSIONAL_VALUE,
          patientFirstName: '',
          patientLastName: '',
          patientPhone: '',
          patientEmail: '',
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
                          form.setValue('patientEmail', '');
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
                        <FormControl><Input type="tel" placeholder="Ej: 987654321" {...field} disabled={!!form.getValues("existingPatientId")} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="patientEmail"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Email (Opcional)</FormLabel>
                        <FormControl><Input type="email" placeholder="Ej: juan.perez@mail.com" {...field} disabled={!!form.getValues("existingPatientId")} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

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
                      <Select onValueChange={field.onChange} value={field.value} disabled={user?.role === USER_ROLES.LOCATION_STAFF && !isAdminOrContador}>
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
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger><SelectValue placeholder="Seleccionar servicio" /></SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {services.map(serv => (
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
                        <Select onValueChange={field.onChange} value={field.value}>
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
                      >
                        <FormControl>
                          <SelectTrigger><SelectValue placeholder="Cualquier profesional" /></SelectTrigger>
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
                serviceId: SERVICES[0].id,
                appointmentTime: TIME_SLOTS[4], 
                preferredProfessionalId: ANY_PROFESSIONAL_VALUE,
                patientFirstName: '',
                patientLastName: '',
                patientPhone: '',
                patientEmail: '',
                existingPatientId: null,
                bookingObservations: '',
              }); 
              setCurrentPatientForHistory(null);
              setShowPatientHistory(false);
              onOpenChange(false);
            }}>Cancelar</Button>
          </DialogClose>
          <Button type="submit" onClick={form.handleSubmit(onSubmit)} disabled={isLoading}>
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {initialData?.patientFirstName ? 'Actualizar Cita' : 'Agendar Cita'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

