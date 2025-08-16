

"use client";

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import type { Professional, Location, Appointment } from '@/types';
import { useAuth } from '@/contexts/auth-provider';
import { useRouter } from 'next/navigation';
import { USER_ROLES, APPOINTMENT_STATUS } from '@/lib/constants';
import { getProfessionals, getLocations, getAppointments, getContractDisplayStatus, updateProfessional } from '@/lib/data';
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
import { Loader2, CreditCard, AlertTriangle, PlusCircle, DollarSign, CalendarIcon, List, Users, ShoppingCart, Lightbulb, Landmark as LandmarkIcon, ChevronLeft, ChevronRight, Check, Settings, Percent } from 'lucide-react';
import { format, getYear, getMonth, getDate, startOfMonth, endOfMonth, addDays, setYear, setMonth, isAfter, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogClose } from '@/components/ui/dialog';
import Link from 'next/link';


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

          // Atribuir el ingreso del servicio principal
          processIncomeForProfessional(appt.professionalId, appt.amountPaid);
          
          // Atribuir los ingresos de los servicios adicionales
          appt.addedServices?.forEach(addedService => {
              // El ingreso se atribuye al profesional del servicio adicional, o al principal si no está especificado.
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
        commissionRate: newRate, // Schema expects number between 0-100
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
            Módulo de Pagos
          </CardTitle>
          <CardDescription>
            Cálculo de planilla para el personal y gestión de egresos de la empresa.
          </CardDescription>
        </CardHeader>
      </Card>
      
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
    </div>
  );
}
