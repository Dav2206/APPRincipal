
"use client";

import type { LocationId } from '@/lib/constants';
import React, { createContext, useContext, useState, ReactNode, useEffect } from 'react';
import { getLocations } from '@/lib/data';


interface AppStateContextType {
  selectedLocationId: LocationId | 'all' | null; 
  setSelectedLocationId: (locationId: LocationId | 'all' | null) => void;
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  isScheduleBasicMode: boolean;
  setIsScheduleBasicMode: (isBasic: boolean) => void;
}

const AppStateContext = createContext<AppStateContextType | undefined>(undefined);

export const AppStateProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [selectedLocationId, setSelectedLocationId] = useState<LocationId | 'all' | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [isScheduleBasicMode, setIsScheduleBasicModeState] = useState(true); // Default to true

  useEffect(() => {
    // Load persisted basic mode setting
    const savedMode = localStorage.getItem('scheduleBasicMode');
    // Set to true if not found, otherwise use saved value
    setIsScheduleBasicModeState(savedMode === null ? true : savedMode === 'true');

    async function setDefaultLocation() {
        if(selectedLocationId === null) {
            try {
                const locations = await getLocations();
                if (locations && locations.length > 0) {
                    setSelectedLocationId(locations[0].id);
                } else {
                    setSelectedLocationId('all'); 
                }
            } catch (error) {
                console.error("Failed to fetch locations to set default:", error);
                setSelectedLocationId('all'); 
            }
        }
    }
    setDefaultLocation();
  }, []); 

  const setIsScheduleBasicMode = (isBasic: boolean) => {
    localStorage.setItem('scheduleBasicMode', String(isBasic));
    setIsScheduleBasicModeState(isBasic);
  };


  return (
    <AppStateContext.Provider value={{ 
      selectedLocationId, 
      setSelectedLocationId,
      sidebarOpen,
      setSidebarOpen,
      isScheduleBasicMode,
      setIsScheduleBasicMode,
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
