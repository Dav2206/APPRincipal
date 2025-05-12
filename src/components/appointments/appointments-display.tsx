
"use client";

import type { Appointment } from '@/types';
import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/auth-provider';
import { useAppState } from '@/contexts/app-state-provider';
import { getAppointments } from '@/lib/data';
import { LOCATIONS, USER_ROLES, LocationId } from '@/lib/constants';
import { AppointmentCard } from './appointment-card';
import { AppointmentForm } from './appointment-form';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { format, addDays, subDays, startOfDay, isEqual, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { CalendarIcon, ChevronLeftIcon, ChevronRightIcon, PlusCircleIcon, AlertTriangle, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export function AppointmentsDisplay() {
  const { user } = useAuth();
  const { selectedLocationId: adminSelectedLocation } = useAppState();
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [currentDate, setCurrentDate] = useState<Date>(startOfDay(new Date()));
  const [isLoading, setIsLoading] = useState(true);
  const [isFormOpen, setIsFormOpen] = useState(false);

  const isAdminOrContador = user?.role === USER_ROLES.ADMIN || user?.role === USER_ROLES.CONTADOR;
  const effectiveLocationId = isAdminOrContador 
    ? (adminSelectedLocation === 'all' ? undefined : adminSelectedLocation as LocationId) 
    : user?.locationId;

  const fetchAppointments = useCallback(async () => {
    if (!user) return;
    setIsLoading(true);
    
    try {
      const fetchedData = await getAppointments({
        locationId: effectiveLocationId,
        date: currentDate,
      });
      // Ensure appointments are sorted by time for consistent display
      const sortedAppointments = (fetchedData.appointments || []).sort(
        (a, b) => parseISO(a.appointmentDateTime).getTime() - parseISO(b.appointmentDateTime).getTime()
      );
      setAppointments(sortedAppointments);
    } catch (error) {
      console.error("Failed to fetch appointments:", error);
      setAppointments([]); 
    } finally {
      setIsLoading(false);
    }
  }, [user, effectiveLocationId, currentDate]);

  useEffect(() => {
    fetchAppointments();
  }, [fetchAppointments]);

  const handleDateChange = (date: Date | undefined) => {
    if (date) {
      setCurrentDate(startOfDay(date));
    }
  };

  const handleAppointmentUpdate = useCallback((updatedAppointment: Appointment) => {
    setAppointments(prev => 
      prev.map(appt => appt.id === updatedAppointment.id ? updatedAppointment : appt)
        .sort((a, b) => parseISO(a.appointmentDateTime).getTime() - parseISO(b.appointmentDateTime).getTime())
    );
    fetchAppointments(); // Refresh list after local update
  }, [fetchAppointments]);

  const NoAppointmentsCard = () => (
    <Card className="col-span-full mt-8 border-dashed border-2">
      <CardContent className="py-10 text-center">
        <AlertTriangle className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
        <h3 className="text-xl font-semibold mb-2">No hay citas programadas</h3>
        <p className="text-muted-foreground mb-4">
          No se encontraron citas para {effectiveLocationId ? LOCATIONS.find(l=>l.id === effectiveLocationId)?.name : 'todas las sedes'} en la fecha seleccionada.
        </p>
        {(user?.role === USER_ROLES.ADMIN || user?.role === USER_ROLES.LOCATION_STAFF || user?.role === USER_ROLES.CONTADOR) && (
          <Button onClick={() => setIsFormOpen(true)}>
            <PlusCircleIcon className="mr-2 h-4 w-4" /> Agendar Nueva Cita
          </Button>
        )}
      </CardContent>
    </Card>
  );
  
  const LoadingState = () => (
     <div className="flex flex-col items-center justify-center h-64">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="mt-4 text-muted-foreground">Cargando citas...</p>
      </div>
  );

  return (
    <div className="space-y-6">
      <Card className="shadow-md">
        <CardHeader>
          <div className="flex flex-col md:flex-row justify-between items-center gap-4">
            <CardTitle className="text-2xl">
              Citas para {format(currentDate, "PPP", { locale: es })}
            </CardTitle>
            <div className="flex items-center gap-2 w-full md:w-auto">
              <Button variant="outline" size="icon" onClick={() => handleDateChange(subDays(currentDate, 1))}>
                <ChevronLeftIcon className="h-4 w-4" />
              </Button>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("w-full md:w-[200px] justify-start text-left font-normal", !currentDate && "text-muted-foreground")}>
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
            </div>
          </div>
           {isAdminOrContador && (
            <div className="mt-2 text-sm text-muted-foreground">
              Viendo: {adminSelectedLocation === 'all' ? 'Todas las sedes' : LOCATIONS.find(l => l.id === adminSelectedLocation)?.name || ''}
            </div>
          )}
        </CardHeader>
        <CardContent>
          {(user?.role === USER_ROLES.ADMIN || user?.role === USER_ROLES.LOCATION_STAFF || user?.role === USER_ROLES.CONTADOR) && (
             <Button onClick={() => setIsFormOpen(true)} className="mb-6 w-full md:w-auto">
              <PlusCircleIcon className="mr-2 h-4 w-4" /> Agendar Nueva Cita
            </Button>
          )}
          {isLoading ? (
            <LoadingState />
          ) : appointments.length === 0 ? (
            <NoAppointmentsCard />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {appointments.map(appt => (
                <AppointmentCard key={appt.id} appointment={appt} onUpdate={handleAppointmentUpdate} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {isFormOpen && (
        <AppointmentForm
          isOpen={isFormOpen}
          onOpenChange={setIsFormOpen}
          onAppointmentCreated={() => {
            fetchAppointments(); 
            setIsFormOpen(false);
          }}
          defaultDate={currentDate}
        />
      )}
    </div>
  );
}
