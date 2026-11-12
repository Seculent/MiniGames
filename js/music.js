// Фоновая музыка: спокойный эмбиент, который генерируется прямо в браузере (Web Audio).
// Медленные аккорды-«подушки» + редкие колокольчики из пентатоники, мягкий фильтр и реверберация.
// Никаких файлов: музыка каждый раз немного разная и не повторяется.

const KEY = 'music-on', VOL_KEY = 'music-vol';
let ctx = null, master = null, bus = null, playing = false, timer = null, nextChord = 0, nextBell = 0, chordIdx = 0;

// Аккорды (частоты MIDI): Cmaj9 → Am9 → Fmaj7 → G6sus
const CHORDS = [[48, 55, 64, 71, 74], [45, 52, 60, 67, 71], [41, 48, 57, 64, 69], [43, 50, 59, 62, 64]];
const BELLS = [72, 74, 76, 79, 81, 84, 86, 88];
const hz = m => 440 * Math.pow(2, (m - 69) / 12);
const CHORD_LEN = 9;

function impulse(seconds = 3.5) {
  const len = Math.floor(ctx.sampleRate * seconds), buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6);
  }
  return buf;
}

function setup() {
  ctx = new (window.AudioContext || window.webkitAudioContext)();
  master = ctx.createGain(); master.gain.value = 0;
  const comp = ctx.createDynamicsCompressor();
  master.connect(comp); comp.connect(ctx.destination);
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1800; lp.Q.value = 0.4;
  const verb = ctx.createConvolver(); verb.buffer = impulse();
  const wet = ctx.createGain(); wet.gain.value = 0.55;
  const dry = ctx.createGain(); dry.gain.value = 0.6;
  bus = ctx.createGain();
  bus.connect(lp); lp.connect(dry); lp.connect(verb); verb.connect(wet);
  dry.connect(master); wet.connect(master);
}

function pad(t, notes) {
  for (const m of notes) for (const det of [-6, 5]) {
    const o = ctx.createOscillator(), g = ctx.createGain(), f = ctx.createBiquadFilter();
    o.type = m < 50 ? 'sine' : 'triangle';
    o.frequency.value = hz(m); o.detune.value = det + (Math.random() * 4 - 2);
    f.type = 'lowpass'; f.frequency.value = m < 50 ? 500 : 1100;
    const peak = (m < 50 ? 0.05 : 0.022);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + 3);
    g.gain.setValueAtTime(peak, t + CHORD_LEN - 1);
    g.gain.linearRampToValueAtTime(0, t + CHORD_LEN + 3.5);
    o.connect(f); f.connect(g); g.connect(bus);
    o.start(t); o.stop(t + CHORD_LEN + 4);
  }
}

function bell(t, m) {
  const o = ctx.createOscillator(), o2 = ctx.createOscillator(), g = ctx.createGain();
  o.type = 'sine'; o.frequency.value = hz(m);
  o2.type = 'sine'; o2.frequency.value = hz(m) * 2.01;
  const g2 = ctx.createGain(); g2.gain.value = 0.25;
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(0.035, t + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0005, t + 4);
  o.connect(g); o2.connect(g2); g2.connect(g); g.connect(bus);
  o.start(t); o2.start(t); o.stop(t + 4.2); o2.stop(t + 4.2);
}

function schedule() {
  const ahead = ctx.currentTime + 2;
  while (nextChord < ahead) {
    pad(nextChord, CHORDS[chordIdx % CHORDS.length]);
    chordIdx++; nextChord += CHORD_LEN;
  }
  while (nextBell < ahead) {
    if (Math.random() < 0.7) bell(nextBell, BELLS[Math.floor(Math.random() * BELLS.length)]);
    nextBell += 1.6 + Math.random() * 2.8;
  }
}

function volume() { const v = Number(localStorage.getItem(VOL_KEY)); return v > 0 && v <= 1 ? v : 0.6; }

export async function startMusic() {
  if (playing) return;
  if (!ctx) setup();
  await ctx.resume();
  playing = true;
  nextChord = Math.max(nextChord, ctx.currentTime + 0.1); nextBell = Math.max(nextBell, ctx.currentTime + 2);
  master.gain.cancelScheduledValues(ctx.currentTime);
  master.gain.setValueAtTime(master.gain.value, ctx.currentTime);
  master.gain.linearRampToValueAtTime(volume(), ctx.currentTime + 3);
  schedule();
  timer = setInterval(schedule, 700);
}

export function stopMusic() {
  if (!playing) return;
  playing = false;
  clearInterval(timer);
  const t = ctx.currentTime;
  master.gain.cancelScheduledValues(t);
  master.gain.setValueAtTime(master.gain.value, t);
  master.gain.linearRampToValueAtTime(0, t + 1.2);
  setTimeout(() => { if (!playing) ctx.suspend(); }, 1400);
}

export function setVolume(v) {
  try { localStorage.setItem(VOL_KEY, String(v)); } catch (e) {}
  if (playing) master.gain.setTargetAtTime(v, ctx.currentTime, 0.2);
}

// Кнопка в шапке. Браузеры не дают включать звук без действия пользователя,
// поэтому если музыка была включена раньше, она начнётся с первого клика по странице.
export function initMusic(btn, slider) {
  const want = () => localStorage.getItem(KEY) === '1';
  const paint = () => {
    btn.classList.toggle('on', playing);
    btn.title = playing ? 'Выключить музыку' : 'Включить музыку';
    btn.setAttribute('aria-pressed', String(playing));
  };
  btn.onclick = async e => {
    e.stopPropagation();
    if (playing) { stopMusic(); try { localStorage.setItem(KEY, '0'); } catch (er) {} }
    else { try { localStorage.setItem(KEY, '1'); } catch (er) {} await startMusic(); }
    paint();
  };
  if (slider) {
    slider.value = String(volume());
    slider.oninput = () => setVolume(+slider.value);
  }
  if (want()) {
    const first = async e => {
      if (btn.contains(e.target)) return; // клик по самой кнопке обработает её onclick
      document.removeEventListener('pointerdown', first, true);
      if (want() && !playing) { await startMusic(); paint(); }
    };
    document.addEventListener('pointerdown', first, true);
  }
  paint();
}
