"use client";

import type { User } from '@/types';
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { getUserByUsername } from '@/lib/data'; // Mock data access
import { useRouter, usePathname } from 'next/navigation';

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  login: (username: string, password_unused: string) => Promise<boolean>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();

  const loadUserFromStorage = useCallback(() => {
    setIsLoading(true);
    try {
      const storedUser = localStorage.getItem('currentUser');
      if (storedUser) {
        const parsedUser: User = JSON.parse(storedUser);
        // Basic validation, in real app you'd verify token with backend
        if (parsedUser && parsedUser.id && parsedUser.username) {
            setUser(parsedUser);
        } else {
            localStorage.removeItem('currentUser');
        }
      }
    } catch (error) {
      console.error("Failed to load user from storage:", error);
      localStorage.removeItem('currentUser');
    }
    setIsLoading(false);
  }, []);

  useEffect(() => {
    loadUserFromStorage();
  }, [loadUserFromStorage]);

  useEffect(() => {
    if (!isLoading && !user && pathname !== '/') {
      router.push('/');
    }
    if (!isLoading && user && pathname === '/') {
      router.push('/dashboard');
    }
  }, [user, isLoading, pathname, router]);

  const login = async (username: string, password_unused: string): Promise<boolean> => {
    setIsLoading(true);
    // In a real app, password would be sent to a backend for verification.
    // Here, we're just checking if the user exists by username as per mock data.
    const foundUser = await getUserByUsername(username);
    if (foundUser && foundUser.password === password_unused) { // Password check for mock
      setUser(foundUser);
      localStorage.setItem('currentUser', JSON.stringify(foundUser));
      setIsLoading(false);
      router.push('/dashboard');
      return true;
    }
    setUser(null);
    localStorage.removeItem('currentUser');
    setIsLoading(false);
    return false;
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem('currentUser');
    router.push('/');
  };

  return (
    <AuthContext.Provider value={{ user, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
