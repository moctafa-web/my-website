import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth, initializeAuth, indexedDBLocalPersistence, browserLocalPersistence } from 'firebase/auth';

// نفس مشروع Firebase المستخدم في النسخة الأصلية.
// هذه القيم public client config بطبيعتها؛ الحماية الحقيقية تكون من خلال
// Firebase Authentication + Firestore Security Rules.
const firebaseConfig = {
  apiKey: 'AIzaSyCPlYvkqft-C1D_wt2UG-Slia4m0m-X8fs',
  authDomain: 'my-website-db-622db.firebaseapp.com',
  projectId: 'my-website-db-622db',
  storageBucket: 'my-website-db-622db.firebasestorage.app',
  messagingSenderId: '666349275836',
  appId: '1:666349275836:web:7233d83628c0ab17861eb9',
  measurementId: 'G-P4FC6KVJ5N',
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

export const db = getFirestore(app);
// تسجيل الدخول بإيميل وباسورد بس، فمش محتاجين popup/redirect resolver.
// getAuth() العادي بيحمّل iframe من authDomain قبل ما يقول "في مستخدم ولا لا"،
// وده اللي كان بيطوّل شاشة "جاري التحقق من تسجيل الدخول". initializeAuth بنفس نوع التخزين
// (IndexedDB ثم localStorage) فالجلسات الحالية بتفضل شغالة من غير ما حد يسجّل دخول تاني.
const createAuth = () => {
  if (typeof window === 'undefined') return getAuth(app);
  try {
    return initializeAuth(app, { persistence: [indexedDBLocalPersistence, browserLocalPersistence] });
  } catch {
    return getAuth(app); // اتعمل قبل كده (مثلاً HMR)
  }
};
export const auth = createAuth();
export { firebaseConfig };
