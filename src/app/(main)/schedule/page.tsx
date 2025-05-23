
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
  const { user } = useAuth();
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

  const isAdminOrContador = user?.role === USER_ROLES.ADMIN || user?.role === USER_ROLES.CONTADOR;

  const actualEffectiveLocationId = useMemo(() => {
    if (isAdminOrContador) {
      // If admin/contador and 'all' or no specific location is selected, default to the first location from the LOCATIONS constant.
      // This ensures that a specific location ID is always used for fetching data on this page.
      return adminSelectedLocation === 'all' || !adminSelectedLocation 
             ? LOCATIONS[0].id 
             : adminSelectedLocation as LocationId;
    }
    return user?.locationId; // For location staff, it's their own location.
  }, [isAdminOrContador, adminSelectedLocation, user?.locationId]);


  const fetchData = useCallback(async () => {
    if (!user || !actualEffectiveLocationId) {
      setIsLoading(false);
      setAppointments([]);
      setAllSystemProfessionals([]); // Also clear this if no user/location
      setWorkingProfessionalsForTimeline([]);
      console.warn("[SchedulePage] fetchData: No user or no effectiveLocationId, aborting fetch. User:", user, "EffectiveLocationId:", actualEffectiveLocationId);
      return;
    }
    setIsLoading(true);
    console.log(`[SchedulePage] fetchData called for date: ${currentDate ? formatISO(currentDate) : 'N/A'}, locationId: ${actualEffectiveLocationId}`);

    try {
      // Fetch all professionals (system-wide for selection in forms) and appointments for the specific location and date
      const [allProfsResponse, appointmentsResponse] = await Promise.all([
        getProfessionals(), // Get all professionals for the system
        getAppointments({ // Get appointments ONLY for the current effective location and date
          date: currentDate,
          locationId: actualEffectiveLocationId, 
          statuses: [APPOINTMENT_STATUS.BOOKED, APPOINTMENT_STATUS.CONFIRMED, APPOINTMENT_STATUS.COMPLETED], 
        }),
      ]);
      console.log("[SchedulePage] fetchData: Promises resolved.");

      const systemProfs = allProfsResponse || [];
      setAllSystemProfessionals(systemProfs);
      console.log(`[SchedulePage] fetchData: Fetched ${systemProfs.length} total system professionals.`);

      const dailyAppointments = appointmentsResponse.appointments || [];
      console.log(`[SchedulePage] fetchData: Fetched ${dailyAppointments.length} appointments for location ${actualEffectiveLocationId} on ${formatISO(currentDate)}.`);
      
      const displayableAppointments: Appointment[] = [];
      const professionalsForColumnsSet = new Set<Professional>();
      const processedProfIdsForColumns = new Set<string>();

      // Process appointments specific to the current location (already filtered by getAppointments)
      dailyAppointments.forEach(appt => {
        if ([APPOINTMENT_STATUS.BOOKED, APPOINTMENT_STATUS.CONFIRMED, APPOINTMENT_STATUS.COMPLETED].includes(appt.status)) {
          // Add appointment if it's for the current location OR it's a travel block TO this location for an external professional
          if (appt.locationId === actualEffectiveLocationId || (appt.isTravelBlock && appt.locationId === actualEffectiveLocationId) ) {
            displayableAppointments.push(appt);
          }
        }
        // Add professional to columns if they are involved in an appointment at this location
        // or if they are an external professional travelling TO this location for an appointment
        if (appt.professionalId && !processedProfIdsForColumns.has(appt.professionalId) && appt.locationId === actualEffectiveLocationId) {
          const prof = systemProfs.find(p => p.id === appt.professionalId);
          if (prof && !prof.isManager) { // Exclude managers from having a column
             const availability = getProfessionalAvailabilityForDate(prof, currentDate);
             if (availability && availability.isWorking) { // Ensure they are actually scheduled to work
                professionalsForColumnsSet.add(prof);
                processedProfIdsForColumns.add(prof.id);
             }
          }
        }
      });

      // Add all other professionals working at this location today who might not have appointments yet
      // and are not managers.
      systemProfs
        .filter(prof => {
            const availability = getProfessionalAvailabilityForDate(prof, currentDate);
            return prof.locationId === actualEffectiveLocationId && !prof.isManager && availability && availability.isWorking;
        })
        .forEach(localProf => {
          if (!processedProfIdsForColumns.has(localProf.id)) {
            professionalsForColumnsSet.add(localProf);
            processedProfIdsForColumns.add(localProf.id);
          }
           // Also, add any travel blocks FOR this professional TO this location, if not already added
          dailyAppointments.forEach(appt => {
            if (appt.professionalId === localProf.id && appt.isTravelBlock && appt.locationId === actualEffectiveLocationId) {
              if(!displayableAppointments.find(da => da.id === appt.id)){
                  displayableAppointments.push(appt);
              }
            }
          });
        });

      const professionalsForColumnsArray = Array.from(professionalsForColumnsSet).sort((a, b) =>
        `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`)
      );

      setWorkingProfessionalsForTimeline(professionalsForColumnsArray);
      setAppointments(displayableAppointments.sort((a,b) => parseISO(a.appointmentDateTime).getTime() - parseISO(b.appointmentDateTime).getTime()));
      console.log(`[SchedulePage] fetchData: Displaying ${professionalsForColumnsArray.length} professionals in timeline and ${displayableAppointments.length} appointment items for location ${actualEffectiveLocationId}.`);

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
  }, [user, actualEffectiveLocationId, currentDate, toast]);


  useEffect(() => {
    if(actualEffectiveLocationId) { // Only fetch if there's a valid location ID
      fetchData();
    } else if ((isAdminOrContador && !adminSelectedLocation) || !user?.locationId && !isAdminOrContador) {
      // Case where admin has "all" or nothing selected, or non-admin has no locationId (should not happen with current logic)
      setIsLoading(false);
      setAppointments([]);
      setWorkingProfessionalsForTimeline([]);
      setAllSystemProfessionals([]);
      console.log("[SchedulePage] useEffect: No valid location selected by admin, or staff has no location. Clearing data.");
    }
  }, [fetchData, actualEffectiveLocationId, isAdminOrContador, adminSelectedLocation, user?.locationId]);


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
      console.log("[SchedulePage] handleTimelineAppointmentClick for appointment ID:", appointment.id);
      const fullAppointmentDetails = await getAppointmentById(appointment.id);
      if (fullAppointmentDetails) {
        setSelectedAppointmentForEdit(fullAppointmentDetails);
        console.log("[SchedulePage] Fetched full details for edit:", fullAppointmentDetails);
      } else {
        setSelectedAppointmentForEdit(appointment);
        console.warn("[SchedulePage] Could not fetch full appointment details for edit, using timeline data for edit modal. Original ID:", appointment.id);
      }
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
    console.log("[SchedulePage] handleAppointmentUpdated called with:", updatedOrDeletedAppointment);
    fetchData(); // Always refetch to ensure data consistency
    setIsEditModalOpen(false);
    setSelectedAppointmentForEdit(null);
  }, [fetchData]);

  const handleNewAppointmentCreated = useCallback(async () => {
    setIsNewAppointmentFormOpen(false);
    console.log("[SchedulePage] handleNewAppointmentCreated: New appointment form closed, refetching data...");
    await fetchData();
  }, [fetchData]);

  const NoDataCard = ({ title, message }: { title: string; message: string }) => (
    <Card className="col-span-full mt-8 border-dashed border-2">
      <CardContent className="py-10 text-center">
        <AlertTriangle className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
        <h3 className="text-xl font-semibold mb-2">{title}</h3>
        <p className="text-muted-foreground mb-4">{message}</p>
      </CardContent>
    </Card>
  );

  const LoadingState = () => (
    <div className="flex flex-col items-center justify-center min-h-[400px]">
      <Loader2 className="h-12 w-12 animate-spin text-primary" />
      <p className="mt-4 text-muted-foreground">Cargando agenda...</p>
    </div>
  );
  
  const displayLocationName = actualEffectiveLocationId ? LOCATIONS.find(l => l.id === actualEffectiveLocationId)?.name : 'Sede no especificada';

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
          ) : !actualEffectiveLocationId ? (
             <NoDataCard
              title="Seleccione una sede"
              message="Por favor, seleccione una sede desde el menú superior para ver la agenda horaria."
            />
          )
          : workingProfessionalsForTimeline.length === 0 && appointments.filter(a => !a.isTravelBlock && [APPOINTMENT_STATUS.BOOKED, APPOINTMENT_STATUS.CONFIRMED, APPOINTMENT_STATUS.COMPLETED].includes(a.status)).length === 0 ? (
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
          allProfessionals={allSystemProfessionals} // Pass all system professionals
          currentLocationProfessionals={allSystemProfessionals.filter(p => p.locationId === actualEffectiveLocationId)} // Pass professionals specific to the current location
        />
      )}
    </div>
  );
}

