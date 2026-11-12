// Редактор аватарки: перетащить фото, приблизить (колесо, ползунок, щипок двумя пальцами),
// выбрать квадрат. Результат — картинка 128×128 в виде data URL (несколько килобайт).
const OUT = 128, MAX_LEN = 38000;

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => resolve({ img, url });
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Не удалось открыть изображение. Попробуйте JPG или PNG.')); };
    img.src = url;
  });
}

function encode(canvas) {
  let d = canvas.toDataURL('image/webp', 0.85);
  if (!d.startsWith('data:image/webp')) d = canvas.toDataURL('image/jpeg', 0.85);
  if (d.length > MAX_LEN) d = canvas.toDataURL('image/jpeg', 0.7);
  if (d.length > MAX_LEN) d = canvas.toDataURL('image/jpeg', 0.5);
  return d;
}

export async function openAvatarEditor(file) {
  if (!file || !/^image\//.test(file.type || 'image/')) throw new Error('Это не изображение');
  const { img, url } = await loadImage(file);
  const W = img.naturalWidth, H = img.naturalHeight;
  if (!W || !H) { URL.revokeObjectURL(url); throw new Error('Пустое изображение'); }

  return new Promise(resolve => {
    const S = 300, C = 240; // размер сцены и рамки кадра (в CSS-пикселях)
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const ov = document.createElement('div');
    ov.className = 'modal show av-modal';
    ov.innerHTML = `<div class="card av-card">
      <h2>Новая аватарка</h2>
      <p class="muted small">Перетащите фото и приблизьте, чтобы в рамку попала нужная часть.</p>
      <div class="av-stage" style="width:${S}px;height:${S}px"><canvas width="${S * dpr}" height="${S * dpr}" style="width:${S}px;height:${S}px"></canvas>
        <div class="av-frame" style="width:${C}px;height:${C}px"></div></div>
      <div class="av-zoom"><button class="btn ghost sm" data-z="-">−</button><input type="range" min="1" max="5" step="0.01" value="1"><button class="btn ghost sm" data-z="+">+</button></div>
      <div class="av-prev"><canvas width="${56 * dpr}" height="${56 * dpr}" style="width:56px;height:56px"></canvas><span class="muted small">Так аватарка будет выглядеть за столом</span></div>
      <div class="row"><button class="btn" data-a="cancel">Отмена</button><button class="btn primary" data-a="ok">Готово</button></div>
    </div>`;
    document.body.appendChild(ov);
    const cv = ov.querySelector('.av-stage canvas'), ctx = cv.getContext('2d');
    const pv = ov.querySelector('.av-prev canvas'), pctx = pv.getContext('2d');
    const range = ov.querySelector('input[type=range]');
    const base = Math.max(C / W, C / H);
    let z = 1, ox = 0, oy = 0;

    const clamp = () => {
      const w = W * base * z, h = H * base * z;
      const mx = Math.max(0, (w - C) / 2), my = Math.max(0, (h - C) / 2);
      ox = Math.min(mx, Math.max(-mx, ox)); oy = Math.min(my, Math.max(-my, oy));
    };
    // рисует изображение в систему координат кадра размером size
    const drawCrop = (c2, size) => {
      const k = size / C, w = W * base * z * k, h = H * base * z * k;
      c2.drawImage(img, size / 2 + ox * k - w / 2, size / 2 + oy * k - h / 2, w, h);
    };
    function draw() {
      clamp();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = '#0b1f1c'; ctx.fillRect(0, 0, S, S);
      const w = W * base * z, h = H * base * z;
      ctx.drawImage(img, S / 2 + ox - w / 2, S / 2 + oy - h / 2, w, h);
      pctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      pctx.clearRect(0, 0, 56, 56);
      drawCrop(pctx, 56);
      range.value = String(z);
    }
    const setZoom = nz => { z = Math.min(5, Math.max(1, nz)); draw(); };

    // перетаскивание и щипок
    const pts = new Map(); let pinch = null;
    cv.addEventListener('pointerdown', e => { cv.setPointerCapture(e.pointerId); pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), z }; } });
    cv.addEventListener('pointermove', e => {
      const p = pts.get(e.pointerId); if (!p) return;
      if (pts.size === 1) { ox += e.clientX - p.x; oy += e.clientY - p.y; }
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size === 2 && pinch) { const [a, b] = [...pts.values()]; setZoom(pinch.z * Math.hypot(a.x - b.x, a.y - b.y) / pinch.d); }
      else draw();
    });
    const up = e => { pts.delete(e.pointerId); if (pts.size < 2) pinch = null; };
    cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
    cv.addEventListener('wheel', e => { e.preventDefault(); setZoom(z * Math.exp(-e.deltaY * 0.0015)); }, { passive: false });
    range.addEventListener('input', () => setZoom(+range.value));
    ov.querySelectorAll('[data-z]').forEach(b => b.onclick = () => setZoom(z * (b.dataset.z === '+' ? 1.2 : 1 / 1.2)));

    const close = val => { ov.remove(); URL.revokeObjectURL(url); resolve(val); };
    ov.querySelector('[data-a=cancel]').onclick = () => close(null);
    ov.querySelector('[data-a=ok]').onclick = () => {
      const out = document.createElement('canvas'); out.width = out.height = OUT;
      const o = out.getContext('2d');
      o.imageSmoothingQuality = 'high';
      drawCrop(o, OUT);
      close(encode(out));
    };
    draw();
  });
}
