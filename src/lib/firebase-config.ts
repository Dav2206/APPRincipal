// src/lib/firebase-config.ts
import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app';
// Import Firestore types for type safety, but conditionally get the instance.
import type { Firestore } from 'firebase/firestore';
// import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore'; // Keep import for potential future use or type checking

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: "footprints-scheduler-ywrwg",
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

let app: FirebaseApp | undefined;
let firestoreInstance: Firestore | undefined = undefined; // Explicitly undefined

const useMockDatabase = true; // FORCE MOCK DATABASE

console.log("Firebase Config Module: Starting initialization attempt...");
console.log("Firebase Config Module: Using mock database (forced):", useMockDatabase);

if (!useMockDatabase) {
  // Firestore connection logic removed as per user request to use mock data
  console.log("Firebase Config Module: Firestore connection logic is disabled because useMockDatabase is false, but it should be true for mock data usage.");
  // To re-enable Firestore:
  // 1. Set useMockDatabase to false.
  // 2. Uncomment the getFirestore and connectFirestoreEmulator imports.
  // 3. Restore the Firebase initialization and Firestore connection logic here.
  // Example (simplified):
  // console.log("Firebase Config Module: Attempting to connect to Firebase (not using mock database).");
  // if (!getApps().length) {
  //   app = initializeApp(firebaseConfig);
  // } else {
  //   app = getApp();
  // }
  // if (app) {
  //   firestoreInstance = getFirestore(app);
  //   if (process.env.NODE_ENV === 'development' && firestoreInstance) {
  //     connectFirestoreEmulator(firestoreInstance, 'localhost', 8080);
  //     console.log("Firebase Config Module: Firestore emulator connection CONFIGURED for localhost:8080.");
  //   }
  // }
} else {
  console.log("Firebase Config Module: Using MOCK database (forced). Firebase App and Firestore instance will be undefined.");
  app = undefined;
  firestoreInstance = undefined; // Ensure it's undefined
}


if (!firestoreInstance && !useMockDatabase) {
    console.warn("Firebase Config Module: Firestore instance is NOT available (and not using mock by flag, which is contradictory here). Ensure useMockDatabase is true if intended.");
} else if (firestoreInstance && !useMockDatabase) {
    console.log("Firebase Config Module: Firestore instance IS available for export (not using mock).");
} else if (useMockDatabase) {
    console.log("Firebase Config Module: Firestore instance is UNDEFINED because mock database is in use (forced).");
}

// Export 'firestoreInstance' as 'firestore'. It will be undefined when using mock.
export { firestoreInstance as firestore, app };