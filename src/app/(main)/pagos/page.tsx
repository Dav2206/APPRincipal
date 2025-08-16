
"use client";

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import type { Professional, Location, Appointment } from '@/types';
import { useAuth } from '@/contexts/auth-provider';
import { useRouter } from 'next/navigation';
import { USER_ROLES, APPOINTMENT_STATUS } from '@/lib/constants';
import { getProfessionals, getLocations, getAppointments, getContractDisplayStatus } from '@/lib/data';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter as TableFooterComponent } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, CreditCard, AlertTriangle, PlusCircle, DollarSign, CalendarIcon, List, Users, ShoppingCart, Lightbulb, Landmark as LandmarkIcon, ChevronLeft, ChevronRight } from 'lucide-react';
import { format, getYear, getMonth, getDate, startOfMonth, addDays, setYear, setMonth, isAfter, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";


// --- Mock Data Structures (to be replaced with real data fetching) ---
type ExpenseType = 'insumo' | 'servicio' | 'impuesto';
interface Expense {
  id: string;
  type: ExpenseType;
  date: Date;
  description: string;
  amount: number;
}

const getExpenseTypeLabel = (type: ExpenseType) => {
  switch (type) {
    case 'insumo': return 'Insumo';
    case 'servicio': return 'Servicio';
    case 'impuesto': return 'Impuesto';
    default: return 'Gasto';
  }
};

const SUELDO_BASE = 1025.00;
const DEDUCTIBLE_HIGUERETA = 2200;
const DEDUCTIBLE_OTRAS = 1800;
const COMISION_PORCENTAJE = 0.20;

const currentSystemYear = getYear(new Date());
const availableYears = [currentSystemYear, currentSystemYear - 1, currentSystemYear - 2];
const months = Array.from({ length: 12 }, (_, i) => ({
  value: i,
  label: format(new Date(currentSystemYear, i), 'MMMM', { locale: es }),
}));

interface PayrollData {
  professionalId: string;
  professionalName: string;
  locationId: string;
  locationName: string;
  totalIncome: number;
  baseSalary: number;
  commission: number;
  totalPayment: number;
}


export default function PaymentsPage() {
  const { user, isLoading } = useAuth();
  const router = useRouter();
  const { toast } = useToast();

  // --- State for Payroll ---
  const [payrollData, setPayrollData] = useState<PayrollData[]>([]);
  const [isLoadingPayroll, setIsLoadingPayroll] = useState(false);
  const [selectedYear, setSelectedYear] = useState<number>(getYear(new Date()));
  const [selectedMonth, setSelectedMonth] = useState<number>(getMonth(new Date()));
  const [selectedQuincena, setSelectedQuincena] = useState<1 | 2>(getDate(new Date()) <= 15 ? 1 : 2);
  const [locations, setLocations] = useState<Location[]>([]);


  // --- State for General Expenses ---
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [expenseType, setExpenseType] = useState<ExpenseType>('insumo');
  const [expenseDate, setExpenseDate] = useState<Date>(new Date());
  const [expenseDescription, setExpenseDescription] = useState('');
  const [expenseAmount, setExpenseAmount] = useState('');


  useEffect(() => {
    if (!isLoading && (!user || (user.role !== USER_ROLES.ADMIN && user.role !== USER_ROLES.CONTADOR))) {
      router.replace('/dashboard');
    }
  }, [user, isLoading, router]);
  
  useEffect(() => {
      async function loadLocations() {
          const fetchedLocations = await getLocations();
          setLocations(fetchedLocations);
      }
      loadLocations();
  }, []);

  const calculatePayroll = useCallback(async () => {
    if (locations.length === 0) return;
    setIsLoadingPayroll(true);

    const baseDate = setMonth(setYear(new Date(), selectedYear), selectedMonth);
    const startDate = selectedQuincena === 1 ? startOfMonth(baseDate) : addDays(startOfMonth(baseDate), 15);
    const endDate = selectedQuincena === 1 ? addDays(startOfMonth(baseDate), 14) : endOfMonth(baseDate);

    try {
        const allProfessionals = await getProfessionals();
        const activeProfessionals = allProfessionals.filter(p => {
          const contractStatus = getContractDisplayStatus(p.currentContract, endDate);
          return contractStatus === 'Activo' || contractStatus === 'Próximo a Vencer';
        });

        const appointmentsResponse = await getAppointments({ 
            dateRange: { start: startDate, end: endDate },
            statuses: [APPOINTMENT_STATUS.COMPLETED]
        });

        const appointments = appointmentsResponse.appointments || [];
        const incomeByProfessional: Record<string, number> = {};

        appointments.forEach(appt => {
            const processIncome = (profId: string | null | undefined, amount: number | null | undefined) => {
                if(profId && amount && amount > 0) {
                    incomeByProfessional[profId] = (incomeByProfessional[profId] || 0) + amount;
                }
            };
            processIncome(appt.professionalId, appt.amountPaid);
            appt.addedServices?.forEach(as => {
                processIncome(as.professionalId || appt.professionalId, as.amountPaid);
            });
        });

        const newPayrollData: PayrollData[] = activeProfessionals.map(prof => {
            const totalIncome = incomeByProfessional[prof.id] || 0;
            const deductible = prof.locationId === 'higuereta' ? DEDUCTIBLE_HIGUERETA : DEDUCTIBLE_OTRAS;
            const commissionableAmount = Math.max(0, totalIncome - deductible);
            const commission = commissionableAmount * COMISION_PORCENTAJE;
            const totalPayment = SUELDO_BASE + commission;

            return {
                professionalId: prof.id,
                professionalName: `${prof.firstName} ${prof.lastName}`,
                locationId: prof.locationId,
                locationName: locations.find(l => l.id === prof.locationId)?.name || 'N/A',
                totalIncome: totalIncome,
                baseSalary: SUELDO_BASE,
                commission: commission,
                totalPayment: totalPayment,
            };
        }).sort((a,b) => a.locationName.localeCompare(b.locationName) || a.professionalName.localeCompare(b.professionalName));

        setPayrollData(newPayrollData);
    } catch (error) {
        console.error("Error calculating payroll:", error);
        toast({ title: "Error", description: "No se pudo calcular la planilla.", variant: "destructive" });
    } finally {
        setIsLoadingPayroll(false);
    }
  }, [selectedYear, selectedMonth, selectedQuincena, locations, toast]);

  useEffect(() => {
    calculatePayroll();
  }, [calculatePayroll]);


  const handleAddExpense = () => {
    if (!expenseDescription || !expenseAmount || !expenseDate) {
      toast({ title: "Datos incompletos", description: "Por favor, complete todos los campos del gasto.", variant: "destructive" });
      return;
    }
    
    const newExpense: Expense = {
      id: `exp_${Date.now()}`,
      type: expenseType,
      date: expenseDate,
      description: expenseDescription,
      amount: parseFloat(expenseAmount),
    };

    setExpenses(prev => [...prev, newExpense].sort((a,b) => b.date.getTime() - a.date.getTime()));
    toast({ title: "Gasto Registrado (Simulación)", description: `Se ha añadido "${expenseDescription}" a la lista.` });

    setExpenseDescription('');
    setExpenseAmount('');
  };

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

  
  const totalExpenses = useMemo(() => expenses.reduce((sum, exp) => sum + exp.amount, 0), [expenses]);
  const totalInsumos = useMemo(() => expenses.filter(e => e.type === 'insumo').reduce((sum, exp) => sum + exp.amount, 0), [expenses]);
  const totalServicios = useMemo(() => expenses.filter(e => e.type === 'servicio').reduce((sum, exp) => sum + exp.amount, 0), [expenses]);
  const totalImpuestos = useMemo(() => expenses.filter(e => e.type === 'impuesto').reduce((sum, exp) => sum + exp.amount, 0), [expenses]);


  if (isLoading || !user || (user.role !== USER_ROLES.ADMIN && user.role !== USER_ROLES.CONTADOR)) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8 px-4 md:px-0 space-y-6">
      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle className="text-3xl flex items-center gap-2">
            <CreditCard className="text-primary" />
            Módulo de Pagos y Egresos
          </CardTitle>
          <CardDescription>
            Registro y gestión de egresos, planillas y pagos a proveedores.
          </CardDescription>
        </CardHeader>
      </Card>
      
      <Tabs defaultValue="salaries" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="salaries"><Users className="mr-2 h-4 w-4"/>Sueldos y Comisiones</TabsTrigger>
          <TabsTrigger value="expenses"><DollarSign className="mr-2 h-4 w-4"/>Gastos Operativos</TabsTrigger>
          <TabsTrigger value="report" disabled><List className="mr-2 h-4 w-4"/>Reporte Mensual</TabsTrigger>
        </TabsList>
        
        <TabsContent value="salaries">
            <Card>
              <CardHeader>
                <CardTitle>Pagos al Personal</CardTitle>
                <CardDescription>
                  Visualización de los pagos a profesionales, incluyendo sueldo base y comisiones por producción.
                </CardDescription>
                 <div className="mt-4 flex items-center gap-2 flex-wrap">
                    <Button variant="outline" size="icon" onClick={() => navigateQuincena('prev')} disabled={isPrevQuincenaDisabled()}><ChevronLeft className="h-4 w-4" /></Button>
                    <Select value={String(selectedYear)} onValueChange={(val) => {setSelectedYear(Number(val));}}><SelectTrigger className="w-[100px]"><SelectValue /></SelectTrigger><SelectContent>{availableYears.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent></Select>
                    <Select value={String(selectedMonth)} onValueChange={(val) => {setSelectedMonth(Number(val));}}><SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger><SelectContent>{months.map(m => <SelectItem key={m.value} value={String(m.value)}>{m.label}</SelectItem>)}</SelectContent></Select>
                    <Select value={String(selectedQuincena)} onValueChange={(val) => {setSelectedQuincena(Number(val) as 1 | 2);}}><SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="1">1ra Quincena</SelectItem><SelectItem value="2">2da Quincena</SelectItem></SelectContent></Select>
                    <Button variant="outline" size="icon" onClick={() => navigateQuincena('next')} disabled={isNextQuincenaDisabled()}><ChevronRight className="h-4 w-4" /></Button>
                </div>
              </CardHeader>
              <CardContent>
                {isLoadingPayroll ? (
                   <div className="flex justify-center items-center h-40"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
                ) : payrollData.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Profesional</TableHead>
                        <TableHead>Sede Base</TableHead>
                        <TableHead className="text-right">Producción (S/)</TableHead>
                        <TableHead className="text-right">Sueldo Base (S/)</TableHead>
                        <TableHead className="text-right">Comisión (S/)</TableHead>
                        <TableHead className="text-right font-bold">Total a Pagar (S/)</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {payrollData.map(item => (
                        <TableRow key={item.professionalId}>
                          <TableCell className="font-medium">{item.professionalName}</TableCell>
                          <TableCell>{item.locationName}</TableCell>
                          <TableCell className="text-right">{item.totalIncome.toFixed(2)}</TableCell>
                          <TableCell className="text-right">{item.baseSalary.toFixed(2)}</TableCell>
                          <TableCell className="text-right text-green-600 font-semibold">{item.commission.toFixed(2)}</TableCell>
                          <TableCell className="text-right font-bold text-lg">{item.totalPayment.toFixed(2)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <div className="p-8 border rounded-lg bg-secondary/30 text-center">
                    <AlertTriangle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                    <h3 className="text-xl font-semibold">No hay datos de planilla</h3>
                    <p className="text-muted-foreground mt-2">
                        No se encontró actividad o profesionales activos para el período seleccionado.
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
        </TabsContent>

        <TabsContent value="expenses">
            <Card>
              <CardHeader>
                <CardTitle>Registro de Gastos Operativos</CardTitle>
                <CardDescription>
                  Registre aquí los egresos por insumos, servicios (luz, agua, alquiler) e impuestos.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                  {/* --- Formulario para añadir gastos --- */}
                  <div className="p-4 border rounded-lg space-y-4">
                     <h4 className="font-semibold text-lg">Nuevo Gasto</h4>
                      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="expense-type">Tipo de Gasto</Label>
                          <Select value={expenseType} onValueChange={(v) => setExpenseType(v as ExpenseType)}>
                            <SelectTrigger id="expense-type"><SelectValue/></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="insumo"><ShoppingCart className="mr-2 h-4 w-4"/>Insumos</SelectItem>
                              <SelectItem value="servicio"><Lightbulb className="mr-2 h-4 w-4"/>Servicios</SelectItem>
                              <SelectItem value="impuesto"><LandmarkIcon className="mr-2 h-4 w-4"/>Impuestos</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="expense-date">Fecha</Label>
                          <Popover>
                            <PopoverTrigger asChild>
                              <Button variant="outline" id="expense-date" className={cn("w-full justify-start text-left font-normal", !expenseDate && "text-muted-foreground")}>
                                <CalendarIcon className="mr-2 h-4 w-4" />
                                {expenseDate ? format(expenseDate, "PPP", { locale: es }) : <span>Seleccionar fecha</span>}
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0"><Calendar mode="single" selected={expenseDate} onSelect={(d) => setExpenseDate(d || new Date())} /></PopoverContent>
                          </Popover>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="expense-amount">Monto (S/)</Label>
                            <Input id="expense-amount" type="number" placeholder="Ej: 150.00" value={expenseAmount} onChange={(e) => setExpenseAmount(e.target.value)} />
                        </div>
                         <div className="space-y-2 col-span-full md:col-span-1">
                          <Label htmlFor="expense-description">Descripción</Label>
                          <Input id="expense-description" placeholder="Ej: Compra de algodones" value={expenseDescription} onChange={(e) => setExpenseDescription(e.target.value)} />
                        </div>
                      </div>
                      <div className="flex justify-end">
                        <Button onClick={handleAddExpense}><PlusCircle className="mr-2 h-4 w-4"/>Añadir Gasto</Button>
                      </div>
                      <Alert variant="default" className="mt-4 bg-blue-50 border-blue-200 text-blue-800">
                          <AlertTriangle className="h-4 w-4 !text-blue-800" />
                          <AlertDescription className="text-xs">
                              Nota: El registro de gastos es una simulación visual. Los datos se reiniciarán al recargar la página.
                          </AlertDescription>
                      </Alert>
                  </div>

                  {/* --- Tabla de Gastos Registrados --- */}
                  <div className="p-4 border rounded-lg">
                     <h4 className="font-semibold text-lg mb-2">Historial de Gastos del Mes</h4>
                     {expenses.length > 0 ? (
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Fecha</TableHead>
                              <TableHead>Tipo</TableHead>
                              <TableHead>Descripción</TableHead>
                              <TableHead className="text-right">Monto (S/)</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {expenses.map(exp => (
                              <TableRow key={exp.id}>
                                <TableCell>{format(exp.date, "dd/MM/yyyy")}</TableCell>
                                <TableCell><Badge variant="outline">{getExpenseTypeLabel(exp.type)}</Badge></TableCell>
                                <TableCell className="font-medium">{exp.description}</TableCell>
                                <TableCell className="text-right">{exp.amount.toFixed(2)}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                          <TableFooterComponent>
                            <TableRow className="font-bold">
                                <TableCell colSpan={3}>Total Insumos</TableCell>
                                <TableCell className="text-right">S/ {totalInsumos.toFixed(2)}</TableCell>
                            </TableRow>
                            <TableRow className="font-bold">
                                <TableCell colSpan={3}>Total Servicios</TableCell>
                                <TableCell className="text-right">S/ {totalServicios.toFixed(2)}</TableCell>
                            </TableRow>
                            <TableRow className="font-bold">
                                <TableCell colSpan={3}>Total Impuestos</TableCell>
                                <TableCell className="text-right">S/ {totalImpuestos.toFixed(2)}</TableCell>
                            </TableRow>
                             <TableRow className="text-base bg-muted/80">
                                <TableCell colSpan={3} className="font-extrabold">Total Egresos Registrados</TableCell>
                                <TableCell className="text-right font-extrabold">S/ {totalExpenses.toFixed(2)}</TableCell>
                            </TableRow>
                          </TableFooterComponent>
                        </Table>
                     ) : (
                        <p className="text-center text-muted-foreground py-4">No hay gastos registrados para este período.</p>
                     )}
                  </div>
              </CardContent>
            </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
