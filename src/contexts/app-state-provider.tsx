"use client";

import type { LocationId } from '@/lib/constants';
import React, { createContext, useContext, useState, ReactNode, useEffect } from 'react';
import { getLocations } from '@/lib/data';


interface AppStateContextType {
  selectedLocationId: LocationId | 'all' | null; // 'all' for admin overview
  setSelectedLocationId: (locationId: LocationId | 'all' | null) => void;
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
}

const AppStateContext = createContext<AppStateContextType | undefined>(undefined);

export const AppStateProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [selectedLocationId, setSelectedLocationId] = useState<LocationId | 'all' | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  
  useEffect(() => {
    // Set a default location once locations are fetched, to avoid null state on first load
    async function setDefaultLocation() {
        if(selectedLocationId === null) {
            try {
                const locations = await getLocations();
                if (locations && locations.length > 0) {
                    setSelectedLocationId(locations[0].id);
                } else {
                    setSelectedLocationId('all'); // Fallback if no locations found
                }
            } catch (error) {
                console.error("Failed to fetch locations to set default:", error);
                setSelectedLocationId('all'); // Fallback on error
            }
        }
    }
    setDefaultLocation();
  }, [selectedLocationId]);


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
