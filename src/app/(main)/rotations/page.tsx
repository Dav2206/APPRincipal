
"use client";

import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Users, Calendar, Plane, Sun, Star } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";


// --- Data for Higuereta ---
const descanosGrupo1Higuereta = [
  { nombre: 'ISABEL', dia: 'lunes' },
  { nombre: 'GLORIA', dia: 'martes' },
  { nombre: 'LEYDI', dia: 'miércoles' },
  { nombre: 'ANGELA', dia: 'miércoles' },
  { nombre: 'HEIDDY', dia: 'jueves' },
  { nombre: 'GLADY', dia: 'miércoles' },
  { nombre: 'GUISSEL', dia: 'N/A' },
];

const descanosGrupo2Higuereta = [
  { nombre: 'LIZ', dia: 'lunes' },
  { nombre: 'VICTORIA', dia: 'martes' },
  { nombre: 'PILAR', dia: 'martes' },
  { nombre: 'LUCILA', dia: 'miércoles' },
  { nombre: 'LUCY', dia: 'jueves' },
  { nombre: 'ROSSY', dia: 'miércoles' },
  { nombre: 'ENITH', dia: 'N/A' },
];

const domingosDataHiguereta = [
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

// --- Data for San Antonio ---
const descanosGrupo1SanAntonio = [
  { nombre: 'JUDITH', dia: 'lunes' },
  { nombre: 'MARISOL', dia: 'martes' },
];
const descanosGrupo2SanAntonio = [
  { nombre: 'JAZMIN', dia: 'lunes' },
  { nombre: 'YOSHI', dia: 'martes' },
];
const descanosGrupo3SanAntonio = [
  { nombre: 'NATHALY', dia: 'lunes' },
  { nombre: 'FLOR', dia: 'jueves' },
];

const domingosDataSanAntonio = [
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

// --- General Data ---
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


export default function RotationsPage() {
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
      
      <Tabs defaultValue="higuereta" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="higuereta">Sede Higuereta</TabsTrigger>
          <TabsTrigger value="san_antonio">Sede San Antonio</TabsTrigger>
        </TabsList>
        <TabsContent value="higuereta">
          <Card>
            <CardHeader>
              <CardTitle className="text-xl flex items-center gap-2"><Sun className="text-amber-500"/>Rotación de Domingos (Higuereta)</CardTitle>
              <CardDescription>Grupos de descanso y asignación de domingos y feriados.</CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="md:col-span-1 space-y-4">
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-lg">Grupo 1</CardTitle></CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader><TableRow><TableHead>Profesional</TableHead><TableHead>Día Descanso</TableHead></TableRow></TableHeader>
                      <TableBody>{descanosGrupo1Higuereta.map(p => (<TableRow key={`g1-${p.nombre}`}><TableCell>{p.nombre}</TableCell><TableCell className="capitalize">{p.dia}</TableCell></TableRow>))}</TableBody>
                    </Table>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-lg">Grupo 2</CardTitle></CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader><TableRow><TableHead>Profesional</TableHead><TableHead>Día Descanso</TableHead></TableRow></TableHeader>
                      <TableBody>{descanosGrupo2Higuereta.map(p => (<TableRow key={`g2-${p.nombre}`}><TableCell>{p.nombre}</TableCell><TableCell className="capitalize">{p.dia}</TableCell></TableRow>))}</TableBody>
                    </Table>
                  </CardContent>
                </Card>
              </div>
              <div className="md:col-span-2">
                <Card>
                    <CardHeader className="pb-2"><CardTitle className="text-lg">Asignación de Domingos</CardTitle></CardHeader>
                    <CardContent>
                        <Table>
                        <TableHeader><TableRow><TableHead>Domingo</TableHead><TableHead>Grupo Asignado</TableHead><TableHead>Encargada</TableHead></TableRow></TableHeader>
                        <TableBody>
                            {domingosDataHiguereta.map(d => (
                            <TableRow key={d.fecha}>
                                <TableCell>{d.fecha} {d.feriado && <Badge variant="destructive">FERIADO</Badge>}</TableCell>
                                <TableCell><Badge variant={d.grupo === 1 ? 'default' : 'secondary'}>GRUPO {d.grupo}</Badge></TableCell>
                                <TableCell>{d.encargada}</TableCell>
                            </TableRow>
                            ))}
                        </TableBody>
                        </Table>
                    </CardContent>
                </Card>
              </div>
            </CardContent>
          </Card>
          
          <Card className="mt-8">
            <CardHeader>
              <CardTitle className="text-xl flex items-center gap-2"><Star className="text-yellow-500"/>Rotación de Feriados (Higuereta)</CardTitle>
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
        </TabsContent>
        <TabsContent value="san_antonio">
           <Card>
            <CardHeader>
              <CardTitle className="text-xl flex items-center gap-2"><Sun className="text-amber-500"/>Rotación de Domingos (San Antonio)</CardTitle>
              <CardDescription>Grupos de descanso y asignación de domingos para San Antonio.</CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="md:col-span-1 space-y-4">
                 <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-lg">Grupo 1</CardTitle></CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader><TableRow><TableHead>Profesional</TableHead><TableHead>Día Descanso</TableHead></TableRow></TableHeader>
                      <TableBody>{descanosGrupo1SanAntonio.map(p => (<TableRow key={`sa-g1-${p.nombre}`}><TableCell>{p.nombre}</TableCell><TableCell className="capitalize">{p.dia}</TableCell></TableRow>))}</TableBody>
                    </Table>
                  </CardContent>
                </Card>
                 <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-lg">Grupo 2</CardTitle></CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader><TableRow><TableHead>Profesional</TableHead><TableHead>Día Descanso</TableHead></TableRow></TableHeader>
                      <TableBody>{descanosGrupo2SanAntonio.map(p => (<TableRow key={`sa-g2-${p.nombre}`}><TableCell>{p.nombre}</TableCell><TableCell className="capitalize">{p.dia}</TableCell></TableRow>))}</TableBody>
                    </Table>
                  </CardContent>
                </Card>
                 <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-lg">Grupo 3</CardTitle></CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader><TableRow><TableHead>Profesional</TableHead><TableHead>Día Descanso</TableHead></TableRow></TableHeader>
                      <TableBody>{descanosGrupo3SanAntonio.map(p => (<TableRow key={`sa-g3-${p.nombre}`}><TableCell>{p.nombre}</TableCell><TableCell className="capitalize">{p.dia}</TableCell></TableRow>))}</TableBody>
                    </Table>
                  </CardContent>
                </Card>
              </div>
              <div className="md:col-span-2">
                 <Card>
                    <CardHeader className="pb-2"><CardTitle className="text-lg">Asignación de Domingos</CardTitle></CardHeader>
                    <CardContent>
                        <Table>
                        <TableHeader><TableRow><TableHead>Domingo</TableHead><TableHead>Grupo Asignado</TableHead></TableRow></TableHeader>
                        <TableBody>
                            {domingosDataSanAntonio.map(d => (
                            <TableRow key={d.fecha}>
                                <TableCell>{d.fecha}</TableCell>
                                <TableCell><Badge variant={d.grupo === 1 ? 'default' : (d.grupo === 2 ? 'secondary' : 'outline')}>GRUPO {d.grupo}</Badge></TableCell>
                            </TableRow>
                            ))}
                        </TableBody>
                        </Table>
                    </CardContent>
                 </Card>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
      
      <Card>
        <CardHeader>
          <CardTitle className="text-xl flex items-center gap-2"><Plane className="text-sky-500"/>Registro General de Vacaciones</CardTitle>
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

    