
"use client";

import type { Appointment, Professional } from '@/types';
import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/auth-provider';
import { useAppState } from '@/contexts/app-state-provider';
import { getAppointments, getProfessionals, getAppointmentById } from '@/lib/data';
import { LOCATIONS, USER_ROLES, TIME_SLOTS, LocationId } from '@/lib/constants';
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
  const [professionals, setProfessionals] = useState<Professional[]>([]);
  const [currentDate, setCurrentDate] = useState<Date>(startOfDay(new Date()));
  const [isLoading, setIsLoading] = useState(true);
  const [selectedAppointmentForEdit, setSelectedAppointmentForEdit] = useState<Appointment | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isNewAppointmentFormOpen, setIsNewAppointmentFormOpen] = useState(false); 

  const isAdminOrContador = user?.role === USER_ROLES.ADMIN || user?.role === USER_ROLES.CONTADOR;
  const effectiveLocationId = isAdminOrContador
    ? (adminSelectedLocation === 'all' ? undefined : adminSelectedLocation as LocationId) 
    : user?.locationId;

  const fetchData = useCallback(async () => {
    if (!user) return;
    setIsLoading(true);
    
    try {
      const [fetchedAppointmentsData, fetchedProfessionalsResult] = await Promise.all([
        getAppointments({
          locationId: effectiveLocationId,
          date: currentDate,
        }),
        getProfessionals(effectiveLocationId)
      ]);
      setAppointments(fetchedAppointmentsData.appointments || []);
      setProfessionals(fetchedProfessionalsResult || []);
    } catch (error) {
      console.error("Error fetching schedule data:", error);
      setAppointments([]);
      setProfessionals([]);
    } finally {
      setIsLoading(false);
    }
  }, [user, effectiveLocationId, currentDate]);

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
      // Ensure we fetch the full appointment details if the one from timeline is partial
      const fullAppointmentDetails = await getAppointmentById(appointment.id);
      if (fullAppointmentDetails) {
        setSelectedAppointmentForEdit(fullAppointmentDetails);
        setIsEditModalOpen(true);
      } else {
        // Fallback to the potentially partial appointment from the timeline if full fetch fails
        setSelectedAppointmentForEdit(appointment);
        setIsEditModalOpen(true);
        console.warn("Could not fetch full appointment details for editing, using timeline data.");
      }
    } catch (error) {
      console.error("Error fetching appointment details:", error);
      // Fallback to the potentially partial appointment from the timeline on error
      setSelectedAppointmentForEdit(appointment);
      setIsEditModalOpen(true);
    }
  }, []);


  const handleAppointmentUpdated = useCallback(() => {
    fetchData(); // Re-fetch all appointments for the current day and location
    setIsEditModalOpen(false);
  }, [fetchData]);
  
  const handleNewAppointmentCreated = useCallback(async () => {
    setIsNewAppointmentFormOpen(false); // Close the form

    if (!user) return;
    setIsLoading(true);
    console.log("handleNewAppointmentCreated: Fetching new data for date:", currentDate.toISOString(), "and location:", effectiveLocationId);
    try {
      const [fetchedAppointmentsData, fetchedProfessionalsData] = await Promise.all([
        getAppointments({
          locationId: effectiveLocationId,
          date: currentDate,
        }),
        getProfessionals(effectiveLocationId)
      ]);
      setAppointments(fetchedAppointmentsData.appointments || []);
      setProfessionals(fetchedProfessionalsData || []);
      console.log("handleNewAppointmentCreated: Data fetched and state updated. Appointments count:", (fetchedAppointmentsData.appointments || []).length);
    } catch (error) {
      console.error("Error fetching schedule data in handleNewAppointmentCreated:", error);
      setAppointments([]);
      setProfessionals([]);
    } finally {
      setIsLoading(false);
    }
  }, [user, effectiveLocationId, currentDate, setIsLoading, setAppointments, setProfessionals, setIsNewAppointmentFormOpen]);
  
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
          {isAdminOrContador && (
            <div className="mt-2 text-sm text-muted-foreground">
              Viendo: {adminSelectedLocation === 'all' ? 'Todas las sedes' : LOCATIONS.find(l => l.id === adminSelectedLocation)?.name || ''}
            </div>
          )}
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <LoadingState />
          ) : professionals.length === 0 ? (
            <NoDataCard 
              title="No hay profesionales"
              message={`No se encontraron profesionales para ${effectiveLocationId ? LOCATIONS.find(l => l.id === effectiveLocationId)?.name : 'la selección actual'}.`}
            />
          ) : (
            <DailyTimeline 
              professionals={professionals} 
              appointments={appointments} 
              timeSlots={timeSlotsForView} 
              currentDate={currentDate}
              onAppointmentClick={handleTimelineAppointmentClick}
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
        />
      )}
    </div>
  );
}

