
"use client";

import type { Appointment, Patient } from '@/types';
import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/auth-provider';
import { useAppState } from '@/contexts/app-state-provider';
import { getAppointments, getPatients } from '@/lib/data';
import { LOCATIONS, USER_ROLES, SERVICES, LocationId, ServiceId } from '@/lib/constants';
import { AppointmentCard } from '@/components/appointments/appointment-card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { format, startOfDay, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { CalendarIcon, SearchIcon, FilterIcon, AlertTriangle, Loader2, RotateCcw, History } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function HistoryPage() {
  const { user } = useAuth();
  const { selectedLocationId: adminSelectedLocation } = useAppState();
  
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [allPatients, setAllPatients] = useState<Patient[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Filters
  const [filterDate, setFilterDate] = useState<Date | undefined>(undefined);
  const [filterPatientId, setFilterPatientId] = useState<string | undefined>(undefined);
  const [filterServiceId, setFilterServiceId] = useState<ServiceId | undefined>(undefined);
  const [filterPatientName, setFilterPatientName] = useState('');


  const effectiveLocationId = user?.role === USER_ROLES.ADMIN 
    ? (adminSelectedLocation === 'all' ? undefined : adminSelectedLocation as LocationId) 
    : user?.locationId;

  const fetchHistoryAppointments = useCallback(async () => {
    if (!user) return;
    setIsLoading(true);
    
    // In a real backend, filtering would be done server-side.
    // Here, we fetch all for the location and then filter client-side.
    // This is not optimal for large datasets.
    let allLocationAppointments = await getAppointments({
      locationId: effectiveLocationId, // Fetch all for location, date filter done client-side below
    });

    // Apply client-side filters
    let filtered = allLocationAppointments.filter(appt => 
      appt.status === 'completed' || appt.status === 'cancelled_client' || appt.status === 'cancelled_staff' || appt.status === 'no_show'
    );

    if (filterDate) {
      const dateStr = format(filterDate, 'yyyy-MM-dd');
      filtered = filtered.filter(appt => format(parseISO(appt.appointmentDateTime), 'yyyy-MM-dd') === dateStr);
    }
    if (filterPatientId) {
      filtered = filtered.filter(appt => appt.patientId === filterPatientId);
    } else if (filterPatientName) {
        // If patient ID not selected, filter by name input if present
        filtered = filtered.filter(appt => 
            (appt.patient?.firstName + " " + appt.patient?.lastName).toLowerCase().includes(filterPatientName.toLowerCase())
        );
    }
    if (filterServiceId) {
      filtered = filtered.filter(appt => appt.serviceId === filterServiceId);
    }
    
    // Sort by most recent first
    filtered.sort((a, b) => parseISO(b.appointmentDateTime).getTime() - parseISO(a.appointmentDateTime).getTime());

    setAppointments(filtered);
    setIsLoading(false);
  }, [user, effectiveLocationId, filterDate, filterPatientId, filterServiceId, filterPatientName]);

  useEffect(() => {
    async function loadInitialData() {
      const patientsData = await getPatients();
      setAllPatients(patientsData);
      fetchHistoryAppointments();
    }
    loadInitialData();
  }, [fetchHistoryAppointments]);
  
  const handleResetFilters = () => {
    setFilterDate(undefined);
    setFilterPatientId(undefined);
    setFilterPatientName('');
    setFilterServiceId(undefined);
    // fetchHistoryAppointments will be called due to state change in useEffect dependency
  };

  const NoHistoryCard = () => (
    <Card className="col-span-full mt-8 border-dashed border-2">
      <CardContent className="py-10 text-center">
        <AlertTriangle className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
        <h3 className="text-xl font-semibold mb-2">No hay historial de citas</h3>
        <p className="text-muted-foreground mb-4">
          No se encontraron citas que coincidan con los filtros aplicados.
        </p>
        <Button onClick={handleResetFilters} variant="outline">
            <RotateCcw className="mr-2 h-4 w-4" /> Limpiar Filtros
        </Button>
      </CardContent>
    </Card>
  );
  
  const LoadingState = () => (
     <div className="flex flex-col items-center justify-center h-64">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="mt-4 text-muted-foreground">Cargando historial...</p>
      </div>
  );

  return (
    <div className="space-y-6">
      <Card className="shadow-md">
        <CardHeader>
          <CardTitle className="text-2xl flex items-center gap-2"><History className="text-primary"/> Historial de Citas</CardTitle>
          <CardDescription>Consulta citas pasadas. Utiliza los filtros para refinar tu búsqueda.</CardDescription>
           {user?.role === USER_ROLES.ADMIN && (
            <div className="mt-2 text-sm text-muted-foreground">
              Viendo: {adminSelectedLocation === 'all' ? 'Todas las sedes' : LOCATIONS.find(l => l.id === adminSelectedLocation)?.name || ''}
            </div>
          )}
        </CardHeader>
        <CardContent>
          {/* Filter Section */}
          <div className="mb-6 p-4 border rounded-lg bg-card space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
              <div>
                <Label htmlFor="filterDate" className="text-sm font-medium">Fecha</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" id="filterDate" className={cn("w-full justify-start text-left font-normal", !filterDate && "text-muted-foreground")}>
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {filterDate ? format(filterDate, "PPP", { locale: es }) : <span>Cualquier Fecha</span>}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar mode="single" selected={filterDate} onSelect={setFilterDate} initialFocus />
                  </PopoverContent>
                </Popover>
              </div>
              <div>
                 <Label htmlFor="filterPatientName" className="text-sm font-medium">Nombre del Paciente</Label>
                 <Input 
                    id="filterPatientName" 
                    placeholder="Buscar por nombre..." 
                    value={filterPatientName}
                    onChange={(e) => setFilterPatientName(e.target.value)}
                 />
              </div>
              {/* Or a Select for existing patients, this input is for free text search */}
              {/* <div>
                <Label htmlFor="filterPatient" className="text-sm font-medium">Paciente</Label>
                <Select value={filterPatientId} onValueChange={setFilterPatientId}>
                  <SelectTrigger id="filterPatient"><SelectValue placeholder="Todos los Pacientes" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Todos los Pacientes</SelectItem>
                    {allPatients.map(p => <SelectItem key={p.id} value={p.id}>{p.firstName} {p.lastName}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div> */}
              <div>
                <Label htmlFor="filterService" className="text-sm font-medium">Servicio</Label>
                <Select value={filterServiceId} onValueChange={v => setFilterServiceId(v as ServiceId)}>
                  <SelectTrigger id="filterService"><SelectValue placeholder="Todos los Servicios" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Todos los Servicios</SelectItem>
                    {SERVICES.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex gap-2">
                <Button onClick={() => fetchHistoryAppointments()} className="w-full md:w-auto">
                  <FilterIcon className="mr-2 h-4 w-4" /> Aplicar Filtros
                </Button>
                 <Button onClick={handleResetFilters} variant="ghost" className="w-full md:w-auto">
                    <RotateCcw className="mr-2 h-4 w-4" /> Reset
                </Button>
              </div>
            </div>
          </div>

          {/* Appointments List */}
          {isLoading ? (
            <LoadingState />
          ) : appointments.length === 0 ? (
            <NoHistoryCard />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {appointments.map(appt => (
                <AppointmentCard key={appt.id} appointment={appt} onUpdate={(updated) => {
                    setAppointments(prev => prev.map(a => a.id === updated.id ? updated : a));
                }} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

