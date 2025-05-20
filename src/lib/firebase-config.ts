
// src/lib/firebase-config.ts
import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app';
import { getFirestore, connectFirestoreEmulator, type Firestore } from 'firebase/firestore';

// Esta variable determina si se usa la base de datos mock en memoria o se intenta conectar a Firebase/Firestore real.
// Para conectar a Firestore real, NEXT_PUBLIC_USE_MOCK_DATABASE debe ser 'false' o no estar definida en .env.local.
// Si NEXT_PUBLIC_USE_MOCK_DATABASE es 'true', se usará la base de datos mock.
export const useMockDatabase = process.env.NEXT_PUBLIC_USE_MOCK_DATABASE === 'true';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: "footprints-scheduler-ywrwg", // Directamente configurado según solicitud previa
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

let app: FirebaseApp | undefined;
let firestoreInstance: Firestore | undefined;

console.log("--- INICIO CONFIGURACIÓN FIREBASE/FIRESTORE ---");
console.log(`[FirebaseConfig] ¿Usar Base de Datos Mock (en memoria)? ${useMockDatabase} (basado en NEXT_PUBLIC_USE_MOCK_DATABASE='${process.env.NEXT_PUBLIC_USE_MOCK_DATABASE}')`);

if (useMockDatabase) {
  console.warn("[FirebaseConfig] ATENCIÓN: La aplicación está configurada para usar la BASE DE DATOS MOCK (en memoria). Los datos NO se guardarán en Firebase/Firestore real y se perderán al recargar.");
  app = undefined;
  firestoreInstance = undefined;
} else {
  console.log("[FirebaseConfig] Intentando conectar a servicios REALES de Firebase/Firestore.");
  console.log(`[FirebaseConfig] Usando Project ID para inicialización: '${firebaseConfig.projectId}'`);

  const essentialConfigsMissing = !firebaseConfig.apiKey || !firebaseConfig.authDomain || !firebaseConfig.projectId;

  if (essentialConfigsMissing) {
    console.error(
      '[FirebaseConfig] CRÍTICO: Faltan configuraciones esenciales de Firebase (apiKey, authDomain, projectId). Revisa tus variables de entorno en .env.local. Firebase NO se inicializará correctamente.'
    );
    if (!firebaseConfig.apiKey) console.error("[FirebaseConfig] Error: Falta NEXT_PUBLIC_FIREBASE_API_KEY");
    if (!firebaseConfig.authDomain) console.error("[FirebaseConfig] Error: Falta NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN");
    if (!firebaseConfig.projectId) console.error("[FirebaseConfig] Error: Falta NEXT_PUBLIC_FIREBASE_PROJECT_ID (este es el que pusiste como 'footprints-scheduler-ywrwg').");
    app = undefined;
    firestoreInstance = undefined;
  } else {
    console.log("[FirebaseConfig] Variables de entorno esenciales para Firebase (apiKey, authDomain, projectId) parecen estar presentes.");
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
      console.log(`[FirebaseConfig] App de Firebase conectada correctamente al proyecto: '${app.options.projectId}'.`);
      try {
        firestoreInstance = getFirestore(app);
        console.log("[FirebaseConfig] Instancia de Firestore obtenida.");

        if (process.env.NODE_ENV === 'development') {
          console.log("[FirebaseConfig] Modo DESARROLLO detectado.");
          if (firestoreInstance) {
            // Verificamos si ya está conectado al emulador para no intentar conectar múltiples veces
            const settings = (firestoreInstance as any)._settings || (firestoreInstance as any).settings;
            if (settings && settings.host && settings.host.includes('localhost')) {
              console.log("[FirebaseConfig] Emulador de Firestore YA PARECE ESTAR conectado en localhost:8080.");
            } else {
              console.log("[FirebaseConfig] Intentando conectar Firestore al emulador en localhost:8080.");
              try {
                connectFirestoreEmulator(firestoreInstance, 'localhost', 8080);
                console.log("[FirebaseConfig] ÉXITO - Conexión al emulador de Firestore CONFIGURADA para localhost:8080.");
                console.log("[FirebaseConfig]   Asegúrate de que el emulador de Firestore esté ejecutándose (ej: 'firebase emulators:start').");
              } catch (emulatorError) {
                console.error("[FirebaseConfig] ERROR conectando al emulador de Firestore en localhost:8080:", emulatorError);
                console.warn("[FirebaseConfig] Firestore intentará conectarse a la base de datos de PRODUCCIÓN porque la conexión al emulador falló.");
              }
            }
          } else {
            console.error("[FirebaseConfig] Instancia de Firestore es undefined en DESARROLLO. No se puede conectar al emulador.");
          }
        } else {
          console.log(`[FirebaseConfig] Modo PRODUCCIÓN detectado. Conectando a Cloud Firestore, proyecto ID: '${firebaseConfig.projectId}'.`);
        }
      } catch (e) {
        console.error("[FirebaseConfig] Error obteniendo instancia de Firestore o configurando emulador:", e);
        firestoreInstance = undefined;
      }
    } else {
      console.error("[FirebaseConfig] App de Firebase NO inicializada. Firestore no puede ser configurado.");
    }
  }
}

if (!firestoreInstance && !useMockDatabase) {
    console.error("[FirebaseConfig] ALERTA FINAL: La instancia de Firestore NO está disponible y NO se está usando la base de datos mock. Las operaciones de datos con Firestore fallarán.");
} else if (firestoreInstance && !useMockDatabase) {
    console.log("[FirebaseConfig] ESTADO FINAL: La instancia de Firestore ESTÁ disponible para la aplicación (usando base de datos REAL o EMULADA).");
} else if (useMockDatabase) {
    console.warn("[FirebaseConfig] ESTADO FINAL: La aplicación está usando la BASE DE DATOS MOCK (en memoria).");
}
console.log("--- FIN CONFIGURACIÓN FIREBASE/FIRESTORE ---");

export { firestoreInstance as firestore, app };

    