// src/lib/firebase-config.ts
import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app';
import { getFirestore, connectFirestoreEmulator, type Firestore } from 'firebase/firestore';

// Hardcoded Firebase configuration provided by the user
const firebaseConfig = {
  apiKey: "AIzaSyC5Or6YruEptKq5A0qHNQVXDIcqQHlh9Bs",
  authDomain: "footprints-scheduler-ywrwg.firebaseapp.com",
  databaseURL: "https://footprints-scheduler-ywrwg-default-rtdb.firebaseio.com",
  projectId: "footprints-scheduler-ywrwg",
  storageBucket: "footprints-scheduler-ywrwg.firebasestorage.app",
  messagingSenderId: "282404257095",
  appId: "1:282404257095:web:9379050c19e48caa396062",
  measurementId: "G-5TV8S318N7"
};

let app: FirebaseApp | undefined;
let firestoreInstance: Firestore | undefined;

// Fallback for NEXT_PUBLIC_USE_MOCK_DATABASE if not set (defaults to false, meaning try to use Firebase)
export const useMockDatabase = process.env.NEXT_PUBLIC_USE_MOCK_DATABASE === 'true';

console.log("--- INICIO CONFIGURACIÓN FIREBASE/FIRESTORE ---");
console.log(`[FirebaseConfig] ¿Usar Base de Datos Mock (en memoria)? ${useMockDatabase} (basado en NEXT_PUBLIC_USE_MOCK_DATABASE='${process.env.NEXT_PUBLIC_USE_MOCK_DATABASE}')`);
console.log(`[FirebaseConfig] Project ID que se usará para la inicialización de Firebase: '${firebaseConfig.projectId}'.`);


if (useMockDatabase) {
  console.warn("[FirebaseConfig] ATENCIÓN: La aplicación está configurada para usar la BASE DE DATOS MOCK (en memoria). Los datos NO se guardarán en Firebase/Firestore real y se perderán al recargar.");
  app = undefined;
  firestoreInstance = undefined;
} else {
  console.log(`[FirebaseConfig] Intentando conectar a servicios REALES de Firebase/Firestore con la configuración para projectId: '${firebaseConfig.projectId}'.`);

  if (!firebaseConfig.projectId || !firebaseConfig.apiKey || !firebaseConfig.authDomain) {
    console.error(
      '[FirebaseConfig] CRÍTICO: La configuración de Firebase es incompleta (falta projectId, apiKey o authDomain). Firebase NO se inicializará correctamente.'
    );
  } else {
    try {
      if (!getApps().length) {
        app = initializeApp(firebaseConfig);
        console.log("[FirebaseConfig] App de Firebase inicializada (nueva instancia).");
      } else {
        app = getApp();
        console.log("[FirebaseConfig] App de Firebase ya existía (usando instancia existente).");
      }
    } catch (e) {
      console.error("[FirebaseConfig] Error inicializando la app de Firebase:", e);
      app = undefined;
    }

    if (app) {
      console.log(`[FirebaseConfig] App de Firebase conectada correctamente al proyecto: '${app.options.projectId}'. Verifica que este sea tu Project ID deseado.`);
      try {
        firestoreInstance = getFirestore(app);
        console.log("[FirebaseConfig] Instancia de Firestore obtenida.");

        if (process.env.NODE_ENV === 'development') {
          console.log("[FirebaseConfig] Modo DESARROLLO detectado (y useMockDatabase es false). Verificando conexión al emulador.");
          if (firestoreInstance) {
            const settings = (firestoreInstance as any)._settings || (firestoreInstance as any).settings;
            if (settings && settings.host && (settings.host.includes('localhost') || settings.host.includes('127.0.0.1'))) {
                 console.log(`[FirebaseConfig] Emulador de Firestore YA PARECE ESTAR conectado en ${settings.host}:${settings.port}. No se intentará conectar de nuevo.`);
            } else {
                console.log("[FirebaseConfig] Intentando conectar Firestore al emulador en localhost:8080.");
                try {
                    connectFirestoreEmulator(firestoreInstance, 'localhost', 8080);
                    console.log("[FirebaseConfig] ÉXITO - Conexión al emulador de Firestore CONFIGURADA para localhost:8080. Asegúrate de que el emulador esté ejecutándose.");
                } catch (emulatorError: any) {
                    if (emulatorError.code === 'failed-precondition' && emulatorError.message.includes('settings can no longer be changed')) {
                        console.warn("[FirebaseConfig] Advertencia: El emulador de Firestore ya estaba configurado o las configuraciones no se pueden cambiar. Esto es normal si el código se recarga (hot-reload) o si ya se ha realizado una operación de Firestore.");
                    } else {
                        console.error("[FirebaseConfig] ERROR conectando al emulador de Firestore en localhost:8080:", emulatorError);
                        console.warn("[FirebaseConfig] Firestore intentará conectarse a la base de datos de PRODUCCIÓN porque la conexión al emulador falló.");
                    }
                }
            }
          } else {
            console.error("[FirebaseConfig] Instancia de Firestore es undefined en DESARROLLO (y useMockDatabase es false). No se puede conectar al emulador.");
          }
        } else {
          console.log(`[FirebaseConfig] Modo PRODUCCIÓN detectado (o useMockDatabase es false fuera de desarrollo). Conectando a Cloud Firestore real, proyecto ID: '${firebaseConfig.projectId}'.`);
          console.log("[FirebaseConfig] Si la conexión falla, revisa tus variables de entorno, la configuración de tu proyecto Firebase (Firestore habilitado, estado de facturación) y la conectividad de red.");
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
    console.error("[FirebaseConfig] ALERTA FINAL: La instancia de Firestore NO está disponible y NO se está usando la base de datos mock. Las operaciones de datos con Firestore fallarán. Revisa la consola para errores previos de inicialización, tu conexión a internet y la configuración de tu proyecto Firebase.");
} else if (firestoreInstance && !useMockDatabase) {
    console.log("[FirebaseConfig] ESTADO FINAL: La instancia de Firestore ESTÁ disponible para la aplicación (intentando usar base de datos REAL o EMULADA).");
} else if (useMockDatabase) {
    console.log("[FirebaseConfig] ESTADO FINAL: La aplicación está usando la BASE DE DATOS MOCK (en memoria). Firestore real no será contactado.");
}
console.log("--- FIN CONFIGURACIÓN FIREBASE/FIRESTORE ---");

export { firestoreInstance as firestore, app };
