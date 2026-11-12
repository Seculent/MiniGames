// Доступ к Firebase: вход через Google и база Firestore.
import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.11.0/firebase-app.js';
import { getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect, onAuthStateChanged, signOut as fbSignOut,
  deleteUser, reauthenticateWithPopup }
  from 'https://www.gstatic.com/firebasejs/12.11.0/firebase-auth.js';
import { getFirestore, doc, collection, onSnapshot, runTransaction, serverTimestamp, query, orderBy, limit, getDocs, getDoc, deleteDoc }
  from 'https://www.gstatic.com/firebasejs/12.11.0/firebase-firestore.js';
import { firebaseConfig } from './config.js';

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

export const SERVER_TIME = { __serverTime: true };

function prepare(v) {
  if (v === SERVER_TIME || (v && v.__serverTime)) return serverTimestamp();
  if (Array.isArray(v)) return v.map(prepare);
  if (v && typeof v === 'object' && typeof v.toMillis !== 'function') {
    const o = {};
    for (const k of Object.keys(v)) if (v[k] !== undefined) o[k] = prepare(v[k]);
    return o;
  }
  return v;
}

export const backend = {
  kind: 'firebase',
  onUser(cb) {
    return onAuthStateChanged(auth, u => cb(u ? { uid: u.uid, name: (u.displayName || u.email || 'Игрок').slice(0, 40), photo: u.photoURL || '' } : null));
  },
  async signIn() {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    try { await signInWithPopup(auth, provider); }
    catch (e) {
      if (e && (e.code === 'auth/popup-blocked' || e.code === 'auth/operation-not-supported-in-this-environment')) await signInWithRedirect(auth, provider);
      else throw e;
    }
  },
  signOut() { return fbSignOut(auth); },
  del(path) { return deleteDoc(doc(db, path)); },
  // Удаление аккаунта Firebase; если вход был давно, Google попросит подтвердить вход
  async deleteUser() {
    const u = auth.currentUser;
    if (!u) return;
    try { await deleteUser(u); }
    catch (e) {
      if (e && e.code === 'auth/requires-recent-login') {
        await reauthenticateWithPopup(u, new GoogleAuthProvider());
        await deleteUser(u);
      } else throw e;
    }
  },
  onDoc(path, cb, err) {
    return onSnapshot(doc(db, path), s => cb(s.exists() ? s.data({ serverTimestamps: 'estimate' }) : null, s.metadata), err);
  },
  onCol(path, cb, err) {
    return onSnapshot(collection(db, path), s => cb(s.docs.map(d => ({ id: d.id, ...d.data({ serverTimestamps: 'estimate' }) }))), err);
  },
  async get(path) {
    const s = await getDoc(doc(db, path));
    return s.exists() ? s.data() : null;
  },
  // fn(текущие данные | null) → новые данные целиком, либо undefined (ничего не писать)
  tx(path, fn) {
    const ref = doc(db, path);
    return runTransaction(db, async t => {
      const s = await t.get(ref);
      const next = fn(s.exists() ? s.data() : null);
      if (next !== undefined) t.set(ref, prepare(next));
      return next;
    });
  },
  async list(col) {
    const s = await getDocs(collection(db, col));
    return s.docs.map(d => ({ id: d.id, ...d.data() }));
  },
  async top(col, field, n) {
    const s = await getDocs(query(collection(db, col), orderBy(field, 'desc'), limit(n)));
    return s.docs.map(d => ({ id: d.id, ...d.data() }));
  },
};
