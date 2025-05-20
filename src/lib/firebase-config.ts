
// src/lib/firebase-config.ts
import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app';
import { getFirestore, connectFirestoreEmulator, type Firestore } from 'firebase/firestore';

// Credenciales hardcodeadas proporcionadas por el usuario.
// ¡¡¡ADVERTENCIA!!! No es una buena práctica para producción. Usar variables de entorno es más seguro.
const firebaseConfig = {
  apiKey: "AIzaSyC5Or6YruEptKq5A0qHNQVXDIcqQHlh9Bs",
  authDomain: "footprints-scheduler-ywrwg.firebaseapp.com",
  databaseURL: "https://footprints-scheduler-ywrwg-default-rtdb.firebaseio.com", // Aunque no usemos RTDB, es parte de la config
  projectId: "footprints-scheduler-ywrwg",
  storageBucket: "footprints-scheduler-ywrwg.firebasestorage.app",
  messagingSenderId: "282404257095",
  appId: "1:282404257095:web:9379050c19e48caa396062",
  measurementId: "G-5TV8S318N7"
};

let app: FirebaseApp | undefined;
let firestoreInstance: Firestore | undefined;

// Determinar si usar la base de datos mock. Prioriza la variable de entorno si está definida.
// Si NEXT_PUBLIC_USE_MOCK_DATABASE no está definida como 'true', intentará usar Firebase real.
const envUseMock = process.env.NEXT_PUBLIC_USE_MOCK_DATABASE;
export const useMockDatabase = envUseMock === 'true';

console.log("[FirebaseConfig] Iniciando configuración...");
console.log(`[FirebaseConfig] ¿Usar Base de Datos Mock (en memoria)? ${useMockDatabase} (basado en NEXT_PUBLIC_USE_MOCK_DATABASE='${envUseMock}')`);

if (useMockDatabase) {
  console.warn("[FirebaseConfig] ATENCIÓN: Aplicación configurada para usar BASE DE DATOS MOCK (en memoria). Los datos NO se guardarán en Firebase/Firestore real.");
  // app y firestoreInstance permanecen undefined
} else {
  console.log("[FirebaseConfig] Intentando conectar a servicios REALES de Firebase/Firestore.");
  console.log(`[FirebaseConfig] Usando credenciales hardcodeadas para el proyecto ID: '${firebaseConfig.projectId}'.`);

  if (!firebaseConfig.projectId || !firebaseConfig.apiKey || !firebaseConfig.authDomain) {
    console.error(
      '[FirebaseConfig] CRÍTICO: Las credenciales hardcodeadas de Firebase son incompletas (falta projectId, apiKey o authDomain). Firebase NO se inicializará correctamente.'
    );
  } else {
    try {
      if (!getApps().length) {
        app = initializeApp(firebaseConfig);
        console.log("[FirebaseConfig] App de Firebase inicializada (nueva instancia) con credenciales hardcodeadas.");
      } else {
        app = getApp();
        console.log("[FirebaseConfig] App de Firebase ya existía (usando instancia existente). Configuración hardcodeada provista.");
      }
    } catch (e) {
      console.error("[FirebaseConfig] Error inicializando la app de Firebase con credenciales hardcodeadas:", e);
      app = undefined;
    }

    if (app) {
      console.log(`[FirebaseConfig] App de Firebase conectada correctamente al proyecto: '${app.options.projectId}'. Verifica que este sea tu Project ID deseado ('footprints-scheduler-ywrwg').`);
      try {
        firestoreInstance = getFirestore(app);
        console.log("[FirebaseConfig] Instancia de Firestore obtenida.");

        if (process.env.NODE_ENV === 'development') {
          console.log("[FirebaseConfig] Modo DESARROLLO detectado. Intentando conectar Firestore al emulador en localhost:8080.");
          try {
            // Verificar si el emulador ya está conectado para evitar errores en HMR
            const settings = (firestoreInstance as any)._settings || (firestoreInstance as any).settings;
            if (settings && (settings.host?.includes('localhost') || settings.host?.includes('127.0.0.1'))) {
                 console.log(`[FirebaseConfig] Emulador de Firestore YA PARECE ESTAR conectado en ${settings.host}:${settings.port}.`);
            } else {
                connectFirestoreEmulator(firestoreInstance, 'localhost', 8080);
                console.log("[FirebaseConfig] ÉXITO - Conexión al emulador de Firestore CONFIGURADA para localhost:8080. Asegúrate de que el emulador esté ejecutándose.");
            }
          } catch (emulatorError: any) {
             if (emulatorError.code === 'failed-precondition' || (emulatorError.message && emulatorError.message.includes('settings can no longer be changed'))) {
                console.warn("[FirebaseConfig] Advertencia: El emulador de Firestore ya estaba configurado o las configuraciones no se pueden cambiar. Esto puede ser normal con recargas en caliente (hot-reload) o si ya se realizó una operación de Firestore.");
            } else {
                console.error("[FirebaseConfig] ERROR conectando al emulador de Firestore en localhost:8080:", emulatorError);
                console.warn("[FirebaseConfig] Firestore intentará conectarse a la base de datos de PRODUCCIÓN porque la conexión al emulador falló. Verifica el estado del emulador.");
            }
          }
        } else {
          console.log(`[FirebaseConfig] Modo PRODUCCIÓN detectado. Conectando a Cloud Firestore real, proyecto ID: '${firebaseConfig.projectId}'.`);
        }
      } catch (e) {
        console.error("[FirebaseConfig] Error obteniendo instancia de Firestore o durante la lógica de configuración del emulador/producción:", e);
        firestoreInstance = undefined;
      }
    } else {
      console.error("[FirebaseConfig] App de Firebase NO inicializada. Firestore no puede ser configurado.");
    }
  }
}

if (!firestoreInstance && !useMockDatabase) {
    console.error("[FirebaseConfig] ALERTA FINAL: La instancia de Firestore NO está disponible y se está intentando usar Firebase real. Las operaciones de datos con Firestore fallarán. Revisa la consola para errores previos de inicialización, tu conexión a internet y la configuración de tu proyecto Firebase.");
} else if (firestoreInstance && !useMockDatabase) {
    console.log("[FirebaseConfig] ESTADO FINAL: La instancia de Firestore ESTÁ disponible para la aplicación (intentando usar base de datos REAL o EMULADA).");
} else if (useMockDatabase) {
    console.log("[FirebaseConfig] ESTADO FINAL: La aplicación está usando la BASE DE DATOS MOCK (en memoria). Firestore real no será contactado.");
}
console.log("--- FIN CONFIGURACIÓN FIREBASE/FIRESTORE ---");

export { firestoreInstance as firestore, app };
