"use client";

import type { Professional, ProfessionalFormData } from '@/types';
import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/auth-provider';
import { useAppState } from '@/contexts/app-state-provider';
import { getProfessionals, addProfessional, updateProfessional } from '@/lib/data';
import { LOCATIONS, PROFESSIONAL_SPECIALIZATIONS, USER_ROLES, LocationId } from '@/lib/constants';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
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
import { PlusCircle, Edit2, Briefcase, Search, Loader2, BadgeDollarSign } from 'lucide-react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ProfessionalFormSchema } from '@/lib/schemas';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';

export default function ProfessionalsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { selectedLocationId: adminSelectedLocation } = useAppState();
  const [professionals, setProfessionals] = useState<Professional[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingProfessional, setEditingProfessional] = useState<Professional | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  const form = useForm<ProfessionalFormData>({
    resolver: zodResolver(ProfessionalFormSchema),
    defaultValues: {
      firstName: '',
      lastName: '',
      locationId: LOCATIONS[0].id,
      specializations: [],
      email: '',
      phone: '',
    }
  });
  
  const effectiveLocationId = user?.role === USER_ROLES.ADMIN 
    ? (adminSelectedLocation === 'all' ? undefined : adminSelectedLocation as LocationId) 
    : user?.locationId;


  const fetchProfessionals = useCallback(async () => {
    setIsLoading(true);
    const data = await getProfessionals(effectiveLocationId);
    setProfessionals(data);
    setIsLoading(false);
  }, [effectiveLocationId]);

  useEffect(() => {
    fetchProfessionals();
  }, [fetchProfessionals]);

  const handleAddProfessional = () => {
    setEditingProfessional(null);
    // Set default location based on context, or first location for admin if 'all' is selected
    const defaultLoc = user?.role === USER_ROLES.LOCATION_STAFF 
      ? user.locationId 
      : (adminSelectedLocation && adminSelectedLocation !== 'all' ? adminSelectedLocation : LOCATIONS[0].id);
    
    form.reset({
      firstName: '',
      lastName: '',
      locationId: defaultLoc,
      specializations: [],
      email: '',
      phone: '',
    });
    setIsFormOpen(true);
  };

  const handleEditProfessional = (professional: Professional) => {
    setEditingProfessional(professional);
    form.reset({
        ...professional,
        locationId: professional.locationId as LocationId, // Ensure type correctness
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
        const newProfessional = await addProfessional(data);
        toast({ title: "Profesional Agregado", description: `${newProfessional.firstName} ${newProfessional.lastName} agregado.` });
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
    (p.email && p.email.toLowerCase().includes(searchTerm.toLowerCase())) ||
    p.specializations.some(s => s.toLowerCase().includes(searchTerm.toLowerCase()))
  );
  
  const LoadingState = () => (
     <div className="flex flex-col items-center justify-center h-64 col-span-full">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="mt-4 text-muted-foreground">Cargando profesionales...</p>
      </div>
  );

  return (
    <div className="space-y-6">
      <Card className="shadow-md">
        <CardHeader className="flex flex-col md:flex-row justify-between items-center">
          <div>
            <CardTitle className="text-2xl flex items-center gap-2"><Briefcase className="text-primary"/> Gestión de Profesionales</CardTitle>
            <CardDescription>Ver, agregar o editar información de los profesionales.</CardDescription>
            {user?.role === USER_ROLES.ADMIN && (
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
                placeholder="Buscar profesionales por nombre, email o especialización..."
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
                  <TableHead>Especializaciones</TableHead>
                  <TableHead className="hidden lg:table-cell">Email</TableHead>
                   <TableHead className="hidden xl:table-cell text-right">Ingresos Quincena (S/)</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredProfessionals.length > 0 ? filteredProfessionals.map(prof => (
                  <TableRow key={prof.id}>
                    <TableCell className="font-medium">{prof.firstName} {prof.lastName}</TableCell>
                    <TableCell className="hidden md:table-cell">{LOCATIONS.find(l => l.id === prof.locationId)?.name}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {prof.specializations.map(spec => <Badge key={spec} variant="secondary" className="text-xs">{spec}</Badge>)}
                      </div>
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">{prof.email || 'N/A'}</TableCell>
                    <TableCell className="hidden xl:table-cell text-right">{prof.biWeeklyEarnings?.toFixed(2) || 'N/A'}</TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" onClick={() => handleEditProfessional(prof)}>
                        <Edit2 className="h-4 w-4" /> <span className="sr-only">Editar</span>
                      </Button>
                    </TableCell>
                  </TableRow>
                )) : (
                  <TableRow>
                    <TableCell colSpan={user?.role === USER_ROLES.ADMIN ? 6: 5} className="h-24 text-center"> {/* Adjusted colSpan */}
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
          </DialogHeader>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-4 max-h-[70vh] overflow-y-auto pr-2">
            {editingProfessional && <input type="hidden" {...form.register("id")} />}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField control={form.control} name="firstName" render={({ field }) => (
                <div className="space-y-1">
                  <Label htmlFor="firstName">Nombre(s)</Label>
                  <Input id="firstName" placeholder="Ej: Juan" {...field} />
                  {form.formState.errors.firstName && <p className="text-xs text-destructive">{form.formState.errors.firstName.message}</p>}
                </div>
              )}/>
              <FormField control={form.control} name="lastName" render={({ field }) => (
                <div className="space-y-1">
                  <Label htmlFor="lastName">Apellido(s)</Label>
                  <Input id="lastName" placeholder="Ej: Pérez" {...field} />
                  {form.formState.errors.lastName && <p className="text-xs text-destructive">{form.formState.errors.lastName.message}</p>}
                </div>
              )}/>
            </div>
            <FormField
              control={form.control}
              name="locationId"
              render={({ field }) => (
                <div className="space-y-1">
                  <Label htmlFor="locationId">Sede</Label>
                  <Select 
                    onValueChange={field.onChange} 
                    defaultValue={field.value} 
                    disabled={user?.role === USER_ROLES.LOCATION_STAFF && !editingProfessional} // Location staff can't change location unless admin
                  >
                    <SelectTrigger id="locationId"><SelectValue placeholder="Seleccionar sede" /></SelectTrigger>
                    <SelectContent>
                      {LOCATIONS.map(loc => (
                        <SelectItem key={loc.id} value={loc.id}>{loc.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                   {form.formState.errors.locationId && <p className="text-xs text-destructive">{form.formState.errors.locationId.message}</p>}
                </div>
              )}
            />
            <div className="space-y-1">
              <Label>Especializaciones</Label>
              <Controller
                control={form.control}
                name="specializations"
                render={({ field }) => (
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-2 p-2 border rounded-md">
                    {PROFESSIONAL_SPECIALIZATIONS.map(spec => (
                      <div key={spec} className="flex items-center space-x-2">
                        <Checkbox
                          id={`spec-${spec}`}
                          checked={field.value?.includes(spec)}
                          onCheckedChange={(checked) => {
                            return checked
                              ? field.onChange([...(field.value || []), spec])
                              : field.onChange((field.value || []).filter(value => value !== spec))
                          }}
                        />
                        <Label htmlFor={`spec-${spec}`} className="text-sm font-normal">{spec}</Label>
                      </div>
                    ))}
                  </div>
                )}
              />
              {form.formState.errors.specializations && <p className="text-xs text-destructive">{form.formState.errors.specializations.message}</p>}
            </div>
             <FormField control={form.control} name="email" render={({ field }) => (
                <div className="space-y-1">
                    <Label htmlFor="email">Email (Opcional)</Label>
                    <Input id="email" type="email" placeholder="Ej: juan.perez@mail.com" {...field} />
                    {form.formState.errors.email && <p className="text-xs text-destructive">{form.formState.errors.email.message}</p>}
                </div>
             )}/>
             <FormField control={form.control} name="phone" render={({ field }) => (
                <div className="space-y-1">
                    <Label htmlFor="phone">Teléfono (Opcional)</Label>
                    <Input id="phone" type="tel" placeholder="Ej: 987654321" {...field} />
                </div>
             )}/>
            <DialogFooter className="pt-4">
              <DialogClose asChild><Button type="button" variant="outline">Cancelar</Button></DialogClose>
              <Button type="submit">{form.formState.isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{editingProfessional ? 'Guardar Cambios' : 'Agregar Profesional'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
