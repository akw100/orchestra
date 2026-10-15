// Songbook: play the orchestra by typing (PLAY mode).
// keys.js owns the keyboard and calls onPlayKey(e, isDown) in PLAY mode, enter()/exit() on mode change.
// Layout (physical keys, so any keyboard language works), D major so everything fits the Canon:
//   home row  a s d f g h j k l ; '  = D4 E F# G A B C# D5 E F# G
//   top row   q w e r t y u i o p    = same columns an octave up
//   bottom    z x c v b n m , . /    = same columns an octave down
//   Shift + note = flat (C, F, Bb, Eb, Ab).  1-9 instrument, Up/Down song, Enter demo, Backspace restart, \ typewriter.
import * as O from './audio.js';

// ---------- key layout ----------
const ROWS = [
  ['qwertyuiop', ['KeyQ', 'KeyW', 'KeyE', 'KeyR', 'KeyT', 'KeyY', 'KeyU', 'KeyI', 'KeyO', 'KeyP'], 74],
  ["asdfghjkl;'", ['KeyA', 'KeyS', 'KeyD', 'KeyF', 'KeyG', 'KeyH', 'KeyJ', 'KeyK', 'KeyL', 'Semicolon', 'Quote'], 62],
  ['zxcvbnm,./', ['KeyZ', 'KeyX', 'KeyC', 'KeyV', 'KeyB', 'KeyN', 'KeyM', 'Comma', 'Period', 'Slash'], 50],
];
const MAJOR = [0, 2, 4, 5, 7, 9, 11];
const KEY = {}, BY_LABEL = {};
ROWS.forEach(([labels, codes, base], row) => codes.forEach((code, i) => {
  const k = { code, label: labels[i], row, col: i, midi: base + 12 * Math.floor(i / 7) + MAJOR[i % 7] };
  KEY[code] = BY_LABEL[k.label] = k;
}));
const NAMES = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'B♭', 'B'];
const nameOf = (m) => NAMES[((m % 12) + 12) % 12];

// ---------- songbook (token = key + beats, default 1; uppercase letter = Shift = flat) ----------
const eighths = (s) => s.split(' ').map((t) => t + '.5').join(' ');
const SONGS = [
  { title: 'Warm-up', by: 'The D major scale', keys: 'a s d f g h j k2 k j h g f d s a2' },
  {
    title: 'Canon in D', by: 'Pachelbel · c. 1680', align: 16, backing: ['cello', 'harp'],
    keys: ";2 l2 k2 j2 h2 g2 h2 j2 k2 j2 h2 g2 f2 d2 f2 g2 " + eighths("k j k a m g s d a k j h j ; t y ' ; l ' ; l k j h g f d s f d s"),
  },
  {
    title: 'Ode to Joy', by: 'Beethoven · 1824',
    keys: 'd d f g g f d s a a s d d1.5 s.5 s2 d d f g g f d s a a s d s1.5 a.5 a2',
    lyrics: 'Freu- de, schö- ner Göt- ter- fun- ken, Toch- ter aus E- ly- si- um! Wir be- tre- ten feu- er- trun- ken, Himm- li- sche, dein Hei- lig- tum!',
  },
  {
    title: 'Twinkle, Twinkle', by: 'Jane Taylor · 1806',
    keys: 'a a g g h h g2 f f d d s s a2 g g f f d d s2 g g f f d d s2 a a g g h h g2 f f d d s s a2',
    lyrics: 'Twin- kle, twin- kle, lit- tle star, how I won- der what you are! Up a- bove the world so high, like a dia- mond in the sky. Twin- kle, twin- kle, lit- tle star, how I won- der what you are!',
  },
  {
    title: 'Frère Jacques', by: 'French round · 1780',
    keys: 'a s d a a s d a d f g2 d f g2 g.5 h.5 g.5 f.5 d a g.5 h.5 g.5 f.5 d a a b a2 a b a2',
    lyrics: 'Frè- re Jac- ques, frè- re Jac- ques, dor- mez- vous? dor- mez- vous? Son- nez les ma- ti- nes, son- nez les ma- ti- nes, ding, dang, dong. ding, dang, dong.',
  },
  {
    title: 'Jingle Bells', by: 'J. Pierpont · 1857',
    keys: 'd d d2 d d d2 d g a1.5 s.5 d4 f f f1.5 f.5 f d d d.5 d.5 d s s d s2 g2 d d d2 d d d2 d g a1.5 s.5 d4 f f f f f d d d.5 d.5 g g f s a4',
    lyrics: 'Jin- gle bells, jin- gle bells, jin- gle all the way! Oh what fun it is to ride in a one- horse o- pen sleigh, hey! Jin- gle bells, jin- gle bells, jin- gle all the way! Oh what fun it is to ride in a one- horse o- pen sleigh!',
  },
  {
    title: 'Happy Birthday', by: 'Hill sisters · 1893',
    keys: "g.75 g.25 h g k j2 g.75 g.25 h g l k2 g.75 g.25 t ; k j h2 '.75 '.25 ; k l k2",
    lyrics: 'Hap- py birth- day to you, hap- py birth- day to you, hap- py birth- day dear mu- sic, hap- py birth- day to you!',
  },
  { title: 'Greensleeves', by: 'English ballad · 1580', keys: 'a D2 f g1.5 h.5 g f2 s M1.5 a.5 s D2 a a1.5 m.5 a s2 m b2 a D2 f g1.5 h.5 g f2 s M1.5 a.5 s D1.5 s.5 a m1.5 n.5 m a3' },
  { title: 'Für Elise', by: 'Beethoven · 1810', keys: 'g.5 G.5 g.5 G.5 g.5 s.5 f.5 D.5 a1.5 C.5 b.5 a.5 s1.5 b.5 m.5 s.5 D1.5 b.5 g.5 G.5 g.5 G.5 g.5 s.5 f.5 D.5 a1.5 C.5 b.5 a.5 s1.5 b.5 D.5 s.5 a2' },
];
SONGS.forEach((s) => {
  const words = s.lyrics ? s.lyrics.split(/\s+/) : [];
  s.notes = s.keys.trim().split(/\s+/).map((t, i) => {
    const k = BY_LABEL[t[0].toLowerCase()], shift = t[0] !== t[0].toLowerCase();
    return { code: k.code, label: k.label, shift, midi: k.midi - (shift ? 1 : 0), beats: t.length > 1 ? parseFloat(t.slice(1)) : 1, lyric: words[i] || '' };
  });
});

// ---------- state ----------
let open = false, typewriter = false, inst = null, songIdx = -1, pos = 0, finished = false;
let demo = null, backing = null, lastBeat = { beat: 0, t: -1e9 };
const song = () => SONGS[songIdx];
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const spb = () => 60000 / O.bpm;
const melodic = () => O.INSTRUMENTS.filter((i) => i.family !== 'drums' && i.kind !== 'perc');
const hue = () => O.byId[inst]?.hue ?? 40;
const hasKeysJs = () => !!document.querySelector('script[src$="keys.js"]');
// physical key; synthetic/automation events can arrive with an empty code, so derive it from the key
const PUNCT = { ';': 'Semicolon', ':': 'Semicolon', "'": 'Quote', '"': 'Quote', ',': 'Comma', '<': 'Comma', '.': 'Period', '>': 'Period', '/': 'Slash', '?': 'Slash', '`': 'Backquote', '~': 'Backquote', '\\': 'Backslash', '|': 'Backslash', ' ': 'Space' };
const codeOf = (e) => e.code || (/^[a-z]$/i.test(e.key) ? 'Key' + e.key.toUpperCase() : /^[0-9]$/.test(e.key) ? 'Digit' + e.key : PUNCT[e.key] || e.key || '');

// ---------- DOM ----------
const css = document.createElement('link');
css.rel = 'stylesheet'; css.href = new URL('./songs.css', import.meta.url).href;
document.head.append(css);
if (![...document.querySelectorAll('link[href*="fonts.googleapis"]')].some((l) => /Bodoni/.test(l.href))) {
  const f = document.createElement('link'); f.rel = 'stylesheet';
  f.href = 'https://fonts.googleapis.com/css2?family=Bodoni+Moda:ital,opsz,wght@0,6..96,400..700;1,6..96,400..700&family=Jost:wght@400;500;600&display=swap';
  document.head.append(f);
}

const ICON_NOTE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 18.5a2.5 2.5 0 1 1-2.5-2.5H9V5l11-2v12.5a2.5 2.5 0 1 1-2.5-2.5H20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const ICON_X = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>';
const ICON_PLAY = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l10.5-6.5z" fill="currentColor"/></svg>';
const ICON_STOP = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6.5" y="6.5" width="11" height="11" rx="1.5" fill="currentColor"/></svg>';
const ICON_AGAIN = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3M4.5 4v4.5H9" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';

const root = document.createElement('aside');
root.className = 'sb';
root.style.display = 'none'; // until songs.css is in, or the drawer would visibly fly off on load
css.addEventListener('load', () => (root.style.display = ''));
root.innerHTML = `
  <button class="sb-pill" type="button" aria-label="Open the songbook and play by typing">${ICON_NOTE}<span>Songbook</span><kbd>\`</kbd></button>
  <section class="sb-panel" aria-label="Songbook: play by typing">
    <div class="sb-head">
      <h2 class="sb-title">Songbook</h2>
      <div class="sb-modes" role="group" aria-label="Typing mode">
        <button type="button" data-mode="keys">Keys</button>
        <button type="button" data-mode="type">Typewriter <kbd>\\</kbd></button>
      </div>
      <button type="button" class="sb-x" aria-label="Close songbook (\`)">${ICON_X}</button>
    </div>
    <div class="sb-row sb-insts" role="group" aria-label="Instrument, keys 1 to 9"></div>
    <div class="sb-row sb-songs" role="group" aria-label="Songs, arrow up and down"></div>
    <div class="sb-view">
      <div class="sb-lane">
        <div class="sb-meta">
          <p class="sb-now"></p>
          <button type="button" class="sb-demo"></button>
          <button type="button" class="sb-again" aria-label="Restart song (Backspace)">${ICON_AGAIN}</button>
        </div>
        <div class="sb-road">
          <div class="sb-prog"><i></i></div>
          <div class="sb-strike"></div>
          <div class="sb-track"></div>
          <p class="sb-free">Free play. Every key is in D major, so anything you type fits every piece on the programme. Pick a song to follow along.</p>
          <div class="sb-count" aria-hidden="true"></div>
          <div class="sb-bravo" role="status"></div>
        </div>
      </div>
      <div class="sb-type">
        <div class="sb-chords" aria-hidden="true"></div>
        <div class="sb-text"><div class="sb-line"></div></div>
        <p class="sb-tw-meta"></p>
      </div>
    </div>
    <div class="sb-kbd" aria-hidden="true"></div>
    <p class="sb-legend"><span><kbd>⇧</kbd> flat</span><span><kbd>1</kbd>–<kbd>9</kbd> instrument</span><span><kbd>↑</kbd><kbd>↓</kbd> song</span><span><kbd>Enter</kbd> demo</span><span><kbd>\\</kbd> typewriter</span></p>
  </section>`;
document.body.append(root);
const $ = (s) => root.querySelector(s);
const panel = $('.sb-panel'), road = $('.sb-road'), track = $('.sb-track'), kbd = $('.sb-kbd');
panel.inert = true;

// keyboard map (also tappable for touch screens)
ROWS.forEach(([labels, codes], row) => {
  const r = document.createElement('div'); r.className = 'sb-krow'; r.dataset.row = row;
  codes.forEach((code) => {
    const k = KEY[code], el = document.createElement('div');
    el.className = 'sb-k' + (k.midi % 12 === 2 ? ' is-tonic' : ''); el.dataset.code = code;
    el.innerHTML = `<b>${k.label.toUpperCase()}</b><span>${nameOf(k.midi)}</span>`;
    r.append(el);
  });
  kbd.append(r);
});
kbd.addEventListener('pointerdown', (e) => {
  const el = e.target.closest('.sb-k'); if (!el) return;
  e.preventDefault(); pressNote(el.dataset.code, e.shiftKey);
  const up = () => { el.classList.remove('is-down'); removeEventListener('pointerup', up); };
  addEventListener('pointerup', up);
});
const keyEl = (code) => kbd.querySelector(`[data-code="${code}"]`);

// chord ribbon for the typewriter
// (O.CHORDS is live: it changes when the orchestra turns to another piece)
const renderChords = () => ($('.sb-chords').innerHTML = O.CHORDS.map(([m, q], i) => `<span data-i="${i}">${nameOf(m)}${q === 'm' ? 'm' : ''}</span>`).join(''));
renderChords();
addEventListener('orch:song', (e) => e.detail?.next || renderChords());

// ---------- instruments ----------
function renderInsts() {
  const list = melodic();
  if (!inst || !O.byId[inst]) inst = (list.find((i) => i.id === 'piano') || list[0])?.id;
  $('.sb-insts').innerHTML = list.map((i, n) =>
    `<button type="button" class="sb-chip" data-sb-inst="${i.id}" style="--h:${i.hue}" aria-pressed="${i.id === inst}">${n < 9 ? `<kbd>${n + 1}</kbd>` : ''}${i.name}</button>`).join('');
  root.style.setProperty('--h', hue());
}
function pickInst(id) {
  if (!O.byId[id]) return;
  inst = id; root.style.setProperty('--h', hue());
  root.querySelectorAll('[data-sb-inst]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.sbInst === id));
  const b = root.querySelector(`[data-sb-inst="${id}"]`);
  if (b) { scrollChip(b); b.classList.remove('is-pop'); void b.offsetWidth; b.classList.add('is-pop'); }
  O.strike(id, 74, 0.5, 0.5);
}
$('.sb-insts').addEventListener('click', (e) => { const b = e.target.closest('[data-sb-inst]'); if (b) pickInst(b.dataset.sbInst); });

// ---------- songs ----------
$('.sb-songs').innerHTML = `<button type="button" class="sb-song" data-i="-1">Free play</button>` +
  SONGS.map((s, i) => `<button type="button" class="sb-song" data-i="${i}">${s.title}</button>`).join('');
$('.sb-songs').addEventListener('click', (e) => { const b = e.target.closest('.sb-song'); if (b) pickSong(+b.dataset.i); });
function scrollChip(b) {
  const row = b.parentElement, l = b.offsetLeft - row.offsetLeft, r = l + b.offsetWidth;
  if (l < row.scrollLeft + 16) row.scrollTo({ left: l - 24, behavior: reduced.matches ? 'auto' : 'smooth' });
  else if (r > row.scrollLeft + row.clientWidth - 16) row.scrollTo({ left: r - row.clientWidth + 24, behavior: reduced.matches ? 'auto' : 'smooth' });
}

const UNIT = 26, CAP = 46;
function pickSong(i) {
  stopDemo(); releaseBacking();
  songIdx = Math.max(-1, Math.min(SONGS.length - 1, i));
  root.querySelectorAll('.sb-song').forEach((b) => b.setAttribute('aria-pressed', +b.dataset.i === songIdx));
  const b = root.querySelector(`.sb-song[data-i="${songIdx}"]`); if (b) scrollChip(b);
  const s = song();
  road.classList.toggle('is-free', !s);
  $('.sb-now').innerHTML = s ? `<b>${s.title}</b> <span>${s.by} · ${s.notes.length} notes</span>` : '<b>Free play</b> <span>no score, just you</span>';
  track.innerHTML = '';
  if (s) {
    let x = 0;
    s.xs = s.notes.map((n) => { const v = x; x += CAP + 8 + n.beats * UNIT; return v; });
    track.innerHTML = s.notes.map((n, j) => `
      <div class="sb-cap" style="left:${s.xs[j]}px;--len:${Math.max(0, n.beats * UNIT - 6)}px;--d:${Math.min(j, 12) * 22}ms">
        <span class="sb-cap-key">${n.shift ? '<i>⇧</i>' : ''}${n.label.toUpperCase()}</span>
        <span class="sb-cap-note">${nameOf(n.midi)}</span>
        ${n.lyric ? `<span class="sb-cap-lyric">${n.lyric}</span>` : ''}
      </div>`).join('');
  }
  restart();
}
function restart() {
  pos = 0; finished = false;
  $('.sb-bravo').classList.remove('is-on');
  track.classList.remove('is-fresh'); void track.offsetWidth; track.classList.add('is-fresh');
  layout(true);
  renderDemoBtn();
}
function layout(jump) {
  const s = song();
  kbd.querySelectorAll('.is-want').forEach((e) => e.classList.remove('is-want', 'is-shift'));
  if (!s) { $('.sb-prog i').style.transform = 'scaleX(0)'; return; }
  [...track.children].forEach((c, i) => { c.classList.toggle('is-past', i < pos); c.classList.toggle('is-next', i === pos && !finished); });
  const lineX = Math.min(road.clientWidth * 0.24, 150);
  const x = pos < s.xs.length ? s.xs[pos] : s.xs[s.xs.length - 1] + CAP + 40;
  track.style.transition = jump ? 'none' : '';
  track.style.transform = `translateX(${lineX - x}px)`;
  $('.sb-prog i').style.transform = `scaleX(${pos / s.notes.length})`;
  const n = s.notes[pos];
  if (n && !finished) { const k = keyEl(n.code); k?.classList.add('is-want'); if (n.shift) k?.classList.add('is-shift'); }
}
addEventListener('resize', () => { if (open) { layout(true); twCaret(true); } });

// ---------- playing ----------
function sound(midi, beats = 1, vel = 0.85) { if (inst) O.strike(inst, midi, beats, vel); }
function flashKey(code) {
  const k = keyEl(code); if (!k) return;
  k.classList.remove('is-down'); void k.offsetWidth; k.classList.add('is-down');
  clearTimeout(k._t); k._t = setTimeout(() => k.classList.remove('is-down'), 260);
}
function pressNote(code, shift) {
  const k = KEY[code]; if (!k) return;
  const midi = k.midi - (shift ? 1 : 0), s = song();
  flashKey(code);
  if (s && !finished && !demo) {
    if (midi === s.notes[pos].midi) return advance();
    sound(midi, 1, 0.6); miss(); return;
  }
  sound(midi, 1, 0.85);
  const r = keyEl(code)?.getBoundingClientRect();
  if (r && !s) spark(r.left + r.width / 2, r.top, 7, 0.6);
}
function advance() {
  const s = song(), n = s.notes[pos], cap = track.children[pos];
  if (pos === 0) startBacking();
  sound(n.midi, n.beats, 0.9);
  if (cap) {
    cap.classList.add('is-hit');
    const r = cap.getBoundingClientRect(); spark(r.left + r.width / 2, r.top + CAP / 2, 16, 1);
  }
  pos++;
  if (pos >= s.notes.length) finish();
  layout();
}
function miss() {
  road.classList.remove('is-miss'); void road.offsetWidth; road.classList.add('is-miss');
}

// ---------- demo: autoplay in time with the orchestra ----------
function renderDemoBtn() {
  const b = $('.sb-demo');
  b.innerHTML = demo ? `${ICON_STOP}<span>Stop</span><kbd>Enter</kbd>` : `${ICON_PLAY}<span>Demo</span><kbd>Enter</kbd>`;
  b.setAttribute('aria-pressed', !!demo);
  root.classList.toggle('is-demo', !!demo);
}
function startDemo() {
  if (!song()) pickSong(1);
  stopDemo(); restart();
  const s = song(), playing = O.seats.some((x) => x.active) || performance.now() - lastBeat.t < 2 * spb();
  startBacking();
  demo = { align: s.align || 4, waiting: playing || !!s.backing, timer: 0 };
  renderDemoBtn();
  if (!demo.waiting) go();
  else demo.timer = setTimeout(() => demo?.waiting && go(), (demo.align + 1) * spb() + 400); // no beat came: just start
}
function go() {
  if (!demo) return;
  demo.waiting = false; clearTimeout(demo.timer); showCount(0);
  const step = () => {
    const s = song(); if (!demo || !s || finished) return;
    const n = s.notes[pos]; flashKey(n.code); advance();
    if (!finished) demo.timer = setTimeout(step, n.beats * spb());
  };
  step();
}
function stopDemo() {
  if (!demo) return;
  clearTimeout(demo.timer); demo = null; showCount(0); renderDemoBtn();
  releaseBacking();
}
function toggleDemo() { demo ? stopDemo() : startDemo(); }
function showCount(n) {
  const c = $('.sb-count');
  if (!n) { c.classList.remove('is-on'); return; }
  c.innerHTML = `<b>${n}</b><span>${n > 4 ? 'joining at the top of the loop' : 'count-in'}</span>`;
  c.classList.add('is-on');
  const b = c.querySelector('b'); b.classList.remove('is-tick'); void b.offsetWidth; b.classList.add('is-tick');
}
$('.sb-demo').addEventListener('click', toggleDemo);
$('.sb-again').addEventListener('click', () => { stopDemo(); restart(); });

// gentle backing for songs that fit the Canon; stop puts those sections back exactly as they were
function startBacking() {
  const s = song(); if (backing || !s?.backing) return;
  O.setPiece('canon'); // the backing follows the Canon's chords
  backing = s.backing.filter((id) => O.byId[id]).map((id) => ({ id, prev: O.seats.filter((x) => x.inst === id).map((x) => [x, x.active, x.loop]) }));
  backing.forEach((b) => O.section(b.id, 'solo'));
}
function releaseBacking() {
  if (!backing) return;
  backing.forEach((b) => b.prev.forEach(([x, on, loop]) => { if (on && !x.active) O.play(x, loop); else if (!on && x.active) O.stop(x); }));
  backing = null;
}

// ---------- finish: celebration ----------
function finish() {
  finished = true;
  const wasDemo = !!demo;
  if (demo) { clearTimeout(demo.timer); demo = null; renderDemoBtn(); }
  const s = song(), bravo = $('.sb-bravo');
  const word = wasDemo ? 'Fine.' : 'Bravo!';
  bravo.innerHTML = `<p class="sb-bravo-word" aria-label="${word}">${[...word].map((ch, i) => `<span style="--i:${i}">${ch}</span>`).join('')}</p>
    <p class="sb-bravo-sub">${s.title} · ${s.notes.length} notes</p>
    <div class="sb-bravo-act"><button type="button" data-a="again">${ICON_AGAIN}<span>Again</span><kbd>⌫</kbd></button>${songIdx < SONGS.length - 1 ? `<button type="button" data-a="next"><span>Next: ${SONGS[songIdx + 1].title}</span><kbd>↓</kbd></button>` : ''}</div>`;
  bravo.classList.add('is-on');
  // cadence on the chosen instrument: D major arpeggio
  [62, 66, 69, 74].forEach((m, i) => setTimeout(() => sound(m, 2, 0.55), 120 + i * 110));
  celebrate();
  setTimeout(() => { if (finished) releaseBacking(); }, 4 * spb());
}
$('.sb-bravo').addEventListener('click', (e) => {
  const a = e.target.closest('button')?.dataset.a;
  if (a === 'again') restart(); else if (a === 'next') pickSong(songIdx + 1);
});

// ---------- typewriter harmony ----------
let twCursor = 3, twTimer = 0;
function beatNow() {
  const now = performance.now();
  if (now - lastBeat.t < 2 * spb()) return lastBeat.beat + (now - lastBeat.t) / spb();
  return (now / spb()) % O.LOOP_BEATS;
}
function chordNow() {
  const i = Math.floor(beatNow() / 2) % O.CHORDS.length, [root, q] = O.CHORDS[i];
  return { i, root, tones: [0, q === 'M' ? 4 : 3, 7].map((x) => (root + x) % 12) };
}
function typeChar(ch) {
  const { i, root, tones } = chordNow();
  const pool = []; for (let m = 60; m <= 86; m++) if (tones.includes(m % 12)) pool.push(m);
  const c = ch.toLowerCase().codePointAt(0), vowel = /[aeiouyאוי]/i.test(ch);
  twCursor += ((c * 7) % 5) - 2 || 1;
  if (twCursor < 0) twCursor = 1 + (c % 2);
  if (twCursor >= pool.length) twCursor = pool.length - 2 - (c % 2);
  let midi = pool[twCursor];
  if (/[.!?]/.test(ch)) { midi = pool[0]; sound(root < 45 ? root + 12 : root, 2, 0.7); }
  else if (/[A-Z]/.test(ch)) midi += 12;
  const ok = ch === twLine()[twAt];
  sound(midi, vowel ? 1 : 0.5, !ok ? 0.3 : vowel ? 0.95 : 0.6);
  hit(ok, tones.indexOf(midi % 12), midi);
  tickChords(i);
}
function typeSpace() {
  const { i, root } = chordNow();
  sound(root < 45 ? root + 12 : root, 1, 0.45);
  hit(twLine()[twAt] === ' ', -1, 72); tickChords(i);
}
function typeEnter() {
  const { i, tones } = chordNow();
  let base = 62; while (base % 12 !== tones[0]) base++;
  [0, (tones[1] - tones[0] + 12) % 12, (tones[2] - tones[0] + 12) % 12, 12].forEach((x, j) => setTimeout(() => sound(base + x, 2, 0.7), j * 70));
  tickChords(i);
  const r = $('.sb-text').getBoundingClientRect(); spark(r.right - 24, r.top + r.height / 2, 24, 1);
}

// monkeytype-style: a line to copy; typed letters take their pitch and chord colour, misses go red
const LINES = [
  'the violins rise and the whole hall holds its breath.',
  'every letter you type lands on the chord the orchestra is playing.',
  'pachelbel wrote this canon more than three hundred years ago.',
  'a quick brown fox jumps over the lazy conductor.',
  'the cellos hum below while the flutes dance on top.',
  'play it slowly, then play it again a little faster.',
  'the timpani wait all night for a single loud moment.',
  'when the music stops, the audience is still listening.',
];
let twIdx = -1, twAt = 0, twMiss = 0, twT0 = 0;
const twLine = () => LINES[twIdx];
const twChars = () => $('.sb-line').children;
function twLoad(msg = 'Type the line. Every letter lands on the chord the orchestra is playing.') {
  twIdx = (twIdx + 1) % LINES.length; twAt = 0; twMiss = 0; twT0 = 0;
  $('.sb-line').innerHTML = [...twLine()].map((c) => `<span class="sb-g">${c === ' ' ? '&nbsp;' : c}</span>`).join('');
  $('.sb-tw-meta').innerHTML = `${msg} <span><kbd>Enter</kbd> skip</span>`;
  twCaret(true);
}
function twCaret(jump) {
  const t = $('.sb-text'), line = $('.sb-line'), c = twChars()[twAt];
  line.querySelector('.is-at')?.classList.remove('is-at');
  c?.classList.add('is-at');
  // ponytail: one line that slides left once the caret passes 40%, no word wrap; fine for one-sentence lines
  const x = Math.min(0, t.clientWidth * 0.4 - (c ? c.offsetLeft : line.offsetWidth));
  t.classList.toggle('is-scrolled', x < 0);
  line.style.transition = jump ? 'none' : '';
  line.style.transform = `translateX(${x}px)`;
}
function hit(ok, role, midi) {
  const g = twChars()[twAt]; if (!g) return;
  if (!twT0) twT0 = performance.now();
  if (!ok) twMiss++;
  g.className = 'sb-g is-typed' + (!ok ? ' is-bad' : role === 0 ? ' is-root' : role === 1 ? ' is-third' : role === 2 ? ' is-fifth' : '');
  g.style.setProperty('--y', `${Math.max(-1.1, Math.min(1.1, (midi - 72) / 11))}`);
  if (ok && twLine()[twAt] !== ' ') { const r = g.getBoundingClientRect(); spark(r.left + r.width / 2, r.top + r.height / 2, 5, 0.5); }
  if (++twAt < twChars().length) return twCaret();
  const n = twChars().length, min = (performance.now() - twT0) / 60000;
  typeEnter();
  twLoad(`<b>${Math.round(n / 5 / Math.max(min, 1 / 60))} wpm</b> · ${Math.round(100 * Math.max(0, n - twMiss) / n)}% accuracy. Next:`);
}
function twBack() {
  if (!twAt) return;
  const g = twChars()[--twAt];
  g.className = 'sb-g'; g.style.removeProperty('--y');
  twCaret();
}
function tickChords(i = chordNow().i) {
  $('.sb-chords').querySelectorAll('span').forEach((s) => s.classList.toggle('is-on', +s.dataset.i === i));
}
function setTypewriter(on) {
  typewriter = on;
  root.classList.toggle('is-type', on);
  root.querySelectorAll('[data-mode]').forEach((b) => b.setAttribute('aria-pressed', (b.dataset.mode === 'type') === on));
  clearInterval(twTimer);
  if (on) { stopDemo(); twTimer = setInterval(() => open && tickChords(), 120); tickChords(); twCaret(true); }
}
root.querySelector('.sb-modes').addEventListener('click', (e) => { const b = e.target.closest('[data-mode]'); if (b) setTypewriter(b.dataset.mode === 'type'); });

// ---------- sparks (one fixed canvas, only animates while something is alive) ----------
const fx = document.createElement('canvas'); fx.className = 'sb-fx'; fx.setAttribute('aria-hidden', 'true');
document.body.append(fx);
const g2 = fx.getContext('2d');
let parts = [], raf = 0, tone = { s: 80, l: 64 };
function readTone() {
  const cs = getComputedStyle(document.documentElement);
  tone = { s: parseFloat(cs.getPropertyValue('--hue-s')) || 80, l: parseFloat(cs.getPropertyValue('--hue-l')) || 64 };
}
readTone(); addEventListener('orch:theme', () => requestAnimationFrame(readTone));
function fitFx() { const d = devicePixelRatio || 1; fx.width = innerWidth * d; fx.height = innerHeight * d; }
fitFx(); addEventListener('resize', fitFx);
function spark(x, y, n, power, h = hue(), gold = 0.3) {
  if (reduced.matches) return;
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, v = (1.5 + Math.random() * 3.5) * power;
    parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 1.2 * power, life: 1, decay: 0.018 + Math.random() * 0.02, r: 1.2 + Math.random() * 2.2, h: Math.random() < gold ? 42 : h });
  }
  if (!raf) raf = requestAnimationFrame(tick);
}
function tick() {
  const d = devicePixelRatio || 1;
  g2.setTransform(d, 0, 0, d, 0, 0); g2.clearRect(0, 0, innerWidth, innerHeight);
  g2.globalCompositeOperation = 'lighter';
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i];
    p.x += p.vx; p.y += p.vy; p.vy += 0.09; p.vx *= 0.985; p.life -= p.decay;
    if (p.rocket && (p.vy > -0.6 || p.life < 0.5)) { parts.splice(i, 1); spark(p.x, p.y, 44, 1.5, p.h, 0.5); continue; }
    if (p.life <= 0) { parts.splice(i, 1); continue; }
    g2.fillStyle = `hsla(${p.h} ${tone.s}% ${Math.min(80, tone.l + 8)}% / ${p.life})`;
    g2.beginPath(); g2.arc(p.x, p.y, p.r * (0.6 + p.life * 0.6), 0, Math.PI * 2); g2.fill();
  }
  raf = parts.length ? requestAnimationFrame(tick) : 0;
  if (!raf) g2.clearRect(0, 0, innerWidth, innerHeight);
}
function celebrate() {
  if (reduced.matches) return;
  const r = panel.getBoundingClientRect(), hs = [hue(), 42, (hue() + 40) % 360, 42, hue()];
  hs.forEach((h, i) => setTimeout(() => {
    parts.push({ rocket: true, x: r.left + r.width * (0.15 + 0.7 * Math.random()), y: r.top + r.height * 0.6, vx: (Math.random() - 0.5) * 2, vy: -9 - Math.random() * 4, life: 1, decay: 0.01, r: 2.4, h });
    if (!raf) raf = requestAnimationFrame(tick);
  }, i * 220));
}

// ---------- open / close ----------
// keys.js floats a HUD at the bottom centre: sit the drawer (and lift the pill) above it
function hudRoom() {
  const hud = document.querySelector('.k-hud'), r = hud?.getBoundingClientRect();
  const room = r && r.height ? Math.round(innerHeight - r.top) + 8 : 0;
  root.classList.toggle('has-hud', room > 0);
  root.style.setProperty('--hud-room', room + 'px');
  root.style.setProperty('--pill-lift', r && r.right > innerWidth - 190 ? room + 'px' : '0px');
}
addEventListener('resize', hudRoom); setTimeout(hudRoom, 400);
let padPrev = '';
const padFor = () => panel.offsetHeight + (parseFloat(root.style.getPropertyValue('--hud-room')) || 0) + 24 + 'px';
const ro = new ResizeObserver(() => { if (open) document.body.style.paddingBottom = padFor(); });
ro.observe(panel);
export function enter() {
  if (open) return;
  open = true; padPrev = document.body.style.paddingBottom;
  hudRoom();
  renderInsts();
  root.classList.add('is-open'); panel.inert = false;
  document.body.style.paddingBottom = padFor();
  requestAnimationFrame(() => layout(true));
  if (typewriter) setTypewriter(true);
}
export function exit() {
  if (!open) return;
  open = false; stopDemo(); releaseBacking(); clearInterval(twTimer);
  root.classList.remove('is-open'); panel.inert = true;
  document.body.style.paddingBottom = padPrev;
  kbd.querySelectorAll('.is-down').forEach((k) => k.classList.remove('is-down'));
}
export const onModeChange = (m) => (m === 'play' ? enter() : exit());
// typewriter needs Space as a word break; keys.js can ask before treating Space as Tutti
export const wantsSpace = () => open && typewriter;
// ask keys.js to switch modes (it owns the mode); fall back to opening ourselves
function requestMode(on) {
  if (!hasKeysJs()) return on ? enter() : exit();
  import('./keys.js').then((k) => k.setMode?.(on ? 'play' : 'conduct'), () => {})
    .finally(() => { if (open !== on) on ? enter() : exit(); });
}
$('.sb-pill').addEventListener('click', () => requestMode(true));
// mouse clicks shouldn't leave a focus ring on a panel button while you type notes
panel.addEventListener('click', (e) => { if (e.detail > 0) e.target.closest('button')?.blur(); });
$('.sb-x').addEventListener('click', () => requestMode(false));
// theater mode makes the stage full-viewport: float above it
addEventListener('orch:theater', (e) => root.classList.toggle('is-theater', !!e.detail?.on));
addEventListener('orch:mode', (e) => (e.detail?.mode === 'play' ? enter() : e.detail?.mode === 'conduct' && exit()));
addEventListener('orch:beat', (e) => {
  lastBeat = { beat: e.detail.beat, t: performance.now() };
  if (open) { const st = $('.sb-strike'); st.classList.remove('is-beat', 'is-down'); void st.offsetWidth; st.classList.add('is-beat'); if (e.detail.beat % 4 === 0) st.classList.add('is-down'); }
  if (demo?.waiting) {
    const left = (demo.align - (e.detail.beat % demo.align)) % demo.align;
    if (left === 0) go(); else showCount(left);
  }
  if (open && typewriter) tickChords(Math.floor(e.detail.beat / 2));
});

// ---------- the key handler keys.js calls in PLAY mode ----------
export function onPlayKey(e, isDown) {
  if (e.ctrlKey || e.metaKey || e.altKey) return false;
  const code = codeOf(e);
  if (!isDown) return !!KEY[code] || (typewriter && e.key?.length === 1);
  if (!open) enter();
  const done = () => { e.preventDefault(); return true; };
  if (/^Digit[1-9]$/.test(code)) { const i = melodic()[+code[5] - 1]; if (i) pickInst(i.id); return done(); }
  if (code === 'Backslash') { setTypewriter(!typewriter); return done(); }
  if (typewriter) {
    if (e.repeat) return done();
    if (code === 'Enter' || code === 'NumpadEnter') { typeEnter(); twLoad(); return done(); }
    if (code === 'Backspace') { twBack(); return done(); }
    if (code === 'Space') { typeSpace(); return done(); }
    if (e.key && e.key.length === 1) { typeChar(e.key); return done(); }
    return false;
  }
  if (code === 'ArrowDown' || code === 'ArrowRight') { pickSong(songIdx + 1); return done(); }
  if (code === 'ArrowUp' || code === 'ArrowLeft') { pickSong(songIdx - 1); return done(); }
  if (code === 'Enter' || code === 'NumpadEnter') { toggleDemo(); return done(); }
  if (code === 'Backspace') { stopDemo(); restart(); return done(); }
  if (KEY[code]) {
    if (code === 'Slash' && e.shiftKey) return false; // leave ? to the cheat sheet
    if (!e.repeat) pressNote(code, e.shiftKey);
    return done();
  }
  return false;
}

// ---------- until keys.js lands: our own listener (` toggles PLAY) ----------
if (!hasKeysJs()) {
  const typing = (e) => e.target?.closest?.('input, textarea, select, [contenteditable]');
  addEventListener('keydown', (e) => {
    if (typing(e) || hasKeysJs()) return;
    if (codeOf(e) === 'Backquote' && !e.ctrlKey && !e.metaKey) { e.preventDefault(); open ? exit() : enter(); return; }
    if (e.code === 'Escape' && open) { exit(); return; }
    if (open) onPlayKey(e, true);
  });
  addEventListener('keyup', (e) => { if (open && !typing(e) && !hasKeysJs()) onPlayKey(e, false); });
}

pickSong(-1); twLoad(); setTypewriter(false); renderInsts();
