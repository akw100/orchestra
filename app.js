// Console UI: transport, loop timeline and per-section channel strips.
// The DOM is built once and diffed in place on orch:change, so animations survive updates.
import * as O from './audio.js';

const $ = (s, el = document) => el.querySelector(s);
const reduce = matchMedia('(prefers-reduced-motion: reduce)');
const EASE_OUT = 'cubic-bezier(.16,1,.3,1)';
const EASE_IN = 'cubic-bezier(.7,0,.84,0)';

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII', 'XIV', 'XV', 'XVI'];
const roman = (k) => ROMAN[k] || String(k + 1);
const ROLE = { melody: 'melody', chord: 'harmony', bass: 'bass line', perc: 'rhythm' };
const CHORDS = ['D', 'A', 'Bm', 'F♯m', 'G', 'D', 'G', 'A'];
const TEMPO = [[60, 'Largo'], [76, 'Adagio'], [108, 'Andante'], [120, 'Moderato'], [Infinity, 'Allegro']];
const marking = (b) => TEMPO.find(([max]) => b < max)[1];
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

const ICON = {
  minus: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 8h9" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
  plus: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 8h9M8 3.5v9" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
  play: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M5 3.2v9.6L12.6 8z" fill="currentColor"/></svg>',
  stop: '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="4.2" y="4.2" width="7.6" height="7.6" rx="1" fill="currentColor"/></svg>',
};

// ---------- timeline: 4 bars x 4 beats, chord names, smooth playhead ----------
const tl = $('#timeline');
tl.innerHTML = `
  <div class="chords">${CHORDS.map((c) => `<span>${c}</span>`).join('')}</div>
  <div class="beats">${Array.from({ length: O.LOOP_BEATS }, (_, b) => `<span class="cell${b % 4 === 0 ? ' down' : ''}${b === 0 ? ' one' : ''}"><i></i>${b % 4 === 0 ? `<b>${b / 4 + 1}</b>` : ''}</span>`).join('')}</div>
  <div class="playhead"><i></i></div>`;
const cells = [...tl.querySelectorAll('.cell')];
const playhead = $('.playhead', tl);

// ---------- sections, grouped by family ----------
const sections = $('#sections');
const strips = new Map(); // instId -> strip state
const chips = new Map(); // seatId -> chip state
const level = {}; // instId -> meter level 0..1

// Family groups in concert order; instruments registered later (plugins) get strips on the next orch:change.
const FAMILY_ORDER = ['strings', 'woodwinds', 'brass', 'keys', 'percussion', 'drums', 'voices'];
const groups = new Map(); // family -> .strips row
function familyRow(fam) {
  let row = groups.get(fam);
  if (row) return row;
  const group = document.createElement('section');
  group.className = 'family';
  group.dataset.family = fam;
  group.innerHTML = `<h3><span>${cap(fam)}</span></h3><div class="strips"></div>`;
  row = $('.strips', group);
  groups.set(fam, row);
  const rank = (f) => { const i = FAMILY_ORDER.indexOf(f); return i < 0 ? FAMILY_ORDER.length : i; };
  const next = [...sections.children].find((g) => rank(g.dataset.family) > rank(fam));
  sections.insertBefore(group, next || null);
  return row;
}
function ensureStrips() {
  for (const inst of O.INSTRUMENTS) {
    if (strips.has(inst.id)) continue;
    const el = buildStrip(inst);
    familyRow(inst.family || 'ensemble').append(el);
    if (!first) enter(el);
  }
}

function buildStrip(inst) {
  const el = document.createElement('article');
  const low = inst.name.toLowerCase();
  el.className = 'strip';
  el.dataset.inst = inst.id;
  el.style.setProperty('--hue', inst.hue);
  el.innerHTML = `
    <div class="meter" aria-hidden="true"><i></i></div>
    <header class="strip-name"><h4>${inst.name}</h4><p>${ROLE[inst.kind] ?? inst.kind}</p></header>
    <button class="sect" type="button" data-a="sect" hidden></button>
    <div class="seats">
      <div class="count" role="group" aria-label="${inst.name} players">
        <button class="step" type="button" data-a="rm" aria-label="Remove a ${low} player">${ICON.minus}</button>
        <button class="step" type="button" data-a="add" aria-label="Add a ${low} player">${ICON.plus}</button>
      </div>
    </div>`;
  const S = {
    inst, el, live: null,
    seatsEl: $('.seats', el), countEl: $('.count', el), rmBtn: $('[data-a="rm"]', el), sectBtn: $('.sect', el),
    meter: $('.meter', el),
  };
  setSectLook(S, false);
  strips.set(inst.id, S);
  return el;
}
// one section-wide control: Play all when everyone rests, Stop once anyone plays (same rule as Enter and the conductor)
function setSectLook(S, live) {
  S.live = live;
  S.sectBtn.classList.toggle('on', live);
  S.sectBtn.innerHTML = `${live ? ICON.stop : ICON.play}<span>${live ? 'Stop' : 'Play all'}</span>`;
  S.sectBtn.setAttribute('aria-label', `${S.inst.name}: ${live ? 'stop the section' : 'play every player'}`);
}

function makeChip(seat, inst) {
  const wrap = document.createElement('div');
  wrap.className = 'seat';
  wrap.dataset.seat = seat.id;
  wrap.innerHTML = `
    <button class="chip" type="button" data-a="toggle" aria-pressed="false">
      <span class="ring" aria-hidden="true"></span><span class="fill" aria-hidden="true"></span>
      <span class="halo" aria-hidden="true"></span><span class="num" aria-hidden="true">${roman(seat.k)}</span>
    </button>`;
  const c = { seat, inst, wrap, chip: $('.chip', wrap), active: null, loop: null, startAbs: 0 };
  setLoopLook(c, seat.loop);
  setActive(c, seat.active, 0);
  return c;
}

// loop vs once lives on the chip itself (right-click / Shift-click, like the stage); a dashed rim marks "once"
const label = (c) => c.chip.setAttribute('aria-label',
  `${c.inst.name} ${roman(c.seat.k)}: ${c.active ? `playing${c.loop ? '' : ' once'}, stop` : `play${c.loop ? '' : ' once'}`}`);
function setLoopLook(c, loop) {
  c.loop = loop;
  c.wrap.classList.toggle('once', !loop);
  label(c);
}
function setActive(c, on, delay) {
  if (on && !c.active) {
    c.startAbs = absBeat + 1; // audio starts a seat on the next beat
    c.chip.style.setProperty('--p', 0);
  }
  c.active = on;
  c.wrap.style.setProperty('--d', `${delay}ms`);
  c.chip.classList.toggle('on', on);
  c.chip.setAttribute('aria-pressed', String(on));
  label(c);
}

function enter(el) {
  if (reduce.matches) return;
  el.animate(
    [{ opacity: 0, transform: 'translateY(10px) scale(.35)', filter: 'blur(6px)' }, { opacity: 1, transform: 'none', filter: 'blur(0)' }],
    { duration: 560, easing: EASE_OUT },
  );
}
function leave(c) {
  c.wrap.inert = true;
  c.wrap.classList.add('leaving');
  if (reduce.matches) return c.wrap.remove();
  c.wrap.animate(
    [{ opacity: 1, transform: 'none', filter: 'blur(0)' }, { opacity: 0, transform: 'translateY(8px) scale(.4)', filter: 'blur(5px)' }],
    { duration: 300, easing: EASE_IN, fill: 'forwards' },
  ).finished.then(() => c.wrap.remove());
}

// ---------- in-place diff, coalesced per task (section() emits one change per seat) ----------
let queued = false, first = true;
const schedule = () => { if (!queued) { queued = true; queueMicrotask(update); } };

function update() {
  queued = false;
  ensureStrips();
  const live = new Set(O.seats.map((s) => s.id));
  for (const [id, c] of chips) if (!live.has(id)) { leave(c); chips.delete(id); }
  const changed = [];
  let total = 0, playing = 0;
  for (const inst of O.INSTRUMENTS) {
    const S = strips.get(inst.id);
    if (!S) continue;
    const list = O.seats.filter((s) => s.inst === inst.id);
    for (const seat of list) {
      let c = chips.get(seat.id);
      if (!c) {
        c = makeChip(seat, inst);
        chips.set(seat.id, c);
        S.seatsEl.insertBefore(c.wrap, S.countEl);
        if (!first) enter(c.wrap);
      } else if (c.active !== seat.active) changed.push([c, seat.active]);
      if (c.loop !== seat.loop) setLoopLook(c, seat.loop);
    }
    const on = list.filter((s) => s.active).length;
    total += list.length; playing += on;
    S.rmBtn.disabled = list.length <= 1;
    S.sectBtn.hidden = list.length < 2; // a lone player is its own section toggle
    S.el.classList.toggle('live', on > 0);
    if (S.live !== on > 0) setSectLook(S, on > 0);
  }
  // stagger: players visibly join / leave one after another
  const gap = changed.length > 1 ? Math.min(80, 720 / changed.length) : 0;
  changed.forEach(([c, on], i) => setActive(c, on, reduce.matches ? 0 : Math.round(i * gap)));
  $('#tally').textContent = playing ? `${playing} of ${total} playing` : `${total} players, all resting`;
  document.body.classList.toggle('playing', playing > 0);
  first = false;
}
addEventListener('orch:change', schedule);

sections.addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b || b.closest('.leaving')) return;
  const S = strips.get(b.closest('.strip').dataset.inst);
  const seat = O.seats.find((s) => s.id === +b.closest('.seat')?.dataset.seat);
  const a = b.dataset.a;
  if (a === 'toggle') seat && (e.shiftKey || e.altKey ? O.setLoop(seat, !seat.loop) : O.toggle(seat));
  else if (a === 'add') O.addSeat(S.inst.id);
  else if (a === 'rm') O.removeSeat(S.inst.id);
  else if (a === 'sect') O.section(S.inst.id, S.live ? 'none' : 'all');
});
sections.addEventListener('contextmenu', (e) => {
  const w = e.target.closest('.chip')?.closest('.seat:not(.leaving)');
  const seat = w && O.seats.find((s) => s.id === +w.dataset.seat);
  if (!seat) return;
  e.preventDefault();
  O.setLoop(seat, !seat.loop);
});

// ---------- notes: chip pulse in the instrument hue + section meter ----------
addEventListener('orch:note', (e) => {
  const { seat, inst, vel } = e.detail;
  level[inst] = Math.min(1, (level[inst] || 0) * 0.5 + vel * 0.6);
  if (reduce.matches) return;
  const c = chips.get(seat);
  if (!c) return;
  const v = Math.max(0.4, Math.min(1, vel));
  c.chip.animate([{ scale: 1 + 0.12 * v }, { scale: 1 }], { duration: 380, easing: EASE_OUT });
  $('.halo', c.chip).animate(
    [{ opacity: 0.95 * v, transform: 'scale(.92)' }, { opacity: 0, transform: `scale(${1.5 + 0.35 * v})` }],
    { duration: 620, easing: EASE_OUT },
  );
  $('.fill', c.chip).animate([{ filter: 'brightness(1.55) saturate(1.2)' }, { filter: 'brightness(1)' }], { duration: 420, easing: EASE_OUT });
});

// ---------- beats: timeline + loop rings ----------
let absBeat = -1, beatAt = 0, curBeat = -1;
addEventListener('orch:beat', (e) => {
  absBeat++;
  beatAt = performance.now();
  const prev = cells[curBeat];
  curBeat = e.detail.beat;
  prev?.classList.remove('now');
  if (curBeat === 0) cells.forEach((c) => c.classList.remove('past'));
  prev?.classList.add('past');
  const cell = cells[curBeat];
  cell.classList.add('now');
  tl.classList.add('running');
  if (!reduce.matches) {
    $('i', cell).animate([{ transform: 'scaleY(1.5)', filter: 'brightness(1.8)' }, { transform: 'none', filter: 'none' }], { duration: 480, easing: EASE_OUT });
  }
});

function frame(now) {
  const smooth = !reduce.matches;
  const frac = smooth && absBeat >= 0 ? Math.min(1, (now - beatAt) / (60000 / O.bpm)) : 0;
  const pos = absBeat + frac;
  if (curBeat >= 0) playhead.style.setProperty('--ph', ((curBeat + frac) / O.LOOP_BEATS).toFixed(4));
  for (const c of chips.values()) {
    if (!c.active) continue;
    const p = (pos - c.startAbs) / O.LOOP_BEATS;
    c.chip.style.setProperty('--p', p <= 0 ? 0 : (p % 1).toFixed(4));
  }
  for (const S of strips.values()) {
    const l = (level[S.inst.id] || 0) * 0.9;
    level[S.inst.id] = l < 0.005 ? 0 : l;
    S.meter.style.setProperty('--lvl', level[S.inst.id].toFixed(3));
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// ---------- transport ----------
$('#tutti').addEventListener('click', () => O.tutti());
$('#stop').addEventListener('click', () => O.stopAll());

const bpmIn = $('#bpm');
function showTempo(v) {
  bpmIn.value = v;
  $('#bpmv').textContent = v;
  $('#marking').textContent = marking(v);
  bpmIn.style.setProperty('--fill', ((v - +bpmIn.min) / (+bpmIn.max - +bpmIn.min)).toFixed(3));
}
bpmIn.addEventListener('input', () => {
  const v = +bpmIn.value;
  O.setBpm(v);
  showTempo(v);
  dispatchEvent(new CustomEvent('orch:tempo', { detail: { bpm: v, from: 'console' } }));
});
addEventListener('orch:tempo', (e) => { if (e.detail?.from !== 'console') showTempo(Math.round(e.detail?.bpm ?? O.bpm)); });
showTempo(O.bpm);

// ---------- keyboard selection (keys.js dispatches orch:select {inst, seat}) ----------
addEventListener('orch:select', (e) => {
  const { inst, seat } = e.detail || {};
  sections.querySelectorAll('.strip.selected, .seat.selected').forEach((el) => el.classList.remove('selected'));
  const strip = inst != null ? strips.get(inst)?.el : null;
  const chip = seat != null ? chips.get(+seat)?.wrap : null;
  strip?.classList.add('selected');
  chip?.classList.add('selected');
  (chip || strip)?.scrollIntoView({ block: 'nearest', behavior: reduce.matches ? 'auto' : 'smooth' });
});

update();
