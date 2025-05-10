
"use client";

import type { Appointment } from '@/types';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { APPOINTMENT_STATUS, USER_ROLES, PAYMENT_METHODS, SERVICES as ALL_SERVICES } from '@/lib/constants';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { CalendarIcon, ClockIcon, UserIcon, StethoscopeIcon, DollarSignIcon, EditIcon, CheckCircle2, XCircle, AlertTriangle, Info, Loader2 } from 'lucide-react';
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
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { AppointmentUpdateSchema } from '@/lib/schemas';
import { FormField } from '@/components/ui/form'; // Added import
import type { Professional } from '@/types';
import { getProfessionals, updateAppointment as updateAppointmentData } from '@/lib/data';
import React, { useState, useEffect } from 'react';
import { useToast } from '@/hooks/use-toast';


interface AppointmentCardProps {
  appointment: Appointment;
  onUpdate: (updatedAppointment: Appointment) => void;
}

type AppointmentUpdateFormData = Zod.infer<typeof AppointmentUpdateSchema>;

export function AppointmentCard({ appointment, onUpdate }: AppointmentCardProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [isUpdateModalOpen, setIsUpdateModalOpen] = useState(false);
  const [professionals, setProfessionals] = useState<Professional[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const form = useForm<AppointmentUpdateFormData>({
    resolver: zodResolver(AppointmentUpdateSchema),
    defaultValues: {
      status: appointment.status,
      actualArrivalTime: appointment.actualArrivalTime || '',
      professionalId: appointment.professionalId || null,
      durationMinutes: appointment.durationMinutes || appointment.service?.defaultDuration,
      paymentMethod: appointment.paymentMethod || undefined,
      amountPaid: appointment.amountPaid || undefined,
      staffNotes: appointment.staffNotes || '',
    },
  });
  
  useEffect(() => {
    form.reset({
      status: appointment.status,
      actualArrivalTime: appointment.actualArrivalTime || format(new Date(), 'HH:mm'),
      professionalId: appointment.professionalId || null,
      durationMinutes: appointment.durationMinutes || appointment.service?.defaultDuration,
      paymentMethod: appointment.paymentMethod || undefined,
      amountPaid: appointment.amountPaid || undefined,
      staffNotes: appointment.staffNotes || '',
    });
  }, [appointment, form]);


  useEffect(() => {
    async function loadProfessionals() {
      if (user?.locationId || user?.role === USER_ROLES.ADMIN) {
        // For admin, ideally, this should be professionals of appointment.locationId
        // For simplicity, if admin, might load all or based on a selected context
        const profs = await getProfessionals(appointment.locationId);
        setProfessionals(profs);
      }
    }
    if (isUpdateModalOpen) {
      loadProfessionals();
    }
  }, [isUpdateModalOpen, user, appointment.locationId]);

  const appointmentDate = parseISO(appointment.appointmentDateTime);

  const getStatusBadgeVariant = (status: string) => {
    switch (status) {
      case APPOINTMENT_STATUS.BOOKED: return 'default';
      case APPOINTMENT_STATUS.CONFIRMED: return 'default'; // could be different e.g. blue
      case APPOINTMENT_STATUS.COMPLETED: return 'default'; // custom variant, using success style in Badge component directly
      case APPOINTMENT_STATUS.CANCELLED_CLIENT:
      case APPOINTMENT_STATUS.CANCELLED_STAFF:
      case APPOINTMENT_STATUS.NO_SHOW: return 'destructive';
      default: return 'secondary';
    }
  };

  const handleOpenUpdateModal = () => {
    setIsUpdateModalOpen(true);
  };

  const onSubmitUpdate = async (data: AppointmentUpdateFormData) => {
    setIsLoading(true);
    try {
      const updatedData: Partial<Appointment> = {
        ...data,
        professionalId: data.professionalId === "NO_SELECTION_PLACEHOLDER" ? undefined : data.professionalId,
        // Ensure numbers are numbers, not strings from form
        durationMinutes: data.durationMinutes ? parseInt(String(data.durationMinutes), 10) : undefined,
        amountPaid: data.amountPaid ? parseFloat(String(data.amountPaid)) : undefined,
      };
      
      const result = await updateAppointmentData(appointment.id, updatedData);
      if (result) {
        onUpdate(result);
        toast({ title: "Cita Actualizada", description: "Los detalles de la cita han sido actualizados." });
        setIsUpdateModalOpen(false);
      } else {
        toast({ title: "Error", description: "No se pudo actualizar la cita.", variant: "destructive" });
      }
    } catch (error) {
      console.error("Error updating appointment:", error);
      toast({ title: "Error", description: "Ocurrió un error inesperado.", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };
  

  return (
    <>
      <Card className="w-full shadow-lg hover:shadow-xl transition-shadow duration-300">
        <CardHeader>
          <div className="flex justify-between items-start">
            <div>
              <CardTitle className="text-lg flex items-center gap-2">
                <UserIcon className="text-primary" /> 
                {appointment.patient?.firstName} {appointment.patient?.lastName}
              </CardTitle>
              <CardDescription>{appointment.service?.name}</CardDescription>
            </div>
            <Badge 
              variant={getStatusBadgeVariant(appointment.status)} 
              className={`capitalize text-xs h-fit ${appointment.status === APPOINTMENT_STATUS.COMPLETED ? 'bg-green-600 text-white' : '' }`}
            >
              {appointment.status.replace('_', ' ')}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="flex items-center gap-2 text-muted-foreground">
            <CalendarIcon className="h-4 w-4" />
            <span>{format(appointmentDate, "PPP", { locale: es })}</span>
          </div>
          <div className="flex items-center gap-2 text-muted-foreground">
            <ClockIcon className="h-4 w-4" />
            <span>{format(appointmentDate, "p", { locale: es })} - Duración: {appointment.durationMinutes} min</span>
          </div>
          {appointment.professional && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <StethoscopeIcon className="h-4 w-4" />
              <span>Atendido por: {appointment.professional.firstName} {appointment.professional.lastName}</span>
            </div>
          )}
          {appointment.preferredProfessionalId && !appointment.professionalId && (
             <div className="flex items-center gap-2 text-muted-foreground">
              <StethoscopeIcon className="h-4 w-4 text-amber-600" />
              <span className="text-amber-700">Prefiere a: {professionals.find(p=>p.id === appointment.preferredProfessionalId)?.firstName || 'Profesional especificado'}</span>
            </div>
          )}
          {appointment.bookingObservations && (
            <div className="flex items-start gap-2 text-muted-foreground pt-1">
              <Info className="h-4 w-4 mt-0.5 shrink-0" />
              <p className="text-xs italic">Obs. Reserva: {appointment.bookingObservations}</p>
            </div>
          )}
          {appointment.status === APPOINTMENT_STATUS.COMPLETED && appointment.amountPaid && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <DollarSignIcon className="h-4 w-4 text-green-600" />
              <span className="text-green-700">Pagado: S/ {appointment.amountPaid.toFixed(2)} ({appointment.paymentMethod})</span>
            </div>
          )}
           {appointment.staffNotes && (
            <div className="flex items-start gap-2 text-muted-foreground pt-1">
              <EditIcon className="h-4 w-4 mt-0.5 shrink-0 text-blue-600" />
              <p className="text-xs italic text-blue-700">Nota Staff: {appointment.staffNotes}</p>
            </div>
          )}

        </CardContent>
        {user && (user.role === USER_ROLES.LOCATION_STAFF && user.locationId === appointment.locationId) || user.role === USER_ROLES.ADMIN ? (
          <CardFooter>
            <Button variant="outline" size="sm" onClick={handleOpenUpdateModal} className="w-full">
              <EditIcon className="mr-2 h-4 w-4" /> Actualizar Cita
            </Button>
          </CardFooter>
        ) : null}
      </Card>

      <Dialog open={isUpdateModalOpen} onOpenChange={setIsUpdateModalOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Actualizar Cita</DialogTitle>
            <DialogDescription>
              Actualizar estado y detalles de la cita para {appointment.patient?.firstName} {appointment.patient?.lastName}.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={form.handleSubmit(onSubmitUpdate)} className="space-y-4 py-4 max-h-[70vh] overflow-y-auto pr-2">
            <FormField
              control={form.control}
              name="status"
              render={({ field }) => (
                <div className="space-y-1">
                  <Label htmlFor="status">Estado de la Cita</Label>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <SelectTrigger id="status">
                      <SelectValue placeholder="Seleccionar estado" />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.values(APPOINTMENT_STATUS).map(s => (
                        <SelectItem key={s} value={s} className="capitalize">{s.replace('_', ' ')}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            />

            {form.watch('status') === APPOINTMENT_STATUS.CONFIRMED && (
              <FormField
                control={form.control}
                name="actualArrivalTime"
                render={({ field }) => (
                  <div className="space-y-1">
                    <Label htmlFor="actualArrivalTime">Hora Real de Llegada (HH:MM)</Label>
                    <Input id="actualArrivalTime" type="time" {...field} value={field.value || ''} />
                  </div>
                )}
              />
            )}
            
            {(form.watch('status') === APPOINTMENT_STATUS.CONFIRMED || form.watch('status') === APPOINTMENT_STATUS.COMPLETED) && (
              <FormField
                control={form.control}
                name="professionalId"
                render={({ field }) => (
                  <div className="space-y-1">
                    <Label htmlFor="professionalId">Profesional que Atendió</Label>
                    <Select onValueChange={field.onChange} value={field.value || "NO_SELECTION_PLACEHOLDER"}>
                      <SelectTrigger id="professionalId">
                        <SelectValue placeholder="Seleccionar profesional" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="NO_SELECTION_PLACEHOLDER">Sin asignar / Como estaba</SelectItem>
                        {professionals.map(p => (
                          <SelectItem key={p.id} value={p.id}>{p.firstName} {p.lastName}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              />
            )}

            {form.watch('status') === APPOINTMENT_STATUS.COMPLETED && (
              <>
                <FormField
                  control={form.control}
                  name="durationMinutes"
                  render={({ field }) => (
                    <div className="space-y-1">
                      <Label htmlFor="durationMinutes">Duración Real (minutos)</Label>
                      <Input id="durationMinutes" type="number" {...field} value={field.value || ''} onChange={e => field.onChange(parseInt(e.target.value,10) || undefined)} />
                    </div>
                  )}
                />
                <FormField
                  control={form.control}
                  name="paymentMethod"
                  render={({ field }) => (
                    <div className="space-y-1">
                      <Label htmlFor="paymentMethod">Método de Pago</Label>
                       <Select onValueChange={field.onChange} value={field.value || undefined}>
                        <SelectTrigger id="paymentMethod">
                          <SelectValue placeholder="Seleccionar método de pago" />
                        </SelectTrigger>
                        <SelectContent>
                          {PAYMENT_METHODS.map(method => (
                            <SelectItem key={method} value={method}>{method}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                />
                <FormField
                  control={form.control}
                  name="amountPaid"
                  render={({ field }) => (
                    <div className="space-y-1">
                      <Label htmlFor="amountPaid">Monto Pagado (S/)</Label>
                      <Input id="amountPaid" type="number" step="0.01" {...field} value={field.value || ''} onChange={e => field.onChange(parseFloat(e.target.value) || undefined)} />
                    </div>
                  )}
                />
              </>
            )}
             <FormField
                control={form.control}
                name="staffNotes"
                render={({ field }) => (
                  <div className="space-y-1">
                    <Label htmlFor="staffNotes">Notas del Staff (Internas)</Label>
                    <Textarea id="staffNotes" placeholder="Añadir observaciones sobre la cita..." {...field} value={field.value || ''} />
                  </div>
                )}
              />

            <DialogFooter className="pt-4">
              <DialogClose asChild>
                <Button type="button" variant="outline">Cancelar</Button>
              </DialogClose>
              <Button type="submit" disabled={isLoading}>
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Guardar Cambios
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

// Custom success badge variant (add to globals.css or tailwind.config.js if needed)
// For now, Badge component default variant will be used for 'success'.
// You might want to add this to your tailwind.config.js for a distinct success style:
// theme: { extend: { colors: { success: 'hsl(var(--success))', 'success-foreground': 'hsl(var(--success-foreground))' } } }
// And in globals.css:
// :root { --success: 140 60% 40%; --success-foreground: 0 0% 98%; }
// Then use variant="success" in Badge. For now, this is just a comment.

