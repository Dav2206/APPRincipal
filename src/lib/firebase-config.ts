
// src/lib/firebase-config.ts
import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app';
import { getFirestore, connectFirestoreEmulator, type Firestore } from 'firebase/firestore';

// Hardcoded Firebase configuration (as provided by the user in a previous step)
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

// Determine if using mock database based on environment variable
// If NEXT_PUBLIC_USE_MOCK_DATABASE is 'true', useMock is true. Otherwise, it's false.
const useMockDatabase = process.env.NEXT_PUBLIC_USE_MOCK_DATABASE === 'true';

console.log("[FirebaseConfig] Inicio de configuración. Timestamp:", new Date().toISOString());
console.log("[FirebaseConfig] Valor de process.env.NODE_ENV:", process.env.NODE_ENV);
console.log("[FirebaseConfig] Valor de process.env.NEXT_PUBLIC_USE_MOCK_DATABASE:", process.env.NEXT_PUBLIC_USE_MOCK_DATABASE);
console.log("[FirebaseConfig] ¿Usar Base de Datos Mock (en memoria)?:", useMockDatabase);

if (useMockDatabase) {
  console.warn("[FirebaseConfig] ATENCIÓN: Aplicación configurada para usar BASE DE DATOS MOCK (en memoria) debido a NEXT_PUBLIC_USE_MOCK_DATABASE=true. Los datos NO se guardarán en Firebase/Firestore real.");
  // app and firestoreInstance will remain undefined, data.ts will handle this
} else {
  console.log("[FirebaseConfig] Intentando conectar a servicios REALES de Firebase/Firestore.");
  console.log("[FirebaseConfig] Usando credenciales hardcodeadas para el proyecto ID:", `'${firebaseConfig.projectId}'. Verifica que este sea tu Project ID deseado.`);

  if (!firebaseConfig.projectId || !firebaseConfig.apiKey) {
    console.error(
      '[FirebaseConfig] CRÍTICO: Las credenciales hardcodeadas de Firebase son incompletas (falta projectId o apiKey). Firebase NO se inicializará correctamente.'
    );
  } else {
    try {
      if (!getApps().length) {
        app = initializeApp(firebaseConfig);
        console.log("[FirebaseConfig] App de Firebase inicializada (nueva instancia) con credenciales hardcodeadas.");
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
          console.log("[FirebaseConfig] Modo DESARROLLO detectado (y NO usando mock DB).");
          if (firestoreInstance) {
            console.log("[FirebaseConfig] Intentando conectar Firestore al emulador en localhost:8080.");
            try {
              const settings = (firestoreInstance as any)._settings || {};
              if (settings.host && settings.host.includes('localhost') && settings.port === 8080) {
                console.log(`[FirebaseConfig] Emulador de Firestore YA PARECE ESTAR conectado en ${settings.host}:${settings.port}. No se reconectará.`);
              } else {
                connectFirestoreEmulator(firestoreInstance, 'localhost', 8080);
                console.log("[FirebaseConfig] ÉXITO - Conexión al emulador de Firestore CONFIGURADA para localhost:8080.");
              }
              console.log("[FirebaseConfig] Si usas el emulador, asegúrate de que esté ejecutándose (ej: 'firebase emulators:start').");
            } catch (emulatorError: any) {
               if (emulatorError.code === 'failed-precondition' || (emulatorError.message && emulatorError.message.includes('settings can no longer be changed'))) {
                  console.warn("[FirebaseConfig] Advertencia: El emulador de Firestore ya estaba configurado o las configuraciones no se pueden cambiar. Esto puede ser normal con recargas en caliente (hot-reload) o si ya se realizó una operación de Firestore.");
              } else {
                  console.error("[FirebaseConfig] ERROR conectando al emulador de Firestore en localhost:8080:", emulatorError);
                  console.warn("[FirebaseConfig] Firestore intentará conectarse a la base de datos de PRODUCCIÓN porque la conexión al emulador falló. Verifica el estado del emulador.");
              }
            }
          } else {
            console.error("[FirebaseConfig] Firestore instance es undefined en DESARROLLO. No se puede conectar al emulador.");
          }
        } else {
          console.log(`[FirebaseConfig] Modo PRODUCCIÓN detectado (o entorno no 'development'). Conectando a Cloud Firestore real, proyecto ID: '${firebaseConfig.projectId}'.`);
          console.log("[FirebaseConfig] Si la conexión falla, revisa las credenciales en este archivo, la configuración de tu proyecto Firebase (Firestore habilitado, estado de facturación) y tu conectividad de red.");
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
console.log("--- [FirebaseConfig] FIN CONFIGURACIÓN FIREBASE/FIRESTORE ---");

export { firestoreInstance as firestore, app, useMockDatabase };
