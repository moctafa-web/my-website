import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';

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
export const auth = getAuth(app);
export { firebaseConfig };
