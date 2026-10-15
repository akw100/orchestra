// Theater mode ("Stage view"): the stage leaves the page and fills the viewport, house lights go down,
// and a proscenium with velvet curtains, a swagged valance, follow-spots and footlights frames the canvas.
// Curtains open when theater mode opens or music starts, and close (with a curtain call) when it stops.
// Exports toggleTheater(on?) and dispatches window 'orch:theater' {on}.
import { analyser, seats, tutti, stopAll } from './audio.js';
import * as audio from './audio.js';

const RM = matchMedia('(prefers-reduced-motion: reduce)');
const reduced = () => RM.matches;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const rand = (a, b) => a + Math.random() * (b - a);

const ICON = {
  curtain: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.5 3.5h19"/><path d="M4 3.5v17c2.6-1.2 4.4-5 5.2-10.4.3-2 .4-4 .3-6.6"/><path d="M20 3.5v17c-2.6-1.2-4.4-5-5.2-10.4-.3-2-.4-4-.3-6.6"/><path d="M2.5 20.5h19"/></svg>',
  play: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4.5 2.6v10.8L13 8z" fill="currentColor"/></svg>',
  stop: '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="3.5" y="3.5" width="9" height="9" rx="1.2" fill="currentColor"/></svg>',
  exit: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8"/></svg>',
  moon: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M13.6 9.8A5.8 5.8 0 0 1 6.2 2.4a5.8 5.8 0 1 0 7.4 7.4z" fill="currentColor"/></svg>',
  sun: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true"><circle cx="8" cy="8" r="3" fill="currentColor" stroke="none"/><path d="M8 1v1.6M8 13.4V15M1 8h1.6M13.4 8H15M3 3l1.1 1.1M11.9 11.9L13 13M3 13l1.1-1.1M11.9 4.1L13 3"/></svg>',
};

const CREST = `<svg class="th-crest" viewBox="0 0 120 92" aria-hidden="true">
  <defs><linearGradient id="th-gilt" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#fff2c4"/><stop offset=".38" stop-color="#dcaa48"/><stop offset=".72" stop-color="#8a5d18"/><stop offset="1" stop-color="#f0cf7a"/>
  </linearGradient></defs>
  <path d="M10 50c-7-14 6-24 16-14M110 50c7-14-6-24-16-14" stroke="url(#th-gilt)" stroke-width="5" fill="none" stroke-linecap="round"/>
  <path d="M18 60c-6 2-9 8-5 12M102 60c6 2 9 8 5 12" stroke="url(#th-gilt)" stroke-width="3.5" fill="none" stroke-linecap="round"/>
  <path d="M60 1l7 11H53z" fill="url(#th-gilt)"/>
  <ellipse cx="60" cy="47" rx="35" ry="33" fill="url(#th-gilt)"/>
  <ellipse cx="60" cy="47" rx="28.5" ry="26.5" style="fill: var(--th-velvet)"/>
  <ellipse cx="60" cy="47" rx="25" ry="23" fill="none" stroke="url(#th-gilt)" stroke-width="1"/>
  <text x="60" y="56" text-anchor="middle" font-size="25" fill="url(#th-gilt)">PO</text>
  <path d="M30 80q30 16 60 0" stroke="url(#th-gilt)" stroke-width="4" fill="none" stroke-linecap="round"/>
</svg>`;

let wrap, deco, bar, toggleBtn, house, placeholder, prevFocus, exitAnim;
let panels = [], ties = [], beams = [], lamps = [], lampLv = [];
let on = false, curtainOpen = false, playing = false, seq = 0, raf = 0, lvl = 0, lastBeat = 0, idleTimer = 0, barTimer = 0;
const inerted = [];

// ---------- mount ----------
function mount() {
  wrap = document.getElementById('stage-wrap');
  if (!wrap) return;

  deco = document.createElement('div');
  deco.className = 'th';
  deco.setAttribute('aria-hidden', 'true');
  deco.innerHTML = `
    <div class="th-vignette"></div>
    <div class="th-stagebox th-beams">${[22, 50, 78].map((x) => `<div class="th-beam" style="--x:${x}%"><div class="th-pool"></div></div>`).join('')}</div>
    <div class="th-curtain th-l"><div class="th-fabric"></div></div>
    <div class="th-curtain th-r"><div class="th-fabric"></div></div>
    <div class="th-tie th-tie-l"></div><div class="th-tie th-tie-r"></div>
    <div class="th-seam"></div>
    <div class="th-callspot"><p>Press <b>Tutti</b> to open the curtain</p></div>
    <div class="th-petals"></div>
    <div class="th-valance"><div class="th-tassels"></div><div class="th-fringe th-swag-mask"></div><div class="th-swags th-swag-mask"></div></div>
    <div class="th-footwash"></div>
    <div class="th-frame"><div class="th-opening"></div>${CREST}</div>
    <div class="th-lip"><div class="th-lamps"></div></div>`;
  wrap.append(deco);

  bar = document.createElement('div');
  bar.className = 'th-bar';
  bar.setAttribute('role', 'toolbar');
  bar.setAttribute('aria-label', 'Stage view controls');
  bar.tabIndex = -1;
  bar.innerHTML = `
    <button type="button" class="th-b-tutti" aria-label="Tutti: every player starts looping">${ICON.play}<span>Tutti</span></button>
    <button type="button" class="th-b-stop" aria-label="Stop all players">${ICON.stop}<span>Stop all</span></button>
    <button type="button" class="th-b-theme" hidden aria-label="Switch light or dark"></button>
    <button type="button" class="th-b-exit" aria-label="Leave stage view (Esc)">${ICON.exit}<span>Leave</span><kbd>Esc</kbd></button>`;
  wrap.append(bar);

  toggleBtn = document.createElement('button');
  toggleBtn.type = 'button';
  toggleBtn.className = 'th-toggle';
  toggleBtn.setAttribute('aria-label', 'Stage view: watch the orchestra full screen, curtains and all');
  toggleBtn.innerHTML = `${ICON.curtain}<span>Stage view</span>`;
  wrap.append(toggleBtn);

  house = document.createElement('div');
  house.className = 'th-house';
  document.body.append(house);

  panels = [...deco.querySelectorAll('.th-curtain')];
  ties = [...deco.querySelectorAll('.th-tie')];
  beams = [...deco.querySelectorAll('.th-beam')];

  toggleBtn.addEventListener('click', () => toggleTheater(true));
  bar.querySelector('.th-b-tutti').addEventListener('click', () => tutti());
  bar.querySelector('.th-b-stop').addEventListener('click', () => stopAll());
  bar.querySelector('.th-b-exit').addEventListener('click', () => toggleTheater(false));
  panels.forEach((p) => p.addEventListener('click', () => { if (!curtainOpen) openCurtains(); }));
  wrap.addEventListener('pointermove', wakeBar);
  bar.addEventListener('focusin', wakeBar);

  setCurtainsInstant(false);
  hookTheme();
}

// theme switch in the mini-transport, only when theme.js is part of the page (no 404 otherwise)
function hookTheme() {
  if (!document.querySelector('script[src*="theme.js"]')) return;
  import('./theme.js').then((m) => {
    if (typeof m.toggleTheme !== 'function') return;
    const b = bar.querySelector('.th-b-theme');
    const paint = () => {
      const dark = (m.getTheme?.() ?? document.documentElement.dataset.theme) === 'dark';
      b.innerHTML = `${dark ? ICON.sun : ICON.moon}<span>${dark ? 'Matinee' : 'Evening'}</span>`;
      b.setAttribute('aria-label', dark ? 'Switch to the light matinee look' : 'Switch to the dark evening look');
    };
    b.hidden = false; paint();
    b.addEventListener('click', () => m.toggleTheme());
    addEventListener('orch:theme', paint);
  }).catch(() => {});
}

function wakeBar() {
  if (!on) return;
  bar.classList.remove('is-idle');
  clearTimeout(barTimer);
  barTimer = setTimeout(() => bar.classList.add('is-idle'), 2600);
}

// ---------- geometry ----------
function layout() {
  const box = deco.querySelector('.th-stagebox').getBoundingClientRect();
  const panelW = box.width / 2 + 14;
  const gathered = Math.min(170, Math.max(38, box.width * 0.085));
  deco.style.setProperty('--gather', (gathered / panelW).toFixed(3));

  // footlights: one lamp per ~64px, bass in the middle, treble at the wings
  const n = Math.max(5, Math.min(22, Math.round(box.width / 64)));
  const row = deco.querySelector('.th-lamps');
  if (lamps.length !== n) {
    row.innerHTML = '<i class="th-lamp"></i>'.repeat(n);
    lamps = [...row.children];
    lampLv = lamps.map(() => 0);
  }

  // dust motes, scattered inside each cone (the beam's mask clips them to the light)
  const aspect = box.height / Math.max(1, box.width);
  beams.forEach((b) => {
    b.querySelectorAll('i').forEach((m) => m.remove());
    const count = reduced() ? 0 : 14;
    for (let k = 0; k < count; k++) {
      const f = rand(0.2, 0.7), spread = 100 * f * 1.4 * aspect * Math.tan((11 * Math.PI) / 180);
      const m = document.createElement('i');
      m.style.cssText = `--mx:${(50 + rand(-1, 1) * spread).toFixed(1)}%;--my:${(f * 100).toFixed(1)}%;--ms:${rand(1.2, 3).toFixed(1)}px;--md:${rand(7, 14).toFixed(1)}s;--mdel:${rand(-14, 0).toFixed(1)}s;--mdx:${rand(-22, 22).toFixed(0)}px`;
      b.append(m);
    }
  });
}

// ---------- curtains ----------
// Left panel outline, inner edge at x=100%; open = pinched at the tieback (58%) and flared at the floor.
function shape(side, k) {
  const pts = [];
  for (let y = 0; y <= 100; y += 5) {
    // pull toward the tieback at 58%, then let the hem flare back out to the floor
    const p = y <= 58 ? Math.sin((Math.PI / 2) * (y / 58)) ** 2 : Math.cos((Math.PI / 2) * ((y - 58) / 42)) ** 1.6;
    const x = 100 - 52 * k * p;
    pts.push(`${(side === 'l' ? x : 100 - x).toFixed(2)}% ${y}%`);
  }
  return `polygon(${pts.join(', ')}, ${side === 'l' ? '0% 100%, 0% 0%' : '100% 100%, 100% 0%'})`;
}
const sideOf = (p) => (p.classList.contains('th-l') ? 'l' : 'r');
const gather = () => +getComputedStyle(deco).getPropertyValue('--gather') || 0.17;

function stopAnim(el) {
  const a = el._anim;
  if (!a) return;
  try { a.commitStyles(); } catch { /* not rendered: inline style already holds the last state */ }
  a.cancel();
  el._anim = null;
}
function run(el, frames, opts) {
  stopAnim(el);
  el._anim = el.animate(frames, { fill: 'forwards', ...opts });
  return el._anim.finished.catch(() => {});
}
function current(p) {
  const cs = getComputedStyle(p);
  return { transform: cs.transform === 'none' ? 'scaleX(1)' : cs.transform, clipPath: cs.clipPath === 'none' ? shape(sideOf(p), 0) : cs.clipPath };
}

function setCurtainsInstant(open) {
  const g = gather();
  panels.forEach((p) => {
    stopAnim(p);
    p.style.transform = open ? `scaleX(${g})` : 'scaleX(1)';
    p.style.clipPath = shape(sideOf(p), open ? 1 : 0);
    p.style.opacity = '';
  });
  ties.forEach((t) => { stopAnim(t); t.style.opacity = open ? '1' : '0'; t.style.transform = ''; });
  curtainOpen = open;
  deco.classList.toggle('is-closed', !open);
}

async function fadeSwap(open) { // reduced motion: cross-fade instead of a sweep
  await Promise.all(panels.map((p) => run(p, [{ opacity: 1 }, { opacity: 0 }], { duration: 260 })));
  setCurtainsInstant(open);
  panels.forEach((p) => p.style.opacity = '0');
  await Promise.all(panels.map((p) => run(p, [{ opacity: 0 }, { opacity: 1 }], { duration: 380 })));
  panels.forEach((p) => { stopAnim(p); p.style.opacity = ''; });
}

export async function openCurtains() {
  const my = ++seq;
  const fromClosed = !curtainOpen && deco.classList.contains('is-closed');
  curtainOpen = true;
  deco.classList.remove('is-call', 'is-closed');
  if (reduced()) return fadeSwap(true);

  const g = gather(), D = 2600;
  deco.classList.remove('is-shudder'); void deco.offsetWidth; deco.classList.add('is-shudder');
  setTimeout(() => deco.classList.remove('is-shudder'), 950);
  run(deco.querySelector('.th-seam'), [
    { opacity: 0, transform: 'scaleX(0.12)' },
    { opacity: 1, transform: 'scaleX(0.45)', offset: 0.16 },
    { opacity: 0.75, transform: 'scaleX(1.7)', offset: 0.42 },
    { opacity: 0, transform: 'scaleX(3.2)' },
  ], { duration: D, easing: 'ease-out' });

  const done = panels.map((p, i) => {
    const s = sideOf(p), open = shape(s, 1);
    return run(p, [
      { ...current(p), easing: 'cubic-bezier(0.5, 0, 0.7, 0.4)' },
      ...(fromClosed ? [{ offset: 0.1, transform: 'scaleX(0.975)', clipPath: shape(s, 0.05), easing: 'cubic-bezier(0.42, 0, 0.18, 1)' }] : []),
      { offset: 0.74, transform: `scaleX(${(g * 0.9).toFixed(3)})`, clipPath: open, easing: 'cubic-bezier(0.3, 0, 0.4, 1)' },
      { offset: 0.88, transform: `scaleX(${(g * 1.07).toFixed(3)})`, clipPath: open, easing: 'ease-in-out' },
      { transform: `scaleX(${g.toFixed(3)})`, clipPath: open },
    ], { duration: D, delay: i * 110 });
  });
  ties.forEach((t, i) => run(t, [{ opacity: 0, transform: 'scaleX(0.2)' }, { opacity: 1, transform: 'scaleX(1)' }],
    { duration: 520, delay: D * 0.8 + i * 110, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' }));
  await Promise.all(done);
  return my === seq;
}

export async function closeCurtains(curtainCall = false) {
  const my = ++seq;
  curtainOpen = false;
  deco.classList.remove('is-call');
  if (reduced()) {
    await fadeSwap(false);
    if (my === seq && curtainCall) deco.classList.add('is-call');
    return;
  }
  ties.forEach((t) => run(t, [{ opacity: getComputedStyle(t).opacity }, { opacity: 0 }], { duration: 260 }));
  const D = 1900;
  await Promise.all(panels.map((p, i) => {
    const s = sideOf(p), shut = shape(s, 0);
    return run(p, [
      { ...current(p), easing: 'cubic-bezier(0.45, 0, 0.25, 1)' },
      { offset: 0.8, transform: 'scaleX(1.012)', clipPath: shut, easing: 'ease-out' },
      { offset: 0.91, transform: 'scaleX(0.994)', clipPath: shut, easing: 'ease-in-out' },
      { transform: 'scaleX(1)', clipPath: shut },
    ], { duration: D, delay: i * 90 });
  }));
  if (my !== seq) return;
  deco.classList.add('is-closed');
  if (!curtainCall) return;

  // curtain call: the drapes part a hand's width for a bow, then the spot finds the seam and petals fly
  await wait(220);
  if (my !== seq) return;
  const seam = deco.querySelector('.th-seam');
  run(seam, [{ opacity: 0, transform: 'scaleX(0.1)' }, { opacity: 0.85, transform: 'scaleX(0.35)', offset: 0.45 }, { opacity: 0, transform: 'scaleX(0.2)' }], { duration: 1300 });
  await Promise.all(panels.map((p) => run(p, [
    { transform: 'scaleX(1)', easing: 'cubic-bezier(0.16, 1, 0.3, 1)' },
    { offset: 0.4, transform: 'scaleX(0.93)', easing: 'cubic-bezier(0.45, 0, 0.25, 1)' },
    { transform: 'scaleX(1)' },
  ], { duration: 1300 })));
  if (my !== seq) return;
  deco.classList.add('is-call');
  throwPetals();
}

function throwPetals() {
  if (reduced()) return;
  const box = deco.querySelector('.th-petals');
  const colors = ['#b3122e', '#d8314f', '#8e0d24', '#f2a5b4', '#fbe6ea', '#e0b14a'];
  const frag = document.createDocumentFragment();
  for (let k = 0; k < 28; k++) {
    const i = document.createElement('i');
    i.style.cssText = `--px:${rand(18, 82).toFixed(1)}%;--pw:${rand(7, 13).toFixed(1)}px;--pd:${rand(2.8, 4.6).toFixed(2)}s;--pdel:${rand(0, 1.4).toFixed(2)}s;--pdx:${rand(-70, 70).toFixed(0)}px;--pr:${rand(-600, 600).toFixed(0)}deg;--pc:${colors[k % colors.length]}`;
    frag.append(i);
  }
  box.append(frag);
  setTimeout(() => { box.textContent = ''; }, 6800);
}

// ---------- follow-spots ----------
const RANGE = [[-26, 6], [-15, 15], [-6, 26]];
function aimSpot(i, dur) {
  const b = beams[i];
  if (!b || reduced()) return;
  const [lo, hi] = RANGE[i];
  const from = getComputedStyle(b).transform;
  run(b, [{ transform: from === 'none' ? 'rotate(0deg)' : from }, { transform: `rotate(${rand(lo, hi).toFixed(1)}deg)` }],
    { duration: dur, easing: 'cubic-bezier(0.45, 0, 0.2, 1)' });
}
let spotTurn = 0;
function onBeat(e) {
  if (!on) return;
  lastBeat = performance.now();
  if (e.detail.beat % 2) return;
  aimSpot(spotTurn++ % 3, (2 * 60000) / (audio.bpm || 84) * 0.92); // lands on the next beat
}
function idleSpots() {
  if (on && performance.now() - lastBeat > 2500) aimSpot(spotTurn++ % 3, 2600);
}

// ---------- footlights follow the music ----------
const freq = new Uint8Array(analyser.frequencyBinCount);
const wave = new Float32Array(analyser.fftSize);
function tick() {
  if (!on) { raf = 0; return; }
  analyser.getByteFrequencyData(freq);
  analyser.getFloatTimeDomainData(wave);
  let e = 0;
  for (let k = 0; k < wave.length; k += 2) e += wave[k] * wave[k];
  const raw = Math.min(1, Math.sqrt(e / (wave.length / 2)) * 3.2); // full tutti sits around 0.7-0.9
  lvl += (raw - lvl) * (raw > lvl ? 0.35 : 0.05);
  deco.style.setProperty('--lvl', lvl.toFixed(3));

  const n = lamps.length, mid = (n - 1) / 2;
  for (let k = 0; k < n; k++) {
    const d = mid ? Math.abs(k - mid) / mid : 0;
    const b0 = Math.round(3 * Math.pow(40, d)), b1 = Math.max(b0 + 2, Math.round(b0 * 1.5));
    let s = 0;
    for (let j = b0; j < b1; j++) s += freq[j];
    const floor = 112 - 52 * d; // bytes are dB-scaled; the treble wings sit lower, so their floor drops
    const v = Math.min(1, Math.pow(Math.max(0, (s / (b1 - b0) - floor) / (255 - floor)), 1.5) * 1.25);
    lampLv[k] += (v - lampLv[k]) * (v > lampLv[k] ? 0.5 : 0.08);
    lamps[k].style.setProperty('--l', lampLv[k].toFixed(3));
  }
  raf = requestAnimationFrame(tick);
}

// ---------- enter / exit ----------
function setInert(v) {
  if (v) {
    for (const el of document.body.children) {
      if (el === wrap || el === house || el.inert || el.tagName === 'SCRIPT') continue;
      el.inert = true; inerted.push(el);
    }
  } else {
    inerted.splice(0).forEach((el) => (el.inert = false));
  }
}
const nudgeResize = () => requestAnimationFrame(() => dispatchEvent(new Event('resize')));
const emitTheater = () => dispatchEvent(new CustomEvent('orch:theater', { detail: { on } }));

function enter() {
  if (exitAnim) { exitAnim.cancel(); finishExit(); }
  on = true;
  prevFocus = document.activeElement;
  const r = wrap.getBoundingClientRect();
  const cs = getComputedStyle(wrap);
  placeholder = document.createElement('div');
  placeholder.className = 'th-placeholder';
  placeholder.style.cssText = `height:${r.height}px;margin:${cs.margin}`;
  wrap.before(placeholder);
  document.body.append(wrap); // escape any transformed/filtered ancestor so position: fixed means the viewport
  wrap.classList.add('th-on');
  document.documentElement.classList.add('th-active');
  setInert(true);

  layout();
  setCurtainsInstant(false);
  deco.classList.remove('is-call');
  deco.classList.toggle('is-swaying', !reduced());
  playing = seats.some((s) => s.active);
  if (!raf) raf = requestAnimationFrame(tick);
  clearInterval(idleTimer);
  idleTimer = setInterval(idleSpots, 1400);
  nudgeResize();
  emitTheater();
  bar.focus({ preventScroll: true });
  wakeBar();

  // the stage opens out of its place on the page, then the footlights come up, then the curtain goes
  const vw = innerWidth, vh = innerHeight, px = (v) => `${Math.max(0, v).toFixed(1)}px`;
  if (reduced()) {
    wrap.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 260 });
  } else {
    wrap.animate([
      { clipPath: `inset(${px(r.top)} ${px(vw - r.right)} ${px(vh - r.bottom)} ${px(r.left)} round 18px)` },
      { clipPath: 'inset(0px 0px 0px 0px round 0px)' },
    ], { duration: 820, easing: 'cubic-bezier(0.7, 0, 0.2, 1)' });
    const mid = (lamps.length - 1) / 2;
    lamps.forEach((l, k) => l.animate([{ opacity: 0 }, { opacity: 1 }],
      { duration: 380, delay: 640 + Math.abs(k - mid) * 55, fill: 'backwards', easing: 'ease-out' }));
  }
  const my = ++seq;
  setTimeout(() => { if (on && my === seq) openCurtains(); }, reduced() ? 320 : 1500);
}

function exit() {
  on = false;
  ++seq;
  clearInterval(idleTimer);
  clearTimeout(barTimer);
  const r = placeholder.getBoundingClientRect(), vw = innerWidth, vh = innerHeight;
  const px = (v) => `${Math.max(0, v).toFixed(1)}px`;
  document.documentElement.classList.add('th-leaving');
  house.style.opacity = '0';
  deco.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 320, fill: 'forwards' });
  bar.style.visibility = 'hidden';
  exitAnim = reduced()
    ? wrap.animate([{ opacity: 1 }, { opacity: 0.4 }], { duration: 200 })
    : wrap.animate([
      { clipPath: 'inset(0px 0px 0px 0px round 0px)' },
      { clipPath: `inset(${px(r.top)} ${px(vw - r.right)} ${px(vh - r.bottom)} ${px(r.left)} round 18px)` },
    ], { duration: 560, easing: 'cubic-bezier(0.6, 0, 0.3, 1)' });
  exitAnim.onfinish = finishExit;
}

function finishExit() {
  if (!placeholder) return;
  exitAnim = null;
  placeholder.replaceWith(wrap);
  placeholder = null;
  wrap.classList.remove('th-on');
  document.documentElement.classList.remove('th-active', 'th-leaving');
  house.style.opacity = '';
  bar.style.visibility = '';
  deco.getAnimations().forEach((a) => a.cancel());
  deco.classList.remove('is-call', 'is-swaying');
  deco.querySelector('.th-petals').textContent = '';
  setInert(false);
  setCurtainsInstant(false);
  nudgeResize();
  emitTheater();
  const back = prevFocus && document.contains(prevFocus) && prevFocus !== document.body ? prevFocus : toggleBtn;
  back.focus({ preventScroll: true });
}

export function toggleTheater(force) {
  if (!wrap) return false;
  const want = force === undefined ? !on : !!force;
  if (want !== on) (want ? enter() : exit());
  return on;
}
export const isTheater = () => on;

// ---------- music drives the curtain ----------
addEventListener('orch:change', () => {
  const now = seats.some((s) => s.active);
  if (on) {
    if (now && !curtainOpen) openCurtains();
    else if (!now && playing && curtainOpen) closeCurtains(true);
  }
  playing = now;
});
addEventListener('orch:note', (e) => { if (on && e.detail.live && !curtainOpen) openCurtains(); });
addEventListener('orch:beat', onBeat);
addEventListener('resize', (e) => { if (on && e.isTrusted) { layout(); if (curtainOpen) setCurtainsInstant(true); } });

// Esc leaves stage view. keys.js owns window keydown, so listen on document and yield if it handled the key.
document.addEventListener('keydown', (e) => {
  if (!on || e.key !== 'Escape') return;
  setTimeout(() => { if (on && !e.defaultPrevented) toggleTheater(false); }, 0);
});

mount();
if (wrap && location.hash === '#stage') toggleTheater(true);
