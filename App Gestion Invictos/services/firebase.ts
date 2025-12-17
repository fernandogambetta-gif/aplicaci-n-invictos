// services/firebase.ts
import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import { getFirestore, enableIndexedDbPersistence, type Firestore } from 'firebase/firestore';

const apiKey = import.meta.env.VITE_FIREBASE_API_KEY as string | undefined;
const authDomain = import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string | undefined;
const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID as string | undefined;

let app: FirebaseApp | null = null;
let db: Firestore | null = null;

if (apiKey && authDomain && projectId) {
  // ✅ Evita "Firebase App named '[DEFAULT]' already exists"
  app = getApps().length ? getApps()[0] : initializeApp({ apiKey, authDomain, projectId });

  // ✅ Firestore default (lo correcto si no usás multi-database)
  db = getFirestore(app);

  // ✅ Log para confirmar el proyecto real en runtime
  console.log('✅ Firebase initialized:', {
    envProjectId: projectId,
    appProjectId: app.options.projectId,
    authDomain: app.options.authDomain,
  });

  // Persistencia offline (si falla, solo avisa)
  enableIndexedDbPersistence(db).catch((err: any) => {
    console.warn('IndexedDB persistence disabled:', err?.code || err);
  });
} else {
  console.error('❌ Firebase ENV missing:', {
    hasApiKey: !!apiKey,
    hasAuthDomain: !!authDomain,
    hasProjectId: !!projectId,
  });
}

export { db };


