
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
const DAY_START_HOUR = 9;

interface RenderableServiceBlock {
  id: string; // Combination of appt.id and serviceId/index for uniqueness
  originalAppointmentId: string;
  assignedProfessionalId: string | null; // ID del profesional que realiza ESTE servicio
  patientName: string;
  serviceName: string;
  serviceId: string;
  startTime: Date;
  durationMinutes: number;
  isMainService: boolean;
  isTravelBlock: boolean;
  isExternalProfessional?: boolean;
  externalProfessionalOriginLocationId?: LocationId | null;
  bookingObservations?: string | null;
  originalAppointmentData: Appointment; // Keep original appointment for context
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

  const relevantAppointments = appointments.filter(
    appt => appt.locationId === viewingLocationId || (appt.isTravelBlock && appt.professional?.locationId !== viewingLocationId && appt.locationId === viewingLocationId)
  );

  // 1. Crear una lista plana de TODOS los bloques de servicio (principales y adicionales)
  const allServiceBlocks: RenderableServiceBlock[] = [];
  relevantAppointments
    .sort((a, b) => parseISO(a.appointmentDateTime).getTime() - parseISO(b.appointmentDateTime).getTime())
    .forEach(appt => {
      let currentTimeForBlockCalculation = parseISO(appt.appointmentDateTime);

      if (appt.isTravelBlock) {
        allServiceBlocks.push({
          id: appt.id,
          originalAppointmentId: appt.id,
          assignedProfessionalId: appt.professionalId, // El viaje es del profesional
          patientName: `Traslado a ${LOCATIONS.find(l => l.id === appt.locationId)?.name || 'esta sede'}`,
          serviceName: 'Viaje',
          serviceId: 'travel',
          startTime: currentTimeForBlockCalculation,
          durationMinutes: appt.durationMinutes,
          isMainService: false,
          isTravelBlock: true,
          isExternalProfessional: appt.isExternalProfessional,
          externalProfessionalOriginLocationId: appt.externalProfessionalOriginLocationId,
          originalAppointmentData: appt,
        });
        return; // No hay más servicios si es un bloque de viaje
      }

      // Servicio Principal
      if (appt.service) {
        allServiceBlocks.push({
          id: `${appt.id}-main-${appt.serviceId}`,
          originalAppointmentId: appt.id,
          assignedProfessionalId: appt.professionalId, // El servicio principal lo hace el profesional de la cita
          patientName: `${appt.patient?.firstName || ''} ${appt.patient?.lastName || ''}`.trim() || "Cita Reservada",
          serviceName: appt.service?.name || 'Servicio Principal',
          serviceId: appt.serviceId,
          startTime: currentTimeForBlockCalculation,
          durationMinutes: appt.durationMinutes, // Duración del servicio principal
          isMainService: true,
          isTravelBlock: false,
          isExternalProfessional: appt.isExternalProfessional,
          externalProfessionalOriginLocationId: appt.externalProfessionalOriginLocationId,
          bookingObservations: appt.bookingObservations,
          originalAppointmentData: appt,
        });
        currentTimeForBlockCalculation = addMinutes(currentTimeForBlockCalculation, appt.durationMinutes);
      }

      // Servicios Adicionales
      (appt.addedServices || []).forEach((addedSvc, index) => {
        if (addedSvc.service && typeof addedSvc.service.defaultDuration === 'number' && addedSvc.service.defaultDuration > 0) {
          allServiceBlocks.push({
            id: `${appt.id}-added-${addedSvc.serviceId}-${index}`,
            originalAppointmentId: appt.id,
            assignedProfessionalId: addedSvc.professionalId || appt.professionalId, // Profesional del servicio adicional o el principal
            patientName: `${appt.patient?.firstName || ''} ${appt.patient?.lastName || ''}`.trim() || "Cita Reservada",
            serviceName: addedSvc.service.name,
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


  if (professionals.length === 0 && relevantAppointments.filter(a => !a.isTravelBlock && [APPOINTMENT_STATUS.BOOKED, APPOINTMENT_STATUS.CONFIRMED, APPOINTMENT_STATUS.COMPLETED].includes(a.status)).length === 0) {
    return <p className="text-muted-foreground text-center py-8">No hay profesionales trabajando ni citas para mostrar en esta sede para la fecha seleccionada.</p>;
  }
  if (professionals.length === 0 && relevantAppointments.filter(a => !a.isTravelBlock && [APPOINTMENT_STATUS.BOOKED, APPOINTMENT_STATUS.CONFIRMED, APPOINTMENT_STATUS.COMPLETED].includes(a.status)).length > 0) {
    return <p className="text-muted-foreground text-center py-8">No hay profesionales asignados para mostrar en columnas, pero pueden existir citas sin asignar o de profesionales externos para esta fecha y sede.</p>;
  }

  const getServiceBlockStyle = (startTime: Date, duration: number) => {
    try {
      const apptHours = getHours(startTime);
      const apptMinutes = getMinutes(startTime);
      const minutesFromTimelineStart = (apptHours - DAY_START_HOUR) * 60 + apptMinutes;
      const top = minutesFromTimelineStart * PIXELS_PER_MINUTE;
      const height = duration * PIXELS_PER_MINUTE;
      return {
        top: `${top}px`,
        height: `${height}px`,
      };
    } catch (error) {
      console.error("[DailyTimeline] Error in getServiceBlockStyle:", startTime, duration, error);
      return { top: '0px', height: '0px' };
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
            {professionals.map(prof => {
              const blocksForThisProfessional = allServiceBlocks.filter(
                block => block.assignedProfessionalId === prof.id && block.originalAppointmentData.locationId === viewingLocationId
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
                      const durationToDisplay = block.isMainService ? (block.originalAppointmentData.totalCalculatedDurationMinutes || block.durationMinutes) : block.durationMinutes;


                      if (block.isTravelBlock) {
                        // Asegurarse que el bloque de viaje solo se muestre si el profesional es el del viaje
                        // y la cita original (de donde se deriva el viaje) era para la sede que se está viendo.
                        // Esto previene mostrar viajes de un profesional que viene de otra sede si la cita principal no es en esta sede.
                        if (block.assignedProfessionalId !== prof.id || block.originalAppointmentData.locationId !== viewingLocationId) {
                           // return null; // No debería llegar aquí con el filtro anterior, pero por si acaso.
                        }

                        return (
                          <Tooltip key={block.id} delayDuration={100}>
                            <TooltipTrigger asChild>
                              <div
                                className={cn(
                                  "absolute left-1 right-1 rounded-md p-1.5 shadow-md text-xs overflow-hidden cursor-default flex flex-col justify-center items-center text-center",
                                  "bg-amber-100 text-amber-700 border-amber-300"
                                )}
                                style={style}
                              >
                                <Navigation size={14} className="mb-0.5" />
                                <p className="font-semibold truncate leading-tight text-[10px]">
                                  Traslado
                                  {block.originalAppointmentData.professional?.locationId !== viewingLocationId ? 
                                   ` desde ${LOCATIONS.find(l => l.id === block.originalAppointmentData.professional?.locationId)?.name || 'Origen'}`
                                   : ''}
                                </p>
                                <p className="text-[9px] leading-tight opacity-80 mt-0.5">({block.durationMinutes} min)</p>
                              </div>
                            </TooltipTrigger>
                            <TooltipContent className="bg-popover text-popover-foreground p-2 rounded-md shadow-lg max-w-xs">
                                <p className="font-bold text-sm">
                                  Viaje de {prof.firstName} {prof.lastName}
                                  {block.originalAppointmentData.professional?.locationId !== viewingLocationId ? 
                                    ` desde ${LOCATIONS.find(l => l.id === block.originalAppointmentData.professional?.locationId)?.name || 'Origen Desc.'}`
                                    : ''}
                                  a {LOCATIONS.find(l => l.id === viewingLocationId)?.name}
                                </p>
                              <p><Clock size={12} className="inline mr-1" /> {format(block.startTime, "HH:mm", { locale: es })} ({block.durationMinutes} min)</p>
                            </TooltipContent>
                          </Tooltip>
                        );
                      }


                      const mainServiceBackgroundColor = `hsl(var(--chart-${(block.serviceId.charCodeAt(0) % 5) + 1}))`;
                      const addedServiceBackgroundColor = `hsla(var(--chart-${(block.serviceId.charCodeAt(0) % 5) + 1}), 0.7)`; // Más opaco

                      return (
                        <Tooltip key={block.id} delayDuration={100}>
                          <TooltipTrigger asChild>
                            <div
                              className={cn(
                                "absolute left-1 right-1 rounded-md p-1.5 shadow-md text-xs overflow-hidden cursor-pointer hover:opacity-80 transition-opacity flex flex-col justify-start",
                                isBlockOverlapping && "ring-2 ring-destructive border-destructive",
                                !block.isMainService && "border-dashed" // No más opacidad, solo borde discontinuo
                              )}
                              style={{
                                ...style,
                                backgroundColor: block.isMainService ? mainServiceBackgroundColor : addedServiceBackgroundColor,
                                color: 'hsl(var(--accent-foreground))',
                                borderColor: isBlockOverlapping ? 'hsl(var(--destructive))' : (block.isMainService ? mainServiceBackgroundColor : `hsla(var(--chart-${(block.serviceId.charCodeAt(0) % 5) + 1}), 0.9)`),
                                borderWidth: isBlockOverlapping ? '2px' : '1px',
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

                                {block.durationMinutes > (block.isMainService ? (block.originalAppointmentData.addedServices && block.originalAppointmentData.addedServices.length > 0 ? 15 : 30) : 15) && (
                                  <p className="text-[10px] leading-tight opacity-80 mt-0.5">
                                    ({block.isMainService ? `Total: ${durationToDisplay} min` : `${block.durationMinutes} min`})
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
                             {block.assignedProfessionalId !== block.originalAppointmentData.professionalId && block.originalAppointmentData.professional && (
                                <p className="text-xs mt-0.5">Asignado a: {professionals.find(p=>p.id === block.assignedProfessionalId)?.firstName} (Serv. Principal con: {block.originalAppointmentData.professional.firstName})</p>
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
        {relevantAppointments.length === 0 && professionals.length > 0 && (
          <p className="text-muted-foreground text-center py-8">No hay citas programadas para este día y selección.</p>
        )}
      </ScrollArea>
    </TooltipProvider>
  );
};

export const DailyTimeline = React.memo(DailyTimelineComponent);

