
"use client";

import type { Appointment, Professional, Location } from '@/types';
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '@/contexts/auth-provider';
import { useAppState } from '@/contexts/app-state-provider';
import { getAppointments, getProfessionals, getLocations, getProfessionalAvailabilityForDate } from '@/lib/data';
import { USER_ROLES, LocationId, APPOINTMENT_STATUS } from '@/lib/constants';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from '@/components/ui/table';
import { format, startOfDay, parseISO, isEqual, addDays, subDays } from 'date-fns';
import { es } from 'date-fns/locale';
import { CalendarIcon, ChevronLeftIcon, ChevronRightIcon, AlertTriangle, Loader2, TrendingUp, DollarSign, Building } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';

interface ProfessionalDailyIncome {
  professionalId: string;
  professionalName: string;
  totalIncome: number;
  appointmentCount: number;
  workedAtLocations: string;
}

export default function PercentagesPage() {
  const { user } = useAuth();
  const { selectedLocationId } = useAppState();
  const [reportData, setReportData] = useState<ProfessionalDailyIncome[]>([]);
  const [currentDate, setCurrentDate] = useState<Date>(startOfDay(new Date()));
  const [locations, setLocations] = useState<Location[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const isAdminOrContador = user?.role === USER_ROLES.ADMIN || user?.role === USER_ROLES.CONTADOR;
  const effectiveLocationId = useMemo(() => {
    return isAdminOrContador
      ? (selectedLocationId === 'all' ? undefined : selectedLocationId as LocationId)
      : user?.locationId;
  }, [isAdminOrContador, selectedLocationId, user?.locationId]);

  useEffect(() => {
    async function loadLocations() {
      const fetchedLocations = await getLocations();
      setLocations(fetchedLocations);
    }
    loadLocations();
  }, []);

  const fetchDataForReport = useCallback(async () => {
    if (!effectiveLocationId || !user) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);

    try {
      // 1. Get all professionals and all completed appointments for the selected day across all locations
      const [allProfessionals, allAppointmentsResponse] = await Promise.all([
        getProfessionals(),
        getAppointments({ date: currentDate, statuses: [APPOINTMENT_STATUS.COMPLETED] })
      ]);
      const allDailyAppointments = allAppointmentsResponse.appointments || [];
      
      // 2. Determine which professionals worked at the selected `effectiveLocationId` on `currentDate`
      const professionalsInSede = new Set<string>();
      allProfessionals.forEach(prof => {
        const availability = getProfessionalAvailabilityForDate(prof, currentDate);
        if (availability?.isWorking && availability.workingLocationId === effectiveLocationId) {
          professionalsInSede.add(prof.id);
        }
      });
      
      // Also add any external professionals who had an appointment at this location
      allDailyAppointments.forEach(appt => {
        if (appt.locationId === effectiveLocationId && appt.professionalId) {
            professionalsInSede.add(appt.professionalId);
        }
      });


      // 3. Calculate total income for those professionals from all their appointments
      const incomeMap = new Map<string, ProfessionalDailyIncome>();
      
      allDailyAppointments.forEach(appt => {
        const profId = appt.professionalId;
        if (profId && professionalsInSede.has(profId)) {
          const profDetails = allProfessionals.find(p => p.id === profId);
          if (profDetails) {
            const entry = incomeMap.get(profId) || {
              professionalId: profId,
              professionalName: `${profDetails.firstName} ${profDetails.lastName}`,
              totalIncome: 0,
              appointmentCount: 0,
              workedAtLocations: ''
            };
            
            let appointmentIncome = appt.amountPaid || 0;
            if(appt.addedServices) {
                appointmentIncome += appt.addedServices.reduce((sum, as) => sum + (as.amountPaid || 0), 0);
            }

            entry.totalIncome += appointmentIncome;
            entry.appointmentCount += 1; // Count each main appointment
            
            incomeMap.set(profId, entry);
          }
        }
      });

      // 4. Determine where each professional worked
       incomeMap.forEach(entry => {
            const workedAtIds = new Set<LocationId>();
            allDailyAppointments.forEach(appt => {
                if (appt.professionalId === entry.professionalId) {
                    workedAtIds.add(appt.locationId);
                }
            });
            entry.workedAtLocations = Array.from(workedAtIds)
                .map(id => locations.find(l => l.id === id)?.name || id)
                .join(', ');
        });

      const sortedReport = Array.from(incomeMap.values()).sort((a, b) => b.totalIncome - a.totalIncome);
      setReportData(sortedReport);

    } catch (error) {
      console.error("Error generating percentages report:", error);
      setReportData([]);
    } finally {
      setIsLoading(false);
    }
  }, [currentDate, effectiveLocationId, user, locations]);

  useEffect(() => {
    if (locations.length > 0) {
      fetchDataForReport();
    }
  }, [fetchDataForReport, locations]);

  const handleDateChange = (date: Date | undefined) => {
    if (date) {
      setCurrentDate(startOfDay(date));
    }
  };

  const totalGeneralIncome = useMemo(() => {
    return reportData.reduce((sum, item) => sum + item.totalIncome, 0);
  }, [reportData]);

  const displayLocationName = effectiveLocationId 
    ? (locations.find(l => l.id === effectiveLocationId)?.name || `Sede Desconocida`) 
    : 'No se ha seleccionado sede';

  const LoadingState = () => (
    <div className="flex flex-col items-center justify-center h-64">
      <Loader2 className="h-12 w-12 animate-spin text-primary" />
      <p className="mt-4 text-muted-foreground">Calculando ingresos...</p>
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

  return (
    <div className="container mx-auto py-8 px-0 md:px-4 space-y-6">
      <Card className="shadow-lg">
        <CardHeader>
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div className="flex-grow">
              <CardTitle className="text-2xl flex items-center gap-2">
                <TrendingUp className="text-primary" />
                Análisis de Ingresos por Profesional
              </CardTitle>
              <CardDescription>
                Ingresos totales del día de los profesionales que trabajaron en {displayLocationName}.
              </CardDescription>
            </div>
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
            </div>
          </div>
           {isAdminOrContador && (
            <div className="mt-2 text-sm text-muted-foreground">
              Viendo para Sede: {selectedLocationId === 'all' ? 'Por favor, seleccione una sede' : locations.find(l => l.id === selectedLocationId)?.name || ''}
            </div>
          )}
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <LoadingState />
          ) : !effectiveLocationId ? (
            <NoDataCard title="Seleccione una Sede" message="Por favor, seleccione una sede específica desde el menú superior para ver el reporte." />
          ): reportData.length === 0 ? (
            <NoDataCard title="Sin Datos" message={`No se encontraron ingresos para profesionales que hayan trabajado en ${displayLocationName} en esta fecha.`} />
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Profesional</TableHead>
                    <TableHead>Sedes Trabajadas Hoy</TableHead>
                    <TableHead className="text-center">Citas Completadas</TableHead>
                    <TableHead className="text-right">Ingreso Total del Día (S/)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {reportData.map((item) => (
                    <TableRow key={item.professionalId}>
                      <TableCell className="font-medium">{item.professionalName}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        <Badge variant="outline">{item.workedAtLocations}</Badge>
                      </TableCell>
                      <TableCell className="text-center">{item.appointmentCount}</TableCell>
                      <TableCell className="text-right font-semibold text-primary">
                        {item.totalIncome.toFixed(2)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
