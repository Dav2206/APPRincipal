
"use client";

import type { PeriodicReminder } from '@/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, AlertTriangle, CalendarClock, DollarSign } from 'lucide-react';
import { format, parseISO, isPast } from 'date-fns';
import { es } from 'date-fns/locale';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface UpcomingRemindersCardProps {
  title: string;
  overdueReminders: PeriodicReminder[];
  upcomingReminders: PeriodicReminder[];
  isLoading: boolean;
  icon: React.ReactNode;
  emptyMessage?: string;
}

const ReminderItem = ({ reminder }: { reminder: PeriodicReminder }) => {
  const dueDate = parseISO(reminder.dueDate);
  const isOverdue = isPast(dueDate) && reminder.status === 'pending';
  return (
    <li className={cn("flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 p-2 rounded-md hover:bg-muted/50 transition-colors", isOverdue && "bg-destructive/10")}>
      <div className="flex-grow">
        <p className={cn("text-xs font-medium leading-tight", isOverdue && "text-destructive")}>{reminder.title}</p>
        <p className={cn("text-xs text-muted-foreground", isOverdue && "text-destructive/80")}>
          Vence: {format(dueDate, "PPP", { locale: es })}
        </p>
      </div>
      <div className="flex items-center gap-2 mt-1 sm:mt-0">
        {reminder.amount && (
          <Badge variant="outline" className="text-xs h-fit">
            <DollarSign size={12} className="mr-1" /> S/ {reminder.amount.toFixed(2)}
          </Badge>
        )}
        {isOverdue && <Badge variant="destructive" className="text-xs h-fit">Vencido</Badge>}
      </div>
    </li>
  );
};

export function UpcomingRemindersCard({
  title,
  overdueReminders,
  upcomingReminders,
  isLoading,
  icon,
  emptyMessage = "No hay alertas de pagos pendientes."
}: UpcomingRemindersCardProps) {
  return (
    <Card className="col-span-1 md:col-span-2 lg:col-span-2 shadow-md">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        {icon}
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex justify-center items-center h-32">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : (overdueReminders.length === 0 && upcomingReminders.length === 0) ? (
          <p className="text-xs text-muted-foreground text-center py-4">{emptyMessage}</p>
        ) : (
          <ScrollArea className="h-48">
            {overdueReminders.length > 0 && (
              <div className="mb-3">
                <h4 className="text-xs font-semibold text-destructive mb-1 flex items-center gap-1"><AlertTriangle size={14}/> Vencidos</h4>
                <ul className="space-y-1">
                  {overdueReminders.map(reminder => <ReminderItem key={`overdue-${reminder.id}`} reminder={reminder} />)}
                </ul>
              </div>
            )}
            {upcomingReminders.length > 0 && (
              <div>
                <h4 className="text-xs font-semibold text-amber-600 mb-1 flex items-center gap-1"><CalendarClock size={14}/> Próximos a Vencer (4 días)</h4>
                <ul className="space-y-1">
                  {upcomingReminders.map(reminder => <ReminderItem key={`upcoming-${reminder.id}`} reminder={reminder} />)}
                </ul>
              </div>
            )}
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
