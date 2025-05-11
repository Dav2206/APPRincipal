// src/lib/firebase-config.ts
import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app';
import { getFirestore, connectFirestoreEmulator, type Firestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "footprints-scheduler-ywrwg", // Fallback projectId
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

let app: FirebaseApp | undefined;
let firestoreInstance: Firestore | undefined;

// console.log("Firebase Config Module: Starting initialization attempt...");
// console.log("Firebase Config Module: NEXT_PUBLIC_FIREBASE_PROJECT_ID from env:", process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID);
// console.log("Firebase Config Module: Resolved firebaseConfig.projectId for initialization:", firebaseConfig.projectId);


const essentialConfigsMissing = !firebaseConfig.apiKey || !firebaseConfig.authDomain || !firebaseConfig.projectId;

if (essentialConfigsMissing) {
  console.error(
    'CRITICAL Firebase Config: Essential Firebase config (apiKey, authDomain, projectId) is missing. Please ensure all NEXT_PUBLIC_FIREBASE_ environment variables are set in your .env or .env.local file. Firebase will NOT be initialized properly.'
  );
  if (!firebaseConfig.apiKey) console.error("Firebase Config Error: Missing NEXT_PUBLIC_FIREBASE_API_KEY");
  if (!firebaseConfig.authDomain) console.error("Firebase Config Error: Missing NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN");
  if (!firebaseConfig.projectId) console.error("Firebase Config Error: Missing NEXT_PUBLIC_FIREBASE_PROJECT_ID. This is crucial for Firestore connection.");
} else {
  // console.log("Firebase Config Module: All essential NEXT_PUBLIC_FIREBASE_ variables (apiKey, authDomain, projectId) appear to be present.");

  try {
    if (!getApps().length) {
      app = initializeApp(firebaseConfig);
      // console.log("Firebase Config Module: Firebase app newly initialized.");
    } else {
      app = getApp();
      // console.log("Firebase Config Module: Firebase app already exists, using existing instance.");
    }
  } catch (e) {
    console.error("Firebase Config Module: Error initializing Firebase app:", e);
    app = undefined; // Ensure app is undefined on failure
  }

  if (app) {
    // console.log(`Firebase Config Module: Firebase app initialized successfully for project ID: '${app.options.projectId}'.`);
    try {
      firestoreInstance = getFirestore(app);
      // console.log("Firebase Config Module: Firestore instance obtained.");

      if (process.env.NODE_ENV === 'development') {
        // console.log("Firebase Config Module: DEVELOPMENT mode detected.");
        if (firestoreInstance) {
          // console.log("Firebase Config Module: Attempting to connect Firestore to emulator at localhost:8080.");
          try {
             if (!(firestoreInstance as any)._settings?.host?.includes('localhost')) { // A simple check
                 connectFirestoreEmulator(firestoreInstance, 'localhost', 8080);
                //  console.log("Firebase Config Module: SUCCESS - Firestore emulator connection CONFIGURED for localhost:8080.");
            } else {
                // console.log("Firebase Config Module: Firestore emulator ALREADY configured.");
            }
          } catch (emulatorError) {
            console.error("Firebase Config Module: ERROR during connectFirestoreEmulator(firestoreInstance, 'localhost', 8080) call:", emulatorError);
            console.warn("Firebase Config Module: Firestore will attempt to connect to the PRODUCTION database because emulator connection failed. Check emulator status and port conflicts.");
          }
        } else {
          console.error("Firebase Config Module: Firestore instance is undefined in DEVELOPMENT. Cannot connect to emulator.");
        }
      } else {
        // console.log(`Firebase Config Module: PRODUCTION mode detected. Connecting to Cloud Firestore project ID: '${firebaseConfig.projectId}'.`);
      }
    } catch (e) {
      console.error("Firebase Config Module: Error getting Firestore instance or during emulator/production setup logic:", e);
      firestoreInstance = undefined; 
    }
  } else {
    console.error("Firebase Config Module: Firebase app is NOT initialized. Firestore cannot be configured or used.");
  }
}

// if (!firestoreInstance) {
//     console.warn("Firebase Config Module: Firestore instance is NOT available at the end of configuration. Data operations will likely fail.");
// } else {
//     console.log("Firebase Config Module: Firestore instance IS available for export.");
// }

export { firestoreInstance as firestore, app };
