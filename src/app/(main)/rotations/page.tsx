

"use client";

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Users, Calendar, Plane, Sun, Star, Loader2, GripVertical, ChevronLeft, ChevronRight, MoveVertical, Edit2, Moon, Coffee, Sunrise, Sunset, Palette, MousePointerClick, RefreshCcw, Group, Save, PlusCircle, Shield } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getProfessionals, getContractDisplayStatus, getLocations, getProfessionalAvailabilityForDate, updateProfessional, markDayAsHoliday, saveSundayGroups, saveHolidayGroups } from '@/lib/data';
import type { Professional, Location, LocationId, ProfessionalFormData, SundayGroup, HolidayGroup } from '@/types';
import { useAuth } from '@/contexts/auth-provider';
import { useAppState } from '@/contexts/app-state-provider';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubTrigger, DropdownMenuSubContent, DropdownMenuPortal } from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { format, startOfWeek, endOfWeek, addDays, eachDayOfInterval, getHours, parse, getDay, startOfDay, parseISO, formatISO as dateFnsFormatISO, nextSunday, addMonths, subMonths, isWithinInterval } from 'date-fns';
import { es } from 'date-fns/locale';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { type DayOfWeekId, DAYS_OF_WEEK, USER_ROLES } from '@/lib/constants';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as CalendarComponent } from '@/components/ui/calendar'; // Renamed to avoid conflict
import { Input } from '@/components/ui/input';

// --- Helper Types & Enums ---
type Shift = '9am' | '10am' | '10:30am' | '11am' | '12:30pm';
type NameBadgeStatus = 'working' | 'resting' | 'vacation' | 'cover' | 'transfer';

interface NameBadgeProps {
  name: string;
  status: NameBadgeStatus;
  professionalId: string;
}

interface CompensatoryRestInfo {
    professionalId: string;
    professionalName: string;
    workDate: Date;
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
  const { selectedLocationId: adminSelectedLocation } = useAppState();
  const [allProfessionals, setAllProfessionals] = useState<Professional[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  
  const [viewDate, setViewDate] = useState(new Date());
  const { toast } = useToast();

  const [sundayWorkers, setSundayWorkers] = useState<CompensatoryRestInfo[]>([]);
  const [holidayWorkers, setHolidayWorkers] = useState<CompensatoryRestInfo[]>([]);

  // State for Sunday Groups
  const [sundayGroups, setSundayGroups] = useState<Record<string, SundayGroup>>({});
  const [groupableSundayProfs, setGroupableSundayProfs] = useState<Professional[]>([]);
  const [isSavingSundayGroups, setIsSavingSundayGroups] = useState(false);
  const [editingSundayGroupName, setEditingSundayGroupName] = useState<{ groupId: string; name: string } | null>(null);

  // State for Holiday Groups
  const [holidayGroups, setHolidayGroups] = useState<Record<string, HolidayGroup>>({});
  const [groupableHolidayProfs, setGroupableHolidayProfs] = useState<Professional[]>([]);
  const [isSavingHolidayGroups, setIsSavingHolidayGroups] = useState(false);
  const [editingHolidayGroupName, setEditingHolidayGroupName] = useState<{ groupId: string; name: string } | null>(null);
  const [newHolidayGroupName, setNewHolidayGroupName] = useState("");


  const effectiveLocationId = useMemo(() => {
    if (user?.role === USER_ROLES.ADMIN || user?.role === USER_ROLES.CONTADOR) {
        return adminSelectedLocation === 'all' ? undefined : adminSelectedLocation as LocationId;
    }
    return user?.locationId;
  }, [user, adminSelectedLocation]);


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
        const status = getContractDisplayStatus(prof, viewDate);
        return (status === 'Activo' || status === 'Próximo a Vencer')
      });

      setAllProfessionals(activeProfs);
      setLocations(allLocations);
      
      const currentViewLocation = allLocations.find(l => l.id === effectiveLocationId);
      
      // --- Sunday Groups Logic ---
      if (currentViewLocation && (currentViewLocation.id === 'higuereta' || currentViewLocation.id === 'san_antonio')) {
        const savedSundayGroups = currentViewLocation.sundayGroups || {};
        const initialSundayGroups: Record<string, SundayGroup> = {
            group1: savedSundayGroups.group1 || { name: 'Grupo 1', professionalIds: [] },
            group2: savedSundayGroups.group2 || { name: 'Grupo 2', professionalIds: [] },
            group3: savedSundayGroups.group3 || { name: 'Grupo 3', professionalIds: [] },
            group4: savedSundayGroups.group4 || { name: 'Grupo 4', professionalIds: [] },
        };
        setSundayGroups(initialSundayGroups);

        const profsInSavedSundayGroupsIds = new Set(Object.values(initialSundayGroups).flatMap(g => g.professionalIds));
        const sundayLocationProfs = activeProfs.filter(p => 
            p.locationId === effectiveLocationId || profsInSavedSundayGroupsIds.has(p.id)
        );
        const uniqueSundayProfs = Array.from(new Map(sundayLocationProfs.map(p => [p.id, p])).values());
        setGroupableSundayProfs(uniqueSundayProfs);
      } else {
         setGroupableSundayProfs([]);
         setSundayGroups({});
      }

      // --- Holiday Groups Logic ---
      if (currentViewLocation) {
        const savedHolidayGroups = currentViewLocation.holidayGroups || {};
        setHolidayGroups(savedHolidayGroups);

        const profsInSavedHolidayGroupsIds = new Set(Object.values(savedHolidayGroups).flatMap(g => g.professionalIds));
        const holidayLocationProfs = activeProfs.filter(p => 
            p.locationId === effectiveLocationId || profsInSavedHolidayGroupsIds.has(p.id)
        );
         const uniqueHolidayProfs = Array.from(new Map(holidayLocationProfs.map(p => [p.id, p])).values());
        setGroupableHolidayProfs(uniqueHolidayProfs);
      } else {
        setGroupableHolidayProfs([]);
        setHolidayGroups({});
      }


      if (effectiveLocationId && effectiveLocationId !== 'all') {
            const nextSundayDate = nextSunday(viewDate);
            const workingOnSunday: CompensatoryRestInfo[] = [];
            const workingOnHolidays: CompensatoryRestInfo[] = [];
            const holidaysInWeek = new Set<string>();

            // First pass: identify which days in the week are holidays for the location
            allProfs.forEach(prof => {
                if (prof.locationId === effectiveLocationId) {
                     (prof.customScheduleOverrides || []).forEach(ov => {
                        if(ov.notes === 'Feriado' && isWithinInterval(parseISO(ov.date), {start: displayedWeek.days[0], end: displayedWeek.days[6]})) {
                            holidaysInWeek.add(ov.date);
                        }
                    });
                }
            });

            activeProfs.forEach(prof => {
                // Check for Sunday work
                const availabilityOnSunday = getProfessionalAvailabilityForDate(prof, nextSundayDate);
                if (availabilityOnSunday?.isWorking && availabilityOnSunday.workingLocationId === effectiveLocationId) {
                     workingOnSunday.push({
                        professionalId: prof.id,
                        professionalName: `${prof.firstName} ${prof.lastName}`,
                        workDate: nextSundayDate,
                    });
                }
                // Check for holiday work
                holidaysInWeek.forEach(holidayIsoString => {
                    const holidayDate = parseISO(holidayIsoString);
                    const availabilityOnHoliday = getProfessionalAvailabilityForDate(prof, holidayDate);
                    if (availabilityOnHoliday?.isWorking && availabilityOnHoliday.workingLocationId === effectiveLocationId) {
                         workingOnHolidays.push({
                            professionalId: prof.id,
                            professionalName: `${prof.firstName} ${prof.lastName}`,
                            workDate: holidayDate,
                        });
                    }
                });
            });

            setSundayWorkers(workingOnSunday);
            setHolidayWorkers(workingOnHolidays.filter((value, index, self) => self.findIndex(v => v.professionalId === value.professionalId && v.workDate.getTime() === value.workDate.getTime()) === index)); // Remove duplicates
      } else {
        setSundayWorkers([]);
        setHolidayWorkers([]);
      }


    } catch (error) {
      console.error("Error loading initial rotation data:", error);
    } finally {
      setIsLoading(false);
    }
  }, [viewDate, effectiveLocationId, displayedWeek.days]);

  useEffect(() => {
    loadAllData();
  }, [loadAllData]);

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
    if (effectiveLocationId && effectiveLocationId !== 'all' && shiftsForLocation[effectiveLocationId]) {
      return shiftsForLocation[effectiveLocationId];
    }
    // Default shifts if no location is selected or if it's not in the specific map
    return ['9am', '10am', '11am', '12:30pm'];
  }, [effectiveLocationId]);


  const getProfessionalsForShift = useCallback((day: Date, shift: Shift): NameBadgeProps[] => {
    if (!effectiveLocationId || effectiveLocationId === 'all') return [];

    const shiftStartTime = shiftTimes[shift].display;

    return allProfessionals
      .map(prof => {
        const availability = getProfessionalAvailabilityForDate(prof, day);
        
        // Ensure the professional is working at the currently selected location
        if (availability?.isWorking && availability.workingLocationId === effectiveLocationId && availability.startTime === shiftStartTime) {
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
  }, [allProfessionals, effectiveLocationId, shiftTimes]);
  
 const getRestingProfessionalsForDay = useCallback((day: Date): NameBadgeProps[] => {
    if (!effectiveLocationId || effectiveLocationId === 'all') return [];

    return allProfessionals
      .filter(prof => prof.locationId === effectiveLocationId) // Only consider professionals based in the selected location
      .map(prof => {
         const availability = getProfessionalAvailabilityForDate(prof, day);
         
         // Only show as resting if they are NOT working. This prevents showing them as resting if they are transferred.
         if (availability && !availability.isWorking) {
            let status: NameBadgeStatus = 'resting';
            if (availability.reason?.toLowerCase().includes('vacaciones') || availability.reason?.toLowerCase().includes('feriado')) {
                status = 'vacation';
            }
            return { name: prof.firstName, status, professionalId: prof.id };
         }
         return null;
      }).filter((item): item is NameBadgeProps => item !== null);
  }, [allProfessionals, effectiveLocationId]);


  const handleAction = async (professionalId: string, day: Date, action: 'rest' | 'vacation' | 'special_shift' | 'transfer', details?: { locationId?: LocationId, startTime?: string, endTime?: string, notes?: string }) => {
    const professional = allProfessionals.find(p => p.id === professionalId);
    if (!professional) return;
    
    // Correctly format the date to avoid timezone issues
    const dateISO = format(day, "yyyy-MM-dd");
    
    const existingOverrideIndex = (professional.customScheduleOverrides || []).findIndex(
      ov => format(parseISO(ov.date), 'yyyy-MM-dd') === dateISO
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
            createOrUpdateOverride('descanso', details?.notes || 'Descanso Asignado');
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

  const handleUpdateBaseSchedule = async (professionalId: string, dayOfWeekId: DayOfWeekId, newStartTime: string, newEndTime: string) => {
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
    newWorkSchedule[dayOfWeekId] = {
      isWorking: true,
      startTime: newStartTime,
      endTime: newEndTime,
    };
  
    try {
      await updateProfessional(professional.id, { workSchedule: newWorkSchedule });
      
      const dayName = DAYS_OF_WEEK.find(d => d.id === dayOfWeekId)?.name || 'día de la semana';
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

  const handleMarkAsHoliday = async (day: Date) => {
    setIsProcessing(true);
    toast({title: "Procesando...", description: `Marcando el ${format(day, 'd LLLL', {locale: es})} como feriado.`});
    try {
        const affectedCount = await markDayAsHoliday(day);
        toast({title: "Día Feriado Registrado", description: `Se marcó el día como descanso para ${affectedCount} profesionales activos.`});
        await loadAllData();
    } catch (error) {
        console.error("Error marking day as holiday:", error);
        toast({ title: "Error", description: "No se pudo marcar el día como feriado.", variant: "destructive"});
    } finally {
        setIsProcessing(false);
    }
  };

  const currentViewLocationName = useMemo(() => {
    if (user?.role === USER_ROLES.LOCATION_STAFF) {
        return locations.find(l => l.id === user.locationId)?.name;
    }
    if (!effectiveLocationId || effectiveLocationId === 'all') return null;
    return locations.find(l => l.id === effectiveLocationId)?.name;
  }, [effectiveLocationId, locations, user]);
  
  const handleRestDayChange = async (professionalId: string, dateToUpdate: Date | undefined) => {
    if (dateToUpdate) {
        await handleAction(professionalId, dateToUpdate, 'rest', {notes: 'Descanso compensatorio'});
    } else {
        toast({ variant: 'destructive', title: "Error", description: "No se pudo encontrar la fecha para el día de descanso seleccionado." });
    }
  };
  
  const sundayProfessionalsByGroup = useMemo(() => {
    const inGroups = new Set<string>();
    Object.values(sundayGroups).forEach(group => group.professionalIds.forEach(id => inGroups.add(id)));
    
    const assigned = new Map<string, Professional[]>();
    Object.entries(sundayGroups).forEach(([groupId, groupData]) => {
      const profs = groupData.professionalIds.map(id => groupableSundayProfs.find(p => p.id === id)).filter((p): p is Professional => !!p);
      assigned.set(groupId, profs);
    });

    const unassigned = groupableSundayProfs.filter(p => !inGroups.has(p.id));
    return { assigned, unassigned };
  }, [sundayGroups, groupableSundayProfs]);


  const handleMoveSundayProfessional = (profId: string, toGroupId: string | null) => {
      const newGroups = JSON.parse(JSON.stringify(sundayGroups));
      
      for (const groupId in newGroups) {
          const group = newGroups[groupId];
          group.professionalIds = group.professionalIds.filter((id: string) => id !== profId);
      }

      if (toGroupId && newGroups[toGroupId]) {
          if (!newGroups[toGroupId].professionalIds.includes(profId)) {
              newGroups[toGroupId].professionalIds.push(profId);
          }
      }
      setSundayGroups(newGroups);
  };
  
  const handleAddExternalToSundayGroup = (prof: Professional) => {
    if (!groupableSundayProfs.some(p => p.id === prof.id)) {
        setGroupableSundayProfs(prev => [...prev, prof]);
    }
    toast({title: "Profesional Añadido", description: `${prof.firstName} ${prof.lastName} ahora está disponible para agrupar.`});
  };

  const handleSundayGroupNameChange = (groupId: string, newName: string) => {
    setEditingSundayGroupName({ groupId, name: newName });
  };
  
  const handleSaveSundayGroupName = (groupId: string) => {
    if (editingSundayGroupName && editingSundayGroupName.groupId === groupId) {
      const trimmedName = editingSundayGroupName.name.trim();
      if (trimmedName) {
        setSundayGroups(prev => ({
          ...prev,
          [groupId]: { ...prev[groupId], name: trimmedName }
        }));
      }
      setEditingSundayGroupName(null);
    }
  };
  
  const handleSaveSundayGroups = async () => {
    if (!effectiveLocationId || effectiveLocationId === 'all') {
        toast({title: "Error", description: "Seleccione una sede específica para guardar los grupos.", variant: "destructive"});
        return;
    }
    setIsSavingSundayGroups(true);
    try {
        await saveSundayGroups(effectiveLocationId, sundayGroups);
        toast({title: "Grupos Guardados", description: "La configuración de los grupos dominicales ha sido guardada."});
    } catch (error) {
        toast({title: "Error al Guardar", description: "No se pudo guardar la configuración de los grupos.", variant: "destructive"});
        console.error("Error saving sunday groups:", error);
    } finally {
        setIsSavingSundayGroups(false);
    }
  };

  // --- Holiday Group Logic ---
  const holidayProfessionalsByGroup = useMemo(() => {
    const inGroups = new Set<string>();
    Object.values(holidayGroups).forEach(group => group.professionalIds.forEach(id => inGroups.add(id)));

    const assigned = new Map<string, Professional[]>();
    Object.entries(holidayGroups).forEach(([groupId, groupData]) => {
      const profs = groupData.professionalIds.map(id => groupableHolidayProfs.find(p => p.id === id)).filter((p): p is Professional => !!p);
      assigned.set(groupId, profs);
    });

    const unassigned = groupableHolidayProfs.filter(p => !inGroups.has(p.id));
    return { assigned, unassigned };
  }, [holidayGroups, groupableHolidayProfs]);

  const handleMoveHolidayProfessional = (profId: string, toGroupId: string | null) => {
    setHolidayGroups(prevGroups => {
      const newGroups = JSON.parse(JSON.stringify(prevGroups));
      for (const groupId in newGroups) {
        const group = newGroups[groupId];
        group.professionalIds = group.professionalIds.filter((id: string) => id !== profId);
      }
      if (toGroupId && newGroups[toGroupId]) {
        if (!newGroups[toGroupId].professionalIds.includes(profId)) {
          newGroups[toGroupId].professionalIds.push(profId);
        }
      }
      return newGroups;
    });
  };

  const handleAddExternalToHolidayGroup = (prof: Professional) => {
    if (!groupableHolidayProfs.some(p => p.id === prof.id)) {
      setGroupableHolidayProfs(prev => [...prev, prof]);
    }
    toast({ title: "Profesional Añadido", description: `${prof.firstName} ${prof.lastName} ahora está disponible para agrupar en feriados.` });
  };
  
  const handleAddNewHolidayGroup = () => {
    const name = newHolidayGroupName.trim();
    if (name && !Object.values(holidayGroups).some(g => g.name.toLowerCase() === name.toLowerCase())) {
        const newGroupId = `group_${Date.now()}`;
        setHolidayGroups(prev => ({
            ...prev,
            [newGroupId]: { name: name, professionalIds: [] }
        }));
        setNewHolidayGroupName("");
    } else {
        toast({title: "Nombre inválido o duplicado", variant: "default"})
    }
  };

  const handleDeleteHolidayGroup = (groupId: string) => {
    setHolidayGroups(prev => {
        const newGroups = {...prev};
        delete newGroups[groupId];
        return newGroups;
    });
  };
  
  const handleHolidayGroupNameChange = (groupId: string, newName: string) => {
    setEditingHolidayGroupName({ groupId, name: newName });
  };
  
  const handleSaveHolidayGroupName = (groupId: string) => {
    if (editingHolidayGroupName && editingHolidayGroupName.groupId === groupId) {
      const trimmedName = editingHolidayGroupName.name.trim();
      if (trimmedName) {
        setHolidayGroups(prev => ({
          ...prev,
          [groupId]: { ...prev[groupId], name: trimmedName }
        }));
      }
      setEditingHolidayGroupName(null);
    }
  };

  const handleSaveHolidayGroups = async () => {
    if (!effectiveLocationId || effectiveLocationId === 'all') {
      toast({ title: "Error", description: "Seleccione una sede específica para guardar los grupos.", variant: "destructive" });
      return;
    }
    setIsSavingHolidayGroups(true);
    try {
      await saveHolidayGroups(effectiveLocationId, holidayGroups);
      toast({ title: "Grupos de Feriado Guardados", description: "La configuración de los grupos para feriados ha sido guardada." });
    } catch (error) {
      toast({ title: "Error al Guardar", description: "No se pudo guardar la configuración de los grupos.", variant: "destructive" });
      console.error("Error saving holiday groups:", error);
    } finally {
      setIsSavingHolidayGroups(false);
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
            Visualización de los grupos de trabajo, turnos y descansos del personal por sede.
          </CardDescription>
        </CardHeader>
      </Card>
      
      <Tabs defaultValue="planner" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="planner">Planificador Semanal</TabsTrigger>
          <TabsTrigger value="sunday-groups">Grupos Dominicales</TabsTrigger>
          <TabsTrigger value="holiday-groups">Grupos Feriados</TabsTrigger>
          <TabsTrigger value="compensatory-rests">Descansos Compensatorios</TabsTrigger>
        </TabsList>

        <TabsContent value="planner">
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
                          <Button variant="outline" size="icon" onClick={() => setViewDate(prev => subMonths(prev, 1))}><ChevronLeft/></Button>
                          <Button variant="outline" size="sm" onClick={() => setViewDate(new Date())}>Este Mes</Button>
                          <Button variant="outline" size="icon" onClick={() => setViewDate(prev => addMonths(prev, 1))}><ChevronRight/></Button>
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
                                            <div className="flex items-center justify-center gap-2">
                                                <span>{format(day, "EEEE d", {locale: es})}</span>
                                                <AlertDialog>
                                                    <AlertDialogTrigger asChild>
                                                        <Button variant="ghost" size="icon" className="h-6 w-6 text-amber-500 hover:text-amber-400 hover:bg-amber-100/50" title="Marcar como feriado">
                                                            <Star size={16}/>
                                                        </Button>
                                                    </AlertDialogTrigger>
                                                    <AlertDialogContent>
                                                        <AlertDialogHeader>
                                                        <AlertDialogTitle>¿Marcar como Feriado?</AlertDialogTitle>
                                                        <AlertDialogDescription>
                                                            Esta acción asignará un descanso por "Feriado" a todos los profesionales activos para el día {format(day, "d 'de' LLLL", {locale: es})}. ¿Desea continuar?
                                                        </AlertDialogDescription>
                                                        </AlertDialogHeader>
                                                        <AlertDialogFooter>
                                                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                                        <AlertDialogAction onClick={() => handleMarkAsHoliday(day)}>Sí, marcar como feriado</AlertDialogAction>
                                                        </AlertDialogFooter>
                                                    </AlertDialogContent>
                                                </AlertDialog>
                                            </div>
                                        </TableHead>
                                    ))}
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {isProcessing ? (
                                    <TableRow><TableCell colSpan={8} className="text-center p-8"><Loader2 className="h-8 w-8 animate-spin mx-auto"/> Aplicando feriado...</TableCell></TableRow>
                                ) : (
                                <>
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
                                                                            {locations.filter(l => l.id !== effectiveLocationId).map(loc => (
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
                                </>
                                )}
                            </TableBody>
                        </Table>
                        <div className="p-4 mt-4 flex items-center gap-6 text-sm">
                            <h4 className="font-bold">Leyenda:</h4>
                            <div className="flex items-center gap-2"><div className="w-5 h-5 bg-orange-400 rounded-sm"></div><span>Vacaciones / Feriado</span></div>
                            <div className="flex items-center gap-2"><div className="w-5 h-5 bg-cyan-200 rounded-sm"></div><span>Descanso</span></div>
                            <div className="flex items-center gap-2"><div className="w-5 h-5 bg-purple-200 rounded-sm"></div><span>Traslado</span></div>
                            <div className="flex items-center gap-2"><div className="w-5 h-5 bg-green-200 rounded-sm"></div><span>Cubre / Turno Especial</span></div>
                        </div>
                    </div>
                    }
                </CardContent>
            </Card>
        </TabsContent>
        
        <TabsContent value="sunday-groups">
            <Card>
                <CardHeader>
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                        <div>
                            <CardTitle>Grupos Dominicales ({currentViewLocationName})</CardTitle>
                            <CardDescription>Organice los profesionales en grupos para las rotaciones de los domingos. Haga doble clic en el nombre de un grupo para editarlo.</CardDescription>
                        </div>
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="outline"><PlusCircle className="mr-2 h-4 w-4" />Añadir Profesional Externo</Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent className="w-56">
                                <DropdownMenuSub>
                                    <DropdownMenuSubTrigger>Desde Sede...</DropdownMenuSubTrigger>
                                    <DropdownMenuSubContent>
                                        {locations.filter(l => l.id !== effectiveLocationId).map(loc => (
                                            <DropdownMenuSub key={loc.id}>
                                                <DropdownMenuSubTrigger>{loc.name}</DropdownMenuSubTrigger>
                                                <DropdownMenuSubContent>
                                                    {allProfessionals.filter(p => p.locationId === loc.id).map(prof => (
                                                        <DropdownMenuItem key={prof.id} onSelect={() => handleAddExternalToSundayGroup(prof)}>
                                                            {prof.firstName} {prof.lastName}
                                                        </DropdownMenuItem>
                                                    ))}
                                                </DropdownMenuSubContent>
                                            </DropdownMenuSub>
                                        ))}
                                    </DropdownMenuSubContent>
                                </DropdownMenuSub>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>
                </CardHeader>
                <CardContent className="grid grid-cols-1 md:grid-cols-5 gap-4">
                    <div className="md:col-span-1 p-3 border rounded-lg bg-secondary/50">
                        <h4 className="font-semibold mb-2 text-center">Sin Asignar</h4>
                        <div className="space-y-1 min-h-[100px]">
                            {sundayProfessionalsByGroup.unassigned.map(prof => (
                                <DropdownMenu key={prof.id}>
                                    <DropdownMenuTrigger asChild><Button variant="outline" className="w-full justify-start">{prof.firstName} {prof.lastName.charAt(0)}.</Button></DropdownMenuTrigger>
                                    <DropdownMenuContent>
                                        {Object.entries(sundayGroups).map(([groupId, groupData]) => (
                                            <DropdownMenuItem key={groupId} onClick={() => handleMoveSundayProfessional(prof.id, groupId)}>Mover a {groupData.name}</DropdownMenuItem>
                                        ))}
                                    </DropdownMenuContent>
                                </DropdownMenu>
                            ))}
                        </div>
                    </div>
                    <div className="md:col-span-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                        {Object.entries(sundayGroups).map(([groupId, groupData]) => {
                            const profs = sundayProfessionalsByGroup.assigned.get(groupId) || [];
                            return (
                                <div key={groupId} className="p-3 border rounded-lg">
                                    <div className="font-semibold mb-2 text-center capitalize flex items-center justify-center gap-2" onDoubleClick={() => setEditingSundayGroupName({ groupId, name: groupData.name })}>
                                    {editingSundayGroupName?.groupId === groupId ? (
                                        <Input
                                        value={editingSundayGroupName.name}
                                        onChange={(e) => handleSundayGroupNameChange(groupId, e.target.value)}
                                        onBlur={() => handleSaveSundayGroupName(groupId)}
                                        onKeyDown={(e) => { if (e.key === 'Enter') handleSaveSundayGroupName(groupId); if (e.key === 'Escape') setEditingSundayGroupName(null);}}
                                        autoFocus
                                        className="h-8 text-center"
                                        />
                                    ) : (
                                        <h4 className="flex items-center gap-2 cursor-pointer"><Group size={16}/> {groupData.name} <Edit2 size={12} className="text-muted-foreground"/></h4>
                                    )}
                                    </div>
                                    <div className="space-y-1 min-h-[100px]">
                                        {profs.map(prof => (
                                            <DropdownMenu key={prof.id}>
                                                <DropdownMenuTrigger asChild><Button variant="secondary" className="w-full justify-start">{prof.firstName} {prof.lastName.charAt(0)}.</Button></DropdownMenuTrigger>
                                                <DropdownMenuContent>
                                                    <DropdownMenuItem onClick={() => handleMoveSundayProfessional(prof.id, null)}>Quitar de Grupo</DropdownMenuItem>
                                                    <DropdownMenuSeparator/>
                                                    {Object.entries(sundayGroups).filter(([id]) => id !== groupId).map(([otherGroupId, otherGroupData]) => (
                                                        <DropdownMenuItem key={otherGroupId} onClick={() => handleMoveSundayProfessional(prof.id, otherGroupId)}>Mover a {otherGroupData.name}</DropdownMenuItem>
                                                    ))}
                                                </DropdownMenuContent>
                                            </DropdownMenu>
                                        ))}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </CardContent>
                <CardFooter>
                    <Button onClick={handleSaveSundayGroups} disabled={isSavingSundayGroups}>
                        {isSavingSundayGroups && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        <Save className="mr-2 h-4 w-4" /> Guardar Grupos Dominicales
                    </Button>
                </CardFooter>
            </Card>
        </TabsContent>

        <TabsContent value="holiday-groups">
            <Card>
                <CardHeader>
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                        <div>
                            <CardTitle>Grupos para Feriados ({currentViewLocationName})</CardTitle>
                            <CardDescription>Organice los profesionales en grupos para los días feriados. La asignación es por sede.</CardDescription>
                        </div>
                        <div className="flex gap-2">
                           <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button variant="outline"><PlusCircle className="mr-2 h-4 w-4" />Añadir Profesional Externo</Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent className="w-56">
                                    {locations.filter(l => l.id !== effectiveLocationId).map(loc => (
                                        <DropdownMenuSub key={loc.id}>
                                            <DropdownMenuSubTrigger>{loc.name}</DropdownMenuSubTrigger>
                                            <DropdownMenuSubContent>
                                                {allProfessionals.filter(p => p.locationId === loc.id).map(prof => (
                                                    <DropdownMenuItem key={prof.id} onSelect={() => handleAddExternalToHolidayGroup(prof)}>
                                                        {prof.firstName} {prof.lastName}
                                                    </DropdownMenuItem>
                                                ))}
                                            </DropdownMenuSubContent>
                                        </DropdownMenuSub>
                                    ))}
                                </DropdownMenuContent>
                            </DropdownMenu>
                            <div className="flex gap-1">
                                <Input placeholder="Nuevo grupo" value={newHolidayGroupName} onChange={e => setNewHolidayGroupName(e.target.value)} />
                                <Button onClick={handleAddNewHolidayGroup} size="sm">Crear</Button>
                            </div>
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="grid grid-cols-1 md:grid-cols-5 gap-4">
                    <div className="md:col-span-1 p-3 border rounded-lg bg-secondary/50">
                        <h4 className="font-semibold mb-2 text-center">Sin Asignar</h4>
                        <div className="space-y-1 min-h-[100px]">
                             {holidayProfessionalsByGroup.unassigned.map(prof => (
                                <DropdownMenu key={prof.id}>
                                    <DropdownMenuTrigger asChild><Button variant="outline" className="w-full justify-start">{prof.firstName} {prof.lastName.charAt(0)}.</Button></DropdownMenuTrigger>
                                    <DropdownMenuContent>
                                        {Object.entries(holidayGroups).map(([groupId, groupData]) => (
                                            <DropdownMenuItem key={groupId} onClick={() => handleMoveHolidayProfessional(prof.id, groupId)}>Mover a {groupData.name}</DropdownMenuItem>
                                        ))}
                                    </DropdownMenuContent>
                                </DropdownMenu>
                            ))}
                        </div>
                    </div>
                    <div className="md:col-span-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                        {Object.entries(holidayGroups).map(([groupId, groupData]) => {
                            const profs = holidayProfessionalsByGroup.assigned.get(groupId) || [];
                            return (
                                <div key={groupId} className="p-3 border rounded-lg">
                                    <div className="font-semibold mb-2 text-center capitalize flex items-center justify-center gap-2">
                                        {editingHolidayGroupName?.groupId === groupId ? (
                                            <Input value={editingHolidayGroupName.name} onChange={(e) => handleHolidayGroupNameChange(groupId, e.target.value)} onBlur={() => handleSaveHolidayGroupName(groupId)} onKeyDown={(e) => { if (e.key === 'Enter') handleSaveHolidayGroupName(groupId); }} autoFocus className="h-8"/>
                                        ) : (
                                            <h4 className="flex items-center gap-2 cursor-pointer" onDoubleClick={() => handleHolidayGroupNameChange(groupId, groupData.name)}><Shield size={16}/> {groupData.name} <Edit2 size={12}/></h4>
                                        )}
                                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleDeleteHolidayGroup(groupId)}><Trash2 size={14} className="text-destructive"/></Button>
                                    </div>
                                    <div className="space-y-1 min-h-[100px]">
                                        {profs.map(prof => (
                                            <DropdownMenu key={prof.id}>
                                                <DropdownMenuTrigger asChild><Button variant="secondary" className="w-full justify-start">{prof.firstName} {prof.lastName.charAt(0)}.</Button></DropdownMenuTrigger>
                                                <DropdownMenuContent>
                                                    <DropdownMenuItem onClick={() => handleMoveHolidayProfessional(prof.id, null)}>Quitar de Grupo</DropdownMenuItem>
                                                    <DropdownMenuSeparator/>
                                                    {Object.entries(holidayGroups).filter(([id]) => id !== groupId).map(([otherGroupId, otherGroupData]) => (
                                                        <DropdownMenuItem key={otherGroupId} onClick={() => handleMoveHolidayProfessional(prof.id, otherGroupId)}>Mover a {otherGroupData.name}</DropdownMenuItem>
                                                    ))}
                                                </DropdownMenuContent>
                                            </DropdownMenu>
                                        ))}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </CardContent>
                <CardFooter>
                    <Button onClick={handleSaveHolidayGroups} disabled={isSavingHolidayGroups}>
                        {isSavingHolidayGroups && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        <Save className="mr-2 h-4 w-4" /> Guardar Grupos de Feriados
                    </Button>
                </CardFooter>
            </Card>
        </TabsContent>

        <TabsContent value="compensatory-rests">
            <div className="grid md:grid-cols-2 gap-8">
                <Card>
                    <CardHeader>
                        <CardTitle className="text-xl">Descansos por Trabajo Dominical</CardTitle>
                        <CardDescription>
                        Asigne el día de descanso para el personal que trabaja el próximo domingo, {format(nextSunday(viewDate), "d 'de' LLLL", {locale: es})}.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="w-1/2">Trabajan Próximo Domingo</TableHead>
                                    <TableHead className="w-1/2">Asignar Día de Descanso Compensatorio</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {sundayWorkers.length > 0 ? sundayWorkers.map(item => (
                                    <TableRow key={item.professionalId}>
                                        <TableCell className="font-medium">{item.professionalName}</TableCell>
                                        <TableCell>
                                        <Popover>
                                            <PopoverTrigger asChild>
                                            <Button variant="outline" className="w-full justify-start font-normal">
                                                <Calendar className="mr-2 h-4 w-4"/>
                                                {'Asignar Descanso'}
                                            </Button>
                                            </PopoverTrigger>
                                            <PopoverContent className="w-auto p-0">
                                            <CalendarComponent
                                                mode="single"
                                                onSelect={(date) => handleRestDayChange(item.professionalId, date)}
                                                initialFocus
                                                disabled={(date) => date < new Date()}
                                            />
                                            </PopoverContent>
                                        </Popover>
                                        </TableCell>
                                    </TableRow>
                                )) : <TableRow><TableCell colSpan={2} className="text-center h-24">Nadie trabaja el próximo domingo.</TableCell></TableRow>}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader>
                        <CardTitle className="text-xl">Descansos por Feriado</CardTitle>
                        <CardDescription>
                        Asigne el día de descanso para el personal que trabaja en días feriados de la semana actual.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="w-1/2">Trabajan en Feriado</TableHead>
                                    <TableHead className="w-1/2">Asignar Día de Descanso Compensatorio</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {holidayWorkers.length > 0 ? holidayWorkers.map(item => (
                                    <TableRow key={`${item.professionalId}-${item.workDate.toISOString()}`}>
                                        <TableCell className="font-medium">{item.professionalName} <span className="text-muted-foreground text-xs">({format(item.workDate, 'EEE d', {locale: es})})</span></TableCell>
                                        <TableCell>
                                        <Popover>
                                            <PopoverTrigger asChild>
                                            <Button variant="outline" className="w-full justify-start font-normal">
                                                <Calendar className="mr-2 h-4 w-4"/>
                                                {'Asignar Descanso'}
                                            </Button>
                                            </PopoverTrigger>
                                            <PopoverContent className="w-auto p-0">
                                            <CalendarComponent
                                                mode="single"
                                                onSelect={(date) => handleRestDayChange(item.professionalId, date)}
                                                initialFocus
                                                disabled={(date) => date < new Date()}
                                            />
                                            </PopoverContent>
                                        </Popover>
                                        </TableCell>
                                    </TableRow>
                                )) : <TableRow><TableCell colSpan={2} className="text-center h-24">Nadie trabaja en feriados esta semana.</TableCell></TableRow>}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>
            </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}


