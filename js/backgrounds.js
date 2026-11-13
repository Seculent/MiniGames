// Фоновое слайд-шоу из фотографий папки backgrounds/.
// Новые фото достаточно положить в эту папку в репозитории: на GitHub Pages
// список файлов берётся через GitHub API. Если API недоступен (локальный
// запуск, лимит запросов), используется backgrounds/list.json.

const DIR = 'backgrounds';
const SLIDE_MS = 15000;          // сколько показывается одно фото
const CACHE_KEY = 'bgList.v1';
const CACHE_MS = 10 * 60 * 1000; // список файлов кешируется на 10 минут
const IMG_RE = /\.(jpe?g|png|webp|gif|avif)$/i;

function repoFromLocation() {
  // https://ЛОГИН.github.io/РЕПОЗИТОРИЙ/...
  const m = location.hostname.match(/^([^.]+)\.github\.io$/i);
  if (!m) return null;
  const repo = location.pathname.split('/').filter(Boolean)[0] || (m[1] + '.github.io');
  return { owner: m[1], repo };
}

async function listFromGitHub() {
  const r = repoFromLocation();
  if (!r) return null;
  try {
    const c = JSON.parse(sessionStorage.getItem(CACHE_KEY) || 'null');
    if (c && Date.now() - c.t < CACHE_MS && Array.isArray(c.files)) return c.files;
  } catch (e) {}
  const res = await fetch(`https://api.github.com/repos/${r.owner}/${r.repo}/contents/${DIR}`,
    { headers: { Accept: 'application/vnd.github+json' } });
  if (!res.ok) return null;
  const files = (await res.json())
    .filter(f => f.type === 'file' && IMG_RE.test(f.name))
    .map(f => `${DIR}/${f.name}`);
  try { sessionStorage.setItem(CACHE_KEY, JSON.stringify({ t: Date.now(), files })); } catch (e) {}
  return files;
}

async function listFromJson() {
  try {
    const res = await fetch(`${DIR}/list.json`, { cache: 'no-cache' });
    if (!res.ok) return [];
    const arr = await res.json();
    return arr.filter(n => IMG_RE.test(n)).map(n => `${DIR}/${n}`);
  } catch (e) { return []; }
}

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

function preload(src) {
  return new Promise(ok => { const im = new Image(); im.onload = () => ok(true); im.onerror = () => ok(false); im.src = src; });
}

function syncMode() {
  // На странице стола и в одиночной игре фото ещё бледнее, чтобы не мешать игре.
  const kind = location.hash.replace(/^#\/?/, '').split('/')[0];
  document.body.classList.toggle('bg-in-game', kind === 't' || kind === 'solo');
}

async function start() {
  syncMode();
  window.addEventListener('hashchange', syncMode);

  let files = null;
  try { files = await listFromGitHub(); } catch (e) {}
  if (!files || !files.length) files = await listFromJson();
  if (!files.length) return;

  const root = document.createElement('div');
  root.className = 'bg-show';
  root.setAttribute('aria-hidden', 'true');
  const layers = [document.createElement('div'), document.createElement('div')];
  layers.forEach(l => { l.className = 'bg-slide'; root.appendChild(l); });
  document.body.prepend(root);

  const order = shuffle(files.slice());
  let i = 0, front = 0;
  const show = async () => {
    // пропускаем битые файлы
    for (let tries = 0; tries < order.length; tries++) {
      const src = order[i % order.length]; i++;
      if (await preload(src)) {
        const next = layers[1 - front];
        next.style.backgroundImage = `url("${encodeURI(src)}")`;
        next.classList.add('on');
        layers[front].classList.remove('on');
        front = 1 - front;
        return;
      }
    }
  };
  await show();
  if (order.length > 1) setInterval(() => { if (!document.hidden) show(); }, SLIDE_MS);
}

start();
