// Локальная подмена Firebase для проверки без интернета: index.html?mock=Имя
// Данные лежат в localStorage и синхронизируются между вкладками одного браузера.
export const SERVER_TIME = { __serverTime: true };
const KEY = 'mock-db-v1';
const listeners = new Set();

function load() { try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch (e) { return {}; } }
function save(db) { localStorage.setItem(KEY, JSON.stringify(db)); }
function prepare(v, now) {
  if (v && v.__serverTime) return now;
  if (Array.isArray(v)) return v.map(x => prepare(x, now));
  if (v && typeof v === 'object') { const o = {}; for (const k of Object.keys(v)) if (v[k] !== undefined) o[k] = prepare(v[k], now); return o; }
  return v;
}
function emit() { const db = load(); for (const l of listeners) l(db); }
window.addEventListener('storage', e => { if (e.key === KEY) emit(); });
const clone = x => (x == null ? null : JSON.parse(JSON.stringify(x)));

const name = new URLSearchParams(location.search).get('mock') || 'Тест';
const user = { uid: 'u-' + name.toLowerCase().replace(/[^a-zа-я0-9]/gi, ''), name, photo: '' };
let signedIn = sessionStorage.getItem('mock-signed') === '1';
const userCbs = new Set();

export const backend = {
  kind: 'mock',
  onUser(cb) { userCbs.add(cb); setTimeout(() => cb(signedIn ? user : null), 0); return () => userCbs.delete(cb); },
  async signIn() { signedIn = true; sessionStorage.setItem('mock-signed', '1'); userCbs.forEach(cb => cb(user)); },
  async signOut() { signedIn = false; sessionStorage.removeItem('mock-signed'); userCbs.forEach(cb => cb(null)); },
  onDoc(path, cb) {
    let last;
    const l = db => { const s = JSON.stringify(db[path] ?? null); if (s !== last) { last = s; cb(clone(db[path] ?? null), {}); } };
    listeners.add(l); setTimeout(() => l(load()), 0);
    return () => listeners.delete(l);
  },
  onCol(path, cb) {
    let last;
    const l = db => {
      const arr = Object.keys(db).filter(k => k.startsWith(path + '/') && k.split('/').length === path.split('/').length + 1)
        .sort().map(k => ({ id: k.split('/').pop(), ...db[k] }));
      const s = JSON.stringify(arr); if (s !== last) { last = s; cb(clone(arr)); }
    };
    listeners.add(l); setTimeout(() => l(load()), 0);
    return () => listeners.delete(l);
  },
  async get(path) { return clone(load()[path] ?? null); },
  async del(path) { const db = load(); delete db[path]; save(db); emit(); },
  async deleteUser() { await this.signOut(); },
  async tx(path, fn) {
    await new Promise(r => setTimeout(r, 30));
    const db = load();
    const next = fn(clone(db[path] ?? null));
    if (next !== undefined) { const fresh = load(); fresh[path] = prepare(next, Date.now()); save(fresh); emit(); }
    return next;
  },
  async list(col) {
    const db = load();
    return Object.keys(db).filter(k => k.startsWith(col + '/') && k.split('/').length === 2).map(k => ({ id: k.split('/').pop(), ...clone(db[k]) }));
  },
  async top(col, field, n) {
    const db = load();
    const get = (o, f) => f.split('.').reduce((a, k) => (a == null ? a : a[k]), o);
    return Object.keys(db).filter(k => k.startsWith(col + '/')).map(k => ({ id: k.split('/').pop(), ...db[k] }))
      .filter(d => typeof get(d, field) === 'number').sort((a, b) => get(b, field) - get(a, field)).slice(0, n);
  },
};
