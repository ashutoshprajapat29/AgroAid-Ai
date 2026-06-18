import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from "firebase/firestore";
import { getMessaging, isSupported } from "firebase/messaging";
import { getFunctions } from "firebase/functions";

// Firebase config from environment variables (not hardcoded JSON)
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
};

// 1. Initialize the app with your config
const app = initializeApp(firebaseConfig);

// 2. Initialize Auth
export const auth = getAuth(app);

// 3. Initialize Firestore with Offline Persistence Support
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() })
});

// 4. Initialize Cloud Messaging
let messagingInstance: any = null;
isSupported().then((supported) => {
  if (supported) {
    messagingInstance = getMessaging(app);
  }
}).catch(console.error);

export const getMessagingInstance = () => messagingInstance;

// 5. Initialize Cloud Functions
export const functions = getFunctions(app);

export default app;