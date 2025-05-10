"use client";

import type { Patient, Appointment } from '@/types';
import { getPatientAppointmentHistory, getProfessionalById } from '@/lib/data';
import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { format, parseISO, differenceInDays, formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import { UserSquare, CalendarDays, Stethoscope, TrendingUp, MessageSquare, AlertTriangle } from 'lucide-react';

interface PatientHistoryPanelProps {
  patient: Patient;
}

export function PatientHistoryPanel({ patient }: PatientHistoryPanelProps) {
  const [history, setHistory] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [preferredProfessionalName, setPreferredProfessionalName] = useState<string | null>(null);

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      const appointmentHistory = await getPatientAppointmentHistory(patient.id);
      setHistory(appointmentHistory);

      if (patient.preferredProfessionalId) {
        const prof = await getProfessionalById(patient.preferredProfessionalId);
        setPreferredProfessionalName(prof ? `${prof.firstName} ${prof.lastName}` : 'No encontrado');
      } else {
        setPreferredProfessionalName(null);
      }
      setLoading(false);
    }
    fetchData();
  }, [patient]);

  if (loading) {
    return <p className="text-muted-foreground">Cargando historial del paciente...</p>;
  }

  const totalVisits = history.length;
  const lastVisit = history.length > 0 ? history[0] : null;
  const lastVisitDate = lastVisit ? parseISO(lastVisit.appointmentDateTime) : null;

  return (
    <Card className="bg-secondary/50 shadow-inner">
      <CardHeader>
        <CardTitle className="text-xl flex items-center gap-2"><UserSquare /> Historial de {patient.firstName} {patient.lastName}</CardTitle>
        <CardDescription>Resumen de actividad y preferencias del paciente.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="font-medium flex items-center gap-1"><TrendingUp size={16} /> Visitas Totales:</p>
            <p>{totalVisits}</p>
          </div>
          <div>
            <p className="font-medium flex items-center gap-1"><CalendarDays size={16} /> Última Visita:</p>
            <p>{lastVisitDate ? `${format(lastVisitDate, "PPP", { locale: es })} (Hace ${formatDistanceToNow(lastVisitDate, { locale: es, addSuffix: true })})` : 'N/A'}</p>
          </div>
          <div>
            <p className="font-medium flex items-center gap-1"><Stethoscope size={16} /> Profesional Preferido:</p>
            <p>{preferredProfessionalName || 'No especificado'}</p>
          </div>
          {patient.notes && (
             <div>
                <p className="font-medium flex items-center gap-1"><MessageSquare size={16} /> Observaciones Generales:</p>
                <p className="text-xs p-2 bg-background rounded-md">{patient.notes}</p>
            </div>
          )}
        </div>

        {history.length > 0 && (
          <div>
            <h4 className="font-semibold mb-2 text-md">Citas Anteriores (más recientes primero):</h4>
            <ScrollArea className="h-40 rounded-md border p-2 bg-background">
              <ul className="space-y-2">
                {history.slice(0, 5).map(appt => ( // Show last 5
                  <li key={appt.id} className="p-2 border-b last:border-b-0 text-xs">
                    <div className="flex justify-between items-center">
                      <span>{format(parseISO(appt.appointmentDateTime), "dd/MM/yy HH:mm", { locale: es })} - {appt.service?.name}</span>
                       <Badge variant={appt.status === 'completed' ? 'default' : 'destructive'} className="capitalize text-xs">
                        {appt.status.replace('_', ' ')}
                      </Badge>
                    </div>
                    {appt.professional && <p className="text-muted-foreground text-xs">Atendido por: {appt.professional.firstName} {appt.professional.lastName}</p>}
                    {appt.bookingObservations && <p className="text-muted-foreground text-xs mt-1">Obs: {appt.bookingObservations}</p>}
                  </li>
                ))}
              </ul>
            </ScrollArea>
          </div>
        )}
        {history.length === 0 && !loading && (
             <div className="text-center py-4 text-muted-foreground">
                <AlertTriangle className="mx-auto h-8 w-8 mb-2" />
                <p>No hay historial de citas previas para este paciente.</p>
            </div>
        )}
      </CardContent>
    </Card>
  );
}
