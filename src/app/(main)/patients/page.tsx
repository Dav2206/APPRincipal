
"use client";

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import type { Patient, Appointment } from '@/types';
import { useAuth } from '@/contexts/auth-provider';
import { getPatients, addPatient, findPatient, getAppointments } from '@/lib/data'; 
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
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
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { PlusCircle, Edit2, Users, Search, Loader2, FileText, CalendarClock, ChevronsDown, AlertTriangle, Cake } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useToast } from '@/hooks/use-toast';
import { PatientHistoryPanel } from '@/components/appointments/patient-history-panel';
import { AttendancePredictionTool } from '@/components/appointments/attendance-prediction-tool';
import { formatISO, startOfDay, parseISO, differenceInYears } from 'date-fns';
import { useAppState } from '@/contexts/app-state-provider';
import { USER_ROLES } from '@/lib/constants';

const PATIENTS_PER_PAGE = 20;

const PatientFormSchema = z.object({
  id: z.string().optional(),
  firstName: z.string().min(2, "Nombre es requerido."),
  lastName: z.string().min(2, "Apellido es requerido."),
  phone: z.string().optional(),
  email: z.string().email("Email inválido.").optional().or(z.literal('')),
  dateOfBirth: z.string().optional().refine(val => !val || /^\d{4}-\d{2}-\d{2}$/.test(val), {
    message: "Formato de fecha debe ser YYYY-MM-DD",
  }),
  notes: z.string().optional(),
});
type PatientFormData = z.infer<typeof PatientFormSchema>;

export default function PatientsPage() {
  const { user } = useAuth();
  const { selectedLocationId: adminSelectedLocation } = useAppState();
  const { toast } = useToast();
  
  const [allPatients, setAllPatients] = useState<Patient[]>([]);
  const [displayedPatients, setDisplayedPatients] = useState<Patient[]>([]);
  const [currentPage, setCurrentPage] = useState(1);

  const [isLoading, setIsLoading] = useState(true);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingPatient, setEditingPatient] = useState<Patient | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [viewingPatientDetails, setViewingPatientDetails] = useState<Patient | null>(null);
  const [filterPatientsWithAppointmentsToday, setFilterPatientsWithAppointmentsToday] = useState(false);
  const [patientsWithAppointmentsTodayIds, setPatientsWithAppointmentsTodayIds] = useState<Set<string>>(new Set());
  const [isLoadingTodayAppointments, setIsLoadingTodayAppointments] = useState(false);

  const form = useForm<PatientFormData>({
    resolver: zodResolver(PatientFormSchema),
    defaultValues: { 
      firstName: '',
      lastName: '',
      phone: '',
      email: '',
      dateOfBirth: '',
      notes: ''
    }
  });

  const fetchAllPatients = useCallback(async () => {
    setIsLoading(true);
    setCurrentPage(1);
    setDisplayedPatients([]);
    const data = await getPatients();
    setAllPatients(data.sort((a,b) => `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`)));
    setIsLoading(false);
  }, []);

  useEffect(() => {
    fetchAllPatients();
  }, [fetchAllPatients]);

  const fetchPatientsWithAppointmentsToday = useCallback(async () => {
    if (!filterPatientsWithAppointmentsToday) {
      setPatientsWithAppointmentsTodayIds(new Set());
      return;
    }
    setIsLoadingTodayAppointments(true);
    try {
      const today = startOfDay(new Date());
      const isAdminOrContador = user?.role === USER_ROLES.ADMIN || user?.role === USER_ROLES.CONTADOR;
      const effectiveLocationId = isAdminOrContador
        ? (adminSelectedLocation === 'all' ? undefined : adminSelectedLocation) 
        : user?.locationId;

      const dailyAppointments = await getAppointments({ 
        date: today,
        locationId: effectiveLocationId 
      });
      const patientIds = new Set(dailyAppointments.map(app => app.patientId));
      setPatientsWithAppointmentsTodayIds(patientIds);
    } catch (error) {
      console.error("Error fetching patients with appointments today:", error);
      toast({ title: "Error", description: "No se pudo cargar pacientes con citas hoy.", variant: "destructive" });
    } finally {
      setIsLoadingTodayAppointments(false);
    }
  }, [filterPatientsWithAppointmentsToday, user, adminSelectedLocation, toast]);

  useEffect(() => {
    fetchPatientsWithAppointmentsToday();
  }, [fetchPatientsWithAppointmentsToday]);


  const { totalFilteredPatientList, totalFilteredCount } = useMemo(() => {
    let filtered = [...allPatients];
    
    if (searchTerm) {
      filtered = filtered.filter(p =>
        `${p.firstName} ${p.lastName}`.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (p.phone && p.phone.includes(searchTerm)) ||
        (p.email && p.email.toLowerCase().includes(searchTerm.toLowerCase()))
      );
    }

    if (filterPatientsWithAppointmentsToday) {
      filtered = filtered.filter(p => patientsWithAppointmentsTodayIds.has(p.id));
    }
    
    return { totalFilteredPatientList: filtered, totalFilteredCount: filtered.length };
  }, [allPatients, searchTerm, filterPatientsWithAppointmentsToday, patientsWithAppointmentsTodayIds]);

  useEffect(() => {
    const startIndex = 0; 
    const endIndex = currentPage * PATIENTS_PER_PAGE;
    setDisplayedPatients(totalFilteredPatientList.slice(startIndex, endIndex));
  }, [totalFilteredPatientList, currentPage]);


  const handleAddPatient = () => {
    setEditingPatient(null);
    form.reset({ firstName: '', lastName: '', phone: '', email: '', dateOfBirth: '', notes: '' });
    setIsFormOpen(true);
  };

  const handleEditPatient = (patient: Patient) => {
    setEditingPatient(patient);
    form.reset(patient); // Full patient data for admin, phone will be handled by conditional rendering
    setIsFormOpen(true);
  };
  
  const handleViewDetails = (patient: Patient) => {
    setViewingPatientDetails(patient);
  };

  const onSubmit = async (data: PatientFormData) => {
    try {
      if (editingPatient) {
        // For non-admins, if phone field was not rendered, data.phone will be undefined.
        // We want to preserve the original phone in that case.
        const currentPatientData = allPatients.find(p => p.id === editingPatient.id);
        let phoneToSave = data.phone;
        if (user?.role !== USER_ROLES.ADMIN && currentPatientData) {
          phoneToSave = currentPatientData.phone; // Preserve original phone if non-admin is editing
        }

        const updatedPatientData = { 
          ...editingPatient, 
          ...data,
          phone: (user?.role === USER_ROLES.ADMIN) ? data.phone : editingPatient.phone, // Only admin can change phone
        };

        setAllPatients(prev => prev.map(p => p.id === updatedPatientData.id ? updatedPatientData : p).sort((a,b) => `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`)));
        toast({ title: "Paciente Actualizado", description: `${data.firstName} ${data.lastName} actualizado.` });
      } else {
        const existing = await findPatient(data.firstName, data.lastName);
        if (existing) {
            toast({ title: "Paciente Existente", description: "Ya existe un paciente con ese nombre y apellido.", variant: "destructive" });
            return;
        }
        const newPatient = await addPatient(data as Omit<Patient, 'id'>);
        setAllPatients(prev => [newPatient, ...prev].sort((a,b) => `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`)));
        toast({ title: "Paciente Agregado", description: `${newPatient.firstName} ${newPatient.lastName} agregado.` });
      }
      setIsFormOpen(false);
    } catch (error) {
      toast({ title: "Error", description: "No se pudo guardar el paciente.", variant: "destructive" });
      console.error(error);
    }
  };

  const handleSearchTermChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(e.target.value);
    setCurrentPage(1);
  };

  const handleFilterTodayChange = (checked: boolean) => {
    setFilterPatientsWithAppointmentsToday(checked);
    setCurrentPage(1);
  };
  
  const handleLoadMore = () => {
    setCurrentPage(prevPage => prevPage + 1);
  };

  const calculateAge = (dateOfBirth?: string): string => {
    if (!dateOfBirth) return 'N/A';
    try {
      const dob = parseISO(dateOfBirth);
      const age = differenceInYears(new Date(), dob);
      return age.toString();
    } catch {
      return 'Inválida';
    }
  };

  const LoadingState = () => (
     <div className="flex flex-col items-center justify-center h-64 col-span-full">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="mt-4 text-muted-foreground">Cargando pacientes...</p>
      </div>
  );
  
  const NoPatientsCard = () => (
    <Card className="col-span-full mt-8 border-dashed border-2">
      <CardContent className="py-10 text-center">
        <AlertTriangle className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
        <h3 className="text-xl font-semibold mb-2">No se encontraron pacientes</h3>
        <p className="text-muted-foreground mb-4">
          {filterPatientsWithAppointmentsToday && searchTerm === '' ? "No hay pacientes con citas hoy." : 
           filterPatientsWithAppointmentsToday && searchTerm !== '' ? "No hay pacientes con citas hoy que coincidan con la búsqueda." :
           "No se encontraron pacientes que coincidan con los filtros aplicados."}
        </p>
        { (searchTerm || filterPatientsWithAppointmentsToday) &&
          <Button onClick={() => { setSearchTerm(''); setFilterPatientsWithAppointmentsToday(false); setCurrentPage(1);}} variant="outline">
            Limpiar Filtros
          </Button>
        }
      </CardContent>
    </Card>
  );


  return (
    <div className="space-y-6">
      <Card className="shadow-md">
        <CardHeader className="flex flex-col md:flex-row justify-between items-start md:items-center">
          <div>
            <CardTitle className="text-2xl flex items-center gap-2"><Users className="text-primary"/> Gestión de Pacientes</CardTitle>
            <CardDescription>Ver, agregar o editar información de pacientes.</CardDescription>
          </div>
          <Button onClick={handleAddPatient} className="w-full mt-4 md:mt-0 md:w-auto">
            <PlusCircle className="mr-2 h-4 w-4" /> Agregar Paciente
          </Button>
        </CardHeader>
        <CardContent>
          <div className="mb-4 flex flex-col sm:flex-row gap-4">
            <div className="relative flex-grow">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                type="search"
                placeholder="Buscar pacientes por nombre, teléfono o email..."
                value={searchTerm}
                onChange={handleSearchTermChange}
                className="pl-8 w-full"
              />
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox 
                id="filterToday" 
                checked={filterPatientsWithAppointmentsToday} 
                onCheckedChange={(checked) => handleFilterTodayChange(checked as boolean)}
              />
              <Label htmlFor="filterToday" className="text-sm font-medium whitespace-nowrap flex items-center gap-1">
                <CalendarClock size={16} /> Mostrar solo pacientes con citas hoy
              </Label>
              {isLoadingTodayAppointments && <Loader2 className="h-4 w-4 animate-spin" />}
            </div>
          </div>

          {isLoading && displayedPatients.length === 0 ? <LoadingState /> : 
           totalFilteredCount === 0 && !isLoading ? <NoPatientsCard /> : (
          <>
            <p className="text-sm text-muted-foreground mb-4">
              Mostrando {displayedPatients.length} de {totalFilteredCount} pacientes.
            </p>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nombre Completo</TableHead>
                    <TableHead className="hidden md:table-cell">Teléfono</TableHead>
                    <TableHead className="hidden lg:table-cell">Email</TableHead>
                    <TableHead className="hidden sm:table-cell">Edad</TableHead>
                    <TableHead className="text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {displayedPatients.map(patient => (
                    <TableRow key={patient.id}>
                      <TableCell>
                        <div className="font-medium">{patient.firstName} {patient.lastName}</div>
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        {user?.role === USER_ROLES.ADMIN ? (patient.phone || 'N/A') : 'Restringido'}
                      </TableCell>
                      <TableCell className="hidden lg:table-cell">{patient.email || 'N/A'}</TableCell>
                      <TableCell className="hidden sm:table-cell">{calculateAge(patient.dateOfBirth)}</TableCell>
                      <TableCell className="text-right">
                         <Button variant="ghost" size="sm" onClick={() => handleViewDetails(patient)} className="mr-2" title="Ver Detalles">
                          <FileText className="h-4 w-4" /> <span className="sr-only">Detalles</span>
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => handleEditPatient(patient)} title="Editar Paciente">
                          <Edit2 className="h-4 w-4" /> <span className="sr-only">Editar</span>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
             {displayedPatients.length < totalFilteredCount && (
              <div className="mt-8 text-center">
                <Button onClick={handleLoadMore} variant="outline">
                  <ChevronsDown className="mr-2 h-4 w-4" /> Cargar Más Pacientes
                </Button>
              </div>
            )}
          </>
          )}
        </CardContent>
      </Card>

      <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingPatient ? 'Editar' : 'Agregar'} Paciente</DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-4 max-h-[70vh] overflow-y-auto pr-2">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField control={form.control} name="firstName" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nombre(s)</FormLabel>
                    <FormControl><Input placeholder="Ej: Ana" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}/>
                <FormField control={form.control} name="lastName" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Apellido(s)</FormLabel>
                    <FormControl><Input placeholder="Ej: García" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}/>
              </div>
               <FormField control={form.control} name="phone" render={({ field }) => (
                  <FormItem>
                      <FormLabel>Teléfono</FormLabel>
                      { (user?.role === USER_ROLES.ADMIN || !editingPatient) ? (
                        <FormControl><Input type="tel" placeholder="Ej: 987654321" {...field} /></FormControl>
                      ) : (
                        <p className="pt-2 text-sm text-muted-foreground">Restringido</p>
                      )}
                      <FormMessage />
                  </FormItem>
               )}/>
               <FormField control={form.control} name="email" render={({ field }) => (
                  <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl><Input type="email" placeholder="Ej: ana.garcia@mail.com" {...field} /></FormControl>
                      <FormMessage />
                  </FormItem>
               )}/>
               <FormField control={form.control} name="dateOfBirth" render={({ field }) => (
                  <FormItem>
                      <FormLabel>Fecha de Nacimiento (YYYY-MM-DD)</FormLabel>
                      <FormControl><Input type="text" placeholder="Ej: 1990-01-15" {...field} /></FormControl>
                      <FormMessage />
                  </FormItem>
               )}/>
               <FormField control={form.control} name="notes" render={({ field }) => (
                  <FormItem>
                      <FormLabel>Notas Adicionales (Opcional)</FormLabel>
                      <FormControl><Textarea placeholder="Preferencias, alergias, etc." {...field} /></FormControl>
                      <FormMessage />
                  </FormItem>
               )}/>
              <DialogFooter className="pt-4">
                <DialogClose asChild><Button type="button" variant="outline">Cancelar</Button></DialogClose>
                <Button type="submit">{form.formState.isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : (editingPatient ? 'Guardar Cambios' : 'Agregar Paciente')}</Button>
              </DialogFooter>
            </form>
          </Form>
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

