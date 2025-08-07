
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { format, startOfDay, parseISO, isEqual, addDays, subDays, startOfMonth, endOfMonth, getDate } from 'date-fns';
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

    const today = new Date();
    const dayOfMonth = getDate(today);
    const startDate = dayOfMonth <= 15 ? startOfMonth(today) : addDays(startOfMonth(today), 15);
    const endDate = dayOfMonth <= 15 ? addDays(startOfMonth(today), 14) : endOfMonth(today);

    try {
      // Fetch only professionals whose base location is the one selected
      const nativeProfessionals = await getProfessionals(effectiveLocationId);
      
      const dateRange = { start: startDate, end: endDate };
      const allAppointmentsResponse = await getAppointments({ dateRange, statuses: [APPOINTMENT_STATUS.COMPLETED] });
      const allPeriodAppointments = allAppointmentsResponse.appointments || [];

      const incomeMap = new Map<string, ProfessionalDailyIncome>();
      
      // Initialize map for native professionals
      nativeProfessionals.forEach(prof => {
        incomeMap.set(prof.id, {
          professionalId: prof.id,
          professionalName: `${prof.firstName} ${prof.lastName}`,
          totalIncome: 0,
          appointmentCount: 0,
          workedAtLocations: ''
        });
      });

      allPeriodAppointments.forEach(appt => {
        const profId = appt.professionalId;
        // Check if the appointment's professional is in our list of native professionals
        if (profId && incomeMap.has(profId)) {
          const entry = incomeMap.get(profId)!;
          
          let appointmentIncome = appt.amountPaid || 0;
          if (appt.addedServices) {
              appointmentIncome += appt.addedServices.reduce((sum, as) => sum + (as.amountPaid || 0), 0);
          }

          entry.totalIncome += appointmentIncome;
          entry.appointmentCount += 1;
        }
      });
      
       incomeMap.forEach(entry => {
            const workedAtIds = new Set<LocationId>();
            allPeriodAppointments.forEach(appt => {
                if (appt.professionalId === entry.professionalId) {
                    workedAtIds.add(appt.locationId);
                }
            });
            entry.workedAtLocations = Array.from(workedAtIds)
                .map(id => locations.find(l => l.id === id)?.name || id)
                .join(', ');
        });

      // Filter out professionals who had no income in the period
      const finalReportData = Array.from(incomeMap.values()).filter(item => item.appointmentCount > 0);
      const sortedReport = finalReportData.sort((a, b) => b.totalIncome - a.totalIncome);
      setReportData(sortedReport);

    } catch (error) {
      console.error("Error generating percentages report:", error);
      setReportData([]);
    } finally {
      setIsLoading(false);
    }
  }, [effectiveLocationId, user, locations]);

  useEffect(() => {
    if (locations.length > 0) {
      fetchDataForReport();
    }
  }, [fetchDataForReport, locations]);


  const totalGeneralIncome = useMemo(() => {
    return reportData.reduce((sum, item) => sum + item.totalIncome, 0);
  }, [reportData]);

  const displayLocationName = effectiveLocationId 
    ? (locations.find(l => l.id === effectiveLocationId)?.name || `Sede Desconocida`) 
    : 'No se ha seleccionado sede';

    const today = new Date();
    const dayOfMonth = getDate(today);
    const quincenaDescription = dayOfMonth <= 15 
        ? `Quincena del 1 al 15 de ${format(today, 'MMMM', {locale: es})}` 
        : `Quincena del 16 al ${format(endOfMonth(today), 'd', {locale: es})} de ${format(today, 'MMMM', {locale: es})}`;


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
                Ingresos de la quincena actual de los profesionales NATIVOS de {displayLocationName}.
              </CardDescription>
              <p className="text-sm font-semibold text-primary mt-2">{quincenaDescription}</p>
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
            <NoDataCard title="Sin Datos" message={`No se encontraron ingresos para los profesionales nativos de ${displayLocationName} en esta quincena.`} />
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Profesional</TableHead>
                    <TableHead>Sedes Trabajadas en el Periodo</TableHead>
                    <TableHead className="text-center">Citas Completadas</TableHead>
                    <TableHead className="text-right">Ingreso Total Quincenal (S/)</TableHead>
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
