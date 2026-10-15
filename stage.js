// Pocket Orchestra: the stage hero.
// A concert hall in Canvas 2D: tiered risers, a seated orchestra that plays
// exactly what audio.js plays, a conductor beating 4/4 in time, and light that
// breathes with the analyser. Click a musician to start/stop them; shift-click
// or right-click switches looping / playing once. Click the conductor for tutti.
import * as O from './audio.js';

const { analyser, byId, seats } = O;
const LOOP = O.LOOP_BEATS || 16;
const BPM = () => O.bpm || 84;

const cv = document.getElementById('stage');
const g = cv.getContext('2d');
cv.setAttribute('role', 'img');
cv.setAttribute('aria-label', 'Concert stage. Click a musician to start or stop them. Shift-click or right-click switches between looping and playing once. Click the conductor to start or stop everyone.');

const mq = matchMedia('(prefers-reduced-motion: reduce)');
let reduced = mq.matches;
mq.addEventListener?.('change', (e) => (reduced = e.matches));

const TAU = Math.PI * 2, RAD = Math.PI / 180;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const ease = (cur, to, rate, dt) => cur + (to - cur) * (1 - Math.exp(-rate * dt));
const smooth = (t) => t * t * (3 - 2 * t);
const rnd = (a, b) => a + Math.random() * (b - a);
const hash = (i) => { const s = Math.sin(i * 12.9898) * 43758.5453; return s - Math.floor(s); };

// ---------- colour ramps: index 0 = in the dark, 10 = in the spotlight ----------
const ramp = (a, b) => Array.from({ length: 11 }, (_, i) => `rgb(${a.map((v, j) => Math.round(v + ((b[j] - v) * i) / 10))})`);
const C = {
  suit: ramp([16, 12, 18], [54, 43, 60]),
  skin: ramp([44, 31, 26], [230, 182, 146]),
  skin2: ramp([32, 21, 17], [158, 104, 70]),
  shirt: ramp([62, 58, 62], [250, 244, 234]),
  chair: ramp([22, 14, 10], [82, 52, 32]),
  wood: ramp([46, 22, 11], [214, 116, 50]),
  brass: ramp([58, 43, 15], [255, 214, 110]),
  silver: ramp([56, 58, 64], [238, 244, 252]),
  copper: ramp([54, 26, 15], [226, 130, 70]),
  gloss: ramp([8, 7, 10], [36, 31, 40]),
  hair: ramp([10, 8, 9], [48, 32, 26]),
  hair2: ramp([40, 33, 26], [204, 176, 128]),
  vellum: ramp([64, 58, 48], [240, 230, 204]),
};

// ---------- sprites (pre-rendered once, drawn with drawImage) ----------
function sprite(w, h, draw) { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); return c; }
const glowCache = new Map();
function glowSprite(h, s = 95, l = 66) {
  const key = h + '|' + s + '|' + l; let c = glowCache.get(key); if (c) return c;
  c = sprite(64, 64, (x) => {
    const gr = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, `hsla(${h},${s}%,${l}%,1)`); gr.addColorStop(0.28, `hsla(${h},${s}%,${l}%,0.45)`); gr.addColorStop(1, `hsla(${h},${s}%,${l}%,0)`);
    x.fillStyle = gr; x.fillRect(0, 0, 64, 64);
  });
  glowCache.set(key, c); return c;
}
const coneCache = new Map();
function coneSprite(h, s = 90, l = 82) {
  const key = h + '|' + s + '|' + l; let c = coneCache.get(key); if (c) return c;
  c = sprite(64, 256, (x) => {
    const gr = x.createLinearGradient(0, 0, 0, 256);
    gr.addColorStop(0, `hsla(${h},${s}%,${l}%,0.9)`); gr.addColorStop(0.15, `hsla(${h},${s}%,${l}%,0.35)`); gr.addColorStop(1, `hsla(${h},${s}%,${l}%,0.55)`);
    x.fillStyle = gr; x.beginPath(); x.moveTo(29, 0); x.lineTo(35, 0); x.lineTo(64, 256); x.lineTo(0, 256); x.fill();
    x.globalCompositeOperation = 'destination-in';
    const m = x.createLinearGradient(0, 0, 64, 0);
    m.addColorStop(0, 'rgba(0,0,0,0)'); m.addColorStop(0.5, 'rgba(0,0,0,1)'); m.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = m; x.fillRect(0, 0, 64, 256);
  });
  coneCache.set(key, c); return c;
}
const WARM = glowSprite(38, 100, 78);
const SPOT = coneSprite(40, 100, 88);
const pals = new Map();
function pal(inst) {
  let p = pals.get(inst.id); if (p) return p;
  const h = inst.hue ?? 30;
  p = { h, rim: `hsl(${h} 70% 82%)`, bright: `hsl(${h} 95% 74%)`, deep: `hsl(${h} 80% 52%)`, glow: glowSprite(h), cone: coneSprite(h, 95, 70) };
  pals.set(inst.id, p); return p;
}

// ---------- seating plan ----------
// rows of risers (radius 0..1 from the podium) and their heights in lift units
const ROWS = [0.36, 0.5, 0.63, 0.76, 0.89, 1.0];
const LIFTS = [0, 1, 2, 3, 4, 5.4];
// [match, firstRow, lastRow, fromDeg, toDeg]; 0deg = straight back, negative = stage left
const ZONES = [
  ['violin', 0, 1, -80, -24], ['viola', 0, 1, 20, 48], ['cello', 0, 1, 52, 80],
  ['contrabass', 2, 3, 66, 84], ['doublebass', 2, 3, 66, 84], ['bassoon', 2, 2, 32, 44], ['bass', 2, 3, 66, 84],
  ['harp', 2, 2, -84, -78], ['piano', 2, 2, 78, 84], ['celesta', 3, 3, 74, 84],
  ['flute', 2, 2, -28, -6], ['piccolo', 2, 2, -40, -32], ['oboe', 2, 2, -48, -34], ['clarinet', 2, 2, 6, 28], ['sax', 2, 2, 46, 56],
  ['horn', 3, 3, -50, -18], ['trumpet', 3, 3, -12, 12], ['trombone', 3, 3, 18, 40], ['tuba', 3, 3, 44, 54],
  ['glock', 4, 4, -40, -14], ['xylo', 4, 4, -62, -44], ['marimba', 4, 4, -62, -44], ['vibra', 4, 4, -62, -44],
  ['timpani', 4, 4, 10, 36], ['snare', 4, 4, 40, 54], ['drum', 4, 4, 40, 54], ['cymbal', 4, 4, 56, 64],
  ['choir', 5, 5, -60, 60], ['voice', 5, 5, -60, 60], ['vocal', 5, 5, -60, 60], ['sing', 5, 5, -60, 60],
];
const FAMILY_ZONE = { strings: [1, 2, -66, -40], woodwinds: [2, 2, -50, 50], brass: [3, 3, -56, 56], percussion: [4, 4, -64, 64], keys: [3, 3, 70, 84], voice: [5, 5, -60, 60], vocals: [5, 5, -60, 60], choir: [5, 5, -60, 60] };
const POSES = [['violin', 'violin'], ['viola', 'violin'], ['fiddle', 'violin'], ['contrabass', 'cello'], ['doublebass', 'cello'], ['cello', 'cello'], ['bassoon', 'reed'], ['bass', 'cello'],
  ['flute', 'flute'], ['piccolo', 'flute'], ['clarinet', 'reed'], ['oboe', 'reed'], ['sax', 'reed'], ['trumpet', 'trumpet'], ['cornet', 'trumpet'], ['trombone', 'trumpet'],
  ['horn', 'horn'], ['tuba', 'horn'], ['harp', 'harp'], ['piano', 'piano'], ['celesta', 'piano'], ['organ', 'piano'], ['glock', 'glock'], ['xylo', 'glock'], ['marimba', 'glock'], ['vibra', 'glock'],
  ['timpani', 'timpani'], ['drum', 'timpani'], ['snare', 'timpani'], ['choir', 'choir'], ['voice', 'choir'], ['vocal', 'choir'], ['sing', 'choir']];
const FAMILY_POSE = { strings: 'violin', woodwinds: 'reed', brass: 'trumpet', percussion: 'timpani', keys: 'piano', voice: 'choir', vocals: 'choir', choir: 'choir' };
const find = (list, id) => list.find((z) => z[0] === id) || list.find((z) => id.includes(z[0]));
const poseOf = (id, fam) => (find(POSES, id) || [0, FAMILY_POSE[fam] || 'choir'])[1];
// hit boxes in local units [left, right, top]
const BOUNDS = { violin: [-26, 40, -100], cello: [-26, 24, -102], flute: [-50, 22, -100], reed: [-24, 24, -100], trumpet: [-26, 26, -100], horn: [-30, 26, -100],
  harp: [-56, 22, -128], piano: [-22, 100, -104], glock: [-32, 32, -112], timpani: [-38, 38, -112], choir: [-24, 24, -112] };
const STANDING = { glock: 1, timpani: 1, choir: 1 };

// ---------- geometry ----------
let W = 1, H = 1, DPR = 1, S = 1, CX = 0, CY = 0, RX = 1, RY = 1, LU = 1, FIGH = 1, SIDE = 0, VAL = 0, BACKY = 0;
let CHAND = [];
const project = (r, deg, lift) => { const a = deg * RAD; return [CX + Math.sin(a) * r * RX, CY - Math.cos(a) * r * RY - lift * LU]; };

const bg = document.createElement('canvas'), bgg = bg.getContext('2d');
const fg = document.createElement('canvas'), fgg = fg.getContext('2d');

// ---------- figures ----------
const figs = [], figMap = new Map();
let intro = true;
function makeFig(seat, i) {
  const inst = byId[seat.inst] || { id: seat.inst, name: seat.inst, hue: 30, family: '' };
  return {
    seat, id: seat.id, inst, pose: poseOf(seat.inst, inst.family), row: 0, deg: 0,
    x: 0, y: 0, h: 0, tx: 0, ty: 0, th: 0, placed: false, delay: intro && !reduced ? 0.25 + i * 0.035 : 0,
    appear: 0, leaving: false, lit: 0, rise: 0, hit: 0, flash: 0, hov: 0, was: false, cyc: 0, pending: false,
    bowU: 0.5, bowFrom: 0.5, bowTo: 0.5, bowT0: 0, bowDur: 300, bowDir: 1,
    strike: 0, side: 0, sx: 0, amps: new Float32Array(12), lastGlyph: 0, midi: 60,
    v: seat.id % 3, sway: hash(seat.id) * TAU,
  };
}

function relayout() {
  const live = new Set();
  let i = 0;
  for (const s of seats) {
    live.add(s.id);
    if (!figMap.has(s.id)) { const f = makeFig(s, i); figs.push(f); figMap.set(s.id, f); }
    i++;
  }
  for (const f of figs) if (!live.has(f.id)) f.leaving = true;
  // group seats by instrument, in INSTRUMENTS order
  const groups = new Map();
  for (const s of seats) { let l = groups.get(s.inst); if (!l) groups.set(s.inst, (l = [])); l.push(s); }
  const unknown = {};
  for (const id of groups.keys()) if (!find(ZONES, id)) { const fam = byId[id]?.family || 'other'; (unknown[fam] ||= []).push(id); }
  for (const [id, list] of groups) {
    let z = find(ZONES, id);
    if (!z) {
      const fam = byId[id]?.family || 'other', fz = FAMILY_ZONE[fam] || [3, 3, -40, 40], u = unknown[fam], j = u.indexOf(id), span = (fz[3] - fz[2]) / u.length;
      z = [id, fz[0], fz[1], fz[2] + span * j + 2, fz[2] + span * (j + 1) - 2];
    }
    list.sort((a, b) => a.k - b.k);
    const n = list.length, avail = z[2] - z[1] + 1, nRows = Math.min(avail, Math.max(1, Math.ceil(n / 4))), per = Math.ceil(n / nRows);
    const mid = (z[3] + z[4]) / 2;
    list.forEach((s, idx) => {
      const f = figMap.get(s.id), row = Math.floor(idx / per), j = idx % per, m = Math.min(per, n - row * per);
      let u = m === 1 ? 0.5 : row % 2 ? (j + 0.5) / m : j / (m - 1);
      if (m === 1 && n > 1) u = row % 2 ? 0.5 : 0;
      f.row = Math.min(5, z[1] + row);
      f.deg = mid < 0 ? lerp(z[4], z[3], u) : lerp(z[3], z[4], u); // principal player sits nearest the podium
      if (Math.abs(mid) < 1) f.deg = lerp(z[3], z[4], u);
    });
  }
  for (const f of figs) place(f);
  figs.sort((a, b) => a.ty - b.ty);
  intro = false;
}
function place(f) {
  const [x, y] = project(ROWS[f.row], f.deg, LIFTS[f.row]);
  const depth = clamp((CY - y) / (CY - BACKY), 0, 1);
  f.tx = x; f.ty = y; f.th = FIGH * (1 - 0.36 * depth) * (f.inst.id.includes('bass') && f.pose === 'cello' ? 1.08 : 1);
  if (!f.placed) { f.x = x; f.y = y; f.h = f.th; f.placed = true; }
}

// ---------- conductor ----------
const cond = { x: 0, y: 0, h: 0, c: 0, hov: 0, tx: 0, ty: 0, trail: new Float32Array(56), tn: 0, tfill: 0 };
// right-hand ictus points (local units) for beats 1..4, and the rebound after each
const PAT = [[12, -52], [-16, -60], [42, -62], [22, -98]];
const REB = [28, 12, 10, -6];

// ---------- particles ----------
const MAXP = 420, GLYPH = 0, RING = 1, STAR = 2, MOTE = 3, SPARK = 4;
const P = Array.from({ length: MAXP }, () => ({ on: false, t: 0, x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1, size: 1, rot: 0, vr: 0, q: 1, col: '#fff', spr: null, ch: '' }));
let pCur = 0;
const GLYPHS = ['♪', '♫', '♩', '♬'];
function spawn(t, x, y, vx, vy, max, size, col, spr) {
  const cap = reduced ? 140 : MAXP;
  for (let n = 0; n < cap; n++) {
    const i = (pCur + n) % cap, p = P[i];
    if (p.on) continue;
    p.on = true; p.t = t; p.x = x; p.y = y; p.vx = vx; p.vy = vy; p.life = 0; p.max = max; p.size = size; p.col = col; p.spr = spr; p.rot = 0; p.vr = 0; p.q = 1;
    pCur = (i + 1) % cap; return p;
  }
  return null;
}

// ---------- audio-reactive state ----------
const bins = new Uint8Array(analyser.frequencyBinCount);
let level = 0, lo = 0, hi = 0, house = 0, tutti = 0, activeN = 0, total = 0;
let beatAt = -1e9, lastBeat = 0, downFlash = 0, loopFlash = 0, shake = 0, T = 0;
let mouseX = -1, mouseY = -1, hover = null, interacted = false, visible = true;
let camZ = 1, camX = 0, camY = 0;
const activeHues = new Float32Array(32); let nHues = 0;

function analyse(dt) {
  analyser.getByteFrequencyData(bins);
  let a = 0, b = 0, c = 0;
  for (let i = 1; i < 9; i++) a += bins[i];
  for (let i = 9; i < 120; i++) b += bins[i];
  for (let i = 120; i < 480; i++) c += bins[i];
  const L = clamp((b / 111 - 30) / 130, 0, 1), B = clamp((a / 8 - 60) / 150, 0, 1), Hh = clamp((c / 360 - 10) / 90, 0, 1);
  level = ease(level, L, L > level ? 14 : 3, dt); lo = ease(lo, B, B > lo ? 20 : 4, dt); hi = ease(hi, Hh, Hh > hi ? 12 : 3, dt);
}

// ---------- events ----------
addEventListener('orch:change', relayout);
addEventListener('orch:beat', (e) => {
  const { beat } = e.detail;
  lastBeat = beat; beatAt = performance.now();
  if (beat % 4 === 0) downFlash = 1;
  if (beat === 0) loopFlash = 1;
  for (const f of figs) if (f.pending) { f.pending = false; f.cyc = 0; }
  if (tutti > 0.5 && beat % 4 === 0 && !reduced) burst(cond.tx, cond.ty, 10, 36, 'hsl(42 100% 75%)', WARM);
});
addEventListener('orch:note', (e) => {
  const d = e.detail, f = figMap.get(d.seat);
  if (!f || f.leaving || !visible) return;
  onNote(f, d, performance.now());
});

function burst(x, y, n, speed, col, spr) {
  for (let i = 0; i < n; i++) {
    const a = rnd(0, TAU), v = rnd(0.4, 1) * speed * S;
    const p = spawn(STAR, x, y, Math.cos(a) * v, Math.sin(a) * v - 10 * S, rnd(0.5, 0.9), rnd(2.5, 4.5) * S, col, spr);
    if (p) p.vr = rnd(-4, 4);
  }
}
const W2 = (f, lx, ly) => [f.x + (lx * f.h) / 100, f.y + (ly * f.h) / 100];

function onNote(f, d, now) {
  const P_ = pal(f.inst), vel = d.vel || 0.8, dur = (d.dur || 0.4) * 1000;
  f.hit = Math.min(1, 0.5 + vel * 0.5); f.midi = d.midi;
  let gx, gy;
  switch (f.pose) {
    case 'violin': case 'cello':
      f.bowFrom = f.bowU; f.bowTo = f.bowDir > 0 ? 0.92 : 0.1; f.bowDir = -f.bowDir; f.bowT0 = now; f.bowDur = clamp(dur * 0.95, 110, 1800);
      [gx, gy] = W2(f, f.pose === 'violin' ? 14 : 0, f.pose === 'violin' ? -78 : -60); break;
    case 'harp': {
      const i = clamp(Math.round(((d.midi - 38) / 48) * 11), 0, 11); f.amps[i] = 1;
      const t = (i + 0.5) / 12;
      [gx, gy] = W2(f, lerp(-46, -6, t), lerp(-40, -110, t));
      const p = spawn(STAR, gx, gy, rnd(-8, 8) * S, rnd(-30, -10) * S, 0.7, 3.5 * S, P_.bright, P_.glow); if (p) p.vr = 3;
      break;
    }
    case 'glock': {
      const i = clamp(Math.round(((d.midi % 24) / 23) * 9), 0, 9); f.amps[i] = 1; f.side ^= 1; f.strike = 1; f.sx = -26 + i * 5.8 + 2.2;
      [gx, gy] = W2(f, f.sx, -52);
      if (!reduced) burst(gx, gy, 5, 50, P_.bright, P_.glow);
      break;
    }
    case 'timpani': {
      f.side ^= 1; f.strike = 1;
      const [x, y] = W2(f, f.side ? 19 : -19, -31);
      const r1 = spawn(RING, x, y, 0, 0, 0.7, (f.side ? 15 : 17) * f.h / 100, P_.bright, null); if (r1) r1.q = 0.3;
      const r2 = spawn(RING, x, y + f.h * 0.3, 0, 0, 1.1, f.h * 1.3 * (0.6 + vel * 0.6), 'hsl(36 90% 70%)', null); if (r2) r2.q = 0.26;
      if (!reduced) shake = Math.max(shake, 0.6 + vel);
      gx = x; gy = y - f.h * 0.2; break;
    }
    case 'piano': f.side ^= 1; f.strike = 1; [gx, gy] = W2(f, 10, -60); break;
    case 'trumpet': case 'horn': {
      f.flash = 1;
      [gx, gy] = f.pose === 'trumpet' ? W2(f, 0, -78) : W2(f, -22, -60);
      if (!reduced && now - f.lastGlyph > 150) burst(gx, gy, 3, 40, 'hsl(44 100% 72%)', WARM);
      break;
    }
    case 'flute': [gx, gy] = W2(f, -44, -76); break;
    case 'choir': [gx, gy] = W2(f, 0, -100); break;
    default: [gx, gy] = W2(f, 0, -86);
  }
  const gap = reduced ? 600 : 210;
  if (now - f.lastGlyph > gap) {
    f.lastGlyph = now;
    const p = spawn(GLYPH, gx, gy, rnd(-10, 10) * S, rnd(-46, -30) * S, rnd(1.8, 2.6), (13 + vel * 9) * S * clamp(f.h / 60, 0.7, 1.3), P_.bright, P_.glow);
    if (p) { p.ch = GLYPHS[(d.midi + f.id) & 3]; p.vr = rnd(-0.6, 0.6); p.rot = rnd(-0.3, 0.3); }
  }
}

// ---------- interaction ----------
function toWorld(sx, sy) {
  const px = CX, py = H * 0.6;
  return [(sx - camX - px) / camZ + px, (sy - camY - py) / camZ + py];
}
function pick(sx, sy) {
  const [wx, wy] = toWorld(sx, sy);
  // conductor first (front-most)
  {
    const k = cond.h / 100, lx = (wx - cond.x) / k, ly = (wy - cond.y) / k;
    if (lx > -26 && lx < 30 && ly > -112 && ly < 6) return cond;
  }
  for (let i = figs.length - 1; i >= 0; i--) {
    const f = figs[i]; if (f.leaving || f.appear < 0.5) continue;
    const k = f.h / 100, lx = (wx - f.x) / k, ly = (wy - f.y) / k, b = BOUNDS[f.pose] || BOUNDS.choir;
    if (lx > b[0] && lx < b[1] && ly > b[2] && ly < 4) return f;
  }
  return null;
}
function pointer(e) {
  const r = cv.getBoundingClientRect();
  mouseX = e.clientX - r.left; mouseY = e.clientY - r.top;
  hover = pick(mouseX, mouseY);
  cv.style.cursor = hover ? 'pointer' : '';
}
cv.addEventListener('pointermove', pointer);
cv.addEventListener('pointerdown', pointer);
cv.addEventListener('pointerleave', () => { hover = null; mouseX = -1; cv.style.cursor = ''; });
cv.addEventListener('click', (e) => {
  pointer(e); const h = hover; if (!h) return;
  interacted = true;
  if (h === cond) { activeN ? O.stopAll() : O.tutti(); return; }
  if (e.shiftKey || e.altKey) O.setLoop(h.seat, !h.seat.loop); else O.toggle(h.seat);
});
cv.addEventListener('contextmenu', (e) => {
  pointer(e); const h = hover; if (!h || h === cond) return;
  e.preventDefault(); interacted = true; O.setLoop(h.seat, !h.seat.loop);
});

// ---------- resize ----------
function fit() {
  const w = cv.clientWidth, h = cv.clientHeight; if (!w || !h) return;
  W = w; H = h; DPR = Math.min(2, devicePixelRatio || 1);
  cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR);
  S = clamp(Math.min(W / 1100, H / 520), 0.42, 1.4);
  SIDE = Math.max(14, W * 0.055); VAL = Math.max(20, H * 0.075);
  FIGH = H * 0.135 * clamp(W / (H * 1.7), 0.56, 1);
  CX = W / 2; CY = H * 0.84; RY = H * 0.44; LU = H * 0.02;
  RX = Math.min((W / 2 - SIDE - FIGH * 0.6) / 0.64, H * 1.25);
  BACKY = CY - 1.12 * RY - 5.4 * LU;
  CHAND = W < 640 ? [[W * 0.2, VAL + 26 * S, 0.8]] .concat([[W * 0.8, VAL + 26 * S, 0.8]]) : [[W * 0.19, VAL + 34 * S, 1], [W * 0.81, VAL + 34 * S, 1]];
  cond.x = cond.tx = CX; cond.y = CY + H * 0.05; cond.h = FIGH * 1.34;
  renderBg(); renderFg();
  for (const f of figs) { f.placed = false; place(f); }
  figs.sort((a, b) => a.ty - b.ty);
}
new ResizeObserver(fit).observe(cv);
new IntersectionObserver((es) => { visible = es[0].isIntersecting; }).observe(cv);

// ---------- static layers ----------
function arcPath(c, r, lift, d0, d1, move) {
  const steps = 48;
  for (let s = 0; s <= steps; s++) { const [x, y] = project(r, lerp(d0, d1, s / steps), lift); if (s === 0 && move) c.moveTo(x, y); else c.lineTo(x, y); }
}
function renderBg() {
  bg.width = cv.width; bg.height = cv.height;
  const c = bgg; c.setTransform(DPR, 0, 0, DPR, 0, 0);
  let gr = c.createLinearGradient(0, 0, 0, BACKY + 30);
  gr.addColorStop(0, '#0b0709'); gr.addColorStop(0.7, '#1f1016'); gr.addColorStop(1, '#2a151b');
  c.fillStyle = gr; c.fillRect(0, 0, W, H);
  // panelled hall wall
  c.fillStyle = 'rgba(255,200,150,0.03)';
  for (let x = SIDE; x < W - SIDE; x += 16 * S) c.fillRect(x, 0, 1, BACKY);
  c.fillStyle = 'rgba(232,176,74,0.10)'; c.fillRect(0, BACKY - 6 * S, W, 1.5);
  // organ pipes behind the orchestra
  const n = W < 640 ? 15 : 25, ow = Math.min(W * 0.46, 620 * S), pw = ow / n, oTop = VAL + 8 * S;
  for (let i = 0; i < n; i++) {
    const u = (i / (n - 1)) * 2 - 1;
    const hgt = (BACKY - oTop) * (0.42 + 0.5 * (0.5 + 0.5 * Math.cos(u * Math.PI * 2)) * (1 - 0.35 * Math.abs(u)));
    const x = CX + (u * (ow - pw)) / 2 - pw * 0.36, y = BACKY - hgt, w = pw * 0.72;
    const pg = c.createLinearGradient(x, 0, x + w, 0);
    pg.addColorStop(0, '#231a14'); pg.addColorStop(0.4, '#8a7350'); pg.addColorStop(0.55, '#5c4a32'); pg.addColorStop(1, '#1d1510');
    c.fillStyle = pg; c.fillRect(x, y, w, hgt);
    c.fillStyle = 'rgba(10,6,6,0.85)';
    const my = y + hgt * 0.72;
    c.beginPath(); c.moveTo(x + w * 0.15, my); c.lineTo(x + w * 0.85, my); c.lineTo(x + w * 0.5, my - w * 0.6); c.fill();
    c.fillStyle = '#b39a68'; c.fillRect(x, y, w, 1);
  }
  // stage floor
  const front = CY + H * 0.07;
  gr = c.createLinearGradient(0, BACKY, 0, front);
  gr.addColorStop(0, '#1e110b'); gr.addColorStop(1, '#5b3520');
  c.fillStyle = gr; c.beginPath(); c.moveTo(0, BACKY); c.lineTo(W, BACKY); c.lineTo(W, front); c.quadraticCurveTo(CX, front + H * 0.05, 0, front); c.fill();
  c.strokeStyle = 'rgba(0,0,0,0.22)'; c.lineWidth = 1;
  for (let k = 1; k < 20; k++) { const y = BACKY + (front - BACKY) * Math.pow(k / 20, 1.5); c.beginPath(); c.moveTo(0, y); c.lineTo(W, y); c.stroke(); }
  c.fillStyle = '#060306'; c.beginPath(); c.moveTo(0, front); c.quadraticCurveTo(CX, front + H * 0.05, W, front); c.lineTo(W, H); c.lineTo(0, H); c.fill();
  c.strokeStyle = 'rgba(255,190,120,0.35)'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(0, front); c.quadraticCurveTo(CX, front + H * 0.05, W, front); c.stroke();
  // risers, back to front
  for (let i = 5; i >= 1; i--) {
    const rin = ROWS[i] - 0.07, rout = i === 5 ? 1.2 : ROWS[i + 1] - 0.07;
    c.beginPath(); arcPath(c, rout, LIFTS[i], -100, 100, true); arcPath(c, rin, LIFTS[i], 100, -100, false); c.closePath();
    c.fillStyle = `hsl(22 36% ${14 + (5 - i) * 1.8}%)`; c.fill();
    c.beginPath(); arcPath(c, rin, LIFTS[i], -100, 100, true); arcPath(c, rin, LIFTS[i - 1], 100, -100, false); c.closePath();
    c.fillStyle = `hsl(18 40% ${5 + (5 - i) * 0.8}%)`; c.fill();
    c.beginPath(); arcPath(c, rin, LIFTS[i], -100, 100, true); c.strokeStyle = 'rgba(255,196,130,0.30)'; c.lineWidth = 1; c.stroke();
  }
}
function curtain(c, flip) {
  c.save(); if (flip) { c.translate(W, 0); c.scale(-1, 1); }
  const w = SIDE, tieY = H * 0.66;
  const gr = c.createLinearGradient(0, 0, w * 1.5, 0);
  for (let i = 0; i <= 10; i++) gr.addColorStop(i / 10, i % 2 ? '#821826' : '#2a040a');
  c.fillStyle = gr;
  c.beginPath(); c.moveTo(0, 0); c.lineTo(w * 1.3, 0);
  c.quadraticCurveTo(w * 0.75, H * 0.4, w * 1.45, tieY);
  c.quadraticCurveTo(w * 0.8, H * 0.82, w * 1.05, H); c.lineTo(0, H); c.closePath(); c.fill();
  c.strokeStyle = 'rgba(255,130,110,0.28)'; c.lineWidth = 1.2;
  c.beginPath(); c.moveTo(w * 1.3, 0); c.quadraticCurveTo(w * 0.75, H * 0.4, w * 1.45, tieY); c.quadraticCurveTo(w * 0.8, H * 0.82, w * 1.05, H); c.stroke();
  c.fillStyle = '#c99a3e'; c.beginPath(); c.ellipse(w * 1.25, tieY, 6 * S, 3.5 * S, 0.3, 0, TAU); c.fill();
  c.strokeStyle = '#c99a3e'; c.lineWidth = 1.5 * S; c.beginPath(); c.moveTo(w * 1.3, tieY); c.lineTo(w * 1.36, tieY + 22 * S); c.stroke();
  c.restore();
}
function renderFg() {
  fg.width = cv.width; fg.height = cv.height;
  const c = fgg; c.setTransform(DPR, 0, 0, DPR, 0, 0); c.clearRect(0, 0, W, H);
  // audience, two rows of silhouettes
  for (const [y0, sz, seed] of [[H * 0.955, 0.9, 1], [H * 1.0, 1.25, 7]]) {
    const step = 40 * S * sz;
    for (let i = 0, x = -10; x < W + 40; i++, x += step) {
      const jx = x + (hash(i + seed * 31) - 0.5) * step * 0.4, jy = y0 + (hash(i * 3 + seed) - 0.5) * 6 * S, hs = sz * S * (0.9 + hash(i + seed) * 0.25);
      c.fillStyle = '#050307';
      c.beginPath(); c.ellipse(jx, jy + 20 * hs, 26 * hs, 15 * hs, 0, 0, TAU); c.fill();
      c.beginPath(); c.ellipse(jx, jy, 10 * hs, 12.5 * hs, 0, 0, TAU); c.fill();
      c.strokeStyle = 'rgba(255,190,130,0.22)'; c.lineWidth = 1.2;
      c.beginPath(); c.ellipse(jx, jy, 10 * hs, 12.5 * hs, 0, Math.PI * 1.15, Math.PI * 1.85); c.stroke();
    }
  }
  curtain(c, false); curtain(c, true);
  // valance with swags + gold fringe
  let gr = c.createLinearGradient(0, 0, 0, VAL * 1.3);
  gr.addColorStop(0, '#2c040b'); gr.addColorStop(1, '#781424');
  c.fillStyle = gr;
  const nS = Math.max(3, Math.round(W / (170 * S))), sw = W / nS;
  const swags = (move) => { if (move) c.moveTo(W, VAL * 0.7); for (let i = nS - 1; i >= 0; i--) c.quadraticCurveTo((i + 0.5) * sw, VAL * 1.3, i * sw, VAL * 0.7); };
  c.beginPath(); c.moveTo(0, 0); c.lineTo(W, 0); c.lineTo(W, VAL * 0.7); swags(false); c.closePath(); c.fill();
  c.strokeStyle = '#caa04a'; c.lineWidth = 2.2 * S; c.setLineDash([1.5 * S, 2.5 * S]);
  c.beginPath(); swags(true); c.stroke(); c.setLineDash([]);
  c.fillStyle = '#caa04a'; c.fillRect(0, VAL * 0.18, W, 1.5 * S);
  // vignette
  gr = c.createRadialGradient(CX, H * 0.55, Math.min(W, H) * 0.35, CX, H * 0.55, Math.max(W, H) * 0.8);
  gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,0.55)');
  c.fillStyle = gr; c.fillRect(0, 0, W, H);
}

// ---------- musicians ----------
function lightIdx(f) { return Math.round(10 * clamp(lerp(0.4, 0.14, house) + f.lit * 0.86 + f.hov * 0.3, 0, 1)); }
function arm(x1, y1, x2, y2, bend, L) {
  const mx = (x1 + x2) / 2, my = (y1 + y2) / 2, dx = x2 - x1, dy = y2 - y1, d = Math.hypot(dx, dy) || 1;
  g.strokeStyle = C.suit[L]; g.lineWidth = 6.5;
  g.beginPath(); g.moveTo(x1, y1); g.lineTo(mx - (dy / d) * bend, my + (dx / d) * bend); g.lineTo(x2, y2); g.stroke();
}
function hand(f, x, y, L) { g.fillStyle = (f.v === 1 ? C.skin2 : C.skin)[L]; g.beginPath(); g.arc(x, y, 3.3, 0, TAU); g.fill(); }
function line(x1, y1, x2, y2, w, col) { g.strokeStyle = col; g.lineWidth = w; g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke(); }
function chair(L) { g.fillStyle = C.chair[L]; g.fillRect(-15, -35, 30, 4); g.fillRect(-14, -31, 3, 31); g.fillRect(11, -31, 3, 31); }
function legs(L, hip, stand) {
  g.strokeStyle = C.suit[L]; g.lineWidth = 10;
  g.beginPath();
  if (stand) { g.moveTo(-6, hip); g.lineTo(-8, -4); g.moveTo(6, hip); g.lineTo(8, -4); }
  else { g.moveTo(-7, hip); g.lineTo(-9, -4); g.moveTo(7, hip); g.lineTo(9, -4); }
  g.stroke();
  g.fillStyle = C.gloss[L]; g.beginPath(); g.ellipse(-10, -2.5, 6, 3, 0, 0, TAU); g.moveTo(16, -2.5); g.ellipse(10, -2.5, 6, 3, 0, 0, TAU); g.fill();
}
// torso + head; returns shoulder y
function upper(f, L, lift, stand, P_, robe) {
  const sy = -66 - lift - stand, ny = -73 - lift - stand, hip = -33 - stand;
  g.fillStyle = C.suit[L];
  g.beginPath();
  if (robe) { g.moveTo(-21, -2); g.quadraticCurveTo(-18, (hip + sy) / 2, -18, sy + 3); }
  else { g.moveTo(-12, hip); g.quadraticCurveTo(-17, (hip + sy) / 2, -18, sy + 3); }
  g.quadraticCurveTo(-17, sy - 4, -7, ny + 2); g.lineTo(7, ny + 2); g.quadraticCurveTo(17, sy - 4, 18, sy + 3);
  if (robe) { g.quadraticCurveTo(18, (hip + sy) / 2, 21, -2); } else g.quadraticCurveTo(17, (hip + sy) / 2, 12, hip);
  g.closePath(); g.fill();
  g.fillStyle = C.shirt[L]; g.beginPath(); g.moveTo(-5, ny + 2); g.lineTo(5, ny + 2); g.lineTo(0, ny + 15); g.fill();
  if (!robe) { g.fillStyle = C.gloss[L]; g.beginPath(); g.moveTo(-4.5, ny + 3); g.lineTo(0, ny + 5.5); g.lineTo(4.5, ny + 3); g.lineTo(4.5, ny + 8); g.lineTo(0, ny + 5.5); g.lineTo(-4.5, ny + 8); g.fill(); }
  const hy = ny - 10, hair = f.v === 2 ? C.hair2 : C.hair;
  if (f.v === 1) { g.fillStyle = hair[L]; g.beginPath(); g.arc(0, hy - 10, 5, 0, TAU); g.fill(); }
  if (f.v === 2) { g.fillStyle = hair[L]; g.beginPath(); g.ellipse(0, hy + 5, 11, 12, 0, 0, TAU); g.fill(); }
  g.fillStyle = (f.v === 1 ? C.skin2 : C.skin)[L]; g.beginPath(); g.arc(0, hy, 9.5, 0, TAU); g.fill();
  g.fillStyle = hair[L]; g.beginPath(); g.arc(0, hy - 1, 10, Math.PI * 1.02, Math.PI * 1.98); g.fill();
  const rim = Math.min(1, f.lit * 0.85 + f.hov * 0.7 + f.hit * 0.3);
  if (rim > 0.04) {
    g.globalAlpha = f.appear * rim; g.strokeStyle = P_.rim; g.lineWidth = 1.5;
    g.beginPath(); g.arc(0, hy, 10.3, Math.PI * 1.08, Math.PI * 1.92);
    g.moveTo(-18, sy + 3); g.quadraticCurveTo(-17, sy - 4, -7, ny + 2); g.moveTo(7, ny + 2); g.quadraticCurveTo(17, sy - 4, 18, sy + 3); g.stroke();
    g.globalAlpha = f.appear;
  }
  return sy;
}

function drawFloorRing(f, P_) {
  const a = Math.max(f.lit, f.hov); if (a < 0.03) return;
  const rx = BOUNDS[f.pose] === BOUNDS.piano ? 30 : 26, ry = 6.5, s0 = Math.PI / 2;
  g.strokeStyle = P_.bright; g.lineWidth = 1.4;
  g.globalAlpha = f.appear * 0.2 * a; g.beginPath(); g.ellipse(0, -1, rx, ry, 0, 0, TAU); g.stroke();
  if (f.lit > 0.03) {
    const ph = f.pending ? 0 : f.cyc % 1;
    g.globalAlpha = f.appear * f.lit;
    if (f.seat.loop) {
      const e = s0 + TAU * ph;
      g.lineWidth = 1.6; g.beginPath(); g.ellipse(0, -1, rx, ry, 0, e - 1.4, e); g.stroke();
      g.fillStyle = P_.bright; g.beginPath(); g.arc(Math.cos(e) * rx, -1 + Math.sin(e) * ry, 2.2, 0, TAU); g.fill();
    } else {
      g.lineWidth = 3.4; g.beginPath(); g.ellipse(0, -1, rx, ry, 0, s0, s0 + TAU * Math.max(0.001, ph)); g.stroke();
    }
  }
  g.globalAlpha = f.appear;
}

function drawFig(f, now) {
  if (f.appear < 0.01 || f.h <= 0) return;
  const k = f.h / 100, P_ = pal(f.inst), L = lightIdx(f), r = f.rise, lift = r * 3;
  g.save();
  g.translate(f.x, f.y + (1 - f.appear) * f.h * 0.3);
  g.scale(k, k);
  g.globalAlpha = f.appear;
  drawFloorRing(f, P_);
  if (!reduced && r > 0.01) g.rotate(Math.sin(T * 1.7 + f.sway) * 0.022 * r);
  POSE_DRAW[f.pose](f, L, r, lift, P_, now);
  g.restore();
}

const POSE_DRAW = {
  violin(f, L, r, lift, P_) {
    const sc = f.inst.id.includes('viola') ? 1.12 : 1;
    chair(L); legs(L, -33, false);
    const sy = upper(f, L, lift, 0, P_);
    const vx = lerp(10, 12, r), vy = lerp(-42, -69 - lift, r), va = lerp(-1.42, 0.26, r);
    const ca = Math.cos(va), sa = Math.sin(va);
    const at = (u, v) => [vx + ca * u * sc - sa * v, vy + sa * u * sc + ca * v];
    // violin body
    g.save(); g.translate(vx, vy); g.rotate(va); g.scale(sc, sc);
    g.fillStyle = C.wood[L];
    g.beginPath(); g.ellipse(-4, 0, 6.5, 5.4, 0, 0, TAU); g.moveTo(9, 0); g.ellipse(4, 0, 5, 4.4, 0, 0, TAU); g.fill();
    g.strokeStyle = C.gloss[L]; g.lineWidth = 2.2; g.beginPath(); g.moveTo(6, 0); g.lineTo(21, 0); g.stroke();
    g.fillStyle = C.gloss[L]; g.beginPath(); g.arc(22, 0, 1.8, 0, TAU); g.fill();
    g.globalAlpha = f.appear * (0.3 + f.hit * 0.6); g.strokeStyle = P_.rim; g.lineWidth = 0.6; g.beginPath(); g.moveTo(-8, 0); g.lineTo(20, 0); g.stroke();
    g.restore(); g.globalAlpha = f.appear;
    const [lhx, lhy] = at(17, 2);
    // bow
    const [cx, cy] = at(-1, 0), dl = Math.hypot(1, 0.5), dx = -1 / dl, dy = 0.5 / dl, BL = 52 * sc;
    const u = lerp(0.12, 0.92, f.bowU);
    const phx = cx + dx * BL * u, phy = cy + dy * BL * u;
    const hx = lerp(-12, phx, r), hy = lerp(-40, phy, r);
    const ex = lerp(-17, phx - dx * BL, r), ey = lerp(-94, phy - dy * BL, r);
    line(hx, hy, ex, ey, 1.6, C.vellum[L]);
    arm(-16, sy, hx, hy, -9, L); hand(f, hx, hy, L);
    arm(16, sy, lhx, lhy, 8, L); hand(f, lhx, lhy, L);
  },
  cello(f, L, r, lift, P_) {
    const sc = f.inst.id.includes('bass') ? 1.3 : 1;
    chair(L); legs(L, -33, false);
    const sy = upper(f, L, lift, 0, P_);
    g.save(); g.scale(sc, sc);
    g.fillStyle = C.wood[L];
    g.beginPath(); g.ellipse(0, -20, 13, 14, 0, 0, TAU); g.moveTo(10, -42); g.ellipse(0, -42, 10, 10, 0, 0, TAU); g.fill();
    g.fillStyle = C.gloss[L]; g.fillRect(-2, -26, 4, 3);
    line(0, -48, 1.5, -86, 3, C.gloss[L]);
    g.fillStyle = C.gloss[L]; g.beginPath(); g.arc(1.6, -88, 2.4, 0, TAU); g.fill();
    line(0, -6, 0, 0, 1.5, C.silver[L]);
    g.globalAlpha = f.appear * (0.3 + f.hit * 0.6); line(0, -10, 1.4, -84, 0.7, P_.rim); g.globalAlpha = f.appear;
    g.restore();
    const cx = 0, cy = -30 * sc, dl = Math.hypot(1, 0.12), dx = -1 / dl, dy = 0.12 / dl, BL = 60;
    const u = lerp(0.1, 0.9, f.bowU);
    const phx = cx + dx * BL * u + 10, phy = cy + dy * BL * u;
    const hx = lerp(-15, phx, r), hy = lerp(-38, phy, r);
    const ex = lerp(-19, phx - dx * BL, r), ey = lerp(-2, phy - dy * BL, r);
    line(hx, hy, ex, ey, 1.6, C.vellum[L]);
    const ny = lerp(-62, -78, clamp((f.midi - 36) / 24, 0, 1)) * sc;
    arm(-16, sy, hx, hy, -8, L); hand(f, hx, hy, L);
    arm(16, sy, 4, lerp(-52, ny, r), 7, L); hand(f, 4, lerp(-52, ny, r), L);
  },
  flute(f, L, r, lift, P_) {
    chair(L); legs(L, -33, false);
    const sy = upper(f, L, lift, 0, P_);
    const x0 = lerp(12, 3, r), y0 = lerp(-39, -78 - lift, r), x1 = lerp(-32, -46, r), y1 = lerp(-41, -72 - lift, r);
    line(x0, y0, x1, y1, 2.8, C.silver[L]);
    g.globalAlpha = f.appear * (0.25 + f.hit * 0.7); line(x0, y0 - 0.8, x1, y1 - 0.8, 0.8, P_.rim); g.globalAlpha = f.appear;
    const ax = lerp(x0, x1, 0.2), ay = lerp(y0, y1, 0.2), bx = lerp(x0, x1, 0.6), by = lerp(y0, y1, 0.6);
    arm(16, sy, ax, ay, 9, L); hand(f, ax, ay, L);
    arm(-16, sy, bx, by, -7, L); hand(f, bx, by, L);
  },
  reed(f, L, r, lift, P_) {
    const sc = f.inst.id.includes('bassoon') ? 1.5 : 1;
    chair(L); legs(L, -33, false);
    const sy = upper(f, L, lift, 0, P_);
    const x0 = lerp(-12, 1, r), y0 = lerp(-76, -79 - lift, r), x1 = lerp(-13, 5, r), y1 = lerp(-34, -38 - (sc - 1) * 20, r);
    line(x0, y0, x1, y1, 4 * Math.min(sc, 1.25), C.gloss[L]);
    g.fillStyle = C.gloss[L]; g.beginPath(); g.ellipse(x1, y1, 4.4, 2.2, 0, 0, TAU); g.fill();
    g.globalAlpha = f.appear * (0.35 + f.hit * 0.6); line(x0 + 1.4, y0 + 4, x1 + 1.4, y1 - 3, 0.9, C.silver[Math.min(10, L + 2)]); g.globalAlpha = f.appear;
    const ax = lerp(x0, x1, 0.3), ay = lerp(y0, y1, 0.3), bx = lerp(x0, x1, 0.62), by = lerp(y0, y1, 0.62);
    arm(16, sy, ax, ay, 7, L); hand(f, ax, ay, L);
    arm(-16, sy, bx, by, -7, L); hand(f, bx, by, L);
  },
  trumpet(f, L, r, lift, P_) {
    chair(L); legs(L, -33, false);
    const sy = upper(f, L, lift, 0, P_);
    const isTb = f.inst.id.includes('trombone');
    if (r < 0.98) { // resting across the knee, seen side-on
      g.globalAlpha = f.appear * (1 - r);
      line(-2, -38, -26, -36, 3, C.brass[L]);
      g.fillStyle = C.brass[L]; g.beginPath(); g.moveTo(-24, -36); g.lineTo(-32, -42); g.lineTo(-32, -30); g.fill();
      g.globalAlpha = f.appear;
    }
    const br = 8.5 * smooth(clamp((r - 0.25) / 0.75, 0, 1)), bx = 0, by = -75 - lift - r * 3;
    let hy = lerp(-38, by + 3, r);
    if (isTb && br > 0) { const sl = lerp(-40, -26, ((f.midi % 12) / 11)); line(-4, by + 4, -4, sl, 2, C.brass[L]); line(4, by + 4, 4, sl, 2, C.brass[L]); line(-4, sl, 4, sl, 2, C.brass[L]); }
    arm(-16, sy, -7, hy, -6, L); arm(16, sy, 7, hy, 6, L);
    hand(f, -7, hy, L); hand(f, 7, hy, L);
    if (br > 0.5) {
      if (f.flash > 0.02) { g.globalCompositeOperation = 'lighter'; g.globalAlpha = f.appear * f.flash * 0.9; g.drawImage(WARM, bx - 30, by - 30, 60, 60); g.globalCompositeOperation = 'source-over'; g.globalAlpha = f.appear; }
      g.fillStyle = C.brass[Math.min(10, L + Math.round(f.flash * 3))]; g.beginPath(); g.arc(bx, by, br, 0, TAU); g.fill();
      g.fillStyle = C.copper[Math.max(0, L - 4)]; g.beginPath(); g.arc(bx, by, br * 0.55, 0, TAU); g.fill();
      g.strokeStyle = C.brass[10]; g.globalAlpha = f.appear * (0.3 + f.lit * 0.6); g.lineWidth = 1; g.beginPath(); g.arc(bx, by, br - 0.6, Math.PI * 1.1, Math.PI * 1.7); g.stroke(); g.globalAlpha = f.appear;
    }
  },
  horn(f, L, r, lift, P_) {
    const sc = f.inst.id.includes('tuba') ? 1.5 : 1;
    chair(L); legs(L, -33, false);
    const sy = upper(f, L, lift, 0, P_);
    const ox = -4, oy = lerp(-42, -60 - lift, r);
    g.strokeStyle = C.brass[L]; g.lineWidth = 2.6;
    g.beginPath(); g.arc(ox, oy, 10 * sc, 0, TAU); g.stroke();
    g.lineWidth = 1.6; g.beginPath(); g.arc(ox, oy, 5.5 * sc, 0, TAU); g.stroke();
    line(ox + 6, oy - 7, 2, -79 - lift, 1.6, C.brass[L]);
    g.fillStyle = C.brass[Math.min(10, L + Math.round(f.flash * 3))];
    g.beginPath(); g.moveTo(ox - 9 * sc, oy + 3); g.lineTo(ox - 22 * sc, oy - 2 * sc); g.lineTo(ox - 20 * sc, oy + 12 * sc); g.closePath(); g.fill();
    if (f.flash > 0.02) { g.globalCompositeOperation = 'lighter'; g.globalAlpha = f.appear * f.flash * 0.7; g.drawImage(WARM, ox - 22 * sc - 20, oy - 15, 40, 40); g.globalCompositeOperation = 'source-over'; g.globalAlpha = f.appear; }
    arm(-16, sy, ox - 18 * sc, oy + 6, -6, L); hand(f, ox - 18 * sc, oy + 6, L);
    arm(16, sy, ox + 5, oy - 4, 6, L); hand(f, ox + 5, oy - 4, L);
  },
  harp(f, L, r, lift, P_) {
    // gold frame to stage-side of the player, strings that shimmer per note
    g.strokeStyle = C.brass[L]; g.lineWidth = 4;
    g.beginPath(); g.moveTo(-50, -3); g.lineTo(-50, -124); g.quadraticCurveTo(-28, -100, -5, -110); g.stroke();
    g.strokeStyle = C.wood[L]; g.lineWidth = 6; g.beginPath(); g.moveTo(-45, -4); g.lineTo(-6, -106); g.stroke();
    g.fillStyle = C.brass[L]; g.fillRect(-54, -6, 14, 6);
    g.lineWidth = 0.8;
    for (let i = 0; i < 12; i++) {
      const t = (i + 0.5) / 12, bx = lerp(-45, -6, t), by = lerp(-4, -106, t);
      const s = 1 - t, top = s * s * -124 + 2 * s * t * -100 + t * t * -110 + 1;
      const a = f.amps[i];
      g.globalAlpha = f.appear * Math.min(1, 0.22 + f.lit * 0.25 + a * 0.75);
      g.strokeStyle = a > 0.05 ? P_.bright : C.vellum[L]; g.lineWidth = 0.7 + a * 1.3;
      g.beginPath(); g.moveTo(bx, by); g.quadraticCurveTo(bx + (reduced ? 0 : Math.sin(T * 70 + i * 2) * a * 3), (by + top) / 2, bx, top); g.stroke();
    }
    g.globalAlpha = f.appear;
    chair(L); legs(L, -33, false);
    const sy = upper(f, L, lift, 0, P_);
    const j = reduced ? 0 : Math.sin(T * 26) * f.hit * 2.5;
    const ax = lerp(-6, -20 + j, r), ay = lerp(-40, -60, r), bx2 = lerp(6, -28 - j, r), by2 = lerp(-40, -74 - lift, r);
    arm(-16, sy, ax, ay, -6, L); hand(f, ax, ay, L);
    arm(16, sy, bx2, by2, 8, L); hand(f, bx2, by2, L);
  },
  piano(f, L, r, lift, P_) {
    // grand piano to the wing side, lid propped open
    g.strokeStyle = C.gloss[L]; g.lineWidth = 3;
    g.beginPath(); g.moveTo(16, -30); g.lineTo(16, 0); g.moveTo(86, -28); g.lineTo(86, 0); g.moveTo(54, -30); g.lineTo(54, 0); g.stroke();
    g.fillStyle = C.brass[Math.max(0, L - 3)];
    g.beginPath(); g.moveTo(12, -46); g.lineTo(96, -42); g.lineTo(84, -52); g.lineTo(22, -55); g.fill();
    g.fillStyle = C.gloss[L];
    g.beginPath(); g.moveTo(12, -46); g.lineTo(98, -40); g.lineTo(44, -100); g.closePath(); g.fill();
    line(62, -44, 54, -84, 1.2, C.gloss[Math.min(10, L + 3)]);
    g.beginPath(); g.moveTo(6, -30); g.lineTo(6, -46); g.lineTo(60, -47); g.bezierCurveTo(82, -47, 98, -44, 99, -36); g.lineTo(97, -28); g.closePath(); g.fill();
    g.globalAlpha = f.appear * (0.25 + f.lit * 0.5); line(12, -46, 44, -100, 1, P_.rim); line(6, -46, 60, -47, 1, P_.rim); g.globalAlpha = f.appear;
    g.fillStyle = C.shirt[L]; g.fillRect(-1, -47, 14, 4);
    g.fillStyle = C.gloss[L]; for (let i = 0; i < 6; i++) g.fillRect(i * 2.4, -47, 1, 2.2);
    g.fillStyle = C.chair[L]; g.fillRect(-15, -35, 30, 4); g.fillRect(-14, -31, 3, 31); g.fillRect(11, -31, 3, 31);
    legs(L, -33, false);
    const sy = upper(f, L, lift, 0, P_);
    const bob1 = f.side ? f.strike * 4 : 0, bob2 = f.side ? 0 : f.strike * 4;
    const ax = lerp(-6, 3, r), ay = lerp(-38, -50 + bob1, r), bx = lerp(6, 10, r), by = lerp(-38, -50 + bob2, r);
    arm(-16, sy, ax, ay, -7, L); hand(f, ax, ay, L);
    arm(16, sy, bx, by, 6, L); hand(f, bx, by, L);
  },
  glock(f, L, r, lift, P_) {
    legs(L, -47, true);
    const sy = upper(f, L, lift * 0.6, 14, P_);
    // frame + bars
    line(-24, -42, -28, 0, 2, C.gloss[L]); line(24, -42, 28, 0, 2, C.gloss[L]);
    g.fillStyle = C.gloss[L]; g.fillRect(-30, -46, 60, 3);
    for (let i = 0; i < 10; i++) {
      const x = -26 + i * 5.8, len = 13 - i * 0.7, a = f.amps[i];
      g.fillStyle = C.silver[L]; g.fillRect(x, -53, 4.4, len * 0.55);
      if (a > 0.03) { g.globalCompositeOperation = 'lighter'; g.globalAlpha = f.appear * a; g.fillStyle = P_.bright; g.fillRect(x - 0.5, -53.5, 5.4, len * 0.55 + 1); g.drawImage(P_.glow, x - 8, -60, 20, 20); g.globalCompositeOperation = 'source-over'; g.globalAlpha = f.appear; }
    }
    mallets(f, L, r, sy, -54, -12, 12, 18);
  },
  timpani(f, L, r, lift, P_) {
    legs(L, -47, true);
    const sy = upper(f, L, lift * 0.6, 14, P_);
    for (const [x, rx] of [[-19, 17], [19, 15]]) {
      const y = -31;
      g.fillStyle = C.copper[L]; g.beginPath(); g.ellipse(x, y, rx, 22, 0, 0, Math.PI); g.fill();
      g.globalAlpha = f.appear * (0.3 + f.lit * 0.5); g.strokeStyle = C.copper[10]; g.lineWidth = 1.2; g.beginPath(); g.ellipse(x, y, rx - 3, 18, 0, Math.PI * 0.15, Math.PI * 0.45); g.stroke(); g.globalAlpha = f.appear;
      line(x - rx * 0.6, y + 18, x - rx * 0.8, 0, 1.6, C.gloss[L]); line(x + rx * 0.6, y + 18, x + rx * 0.8, 0, 1.6, C.gloss[L]);
      g.fillStyle = C.vellum[L]; g.beginPath(); g.ellipse(x, y, rx, 4.6, 0, 0, TAU); g.fill();
      g.strokeStyle = C.brass[L]; g.lineWidth = 1.4; g.stroke();
      const hitThis = f.side === (x > 0 ? 1 : 0) ? f.strike : 0;
      if (hitThis > 0.03) { g.globalCompositeOperation = 'lighter'; g.globalAlpha = f.appear * hitThis; g.drawImage(P_.glow, x - rx * 1.4, y - 10, rx * 2.8, 20); g.globalCompositeOperation = 'source-over'; g.globalAlpha = f.appear; }
    }
    mallets(f, L, r, sy, -33, -19, 19, 22);
  },
  choir(f, L, r, lift, P_) {
    const sy = upper(f, L, lift * 0.6, 14, P_, true);
    const fy = lerp(-56, -66 - lift, r);
    g.fillStyle = C.gloss[L]; g.fillRect(-10, fy - 6, 20, 12);
    g.fillStyle = C.vellum[L]; g.fillRect(-9, fy - 5, 8.4, 10); g.fillRect(0.6, fy - 5, 8.4, 10);
    arm(-16, sy, -9, fy + 2, -6, L); hand(f, -9, fy + 2, L);
    arm(16, sy, 9, fy + 2, 6, L); hand(f, 9, fy + 2, L);
    const my = -83 - lift * 0.6 - 14 + 4;
    g.fillStyle = '#1a0b0b'; g.beginPath(); g.ellipse(0, my, 2.3, 0.8 + f.hit * 2.6 * r, 0, 0, TAU); g.fill();
    if (f.hit > 0.05) { g.globalCompositeOperation = 'lighter'; g.globalAlpha = f.appear * f.hit * 0.45; g.drawImage(P_.glow, -22, my - 26, 44, 44); g.globalCompositeOperation = 'source-over'; g.globalAlpha = f.appear; }
  },
};
// two mallets: one strikes (f.side) at f.sx / drum, the other hovers
function mallets(f, L, r, sy, surfaceY, lx, rx, hoverH) {
  const s = f.strike, lift = (1 - s) * (1 - s);
  const target = (side) => (f.pose === 'glock' ? f.sx : side ? 19 : -19);
  const hit = (side) => f.side === side && s > 0.02;
  const headL = hit(0) ? [target(0), surfaceY - 2 - lift * hoverH] : [lx, surfaceY - hoverH];
  const headR = hit(1) ? [target(1), surfaceY - 2 - lift * hoverH] : [rx, surfaceY - hoverH];
  const restL = [-18, -40], restR = [18, -40];
  const hL = [lerp(restL[0], headL[0] - 4, r), lerp(restL[1], headL[1] - 12, r)];
  const hR = [lerp(restR[0], headR[0] + 4, r), lerp(restR[1], headR[1] - 12, r)];
  const mL = [lerp(-20, headL[0], r), lerp(-24, headL[1], r)], mR = [lerp(20, headR[0], r), lerp(-24, headR[1], r)];
  line(hL[0], hL[1], mL[0], mL[1], 1.3, C.vellum[L]); line(hR[0], hR[1], mR[0], mR[1], 1.3, C.vellum[L]);
  g.fillStyle = C.wood[Math.min(10, L + 2)]; g.beginPath(); g.arc(mL[0], mL[1], 2.6, 0, TAU); g.moveTo(mR[0] + 2.6, mR[1]); g.arc(mR[0], mR[1], 2.6, 0, TAU); g.fill();
  arm(-16, sy, hL[0], hL[1], -7, L); hand(f, hL[0], hL[1], L);
  arm(16, sy, hR[0], hR[1], 7, L); hand(f, hR[0], hR[1], L);
}

// ---------- conductor ----------
function conductorHand(now, spb) {
  const since = (now - beatAt) / (spb * 1000), t = clamp(since, 0, 1), bi = ((lastBeat % 4) + 4) % 4;
  const A = PAT[bi], B = PAT[(bi + 1) % 4], amp = 0.75 + level * 0.45;
  let x = lerp(A[0], B[0], t), y = lerp(A[1], B[1], bi === 3 ? t * t : t) - REB[bi] * Math.sin(Math.PI * t);
  x = 14 + (x - 14) * amp; y = -72 + (y + 72) * amp;
  return [x, y];
}
function drawConductor(now, spb) {
  const k = cond.h / 100, c = cond.c;
  const [px, py] = conductorHand(now, spb);
  const hx = lerp(20, px, c), hy = lerp(-46, py, c);
  const dx = hx - 4, dy = hy + 30, dl = Math.hypot(dx, dy) || 1;
  const bxl = lerp(0.2, dx / dl, c), byl = lerp(1, dy / dl, c), bl = Math.hypot(bxl, byl) || 1;
  const tipX = hx + (bxl / bl) * 34, tipY = hy + (byl / bl) * 34;
  // trail (world coords)
  const tx = cond.x + tipX * k, ty = cond.y + tipY * k;
  cond.trail[cond.tn * 2] = tx; cond.trail[cond.tn * 2 + 1] = ty; cond.tn = (cond.tn + 1) % 28; cond.tfill = Math.min(28, cond.tfill + 1);
  cond.tx = tx; cond.ty = ty;
  // light pool on the podium
  g.globalCompositeOperation = 'lighter';
  g.globalAlpha = 0.35 + 0.25 * level; g.drawImage(WARM, cond.x - cond.h * 0.6, cond.y - cond.h * 0.12, cond.h * 1.2, cond.h * 0.3);
  g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
  const L = Math.round(10 * clamp(0.45 + 0.35 * house + cond.hov * 0.3 + downFlash * 0.2, 0, 1));
  g.save(); g.translate(cond.x, cond.y); g.scale(k, k);
  // podium
  g.fillStyle = C.chair[Math.min(10, L)]; g.beginPath(); g.moveTo(-30, 0); g.lineTo(30, 0); g.lineTo(34, 12); g.lineTo(-34, 12); g.fill();
  g.fillStyle = C.chair[Math.max(0, L - 4)]; g.fillRect(-34, 12, 68, 10);
  g.fillStyle = '#c99a3e'; g.fillRect(-34, 11.5, 68, 1);
  // legs + tails (seen from behind)
  g.strokeStyle = C.gloss[L]; g.lineWidth = 11; g.beginPath(); g.moveTo(-6, -46); g.lineTo(-8, -3); g.moveTo(6, -46); g.lineTo(8, -3); g.stroke();
  g.fillStyle = C.gloss[L]; g.beginPath(); g.moveTo(-14, -52); g.lineTo(-11, -20); g.lineTo(-1.5, -36); g.lineTo(1.5, -36); g.lineTo(11, -20); g.lineTo(14, -52); g.fill();
  const sy = -80;
  g.fillStyle = C.gloss[L];
  g.beginPath(); g.moveTo(-13, -50); g.quadraticCurveTo(-18, -66, -19, sy + 3); g.quadraticCurveTo(-17, sy - 4, -7, sy - 6); g.lineTo(7, sy - 6); g.quadraticCurveTo(17, sy - 4, 19, sy + 3); g.quadraticCurveTo(18, -66, 13, -50); g.fill();
  g.fillStyle = C.shirt[L]; g.fillRect(-4, sy - 8, 8, 3);
  g.fillStyle = C.skin[L]; g.beginPath(); g.arc(-9.5, sy - 16, 2, 0, TAU); g.arc(9.5, sy - 16, 2, 0, TAU); g.fill();
  g.fillStyle = C.hair2[Math.max(0, L - 2)]; g.beginPath(); g.arc(0, sy - 17, 10, 0, TAU); g.fill();
  // left hand: mirrors softly and lifts with the music
  const lx = lerp(-20, -10 - (px - 14) * 0.45, c), ly = lerp(-46, py * 0.6 - 30 - level * 18 - tutti * 10, c);
  const armCol = C.gloss[Math.min(10, L + 1)];
  g.strokeStyle = armCol; g.lineWidth = 7;
  g.beginPath(); g.moveTo(-17, sy + 1); g.lineTo((lx - 17) / 2 - 6, (ly + sy) / 2 + 8); g.lineTo(lx, ly); g.stroke();
  g.beginPath(); g.moveTo(17, sy + 1); g.lineTo((hx + 17) / 2 + 6, (hy + sy) / 2 + 8); g.lineTo(hx, hy); g.stroke();
  g.fillStyle = C.skin[L]; g.beginPath(); g.arc(lx, ly, 3.3, 0, TAU); g.moveTo(hx + 3.3, hy); g.arc(hx, hy, 3.3, 0, TAU); g.fill();
  line(hx, hy, tipX, tipY, 1.6, '#f6efe2');
  if (cond.hov > 0.05) { g.globalAlpha = cond.hov; g.strokeStyle = 'hsl(42 90% 75%)'; g.lineWidth = 1.5; g.beginPath(); g.arc(0, sy - 17, 10.5, Math.PI, TAU); g.stroke(); g.globalAlpha = 1; }
  g.restore();
}
function drawTrail() {
  if (cond.c < 0.05 || cond.tfill < 3) return;
  g.globalCompositeOperation = 'lighter'; g.lineCap = 'round';
  const n = cond.tfill;
  for (let i = 1; i < n; i++) {
    const a = (cond.tn - i + 28) % 28, b = (cond.tn - i - 1 + 28) % 28, t = 1 - i / n;
    g.globalAlpha = t * t * 0.85 * cond.c;
    g.strokeStyle = i < 4 ? '#fff4d8' : 'hsl(40 100% 68%)'; g.lineWidth = (0.6 + 3.2 * t) * S;
    g.beginPath(); g.moveTo(cond.trail[a * 2], cond.trail[a * 2 + 1]); g.lineTo(cond.trail[b * 2], cond.trail[b * 2 + 1]); g.stroke();
  }
  if (downFlash > 0.02) { const s = (40 + 60 * loopFlash) * S * (0.6 + downFlash * 0.6); g.globalAlpha = downFlash * 0.8; g.drawImage(WARM, cond.tx - s, cond.ty - s, s * 2, s * 2); }
  g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
}

// ---------- hall lights ----------
function drawLights() {
  g.globalCompositeOperation = 'lighter';
  // organ / back-wall breath
  const ga = 0.06 + level * 0.32 + tutti * 0.15;
  g.globalAlpha = ga; g.drawImage(WARM, CX - W * 0.32, BACKY - H * 0.32, W * 0.64, H * 0.5);
  if (tutti > 0.02 && nHues) { g.globalAlpha = tutti * (0.18 + level * 0.25); g.drawImage(glowSprite(Math.round(activeHues[Math.floor(T * 0.4) % nHues])), CX - W * 0.4, BACKY - H * 0.25, W * 0.8, H * 0.6); }
  for (const f of figs) {
    if (f.lit < 0.02) continue;
    const P_ = pal(f.inst), w = f.h * 1.15, a = f.lit * f.appear;
    g.globalAlpha = a * (0.16 + level * 0.12);
    g.drawImage(SPOT, f.x - w / 2, VAL * 0.6, w, f.y - VAL * 0.6 + f.h * 0.08);
    g.globalAlpha = a * 0.55; g.drawImage(WARM, f.x - w * 0.6, f.y - f.h * 0.12, w * 1.2, f.h * 0.24);
    g.globalAlpha = a * (0.22 + f.hit * 0.35); g.drawImage(P_.glow, f.x - w * 0.5, f.y - f.h * 0.04, w, f.h * 0.55);
  }
  for (const f of figs) {
    if (f.hov < 0.02) continue;
    g.globalAlpha = f.hov * 0.5; g.drawImage(pal(f.inst).glow, f.x - f.h * 0.7, f.y - f.h * 1.1, f.h * 1.4, f.h * 1.2);
  }
  g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
}
function drawBeams() {
  if (tutti < 0.02 || !nHues) return;
  g.globalCompositeOperation = 'lighter';
  const n = W < 640 ? 4 : 6;
  for (let i = 0; i < n; i++) {
    const x = SIDE + ((W - SIDE * 2) * (i + 0.5)) / n, ang = (reduced ? 0.25 : Math.sin(T * 0.55 + i * 1.7)) * 0.5 + (i < n / 2 ? 0.12 : -0.12);
    const hue = activeHues[(i + Math.floor(T * 0.35)) % nHues];
    g.save(); g.translate(x, VAL * 0.5); g.rotate(ang);
    g.globalAlpha = tutti * (0.1 + level * 0.22);
    g.drawImage(coneSprite(Math.round(hue), 95, 68), -W * 0.07, 0, W * 0.14, H * 1.05);
    g.restore();
  }
  g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
}
function drawChandeliers() {
  g.globalCompositeOperation = 'lighter';
  for (const [x, y, s0] of CHAND) {
    const s = s0 * S, glowA = 0.18 + level * 0.55 + tutti * 0.25 + downFlash * 0.12 * house;
    g.globalAlpha = Math.min(1, glowA); g.drawImage(WARM, x - 110 * s, y - 80 * s, 220 * s, 170 * s);
    g.globalAlpha = 1;
    g.strokeStyle = 'rgba(214,170,90,0.55)'; g.lineWidth = 1;
    g.beginPath(); g.moveTo(x, 0); g.lineTo(x, y - 12 * s); g.stroke();
    for (let tier = 0; tier < 3; tier++) {
      const rx = (12 + tier * 9) * s, ry = (3 + tier * 1.6) * s, ty = y + (tier * 7 - 6) * s, n = 6 + tier * 3;
      g.globalAlpha = 0.5; g.beginPath(); g.ellipse(x, ty, rx, ry, 0, 0, TAU); g.stroke();
      for (let j = 0; j < n; j++) {
        const a = (j / n) * TAU + tier, cx = x + Math.cos(a) * rx, cy = ty + Math.sin(a) * ry;
        const tw = reduced ? 0.8 : 0.55 + 0.45 * Math.sin(T * (3 + j * 0.37) + j * 2.1 + tier);
        g.globalAlpha = clamp((0.35 + level * 0.65) * tw + tutti * 0.2, 0, 1);
        g.fillStyle = '#ffe6b0'; g.beginPath(); g.arc(cx, cy, (1.2 + tier * 0.2) * s, 0, TAU); g.fill();
        if (tier === 2) { g.globalAlpha *= 0.6; g.fillRect(cx - 0.4 * s, cy + 1.5 * s, 0.8 * s, (4 + (j % 3) * 2) * s); }
      }
    }
  }
  g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
}
function drawCurtainShimmer() {
  const a = 0.04 + hi * 0.35 + tutti * 0.08; if (a < 0.02) return;
  g.globalCompositeOperation = 'lighter';
  const pos = reduced ? 0.5 : (T * 0.12) % 1.6 - 0.3;
  for (const flip of [0, 1]) {
    const x0 = flip ? W - SIDE * 1.5 : 0;
    const gr = g.createLinearGradient(0, H * (pos - 0.25), 0, H * (pos + 0.25));
    gr.addColorStop(0, 'rgba(255,90,90,0)'); gr.addColorStop(0.5, `rgba(255,120,110,${a})`); gr.addColorStop(1, 'rgba(255,90,90,0)');
    g.fillStyle = gr; g.fillRect(x0, 0, SIDE * 1.5, H);
  }
  g.globalCompositeOperation = 'source-over';
}

// ---------- particles ----------
function drawParticles(dt, bA, bE, bF) {
  g.globalCompositeOperation = 'lighter';
  g.font = '20px Georgia, "Times New Roman", serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  for (let i = 0; i < MAXP; i++) {
    const p = P[i]; if (!p.on) continue;
    p.life += dt; if (p.life >= p.max) { p.on = false; continue; }
    const k = p.life / p.max;
    p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt;
    if (p.t === GLYPH) {
      p.vy *= 1 - 0.35 * dt; p.vx += Math.sin(p.life * 3 + i) * 8 * S * dt;
      const a = k < 0.12 ? k / 0.12 : 1 - (k - 0.12) / 0.88, sc = (p.size / 20) * (0.85 + 0.35 * k), c = Math.cos(p.rot) * sc * bA, s = Math.sin(p.rot) * sc * bA;
      g.setTransform(c, s, -s, c, bA * p.x + bE, bA * p.y + bF);
      g.globalAlpha = a * 0.6; g.drawImage(p.spr, -22, -22, 44, 44);
      g.globalAlpha = a; g.fillStyle = p.col; g.fillText(p.ch, 0, 0);
    } else if (p.t === STAR) {
      p.vx *= 1 - 2 * dt; p.vy *= 1 - 2 * dt;
      const sz = p.size * (1 - k * 0.6), c = Math.cos(p.rot) * bA, s = Math.sin(p.rot) * bA;
      g.setTransform(c, s, -s, c, bA * p.x + bE, bA * p.y + bF);
      g.globalAlpha = 1 - k; g.fillStyle = p.col;
      g.beginPath(); g.moveTo(0, -sz * 2); g.lineTo(sz * 0.35, -sz * 0.35); g.lineTo(sz * 2, 0); g.lineTo(sz * 0.35, sz * 0.35); g.lineTo(0, sz * 2); g.lineTo(-sz * 0.35, sz * 0.35); g.lineTo(-sz * 2, 0); g.lineTo(-sz * 0.35, -sz * 0.35); g.fill();
    } else if (p.t === RING) {
      g.setTransform(bA, 0, 0, bA, bE, bF);
      const rr = p.size * (0.25 + 1.1 * (1 - (1 - k) * (1 - k)));
      g.globalAlpha = (1 - k) * (1 - k); g.strokeStyle = p.col; g.lineWidth = (1 - k) * 3 * S + 0.5;
      g.beginPath(); g.ellipse(p.x, p.y, rr, rr * p.q, 0, 0, TAU); g.stroke();
    } else {
      g.setTransform(bA, 0, 0, bA, bE, bF);
      if (p.t === SPARK) p.vy += 6 * S * dt;
      g.globalAlpha = Math.sin(Math.PI * k) * (p.t === MOTE ? 0.45 : 0.6 + 0.4 * Math.sin(p.life * 18 + i));
      g.fillStyle = p.col; g.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
  }
  g.setTransform(bA, 0, 0, bA, bE, bF);
  g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
}

// ---------- label ----------
function drawLabel() {
  const f = hover; if (!f) return;
  let title, state, x, y, hue;
  if (f === cond) { title = 'The conductor'; state = activeN ? 'click to stop everyone' : 'click for tutti'; x = cond.x; y = cond.y - cond.h * 1.12; hue = 42; }
  else {
    if (f.leaving) return;
    title = `${f.inst.name || f.inst.id} ${f.seat.k + 1}`;
    state = (f.seat.active ? (f.seat.loop ? 'playing · looping' : 'playing once') : f.seat.loop ? 'resting · will loop' : 'resting · plays once');
    x = f.x; y = f.y - f.h * (STANDING[f.pose] ? 1.18 : 1.06) - (f.pose === 'harp' ? f.h * 0.25 : 0); hue = pal(f.inst).h;
  }
  g.font = `italic ${Math.round(15 * clamp(S, 0.8, 1.1))}px Georgia, serif`;
  const tw = g.measureText(title).width;
  g.font = `600 ${Math.round(10.5 * clamp(S, 0.85, 1.1))}px system-ui, sans-serif`;
  const sw = g.measureText(state.toUpperCase()).width;
  const w = Math.max(tw, sw) + 22, h = 40 * clamp(S, 0.85, 1.1);
  x = clamp(x, w / 2 + 6, W - w / 2 - 6); y = Math.max(h + 6, y);
  g.fillStyle = 'rgba(14,10,16,0.88)'; g.strokeStyle = `hsl(${hue} 70% 62% / 0.7)`; g.lineWidth = 1;
  g.beginPath();
  if (g.roundRect) g.roundRect(x - w / 2, y - h, w, h, 8); else g.rect(x - w / 2, y - h, w, h);
  g.fill(); g.stroke();
  g.textAlign = 'center'; g.textBaseline = 'alphabetic';
  g.fillStyle = `hsl(${hue} 85% 80%)`; g.font = `italic ${Math.round(15 * clamp(S, 0.8, 1.1))}px Georgia, serif`; g.fillText(title, x, y - h * 0.52);
  g.fillStyle = 'rgba(243,237,228,0.7)'; g.font = `600 ${Math.round(10.5 * clamp(S, 0.85, 1.1))}px system-ui, sans-serif`; g.fillText(state.toUpperCase(), x, y - h * 0.18);
}
function drawHint() {
  if (interacted || activeN) { hintA = Math.max(0, hintA - 0.04); } else hintA = Math.min(1, hintA + 0.02);
  if (hintA < 0.01) return;
  g.globalAlpha = hintA * (0.6 + 0.25 * Math.sin(T * 2.2));
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = `italic ${Math.round(clamp(15 * S, 12, 17))}px Georgia, serif`; g.fillStyle = '#f3ede4';
  g.fillText(W < 520 ? 'Tap a musician to bring them in' : 'Click a musician to bring them in · shift-click to play once · click the conductor for everyone', CX, H - 14 * clamp(S, 0.8, 1.2));
  g.globalAlpha = 1;
}
let hintA = 0;

// ---------- frame loop ----------
let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (!visible || !W || W < 2) return;
  T += dt;
  analyse(dt);
  const spb = 60 / BPM(), loopSec = spb * LOOP;
  activeN = 0; total = 0; nHues = 0;
  for (const s of seats) { total++; if (s.active) { activeN++; const h = byId[s.inst]?.hue ?? 30; let dup = false; for (let i = 0; i < nHues; i++) if (activeHues[i] === h) dup = true; if (!dup && nHues < 32) activeHues[nHues++] = h; } }
  house = ease(house, activeN ? 1 : 0, 1.6, dt);
  const tt = total > 3 && activeN / total >= 0.7 ? 1 : 0;
  tutti = ease(tutti, tt, tt ? 1.1 : 0.9, dt);
  downFlash *= Math.exp(-5 * dt); loopFlash *= Math.exp(-2.5 * dt); shake *= Math.exp(-14 * dt);
  const since = (now - beatAt) / (spb * 1000);
  cond.c = ease(cond.c, activeN && since < 2.5 ? 1 : 0, 3, dt);
  cond.hov = ease(cond.hov, hover === cond ? 1 : 0, 12, dt);
  for (let i = figs.length - 1; i >= 0; i--) {
    const f = figs[i], act = !f.leaving && f.seat.active;
    if (act && !f.was) { f.cyc = 0; f.pending = true; }
    f.was = act;
    if (f.delay > 0) { f.delay -= dt; continue; }
    f.x = ease(f.x, f.tx, 5, dt); f.y = ease(f.y, f.ty, 5, dt); f.h = ease(f.h, f.th, 5, dt);
    f.appear = ease(f.appear, f.leaving ? 0 : 1, f.leaving ? 7 : 3.2, dt);
    if (f.leaving && f.appear < 0.02) { figs.splice(i, 1); figMap.delete(f.id); if (hover === f) hover = null; continue; }
    f.lit = ease(f.lit, act ? 1 : 0, act ? 5 : 2.4, dt);
    f.rise = ease(f.rise, act ? 1 : 0, act ? 4.5 : 3, dt);
    f.hit *= Math.exp(-6 * dt); f.flash *= Math.exp(-4 * dt); f.strike *= Math.exp(-9 * dt);
    for (let j = 0; j < 12; j++) f.amps[j] *= Math.exp(-2.6 * dt);
    f.hov = ease(f.hov, f === hover ? 1 : 0, 12, dt);
    if (act && !f.pending) f.cyc += dt / loopSec;
    if (f.bowT0) f.bowU = lerp(f.bowFrom, f.bowTo, smooth(clamp((now - f.bowT0) / f.bowDur, 0, 1)));
    if (!reduced && f.lit > 0.5 && Math.random() < dt * 0.9) spawn(MOTE, f.x + rnd(-0.3, 0.3) * f.h, rnd(VAL, f.y), rnd(-4, 4) * S, rnd(-8, 3) * S, rnd(2.5, 4), 1.4 * S, '#ffe9c4', null);
  }
  if (!reduced && tutti > 0.3 && Math.random() < dt * 40 * tutti * (0.3 + level)) spawn(SPARK, rnd(SIDE, W - SIDE), VAL + rnd(0, 20) * S, rnd(-6, 6) * S, rnd(20, 50) * S, rnd(2.5, 4), rnd(1.2, 2.4) * S, Math.random() < 0.7 ? '#ffd88a' : '#fff6e2', null);

  // camera
  camZ = reduced ? 1 : 1 + tutti * (0.03 + level * 0.012) + Math.sin(T * 0.15) * 0.004;
  const sx = reduced ? 0 : (Math.random() - 0.5) * shake * 2.4 * S, sy = reduced ? 0 : (Math.random() - 0.5) * shake * 2.4 * S;
  camX = sx; camY = sy;
  const px = CX, py = H * 0.6;
  const bA = DPR * camZ, bE = DPR * (camX + px * (1 - camZ)), bF = DPR * (camY + py * (1 - camZ));
  g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
  g.fillStyle = '#060406'; g.fillRect(0, 0, cv.width, cv.height);
  g.setTransform(bA, 0, 0, bA, bE, bF);
  g.drawImage(bg, 0, 0, W, H);
  if (house > 0.01) { g.fillStyle = `rgba(5,2,6,${0.3 * house})`; g.fillRect(0, 0, W, H); }
  g.lineCap = 'round'; g.lineJoin = 'round';
  drawLights();
  for (const f of figs) drawFig(f, now);
  drawConductor(now, spb);
  drawTrail();
  drawParticles(dt, bA, bE, bF);
  drawBeams();
  g.drawImage(fg, 0, 0, W, H);
  drawCurtainShimmer();
  drawChandeliers();
  if (loopFlash > 0.02 && house > 0.2) { g.globalCompositeOperation = 'lighter'; g.globalAlpha = loopFlash * 0.25; g.drawImage(WARM, CX - W * 0.6, cond.y - H * 0.9, W * 1.2, H * 1.2); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over'; }
  drawLabel();
  drawHint();
}
fit();
relayout();
requestAnimationFrame(frame);
