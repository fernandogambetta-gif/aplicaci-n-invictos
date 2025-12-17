// services/firebase.ts
import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import { getFirestore, enableIndexedDbPersistence, type Firestore } from 'firebase/firestore';

const apiKey = import.meta.env.VITE_FIREBASE_API_KEY as string | undefined;
const authDomain = import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string | undefined;
const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID as string | undefined;

let app: FirebaseApp | null = null;
let db: Firestore | null = null;

// ✅ Log de diagnóstico (NO imprime apiKey completa)
console.log('🔥 FIREBASE ENV CHECK', {
  hasApiKey: !!apiKey,
  hasAuthDomain: !!authDomain,
  hasProjectId: !!projectId,
  projectId,
  authDomain,
});

if (apiKey && authDomain && projectId) {
  // ✅ Evita inicializar Firebase dos veces (HMR / múltiples imports)
  app = getApps().length
    ? getApps()[0]
    : initializeApp({ apiKey, authDomain, projectId });

  // ✅ Firestore default database
  db = getFirestore(app);

  // ✅ Persistencia offline (si falla, no rompe)
  enableIndexedDbPersistence(db).catch((err: any) => {
    console.warn('⚠️ IndexedDB persistence disabled:', err?.code || err);
  });
} else {
  console.warn('⚠️ Firebase NO inicializado: faltan env vars en Vercel (Production/Preview).');
}

export { db };

