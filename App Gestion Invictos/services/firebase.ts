// services/firebase.ts
import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import {
  initializeFirestore,
  getFirestore,
  enableIndexedDbPersistence,
  type Firestore,
} from "firebase/firestore";

// ✅ Lee SIEMPRE con import.meta.env (Vite)
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY as string | undefined,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string | undefined,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID as string | undefined,
  appId: import.meta.env.VITE_FIREBASE_APP_ID as string | undefined,

  // (Opcionales, pero recomendados si los tenés)
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET as string | undefined,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID as string | undefined,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID as string | undefined,
};

const requiredKeys: (keyof typeof firebaseConfig)[] = ["apiKey", "projectId", "appId"]; // required “Firebase options” :contentReference[oaicite:0]{index=0}
const missing = requiredKeys.filter((k) => !firebaseConfig[k]);

let app: FirebaseApp | null = null;
let db: Firestore | null = null;

// 🔎 Log de diagnóstico (no imprime apiKey completa)
console.log("🔥 FIREBASE ENV CHECK", {
  mode: import.meta.env.MODE,
  missing,
  projectId: firebaseConfig.projectId,
  authDomain: firebaseConfig.authDomain,
  hasApiKey: !!firebaseConfig.apiKey,
  hasProjectId: !!firebaseConfig.projectId,
  hasAppId: !!firebaseConfig.appId,
});

if (missing.length === 0) {
  // ✅ Evita doble inicialización (HMR / imports múltiples)
  app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig as any);

  // ✅ Firestore con setting útil (evita errores por undefined si algo se escapa)
  // (igual tu cleanData está perfecto)
   const DB_ID = "invictos-bd";
try {
  db = initializeFirestore(app, { ignoreUndefinedProperties: true }, DB_ID);
} catch {
  db = getFirestore(app, DB_ID);
}


  // ✅ Persistencia offline (si falla, NO rompe)
  enableIndexedDbPersistence(db).catch((err: any) => {
    // failed-precondition (multi-tab) o unimplemented (browser no soporta)
    console.warn("⚠️ IndexedDB persistence disabled:", err?.code || err);
  });
} else {
  console.warn(
    "⚠️ Firebase NO inicializado: faltan env vars. Agregá en Vercel:",
    missing.map((k) => `VITE_FIREBASE_${String(k).replace(/[A-Z]/g, (m) => "_" + m).toUpperCase()}`)
  );
}

export { app, db };
export const firebaseReady = missing.length === 0;
export const firebaseProjectId = firebaseConfig.projectId;
