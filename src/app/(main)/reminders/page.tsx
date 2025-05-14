
"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/contexts/auth-provider';
import { USER_ROLES } from '@/lib/constants';
import { Bell, CalendarClock, StickyNote, ShieldAlert } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function RemindersPage() {
  const { user, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && (!user || (user.role !== USER_ROLES.ADMIN && user.role !== USER_ROLES.CONTADOR))) {
      router.replace('/dashboard'); 
    }
  }, [user, isLoading, router]);

  if (isLoading || !user || (user.role !== USER_ROLES.ADMIN && user.role !== USER_ROLES.CONTADOR)) {
    return (
      <div className="flex h-screen items-center justify-center">
        <p>Cargando o redirigiendo...</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8 px-4 md:px-0 space-y-6">
      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle className="text-3xl flex items-center gap-2">
            <Bell className="text-primary" />
            Gestión de Recordatorios y Notas
          </CardTitle>
          <CardDescription>
            Administre sus recordatorios de pagos periódicos y notas importantes de la empresa.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-xl flex items-center gap-2">
                <CalendarClock className="text-accent" />
                Recordatorios Periódicos
              </CardTitle>
              <CardDescription>
                Configure alertas para pagos recurrentes como tributos, servicios y créditos.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="p-6 border rounded-lg bg-secondary/30 text-center">
                <ShieldAlert className="h-10 w-10 text-muted-foreground mx-auto mb-2" />
                <p className="text-muted-foreground">
                  Próximamente: Aquí podrá crear, ver, editar y gestionar recordatorios para pagos importantes, asegurando que nada se pase por alto.
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-xl flex items-center gap-2">
                <StickyNote className="text-accent" />
                Notas Importantes
              </CardTitle>
              <CardDescription>
                Guarde y organice información crucial y datos relevantes para su empresa.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="p-6 border rounded-lg bg-secondary/30 text-center">
                <ShieldAlert className="h-10 w-10 text-muted-foreground mx-auto mb-2" />
                <p className="text-muted-foreground">
                  Próximamente: Un espacio dedicado para registrar notas, ideas y datos importantes, con funcionalidades de búsqueda para un acceso rápido.
                </p>
              </div>
            </CardContent>
          </Card>
        </CardContent>
      </Card>
    </div>
  );
}
