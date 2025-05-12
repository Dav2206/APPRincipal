
"use client";

import type { Appointment, Service, AppointmentStatus, Professional } from '@/types';
import { APPOINTMENT_STATUS, PAYMENT_METHODS, USER_ROLES, APPOINTMENT_STATUS_DISPLAY, LOCATIONS, TIME_SLOTS } from '@/lib/constants';
import { format, parseISO, setHours, setMinutes } from 'date-fns';
import { es } from 'date-fns/locale';
import { CameraIcon, Loader2, PlusCircle, Trash2, ShoppingBag, ConciergeBell, Clock, CalendarIcon as CalendarIconLucide } from 'lucide-react';
import { useAuth } from '@/contexts/auth-provider';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { AppointmentUpdateSchema } from '@/lib/schemas';
import { Form, FormControl, FormItem, FormLabel, FormMessage, FormField } from "@/components/ui/form";
import { getProfessionals, updateAppointment as updateAppointmentData, getServices } from '@/lib/data';
import React, { useState, useEffect, useRef } from 'react';
import { useToast } from '@/hooks/use-toast';
import Image from 'next/image';
import { cn } from '@/lib/utils';

interface AppointmentEditDialogProps {
  appointment: Appointment;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onAppointmentUpdated: (updatedAppointment: Appointment) => void;
}

type AppointmentUpdateFormData = Zod.infer<typeof AppointmentUpdateSchema>;

const NO_SELECTION_PLACEHOLDER = "_no_selection_placeholder_";
const DEFAULT_SERVICE_ID_PLACEHOLDER = "_default_service_id_placeholder_";


const fileToDataUri = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};

export function AppointmentEditDialog({ appointment, isOpen, onOpenChange, onAppointmentUpdated }: AppointmentEditDialogProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [professionals, setProfessionals] = useState<Professional[]>([]);
  const [allServices, setAllServices] = useState<Service[]>([]);
  const [isSubmittingForm, setIsSubmittingForm] = useState(false); 
  const fileInputRef = useRef<HTMLInputElement>(null);

  const form = useForm<AppointmentUpdateFormData>({
    resolver: zodResolver(AppointmentUpdateSchema),
  });

  const { fields: addedServiceFields, append: appendAddedService, remove: removeAddedService } = useFieldArray({
    control: form.control,
    name: "addedServices",
  });

  const { fields: attachedPhotoFields, append: appendAttachedPhoto, remove: removeAttachedPhoto } = useFieldArray({
    control: form.control,
    name: "attachedPhotos",
  });
  
  useEffect(() => {
    if (isOpen && appointment) {
      const initialDurationMinutes = appointment.durationMinutes || appointment.service?.defaultDuration || 0;
      const appointmentDateTime = parseISO(appointment.appointmentDateTime);
      form.reset({
        status: appointment.status,
        serviceId: appointment.serviceId || (allServices.length > 0 ? allServices[0].id : DEFAULT_SERVICE_ID_PLACEHOLDER),
        appointmentDate: appointmentDateTime,
        appointmentTime: format(appointmentDateTime, 'HH:mm'),
        actualArrivalTime: appointment.actualArrivalTime || format(new Date(), 'HH:mm'),
        professionalId: appointment.professionalId || NO_SELECTION_PLACEHOLDER,
        durationMinutes: initialDurationMinutes,
        paymentMethod: appointment.paymentMethod || undefined,
        amountPaid: appointment.amountPaid || undefined,
        staffNotes: appointment.staffNotes || '',
        attachedPhotos: appointment.attachedPhotos?.filter(p => typeof p === 'string' && p.startsWith("data:image/")) || [],
        addedServices: appointment.addedServices?.map(as => ({
          serviceId: as.serviceId || (allServices.length > 0 ? allServices[0].id : DEFAULT_SERVICE_ID_PLACEHOLDER),
          professionalId: as.professionalId || NO_SELECTION_PLACEHOLDER,
          price: as.price ?? undefined,
        })) || [],
      });
    }
  }, [appointment, form, isOpen, allServices]);


  useEffect(() => {
    async function loadPrerequisites() {
      const isAdminOrContador = user?.role === USER_ROLES.ADMIN || user?.role === USER_ROLES.CONTADOR;
      if (user?.locationId || isAdminOrContador) {
        const locationForProfs = appointment.locationId || (isAdminOrContador ? undefined : user.locationId);
        if (locationForProfs){
            const profs = await getProfessionals(locationForProfs);
            setProfessionals(profs);
        } else if (isAdminOrContador) { 
             const allProfsPromises = LOCATIONS.map(loc => getProfessionals(loc.id));
             const allProfsResults = await Promise.all(allProfsPromises);
             setProfessionals(allProfsResults.flat());
        }
        const servicesData = await getServices();
        setAllServices(servicesData?.services || []); // Ensure allServices is always an array

        // Reset addedServices and main serviceId with proper default serviceId if needed after services are loaded
        if (appointment) {
          const currentServices = servicesData?.services || [];
          if (form.getValues('serviceId') === DEFAULT_SERVICE_ID_PLACEHOLDER && currentServices.length > 0) {
            form.setValue('serviceId', appointment.serviceId || currentServices[0].id);
          }
          if (appointment.addedServices) {
            form.setValue('addedServices', appointment.addedServices.map(as => ({
              serviceId: as.serviceId || (currentServices.length > 0 ? currentServices[0].id : DEFAULT_SERVICE_ID_PLACEHOLDER),
              professionalId: as.professionalId || NO_SELECTION_PLACEHOLDER,
              price: as.price ?? undefined,
            })));
          }
        }
      }
    }
    if (isOpen) {
      loadPrerequisites();
    }
  }, [isOpen, user, appointment, form]); 

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files) {
      setIsSubmittingForm(true); 
      try {
        const currentPhotos = form.getValues("attachedPhotos") || [];
        const newPhotoPromises = Array.from(files).map(fileToDataUri);
        const newDataUris = await Promise.all(newPhotoPromises);
        const validNewDataUris = newDataUris.filter(uri => typeof uri === 'string' && uri.startsWith("data:image/"));
        // Filter out any empty strings or invalid values before setting
        const updatedPhotos = [...currentPhotos.filter(p => p && p.startsWith("data:image/")), ...validNewDataUris];
        form.setValue("attachedPhotos", updatedPhotos, { shouldValidate: true });
      } catch (error) {
        toast({ title: "Error al cargar imagen", description: "No se pudo procesar la imagen.", variant: "destructive"});
      } finally {
        setIsSubmittingForm(false);
        if(fileInputRef.current) fileInputRef.current.value = ""; 
      }
    }
  };

  const onSubmitUpdate = async (data: AppointmentUpdateFormData) => {
    setIsSubmittingForm(true);
    try {
      let finalAppointmentDateTime = parseISO(appointment.appointmentDateTime);
      if (data.appointmentDate && data.appointmentTime) {
        const [hours, minutes] = data.appointmentTime.split(':').map(Number);
        finalAppointmentDateTime = setMinutes(setHours(data.appointmentDate, hours), minutes);
      } else if (data.appointmentDate) {
        // Keep original time if only date is changed
        const originalTime = parseISO(appointment.appointmentDateTime);
        finalAppointmentDateTime = setMinutes(setHours(data.appointmentDate, originalTime.getHours()), originalTime.getMinutes());
      }


      const updatedData: Partial<Appointment> = {
        ...data,
        appointmentDateTime: format(finalAppointmentDateTime, "yyyy-MM-dd'T'HH:mm:ss'Z'"),
        serviceId: data.serviceId === DEFAULT_SERVICE_ID_PLACEHOLDER && allServices.length > 0 ? allServices[0].id : data.serviceId,
        professionalId: data.professionalId === NO_SELECTION_PLACEHOLDER ? null : data.professionalId,
        durationMinutes: data.durationMinutes ? parseInt(String(data.durationMinutes), 10) : undefined,
        amountPaid: data.amountPaid ? parseFloat(String(data.amountPaid)) : undefined,
        attachedPhotos: (data.attachedPhotos || []).filter(photo => photo && typeof photo === 'string' && photo.startsWith("data:image/")),
        addedServices: data.addedServices?.map(as => ({
          ...as,
          serviceId: as.serviceId === DEFAULT_SERVICE_ID_PLACEHOLDER ? (allServices.length > 0 ? allServices[0].id : '') : as.serviceId, 
          professionalId: as.professionalId === NO_SELECTION_PLACEHOLDER ? null : as.professionalId,
          price: as.price ? parseFloat(String(as.price)) : null,
        })),
      };
      
      const result = await updateAppointmentData(appointment.id, updatedData);
      if (result) {
        onAppointmentUpdated(result); 
        toast({ title: "Cita Actualizada", description: "Los detalles de la cita han sido actualizados." });
        onOpenChange(false); 
      } else {
        toast({ title: "Error", description: "No se pudo actualizar la cita.", variant: "destructive" });
      }
    } catch (error) {
      console.error("Error updating appointment:", error);
      toast({ title: "Error", description: "Ocurrió un error inesperado.", variant: "destructive" });
    } finally {
      setIsSubmittingForm(false);
    }
  };
  
  if (!isOpen) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Actualizar Cita</DialogTitle>
          <DialogDescription>
            Actualizar estado y detalles de la cita para {appointment.patient?.firstName} {appointment.patient?.lastName}.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmitUpdate)} className="space-y-4 py-4 max-h-[70vh] overflow-y-auto pr-2">
          <FormField
            control={form.control}
            name="status"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Estado de la Cita</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger id="status">
                      <SelectValue placeholder="Seleccionar estado" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {Object.entries(APPOINTMENT_STATUS_DISPLAY).map(([key, value]) => (
                      <SelectItem key={key} value={key as AppointmentStatus} className="capitalize">{value}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage/>
              </FormItem>
            )}
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="appointmentDate"
              render={({ field }) => (
                <FormItem className="flex flex-col">
                  <FormLabel className="flex items-center gap-1"><CalendarIconLucide size={16}/>Fecha de la Cita</FormLabel>
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
                          <CalendarIconLucide className="ml-auto h-4 w-4 opacity-50" />
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
                  <FormLabel className="flex items-center gap-1"><Clock size={16}/>Hora de la Cita</FormLabel>
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
          
          <FormField
            control={form.control}
            name="serviceId"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="flex items-center gap-1"><ConciergeBell size={16}/>Motivo de la Reserva (Servicio Principal)</FormLabel>
                <Select 
                  onValueChange={field.onChange} 
                  value={field.value === DEFAULT_SERVICE_ID_PLACEHOLDER && allServices.length > 0 ? allServices[0].id : field.value} 
                  disabled={allServices.length === 0}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder={allServices.length > 0 ? "Seleccionar servicio" : "Cargando servicios..."} />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {allServices.length === 0 && <SelectItem value={DEFAULT_SERVICE_ID_PLACEHOLDER} disabled>Cargando...</SelectItem>}
                    {allServices.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />


          {form.watch('status') === APPOINTMENT_STATUS.CONFIRMED && (
            <FormField
              control={form.control}
              name="actualArrivalTime"
              render={({ field }) => (
                <FormItem>
                  <FormLabel htmlFor="actualArrivalTime">Hora Real de Llegada (HH:MM)</FormLabel>
                  <FormControl><Input id="actualArrivalTime" type="time" {...field} value={field.value || ''} /></FormControl>
                   <FormMessage/>
                </FormItem>
              )}
            />
          )}
          
          {(form.watch('status') === APPOINTMENT_STATUS.CONFIRMED || form.watch('status') === APPOINTMENT_STATUS.COMPLETED) && (
            <FormField
              control={form.control}
              name="professionalId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel htmlFor="professionalId">Profesional que Atendió</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value || NO_SELECTION_PLACEHOLDER}>
                    <FormControl>
                      <SelectTrigger id="professionalId">
                        <SelectValue placeholder="Seleccionar profesional" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value={NO_SELECTION_PLACEHOLDER}>Sin asignar / Como estaba</SelectItem>
                      {professionals.map(p => (
                        <SelectItem key={p.id} value={p.id}>{p.firstName} {p.lastName}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                   <FormMessage/>
                </FormItem>
              )}
            />
          )}

          {form.watch('status') === APPOINTMENT_STATUS.COMPLETED && (
            <>
              <FormField
                control={form.control}
                name="durationMinutes"
                render={({ field }) => {
                  const totalMinutes = field.value || 0;
                  const currentHours = Math.floor(totalMinutes / 60);
                  const currentMinutesInPart = totalMinutes % 60;

                  const handleHoursChange = (e: React.ChangeEvent<HTMLInputElement>) => {
                    const newHours = parseInt(e.target.value, 10) || 0;
                    field.onChange((newHours * 60) + currentMinutesInPart);
                  };

                  const handleMinutesChange = (e: React.ChangeEvent<HTMLInputElement>) => {
                    let newMinutes = parseInt(e.target.value, 10) || 0;
                    if (newMinutes < 0) newMinutes = 0;
                    if (newMinutes > 59) newMinutes = 59; // Cap minutes at 59
                    field.onChange((currentHours * 60) + newMinutes);
                  };

                  return (
                    <FormItem>
                      <FormLabel htmlFor="durationHours">Duración Real</FormLabel>
                      <div className="flex gap-2 items-center">
                        <div className="flex-1">
                          <FormControl>
                            <Input
                              id="durationHours"
                              type="number"
                              min="0"
                              value={currentHours}
                              onChange={handleHoursChange}
                              placeholder="Horas"
                            />
                          </FormControl>
                          <FormMessage className="text-xs">Horas</FormMessage>
                        </div>
                        <div className="flex-1">
                           <FormControl>
                            <Input
                              id="durationMinutesPart"
                              type="number"
                              min="0"
                              max="59"
                              step="1"
                              value={currentMinutesInPart}
                              onChange={handleMinutesChange}
                              placeholder="Minutos"
                            />
                          </FormControl>
                          <FormMessage className="text-xs">Minutos</FormMessage>
                        </div>
                      </div>
                       <FormMessage>{form.formState.errors.durationMinutes?.message}</FormMessage>
                    </FormItem>
                  );
                }}
              />
              <FormField
                control={form.control}
                name="paymentMethod"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel htmlFor="paymentMethod">Método de Pago</FormLabel>
                     <Select onValueChange={field.onChange} value={field.value || undefined}>
                      <FormControl>
                        <SelectTrigger id="paymentMethod">
                          <SelectValue placeholder="Seleccionar método de pago" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {PAYMENT_METHODS.map(method => (
                          <SelectItem key={method} value={method}>{method}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                     <FormMessage/>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="amountPaid"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel htmlFor="amountPaid">Monto Pagado (S/)</FormLabel>
                    <FormControl><Input id="amountPaid" type="number" step="0.01" {...field} value={field.value || ''} onChange={e => field.onChange(parseFloat(e.target.value) || undefined)} /></FormControl>
                     <FormMessage/>
                  </FormItem>
                )}
              />
            </>
          )}
           <FormField
              control={form.control}
              name="staffNotes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel htmlFor="staffNotes">Notas del Staff (Internas)</FormLabel>
                  <FormControl><Textarea id="staffNotes" placeholder="Añadir observaciones sobre la cita..." {...field} value={field.value || ''} /></FormControl>
                   <FormMessage/>
                </FormItem>
              )}
            />

          {(form.watch('status') === APPOINTMENT_STATUS.CONFIRMED || form.watch('status') === APPOINTMENT_STATUS.COMPLETED) && (
            <div className="space-y-3 pt-3 mt-3 border-t">
              <h4 className="text-md font-semibold flex items-center gap-2"><CameraIcon/> Fotos Adjuntas</h4>
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                {attachedPhotoFields.map((item, index) => (
                  item.value && typeof item.value === 'string' && item.value.startsWith("data:image/") ? ( 
                    <div key={item.id} className="relative group">
                      <Image src={item.value} alt={`Foto adjunta ${index + 1}`} width={80} height={80} className="rounded object-cover aspect-square border" data-ai-hint="medical image" />
                      <Button
                        type="button"
                        variant="destructive"
                        size="icon"
                        className="absolute top-1 right-1 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={() => removeAttachedPhoto(index)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  ) : null
                ))}
              </div>
              <Input 
                  type="file" 
                  multiple 
                  accept="image/*" 
                  onChange={handleFileChange}
                  ref={fileInputRef}
                  className="text-sm"
                  disabled={isSubmittingForm}
               />
               {isSubmittingForm && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
               <FormField control={form.control} name="attachedPhotos" render={() => <FormMessage />} />
            </div>
          )}

          {(form.watch('status') === APPOINTMENT_STATUS.CONFIRMED || form.watch('status') === APPOINTMENT_STATUS.COMPLETED) && (
            <div className="space-y-3 pt-3 mt-3 border-t">
              <div className="flex justify-between items-center">
                <h4 className="text-md font-semibold flex items-center gap-2"><ShoppingBag/> Servicios Adicionales</h4>
                <Button type="button" size="sm" variant="outline" onClick={() => appendAddedService({ serviceId: allServices.length > 0 ? allServices[0].id : DEFAULT_SERVICE_ID_PLACEHOLDER, professionalId: NO_SELECTION_PLACEHOLDER, price: undefined })}>
                  <PlusCircle className="mr-2 h-4 w-4" /> Agregar Servicio
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
                        <FormLabel>Servicio Adicional</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value === DEFAULT_SERVICE_ID_PLACEHOLDER && allServices.length > 0 ? allServices[0].id : field.value } disabled={allServices.length === 0}>
                          <FormControl><SelectTrigger><SelectValue placeholder={allServices.length > 0 ? "Seleccionar servicio" : "Cargando..."} /></SelectTrigger></FormControl>
                          <SelectContent>
                             {allServices.length === 0 && <SelectItem value={DEFAULT_SERVICE_ID_PLACEHOLDER} disabled>Cargando...</SelectItem>}
                            {allServices.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
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
                        <FormLabel>Profesional (Opcional)</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value || NO_SELECTION_PLACEHOLDER}>
                         <FormControl><SelectTrigger><SelectValue placeholder="Mismo prof. / Cualquiera" /></SelectTrigger></FormControl>
                          <SelectContent>
                            <SelectItem value={NO_SELECTION_PLACEHOLDER}>Mismo prof. / Cualquiera</SelectItem>
                            {professionals.map(p => <SelectItem key={p.id} value={p.id}>{p.firstName} {p.lastName}</SelectItem>)}
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
                        <FormLabel>Precio (S/) (Opcional)</FormLabel>
                        <FormControl><Input type="number" step="0.01" placeholder="Ej: 50.00" {...field} value={field.value || ''} onChange={e => field.onChange(parseFloat(e.target.value) || null)} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              ))}
            </div>
          )}


          <DialogFooter className="pt-4">
            <DialogClose asChild>
              <Button type="button" variant="outline">Cancelar</Button>
            </DialogClose>
            <Button type="submit" disabled={isSubmittingForm || (allServices && allServices.length === 0)}>
              {isSubmittingForm && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Guardar Cambios
            </Button>
          </DialogFooter>
        </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

