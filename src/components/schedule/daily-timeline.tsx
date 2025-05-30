
"use client";

import type { Appointment, Professional, LocationId, Service, AddedServiceItem } from '@/types';
import React from 'react';
import { parseISO, getHours, getMinutes, addMinutes, format } from 'date-fns';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { User, Clock, AlertTriangle, Shuffle, Navigation, ShoppingBag } from 'lucide-react';
import { cn } from '@/lib/utils';
import { LOCATIONS, APPOINTMENT_STATUS } from '@/lib/constants';
import { Badge } from '@/components/ui/badge';
import { es } from 'date-fns/locale';

interface DailyTimelineProps {
  professionals: Professional[];
  appointments: Appointment[];
  timeSlots: string[];
  currentDate: Date;
  onAppointmentClick?: (appointment: Appointment, serviceId?: string) => void;
  viewingLocationId: LocationId;
}

const PIXELS_PER_MINUTE = 1.5;
const DAY_START_HOUR = 9; // Assuming timeline starts at 9 AM

interface RenderableServiceBlock {
  id: string; // Combination of appt.id and serviceId/index for uniqueness
  originalAppointmentId: string;
  assignedProfessionalId: string | null; // Professional who PERFORMS this specific service block
  patientName: string;
  serviceName: string;
  serviceId: string;
  startTime: Date;
  durationMinutes: number; // Duration of THIS specific service block
  isMainService: boolean;
  isTravelBlock: boolean;
  isExternalProfessional?: boolean; // Was the main appointment's professional external?
  externalProfessionalOriginLocationId?: LocationId | null; // Origin of main appointment's professional
  bookingObservations?: string | null;
  originalAppointmentData: Appointment; // Reference to the full original appointment
}

const isOverlapping = (blockA: RenderableServiceBlock, blockB: RenderableServiceBlock): boolean => {
  if (blockA.isTravelBlock || blockB.isTravelBlock) return false;
  try {
    const startA = blockA.startTime;
    const endA = addMinutes(startA, blockA.durationMinutes);
    const startB = blockB.startTime;
    const endB = addMinutes(startB, blockB.durationMinutes);
    return startA < endB && endA > startB;
  } catch (error) {
    console.error("[DailyTimeline] Error in isOverlapping with service blocks:", blockA, blockB, error);
    return false;
  }
};


const DailyTimelineComponent = ({ professionals, appointments, timeSlots, onAppointmentClick, viewingLocationId, currentDate }: DailyTimelineProps) => {
  const allServiceBlocks: RenderableServiceBlock[] = [];

  const relevantAppointments = appointments.filter(
    appt => appt.locationId === viewingLocationId || 
            (appt.isTravelBlock && appt.professional?.locationId !== viewingLocationId && appt.locationId === viewingLocationId) ||
            (appt.isTravelBlock && appt.professional?.locationId === viewingLocationId && appt.externalProfessionalOriginLocationId !== viewingLocationId)
  );

  relevantAppointments
    .sort((a, b) => parseISO(a.appointmentDateTime).getTime() - parseISO(b.appointmentDateTime).getTime())
    .forEach(appt => {
      let currentTimeForBlockCalculation = parseISO(appt.appointmentDateTime);

      if (appt.isTravelBlock) {
        allServiceBlocks.push({
          id: appt.id, // Travel blocks have unique IDs
          originalAppointmentId: appt.id,
          assignedProfessionalId: appt.professionalId,
          patientName: `Traslado ${appt.professional?.locationId === viewingLocationId ? 'desde esta sede' : `a ${LOCATIONS.find(l => l.id === appt.locationId)?.name || 'esta sede'}`}`,
          serviceName: 'Viaje',
          serviceId: 'travel',
          startTime: currentTimeForBlockCalculation,
          durationMinutes: appt.durationMinutes,
          isMainService: false, // Treat as not main for styling
          isTravelBlock: true,
          isExternalProfessional: appt.isExternalProfessional,
          externalProfessionalOriginLocationId: appt.externalProfessionalOriginLocationId,
          originalAppointmentData: appt,
        });
        return; // Skip further processing for travel blocks
      }

      // Main Service
      if (appt.service) {
        allServiceBlocks.push({
          id: `${appt.id}-main-${appt.serviceId}`,
          originalAppointmentId: appt.id,
          assignedProfessionalId: appt.professionalId,
          patientName: `${appt.patient?.firstName || ''} ${appt.patient?.lastName || ''}`.trim() || "Cita Reservada",
          serviceName: appt.service?.name || 'Servicio Principal',
          serviceId: appt.serviceId,
          startTime: currentTimeForBlockCalculation,
          durationMinutes: appt.durationMinutes, // Duration of the main service
          isMainService: true,
          isTravelBlock: false,
          isExternalProfessional: appt.isExternalProfessional,
          externalProfessionalOriginLocationId: appt.externalProfessionalOriginLocationId,
          bookingObservations: appt.bookingObservations,
          originalAppointmentData: appt,
        });
        currentTimeForBlockCalculation = addMinutes(currentTimeForBlockCalculation, appt.durationMinutes);
      }

      // Added Services
      (appt.addedServices || []).forEach((addedSvc, index) => {
        if (addedSvc.service && typeof addedSvc.service.defaultDuration === 'number' && addedSvc.service.defaultDuration > 0) {
          allServiceBlocks.push({
            id: `${appt.id}-added-${addedSvc.serviceId}-${index}`,
            originalAppointmentId: appt.id,
            assignedProfessionalId: addedSvc.professionalId || appt.professionalId, // Assign to added service's prof or main appt prof
            patientName: `${appt.patient?.firstName || ''} ${appt.patient?.lastName || ''}`.trim() || "Cita Reservada",
            serviceName: addedSvc.service.name || 'Servicio Adicional',
            serviceId: addedSvc.serviceId,
            startTime: currentTimeForBlockCalculation,
            durationMinutes: addedSvc.service.defaultDuration,
            isMainService: false,
            isTravelBlock: false,
            originalAppointmentData: appt,
          });
          currentTimeForBlockCalculation = addMinutes(currentTimeForBlockCalculation, addedSvc.service.defaultDuration);
        }
      });
    });

  const professionalsToDisplay = professionals.filter(prof => !prof.isManager);

  if (professionalsToDisplay.length === 0 && relevantAppointments.filter(a => !a.isTravelBlock && [APPOINTMENT_STATUS.BOOKED, APPOINTMENT_STATUS.CONFIRMED, APPOINTMENT_STATUS.COMPLETED].includes(a.status)).length === 0) {
    return <p className="text-muted-foreground text-center py-8">No hay profesionales activos (no gerentes) trabajando ni citas para mostrar en esta sede para la fecha seleccionada.</p>;
  }
  if (professionalsToDisplay.length === 0 && relevantAppointments.filter(a => !a.isTravelBlock && [APPOINTMENT_STATUS.BOOKED, APPOINTMENT_STATUS.CONFIRMED, APPOINTMENT_STATUS.COMPLETED].includes(a.status)).length > 0) {
     return <p className="text-muted-foreground text-center py-8">No hay profesionales asignados para mostrar en columnas (o son gerentes), pero pueden existir citas sin asignar o de profesionales externos para esta fecha y sede.</p>;
  }

  const getServiceBlockStyle = (startTime: Date, duration: number) => {
    try {
      const apptHours = getHours(startTime);
      const apptMinutes = getMinutes(startTime);
      const minutesFromTimelineStart = (apptHours - DAY_START_HOUR) * 60 + apptMinutes;
      const top = minutesFromTimelineStart * PIXELS_PER_MINUTE;
      const height = duration * PIXELS_PER_MINUTE;
      return {
        top: `${Math.max(0, top)}px`, // Ensure top is not negative
        height: `${Math.max(10, height)}px`, // Ensure minimum height for visibility
      };
    } catch (error) {
      console.error("[DailyTimeline] Error in getServiceBlockStyle:", startTime, duration, error);
      return { top: '0px', height: '10px' }; // Fallback style
    }
  };

  const totalTimelineHeight = (timeSlots.length * 30 * PIXELS_PER_MINUTE) + PIXELS_PER_MINUTE * 30;

  return (
    <TooltipProvider>
      <ScrollArea className="w-full whitespace-nowrap rounded-md border">
        <div className="flex relative">
          {/* Time Column */}
          <div className="sticky left-0 z-20 bg-background border-r">
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
            {professionalsToDisplay.map(prof => {
              const blocksForThisProfessional = allServiceBlocks.filter(
                block => block.assignedProfessionalId === prof.id &&
                         (block.isTravelBlock ? true : block.originalAppointmentData.locationId === viewingLocationId)
              );

              const overlappingServiceBlockIds = new Set<string>();
              for (let i = 0; i < blocksForThisProfessional.length; i++) {
                for (let j = i + 1; j < blocksForThisProfessional.length; j++) {
                  if (isOverlapping(blocksForThisProfessional[i], blocksForThisProfessional[j])) {
                    overlappingServiceBlockIds.add(blocksForThisProfessional[i].id);
                    overlappingServiceBlockIds.add(blocksForThisProfessional[j].id);
                  }
                }
              }

              return (
                <div key={prof.id} className="min-w-[150px] md:min-w-[180px] border-r relative">
                  <div className="sticky top-0 z-10 h-16 flex items-center justify-center font-semibold border-b bg-background p-2 text-sm truncate" title={`${prof.firstName} ${prof.lastName}`}>
                    {prof.firstName} {prof.lastName.split(' ')[0]}
                    {overlappingServiceBlockIds.size > 0 && (
                      <Tooltip delayDuration={100}>
                        <TooltipTrigger asChild>
                          <AlertTriangle className="h-4 w-4 text-destructive ml-1 shrink-0" />
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Este profesional tiene servicios superpuestos.</p>
                        </TooltipContent>
                      </Tooltip>
                    )}
                  </div>
                  <div className="relative" style={{ height: `${totalTimelineHeight}px` }}>
                    {timeSlots.map((slot) => (
                      <div key={`${prof.id}-${slot}-line`} className="border-b border-dashed border-muted/50" style={{ height: `${30 * PIXELS_PER_MINUTE}px` }}></div>
                    ))}
                    <div className="border-b border-dashed border-muted/50" style={{ height: `${30 * PIXELS_PER_MINUTE}px` }}></div>

                    {blocksForThisProfessional.map(block => {
                      const isBlockOverlapping = overlappingServiceBlockIds.has(block.id) && !block.isTravelBlock;
                      const style = getServiceBlockStyle(block.startTime, block.durationMinutes);
                      
                      if (block.isTravelBlock) {
                        return (
                          <Tooltip key={block.id} delayDuration={100}>
                            <TooltipTrigger asChild>
                              <div
                                className={cn(
                                  "absolute left-1 right-1 rounded-md p-1.5 shadow-md text-xs overflow-hidden cursor-default flex flex-col justify-center items-center text-center",
                                  "bg-orange-100 text-orange-700 border-orange-300"
                                )}
                                style={style}
                                onClick={() => onAppointmentClick?.(block.originalAppointmentData)}
                              >
                                <Navigation size={14} className="mb-0.5" />
                                <p className="font-semibold truncate leading-tight text-[10px]">
                                   {block.patientName}
                                </p>
                                <p className="text-[9px] leading-tight opacity-80 mt-0.5">({block.durationMinutes} min)</p>
                              </div>
                            </TooltipTrigger>
                            <TooltipContent className="bg-popover text-popover-foreground p-2 rounded-md shadow-lg max-w-xs">
                                <p className="font-bold text-sm">
                                  {block.patientName} ({prof.firstName} {prof.lastName})
                                </p>
                              <p><Clock size={12} className="inline mr-1" /> {format(block.startTime, "HH:mm", { locale: es })} ({block.durationMinutes} min)</p>
                            </TooltipContent>
                          </Tooltip>
                        );
                      }

                      const serviceColorVar = `chart-${(block.serviceId.charCodeAt(0) % 5) + 1}`;
                      const blockBackgroundColor = `hsl(var(--${serviceColorVar}))`;
                     
                      return (
                        <Tooltip key={block.id} delayDuration={100}>
                          <TooltipTrigger asChild>
                            <div
                              className={cn(
                                "absolute left-1 right-1 rounded-md p-1.5 shadow-md text-xs overflow-hidden cursor-pointer hover:brightness-90 transition-all flex flex-col justify-start",
                                isBlockOverlapping && "ring-2 ring-destructive border-destructive"
                              )}
                              style={{
                                ...style,
                                backgroundColor: blockBackgroundColor,
                                color: 'hsl(var(--accent-foreground))', // Assuming light text on colored background
                                opacity: block.isMainService ? 1 : 0.75,
                                borderColor: isBlockOverlapping ? 'hsl(var(--destructive))' : blockBackgroundColor,
                                borderWidth: isBlockOverlapping ? '2px' : '1px',
                                borderStyle: !block.isMainService ? 'dashed' : 'solid',
                              }}
                              onClick={() => onAppointmentClick?.(block.originalAppointmentData, block.serviceId)}
                            >
                              <div className="flex-grow overflow-hidden">
                                <div className="flex justify-between items-start">
                                  <p className={cn("font-semibold truncate leading-tight", !block.isMainService && "font-normal")}>
                                    {block.isMainService ? block.patientName : block.serviceName}
                                  </p>
                                  {isBlockOverlapping && (
                                    <AlertTriangle className="h-3 w-3 text-destructive-foreground bg-destructive rounded-full p-px shrink-0 ml-1" />
                                  )}
                                </div>
                                {block.isMainService && <p className="truncate text-[10px] leading-tight opacity-90">{block.serviceName}</p>}
                                
                                {block.durationMinutes > (block.isMainService && block.originalAppointmentData.addedServices && block.originalAppointmentData.addedServices.length > 0 ? 15 : 30) && (
                                  <p className="text-[10px] leading-tight opacity-80 mt-0.5">
                                    ({`${block.durationMinutes} min`}) {/* Muestra duración del bloque actual */}
                                  </p>
                                )}
                                {block.isMainService && block.originalAppointmentData.addedServices && block.originalAppointmentData.addedServices.length > 0 && block.durationMinutes <= 45 && (
                                  <p className="text-[9px] opacity-70 mt-0.5 flex items-center gap-0.5"><ShoppingBag size={10}/> +Serv.</p>
                                )}
                              </div>
                              {block.isExternalProfessional && block.isMainService && (
                                <Badge variant="outline" className="mt-1 text-[9px] p-0.5 h-fit bg-orange-100 text-orange-700 border-orange-300 self-start truncate">
                                  <Shuffle size={10} className="mr-1" /> De: {LOCATIONS.find(l => l.id === block.externalProfessionalOriginLocationId)?.name}
                                </Badge>
                              )}
                            </div>
                          </TooltipTrigger>
                          <TooltipContent className="bg-popover text-popover-foreground p-2 rounded-md shadow-lg max-w-xs">
                            {isBlockOverlapping && <p className="text-destructive font-semibold text-xs flex items-center gap-1 mb-1"><AlertTriangle size={12} /> ¡Servicio Superpuesto!</p>}
                            <p className="font-bold text-sm">{block.patientName}</p>
                            <p><User size={12} className="inline mr-1" /> {block.serviceName} {block.isMainService ? "(Principal)" : "(Adicional)"}</p>
                            <p><Clock size={12} className="inline mr-1" /> {format(block.startTime, "HH:mm", { locale: es })} ({block.durationMinutes} min)</p>
                            {block.isMainService && block.originalAppointmentData.totalCalculatedDurationMinutes && block.originalAppointmentData.totalCalculatedDurationMinutes !== block.durationMinutes && (
                                <p className="text-xs mt-0.5">Duración Total Cita: {block.originalAppointmentData.totalCalculatedDurationMinutes} min</p>
                            )}
                             {block.assignedProfessionalId !== block.originalAppointmentData.professionalId && block.originalAppointmentData.professional && !block.isMainService && (
                                <p className="text-xs mt-0.5">Realizado por: {professionals.find(p=>p.id === block.assignedProfessionalId)?.firstName || 'prof.'} (Cita principal con: {block.originalAppointmentData.professional.firstName})</p>
                            )}
                            {block.isExternalProfessional && block.isMainService && (
                              <p className="text-orange-600 text-xs mt-1 flex items-center gap-1">
                                <Shuffle size={12} className="inline" /> Profesional de: {LOCATIONS.find(l => l.id === block.externalProfessionalOriginLocationId)?.name}
                              </p>
                            )}
                            {block.isMainService && block.bookingObservations && <p className="text-xs mt-1 italic">Obs. Reserva: {block.bookingObservations}</p>}
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
        {relevantAppointments.length === 0 && professionalsToDisplay.length > 0 && (
          <p className="text-muted-foreground text-center py-8">No hay citas programadas para este día y selección.</p>
        )}
      </ScrollArea>
    </TooltipProvider>
  );
};

export const DailyTimeline = React.memo(DailyTimelineComponent);
