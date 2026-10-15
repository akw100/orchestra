// Easter eggs: six hidden tricks, each a short over-the-top show. Self-mounts its styles, an overlay canvas and listeners.
// Uses only audio.js's public API plus the #bpm / #stop controls. keys.js still owns the keyboard: we listen, never claim.
//   ↑ ↑ ↓ ↓ ← → ← → B A            Canon Rock: 140 bpm, fire, lightning, distorted power chords
//   flick the house lights 4× fast   Saturday Night Canon: mirror ball, light specks, sweeping beams, hi-hats
//   click "Pocket Orchestra" 5×      the title bursts into falling notes, a vortex, and a harp glissando home
//   type B R A V O                   standing ovation: confetti cannons, roses, camera flashes, applause
//   hold "Stop all" 1.5 s            stop ALL: a black hole swallows the hall, then a big bang restarts it
//   drag the tempo to the floor      Largo molto: the page melts until you speed it up again
// A row of buttons under the keyboard HUD (beneath Esc) runs each one by hand; hover one for its secret trigger.
import * as O from './audio.js';

const RM = matchMedia('(prefers-reduced-motion: reduce)');
const TAU = Math.PI * 2;
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (a) => a[(Math.random() * a.length) | 0];
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const easeOut = (t) => 1 - (1 - t) ** 3;
const easeIn = (t) => t * t * t;
const backOut = (t) => 1 + 2.7 * (t - 1) ** 3 + 1.7 * (t - 1) ** 2;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const $ = (s) => document.querySelector(s);
const tok = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const HUES = O.INSTRUMENTS.map((i) => i.hue);
const letters = (s, from = 0) => [...s].map((c, i) => `<span style="--i:${from + i}">${c === ' ' ? '&nbsp;' : c}</span>`).join('');
const visible = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.bottom > 0 && r.top < innerHeight; };

// ---------- styles ----------
document.head.append(Object.assign(document.createElement('style'), { textContent: `
.egg-fx { position: fixed; inset: 0; width: 100vw; height: 100vh; pointer-events: none; z-index: 2147483000; }
.egg-banner { position: fixed; inset: 0; display: grid; place-content: center; justify-items: center; gap: 1.4vh; padding: 16px;
  pointer-events: none; z-index: 2147483003; text-align: center; font-family: var(--font-display, 'Bodoni Moda', serif); }
.egg-banner span { display: inline-block; }
.egg-glyph { position: fixed; margin: 0; white-space: pre; text-align: center; pointer-events: none; z-index: 2147483002; will-change: transform; }
.egg-calm { font: italic 600 clamp(2rem, 8vw, 5rem)/1 var(--font-display); color: var(--accent-hi); text-shadow: 0 2px 30px var(--shadow); animation: egg-fade 2.6s ease both; }
@keyframes egg-fade { 0%, 100% { opacity: 0 } 15%, 80% { opacity: 1 } }

.egg-rock .proscenium { filter: saturate(1.8) contrast(1.15) sepia(.2) hue-rotate(-14deg); }
.egg-rock h1 em { color: #ff6a1a; text-shadow: 0 0 .25em #ff8a00, 0 0 .6em #ff2a00; }
.egg-rock-b { filter: drop-shadow(0 0 22px rgb(255 80 20 / .75)); }
.egg-rock-b b { position: relative; font: 700 clamp(3rem, 14vw, 11rem)/.9 var(--font-body, 'Jost', sans-serif); letter-spacing: .04em;
  background: linear-gradient(#fffbe6 12%, #ffc23a 45%, #ff5a14 70%, #8a0f0f); -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent;
  animation: egg-slam 4.3s cubic-bezier(.2,1.3,.4,1) both; }
.egg-rock-b b::before, .egg-rock-b b::after { content: attr(data-t); position: absolute; inset: 0; -webkit-text-fill-color: currentColor; mix-blend-mode: screen; }
.egg-rock-b b::before { color: #19f6ff; animation: egg-glitch .42s steps(2) infinite; }
.egg-rock-b b::after { color: #ff2bd6; animation: egg-glitch .33s steps(2) infinite reverse; }
.egg-rock-b small { font: 500 clamp(.75rem, 1.7vw, 1.15rem)/1.3 var(--font-body); letter-spacing: .3em; text-transform: uppercase; color: #ffe2b0; animation: egg-fade 4.3s .25s both; }
@keyframes egg-slam { 0% { transform: scale(4.5) rotate(-6deg); opacity: 0 } 7% { transform: scale(.94); opacity: 1 } 12% { transform: none } 85% { transform: scale(1.05); opacity: 1 } 100% { transform: scale(1.7); opacity: 0 } }
@keyframes egg-glitch { 0% { clip-path: inset(10% 0 70% 0); translate: -7px 0 } 25% { clip-path: inset(62% 0 8% 0); translate: 6px 2px } 50% { clip-path: inset(35% 0 45% 0); translate: -4px -2px }
  75% { clip-path: inset(82% 0 2% 0); translate: 8px 0 } 100% { clip-path: inset(0 0 86% 0); translate: -5px 1px } }

.egg-ball { position: fixed; top: 0; left: 50%; translate: -50% 0; z-index: 2147483001; pointer-events: none; display: grid; justify-items: center; }
.egg-ball i { width: 2px; height: 14vh; background: linear-gradient(#999, #555); }
.egg-ball b { position: relative; width: clamp(90px, 15vmin, 160px); aspect-ratio: 1; border-radius: 50%;
  background: radial-gradient(circle at 32% 28%, rgb(255 255 255 / .95), rgb(255 255 255 / 0) 22%),
    radial-gradient(circle, transparent 50%, rgb(0 0 0 / .7) 74%),
    linear-gradient(90deg, rgb(0 0 0 / .5) 1.5px, transparent 1.5px) 0 0 / 11px 11px,
    linear-gradient(rgb(0 0 0 / .5) 1.5px, transparent 1.5px) 0 0 / 11px 11px,
    linear-gradient(90deg, #666, #eee 12%, #888 25%, #fff 37%, #777 50%, #f2f2f2 62%, #8a8a8a 75%, #fff 87%, #666) 0 0 / 132px 100%;
  box-shadow: 0 0 40px rgb(255 255 255 / .45), 0 0 120px rgb(190 140 255 / .4); animation: egg-spin 2.6s linear infinite; }
.egg-ball b::after { content: ''; position: absolute; width: 34%; height: 34%; left: 18%; top: 14%;
  background: linear-gradient(transparent 47%, #fff 50%, transparent 53%), linear-gradient(90deg, transparent 47%, #fff 50%, transparent 53%);
  animation: egg-glint 1.3s ease-in-out infinite; }
@keyframes egg-spin { to { background-position: 0 0, 0 0, 132px 0, 132px 0, 132px 0; } }
@keyframes egg-glint { 0%, 100% { scale: 0; rotate: 0deg } 30% { scale: 1; rotate: 45deg } 50% { scale: 0; translate: 0 0 } 51% { translate: 120% 90% } 80% { scale: 1.2; rotate: 90deg; translate: 120% 90% } }
.egg-disco .chip.on .fill { animation: egg-hue 1.1s linear infinite; }
@keyframes egg-hue { to { filter: hue-rotate(360deg) saturate(1.6); } }
.egg-disco-b b { font: italic 500 clamp(1.6rem, 5vw, 3.6rem)/1 var(--font-display); color: #fff; text-shadow: 0 0 6px #fff, 0 0 18px #ff3df2, 0 0 40px #ff3df2, 0 0 80px #b400ff; }
.egg-disco-b i { font: italic 700 clamp(3.6rem, 13vw, 10rem)/.9 var(--font-display); color: #eaffff; text-shadow: 0 0 8px #fff, 0 0 24px #21f6ff, 0 0 60px #21b8ff, 0 0 110px #2a5bff; }
.egg-disco-b span { animation: egg-neon 5s linear both; animation-delay: calc(var(--i) * 60ms); }
@keyframes egg-neon { 0% { opacity: 0 } 3% { opacity: 1 } 5% { opacity: .15 } 7% { opacity: 1 } 9% { opacity: .35 } 12%, 86% { opacity: 1 } 100% { opacity: 0 } }

.egg-bravo-b b { font: italic 700 clamp(4rem, 17vw, 13rem)/1.05 var(--font-display); filter: drop-shadow(0 4px 0 #6b4510) drop-shadow(0 14px 30px rgb(0 0 0 / .45)); }
.egg-bravo-b span { padding: 0 .02em; background: linear-gradient(100deg, #fff4cf, #f2c75c 30%, #fff8e0 45%, #c38b2c 60%, #ffe39a) 0 0 / 200% 100%;
  -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent;
  animation: egg-pop 4.3s cubic-bezier(.2,1.8,.4,1) both, egg-shine 1.4s linear infinite; animation-delay: calc(var(--i) * 90ms), 0s; }
@keyframes egg-pop { 0% { transform: translateY(70%) scale(0) rotate(-25deg); opacity: 0 } 12% { transform: none; opacity: 1 } 82% { transform: none; opacity: 1 } 100% { transform: translateY(-50%) scale(.6); opacity: 0 } }
@keyframes egg-shine { to { background-position: -200% 0; } }

#stop.egg-charge { animation: egg-jitter 70ms linear infinite; scale: calc(1 - var(--k, 0) * .08);
  box-shadow: 0 0 calc(var(--k, 0) * 40px) calc(var(--k, 0) * 8px) rgb(140 70 255 / calc(var(--k, 0) * .9)); }
@keyframes egg-jitter { 0% { translate: calc(var(--k, 0) * -4px) calc(var(--k, 0) * 1px) } 50% { translate: calc(var(--k, 0) * 4px) calc(var(--k, 0) * -1px) } 100% { translate: 0 0 } }
.egg-void-b { padding-top: 22vh; font: italic 400 clamp(1.2rem, 3vw, 2rem)/1.2 var(--font-display); color: #e9dcff; animation: egg-fade 1.1s ease both; }

.egg-row { display: flex; flex-wrap: wrap; justify-content: center; gap: 6px; margin-top: 7px; }
.egg-row button { padding: 6px 11px; border-radius: 999px; cursor: pointer; font: 500 10.5px/1 var(--k-sans, 'Jost', sans-serif); letter-spacing: .12em; text-transform: uppercase;
  color: var(--k-muted, #b9a594); background: color-mix(in oklab, var(--k-surface, #170c10) 88%, transparent); border: 1px solid var(--k-line, rgb(214 178 108 / .22));
  backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px); transition: color .25s, border-color .25s, box-shadow .25s, opacity .25s; }
.egg-row button:hover, .egg-row button:focus-visible { color: var(--k-accent, #d6b26c); border-color: var(--k-accent, #d6b26c); box-shadow: 0 0 14px -3px var(--k-glow, rgb(255 196 104 / .55)); }
.egg-busy .egg-row button { opacity: .4; pointer-events: none; }
.egg-melt-b b { font: italic 600 clamp(2.4rem, 9vw, 7rem)/1 var(--font-display); color: var(--accent-hi); text-shadow: 0 3px 24px var(--shadow); }
.egg-melt-b span { transform-origin: top; animation: egg-droop 4.8s cubic-bezier(.5,0,.75,0) both; animation-delay: calc(var(--i) * 60ms); }
@keyframes egg-droop { 0% { opacity: 0; transform: none } 10% { opacity: 1; transform: none } 78% { opacity: 1; transform: translateY(.5em) scaleY(1.9) skewX(-8deg) } 100% { opacity: 0; transform: translateY(1.6em) scaleY(3.2) } }
` }));

// the melt: vertical-streak noise with every displacement pointing down, so content sags in drips
document.body.insertAdjacentHTML('beforeend', `<svg aria-hidden="true" width="0" height="0" style="position:absolute">
  <filter id="egg-melt" x="-5%" y="-5%" width="110%" height="140%" color-interpolation-filters="sRGB">
    <feTurbulence type="fractalNoise" baseFrequency="0.014 0.0015" numOctaves="3" seed="4" result="n"/>
    <feComponentTransfer in="n" result="m"><feFuncR type="linear" slope="0.25" intercept="0.375"/><feFuncG type="linear" slope="1.2" intercept="-0.25"/><feFuncA type="table" tableValues="1 1"/></feComponentTransfer>
    <feDisplacementMap in="SourceGraphic" in2="m" scale="0" xChannelSelector="R" yChannelSelector="G"/>
  </filter></svg>`);
const disp = $('#egg-melt feDisplacementMap');

// ---------- overlay canvas: draw(f) runs f(dt, now) every frame until it returns false ----------
const cv = Object.assign(document.createElement('canvas'), { className: 'egg-fx' });
cv.setAttribute('aria-hidden', 'true');
cv.style.display = 'none';
document.body.append(cv);
const g = cv.getContext('2d');
let W = innerWidth, H = innerHeight, D = 1, layers = [], raf = 0, last = 0;
function fit() {
  D = Math.min(2, devicePixelRatio || 1); W = innerWidth; H = innerHeight;
  cv.width = Math.round(W * D); cv.height = Math.round(H * D);
  g.setTransform(D, 0, 0, D, 0, 0);
}
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  g.clearRect(0, 0, W, H);
  layers = layers.filter((f) => { g.save(); const keep = f(dt, now) !== false; g.restore(); return keep; });
  raf = layers.length ? requestAnimationFrame(frame) : 0;
  if (!raf) cv.style.display = 'none';
}
function draw(f) {
  layers.push(f);
  if (!raf) { cv.style.display = ''; fit(); last = performance.now(); raf = requestAnimationFrame(frame); }
}
addEventListener('resize', () => raf && fit());

function sprite(stops, size = 64) {
  const c = Object.assign(document.createElement('canvas'), { width: size, height: size });
  const x = c.getContext('2d'), gr = x.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  stops.forEach(([o, col]) => gr.addColorStop(o, col));
  x.fillStyle = gr; x.fillRect(0, 0, size, size);
  return c;
}
const GLOW = sprite([[0, 'rgba(255,255,255,1)'], [0.22, 'rgba(255,255,255,.5)'], [1, 'rgba(255,255,255,0)']]);
const FIRE = [
  sprite([[0, 'rgba(255,255,225,1)'], [0.4, 'rgba(255,215,110,.6)'], [1, 'rgba(255,150,40,0)']]),
  sprite([[0, 'rgba(255,195,70,.95)'], [0.45, 'rgba(255,115,20,.5)'], [1, 'rgba(230,60,10,0)']]),
  sprite([[0, 'rgba(255,100,25,.8)'], [0.5, 'rgba(200,35,10,.35)'], [1, 'rgba(120,10,5,0)']]),
  sprite([[0, 'rgba(150,25,10,.45)'], [1, 'rgba(60,5,5,0)']]),
];
function emoji(ch, px) {
  const c = Object.assign(document.createElement('canvas'), { width: px * 1.3, height: px * 1.3 });
  const x = c.getContext('2d');
  x.font = `${px}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
  x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(ch, c.width / 2, c.height / 2);
  return c;
}

function banner(html, cls, ms) {
  const b = document.createElement('div');
  b.className = `egg-banner ${cls}`; b.innerHTML = html; b.setAttribute('role', 'status');
  document.body.append(b);
  setTimeout(() => b.remove(), ms);
}
// typed triggers also move keys.js's selection (which scrolls to it); bring the stage back for the show
const toStage = () => setTimeout(() => $('.proscenium').scrollIntoView({ block: 'center', behavior: 'smooth' }), 60);
const calm = (html) => banner(html, 'egg-calm', 2600); // reduced motion: the line, no show

// one show at a time
let busy = false;
async function show(fn) {
  if (busy) return;
  busy = true; document.documentElement.classList.add('egg-busy');
  try { await fn(); } catch (e) { console.error(e); } finally { busy = false; document.documentElement.classList.remove('egg-busy'); }
}

// ---------- sound: tiny synth through the orchestra's master bus (so the limiter keeps it safe) ----------
const A = O.ctx, OUT = O.mix.master;
const wake = () => A.state !== 'running' && A.resume();
function env(t, dur, gain, attack, out = OUT) {
  const e = A.createGain();
  e.gain.setValueAtTime(0.0001, t);
  e.gain.exponentialRampToValueAtTime(gain, t + attack);
  e.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  e.connect(out);
  return e;
}
function tone(t, dur, f, { type = 'sine', f2 = 0, gain = 0.2, attack = 0.005, out } = {}) {
  const o = A.createOscillator(); o.type = type;
  o.frequency.setValueAtTime(f, t); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
  o.connect(env(t, dur, gain, attack, out)); o.start(t); o.stop(t + dur + 0.05);
}
function noise(t, dur, { type = 'bandpass', f = 1500, f2 = 0, q = 1, gain = 0.3, attack = 0.002 } = {}) {
  const s = A.createBufferSource(); s.buffer = O.noiseBuf; s.loop = true;
  const fl = A.createBiquadFilter(); fl.type = type; fl.Q.value = q;
  fl.frequency.setValueAtTime(f, t); if (f2) fl.frequency.exponentialRampToValueAtTime(f2, t + dur);
  s.connect(fl).connect(env(t, dur, gain, attack)); s.start(t, Math.random() * 0.9); s.stop(t + dur + 0.05);
}

const bpmIn = $('#bpm');
function setTempo(v) { bpmIn.value = v; bpmIn.dispatchEvent(new Event('input', { bubbles: true })); }

// ================= 1. Canon Rock: ↑↑↓↓←→←→BA =================
let rig;
function amp() { // distortion pedal + cab sim, built on first use
  if (rig) return rig;
  const ws = A.createWaveShaper(), n = 2048, c = new Float32Array(n);
  for (let i = 0; i < n; i++) c[i] = Math.tanh(((i / (n - 1)) * 2 - 1) * 9);
  ws.curve = c; ws.oversample = '4x';
  const cab = A.createBiquadFilter(); cab.type = 'lowpass'; cab.frequency.value = 2800; cab.Q.value = 0.9;
  const lvl = A.createGain(); lvl.gain.value = 0.16;
  ws.connect(cab).connect(lvl).connect(OUT);
  return (rig = ws);
}
const chug = (t, root, dur) => [0, 7, 12].forEach((iv) => tone(t, dur, O.hz(root + iv), { type: 'sawtooth', gain: 0.35, attack: 0.004, out: amp() }));
const rootAt = (beat) => { const r = O.CHORDS[Math.floor(beat / 2) % 8][0]; return r < 45 ? r + 12 : r; };
const shake = (a) => Array.from({ length: 6 }, (_, i) => {
  const k = a * (1 - i / 5);
  return { transform: `translate(${rnd(-k, k)}px, ${rnd(-k, k)}px) rotate(${rnd(-k, k) * 0.08}deg)` };
});
function boltPath(x1, y1, x2, y2, spread, depth) { // midpoint displacement
  let pts = [[x1, y1], [x2, y2]];
  for (let d = 0; d < depth; d++, spread /= 2) {
    const next = [pts[0]];
    for (let i = 1; i < pts.length; i++) {
      const [ax, ay] = pts[i - 1], [bx, by] = pts[i];
      next.push([(ax + bx) / 2 + rnd(-spread, spread), (ay + by) / 2 + rnd(-spread, spread) * 0.3], pts[i]);
    }
    pts = next;
  }
  return pts;
}
const BOLT_PASSES = [[16, 'rgba(140,90,255,.16)'], [6, 'rgba(195,165,255,.55)'], [2, 'rgba(255,255,255,1)']];

async function rock() {
  if (RM.matches) return calm('Canon Rock');
  wake(); O.tutti();
  const before = O.bpm, root = document.documentElement, main = $('main');
  setTempo(140); root.classList.add('egg-rock');
  toStage();
  banner('<b data-t="CANON ROCK">CANON ROCK</b><small>Pachelbel, 1680 · remastered at 140 bpm 🤘</small>', 'egg-rock-b', 4300);
  const fire = [], bolts = [];
  let on = true, heat = 0, flash = 0;
  const jets = () => [0.1, 0.36, 0.64, 0.9].forEach((f) => {
    for (let i = 0; i < 50; i++) fire.push({ x: W * f + rnd(-14, 14), y: H + 20, vx: rnd(-50, 50), vy: -rnd(900, 1500) * Math.sqrt(H / 800), s: rnd(36, 72), life: 0, max: rnd(0.45, 0.85) });
  });
  const bolt = () => {
    const x = rnd(W * 0.1, W * 0.9), trunk = boltPath(x, -10, x + rnd(-W * 0.2, W * 0.2), rnd(H * 0.45, H * 0.85), W * 0.1, 7);
    const paths = [trunk];
    for (let i = 0; i < 3; i++) { const [px, py] = trunk[(rnd(0.2, 0.7) * trunk.length) | 0]; paths.push(boltPath(px, py, px + rnd(-160, 160), py + rnd(80, 220), 50, 5)); }
    bolts.push({ paths, life: 0, max: 0.28 });
    flash = Math.max(flash, 0.45);
  };
  const onBeat = (e) => {
    const b = e.detail.beat, t = A.currentTime, spb = 60 / O.bpm, r = rootAt(b), down = b % 4 === 0;
    chug(t, r, spb * 0.42); chug(t + spb / 2, r, spb * 0.36);
    if (down) { noise(t, 1.3, { type: 'highpass', f: 5000, gain: 0.2 }); bolt(); jets(); } else if (Math.random() < 0.3) bolt();
    main.animate(shake(down ? 12 : 5), { duration: down ? 280 : 160, composite: 'add' });
  };
  tone(A.currentTime, 0.7, 70, { type: 'sawtooth', f2: 300, gain: 0.5, out: amp() }); // pick slide
  addEventListener('orch:beat', onBeat);
  draw((dt) => {
    heat = on ? Math.min(1, heat + dt * 1.5) : heat - dt;
    const n = heat > 0 ? Math.round(750 * dt * heat * (W / 1280 + 0.2)) : 0;
    for (let i = 0; i < n; i++) fire.push({ x: rnd(-30, W + 30), y: H + 30, vx: rnd(-30, 30), vy: -rnd(200, 560), s: rnd(40, 95), life: 0, max: rnd(0.6, 1.25) });
    g.globalCompositeOperation = 'lighter';
    for (let i = fire.length; i--;) {
      const p = fire[i], k = (p.life += dt) / p.max;
      if (k >= 1) { fire.splice(i, 1); continue; }
      p.vy *= 1 - 0.5 * dt; p.x += (p.vx + Math.sin(p.life * 9 + p.s) * 40) * dt; p.y += p.vy * dt;
      const s = p.s * (1 - 0.55 * k);
      g.globalAlpha = 1 - k * k;
      g.drawImage(FIRE[(k * 4) | 0], p.x - s / 2, p.y - s / 2, s, s);
    }
    g.lineCap = g.lineJoin = 'round';
    for (let i = bolts.length; i--;) {
      const b = bolts[i];
      if ((b.life += dt) > b.max) { bolts.splice(i, 1); continue; }
      g.globalAlpha = Math.random() < 0.25 ? 0.35 : 1 - b.life / b.max; // flicker
      for (const [w, col] of BOLT_PASSES) {
        g.strokeStyle = col;
        b.paths.forEach((path, j) => { g.lineWidth = j ? w * 0.45 : w; g.beginPath(); path.forEach(([x, y], q) => (q ? g.lineTo(x, y) : g.moveTo(x, y))); g.stroke(); });
      }
    }
    if (flash > 0) { g.globalAlpha = flash; g.fillStyle = '#e9e0ff'; g.fillRect(0, 0, W, H); flash -= dt * 3.5; }
    return on || fire.length > 0 || bolts.length > 0;
  });
  await wait(10000);
  on = false; removeEventListener('orch:beat', onBeat);
  const t = A.currentTime; chug(t, 50, 2.8); noise(t, 2.2, { type: 'highpass', f: 4000, gain: 0.3 }); // final chord
  bolt(); bolt(); jets();
  main.animate(shake(22), { duration: 500, composite: 'add' });
  setTempo(before); root.classList.remove('egg-rock');
  await wait(1500);
}

// ================= 2. Saturday Night Canon: flick the house lights 4× =================
async function disco() {
  if (RM.matches) return calm('Saturday Night Canon');
  wake(); O.tutti();
  const before = O.bpm, root = document.documentElement;
  setTempo(118); root.classList.add('egg-disco');
  const ball = Object.assign(document.createElement('div'), { className: 'egg-ball', innerHTML: '<i></i><b></b>' });
  document.body.append(ball);
  const sphere = ball.lastChild;
  ball.animate([{ transform: 'translateY(-105%)' }, { transform: 'translateY(5%)', offset: 0.7 }, { transform: 'translateY(-2%)', offset: 0.85 }, { transform: 'none' }], { duration: 1500, easing: 'cubic-bezier(.33,.9,.4,1)' });
  [86, 90, 93, 98].forEach((m, i) => setTimeout(() => O.strike('glockenspiel', m, 0.5, 0.7), 900 + i * 90));
  setTimeout(() => banner(`<b>${letters('Saturday Night')}</b><i>${letters('Canon', 14)}</i>`, 'egg-disco-b', 5000), 700);
  const specks = Array.from({ length: 240 }, () => ({ lon: rnd(0, TAU), lat: rnd(-0.35, 1.05), s: rnd(1.6, 4.2), tw: rnd(0, TAU), h: Math.random() < 0.45 ? pick(HUES) : -1 }));
  let on = true, dark = 0, rot = 0, pulse = 0, hue = 0;
  const onBeat = () => { pulse = 1; noise(A.currentTime + 30 / O.bpm, 0.14, { type: 'highpass', f: 7500, gain: 0.16 }); }; // offbeat open hat
  addEventListener('orch:beat', onBeat);
  draw((dt, now) => {
    dark = on ? Math.min(1, dark + dt * 1.6) : dark - dt * 1.4;
    if (dark <= 0) return false;
    rot += dt * 0.5; pulse *= Math.exp(-dt * 5); hue = (hue + dt * 45) % 360;
    const t = now / 1000, r = sphere.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    g.fillStyle = `rgba(6,2,16,${0.66 * dark})`; g.fillRect(0, 0, W, H); // house lights down
    g.globalCompositeOperation = 'lighter';
    g.fillStyle = `hsla(${hue},90%,55%,${0.16 * pulse * dark})`; g.fillRect(0, 0, W, H); // beat wash
    for (let i = 0; i < 4; i++) { // floor lights sweeping the hall
      const ox = W * [0.04, 0.32, 0.68, 0.96][i], oy = H + 10, a = -Math.PI / 2 + Math.sin(t * 0.9 + i * 1.9) * 0.62, sp = 0.085, L = H * 1.6;
      const gr = g.createLinearGradient(ox, oy, ox + Math.cos(a) * L, oy + Math.sin(a) * L);
      gr.addColorStop(0, `hsla(${(hue + i * 90) % 360},100%,62%,${0.55 * dark})`); gr.addColorStop(1, 'hsla(0,0%,0%,0)');
      g.fillStyle = gr; g.beginPath(); g.moveTo(ox, oy);
      g.lineTo(ox + Math.cos(a - sp) * L, oy + Math.sin(a - sp) * L); g.lineTo(ox + Math.cos(a + sp) * L, oy + Math.sin(a + sp) * L); g.fill();
    }
    for (const s of specks) { // mirror-ball reflections sweeping the walls
      const a = s.lon + rot, c = Math.cos(a);
      if (c < 0.05) continue;
      const x = cx + Math.sin(a) * W * 0.62, y = cy + s.lat * H * 0.9, z = s.s * (0.55 + 0.7 * c);
      g.globalAlpha = c * dark * (0.7 + 0.3 * Math.sin(t * 9 + s.tw));
      g.drawImage(GLOW, x - z * 2.5, y - z * 2.5, z * 5, z * 5);
      g.fillStyle = s.h < 0 ? '#fff' : `hsl(${(s.h + hue) % 360},100%,72%)`;
      g.beginPath(); g.arc(x, y, z * 0.7, 0, TAU); g.fill();
    }
    g.globalAlpha = dark * (0.5 + 0.5 * pulse);
    g.drawImage(GLOW, cx - r.width * 1.5, cy - r.width * 1.5, r.width * 3, r.width * 3);
  });
  await wait(11500);
  on = false; removeEventListener('orch:beat', onBeat);
  ball.animate([{ transform: 'none' }, { transform: 'translateY(-110%)' }], { duration: 900, easing: 'cubic-bezier(.6,0,.8,.3)', fill: 'forwards' }).finished.then(() => ball.remove());
  setTempo(before); root.classList.remove('egg-disco');
  await wait(900);
}

// ================= 3. The title bursts into notes: click it 5× =================
const h1 = $('.masthead h1');
const NOTE_GLYPHS = ['♪', '♫', '♬', '♩', '𝄞', '♭', '♯'];
const PENTA = [74, 76, 78, 81, 83, 86, 88, 90];
function splitTitle() { // one fixed span per letter, exactly over the real letter
  const out = [], range = document.createRange(), walk = document.createTreeWalker(h1, NodeFilter.SHOW_TEXT);
  for (let n; (n = walk.nextNode());) {
    const cs = getComputedStyle(n.parentElement);
    for (let i = 0; i < n.length; i++) {
      if (!n.data[i].trim()) continue;
      range.setStart(n, i); range.setEnd(n, i + 1);
      const r = range.getBoundingClientRect(), el = document.createElement('span');
      el.className = 'egg-glyph'; el.textContent = n.data[i];
      Object.assign(el.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px`, lineHeight: `${r.height}px`,
        fontFamily: cs.fontFamily, fontSize: cs.fontSize, fontWeight: cs.fontWeight, fontStyle: cs.fontStyle, color: cs.color });
      document.body.append(el);
      out.push({ el, ch: n.data[i], color: cs.color, hx: r.left, hy: r.top, w: r.width, h: r.height, x: r.left, y: r.top, rot: 0, sc: 1,
        vx: rnd(-650, 650), vy: rnd(-1300, -500), vr: rnd(-720, 720), hue: pick(HUES), note: pick(NOTE_GLYPHS), bounces: 0 });
    }
  }
  return out;
}
async function burst() {
  if (RM.matches) return calm('♪ ♫ ♬');
  wake();
  const gs = splitTitle(), sparks = [], T1 = 1.6, T2 = 2.7;
  h1.style.visibility = 'hidden';
  tone(A.currentTime, 0.5, 300, { type: 'triangle', f2: 1400, gain: 0.15 });
  let t = 0, landed = 0;
  const spark = (x, y, hue, n, sp) => { for (let i = 0; i < n; i++) { const a = rnd(0, TAU), v = rnd(sp * 0.3, sp); sparks.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0, max: rnd(0.4, 0.9), hue }); } };
  await new Promise((done) => draw((dt) => {
    t += dt;
    const cx = W / 2, cy = H / 2;
    gs.forEach((q, i) => {
      if (t < T1) { // explode: gravity, bouncing off the floor and walls; each hard bounce rings a bell
        q.vy += 2400 * dt; q.x += q.vx * dt; q.y += q.vy * dt; q.rot += q.vr * dt;
        if (q.y + q.h > H && q.vy > 0) {
          q.y = H - q.h;
          if (q.vy > 400 && q.bounces++ < 2) O.strike('glockenspiel', pick(PENTA), 0.4, Math.min(0.55, q.vy / 2600));
          q.vy *= -0.62; q.vx *= 0.85; q.vr *= 0.7;
        }
        if (q.x < 0 || q.x + q.w > W) { q.vx *= -0.8; q.x = Math.max(0, Math.min(W - q.w, q.x)); }
        if (!q.morphed && t > 0.18) { q.morphed = true; q.el.textContent = q.note; q.el.style.color = `hsl(${q.hue} 80% 58%)`; q.el.style.textShadow = `0 0 18px hsl(${q.hue} 90% 60%)`; q.sc = 1.7; }
        q.sc += (1.15 - q.sc) * Math.min(1, dt * 6);
      } else if (t < T2) { // vortex around the centre of the screen
        if (q.a0 == null) { q.a0 = Math.atan2(q.y + q.h / 2 - cy, q.x + q.w / 2 - cx); q.r0 = Math.hypot(q.x + q.w / 2 - cx, q.y + q.h / 2 - cy); }
        const u = (t - T1) / (T2 - T1), a = q.a0 + easeIn(u) * TAU * 1.6 + u * TAU * 0.5, rr = q.r0 + (50 + i * 7 - q.r0) * easeOut(u);
        q.x = cx + Math.cos(a) * rr - q.w / 2; q.y = cy + Math.sin(a) * rr - q.h / 2; q.rot += dt * 540;
      } else { // home, staggered, with an overshoot; each landing plays the next harp note
        const u = clamp01((t - T2 - i * 0.04) / 0.75);
        if (q.fx == null) { q.fx = q.x; q.fy = q.y; q.frot = q.rot % 360; }
        if (u > 0.45 && !q.back) { q.back = true; q.el.textContent = q.ch; q.el.style.color = q.color; q.el.style.textShadow = ''; }
        const e = backOut(u);
        q.x = q.fx + (q.hx - q.fx) * e; q.y = q.fy + (q.hy - q.fy) * e; q.rot = q.frot * (1 - easeOut(u)); q.sc = 1 + 0.15 * (1 - u);
        if (u >= 1 && !q.home) { q.home = true; landed++; spark(q.hx + q.w / 2, q.hy + q.h / 2, q.hue, 14, 260); O.strike('harp', [62, 66, 69, 74, 78, 81, 86, 90][i % 8] + 12 * Math.floor(i / 8), 1.5, 0.6); }
      }
      if (t < T2 && Math.random() < 0.6) spark(q.x + q.w / 2, q.y + q.h / 2, q.hue, 1, 40);
      q.el.style.transform = `translate(${q.x - q.hx}px, ${q.y - q.hy}px) rotate(${q.rot}deg) scale(${q.sc})`;
    });
    g.globalCompositeOperation = 'lighter';
    for (let i = sparks.length; i--;) {
      const p = sparks[i], k = (p.life += dt) / p.max;
      if (k >= 1) { sparks.splice(i, 1); continue; }
      p.vx *= 1 - 2 * dt; p.vy *= 1 - 2 * dt; p.x += p.vx * dt; p.y += p.vy * dt;
      g.globalAlpha = 1 - k; g.fillStyle = `hsl(${p.hue},100%,70%)`;
      g.drawImage(GLOW, p.x - 8, p.y - 8, 16, 16); g.beginPath(); g.arc(p.x, p.y, 1.8, 0, TAU); g.fill();
    }
    if (landed === gs.length && !sparks.length) { done(); return false; }
  }));
  h1.style.visibility = '';
  gs.forEach((q) => q.el.remove());
}
let taps = [];
h1.addEventListener('click', () => {
  if (busy) return;
  const now = performance.now();
  taps = taps.filter((t) => now - t < 2500).concat(now);
  O.strike('harp', [62, 66, 69, 74, 78][taps.length - 1] ?? 78, 1, 0.7);
  if (!RM.matches) h1.animate([{ transform: `scale(${1 + taps.length * 0.025}) rotate(${(taps.length % 2 ? -1 : 1) * taps.length * 0.6}deg)` }, { transform: 'none' }], { duration: 320, easing: 'cubic-bezier(.2,1.6,.4,1)' });
  if (taps.length >= 5) { taps = []; show(burst); }
});

// ================= 4. Standing ovation: type BRAVO =================
let ROSE;
function applause(len) {
  const t0 = A.currentTime;
  noise(t0, len, { type: 'bandpass', f: 1100, q: 0.4, gain: 0.07, attack: 0.4 }); // the crowd
  for (let t = 0; t < len;) {
    const rate = 85 * Math.min(1, t / 0.35 + 0.1) * Math.min(1, (len - t) / (len * 0.45));
    t += -Math.log(1 - Math.random()) / Math.max(rate, 4);
    noise(t0 + t, rnd(0.02, 0.05), { type: 'bandpass', f: rnd(900, 2800), q: rnd(0.8, 1.8), gain: rnd(0.12, 0.35) });
  }
  tone(t0 + 1, 0.2, 1300, { f2: 2700, gain: 0.05 }); tone(t0 + 1.35, 0.15, 1400, { f2: 2800, gain: 0.05 }); tone(t0 + 1.5, 0.4, 2800, { f2: 1000, gain: 0.05 }); // wolf whistle
}
async function bravo() {
  if (RM.matches) return calm('Bravo!');
  wake(); toStage();
  ROSE ||= emoji('🌹', 64);
  banner(`<b>${letters('Bravo!')}</b>`, 'egg-bravo-b', 4300);
  applause(5);
  const conf = [], roses = [], pops = [], GR = 1400, END = 5.6;
  const COLORS = ['#f2d99c', '#d6b26c', '#fff6dc', '#b8384a', '#8c1d2e', ...HUES.map((h) => `hsl(${h} 72% 56%)`)];
  const cannon = (left) => {
    const t = A.currentTime; noise(t, 0.3, { type: 'lowpass', f: 2400, f2: 200, gain: 0.5 }); tone(t, 0.25, 150, { f2: 45, gain: 0.5 });
    const sc = Math.sqrt(H / 800);
    for (let i = 0; i < 170; i++) {
      const a = (rnd(52, 82) * Math.PI) / 180, sp = rnd(700, 1600) * sc;
      conf.push({ x: left ? -10 : W + 10, y: H + 10, vx: (left ? 1 : -1) * Math.cos(a) * sp, vy: -Math.sin(a) * sp, w: rnd(6, 11), h: rnd(10, 18),
        rot: rnd(0, TAU), vr: rnd(-10, 10), f: rnd(0, TAU), vf: rnd(5, 14), c: pick(COLORS), round: Math.random() < 0.2 });
    }
  };
  cannon(true); cannon(false);
  setTimeout(() => { cannon(true); cannon(false); }, 750);
  const aim = (r) => { // roses land on the stage (or the bottom of the screen if it's scrolled away); aimed at launch, after toStage's scroll
    const pr = $('.proscenium').getBoundingClientRect();
    const lt = Math.max(H * 0.45, Math.min(pr.top + pr.height * 0.55, H - 120)), lb = Math.max(lt + 20, Math.min(pr.bottom - 30, H - 40));
    const tx = rnd(Math.max(20, pr.left + 40), Math.min(W - 20, pr.right - 40)), ty = rnd(lt, lb);
    r.vx = (tx - r.x0) / r.T; r.vy = (ty - r.y0 - 0.5 * GR * r.T * r.T) / r.T;
  };
  for (let i = 0; i < 14; i++) { const x0 = rnd(W * 0.1, W * 0.9); roses.push({ at: 0.6 + i * 0.12, T: rnd(0.8, 1.15), x0, y0: H + 40, x: x0, y: H + 40, rot: rnd(-1, 1), vr: rnd(-9, 9), age: 0 }); }
  let t = 0;
  await new Promise((done) => draw((dt) => {
    t += dt;
    if (t < 3.8 && Math.random() < dt * 16) pops.push({ x: rnd(0, W), y: rnd(H * 0.45, H), life: 0, s: 70 });
    g.globalCompositeOperation = 'lighter'; // camera flashes in the audience
    for (let i = pops.length; i--;) {
      const p = pops[i], k = (p.life += dt) / 0.18;
      if (k >= 1) { pops.splice(i, 1); continue; }
      const s = p.s * (1 - k * 0.5);
      g.globalAlpha = 1 - k; g.drawImage(GLOW, p.x - s / 2, p.y - s / 2, s, s);
      g.fillStyle = '#fff'; g.fillRect(p.x - s * 0.6, p.y - 0.75, s * 1.2, 1.5); g.fillRect(p.x - 0.75, p.y - s * 0.6, 1.5, s * 1.2);
    }
    g.globalCompositeOperation = 'source-over';
    const fade = clamp01((END - t) / 0.6);
    for (const r of roses) {
      if (t < r.at) continue;
      if (r.vx == null) aim(r);
      if (!r.landed) {
        r.age += dt; const a = Math.min(r.age, r.T);
        r.x = r.x0 + r.vx * a; r.y = r.y0 + r.vy * a + 0.5 * GR * a * a; r.rot += r.vr * dt;
        if (r.age >= r.T) { r.landed = true; pops.push({ x: r.x, y: r.y, life: 0.05, s: 30 }); }
      }
      g.globalAlpha = fade; g.translate(r.x, r.y); g.rotate(r.rot); g.drawImage(ROSE, -21, -21, 42, 42); g.setTransform(D, 0, 0, D, 0, 0);
    }
    g.globalAlpha = 1;
    for (let i = conf.length; i--;) { // confetti: drag + flutter (a 2D flip faked by squashing one axis)
      const p = conf[i];
      p.vy += 980 * dt; p.vx *= 1 - 1.6 * dt; p.vy *= 1 - 2.2 * dt; p.f += p.vf * dt; p.rot += p.vr * dt;
      p.x += (p.vx + Math.sin(p.f * 0.7) * 50) * dt; p.y += p.vy * dt;
      if (p.y > H + 30) { conf.splice(i, 1); continue; }
      const c = Math.cos(p.rot), s = Math.sin(p.rot), fl = Math.cos(p.f);
      g.setTransform(D * c, D * s, -D * s * fl, D * c * fl, D * p.x, D * p.y);
      g.fillStyle = p.c;
      if (p.round) { g.beginPath(); g.arc(0, 0, p.w * 0.45, 0, TAU); g.fill(); } else g.fillRect(-p.w / 2, -p.h / 4, p.w, p.h / 2);
    }
    g.setTransform(D, 0, 0, D, 0, 0);
    if (t > END) { done(); return false; }
  }));
}

// keyboard: watch the last few keys (capture phase, after keys.js, never preventDefault)
const KONAMI = ' ArrowUp ArrowUp ArrowDown ArrowDown ArrowLeft ArrowRight ArrowLeft ArrowRight KeyB KeyA';
const BRAVO = ' KeyB KeyR KeyA KeyV KeyO';
let typed = '';
addEventListener('keydown', (e) => {
  if (e.repeat || e.ctrlKey || e.metaKey || e.altKey || e.target?.matches?.('input:not([type=range]), textarea, select, [contenteditable]')) return;
  typed = `${typed} ${e.code || (e.key?.length === 1 ? `Key${e.key.toUpperCase()}` : e.key)}`.slice(-120);
  if (typed.endsWith(KONAMI)) { typed = ''; show(rock); } else if (typed.endsWith(BRAVO)) { typed = ''; show(bravo); }
}, true);

// house lights: 4 flicks within 3 s
let flicks = [];
addEventListener('orch:theme', () => {
  const now = performance.now();
  flicks = flicks.filter((t) => now - t < 3000).concat(now);
  if (flicks.length >= 4) { flicks = []; show(disco); }
});

// ================= 5. Stop ALL: hold "Stop all" for 1.5 s =================
const stopBtn = $('#stop');
let charging = 0;
const endCharge = () => { cancelAnimationFrame(charging); stopBtn.classList.remove('egg-charge'); stopBtn.style.removeProperty('--k'); };
stopBtn.addEventListener('pointerdown', (e) => {
  if (busy || e.button) return;
  const t0 = performance.now();
  stopBtn.classList.add('egg-charge');
  const step = (now) => {
    const k = Math.min(1, (now - t0) / 1500);
    stopBtn.style.setProperty('--k', k.toFixed(3));
    if (k < 1) charging = requestAnimationFrame(step); else { endCharge(); show(blackHole); }
  };
  charging = requestAnimationFrame(step);
});
for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) stopBtn.addEventListener(ev, endCharge);

async function blackHole() {
  O.stopAll();
  if (RM.matches) return calm('Stop… <i>everything</i>.');
  wake();
  const cx = W / 2, cy = H / 2, R = Math.min(W, H) * 0.085, BANG = 3.6, maxD = Math.hypot(cx, cy);
  const pieces = [...document.querySelectorAll('.masthead h1, .work, .sub, .transport-main, .tempo, .timeline, #stage-wrap, .program-head, .family h3, .strip, .pg-head, .pg-work, .mp, .k-hud, .sb, .orch-theme, .th-toggle')]
    .filter(visible).map((el) => ({ el, r: el.getBoundingClientRect() }));
  for (const p of pieces) { // each piece spirals into the hole; the nearest go first
    const ex = p.r.left + p.r.width / 2, ey = p.r.top + p.r.height / 2;
    p.dx = cx - ex; p.dy = cy - ey; p.spin = rnd(240, 720);
    const a0 = Math.atan2(-p.dy, -p.dx), d0 = Math.hypot(p.dx, p.dy), turns = rnd(0.7, 1.3) * TAU, kf = [];
    for (let k = 0; k <= 16; k++) {
      const q = k / 16, a = a0 + turns * q, d = d0 * (1 - q) ** 1.4;
      kf.push({ transform: `translate(${cx + Math.cos(a) * d - ex}px, ${cy + Math.sin(a) * d - ey}px) rotate(${q * p.spin}deg) scale(${Math.max(0.001, (1 - q) ** 1.6)})` });
    }
    p.anim = p.el.animate(kf, { duration: rnd(1300, 1800), delay: (d0 / maxD) * 500 + rnd(0, 200), easing: 'cubic-bezier(.5,0,.9,.6)', fill: 'forwards', composite: 'add' });
  }
  const disk = Array.from({ length: 650 }, () => { const r = rnd(1.25, 4.4); return { r, a: rnd(0, TAU), w: rnd(0.8, 2.2), hue: rnd(18, 48), l: 92 - (r - 1.25) * 10 }; });
  const debris = [], blast = [];
  let t = 0, banged = false, flash = 0;
  const T = A.currentTime;
  tone(T, 2.8, 520, { f2: 32, gain: 0.3 }); tone(T, 3.2, 60, { type: 'triangle', f2: 28, gain: 0.45, attack: 1.4 }); noise(T, 3.1, { type: 'lowpass', f: 400, f2: 50, gain: 0.4, attack: 1.2 });
  setTimeout(() => banner('You said stop <i>all</i>.', 'egg-void-b', 1100), 2850); // in the dark, after the collapse
  const drawDisk = (front, rad) => {
    g.save(); g.translate(cx, cy); g.rotate(-0.3); g.scale(1, 0.3);
    for (const p of disk) {
      if (Math.sin(p.a) > 0 !== front) continue;
      g.strokeStyle = `hsla(${p.hue},100%,${p.l}%,.85)`; g.lineWidth = p.w * 2.4;
      g.beginPath(); g.arc(0, 0, p.r * rad, p.a - 0.22, p.a); g.stroke();
    }
    g.restore();
  };
  const bang = () => {
    flash = 1;
    const t0 = A.currentTime;
    noise(t0, 2.4, { type: 'lowpass', f: 9000, f2: 70, gain: 1 }); tone(t0, 1.5, 120, { f2: 30, gain: 0.9 });
    [86, 90, 93, 98].forEach((m, i) => setTimeout(() => O.strike('glockenspiel', m, 1, 0.6), 250 + i * 70));
    for (let i = 0; i < 520; i++) { const a = rnd(0, TAU), sp = rnd(120, 1700); blast.push({ x: cx, y: cy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0, max: rnd(0.8, 1.9), hue: pick(HUES), w: rnd(1, 3) }); }
    for (const p of pieces) {
      p.anim.cancel();
      p.el.animate([{ transform: `translate(${p.dx}px, ${p.dy}px) rotate(${-p.spin}deg) scale(0.001)` }, { transform: 'translate(0px, 0px) rotate(0deg) scale(1)' }],
        { duration: rnd(900, 1300), delay: rnd(0, 160), easing: 'cubic-bezier(.16,1.5,.4,1)', composite: 'add', fill: 'backwards' });
    }
    setTimeout(() => O.tutti(), 500); // the universe restarts with the music
  };
  await new Promise((done) => draw((dt) => {
    t += dt;
    if (!banged && t >= BANG) { banged = true; bang(); }
    const col = clamp01((t - 2.4) / 0.6), rad = R * easeOut(clamp01(t / 0.9)) * (1 - easeIn(col));
    const dark = banged ? 1 - clamp01((t - BANG) / 0.8) : Math.min(1, t / 2.2);
    g.fillStyle = `rgba(2,0,7,${0.97 * dark})`; g.fillRect(0, 0, W, H);
    g.globalCompositeOperation = 'lighter';
    if (!banged) {
      if (t < 2.3) for (let i = 0; i < 5; i++) debris.push({ d: maxD * rnd(0.9, 1.15), a: rnd(0, TAU), hue: pick([200, 220, 40, 0]) });
      g.lineWidth = 1.4;
      for (let i = debris.length; i--;) { // stars torn off the edges, spiralling in
        const p = debris[i], vr = 150 + 6e4 / p.d, w = 0.4 + 220 / p.d;
        p.d -= vr * dt; p.a += w * dt;
        if (p.d < Math.max(rad, 4) || t > 3) { debris.splice(i, 1); continue; }
        const bd = p.d + vr * 0.05, ba = p.a - w * 0.05;
        g.strokeStyle = `hsla(${p.hue},80%,80%,.8)`; g.beginPath();
        g.moveTo(cx + Math.cos(ba) * bd, cy + Math.sin(ba) * bd); g.lineTo(cx + Math.cos(p.a) * p.d, cy + Math.sin(p.a) * p.d); g.stroke();
      }
      for (const p of disk) p.a += (dt * 4) / p.r ** 1.5;
      if (rad > 0.5) {
        drawDisk(false, rad);
        const gl = g.createRadialGradient(cx, cy, rad * 0.8, cx, cy, rad * 3);
        gl.addColorStop(0, 'rgba(255,170,90,.5)'); gl.addColorStop(1, 'rgba(255,120,40,0)');
        g.fillStyle = gl; g.beginPath(); g.arc(cx, cy, rad * 3, 0, TAU); g.fill();
        g.globalCompositeOperation = 'source-over'; g.fillStyle = '#000'; g.beginPath(); g.arc(cx, cy, rad, 0, TAU); g.fill();
        g.globalCompositeOperation = 'lighter';
        g.strokeStyle = 'rgba(255,225,180,.9)'; g.lineWidth = 2; g.beginPath(); g.arc(cx, cy, rad * 1.04, 0, TAU); g.stroke(); // photon ring
        g.strokeStyle = 'rgba(255,170,90,.28)'; g.lineWidth = rad * 0.22; g.beginPath(); g.arc(cx, cy, rad * 1.32, 0, TAU); g.stroke(); // lensed far side
        drawDisk(true, rad);
      } else if (t > 2.9) { const s = 8 + 6 * Math.sin(t * 40); g.drawImage(GLOW, cx - s, cy - s, s * 2, s * 2); } // the singularity
    } else {
      const u = t - BANG;
      for (let k = 0; k < 3; k++) { // shockwaves
        const lw = 36 * (1 - u / 1.3) * (1 - k * 0.25);
        if (lw <= 0) continue;
        g.strokeStyle = `hsla(${30 + k * 160},100%,${85 - k * 10}%,${1 - u / 1.3})`; g.lineWidth = lw;
        g.beginPath(); g.arc(cx, cy, u * (2000 - k * 520), 0, TAU); g.stroke();
      }
      for (let i = blast.length; i--;) {
        const p = blast[i], k = (p.life += dt) / p.max;
        if (k >= 1) { blast.splice(i, 1); continue; }
        p.vx *= 1 - 1.4 * dt; p.vy *= 1 - 1.4 * dt; p.x += p.vx * dt; p.y += p.vy * dt;
        g.strokeStyle = `hsla(${p.hue},100%,70%,${1 - k})`; g.lineWidth = p.w;
        g.beginPath(); g.moveTo(p.x - p.vx * 0.04, p.y - p.vy * 0.04); g.lineTo(p.x, p.y); g.stroke();
      }
      if (flash > 0) { g.globalAlpha = flash; g.fillStyle = '#fff'; g.fillRect(0, 0, W, H); flash -= dt * 1.4; }
      if (u > 2.2 && !blast.length) { done(); return false; }
    }
  }));
}

// ================= 6. Largo molto: tempo on the floor melts the page =================
let meltTimer = 0, unmelt = null;
addEventListener('orch:tempo', (e) => {
  clearTimeout(meltTimer);
  if ((e.detail?.bpm ?? O.bpm) <= +bpmIn.min) meltTimer = setTimeout(() => show(melt), 700);
  else unmelt?.();
});
async function melt() {
  if (O.bpm > +bpmIn.min) return;
  if (RM.matches) return calm('Largo… <i>molto</i> largo');
  wake();
  const els = [...document.querySelectorAll('.top, .mp, .pg, .proscenium, .program-head, .family, .k-hud, .sb')].filter(visible);
  els.forEach((el) => (el.style.filter = 'url(#egg-melt)'));
  banner(`<b>${letters('Largo… molto largo')}</b>`, 'egg-melt-b', 4800);
  const T = A.currentTime; tone(T, 2.6, 392, { type: 'triangle', f2: 46, gain: 0.22 }); tone(T + 0.15, 2.8, 196, { type: 'sawtooth', f2: 40, gain: 0.06 }); // tape stop
  const drips = [], drops = [], S = 240;
  for (const el of [...document.querySelectorAll('.top, .pg-work, .proscenium, .strip')].filter(visible)) {
    const r = el.getBoundingClientRect(), hue = getComputedStyle(el).getPropertyValue('--hue').trim();
    const col = hue ? `hsl(${hue} 62% 42%)` : pick([tok('--accent'), tok('--velvet'), tok('--accent-hi')]);
    for (let i = 0, n = Math.max(1, Math.round(r.width / 140)); i < n; i++) {
      drips.push({ x: rnd(r.left + 12, r.right - 12), y: Math.min(r.bottom, H - 20), len: 0, max: rnd(40, 170), w: rnd(5, 13), sp: rnd(25, 80), at: rnd(0.2, 2.6), col });
    }
  }
  let k = 0, k0 = 0, t = 0, out = -1;
  unmelt = () => { if (out < 0) { out = 0; k0 = k; const s = A.currentTime; tone(s, 0.45, 150, { f2: 600, gain: 0.3 }); tone(s + 0.12, 0.35, 300, { f2: 900, gain: 0.15 }); } }; // boing
  const auto = setTimeout(() => setTempo(84), 7000);
  await new Promise((done) => draw((dt) => {
    t += dt;
    if (out < 0) k = Math.min(1, k + dt / 3.2);
    else { out += dt; k = k0 * Math.exp(-5 * out) * Math.cos(15 * out); } // springs back past zero: a boing upward
    disp.setAttribute('scale', (k * S).toFixed(1));
    const sag = Math.max(0, k) * S * 0.28;
    g.lineCap = 'round';
    for (const d of drips) {
      if (t < d.at) continue;
      if (out < 0) { d.len += d.sp * dt * (0.4 + k); if (d.len > d.max) { drops.push({ x: d.x, y: d.y + sag + d.len, vy: 60, r: d.w * 0.55, col: d.col }); d.len = d.max * 0.6; } } else d.len *= Math.exp(-9 * dt);
      if (d.len < 0.5) continue;
      const y = d.y + sag;
      g.strokeStyle = g.fillStyle = d.col; g.lineWidth = d.w;
      g.beginPath(); g.moveTo(d.x, y - 3); g.lineTo(d.x, y + d.len); g.stroke();
      g.beginPath(); g.arc(d.x, y + d.len, d.w * 0.72, 0, TAU); g.fill();
      g.strokeStyle = 'rgba(255,255,255,.35)'; g.lineWidth = Math.max(1, d.w * 0.18);
      g.beginPath(); g.moveTo(d.x - d.w * 0.2, y); g.lineTo(d.x - d.w * 0.2, y + d.len - d.w * 0.3); g.stroke();
    }
    for (let i = drops.length; i--;) {
      const p = drops[i]; p.vy += 1600 * dt; p.y += p.vy * dt;
      if (p.y > H + 20) { drops.splice(i, 1); continue; }
      g.fillStyle = p.col; g.beginPath(); g.ellipse(p.x, p.y, p.r * 0.8, p.r * (1 + p.vy / 900), 0, 0, TAU); g.fill();
    }
    if (out > 1.2) { done(); return false; }
  }));
  clearTimeout(auto); unmelt = null;
  els.forEach((el) => (el.style.filter = ''));
  disp.setAttribute('scale', 0);
}

// ---------- manual controls under the keyboard HUD ----------
const bar = $('.k-hud .k-bar');
if (bar) {
  const row = Object.assign(document.createElement('div'), { className: 'egg-row' });
  row.setAttribute('role', 'group'); row.setAttribute('aria-label', 'Easter eggs');
  for (const [label, secret, run] of [
    ['Rock', '↑ ↑ ↓ ↓ ← → ← → B A', () => show(rock)],
    ['Disco', 'flick the house lights 4× fast', () => show(disco)],
    ['Notes', 'click the title 5×', () => show(burst)],
    ['Bravo', 'type BRAVO', () => show(bravo)],
    ['Black hole', 'hold Stop all for 1.5 s', () => show(blackHole)],
    ['Melt', 'drag the tempo all the way down', () => setTempo(+bpmIn.min)], // the tempo trigger does the rest
  ]) {
    const b = Object.assign(document.createElement('button'), { type: 'button', textContent: label, title: `Secret: ${secret}` });
    b.addEventListener('click', () => { b.blur(); run(); });
    row.append(b);
  }
  bar.after(row);
}

console.log('%cPocket Orchestra%c\nSix secrets are hidden in this hall. The classic code still works, the lights have a switch, and applause is always welcome.',
  'font: italic 700 22px Georgia, serif; color: #c99a3e', 'font: 12px system-ui, sans-serif');
