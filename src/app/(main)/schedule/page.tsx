
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
import { format, addDays, subDays, startOfDay, isEqual, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { CalendarIcon, ChevronLeftIcon, ChevronRightIcon, AlertTriangle, Loader2, CalendarClock, PlusCircleIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { AppointmentEditDialog } from '@/components/appointments/appointment-edit-dialog';
import { AppointmentForm } from '@/components/appointments/appointment-form';

const timeSlotsForView = TIME_SLOTS.filter(slot => parseInt(slot.split(':')[0]) >= 9);

export default function SchedulePage() {
  const { user } = useAuth();
  const { selectedLocationId: adminSelectedLocation } = useAppState();
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [allSystemProfessionals, setAllSystemProfessionals] = useState<Professional[]>([]);
  const [workingProfessionalsForTimeline, setWorkingProfessionalsForTimeline] = useState<Professional[]>([]);
  const [currentDate, setCurrentDate] = useState<Date>(startOfDay(new Date()));
  const [isLoading, setIsLoading] = useState(true);
  const [selectedAppointmentForEdit, setSelectedAppointmentForEdit] = useState<Appointment | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isNewAppointmentFormOpen, setIsNewAppointmentFormOpen] = useState(false);

  const isAdminOrContador = user?.role === USER_ROLES.ADMIN || user?.role === USER_ROLES.CONTADOR;

  const actualEffectiveLocationId = useMemo(() => isAdminOrContador
    ? (adminSelectedLocation === 'all' || !adminSelectedLocation ? LOCATIONS[0].id : adminSelectedLocation as LocationId)
    : user?.locationId, [isAdminOrContador, adminSelectedLocation, user?.locationId]);


  const fetchData = useCallback(async () => {
    if (!user || !actualEffectiveLocationId) {
      setIsLoading(false);
      setAppointments([]);
      setAllSystemProfessionals([]);
      setWorkingProfessionalsForTimeline([]);
      return;
    }
    setIsLoading(true);
    console.log(`[SchedulePage] fetchData for date: ${formatISO(currentDate)}, location: ${actualEffectiveLocationId}`);

    try {
      const [allSystemProfsResponse, allRelevantAppointmentsTodayResponse] = await Promise.all([
        getProfessionals(),
        getAppointments({
          date: currentDate,
          statuses: [APPOINTMENT_STATUS.BOOKED, APPOINTMENT_STATUS.CONFIRMED, APPOINTMENT_STATUS.COMPLETED],
        }),
      ]);

      const allSystemProfs = allSystemProfsResponse || [];
      setAllSystemProfessionals(allSystemProfs);
      const allRelevantAppointmentsToday = allRelevantAppointmentsTodayResponse.appointments || [];
      console.log(`[SchedulePage] Fetched ${allSystemProfs.length} total professionals and ${allRelevantAppointmentsToday.length} relevant appointments for the day.`);

      const displayableAppointments: Appointment[] = [];
      const professionalsForColumnsSet = new Set<Professional>();
      const processedProfIdsForColumns = new Set<string>();


      allRelevantAppointmentsToday
        .filter(appt => appt.locationId === actualEffectiveLocationId && !appt.isTravelBlock)
        .forEach(appt => {
          displayableAppointments.push(appt);
          if (appt.professionalId && !processedProfIdsForColumns.has(appt.professionalId)) {
            const prof = allSystemProfs.find(p => p.id === appt.professionalId);
            if (prof && !prof.isManager && getProfessionalAvailabilityForDate(prof, currentDate)) {
              professionalsForColumnsSet.add(prof);
              processedProfIdsForColumns.add(prof.id);
            }
          }
        });


      allSystemProfs
        .filter(prof => {
            const availability = getProfessionalAvailabilityForDate(prof, currentDate);
            return prof.locationId === actualEffectiveLocationId && !prof.isManager && availability;
        })
        .forEach(localProf => {
          if (!processedProfIdsForColumns.has(localProf.id)) {
            professionalsForColumnsSet.add(localProf);
            processedProfIdsForColumns.add(localProf.id);
          }

          allRelevantAppointmentsToday
            .filter(appt => appt.professionalId === localProf.id && appt.isExternalProfessional && appt.locationId !== actualEffectiveLocationId)
            .forEach(travelAppt => {
              if (!displayableAppointments.find(da => da.id === `travel-${travelAppt.id}-${localProf.id}`)) {
                displayableAppointments.push({
                  ...travelAppt,
                  id: `travel-${travelAppt.id}-${localProf.id}`,
                  isTravelBlock: true,
                });
              }
            });
        });

      const professionalsForColumnsArray = Array.from(professionalsForColumnsSet).sort((a, b) =>
        `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`)
      );

      setWorkingProfessionalsForTimeline(professionalsForColumnsArray);
      setAppointments(displayableAppointments.sort((a,b) => parseISO(a.appointmentDateTime).getTime() - parseISO(b.appointmentDateTime).getTime()));
      console.log(`[SchedulePage] Displaying ${professionalsForColumnsArray.length} professionals in timeline and ${displayableAppointments.length} appointment items.`);

    } catch (error) {
      console.error("[SchedulePage] Error fetching schedule data:", error);
      setAppointments([]);
      setWorkingProfessionalsForTimeline([]);
    } finally {
      setIsLoading(false);
    }
  }, [user, actualEffectiveLocationId, currentDate]);


  useEffect(() => {
    fetchData();
  }, [fetchData]);


  const handleDateChange = (date: Date | undefined) => {
    if (date) {
      setCurrentDate(startOfDay(date));
    }
  };

  const handleTimelineAppointmentClick = useCallback(async (appointment: Appointment) => {
    if (appointment.isTravelBlock) return;

    try {
      if (!appointment || !appointment.id || appointment.id.startsWith('travel-')) {
        console.error("Invalid appointment object or travel block passed to handleTimelineAppointmentClick");
        return;
      }
      // Attempt to fetch the most up-to-date details, especially if it's an external professional's appointment
      // where some details might not be fully populated initially.
      const fullAppointmentDetails = await getAppointmentById(appointment.id.replace(/^travel-/, '').split('-')[0]); // Get original ID if it was a travel block ID
      if (fullAppointmentDetails) {
        setSelectedAppointmentForEdit(fullAppointmentDetails);
      } else {
        // Fallback to the appointment data from the timeline if full details can't be fetched
        // This might happen if it's a newly created appointment not yet fully retrievable by ID in some mock scenarios
        setSelectedAppointmentForEdit(appointment);
        console.warn("[SchedulePage] Could not fetch full appointment details for edit, using timeline data for edit modal. Original ID:", appointment.id.replace(/^travel-/, '').split('-')[0]);
      }
      setIsEditModalOpen(true);
    } catch (error) {
      console.error("[SchedulePage] Error fetching appointment details for edit:", error);
      setSelectedAppointmentForEdit(appointment); // Fallback to timeline data on error
      setIsEditModalOpen(true);
    }
  }, []);


  const handleAppointmentUpdated = useCallback(() => {
    fetchData();
    setIsEditModalOpen(false);
  }, [fetchData]);

  const handleNewAppointmentCreated = useCallback(async () => {
    setIsNewAppointmentFormOpen(false);
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

  return (
    <div className="container mx-auto py-8 px-4 md:px-0 space-y-6">
      <Card className="shadow-lg">
        <CardHeader>
          <div className="flex flex-col md:flex-row justify-between items-center gap-4">
            <div className='flex-grow'>
              <CardTitle className="text-3xl flex items-center gap-2">
                <CalendarClock className="text-primary" />
                Agenda Horaria - {format(currentDate, "PPP", { locale: es })}
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
                    {format(currentDate, "PPP", { locale: es })}
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
                variant={isEqual(currentDate, startOfDay(new Date())) ? "secondary" : "outline"}
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
              Viendo: {LOCATIONS.find(l => l.id === actualEffectiveLocationId)?.name || 'Sede no especificada'}
            </div>
          )}
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <LoadingState />
          ) : !actualEffectiveLocationId ? (
             <NoDataCard
              title="Seleccione una sede"
              message="Por favor, seleccione una sede para ver la agenda horaria."
            />
          )
          : workingProfessionalsForTimeline.length === 0 && appointments.filter(a => a.locationId === actualEffectiveLocationId && !a.isTravelBlock && (a.status === APPOINTMENT_STATUS.BOOKED || a.status === APPOINTMENT_STATUS.CONFIRMED || a.status === APPOINTMENT_STATUS.COMPLETED)).length === 0 ? (
            <NoDataCard
              title="No hay profesionales ni citas"
              message={`No se encontraron profesionales activos (no gerentes) ni citas para ${LOCATIONS.find(l => l.id === actualEffectiveLocationId)?.name || 'la selección actual'} en esta fecha.`}
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
          onOpenChange={setIsEditModalOpen}
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
          currentLocationProfessionals={allSystemProfessionals.filter(p => p.locationId === actualEffectiveLocationId)}
        />
      )}
    </div>
  );
}
