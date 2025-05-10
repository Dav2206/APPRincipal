"use client";

import { useAuth } from '@/contexts/auth-provider';
import { useAppState } from '@/contexts/app-state-provider';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { LogOut, UserCircle, Settings, Footprints, PanelLeft } from 'lucide-react';
import Link from 'next/link';
import { LOCATIONS, USER_ROLES, LocationId } from '@/lib/constants';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';

export function AppHeader() {
  const { user, logout } = useAuth();
  const { selectedLocationId, setSelectedLocationId, setSidebarOpen, sidebarOpen } = useAppState();

  const getInitials = (name: string = "") => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase() || 'U';
  }

  const handleLocationChange = (value: string) => {
    setSelectedLocationId(value as LocationId | 'all');
  };

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-4 border-b bg-background px-4 md:px-6 shadow-sm">
      <div className="flex items-center gap-2">
         <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setSidebarOpen(!sidebarOpen)}>
            <PanelLeft className="h-6 w-6" />
            <span className="sr-only">Toggle Sidebar</span>
          </Button>
        <Link href="/dashboard" className="flex items-center gap-2 text-lg font-semibold text-primary md:text-base">
          <Footprints className="h-6 w-6" />
          <span className="sr-only sm:not-sr-only sm:whitespace-nowrap">Footprints Scheduler</span>
        </Link>
      </div>
      
      <div className="flex w-full items-center gap-4 md:ml-auto md:gap-2 lg:gap-4">
        <div className="ml-auto flex-1 sm:flex-initial">
          {user?.role === USER_ROLES.ADMIN && (
            <Select value={selectedLocationId || undefined} onValueChange={handleLocationChange}>
              <SelectTrigger className="w-full md:w-[180px]">
                <SelectValue placeholder="Seleccionar Sede" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas las Sedes</SelectItem>
                {LOCATIONS.map(loc => (
                  <SelectItem key={loc.id} value={loc.id}>{loc.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="rounded-full">
              <Avatar className="h-8 w-8">
                <AvatarImage src={`https://picsum.photos/seed/${user?.id}/40/40`} data-ai-hint="user avatar" />
                <AvatarFallback>{getInitials(user?.name)}</AvatarFallback>
              </Avatar>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel className="font-normal">
              <div className="flex flex-col space-y-1">
                <p className="text-sm font-medium leading-none">{user?.name || user?.username}</p>
                <p className="text-xs leading-none text-muted-foreground">
                  {user?.role === USER_ROLES.ADMIN ? 'Administrador' : `Staff ${LOCATIONS.find(l => l.id === user?.locationId)?.name || ''}`}
                </p>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem>
              <UserCircle className="mr-2 h-4 w-4" />
              <span>Perfil</span>
            </DropdownMenuItem>
            <DropdownMenuItem>
              <Settings className="mr-2 h-4 w-4" />
              <span>Configuración</span>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={logout} className="text-destructive focus:text-destructive focus:bg-destructive/10">
              <LogOut className="mr-2 h-4 w-4" />
              <span>Cerrar Sesión</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
