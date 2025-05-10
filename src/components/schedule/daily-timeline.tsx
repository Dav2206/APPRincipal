
"use client";

import type { Appointment, Professional } from '@/types';
import { parseISO, getHours, getMinutes } from 'date-fns';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { User, Clock } from 'lucide-react';

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

export function DailyTimeline({ professionals, appointments, timeSlots, onAppointmentClick }: DailyTimelineProps) {
  
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
              const professionalAppointments = appointments.filter(appt => appt.professionalId === prof.id);
              return (
                <div key={prof.id} className="min-w-[150px] md:min-w-[180px] border-r relative">
                  <div className="sticky top-0 z-10 h-16 flex items-center justify-center font-semibold border-b bg-background p-2 text-sm truncate" title={`${prof.firstName} ${prof.lastName}`}>
                    {prof.firstName} {prof.lastName.split(' ')[0]}
                  </div>
                  <div className="relative" style={{ height: `${totalTimelineHeight}px` }}>
                    {/* Grid lines for time slots (visual aid) */}
                    {timeSlots.map((slot) => (
                       <div key={`${prof.id}-${slot}-line`} className="border-b border-dashed border-muted/50" style={{ height: `${30 * PIXELS_PER_MINUTE}px` }}></div>
                    ))}
                     <div className="border-b border-dashed border-muted/50" style={{ height: `${30 * PIXELS_PER_MINUTE}px` }}></div>


                    {professionalAppointments.map(appt => (
                      <Tooltip key={appt.id} delayDuration={100}>
                        <TooltipTrigger asChild>
                          <div
                            className="absolute left-1 right-1 rounded-md p-1.5 shadow-md text-xs overflow-hidden cursor-pointer hover:opacity-80 transition-opacity"
                            style={{
                              ...getAppointmentStyle(appt),
                              backgroundColor: appt.service?.id ? `hsl(var(--chart-${(appt.service.id.charCodeAt(0) % 5) + 1}))` : 'hsl(var(--accent))',
                              color: 'hsl(var(--accent-foreground))',
                              borderColor: `hsl(var(--chart-${(appt.service?.id.charCodeAt(0) % 5) + 1}))`,
                              borderWidth: '1px',
                            }}
                            onClick={() => onAppointmentClick?.(appt)}
                          >
                            <p className="font-semibold truncate leading-tight">{appt.patient?.firstName} {appt.patient?.lastName}</p>
                            <p className="truncate text-[10px] leading-tight opacity-90">{appt.service?.name}</p>
                            {appt.durationMinutes > 30 && <p className="text-[10px] leading-tight opacity-80 mt-0.5">({appt.durationMinutes} min)</p>}
                          </div>
                        </TooltipTrigger>
                        <TooltipContent className="bg-popover text-popover-foreground p-2 rounded-md shadow-lg">
                          <p className="font-bold text-sm">{appt.patient?.firstName} {appt.patient?.lastName}</p>
                          <p><User size={12} className="inline mr-1"/> {appt.service?.name}</p>
                          <p><Clock size={12} className="inline mr-1"/> {parseISO(appt.appointmentDateTime).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})} ({appt.durationMinutes} min)</p>
                          {appt.bookingObservations && <p className="text-xs mt-1 italic">Obs: {appt.bookingObservations}</p>}
                        </TooltipContent>
                      </Tooltip>
                    ))}
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
