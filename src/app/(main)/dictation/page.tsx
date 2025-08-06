
"use client";

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, Send, Terminal } from 'lucide-react';
import { processDictation, type DictationOutput } from '@/ai/flows/dictation-bot';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';

export default function DictationPage() {
  const [command, setCommand] = useState('Reagendar la cita de Carlos Villagrán del 2024-08-06 para el 2024-08-07 a las 17:00');
  const [response, setResponse] = useState<DictationOutput | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleProcessCommand = async () => {
    if (!command.trim()) {
      setError("Por favor, ingrese un comando.");
      return;
    }

    setIsLoading(true);
    setResponse(null);
    setError(null);

    try {
      const result = await processDictation({ command });
      setResponse(result);
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

  return (
    <div className="container mx-auto py-8 px-4 md:px-0 space-y-6">
      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle className="text-2xl flex items-center gap-2">
            <Terminal className="text-primary" />
            Dictado IA
          </CardTitle>
          <CardDescription>
            Escriba comandos en lenguaje natural para gestionar citas. La IA los interpretará y ejecutará los cambios.
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
              placeholder="Ej: Agendar quiropodia para Ana Torres mañana a las 3pm..."
              className="max-w-lg min-h-[100px]"
            />
          </div>
          
          <Button onClick={handleProcessCommand} disabled={isLoading}>
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

          {response && (
             <Alert variant={response.success ? "default" : "destructive"} className="mt-4">
                <AlertTitle className="font-semibold">
                    {response.success ? "Operación Exitosa" : "Operación Fallida"}
                </AlertTitle>
                <AlertDescription>
                    <pre className="text-sm whitespace-pre-wrap font-mono">{response.message}</pre>
                </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>
      <Card className="shadow-md">
        <CardHeader>
            <CardTitle className="text-lg">Ejemplos de Comandos</CardTitle>
        </CardHeader>
        <CardContent className="text-sm space-y-2 text-muted-foreground">
            <p>
                <strong className="text-foreground">Agendar:</strong> "Agenda una quiropodia para el paciente 'Juan Robles' el 2024-09-15 a las 11:00."
            </p>
            <p>
                <strong className="text-foreground">Reagendar:</strong> "Reagenda la cita de 'Juan Robles' del 2024-09-15 para el 2024-09-16 a las 12:00."
            </p>
             <p>
                <strong className="text-foreground">Cancelar:</strong> "Cancela la cita de 'Juan Robles' del 2024-09-16."
            </p>
            <p className="text-xs italic mt-2">
                Nota: Para reagendar o cancelar, el bot primero buscará una cita única para el paciente en la fecha original especificada.
            </p>
        </CardContent>
      </Card>
    </div>
  );
}
