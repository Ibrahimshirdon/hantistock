import { initializeApp } from "firebase/app";
import { getAuth, setPersistence, browserLocalPersistence } from "firebase/auth";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);

export const firebaseAuth = getAuth(app);

// Explicit rather than left to the SDK's default: a signed-in user must
// stay signed in across closing the browser and restarting the PC, until
// they click Logout. browserLocalPersistence keeps the session in
// IndexedDB, which survives both — unlike browserSessionPersistence
// (cleared when the tab/browser closes) or inMemoryPersistence (cleared on
// every page reload). Fire-and-forget: this only needs to land before the
// user actually signs in, which is always later than this module loads.
void setPersistence(firebaseAuth, browserLocalPersistence);
