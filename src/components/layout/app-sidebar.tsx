
"use client";

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/contexts/auth-provider';
import { useAppState } from '@/contexts/app-state-provider';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import {
  LayoutDashboard,
  CalendarDays,
  History,
  Users,
  Briefcase,
  Footprints,
  PanelLeft,
  X,
  CalendarClock,
  Landmark, 
  ClipboardList, // Icon for Services
} from 'lucide-react';
import { USER_ROLES } from '@/lib/constants';

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, roles: [USER_ROLES.ADMIN, USER_ROLES.LOCATION_STAFF, USER_ROLES.CONTADOR] },
  { href: '/appointments', label: 'Citas del Día', icon: CalendarDays, roles: [USER_ROLES.ADMIN, USER_ROLES.LOCATION_STAFF, USER_ROLES.CONTADOR] },
  { href: '/schedule', label: 'Agenda Horaria', icon: CalendarClock, roles: [USER_ROLES.ADMIN, USER_ROLES.LOCATION_STAFF, USER_ROLES.CONTADOR] },
  { href: '/history', label: 'Historial', icon: History, roles: [USER_ROLES.ADMIN, USER_ROLES.LOCATION_STAFF, USER_ROLES.CONTADOR] },
  { href: '/patients', label: 'Pacientes', icon: Users, roles: [USER_ROLES.ADMIN, USER_ROLES.LOCATION_STAFF, USER_ROLES.CONTADOR] },
  { href: '/professionals', label: 'Profesionales', icon: Briefcase, roles: [USER_ROLES.ADMIN, USER_ROLES.CONTADOR] },
  { href: '/services', label: 'Servicios', icon: ClipboardList, roles: [USER_ROLES.ADMIN] }, // New Services link
  { href: '/finances', label: 'Finanzas', icon: Landmark, roles: [USER_ROLES.CONTADOR] },
];

export function AppSidebar() {
  const pathname = usePathname();
  const { user } = useAuth();
  const { sidebarOpen, setSidebarOpen } = useAppState();

  if (!user) return null;

  const filteredNavItems = navItems.filter(item => item.roles.includes(user.role));
  
  const commonSidebarClass = "fixed left-0 bottom-0 top-16 z-40 flex h-[calc(100vh-4rem)] w-64 flex-col border-r bg-sidebar text-sidebar-foreground transition-transform duration-300 ease-in-out md:static md:h-[calc(100vh-4rem)] md:translate-x-0";
  const openSidebarClass = "translate-x-0";
  const closedSidebarClass = "-translate-x-full";


  return (
    <>
      {/* Overlay for mobile, positioned below the header */}
      {sidebarOpen && (
        <div 
          onClick={() => setSidebarOpen(false)}
          className="fixed inset-0 top-16 z-30 bg-black/50 md:hidden" // Ensure it covers from top-16
          aria-hidden="true"
        />
      )}
      <aside className={cn(commonSidebarClass, sidebarOpen ? openSidebarClass : closedSidebarClass)}>
        <div className="flex h-16 items-center justify-between border-b px-4">
          <Link href="/dashboard" className="flex items-center gap-2 font-semibold text-sidebar-primary">
            <Footprints className="h-6 w-6" />
            <span>Footprints</span>
          </Link>
          <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setSidebarOpen(false)}>
            <X className="h-6 w-6" />
            <span className="sr-only">Cerrar sidebar</span>
          </Button>
        </div>
        <ScrollArea className="flex-1">
          <nav className="grid items-start gap-1 px-2 py-4 text-sm font-medium">
            {filteredNavItems.map(({ href, label, icon: Icon }) => {
              const isActive = pathname === href || (href !== '/dashboard' && pathname.startsWith(href) && href !== '/appointments' && href !=='/schedule' && href !== '/finances' && href !== '/services');
              // Special handling for specific pages to avoid multiple being active if path is similar
              const isAppointmentsActive = href === '/appointments' && (pathname === '/appointments' || pathname.startsWith('/appointments/'));
              const isScheduleActive = href === '/schedule' && (pathname === '/schedule' || pathname.startsWith('/schedule/'));
              const isFinancesActive = href === '/finances' && (pathname === '/finances' || pathname.startsWith('/finances/'));
              const isServicesActive = href === '/services' && (pathname === '/services' || pathname.startsWith('/services/'));
              
              let finalIsActive = isActive;
              if (href === '/appointments') finalIsActive = isAppointmentsActive;
              if (href === '/schedule') finalIsActive = isScheduleActive;
              if (href === '/finances') finalIsActive = isFinancesActive;
              if (href === '/services') finalIsActive = isServicesActive;

              // Ensure dashboard is only active for exact match
              if (href === '/dashboard' && pathname !== '/dashboard') finalIsActive = false;


              return (
                <Link
                  key={href}
                  href={href}
                  onClick={() => { if (window.innerWidth < 768) setSidebarOpen(false);}} // Close sidebar on mobile nav
                  className={cn(
                    'flex items-center gap-3 rounded-lg px-3 py-2 transition-all hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
                    finalIsActive ? 'bg-sidebar-accent text-sidebar-accent-foreground font-semibold' : 'text-sidebar-foreground'
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {label}
                </Link>
              );
            })}
          </nav>
        </ScrollArea>
        <div className="mt-auto border-t p-4">
          <p className="text-xs text-muted-foreground">© 2024 Footprints Scheduler</p>
        </div>
      </aside>
    </>
  );
}
