
"use client";

import { useAuth } from '@/contexts/auth-provider';
import { USER_ROLES, LOCATIONS, LocationId, APPOINTMENT_STATUS } from '@/lib/constants';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import Image from 'next/image';
import { CalendarPlus, Users, History, Briefcase, Loader2 } from 'lucide-react';
import { useAppState } from '@/contexts/app-state-provider';
import { useState, useEffect } from 'react';
import { getAppointments, getProfessionals } from '@/lib/data';
import { startOfDay, startOfMonth, endOfMonth } from 'date-fns';

interface DashboardStats {
  todayAppointments: string;
  pendingConfirmations: string;
  activeProfessionals: string;
  totalRevenueMonth: string;
}

export default function DashboardPage() {
  const { user } = useAuth();
  const { selectedLocationId } = useAppState();
  const [stats, setStats] = useState<DashboardStats>({
    todayAppointments: "0",
    pendingConfirmations: "0",
    activeProfessionals: "0",
    totalRevenueMonth: '0.00',
  });
  const [isLoadingStats, setIsLoadingStats] = useState(true);

  useEffect(() => {
    const fetchDashboardStats = async () => {
      if (!user) return;

      setIsLoadingStats(true);
      let todayAppointmentsCount = 0;
      let pendingConfirmationsCount = 0;
      let activeProfessionalsCount = 0;
      let totalRevenueMonthValue = 0;
      
      const isAdminOrContador = user.role === USER_ROLES.ADMIN || user.role === USER_ROLES.CONTADOR;

      try {
        const today = startOfDay(new Date());
        const currentMonthStart = startOfMonth(today);
        const currentMonthEnd = endOfMonth(today);

        // Fetch Today's Appointments
        if (isAdminOrContador) {
          if (selectedLocationId === 'all') {
            // Sum appointments from all locations for admin/contador 'all' view
            const allLocationsAppointmentsPromises = LOCATIONS.map(loc => getAppointments({ date: today, locationId: loc.id }));
            const allLocationsAppointmentsResults = await Promise.all(allLocationsAppointmentsPromises);
            todayAppointmentsCount = allLocationsAppointmentsResults.reduce((sum, result) => sum + result.length, 0);
          } else if (selectedLocationId) {
            const locationAppointments = await getAppointments({ date: today, locationId: selectedLocationId as LocationId });
            todayAppointmentsCount = locationAppointments.length;
          }
        } else if (user.role === USER_ROLES.LOCATION_STAFF && user.locationId) {
          const locationAppointments = await getAppointments({ date: today, locationId: user.locationId });
          todayAppointmentsCount = locationAppointments.length;
        }

        // Fetch Pending Confirmations (status: 'booked')
        if (isAdminOrContador) {
          if (selectedLocationId === 'all') {
             const allLocationsPendingPromises = LOCATIONS.map(loc => getAppointments({ status: APPOINTMENT_STATUS.BOOKED, locationId: loc.id }));
             const allLocationsPendingResults = await Promise.all(allLocationsPendingPromises);
             pendingConfirmationsCount = allLocationsPendingResults.reduce((sum, result) => sum + result.length, 0);
          } else if (selectedLocationId) {
            const bookedAppointments = await getAppointments({ status: APPOINTMENT_STATUS.BOOKED, locationId: selectedLocationId as LocationId });
            pendingConfirmationsCount = bookedAppointments.length;
          }
        } else if (user.role === USER_ROLES.LOCATION_STAFF && user.locationId) {
          const bookedAppointments = await getAppointments({ status: APPOINTMENT_STATUS.BOOKED, locationId: user.locationId });
          pendingConfirmationsCount = bookedAppointments.length;
        }
        
        // Fetch Total Revenue for Current Month (status: 'completed')
        if (isAdminOrContador) {
          if (selectedLocationId === 'all') {
            const allLocationsCompletedPromises = LOCATIONS.map(loc => getAppointments({
              status: APPOINTMENT_STATUS.COMPLETED,
              locationId: loc.id,
              dateRange: { start: currentMonthStart, end: currentMonthEnd },
            }));
            const allLocationsCompletedResults = await Promise.all(allLocationsCompletedPromises);
            totalRevenueMonthValue = allLocationsCompletedResults.reduce((totalSum, locationResults) => 
              totalSum + locationResults.reduce((locationSum, appt) => locationSum + (appt.amountPaid || 0), 0), 
            0);
          } else if (selectedLocationId) {
            const completedAppointmentsMonth = await getAppointments({
              status: APPOINTMENT_STATUS.COMPLETED,
              locationId: selectedLocationId as LocationId,
              dateRange: { start: currentMonthStart, end: currentMonthEnd },
            });
            totalRevenueMonthValue = completedAppointmentsMonth.reduce((sum, appt) => sum + (appt.amountPaid || 0), 0);
          }
        } else if (user.role === USER_ROLES.LOCATION_STAFF && user.locationId) {
          const completedAppointmentsMonth = await getAppointments({
            status: APPOINTMENT_STATUS.COMPLETED,
            locationId: user.locationId,
            dateRange: { start: currentMonthStart, end: currentMonthEnd },
          });
          totalRevenueMonthValue = completedAppointmentsMonth.reduce((sum, appt) => sum + (appt.amountPaid || 0), 0);
        }


        // Fetch Active Professionals
        if (isAdminOrContador) {
            if (selectedLocationId === 'all') {
                const allProfessionalsPromises = LOCATIONS.map(loc => getProfessionals(loc.id));
                const allProfessionalsResults = await Promise.all(allProfessionalsPromises);
                activeProfessionalsCount = allProfessionalsResults.reduce((sum, result) => sum + result.length, 0);
            } else if (selectedLocationId) {
                const locationProfessionals = await getProfessionals(selectedLocationId as LocationId);
                activeProfessionalsCount = locationProfessionals.length;
            }
        } else if (user.role === USER_ROLES.LOCATION_STAFF && user.locationId) {
            const locationProfessionals = await getProfessionals(user.locationId);
            activeProfessionalsCount = locationProfessionals.length;
        }


        setStats({
          todayAppointments: todayAppointmentsCount.toString(),
          pendingConfirmations: pendingConfirmationsCount.toString(),
          activeProfessionals: activeProfessionalsCount.toString(),
          totalRevenueMonth: totalRevenueMonthValue.toFixed(2),
        });

      } catch (error) {
        console.error("Failed to fetch dashboard stats:", error);
        setStats({
            todayAppointments: "N/A",
            pendingConfirmations: "N/A",
            activeProfessionals: "N/A",
            totalRevenueMonth: "N/A",
        });
      } finally {
        setIsLoadingStats(false);
      }
    };

    fetchDashboardStats();
  }, [user, selectedLocationId]);


  if (!user) {
    return null; // Or a loading indicator
  }

  const greetingName = user.name || user.username;
  let roleDescription = '';
  if (user.role === USER_ROLES.ADMIN) roleDescription = 'Administrador Global';
  else if (user.role === USER_ROLES.CONTADOR) roleDescription = 'Contador Principal';
  else roleDescription = `Staff de ${LOCATIONS.find(l => l.id === user.locationId)?.name || 'Sede'}`;


  let displayLocationName = "Todas las Sedes";
  if (user.role === USER_ROLES.LOCATION_STAFF && user.locationId) {
    displayLocationName = LOCATIONS.find(l => l.id === user.locationId)?.name || "Tu Sede";
  } else if ((user.role === USER_ROLES.ADMIN || user.role === USER_ROLES.CONTADOR) && selectedLocationId && selectedLocationId !== 'all') {
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
        <StatCard 
          title="Citas de Hoy" 
          value={isLoadingStats ? "..." : stats.todayAppointments} 
          icon={<CalendarPlus className="h-6 w-6 text-primary" />} 
        />
        <StatCard 
          title="Pendientes de Confirmar" 
          value={isLoadingStats ? "..." : stats.pendingConfirmations} 
          icon={<Users className="h-6 w-6 text-primary" />} 
        />
        <StatCard 
          title="Profesionales Activos" 
          value={isLoadingStats ? "..." : stats.activeProfessionals} 
          icon={<Briefcase className="h-6 w-6 text-primary" />} 
        />
        <StatCard 
          title="Ingresos del Mes" 
          value={isLoadingStats ? "..." : `S/ ${stats.totalRevenueMonth}`} 
          icon={<History className="h-6 w-6 text-primary" />} 
        />
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
        {(user.role === USER_ROLES.ADMIN || user.role === USER_ROLES.CONTADOR) && (
          <ActionCard
            title="Administrar Profesionales"
            description="Añadir nuevos profesionales y gestionar sus datos."
            href="/professionals"
            icon={<Briefcase className="h-8 w-8 mb-2 text-accent" />}
          />
        )}
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
        <div className="text-2xl font-bold">
            {value === "..." ? <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /> : value}
        </div>
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

