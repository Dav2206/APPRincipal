
// src/lib/firebase-config.ts
import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app';
import { getFirestore, connectFirestoreEmulator, type Firestore, doc, getDoc, collection, query, limit, getDocs as getDocsFirestore } from 'firebase/firestore';
import { getFunctions, connectFunctionsEmulator, type Functions } from 'firebase/functions';

// Esta variable determinará si se usan los datos mock o se intenta conectar a Firebase real/emulador.
// Para producción o para usar Firestore real/emulador, NEXT_PUBLIC_USE_MOCK_DATABASE debe ser 'false' o no estar definido.
const useMockDatabaseEnv = process.env.NEXT_PUBLIC_USE_MOCK_DATABASE;
export const useMockDatabase = useMockDatabaseEnv === 'true'; // Exporta para que data.ts pueda usarla

console.log("[FirebaseConfig] Inicio de configuración. Timestamp:", new Date().toISOString());
console.log("[FirebaseConfig] Valor de process.env.NODE_ENV:", process.env.NODE_ENV);
console.log("[FirebaseConfig] Valor de process.env.NEXT_PUBLIC_USE_MOCK_DATABASE:", useMockDatabaseEnv);
console.log(`[FirebaseConfig] ¿Usar Base de Datos Mock (en memoria)?: ${useMockDatabase}`);

let app: FirebaseApp | undefined;
let firestoreInstance: Firestore | undefined;
let functionsInstance: Functions | undefined;

// Configuración de Firebase proporcionada por el usuario
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

if (useMockDatabase) {
  console.warn("[FirebaseConfig] ATENCIÓN: Aplicación configurada para usar BASE DE DATOS MOCK (en memoria) a través de NEXT_PUBLIC_USE_MOCK_DATABASE=true. Los datos NO se guardarán en Firebase/Firestore real ni se intentará conectar.");
  // app, firestoreInstance, functionsInstance permanecerán undefined
} else {
  console.log("[FirebaseConfig] Intentando conectar a servicios REALES o EMULADOS de Firebase/Firestore.");
  console.log(`[FirebaseConfig] Usando credenciales hardcodeadas para el proyecto ID: '${firebaseConfig.projectId}'. Verifica que este sea tu Project ID deseado.`);

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
      console.log(`[FirebaseConfig] App de Firebase conectada correctamente al proyecto: '${app.options.projectId}'. Verifica que este sea tu Project ID deseado ('${firebaseConfig.projectId}').`);
      try {
        firestoreInstance = getFirestore(app);
        console.log("[FirebaseConfig] Instancia de Firestore obtenida.");

        functionsInstance = getFunctions(app);
        console.log("[FirebaseConfig] Instancia de Functions obtenida.");

        const performDiagnosticRead = async (db: Firestore) => {
          console.log("[FirebaseConfig-Diagnóstico] Intentando lectura de diagnóstico a Firestore...");
          try {
            const testDocRef = doc(db, "_connectivity_test_collection_debug", "test_doc_debug");
            await getDoc(testDocRef);
            console.log("[FirebaseConfig-Diagnóstico] ÉXITO: Lectura de diagnóstico a Firestore realizada. La conexión a Firestore parece estar funcionando.");
          } catch (error: any) {
            console.error("[FirebaseConfig-Diagnóstico] FALLO: Error durante la lectura de diagnóstico a Firestore:", error.message);
            if (error.code === 'permission-denied') {
              console.warn("[FirebaseConfig-Diagnóstico] El error es 'permission-denied'. Verifica tus reglas de seguridad de Firestore.");
            } else if (error.code === 'unavailable') {
              console.warn("[FirebaseConfig-Diagnóstico] El error es 'unavailable'. Verifica tu conexión a internet, que la API de Firestore esté habilitada en Google Cloud Console para este proyecto, y que no haya problemas de facturación.");
            }
          }
        };

        if (process.env.NODE_ENV === 'development') {
          console.log("[FirebaseConfig] Modo DESARROLLO detectado (y NO usando mock DB).");
          if (firestoreInstance) {
            console.log("[FirebaseConfig] Intentando conectar Firestore al emulador en localhost:8080.");
            try {
              if (!(firestoreInstance as any)._settings?.host?.includes('localhost')) { // Evitar reconectar si ya está
                   connectFirestoreEmulator(firestoreInstance, 'localhost', 8080);
                   console.log("[FirebaseConfig] ÉXITO - Conexión al emulador de Firestore CONFIGURADA para localhost:8080.");
              } else {
                   console.log("[FirebaseConfig] Emulador de Firestore YA PARECE ESTAR configurado para un host local.");
              }
              console.log("[FirebaseConfig] Si usas el emulador, asegúrate de que esté ejecutándose (ej: 'firebase emulators:start').");
              // performDiagnosticRead(firestoreInstance); // Diagnóstico para emulador
            } catch (emulatorError: any) {
              if (emulatorError.message?.includes("initializeFirestore() has already been called")) {
                console.warn("[FirebaseConfig] Advertencia: Firestore ya fue inicializado (posiblemente con emulador), no se puede reconectar en esta recarga en caliente. Esto es normal si el emulador ya estaba conectado.");
              } else {
                console.error("[FirebaseConfig] ERROR conectando al emulador de Firestore en localhost:8080:", emulatorError);
                console.warn("[FirebaseConfig] Firestore intentará conectar a la base de datos de PRODUCCIÓN porque la conexión al emulador falló. Verifica el estado del emulador y conflictos de puerto.");
                // performDiagnosticRead(firestoreInstance); // Diagnóstico para producción si emulador falló
              }
            }
          } else {
            console.error("[FirebaseConfig] Firestore instance es undefined en DESARROLLO. No se puede conectar al emulador.");
          }
          
          if (functionsInstance) {
            console.log("[FirebaseConfig] Intentando conectar Functions al emulador en localhost:5001.");
            try {
                connectFunctionsEmulator(functionsInstance, 'localhost', 5001);
                console.log("[FirebaseConfig] ÉXITO - Conexión al emulador de Functions CONFIGURADA para localhost:5001.");
            } catch (emulatorError: any) {
                 console.error("[FirebaseConfig] ERROR conectando al emulador de Functions en localhost:5001:", emulatorError);
            }
          } else {
            console.error("[FirebaseConfig] Functions instance es undefined en DESARROLLO. No se puede conectar al emulador.");
          }
        } else { // Modo Producción (o no desarrollo explícito)
          console.log(`[FirebaseConfig] Modo PRODUCCIÓN detectado (o entorno no 'development'). Conectando a Cloud Firestore real, proyecto ID: '${firebaseConfig.projectId}'.`);
          console.log("[FirebaseConfig] Si la conexión falla, revisa las credenciales en este archivo, la configuración de tu proyecto Firebase (Firestore habilitado, estado de facturación, APIs habilitadas) y tu conectividad de red.");
          if (firestoreInstance) {
            // performDiagnosticRead(firestoreInstance); // Diagnóstico para producción
          }
        }
      } catch (e) {
        console.error("[FirebaseConfig] Error obteniendo instancia de Firestore/Functions o durante la lógica de configuración del emulador/producción:", e);
        firestoreInstance = undefined;
        functionsInstance = undefined;
      }
    } else {
      console.error("[FirebaseConfig] App de Firebase NO inicializada (app es undefined). Firestore y Functions no pueden ser configurados o usados.");
    }
  }
}

if (!useMockDatabase) {
  if (!firestoreInstance) {
      console.warn("[FirebaseConfig] ALERTA FINAL: La instancia de Firestore NO está disponible. Las operaciones de datos con Firestore fallarán.");
  } else {
      console.log("[FirebaseConfig] ESTADO FINAL: La instancia de Firestore ESTÁ disponible para la aplicación (intentando usar base de datos REAL o EMULADA).");
  }
  if (!functionsInstance) {
      console.warn("[FirebaseConfig] ALERTA FINAL: La instancia de Functions NO está disponible. Las llamadas a Firebase Functions fallarán.");
  } else {
      console.log("[FirebaseConfig] ESTADO FINAL: La instancia de Functions ESTÁ disponible para la aplicación (intentando usar base de datos REAL o EMULADA).");
  }
} else {
    console.log("[FirebaseConfig] ESTADO FINAL: La aplicación está usando la BASE DE DATOS MOCK (en memoria). Firestore y Functions reales no serán contactados.");
}
console.log("--- [FirebaseConfig] FIN CONFIGURACIÓN FIREBASE/FIRESTORE/FUNCTIONS ---");

export { firestoreInstance as firestore, app, functionsInstance as functions };
