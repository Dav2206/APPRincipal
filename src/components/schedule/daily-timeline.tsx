

"use client";

import type { Appointment, Professional, LocationId, Service, AddedServiceItem, Location } from '@/types';
import React, { useState, useRef } from 'react';
import { parseISO, getHours, getMinutes, addMinutes, format, setMinutes, setHours, startOfDay } from 'date-fns';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { User, Clock, AlertTriangle, Shuffle, Navigation, ShoppingBag, DollarSign, CreditCard, Smartphone, Coins } from 'lucide-react';
import { cn } from '@/lib/utils';
import { APPOINTMENT_STATUS } from '@/lib/constants';
import { Badge } from '@/components/ui/badge';
import { es } from 'date-fns/locale';

interface DailyTimelineProps {
  professionals: Professional[];
  appointments: Appointment[];
  timeSlots: string[];
  currentDate: Date;
  onAppointmentClick?: (appointment: Appointment, serviceId?: string) => void;
  onAppointmentDrop: (appointmentId: string, newProfessionalId: string) => Promise<boolean>;
  viewingLocationId: LocationId;
  locations: Location[];
  isDragDropEnabled: boolean;
}

const stringToColor = (str: string): string => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
    hash = hash & hash;
  }
  const hue = Math.abs(hash % 360);
  return `hsl(${hue}, 70%, 85%)`; 
};

const PIXELS_PER_MINUTE = 1.5;
const DAY_START_HOUR = 9;

interface RenderableServiceBlock {
  id: string;
  originalAppointmentId: string;
  assignedProfessionalId: string | null;
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
  groupColor: string;
  originalAppointmentData: Appointment;
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

const PaymentMethodIcon = ({ method }: { method?: string | null }) => {
    if (!method) return null;
    const methodLower = method.toLowerCase();
    if (methodLower.includes('yape') || methodLower.includes('plin')) {
        return <Smartphone size={10} className="inline-block" title={`Pago con ${method}`} />;
    }
    if (methodLower.includes('tarjeta') || methodLower.includes('visa')) {
        return <CreditCard size={10} className="inline-block" title={`Pago con ${method}`} />;
    }
    if (methodLower.includes('efectivo')) {
        return <Coins size={10} className="inline-block" title="Pago en Efectivo" />;
    }
    return <DollarSign size={10} className="inline-block" title={`Pago: ${method}`}/>;
};


const DailyTimelineComponent = ({ professionals, appointments, timeSlots, onAppointmentClick, onAppointmentDrop, viewingLocationId, currentDate, locations, isDragDropEnabled }: DailyTimelineProps) => {
  const [draggedAppointmentId, setDraggedAppointmentId] = useState<string | null>(null);
  const professionalColumnsRef = useRef<Record<string, HTMLDivElement | null>>({});
  const scrollAreaRef = useRef<HTMLDivElement>(null);

  const allServiceBlocks: RenderableServiceBlock[] = [];

  const relevantAppointments = appointments;

  relevantAppointments
    .sort((a, b) => parseISO(a.appointmentDateTime).getTime() - parseISO(b.appointmentDateTime).getTime())
    .forEach(appt => {
      if (typeof appt.appointmentDateTime !== 'string') {
        return;
      }

      const apptGroupColor = stringToColor(appt.id || '');
      const appointmentDate = parseISO(appt.appointmentDateTime);
      let previousBlockEndTimeForSequence: Date = appointmentDate;

      if (appt.isTravelBlock) {
        allServiceBlocks.push({
          id: appt.id,
          originalAppointmentId: appt.id,
          assignedProfessionalId: appt.professionalId,
          patientName: `Traslado`,
          serviceName: 'Viaje',
          serviceId: 'travel',
          startTime: appointmentDate,
          durationMinutes: appt.durationMinutes,
          isMainService: false,
          isTravelBlock: true,
          bookingObservations: appt.bookingObservations,
          externalProfessionalOriginLocationId: appt.externalProfessionalOriginLocationId,
          groupColor: apptGroupColor,
          originalAppointmentData: appt,
        });
        previousBlockEndTimeForSequence = addMinutes(appointmentDate, appt.durationMinutes);
      } else {
        // Handle main service even if appt.service is null/undefined, as long as there's a duration.
        if (appt.durationMinutes > 0) {
            allServiceBlocks.push({
            id: `${appt.id}-main-${appt.serviceId}`,
            originalAppointmentId: appt.id,
            assignedProfessionalId: appt.professionalId,
            patientName: `${appt.patient?.firstName || ''} ${appt.patient?.lastName || ''}`.trim() || "Cita Reservada",
            serviceName: appt.service?.name || 'Servicio Principal Desconocido',
            serviceId: appt.serviceId,
            startTime: appointmentDate,
            durationMinutes: appt.durationMinutes,
            isMainService: true,
            isTravelBlock: false,
            isExternalProfessional: appt.isExternalProfessional,
            groupColor: apptGroupColor,
            bookingObservations: appt.bookingObservations,
            originalAppointmentData: appt,
            externalProfessionalOriginLocationId: appt.externalProfessionalOriginLocationId,
            });
            previousBlockEndTimeForSequence = addMinutes(appointmentDate, appt.durationMinutes);
        }

        (appt.addedServices || []).forEach((addedSvc, index) => {
            const addedSvcDuration = addedSvc.service?.defaultDuration;
            if (addedSvc.service && typeof addedSvcDuration === 'number' && addedSvcDuration > 0) {
                let addedServiceStartTime: Date;
                if (addedSvc.startTime) {
                    try {
                    const [hours, minutes] = addedSvc.startTime.split(':').map(Number);
                    addedServiceStartTime = setMinutes(setHours(startOfDay(appointmentDate), hours), minutes);
                    } catch (error) {
                    addedServiceStartTime = previousBlockEndTimeForSequence;
                    }
                } else {
                    addedServiceStartTime = previousBlockEndTimeForSequence;
                }
                allServiceBlocks.push({
                    id: `${appt.id}-added-${addedSvc.serviceId}-${index}`,
                    originalAppointmentId: appt.id,
                    assignedProfessionalId: addedSvc.professionalId || appt.professionalId,
                    patientName: `${appt.patient?.firstName || ''} ${appt.patient?.lastName || ''}`.trim() || "Cita Reservada",
                    serviceName: addedSvc.service?.name || 'Servicio Adicional',
                    serviceId: addedSvc.serviceId,
                    startTime: addedServiceStartTime,
                    durationMinutes: addedSvcDuration,
                    isMainService: false,
                    isTravelBlock: false,
                    groupColor: apptGroupColor,
                    originalAppointmentData: appt,
                });
                previousBlockEndTimeForSequence = addMinutes(addedServiceStartTime, addedSvcDuration);
            }
        });
      }
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
        top: `${Math.max(0, top)}px`,
        height: `${Math.max(10, height)}px`,
      };
    } catch (error) {
      console.error("[DailyTimeline] Error in getServiceBlockStyle:", startTime, duration, error);
      return { top: '0px', height: '10px' };
    }
  };

  const totalTimelineHeight = (timeSlots.length * 30 * PIXELS_PER_MINUTE) + PIXELS_PER_MINUTE * 30;

  const handleDragStart = (e: React.DragEvent<HTMLDivElement>, appointmentId: string) => {
    e.dataTransfer.setData("appointmentId", appointmentId);
  };
  
  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault(); // This is necessary to allow dropping
  };
  
  const handleDrop = (e: React.DragEvent<HTMLDivElement>, newProfessionalId: string) => {
    e.preventDefault();
    const appointmentId = e.dataTransfer.getData("appointmentId");
    if (appointmentId && newProfessionalId) {
      onAppointmentDrop(appointmentId, newProfessionalId);
    }
  };

  // --- Touch Event Handlers ---
  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>, appointmentId: string) => {
    if (scrollAreaRef.current) {
      const viewport = scrollAreaRef.current.querySelector<HTMLDivElement>('div[style*="overflow"]');
      if (viewport) viewport.style.overflowX = 'hidden';
    }
    setDraggedAppointmentId(appointmentId);
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (!draggedAppointmentId) return;
    const touch = e.touches[0];
    const targetElement = document.elementFromPoint(touch.clientX, touch.clientY);
    
    // Reset all column styles
    Object.values(professionalColumnsRef.current).forEach(col => {
      if (col) col.style.backgroundColor = '';
    });

    if (targetElement) {
      const professionalColumn = targetElement.closest('[data-professional-id]');
      if (professionalColumn) {
        // Highlight the column we are hovering over
        (professionalColumn as HTMLDivElement).style.backgroundColor = 'hsl(var(--accent) / 0.2)';
      }
    }
  };

  const handleTouchEnd = (e: React.TouchEvent<HTMLDivElement>) => {
    if (!draggedAppointmentId) return;

    if (scrollAreaRef.current) {
      const viewport = scrollAreaRef.current.querySelector<HTMLDivElement>('div[style*="overflow"]');
      if (viewport) viewport.style.overflowX = 'auto';
    }

    Object.values(professionalColumnsRef.current).forEach(col => {
      if (col) col.style.backgroundColor = '';
    });

    const touch = e.changedTouches[0];
    const targetElement = document.elementFromPoint(touch.clientX, touch.clientY);

    if (targetElement) {
      const professionalColumn = targetElement.closest('[data-professional-id]');
      if (professionalColumn) {
        const newProfessionalId = professionalColumn.getAttribute('data-professional-id');
        if (newProfessionalId) {
          onAppointmentDrop(draggedAppointmentId, newProfessionalId);
        }
      }
    }
    setDraggedAppointmentId(null);
  };



  return (
    <TooltipProvider>
      <ScrollArea ref={scrollAreaRef} className="w-full whitespace-nowrap rounded-md border">
        <div className="flex relative">
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

          <div className="flex flex-nowrap">
            {professionalsToDisplay.map(prof => {
              const blocksForThisProfessional = allServiceBlocks.filter(
                block => block.assignedProfessionalId === prof.id
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
                <div 
                  key={prof.id}
                  ref={(el) => professionalColumnsRef.current[prof.id] = el}
                  data-professional-id={prof.id}
                  className="min-w-[120px] md:min-w-[150px] border-r relative transition-colors duration-200"
                  onDragOver={isDragDropEnabled ? handleDragOver : undefined}
                  onDrop={isDragDropEnabled ? (e) => handleDrop(e, prof.id) : undefined}
                >
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
                      const styleProps = getServiceBlockStyle(block.startTime, block.durationMinutes);
                      
                      if (block.isTravelBlock) {
                        return (
                          <Tooltip key={block.id} delayDuration={100}>
                            <TooltipTrigger asChild>
                              <div
                                className={cn(
                                  "absolute left-1 right-1 rounded-md p-1.5 shadow-md text-xs overflow-hidden cursor-default flex flex-col justify-center items-center text-center",
                                  "bg-orange-100 text-orange-700 border-orange-300"
                                )}
                                style={styleProps}
                                onClick={() => onAppointmentClick?.(block.originalAppointmentData)}
                              >
                                <p className="font-bold text-[11px] leading-tight truncate">{prof.firstName}</p>
                                <Navigation size={12} className="my-0.5" />
                                <p className="font-semibold truncate leading-tight text-[10px]">
                                   {block.bookingObservations || 'Traslado'}
                                </p>
                                <p className="text-[9px] leading-tight opacity-80 mt-0.5">({block.durationMinutes} min)</p>
                              </div>
                            </TooltipTrigger>
                            <TooltipContent className="bg-popover text-popover-foreground p-2 rounded-md shadow-lg max-w-xs">
                                <p className="font-bold text-sm">{prof.firstName} {prof.lastName}</p>
                                {block.bookingObservations && (
                                <p className="text-sm mt-1 italic">{block.bookingObservations}</p>
                                )}
                                <p><Clock size={12} className="inline mr-1" /> {format(block.startTime, "HH:mm", { locale: es })} ({block.durationMinutes} min)</p>
                            </TooltipContent>
                          </Tooltip>
                        );
                      }
                     
                      let blockBgClass = 'bg-slate-100 hover:bg-slate-200';
                      let blockTextClass = 'text-slate-800';
                      let blockBorderColorClass = 'border-slate-300';
                      
                      const wasSpecificallyRequested = block.originalAppointmentData.preferredProfessionalId && block.originalAppointmentData.preferredProfessionalId === block.assignedProfessionalId;

                      const status = block.originalAppointmentData.status;
                      if (status === APPOINTMENT_STATUS.COMPLETED) {
                        blockBgClass = 'bg-teal-100 hover:bg-teal-200';
                        blockTextClass = 'text-teal-900';
                        blockBorderColorClass = 'border-teal-300';
                      } else if (status === APPOINTMENT_STATUS.BOOKED) {
                        blockBgClass = 'bg-blue-100 hover:bg-blue-200';
                        blockTextClass = 'text-blue-900';
                        blockBorderColorClass = 'border-blue-300';
                      } else if (status === APPOINTMENT_STATUS.CONFIRMED) {
                        blockBgClass = 'bg-purple-100 hover:bg-purple-200';
                        blockTextClass = 'text-purple-900';
                        blockBorderColorClass = 'border-purple-300';
                      }
                     
                      return (
                        <Tooltip key={block.id} delayDuration={100}>
                          <TooltipTrigger asChild>
                            <div
                              draggable={isDragDropEnabled}
                              onDragStart={isDragDropEnabled ? (e) => handleDragStart(e, block.originalAppointmentId) : undefined}
                              onTouchStart={isDragDropEnabled ? (e) => handleTouchStart(e, block.originalAppointmentId) : undefined}
                              onTouchMove={isDragDropEnabled ? handleTouchMove : undefined}
                              onTouchEnd={isDragDropEnabled ? handleTouchEnd : undefined}
                              className={cn(
                                "absolute left-1 right-1 rounded-md p-1.5 shadow-md text-xs overflow-hidden transition-all flex flex-col justify-start border",
                                isDragDropEnabled ? 'cursor-grab' : 'cursor-pointer',
                                blockBgClass,
                                blockTextClass,
                                isBlockOverlapping ? "ring-2 ring-destructive border-destructive" : blockBorderColorClass
                              )}
                              style={{
                                ...styleProps,
                                opacity: block.isMainService ? 1 : 0.85,
                                borderLeft: `4px solid ${block.groupColor}`, 
                                borderStyle: !block.originalAppointmentData.preferredProfessionalId ? 'dashed' : 'solid',
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
                                {block.isMainService && 
                                  <div className='flex items-center gap-1 flex-wrap'>
                                      <p className="truncate text-[10px] leading-tight opacity-90">{block.serviceName}</p>
                                      {(block.originalAppointmentData.status === APPOINTMENT_STATUS.COMPLETED && (block.originalAppointmentData.amountPaid || 0) > 0) ? (
                                        <div className='flex items-center gap-0.5 text-teal-800'>
                                          <PaymentMethodIcon method={block.originalAppointmentData.paymentMethod} />
                                          <p className='text-[10px] font-semibold'>{block.originalAppointmentData.amountPaid!.toFixed(2)}</p>
                                        </div>
                                      ) : null}
                                  </div>
                                }
                                
                                {block.durationMinutes > (block.isMainService && block.originalAppointmentData.addedServices && block.originalAppointmentData.addedServices.length > 0 ? 15 : 30) && (
                                  <p className="text-[10px] leading-tight opacity-80 mt-0.5">
                                    ({`${block.durationMinutes} min`})
                                  </p>
                                )}
                                {block.isMainService && block.originalAppointmentData.addedServices && block.originalAppointmentData.addedServices.length > 0 && block.durationMinutes <= 45 && (
                                  <p className="text-[9px] opacity-70 mt-0.5 flex items-center gap-0.5"><ShoppingBag size={10}/> +Serv.</p>
                                )}
                              </div>
                              {block.isExternalProfessional && block.isMainService && (
                                <Badge variant="outline" className="mt-1 text-[9px] p-0.5 h-fit bg-orange-100 text-orange-700 border-orange-300 self-start truncate">
                                  <Shuffle size={10} className="mr-1" /> De: {locations.find(l => l.id === block.externalProfessionalOriginLocationId)?.name}
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
                                <Shuffle size={12} className="inline" /> Profesional de Sede Origen: {locations.find(l => l.id === block.externalProfessionalOriginLocationId)?.name}
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
