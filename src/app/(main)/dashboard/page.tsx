
"use client";

import { useAuth } from '@/contexts/auth-provider';
import { USER_ROLES, LOCATIONS } from '@/lib/constants';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import Image from 'next/image';
import { CalendarPlus, Users, History, Briefcase } from 'lucide-react';
import { useAppState } from '@/contexts/app-state-provider';
import { useState, useEffect } from 'react';

interface DashboardStats {
  todayAppointments: string; // Changed from number to string
  pendingConfirmations: number;
  activeProfessionals: number;
  totalRevenueMonth: string;
}

export default function DashboardPage() {
  const { user } = useAuth();
  const { selectedLocationId } = useAppState();
  const [stats, setStats] = useState<DashboardStats>({
    todayAppointments: "", // Initial value as string
    pendingConfirmations: 0,
    activeProfessionals: 0,
    totalRevenueMonth: '0.00',
  });

  useEffect(() => {
    if (user) {
      // Simulate fetching stats or generating them client-side
      // This ensures Math.random is only called on the client
      setStats({
        todayAppointments: "el valor de este digito debe ser la sumatoria de cada sede", // Set to the requested string
        pendingConfirmations: Math.floor(Math.random() * 10),
        activeProfessionals: user.role === USER_ROLES.ADMIN ? (Math.floor(Math.random() * 20) + 10) : (Math.floor(Math.random() * 4) + 1),
        totalRevenueMonth: (Math.random() * 5000 + 2000).toFixed(2),
      });
    }
  }, [user]);


  if (!user) {
    return null; // Or a loading indicator
  }

  const greetingName = user.name || user.username;
  const roleDescription = user.role === USER_ROLES.ADMIN ? 'Administrador Global' : `Staff de ${LOCATIONS.find(l => l.id === user.locationId)?.name || 'Sede'}`;

  let displayLocationName = "Todas las Sedes";
  if (user.role === USER_ROLES.LOCATION_STAFF && user.locationId) {
    displayLocationName = LOCATIONS.find(l => l.id === user.locationId)?.name || "Tu Sede";
  } else if (selectedLocationId && selectedLocationId !== 'all') {
    displayLocationName = LOCATIONS.find(l => l.id === selectedLocationId)?.name || "Sede Seleccionada";
  }
  
  return (
    <div className="container mx-auto py-8 px-4 md:px-0">
      <Card className="mb-8 shadow-lg">
        <CardHeader>
          <CardTitle className="text-3xl">Bienvenido, {greetingName}!</CardTitle>
          <CardDescription className="text-lg">{roleDescription} - Vista de: {displayLocationName}</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">Aquí tienes un resumen de la actividad reciente y accesos rápidos.</p>
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4 mb-8">
        <StatCard title="Citas de Hoy" value={stats.todayAppointments} icon={<CalendarPlus className="h-6 w-6 text-primary" />} />
        <StatCard title="Pendientes de Confirmar" value={stats.pendingConfirmations.toString()} icon={<Users className="h-6 w-6 text-primary" />} />
        <StatCard title="Profesionales Activos" value={stats.activeProfessionals.toString()} icon={<Briefcase className="h-6 w-6 text-primary" />} />
        <StatCard title="Ingresos del Mes (Estimado)" value={`S/ ${stats.totalRevenueMonth}`} icon={<History className="h-6 w-6 text-primary" />} />
      </div>
      
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        <ActionCard
          title="Gestionar Citas"
          description="Ver calendario, agendar nuevas citas y confirmar llegadas."
          href="/appointments"
          icon={<CalendarPlus className="h-8 w-8 mb-2 text-accent" />}
        />
        <ActionCard
          title="Ver Historial"
          description="Consultar citas pasadas y detalles de pacientes."
          href="/history"
          icon={<History className="h-8 w-8 mb-2 text-accent" />}
        />
        <ActionCard
          title="Administrar Profesionales"
          description="Añadir nuevos profesionales y gestionar sus datos."
          href="/professionals"
          icon={<Briefcase className="h-8 w-8 mb-2 text-accent" />}
        />
      </div>

      <Card className="mt-8">
        <CardHeader>
          <CardTitle>Próximamente</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col md:flex-row items-center gap-6">
          <Image 
            src="https://picsum.photos/seed/dashboardpromo/600/300" 
            alt="Feature promotion" 
            width={300} 
            height={150} 
            className="rounded-lg shadow-md"
            data-ai-hint="office schedule" 
          />
          <div>
            <h3 className="text-xl font-semibold mb-2">Reportes Avanzados y Estadísticas</h3>
            <p className="text-muted-foreground mb-4">
              Estamos trabajando en nuevas herramientas de análisis para ayudarte a optimizar la gestión de tu centro podológico. 
              Pronto podrás acceder a reportes detallados sobre rendimiento, ingresos por profesional, y mucho más.
            </p>
            <Button variant="outline">Más Información</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

interface StatCardProps {
  title: string;
  value: string;
  icon: React.ReactNode;
}

function StatCard({ title, value, icon }: StatCardProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        {icon}
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        {/* <p className="text-xs text-muted-foreground">+20.1% from last month</p> */}
      </CardContent>
    </Card>
  );
}


interface ActionCardProps {
  title: string;
  description: string;
  href: string;
  icon: React.ReactNode;
}

function ActionCard({ title, description, href, icon }: ActionCardProps) {
  return (
    <Card className="hover:shadow-lg transition-shadow">
      <CardHeader>
        {icon}
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground mb-4">{description}</p>
        <Button asChild className="w-full bg-accent hover:bg-accent/90">
          <Link href={href}>Ir a {title}</Link>
        </Button>
      </CardContent>
    </Card>
  );
}

