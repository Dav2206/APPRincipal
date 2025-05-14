
"use client";

import { useAuth } from '@/contexts/auth-provider';
import { USER_ROLES, LOCATIONS, LocationId, APPOINTMENT_STATUS, DAYS_OF_WEEK } from '@/lib/constants';
import type { Professional } from '@/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import Image from 'next/image';
import { CalendarPlus, Users, History, Briefcase, Loader2, Bed, CalendarCheck2, Gift } from 'lucide-react';
import { useAppState } from '@/contexts/app-state-provider';
import { useState, useEffect, useMemo } from 'react';
import { getAppointments, getProfessionals, getProfessionalAvailabilityForDate } from '@/lib/data';
import { startOfDay, endOfDay, startOfMonth, endOfMonth, nextSunday, isToday, addDays, differenceInDays, getYear, getMonth, getDate } from 'date-fns';
import { StatCard } from '@/components/dashboard/stat-card';
import { ActionCard } from '@/components/dashboard/action-card';
import { ProfessionalStatusTodayCard } from '@/components/dashboard/professional-status-today-card';
import { UpcomingBirthdaysCard } from '@/components/dashboard/upcoming-birthdays-card';


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
  const [professionalsOnRestToday, setProfessionalsOnRestToday] = useState<Professional[]>([]);
  const [professionalsWorkingNextSunday, setProfessionalsWorkingNextSunday] = useState<Professional[]>([]);
  const [professionalsWithUpcomingBirthdays, setProfessionalsWithUpcomingBirthdays] = useState<Professional[]>([]);
  const [isLoadingProfessionalStatus, setIsLoadingProfessionalStatus] = useState(true);
  const [isLoadingUpcomingBirthdays, setIsLoadingUpcomingBirthdays] = useState(true);


  const isAdminOrContador = user?.role === USER_ROLES.ADMIN || user?.role === USER_ROLES.CONTADOR;
  const isContador = user?.role === USER_ROLES.CONTADOR;
  
  const effectiveLocationId = isAdminOrContador 
    ? (selectedLocationId === 'all' ? undefined : selectedLocationId as LocationId) 
    : user?.locationId;


  useEffect(() => {
    const fetchDashboardData = async () => {
      if (!user) return;

      setIsLoadingStats(true);
      setIsLoadingProfessionalStatus(true);
      setIsLoadingUpcomingBirthdays(true);

      let todayAppointmentsCount = 0;
      let pendingConfirmationsCount = 0;
      let activeProfessionalsCount = 0;
      let totalRevenueMonthValue = 0;
      
      const today = startOfDay(new Date());
      const currentMonthStart = startOfMonth(today);
      const currentMonthEnd = endOfMonth(today);

      try {
        // Fetch Today's Appointments
        if (isAdminOrContador || user.role === USER_ROLES.LOCATION_STAFF) { 
          if (selectedLocationId === 'all' && (isAdminOrContador)) {
            const allLocationsAppointmentsPromises = LOCATIONS.map(loc => getAppointments({ date: today, locationId: loc.id, statuses: [APPOINTMENT_STATUS.BOOKED, APPOINTMENT_STATUS.CONFIRMED] }));
            const allLocationsAppointmentsResults = await Promise.all(allLocationsAppointmentsPromises);
            todayAppointmentsCount = allLocationsAppointmentsResults.reduce((sum, result) => sum + (result.appointments ? result.appointments.length : 0), 0);
          } else if (selectedLocationId && selectedLocationId !== 'all' && (isAdminOrContador || user.locationId === selectedLocationId)) {
            const locationAppointments = await getAppointments({ date: today, locationId: selectedLocationId as LocationId, statuses: [APPOINTMENT_STATUS.BOOKED, APPOINTMENT_STATUS.CONFIRMED] });
            todayAppointmentsCount = locationAppointments.appointments ? locationAppointments.appointments.length : 0;
          } else if (user.role === USER_ROLES.LOCATION_STAFF && user.locationId) {
            const locationAppointments = await getAppointments({ date: today, locationId: user.locationId, statuses: [APPOINTMENT_STATUS.BOOKED, APPOINTMENT_STATUS.CONFIRMED] });
            todayAppointmentsCount = locationAppointments.appointments ? locationAppointments.appointments.length : 0;
          }
        }

        // Fetch Pending Confirmations (Booked appointments across all dates)
        if (isAdminOrContador || user.role === USER_ROLES.LOCATION_STAFF) { 
          if (selectedLocationId === 'all' && (isAdminOrContador)) {
             const allLocationsPendingPromises = LOCATIONS.map(loc => getAppointments({ statuses: [APPOINTMENT_STATUS.BOOKED], locationId: loc.id }));
             const allLocationsPendingResults = await Promise.all(allLocationsPendingPromises);
             pendingConfirmationsCount = allLocationsPendingResults.reduce((sum, result) => sum + (result.appointments ? result.appointments.length : 0), 0);
          } else if (selectedLocationId && selectedLocationId !== 'all' && (isAdminOrContador || user.locationId === selectedLocationId)) {
            const bookedAppointments = await getAppointments({ statuses: [APPOINTMENT_STATUS.BOOKED], locationId: selectedLocationId as LocationId });
            pendingConfirmationsCount = bookedAppointments.appointments ? bookedAppointments.appointments.length : 0;
          } else if (user.role === USER_ROLES.LOCATION_STAFF && user.locationId) {
            const bookedAppointments = await getAppointments({ statuses: [APPOINTMENT_STATUS.BOOKED], locationId: user.locationId });
            pendingConfirmationsCount = bookedAppointments.appointments ? bookedAppointments.appointments.length : 0;
          }
        }
        
        // Fetch Total Revenue for Current Month (ONLY FOR CONTADOR)
        if (isContador) {
          if (selectedLocationId === 'all') {
            const allLocationsCompletedPromises = LOCATIONS.map(loc => getAppointments({
              statuses: [APPOINTMENT_STATUS.COMPLETED],
              locationId: loc.id,
              dateRange: { start: currentMonthStart, end: currentMonthEnd },
            }));
            const allLocationsCompletedResults = await Promise.all(allLocationsCompletedPromises);
            totalRevenueMonthValue = allLocationsCompletedResults.reduce((totalSum, locationResults) => 
              totalSum + (locationResults.appointments ? locationResults.appointments.reduce((locationSum, appt) => locationSum + (appt.amountPaid || 0), 0) : 0), 
            0);
          } else if (selectedLocationId && selectedLocationId !== 'all') {
            const completedAppointmentsMonth = await getAppointments({
              statuses: [APPOINTMENT_STATUS.COMPLETED],
              locationId: selectedLocationId as LocationId,
              dateRange: { start: currentMonthStart, end: currentMonthEnd },
            });
            totalRevenueMonthValue = completedAppointmentsMonth.appointments ? completedAppointmentsMonth.appointments.reduce((sum, appt) => sum + (appt.amountPaid || 0), 0) : 0;
          }
        }

        // Fetch All Professionals for status checks and birthdays
        let allFetchedProfessionals: Professional[] = [];
        if (isAdminOrContador) {
            if (effectiveLocationId) { // Specific location or first location if 'all' was technically selected but page uses single view
                allFetchedProfessionals = await getProfessionals(effectiveLocationId);
            } else { // 'all' locations selected by admin/contador for overview
                const allProfsPromises = LOCATIONS.map(loc => getProfessionals(loc.id));
                const results = await Promise.all(allProfsPromises);
                allFetchedProfessionals = results.flat();
            }
        } else if (user?.role === USER_ROLES.LOCATION_STAFF && user.locationId) {
            allFetchedProfessionals = await getProfessionals(user.locationId);
        }
        
        activeProfessionalsCount = allFetchedProfessionals.filter(prof => {
          const availability = getProfessionalAvailabilityForDate(prof, today);
          return !!availability;
        }).length;

        setStats({
          todayAppointments: todayAppointmentsCount.toString(),
          pendingConfirmations: pendingConfirmationsCount.toString(),
          activeProfessionals: activeProfessionalsCount.toString(),
          totalRevenueMonth: totalRevenueMonthValue.toFixed(2),
        });
        setIsLoadingStats(false);

        // Professional Status for today and next Sunday
        const restingToday: Professional[] = [];
        const workingNextSundayDate = nextSunday(today);
        const workingNextSunday: Professional[] = [];
        const upcomingBirthdaysList: Professional[] = [];
        const todayDate = getDate(today);
        const todayMonth = getMonth(today) + 1; // 1-indexed for comparison

        for (const prof of allFetchedProfessionals) {
          const availabilityToday = getProfessionalAvailabilityForDate(prof, today);
          if (!availabilityToday) {
            restingToday.push(prof);
          }

          const availabilityNextSunday = getProfessionalAvailabilityForDate(prof, workingNextSundayDate);
          if (availabilityNextSunday) {
            workingNextSunday.push(prof);
          }

          // Upcoming Birthdays Logic
          if (prof.birthDay && prof.birthMonth) {
            const currentYear = getYear(today);
            let nextBirthdayThisYear = new Date(currentYear, prof.birthMonth - 1, prof.birthDay);
            if (nextBirthdayThisYear < today) { // Birthday already passed this year
              nextBirthdayThisYear = new Date(currentYear + 1, prof.birthMonth - 1, prof.birthDay);
            }
            const daysToBirthday = differenceInDays(nextBirthdayThisYear, today);
            if (daysToBirthday >= 0 && daysToBirthday <= 15) {
              upcomingBirthdaysList.push(prof);
            }
          }
        }
        setProfessionalsOnRestToday(restingToday.sort((a,b) => `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`)));
        setProfessionalsWorkingNextSunday(workingNextSunday.sort((a,b) => `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`)));
        setProfessionalsWithUpcomingBirthdays(upcomingBirthdaysList.sort((a,b) => {
          // Sort by how soon the birthday is
          const dateA = new Date(getYear(today), (a.birthMonth || 1) -1, a.birthDay || 1);
          const dateB = new Date(getYear(today), (b.birthMonth || 1) -1, b.birthDay || 1);
          if (dateA < today) dateA.setFullYear(getYear(today) + 1);
          if (dateB < today) dateB.setFullYear(getYear(today) + 1);
          return dateA.getTime() - dateB.getTime();
        }));

      } catch (error) {
        console.error("Failed to fetch dashboard data:", error);
        setStats({
            todayAppointments: "N/A",
            pendingConfirmations: "N/A",
            activeProfessionals: "N/A",
            totalRevenueMonth: "N/A",
        });
        setProfessionalsOnRestToday([]);
        setProfessionalsWorkingNextSunday([]);
        setProfessionalsWithUpcomingBirthdays([]);
      } finally {
        setIsLoadingStats(false);
        setIsLoadingProfessionalStatus(false);
        setIsLoadingUpcomingBirthdays(false);
      }
    };

    fetchDashboardData();
  }, [user, selectedLocationId, effectiveLocationId, isAdminOrContador, isContador]);


  if (!user) {
    return null; 
  }

  const greetingName = user.name || user.username;
  let roleDescription = '';
  if (user.role === USER_ROLES.ADMIN) roleDescription = 'Administrador Global';
  else if (user.role === USER_ROLES.CONTADOR) roleDescription = 'Contador Principal';
  else roleDescription = `Staff de ${LOCATIONS.find(l => l.id === user.locationId)?.name || 'Sede'}`;


  let displayLocationName = "Todas las Sedes";
  if (user.role === USER_ROLES.LOCATION_STAFF && user.locationId) {
    displayLocationName = LOCATIONS.find(l => l.id === user.locationId)?.name || "Tu Sede";
  } else if ((isAdminOrContador) && selectedLocationId && selectedLocationId !== 'all') {
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
          title="Profesionales Activos Hoy" 
          value={isLoadingStats ? "..." : stats.activeProfessionals} 
          icon={<Briefcase className="h-6 w-6 text-primary" />} 
        />
        {user.role === USER_ROLES.CONTADOR && (
          <StatCard 
            title="Ingresos del Mes" 
            value={isLoadingStats ? "..." : `S/ ${stats.totalRevenueMonth}`} 
            icon={<History className="h-6 w-6 text-primary" />} 
          />
        )}
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 mb-8"> {/* Adjusted grid for new card */}
        <ProfessionalStatusTodayCard
            title="Profesionales Descansando Hoy"
            professionals={professionalsOnRestToday}
            isLoading={isLoadingProfessionalStatus}
            icon={<Bed className="h-6 w-6 text-primary" />}
            emptyMessage="Todos los profesionales están activos hoy."
        />
        <ProfessionalStatusTodayCard
            title={`Profesionales Trabajando Próximo Domingo`}
            professionals={professionalsWorkingNextSunday}
            isLoading={isLoadingProfessionalStatus}
            icon={<CalendarCheck2 className="h-6 w-6 text-primary" />}
            emptyMessage="Ningún profesional programado para el próximo domingo."
        />
        <UpcomingBirthdaysCard
            title="Próximos Cumpleaños (15 días)"
            professionals={professionalsWithUpcomingBirthdays}
            isLoading={isLoadingUpcomingBirthdays}
            icon={<Gift className="h-6 w-6 text-primary" />}
            emptyMessage="No hay cumpleaños en los próximos 15 días."
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
            src="https://placehold.co/600x300.png" 
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
