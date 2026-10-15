// Orchestra engine: Web Audio synth voices + a bar-synced step scheduler.
// Events for visuals (window):
//   orch:note   {seat, inst, midi, vel, dur}   fired when the note actually sounds
//   orch:beat   {beat, bar}                    every beat (16 beats per loop)
//   orch:change {}                             any seat started/stopped/added/removed

export const ctx = new (window.AudioContext || window.webkitAudioContext)();

// ---- mix bus: seats -> master (auto-gain) -> glue comp -> limiter -> soft clip -> analyser -> out ----
const MASTER = 0.62;
const master = ctx.createGain(); master.gain.value = MASTER;
const comp = ctx.createDynamicsCompressor(); // gentle glue; slow-ish attack/release so the kick doesn't pump the strings
comp.threshold.value = -14; comp.knee.value = 14; comp.ratio.value = 2.2; comp.attack.value = 0.025; comp.release.value = 0.35;
const limiter = ctx.createDynamicsCompressor(); // safety limiter: fast attack, high ratio
limiter.threshold.value = -5; limiter.knee.value = 1; limiter.ratio.value = 20; limiter.attack.value = 0.001; limiter.release.value = 0.12;
const clip = ctx.createWaveShaper(); // soft clip for anything that slips past the limiter's attack; output never reaches 1
{
  const n = 2048, c = new Float32Array(n), T = 0.75, M = 0.97;
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1, a = Math.abs(x);
    c[i] = Math.sign(x) * (a < T ? a : T + (M - T) * Math.tanh((a - T) / (M - T)));
  }
  clip.curve = c; clip.oversample = '2x';
}
export const analyser = ctx.createAnalyser(); analyser.fftSize = 2048;
master.connect(comp).connect(limiter).connect(clip).connect(analyser).connect(ctx.destination);
export const mix = { master, comp, limiter, clip }; // for meters / debugging

// hall reverb: generated IR = sparse early reflections + a decorrelated stereo tail that darkens as it decays
function hallIR(len = 3.4, rt60 = 2.4, pre = 0.016) {
  const sr = ctx.sampleRate, n = Math.floor(len * sr), ir = ctx.createBuffer(2, n, sr), p0 = Math.floor(pre * sr);
  const step = Math.pow(10, -3 / (rt60 * sr)), fadeIn = 0.05 * sr;
  for (let c = 0; c < 2; c++) {
    const d = ir.getChannelData(c);
    for (let k = 0; k < 16; k++) { // early reflections 7-95 ms, different per ear
      const tt = 0.007 + Math.pow(Math.random(), 1.4) * 0.088;
      d[p0 + Math.floor(tt * sr)] += (Math.random() < 0.5 ? -1 : 1) * 0.8 * Math.exp(-tt * 16);
    }
    let lp = 0, env = 1;
    for (let i = p0; i < n; i++) {
      const tt = (i - p0) / sr, a = Math.min(0.93, 0.2 + tt * 0.4); // one-pole lowpass closes over time: highs die first
      lp = lp * a + (Math.random() * 2 - 1) * (1 - a);
      d[i] += lp * Math.sqrt((1 + a) / (1 - a)) * env * 0.32 * Math.min(1, (i - p0) / fadeIn);
      env *= step;
    }
  }
  return ir;
}
const reverb = ctx.createConvolver(); reverb.buffer = hallIR();
const revIn = ctx.createBiquadFilter(); revIn.type = 'highpass'; revIn.frequency.value = 180; revIn.connect(reverb); // keep lows dry
const wet = ctx.createGain(); wet.gain.value = 0.3;
reverb.connect(wet).connect(master);

export const noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
noiseBuf.getChannelData(0).forEach((_, i, d) => (d[i] = Math.random() * 2 - 1));

export const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);

// ---- building blocks ----
const waves = {};
const wave = (name, amps) => waves[name] || (waves[name] = ctx.createPeriodicWave(new Float32Array(amps.length), Float32Array.from(amps)));
function osc(type, f, t, end, out, gain = 1, detune = 0) {
  const o = ctx.createOscillator();
  if (typeof type === 'string') o.type = type; else o.setPeriodicWave(type);
  o.frequency.value = f; o.detune.value = detune;
  if (gain === 1) o.connect(out); else { const g = ctx.createGain(); g.gain.value = gain; o.connect(g).connect(out); }
  o.start(t); o.stop(end);
  return o;
}
// delayed vibrato in cents (same pitch wobble for every partial)
function vibrato(oscs, t, end, rate, cents, delay = 0.2) {
  const l = ctx.createOscillator(), g = ctx.createGain();
  l.frequency.value = rate * (0.94 + Math.random() * 0.12);
  g.gain.setValueAtTime(0, t + delay); g.gain.linearRampToValueAtTime(cents, t + delay + 0.4);
  l.connect(g); oscs.forEach((o) => g.connect(o.detune)); l.start(t); l.stop(end);
}
function noise(t, end, out) {
  const n = ctx.createBufferSource(); n.buffer = noiseBuf; n.loop = true;
  n.connect(out); n.start(t, Math.random() * 0.9); n.stop(end); return n;
}
function filt(type, freq, q, out) {
  const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q; f.connect(out); return f;
}
const lp = (out, freq, q = 0.7) => filt('lowpass', freq, q, out);
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
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vel, t + 0.004);
  g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
  g.connect(out); return [g, t + decay + 0.05];
}
// short noise burst with its own envelope: peak at attack, then settles to `rest` (0 = dies away)
function breath(out, t, end, peak, rest, freq, q, type = 'bandpass') {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(peak, t + 0.02); g.gain.setTargetAtTime(rest, t + 0.035, 0.06);
  g.connect(out); noise(t, end, filt(type, freq, q, g));
}

// brass family: filter "blat" (fast opening past the settle point), lip scoop up to pitch, late vibrato
function brassy(f, t, dur, vel, out, dt, o) {
  const [g, end] = sus(out, t, dur, vel * o.lvl, o.a, o.r);
  const fl = lp(g, f, o.q), settle = Math.min(f * (o.settle + vel * 1.5), 9000);
  fl.frequency.setValueAtTime(f * 0.8, t);
  fl.frequency.linearRampToValueAtTime(Math.min(f * o.peak, 12000), t + o.a * 0.9);
  fl.frequency.setTargetAtTime(settle, t + o.a, 0.07);
  const os = [osc('sawtooth', f, t, end, fl, 1, dt), osc(o.wave2, f, t, end, fl, o.mix2, dt + 7)];
  os.forEach((x) => { x.detune.setValueAtTime(dt - o.scoop, t); x.detune.setTargetAtTime(dt, t, 0.025); });
  if (o.vib) vibrato(os, t, end, 5.3, o.vib, 0.35);
}
const TRUMPET = { lvl: 0.17, a: 0.025, r: 0.12, q: 2.2, peak: 12, settle: 4, scoop: 40, wave2: 'sawtooth', mix2: 0.55, vib: 7 };
const HORN = { lvl: 0.24, a: 0.08, r: 0.28, q: 0.6, peak: 3.8, settle: 1.6, scoop: 12, wave2: 'triangle', mix2: 1, vib: 0 };

// Karplus-Strong pluck, rendered once per pitch into a buffer (2 nodes per note at play time)
const KS = new Map();
function ks(f) {
  const key = Math.round(f * 10); let v = KS.get(key); if (v) return v;
  const sr = ctx.sampleRate, N = Math.max(2, Math.round(sr / f - 0.5));
  const T60 = Math.max(1.3, Math.min(3.2, 3.2 - Math.log2(f / 146) * 0.8)), len = Math.floor(sr * T60);
  const rho = Math.min(0.99995, Math.pow(0.001, 1 / (T60 * f)) / Math.cos((Math.PI * f) / sr));
  const d = new Float32Array(len), ex = new Float32Array(N);
  let s = 0, mean = 0, peak = 0;
  for (let i = 0; i < N; i++) { s += (Math.random() * 2 - 1 - s) * 0.4; ex[i] = s; mean += s / N; } // soft fingertip: low-passed burst
  for (let i = 0; i < len; i++) {
    d[i] = (i < N ? ex[i] - mean : 0) + (i > N ? rho * 0.5 * (d[i - N] + d[i - N - 1]) : 0);
    peak = Math.max(peak, Math.abs(d[i]));
  }
  for (let i = 0; i < len; i++) d[i] /= peak;
  const buf = ctx.createBuffer(1, len, sr); buf.getChannelData(0).set(d);
  v = { buf, rate: (f * (N + 0.5)) / sr }; KS.set(key, v); return v;
}

const CLARINET = [0, 1, 0.03, 0.5, 0.02, 0.28, 0.015, 0.16, 0.01, 0.08, 0, 0.04, 0, 0.02]; // odd harmonics = hollow
const VOWEL_AH = { // [freq, gain, bandwidth] formants of a sung "aah"
  low: [[700, 1, 80], [1100, 0.55, 90], [2450, 0.3, 120]],
  high: [[850, 1, 90], [1250, 0.5, 100], [2850, 0.32, 140]],
};

export const VOICES = {
  // string ensemble: three detuned bows, bow-noise "bite", slower speaking low strings, softened highs
  string(f, t, dur, vel, out, dt) {
    const a = f < 140 ? 0.17 : f < 300 ? 0.12 : 0.075;
    const [g, end] = sus(out, t, dur, vel * 0.13, a, f < 140 ? 0.4 : 0.3);
    const top = Math.min(f * 3.5 + 900, 6000), fl = lp(g, top, 0.6);
    fl.frequency.setValueAtTime(top * 0.4, t); fl.frequency.linearRampToValueAtTime(top, t + a * 1.6);
    const os = [-10, -2, 8].map((c) => osc('sawtooth', f, t, end, fl, 1, dt + c));
    vibrato(os, t, end, 5.5, 13, 0.18);
    breath(g, t, end, 0.9, 0.12, Math.min(f * 3, 5000), 0.8);
  },
  // flute: sine + a touch of 2nd harmonic; breath chiff at the attack fades to a faint air
  flute(f, t, dur, vel, out, dt) {
    const [g, end] = sus(out, t, dur, vel * 0.3, 0.05, 0.18);
    const os = [osc('sine', f, t, end, g, 1, dt), osc('sine', f * 2, t, end, g, 0.14, dt + 4), osc('triangle', f, t, end, g, 0.1, dt)];
    vibrato(os, t, end, 5.2, 11, 0.2);
    breath(g, t, end, 0.7, 0.05, f * 2.2, 1.3);
  },
  // clarinet: odd-harmonic periodic wave, velocity-dependent brightness, almost no vibrato
  reed(f, t, dur, vel, out, dt) {
    const [g, end] = sus(out, t, dur, vel * 0.24, 0.035, 0.12);
    const os = [osc(wave('clarinet', CLARINET), f, t, end, lp(g, Math.min(f * (3 + vel * 3), 7000), 0.9), 1, dt)];
    vibrato(os, t, end, 4.8, 4, 0.3);
    breath(g, t, end, 0.25, 0.02, f * 3, 1.5);
  },
  brass(f, t, dur, vel, out, dt) { brassy(f, t, dur, vel, out, dt, TRUMPET); },
  horn(f, t, dur, vel, out, dt) { brassy(f, t, dur, vel, out, dt, HORN); },
  // harp: Karplus-Strong string
  pluck(f, t, dur, vel, out, dt) {
    const { buf, rate } = ks(f);
    const s = ctx.createBufferSource(), g = ctx.createGain();
    s.buffer = buf; s.playbackRate.value = rate * Math.pow(2, dt / 1200); g.gain.value = vel * 0.34;
    s.connect(g).connect(out); s.start(t);
  },
  // piano: stretched (inharmonic) partials, two strings beating, hammer thump, prompt + aftersound decay, damper at note-off
  piano(f, t, dur, vel, out, dt, midi) {
    const m = midi ?? 69 + 12 * Math.log2(f / 440), A = vel * 0.14, off = t + Math.max(0.15, dur), end = off + 0.6;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(A, t + 0.003);
    g.gain.setTargetAtTime(A * 0.4, t + 0.003, 0.1);
    if (off > t + 0.3) g.gain.setTargetAtTime(0, t + 0.3, Math.max(0.6, 3.6 - (m - 48) * 0.07) / 6.9);
    g.gain.setTargetAtTime(0, off, 0.08);
    g.connect(out);
    const fl = lp(g, Math.min(f * (5 + vel * 10), 12000), 0.5);
    fl.frequency.setTargetAtTime(f * 3 + 500, t + 0.01, 0.25);
    const B = 0.0004;
    [1, 0.5, 0.32, 0.2, 0.12, 0.07].forEach((a, i) => { const n = i + 1; osc('sine', f * n * Math.sqrt(1 + B * n * n), t, end, fl, a, dt); });
    osc('sine', f, t, end, fl, 0.6, dt + 1.8); // second string, slow beating
    const [hg, hend] = hit(out, t, vel * 0.05, 0.04);
    noise(t, hend, filt('bandpass', Math.min(f * 2.5, 2500), 1.1, hg));
  },
  // glockenspiel: clean bar partials, upper ones die fast, a tiny strike tick
  bell(f, t, dur, vel, out, dt) {
    [[1, 1, 1.9], [2.756, 0.2, 0.4], [5.404, 0.06, 0.14]].forEach(([r, a, d]) => {
      const [g, end] = hit(out, t, vel * 0.17 * a, d); osc('sine', f * r, t, end, g, 1, dt);
    });
    const [tg, tend] = hit(out, t, vel * 0.03, 0.015); noise(t, tend, filt('highpass', 5000, 0.7, tg));
  },
  // timpani: tuned membrane modes (1 : 1.5 : 2 : 2.44), a pitch-dropping head thump, felt mallet
  timpani(f, t, dur, vel, out, dt) {
    [[1, 1, 2.4], [1.5, 0.45, 1.3], [1.98, 0.25, 0.8], [2.44, 0.12, 0.5]].forEach(([r, a, d]) => {
      const [g, end] = hit(out, t, vel * 0.42 * a, d), o = osc('sine', f * r, t, end, g, 1, dt);
      o.detune.setValueAtTime(dt + 35, t); o.detune.setTargetAtTime(dt, t, 0.04);
    });
    const [tg, tend] = hit(out, t, vel * 0.45, 0.3), th = osc('sine', f, t, tend, tg, 1, dt);
    th.frequency.setValueAtTime(f * 0.9, t); th.frequency.exponentialRampToValueAtTime(f * 0.45, t + 0.15);
    const [ng, nend] = hit(out, t, vel * 0.18, 0.07); noise(t, nend, lp(ng, 800));
  },
  // choir "aah": a few detuned singers -> parallel formant band-passes (+ a little chest fundamental)
  choir(f, t, dur, vel, out, dt) {
    const [g, end] = sus(out, t, dur, vel * 0.6, 0.3, 0.5);
    const src = ctx.createGain(); src.gain.value = 1;
    const os = [-9, 0, 9].map((c) => osc('sawtooth', f, t, end, src, 1, dt + c));
    vibrato(os, t, end, 5, 16, 0.3);
    for (const [ff, a, bw] of f < 260 ? VOWEL_AH.low : VOWEL_AH.high) {
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = ff; bp.Q.value = ff / bw;
      src.connect(bp);
      if (a === 1) bp.connect(g); else { const ga = ctx.createGain(); ga.gain.value = a; bp.connect(ga).connect(g); }
    }
    const body = ctx.createGain(); body.gain.value = 0.12; src.connect(lp(body, f * 1.3)); body.connect(g);
  },
};

// ---- the piece: Pachelbel's Canon progression in D, 16 beats / 4 bars ----
export const LOOP_BEATS = 16;
export const CHORDS = [[50, 'M'], [45, 'M'], [47, 'm'], [42, 'm'], [43, 'M'], [38, 'M'], [43, 'M'], [45, 'M']]; // bass midi, 2 beats each
const triad = (r, q) => [r, r + (q === 'M' ? 4 : 3), r + 7];
const into = (m, lo) => { while (m < lo) m += 12; while (m >= lo + 12) m -= 12; return m; };
const per = (fn) => CHORDS.flatMap(([r, q], i) => fn(r, q, i * 2, i)); // fn returns [[beat, midi, dur, vel?]...]
const split = (...parts) => ({ parts }); // one part per copy: copy k plays parts[k % n]

const CANON_8THS = [74, 73, 74, 62, 61, 69, 64, 66, 62, 74, 73, 71, 73, 78, 81, 83, 79, 78, 76, 79, 78, 76, 74, 73, 71, 69, 67, 66, 64, 67, 66, 64];
const TOP = [78, 76, 74, 73, 71, 69, 71, 73];
const SECOND = [74, 73, 71, 69, 67, 66, 67, 69];
// voice-led inner lines (thirds / fifths of each chord, moving by step)
const INNER_HI = [66, 64, 66, 66, 67, 66, 67, 69];
const INNER_LO = [62, 61, 62, 61, 62, 62, 59, 61];
const CLOSE = [[57, 62, 66], [57, 61, 64], [59, 62, 66], [57, 61, 66], [59, 62, 67], [57, 62, 66], [59, 62, 67], [61, 64, 69]];

const PARTS = {
  violin: CANON_8THS.map((m, i) => [i / 2, m, 0.5]),
  viola: per((r, q, b) => { const [a, c, e] = triad(into(r, 55), q); return [[b, a, 0.5], [b + 0.5, c, 0.5], [b + 1, e, 0.5], [b + 1.5, c, 0.5]]; }),
  cello: per((r, q, b) => [[b, r, 2]]),
  contrabass: per((r, q, b) => [[b, r - 12, 0.92, 1], [b + 1, r - 12, 0.92, 0.8]]),
  flute: TOP.map((m, i) => [i * 2, m, 2]),
  clarinet: SECOND.map((m, i) => [i * 2, m - 12, 2]),
  trumpet: per((r, q, b, i) => i % 2 ? [] : [[b, into(r, 60), 1.2], [b + 1.5, into(r + 7, 60), 0.4], [b + 2, into(r + 7, 60), 1.5]]),
  horn: split(INNER_HI.map((m, i) => [i * 2, m, 1.9, 0.85]), INNER_LO.map((m, i) => [i * 2, m, 1.9, 0.8])),
  harp: per((r, q, b) => { const [a, c, e] = triad(into(r, 50), q); return [[b, a, 1.5], [b + 0.5, e, 1.5], [b + 1, a + 12, 1.5], [b + 1.5, c + 12, 1.5]]; }),
  piano: per((r, q, b) => triad(into(r, 60), q).flatMap((m) => [[b, m, 1.4, 0.9], [b + 1, m, 0.9, 0.6]])),
  glockenspiel: TOP.map((m, i) => [i * 2 + 1, m + 12, 0.5, 0.7]),
  timpani: [...per((r, q, b, i) => i % 2 ? [] : [[b, into(r, 38), 1]]), ...[15, 15.25, 15.5, 15.75].map((b, i) => [b, 45, 0.25, 0.3 + i * 0.12])],
  choir: split(
    CLOSE.flatMap((ch, i) => ch.map((m) => [i * 2, m, 1.95, 0.75])),
    per((r, q, b) => [[b, into(r, 41), 1.95, 0.75], [b, into(r + 7, 49), 1.95, 0.6]]),
  ),
};

// kind decides what extra copies of a section play: harmony, octaves, then unison
export const INSTRUMENTS = [
  { id: 'violin', name: 'Violin', family: 'strings', voice: 'string', kind: 'melody', copies: 3, hue: 18 },
  { id: 'viola', name: 'Viola', family: 'strings', voice: 'string', kind: 'chord', copies: 2, hue: 32 },
  { id: 'cello', name: 'Cello', family: 'strings', voice: 'string', kind: 'bass', copies: 2, hue: 8 },
  { id: 'contrabass', name: 'Contrabass', family: 'strings', voice: 'string', kind: 'bass', copies: 1, hue: 350 },
  { id: 'flute', name: 'Flute', family: 'woodwinds', voice: 'flute', kind: 'melody', copies: 1, hue: 150 },
  { id: 'clarinet', name: 'Clarinet', family: 'woodwinds', voice: 'reed', kind: 'melody', copies: 1, hue: 170 },
  { id: 'trumpet', name: 'Trumpet', family: 'brass', voice: 'brass', kind: 'chord', copies: 2, hue: 45 },
  { id: 'horn', name: 'French horn', family: 'brass', voice: 'horn', kind: 'chord', copies: 2, hue: 38 },
  { id: 'harp', name: 'Harp', family: 'strings', voice: 'pluck', kind: 'chord', copies: 1, hue: 280 },
  { id: 'piano', name: 'Piano', family: 'keys', voice: 'piano', kind: 'chord', copies: 1, hue: 220 },
  { id: 'glockenspiel', name: 'Glockenspiel', family: 'percussion', voice: 'bell', kind: 'chord', copies: 1, hue: 195 },
  { id: 'timpani', name: 'Timpani', family: 'percussion', voice: 'timpani', kind: 'perc', copies: 1, hue: 0 },
  { id: 'choir', name: 'Choir', family: 'voices', voice: 'choir', kind: 'chord', copies: 2, hue: 300 },
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

// ---- mix: per-section level, seating (pan), reverb send ----
// calibrated from measured per-section RMS/peaks: melodies on top, warm bass, percussion tucked in
const LEVEL = {
  violin: 1.5, viola: 0.6, cello: 0.8, contrabass: 0.65, flute: 0.56, clarinet: 0.5, trumpet: 0.6, horn: 0.35,
  harp: 1, piano: 0.6, glockenspiel: 1, timpani: 0.45, choir: 0.6,
  kick: 0.38, snare: 0.3, hihat: 0.45, toms: 0.35, cymbals: 0.5,
};
const FAMILY_LEVEL = { drums: 0.35 };
const PAN = { // concert seating, audience view
  violin: -0.55, viola: 0.15, cello: 0.4, contrabass: 0.62, flute: -0.12, clarinet: 0.12, trumpet: 0.32, horn: -0.3,
  harp: -0.72, piano: -0.4, glockenspiel: 0.5, timpani: 0.05, choir: 0, kick: 0, snare: 0.06, hihat: 0.28, toms: -0.18, cymbals: 0.35,
};
const levelOf = (inst) => LEVEL[inst.id] ?? FAMILY_LEVEL[inst.family] ?? 0.65;
const sendOf = (inst) => (inst.family === 'drums' ? 0.12 : inst.kind === 'bass' ? 0.4 : inst.kind === 'perc' ? 0.5 : 1);

// copies of a section share the load (n^-0.4 per player), and the whole band is trimmed as sections pile up
function rebalance() {
  const now = ctx.currentTime, on = {};
  for (const s of seats) if (s.active) on[s.inst] = (on[s.inst] || 0) + 1;
  for (const s of seats) s.gain.gain.setTargetAtTime(levelOf(byId[s.inst]) / Math.pow(Math.max(1, on[s.inst] || 0), 0.4), now, 0.08);
  master.gain.setTargetAtTime(MASTER / Math.pow(Math.max(1, Object.keys(on).length), 0.28), now, 0.25);
}

// ---- seats ----
export const seats = [];
let nextId = 1;
const emit = (name, detail = {}) => {
  if (name === 'orch:change') rebalance();
  window.dispatchEvent(new CustomEvent(name, { detail }));
};

// ---- scheduler data: 16th-note steps, 64 per loop ----
const STEPS = LOOP_BEATS * 4;
const compile = (notes) => {
  const map = Array.from({ length: STEPS }, () => []);
  notes.forEach(([b, m, d, v = 1]) => map[Math.round(b * 4) % STEPS].push([m, d, v]));
  return map;
};
const NOTES = Object.fromEntries(Object.entries(PARTS).map(([id, p]) => [id, (p.parts || [p]).map(compile)])); // id -> one part per copy (cycled)

export function addSeat(instId) {
  const inst = byId[instId], k = seats.filter((s) => s.inst === instId).length;
  const pan = ctx.createStereoPanner(), gain = ctx.createGain(), send = ctx.createGain();
  const spread = inst.family === 'voices' ? 0.3 : inst.family === 'drums' ? 0.05 : 0.13;
  const base = PAN[instId] ?? (INSTRUMENTS.indexOf(inst) / Math.max(1, INSTRUMENTS.length - 1)) * 1.4 - 0.7;
  pan.pan.value = Math.max(-0.9, Math.min(0.9, base + (k % 2 ? spread : -spread) * Math.ceil(k / 2)));
  gain.gain.value = levelOf(inst); send.gain.value = sendOf(inst);
  pan.connect(gain); gain.connect(master); gain.connect(send).connect(revIn);
  // the first P copies play their own parts; further copies get the kind's variants (harmony, octaves, unison)
  const v = VARIANTS[inst.kind] || VARIANTS.perc, P = NOTES[instId]?.length || 1, j = Math.floor(k / P);
  const seat = {
    id: nextId++, inst: instId, k, out: pan, gain,
    transform: v[j] || v[0], detune: j >= v.length ? (j % 2 ? 9 : -9) * Math.ceil(j / 2) : (k ? 3 : 0),
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

// ---- scheduler ----
const voiceOf = (inst) => (typeof inst.voice === 'function' ? inst.voice : VOICES[inst.voice]);
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
    const parts = NOTES[seat.inst];
    for (const [m, d, v] of parts[seat.k % parts.length][s % STEPS]) {
      const midi = seat.transform(m), vel = v * (0.85 + Math.random() * 0.15);
      const tt = t + (seat.k ? Math.random() * 0.015 : 0); // ponytail: tiny humanize so copies don't phase
      voiceOf(inst)(hz(midi), tt, d * spb, vel, seat.out, seat.detune, midi);
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

// ---- plugins & live playing ----
// def: {id, name, family, hue, kind?, copies?, voice: name|fn(f, t, dur, vel, out, detune, midi), part: [[beat, midi, durBeats, vel?]...] | parts: [part per copy]}
export function registerInstrument(def) {
  const inst = { kind: 'perc', copies: 1, ...def };
  INSTRUMENTS.push(inst); byId[inst.id] = inst;
  NOTES[inst.id] = (inst.parts || [inst.part]).map(compile);
  for (let k = 0; k < inst.copies; k++) addSeat(inst.id);
  return inst;
}
// play one note right now on a seat (or the first seat of an instrument id); for typing/keyboard play
export function strike(seat, midi, beats = 1, vel = 0.9) {
  if (typeof seat === 'string') seat = seats.find((x) => x.inst === seat);
  if (!seat) return;
  if (ctx.state !== 'running') ctx.resume();
  const inst = byId[seat.inst], t = ctx.currentTime + 0.01, dur = (beats * 60) / bpm;
  voiceOf(inst)(hz(midi), t, dur, vel, seat.out, seat.detune, midi);
  emit('orch:note', { seat: seat.id, inst: seat.inst, midi, vel, dur, live: true });
}
