
"use client";

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import type { Patient, Appointment } from '@/types';
import { useAuth } from '@/contexts/auth-provider';
import { getPatients, addPatient, findPatient, getAppointments, updatePatient, getPatientById } from '@/lib/data';
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
import { PlusCircle, Edit2, Users, Search, Loader2, FileText, CalendarClock, ChevronsDown, AlertTriangle, Cake, CheckSquare, Square, UserRound } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { PatientFormSchema, type PatientFormData } from '@/lib/schemas';
import { useToast } from '@/hooks/use-toast';
import { PatientHistoryPanel } from '@/components/appointments/patient-history-panel';
import { AttendancePredictionTool } from '@/components/appointments/attendance-prediction-tool';
import { formatISO, startOfDay, parseISO, differenceInYears } from 'date-fns';
import { useAppState } from '@/contexts/app-state-provider';
import { USER_ROLES } from '@/lib/constants';

const PATIENTS_PER_PAGE = 8; 

export default function PatientsPage() {
  const { user } = useAuth();
  const { selectedLocationId: adminSelectedLocation } = useAppState();
  const { toast } = useToast();
  
  const [allPatients, setAllPatients] = useState<Patient[]>([]);
  const [displayedPatients, setDisplayedPatients] = useState<Patient[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPatientCount, setTotalPatientCount] = useState(0);
  const [lastVisiblePatientId, setLastVisiblePatientId] = useState<string | null>(null);


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
      age: null,
      dateOfBirth: '',
      isDiabetic: false,
      notes: ''
    }
  });

  const fetchPatientsData = useCallback(async (pageToFetch = 1, currentSearchTerm = searchTerm, currentFilterToday = filterPatientsWithAppointmentsToday, lastVisibleId: string | null = null) => {
    setIsLoading(true);
    if (pageToFetch === 1) { 
        setDisplayedPatients([]);
        setLastVisiblePatientId(null);
    }
    try {
      const { patients: fetchedPatients, totalCount, lastVisiblePatientId: newLastVisibleId } = await getPatients({
        page: pageToFetch,
        limit: PATIENTS_PER_PAGE,
        searchTerm: currentSearchTerm,
        filterToday: currentFilterToday,
        adminSelectedLocation: adminSelectedLocation,
        user: user,
        lastVisiblePatientId: pageToFetch > 1 ? lastVisibleId : null,
      });
      
      const sortedPatients = fetchedPatients.sort((a,b) => `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`));

      setDisplayedPatients(prev => pageToFetch === 1 ? sortedPatients : [...prev, ...sortedPatients]);
      setAllPatients(prev => pageToFetch === 1 ? sortedPatients : [...prev, ...sortedPatients].sort((a,b) => `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`)));
      setTotalPatientCount(totalCount);
      setCurrentPage(pageToFetch);
      setLastVisiblePatientId(newLastVisibleId);

    } catch (error) {
      console.error("Error fetching patients:", error);
      toast({ title: "Error", description: "No se pudo cargar la lista de pacientes.", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  }, [searchTerm, filterPatientsWithAppointmentsToday, adminSelectedLocation, user, toast]);


  useEffect(() => {
    fetchPatientsData(1, searchTerm, filterPatientsWithAppointmentsToday, null); 
  }, [fetchPatientsData, searchTerm, filterPatientsWithAppointmentsToday]);


  const fetchPatientsWithAppointmentsToday = useCallback(async () => {
    if (!filterPatientsWithAppointmentsToday) {
      setPatientsWithAppointmentsTodayIds(new Set());
      fetchPatientsData(1, searchTerm, false, null);
      return;
    }
    setIsLoadingTodayAppointments(true);
    try {
      const today = startOfDay(new Date());
      const isAdminOrContador = user?.role === USER_ROLES.ADMIN || user?.role === USER_ROLES.CONTADOR;
      const effectiveLocationId = isAdminOrContador
        ? (adminSelectedLocation === 'all' ? undefined : adminSelectedLocation) 
        : user?.locationId;

      const { appointments: dailyAppointments } = await getAppointments({ 
        date: today,
        locationId: effectiveLocationId 
      });
      const patientIds = new Set(dailyAppointments.map(app => app.patientId));
      setPatientsWithAppointmentsTodayIds(patientIds);
      fetchPatientsData(1, searchTerm, true, null); 
    } catch (error) {
      console.error("Error fetching patients with appointments today:", error);
      toast({ title: "Error", description: "No se pudo cargar pacientes con citas hoy.", variant: "destructive" });
    } finally {
      setIsLoadingTodayAppointments(false);
    }
  }, [filterPatientsWithAppointmentsToday, user, adminSelectedLocation, toast, fetchPatientsData, searchTerm]);

 
  useEffect(() => {
     if (filterPatientsWithAppointmentsToday) {
        fetchPatientsWithAppointmentsToday();
     } else {
        setPatientsWithAppointmentsTodayIds(new Set());
        fetchPatientsData(1, searchTerm, false, null);
     }
  }, [filterPatientsWithAppointmentsToday]); 


  const handleAddPatient = () => {
    setEditingPatient(null);
    form.reset({ firstName: '', lastName: '', phone: '', age: null, dateOfBirth: '', isDiabetic: false, notes: '' });
    setIsFormOpen(true);
  };

  const handleEditPatient = (patient: Patient) => {
    setEditingPatient(patient);
    form.reset({
        ...patient,
        phone: (user?.role === USER_ROLES.ADMIN) ? patient.phone : undefined, 
        age: patient.age ?? null,
        dateOfBirth: patient.dateOfBirth || '',
        isDiabetic: patient.isDiabetic || false,
    });
    setIsFormOpen(true);
  };
  
  const handleViewDetails = (patient: Patient) => {
    setViewingPatientDetails(patient);
  };

  const onSubmit = async (data: PatientFormData) => {
    try {
      const patientDataToSave = {
        ...data,
        age: data.age === 0 ? null : data.age, 
      };

      if (editingPatient && editingPatient.id) {
        const patientToUpdate = { ...editingPatient, ...patientDataToSave };
        if(user?.role !== USER_ROLES.ADMIN) {
            const originalPatient = await getPatientById(editingPatient.id);
            patientToUpdate.phone = originalPatient?.phone;
        }
        await updatePatient(editingPatient.id, patientToUpdate);
        toast({ title: "Paciente Actualizado", description: `${data.firstName} ${data.lastName} actualizado.` });
      } else {
        const existing = await findPatient(data.firstName, data.lastName);
        if (existing) {
            toast({ title: "Paciente Existente", description: "Ya existe un paciente con ese nombre y apellido.", variant: "destructive" });
            return;
        }
        const newPatientData = { ...patientDataToSave, isDiabetic: data.isDiabetic || false };
        await addPatient(newPatientData as Omit<Patient, 'id'>);
        toast({ title: "Paciente Agregado", description: `${data.firstName} ${data.lastName} agregado.` });
      }
      setIsFormOpen(false);
      fetchPatientsData(1, searchTerm, filterPatientsWithAppointmentsToday, null); 

    } catch (error) {
      toast({ title: "Error", description: "No se pudo guardar el paciente.", variant: "destructive" });
      console.error(error);
    }
  };

  const handleSearchTermChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newSearchTerm = e.target.value;
    setSearchTerm(newSearchTerm);
  };

  const handleFilterTodayChange = (checked: boolean) => {
    setFilterPatientsWithAppointmentsToday(checked);
  };
  
  const handleLoadMore = () => {
    fetchPatientsData(currentPage + 1, searchTerm, filterPatientsWithAppointmentsToday, lastVisiblePatientId);
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
           (searchTerm !== '' ? "No hay pacientes que coincidan con la búsqueda." : "No hay pacientes registrados.")}
        </p>
        { (searchTerm || filterPatientsWithAppointmentsToday) &&
          <Button onClick={() => { setSearchTerm(''); setFilterPatientsWithAppointmentsToday(false);}} variant="outline">
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
                placeholder="Buscar pacientes por nombre o teléfono..."
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

          {isLoading && displayedPatients.length === 0 && currentPage === 1 ? <LoadingState /> : 
           displayedPatients.length === 0 && !isLoading ? <NoPatientsCard /> : (
          <>
            <p className="text-sm text-muted-foreground mb-4">
              Mostrando {displayedPatients.length} de {totalPatientCount} pacientes.
            </p>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nombre Completo</TableHead>
                    <TableHead className="hidden md:table-cell">Teléfono</TableHead>
                    <TableHead className="hidden sm:table-cell">Edad</TableHead>
                    <TableHead className="hidden lg:table-cell text-center">Diabético</TableHead>
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
                      <TableCell className="hidden sm:table-cell">{(patient.age && patient.age > 0) ? patient.age : 'N/A'}</TableCell>
                      <TableCell className="hidden lg:table-cell text-center">
                        {patient.isDiabetic ? <CheckSquare className="h-5 w-5 text-red-600 mx-auto" /> : <Square className="h-5 w-5 text-muted-foreground mx-auto" />}
                      </TableCell>
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
             {displayedPatients.length < totalPatientCount && !isLoading && (
              <div className="mt-8 text-center">
                <Button onClick={handleLoadMore} variant="outline" disabled={isLoading}>
                  {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ChevronsDown className="mr-2 h-4 w-4" />}
                   Cargar Más Pacientes
                </Button>
              </div>
            )}
             {isLoading && currentPage > 1 && <div className="text-center mt-4"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>}
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
                      <FormLabel>Teléfono (Opcional)</FormLabel>
                      { (user?.role === USER_ROLES.ADMIN || !editingPatient) ? (
                        <FormControl><Input type="tel" placeholder="Ej: 987654321" {...field} /></FormControl>
                      ) : (
                        <p className="pt-2 text-sm text-muted-foreground">Restringido</p>
                      )}
                      <FormMessage />
                  </FormItem>
               )}/>
                <FormField control={form.control} name="age" render={({ field }) => (
                  <FormItem>
                      <FormLabel className="flex items-center gap-1"><UserRound size={16}/>Edad (Opcional)</FormLabel>
                      <FormControl><Input type="number" placeholder="Ej: 30" {...field} onChange={e => field.onChange(e.target.value === '' ? null : parseInt(e.target.value,10) || null)}/></FormControl>
                      <FormMessage />
                  </FormItem>
                )}/>
               <FormField control={form.control} name="dateOfBirth" render={({ field }) => (
                  <FormItem>
                      <FormLabel className="flex items-center gap-1"><Cake size={16}/>Fecha de Cumpleaños (DD-MM) (Opcional)</FormLabel>
                      <FormControl><Input type="text" placeholder="DD-MM" {...field} /></FormControl>
                      <FormMessage />
                  </FormItem>
               )}/>
                <FormField
                    control={form.control}
                    name="isDiabetic"
                    render={({ field }) => (
                    <FormItem className="flex flex-row items-center space-x-3 space-y-0 rounded-md border p-3 shadow-sm">
                        <FormControl>
                        <Checkbox
                            checked={field.value}
                            onCheckedChange={field.onChange}
                        />
                        </FormControl>
                        <div className="space-y-1 leading-none">
                        <FormLabel>
                            ¿Es paciente diabético?
                        </FormLabel>
                        </div>
                        <FormMessage />
                    </FormItem>
                    )}
                />
               <FormField control={form.control} name="notes" render={({ field }) => (
                  <FormItem>
                      <FormLabel>Notas Adicionales (Opcional)</FormLabel>
                      <FormControl><Textarea placeholder="Preferencias, alergias, etc." {...field} /></FormControl>
                      <FormMessage />
                  </FormItem>
               )}/>
              <DialogFooter className="pt-4">
                <DialogClose asChild><Button type="button" variant="outline">Cancelar</Button></DialogClose>
                <Button type="submit" disabled={form.formState.isSubmitting}>{form.formState.isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : (editingPatient ? 'Guardar Cambios' : 'Agregar Paciente')}</Button>
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

