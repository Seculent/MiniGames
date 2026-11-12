// «Морской бой» — чистые правила, без DOM и сети.
// Поле 10×10, клетка = число 0..99 (строка * 10 + столбец).
// Флот: 4, 3, 3, 2, 2, 2, 1, 1, 1, 1. Корабли не касаются даже углами.
// Попал — стреляешь ещё. Расстановка игрока хранится только у него (fleets/{uid}),
// в общем состоянии стола — лишь её отпечаток SHA-256 (commit), который сверяется в конце.

export const N = 10;
export const FLEET = [4, 3, 3, 2, 2, 2, 1, 1, 1, 1];
export const COLS = 'АБВГДЕЖЗИК';
export const cellName = c => COLS[c % N] + (Math.floor(c / N) + 1);

export function around(c) {
  const r = Math.floor(c / N), k = c % N, out = [];
  for (let dr = -1; dr <= 1; dr++) for (let dk = -1; dk <= 1; dk++) {
    if (!dr && !dk) continue;
    const rr = r + dr, kk = k + dk;
    if (rr >= 0 && rr < N && kk >= 0 && kk < N) out.push(rr * N + kk);
  }
  return out;
}

export function shipCells(start, size, vertical) {
  const r = Math.floor(start / N), k = start % N, cells = [];
  for (let i = 0; i < size; i++) {
    const rr = r + (vertical ? i : 0), kk = k + (vertical ? 0 : i);
    if (rr >= N || kk >= N) return null;
    cells.push(rr * N + kk);
  }
  return cells;
}

// Можно ли поставить корабль cells при уже стоящих ships (кроме индекса skip)
export function canPlace(ships, cells, skip = -1) {
  if (!cells) return false;
  const busy = new Set();
  ships.forEach((s, i) => { if (i !== skip && s) for (const c of s.cells) { busy.add(c); for (const a of around(c)) busy.add(a); } });
  return cells.every(c => !busy.has(c));
}

export function randomFleet(rnd = Math.random) {
  for (let attempt = 0; attempt < 200; attempt++) {
    const ships = []; let ok = true;
    for (const size of FLEET) {
      let placed = false;
      for (let t = 0; t < 300 && !placed; t++) {
        const v = rnd() < 0.5, start = Math.floor(rnd() * N * N);
        const cells = shipCells(start, size, v);
        if (canPlace(ships, cells)) { ships.push({ cells }); placed = true; }
      }
      if (!placed) { ok = false; break; }
    }
    if (ok) return ships;
  }
  throw new Error('Не удалось расставить флот');
}

export function validFleet(ships) {
  if (!Array.isArray(ships) || ships.length !== FLEET.length) return false;
  const sizes = ships.map(s => (s && Array.isArray(s.cells) ? s.cells.length : 0)).sort((a, b) => b - a);
  if (sizes.join() !== FLEET.join()) return false;
  const placed = [];
  for (const s of ships) {
    const cells = s.cells.slice().sort((a, b) => a - b);
    if (!cells.every(c => Number.isInteger(c) && c >= 0 && c < N * N)) return false;
    const horiz = shipCells(cells[0], cells.length, false), vert = shipCells(cells[0], cells.length, true);
    const same = x => x && x.join() === cells.join();
    if (!same(horiz) && !same(vert)) return false;
    if (!canPlace(placed, cells)) return false;
    placed.push({ cells });
  }
  return true;
}

export function canonical(ships) {
  return ships.map(s => s.cells.slice().sort((a, b) => a - b)).sort((a, b) => a[0] - b[0]);
}
export async function fleetHash(ships, salt) {
  const data = new TextEncoder().encode(JSON.stringify({ s: canonical(ships), salt }));
  const buf = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}
export function newSalt() {
  const a = new Uint8Array(16); crypto.getRandomValues(a);
  return [...a].map(b => b.toString(16).padStart(2, '0')).join('');
}

// Ответ защищающегося на выстрел c. enemyShots — уже сделанные по нему выстрелы.
export function answerShot(ships, enemyShots, c) {
  const ship = ships.find(s => s.cells.includes(c));
  if (!ship) return { r: 'm' };
  const hit = new Set(enemyShots.filter(x => x.r !== 'm').map(x => x.c)); hit.add(c);
  if (ship.cells.every(x => hit.has(x))) return { r: 's', sk: ship.cells.slice().sort((a, b) => a - b) };
  return { r: 'h' };
}

// Клетки вокруг потопленных кораблей — туда стрелять бессмысленно
export function deadZone(shots) {
  const z = new Set();
  for (const s of shots) if (s.r === 's' && s.sk) for (const c of s.sk) for (const a of around(c)) z.add(a);
  for (const s of shots) z.delete(s.c);
  return z;
}

// ---------- Бот ----------
// shots — выстрелы бота ({c, r, sk}). Возвращает клетку для следующего выстрела.
export function botShot(shots, diff, rnd = Math.random) {
  const shot = new Map(shots.map(s => [s.c, s.r]));
  const dz = deadZone(shots);
  const sunkCells = new Set(), sunkSizes = [];
  for (const s of shots) if (s.r === 's' && s.sk) { s.sk.forEach(c => sunkCells.add(c)); sunkSizes.push(s.sk.length); }
  const hits = shots.filter(s => s.r === 'h' && !sunkCells.has(s.c)).map(s => s.c);
  const avail = c => !shot.has(c) && !dz.has(c);
  const free = [...Array(N * N).keys()].filter(avail);
  const pick = arr => arr[Math.floor(rnd() * arr.length)];
  if (!free.length) return -1;
  if (diff === 'easy') { const any = [...Array(N * N).keys()].filter(c => !shot.has(c)); return pick(any); }

  const left = FLEET.slice();
  for (const s of sunkSizes) { const i = left.indexOf(s); if (i >= 0) left.splice(i, 1); }
  const rc = c => [Math.floor(c / N), c % N];

  if (diff === 'normal') {
    if (hits.length) {
      let cand = [];
      if (hits.length >= 2) {
        const [r0, k0] = rc(hits[0]);
        const sameRow = hits.every(h => rc(h)[0] === r0), sameCol = hits.every(h => rc(h)[1] === k0);
        if (sameRow || sameCol) {
          const sorted = hits.slice().sort((a, b) => a - b), step = sameRow ? 1 : N;
          const a = sorted[0] - step, b = sorted[sorted.length - 1] + step;
          if (a >= 0 && (!sameRow || rc(a)[0] === r0)) cand.push(a);
          if (b < N * N && (!sameRow || rc(b)[0] === r0)) cand.push(b);
          cand = cand.filter(avail);
        }
      }
      if (!cand.length) for (const h of hits) {
        const [r, k] = rc(h);
        for (const [dr, dk] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const rr = r + dr, kk = k + dk;
          if (rr >= 0 && rr < N && kk >= 0 && kk < N && avail(rr * N + kk)) cand.push(rr * N + kk);
        }
      }
      if (cand.length) return pick(cand);
    }
    // ищет новые корабли без системы и иногда стреляет рядом с потопленными
    return pick(rnd() < 0.5 ? free : [...Array(N * N).keys()].filter(c => !shot.has(c)));
  }

  // hard: карта вероятностей по всем возможным положениям оставшихся кораблей
  const blocked = c => shot.get(c) === 'm' || sunkCells.has(c) || dz.has(c);
  const hitSet = new Set(hits);
  const score = new Array(N * N).fill(0);
  for (const size of left) for (let start = 0; start < N * N; start++) for (const v of [false, true]) {
    if (size === 1 && v) continue;
    const cells = shipCells(start, size, v);
    if (!cells || cells.some(blocked)) continue;
    const covered = cells.filter(c => hitSet.has(c)).length;
    if (hits.length && !covered) continue;
    const w = hits.length ? Math.pow(30, covered) : 1;
    for (const c of cells) if (!shot.has(c)) score[c] += w;
  }
  let pool = free;
  if (!hits.length) {
    const m = Math.min(...left);
    if (m > 1) { const lat = free.filter(c => { const [r, k] = rc(c); return (r + k) % m === 0; }); if (lat.length) pool = lat; }
  }
  let best = -1, arr = [];
  for (const c of pool) { if (score[c] > best) { best = score[c]; arr = [c]; } else if (score[c] === best) arr.push(c); }
  return pick(arr.length ? arr : free);
}

export function newState(first, players = ['', '']) {
  return { kind: 'battleship', phase: 'place', first, cur: first, players, ready: [false, false], commit: ['', ''],
    shots0: [], shots1: [], pending: null, sc: [0, 0], moves: 0, over: false, winner: null, reason: '', note: '',
    reveal0: null, reveal1: null };
}

const clone = s => JSON.parse(JSON.stringify(s));

export function applyMove(s0, seat, m) {
  if (!m || typeof m !== 'object') throw new Error('Неверный ход');
  const s = clone(s0), opp = 1 - seat;
  s.note = '';
  if (m.t === 'ready') {
    if (s.phase !== 'place' || s.over) throw new Error('Расстановка уже закончена');
    if (s.ready[seat]) return s;
    if (!/^[0-9a-f]{64}$/.test(m.commit || '')) throw new Error('Нет отпечатка расстановки');
    s.ready[seat] = true; s.commit[seat] = m.commit;
    if (s.ready[0] && s.ready[1]) { s.phase = 'battle'; s.cur = s.first; }
    return s;
  }
  if (m.t === 'shot') {
    if (s.phase !== 'battle' || s.over) throw new Error('Сейчас не время стрелять');
    if (s.cur !== seat) throw new Error('Сейчас стреляет соперник');
    if (s.pending) throw new Error('Ждём ответа на прошлый выстрел');
    const c = m.c;
    if (!Number.isInteger(c) || c < 0 || c >= N * N) throw new Error('Мимо поля');
    if (s['shots' + seat].some(x => x.c === c)) throw new Error('Сюда уже стреляли');
    s.pending = { seat, c };
    return s;
  }
  if (m.t === 'answer') {
    // отвечает защищающийся: seat — тот, по кому стреляли
    if (s.phase !== 'battle' || s.over || !s.pending) throw new Error('Нет выстрела для ответа');
    if (s.pending.seat !== opp || s.pending.c !== m.c) throw new Error('Ход уже обработан');
    if (!['m', 'h', 's'].includes(m.r)) throw new Error('Неверный ответ');
    const shot = { c: m.c, r: m.r };
    if (m.r === 's') {
      if (!Array.isArray(m.sk) || !m.sk.includes(m.c) || m.sk.length > 4) throw new Error('Неверный ответ');
      shot.sk = m.sk.slice();
    }
    s['shots' + opp].push(shot);
    s.pending = null; s.moves++;
    if (m.r === 'm') s.cur = seat;
    else s.cur = opp;
    if (m.r === 's') {
      s.sc[opp]++;
      if (s.sc[opp] >= FLEET.length) { s.over = true; s.winner = opp; s.phase = 'over'; s.reason = ''; }
    }
    return s;
  }
  if (m.t === 'reveal') {
    if (!s.over) throw new Error('Расстановку раскрывают после партии');
    if (s['reveal' + seat]) return s;
    s['reveal' + seat] = { ships: (m.ships || []).map(x => ({ cells: x.cells.slice() })), salt: String(m.salt || '') };
    return s;
  }
  throw new Error('Неизвестный ход');
}

// Проверка честности после партии: отпечаток совпал, флот по правилам, ответы сходятся.
// Возвращает 'ok' | 'bad' | null (ещё не раскрыто).
export async function verifySeat(s, seat) {
  const rv = s['reveal' + seat];
  if (!rv || !s.commit[seat]) return null;
  if (!validFleet(rv.ships)) return 'bad';
  if ((await fleetHash(rv.ships, rv.salt)) !== s.commit[seat]) return 'bad';
  const shots = s['shots' + (1 - seat)];
  for (let i = 0; i < shots.length; i++) {
    const exp = answerShot(rv.ships, shots.slice(0, i), shots[i].c);
    if (exp.r !== shots[i].r) return 'bad';
  }
  return 'ok';
}
