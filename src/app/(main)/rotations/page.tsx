

"use client";

import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Users, Calendar, Plane, Sun, Star, Loader2, GripVertical } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getProfessionals, getContractDisplayStatus, getLocations } from '@/lib/data';
import type { Professional, Location, LocationId } from '@/types';
import { useAuth } from '@/contexts/auth-provider';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';


// --- Initial Data (will be part of state now) ---
const initialDomingosDataHiguereta = [
    { fecha: "29-Jun", feriado: true, grupo: 1, encargada: 'Isabel' },
    { fecha: "6-Jul", feriado: false, grupo: 1, encargada: 'Liz' },
    { fecha: "13-Jul", feriado: false, grupo: 2, encargada: 'Gloria' },
    { fecha: "20-Jul", feriado: false, grupo: 1, encargada: 'Victoria' },
    { fecha: "27-Jul", feriado: false, grupo: 2, encargada: 'Victoria vino por Leydi' },
    { fecha: "3-Ago", feriado: false, grupo: 1, encargada: 'Leydi' },
    { fecha: "10-Ago", feriado: false, grupo: 2, encargada: 'Pilar' },
    { fecha: "17-Ago", feriado: false, grupo: 1, encargada: 'Victoria vino por Angela' },
    { fecha: "24-Ago", feriado: false, grupo: 2, encargada: 'Lucila' },
    { fecha: "31-Ago", feriado: false, grupo: 1, encargada: 'Heiddy' },
    { fecha: "7-Set", feriado: false, grupo: 2, encargada: 'Lucy' },
    { fecha: "14-Set", feriado: false, grupo: 1, encargada: 'Glady' },
    { fecha: "21-Set", feriado: false, grupo: 2, encargada: 'Rossy' },
    { fecha: "5-Oct", feriado: false, grupo: 2, encargada: '' },
    { fecha: "12-Oct", feriado: false, grupo: 1, encargada: '' },
    { fecha: "19-Oct", feriado: false, grupo: 2, encargada: '' },
];


const feriadosGrupo1 = ['PILAR', 'ISABEL', 'HEIDDY', 'GLORIA', 'LUCILA'];
const feriadosGrupo2 = ['ANGELA', 'LIZ', 'LEYDI', 'VICTORIA', 'LUCY'];


const initialDomingosDataSanAntonio = [
  { fecha: "7-Set", grupo: 1 },
  { fecha: "14-Set", grupo: 2 },
  { fecha: "21-Set", grupo: 3 },
  { fecha: "28-Set", grupo: 1 },
  { fecha: "5-Oct", grupo: 2 },
  { fecha: "12-Oct", grupo: 3 },
  { fecha: "19-Oct", grupo: 1 },
  { fecha: "26-Oct", grupo: 2 },
  { fecha: "2-Nov", grupo: 3 },
  { fecha: "9-Nov", grupo: 1 },
  { fecha: "16-Nov", grupo: 2 },
  { fecha: "23-Nov", grupo: 3 },
];

const vacaciones = [
  { nombre: 'CARMEN', periodo: '02/05 - 08/05 (7dias)', regreso: '' },
  { nombre: 'LEYDI', periodo: '08/05 - 22/05 (15dias)', regreso: '' },
  { nombre: 'ISABEL', periodo: '30/06 - 05/07 (6dias)', regreso: '6-Jul' },
  { nombre: 'ISABEL', periodo: '09/10 - 17/10 (8dias)', regreso: '18-Oct', estado: 'PENDIENTE' },
  { nombre: 'LIZ', periodo: '25/07 - 31/07 (7dias)', regreso: '9-Ago', estado: 'Pendiente 8 dias' },
  { nombre: 'GLORIA', periodo: '30/07 - 13/08 (15dias)', regreso: '14-Ago' },
  { nombre: 'PILAR', periodo: '16/08 - 31/08 (15dias)', regreso: '1-Set' },
  { nombre: 'ANGELA', periodo: '18/07 - 24/07 (7 dias)', regreso: 'se le compró sus vacaciones' },
  { nombre: 'ANGELA', periodo: '08/10 - 15/10 (8dias)', regreso: '16-Oct', estado: 'PENDIENTE' },
  { nombre: 'LUCILA', periodo: '01/09 - 15/09 (15dias)', regreso: '16-Set' },
  { nombre: 'VICTORIA', periodo: '06/09 - 20/09 (15dias)', regreso: '21-Set' },
  { nombre: 'LUCY', periodo: '16/09 - 30/09 (15dias)', regreso: '1-Oct' },
  { nombre: 'HEIDDY', periodo: '', regreso: '' },
];

// --- New Data Structure for Visual Planner ---
const scheduleData = {
    "higuereta": {
        "days": ["LUNES 1", "MARTES 2", "MIERCOLES 3", "JUEVES 4", "VIERNES 5"],
        "timeSlots": [
            {
                "time": "9am",
                "schedule": [
                    { "names": ["Pilar", { "name": "Lucila", "status": "vacation" }] },
                    { "names": ["Pilar", { "name": "Lucila", "status": "vacation" }] },
                    { "names": ["Pilar", { "name": "Lucila", "status": "vacation" }] },
                    { "names": ["Pilar", { "name": "Lucila", "status": "vacation" }] },
                    { "names": ["Pilar", { "name": "Lucila", "status": "vacation" }] }
                ]
            },
            {
                "time": "10am",
                "schedule": [
                    { "names": ["Liz", "Leydi"] },
                    { "names": ["Liz", "Leydi"] },
                    { "names": ["Liz", { "name": "Leydi", "status": "rest" }] },
                    { "names": ["Liz", "Leydi", { "name": "Lucy", "status": "cover" }] },
                    { "names": ["Liz", "Leydi", { "name": "Lucy", "status": "cover" }] }
                ]
            },
            {
                "time": "11am",
                "schedule": [
                    { "names": ["Victoria", "Angela", "Gloria"] },
                    { "names": ["Victoria", "Angela", { "name": "Gloria", "status": "rest" }] },
                    { "names": ["Victoria", { "name": "Angela", "status": "rest" }, "Gloria"] },
                    { "names": ["Victoria", "Angela", "Gloria"] },
                    { "names": ["Victoria", "Angela", "Gloria"] }
                ]
            },
            {
                "time": "12:30pm",
                "schedule": [
                    { "names": [{ "name": "Isabel", "status": "rest" }, "Heiddy"] },
                    { "names": ["Isabel", "Heiddy"] },
                    { "names": [{ "name": "Isabel", "status": "rest" }, "Heiddy"] },
                    { "names": ["Isabel", { "name": "Heiddy", "status": "rest" }] },
                    { "names": ["Isabel", { "name": "Heiddy", "status": "rest" }] }
                ]
            }
        ]
    }
};

const NameBadge = ({ item }: { item: string | { name: string; status: 'vacation' | 'rest' | 'cover' } }) => {
    if (typeof item === 'string') {
        return <div className="p-1">{item}</div>;
    }
    const { name, status } = item;
    const colorClasses = {
        vacation: 'bg-orange-200 text-orange-800',
        rest: 'bg-yellow-200 text-yellow-800',
        cover: 'bg-green-200 text-green-800',
    };
    return <div className={cn('p-1 rounded-md', colorClasses[status])}>{name}</div>;
};


interface RotationGroup {
  id: string;
  name: string;
  professionals: Professional[];
}

export default function RotationsPage() {
  const { user } = useAuth();
  const [activeProfessionals, setActiveProfessionals] = useState<Professional[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [rotationGroups, setRotationGroups] = useState<Record<LocationId, RotationGroup[]>>({} as Record<LocationId, RotationGroup[]>);
  const [unassignedProfessionals, setUnassignedProfessionals] = useState<Record<LocationId, Professional[]>>({} as Record<LocationId, Professional[]>);

  const [domingosHiguereta, setDomingosHiguereta] = useState(initialDomingosDataHiguereta);
  const [domingosSanAntonio, setDomingosSanAntonio] = useState(initialDomingosDataSanAntonio);

  useEffect(() => {
    async function loadInitialData() {
      setIsLoading(true);
      try {
        const [allProfs, allLocations] = await Promise.all([getProfessionals(), getLocations()]);
        
        const activeProfs = allProfs.filter(prof => {
          const status = getContractDisplayStatus(prof.currentContract);
          return status === 'Activo' || status === 'Próximo a Vencer';
        });

        setActiveProfessionals(activeProfs);
        setLocations(allLocations);
        
        const initialGroups: Record<LocationId, RotationGroup[]> = {} as Record<LocationId, RotationGroup[]>;
        const initialUnassigned: Record<LocationId, Professional[]> = {} as Record<LocationId, Professional[]>;
        
        allLocations.forEach(loc => {
            const groupCount = loc.id === 'san_antonio' ? 3 : 2;
            initialGroups[loc.id] = Array.from({ length: groupCount }, (_, i) => ({
                id: `g${i + 1}`,
                name: `Grupo ${i + 1}`,
                professionals: []
            }));
            initialUnassigned[loc.id] = activeProfs.filter(p => p.locationId === loc.id);
        });


        setRotationGroups(initialGroups);
        setUnassignedProfessionals(initialUnassigned);

      } catch (error) {
        console.error("Error loading initial rotation data:", error);
      } finally {
        setIsLoading(false);
      }
    }
    loadInitialData();
  }, []);

  const handleDragStart = (e: React.DragEvent<HTMLDivElement>, prof: Professional, origin: string) => {
    e.dataTransfer.setData("application/json", JSON.stringify({ profId: prof.id, origin }));
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>, targetGroupId: string, locationId: LocationId) => {
    e.preventDefault();
    const { profId, origin } = JSON.parse(e.dataTransfer.getData("application/json"));
    
    const profToMove = activeProfessionals.find(p => p.id === profId);
    if (!profToMove) return;

    // Remove from unassigned list for that location
    setUnassignedProfessionals(prev => {
        const newUnassigned = {...prev};
        if(newUnassigned[locationId]) {
            newUnassigned[locationId] = newUnassigned[locationId].filter(p => p.id !== profId);
        }
        return newUnassigned;
    });

    setRotationGroups(prev => {
        const newGroups = {...prev};
        if (newGroups[locationId]) {
             // Remove from any group it might be in already across all locations
            Object.keys(newGroups).forEach(locId => {
                newGroups[locId as LocationId] = newGroups[locId as LocationId].map(g => ({...g, professionals: g.professionals.filter(p => p.id !== profId)}));
            });
            
            // Add to the new group
            const targetGroupIndex = newGroups[locationId].findIndex(g => g.id === targetGroupId);
            if (targetGroupIndex !== -1 && !newGroups[locationId][targetGroupIndex].professionals.some(p => p.id === profId)) {
               newGroups[locationId][targetGroupIndex].professionals.push(profToMove);
            }
        }
        return newGroups;
    });
  };

  const handleDropOnUnassigned = (e: React.DragEvent<HTMLDivElement>, locationId: LocationId) => {
     e.preventDefault();
     const { profId } = JSON.parse(e.dataTransfer.getData("application/json"));
     
     const profToMove = activeProfessionals.find(p => p.id === profId);
     if (!profToMove) return;

     // Remove from any group it might be in
     setRotationGroups(prev => {
        const newGroups = {...prev};
        Object.keys(newGroups).forEach(locId => {
            newGroups[locId as LocationId] = newGroups[locId as LocationId].map(g => ({...g, professionals: g.professionals.filter(p => p.id !== profId)}));
        });
        return newGroups;
     });
    
     // Add to unassigned ONLY if it belongs to that location
     if (profToMove.locationId === locationId) {
        setUnassignedProfessionals(prev => {
            const newUnassigned = {...prev};
            if (newUnassigned[locationId] && !newUnassigned[locationId].some(p => p.id === profId)) {
                newUnassigned[locationId] = [...newUnassigned[locationId], profToMove];
            }
            return newUnassigned;
        });
     }
  }

  const handleUpdateDomingoGroup = (fecha: string, newGroup: number, locationId: LocationId) => {
    if (locationId === 'higuereta') {
        setDomingosHiguereta(prev => prev.map(d => d.fecha === fecha ? {...d, grupo: newGroup} : d));
    } else if (locationId === 'san_antonio') {
        setDomingosSanAntonio(prev => prev.map(d => d.fecha === fecha ? {...d, grupo: newGroup} : d));
    }
  };


  const RotationPlanner = ({ location }: { location: Location }) => {
    const groups = rotationGroups[location.id] || [];
    const unassigned = unassignedProfessionals[location.id] || [];

    return (
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div 
          className="md:col-span-1 p-4 border rounded-lg bg-muted/30"
          onDragOver={handleDragOver}
          onDrop={(e) => handleDropOnUnassigned(e, location.id)}
        >
          <h3 className="font-semibold mb-2">Profesionales Sin Asignar ({unassigned.length})</h3>
          <div className="space-y-2">
            {unassigned.map(prof => (
              <div 
                key={prof.id} 
                draggable
                onDragStart={(e) => handleDragStart(e, prof, 'unassigned')}
                className="flex items-center gap-2 p-2 bg-background rounded-md shadow-sm cursor-grab border"
              >
                <GripVertical className="h-4 w-4 text-muted-foreground"/>
                <span className="text-sm font-medium">{prof.firstName} {prof.lastName}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="md:col-span-3 grid grid-cols-1 sm:grid-cols-3 gap-4">
          {groups.map(group => (
            <div 
              key={group.id} 
              className="p-4 border rounded-lg"
              onDragOver={handleDragOver}
              onDrop={(e) => handleDrop(e, group.id, location.id)}
            >
              <h3 className="font-semibold mb-2">{group.name} ({group.professionals.length})</h3>
              <div className="space-y-2 min-h-[50px]">
                {group.professionals.map(prof => (
                   <div 
                    key={prof.id} 
                    draggable
                    onDragStart={(e) => handleDragStart(e, prof, group.id)}
                    className="flex items-center gap-2 p-2 bg-background rounded-md shadow-sm cursor-grab border"
                   >
                     <GripVertical className="h-4 w-4 text-muted-foreground"/>
                     <span className="text-sm font-medium">{prof.firstName} {prof.lastName}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };
  
  const VisualPlanner = ({ locationId }: { locationId: 'higuereta' }) => {
    const data = scheduleData[locationId];
    if (!data) return null;

    return (
        <Card>
            <CardHeader>
                <CardTitle>Planificador Semanal Visual (Ejemplo Higuereta)</CardTitle>
                <CardDescription>
                    Vista de la semana del 1 al 5 de Septiembre, mostrando los turnos y estados del personal.
                </CardDescription>
            </CardHeader>
            <CardContent>
                <div className="border rounded-lg overflow-x-auto">
                    <Table className="min-w-max">
                        <TableHeader>
                            <TableRow>
                                <TableHead className="w-[100px] font-semibold sticky left-0 bg-background z-10">HORA</TableHead>
                                {data.days.map(day => <TableHead key={day} className="text-center font-semibold">{day}</TableHead>)}
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {data.timeSlots.map(slot => (
                                <TableRow key={slot.time}>
                                    <TableCell className="font-semibold sticky left-0 bg-background z-10">{slot.time}</TableCell>
                                    {slot.schedule.map((daySchedule, index) => (
                                        <TableCell key={index} className="text-center p-1 align-top">
                                            <div className="space-y-1">
                                                {daySchedule.names.map((item, nameIndex) => (
                                                    <NameBadge key={nameIndex} item={item} />
                                                ))}
                                            </div>
                                        </TableCell>
                                    ))}
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </div>
                <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-sm">
                    <div className="flex items-center gap-2"><div className="w-4 h-4 rounded-full bg-orange-200"/><span>Vacaciones</span></div>
                    <div className="flex items-center gap-2"><div className="w-4 h-4 rounded-full bg-yellow-200"/><span>Descanso</span></div>
                    <div className="flex items-center gap-2"><div className="w-4 h-4 rounded-full bg-green-200"/><span>Cubre Turno</span></div>
                </div>
            </CardContent>
        </Card>
    );
  };


  return (
    <div className="container mx-auto py-8 px-4 md:px-0 space-y-8">
      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle className="text-3xl flex items-center gap-2">
            <Calendar className="text-primary" />
            Gestión de Rotaciones y Descansos
          </CardTitle>
          <CardDescription>
            Visualización de los grupos de trabajo para domingos, feriados y gestión de vacaciones del personal.
          </CardDescription>
        </CardHeader>
      </Card>

      <VisualPlanner locationId="higuereta" />
      
      <Tabs defaultValue={locations[0]?.id || 'loading'} className="w-full">
        <TabsList>
          {isLoading ? <Loader2 className="h-4 w-4 animate-spin"/> : locations.map(loc => <TabsTrigger key={loc.id} value={loc.id}>{loc.name}</TabsTrigger>)}
        </TabsList>
        
        {isLoading ? <div className="flex justify-center items-center h-40"><Loader2 className="h-8 w-8 animate-spin" /></div> : 
        
        locations.map(loc => (
          <TabsContent key={loc.id} value={loc.id} className="mt-4 space-y-8">
            <Card>
              <CardHeader>
                <CardTitle>Planificador de Grupos de Rotación para {loc.name}</CardTitle>
                <CardDescription>Arrastre y suelte a los profesionales para asignarlos a los grupos de rotación de esta sede.</CardDescription>
              </CardHeader>
              <CardContent>
                <RotationPlanner location={loc}/>
              </CardContent>
            </Card>

            {loc.id === 'higuereta' && (
              <>
                <Card>
                  <CardHeader>
                    <CardTitle className="text-xl flex items-center gap-2"><Sun className="text-amber-500"/>Asignación de Domingos (Ejemplo)</CardTitle>
                    <CardDescription>Esta tabla muestra un ejemplo de cómo se aplicarían los grupos a los domingos.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Table>
                    <TableHeader><TableRow><TableHead>Domingo</TableHead><TableHead>Grupo Asignado</TableHead><TableHead>Encargada</TableHead></TableRow></TableHeader>
                    <TableBody>
                        {domingosHiguereta.map(d => (
                        <TableRow key={d.fecha}>
                            <TableCell>{d.fecha} {d.feriado && <Badge variant="destructive">FERIADO</Badge>}</TableCell>
                            <TableCell>
                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                        <Button variant="outline" size="sm" className="w-24">
                                            Grupo {d.grupo}
                                        </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent>
                                        {[1, 2].map(groupNum => (
                                             <DropdownMenuItem key={groupNum} onSelect={() => handleUpdateDomingoGroup(d.fecha, groupNum, 'higuereta')}>
                                                Grupo {groupNum}
                                             </DropdownMenuItem>
                                        ))}
                                    </DropdownMenuContent>
                                </DropdownMenu>
                            </TableCell>
                            <TableCell>{d.encargada}</TableCell>
                        </TableRow>
                        ))}
                    </TableBody>
                    </Table>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle className="text-xl flex items-center gap-2"><Star className="text-yellow-500"/>Rotación de Feriados (Ejemplo)</CardTitle>
                  </CardHeader>
                  <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <Card>
                          <CardHeader className="pb-2"><CardTitle className="text-lg">Grupo 1 Feriados</CardTitle></CardHeader>
                          <CardContent><ul className="list-disc list-inside">{feriadosGrupo1.map(p => <li key={`f1-${p}`}>{p}</li>)}</ul></CardContent>
                      </Card>
                      <Card>
                          <CardHeader className="pb-2"><CardTitle className="text-lg">Grupo 2 Feriados</CardTitle></CardHeader>
                          <CardContent><ul className="list-disc list-inside">{feriadosGrupo2.map(p => <li key={`f2-${p}`}>{p}</li>)}</ul></CardContent>
                      </Card>
                  </CardContent>
                </Card>
              </>
            )}

            {loc.id === 'san_antonio' && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-xl flex items-center gap-2"><Sun className="text-amber-500"/>Asignación de Domingos (Ejemplo)</CardTitle>
                    <CardDescription>Esta tabla muestra un ejemplo de cómo se aplicarían los grupos a los domingos.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Table>
                    <TableHeader><TableRow><TableHead>Domingo</TableHead><TableHead>Grupo Asignado</TableHead></TableRow></TableHeader>
                    <TableBody>
                        {domingosSanAntonio.map(d => (
                        <TableRow key={d.fecha}>
                            <TableCell>{d.fecha}</TableCell>
                            <TableCell>
                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                        <Button variant="outline" size="sm" className="w-24">
                                            Grupo {d.grupo}
                                        </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent>
                                        {[1, 2, 3].map(groupNum => (
                                             <DropdownMenuItem key={groupNum} onSelect={() => handleUpdateDomingoGroup(d.fecha, groupNum, 'san_antonio')}>
                                                Grupo {groupNum}
                                             </DropdownMenuItem>
                                        ))}
                                    </DropdownMenuContent>
                                </DropdownMenu>
                            </TableCell>
                        </TableRow>
                        ))}
                    </TableBody>
                    </Table>
                  </CardContent>
                </Card>
            )}

          </TabsContent>
        ))}
      </Tabs>
      
      <Card>
        <CardHeader>
          <CardTitle className="text-xl flex items-center gap-2"><Plane className="text-sky-500"/>Registro General de Vacaciones (Ejemplo)</CardTitle>
        </CardHeader>
        <CardContent>
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead>Profesional</TableHead>
                        <TableHead>Período de Vacaciones</TableHead>
                        <TableHead>Regreso</TableHead>
                        <TableHead>Estado</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {vacaciones.map((v, i) => (
                        <TableRow key={`${v.nombre}-${i}`} className={v.estado ? 'bg-yellow-50' : ''}>
                            <TableCell>{v.nombre}</TableCell>
                            <TableCell>{v.periodo}</TableCell>
                            <TableCell>{v.regreso}</TableCell>
                            <TableCell>
                                {v.estado && <Badge variant="outline" className="border-yellow-400 text-yellow-700">{v.estado}</Badge>}
                            </TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </CardContent>
      </Card>

    </div>
  );
}
