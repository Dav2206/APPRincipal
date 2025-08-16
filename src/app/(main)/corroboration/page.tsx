
"use client";

import type { Appointment, Professional, Location } from '@/types';
import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/contexts/auth-provider';
import { useAppState } from '@/contexts/app-state-provider';
import { getAppointments, getProfessionals, getLocations } from '@/lib/data';
import { USER_ROLES, APPOINTMENT_STATUS, LocationId } from '@/lib/constants';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, getYear, getMonth, setYear, setMonth, addDays, isAfter, getDate, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { ListChecks, Loader2, AlertTriangle, ChevronLeft, ChevronRight, Shuffle } from 'lucide-react';
import { useRouter } from 'next/navigation';

interface CorroborationReportData {
  [professionalId: string]: {
    professionalName: string;
    locationName: string;
    dailyTotals: { [day: string]: number }; // Key is 'YYYY-MM-DD'
    quincenaTotal: number;
  };
}

interface ExternalProductionReportData {
  [professionalId: string]: {
      professionalName: string;
      productionByLocation: {
          [locationId: string]: {
              locationName: string;
              total: number;
          }
      };
      totalExternalProduction: number;
  }
}


const ALL_PROFESSIONALS_VALUE = "all";

const currentSystemYear = getYear(new Date());
const availableYears = [currentSystemYear, currentSystemYear - 1, currentSystemYear - 2];
const months = Array.from({ length: 12 }, (_, i) => ({
  value: i,
  label: format(new Date(currentSystemYear, i), 'MMMM', { locale: es }),
}));

export default function CorroborationPage() {
  const { user, isLoading: authIsLoading } = useAuth();
  const { selectedLocationId } = useAppState();
  const router = useRouter();

  const [reportData, setReportData] = useState<CorroborationReportData>({});
  const [externalReportData, setExternalReportData] = useState<ExternalProductionReportData>({});
  const [locations, setLocations] = useState<Location[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  const [selectedYear, setSelectedYear] = useState<number>(getYear(new Date()));
  const [selectedMonth, setSelectedMonth] = useState<number>(getMonth(new Date()));
  const [selectedQuincena, setSelectedQuincena] = useState<1 | 2>(getDate(new Date()) <= 15 ? 1 : 2);
  const [selectedProfessional, setSelectedProfessional] = useState<string>(ALL_PROFESSIONALS_VALUE);

  
  const effectiveLocationId = useMemo(() => {
    if (user?.role === USER_ROLES.CONTADOR) {
      return selectedLocationId === 'all' ? undefined : selectedLocationId as LocationId;
    }
    return undefined;
  }, [user, selectedLocationId]);

  useEffect(() => {
    if (!authIsLoading && user?.role !== USER_ROLES.CONTADOR) {
      router.replace('/dashboard');
    }
  }, [user, authIsLoading, router]);

  useEffect(() => {
    async function loadLocations() {
      const fetchedLocations = await getLocations();
      setLocations(fetchedLocations);
    }
    loadLocations();
  }, []);

  useEffect(() => {
    async function generateReport() {
      if (!user || user.role !== USER_ROLES.CONTADOR || locations.length === 0) return;
      setIsLoading(true);

      const baseDate = setMonth(setYear(new Date(), selectedYear), selectedMonth);
      const startDate = selectedQuincena === 1 ? startOfMonth(baseDate) : addDays(startOfMonth(baseDate), 15);
      const endDate = selectedQuincena === 1 ? addDays(startOfMonth(baseDate), 14) : endOfMonth(baseDate);

      try {
        const [allProfessionals, allAppointmentsResponse] = await Promise.all([
          getProfessionals(),
          getAppointments({
            dateRange: { start: startDate, end: endDate },
            statuses: [APPOINTMENT_STATUS.COMPLETED]
          })
        ]);
        
        const appointments = allAppointmentsResponse.appointments || [];
        const newReportData: CorroborationReportData = {};
        const newExternalReportData: ExternalProductionReportData = {};
        const nativeProfessionalsIds = effectiveLocationId 
            ? new Set(allProfessionals.filter(p => p.locationId === effectiveLocationId).map(p => p.id)) 
            : null;

        const processIncome = (profId: string | undefined | null, amount: number | undefined | null, appointment: Appointment) => {
            if (!profId || !amount || amount <= 0) return;
            
            const professional = allProfessionals.find(p => p.id === profId);
            if (!professional) return;
            
            const appointmentDateKey = format(parseISO(appointment.appointmentDateTime), 'yyyy-MM-dd');

            // Logic for main report (production in selected location)
            if (appointment.locationId === effectiveLocationId || !effectiveLocationId) {
                if (!newReportData[profId]) {
                    newReportData[profId] = {
                        professionalName: `${professional.firstName} ${professional.lastName}`,
                        locationName: locations.find(l => l.id === professional.locationId)?.name || 'N/A',
                        dailyTotals: {},
                        quincenaTotal: 0
                    };
                }
                newReportData[profId].dailyTotals[appointmentDateKey] = (newReportData[profId].dailyTotals[appointmentDateKey] || 0) + amount;
                newReportData[profId].quincenaTotal += amount;
            }

            // Logic for external production report
            if (nativeProfessionalsIds && nativeProfessionalsIds.has(profId) && appointment.locationId !== effectiveLocationId) {
                if (!newExternalReportData[profId]) {
                    newExternalReportData[profId] = {
                        professionalName: `${professional.firstName} ${professional.lastName}`,
                        productionByLocation: {},
                        totalExternalProduction: 0
                    };
                }
                const externalLocId = appointment.locationId;
                if (!newExternalReportData[profId].productionByLocation[externalLocId]) {
                    newExternalReportData[profId].productionByLocation[externalLocId] = {
                        locationName: locations.find(l => l.id === externalLocId)?.name || 'Externa',
                        total: 0
                    };
                }
                newExternalReportData[profId].productionByLocation[externalLocId].total += amount;
                newExternalReportData[profId].totalExternalProduction += amount;
            }
          };

        appointments.forEach(appt => {
            // Process main service income
            processIncome(appt.professionalId, appt.amountPaid, appt);

            // Process added services income
            appt.addedServices?.forEach(addedService => {
                const profIdForAddedService = addedService.professionalId || appt.professionalId;
                processIncome(profIdForAddedService, addedService.amountPaid, appt);
            });
        });

        setReportData(newReportData);
        setExternalReportData(newExternalReportData);
      } catch (error) {
        console.error("Error generating corroboration report:", error);
        setReportData({});
        setExternalReportData({});
      } finally {
        setIsLoading(false);
      }
    }
    generateReport();
  }, [user, effectiveLocationId, selectedYear, selectedMonth, selectedQuincena, locations]);

  const professionalsWithActivity = useMemo(() => {
    return Object.entries(reportData).map(([profId, profData]) => ({
      id: profId,
      name: profData.professionalName
    })).sort((a,b) => a.name.localeCompare(b.name));
  }, [reportData]);
  
  const displayedReportData = useMemo(() => {
    if (selectedProfessional === ALL_PROFESSIONALS_VALUE) {
        return reportData;
    }
    const filteredData: CorroborationReportData = {};
    if (reportData[selectedProfessional]) {
        filteredData[selectedProfessional] = reportData[selectedProfessional];
    }
    return filteredData;
  }, [reportData, selectedProfessional]);


  const dateHeaders = useMemo(() => {
    const baseDate = setMonth(setYear(new Date(), selectedYear), selectedMonth);
    const startDate = selectedQuincena === 1 ? startOfMonth(baseDate) : addDays(startOfMonth(baseDate), 15);
    const endDate = selectedQuincena === 1 ? addDays(startOfMonth(baseDate), 14) : endOfMonth(baseDate);
    return eachDayOfInterval({ start: startDate, end: endDate });
  }, [selectedYear, selectedMonth, selectedQuincena]);
  
  const dailyTotals = useMemo(() => {
    const totals: { [day: string]: number } = {};
    dateHeaders.forEach(date => {
        const dayKey = format(date, 'yyyy-MM-dd');
        totals[dayKey] = Object.values(displayedReportData).reduce((sum, profData) => sum + (profData.dailyTotals[dayKey] || 0), 0);
    });
    return totals;
  }, [displayedReportData, dateHeaders]);
  
  const grandTotal = useMemo(() => {
    return Object.values(dailyTotals).reduce((sum, total) => sum + total, 0);
  }, [dailyTotals]);


  const navigateQuincena = (direction: 'prev' | 'next') => {
    let newYear = selectedYear;
    let newMonth = selectedMonth;
    let newQuincena = selectedQuincena;

    if (direction === 'next') {
      if (newQuincena === 1) newQuincena = 2;
      else { newQuincena = 1; if (newMonth === 11) { newMonth = 0; newYear += 1; } else newMonth += 1; }
    } else {
      if (newQuincena === 2) newQuincena = 1;
      else { newQuincena = 2; if (newMonth === 0) { newMonth = 11; newYear -= 1; } else newMonth -= 1; }
    }
    
    const today = new Date();
    const firstDayOfNewQuincena = newQuincena === 1 ? startOfMonth(setMonth(setYear(new Date(),newYear), newMonth)) : addDays(startOfMonth(setMonth(setYear(new Date(),newYear), newMonth)),15);
    if (isAfter(firstDayOfNewQuincena, today)) return;
    if (newYear < availableYears[availableYears.length - 1]) return;

    setSelectedYear(newYear);
    setSelectedMonth(newMonth);
    setSelectedQuincena(newQuincena as 1 | 2);
    setSelectedProfessional(ALL_PROFESSIONALS_VALUE);
  };
  
  const isNextQuincenaDisabled = () => {
    let nextQYear = selectedYear;
    let nextQMonth = selectedMonth;
    let nextQQuincena = selectedQuincena;
    if (nextQQuincena === 1) nextQQuincena = 2;
    else { nextQQuincena = 1; if (nextQMonth === 11) { nextQMonth = 0; nextQYear +=1; } else nextQMonth +=1; }
    const firstDayOfNextQ = nextQQuincena === 1 ? startOfMonth(setMonth(setYear(new Date(),nextQYear), nextQMonth)) : addDays(startOfMonth(setMonth(setYear(new Date(),nextQYear), nextQMonth)),15);
    return isAfter(firstDayOfNextQ, new Date());
  };

  const isPrevQuincenaDisabled = () => {
    let prevQYear = selectedYear;
    if (selectedQuincena === 1 && selectedMonth === 0) prevQYear -= 1;
    return prevQYear < availableYears[availableYears.length - 1];
  };

  if (authIsLoading || !user || user.role !== USER_ROLES.CONTADOR) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }

  const LoadingState = () => (
    <div className="flex justify-center items-center h-64"><Loader2 className="h-12 w-12 animate-spin text-primary" /><p className="ml-2">Cargando datos de corroboración...</p></div>
  );

  const NoDataState = () => (
    <div className="p-8 border rounded-lg bg-secondary/30 text-center mt-4">
      <AlertTriangle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
      <h3 className="text-xl font-semibold">No se encontraron datos</h3>
      <p className="text-muted-foreground">No hay actividad registrada para la quincena y sede seleccionada.</p>
    </div>
  );

  return (
    <div className="container mx-auto py-8 px-4 md:px-0 space-y-8">
      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle className="text-3xl flex items-center gap-2">
            <ListChecks className="text-primary" />
            Módulo de Corroboración
          </CardTitle>
          <CardDescription>
            Producción diaria detallada por profesional para la quincena seleccionada.
          </CardDescription>
           <div className="mt-4 flex items-center gap-2 flex-wrap">
              <Button variant="outline" size="icon" onClick={() => navigateQuincena('prev')} disabled={isPrevQuincenaDisabled()}><ChevronLeft className="h-4 w-4" /></Button>
              <Select value={String(selectedYear)} onValueChange={(val) => {setSelectedYear(Number(val)); setSelectedProfessional(ALL_PROFESSIONALS_VALUE);}}><SelectTrigger className="w-[100px]"><SelectValue /></SelectTrigger><SelectContent>{availableYears.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent></Select>
              <Select value={String(selectedMonth)} onValueChange={(val) => {setSelectedMonth(Number(val)); setSelectedProfessional(ALL_PROFESSIONALS_VALUE);}}><SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger><SelectContent>{months.map(m => <SelectItem key={m.value} value={String(m.value)}>{m.label}</SelectItem>)}</SelectContent></Select>
              <Select value={String(selectedQuincena)} onValueChange={(val) => {setSelectedQuincena(Number(val) as 1 | 2); setSelectedProfessional(ALL_PROFESSIONALS_VALUE);}}><SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="1">1ra Quincena</SelectItem><SelectItem value="2">2da Quincena</SelectItem></SelectContent></Select>
              <Button variant="outline" size="icon" onClick={() => navigateQuincena('next')} disabled={isNextQuincenaDisabled()}><ChevronRight className="h-4 w-4" /></Button>
              <Select value={selectedProfessional} onValueChange={setSelectedProfessional}>
                <SelectTrigger className="w-[200px]">
                    <SelectValue placeholder="Filtrar Profesional"/>
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value={ALL_PROFESSIONALS_VALUE}>Todos los profesionales</SelectItem>
                    {professionalsWithActivity.map(prof => (
                        <SelectItem key={prof.id} value={prof.id}>{prof.name}</SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            {user && (user.role === USER_ROLES.ADMIN || user.role === USER_ROLES.CONTADOR) && (
            <div className="mt-2 text-sm text-muted-foreground">
              Viendo para: {selectedLocationId === 'all' ? 'Todas las sedes' : locations.find(l => l.id === selectedLocationId)?.name || 'Sede no especificada'}
            </div>
          )}
        </CardHeader>
        <CardContent>
          {isLoading ? <LoadingState /> : Object.keys(displayedReportData).length === 0 ? <NoDataState /> : (
            <div className="overflow-x-auto">
                <Table className="min-w-full">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="sticky left-0 bg-background z-10 min-w-[150px]">Profesional</TableHead>
                      <TableHead className="min-w-[120px]">Sede Base</TableHead>
                      {dateHeaders.map(date => (
                        <TableHead key={date.toString()} className="text-center min-w-[80px]">
                           {format(date, 'EEE d', { locale: es })}
                        </TableHead>
                      ))}
                      <TableHead className="text-right font-bold min-w-[120px]">Total Quincena</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {Object.entries(displayedReportData).sort(([,a],[,b]) => b.quincenaTotal - a.quincenaTotal).map(([profId, profData]) => (
                      <TableRow key={profId}>
                        <TableCell className="sticky left-0 bg-background z-10 font-medium">{profData.professionalName}</TableCell>
                        <TableCell>{profData.locationName}</TableCell>
                        {dateHeaders.map(date => {
                          const dayKey = format(date, 'yyyy-MM-dd');
                          const total = profData.dailyTotals[dayKey] || 0;
                          return (
                            <TableCell key={dayKey} className="text-center">
                              {total > 0 ? total.toFixed(2) : '-'}
                            </TableCell>
                          );
                        })}
                        <TableCell className="text-right font-bold">{profData.quincenaTotal.toFixed(2)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                  <TableFooter>
                     <TableRow className="bg-muted/80">
                        <TableCell colSpan={2} className="sticky left-0 bg-muted/80 z-10 font-bold text-lg">Total Diario</TableCell>
                         {dateHeaders.map(date => {
                            const dayKey = format(date, 'yyyy-MM-dd');
                            return (
                                <TableCell key={`total-${dayKey}`} className="text-center font-bold">
                                    {(dailyTotals[dayKey] || 0).toFixed(2)}
                                </TableCell>
                            )
                         })}
                         <TableCell className="text-right font-bold text-lg">S/ {grandTotal.toFixed(2)}</TableCell>
                     </TableRow>
                  </TableFooter>
                </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {effectiveLocationId && Object.keys(externalReportData).length > 0 && (
         <Card className="shadow-lg mt-8">
            <CardHeader>
                <CardTitle className="text-xl flex items-center gap-2">
                    <Shuffle className="text-primary"/>
                    Producción de Profesionales Nativos en Otras Sedes
                </CardTitle>
                <CardDescription>
                    Ingresos generados por los profesionales de {locations.find(l => l.id === effectiveLocationId)?.name} cuando trabajaron en otras sedes durante esta quincena.
                </CardDescription>
            </CardHeader>
            <CardContent>
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Profesional Nativo</TableHead>
                            <TableHead>Sede Externa</TableHead>
                            <TableHead className="text-right">Producción Externa (S/)</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {Object.entries(externalReportData)
                            .sort(([, a], [, b]) => a.professionalName.localeCompare(b.professionalName))
                            .flatMap(([profId, profData]) => 
                                Object.entries(profData.productionByLocation).map(([locId, locData]) => (
                                    <TableRow key={`${profId}-${locId}`}>
                                        <TableCell>{profData.professionalName}</TableCell>
                                        <TableCell>{locData.locationName}</TableCell>
                                        <TableCell className="text-right font-medium">{locData.total.toFixed(2)}</TableCell>
                                    </TableRow>
                                ))
                            )}
                    </TableBody>
                </Table>
            </CardContent>
         </Card>
      )}

    </div>
  );
}
