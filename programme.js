// Programme: the repertoire as a printed concert programme, mounted under the masthead (styles in programme.css).
// Picking a work calls O.setPiece: silent orchestra = it turns now, playing = it turns at the top of the loop.
// Every entry carries an engraved incipit drawn from the piece's own melody; the one on the stands lights
// note by note as it plays. On a page turn the masthead title and the timeline chords swap in step.
import * as O from './audio.js';
import { ACTS, chordName } from './repertoire.js';

const css = document.createElement('link');
css.rel = 'stylesheet'; css.href = new URL('./programme.css', import.meta.url).href;
document.head.append(css);

const $ = (s, el = document) => el.querySelector(s);
const reduce = matchMedia('(prefers-reduced-motion: reduce)');
const EASE_OUT = 'cubic-bezier(.16,1,.3,1)';
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

// ---------- incipit: the opening bar (or two) engraved on a treble staff ----------
const LETTER = [0, 0, 1, 1, 2, 3, 3, 4, 4, 5, 5, 6]; // pitch class -> staff letter; sharps sit on the natural's line
const stepOf = (m) => (Math.floor(m / 12) - 1) * 7 + LETTER[m % 12]; // B4 = 34 is the middle line
const W = 120, X0 = 7, X1 = 113;
const yOf = (step) => 22 - (step - 34) * 2;
function incipit(melody) {
  const bars = melody.filter((n) => n[0] < 4).length >= 5 ? 1 : 2;
  const notes = melody.filter((n) => n[0] < bars * 4);
  const xOf = (b) => X0 + (b / (bars * 4)) * (X1 - X0);
  let svg = [30, 32, 34, 36, 38].map((s) => `<line class="st" x1="0" x2="${W}" y1="${yOf(s)}" y2="${yOf(s)}"/>`).join('');
  if (bars === 2) svg += `<line class="st bar" x1="${xOf(4) - 3.5}" x2="${xOf(4) - 3.5}" y1="${yOf(38)}" y2="${yOf(30)}"/>`;
  // stems: one direction per beamed group (short notes sharing a beat), by the group's mean height
  const groups = new Map();
  notes.forEach((n) => { if (n[2] < 1) { const k = Math.floor(n[0]); groups.set(k, [...(groups.get(k) || []), n]); } });
  const dirOf = (n) => { const g = n[2] < 1 ? groups.get(Math.floor(n[0])) : [n]; return g.reduce((a, x) => a + stepOf(x[1]), 0) / g.length < 34 ? -1 : 1; };
  const tip = new Map(); // note -> stem end y (beams move it)
  for (const g of groups.values()) {
    if (g.length < 2) continue;
    const d = dirOf(g[0]), xa = xOf(g[0][0]), xb = xOf(g[g.length - 1][0]);
    let ya = yOf(stepOf(g[0][1])) + d * 10, yb = yOf(stepOf(g[g.length - 1][1])) + d * 10;
    const at = (x) => ya + ((yb - ya) * (x - xa)) / (xb - xa || 1);
    const short = Math.max(...g.map((n) => d * (yOf(stepOf(n[1])) + d * 8 - at(xOf(n[0]))))); // every stem at least 8
    if (short > 0) { ya += d * short; yb += d * short; }
    g.forEach((n) => tip.set(n, at(xOf(n[0]))));
    const sx = d < 0 ? 2.4 : -2.4;
    svg += `<path class="beam" d="M${xa + sx} ${ya}L${xb + sx} ${yb}"/>`;
  }
  svg += notes.map((n) => {
    const [b, m, dur] = n, s = stepOf(m), x = xOf(b), y = yOf(s), d = dirOf(n);
    let g = '';
    for (let l = 40; l <= s; l += 2) g += `<line class="ledger" x1="${x - 4.5}" x2="${x + 4.5}" y1="${yOf(l)}" y2="${yOf(l)}"/>`;
    for (let l = 28; l >= s; l -= 2) g += `<line class="ledger" x1="${x - 4.5}" x2="${x + 4.5}" y1="${yOf(l)}" y2="${yOf(l)}"/>`;
    g += `<ellipse class="${dur >= 2 ? 'hd open' : 'hd'}" cx="${x}" cy="${y}" rx="2.7" ry="1.85" transform="rotate(-20 ${x} ${y})"/>`;
    if (dur < 4) {
      const sx = x + (d < 0 ? 2.4 : -2.4), end = tip.get(n) ?? y + d * 10;
      g += `<line class="stem" x1="${sx}" x2="${sx}" y1="${y + d * 0.6}" y2="${end}"/>`;
      if (dur < 1 && !tip.has(n)) g += `<path class="flag" d="M${sx} ${end}c0 ${-d * 3} 4.6 ${-d * 4} 4 ${-d * 8.5}"/>`;
    }
    if ((dur * 4) % 3 === 0) g += `<circle class="dot" cx="${x + 4.6}" cy="${s % 2 ? y : y - 1}" r="0.95"/>`;
    return `<g class="n" data-b="${b}">${g}</g>`;
  }).join('');
  return `<svg class="pg-inc" viewBox="0 0 ${W} 40" aria-hidden="true">${svg}</svg>`;
}

// ---------- markup ----------
const CHEV = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 6.2 8 10l4-3.8" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const work = (p) => `
  <li><button type="button" class="pg-work" data-id="${p.id}" aria-pressed="false" aria-label="${esc(`${p.title}, ${p.composer}, ${p.year}, ${p.key}`)}">
    <span class="pg-title">${esc(p.title)}</span>
    <span class="pg-meta"><span class="pg-by">${esc(p.short)}</span><span class="pg-year">${esc(p.year)}</span><span class="pg-key">${esc(p.key)}</span></span>
    <span class="pg-next" aria-hidden="true">Next, at the top of the loop</span>
    ${incipit(p.melody)}
  </button></li>`;

const root = document.createElement('details');
root.className = 'pg';
root.open = !matchMedia('(max-width: 720px)').matches; // phones keep the stage above the fold
root.innerHTML = `
  <summary class="pg-head">
    <h2 class="pg-h" id="pg-h">Programme</h2>
    <span class="pg-hint">Pick a work. A playing orchestra turns the page at the top of the loop.</span>
    <span class="pg-cur"></span>
    <span class="pg-fold">${CHEV}</span>
  </summary>
  <div class="pg-acts">
    ${ACTS.map(([n, name]) => `
      <section class="pg-act" aria-label="Act ${n}: ${esc(name)}">
        <h3><span class="pg-act-n">Act ${n}</span><span class="pg-act-t">${esc(name)}</span></h3>
        <ol class="pg-list">${O.PIECES.filter((p) => p.act === n).map(work).join('')}</ol>
      </section>`).join('')}
  </div>
  <p class="pg-live" aria-live="polite"></p>`;
root.hidden = true; // until programme.css is in, or raw buttons flash on load
css.addEventListener('load', () => (root.hidden = false));
css.addEventListener('error', () => (root.hidden = false));
$('main > .top').after(root);

const entries = new Map([...root.querySelectorAll('.pg-work')].map((b) => [b.dataset.id, b]));
root.addEventListener('click', (e) => {
  const b = e.target.closest('.pg-work');
  if (b) O.setPiece(b.dataset.id);
});

// ---------- state: current + queued ----------
const playing = () => O.seats.some((s) => s.active);
const byId = (id) => O.PIECES.find((p) => p.id === id);
let cur = O.piece.id;
function mark(id, next) {
  for (const [k, b] of entries) {
    b.classList.toggle('is-next', k === next);
    b.classList.toggle('is-cur', k === id);
    b.setAttribute('aria-pressed', String(k === id));
    if (k !== id) b.querySelectorAll('.n').forEach((n) => n.classList.remove('on', 'now'));
  }
  $('.pg-cur', root).innerHTML = `<i>${esc(byId(id).title)}</i>${next ? `<span>then ${esc(byId(next).title)}</span>` : ''}`;
}
mark(cur, null);

// swap text in place: the old line blurs away, the new one settles in (the page turning)
function swap(el, text, delay = 0) {
  if (!el || el.textContent === text) return;
  el.getAnimations().forEach((a) => a.cancel());
  if (reduce.matches) { el.textContent = text; return; }
  el.animate([{ opacity: 1, filter: 'blur(0)', transform: 'none' }, { opacity: 0, filter: 'blur(5px)', transform: 'translateY(-5px)' }],
    { duration: 220, delay, easing: 'cubic-bezier(.7,0,.84,0)', fill: 'forwards' })
    .finished.then(() => {
      el.textContent = text;
      el.animate([{ opacity: 0, filter: 'blur(5px)', transform: 'translateY(6px)' }, { opacity: 1, filter: 'blur(0)', transform: 'none' }],
        { duration: 520, easing: EASE_OUT, fill: 'forwards' });
    });
}

addEventListener('orch:song', (e) => {
  const { id, next } = e.detail;
  const p = byId(id);
  if (next) {
    mark(cur, id);
    $('.pg-live', root).textContent = `${p.title} is next. It starts at the top of the loop.`;
    return;
  }
  cur = id;
  mark(id, null);
  $('.pg-live', root).textContent = `Now playing: ${p.title}, ${p.composer}.`;
  swap($('.work > span:first-child'), p.title);
  swap($('.work .by'), p.composer, 60);
  document.querySelectorAll('#timeline .chords span').forEach((s, i) => swap(s, chordName(O.CHORDS[i]), 90 + i * 45));
  if (!reduce.matches) { // the new incipit plays itself once, a ripple across the staff
    entries.get(id).querySelectorAll('.n').forEach((n, i) => n.animate(
      [{ transform: 'translateY(0)' }, { transform: 'translateY(-3px)' }, { transform: 'translateY(0)' }],
      { duration: 420, delay: 120 + i * 55, easing: EASE_OUT }));
  }
});

// ---------- the incipit on the stands lights note by note ----------
let timers = [];
addEventListener('orch:beat', (e) => {
  const b = e.detail.beat, inc = entries.get(cur);
  timers.forEach(clearTimeout); timers = [];
  const notes = [...inc.querySelectorAll('.n')];
  if (!playing()) { notes.forEach((n) => n.classList.remove('on', 'now')); inc.classList.remove('is-live'); return; }
  inc.classList.add('is-live');
  if (b === 0) notes.forEach((n) => n.classList.remove('on', 'now'));
  const spb = 60000 / O.bpm;
  for (const n of notes) {
    const at = +n.dataset.b - b;
    if (at < 0 || at >= 1) continue;
    timers.push(setTimeout(() => {
      notes.forEach((x) => x.classList.remove('now'));
      n.classList.add('on', 'now');
    }, at * spb));
  }
});
addEventListener('orch:change', () => {
  if (playing()) return;
  const inc = entries.get(cur);
  inc.classList.remove('is-live');
  inc.querySelectorAll('.n').forEach((n) => n.classList.remove('on', 'now'));
});
