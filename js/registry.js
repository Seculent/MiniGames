// Список игр в лобби. Чтобы добавить игру, создайте папку js/games/<id>/index.js
// с функциями newOnlineState, applyMove, mountOnline (и по желанию mountSolo) и добавьте строку сюда.
export const GAMES = [
  {
    id: 'colorSquares',
    title: 'Цветные квадраты',
    icon: '🟩',
    desc: 'Закрашивай области двумя цветами так, чтобы одинаковые не касались. Больше площадь — победа.',
    tables: 2,
    solo: 'Против енота',
    load: () => import('./games/colorSquares/index.js'),
  },
  {
    id: 'battleship',
    title: 'Морской бой',
    icon: '🚢',
    desc: 'Классика 10×10: расставь флот и потопи корабли соперника первым.',
    tables: 2,
    solo: 'Против енота',
    load: () => import('./games/battleship/index.js'),
  },
];
export const gameById = id => GAMES.find(g => g.id === id);
