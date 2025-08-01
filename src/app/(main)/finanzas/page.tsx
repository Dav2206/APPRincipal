
"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/contexts/auth-provider';
import { USER_ROLES, LOCATIONS, PAYMENT_METHODS, APPOINTMENT_STATUS } from '@/lib/constants';
import { Landmark, AlertTriangle, Loader2, CalendarIcon, ChevronLeft, ChevronRight } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useMemo } from 'react';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import type { LocationId, PaymentMethod } from '@/lib/constants';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { getAppointments } from '@/lib/data';
import type { Appointment } from '@/types';
import { startOfMonth, endOfMonth, subMonths, addMonths, getYear, getMonth, format, setMonth, setYear } from 'date-fns';
import { es } from 'date-fns/locale';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAppState } from '@/contexts/app-state-provider';

type PaymentMethodsConfig = Record<LocationId, PaymentMethod[]>;

interface MonthlyReportData {
  locationId: LocationId;
  locationName: string;
  total: number;
  breakdown: Record<PaymentMethod, number>;
}

const currentSystemYear = getYear(new Date());
const availableYearsForAdmin = Array.from({ length: 5 }, (_, i) => currentSystemYear - i);
const months = Array.from({ length: 12 }, (_, i) => ({
  value: i,
  label: format(new Date(currentSystemYear, i), 'MMMM', { locale: es }),
}));


export default function FinancesPage() {
  const { user, isLoading } = useAuth();
  const { selectedLocationId } = useAppState();
  const router = useRouter();
  const { toast } = useToast();

  const [paymentMethodsConfig, setPaymentMethodsConfig] = useState<PaymentMethodsConfig>(() => {
    const initialConfig = {} as PaymentMethodsConfig;
    LOCATIONS.forEach(loc => {
      initialConfig[loc.id] = [...(loc.paymentMethods || [])];
    });
    return initialConfig;
  });
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  const [reportDate, setReportDate] = useState(new Date());
  const [monthlyReportData, setMonthlyReportData] = useState<MonthlyReportData[]>([]);
  const [isReportLoading, setIsReportLoading] = useState(true);

  const isAdminOrContador = user?.role === USER_ROLES.ADMIN || user?.role === USER_ROLES.CONTADOR;

  const effectiveLocationIdForFilter = isAdminOrContador
    ? (selectedLocationId === 'all' ? undefined : selectedLocationId as LocationId)
    : user?.locationId;


  useEffect(() => {
    if (!isLoading && (!user || (user.role !== USER_ROLES.CONTADOR && user.role !== USER_ROLES.ADMIN))) {
      router.replace('/dashboard'); 
    }
  }, [user, isLoading, router]);

  useEffect(() => {
    const fetchMonthlyReport = async () => {
      if (!user || !isAdminOrContador) { 
        setIsReportLoading(false);
        return; 
      }
      setIsReportLoading(true);

      const startDate = startOfMonth(reportDate);
      const endDate = endOfMonth(reportDate);
      
      try {
        let completedAppointments: Appointment[] = [];
        const locationsToFetch = effectiveLocationIdForFilter ? [LOCATIONS.find(l=> l.id === effectiveLocationIdForFilter)] : LOCATIONS;

        const appointmentPromises = (locationsToFetch.filter(l => l) as typeof LOCATIONS).map(loc =>
          getAppointments({
            locationId: loc.id,
            statuses: [APPOINTMENT_STATUS.COMPLETED],
            dateRange: { start: startDate, end: endDate },
          })
        );
        const results = await Promise.all(appointmentPromises);
        completedAppointments = results.map(r => r.appointments || []).flat();

        const reportByLocation: Record<LocationId, MonthlyReportData> = {} as any;

        (locationsToFetch.filter(l => l) as typeof LOCATIONS).forEach(loc => {
            reportByLocation[loc.id] = {
                locationId: loc.id,
                locationName: loc.name,
                total: 0,
                breakdown: Object.fromEntries(PAYMENT_METHODS.map(pm => [pm, 0])) as Record<PaymentMethod, number>,
            }
        });


        completedAppointments.forEach(appt => {
          if (appt.paymentMethod && reportByLocation[appt.locationId]) {
            const amount = appt.amountPaid || 0;
            reportByLocation[appt.locationId].breakdown[appt.paymentMethod] += amount;
            reportByLocation[appt.locationId].total += amount;
          }
        });

        setMonthlyReportData(Object.values(reportByLocation).filter(r => r.total > 0).sort((a,b) => a.locationName.localeCompare(b.locationName)));

      } catch (error) {
        console.error("Failed to fetch monthly report data:", error);
        toast({ title: "Error", description: "No se pudo cargar el reporte de ingresos.", variant: "destructive" });
        setMonthlyReportData([]);
      } finally {
        setIsReportLoading(false);
      }
    };
    
    fetchMonthlyReport();
  }, [reportDate, effectiveLocationIdForFilter, user, isAdminOrContador, toast]);


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
    // En una aplicación real, aquí llamarías a una función para guardar `paymentMethodsConfig` en la base de datos.
    console.log("Guardando la siguiente configuración de métodos de pago:", paymentMethodsConfig);
    await new Promise(resolve => setTimeout(resolve, 1000));
    toast({
      title: "Configuración Guardada",
      description: "Los métodos de pago han sido actualizados. (Simulación: los cambios no persistirán al recargar)",
    });
    setIsSaving(false);
    setHasChanges(false);
  };

  const grandTotal = useMemo(() => {
    return monthlyReportData.reduce((sum, loc) => sum + loc.total, 0);
  }, [monthlyReportData]);


  if (isLoading || !user || (user.role !== USER_ROLES.CONTADOR && user.role !== USER_ROLES.ADMIN)) {
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
        <CardContent>
           <p className="text-muted-foreground">
            Viendo reportes para: {effectiveLocationIdForFilter ? LOCATIONS.find(l => l.id === effectiveLocationIdForFilter)?.name : 'Todas las sedes'}
          </p>
        </CardContent>
      </Card>
      
      <Card>
        <CardHeader>
          <CardTitle>Reporte de Ingresos Mensuales</CardTitle>
          <div className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center">
            <CardDescription>Ingresos por método de pago para el periodo seleccionado.</CardDescription>
            <div className="flex items-center gap-2">
                <Button variant="outline" size="icon" onClick={() => setReportDate(prev => subMonths(prev, 1))}>
                    <ChevronLeft className="h-4 w-4" />
                </Button>
                <Select value={String(getMonth(reportDate))} onValueChange={(val) => setReportDate(prev => setMonth(prev, Number(val)))}>
                    <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
                    <SelectContent>{months.map(m => <SelectItem key={m.value} value={String(m.value)}>{m.label}</SelectItem>)}</SelectContent>
                </Select>
                 <Select value={String(getYear(reportDate))} onValueChange={(val) => setReportDate(prev => setYear(prev, Number(val)))}>
                    <SelectTrigger className="w-[100px]"><SelectValue /></SelectTrigger>
                    <SelectContent>{availableYearsForAdmin.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
                </Select>
                <Button variant="outline" size="icon" onClick={() => setReportDate(prev => addMonths(prev, 1))} disabled={isAfter(addMonths(reportDate, 1), new Date())}>
                    <ChevronRight className="h-4 w-4" />
                </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
           {isReportLoading ? (
             <div className="flex h-48 items-center justify-center">
                <Loader2 className="h-10 w-10 animate-spin text-primary" />
             </div>
           ) : monthlyReportData.length === 0 ? (
                <Alert variant="default" className="bg-blue-50 border-blue-200 text-blue-800">
                    <AlertTriangle className="h-4 w-4 !text-blue-800" />
                    <CardTitle className="text-blue-900 text-sm">Sin Datos</CardTitle>
                    <AlertDescription className="text-xs">
                        No se encontraron ingresos registrados para el periodo y las sedes seleccionadas.
                    </AlertDescription>
                </Alert>
           ) : (
             <div className="border rounded-lg overflow-hidden">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead className="font-semibold">Sede</TableHead>
                            <TableHead className="font-semibold">Método de Pago</TableHead>
                            <TableHead className="text-right font-semibold">Ingresos (S/)</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {monthlyReportData.map((locData) => (
                           <React.Fragment key={locData.locationId}>
                            {Object.entries(locData.breakdown).map(([method, amount]) => (
                                amount > 0 && (
                                <TableRow key={`${locData.locationId}-${method}`}>
                                    <TableCell className="font-medium">{locData.locationName}</TableCell>
                                    <TableCell className="text-muted-foreground">{method}</TableCell>
                                    <TableCell className="text-right">{amount.toFixed(2)}</TableCell>
                                </TableRow>
                                )
                            ))}
                            <TableRow className="bg-muted/50 font-bold">
                                <TableCell colSpan={2}>Total {locData.locationName}</TableCell>
                                <TableCell className="text-right">{locData.total.toFixed(2)}</TableCell>
                            </TableRow>
                           </React.Fragment>
                        ))}
                    </TableBody>
                    <TableFooter>
                        <TableRow className="text-lg font-bold bg-primary/10 hover:bg-primary/20">
                            <TableCell colSpan={2}>Total General</TableCell>
                            <TableCell className="text-right">S/ {grandTotal.toFixed(2)}</TableCell>
                        </TableRow>
                    </TableFooter>
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
