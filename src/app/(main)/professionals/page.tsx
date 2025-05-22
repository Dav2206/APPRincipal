
"use client";

import type { Professional, ProfessionalFormData, Contract } from '@/types';
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '@/contexts/auth-provider';
import { useAppState } from '@/contexts/app-state-provider';
import { getProfessionals, addProfessional, updateProfessional, getProfessionalAvailabilityForDate } from '@/lib/data';
import type { ContractDisplayStatus } from '@/lib/data';
import { LOCATIONS, USER_ROLES, LocationId, TIME_SLOTS, DAYS_OF_WEEK } from '@/lib/constants';
import type { DayOfWeekId } from '@/lib/constants';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
  DialogDescription,
} from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { PlusCircle, Edit2, Users, Search, Loader2, CalendarDays, Clock, Trash2, Calendar as CalendarIconLucide, AlertTriangle, Moon, ChevronsDown, FileText, Building, Gift } from 'lucide-react';
import { useForm, useFieldArray, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ProfessionalFormSchema } from '@/lib/schemas';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { format, parseISO, getDay, isSameDay, differenceInDays, startOfDay, addDays as dateFnsAddDays, formatISO as dateFnsFormatISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";


const PROFESSIONALS_PER_PAGE = 5;
const MONTH_NAMES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
const NO_SPECIFY_BIRTHDAY_ITEM_VALUE = "_no_specify_birthday_";


export default function ProfessionalsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { selectedLocationId: adminSelectedLocation } = useAppState();
  const [allProfessionals, setAllProfessionals] = useState<(Professional & { contractDisplayStatus: ContractDisplayStatus })[]>([]);
  const [displayedProfessionals, setDisplayedProfessionals] = useState<(Professional & { contractDisplayStatus: ContractDisplayStatus })[]>([]);
  const [currentPage, setCurrentPage] = useState(1);

  const [isLoading, setIsLoading] = useState(true);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingProfessional, setEditingProfessional] = useState<(Professional & { contractDisplayStatus: ContractDisplayStatus }) | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  const defaultBaseWorkSchedule: ProfessionalFormData['workSchedule'] = {
    monday: { isWorking: true, startTime: '10:00', endTime: '19:00' },
    tuesday: { isWorking: true, startTime: '10:00', endTime: '19:00' },
    wednesday: { isWorking: true, startTime: '10:00', endTime: '19:00' },
    thursday: { isWorking: true, startTime: '10:00', endTime: '19:00' },
    friday: { isWorking: true, startTime: '10:00', endTime: '19:00' },
    saturday: { isWorking: true, startTime: '09:00', endTime: '18:00' },
    sunday: { isWorking: true, startTime: '10:00', endTime: '18:00' }, 
  };


  const form = useForm<ProfessionalFormData>({
    resolver: zodResolver(ProfessionalFormSchema),
    defaultValues: {
      firstName: '',
      lastName: '',
      locationId: LOCATIONS[0].id,
      phone: '',
      workSchedule: defaultBaseWorkSchedule,
      customScheduleOverrides: [],
      currentContract_startDate: null,
      currentContract_endDate: null,
      currentContract_notes: '',
      currentContract_empresa: '',
    }
  });
  
  const { fields: customScheduleFields, append: appendCustomSchedule, remove: removeCustomSchedule } = useFieldArray({
    control: form.control,
    name: "customScheduleOverrides"
  });
  
  const isAdminOrContador = user?.role === USER_ROLES.ADMIN || user?.role === USER_ROLES.CONTADOR;
  const isContadorOnly = user?.role === USER_ROLES.CONTADOR;
  
  const effectiveLocationIdForFetch = useMemo(() => {
    if (isAdminOrContador) {
      return adminSelectedLocation === 'all' ? undefined : adminSelectedLocation as LocationId;
    }
    return user?.locationId;
  }, [user, isAdminOrContador, adminSelectedLocation]);


  const fetchProfessionals = useCallback(async () => {
    if(!user || (user.role === USER_ROLES.LOCATION_STAFF && !isAdminOrContador) ) { 
      setIsLoading(false);
      setAllProfessionals([]);
      return;
    }
    setIsLoading(true);
    try {
      let profsToSet: (Professional & { contractDisplayStatus: ContractDisplayStatus })[] = [];
      if (isAdminOrContador) {
        if (effectiveLocationIdForFetch) {
          profsToSet = await getProfessionals(effectiveLocationIdForFetch);
        } else { // 'all' selected
          const allProfsPromises = LOCATIONS.map(loc => getProfessionals(loc.id));
          const results = await Promise.all(allProfsPromises);
          profsToSet = results.flat();
        }
      }
      setAllProfessionals(profsToSet || []);
    } catch (error) {
      console.error("Failed to fetch professionals:", error);
      setAllProfessionals([]);
      toast({ title: "Error", description: "No se pudieron cargar los profesionales.", variant: "destructive" });
    }
    setIsLoading(false);
  }, [effectiveLocationIdForFetch, user, toast, isAdminOrContador]);

  useEffect(() => {
    if (user?.role === USER_ROLES.ADMIN || user?.role === USER_ROLES.CONTADOR) {
        fetchProfessionals();
    } else {
        setIsLoading(false);
        setAllProfessionals([]);
    }
  }, [fetchProfessionals, user]);

  const filteredProfessionals = useMemo(() => {
    return allProfessionals.filter(p =>
      `${p.firstName} ${p.lastName}`.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (p.phone && p.phone.includes(searchTerm))
    );
  }, [allProfessionals, searchTerm]);

  useEffect(() => {
    setDisplayedProfessionals(filteredProfessionals.slice(0, PROFESSIONALS_PER_PAGE * currentPage));
  }, [filteredProfessionals, currentPage]);


  const handleAddProfessional = () => {
    if (user?.role !== USER_ROLES.ADMIN && user?.role !== USER_ROLES.CONTADOR) {
        toast({ title: "Acción no permitida", description: "Solo administradores o contadores pueden agregar profesionales.", variant: "destructive" });
        return;
    }
    setEditingProfessional(null);
    const defaultLoc = isAdminOrContador
      ? (adminSelectedLocation && adminSelectedLocation !== 'all' ? adminSelectedLocation : LOCATIONS[0].id)
      : user?.locationId; 
    
    form.reset({
      firstName: '',
      lastName: '',
      locationId: defaultLoc as LocationId,
      phone: '',
      workSchedule: defaultBaseWorkSchedule,
      customScheduleOverrides: [],
      currentContract_startDate: null,
      currentContract_endDate: null,
      currentContract_notes: '',
      currentContract_empresa: '',
    });
    setIsFormOpen(true);
  };

  const handleEditProfessional = (professional: Professional & { contractDisplayStatus: ContractDisplayStatus }) => {
     if (user?.role !== USER_ROLES.ADMIN && user?.role !== USER_ROLES.CONTADOR) {
        toast({ title: "Acción no permitida", description: "Solo administradores o contadores pueden editar profesionales.", variant: "destructive" });
        return;
    }
    setEditingProfessional(professional);
    
    const formWorkSchedule: ProfessionalFormData['workSchedule'] = {};
    DAYS_OF_WEEK.forEach(day => { 
      const dayId = day.id as DayOfWeekId;
      const schedule = professional.workSchedule?.[dayId];
      formWorkSchedule[dayId] = schedule 
        ? { isWorking: schedule.isWorking, startTime: schedule.startTime, endTime: schedule.endTime }
        : { isWorking: false, startTime: defaultBaseWorkSchedule[dayId]?.startTime, endTime: defaultBaseWorkSchedule[dayId]?.endTime };
    });

    form.reset({
        id: professional.id,
        firstName: professional.firstName,
        lastName: professional.lastName,
        locationId: professional.locationId as LocationId, 
        phone: professional.phone || '',
        workSchedule: formWorkSchedule,
        customScheduleOverrides: professional.customScheduleOverrides?.map(ov => ({
            id: ov.id || generateId(), 
            date: parseISO(ov.date),
            isWorking: ov.isWorking,
            startTime: ov.startTime || undefined,
            endTime: ov.endTime || undefined,
            notes: ov.notes || undefined,
        })) || [],
        currentContract_startDate: professional.currentContract?.startDate ? parseISO(professional.currentContract.startDate) : null,
        currentContract_endDate: professional.currentContract?.endDate ? parseISO(professional.currentContract.endDate) : null,
        currentContract_notes: professional.currentContract?.notes || '',
        currentContract_empresa: professional.currentContract?.empresa || '',
    });
    setIsFormOpen(true);
  };
  
  const generateId = () => Math.random().toString(36).substr(2, 9);


  const onSubmit = async (data: ProfessionalFormData) => {
    if (user?.role !== USER_ROLES.ADMIN && user?.role !== USER_ROLES.CONTADOR) {
        toast({ title: "Acción no permitida", description: "No tiene permisos para guardar.", variant: "destructive" });
        return;
    }
    try {
      
      let currentContract: Contract | null = null;
      if (data.currentContract_startDate && data.currentContract_endDate) {
        const oldContractId = editingProfessional?.currentContract?.id;
        const newContractDataHasChanged = 
          !oldContractId ||
          (data.currentContract_startDate && dateFnsFormatISO(data.currentContract_startDate, { representation: 'date' }) !== editingProfessional?.currentContract?.startDate) ||
          (data.currentContract_endDate && dateFnsFormatISO(data.currentContract_endDate, { representation: 'date' }) !== editingProfessional?.currentContract?.endDate) ||
          (data.currentContract_notes !== (editingProfessional?.currentContract?.notes || '')) ||
          (data.currentContract_empresa !== (editingProfessional?.currentContract?.empresa || ''));

        currentContract = {
          id: newContractDataHasChanged ? generateId() : oldContractId!,
          startDate: dateFnsFormatISO(data.currentContract_startDate, { representation: 'date' }),
          endDate: dateFnsFormatISO(data.currentContract_endDate, { representation: 'date' }),
          notes: data.currentContract_notes || undefined,
          empresa: data.currentContract_empresa || undefined,
        };
      }

      const professionalToSave: Omit<Professional, 'id' | 'biWeeklyEarnings'> & {id?: string; contractHistory: Contract[]} = {
        id: data.id,
        firstName: data.firstName,
        lastName: data.lastName,
        locationId: data.locationId,
        phone: data.phone || undefined,
        workSchedule: {},
        customScheduleOverrides: data.customScheduleOverrides?.map(ov => ({
            id: ov.id || generateId(),
            date: dateFnsFormatISO(ov.date, { representation: 'date' }),
            isWorking: ov.isWorking,
            startTime: ov.isWorking ? ov.startTime : undefined,
            endTime: ov.isWorking ? ov.endTime : undefined,
            notes: ov.notes,
        })) || [],
        currentContract: currentContract,
        contractHistory: editingProfessional?.contractHistory || [],
      };
      
      if (editingProfessional?.currentContract && currentContract && editingProfessional.currentContract.id !== currentContract.id) {
         if (!professionalToSave.contractHistory.find(ch => ch.id === editingProfessional.currentContract!.id)) {
            professionalToSave.contractHistory.push(editingProfessional.currentContract);
         }
      } else if (editingProfessional?.currentContract && !currentContract) { 
          if (!professionalToSave.contractHistory.find(ch => ch.id === editingProfessional.currentContract!.id)) {
            professionalToSave.contractHistory.push(editingProfessional.currentContract);
         }
      }


      if (data.workSchedule) {
        (Object.keys(data.workSchedule) as Array<DayOfWeekId>).forEach(dayId => { 
          const dayData = data.workSchedule![dayId];
          if (dayData) {
            professionalToSave.workSchedule[dayId] = {
              startTime: dayData.startTime || '00:00',
              endTime: dayData.endTime || '00:00',
              isWorking: dayData.isWorking === undefined ? true : dayData.isWorking
            };
          } else {
            professionalToSave.workSchedule[dayId] = {startTime: '00:00', endTime: '00:00', isWorking: false};
          }
        });
      }

      const result = editingProfessional && editingProfessional.id 
        ? await updateProfessional(editingProfessional.id, professionalToSave as Partial<ProfessionalFormData>)
        : await addProfessional(professionalToSave as Omit<ProfessionalFormData, 'id'>);

      if (result) {
         toast({ title: editingProfessional ? "Profesional Actualizado" : "Profesional Agregado", description: `${result.firstName} ${result.lastName} ${editingProfessional ? 'actualizado' : 'agregado'}.` });
      } else {
          toast({ title: "Error", description: `No se pudo ${editingProfessional ? 'actualizar' : 'agregar'} a ${data.firstName}.`, variant: "destructive" });
      }
      setIsFormOpen(false);
      setCurrentPage(1); 
      fetchProfessionals();
    } catch (error) {
      toast({ title: "Error", description: "No se pudo guardar el profesional.", variant: "destructive" });
      console.error(error);
    }
  };
  
  const LoadingState = () => (
     <div className="flex flex-col items-center justify-center h-64 col-span-full">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="mt-4 text-muted-foreground">Cargando profesionales...</p>
      </div>
  );

  const handleLoadMore = () => {
    setCurrentPage(prev => prev + 1);
  };
  
  if (!user) { 
    return (
      <div className="flex h-screen items-center justify-center">
        <p>Cargando...</p>
      </div>
    );
  }

  if (user.role === USER_ROLES.LOCATION_STAFF) {
    return (
        <Card className="shadow-md">
            <CardHeader>
                <CardTitle className="text-2xl flex items-center gap-2"><AlertTriangle className="text-destructive"/> Acceso Denegado</CardTitle>
                <CardDescription>Esta sección solo está disponible para Administradores y Contadores.</CardDescription>
            </CardHeader>
            <CardContent>
                <p>No tiene los permisos necesarios para ver o gestionar profesionales.</p>
            </CardContent>
        </Card>
    )
  }

 const calculateNextGeneralDayOff = (prof: Professional, referenceDate: Date): Date | null => {
  for (let i = 0; i <= 30; i++) { 
    const checkDate = dateFnsAddDays(referenceDate, i);
    const availability = getProfessionalAvailabilityForDate(prof, checkDate);
    if (!availability || (availability && !availability.startTime && !availability.endTime)) { 
      return checkDate;
    }
  }
  return null;
};


 const formatWorkScheduleDisplay = (prof: Professional) => {
  const today = startOfDay(new Date()); 
  const availabilityToday = getProfessionalAvailabilityForDate(prof, today);

  let todayStr = "Hoy: ";
  if (availabilityToday && availabilityToday.startTime && availabilityToday.endTime) {
    todayStr += `${availabilityToday.startTime}-${availabilityToday.endTime}`;
    if (availabilityToday.notes) todayStr += ` (${availabilityToday.notes})`;
  } else {
    if (availabilityToday && availabilityToday.reason && availabilityToday.reason.trim() !== "") {
      todayStr += availabilityToday.reason; 
    } else {
      todayStr += "Descansando"; 
    }
  }
  
  const nextDayOffDate = calculateNextGeneralDayOff(prof, today);
  let nextDayOffDisplayStr = "";
  if (nextDayOffDate) {
    const formattedDate = format(nextDayOffDate, "EEEE, d 'de' MMMM", { locale: es });
    nextDayOffDisplayStr = ` | Próx. Desc.: ${formattedDate.charAt(0).toUpperCase() + formattedDate.slice(1)}`;
  } else {
    nextDayOffDisplayStr = " | Próx. Desc.: No definido próximamente";
  }
  
  return `${todayStr}${nextDayOffDisplayStr}`;
};


  return (
    <div className="space-y-6">
      <Card className="shadow-md">
        <CardHeader className="flex flex-col md:flex-row justify-between items-center">
          <div>
            <CardTitle className="text-2xl flex items-center gap-2"><Users className="text-primary"/> Gestión de Profesionales</CardTitle>
            <CardDescription>Ver, agregar o editar información, horarios y contratos de los profesionales.</CardDescription>
            {isAdminOrContador && (
              <div className="mt-1 text-sm text-muted-foreground">
                Viendo: {adminSelectedLocation === 'all' ? 'Todas las sedes' : LOCATIONS.find(l => l.id === adminSelectedLocation)?.name || ''}
              </div>
            )}
          </div>
          {(isAdminOrContador) && ( 
          <Button onClick={handleAddProfessional} className="w-full mt-4 md:mt-0 md:w-auto">
            <PlusCircle className="mr-2 h-4 w-4" /> Agregar Profesional
          </Button>
          )}
        </CardHeader>
        <CardContent>
          <div className="mb-4">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                type="search"
                placeholder="Buscar profesionales por nombre o teléfono..."
                value={searchTerm}
                onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
                className="pl-8 w-full"
              />
            </div>
          </div>
          {isLoading ? <LoadingState/> : (
            <>
              <p className="text-sm text-muted-foreground mb-2">
                Mostrando {displayedProfessionals.length} de {filteredProfessionals.length} profesionales.
              </p>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nombre Completo</TableHead>
                      <TableHead className="hidden md:table-cell">Sede</TableHead>
                      <TableHead className="hidden lg:table-cell">Horario (Hoy) y Próximo Descanso</TableHead>
                      <TableHead className="hidden xl:table-cell">Teléfono</TableHead>
                      <TableHead className="hidden md:table-cell">Estado Contrato</TableHead>
                       <TableHead className="hidden md:table-cell">Empresa</TableHead>
                      <TableHead className="hidden md:table-cell">Fin Contrato</TableHead>
                      {isContadorOnly && <TableHead className="hidden xl:table-cell text-right">Ingresos Quincena (S/)</TableHead> }
                      <TableHead className="text-right">Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {displayedProfessionals.length > 0 ? displayedProfessionals.map(prof => (
                      <TableRow key={prof.id}>
                        <TableCell className="font-medium">{prof.firstName} {prof.lastName}</TableCell>
                        <TableCell className="hidden md:table-cell">{LOCATIONS.find(l => l.id === prof.locationId)?.name}</TableCell>
                        <TableCell className="hidden lg:table-cell text-xs">{formatWorkScheduleDisplay(prof)}</TableCell>
                        <TableCell className="hidden xl:table-cell">{prof.phone || 'N/A'}</TableCell>
                        <TableCell className="hidden md:table-cell text-xs">
                          <span className={cn(
                            prof.contractDisplayStatus === 'Activo' && 'text-green-600',
                            prof.contractDisplayStatus === 'Próximo a Vencer' && 'text-orange-500',
                            (prof.contractDisplayStatus === 'Vencido' || prof.contractDisplayStatus === 'No Vigente Aún') && 'text-red-600',
                            prof.contractDisplayStatus === 'Sin Contrato' && 'text-muted-foreground',
                          )}>
                            {(prof.contractDisplayStatus === 'Próximo a Vencer' || prof.contractDisplayStatus === 'Vencido' || prof.contractDisplayStatus === 'No Vigente Aún') && <AlertTriangle className="inline-block mr-1 h-3 w-3" />}
                            {prof.contractDisplayStatus}
                          </span>
                        </TableCell>
                        <TableCell className="hidden md:table-cell text-xs">{prof.currentContract?.empresa || 'N/A'}</TableCell>
                        <TableCell className="hidden md:table-cell text-xs">
                          {prof.currentContract?.endDate ? format(parseISO(prof.currentContract.endDate), 'dd/MM/yyyy') : 'N/A'}
                        </TableCell>
                        {isContadorOnly && <TableCell className="hidden xl:table-cell text-right">{(prof.biWeeklyEarnings ?? 0).toFixed(2)}</TableCell> }
                        <TableCell className="text-right">
                        {(isAdminOrContador) && ( 
                          <Button variant="ghost" size="sm" onClick={() => handleEditProfessional(prof)}>
                            <Edit2 className="h-4 w-4" /> <span className="sr-only">Editar</span>
                          </Button>
                        )}
                        </TableCell>
                      </TableRow>
                    )) : (
                      <TableRow>
                        <TableCell colSpan={isContadorOnly ? 9 : 8} className="h-24 text-center"> 
                          <AlertTriangle className="inline-block mr-2 h-5 w-5 text-muted-foreground" /> No se encontraron profesionales.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
              {displayedProfessionals.length < filteredProfessionals.length && (
                <div className="mt-6 text-center">
                  <Button onClick={handleLoadMore} variant="outline">
                    <ChevronsDown className="mr-2 h-4 w-4"/> Cargar Más
                  </Button>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingProfessional ? 'Editar' : 'Agregar'} Profesional</DialogTitle>
            <DialogDescription>
                {editingProfessional ? 'Modifique la información, horarios y contrato del profesional.' : 'Complete la información para el nuevo profesional.'}
            </DialogDescription>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-1 py-4 max-h-[80vh] overflow-y-auto pr-2">
              {editingProfessional && <input type="hidden" {...form.register("id")} />}
              
              <Accordion type="multiple" defaultValue={['personal-info', 'base-schedule', 'contract-info']} className="w-full">
                <AccordionItem value="personal-info">
                  <AccordionTrigger className="text-lg font-semibold">Información Personal</AccordionTrigger>
                  <AccordionContent className="space-y-4 pt-2">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <FormField control={form.control} name="firstName" render={({ field }) => (
                        <FormItem><FormLabel>Nombre(s)</FormLabel><FormControl><Input placeholder="Ej: Juan" {...field} /></FormControl><FormMessage /></FormItem>
                      )}/>
                      <FormField control={form.control} name="lastName" render={({ field }) => (
                        <FormItem><FormLabel>Apellido(s)</FormLabel><FormControl><Input placeholder="Ej: Pérez" {...field} /></FormControl><FormMessage /></FormItem>
                      )}/>
                    </div>
                    <FormField control={form.control} name="locationId" render={({ field }) => (
                        <FormItem className="mt-4"><FormLabel>Sede</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value} disabled={!isAdminOrContador && !!editingProfessional && user?.role !== USER_ROLES.ADMIN}>
                            <FormControl><SelectTrigger><SelectValue placeholder="Seleccionar sede" /></SelectTrigger></FormControl>
                            <SelectContent>{LOCATIONS.map(loc => (<SelectItem key={loc.id} value={loc.id}>{loc.name}</SelectItem>))}</SelectContent>
                          </Select><FormMessage />
                        </FormItem>
                    )}/>
                    <FormField control={form.control} name="phone" render={({ field }) => (
                        <FormItem className="mt-4"><FormLabel>Teléfono (Opcional)</FormLabel><FormControl><Input type="tel" placeholder="Ej: 987654321" {...field} value={field.value || ''} /></FormControl><FormMessage /></FormItem>
                    )}/>
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="base-schedule">
                  <AccordionTrigger className="text-lg font-semibold">Horario Semanal Base (Lunes a Domingo)</AccordionTrigger>
                  <AccordionContent className="space-y-4 pt-2">
                      {DAYS_OF_WEEK.map((day) => { 
                          const dayId = day.id as DayOfWeekId;
                          return (
                              <div key={dayId} className="p-3 border rounded-md bg-muted/30">
                                  <FormField
                                      control={form.control}
                                      name={`workSchedule.${dayId}.isWorking`}
                                      render={({ field }) => (
                                          <FormItem className="flex flex-row items-center space-x-3 space-y-0 mb-2">
                                              <FormControl><Checkbox checked={!!field.value} onCheckedChange={field.onChange} /></FormControl>
                                              <FormLabel className="font-medium">{day.name}</FormLabel>
                                          </FormItem>
                                      )}
                                  />
                                  {form.watch(`workSchedule.${dayId}.isWorking`) && (
                                      <div className="grid grid-cols-2 gap-3 mt-1">
                                          <FormField
                                              control={form.control}
                                              name={`workSchedule.${dayId}.startTime`}
                                              render={({ field }) => (
                                                  <FormItem>
                                                      <FormLabel className="text-xs">Hora Inicio</FormLabel>
                                                      <Select onValueChange={field.onChange} value={field.value || ""} >
                                                          <FormControl><SelectTrigger><SelectValue placeholder="HH:MM" /></SelectTrigger></FormControl>
                                                          <SelectContent>{TIME_SLOTS.map(slot => (<SelectItem key={`base-start-${dayId}-${slot}`} value={slot}>{slot}</SelectItem>))}</SelectContent>
                                                      </Select>
                                                      <FormMessage />
                                                  </FormItem>
                                              )}
                                          />
                                          <FormField
                                              control={form.control}
                                              name={`workSchedule.${dayId}.endTime`}
                                              render={({ field }) => (
                                                  <FormItem>
                                                      <FormLabel className="text-xs">Hora Fin</FormLabel>
                                                      <Select onValueChange={field.onChange} value={field.value || ""} >
                                                          <FormControl><SelectTrigger><SelectValue placeholder="HH:MM" /></SelectTrigger></FormControl>
                                                          <SelectContent>{TIME_SLOTS.map(slot => (<SelectItem key={`base-end-${dayId}-${slot}`} value={slot}>{slot}</SelectItem>))}</SelectContent>
                                                      </Select>
                                                      <FormMessage />
                                                  </FormItem>
                                              )}
                                          />
                                      </div>
                                  )}
                                  <FormMessage>{form.formState.errors.workSchedule?.[dayId]?.root?.message || form.formState.errors.workSchedule?.[dayId]?.startTime?.message}</FormMessage>
                              </div>
                          );
                      })}
                  </AccordionContent>
                </AccordionItem>
                
                <AccordionItem value="custom-overrides">
                  <AccordionTrigger className="text-lg font-semibold">Registrar Días de Descanso / Horarios Especiales</AccordionTrigger>
                  <AccordionContent className="space-y-4 pt-2">
                    {customScheduleFields.map((field, index) => (
                      <div key={field.id} className="p-4 border rounded-lg space-y-3 relative bg-muted/30">
                          <Button type="button" variant="ghost" size="icon" className="absolute top-2 right-2 h-7 w-7" onClick={() => removeCustomSchedule(index)}>
                            <Trash2 className="h-4 w-4 text-destructive" /> <span className="sr-only">Eliminar Anulación</span>
                          </Button>
                        <FormField control={form.control} name={`customScheduleOverrides.${index}.date`} render={({ field: dateField }) => (
                          <FormItem className="flex flex-col"><FormLabel>Fecha Específica</FormLabel>
                            <Popover><PopoverTrigger asChild><FormControl>
                                <Button variant={"outline"} className={cn("w-full pl-3 text-left font-normal", !dateField.value && "text-muted-foreground")}>
                                  {dateField.value ? format(dateField.value, "PPP", {locale: es}) : <span>Seleccionar fecha</span>} <CalendarIconLucide className="ml-auto h-4 w-4 opacity-50" />
                                </Button></FormControl></PopoverTrigger>
                              <PopoverContent className="w-auto p-0" align="start"><Calendar mode="single" selected={dateField.value} onSelect={dateField.onChange} initialFocus /></PopoverContent>
                            </Popover><FormMessage /></FormItem>
                        )}/>
                        <FormField control={form.control} name={`customScheduleOverrides.${index}.isWorking`} render={({ field: isWorkingField }) => (
                          <FormItem className="flex flex-row items-center space-x-3 space-y-0 rounded-md border p-3 shadow-sm bg-background">
                            <FormControl><Checkbox checked={isWorkingField.value} onCheckedChange={isWorkingField.onChange} /></FormControl>
                            <div className="space-y-1 leading-none"><FormLabel>¿Trabaja este día?</FormLabel></div>
                          </FormItem>
                        )}/>
                        {form.watch(`customScheduleOverrides.${index}.isWorking`) && (
                          <div className="grid grid-cols-2 gap-3">
                            <FormField control={form.control} name={`customScheduleOverrides.${index}.startTime`} render={({ field: stField }) => (
                              <FormItem><FormLabel className="text-xs">Hora Inicio</FormLabel>
                                <Select onValueChange={stField.onChange} value={stField.value || ""}><FormControl><SelectTrigger><SelectValue placeholder="HH:MM"/></SelectTrigger></FormControl>
                                  <SelectContent>{TIME_SLOTS.map(slot => (<SelectItem key={`cs-start-${slot}`} value={slot}>{slot}</SelectItem>))}</SelectContent>
                                </Select><FormMessage /></FormItem>
                            )}/>
                            <FormField control={form.control} name={`customScheduleOverrides.${index}.endTime`} render={({ field: etField }) => (
                              <FormItem><FormLabel className="text-xs">Hora Fin</FormLabel>
                                <Select onValueChange={etField.onChange} value={etField.value || ""}><FormControl><SelectTrigger><SelectValue placeholder="HH:MM"/></SelectTrigger></FormControl>
                                  <SelectContent>{TIME_SLOTS.map(slot => (<SelectItem key={`cs-end-${slot}`} value={slot}>{slot}</SelectItem>))}</SelectContent>
                                </Select><FormMessage /></FormItem>
                            )}/>
                          </div>
                        )}
                        <FormField control={form.control} name={`customScheduleOverrides.${index}.notes`} render={({ field: notesField }) => (
                          <FormItem><FormLabel className="text-xs">Notas (Razón del descanso o detalle del horario especial)</FormLabel><FormControl><Textarea placeholder="Ej: Descanso compensatorio, Turno especial tarde, Vacaciones" {...notesField} value={notesField.value || ''} /></FormControl><FormMessage /></FormItem>
                        )}/>
                      </div>
                    ))}
                    <Button type="button" variant="outline" size="sm" className="mt-4" onClick={() => appendCustomSchedule({ id: generateId(), date: new Date(), isWorking: false, startTime: undefined, endTime: undefined, notes: 'Descanso' })}>
                      <PlusCircle className="mr-2 h-4 w-4" /> Agregar Descanso / Horario Especial
                    </Button>
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="contract-info">
                    <AccordionTrigger className="text-lg font-semibold flex items-center gap-2"><FileText /> Información del Contrato</AccordionTrigger>
                    <AccordionContent className="space-y-4 pt-2">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <FormField control={form.control} name="currentContract_startDate" render={({ field }) => (
                                <FormItem className="flex flex-col">
                                    <FormLabel>Fecha Inicio Contrato</FormLabel>
                                    <Popover>
                                        <PopoverTrigger asChild>
                                            <FormControl>
                                                <Button variant={"outline"} className={cn("w-full pl-3 text-left font-normal", !field.value && "text-muted-foreground")}>
                                                    {field.value ? format(field.value, "PPP", {locale: es}) : <span>Seleccionar fecha</span>}
                                                    <CalendarIconLucide className="ml-auto h-4 w-4 opacity-50" />
                                                </Button>
                                            </FormControl>
                                        </PopoverTrigger>
                                        <PopoverContent className="w-auto p-0" align="start">
                                            <Calendar mode="single" selected={field.value} onSelect={field.onChange} initialFocus />
                                        </PopoverContent>
                                    </Popover>
                                    <FormMessage />
                                </FormItem>
                            )}/>
                            <FormField control={form.control} name="currentContract_endDate" render={({ field }) => (
                                <FormItem className="flex flex-col">
                                    <FormLabel>Fecha Fin Contrato</FormLabel>
                                    <Popover>
                                        <PopoverTrigger asChild>
                                            <FormControl>
                                                <Button variant={"outline"} className={cn("w-full pl-3 text-left font-normal", !field.value && "text-muted-foreground")}>
                                                    {field.value ? format(field.value, "PPP", {locale: es}) : <span>Seleccionar fecha</span>}
                                                    <CalendarIconLucide className="ml-auto h-4 w-4 opacity-50" />
                                                </Button>
                                            </FormControl>
                                        </PopoverTrigger>
                                        <PopoverContent className="w-auto p-0" align="start">
                                            <Calendar mode="single" selected={field.value} onSelect={field.onChange} disabled={(date) => form.getValues("currentContract_startDate") ? date < form.getValues("currentContract_startDate")! : false} initialFocus />
                                        </PopoverContent>
                                    </Popover>
                                    <FormMessage />
                                </FormItem>
                            )}/>
                        </div>
                        <FormField control={form.control} name="currentContract_empresa" render={({ field }) => (
                            <FormItem>
                                <FormLabel className="flex items-center gap-1"><Building size={16}/>Empresa (Opcional)</FormLabel>
                                <FormControl><Input placeholder="Ej: Footprints SAC" {...field} value={field.value || ''}/></FormControl>
                                <FormMessage />
                            </FormItem>
                        )}/>
                        <FormField control={form.control} name="currentContract_notes" render={({ field }) => (
                            <FormItem>
                                <FormLabel>Notas del Contrato (Opcional)</FormLabel>
                                <FormControl><Textarea placeholder="Ej: Renovación, Contrato temporal, etc." {...field} value={field.value || ''}/></FormControl>
                                <FormMessage />
                            </FormItem>
                        )}/>
                    </AccordionContent>
                </AccordionItem>
              </Accordion>

              <DialogFooter className="pt-6">
                <DialogClose asChild><Button type="button" variant="outline">Cancelar</Button></DialogClose>
                <Button type="submit" disabled={form.formState.isSubmitting}>{form.formState.isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{editingProfessional ? 'Guardar Cambios' : 'Agregar Profesional'}</Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}



