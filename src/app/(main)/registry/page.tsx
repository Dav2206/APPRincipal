
"use client";

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import type { Appointment, Professional, LocationId, Service, Location, PaymentMethod } from '@/types';
import { useAuth } from '@/contexts/auth-provider';
import { useAppState } from '@/contexts/app-state-provider';
import { getAppointments, getProfessionals, getServices, getContractDisplayStatus, getLocations } from '@/lib/data';
import { USER_ROLES, APPOINTMENT_STATUS } from '@/lib/constants';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableCaption } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { format, startOfDay, getMonth, getDate, startOfMonth, endOfMonth, addDays, getYear, subDays, setYear, setMonth, isSameDay, isAfter, subMonths, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { CalendarIcon, Loader2, AlertTriangle, FileText, DollarSign, ChevronLeft, ChevronRight, ListChecks, Landmark } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';


interface DailyActivityReportItem {
  type: 'daily';
  professionalId: string;
  professionalName: string;
  locationId: LocationId; 
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

interface DailyTotalsByLocation {
    locationId: LocationId;
    locationName: string;
    totalRevenue: number;
    totalsByMethod: Record<PaymentMethod, number>;
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
  const [dailyTotalsByLocation, setDailyTotalsByLocation] = useState<DailyTotalsByLocation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [reportType, setReportType] = useState<ReportType>('daily');
  const [allServices, setAllServices] = useState<Service[] | null>(null);
  const [locations, setLocations] = useState<Location[]>([]);


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
    async function loadInitialData() {
        const [servicesArray, locationsArray] = await Promise.all([
          getServices(),
          getLocations()
        ]);
        setAllServices(servicesArray || []);
        setLocations(locationsArray || []);
    }
    loadInitialData();
  }, []);


  const fetchProfessionalsForReportContext = useCallback(async (locationContext?: LocationId | 'all') => {
    if (!user) return [];
    
    // For daily report context, we always fetch all professionals to correctly map names
    // for external professionals who might have worked at the current location.
    if (reportType === 'daily') {
        const allProfs = await getProfessionals(undefined); // Fetch all
        return allProfs;
    }
    
    // For bi-weekly report, the original logic applies
    let profs: Professional[] = [];
    const targetLocation = locationContext === 'all' ? undefined : locationContext;

    if (isAdminOrContador) {
      if (targetLocation) {
        profs = await getProfessionals(targetLocation);
      } else {
        const allProfsPromises = locations.map(loc => getProfessionals(loc.id));
        const results = await Promise.all(allProfsPromises);
        profs = results.flat();
      }
    } else if (user?.locationId) {
      profs = await getProfessionals(user.locationId);
    }
    return profs;
  }, [user, isAdminOrContador, locations, reportType]);


  useEffect(() => {
    const generateDailyReport = async () => {
      if (!user || !allServices || allServices.length === 0 || locations.length === 0) { 
        setIsLoading(false);
        return;
      }
      setIsLoading(true);

      // We fetch ALL professionals to ensure we can map names correctly, even for those from other locations.
      const allSystemProfessionals = await fetchProfessionalsForReportContext();
      
      let appointmentsForDateResponse: { appointments: Appointment[] };
      if (isAdminOrContador && adminSelectedLocation === 'all') {
        const promises = locations.map(loc =>
          getAppointments({ date: selectedDate, locationId: loc.id, statuses: [APPOINTMENT_STATUS.COMPLETED] })
        );
        const results = await Promise.all(promises);
        const flatAppointments = results.map(r => r.appointments || []).flat();
        appointmentsForDateResponse = { appointments: flatAppointments };

      } else if (effectiveLocationId) {
        appointmentsForDateResponse = await getAppointments({ date: selectedDate, locationId: effectiveLocationId, statuses: [APPOINTMENT_STATUS.COMPLETED] });
      } else {
        appointmentsForDateResponse = { appointments: [] };
      }
      
      const appointmentsForDate = appointmentsForDateResponse.appointments || [];

      const dailyReportMap = new Map<string, Omit<DailyActivityReportItem, 'professionalName' | 'locationName' | 'type' > & { services: Map<string, { serviceName: string, count: number }> }>();
      const locationTotalsMap = new Map<LocationId, DailyTotalsByLocation>();

      appointmentsForDate.forEach(appt => {
        if (appt.status !== APPOINTMENT_STATUS.COMPLETED || !allServices) {
          return;
        }

        // --- Logic for Daily Totals by Payment Method ---
        if (appt.amountPaid && appt.amountPaid > 0 && appt.paymentMethod) {
            const locTotals = locationTotalsMap.get(appt.locationId) || {
                locationId: appt.locationId,
                locationName: locations.find(l => l.id === appt.locationId)?.name || 'Desconocida',
                totalRevenue: 0,
                totalsByMethod: {}
            };
            locTotals.totalRevenue += appt.amountPaid;
            locTotals.totalsByMethod[appt.paymentMethod] = (locTotals.totalsByMethod[appt.paymentMethod] || 0) + appt.amountPaid;
            
            // Also account for added services payments under the same main payment method
            appt.addedServices?.forEach(added => {
                if (added.amountPaid && added.amountPaid > 0) {
                     locTotals.totalRevenue += added.amountPaid;
                     locTotals.totalsByMethod[appt.paymentMethod!] = (locTotals.totalsByMethod[appt.paymentMethod!] || 0) + added.amountPaid;
                }
            });
            locationTotalsMap.set(appt.locationId, locTotals);
        }

        // --- Logic for Professional Activity Breakdown ---
        if (appt.professionalId) {
          const professionalIdPrincipal = appt.professionalId;
          const reportEntryPrincipal = dailyReportMap.get(professionalIdPrincipal) || {
            professionalId: professionalIdPrincipal,
            locationId: appt.locationId, 
            totalRevenue: 0,
            services: new Map<string, { serviceName: string, count: number }>(),
          };

          const mainServiceName = allServices.find(s => s.id === appt.serviceId)?.name || 'Servicio Principal Desc.';
          const mainServiceEntry = reportEntryPrincipal.services.get(appt.serviceId) || { serviceName: mainServiceName, count: 0 };
          mainServiceEntry.count += 1;
          reportEntryPrincipal.services.set(appt.serviceId, mainServiceEntry);

          if (typeof appt.amountPaid === 'number' && appt.amountPaid > 0) {
            reportEntryPrincipal.totalRevenue += appt.amountPaid;
          }

          dailyReportMap.set(professionalIdPrincipal, reportEntryPrincipal);
        }

        appt.addedServices?.forEach(added => {
          const professionalIdForAddedService = added.professionalId || appt.professionalId;
          if (professionalIdForAddedService) {
            const reportEntryAdded = dailyReportMap.get(professionalIdForAddedService) || {
              professionalId: professionalIdForAddedService,
              locationId: appt.locationId, 
              totalRevenue: 0,
              services: new Map<string, { serviceName: string, count: number }>(),
            };

            const addedServiceName = allServices.find(s => s.id === added.serviceId)?.name || 'Servicio Adicional Desc.';
            const addedServiceEntry = reportEntryAdded.services.get(added.serviceId) || { serviceName: addedServiceName, count: 0 };
            addedServiceEntry.count += 1;
            reportEntryAdded.services.set(added.serviceId, addedServiceEntry);

            if (typeof added.amountPaid === 'number' && added.amountPaid > 0) {
              reportEntryAdded.totalRevenue += added.amountPaid;
            }

            dailyReportMap.set(professionalIdForAddedService, reportEntryAdded);
          }
        });
      });

      setDailyTotalsByLocation(Array.from(locationTotalsMap.values()));

      const finalReport: DailyActivityReportItem[] = Array.from(dailyReportMap.values()).map(item => {
        const professional = allSystemProfessionals.find(p => p.id === item.professionalId); // Search in all professionals
        const location = locations.find(l => l.id === item.locationId);
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
      if (!user || !allServices || allServices.length === 0 || locations.length === 0) { 
         setIsLoading(false);
         return;
      }
      setIsLoading(true);

      const profContext = isAdminOrContador ? (adminSelectedLocation === 'all' ? 'all' : effectiveLocationId) : user?.locationId;
      const professionalsListRaw = await fetchProfessionalsForReportContext(profContext);
      
      const baseDate = setMonth(setYear(new Date(), selectedYear), selectedMonth);
      const startDate = selectedQuincena === 1 ? startOfMonth(baseDate) : addDays(startOfMonth(baseDate), 15);
      const endDate = selectedQuincena === 1 ? addDays(startOfMonth(baseDate), 14) : endOfMonth(baseDate);
      
      const professionalsList = professionalsListRaw.filter(prof => {
        const contractStatus = getContractDisplayStatus(prof.currentContract, endDate);
        return contractStatus === 'Activo' || contractStatus === 'Próximo a Vencer';
      });

      let appointmentsForPeriodResponse: { appointments: Appointment[] };
      if (isAdminOrContador && adminSelectedLocation === 'all') {
         const promises = locations.map(loc =>
          getAppointments({
            locationId: loc.id,
            statuses: [APPOINTMENT_STATUS.COMPLETED],
            dateRange: {start: startDate, end: endDate}
          })
        );
        const results = await Promise.all(promises);
        const flatAppointments = results.map(r => r.appointments || []).flat();
        appointmentsForPeriodResponse = { appointments: flatAppointments };
      } else if (effectiveLocationId) {
        appointmentsForPeriodResponse = await getAppointments({
            locationId: effectiveLocationId,
            statuses: [APPOINTMENT_STATUS.COMPLETED],
            dateRange: {start: startDate, end: endDate}
        });
      } else {
         appointmentsForPeriodResponse = { appointments: [] };
      }
      
      const appointmentsForPeriod = appointmentsForPeriodResponse.appointments || [];

      const biWeeklyReportMap = new Map<string, { professionalId: string, locationId: LocationId, biWeeklyEarnings: number }>();

      professionalsList.forEach(prof => {
         biWeeklyReportMap.set(prof.id, { professionalId: prof.id, locationId: prof.locationId, biWeeklyEarnings: 0 });
      });
      
      appointmentsForPeriod.forEach(appt => {
        const professionalForAppt = professionalsListRaw.find(p => p.id === appt.professionalId); 
        if (appt.professionalId && professionalForAppt && appt.status === APPOINTMENT_STATUS.COMPLETED) {
            const contractStatusOnApptDate = getContractDisplayStatus(professionalForAppt.currentContract, parseISO(appt.appointmentDateTime));
            if (contractStatusOnApptDate === 'Activo' || contractStatusOnApptDate === 'Próximo a Vencer') {
                const entry = biWeeklyReportMap.get(appt.professionalId);
                if (entry) {
                    let appointmentIncome = appt.amountPaid || 0;
                    if (appt.addedServices) {
                        appointmentIncome += appt.addedServices.reduce((sum, as) => sum + (as.amountPaid || 0), 0);
                    }
                    entry.biWeeklyEarnings += appointmentIncome;
                    biWeeklyReportMap.set(appt.professionalId, entry);
                }
            }
        }
      });
      
      if (isAdminOrContador && adminSelectedLocation === 'all') {
        const groupedResult: GroupedBiWeeklyReportItem[] = [];
        const professionalsByLocation = new Map<LocationId, BiWeeklyEarningsReportItem[]>();
        const locationTotals = new Map<LocationId, number>();

        Array.from(biWeeklyReportMap.values()).forEach(item => {
          const professional = professionalsList.find(p => p.id === item.professionalId); 
          const location = locations.find(l => l.id === item.locationId);
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

        locations.forEach(loc => {
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
            const location = locations.find(l => l.id === item.locationId);
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
      setDailyTotalsByLocation([]); // Clear daily totals when switching report type
      generateBiWeeklyReport();
    }

  }, [user, selectedDate, effectiveLocationId, adminSelectedLocation, fetchProfessionalsForReportContext, isAdminOrContador, reportType, selectedYear, selectedMonth, selectedQuincena, allServices, locations]);

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
    } else { 
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
    } else { 
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
    let prevQYear = selectedYear;
    if (selectedQuincena === 1 && selectedMonth === 0) { 
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
              Viendo para: {adminSelectedLocation === 'all' ? 'Todas las sedes' : locations.find(l => l.id === adminSelectedLocation)?.name || 'Sede no especificada'}
            </div>
          )}
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <LoadingState />
          ) : (
            <>
            {reportType === 'daily' && dailyTotalsByLocation.length > 0 && (
                <div className="mb-8 space-y-4">
                    <h3 className="text-xl font-semibold flex items-center gap-2"><DollarSign />Resumen de Ingresos del Día</h3>
                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                        {dailyTotalsByLocation.map(locTotal => {
                          const isHigueretaStaff = user?.role === USER_ROLES.LOCATION_STAFF && locTotal.locationId === 'higuereta';
                          const cashTotal = locTotal.totalsByMethod['Efectivo'] || 0;
                          return (
                            <Card key={locTotal.locationId} className="shadow-sm">
                                <CardHeader className="pb-2">
                                    <CardTitle className="text-lg flex items-center gap-2">
                                      <Landmark size={20} className="text-primary"/>
                                      {locTotal.locationName}
                                    </CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <ul className="text-sm space-y-1">
                                      {isHigueretaStaff ? (
                                          <li key="efectivo" className="flex justify-between">
                                            <span className="text-muted-foreground">Efectivo:</span>
                                            <span>S/ {cashTotal.toFixed(2)}</span>
                                          </li>
                                      ) : (
                                        Object.entries(locTotal.totalsByMethod).map(([method, total]) => (
                                            <li key={method} className="flex justify-between">
                                                <span className="text-muted-foreground">{method}:</span>
                                                <span>S/ {total.toFixed(2)}</span>
                                            </li>
                                        ))
                                      )}
                                    </ul>
                                    <div className="border-t mt-2 pt-2 flex justify-between font-bold">
                                        <span>Total Sede:</span>
                                        <span>S/ {isHigueretaStaff ? cashTotal.toFixed(2) : locTotal.totalRevenue.toFixed(2)}</span>
                                    </div>
                                </CardContent>
                            </Card>
                          )
                        })}
                    </div>
                </div>
            )}
            <Table>
              <TableCaption>
                {reportData.length > 0
                  ? reportType === 'daily'
                    ? (
                        isStaffRestrictedView
                        ? `Resumen del ${format(selectedDate, "PPP", { locale: es })}. Total Servicios Atendidos: ${totalServicesOverall}`
                        : `Resumen de actividad del ${format(selectedDate, "PPP", { locale: es })}. Total Servicios Atendidos: ${totalServicesOverall}.`
                      )
                    : ( 
                        isStaffRestrictedView
                        ? `Resumen Quincenal (${getBiWeeklyPeriodDescription()}).`
                        : `Resumen Quincenal (${getBiWeeklyPeriodDescription()}). Total Ingresos Quincenales: S/ ${totalRevenueOverall.toFixed(2)}`
                      )
                  : reportType === 'daily' 
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
                    (reportData as GroupedBiWeeklyReportItem[]).map((group, index) => (
                      <React.Fragment key={`${group.locationId}-grouped-report-${index}`}>
                        {(group.professionals || []).map(item => (
                          <TableRow key={`${item.professionalId}-${group.locationId}-biWeekly-${index}`}>
                            <TableCell className="font-medium">{item.professionalName}</TableCell>
                            <TableCell>{item.locationName}</TableCell>
                            <TableCell className="text-right">{(item.biWeeklyEarnings || 0).toFixed(2)}</TableCell>
                          </TableRow>
                        ))}
                        <TableRow className="bg-muted/50 font-semibold" key={`total-row-${group.locationId}-grouped-report-${index}`}>
                          <TableCell colSpan={2}>Total {group.locationName}</TableCell>
                          <TableCell className="text-right">{(group.locationTotalEarnings || 0).toFixed(2)}</TableCell>
                        </TableRow>
                      </React.Fragment>
                    ))
                  ) : (
                    (reportData as (DailyActivityReportItem | BiWeeklyEarningsReportItem)[]).map((item, idx) => (
                      <TableRow key={`${item.professionalId}-${(item as any).locationName || idx}-${item.type}-${idx}`}>
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
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
