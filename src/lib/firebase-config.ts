// src/lib/firebase-config.ts
import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app';
import { getFirestore, connectFirestoreEmulator, type Firestore, doc, getDoc, collection, query, limit, getDocs as getDocsFirestore } from 'firebase/firestore'; // Added imports for diagnostic
import { getFunctions, connectFunctionsEmulator, type Functions } from 'firebase/functions'; // <--- AÑADIDO

// Determine if using mock database based on environment variable
// For new projects or if NEXT_PUBLIC_USE_MOCK_DATABASE is not set, it defaults to false (attempting Firebase connection).
const useMockDatabaseEnv = process.env.NEXT_PUBLIC_USE_MOCK_DATABASE;
const useMockDatabase = useMockDatabaseEnv === 'true';

console.log("[FirebaseConfig] Inicio de configuración. Timestamp:", new Date().toISOString());
console.log("[FirebaseConfig] Valor de process.env.NODE_ENV:", process.env.NODE_ENV);
console.log("[FirebaseConfig] Valor de process.env.NEXT_PUBLIC_USE_MOCK_DATABASE:", useMockDatabaseEnv);
console.log(`[FirebaseConfig] ¿Usar Base de Datos Mock (en memoria)?: ${useMockDatabase}`);

let app: FirebaseApp | undefined;
let firestoreInstance: Firestore | undefined;
let functionsInstance: Functions | undefined; // <--- AÑADIDO

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

console.log(`[FirebaseConfig] Usando credenciales hardcodeadas para el proyecto ID: '${firebaseConfig.projectId}'. Verifica que este sea tu Project ID deseado.`);

if (useMockDatabase) {
  console.warn("[FirebaseConfig] ATENCIÓN: Aplicación configurada para usar BASE DE DATOS MOCK (en memoria). Los datos NO se guardarán en Firebase/Firestore real.");
  // app, firestoreInstance, functionsInstance permanecerán undefined
} else {
  console.log("[FirebaseConfig] Intentando conectar a servicios REALES o EMULADOS de Firebase.");

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

        functionsInstance = getFunctions(app); // <--- AÑADIDO
        console.log("[FirebaseConfig] Instancia de Functions obtenida.");


        // --- Intento de lectura de diagnóstico a Firestore (solo para depuración) ---
        const performDiagnosticRead = async (db: Firestore) => {
          console.log("[FirebaseConfig-Diagnóstico] Intentando lectura de diagnóstico a Firestore...");
          try {
            const testDocRef = doc(db, "_connectivity_test_collection_debug", "test_doc_debug");
            await getDoc(testDocRef); // No necesitamos el resultado, solo ver si la operación tiene éxito
            console.log("[FirebaseConfig-Diagnóstico] ÉXITO: Lectura de diagnóstico a Firestore realizada. La conexión a Firestore parece estar funcionando.");
          } catch (error: any) {
            console.error("[FirebaseConfig-Diagnóstico] FALLO: Error durante la lectura de diagnóstico a Firestore:", error.message);
            if (error.code === 'permission-denied') {
              console.warn("[FirebaseConfig-Diagnóstico] El error es 'permission-denied'. Verifica tus reglas de seguridad de Firestore.");
            } else if (error.code === 'unavailable') {
              console.warn("[FirebaseConfig-Diagnóstico] El error es 'unavailable'. Verifica tu conexión a internet y que los servicios de Firestore estén activos para tu proyecto.");
            }
          }
        };
        // --- Fin del intento de lectura de diagnóstico ---

        if (process.env.NODE_ENV === 'development') {
          console.log("[FirebaseConfig] Modo DESARROLLO detectado (y NO usando mock DB).");
          if (firestoreInstance) {
            console.log("[FirebaseConfig] Intentando conectar Firestore al emulador en localhost:8080.");
            try {
                if (!(firestoreInstance as any)._settingsHost?.includes('localhost')) {
                     connectFirestoreEmulator(firestoreInstance, 'localhost', 8080);
                     console.log("[FirebaseConfig] ÉXITO - Conexión al emulador de Firestore CONFIGURADA para localhost:8080.");
                } else {
                     console.log("[FirebaseConfig] Emulador de Firestore YA PARECE ESTAR configurado para un host local.");
                }
            } catch (emulatorError: any) {
              if (emulatorError.message?.includes("initializeFirestore() has already been called")) {
                console.warn("[FirebaseConfig] Advertencia: Firestore ya fue inicializado, no se puede reconectar al emulador en esta recarga en caliente. Esto es normal.");
              } else {
                console.error("[FirebaseConfig] ERROR conectando al emulador de Firestore en localhost:8080:", emulatorError);
              }
            }
          } else {
            console.error("[FirebaseConfig] Firestore instance es undefined en DESARROLLO. No se puede conectar al emulador.");
          }
          
          if (functionsInstance) { // <--- AÑADIDO: Conectar Functions al emulador
            console.log("[FirebaseConfig] Intentando conectar Functions al emulador en localhost:5001.");
            try {
                // Asumiendo que `functionsInstance.emulatorOrigin` no existe o es la forma de verificar
                // En versiones más nuevas, no se necesita verificar si ya está conectado, connectFunctionsEmulator se puede llamar múltiples veces pero solo conecta una vez.
                connectFunctionsEmulator(functionsInstance, 'localhost', 5001);
                console.log("[FirebaseConfig] ÉXITO - Conexión al emulador de Functions CONFIGURADA para localhost:5001.");
            } catch (emulatorError: any) {
                 console.error("[FirebaseConfig] ERROR conectando al emulador de Functions en localhost:5001:", emulatorError);
            }
          } else {
            console.error("[FirebaseConfig] Functions instance es undefined en DESARROLLO. No se puede conectar al emulador.");
          }


          if (firestoreInstance) {
            performDiagnosticRead(firestoreInstance);
          }

        } else {
          console.log(`[FirebaseConfig] Modo PRODUCCIÓN detectado (o entorno no 'development'). Conectando a Cloud Firestore real, proyecto ID: '${firebaseConfig.projectId}'.`);
        }
      } catch (e) {
        console.error("[FirebaseConfig] Error obteniendo instancia de Firestore/Functions o durante la lógica de configuración del emulador/producción:", e);
        firestoreInstance = undefined;
        functionsInstance = undefined;
      }
    } else {
      console.error("[FirebaseConfig] App de Firebase NO inicializada. Firestore y Functions no pueden ser configurados o usados.");
    }
  }
}

if (!useMockDatabase) {
  if (!firestoreInstance) {
      console.warn("[FirebaseConfig] ALERTA FINAL: La instancia de Firestore NO está disponible. Las operaciones de datos con Firestore fallarán.");
  } else {
      console.log("[FirebaseConfig] ESTADO FINAL: La instancia de Firestore ESTÁ disponible para la aplicación.");
  }
  if (!functionsInstance) { // <--- AÑADIDO
      console.warn("[FirebaseConfig] ALERTA FINAL: La instancia de Functions NO está disponible. Las llamadas a Firebase Functions fallarán.");
  } else {
      console.log("[FirebaseConfig] ESTADO FINAL: La instancia de Functions ESTÁ disponible para la aplicación.");
  }
} else {
    console.log("[FirebaseConfig] ESTADO FINAL: La aplicación está usando la BASE DE DATOS MOCK (en memoria). Firestore y Functions reales no serán contactados.");
}
console.log("--- [FirebaseConfig] FIN CONFIGURACIÓN FIREBASE/FIRESTORE/FUNCTIONS ---");

export { firestoreInstance as firestore, app, useMockDatabase, functionsInstance as functions }; // <--- AÑADIDO functionsInstance

    