// Модуль «Морского боя» для лобби: онлайн и игра против енота.
import { newState, applyMove as apply, randomFleet, fleetHash, newSalt, answerShot, botShot } from './logic.js';
import { mountOnline as mount } from './view.js';
import { flipCoin, coinFace, SIDE_NAME } from '../../coin.js';
import { toast } from '../../ui.js';

export const id = 'battleship';
export const rulesHTML = `
<ul>
  <li>Поле 10×10. Флот: один 4-палубный, два 3-палубных, три 2-палубных и четыре 1-палубных корабля.</li>
  <li>Корабли ставятся по прямой и не касаются друг друга даже углами.</li>
  <li>Кто стреляет первым, решает монетка. Попал — стреляешь ещё, промахнулся — ход соперника.</li>
  <li>Клетки вокруг потопленного корабля отмечаются сами: там кораблей быть не может.</li>
  <li>Побеждает тот, кто первым потопит весь флот соперника.</li>
</ul>
<p class="muted">Честность: ваша расстановка хранится только у вас, соперник её не видит. В начале боя публикуется её отпечаток,
а после боя расстановки раскрываются и сверяются с ответами на выстрелы.</p>`;

export function newOnlineState(players, first) { return newState(first, players); }
export function applyMove(state, seat, move) { return apply(state, seat, move); }
export function postGameMove(move) { return move && move.t === 'reveal'; }
export function turnText() { return ''; }
export function noteText() { return ''; }
export function mountOnline(root, ctx) { return mount(root, ctx); }

// ---------- Против енота ----------
const DIFF = { easy: 'лёгкий', normal: 'средний', hard: 'сложный' };

export function mountSolo(root, { user, recordSolo }) {
  root.innerHTML = `
    <div class="solo-bar">
      <label>Сложность <select class="sel" id="soloDiff"><option value="easy">Лёгкий</option><option value="normal" selected>Средний</option><option value="hard">Сложный</option></select></label>
      <button class="btn primary" id="soloNew">Новая партия</button>
    </div>
    <div id="soloStart" class="panel center"></div>
    <div id="soloGame"></div>
    <div id="soloEnd"></div>`;
  const $ = s => root.querySelector(s);
  let diff = 'normal';
  try { diff = localStorage.getItem('solo-diff-bs') || 'normal'; } catch (e) {}
  $('#soloDiff').value = diff;

  let game = null; // текущая партия
  function stop() { if (game) { game.alive = false; clearTimeout(game.timer); if (game.view && game.view.destroy) game.view.destroy(); } game = null; }

  function start() {
    stop();
    diff = $('#soloDiff').value;
    try { localStorage.setItem('solo-diff-bs', diff); } catch (e) {}
    $('#soloGame').innerHTML = ''; $('#soloEnd').innerHTML = '';
    $('#soloStart').innerHTML = `<h3>Кто стреляет первым? Выберите сторону монетки</h3>
      <div class="coin-pick">${['h', 't'].map(s => `<button class="coin-btn" data-s="${s}">${coinFace(s)}<span>${SIDE_NAME[s]}</span></button>`).join('')}</div>
      <p class="muted">Енот возьмёт оставшуюся сторону.</p>`;
    $('#soloStart').querySelectorAll('.coin-btn').forEach(b => b.onclick = async () => {
      const mine = b.dataset.s, result = Math.random() < 0.5 ? 'h' : 't', first = result === mine ? 0 : 1;
      $('#soloStart').innerHTML = '';
      const g = { alive: true, timer: null, recorded: false, diff };
      game = g;
      await flipCoin(result, first === 0 ? 'Вы стреляете первым' : 'Первым стреляет енот');
      if (!g.alive) return;
      await begin(g, first);
    });
  }

  async function begin(g, first) {
    g.gid = 'solo-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    g.botFleet = randomFleet(); g.botSalt = newSalt();
    g.st = newState(first, [user.uid, 'raccoon']);
    g.st = apply(g.st, 1, { t: 'ready', commit: await fleetHash(g.botFleet, g.botSalt) });
    let mySecret = null;
    const secret = { load: async () => mySecret, save: async d => { mySecret = d; } };
    g.view = mount($('#soloGame'), { onMove: m => act(g, 0, m), mySeat: 0, gid: g.gid, secret });
    render(g);
  }

  // Ход применяется асинхронно, чтобы не перерисовывать экран изнутри его же обновления
  function act(g, seat, m) {
    return new Promise((resolve, reject) => setTimeout(() => {
      if (!g.alive) return reject(new Error('stop'));
      try { g.st = apply(g.st, seat, m); }
      catch (e) { if (seat === 0 && m.t !== 'answer' && m.t !== 'reveal') toast(e.message); return reject(e); }
      render(g); resolve();
    }, 0));
  }

  function render(g) {
    if (!g.alive) return;
    const st = g.st;
    const players = [{ name: user.name, photo: user.photo, sub: 'вы' }, { name: 'Енот Тоша', emoji: '🦝', sub: 'соперник · ' + DIFF[g.diff] }];
    const turnText = st.over ? (st.winner === 0 ? 'Вы победили!' : 'Енот победил') : '';
    g.view.update(st, players, { toast, turnText });
    clearTimeout(g.timer);
    if (st.over) {
      if (!st.reveal1) { act(g, 1, { t: 'reveal', ships: g.botFleet, salt: g.botSalt }); return; }
      if (!g.recorded) {
        g.recorded = true;
        const res = st.winner === 0 ? 'w' : 'l';
        recordSolo(g.diff, res).catch(() => toast('Не удалось сохранить результат'));
        $('#soloEnd').innerHTML = `<div class="panel center result-panel"><div class="result ${res}">${res === 'w' ? '🏆 Победа' : '🦝 Енот выиграл'} · потоплено ${st.sc[0]}:${st.sc[1]}</div>
          <button class="btn primary" id="soloAgain">Ещё партию</button></div>`;
        $('#soloAgain').onclick = start;
      }
      return;
    }
    if (st.phase !== 'battle') return;
    // енот отвечает на ваш выстрел
    if (st.pending && st.pending.seat === 0) {
      g.timer = setTimeout(() => {
        const c = g.st.pending && g.st.pending.c;
        if (c == null) return;
        act(g, 1, { t: 'answer', c, ...answerShot(g.botFleet, g.st.shots0, c) }).catch(() => {});
      }, 350);
      return;
    }
    // енот стреляет (на его выстрел отвечает ваш экран сам)
    if (!st.pending && st.cur === 1) {
      g.timer = setTimeout(() => {
        const c = botShot(g.st.shots1, g.diff);
        if (c >= 0) act(g, 1, { t: 'shot', c }).catch(() => {});
      }, 750);
    }
  }

  $('#soloNew').onclick = start;
  start();
  return () => stop();
}
