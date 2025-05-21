
"use client";

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { auth as firebaseAuth, useMockDatabase, firestore } from '../lib/firebase-config';
import { signInWithEmailAndPassword, signOut, onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import type { User as AppUser } from '@/types';
import { getUserByUsername } from '@/lib/data'; // Using this for mock or Firestore based on useMockDatabase

interface AuthContextType {
  user: AppUser | null;
  isLoading: boolean;
  login: (usernameAttempt: string, passwordAttempt: string) => Promise<boolean>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AppUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();

  const loadUserFromStorage = useCallback(async () => {
    setIsLoading(true);
    let foundUser: AppUser | null = null;
    try {
      if (typeof window !== 'undefined') {
        const storedUserString = localStorage.getItem('currentUser');
        if (storedUserString) {
          const storedUser: AppUser = JSON.parse(storedUserString);
          // Basic validation: ensure it has an ID and username
          if (storedUser && storedUser.id && storedUser.username) {
            // If not using mockDB, re-verify against actual DB for security (optional here for simplicity)
            if (!useMockDatabase && firestore) {
                const dbUser = await getUserByUsername(storedUser.username);
                if (dbUser && dbUser.id === storedUser.id) {
                    foundUser = dbUser;
                } else {
                     console.warn("Stored user not found or mismatched in Firestore during session load.");
                     localStorage.removeItem('currentUser');
                }
            } else if (useMockDatabase) {
                 const mockUser = await getUserByUsername(storedUser.username);
                 if (mockUser && mockUser.id === storedUser.id) {
                    foundUser = mockUser;
                 } else {
                    localStorage.removeItem('currentUser');
                 }
            }
          } else {
            localStorage.removeItem('currentUser');
          }
        }
      }
    } catch (error) {
      console.error("Failed to load user from storage:", error);
      if (typeof window !== 'undefined') {
        localStorage.removeItem('currentUser');
      }
    } finally {
        setUser(foundUser);
        setIsLoading(false);
    }
  }, []);


  useEffect(() => {
    // If using Firebase Auth for real, this would be the primary mechanism
    if (!useMockDatabase && firebaseAuth) {
      const unsubscribe = onAuthStateChanged(firebaseAuth, async (firebaseUser: FirebaseUser | null) => {
        setIsLoading(true);
        if (firebaseUser && firebaseUser.email) {
          // Firebase Auth uses email as username by default.
          // We need to fetch our custom AppUser profile from Firestore using this email/username.
          // Assuming 'username' in your AppUser maps to 'email' in Firebase Auth.
          // Or, if you store a unique 'authUid' field in your AppUser documents, you could use firebaseUser.uid.
          // For this example, let's assume you have a way to map firebaseUser.email to your AppUser's username.
          // This part might need adjustment based on your exact user data structure in Firestore.
          try {
            // This is a placeholder. You'd typically have a more robust way to link
            // Firebase Auth users (firebaseUser.uid or firebaseUser.email) to your user profiles in Firestore.
            // For example, if you store the Firebase Auth UID in your 'usuarios' collection.
            // Or if the 'username' in your 'usuarios' collection IS the email used for Firebase Auth.
            const appUserProfile = await getUserByUsername(firebaseUser.email); // Adjust if username is not email
            if (appUserProfile) {
              setUser(appUserProfile);
              if (typeof window !== 'undefined') {
                localStorage.setItem('currentUser', JSON.stringify(appUserProfile));
              }
            } else {
              console.warn("Firebase Auth user logged in, but no corresponding AppUser profile found.");
              setUser(null);
              if (typeof window !== 'undefined') {
                localStorage.removeItem('currentUser');
              }
              await signOut(firebaseAuth); // Sign out if no app profile
            }
          } catch (error) {
             console.error("Error fetching AppUser profile after Firebase Auth state change:", error);
             setUser(null);
             if (typeof window !== 'undefined') {
                localStorage.removeItem('currentUser');
             }
          }
        } else {
          setUser(null);
           if (typeof window !== 'undefined') {
            localStorage.removeItem('currentUser');
          }
        }
        setIsLoading(false);
      });
      return () => unsubscribe();
    } else {
      // Fallback to localStorage if not using Firebase Auth or if firebaseAuth is undefined
      loadUserFromStorage();
    }
  }, [loadUserFromStorage]);


  const login = async (usernameAttempt: string, passwordAttempt: string): Promise<boolean> => {
    setIsLoading(true);
    try {
      const fetchedUser = await getUserByUsername(usernameAttempt);

      if (fetchedUser && fetchedUser.password === passwordAttempt) { // Password check (INSECURE for production)
        setUser(fetchedUser);
        if (typeof window !== 'undefined') {
          localStorage.setItem('currentUser', JSON.stringify(fetchedUser));
        }
        if (pathname === '/') {
            router.replace('/dashboard');
        }
        return true;
      } else {
        setUser(null);
        if (typeof window !== 'undefined') {
          localStorage.removeItem('currentUser');
        }
        return false;
      }
    } catch (error) {
      console.error("Login error:", error);
      setUser(null);
      if (typeof window !== 'undefined') {
        localStorage.removeItem('currentUser');
      }
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async (): Promise<void> => {
    setIsLoading(true);
    try {
      if (!useMockDatabase && firebaseAuth) {
        await signOut(firebaseAuth); // Sign out from Firebase Auth if used
      }
      setUser(null);
      if (typeof window !== 'undefined') {
        localStorage.removeItem('currentUser');
      }
      router.replace('/');
    } catch (error) {
      console.error("Logout error:", error);
      // Still clear local state even if Firebase signout fails
      setUser(null);
      if (typeof window !== 'undefined') {
        localStorage.removeItem('currentUser');
      }
      router.replace('/'); // Ensure redirect even on error
    } finally {
        setIsLoading(false);
    }
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
