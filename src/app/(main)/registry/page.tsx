
"use client";

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import type { Appointment, Professional, LocationId, Service } from '@/types';
import { useAuth } from '@/contexts/auth-provider';
import { useAppState } from '@/contexts/app-state-provider';
import { getAppointments, getProfessionals, getServices } from '@/lib/data';
import { LOCATIONS, USER_ROLES, APPOINTMENT_STATUS, SERVICES as ALL_SERVICES_CONSTANTS } from '@/lib/constants';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableCaption } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { format, startOfDay, getMonth, getDate, startOfMonth, endOfMonth, addDays, getYear, subDays, setYear, setMonth, isSameDay, isAfter, subMonths } from 'date-fns';
import { es } from 'date-fns/locale';
import { CalendarIcon, Loader2, AlertTriangle, FileText, DollarSign, ChevronLeft, ChevronRight, ListChecks } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';


interface DailyActivityReportItem {
  type: 'daily';
  professionalId: string;
  professionalName: string;
  locationId: LocationId; // Added to ensure consistency
  locationName: string;
  totalServicesCount: number;
  servicesBreakdown: Array<{ serviceName: string; count: number }>;
  totalRevenue: number;
}

interface BiWeeklyEarningsReportItem {
  type: 'biWeekly';
  professionalId: string;
  professionalName: string;
  locationId: LocationId;
  locationName: string;
  biWeeklyEarnings: number;
}

interface GroupedBiWeeklyReportItem {
  type: 'biWeeklyGrouped';
  locationId: LocationId;
  locationName: string;
  professionals: BiWeeklyEarningsReportItem[];
  locationTotalEarnings: number;
}


type ReportItem = DailyActivityReportItem | BiWeeklyEarningsReportItem | GroupedBiWeeklyReportItem;
type ReportType = 'daily' | 'biWeekly';

const currentSystemYear = getYear(new Date());
const availableYearsForAdmin = [currentSystemYear, currentSystemYear - 1, currentSystemYear - 2];
const months = Array.from({ length: 12 }, (_, i) => ({
  value: i,
  label: format(new Date(currentSystemYear, i), 'MMMM', { locale: es }),
}));


export default function RegistryPage() {
  const { user } = useAuth();
  const { selectedLocationId: adminSelectedLocation } = useAppState();

  const [selectedDate, setSelectedDate] = useState<Date>(startOfDay(new Date()));
  const [reportData, setReportData] = useState<ReportItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [reportType, setReportType] = useState<ReportType>('daily');
  const [allServices, setAllServices] = useState<Service[]>([]);

  const [selectedYear, setSelectedYear] = useState<number>(getYear(new Date()));
  const [selectedMonth, setSelectedMonth] = useState<number>(getMonth(new Date())); 
  const [selectedQuincena, setSelectedQuincena] = useState<1 | 2>(getDate(new Date()) <= 15 ? 1 : 2);


  const isAdminOrContador = user?.role === USER_ROLES.ADMIN || user?.role === USER_ROLES.CONTADOR;
  const isStaffRestrictedView = useMemo(() => user?.role === USER_ROLES.LOCATION_STAFF, [user]);

  const effectiveLocationId = useMemo(() => {
    if (isAdminOrContador) {
      return adminSelectedLocation === 'all' ? undefined : adminSelectedLocation as LocationId;
    }
    return user?.locationId;
  }, [user, isAdminOrContador, adminSelectedLocation]);

  useEffect(() => {
    async function loadServices() {
        const servicesData = await getServices();
        setAllServices(servicesData);
    }
    loadServices();
  }, []);


  const fetchProfessionalsForReportContext = useCallback(async (locationContext?: LocationId | 'all') => {
    if (!user) return [];
    let profs: Professional[] = [];

    const targetLocation = locationContext === 'all' ? undefined : locationContext;

    if (isAdminOrContador) {
      if (targetLocation) { 
        profs = await getProfessionals(targetLocation);
      } else { 
        const allProfsPromises = LOCATIONS.map(loc => getProfessionals(loc.id));
        const results = await Promise.all(allProfsPromises);
        profs = results.flat();
      }
    } else if (user?.locationId) { 
      profs = await getProfessionals(user.locationId);
    }
    return profs;
  }, [user, isAdminOrContador]);


  useEffect(() => {
    const generateDailyReport = async () => {
      if (!user || allServices.length === 0) return;
      setIsLoading(true);

      const profContext = isAdminOrContador ? (adminSelectedLocation === 'all' ? 'all' : effectiveLocationId) : user?.locationId;
      const currentProfessionals = await fetchProfessionalsForReportContext(profContext);

      let appointmentsForDate: Appointment[] = [];
      if (isAdminOrContador && adminSelectedLocation === 'all') {
        const promises = LOCATIONS.map(loc => 
          getAppointments({ date: selectedDate, locationId: loc.id, statuses: [APPOINTMENT_STATUS.COMPLETED] })
        );
        const results = await Promise.all(promises);
        appointmentsForDate = results.flat();
      } else if (effectiveLocationId) {
        appointmentsForDate = await getAppointments({ date: selectedDate, locationId: effectiveLocationId, statuses: [APPOINTMENT_STATUS.COMPLETED] });
      }

      const dailyReportMap = new Map<string, Omit<DailyActivityReportItem, 'professionalName' | 'locationName' | 'type' | 'servicesBreakdown' | 'totalServicesCount' > & { locationId: LocationId, services: Map<string, { serviceName: string, count: number }> }>();

      appointmentsForDate.forEach(appt => {
        if (appt.professionalId && appt.status === APPOINTMENT_STATUS.COMPLETED) {
          const reportEntry = dailyReportMap.get(appt.professionalId) || {
            professionalId: appt.professionalId,
            locationId: appt.locationId,
            totalRevenue: 0,
            services: new Map<string, { serviceName: string, count: number }>(),
          };
          
          // Main service
          const mainServiceName = allServices.find(s => s.id === appt.serviceId)?.name || 'Servicio Desconocido';
          const mainServiceEntry = reportEntry.services.get(appt.serviceId) || { serviceName: mainServiceName, count: 0 };
          mainServiceEntry.count += 1;
          reportEntry.services.set(appt.serviceId, mainServiceEntry);

          // Added services
          appt.addedServices?.forEach(added => {
            const addedServiceName = allServices.find(s => s.id === added.serviceId)?.name || 'Servicio Adicional Desc.';
            const addedServiceEntry = reportEntry.services.get(added.serviceId) || { serviceName: addedServiceName, count: 0 };
            addedServiceEntry.count += 1;
            reportEntry.services.set(added.serviceId, addedServiceEntry);
          });
          
          reportEntry.totalRevenue += appt.amountPaid || 0;
          dailyReportMap.set(appt.professionalId, reportEntry);
        }
      });

      const finalReport: DailyActivityReportItem[] = Array.from(dailyReportMap.values()).map(item => {
        const professional = currentProfessionals.find(p => p.id === item.professionalId);
        const location = LOCATIONS.find(l => l.id === item.locationId);
        const servicesBreakdownArray = Array.from(item.services.values()).sort((a,b) => b.count - a.count);
        const totalServicesCount = servicesBreakdownArray.reduce((sum, s) => sum + s.count, 0);
        
        return {
          type: 'daily',
          professionalId: item.professionalId,
          locationId: item.locationId,
          totalRevenue: item.totalRevenue,
          professionalName: professional ? `${professional.firstName} ${professional.lastName}` : 'Desconocido',
          locationName: location ? location.name : 'Desconocida',
          servicesBreakdown: servicesBreakdownArray,
          totalServicesCount: totalServicesCount,
        };
      }).sort((a,b) => {
        if (isAdminOrContador && adminSelectedLocation === 'all') {
          const locCompare = a.locationName.localeCompare(b.locationName);
          if (locCompare !== 0) return locCompare;
        }
        return a.professionalName.localeCompare(b.professionalName);
      });

      setReportData(finalReport);
      setIsLoading(false);
    };

    const generateBiWeeklyReport = async () => {
      if (!user) return;
      setIsLoading(true);

      const profContext = isAdminOrContador ? (adminSelectedLocation === 'all' ? 'all' : effectiveLocationId) : user?.locationId;
      const professionalsList = await fetchProfessionalsForReportContext(profContext);
      
      const baseDate = setMonth(setYear(new Date(), selectedYear), selectedMonth);
      const startDate = selectedQuincena === 1 ? startOfMonth(baseDate) : addDays(startOfMonth(baseDate), 15);
      const endDate = selectedQuincena === 1 ? addDays(startOfMonth(baseDate), 14) : endOfMonth(baseDate);
      
      let appointmentsForPeriod: Appointment[] = [];
      if (isAdminOrContador && adminSelectedLocation === 'all') {
         const promises = LOCATIONS.map(loc => 
          getAppointments({ 
            locationId: loc.id, 
            statuses: [APPOINTMENT_STATUS.COMPLETED],
            dateRange: {start: startDate, end: endDate}
          })
        );
        const results = await Promise.all(promises);
        appointmentsForPeriod = results.flat();
      } else if (effectiveLocationId) {
        appointmentsForPeriod = await getAppointments({ 
            locationId: effectiveLocationId, 
            statuses: [APPOINTMENT_STATUS.COMPLETED],
            dateRange: {start: startDate, end: endDate} 
        });
      }

      const biWeeklyReportMap = new Map<string, { professionalId: string, locationId: LocationId, biWeeklyEarnings: number }>();

      professionalsList.forEach(prof => {
         biWeeklyReportMap.set(prof.id, { professionalId: prof.id, locationId: prof.locationId, biWeeklyEarnings: 0 });
      });
      
      appointmentsForPeriod.forEach(appt => {
        if (appt.professionalId && appt.status === APPOINTMENT_STATUS.COMPLETED) {
            const entry = biWeeklyReportMap.get(appt.professionalId);
            if (entry) {
                entry.biWeeklyEarnings += appt.amountPaid || 0;
                biWeeklyReportMap.set(appt.professionalId, entry);
            }
        }
      });
      
      if (isAdminOrContador && adminSelectedLocation === 'all') {
        const groupedResult: GroupedBiWeeklyReportItem[] = [];
        const professionalsByLocation = new Map<LocationId, BiWeeklyEarningsReportItem[]>();
        const locationTotals = new Map<LocationId, number>();

        Array.from(biWeeklyReportMap.values()).forEach(item => {
          const professional = professionalsList.find(p => p.id === item.professionalId);
          const location = LOCATIONS.find(l => l.id === item.locationId);
          if (!professional || !location) return;

          const reportItem: BiWeeklyEarningsReportItem = {
            type: 'biWeekly',
            professionalId: item.professionalId,
            professionalName: `${professional.firstName} ${professional.lastName}`,
            locationId: item.locationId,
            locationName: location.name,
            biWeeklyEarnings: item.biWeeklyEarnings,
          };

          if (!professionalsByLocation.has(item.locationId)) {
            professionalsByLocation.set(item.locationId, []);
            locationTotals.set(item.locationId, 0);
          }
          professionalsByLocation.get(item.locationId)!.push(reportItem);
          locationTotals.set(item.locationId, (locationTotals.get(item.locationId) || 0) + item.biWeeklyEarnings);
        });

        LOCATIONS.forEach(loc => {
          if (professionalsByLocation.has(loc.id) || locationTotals.has(loc.id)) { 
            const profsForLocation = professionalsByLocation.get(loc.id);
            groupedResult.push({
              type: 'biWeeklyGrouped',
              locationId: loc.id,
              locationName: loc.name,
              professionals: (profsForLocation || []).sort((a, b) => a.professionalName.localeCompare(b.professionalName)),
              locationTotalEarnings: locationTotals.get(loc.id) || 0,
            });
          }
        });
        
        groupedResult.sort((a,b) => a.locationName.localeCompare(b.locationName));
        setReportData(groupedResult);
      } else {
        const finalReport: BiWeeklyEarningsReportItem[] = Array.from(biWeeklyReportMap.values()).map(item => {
            const professional = professionalsList.find(p => p.id === item.professionalId);
            const location = LOCATIONS.find(l => l.id === item.locationId);
            return {
            type: 'biWeekly',
            professionalId: item.professionalId,
            professionalName: professional ? `${professional.firstName} ${professional.lastName}` : 'Desconocido',
            locationId: item.locationId,
            locationName: location ? location.name : 'Desconocida',
            biWeeklyEarnings: item.biWeeklyEarnings,
            };
        }).sort((a,b) => a.professionalName.localeCompare(b.professionalName));
        setReportData(finalReport);
      }
      
      setIsLoading(false);
    };

    if (reportType === 'daily') {
      generateDailyReport();
    } else if (reportType === 'biWeekly') {
      generateBiWeeklyReport();
    }

  }, [user, selectedDate, effectiveLocationId, adminSelectedLocation, fetchProfessionalsForReportContext, isAdminOrContador, reportType, selectedYear, selectedMonth, selectedQuincena, allServices]);

  const handleDateChange = (date: Date | undefined) => {
    if (date && reportType === 'daily') {
      setSelectedDate(startOfDay(date));
    }
  };
  
  const handleReportTypeChange = (value: string) => {
    setReportType(value as ReportType);
  }

  const totalServicesOverall = useMemo(() => {
    if (reportType === 'daily') {
      return (reportData as DailyActivityReportItem[]).reduce((sum, item) => sum + item.totalServicesCount, 0);
    }
    return 0;
  }, [reportData, reportType]);

  const totalRevenueOverall = useMemo(() => {
    if (reportType === 'daily') {
      return (reportData as DailyActivityReportItem[]).reduce((sum, item) => sum + item.totalRevenue, 0);
    } else if (reportType === 'biWeekly') {
      if (isAdminOrContador && adminSelectedLocation === 'all') {
        return (reportData as GroupedBiWeeklyReportItem[]).reduce((sum, group) => sum + (group.locationTotalEarnings || 0), 0);
      } else {
        return (reportData as BiWeeklyEarningsReportItem[]).reduce((sum, item) => sum + (item.biWeeklyEarnings || 0), 0);
      }
    }
    return 0;
  }, [reportData, reportType, isAdminOrContador, adminSelectedLocation]);
  
  const getBiWeeklyPeriodDescription = () => {
    const dateForDescription = setMonth(setYear(new Date(), selectedYear), selectedMonth);
    const monthName = format(dateForDescription, "MMMM", { locale: es });
    const year = selectedYear;

    if (selectedQuincena === 1) {
      return `Quincena: 1 al 15 de ${monthName}, ${year}`;
    } else {
      const endDayOfMonth = format(endOfMonth(dateForDescription), "d");
      return `Quincena: 16 al ${endDayOfMonth} de ${monthName}, ${year}`;
    }
  };
  
  const getBoundaryQuincenasForStaff = useCallback(() => {
    const today = new Date();
    const currentQYear = getYear(today);
    const currentQMonth = getMonth(today);
    const currentQDay = getDate(today);
    const currentQNumber = (currentQDay <= 15 ? 1 : 2) as 1 | 2;

    const latestAllowed = { year: currentQYear, month: currentQMonth, quincena: currentQNumber };

    let earliestAllowedYear = currentQYear;
    let earliestAllowedMonth = currentQMonth;
    let earliestAllowedQuincena: 1 | 2 = 1;

    if (currentQNumber === 2) {
        earliestAllowedQuincena = 1;
    } else { // currentQNumber === 1
        earliestAllowedQuincena = 2;
        const prevMonthDate = subMonths(today, 1);
        earliestAllowedMonth = getMonth(prevMonthDate);
        earliestAllowedYear = getYear(prevMonthDate);
    }
    const earliestAllowed = { year: earliestAllowedYear, month: earliestAllowedMonth, quincena: earliestAllowedQuincena };
    return { earliestAllowed, latestAllowed };
  }, []);


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
    
    if (isStaffRestrictedView) {
      const { earliestAllowed, latestAllowed } = getBoundaryQuincenasForStaff();
      const targetValue = newYear * 1000 + newMonth * 10 + newQuincena;
      const earliestValue = earliestAllowed.year * 1000 + earliestAllowed.month * 10 + earliestAllowed.quincena;
      const latestValue = latestAllowed.year * 1000 + latestAllowed.month * 10 + latestAllowed.quincena;

      if (targetValue < earliestValue || targetValue > latestValue) {
        return; 
      }
    } else { // Admin/Contador logic
      const today = new Date();
      const firstDayOfNewQuincena = newQuincena === 1 ? startOfMonth(setMonth(setYear(new Date(),newYear), newMonth)) : addDays(startOfMonth(setMonth(setYear(new Date(),newYear), newMonth)),15);
      
      if(isAfter(firstDayOfNewQuincena, today) && !isSameDay(firstDayOfNewQuincena, startOfDay(today))) {
          return; 
      }
      if (newYear < availableYearsForAdmin[availableYearsForAdmin.length -1]) {
          return;
      }
    }

    setSelectedYear(newYear);
    setSelectedMonth(newMonth);
    setSelectedQuincena(newQuincena as 1 | 2);
  };
  
  const isNextQuincenaDisabled = () => {
    if (isStaffRestrictedView) {
      const { latestAllowed } = getBoundaryQuincenasForStaff();
      return (
        selectedYear === latestAllowed.year &&
        selectedMonth === latestAllowed.month &&
        selectedQuincena === latestAllowed.quincena
      );
    }
    // Admin/Contador logic
    let nextQYear = selectedYear;
    let nextQMonth = selectedMonth;
    let nextQQuincena = selectedQuincena;

    if (nextQQuincena === 1) nextQQuincena = 2;
    else { nextQQuincena = 1; if (nextQMonth === 11) { nextQMonth = 0; nextQYear +=1; } else nextQMonth +=1; }
    
    const firstDayOfNextQ = nextQQuincena === 1 ? startOfMonth(setMonth(setYear(new Date(),nextQYear), nextQMonth)) : addDays(startOfMonth(setMonth(setYear(new Date(),nextQYear), nextQMonth)),15);
    return isAfter(firstDayOfNextQ, new Date()) && !isSameDay(firstDayOfNextQ, startOfDay(new Date()));
  };

  const isPrevQuincenaDisabled = () => {
     if (isStaffRestrictedView) {
      const { earliestAllowed } = getBoundaryQuincenasForStaff();
      return (
        selectedYear === earliestAllowed.year &&
        selectedMonth === earliestAllowed.month &&
        selectedQuincena === earliestAllowed.quincena
      );
    }
    // Admin/Contador logic
    let prevQYear = selectedYear;
    // Determine the year of the previous quincena for comparison with availableYearsForAdmin
    if (selectedQuincena === 1 && selectedMonth === 0) { // If 1st quincena of Jan, previous is 2nd quincena of Dec of prev year
        prevQYear -= 1;
    }
    return prevQYear < availableYearsForAdmin[availableYearsForAdmin.length-1];
  };


  const LoadingState = () => (
    <div className="flex flex-col items-center justify-center h-64">
      <Loader2 className="h-12 w-12 animate-spin text-primary" />
      <p className="mt-4 text-muted-foreground">Cargando registro...</p>
    </div>
  );

  const NoDataState = () => (
     <TableRow>
        <TableCell colSpan={reportType === 'daily' && isAdminOrContador && adminSelectedLocation === 'all' ? 4 : (reportType === 'biWeekly' && isAdminOrContador && adminSelectedLocation === 'all' ? 3 : (reportType === 'daily' ? 3 : 2) ) } className="h-24 text-center">
          <AlertTriangle className="mx-auto h-8 w-8 text-muted-foreground mb-2" />
           {reportType === 'daily' ? 'No hay actividad registrada para este día y selección.' : 'No hay datos de ingresos quincenales para este periodo y selección.'}
        </TableCell>
      </TableRow>
  );


  return (
    <div className="container mx-auto py-8 px-4 md:px-0 space-y-6">
      <Card className="shadow-lg">
        <CardHeader>
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div className="flex-grow">
              <CardTitle className="text-3xl flex items-center gap-2">
                <FileText className="text-primary" />
                Registro de Actividad
              </CardTitle>
              <CardDescription>
                {reportType === 'daily' 
                  ? 'Servicios realizados e ingresos generados por profesional en el día seleccionado.'
                  : `Ingresos quincenales generados por profesional. (${getBiWeeklyPeriodDescription()})`}
              </CardDescription>
            </div>
            <div className="flex flex-col sm:flex-row gap-2 w-full md:w-auto">
              <Select value={reportType} onValueChange={handleReportTypeChange}>
                <SelectTrigger className="w-full sm:w-[180px]">
                  <SelectValue placeholder="Tipo de Reporte" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="daily">Diario</SelectItem>
                  <SelectItem value="biWeekly">Quincenal</SelectItem>
                </SelectContent>
              </Select>
              {reportType === 'daily' && (
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className={cn("w-full sm:w-[240px] justify-start text-left font-normal", !selectedDate && "text-muted-foreground")}>
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {selectedDate ? format(selectedDate, "PPP", { locale: es }) : <span>Seleccionar fecha</span>}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar mode="single" selected={selectedDate} onSelect={handleDateChange} initialFocus />
                  </PopoverContent>
                </Popover>
              )}
               {reportType === 'biWeekly' && (
                <div className="flex items-center gap-2">
                    <Button variant="outline" size="icon" onClick={() => navigateQuincena('prev')} disabled={isPrevQuincenaDisabled()}>
                        <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <Select value={String(selectedYear)} onValueChange={(val) => setSelectedYear(Number(val))} disabled={isStaffRestrictedView}>
                        <SelectTrigger className="w-[100px]"><SelectValue /></SelectTrigger>
                        <SelectContent>{(isStaffRestrictedView ? [getBoundaryQuincenasForStaff().earliestAllowed.year, getBoundaryQuincenasForStaff().latestAllowed.year] : availableYearsForAdmin).filter((y,i,self) => self.indexOf(y) === i).map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
                    </Select>
                    <Select value={String(selectedMonth)} onValueChange={(val) => setSelectedMonth(Number(val))} disabled={isStaffRestrictedView}>
                        <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
                        <SelectContent>{months.map(m => <SelectItem key={m.value} value={String(m.value)}>{m.label}</SelectItem>)}</SelectContent>
                    </Select>
                    <Select value={String(selectedQuincena)} onValueChange={(val) => setSelectedQuincena(Number(val) as 1 | 2)} disabled={isStaffRestrictedView}>
                        <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="1">1ra Quincena</SelectItem>
                            <SelectItem value="2">2da Quincena</SelectItem>
                        </SelectContent>
                    </Select>
                     <Button variant="outline" size="icon" onClick={() => navigateQuincena('next')} disabled={isNextQuincenaDisabled()}>
                        <ChevronRight className="h-4 w-4" />
                    </Button>
                </div>
              )}
            </div>
          </div>
          {isAdminOrContador && (
            <div className="mt-2 text-sm text-muted-foreground">
              Viendo para: {adminSelectedLocation === 'all' ? 'Todas las sedes' : LOCATIONS.find(l => l.id === adminSelectedLocation)?.name || 'Sede no especificada'}
            </div>
          )}
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <LoadingState />
          ) : (
            <Table>
              <TableCaption>
                {reportData.length > 0
                  ? reportType === 'daily'
                    ? (
                        isStaffRestrictedView
                        ? `Resumen del ${format(selectedDate, "PPP", { locale: es })}. Total Servicios Atendidos: ${totalServicesOverall}`
                        : `Resumen del ${format(selectedDate, "PPP", { locale: es })}. Total Servicios Atendidos: ${totalServicesOverall}, Total Ingresos: S/ ${totalRevenueOverall.toFixed(2)}`
                      )
                    : ( // reportType === 'biWeekly'
                        isStaffRestrictedView
                        ? `Resumen Quincenal (${getBiWeeklyPeriodDescription()}).`
                        : `Resumen Quincenal (${getBiWeeklyPeriodDescription()}). Total Ingresos Quincenales: S/ ${totalRevenueOverall.toFixed(2)}`
                      )
                  : reportType === 'daily' // No data part
                    ? `No hay datos para el ${format(selectedDate, "PPP", { locale: es })}.`
                    : `No hay datos quincenales para el periodo ${getBiWeeklyPeriodDescription()}.`
                }
              </TableCaption>
              <TableHeader>
                <TableRow>
                  <TableHead>Profesional</TableHead>
                  {(isAdminOrContador && adminSelectedLocation === 'all') && <TableHead>Sede</TableHead>}
                  {reportType === 'daily' && <TableHead className="text-left">Servicios Realizados</TableHead>}
                  <TableHead className="text-right">
                    {reportType === 'daily' ? 'Ingresos Diarios (S/)' : 'Ingresos Quincenales (S/)'}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {reportData.length === 0 ? <NoDataState /> :
                  (reportType === 'biWeekly' && isAdminOrContador && adminSelectedLocation === 'all') ? (
                    (reportData as GroupedBiWeeklyReportItem[]).map(group => (
                      <React.Fragment key={group.locationId}>
                        {(group.professionals || []).map(item => (
                          <TableRow key={item.professionalId}>
                            <TableCell className="font-medium">{item.professionalName}</TableCell>
                            <TableCell>{item.locationName}</TableCell>
                            <TableCell className="text-right">{(item.biWeeklyEarnings || 0).toFixed(2)}</TableCell>
                          </TableRow>
                        ))}
                        <TableRow className="bg-muted/50 font-semibold" key={`total-row-${group.locationId}`}>
                          <TableCell colSpan={2}>Total {group.locationName}</TableCell>
                          <TableCell className="text-right">{(group.locationTotalEarnings || 0).toFixed(2)}</TableCell>
                        </TableRow>
                      </React.Fragment>
                    ))
                  ) : (
                    (reportData as (DailyActivityReportItem | BiWeeklyEarningsReportItem)[]).map(item => (
                      <TableRow key={item.professionalId + (item.type === 'daily' ? item.locationName : (item as BiWeeklyEarningsReportItem).locationId || '') + (item.type === 'biWeekly' ? selectedYear +'-'+selectedMonth+'-'+selectedQuincena : '')}>
                        <TableCell className="font-medium">{item.professionalName}</TableCell>
                        {(isAdminOrContador && adminSelectedLocation === 'all' && item.type !== 'biWeeklyGrouped') && <TableCell>{item.locationName}</TableCell>}
                        {item.type === 'daily' && (
                          <TableCell>
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                    <Badge variant="secondary" className="cursor-default">
                                        {item.totalServicesCount} servicio(s)
                                    </Badge>
                                </TooltipTrigger>
                                <TooltipContent className="max-w-xs">
                                    <ScrollArea className="max-h-40">
                                    <ul className="list-none p-0 m-0 space-y-1 text-xs">
                                    {item.servicesBreakdown.map(s => (
                                        <li key={s.serviceName} className="flex justify-between">
                                        <span>{s.serviceName}</span>
                                        <Badge variant="outline" className="ml-2">{s.count}</Badge>
                                        </li>
                                    ))}
                                    </ul>
                                    </ScrollArea>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          </TableCell>
                        )}
                        <TableCell className="text-right">
                          {item.type === 'daily' ? (item.totalRevenue || 0).toFixed(2) : ((item as BiWeeklyEarningsReportItem).biWeeklyEarnings || 0).toFixed(2)}
                        </TableCell>
                      </TableRow>
                    ))
                  )
                }
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}



