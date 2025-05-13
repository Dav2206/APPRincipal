
"use client";

import type { Appointment, Professional } from '@/types';
import React from 'react';
import { parseISO, getHours, getMinutes, addMinutes, format } from 'date-fns';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { User, Clock, AlertTriangle, Shuffle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { LOCATIONS } from '@/lib/constants';
import { Badge } from '@/components/ui/badge';
import { es } from 'date-fns/locale';

interface DailyTimelineProps {
  professionals: Professional[];
  appointments: Appointment[];
  timeSlots: string[]; // e.g., ["09:00", "09:30", ..., "19:30"]
  currentDate: Date;
  onAppointmentClick?: (appointment: Appointment) => void;
}

const PIXELS_PER_MINUTE = 1.5; 
const DAY_START_HOUR = 9; 

const timeToMinutesOffset = (timeStr: string): number => {
  const [hours, minutes] = timeStr.split(':').map(Number);
  return (hours - DAY_START_HOUR) * 60 + minutes;
};

const isOverlapping = (apptA: Appointment, apptB: Appointment): boolean => {
  const startA = parseISO(apptA.appointmentDateTime);
  const endA = addMinutes(startA, apptA.durationMinutes);
  const startB = parseISO(apptB.appointmentDateTime);
  const endB = addMinutes(startB, apptB.durationMinutes);
  return startA < endB && endA > startB;
};

const DailyTimelineComponent = ({ professionals, appointments, timeSlots, onAppointmentClick }: DailyTimelineProps) => {
  
  if (professionals.length === 0) {
    return <p className="text-muted-foreground text-center py-8">No hay profesionales para mostrar en esta sede.</p>;
  }

  const getAppointmentStyle = (appointment: Appointment) => {
    const appointmentStartDateTime = parseISO(appointment.appointmentDateTime);
    const apptHours = getHours(appointmentStartDateTime);
    const apptMinutes = getMinutes(appointmentStartDateTime);
    const minutesFromTimelineStart = (apptHours - DAY_START_HOUR) * 60 + apptMinutes;
    const top = minutesFromTimelineStart * PIXELS_PER_MINUTE;
    const height = appointment.durationMinutes * PIXELS_PER_MINUTE;
    return {
      top: `${top}px`,
      height: `${height}px`,
    };
  };
  
  const totalTimelineHeight = (timeSlots.length * 30 * PIXELS_PER_MINUTE) + PIXELS_PER_MINUTE * 30;

  return (
    <TooltipProvider>
      <ScrollArea className="w-full whitespace-nowrap rounded-md border">
        <div className="flex relative">
          {/* Time Column */}
          <div className="sticky left-0 z-10 bg-background border-r">
            <div className="h-16 flex items-center justify-center font-semibold border-b px-2 text-sm">Hora</div>
            {timeSlots.map((slot) => (
              <div 
                key={slot} 
                className="h-[45px] flex items-center justify-center text-xs border-b px-2"
                style={{ height: `${30 * PIXELS_PER_MINUTE}px` }}
              >
                {slot}
              </div>
            ))}
            <div 
                className="h-[45px] flex items-center justify-center text-xs border-b px-2 opacity-50"
                style={{ height: `${30 * PIXELS_PER_MINUTE}px` }}
              >
                {`${parseInt(timeSlots[timeSlots.length-1].split(':')[0]) + (timeSlots[timeSlots.length-1].split(':')[1] === '30' ? 1 : 0)}:${timeSlots[timeSlots.length-1].split(':')[1] === '30' ? '00' : '30'}`}
              </div>
          </div>

          {/* Professionals Columns */}
          <div className="flex flex-nowrap">
            {professionals.map(prof => {
              const professionalAppointments = appointments
                .filter(appt => appt.professionalId === prof.id)
                .sort((a, b) => parseISO(a.appointmentDateTime).getTime() - parseISO(b.appointmentDateTime).getTime());

              const overlappingAppointmentIds = new Set<string>();
              for (let i = 0; i < professionalAppointments.length; i++) {
                for (let j = i + 1; j < professionalAppointments.length; j++) {
                  if (isOverlapping(professionalAppointments[i], professionalAppointments[j])) {
                    overlappingAppointmentIds.add(professionalAppointments[i].id);
                    overlappingAppointmentIds.add(professionalAppointments[j].id);
                  }
                }
              }

              return (
                <div key={prof.id} className="min-w-[150px] md:min-w-[180px] border-r relative">
                  <div className="sticky top-0 z-10 h-16 flex items-center justify-center font-semibold border-b bg-background p-2 text-sm truncate" title={`${prof.firstName} ${prof.lastName}`}>
                    {prof.firstName} {prof.lastName.split(' ')[0]}
                    {overlappingAppointmentIds.size > 0 && (
                      <Tooltip delayDuration={100}>
                        <TooltipTrigger asChild>
                           <AlertTriangle className="h-4 w-4 text-destructive ml-1 shrink-0" />
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Este profesional tiene citas superpuestas.</p>
                        </TooltipContent>
                      </Tooltip>
                    )}
                  </div>
                  <div className="relative" style={{ height: `${totalTimelineHeight}px` }}>
                    {timeSlots.map((slot) => (
                       <div key={`${prof.id}-${slot}-line`} className="border-b border-dashed border-muted/50" style={{ height: `${30 * PIXELS_PER_MINUTE}px` }}></div>
                    ))}
                     <div className="border-b border-dashed border-muted/50" style={{ height: `${30 * PIXELS_PER_MINUTE}px` }}></div>

                    {professionalAppointments.map(appt => {
                      const isApptOverlapping = overlappingAppointmentIds.has(appt.id);
                      
                      let appointmentMainText = `${appt.patient?.firstName || ''} ${appt.patient?.lastName || ''}`.trim();
                      if (prof.id === appt.professionalId && appt.isExternalProfessional && appt.locationId !== prof.locationId) {
                        const destinationSedeName = LOCATIONS.find(l => l.id === appt.locationId)?.name || 'Sede Desconocida';
                        appointmentMainText = `Traslado a: ${destinationSedeName}`;
                      } else if (!appointmentMainText) {
                        appointmentMainText = "Cita Reservada";
                      }

                      const originLocationName = appt.isExternalProfessional && appt.externalProfessionalOriginLocationId 
                        ? LOCATIONS.find(l => l.id === appt.externalProfessionalOriginLocationId)?.name 
                        : null;

                      return (
                      <Tooltip key={appt.id} delayDuration={100}>
                        <TooltipTrigger asChild>
                          <div
                            className={cn(
                              "absolute left-1 right-1 rounded-md p-1.5 shadow-md text-xs overflow-hidden cursor-pointer hover:opacity-80 transition-opacity flex flex-col justify-between",
                              isApptOverlapping && "ring-2 ring-destructive border-destructive"
                            )}
                            style={{
                              ...getAppointmentStyle(appt),
                              backgroundColor: appt.service?.id ? `hsl(var(--chart-${(appt.service.id.charCodeAt(0) % 5) + 1}))` : 'hsl(var(--accent))',
                              color: 'hsl(var(--accent-foreground))',
                              borderColor: isApptOverlapping ? 'hsl(var(--destructive))' : `hsl(var(--chart-${(appt.service?.id.charCodeAt(0) % 5) + 1}))`,
                              borderWidth: isApptOverlapping ? '2px' : '1px',
                            }}
                            onClick={() => onAppointmentClick?.(appt)}
                          >
                            <div className="flex-grow overflow-hidden">
                              <div className="flex justify-between items-start">
                                <p className="font-semibold truncate leading-tight">{appointmentMainText}</p>
                                {isApptOverlapping && (
                                  <AlertTriangle className="h-3 w-3 text-destructive-foreground bg-destructive rounded-full p-px shrink-0 ml-1" />
                                )}
                              </div>
                              <p className="truncate text-[10px] leading-tight opacity-90">{appt.service?.name}</p>
                              {appt.durationMinutes > 30 && <p className="text-[10px] leading-tight opacity-80 mt-0.5">({appt.durationMinutes} min)</p>}
                            </div>
                            {originLocationName && appt.isExternalProfessional && appt.locationId !== prof.locationId && ( 
                              <Badge variant="outline" className="mt-1 text-[9px] p-0.5 h-fit bg-orange-100 text-orange-700 border-orange-300 self-start truncate">
                                <Shuffle size={10} className="mr-1"/> De: {originLocationName}
                              </Badge>
                            )}
                             {originLocationName && appt.isExternalProfessional && appt.locationId === prof.locationId && appt.externalProfessionalOriginLocationId === prof.id && ( 
                               <Badge variant="outline" className="mt-1 text-[9px] p-0.5 h-fit bg-green-100 text-green-700 border-green-300 self-start truncate">
                                <Shuffle size={10} className="mr-1"/> Cubriendo (Origen: {originLocationName})
                              </Badge>
                            )}
                          </div>
                        </TooltipTrigger>
                        <TooltipContent className="bg-popover text-popover-foreground p-2 rounded-md shadow-lg max-w-xs">
                          {isApptOverlapping && <p className="text-destructive font-semibold text-xs flex items-center gap-1 mb-1"><AlertTriangle size={12} /> ¡Cita Superpuesta!</p>}
                          
                          {appointmentMainText.startsWith("Traslado a:") ? (
                             <p className="font-bold text-sm">{appointmentMainText}</p>
                          ) : (
                             <p className="font-bold text-sm">{appt.patient?.firstName} {appt.patient?.lastName}</p>
                          )}

                          <p><User size={12} className="inline mr-1"/> {appt.service?.name}</p>
                          <p><Clock size={12} className="inline mr-1"/> {format(parseISO(appt.appointmentDateTime), "HH:mm", { locale: es })} ({appt.durationMinutes} min)</p>
                          
                          {originLocationName && appt.isExternalProfessional && appt.locationId !== prof.locationId && (
                            <p className="text-orange-600 text-xs mt-1 flex items-center gap-1">
                              <Shuffle size={12} className="inline"/> Profesional de: {originLocationName}
                            </p>
                          )}
                           {originLocationName && appt.isExternalProfessional && appt.locationId === prof.locationId && appt.externalProfessionalOriginLocationId === prof.id && (
                             <p className="text-green-600 text-xs mt-1 flex items-center gap-1">
                              <Shuffle size={12} className="inline"/> Cubriendo (Profesional de: {originLocationName})
                            </p>
                           )}
                          {appt.bookingObservations && <p className="text-xs mt-1 italic">Obs: {appt.bookingObservations}</p>}
                        </TooltipContent>
                      </Tooltip>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        <ScrollBar orientation="horizontal" />
       {appointments.length === 0 && professionals.length > 0 && (
        <p className="text-muted-foreground text-center py-8">No hay citas programadas para este día y selección.</p>
      )}
      </ScrollArea>
    </TooltipProvider>
  );
};

export const DailyTimeline = React.memo(DailyTimelineComponent);
