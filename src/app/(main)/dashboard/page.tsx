
"use client";

import type { PeriodicReminder, ImportantNote, Location } from '@/types';
import { useAuth } from '@/contexts/auth-provider';
import { USER_ROLES, LocationId, APPOINTMENT_STATUS, DAYS_OF_WEEK } from '@/lib/constants';
import type { Professional } from '@/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import Link from 'next/link';
import { CalendarPlus, Users, History, Briefcase, Loader2, Bed, CalendarCheck2, Gift, Bell, StickyNote, Trash2, Download } from 'lucide-react';
import { useAppState } from '@/contexts/app-state-provider';
import { useState, useEffect, useMemo } from 'react';
import { getAppointments, getProfessionals, getProfessionalAvailabilityForDate, getPeriodicReminders, getImportantNotes, getContractDisplayStatus, getLocations, cleanupOrphanedTravelBlocks } from '@/lib/data';
import { startOfDay, endOfDay, startOfMonth, endOfMonth, nextSunday, isToday, addDays, differenceInDays, getYear, getMonth, getDate, parseISO, isBefore } from 'date-fns';
import { StatCard } from '@/components/dashboard/stat-card';
import { ActionCard } from '@/components/dashboard/action-card';
import { ProfessionalStatusTodayCard } from '@/components/dashboard/professional-status-today-card';
import { UpcomingBirthdaysCard } from '@/components/dashboard/upcoming-birthdays-card';
import { UpcomingRemindersCard } from '@/components/dashboard/upcoming-reminders-card';
import { ImportantNotesCard } from '@/components/dashboard/important-notes-card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { buttonVariants } from '@/components/ui/button';


interface DashboardStats {
  todayAppointments: string;
  pendingConfirmations: string;
  activeProfessionals: string;
  totalRevenueMonth: string;
}

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: Array<string>;
  readonly userChoice: Promise<{
    outcome: 'accepted' | 'dismissed',
    platform: string,
  }>;
  prompt(): Promise<void>;
}


export default function DashboardPage() {
  const { user } = useAuth();
  const { selectedLocationId } = useAppState();
  const [locations, setLocations] = useState<Location[]>([]);
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
  const [overdueReminders, setOverdueReminders] = useState<PeriodicReminder[]>([]);
  const [upcomingRemindersNext4Days, setUpcomingRemindersNext4Days] = useState<PeriodicReminder[]>([]);
  const [recentImportantNotes, setRecentImportantNotes] = useState<ImportantNote[]>([]);
  const [isLoadingProfessionalStatus, setIsLoadingProfessionalStatus] = useState(true);
  const [isLoadingUpcomingBirthdays, setIsLoadingUpcomingBirthdays] = useState(true);
  const [isLoadingReminders, setIsLoadingReminders] = useState(true);
  const [isLoadingImportantNotes, setIsLoadingImportantNotes] = useState(true);
  const [isCleaningBlocks, setIsCleaningBlocks] = useState(false);
  const [installPromptEvent, setInstallPromptEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const { toast } = useToast();


  const isAdminOrContador = user?.role === USER_ROLES.ADMIN || user?.role === USER_ROLES.CONTADOR;
  const isAdmin = user?.role === USER_ROLES.ADMIN;
  const isContador = user?.role === USER_ROLES.CONTADOR;
  
  const effectiveLocationId = isAdminOrContador 
    ? (selectedLocationId === 'all' ? undefined : selectedLocationId as LocationId) 
    : user?.locationId;
  
  useEffect(() => {
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setInstallPromptEvent(e as BeforeInstallPromptEvent);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstallClick = () => {
    if (installPromptEvent) {
      installPromptEvent.prompt();
      installPromptEvent.userChoice.then((choiceResult) => {
        if (choiceResult.outcome === 'accepted') {
          toast({ title: "Instalación completa", description: "La aplicación se ha instalado en tu dispositivo." });
        } else {
          toast({ title: "Instalación cancelada", description: "Puedes instalar la aplicación más tarde desde aquí." });
        }
        setInstallPromptEvent(null);
      });
    }
  };


  useEffect(() => {
    async function loadLocations() {
      const fetchedLocations = await getLocations();
      setLocations(fetchedLocations);
    }
    loadLocations();
  }, []);


  useEffect(() => {
    const fetchDashboardData = async () => {
      if (!user || locations.length === 0) return;

      setIsLoadingStats(true);
      setIsLoadingProfessionalStatus(true);
      setIsLoadingUpcomingBirthdays(true);
      if (isAdminOrContador) {
        setIsLoadingReminders(true);
        setIsLoadingImportantNotes(true);
      }

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
            const allLocationsAppointmentsPromises = locations.map(loc => getAppointments({ date: today, locationId: loc.id, statuses: [APPOINTMENT_STATUS.BOOKED, APPOINTMENT_STATUS.CONFIRMED] }));
            const allLocationsAppointmentsResults = await Promise.all(allLocationsAppointmentsPromises);
            todayAppointmentsCount = allLocationsAppointmentsResults.reduce((sum, result) => sum + (result.appointments ? result.appointments.length : 0), 0);
          } else if (effectiveLocationId) { // Covers Admin/Contador with specific sede AND Staff
            const { appointments } = await getAppointments({ date: today, locationId: effectiveLocationId, statuses: [APPOINTMENT_STATUS.BOOKED, APPOINTMENT_STATUS.CONFIRMED] });
            todayAppointmentsCount = appointments ? appointments.length : 0;
          }
        }

        // Fetch Pending Confirmations (Booked appointments from today onwards)
        if (isAdminOrContador || user.role === USER_ROLES.LOCATION_STAFF) { 
          const pendingConfirmationOptions = {
              statuses: [APPOINTMENT_STATUS.BOOKED],
              dateRange: { start: today, end: addDays(today, 365*2) } // Search from today up to 2 years in the future
          };
          
          if (selectedLocationId === 'all' && (isAdminOrContador)) {
             const allLocationsPendingPromises = locations.map(loc => getAppointments({ ...pendingConfirmationOptions, locationId: loc.id }));
             const allLocationsPendingResults = await Promise.all(allLocationsPendingPromises);
             pendingConfirmationsCount = allLocationsPendingResults.reduce((sum, result) => sum + (result.appointments ? result.appointments.length : 0), 0);
          } else if (effectiveLocationId) { // Covers Admin/Contador with specific sede AND Staff
            const { appointments } = await getAppointments({ ...pendingConfirmationOptions, locationId: effectiveLocationId });
            pendingConfirmationsCount = appointments ? appointments.length : 0;
          }
        }
        
        // Fetch Total Revenue for Current Month (ONLY FOR CONTADOR)
        if (isContador) {
          if (selectedLocationId === 'all') {
            const allLocationsCompletedPromises = locations.map(loc => getAppointments({
              statuses: [APPOINTMENT_STATUS.COMPLETED],
              locationId: loc.id,
              dateRange: { start: currentMonthStart, end: currentMonthEnd },
            }));
            const allLocationsCompletedResults = await Promise.all(allLocationsCompletedPromises);
            totalRevenueMonthValue = allLocationsCompletedResults.reduce((totalSum, locationResults) => 
              totalSum + (locationResults.appointments ? locationResults.appointments.reduce((locationSum, appt) => locationSum + (appt.amountPaid || 0), 0) : 0), 
            0);
          } else if (effectiveLocationId) {
            const { appointments } = await getAppointments({
              statuses: [APPOINTMENT_STATUS.COMPLETED],
              locationId: effectiveLocationId,
              dateRange: { start: currentMonthStart, end: currentMonthEnd },
            });
            totalRevenueMonthValue = appointments ? appointments.reduce((sum, appt) => sum + (appt.amountPaid || 0), 0) : 0;
          }
        }

        // Fetch All Professionals for status checks and birthdays
        let allFetchedProfessionals: Professional[] = [];
        if (isAdminOrContador) {
            if (effectiveLocationId) { 
                allFetchedProfessionals = await getProfessionals(effectiveLocationId);
            } else { 
                const allProfsPromises = locations.map(loc => getProfessionals(loc.id));
                const results = await Promise.all(allProfsPromises);
                allFetchedProfessionals = results.flat();
            }
        } else if (user?.role === USER_ROLES.LOCATION_STAFF && user.locationId) {
            allFetchedProfessionals = await getProfessionals(user.locationId);
        }
        
        activeProfessionalsCount = allFetchedProfessionals.filter(prof => {
          const availability = getProfessionalAvailabilityForDate(prof, today);
          const contractStatus = getContractDisplayStatus(prof.currentContract, today);
          // Consider active if they have availability (isWorking) and contract is active or próximo a vencer
          return !!availability && availability.isWorking && (contractStatus === 'Activo' || contractStatus === 'Próximo a Vencer');
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
        
        for (const prof of allFetchedProfessionals) {
          const availabilityToday = getProfessionalAvailabilityForDate(prof, today);
          const contractStatusToday = getContractDisplayStatus(prof.currentContract, today);

          if (!(availabilityToday && availabilityToday.isWorking && (contractStatusToday === 'Activo' || contractStatusToday === 'Próximo a Vencer'))) {
            restingToday.push(prof);
          }

          const availabilityNextSunday = getProfessionalAvailabilityForDate(prof, workingNextSundayDate);
          const contractStatusNextSunday = getContractDisplayStatus(prof.currentContract, workingNextSundayDate);
          if (availabilityNextSunday && availabilityNextSunday.isWorking && (contractStatusNextSunday === 'Activo' || contractStatusNextSunday === 'Próximo a Vencer')) {
            workingNextSunday.push(prof);
          }

          if (prof.birthDay && prof.birthMonth) {
            const currentYear = getYear(today);
            let nextBirthdayThisYear = new Date(currentYear, prof.birthMonth - 1, prof.birthDay);
            if (isBefore(nextBirthdayThisYear, today) && !isToday(nextBirthdayThisYear)) { 
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
          const dateA = new Date(getYear(today), (a.birthMonth || 1) -1, a.birthDay || 1);
          const dateB = new Date(getYear(today), (b.birthMonth || 1) -1, b.birthDay || 1);
          if (isBefore(dateA, today) && !isToday(dateA)) dateA.setFullYear(getYear(today) + 1);
          if (isBefore(dateB, today) && !isToday(dateB)) dateB.setFullYear(getYear(today) + 1);
          return dateA.getTime() - dateB.getTime();
        }));
        setIsLoadingProfessionalStatus(false);
        setIsLoadingUpcomingBirthdays(false);

        // Fetch Reminders and Notes for Admin/Contador
        if (isAdminOrContador) {
            const [allReminders, allImpNotes] = await Promise.all([
              getPeriodicReminders(),
              getImportantNotes()
            ]);

            const fourDaysFromToday = addDays(today, 4);
            const overdue = allReminders.filter(r => r.status === 'pending' && isBefore(parseISO(r.dueDate), today))
                                      .sort((a,b) => parseISO(a.dueDate).getTime() - parseISO(b.dueDate).getTime());
            const upcoming = allReminders.filter(r => {
                const dueDate = parseISO(r.dueDate);
                return r.status === 'pending' && !isBefore(dueDate, today) && dueDate <= fourDaysFromToday;
            }).sort((a,b) => parseISO(a.dueDate).getTime() - parseISO(b.dueDate).getTime());
            
            setOverdueReminders(overdue);
            setUpcomingRemindersNext4Days(upcoming);
            setIsLoadingReminders(false);

            setRecentImportantNotes(allImpNotes.sort((a, b) => parseISO(b.createdAt || '1970-01-01').getTime() - parseISO(a.createdAt || '1970-01-01').getTime()).slice(0, 3));
            setIsLoadingImportantNotes(false);
        }


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
        setOverdueReminders([]);
        setUpcomingRemindersNext4Days([]);
        setRecentImportantNotes([]);
      } finally {
        setIsLoadingStats(false);
        setIsLoadingProfessionalStatus(false);
        setIsLoadingUpcomingBirthdays(false);
        if (isAdminOrContador) {
          setIsLoadingReminders(false);
          setIsLoadingImportantNotes(false);
        }
      }
    };

    fetchDashboardData();
  }, [user, selectedLocationId, effectiveLocationId, isAdminOrContador, isContador, locations]);

  const handleCleanup = async () => {
    setIsCleaningBlocks(true);
    try {
      const count = await cleanupOrphanedTravelBlocks();
      toast({
        title: "Limpieza Completada",
        description: `Se han eliminado ${count} bloqueos de viaje huérfanos.`,
      });
    } catch (error) {
      console.error("Error during cleanup:", error);
      toast({
        title: "Error en la Limpieza",
        description: "No se pudo completar la operación de limpieza. Revise la consola para más detalles.",
        variant: "destructive",
      });
    } finally {
      setIsCleaningBlocks(false);
    }
  };


  if (!user) {
    return null; 
  }

  const greetingName = user.name || user.username;
  let roleDescription = '';
  if (user.role === USER_ROLES.ADMIN) {
    roleDescription = 'Administrador Global';
  } else if (user.role === USER_ROLES.CONTADOR) {
    roleDescription = 'Contador Principal';
  } else if (user.role === USER_ROLES.LOCATION_STAFF) {
    roleDescription = 'Staff de Sede';
  } else {
    roleDescription = 'Usuario'; // Fallback
  }

  let displayLocationName = "Vista Desconocida";
  if (user.role === USER_ROLES.LOCATION_STAFF) {
    if (user.locationId) {
      displayLocationName = locations.find(l => l.id === user.locationId)?.name || "Sede del Staff no Válida";
    } else {
      displayLocationName = "Staff sin Sede Asignada";
    }
  } else if (isAdminOrContador) {
    if (selectedLocationId === 'all' || !selectedLocationId) {
      displayLocationName = "Todas las Sedes";
    } else {
      displayLocationName = locations.find(l => l.id === selectedLocationId)?.name || "Sede Seleccionada no Válida";
    }
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

      <div className="grid gap-6 md:grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 mb-8">
        <ProfessionalStatusTodayCard
            title="Profesionales Descansando Hoy"
            professionals={professionalsOnRestToday}
            isLoading={isLoadingProfessionalStatus}
            icon={<Bed className="h-6 w-6 text-primary" />}
            emptyMessage="Todos los profesionales están activos hoy."
            locations={locations}
        />
        <ProfessionalStatusTodayCard
            title={`Profesionales Trabajando Próximo Domingo`}
            professionals={professionalsWorkingNextSunday}
            isLoading={isLoadingProfessionalStatus}
            icon={<CalendarCheck2 className="h-6 w-6 text-primary" />}
            emptyMessage="Ningún profesional programado para el próximo domingo."
            locations={locations}
        />
        <UpcomingBirthdaysCard
            title="Próximos Cumpleaños (15 días)"
            professionals={professionalsWithUpcomingBirthdays}
            isLoading={isLoadingUpcomingBirthdays}
            icon={<Gift className="h-6 w-6 text-primary" />}
            emptyMessage="No hay cumpleaños en los próximos 15 días."
            locations={locations}
        />
         {isAdminOrContador && (
          <UpcomingRemindersCard
            title="Alertas de Pagos"
            overdueReminders={overdueReminders}
            upcomingReminders={upcomingRemindersNext4Days}
            isLoading={isLoadingReminders}
            icon={<Bell className="h-6 w-6 text-primary" />}
            emptyMessage="No hay alertas de pagos pendientes."
          />
        )}
        {isAdminOrContador && (
          <ImportantNotesCard
            title="Notas Importantes Recientes"
            notes={recentImportantNotes}
            isLoading={isLoadingImportantNotes}
            icon={<StickyNote className="h-6 w-6 text-primary" />}
            emptyMessage="No hay notas importantes recientes."
          />
        )}
      </div>
      
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
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
         {installPromptEvent && (
          <Card>
            <CardHeader>
              <Download className="h-8 w-8 mb-2 text-primary" />
              <CardTitle>Instalar Aplicación</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">
                Instale la aplicación en su dispositivo para un acceso más rápido y una experiencia nativa.
              </p>
              <Button onClick={handleInstallClick} className="w-full">
                Instalar Ahora
              </Button>
            </CardContent>
          </Card>
        )}
         {isAdmin && (
           <Card>
            <CardHeader>
              <Trash2 className="h-8 w-8 mb-2 text-destructive" />
              <CardTitle>Mantenimiento</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">
                Elimina los bloques de viaje que ya no están vinculados a ninguna cita principal.
              </p>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="destructive" className="w-full" disabled={isCleaningBlocks}>
                      {isCleaningBlocks && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Limpiar Bloqueos Huérfanos
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>¿Confirmar Limpieza?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Esta acción buscará y eliminará permanentemente todos los bloques de viaje que no tengan una cita principal válida. Esta operación no se puede deshacer.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancelar</AlertDialogCancel>
                      <AlertDialogAction onClick={handleCleanup} disabled={isCleaningBlocks}>
                        {isCleaningBlocks && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Sí, limpiar ahora
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
            </CardContent>
           </Card>
        )}
      </div>

    </div>
  );
}
