
"use client";

import type { ImportantNote } from '@/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, StickyNote } from 'lucide-react';
import Link from 'next/link';
import { Button } from '../ui/button';

interface ImportantNotesCardProps {
  title: string;
  notes: ImportantNote[];
  isLoading: boolean;
  icon: React.ReactNode;
  emptyMessage?: string;
}

export function ImportantNotesCard({
  title,
  notes,
  isLoading,
  icon,
  emptyMessage = "No hay notas importantes."
}: ImportantNotesCardProps) {
  return (
    <Card className="shadow-md">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        {icon}
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex justify-center items-center h-32">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : notes.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-4">{emptyMessage}</p>
        ) : (
          <ScrollArea className="h-48">
            <ul className="space-y-3">
              {notes.map(note => (
                <li key={note.id} className="flex flex-col p-2 rounded-md hover:bg-muted/50 transition-colors border-b last:border-b-0">
                  <p className="text-xs font-semibold leading-tight">{note.title}</p>
                  <p className="text-xs text-muted-foreground truncate mt-0.5" title={note.content}>
                    {note.content.substring(0, 100)}{note.content.length > 100 ? "..." : ""}
                  </p>
                </li>
              ))}
            </ul>
          </ScrollArea>
        )}
        <div className="mt-3 text-right">
            <Button variant="link" size="sm" asChild className="text-xs">
                <Link href="/pagos?tab=expenses">Ver todas las notas...</Link>
            </Button>
        </div>
      </CardContent>
    </Card>
  );
}
