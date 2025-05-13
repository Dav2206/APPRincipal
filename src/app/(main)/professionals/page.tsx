
"use client";

import type { Professional, ProfessionalFormData } from '@/types';
import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/auth-provider';
import { useAppState } from '@/contexts/app-state-provider';
import { getProfessionals, addProfessional, updateProfessional, getProfessionalAvailabilityForDate } from '@/lib/data';
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
import { PlusCircle, Edit2, Briefcase, Search, Loader2, CalendarDays, Clock, Trash2, Calendar as CalendarIconLucide } from 'lucide-react';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ProfessionalFormSchema } from '@/lib/schemas';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';

export default function ProfessionalsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { selectedLocationId: adminSelectedLocation } = useAppState();
  const [professionals, setProfessionals] = useState<Professional[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingProfessional, setEditingProfessional] = useState<Professional | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  const defaultWorkDays = DAYS_OF_WEEK.slice(0, 5).map(day => day.id as DayOfWeekId); // Lunes a Viernes por defecto

  const form = useForm<ProfessionalFormData>({
    resolver: zodResolver(ProfessionalFormSchema),
    defaultValues: {
      firstName: '',
      lastName: '',
      locationId: LOCATIONS[0].id,
      phone: '',
      workDays: defaultWorkDays,
      startTime: '09:00',
      endTime: '17:00',
      customScheduleOverrides: [],
    }
  });

  const { fields: customScheduleFields, append: appendCustomSchedule, remove: removeCustomSchedule } = useFieldArray({
    control: form.control,
    name: "customScheduleOverrides"
  });
  
  const isAdminOrContador = user?.role === USER_ROLES.ADMIN || user?.role === USER_ROLES.CONTADOR;
  const effectiveLocationId = isAdminOrContador
    ? (adminSelectedLocation === 'all' ? undefined : adminSelectedLocation as LocationId) 
    : user?.locationId;


  const fetchProfessionals = useCallback(async () => {
    if(!user || (user.role !== USER_ROLES.ADMIN && user.role !== USER_ROLES.CONTADOR)) {
      setIsLoading(false);
      setProfessionals([]);
      return;
    }
    setIsLoading(true);
    try {
      const data = await getProfessionals(effectiveLocationId);
      setProfessionals(data || []);
    } catch (error) {
      console.error("Failed to fetch professionals:", error);
      setProfessionals([]);
      toast({ title: "Error", description: "No se pudieron cargar los profesionales.", variant: "destructive" });
    }
    setIsLoading(false);
  }, [effectiveLocationId, user, toast]);

  useEffect(() => {
    fetchProfessionals();
  }, [fetchProfessionals]);

  const handleAddProfessional = () => {
    setEditingProfessional(null);
    const defaultLoc = isAdminOrContador
      ? (adminSelectedLocation && adminSelectedLocation !== 'all' ? adminSelectedLocation : LOCATIONS[0].id)
      : user?.locationId;
    
    form.reset({
      firstName: '',
      lastName: '',
      locationId: defaultLoc as LocationId,
      phone: '',
      workDays: defaultWorkDays,
      startTime: '09:00',
      endTime: '17:00',
      customScheduleOverrides: [],
    });
    setIsFormOpen(true);
  };

  const handleEditProfessional = (professional: Professional) => {
    setEditingProfessional(professional);
    
    // Transform workSchedule from object to array of DayOfWeekId for the form
    const formWorkDays: DayOfWeekId[] = [];
    if (professional.workSchedule) {
      for (const day of DAYS_OF_WEEK) {
        if (professional.workSchedule[day.id as DayOfWeekId]) {
          formWorkDays.push(day.id as DayOfWeekId);
        }
      }
    }
    
    // Find a representative startTime/endTime from the workSchedule if available
    let baseStartTime = '09:00';
    let baseEndTime = '17:00';
    if (professional.workSchedule) {
        const firstScheduledDay = DAYS_OF_WEEK.find(d => professional.workSchedule![d.id as DayOfWeekId]);
        if (firstScheduledDay && professional.workSchedule[firstScheduledDay.id as DayOfWeekId]) {
            baseStartTime = professional.workSchedule[firstScheduledDay.id as DayOfWeekId]!.startTime;
            baseEndTime = professional.workSchedule[firstScheduledDay.id as DayOfWeekId]!.endTime;
        }
    }


    form.reset({
        id: professional.id,
        firstName: professional.firstName,
        lastName: professional.lastName,
        locationId: professional.locationId as LocationId, 
        phone: professional.phone || '',
        workDays: formWorkDays.length > 0 ? formWorkDays : defaultWorkDays,
        startTime: baseStartTime,
        endTime: baseEndTime,
        customScheduleOverrides: professional.customScheduleOverrides?.map(ov => ({
            id: ov.id || generateId(), // Ensure ID for useFieldArray key
            date: parseISO(ov.date),
            isWorking: ov.isWorking,
            startTime: ov.startTime || undefined,
            endTime: ov.endTime || undefined,
            notes: ov.notes || undefined,
        })) || [],
    });
    setIsFormOpen(true);
  };
  
  const generateId = () => Math.random().toString(36).substr(2, 9);


  const onSubmit = async (data: ProfessionalFormData) => {
    // Convert form data to Professional type before saving
    const professionalDataToSave: Partial<Professional> = {
        id: data.id,
        firstName: data.firstName,
        lastName: data.lastName,
        locationId: data.locationId,
        phone: data.phone,
        workSchedule: {}, // Initialize as empty object
        customScheduleOverrides: data.customScheduleOverrides?.map(ov => ({
            id: ov.id || generateId(), // Ensure ID
            date: format(ov.date, 'yyyy-MM-dd'), // Convert Date to ISO string
            isWorking: ov.isWorking,
            startTime: ov.isWorking ? ov.startTime : undefined,
            endTime: ov.isWorking ? ov.endTime : undefined,
            notes: ov.notes,
        })),
    };

    // Populate workSchedule from workDays, startTime, endTime
    if (data.workDays && data.startTime && data.endTime) {
        data.workDays.forEach(dayId => {
            if (professionalDataToSave.workSchedule) { // Type guard
                 professionalDataToSave.workSchedule[dayId as DayOfWeekId] = { startTime: data.startTime!, endTime: data.endTime! };
            }
        });
         // Set non-working days to null
        for (const day of DAYS_OF_WEEK) {
            if (professionalDataToSave.workSchedule && !data.workDays.includes(day.id as DayOfWeekId)) {
                 professionalDataToSave.workSchedule[day.id as DayOfWeekId] = null;
            }
        }
    }


    try {
      if (editingProfessional && professionalDataToSave.id) {
        const result = await updateProfessional(professionalDataToSave.id, professionalDataToSave);
        if (result) {
             toast({ title: "Profesional Actualizado", description: `${result.firstName} ${result.lastName} actualizado.` });
        } else {
            toast({ title: "Error", description: `No se pudo actualizar a ${data.firstName}.`, variant: "destructive" });
        }
      } else {
        const newProfessionalDataResult = await addProfessional(professionalDataToSave as Omit<Professional, 'id' | 'biWeeklyEarnings'>);
        toast({ title: "Profesional Agregado", description: `${newProfessionalDataResult.firstName} ${newProfessionalDataResult.lastName} agregado.` });
      }
      setIsFormOpen(false);
      fetchProfessionals();
    } catch (error) {
      toast({ title: "Error", description: "No se pudo guardar el profesional.", variant: "destructive" });
      console.error(error);
    }
  };

  const filteredProfessionals = professionals.filter(p =>
    `${p.firstName} ${p.lastName}`.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (p.phone && p.phone.includes(searchTerm))
  );
  
  const LoadingState = () => (
     <div className="flex flex-col items-center justify-center h-64 col-span-full">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="mt-4 text-muted-foreground">Cargando profesionales...</p>
      </div>
  );
  
  if (!user || (user.role !== USER_ROLES.ADMIN && user.role !== USER_ROLES.CONTADOR)) {
    return (
      <div className="flex h-screen items-center justify-center">
        <p>Acceso no autorizado.</p>
      </div>
    );
  }

  const formatWorkScheduleDisplay = (prof: Professional) => {
    const today = new Date();
    const availability = getProfessionalAvailabilityForDate(prof, today);
    
    if (availability) {
        const dayOfWeek = format(today, 'EEEE', {locale: es});
        return `${dayOfWeek}: ${availability.startTime} - ${availability.endTime}${availability.notes ? ` (${availability.notes})` : ''}`;
    }

    // Fallback to a general weekly schedule if no specific override for today
    if (prof.workSchedule) {
        const activeDays = DAYS_OF_WEEK
            .filter(day => prof.workSchedule![day.id as DayOfWeekId] && prof.workSchedule![day.id as DayOfWeekId]?.startTime)
            .map(day => {
                const schedule = prof.workSchedule![day.id as DayOfWeekId]!;
                return `${day.name.substring(0,3)} (${schedule.startTime}-${schedule.endTime})`;
            });
        if (activeDays.length > 0) return activeDays.join(', ');
    }
    return 'No disponible / Horario no definido';
  }


  return (
    <div className="space-y-6">
      <Card className="shadow-md">
        <CardHeader className="flex flex-col md:flex-row justify-between items-center">
          <div>
            <CardTitle className="text-2xl flex items-center gap-2"><Briefcase className="text-primary"/> Gestión de Profesionales</CardTitle>
            <CardDescription>Ver, agregar o editar información y horarios de los profesionales.</CardDescription>
            {isAdminOrContador && (
              <div className="mt-1 text-sm text-muted-foreground">
                Viendo: {adminSelectedLocation === 'all' ? 'Todas las sedes' : LOCATIONS.find(l => l.id === adminSelectedLocation)?.name || ''}
              </div>
            )}
          </div>
          <Button onClick={handleAddProfessional} className="w-full mt-4 md:mt-0 md:w-auto">
            <PlusCircle className="mr-2 h-4 w-4" /> Agregar Profesional
          </Button>
        </CardHeader>
        <CardContent>
          <div className="mb-4">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                type="search"
                placeholder="Buscar profesionales por nombre o teléfono..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-8 w-full"
              />
            </div>
          </div>
          {isLoading ? <LoadingState/> : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nombre Completo</TableHead>
                  <TableHead className="hidden md:table-cell">Sede</TableHead>
                  <TableHead className="hidden lg:table-cell">Horario (Hoy/General)</TableHead>
                  <TableHead className="hidden xl:table-cell">Teléfono</TableHead>
                   {isAdminOrContador && <TableHead className="hidden xl:table-cell text-right">Ingresos Quincena (S/)</TableHead> }
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredProfessionals.length > 0 ? filteredProfessionals.map(prof => (
                  <TableRow key={prof.id}>
                    <TableCell className="font-medium">{prof.firstName} {prof.lastName}</TableCell>
                    <TableCell className="hidden md:table-cell">{LOCATIONS.find(l => l.id === prof.locationId)?.name}</TableCell>
                    <TableCell className="hidden lg:table-cell text-xs">{formatWorkScheduleDisplay(prof)}</TableCell>
                    <TableCell className="hidden xl:table-cell">{prof.phone || 'N/A'}</TableCell>
                    {isAdminOrContador && <TableCell className="hidden xl:table-cell text-right">{(prof.biWeeklyEarnings ?? 0).toFixed(2)}</TableCell> }
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" onClick={() => handleEditProfessional(prof)}>
                        <Edit2 className="h-4 w-4" /> <span className="sr-only">Editar</span>
                      </Button>
                    </TableCell>
                  </TableRow>
                )) : (
                  <TableRow>
                    <TableCell colSpan={isAdminOrContador ? 6 : 5} className="h-24 text-center"> 
                      No se encontraron profesionales.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingProfessional ? 'Editar' : 'Agregar'} Profesional</DialogTitle>
            <DialogDescription>
                {editingProfessional ? 'Modifique la información y horarios del profesional.' : 'Complete la información para el nuevo profesional.'}
            </DialogDescription>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 py-4 max-h-[80vh] overflow-y-auto pr-2">
              {editingProfessional && <input type="hidden" {...form.register("id")} />}
              
              <CollapsibleSection title="Información Personal">
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
                      <Select onValueChange={field.onChange} value={field.value} disabled={user?.role === USER_ROLES.LOCATION_STAFF}>
                        <FormControl><SelectTrigger><SelectValue placeholder="Seleccionar sede" /></SelectTrigger></FormControl>
                        <SelectContent>{LOCATIONS.map(loc => (<SelectItem key={loc.id} value={loc.id}>{loc.name}</SelectItem>))}</SelectContent>
                      </Select><FormMessage />
                    </FormItem>
                )}/>
                <FormField control={form.control} name="phone" render={({ field }) => (
                    <FormItem className="mt-4"><FormLabel>Teléfono (Opcional)</FormLabel><FormControl><Input type="tel" placeholder="Ej: 987654321" {...field} /></FormControl><FormMessage /></FormItem>
                )}/>
              </CollapsibleSection>

              <CollapsibleSection title="Horario Semanal Base (Opcional)">
                <FormField control={form.control} name="workDays" render={() => (
                  <FormItem>
                    <div className="mb-2"><FormLabel className="text-base flex items-center gap-1"><CalendarDays size={16}/> Días Laborales Base</FormLabel></div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 rounded-md border p-3">
                      {DAYS_OF_WEEK.map((day) => (
                        <FormField key={day.id} control={form.control} name="workDays" render={({ field: workDaysField }) => (
                          <FormItem className="flex flex-row items-start space-x-2 space-y-0">
                            <FormControl>
                              <Checkbox
                                checked={workDaysField.value?.includes(day.id as DayOfWeekId)}
                                onCheckedChange={(checked) => {
                                  const currentWorkDays = workDaysField.value || [];
                                  return checked
                                    ? workDaysField.onChange([...currentWorkDays, day.id as DayOfWeekId])
                                    : workDaysField.onChange(currentWorkDays.filter(value => value !== day.id))
                                }}
                              /></FormControl><FormLabel className="font-normal text-sm">{day.name}</FormLabel></FormItem>
                        )}/>))}
                    </div><FormMessage />
                  </FormItem>
                )}/>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
                  <FormField control={form.control} name="startTime" render={({ field }) => (
                    <FormItem><FormLabel className="flex items-center gap-1"><Clock size={16}/> Hora de Entrada Base</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="HH:MM" /></SelectTrigger></FormControl>
                        <SelectContent>{TIME_SLOTS.map(slot => (<SelectItem key={`start-${slot}`} value={slot}>{slot}</SelectItem>))}</SelectContent>
                      </Select><FormMessage /></FormItem>
                  )}/>
                  <FormField control={form.control} name="endTime" render={({ field }) => (
                    <FormItem><FormLabel className="flex items-center gap-1"><Clock size={16}/> Hora de Salida Base</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="HH:MM" /></SelectTrigger></FormControl>
                        <SelectContent>{TIME_SLOTS.map(slot => (<SelectItem key={`end-${slot}`} value={slot}>{slot}</SelectItem>))}</SelectContent>
                      </Select><FormMessage /></FormItem>
                  )}/>
                </div>
              </CollapsibleSection>

              <CollapsibleSection title="Anulaciones de Horario / Horarios Específicos">
                <div className="space-y-4">
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
                        <FormItem><FormLabel className="text-xs">Notas (Opcional)</FormLabel><FormControl><Textarea placeholder="Ej: Turno especial, Domingo quincenal" {...notesField} value={notesField.value || ''} /></FormControl><FormMessage /></FormItem>
                      )}/>
                    </div>
                  ))}
                </div>
                <Button type="button" variant="outline" size="sm" className="mt-4" onClick={() => appendCustomSchedule({ id: generateId(), date: new Date(), isWorking: true, startTime: '09:00', endTime: '17:00', notes: '' })}>
                  <PlusCircle className="mr-2 h-4 w-4" /> Agregar Horario Específico
                </Button>
              </CollapsibleSection>

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


// Helper Collapsible Section Component
interface CollapsibleSectionProps {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}
const CollapsibleSection: React.FC<CollapsibleSectionProps> = ({ title, children, defaultOpen = true }) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  return (
    <div className="py-3 border-b last:border-b-0">
      <button type="button" className="flex justify-between items-center w-full text-left text-lg font-semibold" onClick={() => setIsOpen(!isOpen)}>
        {title}
        <ChevronIcon isOpen={isOpen} />
      </button>
      {isOpen && <div className="mt-3 space-y-4">{children}</div>}
    </div>
  );
};

const ChevronIcon = ({ isOpen }: { isOpen: boolean }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={cn("transition-transform", isOpen ? "rotate-180" : "")}>
    <polyline points="6 9 12 15 18 9"></polyline>
  </svg>
);

