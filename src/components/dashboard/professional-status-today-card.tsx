
"use client";

import React from 'react';
import type { Professional } from '@/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Loader2 } from 'lucide-react';
import { LOCATIONS } from '@/lib/constants';

interface ProfessionalStatusTodayCardProps {
  title: string;
  professionals: Professional[];
  isLoading: boolean;
  icon: React.ReactNode;
  emptyMessage?: string;
}

const getInitials = (name: string = "") => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase() || 'P';
}

export function ProfessionalStatusTodayCard({ title, professionals, isLoading, icon, emptyMessage = "No hay profesionales para mostrar." }: ProfessionalStatusTodayCardProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        {icon}
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex justify-center items-center h-24">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : professionals.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-4">{emptyMessage}</p>
        ) : (
          <ScrollArea className="h-40">
            <ul className="space-y-2">
              {professionals.map(prof => (
                <li key={prof.id} className="flex items-center gap-3 p-2 rounded-md hover:bg-muted/50 transition-colors">
                  <Avatar className="h-8 w-8">
                    <AvatarImage src={`https://picsum.photos/seed/${prof.id}/40/40`} alt={`${prof.firstName} ${prof.lastName} avatar`} />
                    <AvatarFallback>{getInitials(prof.firstName)}</AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="text-xs font-medium leading-none">{prof.firstName} {prof.lastName}</p>
                    <p className="text-xs text-muted-foreground">{LOCATIONS.find(l => l.id === prof.locationId)?.name || 'Sede Desconocida'}</p>
                  </div>
                </li>
              ))}
            </ul>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
