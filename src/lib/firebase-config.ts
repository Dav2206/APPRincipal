
// src/lib/firebase-config.ts
import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app';
import { getFirestore, connectFirestoreEmulator, type Firestore, doc, getDoc } from 'firebase/firestore';
import { getFunctions, connectFunctionsEmulator, type Functions } from 'firebase/functions';
import { getAuth, connectAuthEmulator, type Auth } from 'firebase/auth';

// Esta variable determinará si se usan los datos mock o se intenta conectar a Firebase real.
// Para producción o para usar Firestore real, NEXT_PUBLIC_USE_MOCK_DATABASE debe ser 'false' o no estar definido.
const useMockDatabaseEnv = process.env.NEXT_PUBLIC_USE_MOCK_DATABASE;
export const useMockDatabase = useMockDatabaseEnv === 'true';

console.log("[FirebaseConfig] Inicio de configuración. Timestamp:", new Date().toISOString());
console.log("[FirebaseConfig] Valor de process.env.NODE_ENV:", process.env.NODE_ENV);
console.log("[FirebaseConfig] Valor de process.env.NEXT_PUBLIC_USE_MOCK_DATABASE:", useMockDatabaseEnv);
console.log(`[FirebaseConfig] ¿Usar Base de Datos Mock (en memoria)?: ${useMockDatabase}`);

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
            console.error("[FirebaseConfig-Diagnóstico] FALLO: Error durante la lectura de diagnóstico a Firestore en la nube:", error.message);
            if (error.code === 'permission-denied') {
              console.warn("[FirebaseConfig-Diagnóstico] El error es 'permission-denied'. Verifica tus reglas de seguridad de Firestore.");
            } else if (error.code === 'unavailable' || error.message.includes('Could not reach Cloud Firestore backend')) {
              console.warn("[FirebaseConfig-Diagnóstico] El error es 'unavailable'. Verifica tu conexión a internet y la configuración de tu proyecto Firebase (API habilitada, facturación).");
            } else if (error.message && error.message.includes("firestore/indexes?create_composite")) {
              console.warn("[FirebaseConfig-Diagnóstico] El error indica que falta un índice en Firestore. Revisa la consola de Firebase para crear el índice necesario: ", error.message);
            } else {
              console.warn("[FirebaseConfig-Diagnóstico] Otro tipo de error en la lectura de diagnóstico:", error);
            }
          }
        };

        if (firestoreInstance) {
           // performDiagnosticRead(firestoreInstance); // Puedes habilitar esto para probar la conexión
        }

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

if (!useMockDatabase) {
  if (!firestoreInstance) {
      console.warn("[FirebaseConfig] ALERTA FINAL: La instancia de Firestore NO está disponible. Las operaciones de datos con Firestore fallarán.");
  } else {
      console.log("[FirebaseConfig] ESTADO FINAL: La instancia de Firestore ESTÁ disponible para la aplicación (intentando usar base de datos REAL en la nube).");
  }
  if (!functionsInstance) {
      console.warn("[FirebaseConfig] ALERTA FINAL: La instancia de Functions NO está disponible. Las llamadas a Firebase Functions fallarán.");
  } else {
      console.log("[FirebaseConfig] ESTADO FINAL: La instancia de Functions ESTÁ disponible para la aplicación (intentando usar base de datos REAL en la nube).");
  }
   if (!authInstance) {
      console.warn("[FirebaseConfig] ALERTA FINAL: La instancia de Authentication NO está disponible. Las operaciones de autenticación fallarán.");
  } else {
      console.log("[FirebaseConfig] ESTADO FINAL: La instancia de Authentication ESTÁ disponible para la aplicación (intentando usar base de datos REAL en la nube).");
  }
} else {
    console.log("[FirebaseConfig] ESTADO FINAL: La aplicación está usando la BASE DE DATOS MOCK (en memoria). Firestore, Functions y Auth reales no serán contactados.");
}
console.log("--- [FirebaseConfig] FIN CONFIGURACIÓN FIREBASE/FIRESTORE/FUNCTIONS/AUTH ---");

export { firestoreInstance as firestore, app, functionsInstance as functions, authInstance as auth, useMockDatabase };
