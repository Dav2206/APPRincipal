

"use client";

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import type { Appointment, LocationId, PaymentMethod, Location, PaymentGroup, GroupingPreset } from '@/types';
import { useAuth } from '@/contexts/auth-provider';
import { useAppState } from '@/contexts/app-state-provider';
import { getAppointments, getLocations, updateLocationPaymentMethods, getGroupingPresets, saveGroupingPresets } from '@/lib/data';
import { USER_ROLES, APPOINTMENT_STATUS } from '@/lib/constants';

import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter as TableFooterComponent } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { format, startOfMonth, endOfMonth, getYear, getMonth, setYear, setMonth } from 'date-fns';
import { es } from 'date-fns/locale';
import { Landmark, Loader2, AlertTriangle, ListPlus, Trash2, Filter, PlusCircle, Pencil, Check, X, PieChartIcon, Group, Layers, Settings2, FolderPlus, ChevronsUpDown, Folder } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { useRouter } from 'next/navigation';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { Pie, PieChart, Cell, Sector, Legend } from "recharts"
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
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';


type ReportRow = {
  locationId: LocationId;
  locationName: string;
  totalsByMethod: Partial<Record<string, number>>;
  locationTotal: number;
};

const currentSystemYear = getYear(new Date());
const availableYears = [currentSystemYear, currentSystemYear - 1, currentSystemYear - 2];
const months = Array.from({ length: 12 }, (_, i) => ({
  value: i,
  label: format(new Date(currentSystemYear, i), 'MMMM', { locale: es }),
}));

const ALL_LOCATIONS_FILTER = "all";
const NO_GROUPING_PRESET_ID = "__no_grouping__";

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

  // Grouping state
  const [groupingPresets, setGroupingPresets] = useState<GroupingPreset[]>([]);
  const [selectedPresetId, setSelectedPresetId] = useState<string>(NO_GROUPING_PRESET_ID);
  const [isSavingPresets, setIsSavingPresets] = useState(false);
  const [isPresetsPopoverOpen, setIsPresetsPopoverOpen] = useState(false);
  const [newPresetName, setNewPresetName] = useState("");
  const [editingPreset, setEditingPreset] = useState<GroupingPreset | null>(null);
  const [draggedMethod, setDraggedMethod] = useState<{ method: string; fromGroupId?: string } | null>(null);


  useEffect(() => {
    async function loadInitialData() {
        const [fetchedLocations, fetchedPresets] = await Promise.all([
            getLocations(),
            getGroupingPresets()
        ]);
        
        setLocations(fetchedLocations);
        setGroupingPresets(fetchedPresets || []);

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

  
  useEffect(() => {
    if (!authIsLoading && (!user || (user.role !== USER_ROLES.CONTADOR && user.role !== USER_ROLES.ADMIN))) {
      router.replace('/dashboard'); 
    }
  }, [user, authIsLoading, router]);

  const activePaymentGroups = useMemo(() => {
    if (selectedPresetId === NO_GROUPING_PRESET_ID) {
      return [];
    }
    const preset = groupingPresets.find(p => p.id === selectedPresetId);
    return preset?.groups || [];
  }, [selectedPresetId, groupingPresets]);

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
          
          const groupName = activePaymentGroups.find(g => g.methods.includes(appt.paymentMethod!))?.name || appt.paymentMethod;

          let totalAppointmentAmount = (appt.amountPaid || 0) + (appt.addedServices?.reduce((sum, as) => sum + (as.amountPaid || 0), 0) || 0);

          if (totalAppointmentAmount > 0) {
            entry.totalsByMethod[groupName] = (entry.totalsByMethod[groupName] || 0) + totalAppointmentAmount;
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
  }, [user, selectedYear, selectedMonth, adminSelectedLocation, toast, locations, activePaymentGroups]);

  const totalsByPaymentGroup = useMemo(() => {
    const totals: Partial<Record<string, number>> = {};
    
    completedAppointments.forEach(appt => {
        let totalAppointmentAmount = (appt.amountPaid || 0) + (appt.addedServices?.reduce((sum, as) => sum + (as.amountPaid || 0), 0) || 0);
        if (appt.paymentMethod && totalAppointmentAmount > 0) {
            const groupName = activePaymentGroups.find(g => g.methods.includes(appt.paymentMethod!))?.name || appt.paymentMethod;
            totals[groupName] = (totals[groupName] || 0) + totalAppointmentAmount;
        }
    });

    return totals;
  }, [completedAppointments, activePaymentGroups]);

  const allAvailablePaymentGroupsInView = useMemo(() => {
    return Array.from(new Set(Object.keys(totalsByPaymentGroup))).sort();
  }, [totalsByPaymentGroup]);
  
  const grandTotal = useMemo(() => {
    return Object.values(totalsByPaymentGroup).reduce((sum, total) => sum + (total || 0), 0);
  }, [totalsByPaymentGroup]);
  
  // State for Chart Interactivity
  const [activeIndex, setActiveIndex] = useState<number | undefined>(undefined);
  const [hiddenSlices, setHiddenSlices] = useState<string[]>([]);

  const onPieEnter = useCallback((_: any, index: number) => {
    setActiveIndex(index);
  }, [setActiveIndex]);

  const onPieLeave = useCallback(() => {
    setActiveIndex(undefined);
  }, [setActiveIndex]);
  
  const toggleSliceVisibility = (dataKey: string) => {
    setHiddenSlices(prev =>
      prev.includes(dataKey) ? prev.filter(key => key !== dataKey) : [...prev, dataKey]
    );
  };
  
  const chartData = useMemo(() => {
    return Object.entries(totalsByPaymentGroup)
      .map(([name, value]) => ({ name, value, fill: `var(--color-${name.toLowerCase().replace(/[\s-]/g, "_")})` }))
      .filter(item => item.value > 0);
  }, [totalsByPaymentGroup]);

  const activeChartSlices = useMemo(() => {
    return chartData.filter(slice => !hiddenSlices.includes(slice.name));
  }, [chartData, hiddenSlices]);


  const chartConfig = useMemo(() => {
    const config: ChartConfig = {};
    chartData.forEach((item, index) => {
      config[item.name.toLowerCase().replace(/[\s-]/g, "_")] = {
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

  // --- Grouping Preset Handlers ---
  const savePresets = useCallback(async (updatedPresets: GroupingPreset[]) => {
      setIsSavingPresets(true);
      try {
        await saveGroupingPresets(updatedPresets);
        toast({ title: "Conjuntos de Agrupación Guardados", description: "La configuración se ha guardado exitosamente."});
      } catch (error) {
        console.error("Error saving grouping presets:", error);
        toast({ title: "Error", description: "No se pudieron guardar los conjuntos.", variant: "destructive"});
      } finally {
        setIsSavingPresets(false);
      }
  }, [toast]);
  

  const handleCreatePreset = () => {
    if (newPresetName && !groupingPresets.find(g => g.name.toLowerCase() === newPresetName.toLowerCase())) {
      const newPreset: GroupingPreset = { id: `preset_${Date.now()}`, name: newPresetName, groups: [] };
      const updatedPresets = [...groupingPresets, newPreset];
      setGroupingPresets(updatedPresets);
      savePresets(updatedPresets);
      setNewPresetName("");
    }
  };
  
  const handleDeletePreset = (presetId: string) => {
    if(selectedPresetId === presetId) setSelectedPresetId(NO_GROUPING_PRESET_ID);
    const updatedPresets = groupingPresets.filter(p => p.id !== presetId);
    setGroupingPresets(updatedPresets);
    savePresets(updatedPresets);
  };
  
  const handleCreateGroupInPreset = (presetId: string, newGroupName: string) => {
      const updatedPresets = groupingPresets.map(p => {
          if (p.id === presetId) {
              if (p.groups.find(g => g.name.toLowerCase() === newGroupName.toLowerCase())) {
                  toast({title: "Grupo Duplicado", description: "Ya existe un grupo con este nombre en el conjunto.", variant: "default"});
                  return p;
              }
              const newGroup: PaymentGroup = { id: `group_${Date.now()}`, name: newGroupName, methods: [] };
              return { ...p, groups: [...p.groups, newGroup] };
          }
          return p;
      });
      setGroupingPresets(updatedPresets);
      savePresets(updatedPresets);
  };

  const handleDropOnGroup = (presetId: string, groupId: string) => {
    if (!draggedMethod) return;

    const updatedPresets = groupingPresets.map(p => {
      if (p.id === presetId) {
        const updatedGroups = p.groups.map(g => {
          // Remove from previous group within the same preset
          let methods = g.methods.filter(m => m !== draggedMethod.method);
          // Add to the target group
          if (g.id === groupId && !methods.includes(draggedMethod.method)) {
            methods.push(draggedMethod.method);
          }
          return { ...g, methods };
        });
        return { ...p, groups: updatedGroups };
      }
      return p;
    });

    setGroupingPresets(updatedPresets);
    savePresets(updatedPresets);
    setDraggedMethod(null);
  };
  
  const handleRemoveFromGroup = (presetId: string, groupId: string, method: string) => {
    const updatedPresets = groupingPresets.map(p => {
        if (p.id === presetId) {
            const updatedGroups = p.groups.map(g => {
                if (g.id === groupId) {
                    return { ...g, methods: g.methods.filter(m => m !== method) };
                }
                return g;
            });
            return { ...p, groups: updatedGroups };
        }
        return p;
    });
    setGroupingPresets(updatedPresets);
    savePresets(updatedPresets);
  };

  const handleDeleteGroup = (presetId: string, groupId: string) => {
    const updatedPresets = groupingPresets.map(p => {
        if (p.id === presetId) {
            return { ...p, groups: p.groups.filter(g => g.id !== groupId) };
        }
        return p;
    });
    setGroupingPresets(updatedPresets);
    savePresets(updatedPresets);
  };
  
  const allPaymentMethodsInView = useMemo(() => {
    const methods = new Set<string>();
    completedAppointments.forEach(appt => {
      if (appt.paymentMethod) {
        methods.add(appt.paymentMethod);
      }
    });
    return Array.from(methods).sort();
  }, [completedAppointments]);
  
  const getUngroupedMethods = useCallback((preset?: GroupingPreset): string[] => {
    if (!preset) return allPaymentMethodsInView;
    const groupedMethods = new Set(preset.groups.flatMap(g => g.methods));
    return allPaymentMethodsInView.filter(m => !groupedMethods.has(m));
  }, [allPaymentMethodsInView]);


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
            Reporte de ingresos mensuales y gestión de métodos y grupos de pago.
          </CardDescription>
        </CardHeader>
      </Card>
      
      <Card>
        <CardHeader>
          <CardTitle>Reporte de Ingresos Mensuales</CardTitle>
          <div className="flex flex-col sm:flex-row gap-2 mt-2 items-center flex-wrap">
            <Select value={String(selectedMonth)} onValueChange={(val) => setSelectedMonth(Number(val))}>
              <SelectTrigger className="w-full sm:w-[180px]"><SelectValue placeholder="Mes" /></SelectTrigger>
              <SelectContent>{months.map(m => <SelectItem key={m.value} value={String(m.value)}>{m.label}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={String(selectedYear)} onValueChange={(val) => setSelectedYear(Number(val))}>
              <SelectTrigger className="w-full sm:w-[120px]"><SelectValue placeholder="Año" /></SelectTrigger>
              <SelectContent>{availableYears.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
            </Select>
             <Popover open={isPresetsPopoverOpen} onOpenChange={setIsPresetsPopoverOpen}>
                <PopoverTrigger asChild>
                    <Button variant="outline"><Settings2 className="mr-2 h-4 w-4"/>Gestionar Conjuntos</Button>
                </PopoverTrigger>
                <PopoverContent className="w-[400px] sm:w-[500px] md:w-[600px] p-4">
                    <div className="space-y-4">
                        <h4 className="font-medium">Gestor de Conjuntos de Agrupación</h4>
                        <div className="flex gap-2">
                            <Input placeholder="Nombre del nuevo conjunto" value={newPresetName} onChange={e => setNewPresetName(e.target.value)} />
                            <Button onClick={handleCreatePreset}>Crear Conjunto</Button>
                        </div>
                        <Separator/>
                        <div className="max-h-[40vh] overflow-y-auto space-y-3 p-1">
                            {groupingPresets.map(preset => (
                                <PresetEditor 
                                    key={preset.id} 
                                    preset={preset} 
                                    ungroupedMethods={getUngroupedMethods(preset)}
                                    onDeletePreset={handleDeletePreset}
                                    onCreateGroup={handleCreateGroupInPreset}
                                    onDeleteGroup={handleDeleteGroup}
                                    onDropOnGroup={handleDropOnGroup}
                                    onRemoveFromGroup={handleRemoveFromGroup}
                                    draggedMethod={draggedMethod}
                                    setDraggedMethod={setDraggedMethod}
                                />
                            ))}
                        </div>
                    </div>
                </PopoverContent>
             </Popover>
          </div>
          <div className="mt-4 space-y-2">
             <Label>Agrupar por</Label>
             <div className="flex flex-wrap gap-2">
                <Button 
                    variant={selectedPresetId === NO_GROUPING_PRESET_ID ? 'default' : 'outline'}
                    onClick={() => setSelectedPresetId(NO_GROUPING_PRESET_ID)}
                    size="sm"
                >
                    Vista Detallada
                </Button>
                {groupingPresets.map(preset => (
                    <Button
                        key={preset.id}
                        variant={selectedPresetId === preset.id ? 'default' : 'outline'}
                        onClick={() => setSelectedPresetId(preset.id)}
                        size="sm"
                    >
                        {preset.name}
                    </Button>
                ))}
             </div>
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
                        {allAvailablePaymentGroupsInView.map(group => <TableHead key={group} className="text-right">{group}</TableHead>)}
                        <TableHead className="text-right font-bold">Total Sede</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {reportData.map(row => (
                        <TableRow key={row.locationId}>
                          <TableCell className="font-medium">{row.locationName}</TableCell>
                          {allAvailablePaymentGroupsInView.map(group => (
                            <TableCell key={group} className="text-right">
                              {(row.totalsByMethod[group] || 0).toFixed(2)}
                            </TableCell>
                          ))}
                          <TableCell className="text-right font-bold">
                            {Object.values(row.totalsByMethod).reduce((sum, val) => sum + (val || 0), 0).toFixed(2)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                    <TableFooterComponent>
                      <TableRow className="bg-muted/80 font-bold">
                        <TableCell>Total General</TableCell>
                        {allAvailablePaymentGroupsInView.map(group => (
                          <TableCell key={group} className="text-right">
                            {(reportData.reduce((sum, row) => sum + (row.totalsByMethod[group] || 0), 0)).toFixed(2)}
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
              <TabsContent value="chart" className="flex justify-center items-center flex-col min-h-[450px]">
                {isLoading ? (
                    <div className="flex justify-center items-center h-40"><Loader2 className="h-8 w-8 animate-spin" /></div>
                ) : activeChartSlices.length === 0 ? (
                    <div className="p-6 border rounded-lg bg-secondary/30 text-center mt-4">
                        <AlertTriangle className="h-10 w-10 text-muted-foreground mx-auto mb-2" />
                        <p className="text-muted-foreground">{chartData.length > 0 ? 'Todos los grupos están ocultos. Selecciónelos en la leyenda.' : 'No hay datos para mostrar el gráfico.'}</p>
                    </div>
                ) : (
                     <ChartContainer
                        id="finances-chart"
                        config={chartConfig}
                        className="mx-auto aspect-square h-[350px]"
                    >
                        <PieChart>
                            <ChartTooltip cursor={true} content={<ChartTooltipContent hideLabel />} />
                            <Pie
                                data={activeChartSlices}
                                dataKey="value"
                                nameKey="name"
                                innerRadius="30%"
                                outerRadius="80%"
                                activeIndex={activeIndex}
                                activeShape={({ cx, cy, innerRadius, outerRadius, startAngle, endAngle, fill, payload, percent, value }) => {
                                    return (
                                        <g>
                                            <text x={cx} y={cy} dy={-10} textAnchor="middle" fill={fill} className="text-lg font-bold">
                                                {payload.name}
                                            </text>
                                            <text x={cx} y={cy} dy={10} textAnchor="middle" fill="hsl(var(--foreground))">
                                                {`S/ ${value.toFixed(2)} (${(percent * 100).toFixed(1)}%)`}
                                            </text>
                                            <Sector
                                                cx={cx}
                                                cy={cy}
                                                innerRadius={innerRadius}
                                                outerRadius={outerRadius + 5} 
                                                startAngle={startAngle}
                                                endAngle={endAngle}
                                                fill={fill}
                                            />
                                        </g>
                                    );
                                }}
                                onMouseEnter={onPieEnter}
                                onMouseLeave={onPieLeave}
                            >
                                {activeChartSlices.map((entry) => (
                                    <Cell key={entry.name} fill={entry.fill} className="outline-none" />
                                ))}
                            </Pie>
                            <Legend
                                content={({ payload }) => (
                                    <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 mt-4 text-xs">
                                        {payload?.map((entry, index) => {
                                            const isHidden = hiddenSlices.includes(entry.value);
                                            return (
                                                <div
                                                    key={`item-${index}`}
                                                    className={`flex items-center cursor-pointer ${isHidden ? 'opacity-50' : ''}`}
                                                    onClick={() => toggleSliceVisibility(entry.value)}
                                                >
                                                    <div className="w-2 h-2 rounded-full mr-1.5" style={{ backgroundColor: entry.color }}></div>
                                                    <span>{entry.value}</span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            />
                        </PieChart>
                    </ChartContainer>
                )}
              </TabsContent>
            </Tabs>
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

// --- Preset Editor Component ---
interface PresetEditorProps {
  preset: GroupingPreset;
  ungroupedMethods: string[];
  onDeletePreset: (id: string) => void;
  onCreateGroup: (presetId: string, name: string) => void;
  onDeleteGroup: (presetId: string, groupId: string) => void;
  onDropOnGroup: (presetId: string, groupId: string) => void;
  onRemoveFromGroup: (presetId: string, groupId: string, method: string) => void;
  draggedMethod: { method: string; fromGroupId?: string } | null;
  setDraggedMethod: (method: { method: string; fromGroupId?: string } | null) => void;
}

const PresetEditor: React.FC<PresetEditorProps> = ({
  preset,
  ungroupedMethods,
  onDeletePreset,
  onCreateGroup,
  onDeleteGroup,
  onDropOnGroup,
  onRemoveFromGroup,
  draggedMethod,
  setDraggedMethod,
}) => {
  const [newGroupName, setNewGroupName] = useState("");

  const handleCreateGroup = () => {
    if (newGroupName.trim()) {
      onCreateGroup(preset.id, newGroupName.trim());
      setNewGroupName("");
    }
  };

  return (
    <Card className="bg-card">
      <CardHeader className="flex-row items-center justify-between p-2">
        <CardTitle className="text-base flex items-center gap-2"><Folder className="h-4 w-4"/>{preset.name}</CardTitle>
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => onDeletePreset(preset.id)}><Trash2 size={14} /></Button>
      </CardHeader>
      <CardContent className="p-2 space-y-3">
        <div className="flex gap-2">
          <Input placeholder="Nombre del nuevo grupo" value={newGroupName} onChange={(e) => setNewGroupName(e.target.value)} className="h-8"/>
          <Button onClick={handleCreateGroup} size="sm">Crear Grupo</Button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          <div className="p-2 border rounded-md min-h-[50px] bg-muted/20">
            <h5 className="text-xs font-bold mb-2">Métodos sin Agrupar</h5>
            <div className="space-y-1">
              {ungroupedMethods.map(method => (
                <div key={method} draggable onDragStart={() => setDraggedMethod({method})} className="text-sm p-1 border rounded bg-background cursor-grab">
                  {method}
                </div>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            {preset.groups.map(group => (
              <div 
                key={group.id}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => onDropOnGroup(preset.id, group.id)}
                className="p-2 border rounded-md bg-muted/50"
              >
                <div className="flex justify-between items-center mb-1">
                  <h6 className="text-sm font-semibold flex items-center gap-1"><Group size={14}/> {group.name}</h6>
                  <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => onDeleteGroup(preset.id, group.id)}><Trash2 size={12} /></Button>
                </div>
                <div className="space-y-1 min-h-[20px] border-t pt-1">
                  {group.methods.map(method => (
                    <div key={method} className="flex items-center justify-between text-sm p-1 bg-card rounded border">
                      <span>{method}</span>
                      <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => onRemoveFromGroup(preset.id, group.id, method)}><X size={12} /></Button>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
