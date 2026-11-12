// Общие мелочи интерфейса
export const $ = (sel, root = document) => root.querySelector(sel);
export const esc = s => String(s ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

export function avatarHTML(p) {
  if (p && p.photo && (/^https:\/\//.test(p.photo) || /^data:image\/(webp|jpeg|png);base64,[A-Za-z0-9+/=]+$/.test(p.photo))) return `<img src="${esc(p.photo)}" alt="" referrerpolicy="no-referrer">`;
  if (p && p.emoji) return `<span class="emo">${esc(p.emoji)}</span>`;
  const ch = (p && p.name ? p.name.trim()[0] : '?') || '?';
  return `<span class="ini">${esc(ch.toUpperCase())}</span>`;
}

let toastT;
export function toast(msg) {
  const t = $('#toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 2800);
}

export function confirmBox(title, text, yesLabel = 'Да') {
  return new Promise(resolve => {
    const m = $('#confirm');
    $('#cfTitle').textContent = title; $('#cfText').textContent = text; $('#cfYes').textContent = yesLabel;
    m.classList.add('show');
    const done = v => { m.classList.remove('show'); $('#cfYes').onclick = $('#cfNo').onclick = null; resolve(v); };
    $('#cfYes').onclick = () => done(true);
    $('#cfNo').onclick = () => done(false);
  });
}

export function plural(n, one, few, many) {
  const a = Math.abs(n) % 100, b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b > 1 && b < 5) return few;
  if (b === 1) return one;
  return many;
}
