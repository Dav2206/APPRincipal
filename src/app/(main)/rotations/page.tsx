

"use client";

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Users, Calendar, Plane, Sun, Star, Loader2, GripVertical, ChevronLeft, ChevronRight, MoveVertical, Edit2, Moon, Coffee, Sunrise, Sunset, Palette, MousePointerClick, RefreshCcw } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getProfessionals, getContractDisplayStatus, getLocations, getProfessionalAvailabilityForDate, updateProfessional } from '@/lib/data';
import type { Professional, Location, LocationId, ProfessionalFormData } from '@/types';
import { useAuth } from '@/contexts/auth-provider';
import { useAppState } from '@/contexts/app-state-provider';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubTrigger, DropdownMenuSubContent, DropdownMenuPortal } from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { format, startOfWeek, endOfWeek, addDays, eachDayOfInterval, getHours, parse, getDay, startOfDay, parseISO, formatISO as dateFnsFormatISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { type DayOfWeekId, DAYS_OF_WEEK } from '@/lib/constants';

// --- Data Structures ---
interface VacationInfo {
  nombre: string;
  periodo: string;
  regreso: string;
  estado?: string;
}

// --- Helper Types & Enums ---
type Shift = '9am' | '10am' | '10:30am' | '11am' | '12:30pm';
type NameBadgeStatus = 'working' | 'resting' | 'vacation' | 'cover' | 'transfer';

interface NameBadgeProps {
  name: string;
  status: NameBadgeStatus;
  professionalId: string;
}


const NameBadge = ({ name, status }: Omit<NameBadgeProps, 'professionalId'>) => {
   const colorClasses: Record<NameBadgeStatus, string> = {
    working: 'bg-white text-gray-800 border border-gray-200',
    resting: 'bg-cyan-200 text-cyan-900 font-semibold',
    vacation: 'bg-orange-400 text-white font-semibold',
    cover: 'bg-green-200 text-green-900 font-semibold',
    transfer: 'bg-purple-200 text-purple-900 font-semibold',
  };
  return <div className={cn('p-1 text-sm rounded-sm text-center', colorClasses[status])}>{name}</div>;
};

// --- Page Component ---
export default function RotationsPage() {
  const { user } = useAuth();
  const { selectedLocationId } = useAppState();
  const [allProfessionals, setAllProfessionals] = useState<Professional[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  const [isDragDropMode, setIsDragDropMode] = useState(false);
  const [draggedItem, setDraggedItem] = useState<{ professionalId: string, shift: Shift } | null>(null);

  const [viewDate, setViewDate] = useState(new Date());
  const { toast } = useToast();

  const displayedWeek = useMemo(() => {
      const start = startOfWeek(viewDate, { weekStartsOn: 1 }); // Monday
      const days = eachDayOfInterval({ start, end: addDays(start, 6) }); // Mon-Sun
      return { start, days };
  }, [viewDate]);

  const loadAllData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [allProfs, allLocations] = await Promise.all([getProfessionals(), getLocations()]);
      
      const activeProfs = allProfs.filter(prof => {
        const status = getContractDisplayStatus(prof.currentContract, viewDate);
        return (status === 'Activo' || status === 'Próximo a Vencer')
      });

      setAllProfessionals(activeProfs);
      setLocations(allLocations);
    } catch (error) {
      console.error("Error loading initial rotation data:", error);
    } finally {
      setIsLoading(false);
    }
  }, [viewDate]);

  useEffect(() => {
    loadAllData();
  }, [loadAllData, viewDate]);

  const shiftTimes: Record<Shift, { start: number; end: number, display: string }> = {
    '9am': { start: 9, end: 10, display: '09:00' },
    '10am': { start: 10, end: 11, display: '10:00' },
    '10:30am': { start: 10.5, end: 11.5, display: '10:30' },
    '11am': { start: 11, end: 12, display: '11:00' },
    '12:30pm': { start: 12.5, end: 13.5, display: '12:30' },
  };

  const shiftsForLocation: Record<LocationId, Shift[]> = {
    'san_antonio': ['9am', '10am', '10:30am'],
    // Define specific shifts for other locations if needed, otherwise they use the default
    'higuereta': ['9am', '10am', '11am', '12:30pm'],
    'eden_benavides': ['9am', '10am', '11am', '12:30pm'],
    'crucetas': ['9am', '10am', '11am', '12:30pm'],
    'carpaccio': ['9am', '10am', '11am', '12:30pm'],
    'vista_alegre': ['9am', '10am', '11am', '12:30pm'],
  };

  const displayedShifts = useMemo(() => {
    if (selectedLocationId && selectedLocationId !== 'all' && shiftsForLocation[selectedLocationId]) {
      return shiftsForLocation[selectedLocationId];
    }
    // Default shifts if no location is selected or if it's not in the specific map
    return ['9am', '10am', '11am', '12:30pm'];
  }, [selectedLocationId]);


  const getProfessionalsForShift = useCallback((day: Date, shift: Shift): NameBadgeProps[] => {
    if (!selectedLocationId || selectedLocationId === 'all') return [];

    const shiftStartTime = shiftTimes[shift].display; // "HH:mm"

    return allProfessionals
        .map(prof => {
            const availability = getProfessionalAvailabilityForDate(prof, day);
            
            if (availability?.isWorking && availability.workingLocationId === selectedLocationId && availability.startTime === shiftStartTime) {
                let status: NameBadgeStatus = 'working';
                const isTransfer = prof.locationId !== availability.workingLocationId;
                const isSpecialShift = availability.reason && availability.reason !== 'Horario base';

                if (isTransfer) {
                    status = 'transfer';
                } else if (isSpecialShift && !availability.reason?.toLowerCase().includes('vacaciones')) {
                    status = 'cover';
                }
                return { name: prof.firstName, status, professionalId: prof.id };
            }
            return null;
        })
        .filter((item): item is NameBadgeProps => item !== null);
  }, [allProfessionals, selectedLocationId, shiftTimes]);
  
  const getRestingProfessionalsForDay = useCallback((day: Date): NameBadgeProps[] => {
    if (!selectedLocationId || selectedLocationId === 'all') return [];

    return allProfessionals
      .map(prof => {
          // Check if the professional's base location is the one being viewed
          if (prof.locationId === selectedLocationId) {
             const availability = getProfessionalAvailabilityForDate(prof, day);
             // Show as resting if they are NOT working, OR if they are working but transferred to another location
             if (!availability || !availability.isWorking || (availability.isWorking && availability.workingLocationId !== selectedLocationId)) {
                let status: NameBadgeStatus = 'resting';
                if (availability?.reason?.toLowerCase().includes('vacaciones')) {
                    status = 'vacation';
                }
                return { name: prof.firstName, status, professionalId: prof.id };
             }
          }
          return null;
      }).filter((item): item is NameBadgeProps => item !== null);
  }, [allProfessionals, selectedLocationId]);


  const handleAction = async (professionalId: string, day: Date, action: 'rest' | 'vacation' | 'special_shift' | 'transfer', details?: { locationId?: LocationId, startTime?: string, endTime?: string }) => {
    const professional = allProfessionals.find(p => p.id === professionalId);
    if (!professional) return;
    
    // Correctly format the date to avoid timezone issues
    const dateISO = format(day, "yyyy-MM-dd'T'12:00:00.000'Z'");
    
    const existingOverrideIndex = (professional.customScheduleOverrides || []).findIndex(
      ov => format(parseISO(ov.date), 'yyyy-MM-dd') === format(parseISO(dateISO), 'yyyy-MM-dd')
    );

    let updatedOverrides = [...(professional.customScheduleOverrides || [])];

    const createOrUpdateOverride = (type: 'descanso' | 'turno_especial' | 'traslado', notes: string) => {
        const newOverride: any = {
            id: existingOverrideIndex > -1 ? updatedOverrides[existingOverrideIndex].id : `override_${Date.now()}`,
            date: dateISO,
            overrideType: type,
            isWorking: type !== 'descanso',
            startTime: type === 'descanso' ? undefined : details?.startTime,
            endTime: type === 'descanso' ? undefined : details?.endTime,
            locationId: type === 'traslado' ? details?.locationId : undefined,
            notes: notes
        };
        if (existingOverrideIndex > -1) {
            updatedOverrides[existingOverrideIndex] = newOverride;
        } else {
            updatedOverrides.push(newOverride);
        }
    };
    
    switch(action) {
        case 'rest':
            createOrUpdateOverride('descanso', 'Descanso Asignado');
            break;
        case 'vacation':
            createOrUpdateOverride('descanso', 'Vacaciones');
            break;
        case 'special_shift':
            createOrUpdateOverride('turno_especial', `Turno Especial ${details?.startTime}-${details?.endTime}`);
            break;
        case 'transfer':
             createOrUpdateOverride('traslado', `Traslado a ${locations.find(l => l.id === details?.locationId)?.name}`);
            break;
    }
    
    try {
      const updatePayload: Partial<ProfessionalFormData> = {
        customScheduleOverrides: updatedOverrides.map(ov => ({
          ...ov,
          // When sending to DB, ensure date is just the string
          date: format(parseISO(ov.date), 'yyyy-MM-dd'),
        }) as any)
      };
      await updateProfessional(professional.id, updatePayload);
      toast({ title: "Horario Actualizado", description: `Se actualizó el estado de ${professional.firstName} para el ${format(day, 'PPPP', {locale: es})}.`});
      loadAllData(); // Refresh all data to reflect changes
    } catch (error) {
      console.error("Error updating schedule:", error);
      toast({ title: "Error", description: "No se pudo actualizar el horario.", variant: "destructive"});
    }
  };

  const handleUpdateBaseSchedule = async (professionalId: string, dayOfWeek: DayOfWeekId, newStartTime: string, newEndTime: string) => {
    const professional = allProfessionals.find(p => p.id === professionalId);
    if (!professional) return;
  
    // Create a deep copy of the entire work schedule to avoid mutation issues
    const newWorkSchedule = JSON.parse(JSON.stringify(professional.workSchedule || {}));
  
    // Ensure all days of the week are initialized
    DAYS_OF_WEEK.forEach(day => {
      if (!newWorkSchedule[day.id]) {
        newWorkSchedule[day.id] = { isWorking: false, startTime: "00:00", endTime: "00:00" };
      }
    });
  
    // Update only the specific day
    newWorkSchedule[dayOfWeek] = {
      isWorking: true,
      startTime: newStartTime,
      endTime: newEndTime,
    };
  
    try {
      await updateProfessional(professional.id, { workSchedule: newWorkSchedule });
      
      const dayName = DAYS_OF_WEEK.find(d => d.id === dayOfWeek)?.name || 'día de la semana';
      toast({
        title: "Horario Base Actualizado",
        description: `El horario de ${professional.firstName} para los ${dayName} ha sido actualizado a ${newStartTime} - ${newEndTime}.`,
      });
      await loadAllData(); // Await the data refresh to ensure UI is up-to-date
    } catch (error) {
      console.error("Error updating base schedule:", error);
      toast({ title: "Error", description: "No se pudo actualizar el horario base.", variant: "destructive"});
    }
};


  const handleClearException = async (professionalId: string, day: Date) => {
    const professional = allProfessionals.find(p => p.id === professionalId);
    if (!professional) return;
    
    const dateToClear = format(day, 'yyyy-MM-dd');
    const updatedOverrides = (professional.customScheduleOverrides || []).filter(
      ov => format(parseISO(ov.date), 'yyyy-MM-dd') !== dateToClear
    );

    try {
      const updatePayload: Partial<ProfessionalFormData> = {
        customScheduleOverrides: updatedOverrides.map(ov => ({...ov, date: format(parseISO(ov.date), 'yyyy-MM-dd')}) as any)
      };
       await updateProfessional(professional.id, updatePayload);
       toast({ title: "Horario Restaurado", description: `Se eliminó la excepción para ${professional.firstName} el ${format(day, 'PPPP', {locale: es})}.`});
       loadAllData();
    } catch (error) {
       console.error("Error clearing exception:", error);
       toast({ title: "Error", description: "No se pudo restaurar el horario base.", variant: "destructive"});
    }
  };

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>, newStartTime: Shift, day: Date) => {
    e.preventDefault();
    if (!isDragDropMode) return;
    try {
      const { professionalId, shift } = JSON.parse(e.dataTransfer.getData("application/json"));
      if (shift === newStartTime) return; // No change
      
      const newShiftDetails = shiftTimes[newStartTime];
      const endTime = format(addDays(parse(newShiftDetails.display, 'HH:mm', new Date()), 0), 'HH:mm'); 

      const endHour = parseInt(newShiftDetails.display.split(':')[0],10) + 9;
      const finalEndTime = `${endHour.toString().padStart(2,'0')}:${newShiftDetails.display.split(':')[1]}`;


      await handleAction(professionalId, day, 'special_shift', { startTime: newShiftDetails.display, endTime: finalEndTime });

    } catch (error) {
      console.error("Error handling drop:", error);
    }
  };

  const currentViewLocationName = useMemo(() => {
    if (!selectedLocationId || selectedLocationId === 'all') return null;
    return locations.find(l => l.id === selectedLocationId)?.name;
  }, [selectedLocationId, locations]);


  return (
    <div className="container mx-auto py-8 px-4 md:px-0 space-y-8">
      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle className="text-3xl flex items-center gap-2">
            <Calendar className="text-primary" />
            Gestión de Rotaciones y Descansos
          </CardTitle>
          <CardDescription>
            Visualización de los grupos de trabajo, turnos y descansos del personal por sede.
          </CardDescription>
        </CardHeader>
      </Card>
      
      <Card>
        <CardHeader>
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div>
                  <CardTitle className="text-xl">Planificador Semanal Visual ({currentViewLocationName || 'Seleccione Sede'})</CardTitle>
                   <CardDescription>
                      Semana del {format(displayedWeek.start, "d 'de' LLLL", {locale: es})} al {format(addDays(displayedWeek.start, 6), "d 'de' LLLL 'de' yyyy", {locale: es})}.
                  </CardDescription>
              </div>
              <div className="flex items-center gap-2">
                  <Button variant="outline" size="icon" onClick={() => setViewDate(prev => addDays(prev, -7))}><ChevronLeft/></Button>
                  <Button variant="outline" size="sm" onClick={() => setViewDate(new Date())}>Esta Semana</Button>
                  <Button variant="outline" size="icon" onClick={() => setViewDate(prev => addDays(prev, 7))}><ChevronRight/></Button>
              </div>
            </div>
        </CardHeader>
        <CardContent>
            {isLoading ? <div className="flex justify-center p-8"><Loader2 className="h-10 w-10 animate-spin"/></div> :
             !currentViewLocationName ? <div className="text-center py-10 text-muted-foreground">Por favor, seleccione una sede específica desde el menú superior para ver el planificador.</div> :
            <div className="border rounded-lg overflow-x-auto">
                <Table className="min-w-max border-collapse">
                    <TableHeader>
                        <TableRow className="bg-blue-100">
                            <TableHead className="w-[100px] text-center font-bold text-base border border-gray-300 align-middle">HORA</TableHead>
                            {displayedWeek.days.map(day => (
                                <TableHead key={day.toISOString()} className="w-[180px] text-center font-bold text-base capitalize border border-gray-300 align-middle">
                                    {format(day, "EEEE d", {locale: es})}
                                </TableHead>
                            ))}
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {displayedShifts.map(time => (
                             <TableRow key={time}>
                                <TableCell className="font-bold text-center align-middle bg-blue-100 border border-gray-300">{shiftTimes[time].display}</TableCell>
                                {displayedWeek.days.map(day => {
                                    const professionalsInSlot = getProfessionalsForShift(day, time);
                                    const dayOfWeekId = DAYS_OF_WEEK[(getDay(day) + 6) % 7].id;
                                    return (
                                        <TableCell key={`${day.toISOString()}-${time}`} className="p-1 align-top h-24 border border-gray-300">
                                            <div className="space-y-1">
                                                {professionalsInSlot.map((item, index) => (
                                                    <DropdownMenu key={`${item.professionalId}-${index}`}>
                                                        <DropdownMenuTrigger asChild>
                                                            <div onDoubleClick={(e) => e.preventDefault()} className="cursor-pointer">
                                                                <NameBadge {...item} />
                                                            </div>
                                                        </DropdownMenuTrigger>
                                                        <DropdownMenuPortal>
                                                          <DropdownMenuContent>
                                                            <DropdownMenuSub>
                                                                <DropdownMenuSubTrigger>Cambiar Horario (Solo este día)</DropdownMenuSubTrigger>
                                                                <DropdownMenuSubContent>
                                                                    <DropdownMenuItem onClick={() => handleAction(item.professionalId, day, 'special_shift', { startTime: '09:00', endTime: '18:00' })}>09:00 - 18:00</DropdownMenuItem>
                                                                    <DropdownMenuItem onClick={() => handleAction(item.professionalId, day, 'special_shift', { startTime: '10:00', endTime: '19:00' })}>10:00 - 19:00</DropdownMenuItem>
                                                                    <DropdownMenuItem onClick={() => handleAction(item.professionalId, day, 'special_shift', { startTime: '10:30', endTime: '19:30' })}>10:30 - 19:30</DropdownMenuItem>
                                                                    <DropdownMenuItem onClick={() => handleAction(item.professionalId, day, 'special_shift', { startTime: '11:00', endTime: '20:00' })}>11:00 - 20:00</DropdownMenuItem>
                                                                    <DropdownMenuItem onClick={() => handleAction(item.professionalId, day, 'special_shift', { startTime: '12:30', endTime: '21:30' })}>12:30 - 21:30</DropdownMenuItem>
                                                                </DropdownMenuSubContent>
                                                            </DropdownMenuSub>
                                                            <DropdownMenuSub>
                                                                <DropdownMenuSubTrigger>Actualizar Horario Base (Semanal)</DropdownMenuSubTrigger>
                                                                <DropdownMenuSubContent>
                                                                     <DropdownMenuItem onClick={() => handleUpdateBaseSchedule(item.professionalId, dayOfWeekId, '09:00', '18:00')}>09:00 - 18:00</DropdownMenuItem>
                                                                     <DropdownMenuItem onClick={() => handleUpdateBaseSchedule(item.professionalId, dayOfWeekId, '10:00', '19:00')}>10:00 - 19:00</DropdownMenuItem>
                                                                     <DropdownMenuItem onClick={() => handleUpdateBaseSchedule(item.professionalId, dayOfWeekId, '10:30', '19:30')}>10:30 - 19:30</DropdownMenuItem>
                                                                     <DropdownMenuItem onClick={() => handleUpdateBaseSchedule(item.professionalId, dayOfWeekId, '11:00', '20:00')}>11:00 - 20:00</DropdownMenuItem>
                                                                     <DropdownMenuItem onClick={() => handleUpdateBaseSchedule(item.professionalId, dayOfWeekId, '12:30', '21:30')}>12:30 - 21:30</DropdownMenuItem>
                                                                </DropdownMenuSubContent>
                                                            </DropdownMenuSub>
                                                            <DropdownMenuSub>
                                                                <DropdownMenuSubTrigger>Trasladar a Sede (Solo este día)</DropdownMenuSubTrigger>
                                                                <DropdownMenuSubContent>
                                                                    {locations.filter(l => l.id !== selectedLocationId).map(loc => (
                                                                        <DropdownMenuItem key={loc.id} onClick={() => handleAction(item.professionalId, day, 'transfer', { locationId: loc.id, startTime: '10:00', endTime: '19:00' })}>{loc.name}</DropdownMenuItem>
                                                                    ))}
                                                                </DropdownMenuSubContent>
                                                            </DropdownMenuSub>
                                                            <DropdownMenuSeparator />
                                                            <DropdownMenuItem onClick={() => handleAction(item.professionalId, day, 'rest')}>Marcar Descanso</DropdownMenuItem>
                                                            <DropdownMenuItem onClick={() => handleAction(item.professionalId, day, 'vacation')}>Marcar Vacaciones</DropdownMenuItem>
                                                            <DropdownMenuSeparator />
                                                            <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => handleClearException(item.professionalId, day)}><RefreshCcw className="mr-2 h-4 w-4" />Limpiar Excepción</DropdownMenuItem>
                                                          </DropdownMenuContent>
                                                        </DropdownMenuPortal>
                                                    </DropdownMenu>
                                                ))}
                                            </div>
                                        </TableCell>
                                    );
                                })}
                            </TableRow>
                        ))}
                         <TableRow>
                            <TableCell className="font-bold text-center align-middle bg-blue-100 border-y border-gray-300" colSpan={8}>Descansos del Día</TableCell>
                         </TableRow>
                         <TableRow>
                             <TableCell colSpan={1} className="border-r border-gray-300"></TableCell>
                             {displayedWeek.days.map((day) => {
                               const restingProfessionals = getRestingProfessionalsForDay(day);
                               return (
                                 <TableCell key={`resting-${day.toISOString()}`} className="p-1 align-top border-x border-gray-300">
                                   <div className="space-y-1">
                                     {restingProfessionals.map((item, index) => (
                                       <DropdownMenu key={`${item.professionalId}-${index}`}>
                                         <DropdownMenuTrigger asChild>
                                           <div onDoubleClick={(e) => e.preventDefault()} className="cursor-pointer">
                                             <NameBadge {...item} />
                                           </div>
                                         </DropdownMenuTrigger>
                                         <DropdownMenuPortal>
                                           <DropdownMenuContent>
                                             <DropdownMenuSub>
                                               <DropdownMenuSubTrigger>Asignar Turno Especial (Solo este día)</DropdownMenuSubTrigger>
                                               <DropdownMenuSubContent>
                                                 <DropdownMenuItem onClick={() => handleAction(item.professionalId, day, 'special_shift', { startTime: '09:00', endTime: '18:00' })}>09:00 - 18:00</DropdownMenuItem>
                                                 <DropdownMenuItem onClick={() => handleAction(item.professionalId, day, 'special_shift', { startTime: '10:00', endTime: '19:00' })}>10:00 - 19:00</DropdownMenuItem>
                                                 <DropdownMenuItem onClick={() => handleAction(item.professionalId, day, 'special_shift', { startTime: '10:30', endTime: '19:30' })}>10:30 - 19:30</DropdownMenuItem>
                                               </DropdownMenuSubContent>
                                             </DropdownMenuSub>
                                             <DropdownMenuSeparator />
                                             <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => handleClearException(item.professionalId, day)}><RefreshCcw className="mr-2 h-4 w-4" />Limpiar Excepción</DropdownMenuItem>
                                           </DropdownMenuContent>
                                         </DropdownMenuPortal>
                                       </DropdownMenu>
                                     ))}
                                   </div>
                                 </TableCell>
                               );
                             })}
                        </TableRow>
                    </TableBody>
                </Table>
                 <div className="p-4 mt-4 flex items-center gap-6 text-sm">
                    <h4 className="font-bold">Leyenda:</h4>
                    <div className="flex items-center gap-2"><div className="w-5 h-5 bg-orange-400 rounded-sm"></div><span>Vacaciones</span></div>
                    <div className="flex items-center gap-2"><div className="w-5 h-5 bg-cyan-200 rounded-sm"></div><span>Descanso</span></div>
                    <div className="flex items-center gap-2"><div className="w-5 h-5 bg-purple-200 rounded-sm"></div><span>Traslado</span></div>
                    <div className="flex items-center gap-2"><div className="w-5 h-5 bg-green-200 rounded-sm"></div><span>Cubre / Turno Especial</span></div>
                </div>
            </div>
            }
        </CardContent>
      </Card>

    </div>
  );
}

