// src/lib/firebase-config.ts
import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app';
import { getFirestore, type Firestore, doc, getDoc, Timestamp } from 'firebase/firestore';
// No importamos connectFirestoreEmulator aquí para forzar la conexión a la nube
// a menos que se decida explícitamente volver a habilitar los emuladores para desarrollo.
import { getFunctions, type Functions } from 'firebase/functions';
import { getAuth, type Auth } from 'firebase/auth';
import { getStorage, type FirebaseStorage } from 'firebase/storage';

// Determinar si se usa la base de datos mock basada en la variable de entorno
const useMockDatabaseEnv = process.env.NEXT_PUBLIC_USE_MOCK_DATABASE;
const useMockDatabase = useMockDatabaseEnv === 'true';

console.log("[FirebaseConfig] Inicio de configuración. Timestamp:", new Date().toISOString());
console.log("[FirebaseConfig] Valor de process.env.NODE_ENV:", process.env.NODE_ENV);
console.log("[FirebaseConfig] Valor de process.env.NEXT_PUBLIC_USE_MOCK_DATABASE:", process.env.NEXT_PUBLIC_USE_MOCK_DATABASE);
console.log(`[FirebaseConfig] ¿Usar Base de Datos Mock (en memoria)?: ${useMockDatabase}`);

let app: FirebaseApp | undefined;
let firestoreInstance: Firestore | undefined;
let functionsInstance: Functions | undefined;
let authInstance: Auth | undefined;
let storageInstance: FirebaseStorage | undefined;

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

        storageInstance = getStorage(app);
        console.log("[FirebaseConfig] Instancia de Storage obtenida (apuntando a la nube).");
        
        // Lógica del emulador eliminada para forzar conexión a la nube
        // if (process.env.NODE_ENV === 'development') {
        //   // ... lógica del emulador ...
        // } else {
        //   console.log(`[FirebaseConfig] Modo PRODUCCIÓN detectado. Conectando a Cloud Firestore real, proyecto ID: '${firebaseConfig.projectId}'.`);
        // }
        console.log(`[FirebaseConfig] Conectando a Cloud Firebase/Firestore real, proyecto ID: '${firebaseConfig.projectId}'.`);
        console.log("[FirebaseConfig] Si la conexión falla, revisa las credenciales en este archivo, la configuración de tu proyecto Firebase (Firestore habilitado, estado de facturación, APIs habilitadas) y tu conectividad de red.");


        // Intento de lectura de diagnóstico
        if (firestoreInstance) {
          const performDiagnosticRead = async (db: Firestore) => {
            console.log("[FirebaseConfig-Diagnóstico] Intentando lectura de diagnóstico a Firestore en la nube...");
            try {
              const testDocRef = doc(db, "_connectivity_test_collection_diagnostics", "test_doc_diagnostics");
              await getDoc(testDocRef);
              console.log("[FirebaseConfig-Diagnóstico] ÉXITO: Lectura de diagnóstico a Firestore realizada (no implica que el documento exista, solo que la conexión fue posible).");
            } catch (error: any) {
              console.error("[FirebaseConfig-Diagnóstico] FALLO: Error durante la lectura de diagnóstico a Firestore. Código:", error.code, "Mensaje:", error.message);
              if (error.code === 'permission-denied') {
                console.warn("[FirebaseConfig-Diagnóstico] El error es 'permission-denied'. Verifica tus REGLAS DE SEGURIDAD de Firestore.");
              } else if (error.code === 'unavailable') {
                console.warn("[FirebaseConfig-Diagnóstico] El error es 'unavailable'. Verifica tu CONEXIÓN A INTERNET y la configuración de tu proyecto Firebase (API de Firestore habilitada, facturación).");
              } else if (error.message && error.message.includes("firestore/indexes?create_composite")) {
                console.warn("[FirebaseConfig-Diagnóstico] El error indica que falta un ÍNDICE en Firestore. Revisa la consola de Firebase para crear el índice necesario: ", error.message);
              } else {
                console.warn("[FirebaseConfig-Diagnóstico] Error de diagnóstico desconocido:", error);
              }
            }
          };
          performDiagnosticRead(firestoreInstance).catch(diagError => {
            console.error("[FirebaseConfig-Diagnóstico] Error no capturado en performDiagnosticRead:", diagError);
          });
        } else {
          console.warn("[FirebaseConfig-Diagnóstico] Instancia de Firestore no disponible para lectura de diagnóstico.");
        }

      } catch (e) {
        console.error("[FirebaseConfig] Error obteniendo instancias de servicios Firebase:", e);
        firestoreInstance = undefined;
        functionsInstance = undefined;
        authInstance = undefined;
        storageInstance = undefined;
      }
    } else {
      console.error("[FirebaseConfig] App de Firebase NO inicializada. Firestore, Functions y Auth no pueden ser configurados o usados.");
    }
  }
}

if (useMockDatabase) {
  console.log("[FirebaseConfig] ESTADO FINAL: La aplicación está usando la BASE DE DATOS MOCK (en memoria). Firestore, Functions y Auth reales no serán contactados.");
} else {
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
  if (!storageInstance) {
      console.warn("[FirebaseConfig] ALERTA FINAL: La instancia de Storage NO está disponible. Las operaciones de almacenamiento fallarán.");
  } else {
      console.log("[FirebaseConfig] ESTADO FINAL: La instancia de Storage ESTÁ disponible para la aplicación (intentando usar base de datos REAL en la nube).");
  }
}
console.log("--- [FirebaseConfig] FIN CONFIGURACIÓN FIREBASE/FIRESTORE/FUNCTIONS/AUTH/STORAGE ---");

export { firestoreInstance as firestore, app, functionsInstance as functions, authInstance as auth, storageInstance as storage, useMockDatabase };
