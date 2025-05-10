"use client";

import type { LocationId } from '@/lib/constants';
import React, { createContext, useContext, useState, ReactNode } from 'react';
import { LOCATIONS } from '@/lib/constants';

interface AppStateContextType {
  selectedLocationId: LocationId | 'all' | null; // 'all' for admin overview
  setSelectedLocationId: (locationId: LocationId | 'all' | null) => void;
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
}

const AppStateContext = createContext<AppStateContextType | undefined>(undefined);

export const AppStateProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [selectedLocationId, setSelectedLocationId] = useState<LocationId | 'all' | null>(LOCATIONS[0].id); // Default to first location or null
  const [sidebarOpen, setSidebarOpen] = useState(true);


  return (
    <AppStateContext.Provider value={{ 
      selectedLocationId, 
      setSelectedLocationId,
      sidebarOpen,
      setSidebarOpen 
    }}>
      {children}
    </AppStateContext.Provider>
  );
};

export const useAppState = (): AppStateContextType => {
  const context = useContext(AppStateContext);
  if (context === undefined) {
    throw new Error('useAppState must be used within an AppStateProvider');
  }
  return context;
};
