

"use client";

import type { Professional, ProfessionalFormData, Contract, Location } from '@/types';
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '@/contexts/auth-provider';
import { useAppState } from '@/contexts/app-state-provider';
import { getProfessionals, getProfessionalAvailabilityForDate, getContractDisplayStatus, getLocations } from '@/lib/data';
import type { ContractDisplayStatus } from '@/lib/data';
import { USER_ROLES, LocationId } from '@/lib/constants';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { PlusCircle, Edit2, Users, Search, Loader2, CalendarDays, Clock, AlertTriangle, Moon, ChevronsDown, Briefcase as BriefcaseIcon } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { format, parseISO, startOfDay, isEqual } from 'date-fns';
import { es } from 'date-fns/locale';
import { Badge } from '@/components/ui/badge';
import Link from 'next/link';


const PROFESSIONALS_PER_PAGE = 5;

export default function ProfessionalsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { selectedLocationId: adminSelectedLocation } = useAppState();
  const [locations, setLocations] = useState<Location[]>([]);
  const [allProfessionals, setAllProfessionals] = useState<(Professional & { contractDisplayStatus: ContractDisplayStatus })[]>([]);
  const [displayedProfessionals, setDisplayedProfessionals] = useState<(Professional & { contractDisplayStatus: ContractDisplayStatus })[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  
  const [scheduleViewDate, setScheduleViewDate] = useState<Date>(new Date());

  const isAdminOrContador = useMemo(() => user?.role === USER_ROLES.ADMIN || user?.role === USER_ROLES.CONTADOR, [user]);
  const isContadorOnly = useMemo(() => user?.role === USER_ROLES.CONTADOR, [user]);


  const fetchProfessionals = useCallback(async () => {
    if (!user || !isAdminOrContador) return;
    setIsLoading(true);
    try {
      const locationToFetch = adminSelectedLocation === 'all' ? undefined : adminSelectedLocation as LocationId;
      const profs = await getProfessionals(locationToFetch);
      setAllProfessionals(profs || []);
    } catch (error) {
      console.error("Failed to fetch professionals:", error);
      toast({ title: "Error", description: "No se pudieron cargar los profesionales.", variant: "destructive" });
      setAllProfessionals([]);
    } finally {
      setIsLoading(false);
    }
  }, [user, isAdminOrContador, adminSelectedLocation, toast]);

  useEffect(() => {
    async function loadInitialData() {
      const fetchedLocations = await getLocations();
      setLocations(fetchedLocations);
      if (user && isAdminOrContador) {
        fetchProfessionals();
      } else {
        setIsLoading(false);
      }
    }
    loadInitialData();
  }, [user, isAdminOrContador, fetchProfessionals]);

  useEffect(() => {
    if (user && isAdminOrContador) {
      fetchProfessionals();
    }
  }, [adminSelectedLocation, fetchProfessionals, user, isAdminOrContador]);

  const filteredProfessionals = useMemo(() => {
    return allProfessionals.filter(p =>
      `${p.firstName} ${p.lastName}`.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (p.phone && p.phone.includes(searchTerm))
    );
  }, [allProfessionals, searchTerm]);

  useEffect(() => {
    setDisplayedProfessionals(filteredProfessionals.slice(0, PROFESSIONALS_PER_PAGE * currentPage));
  }, [filteredProfessionals, currentPage]);


  const LoadingState = () => (
     <div className="flex flex-col items-center justify-center h-64 col-span-full">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="mt-4 text-muted-foreground">Cargando profesionales...</p>
      </div>
  );

  const handleLoadMore = () => {
    setCurrentPage(prev => prev + 1);
  };
  
  const formatWorkScheduleDisplay = useCallback((prof: Professional, date: Date) => {
    const availability = getProfessionalAvailabilityForDate(prof, date);
  
    if (availability && availability.isWorking && availability.startTime && availability.endTime) {
        let locationName = locations.find(l => l.id === availability.workingLocationId)?.name;
        if (!locationName) {
            locationName = locations.find(l => l.id === prof.locationId)?.name || 'Sede Desc.';
        }

        let scheduleStr = `${availability.startTime}-${availability.endTime} en ${locationName}`;
        if (availability.reason && availability.reason !== 'Horario base') {
             scheduleStr += ` (Especial)`;
        }
        return <span className="text-green-600">{scheduleStr}</span>;
    } else {
        return <span className="text-red-600">{availability?.reason || 'Descansando'}</span>;
    }
  }, [locations]);

  if (!user) {
    return (
      <div className="flex h-screen items-center justify-center">
        <p>Cargando...</p>
      </div>
    );
  }
  
  if (!isAdminOrContador) {
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

  return (
    <div className="space-y-6">
      <Card className="shadow-md">
        <CardHeader className="flex flex-col md:flex-row justify-between items-center">
          <div>
            <CardTitle className="text-2xl flex items-center gap-2"><BriefcaseIcon className="text-primary"/> Gestión de Profesionales</CardTitle>
            <CardDescription>Ver, agregar o editar información, horarios y contratos de los profesionales.</CardDescription>
            {isAdminOrContador && (
              <div className="mt-1 text-sm text-muted-foreground">
                Viendo: {adminSelectedLocation === 'all' ? 'Todas las sedes' : locations.find(l => l.id === adminSelectedLocation)?.name || ''}
              </div>
            )}
          </div>
          {(isAdminOrContador) && ( 
            <Button asChild>
                <Link href="/professionals/new">
                    <PlusCircle className="mr-2 h-4 w-4" /> Agregar Profesional
                </Link>
            </Button>
          )}
        </CardHeader>
        <CardContent>
          <div className="mb-4 flex flex-col sm:flex-row gap-4">
              <div className="relative flex-grow">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  type="search"
                  placeholder="Buscar profesionales por nombre o teléfono..."
                  value={searchTerm}
                  onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
                  className="pl-8 w-full"
                />
              </div>
              <div className="flex items-center gap-2">
                <Label htmlFor="schedule-view-date" className="text-sm font-medium whitespace-nowrap">Ver estado para:</Label>
                 <Popover>
                    <PopoverTrigger asChild>
                    <Button
                        id="schedule-view-date"
                        variant={"outline"}
                        className={cn(
                        "w-[240px] justify-start text-left font-normal",
                        !scheduleViewDate && "text-muted-foreground"
                        )}
                    >
                        <CalendarDays className="mr-2 h-4 w-4" />
                        {scheduleViewDate ? format(scheduleViewDate, "PPP", {locale: es}) : <span>Seleccionar fecha</span>}
                    </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0">
                    <Calendar
                        mode="single"
                        selected={scheduleViewDate}
                        onSelect={(date) => setScheduleViewDate(date || new Date())}
                        initialFocus
                    />
                    </PopoverContent>
                </Popover>
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
                      <TableHead className="hidden lg:table-cell">Horario y Sede del Día</TableHead>
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
                        <TableCell className="font-medium">
                          {prof.firstName} {prof.lastName}
                          {prof.isManager && <Badge variant="secondary" className="ml-2 text-xs">Gerente</Badge>}
                        </TableCell>
                        <TableCell className="hidden lg:table-cell text-xs">{formatWorkScheduleDisplay(prof, scheduleViewDate)}</TableCell>
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
                          <Button asChild variant="ghost" size="sm">
                            <Link href={`/professionals/${prof.id}/edit`}>
                                <Edit2 className="h-4 w-4" /> <span className="sr-only">Editar</span>
                            </Link>
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
    </div>
  );
}
