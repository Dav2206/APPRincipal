
"use client";

import type { Professional, ProfessionalFormData } from '@/types';
import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/auth-provider';
import { useAppState } from '@/contexts/app-state-provider';
import { getProfessionals, addProfessional, updateProfessional } from '@/lib/data';
import { LOCATIONS, USER_ROLES, LocationId, TIME_SLOTS, DAYS_OF_WEEK } from '@/lib/constants';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
} from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { PlusCircle, Edit2, Briefcase, Search, Loader2, CalendarDays, Clock } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ProfessionalFormSchema } from '@/lib/schemas';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

export default function ProfessionalsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { selectedLocationId: adminSelectedLocation } = useAppState();
  const [professionals, setProfessionals] = useState<Professional[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingProfessional, setEditingProfessional] = useState<Professional | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  const defaultWorkDays = DAYS_OF_WEEK.slice(0, 5).map(day => day.id); // Lunes a Viernes por defecto

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
    }
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
      setProfessionals(data);
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
    });
    setIsFormOpen(true);
  };

  const handleEditProfessional = (professional: Professional) => {
    setEditingProfessional(professional);
    form.reset({
        ...professional,
        locationId: professional.locationId as LocationId, 
        workDays: professional.workDays || defaultWorkDays,
        startTime: professional.startTime || '09:00',
        endTime: professional.endTime || '17:00',
    });
    setIsFormOpen(true);
  };

  const onSubmit = async (data: ProfessionalFormData) => {
    try {
      if (editingProfessional && data.id) {
        const result = await updateProfessional(data.id, data);
        if (result) {
             toast({ title: "Profesional Actualizado", description: `${result.firstName} ${result.lastName} actualizado.` });
        } else {
            toast({ title: "Error", description: `No se pudo actualizar a ${data.firstName}.`, variant: "destructive" });
        }
      } else {
        const newProfessionalData = await addProfessional(data);
        toast({ title: "Profesional Agregado", description: `${newProfessionalData.firstName} ${newProfessionalData.lastName} agregado.` });
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

  const formatWorkSchedule = (prof: Professional) => {
    const days = prof.workDays.map(dayId => DAYS_OF_WEEK.find(d => d.id === dayId)?.name.substring(0,3)).join(', ');
    return `${days} (${prof.startTime} - ${prof.endTime})`;
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
                  <TableHead className="hidden lg:table-cell">Horario Laboral</TableHead>
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
                    <TableCell className="hidden lg:table-cell text-xs">{formatWorkSchedule(prof)}</TableCell>
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
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingProfessional ? 'Editar' : 'Agregar'} Profesional</DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-4 max-h-[80vh] overflow-y-auto pr-2">
              {editingProfessional && <input type="hidden" {...form.register("id")} />}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField control={form.control} name="firstName" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nombre(s)</FormLabel>
                    <FormControl><Input placeholder="Ej: Juan" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}/>
                <FormField control={form.control} name="lastName" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Apellido(s)</FormLabel>
                    <FormControl><Input placeholder="Ej: Pérez" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}/>
              </div>
              <FormField
                control={form.control}
                name="locationId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Sede</FormLabel>
                    <Select 
                      onValueChange={field.onChange} 
                      value={field.value} 
                      disabled={user?.role === USER_ROLES.LOCATION_STAFF}
                    >
                      <FormControl>
                        <SelectTrigger><SelectValue placeholder="Seleccionar sede" /></SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {LOCATIONS.map(loc => (
                          <SelectItem key={loc.id} value={loc.id}>{loc.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
               <FormField control={form.control} name="phone" render={({ field }) => (
                  <FormItem>
                      <FormLabel>Teléfono (Opcional)</FormLabel>
                      <FormControl><Input type="tel" placeholder="Ej: 987654321" {...field} /></FormControl>
                      <FormMessage />
                  </FormItem>
               )}/>

              <FormField
                control={form.control}
                name="workDays"
                render={() => (
                  <FormItem>
                    <div className="mb-2">
                      <FormLabel className="text-base flex items-center gap-1"><CalendarDays size={16}/> Días Laborales</FormLabel>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 rounded-md border p-3">
                      {DAYS_OF_WEEK.map((day) => (
                        <FormField
                          key={day.id}
                          control={form.control}
                          name="workDays"
                          render={({ field }) => {
                            return (
                              <FormItem
                                key={day.id}
                                className="flex flex-row items-start space-x-2 space-y-0"
                              >
                                <FormControl>
                                  <Checkbox
                                    checked={field.value?.includes(day.id)}
                                    onCheckedChange={(checked) => {
                                      return checked
                                        ? field.onChange([...(field.value || []), day.id])
                                        : field.onChange(
                                            (field.value || []).filter(
                                              (value) => value !== day.id
                                            )
                                          )
                                    }}
                                  />
                                </FormControl>
                                <FormLabel className="font-normal text-sm">
                                  {day.name}
                                </FormLabel>
                              </FormItem>
                            )
                          }}
                        />
                      ))}
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="startTime"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="flex items-center gap-1"><Clock size={16}/> Hora de Entrada</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl><SelectTrigger><SelectValue placeholder="HH:MM" /></SelectTrigger></FormControl>
                        <SelectContent>
                          {TIME_SLOTS.map(slot => (<SelectItem key={`start-${slot}`} value={slot}>{slot}</SelectItem>))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="endTime"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="flex items-center gap-1"><Clock size={16}/> Hora de Salida</FormLabel>
                       <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl><SelectTrigger><SelectValue placeholder="HH:MM" /></SelectTrigger></FormControl>
                        <SelectContent>
                          {TIME_SLOTS.map(slot => (<SelectItem key={`end-${slot}`} value={slot}>{slot}</SelectItem>))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>


              <DialogFooter className="pt-4">
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
