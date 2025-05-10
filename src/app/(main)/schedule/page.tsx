
"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Hourglass } from "lucide-react";

export default function SchedulePage() {
  return (
    <div className="container mx-auto py-8 px-4 md:px-0">
      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle className="text-3xl flex items-center gap-2">
            <Hourglass className="text-primary" />
            Agenda Horaria
          </CardTitle>
          <CardDescription>
            Vista de la agenda en formato de línea de tiempo por profesional.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center min-h-[400px] text-center border-2 border-dashed rounded-lg p-8">
            <Hourglass size={64} className="text-muted-foreground mb-4" />
            <h2 className="text-2xl font-semibold mb-2">Próximamente</h2>
            <p className="text-muted-foreground max-w-md">
              Esta sección mostrará una vista detallada de la agenda por horas y profesionales. 
              Actualmente está en desarrollo.
            </p>
            <p className="text-sm text-muted-foreground mt-4">
              Mientras tanto, puedes gestionar las citas del día en la sección "Citas del Día".
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
