
"use client";

import type { Appointment, Professional } from '@/types';
import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/auth-provider';
import { useAppState } from '@/contexts/app-state-provider';
import { getAppointments, getProfessionals, getAppointmentById, getProfessionalAvailabilityForDate } from '@/lib/data';
import { LOCATIONS, USER_ROLES, TIME_SLOTS, LocationId, APPOINTMENT_STATUS } from '@/lib/constants';
import { DailyTimeline } from '@/components/schedule/daily-timeline';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { format, addDays, subDays, startOfDay, isEqual } from 'date-fns';
import { es } from 'date-fns/locale';
import { CalendarIcon, ChevronLeftIcon, ChevronRightIcon, AlertTriangle, Loader2, CalendarClock, PlusCircleIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { AppointmentEditDialog } from '@/components/appointments/appointment-edit-dialog';
import { AppointmentForm } from '@/components/appointments/appointment-form';

const timeSlotsForView = TIME_SLOTS.filter(slot => slot >= "09:00"); 

export default function SchedulePage() {
  const { user } = useAuth();
  const { selectedLocationId: adminSelectedLocation } = useAppState();
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [allProfessionals, setAllProfessionals] = useState<Professional[]>([]); // All professionals in the system
  const [workingProfessionals, setWorkingProfessionals] = useState<Professional[]>([]); // Professionals to display on timeline
  const [currentDate, setCurrentDate] = useState<Date>(startOfDay(new Date()));
  const [isLoading, setIsLoading] = useState(true);
  const [selectedAppointmentForEdit, setSelectedAppointmentForEdit] = useState<Appointment | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isNewAppointmentFormOpen, setIsNewAppointmentFormOpen] = useState(false); 

  const isAdminOrContador = user?.role === USER_ROLES.ADMIN || user?.role === USER_ROLES.CONTADOR;
  
  // Ensure actualEffectiveLocationId is always a specific location for the schedule page
  const actualEffectiveLocationId = isAdminOrContador
    ? (adminSelectedLocation === 'all' || !adminSelectedLocation ? LOCATIONS[0].id : adminSelectedLocation as LocationId) 
    : user?.locationId;

  const fetchData = useCallback(async () => {
    if (!user || !actualEffectiveLocationId) {
      setIsLoading(false);
      setAppointments([]);
      setAllProfessionals([]);
      setWorkingProfessionals([]);
      return;
    }
    setIsLoading(true);
    
    try {
      // 1. Fetch appointments scheduled for the actualEffectiveLocationId on the currentDate
      const fetchedAppointmentsData = await getAppointments({
        locationId: actualEffectiveLocationId,
        date: currentDate,
        statuses: [APPOINTMENT_STATUS.BOOKED, APPOINTMENT_STATUS.CONFIRMED],
      });
      const appointmentsForLocation = fetchedAppointmentsData.appointments || [];
      setAppointments(appointmentsForLocation);

      // 2. Get all system professionals (needed to find external ones)
      const allSystemProfsData = await getProfessionals(); 
      const allSystemProfessionalsList = allSystemProfsData || [];
      setAllProfessionals(allSystemProfessionalsList);

      // 3. Determine professionals to display on the timeline for this location
      const professionalsActiveAtThisLocation: Professional[] = [];
      const processedProfIds = new Set<string>();

      // Add professionals who have appointments at this location (local or external)
      const professionalIdsInAppointments = Array.from(new Set(
        appointmentsForLocation.map(appt => appt.professionalId).filter(id => id != null) as string[]
      ));

      for (const profId of professionalIdsInAppointments) {
        const professional = allSystemProfessionalsList.find(p => p.id === profId);
        if (professional && !processedProfIds.has(profId)) {
          // Check if this professional is actually available based on their schedule,
          // or if their presence is solely due to the appointment (e.g. external forced)
          const availability = getProfessionalAvailabilityForDate(professional, currentDate);
          if (availability || appointmentsForLocation.some(a => a.professionalId === profId)) {
             professionalsActiveAtThisLocation.push(professional);
             processedProfIds.add(profId);
          }
        }
      }

      // Add professionals based at this location and working today (even if no appts yet)
      const professionalsBasedHere = allSystemProfessionalsList.filter(p => p.locationId === actualEffectiveLocationId);
      for (const prof of professionalsBasedHere) {
        if (!processedProfIds.has(prof.id)) {
          const availability = getProfessionalAvailabilityForDate(prof, currentDate);
          if (availability) {
            professionalsActiveAtThisLocation.push(prof);
            processedProfIds.add(prof.id);
          }
        }
      }
      
      professionalsActiveAtThisLocation.sort((a, b) => 
        `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`)
      );
      setWorkingProfessionals(professionalsActiveAtThisLocation);

    } catch (error) {
      console.error("Error fetching schedule data:", error);
      setAppointments([]);
      // setAllProfessionals([]); // already fetched or empty if error
      setWorkingProfessionals([]);
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
    try {
      const fullAppointmentDetails = await getAppointmentById(appointment.id);
      if (fullAppointmentDetails) {
        setSelectedAppointmentForEdit(fullAppointmentDetails);
        setIsEditModalOpen(true);
      } else {
        setSelectedAppointmentForEdit(appointment);
        setIsEditModalOpen(true);
        console.warn("Could not fetch full appointment details for editing, using timeline data.");
      }
    } catch (error) {
      console.error("Error fetching appointment details:", error);
      setSelectedAppointmentForEdit(appointment);
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
                Vista de la agenda en formato de línea de tiempo por profesional.
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
          : workingProfessionals.length === 0 ? (
            <NoDataCard 
              title="No hay profesionales trabajando hoy"
              message={`No se encontraron profesionales activos para ${LOCATIONS.find(l => l.id === actualEffectiveLocationId)?.name || 'la selección actual'} en esta fecha, o no tienen citas programadas.`}
            />
          ) : (
            <DailyTimeline 
              professionals={workingProfessionals} 
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
          // Pass all professionals for the dropdown if creating appointment
          allProfessionals={allProfessionals} 
          // Pass current location professionals if needed specifically by form
          currentLocationProfessionals={allProfessionals.filter(p => p.locationId === actualEffectiveLocationId)}
        />
      )}
    </div>
  );
}
