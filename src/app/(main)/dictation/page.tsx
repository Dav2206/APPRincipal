
"use client";

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, Send, Terminal, CheckCircle, MessageSquareQuote, Copy } from 'lucide-react';
import { processDictation, type DictationOutput } from '@/ai/flows/dictation-bot';
import { addAppointment, getAppointments } from '@/lib/data'; // Importar la función para ejecutar la acción
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { useAppState } from '@/contexts/app-state-provider';
import { format, parseISO } from 'date-fns';
import { APPOINTMENT_STATUS } from '@/lib/constants';

export default function DictationPage() {
  const [command, setCommand] = useState('');
  const [response, setResponse] = useState<DictationOutput | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  
  const [whatsAppMessage, setWhatsAppMessage] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);

  const { toast } = useToast();
  const { selectedLocationId } = useAppState();

  const handleProcessCommand = async () => {
    if (!command.trim()) {
      setError("Por favor, ingrese un comando.");
      return;
    }
    if (!selectedLocationId || selectedLocationId === 'all') {
      setError("Por favor, seleccione una sede específica desde el menú superior para usar el dictado.");
      return;
    }

    setIsLoading(true);
    setResponse(null);
    setError(null);

    try {
      const result = await processDictation({ 
        command,
        locationId: selectedLocationId,
        currentDate: format(new Date(), 'yyyy-MM-dd'),
      });
      setResponse(result);
      if (!result.success) {
        setError(result.message);
      }
    } catch (err: any) {
      console.error("Error llamando a la función de dictado:", err);
      let errorMessage = "Ocurrió un error desconocido al procesar el comando.";
      if (err.message) {
        errorMessage = err.message;
      }
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const handleConfirmAction = async () => {
    if (!response || !response.suggestedChanges) {
      setError("No hay acción que confirmar.");
      return;
    }
    
    setIsConfirming(true);
    setError(null);

    try {
      await addAppointment(response.suggestedChanges);
      toast({
        title: "Cita Creada Exitosamente",
        description: `La cita ha sido agendada según lo solicitado.`,
      });
      setResponse(null);
      setCommand('');

    } catch (err: any) {
        console.error("Error al confirmar y ejecutar la acción:", err);
        setError(err.message || "No se pudo completar la acción. Intente de nuevo.");
    } finally {
        setIsConfirming(false);
    }
  };
  
  const handleGenerateWhatsAppSummary = async () => {
    if (!selectedLocationId || selectedLocationId === 'all') {
        toast({ title: "Error", description: "Por favor, seleccione una sede específica para generar el resumen.", variant: "destructive" });
        return;
    }
    setIsGenerating(true);
    setWhatsAppMessage('');
    try {
        const { appointments } = await getAppointments({
            date: new Date(),
            locationId: selectedLocationId,
            statuses: [APPOINTMENT_STATUS.BOOKED, APPOINTMENT_STATUS.CONFIRMED],
        });
        
        if (appointments.length === 0) {
            setWhatsAppMessage("No hay citas programadas para hoy en esta sede.");
            return;
        }
        
        const sortedAppointments = appointments.sort((a,b) => parseISO(a.appointmentDateTime).getTime() - parseISO(b.appointmentDateTime).getTime());
        
        const messageLines = sortedAppointments.map(appt => {
            const time = format(parseISO(appt.appointmentDateTime), 'HH:mm');
            const patientName = `${appt.patient?.firstName || ''} ${appt.patient?.lastName || ''}`.trim();
            const serviceName = appt.service?.name || 'Servicio';
            const professionalName = appt.professional ? `${appt.professional.firstName} ${appt.professional.lastName.charAt(0)}.` : 'N/A';
            return `${time} - ${patientName} - ${serviceName} (${professionalName})`;
        });
        
        const locationName = appointments[0].location?.name || 'Sede';
        const fullMessage = `*Resumen de Citas para ${locationName} - ${format(new Date(), 'PPP', {locale: es})}*\n\n${messageLines.join('\n')}`;
        
        setWhatsAppMessage(fullMessage);
        
    } catch(err) {
        console.error("Error generating WhatsApp summary:", err);
        toast({ title: "Error", description: "No se pudo generar el resumen de citas.", variant: "destructive" });
    } finally {
        setIsGenerating(false);
    }
  };

  const handleCopyToClipboard = () => {
    if (whatsAppMessage) {
        navigator.clipboard.writeText(whatsAppMessage);
        toast({ title: "Copiado", description: "El resumen ha sido copiado al portapapeles." });
    }
  };


  return (
    <div className="container mx-auto py-8 px-4 md:px-0 space-y-6">
      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle className="text-2xl flex items-center gap-2">
            <Terminal className="text-primary" />
            Dictado IA (Shorthand)
          </CardTitle>
          <CardDescription>
            Escriba comandos cortos para agendar citas rápidamente. La IA los interpretará y preparará la cita para su confirmación.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label htmlFor="command-input" className="block text-sm font-medium text-foreground mb-1">
              Comando:
            </label>
            <Textarea
              id="command-input"
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              placeholder="Ej: 9 30 ana torres podo..."
              className="max-w-lg min-h-[100px] font-mono"
            />
          </div>
          
          <Button onClick={handleProcessCommand} disabled={isLoading || isConfirming}>
            {isLoading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Send className="mr-2 h-4 w-4" />
            )}
            Procesar Comando
          </Button>

          {error && (
            <Alert variant="destructive" className="mt-4">
              <AlertTitle>Error del Asistente</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {response && response.success && (
             <Alert variant={"default"} className="mt-4 bg-blue-50 border-blue-200">
                <AlertTitle className="font-semibold text-blue-900">
                    {response.confirmationRequired ? "Confirmación Requerida" : "Respuesta del Asistente"}
                </AlertTitle>
                <AlertDescription className="text-blue-800">
                    <pre className="text-sm whitespace-pre-wrap font-mono">{response.message}</pre>
                </AlertDescription>
                {response.confirmationRequired && (
                    <div className="mt-4">
                        <Button onClick={handleConfirmAction} disabled={isConfirming}>
                           {isConfirming ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle className="mr-2 h-4 w-4" />}
                            Confirmar y Crear Cita
                        </Button>
                    </div>
                )}
            </Alert>
          )}
        </CardContent>
      </Card>
      <Card className="shadow-md">
        <CardHeader>
            <CardTitle className="text-xl flex items-center gap-2">
                <MessageSquareQuote className="text-primary"/>
                Generador de Resumen para WhatsApp
            </CardTitle>
             <CardDescription>
                Crea un resumen de las citas del día para la sede seleccionada, listo para copiar y enviar.
            </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
            <Button onClick={handleGenerateWhatsAppSummary} disabled={isGenerating}>
                {isGenerating ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Send className="mr-2 h-4 w-4"/>}
                Generar Resumen del Día
            </Button>
            {whatsAppMessage && (
                 <div className="space-y-2">
                    <Label htmlFor="whatsapp-summary">Resumen generado:</Label>
                    <Textarea 
                        id="whatsapp-summary"
                        readOnly
                        value={whatsAppMessage}
                        className="font-mono text-sm h-64 bg-secondary"
                    />
                    <Button onClick={handleCopyToClipboard} variant="outline" size="sm">
                        <Copy className="mr-2 h-4 w-4"/> Copiar Texto
                    </Button>
                </div>
            )}
        </CardContent>
      </Card>
    </div>
  );
}
