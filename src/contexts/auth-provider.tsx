
"use client";

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { firestore, auth, useMockDatabase as globalUseMockDatabase } from '../lib/firebase-config';
import { signInWithEmailAndPassword, signOut, onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import type { User as AppUser } from '@/types';
import { getUserByUsername } from '@/lib/data'; // getUserByUsername ahora busca en Firestore por el campo 'username'

interface AuthContextType {
  user: AppUser | null;
  isLoading: boolean;
  login: (usernameAttempt: string, passwordAttempt: string) => Promise<{ success: boolean; message?: string; errorCode?: string }>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Helper para buscar perfil de aplicación en Firestore usando email o username
// Asumimos que el 'username' en Firestore puede ser el email que usa Firebase Auth.
const fetchAppUserProfile = async (identity: string): Promise<AppUser | null> => {
  try {
    const appUserProfile = await getUserByUsername(identity); // getUserByUsername busca en Firestore
    if (appUserProfile) {
      return appUserProfile;
    } else {
      console.warn(`[AuthProvider] Perfil de aplicación no encontrado en Firestore para la identidad: ${identity}`);
      return null;
    }
  } catch (error) {
    console.error("[AuthProvider] Error buscando perfil de aplicación en Firestore:", error);
    return null;
  }
};


export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AppUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();

  const loadUserFromStorageOrFirebaseAuth = useCallback(async () => {
    console.log("[AuthProvider] Iniciando loadUserFromStorageOrFirebaseAuth. useMockDatabase:", globalUseMockDatabase);
    setIsLoading(true);
    try {
      if (globalUseMockDatabase) {
        console.log("[AuthProvider] Usando mockDB: Cargando usuario desde localStorage (si existe).");
        const storedUserString = localStorage.getItem('currentUser');
        if (storedUserString) {
          const storedUser: AppUser = JSON.parse(storedUserString);
          if (storedUser && storedUser.id && storedUser.username) {
            const mockUser = await getUserByUsername(storedUser.username);
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
      } else if (auth) {
        console.log("[AuthProvider] Usando Firebase Auth real: Suscribiéndose a onAuthStateChanged.");
        const unsubscribe = onAuthStateChanged(auth, async (firebaseUser: FirebaseUser | null) => {
          console.log("[AuthProvider] onAuthStateChanged disparado. firebaseUser:", firebaseUser);
          if (firebaseUser) {
            console.log("[AuthProvider] Usuario de Firebase Auth detectado:", firebaseUser.email);
            if (firebaseUser.email) {
              const appUserProfile = await fetchAppUserProfile(firebaseUser.email);
              if (appUserProfile) {
                setUser(appUserProfile);
                localStorage.setItem('currentUser', JSON.stringify(appUserProfile));
                console.log("[AuthProvider] Perfil de aplicación cargado desde Firestore y establecido:", appUserProfile);
              } else {
                setUser(null);
                localStorage.removeItem('currentUser');
                console.warn("[AuthProvider] Usuario autenticado con Firebase Auth, pero no se encontró perfil en Firestore. Se cerrará la sesión de Firebase Auth.");
                await signOut(auth); // Forzar logout si no hay perfil de app
              }
            } else {
              console.warn("[AuthProvider] Usuario de Firebase Auth no tiene email. No se puede buscar perfil. Estado del usuario de la app establecido a null.");
              setUser(null);
              localStorage.removeItem('currentUser');
            }
          } else {
            console.log("[AuthProvider] No hay usuario de Firebase Auth (logout o no logueado). Estado del usuario de la app establecido a null.");
            setUser(null);
            localStorage.removeItem('currentUser');
          }
          setIsLoading(false); // Mover setIsLoading aquí para que se actualice después de procesar el usuario
        });
        return () => {
          console.log("[AuthProvider] Desuscribiéndose de onAuthStateChanged.");
          unsubscribe();
        };
      } else {
        console.warn("[AuthProvider] Ni mockDB ni Firebase Auth están disponibles. Estado de carga finalizado sin usuario.");
        setUser(null);
      }
    } catch (error) {
      console.error("[AuthProvider] Error en loadUserFromStorageOrFirebaseAuth:", error);
      setUser(null);
      localStorage.removeItem('currentUser');
    } finally {
      // Asegurarse de que isLoading se establezca en false solo una vez, y después de que todo el proceso haya terminado.
      // Si estamos usando Firebase Auth, onAuthStateChanged se encarga de setIsLoading.
      if (globalUseMockDatabase || !auth) {
        setIsLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    const asyncEffect = async () => {
        const unsubscribe = await loadUserFromStorageOrFirebaseAuth();
        return () => {
            if (typeof unsubscribe === 'function') {
                unsubscribe();
            }
        };
    };
    asyncEffect();
  }, [loadUserFromStorageOrFirebaseAuth]);


  const login = async (usernameAttempt: string, passwordAttempt: string): Promise<{ success: boolean; message?: string; errorCode?: string }> => {
    setIsLoading(true);
    try {
      if (globalUseMockDatabase) {
        console.log("[AuthProvider] Login (mockDB) para:", usernameAttempt);
        const fetchedUser = await getUserByUsername(usernameAttempt); // Asume que getUserByUsername no necesita password para el mock
        if (fetchedUser && fetchedUser.password === passwordAttempt) { // Comparación de contraseña para el mock
          setUser(fetchedUser);
          localStorage.setItem('currentUser', JSON.stringify(fetchedUser));
          if (pathname === '/') router.replace('/dashboard');
          return { success: true };
        }
        return { success: false, message: "Credenciales inválidas para mockDB." };
      } else if (auth) {
        console.log("[AuthProvider] Login (Firebase Auth) para:", usernameAttempt);
        const userCredential = await signInWithEmailAndPassword(auth, usernameAttempt, passwordAttempt);
        const firebaseUser = userCredential.user;
        if (firebaseUser && firebaseUser.email) {
          const appUserProfile = await fetchAppUserProfile(firebaseUser.email);
          if (appUserProfile) {
            setUser(appUserProfile); // El onAuthStateChanged también hará esto, pero lo hacemos aquí para respuesta inmediata
            localStorage.setItem('currentUser', JSON.stringify(appUserProfile));
            if (pathname === '/') router.replace('/dashboard');
            return { success: true };
          } else {
            // Usuario autenticado en Firebase Auth pero sin perfil en Firestore
            await signOut(auth); // Forzar logout para evitar estado inconsistente
            return { success: false, message: "Usuario autenticado pero no se encontró perfil de aplicación." };
          }
        }
        return { success: false, message: "Error al obtener información del usuario de Firebase." };
      } else {
        console.error("[AuthProvider] Error de login: Ni mockDB ni Firebase Auth disponibles.");
        return { success: false, message: "Servicio de autenticación no disponible." };
      }
    } catch (error: any) {
      console.error("[AuthProvider] Error en login:", error);
      let message = "Error desconocido durante el inicio de sesión.";
      if (error.code) {
        switch (error.code) {
          case 'auth/invalid-credential':
          case 'auth/user-not-found':
          case 'auth/wrong-password':
            message = "Correo electrónico o contraseña incorrectos.";
            break;
          case 'auth/invalid-email':
            message = "El formato del correo electrónico es inválido.";
            break;
          case 'auth/user-disabled':
            message = "Este usuario ha sido deshabilitado.";
            break;
          default:
            message = "Error de autenticación: " + error.message;
        }
      }
      return { success: false, message, errorCode: error.code };
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async (): Promise<void> => {
    setIsLoading(true);
    try {
      if (!globalUseMockDatabase && auth) {
        console.log("[AuthProvider] Logout (Firebase Auth).");
        await signOut(auth);
      } else {
        console.log("[AuthProvider] Logout (mockDB).");
      }
    } catch (error) {
      console.error("[AuthProvider] Error en logout:", error);
    } finally {
      // onAuthStateChanged se encargará de poner setUser(null) y limpiar localStorage
      // pero lo hacemos aquí también para una respuesta más inmediata en la UI si es necesario.
      setUser(null);
      localStorage.removeItem('currentUser');
      router.replace('/'); // Siempre redirigir a la página de login al hacer logout
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
