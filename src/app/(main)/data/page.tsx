
"use client";

import React, { useState, useEffect, useMemo } from 'react';
import type { Appointment, Service, Location } from '@/types';
import { useAuth } from '@/contexts/auth-provider';
import { useAppState } from '@/contexts/app-state-provider';
import { getAppointments, getServices, getLocations } from '@/lib/data';
import { USER_ROLES, APPOINTMENT_STATUS } from '@/lib/constants';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Bar, BarChart, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { format, getYear, getMonth, setYear, setMonth, startOfMonth, endOfMonth, parseISO, getDay, addDays } from 'date-fns';
import { es } from 'date-fns/locale';
import { Loader2, AlertTriangle, PieChartIcon, DollarSign, Users, LineChart, Clock } from 'lucide-react';
import {
  ChartContainer,
  ChartTooltip as ChartTooltipComponent,
  ChartTooltipContent,
} from "@/components/ui/chart";


const currentSystemYear = getYear(new Date());
const availableYears = [currentSystemYear, currentSystemYear - 1, currentSystemYear - 2];
const months = Array.from({ length: 12 }, (_, i) => ({
  value: i,
  label: format(new Date(currentSystemYear, i), 'MMMM', { locale: es }),
}));

const DAYS_OF_WEEK_DISPLAY = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

export default function DataPage() {
  const { user } = useAuth();
  const { selectedLocationId } = useAppState();

  const [allAppointments, setAllAppointments] = useState<Appointment[]>([]);
  const [allServices, setAllServices] = useState<Service[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedYear, setSelectedYear] = useState<number>(getYear(new Date()));
  const [selectedMonth, setSelectedMonth] = useState<number>(getMonth(new Date()));
  const [selectedQuincena, setSelectedQuincena] = useState<string>('all'); // 'all', '1', '2'

  useEffect(() => {
    async function loadStaticData() {
      const [servicesData, locationsData] = await Promise.all([
        getServices(),
        getLocations()
      ]);
      setAllServices(servicesData);
      setLocations(locationsData);
    }
    loadStaticData();
  }, []);

  useEffect(() => {
    async function fetchAppointments() {
      if (locations.length === 0 || allServices.length === 0) return;
      setIsLoading(true);

      const baseDate = setMonth(setYear(new Date(), selectedYear), selectedMonth);
      let startDate: Date;
      let endDate: Date;

      if (selectedQuincena === '1') {
          startDate = startOfMonth(baseDate);
          endDate = addDays(startDate, 14);
      } else if (selectedQuincena === '2') {
          startDate = addDays(startOfMonth(baseDate), 15);
          endDate = endOfMonth(baseDate);
      } else { // 'all'
          startDate = startOfMonth(baseDate);
          endDate = endOfMonth(baseDate);
      }
      
      try {
        const appointmentsResponse = await getAppointments({
            dateRange: { start: startDate, end: endDate },
            statuses: [APPOINTMENT_STATUS.COMPLETED]
        });
        setAllAppointments(appointmentsResponse.appointments || []);
      } catch (error) {
        console.error("Error fetching appointments for data page:", error);
        setAllAppointments([]);
      } finally {
        setIsLoading(false);
      }
    }

    if (locations.length > 0 && allServices.length > 0) {
      fetchAppointments();
    }
  }, [selectedYear, selectedMonth, selectedQuincena, locations, allServices]);

  const filteredAppointments = useMemo(() => {
    if (!selectedLocationId || selectedLocationId === 'all') {
      return allAppointments;
    }
    return allAppointments.filter(appt => appt.locationId === selectedLocationId);
  }, [allAppointments, selectedLocationId]);


  const serviceCountData = useMemo(() => {
    const counts: { [serviceId: string]: number } = {};
    filteredAppointments.forEach(appt => {
      counts[appt.serviceId] = (counts[appt.serviceId] || 0) + 1;
      appt.addedServices?.forEach(as => {
        counts[as.serviceId] = (counts[as.serviceId] || 0) + 1;
      });
    });
    return Object.entries(counts)
      .map(([serviceId, count]) => ({
        name: allServices.find(s => s.id === serviceId)?.name || 'Desconocido',
        count,
      }))
      .sort((a, b) => b.count - a.count);
  }, [filteredAppointments, allServices]);

  const busiestHoursData = useMemo(() => {
    const counts: { [hour: string]: number } = {};
    filteredAppointments.forEach(appt => {
      const hour = format(parseISO(appt.appointmentDateTime), 'HH:00');
      counts[hour] = (counts[hour] || 0) + 1;
    });
    return Object.entries(counts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [filteredAppointments]);

  const revenueByDayData = useMemo(() => {
    const revenue: number[] = Array(7).fill(0);
    filteredAppointments.forEach(appt => {
      const dayIndex = getDay(parseISO(appt.appointmentDateTime)); // Domingo = 0
      const totalRevenue = (appt.amountPaid || 0) + (appt.addedServices?.reduce((sum, as) => sum + (as.amountPaid || 0), 0) || 0);
      revenue[dayIndex] += totalRevenue;
    });
    return DAYS_OF_WEEK_DISPLAY.map((dayName, index) => ({
      name: dayName,
      revenue: revenue[index],
    }));
  }, [filteredAppointments]);

  const locationPerformanceData = useMemo(() => {
    const performance: { [locationId: string]: { name: string, appointments: number, revenue: number } } = {};
    allAppointments.forEach(appt => { // Use all appointments before filtering
      const locId = appt.locationId;
      if (!performance[locId]) {
        performance[locId] = {
          name: locations.find(l => l.id === locId)?.name || 'Desconocida',
          appointments: 0,
          revenue: 0,
        };
      }
      performance[locId].appointments += 1;
      performance[locId].revenue += (appt.amountPaid || 0) + (appt.addedServices?.reduce((sum, as) => sum + (as.amountPaid || 0), 0) || 0);
    });
    return Object.values(performance).sort((a,b) => b.revenue - a.revenue);
  }, [allAppointments, locations]);

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="p-2 bg-background border rounded-md shadow-lg">
          <p className="font-bold">{label}</p>
          {payload.map((p: any) => (
             <p key={p.name} style={{ color: p.color }}>
                {`${p.name}: ${p.name === 'revenue' ? `S/ ${p.value.toFixed(2)}` : p.value}`}
             </p>
          ))}
        </div>
      );
    }
    return null;
  };


  return (
    <div className="container mx-auto py-8 px-4 md:px-0 space-y-8">
      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle className="text-3xl flex items-center gap-2">
            <PieChartIcon className="text-primary" />
            Análisis de Datos
          </CardTitle>
          <CardDescription>
            Métricas clave sobre el rendimiento de tu negocio para el período seleccionado.
          </CardDescription>
          <div className="mt-4 flex items-center gap-2 flex-wrap">
              <Select value={String(selectedYear)} onValueChange={(val) => {setSelectedYear(Number(val));}}><SelectTrigger className="w-[120px]"><SelectValue /></SelectTrigger><SelectContent>{availableYears.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent></Select>
              <Select value={String(selectedMonth)} onValueChange={(val) => {setSelectedMonth(Number(val));}}><SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger><SelectContent>{months.map(m => <SelectItem key={m.value} value={String(m.value)}>{m.label}</SelectItem>)}</SelectContent></Select>
              <Select value={selectedQuincena} onValueChange={setSelectedQuincena}>
                <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                    <SelectItem value="all">Todo el Mes</SelectItem>
                    <SelectItem value="1">1ra Quincena (1-15)</SelectItem>
                    <SelectItem value="2">2da Quincena (16-fin)</SelectItem>
                </SelectContent>
              </Select>
          </div>
           <div className="mt-2 text-sm text-muted-foreground">
              Viendo para: {selectedLocationId === 'all' ? 'Todas las sedes' : locations.find(l => l.id === selectedLocationId)?.name || 'Sede no especificada'}
            </div>
        </CardHeader>
      </Card>

      {isLoading ? (
         <div className="flex h-64 items-center justify-center">
            <Loader2 className="h-12 w-12 animate-spin text-primary" />
          </div>
      ) : filteredAppointments.length === 0 ? (
           <Card>
             <CardContent className="py-10 text-center">
               <AlertTriangle className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
               <h3 className="text-xl font-semibold mb-2">No hay datos</h3>
               <p className="text-muted-foreground">No se encontraron citas completadas para el período y sede seleccionados.</p>
             </CardContent>
           </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <Card>
                <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2"><LineChart size={20}/>Servicios Más Realizados</CardTitle>
                </CardHeader>
                <CardContent>
                    <ChartContainer config={{}} className="h-[300px] w-full">
                        <BarChart data={serviceCountData} layout="vertical" margin={{ left: 50 }}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis type="number" />
                            <YAxis type="category" dataKey="name" width={100} tick={{ fontSize: 12 }} />
                            <Tooltip content={<CustomTooltip/>}/>
                            <Bar dataKey="count" fill="hsl(var(--primary))" name="Citas" barSize={20} />
                        </BarChart>
                    </ChartContainer>
                </CardContent>
            </Card>

             <Card>
                <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2"><Clock size={20}/>Horas de Mayor Afluencia</CardTitle>
                </CardHeader>
                <CardContent>
                    <ChartContainer config={{}} className="h-[300px] w-full">
                        <BarChart data={busiestHoursData}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="name" />
                            <YAxis />
                            <Tooltip content={<CustomTooltip/>}/>
                            <Bar dataKey="count" fill="hsl(var(--primary))" name="Citas" />
                        </BarChart>
                    </ChartContainer>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2"><DollarSign size={20}/>Ingresos por Día de la Semana</CardTitle>
                </CardHeader>
                <CardContent>
                     <ChartContainer config={{}} className="h-[300px] w-full">
                        <BarChart data={revenueByDayData}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="name" tick={{ fontSize: 12 }}/>
                            <YAxis />
                            <Tooltip content={<CustomTooltip/>}/>
                            <Bar dataKey="revenue" fill="hsl(var(--accent))" name="revenue" />
                        </BarChart>
                    </ChartContainer>
                </CardContent>
            </Card>
           
            {selectedLocationId === 'all' && (
                <Card>
                    <CardHeader>
                        <CardTitle className="text-lg flex items-center gap-2"><Users size={20}/>Rendimiento por Sede</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Sede</TableHead>
                                    <TableHead className="text-right">Citas Completadas</TableHead>
                                    <TableHead className="text-right">Ingresos Totales (S/)</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {locationPerformanceData.map(loc => (
                                    <TableRow key={loc.name}>
                                        <TableCell>{loc.name}</TableCell>
                                        <TableCell className="text-right">{loc.appointments}</TableCell>
                                        <TableCell className="text-right">{loc.revenue.toFixed(2)}</TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>
            )}

        </div>
      )}
    </div>
  );
}

