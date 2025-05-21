
"use client";

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useMockDatabase, firestore, auth } from '../lib/firebase-config'; // Import auth
import { signInWithEmailAndPassword, signOut, onAuthStateChanged, User as FirebaseUser } from 'firebase/auth'; // Firebase Auth functions
import type { User as AppUser } from '@/types';
import { getUserByUsername } from '@/lib/data';

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

  const fetchAppUserProfile = useCallback(async (identity: string, isUid: boolean = false): Promise<AppUser | null> => {
    try {
      // En un sistema real con Firebase Auth, 'identity' sería firebaseUser.email o firebaseUser.uid
      // getUserByUsername actualmente espera el campo 'username' de tu colección 'usuarios'.
      // Si 'username' en Firestore ES el email que usas para Auth, esto funciona.
      // Si quisieras usar UID, getUserByUsername necesitaría ser adaptada o crear una nueva función getUserByUid.
      const appUserProfile = await getUserByUsername(identity);
      if (appUserProfile) {
        return appUserProfile;
      } else {
        console.warn(`Perfil de aplicación no encontrado en Firestore para la identidad: ${identity}`);
        return null;
      }
    } catch (error) {
      console.error("Error buscando perfil de aplicación en Firestore:", error);
      return null;
    }
  }, []);

  const loadUserFromStorageOrFirebaseAuth = useCallback(async () => {
    setIsLoading(true);
    if (useMockDatabase) {
      console.log("[AuthProvider] Usando mockDB: Cargando usuario desde localStorage (si existe).");
      try {
        const storedUserString = localStorage.getItem('currentUser');
        if (storedUserString) {
          const storedUser: AppUser = JSON.parse(storedUserString);
          if (storedUser && storedUser.id && storedUser.username) {
            const mockUser = await getUserByUsername(storedUser.username); // Verifica contra el mock actual
            if (mockUser && mockUser.id === storedUser.id) {
              setUser(mockUser);
            } else {
              localStorage.removeItem('currentUser');
              setUser(null);
            }
          } else {
            localStorage.removeItem('currentUser');
            setUser(null);
          }
        } else {
          setUser(null);
        }
      } catch (error) {
        console.error("Error cargando usuario desde localStorage (mockDB):", error);
        localStorage.removeItem('currentUser');
        setUser(null);
      } finally {
        setIsLoading(false);
      }
    } else if (auth) {
      console.log("[AuthProvider] Usando Firebase Auth real: Suscribiéndose a onAuthStateChanged.");
      const unsubscribe = onAuthStateChanged(auth, async (firebaseUser: FirebaseUser | null) => {
        if (firebaseUser) {
          console.log("[AuthProvider] Usuario de Firebase Auth detectado:", firebaseUser.email);
          if (firebaseUser.email) {
            const appUserProfile = await fetchAppUserProfile(firebaseUser.email);
            if (appUserProfile) {
              setUser(appUserProfile);
              localStorage.setItem('currentUser', JSON.stringify(appUserProfile));
              console.log("[AuthProvider] Perfil de aplicación cargado desde Firestore:", appUserProfile);
            } else {
              setUser(null);
              localStorage.removeItem('currentUser');
              // Opcional: desloguear de Firebase Auth si no hay perfil de app, o manejarlo de otra forma.
              // await signOut(auth); 
              console.warn("[AuthProvider] Usuario autenticado con Firebase Auth, pero no se encontró perfil en Firestore.");
            }
          } else {
            console.warn("[AuthProvider] Usuario de Firebase Auth no tiene email. No se puede buscar perfil.");
            setUser(null);
            localStorage.removeItem('currentUser');
          }
        } else {
          console.log("[AuthProvider] No hay usuario de Firebase Auth (logout).");
          setUser(null);
          localStorage.removeItem('currentUser');
        }
        setIsLoading(false);
      });
      return () => {
        console.log("[AuthProvider] Desuscribiéndose de onAuthStateChanged.");
        unsubscribe();
      };
    } else {
      console.warn("[AuthProvider] Ni mockDB ni Firebase Auth están disponibles. Estado de carga finalizado sin usuario.");
      setIsLoading(false);
      setUser(null);
    }
  }, [fetchAppUserProfile]); // fetchAppUserProfile es una dependencia

  useEffect(() => {
    loadUserFromStorageOrFirebaseAuth();
  }, [loadUserFromStorageOrFirebaseAuth]);


  const login = async (usernameAttempt: string, passwordAttempt: string): Promise<boolean> => {
    setIsLoading(true);
    try {
      if (useMockDatabase) {
        console.log("[AuthProvider] Login (mockDB) para:", usernameAttempt);
        const fetchedUser = await getUserByUsername(usernameAttempt);
        if (fetchedUser && fetchedUser.password === passwordAttempt) {
          setUser(fetchedUser);
          localStorage.setItem('currentUser', JSON.stringify(fetchedUser));
          if (pathname === '/') router.replace('/dashboard');
          return true;
        }
        setUser(null);
        localStorage.removeItem('currentUser');
        return false;
      } else if (auth) {
        console.log("[AuthProvider] Login (Firebase Auth) para:", usernameAttempt);
        // Asumimos que usernameAttempt es el email para Firebase Auth
        const userCredential = await signInWithEmailAndPassword(auth, usernameAttempt, passwordAttempt);
        const firebaseUser = userCredential.user;
        if (firebaseUser && firebaseUser.email) {
          const appUserProfile = await fetchAppUserProfile(firebaseUser.email);
          if (appUserProfile) {
            setUser(appUserProfile);
            localStorage.setItem('currentUser', JSON.stringify(appUserProfile));
            if (pathname === '/') router.replace('/dashboard');
            return true;
          } else {
            // Usuario autenticado con Firebase Auth pero sin perfil en Firestore
            await signOut(auth); // Desloguear para evitar estado inconsistente
            setUser(null);
            localStorage.removeItem('currentUser');
            return false;
          }
        }
        setUser(null);
        localStorage.removeItem('currentUser');
        return false;
      } else {
        console.error("[AuthProvider] Error de login: Ni mockDB ni Firebase Auth disponibles.");
        return false;
      }
    } catch (error) {
      console.error("[AuthProvider] Error en login:", error);
      setUser(null);
      localStorage.removeItem('currentUser');
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async (): Promise<void> => {
    setIsLoading(true);
    try {
      if (!useMockDatabase && auth) {
        console.log("[AuthProvider] Logout (Firebase Auth).");
        await signOut(auth);
      } else {
        console.log("[AuthProvider] Logout (mockDB).");
      }
    } catch (error) {
      console.error("[AuthProvider] Error en logout:", error);
    } finally {
      setUser(null);
      localStorage.removeItem('currentUser');
      router.replace('/');
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
