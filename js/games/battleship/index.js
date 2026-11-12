// Модуль «Морского боя» для лобби.
import { newState, applyMove as apply } from './logic.js';
import { mountOnline as mount } from './view.js';

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
