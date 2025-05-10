"use client";

import React, { useState, useEffect, useCallback } from 'react';
import type { Patient } from '@/types';
import { useAuth } from '@/contexts/auth-provider';
import { getPatients, addPatient, findPatient } from '@/lib/data'; // Assuming findPatient and addPatient exist
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
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
  DialogDescription,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
import { PlusCircle, Edit2, User, Mail, Phone, Users, Search, Loader2, FileText } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useToast } from '@/hooks/use-toast';
import { PatientHistoryPanel } from '@/components/appointments/patient-history-panel';
import { AttendancePredictionTool } from '@/components/appointments/attendance-prediction-tool';

const PatientFormSchema = z.object({
  id: z.string().optional(),
  firstName: z.string().min(2, "Nombre es requerido."),
  lastName: z.string().min(2, "Apellido es requerido."),
  phone: z.string().optional(),
  email: z.string().email("Email inválido.").optional().or(z.literal('')),
  dateOfBirth: z.string().optional(), // Consider using a date picker
  notes: z.string().optional(),
});
type PatientFormData = z.infer<typeof PatientFormSchema>;

export default function PatientsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [patients, setPatients] = useState<Patient[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingPatient, setEditingPatient] = useState<Patient | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [viewingPatientDetails, setViewingPatientDetails] = useState<Patient | null>(null);


  const form = useForm<PatientFormData>({
    resolver: zodResolver(PatientFormSchema),
  });

  const fetchPatients = useCallback(async () => {
    setIsLoading(true);
    // In a real app, admin might see all, staff only their location's patients (if relevant)
    // For now, all users see all patients for simplicity.
    const data = await getPatients();
    setPatients(data);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    fetchPatients();
  }, [fetchPatients]);

  const handleAddPatient = () => {
    setEditingPatient(null);
    form.reset({ firstName: '', lastName: '', phone: '', email: '', dateOfBirth: '', notes: '' });
    setIsFormOpen(true);
  };

  const handleEditPatient = (patient: Patient) => {
    setEditingPatient(patient);
    form.reset(patient);
    setIsFormOpen(true);
  };
  
  const handleViewDetails = (patient: Patient) => {
    setViewingPatientDetails(patient);
  };

  const onSubmit = async (data: PatientFormData) => {
    try {
      if (editingPatient) {
        // Update logic (not fully implemented in mock data.ts, would need updatePatient)
        // For now, let's just simulate it by re-fetching.
        const updatedPatient = { ...editingPatient, ...data };
        const index = patients.findIndex(p => p.id === editingPatient.id);
        if (index !== -1) {
          const newPatients = [...patients];
          newPatients[index] = updatedPatient;
          setPatients(newPatients); // Optimistic update
        }
        toast({ title: "Paciente Actualizado", description: `${data.firstName} ${data.lastName} actualizado.` });
      } else {
        const existing = await findPatient(data.firstName, data.lastName);
        if (existing) {
            toast({ title: "Paciente Existente", description: "Ya existe un paciente con ese nombre y apellido.", variant: "destructive" });
            return;
        }
        const newPatient = await addPatient(data as Omit<Patient, 'id'>);
        setPatients(prev => [newPatient, ...prev]);
        toast({ title: "Paciente Agregado", description: `${newPatient.firstName} ${newPatient.lastName} agregado.` });
      }
      setIsFormOpen(false);
      fetchPatients(); // Re-fetch to ensure data consistency after mock operations
    } catch (error) {
      toast({ title: "Error", description: "No se pudo guardar el paciente.", variant: "destructive" });
      console.error(error);
    }
  };

  const filteredPatients = patients.filter(p =>
    `${p.firstName} ${p.lastName}`.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (p.phone && p.phone.includes(searchTerm)) ||
    (p.email && p.email.toLowerCase().includes(searchTerm.toLowerCase()))
  );
  
  const LoadingState = () => (
     <div className="flex flex-col items-center justify-center h-64 col-span-full">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="mt-4 text-muted-foreground">Cargando pacientes...</p>
      </div>
  );

  return (
    <div className="space-y-6">
      <Card className="shadow-md">
        <CardHeader className="flex flex-col md:flex-row justify-between items-center">
          <div>
            <CardTitle className="text-2xl flex items-center gap-2"><Users className="text-primary"/> Gestión de Pacientes</CardTitle>
            <CardDescription>Ver, agregar o editar información de pacientes.</CardDescription>
          </div>
          <Button onClick={handleAddPatient} className="w-full mt-4 md:mt-0 md:w-auto">
            <PlusCircle className="mr-2 h-4 w-4" /> Agregar Paciente
          </Button>
        </CardHeader>
        <CardContent>
          <div className="mb-4">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                type="search"
                placeholder="Buscar pacientes por nombre, teléfono o email..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-8 w-full"
              />
            </div>
          </div>

          {isLoading ? <LoadingState /> : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nombre Completo</TableHead>
                  <TableHead className="hidden md:table-cell">Teléfono</TableHead>
                  <TableHead className="hidden lg:table-cell">Email</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredPatients.length > 0 ? filteredPatients.map(patient => (
                  <TableRow key={patient.id}>
                    <TableCell>
                      <div className="font-medium">{patient.firstName} {patient.lastName}</div>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">{patient.phone || 'N/A'}</TableCell>
                    <TableCell className="hidden lg:table-cell">{patient.email || 'N/A'}</TableCell>
                    <TableCell className="text-right">
                       <Button variant="ghost" size="sm" onClick={() => handleViewDetails(patient)} className="mr-2">
                        <FileText className="h-4 w-4" /> <span className="sr-only">Detalles</span>
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => handleEditPatient(patient)}>
                        <Edit2 className="h-4 w-4" /> <span className="sr-only">Editar</span>
                      </Button>
                    </TableCell>
                  </TableRow>
                )) : (
                  <TableRow>
                    <TableCell colSpan={4} className="h-24 text-center">
                      No se encontraron pacientes.
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
            <DialogTitle>{editingPatient ? 'Editar' : 'Agregar'} Paciente</DialogTitle>
          </DialogHeader>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-4 max-h-[70vh] overflow-y-auto pr-2">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField control={form.control} name="firstName" render={({ field }) => (
                <div className="space-y-1">
                  <Label htmlFor="firstName">Nombre(s)</Label>
                  <Input id="firstName" placeholder="Ej: Ana" {...field} />
                  {form.formState.errors.firstName && <p className="text-xs text-destructive">{form.formState.errors.firstName.message}</p>}
                </div>
              )}/>
              <FormField control={form.control} name="lastName" render={({ field }) => (
                <div className="space-y-1">
                  <Label htmlFor="lastName">Apellido(s)</Label>
                  <Input id="lastName" placeholder="Ej: García" {...field} />
                   {form.formState.errors.lastName && <p className="text-xs text-destructive">{form.formState.errors.lastName.message}</p>}
                </div>
              )}/>
            </div>
             <FormField control={form.control} name="phone" render={({ field }) => (
                <div className="space-y-1">
                    <Label htmlFor="phone">Teléfono</Label>
                    <Input id="phone" type="tel" placeholder="Ej: 987654321" {...field} />
                </div>
             )}/>
             <FormField control={form.control} name="email" render={({ field }) => (
                <div className="space-y-1">
                    <Label htmlFor="email">Email</Label>
                    <Input id="email" type="email" placeholder="Ej: ana.garcia@mail.com" {...field} />
                    {form.formState.errors.email && <p className="text-xs text-destructive">{form.formState.errors.email.message}</p>}
                </div>
             )}/>
             <FormField control={form.control} name="dateOfBirth" render={({ field }) => (
                <div className="space-y-1">
                    <Label htmlFor="dateOfBirth">Fecha de Nacimiento (Opcional)</Label>
                    <Input id="dateOfBirth" type="date" {...field} />
                </div>
             )}/>
             <FormField control={form.control} name="notes" render={({ field }) => (
                <div className="space-y-1">
                    <Label htmlFor="notes">Notas Adicionales (Opcional)</Label>
                    <Textarea id="notes" placeholder="Preferencias, alergias, etc." {...field} />
                </div>
             )}/>
            <DialogFooter className="pt-4">
              <DialogClose asChild><Button type="button" variant="outline">Cancelar</Button></DialogClose>
              <Button type="submit">{editingPatient ? 'Guardar Cambios' : 'Agregar Paciente'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      
      <Dialog open={!!viewingPatientDetails} onOpenChange={() => setViewingPatientDetails(null)}>
        <DialogContent className="sm:max-w-2xl">
            <DialogHeader>
                <DialogTitle>Detalles del Paciente</DialogTitle>
                {viewingPatientDetails && <DialogDescription>{viewingPatientDetails.firstName} {viewingPatientDetails.lastName}</DialogDescription>}
            </DialogHeader>
            {viewingPatientDetails && (
                <div className="py-4 max-h-[70vh] overflow-y-auto pr-2 space-y-4">
                    <PatientHistoryPanel patient={viewingPatientDetails} />
                    <AttendancePredictionTool patientId={viewingPatientDetails.id} />
                </div>
            )}
             <DialogFooter>
                <Button variant="outline" onClick={() => setViewingPatientDetails(null)}>Cerrar</Button>
            </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
