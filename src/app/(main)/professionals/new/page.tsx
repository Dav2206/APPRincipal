
"use client";

import type { Professional, ProfessionalFormData, Contract, Location } from '@/types';
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/auth-provider';
import { useAppState } from '@/contexts/app-state-provider';
import { addProfessional, getLocations } from '@/lib/data';
import type { LocationId } from '@/lib/constants';
import { USER_ROLES, TIME_SLOTS, DAYS_OF_WEEK, DayOfWeekId as DayOfWeekIdConst } from '@/lib/constants';
import type { DayOfWeekId } from '@/lib/constants';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
  DialogDescription,
} from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { PlusCircle, Edit2, Users, Search, Loader2, CalendarDays, Clock, Trash2, Calendar as CalendarIconLucide, AlertTriangle, Moon, ChevronsDown, FileText, Building, Gift, Briefcase as BriefcaseIcon, ChevronLeft, ChevronRight, Bed, DollarSign, Percent, Save, Layers } from 'lucide-react';
import { useForm, useFieldArray, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ProfessionalFormSchema } from '@/lib/schemas';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { format, parseISO, getDay, isSameDay, differenceInDays, startOfDay, addDays as dateFnsAddDays, formatISO as dateFnsFormatISO, getMonth, getYear, isSameMonth, addMonths, subMonths, startOfMonth, eachDayOfInterval, isAfter } from 'date-fns';
import type { DateRange } from "react-day-picker";
import { es } from 'date-fns/locale';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from '@/components/ui/badge';
import Link from 'next/link';


const NO_SPECIFY_BIRTHDAY_ITEM_VALUE = "_no_specify_birthday_";

interface GroupedException {
    id: string;
    startDate: Date;
    endDate: Date;
    overrideType: 'descanso' | 'turno_especial' | 'traslado';
    notes?: string | null;
    locationId?: LocationId | null;
    startTime?: string | null;
    endTime?: string | null;
    originalIndices: number[];
}


export default function NewProfessionalPage() {
    const { user } = useAuth();
    const { toast } = useToast();
    const router = useRouter();
    const { selectedLocationId: adminSelectedLocation } = useAppState();
    const [locations, setLocations] = useState<Location[]>([]);
    
    const [isVacationModalOpen, setIsVacationModalOpen] = useState(false);
    const [overrideDisplayDate, setOverrideDisplayDate] = useState(new Date());

    const defaultBaseWorkSchedule: ProfessionalFormData['workSchedule'] = {
        monday: { isWorking: true, startTime: '10:00', endTime: '19:00' },
        tuesday: { isWorking: true, startTime: '10:00', endTime: '19:00' },
        wednesday: { isWorking: true, startTime: '10:00', endTime: '19:00' },
        thursday: { isWorking: true, startTime: '10:00', endTime: '19:00' },
        friday: { isWorking: true, startTime: '10:00', endTime: '19:00' },
        saturday: { isWorking: true, startTime: '09:00', endTime: '18:00' },
        sunday: { isWorking: true, startTime: '10:00', endTime: '18:00' },
    };

    const months = Array.from({ length: 12 }, (_, i) => ({
        value: i + 1,
        label: format(new Date(2000, i, 1), "MMMM", { locale: es }),
    }));
    const days = Array.from({ length: 31 }, (_, i) => ({ value: i + 1, label: (i + 1).toString() }));

    const isAdminOrContador = useMemo(() => user?.role === USER_ROLES.ADMIN || user?.role === USER_ROLES.CONTADOR, [user]);

    const form = useForm<ProfessionalFormData>({
        resolver: zodResolver(ProfessionalFormSchema),
        defaultValues: {
          firstName: '',
          lastName: '',
          locationId: '',
          phone: '',
          isManager: false,
          baseSalary: 1025,
          commissionRate: 20,
          commissionDeductible: undefined,
          afp: 128.5,
          seguro: 101.7,
          workSchedule: defaultBaseWorkSchedule,
          customScheduleOverrides: [],
          currentContract_startDate: null,
          currentContract_endDate: null,
          currentContract_notes: '',
          currentContract_empresa: '',
          birthDay: null,
          birthMonth: null,
        }
    });

    useEffect(() => {
        async function loadLocationsData() {
            const fetchedLocations = await getLocations();
            setLocations(fetchedLocations);
            
            const defaultLoc = isAdminOrContador
              ? (adminSelectedLocation && adminSelectedLocation !== 'all' ? adminSelectedLocation : (fetchedLocations.length > 0 ? fetchedLocations[0].id : ''))
              : user?.locationId;
            
            form.setValue('locationId', defaultLoc as LocationId);
            form.setValue('commissionDeductible', defaultLoc === 'higuereta' ? 2200 : 1800);
        }
        loadLocationsData();
    }, [isAdminOrContador, adminSelectedLocation, user?.locationId, form]);

    const { fields: customScheduleFields, append: appendCustomSchedule, remove: removeCustomSchedule, replace: replaceCustomSchedule } = useFieldArray({
        control: form.control,
        name: "customScheduleOverrides"
    });
    
     const groupedExceptions = useMemo(() => {
        const sortedFields = [...customScheduleFields]
            .map((field, index) => ({ ...field, originalIndex: index }))
            .filter(field => isSameMonth(field.date, overrideDisplayDate))
            .sort((a, b) => a.date.getTime() - b.date.getTime());

        if (sortedFields.length === 0) return [];

        const groups: GroupedException[] = [];
        let currentGroup: GroupedException | null = null;

        for (const field of sortedFields) {
            const isSameGroup =
                currentGroup &&
                field.overrideType === currentGroup.overrideType &&
                (field.notes || null) === (currentGroup.notes || null) &&
                (field.locationId || null) === (currentGroup.locationId || null) &&
                (field.startTime || null) === (currentGroup.startTime || null) &&
                (field.endTime || null) === (currentGroup.endTime || null) &&
                differenceInDays(field.date, currentGroup.endDate) === 1;

            if (isSameGroup) {
                currentGroup.endDate = field.date;
                currentGroup.originalIndices.push(field.originalIndex);
            } else {
                if (currentGroup) groups.push(currentGroup);
                currentGroup = {
                    id: field.id,
                    startDate: field.date,
                    endDate: field.date,
                    overrideType: field.overrideType,
                    notes: field.notes,
                    locationId: field.locationId,
                    startTime: field.startTime,
                    endTime: field.endTime,
                    originalIndices: [field.originalIndex],
                };
            }
        }
        if (currentGroup) groups.push(currentGroup);
        return groups;
    }, [customScheduleFields, overrideDisplayDate]);

    const handleRemoveGroup = (group: GroupedException) => {
        // Sort indices in descending order to avoid shifting issues
        const indicesToRemove = [...group.originalIndices].sort((a, b) => b - a);
        indicesToRemove.forEach(index => {
            removeCustomSchedule(index);
        });
    };

    const generateId = () => Math.random().toString(36).substring(2, 11);

    const onSubmit = async (data: ProfessionalFormData) => {
        try {
            const formattedData: ProfessionalFormData = {
                ...data,
                commissionRate: data.commissionRate,
                customScheduleOverrides: (data.customScheduleOverrides || []).map(ov => ({
                    ...ov,
                    startTime: ov.overrideType !== 'descanso' ? ov.startTime : undefined,
                    endTime: ov.overrideType !== 'descanso' ? ov.endTime : undefined,
                    locationId: ov.overrideType === 'traslado' ? ov.locationId : undefined,
                })),
                 baseSalary: data.baseSalary === undefined ? null : data.baseSalary,
                commissionDeductible: data.commissionDeductible === undefined ? null : data.commissionDeductible,
                afp: data.afp === undefined ? null : data.afp,
                seguro: data.seguro === undefined ? null : data.seguro,
            };

            await addProfessional(formattedData as any);
            toast({ title: "Profesional Agregado", description: `${data.firstName} ${data.lastName} agregado.` });
            router.push('/professionals');
            
        } catch (error) {
            toast({ title: "Error", description: "No se pudo guardar el profesional.", variant: "destructive" });
            console.error(error);
        }
    };

    if (!isAdminOrContador) {
        return (
            <div className="container mx-auto p-4">
                <Card>
                    <CardHeader>
                        <CardTitle className="text-xl flex items-center gap-2"><AlertTriangle/> Acceso Denegado</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p>No tiene permisos para crear nuevos profesionales.</p>
                    </CardContent>
                </Card>
            </div>
        );
    }
    
    return (
        <div className="container mx-auto py-8 px-4 md:px-0">
            <Card>
                <CardHeader>
                    <CardTitle className="text-2xl">Nuevo Profesional</CardTitle>
                    <CardDescription>Complete la información para el nuevo profesional.</CardDescription>
                </CardHeader>
                <CardContent>
                    <Form {...form}>
                        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-1 py-4 pr-2">
                        <Accordion type="multiple" defaultValue={['personal-info', 'base-schedule']} className="w-full">
                            <AccordionItem value="personal-info">
                                <AccordionTrigger className="text-lg font-semibold">Información Personal y Contrato</AccordionTrigger>
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
                                    <FormItem><FormLabel>Sede Base</FormLabel>
                                    <Select onValueChange={field.onChange} value={field.value}>
                                        <FormControl><SelectTrigger><SelectValue placeholder="Seleccionar sede" /></SelectTrigger></FormControl>
                                        <SelectContent>{locations.map(loc => (<SelectItem key={loc.id} value={loc.id}>{loc.name}</SelectItem>))}</SelectContent>
                                    </Select><FormMessage />
                                    </FormItem>
                                )}/>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <FormField control={form.control} name="phone" render={({ field }) => (
                                        <FormItem><FormLabel>Teléfono (Opcional)</FormLabel><FormControl><Input type="tel" placeholder="Ej: 987654321" {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
                                    )}/>
                                    <div className="grid grid-cols-2 gap-2">
                                        <FormField
                                            control={form.control}
                                            name="birthDay"
                                            render={({ field }) => (
                                            <FormItem>
                                                <FormLabel className="flex items-center gap-1"><Gift size={16}/>Día</FormLabel>
                                                <Select onValueChange={(value) => field.onChange(value === NO_SPECIFY_BIRTHDAY_ITEM_VALUE ? null : parseInt(value))} value={field.value === null ? NO_SPECIFY_BIRTHDAY_ITEM_VALUE : (field.value?.toString() || NO_SPECIFY_BIRTHDAY_ITEM_VALUE)}>
                                                <FormControl><SelectTrigger><SelectValue placeholder="Día" /></SelectTrigger></FormControl>
                                                <SelectContent>
                                                    <SelectItem value={NO_SPECIFY_BIRTHDAY_ITEM_VALUE}>No especificar</SelectItem>
                                                    {days.map(d => <SelectItem key={`day-${d.value}`} value={d.value.toString()}>{d.label}</SelectItem>)}
                                                </SelectContent>
                                                </Select>
                                                <FormMessage />
                                            </FormItem>
                                            )}
                                        />
                                        <FormField
                                            control={form.control}
                                            name="birthMonth"
                                            render={({ field }) => (
                                            <FormItem>
                                                <FormLabel className="flex items-center gap-1"><CalendarIconLucide size={16}/>Mes</FormLabel>
                                                <Select onValueChange={(value) => field.onChange(value === NO_SPECIFY_BIRTHDAY_ITEM_VALUE ? null : parseInt(value))} value={field.value === null ? NO_SPECIFY_BIRTHDAY_ITEM_VALUE : (field.value?.toString() || NO_SPECIFY_BIRTHDAY_ITEM_VALUE)}>
                                                <FormControl><SelectTrigger><SelectValue placeholder="Mes" /></SelectTrigger></FormControl>
                                                <SelectContent>
                                                    <SelectItem value={NO_SPECIFY_BIRTHDAY_ITEM_VALUE}>No especificar</SelectItem>
                                                    {months.map(m => <SelectItem key={`month-${m.value}`} value={m.value.toString()}>{m.label}</SelectItem>)}
                                                </SelectContent>
                                                </Select>
                                                <FormMessage />
                                            </FormItem>
                                            )}
                                        />
                                    </div>
                                </div>
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
                                            <FormControl><Input placeholder="Ej: Footprints SAC" {...field} value={field.value ?? ''}/></FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}/>
                                <FormField control={form.control} name="currentContract_notes" render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Notas del Contrato (Opcional)</FormLabel>
                                        <FormControl><Textarea placeholder="Ej: Renovación, Contrato temporal, etc." {...field} value={field.value ?? ''}/></FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}/>
                                <FormField
                                control={form.control}
                                name="isManager"
                                render={({ field }) => (
                                    <FormItem className="flex flex-row items-center space-x-3 space-y-0 rounded-md border p-3 shadow-sm">
                                    <FormControl>
                                        <Checkbox
                                        checked={field.value}
                                        onCheckedChange={field.onChange}
                                        />
                                    </FormControl>
                                    <div className="space-y-1 leading-none">
                                        <FormLabel>¿Es Gerente de Sede?</FormLabel>
                                        <FormDescription className="text-xs">
                                        Los gerentes pueden atender citas pero no aparecerán como una columna en la Agenda Horaria.
                                        </FormDescription>
                                    </div>
                                    <FormMessage />
                                    </FormItem>
                                )}
                                />
                                </AccordionContent>
                            </AccordionItem>
                             <AccordionItem value="financial-params">
                                <AccordionTrigger className="text-lg font-semibold">Parámetros Financieros</AccordionTrigger>
                                <AccordionContent className="space-y-4 pt-2">
                                     <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <FormField control={form.control} name="baseSalary" render={({ field }) => (
                                            <FormItem>
                                                <FormLabel className="flex items-center gap-1"><DollarSign size={16}/>Sueldo Base Mensual (S/)</FormLabel>
                                                <FormControl><Input type="number" placeholder="Ej: 1025.00" {...field} value={field.value ?? ''} onChange={e => field.onChange(e.target.value === '' ? null : parseFloat(e.target.value) || null)}/></FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}/>
                                        <FormField control={form.control} name="commissionRate" render={({ field }) => (
                                            <FormItem>
                                                <FormLabel className="flex items-center gap-1"><Percent size={16}/>Tasa de Comisión (%)</FormLabel>
                                                <FormControl><Input type="number" placeholder="Ej: 20" {...field} value={field.value ?? ''} onChange={e => field.onChange(e.target.value === '' ? null : parseFloat(e.target.value) || null)}/></FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}/>
                                    </div>
                                     <FormField control={form.control} name="commissionDeductible" render={({ field }) => (
                                        <FormItem>
                                            <FormLabel className="flex items-center gap-1"><DollarSign size={16}/>Monto a Deducir para Comisión (S/)</FormLabel>
                                            <FormControl><Input type="number" placeholder="Ej: 1800" {...field} value={field.value ?? ''} onChange={e => field.onChange(e.target.value === '' ? null : parseFloat(e.target.value) || null)}/></FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}/>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <FormField control={form.control} name="afp" render={({ field }) => (
                                            <FormItem>
                                                <FormLabel className="flex items-center gap-1">AFP Mensual (S/)</FormLabel>
                                                <FormControl><Input type="number" placeholder="Ej: 128.50" {...field} value={field.value ?? ''} onChange={e => field.onChange(e.target.value === '' ? null : parseFloat(e.target.value) || null)}/></FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}/>
                                        <FormField control={form.control} name="seguro" render={({ field }) => (
                                            <FormItem>
                                                <FormLabel className="flex items-center gap-1">Seguro Mensual (S/)</FormLabel>
                                                <FormControl><Input type="number" placeholder="Ej: 101.70" {...field} value={field.value ?? ''} onChange={e => field.onChange(e.target.value === '' ? null : parseFloat(e.target.value) || null)}/></FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}/>
                                    </div>
                                </AccordionContent>
                            </AccordionItem>
                            <AccordionItem value="base-schedule">
                                <AccordionTrigger className="text-lg font-semibold">Horario Semanal Base (Lunes a Domingo)</AccordionTrigger>
                                <AccordionContent className="space-y-4 pt-2">
                                    {DAYS_OF_WEEK.map((day) => {
                                        const dayId = day.id as DayOfWeekIdConst;
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
                                <AccordionTrigger className="text-lg font-semibold">
                                    Registrar Excepciones (Descansos, Turnos Especiales, Traslados)
                                </AccordionTrigger>
                                <AccordionContent className="space-y-4 pt-2">
                                <div className="flex items-center justify-between">
                                    <h4 className="text-md font-semibold mb-2">
                                        Excepciones para {format(overrideDisplayDate, 'MMMM yyyy', { locale: es })}
                                    </h4>
                                    <div className="flex items-center justify-center gap-2">
                                        <Button type="button" variant="ghost" size="icon" className="h-6 w-6" onClick={() => setOverrideDisplayDate(prev => subMonths(prev, 1))}>
                                            <ChevronLeft className="h-4 w-4" />
                                        </Button>
                                        <span className="text-sm font-medium text-muted-foreground capitalize">{format(overrideDisplayDate, 'MMMM yyyy', { locale: es })}</span>
                                        <Button type="button" variant="ghost" size="icon" className="h-6 w-6" onClick={() => setOverrideDisplayDate(prev => addMonths(prev, 1))}>
                                            <ChevronRight className="h-4 w-4" />
                                        </Button>
                                    </div>
                                </div>
                                
                                <div className="space-y-2">
                                {groupedExceptions.length > 0 ? (
                                    groupedExceptions.map((group) => (
                                        <div key={group.id} className="p-3 border rounded-lg space-y-1 relative bg-muted/50">
                                            <Button type="button" variant="ghost" size="icon" className="absolute top-1 right-1 h-7 w-7" onClick={() => handleRemoveGroup(group)}>
                                                <Trash2 className="h-4 w-4 text-destructive" />
                                            </Button>
                                            <div className="font-semibold text-sm flex items-center gap-2">
                                                {group.overrideType === 'descanso' ? <Bed size={16} className="text-cyan-600"/> : group.overrideType === 'traslado' ? <BriefcaseIcon size={16} className="text-purple-600"/> : <Clock size={16} className="text-blue-600" />}
                                                <Badge variant="outline" className="capitalize">{group.overrideType.replace('_', ' ')}</Badge>
                                            </div>
                                            <p className="text-sm">
                                                {isSameDay(group.startDate, group.endDate)
                                                    ? format(group.startDate, "PPP", { locale: es })
                                                    : `Del ${format(group.startDate, "d 'de' LLL", { locale: es })} al ${format(group.endDate, "d 'de' LLL, yyyy", { locale: es })}`
                                                }
                                            </p>
                                            {group.overrideType !== 'descanso' && (
                                                <p className="text-xs text-muted-foreground">{group.startTime} - {group.endTime}</p>
                                            )}
                                            {group.locationId && <p className="text-xs text-muted-foreground">Sede: {locations.find(l => l.id === group.locationId)?.name}</p>}
                                            {group.notes && <p className="text-xs text-muted-foreground italic">Nota: {group.notes}</p>}
                                        </div>
                                    ))
                                ) : (
                                    <p className="text-sm text-muted-foreground text-center py-4">No hay excepciones para {format(overrideDisplayDate, 'MMMM yyyy', { locale: es })}.</p>
                                )}
                                </div>

                                <div className="flex gap-2">
                                    <Button type="button" variant="outline" size="sm" className="mt-4" onClick={() => appendCustomSchedule({ id: generateId(), date: startOfMonth(overrideDisplayDate), overrideType: 'descanso', notes: 'Descanso' })}>
                                    <PlusCircle className="mr-2 h-4 w-4" /> Agregar Excepción Manual
                                    </Button>
                                    <Button type="button" variant="secondary" size="sm" className="mt-4" onClick={() => setIsVacationModalOpen(true)}>
                                    <Layers className="mr-2 h-4 w-4" /> Registrar Ausencia por Período
                                    </Button>
                                </div>
                                </AccordionContent>
                            </AccordionItem>
                        </Accordion>
                        <div className="flex justify-end gap-2 pt-6">
                            <Button type="button" variant="outline" onClick={() => router.push('/professionals')}>Cancelar</Button>
                            <Button type="submit" disabled={form.formState.isSubmitting}>
                                {form.formState.isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                <Save className="mr-2 h-4 w-4" />
                                Guardar Profesional
                            </Button>
                        </div>
                        </form>
                    </Form>
                </CardContent>
            </Card>

            <VacationFormDialog
                isOpen={isVacationModalOpen}
                onClose={() => setIsVacationModalOpen(false)}
                onSave={(range, reason) => {
                    if (!range.from || !range.to) {
                        toast({ title: "Fechas inválidas", description: "Por favor seleccione un rango de fechas válido.", variant: "destructive"});
                        return;
                    }
                    if (isAfter(range.from, range.to)) {
                        toast({ title: "Rango inválido", description: "La fecha de inicio no puede ser posterior a la fecha de fin.", variant: "destructive"});
                        return;
                    }
                    const allDatesInRange = eachDayOfInterval({ start: range.from, end: range.to });
                    const newOverrides = allDatesInRange.map(date => ({
                        id: generateId(),
                        date: date,
                        overrideType: 'descanso' as const,
                        notes: reason || 'Ausencia programada',
                    }));

                    const existingOverrides = form.getValues('customScheduleOverrides') || [];
                    const overridesOutsideRange = existingOverrides.filter(ov => {
                        const ovDate = startOfDay(ov.date);
                        return !(ovDate >= startOfDay(range.from!) && ovDate <= startOfDay(range.to!));
                    });
                    
                    replaceCustomSchedule([...overridesOutsideRange, ...newOverrides]);

                    toast({ title: "Ausencia Registrada", description: `Se agregaron ${newOverrides.length} días de descanso.` });
                    setIsVacationModalOpen(false);
                }}
            />
        </div>
    );
}


interface VacationFormDialogProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (range: DateRange, reason: string) => void;
}
  
function VacationFormDialog({ isOpen, onClose, onSave }: VacationFormDialogProps) {
      const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
      const [reason, setReason] = useState("");
      const { toast } = useToast();
  
      const handleSave = () => {
          if (dateRange && dateRange.from && dateRange.to) {
              onSave(dateRange, reason);
              onClose();
              setDateRange(undefined);
              setReason("");
          } else {
               toast({ title: "Selección Incompleta", description: "Por favor, seleccione un rango de fechas (inicio y fin).", variant: "destructive"});
          }
      };
  
      return (
          <Dialog open={isOpen} onOpenChange={onClose}>
              <DialogContent>
                  <DialogHeader>
                      <DialogTitle>Registrar Ausencia por Período</DialogTitle>
                      <DialogDescription>
                          Seleccione el rango de fechas en que el profesional estará ausente. Se crearán excepciones de "Descanso" para cada día.
                      </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                      <div className="flex justify-center">
                          <Calendar
                              mode="range"
                              selected={dateRange}
                              onSelect={setDateRange}
                              numberOfMonths={1}
                          />
                      </div>
                      <div>
                          <Label htmlFor="absence-reason">Razón de la Ausencia (Opcional)</Label>
                          <Input 
                              id="absence-reason" 
                              value={reason}
                              onChange={(e) => setReason(e.target.value)}
                              placeholder="Ej: Vacaciones, Licencia"
                          />
                      </div>
                  </div>
                  <DialogFooter>
                      <Button variant="outline" onClick={onClose}>Cancelar</Button>
                      <Button onClick={handleSave}>Guardar Período de Ausencia</Button>
                  </DialogFooter>
              </DialogContent>
          </Dialog>
      );
}

