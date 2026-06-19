import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyCPlYvkqft-C1D_wt2UG-Slia4m0m-X8fs",
  authDomain: "my-website-db-622db.firebaseapp.com",
  projectId: "my-website-db-622db",
  storageBucket: "my-website-db-622db.firebasestorage.app",
  messagingSenderId: "666349275836",
  appId: "1:666349275836:web:7233d83628c0ab17861eb9",
  measurementId: "G-P4FC6KVJ5N"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);