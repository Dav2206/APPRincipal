// src/lib/firebase-config.ts
import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app';
import { getFirestore, connectFirestoreEmulator, type Firestore, doc, getDoc, collection, query, limit, getDocs as getDocsFirestore } from 'firebase/firestore'; // Added imports for diagnostic

// Determine if using mock database based on environment variable
const useMockDatabaseEnv = process.env.NEXT_PUBLIC_USE_MOCK_DATABASE;
const useMockDatabase = useMockDatabaseEnv === 'true';

console.log("[FirebaseConfig] Inicio de configuración. Timestamp:", new Date().toISOString());
console.log("[FirebaseConfig] Valor de process.env.NODE_ENV:", process.env.NODE_ENV);
console.log("[FirebaseConfig] Valor de process.env.NEXT_PUBLIC_USE_MOCK_DATABASE:", useMockDatabaseEnv);
console.log(`[FirebaseConfig] ¿Usar Base de Datos Mock (en memoria)?: ${useMockDatabase} (basado en NEXT_PUBLIC_USE_MOCK_DATABASE='${useMockDatabaseEnv}')`);

let app: FirebaseApp | undefined;
let firestoreInstance: Firestore | undefined;

// Hardcoded Firebase configuration
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
  // app and firestoreInstance will remain undefined if mock is true, data.ts handles this
} else {
  console.log("[FirebaseConfig] Intentando conectar a servicios REALES o EMULADOS de Firebase/Firestore.");

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

        // --- Intento de lectura de diagnóstico ---
        const performDiagnosticRead = async (db: Firestore) => {
          console.log("[FirebaseConfig-Diagnóstico] Intentando lectura de diagnóstico a Firestore...");
          try {
            const testDocRef = doc(db, "_connectivity_test_collection_debug", "test_doc_debug");
            const docSnap = await getDoc(testDocRef);
            if (docSnap.exists()) {
              console.log("[FirebaseConfig-Diagnóstico] ÉXITO: Lectura de diagnóstico a Firestore realizada. Documento existe (inesperado, pero la conexión funciona). Contenido:", docSnap.data());
            } else {
              console.log("[FirebaseConfig-Diagnóstico] ÉXITO: Lectura de diagnóstico a Firestore realizada. El documento de prueba no existe (esperado, conexión funciona).");
            }
            const testCollectionQuery = query(collection(db, "_connectivity_test_collection_debug"), limit(1));
            const collectionSnap = await getDocsFirestore(testCollectionQuery);
            console.log(`[FirebaseConfig-Diagnóstico] ÉXITO: Intento de listar colección de prueba realizado. Documentos encontrados: ${collectionSnap.size}. La conexión a Firestore parece estar funcionando.`);
          } catch (error) {
            console.error("[FirebaseConfig-Diagnóstico] FALLO: Error durante la lectura de diagnóstico a Firestore:", error);
          }
        };

        if (firestoreInstance && !useMockDatabase) { // Only run diagnostic if not mock and instance exists
          performDiagnosticRead(firestoreInstance);
        }
        // --- Fin del intento de lectura de diagnóstico ---

        if (process.env.NODE_ENV === 'development') { // This 'if' is for development environment
          console.log("[FirebaseConfig] Modo DESARROLLO detectado.");
          if (firestoreInstance) { // This 'if' checks if firestoreInstance exists
            console.log("[FirebaseConfig] Intentando conectar Firestore al emulador en localhost:8080.");
            try {
              // Check if already connected to an emulator or a different host to avoid re-connecting in HMR
              const settings = (firestoreInstance as any)._settings;
              if (!settings?.host?.includes('localhost') && !settings?.host?.includes('127.0.0.1')) {
                connectFirestoreEmulator(firestoreInstance, 'localhost', 8080);
                console.log("[FirebaseConfig] ÉXITO - Conexión al emulador de Firestore CONFIGURADA para localhost:8080.");
              } else {
                console.log("[FirebaseConfig] Emulador de Firestore YA PARECE ESTAR conectado o configurado para un host local (localhost o 127.0.0.1). No se reconectará.");
              }
              console.log("[FirebaseConfig] Si usas el emulador, asegúrate de que esté ejecutándose (ej: 'firebase emulators:start').");
            } catch (emulatorError: any) {
              if (emulatorError.code === 'failed-precondition' || (emulatorError.message && emulatorError.message.includes('settings can no longer be changed'))) {
                console.warn("[FirebaseConfig] Advertencia: La configuración del emulador de Firestore no se puede cambiar. Esto es normal si ya se realizó una operación o con recargas en caliente.");
              } else {
                console.error("[FirebaseConfig] ERROR conectando al emulador de Firestore en localhost:8080:", emulatorError);
                console.warn("[FirebaseConfig] Firestore intentará conectarse a la base de datos de PRODUCCIÓN porque la conexión al emulador falló. Verifica el estado del emulador.");
              }
            }
          } else { // This 'else' is for "firestoreInstance" being undefined within "development" mode
            console.error("[FirebaseConfig] Firestore instance es undefined en DESARROLLO. No se puede conectar al emulador.");
          }
        } else { // This 'else' is for process.env.NODE_ENV !== 'development'
          console.log(`[FirebaseConfig] Modo PRODUCCIÓN detectado (o entorno no 'development'). Conectando a Cloud Firestore real, proyecto ID: '${firebaseConfig.projectId}'.`);
          console.log("[FirebaseConfig] Si la conexión falla, revisa las credenciales en este archivo, la configuración de tu proyecto Firebase (Firestore habilitado, estado de facturación, APIs habilitadas) y tu conectividad de red.");
        }
      } catch (e) {
        console.error("[FirebaseConfig] Error obteniendo instancia de Firestore o durante la lógica de configuración del emulador/producción:", e);
        firestoreInstance = undefined;
      }
    } else { // app is undefined
      console.error("[FirebaseConfig] App de Firebase NO inicializada. Firestore no puede ser configurado o usado.");
    }
  }
}

if (!firestoreInstance && !useMockDatabase) {
    console.error("[FirebaseConfig] ALERTA FINAL: La instancia de Firestore NO está disponible y se está intentando usar Firebase real. Las operaciones de datos con Firestore fallarán. Revisa la consola para errores previos de inicialización, tu conexión a internet y la configuración de tu proyecto Firebase (especialmente si la API de Cloud Firestore está habilitada en Google Cloud Console).");
} else if (firestoreInstance && !useMockDatabase) {
    console.log("[FirebaseConfig] ESTADO FINAL: La instancia de Firestore ESTÁ disponible para la aplicación (intentando usar base de datos REAL o EMULADA).");
} else if (useMockDatabase) {
    console.log("[FirebaseConfig] ESTADO FINAL: La aplicación está usando la BASE DE DATOS MOCK (en memoria). Firestore real no será contactado.");
}
console.log("--- [FirebaseConfig] FIN CONFIGURACIÓN FIREBASE/FIRESTORE ---");

export { firestoreInstance as firestore, app, useMockDatabase };
