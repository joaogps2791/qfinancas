import { initializeApp } from 'firebase/app'
import { browserLocalPersistence, indexedDBLocalPersistence, initializeAuth } from 'firebase/auth'
import {
  initializeFirestore,
  persistentLocalCache,
  persistentSingleTabManager
} from 'firebase/firestore'

const env = import.meta.env

const app = initializeApp({
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.VITE_FIREBASE_APP_ID
})

// Sem popupRedirectResolver: popup/redirect não funcionam no Electron. O Google entra
// pelo navegador do sistema (ver src/main/googleAuth.ts).
export const auth = initializeAuth(app, {
  persistence: [indexedDBLocalPersistence, browserLocalPersistence]
})

// Cache local: o app abre rápido e continua mostrando os dados sem internet.
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentSingleTabManager(undefined) }),
  ignoreUndefinedProperties: true
})
