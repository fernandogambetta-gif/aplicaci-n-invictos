// services/firebase.ts
import { initializeApp, type FirebaseApp } from 'firebase/app';
import { getFirestore, enableIndexedDbPersistence, type Firestore } from 'firebase/firestore';

const apiKey = import.meta.env.VITE_FIREBASE_API_KEY as string | undefined;
const authDomain = import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string | undefined;
const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID as string | undefined;

let app: FirebaseApp | null = null;
let db: Firestore | null = null;

if (apiKey && authDomain && projectId) {
  app = initializeApp({ apiKey, authDomain, projectId });

  // ✅ Firestore default (recomendado)
  db = getFirestore(app);

  enableIndexedDbPersistence(db).catch((err: any) => {
    console.warn('IndexedDB persistence disabled:', err?.code || err);
  });
}

export { db };

