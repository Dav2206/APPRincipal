

"use client";

import type { Service, ServiceFormData, Material } from '@/types';
import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/auth-provider';
import { getServices, addService, updateService, getMaterials } from '@/lib/data';
import { USER_ROLES } from '@/lib/constants';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
import { PlusCircle, Edit2, ClipboardList, Loader2, AlertTriangle, Trash2, Package } from 'lucide-react';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ServiceFormSchema } from '@/lib/schemas';
import { useToast } from '@/hooks/use-toast';
import { useRouter } from 'next/navigation';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export default function ServicesPage() {
  const { user, isLoading: authIsLoading } = useAuth();
  const { toast } = useToast();
  const router = useRouter();

  const [services, setServices] = useState<Service[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingService, setEditingService] = useState<Service | null>(null);

  const form = useForm<ServiceFormData>({
    resolver: zodResolver(ServiceFormSchema),
    defaultValues: {
      name: '',
      defaultDuration: { hours: 0, minutes: 30 },
      price: undefined,
      materialsUsed: [],
    }
  });

  const { fields: materialFields, append: appendMaterial, remove: removeMaterial } = useFieldArray({
    control: form.control,
    name: "materialsUsed",
  });

  useEffect(() => {
    if (!authIsLoading && (!user || user.role !== USER_ROLES.ADMIN)) {
      router.replace('/dashboard');
    }
  }, [user, authIsLoading, router]);

  const fetchServicesAndMaterials = useCallback(async () => {
    setIsLoading(true);
    try {
      const [servicesData, materialsData] = await Promise.all([
        getServices(),
        getMaterials(),
      ]);
      setServices(servicesData);
      setMaterials(materialsData);
    } catch (error) {
      toast({ title: "Error", description: "No se pudieron cargar los servicios o materiales.", variant: "destructive" });
      setServices([]);
      setMaterials([]);
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    if (user && user.role === USER_ROLES.ADMIN) {
      fetchServicesAndMaterials();
    }
  }, [fetchServicesAndMaterials, user]);

  const handleAddService = () => {
    setEditingService(null);
    form.reset({ name: '', defaultDuration: { hours: 0, minutes: 30 }, price: undefined, materialsUsed: [] });
    setIsFormOpen(true);
  };

  const handleEditService = (service: Service) => {
    setEditingService(service);
    const hours = Math.floor((service.defaultDuration || 0) / 60);
    const minutes = (service.defaultDuration || 0) % 60;
    form.reset({
      id: service.id,
      name: service.name,
      defaultDuration: { hours, minutes },
      price: service.price ?? undefined,
      materialsUsed: service.materialsUsed?.map(m => ({ materialId: m.materialId, quantity: m.quantity })) || [],
    });
    setIsFormOpen(true);
  };

  const onSubmit = async (data: ServiceFormData) => {
    try {
      if (editingService && editingService.id) {
        const result = await updateService(editingService.id, data);
        if (result) {
             toast({ title: "Servicio Actualizado", description: `${result.name} actualizado.` });
        } else {
            toast({ title: "Error", description: `No se pudo actualizar ${data.name}.`, variant: "destructive" });
        }
      } else {
        const newServiceData = await addService(data);
        toast({ title: "Servicio Agregado", description: `${newServiceData.name} agregado.` });
      }
      setIsFormOpen(false);
      fetchServicesAndMaterials();
    } catch (error) {
      toast({ title: "Error", description: "No se pudo guardar el servicio.", variant: "destructive" });
      console.error(error);
    }
  };

  if (authIsLoading || !user || user.role !== USER_ROLES.ADMIN) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }

  const LoadingState = () => (
     <div className="flex flex-col items-center justify-center h-64 col-span-full">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="mt-4 text-muted-foreground">Cargando servicios...</p>
      </div>
  );

  const NoServicesCard = () => (
    <Card className="col-span-full mt-8 border-dashed border-2">
      <CardContent className="py-10 text-center">
        <AlertTriangle className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
        <h3 className="text-xl font-semibold mb-2">No hay servicios registrados</h3>
        <p className="text-muted-foreground mb-4">
          Agregue servicios para poder asignarlos a las citas.
        </p>
         <Button onClick={handleAddService}>
            <PlusCircle className="mr-2 h-4 w-4" /> Agregar Servicio
          </Button>
      </CardContent>
    </Card>
  );


  return (
    <div className="space-y-6">
      <Card className="shadow-md">
        <CardHeader className="flex flex-col md:flex-row justify-between items-center">
          <div>
            <CardTitle className="text-2xl flex items-center gap-2"><ClipboardList className="text-primary"/> Gestión de Servicios</CardTitle>
            <CardDescription>Ver, agregar o editar los servicios ofrecidos y los materiales que consumen.</CardDescription>
          </div>
          <Button onClick={handleAddService} className="w-full mt-4 md:mt-0 md:w-auto">
            <PlusCircle className="mr-2 h-4 w-4" /> Agregar Servicio
          </Button>
        </CardHeader>
        <CardContent>
          {isLoading ? <LoadingState/> : services.length === 0 ? <NoServicesCard /> : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nombre del Servicio</TableHead>
                  <TableHead className="text-center">Duración (min)</TableHead>
                  <TableHead className="text-right">Precio (S/)</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {services.map(service => (
                  <TableRow key={service.id}>
                    <TableCell className="font-medium">{service.name}</TableCell>
                    <TableCell className="text-center">{service.defaultDuration}</TableCell>
                    <TableCell className="text-right">{service.price ? service.price.toFixed(2) : 'N/A'}</TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" onClick={() => handleEditService(service)}>
                        <Edit2 className="h-4 w-4" /> <span className="sr-only">Editar</span>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingService ? 'Editar' : 'Agregar'} Servicio</DialogTitle>
            <DialogDescription>
              {editingService ? 'Modifique los detalles del servicio.' : 'Complete los detalles para el nuevo servicio.'}
            </DialogDescription>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-4 max-h-[70vh] overflow-y-auto pr-2">
              {editingService && <input type="hidden" {...form.register("id")} value={editingService.id} />}

              <FormField control={form.control} name="name" render={({ field }) => (
                <FormItem>
                  <FormLabel>Nombre del Servicio</FormLabel>
                  <FormControl><Input placeholder="Ej: Quiropodia Avanzada" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )}/>
              <div>
                <FormLabel>Duración Predeterminada</FormLabel>
                <div className="grid grid-cols-2 gap-4 mt-1">
                  <FormField
                    control={form.control}
                    name="defaultDuration.hours"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs text-muted-foreground">Horas</FormLabel>
                        <FormControl><Input type="number" placeholder="Ej: 1" {...field} onChange={e => field.onChange(parseInt(e.target.value,10) || 0)} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="defaultDuration.minutes"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs text-muted-foreground">Minutos</FormLabel>
                        <FormControl><Input type="number" placeholder="Ej: 30" {...field} onChange={e => field.onChange(parseInt(e.target.value,10) || 0)} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                {form.formState.errors.defaultDuration?.message && (
                    <p className="text-sm font-medium text-destructive mt-1">{form.formState.errors.defaultDuration.message}</p>
                )}
                 {form.formState.errors.defaultDuration?.root?.message && ( // For path: [] errors
                    <p className="text-sm font-medium text-destructive mt-1">{form.formState.errors.defaultDuration.root.message}</p>
                )}
              </div>

              <FormField control={form.control} name="price" render={({ field }) => (
                <FormItem>
                  <FormLabel>Precio (S/) (Opcional)</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      step="0.01"
                      placeholder="Ej: 80.00"
                      {...field}
                      value={field.value ?? ""}
                      onChange={e => {
                        const value = e.target.value;
                        if (value === '') {
                          field.onChange(undefined);
                        } else {
                          const parsedValue = parseFloat(value);
                          field.onChange(isNaN(parsedValue) ? undefined : parsedValue);
                        }
                      }}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}/>

              <Separator />

              <div>
                <h4 className="text-md font-semibold mb-2 flex items-center gap-2"><Package/>Materiales Utilizados</h4>
                 <div className="space-y-3">
                  {materialFields.map((field, index) => (
                    <div key={field.id} className="flex items-end gap-2 p-2 border rounded-md">
                      <FormField
                        control={form.control}
                        name={`materialsUsed.${index}.materialId`}
                        render={({ field }) => (
                          <FormItem className="flex-grow">
                            <FormLabel className="text-xs">Material</FormLabel>
                             <Select onValueChange={field.onChange} value={field.value || undefined} >
                                <FormControl><SelectTrigger><SelectValue placeholder="Seleccionar material" /></SelectTrigger></FormControl>
                                <SelectContent>
                                    {materials.length === 0 && <SelectItem value="no-materials" disabled>No hay materiales definidos</SelectItem>}
                                    {materials.map(mat => (<SelectItem key={mat.id} value={mat.id}>{mat.name} ({mat.unit})</SelectItem>))}
                                </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name={`materialsUsed.${index}.quantity`}
                        render={({ field }) => (
                          <FormItem className="w-24">
                             <FormLabel className="text-xs">Cantidad</FormLabel>
                             <FormControl><Input type="number" {...field} placeholder="1" onChange={e => field.onChange(parseFloat(e.target.value) || 0)} /></FormControl>
                             <FormMessage />
                          </FormItem>
                        )}
                      />
                      <Button type="button" variant="destructive" size="icon" onClick={() => removeMaterial(index)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
                <Button type="button" variant="outline" size="sm" className="mt-2" onClick={() => appendMaterial({ materialId: '', quantity: 1 })} disabled={materials.length === 0}>
                  <PlusCircle className="mr-2 h-4 w-4" /> Añadir Material
                </Button>
                 {materials.length === 0 && <p className="text-xs text-muted-foreground mt-1">Debe agregar insumos en el módulo de Insumos primero.</p>}
              </div>

              <DialogFooter className="pt-4">
                <DialogClose asChild><Button type="button" variant="outline">Cancelar</Button></DialogClose>
                <Button type="submit" disabled={form.formState.isSubmitting}>
                  {form.formState.isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {editingService ? 'Guardar Cambios' : 'Agregar Servicio'}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
