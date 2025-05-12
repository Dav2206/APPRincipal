// src/lib/firebase-config.ts
import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app';
// Import Firestore types for type safety, but conditionally get the instance.
import type { Firestore } from 'firebase/firestore';
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore'; // Keep import for potential future use or type checking

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: "footprints-scheduler-ywrwg", // Hardcoded as per user's last instruction on this
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

let app: FirebaseApp | undefined;
let firestoreInstance: Firestore | undefined = undefined; // Explicitly undefined

const useMockDatabase = process.env.NEXT_PUBLIC_USE_MOCK_DATABASE === 'true' || true; // Default to true to ensure mock is used

console.log("Firebase Config Module: Starting initialization attempt...");
console.log("Firebase Config Module: NEXT_PUBLIC_USE_MOCK_DATABASE:", process.env.NEXT_PUBLIC_USE_MOCK_DATABASE);
console.log("Firebase Config Module: Using mock database:", useMockDatabase);

if (!useMockDatabase) {
  console.log("Firebase Config Module: Attempting to connect to Firebase (not using mock database).");
  console.log("Firebase Config Module: NEXT_PUBLIC_FIREBASE_PROJECT_ID from env:", process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID);
  console.log("Firebase Config Module: Resolved firebaseConfig.projectId for initialization:", firebaseConfig.projectId);

  const essentialConfigsMissing = !firebaseConfig.apiKey || !firebaseConfig.authDomain || !firebaseConfig.projectId;

  if (essentialConfigsMissing) {
    console.error(
      'CRITICAL Firebase Config: Essential Firebase config (apiKey, authDomain, projectId) is missing. Please ensure all NEXT_PUBLIC_FIREBASE_ environment variables are set in your .env or .env.local file. Firebase will NOT be initialized properly.'
    );
    if (!firebaseConfig.apiKey) console.error("Firebase Config Error: Missing NEXT_PUBLIC_FIREBASE_API_KEY");
    if (!firebaseConfig.authDomain) console.error("Firebase Config Error: Missing NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN");
    if (!firebaseConfig.projectId) console.error("Firebase Config Error: Missing NEXT_PUBLIC_FIREBASE_PROJECT_ID. This is crucial for Firestore connection.");
  } else {
    console.log("Firebase Config Module: All essential NEXT_PUBLIC_FIREBASE_ variables (apiKey, authDomain, projectId) appear to be present.");

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
      app = undefined; // Ensure app is undefined on failure
    }

    if (app) {
      console.log(`Firebase Config Module: Firebase app initialized successfully for project ID: '${app.options.projectId}'.`);
      try {
        // Only get Firestore instance if not using mock
        firestoreInstance = getFirestore(app);
        console.log("Firebase Config Module: Firestore instance obtained.");

        if (process.env.NODE_ENV === 'development') {
          console.log("Firebase Config Module: DEVELOPMENT mode detected.");
          if (firestoreInstance) {
            console.log("Firebase Config Module: Attempting to connect Firestore to emulator at localhost:8080.");
            try {
              // Ensure this is called only ONCE
              if (!(firestoreInstance as any)._settings?.host?.includes('localhost')) {
                   connectFirestoreEmulator(firestoreInstance, 'localhost', 8080);
                   console.log("Firebase Config Module: SUCCESS - Firestore emulator connection CONFIGURED for localhost:8080.");
              } else {
                   console.log("Firebase Config Module: Firestore emulator ALREADY configured for localhost:8080.");
              }
              console.log("Firebase Config Module: Ensure Firestore emulator is running (e.g., 'firebase emulators:start').");
            } catch (emulatorError) {
              console.error("Firebase Config Module: ERROR during connectFirestoreEmulator(firestoreInstance, 'localhost', 8080) call:", emulatorError);
              console.warn("Firebase Config Module: Firestore will attempt to connect to the PRODUCTION database because emulator connection failed. Check emulator status and port conflicts.");
            }
          } else {
            console.error("Firebase Config Module: Firestore instance is undefined in DEVELOPMENT. Cannot connect to emulator.");
          }
        } else {
          console.log(`Firebase Config Module: PRODUCTION mode detected. Connecting to Cloud Firestore project ID: '${firebaseConfig.projectId}'.`);
          console.log("Firebase Config Module: If connection fails, check your .env variables, Firebase project settings (Firestore enabled, billing status), and network connectivity.");
        }
      } catch (e) {
        console.error("Firebase Config Module: Error getting Firestore instance or during emulator/production setup logic:", e);
        firestoreInstance = undefined; 
      }
    } else {
      console.error("Firebase Config Module: Firebase app is NOT initialized. Firestore cannot be configured or used.");
    }
  }
} else {
  console.log("Firebase Config Module: Using MOCK database. Firebase App and Firestore instance will not be initialized.");
  app = undefined;
  firestoreInstance = undefined;
}


if (!firestoreInstance && !useMockDatabase) {
    console.warn("Firebase Config Module: Firestore instance is NOT available at the end of configuration (and not using mock). Data operations will likely fail.");
} else if (firestoreInstance && !useMockDatabase) {
    console.log("Firebase Config Module: Firestore instance IS available for export (not using mock).");
} else if (useMockDatabase) {
    console.log("Firebase Config Module: Firestore instance is UNDEFINED because mock database is in use.");
}

export { firestoreInstance as firestore, app };
