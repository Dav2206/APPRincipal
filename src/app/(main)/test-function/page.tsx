
"use client";

import React, { useState } from 'react';
import { functions } from '@/lib/firebase-config'; // Importa la instancia de functions
import { httpsCallable } from 'firebase/functions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, Send, Terminal } from 'lucide-react';
import { useAuth } from '@/contexts/auth-provider'; // Para obtener el token de autenticación si es necesario

export default function TestFunctionPage() {
  const { user } = useAuth(); // Útil si tu función requiere autenticación
  const [name, setName] = useState('');
  const [message, setMessage] = useState('');
  const [response, setResponse] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleCallFunction = async () => {
    if (!functions) {
      setError("Firebase Functions no está inicializado. Revisa la configuración.");
      console.error("Firebase Functions instance is undefined in TestFunctionPage.");
      return;
    }
    if (!name.trim()) {
      setError("Por favor, ingresa un nombre.");
      return;
    }

    setIsLoading(true);
    setResponse(null);
    setError(null);

    try {
      // Nombre de la función callable tal como la exportaste en functions/src/index.ts
      const miFuncion = httpsCallable(functions, 'miPrimeraFuncionCallable');
      
      const result = await miFuncion({ nombre: name, mensaje: message });
      setResponse(result.data);
    } catch (err: any) {
      console.error("Error llamando a la función:", err);
      setError(err.message || "Ocurrió un error al llamar a la función.");
      // Si usas HttpsError, puedes acceder a err.code y err.details
      if (err.code) {
        setError(`Error (${err.code}): ${err.message}`);
      }
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
            Probar Firebase Function (Callable)
          </CardTitle>
          <CardDescription>
            Ingresa datos para enviar a la función &quot;miPrimeraFuncionCallable&quot; y ver la respuesta.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label htmlFor="nameInput" className="block text-sm font-medium text-foreground mb-1">
              Nombre a Enviar:
            </label>
            <Input
              id="nameInput"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ej: Ana"
              className="max-w-sm"
            />
          </div>
          <div>
            <label htmlFor="messageInput" className="block text-sm font-medium text-foreground mb-1">
              Mensaje Adicional (Opcional):
            </label>
            <Input
              id="messageInput"
              type="text"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Ej: ¿Cómo estás?"
              className="max-w-sm"
            />
          </div>
          <Button onClick={handleCallFunction} disabled={isLoading}>
            {isLoading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Send className="mr-2 h-4 w-4" />
            )}
            Llamar a la Función
          </Button>

          {error && (
            <div className="mt-4 p-3 bg-destructive/10 border border-destructive text-destructive rounded-md">
              <p className="font-semibold">Error:</p>
              <p className="text-sm">{error}</p>
            </div>
          )}

          {response && (
            <div className="mt-4 p-3 bg-primary/10 border border-primary text-primary-foreground rounded-md">
              <p className="font-semibold text-primary">Respuesta de la Función:</p>
              <pre className="text-sm whitespace-pre-wrap text-foreground/80">{JSON.stringify(response, null, 2)}</pre>
            </div>
          )}
        </CardContent>
      </Card>
      <Card className="shadow-md">
        <CardHeader>
            <CardTitle className="text-lg">Instrucciones Adicionales</CardTitle>
        </CardHeader>
        <CardContent className="text-sm space-y-2 text-muted-foreground">
            <p>
                1. Asegúrate de haber creado la carpeta `functions` en la raíz de tu proyecto Firebase (el mismo nivel que `src`).
            </p>
            <p>
                2. Dentro de `functions`, inicializa Firebase Functions con `firebase init functions` (elige TypeScript).
            </p>
            <p>
                3. Copia el código de la función `miPrimeraFuncionCallable` (proporcionado en la conversación) en el archivo `functions/src/index.ts`.
            </p>
            <p>
                4. Despliega tus funciones usando el comando: `firebase deploy --only functions` desde la raíz de tu proyecto Firebase.
            </p>
            <p>
                5. (Opcional para desarrollo local) Inicia los emuladores de Firebase con `firebase emulators:start` (asegúrate de que el emulador de Functions esté en el puerto 5001). Esta página ya está configurada para intentar conectarse al emulador de Functions si se detecta un entorno de desarrollo.
            </p>
        </CardContent>
      </Card>
    </div>
  );
}

    