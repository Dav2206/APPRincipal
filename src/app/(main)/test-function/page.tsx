
"use client";

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, Send, Terminal, Bot, Mail } from 'lucide-react';
import { handleEmailRequest } from '@/ai/flows/email-bot';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';

export default function TestFunctionPage() {
  const [emailContent, setEmailContent] = useState('Hola, soy Carlos Villagrán y quisiera una quiropodia para mañana a las 4pm. Gracias!');
  const [response, setResponse] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleCallFunction = async () => {
    if (!emailContent.trim()) {
      setError("Por favor, ingrese el contenido del correo electrónico.");
      return;
    }

    setIsLoading(true);
    setResponse(null);
    setError(null);

    try {
      const result = await handleEmailRequest({ emailBody: emailContent });
      setResponse(result);
    } catch (err: any) {
      console.error("Error llamando a la función del bot de email:", err);
      let errorMessage = "Ocurrió un error desconocido al procesar el email.";
      if (err.message) {
        errorMessage = err.message;
      }
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="container mx-auto py-8 px-4 md:px-0 space-y-6">
      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle className="text-2xl flex items-center gap-2">
            <Bot className="text-primary" />
            Probar Asistente de Citas por Email
          </CardTitle>
          <CardDescription>
            Simula ser un cliente enviando un correo para agendar una cita. El asistente de IA intentará procesarlo y agendarlo automáticamente.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label htmlFor="emailContent" className="block text-sm font-medium text-foreground mb-1">
              Contenido del Correo Electrónico del Cliente:
            </label>
            <Textarea
              id="emailContent"
              value={emailContent}
              onChange={(e) => setEmailContent(e.target.value)}
              placeholder="Escribe aquí el email del cliente..."
              className="max-w-lg min-h-[100px]"
            />
          </div>
          
          <Button onClick={handleCallFunction} disabled={isLoading}>
            {isLoading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Mail className="mr-2 h-4 w-4" />
            )}
            Procesar Email
          </Button>

          {error && (
            <Alert variant="destructive" className="mt-4">
              <AlertTitle>Error del Asistente</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {response && (
             <Alert variant="default" className="mt-4 bg-blue-50 border-blue-200 text-blue-800">
                <AlertTitle className="text-blue-900 font-semibold">Respuesta Generada por el Asistente</AlertTitle>
                <AlertDescription>
                    <p className="mb-2">El asistente ha procesado la solicitud. Esta sería la respuesta para el cliente:</p>
                    <pre className="text-sm whitespace-pre-wrap bg-white/50 p-3 rounded-md text-foreground/90 font-mono">{response.reply}</pre>
                </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>
      <Card className="shadow-md">
        <CardHeader>
            <CardTitle className="text-lg">Instrucciones Adicionales</CardTitle>
        </CardHeader>
        <CardContent className="text-sm space-y-2 text-muted-foreground">
            <p>
                1. Este es un simulador. Para que funcione en el mundo real, necesitaríamos conectar este flujo a un servicio que lea un buzón de correo real (como Gmail o Outlook).
            </p>
            <p>
                2. El bot utiliza la disponibilidad actual de tus profesionales para encontrar un hueco. ¡Los cambios que hagas en la agenda afectarán el resultado!
            </p>
             <p>
                3. Prueba con diferentes frases, como "Quisiera un tratamiento para uñas para el viernes por la mañana" o "¿Tienen espacio para una consulta el 25 de diciembre a las 10am?".
            </p>
        </CardContent>
      </Card>
    </div>
  );
}
