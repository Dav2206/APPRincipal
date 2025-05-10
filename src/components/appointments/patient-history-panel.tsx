
"use client";

import type { Patient, Appointment, AppointmentStatus } from '@/types';
import { getPatientAppointmentHistory, getProfessionalById } from '@/lib/data';
import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { format, parseISO, differenceInDays, formatDistanceToNow, differenceInYears } from 'date-fns';
import { es } from 'date-fns/locale';
import { UserSquare, CalendarDays, Stethoscope, TrendingUp, MessageSquare, AlertTriangle, Repeat, Cake } from 'lucide-react';
import { APPOINTMENT_STATUS, APPOINTMENT_STATUS_DISPLAY } from '@/lib/constants';

interface PatientHistoryPanelProps {
  patient: Patient;
}

export function PatientHistoryPanel({ patient }: PatientHistoryPanelProps) {
  const [history, setHistory] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [preferredProfessionalName, setPreferredProfessionalName] = useState<string | null>(null);
  const [averageDaysBetweenVisits, setAverageDaysBetweenVisits] = useState<number | null>(null);
  const [age, setAge] = useState<number | null>(null);
  const [nextRecommendedVisit, setNextRecommendedVisit] = useState<string | null>(null);

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

      if (patient.dateOfBirth) {
        try {
          const dob = parseISO(patient.dateOfBirth);
          setAge(differenceInYears(new Date(), dob));
        } catch (e) {
          console.error("Error parsing date of birth:", e);
          setAge(null);
        }
      } else {
        setAge(null);
      }
      
      const completedVisits = appointmentHistory.filter(appt => appt.status === APPOINTMENT_STATUS.COMPLETED)
        .sort((a,b) => parseISO(a.appointmentDateTime).getTime() - parseISO(b.appointmentDateTime).getTime());

      if (completedVisits.length >= 2) {
        let totalDaysDifference = 0;
        for (let i = 1; i < completedVisits.length; i++) {
          const prevDate = parseISO(completedVisits[i-1].appointmentDateTime);
          const currentDate = parseISO(completedVisits[i].appointmentDateTime);
          totalDaysDifference += differenceInDays(currentDate, prevDate);
        }
        const avgDays = Math.round(totalDaysDifference / (completedVisits.length - 1));
        setAverageDaysBetweenVisits(avgDays);
        
        const lastCompletedVisitDate = parseISO(completedVisits[completedVisits.length - 1].appointmentDateTime);
        const recommendedNextDate = addDays(lastCompletedVisitDate, avgDays);
        setNextRecommendedVisit(format(recommendedNextDate, "PPP", { locale: es }));

      } else if (completedVisits.length === 1) {
        // Default recommendation if only one visit (e.g. 30 days)
        const lastCompletedVisitDate = parseISO(completedVisits[0].appointmentDateTime);
        const recommendedNextDate = addDays(lastCompletedVisitDate, 30); // Default to 30 days for next visit
        setNextRecommendedVisit(format(recommendedNextDate, "PPP", { locale: es }));
        setAverageDaysBetweenVisits(null); // Not enough data for average
      }
      else {
        setAverageDaysBetweenVisits(null);
        setNextRecommendedVisit(null);
      }

      setLoading(false);
    }
    fetchData();
  }, [patient]);

  if (loading) {
    return <p className="text-muted-foreground">Cargando historial del paciente...</p>;
  }

  const totalVisits = history.filter(h => h.status === APPOINTMENT_STATUS.COMPLETED).length;
  const lastVisit = history.length > 0 ? history.sort((a,b) => parseISO(b.appointmentDateTime).getTime() - parseISO(a.appointmentDateTime).getTime())[0] : null; 
  const lastVisitDate = lastVisit ? parseISO(lastVisit.appointmentDateTime) : null;

  return (
    <Card className="bg-secondary/50 shadow-inner">
      <CardHeader>
        <CardTitle className="text-xl flex items-center gap-2"><UserSquare /> Historial de {patient.firstName} {patient.lastName}</CardTitle>
        <CardDescription>Resumen de actividad y preferencias del paciente.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
          <div>
            <p className="font-medium flex items-center gap-1"><TrendingUp size={16} /> Visitas Completadas:</p>
            <p>{totalVisits}</p>
          </div>
          <div>
            <p className="font-medium flex items-center gap-1"><CalendarDays size={16} /> Última Visita:</p>
            <p>{lastVisitDate ? `${format(lastVisitDate, "PPP", { locale: es })} (Hace ${formatDistanceToNow(lastVisitDate, { locale: es, addSuffix: true })})` : 'N/A'}</p>
          </div>
           <div>
            <p className="font-medium flex items-center gap-1"><Repeat size={16} /> Frecuencia Aprox.:</p>
            <p>{averageDaysBetweenVisits !== null ? `Cada ${averageDaysBetweenVisits} días` : (totalVisits < 2 ? 'Pocas visitas para calcular' : 'N/A')}</p>
          </div>
          {age !== null && (
            <div>
              <p className="font-medium flex items-center gap-1"><Cake size={16} /> Edad:</p>
              <p>{age} años</p>
            </div>
          )}
          <div>
            <p className="font-medium flex items-center gap-1"><Stethoscope size={16} /> Profesional Preferido:</p>
            <p>{preferredProfessionalName || 'No especificado'}</p>
          </div>
           {nextRecommendedVisit && (
             <div>
                <p className="font-medium flex items-center gap-1 text-primary"><CalendarDays size={16}/> Próxima Cita Sugerida:</p>
                <p className="text-primary font-semibold">{nextRecommendedVisit}</p>
            </div>
           )}
          {patient.notes && (
             <div className="md:col-span-full">
                <p className="font-medium flex items-center gap-1"><MessageSquare size={16} /> Observaciones Generales:</p>
                <p className="text-xs p-2 bg-background rounded-md max-h-20 overflow-y-auto">{patient.notes}</p>
            </div>
          )}
        </div>

        {history.length > 0 && (
          <div>
            <h4 className="font-semibold mb-2 text-md">Citas Anteriores (más recientes primero):</h4>
            <ScrollArea className="h-40 rounded-md border p-2 bg-background">
              <ul className="space-y-2">
                {history.slice(0, 10).map(appt => ( // Show last 10
                  <li key={appt.id} className="p-2 border-b last:border-b-0 text-xs">
                    <div className="flex justify-between items-center">
                      <span>{format(parseISO(appt.appointmentDateTime), "dd/MM/yy HH:mm", { locale: es })} - {appt.service?.name}</span>
                       <Badge variant={appt.status === APPOINTMENT_STATUS.COMPLETED ? 'default' : 'destructive'} className={`capitalize text-xs ${appt.status === APPOINTMENT_STATUS.COMPLETED ? 'bg-green-600 text-white' : ''}`}>
                        {APPOINTMENT_STATUS_DISPLAY[appt.status as AppointmentStatus] || appt.status}
                      </Badge>
                    </div>
                    {appt.professional && <p className="text-muted-foreground text-xs">Atendido por: {appt.professional.firstName} {appt.professional.lastName}</p>}
                    {appt.bookingObservations && <p className="text-muted-foreground text-xs mt-1">Obs. Reserva: {appt.bookingObservations}</p>}
                     {appt.staffNotes && <p className="text-blue-700 text-xs mt-1">Obs. Staff: {appt.staffNotes}</p>}
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
