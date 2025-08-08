
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
import { CalendarIcon, ChevronLeftIcon, ChevronRightIcon, AlertTriangle, Loader2, TrendingUp, DollarSign, Building, Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';


interface ProfessionalIncomeReport {
  professionalId: string;
  professionalName: string;
  incomeInSelectedLocation: number;
  appointmentsInSelectedLocation: number;
  totalIncomeAllLocations: number;
  totalAppointmentsAllLocations: number;
}


export default function PercentagesPage() {
  const { user } = useAuth();
  const { selectedLocationId } = useAppState();
  const [reportData, setReportData] = useState<ProfessionalIncomeReport[]>([]);
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
      
      // Fetch appointments from ALL locations to calculate total income
      const dateRange = { start: startDate, end: endDate };
      const allAppointmentsResponse = await getAppointments({ 
        dateRange, 
        statuses: [APPOINTMENT_STATUS.COMPLETED] 
      });
      const allPeriodAppointments = allAppointmentsResponse.appointments || [];

      const incomeMap = new Map<string, ProfessionalIncomeReport>();
      
      // Initialize map for native professionals of the selected location
      nativeProfessionals.forEach(prof => {
        incomeMap.set(prof.id, {
          professionalId: prof.id,
          professionalName: `${prof.firstName} ${prof.lastName}`,
          incomeInSelectedLocation: 0,
          appointmentsInSelectedLocation: 0,
          totalIncomeAllLocations: 0,
          totalAppointmentsAllLocations: 0
        });
      });

      // Iterate through all appointments from all locations to calculate totals
      allPeriodAppointments.forEach(appt => {
        const profId = appt.professionalId;
        
        // Check if the appointment's professional is one of the native professionals we are tracking
        if (profId && incomeMap.has(profId)) {
          const entry = incomeMap.get(profId)!;
          
          let appointmentIncome = (appt.amountPaid || 0) + (appt.addedServices || []).reduce((sum, as) => sum + (as.amountPaid || 0), 0);

          // Add to total income across all locations
          entry.totalIncomeAllLocations += appointmentIncome;
          entry.totalAppointmentsAllLocations += 1;

          // Add to income in the selected location ONLY if the appointment was there
          if (appt.locationId === effectiveLocationId) {
            entry.incomeInSelectedLocation += appointmentIncome;
            entry.appointmentsInSelectedLocation += 1;
          }
        }
      });

      const finalReportData = Array.from(incomeMap.values()).filter(item => item.totalAppointmentsAllLocations > 0);
      const sortedReport = finalReportData.sort((a, b) => b.totalIncomeAllLocations - a.totalIncomeAllLocations);
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


  const totalIncomeInSede = useMemo(() => {
    return reportData.reduce((sum, item) => sum + item.incomeInSelectedLocation, 0);
  }, [reportData]);
  
  const totalIncomeGeneral = useMemo(() => {
    return reportData.reduce((sum, item) => sum + item.totalIncomeAllLocations, 0);
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
                Ingresos de los profesionales NATIVOS de {displayLocationName} durante la quincena actual.
                 <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Info className="inline-block ml-2 h-4 w-4 text-muted-foreground cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Este reporte muestra el rendimiento de los profesionales cuya sede base es la seleccionada, <br/> detallando sus ingresos en esta sede y su total en todas las sedes.</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
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
                    <TableHead className="text-center">Citas en Sede Actual</TableHead>
                    <TableHead className="text-right">Ingreso en Sede Actual (S/)</TableHead>
                    <TableHead className="text-right font-bold">Ingreso Total Quincenal (S/)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {reportData.map((item) => (
                    <TableRow key={item.professionalId}>
                      <TableCell className="font-medium">{item.professionalName}</TableCell>
                      <TableCell className="text-center">{item.appointmentsInSelectedLocation}</TableCell>
                      <TableCell className="text-right font-semibold text-primary">
                        {item.incomeInSelectedLocation.toFixed(2)}
                      </TableCell>
                       <TableCell className="text-right font-bold text-lg">
                        {item.totalIncomeAllLocations.toFixed(2)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
                 <CardFooter className="p-2 justify-end bg-muted/50">
                    <div className="flex flex-col items-end text-sm">
                      <p>
                        <span className="font-semibold">Total en {displayLocationName}: </span>
                        <span className="font-bold text-primary">S/ {totalIncomeInSede.toFixed(2)}</span>
                      </p>
                       <p className="mt-1">
                        <span className="font-semibold">Total General de estos Profesionales: </span>
                         <span className="font-bold text-lg">S/ {totalIncomeGeneral.toFixed(2)}</span>
                      </p>
                    </div>
                </CardFooter>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

