
"use client";

import type { Professional, Contract, ContractEditFormData, ProfessionalFormData, Location } from '@/types';
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '@/contexts/auth-provider';
import { useAppState } from '@/contexts/app-state-provider';
import { getProfessionals, updateProfessional, getLocations, updateArchivedContract, deleteArchivedContract } from '@/lib/data';
import type { ContractDisplayStatus } from '@/lib/data';
import { USER_ROLES, LocationId } from '@/lib/constants';
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
  AlertDialogFooter
} from "@/components/ui/alert-dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Loader2, AlertTriangle, FileSpreadsheet, Eye, ChevronsDown, Edit3, Calendar as CalendarIconLucide, Filter, PlusCircle, Pencil, Trash2 } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { useRouter } from 'next/navigation';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ContractEditFormSchema, ArchivedContractEditFormSchema } from '@/lib/schemas';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useToast } from '@/hooks/use-toast';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';

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
  const [locations, setLocations] = useState<Location[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  
  const [selectedEmpresa, setSelectedEmpresa] = useState<string>(ALL_EMPRESAS_VALUE);
  const [uniqueEmpresas, setUniqueEmpresas] = useState<string[]>([]);
  const [manuallyAddedEmpresas, setManuallyAddedEmpresas] = useState<string[]>([]);
  const [isManageEmpresasModalOpen, setIsManageEmpresasModalOpen] = useState(false);
  const [newEmpresaNameInput, setNewEmpresaNameInput] = useState('');
  const [editingEmpresaName, setEditingEmpresaName] = useState<string | null>(null);


  const [selectedProfessionalForHistory, setSelectedProfessionalForHistory] = useState<(Professional & { contractDisplayStatus: ContractDisplayStatus }) | null>(null);
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  
  const [isContractEditModalOpen, setIsContractEditModalOpen] = useState(false);
  const [editingContractProfessional, setEditingContractProfessional] = useState<(Professional & { contractDisplayStatus: ContractDisplayStatus }) | null>(null);
  const [editingArchivedContract, setEditingArchivedContract] = useState<Contract | null>(null);
  const [modalMode, setModalMode] = useState<'edit' | 'new' | 'edit_archived'>('new');
  const [contractToDelete, setContractToDelete] = useState<{ professionalId: string, contractId: string, contractDescription: string } | null>(null);


  const contractEditForm = useForm<ContractEditFormData>({
    resolver: zodResolver(ContractEditFormSchema),
    defaultValues: {
      startDate: null,
      endDate: null,
      empresa: NINGUNA_EMPRESA_FORM_VALUE, 
    },
  });
  
  const archivedContractEditForm = useForm<ContractEditFormData>({
    resolver: zodResolver(ArchivedContractEditFormSchema),
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
    async function loadLocations() {
        const fetchedLocations = await getLocations();
        setLocations(fetchedLocations);
    }
    loadLocations();
  }, []);

  useEffect(() => {
    if (!authIsLoading && (!user || !isAdminOrContador)) {
      router.replace('/dashboard');
    }
  }, [user, authIsLoading, isAdminOrContador, router]);

  const fetchContractData = useCallback(async () => {
    if (!user || !isAdminOrContador || locations.length === 0) {
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
        const allProfsPromises = locations.map(loc => getProfessionals(loc.id));
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
  }, [effectiveLocationId, user, isAdminOrContador, locations]);

  useEffect(() => {
    if (user && isAdminOrContador && locations.length > 0) {
      fetchContractData();
    }
  }, [fetchContractData, user, isAdminOrContador, locations]);

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

  const isEmpresaInUse = useCallback((empresaName: string): boolean => {
    return allProfessionalsWithContracts.some(prof =>
      prof.currentContract?.empresa === empresaName ||
      prof.contractHistory?.some(ch => ch.empresa === empresaName)
    );
  }, [allProfessionalsWithContracts]);

  const handleSaveEmpresaName = () => {
    const trimmedNewEmpresaName = newEmpresaNameInput.trim();
    if (trimmedNewEmpresaName === '') {
      toast({ title: "Nombre Vacío", description: "El nombre de la empresa no puede estar vacío.", variant: "destructive" });
      return;
    }

    if (editingEmpresaName) { // Estamos actualizando un nombre
      if (trimmedNewEmpresaName !== editingEmpresaName && uniqueEmpresas.some(e => e.toLowerCase() === trimmedNewEmpresaName.toLowerCase())) {
        toast({ title: "Empresa Duplicada", description: `La empresa "${trimmedNewEmpresaName}" ya existe.`, variant: "destructive" });
        return;
      }
      setManuallyAddedEmpresas(prev =>
        prev.map(e => (e === editingEmpresaName ? trimmedNewEmpresaName : e))
      );
      toast({ title: "Empresa Actualizada", description: `"${editingEmpresaName}" se actualizó a "${trimmedNewEmpresaName}".` });
    } else { // Estamos añadiendo una nueva empresa
      if (uniqueEmpresas.some(e => e.toLowerCase() === trimmedNewEmpresaName.toLowerCase())) {
        toast({ title: "Empresa ya existe", description: `"${trimmedNewEmpresaName}" ya está en la lista.`, variant: "default" });
        return;
      }
      setManuallyAddedEmpresas(prev => [...prev, trimmedNewEmpresaName]);
      toast({ title: "Empresa Añadida", description: `"${trimmedNewEmpresaName}" se ha añadido a la lista de opciones.` });
    }
    setNewEmpresaNameInput('');
    setEditingEmpresaName(null);
  };

  const handleStartEditEmpresa = (empresa: string) => {
    setEditingEmpresaName(empresa);
    setNewEmpresaNameInput(empresa);
  };

  const handleRemoveManuallyAddedEmpresa = (empresaNameToRemove: string) => {
    const wasManuallyAdded = manuallyAddedEmpresas.includes(empresaNameToRemove);
    setManuallyAddedEmpresas(prev => prev.filter(e => e !== empresaNameToRemove));
  
    if (editingEmpresaName === empresaNameToRemove) { // Si se está editando la empresa que se va a quitar
      setNewEmpresaNameInput('');
      setEditingEmpresaName(null);
    }

    if (wasManuallyAdded) {
      if (isEmpresaInUse(empresaNameToRemove)) {
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
      toast({
        title: "No se puede quitar completamente",
        description: `"${empresaNameToRemove}" no se puede eliminar de la lista de filtros porque está definida en contratos existentes. Edite los contratos directamente si desea cambiarla.`,
        variant: "default",
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
          const dateAValid = a.currentContract.endDate && typeof a.currentContract.endDate === 'string';
          const dateBValid = b.currentContract.endDate && typeof b.currentContract.endDate === 'string';
          if (dateAValid && dateBValid) {
            try {
                return parseISO(a.currentContract.endDate).getTime() - parseISO(b.currentContract.endDate).getTime();
            } catch (e) {
            }
          } else if (dateAValid) return -1;
          else if (dateBValid) return 1;

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
  
  const handleEditArchivedContract = (prof: Professional, contract: Contract) => {
    setEditingContractProfessional(prof);
    setEditingArchivedContract(contract);
    setModalMode('edit_archived');
    archivedContractEditForm.reset({
      startDate: contract.startDate ? parseISO(contract.startDate) : null,
      endDate: contract.endDate ? parseISO(contract.endDate) : null,
      empresa: contract.empresa || NINGUNA_EMPRESA_FORM_VALUE,
    });
    setIsContractEditModalOpen(true);
  };

  const handleDeleteArchivedContract = async () => {
    if (!contractToDelete) return;
    try {
      await deleteArchivedContract(contractToDelete.professionalId, contractToDelete.contractId);
      toast({ title: "Contrato Archivado Eliminado", description: "El contrato ha sido eliminado del historial." });
      setContractToDelete(null);
      setIsHistoryModalOpen(false); 
      fetchContractData();
    } catch (error) {
      console.error("Error deleting archived contract:", error);
      toast({ title: "Error", description: "No se pudo eliminar el contrato archivado.", variant: "destructive" });
    }
  };

  const handleEditContract = (professional: Professional & { contractDisplayStatus: ContractDisplayStatus }) => {
    setEditingContractProfessional(professional);
    setEditingArchivedContract(null);
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
    setEditingArchivedContract(null);
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

    if (modalMode === 'edit_archived' && editingArchivedContract) {
       try {
        await updateArchivedContract(editingContractProfessional.id, editingArchivedContract.id, data);
        toast({ title: "Contrato Archivado Actualizado", description: "El contrato del historial ha sido actualizado." });
        setIsContractEditModalOpen(false);
        setIsHistoryModalOpen(false);
        fetchContractData();
       } catch (error) {
         console.error("Error updating archived contract:", error);
         toast({ title: "Error", description: "No se pudo actualizar el contrato archivado.", variant: "destructive"});
       }
       return;
    }

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

  const handleOpenManageEmpresasModal = () => {
    setEditingEmpresaName(null); 
    setNewEmpresaNameInput(''); 
    setIsManageEmpresasModalOpen(true);
  };

  const handleCloseManageEmpresasModal = () => {
    setIsManageEmpresasModalOpen(false);
    setEditingEmpresaName(null); 
    setNewEmpresaNameInput(''); 
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

  const currentForm = modalMode === 'edit_archived' ? archivedContractEditForm : contractEditForm;

  return (
    <div className="container mx-auto py-8 px-4 md:px-0 space-y-6">
      <Card className="shadow-md">
        <CardHeader>
          <CardTitle className="text-2xl flex items-center gap-2"><FileSpreadsheet className="text-primary"/> Gestión de Contratos</CardTitle>
          <CardDescription>Visualizar, editar y crear contratos para los profesionales. Consultar historial.</CardDescription>
          {isAdminOrContador && (
            <div className="mt-1 text-sm text-muted-foreground">
              Viendo: {adminSelectedLocation === 'all' ? 'Todas las sedes' : locations.find(l => l.id === adminSelectedLocation)?.name || ''}
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
            <Button variant="outline" className="w-full sm:w-auto" onClick={handleOpenManageEmpresasModal}>
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
                        <TableCell className="hidden md:table-cell">{locations.find(l => l.id === prof.locationId)?.name}</TableCell>
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
                {modalMode === 'edit' ? `Editar Contrato de ${editingContractProfessional.firstName}` : 
                 modalMode === 'edit_archived' ? `Editar Contrato Archivado de ${editingContractProfessional.firstName}` :
                 `Nuevo Contrato para ${editingContractProfessional.firstName}`}
              </DialogTitle>
              <DialogDescription>
                {modalMode === 'edit' ? 'Actualice los detalles del contrato actual.' : 
                 modalMode === 'edit_archived' ? 'Actualice los detalles del contrato del historial.' :
                 'Ingrese los detalles para el nuevo contrato. El contrato actual (si existe) será archivado.'}
              </DialogDescription>
            </DialogHeader>
            <Form {...currentForm}>
              <form onSubmit={currentForm.handleSubmit(onContractEditSubmit)} className="space-y-4 py-2">
                <FormField
                  control={currentForm.control}
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
                          <Calendar mode="single" selected={field.value as Date | undefined} onSelect={field.onChange} initialFocus />
                        </PopoverContent>
                      </Popover>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={currentForm.control}
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
                            selected={field.value as Date | undefined}
                            onSelect={field.onChange}
                            disabled={(date) => currentForm.getValues("startDate") ? date < currentForm.getValues("startDate")! : false}
                            initialFocus
                          />
                        </PopoverContent>
                      </Popover>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={currentForm.control}
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
                   <Button type="submit" disabled={currentForm.formState.isSubmitting}>
                    {currentForm.formState.isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Guardar Cambios
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      )}

      {/* Manage Empresas Modal */}
      <Dialog open={isManageEmpresasModalOpen} onOpenChange={handleCloseManageEmpresasModal}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Gestionar Nombres de Empresas</DialogTitle>
            <DialogDescription>
              Añada o actualice empresas en la lista de filtros, o elimine las que añadió manualmente.
              Las empresas en uso no se pueden eliminar de esta lista, ni editar su nombre directamente aquí si están en uso.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-6">
            <div>
              <h4 className="text-md font-semibold mb-2">{editingEmpresaName ? `Actualizar Nombre de "${editingEmpresaName}"` : "Añadir Nueva Empresa"}</h4>
              <div className="flex gap-2 items-center">
                <Input
                  placeholder="Nombre de la empresa"
                  value={newEmpresaNameInput}
                  onChange={(e) => setNewEmpresaNameInput(e.target.value)}
                  className="flex-grow"
                />
                <Button type="button" onClick={handleSaveEmpresaName}>
                  {editingEmpresaName ? "Actualizar Nombre" : "Añadir"}
                </Button>
                 {editingEmpresaName && (
                  <Button type="button" variant="ghost" onClick={() => { setNewEmpresaNameInput(''); setEditingEmpresaName(null); }}>
                    Cancelar Edición
                  </Button>
                )}
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
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-xs text-blue-600 hover:text-blue-500 hover:bg-blue-500/10 h-auto px-2 py-1"
                            onClick={() => handleStartEditEmpresa(empresa)}
                            disabled={!manuallyAddedEmpresas.includes(empresa) || isEmpresaInUse(empresa)}
                            title={
                              !manuallyAddedEmpresas.includes(empresa) ? "Solo se pueden editar empresas añadidas manualmente." :
                              isEmpresaInUse(empresa) ? "No se puede editar una empresa en uso. Edite el contrato directamente." :
                              "Editar nombre de empresa"
                            }
                          >
                            <Pencil size={12} />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-xs text-destructive hover:text-destructive/80 hover:bg-destructive/10 h-auto px-2 py-1"
                            onClick={() => handleRemoveManuallyAddedEmpresa(empresa)}
                          >
                            Quitar
                          </Button>
                        </div>
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
            <Button type="button" variant="outline" onClick={handleCloseManageEmpresasModal}>Cerrar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Contract History Modal */}
      {selectedProfessionalForHistory && (
        <Dialog open={isHistoryModalOpen} onOpenChange={setIsHistoryModalOpen}>
          <DialogContent className="sm:max-w-2xl">
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
                      <TableHead>Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {selectedProfessionalForHistory.currentContract && (
                      <TableRow className="bg-primary/5 hover:bg-primary/10">
                        <TableCell><Badge variant="default">Vigente</Badge></TableCell>
                        <TableCell className="text-xs">{selectedProfessionalForHistory.currentContract.startDate ? format(parseISO(selectedProfessionalForHistory.currentContract.startDate), 'dd/MM/yyyy') : '-'}</TableCell>
                        <TableCell className="text-xs">{selectedProfessionalForHistory.currentContract.endDate ? format(parseISO(selectedProfessionalForHistory.currentContract.endDate), 'dd/MM/yyyy') : '-'}</TableCell>
                        <TableCell className="text-xs">{selectedProfessionalForHistory.currentContract.empresa || '-'}</TableCell>
                        <TableCell>
                          <Button variant="outline" size="xs" onClick={() => handleEditContract(selectedProfessionalForHistory)}>
                            <Edit3 className="mr-1 h-3 w-3" /> Editar
                          </Button>
                        </TableCell>
                      </TableRow>
                    )}
                    {selectedProfessionalForHistory.contractHistory && selectedProfessionalForHistory.contractHistory
                      .sort((a, b) => {
                        const dateAValid = a && typeof a.startDate === 'string' && a.startDate.length > 0;
                        const dateBValid = b && typeof b.startDate === 'string' && b.startDate.length > 0;

                        if (!dateBValid && !dateAValid) return 0; 
                        if (!dateBValid) return 1; 
                        if (!dateAValid) return -1;

                        const timeA = parseISO(a.startDate!).getTime();
                        const timeB = parseISO(b.startDate!).getTime();
                        
                        if (isNaN(timeB) && isNaN(timeA)) return 0;
                        if (isNaN(timeB)) return 1;
                        if (isNaN(timeA)) return -1;

                        return timeB - timeA;
                      })
                      .map((contract, index) => (
                      <TableRow key={contract.id || `history-${index}`}>
                        <TableCell><Badge variant="outline">Archivado</Badge></TableCell>
                        <TableCell className="text-xs">{contract.startDate ? format(parseISO(contract.startDate), 'dd/MM/yyyy') : '-'}</TableCell>
                        <TableCell className="text-xs">{contract.endDate ? format(parseISO(contract.endDate), 'dd/MM/yyyy') : '-'}</TableCell>
                        <TableCell className="text-xs">{contract.empresa || '-'}</TableCell>
                        <TableCell className="space-x-1">
                          <Button variant="outline" size="xs" onClick={() => handleEditArchivedContract(selectedProfessionalForHistory, contract)}>
                            <Edit3 className="mr-1 h-3 w-3" /> Editar
                          </Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="destructive" size="xs">
                                <Trash2 className="mr-1 h-3 w-3" /> Eliminar
                              </Button>
                            </AlertDialogTrigger>
                             <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>¿Confirmar Eliminación?</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    Esta acción eliminará permanentemente el contrato archivado del {contract.startDate ? format(parseISO(contract.startDate), 'dd/MM/yyyy') : ''} al {contract.endDate ? format(parseISO(contract.endDate), 'dd/MM/yyyy') : ''}. Esta acción no se puede deshacer.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                  <AlertDialogAction onClick={() => {
                                      setContractToDelete({
                                        professionalId: selectedProfessionalForHistory.id,
                                        contractId: contract.id,
                                        contractDescription: `del ${contract.startDate ? format(parseISO(contract.startDate), 'dd/MM/yy') : ''} al ${contract.endDate ? format(parseISO(contract.endDate), 'dd/MM/yy') : ''}`
                                      });
                                      handleDeleteArchivedContract();
                                  }} className={cn("bg-destructive text-destructive-foreground hover:bg-destructive/90")}>
                                      Sí, Eliminar
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                          </AlertDialog>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-4">No hay historial de contratos ni contrato vigente para este profesional.</p>
              )}
            </ScrollArea>
            <DialogFooter className="mt-4">
              <DialogClose asChild>
                <Button type="button" variant="outline">Cerrar</Button>
              </DialogClose>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      <AlertDialog open={!!contractToDelete} onOpenChange={() => setContractToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Está seguro de eliminar este contrato?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción eliminará permanentemente el contrato {contractToDelete?.contractDescription}. Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteArchivedContract} className={cn("bg-destructive text-destructive-foreground hover:bg-destructive/90")}>
              Eliminar Contrato
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </div>
  );
}

