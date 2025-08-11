
"use client";

import React, { useState, useEffect, useCallback } from 'react';
import type { Patient } from '@/types';
import { getPatients } from '@/lib/data';
import { Input } from '@/components/ui/input';
import { Command, CommandInput, CommandItem, CommandList, CommandEmpty, CommandGroup } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Check, ChevronsUpDown, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/auth-provider';
import { USER_ROLES } from '@/lib/constants';

interface PatientSearchFieldProps {
  onPatientSelect: (patient: Patient | null) => void;
  selectedPatientId?: string | null;
  disabled?: boolean;
}

export function PatientSearchField({ onPatientSelect, selectedPatientId, disabled }: PatientSearchFieldProps) {
  const { user } = useAuth();
  const [patients, setPatients] = useState<Patient[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [popoverOpen, setPopoverOpen] = useState(false);

  useEffect(() => {
    async function fetchPatientsData() {
      // Fetch all patients without pagination for the search field
      const result = await getPatients({ limit: 1000 }); // Fetch a large number or implement specific search endpoint
      setPatients(result.patients);
    }
    fetchPatientsData();
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
      setSelectedPatient(patient as Patient);
      onPatientSelect(patient as Patient);
      setSearchTerm(`${(patient as Patient).firstName} ${(patient as Patient).lastName}`);
    }
    setPopoverOpen(false);
  };
  

  const filteredPatients = popoverOpen && searchTerm
    ? patients.filter(p =>
        `${p.firstName} ${p.lastName}`.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (user?.role === USER_ROLES.ADMIN && p.phone && p.phone.includes(searchTerm)) // Only search by phone if admin
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
          disabled={disabled}
        >
          {selectedPatient
            ? `${selectedPatient.firstName} ${selectedPatient.lastName}`
            : "Seleccionar paciente existente"}
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
                  key="new-patient-option"
                  value="new-patient-option-value" // Needs a unique string value
                  onSelect={() => handleSelect("new-patient")}
                  className="cursor-pointer"
                >
                  <UserPlus className={cn("mr-2 h-4 w-4")} />
                  Limpiar selección (Registrar como nuevo)
              </CommandItem>
              {filteredPatients.slice(0, 5).map((patient) => (
                <CommandItem
                  key={patient.id}
                  value={`${patient.firstName} ${patient.lastName} ${patient.id}`} // Ensure unique value
                  onSelect={() => handleSelect(patient)}
                  className="cursor-pointer"
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      selectedPatient?.id === patient.id ? "opacity-100" : "opacity-0"
                    )}
                  />
                  {patient.firstName} {patient.lastName} ({user?.role === USER_ROLES.ADMIN ? (patient.phone || 'N/A') : 'Tel. Restringido'})
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
