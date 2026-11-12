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
.bs-grid{display:grid;grid-template-columns:22px repeat(10,minmax(0,1fr));grid-template-rows:22px repeat(10,auto);gap:2px;user-select:none;touch-action:manipulation}
.bs-lab{display:grid;place-items:center;font-size:12px;font-weight:800;color:var(--muted)}
.bs-grid{position:relative}
.bs-c{aspect-ratio:1/1;border-radius:4px;position:relative;padding:0;cursor:default;z-index:1;border:1px solid rgba(255,255,255,.14);
  background:radial-gradient(circle at 30% 25%,rgba(255,255,255,.22),transparent 60%),linear-gradient(160deg,#3fa6d4,#2579a6)}
.bs-c.can{cursor:crosshair}
.bs-c.can:hover{background:linear-gradient(160deg,#6fd0f5,#3f9bc8);box-shadow:inset 0 0 0 2px #fff}
.bs-c.miss,.bs-c.dead{background:#0d2c3a;border-color:rgba(255,255,255,.05)}
.bs-c.miss::after{content:"";position:absolute;inset:34%;border-radius:50%;background:#9fd3e8;box-shadow:0 0 0 3px rgba(159,211,232,.18)}
.bs-c.dead::after{content:"";position:absolute;inset:43%;border-radius:50%;background:#3f6878}
.bs-c.hit,.bs-c.sunk{z-index:3;background:radial-gradient(circle,rgba(255,150,40,.75) 0,rgba(229,83,61,.35) 45%,transparent 70%),#0d2c3a;border-color:rgba(255,120,60,.5)}
.bs-c.onship{background:radial-gradient(circle,rgba(255,150,40,.7) 0,rgba(229,83,61,.3) 45%,transparent 70%);border-color:transparent}
.bs-c.hit::before,.bs-c.hit::after,.bs-c.sunk::before,.bs-c.sunk::after{content:"";position:absolute;left:14%;right:14%;top:45%;height:11%;background:#ff4a2e;border-radius:3px;transform:rotate(45deg);box-shadow:0 0 6px rgba(255,90,40,.9)}
.bs-c.hit::after,.bs-c.sunk::after{transform:rotate(-45deg)}
.bs-c.sunk::before,.bs-c.sunk::after{background:#ffb199;box-shadow:none;opacity:.8}
.bs-c.pending{z-index:3;animation:bsPulse .8s ease-in-out infinite;background:#f2b33d}
@keyframes bsPulse{50%{opacity:.35}}
.bs-c.ghost{z-index:3;background:rgba(124,240,180,.55)}.bs-c.ghostbad{z-index:3;background:rgba(229,83,61,.6)}
.bs-c.last{box-shadow:0 0 0 2px #fff inset}
.bs-shipm{z-index:2;pointer-events:none;min-width:0;min-height:0;overflow:hidden;filter:drop-shadow(0 3px 2px rgba(0,0,0,.45));margin:1px}
.bs-shipm svg{width:100%;height:100%;display:block}
.bs-shipm.wreck{filter:grayscale(.7) brightness(.55) sepia(.6) hue-rotate(-25deg) drop-shadow(0 2px 2px rgba(0,0,0,.5))}
.bs-shipm.ghosted{opacity:.5}
.bs-dock{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-top:12px}
.bs-ship{display:flex;gap:2px;padding:4px;border-radius:8px;border:1px solid var(--stroke);background:rgba(0,0,0,.15);cursor:pointer}
.bs-ship{padding:4px 6px}.bs-ship svg{height:16px;display:block}
.bs-ship.placed{opacity:.35}.bs-ship.cur{border-color:var(--accent);box-shadow:0 0 0 2px rgba(242,179,61,.3)}
.bs-tools{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}
.bs-status{text-align:center;font-weight:800;min-height:24px}
.bs-verify{text-align:center;font-size:14px;color:var(--muted)}
.bs-verify .ok{color:#7cf0b4}.bs-verify .bad{color:#ff8a7a}
@media (max-width:820px){.bs-boards{grid-template-columns:1fr}.bs-grid{grid-template-columns:18px repeat(10,minmax(0,1fr));grid-template-rows:18px repeat(10,auto)}}
`;

function ensureCss() {
  if (document.getElementById('bs-css')) return;
  const st = document.createElement('style'); st.id = 'bs-css'; st.textContent = CSS; document.head.appendChild(st);
}

// Модель корабля: нос справа (по горизонтали) или снизу (по вертикали)
export function shipSVG(size, vertical) {
  const L = size * 100;
  let g = '';
  if (size === 1) {
    g += `<path d="M14 30 H60 C82 32 94 44 94 50 C94 56 82 68 60 70 H14 Q8 70 8 64 V36 Q8 30 14 30Z" fill="#8a98a2" stroke="#3a464e" stroke-width="3"/>`;
    g += `<path d="M18 38 H58 C74 40 82 46 82 50 C82 54 74 60 58 62 H18Z" fill="#b4c1c9"/>`;
    g += `<rect x="28" y="43" width="22" height="14" rx="3" fill="#56646d"/><rect x="31" y="46" width="5" height="4" fill="#d6ecff"/><rect x="40" y="46" width="5" height="4" fill="#d6ecff"/>`;
  } else {
    g += `<path d="M10 24 H${L - 42} C${L - 14} 26 ${L - 4} 42 ${L - 4} 50 C${L - 4} 58 ${L - 14} 74 ${L - 42} 76 H10 Q4 76 4 68 V32 Q4 24 10 24Z" fill="#7f8d97" stroke="#38444c" stroke-width="3"/>`;
    g += `<path d="M16 33 H${L - 44} C${L - 24} 35 ${L - 16} 44 ${L - 16} 50 C${L - 16} 56 ${L - 24} 65 ${L - 44} 67 H16Z" fill="#a9b6bf"/>`;
    g += `<path d="M18 50 H${L - 30}" stroke="#93a1aa" stroke-width="2" stroke-dasharray="6 6"/>`;
    const bx = Math.round(L * (size === 2 ? 0.22 : 0.34)), bw = size === 2 ? 50 : 64;
    g += `<rect x="${bx}" y="37" width="${bw}" height="26" rx="4" fill="#56646d" stroke="#38444c" stroke-width="2"/>`;
    for (let w = 0; w < (size === 2 ? 3 : 4); w++) g += `<rect x="${bx + 8 + w * 13}" y="44" width="7" height="5" rx="1" fill="#d6ecff"/>`;
    if (size >= 3) g += `<ellipse cx="${bx + bw + 16}" cy="50" rx="9" ry="7" fill="#45525a" stroke="#2d373e" stroke-width="2"/><ellipse cx="${bx + bw + 16}" cy="50" rx="4" ry="3" fill="#20292f"/>`;
    const turret = (x, dir) => `<rect x="${dir > 0 ? x : x - 26}" y="47" width="26" height="6" rx="2" fill="#2d373e"/><circle cx="${x}" cy="50" r="10" fill="#45525a" stroke="#2d373e" stroke-width="2"/>`;
    g += turret(L - 62, 1);
    if (size >= 3) g += turret(36, -1);
    if (size >= 4) g += turret(Math.round(L * 0.66), 1);
    if (size === 2) g += `<line x1="${bx + bw + 14}" y1="36" x2="${bx + bw + 14}" y2="64" stroke="#38444c" stroke-width="3"/>`;
  }
  const vb = vertical ? `0 0 100 ${L}` : `0 0 ${L} 100`;
  const body = vertical ? `<g transform="translate(100 0) rotate(90)">${g}</g>` : g;
  return `<svg viewBox="${vb}" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">${body}</svg>`;
}

const isVertical = cells => cells.length > 1 && cells[1] - cells[0] === N;

// Рисует модели кораблей поверх сетки. ships: [{cells, cls}]
function drawShips(grid, ships) {
  const key = JSON.stringify(ships.map(s => [s.cells, s.cls]));
  if (grid._shipKey === key) return;
  grid._shipKey = key;
  grid.querySelectorAll('.bs-shipm').forEach(x => x.remove());
  for (const s of ships) {
    const cells = s.cells.slice().sort((a, b) => a - b), v = isVertical(cells);
    const r = Math.floor(cells[0] / N), k = cells[0] % N, n = cells.length;
    const el = document.createElement('div');
    el.className = 'bs-shipm ' + (s.cls || '');
    el.style.gridColumn = v ? `${k + 2}` : `${k + 2} / span ${n}`;
    el.style.gridRow = v ? `${r + 2} / span ${n}` : `${r + 2}`;
    el.innerHTML = shipSVG(n, v);
    grid.appendChild(el);
  }
}

function makeGrid(el, onCell, onHover) {
  // у каждой клетки явное место в сетке, чтобы модели кораблей могли лежать поверх
  const at = (row, col) => `style="grid-row:${row};grid-column:${col}"`;
  let html = `<div class="bs-lab" ${at(1, 1)}></div>`;
  for (let k = 0; k < N; k++) html += `<div class="bs-lab" ${at(1, k + 2)}>${COLS[k]}</div>`;
  for (let r = 0; r < N; r++) {
    html += `<div class="bs-lab" ${at(r + 2, 1)}>${r + 1}</div>`;
    for (let k = 0; k < N; k++) html += `<button class="bs-c" data-c="${r * N + k}" aria-label="${cellName(r * N + k)}" ${at(r + 2, k + 2)}></button>`;
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

  const gridA = root.querySelector('#bsA .bs-grid'), gridB = root.querySelector('#bsB .bs-grid');
  const cellsA = makeGrid(gridA, onCellA, c => { hoverA = c; paint(); });
  const cellsB = makeGrid(gridB, onCellB, null);

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
    ex.innerHTML = `<div class="bs-dock">${FLEET.map((n, i) => `<button class="bs-ship ${draft[i] ? 'placed' : ''} ${i === sel && !draft[i] ? 'cur' : ''}" data-i="${i}" title="${n}-палубный"><span style="display:block;width:${n * 18}px">${shipSVG(n, false)}</span></button>`).join('')}</div>
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
      try { localStorage.removeItem(draftKey); } catch (e) {}
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
      if (sunkA.has(c)) cls += ' sunk';
      else if (s && s.r === 'h') cls += ' hit';
      else if (s && s.r === 'm') cls += ' miss';
      else if (deadA.has(c)) cls += ' dead';
      if (st.pending && st.pending.seat === opSeat && st.pending.c === c) cls += ' pending';
      if (c === lastOnA) cls += ' last';
      if (ghost.has(c)) cls += ghostOk ? ' ghost' : ' ghostbad';
      if (shipSetA.has(c) && (s || sunkA.has(c))) cls += ' onship';
      if (placing()) cls += ' can';
      b.className = cls;
    });
    drawShips(gridA, (showFleetA || []).filter(Boolean).map(sh => ({ cells: sh.cells, cls: sh.cells.every(c => sunkA.has(c)) ? 'wreck' : '' })));
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
      if (sunkB.has(c)) cls += ' sunk onship';
      else if (s && s.r === 'h') cls += ' hit';
      else if (s && s.r === 'm') cls += ' miss';
      else if (deadB.has(c)) cls += ' dead';
      if (st.pending && st.pending.seat === meSeat && st.pending.c === c) cls += ' pending';
      if (c === lastOnB) cls += ' last';
      if (s && s.r === 'h' && revB.has(c)) cls += ' onship';
      if (canShoot && !s && !deadB.has(c)) cls += ' can';
      b.className = cls;
    });
    const shipsB = shotsOnB.filter(x => x.r === 's' && x.sk).map(x => ({ cells: x.sk, cls: 'wreck' }));
    if (rv && st.over) for (const sh of rv.ships) if (!sh.cells.every(c => sunkB.has(c))) shipsB.push({ cells: sh.cells, cls: 'ghosted' });
    drawShips(gridB, shipsB);
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
