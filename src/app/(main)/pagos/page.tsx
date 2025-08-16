
"use client";

import React, { useState, useMemo } from 'react';
import type { Professional, Location } from '@/types';
import { useAuth } from '@/contexts/auth-provider';
import { useRouter } from 'next/navigation';
import { USER_ROLES } from '@/lib/constants';
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
import { Loader2, CreditCard, AlertTriangle, PlusCircle, DollarSign, CalendarIcon, List, Users, ShoppingCart, Lightbulb, Landmark as LandmarkIcon } from 'lucide-react';
import { format } from 'date-fns';
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


export default function PaymentsPage() {
  const { user, isLoading } = useAuth();
  const router = useRouter();
  const { toast } = useToast();

  const [isSaving, setIsSaving] = useState(false);
  
  // --- State for General Expenses ---
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [expenseType, setExpenseType] = useState<ExpenseType>('insumo');
  const [expenseDate, setExpenseDate] = useState<Date>(new Date());
  const [expenseDescription, setExpenseDescription] = useState('');
  const [expenseAmount, setExpenseAmount] = useState('');


  React.useEffect(() => {
    if (!isLoading && (!user || (user.role !== USER_ROLES.ADMIN && user.role !== USER_ROLES.CONTADOR))) {
      router.replace('/dashboard');
    }
  }, [user, isLoading, router]);


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

    // SIMULATION: Add to local state. In a real app, this would be an API call.
    setExpenses(prev => [...prev, newExpense].sort((a,b) => b.date.getTime() - a.date.getTime()));
    toast({ title: "Gasto Registrado (Simulación)", description: `Se ha añadido "${expenseDescription}" a la lista.` });

    // Reset form
    setExpenseDescription('');
    setExpenseAmount('');
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
      
      <Tabs defaultValue="expenses" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="salaries" disabled><Users className="mr-2 h-4 w-4"/>Sueldos y Comisiones</TabsTrigger>
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
              </CardHeader>
              <CardContent>
                <div className="p-8 border rounded-lg bg-secondary/30 text-center">
                  <AlertTriangle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-xl font-semibold">Funcionalidad en Desarrollo</h3>
                  <p className="text-muted-foreground mt-2">
                    Esta sección se conectará con los reportes de producción para calcular automáticamente las comisiones.
                  </p>
                </div>
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
