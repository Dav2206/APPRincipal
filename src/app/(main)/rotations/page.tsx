
      
"use client";

import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Users, Calendar, Plane, Sun, Star } from 'lucide-react';
import { format, addDays, getDay } from 'date-fns';
import { es } from 'date-fns/locale';

// --- Data based on the provided Excel sheet for Higuereta ---

const descanosGrupo1 = [
  { nombre: 'ISABEL', dia: 'lunes' },
  { nombre: 'GLORIA', dia: 'martes' },
  { nombre: 'LEYDI', dia: 'miércoles' },
  { nombre: 'ANGELA', dia: 'miércoles' },
  { nombre: 'HEIDDY', dia: 'jueves' },
  { nombre: 'GLADY', dia: 'miércoles' },
  { nombre: 'GUISSEL', dia: 'N/A' },
];

const descanosGrupo2 = [
  { nombre: 'LIZ', dia: 'lunes' },
  { nombre: 'VICTORIA', dia: 'martes' },
  { nombre: 'PILAR', dia: 'martes' },
  { nombre: 'LUCILA', dia: 'miércoles' },
  { nombre: 'LUCY', dia: 'jueves' },
  { nombre: 'ROSSY', dia: 'miércoles' },
  { nombre: 'ENITH', dia: 'N/A' },
];

const feriadosGrupo1 = ['PILAR', 'ISABEL', 'HEIDDY', 'GLORIA', 'LUCILA'];
const feriadosGrupo2 = ['ANGELA', 'LIZ', 'LEYDI', 'VICTORIA', 'LUCY'];

const vacaciones = [
  { nombre: 'CARMEN', periodo: '02/05 - 08/05 (7dias)', regreso: '' },
  { nombre: 'LEYDI', periodo: '08/05 - 22/05 (15dias)', regreso: '' },
  { nombre: 'ISABEL', periodo: '30/06 - 05/07 (6dias)', regreso: '6-Jul' },
  { nombre: 'ISABEL', periodo: '09/10 - 17/10 (9dias)', regreso: '18-Oct', estado: 'PENDIENTE' },
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

const domingosData = [
    { fecha: "29-Jun", feriado: true, grupo: 1, encargada: 'Isabel' },
    { fecha: "6-Jul", feriado: false, grupo: 1, encargada: 'Liz' },
    { fecha: "13-Jul", feriado: false, grupo: 2, encargada: 'Gloria' },
    { fecha: "20-Jul", feriado: false, grupo: 1, encargada: 'Victoria' },
    { fecha: "27-Jul", feriado: false, grupo: 2, encargada: 'Leydi' },
    { fecha: "3-Ago", feriado: false, grupo: 1, encargada: 'Pilar' },
    { fecha: "10-Ago", feriado: false, grupo: 2, encargada: 'Angela' },
    { fecha: "17-Ago", feriado: false, grupo: 1, encargada: 'Lucila' },
    { fecha: "24-Ago", feriado: false, grupo: 2, encargada: 'Heiddy' },
    { fecha: "31-Ago", feriado: false, grupo: 1, encargada: 'Lucy' },
    { fecha: "7-Set", feriado: false, grupo: 2, encargada: 'Glady' },
    { fecha: "14-Set", feriado: false, grupo: 1, encargada: 'Rossy' },
    { fecha: "21-Set", feriado: false, grupo: 2, encargada: '' },
    { fecha: "28-Set", feriado: false, grupo: 1, encargada: '' },
    { fecha: "5-Oct", feriado: false, grupo: 2, encargada: '' },
    { fecha: "12-Oct", feriado: false, grupo: 1, encargada: '' },
    { fecha: "19-Oct", feriado: false, grupo: 2, encargada: '' },
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
            Visualización de los grupos de trabajo para domingos, feriados y gestión de vacaciones del personal de Higuereta.
          </CardDescription>
        </CardHeader>
      </Card>
      
      {/* --- Rotación de Domingos --- */}
      <Card>
        <CardHeader>
          <CardTitle className="text-xl flex items-center gap-2"><Sun className="text-amber-500"/>Rotación de Domingos (Higuereta)</CardTitle>
          <CardDescription>Grupos de descanso y asignación de domingos y feriados.</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Columna Grupos de Descanso */}
          <div className="md:col-span-1 space-y-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg">Grupo 1</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader><TableRow><TableHead>Profesional</TableHead><TableHead>Día Descanso</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {descanosGrupo1.map(p => (<TableRow key={`g1-${p.nombre}`}><TableCell>{p.nombre}</TableCell><TableCell className="capitalize">{p.dia}</TableCell></TableRow>))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
             <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg">Grupo 2</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader><TableRow><TableHead>Profesional</TableHead><TableHead>Día Descanso</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {descanosGrupo2.map(p => (<TableRow key={`g2-${p.nombre}`}><TableCell>{p.nombre}</TableCell><TableCell className="capitalize">{p.dia}</TableCell></TableRow>))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
          
          {/* Columna Asignación Domingos */}
          <div className="md:col-span-2">
             <Card>
                <CardHeader className="pb-2">
                    <CardTitle className="text-lg">Asignación de Domingos</CardTitle>
                </CardHeader>
                <CardContent>
                    <Table>
                    <TableHeader><TableRow><TableHead>Domingo</TableHead><TableHead>Grupo Asignado</TableHead><TableHead>Encargada</TableHead></TableRow></TableHeader>
                    <TableBody>
                        {domingosData.map(d => (
                        <TableRow key={d.fecha}>
                            <TableCell>{d.fecha} {d.feriado && <Badge variant="destructive">FERIADO</Badge>}</TableCell>
                            <TableCell>
                                <Badge variant={d.grupo === 1 ? 'default' : 'secondary'}>GRUPO {d.grupo}</Badge>
                            </TableCell>
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

    {/* --- Rotación de Feriados --- */}
      <Card>
        <CardHeader>
          <CardTitle className="text-xl flex items-center gap-2"><Star className="text-yellow-500"/>Rotación de Feriados</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
                <CardHeader className="pb-2">
                    <CardTitle className="text-lg">Grupo 1 Feriados</CardTitle>
                </CardHeader>
                <CardContent>
                   <ul className="list-disc list-inside">
                        {feriadosGrupo1.map(p => <li key={`f1-${p}`}>{p}</li>)}
                   </ul>
                </CardContent>
            </Card>
             <Card>
                <CardHeader className="pb-2">
                    <CardTitle className="text-lg">Grupo 2 Feriados</CardTitle>
                </CardHeader>
                <CardContent>
                   <ul className="list-disc list-inside">
                        {feriadosGrupo2.map(p => <li key={`f2-${p}`}>{p}</li>)}
                   </ul>
                </CardContent>
            </Card>
        </CardContent>
      </Card>

      {/* --- Vacaciones --- */}
      <Card>
        <CardHeader>
          <CardTitle className="text-xl flex items-center gap-2"><Plane className="text-sky-500"/>Registro de Vacaciones</CardTitle>
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
      
    