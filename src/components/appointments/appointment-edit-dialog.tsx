
"use client";

import type { Appointment, Service, AppointmentStatus, Professional } from '@/types';
import { APPOINTMENT_STATUS, PAYMENT_METHODS, SERVICES as ALL_SERVICES_CONSTANTS, USER_ROLES, APPOINTMENT_STATUS_DISPLAY } from '@/lib/constants';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { CameraIcon, Loader2, PlusCircle, Trash2, ShoppingBag } from 'lucide-react';
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
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { AppointmentUpdateSchema } from '@/lib/schemas';
import { Form, FormControl, FormItem, FormLabel, FormMessage, FormField } from "@/components/ui/form";
import { getProfessionals, updateAppointment as updateAppointmentData, getServices } from '@/lib/data';
import React, { useState, useEffect, useRef } from 'react';
import { useToast } from '@/hooks/use-toast';
import Image from 'next/image';

interface AppointmentEditDialogProps {
  appointment: Appointment;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onAppointmentUpdated: (updatedAppointment: Appointment) => void;
}

type AppointmentUpdateFormData = Zod.infer<typeof AppointmentUpdateSchema>;

const NO_SELECTION_PLACEHOLDER = "_no_selection_placeholder_";

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
  const [isSubmitting, setIsSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const form = useForm<AppointmentUpdateFormData>({
    resolver: zodResolver(AppointmentUpdateSchema),
    // Default values are set in useEffect based on appointment prop
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
      form.reset({
        status: appointment.status,
        actualArrivalTime: appointment.actualArrivalTime || format(new Date(), 'HH:mm'),
        professionalId: appointment.professionalId || NO_SELECTION_PLACEHOLDER,
        durationMinutes: appointment.durationMinutes || appointment.service?.defaultDuration,
        paymentMethod: appointment.paymentMethod || undefined,
        amountPaid: appointment.amountPaid || undefined,
        staffNotes: appointment.staffNotes || '',
        attachedPhotos: appointment.attachedPhotos || [],
        addedServices: appointment.addedServices?.map(as => ({
          serviceId: as.serviceId,
          professionalId: as.professionalId || NO_SELECTION_PLACEHOLDER,
          price: as.price ?? undefined,
        })) || [],
      });
    }
  }, [appointment, form, isOpen]);


  useEffect(() => {
    async function loadPrerequisites() {
      if (user?.locationId || user?.role === USER_ROLES.ADMIN) {
        // Ensure appointment locationId is used, or user's if admin is viewing all
        const locationForProfs = appointment.locationId || (user.role === USER_ROLES.ADMIN ? undefined : user.locationId);
        if (locationForProfs){
            const profs = await getProfessionals(locationForProfs);
            setProfessionals(profs);
        } else {
             const allProfsPromises = LOCATIONS.map(loc => getProfessionals(loc.id));
             const allProfsResults = await Promise.all(allProfsPromises);
             setProfessionals(allProfsResults.flat());
        }
        const servicesData = await getServices();
        setAllServices(servicesData);
      }
    }
    if (isOpen) {
      loadPrerequisites();
    }
  }, [isOpen, user, appointment.locationId]);

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files) {
      setIsSubmitting(true); // Use isSubmitting to indicate file processing
      try {
        const currentPhotos = form.getValues("attachedPhotos") || [];
        const newPhotoPromises = Array.from(files).map(fileToDataUri);
        const newDataUris = await Promise.all(newPhotoPromises);
        // Filter out null/undefined/empty strings before setting
        const validNewDataUris = newDataUris.filter(uri => typeof uri === 'string' && uri.startsWith("data:image/"));
        form.setValue("attachedPhotos", [...currentPhotos, ...validNewDataUris], { shouldValidate: true });
      } catch (error) {
        toast({ title: "Error al cargar imagen", description: "No se pudo procesar la imagen.", variant: "destructive"});
      } finally {
        setIsSubmitting(false);
        if(fileInputRef.current) fileInputRef.current.value = ""; // Reset file input
      }
    }
  };

  const onSubmitUpdate = async (data: AppointmentUpdateFormData) => {
    setIsSubmitting(true);
    try {
      const updatedData: Partial<Appointment> = {
        ...data,
        professionalId: data.professionalId === NO_SELECTION_PLACEHOLDER ? null : data.professionalId,
        durationMinutes: data.durationMinutes ? parseInt(String(data.durationMinutes), 10) : undefined,
        amountPaid: data.amountPaid ? parseFloat(String(data.amountPaid)) : undefined,
        attachedPhotos: (data.attachedPhotos || []).filter(photo => typeof photo === 'string' && photo.startsWith("data:image/")),
        addedServices: data.addedServices?.map(as => ({
          ...as,
          professionalId: as.professionalId === NO_SELECTION_PLACEHOLDER ? null : as.professionalId,
          price: as.price ? parseFloat(String(as.price)) : null,
        })),
      };
      
      const result = await updateAppointmentData(appointment.id, updatedData);
      if (result) {
        onAppointmentUpdated(result); 
        toast({ title: "Cita Actualizada", description: "Los detalles de la cita han sido actualizados." });
        onOpenChange(false); // Close dialog
      } else {
        toast({ title: "Error", description: "No se pudo actualizar la cita.", variant: "destructive" });
      }
    } catch (error) {
      console.error("Error updating appointment:", error);
      toast({ title: "Error", description: "Ocurrió un error inesperado.", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
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
                render={({ field }) => (
                  <FormItem>
                    <FormLabel htmlFor="durationMinutes">Duración Real (minutos)</FormLabel>
                    <FormControl><Input id="durationMinutes" type="number" {...field} value={field.value || ''} onChange={e => field.onChange(parseInt(e.target.value,10) || undefined)} /></FormControl>
                     <FormMessage/>
                  </FormItem>
                )}
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

          {/* Attached Photos Section */}
          {(form.watch('status') === APPOINTMENT_STATUS.CONFIRMED || form.watch('status') === APPOINTMENT_STATUS.COMPLETED) && (
            <div className="space-y-3 pt-3 mt-3 border-t">
              <h4 className="text-md font-semibold flex items-center gap-2"><CameraIcon/> Fotos Adjuntas</h4>
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                {attachedPhotoFields.map((item, index) => (
                  item.value && typeof item.value === 'string' && item.value.startsWith("data:image/") ? ( // Check if item.value is a valid data URI string
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
                  disabled={isSubmitting}
               />
               {isSubmitting && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
               <FormField control={form.control} name="attachedPhotos" render={() => <FormMessage />} />
            </div>
          )}


          {/* Added Services Section */}
          {(form.watch('status') === APPOINTMENT_STATUS.CONFIRMED || form.watch('status') === APPOINTMENT_STATUS.COMPLETED) && (
            <div className="space-y-3 pt-3 mt-3 border-t">
              <div className="flex justify-between items-center">
                <h4 className="text-md font-semibold flex items-center gap-2"><ShoppingBag/> Servicios Adicionales</h4>
                <Button type="button" size="sm" variant="outline" onClick={() => appendAddedService({ serviceId: ALL_SERVICES_CONSTANTS[0].id, professionalId: NO_SELECTION_PLACEHOLDER, price: undefined })}>
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
                        <Select onValueChange={field.onChange} value={field.value || ''}>
                          <FormControl><SelectTrigger><SelectValue placeholder="Seleccionar servicio" /></SelectTrigger></FormControl>
                          <SelectContent>
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
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Guardar Cambios
            </Button>
          </DialogFooter>
        </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
