
"use client";

import React, { useEffect, useState, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/contexts/auth-provider';
import { useAppState } from '@/contexts/app-state-provider';
import { USER_ROLES, LOCATIONS, PAYMENT_METHODS } from '@/lib/constants';
import type { LocationId, PaymentMethod } from '@/lib/constants';
import { Landmark, AlertTriangle, Loader2, DollarSign } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { getAppointments } from '@/lib/data';
import type { Appointment } from '@/types';
import { startOfMonth, endOfMonth, getYear, getMonth, setYear, setMonth, format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from '@/components/ui/table';


type PaymentMethodsConfig = Record<LocationId, PaymentMethod[]>;

interface MonthlyReportItem {
  locationId: LocationId;
  locationName: string;
  totalRevenue: number;
  breakdown: Partial<Record<PaymentMethod, number>>;
}

const currentSystemYear = getYear(new Date());
const availableYears = [currentSystemYear, currentSystemYear - 1, currentSystemYear - 2];
const months = Array.from({ length: 12 }, (_, i) => ({
  value: i,
  label: format(new Date(currentSystemYear, i), 'MMMM', { locale: es }),
}));


export default function FinancesPage() {
  const { user, isLoading } = useAuth();
  const router = useRouter();
  const { toast } = useToast();
  const { selectedLocationId: adminSelectedLocation } = useAppState();

  // --- State for Payment Methods Management ---
  const [paymentMethodsConfig, setPaymentMethodsConfig] = useState<PaymentMethodsConfig>(() => {
    const initialConfig = {} as PaymentMethodsConfig;
    LOCATIONS.forEach(loc => {
      initialConfig[loc.id] = [...(loc.paymentMethods || [])];
    });
    return initialConfig;
  });
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  // --- State for Monthly Report ---
  const [reportData, setReportData] = useState<MonthlyReportItem[]>([]);
  const [isLoadingReport, setIsLoadingReport] = useState(true);
  const [selectedYear, setSelectedYear] = useState<number>(getYear(new Date()));
  const [selectedMonth, setSelectedMonth] = useState<number>(getMonth(new Date()));

  const isAdminOrContador = user?.role === USER_ROLES.ADMIN || user?.role === USER_ROLES.CONTADOR;

  useEffect(() => {
    if (!isLoading && !isAdminOrContador) {
      router.replace('/dashboard');
    }
  }, [user, isLoading, router, isAdminOrContador]);


  useEffect(() => {
    const fetchReportData = async () => {
      if (!isAdminOrContador) return;

      setIsLoadingReport(true);
      const dateForReport = setMonth(setYear(new Date(), selectedYear), selectedMonth);
      const startDate = startOfMonth(dateForReport);
      const endDate = endOfMonth(dateForReport);

      try {
        let appointments: Appointment[] = [];
        if (adminSelectedLocation === 'all') {
            const allLocationsPromises = LOCATIONS.map(loc => getAppointments({
                locationId: loc.id,
                statuses: ['completed'],
                dateRange: { start: startDate, end: endDate }
            }));
            const results = await Promise.all(allLocationsPromises);
            appointments = results.flatMap(res => res.appointments || []);
        } else if(adminSelectedLocation) {
            const result = await getAppointments({
                locationId: adminSelectedLocation,
                statuses: ['completed'],
                dateRange: { start: startDate, end: endDate }
            });
            appointments = result.appointments || [];
        }

        const newReportData: Record<LocationId, MonthlyReportItem> = {};

        LOCATIONS.forEach(loc => {
           if(adminSelectedLocation === 'all' || adminSelectedLocation === loc.id) {
               newReportData[loc.id] = {
                   locationId: loc.id,
                   locationName: loc.name,
                   totalRevenue: 0,
                   breakdown: {}
               };
           }
        });
        
        appointments.forEach(appt => {
            if (appt.locationId && newReportData[appt.locationId] && appt.amountPaid && appt.paymentMethod) {
                const reportItem = newReportData[appt.locationId];
                reportItem.totalRevenue += appt.amountPaid;
                reportItem.breakdown[appt.paymentMethod] = (reportItem.breakdown[appt.paymentMethod] || 0) + appt.amountPaid;
            }
        });

        setReportData(Object.values(newReportData).filter(item => item.totalRevenue > 0 || (adminSelectedLocation !== 'all' && adminSelectedLocation === item.locationId)));

      } catch (error) {
        console.error("Error fetching report data:", error);
        toast({ title: "Error al generar reporte", description: "No se pudieron cargar los datos de ingresos.", variant: "destructive" });
        setReportData([]);
      } finally {
        setIsLoadingReport(false);
      }
    };

    if (isAdminOrContador) {
        fetchReportData();
    }
  }, [selectedYear, selectedMonth, adminSelectedLocation, isAdminOrContador, toast]);


  const handlePaymentMethodToggle = (locationId: LocationId, method: PaymentMethod, checked: boolean) => {
    setPaymentMethodsConfig(prevConfig => {
      const currentMethods = prevConfig[locationId] || [];
      const newMethods = checked
        ? [...currentMethods, method]
        : currentMethods.filter(m => m !== method);
      return { ...prevConfig, [locationId]: newMethods };
    });
    setHasChanges(true);
  };
  
  const handleSaveChanges = async () => {
    setIsSaving(true);
    console.log("Guardando la siguiente configuración de métodos de pago:", paymentMethodsConfig);
    await new Promise(resolve => setTimeout(resolve, 1000));
    toast({
      title: "Configuración Guardada",
      description: "Los métodos de pago han sido actualizados. (Simulación)",
    });
    setIsSaving(false);
    setHasChanges(false);
  };
  
  const grandTotal = useMemo(() => {
    return reportData.reduce((sum, item) => sum + item.totalRevenue, 0);
  }, [reportData]);

  if (isLoading || !isAdminOrContador) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="ml-2">Cargando o redirigiendo...</p>
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
            Reportes financieros, análisis de ingresos y gestión contable.
          </CardDescription>
        </CardHeader>
      </Card>

      <Card className="shadow-lg">
        <CardHeader>
            <CardTitle>Reporte de Ingresos Mensuales</CardTitle>
            <CardDescription>
                Resumen de ingresos por sede y método de pago para el periodo seleccionado.
            </CardDescription>
            <div className="flex flex-col sm:flex-row gap-2 mt-4">
                <Select value={String(selectedYear)} onValueChange={(val) => setSelectedYear(Number(val))}>
                    <SelectTrigger className="w-full sm:w-[120px]"><SelectValue /></SelectTrigger>
                    <SelectContent>{availableYears.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
                </Select>
                <Select value={String(selectedMonth)} onValueChange={(val) => setSelectedMonth(Number(val))}>
                    <SelectTrigger className="w-full sm:w-[180px]"><SelectValue /></SelectTrigger>
                    <SelectContent>{months.map(m => <SelectItem key={m.value} value={String(m.value)}>{m.label}</SelectItem>)}</SelectContent>
                </Select>
            </div>
        </CardHeader>
        <CardContent>
            {isLoadingReport ? (
                 <div className="flex flex-col items-center justify-center h-48">
                    <Loader2 className="h-12 w-12 animate-spin text-primary" />
                    <p className="mt-4 text-muted-foreground">Calculando reporte...</p>
                  </div>
            ) : reportData.length === 0 ? (
                 <div className="p-6 border rounded-lg bg-secondary/30 text-center">
                    <DollarSign className="h-10 w-10 text-muted-foreground mx-auto mb-2" />
                    <p className="text-muted-foreground">No se encontraron ingresos para el periodo y sede seleccionada.</p>
                </div>
            ) : (
                <div className="border rounded-lg overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Sede</TableHead>
                      {PAYMENT_METHODS.map(method => (
                        <TableHead key={method} className="text-right">{method}</TableHead>
                      ))}
                      <TableHead className="text-right font-semibold">Total Sede</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {reportData.map(item => (
                        <TableRow key={item.locationId}>
                            <TableCell className="font-medium">{item.locationName}</TableCell>
                            {PAYMENT_METHODS.map(method => (
                                <TableCell key={`${item.locationId}-${method}`} className="text-right">
                                    S/ {(item.breakdown[method] || 0).toFixed(2)}
                                </TableCell>
                            ))}
                            <TableCell className="text-right font-medium">S/ {item.totalRevenue.toFixed(2)}</TableCell>
                        </TableRow>
                    ))}
                  </TableBody>
                   {reportData.length > 1 && (
                        <TableFooter>
                            <TableRow className="bg-primary/10">
                                <TableHead>Total General</TableHead>
                                <TableHead colSpan={PAYMENT_METHODS.length}></TableHead>
                                <TableHead className="text-right text-lg">S/ {grandTotal.toFixed(2)}</TableHead>
                            </TableRow>
                        </TableFooter>
                    )}
                </Table>
                </div>
            )}
        </CardContent>
      </Card>

      <Card className="shadow-lg">
        <CardHeader>
            <CardTitle>Gestión de Métodos de Pago por Sede</CardTitle>
            <CardDescription>
                Habilite o deshabilite los métodos de pago disponibles para cada una de sus sedes.
            </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
            {LOCATIONS.map(location => (
                <div key={location.id} className="p-4 border rounded-lg">
                    <h4 className="font-semibold mb-4 text-lg">{location.name}</h4>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                        {PAYMENT_METHODS.map(method => (
                            <div key={method} className="flex items-center space-x-2">
                                <Switch
                                    id={`${location.id}-${method}`}
                                    checked={(paymentMethodsConfig[location.id] || []).includes(method)}
                                    onCheckedChange={(checked) => handlePaymentMethodToggle(location.id, method, checked)}
                                />
                                <Label htmlFor={`${location.id}-${method}`} className="text-sm">
                                    {method}
                                </Label>
                            </div>
                        ))}
                    </div>
                </div>
            ))}
             <div className="flex justify-end mt-6">
                <Button onClick={handleSaveChanges} disabled={!hasChanges || isSaving}>
                    {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Guardar Cambios
                </Button>
            </div>
            <Alert variant="default" className="mt-4 bg-blue-50 border-blue-200 text-blue-800">
                <AlertTriangle className="h-4 w-4 !text-blue-800" />
                <CardTitle className="text-blue-900 text-sm">Nota sobre la Persistencia</CardTitle>
                <AlertDescription className="text-xs">
                    Actualmente, esta configuración es una simulación visual. Los cambios no se guardarán permanentemente al recargar la página. Para una solución persistente, se requeriría una actualización de la base de datos.
                </AlertDescription>
            </Alert>
        </CardContent>
      </Card>
    </div>
  );
}
