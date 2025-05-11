
"use client";

import type { Service, ServiceFormData } from '@/types';
import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/auth-provider';
import { getServices, addService, updateService } from '@/lib/data';
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
import { PlusCircle, Edit2, ClipboardList, Loader2, AlertTriangle } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ServiceFormSchema } from '@/lib/schemas';
import { useToast } from '@/hooks/use-toast';
import { useRouter } from 'next/navigation';

export default function ServicesPage() {
  const { user, isLoading: authIsLoading } = useAuth();
  const { toast } = useToast();
  const router = useRouter();

  const [services, setServices] = useState<Service[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingService, setEditingService] = useState<Service | null>(null);

  const form = useForm<ServiceFormData>({
    resolver: zodResolver(ServiceFormSchema),
    defaultValues: {
      name: '',
      defaultDuration: 30,
      price: undefined,
    }
  });

  useEffect(() => {
    if (!authIsLoading && (!user || user.role !== USER_ROLES.ADMIN)) {
      router.replace('/dashboard');
    }
  }, [user, authIsLoading, router]);

  const fetchServices = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await getServices();
      setServices(data);
    } catch (error) {
      toast({ title: "Error", description: "No se pudieron cargar los servicios.", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    if (user && user.role === USER_ROLES.ADMIN) {
      fetchServices();
    }
  }, [fetchServices, user]);

  const handleAddService = () => {
    setEditingService(null);
    form.reset({ name: '', defaultDuration: 30, price: undefined });
    setIsFormOpen(true);
  };

  const handleEditService = (service: Service) => {
    setEditingService(service);
    form.reset(service);
    setIsFormOpen(true);
  };

  const onSubmit = async (data: ServiceFormData) => {
    form.formState.isSubmitting;
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
      fetchServices();
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
            <CardDescription>Ver, agregar o editar los servicios ofrecidos.</CardDescription>
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
              <FormField control={form.control} name="defaultDuration" render={({ field }) => (
                <FormItem>
                  <FormLabel>Duración Predeterminada (minutos)</FormLabel>
                  <FormControl><Input type="number" placeholder="Ej: 60" {...field} onChange={e => field.onChange(parseInt(e.target.value,10) || 0)} /></FormControl>
                  <FormMessage />
                </FormItem>
              )}/>
              <FormField control={form.control} name="price" render={({ field }) => (
                <FormItem>
                  <FormLabel>Precio (S/) (Opcional)</FormLabel>
                  <FormControl><Input type="number" step="0.01" placeholder="Ej: 80.00" {...field} onChange={e => field.onChange(parseFloat(e.target.value) || undefined)} /></FormControl>
                  <FormMessage />
                </FormItem>
              )}/>
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
