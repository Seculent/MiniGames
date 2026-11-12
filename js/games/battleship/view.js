// Экран «Морского боя»: расстановка, два поля, автоответ на выстрелы, раскрытие и сверка в конце.
import { N, FLEET, COLS, cellName, shipCells, canPlace, randomFleet, validFleet, fleetHash, newSalt,
  answerShot, deadZone, verifySeat } from './logic.js';
import { esc, avatarHTML } from '../../ui.js';

const CSS = `
.bs{display:flex;flex-direction:column;gap:14px}
.bs-boards{display:grid;grid-template-columns:1fr 1fr;gap:16px;align-items:start}
.bs-panel{background:linear-gradient(180deg,var(--panel),var(--bg2));border:1px solid var(--stroke);border-radius:18px;padding:14px;transition:border-color .25s,box-shadow .25s}
.bs-panel.turn{border-color:var(--accent);box-shadow:0 0 0 2px rgba(242,179,61,.25)}
.bs-head{display:flex;align-items:center;gap:10px;margin-bottom:10px}
.bs-head .nm{font-weight:900}.bs-head small{display:block;color:var(--muted);font-weight:700}
.bs-head .cnt{margin-left:auto;font-family:VT323,monospace;font-size:30px;color:#7cf0b4}
.bs-grid{display:grid;grid-template-columns:22px repeat(10,1fr);grid-template-rows:22px repeat(10,1fr);gap:2px;user-select:none;touch-action:manipulation}
.bs-lab{display:grid;place-items:center;font-size:12px;font-weight:800;color:var(--muted)}
.bs-c{aspect-ratio:1/1;border-radius:4px;background:#1d5a73;border:1px solid #2a6f8b;position:relative;padding:0;cursor:default}
.bs-c.can{cursor:crosshair}.bs-c.can:hover{background:#2b7a99}
.bs-c.ship{background:#c9d3d8;border-color:#e9eef1}
.bs-c.miss::after{content:"";position:absolute;inset:38%;border-radius:50%;background:#9cc3d3}
.bs-c.dead{background:#174b60}.bs-c.dead::after{content:"";position:absolute;inset:42%;border-radius:50%;background:#5f8a9b}
.bs-c.hit{background:#c9d3d8}.bs-c.hit::before,.bs-c.hit::after,.bs-c.sunk::before,.bs-c.sunk::after{content:"";position:absolute;left:12%;right:12%;top:46%;height:12%;background:#e5533d;border-radius:2px;transform:rotate(45deg)}
.bs-c.hit::after,.bs-c.sunk::after{transform:rotate(-45deg)}
.bs-c.enemyhit{background:#f2b33d;border-color:#ffd27a}
.bs-c.sunk{background:#7a2b22;border-color:#a33}
.bs-c.pending{animation:bsPulse .8s ease-in-out infinite;background:#f2b33d}
@keyframes bsPulse{50%{opacity:.4}}
.bs-c.ghost{background:rgba(124,240,180,.7)}.bs-c.ghostbad{background:rgba(229,83,61,.7)}
.bs-c.sel{outline:2px solid var(--accent)}
.bs-c.last{box-shadow:0 0 0 2px #fff inset}
.bs-c.revealed{background:#6c7a80}
.bs-dock{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-top:12px}
.bs-ship{display:flex;gap:2px;padding:4px;border-radius:8px;border:1px solid var(--stroke);background:rgba(0,0,0,.15);cursor:pointer}
.bs-ship i{width:14px;height:14px;border-radius:3px;background:#c9d3d8;display:block}
.bs-ship.placed{opacity:.35}.bs-ship.cur{border-color:var(--accent);box-shadow:0 0 0 2px rgba(242,179,61,.3)}
.bs-tools{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}
.bs-status{text-align:center;font-weight:800;min-height:24px}
.bs-verify{text-align:center;font-size:14px;color:var(--muted)}
.bs-verify .ok{color:#7cf0b4}.bs-verify .bad{color:#ff8a7a}
@media (max-width:820px){.bs-boards{grid-template-columns:1fr}.bs-grid{grid-template-columns:18px repeat(10,1fr);grid-template-rows:18px repeat(10,1fr)}}
`;

function ensureCss() {
  if (document.getElementById('bs-css')) return;
  const st = document.createElement('style'); st.id = 'bs-css'; st.textContent = CSS; document.head.appendChild(st);
}

function makeGrid(el, onCell, onHover) {
  let html = '<div class="bs-lab"></div>';
  for (let k = 0; k < N; k++) html += `<div class="bs-lab">${COLS[k]}</div>`;
  for (let r = 0; r < N; r++) {
    html += `<div class="bs-lab">${r + 1}</div>`;
    for (let k = 0; k < N; k++) html += `<button class="bs-c" data-c="${r * N + k}" aria-label="${cellName(r * N + k)}"></button>`;
  }
  el.innerHTML = html;
  const cells = [...el.querySelectorAll('.bs-c')];
  cells.forEach((b, c) => {
    b.addEventListener('click', () => onCell && onCell(c));
    b.addEventListener('pointerenter', () => onHover && onHover(c));
  });
  el.addEventListener('pointerleave', () => onHover && onHover(-1));
  return cells;
}

export function mountOnline(root, { onMove, mySeat, gid, secret }) {
  ensureCss();
  const seated = mySeat === 0 || mySeat === 1;
  root.innerHTML = `<div class="bs">
    <div class="bs-status" id="bsStatus"></div>
    <div class="bs-boards">
      <section class="bs-panel" id="bsA"><div class="bs-head"><div class="ava"></div><div><div class="nm"></div><small></small></div><div class="cnt"></div></div><div class="bs-grid"></div><div class="bs-extra"></div></section>
      <section class="bs-panel" id="bsB"><div class="bs-head"><div class="ava"></div><div><div class="nm"></div><small></small></div><div class="cnt"></div></div><div class="bs-grid"></div><div class="bs-extra"></div></section>
    </div>
    <div class="bs-verify" id="bsVerify"></div>
  </div>`;
  // Поле A — «моё» (для зрителя — игрок 0), поле B — соперника (для зрителя — игрок 1)
  const meSeat = seated ? mySeat : 0, opSeat = 1 - meSeat;
  let st = null, fleet = null, fleetReady = false, draft = null, sel = 0, vertical = false, hoverA = -1;
  let toastFn = () => {}, busy = false, answeredKey = '', revealedKey = '', verifyKey = '';
  const draftKey = 'bs-draft-' + gid;

  const cellsA = makeGrid(root.querySelector('#bsA .bs-grid'), onCellA, c => { hoverA = c; paint(); });
  const cellsB = makeGrid(root.querySelector('#bsB .bs-grid'), onCellB, null);

  // Загрузка своей расстановки
  if (seated) {
    secret.load().then(d => {
      if (d && d.gid === gid && validFleet(d.ships)) { fleet = d.ships; fleetReady = true; }
      else {
        try { const x = JSON.parse(localStorage.getItem(draftKey) || 'null'); if (x && x.length === FLEET.length) draft = x; } catch (e) {}
        if (!draft) draft = randomFleet();
        sel = draft.findIndex(s => !s); if (sel < 0) sel = 0;
      }
      if (st) update(st, lastPlayers, lastOpts);
    }).catch(() => { draft = randomFleet(); if (st) update(st, lastPlayers, lastOpts); });
  }
  function saveDraft() { try { localStorage.setItem(draftKey, JSON.stringify(draft)); } catch (e) {} }

  const placing = () => seated && st && st.phase === 'place' && !st.over && !st.ready[mySeat] && draft;

  function onCellA(c) {
    if (!placing()) return;
    const at = draft.findIndex(s => s && s.cells.includes(c));
    if (at >= 0) {                                         // взять корабль с поля
      vertical = draft[at].cells.length > 1 && draft[at].cells[1] - draft[at].cells[0] === N;
      draft[at] = null; sel = at; saveDraft(); paint(); return;
    }
    if (sel < 0 || draft[sel]) return;
    const cells = shipCells(c, FLEET[sel], vertical);
    if (!canPlace(draft, cells, sel)) { toastFn('Сюда не встанет: корабли не должны касаться'); return; }
    draft[sel] = { cells }; saveDraft();
    sel = draft.findIndex(s => !s);
    paint(); renderExtra();
  }

  function onCellB(c) {
    if (!seated || !st || st.over || st.phase !== 'battle' || st.cur !== mySeat || st.pending || busy) return;
    const mine = st['shots' + mySeat];
    if (mine.some(x => x.c === c)) return;
    if (deadZone(mine).has(c)) { toastFn('Рядом с потопленным кораблём пусто'); return; }
    busy = true; paint();
    Promise.resolve(onMove({ t: 'shot', c })).catch(() => {}).finally(() => { busy = false; paint(); });
  }

  function renderExtra() {
    const ex = root.querySelector('#bsA .bs-extra');
    if (!placing()) { ex.innerHTML = ''; return; }
    const all = draft.every(Boolean);
    ex.innerHTML = `<div class="bs-dock">${FLEET.map((n, i) => `<button class="bs-ship ${draft[i] ? 'placed' : ''} ${i === sel && !draft[i] ? 'cur' : ''}" data-i="${i}" title="${n}-палубный">${'<i></i>'.repeat(n)}</button>`).join('')}</div>
      <div class="bs-tools"><button class="btn sm" data-a="rot">↻ Повернуть</button><button class="btn sm" data-a="rnd">🎲 Случайно</button>
      <button class="btn sm ghost" data-a="clr">Убрать все</button><button class="btn primary sm" data-a="go" ${all ? '' : 'disabled'}>Готов к бою</button></div>
      <p class="muted small">Выберите корабль и нажмите на клетку. Нажмите на поставленный корабль, чтобы переставить его. «R» — повернуть.</p>`;
    ex.querySelectorAll('.bs-ship').forEach(b => b.onclick = () => {
      const i = +b.dataset.i;
      if (draft[i]) { vertical = draft[i].cells.length > 1 && draft[i].cells[1] - draft[i].cells[0] === N; draft[i] = null; saveDraft(); }
      sel = i; paint(); renderExtra();
    });
    ex.querySelectorAll('[data-a]').forEach(b => b.onclick = async () => {
      const a = b.dataset.a;
      if (a === 'rot') vertical = !vertical;
      if (a === 'rnd') { draft = randomFleet(); sel = 0; saveDraft(); }
      if (a === 'clr') { draft = FLEET.map(() => null); sel = 0; saveDraft(); }
      if (a === 'go') await ready();
      paint(); renderExtra();
    });
  }
  const onKey = e => { if ((e.key === 'r' || e.key === 'R' || e.key === 'к' || e.key === 'К') && placing()) { vertical = !vertical; paint(); } };
  document.addEventListener('keydown', onKey);

  async function ready() {
    if (!draft.every(Boolean) || !validFleet(draft) || busy) return;
    busy = true;
    try {
      const salt = newSalt(), commit = await fleetHash(draft, salt);
      await secret.save({ gid, ships: draft, salt });
      fleet = draft; fleetReady = true;
      await onMove({ t: 'ready', commit });
    } catch (e) { toastFn('Не удалось сохранить расстановку'); }
    busy = false;
  }

  function paint() {
    if (!st) return;
    const shotsOnA = st['shots' + opSeat], shotsOnB = st['shots' + meSeat];
    // поле A
    const showFleetA = seated ? (placing() ? draft : fleet) : (st['reveal' + meSeat] && st['reveal' + meSeat].ships);
    const shipSetA = new Set(); (showFleetA || []).forEach(s => s && s.cells.forEach(c => shipSetA.add(c)));
    const mapA = new Map(shotsOnA.map(x => [x.c, x]));
    const sunkA = new Set(); shotsOnA.forEach(x => x.r === 's' && x.sk && x.sk.forEach(c => sunkA.add(c)));
    const deadA = deadZone(shotsOnA);
    let ghost = new Set(), ghostOk = false;
    if (placing() && hoverA >= 0 && sel >= 0 && !draft[sel]) {
      const cells = shipCells(hoverA, FLEET[sel], vertical);
      ghostOk = canPlace(draft, cells, sel);
      (cells || [hoverA]).forEach(c => ghost.add(c));
    }
    const lastOnA = shotsOnA.length ? shotsOnA[shotsOnA.length - 1].c : -1;
    cellsA.forEach((b, c) => {
      const s = mapA.get(c);
      let cls = 'bs-c';
      if (shipSetA.has(c)) cls += seated ? ' ship' : ' revealed';
      if (sunkA.has(c)) cls += ' sunk';
      else if (s && s.r === 'h') cls += ' hit enemyhit';
      else if (s && s.r === 'm') cls += ' miss';
      else if (deadA.has(c)) cls += ' dead';
      if (st.pending && st.pending.seat === opSeat && st.pending.c === c) cls += ' pending';
      if (c === lastOnA) cls += ' last';
      if (ghost.has(c)) cls += ghostOk ? ' ghost' : ' ghostbad';
      if (placing()) cls += ' can';
      b.className = cls;
    });
    // поле B
    const mapB = new Map(shotsOnB.map(x => [x.c, x]));
    const sunkB = new Set(); shotsOnB.forEach(x => x.r === 's' && x.sk && x.sk.forEach(c => sunkB.add(c)));
    const deadB = deadZone(shotsOnB);
    const rv = st['reveal' + opSeat];
    const revB = new Set(); if (rv && st.over) rv.ships.forEach(s => s.cells.forEach(c => revB.add(c)));
    const canShoot = seated && !st.over && st.phase === 'battle' && st.cur === mySeat && !st.pending && !busy;
    const lastOnB = shotsOnB.length ? shotsOnB[shotsOnB.length - 1].c : -1;
    cellsB.forEach((b, c) => {
      const s = mapB.get(c);
      let cls = 'bs-c';
      if (revB.has(c) && !s) cls += ' revealed';
      if (sunkB.has(c)) cls += ' sunk';
      else if (s && s.r === 'h') cls += ' hit';
      else if (s && s.r === 'm') cls += ' miss';
      else if (deadB.has(c)) cls += ' dead';
      if (st.pending && st.pending.seat === meSeat && st.pending.c === c) cls += ' pending';
      if (c === lastOnB) cls += ' last';
      if (canShoot && !s && !deadB.has(c)) cls += ' can';
      b.className = cls;
    });
  }

  let lastPlayers = [], lastOpts = {};
  function update(state, players, opts = {}) {
    st = state; lastPlayers = players; lastOpts = opts; toastFn = opts.toast || toastFn;
    const heads = [[root.querySelector('#bsA'), meSeat], [root.querySelector('#bsB'), opSeat]];
    heads.forEach(([el, seat], idx) => {
      const p = players[seat] || {};
      el.querySelector('.ava').innerHTML = avatarHTML(p);
      el.querySelector('.nm').textContent = seated ? (idx === 0 ? 'Ваш флот' : 'Флот соперника') : (p.name || '—');
      el.querySelector('small').textContent = seated ? (p.name || '') + (p.offline && idx === 1 ? ' · не в сети' : '') : (p.sub || '');
      const sunkOnIt = st.sc[1 - seat];
      el.querySelector('.cnt').textContent = `${FLEET.length - sunkOnIt}/${FLEET.length}`;
      el.querySelector('.cnt').title = 'Кораблей на плаву';
      // подсвечиваем поле, по которому сейчас стреляют
      el.classList.toggle('turn', st.phase === 'battle' && !st.over && st.cur !== seat);
    });
    root.querySelector('#bsStatus').textContent = statusText();
    renderExtra(); paint();
    autoAnswer(); autoReveal(); verify();
  }

  function statusText() {
    const nm = k => (lastPlayers[k] && lastPlayers[k].name) || 'Игрок';
    if (st.over) return lastOpts.turnText || 'Бой окончен';
    if (st.phase === 'place') {
      if (!seated) return 'Игроки расставляют корабли…';
      if (st.ready[mySeat]) return st.ready[1 - mySeat] ? '' : 'Вы готовы. Ждём, пока соперник расставит корабли…';
      return st.ready[1 - mySeat] ? 'Соперник уже готов. Расставьте корабли и нажмите «Готов к бою»' : 'Расставьте корабли и нажмите «Готов к бою»';
    }
    if (st.pending) return st.pending.seat === mySeat ? `Выстрел по ${cellName(st.pending.c)}… ждём ответа` : `${seated ? 'Соперник стреляет' : nm(st.pending.seat) + ' стреляет'} по ${cellName(st.pending.c)}…`;
    if (!seated) return `Стреляет ${nm(st.cur)}`;
    return st.cur === mySeat ? 'Ваш выстрел: выберите клетку на поле соперника' : 'Стреляет соперник…';
  }

  // Защищающийся отвечает на выстрел по своей расстановке
  function autoAnswer() {
    if (!seated || !fleetReady || !st.pending || st.over || st.pending.seat !== 1 - mySeat) return;
    const key = gid + ':' + st.moves + ':' + st.pending.c;
    if (answeredKey === key) return;
    answeredKey = key;
    const ans = answerShot(fleet, st['shots' + (1 - mySeat)], st.pending.c);
    Promise.resolve(onMove({ t: 'answer', c: st.pending.c, ...ans }, { quiet: true })).catch(() => { answeredKey = ''; });
  }
  function autoReveal() {
    if (!seated || !fleetReady || !st.over || st['reveal' + mySeat] || !st.commit[mySeat]) return;
    if (revealedKey === gid) return;
    revealedKey = gid;
    secret.load().then(d => {
      if (d && d.gid === gid) return onMove({ t: 'reveal', ships: d.ships, salt: d.salt }, { quiet: true });
    }).catch(() => { revealedKey = ''; });
  }
  function verify() {
    const el = root.querySelector('#bsVerify');
    if (!st.over) { el.innerHTML = ''; return; }
    const key = gid + ':' + !!st.reveal0 + ':' + !!st.reveal1;
    if (verifyKey === key) return;
    verifyKey = key;
    Promise.all([verifySeat(st, 0), verifySeat(st, 1)]).then(res => {
      const nm = k => (lastPlayers[k] && lastPlayers[k].name) || 'Игрок';
      el.innerHTML = res.map((r, k) => r === 'ok' ? `<span class="ok">✓ ${esc(nm(k))}: расстановка честная</span>`
        : r === 'bad' ? `<span class="bad">⚠ ${esc(nm(k))}: ответы не совпали с расстановкой</span>`
        : st.commit[k] ? `<span>${esc(nm(k))}: расстановка ещё не раскрыта</span>` : '').filter(Boolean).join(' · ');
    });
  }

  return { update, destroy() { document.removeEventListener('keydown', onKey); } };
}
