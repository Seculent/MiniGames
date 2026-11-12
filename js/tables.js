// Столы: места, присутствие, монетка, ходы, реванш. Не зависят от конкретной игры:
// игра передаёт newOnlineState(players, first) и applyMove(state, seat, move).
export const STALE_MS = 95_000;   // после этого место считается свободным (в правилах Firestore — 90 с)
export const OFFLINE_MS = 45_000; // после этого показываем «не в сети»
export const HEARTBEAT_MS = 20_000;

let skew = Number(sessionStorage.getItem('clock-skew') || 0) || 0;
export const now = () => Date.now() + skew;
export function setSkew(v) { if (Math.abs(v) < 3_600_000) { skew = v; sessionStorage.setItem('clock-skew', String(v)); } }

export function ms(v) {
  if (v == null) return null;
  if (typeof v === 'number') return v;
  if (typeof v.toMillis === 'function') return v.toMillis();
  return null;
}
export function seatAge(seat) { const t = ms(seat && seat.lastSeen); return t == null ? 0 : now() - t; }
export function seatAlive(seat) { return !!seat && seatAge(seat) < STALE_MS; }
export function seatOf(t, uid) {
  if (!t) return -1;
  if (t.p0 && t.p0.uid === uid) return 0;
  if (t.p1 && t.p1.uid === uid) return 1;
  return -1;
}

const rid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
const emptyCoin = () => ({ c0: null, c1: null, result: null, first: null });

export function emptyTable(game, n, SERVER_TIME) {
  return { game, n, p0: null, p1: null, status: 'waiting', coin: emptyCoin(), gid: '', state: null,
    rematch: { r0: false, r1: false }, updatedAt: SERVER_TIME };
}

export function createTableOps(backend, SERVER_TIME) {
  const path = id => 'tables/' + id;
  const startCoin = t => { t.status = 'coin'; t.coin = emptyCoin(); t.gid = rid(); t.state = null; t.rematch = { r0: false, r1: false }; };
  const touch = t => { t.updatedAt = SERVER_TIME; return t; };

  return {
    ensure(game, count) {
      const jobs = [];
      for (let n = 1; n <= count; n++) jobs.push(backend.tx(path(`${game}-${n}`), cur => (cur ? undefined : emptyTable(game, n, SERVER_TIME))));
      return Promise.all(jobs);
    },
    join(id, user) {
      return backend.tx(path(id), t => {
        if (!t) throw new Error('Стол не найден');
        if (seatOf(t, user.uid) >= 0) return undefined;
        const free = [0, 1].find(i => !seatAlive(t['p' + i]));
        if (free === undefined) throw new Error('За столом уже двое');
        const other = 1 - free;
        t['p' + free] = { uid: user.uid, name: user.name, photo: user.photo || '', lastSeen: SERVER_TIME };
        if (!seatAlive(t['p' + other])) t['p' + other] = null;
        if (t['p' + other]) startCoin(t);
        else { t.status = 'waiting'; t.coin = emptyCoin(); t.rematch = { r0: false, r1: false }; }
        return touch(t);
      });
    },
    // Возвращает {forfeit, gid}, если вставший проиграл незаконченную партию
    async leave(id, uid) {
      let out = { forfeit: false, gid: '' };
      await backend.tx(path(id), t => {
        const i = seatOf(t, uid);
        if (i < 0) return undefined;
        if (t.status === 'playing' && t.state && !t.state.over) {
          t.state.over = true; t.state.winner = 1 - i; t.state.reason = 'left';
          t.status = 'finished'; out = { forfeit: true, gid: t.gid };
        }
        t['p' + i] = null;
        if (t.status === 'coin') { t.status = 'waiting'; t.coin = emptyCoin(); }
        t.rematch = { r0: false, r1: false };
        return touch(t);
      });
      return out;
    },
    heartbeat(id, uid) {
      return backend.tx(path(id), t => {
        const i = seatOf(t, uid);
        if (i < 0) return undefined;
        t['p' + i].lastSeen = SERVER_TIME;
        return t;
      });
    },
    pickCoin(id, uid, side, game) {
      return backend.tx(path(id), t => {
        const i = seatOf(t, uid);
        if (i < 0) throw new Error('Вы не за этим столом');
        if (t.status !== 'coin') throw new Error('Монетку уже бросили');
        if (!t.p0 || !t.p1) throw new Error('Соперник ушёл');
        if (t.coin['c' + i]) return undefined;
        const o = t.coin['c' + (1 - i)];
        if (o === side) throw new Error('Эту сторону уже выбрал соперник');
        t.coin['c' + i] = side;
        if (o) {
          const result = Math.random() < 0.5 ? 'h' : 't';
          const first = t.coin.c0 === result ? 0 : 1;
          t.coin.result = result; t.coin.first = first;
          t.state = game.newOnlineState([t.p0.uid, t.p1.uid], first);
          t.state.names = [t.p0.name, t.p1.name];
          t.status = 'playing';
        }
        return touch(t);
      });
    },
    move(id, uid, move, game) {
      return backend.tx(path(id), t => {
        const i = seatOf(t, uid);
        if (i < 0) throw new Error('Вы не за этим столом');
        if (t.status !== 'playing' || !t.state) throw new Error('Партия не идёт');
        t.state = game.applyMove(t.state, i, move);
        if (t.state.over) t.status = 'finished';
        return touch(t);
      });
    },
    rematch(id, uid) {
      return backend.tx(path(id), t => {
        const i = seatOf(t, uid);
        if (i < 0 || t.status !== 'finished') return undefined;
        if (!seatAlive(t['p' + (1 - i)])) throw new Error('Соперник ушёл из-за стола');
        t.rematch['r' + i] = true;
        if (t.rematch.r0 && t.rematch.r1) startCoin(t);
        return touch(t);
      });
    },
    claimTimeout(id, uid) {
      return backend.tx(path(id), t => {
        const i = seatOf(t, uid), o = 1 - i;
        if (i < 0 || t.status !== 'playing' || !t.state || t.state.over) return undefined;
        if (seatAlive(t['p' + o])) throw new Error('Соперник снова в сети');
        t.state.over = true; t.state.winner = i; t.state.reason = 'timeout';
        t.status = 'finished'; t['p' + o] = null;
        return touch(t);
      });
    },
  };
}
