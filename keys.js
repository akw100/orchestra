// Keyboard layer: the ONLY window keydown/keyup listener (capture phase).
// Modes: CONDUCT (default) and PLAY (keys go to songs.js onPlayKey(e, isDown) first).
// Self-mounts its HUD, selection rings, Alt hints and the ? cheat sheet; styles in keys.css.
// Events out: orch:select {inst, seat, family, source:'keys'}, orch:tempo {bpm}, orch:mode {mode}.
import * as O from './audio.js';

// ---------- styles ----------
const link = document.createElement('link');
link.rel = 'stylesheet'; link.href = new URL('./keys.css', import.meta.url).href;
document.head.append(link);
if (!document.querySelector('link[href*="Bodoni+Moda"]')) {
  const f = document.createElement('link'); f.rel = 'stylesheet';
  f.href = 'https://fonts.googleapis.com/css2?family=Bodoni+Moda:ital,opsz,wght@0,6..96,400..800;1,6..96,400..800&family=Jost:wght@400..600&display=swap';
  document.head.append(f);
}

const reduce = matchMedia('(prefers-reduced-motion: reduce)');
const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII', 'XIV', 'XV', 'XVI'];
const roman = (k) => ROMAN[k] || String(k + 1);
const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : '');
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const emit = (name, detail) => window.dispatchEvent(new CustomEvent(name, { detail }));
const el = (tag, cls, html) => { const n = document.createElement(tag); if (cls) n.className = cls; if (html != null) n.innerHTML = html; return n; };
const MODES = { all: 'All', most: 'Most', allbutone: 'All but one', solo: 'Solo', none: 'None' };
const DIGIT_MODE = { 1: 'all', 2: 'most', 3: 'allbutone', 4: 'solo', 5: 'none', 0: 'none' };
const ALPHA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const RESERVED = new Set(['L']); // plain L = loop
const SHIFT_KEYS = { T: 'theater', L: 'theme' }; // Shift+T stage view, Shift+L house lights (light/dark)

// ---------- dynamic keymap (read INSTRUMENTS at runtime) ----------
let M = null;
function keymap() {
  if (M && M.n === O.INSTRUMENTS.length) return M;
  const order = [];
  for (const inst of O.INSTRUMENTS) {
    let f = order.find((x) => x.name === inst.family);
    if (!f) order.push((f = { name: inst.family, insts: [] }));
    f.insts.push(inst);
  }
  const flat = order.flatMap((f) => f.insts);
  const used = new Set(RESERVED), letterOf = {}, instOf = {};
  const up = (s) => s.toUpperCase().replace(/[^A-Z]/g, '');
  const take = (inst, cands) => {
    for (const c of cands) if (!used.has(c)) { used.add(c); letterOf[inst.id] = c; instOf[c] = inst.id; return; }
  };
  for (const i of flat) take(i, [up(i.name)[0] || 'A']); // 1: first letter
  for (const i of flat) if (!letterOf[i.id]) { // 2: consonants of the name, then its vowels
    const r = up(i.name).slice(1); take(i, [...r.replace(/[AEIOU]/g, ''), ...r.replace(/[^AEIOU]/g, '')]);
  }
  for (const i of flat) if (!letterOf[i.id]) take(i, ALPHA); // 3: anything free
  const fused = new Set(Object.keys(SHIFT_KEYS)), famLetter = {}, famOf = {};
  for (const f of order) {
    for (const c of [...up(f.name), ...ALPHA]) if (!fused.has(c)) { fused.add(c); famLetter[f.name] = c; famOf[c] = f.name; break; }
  }
  return (M = { n: O.INSTRUMENTS.length, order, flat, letterOf, instOf, famLetter, famOf });
}

// ---------- selection: orchestra > family > section > player ----------
const sel = { fam: null, inst: null, seat: null };
const seatsOf = (id) => O.seats.filter((s) => s.inst === id);
const seatById = (id) => O.seats.find((s) => s.id === id);
const famInsts = (f) => keymap().order.find((x) => x.name === f)?.insts || [];
const level = () => (sel.seat != null ? 'seat' : sel.inst ? 'inst' : sel.fam ? 'fam' : 'all');
const nameOf = (id) => O.byId[id]?.name || id;
function scopeSeats() {
  const L = level();
  if (L === 'seat') return [seatById(sel.seat)].filter(Boolean);
  if (L === 'inst') return seatsOf(sel.inst);
  if (L === 'fam') return famInsts(sel.fam).flatMap((i) => seatsOf(i.id));
  return O.seats.slice();
}
function selLabel() {
  const L = level();
  if (L === 'seat') { const s = seatById(sel.seat); return [nameOf(sel.inst), s ? `player ${roman(s.k)}` : '']; }
  if (L === 'inst') return [nameOf(sel.inst), 'whole section'];
  if (L === 'fam') return [cap(sel.fam), `${famInsts(sel.fam).length} sections`];
  return ['Full orchestra', 'nothing selected'];
}
function selKey() {
  const L = level(), m = keymap();
  if (L === 'seat' || L === 'inst') return m.letterOf[sel.inst];
  if (L === 'fam') return '⇧' + m.famLetter[sel.fam];
  return 'Esc';
}

function select(next, { quiet = false, from = 'keys' } = {}) {
  sel.fam = next.fam ?? null; sel.inst = next.inst ?? null; sel.seat = next.seat ?? null;
  if (sel.inst) sel.fam = O.byId[sel.inst]?.family ?? sel.fam;
  if (sel.seat != null && !seatById(sel.seat)) sel.seat = null;
  if (from === 'keys') emit('orch:select', { inst: sel.inst, seat: sel.seat, family: sel.fam, source: 'keys' });
  renderHud();
  if (!quiet) { showRings(); scrollToSel(); }
}

// ---------- actions ----------
function letterSelect(id) {
  if (sel.inst === id) { // step: section -> I -> II ... -> section
    const list = seatsOf(id), i = list.findIndex((s) => s.id === sel.seat);
    const next = i + 1 < list.length ? list[i + 1] : null;
    select({ inst: id, seat: next ? next.id : null });
    toast(selKey(), next ? `${nameOf(id)} ${roman(next.k)}` : `${nameOf(id)} · whole section`);
  } else {
    select({ inst: id });
    const n = seatsOf(id).length;
    toast(selKey(), `${nameOf(id)} · ${n} ${n === 1 ? 'player' : 'players'}`);
  }
}
function selectFamily(f) {
  select({ fam: f });
  toast(selKey(), `${cap(f)} · ${famInsts(f).map((i) => i.name).join(', ')}`);
}
function applyMode(mode) {
  const L = level();
  if (L === 'seat' || L === 'inst') {
    O.section(sel.inst, mode);
    return `${nameOf(sel.inst)} · ${MODES[mode]}`;
  }
  const insts = L === 'fam' ? famInsts(sel.fam) : keymap().flat;
  const who = L === 'fam' ? cap(sel.fam) : 'Orchestra';
  if (mode === 'solo') {
    const all = insts.flatMap((i) => seatsOf(i.id));
    const pick = all[Math.floor(Math.random() * all.length)];
    all.forEach((s) => (s === pick ? s.active || O.play(s) : s.active && O.stop(s)));
    return pick ? `${who} · Solo — ${nameOf(pick.inst)} ${roman(pick.k)}` : `${who} · Solo`;
  }
  insts.forEach((i) => O.section(i.id, mode));
  return `${who} · ${MODES[mode]}`;
}
function enter(once) {
  const L = level(), list = scopeSeats();
  if (!list.length) return 'Nobody here';
  const [name, sub] = selLabel();
  const who = L === 'seat' ? `${name} ${sub.replace('player ', '')}` : name;
  if (once) { list.forEach((s) => O.play(s, false)); return `${who} · plays once`; }
  if (L === 'seat') { O.toggle(list[0]); return `${who} · ${list[0].active ? 'playing' : 'stopped'}`; }
  if (list.some((s) => s.active)) { list.forEach((s) => s.active && O.stop(s)); return `${who} · stopped`; }
  list.forEach((s) => O.play(s)); return `${who} · playing`;
}
function loopToggle() {
  const list = scopeSeats(); if (!list.length) return 'Nobody here';
  const v = !list.every((s) => s.loop);
  list.forEach((s) => O.setLoop(s, v));
  const [name] = selLabel();
  return `${name} · ${v ? 'loops' : 'plays once'}`;
}
function addPlayer() {
  if (!sel.inst) return 'Pick a section first (press its letter)';
  const s = O.addSeat(sel.inst);
  if (s) select({ inst: sel.inst, seat: s.id });
  return `${nameOf(sel.inst)} ${s ? roman(s.k) : ''} joins · Enter to play`;
}
function removePlayer() {
  if (!sel.inst) return 'Pick a section first (press its letter)';
  const id = sel.inst, before = seatsOf(id);
  if (before.length <= 1) return `${nameOf(id)} keeps at least one player`;
  const gone = before[before.length - 1];
  O.removeSeat(id);
  if (sel.seat === gone.id) { const l = seatsOf(id); select({ inst: id, seat: l[l.length - 1]?.id ?? null }); }
  else renderHud();
  return `${nameOf(id)} ${roman(gone.k)} leaves`;
}
function setTempo(v) {
  const inp = document.getElementById('bpm');
  const lo = inp ? +inp.min || 50 : 50, hi = inp ? +inp.max || 140 : 140;
  v = Math.max(lo, Math.min(hi, Math.round(v)));
  O.setBpm(v);
  if (inp) { inp.value = v; inp.dispatchEvent(new Event('input', { bubbles: true })); }
  emit('orch:tempo', { bpm: v });
  renderHud(); bumpBpm();
  return `Tempo · ${v} bpm`;
}
function spaceToggle() {
  if (O.seats.some((s) => s.active)) { O.stopAll(); return 'Stop all'; }
  O.tutti(); return 'Tutti · everyone plays';
}
async function theater(on) {
  try { const m = await import('./theater.js'); m.toggleTheater?.(on); }
  catch { toast('⇧T', 'Stage view is not installed yet'); }
}
async function theme() {
  try {
    const m = await import('./theme.js'); m.toggleTheme?.();
    const t = m.getTheme?.() ?? document.documentElement.dataset.theme;
    toast('⇧L', `House lights · ${t === 'light' ? 'up (light)' : 'down (dark)'}`);
  } catch { toast('⇧L', 'Light/dark theme is not installed yet'); }
}

// arrows: ←/→ siblings at this level, ↓ zooms in then walks players, ↑ walks back out
function nav(code) {
  const m = keymap(), L = level();
  if (code === 'ArrowLeft' || code === 'ArrowRight') {
    const d = code === 'ArrowRight' ? 1 : -1;
    if (L === 'fam') {
      const i = m.order.findIndex((f) => f.name === sel.fam), f = m.order[(i + d + m.order.length) % m.order.length];
      return selectFamily(f.name);
    }
    if (L === 'all') { const inst = d > 0 ? m.flat[0] : m.flat[m.flat.length - 1]; select({ inst: inst.id }); return toast(selKey(), `${inst.name} · whole section`); }
    const i = m.flat.findIndex((x) => x.id === sel.inst), inst = m.flat[(i + d + m.flat.length) % m.flat.length];
    if (L === 'seat') { // keep the player index where possible
      const k = seatsOf(sel.inst).findIndex((s) => s.id === sel.seat), l = seatsOf(inst.id), s = l[Math.min(k, l.length - 1)];
      select({ inst: inst.id, seat: s?.id }); return toast(selKey(), `${inst.name} ${s ? roman(s.k) : ''}`);
    }
    select({ inst: inst.id }); return toast(selKey(), `${inst.name} · whole section`);
  }
  if (code === 'ArrowDown') {
    if (L === 'all') return selectFamily(m.order[0].name);
    if (L === 'fam') { const inst = famInsts(sel.fam)[0]; select({ inst: inst.id }); return toast(selKey(), `${inst.name} · whole section`); }
    const l = seatsOf(sel.inst), i = l.findIndex((s) => s.id === sel.seat);
    const s = l[Math.min(i + 1, l.length - 1)];
    if (s && s.id !== sel.seat) { select({ inst: sel.inst, seat: s.id }); toast(selKey(), `${nameOf(sel.inst)} ${roman(s.k)}`); }
    return;
  }
  if (code === 'ArrowUp') up();
}
function up() {
  const L = level();
  if (L === 'seat') {
    const l = seatsOf(sel.inst), i = l.findIndex((s) => s.id === sel.seat);
    if (i > 0) { select({ inst: sel.inst, seat: l[i - 1].id }); return toast(selKey(), `${nameOf(sel.inst)} ${roman(l[i - 1].k)}`); }
    select({ inst: sel.inst }); return toast(selKey(), `${nameOf(sel.inst)} · whole section`);
  }
  if (L === 'inst') return selectFamily(sel.fam);
  if (L === 'fam') { select({}); return toast('Esc', 'Full orchestra'); }
  return false;
}

// ---------- mode ----------
let mode = 'conduct';
let songsP = null, songs = null, songsWarned = false;
const loadSongs = () => (songsP ||= import('./songs.js').then((m) => (songs = m), () => null));
function setMode(m) {
  if (m === mode) return;
  mode = m;
  document.documentElement.dataset.keys = m;
  emit('orch:mode', { mode: m });
  try { songs?.onModeChange?.(m); } catch (err) { console.error(err); }
  if (m === 'play') { loadSongs(); hideRings(); toast('`', 'Play mode · type to play the tune'); }
  else toast('`', 'Conduct mode · letters pick sections');
  renderHud();
}

// ---------- DOM: layer (rings + hints), HUD, sheet ----------
const layer = el('div', 'k-layer'); layer.setAttribute('aria-hidden', 'true');
const ringSec = el('div', 'k-ring k-sec', '<i class="k-c tl"></i><i class="k-c tr"></i><i class="k-c bl"></i><i class="k-c br"></i><span class="k-tag"></span>');
const ringSeat = el('div', 'k-ring k-seat', '<i class="k-orbit"></i>');
layer.append(ringSec, ringSeat);

const hud = el('div', 'k-hud');
hud.setAttribute('role', 'region'); hud.setAttribute('aria-label', 'Keyboard control');
hud.innerHTML = `
  <div class="k-toasts" aria-live="polite"></div>
  <div class="k-bar">
    <button class="k-mode" type="button" aria-label="Keyboard mode: Conduct or Play (backtick key)" aria-pressed="false">
      <span class="k-thumb" aria-hidden="true"></span><span class="k-m" data-m="conduct">Conduct</span><span class="k-m" data-m="play">Play</span>
    </button>
    <div class="k-sel"><kbd class="k-cap"></kbd><span class="k-sel-txt"><b></b><small></small></span></div>
    <div class="k-bpm" title="[ and ] change the tempo"><b></b><small>bpm</small></div>
    <button class="k-help" type="button" aria-label="Keyboard shortcuts (question mark key)"><kbd class="k-cap">?</kbd></button>
  </div>`;
const H = {
  toasts: hud.querySelector('.k-toasts'), mode: hud.querySelector('.k-mode'), cap: hud.querySelector('.k-sel .k-cap'),
  name: hud.querySelector('.k-sel b'), sub: hud.querySelector('.k-sel small'), bpm: hud.querySelector('.k-bpm b'),
  help: hud.querySelector('.k-help'), bpmBox: hud.querySelector('.k-bpm'),
};
H.mode.addEventListener('click', () => setMode(mode === 'play' ? 'conduct' : 'play'));
H.help.addEventListener('click', () => toggleSheet());
document.body.append(layer, hud);

function renderHud() {
  const [name, sub] = selLabel();
  H.cap.textContent = selKey();
  H.name.textContent = name; H.sub.textContent = mode === 'play' ? 'play mode · type to play' : sub;
  H.bpm.textContent = O.bpm;
  hud.classList.toggle('is-play', mode === 'play');
  H.mode.setAttribute('aria-pressed', String(mode === 'play'));
}
function bumpBpm() { if (reduce.matches) return; H.bpmBox.classList.remove('bump'); void H.bpmBox.offsetWidth; H.bpmBox.classList.add('bump'); }
addEventListener('input', (e) => { if (e.target?.id === 'bpm') { H.bpm.textContent = O.bpm; } });

// toasts: one at a time, the old one blurs away upward
let lastToast = null;
function toast(key, text) {
  if (lastToast) { const old = lastToast; old.classList.add('out'); setTimeout(() => old.remove(), 420); }
  const t = el('div', 'k-toast', `${key ? `<kbd class="k-cap">${esc(key)}</kbd>` : ''}<span>${esc(text)}</span>`);
  H.toasts.append(t); lastToast = t;
  clearTimeout(t._h); t._h = setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 420); if (lastToast === t) lastToast = null; }, 2200);
}

// ---------- rings that glide to the selection (document coords, spring-smoothed) ----------
let ringsOn = false, raf = 0, last = 0, theaterOn = false;
const cur = { sec: null, seat: null };
function instEl(id) {
  return document.querySelector(`[data-inst="${CSS.escape(id)}"]:not(.k-hint)`) ||
    (() => { const s = seatsOf(id)[0]; const e = s && document.querySelector(`[data-seat="${s.id}"]`); return e?.closest('section, article, .card, .strip') || null; })();
}
function docRect(e) { const r = e.getBoundingClientRect(); return r.width || r.height ? { x: r.left + scrollX, y: r.top + scrollY, w: r.width, h: r.height } : null; }
function unionRect(els) {
  const rs = els.map(docRect).filter(Boolean); if (!rs.length) return null;
  const x = Math.min(...rs.map((r) => r.x)), y = Math.min(...rs.map((r) => r.y));
  return { x, y, w: Math.max(...rs.map((r) => r.x + r.w)) - x, h: Math.max(...rs.map((r) => r.y + r.h)) - y };
}
function targets() {
  const L = level();
  let sec = null, seat = null, hue = 42, tag = '';
  if (L === 'fam') {
    const els = famInsts(sel.fam).map((i) => instEl(i.id)).filter(Boolean);
    const fam = els[0]?.closest('.family'); sec = fam ? docRect(fam) : unionRect(els);
    tag = `<kbd class="k-cap">⇧${keymap().famLetter[sel.fam]}</kbd>${esc(cap(sel.fam))}`;
  } else if (L === 'inst' || L === 'seat') {
    const e = instEl(sel.inst); sec = e && docRect(e); hue = O.byId[sel.inst]?.hue ?? hue;
    tag = `<kbd class="k-cap">${keymap().letterOf[sel.inst]}</kbd>${esc(nameOf(sel.inst))}`;
    if (L === 'seat') { const se = document.querySelector(`[data-seat="${sel.seat}"]`); seat = se && docRect(se); }
  }
  return { sec, seat, hue, tag };
}
let lastTag = '';
function frame(now) {
  const dt = Math.min(0.05, (now - (last || now)) / 1000); last = now;
  const t = targets();
  const a = reduce.matches ? 1 : 1 - Math.exp(-dt / 0.075);
  const move = (node, key, r, pad) => {
    if (!r) { node.classList.remove('on'); cur[key] = null; return; }
    const g = { x: r.x - pad, y: r.y - pad, w: r.w + pad * 2, h: r.h + pad * 2 };
    const c = cur[key] || (cur[key] = { ...g, fresh: true });
    for (const k of ['x', 'y', 'w', 'h']) c[k] += (g[k] - c[k]) * (c.fresh ? 1 : a);
    c.fresh = false;
    node.style.transform = `translate3d(${c.x.toFixed(1)}px, ${c.y.toFixed(1)}px, 0)`;
    node.style.width = `${c.w.toFixed(1)}px`; node.style.height = `${c.h.toFixed(1)}px`;
    node.classList.add('on');
  };
  const show = ringsOn && mode === 'conduct' && !theaterOn;
  move(ringSec, 'sec', show && t.sec, 6);
  move(ringSeat, 'seat', show && t.seat, 4);
  ringSec.style.setProperty('--hue', t.hue); ringSeat.style.setProperty('--hue', t.hue);
  if (t.tag !== lastTag) { ringSec.querySelector('.k-tag').innerHTML = t.tag; lastTag = t.tag; }
  raf = show || hintsOn ? requestAnimationFrame(frame) : 0;
  if (hintsOn) placeHints();
}
function kick() { if (!raf) { last = 0; raf = requestAnimationFrame(frame); } }
function showRings() { ringsOn = true; kick(); }
function hideRings() { ringsOn = false; kick(); }
function scrollToSel() {
  const L = level(); if (L === 'all' || theaterOn) return;
  const e = L === 'seat' ? document.querySelector(`[data-seat="${sel.seat}"]`) : L === 'fam' ? instEl(famInsts(sel.fam)[0]?.id)?.closest('.family') || instEl(famInsts(sel.fam)[0]?.id) : instEl(sel.inst);
  if (!e) return;
  const r = e.getBoundingClientRect(), hudTop = hud.getBoundingClientRect().top;
  if (r.top < 8 || r.bottom > hudTop - 8) e.scrollIntoView({ block: 'center', behavior: reduce.matches ? 'auto' : 'smooth' });
}
addEventListener('orch:beat', (e) => {
  if (!ringsOn || reduce.matches) return;
  ringSec.classList.remove('tick', 'down'); void ringSec.offsetWidth;
  ringSec.classList.add('tick'); if (e.detail.beat % 4 === 0) ringSec.classList.add('down');
});
addEventListener('orch:theater', (e) => { theaterOn = !!e.detail?.on; hud.classList.toggle('in-theater', theaterOn); kick(); });
addEventListener('orch:change', () => { if (sel.seat != null && !seatById(sel.seat)) select({ inst: sel.inst }, { quiet: true }); else renderHud(); });

// mouse users: follow their clicks silently and fade the rings out
document.addEventListener('pointerdown', (e) => {
  if (e.target.closest?.('.k-hud, .k-sheet')) return;
  const s = e.target.closest?.('[data-seat]'), i = e.target.closest?.('[data-inst]');
  const seat = s && seatById(+s.dataset.seat);
  if (seat) select({ inst: seat.inst, seat: seat.id }, { quiet: true });
  else if (i && O.byId[i.dataset.inst]) select({ inst: i.dataset.inst }, { quiet: true });
  hideRings();
}, true);
addEventListener('orch:select', (e) => {
  const d = e.detail || {}; if (d.source === 'keys') return;
  select({ fam: d.family, inst: d.inst, seat: d.seat }, { quiet: true, from: 'other' });
});

// ---------- Alt/Option hints ----------
let hintsOn = false, hintEls = [];
function showHints(on) {
  if (on === hintsOn) return; hintsOn = on;
  if (on) {
    const m = keymap();
    hintEls = m.flat.map((inst, i) => {
      const h = el('span', 'k-hint', esc(m.letterOf[inst.id])); h.style.setProperty('--hue', inst.hue); h.style.setProperty('--i', i);
      h._inst = inst.id; layer.append(h); return h;
    });
    hintEls.push(...m.order.map((f, i) => {
      const h = el('span', 'k-hint k-hint-fam', `⇧${esc(m.famLetter[f.name])}<small>${esc(cap(f.name))}</small>`); h.style.setProperty('--i', i);
      h._fam = f.name; layer.append(h); return h;
    }));
    placeHints(); requestAnimationFrame(() => hintEls.forEach((h) => h.classList.add('on')));
    kick();
  } else {
    const old = hintEls; hintEls = [];
    old.forEach((h) => h.classList.remove('on')); setTimeout(() => old.forEach((h) => h.remove()), 260);
  }
}
function placeHints() {
  for (const h of hintEls) {
    let r = null;
    if (h._inst) { const e = instEl(h._inst); r = e && docRect(e); if (r) { h.style.transform = `translate3d(${r.x + r.w - 14}px, ${r.y - 10}px, 0)`; } }
    else { const e = instEl(famInsts(h._fam)[0]?.id); const f = e?.closest('.family'); r = f ? docRect(f.querySelector('h3') || f) : e && docRect(e); if (r) h.style.transform = `translate3d(${r.x}px, ${r.y - 30}px, 0)`; }
    h.hidden = !r || theaterOn;
  }
}
addEventListener('blur', () => { showHints(false); sheet?.querySelectorAll('.is-down').forEach((k) => k.classList.remove('is-down')); });

// ---------- cheat sheet ----------
let sheet = null, sheetFocus = null;
function capHtml(code, main, label, opts = {}) {
  const { w = 1, shift = '', hue = null, dim = false, cls = '' } = opts;
  return `<span class="kc ${dim ? 'dim' : ''} ${hue != null ? 'tinted' : ''} ${cls}" data-code="${code}" style="--u:${w};${hue != null ? `--hue:${hue}` : ''}">
    ${shift ? `<em>${esc(shift)}</em>` : ''}<b>${esc(main)}</b>${label ? `<small>${esc(label)}</small>` : ''}</span>`;
}
function buildSheet() {
  const m = keymap();
  const letter = (c) => {
    const id = m.instOf[c], fam = m.famOf[c], sh = SHIFT_KEYS[c] === 'theater' ? 'Stage view' : SHIFT_KEYS[c] === 'theme' ? 'Lights' : fam ? cap(fam) : '';
    if (c === 'L') return capHtml('KeyL', 'L', 'Loop / once', { shift: sh, cls: 'act' });
    return capHtml(`Key${c}`, c, id ? nameOf(id) : '', { shift: sh, hue: id ? O.byId[id].hue : null, dim: !id && !sh });
  };
  const digit = (d) => capHtml(`Digit${d}`, d, DIGIT_MODE[d] ? MODES[DIGIT_MODE[d]] : '', { dim: !DIGIT_MODE[d], cls: DIGIT_MODE[d] ? 'mode' : '' });
  const rows = [
    capHtml('Escape', 'Esc', 'Back', { w: 1.25, cls: 'act' }),
    [capHtml('Backquote', '`', 'Conduct/Play', { cls: 'act' }), ...'1234567890'.split('').map(digit), capHtml('Minus', '−', 'Player', { cls: 'act' }), capHtml('Equal', '+', 'Player', { cls: 'act' }), capHtml('Backspace', '', '', { w: 1.6, dim: true })].join(''),
    [capHtml('Tab', 'Tab', '', { w: 1.5, dim: true }), ...'QWERTYUIOP'.split('').map(letter), capHtml('BracketLeft', '[', 'Slower', { shift: '−10', cls: 'act' }), capHtml('BracketRight', ']', 'Faster', { shift: '+10', cls: 'act' }), capHtml('Backslash', '\\', '', { w: 1.1, dim: true })].join(''),
    [capHtml('CapsLock', '', '', { w: 1.8, dim: true }), ...'ASDFGHJKL'.split('').map(letter), capHtml('Semicolon', ';', '', { dim: true }), capHtml('Quote', "'", '', { dim: true }), capHtml('Enter', 'Enter', 'Play / stop', { w: 1.8, shift: 'once', cls: 'act' })].join(''),
    [capHtml('ShiftLeft', 'Shift', 'Families', { w: 2.3, cls: 'act' }), ...'ZXCVBNM'.split('').map(letter), capHtml('Comma', ',', '', { dim: true }), capHtml('Period', '.', '', { dim: true }), capHtml('Slash', '?', 'This sheet', { cls: 'act' }), capHtml('ShiftRight', 'Shift', '', { w: 2.3, dim: true })].join(''),
    [capHtml('AltLeft', 'Alt', 'Hints', { w: 1.4, cls: 'act' }), capHtml('Space', 'Space', 'Tutti / stop all', { w: 6.2, cls: 'act' }),
      `<span class="arrows">${capHtml('ArrowLeft', '←', '', { cls: 'act' })}<span class="ud">${capHtml('ArrowUp', '↑', '', { cls: 'act' })}${capHtml('ArrowDown', '↓', '', { cls: 'act' })}</span>${capHtml('ArrowRight', '→', '', { cls: 'act' })}</span>`].join(''),
  ];
  const k = (s) => `<kbd class="k-cap">${esc(s)}</kbd>`;
  const sections = m.flat.map((i) => `<li style="--hue:${i.hue}">${k(m.letterOf[i.id])}<span>${esc(i.name)}</span></li>`).join('');
  const fams = m.order.map((f) => `<li>${k('⇧' + m.famLetter[f.name])}<span>${esc(cap(f.name))}</span></li>`).join('');
  const s = el('div', 'k-sheet');
  s.setAttribute('role', 'dialog'); s.setAttribute('aria-modal', 'true'); s.setAttribute('aria-labelledby', 'k-sheet-h');
  s.innerHTML = `
    <div class="k-scrim"></div>
    <div class="k-panel" tabindex="-1">
      <header class="k-head">
        <div>
          <h2 id="k-sheet-h">Conduct from the <em>keyboard</em></h2>
          <p>A letter picks a section, a number decides who plays, Space brings everyone in. Press a key: it lights up here and works behind the sheet.</p>
        </div>
        <button class="k-close" type="button" aria-label="Close shortcuts">${k('Esc')}</button>
      </header>
      <div class="k-board" aria-hidden="true">${rows.map((r, i) => `<div class="k-row r${i}">${r}</div>`).join('')}</div>
      <div class="k-lists">
        <section><h3>Sections</h3><ul class="k-sections">${sections}</ul></section>
        <section><h3>Families</h3><ul>${fams}</ul></section>
        <section><h3>Who plays</h3><ul>
          <li>${k('1')}<span>All</span></li><li>${k('2')}<span>Most</span></li><li>${k('3')}<span>All but one</span></li><li>${k('4')}<span>Solo</span></li><li>${k('5')}<span>None</span></li></ul></section>
        <section><h3>Players &amp; time</h3><ul>
          <li>${k('Enter')}<span>Play / stop</span></li><li>${k('⇧Enter')}<span>Play once</span></li><li>${k('L')}<span>Loop or once</span></li>
          <li>${k('+')}${k('−')}<span>Add / remove player</span></li><li>${k('[')}${k(']')}<span>Tempo ∓2 (⇧ ∓10)</span></li>
          <li>${k('←')}${k('→')}<span>Next section</span></li><li>${k('↑')}${k('↓')}<span>Zoom in / out, walk players</span></li></ul></section>
        <section><h3>Stage</h3><ul>
          <li>${k('Space')}<span>Tutti / stop all</span></li><li>${k('`')}<span>Conduct ↔ Play mode</span></li>
          <li>${k('⇧T')}<span>Stage view</span></li><li>${k('⇧L')}<span>House lights (light / dark)</span></li>
          <li>${k('Alt')}<span>Hold for key hints</span></li><li>${k('Esc')}<span>Back out</span></li></ul></section>
      </div>
      <p class="k-foot"><b>Play mode</b> ${k('`')} hands the letters to the song, so typing plays the tune. Space, ${k('`')} and ${k('Esc')} always work.</p>
    </div>`;
  s.querySelector('.k-scrim').addEventListener('click', () => toggleSheet(false));
  s.querySelector('.k-close').addEventListener('click', () => toggleSheet(false));
  s.querySelectorAll('.k-row').forEach((row, r) => row.querySelectorAll('.kc').forEach((k, c) => { k.style.setProperty('--r', r); k.style.setProperty('--c', c); }));
  s._n = m.n;
  return s;
}
function toggleSheet(on = !sheet?.classList.contains('open')) {
  if (on) {
    if (!sheet || sheet._n !== keymap().n) { sheet?.remove(); sheet = buildSheet(); document.body.append(sheet); }
    sheetFocus = document.activeElement;
    requestAnimationFrame(() => { sheet.classList.add('open'); sheet.querySelector('.k-panel').focus({ preventScroll: true }); });
  } else if (sheet) {
    sheet.classList.remove('open');
    if (sheetFocus?.focus) sheetFocus.focus({ preventScroll: true });
  }
}
const sheetOpen = () => !!sheet?.classList.contains('open');
function flashKey(code, down) {
  if (!sheetOpen()) return;
  const k = sheet.querySelector(`.kc[data-code="${code}"]`) || (code === 'NumpadEnter' && sheet.querySelector('.kc[data-code="Enter"]'));
  if (k) k.classList.toggle('is-down', down);
}

// ---------- the listener ----------
const isTyping = (t) => !!t?.matches?.('input:not([type=range]):not([type=checkbox]):not([type=radio]):not([type=button]), textarea, select, [contenteditable=""], [contenteditable="true"]');
function handleEsc() {
  if (sheetOpen()) { toggleSheet(false); return true; }
  if (theaterOn) { theater(false); return true; }
  if (mode === 'play') { setMode('conduct'); return true; }
  if (level() !== 'all') { showRings(); up(); return true; }
  return false;
}
function conductAction(e) {
  const c = e.code, m = keymap();
  const say = (key, fn) => () => { const r = fn(); if (typeof r === 'string') toast(key, r); };
  if (/^Key[A-Z]$/.test(c)) {
    const L = c[3];
    if (e.shiftKey) {
      if (SHIFT_KEYS[L] === 'theater') return () => theater();
      if (SHIFT_KEYS[L] === 'theme') return () => theme();
      return m.famOf[L] ? () => selectFamily(m.famOf[L]) : null;
    }
    if (L === 'L') return say('L', loopToggle);
    return m.instOf[L] ? () => letterSelect(m.instOf[L]) : null;
  }
  const d = c.match(/^(?:Digit|Numpad)(\d)$/);
  if (d && DIGIT_MODE[d[1]]) return say(d[1], () => applyMode(DIGIT_MODE[d[1]]));
  switch (c) {
    case 'Enter': case 'NumpadEnter': return say(e.shiftKey ? '⇧Enter' : 'Enter', () => enter(e.shiftKey));
    case 'Equal': case 'NumpadAdd': return say('+', addPlayer);
    case 'Minus': case 'NumpadSubtract': return say('−', removePlayer);
    case 'BracketLeft': return say(e.shiftKey ? '{' : '[', () => setTempo(O.bpm - (e.shiftKey ? 10 : 2)));
    case 'BracketRight': return say(e.shiftKey ? '}' : ']', () => setTempo(O.bpm + (e.shiftKey ? 10 : 2)));
    case 'ArrowLeft': case 'ArrowRight': case 'ArrowUp': case 'ArrowDown': return () => nav(c);
    case 'Slash': return () => toggleSheet();
  }
  return e.key === '?' ? () => toggleSheet() : null;
}
const REPEATABLE = /^(Arrow|Bracket|Equal|Minus|Numpad(Add|Subtract))/;
const PLAY_FALLBACK = /^(Slash|BracketLeft|BracketRight)$/;

function onKey(e, down) {
  if (e.isComposing) return;
  const c = e.code, t = e.target;
  if (e.key === 'Alt') { if (!isTyping(t)) showHints(down); return; }
  if (!down) {
    flashKey(c, false);
    if (mode === 'play' && !isTyping(t) && !e.ctrlKey && !e.metaKey && songs?.onPlayKey) {
      try { if (songs.onPlayKey(e, false)) e.preventDefault(); } catch (err) { console.error(err); }
    }
    if (c === 'Space' && !isTyping(t)) e.preventDefault(); // no click on a focused button
    return;
  }
  if (e.ctrlKey || e.metaKey) return;
  if (c === 'Escape') { if (handleEsc()) { e.preventDefault(); e.stopPropagation(); } return; }
  if (e.altKey || c === 'Tab' || isTyping(t)) return;
  flashKey(c, true);
  const claim = () => { e.preventDefault(); e.stopPropagation(); };

  if (c === 'Space') { claim(); if (!e.repeat) toast('Space', spaceToggle()); return; }
  if (c === 'Backquote' || c === 'IntlBackslash') { claim(); if (!e.repeat) setMode(mode === 'play' ? 'conduct' : 'play'); return; }

  if (mode === 'play') {
    let handled = false;
    try { handled = !!songs?.onPlayKey?.(e, true); } catch (err) { console.error(err); }
    if (handled) { claim(); return; }
    const shiftView = e.shiftKey && (c === 'KeyT' || c === 'KeyL');
    if (!PLAY_FALLBACK.test(c) && !shiftView) {
      if (!songs && /^Key[A-Z]$/.test(c) && !songsWarned) { songsWarned = true; toast('`', 'The song player is not loaded yet'); }
      return;
    }
  }
  // native behaviour wins on focused controls
  if ((c === 'Enter' || c === 'NumpadEnter') && t?.closest?.('button, a[href], summary, [role=button], input')) return;
  if (c.startsWith('Arrow') && t?.matches?.('input[type=range]')) return;

  const act = conductAction(e);
  if (!act) return;
  claim();
  if (e.repeat && !REPEATABLE.test(c)) return;
  if (mode === 'conduct' && c !== 'Slash') showRings();
  act();
}
addEventListener('keydown', (e) => onKey(e, true), true);
addEventListener('keyup', (e) => onKey(e, false), true);

loadSongs();
renderHud();

// for songs.js / the console: read-only access to the keyboard state
export const getSelection = () => ({ inst: sel.inst, seat: sel.seat, family: sel.fam });
export const getMode = () => mode;
export { setMode, toggleSheet };
