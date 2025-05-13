
"use client";

import type { Appointment, Service, AppointmentStatus } from '@/types';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { APPOINTMENT_STATUS, USER_ROLES, SERVICES as ALL_SERVICES_CONSTANTS, APPOINTMENT_STATUS_DISPLAY, LOCATIONS } from '@/lib/constants';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { CalendarIcon, ClockIcon, UserIcon, StethoscopeIcon, DollarSignIcon, EditIcon, Info, Paperclip, ShoppingBag, Shuffle } from 'lucide-react';
import { useAuth } from '@/contexts/auth-provider';
import React, { useState, useEffect, useRef } from 'react';
import Image from 'next/image';
import { AppointmentEditDialog } from './appointment-edit-dialog';
import type { Professional } from '@/types';
import { getProfessionals } from '@/lib/data';

import { Form, FormField } from "@/components/ui/form";
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { AppointmentUpdateSchema } from '@/lib/schemas';
import { useToast } from '@/hooks/use-toast';
import { Loader2, CameraIcon, PlusCircle, Trash2 } from 'lucide-react';


interface AppointmentCardProps {
  appointment: Appointment;
  onUpdate: (updatedAppointment: Appointment) => void;
}

type AppointmentUpdateFormData = Zod.infer<typeof AppointmentUpdateSchema>;

const AppointmentCardComponent = ({ appointment, onUpdate }: AppointmentCardProps) => {
  const { user } = useAuth();
  const [isUpdateModalOpen, setIsUpdateModalOpen] = useState(false);
  const [professionalsForDisplay, setProfessionalsForDisplay] = useState<Professional[]>([]);
  const [isLoadingProfessionals, setIsLoadingProfessionals] = useState(false);
  const { toast } = useToast();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploadingImage, setIsUploadingImage] = useState(false);


  const form = useForm<AppointmentUpdateFormData>({
    resolver: zodResolver(AppointmentUpdateSchema),
  });

  useEffect(() => {
    async function loadProfessionals() {
        if (user?.locationId || user?.role === USER_ROLES.ADMIN || user?.role === USER_ROLES.CONTADOR) {
            setIsLoadingProfessionals(true);
            try {
                // If it's an external professional, we might need to fetch from their origin location
                // For simplicity, ensure current location's professionals are always available for dropdowns in edit.
                const profs = await getProfessionals(appointment.locationId);
                setProfessionalsForDisplay(profs);
            } catch (error) {
                console.error("Failed to load professionals for appointment card:", error);
                setProfessionalsForDisplay([]);
            } finally {
                setIsLoadingProfessionals(false);
            }
        }
    }
    loadProfessionals();
  }, [user, appointment.locationId]);


  const appointmentDate = parseISO(appointment.appointmentDateTime);

  const getStatusBadgeVariant = (status: AppointmentStatus) => {
    switch (status) {
      case APPOINTMENT_STATUS.BOOKED: return 'default';
      case APPOINTMENT_STATUS.CONFIRMED: return 'default';
      case APPOINTMENT_STATUS.COMPLETED: return 'default';
      case APPOINTMENT_STATUS.CANCELLED_CLIENT:
      case APPOINTMENT_STATUS.CANCELLED_STAFF:
      case APPOINTMENT_STATUS.NO_SHOW: return 'destructive';
      default: return 'secondary';
    }
  };

  const handleOpenUpdateModal = () => {
    setIsUpdateModalOpen(true);
  };

  const handleAppointmentUpdated = (updatedAppointment: Appointment) => {
    onUpdate(updatedAppointment);
    setIsUpdateModalOpen(false);
  };

  const fileToDataUri = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files) {
      setIsUploadingImage(true);
      try {
        const currentPhotos = form.getValues("attachedPhotos") || [];
        const newPhotoPromises = Array.from(files).map(fileToDataUri);
        const newDataUris = await Promise.all(newPhotoPromises);
        const validNewDataUris = newDataUris.filter(uri => typeof uri === 'string' && uri.startsWith("data:image/"));
        const updatedPhotos = [...currentPhotos.filter(p => p && p.startsWith("data:image/")), ...validNewDataUris];
        form.setValue("attachedPhotos", updatedPhotos, { shouldValidate: true });
      } catch (error) {
        toast({ title: "Error al cargar imagen", description: "No se pudo procesar la imagen.", variant: "destructive"});
      } finally {
        setIsUploadingImage(false);
        if(fileInputRef.current) fileInputRef.current.value = "";
      }
    }
  };


  return (
    <>
      <Card className="w-full shadow-lg hover:shadow-xl transition-shadow duration-300 flex flex-col">
        <CardHeader>
          <div className="flex justify-between items-start">
            <div>
              <CardTitle className="text-lg flex items-center gap-2">
                <UserIcon className="text-primary" />
                {appointment.patient?.firstName} {appointment.patient?.lastName}
              </CardTitle>
              <CardDescription>{appointment.service?.name} <span className="text-xs text-muted-foreground">({LOCATIONS.find(l=>l.id === appointment.locationId)?.name})</span></CardDescription>
            </div>
            <Badge
              variant={getStatusBadgeVariant(appointment.status)}
              className={`capitalize text-xs h-fit ${APPOINTMENT_STATUS_DISPLAY[appointment.status as AppointmentStatus] === APPOINTMENT_STATUS_DISPLAY.Completado ? 'bg-green-600 text-white' : '' }`}
            >
              {APPOINTMENT_STATUS_DISPLAY[appointment.status as AppointmentStatus] || appointment.status}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-3 text-sm flex-grow">
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
              <span>Atendido por: {appointment.professional.firstName} {appointment.professional.lastName}
                {appointment.isExternalProfessional && appointment.externalProfessionalOriginLocationId && (
                  <Badge variant="outline" className="ml-1 text-xs p-1 h-fit bg-orange-100 text-orange-700 border-orange-300">
                    <Shuffle size={12} className="mr-1"/> Traslado: {LOCATIONS.find(l => l.id === appointment.externalProfessionalOriginLocationId)?.name}
                  </Badge>
                )}
              </span>
            </div>
          )}
          {appointment.preferredProfessionalId && !appointment.professionalId && (
             <div className="flex items-center gap-2 text-muted-foreground">
              <StethoscopeIcon className="h-4 w-4 text-amber-600" />
              <span className="text-amber-700">Prefiere a: {professionalsForDisplay.find(p=>p.id === appointment.preferredProfessionalId)?.firstName || 'Profesional especificado'}</span>
            </div>
          )}
           {appointment.bookingObservations && (
            <div className="flex items-start gap-2 text-muted-foreground pt-1">
              <Info className="h-4 w-4 mt-0.5 shrink-0" />
              <p className="text-xs italic">Obs. Reserva: {appointment.bookingObservations}</p>
            </div>
          )}
          {appointment.addedServices && appointment.addedServices.length > 0 && (
            <div className="pt-2 mt-2 border-t border-border">
              <p className="text-xs font-medium text-muted-foreground flex items-center gap-1 mb-1"><ShoppingBag size={14}/> Servicios Adicionales:</p>
              <ul className="list-disc list-inside pl-1 space-y-0.5">
                {appointment.addedServices.map((as, index) => (
                  <li key={index} className="text-xs text-muted-foreground">
                    {ALL_SERVICES_CONSTANTS.find(s => s.id === as.serviceId)?.name || 'Servicio Desconocido'}
                    {as.professionalId && ` (con ${professionalsForDisplay.find(p=>p.id === as.professionalId)?.firstName || 'prof.'})`}
                    {as.price && ` - S/ ${as.price.toFixed(2)}`}
                  </li>
                ))}
              </ul>
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
          {appointment.attachedPhotos && appointment.attachedPhotos.length > 0 && (
            <div className="pt-2 mt-2 border-t border-border">
              <p className="text-xs font-medium text-muted-foreground flex items-center gap-1 mb-1"><Paperclip size={14}/> Fotos Adjuntas:</p>
              <div className="flex flex-wrap gap-2">
                {appointment.attachedPhotos.filter(photoUri => photoUri && typeof photoUri === 'string' && photoUri.startsWith("data:image/")).map((photoUri, index) => (
                  photoUri ? (
                    <Image key={index} src={photoUri} alt={`Foto adjunta ${index + 1}`} width={40} height={40} className="rounded object-cover aspect-square" data-ai-hint="patient record" />
                  ): null
                ))}
              </div>
            </div>
          )}

        </CardContent>
        {user && (user.role === USER_ROLES.LOCATION_STAFF && user.locationId === appointment.locationId) || user.role === USER_ROLES.ADMIN || user.role === USER_ROLES.CONTADOR ? (
          <CardFooter>
            <Button variant="outline" size="sm" onClick={handleOpenUpdateModal} className="w-full">
              <EditIcon className="mr-2 h-4 w-4" /> Actualizar Cita
            </Button>
          </CardFooter>
        ) : null}
      </Card>

      {isUpdateModalOpen && appointment && (
        <AppointmentEditDialog
          appointment={appointment}
          isOpen={isUpdateModalOpen}
          onOpenChange={setIsUpdateModalOpen}
          onAppointmentUpdated={handleAppointmentUpdated}
        />
      )}
    </>
  );
}

export const AppointmentCard = React.memo(AppointmentCardComponent);
