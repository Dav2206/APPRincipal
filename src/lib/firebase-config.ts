
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

console.log("Firebase Config Module: Starting initialization...");
console.log("Firebase Config Module: NEXT_PUBLIC_USE_MOCK_DATABASE from env:", process.env.NEXT_PUBLIC_USE_MOCK_DATABASE);
console.log("Firebase Config Module: Effective useMockDatabase flag:", useMockDatabase);
console.log("Firebase Config Module: Firebase Project ID from env:", process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID);
console.log("Firebase Config Module: Resolved firebaseConfig.projectId for initialization:", firebaseConfig.projectId);


if (useMockDatabase) {
  console.warn("Firebase Config Module: USING MOCK DATABASE. Firestore connection will NOT be attempted by this module.");
  app = undefined;
  firestoreInstance = undefined;
} else {
  console.log("Firebase Config Module: Attempting to connect to REAL Firebase services (NOT using mock database).");
  const essentialConfigsMissing = !firebaseConfig.apiKey || !firebaseConfig.authDomain || !firebaseConfig.projectId;

  if (essentialConfigsMissing) {
    console.error(
      'CRITICAL Firebase Config: Essential Firebase config (apiKey, authDomain, projectId) is missing for REAL database connection. Please ensure all NEXT_PUBLIC_FIREBASE_ environment variables are set. Firestore will NOT be initialized.'
    );
    if (!firebaseConfig.apiKey) console.error("Firebase Config Error: Missing NEXT_PUBLIC_FIREBASE_API_KEY");
    if (!firebaseConfig.authDomain) console.error("Firebase Config Error: Missing NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN");
    if (!firebaseConfig.projectId) console.error("Firebase Config Error: Missing NEXT_PUBLIC_FIREBASE_PROJECT_ID.");
    app = undefined;
    firestoreInstance = undefined;
  } else {
    console.log("Firebase Config Module: Essential Firebase environment variables appear to be present.");
    try {
      if (!getApps().length) {
        app = initializeApp(firebaseConfig);
        console.log("Firebase Config Module: Firebase app newly initialized.");
      } else {
        app = getApp();
        console.log("Firebase Config Module: Firebase app already exists, using existing instance.");
      }
    } catch (e) {
      console.error("Firebase Config Module: Error initializing Firebase app:", e);
      app = undefined;
    }

    if (app) {
      console.log(`Firebase Config Module: Firebase app initialized successfully for project ID: '${app.options.projectId}'.`);
      try {
        firestoreInstance = getFirestore(app);
        console.log("Firebase Config Module: Firestore instance obtained.");

        if (process.env.NODE_ENV === 'development' && !useMockDatabase) { // Connect to emulator only in dev AND if not explicitly using mock
          console.log("Firebase Config Module: DEVELOPMENT mode & NOT useMockDatabase. Attempting to connect Firestore to emulator.");
          if (firestoreInstance) {
            // Basic check to prevent multiple connections if already connected
            if (!(firestoreInstance as any)._settings?.host?.includes('localhost')) {
               try {
                connectFirestoreEmulator(firestoreInstance, 'localhost', 8080);
                console.log("Firebase Config Module: SUCCESS - Firestore emulator connection CONFIGURED for localhost:8080.");
               } catch (emulatorError) {
                 console.error("Firebase Config Module: ERROR during connectFirestoreEmulator:", emulatorError);
                 console.warn("Firebase Config Module: Firestore will attempt to connect to PRODUCTION. Check emulator status.");
               }
            } else {
               console.log("Firebase Config Module: Firestore emulator SEEMS ALREADY configured.");
            }
          } else {
            console.error("Firebase Config Module: Firestore instance is undefined in DEVELOPMENT. Cannot connect to emulator.");
          }
        } else if (process.env.NODE_ENV !== 'development' && !useMockDatabase) {
          console.log(`Firebase Config Module: PRODUCTION mode (or not dev) & NOT useMockDatabase. Connecting to Cloud Firestore project ID: '${firebaseConfig.projectId}'.`);
        }
      } catch (e) {
        console.error("Firebase Config Module: Error getting Firestore instance or during emulator/production setup logic:", e);
        firestoreInstance = undefined;
      }
    } else {
      console.error("Firebase Config Module: Firebase app is NOT initialized (due to config issues or initialization error). Firestore cannot be configured.");
      firestoreInstance = undefined;
    }
  }
}

if (!firestoreInstance && !useMockDatabase) {
    console.warn("Firebase Config Module: Firestore instance is NOT available at the end of configuration (and not using mock). Data operations might fail if REAL database was intended.");
} else if (firestoreInstance && !useMockDatabase) {
    console.log("Firebase Config Module: Firestore instance IS available for export (using REAL database).");
} else if (useMockDatabase) {
    console.log("Firebase Config Module: Firestore instance is UNDEFINED because useMockDatabase is true.");
}

export { firestoreInstance as firestore, app };
