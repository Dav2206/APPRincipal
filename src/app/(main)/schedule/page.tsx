
"use client";

import type { Appointment, Professional } from '@/types';
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '@/contexts/auth-provider';
import { useAppState } from '@/contexts/app-state-provider';
import { getAppointments, getProfessionals, getAppointmentById, getProfessionalAvailabilityForDate } from '@/lib/data';
import { LOCATIONS, USER_ROLES, TIME_SLOTS, LocationId, APPOINTMENT_STATUS } from '@/lib/constants';
import { DailyTimeline } from '@/components/schedule/daily-timeline';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { format, addDays, subDays, startOfDay, isEqual, parseISO, formatISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { CalendarIcon, ChevronLeftIcon, ChevronRightIcon, AlertTriangle, Loader2, CalendarClock, PlusCircleIcon, UserXIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { AppointmentEditDialog } from '@/components/appointments/appointment-edit-dialog';
import { AppointmentForm } from '@/components/appointments/appointment-form';
import { useToast } from "@/hooks/use-toast";

const timeSlotsForView = TIME_SLOTS.filter(slot => parseInt(slot.split(':')[0]) >= 9);

export default function SchedulePage() {
  const { user, isLoading: authIsLoading } = useAuth();
  const { selectedLocationId: adminSelectedLocation } = useAppState();
  const { toast } = useToast();

  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [allSystemProfessionals, setAllSystemProfessionals] = useState<Professional[]>([]);
  const [workingProfessionalsForTimeline, setWorkingProfessionalsForTimeline] = useState<Professional[]>([]);
  const [currentDate, setCurrentDate] = useState<Date>(startOfDay(new Date()));
  const [isLoading, setIsLoading] = useState(true);
  const [selectedAppointmentForEdit, setSelectedAppointmentForEdit] = useState<Appointment | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isNewAppointmentFormOpen, setIsNewAppointmentFormOpen] = useState(false);

  const isAdminOrContador = useMemo(() => {
    if (!user) return false;
    return user.role === USER_ROLES.ADMIN || user.role === USER_ROLES.CONTADOR;
  }, [user]);

  const actualEffectiveLocationId = useMemo(() => {
    if (!user) return null;

    if (isAdminOrContador) {
      const defaultAdminLocation = adminSelectedLocation === 'all' || !adminSelectedLocation
                                   ? (LOCATIONS.length > 0 ? LOCATIONS[0].id : null)
                                   : adminSelectedLocation as LocationId;
      return defaultAdminLocation;
    }
    return user.locationId || null;
  }, [user, isAdminOrContador, adminSelectedLocation]);


  const fetchData = useCallback(async () => {
    if (!user || !actualEffectiveLocationId) {
      console.warn("[SchedulePage] fetchData: Abortando. User o actualEffectiveLocationId no disponible.", {
        userExists: !!user,
        actualEffectiveLocationIdValue: actualEffectiveLocationId,
        authIsLoading
      });
      setIsLoading(false); // Ensure loading is stopped
      setAppointments([]);
      setWorkingProfessionalsForTimeline([]);
      setAllSystemProfessionals([]);
      return;
    }

    setIsLoading(true);
    console.log(`[SchedulePage] fetchData iniciando para fecha: ${currentDate ? formatISO(currentDate) : 'N/A'}, location: ${actualEffectiveLocationId}`);

    try {
      const [allSystemProfsResponse] = await Promise.all([
        getProfessionals(), // Fetch all professionals for filtering and the form
      ]);
      
      const systemProfs = allSystemProfsResponse || [];
      setAllSystemProfessionals(systemProfs);
      console.log(`[SchedulePage] fetchData: Fetched ${systemProfs.length} total system professionals.`);

      // Get professionals whose base location is the effective location
      const professionalsAtEffectiveBaseLocation = systemProfs.filter(prof => prof.locationId === actualEffectiveLocationId);
      const professionalIdsAtEffectiveBaseLocation = professionalsAtEffectiveBaseLocation.map(prof => prof.id);

      const [appointmentsAtEffectiveLocationResponse, appointmentsForProfessionalsAtEffectiveBaseLocationResponse] = await Promise.all([
        getAppointments({   // Fetch appointments for the effective location and date
          locationId: actualEffectiveLocationId,
          date: currentDate,
          statuses: [APPOINTMENT_STATUS.BOOKED, APPOINTMENT_STATUS.CONFIRMED, APPOINTMENT_STATUS.COMPLETED],
        }),
        getAppointments({ // Fetch appointments for professionals whose base location is the effective location
          professionalIds: professionalIdsAtEffectiveBaseLocation,
          date: currentDate,
          statuses: [APPOINTMENT_STATUS.BOOKED, APPOINTMENT_STATUS.CONFIRMED, APPOINTMENT_STATUS.COMPLETED],
          orderBy: 'appointmentDateTime' as 'asc', // Explicitly order by datetime for index
        }),
      ]);
      
      // Correctly handle the appointment responses
      const allRelevantAppointmentsTodayResponse = appointmentsAtEffectiveLocationResponse; // Keep original naming for clarity
      const dailyAppointmentsForLocation = allRelevantAppointmentsTodayResponse.appointments || [];
      const appointmentsForProfessionals = appointmentsForProfessionalsAtEffectiveBaseLocationResponse.appointments || [];
      console.log(`[SchedulePage] fetchData: Fetched ${dailyAppointmentsForLocation.length} appointments para location ${actualEffectiveLocationId} en ${currentDate ? formatISO(currentDate) : 'N/A'}.`);
      console.log(`[SchedulePage] fetchData: Fetched ${appointmentsForProfessionals.length} appointments para profesionales con sede base en ${actualEffectiveLocationId} en ${currentDate ? formatISO(currentDate) : 'N/A'}.`);

      // Combine and deduplicate appointments
      const combinedAppointments = [...dailyAppointmentsForLocation, ...appointmentsForProfessionals];
      const uniqueAppointments = Array.from(new Map(combinedAppointments.map(item => [item.id, item])).values());
      
      const professionalsForColumns = systemProfs.filter(prof => { // This logic correctly determines which professional columns to show
        if (prof.isManager) return false; 
        
        // Mover la declaración de 'availability' aquí, antes de usarla
        const availability = getProfessionalAvailabilityForDate(prof, currentDate);
        console.log("[SchedulePage] Availability result for professional:", prof.firstName, prof.lastName, ":", availability);
        
        // Condition 1: Professional's base location is the effective location AND they are working there today.
        const worksAtBaseLocationToday = prof.locationId === actualEffectiveLocationId && availability && availability.isWorking && (availability.workingLocationId === prof.locationId || availability.workingLocationId === null || availability.workingLocationId === undefined);

        // Condition 2: Professional's base location is the effective location BUT they are working at a DIFFERENT location today.
        // We still want to show them on their home location's schedule.
        const worksElsewhereButBaseIsEffective = prof.locationId === actualEffectiveLocationId && availability && availability.isWorking && availability.workingLocationId && availability.workingLocationId !== prof.locationId;
        
        // Condition 3: Professional is an external professional with an appointment scheduled at the effective location today.
        const isExternalWithAppointmentAtEffectiveLocation = dailyAppointmentsForLocation.some(appt => 
            appt.professionalId === prof.id && 
            appt.isExternalProfessional && 
            appt.locationId === actualEffectiveLocationId // Ensure the appointment itself is for the current viewing location
        );
        
        // Keep the filtering logic for professionals the same - it determines who appears as a column
        return worksAtBaseLocationToday || worksElsewhereButBaseIsEffective || isExternalWithAppointmentAtEffectiveLocation;
      }).sort((a, b) => `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`));

      setWorkingProfessionalsForTimeline(professionalsForColumns);
      
      const displayableAppointments = uniqueAppointments
        .sort((a,b) => parseISO(a.appointmentDateTime).getTime() - parseISO(b.appointmentDateTime).getTime());
      
      setAppointments(displayableAppointments);
      console.log(`[SchedulePage] fetchData: Displaying ${professionalsForColumns.length} professionals in timeline and ${displayableAppointments.length} appointment items for location ${actualEffectiveLocationId}.`);

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
      console.log("[SchedulePage] fetchData: setIsLoading(false) ejecutado.");
    }
  }, [user, actualEffectiveLocationId, currentDate, toast, authIsLoading, isAdminOrContador, adminSelectedLocation]); // Added toast as dependency


  useEffect(() => {
    if (authIsLoading || !user) {
        console.log("[SchedulePage] useEffect (fetch data trigger): Auth is loading or no user, waiting...", { authIsLoading, userExists: !!user });
        setIsLoading(authIsLoading); // Reflect auth loading state
        if (!user && !authIsLoading) { // No user and auth has finished loading
            setAppointments([]);
            setWorkingProfessionalsForTimeline([]);
            setAllSystemProfessionals([]);
        }
        return;
    }

    if (actualEffectiveLocationId) {
      console.log("[SchedulePage] useEffect (fetch data trigger): Auth loaded, user present, actualEffectiveLocationId available. Calling fetchData.", { actualEffectiveLocationId });
      fetchData();
    } else {
      console.warn("[SchedulePage] useEffect (fetch data trigger): actualEffectiveLocationId es nulo después de carga de auth. No se cargarán datos de agenda.", {
        actualEffectiveLocationIdValue: actualEffectiveLocationId,
        isAdminOrContador,
        adminSelectedLocation,
        userLocationId: user?.locationId,
        userRole: user?.role,
      });
      setIsLoading(false);
      setAppointments([]);
      setWorkingProfessionalsForTimeline([]);
      setAllSystemProfessionals([]);
    }
  }, [fetchData, actualEffectiveLocationId, user, authIsLoading, isAdminOrContador, adminSelectedLocation]);


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
    ? (LOCATIONS.find(l => l.id === actualEffectiveLocationId)?.name || `Sede Desconocida (ID: ${actualEffectiveLocationId})`) 
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
  
  if ((isAdminOrContador && !actualEffectiveLocationId) || (isAdminOrContador && adminSelectedLocation === 'all' && !LOCATIONS.find(l=> l.id === actualEffectiveLocationId))) {
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
        />
      )}

      {isNewAppointmentFormOpen && (
        <AppointmentForm
          isOpen={isNewAppointmentFormOpen}
          onOpenChange={setIsNewAppointmentFormOpen}
          onAppointmentCreated={handleNewAppointmentCreated}
          defaultDate={currentDate}
          allProfessionals={allSystemProfessionals} 
          currentLocationProfessionals={allSystemProfessionals.filter(p => p.locationId === actualEffectiveLocationId && !p.isManager)}
        />
      )}
    </div>
  );
}


    