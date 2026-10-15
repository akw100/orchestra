// Drum kit plugin: each kit piece is its own section (play / loop / copies / modes like any instrument).
// Sounds live in drums/voices.js, grooves in drums/patterns.js. midi = General MIDI drum map.
// Each player of a piece plays one LAYER of the groove; inst.layers[k % length] names it (for UI).
import { registerInstrument } from './audio.js';
import { drumVoice } from './drums/voices.js';
import { GROOVES, LAYERS } from './drums/patterns.js';

export const KIT = [
  { id: 'kick', name: 'Kick', hue: 340 },
  { id: 'snare', name: 'Snare', hue: 205 },
  { id: 'hihat', name: 'Hi-hat', hue: 90 },
  { id: 'toms', name: 'Toms', hue: 20 },
  { id: 'cymbals', name: 'Cymbals', hue: 55 },
  { id: 'claps', name: 'Claps', hue: 312 },
];
for (const d of KIT) {
  registerInstrument({ ...d, family: 'drums', kind: 'perc', voice: drumVoice, parts: GROOVES[d.id], copies: GROOVES[d.id].length, layers: LAYERS[d.id] });
}
