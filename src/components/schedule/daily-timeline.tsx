
"use client";

import type { Appointment, Professional } from '@/types';
import React from 'react';
import { parseISO, getHours, getMinutes, addMinutes } from 'date-fns';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { User, Clock, AlertTriangle, Shuffle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { LOCATIONS } from '@/lib/constants';
import { Badge } from '@/components/ui/badge';

interface DailyTimelineProps {
  professionals: Professional[];
  appointments: Appointment[];
  timeSlots: string[]; // e.g., ["09:00", "09:30", ..., "19:30"]
  currentDate: Date;
  onAppointmentClick?: (appointment: Appointment) => void;
}

const PIXELS_PER_MINUTE = 1.5; // Adjust for desired density; 30min slot = 45px
const DAY_START_HOUR = 9; // Timeline starts at 9 AM

// Helper function to convert time string "HH:MM" to minutes since DAY_START_HOUR
const timeToMinutesOffset = (timeStr: string): number => {
  const [hours, minutes] = timeStr.split(':').map(Number);
  return (hours - DAY_START_HOUR) * 60 + minutes;
};

const isOverlapping = (apptA: Appointment, apptB: Appointment): boolean => {
  const startA = parseISO(apptA.appointmentDateTime);
  const endA = addMinutes(startA, apptA.durationMinutes);
  const startB = parseISO(apptB.appointmentDateTime);
  const endB = addMinutes(startB, apptB.durationMinutes);
  // Check if intervals [startA, endA) and [startB, endB) overlap
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

    // Calculate minutes from the visual start of the timeline (DAY_START_HOUR)
    const minutesFromTimelineStart = (apptHours - DAY_START_HOUR) * 60 + apptMinutes;
    
    const top = minutesFromTimelineStart * PIXELS_PER_MINUTE;
    const height = appointment.durationMinutes * PIXELS_PER_MINUTE;

    return {
      top: `${top}px`,
      height: `${height}px`,
    };
  };
  
  const totalTimelineHeight = (timeSlots.length * 30 * PIXELS_PER_MINUTE) + PIXELS_PER_MINUTE * 30; // +30 for last slot end

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
                className="h-[45px] flex items-center justify-center text-xs border-b px-2" // 30 min * 1.5 px/min = 45px
                style={{ height: `${30 * PIXELS_PER_MINUTE}px` }}
              >
                {slot}
              </div>
            ))}
             {/* Extra slot to visually complete the last hour */}
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
                    {/* Grid lines for time slots (visual aid) */}
                    {timeSlots.map((slot) => (
                       <div key={`${prof.id}-${slot}-line`} className="border-b border-dashed border-muted/50" style={{ height: `${30 * PIXELS_PER_MINUTE}px` }}></div>
                    ))}
                     <div className="border-b border-dashed border-muted/50" style={{ height: `${30 * PIXELS_PER_MINUTE}px` }}></div>


                    {professionalAppointments.map(appt => {
                      const isApptOverlapping = overlappingAppointmentIds.has(appt.id);
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
                                <p className="font-semibold truncate leading-tight">{appt.patient?.firstName} {appt.patient?.lastName}</p>
                                {isApptOverlapping && (
                                  <AlertTriangle className="h-3 w-3 text-destructive-foreground bg-destructive rounded-full p-px shrink-0 ml-1" />
                                )}
                              </div>
                              <p className="truncate text-[10px] leading-tight opacity-90">{appt.service?.name}</p>
                              {appt.durationMinutes > 30 && <p className="text-[10px] leading-tight opacity-80 mt-0.5">({appt.durationMinutes} min)</p>}
                            </div>
                            {originLocationName && (
                              <Badge variant="outline" className="mt-1 text-[9px] p-0.5 h-fit bg-orange-100 text-orange-700 border-orange-300 self-start truncate">
                                <Shuffle size={10} className="mr-1"/> Traslado: {originLocationName}
                              </Badge>
                            )}
                          </div>
                        </TooltipTrigger>
                        <TooltipContent className="bg-popover text-popover-foreground p-2 rounded-md shadow-lg max-w-xs">
                          {isApptOverlapping && <p className="text-destructive font-semibold text-xs flex items-center gap-1 mb-1"><AlertTriangle size={12} /> ¡Cita Superpuesta!</p>}
                          <p className="font-bold text-sm">{appt.patient?.firstName} {appt.patient?.lastName}</p>
                          <p><User size={12} className="inline mr-1"/> {appt.service?.name}</p>
                          <p><Clock size={12} className="inline mr-1"/> {parseISO(appt.appointmentDateTime).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})} ({appt.durationMinutes} min)</p>
                          {originLocationName && (
                            <p className="text-orange-600 text-xs mt-1 flex items-center gap-1">
                              <Shuffle size={12} className="inline"/> Profesional de: {originLocationName}
                            </p>
                          )}
                          {appt.bookingObservations && <p className="text-xs mt-1 italic">Obs: {appt.bookingObservations}</p>}
                        </TooltipContent>
                      </Tooltip>
                      )
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>
       {appointments.length === 0 && professionals.length > 0 && (
        <p className="text-muted-foreground text-center py-8">No hay citas programadas para este día y selección.</p>
      )}
    </TooltipProvider>
  );
}

export const DailyTimeline = React.memo(DailyTimelineComponent);
