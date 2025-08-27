

"use client";

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Users, Calendar, Plane, Sun, Star, Loader2, GripVertical, ChevronLeft, ChevronRight, MoveVertical, Edit2, Moon, Coffee, Sunrise, Sunset, Palette } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getProfessionals, getContractDisplayStatus, getLocations, getProfessionalAvailabilityForDate, updateProfessional } from '@/lib/data';
import type { Professional, Location, LocationId, ProfessionalFormData } from '@/types';
import { useAuth } from '@/contexts/auth-provider';
import { useAppState } from '@/contexts/app-state-provider';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubTrigger, DropdownMenuSubContent } from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { format, startOfWeek, endOfWeek, addDays, eachDayOfInterval, getHours, parse, getDay, startOfDay } from 'date-fns';
import { es } from 'date-fns/locale';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { formatISO } from 'date-fns/formatISO';

// --- Data Structures ---
interface VacationInfo {
  nombre: string;
  periodo: string;
  regreso: string;
  estado?: string;
}

// --- Helper Types & Enums ---
type Shift = '9am' | '10am' | '11am' | '12:30pm';
type NameBadgeStatus = 'working' | 'resting' | 'vacation' | 'cover' | 'transfer';

interface NameBadgeProps {
  name: string;
  status: NameBadgeStatus;
  professionalId: string;
  onDoubleClick: (event: React.MouseEvent) => void;
}

// --- Components ---
const NameBadge = ({ name, status, professionalId, onDoubleClick }: NameBadgeProps) => {
  const colorClasses: Record<NameBadgeStatus, string> = {
    working: 'bg-white text-gray-800 border border-gray-200',
    resting: 'bg-cyan-200 text-cyan-900 font-semibold',
    vacation: 'bg-orange-400 text-white font-semibold',
    cover: 'bg-green-200 text-green-900 font-semibold',
    transfer: 'bg-purple-200 text-purple-900 font-semibold',
  };
  return <div className={cn('p-1 text-sm rounded-sm text-center', colorClasses[status])} onDoubleClick={onDoubleClick}>{name}</div>;
};

// --- Page Component ---
export default function RotationsPage() {
  const { user } = useAuth();
  const { selectedLocationId } = useAppState();
  const [allProfessionals, setAllProfessionals] = useState<Professional[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [isLoading, setIsLoading] = useState(true);

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
        const status = getContractDisplayStatus(prof.currentContract);
        return (status === 'Activo' || status === 'Próximo a Vencer');
      });

      setAllProfessionals(activeProfs);
      setLocations(allLocations);
    } catch (error) {
      console.error("Error loading initial rotation data:", error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAllData();
  }, [loadAllData]);
  
  const shiftTimes: Record<Shift, { start: number; end: number, display: string }> = {
    '9am': { start: 9, end: 10, display: '09:00' },
    '10am': { start: 10, end: 11, display: '10:00' },
    '11am': { start: 11, end: 12, display: '11:00' },
    '12:30pm': { start: 12, end: 13, display: '12:30' },
  };

  const getProfessionalsForShift = useCallback((day: Date, shift: Shift): Omit<NameBadgeProps, 'onDoubleClick'>[] => {
    if (!selectedLocationId || selectedLocationId === 'all') return [];

    const { start: shiftStartHour, end: shiftEndHour } = shiftTimes[shift];

    return allProfessionals.map(prof => {
      const availability = getProfessionalAvailabilityForDate(prof, day);

      if (availability?.isWorking && availability.workingLocationId === selectedLocationId && availability.startTime) {
        const workStartHour = parseInt(availability.startTime.split(':')[0], 10);
        
        if (workStartHour >= shiftStartHour && workStartHour < shiftEndHour) {
          let status: NameBadgeStatus = 'working';
          const isTransfer = prof.locationId !== availability.workingLocationId;
          const isSpecialShift = availability.reason?.toLowerCase().includes('especial');

          if (isTransfer) {
            status = 'transfer';
          } else if (isSpecialShift) {
             status = 'cover';
          }

          return { name: prof.firstName, status, professionalId: prof.id };
        }
      }
      return null;
    }).filter((item): item is Omit<NameBadgeProps, 'onDoubleClick'> => item !== null);
  }, [allProfessionals, selectedLocationId, shiftTimes]);
  
  const getRestingProfessionalsForDay = useCallback((day: Date): Omit<NameBadgeProps, 'onDoubleClick'>[] => {
      if (!selectedLocationId || selectedLocationId === 'all') return [];

      return allProfessionals
        .filter(prof => {
            return prof.locationId === selectedLocationId;
        })
        .map(prof => {
          const availability = getProfessionalAvailabilityForDate(prof, day);
          if (!availability || !availability.isWorking || availability.workingLocationId !== selectedLocationId) {
              const reason = availability?.reason || 'Descansa';
              let status: NameBadgeStatus = 'resting';
              if (reason.toLowerCase().includes('vacaciones')) {
                 status = 'vacation';
              }
              return { name: prof.firstName, status, professionalId: prof.id };
          }
          return null;
      }).filter((item): item is Omit<NameBadgeProps, 'onDoubleClick'> => item !== null);
  }, [allProfessionals, selectedLocationId]);

  const handleAction = async (professionalId: string, day: Date, action: 'rest' | 'vacation' | 'special_shift' | 'transfer', details?: { locationId?: LocationId, startTime?: string, endTime?: string }) => {
    const professional = allProfessionals.find(p => p.id === professionalId);
    if (!professional) return;
    
    const dateISO = formatISO(day, { representation: 'date' });
    const existingOverrideIndex = (professional.customScheduleOverrides || []).findIndex(
      ov => startOfDay(new Date(ov.date)).getTime() === startOfDay(day).getTime()
    );

    let updatedOverrides = [...(professional.customScheduleOverrides || [])];

    const createOrUpdateOverride = (type: 'descanso' | 'turno_especial' | 'traslado', notes: string) => {
        const newOverride = {
            id: `override_${Date.now()}`,
            date: dateISO,
            overrideType: type,
            isWorking: type !== 'descanso',
            startTime: type === 'descanso' ? undefined : details?.startTime,
            endTime: type === 'descanso' ? undefined : details?.endTime,
            locationId: type === 'traslado' ? details?.locationId : undefined,
            notes: notes
        };
        if (existingOverrideIndex > -1) {
            updatedOverrides[existingOverrideIndex] = { ...updatedOverrides[existingOverrideIndex], ...newOverride };
        } else {
            updatedOverrides.push(newOverride as any);
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
        customScheduleOverrides: updatedOverrides.map(ov => ({...ov, date: new Date(ov.date)}))
      };
      await updateProfessional(professional.id, updatePayload);
      toast({ title: "Horario Actualizado", description: `Se actualizó el estado de ${professional.firstName} para el ${format(day, 'PPPP', {locale: es})}.`});
      loadAllData(); // Refresh all data to reflect changes
    } catch (error) {
      console.error("Error updating schedule:", error);
      toast({ title: "Error", description: "No se pudo actualizar el horario.", variant: "destructive"});
    }
  };

  const handleClearException = async (professionalId: string, day: Date) => {
    const professional = allProfessionals.find(p => p.id === professionalId);
    if (!professional) return;
    
    const updatedOverrides = (professional.customScheduleOverrides || []).filter(
      ov => startOfDay(new Date(ov.date)).getTime() !== startOfDay(day).getTime()
    );

    try {
      const updatePayload: Partial<ProfessionalFormData> = {
        customScheduleOverrides: updatedOverrides.map(ov => ({...ov, date: new Date(ov.date)}))
      };
       await updateProfessional(professional.id, updatePayload);
       toast({ title: "Horario Restaurado", description: `Se eliminó la excepción para ${professional.firstName} el ${format(day, 'PPPP', {locale: es})}.`});
       loadAllData();
    } catch (error) {
       console.error("Error clearing exception:", error);
       toast({ title: "Error", description: "No se pudo restaurar el horario base.", variant: "destructive"});
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
                        {(Object.keys(shiftTimes) as Shift[]).map(time => (
                             <TableRow key={time}>
                                <TableCell className="font-bold text-center align-middle bg-blue-100 border border-gray-300">{shiftTimes[time].display}</TableCell>
                                {displayedWeek.days.map(day => {
                                    const professionalsInSlot = getProfessionalsForShift(day, time);
                                    return (
                                        <TableCell 
                                          key={`${day.toISOString()}-${time}`} 
                                          className="p-1 align-top h-24 border border-gray-300"
                                        >
                                            <div className="space-y-1">
                                                {professionalsInSlot.map((item, index) => (
                                                    <DropdownMenu key={`${item.professionalId}-${index}`}>
                                                        <DropdownMenuTrigger asChild>
                                                            <div className="cursor-pointer">
                                                                <NameBadge {...item} onDoubleClick={() => {}} />
                                                            </div>
                                                        </DropdownMenuTrigger>
                                                        <DropdownMenuContent>
                                                          <DropdownMenuSub>
                                                            <DropdownMenuSubTrigger>Turno Especial</DropdownMenuSubTrigger>
                                                            <DropdownMenuSubContent>
                                                              <DropdownMenuItem onClick={() => handleAction(item.professionalId, day, 'special_shift', { startTime: '09:00', endTime: '18:00' })}>09:00 - 18:00</DropdownMenuItem>
                                                              <DropdownMenuItem onClick={() => handleAction(item.professionalId, day, 'special_shift', { startTime: '10:00', endTime: '19:00' })}>10:00 - 19:00</DropdownMenuItem>
                                                            </DropdownMenuSubContent>
                                                          </DropdownMenuSub>
                                                           <DropdownMenuSub>
                                                              <DropdownMenuSubTrigger>Traslado a Sede</DropdownMenuSubTrigger>
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
                                                          <DropdownMenuItem className="text-destructive" onClick={() => handleClearException(item.professionalId, day)}>Limpiar Excepción</DropdownMenuItem>
                                                        </DropdownMenuContent>
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
                             {displayedWeek.days.map(day => {
                                const restingProfessionals = getRestingProfessionalsForDay(day);
                                 return (
                                     <TableCell key={`resting-${day.toISOString()}`} className="p-1 align-top border-x border-gray-300">
                                         <div className="space-y-1">
                                             {restingProfessionals.map((item, index) => (
                                                <DropdownMenu key={`${item.professionalId}-${index}`}>
                                                    <DropdownMenuTrigger asChild>
                                                        <div className="cursor-pointer">
                                                            <NameBadge {...item} onDoubleClick={() => {}} />
                                                        </div>
                                                    </DropdownMenuTrigger>
                                                    <DropdownMenuContent>
                                                      <DropdownMenuSub>
                                                        <DropdownMenuSubTrigger>Asignar Turno Especial</DropdownMenuSubTrigger>
                                                        <DropdownMenuSubContent>
                                                          <DropdownMenuItem onClick={() => handleAction(item.professionalId, day, 'special_shift', { startTime: '09:00', endTime: '18:00' })}>09:00 - 18:00</DropdownMenuItem>
                                                          <DropdownMenuItem onClick={() => handleAction(item.professionalId, day, 'special_shift', { startTime: '10:00', endTime: '19:00' })}>10:00 - 19:00</DropdownMenuItem>
                                                        </DropdownMenuSubContent>
                                                      </DropdownMenuSub>
                                                      <DropdownMenuSeparator />
                                                      <DropdownMenuItem className="text-destructive" onClick={() => handleClearException(item.professionalId, day)}>Limpiar Excepción</DropdownMenuItem>
                                                    </DropdownMenuContent>
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
