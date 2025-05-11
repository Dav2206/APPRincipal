
"use client";

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

interface ActionCardProps {
  title: string;
  description: string;
  href: string;
  icon: React.ReactNode;
}

const ActionCardComponent = ({ title, description, href, icon }: ActionCardProps) => {
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

export const ActionCard = React.memo(ActionCardComponent);
