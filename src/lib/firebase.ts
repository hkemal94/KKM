import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut } from "firebase/auth";
import { getFirestore, doc, collection, setDoc, updateDoc, deleteDoc, deleteField, onSnapshot, query } from "firebase/firestore";
import firebaseConfig from "../../firebase-applet-config.json";
import { Item, UserSettings } from "../types";

const config: any = firebaseConfig;
const app = initializeApp(config);
export const auth = getAuth(app);
export const db = getFirestore(app, config.firestoreDatabaseId || "(default)");
export const googleProvider = new GoogleAuthProvider();
googleProvider.addScope('https://www.googleapis.com/auth/drive');
googleProvider.addScope('https://www.googleapis.com/auth/drive.file');
googleProvider.addScope('https://www.googleapis.com/auth/drive.readonly');
googleProvider.addScope('https://www.googleapis.com/auth/spreadsheets');
googleProvider.addScope('https://www.googleapis.com/auth/spreadsheets.readonly');
googleProvider.addScope('https://www.googleapis.com/auth/drive.metadata.readonly');
googleProvider.addScope('https://www.googleapis.com/auth/calendar');
googleProvider.addScope('https://www.googleapis.com/auth/calendar.events');
googleProvider.addScope('https://www.googleapis.com/auth/calendar.readonly');
googleProvider.addScope('https://www.googleapis.com/auth/documents');
googleProvider.addScope('https://www.googleapis.com/auth/documents.readonly');

let cachedAccessToken: string | null = null;

export const getCachedAccessToken = () => cachedAccessToken;
export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  }
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// Google Sign-in helper
export const signInWithGoogle = async () => {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (credential?.accessToken) {
      cachedAccessToken = credential.accessToken;
    }
    return result.user;
  } catch (error) {
    console.error("Giriş yapılırken hata oluştu:", error);
    throw error;
  }
};

/**
 * Drive iznini yeniden ister (1 Ekim, "insufficient authentication scopes").
 * Google izin ekranını zorla yeniden gösterir; Kemal Drive kutusunu
 * işaretleyince yeni anahtar alınır. Kayıtlara dokunmaz.
 */
export const driveIzniniYenile = async () => {
  const saglayici = new GoogleAuthProvider();
  for (const k of googleProvider.getScopes()) saglayici.addScope(k);
  saglayici.setCustomParameters({ prompt: 'consent' });
  const result = await signInWithPopup(auth, saglayici);
  const credential = GoogleAuthProvider.credentialFromResult(result);
  if (credential?.accessToken) cachedAccessToken = credential.accessToken;
  return result.user;
};

/** Drive / Google hatası izin eksikliğinden mi */
export const izinEksikMi = (e: unknown) => /insufficient.*scope|insufficientPermissions|PERMISSION_DENIED|\b403\b/i.test(e instanceof Error ? e.message : String(e));

export const logoutUser = async () => {
  try {
    await signOut(auth);
    cachedAccessToken = null;
  } catch (error) {
    console.error("Çıkış yapılırken hata oluştu:", error);
    throw error;
  }
};

// Seed Example Data for new users
/* Örnek veri tohumlama (seedUserData) silindi — 29 Eylül. Boş alan boş kalır. */

export const subscribeToAllItemsWithArchived = (userId: string, callback: (items: Item[]) => void) => {
  let isCancelled = false;
  let currentUnsubscribe: (() => void) | null = null;
  let retryTimer: any = null;

  const startListening = () => {
    if (isCancelled) return;
    try {
      const q = query(collection(db, "users", userId, "items"));
      currentUnsubscribe = onSnapshot(q, (snapshot) => {
        const items: Item[] = [];
        snapshot.forEach((doc) => {
          items.push({ id: doc.id, ...doc.data() } as Item);
        });
        // Order by updatedAt desc
        items.sort((a, b) => b.updatedAt - a.updatedAt);
        callback(items);
      }, (error) => {
        console.warn("Firestore arşivli abonelik uyarısı, yeniden bağlanılıyor:", error);
        if (!isCancelled) {
          clearTimeout(retryTimer);
          retryTimer = setTimeout(startListening, 3000);
        }
      });
    } catch (e) {
      console.warn("Firestore listener başlatma hatası, tekrar denenecek:", e);
      if (!isCancelled) {
        clearTimeout(retryTimer);
        retryTimer = setTimeout(startListening, 4000);
      }
    }
  };

  startListening();

  return () => {
    isCancelled = true;
    clearTimeout(retryTimer);
    if (currentUnsubscribe) {
      try {
        currentUnsubscribe();
      } catch (_) {}
    }
  };
};

// Recursive helper to clean any undefined values from payloads before sending to Firestore
function cleanUndefined(obj: any): any {
  if (obj === null || obj === undefined) {
    return null;
  }
  if (Array.isArray(obj)) {
    return obj.map(item => cleanUndefined(item));
  }
  if (typeof obj === 'object') {
    // Keep standard Date objects if any, or general objects
    if (obj instanceof Date) {
      return obj;
    }
    const cleanObj: any = {};
    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        const val = obj[key];
        if (val !== undefined) {
          cleanObj[key] = cleanUndefined(val);
        }
      }
    }
    return cleanObj;
  }
  return obj;
}

/**
 * Sunucuya ulaşmayan yazma (12 Ekim, Dondurmacı kartının yazısı uyarısız
 * kayboldu). Günlük yazma sınırı dolunca ya da bağlantı kopunca Firestore
 * yazıyı reddetmiyor, kuyrukta tutup sonsuza dek yeniden deniyor; söz hiç
 * bitmediği için kartlar "Yazılıyor…"da takılı kalıyor, uyarı çıkmıyordu.
 * 15 sn içinde ulaşmayan yazı `zaman-asimi` hatasıyla döner; kuyruk yine
 * de işler. Geç ulaşan ya da geç reddedilen yazı dinleyicilere bildirilir.
 */
export const YAZMA_SURESI_MS = 15000;
let askidakiYazilar = 0;
type YaziDinleyici = (askida: number, gecHata?: unknown) => void;
const yaziDinleyicileri = new Set<YaziDinleyici>();
export const askidakiYazilariDinle = (fn: YaziDinleyici) => {
  yaziDinleyicileri.add(fn);
  return () => { yaziDinleyicileri.delete(fn); };
};
const bildir = (gecHata?: unknown) => yaziDinleyicileri.forEach(fn => fn(askidakiYazilar, gecHata));

export async function sunucuyaUlas<T>(yazi: Promise<T>): Promise<T> {
  let zaman: ReturnType<typeof setTimeout> | undefined;
  let gecikti = false;
  const bekle = new Promise<never>((_, ret) => {
    zaman = setTimeout(() => {
      gecikti = true;
      askidakiYazilar++;
      bildir();
      ret(new Error('zaman-asimi'));
    }, YAZMA_SURESI_MS);
  });
  yazi.then(
    () => { if (gecikti) { askidakiYazilar--; bildir(); } },
    (e) => { if (gecikti) { askidakiYazilar--; bildir(e); } }
  );
  try {
    return await Promise.race([yazi, bekle]);
  } finally {
    clearTimeout(zaman);
  }
}

export const saveItem = async (userId: string, item: Omit<Item, 'userId'>) => {
  const path = `users/${userId}/items/${item.id}`;
  const docRef = doc(db, "users", userId, "items", item.id);
  const data = cleanUndefined({
    ...item,
    userId,
    updatedAt: Date.now()
  });
  try {
    await sunucuyaUlas(setDoc(docRef, data, { merge: true }));
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
};

/**
 * Kayıttan alan siler (ör. "metadata.eskiMetin"). saveItem birleştirerek
 * yazdığı için alanı nesneden çıkarmak sunucuda silmiyor; burada açıkça
 * silinir (2 Ekim gece, eski alan temizliği).
 */
export const alanlariSil = async (userId: string, itemId: string, yollar: string[]) => {
  const path = `users/${userId}/items/${itemId}`;
  const docRef = doc(db, "users", userId, "items", itemId);
  try {
    await sunucuyaUlas(updateDoc(docRef, { ...Object.fromEntries(yollar.map(y => [y, deleteField()])), updatedAt: Date.now() }));
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
};

export const deleteItemDoc = async (userId: string, itemId: string) => {
  const path = `users/${userId}/items/${itemId}`;
  const docRef = doc(db, "users", userId, "items", itemId);
  try {
    await sunucuyaUlas(deleteDoc(docRef));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
};

// User settings
export const subscribeToSettings = (userId: string, callback: (settings: UserSettings) => void) => {
  const path = `users/${userId}/settings/general`;
  const docRef = doc(db, "users", userId, "settings", "general");
  return onSnapshot(docRef, (docSnap) => {
    if (docSnap.exists()) {
      callback(docSnap.data() as UserSettings);
    } else {
      callback({ theme: "arşiv" });
    }
  }, (error) => {
    console.error("Settings subscription error:", error);
    handleFirestoreError(error, OperationType.GET, path);
  });
};

export const saveSettings = async (userId: string, settings: UserSettings) => {
  const path = `users/${userId}/settings/general`;
  const docRef = doc(db, "users", userId, "settings", "general");
  try {
    await sunucuyaUlas(setDoc(docRef, settings, { merge: true }));
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
};
