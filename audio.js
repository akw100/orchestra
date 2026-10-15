// Orchestra engine: Web Audio synth voices + a bar-synced step scheduler.
// Events for visuals (window):
//   orch:note   {seat, inst, midi, vel, dur}   fired when the note actually sounds
//   orch:beat   {beat, bar}                    every beat (16 beats per loop)
//   orch:change {}                             any seat started/stopped/added/removed

export const ctx = new (window.AudioContext || window.webkitAudioContext)();

const master = ctx.createGain(); master.gain.value = 0.8;
const comp = ctx.createDynamicsCompressor();
export const analyser = ctx.createAnalyser(); analyser.fftSize = 2048;
master.connect(comp).connect(analyser).connect(ctx.destination);

// ponytail: generated-noise impulse response, swap for a real hall IR if wanted
const reverb = ctx.createConvolver();
{
  const len = ctx.sampleRate * 2.8, ir = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = ir.getChannelData(c);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
  }
  reverb.buffer = ir;
}
const wet = ctx.createGain(); wet.gain.value = 0.35;
reverb.connect(wet).connect(master);

const noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
noiseBuf.getChannelData(0).forEach((_, i, d) => (d[i] = Math.random() * 2 - 1));

const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);

function osc(type, f, t, end, out, gain = 1, detune = 0) {
  const o = ctx.createOscillator(); o.type = type; o.frequency.value = f; o.detune.value = detune;
  const g = ctx.createGain(); g.gain.value = gain;
  o.connect(g).connect(out); o.start(t); o.stop(end);
  return o;
}
function vibrato(oscs, t, end, rate, depth) {
  const l = ctx.createOscillator(), g = ctx.createGain();
  l.frequency.value = rate; g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(depth, t + 0.3);
  l.connect(g); oscs.forEach((o) => g.connect(o.frequency)); l.start(t); l.stop(end);
}
// sustained envelope: attack -> hold vel -> release after dur
function sus(out, t, dur, vel, a, r) {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vel, t + a);
  g.gain.setValueAtTime(vel, t + Math.max(a, dur)); g.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(a, dur) + r);
  g.connect(out); return [g, t + Math.max(a, dur) + r + 0.05];
}
// percussive envelope: fast attack, exponential decay
function hit(out, t, vel, decay) {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vel, t + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
  g.connect(out); return [g, t + decay + 0.05];
}
function lp(out, freq, q = 0.7) {
  const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = freq; f.Q.value = q; f.connect(out); return f;
}

const VOICES = {
  string(f, t, dur, vel, out, dt) {
    const [g, end] = sus(out, t, dur, vel * 0.22, 0.09, 0.3);
    const fl = lp(g, Math.min(f * 5 + 600, 9000), 1.2);
    const o = [osc('sawtooth', f, t, end, fl, 1, dt - 6), osc('sawtooth', f, t, end, fl, 1, dt + 6)];
    vibrato(o, t, end, 5.6, f * 0.007);
  },
  flute(f, t, dur, vel, out, dt) {
    const [g, end] = sus(out, t, dur, vel * 0.35, 0.06, 0.2);
    const o = [osc('sine', f, t, end, g, 1, dt), osc('triangle', f, t, end, g, 0.25, dt)];
    vibrato(o, t, end, 5, f * 0.005);
    const n = ctx.createBufferSource(); n.buffer = noiseBuf; n.loop = true;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f * 2; bp.Q.value = 3;
    const ng = ctx.createGain(); ng.gain.value = 0.08;
    n.connect(bp).connect(ng).connect(g); n.start(t); n.stop(end);
  },
  reed(f, t, dur, vel, out, dt) {
    const [g, end] = sus(out, t, dur, vel * 0.13, 0.04, 0.15);
    const o = [osc('square', f, t, end, lp(g, f * 3.5, 2), 1, dt)];
    vibrato(o, t, end, 4.5, f * 0.003);
  },
  brass(f, t, dur, vel, out, dt) {
    const [g, end] = sus(out, t, dur, vel * 0.18, 0.03, 0.15);
    const fl = lp(g, f, 1.5);
    fl.frequency.setValueAtTime(f, t); fl.frequency.linearRampToValueAtTime(f * 7, t + 0.06);
    fl.frequency.exponentialRampToValueAtTime(f * 3.5, t + 0.3);
    osc('sawtooth', f, t, end, fl, 1, dt); osc('sawtooth', f, t, end, fl, 0.6, dt + 8);
  },
  pluck(f, t, dur, vel, out, dt) {
    const [g, end] = hit(out, t, vel * 0.35, 2.2);
    const fl = lp(g, f * 6); fl.frequency.setValueAtTime(f * 8, t); fl.frequency.exponentialRampToValueAtTime(f * 1.5, t + 1);
    osc('triangle', f, t, end, fl, 1, dt); osc('sine', f * 2, t, end, fl, 0.3, dt);
  },
  piano(f, t, dur, vel, out, dt) {
    const [g, end] = hit(out, t, vel * 0.3, Math.min(3, 1 + dur));
    osc('triangle', f, t, end, g, 1, dt); osc('sine', f * 2, t, end, g, 0.35, dt); osc('sine', f * 3, t, end, g, 0.12, dt);
  },
  bell(f, t, dur, vel, out, dt) {
    [[1, 1, 1.6], [2.76, 0.35, 0.6], [5.4, 0.15, 0.3]].forEach(([r, a, d]) => {
      const [g, end] = hit(out, t, vel * 0.2 * a, d); osc('sine', f * r, t, end, g, 1, dt);
    });
  },
  timpani(f, t, dur, vel, out, dt) {
    const [g, end] = hit(out, t, vel * 0.9, 1.4);
    const o = osc('sine', f, t, end, lp(g, 300), 1, dt);
    o.frequency.setValueAtTime(f * 1.4, t); o.frequency.exponentialRampToValueAtTime(f, t + 0.06);
    const [ng, nend] = hit(out, t, vel * 0.3, 0.12);
    const n = ctx.createBufferSource(); n.buffer = noiseBuf; n.connect(lp(ng, 500)); n.start(t); n.stop(nend);
  },
};

// ---- the piece: Pachelbel's Canon progression in D, 16 beats / 4 bars ----
export const LOOP_BEATS = 16;
const CHORDS = [[50, 'M'], [45, 'M'], [47, 'm'], [42, 'm'], [43, 'M'], [38, 'M'], [43, 'M'], [45, 'M']]; // bass midi, 2 beats each
const triad = (r, q) => [r, r + (q === 'M' ? 4 : 3), r + 7];
const into = (m, lo) => { while (m < lo) m += 12; while (m >= lo + 12) m -= 12; return m; };
const per = (fn) => CHORDS.flatMap(([r, q], i) => fn(r, q, i * 2, i)); // fn returns [[beat, midi, dur, vel?]...]

const CANON_8THS = [74, 73, 74, 62, 61, 69, 64, 66, 62, 74, 73, 71, 73, 78, 81, 83, 79, 78, 76, 79, 78, 76, 74, 73, 71, 69, 67, 66, 64, 67, 66, 64];
const TOP = [78, 76, 74, 73, 71, 69, 71, 73];
const SECOND = [74, 73, 71, 69, 67, 66, 67, 69];

const PARTS = {
  violin: CANON_8THS.map((m, i) => [i / 2, m, 0.5]),
  viola: per((r, q, b) => { const [a, c, e] = triad(into(r, 55), q); return [[b, a, 0.5], [b + 0.5, c, 0.5], [b + 1, e, 0.5], [b + 1.5, c, 0.5]]; }),
  cello: per((r, q, b) => [[b, r, 2]]),
  flute: TOP.map((m, i) => [i * 2, m, 2]),
  clarinet: SECOND.map((m, i) => [i * 2, m - 12, 2]),
  trumpet: per((r, q, b, i) => i % 2 ? [] : [[b, into(r, 60), 1.2], [b + 1.5, into(r + 7, 60), 0.4], [b + 2, into(r + 7, 60), 1.5]]),
  harp: per((r, q, b) => { const [a, c, e] = triad(into(r, 50), q); return [[b, a, 1.5], [b + 0.5, e, 1.5], [b + 1, a + 12, 1.5], [b + 1.5, c + 12, 1.5]]; }),
  piano: per((r, q, b) => triad(into(r, 60), q).flatMap((m) => [[b, m, 1.4, 0.9], [b + 1, m, 0.9, 0.6]])),
  glockenspiel: TOP.map((m, i) => [i * 2 + 1, m + 12, 0.5, 0.7]),
  timpani: [...per((r, q, b, i) => i % 2 ? [] : [[b, into(r, 38), 1]]), ...[15, 15.25, 15.5, 15.75].map((b, i) => [b, 45, 0.25, 0.3 + i * 0.12])],
};

// kind decides what extra copies of a section play: harmony, octaves, then unison
export const INSTRUMENTS = [
  { id: 'violin', name: 'Violin', family: 'strings', voice: 'string', kind: 'melody', copies: 3, hue: 18 },
  { id: 'viola', name: 'Viola', family: 'strings', voice: 'string', kind: 'chord', copies: 2, hue: 32 },
  { id: 'cello', name: 'Cello', family: 'strings', voice: 'string', kind: 'bass', copies: 2, hue: 8 },
  { id: 'flute', name: 'Flute', family: 'woodwinds', voice: 'flute', kind: 'melody', copies: 1, hue: 150 },
  { id: 'clarinet', name: 'Clarinet', family: 'woodwinds', voice: 'reed', kind: 'melody', copies: 1, hue: 170 },
  { id: 'trumpet', name: 'Trumpet', family: 'brass', voice: 'brass', kind: 'chord', copies: 2, hue: 45 },
  { id: 'harp', name: 'Harp', family: 'strings', voice: 'pluck', kind: 'chord', copies: 1, hue: 280 },
  { id: 'piano', name: 'Piano', family: 'keys', voice: 'piano', kind: 'chord', copies: 1, hue: 220 },
  { id: 'glockenspiel', name: 'Glockenspiel', family: 'percussion', voice: 'bell', kind: 'chord', copies: 1, hue: 195 },
  { id: 'timpani', name: 'Timpani', family: 'percussion', voice: 'timpani', kind: 'perc', copies: 1, hue: 0 },
];
export const byId = Object.fromEntries(INSTRUMENTS.map((i) => [i.id, i]));

const SCALE = [1, 2, 4, 6, 7, 9, 11]; // D major pitch classes
function diatonic(m, steps) {
  const i = SCALE.indexOf(((m % 12) + 12) % 12); if (i < 0) return m;
  const j = i + steps, oct = Math.floor(m / 12) + Math.floor(j / 7);
  return oct * 12 + SCALE[((j % 7) + 7) % 7];
}
const VARIANTS = {
  melody: [(m) => m, (m) => diatonic(m, 2), (m) => m - 12],
  chord: [(m) => m, (m) => m + 12, (m) => m - 12],
  bass: [(m) => m, (m) => m - 12, (m) => m + 12],
  perc: [(m) => m],
};

// ---- seats ----
export const seats = [];
let nextId = 1;
const emit = (name, detail = {}) => window.dispatchEvent(new CustomEvent(name, { detail }));

export function addSeat(instId) {
  const inst = byId[instId], k = seats.filter((s) => s.inst === instId).length;
  const pan = ctx.createStereoPanner(), gain = ctx.createGain(), send = ctx.createGain();
  pan.pan.value = Math.max(-0.9, Math.min(0.9, (INSTRUMENTS.indexOf(inst) / (INSTRUMENTS.length - 1)) * 1.4 - 0.7 + (k % 2 ? 0.15 : -0.15) * Math.ceil(k / 2)));
  gain.gain.value = 1 / Math.sqrt(1 + k * 0.6); send.gain.value = 1;
  pan.connect(gain); gain.connect(master); gain.connect(send).connect(reverb);
  const v = VARIANTS[inst.kind];
  const seat = {
    id: nextId++, inst: instId, k, out: pan, gain,
    transform: v[k] || v[0], detune: k >= v.length ? (k % 2 ? 9 : -9) * Math.ceil(k / 2) : (k ? 3 : 0),
    active: false, loop: true, start: 0, end: Infinity,
  };
  seats.push(seat); emit('orch:change'); return seat;
}
export function removeSeat(instId) {
  const list = seats.filter((s) => s.inst === instId); if (list.length <= 1) return;
  const s = list[list.length - 1]; s.active = false;
  seats.splice(seats.indexOf(s), 1); setTimeout(() => s.gain.disconnect(), 4000); emit('orch:change');
}
INSTRUMENTS.forEach((i) => { for (let k = 0; k < i.copies; k++) addSeat(i.id); });

// ---- scheduler: 16th-note steps, 64 per loop ----
const STEPS = LOOP_BEATS * 4;
const NOTES = Object.fromEntries(Object.entries(PARTS).map(([id, notes]) => {
  const map = Array.from({ length: STEPS }, () => []);
  notes.forEach(([b, m, d, v = 1]) => map[Math.round(b * 4) % STEPS].push([m, d, v]));
  return [id, map];
}));
export let bpm = 84;
export const setBpm = (b) => (bpm = b);
let step = 0, nextTime = 0, running = false;

function scheduleStep(s, t) {
  const spb = 60 / bpm;
  if (s % 4 === 0) { const beat = (s / 4) % LOOP_BEATS; later(t, () => emit('orch:beat', { beat, bar: Math.floor(beat / 4) })); }
  for (const seat of seats) {
    if (!seat.active || s < seat.start) continue;
    if (s >= seat.end) { seat.active = false; later(t, () => emit('orch:change')); continue; }
    const inst = byId[seat.inst];
    for (const [m, d, v] of NOTES[seat.inst][s % STEPS]) {
      const midi = seat.transform(m), vel = v * (0.85 + Math.random() * 0.15);
      const tt = t + (seat.k ? Math.random() * 0.015 : 0); // ponytail: tiny humanize so copies don't phase
      VOICES[inst.voice](hz(midi), tt, d * spb, vel, seat.out, seat.detune);
      later(tt, () => emit('orch:note', { seat: seat.id, inst: seat.inst, midi, vel, dur: d * spb }));
    }
  }
}
const later = (t, fn) => setTimeout(fn, Math.max(0, (t - ctx.currentTime) * 1000));

setInterval(() => {
  if (!running) return;
  while (nextTime < ctx.currentTime + 0.12) { scheduleStep(step, nextTime); nextTime += 60 / bpm / 4; step++; }
}, 25);

function ensureRunning() {
  if (ctx.state !== 'running') ctx.resume();
  if (!running) { running = true; step = 0; nextTime = ctx.currentTime + 0.06; }
}

// ---- transport API ----
const nextBeat = () => Math.ceil(step / 4) * 4;
export function play(seat, loop = seat.loop) {
  ensureRunning();
  seat.loop = loop; seat.active = true; seat.start = nextBeat(); seat.end = loop ? Infinity : seat.start + STEPS;
  emit('orch:change');
}
export function stop(seat) { seat.active = false; emit('orch:change'); }
export const toggle = (seat) => (seat.active ? stop(seat) : play(seat));
export function setLoop(seat, loop) {
  seat.loop = loop;
  if (seat.active) seat.end = loop ? Infinity : seat.start + Math.max(1, Math.ceil((step - seat.start) / STEPS)) * STEPS;
  emit('orch:change');
}
const shuffle = (a) => a.map((x) => [Math.random(), x]).sort((p, q) => p[0] - q[0]).map((p) => p[1]);
// mode: all | most | allbutone | solo | none
export function section(instId, mode) {
  const list = seats.filter((s) => s.inst === instId);
  const n = { all: list.length, most: Math.max(1, Math.ceil(list.length * 0.66)), allbutone: Math.max(1, list.length - 1), solo: 1, none: 0 }[mode];
  const on = new Set(shuffle(list).slice(0, n));
  list.forEach((s) => (on.has(s) ? (s.active || play(s)) : s.active && stop(s)));
}
export const tutti = () => seats.forEach((s) => s.active || play(s, true));
export const stopAll = () => seats.forEach((s) => s.active && stop(s));
export const sectionSize = (instId) => seats.filter((s) => s.inst === instId).length;
