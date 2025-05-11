
"use client";

import type { Patient, Appointment, AppointmentStatus } from '@/types';
import { getPatientAppointmentHistory, getProfessionalById } from '@/lib/data';
import { useEffect, useState, useRef } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { format, parseISO, differenceInDays, formatDistanceToNow, differenceInYears, addDays as dateAddDays, startOfDay } from 'date-fns';
import { es } from 'date-fns/locale';
import { UserSquare, CalendarDays, Stethoscope, TrendingUp, MessageSquare, AlertTriangle, Repeat, Cake, Paperclip, Camera, XIcon, ZoomIn, ZoomOut, RefreshCw, HeartPulse } from 'lucide-react';
import { APPOINTMENT_STATUS, APPOINTMENT_STATUS_DISPLAY } from '@/lib/constants';
import Image from 'next/image';
import { Separator } from '../ui/separator';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogClose } from '@/components/ui/dialog';
import { Button } from '../ui/button';
import { cn } from '@/lib/utils';

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
  const [selectedImageForModal, setSelectedImageForModal] = useState<string | null>(null);
  const [isImageModalOpen, setIsImageModalOpen] = useState(false);

  const [zoomLevel, setZoomLevel] = useState(1);
  const [imagePosition, setImagePosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const imageRef = useRef<HTMLImageElement>(null);


  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      const rawAppointmentHistory = await getPatientAppointmentHistory(patient.id);
      
      const today = startOfDay(new Date());
      const pastAppointments = rawAppointmentHistory.filter(appt => parseISO(appt.appointmentDateTime) < today);
      
      setHistory(pastAppointments);

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
      
      const completedVisits = pastAppointments.filter(appt => appt.status === APPOINTMENT_STATUS.COMPLETED)
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
        if (avgDays > 0) { 
            const recommendedNextDate = dateAddDays(lastCompletedVisitDate, avgDays);
            setNextRecommendedVisit(format(recommendedNextDate, "PPP", { locale: es }));
        } else {
            setNextRecommendedVisit(null);
        }
      } else if (completedVisits.length === 1) {
        const lastCompletedVisitDate = parseISO(completedVisits[0].appointmentDateTime);
        // Default to 30 days if only one visit, can be adjusted
        const recommendedNextDate = dateAddDays(lastCompletedVisitDate, 30); 
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

  const handleImageClick = (imageUrl: string) => {
    setSelectedImageForModal(imageUrl);
    setZoomLevel(1);
    setImagePosition({ x: 0, y: 0 });
    setIsImageModalOpen(true);
  };

  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    e.preventDefault();
    const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9; // Zoom in or out
    setZoomLevel(prevZoom => Math.max(0.5, Math.min(prevZoom * zoomFactor, 5))); // Clamp zoom level
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (zoomLevel <= 1) return; // Panning only makes sense when zoomed in
    setIsDragging(true);
    setDragStart({ x: e.clientX - imagePosition.x, y: e.clientY - imagePosition.y });
    e.currentTarget.style.cursor = 'grabbing';
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isDragging || zoomLevel <= 1) return;
    setImagePosition({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y,
    });
  };

  const handleMouseUp = (e: React.MouseEvent<HTMLDivElement>) => {
    setIsDragging(false);
     e.currentTarget.style.cursor = zoomLevel > 1 ? 'grab' : 'default';
  };
  
  const resetZoomAndPosition = () => {
    setZoomLevel(1);
    setImagePosition({ x: 0, y: 0 });
  }


  if (loading) {
    return <p className="text-muted-foreground">Cargando historial del paciente...</p>;
  }

  const totalVisits = history.filter(h => h.status === APPOINTMENT_STATUS.COMPLETED).length;
  const lastVisit = history.length > 0 ? history.sort((a,b) => parseISO(b.appointmentDateTime).getTime() - parseISO(a.appointmentDateTime).getTime())[0] : null;
  const lastVisitDate = lastVisit ? parseISO(lastVisit.appointmentDateTime) : null;


  const appointmentsWithPhotos = history.filter(appt => appt.attachedPhotos && appt.attachedPhotos.length > 0)
    .sort((a,b) => parseISO(b.appointmentDateTime).getTime() - parseISO(a.appointmentDateTime).getTime()); // Sort by most recent first
  const lastFourAppointmentsWithPhotos = appointmentsWithPhotos.slice(0, 4);

  return (
    <>
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
              <p>{averageDaysBetweenVisits !== null && averageDaysBetweenVisits > 0 ? `Cada ${averageDaysBetweenVisits} días` : (totalVisits < 2 ? 'Pocas visitas para calcular' : 'N/A')}</p>
            </div>
            {age !== null && (
              <div>
                <p className="font-medium flex items-center gap-1"><Cake size={16} /> Edad:</p>
                <p>{age} años</p>
              </div>
            )}
            <div>
                <p className="font-medium flex items-center gap-1"><HeartPulse size={16} /> Diabético:</p>
                <p className={patient.isDiabetic ? "text-red-600 font-semibold" : ""}>{patient.isDiabetic ? 'Sí' : 'No'}</p>
            </div>
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

          {lastFourAppointmentsWithPhotos.length > 0 && (
            <div className="mt-4">
              <Separator className="my-3" />
              <h4 className="font-semibold mb-2 text-md flex items-center gap-2"><Camera /> Fotos de Últimas Visitas</h4>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                {lastFourAppointmentsWithPhotos.map(appt =>
                  appt.attachedPhotos?.map((photoUri, index) => (
                    photoUri && typeof photoUri === 'string' && photoUri.startsWith("data:image/") && (
                    <div 
                        key={`${appt.id}-photo-${index}`} 
                        className="relative group aspect-square cursor-pointer"
                        onClick={() => handleImageClick(photoUri)}
                        onDoubleClick={() => handleImageClick(photoUri)}
                    >
                      <Image 
                          src={photoUri} 
                          alt={`Foto de cita ${format(parseISO(appt.appointmentDateTime), "dd/MM/yy", { locale: es })} - ${index + 1}`} 
                          layout="fill"
                          objectFit="cover" 
                          className="rounded-md border"
                          data-ai-hint="patient chart" 
                      />
                      <div className="absolute bottom-0 left-0 right-0 bg-black/50 text-white text-xs p-1 text-center opacity-0 group-hover:opacity-100 transition-opacity">
                          {format(parseISO(appt.appointmentDateTime), "dd/MM/yy", { locale: es })}
                      </div>
                    </div>
                    )
                  ))
                )}
              </div>
            </div>
          )}

          {history.length > 0 && (
            <div className="mt-4">
              <Separator className="my-3" />
              <h4 className="font-semibold mb-2 text-md">Citas Anteriores (más recientes primero):</h4>
              <ScrollArea className="h-40 rounded-md border p-2 bg-background">
                <ul className="space-y-2">
                  {history.slice(0, 10).map(appt => ( 
                    <li key={appt.id} className="p-2 border-b last:border-b-0 text-xs">
                      <div className="flex justify-between items-center">
                        <span>{format(parseISO(appt.appointmentDateTime), "dd/MM/yy HH:mm", { locale: es })} - {appt.service?.name}</span>
                        <Badge variant={appt.status === APPOINTMENT_STATUS.COMPLETED ? 'default' : 'destructive'} className={cn('capitalize text-xs', APPOINTMENT_STATUS_DISPLAY[appt.status as AppointmentStatus] === APPOINTMENT_STATUS_DISPLAY.completado ? 'bg-green-600 text-white' : '')}>
                          {APPOINTMENT_STATUS_DISPLAY[appt.status as AppointmentStatus] || appt.status}
                        </Badge>
                      </div>
                      {appt.professional && <p className="text-muted-foreground text-xs">Atendido por: {appt.professional.firstName} {appt.professional.lastName}</p>}
                      {appt.bookingObservations && <p className="text-muted-foreground text-xs mt-1">Obs. Reserva: {appt.bookingObservations}</p>}
                      {appt.staffNotes && <p className="text-blue-700 text-xs mt-1">Obs. Staff: {appt.staffNotes}</p>}
                      {appt.attachedPhotos && appt.attachedPhotos.length > 0 && (
                        <div className="mt-1">
                          <p className="text-xs font-medium text-muted-foreground flex items-center gap-1"><Paperclip size={12}/> Fotos:</p>
                          <div className="flex flex-wrap gap-1 mt-0.5">
                            {appt.attachedPhotos.map((photoUri, index) => (
                              photoUri && typeof photoUri === 'string' && photoUri.startsWith("data:image/") ? (
                              <Image 
                                key={index} 
                                src={photoUri} 
                                alt={`Foto ${index + 1}`} 
                                width={24} 
                                height={24} 
                                className="rounded object-cover aspect-square cursor-pointer" 
                                data-ai-hint="medical thumbnail"
                                onClick={() => handleImageClick(photoUri)}
                                onDoubleClick={() => handleImageClick(photoUri)}
                              />
                              ) : null
                            ))}
                          </div>
                        </div>
                      )}
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

      {isImageModalOpen && selectedImageForModal && (
        <Dialog open={isImageModalOpen} onOpenChange={(open) => { setIsImageModalOpen(open); if(!open) resetZoomAndPosition();}}>
          <DialogContent className="sm:max-w-3xl max-h-[90vh] flex flex-col p-2">
            <DialogHeader className="flex-row justify-between items-center p-2 border-b">
              <DialogTitle>Vista Previa de Imagen</DialogTitle>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="icon" onClick={() => setZoomLevel(prev => Math.min(prev * 1.2, 5))} title="Acercar"> <ZoomIn /> </Button>
                <Button variant="ghost" size="icon" onClick={() => setZoomLevel(prev => Math.max(prev * 0.8, 0.5))} title="Alejar"> <ZoomOut /> </Button>
                <Button variant="ghost" size="icon" onClick={resetZoomAndPosition} title="Restaurar"> <RefreshCw /> </Button>
                <DialogClose asChild>
                  <Button variant="ghost" size="icon"><XIcon className="h-5 w-5"/></Button>
                </DialogClose>
              </div>
            </DialogHeader>
            <div 
              className="flex-grow overflow-hidden p-2 flex items-center justify-center relative"
              onWheel={handleWheel}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp} // Stop dragging if mouse leaves container
              style={{ cursor: zoomLevel > 1 ? (isDragging ? 'grabbing' : 'grab') : 'default' }}
            >
              <div
                style={{
                  transform: `scale(${zoomLevel}) translate(${imagePosition.x}px, ${imagePosition.y}px)`,
                  transition: isDragging ? 'none' : 'transform 0.1s ease-out',
                  maxWidth: '100%',
                  maxHeight: '100%',
                  willChange: 'transform',
                }}
                className="flex items-center justify-center" 
              >
                <Image 
                  ref={imageRef}
                  src={selectedImageForModal} 
                  alt="Vista ampliada" 
                  width={800} // Intrinsic width for aspect ratio calculation
                  height={600} // Intrinsic height
                  className="max-w-full max-h-[calc(90vh-100px)] object-contain rounded-md select-none" // Prevent image selection during drag
                  draggable="false" // Prevent browser default drag
                  data-ai-hint="medical chart" 
                />
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
