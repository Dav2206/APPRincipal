
// src/lib/firebase-config.ts
import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app';
import { getFirestore, connectFirestoreEmulator, type Firestore } from 'firebase/firestore';

// --- Configuración de Firebase ---
// Estos son los valores que proporcionaste.
const firebaseConfig = {
  apiKey: "AIzaSyC5Or6YruEptKq5A0qHNQVXDIcqQHlh9Bs",
  authDomain: "footprints-scheduler-ywrwg.firebaseapp.com",
  databaseURL: "https://footprints-scheduler-ywrwg-default-rtdb.firebaseio.com",
  projectId: "footprints-scheduler-ywrwg",
  storageBucket: "footprints-scheduler-ywrwg.appspot.com", // Corregido: típicamente es .appspot.com, no .firebasestorage.app
  messagingSenderId: "282404257095",
  appId: "1:282404257095:web:9379050c19e48caa396062",
  measurementId: "G-5TV8S318N7" // Opcional, se mantiene por si se usa en el futuro
};

// --- Control para usar Mock Database vs Firestore Real ---
// Para usar Firestore REAL, esta variable debe ser false.
// Puedes controlarla con NEXT_PUBLIC_USE_MOCK_DATABASE en tu .env.local
// Si NEXT_PUBLIC_USE_MOCK_DATABASE es 'true', se usará la base de datos mock.
// Si es 'false' o no está definida, se intentará conectar a Firestore real.
export const useMockDatabase = process.env.NEXT_PUBLIC_USE_MOCK_DATABASE === 'true';

let app: FirebaseApp | undefined;
let firestoreInstance: Firestore | undefined;

console.log("--- INICIO CONFIGURACIÓN FIREBASE/FIRESTORE ---");
console.log(`[FirebaseConfig] ¿Usar Base de Datos Mock (en memoria)? ${useMockDatabase} (basado en NEXT_PUBLIC_USE_MOCK_DATABASE='${process.env.NEXT_PUBLIC_USE_MOCK_DATABASE}')`);
console.log(`[FirebaseConfig] Project ID que se usará para la inicialización de Firebase: '${firebaseConfig.projectId}'`);

if (useMockDatabase) {
  console.warn("[FirebaseConfig] ATENCIÓN: La aplicación está configurada para usar la BASE DE DATOS MOCK (en memoria). Los datos NO se guardarán en Firebase/Firestore real y se perderán al recargar.");
  app = undefined;
  firestoreInstance = undefined;
} else {
  console.log("[FirebaseConfig] Intentando conectar a servicios REALES de Firebase/Firestore con la configuración proporcionada.");

  // Verificación simple de que el projectId está presente (ya que ahora está hardcodeado)
  if (!firebaseConfig.projectId) {
    console.error(
      '[FirebaseConfig] CRÍTICO: El projectId en la configuración hardcodeada está vacío. Firebase NO se inicializará correctamente.'
    );
  } else {
    console.log("[FirebaseConfig] El projectId en la configuración hardcodeada está presente.");
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
      app = undefined; // Asegura que app sea undefined en caso de fallo
    }

    if (app) {
      console.log(`[FirebaseConfig] App de Firebase conectada correctamente al proyecto: '${app.options.projectId}'. Asegúrate que este Project ID coincida con tu proyecto en la consola de Firebase.`);
      try {
        firestoreInstance = getFirestore(app);
        console.log("[FirebaseConfig] Instancia de Firestore obtenida.");

        if (process.env.NODE_ENV === 'development') {
          console.log("[FirebaseConfig] Modo DESARROLLO detectado.");
          if (firestoreInstance) {
            // Comprobar si el emulador ya está conectado para evitar múltiples llamadas
            const settings = (firestoreInstance as any)._settings || (firestoreInstance as any).settings;
            if (settings && settings.host && (settings.host.includes('localhost') || settings.host.includes('127.0.0.1'))) {
                 console.log(`[FirebaseConfig] Emulador de Firestore YA PARECE ESTAR conectado en ${settings.host}:${settings.port}.`);
            } else {
                console.log("[FirebaseConfig] Intentando conectar Firestore al emulador en localhost:8080.");
                try {
                    connectFirestoreEmulator(firestoreInstance, 'localhost', 8080);
                    console.log("[FirebaseConfig] ÉXITO - Conexión al emulador de Firestore CONFIGURADA para localhost:8080.");
                    console.log("[FirebaseConfig]   Asegúrate de que el emulador de Firestore esté ejecutándose (ej: 'firebase emulators:start').");
                } catch (emulatorError: any) {
                    if (emulatorError.code === 'failed-precondition' && emulatorError.message.includes('settings can no longer be changed')) {
                        console.warn("[FirebaseConfig] Advertencia: El emulador de Firestore ya estaba configurado o las configuraciones no se pueden cambiar después de que Firestore ha comenzado. Esto es normal si el código se recarga (hot-reload) o si ya se ha realizado una operación de Firestore.");
                    } else {
                        console.error("[FirebaseConfig] ERROR conectando al emulador de Firestore en localhost:8080:", emulatorError);
                        console.warn("[FirebaseConfig] Firestore intentará conectarse a la base de datos de PRODUCCIÓN porque la conexión al emulador falló.");
                    }
                }
            }
          } else {
            console.error("[FirebaseConfig] Instancia de Firestore es undefined en DESARROLLO. No se puede conectar al emulador.");
          }
        } else {
          console.log(`[FirebaseConfig] Modo PRODUCCIÓN detectado. Conectando a Cloud Firestore, proyecto ID: '${firebaseConfig.projectId}'.`);
          console.log("[FirebaseConfig] Si la conexión falla, verifica la configuración de tu proyecto Firebase (Firestore habilitado, estado de facturación) y tu conectividad de red.");
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
    console.error("[FirebaseConfig] ALERTA FINAL: La instancia de Firestore NO está disponible y NO se está usando la base de datos mock. Las operaciones de datos con Firestore fallarán. Verifica la configuración de tu proyecto Firebase y tu conexión a internet.");
} else if (firestoreInstance && !useMockDatabase) {
    console.log("[FirebaseConfig] ESTADO FINAL: La instancia de Firestore ESTÁ disponible para la aplicación (usando base de datos REAL o EMULADA).");
} else if (useMockDatabase) {
    // Este caso es si useMockDatabase es true, lo cual ya se maneja arriba.
    // console.warn("[FirebaseConfig] ESTADO FINAL: La aplicación está usando la BASE DE DATOS MOCK (en memoria).");
}
console.log("--- FIN CONFIGURACIÓN FIREBASE/FIRESTORE ---");

export { firestoreInstance as firestore, app };
