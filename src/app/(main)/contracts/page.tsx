
"use client";

import type { Professional, Contract } from '@/types';
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '@/contexts/auth-provider';
import { useAppState } from '@/contexts/app-state-provider';
import { getProfessionals } from '@/lib/data';
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
import { Loader2, AlertTriangle, FileSpreadsheet, Eye, ChevronsDown } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { useRouter } from 'next/navigation';
import { ScrollArea } from '@/components/ui/scroll-area';

const CONTRACTS_PER_PAGE = 10;

export default function ContractsPage() {
  const { user, isLoading: authIsLoading } = useAuth();
  const { selectedLocationId: adminSelectedLocation } = useAppState();
  const router = useRouter();

  const [allProfessionalsWithContracts, setAllProfessionalsWithContracts] = useState<(Professional & { contractDisplayStatus: ContractDisplayStatus })[]>([]);
  const [displayedProfessionals, setDisplayedProfessionals] = useState<(Professional & { contractDisplayStatus: ContractDisplayStatus })[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedProfessionalForHistory, setSelectedProfessionalForHistory] = useState<(Professional & { contractDisplayStatus: ContractDisplayStatus }) | null>(null);
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);

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
      } else { // Admin viewing 'all'
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

  const filteredAndSortedProfessionals = useMemo(() => {
    return allProfessionalsWithContracts
      .filter(p =>
        `${p.firstName} ${p.lastName}`.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (p.currentContract?.notes && p.currentContract.notes.toLowerCase().includes(searchTerm.toLowerCase()))
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
  }, [allProfessionalsWithContracts, searchTerm]);
  
  useEffect(() => {
    setDisplayedProfessionals(filteredAndSortedProfessionals.slice(0, CONTRACTS_PER_PAGE * currentPage));
  }, [filteredAndSortedProfessionals, currentPage]);

  const handleViewHistory = (professional: Professional & { contractDisplayStatus: ContractDisplayStatus }) => {
    setSelectedProfessionalForHistory(professional);
    setIsHistoryModalOpen(true);
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
          {searchTerm ? "No hay profesionales que coincidan con la búsqueda." : "No hay información de contratos para mostrar."}
        </p>
      </CardContent>
    </Card>
  );

  return (
    <div className="container mx-auto py-8 px-4 md:px-0 space-y-6">
      <Card className="shadow-md">
        <CardHeader>
          <CardTitle className="text-2xl flex items-center gap-2"><FileSpreadsheet className="text-primary"/> Gestión de Contratos</CardTitle>
          <CardDescription>Visualizar el estado de los contratos de los profesionales y su historial.</CardDescription>
          {isAdminOrContador && (
            <div className="mt-1 text-sm text-muted-foreground">
              Viendo: {adminSelectedLocation === 'all' ? 'Todas las sedes' : LOCATIONS.find(l => l.id === adminSelectedLocation)?.name || ''}
            </div>
          )}
        </CardHeader>
        <CardContent>
          <div className="mb-4">
            <Input
              type="search"
              placeholder="Buscar por nombre de profesional o notas del contrato..."
              value={searchTerm}
              onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1);}}
              className="w-full"
            />
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
                        <TableCell className="hidden sm:table-cell text-xs">
                          {prof.currentContract?.startDate ? format(parseISO(prof.currentContract.startDate), 'dd/MM/yyyy') : 'N/A'}
                        </TableCell>
                        <TableCell className="text-xs">
                          {prof.currentContract?.endDate ? format(parseISO(prof.currentContract.endDate), 'dd/MM/yyyy') : 'N/A'}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button variant="outline" size="sm" onClick={() => handleViewHistory(prof)} disabled={!prof.contractHistory || prof.contractHistory.length === 0}>
                            <Eye className="mr-1 h-4 w-4" /> Historial
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

      {selectedProfessionalForHistory && (
        <Dialog open={isHistoryModalOpen} onOpenChange={setIsHistoryModalOpen}>
          <DialogContent className="sm:max-w-xl">
            <DialogHeader>
              <DialogTitle>Historial de Contratos de {selectedProfessionalForHistory.firstName} {selectedProfessionalForHistory.lastName}</DialogTitle>
              <DialogDescription>Lista de contratos anteriores del profesional.</DialogDescription>
            </DialogHeader>
            <ScrollArea className="max-h-[60vh]">
              {selectedProfessionalForHistory.contractHistory && selectedProfessionalForHistory.contractHistory.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Fecha Inicio</TableHead>
                      <TableHead>Fecha Fin</TableHead>
                      <TableHead>Notas</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {selectedProfessionalForHistory.contractHistory.sort((a,b) => parseISO(b.startDate).getTime() - parseISO(a.startDate).getTime()).map((contract, index) => (
                      <TableRow key={index}>
                        <TableCell className="text-xs">{format(parseISO(contract.startDate), 'dd/MM/yyyy')}</TableCell>
                        <TableCell className="text-xs">{format(parseISO(contract.endDate), 'dd/MM/yyyy')}</TableCell>
                        <TableCell className="text-xs">{contract.notes || '-'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-4">No hay historial de contratos para este profesional.</p>
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
