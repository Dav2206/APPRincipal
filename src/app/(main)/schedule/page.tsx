
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
import { CalendarIcon, ChevronLeftIcon, ChevronRightIcon, AlertTriangle, Loader2, CalendarClock, PlusCircleIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { AppointmentEditDialog } from '@/components/appointments/appointment-edit-dialog';
import { AppointmentForm } from '@/components/appointments/appointment-form';
import { useToast } from "@/hooks/use-toast";

const timeSlotsForView = TIME_SLOTS.filter(slot => parseInt(slot.split(':')[0]) >= 9);

export default function SchedulePage() {
  const { user, isLoading: authIsLoading } = useAuth(); // Usar isLoading de useAuth
  const { selectedLocationId: adminSelectedLocation } = useAppState();
  const { toast } = useToast();

  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [allSystemProfessionals, setAllSystemProfessionals] = useState<Professional[]>([]); // Para el formulario
  const [workingProfessionalsForTimeline, setWorkingProfessionalsForTimeline] = useState<Professional[]>([]);
  const [currentDate, setCurrentDate] = useState<Date>(startOfDay(new Date()));
  const [isLoading, setIsLoading] = useState(true); // Loading state para datos de la página
  const [selectedAppointmentForEdit, setSelectedAppointmentForEdit] = useState<Appointment | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isNewAppointmentFormOpen, setIsNewAppointmentFormOpen] = useState(false);

  const isAdminOrContador = useMemo(() => {
    if (!user) return false;
    return user.role === USER_ROLES.ADMIN || user.role === USER_ROLES.CONTADOR;
  }, [user]);

  const actualEffectiveLocationId = useMemo(() => {
    if (!user) return null; // Si el usuario no está cargado, no hay sede efectiva

    if (isAdminOrContador) {
      const defaultAdminLocation = adminSelectedLocation === 'all' || !adminSelectedLocation
                                   ? (LOCATIONS.length > 0 ? LOCATIONS[0].id : null)
                                   : adminSelectedLocation as LocationId;
      console.log("[SchedulePage] Admin/Contador. adminSelectedLocation:", adminSelectedLocation, "defaultAdminLocation:", defaultAdminLocation);
      return defaultAdminLocation;
    }
    console.log("[SchedulePage] Staff. user.locationId:", user.locationId);
    return user.locationId || null; // Para staff, su locationId o null si no tiene
  }, [user, isAdminOrContador, adminSelectedLocation]);


  const fetchData = useCallback(async () => {
    if (!user || !actualEffectiveLocationId) {
      console.warn("[SchedulePage] fetchData: Abortando. User o actualEffectiveLocationId no disponible.", { userExists: !!user, actualEffectiveLocationId });
      setIsLoading(false);
      setAppointments([]);
      setWorkingProfessionalsForTimeline([]);
      return;
    }

    setIsLoading(true);
    console.log(`[SchedulePage] fetchData for date: ${formatISO(currentDate)}, location: ${actualEffectiveLocationId}`);

    try {
      // Obtener TODOS los profesionales del sistema para pasarlos al formulario de Nueva Cita.
      // La lista de profesionales para las columnas de la agenda se filtrará después.
      const allProfsResponsePromise = getProfessionals(); // Fetch all professionals

      const appointmentsResponsePromise = getAppointments({
        locationId: actualEffectiveLocationId,
        date: currentDate,
        statuses: [APPOINTMENT_STATUS.BOOKED, APPOINTMENT_STATUS.CONFIRMED, APPOINTMENT_STATUS.COMPLETED],
      });

      const [allProfsResult, appointmentsResult] = await Promise.all([allProfsResponsePromise, appointmentsResponsePromise]);
      
      const systemProfs = allProfsResult || [];
      setAllSystemProfessionals(systemProfs);
      console.log(`[SchedulePage] fetchData: Fetched ${systemProfs.length} total system professionals.`);

      const dailyAppointments = appointmentsResult.appointments || [];
      console.log(`[SchedulePage] fetchData: Fetched ${dailyAppointments.length} appointments for location ${actualEffectiveLocationId} on ${formatISO(currentDate)}.`);
      
      const professionalsForColumns = systemProfs.filter(prof => {
        if (prof.isManager) return false; // Excluir gerentes de las columnas
        const availability = getProfessionalAvailabilityForDate(prof, currentDate);
        // Profesional debe trabajar en la sede efectiva o ser externo con cita en la sede efectiva
        const worksAtEffectiveLocation = prof.locationId === actualEffectiveLocationId && availability && availability.isWorking;
        const isExternalWithAppointmentAtEffectiveLocation = dailyAppointments.some(appt => 
            appt.professionalId === prof.id && 
            appt.isExternalProfessional && 
            appt.locationId === actualEffectiveLocationId
        );
        return worksAtEffectiveLocation || isExternalWithAppointmentAtEffectiveLocation;
      }).sort((a, b) => `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`));

      setWorkingProfessionalsForTimeline(professionalsForColumns);
      
      const displayableAppointments = dailyAppointments.filter(appt => 
        (appt.locationId === actualEffectiveLocationId) || 
        (appt.isTravelBlock && appt.locationId === actualEffectiveLocationId)
      ).sort((a,b) => parseISO(a.appointmentDateTime).getTime() - parseISO(b.appointmentDateTime).getTime());
      
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
    } finally {
      setIsLoading(false);
      console.log("[SchedulePage] fetchData: setIsLoading(false) executed.");
    }
  }, [user, actualEffectiveLocationId, currentDate, toast]); // fetchData depende de user y actualEffectiveLocationId


  useEffect(() => {
    // Esperar a que el usuario esté cargado y que actualEffectiveLocationId tenga un valor
    if (authIsLoading) {
        console.log("[SchedulePage] useEffect (fetch data trigger): Auth is loading, waiting...");
        setIsLoading(true); // Mantener la página en estado de carga si auth está cargando
        return;
    }
    if (!user) {
        console.log("[SchedulePage] useEffect (fetch data trigger): User is null after auth load. This shouldn't happen if MainLayout protects.");
        setIsLoading(false); // No hay usuario, no hay nada que cargar
        return;
    }

    if (actualEffectiveLocationId) {
      console.log("[SchedulePage] useEffect (fetch data trigger): Auth loaded, user present, actualEffectiveLocationId available. Calling fetchData.", { actualEffectiveLocationId });
      fetchData();
    } else {
      console.warn("[SchedulePage] useEffect (fetch data trigger): actualEffectiveLocationId is still falsy after auth load. Not fetching data.", {
        actualEffectiveLocationIdValue: actualEffectiveLocationId,
        isAdminOrContador,
        adminSelectedLocation,
        userLocationId: user?.locationId,
        userRole: user?.role,
      });
      setIsLoading(false);
      setAppointments([]);
      setWorkingProfessionalsForTimeline([]);
    }
  }, [fetchData, actualEffectiveLocationId, user, authIsLoading, isAdminOrContador, adminSelectedLocation]);


  const handleDateChange = (date: Date | undefined) => {
    if (date) {
      setCurrentDate(startOfDay(date));
    }
  };

  const handleTimelineAppointmentClick = useCallback(async (appointment: Appointment) => {
    if (appointment.isTravelBlock) {
      console.log("[SchedulePage] Clicked on a travel block, no edit action:", appointment);
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

  const handleAppointmentUpdated = useCallback((updatedOrDeletedAppointment: Appointment | { id: string; _deleted: true } | null) => {
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
    ? (LOCATIONS.find(l => l.id === actualEffectiveLocationId)?.name || `ID Sede: ${actualEffectiveLocationId}`) 
    : 'Sede no especificada';
  
  if (authIsLoading) {
    return <LoadingState />;
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
          {(isAdminOrContador || user?.role === USER_ROLES.LOCATION_STAFF) && (
            <div className="mt-2 text-sm text-muted-foreground">
              Viendo para: {displayLocationName}
            </div>
          )}
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <LoadingState />
          ) : !actualEffectiveLocationId ? ( // Si después de todo, no hay sede efectiva
             <NoDataCard
              title="Seleccione una sede"
              message="Por favor, seleccione una sede desde el menú superior para ver la agenda horaria. Si es personal de sede y no ve su sede, contacte al administrador."
            />
          )
          : workingProfessionalsForTimeline.length === 0 && appointments.filter(a => a.locationId === actualEffectiveLocationId && !a.isTravelBlock && [APPOINTMENT_STATUS.BOOKED, APPOINTMENT_STATUS.CONFIRMED, APPOINTMENT_STATUS.COMPLETED].includes(a.status)).length === 0 ? (
            <NoDataCard
              title="No hay profesionales ni citas"
              message={`No se encontraron profesionales activos (no gerentes) ni citas para ${displayLocationName} en esta fecha.`}
            />
          ) : (
            <DailyTimeline
              professionals={workingProfessionalsForTimeline}
              appointments={appointments}
              timeSlots={timeSlotsForView}
              currentDate={currentDate}
              onAppointmentClick={handleTimelineAppointmentClick}
              viewingLocationId={actualEffectiveLocationId}
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

