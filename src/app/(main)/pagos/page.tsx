"use client";

import React from 'react';
import { useAuth } from '@/contexts/auth-provider';
import { useRouter } from 'next/navigation';
import { USER_ROLES } from '@/lib/constants';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, CreditCard, AlertTriangle } from 'lucide-react';

export default function PaymentsPage() {
  const { user, isLoading } = useAuth();
  const router = useRouter();

  React.useEffect(() => {
    if (!isLoading && (!user || (user.role !== USER_ROLES.ADMIN && user.role !== USER_ROLES.CONTADOR))) {
      router.replace('/dashboard');
    }
  }, [user, isLoading, router]);

  if (isLoading || !user || (user.role !== USER_ROLES.ADMIN && user.role !== USER_ROLES.CONTADOR)) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8 px-4 md:px-0 space-y-6">
      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle className="text-3xl flex items-center gap-2">
            <CreditCard className="text-primary" />
            Módulo de Pagos
          </CardTitle>
          <CardDescription>
            Registro y gestión de egresos, planillas y pagos a proveedores.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="p-8 border rounded-lg bg-secondary/30 text-center mt-4">
            <AlertTriangle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-xl font-semibold">Módulo en Construcción</h3>
            <p className="text-muted-foreground mt-2">
              Esta sección está siendo desarrollada para incluir la gestión de planillas, pagos de servicios, y más.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
