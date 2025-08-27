

"use client";

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Users, Calendar, Plane, Sun, Star, Loader2, GripVertical, ChevronLeft, ChevronRight, MoveVertical, Edit2 } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getProfessionals, getContractDisplayStatus, getLocations, getProfessionalAvailabilityForDate, updateProfessional } from '@/lib/data';
import type { Professional, Location, LocationId, ProfessionalFormData } from '@/types';
import { useAuth } from '@/contexts/auth-provider';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
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
type NameBadgeStatus = 'working' | 'resting' | 'vacation' | 'cover';

interface NameBadgeProps {
  name: string;
  status: NameBadgeStatus;
  professionalId: string;
}

// --- Components ---
const NameBadge = ({ name, status, professionalId }: NameBadgeProps) => {
  const colorClasses: Record<NameBadgeStatus, string> = {
    working: 'bg-white text-gray-800 border border-gray-200',
    resting: 'bg-yellow-300 text-yellow-900 font-semibold',
    vacation: 'bg-orange-400 text-white font-semibold',
    cover: 'bg-green-200 text-green-900 font-semibold',
  };
  return <div className={cn('p-1 text-sm rounded-sm text-center', colorClasses[status])}>{name}</div>;
};

// --- Page Component ---
export default function RotationsPage() {
  const { user } = useAuth();
  const [allProfessionals, setAllProfessionals] = useState<Professional[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [viewDate, setViewDate] = useState(new Date());
  const [isDragAndDropEnabled, setIsDragAndDropEnabled] = useState(false);
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
        return status === 'Activo' || status === 'Próximo a Vencer';
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

  const getProfessionalsForShift = useCallback((professionals: Professional[], day: Date, shift: Shift): NameBadgeProps[] => {
    const { start: shiftStartHour, end: shiftEndHour } = shiftTimes[shift];

    return professionals.map(prof => {
      const availability = getProfessionalAvailabilityForDate(prof, day);
      if (availability?.isWorking && availability.startTime) {
        const workStartHour = parseInt(availability.startTime.split(':')[0], 10);
        
        if (workStartHour >= shiftStartHour && workStartHour < shiftEndHour) {
          let status: NameBadgeStatus = 'working';
          if (availability.reason && availability.reason.toLowerCase().includes('traslado')) {
             status = 'cover';
           } else if (availability.reason && availability.reason.toLowerCase().includes('turno especial')) {
             status = 'cover';
           }
          return { name: prof.firstName, status, professionalId: prof.id };
        }
      }
      return null;
    }).filter((item): item is NameBadgeProps => item !== null);
  }, [shiftTimes]);
  
  const getRestingProfessionalsForDay = useCallback((professionals: Professional[], day: Date): NameBadgeProps[] => {
      return professionals.map(prof => {
          const availability = getProfessionalAvailabilityForDate(prof, day);
          if (!availability || !availability.isWorking) {
              const reason = availability?.reason || 'Descansa';
              let status: NameBadgeStatus = 'resting';
              if (reason.toLowerCase().includes('vacaciones')) {
                 status = 'vacation';
              }
              return { name: prof.firstName, status, professionalId: prof.id };
          }
          return null;
      }).filter((item): item is NameBadgeProps => item !== null);
  }, []);

  const handleDragStart = (e: React.DragEvent<HTMLDivElement>, professionalId: string, day: Date) => {
    if (!isDragAndDropEnabled) return;
    e.dataTransfer.setData("application/json", JSON.stringify({ professionalId, day: day.toISOString() }));
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    if (!isDragAndDropEnabled) return;
    e.preventDefault();
  };

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>, day: Date, newShift: Shift) => {
    if (!isDragAndDropEnabled) return;
    e.preventDefault();
    try {
      const data = JSON.parse(e.dataTransfer.getData("application/json"));
      const { professionalId } = data;
      const professional = allProfessionals.find(p => p.id === professionalId);
      
      if (!professional) return;

      const newStartTime = shiftTimes[newShift].display;
      
      const availability = getProfessionalAvailabilityForDate(professional, day);
      if (!availability || !availability.isWorking || !availability.endTime) {
        toast({ title: "Acción no permitida", description: "No se puede mover un profesional que no está trabajando este día.", variant: "destructive"});
        return;
      }

      // Find if an override already exists for this day
      const existingOverrideIndex = (professional.customScheduleOverrides || []).findIndex(
        ov => startOfDay(new Date(ov.date)).getTime() === startOfDay(day).getTime()
      );

      const updatedOverrides = [...(professional.customScheduleOverrides || [])];

      if (existingOverrideIndex > -1) {
        // Update existing override
        updatedOverrides[existingOverrideIndex] = {
          ...updatedOverrides[existingOverrideIndex],
          overrideType: 'turno_especial',
          startTime: newStartTime,
          // We keep the old endTime
        };
      } else {
        // Create new override
        const newOverride = {
          id: `override_${Date.now()}`,
          date: formatISO(day, { representation: 'date'}),
          overrideType: 'turno_especial' as const,
          startTime: newStartTime,
          endTime: availability.endTime, // Use existing end time
          isWorking: true,
          notes: "Ajuste de turno visual"
        };
        updatedOverrides.push(newOverride as any); // Type assertion needed here
      }

      const updatePayload: Partial<ProfessionalFormData> = {
        customScheduleOverrides: updatedOverrides.map(ov => ({...ov, date: new Date(ov.date)}))
      };
      
      await updateProfessional(professional.id, updatePayload);
      toast({ title: "Horario Actualizado", description: `El turno de ${professional.firstName} se movió a las ${newStartTime}.`});
      loadAllData(); // Refresh all data to reflect the change
      
    } catch (error) {
      console.error("Error on drop:", error);
      toast({ title: "Error", description: "No se pudo actualizar el horario.", variant: "destructive"});
    }
  };

  return (
    <div className="container mx-auto py-8 px-4 md:px-0 space-y-8">
      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle className="text-3xl flex items-center gap-2">
            <Calendar className="text-primary" />
            Gestión de Rotaciones y Descansos
          </CardTitle>
          <CardDescription>
            Visualización de los grupos de trabajo, turnos y descansos del personal.
          </CardDescription>
        </CardHeader>
      </Card>
      
      <Card>
        <CardHeader>
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div>
                  <CardTitle className="text-xl">Planificador Semanal Visual (Higuereta)</CardTitle>
                   <CardDescription>
                      Semana del {format(displayedWeek.start, "d 'de' LLLL", {locale: es})} al {format(addDays(displayedWeek.start, 6), "d 'de' LLLL 'de' yyyy", {locale: es})}.
                  </CardDescription>
              </div>
              <div className="flex items-center gap-2">
                  <div className="flex items-center space-x-2">
                    <Switch
                      id="drag-drop-switch"
                      checked={isDragAndDropEnabled}
                      onCheckedChange={setIsDragAndDropEnabled}
                    />
                    <Label htmlFor="drag-drop-switch" className="text-xs flex items-center gap-1">
                      <Edit2 className="h-4 w-4" /> Mover Horarios
                    </Label>
                  </div>
                  <Button variant="outline" size="icon" onClick={() => setViewDate(prev => addDays(prev, -7))}><ChevronLeft/></Button>
                  <Button variant="outline" size="sm" onClick={() => setViewDate(new Date())}>Esta Semana</Button>
                  <Button variant="outline" size="icon" onClick={() => setViewDate(prev => addDays(prev, 7))}><ChevronRight/></Button>
              </div>
            </div>
        </CardHeader>
        <CardContent>
            {isLoading ? <div className="flex justify-center p-8"><Loader2 className="h-10 w-10 animate-spin"/></div> :
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
                                    const professionalsAtLocation = allProfessionals.filter(p => p.locationId === 'higuereta');
                                    const professionalsInSlot = getProfessionalsForShift(professionalsAtLocation, day, time);
                                    return (
                                        <TableCell 
                                          key={`${day.toISOString()}-${time}`} 
                                          className="p-1 align-top h-24 border border-gray-300"
                                          onDragOver={handleDragOver}
                                          onDrop={(e) => handleDrop(e, day, time)}
                                        >
                                            <div className="space-y-1">
                                                {professionalsInSlot.map((item, index) => (
                                                  <div
                                                    key={index}
                                                    draggable={isDragAndDropEnabled}
                                                    onDragStart={(e) => handleDragStart(e, item.professionalId, day)}
                                                    className={cn(isDragAndDropEnabled && "cursor-grab")}
                                                  >
                                                    <NameBadge {...item} />
                                                  </div>
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
                                const professionalsAtLocation = allProfessionals.filter(p => p.locationId === 'higuereta');
                                const restingProfessionals = getRestingProfessionalsForDay(professionalsAtLocation, day);
                                 return (
                                     <TableCell key={`resting-${day.toISOString()}`} className="p-1 align-top border-x border-gray-300">
                                         <div className="space-y-1">
                                             {restingProfessionals.map((item, index) => <NameBadge key={index} {...item} />)}
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
                    <div className="flex items-center gap-2"><div className="w-5 h-5 bg-yellow-300 rounded-sm"></div><span>Descanso</span></div>
                    <div className="flex items-center gap-2"><div className="w-5 h-5 bg-green-200 rounded-sm"></div><span>Cubre / Turno Especial</span></div>
                </div>
            </div>
            }
        </CardContent>
      </Card>

    </div>
  );
}
