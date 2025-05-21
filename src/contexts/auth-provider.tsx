"use client";

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { auth } from '../lib/firebase-config'; // Import the auth instance
import { signInWithEmailAndPassword, signOut, onAuthStateChanged, User } from 'firebase/auth'; // Import Firebase Auth functions and User type

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<boolean>;
  logout: () => Promise<void>;
}

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
  }, []); // Dependencies adjusted to remove router and pathname

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, []); // Dependency array is empty to run only on mount and unmount


const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();

  // Implement the login function using Firebase Authentication
  const login = async (email: string, password: string): Promise<boolean> => {
    setIsLoading(true); // Optional: Indicate loading state
    try {
      await signInWithEmailAndPassword(auth, email, password);
      console.log("Login successful!");
      return true;
    }
    setUser(null);
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
