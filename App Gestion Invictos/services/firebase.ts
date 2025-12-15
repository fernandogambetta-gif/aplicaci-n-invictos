// services/firebase.ts
import { initializeApp, type FirebaseApp } from 'firebase/app';
import {
  getFirestore,
  enableIndexedDbPersistence,
  type Firestore,
} from 'firebase/firestore';

const apiKey = import.meta.env.VITE_FIREBASE_API_KEY as string | undefined;
const authDomain = import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string | undefined;
const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID as string | undefined;

// ✅ Si falta config, NO inicializamos Firebase (evita crash en import)
let app: FirebaseApp | null = null;
let db: Firestore | null = null;

if (apiKey && authDomain && projectId) {
  const firebaseConfig = { apiKey, authDomain, projectId };

  app = initializeApp(firebaseConfig);

  // ✅ Usá SOLO si tenés multi-database creado en Firestore.
  // Si NO, dejá la línea default (recomendada).
  // db = getFirestore(app, 'invictos-bd');
  db = getFirestore(app);

  // Persistencia offline (si falla, solo loguea)
  enableIndexedDbPersistence(db).catch((err: any) => {
    // failed-precondition: múltiples pestañas
    // unimplemented: navegador no soporta
    console.warn('IndexedDB persistence disabled:', err?.code || err);
  });
}

export { db };
