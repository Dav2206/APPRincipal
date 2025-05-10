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
} from 'lucide-react';
import { USER_ROLES } from '@/lib/constants';

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, roles: [USER_ROLES.ADMIN, USER_ROLES.LOCATION_STAFF] },
  { href: '/appointments', label: 'Citas', icon: CalendarDays, roles: [USER_ROLES.ADMIN, USER_ROLES.LOCATION_STAFF] },
  { href: '/history', label: 'Historial', icon: History, roles: [USER_ROLES.ADMIN, USER_ROLES.LOCATION_STAFF] },
  { href: '/patients', label: 'Pacientes', icon: Users, roles: [USER_ROLES.ADMIN, USER_ROLES.LOCATION_STAFF] },
  { href: '/professionals', label: 'Profesionales', icon: Briefcase, roles: [USER_ROLES.ADMIN, USER_ROLES.LOCATION_STAFF] },
];

export function AppSidebar() {
  const pathname = usePathname();
  const { user } = useAuth();
  const { sidebarOpen, setSidebarOpen } = useAppState();

  if (!user) return null;

  const filteredNavItems = navItems.filter(item => item.roles.includes(user.role));
  
  const commonSidebarClass = "fixed inset-y-0 left-0 z-40 flex h-full flex-col border-r bg-sidebar text-sidebar-foreground transition-transform duration-300 ease-in-out md:static md:translate-x-0";
  const openSidebarClass = "translate-x-0";
  const closedSidebarClass = "-translate-x-full";


  return (
    <>
      {/* Overlay for mobile */}
      {sidebarOpen && (
        <div 
          onClick={() => setSidebarOpen(false)}
          className="fixed inset-0 z-30 bg-black/50 md:hidden" 
          aria-hidden="true"
        />
      )}
      <aside className={cn(commonSidebarClass, sidebarOpen ? openSidebarClass : closedSidebarClass, "w-64")}>
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
              const isActive = pathname === href || (href !== '/dashboard' && pathname.startsWith(href));
              return (
                <Link
                  key={href}
                  href={href}
                  onClick={() => { if (window.innerWidth < 768) setSidebarOpen(false);}} // Close sidebar on mobile nav
                  className={cn(
                    'flex items-center gap-3 rounded-lg px-3 py-2 transition-all hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
                    isActive ? 'bg-sidebar-accent text-sidebar-accent-foreground font-semibold' : 'text-sidebar-foreground'
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
          {/* Can add user profile quick view or settings link here later */}
          <p className="text-xs text-muted-foreground">© 2024 Footprints Scheduler</p>
        </div>
      </aside>
    </>
  );
}
