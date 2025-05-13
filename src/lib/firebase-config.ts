// src/lib/firebase-config.ts
import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app';
import { getFirestore, connectFirestoreEmulator, type Firestore } from 'firebase/firestore';

// THIS IS THE CONFIGURATION FOR THE REAL FIREBASE PROJECT
// Ensure these environment variables are set in your .env.local file
// if you intend to connect to your actual Firebase project.
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "footprints-scheduler-ywrwg", // Fallback for safety
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

let app: FirebaseApp | undefined;
let firestoreInstance: Firestore | undefined;

// This flag determines if we use the mock data or attempt to connect to Firebase
// To use mock data, set NEXT_PUBLIC_USE_MOCK_DATABASE=true in your .env.local file
export const useMockDatabase = process.env.NEXT_PUBLIC_USE_MOCK_DATABASE === 'true';

console.log("Firebase Config Module: Starting initialization...");
console.log("Firebase Config Module: NEXT_PUBLIC_USE_MOCK_DATABASE from env:", process.env.NEXT_PUBLIC_USE_MOCK_DATABASE);
console.log("Firebase Config Module: Effective useMockDatabase flag:", useMockDatabase);
console.log("Firebase Config Module: Firebase Project ID from env:", process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID);
console.log("Firebase Config Module: Resolved firebaseConfig.projectId for initialization:", firebaseConfig.projectId);


if (useMockDatabase) {
  console.log("Firebase Config Module: USING MOCK DATABASE. Firebase App and Firestore instance will be undefined. No connection to Firebase services will be attempted by this module.");
  // Ensure app and firestoreInstance are explicitly undefined if using mock
  app = undefined;
  firestoreInstance = undefined;
} else {
  console.log("Firebase Config Module: Attempting to connect to REAL Firebase services (NOT using mock database).");
  const essentialConfigsMissing = !firebaseConfig.apiKey || !firebaseConfig.authDomain || !firebaseConfig.projectId;

  if (essentialConfigsMissing) {
    console.error(
      'CRITICAL Firebase Config: Essential Firebase config (apiKey, authDomain, projectId) is missing for REAL database connection. Please ensure all NEXT_PUBLIC_FIREBASE_ environment variables are set in your .env or .env.local file. Firebase will NOT be initialized properly.'
    );
    if (!firebaseConfig.apiKey) console.error("Firebase Config Error: Missing NEXT_PUBLIC_FIREBASE_API_KEY");
    if (!firebaseConfig.authDomain) console.error("Firebase Config Error: Missing NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN");
    if (!firebaseConfig.projectId) console.error("Firebase Config Error: Missing NEXT_PUBLIC_FIREBASE_PROJECT_ID. This is crucial for Firestore connection.");
    // Ensure app and firestoreInstance are explicitly undefined if config is missing
    app = undefined;
    firestoreInstance = undefined;
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
        firestoreInstance = getFirestore(app);
        console.log("Firebase Config Module: Firestore instance obtained.");

        // Emulator connection logic should only run in development and if NOT using mock DB
        if (process.env.NODE_ENV === 'development') {
          console.log("Firebase Config Module: DEVELOPMENT mode detected for REAL database connection.");
          if (firestoreInstance) {
            console.log("Firebase Config Module: Attempting to connect Firestore to emulator at localhost:8080.");
            try {
              // Check if emulator is already connected to prevent multiple connection attempts.
              // This check might need adjustment based on Firestore SDK specifics.
              // A simple check like `firestoreInstance.toJSON().settings.host` might work but is SDK internal.
              // A more robust check might involve a flag or checking if `connectFirestoreEmulator` has been called.
              // For now, we'll assume it's safe to call, but if issues arise, this is an area to revisit.
              // One common way to check is if `_settings.host` exists and includes 'localhost'
               if (!(firestoreInstance as any)._settings?.host?.includes('localhost')) { // Basic check
                   connectFirestoreEmulator(firestoreInstance, 'localhost', 8080);
                   console.log("Firebase Config Module: SUCCESS - Firestore emulator connection CONFIGURED for localhost:8080.");
               } else {
                   console.log("Firebase Config Module: Firestore emulator ALREADY configured for localhost:8080 or similar.");
               }
              console.log("Firebase Config Module: Ensure Firestore emulator is running (e.g., 'firebase emulators:start') if you intend to use it.");
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
        firestoreInstance = undefined; // Ensure firestoreInstance is undefined on failure
      }
    } else {
      console.error("Firebase Config Module: Firebase app is NOT initialized (due to config issues or initialization error). Firestore cannot be configured or used.");
      // Ensure firestoreInstance is explicitly undefined if app is not initialized
      firestoreInstance = undefined;
    }
  }
}

if (!firestoreInstance && !useMockDatabase) {
    console.warn("Firebase Config Module: Firestore instance is NOT available at the end of configuration (and not using mock). Data operations will likely fail if REAL database was intended.");
} else if (firestoreInstance && !useMockDatabase) {
    console.log("Firebase Config Module: Firestore instance IS available for export (using REAL database).");
} else if (useMockDatabase) {
    console.log("Firebase Config Module: Firestore instance is UNDEFINED because mock database is in use (as per NEXT_PUBLIC_USE_MOCK_DATABASE).");
}

export { firestoreInstance as firestore, app };