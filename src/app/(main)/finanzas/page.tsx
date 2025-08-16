
"use client";

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import type { Appointment, LocationId, PaymentMethod, Location, PaymentGroup } from '@/types';
import { useAuth } from '@/contexts/auth-provider';
import { useAppState } from '@/contexts/app-state-provider';
import { getAppointments, getLocations, updateLocationPaymentMethods, getPaymentGroups, savePaymentGroups } from '@/lib/data';
import { USER_ROLES, APPOINTMENT_STATUS } from '@/lib/constants';

import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter as TableFooterComponent } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { format, startOfMonth, endOfMonth, getYear, getMonth, setYear, setMonth } from 'date-fns';
import { es } from 'date-fns/locale';
import { Landmark, Loader2, AlertTriangle, ListPlus, Trash2, Filter, PlusCircle, Pencil, Check, X, PieChartIcon, Group, Layers } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { useRouter } from 'next/navigation';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { Pie, PieChart, Cell, Sector } from "recharts"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
  type ChartConfig,
} from "@/components/ui/chart"
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuCheckboxItem, DropdownMenuLabel, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';


type ReportRow = {
  locationId: LocationId;
  locationName: string;
  totalsByMethod: Partial<Record<string, number>>; // Changed from PaymentMethod to string for group names
  locationTotal: number;
};

const currentSystemYear = getYear(new Date());
const availableYears = [currentSystemYear, currentSystemYear - 1, currentSystemYear - 2];
const months = Array.from({ length: 12 }, (_, i) => ({
  value: i,
  label: format(new Date(currentSystemYear, i), 'MMMM', { locale: es }),
}));

const ALL_LOCATIONS_FILTER = "all";

export default function FinancesPage() {
  const { user, isLoading: authIsLoading } = useAuth();
  const { selectedLocationId: adminSelectedLocation } = useAppState();
  const router = useRouter();
  const { toast } = useToast();

  const [locations, setLocations] = useState<Location[]>([]);
  const [reportData, setReportData] = useState<ReportRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  const [selectedYear, setSelectedYear] = useState<number>(getYear(new Date()));
  const [selectedMonth, setSelectedMonth] = useState<number>(getMonth(new Date()));
  
  const [paymentMethodsByLocation, setPaymentMethodsByLocation] = useState<Record<LocationId, PaymentMethod[]>>({} as Record<LocationId, PaymentMethod[]>);
  const [newMethodInputs, setNewMethodInputs] = useState<Record<LocationId, string>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [completedAppointments, setCompletedAppointments] = useState<Appointment[]>([]);
  const [locationFilter, setLocationFilter] = useState<LocationId | 'all'>(ALL_LOCATIONS_FILTER);
  
  const [editingMethod, setEditingMethod] = useState<{ locationId: LocationId; oldName: string; newName: string; } | null>(null);

  const [selectedPaymentGroups, setSelectedPaymentGroups] = useState<string[]>([]);

  const [activeChartSlices, setActiveChartSlices] = useState<string[]>([]);
  const [activeDonutSlice, setActiveDonutSlice] = useState<string | null>(null);

  const [paymentGroups, setPaymentGroups] = useState<PaymentGroup[]>([]);
  const [newGroupName, setNewGroupName] = useState("");
  const [draggedMethod, setDraggedMethod] = useState<string | null>(null);
  const [isSavingGroups, setIsSavingGroups] = useState(false);


  useEffect(() => {
    async function loadInitialData() {
        const [fetchedLocations, fetchedGroups] = await Promise.all([
            getLocations(),
            getPaymentGroups()
        ]);
        
        setLocations(fetchedLocations);
        setPaymentGroups(fetchedGroups || []);

        const initialPaymentMethods: Record<LocationId, PaymentMethod[]> = {} as Record<LocationId, PaymentMethod[]>
        const initialInputs: Record<LocationId, string> = {};
        fetchedLocations.forEach(loc => {
            initialPaymentMethods[loc.id] = loc.paymentMethods || [];
            initialInputs[loc.id] = '';
        });
        setPaymentMethodsByLocation(initialPaymentMethods);
        setNewMethodInputs(initialInputs);
    }
    loadInitialData();
  }, []);

  const allAvailablePaymentMethods = useMemo(() => {
      const allMethods = new Set<string>();
      Object.values(paymentMethodsByLocation).flat().forEach(method => allMethods.add(method));
      return Array.from(allMethods).sort();
  }, [paymentMethodsByLocation]);

  const allAvailablePaymentGroups = useMemo(() => {
      const allGroups = new Set<string>();
      Object.values(totalsByPaymentGroup).forEach((_, method) => {
          const group = paymentGroups.find(g => g.methods.includes(method))?.name || method;
          allGroups.add(group);
      });
      return Array.from(allGroups).sort();
  }, [totalsByPaymentGroup, paymentGroups]);
  
  useEffect(() => {
    setSelectedPaymentGroups(allAvailablePaymentGroups);
    setActiveChartSlices(allAvailablePaymentGroups);
  }, [allAvailablePaymentGroups]);


  useEffect(() => {
    if (!authIsLoading && (!user || (user.role !== USER_ROLES.CONTADOR && user.role !== USER_ROLES.ADMIN))) {
      router.replace('/dashboard'); 
    }
  }, [user, authIsLoading, router]);

  useEffect(() => {
    async function generateReport() {
      if (!user) return;
      setIsLoading(true);

      const startDate = startOfMonth(setMonth(setYear(new Date(), selectedYear), selectedMonth));
      const endDate = endOfMonth(startDate);
      
      const effectiveLocationId = (user.role === USER_ROLES.ADMIN || user.role === USER_ROLES.CONTADOR)
        ? adminSelectedLocation === 'all' ? undefined : adminSelectedLocation as LocationId
        : user.locationId;

      try {
        let appointments: Appointment[] = [];
        if (effectiveLocationId) {
            const result = await getAppointments({
                locationId: effectiveLocationId,
                dateRange: { start: startDate, end: endDate },
                statuses: [APPOINTMENT_STATUS.COMPLETED]
            });
            appointments = result.appointments || [];
        } else { 
            const allLocationPromises = locations.map(loc => getAppointments({
                locationId: loc.id,
                dateRange: { start: startDate, end: endDate },
                statuses: [APPOINTMENT_STATUS.COMPLETED]
            }));
            const results = await Promise.all(allLocationPromises);
            appointments = results.flatMap(r => r.appointments || []);
        }
        
        setCompletedAppointments(appointments);

        const reportMap = new Map<LocationId, ReportRow>();

        appointments.forEach(appt => {
          if (!appt.paymentMethod) return;

          const locationName = locations.find(l => l.id === appt.locationId)?.name || 'Desconocida';
          let entry = reportMap.get(appt.locationId) || {
            locationId: appt.locationId,
            locationName: locationName,
            totalsByMethod: {},
            locationTotal: 0
          };
          
          const paymentGroup = paymentGroups.find(g => g.methods.includes(appt.paymentMethod!))?.name || appt.paymentMethod;

          let totalAppointmentAmount = (appt.amountPaid || 0) + (appt.addedServices?.reduce((sum, as) => sum + (as.amountPaid || 0), 0) || 0);

          if (totalAppointmentAmount > 0) {
            entry.totalsByMethod[paymentGroup] = (entry.totalsByMethod[paymentGroup] || 0) + totalAppointmentAmount;
            entry.locationTotal += totalAppointmentAmount;
          }

          reportMap.set(appt.locationId, entry);
        });

        setReportData(Array.from(reportMap.values()).sort((a,b) => a.locationName.localeCompare(b.locationName)));
      } catch (error) {
        console.error("Error generating finances report:", error);
        toast({ title: "Error", description: "No se pudo generar el reporte de ingresos.", variant: "destructive" });
        setReportData([]);
      } finally {
        setIsLoading(false);
      }
    }

    if (user && (user.role === USER_ROLES.ADMIN || user.role === USER_ROLES.CONTADOR) && locations.length > 0) {
      generateReport();
    }
  }, [user, selectedYear, selectedMonth, adminSelectedLocation, toast, locations, paymentGroups]);

  const filteredPaymentGroups = useMemo(() => {
    return allAvailablePaymentGroups.filter(group => selectedPaymentGroups.includes(group));
  }, [allAvailablePaymentGroups, selectedPaymentGroups]);
  
  const grandTotal = useMemo(() => {
    return reportData.reduce((sum, row) => {
        const rowTotalFromSelectedGroups = filteredPaymentGroups.reduce((groupSum, group) => {
            return groupSum + (row.totalsByMethod[group] || 0);
        }, 0);
        return sum + rowTotalFromSelectedGroups;
    }, 0);
  }, [reportData, filteredPaymentGroups]);
  
  const totalsByPaymentGroup = useMemo(() => {
    const totals: Partial<Record<string, number>> = {};
    
    completedAppointments.forEach(appt => {
        let totalAppointmentAmount = (appt.amountPaid || 0) + (appt.addedServices?.reduce((sum, as) => sum + (as.amountPaid || 0), 0) || 0);
        if (appt.paymentMethod && totalAppointmentAmount > 0) {
            const groupName = paymentGroups.find(g => g.methods.includes(appt.paymentMethod!))?.name || appt.paymentMethod;
            totals[groupName] = (totals[groupName] || 0) + totalAppointmentAmount;
        }
    });

    return totals;
  }, [completedAppointments, paymentGroups]);


  const chartData = useMemo(() => {
    return Object.entries(totalsByPaymentGroup)
      .map(([name, value]) => ({ name, value, fill: `var(--color-${name.toLowerCase().replace(/ /g, "_")})` }))
      .filter(item => item.value > 0);
  }, [totalsByPaymentGroup]);


  const chartConfig = useMemo(() => {
    const config: ChartConfig = {};
    chartData.forEach((item, index) => {
      config[item.name.toLowerCase().replace(/ /g, "_")] = {
        label: item.name,
        color: `hsl(var(--chart-${(index % 5) + 1}))`,
      };
    });
    return config;
  }, [chartData]);


  const handleAddNewMethod = (locationId: LocationId) => {
    const newMethodName = newMethodInputs[locationId]?.trim();
    if (!newMethodName) {
      toast({ title: "Nombre inválido", description: "El nombre del método de pago no puede estar vacío.", variant: "destructive" });
      return;
    }

    const currentMethods = paymentMethodsByLocation[locationId] || [];
    if (currentMethods.some(m => m.toLowerCase() === newMethodName.toLowerCase())) {
        toast({ title: "Método Duplicado", description: `"${newMethodName}" ya existe para esta sede.`, variant: "default" });
        return; 
    }
      
    setPaymentMethodsByLocation(prevMethods => {
      const updatedMethodsForLocation = [...(prevMethods[locationId] || []), newMethodName as PaymentMethod];
      return {
        ...prevMethods,
        [locationId]: updatedMethodsForLocation
      };
    });

    toast({ title: "Método Añadido", description: `"${newMethodName}" se añadió. Recuerde guardar los cambios.` });
    setHasChanges(true);
    setNewMethodInputs(prev => ({ ...prev, [locationId]: '' }));
  };
  
  const handleRemoveMethod = useCallback((locationId: LocationId, methodToRemove: PaymentMethod) => {
    const isMethodInUseInLocation = completedAppointments.some(
      appt => appt.locationId === locationId && appt.paymentMethod === methodToRemove
    );
    if (isMethodInUseInLocation) {
      toast({ title: "No se puede eliminar", description: `"${methodToRemove}" está en uso en citas completadas para esta sede y no puede ser eliminado.`, variant: "destructive", duration: 6000 });
      return;
    }
    
    setPaymentMethodsByLocation(prev => {
      const newMethods = (prev[locationId] || []).filter(m => m !== methodToRemove);
      return { ...prev, [locationId]: newMethods };
    });
    
    setHasChanges(true);
    toast({ title: "Método Eliminado", description: `"${methodToRemove}" ha sido eliminado de la sede. Recuerde guardar los cambios.` });
  }, [completedAppointments, toast]);

  const handleStartEditing = (locationId: LocationId, oldName: string) => {
    setEditingMethod({ locationId, oldName, newName: oldName });
  };

  const handleCancelEditing = () => {
    setEditingMethod(null);
  };

  const handleSaveMethodEdit = () => {
    if (!editingMethod) return;

    const { locationId, oldName, newName } = editingMethod;
    const trimmedNewName = newName.trim();

    if (!trimmedNewName) {
      toast({ title: "Nombre inválido", description: "El nombre no puede estar vacío.", variant: "destructive" });
      return;
    }

    const currentMethods = paymentMethodsByLocation[locationId] || [];
    if (trimmedNewName.toLowerCase() !== oldName.toLowerCase() && currentMethods.some(m => m.toLowerCase() === trimmedNewName.toLowerCase())) {
        toast({ title: "Nombre Duplicado", description: `"${trimmedNewName}" ya existe para esta sede.`, variant: "destructive" });
        return;
    }

    setPaymentMethodsByLocation(prev => {
      const updatedMethods = (prev[locationId] || []).map(m => m === oldName ? trimmedNewName : m);
      return { ...prev, [locationId]: updatedMethods };
    });
    
    setHasChanges(true);
    toast({ title: "Nombre Actualizado", description: `"${oldName}" ha sido renombrado a "${trimmedNewName}". Recuerde guardar los cambios.` });
    setEditingMethod(null);
  };

  const handleSaveAllChanges = async () => {
    setIsSaving(true);
    try {
        const updatePromises = Object.entries(paymentMethodsByLocation).map(([locationId, methods]) =>
            updateLocationPaymentMethods(locationId as LocationId, methods)
        );
        await Promise.all(updatePromises);
        toast({
            title: "Configuración Guardada",
            description: "Los métodos de pago por sede han sido actualizados en la base de datos.",
        });
        setHasChanges(false);
    } catch (error) {
        console.error("Error saving payment methods:", error);
        toast({
            title: "Error al Guardar",
            description: "No se pudieron guardar los cambios en la base de datos.",
            variant: "destructive",
        });
    } finally {
        setIsSaving(false);
    }
  };
  
  const filteredLocationsForManagement = useMemo(() => {
    if (locationFilter === ALL_LOCATIONS_FILTER) {
      return locations;
    }
    return locations.filter(loc => loc.id === locationFilter);
  }, [locationFilter, locations]);

  const saveGroups = useCallback(async (updatedGroups: PaymentGroup[]) => {
      setIsSavingGroups(true);
      try {
        await savePaymentGroups(updatedGroups);
        toast({ title: "Grupos Guardados", description: "La configuración de grupos de pago ha sido guardada."});
      } catch (error) {
        console.error("Error saving payment groups:", error);
        toast({ title: "Error", description: "No se pudieron guardar los grupos.", variant: "destructive"});
      } finally {
        setIsSavingGroups(false);
      }
  }, [toast]);
  

  const handleCreateGroup = () => {
    if (newGroupName && !paymentGroups.find(g => g.name.toLowerCase() === newGroupName.toLowerCase())) {
      const updatedGroups = [...paymentGroups, { id: newGroupName.toLowerCase().replace(/ /g, '_'), name: newGroupName, methods: [] }];
      setPaymentGroups(updatedGroups);
      saveGroups(updatedGroups);
      setNewGroupName("");
    }
  };

  const handleDropOnGroup = (groupName: string) => {
    if (draggedMethod) {
      const updatedGroups = paymentGroups.map(group => {
        // Remove from any existing group
        const filteredMethods = group.methods.filter(m => m !== draggedMethod);
        if (group.name === groupName) {
          // Add to the target group if not already there
          if (!filteredMethods.includes(draggedMethod)) {
            return { ...group, methods: [...filteredMethods, draggedMethod] };
          }
        }
        return { ...group, methods: filteredMethods };
      });
      setPaymentGroups(updatedGroups);
      saveGroups(updatedGroups);
      setDraggedMethod(null);
    }
  };
  
  const handleRemoveFromGroup = (method: string, groupName: string) => {
    const updatedGroups = paymentGroups.map(group => {
        if (group.name === groupName) {
            return { ...group, methods: group.methods.filter(m => m !== method) };
        }
        return group;
    });
    setPaymentGroups(updatedGroups);
    saveGroups(updatedGroups);
  };

  const handleDeleteGroup = (groupNameToDelete: string) => {
    const updatedGroups = paymentGroups.filter(group => group.name !== groupNameToDelete);
    setPaymentGroups(updatedGroups);
    saveGroups(updatedGroups);
  };


  if (authIsLoading || !user || (user.role !== USER_ROLES.CONTADOR && user.role !== USER_ROLES.ADMIN)) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="ml-2">Cargando...</p>
      </div>
    );
  }
  
  const id = "donut-interactive"
  const totalValue = React.useMemo(() => {
    return chartData.reduce((acc, curr) => acc + curr.value, 0)
  }, [chartData])


  return (
    <div className="container mx-auto py-8 px-4 md:px-0 space-y-8">
      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle className="text-3xl flex items-center gap-2">
            <Landmark className="text-primary" />
            Módulo de Finanzas
          </CardTitle>
          <CardDescription>
            Reporte de ingresos mensuales y gestión de métodos de pago por sede.
          </CardDescription>
        </CardHeader>
      </Card>
      
      <Card>
        <CardHeader>
          <CardTitle>Reporte de Ingresos Mensuales</CardTitle>
          <div className="flex flex-col sm:flex-row gap-2 mt-2 items-center">
            <Select value={String(selectedMonth)} onValueChange={(val) => setSelectedMonth(Number(val))}>
              <SelectTrigger className="w-full sm:w-[180px]"><SelectValue placeholder="Mes" /></SelectTrigger>
              <SelectContent>{months.map(m => <SelectItem key={m.value} value={String(m.value)}>{m.label}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={String(selectedYear)} onValueChange={(val) => setSelectedYear(Number(val))}>
              <SelectTrigger className="w-full sm:w-[120px]"><SelectValue placeholder="Año" /></SelectTrigger>
              <SelectContent>{availableYears.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
            </Select>
             <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button variant="outline" className="w-full sm:w-auto">
                        <Filter className="mr-2 h-4 w-4"/>
                        Filtrar por Grupos de Pago
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                    <DropdownMenuLabel>Mostrar Grupos de Pago</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuCheckboxItem
                        checked={selectedPaymentGroups.length === allAvailablePaymentGroups.length}
                        onCheckedChange={(checked) => setSelectedPaymentGroups(checked ? allAvailablePaymentGroups : [])}
                    >
                        Seleccionar Todos
                    </DropdownMenuCheckboxItem>
                     <DropdownMenuCheckboxItem
                        checked={selectedPaymentGroups.length === 0}
                        onCheckedChange={(checked) => setSelectedPaymentGroups(checked ? [] : allAvailablePaymentGroups)}
                    >
                        No Seleccionar Ninguno
                    </DropdownMenuCheckboxItem>
                    <DropdownMenuSeparator />
                    {allAvailablePaymentGroups.map(group => (
                        <DropdownMenuCheckboxItem
                            key={group}
                            checked={selectedPaymentGroups.includes(group)}
                            onCheckedChange={(checked) => {
                                setSelectedPaymentGroups(prev => 
                                    checked ? [...prev, group] : prev.filter(g => g !== group)
                                );
                            }}
                        >
                            {group}
                        </DropdownMenuCheckboxItem>
                    ))}
                </DropdownMenuContent>
            </DropdownMenu>
          </div>
           {user && (user.role === USER_ROLES.ADMIN || user.role === USER_ROLES.CONTADOR) && (
            <div className="mt-2 text-sm text-muted-foreground">
              Viendo para: {adminSelectedLocation === 'all' ? 'Todas las sedes' : locations.find(l => l.id === adminSelectedLocation)?.name || 'Sede no especificada'}
            </div>
          )}
        </CardHeader>
        <CardContent>
            <Tabs defaultValue="table" className="w-full">
              <TabsList>
                <TabsTrigger value="table">Tabla de Ingresos</TabsTrigger>
                <TabsTrigger value="chart">Gráfico de Distribución</TabsTrigger>
              </TabsList>
              <TabsContent value="table">
                {isLoading ? (
                  <div className="flex justify-center items-center h-40"><Loader2 className="h-8 w-8 animate-spin" /></div>
                ) : reportData.length === 0 ? (
                  <div className="p-6 border rounded-lg bg-secondary/30 text-center mt-4">
                      <AlertTriangle className="h-10 w-10 text-muted-foreground mx-auto mb-2" />
                      <p className="text-muted-foreground">No se encontraron ingresos para el periodo y selección actual.</p>
                  </div>
                ) : (
                  <Table className="mt-4">
                    <TableHeader>
                      <TableRow>
                        <TableHead>Sede</TableHead>
                        {filteredPaymentGroups.map(group => <TableHead key={group} className="text-right">{group}</TableHead>)}
                        <TableHead className="text-right font-bold">Total Sede (Filtrado)</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {reportData.map(row => (
                        <TableRow key={row.locationId}>
                          <TableCell className="font-medium">{row.locationName}</TableCell>
                          {filteredPaymentGroups.map(group => (
                            <TableCell key={group} className="text-right">
                              {(row.totalsByMethod[group] || 0).toFixed(2)}
                            </TableCell>
                          ))}
                          <TableCell className="text-right font-bold">
                            {filteredPaymentGroups.reduce((sum, group) => sum + (row.totalsByMethod[group] || 0), 0).toFixed(2)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                    <TableFooterComponent>
                      <TableRow className="bg-muted/80 font-bold">
                        <TableCell>Total General (Filtrado)</TableCell>
                        {filteredPaymentGroups.map(group => (
                          <TableCell key={group} className="text-right">
                            {(Object.values(totalsByPaymentGroup).reduce((total, current) => total + (current || 0), 0) > 0 ? (reportData.reduce((sum, row) => sum + (row.totalsByMethod[group] || 0), 0)).toFixed(2) : '0.00')}
                          </TableCell>
                        ))}
                        <TableCell className="text-right text-lg">
                          S/ {grandTotal.toFixed(2)}
                        </TableCell>
                      </TableRow>
                    </TableFooterComponent>
                  </Table>
                )}
              </TabsContent>
              <TabsContent value="chart">
                {isLoading ? (
                  <div className="flex justify-center items-center h-40"><Loader2 className="h-8 w-8 animate-spin" /></div>
                ) : Object.keys(totalsByPaymentGroup).length === 0 ? (
                  <div className="p-6 border rounded-lg bg-secondary/30 text-center mt-4">
                      <AlertTriangle className="h-10 w-10 text-muted-foreground mx-auto mb-2" />
                      <p className="text-muted-foreground">No hay datos suficientes para mostrar el gráfico.</p>
                  </div>
                ) : (
                  <Card className="mt-4">
                      <CardHeader>
                          <CardTitle className="flex items-center gap-2"><PieChartIcon />Distribución de Ingresos por Grupo de Pago</CardTitle>
                          <CardDescription>
                              Visualización del total de ingresos por tipo de pago. Puede crear grupos personalizados para consolidar la vista.
                          </CardDescription>
                      </CardHeader>
                      <CardContent className="flex-1 pb-0">
                          <ChartContainer
                            id={id}
                            config={chartConfig}
                            className="mx-auto aspect-square h-[250px]"
                          >
                            <PieChart>
                              <ChartTooltip
                                cursor={false}
                                content={<ChartTooltipContent hideLabel />}
                              />
                              <Pie
                                data={chartData.filter(d => activeChartSlices.some(sliceName => d.name === sliceName))}
                                dataKey="value"
                                nameKey="name"
                                innerRadius="60%"
                                strokeWidth={5}
                                activeIndex={chartData.findIndex((d) => d.name === activeDonutSlice)}
                                activeShape={({ ...props }) => <Sector {...props} cornerRadius={5} />}
                                onMouseUp={(data) => {
                                  if (activeDonutSlice === data.name) {
                                    setActiveDonutSlice(null);
                                  } else {
                                    setActiveDonutSlice(data.name);
                                  }
                                }}
                              >
                                {chartData.map((entry) => (
                                  <Cell
                                      key={entry.name}
                                      fill={entry.fill}
                                      className="outline-none"
                                      onClick={() => {
                                        if (activeDonutSlice === entry.name) {
                                          setActiveDonutSlice(null);
                                        } else {
                                          setActiveDonutSlice(entry.name);
                                        }
                                      }}
                                  />
                                ))}
                              </Pie>
                              <ChartLegend
                                content={
                                  <ChartLegendContent
                                      nameKey="name"
                                      payload={chartData.map(item => ({...item, value: item.name, color: item.fill, type: activeChartSlices.includes(item.name) ? 'circle' : 'line', inactive: !activeChartSlices.includes(item.name) }))}
                                      onClick={(data) => {
                                        const { value } = data;
                                        if (activeChartSlices.includes(value)) {
                                          setActiveChartSlices(
                                            activeChartSlices.filter((label) => label !== value)
                                          );
                                        } else {
                                          setActiveChartSlices([...activeChartSlices, value]);
                                        }
                                      }}
                                  />
                                }
                              />
                            </PieChart>
                          </ChartContainer>
                      </CardContent>
                      <CardFooter className="flex-col gap-2 text-sm">
                          <div className="leading-none text-muted-foreground text-center">
                              Clic en la leyenda para ocultar/mostrar un grupo. Clic en una porción de la dona para resaltarla.
                          </div>
                      </CardFooter>
                  </Card>
                )}
              </TabsContent>
            </Tabs>
        </CardContent>
      </Card>
      
      <Card>
          <CardHeader>
              <CardTitle className="flex items-center gap-2"><Layers />Gestor de Grupos de Pago</CardTitle>
              <CardDescription>
                  Cree grupos para consolidar los métodos de pago en los reportes. Arrastre un método de pago a un grupo para asignarlo. Los cambios se guardan automáticamente.
              </CardDescription>
          </CardHeader>
          <CardContent className="w-full p-4 border rounded-lg mt-4">
              <div className="flex gap-2 mb-4">
                <Input 
                    placeholder="Nombre del nuevo grupo" 
                    value={newGroupName} 
                    onChange={(e) => setNewGroupName(e.target.value)}
                />
                <Button onClick={handleCreateGroup} disabled={isSavingGroups}>Crear Grupo</Button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <div>
                    <h5 className="text-sm font-bold mb-2 p-2">MÉTODOS SIN AGRUPAR</h5>
                    <div className="space-y-1 p-2 border rounded-md bg-muted/20 min-h-[100px]">
                        {allAvailablePaymentMethods
                          .filter(method => !paymentGroups.some(g => g.methods.includes(method)))
                          .map((method) => (
                            <div 
                              key={method} 
                              className="text-sm p-1.5 border rounded bg-background cursor-grab"
                              draggable
                              onDragStart={() => setDraggedMethod(method)}
                            >
                                {method}
                            </div>
                        ))}
                    </div>
                </div>
                <div className="space-y-2 lg:col-span-2">
                     <h5 className="text-sm font-bold mb-2 p-2">GRUPOS PERSONALIZADOS {isSavingGroups && <Loader2 className="h-4 w-4 animate-spin inline-block ml-2"/>}</h5>
                     <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                     {paymentGroups.map(group => (
                        <div 
                            key={group.name}
                            className="p-2 border rounded-lg bg-muted/50"
                            onDragOver={(e) => e.preventDefault()}
                            onDrop={() => handleDropOnGroup(group.name)}
                        >
                            <div className="flex justify-between items-center mb-2 p-1">
                              <h6 className="text-sm font-semibold flex items-center gap-1"><Group size={16}/> {group.name}</h6>
                              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleDeleteGroup(group.name)}><Trash2 size={14}/></Button>
                            </div>
                            <div className="space-y-1 min-h-[40px] border-t pt-2">
                                {group.methods.map(method => (
                                    <div key={method} className="flex items-center justify-between text-sm p-1.5 bg-card rounded border">
                                        <span>{method}</span>
                                        <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => handleRemoveFromGroup(method, group.name)}><X size={12}/></Button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
                    </div>
                </div>
            </div>
          </CardContent>
      </Card>


      <Card className="shadow-lg">
        <CardHeader>
            <CardTitle>Gestión de Métodos de Pago por Sede</CardTitle>
            <CardDescription>
                Añada, edite o elimine los métodos de pago para cada una de sus sedes.
            </CardDescription>
            <div className="pt-4">
              <Label htmlFor="location-filter">Filtrar por Sede</Label>
              <Select value={locationFilter} onValueChange={(value) => setLocationFilter(value as LocationId | 'all')}>
                  <SelectTrigger id="location-filter" className="w-full sm:w-[280px]">
                      <SelectValue placeholder="Seleccionar Sede" />
                  </SelectTrigger>
                  <SelectContent>
                      <SelectItem value={ALL_LOCATIONS_FILTER}>Todas las Sedes</SelectItem>
                      {locations.map(loc => (
                          <SelectItem key={loc.id} value={loc.id}>{loc.name}</SelectItem>
                      ))}
                  </SelectContent>
              </Select>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
            {filteredLocationsForManagement.map(location => (
                <div key={location.id} className="p-4 border rounded-lg">
                    <h4 className="font-semibold mb-4 text-lg">{location.name}</h4>
                    <div className="mb-4 flex gap-2 items-end">
                      <div className="flex-grow">
                        <Label htmlFor={`new-method-${location.id}`} className="text-xs">Nuevo Método de Pago</Label>
                        <Input
                            id={`new-method-${location.id}`}
                            value={newMethodInputs[location.id] || ''}
                            onChange={(e) => setNewMethodInputs(prev => ({...prev, [location.id]: e.target.value}))}
                        />
                      </div>
                      <Button onClick={() => handleAddNewMethod(location.id)} size="sm">
                        <PlusCircle className="mr-2 h-4 w-4"/> Añadir
                      </Button>
                    </div>
                    <Separator/>
                    <div className="mt-4">
                      <p className="text-sm font-medium mb-2">Métodos activos para {location.name}:</p>
                      {(paymentMethodsByLocation[location.id] || []).length > 0 ? (
                        <div className="flex flex-wrap gap-2">
                          {(paymentMethodsByLocation[location.id] || []).map(method => (
                            <div key={method} className="flex items-center space-x-2 bg-muted/60 p-2 rounded-md">
                                {editingMethod?.locationId === location.id && editingMethod?.oldName === method ? (
                                  <div className="flex items-center gap-1">
                                    <Input 
                                        value={editingMethod.newName}
                                        onChange={(e) => setEditingMethod({...editingMethod, newName: e.target.value})}
                                        className="h-7 text-sm"
                                    />
                                    <Button size="icon" className="h-7 w-7" onClick={handleSaveMethodEdit}><Check size={16}/></Button>
                                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={handleCancelEditing}><X size={16}/></Button>
                                  </div>
                                ) : (
                                  <>
                                    <Label htmlFor={`${location.id}-${method}`} className="text-sm">
                                        {method}
                                    </Label>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-6 w-6 text-blue-600 hover:bg-blue-500/10"
                                      onClick={() => handleStartEditing(location.id, method)}
                                      title="Editar nombre"
                                    >
                                      <Pencil size={14} />
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-6 w-6 text-destructive hover:bg-destructive/10"
                                      onClick={() => handleRemoveMethod(location.id, method as PaymentMethod)}
                                      disabled={completedAppointments.some(a => a.locationId === location.id && a.paymentMethod === method)}
                                      title={completedAppointments.some(a => a.locationId === location.id && a.paymentMethod === method) ? "Este método está en uso y no puede ser eliminado." : "Eliminar método"}
                                    >
                                      <Trash2 size={14} />
                                    </Button>
                                  </>
                                )}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-muted-foreground italic">No hay métodos de pago configurados para esta sede.</p>
                      )}
                    </div>
                </div>
            ))}
             <div className="flex justify-end mt-6">
                <Button onClick={handleSaveAllChanges} disabled={isSaving || !hasChanges}>
                    {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Guardar Toda la Configuración
                </Button>
            </div>
            
        </CardContent>
      </Card>
    </div>
  );
}
