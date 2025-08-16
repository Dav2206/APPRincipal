
"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ListChecks } from 'lucide-react';

export default function CorroborationPage() {
  return (
    <div className="container mx-auto py-8 px-4 md:px-0 space-y-8">
      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle className="text-3xl flex items-center gap-2">
            <ListChecks className="text-primary" />
            Módulo de Corroboración
          </CardTitle>
          <CardDescription>
            Herramientas para la verificación y validación de datos financieros.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="mt-6 p-6 border rounded-lg bg-secondary/30">
            <h3 className="text-xl font-semibold mb-3">Página en Construcción</h3>
            <p className="text-muted-foreground">
              Esta sección está siendo desarrollada para incluir funcionalidades avanzadas de corroboración de datos.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
