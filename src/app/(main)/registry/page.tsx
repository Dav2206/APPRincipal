
"use client";

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import type { Appointment, Professional, LocationId } from '@/types';
import { useAuth } from '@/contexts/auth-provider';
import { useAppState } from '@/contexts/app-state-provider';
import { getAppointments, getProfessionals } from '@/lib/data';
import { LOCATIONS, USER_ROLES, APPOINTMENT_STATUS } from '@/lib/constants';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableCaption } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { format, startOfDay, getMonth, getDate, startOfMonth, endOfMonth, addDays } from 'date-fns';
import { es } from 'date-fns/locale';
import { CalendarIcon, Loader2, AlertTriangle, FileText, DollarSign } from 'lucide-react';
import { cn } from '@/lib/utils';

interface DailyActivityReportItem {
  type: 'daily';
  professionalId: string;
  professionalName: string;
  locationName: string;
  servicesCount: number;
  totalRevenue: number;
}

interface BiWeeklyEarningsReportItem {
  type: 'biWeekly';
  professionalId: string;
  professionalName: string;
  locationName: string;
  biWeeklyEarnings: number;
}

type ReportItem = DailyActivityReportItem | BiWeeklyEarningsReportItem;

type ReportType = 'daily' | 'biWeekly';


export default function RegistryPage() {
  const { user } = useAuth();
  const { selectedLocationId: adminSelectedLocation } = useAppState();

  const [selectedDate, setSelectedDate] = useState<Date>(startOfDay(new Date()));
  const [reportData, setReportData] = useState<ReportItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [reportType, setReportType] = useState<ReportType>('daily');

  const isAdminOrContador = user?.role === USER_ROLES.ADMIN || user?.role === USER_ROLES.CONTADOR;

  const effectiveLocationId = useMemo(() => {
    if (isAdminOrContador) {
      return adminSelectedLocation === 'all' ? undefined : adminSelectedLocation as LocationId;
    }
    return user?.locationId;
  }, [user, isAdminOrContador, adminSelectedLocation]);

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
      if (!user) return;
      setIsLoading(true);

      const profContext = isAdminOrContador ? (adminSelectedLocation === 'all' ? 'all' : effectiveLocationId) : user?.locationId;
      const currentProfessionals = await fetchProfessionalsForReportContext(profContext);

      let appointmentsForDate: Appointment[] = [];
      if (isAdminOrContador && adminSelectedLocation === 'all') {
        const promises = LOCATIONS.map(loc => 
          getAppointments({ date: selectedDate, locationId: loc.id, status: APPOINTMENT_STATUS.COMPLETED })
        );
        const results = await Promise.all(promises);
        appointmentsForDate = results.flat();
      } else if (effectiveLocationId) {
        appointmentsForDate = await getAppointments({ date: selectedDate, locationId: effectiveLocationId, status: APPOINTMENT_STATUS.COMPLETED });
      }

      const dailyReportMap = new Map<string, Omit<DailyActivityReportItem, 'professionalName' | 'locationName' | 'type' > & { locationId: LocationId }>();

      appointmentsForDate.forEach(appt => {
        if (appt.professionalId && appt.status === APPOINTMENT_STATUS.COMPLETED) {
          const reportEntry = dailyReportMap.get(appt.professionalId) || {
            professionalId: appt.professionalId,
            locationId: appt.locationId,
            servicesCount: 0,
            totalRevenue: 0,
          };
          
          reportEntry.servicesCount += 1 + (appt.addedServices?.length || 0);
          reportEntry.totalRevenue += appt.amountPaid || 0;
          
          dailyReportMap.set(appt.professionalId, reportEntry);
        }
      });

      const finalReport: DailyActivityReportItem[] = Array.from(dailyReportMap.values()).map(item => {
        const professional = currentProfessionals.find(p => p.id === item.professionalId);
        const location = LOCATIONS.find(l => l.id === item.locationId);
        return {
          type: 'daily',
          ...item,
          professionalName: professional ? `${professional.firstName} ${professional.lastName}` : 'Desconocido',
          locationName: location ? location.name : 'Desconocida',
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

      const finalReport: BiWeeklyEarningsReportItem[] = professionalsList.map(prof => {
        const location = LOCATIONS.find(l => l.id === prof.locationId);
        return {
          type: 'biWeekly',
          professionalId: prof.id,
          professionalName: `${prof.firstName} ${prof.lastName}`,
          locationName: location ? location.name : 'Desconocida',
          biWeeklyEarnings: prof.biWeeklyEarnings || 0,
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

    if (reportType === 'daily') {
      generateDailyReport();
    } else if (reportType === 'biWeekly') {
      generateBiWeeklyReport();
    }

  }, [user, selectedDate, effectiveLocationId, adminSelectedLocation, fetchProfessionalsForReportContext, isAdminOrContador, reportType]);

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
      return reportData.reduce((sum, item) => sum + (item.type === 'daily' ? item.servicesCount : 0), 0);
    }
    return 0;
  }, [reportData, reportType]);

  const totalRevenueOverall = useMemo(() => {
    if (reportType === 'daily') {
      return reportData.reduce((sum, item) => sum + (item.type === 'daily' ? item.totalRevenue : 0), 0);
    } else if (reportType === 'biWeekly') {
      return reportData.reduce((sum, item) => sum + (item.type === 'biWeekly' ? item.biWeeklyEarnings : 0), 0);
    }
    return 0;
  }, [reportData, reportType]);
  
  const getBiWeeklyPeriodDescription = () => {
    const today = new Date(); // Or selectedDate if we want to tie it to the calendar
    const dayOfMonth = getDate(today);
    const monthName = format(today, "MMMM", { locale: es });
    const year = format(today, "yyyy");

    if (dayOfMonth <= 15) {
      return `Quincena: 1 al 15 de ${monthName}, ${year}`;
    } else {
      const endDayOfMonth = format(endOfMonth(today), "d");
      return `Quincena: 16 al ${endDayOfMonth} de ${monthName}, ${year}`;
    }
  };


  const LoadingState = () => (
    <div className="flex flex-col items-center justify-center h-64">
      <Loader2 className="h-12 w-12 animate-spin text-primary" />
      <p className="mt-4 text-muted-foreground">Cargando registro...</p>
    </div>
  );

  const NoDataState = () => (
     <TableRow>
        <TableCell colSpan={isAdminOrContador && adminSelectedLocation === 'all' ? 4 : 3} className="h-24 text-center">
          <AlertTriangle className="mx-auto h-8 w-8 text-muted-foreground mb-2" />
           {reportType === 'daily' ? 'No hay actividad registrada para este día y selección.' : 'No hay datos de ingresos quincenales para esta selección.'}
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
                        ? `Resumen del ${format(selectedDate, "PPP", { locale: es })}. Total Servicios: ${totalServicesOverall}, Total Ingresos: S/ ${totalRevenueOverall.toFixed(2)}`
                        : `Resumen Quincenal (${getBiWeeklyPeriodDescription()}). Total Ingresos Quincenales: S/ ${totalRevenueOverall.toFixed(2)}`
                    : reportType === 'daily' 
                        ? `No hay datos para el ${format(selectedDate, "PPP", { locale: es })}.`
                        : `No hay datos quincenales para el periodo actual.`
                }
              </TableCaption>
              <TableHeader>
                <TableRow>
                  <TableHead>Profesional</TableHead>
                  {(isAdminOrContador && adminSelectedLocation === 'all') && <TableHead>Sede</TableHead>}
                  {reportType === 'daily' && <TableHead className="text-center">Servicios Realizados</TableHead>}
                  <TableHead className="text-right">
                    {reportType === 'daily' ? 'Ingresos Diarios (S/)' : 'Ingresos Quincenales (S/)'}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {reportData.length === 0 ? <NoDataState /> : reportData.map(item => (
                  <TableRow key={item.professionalId + (item.type === 'daily' ? item.locationName : (item as BiWeeklyEarningsReportItem).locationName || '')}>
                    <TableCell className="font-medium">{item.professionalName}</TableCell>
                    {(isAdminOrContador && adminSelectedLocation === 'all') && <TableCell>{item.locationName}</TableCell>}
                    {item.type === 'daily' && <TableCell className="text-center">{item.servicesCount}</TableCell>}
                    <TableCell className="text-right">
                      {item.type === 'daily' ? item.totalRevenue.toFixed(2) : (item as BiWeeklyEarningsReportItem).biWeeklyEarnings.toFixed(2)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

