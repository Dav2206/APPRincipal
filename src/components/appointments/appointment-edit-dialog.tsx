

"use client";

import type { Appointment, Service, AppointmentStatus, Professional, Location } from '@/types';
import { PAYMENT_METHODS, USER_ROLES, APPOINTMENT_STATUS_DISPLAY, TIME_SLOTS, APPOINTMENT_STATUS } from '@/lib/constants';
import { format, parseISO, setHours, setMinutes, formatISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { CameraIcon, Loader2, PlusCircle, Trash2, ShoppingBag, ConciergeBell, Clock, CalendarIcon as CalendarIconLucide, XCircle, RefreshCcw, DollarSign, Edit, Info, Shuffle } from 'lucide-react';
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Button, buttonVariants } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';

import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { AppointmentUpdateSchema } from '@/lib/schemas';
import { Form, FormControl, FormItem, FormLabel, FormMessage, FormField } from "@/components/ui/form";
import { getProfessionals, updateAppointment as updateAppointmentData, getServices, deleteAppointment as deleteAppointmentData, getLocations, getProfessionalAvailabilityForDate } from '@/lib/data';
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useToast } from '@/hooks/use-toast';
import Image from 'next/image';
import { cn } from '@/lib/utils';
import { storage } from '@/lib/firebase-config';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { Calendar } from '@/components/ui/calendar';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';


interface AppointmentEditDialogProps {
  appointment: Appointment;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onAppointmentUpdated: (updatedAppointment: Appointment | null | { id: string; _deleted: true }) => void;
  onImageClick?: (imageUrl: string) => void;
}

type AppointmentUpdateFormData = Zod.Infer<typeof AppointmentUpdateSchema>;

const NO_SELECTION_PLACEHOLDER = "_no_selection_placeholder_";
const DEFAULT_SERVICE_ID_PLACEHOLDER = "_default_service_id_placeholder_";

export function AppointmentEditDialog({ appointment, isOpen, onOpenChange, onAppointmentUpdated, onImageClick }: AppointmentEditDialogProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [allSystemProfessionals, setAllSystemProfessionals] = useState<Professional[]>([]);
  const [availableProfessionals, setAvailableProfessionals] = useState<Professional[]>([]);
  const [allServices, setAllServices] = useState<Service[] | null>(null);
  const [locations, setLocations] = useState<Location[]>([]);
  const [isLoadingServices, setIsLoadingServices] = useState(true);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [isSubmittingForm, setIsSubmittingForm] = useState(false);
  const [isConfirmDeleteOpen, setIsConfirmDeleteOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Camera Modal State
  const [isCameraModalOpen, setIsCameraModalOpen] = useState(false);
  const [hasCameraPermission, setHasCameraPermission] = useState<boolean | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([]);
  const [currentDeviceIndex, setCurrentDeviceIndex] = useState(0);

  const paymentMethodsForLocation = useMemo(() => {
    const locConfig = locations.find(l => l.id === appointment.locationId);
    return locConfig?.paymentMethods || ['Efectivo', 'Tarjeta de Débito', 'Yape/Plin'];
  }, [appointment.locationId, locations]);


  const form = useForm<AppointmentUpdateFormData>({
    resolver: zodResolver(AppointmentUpdateSchema),
  });

  const { fields: addedServiceFields, append: appendAddedService, remove: removeAddedService } = useFieldArray({
    control: form.control,
    name: "addedServices",
  });

  const { fields: attachedPhotoFields, remove: removeAttachedPhoto, append: appendAttachedPhoto } = useFieldArray({
    control: form.control,
    name: "attachedPhotos",
  });
  
  const stopCameraStream = useCallback(() => {
    if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
        streamRef.current = null;
    }
  }, []);

  const startCameraStream = useCallback(async (deviceId?: string) => {
    stopCameraStream();
    try {
        const constraints: MediaStreamConstraints = {
            video: deviceId ? { deviceId: { exact: deviceId } } : true,
        };
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        streamRef.current = stream;
        if (videoRef.current) {
            videoRef.current.srcObject = stream;
        }
        setHasCameraPermission(true);
    } catch (error) {
        console.error('Error starting camera stream:', error);
        setHasCameraPermission(false);
        toast({
            variant: 'destructive',
            title: 'Error de Cámara',
            description: 'No se pudo iniciar la cámara seleccionada.',
        });
    }
  }, [stopCameraStream, toast]);

  const openCamera = async () => {
    setIsCameraModalOpen(true);
    setHasCameraPermission(null);
    try {
      // First, get permissions to be able to enumerate devices
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      streamRef.current = stream; // Keep the initial stream
      
      const devices = await navigator.mediaDevices.enumerateDevices();
      const availableVideoDevices = devices.filter(device => device.kind === 'videoinput');
      setVideoDevices(availableVideoDevices);
      
      if (availableVideoDevices.length > 0) {
        setCurrentDeviceIndex(0);
        await startCameraStream(availableVideoDevices[0].deviceId);
      } else {
        // This case should be rare if getUserMedia succeeded
        setHasCameraPermission(false);
         toast({ variant: 'destructive', title: 'Cámara no encontrada', description: 'No se encontraron dispositivos de cámara.' });
      }
    } catch (error) {
      console.error('Error accessing camera:', error);
      setHasCameraPermission(false);
      toast({
          variant: 'destructive',
          title: 'Acceso a la Cámara Denegado',
          description: 'Por favor, habilite los permisos de cámara en su navegador.',
      });
    }
};

 const handleSwitchCamera = () => {
    if (videoDevices.length > 1) {
        const nextIndex = (currentDeviceIndex + 1) % videoDevices.length;
        setCurrentDeviceIndex(nextIndex);
        startCameraStream(videoDevices[nextIndex].deviceId);
    }
  };

  const handleTakePicture = () => {
    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const context = canvas.getContext('2d');
      if (context) {
        context.drawImage(video, 0, 0, video.videoWidth, video.videoHeight);
        const dataUri = canvas.toDataURL('image/jpeg');
        appendAttachedPhoto({ url: dataUri });
        toast({ title: "Foto Capturada", description: "La foto se adjuntará al guardar la cita." });
      }
      stopCameraStream();
      setIsCameraModalOpen(false);
    }
  };
  
  useEffect(() => {
    return () => {
        stopCameraStream();
    };
}, [stopCameraStream]);


  useEffect(() => {
    if (isOpen) {
      setIsLoadingServices(true);
      async function loadData() {
        try {
          // Fetch ALL professionals, not just from the appointment's location, to handle transfers.
          const [allProfsData, servicesDataFromApi, locationsData] = await Promise.all([
            getProfessionals(), 
            getServices(),
            getLocations()
          ]);
          setAllSystemProfessionals(allProfsData || []);
          setAllServices(servicesDataFromApi || []);
          setLocations(locationsData || []);

          const apptDate = parseISO(appointment.appointmentDateTime);
          
          // Now, filter the complete list of professionals to see who is *actually* working at this specific location on this specific day.
          const workingProfs = (allProfsData || []).filter(prof => {
            const availability = getProfessionalAvailabilityForDate(prof, apptDate);
            // The key change: check if the professional's *working location for the day* matches the appointment's location.
            return availability?.isWorking && availability.workingLocationId === appointment.locationId;
          });
          setAvailableProfessionals(workingProfs);
        } catch (error) {
            console.error("Failed to load data for edit dialog:", error);
            setAllSystemProfessionals([]);
            setAvailableProfessionals([]);
            setAllServices([]);
            setLocations([]);
            toast({ title: "Error", description: "No se pudieron cargar los datos necesarios para editar.", variant: "destructive"});
        } finally {
            setIsLoadingServices(false);
        }
      }
      loadData();
    } else {
        stopCameraStream();
    }
  }, [isOpen, appointment.locationId, appointment.appointmentDateTime, toast, stopCameraStream]);


   useEffect(() => {
    if (isOpen && appointment && allServices !== null) {
      const initialDurationMinutes = appointment.durationMinutes || appointment.service?.defaultDuration || 0;
      const appointmentDateTime = parseISO(appointment.appointmentDateTime);
      
      let currentServiceId = appointment.serviceId;
      if (!currentServiceId || (allServices && !allServices.find(s => s.id === currentServiceId))) {
          currentServiceId = allServices && allServices.length > 0 ? allServices[0].id : DEFAULT_SERVICE_ID_PLACEHOLDER;
      }

      form.reset({
        status: appointment.status,
        serviceId: currentServiceId,
        appointmentDate: appointmentDateTime,
        appointmentTime: format(appointmentDateTime, 'HH:mm'),
        actualArrivalTime: appointment.actualArrivalTime || undefined,
        professionalId: appointment.professionalId || NO_SELECTION_PLACEHOLDER,
        durationMinutes: initialDurationMinutes,
        paymentMethod: appointment.paymentMethod || undefined,
        amountPaid: appointment.amountPaid ?? undefined,
        staffNotes: appointment.staffNotes || '',
        attachedPhotos: (appointment.attachedPhotos || []).filter(p => p && typeof p === 'string').map(p => ({ url: p })),
        addedServices: appointment.addedServices?.map(as => ({ 
          serviceId: as.serviceId || (allServices && allServices.length > 0 ? allServices[0].id : DEFAULT_SERVICE_ID_PLACEHOLDER),
          professionalId: as.professionalId || NO_SELECTION_PLACEHOLDER,
          amountPaid: as.amountPaid ?? undefined,
          startTime: as.startTime,
        })) || [],
      });
    }
  }, [isOpen, appointment, allServices, form]);


  const fileToDataUri = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setIsUploadingImage(true);
      try {
        const dataUri = await fileToDataUri(file);
        appendAttachedPhoto({ url: dataUri });
        toast({ title: "Imagen preparada", description: "La imagen se adjuntará al formulario y se guardará con la cita." });
      } catch (error) {
        console.error("Error processing image:", error);
        toast({ title: "Error al procesar imagen", description: "No se pudo leer el archivo de imagen.", variant: "destructive"});
      } finally {
        setIsUploadingImage(false);
        if(fileInputRef.current) fileInputRef.current.value = "";
      }
    }
  };


  const handleRemovePhoto = async (index: number) => {
    const photoField = attachedPhotoFields[index] as { id?: string; url?: string };
    const photoUrlToRemove = photoField?.url;
  
    if (!photoUrlToRemove || typeof photoUrlToRemove !== 'string') {
      removeAttachedPhoto(index);
      return;
    }
  
    if (photoUrlToRemove.startsWith('data:image/')) {
      removeAttachedPhoto(index);
      return;
    }
      
    // For already uploaded photos, we just remove it from the form state.
    // The actual deletion from storage happens in the onSubmit function by comparing the original and final lists.
    removeAttachedPhoto(index);
    toast({ title: "Imagen marcada para eliminación", description: "La imagen se eliminará de Firebase Storage al guardar los cambios."});
  };
  

  const onSubmitUpdate = async (data: AppointmentUpdateFormData) => {
    if (allServices && !allServices.length && data.serviceId === DEFAULT_SERVICE_ID_PLACEHOLDER) {
        toast({ title: "Error", description: "No hay servicios disponibles o no se ha seleccionado uno.", variant: "destructive" });
        return;
    }
    setIsSubmittingForm(true);
    try {
      const datePart = data.appointmentDate || parseISO(appointment.appointmentDateTime);
      const timePart = data.appointmentTime || format(parseISO(appointment.appointmentDateTime), 'HH:mm');

      const [hours, minutes] = timePart.split(':').map(Number);
      const finalDateObject = setMinutes(setHours(datePart, hours), minutes);

      let finalServiceId = data.serviceId;
      if (data.serviceId === DEFAULT_SERVICE_ID_PLACEHOLDER && allServices?.length) {
          finalServiceId = allServices[0].id;
      } else if (data.serviceId === DEFAULT_SERVICE_ID_PLACEHOLDER) {
          toast({ title: "Error", description: "Servicio principal es requerido.", variant: "destructive" });
          setIsSubmittingForm(false);
          return;
      }


      const updatedData: Partial<Appointment> & { attachedPhotos?: { url: string }[] } = {
        ...data,
        appointmentDateTime: formatISO(finalDateObject),
        serviceId: finalServiceId,
        professionalId: data.professionalId === NO_SELECTION_PLACEHOLDER ? null : data.professionalId,
        durationMinutes: data.durationMinutes,
        amountPaid: data.amountPaid,
        actualArrivalTime: data.actualArrivalTime || null,
        attachedPhotos: (data.attachedPhotos || []).filter(p => p && p.url),
        addedServices: data.addedServices?.map(as => ({
          ...as,
          serviceId: as.serviceId === DEFAULT_SERVICE_ID_PLACEHOLDER && allServices?.length ? allServices[0].id : as.serviceId,
          professionalId: as.professionalId === NO_SELECTION_PLACEHOLDER ? null : as.professionalId, 
          amountPaid: as.amountPaid,
        })).filter(as => as.serviceId && as.serviceId !== DEFAULT_SERVICE_ID_PLACEHOLDER),
      };

      const result = await updateAppointmentData(appointment.id, updatedData, appointment.attachedPhotos || []);
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

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      const success = await deleteAppointmentData(appointment.id);
      if (success) {
        toast({ title: "Cita Eliminada", description: "La cita ha sido eliminada exitosamente." });
        onAppointmentUpdated({ id: appointment.id, _deleted: true }); 
        setIsConfirmDeleteOpen(false);
        onOpenChange(false); 
      } else {
        toast({ title: "Error", description: "No se pudo eliminar la cita.", variant: "destructive" });
      }
    } catch (error) {
      console.error("Error deleting appointment:", error);
      toast({ title: "Error Inesperado", description: "Ocurrió un error al eliminar la cita.", variant: "destructive" });
    } finally {
      setIsDeleting(false);
    }
  };


  if (!isOpen) return null;

  return (
    <>
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Actualizar Cita</DialogTitle>
          <DialogDescription>
            {appointment.patient?.firstName} {appointment.patient?.lastName} en {locations.find(l=>l.id===appointment.locationId)?.name}
            {' - '}
            {format(parseISO(appointment.appointmentDateTime), "PPP, p", { locale: es })}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmitUpdate)} className="space-y-4 py-4 max-h-[70vh] overflow-y-auto pr-2">
          
           {/* -- Section: Estado y Horario -- */}
          <div className="space-y-4 p-4 border rounded-lg bg-muted/30">
            <FormField
              control={form.control}
              name="status"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Estado de la Cita</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger id="status"><SelectValue placeholder="Seleccionar estado" /></SelectTrigger>
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
                    <Popover><PopoverTrigger asChild><FormControl>
                      <Button variant="outline" className={cn("pl-3 text-left font-normal", !field.value && "text-muted-foreground")}>
                        {field.value ? format(field.value, "PPP", { locale: es }) : <span>Seleccionar fecha</span>}
                        <CalendarIconLucide className="ml-auto h-4 w-4 opacity-50" />
                      </Button>
                    </FormControl></PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start"><Calendar mode="single" selected={field.value} onSelect={field.onChange} initialFocus /></PopoverContent>
                    </Popover><FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="appointmentTime"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="flex items-center gap-1"><Clock size={16}/>Hora de la Cita</FormLabel>
                     <FormControl>
                      <Input id="appointmentTime" type="time" {...field} value={field.value || ''} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
             {form.watch('status') === APPOINTMENT_STATUS.CONFIRMED && (
              <FormField control={form.control} name="actualArrivalTime" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Hora Real de Llegada</FormLabel>
                    <FormControl><Input type="time" {...field} value={field.value || ''} /></FormControl> <FormMessage/>
                  </FormItem>
              )}/>
            )}
          </div>
          
          {/* -- Section: Detalles del Servicio -- */}
          <div className="space-y-4 p-4 border rounded-lg bg-muted/30">
             <FormField control={form.control} name="serviceId" render={({ field }) => (
              <FormItem>
                <FormLabel className="flex items-center gap-1"><ConciergeBell size={16}/>Servicio Principal</FormLabel>
                <Select
                  onValueChange={field.onChange} value={field.value === DEFAULT_SERVICE_ID_PLACEHOLDER && allServices && allServices.length > 0 ? allServices[0].id : field.value}
                  disabled={isLoadingServices || (allServices && !allServices.length)}
                >
                  <FormControl><SelectTrigger><SelectValue placeholder={isLoadingServices ? "Cargando..." : "Seleccionar servicio"} /></SelectTrigger></FormControl>
                  <SelectContent>
                    {allServices && allServices.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select><FormMessage />
              </FormItem>
            )}/>
            {(form.watch('status') === APPOINTMENT_STATUS.CONFIRMED || form.watch('status') === APPOINTMENT_STATUS.COMPLETED) && (
              <FormField control={form.control} name="professionalId" render={({ field }) => (
                <FormItem>
                  <FormLabel>Profesional que Atendió</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value || NO_SELECTION_PLACEHOLDER}>
                    <FormControl><SelectTrigger><SelectValue placeholder="Seleccionar profesional" /></SelectTrigger></FormControl>
                    <SelectContent>
                      <SelectItem value={NO_SELECTION_PLACEHOLDER}>Sin asignar / Como estaba</SelectItem>
                      {availableProfessionals.map(p => <SelectItem key={p.id} value={p.id}>{p.firstName} {p.lastName}</SelectItem>)}
                    </SelectContent>
                  </Select><FormMessage/>
                </FormItem>
              )}/>
            )}
            {appointment.isExternalProfessional && (
                 <Alert variant="default" className="bg-orange-50 border-orange-200 text-orange-800">
                    <Shuffle className="h-4 w-4 !text-orange-800" />
                    <AlertTitle className="text-sm text-orange-900">Profesional por Traslado</AlertTitle>
                    <AlertDescription className="text-xs">
                        Este servicio es atendido por un profesional de la sede <strong>{locations.find(l => l.id === appointment.externalProfessionalOriginLocationId)?.name}</strong>.
                    </AlertDescription>
                </Alert>
            )}
          </div>

          {/* -- Section: Pago (si está completado) -- */}
          {form.watch('status') === APPOINTMENT_STATUS.COMPLETED && (
            <div className="space-y-4 p-4 border rounded-lg bg-muted/30">
               <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField control={form.control} name="paymentMethod" render={({ field }) => (
                  <FormItem><FormLabel className="flex items-center gap-1"><DollarSign size={16}/>Método de Pago</FormLabel>
                     <Select onValueChange={field.onChange} value={field.value || undefined}><FormControl><SelectTrigger><SelectValue placeholder="Seleccionar" /></SelectTrigger></FormControl>
                      <SelectContent>
                        {paymentMethodsForLocation.map(method => (<SelectItem key={method} value={method}>{method}</SelectItem>))}
                      </SelectContent>
                    </Select><FormMessage/>
                  </FormItem>
                )}/>
                <FormField control={form.control} name="amountPaid" render={({ field }) => (
                  <FormItem><FormLabel>Monto Pagado (S/)</FormLabel>
                    <FormControl><Input type="number" step="0.01" {...field} value={field.value || ''} onChange={e => field.onChange(parseFloat(e.target.value) || undefined)} /></FormControl><FormMessage/>
                  </FormItem>
                )}/>
              </div>
            </div>
          )}

          {/* -- Section: Notas y Fotos -- */}
          <div className="space-y-4 p-4 border rounded-lg bg-muted/30">
            <FormField control={form.control} name="staffNotes" render={({ field }) => (
              <FormItem><FormLabel className="flex items-center gap-1"><Edit size={16}/>Notas del Staff (Internas)</FormLabel>
                <FormControl><Textarea placeholder="Añadir observaciones sobre la cita..." {...field} value={field.value || ''} /></FormControl><FormMessage/>
              </FormItem>
            )}/>
             {(form.watch('status') === APPOINTMENT_STATUS.CONFIRMED || form.watch('status') === APPOINTMENT_STATUS.COMPLETED) && (
              <div className="space-y-2">
                <FormLabel className="flex items-center gap-1"><CameraIcon size={16}/>Fotos Adjuntas</FormLabel>
                <div className="flex flex-wrap gap-2">
                  {attachedPhotoFields.map((fieldItem, index) => {
                    const photoUrl = (fieldItem as { url: string }).url;
                    return (photoUrl && typeof photoUrl === 'string') ? (
                      <div key={fieldItem.id} className="relative group cursor-pointer" onClick={() => onImageClick && onImageClick(photoUrl)}>
                        <Image src={photoUrl} alt={`Foto adjunta ${index + 1}`} width={60} height={60} className="rounded object-cover aspect-square border" data-ai-hint="medical record" />
                        <Button type="button" variant="destructive" size="icon" className="absolute -top-2 -right-2 h-5 w-5 opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => { e.stopPropagation(); handleRemovePhoto(index);}}><Trash2 className="h-3 w-3" /></Button>
                      </div>
                    ) : null;
                  })}
                </div>
                <div className="flex gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} disabled={isUploadingImage}><PlusCircle className="mr-2 h-4 w-4"/>Subir Archivo</Button>
                  <Button type="button" variant="outline" size="sm" onClick={openCamera}><CameraIcon className="mr-2 h-4 w-4"/>Tomar Foto</Button>
                </div>
                <Input type="file" accept="image/*" onChange={handleFileChange} ref={fileInputRef} className="hidden" />
                 {isUploadingImage && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                <FormField control={form.control} name="attachedPhotos" render={() => <FormMessage />} />
              </div>
            )}
          </div>
          
           {/* -- Section: Servicios Adicionales -- */}
           {(form.watch('status') === APPOINTMENT_STATUS.CONFIRMED || form.watch('status') === APPOINTMENT_STATUS.COMPLETED) && !isLoadingServices && allServices && (
             <div className="space-y-4 p-4 border rounded-lg bg-muted/30">
              <div className="flex justify-between items-center"><h4 className="text-md font-semibold flex items-center gap-2"><ShoppingBag/> Servicios Adicionales</h4>
                <Button type="button" size="sm" variant="outline" onClick={() => appendAddedService({ serviceId: allServices?.length ? allServices[0].id : DEFAULT_SERVICE_ID_PLACEHOLDER, professionalId: NO_SELECTION_PLACEHOLDER, amountPaid: undefined, startTime: undefined })}><PlusCircle className="mr-2 h-4 w-4" /> Agregar</Button>
              </div>
              {addedServiceFields.map((item, index) => (
                <div key={item.id} className="p-3 border rounded-md space-y-3 bg-background relative grid grid-cols-1 sm:grid-cols-2 gap-3">
                   <Button type="button" variant="ghost" size="icon" className="absolute top-1 right-1 h-6 w-6" onClick={() => removeAddedService(index)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                  <FormField control={form.control} name={`addedServices.${index}.serviceId`} render={({ field }) => (
                      <FormItem className="col-span-full"><FormLabel className="text-xs">Servicio Adicional {index + 1}</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value || ''} disabled={!allServices?.length}>
                          <FormControl><SelectTrigger><SelectValue placeholder={"Seleccionar servicio"} /></SelectTrigger></FormControl>
                          <SelectContent>{allServices?.map(s => <SelectItem key={`added-${s.id}-${index}`} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
                        </Select><FormMessage />
                      </FormItem>
                  )}/>
                  <FormField control={form.control} name={`addedServices.${index}.professionalId`} render={({ field }) => (
                      <FormItem><FormLabel className="text-xs">Profesional</FormLabel>
                        <Select onValueChange={(value) => field.onChange(value === NO_SELECTION_PLACEHOLDER ? null : value)} value={field.value || NO_SELECTION_PLACEHOLDER}>
                         <FormControl><SelectTrigger><SelectValue placeholder="Mismo prof." /></SelectTrigger></FormControl>
                          <SelectContent>
                            <SelectItem value={NO_SELECTION_PLACEHOLDER}>Mismo prof. principal</SelectItem>
                            {availableProfessionals.map(p => <SelectItem key={`added-prof-${p.id}-${index}`} value={p.id}>{p.firstName} {p.lastName}</SelectItem>)}
                          </SelectContent></Select><FormMessage />
                      </FormItem>
                  )}/>
                   {form.watch('status') === APPOINTMENT_STATUS.COMPLETED && (
                    <FormField name={`addedServices.${index}.amountPaid`} render={({ field }) => (
                      <FormItem><FormLabel className="text-xs">Monto Pagado (S/)</FormLabel>
                        <FormControl><Input type="number" step="0.01" {...field} value={field.value ?? ""} onChange={e => field.onChange(e.target.value ? parseFloat(e.target.value) : undefined)} /></FormControl><FormMessage />
                      </FormItem>
                    )}/>
                  )}
                   <FormField control={form.control} name={`addedServices.${index}.startTime`} render={({ field }) => (
                      <FormItem><FormLabel className="text-xs">Hora Inicio</FormLabel>
                        <FormControl><Input type="time" {...field} value={field.value || ''} /></FormControl><FormMessage />
                      </FormItem>
                  )}/>
                </div>
              ))}
               <FormField control={form.control} name="addedServices" render={() => <FormMessage />} />
            </div>
           )}


          <DialogFooter className="pt-6 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2">
            <div>
              {user && user.role === USER_ROLES.ADMIN && (
                <AlertDialog open={isConfirmDeleteOpen} onOpenChange={setIsConfirmDeleteOpen}>
                  <AlertDialogTrigger asChild>
                    <Button variant="destructive" type="button" className="w-full sm:w-auto" disabled={isDeleting}>
                      {isDeleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}<Trash2 className="mr-2 h-4 w-4" />Eliminar Cita
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader><AlertDialogTitle>¿Confirmar Eliminación?</AlertDialogTitle>
                      <AlertDialogDescription>¿Estás seguro? Esta acción no se puede deshacer.</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel>
                      <AlertDialogAction onClick={handleDelete} className={buttonVariants({ variant: "destructive" })} disabled={isDeleting}>
                        {isDeleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Eliminar
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
            </div>
            <div className="flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2">
              <DialogClose asChild><Button type="button" variant="outline" className="w-full sm:w-auto">Cancelar</Button></DialogClose>
              <Button type="submit" className="w-full sm:w-auto" disabled={isSubmittingForm || isUploadingImage || isLoadingServices || isDeleting}>
                {(isSubmittingForm || isUploadingImage || isLoadingServices || isDeleting) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Guardar Cambios
              </Button>
            </div>
          </DialogFooter>
        </form>
        </Form>
      </DialogContent>
    </Dialog>

    <Dialog open={isCameraModalOpen} onOpenChange={(isOpen) => { if (!isOpen) stopCameraStream(); setIsCameraModalOpen(isOpen); }}>
        <DialogContent>
            <DialogHeader>
                <DialogTitle>Tomar Foto</DialogTitle>
                <DialogDescription>Apunta con la cámara y captura una imagen.</DialogDescription>
            </DialogHeader>
            <div className="flex flex-col items-center gap-4">
                <div className="w-full bg-secondary rounded-md overflow-hidden aspect-video relative">
                    <video ref={videoRef} className="w-full h-full object-cover" autoPlay muted playsInline />
                    <canvas ref={canvasRef} className="hidden" />
                    {hasCameraPermission === false && (
                         <div className="absolute inset-0 flex items-center justify-center">
                            <Alert variant="destructive" className="m-4"><AlertTitle>Acceso a Cámara Requerido</AlertTitle>
                                <AlertDescription>Por favor, habilite el acceso a la cámara.</AlertDescription>
                            </Alert>
                         </div>
                    )}
                    {hasCameraPermission === null && ( <div className="absolute inset-0 flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin" /></div>)}
                </div>
                <div className="flex gap-2">
                    <Button onClick={handleTakePicture} disabled={!hasCameraPermission}><CameraIcon className="mr-2 h-4 w-4"/> Tomar Foto</Button>
                     <Button onClick={handleSwitchCamera} variant="outline" disabled={!hasCameraPermission || videoDevices.length < 2}><RefreshCcw className="mr-2 h-4 w-4"/> Cambiar Cámara</Button>
                </div>
            </div>
             <DialogFooter><DialogClose asChild><Button type="button" variant="outline">Cancelar</Button></DialogClose></DialogFooter>
        </DialogContent>
    </Dialog>
    </>
  );
}
