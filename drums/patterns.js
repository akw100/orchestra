// Grooves over the 16-beat (4-bar) loop of Pachelbel's Canon: chords every 2 beats, D A | Bm F#m | G D | G A.
// Each kit piece is a section; player k plays GROOVES[id][k] (cycled if players are added).
// The players of a piece are LAYERS of one drummer's groove, ordered by importance (the engine also mixes
// later players a little quieter). Every layer grooves on its own (Solo picks a random one), and any subset
// stacks without two players of a piece hitting the same drum on the same 16th (copies are humanized, so
// unison hits would flam).
// Phrase shape: bars 1-3 groove, bar 2 ends with a small answer, bar 4 builds (kick quarters, roll, tom
// fill, open hat, china push, clap build) into the crash on beat 1 of the loop.
// part = [[beat, gmMidi, durBeats, vel 0-1], ...] on a 16th grid (0.25). The engine humanizes velocity.
// GM drums: 36 kick, 37 side stick, 38 snare, 39 clap, 42 / 44 / 46 hat closed / pedal / open,
// 41 43 45 47 48 50 toms (low -> high), 49 crash, 51 ride, 53 ride bell, 52 china, 55 splash.

// voice(midi, dur) -> (beat, vel) => note
const v = (midi, dur) => (beat, vel) => [beat, midi, dur, vel];
const KICK = v(36, 0.5), SNARE = v(38, 0.25), CLAP = v(39, 0.25);
const HAT = v(42, 0.25), PEDAL = v(44, 0.25), OPEN = v(46, 0.5);
const CRASH = v(49, 4), RIDE = v(51, 1), BELL = v(53, 1), CHINA = v(52, 1), SPLASH = v(55, 2);
const tom = (midi) => v(midi, 0.5);
const hits = (fn, list) => list.map(([beat, vel]) => fn(beat, vel));
// bars 1-3 share a figure (fn(bar, offset) -> notes); bar 4 is written out as the build
const bars123 = (fn) => [0, 1, 2].flatMap((b) => fn(b, b * 4));
const layer = (name, notes) => Object.assign(notes.sort((a, b) => a[0] - b[0]), { layer: name });

export const GROOVES = {
  kick: [
    // Ballad pulse: on 1, 3 and the "and" of 3, locked to the chord changes; bar 4 walks quarters and pushes into the top
    layer('Ballad pulse', [
      ...bars123((b, o) => hits(KICK, [[o, b ? 0.9 : 1], [o + 2, 0.82], [o + 2.5, 0.5]])),
      ...hits(KICK, [[12, 0.9], [13, 0.66], [14, 0.78], [15, 0.86], [15.5, 0.62]]),
    ]),
    // Syncopated push: 16th pickups ("a" of 2, "and"/"a" of 4) that lean into the next chord; doubles up in bar 4
    layer('Syncopated push', [
      ...hits(KICK, [[1.75, 0.5], [3.5, 0.42]]),
      ...hits(KICK, [[4.75, 0.38], [5.75, 0.5], [7.75, 0.5]]),
      ...hits(KICK, [[9.75, 0.5], [11.5, 0.42]]),
      ...hits(KICK, [[13.75, 0.5], [14.75, 0.58], [15.25, 0.64], [15.75, 0.78]]),
    ]),
  ],

  snare: [
    // Backbeat: 2 and 4, a touch harder at the end of each two-bar half
    layer('Backbeat', hits(SNARE, [[1, 0.86], [3, 0.9], [5, 0.86], [7, 0.94], [9, 0.86], [11, 0.9], [13, 0.88], [15, 0.96]])),
    // Ghost notes: soft 16ths around the backbeat, swelling through bar 4 until the fill takes over
    layer('Ghost notes', [
      ...bars123((b, o) => hits(SNARE, [[o + 0.75, 0.24], [o + 1.25, 0.16], [o + 2.5, 0.18], [o + 2.75, 0.26], ...(b === 1 ? [] : [[o + 3.5, 0.17]])])),
      ...hits(SNARE, [[12.75, 0.26], [13.25, 0.2], [13.5, 0.26], [13.75, 0.32]]),
    ]),
    // Turnaround roll: a pickup into bar 3, then a 16th crescendo roll through bar 4 back to the top
    layer('Turnaround roll', [
      ...hits(SNARE, [[7.5, 0.42], [7.75, 0.55]]),
      ...hits(SNARE, [[14, 0.42], [14.25, 0.48], [14.5, 0.55], [14.75, 0.62], [15.25, 0.72], [15.5, 0.82], [15.75, 0.95]]),
    ]),
  ],

  hihat: [
    // Eighths: closed 8ths, quarters accented, open-hat lift on the "and" of 4 in bars 2 and 4
    layer('Eighths', [
      ...[0, 1, 2, 3].flatMap((b) => {
        const o = b * 4, lift = b % 2 === 1;
        return [
          ...hits(HAT, [[o, b ? 0.62 : 0.7], [o + 0.5, 0.36], [o + 1, 0.55], [o + 1.5, 0.36], [o + 2, 0.6], [o + 2.5, 0.38], [o + 3, 0.56]]),
          lift ? OPEN(o + 3.5, b === 3 ? 0.66 : 0.5) : HAT(o + 3.5, 0.4),
        ];
      }),
    ]),
    // 16th ghosts: whisper-soft "e" and "a" strokes, rising in bar 4 (silent under the open lifts)
    layer('16th ghosts', [
      ...bars123((b, o) => [0, 1, 2, 3].flatMap((q) => hits(HAT, [[o + q + 0.25, 0.16], [o + q + 0.75, 0.22]]))
        .filter((n) => n[0] !== 7.75)),
      ...[0, 1, 2].flatMap((q) => hits(HAT, [[12 + q + 0.25, 0.18 + q * 0.05], [12 + q + 0.75, 0.24 + q * 0.05]])),
      HAT(15.25, 0.36),
    ]),
    // Foot chick: pedal hat on 2 and 4, plus closing the open hats on the next downbeat
    layer('Foot chick', hits(PEDAL, [[1, 0.42], [3, 0.42], [5, 0.42], [7, 0.4], [8, 0.34], [9, 0.42], [11, 0.42], [13, 0.42], [15, 0.4], [0, 0.34]])),
  ],

  toms: [
    // Turnaround fill: descending 16ths, high tom to floor, over the last two beats of the loop
    layer('Turnaround fill', [
      tom(50)(14, 0.5), tom(50)(14.25, 0.46), tom(48)(14.5, 0.58), tom(48)(14.75, 0.55),
      tom(47)(15, 0.68), tom(45)(15.25, 0.7), tom(43)(15.5, 0.84), tom(41)(15.75, 0.95),
    ]),
    // Tribal floor: low-tom tresillo (3+3+2) with soft high-floor pickups, building at the end of bar 4
    layer('Tribal floor', [
      ...bars123((b, o) => [tom(41)(o, 0.5), tom(43)(o + 0.75, 0.24), tom(41)(o + 1.5, 0.42), tom(43)(o + 2.5, 0.28), tom(41)(o + 3, 0.46), tom(43)(o + 3.5, 0.3)]),
      tom(41)(12, 0.55), tom(43)(12.75, 0.3), tom(41)(13.5, 0.48), tom(43)(14, 0.42), tom(41)(14.5, 0.55), tom(41)(14.75, 0.5), tom(43)(15, 0.66),
    ]),
    // Half-phrase answer: a short mid-tom run at the end of bar 2 that sets up the second half
    layer('Half-phrase answer', [tom(48)(7, 0.42), tom(47)(7.25, 0.48), tom(45)(7.5, 0.54), tom(43)(7.75, 0.62)]),
  ],

  cymbals: [
    // Crash: the top of the loop, and a softer one opening the second half (bar 3)
    layer('Crash', hits(CRASH, [[0, 1], [8, 0.5]])),
    // Ride: quarter notes with an "and" of 4 skip; bar 4 opens up to 8ths
    layer('Ride', [
      ...bars123((b, o) => hits(RIDE, [[o, 0.42], [o + 1, 0.32], [o + 2, 0.4], [o + 3, 0.32], [o + 3.5, 0.26]])),
      ...hits(RIDE, [[12, 0.42], [12.5, 0.28], [13, 0.36], [13.5, 0.3], [14, 0.42], [14.5, 0.34], [15, 0.44]]),
    ]),
    // Bell accents: ride-bell off-beats on the "and" of 2 and 3, answering the ride; sparse in the build
    layer('Bell accents', [
      ...bars123((b, o) => hits(BELL, [[o + 1.5, 0.4], [o + 2.5, 0.32]])),
      ...hits(BELL, [[13.25, 0.36], [13.75, 0.44]]),
    ]),
    // Splash & china: splashes on the downbeats of bars 2 and 4, a china push on the "and" of 4 into the top
    layer('Splash & china', [SPLASH(4, 0.4), SPLASH(12, 0.46), CHINA(15.5, 0.55)]),
  ],

  claps: [
    // Backbeat claps: hands on 2 and 4, layered with the snare
    layer('Backbeat claps', hits(CLAP, [[1, 0.56], [3, 0.62], [5, 0.56], [7, 0.64], [9, 0.56], [11, 0.62], [13, 0.58], [15, 0.68]])),
    // Clap build: an "and" of 4 pickup each bar, then a rising clap roll through bar 4
    layer('Clap build', [
      ...bars123((b, o) => [CLAP(o + 3.5, 0.32)]),
      ...hits(CLAP, [[13.5, 0.3], [14, 0.36], [14.5, 0.42], [14.75, 0.46], [15.25, 0.56], [15.5, 0.66], [15.75, 0.8]]),
    ]),
  ],
};

// layer names per piece, aligned with GROOVES[id][k] (UI: LAYERS[id][k % length])
export const LAYERS = Object.fromEntries(Object.entries(GROOVES).map(([id, parts]) => [id, parts.map((p) => p.layer)]));
