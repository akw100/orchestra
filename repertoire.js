// The repertoire. Every piece is a 16-beat loop (4 bars of 4/4) in D major or B minor, so the drum grooves,
// the D-major harmony copies and the Songbook's free play fit all of them.
//   chords: 8 x [bass midi, 'M' | 'm'], 2 beats each (the cellos play the bass note)
//   melody: the violins' tune, written as 'NOTE*beats' tokens; 'r' is a rest, '|' a barline (each bar must add to 4)
//   lines:  optional hand-voiced inner lines (top, second, innerHi, innerLo, close); left out = voice-led from the chords
const N = (s) => { const [, l, a, o] = /^([A-G])(#|b)?(\d)$/.exec(s); return 12 * (+o + 1) + 'C D EF G A B'.indexOf(l) + (a === '#') - (a === 'b'); };
function tune(src) {
  let beat = 0;
  const notes = [];
  src.split('|').forEach((bar, i) => {
    const start = beat;
    for (const t of bar.trim().split(/\s+/)) {
      const [name, d = '1'] = t.split('*'), dur = +d;
      // accents: downbeats strongest, then beats, then offbeats
      if (name !== 'r') notes.push([beat, N(name), dur, beat % 4 === 0 ? 1 : beat % 1 === 0 ? 0.86 : 0.74]);
      beat += dur;
    }
    if (beat - start !== 4) throw new Error(`repertoire: bar ${i + 1} of "${src}" has ${beat - start} beats`);
  });
  return notes;
}

const D = [50, 'M'], D2 = [38, 'M'], A = [45, 'M'], G = [43, 'M'], Bm = [47, 'm'], Fsm = [42, 'm'], Cs = [49, 'M'], C = [48, 'M'];

export const ACTS = [['I', 'Baroque & Classical'], ['II', 'Romantic'], ['III', 'Songs everyone knows']];

export const PIECES = [
  {
    id: 'canon', title: 'Canon in D', composer: 'Johann Pachelbel', short: 'Pachelbel', year: 'c. 1680', act: 'I', key: 'D major', bpm: 84,
    chords: [D, A, Bm, Fsm, G, D2, G, A],
    melody: [74, 73, 74, 62, 61, 69, 64, 66, 62, 74, 73, 71, 73, 78, 81, 83, 79, 78, 76, 79, 78, 76, 74, 73, 71, 69, 67, 66, 64, 67, 66, 64].map((m, i) => [i / 2, m, 0.5]),
    lines: {
      top: [78, 76, 74, 73, 71, 69, 71, 73],
      second: [74, 73, 71, 69, 67, 66, 67, 69],
      innerHi: [66, 64, 66, 66, 67, 66, 67, 69],
      innerLo: [62, 61, 62, 61, 62, 62, 59, 61],
      close: [[57, 62, 66], [57, 61, 64], [59, 62, 66], [57, 61, 66], [59, 62, 67], [57, 62, 66], [59, 62, 67], [61, 64, 69]],
    },
  },
  {
    id: 'spring', title: 'Spring', composer: 'Antonio Vivaldi', short: 'Vivaldi', year: '1725', act: 'I', key: 'D major', bpm: 100,
    chords: [D, D, D, A, D, A, D, A],
    melody: tune('F#5*.5 F#5*.5 F#5*.5 E5*.25 D5*.25 A5*1.5 A5*.25 G5*.25 | F#5*.5 F#5*.5 F#5*.5 E5*.25 D5*.25 A5*1.5 A5*.25 G5*.25 | F#5*.5 G5*.5 A5*.5 G5*.5 F#5 E5 | D5*2 r*1.5 D5*.5'),
  },
  {
    id: 'nachtmusik', title: 'Eine kleine Nachtmusik', composer: 'Wolfgang Amadeus Mozart', short: 'Mozart', year: '1787', act: 'I', key: 'D major', bpm: 132,
    chords: [D, D, D, D, A, A, A, A],
    melody: tune('D5 r*.5 A4*.5 D5 r*.5 A4*.5 | D5*.5 A4*.5 D5*.5 F#5*.5 A5*2 | G5 r*.5 E5*.5 G5 r*.5 E5*.5 | G5*.5 E5*.5 C#5*.5 E5*.5 A4*2'),
  },
  {
    id: 'ode', title: 'Ode to Joy', composer: 'Ludwig van Beethoven', short: 'Beethoven', year: '1824', act: 'I', key: 'D major', bpm: 108,
    chords: [D, D, A, A, D, D, A, A],
    melody: tune('F#5 F#5 G5 A5 | A5 G5 F#5 E5 | D5 D5 E5 F#5 | F#5*1.5 E5*.5 E5*2'),
  },
  {
    id: 'mountain-king', title: 'In the Hall of the Mountain King', composer: 'Edvard Grieg', short: 'Grieg', year: '1875', act: 'II', key: 'B minor', bpm: 120,
    chords: [Bm, Bm, Cs, C, Bm, Bm, D, D],
    melody: tune('B4*.5 C#5*.5 D5*.5 E5*.5 F#5*.5 D5*.5 F#5 | E#5*.5 C#5*.5 E#5 E5*.5 C5*.5 E5 | B4*.5 C#5*.5 D5*.5 E5*.5 F#5*.5 D5*.5 F#5*.5 B5*.5 | A5*.5 F#5*.5 D5*.5 F#5*.5 A5*2'),
  },
  {
    id: 'swan-lake', title: 'Swan Lake', composer: 'Pyotr Ilyich Tchaikovsky', short: 'Tchaikovsky', year: '1876', act: 'II', key: 'B minor', bpm: 72,
    chords: [Bm, Bm, D, D, Bm, G, Bm, Bm],
    melody: tune('F#5*2 B4*.5 C#5*.5 D5*.5 E5*.5 | F#5*1.5 D5*.5 F#5*1.5 D5*.5 | F#5*1.5 B4*.5 D5*.5 B4*.5 G4*.5 D5*.5 | B4*4'),
  },
  {
    id: 'twinkle', title: 'Twinkle, Twinkle, Little Star', composer: 'French air', short: 'French air', year: '1761', act: 'III', key: 'D major', bpm: 92,
    chords: [D, D, G, D, G, D, A, D],
    melody: tune('D5 D5 A5 A5 | B5 B5 A5*2 | G5 G5 F#5 F#5 | E5 E5 D5*2'),
  },
  {
    id: 'joy-to-the-world', title: 'Joy to the World', composer: 'Lowell Mason, after Handel', short: 'Mason', year: '1839', act: 'III', key: 'D major', bpm: 96,
    chords: [D, A, D, D, G, A, D, D],
    melody: tune('D5 C#5*.75 B4*.25 A4*1.5 G4*.5 | F#4 E4 D4*1.5 A4*.5 | B4*1.5 B4*.5 C#5*1.5 C#5*.5 | D5*3 r'),
  },
  {
    id: 'jingle-bells', title: 'Jingle Bells', composer: 'James Lord Pierpont', short: 'Pierpont', year: '1857', act: 'III', key: 'D major', bpm: 120,
    chords: [D, D, Bm, Bm, D, G, D, A],
    melody: tune('F#5 F#5 F#5*2 | F#5 F#5 F#5*2 | F#5 A5 D5*1.5 E5*.5 | F#5*4'),
  },
];

// chord name for the timeline and the Songbook ribbon: 'F♯m'
const NAMES = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];
export const chordName = ([m, q]) => NAMES[((m % 12) + 12) % 12] + (q === 'm' ? 'm' : '');
