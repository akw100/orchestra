// Console UI: transport, loop timeline and per-section channel strips.
// The DOM is built once and diffed in place on orch:change, so animations survive updates.
import * as O from './audio.js';
import './programme.js'; // the repertoire picker mounts itself under the masthead

const $ = (s, el = document) => el.querySelector(s);
const reduce = matchMedia('(prefers-reduced-motion: reduce)');
const EASE_OUT = 'cubic-bezier(.16,1,.3,1)';
const EASE_IN = 'cubic-bezier(.7,0,.84,0)';

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII', 'XIV', 'XV', 'XVI'];
const roman = (k) => ROMAN[k] || String(k + 1);
const ROLE = { melody: 'melody', chord: 'harmony', bass: 'bass line', perc: 'rhythm' };
const MODES = [['all', 'All'], ['most', 'Most'], ['allbutone', 'All but one'], ['solo', 'Solo'], ['none', 'None']];
const CHORDS = ['D', 'A', 'Bm', 'F♯m', 'G', 'D', 'G', 'A'];
const TEMPO = [[60, 'Largo'], [76, 'Adagio'], [108, 'Andante'], [120, 'Moderato'], [Infinity, 'Allegro']];
const marking = (b) => TEMPO.find(([max]) => b < max)[1];
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

const ICON = {
  minus: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 8h9" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
  plus: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 8h9M8 3.5v9" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
  loop: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M13 8.5A5 5 0 1 1 11.3 4.3" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><path d="M12.2 1.6v3.1H9.1" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  once: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2.5 8h8.2M7.6 4.6 11 8l-3.4 3.4M13.5 3.5v9" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
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
    <div class="count" role="group" aria-label="${inst.name} players">
      <button class="step" type="button" data-a="rm" aria-label="Remove a ${low} player">${ICON.minus}</button>
      <output aria-label="${inst.name} players">0</output>
      <button class="step" type="button" data-a="add" aria-label="Add a ${low} player">${ICON.plus}</button>
    </div>
    <div class="seats"></div>
    <div class="modes" role="group" aria-label="${inst.name} section: who plays">
      <span class="ind" aria-hidden="true"></span>
      ${MODES.map(([m, l]) => `<button type="button" data-a="${m}" aria-pressed="false">${l}</button>`).join('')}
    </div>`;
  const S = {
    inst, el, mode: undefined, lastMode: null,
    seatsEl: $('.seats', el), countEl: $('output', el), rmBtn: $('[data-a="rm"]', el),
    modesEl: $('.modes', el), ind: $('.ind', el), modeBtns: [...el.querySelectorAll('.modes button')],
    meter: $('.meter', el),
  };
  new ResizeObserver(() => placeInd(S, false)).observe(S.modesEl);
  strips.set(inst.id, S);
  return el;
}

function makeChip(seat, inst) {
  const wrap = document.createElement('div');
  wrap.className = 'seat';
  wrap.dataset.seat = seat.id;
  wrap.innerHTML = `
    <button class="chip" type="button" data-a="toggle" aria-pressed="false">
      <span class="ring" aria-hidden="true"></span><span class="fill" aria-hidden="true"></span>
      <span class="halo" aria-hidden="true"></span><span class="num" aria-hidden="true">${roman(seat.k)}</span>
    </button>
    <button class="looptog" type="button" data-a="loop"></button>`;
  const c = { seat, inst, wrap, chip: $('.chip', wrap), loopBtn: $('.looptog', wrap), active: null, loop: null, startAbs: 0 };
  setLoopLook(c, seat.loop);
  setActive(c, seat.active, 0);
  return c;
}

const name = (c) => `${c.inst.name} ${roman(c.seat.k)}`;
function setLoopLook(c, loop) {
  c.loop = loop;
  c.wrap.classList.toggle('once', !loop);
  c.loopBtn.innerHTML = `${loop ? ICON.loop : ICON.once}<span>${loop ? 'loop' : 'once'}</span>`;
  c.loopBtn.setAttribute('aria-pressed', String(loop));
  c.loopBtn.setAttribute('aria-label', `${name(c)}: ${loop ? 'loops' : 'plays once'}. Switch to ${loop ? 'play once' : 'loop'}`);
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
  c.chip.setAttribute('aria-label', `${name(c)}: ${on ? 'playing, stop' : 'play'}`);
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

// ---------- section mode indicator ----------
const want = (m, n) => ({ all: n, most: Math.max(1, Math.ceil(n * 0.66)), allbutone: Math.max(1, n - 1), solo: 1, none: 0 })[m];
function modeOf(S, n, on) {
  if (S.lastMode && want(S.lastMode, n) === on) return S.lastMode;
  if (on === 0) return 'none';
  if (on === n) return 'all';
  if (on === 1) return 'solo';
  if (on === n - 1) return 'allbutone';
  if (on === want('most', n)) return 'most';
  return null;
}
function placeInd(S, animate = true) {
  const btn = S.modeBtns.find((b) => b.dataset.a === S.mode);
  S.modeBtns.forEach((b) => b.setAttribute('aria-pressed', String(b === btn)));
  S.modesEl.classList.toggle('has', !!btn);
  if (!btn || !btn.offsetWidth) return;
  S.ind.classList.toggle('glide', animate && !reduce.matches);
  S.ind.style.width = `${btn.offsetWidth}px`;
  S.ind.style.transform = `translateX(${btn.offsetLeft}px)`;
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
        S.seatsEl.append(c.wrap);
        if (!first) enter(c.wrap);
      } else if (c.active !== seat.active) changed.push([c, seat.active]);
      if (c.loop !== seat.loop) setLoopLook(c, seat.loop);
    }
    const on = list.filter((s) => s.active).length;
    total += list.length; playing += on;
    if (S.countEl.textContent !== String(list.length)) {
      S.countEl.textContent = list.length;
      if (!first && !reduce.matches) S.countEl.animate([{ transform: 'translateY(-6px)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 360, easing: EASE_OUT });
    }
    S.rmBtn.disabled = list.length <= 1;
    S.el.classList.toggle('live', on > 0);
    const m = modeOf(S, list.length, on);
    if (m !== S.mode) { S.mode = m; placeInd(S, !first); }
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
  if (a === 'toggle') seat && O.toggle(seat);
  else if (a === 'loop') seat && O.setLoop(seat, !seat.loop);
  else if (a === 'add') O.addSeat(S.inst.id);
  else if (a === 'rm') O.removeSeat(S.inst.id);
  else { S.lastMode = a; O.section(S.inst.id, a); schedule(); }
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
