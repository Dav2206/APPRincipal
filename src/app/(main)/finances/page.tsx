
"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/contexts/auth-provider';
import { USER_ROLES } from '@/lib/constants';
import { Landmark } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function FinancesPage() {
  const { user, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && (!user || user.role !== USER_ROLES.CONTADOR)) {
      router.replace('/dashboard'); // Redirect if not contador or not logged in
    }
  }, [user, isLoading, router]);

  if (isLoading || !user || user.role !== USER_ROLES.CONTADOR) {
    return (
      <div className="flex h-screen items-center justify-center">
        <p>Cargando o redirigiendo...</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8 px-4 md:px-0">
      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle className="text-3xl flex items-center gap-2">
            <Landmark className="text-primary" />
            Módulo de Finanzas
          </CardTitle>
          <CardDescription>
            Reportes financieros, análisis de ingresos y gestión contable.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            Esta sección está dedicada a las herramientas y reportes financieros para el rol de Contador.
            Aquí podrá visualizar ingresos, gastos, rentabilidad por sede o profesional, y otras métricas financieras clave.
          </p>
          <div className="mt-6 p-6 border rounded-lg bg-secondary/30">
            <h3 className="text-xl font-semibold mb-3">Próximas Funcionalidades:</h3>
            <ul className="list-disc list-inside space-y-1 text-muted-foreground">
              <li>Reporte de Ingresos Detallado por Sede y Profesional.</li>
              <li>Análisis de Rentabilidad de Servicios.</li>
              <li>Seguimiento de Gastos (Próximamente).</li>
              <li>Generación de Balances Mensuales.</li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
