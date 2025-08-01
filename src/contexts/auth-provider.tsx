
"use client";

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { auth, useMockDatabase as globalUseMockDatabase, firestore } from '@/lib/firebase-config';
import { signInWithEmailAndPassword, signOut, onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import type { User as AppUser, LocationId } from '@/types';
import { getUserByUsername } from '@/lib/data';
import { LOCATIONS, USER_ROLES } from '@/lib/constants';

interface AuthContextType {
  user: AppUser | null;
  isLoading: boolean;
  login: (usernameAttempt: string, passwordAttempt: string) => Promise<{ success: boolean; message?: string; errorCode?: string }>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Helper para buscar perfil de aplicación en Firestore
const fetchAppUserProfile = async (identity: string, firebaseUserUid?: string): Promise<AppUser | null> => {
  console.log(`[AuthProvider] fetchAppUserProfile: Buscando perfil para identidad: ${identity}`);
  try {
    const appUserProfile = await getUserByUsername(identity); // getUserByUsername busca en Firestore por el campo 'username'

    if (appUserProfile) {
      console.log(`[AuthProvider] fetchAppUserProfile: Perfil encontrado en Firestore para '${identity}':`, appUserProfile);
      // Asegurar que useruid esté poblado si está disponible desde Firebase Auth
      if (firebaseUserUid && !appUserProfile.useruid) {
        appUserProfile.useruid = firebaseUserUid;
        console.log(`[AuthProvider] fetchAppUserProfile: UID de Firebase Auth '${firebaseUserUid}' asignado temporalmente al perfil de app.`);
      }

      // Lógica para derivar locationId si falta para staff users
      if (appUserProfile.role === USER_ROLES.LOCATION_STAFF && (!appUserProfile.locationId || !LOCATIONS.find(l => l.id === appUserProfile.locationId))) {
        console.warn(`[AuthProvider] Staff user '${identity}' (doc ID: ${appUserProfile.id}, username: ${appUserProfile.username}) no tiene un campo 'locationId' válido en Firestore o está ausente. Intentando derivar...`);
        
        let derivedLocationId: LocationId | null = null;
        const knownLocationIds = LOCATIONS.map(l => l.id);
        const docIdLower = appUserProfile.id.toLowerCase();
        const usernameLower = appUserProfile.username?.toLowerCase() || "";

        // Intento 1: Derivar del ID del documento
        for (const locId of knownLocationIds) {
          if (docIdLower.startsWith(locId)) {
            derivedLocationId = locId;
            console.log(`[AuthProvider] Derivando locationId '${derivedLocationId}' para staff user '${identity}' basado en el ID del documento '${appUserProfile.id}'.`);
            break;
          }
        }

        // Intento 2: Si no se derivó del ID, intentar del username (que es el email)
        if (!derivedLocationId) {
          for (const locId of knownLocationIds) {
            if (usernameLower.startsWith(locId)) {
              derivedLocationId = locId;
              console.log(`[AuthProvider] Derivando locationId '${derivedLocationId}' para staff user '${identity}' basado en el username (email) '${appUserProfile.username}'.`);
              break;
            }
          }
        }
        
        if (derivedLocationId) {
          appUserProfile.locationId = derivedLocationId;
        } else {
          console.warn(`[AuthProvider] No se pudo derivar locationId para staff user '${identity}' desde el ID del documento o username. El usuario podría no tener acceso a funcionalidades de sede.`);
        }
      }
      return appUserProfile;
    }
    console.warn(`[AuthProvider] fetchAppUserProfile: Perfil de aplicación NO encontrado en Firestore para la identidad: ${identity}`);
    return null;
  } catch (error) {
    console.error("[AuthProvider] Error en fetchAppUserProfile buscando perfil en Firestore:", error);
    return null;
  }
};


export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AppUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();

  const loadUser = useCallback(async (firebaseUser: FirebaseUser | null) => {
    if (firebaseUser) {
      console.log("[AuthProvider] loadUser: Usuario de Firebase Auth detectado:", firebaseUser.email, "UID:", firebaseUser.uid);
      if (firebaseUser.email) {
        const appUserProfile = await fetchAppUserProfile(firebaseUser.email, firebaseUser.uid);
        if (appUserProfile) {
          setUser(appUserProfile);
          localStorage.setItem('currentUser', JSON.stringify(appUserProfile));
          console.log("[AuthProvider] loadUser: Perfil de aplicación cargado desde Firestore y establecido:", appUserProfile);
        } else {
          setUser(null);
          localStorage.removeItem('currentUser');
          console.warn(`[AuthProvider] loadUser: Usuario autenticado con Firebase Auth (${firebaseUser.email}), pero no se encontró perfil en Firestore. Se cerrará la sesión de Firebase Auth.`);
          if (auth) {
            await signOut(auth).catch(err => console.error("[AuthProvider] Error al cerrar sesión de Firebase Auth por perfil no encontrado:", err));
          }
        }
      } else {
        console.warn("[AuthProvider] loadUser: Usuario de Firebase Auth no tiene email. No se puede buscar perfil. Estado del usuario de la app establecido a null.");
        setUser(null);
        localStorage.removeItem('currentUser');
      }
    } else {
      console.log("[AuthProvider] loadUser: No hay usuario de Firebase Auth (logout o no logueado). Estado del usuario de la app establecido a null.");
      setUser(null);
      localStorage.removeItem('currentUser');
    }
    setIsLoading(false);
  }, []);


  useEffect(() => {
    console.log("[AuthProvider] useEffect principal ejecutándose...");
    setIsLoading(true);
    let unsubscribe: (() => void) | undefined;

    if (globalUseMockDatabase) {
      console.log("[AuthProvider] useEffect (mockDB): Cargando usuario desde localStorage (si existe).");
      const storedUserString = localStorage.getItem('currentUser');
      if (storedUserString) {
        try {
          const storedUser: AppUser = JSON.parse(storedUserString);
          if (storedUser && storedUser.id && storedUser.username) {
            // Para el mock, simplemente re-establecemos el usuario del storage
            // La validación contra mockDB.users la haría getUserByUsername si se llamara
            setUser(storedUser); 
            console.log("[AuthProvider] useEffect (mockDB): Usuario restaurado desde localStorage:", storedUser);
          } else {
            localStorage.removeItem('currentUser');
            setUser(null);
          }
        } catch (e) {
          console.error("[AuthProvider] useEffect (mockDB): Error parseando usuario de localStorage", e);
          localStorage.removeItem('currentUser');
          setUser(null);
        }
      } else {
        setUser(null);
      }
      setIsLoading(false);
      console.log("[AuthProvider] useEffect (mockDB): setIsLoading(false)");
    } else if (auth) {
      console.log("[AuthProvider] useEffect (Firebase Auth): Suscribiéndose a onAuthStateChanged.");
      unsubscribe = onAuthStateChanged(auth, (firebaseUserParam: FirebaseUser | null) => {
        console.log("[AuthProvider] onAuthStateChanged callback: disparado. firebaseUserParam:", firebaseUserParam ? {email: firebaseUserParam.email, uid: firebaseUserParam.uid} : null);
        loadUser(firebaseUserParam); // loadUser ahora se encarga de setIsLoading(false)
      }, (error) => {
        console.error("[AuthProvider] onAuthStateChanged callback: Error:", error);
        setUser(null);
        localStorage.removeItem('currentUser');
        setIsLoading(false);
        console.log("[AuthProvider] onAuthStateChanged callback (error): setIsLoading(false)");
      });
    } else {
      console.warn("[AuthProvider] useEffect: Ni mockDB ni Firebase Auth están disponibles. Estado de carga finalizado sin usuario.");
      setUser(null); // No user
      localStorage.removeItem('currentUser');
      setIsLoading(false);
      console.log("[AuthProvider] useEffect (no auth service): setIsLoading(false)");
    }

    return () => {
      if (unsubscribe) {
        console.log("[AuthProvider] useEffect cleanup: Desuscribiéndose de onAuthStateChanged.");
        unsubscribe();
      }
    };
  }, [loadUser]); // loadUser es ahora un useCallback, solo se recrea si globalUseMockDatabase o auth cambian


  const login = async (usernameAttempt: string, passwordAttempt: string): Promise<{ success: boolean; message?: string; errorCode?: string }> => {
    console.log(`[AuthProvider] login: Intentando login para: ${usernameAttempt}`);
    setIsLoading(true);

    try {
        if (!auth) {
            setIsLoading(false);
            console.error("[AuthProvider] login: Servicio de autenticación no disponible.");
            return { success: false, message: "Servicio de autenticación no disponible." };
        }
        
        // Paso 1: Buscar el perfil del usuario por el input (puede ser username o email)
        console.log(`[AuthProvider] Buscando perfil para el input: '${usernameAttempt}'.`);
        const userProfile = await getUserByUsername(usernameAttempt);

        if (!userProfile || !userProfile.email) {
            console.log(`[AuthProvider] No se encontró perfil o el perfil no tiene un email asociado para el input '${usernameAttempt}'.`);
            setIsLoading(false);
            return { success: false, message: "Correo electrónico o contraseña incorrectos." };
        }
        
        // Paso 2: Usar siempre el email del perfil encontrado para autenticar
        const emailToUse = userProfile.email;
        console.log(`[AuthProvider] Perfil encontrado. Intentando login con el email de la base de datos: ${emailToUse}`);
        
        const userCredential = await signInWithEmailAndPassword(auth, emailToUse, passwordAttempt);
        const firebaseUser = userCredential.user;
        console.log("[AuthProvider] login: signInWithEmailAndPassword EXITOSO para email:", firebaseUser?.email, "UID:", firebaseUser?.uid);

        // El listener onAuthStateChanged se encargará de llamar a loadUser,
        // que a su vez llamará a fetchAppUserProfile y establecerá el usuario.
        // No es necesario llamar a setUser aquí.
        // Esperamos un momento para que el listener actúe.
        await new Promise(resolve => setTimeout(resolve, 100)); // Pequeña espera para el listener
        
        setIsLoading(false);
        return { success: true };

    } catch (error: any) {
      console.error("[AuthProvider] login: Error durante el inicio de sesión:", error);
      let message = "Error desconocido durante el inicio de sesión.";
      const errorCode = error.code;
      if (errorCode) {
        switch (errorCode) {
          case 'auth/invalid-credential':
          case 'auth/user-not-found':
          case 'auth/wrong-password':
          case 'auth/invalid-email':
            message = "Correo electrónico o contraseña incorrectos.";
            break;
          case 'auth/user-disabled':
            message = "Este usuario ha sido deshabilitado.";
            break;
          default:
            message = `Error de autenticación (${errorCode}): ${error.message}`;
        }
      }
      setIsLoading(false);
      return { success: false, message, errorCode };
    }
  };

  const logout = async (): Promise<void> => {
    console.log("[AuthProvider] logout: Iniciando cierre de sesión.");
    setIsLoading(true);
    try {
      if (!globalUseMockDatabase && auth) {
        console.log("[AuthProvider] logout: Cerrando sesión de Firebase Auth.");
        await signOut(auth);
      } else {
        console.log("[AuthProvider] logout: Limpiando sesión de mockDB.");
      }
      // onAuthStateChanged se encargará de setUser(null) y limpiar localStorage si se usa Firebase Auth.
      // Para mockDB o si onAuthStateChanged no se dispara inmediatamente:
      setUser(null);
      localStorage.removeItem('currentUser');
      router.replace('/');
      console.log("[AuthProvider] logout: Sesión cerrada y redirigido a login.");
    } catch (error) {
      console.error("[AuthProvider] logout: Error durante el cierre de sesión:", error);
    } finally {
      setIsLoading(false);
      console.log("[AuthProvider] logout: setIsLoading(false)");
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
