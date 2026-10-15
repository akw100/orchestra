// Grooves over the 16-beat (4-bar) loop. One part per player: copy k plays GROOVES[id][k].
// part = [[beat, gmMidi, durBeats, vel]...]
const range = (n, step = 1) => Array.from({ length: n }, (_, i) => i * step);

export const GROOVES = {
  kick: [range(8).flatMap((i) => [[i * 2, 36, 0.5, 1], [i * 2 + 1.5, 36, 0.5, 0.6]])],
  snare: [range(8).map((i) => [i * 2 + 1, 38, 0.5, 0.9])],
  hihat: [range(32).map((i) => [i / 2, 42, 0.25, i % 2 ? 0.5 : 0.8])],
  toms: [[[14, 50, 0.5, 0.9], [14.5, 48, 0.5, 0.9], [15, 45, 0.5, 0.9], [15.5, 43, 0.5, 1]]],
  cymbals: [[[0, 49, 2, 1], ...range(15).map((i) => [i + 1, 51, 0.5, 0.5])]],
};
