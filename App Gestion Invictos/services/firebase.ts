// services/firebase.ts
import { initializeApp } from 'firebase/app';
import { getFirestore, enableIndexedDbPersistence } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
};

// OJO: si en Firestore tu base se llama "invictos-bd" (no default), usar así:
const app = initializeApp(firebaseConfig);
const db = getFirestore(app, 'invictos-bd'); // <- importante para vos

// Persistencia offline (si falla, solo loguea)
enableIndexedDbPersistence(db).catch(() => {
  // Podemos ignorar el error de múltiples pestañas
});

export { db };
