
"use client";

import type { Professional, Contract, ContractEditFormData, ProfessionalFormData } from '@/types';
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '@/contexts/auth-provider';
import { useAppState } from '@/contexts/app-state-provider';
import { getProfessionals, updateProfessional } from '@/lib/data';
import type { ContractDisplayStatus } from '@/lib/data';
import { LOCATIONS, USER_ROLES, LocationId } from '@/lib/constants';
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
  DialogDescription,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Loader2, AlertTriangle, FileSpreadsheet, Eye, ChevronsDown, Edit3, Calendar as CalendarIconLucide, Filter, PlusCircle } from 'lucide-react'; // Changed Building to Filter
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { useRouter } from 'next/navigation';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ContractEditFormSchema } from '@/lib/schemas';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useToast } from '@/hooks/use-toast';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator'; // Added Separator

const CONTRACTS_PER_PAGE = 10;
const ALL_EMPRESAS_VALUE = "all_empresas_placeholder";
const NINGUNA_EMPRESA_FORM_VALUE = null;
const NINGUNA_EMPRESA_SELECT_ITEM_VALUE = "_select_item_ninguna_empresa_";

export default function ContractsPage() {
  const { user, isLoading: authIsLoading } = useAuth();
  const { selectedLocationId: adminSelectedLocation } = useAppState();
  const router = useRouter();
  const { toast } = useToast();

  const [allProfessionalsWithContracts, setAllProfessionalsWithContracts] = useState<(Professional & { contractDisplayStatus: ContractDisplayStatus })[]>([]);
  const [displayedProfessionals, setDisplayedProfessionals] = useState<(Professional & { contractDisplayStatus: ContractDisplayStatus })[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  
  const [selectedEmpresa, setSelectedEmpresa] = useState<string>(ALL_EMPRESAS_VALUE);
  const [uniqueEmpresas, setUniqueEmpresas] = useState<string[]>([]);
  const [manuallyAddedEmpresas, setManuallyAddedEmpresas] = useState<string[]>([]);
  const [isManageEmpresasModalOpen, setIsManageEmpresasModalOpen] = useState(false); // Renamed
  const [newEmpresaNameInput, setNewEmpresaNameInput] = useState('');

  const [selectedProfessionalForHistory, setSelectedProfessionalForHistory] = useState<(Professional & { contractDisplayStatus: ContractDisplayStatus }) | null>(null);
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  
  const [isContractEditModalOpen, setIsContractEditModalOpen] = useState(false);
  const [editingContractProfessional, setEditingContractProfessional] = useState<(Professional & { contractDisplayStatus: ContractDisplayStatus }) | null>(null);
  const [modalMode, setModalMode] = useState<'edit' | 'new'>('new');


  const contractEditForm = useForm<ContractEditFormData>({
    resolver: zodResolver(ContractEditFormSchema),
    defaultValues: {
      startDate: null,
      endDate: null,
      empresa: NINGUNA_EMPRESA_FORM_VALUE, 
    },
  });

  const isAdminOrContador = user?.role === USER_ROLES.ADMIN || user?.role === USER_ROLES.CONTADOR;
  const effectiveLocationId = isAdminOrContador
    ? (adminSelectedLocation === 'all' ? undefined : adminSelectedLocation as LocationId)
    : user?.locationId;

  useEffect(() => {
    if (!authIsLoading && (!user || !isAdminOrContador)) {
      router.replace('/dashboard');
    }
  }, [user, authIsLoading, isAdminOrContador, router]);

  const fetchContractData = useCallback(async () => {
    if (!user || !isAdminOrContador) {
      setIsLoading(false);
      setAllProfessionalsWithContracts([]);
      return;
    }
    setIsLoading(true);
    try {
      let profs: (Professional & { contractDisplayStatus: ContractDisplayStatus })[] = [];
      if (effectiveLocationId) {
        profs = await getProfessionals(effectiveLocationId);
      } else { 
        const allProfsPromises = LOCATIONS.map(loc => getProfessionals(loc.id));
        const results = await Promise.all(allProfsPromises);
        profs = results.flat();
      }
      setAllProfessionalsWithContracts(profs.sort((a,b) => `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`)));
    } catch (error) {
      console.error("Failed to fetch professionals for contracts page:", error);
      setAllProfessionalsWithContracts([]);
    } finally {
      setIsLoading(false);
    }
  }, [effectiveLocationId, user, isAdminOrContador]);

  useEffect(() => {
    if (user && isAdminOrContador) {
      fetchContractData();
    }
  }, [fetchContractData, user, isAdminOrContador]);

  useEffect(() => {
    const derivedEmpresas = new Set<string>();
    allProfessionalsWithContracts.forEach(prof => {
      if (prof.currentContract?.empresa && prof.currentContract.empresa.trim() !== '') {
        derivedEmpresas.add(prof.currentContract.empresa.trim());
      }
      prof.contractHistory?.forEach(ch => {
        if (ch.empresa && ch.empresa.trim() !== '') {
          derivedEmpresas.add(ch.empresa.trim());
        }
      });
    });
    const combinedEmpresas = new Set([...Array.from(derivedEmpresas), ...manuallyAddedEmpresas.map(e => e.trim())].filter(e => e));
    setUniqueEmpresas(Array.from(combinedEmpresas).sort((a,b) => a.toLowerCase().localeCompare(b.toLowerCase())));
  }, [allProfessionalsWithContracts, manuallyAddedEmpresas]);

  const handleAddEmpresaToManualList = () => {
    const trimmedNewEmpresaName = newEmpresaNameInput.trim();
    if (trimmedNewEmpresaName !== '') {
      if (!uniqueEmpresas.some(e => e.toLowerCase() === trimmedNewEmpresaName.toLowerCase()) && !manuallyAddedEmpresas.some(e => e.toLowerCase() === trimmedNewEmpresaName.toLowerCase())) {
        setManuallyAddedEmpresas(prev => [...prev, trimmedNewEmpresaName]);
        toast({ title: "Empresa Añadida", description: `"${trimmedNewEmpresaName}" se ha añadido a la lista de filtros.` });
      } else {
        toast({ title: "Empresa ya existe", description: `"${trimmedNewEmpresaName}" ya está en la lista.`, variant: "default" });
      }
    }
    setNewEmpresaNameInput('');
    // No cerramos el modal para permitir añadir más o quitar.
  };

  const handleRemoveManuallyAddedEmpresa = (empresaNameToRemove: string) => {
    const wasManuallyAdded = manuallyAddedEmpresas.includes(empresaNameToRemove);
    setManuallyAddedEmpresas(prev => prev.filter(e => e !== empresaNameToRemove));
  
    const companyStillInUse = allProfessionalsWithContracts.some(prof =>
      prof.currentContract?.empresa === empresaNameToRemove ||
      prof.contractHistory?.some(ch => ch.empresa === empresaNameToRemove)
    );
  
    if (wasManuallyAdded) {
      if (companyStillInUse) {
        toast({
          title: "Empresa quitada de la lista manual",
          description: `"${empresaNameToRemove}" se quitó de las opciones añadidas manualmente, pero sigue apareciendo porque está en uso en contratos existentes.`,
          variant: "default",
          duration: 5000,
        });
      } else {
        toast({
          title: "Empresa quitada",
          description: `"${empresaNameToRemove}" se ha quitado de la lista de opciones.`,
          variant: "default",
        });
      }
    } else {
      // This case happens if it was only derived from contracts and user tries to remove it from the "manage" list
      toast({
        title: "No se puede quitar completamente",
        description: `"${empresaNameToRemove}" no se puede eliminar de la lista de filtros porque está definida en contratos existentes. Edite los contratos directamente si desea cambiarla.`,
        variant: "default", // Changed to default to be less alarming
        duration: 6000,
      });
    }
  };


  const filteredAndSortedProfessionals = React.useMemo(() => {
    return allProfessionalsWithContracts
      .filter(p =>
        (`${p.firstName} ${p.lastName}`.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (p.currentContract?.notes && p.currentContract.notes.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (p.currentContract?.empresa && p.currentContract.empresa.toLowerCase().includes(searchTerm.toLowerCase()))) &&
        (selectedEmpresa === ALL_EMPRESAS_VALUE || p.currentContract?.empresa === selectedEmpresa || (selectedEmpresa === NINGUNA_EMPRESA_SELECT_ITEM_VALUE && !p.currentContract?.empresa))
      )
      .sort((a, b) => {
        const statusOrder: Record<ContractDisplayStatus, number> = {
          'Próximo a Vencer': 1,
          'Vencido': 2,
          'Activo': 3,
          'Sin Contrato': 4,
        };
        const statusCompare = statusOrder[a.contractDisplayStatus] - statusOrder[b.contractDisplayStatus];
        if (statusCompare !== 0) return statusCompare;
        if (a.currentContract?.endDate && b.currentContract?.endDate) {
          return parseISO(a.currentContract.endDate).getTime() - parseISO(b.currentContract.endDate).getTime();
        }
        return `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`);
      });
  }, [allProfessionalsWithContracts, searchTerm, selectedEmpresa]);
  
  useEffect(() => {
    setDisplayedProfessionals(filteredAndSortedProfessionals.slice(0, CONTRACTS_PER_PAGE * currentPage));
  }, [filteredAndSortedProfessionals, currentPage]);

  const handleViewHistory = (professional: Professional & { contractDisplayStatus: ContractDisplayStatus }) => {
    setSelectedProfessionalForHistory(professional);
    setIsHistoryModalOpen(true);
  };

  const handleEditContract = (professional: Professional & { contractDisplayStatus: ContractDisplayStatus }) => {
    setEditingContractProfessional(professional);
    setModalMode('edit');
    contractEditForm.reset({
      startDate: professional.currentContract?.startDate ? parseISO(professional.currentContract.startDate) : null,
      endDate: professional.currentContract?.endDate ? parseISO(professional.currentContract.endDate) : null,
      empresa: professional.currentContract?.empresa || NINGUNA_EMPRESA_FORM_VALUE,
    });
    setIsContractEditModalOpen(true);
  };

  const handleNewContract = (professional: Professional & { contractDisplayStatus: ContractDisplayStatus }) => {
    setEditingContractProfessional(professional);
    setModalMode('new');
    contractEditForm.reset({
      startDate: null,
      endDate: null,
      empresa: NINGUNA_EMPRESA_FORM_VALUE,
    });
    setIsContractEditModalOpen(true);
  };


  const onContractEditSubmit = async (data: ContractEditFormData) => {
    if (!editingContractProfessional) return;

    try {
      const professionalId = editingContractProfessional.id;
      const updatePayload: Partial<ProfessionalFormData> = {
        currentContract_startDate: data.startDate,
        currentContract_endDate: data.endDate,
        currentContract_empresa: data.empresa, 
      };

      const updatedProf = await updateProfessional(professionalId, updatePayload);

      if (updatedProf) {
        toast({ 
            title: modalMode === 'edit' ? "Contrato Actualizado" : "Nuevo Contrato Creado", 
            description: `El contrato de ${updatedProf.firstName} ${updatedProf.lastName} ha sido ${modalMode === 'edit' ? 'actualizado' : 'creado'}.` 
        });
        setIsContractEditModalOpen(false);
        fetchContractData(); 
      } else {
        toast({ title: "Error", description: "No se pudo guardar el contrato.", variant: "destructive" });
      }
    } catch (error) {
      console.error("Error saving contract:", error);
      toast({ title: "Error Inesperado", description: "Ocurrió un error al guardar el contrato.", variant: "destructive" });
    }
  };

  const handleLoadMore = () => {
    setCurrentPage(prev => prev + 1);
  };

  if (authIsLoading || !user || !isAdminOrContador) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }

  const LoadingState = () => (
    <div className="flex flex-col items-center justify-center h-64 col-span-full">
      <Loader2 className="h-12 w-12 animate-spin text-primary" />
      <p className="mt-4 text-muted-foreground">Cargando información de contratos...</p>
    </div>
  );

  const NoContractsCard = () => (
    <Card className="col-span-full mt-8 border-dashed border-2">
      <CardContent className="py-10 text-center">
        <AlertTriangle className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
        <h3 className="text-xl font-semibold mb-2">No se encontraron contratos</h3>
        <p className="text-muted-foreground">
          {searchTerm || selectedEmpresa !== ALL_EMPRESAS_VALUE ? "No hay profesionales que coincidan con los filtros." : "No hay información de contratos para mostrar."}
        </p>
      </CardContent>
    </Card>
  );

  return (
    <div className="container mx-auto py-8 px-4 md:px-0 space-y-6">
      <Card className="shadow-md">
        <CardHeader>
          <CardTitle className="text-2xl flex items-center gap-2"><FileSpreadsheet className="text-primary"/> Gestión de Contratos</CardTitle>
          <CardDescription>Visualizar, editar y crear contratos para los profesionales. Consultar historial.</CardDescription>
          {isAdminOrContador && (
            <div className="mt-1 text-sm text-muted-foreground">
              Viendo: {adminSelectedLocation === 'all' ? 'Todas las sedes' : LOCATIONS.find(l => l.id === adminSelectedLocation)?.name || ''}
            </div>
          )}
        </CardHeader>
        <CardContent>
          <div className="mb-4 flex flex-col sm:flex-row gap-4 items-center">
            <Input
              type="search"
              placeholder="Buscar por nombre, notas o empresa del contrato..."
              value={searchTerm}
              onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1);}}
              className="flex-grow"
            />
            <Select value={selectedEmpresa} onValueChange={(value) => { setSelectedEmpresa(value); setCurrentPage(1); }}>
              <SelectTrigger className="w-full sm:w-[200px]">
                <SelectValue placeholder="Filtrar por Empresa" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_EMPRESAS_VALUE}>Todas las Empresas</SelectItem>
                 <SelectItem value={NINGUNA_EMPRESA_SELECT_ITEM_VALUE}>Ninguna Empresa</SelectItem>
                {uniqueEmpresas.map(empresa => (
                  <SelectItem key={empresa} value={empresa}>{empresa}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" className="w-full sm:w-auto" onClick={() => setIsManageEmpresasModalOpen(true)}>
              <Filter className="mr-2 h-4 w-4"/> Gestionar Empresas
            </Button>
          </div>

          {isLoading ? <LoadingState /> : 
           displayedProfessionals.length === 0 && !isLoading ? <NoContractsCard /> : (
            <>
              <p className="text-sm text-muted-foreground mb-2">
                Mostrando {displayedProfessionals.length} de {filteredAndSortedProfessionals.length} profesionales.
              </p>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Profesional</TableHead>
                      <TableHead className="hidden md:table-cell">Sede</TableHead>
                      <TableHead>Estado Contrato</TableHead>
                      <TableHead className="hidden sm:table-cell">Empresa</TableHead>
                      <TableHead className="hidden sm:table-cell">Inicio Contrato</TableHead>
                      <TableHead>Fin Contrato</TableHead>
                      <TableHead className="text-right">Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {displayedProfessionals.map(prof => (
                      <TableRow key={prof.id}>
                        <TableCell className="font-medium">{prof.firstName} {prof.lastName}</TableCell>
                        <TableCell className="hidden md:table-cell">{LOCATIONS.find(l => l.id === prof.locationId)?.name}</TableCell>
                        <TableCell>
                          <span className={cn(
                            "text-xs font-medium px-2 py-0.5 rounded-full",
                            prof.contractDisplayStatus === 'Activo' && 'bg-green-100 text-green-700',
                            prof.contractDisplayStatus === 'Próximo a Vencer' && 'bg-orange-100 text-orange-700',
                            prof.contractDisplayStatus === 'Vencido' && 'bg-red-100 text-red-700',
                            prof.contractDisplayStatus === 'Sin Contrato' && 'bg-gray-100 text-gray-600',
                          )}>
                            {(prof.contractDisplayStatus === 'Próximo a Vencer' || prof.contractDisplayStatus === 'Vencido') && <AlertTriangle className="inline-block mr-1 h-3 w-3" />}
                            {prof.contractDisplayStatus}
                          </span>
                        </TableCell>
                        <TableCell className="hidden sm:table-cell text-xs">{prof.currentContract?.empresa || 'N/A'}</TableCell>
                        <TableCell className="hidden sm:table-cell text-xs">
                          {prof.currentContract?.startDate ? format(parseISO(prof.currentContract.startDate), 'dd/MM/yyyy') : 'N/A'}
                        </TableCell>
                        <TableCell className="text-xs">
                          {prof.currentContract?.endDate ? format(parseISO(prof.currentContract.endDate), 'dd/MM/yyyy') : 'N/A'}
                        </TableCell>
                        <TableCell className="text-right space-x-1">
                          <Button variant="outline" size="xs" onClick={() => handleNewContract(prof)} className="mr-1">
                            <PlusCircle className="mr-1 h-3 w-3" /> Nuevo
                          </Button>
                          {prof.contractDisplayStatus !== 'Sin Contrato' && (
                             <Button variant="outline" size="xs" onClick={() => handleEditContract(prof)}>
                               <Edit3 className="mr-1 h-3 w-3" /> Editar Actual
                             </Button>
                           )}
                          <Button variant="outline" size="xs" onClick={() => handleViewHistory(prof)} disabled={!prof.currentContract && (!prof.contractHistory || prof.contractHistory.length === 0)}>
                            <Eye className="mr-1 h-3 w-3" /> Historial
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              {displayedProfessionals.length < filteredAndSortedProfessionals.length && !isLoading && (
                <div className="mt-6 text-center">
                  <Button onClick={handleLoadMore} variant="outline">
                    <ChevronsDown className="mr-2 h-4 w-4"/> Cargar Más
                  </Button>
                </div>
              )}
              {isLoading && currentPage > 1 && <div className="text-center mt-4"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>}
            </>
          )}
        </CardContent>
      </Card>

      {/* Contract Edit/New Modal */}
      {editingContractProfessional && (
        <Dialog open={isContractEditModalOpen} onOpenChange={setIsContractEditModalOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
               <DialogTitle>
                {modalMode === 'edit' ? `Editar Contrato de ${editingContractProfessional.firstName} ${editingContractProfessional.lastName}` : `Nuevo Contrato para ${editingContractProfessional.firstName} ${editingContractProfessional.lastName}`}
              </DialogTitle>
              <DialogDescription>
                {modalMode === 'edit' ? 'Actualice los detalles del contrato actual.' : 'Ingrese los detalles para el nuevo contrato. El contrato actual (si existe) será archivado.'}
              </DialogDescription>
            </DialogHeader>
            <Form {...contractEditForm}>
              <form onSubmit={contractEditForm.handleSubmit(onContractEditSubmit)} className="space-y-4 py-2">
                <FormField
                  control={contractEditForm.control}
                  name="startDate"
                  render={({ field }) => (
                    <FormItem className="flex flex-col">
                      <FormLabel>Fecha Inicio Contrato</FormLabel>
                      <Popover>
                        <PopoverTrigger asChild>
                          <FormControl>
                            <Button variant="outline" className={cn("w-full pl-3 text-left font-normal", !field.value && "text-muted-foreground")}>
                              {field.value ? format(field.value, "PPP", { locale: es }) : <span>Seleccionar fecha</span>}
                              <CalendarIconLucide className="ml-auto h-4 w-4 opacity-50" />
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
                  control={contractEditForm.control}
                  name="endDate"
                  render={({ field }) => (
                    <FormItem className="flex flex-col">
                      <FormLabel>Fecha Fin Contrato</FormLabel>
                      <Popover>
                        <PopoverTrigger asChild>
                          <FormControl>
                            <Button variant="outline" className={cn("w-full pl-3 text-left font-normal", !field.value && "text-muted-foreground")}>
                              {field.value ? format(field.value, "PPP", { locale: es }) : <span>Seleccionar fecha</span>}
                              <CalendarIconLucide className="ml-auto h-4 w-4 opacity-50" />
                            </Button>
                          </FormControl>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar
                            mode="single"
                            selected={field.value}
                            onSelect={field.onChange}
                            disabled={(date) => contractEditForm.getValues("startDate") ? date < contractEditForm.getValues("startDate")! : false}
                            initialFocus
                          />
                        </PopoverContent>
                      </Popover>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={contractEditForm.control}
                  name="empresa"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="flex items-center gap-1"><Filter size={16}/>Empresa</FormLabel>
                      <Select
                        onValueChange={(value) => {
                          field.onChange(value === NINGUNA_EMPRESA_SELECT_ITEM_VALUE ? NINGUNA_EMPRESA_FORM_VALUE : value);
                        }}
                        value={field.value === NINGUNA_EMPRESA_FORM_VALUE ? NINGUNA_EMPRESA_SELECT_ITEM_VALUE : (field.value || '')}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Seleccionar empresa" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value={NINGUNA_EMPRESA_SELECT_ITEM_VALUE}><em>Ninguna</em></SelectItem>
                          {uniqueEmpresas.map(empresa => (
                            <SelectItem key={empresa} value={empresa}>{empresa}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <DialogFooter className="pt-4">
                  <DialogClose asChild><Button type="button" variant="outline">Cancelar</Button></DialogClose>
                   <Button type="submit" disabled={contractEditForm.formState.isSubmitting}>
                    {contractEditForm.formState.isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    {modalMode === 'edit' ? 'Guardar Cambios' : 'Crear Contrato'}
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      )}

      {/* Manage Empresas Modal */}
      <Dialog open={isManageEmpresasModalOpen} onOpenChange={setIsManageEmpresasModalOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Gestionar Nombres de Empresas</DialogTitle>
            <DialogDescription>
              Añada nuevas empresas a la lista de filtros o elimine las que añadió manualmente.
              Las empresas en uso en contratos no se pueden eliminar de esta lista.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-6">
            <div>
              <h4 className="text-md font-semibold mb-2">Añadir Nueva Empresa</h4>
              <div className="flex gap-2 items-center">
                <Input
                  placeholder="Nombre de la nueva empresa"
                  value={newEmpresaNameInput}
                  onChange={(e) => setNewEmpresaNameInput(e.target.value)}
                  className="flex-grow"
                />
                <Button type="button" onClick={handleAddEmpresaToManualList}>Añadir</Button>
              </div>
            </div>

            <Separator />

            <div>
              <h4 className="text-md font-semibold mb-2">Empresas en la Lista de Filtros</h4>
              {uniqueEmpresas.length > 0 ? (
                <ScrollArea className="h-[200px] border rounded-md p-2">
                  <ul className="space-y-1">
                    {uniqueEmpresas.map((empresa) => (
                      <li key={empresa} className="flex justify-between items-center p-1.5 hover:bg-muted/50 rounded">
                        <span className="text-sm">{empresa}</span>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-xs text-destructive hover:text-destructive/80 hover:bg-destructive/10 h-auto px-2 py-1"
                          onClick={() => handleRemoveManuallyAddedEmpresa(empresa)}
                        >
                          Quitar
                        </Button>
                      </li>
                    ))}
                  </ul>
                </ScrollArea>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-4">No hay empresas personalizadas añadidas. Las empresas de contratos existentes aparecerán aquí automáticamente.</p>
              )}
            </div>
          </div>
          <DialogFooter className="pt-4">
            <DialogClose asChild>
              <Button type="button" variant="outline">Cerrar</Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Contract History Modal */}
      {selectedProfessionalForHistory && (
        <Dialog open={isHistoryModalOpen} onOpenChange={setIsHistoryModalOpen}>
          <DialogContent className="sm:max-w-xl">
            <DialogHeader>
              <DialogTitle>Historial de Contratos de {selectedProfessionalForHistory.firstName} {selectedProfessionalForHistory.lastName}</DialogTitle>
              <DialogDescription>Lista de contratos anteriores y el contrato vigente del profesional.</DialogDescription>
            </DialogHeader>
            <ScrollArea className="max-h-[60vh]">
              {(selectedProfessionalForHistory.currentContract || (selectedProfessionalForHistory.contractHistory && selectedProfessionalForHistory.contractHistory.length > 0)) ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Estado</TableHead>
                      <TableHead>Fecha Inicio</TableHead>
                      <TableHead>Fecha Fin</TableHead>
                      <TableHead>Empresa</TableHead>
                      <TableHead>Notas</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {selectedProfessionalForHistory.currentContract && (
                      <TableRow className="bg-primary/5 hover:bg-primary/10">
                        <TableCell><Badge variant="default">Vigente</Badge></TableCell>
                        <TableCell className="text-xs">{format(parseISO(selectedProfessionalForHistory.currentContract.startDate), 'dd/MM/yyyy')}</TableCell>
                        <TableCell className="text-xs">{format(parseISO(selectedProfessionalForHistory.currentContract.endDate), 'dd/MM/yyyy')}</TableCell>
                        <TableCell className="text-xs">{selectedProfessionalForHistory.currentContract.empresa || '-'}</TableCell>
                        <TableCell className="text-xs">{selectedProfessionalForHistory.currentContract.notes || '-'}</TableCell>
                      </TableRow>
                    )}
                    {selectedProfessionalForHistory.contractHistory && selectedProfessionalForHistory.contractHistory.sort((a,b) => parseISO(b.startDate).getTime() - parseISO(a.startDate).getTime()).map((contract, index) => (
                      <TableRow key={contract.id || `history-${index}`}>
                        <TableCell><Badge variant="outline">Archivado</Badge></TableCell>
                        <TableCell className="text-xs">{format(parseISO(contract.startDate), 'dd/MM/yyyy')}</TableCell>
                        <TableCell className="text-xs">{format(parseISO(contract.endDate), 'dd/MM/yyyy')}</TableCell>
                        <TableCell className="text-xs">{contract.empresa || '-'}</TableCell>
                        <TableCell className="text-xs">{contract.notes || '-'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-4">No hay historial de contratos ni contrato vigente para este profesional.</p>
              )}
            </ScrollArea>
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="outline">Cerrar</Button>
              </DialogClose>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
