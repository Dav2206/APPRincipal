
"use client";

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import type { Appointment, LocationId, PaymentMethod, Location } from '@/types';
import { useAuth } from '@/contexts/auth-provider';
import { useAppState } from '@/contexts/app-state-provider';
import { getAppointments, getLocations, updateLocationPaymentMethods } from '@/lib/data';
import { USER_ROLES, APPOINTMENT_STATUS } from '@/lib/constants';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { format, startOfMonth, endOfMonth, getYear, getMonth, setYear, setMonth } from 'date-fns';
import { es } from 'date-fns/locale';
import { Landmark, Loader2, AlertTriangle, ListPlus, Trash2, Filter, PlusCircle } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { useRouter } from 'next/navigation';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';

type ReportRow = {
  locationId: LocationId;
  locationName: string;
  totalsByMethod: Partial<Record<PaymentMethod, number>>;
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
  const newMethodInputsRef = useRef<Record<LocationId, HTMLInputElement | null>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [completedAppointments, setCompletedAppointments] = useState<Appointment[]>([]);
  const [locationFilter, setLocationFilter] = useState<LocationId | 'all'>(ALL_LOCATIONS_FILTER);


  useEffect(() => {
    async function loadLocations() {
        const fetchedLocations = await getLocations();
        setLocations(fetchedLocations);
        const initialPaymentMethods: Record<LocationId, PaymentMethod[]> = {} as Record<LocationId, PaymentMethod[]>
        fetchedLocations.forEach(loc => {
            initialPaymentMethods[loc.id] = loc.paymentMethods || [];
        });
        setPaymentMethodsByLocation(initialPaymentMethods);
    }
    loadLocations();
  }, []);

  const allAvailablePaymentTypes = useMemo(() => {
    const allTypes = new Set<string>();
    
    // Consider payment methods from the current state, which includes newly added (but unsaved) ones.
    Object.values(paymentMethodsByLocation).flat().forEach(method => {
        const baseType = method.split(' - ')[0].trim();
        allTypes.add(baseType);
    });

    // Also consider payment methods from historical completed appointments
    completedAppointments.forEach(appt => {
      const locationMatches = !adminSelectedLocation || adminSelectedLocation === 'all' || appt.locationId === adminSelectedLocation;
      if (locationMatches && appt.paymentMethod) {
          const baseType = appt.paymentMethod.split(' - ')[0].trim();
          allTypes.add(baseType);
      }
    });
    
    return Array.from(allTypes).sort((a,b) => a.localeCompare(b));
  }, [paymentMethodsByLocation, completedAppointments, adminSelectedLocation]);


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
          if (!appt.paymentMethod || !appt.amountPaid || appt.amountPaid <= 0) return;

          const locationName = locations.find(l => l.id === appt.locationId)?.name || 'Desconocida';
          let entry = reportMap.get(appt.locationId) || {
            locationId: appt.locationId,
            locationName: locationName,
            totalsByMethod: {},
            locationTotal: 0
          };
          
          const basePaymentType = appt.paymentMethod.split(' - ')[0].trim();

          entry.totalsByMethod[basePaymentType] = (entry.totalsByMethod[basePaymentType] || 0) + appt.amountPaid;
          entry.locationTotal += appt.amountPaid;

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
  
  const grandTotal = useMemo(() => {
    return reportData.reduce((sum, row) => sum + row.locationTotal, 0);
  }, [reportData]);
  
  const totalsByAllMethods = useMemo(() => {
    const totals: Partial<Record<string, number>> = {};
    allAvailablePaymentTypes.forEach(type => {
        totals[type] = reportData.reduce((sum, row) => sum + (row.totalsByMethod[type] || 0), 0);
    });
    return totals;
  }, [reportData, allAvailablePaymentTypes]);


  const handleAddNewMethod = (locationId: LocationId) => {
    const inputElement = newMethodInputsRef.current[locationId];
    if (!inputElement) return;

    const newMethodName = inputElement.value.trim();
    if (!newMethodName) {
      toast({ title: "Nombre inválido", description: "El nombre del método de pago no puede estar vacío.", variant: "destructive" });
      return;
    }

    const currentMethods = paymentMethodsByLocation[locationId] || [];
    if (currentMethods.some(m => m.toLowerCase() === newMethodName.toLowerCase())) {
        toast({ title: "Método Duplicado", description: `"${newMethodName}" ya existe para esta sede.`, variant: "default" });
        return;
    }

    setPaymentMethodsByLocation(prev => {
        const updatedMethods = [...(prev[locationId] || []), newMethodName as PaymentMethod];
        return {
            ...prev,
            [locationId]: updatedMethods
        };
    });
    setHasChanges(true);
    toast({ title: "Método Añadido", description: `"${newMethodName}" se añadió. Recuerde guardar los cambios.` });
    inputElement.value = '';
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
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Sede</TableHead>
                  {allAvailablePaymentTypes.map(method => <TableHead key={method} className="text-right">{method}</TableHead>)}
                  <TableHead className="text-right font-bold">Total Sede</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {reportData.map(row => (
                  <TableRow key={row.locationId}>
                    <TableCell className="font-medium">{row.locationName}</TableCell>
                    {allAvailablePaymentTypes.map(type => (
                      <TableCell key={type} className="text-right">
                        {(row.totalsByMethod[type] || 0).toFixed(2)}
                      </TableCell>
                    ))}
                    <TableCell className="text-right font-bold">
                      {row.locationTotal.toFixed(2)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
              <TableFooter>
                <TableRow className="bg-muted/80 font-bold">
                  <TableCell>Total General</TableCell>
                  {allAvailablePaymentTypes.map(type => (
                    <TableCell key={type} className="text-right">
                      {(totalsByAllMethods[type] || 0).toFixed(2)}
                    </TableCell>
                  ))}
                  <TableCell className="text-right text-lg">
                    S/ {grandTotal.toFixed(2)}
                  </TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card className="shadow-lg">
        <CardHeader>
            <CardTitle>Gestión de Métodos de Pago por Sede</CardTitle>
            <CardDescription>
                Añada o elimine los métodos de pago para cada una de sus sedes.
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
                            ref={(el) => (newMethodInputsRef.current[location.id] = el)}
                        />
                         <p className="text-xs text-muted-foreground mt-1">
                            Use el formato "Tipo - Detalle" para agrupar (ej: Yape - Cuenta A).
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
                                <Label htmlFor={`${location.id}-${method}`} className="text-sm">
                                    {method}
                                </Label>
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

    