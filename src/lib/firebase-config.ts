// src/lib/firebase-config.ts
import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app';
import { getFirestore, type Firestore, doc, getDoc, Timestamp } from 'firebase/firestore';
import { getFunctions, type Functions } from 'firebase/functions';
import { getAuth, type Auth } from 'firebase/auth';
import { getStorage, type FirebaseStorage } from 'firebase/storage';

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
  console.log(`[FirebaseConfig] Usando credenciales para el proyecto ID: '${firebaseConfig.projectId}'.`);

  if (!firebaseConfig.projectId || !firebaseConfig.apiKey) {
    console.error(
      '[FirebaseConfig] CRÍTICO: Las credenciales de Firebase son incompletas. Firebase NO se inicializará correctamente.'
    );
  } else {
    try {
      app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
      console.log(`[FirebaseConfig] App de Firebase inicializada correctamente para el proyecto: '${app.options.projectId}'.`);

      firestoreInstance = getFirestore(app);
      console.log("[FirebaseConfig] Instancia de Firestore obtenida.");

      functionsInstance = getFunctions(app);
      console.log("[FirebaseConfig] Instancia de Functions obtenida.");

      authInstance = getAuth(app);
      console.log("[FirebaseConfig] Instancia de Authentication obtenida.");

      storageInstance = getStorage(app);
      console.log("[FirebaseConfig] Instancia de Storage obtenida.");

      if (firestoreInstance) {
        const performDiagnosticRead = async (db: Firestore) => {
          console.log("[FirebaseConfig-Diagnóstico] Realizando lectura de diagnóstico a Firestore...");
          try {
            // Usamos una ruta de documento poco probable para no interferir con datos reales.
            const testDocRef = doc(db, "_internal_diagnostics", "connectivity_check");
            await getDoc(testDocRef);
            console.log("[FirebaseConfig-Diagnóstico] ÉXITO: La lectura de diagnóstico a Firestore se completó. La conexión y los permisos básicos para leer están funcionando.");
          } catch (error: any) {
            console.error("[FirebaseConfig-Diagnóstico] FALLO en la lectura de diagnóstico. Código:", error.code, "Mensaje:", error.message);
            if (error.code === 'permission-denied') {
              console.warn("[FirebaseConfig-Diagnóstico] Causa probable: 'permission-denied'. Verifica tus REGLAS DE SEGURIDAD de Firestore. Para la prueba de diagnóstico, considera permitir lecturas en la ruta '_internal_diagnostics/connectivity_check'.");
            } else if (error.code === 'unavailable') {
              console.warn("[FirebaseConfig-Diagnóstico] Causa probable: 'unavailable'. Verifica tu CONEXIÓN A INTERNET o el estado del servicio de Firebase.");
            } else {
              console.warn("[FirebaseConfig-Diagnóstico] Causa probable: Revisa la configuración de tu proyecto en Firebase (API de Firestore habilitada, facturación, etc).");
            }
          }
        };
        performDiagnosticRead(firestoreInstance);
      }

    } catch (e) {
      console.error("[FirebaseConfig] Error CRÍTICO durante la inicialización de Firebase:", e);
      app = undefined;
      firestoreInstance = undefined;
      functionsInstance = undefined;
      authInstance = undefined;
      storageInstance = undefined;
    }
  }
}

console.log("--- [FirebaseConfig] ESTADO FINAL DE CONFIGURACIÓN ---");
if (useMockDatabase) {
  console.log("[FirebaseConfig] La aplicación está usando la BASE DE DATOS MOCK (en memoria).");
} else {
  console.log(`[FirebaseConfig] Firestore: ${firestoreInstance ? 'Disponible' : 'NO DISPONIBLE'}`);
  console.log(`[FirebaseConfig] Functions: ${functionsInstance ? 'Disponible' : 'NO DISPONIBLE'}`);
  console.log(`[FirebaseConfig] Auth: ${authInstance ? 'Disponible' : 'NO DISPONIBLE'}`);
  console.log(`[FirebaseConfig] Storage: ${storageInstance ? 'Disponible' : 'NO DISPONIBLE'}`);
  if (!firestoreInstance) {
    console.error("[FirebaseConfig] ALERTA CRÍTICA: La instancia de Firestore no está disponible. Las operaciones de base de datos fallarán.");
  }
}
console.log("-------------------------------------------");


export { firestoreInstance as firestore, app, functionsInstance as functions, authInstance as auth, storageInstance as storage, useMockDatabase };
