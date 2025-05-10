
"use client";

import type { Appointment, Patient } from '@/types';
import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/contexts/auth-provider';
import { useAppState } from '@/contexts/app-state-provider';
import { getAppointments, getPatients } from '@/lib/data';
import { LOCATIONS, USER_ROLES, SERVICES, LocationId, ServiceId, APPOINTMENT_STATUS } from '@/lib/constants';
import { AppointmentCard } from '@/components/appointments/appointment-card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { CalendarIcon, FilterIcon, AlertTriangle, Loader2, RotateCcw, History as HistoryIcon, ChevronsDown } from 'lucide-react';
import { cn } from '@/lib/utils';

const ALL_SERVICES_VALUE = "all_services_placeholder_value";
const APPOINTMENTS_PER_PAGE = 12;

export default function HistoryPage() {
  const { user } = useAuth();
  const { selectedLocationId: adminSelectedLocation } = useAppState();
  
  const [allLocationHistory, setAllLocationHistory] = useState<Appointment[]>([]);
  const [displayedAppointments, setDisplayedAppointments] = useState<Appointment[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  
  const [allPatients, setAllPatients] = useState<Patient[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Filters
  const [filterDate, setFilterDate] = useState<Date | undefined>(undefined);
  const [filterPatientName, setFilterPatientName] = useState('');
  const [filterServiceId, setFilterServiceId] = useState<ServiceId | typeof ALL_SERVICES_VALUE>(ALL_SERVICES_VALUE);

  const effectiveLocationId = user?.role === USER_ROLES.ADMIN 
    ? (adminSelectedLocation === 'all' ? undefined : adminSelectedLocation as LocationId) 
    : user?.locationId;

  useEffect(() => {
    async function loadBaseData() {
      if (!user) return;
      setIsLoading(true);
      setCurrentPage(1); // Reset page on location change
      setDisplayedAppointments([]); // Clear previous appointments

      const patientsData = await getPatients();
      setAllPatients(patientsData);

      const baseHistory = await getAppointments({
        locationId: effectiveLocationId,
        status: [APPOINTMENT_STATUS.COMPLETED, APPOINTMENT_STATUS.CANCELLED_CLIENT, APPOINTMENT_STATUS.CANCELLED_STAFF, APPOINTMENT_STATUS.NO_SHOW],
      });
      // Sort once after fetching
      setAllLocationHistory(baseHistory.sort((a, b) => parseISO(b.appointmentDateTime).getTime() - parseISO(a.appointmentDateTime).getTime()));
      setIsLoading(false);
    }
    loadBaseData();
  }, [user, effectiveLocationId]);
  
  const { filteredAppointmentsList, totalFilteredCount } = useMemo(() => {
    let filtered = [...allLocationHistory];

    if (filterDate) {
      const dateStr = format(filterDate, 'yyyy-MM-dd');
      filtered = filtered.filter(appt => format(parseISO(appt.appointmentDateTime), 'yyyy-MM-dd') === dateStr);
    }
    if (filterPatientName) {
        filtered = filtered.filter(appt => 
            (appt.patient?.firstName + " " + appt.patient?.lastName).toLowerCase().includes(filterPatientName.toLowerCase())
        );
    }
    if (filterServiceId && filterServiceId !== ALL_SERVICES_VALUE) {
      filtered = filtered.filter(appt => appt.serviceId === filterServiceId);
    }
    
    return { filteredAppointmentsList: filtered, totalFilteredCount: filtered.length };
  }, [allLocationHistory, filterDate, filterPatientName, filterServiceId]);

  useEffect(() => {
    const startIndex = (currentPage - 1) * APPOINTMENTS_PER_PAGE;
    const endIndex = startIndex + APPOINTMENTS_PER_PAGE;
    const newDisplayedAppointments = filteredAppointmentsList.slice(0, endIndex); // Accumulate previous pages
    setDisplayedAppointments(newDisplayedAppointments);
  }, [filteredAppointmentsList, currentPage]);


  const handleApplyFilters = () => {
    setCurrentPage(1); // Reset to page 1 when applying new filters
    // The useMemo for filteredAppointmentsList will re-calculate
    // and the useEffect for displayedAppointments will update the view.
  };
  
  const handleResetFilters = () => {
    setFilterDate(undefined);
    setFilterPatientName('');
    setFilterServiceId(ALL_SERVICES_VALUE);
    setCurrentPage(1);
  };

  const handleLoadMore = () => {
    setCurrentPage(prevPage => prevPage + 1);
  };
  
  const handleServiceFilterChange = (value: string) => {
    setFilterServiceId(value as ServiceId | typeof ALL_SERVICES_VALUE);
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
          <CardTitle className="text-2xl flex items-center gap-2"><HistoryIcon className="text-primary"/> Historial de Citas</CardTitle>
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
                    <Calendar mode="single" selected={filterDate} onSelect={(date) => {setFilterDate(date); setCurrentPage(1);}} initialFocus />
                  </PopoverContent>
                </Popover>
              </div>
              <div>
                 <Label htmlFor="filterPatientName" className="text-sm font-medium">Nombre del Paciente</Label>
                 <Input 
                    id="filterPatientName" 
                    placeholder="Buscar por nombre..." 
                    value={filterPatientName}
                    onChange={(e) => {setFilterPatientName(e.target.value); setCurrentPage(1);}}
                 />
              </div>
              <div>
                <Label htmlFor="filterService" className="text-sm font-medium">Servicio</Label>
                <Select value={filterServiceId} onValueChange={(value) => {handleServiceFilterChange(value); setCurrentPage(1);}}>
                  <SelectTrigger id="filterService"><SelectValue placeholder="Todos los Servicios" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL_SERVICES_VALUE}>Todos los Servicios</SelectItem>
                    {SERVICES.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex gap-2">
                 <Button onClick={handleResetFilters} variant="ghost" className="w-full md:w-auto">
                    <RotateCcw className="mr-2 h-4 w-4" /> Reset
                </Button>
              </div>
            </div>
          </div>
          
          {isLoading && displayedAppointments.length === 0 ? ( // Show main loader only if initial data isn't even partially loaded
            <LoadingState />
          ) : totalFilteredCount === 0 && !isLoading ? (
            <NoHistoryCard />
          ) : (
            <>
              <p className="text-sm text-muted-foreground mb-4">
                Mostrando {displayedAppointments.length} de {totalFilteredCount} citas.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {displayedAppointments.map(appt => (
                  <AppointmentCard key={appt.id} appointment={appt} onUpdate={(updated) => {
                      // Optimistically update the specific card
                      setDisplayedAppointments(prev => prev.map(a => a.id === updated.id ? updated : a));
                      // Update in the main list as well for consistency if filters change
                      setAllLocationHistory(prev => prev.map(a => a.id === updated.id ? updated : a));
                  }} />
                ))}
              </div>
              {displayedAppointments.length < totalFilteredCount && (
                <div className="mt-8 text-center">
                  <Button onClick={handleLoadMore} variant="outline">
                    <ChevronsDown className="mr-2 h-4 w-4" /> Cargar Más
                  </Button>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
