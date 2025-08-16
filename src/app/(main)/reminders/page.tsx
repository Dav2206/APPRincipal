"use client";

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import type { Professional, Location, Appointment, PeriodicReminder, PeriodicReminderFormData } from '@/types';
import { useAuth } from '@/contexts/auth-provider';
import { useRouter } from 'next/navigation';
import { USER_ROLES, APPOINTMENT_STATUS } from '@/lib/constants';
import { getProfessionals, getLocations, getAppointments, getContractDisplayStatus, updateProfessional, getPeriodicReminders, addPeriodicReminder, updatePeriodicReminder, deletePeriodicReminder as deletePeriodicReminderData, } from '@/lib/data';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter as TableFooterComponent } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, CreditCard, AlertTriangle, PlusCircle, DollarSign, CalendarIcon, List, Users, ShoppingCart, Lightbulb, Landmark as LandmarkIcon, ChevronLeft, ChevronRight, Check, Settings, Percent, Bell, CalendarClock, XCircle, Edit2, Trash2, ShieldAlert, CheckCircle, Clock } from 'lucide-react';
import { format, getYear, getMonth, getDate, startOfMonth, endOfMonth, addDays, setYear, setMonth, isAfter, parseISO, isPast, isBefore } from 'date-fns';
import { es } from 'date-fns/locale';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogClose } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { PeriodicReminderFormSchema } from '@/lib/schemas';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";


const currentSystemYear = getYear(new Date());
const availableYears = [currentSystemYear, currentSystemYear - 1, currentSystemYear - 2];
const months = Array.from({ length: 12 }, (_, i) => ({
  value: i,
  label: format(new Date(currentSystemYear, i), 'MMMM', { locale: es }),
}));

const RECURRENCE_OPTIONS = [
  { value: 'once', label: 'Una vez' },
  { value: 'monthly', label: 'Mensual' },
  { value: 'quarterly', label: 'Trimestral' },
  { value: 'annually', label: 'Anual' },
];

interface PayrollData {
  professionalId: string;
  professionalName: string;
  locationId: string;
  locationName: string;
  totalIncome: number;
  baseSalary: number;
  commission: number;
  totalPayment: number;
  commissionRate: number;
  commissionDeductible: number;
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
  const [editingSalary, setEditingSalary] = useState<{ id: string; value: string } | null>(null);
  const [editingCommission, setEditingCommission] = useState<{ prof: PayrollData; rate: string; deductible: string; } | null>(null);
  
  // --- State for Reminders ---
  const [reminders, setReminders] = useState<PeriodicReminder[]>([]);
  const [isLoadingReminders, setIsLoadingReminders] = useState(true);
  const [isReminderFormOpen, setIsReminderFormOpen] = useState(false);
  const [editingReminder, setEditingReminder] = useState<PeriodicReminder | null>(null);
  const [reminderToDelete, setReminderToDelete] = useState<PeriodicReminder | null>(null);

  const reminderForm = useForm<PeriodicReminderFormData>({
    resolver: zodResolver(PeriodicReminderFormSchema),
    defaultValues: {
      title: '',
      description: '',
      dueDate: new Date(),
      recurrence: 'once',
      amount: undefined,
      status: 'pending',
    },
  });


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
          const processIncomeForProfessional = (profId: string | null | undefined, amount: number | null | undefined) => {
              if (profId && amount && amount > 0) {
                  incomeByProfessional[profId] = (incomeByProfessional[profId] || 0) + amount;
              }
          };

          processIncomeForProfessional(appt.professionalId, appt.amountPaid);
          
          appt.addedServices?.forEach(addedService => {
              const profIdForAddedService = addedService.professionalId || appt.professionalId;
              processIncomeForProfessional(profIdForAddedService, addedService.amountPaid);
          });
        });

        const newPayrollData: PayrollData[] = activeProfessionals.map(prof => {
            const totalIncome = incomeByProfessional[prof.id] || 0;
            const deductible = prof.commissionDeductible ?? (prof.locationId === 'higuereta' ? 2200 : 1800);
            const rate = prof.commissionRate ?? 0.20;
            const commissionableAmount = Math.max(0, totalIncome - deductible);
            const commission = commissionableAmount * rate;
            const baseSalaryQuincenal = (prof.baseSalary || 0) / 2;
            const totalPayment = baseSalaryQuincenal + commission;

            return {
                professionalId: prof.id,
                professionalName: `${prof.firstName} ${prof.lastName}`,
                locationId: prof.locationId,
                locationName: locations.find(l => l.id === prof.locationId)?.name || 'N/A',
                totalIncome: totalIncome,
                baseSalary: baseSalaryQuincenal,
                commission: commission,
                totalPayment: totalPayment,
                commissionRate: rate,
                commissionDeductible: deductible,
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


  const handleSalaryEdit = (profId: string, currentSalary: number) => {
    setEditingSalary({ id: profId, value: (currentSalary * 2).toString() }); // Edit the full monthly salary
  };

  const handleSaveSalary = async () => {
    if (!editingSalary) return;
    
    const newSalary = parseFloat(editingSalary.value);
    if (isNaN(newSalary) || newSalary < 0) {
      toast({ title: "Valor inválido", description: "El sueldo base debe ser un número positivo.", variant: "destructive" });
      return;
    }

    try {
      await updateProfessional(editingSalary.id, { baseSalary: newSalary });
      toast({ title: "Sueldo Actualizado", description: "El sueldo base ha sido actualizado exitosamente." });
      setEditingSalary(null);
      calculatePayroll(); // Recalculate payroll with new salary
    } catch (error) {
      toast({ title: "Error", description: "No se pudo actualizar el sueldo.", variant: "destructive" });
    }
  };
  
  const handleCommissionEdit = (profData: PayrollData) => {
    setEditingCommission({
      prof: profData,
      rate: (profData.commissionRate * 100).toString(),
      deductible: profData.commissionDeductible.toString(),
    });
  };

  const handleSaveCommission = async () => {
    if (!editingCommission) return;

    const newRate = parseFloat(editingCommission.rate);
    const newDeductible = parseFloat(editingCommission.deductible);

    if (isNaN(newRate) || newRate < 0 || newRate > 100) {
      toast({ title: "Valor inválido", description: "La tasa de comisión debe ser un número entre 0 y 100.", variant: "destructive" });
      return;
    }
     if (isNaN(newDeductible) || newDeductible < 0) {
      toast({ title: "Valor inválido", description: "El deducible debe ser un número positivo.", variant: "destructive" });
      return;
    }

    try {
      await updateProfessional(editingCommission.prof.professionalId, { 
        commissionRate: newRate, 
        commissionDeductible: newDeductible
      });
      toast({ title: "Comisión Actualizada", description: `Los parámetros de comisión para ${editingCommission.prof.professionalName} han sido actualizados.` });
      setEditingCommission(null);
      calculatePayroll(); // Recalculate payroll
    } catch (error) {
      toast({ title: "Error", description: "No se pudieron actualizar los parámetros de comisión.", variant: "destructive" });
    }
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

    // --- Reminder Handlers ---
  const fetchReminders = useCallback(async () => {
    if (!user || (user.role !== USER_ROLES.ADMIN && user.role !== USER_ROLES.CONTADOR)) return;
    setIsLoadingReminders(true);
    try {
      const data = await getPeriodicReminders();
      setReminders(data.sort((a, b) => parseISO(a.dueDate).getTime() - parseISO(b.dueDate).getTime()));
    } catch (error) {
      toast({ title: "Error", description: "No se pudieron cargar los recordatorios.", variant: "destructive" });
    } finally {
      setIsLoadingReminders(false);
    }
  }, [user, toast]);

  useEffect(() => {
    fetchReminders();
  }, [fetchReminders]);

  const handleAddReminder = () => {
    setEditingReminder(null);
    reminderForm.reset({
      title: '',
      description: '',
      dueDate: new Date(),
      recurrence: 'once',
      amount: undefined,
      status: 'pending',
    });
    setIsReminderFormOpen(true);
  };

  const handleEditReminder = (reminder: PeriodicReminder) => {
    setEditingReminder(reminder);
    reminderForm.reset({
      title: reminder.title,
      description: reminder.description || '',
      dueDate: parseISO(reminder.dueDate),
      recurrence: reminder.recurrence,
      amount: reminder.amount ?? undefined,
      status: reminder.status,
    });
    setIsReminderFormOpen(true);
  };

  const handleDeleteReminder = async () => {
    if (!reminderToDelete) return;
    try {
      await deletePeriodicReminderData(reminderToDelete.id);
      toast({ title: "Recordatorio Eliminado", description: `"${reminderToDelete.title}" ha sido eliminado.` });
      setReminderToDelete(null);
      fetchReminders();
    } catch (error) {
      toast({ title: "Error", description: "No se pudo eliminar el recordatorio.", variant: "destructive" });
    }
  };

  const handleTogglePaidStatus = async (reminder: PeriodicReminder) => {
    const newStatus = reminder.status === 'pending' ? 'paid' : 'pending';
    try {
      await updatePeriodicReminder(reminder.id, { ...reminder, status: newStatus, dueDate: reminder.dueDate });
      toast({ title: "Estado Actualizado", description: `El recordatorio "${reminder.title}" ahora está ${newStatus === 'paid' ? 'pagado' : 'pendiente'}.` });
      fetchReminders();
    } catch (error) {
      toast({ title: "Error", description: "No se pudo actualizar el estado del recordatorio.", variant: "destructive" });
    }
  };

  const onSubmitReminderForm = async (data: PeriodicReminderFormData) => {
    try {
      if (editingReminder) {
        await updatePeriodicReminder(editingReminder.id, { ...data, id: editingReminder.id, dueDate: format(data.dueDate, "yyyy-MM-dd") });
        toast({ title: "Recordatorio Actualizado", description: `"${data.title}" ha sido actualizado.` });
      } else {
        await addPeriodicReminder({ ...data, dueDate: format(data.dueDate, "yyyy-MM-dd") });
        toast({ title: "Recordatorio Añadido", description: `"${data.title}" ha sido añadido.` });
      }
      setIsReminderFormOpen(false);
      fetchReminders();
    } catch (error) {
      toast({ title: "Error", description: "No se pudo guardar el recordatorio.", variant: "destructive" });
    }
  };
  
  const getReminderDisplayStatus = (reminder: PeriodicReminder): { text: string; variant: "default" | "destructive" | "secondary" | "outline"; icon?: React.ReactNode } => {
    const today = startOfDay(new Date());
    const dueDate = parseISO(reminder.dueDate);

    if (reminder.status === 'paid') {
      return { text: 'Pagado', variant: 'default', icon: <CheckCircle className="h-4 w-4 text-green-500" /> };
    }
    if (isBefore(dueDate, today)) {
      return { text: 'Vencido', variant: 'destructive', icon: <AlertTriangle className="h-4 w-4" /> };
    }
    return { text: 'Pendiente', variant: 'secondary', icon: <Clock className="h-4 w-4 text-orange-500" /> };
  };

  
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
            Módulo de Pagos y Gastos
          </CardTitle>
          <CardDescription>
            Cálculo de planilla para el personal y gestión de egresos de la empresa.
          </CardDescription>
        </CardHeader>
      </Card>
      
       <Tabs defaultValue="payroll" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="payroll">Pagos al Personal</TabsTrigger>
          <TabsTrigger value="expenses">Gastos Operativos (Recordatorios)</TabsTrigger>
        </TabsList>
        <TabsContent value="payroll">
          <Card>
            <CardHeader>
              <CardTitle>Pagos al Personal</CardTitle>
              <CardDescription>
                Visualización de los pagos a profesionales, incluyendo sueldo base y comisiones por producción quincenal.
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
                      <TableHead className="text-right">Sueldo Base Quincenal (S/)</TableHead>
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
                        <TableCell className="text-right cursor-pointer" onDoubleClick={() => handleSalaryEdit(item.professionalId, item.baseSalary)}>
                          {editingSalary?.id === item.professionalId ? (
                            <div className="flex gap-1 justify-end items-center">
                              <Input
                                type="number"
                                value={editingSalary.value}
                                onChange={(e) => setEditingSalary({ ...editingSalary, value: e.target.value })}
                                onKeyDown={(e) => { if(e.key === 'Enter') handleSaveSalary(); if(e.key === 'Escape') setEditingSalary(null); }}
                                className="w-24 h-8 text-right"
                                autoFocus
                              />
                              <Button size="icon" className="h-8 w-8" onClick={handleSaveSalary}><Check size={16}/></Button>
                            </div>
                          ) : (
                            <span>{item.baseSalary.toFixed(2)}</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right text-green-600 font-semibold cursor-pointer" onDoubleClick={() => handleCommissionEdit(item)}>
                            {item.commission.toFixed(2)}
                        </TableCell>
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
            <CardFooter className="flex-col items-start gap-2 text-xs text-muted-foreground">
                <p><span className="font-semibold">Producción:</span> Suma de todos los servicios (principales y adicionales) realizados por el profesional en la quincena.</p>
                <p><span className="font-semibold">Comisión:</span> Se calcula como `(Producción - Deducible) * Tasa`. El deducible y la tasa son configurables por profesional.</p>
                <p><span className="font-semibold">Edición Rápida:</span> Haga doble clic en "Sueldo Base" o "Comisión" para editar los valores del profesional.</p>
            </CardFooter>
          </Card>
        </TabsContent>

        <TabsContent value="expenses">
          <Card>
            <CardHeader className="flex flex-row justify-between items-center">
                <div>
                    <CardTitle>Gastos Operativos y Recordatorios</CardTitle>
                    <CardDescription>
                        Configure y dé seguimiento a los pagos recurrentes de la empresa.
                    </CardDescription>
                </div>
                 <Button onClick={handleAddReminder}>
                    <PlusCircle className="mr-2 h-4 w-4" /> Añadir Recordatorio
                </Button>
            </CardHeader>
            <CardContent>
                 {isLoadingReminders ? (
                    <div className="flex justify-center items-center h-40">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    <p className="ml-2 text-muted-foreground">Cargando recordatorios...</p>
                    </div>
                ) : reminders.length === 0 ? (
                    <div className="p-6 border rounded-lg bg-secondary/30 text-center">
                    <ShieldAlert className="h-10 w-10 text-muted-foreground mx-auto mb-2" />
                    <p className="text-muted-foreground">
                        No hay recordatorios periódicos configurados. ¡Añade el primero!
                    </p>
                    </div>
                ) : (
                    <div className="rounded-md border">
                    <Table>
                        <TableHeader>
                        <TableRow>
                            <TableHead>Título</TableHead>
                            <TableHead>Fecha Vencimiento</TableHead>
                            <TableHead className="hidden md:table-cell">Recurrencia</TableHead>
                            <TableHead className="hidden sm:table-cell text-right">Monto (S/)</TableHead>
                            <TableHead className="text-center">Estado</TableHead>
                            <TableHead className="text-right">Acciones</TableHead>
                        </TableRow>
                        </TableHeader>
                        <TableBody>
                        {reminders.map((reminder) => {
                            const displayStatus = getReminderDisplayStatus(reminder);
                            return (
                            <TableRow key={reminder.id} className={cn(displayStatus.variant === 'destructive' && reminder.status === 'pending' && 'bg-destructive/10')}>
                                <TableCell className="font-medium">
                                {reminder.title}
                                {reminder.description && <p className="text-xs text-muted-foreground truncate max-w-xs">{reminder.description}</p>}
                                </TableCell>
                                <TableCell>{format(parseISO(reminder.dueDate), "PPP", { locale: es })}</TableCell>
                                <TableCell className="hidden md:table-cell">{RECURRENCE_OPTIONS.find(opt => opt.value === reminder.recurrence)?.label}</TableCell>
                                <TableCell className="hidden sm:table-cell text-right">{reminder.amount ? reminder.amount.toFixed(2) : '-'}</TableCell>
                                <TableCell className="text-center">
                                <Badge variant={displayStatus.variant} className="text-xs">
                                    {displayStatus.icon && <span className="mr-1">{displayStatus.icon}</span>}
                                    {displayStatus.text}
                                </Badge>
                                </TableCell>
                                <TableCell className="text-right space-x-1">
                                <Button variant={reminder.status === 'paid' ? "outline" : "default"} size="xs" onClick={() => handleTogglePaidStatus(reminder)}>
                                    {reminder.status === 'paid' ? <XCircle className="mr-1 h-3 w-3" /> : <CheckCircle className="mr-1 h-3 w-3" />}
                                    {reminder.status === 'paid' ? 'Marcar Pendiente' : 'Marcar Pagado'}
                                </Button>
                                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleEditReminder(reminder)} title="Editar">
                                    <Edit2 className="h-4 w-4" />
                                </Button>
                                <AlertDialog>
                                    <AlertDialogTrigger asChild>
                                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setReminderToDelete(reminder)} title="Eliminar">
                                        <Trash2 className="h-4 w-4 text-destructive" />
                                    </Button>
                                    </AlertDialogTrigger>
                                    <AlertDialogContent>
                                    <AlertDialogHeader>
                                        <AlertDialogTitle>¿Confirmar Eliminación?</AlertDialogTitle>
                                        <AlertDialogDescription>
                                        Esta acción no se puede deshacer. ¿Estás seguro de que quieres eliminar el recordatorio "{reminderToDelete?.title}"?
                                        </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                        <AlertDialogCancel onClick={() => setReminderToDelete(null)}>Cancelar</AlertDialogCancel>
                                        <AlertDialogAction onClick={handleDeleteReminder} className={buttonVariants({ variant: "destructive" })}>
                                        Eliminar
                                        </AlertDialogAction>
                                    </AlertDialogFooter>
                                    </AlertDialogContent>
                                </AlertDialog>
                                </TableCell>
                            </TableRow>
                            );
                        })}
                        </TableBody>
                    </Table>
                    </div>
                )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
      
      {editingCommission && (
        <Dialog open={!!editingCommission} onOpenChange={() => setEditingCommission(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Editar Parámetros de Comisión</DialogTitle>
              <DialogDescription>
                Ajuste el cálculo de comisión para {editingCommission.prof.professionalName}.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="deductible" className="text-right col-span-1">
                  Deducible (S/)
                </Label>
                <Input
                  id="deductible"
                  type="number"
                  value={editingCommission.deductible}
                  onChange={(e) => setEditingCommission({ ...editingCommission, deductible: e.target.value })}
                  className="col-span-3"
                />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="rate" className="text-right col-span-1">
                  Tasa (%)
                </Label>
                <Input
                  id="rate"
                  type="number"
                  value={editingCommission.rate}
                  onChange={(e) => setEditingCommission({ ...editingCommission, rate: e.target.value })}
                  className="col-span-3"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditingCommission(null)}>Cancelar</Button>
              <Button onClick={handleSaveCommission}>Guardar Cambios</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

       {/* Reminder Form Dialog */}
      <Dialog open={isReminderFormOpen} onOpenChange={setIsReminderFormOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingReminder ? 'Editar' : 'Añadir'} Recordatorio</DialogTitle>
          </DialogHeader>
          <Form {...reminderForm}>
            <form onSubmit={reminderForm.handleSubmit(onSubmitReminderForm)} className="space-y-4 py-2 max-h-[70vh] overflow-y-auto pr-2">
              <FormField
                control={reminderForm.control}
                name="title"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Título</FormLabel>
                    <FormControl><Input placeholder="Ej: Pago de IGV" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={reminderForm.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Descripción (Opcional)</FormLabel>
                    <FormControl><Textarea placeholder="Ej: Declaración mensual, periodo 05-2025" {...field} value={field.value || ''}/></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={reminderForm.control}
                name="dueDate"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>Fecha de Vencimiento</FormLabel>
                    <Popover>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button variant="outline" className={cn("w-full pl-3 text-left font-normal", !field.value && "text-muted-foreground")}>
                            {field.value ? format(field.value, "PPP", { locale: es }) : <span>Seleccionar fecha</span>}
                            <CalendarClock className="ml-auto h-4 w-4 opacity-50" />
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar mode="single" selected={field.value} onSelect={field.onChange} initialFocus />
                      </PopoverContent>
                    </Popover>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={reminderForm.control}
                name="recurrence"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Recurrencia</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl><SelectTrigger><SelectValue placeholder="Seleccionar recurrencia" /></SelectTrigger></FormControl>
                      <SelectContent>
                        {RECURRENCE_OPTIONS.map(opt => (
                          <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={reminderForm.control}
                name="amount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Monto (S/) (Opcional)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="0.01"
                        placeholder="Ej: 150.50"
                        {...field}
                        value={field.value ?? ""}
                        onChange={e => field.onChange(e.target.value ? parseFloat(e.target.value) : undefined)}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <DialogFooter className="pt-4">
                <DialogClose asChild><Button type="button" variant="outline">Cancelar</Button></DialogClose>
                <Button type="submit" disabled={reminderForm.formState.isSubmitting}>
                  {reminderForm.formState.isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {editingReminder ? 'Guardar Cambios' : 'Añadir Recordatorio'}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}