// Synth drum voices, picked by General MIDI note. Signature matches audio.js voices.
import { ctx, noiseBuf } from '../audio.js';

function env(out, t, vel, decay) {
  const g = ctx.createGain();
  g.gain.setValueAtTime(vel, t); g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
  g.connect(out); return [g, t + decay + 0.05];
}
function noise(out, t, end, type, freq) {
  const n = ctx.createBufferSource(); n.buffer = noiseBuf;
  const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq;
  n.connect(f).connect(out); n.start(t); n.stop(end);
}
function tone(out, t, end, f0, f1, ramp) {
  const o = ctx.createOscillator(); o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + ramp);
  o.connect(out); o.start(t); o.stop(end);
}

export function drumVoice(f, t, dur, vel, out, detune, midi) {
  if (midi === 36) { const [g, e] = env(out, t, vel * 0.9, 0.45); tone(g, t, e, 140, 45, 0.12); }
  else if (midi === 38 || midi === 37) {
    const [g, e] = env(out, t, vel * 0.45, 0.2); noise(g, t, e, 'highpass', 1200);
    const [g2, e2] = env(out, t, vel * 0.4, 0.1); tone(g2, t, e2, 220, 160, 0.05);
  } else if (midi === 42 || midi === 44) { const [g, e] = env(out, t, vel * 0.18, 0.05); noise(g, t, e, 'highpass', 7000); }
  else if (midi === 46) { const [g, e] = env(out, t, vel * 0.18, 0.35); noise(g, t, e, 'highpass', 6500); }
  else if (midi === 49 || midi === 51) { const [g, e] = env(out, t, vel * 0.2, midi === 49 ? 1.6 : 0.6); noise(g, t, e, 'highpass', midi === 49 ? 5000 : 8000); }
  else { const [g, e] = env(out, t, vel * 0.7, 0.4); tone(g, t, e, f * 2.2, f * 1.6, 0.15); } // toms (41..50)
}
