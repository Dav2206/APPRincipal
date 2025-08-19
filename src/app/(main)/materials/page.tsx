
"use client";

import type { Material, MaterialFormData } from '@/types';
import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/auth-provider';
import { getMaterials, addMaterial } from '@/lib/data'; // Assuming update/delete will be added
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
import { PlusCircle, Edit2, Package, Loader2, AlertTriangle, Trash2 } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { MaterialFormSchema } from '@/lib/schemas';
import { useToast } from '@/hooks/use-toast';
import { useRouter } from 'next/navigation';

export default function MaterialsPage() {
  const { user, isLoading: authIsLoading } = useAuth();
  const { toast } = useToast();
  const router = useRouter();

  const [materials, setMaterials] = useState<Material[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingMaterial, setEditingMaterial] = useState<Material | null>(null);

  const form = useForm<MaterialFormData>({
    resolver: zodResolver(MaterialFormSchema),
    defaultValues: {
      name: '',
      unit: '',
    }
  });

  useEffect(() => {
    if (!authIsLoading && (!user || user.role !== USER_ROLES.ADMIN)) {
      router.replace('/dashboard');
    }
  }, [user, authIsLoading, router]);

  const fetchMaterials = useCallback(async () => {
    setIsLoading(true);
    try {
      const materialsData = await getMaterials();
      setMaterials(materialsData);
    } catch (error) {
      toast({ title: "Error", description: "No se pudieron cargar los insumos.", variant: "destructive" });
      setMaterials([]);
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    if (user && user.role === USER_ROLES.ADMIN) {
      fetchMaterials();
    }
  }, [fetchMaterials, user]);

  const handleAddMaterial = () => {
    setEditingMaterial(null);
    form.reset({ name: '', unit: '' });
    setIsFormOpen(true);
  };

  const onSubmit = async (data: MaterialFormData) => {
    try {
      if (editingMaterial) {
        // await updateMaterial(editingMaterial.id, data);
        toast({ title: "Insumo Actualizado (Simulación)", description: `${data.name} actualizado.` });
      } else {
        await addMaterial(data);
        toast({ title: "Insumo Agregado", description: `${data.name} agregado al catálogo.` });
      }
      setIsFormOpen(false);
      fetchMaterials();
    } catch (error) {
      toast({ title: "Error", description: "No se pudo guardar el insumo.", variant: "destructive" });
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
        <p className="mt-4 text-muted-foreground">Cargando insumos...</p>
      </div>
  );

  const NoMaterialsCard = () => (
    <Card className="col-span-full mt-8 border-dashed border-2">
      <CardContent className="py-10 text-center">
        <AlertTriangle className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
        <h3 className="text-xl font-semibold mb-2">No hay insumos registrados</h3>
        <p className="text-muted-foreground mb-4">
          Cree un catálogo de insumos para poder asignarlos a los servicios.
        </p>
         <Button onClick={handleAddMaterial}>
            <PlusCircle className="mr-2 h-4 w-4" /> Agregar Insumo
          </Button>
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-6">
      <Card className="shadow-md">
        <CardHeader className="flex flex-col md:flex-row justify-between items-center">
          <div>
            <CardTitle className="text-2xl flex items-center gap-2"><Package className="text-primary"/> Gestión de Insumos</CardTitle>
            <CardDescription>Cree y gestione el catálogo de materiales utilizados en los servicios.</CardDescription>
          </div>
          <Button onClick={handleAddMaterial} className="w-full mt-4 md:mt-0 md:w-auto">
            <PlusCircle className="mr-2 h-4 w-4" /> Agregar Insumo
          </Button>
        </CardHeader>
        <CardContent>
          {isLoading ? <LoadingState/> : materials.length === 0 ? <NoMaterialsCard /> : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nombre del Insumo</TableHead>
                  <TableHead className="text-center">Unidad de Medida</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {materials.map(material => (
                  <TableRow key={material.id}>
                    <TableCell className="font-medium">{material.name}</TableCell>
                    <TableCell className="text-center">{material.unit}</TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" disabled>
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
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingMaterial ? 'Editar' : 'Agregar'} Insumo</DialogTitle>
            <DialogDescription>
              {editingMaterial ? 'Modifique los detalles del insumo.' : 'Complete los detalles para el nuevo insumo.'}
            </DialogDescription>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-4">
              <FormField control={form.control} name="name" render={({ field }) => (
                <FormItem>
                  <FormLabel>Nombre del Insumo</FormLabel>
                  <FormControl><Input placeholder="Ej: Bisturí Descartable N.º 15" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )}/>
              <FormField control={form.control} name="unit" render={({ field }) => (
                <FormItem>
                  <FormLabel>Unidad de Medida</FormLabel>
                  <FormControl><Input placeholder="Ej: unidad, par, caja" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )}/>
              <DialogFooter className="pt-4">
                <DialogClose asChild><Button type="button" variant="outline">Cancelar</Button></DialogClose>
                <Button type="submit" disabled={form.formState.isSubmitting}>
                  {form.formState.isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {editingMaterial ? 'Guardar Cambios' : 'Agregar Insumo'}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
