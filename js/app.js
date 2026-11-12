// Игротека: вход, лобби, столы, одиночные игры, таблица лидеров.
import { GAMES, gameById } from './registry.js';
import { $, esc, avatarHTML, toast, confirmBox, plural } from './ui.js';
import { createTableOps, seatAlive, seatOf, seatAge, ms, setSkew, OFFLINE_MS, STALE_MS, HEARTBEAT_MS } from './tables.js';
import { createStats } from './stats.js';
import { coinFace, flipCoin, SIDE_NAME } from './coin.js';

const main = $('#main');
const useMock = new URLSearchParams(location.search).has('mock');

let backend, SERVER_TIME;
try {
  ({ backend, SERVER_TIME } = useMock ? await import('./backend-mock.js') : await import('./backend-firebase.js'));
} catch (e) {
  main.innerHTML = `<div class="panel center narrow"><h2>Не удалось подключиться к серверу</h2>
    <p>Firebase не загрузился. Проверьте интернет; если вы в России и сайт не открывается, попробуйте другую сеть.</p>
    <p class="muted">${esc(e && e.message)}</p></div>`;
  throw e;
}

const ops = createTableOps(backend, SERVER_TIME);
const stats = createStats(backend, SERVER_TIME);

let user = null, tables = [], unsubTables = null, cleanup = null, lobbyRefresh = null;

function errMsg(e) {
  const c = e && e.code;
  if (c === 'permission-denied') return 'Нет доступа: проверьте правила Firestore';
  if (c === 'unavailable') return 'Нет связи с сервером, попробуйте ещё раз';
  if (c === 'auth/popup-closed-by-user' || c === 'auth/cancelled-popup-request') return 'Окно входа закрыто';
  if (c === 'auth/unauthorized-domain') return 'Этот адрес сайта не добавлен в Authorized domains в Firebase';
  return (e && e.message) || 'Что-то пошло не так';
}

/* ---------- Шапка ---------- */
function renderTop() {
  const box = $('#userbox');
  if (!user) { box.innerHTML = ''; return; }
  box.innerHTML = `<span class="ava sm">${avatarHTML(user)}</span><span class="uname">${esc(user.name)}</span>
    <button class="btn ghost sm" id="logout">Выйти</button>`;
  $('#logout').onclick = async () => {
    const mine = tables.find(t => seatOf(t, user.uid) >= 0);
    if (mine && !(await confirmBox('Выйти?', 'Вы сидите за столом. Место освободится, а незаконченная партия будет проиграна.', 'Выйти'))) return;
    if (mine) await leaveTable(mine.id, true);
    backend.signOut();
  };
}

/* ---------- Роутинг ---------- */
function route() {
  if (cleanup) { try { cleanup(); } catch (e) {} cleanup = null; }
  lobbyRefresh = null;
  window.scrollTo(0, 0);
  if (!user) return renderLogin();
  const h = location.hash.replace(/^#\/?/, '');
  const [kind, arg] = h.split('/');
  if (kind === 't' && arg) return renderTable(decodeURIComponent(arg));
  if (kind === 'solo' && arg) return renderSolo(decodeURIComponent(arg));
  renderLobby();
}
window.addEventListener('hashchange', route);

backend.onUser(u => {
  user = u;
  renderTop();
  if (unsubTables) { unsubTables(); unsubTables = null; }
  if (u) {
    unsubTables = backend.onCol('tables', list => { tables = list; if (lobbyRefresh) lobbyRefresh(); },
      e => toast(errMsg(e)));
    for (const g of GAMES) if (!g.soon && g.tables) ops.ensure(g.id, g.tables).catch(e => console.warn('ensure tables', e));
  }
  route();
});

/* ---------- Вход ---------- */
function renderLogin() {
  main.innerHTML = `<div class="login">
    <div class="login-art">${['#1f9d6b', '#e5533d', '#f2b33d', '#4c5fd5'].map((c, i) => `<i style="background:${c};animation-delay:${i * .15}s"></i>`).join('')}</div>
    <h1>Игротека</h1>
    <p>Маленькие игры на двоих: садись за стол, бросай монетку и играй с другом онлайн.</p>
    <button class="btn primary big" id="signin"><svg viewBox="0 0 24 24" width="20" height="20"><path fill="#fff" d="M21.6 12.2c0-.7-.1-1.4-.2-2H12v3.8h5.4a4.6 4.6 0 0 1-2 3v2.5h3.2c1.9-1.7 3-4.3 3-7.3z"/><path fill="#fff" opacity=".85" d="M12 22c2.7 0 5-.9 6.6-2.4l-3.2-2.5c-.9.6-2 1-3.4 1-2.6 0-4.8-1.8-5.6-4.1H3.1v2.6A10 10 0 0 0 12 22z"/><path fill="#fff" opacity=".7" d="M6.4 14c-.2-.6-.3-1.3-.3-2s.1-1.4.3-2V7.4H3.1a10 10 0 0 0 0 9.2L6.4 14z"/><path fill="#fff" opacity=".55" d="M12 5.9c1.5 0 2.8.5 3.8 1.5l2.9-2.9A10 10 0 0 0 3.1 7.4L6.4 10C7.2 7.7 9.4 5.9 12 5.9z"/></svg>
      Войти через Google</button>
    <p class="muted small">Нужен только для того, чтобы видеть, кто сидит за столом, и считать победы.</p>
  </div>`;
  $('#signin').onclick = async () => {
    $('#signin').disabled = true;
    try { await backend.signIn(); } catch (e) { toast(errMsg(e)); }
    $('#signin') && ($('#signin').disabled = false);
  };
}

/* ---------- Лобби ---------- */
function openSet() { try { return new Set(JSON.parse(localStorage.getItem('open-games') || '["colorSquares"]')); } catch (e) { return new Set(['colorSquares']); } }
function saveOpen(s) { try { localStorage.setItem('open-games', JSON.stringify([...s])); } catch (e) {} }

function tableInfo(t) {
  const seats = [t && t.p0, t && t.p1].map(s => (seatAlive(s) ? s : null));
  const count = seats.filter(Boolean).length;
  let status = 'свободен';
  if (count === 1) status = 'ждёт соперника';
  if (count === 2) status = t.status === 'coin' ? 'бросают монетку' : t.status === 'playing' ? 'идёт партия' : 'партия окончена';
  return { seats, count, status };
}

function renderLobby() {
  main.innerHTML = `<div class="lobby"><div class="games" id="games"></div>
    <aside class="panel leaders"><div class="lb-head"><h2>Таблица лидеров</h2><button class="btn ghost sm" id="lbReload" title="Обновить">↻</button></div>
    <div class="tabs" id="lbTabs"></div><div id="lbList" class="lb-list"><p class="muted">Загрузка…</p></div><div id="myStats" class="mystats"></div></aside></div>`;
  const open = openSet();
  const drawGames = () => {
    const myTable = tables.find(t => seatOf(t, user.uid) >= 0 && seatAlive(t['p' + seatOf(t, user.uid)]));
    $('#games').innerHTML = GAMES.map(g => {
      if (g.soon) return `<div class="game-card soon"><div class="gc-head"><span class="gc-ico">${g.icon}</span><span class="gc-t"><b>${esc(g.title)}</b><small>${esc(g.desc)}</small></span><span class="badge">скоро</span></div></div>`;
      const ts = Array.from({ length: g.tables }, (_, k) => { const id = `${g.id}-${k + 1}`; return { id, n: k + 1, t: tables.find(x => x.id === id) }; });
      const people = ts.reduce((a, x) => a + tableInfo(x.t).count, 0);
      const rows = ts.map(({ id, n, t }) => {
        const info = tableInfo(t);
        const mine = t && seatOf(t, user.uid) >= 0 && info.seats[seatOf(t, user.uid)];
        const chips = info.seats.map(s => s ? `<span class="seat"><span class="ava xs">${avatarHTML(s)}</span>${esc(s.name)}</span>` : '<span class="seat empty">свободно</span>').join('');
        let btn;
        if (mine) btn = `<button class="btn primary sm" data-go="${id}">Вернуться</button>`;
        else if (info.count < 2) btn = `<button class="btn primary sm" data-join="${id}">Сесть</button>`;
        else btn = `<button class="btn sm" data-go="${id}">Смотреть</button>`;
        return `<div class="trow ${info.count === 1 ? 'waiting' : ''}"><div class="tname">Стол ${n}<small>${info.count}/2 · ${info.status}</small></div>
          <div class="seats">${chips}</div>${btn}</div>`;
      }).join('');
      return `<div class="game-card ${open.has(g.id) ? 'open' : ''}" data-card="${g.id}">
        <button class="gc-head" data-toggle="${g.id}"><span class="gc-ico">${g.icon}</span><span class="gc-t"><b>${esc(g.title)}</b><small>${esc(g.desc)}</small></span>
          <span class="gc-meta">${people ? `${people} ${plural(people, 'игрок', 'игрока', 'игроков')} за столами` : 'столы свободны'}</span><span class="chev">▾</span></button>
        <div class="gc-body">${rows}
          <div class="gc-actions">${g.solo ? `<a class="btn" href="#/solo/${g.id}">🦝 ${esc(g.solo)}</a>` : ''}<button class="btn ghost" data-rules="${g.id}">Правила</button></div>
        </div></div>`;
    }).join('');
    $('#games').querySelectorAll('[data-toggle]').forEach(b => b.onclick = () => {
      const id = b.dataset.toggle; open.has(id) ? open.delete(id) : open.add(id); saveOpen(open);
      b.closest('.game-card').classList.toggle('open');
    });
    $('#games').querySelectorAll('[data-go]').forEach(b => b.onclick = () => { location.hash = '#/t/' + b.dataset.go; });
    $('#games').querySelectorAll('[data-join]').forEach(b => b.onclick = () => joinTable(b.dataset.join, myTable));
    $('#games').querySelectorAll('[data-rules]').forEach(b => b.onclick = () => showRules(b.dataset.rules));
  };
  drawGames();
  lobbyRefresh = drawGames;

  // таблица лидеров
  const tabs = [...GAMES.filter(g => !g.soon).map(g => ({ key: 'wins.' + g.id, label: g.title, game: g.id })), { key: 'totalWins', label: 'Все игры' }];
  let cur = sessionStorage.getItem('lb-tab') || tabs[0].key;
  if (!tabs.some(t => t.key === cur)) cur = tabs[0].key;
  const drawTabs = () => {
    $('#lbTabs').innerHTML = tabs.map(t => `<button class="tab ${t.key === cur ? 'on' : ''}" data-k="${t.key}">${esc(t.label)}</button>`).join('');
    $('#lbTabs').querySelectorAll('.tab').forEach(b => b.onclick = () => { cur = b.dataset.k; sessionStorage.setItem('lb-tab', cur); drawTabs(); loadLb(); });
  };
  const get = (o, f) => f.split('.').reduce((a, k) => (a == null ? a : a[k]), o);
  async function loadLb() {
    const box = $('#lbList'); if (!box) return;
    box.innerHTML = '<p class="muted">Загрузка…</p>';
    try {
      const list = await stats.top(cur, 20);
      if (!$('#lbList')) return;
      const tab = tabs.find(t => t.key === cur);
      box.innerHTML = list.length ? list.map((s, i) => {
        const g = tab.game && s.games && s.games[tab.game];
        const extra = g ? `<small>${g.w || 0}–${g.l || 0}${g.d ? '–' + g.d : ''}</small>` : '';
        return `<div class="lb-row ${s.id === user.uid ? 'me' : ''}"><span class="rk">${['🥇', '🥈', '🥉'][i] || i + 1}</span><span class="ava xs">${avatarHTML(s)}</span>
          <span class="lb-name">${esc(s.name)}</span><span class="lb-w"><b>${get(s, cur) || 0}</b>${extra}</span></div>`;
      }).join('') : '<p class="muted">Пока ни одной победы. Станьте первым!</p>';
    } catch (e) { if ($('#lbList')) box.innerHTML = `<p class="muted">${esc(errMsg(e))}</p>`; }
    try {
      const s = await stats.mine(user);
      const el = $('#myStats'); if (!el) return;
      if (!s) { el.innerHTML = '<p class="muted small">Ваши победы появятся здесь после первой партии.</p>'; return; }
      const lines = GAMES.filter(g => !g.soon).map(g => {
        const o = (s.games || {})[g.id] || {}, solo = (s.solo || {})[g.id] || {};
        const sw = ['easy', 'normal', 'hard'].reduce((a, k) => a + ((solo[k] || {}).w || 0), 0);
        const w = o.w || 0, l = o.l || 0, d = o.d || 0;
        return `<div><b>${esc(g.title)}</b>: онлайн ${w} ${plural(w, 'победа', 'победы', 'побед')}, ${l} ${plural(l, 'поражение', 'поражения', 'поражений')}${d ? `, ${d} ${plural(d, 'ничья', 'ничьи', 'ничьих')}` : ''}${g.solo ? ` · енот повержен ${sw} ${plural(sw, 'раз', 'раза', 'раз')}` : ''}</div>`;
      }).join('');
      el.innerHTML = `<h3>Мои результаты</h3>${lines}`;
    } catch (e) {}
  }
  drawTabs(); loadLb();
  $('#lbReload').onclick = loadLb;
}

async function joinTable(id, myTable) {
  try {
    if (myTable && myTable.id !== id) {
      const playing = myTable.status === 'playing' && myTable.state && !myTable.state.over;
      if (!(await confirmBox('Пересесть?', `Вы уже сидите за другим столом.${playing ? ' Незаконченная партия там будет проиграна.' : ''}`, 'Пересесть'))) return;
      await leaveTable(myTable.id, true);
    }
    await ops.join(id, user);
    sessionStorage.setItem('hb-sent', String(Date.now()));
    location.hash = '#/t/' + id;
  } catch (e) { toast(errMsg(e)); }
}

async function leaveTable(id, silent) {
  const gameId = id.replace(/-\d+$/, '');
  const r = await ops.leave(id, user.uid);
  if (r.forfeit) { await stats.recordOnline(user, gameId, r.gid, 'l').catch(() => {}); if (!silent) toast('Засчитано поражение'); }
}

const modal = $('#modal');
async function showRules(gameId) {
  const g = gameById(gameId); const mod = await g.load();
  $('#modalBody').innerHTML = `<h2>${esc(g.title)}: правила</h2>${mod.rulesHTML || ''}`;
  modal.classList.add('show');
}
$('#modalClose').onclick = () => modal.classList.remove('show');
modal.addEventListener('click', e => { if (e.target === modal) modal.classList.remove('show'); });

/* ---------- Стол ---------- */
async function renderTable(id) {
  const gameId = id.replace(/-\d+$/, ''), n = id.split('-').pop();
  const g = gameById(gameId);
  if (!g || g.soon) { location.hash = '#/'; return; }
  main.innerHTML = `<div class="table-page"><div class="tp-head"><a class="btn ghost" href="#/">← Лобби</a>
    <h2>${g.icon} ${esc(g.title)} · Стол ${esc(n)}</h2><span class="sp"></span>
    <button class="btn ghost" id="rulesBtn">Правила</button><button class="btn" id="leaveBtn" hidden>Встать из-за стола</button></div>
    <div id="tpBody"><div class="panel center">Загрузка…</div></div><div id="tpFoot"></div></div>`;
  let alive = true;
  cleanup = () => { alive = false; };
  const mod = await g.load();
  if (!alive) return;
  $('#rulesBtn').onclick = () => showRules(gameId);

  let t = null, gameView = null, viewSeed = null, pending = false, mode = '', lastNote = '';
  const animated = new Set(JSON.parse(sessionStorage.getItem('coin-animated') || '[]'));
  const recorded = new Set(JSON.parse(sessionStorage.getItem('recorded') || '[]'));

  const unsub = backend.onDoc('tables/' + id, (data, meta) => {
    t = data;
    const i = seatOf(t, user.uid);
    const sent = Number(sessionStorage.getItem('hb-sent') || 0);
    if (meta && meta.hasPendingWrites === false && i >= 0 && sent && Date.now() - sent < 15000) {
      const ls = ms(t['p' + i].lastSeen);
      if (ls) { setSkew(ls - sent); sessionStorage.removeItem('hb-sent'); }
    }
    draw();
  }, e => toast(errMsg(e)));

  const beat = () => {
    if (!t || seatOf(t, user.uid) < 0) return;
    sessionStorage.setItem('hb-sent', String(Date.now()));
    ops.heartbeat(id, user.uid).catch(() => {});
  };
  const hb = setInterval(beat, HEARTBEAT_MS);
  const tick = setInterval(() => draw(true), 5000);
  const onVis = () => { if (document.visibilityState === 'visible') beat(); };
  document.addEventListener('visibilitychange', onVis);
  setTimeout(beat, 1500);
  cleanup = () => { alive = false; unsub(); clearInterval(hb); clearInterval(tick); document.removeEventListener('visibilitychange', onVis); };

  $('#leaveBtn').onclick = async () => {
    const playing = t && t.status === 'playing' && t.state && !t.state.over;
    if (playing && !(await confirmBox('Встать из-за стола?', 'Партия не закончена: если встать сейчас, засчитается поражение.', 'Встать'))) return;
    try { await leaveTable(id); location.hash = '#/'; } catch (e) { toast(errMsg(e)); }
  };

  function names() {
    const st = t.state;
    return [0, 1].map(k => (t['p' + k] && t['p' + k].name) || (st && st.names && st.names[k]) || 'Игрок');
  }

  function seatCard(k, extra = '') {
    const s = t['p' + k], ok = seatAlive(s), i = seatOf(t, user.uid);
    if (!ok) return `<div class="seat-card empty"><div class="ava lg">?</div><div><b>Свободно</b><small>ждём игрока</small></div>${extra}</div>`;
    const off = seatAge(s) > OFFLINE_MS;
    return `<div class="seat-card ${off ? 'offline' : ''}"><div class="ava lg">${avatarHTML(s)}</div><div><b>${esc(s.name)}</b><small>${k === i ? 'вы' : off ? 'не в сети…' : 'за столом'}</small></div>${extra}</div>`;
  }

  function draw(fromTick) {
    if (!alive) return;
    const body = $('#tpBody'), foot = $('#tpFoot');
    if (!body) return;
    if (!t) { body.innerHTML = '<div class="panel center">Стол ещё не создан. Вернитесь в лобби.</div>'; return; }
    const i = seatOf(t, user.uid), seated = i >= 0;
    $('#leaveBtn').hidden = !seated;

    // учёт результата
    const st = t.state;
    if (st && st.over && st.players && st.players.includes(user.uid) && !recorded.has(t.gid)) {
      recorded.add(t.gid); sessionStorage.setItem('recorded', JSON.stringify([...recorded].slice(-30)));
      const me = st.players.indexOf(user.uid);
      const res = st.winner === -1 ? 'd' : st.winner === me ? 'w' : 'l';
      stats.recordOnline(user, gameId, t.gid, res).catch(e => toast('Не удалось сохранить результат: ' + errMsg(e)));
    }

    if (t.status === 'waiting' || ((t.status === 'coin') && !(seatAlive(t.p0) && seatAlive(t.p1)) && !seated)) {
      if (fromTick && mode === 'waiting') { /* обновим карточки */ }
      mode = 'waiting'; gameView = null; viewSeed = null;
      const free = !seatAlive(t.p0) || !seatAlive(t.p1);
      body.innerHTML = `<div class="panel center"><div class="seat-pair">${seatCard(0)}<span class="vs">VS</span>${seatCard(1)}</div>
        <p>${seated ? 'Ждём соперника. Как только кто-то сядет, бросим монетку.' : free ? 'За этим столом есть свободное место.' : ''}</p>
        ${!seated && free ? '<button class="btn primary big" id="sitBtn">Сесть за стол</button>' : ''}</div>`;
      foot.innerHTML = '';
      const sb = $('#sitBtn');
      if (sb) sb.onclick = () => joinTable(id, tables.find(x => x.id !== id && seatOf(x, user.uid) >= 0));
      return;
    }

    if (t.status === 'coin') {
      mode = 'coin'; gameView = null; viewSeed = null;
      const c = t.coin || {};
      const my = seated ? c['c' + i] : null, opp = seated ? c['c' + (1 - i)] : null;
      const tag = k => (c['c' + k] ? `<span class="pick">${coinFace(c['c' + k])}${SIDE_NAME[c['c' + k]]}</span>` : '<span class="pick none">выбирает…</span>');
      const btns = seated ? `<div class="coin-pick">${['h', 't'].map(s => {
        const taken = opp === s, chosen = my === s, dis = !!my || taken;
        return `<button class="coin-btn ${chosen ? 'chosen' : ''} ${taken ? 'taken' : ''}" data-s="${s}" ${dis ? 'disabled' : ''}>${coinFace(s)}<span>${SIDE_NAME[s]}${taken ? '<small>выбрал соперник</small>' : chosen ? '<small>ваш выбор</small>' : ''}</span></button>`;
      }).join('')}</div>` : '';
      body.innerHTML = `<div class="panel center"><h3>Монетка решит, кто ходит первым</h3>
        <div class="seat-pair">${seatCard(0, tag(0))}<span class="vs">VS</span>${seatCard(1, tag(1))}</div>
        ${btns}<p class="muted">${seated ? (my ? 'Ждём выбор соперника…' : opp ? 'Соперник уже выбрал, вам остаётся другая сторона.' : 'Кто выбрал первым, тот и занял сторону.') : 'Игроки выбирают стороны монетки.'}</p></div>`;
      foot.innerHTML = '';
      body.querySelectorAll('.coin-btn').forEach(b => b.onclick = async () => {
        body.querySelectorAll('.coin-btn').forEach(x => x.disabled = true);
        try { await ops.pickCoin(id, user.uid, b.dataset.s, mod); } catch (e) { toast(errMsg(e)); draw(); }
      });
      return;
    }

    // playing / finished
    if (!st) { body.innerHTML = '<div class="panel center">Загрузка партии…</div>'; return; }
    if (mode !== 'game' || !gameView || viewSeed !== st.seed) {
      body.innerHTML = '<div id="gv"></div>';
      gameView = mod.mountOnline($('#gv'), { onMove: doMove });
      viewSeed = st.seed; mode = 'game'; lastNote = '';
    }
    const nm = names();
    const players = [0, 1].map(k => {
      const s = t['p' + k];
      return { name: nm[k], photo: (s && s.photo) || '', sub: k === i ? 'вы' : !s ? 'встал из-за стола' : seatAge(s) > OFFLINE_MS ? 'не в сети…' : 'соперник',
        offline: !s || seatAge(s) > OFFLINE_MS };
    });
    let turnText = '';
    if (st.over) {
      const why = st.reason === 'left' ? ' (соперник встал из-за стола)' : st.reason === 'timeout' ? ' (соперник пропал из сети)' : '';
      turnText = st.winner === -1 ? 'Ничья' : (st.winner === i ? 'Вы победили!' : `Победа: ${nm[st.winner]}`) + why;
    } else turnText = seated ? mod.turnText(st, i, nm) : `Ходит ${nm[st.cur]}`;
    gameView.update(st, players, { canAct: seated && !st.over && st.cur === i && !pending, turnText, toast });

    const key = st.moves + '|' + st.note;
    if (st.note && key !== lastNote && !fromTick) toast(mod.noteText(st.note, nm));
    lastNote = key;

    if (t.status === 'playing' && st.moves === 0 && !animated.has(t.gid) && t.coin && t.coin.result) {
      animated.add(t.gid); sessionStorage.setItem('coin-animated', JSON.stringify([...animated].slice(-30)));
      flipCoin(t.coin.result, `Первым ходит ${st.first === i ? 'вы' : nm[st.first]}`);
    }

    // низ страницы
    let f = '';
    if (t.status === 'finished' && st.over) {
      const res = st.winner === -1 ? 'd' : st.winner === i ? 'w' : seated ? 'l' : '';
      const oppAlive = seated && seatAlive(t['p' + (1 - i)]);
      const rm = t.rematch || {};
      f = `<div class="panel center result-panel"><div class="result ${res}">${res === 'w' ? '🏆 ' : res === 'd' ? '🤝 ' : ''}${esc(turnText)} · ${st.sc[0]}:${st.sc[1]}</div>`;
      if (seated && oppAlive) {
        const meR = rm['r' + i], opR = rm['r' + (1 - i)];
        f += `<button class="btn primary" id="rematchBtn" ${meR ? 'disabled' : ''}>${meR ? 'Ждём ответа соперника…' : opR ? 'Соперник хочет реванш — согласиться' : 'Реванш'}</button>`;
      } else if (seated) f += '<p class="muted">Соперник ушёл. Можно подождать нового игрока за этим столом.</p>';
      f += '</div>';
    } else if (t.status === 'playing' && seated) {
      const o = t['p' + (1 - i)];
      if (!o || seatAge(o) > STALE_MS) f = `<div class="panel center"><p>Соперник не в сети больше полутора минут.</p><button class="btn primary" id="claimBtn">Засчитать победу</button></div>`;
      else if (seatAge(o) > OFFLINE_MS) f = '<div class="panel center"><p class="muted">Соперник не в сети. Если он не вернётся в течение минуты, можно будет засчитать победу.</p></div>';
    }
    foot.innerHTML = f;
    const rb = $('#rematchBtn');
    if (rb) rb.onclick = () => ops.rematch(id, user.uid).catch(e => toast(errMsg(e)));
    const cb = $('#claimBtn');
    if (cb) cb.onclick = () => ops.claimTimeout(id, user.uid).catch(e => toast(errMsg(e)));
  }

  async function doMove(move) {
    if (pending) return;
    pending = true; draw(true);
    try { await ops.move(id, user.uid, move, mod); }
    catch (e) { toast(errMsg(e)); }
    finally { pending = false; draw(true); }
  }
}

/* ---------- Одиночная игра ---------- */
async function renderSolo(gameId) {
  const g = gameById(gameId);
  if (!g || !g.solo) { location.hash = '#/'; return; }
  main.innerHTML = `<div class="table-page"><div class="tp-head"><a class="btn ghost" href="#/">← Лобби</a>
    <h2>${g.icon} ${esc(g.title)} · ${esc(g.solo)}</h2><span class="sp"></span><button class="btn ghost" id="rulesBtn">Правила</button></div><div id="soloRoot"></div></div>`;
  $('#rulesBtn').onclick = () => showRules(gameId);
  const mod = await g.load();
  if (!$('#soloRoot')) return;
  cleanup = mod.mountSolo($('#soloRoot'), { user, recordSolo: (diff, res) => stats.recordSolo(user, gameId, diff, res) });
}

if (useMock) $('#mockBadge').hidden = false;
