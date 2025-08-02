
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
      setError("Error de Configuración: La instancia de Firebase Functions no está inicializada. Revisa `src/lib/firebase-config.ts` y los logs de la consola del navegador para más detalles.");
      console.error("Firebase Functions instance is undefined in TestFunctionPage.");
      return;
    }
    if (!name.trim()) {
      setError("Por favor, ingresa un nombre para enviar a la función.");
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
      let errorMessage = "Ocurrió un error desconocido al llamar a la función.";
       if (err.code === 'unavailable') {
        errorMessage = "Error de Conexión: No se pudo contactar con el servidor de Firebase Functions. Verifica tu conexión a internet o el estado del servicio de Firebase.";
      } else if (err.code === 'not-found') {
        errorMessage = "Error 404: La función 'miPrimeraFuncionCallable' no se encontró en tu proyecto de Firebase. Asegúrate de que se haya desplegado correctamente.";
      } else if (err.code === 'permission-denied') {
          errorMessage = "Error de Permisos: No tienes permiso para ejecutar esta función. Asegúrate de que el usuario esté autenticado si la función lo requiere.";
      } else if (err.code) {
        errorMessage = `Error (${err.code}): ${err.message}`;
      } else {
        errorMessage = err.message || errorMessage;
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
            Probar Conexión con Firebase
          </CardTitle>
          <CardDescription>
            Usa esta herramienta para verificar que tu aplicación se está comunicando correctamente con tu backend de Firebase Functions.
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
            Probar Conexión
          </Button>

          {error && (
            <div className="mt-4 p-3 bg-destructive/10 border border-destructive text-destructive rounded-md">
              <p className="font-semibold">Resultado: Fallido</p>
              <p className="text-sm">{error}</p>
            </div>
          )}

          {response && (
            <div className="mt-4 p-3 bg-green-100 border border-green-600 text-green-900 rounded-md">
              <p className="font-semibold">Resultado: ¡Éxito!</p>
              <p className="text-sm mb-2">La aplicación se comunicó correctamente con Firebase. Respuesta recibida:</p>
              <pre className="text-sm whitespace-pre-wrap bg-white/50 p-2 rounded text-foreground/80">{JSON.stringify(response, null, 2)}</pre>
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
                5. Si esta prueba falla, revisa los mensajes de error y la consola del navegador para más pistas.
            </p>
        </CardContent>
      </Card>
    </div>
  );
}
