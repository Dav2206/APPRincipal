
"use client";

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import type { Appointment, LocationId, PaymentMethod } from '@/types';
import { useAuth } from '@/contexts/auth-provider';
import { useAppState } from '@/contexts/app-state-provider';
import { getAppointments } from '@/lib/data';
import { LOCATIONS, USER_ROLES, APPOINTMENT_STATUS } from '@/lib/constants';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { format, startOfMonth, endOfMonth, getYear, getMonth, setYear, setMonth } from 'date-fns';
import { es } from 'date-fns/locale';
import { Landmark, Loader2, AlertTriangle, ListPlus, Trash2, Filter, PlusCircle } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useRouter } from 'next/navigation';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
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

  const [reportData, setReportData] = useState<ReportRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  const [selectedYear, setSelectedYear] = useState<number>(getYear(new Date()));
  const [selectedMonth, setSelectedMonth] = useState<number>(getMonth(new Date()));
  
  // State for payment methods per location
  const [paymentMethodsByLocation, setPaymentMethodsByLocation] = useState<Record<LocationId, PaymentMethod[]>>(() => {
    const initialConfig = {} as Record<LocationId, PaymentMethod[]>;
    LOCATIONS.forEach(loc => {
      initialConfig[loc.id] = [...(loc.paymentMethods || ['Efectivo', 'Tarjeta de Débito', 'Yape/Plin'])];
    });
    return initialConfig;
  });
  const [newMethodInputs, setNewMethodInputs] = useState<Record<LocationId, string>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [completedAppointments, setCompletedAppointments] = useState<Appointment[]>([]);
  const [locationFilter, setLocationFilter] = useState<LocationId | 'all'>(ALL_LOCATIONS_FILTER);


  // Collect all unique payment methods for table headers
  const allAvailablePaymentMethods = useMemo(() => {
    const allMethods = new Set<PaymentMethod>();
    Object.values(paymentMethodsByLocation).forEach(methods => {
      methods.forEach(method => allMethods.add(method));
    });
    return Array.from(allMethods).sort((a,b) => a.localeCompare(b));
  }, [paymentMethodsByLocation]);


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
        } else { // Admin/Contador viewing 'all'
            const allLocationPromises = LOCATIONS.map(loc => getAppointments({
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

          const locationName = LOCATIONS.find(l => l.id === appt.locationId)?.name || 'Desconocida';
          let entry = reportMap.get(appt.locationId) || {
            locationId: appt.locationId,
            locationName: locationName,
            totalsByMethod: {},
            locationTotal: 0
          };

          entry.totalsByMethod[appt.paymentMethod] = (entry.totalsByMethod[appt.paymentMethod] || 0) + appt.amountPaid;
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

    if (user && (user.role === USER_ROLES.ADMIN || user.role === USER_ROLES.CONTADOR)) {
      generateReport();
    }
  }, [user, selectedYear, selectedMonth, adminSelectedLocation, toast]);
  
  const grandTotal = useMemo(() => {
    return reportData.reduce((sum, row) => sum + row.locationTotal, 0);
  }, [reportData]);
  
  const totalsByAllMethods = useMemo(() => {
    const totals: Partial<Record<PaymentMethod, number>> = {};
    reportData.forEach(row => {
      for (const method in row.totalsByMethod) {
        totals[method as PaymentMethod] = (totals[method as PaymentMethod] || 0) + (row.totalsByMethod[method as PaymentMethod] || 0);
      }
    });
    return totals;
  }, [reportData]);


  const handleAddNewMethod = (locationId: LocationId) => {
    const newMethodName = (newMethodInputs[locationId] || '').trim();
    if (!newMethodName) {
      toast({ title: "Nombre inválido", description: "El nombre del método de pago no puede estar vacío.", variant: "destructive" });
      return;
    }
    const currentMethods = paymentMethodsByLocation[locationId] || [];
    if (currentMethods.some(m => m.toLowerCase() === newMethodName.toLowerCase())) {
      toast({ title: "Método Duplicado", description: `"${newMethodName}" ya existe para esta sede.`, variant: "default" });
      return;
    }
    setPaymentMethodsByLocation(prev => ({
      ...prev,
      [locationId]: [...currentMethods, newMethodName as PaymentMethod]
    }));
    setNewMethodInputs(prev => ({ ...prev, [locationId]: '' }));
    toast({ title: "Método Añadido", description: `"${newMethodName}" ha sido añadido a la sede.` });
  };
  
  const handleRemoveMethod = (locationId: LocationId, methodToRemove: PaymentMethod) => {
    const isMethodInUseInLocation = completedAppointments.some(
      appt => appt.locationId === locationId && appt.paymentMethod === methodToRemove
    );
    if (isMethodInUseInLocation) {
      toast({ title: "No se puede eliminar", description: `"${methodToRemove}" está en uso en citas completadas para esta sede y no puede ser eliminado.`, variant: "destructive" });
      return;
    }
    setPaymentMethodsByLocation(prev => ({
      ...prev,
      [locationId]: (prev[locationId] || []).filter(m => m !== methodToRemove)
    }));
    toast({ title: "Método Eliminado", description: `"${methodToRemove}" ha sido eliminado de la sede.` });
  };

  const handleSaveAllChanges = async () => {
    setIsSaving(true);
    console.log("Guardando la siguiente configuración de métodos de pago:", paymentMethodsByLocation);
    // En una app real, se guardaría `paymentMethodsByLocation` en la DB
    await new Promise(resolve => setTimeout(resolve, 1000));
    toast({
      title: "Configuración Guardada",
      description: "Los métodos de pago por sede han sido actualizados. (Simulación)",
    });
    setIsSaving(false);
  };
  
  const filteredLocationsForManagement = useMemo(() => {
    if (locationFilter === ALL_LOCATIONS_FILTER) {
      return LOCATIONS;
    }
    return LOCATIONS.filter(loc => loc.id === locationFilter);
  }, [locationFilter]);


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
              Viendo para: {adminSelectedLocation === 'all' ? 'Todas las sedes' : LOCATIONS.find(l => l.id === adminSelectedLocation)?.name || 'Sede no especificada'}
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
                  {allAvailablePaymentMethods.map(method => <TableHead key={method} className="text-right">{method}</TableHead>)}
                  <TableHead className="text-right font-bold">Total Sede</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {reportData.map(row => (
                  <TableRow key={row.locationId}>
                    <TableCell className="font-medium">{row.locationName}</TableCell>
                    {allAvailablePaymentMethods.map(method => (
                      <TableCell key={method} className="text-right">
                        {(row.totalsByMethod[method as PaymentMethod] || 0).toFixed(2)}
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
                  {allAvailablePaymentMethods.map(method => (
                    <TableCell key={method} className="text-right">
                      {(totalsByAllMethods[method as PaymentMethod] || 0).toFixed(2)}
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
                      {LOCATIONS.map(loc => (
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
                            placeholder="Ej: Tarjeta - Scotiabank"
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
                <Button onClick={handleSaveAllChanges} disabled={isSaving}>
                    {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Guardar Toda la Configuración
                </Button>
            </div>
            <Alert variant="default" className="mt-4 bg-blue-50 border-blue-200 text-blue-800">
                <AlertTriangle className="h-4 w-4 !text-blue-800" />
                <CardTitle className="text-blue-900 text-sm">Nota sobre la Persistencia</CardTitle>
                <AlertDescription className="text-xs">
                    Actualmente, esta configuración es una simulación visual. Los cambios no se guardarán permanentemente al recargar la página.
                </AlertDescription>
            </Alert>
        </CardContent>
      </Card>
    </div>
  );
}
