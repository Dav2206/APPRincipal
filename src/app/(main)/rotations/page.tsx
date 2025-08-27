

"use client";

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Users, Calendar, Plane, Sun, Star, Loader2, GripVertical, ChevronLeft, ChevronRight } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getProfessionals, getContractDisplayStatus, getLocations, getProfessionalAvailabilityForDate } from '@/lib/data';
import type { Professional, Location, LocationId } from '@/types';
import { useAuth } from '@/contexts/auth-provider';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { format, startOfWeek, endOfWeek, addDays, eachDayOfInterval, getHours, parse, getDay } from 'date-fns';
import { es } from 'date-fns/locale';

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
}

// --- Components ---
const NameBadge = ({ name, status }: NameBadgeProps) => {
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
  const [activeProfessionals, setActiveProfessionals] = useState<Professional[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [viewDate, setViewDate] = useState(new Date());

  const displayedWeek = useMemo(() => {
      const start = startOfWeek(viewDate, { weekStartsOn: 1 }); // Monday
      const days = eachDayOfInterval({ start, end: addDays(start, 6) }); // Mon-Sun
      return { start, days };
  }, [viewDate]);

  useEffect(() => {
    async function loadInitialData() {
      setIsLoading(true);
      try {
        const [allProfs, allLocations] = await Promise.all([getProfessionals(), getLocations()]);
        
        const activeProfs = allProfs.filter(prof => {
          const status = getContractDisplayStatus(prof.currentContract);
          return status === 'Activo' || status === 'Próximo a Vencer';
        });

        setActiveProfessionals(activeProfs);
        setLocations(allLocations);
      } catch (error) {
        console.error("Error loading initial rotation data:", error);
      } finally {
        setIsLoading(false);
      }
    }
    loadInitialData();
  }, []);

 const getProfessionalsForShift = (professionals: Professional[], day: Date, shift: Shift): NameBadgeProps[] => {
    const shiftHours: Record<Shift, { start: number; end: number }> = {
      '9am': { start: 9, end: 10 },
      '10am': { start: 10, end: 11 },
      '11am': { start: 11, end: 12 },
      '12:30pm': { start: 12, end: 13 },
    };
    const { start: shiftStartHour, end: shiftEndHour } = shiftHours[shift];

    return professionals.map(prof => {
      const availability = getProfessionalAvailabilityForDate(prof, day);
      if (availability?.isWorking && availability.startTime) {
        const workStartHour = parseInt(availability.startTime.split(':')[0], 10);
        
        if (workStartHour >= shiftStartHour && workStartHour < shiftEndHour) {
          if (availability.reason && availability.reason.toLowerCase().includes('traslado')) {
             return { name: prof.firstName, status: 'cover' };
           }
          return { name: prof.firstName, status: 'working' };
        }
      }
      return null;
    }).filter((item): item is NameBadgeProps => item !== null);
  };
  
  const getRestingProfessionalsForDay = (professionals: Professional[], day: Date): NameBadgeProps[] => {
      return professionals.map(prof => {
          const availability = getProfessionalAvailabilityForDate(prof, day);
          if (!availability || !availability.isWorking) {
              const reason = availability?.reason || 'Descansa';
              if (reason.toLowerCase().includes('vacaciones')) {
                 return { name: prof.firstName, status: 'vacation' };
              }
              return { name: prof.firstName, status: 'resting' };
          }
          return null;
      }).filter((item): item is NameBadgeProps => item !== null);
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
            <div className="flex items-center justify-between">
              <div>
                  <CardTitle className="text-xl">Planificador Semanal Visual (Higuereta)</CardTitle>
                   <CardDescription>
                      Vista de la semana del {format(displayedWeek.start, "d 'de' LLLL", {locale: es})} al {format(addDays(displayedWeek.start, 6), "d 'de' LLLL 'de' yyyy", {locale: es})}.
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
            <div className="border rounded-lg overflow-x-auto">
                <Table className="min-w-max border-collapse">
                    <TableHeader>
                        <TableRow className="bg-blue-100">
                            <TableHead className="w-[100px] text-center font-bold text-base border border-gray-300 align-middle">HORA</TableHead>
                            {displayedWeek.days.map(day => (
                                <TableHead key={day.toISOString()} className="w-[180px] text-center font-bold text-base capitalize border border-gray-300 align-middle">
                                    {format(day, "EEEE", {locale: es})}
                                </TableHead>
                            ))}
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {(['9am', '10am', '11am', '12:30pm'] as Shift[]).map(time => (
                             <TableRow key={time}>
                                <TableCell className="font-bold text-center align-middle bg-blue-100 border border-gray-300">{time}</TableCell>
                                {displayedWeek.days.map(day => {
                                    const professionalsAtLocation = activeProfessionals.filter(p => p.locationId === 'higuereta');
                                    const professionalsInSlot = getProfessionalsForShift(professionalsAtLocation, day, time);
                                    return (
                                        <TableCell key={`${day.toISOString()}-${time}`} className="p-1 align-top h-24 border border-gray-300">
                                            <div className="space-y-1">
                                                {professionalsInSlot.map((item, index) => <NameBadge key={index} {...item} />)}
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
                                const professionalsAtLocation = activeProfessionals.filter(p => p.locationId === 'higuereta');
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
