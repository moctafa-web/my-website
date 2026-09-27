import { collection, deleteDoc, doc, getDocs, setDoc } from 'firebase/firestore';
import { db } from '../firebase';

const cleanForFirebase = (obj: any): any => {
  if (obj === null || obj === undefined) return null;
  if (Array.isArray(obj)) return obj.map(cleanForFirebase);
  if (typeof obj === 'object') {
    const cleaned: Record<string, any> = {};
    Object.keys(obj).forEach((key) => {
      const value = obj[key];
      if (value !== undefined) cleaned[key] = cleanForFirebase(value);
    });
    return cleaned;
  }
  return obj;
};

export async function saveToFirebase(collectionName: string, id: string, data: unknown) {
  try {
    await setDoc(doc(db, collectionName, id), cleanForFirebase(data));
  } catch (error) {
    console.error(`[Firebase] save ${collectionName}/${id} failed:`, error);
  }
}

/** Strict variant used by destructive/migration workflows. */
export async function saveToFirebaseStrict(collectionName: string, id: string, data: unknown) {
  await setDoc(doc(db, collectionName, id), cleanForFirebase(data));
}

export async function deleteFromFirebase(collectionName: string, id: string) {
  try {
    await deleteDoc(doc(db, collectionName, id));
  } catch (error) {
    console.error(`[Firebase] delete ${collectionName}/${id} failed:`, error);
  }
}

export async function loadCollection<T>(collectionName: string): Promise<T[]> {
  const snap = await getDocs(collection(db, collectionName));
  return snap.docs.map((d) => ({ ...d.data(), id: d.id }) as T);
}

/**
 * Deletes every document in a Firestore collection.
 * Unlike deleteFromFirebase, this intentionally propagates errors so a
 * destructive reset cannot report success after a partial/failed delete.
 */
export async function deleteCollectionFromFirebase(collectionName: string): Promise<number> {
  const snap = await getDocs(collection(db, collectionName));
  await Promise.all(snap.docs.map((item) => deleteDoc(item.ref)));
  return snap.size;
}
