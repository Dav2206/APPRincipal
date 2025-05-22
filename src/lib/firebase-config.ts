
// src/lib/firebase-config.ts
import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app';
import { getFirestore, connectFirestoreEmulator, type Firestore, doc, getDoc } from 'firebase/firestore';
import { getFunctions, connectFunctionsEmulator, type Functions } from 'firebase/functions';
import { getAuth, connectAuthEmulator, type Auth } from 'firebase/auth';

console.log("[FirebaseConfig] Inicio de configuración. Timestamp:", new Date().toISOString());
console.log("[FirebaseConfig] Valor de process.env.NODE_ENV:", process.env.NODE_ENV);
console.log("[FirebaseConfig] Valor de process.env.NEXT_PUBLIC_USE_MOCK_DATABASE:", process.env.NEXT_PUBLIC_USE_MOCK_DATABASE);

// Esta variable determinará si se usan los datos mock o se intenta conectar a Firebase real.
// Para producción o para usar Firestore real, NEXT_PUBLIC_USE_MOCK_DATABASE debe ser 'false' o no estar definido.
const useMockDatabaseEnv = process.env.NEXT_PUBLIC_USE_MOCK_DATABASE;
const useMockDatabase = useMockDatabaseEnv === 'true'; // Removed 'export' here

console.log(`[FirebaseConfig] ¿Usar Base de Datos Mock (en memoria)?: ${useMockDatabase} (basado en NEXT_PUBLIC_USE_MOCK_DATABASE='${useMockDatabaseEnv}')`);

let app: FirebaseApp | undefined;
let firestoreInstance: Firestore | undefined;
let functionsInstance: Functions | undefined;
let authInstance: Auth | undefined;

// Configuración de Firebase (directamente en el código según tu solicitud)
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
  console.warn("[FirebaseConfig] ATENCIÓN: Aplicación configurada para usar BASE DE DATOS MOCK (en memoria). Los datos NO se guardarán en Firebase/Firestore real ni se intentará conectar.");
  // No se inicializa app, firestoreInstance, functionsInstance, authInstance si usamos mockDB
} else {
  console.log("[FirebaseConfig] Intentando conectar a servicios REALES de Firebase en la nube.");
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
        console.log("[FirebaseConfig] Instancia de Firestore obtenida (apuntando a la nube).");

        functionsInstance = getFunctions(app);
        console.log("[FirebaseConfig] Instancia de Functions obtenida (apuntando a la nube).");

        authInstance = getAuth(app);
        console.log("[FirebaseConfig] Instancia de Authentication obtenida (apuntando a la nube).");

        // Lectura de diagnóstico (opcional, pero útil)
        const performDiagnosticRead = async (db: Firestore) => {
          console.log("[FirebaseConfig-Diagnóstico] Intentando lectura de diagnóstico a Firestore en la nube...");
          try {
            const testDocRef = doc(db, "_connectivity_test_collection_debug", "test_doc_debug_cloud");
            await getDoc(testDocRef);
            console.log("[FirebaseConfig-Diagnóstico] ÉXITO: Lectura de diagnóstico a Firestore en la nube realizada.");
          } catch (error: any) {
            console.warn("[FirebaseConfig-Diagnóstico] FALLO: Error durante la lectura de diagnóstico a Firestore en la nube. Esto es esperado si la DB está vacía o las reglas son restrictivas. Error:", error.message);
            if (error.code === 'permission-denied') {
              console.warn("[FirebaseConfig-Diagnóstico] El error es 'permission-denied'. Verifica tus reglas de seguridad de Firestore.");
            } else if (error.code === 'unavailable' || error.message.includes('Could not reach Cloud Firestore backend')) {
              console.warn("[FirebaseConfig-Diagnóstico] El error es 'unavailable'. Verifica tu conexión a internet y la configuración de tu proyecto Firebase (API habilitada, facturación).");
            } else if (error.message && error.message.includes("firestore/indexes?create_composite")) {
              console.warn("[FirebaseConfig-Diagnóstico] El error indica que falta un índice en Firestore. Revisa la consola de Firebase para crear el índice necesario: ", error.message);
            }
          }
        };

        // Descomentar para probar la conexión a Firestore real
        // if (firestoreInstance && process.env.NODE_ENV === 'development') { // Solo en desarrollo para no spamear en prod
        //   performDiagnosticRead(firestoreInstance);
        // }

      } catch (e) {
        console.error("[FirebaseConfig] Error obteniendo instancia de Firestore/Functions/Auth para la nube:", e);
        firestoreInstance = undefined;
        functionsInstance = undefined;
        authInstance = undefined;
      }
    } else {
      console.error("[FirebaseConfig] App de Firebase NO inicializada. Firestore, Functions y Auth no pueden ser configurados o usados.");
    }
  }
}


// Lógica de conexión a emuladores SOLO si NO estamos usando la base de datos mock Y estamos en desarrollo
if (!useMockDatabase && process.env.NODE_ENV === 'development') {
  console.log("[FirebaseConfig] Modo DESARROLLO detectado (y NO usando mock DB).");
  if (firestoreInstance) {
    console.log("[FirebaseConfig] Intentando conectar Firestore al emulador en localhost:8080.");
    try {
      // Para evitar múltiples conexiones si el módulo se recarga (HMR)
      if (!(firestoreInstance as any)._settingsExperimental?.host?.includes('localhost')) {
        connectFirestoreEmulator(firestoreInstance, 'localhost', 8080);
        console.log("[FirebaseConfig] ÉXITO - Conexión al emulador de Firestore CONFIGURADA para localhost:8080.");
      } else {
        console.log("[FirebaseConfig] Emulador de Firestore YA configurado para localhost:8080.");
      }
    } catch (emulatorError: any) {
      console.error("[FirebaseConfig] ERROR conectando al emulador de Firestore en localhost:8080:", emulatorError);
      console.warn("[FirebaseConfig] Firestore usará la conexión a la NUBE. Asegúrate de que el emulador de Firestore esté ejecutándose si quieres usarlo.");
    }
  } else {
    console.warn("[FirebaseConfig] Instancia de Firestore no disponible para conectar al emulador.");
  }

  if (functionsInstance) {
    console.log("[FirebaseConfig] Intentando conectar Functions al emulador en localhost:5001.");
    try {
      // Para evitar múltiples conexiones
      if (!(functionsInstance as any).customDomain?.includes('localhost')) {
         connectFunctionsEmulator(functionsInstance, 'localhost', 5001);
         console.log("[FirebaseConfig] ÉXITO - Conexión al emulador de Functions CONFIGURADA para localhost:5001.");
      } else {
         console.log("[FirebaseConfig] Emulador de Functions YA configurado para localhost:5001.");
      }
    } catch (emulatorError: any) {
      console.error("[FirebaseConfig] ERROR conectando al emulador de Functions en localhost:5001:", emulatorError);
      console.warn("[FirebaseConfig] Functions usará la conexión a la NUBE.");
    }
  } else {
    console.warn("[FirebaseConfig] Instancia de Functions no disponible para conectar al emulador.");
  }

  if (authInstance) {
    console.log("[FirebaseConfig] Intentando conectar Auth al emulador en localhost:9099.");
    try {
        // Para evitar múltiples conexiones
        // La propiedad para verificar si el emulador de Auth ya está conectado es un poco menos directa.
        // Una forma es verificar si el `authInstance.emulatorConfig` ya está seteado.
        if (!(authInstance as any).config?.emulator?.url) {
            connectAuthEmulator(authInstance, 'http://localhost:9099');
            console.log("[FirebaseConfig] ÉXITO - Conexión al emulador de Auth CONFIGURADA para localhost:9099.");
        } else {
            console.log("[FirebaseConfig] Emulador de Auth YA configurado para localhost:9099.");
        }
    } catch (emulatorError: any) {
        console.error("[FirebaseConfig] ERROR conectando al emulador de Auth en localhost:9099:", emulatorError);
        console.warn("[FirebaseConfig] Auth usará la conexión a la NUBE.");
    }
  } else {
      console.warn("[FirebaseConfig] Instancia de Auth no disponible para conectar al emulador.");
  }
} else if (!useMockDatabase && process.env.NODE_ENV !== 'development') {
    console.log(`[FirebaseConfig] Modo PRODUCCIÓN detectado (o entorno no 'development'). Conectando a Cloud Firebase real, proyecto ID: '${firebaseConfig.projectId}'.`);
    console.log("[FirebaseConfig] Si la conexión falla, revisa las credenciales en este archivo, la configuración de tu proyecto Firebase (servicios habilitados, estado de facturación, APIs habilitadas) y tu conectividad de red.");
}


if (useMockDatabase) {
  console.log("[FirebaseConfig] ESTADO FINAL: La aplicación está usando la BASE DE DATOS MOCK (en memoria). Firestore, Functions y Auth reales no serán contactados.");
} else {
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
   if (!authInstance) {
      console.warn("[FirebaseConfig] ALERTA FINAL: La instancia de Authentication NO está disponible. Las operaciones de autenticación fallarán.");
  } else {
      console.log("[FirebaseConfig] ESTADO FINAL: La instancia de Authentication ESTÁ disponible para la aplicación (intentando usar base de datos REAL o EMULADA).");
  }
}
console.log("--- [FirebaseConfig] FIN CONFIGURACIÓN FIREBASE/FIRESTORE/FUNCTIONS/AUTH ---");

export { firestoreInstance as firestore, app, functionsInstance as functions, authInstance as auth, useMockDatabase };
