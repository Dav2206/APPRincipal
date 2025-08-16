
"use client";

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import type { Appointment, LocationId, PaymentMethod, Location } from '@/types';
import { useAuth } from '@/contexts/auth-provider';
import { useAppState } from '@/contexts/app-state-provider';
import { getAppointments, getLocations, updateLocationPaymentMethods } from '@/lib/data';
import { USER_ROLES, APPOINTMENT_STATUS, APPOINTMENT_STATUS_DISPLAY } from '@/lib/constants';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { format, startOfMonth, endOfMonth, getYear, getMonth, setYear, setMonth } from 'date-fns';
import { es } from 'date-fns/locale';
import { Landmark, Loader2, AlertTriangle, ListPlus, Trash2, Filter, PlusCircle, Pencil, Check, X, PieChartIcon } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { useRouter } from 'next/navigation';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { Pie, PieChart, Cell } from "recharts"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
  type ChartConfig,
} from "@/components/ui/chart"
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuCheckboxItem, DropdownMenuLabel, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';


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


  useEffect(() => {
    async function loadLocations() {
        const fetchedLocations = await getLocations();
        setLocations(fetchedLocations);
        const initialPaymentMethods: Record<LocationId, PaymentMethod[]> = {} as Record<LocationId, PaymentMethod[]>
        const initialInputs: Record<LocationId, string> = {};
        fetchedLocations.forEach(loc => {
            initialPaymentMethods[loc.id] = loc.paymentMethods || [];
            initialInputs[loc.id] = '';
        });
        setPaymentMethodsByLocation(initialPaymentMethods);
        setNewMethodInputs(initialInputs);
    }
    loadLocations();
  }, []);

  const allAvailablePaymentGroups = useMemo(() => {
    const allGroups = new Set<string>();
    
    // Consider payment methods from the current state, filtered by the selected location
    const relevantLocations = (adminSelectedLocation === 'all' || !adminSelectedLocation)
      ? Object.keys(paymentMethodsByLocation) as LocationId[]
      : [adminSelectedLocation as LocationId];

    relevantLocations.forEach(locId => {
      const methodsForLocation = paymentMethodsByLocation[locId] || [];
      methodsForLocation.forEach(method => {
        const baseType = method.split(' - ')[0].trim();
        allGroups.add(baseType);
      });
    });

    // Also consider payment methods from historical completed appointments (these are already filtered by location)
    completedAppointments.forEach(appt => {
      if (appt.paymentMethod) {
          const baseType = appt.paymentMethod.split(' - ')[0].trim();
          allGroups.add(baseType);
      }
    });
    
    return Array.from(allGroups).sort((a,b) => a.localeCompare(b));
  }, [paymentMethodsByLocation, completedAppointments, adminSelectedLocation]);
  
  useEffect(() => {
    setSelectedPaymentGroups(allAvailablePaymentGroups);
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
          
          const paymentGroup = appt.paymentMethod.split(' - ')[0].trim();

          // Sum main service amount
          if (appt.amountPaid && appt.amountPaid > 0) {
            entry.totalsByMethod[paymentGroup] = (entry.totalsByMethod[paymentGroup] || 0) + appt.amountPaid;
            entry.locationTotal += appt.amountPaid;
          }
          
          // Sum added services amounts
          if (appt.addedServices) {
            for (const addedSvc of appt.addedServices) {
              if (addedSvc.amountPaid && addedSvc.amountPaid > 0) {
                entry.totalsByMethod[paymentGroup] = (entry.totalsByMethod[paymentGroup] || 0) + addedSvc.amountPaid;
                entry.locationTotal += addedSvc.amountPaid;
              }
            }
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
  }, [user, selectedYear, selectedMonth, adminSelectedLocation, toast, locations]);

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
    filteredPaymentGroups.forEach(group => {
        totals[group] = reportData.reduce((sum, row) => sum + (row.totalsByMethod[group] || 0), 0);
    });
    return totals;
  }, [reportData, filteredPaymentGroups]);

  const chartData = useMemo(() => {
    return Object.entries(totalsByPaymentGroup)
      .map(([name, value]) => ({ name, value: value || 0, fill: `var(--color-${name.toLowerCase().replace(/ /g, "_")})` }))
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


  if (authIsLoading || !user || (user.role !== USER_ROLES.CONTADOR && user.role !== USER_ROLES.ADMIN)) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="ml-2">Cargando...</p>
      </div>
    );
  }

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
          {isLoading ? (
            <div className="flex justify-center items-center h-40"><Loader2 className="h-8 w-8 animate-spin" /></div>
          ) : reportData.length === 0 ? (
            <div className="p-6 border rounded-lg bg-secondary/30 text-center">
                <AlertTriangle className="h-10 w-10 text-muted-foreground mx-auto mb-2" />
                <p className="text-muted-foreground">No se encontraron ingresos para el periodo y selección actual.</p>
            </div>
          ) : (
            <>
            <Table>
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
              <TableFooter>
                <TableRow className="bg-muted/80 font-bold">
                  <TableCell>Total General (Filtrado)</TableCell>
                  {filteredPaymentGroups.map(group => (
                    <TableCell key={group} className="text-right">
                      {(totalsByPaymentGroup[group] || 0).toFixed(2)}
                    </TableCell>
                  ))}
                  <TableCell className="text-right text-lg">
                    S/ {grandTotal.toFixed(2)}
                  </TableCell>
                </TableRow>
              </TableFooter>
            </Table>
            {chartData.length > 0 && (
                <Card className="mt-8">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2"><PieChartIcon />Distribución de Ingresos por Grupo de Pago</CardTitle>
                        <CardDescription>
                            Visualización del total de ingresos por tipo de pago para la selección actual. Los pagos se agrupan por su primera palabra (ej. "Tarjeta - Visa" se agrupa como "Tarjeta").
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <ChartContainer
                            config={chartConfig}
                            className="mx-auto aspect-square max-h-[300px]"
                        >
                            <PieChart>
                            <ChartTooltip
                                cursor={false}
                                content={<ChartTooltipContent hideLabel />}
                            />
                            <Pie
                                data={chartData}
                                dataKey="value"
                                nameKey="name"
                                innerRadius="60%"
                                strokeWidth={5}
                            >
                                {chartData.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={entry.fill} />
                                ))}
                            </Pie>
                            <ChartLegend
                                content={<ChartLegendContent nameKey="name" />}
                                className="-mt-2"
                            />
                            </PieChart>
                        </ChartContainer>
                    </CardContent>
                </Card>
            )}
            </>
          )}
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
                         <p className="text-xs text-muted-foreground mt-1">
                            Para agrupar, use un prefijo común (ej: "Yape - Cuenta A", "Yape - Cuenta B").
                        </p>
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
