"use client";

import React, { useState, useEffect, useCallback } from 'react';
import type { Patient } from '@/types';
import { getPatients } from '@/lib/data'; // Mock data access
import { Input } from '@/components/ui/input';
import { Command, CommandInput, CommandItem, CommandList, CommandEmpty, CommandGroup } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Check, ChevronsUpDown, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface PatientSearchFieldProps {
  onPatientSelect: (patient: Patient | null) => void; // null for new patient
  selectedPatientId?: string | null;
  onClear?: () => void; // Callback when explicitly clearing selection
}

export function PatientSearchField({ onPatientSelect, selectedPatientId, onClear }: PatientSearchFieldProps) {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [popoverOpen, setPopoverOpen] = useState(false);

  useEffect(() => {
    async function fetchPatients() {
      const allPatients = await getPatients();
      setPatients(allPatients);
    }
    fetchPatients();
  }, []);
  
  useEffect(() => {
    if (selectedPatientId) {
      const patient = patients.find(p => p.id === selectedPatientId);
      setSelectedPatient(patient || null);
    } else {
      setSelectedPatient(null);
    }
  }, [selectedPatientId, patients]);


  const handleSelect = (patient: Patient | "new-patient") => {
    if (patient === "new-patient") {
      setSelectedPatient(null);
      onPatientSelect(null);
      setSearchTerm('');
    } else {
      setSelectedPatient(patient);
      onPatientSelect(patient);
      setSearchTerm(`${patient.firstName} ${patient.lastName}`);
    }
    setPopoverOpen(false);
  };
  
  const handleClear = () => {
    setSelectedPatient(null);
    setSearchTerm('');
    onPatientSelect(null); // Notify parent that it's a new patient potentially
    if (onClear) onClear(); // Specific clear callback
    setPopoverOpen(false);
  };

  const filteredPatients = searchTerm
    ? patients.filter(p =>
        `${p.firstName} ${p.lastName}`.toLowerCase().includes(searchTerm.toLowerCase())
      )
    : patients;

  return (
    <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={popoverOpen}
          className="w-full justify-between"
        >
          {selectedPatient
            ? `${selectedPatient.firstName} ${selectedPatient.lastName}`
            : "Seleccionar paciente existente o nuevo"}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
        <Command shouldFilter={false}>
          <CommandInput 
            placeholder="Buscar paciente..."
            value={searchTerm}
            onValueChange={setSearchTerm}
          />
          <CommandList>
            <CommandEmpty>
              {searchTerm ? "No se encontró paciente. Puede ser nuevo." : "Escriba para buscar..."}
            </CommandEmpty>
            <CommandGroup>
              <CommandItem
                  key="new-patient"
                  value="new-patient"
                  onSelect={() => handleSelect("new-patient")}
                  className="cursor-pointer"
                >
                  <UserPlus className={cn("mr-2 h-4 w-4")} />
                  Registrar Nuevo Paciente
              </CommandItem>
              {filteredPatients.slice(0, 5).map((patient) => (
                <CommandItem
                  key={patient.id}
                  value={`${patient.firstName} ${patient.lastName}`}
                  onSelect={() => handleSelect(patient)}
                  className="cursor-pointer"
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      selectedPatient?.id === patient.id ? "opacity-100" : "opacity-0"
                    )}
                  />
                  {patient.firstName} {patient.lastName} ({patient.phone || 'N/A'})
                </CommandItem>
              ))}
            </CommandGroup>
            {selectedPatient && (
               <CommandItem onSelect={handleClear} className="cursor-pointer text-destructive">
                  Limpiar selección (Registrar como nuevo)
                </CommandItem>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
