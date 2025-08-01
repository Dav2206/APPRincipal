"use client";

import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Landmark } from 'lucide-react';

export default function FinancesPage() {
  return (
    <div className="container mx-auto py-8 px-4 md:px-0">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Landmark className="text-muted-foreground" />
            Módulo de Finanzas
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">Este módulo ha sido desactivado según su solicitud.</p>
        </CardContent>
      </Card>
    </div>
  );
}
