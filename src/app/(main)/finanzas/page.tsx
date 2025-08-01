
"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/contexts/auth-provider';
import { USER_ROLES, LOCATIONS, PAYMENT_METHODS } from '@/lib/constants';
import { Landmark, AlertTriangle, Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import type { LocationId, PaymentMethod } from '@/lib/constants';

type PaymentMethodsConfig = Record<LocationId, PaymentMethod[]>;

export default function FinancesPage() {
  const { user, isLoading } = useAuth();
  const router = useRouter();
  const { toast } = useToast();

  const [paymentMethodsConfig, setPaymentMethodsConfig] = useState<PaymentMethodsConfig>(() => {
    const initialConfig = {} as PaymentMethodsConfig;
    LOCATIONS.forEach(loc => {
      initialConfig[loc.id] = [...(loc.paymentMethods || [])];
    });
    return initialConfig;
  });
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    if (!isLoading && (!user || user.role !== USER_ROLES.CONTADOR)) {
      router.replace('/dashboard'); 
    }
  }, [user, isLoading, router]);

  const handlePaymentMethodToggle = (locationId: LocationId, method: PaymentMethod, checked: boolean) => {
    setPaymentMethodsConfig(prevConfig => {
      const currentMethods = prevConfig[locationId] || [];
      const newMethods = checked
        ? [...currentMethods, method]
        : currentMethods.filter(m => m !== method);
      return { ...prevConfig, [locationId]: newMethods };
    });
    setHasChanges(true);
  };
  
  const handleSaveChanges = async () => {
    setIsSaving(true);
    // En una aplicación real, aquí llamarías a una función para guardar `paymentMethodsConfig` en la base de datos.
    // Como no podemos modificar el backend, simularemos un guardado exitoso y actualizaremos el estado.
    console.log("Guardando la siguiente configuración de métodos de pago:", paymentMethodsConfig);
    
    // Simular una llamada a API
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Aquí deberíamos actualizar la constante LOCATIONS, pero como no podemos,
    // solo mostramos un toast de éxito y reseteamos el estado de cambios.
    toast({
      title: "Configuración Guardada",
      description: "Los métodos de pago han sido actualizados. (Simulación: los cambios no persistirán al recargar)",
    });
    setIsSaving(false);
    setHasChanges(false);
  };

  if (isLoading || !user || user.role !== USER_ROLES.CONTADOR) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="ml-2">Cargando o redirigiendo...</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8 px-4 md:px-0 space-y-8">
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

      <Card className="shadow-lg">
        <CardHeader>
            <CardTitle>Gestión de Métodos de Pago por Sede</CardTitle>
            <CardDescription>
                Habilite o deshabilite los métodos de pago disponibles para cada una de sus sedes.
            </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
            {LOCATIONS.map(location => (
                <div key={location.id} className="p-4 border rounded-lg">
                    <h4 className="font-semibold mb-4 text-lg">{location.name}</h4>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                        {PAYMENT_METHODS.map(method => (
                            <div key={method} className="flex items-center space-x-2">
                                <Switch
                                    id={`${location.id}-${method}`}
                                    checked={(paymentMethodsConfig[location.id] || []).includes(method)}
                                    onCheckedChange={(checked) => handlePaymentMethodToggle(location.id, method, checked)}
                                />
                                <Label htmlFor={`${location.id}-${method}`} className="text-sm">
                                    {method}
                                </Label>
                            </div>
                        ))}
                    </div>
                </div>
            ))}
             <div className="flex justify-end mt-6">
                <Button onClick={handleSaveChanges} disabled={!hasChanges || isSaving}>
                    {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Guardar Cambios
                </Button>
            </div>
            <Alert variant="default" className="mt-4 bg-blue-50 border-blue-200 text-blue-800">
                <AlertTriangle className="h-4 w-4 !text-blue-800" />
                <CardTitle className="text-blue-900 text-sm">Nota sobre la Persistencia</CardTitle>
                <AlertDescription className="text-xs">
                    Actualmente, esta configuración es una simulación visual. Los cambios no se guardarán permanentemente al recargar la página. Para una solución persistente, se requeriría una actualización de la base de datos.
                </AlertDescription>
            </Alert>
        </CardContent>
      </Card>
    </div>
  );
}

