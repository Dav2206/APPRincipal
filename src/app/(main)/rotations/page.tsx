
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
import { format, startOfWeek, endOfWeek, addDays, eachDayOfInterval, getHours } from 'date-fns';
import { es } from 'date-fns/locale';

// --- Data Structures ---
interface RotationGroup {
  id: string;
  name: string;
  professionals: Professional[];
}

interface VacationInfo {
  nombre: string;
  periodo: string;
  regreso: string;
  estado?: string;
}

// --- Initial Data (will be part of state now) ---
const initialDomingosDataHiguereta = [
    { fecha: "29-Jun", feriado: true, grupo: 1, encargada: 'Isabel' },
    { fecha: "6-Jul", feriado: false, grupo: 1, encargada: 'Liz' },
    { fecha: "13-Jul", feriado: false, grupo: 2, encargada: 'Gloria' },
    { fecha: "20-Jul", feriado: false, grupo: 1, encargada: 'Victoria' },
    { fecha: "27-Jul", feriado: false, grupo: 2, encargada: 'Victoria vino por Leydi' },
    { fecha: "3-Ago", feriado: false, grupo: 1, encargada: 'Leydi' },
    { fecha: "10-Ago", feriado: false, grupo: 2, encargada: 'Pilar' },
    { fecha: "17-Ago", feriado: false, grupo: 1, encargada: 'Victoria vino por Angela' },
    { fecha: "24-Ago", feriado: false, grupo: 2, encargada: 'Lucila' },
    { fecha: "31-Ago", feriado: false, grupo: 1, encargada: 'Heiddy' },
    { fecha: "7-Set", feriado: false, grupo: 2, encargada: 'Lucy' },
    { fecha: "14-Set", feriado: false, grupo: 1, encargada: 'Glady' },
    { fecha: "21-Set", feriado: false, grupo: 2, encargada: 'Rossy' },
    { fecha: "5-Oct", feriado: false, grupo: 2, encargada: '' },
    { fecha: "12-Oct", feriado: false, grupo: 1, encargada: '' },
    { fecha: "19-Oct", feriado: false, grupo: 2, encargada: '' },
];

const feriadosGrupo1 = ['PILAR', 'ISABEL', 'HEIDDY', 'GLORIA', 'LUCILA'];
const feriadosGrupo2 = ['ANGELA', 'LIZ', 'LEYDI', 'VICTORIA', 'LUCY'];

const initialDomingosDataSanAntonio = [
  { fecha: "7-Set", grupo: 1 },
  { fecha: "14-Set", grupo: 2 },
  { fecha: "21-Set", grupo: 3 },
  { fecha: "28-Set", grupo: 1 },
  { fecha: "5-Oct", grupo: 2 },
  { fecha: "12-Oct", grupo: 3 },
  { fecha: "19-Oct", grupo: 1 },
  { fecha: "26-Oct", grupo: 2 },
  { fecha: "2-Nov", grupo: 3 },
  { fecha: "9-Nov", grupo: 1 },
  { fecha: "16-Nov", grupo: 2 },
  { fecha: "23-Nov", grupo: 3 },
];

const vacaciones: VacationInfo[] = [
  { nombre: 'CARMEN', periodo: '02/05 - 08/05 (7dias)', regreso: '' },
  { nombre: 'LEYDI', periodo: '08/05 - 22/05 (15dias)', regreso: '' },
  { nombre: 'ISABEL', periodo: '30/06 - 05/07 (6dias)', regreso: '6-Jul' },
  { nombre: 'ISABEL', periodo: '09/10 - 17/10 (8dias)', regreso: '18-Oct', estado: 'PENDIENTE' },
  { nombre: 'LIZ', periodo: '25/07 - 31/07 (7dias)', regreso: '9-Ago', estado: 'Pendiente 8 dias' },
  { nombre: 'GLORIA', periodo: '30/07 - 13/08 (15dias)', regreso: '14-Ago' },
  { nombre: 'PILAR', periodo: '16/08 - 31/08 (15dias)', regreso: '1-Set' },
  { nombre: 'ANGELA', periodo: '18/07 - 24/07 (7 dias)', regreso: 'se le compró sus vacaciones' },
  { nombre: 'ANGELA', periodo: '08/10 - 15/10 (8dias)', regreso: '16-Oct', estado: 'PENDIENTE' },
  { nombre: 'LUCILA', periodo: '01/09 - 15/09 (15dias)', regreso: '16-Set' },
  { nombre: 'VICTORIA', periodo: '06/09 - 20/09 (15dias)', regreso: '21-Set' },
  { nombre: 'LUCY', periodo: '16/09 - 30/09 (15dias)', regreso: '1-Oct' },
  { nombre: 'HEIDDY', periodo: '', regreso: '' },
];


// --- Helper Types & Enums ---
type Shift = 'morning1' | 'morning2' | 'afternoon1' | 'afternoon2';

interface NameBadgeProps {
  name: string;
  status: 'working' | 'resting' | 'vacation' | 'cover';
}

// --- Components ---
const NameBadge = ({ name, status }: NameBadgeProps) => {
  const colorClasses = {
    working: 'bg-white text-gray-800',
    resting: 'bg-yellow-300 text-yellow-900',
    vacation: 'bg-orange-400 text-white',
    cover: 'bg-green-200 text-green-900',
  };
  return <div className={cn('p-1 text-sm font-semibold rounded-md', colorClasses[status])}>{name}</div>;
};

// --- Page Component ---
export default function RotationsPage() {
  const { user } = useAuth();
  const [activeProfessionals, setActiveProfessionals] = useState<Professional[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [rotationGroups, setRotationGroups] = useState<Record<LocationId, RotationGroup[]>>({} as Record<LocationId, RotationGroup[]>);
  const [unassignedProfessionals, setUnassignedProfessionals] = useState<Record<LocationId, Professional[]>>({} as Record<LocationId, Professional[]>);

  const [domingosHiguereta, setDomingosHiguereta] = useState(initialDomingosDataHiguereta);
  const [domingosSanAntonio, setDomingosSanAntonio] = useState(initialDomingosDataSanAntonio);

  const [viewDate, setViewDate] = useState(new Date());

  const displayedWeek = useMemo(() => {
      const start = startOfWeek(viewDate, { weekStartsOn: 1 }); // Monday
      return { start, days: eachDayOfInterval({ start, end: addDays(start, 6) }) };
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
        
        // Initialize rotation groups and unassigned professionals for each location
        const initialGroups: Record<LocationId, RotationGroup[]> = {} as Record<LocationId, RotationGroup[]>;
        const initialUnassigned: Record<LocationId, Professional[]> = {} as Record<LocationId, Professional[]>;
        
        allLocations.forEach(loc => {
            const groupCount = loc.id === 'san_antonio' ? 3 : 2;
            initialGroups[loc.id] = Array.from({ length: groupCount }, (_, i) => ({
                id: `g${i + 1}`, name: `Grupo ${i + 1}`, professionals: []
            }));
            initialUnassigned[loc.id] = activeProfs.filter(p => p.locationId === loc.id);
        });

        setRotationGroups(initialGroups);
        setUnassignedProfessionals(initialUnassigned);

      } catch (error) {
        console.error("Error loading initial rotation data:", error);
      } finally {
        setIsLoading(false);
      }
    }
    loadInitialData();
  }, []);

  const getProfessionalsForShift = (professionals: Professional[], day: Date, shift: Shift): NameBadgeProps[] => {
    const shiftHours = {
      morning1: { start: 9, end: 10 },
      morning2: { start: 10, end: 11 },
      afternoon1: { start: 11, end: 12.5 },
      afternoon2: { start: 12.5, end: 14 },
    };
    const { start: shiftStartHour, end: shiftEndHour } = shiftHours[shift];

    return professionals.map(prof => {
      const availability = getProfessionalAvailabilityForDate(prof, day);
      if (availability?.isWorking && availability.startTime && availability.endTime) {
        const workStartHour = parseInt(availability.startTime.split(':')[0], 10);
        const workEndHour = parseInt(availability.endTime.split(':')[0], 10);

        if (workStartHour < shiftEndHour && workEndHour >= shiftStartHour) {
          return { name: prof.firstName, status: 'working' };
        }
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
            Visualización de los grupos de trabajo para domingos, feriados y gestión de vacaciones del personal.
          </CardDescription>
        </CardHeader>
      </Card>
      
      <Card>
        <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                  <CardTitle className="text-xl">Planificador Semanal Visual</CardTitle>
                  <CardDescription>
                      Vista de la semana del {format(displayedWeek.start, "d 'de' LLLL", {locale: es})} al {format(addDays(displayedWeek.start, 6), "d 'de' LLLL", {locale: es})}.
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
                <Table className="min-w-max">
                    <TableHeader>
                        <TableRow>
                            <TableHead className="w-[100px] text-center font-semibold text-base">HORA</TableHead>
                            {displayedWeek.days.map(day => (
                                <TableHead key={day.toISOString()} className="w-[180px] text-center font-semibold text-base capitalize">
                                    {format(day, "EEEE", {locale: es})}<br/>
                                    <span className="text-sm font-normal">{format(day, "dd/MM")}</span>
                                </TableHead>
                            ))}
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {['9am', '10am', '11am', '12:30pm'].map(time => (
                             <TableRow key={time}>
                                <TableCell className="font-bold text-center align-middle bg-muted/50">{time}</TableCell>
                                {displayedWeek.days.map(day => {
                                    const professionalsAtLocation = activeProfessionals.filter(p => p.locationId === 'higuereta');
                                    let professionalsInSlot: NameBadgeProps[] = [];

                                    if (time === '9am') professionalsInSlot = getProfessionalsForShift(professionalsAtLocation, day, 'morning1');
                                    else if (time === '10am') professionalsInSlot = getProfessionalsForShift(professionalsAtLocation, day, 'morning2');
                                    else if (time === '11am') professionalsInSlot = getProfessionalsForShift(professionalsAtLocation, day, 'afternoon1');
                                    else if (time === '12:30pm') professionalsInSlot = getProfessionalsForShift(professionalsAtLocation, day, 'afternoon2');

                                    return (
                                        <TableCell key={day.toISOString()} className="p-1 align-top h-24">
                                            <div className="space-y-1">
                                                {professionalsInSlot.length > 0 ? 
                                                    professionalsInSlot.map((item, index) => <NameBadge key={index} {...item} />) : 
                                                    (<div className="text-center text-muted-foreground text-xs p-2">--</div>)
                                                }
                                            </div>
                                        </TableCell>
                                    );
                                })}
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </div>
            }
        </CardContent>
      </Card>

    </div>
  );
}
