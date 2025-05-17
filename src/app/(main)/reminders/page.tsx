
"use client";

import React, { useState, useEffect, useCallback } from 'react';
import type { PeriodicReminder, PeriodicReminderFormData, ImportantNote, ImportantNoteFormData } from '@/types';
import { useAuth } from '@/contexts/auth-provider';
import { USER_ROLES } from '@/lib/constants';
import { 
  getPeriodicReminders, addPeriodicReminder, updatePeriodicReminder, deletePeriodicReminder as deletePeriodicReminderData,
  getImportantNotes, addImportantNote, updateImportantNote, deleteImportantNote as deleteImportantNoteData
} from '@/lib/data';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
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
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Bell, CalendarClock, StickyNote, ShieldAlert, PlusCircle, Edit2, Trash2, AlertTriangle, Loader2, CheckCircle, XCircle, Clock, FileText } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { PeriodicReminderFormSchema, ImportantNoteFormSchema } from '@/lib/schemas';
import { useToast } from '@/hooks/use-toast';
import { useRouter } from 'next/navigation';
import { format, parseISO, startOfDay, isBefore } from 'date-fns';
import { es } from 'date-fns/locale';
import { cn } from '@/lib/utils';

const RECURRENCE_OPTIONS = [
  { value: 'once', label: 'Una vez' },
  { value: 'monthly', label: 'Mensual' },
  { value: 'quarterly', label: 'Trimestral' },
  { value: 'annually', label: 'Anual' },
];

export default function RemindersPage() {
  const { user, isLoading: authIsLoading } = useAuth();
  const router = useRouter();
  const { toast } = useToast();

  const [reminders, setReminders] = useState<PeriodicReminder[]>([]);
  const [isLoadingReminders, setIsLoadingReminders] = useState(true);
  const [isReminderFormOpen, setIsReminderFormOpen] = useState(false);
  const [editingReminder, setEditingReminder] = useState<PeriodicReminder | null>(null);
  const [reminderToDelete, setReminderToDelete] = useState<PeriodicReminder | null>(null);

  const [notes, setNotes] = useState<ImportantNote[]>([]);
  const [isLoadingNotes, setIsLoadingNotes] = useState(true);
  const [isNoteFormOpen, setIsNoteFormOpen] = useState(false);
  const [editingNote, setEditingNote] = useState<ImportantNote | null>(null);
  const [noteToDelete, setNoteToDelete] = useState<ImportantNote | null>(null);


  const reminderForm = useForm<PeriodicReminderFormData>({
    resolver: zodResolver(PeriodicReminderFormSchema),
    defaultValues: {
      title: '',
      description: '',
      dueDate: new Date(),
      recurrence: 'once',
      amount: undefined,
      status: 'pending',
    },
  });

  const noteForm = useForm<ImportantNoteFormData>({
    resolver: zodResolver(ImportantNoteFormSchema),
    defaultValues: {
      title: '',
      content: '',
    },
  });

  useEffect(() => {
    if (!authIsLoading && (!user || (user.role !== USER_ROLES.ADMIN && user.role !== USER_ROLES.CONTADOR))) {
      router.replace('/dashboard');
    }
  }, [user, authIsLoading, router]);

  const fetchReminders = useCallback(async () => {
    if (!user || (user.role !== USER_ROLES.ADMIN && user.role !== USER_ROLES.CONTADOR)) return;
    setIsLoadingReminders(true);
    try {
      const data = await getPeriodicReminders();
      setReminders(data.sort((a, b) => parseISO(a.dueDate).getTime() - parseISO(b.dueDate).getTime()));
    } catch (error) {
      toast({ title: "Error", description: "No se pudieron cargar los recordatorios.", variant: "destructive" });
    } finally {
      setIsLoadingReminders(false);
    }
  }, [user, toast]);

  const fetchNotes = useCallback(async () => {
    if (!user || (user.role !== USER_ROLES.ADMIN && user.role !== USER_ROLES.CONTADOR)) return;
    setIsLoadingNotes(true);
    try {
      const data = await getImportantNotes();
      setNotes(data.sort((a,b) => parseISO(b.createdAt || new Date(0).toISOString()).getTime() - parseISO(a.createdAt || new Date(0).toISOString()).getTime()));
    } catch (error) {
      toast({ title: "Error", description: "No se pudieron cargar las notas.", variant: "destructive" });
    } finally {
      setIsLoadingNotes(false);
    }
  }, [user, toast]);


  useEffect(() => {
    fetchReminders();
    fetchNotes();
  }, [fetchReminders, fetchNotes]);

  // Reminder Handlers
  const handleAddReminder = () => {
    setEditingReminder(null);
    reminderForm.reset({
      title: '',
      description: '',
      dueDate: new Date(),
      recurrence: 'once',
      amount: undefined,
      status: 'pending',
    });
    setIsReminderFormOpen(true);
  };

  const handleEditReminder = (reminder: PeriodicReminder) => {
    setEditingReminder(reminder);
    reminderForm.reset({
      title: reminder.title,
      description: reminder.description || '',
      dueDate: parseISO(reminder.dueDate),
      recurrence: reminder.recurrence,
      amount: reminder.amount ?? undefined,
      status: reminder.status,
    });
    setIsReminderFormOpen(true);
  };

  const handleDeleteReminder = async () => {
    if (!reminderToDelete) return;
    try {
      await deletePeriodicReminderData(reminderToDelete.id);
      toast({ title: "Recordatorio Eliminado", description: `"${reminderToDelete.title}" ha sido eliminado.` });
      setReminderToDelete(null);
      fetchReminders();
    } catch (error) {
      toast({ title: "Error", description: "No se pudo eliminar el recordatorio.", variant: "destructive" });
    }
  };

  const handleTogglePaidStatus = async (reminder: PeriodicReminder) => {
    const newStatus = reminder.status === 'pending' ? 'paid' : 'pending';
    try {
      await updatePeriodicReminder(reminder.id, { ...reminder, status: newStatus, dueDate: reminder.dueDate });
      toast({ title: "Estado Actualizado", description: `El recordatorio "${reminder.title}" ahora está ${newStatus === 'paid' ? 'pagado' : 'pendiente'}.` });
      fetchReminders();
    } catch (error) {
      toast({ title: "Error", description: "No se pudo actualizar el estado del recordatorio.", variant: "destructive" });
    }
  };

  const onSubmitReminderForm = async (data: PeriodicReminderFormData) => {
    try {
      if (editingReminder) {
        await updatePeriodicReminder(editingReminder.id, { ...data, id: editingReminder.id, dueDate: format(data.dueDate, "yyyy-MM-dd") });
        toast({ title: "Recordatorio Actualizado", description: `"${data.title}" ha sido actualizado.` });
      } else {
        await addPeriodicReminder({ ...data, dueDate: format(data.dueDate, "yyyy-MM-dd") });
        toast({ title: "Recordatorio Añadido", description: `"${data.title}" ha sido añadido.` });
      }
      setIsReminderFormOpen(false);
      fetchReminders();
    } catch (error) {
      toast({ title: "Error", description: "No se pudo guardar el recordatorio.", variant: "destructive" });
    }
  };
  
  const getReminderDisplayStatus = (reminder: PeriodicReminder): { text: string; variant: "default" | "destructive" | "secondary" | "outline"; icon?: React.ReactNode } => {
    const today = startOfDay(new Date());
    const dueDate = parseISO(reminder.dueDate);

    if (reminder.status === 'paid') {
      return { text: 'Pagado', variant: 'default', icon: <CheckCircle className="h-4 w-4 text-green-500" /> };
    }
    if (isBefore(dueDate, today)) {
      return { text: 'Vencido', variant: 'destructive', icon: <AlertTriangle className="h-4 w-4" /> };
    }
    return { text: 'Pendiente', variant: 'secondary', icon: <Clock className="h-4 w-4 text-orange-500" /> };
  };

  // Note Handlers
  const handleAddNote = () => {
    setEditingNote(null);
    noteForm.reset({ title: '', content: '' });
    setIsNoteFormOpen(true);
  };

  const handleEditNote = (note: ImportantNote) => {
    setEditingNote(note);
    noteForm.reset({ title: note.title, content: note.content, id: note.id });
    setIsNoteFormOpen(true);
  };

  const handleDeleteNote = async () => {
    if (!noteToDelete) return;
    try {
      await deleteImportantNoteData(noteToDelete.id);
      toast({ title: "Nota Eliminada", description: `"${noteToDelete.title}" ha sido eliminada.` });
      setNoteToDelete(null);
      fetchNotes();
    } catch (error) {
      toast({ title: "Error", description: "No se pudo eliminar la nota.", variant: "destructive" });
    }
  };

  const onSubmitNoteForm = async (data: ImportantNoteFormData) => {
    try {
      if (editingNote) {
        await updateImportantNote(editingNote.id, data);
        toast({ title: "Nota Actualizada", description: `"${data.title}" ha sido actualizada.` });
      } else {
        await addImportantNote(data);
        toast({ title: "Nota Añadida", description: `"${data.title}" ha sido añadida.` });
      }
      setIsNoteFormOpen(false);
      fetchNotes();
    } catch (error) {
      toast({ title: "Error", description: "No se pudo guardar la nota.", variant: "destructive" });
    }
  };


  if (authIsLoading || !user || (user.role !== USER_ROLES.ADMIN && user.role !== USER_ROLES.CONTADOR)) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8 px-4 md:px-0 space-y-6">
      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle className="text-3xl flex items-center gap-2">
            <Bell className="text-primary" />
            Gestión de Recordatorios y Notas
          </CardTitle>
          <CardDescription>
            Administre sus recordatorios de pagos periódicos y notas importantes de la empresa.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <Card>
            <CardHeader className="flex flex-row justify-between items-center">
              <div>
                <CardTitle className="text-xl flex items-center gap-2">
                  <CalendarClock className="text-accent" />
                  Recordatorios Periódicos
                </CardTitle>
                <CardDescription>
                  Configure alertas para pagos recurrentes como tributos, servicios y créditos.
                </CardDescription>
              </div>
              <Button onClick={handleAddReminder}>
                <PlusCircle className="mr-2 h-4 w-4" /> Añadir Recordatorio
              </Button>
            </CardHeader>
            <CardContent>
              {isLoadingReminders ? (
                <div className="flex justify-center items-center h-40">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  <p className="ml-2 text-muted-foreground">Cargando recordatorios...</p>
                </div>
              ) : reminders.length === 0 ? (
                <div className="p-6 border rounded-lg bg-secondary/30 text-center">
                  <ShieldAlert className="h-10 w-10 text-muted-foreground mx-auto mb-2" />
                  <p className="text-muted-foreground">
                    No hay recordatorios periódicos configurados. ¡Añade el primero!
                  </p>
                </div>
              ) : (
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Título</TableHead>
                        <TableHead>Fecha Vencimiento</TableHead>
                        <TableHead className="hidden md:table-cell">Recurrencia</TableHead>
                        <TableHead className="hidden sm:table-cell text-right">Monto (S/)</TableHead>
                        <TableHead className="text-center">Estado</TableHead>
                        <TableHead className="text-right">Acciones</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {reminders.map((reminder) => {
                        const displayStatus = getReminderDisplayStatus(reminder);
                        return (
                          <TableRow key={reminder.id} className={cn(displayStatus.variant === 'destructive' && reminder.status === 'pending' && 'bg-destructive/10')}>
                            <TableCell className="font-medium">
                              {reminder.title}
                              {reminder.description && <p className="text-xs text-muted-foreground truncate max-w-xs">{reminder.description}</p>}
                            </TableCell>
                            <TableCell>{format(parseISO(reminder.dueDate), "PPP", { locale: es })}</TableCell>
                            <TableCell className="hidden md:table-cell">{RECURRENCE_OPTIONS.find(opt => opt.value === reminder.recurrence)?.label}</TableCell>
                            <TableCell className="hidden sm:table-cell text-right">{reminder.amount ? reminder.amount.toFixed(2) : '-'}</TableCell>
                            <TableCell className="text-center">
                              <Badge variant={displayStatus.variant} className="text-xs">
                                {displayStatus.icon && <span className="mr-1">{displayStatus.icon}</span>}
                                {displayStatus.text}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right space-x-1">
                              <Button variant={reminder.status === 'paid' ? "outline" : "default"} size="xs" onClick={() => handleTogglePaidStatus(reminder)}>
                                {reminder.status === 'paid' ? <XCircle className="mr-1 h-3 w-3" /> : <CheckCircle className="mr-1 h-3 w-3" />}
                                {reminder.status === 'paid' ? 'Marcar Pendiente' : 'Marcar Pagado'}
                              </Button>
                              <Button variant="ghost" size="icon-xs" onClick={() => handleEditReminder(reminder)} title="Editar">
                                <Edit2 className="h-4 w-4" />
                              </Button>
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button variant="ghost" size="icon-xs" onClick={() => setReminderToDelete(reminder)} title="Eliminar">
                                    <Trash2 className="h-4 w-4 text-destructive" />
                                  </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>¿Confirmar Eliminación?</AlertDialogTitle>
                                    <AlertDialogDescription>
                                      Esta acción no se puede deshacer. ¿Estás seguro de que quieres eliminar el recordatorio "{reminderToDelete?.title}"?
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel onClick={() => setReminderToDelete(null)}>Cancelar</AlertDialogCancel>
                                    <AlertDialogAction onClick={handleDeleteReminder} className={buttonVariants({ variant: "destructive" })}>
                                      Eliminar
                                    </AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row justify-between items-center">
              <div>
                <CardTitle className="text-xl flex items-center gap-2">
                  <StickyNote className="text-accent" />
                  Notas Importantes
                </CardTitle>
                <CardDescription>
                  Guarde y organice información crucial y datos relevantes para su empresa.
                </CardDescription>
              </div>
              <Button onClick={handleAddNote}>
                <PlusCircle className="mr-2 h-4 w-4" /> Añadir Nota
              </Button>
            </CardHeader>
            <CardContent>
              {isLoadingNotes ? (
                <div className="flex justify-center items-center h-40">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                   <p className="ml-2 text-muted-foreground">Cargando notas...</p>
                </div>
              ) : notes.length === 0 ? (
                <div className="p-6 border rounded-lg bg-secondary/30 text-center">
                  <FileText className="h-10 w-10 text-muted-foreground mx-auto mb-2" />
                  <p className="text-muted-foreground">
                    No hay notas importantes guardadas. ¡Añade la primera!
                  </p>
                </div>
              ) : (
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Título</TableHead>
                        <TableHead>Contenido (Vista Previa)</TableHead>
                        <TableHead className="hidden md:table-cell">Fecha Creación</TableHead>
                        <TableHead className="text-right">Acciones</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {notes.map((note) => (
                        <TableRow key={note.id}>
                          <TableCell className="font-medium">{note.title}</TableCell>
                          <TableCell className="text-sm text-muted-foreground max-w-xs truncate">{note.content}</TableCell>
                          <TableCell className="hidden md:table-cell">{note.createdAt ? format(parseISO(note.createdAt), "PPP", { locale: es }) : '-'}</TableCell>
                          <TableCell className="text-right space-x-1">
                            <Button variant="ghost" size="icon-xs" onClick={() => handleEditNote(note)} title="Editar Nota">
                              <Edit2 className="h-4 w-4" />
                            </Button>
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button variant="ghost" size="icon-xs" onClick={() => setNoteToDelete(note)} title="Eliminar Nota">
                                  <Trash2 className="h-4 w-4 text-destructive" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>¿Confirmar Eliminación?</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    Esta acción no se puede deshacer. ¿Estás seguro de que quieres eliminar la nota "{noteToDelete?.title}"?
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel onClick={() => setNoteToDelete(null)}>Cancelar</AlertDialogCancel>
                                  <AlertDialogAction onClick={handleDeleteNote} className={buttonVariants({ variant: "destructive" })}>
                                    Eliminar
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </CardContent>
      </Card>

      {/* Reminder Form Dialog */}
      <Dialog open={isReminderFormOpen} onOpenChange={setIsReminderFormOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingReminder ? 'Editar' : 'Añadir'} Recordatorio</DialogTitle>
          </DialogHeader>
          <Form {...reminderForm}>
            <form onSubmit={reminderForm.handleSubmit(onSubmitReminderForm)} className="space-y-4 py-2 max-h-[70vh] overflow-y-auto pr-2">
              <FormField
                control={reminderForm.control}
                name="title"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Título</FormLabel>
                    <FormControl><Input placeholder="Ej: Pago de IGV" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={reminderForm.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Descripción (Opcional)</FormLabel>
                    <FormControl><Textarea placeholder="Ej: Declaración mensual, periodo 05-2025" {...field} value={field.value || ''}/></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={reminderForm.control}
                name="dueDate"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>Fecha de Vencimiento</FormLabel>
                    <Popover>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button variant="outline" className={cn("w-full pl-3 text-left font-normal", !field.value && "text-muted-foreground")}>
                            {field.value ? format(field.value, "PPP", { locale: es }) : <span>Seleccionar fecha</span>}
                            <CalendarClock className="ml-auto h-4 w-4 opacity-50" />
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar mode="single" selected={field.value} onSelect={field.onChange} initialFocus />
                      </PopoverContent>
                    </Popover>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={reminderForm.control}
                name="recurrence"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Recurrencia</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl><SelectTrigger><SelectValue placeholder="Seleccionar recurrencia" /></SelectTrigger></FormControl>
                      <SelectContent>
                        {RECURRENCE_OPTIONS.map(opt => (
                          <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={reminderForm.control}
                name="amount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Monto (S/) (Opcional)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="0.01"
                        placeholder="Ej: 150.50"
                        {...field}
                        value={field.value ?? ""}
                        onChange={e => field.onChange(e.target.value ? parseFloat(e.target.value) : undefined)}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
               <FormField
                control={reminderForm.control}
                name="status"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center space-x-3 space-y-0 rounded-md border p-3 shadow-sm">
                    <FormControl>
                      <Checkbox
                        checked={field.value === 'paid'}
                        onCheckedChange={(checked) => field.onChange(checked ? 'paid' : 'pending')}
                      />
                    </FormControl>
                    <div className="space-y-1 leading-none">
                      <FormLabel>¿Marcar como Pagado?</FormLabel>
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <DialogFooter className="pt-4">
                <DialogClose asChild><Button type="button" variant="outline">Cancelar</Button></DialogClose>
                <Button type="submit" disabled={reminderForm.formState.isSubmitting}>
                  {reminderForm.formState.isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {editingReminder ? 'Guardar Cambios' : 'Añadir Recordatorio'}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Note Form Dialog */}
      <Dialog open={isNoteFormOpen} onOpenChange={setIsNoteFormOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingNote ? 'Editar' : 'Añadir'} Nota Importante</DialogTitle>
          </DialogHeader>
          <Form {...noteForm}>
            <form onSubmit={noteForm.handleSubmit(onSubmitNoteForm)} className="space-y-4 py-2 max-h-[70vh] overflow-y-auto pr-2">
              <FormField
                control={noteForm.control}
                name="title"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Título</FormLabel>
                    <FormControl><Input placeholder="Ej: Contacto Proveedor X" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={noteForm.control}
                name="content"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Contenido</FormLabel>
                    <FormControl><Textarea placeholder="Detalles de la nota..." {...field} rows={5} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <DialogFooter className="pt-4">
                <DialogClose asChild><Button type="button" variant="outline">Cancelar</Button></DialogClose>
                <Button type="submit" disabled={noteForm.formState.isSubmitting}>
                  {noteForm.formState.isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {editingNote ? 'Guardar Cambios' : 'Añadir Nota'}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
