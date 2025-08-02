"use client";

import type { Professional, Location } from '@/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Loader2, Gift } from 'lucide-react';
import { format, parse } from 'date-fns';
import { es } from 'date-fns/locale';

interface UpcomingBirthdaysCardProps {
  title: string;
  professionals: Professional[];
  isLoading: boolean;
  icon: React.ReactNode;
  emptyMessage?: string;
  locations: Location[];
}

const getInitials = (name: string = "") => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase() || 'P';
}

const MONTH_NAMES_SHORT = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

export function UpcomingBirthdaysCard({ title, professionals, isLoading, icon, emptyMessage = "No hay cumpleaños próximos.", locations }: UpcomingBirthdaysCardProps) {
  return (
    <Card className="col-span-1 md:col-span-2 lg:col-span-2 shadow-md"> {/* Ajusta el col-span según sea necesario */}
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        {icon}
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex justify-center items-center h-32">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : professionals.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-4">{emptyMessage}</p>
        ) : (
          <ScrollArea className="h-48"> {/* Altura ajustable */}
            <ul className="space-y-2">
              {professionals.map(prof => (
                <li key={prof.id} className="flex items-center justify-between gap-3 p-2 rounded-md hover:bg-muted/50 transition-colors">
                  <div className="flex items-center gap-3">
                    <Avatar className="h-8 w-8">
                      <AvatarImage src={`https://picsum.photos/seed/${prof.id}/40/40`} alt={`${prof.firstName} ${prof.lastName} avatar`} />
                      <AvatarFallback>{getInitials(`${prof.firstName} ${prof.lastName}`)}</AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="text-xs font-medium leading-none">{prof.firstName} {prof.lastName}</p>
                      <p className="text-xs text-muted-foreground">{locations.find(l => l.id === prof.locationId)?.name || 'Sede Desconocida'}</p>
                    </div>
                  </div>
                  {prof.birthDay && prof.birthMonth && (
                    <div className="text-xs text-primary font-medium">
                      {prof.birthDay} {MONTH_NAMES_SHORT[prof.birthMonth -1]}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
