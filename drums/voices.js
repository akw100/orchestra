// Drum kit voices, picked by General MIDI note. Signature matches audio.js voices:
//   drumVoice(f, t, dur, vel, out, detune, midi)
// Each kit piece is a small synth graph written against any BaseAudioContext. At load every piece is
// pre-rendered once (OfflineAudioContext) into velocity layers x round-robins, so a hit is just
// BufferSource -> Gain. Until a piece has rendered, hits run the same graph live on ctx.
// Velocity picks the layer (soft = darker, shorter, less click/crack; hard = brighter, longer ring)
// and then scales the gain. A closed/pedal hat chokes an open hat ringing on the same output node.
import { ctx, noiseBuf } from '../audio.js';

const SR = ctx.sampleRate;
const Offline = window.OfflineAudioContext || window.webkitOfflineAudioContext;

// ---------- graph helpers (c = any BaseAudioContext; each returns the node you connect INTO) ----------
const curves = new Map();
function drive(c, k, out) { // tanh saturation: glue, harmonics for small speakers, soft peak limit
  k = Math.round(k * 10) / 10;
  if (!curves.has(k)) {
    const n = 2048, a = new Float32Array(n), d = Math.tanh(k);
    for (let i = 0; i < n; i++) a[i] = Math.tanh(k * ((i / (n - 1)) * 2 - 1)) / d;
    curves.set(k, a);
  }
  const w = c.createWaveShaper(); w.curve = curves.get(k); w.oversample = c === ctx ? '2x' : '4x';
  w.connect(out); return w;
}
function filt(c, type, freq, q, out, gain) {
  const f = c.createBiquadFilter(); f.type = type; f.frequency.value = Math.min(freq, c.sampleRate * 0.45); // low-rate devices
  if (q != null) f.Q.value = q; if (gain != null) f.gain.value = gain;
  f.connect(out); return f;
}
function amp(c, out, v = 1) { const g = c.createGain(); g.gain.value = v; g.connect(out); return g; }
// percussive envelope: linear attack a, optional hold, exponential fall reaching -60 dB after d seconds
function env(c, out, t, peak, a, d, hold = 0) {
  const g = c.createGain(), p = g.gain;
  p.setValueAtTime(0, t); p.linearRampToValueAtTime(peak, t + a);
  if (hold) p.setValueAtTime(peak, t + a + hold);
  p.setTargetAtTime(0, t + a + hold, d / 6.9);
  g.connect(out); return g;
}
// two-stage: fast drop to `mid` (the stick transient) then a long ring to silence (-60 dB after d)
function env2(c, out, t, peak, mid, d, drop = 0.02, a = 0.0015) {
  const g = c.createGain(), p = g.gain;
  p.setValueAtTime(0, t); p.linearRampToValueAtTime(peak, t + a);
  p.setTargetAtTime(peak * mid, t + a, drop); p.setTargetAtTime(0, t + a + drop * 3, d / 6.9);
  g.connect(out); return g;
}
function noise(c, t, end, out) { // looped shared noise, random start: every hit / round-robin differs
  const s = c.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
  s.connect(out); s.start(t, Math.random() * noiseBuf.duration); s.stop(end); return s;
}
function osc(c, type, freq, t, end, out) {
  const o = c.createOscillator(); o.type = type; o.frequency.value = freq;
  o.connect(out); o.start(t); o.stop(end); return o;
}
function sweep(o, t, f0, f1, r1, f2, r2) { // pitch: f0 -> f1 at t+r1 -> f2 at t+r2 (exponential)
  const p = o.frequency; p.setValueAtTime(f0, t); p.exponentialRampToValueAtTime(f1, t + r1);
  if (f2) p.exponentialRampToValueAtTime(f2, t + r2);
}
// TR-808 metal: six squares at inharmonic frequencies; their high harmonics make the cymbal spectrum
const METAL = [205.3, 304.4, 369.6, 522.7, 540, 800];
function metal(c, t, end, out, k = 1, g = 1) {
  const m = amp(c, out, g); METAL.forEach((f) => osc(c, 'square', f * k, t, end, m)); return m;
}
function ring(c, t, end, out, f) { // ring modulator: input x square(f) -> denser, clangier partials
  const g = c.createGain(); g.gain.value = 0; osc(c, 'square', f, t, end, g.gain); g.connect(out); return g;
}

// ---------- kit pieces: fn(c, out, t, vel, end) ----------
function kick(c, out, t, v, end) {
  const lv = v ** 1.3, o = drive(c, 2.2 + 2 * v, amp(c, out, 0.8));
  // body: sine with a fast pitch drop (the punch) settling near 50 Hz (the sub); drive adds the
  // 150-250 Hz harmonics that keep it audible on laptop speakers
  sweep(osc(c, 'sine', 60, t, end, env(c, o, t, lv, 0.0015, 0.34 + 0.14 * v, 0.012)), t, 110 + 120 * v, 60, 0.045, 48, 0.4);
  // knock: a short second-harmonic thump for chest punch
  sweep(osc(c, 'sine', 120, t, end, env(c, o, t, 0.4 * lv, 0.001, 0.07)), t, 240 + 120 * v, 115, 0.03);
  // skin: low-mid noise puff
  noise(c, t, end, filt(c, 'bandpass', 200, 0.9, env(c, o, t, 0.6 * lv, 0.001, 0.07)));
  // beater: bright click + a tiny knock, mostly on harder hits
  noise(c, t, end, filt(c, 'highpass', 1500, 0.7, filt(c, 'bandpass', 3800, 0.9, env(c, o, t, 1.6 * v * v, 0.0004, 0.016))));
  sweep(osc(c, 'triangle', 1600, t, end, env(c, o, t, 0.35 * v ** 1.5, 0.0004, 0.022)), t, 1700, 480, 0.008);
}
function snare(c, out, t, v, end) {
  const lv = v ** 1.3, o = drive(c, 1.2 + 1.8 * v, filt(c, 'highpass', 90, 0.7, amp(c, out, 0.8)));
  // drum head: three membrane modes with a quick downward bend; upper modes only speak when hit hard
  [[1, 1, 0.16], [1.59, 0.45 + 0.3 * v, 0.11], [2.14, 0.3 * v, 0.07]].forEach(([r, a, d]) =>
    sweep(osc(c, 'sine', 185 * r, t, end, env(c, o, t, (0.3 + 0.4 * v) * a * lv, 0.001, d + 0.06 * v)), t, 185 * r * 1.25, 185 * r, 0.02));
  // wires: a hair late, darker and shorter when soft (ghost notes)
  noise(c, t, end, filt(c, 'highpass', 1400, 0.7, filt(c, 'lowpass', 3200 + 9500 * v * v, 0.7,
    filt(c, 'peaking', 5200, 1, env(c, o, t, 0.6 * lv, 0.003, 0.16 + 0.18 * v), 4))));
  // stick crack + mid "meat"
  noise(c, t, end, filt(c, 'bandpass', 2600, 0.9, env(c, o, t, 0.9 * v * v, 0.0004, 0.03)));
  noise(c, t, end, filt(c, 'bandpass', 900, 0.9, env(c, o, t, 0.45 * lv, 0.0008, 0.06)));
}
function stick(c, out, t, v, end) { // side stick / cross-stick: woody tock + rim click
  const lv = v ** 1.2, o = drive(c, 2, filt(c, 'highpass', 220, 0.7, amp(c, out, 0.9)));
  noise(c, t, end, filt(c, 'bandpass', 1700 + 700 * v, 5, env(c, o, t, 3 * lv, 0.0004, 0.045)));
  osc(c, 'triangle', 510, t, end, env(c, o, t, 0.45 * lv, 0.0004, 0.07));
  osc(c, 'sine', 1240, t, end, env(c, o, t, 0.22 * lv, 0.0004, 0.04));
  osc(c, 'sine', 190, t, end, env(c, o, t, 0.2 * lv, 0.001, 0.09));
}
function clap(c, out, t, v, end) { // a few hands slightly out of sync, then a little room
  const lv = v ** 1.3, o = filt(c, 'highpass', 500, 0.7, amp(c, out, 1));
  const g = c.createGain(), p = g.gain, n = v > 0.62 ? 4 : 3;
  g.connect(filt(c, 'bandpass', 1000 + 600 * v, 1.3, filt(c, 'peaking', 2500, 1, o, 3)));
  p.setValueAtTime(0, t);
  let s = t;
  for (let i = 0; i < n; i++) {
    s = t + i * 0.0105 + (i ? (Math.random() - 0.5) * 0.003 : 0);
    const last = i === n - 1;
    p.setValueAtTime(0, s); p.linearRampToValueAtTime(lv * (last ? 1 : 0.85), s + 0.0008);
    p.setTargetAtTime(0, s + 0.0008, last ? (0.1 + 0.08 * v) / 6.9 : 0.0035);
  }
  noise(c, t, end, g);
  noise(c, t, end, filt(c, 'bandpass', 1300, 0.6, env(c, filt(c, 'lowpass', 3500, 0.7, o), s, 0.3 * lv, 0.006, 0.38)));
}
// hi-hats: 808 metal + a little noise, band-limited high
function hatCore(c, e, t, end, bp, hp, k, nz) {
  metal(c, t, end, filt(c, 'highpass', hp, 0.7, filt(c, 'bandpass', bp, 0.8, e)), k, 1);
  noise(c, t, end, filt(c, 'highpass', hp + 800, 0.7, amp(c, e, nz)));
}
const tick = (c, o, t, end, v, lv, f = 4500) => // stick tip on metal
  noise(c, t, end, filt(c, 'bandpass', f, 1.1, env(c, o, t, 0.3 * v * lv, 0.0004, 0.01)));
function chh(c, out, t, v, end) {
  const lv = v ** 1.2, o = amp(c, out, 1);
  hatCore(c, env(c, o, t, lv, 0.0006, 0.035 + 0.075 * v ** 1.5), t, end, 10000, 7400 - 1800 * v, 1, 0.12);
  tick(c, o, t, end, v, lv);
}
function phh(c, out, t, v, end) { // foot "chick": softer attack, more mid, no sizzle
  const lv = v ** 1.2, o = amp(c, out, 1);
  hatCore(c, env(c, o, t, lv, 0.0035, 0.05), t, end, 8200, 5200, 0.94, 0.1);
  noise(c, t, end, filt(c, 'bandpass', 2300, 0.8, env(c, o, t, 0.8 * lv, 0.003, 0.04)));
}
function ohh(c, out, t, v, end) {
  const lv = v ** 1.2, o = amp(c, out, 1);
  hatCore(c, env2(c, o, t, lv, 0.6, 0.7 + 0.9 * v, 0.015, 0.001), t, end, 9500, 7000 - 1800 * v, 1, 0.14);
  tick(c, o, t, end, v, lv);
}
// crash / splash: metal + ring-mod metal in a band, noise wash, darkening as it rings
function cymbal(c, out, t, v, end, o) {
  const lv = v ** 1.2, D = o.D[0] + o.D[1] * v;
  const lp = filt(c, 'lowpass', o.lp0, 0.5, filt(c, 'highpass', o.hp, 0.7, amp(c, out, 1)));
  const ny = c.sampleRate * 0.45;
  lp.frequency.setValueAtTime(Math.min(ny, o.lp0 * (0.55 + 0.45 * v)), t); lp.frequency.exponentialRampToValueAtTime(Math.min(ny, o.lp1), t + D * 0.6);
  const e = env2(c, lp, t, lv, 0.55, D, 0.03, 0.002), band = filt(c, 'bandpass', o.bp, 0.55, e);
  metal(c, t, end, band, o.k, 0.5);
  metal(c, t, end, ring(c, t, end, band, o.ring), o.k * 1.13, 0.5);
  noise(c, t, end, filt(c, 'peaking', o.bp * 1.2, 1, amp(c, e, 0.25), 5));
  noise(c, t, end, filt(c, 'bandpass', 3200, 0.6, env(c, lp, t, 0.6 * v * lv, 0.001, 0.18)));
}
const crash = (c, out, t, v, end) => cymbal(c, out, t, v, end, { k: 1.71, ring: 1310, bp: 7200, hp: 2800, D: [2.2, 1.9], lp0: 16000, lp1: 7500 });
const splash = (c, out, t, v, end) => cymbal(c, out, t, v, end, { k: 2.4, ring: 1870, bp: 9000, hp: 4500, D: [0.75, 0.6], lp0: 17000, lp1: 9000 });
function china(c, out, t, v, end) { // trashy: distorted ring-mod metal, honky mids, faster decay
  const lv = v ** 1.2, o = filt(c, 'highpass', 900, 0.7, filt(c, 'peaking', 2600, 0.8, amp(c, out, 1), 6));
  const e = env2(c, o, t, lv, 0.5, 1.0 + 0.8 * v, 0.02), dirt = drive(c, 4, filt(c, 'bandpass', 3800, 0.5, e));
  metal(c, t, end, ring(c, t, end, dirt, 1730), 1.37, 0.35);
  metal(c, t, end, dirt, 1.9, 0.25);
  noise(c, t, end, filt(c, 'bandpass', 2400, 0.6, amp(c, e, 0.35)));
  noise(c, t, end, filt(c, 'bandpass', 1800, 0.7, env(c, o, t, 0.5 * v * lv, 0.001, 0.12)));
}
function ride(c, out, t, v, end) { // ping (narrow metal band + inharmonic partials) over a quiet wash
  const lv = v ** 1.2, o = filt(c, 'highpass', 350, 0.7, amp(c, out, 1));
  metal(c, t, end, filt(c, 'bandpass', 5000 + 1200 * v, 2.2, env(c, o, t, lv, 0.001, 1.3 + 0.7 * v)), 2.2, 0.5);
  [[2810, 0.1, 1.6], [3770, 0.07, 1.3], [5130, 0.05, 1.0], [740, 0.04, 2.0]].forEach(([f, a, d]) =>
    osc(c, 'sine', f, t, end, env(c, o, t, a * lv, 0.001, d)));
  noise(c, t, end, filt(c, 'highpass', 5500, 0.7, filt(c, 'peaking', 9000, 1, env(c, o, t, 0.13 * (0.5 + v) * lv, 0.02, 2.8 + 1.0 * v), 4)));
  tick(c, o, t, end, v, lv, 6000);
}
function bell(c, out, t, v, end) { // ride bell: strong bell partials, a bit of metal and wash
  const lv = v ** 1.2, o = filt(c, 'highpass', 400, 0.7, amp(c, out, 1)), f0 = 760;
  [[1, 1, 2.6], [1.47, 0.5, 1.6], [2.02, 0.75, 2.1], [2.74, 0.4, 1.3], [3.53, 0.3, 1.0], [4.41, 0.2 + 0.2 * v, 0.7]].forEach(([r, a, d]) =>
    osc(c, 'sine', f0 * r, t, end, env(c, o, t, 0.22 * a * lv, 0.0008, d * (1.2 + 0.4 * v))));
  metal(c, t, end, filt(c, 'bandpass', 3400, 1.4, env(c, o, t, 0.6 * lv, 0.001, 0.9)), 2.6, 0.5);
  noise(c, t, end, filt(c, 'highpass', 6000, 0.7, env(c, o, t, 0.05 * lv, 0.01, 2)));
  tick(c, o, t, end, v, lv, 3000);
}
function tamb(c, out, t, v, end) { // jingles: two or three quick metal flurries
  const lv = v ** 1.2, o = filt(c, 'highpass', 5500, 0.7, filt(c, 'bandpass', 9500, 1.2, amp(c, out, 1)));
  const g = c.createGain(), p = g.gain; g.connect(o); p.setValueAtTime(0, t);
  [0, 0.014, 0.027].forEach((d, i) => {
    const s = t + d + (i ? (Math.random() - 0.5) * 0.004 : 0);
    p.setValueAtTime(lv * (i ? 0.7 : 1), s); p.setTargetAtTime(0, s, i === 2 ? (0.18 + 0.12 * v) / 6.9 : 0.006);
  });
  metal(c, t, end, g, 4.3, 0.5);
  noise(c, t, end, amp(c, g, 0.3));
}
function cow(c, out, t, v, end) { // 808 cowbell: two squares, band-passed, two-stage decay
  const lv = v ** 1.2, o = filt(c, 'lowpass', 4500, 0.7, filt(c, 'bandpass', 900, 0.6, amp(c, out, 1)));
  const e = env2(c, o, t, lv, 0.35, 0.32, 0.012, 0.001);
  [562, 845].forEach((f) => osc(c, 'square', f, t, end, amp(c, e, 0.5)));
}
const tom = (f) => (c, out, t, v, end) => { // tuned membrane: 3 modes with pitch bend, skin slap, stick
  const lv = v ** 1.3, D = 0.3 + 0.5 * (110 / f) + 0.15 * v;
  const o = drive(c, 1.3 + 1.2 * v, filt(c, 'highpass', 40, 0.7, amp(c, out, 0.8)));
  [[1, 1, 1], [1.59, 0.45 + 0.25 * v, 0.45], [2.14, 0.25 * v, 0.3]].forEach(([r, a, d]) =>
    sweep(osc(c, 'sine', f * r, t, end, env(c, o, t, a * lv, 0.001, D * d)), t, f * r * (1.18 + 0.22 * v), f * r, 0.07, f * r * 0.97, 0.6));
  noise(c, t, end, filt(c, 'bandpass', f * 4, 1, env(c, o, t, 0.8 * lv, 0.001, 0.07)));
  noise(c, t, end, filt(c, 'bandpass', 3200, 0.8, env(c, o, t, 1.2 * v * v, 0.0004, 0.016)));
};

// ---------- the kit: name -> {fn, len, layers, rr, peak (target peak at vel 1), jit (random cents/hit)} ----------
const L4 = [0.3, 0.55, 0.8, 1], L3 = [0.4, 0.72, 1];
const TOMS = [[41, 80], [43, 96], [45, 112], [47, 132], [48, 152], [50, 178]]; // GM note, Hz
export const PIECES = { // exported for debugging / calibration
  kick: { fn: kick, len: 0.8, layers: L4, rr: 2, peak: 0.62, jit: 5 },
  snare: { fn: snare, len: 0.7, layers: L4, rr: 3, peak: 0.5, jit: 10 },
  chh: { fn: chh, len: 0.3, layers: L4, rr: 3, peak: 0.17, jit: 25 },
  ohh: { fn: ohh, len: 2.2, layers: L3, rr: 2, peak: 0.17, jit: 20 },
  phh: { fn: phh, len: 0.25, layers: L3, rr: 2, peak: 0.14, jit: 20 },
  clap: { fn: clap, len: 0.7, layers: L3, rr: 2, peak: 0.4, jit: 20 },
  stick: { fn: stick, len: 0.3, layers: L3, rr: 2, peak: 0.3, jit: 15 },
  ...Object.fromEntries(TOMS.map(([m, f]) => ['tom' + m, { fn: tom(f), len: 1.4, layers: L3, rr: 1, peak: 0.48, jit: 6, hz: f }])),
  crash: { fn: crash, len: 4.6, layers: L3, rr: 1, peak: 0.24, jit: 15 },
  ride: { fn: ride, len: 4.2, layers: L3, rr: 1, peak: 0.17, jit: 10 },
  bell: { fn: bell, len: 4, layers: L3, rr: 1, peak: 0.2, jit: 6 },
  china: { fn: china, len: 2.6, layers: L3, rr: 1, peak: 0.24, jit: 15 },
  splash: { fn: splash, len: 2, layers: L3, rr: 1, peak: 0.2, jit: 15 },
  tamb: { fn: tamb, len: 0.6, layers: L3, rr: 2, peak: 0.16, jit: 20 },
  cow: { fn: cow, len: 0.7, layers: L3, rr: 1, peak: 0.2, jit: 4 },
};
// live-synthesis gain before a piece has rendered (measured top-layer scale at 48 kHz)
const GUESS = { kick: 0.75, snare: 0.43, chh: 0.19, ohh: 0.15, phh: 0.11, clap: 0.28, stick: 0.25, crash: 0.11, ride: 0.23, bell: 0.17, china: 0.1, splash: 0.1, tamb: 0.19, cow: 0.19, tom41: 0.4, tom43: 0.44, tom45: 0.47, tom47: 0.48, tom48: 0.49, tom50: 0.5 };
// GM note -> [piece, extra cents]
const NOTE = {
  35: ['kick', -150], 36: ['kick'], 37: ['stick'], 38: ['snare'], 39: ['clap'], 40: ['snare', 120],
  42: ['chh'], 44: ['phh'], 46: ['ohh'], 49: ['crash'], 51: ['ride'], 52: ['china'], 53: ['bell'],
  54: ['tamb'], 55: ['splash'], 56: ['cow'], 57: ['crash', -180], 59: ['ride', 150],
  ...Object.fromEntries(TOMS.map(([m]) => [m, ['tom' + m]])),
};
// any other note: the nearest tom, retuned so its pitch class matches the note (playable melodically)
function fallback(f) {
  f = f > 0 && isFinite(f) ? f : 110;
  while (f < 75) f *= 2; while (f >= 300) f /= 2;
  let best = TOMS[0];
  for (const tm of TOMS) if (Math.abs(Math.log(f / tm[1])) < Math.abs(Math.log(f / best[1]))) best = tm;
  return ['tom' + best[0], 1200 * Math.log2(f / best[1])];
}

// ---------- pre-render ----------
const BANK = {}; // name -> [layer][rr] AudioBuffer
function render(P, v) {
  const c = new Offline(1, Math.ceil(P.len * SR), SR);
  P.fn(c, c.destination, 0, v, P.len);
  return new Promise((res, rej) => {
    c.oncomplete = (e) => res(e.renderedBuffer);
    const p = c.startRendering(); if (p && p.then) p.then(res, rej);
  });
}
function finish(buf, scale) { // scale, trim the inaudible tail (saves memory), 5 ms fade-out
  const d = buf.getChannelData(0);
  let n = d.length; while (n > 1 && Math.abs(d[n - 1]) * scale < 2e-4) n--; // ~-74 dBFS
  n = Math.min(d.length, n + Math.round(SR * 0.005));
  const out = ctx.createBuffer(1, n, SR), o = out.getChannelData(0), fade = Math.round(SR * 0.005);
  for (let i = 0; i < n; i++) o[i] = d[i] * scale * Math.min(1, (n - i) / fade);
  return out;
}
const peakOf = (b) => { const d = b.getChannelData(0); let m = 0; for (let i = 0; i < d.length; i++) m = Math.max(m, Math.abs(d[i])); return m; };
export const stats = {}; // name -> {scales per layer, ms} (debug/calibration)
const CURVE = 1.4; // loudness ~ vel^CURVE (about 15 dB from vel 0.3 to 1)
const LEVEL = 1.4; // whole kit vs the orchestra (measured: drums alone ~7 dB under tutti RMS; tutti+kit peak 0.85, no clipping)
async function renderPiece(name) {
  const P = PIECES[name], t0 = performance.now();
  const layers = await Promise.all(P.layers.map((v) => Promise.all(Array.from({ length: P.rr }, () => render(P, v)))));
  // each layer keeps its own timbre but is leveled onto one velocity curve (by its loudest take)
  const scales = layers.map((set, i) => (LEVEL * P.peak * P.layers[i] ** CURVE) / Math.max(1e-6, ...set.map(peakOf)));
  P.scale = scales[scales.length - 1];
  BANK[name] = layers.map((set, i) => set.map((b) => finish(b, scales[i])));
  stats[name] = { scales: scales.map((x) => +x.toFixed(3)), ms: Math.round(performance.now() - t0) };
}
// most-played first, so the live fallback window is shortest where it matters
export const ready = (async () => {
  if (!Offline) return;
  for (const name of ['kick', 'snare', 'chh', 'ohh', 'phh', 'clap', 'stick', ...TOMS.map(([m]) => 'tom' + m), 'ride', 'crash', 'bell', 'china', 'splash', 'tamb', 'cow']) {
    try { await renderPiece(name); } catch (err) { console.warn('drums: live synthesis for', name, err); }
  }
})();

// ---------- playing ----------
function hit(name, t, vel, out, cents) {
  const P = PIECES[name], v = Math.min(1.25, Math.max(0.05, vel || 0)), bank = BANK[name];
  const g = ctx.createGain(); g.connect(out);
  if (!bank) { // not rendered yet: same graph, live
    g.gain.value = P.scale ?? LEVEL * (GUESS[name] ?? 0.3);
    P.fn(ctx, g, t, Math.min(1, v), t + P.len);
    return { g, t };
  }
  let li = 0;
  for (let i = 1; i < P.layers.length; i++) if (Math.abs(Math.log(v / P.layers[i])) < Math.abs(Math.log(v / P.layers[li]))) li = i;
  const set = bank[li], s = ctx.createBufferSource();
  P.rrc = ((P.rrc || 0) + 1 + Math.floor(Math.random() * (set.length - 1))) % set.length; // never the same take twice
  s.buffer = set[P.rrc];
  s.playbackRate.value = 2 ** ((cents + (Math.random() * 2 - 1) * P.jit) / 1200);
  g.gain.value = (v / P.layers[li]) ** CURVE * (0.94 + Math.random() * 0.12);
  s.connect(g); s.start(t);
  return { g, s, t };
}
const openHat = new WeakMap(); // out node -> ringing open hat
function choke(out, t) {
  const h = openHat.get(out);
  if (!h || h.t >= t - 0.001) return; // only hats that started before this hit
  openHat.delete(out);
  h.g.gain.setTargetAtTime(0, t, 0.012);
  if (h.s) h.s.stop(t + 0.15);
}
export function drumVoice(f, t, dur, vel, out, detune = 0, midi = 36) {
  const [name, cents = 0] = NOTE[midi] || fallback(f);
  if (midi === 42 || midi === 44 || midi === 46) choke(out, t);
  const h = hit(name, t, vel, out, (detune || 0) + cents);
  if (midi === 46) openHat.set(out, h);
}
