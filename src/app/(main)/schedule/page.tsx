

"use client";

import type { Appointment, Professional, Location } from '@/types';
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '@/contexts/auth-provider';
import { useAppState } from '@/contexts/app-state-provider';
import { getAppointments, getProfessionals, getAppointmentById, getProfessionalAvailabilityForDate, getLocations, getProfessionalById } from '@/lib/data';
import { USER_ROLES, TIME_SLOTS, LocationId, APPOINTMENT_STATUS } from '@/lib/constants';
import { DailyTimeline } from '@/components/schedule/daily-timeline';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { format, addDays, subDays, startOfDay, isEqual, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { CalendarIcon, ChevronLeftIcon, ChevronRightIcon, AlertTriangle, Loader2, CalendarClock, PlusCircleIcon, UserXIcon, ZoomIn, ZoomOut, RefreshCw, XIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { AppointmentEditDialog } from '@/components/appointments/appointment-edit-dialog';
import { AppointmentForm } from '@/components/appointments/appointment-form';
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogClose } from '@/components/ui/dialog';
import Image from 'next/image';


const timeSlotsForView = TIME_SLOTS.filter(slot => parseInt(slot.split(':')[0]) >= 9);

export default function SchedulePage() {
  const { user, isLoading: authIsLoading } = useAuth();
  const { selectedLocationId: adminSelectedLocation } = useAppState();
  const { toast } = useToast();

  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [allSystemProfessionals, setAllSystemProfessionals] = useState<Professional[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [workingProfessionalsForTimeline, setWorkingProfessionalsForTimeline] = useState<Professional[]>([]);
  const [currentDate, setCurrentDate] = useState<Date>(startOfDay(new Date()));
  const [isLoading, setIsLoading] = useState(true);
  const [selectedAppointmentForEdit, setSelectedAppointmentForEdit] = useState<Appointment | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isNewAppointmentFormOpen, setIsNewAppointmentFormOpen] = useState(false);

  // State for image modal
  const [selectedImageForModal, setSelectedImageForModal] = useState<string | null>(null);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [imagePosition, setImagePosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const imageRef = React.useRef<HTMLImageElement>(null);

  const isAdminOrContador = useMemo(() => {
    if (!user) return false;
    return user.role === USER_ROLES.ADMIN || user.role === USER_ROLES.CONTADOR;
  }, [user]);

  useEffect(() => {
    async function loadLocations() {
        const fetchedLocations = await getLocations();
        setLocations(fetchedLocations);
    }
    loadLocations();
  }, []);


  const actualEffectiveLocationId = useMemo(() => {
    if (!user) return null;

    if (isAdminOrContador) {
      const defaultAdminLocation = adminSelectedLocation === 'all' || !adminSelectedLocation
                                   ? (locations.length > 0 ? locations[0].id : null)
                                   : adminSelectedLocation as LocationId;
      return defaultAdminLocation;
    }
    return user.locationId || null;
  }, [user, isAdminOrContador, adminSelectedLocation, locations]);


  const fetchData = useCallback(async () => {
    if (!user || !actualEffectiveLocationId) {
      setIsLoading(false);
      setAppointments([]);
      setWorkingProfessionalsForTimeline([]);
      setAllSystemProfessionals([]);
      return;
    }
  
    setIsLoading(true);
  
    try {
      // Step 1: Fetch appointments and base professionals for the current location in parallel.
      const [appointmentsResponse, professionalsForLocationResponse] = await Promise.all([
        getAppointments({
          locationId: actualEffectiveLocationId,
          date: currentDate,
          statuses: [APPOINTMENT_STATUS.BOOKED, APPOINTMENT_STATUS.CONFIRMED, APPOINTMENT_STATUS.COMPLETED],
        }),
        getProfessionals(actualEffectiveLocationId)
      ]);
  
      const dailyAppointments = appointmentsResponse.appointments || [];
      const locationProfs = professionalsForLocationResponse || [];
      const professionalsMap = new Map(locationProfs.map(p => [p.id, p]));
  
      // Step 2: Identify external professionals from appointments and fetch them if they are not already in our map.
      const externalProfIdsToFetch = new Set<string>();
      dailyAppointments.forEach(appt => {
        if (appt.isExternalProfessional && appt.professionalId && !professionalsMap.has(appt.professionalId)) {
          externalProfIdsToFetch.add(appt.professionalId);
        }
      });
  
      if (externalProfIdsToFetch.size > 0) {
        const externalProfs = await Promise.all(
          Array.from(externalProfIdsToFetch).map(id => getProfessionalById(id))
        );
        externalProfs.forEach(prof => {
          if (prof) professionalsMap.set(prof.id, prof);
        });
      }
      
      const allRelevantProfessionals = Array.from(professionalsMap.values());
      
      // Step 3: Determine which professionals to display as columns in the timeline.
      // This is the definitive list of who is working at the target location today.
      const professionalsForTimeline = allRelevantProfessionals.filter(prof => {
        if (prof.isManager) return false;
        const availability = getProfessionalAvailabilityForDate(prof, currentDate);
        // The key is to check if their authoritative working location for the day matches the location we are viewing.
        return availability?.isWorking && availability.workingLocationId === actualEffectiveLocationId;
      }).sort((a, b) => `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`));

      // Step 4: Set all state at once to avoid partial renders.
      setAllSystemProfessionals(allRelevantProfessionals);
      setAppointments(dailyAppointments.sort((a,b) => parseISO(a.appointmentDateTime).getTime() - parseISO(b.appointmentDateTime).getTime()));
      setWorkingProfessionalsForTimeline(professionalsForTimeline);
  
    } catch (error) {
      console.error("[SchedulePage] Error fetching schedule data:", error);
      toast({
        title: "Error al Cargar Agenda",
        description: "No se pudieron obtener los datos de la agenda. Intente de nuevo.",
        variant: "destructive",
      });
      setAppointments([]);
      setWorkingProfessionalsForTimeline([]);
      setAllSystemProfessionals([]);
    } finally {
      setIsLoading(false);
    }
  }, [user, actualEffectiveLocationId, currentDate, toast]);


  useEffect(() => {
    if (authIsLoading || !user) {
        setIsLoading(authIsLoading);
        if (!user && !authIsLoading) {
            setAppointments([]);
            setWorkingProfessionalsForTimeline([]);
            setAllSystemProfessionals([]);
        }
        return;
    }

    if (actualEffectiveLocationId) {
      fetchData();
    } else {
      setIsLoading(false);
      setAppointments([]);
      setWorkingProfessionalsForTimeline([]);
      setAllSystemProfessionals([]);
    }
  }, [fetchData, actualEffectiveLocationId, user, authIsLoading]);


  const handleDateChange = (date: Date | undefined) => {
    if (date) {
      setCurrentDate(startOfDay(date));
    }
  };

  const handleTimelineAppointmentClick = useCallback(async (appointment: Appointment) => {
    if (appointment.isTravelBlock) {
      return;
    }
    try {
      if (!appointment || !appointment.id || appointment.id.startsWith('travel-')) {
        console.error("[SchedulePage] Invalid appointment object or travel block passed to handleTimelineAppointmentClick");
        return;
      }
      const fullAppointmentDetails = await getAppointmentById(appointment.id);
      setSelectedAppointmentForEdit(fullAppointmentDetails || appointment);
      setIsEditModalOpen(true);
    } catch (error) {
      console.error("[SchedulePage] Error fetching appointment details for edit:", error);
      toast({
        title: "Error",
        description: "No se pudieron cargar los detalles completos de la cita.",
        variant: "destructive",
      });
      setSelectedAppointmentForEdit(appointment);
      setIsEditModalOpen(true);
    }
  }, [toast]);

  const handleAppointmentUpdated = useCallback((updatedOrDeletedAppointment: Appointment | null | { id: string; _deleted: true }) => {
    fetchData(); 
    setIsEditModalOpen(false);
    setSelectedAppointmentForEdit(null);
  }, [fetchData]);

  const handleNewAppointmentCreated = useCallback(async () => {
    setIsNewAppointmentFormOpen(false);
    await fetchData(); 
  }, [fetchData]);

  // Image Modal Handlers
  const resetZoomAndPosition = useCallback(() => {
    setZoomLevel(1);
    setImagePosition({ x: 0, y: 0 });
  }, []);

  const handleImageClick = useCallback((imageUrl: string) => {
    resetZoomAndPosition();
    setSelectedImageForModal(imageUrl);
  }, [resetZoomAndPosition]);

  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    e.preventDefault();
    const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
    setZoomLevel(prevZoom => Math.max(0.5, Math.min(prevZoom * zoomFactor, 5)));
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (zoomLevel <= 1) return;
    setIsDragging(true);
    setDragStart({ x: e.clientX - imagePosition.x, y: e.clientY - imagePosition.y });
    e.currentTarget.style.cursor = 'grabbing';
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isDragging || zoomLevel <= 1) return;
    setImagePosition({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y,
    });
  };

  const handleMouseUp = (e: React.MouseEvent<HTMLDivElement>) => {
    setIsDragging(false);
     e.currentTarget.style.cursor = zoomLevel > 1 ? 'grab' : 'default';
  };

  const LoadingState = () => (
    <div className="flex flex-col items-center justify-center min-h-[400px]">
      <Loader2 className="h-12 w-12 animate-spin text-primary" />
      <p className="mt-4 text-muted-foreground">Cargando agenda...</p>
    </div>
  );
  
  const NoDataCard = ({ title, message }: { title: string; message: string }) => (
    <Card className="col-span-full mt-8 border-dashed border-2">
      <CardContent className="py-10 text-center">
        <AlertTriangle className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
        <h3 className="text-xl font-semibold mb-2">{title}</h3>
        <p className="text-muted-foreground mb-4">{message}</p>
      </CardContent>
    </Card>
  );
  
  const displayLocationName = actualEffectiveLocationId 
    ? (locations.find(l => l.id === actualEffectiveLocationId)?.name || `Sede Desconocida (ID: ${actualEffectiveLocationId})`) 
    : 'Sede no especificada o no seleccionada';
  
  if (authIsLoading) {
    return <LoadingState />;
  }
  
  if (!user) { 
    return <NoDataCard title="Acceso Denegado" message="Debe iniciar sesión para ver la agenda." />;
  }

  if (user.role === USER_ROLES.LOCATION_STAFF && !user.locationId) {
     return <NoDataCard title="Error de Configuración de Sede" message="Su usuario no tiene una sede asignada. Por favor, contacte al administrador." />;
  }
  
  if ((isAdminOrContador && !actualEffectiveLocationId) || (isAdminOrContador && adminSelectedLocation === 'all' && !locations.find(l=> l.id === actualEffectiveLocationId))) {
    return (
       <div className="container mx-auto py-8 px-4 md:px-0 space-y-6">
         <Card className="shadow-lg">
           <CardHeader>
             <CardTitle className="text-3xl flex items-center gap-2">
               <CalendarClock className="text-primary" />
               Agenda Horaria
             </CardTitle>
             <CardDescription>
               Seleccione una sede desde el menú superior para ver la agenda.
             </CardDescription>
           </CardHeader>
           <CardContent>
             <NoDataCard
               title="Seleccione una sede"
               message="Por favor, seleccione una sede específica desde el menú superior para ver la agenda horaria."
             />
           </CardContent>
         </Card>
       </div>
     );
  }


  return (
    <div className="container mx-auto py-8 px-4 md:px-0 space-y-6">
      <Card className="shadow-lg">
        <CardHeader>
          <div className="flex flex-col md:flex-row justify-between items-center gap-4">
            <div className='flex-grow'>
              <CardTitle className="text-3xl flex items-center gap-2">
                <CalendarClock className="text-primary" />
                Agenda Horaria - {currentDate ? format(currentDate, "PPP", { locale: es }) : "Seleccione fecha"}
              </CardTitle>
              <CardDescription>
                Vista de la agenda en formato de línea de tiempo por profesional (excluye Gerentes de Sede).
              </CardDescription>
            </div>
            <div className="flex items-center gap-2 w-full md:w-auto flex-wrap">
              <Button variant="outline" size="icon" onClick={() => handleDateChange(subDays(currentDate, 1))}>
                <ChevronLeftIcon className="h-4 w-4" />
              </Button>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("w-full sm:w-[200px] justify-start text-left font-normal", !currentDate && "text-muted-foreground")}>
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {currentDate ? format(currentDate, "PPP", { locale: es }) : "Seleccione fecha"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar mode="single" selected={currentDate} onSelect={handleDateChange} initialFocus />
                </PopoverContent>
              </Popover>
              <Button variant="outline" size="icon" onClick={() => handleDateChange(addDays(currentDate, 1))}>
                <ChevronRightIcon className="h-4 w-4" />
              </Button>
              <Button
                variant={currentDate && isEqual(currentDate, startOfDay(new Date())) ? "secondary" : "outline"}
                onClick={() => handleDateChange(new Date())}
                className="hidden sm:inline-flex"
              >
                Hoy
              </Button>
               {(user?.role === USER_ROLES.ADMIN || user?.role === USER_ROLES.LOCATION_STAFF || user?.role === USER_ROLES.CONTADOR) && (
                <Button onClick={() => setIsNewAppointmentFormOpen(true)} className="w-full sm:w-auto">
                  <PlusCircleIcon className="mr-2 h-4 w-4" /> Nueva Cita
                </Button>
              )}
            </div>
          </div>
          <div className="mt-2 text-sm text-muted-foreground">
             Viendo para: {displayLocationName}
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <LoadingState />
          ) 
          : workingProfessionalsForTimeline.length === 0 && appointments.filter(a => !a.isTravelBlock && [APPOINTMENT_STATUS.BOOKED, APPOINTMENT_STATUS.CONFIRMED, APPOINTMENT_STATUS.COMPLETED].includes(a.status)).length === 0 ? (
            <NoDataCard
              title="No hay profesionales ni citas"
              message={`No se encontraron profesionales activos (no gerentes) trabajando ni citas para ${displayLocationName} en esta fecha.`}
            />
          ) : (
            <DailyTimeline
              professionals={workingProfessionalsForTimeline}
              appointments={appointments}
              timeSlots={timeSlotsForView}
              currentDate={currentDate}
              onAppointmentClick={handleTimelineAppointmentClick}
              viewingLocationId={actualEffectiveLocationId!} 
              locations={locations}
            />
          )}
        </CardContent>
      </Card>

      {selectedAppointmentForEdit && isEditModalOpen && (
        <AppointmentEditDialog
          appointment={selectedAppointmentForEdit}
          isOpen={isEditModalOpen}
          onOpenChange={(open) => {
            setIsEditModalOpen(open);
            if (!open) setSelectedAppointmentForEdit(null);
          }}
          onAppointmentUpdated={handleAppointmentUpdated}
          onImageClick={handleImageClick}
        />
      )}

      {isNewAppointmentFormOpen && (
        <AppointmentForm
          isOpen={isNewAppointmentFormOpen}
          onOpenChange={setIsNewAppointmentFormOpen}
          onAppointmentCreated={handleNewAppointmentCreated}
          defaultDate={currentDate}
          allProfessionals={allSystemProfessionals} 
          currentLocationProfessionals={allSystemProfessionals.filter(p => p.locationId === actualEffectiveLocationId)}
        />
      )}

      <Dialog open={!!selectedImageForModal} onOpenChange={(open) => { if (!open) setSelectedImageForModal(null); }}>
        <DialogContent className="sm:max-w-4xl max-h-[90vh] flex flex-col p-0">
          <DialogHeader className="flex-row justify-between items-center p-2 border-b bg-muted/50">
            <DialogTitle className="text-base">Vista Previa de Imagen</DialogTitle>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon" onClick={() => setZoomLevel(prev => Math.min(prev * 1.2, 5))} title="Acercar"><ZoomIn /></Button>
              <Button variant="ghost" size="icon" onClick={() => setZoomLevel(prev => Math.max(prev * 0.8, 0.5))} title="Alejar"><ZoomOut /></Button>
              <Button variant="ghost" size="icon" onClick={resetZoomAndPosition} title="Restaurar"><RefreshCw /></Button>
              <DialogClose asChild>
                <Button variant="ghost" size="icon"><XIcon className="h-5 w-5"/></Button>
              </DialogClose>
            </div>
          </DialogHeader>
          <div
            className="flex-grow overflow-hidden p-2 flex items-center justify-center relative bg-secondary/20"
            onWheel={handleWheel}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            style={{ cursor: zoomLevel > 1 ? (isDragging ? 'grabbing' : 'grab') : 'default' }}
          >
            <div
              style={{
                transform: `scale(${zoomLevel}) translate(${imagePosition.x}px, ${imagePosition.y}px)`,
                transition: isDragging ? 'none' : 'transform 0.1s ease-out',
                maxWidth: '100%',
                maxHeight: '100%',
                willChange: 'transform',
              }}
              className="flex items-center justify-center"
            >
              {selectedImageForModal && (
                <Image
                  ref={imageRef}
                  src={selectedImageForModal}
                  alt="Vista ampliada"
                  width={1200}
                  height={900}
                  className="max-w-full max-h-[calc(90vh-120px)] object-contain rounded-md select-none shadow-lg"
                  draggable="false"
                  data-ai-hint="medical chart"
                />
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}


