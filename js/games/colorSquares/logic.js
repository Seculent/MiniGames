// «Цветные квадраты» — чистые правила, без DOM и сети.
// Поле детерминированно строится из seed, поэтому у обоих игроков оно одинаковое.

export const W = 18, H = 14;
export const PCOL = [[0, 1], [2, 3]]; // место 0: изумрудный+синий, место 1: коралловый+янтарный
export const COLORS = ['#1f9d6b', '#4c5fd5', '#e5533d', '#f2b33d'];
export const CNAME_INS = ['изумрудным', 'синим', 'коралловым', 'янтарным'];

export function mulberry(seed) {
  return function () {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

export function neighbors(i) {
  const x = i % W, y = (i / W) | 0, a = [];
  if (x > 0) a.push(i - 1);
  if (x < W - 1) a.push(i + 1);
  if (y > 0) a.push(i - W);
  if (y < H - 1) a.push(i + W);
  return a;
}

export function genBoard(seed) {
  const R = mulberry(seed), N = W * H, own = new Array(N).fill(-1);
  const order = [...Array(N).keys()];
  for (let i = N - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
  const regs = [];
  for (const s of order) {
    if (own[s] !== -1) continue;
    const id = regs.length, r = R();
    const target = r < 0.10 ? 16 + Math.floor(R() * 16) : r < 0.42 ? 6 + Math.floor(R() * 7) : 2 + Math.floor(R() * 4);
    const cells = [s]; own[s] = id;
    const frontier = neighbors(s).filter(j => own[j] === -1);
    while (cells.length < target && frontier.length) {
      const k = Math.floor(R() * frontier.length), c = frontier[k];
      frontier.splice(k, 1);
      if (own[c] !== -1) continue;
      own[c] = id; cells.push(c);
      for (const j of neighbors(c)) if (own[j] === -1) frontier.push(j);
    }
    regs.push(cells);
  }
  for (let r = 0; r < regs.length; r++) {
    if (regs[r].length === 1 && R() < 0.75) {
      const c = regs[r][0];
      const ns = neighbors(c).map(j => own[j]).filter(o => o !== r);
      if (ns.length) { const t = ns[Math.floor(R() * ns.length)]; own[c] = t; regs[t].push(c); regs[r] = []; }
    }
  }
  const map = new Map(); let n = 0;
  regs.forEach((cells, i) => { if (cells.length) map.set(i, n++); });
  for (let i = 0; i < N; i++) own[i] = map.get(own[i]);
  const cells = Array.from({ length: n }, () => []);
  for (let i = 0; i < N; i++) cells[own[i]].push(i);
  const adjSet = Array.from({ length: n }, () => new Set());
  for (let i = 0; i < N; i++) for (const j of neighbors(i)) if (own[j] !== own[i]) adjSet[own[i]].add(own[j]);
  return { seed, own, n, cells, size: cells.map(c => c.length), adj: adjSet.map(s => [...s]) };
}

const cache = new Map();
export function getBoard(seed) {
  if (!cache.has(seed)) { if (cache.size > 8) cache.clear(); cache.set(seed, genBoard(seed)); }
  return cache.get(seed);
}

export function legal(B, fill, r, c) {
  if (fill[r] !== -1) return false;
  for (const n of B.adj[r]) if (fill[n] === c) return false;
  return true;
}
export function hasMove(B, fill, c) {
  for (let r = 0; r < B.n; r++) if (legal(B, fill, r, c)) return true;
  return false;
}
export function scores(B, fill) {
  const s = [0, 0];
  for (let r = 0; r < B.n; r++) if (fill[r] >= 0) s[fill[r] >> 1] += B.size[r];
  return s;
}

// Определяет, чей ход и каким цветом. Цвета игрока чередуются; если текущему
// некуда встать — ходит другим; если не встаёт ни один — пропуск хода.
export function resolveTurn(B, s) {
  s.note = '';
  for (let guard = 0; guard < 4; guard++) {
    if (![0, 1, 2, 3].some(c => hasMove(B, s.fill, c))) {
      s.over = true; s.active = -1;
      s.sc = scores(B, s.fill);
      s.winner = s.sc[0] > s.sc[1] ? 0 : s.sc[1] > s.sc[0] ? 1 : -1;
      return s;
    }
    const p = s.cur, pref = PCOL[p][s.next[p]], alt = PCOL[p][1 - s.next[p]];
    if (hasMove(B, s.fill, pref)) { s.active = pref; return s; }
    if (hasMove(B, s.fill, alt)) { s.active = alt; s.note = `skip:${p}:${pref}`; return s; }
    s.note = `pass:${p}`;
    s.cur = 1 - p;
  }
  return s;
}

export function newState(seed, first, players = ['', '']) {
  const B = getBoard(seed);
  const s = { seed, fill: new Array(B.n).fill(-1), cur: first, first, next: [0, 0], active: -1,
    over: false, winner: null, sc: [0, 0], moves: 0, note: '', last: null, players, reason: '' };
  return resolveTurn(B, s);
}

export function cloneState(s) {
  return { ...s, fill: s.fill.slice(), next: s.next.slice(), sc: s.sc.slice(), players: s.players.slice(),
    last: s.last ? { ...s.last } : null };
}

// Возвращает новое состояние или бросает ошибку с понятным текстом.
export function applyMove(s0, seat, r) {
  const B = getBoard(s0.seed);
  if (s0.over) throw new Error('Партия уже окончена');
  if (s0.cur !== seat) throw new Error('Сейчас не ваш ход');
  if (!(r >= 0 && r < B.n) || !legal(B, s0.fill, r, s0.active)) throw new Error('Сюда этим цветом нельзя');
  const s = cloneState(s0);
  s.fill[r] = s.active;
  s.next[seat] = PCOL[seat].indexOf(s.active) === 0 ? 1 : 0;
  s.last = { r, seat };
  s.moves++;
  s.cur = 1 - seat;
  s.sc = scores(B, s.fill);
  return resolveTurn(B, s);
}

// Соперник-енот для одиночной игры
export function aiPick(s, diff) {
  const B = getBoard(s.seed), c = s.active, me = s.cur, op = 1 - me;
  const moves = [];
  for (let r = 0; r < B.n; r++) if (legal(B, s.fill, r, c)) moves.push(r);
  if (!moves.length) return -1;
  if (diff === 'easy') {
    if (Math.random() < 0.35) return moves[Math.floor(Math.random() * moves.length)];
    const w = moves.map(r => Math.sqrt(B.size[r]));
    let x = Math.random() * w.reduce((a, b) => a + b, 0);
    for (let i = 0; i < moves.length; i++) { x -= w[i]; if (x <= 0) return moves[i]; }
    return moves[moves.length - 1];
  }
  let best = -1e9, pick = moves[0];
  if (diff === 'normal') {
    for (const r of moves) { const v = B.size[r] + Math.random() * 1.5; if (v > best) { best = v; pick = r; } }
    return pick;
  }
  const pot = (f, p) => {
    let sum = 0;
    for (let q = 0; q < B.n; q++) if (f[q] === -1 && (legal(B, f, q, PCOL[p][0]) || legal(B, f, q, PCOL[p][1]))) sum += B.size[q];
    return sum;
  };
  for (const r of moves) {
    const f2 = s.fill.slice(); f2[r] = c;
    const v = B.size[r] * 2 + 0.5 * (pot(f2, me) - pot(f2, op)) + Math.random() * 0.3;
    if (v > best) { best = v; pick = r; }
  }
  return pick;
}
