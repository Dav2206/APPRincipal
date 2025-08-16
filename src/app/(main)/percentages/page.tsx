
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { format, startOfDay, parseISO, isEqual, addDays, subDays, startOfMonth, endOfMonth, getDate, getYear, getMonth, setYear, setMonth, isAfter, subMonths } from 'date-fns';
import { es } from 'date-fns/locale';
import { CalendarIcon, ChevronLeftIcon, ChevronRightIcon, AlertTriangle, Loader2, TrendingUp, DollarSign, Building, Info, Briefcase } from 'lucide-react';
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
  workedDaysInSede: number;
}

const currentSystemYear = getYear(new Date());
const availableYears = [currentSystemYear, currentSystemYear - 1, currentSystemYear - 2];
const months = Array.from({ length: 12 }, (_, i) => ({
  value: i,
  label: format(new Date(currentSystemYear, i), 'MMMM', { locale: es }),
}));


export default function PercentagesPage() {
  const { user } = useAuth();
  const { selectedLocationId } = useAppState();
  const [reportData, setReportData] = useState<ProfessionalIncomeReport[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [selectedYear, setSelectedYear] = useState<number>(getYear(new Date()));
  const [selectedMonth, setSelectedMonth] = useState<number>(getMonth(new Date()));
  const [selectedQuincena, setSelectedQuincena] = useState<1 | 2>(getDate(new Date()) <= 15 ? 1 : 2);


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

    const baseDate = setMonth(setYear(new Date(), selectedYear), selectedMonth);
    const startDate = selectedQuincena === 1 ? startOfMonth(baseDate) : addDays(startOfMonth(baseDate), 15);
    const endDate = selectedQuincena === 1 ? addDays(startOfMonth(baseDate), 14) : endOfMonth(baseDate);


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
        let workedDays = 0;
        let currentDate = startDate;
        while (currentDate <= endDate) {
            const availability = getProfessionalAvailabilityForDate(prof, currentDate);
            if (availability?.isWorking && availability.workingLocationId === effectiveLocationId) {
                workedDays++;
            }
            currentDate = addDays(currentDate, 1);
        }

        incomeMap.set(prof.id, {
          professionalId: prof.id,
          professionalName: `${prof.firstName} ${prof.lastName}`,
          incomeInSelectedLocation: 0,
          appointmentsInSelectedLocation: 0,
          totalIncomeAllLocations: 0,
          totalAppointmentsAllLocations: 0,
          workedDaysInSede: workedDays,
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

      const finalReportData = Array.from(incomeMap.values()).filter(item => item.totalAppointmentsAllLocations > 0 || item.workedDaysInSede > 0);
      const sortedReport = finalReportData.sort((a, b) => b.totalIncomeAllLocations - a.totalIncomeAllLocations);
      setReportData(sortedReport);

    } catch (error) {
      console.error("Error generating percentages report:", error);
      setReportData([]);
    } finally {
      setIsLoading(false);
    }
  }, [effectiveLocationId, user, locations, selectedYear, selectedMonth, selectedQuincena]);


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
  
  const navigateQuincena = (direction: 'prev' | 'next') => {
    let newYear = selectedYear;
    let newMonth = selectedMonth;
    let newQuincena = selectedQuincena;

    if (direction === 'next') {
      if (newQuincena === 1) {
        newQuincena = 2;
      } else {
        newQuincena = 1;
        if (newMonth === 11) {
          newMonth = 0;
          newYear += 1;
        } else {
          newMonth += 1;
        }
      }
    } else {
      if (newQuincena === 2) {
        newQuincena = 1;
      } else {
        newQuincena = 2;
        if (newMonth === 0) {
          newMonth = 11;
          newYear -= 1;
        } else {
          newMonth -= 1;
        }
      }
    }
    
    // Prevent navigating to a future quincena
    const today = new Date();
    const firstDayOfNewQuincena = newQuincena === 1 ? startOfMonth(setMonth(setYear(new Date(),newYear), newMonth)) : addDays(startOfMonth(setMonth(setYear(new Date(),newYear), newMonth)),15);
    if(isAfter(firstDayOfNewQuincena, today) && !isEqual(startOfDay(firstDayOfNewQuincena), startOfDay(today))) {
        return;
    }

    if (newYear < availableYears[availableYears.length -1]) {
        return;
    }

    setSelectedYear(newYear);
    setSelectedMonth(newMonth);
    setSelectedQuincena(newQuincena as 1 | 2);
  };
  
  const isNextQuincenaDisabled = () => {
    let nextQYear = selectedYear;
    let nextQMonth = selectedMonth;
    let nextQQuincena = selectedQuincena;

    if (nextQQuincena === 1) nextQQuincena = 2;
    else { nextQQuincena = 1; if (nextQMonth === 11) { nextQMonth = 0; nextQYear +=1; } else nextQMonth +=1; }
    
    const firstDayOfNextQ = nextQQuincena === 1 ? startOfMonth(setMonth(setYear(new Date(),nextQYear), nextQMonth)) : addDays(startOfMonth(setMonth(setYear(new Date(),nextQYear), nextQMonth)),15);
    return isAfter(firstDayOfNextQ, new Date()) && !isEqual(startOfDay(firstDayOfNextQ), startOfDay(new Date()));
  };

  const isPrevQuincenaDisabled = () => {
    let prevQYear = selectedYear;
    if (selectedQuincena === 1 && selectedMonth === 0) { 
        prevQYear -= 1;
    }
    return prevQYear < availableYears[availableYears.length-1];
  };

  const displayLocationName = effectiveLocationId 
    ? (locations.find(l => l.id === effectiveLocationId)?.name || `Sede Desconocida`) 
    : 'No se ha seleccionado sede';

    const getBiWeeklyPeriodDescription = () => {
        const dateForDescription = setMonth(setYear(new Date(), selectedYear), selectedMonth);
        const monthName = format(dateForDescription, "MMMM", { locale: es });
        const year = selectedYear;

        if (selectedQuincena === 1) {
            return `Quincena del 1 al 15 de ${monthName}, ${year}`;
        } else {
            const endDayOfMonth = format(endOfMonth(dateForDescription), "d");
            return `Quincena del 16 al ${endDayOfMonth} de ${monthName}, ${year}`;
        }
    };


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
                Ingresos de los profesionales NATIVOS de {displayLocationName}.
                 <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Info className="inline-block ml-2 h-4 w-4 text-muted-foreground cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Este reporte muestra el rendimiento de los profesionales cuya sede base es la seleccionada, <br/> detallando sus ingresos en esta sede y su total en todas las sedes para la quincena elegida.</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </CardDescription>
              <div className="mt-4 flex items-center gap-2 flex-wrap">
                    <Button variant="outline" size="icon" onClick={() => navigateQuincena('prev')} disabled={isPrevQuincenaDisabled()}>
                        <ChevronLeftIcon className="h-4 w-4" />
                    </Button>
                     <Select value={String(selectedYear)} onValueChange={(val) => setSelectedYear(Number(val))}>
                        <SelectTrigger className="w-[100px]"><SelectValue /></SelectTrigger>
                        <SelectContent>{availableYears.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
                    </Select>
                    <Select value={String(selectedMonth)} onValueChange={(val) => setSelectedMonth(Number(val))}>
                        <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
                        <SelectContent>{months.map(m => <SelectItem key={m.value} value={String(m.value)}>{m.label}</SelectItem>)}</SelectContent>
                    </Select>
                    <Select value={String(selectedQuincena)} onValueChange={(val) => setSelectedQuincena(Number(val) as 1 | 2)}>
                        <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="1">1ra Quincena</SelectItem>
                            <SelectItem value="2">2da Quincena</SelectItem>
                        </SelectContent>
                    </Select>
                     <Button variant="outline" size="icon" onClick={() => navigateQuincena('next')} disabled={isNextQuincenaDisabled()}>
                        <ChevronRightIcon className="h-4 w-4" />
                    </Button>
                </div>
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
                    <TableHead className="text-center">
                        <div className="flex items-center justify-center gap-1">
                            Días Laborados
                            <TooltipProvider>
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <Info className="h-3 w-3 text-muted-foreground cursor-help" />
                                    </TooltipTrigger>
                                    <TooltipContent>
                                        <p className="text-xs">Días trabajados en la sede actual durante la quincena, según horario y excepciones.</p>
                                    </TooltipContent>
                                </Tooltip>
                            </TooltipProvider>
                        </div>
                    </TableHead>
                    <TableHead className="text-center">Citas en Sede Actual</TableHead>
                    <TableHead className="text-right">Ingreso en Sede Actual (S/)</TableHead>
                    <TableHead className="text-right font-bold">Ingreso Total Quincenal (S/)</TableHead>
                    <TableHead className="text-right">
                       <div className="flex items-center justify-end gap-1">
                          Promedio
                          <TooltipProvider>
                              <Tooltip>
                                  <TooltipTrigger asChild>
                                      <Info className="h-3 w-3 text-muted-foreground cursor-help" />
                                  </TooltipTrigger>
                                  <TooltipContent>
                                      <p className="text-xs">(Ingreso Total / 52.5) / Días Laborados</p>
                                  </TooltipContent>
                              </Tooltip>
                          </TooltipProvider>
                        </div>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {reportData.map((item) => {
                    const average = item.workedDaysInSede > 0 ? (item.totalIncomeAllLocations / 52.5) / item.workedDaysInSede : 0;
                    return (
                    <TableRow key={item.professionalId}>
                      <TableCell className="font-medium">{item.professionalName}</TableCell>
                      <TableCell className="text-center">{item.workedDaysInSede}</TableCell>
                      <TableCell className="text-center">{item.appointmentsInSelectedLocation}</TableCell>
                      <TableCell className="text-right font-semibold text-primary">
                        {item.incomeInSelectedLocation.toFixed(2)}
                      </TableCell>
                       <TableCell className="text-right font-bold text-lg">
                        {item.totalIncomeAllLocations.toFixed(2)}
                      </TableCell>
                      <TableCell className="text-right">
                        {average.toFixed(2)}
                      </TableCell>
                    </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
