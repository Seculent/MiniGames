// Экран партии «Цветных квадратов»: две панели игроков и доска.
// Используется и в онлайне, и в игре против енота.
import { W, H, COLORS, CNAME_INS, getBoard, legal } from './logic.js';
import { esc, avatarHTML } from '../../ui.js';

const S = 30, EMPTY = '#b9d8c6';

export function mountGame(root, { onCell }) {
  root.innerHTML = `
  <div class="cs-game">
    <section class="cs-side p0"><div class="cs-who"><div class="cs-ava"></div><div><div class="cs-nm"></div><div class="cs-sub"></div></div></div>
      <div class="cs-sw"><div class="sw" style="background:${COLORS[0]}"></div><div class="sw" style="background:${COLORS[1]}"></div></div>
      <div class="cs-score">000</div></section>
    <section class="cs-boardcol"><div class="cs-boardbox"><svg class="cs-board" xmlns="http://www.w3.org/2000/svg"></svg>
      <div class="cs-turn"></div></div></section>
    <section class="cs-side p1"><div class="cs-who"><div class="cs-ava"></div><div><div class="cs-nm"></div><div class="cs-sub"></div></div></div>
      <div class="cs-sw"><div class="sw" style="background:${COLORS[2]}"></div><div class="sw" style="background:${COLORS[3]}"></div></div>
      <div class="cs-score">000</div></section>
  </div>`;
  const q = sel => root.querySelector(sel);
  const sides = [q('.cs-side.p0'), q('.cs-side.p1')];
  const svg = q('.cs-board');
  const sw = [...root.querySelectorAll('.sw')];
  let B = null, regEls = [], hover = -1, st = null, canAct = false;

  function draw(seed) {
    B = getBoard(seed);
    const P = 3;
    svg.setAttribute('viewBox', `${-P} ${-P} ${W * S + 2 * P} ${H * S + 2 * P}`);
    let html = '';
    for (let r = 0; r < B.n; r++) {
      html += `<g class="reg" fill="${EMPTY}" shape-rendering="crispEdges">`;
      for (const i of B.cells[r]) html += `<rect x="${(i % W) * S}" y="${((i / W) | 0) * S}" width="${S + .6}" height="${S + .6}"/>`;
      html += '</g>';
    }
    let d = '';
    for (let i = 0; i < W * H; i++) {
      const x = (i % W) * S, y = ((i / W) | 0) * S, o = B.own[i], cx = i % W, cy = (i / W) | 0;
      if (cx === W - 1 || B.own[i + 1] !== o) d += `M${x + S} ${y}v${S}`;
      if (cy === H - 1 || B.own[i + W] !== o) d += `M${x} ${y + S}h${S}`;
      if (cx === 0) d += `M${x} ${y}v${S}`;
      if (cy === 0) d += `M${x} ${y}h${S}`;
    }
    html += `<path d="${d}" stroke="#fff" stroke-opacity=".35" stroke-width="5" stroke-linecap="round" fill="none" pointer-events="none" transform="translate(.8 .8)"/>`;
    html += `<path d="${d}" stroke="#27443b" stroke-width="3.2" stroke-linecap="round" fill="none" pointer-events="none"/>`;
    html += `<path class="lastmark" d="" stroke="#fff" stroke-width="3" fill="none" stroke-dasharray="6 5" pointer-events="none"/>`;
    svg.innerHTML = html;
    regEls = [...svg.querySelectorAll('.reg')];
    regEls.forEach((g, r) => {
      g.addEventListener('pointerenter', () => { hover = r; paint(); });
      g.addEventListener('pointerleave', () => { if (hover === r) { hover = -1; paint(); } });
      g.addEventListener('click', () => {
        if (!st || st.over || !canAct) return;
        if (legal(B, st.fill, r, st.active)) { hover = -1; onCell(r); }
        else if (st.fill[r] === -1) toastLocal(`Сюда ${CNAME_INS[st.active]} нельзя: рядом уже есть такой же цвет`);
      });
    });
  }

  function lastOutline(r) {
    if (r == null || r < 0) return '';
    const own = B.own; let d = '';
    for (const i of B.cells[r]) {
      const x = (i % W) * S, y = ((i / W) | 0) * S, cx = i % W, cy = (i / W) | 0;
      if (cx === W - 1 || own[i + 1] !== r) d += `M${x + S - 3} ${y + 3}v${S - 6}`;
      if (cy === H - 1 || own[i + W] !== r) d += `M${x + 3} ${y + S - 3}h${S - 6}`;
      if (cx === 0 || own[i - 1] !== r) d += `M${x + 3} ${y + 3}v${S - 6}`;
      if (cy === 0 || own[i - W] !== r) d += `M${x + 3} ${y + 3}h${S - 6}`;
    }
    return d;
  }

  function paint() {
    if (!st) return;
    regEls.forEach((g, r) => {
      const f = st.fill[r];
      g.classList.remove('bad', 'wait');
      if (f >= 0) { g.setAttribute('fill', COLORS[f]); g.removeAttribute('fill-opacity'); g.classList.add('wait'); return; }
      const ok = !st.over && legal(B, st.fill, r, st.active);
      if (canAct && r === hover && ok) { g.setAttribute('fill', COLORS[st.active]); g.setAttribute('fill-opacity', '.55'); }
      else { g.setAttribute('fill', EMPTY); g.removeAttribute('fill-opacity'); }
      if (!canAct) g.classList.add('wait'); else if (!ok) g.classList.add('bad');
    });
    svg.querySelector('.lastmark').setAttribute('d', lastOutline(st.last ? st.last.r : -1));
  }

  let toastFn = null;
  function toastLocal(m) { if (toastFn) toastFn(m); }

  // players: [{name, photo|emoji, sub}], opts: {canAct, turnText, toast}
  function update(state, players, opts = {}) {
    if (!B || B.seed !== state.seed) { hover = -1; draw(state.seed); }
    st = state; canAct = !!opts.canAct; toastFn = opts.toast || null;
    players.forEach((p, i) => {
      const side = sides[i];
      side.querySelector('.cs-ava').innerHTML = avatarHTML(p);
      side.querySelector('.cs-nm').textContent = p.name || '—';
      side.querySelector('.cs-sub').textContent = p.sub || '';
      side.querySelector('.cs-score').textContent = String(state.sc[i]).padStart(3, '0');
      side.classList.toggle('turn', !state.over && state.cur === i);
      side.classList.toggle('offline', !!p.offline);
    });
    sw.forEach((el, c) => el.classList.toggle('on', !state.over && state.active === c));
    const tb = q('.cs-turn');
    tb.innerHTML = state.over ? esc(opts.turnText || 'Партия окончена')
      : `<span class="chip" style="background:${COLORS[state.active]}"></span>${esc(opts.turnText || '')}`;
    paint();
  }

  return { update };
}
