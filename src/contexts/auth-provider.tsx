

"use client";

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { auth, useMockDatabase as globalUseMockDatabase, firestore } from '@/lib/firebase-config';
import { signInWithEmailAndPassword, signOut, onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import type { User as AppUser, LocationId } from '@/types';
import { getUserByUsername, getLocations } from '@/lib/data';
import { USER_ROLES } from '@/lib/constants';

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
      const LOCATIONS = await getLocations();
      if (appUserProfile.role === USER_ROLES.LOCATION_STAFF && (!appUserProfile.locationId || !LOCATIONS.find(l => l.id === appUserProfile.locationId))) {
        console.warn(`[AuthProvider] Staff user '${identity}' (doc ID: ${appUserProfile.id}, username: ${appUserProfile.username}) no tiene un campo 'locationId' válido en Firestore o está ausente. Intentando derivar...`);
        
        let derivedLocationId: LocationId | null = null;
        const knownLocationIds = LOCATIONS.map(l => l.id);
        const docIdLower = appUserProfile.id.toLowerCase();
        const usernameLower = appUserProfile.username?.toLowerCase() || "";

        // Intento 1: Derivar del ID del documento
        for (const locId of knownLocationIds) {
          if (docIdLower.startsWith(locId)) {
            derivedLocationId = locId as LocationId;
            console.log(`[AuthProvider] Derivando locationId '${derivedLocationId}' para staff user '${identity}' basado en el ID del documento '${appUserProfile.id}'.`);
            break;
          }
        }

        // Intento 2: Si no se derivó del ID, intentar del username (que es el email)
        if (!derivedLocationId) {
          for (const locId of knownLocationIds) {
            if (usernameLower.startsWith(locId)) {
              derivedLocationId = locId as LocationId;
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
    console.log(`[AuthProvider] login: Iniciando intento para: ${usernameAttempt}`);
    setIsLoading(true);
    let emailToUse: string | undefined;

    if (!auth) {
        setIsLoading(false);
        console.error("[AuthProvider] login: Servicio de autenticación no disponible.");
        return { success: false, message: "Servicio de autenticación no disponible." };
    }

    try {
        // First, try to sign in directly, assuming the input might be an email
        try {
            console.log(`[AuthProvider] login: Intento 1: Autenticar directamente con '${usernameAttempt}' como email.`);
            const userCredential = await signInWithEmailAndPassword(auth, usernameAttempt, passwordAttempt);
            // If successful, onAuthStateChanged will handle the rest.
            console.log("[AuthProvider] login: Éxito en Intento 1. onAuthStateChanged se encargará del resto.");
            // No need to setIsLoading(false) here, as onAuthStateChanged -> loadUser will do it.
            return { success: true };
        } catch (error: any) {
            // This is expected if the username is not an email or credentials are wrong.
            // We only care about the 'invalid-credential' error here to proceed.
            if (error.code !== 'auth/invalid-credential' && error.code !== 'auth/invalid-email') {
                console.error("[AuthProvider] login: Error no recuperable en Intento 1:", error);
                 let message = "Error desconocido durante el inicio de sesión.";
                if (error.code === 'auth/user-disabled') {
                    message = "Este usuario ha sido deshabilitado.";
                }
                setIsLoading(false);
                return { success: false, message: message, errorCode: error.code };
            }
            console.log(`[AuthProvider] login: Intento 1 falló (esperado si se usa username). Procediendo al Intento 2.`);
        }

        // Second attempt: Look up user profile by the input (which could be a username)
        console.log(`[AuthProvider] login: Intento 2: Buscar perfil de usuario para '${usernameAttempt}'.`);
        const userProfile = await getUserByUsername(usernameAttempt);

        if (!userProfile || !userProfile.email) {
            console.log(`[AuthProvider] login: No se encontró perfil o el perfil no tiene email. El login falla.`);
            setIsLoading(false);
            return { success: false, message: "Nombre de usuario o contraseña incorrectos." };
        }
        
        emailToUse = userProfile.email;
        console.log(`[AuthProvider] login: Perfil encontrado. Reintentando autenticación con el email del perfil: '${emailToUse}'.`);
        
        await signInWithEmailAndPassword(auth, emailToUse, passwordAttempt);
        // If successful, onAuthStateChanged will handle setting the user state.
        console.log("[AuthProvider] login: Éxito en Intento 2. onAuthStateChanged se encargará del resto.");
        return { success: true };

    } catch (error: any) {
        console.error(`[AuthProvider] login: Fallo final en el proceso de login. Error:`, error);
        let message = "Error desconocido.";
        const errorCode = error.code;
        if (errorCode === 'auth/invalid-credential' || errorCode === 'auth/wrong-password') {
            message = "Nombre de usuario o contraseña incorrectos.";
        } else {
            message = `Error de autenticación: ${error.message}`;
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
