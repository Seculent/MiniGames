// Модуль игры для лобби: онлайн-состояние, ход и экран против енота.
import { newState, applyMove as apply, aiPick, CNAME_INS } from './logic.js';
import { mountGame } from './view.js';
import { flipCoin, coinFace, SIDE_NAME } from '../../coin.js';
import { esc, toast } from '../../ui.js';

export const id = 'colorSquares';
export const rulesHTML = `
<ul>
  <li>Поле разбито на области разной формы. За ход закрашиваешь одну пустую область.</li>
  <li>У каждого два цвета, и они чередуются сами: подсвеченный квадрат на панели показывает, каким цветом ты ходишь сейчас.</li>
  <li><b>Две области одного цвета не могут соприкасаться сторонами.</b> Углами можно.</li>
  <li>Если текущему цвету некуда встать, ходишь вторым. Если не встаёт ни один, ход пропускается.</li>
  <li>Очки — площадь твоих областей в клетках. Партия кончается, когда никуда больше не встаёт ни один цвет. Больше очков — победа.</li>
  <li>Кто ходит первым, решает монетка.</li>
</ul>
<p class="muted">Тактика: сначала крупные области; свои одноцветные области держи подальше друг от друга; забирай большие куски, на которые может претендовать соперник.</p>`;

export function newOnlineState(players, first) {
  return newState((Math.random() * 2 ** 31) | 0, first, players);
}
export function applyMove(state, seat, move) { return apply(state, seat, move); }

export function noteText(note, names) {
  if (!note) return '';
  const [k, p, c] = note.split(':');
  if (k === 'skip') return `${names[+p]}: ${CNAME_INS[+c]} некуда ходить, ход другим цветом`;
  if (k === 'pass') return `${names[+p]} пропускает ход: ни один цвет не помещается`;
  return '';
}

export function turnText(s, mySeat, names) {
  if (s.over) return '';
  if (s.cur === mySeat) return `Ваш ход: ходите ${CNAME_INS[s.active]}`;
  return `${names[s.cur]} ходит ${CNAME_INS[s.active]}…`;
}

// Онлайн: экран партии, ходы отправляет onMove
export function mountOnline(root, { onMove }) {
  return mountGame(root, { onCell: r => onMove(r) });
}

// ---------- Одиночная игра против енота ----------
const DIFF = { easy: 'лёгкий', normal: 'средний', hard: 'сложный' };

export function mountSolo(root, { user, recordSolo }) {
  root.innerHTML = `
    <div class="solo-bar">
      <label>Сложность <select class="sel" id="soloDiff"><option value="easy">Лёгкий</option><option value="normal" selected>Средний</option><option value="hard">Сложный</option></select></label>
      <button class="btn primary" id="soloNew">Новая партия</button>
    </div>
    <div id="soloGame"></div>
    <div id="soloStart" class="panel center"></div>`;
  const gameRoot = root.querySelector('#soloGame'), startRoot = root.querySelector('#soloStart');
  let view = null, st = null, diff = 'normal', timer = null, alive = true, recorded = false;
  try { diff = localStorage.getItem('solo-diff') || 'normal'; } catch (e) {}
  root.querySelector('#soloDiff').value = diff;
  const players = () => [
    { name: user.name, photo: user.photo, sub: 'вы' },
    { name: 'Енот Тоша', emoji: '🦝', sub: 'соперник · ' + DIFF[diff] },
  ];
  let lastNoteKey = '';

  function render() {
    if (!view) view = mountGame(gameRoot, { onCell: r => { if (st && st.cur === 0 && !st.over) step(r); } });
    const myTurn = !st.over && st.cur === 0;
    const turnText = st.over ? resultText() : myTurn ? `Ваш ход: ходите ${CNAME_INS[st.active]}` : 'Енот думает…';
    view.update(st, players(), { canAct: myTurn, turnText, toast });
    const key = st.moves + st.note;
    if (st.note && key !== lastNoteKey) toast(noteText(st.note, [user.name, 'Енот']));
    lastNoteKey = key;
    if (st.over && !recorded) {
      recorded = true;
      const res = st.winner === -1 ? 'd' : st.winner === 0 ? 'w' : 'l';
      recordSolo(diff, res).catch(() => toast('Не удалось сохранить результат'));
      showEnd(res);
    }
    if (!st.over && st.cur === 1) { clearTimeout(timer); timer = setTimeout(aiStep, 700); }
  }
  function resultText() {
    return st.winner === -1 ? 'Ничья' : st.winner === 0 ? 'Вы победили!' : 'Енот победил';
  }
  function step(r) {
    try { st = apply(st, st.cur, r); } catch (e) { toast(e.message); return; }
    render();
  }
  function aiStep() {
    if (!alive || st.over || st.cur !== 1) return;
    const r = aiPick(st, diff);
    if (r >= 0) step(r);
  }
  function showEnd(res) {
    startRoot.innerHTML = `<div class="result ${res}">${res === 'w' ? '🏆 Победа' : res === 'l' ? '🦝 Енот выиграл' : '🤝 Ничья'} · ${st.sc[0]}:${st.sc[1]}</div>
      <button class="btn primary" id="soloAgain">Ещё партию</button>`;
    startRoot.querySelector('#soloAgain').onclick = start;
  }

  function start() {
    clearTimeout(timer);
    diff = root.querySelector('#soloDiff').value;
    try { localStorage.setItem('solo-diff', diff); } catch (e) {}
    gameRoot.innerHTML = ''; view = null; st = null; recorded = false;
    startRoot.innerHTML = `<h3>Кто ходит первым? Выберите сторону монетки</h3>
      <div class="coin-pick">${['h', 't'].map(s => `<button class="coin-btn" data-s="${s}">${coinFace(s)}<span>${SIDE_NAME[s]}</span></button>`).join('')}</div>
      <p class="muted">Енот возьмёт оставшуюся сторону.</p>`;
    startRoot.querySelectorAll('.coin-btn').forEach(b => b.onclick = async () => {
      const mine = b.dataset.s, result = Math.random() < 0.5 ? 'h' : 't';
      const first = result === mine ? 0 : 1;
      startRoot.innerHTML = '';
      await flipCoin(result, first === 0 ? 'Вы ходите первым' : 'Первым ходит енот');
      if (!alive) return;
      st = newState((Math.random() * 2 ** 31) | 0, first, [user.uid, 'raccoon']);
      render();
    });
  }
  root.querySelector('#soloNew').onclick = start;
  start();
  return () => { alive = false; clearTimeout(timer); };
}
