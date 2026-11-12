// Монетка: выбор стороны и анимация броска.
export const SIDE_NAME = { h: 'Орёл', t: 'Решка' };

const faceH = `<svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="44" fill="none" stroke="currentColor" stroke-width="3" stroke-dasharray="2 4"/>
  <path d="M50 22 l7 15 16 2 -12 11 3 16 -14 -8 -14 8 3 -16 -12 -11 16 -2z" fill="currentColor"/><text x="50" y="82" text-anchor="middle" font-size="11" font-weight="900" fill="currentColor" font-family="Nunito,sans-serif">ОРЁЛ</text></svg>`;
const faceT = `<svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="44" fill="none" stroke="currentColor" stroke-width="3" stroke-dasharray="2 4"/>
  <text x="50" y="62" text-anchor="middle" font-size="40" font-weight="900" fill="currentColor" font-family="Nunito,sans-serif">1</text><text x="50" y="82" text-anchor="middle" font-size="11" font-weight="900" fill="currentColor" font-family="Nunito,sans-serif">РЕШКА</text></svg>`;

export function coinFace(side) { return `<div class="coin-face ${side}">${side === 'h' ? faceH : faceT}</div>`; }

// Анимация: монетка подлетает, крутится и ложится нужной стороной
export function flipCoin(result, caption) {
  return new Promise(resolve => {
    const ov = document.createElement('div');
    ov.className = 'coin-overlay';
    ov.innerHTML = `<div class="coin-stage"><div class="coin3d"><div class="side front">${faceH}</div><div class="side back">${faceT}</div></div></div>
      <div class="coin-caption"></div>`;
    document.body.appendChild(ov);
    const coin = ov.querySelector('.coin3d');
    const turns = 7 * 360 + (result === 't' ? 180 : 0);
    const anim = coin.animate([
      { transform: 'translateY(0) rotateX(0deg) scale(1)' },
      { transform: `translateY(-150px) rotateX(${turns * 0.5}deg) scale(1.15)`, offset: 0.45 },
      { transform: `translateY(0) rotateX(${turns}deg) scale(1)`, offset: 0.85 },
      { transform: `translateY(-14px) rotateX(${turns}deg) scale(1)`, offset: 0.92 },
      { transform: `translateY(0) rotateX(${turns}deg) scale(1)` },
    ], { duration: 2300, easing: 'cubic-bezier(.3,.1,.3,1)', fill: 'forwards' });
    const finish = () => {
      ov.querySelector('.coin-caption').innerHTML = `<b>${SIDE_NAME[result]}!</b><br>${caption}`;
      ov.classList.add('done');
      setTimeout(() => { ov.classList.add('hide'); setTimeout(() => { ov.remove(); resolve(); }, 350); }, 1600);
    };
    anim.onfinish = finish;
    ov.addEventListener('click', () => { if (ov.classList.contains('done')) { ov.remove(); resolve(); } });
  });
}
