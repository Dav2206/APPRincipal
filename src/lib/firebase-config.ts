
// src/lib/firebase-config.ts
import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app';
import { getFirestore, connectFirestoreEmulator, type Firestore } from 'firebase/firestore';

// This flag determines if we use the mock data or attempt to connect to Firebase
// To use mock data, set NEXT_PUBLIC_USE_MOCK_DATABASE=true in your .env.local file
export const useMockDatabase = process.env.NEXT_PUBLIC_USE_MOCK_DATABASE === 'true';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "footprints-scheduler-ywrwg",
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

let app: FirebaseApp | undefined;
let firestoreInstance: Firestore | undefined;

console.log("Firebase Config Module: Iniciando configuración...");
console.log(`Firebase Config Module: NEXT_PUBLIC_USE_MOCK_DATABASE (desde env) = ${process.env.NEXT_PUBLIC_USE_MOCK_DATABASE}`);
console.log(`Firebase Config Module: useMockDatabase (interpretado) = ${useMockDatabase}`);
console.log(`Firebase Config Module: Project ID para inicialización = ${firebaseConfig.projectId}`);

if (useMockDatabase) {
  console.warn("Firebase Config Module: USANDO BASE DE DATOS MOCK (EN MEMORIA). No se intentará conexión a Firebase/Firestore real.");
  app = undefined;
  firestoreInstance = undefined;
} else {
  console.log("Firebase Config Module: Intentando conectar a servicios REALES de Firebase (Firestore).");
  const essentialConfigsMissing = !firebaseConfig.apiKey || !firebaseConfig.authDomain || !firebaseConfig.projectId;

  if (essentialConfigsMissing) {
    console.error(
      'CRÍTICO - Configuración Firebase: Faltan configuraciones esenciales (apiKey, authDomain, projectId). Asegúrate de que todas las variables NEXT_PUBLIC_FIREBASE_ estén en tu .env.local. Firestore NO se inicializará.'
    );
    if (!firebaseConfig.apiKey) console.error("Error Config Firebase: Falta NEXT_PUBLIC_FIREBASE_API_KEY");
    if (!firebaseConfig.authDomain) console.error("Error Config Firebase: Falta NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN");
    if (!firebaseConfig.projectId) console.error("Error Config Firebase: Falta NEXT_PUBLIC_FIREBASE_PROJECT_ID (esencial para Firestore).");
    app = undefined;
    firestoreInstance = undefined;
  } else {
    console.log("Firebase Config Module: Variables esenciales de Firebase (apiKey, authDomain, projectId) parecen estar presentes.");
    try {
      if (!getApps().length) {
        app = initializeApp(firebaseConfig);
        console.log("Firebase Config Module: App de Firebase inicializada (nueva instancia).");
      } else {
        app = getApp();
        console.log("Firebase Config Module: App de Firebase ya existía (usando instancia existente).");
      }
    } catch (e) {
      console.error("Firebase Config Module: Error inicializando la app de Firebase:", e);
      app = undefined;
    }

    if (app) {
      console.log(`Firebase Config Module: App de Firebase inicializada correctamente para el proyecto ID: '${app.options.projectId}'.`);
      try {
        firestoreInstance = getFirestore(app);
        console.log("Firebase Config Module: Instancia de Firestore obtenida.");

        if (process.env.NODE_ENV === 'development') {
          console.log("Firebase Config Module: Entorno de DESARROLLO detectado.");
          if (firestoreInstance) {
            // Comprobación para evitar múltiples conexiones al emulador si ya está conectado
            // Esta comprobación puede variar un poco dependiendo de la versión exacta del SDK, 
            // pero la idea es ver si ya tiene un host configurado que sea localhost.
            const firestoreSettings = (firestoreInstance as any)._settings || (firestoreInstance as any).settings;
            if (firestoreSettings && firestoreSettings.host && firestoreSettings.host.includes('localhost')) {
               console.log("Firebase Config Module: Emulador de Firestore YA PARECE ESTAR configurado en localhost:8080.");
            } else {
              console.log("Firebase Config Module: Intentando conectar Firestore al emulador en localhost:8080.");
              try {
                connectFirestoreEmulator(firestoreInstance, 'localhost', 8080);
                console.log("Firebase Config Module: ÉXITO - Conexión al emulador de Firestore CONFIGURADA para localhost:8080.");
                console.log("Firebase Config Module: Asegúrate de que el emulador de Firestore esté corriendo (ej: 'firebase emulators:start').");
              } catch (emulatorError) {
                console.error("Firebase Config Module: ERROR durante connectFirestoreEmulator(firestoreInstance, 'localhost', 8080):", emulatorError);
                console.warn("Firebase Config Module: Firestore intentará conectarse a la base de datos de PRODUCCIÓN porque la conexión al emulador falló. Verifica el estado del emulador y posibles conflictos de puerto.");
              }
            }
          } else {
            console.error("Firebase Config Module: Instancia de Firestore es undefined en DESARROLLO. No se puede conectar al emulador.");
          }
        } else {
          console.log(`Firebase Config Module: Entorno de PRODUCCIÓN detectado. Conectando a Cloud Firestore, proyecto ID: '${firebaseConfig.projectId}'.`);
          console.log("Firebase Config Module: Si la conexión falla, revisa tus variables .env, la configuración de tu proyecto Firebase (Firestore habilitado, estado de facturación), y tu conectividad de red.");
        }
      } catch (e) {
        console.error("Firebase Config Module: Error obteniendo instancia de Firestore o durante la lógica de emulador/producción:", e);
        firestoreInstance = undefined; 
      }
    } else {
      console.error("Firebase Config Module: App de Firebase NO inicializada. Firestore no puede ser configurado o usado.");
    }
  }
}

if (!firestoreInstance && !useMockDatabase) {
    console.warn("Firebase Config Module: La instancia de Firestore NO está disponible al final de la configuración (y no se está usando mock). Las operaciones de datos probablemente fallarán si se esperaba una base de datos REAL.");
} else if (firestoreInstance && !useMockDatabase) {
    console.log("Firebase Config Module: La instancia de Firestore ESTÁ disponible para exportar (usando base de datos REAL).");
} else if (useMockDatabase) {
    console.log("Firebase Config Module: La instancia de Firestore está INDEFINIDA porque useMockDatabase es true.");
}

export { firestoreInstance as firestore, app };
