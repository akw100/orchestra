// Pocket Orchestra: the 3D stage (Wave 4 core).
// Boots three.js over #stage-wrap, seats every player on the riser arcs, wires audio events to the
// hall / musicians / fx / post / director modules (stage3d/*.js, built-in stubs when missing), and
// handles hover / click / loop. The 2D canvas stage (stage.js) stays as the fallback:
// no WebGL2, ?stage=2d, or a failed three import leave the page exactly as it was.
import * as O from '../audio.js';
import * as STUB from './stubs.js';

const { seats, byId, analyser } = O;
const LOOP = O.LOOP_BEATS || 16;
const RAD = Math.PI / 180;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const ease = (cur, to, rate, dt) => cur + (to - cur) * (1 - Math.exp(-rate * dt));
const smooth = (t) => t * t * (3 - 2 * t);

const root = document.documentElement;
const wrap = document.getElementById('stage-wrap');
const qs = new URLSearchParams(location.search);
const forced = (qs.get('stage') || '').toLowerCase();
const LS = 'orch-stage';
const readPref = () => { try { return localStorage.getItem(LS); } catch { return null; } };
const writePref = (v) => { try { localStorage.setItem(LS, v); } catch { /* private mode */ } };
const RM = matchMedia('(prefers-reduced-motion: reduce)');

function hasWebGL2() {
  try { const c = document.createElement('canvas'); const gl = c.getContext('webgl2'); gl?.getExtension('WEBGL_lose_context')?.loseContext(); return !!gl; } catch { return false; }
}

// ---------- contract geometry ----------
const C_Z = 1.6, PODIUM = { x: 0, y: 0.22, z: 0.9 };
const tierY = (t) => (t < 0 ? 0 : 0.32 * t);
const tierR = (t) => (t < 0 ? 7.4 : 4.2 + 1.55 * t); // t = -1: the stage floor beside the risers (piano)

// Rows each section fills in order: [tier, fromDeg, toDeg]; 0deg = straight upstage, negative = audience left.
const ZONES = {
  violin: [[0, -74, -16], [1, -58, -26]],
  viola: [[0, 8, 40], [1, 24, 42]],
  cello: [[0, 44, 76], [1, 44, 52]],
  contrabass: [[1, 54, 70], [2, 50, 63]],
  harp: [[1, -70, -62], [2, -63, -54]],
  piano: [[-1, -78, -72], [-1, 72, 78]],
  flute: [[2, -20, -3], [1, -20, -6]],
  clarinet: [[2, 3, 20], [1, 6, 20]],
  horn: [[3, -36, -6], [2, -44, -24]],
  trumpet: [[3, 6, 36], [2, 24, 46]],
  timpani: [[4, -8, 8]],
  glockenspiel: [[4, 10, 19]],
  choir: [[4, -50, -14], [3, -57, -40]],
  drums: [[4, 22, 50], [3, 40, 57]],
};
const FAMILY_ZONES = {
  strings: [[1, -58, -26], [2, -50, -24]],
  woodwinds: [[1, -20, 20], [2, -40, 40]],
  brass: [[2, -44, -24], [2, 24, 46], [3, 38, 57]],
  percussion: [[4, -30, 30], [3, 38, 57]],
  keys: [[-1, 72, 78], [-1, -78, -72]],
  voices: [[3, -57, -40], [4, -50, -14]],
  drums: ZONES.drums,
  other: [[2, -40, 40], [3, -50, 50]],
};
const SPACING = { harp: 1.25, piano: 2.4, timpani: 1.3, cello: 0.88, contrabass: 0.92, choir: 0.62, drums: 0.62, glockenspiel: 1 };
const groupOf = (inst) => (inst.family === 'drums' ? 'drums' : ZONES[inst.id] ? inst.id : 'fam:' + (inst.family || 'other'));
const zoneOf = (g) => ZONES[g] || FAMILY_ZONES[g.slice(4)] || FAMILY_ZONES.other;

const ROMAN = [[10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
function roman(n) { let s = ''; if (n >= 40) return String(n); for (const [v, r] of ROMAN) while (n >= v) { s += r; n -= v; } return s; }

// ---------- theme tokens ----------
const TOKENS = ['bg', 'surface', 'surface-2', 'ink', 'ink-muted', 'line', 'accent', 'accent-hi', 'accent-lo', 'accent-ink', 'velvet', 'velvet-hi', 'velvet-lo', 'glow', 'stage-bg', 'stage-floor', 'shadow', 'on-hue'];
const RAW = ['hue-s', 'hue-l', 'hue-l-fill', 'font-display', 'font-body'];
const camel = (s) => s.replace(/-(\w)/g, (_, c) => c.toUpperCase());
const probe = document.createElement('canvas').getContext('2d');
function normColor(str) { // any CSS colour -> [#rrggbb, alpha]
  probe.fillStyle = '#000'; probe.fillStyle = str;
  const v = probe.fillStyle;
  if (v[0] === '#') return [v, 1];
  const m = v.match(/rgba?\(([^)]+)\)/); if (!m) return ['#000000', 1];
  const [r, g, b, a = 1] = m[1].split(',').map((x) => parseFloat(x));
  return ['#' + [r, g, b].map((x) => Math.round(x).toString(16).padStart(2, '0')).join(''), +a];
}
function readTokens() {
  const cs = getComputedStyle(root), tok = { alpha: {} };
  for (const n of TOKENS) { const raw = cs.getPropertyValue('--' + n).trim(); if (!raw) continue; const [hex, a] = normColor(raw); tok[camel(n)] = hex; tok.alpha[camel(n)] = a; }
  for (const n of RAW) tok[camel(n)] = cs.getPropertyValue('--' + n).trim();
  tok.theme = root.dataset.theme === 'light' ? 'light' : root.dataset.theme === 'dark' ? 'dark' : matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  const dark = tok.theme === 'dark';
  tok.stageBg ||= dark ? '#0a0609' : '#e8d9bd'; tok.stageFloor ||= dark ? '#3b2415' : '#a4703f';
  tok.velvet ||= dark ? '#6a0f22' : '#8c1d2e'; tok.velvetLo ||= dark ? '#2e0610' : '#4f0b17'; tok.velvetHi ||= dark ? '#9b1c33' : '#b8384a';
  tok.accent ||= dark ? '#d6b26c' : '#805a1a'; tok.accentHi ||= dark ? '#f2d99c' : '#c99a3e'; tok.glow ||= '#ffc468';
  tok.ink ||= dark ? '#f3e9d6' : '#2a1a12'; tok.surface ||= dark ? '#170c10' : '#fbf6ec';
  tok.hueS ||= dark ? '72%' : '66%'; tok.hueL ||= dark ? '70%' : '24%'; tok.hueLFill ||= dark ? '52%' : '42%';
  return tok;
}

// ---------- quality ----------
function detectQuality() {
  const q = (qs.get('quality') || '').toLowerCase();
  if (q === 'low' || q === 'high') return q;
  const cores = navigator.hardwareConcurrency || 4, mem = navigator.deviceMemory || 8;
  const coarse = matchMedia('(pointer: coarse)').matches;
  return cores <= 4 || mem <= 4 || (coarse && Math.min(screen.width, screen.height) < 820) ? 'low' : 'high';
}

// ---------- boot ----------
let stage = null, booting = null, toggleEl = null;

function setMode(mode) {
  root.dataset.stage = mode;
  toggleEl?.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === mode)));
  if (mode === '3d') { if (stage) stage.resume(); }
  else stage?.pause();
}

async function want3d() {
  if (stage) { setMode('3d'); return; }
  if (!booting) booting = boot().catch((err) => { console.warn('[stage3d] 3D stage unavailable, keeping the 2D stage:', err); return null; });
  stage = await booting;
  if (stage) { setMode('3d'); stage.resume(); }
  else { delete root.dataset.stage; toggleEl?.remove(); toggleEl = null; }
}

function mountToggle() {
  toggleEl = document.createElement('div');
  toggleEl.className = 's3d-switch';
  toggleEl.setAttribute('role', 'group');
  toggleEl.setAttribute('aria-label', 'Stage: flat or 3D');
  toggleEl.innerHTML = '<span class="s3d-switch-thumb" aria-hidden="true"></span><button type="button" data-v="2d" aria-pressed="false" title="Flat painted stage">2D</button><button type="button" data-v="3d" aria-pressed="false" title="Three-dimensional concert hall">3D</button>';
  toggleEl.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    writePref(b.dataset.v);
    if (b.dataset.v === '3d') want3d(); else setMode('2d');
  });
  wrap.append(toggleEl);
}

if (wrap && forced !== '2d' && hasWebGL2()) {
  mountToggle();
  if (forced === '3d' || readPref() !== '2d') { root.dataset.stage = '3d'; want3d(); }
  else setMode('2d');
}

async function loadModule(name, file, pick) {
  try {
    const m = await import(file);
    const api = pick(m);
    if (Object.values(api).every((f) => typeof f === 'function')) return { api, real: true };
    console.info(`[stage3d] ${file} is missing exports, using the built-in ${name}`);
  } catch (err) {
    if (!/Failed to fetch|Importing a module script failed|error loading dynamically imported module/i.test(String(err))) console.warn(`[stage3d] ${file} failed to load, using the built-in ${name}:`, err);
  }
  return { api: pick(STUB), real: false };
}

async function boot() {
  const THREE = await import('three');
  const addons = (path) => import('three/addons/' + path);
  const quality = detectQuality();

  const canvas = document.createElement('canvas');
  canvas.className = 's3d-canvas';
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', 'Concert hall in 3D. Click a musician to start or stop them; shift-click or right-click switches looping and playing once; click the conductor for tutti or to stop everyone. Drag to look around.');
  const flat = document.getElementById('stage');
  (flat ? flat.after(canvas) : wrap.prepend(canvas));

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: quality === 'high', powerPreference: 'high-performance', stencil: false });
  } catch (err) { canvas.remove(); throw err; }
  const maxDpr = quality === 'high' ? 2 : 1.5;
  let dpr = Math.min(devicePixelRatio || 1, maxDpr);
  renderer.setPixelRatio(dpr);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, 2, 0.1, 220);
  camera.position.set(0, 5.6, 15);
  camera.lookAt(0, 1.3, -3.6);
  scene.add(camera);

  let tok = readTokens();
  const color = (str) => new THREE.Color().setStyle(normColor(str)[0]);
  const instColor = (inst, light = 'hueL') => new THREE.Color().setStyle(`hsl(${inst?.hue ?? 30}, ${tok.hueS}, ${tok[light]})`);

  // environment for gilt / brass reflections
  try {
    const { RoomEnvironment } = await addons('environments/RoomEnvironment.js');
    const pmrem = new THREE.PMREMGenerator(renderer);
    const room = new RoomEnvironment();
    scene.environment = pmrem.fromScene(room, 0.04).texture;
    room.dispose?.(); pmrem.dispose();
  } catch (err) { console.warn('[stage3d] RoomEnvironment unavailable:', err); }

  scene.background = new THREE.Color();
  scene.fog = new THREE.Fog(0x000000, 24, 62);

  // ---------- lights ----------
  const hemi = new THREE.HemisphereLight(0xffffff, 0x222222, 1);
  scene.add(hemi);
  const key = new THREE.SpotLight(0xfff0d8, 3, 0, 0.62, 0.75, 0);
  key.position.set(3.5, 17, 11);
  key.target.position.set(0, 0.6, -4.2);
  key.castShadow = true;
  key.shadow.mapSize.set(quality === 'high' ? 2048 : 1024, quality === 'high' ? 2048 : 1024);
  key.shadow.bias = -0.0004; key.shadow.normalBias = 0.03;
  key.shadow.camera.near = 6; key.shadow.camera.far = 45;
  scene.add(key, key.target);
  const rim = new THREE.DirectionalLight(0x8fa0ff, 0.4); // cool back light: silhouettes in the evening
  rim.position.set(-4, 9, -16); rim.target.position.set(0, 1, -2);
  scene.add(rim, rim.target);
  const SPOTS = Array.from({ length: 8 }, () => {
    const s = new THREE.SpotLight(0xffffff, 0, 0, 0.3, 0.6, 0);
    s.position.set(0, 11, 2); s.target.position.set(0, 0, -4);
    scene.add(s, s.target);
    return { light: s, group: null, cur: 0, want: 0, pos: new THREE.Vector3(0, 0, -4), col: new THREE.Color(1, 1, 1) };
  });

  let LT = {};
  function applyLightTheme() {
    const light = tok.theme === 'light';
    LT = light
      ? { hemi: 1.25, key: 2.2, keyPlay: 2.0, spot: 3.2, rim: 0.15, exposure: 1.0, env: 0.55, fogNear: 30, fogFar: 80 }
      : { hemi: 0.32, key: 2.0, keyPlay: 1.35, spot: 5.5, rim: 0.55, exposure: 1.05, env: 0.28, fogNear: 22, fogFar: 60 };
    hemi.color.set(light ? '#fff2dc' : '#6c5a82');
    hemi.groundColor.copy(color(tok.stageFloor)).multiplyScalar(light ? 0.9 : 0.35);
    key.color.set(light ? '#fff1dc' : '#ffd29a');
    rim.color.set(light ? '#ffe6c8' : '#8696ff');
    renderer.toneMappingExposure = LT.exposure;
    if ('environmentIntensity' in scene) scene.environmentIntensity = LT.env;
    scene.background.copy(color(tok.stageBg));
    if (!light) scene.background.multiplyScalar(0.8);
    scene.fog.color.copy(scene.background);
    scene.fog.near = LT.fogNear; scene.fog.far = LT.fogFar;
  }
  applyLightTheme();

  const ctx = {
    THREE, scene, camera, renderer, canvas, tok,
    reducedMotion: RM.matches, quality, addons,
    // extras beyond the contract (handy, optional)
    color, instColor, geo: { C: new THREE.Vector3(0, 0, C_Z), tierY, tierR, maxDeg: (t) => 78 - 7 * t, podium: new THREE.Vector3(PODIUM.x, PODIUM.y, PODIUM.z) },
    analyser, audio: O,
  };
  RM.addEventListener?.('change', (e) => { ctx.reducedMotion = e.matches; });

  // ---------- sibling modules (real, else stubs) ----------
  const [H, M, F, P, D] = await Promise.all([
    loadModule('hall', './hall.js', (m) => ({ buildHall: m.buildHall })),
    loadModule('musicians', './musicians.js', (m) => ({ createMusician: m.createMusician, createConductor: m.createConductor })),
    loadModule('fx', './fx.js', (m) => ({ createFX: m.createFX })),
    loadModule('post', './post.js', (m) => ({ createPost: m.createPost })),
    loadModule('director', './director.js', (m) => ({ createDirector: m.createDirector })),
  ]);
  const errs = new Map();
  const report = (name, err) => { const n = (errs.get(name) || 0) + 1; errs.set(name, n); if (n <= 2) console.error(`[stage3d] ${name}:`, err); return n; };
  async function make(name, real, factory, stubFactory) {
    if (real) { try { const v = await factory(ctx); if (v) return { v, real: true }; } catch (err) { report(name + ' init', err); } }
    return { v: await stubFactory(ctx), real: false };
  }
  const mods = {};
  const hallM = await make('hall', H.real, H.api.buildHall, STUB.buildHall);
  mods.hall = hallM.v; scene.add(mods.hall.group);
  const fxM = await make('fx', F.real, F.api.createFX, STUB.createFX); mods.fx = fxM.v;
  const postM = await make('post', P.real, P.api.createPost, STUB.createPost); mods.post = postM.v;
  const dirM = await make('director', D.real, D.api.createDirector, STUB.createDirector); mods.director = dirM.v;
  const condM = await make('conductor', M.real, M.api.createConductor, STUB.createConductor); mods.conductor = condM.v;
  let createMusician = M.real ? M.api.createMusician : STUB.createMusician;
  const realness = { hall: hallM.real, musicians: M.real, conductor: condM.real, fx: fxM.real, post: postM.real, director: dirM.real };

  // a module that keeps throwing in update/render is swapped for its stub
  const STUBS = { hall: STUB.buildHall, fx: STUB.createFX, post: STUB.createPost, director: STUB.createDirector, conductor: STUB.createConductor };
  function call(name, fn, ...args) {
    const m = mods[name]; const f = m?.[fn];
    if (typeof f !== 'function') return undefined;
    try { return f.apply(m, args); } catch (err) {
      const n = report(`${name}.${fn}`, err);
      if (n >= 3 && (fn === 'update' || fn === 'render') && STUBS[name] && realness[name]) {
        console.warn(`[stage3d] ${name} keeps failing, falling back to the built-in one`);
        realness[name] = false;
        if (name === 'hall') scene.remove(m.group);
        if (name === 'conductor') m.object3d?.removeFromParent();
        mods[name] = STUBS[name](ctx);
        if (name === 'hall') { scene.add(mods.hall.group); mods.hall.setCurtains?.(curtainOpen, { instant: true }); }
        if (name === 'conductor') placeConductor();
        if (name === 'post') mods.post.setSize?.(W, H_);
      }
      return undefined;
    }
  }

  // conductor on the podium, facing the orchestra
  function placeConductor() {
    const o = mods.conductor.object3d; if (!o) return;
    if (!o.parent) scene.add(o);
    if (o.position.lengthSq() < 1e-6 && Math.abs(o.rotation.y) < 1e-6) { o.position.set(PODIUM.x, PODIUM.y, PODIUM.z); o.rotation.y = Math.PI; }
  }
  placeConductor();

  // ---------- musicians ----------
  const recs = new Map(); // seat id -> record
  let intro = true;
  function makeRec(seat, i) {
    const inst = byId[seat.inst] || { id: seat.inst, name: seat.inst, hue: 30, family: 'other' };
    const rec = { id: seat.id, seat, inst, group: groupOf(inst), m: null, obj: null, tx: 0, ty: 0, tz: 0, try: 0, placed: false,
      appear: 0, delay: intro && !ctx.reducedMotion ? 0.35 + i * 0.03 : 0, leaving: false, active: null, sel: -1, height: 1.3, pos: new THREE.Vector3() };
    const attach = (m) => {
      if (!m || !m.object3d) return;
      if (rec.leaving && rec.appear <= 0.02) { try { m.dispose?.(); } catch { /* ignore */ } return; }
      rec.m = m; rec.obj = m.object3d;
      rec.obj.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(rec.obj);
      const h = box.max.y; rec.height = Number.isFinite(h) && h > 0.6 && h < 4 ? h : /glock|timpani|choir|clap/.test(inst.id) ? 1.75 : 1.3;
      rec.base = rec.obj.scale.clone(); // the module's own scale; the pop-in multiplies it
      rec.obj.scale.setScalar(0.001);
      scene.add(rec.obj);
      rec.active = null; rec.sel = -1;
    };
    let m;
    try { m = createMusician(ctx, { seat, inst }); } catch (err) { report('musicians.createMusician', err); m = STUB.createMusician(ctx, { seat, inst }); }
    if (m && typeof m.then === 'function') m.then(attach, (err) => { report('musicians.createMusician', err); attach(STUB.createMusician(ctx, { seat, inst })); });
    else attach(m);
    return rec;
  }

  function relayout() {
    const live = new Set();
    let i = 0;
    for (const s of seats) { live.add(s.id); if (!recs.has(s.id)) recs.set(s.id, makeRec(s, i)); i++; }
    for (const r of recs.values()) if (!live.has(r.id)) r.leaving = true;
    intro = false;
    // groups in INSTRUMENTS order, players by k
    const order = new Map(O.INSTRUMENTS.map((x, j) => [x.id, j]));
    const groups = new Map();
    for (const s of seats) { const r = recs.get(s.id); let l = groups.get(r.group); if (!l) groups.set(r.group, (l = [])); l.push(r); }
    for (const [g, list] of groups) {
      list.sort((a, b) => (order.get(a.inst.id) ?? 99) - (order.get(b.inst.id) ?? 99) || a.seat.k - b.seat.k);
      const rows = zoneOf(g), sp = SPACING[g] || SPACING[list[0].inst.id] || 0.68, n = list.length;
      const caps = rows.map(([t, a0, a1]) => Math.max(1, Math.floor(((a1 - a0) * RAD * tierR(t)) / sp) + 1));
      const counts = rows.map(() => 0);
      let rem = n;
      for (let r = 0; r < rows.length && rem > 0; r++) { counts[r] = Math.min(caps[r], rem); rem -= counts[r]; }
      for (let r = 0; rem > 0; r++, rem--) counts[r % rows.length]++;
      let idx = 0;
      rows.forEach(([t, a0, a1], r) => {
        const m = counts[r]; if (!m) return;
        const Rr = tierR(t), len = (a1 - a0) * RAD * Rr;
        const s = m > 1 ? Math.min(sp * 1.22, len / (m - 1)) : 0;
        const span = (s * (m - 1)) / Rr / RAD, mid = (a0 + a1) / 2;
        const angs = Array.from({ length: m }, (_, j) => mid - span / 2 + (m > 1 ? (span * j) / (m - 1) : 0));
        if (g !== 'drums') angs.sort((p, q) => Math.abs(p) - Math.abs(q)); // principal sits nearest the podium
        for (const a of angs) {
          const rec = list[idx++]; if (!rec) return;
          const x = Rr * Math.sin(a * RAD), z = C_Z - Rr * Math.cos(a * RAD);
          rec.tx = x; rec.ty = tierY(t); rec.tz = z;
          rec.try = Math.atan2(PODIUM.x - x, PODIUM.z - z);
          if (!rec.placed) { rec.pos.set(x, rec.ty, z); rec.ry = rec.try; rec.placed = true; }
        }
      });
    }
    syncActive();
    syncSelection();
  }

  function syncActive() {
    for (const r of recs.values()) {
      const on = !r.leaving && !!r.seat.active;
      if (r.m && r.active !== on) { r.active = on; try { r.m.setActive(on); } catch (err) { report('musician.setActive', err); } }
    }
  }

  // ---------- selection + hover ----------
  let sel = { seat: null, inst: null, family: null }, hover = null; // hover: rec | 'conductor' | null
  const inSel = (r) => (sel.seat != null ? r.id === sel.seat : sel.inst ? r.seat.inst === sel.inst : sel.family ? r.inst.family === sel.family : false);
  function syncSelection() {
    for (const r of recs.values()) {
      if (!r.m) continue;
      let lv = sel.seat != null && r.id === sel.seat ? 2 : inSel(r) ? 1 : 0;
      if (hover === r) lv = Math.max(lv, 1);
      if (r.sel !== lv) { r.sel = lv; try { r.m.setSelected(lv); } catch (err) { report('musician.setSelected', err); } }
    }
  }
  function focusSelection() {
    const list = [...recs.values()].filter((r) => !r.leaving && inSel(r));
    if (!list.length) { call('director', 'focus', null); return; }
    const c = new THREE.Vector3();
    for (const r of list) c.add(new THREE.Vector3(r.tx, r.ty + r.height * 0.6, r.tz));
    c.divideScalar(list.length);
    let rad = 1.2;
    for (const r of list) rad = Math.max(rad, Math.hypot(r.tx - c.x, r.tz - c.z) + 1);
    const label = sel.seat != null ? `${list[0].inst.name} ${roman(list[0].seat.k + 1)}` : sel.inst ? byId[sel.inst]?.name || sel.inst : sel.family;
    call('director', 'focus', { position: c, radius: rad, label, seat: sel.seat, inst: sel.inst, family: sel.family });
  }
  addEventListener('orch:select', (e) => {
    const d = e.detail || {};
    sel = { seat: d.seat ?? null, inst: d.inst ?? null, family: d.family ?? null };
    if (sel.seat != null && !sel.inst) sel.inst = seats.find((s) => s.id === sel.seat)?.inst ?? null;
    syncSelection();
    if (live) focusSelection();
  });

  // ---------- audio-reactive frame ----------
  const bins = new Uint8Array(analyser.frequencyBinCount);
  const frame = { t: 0, dt: 0, level: 0, bands: { low: 0, mid: 0, high: 0 }, beat: 0, bpm: O.bpm, playing: 0, total: 0, tutti: 0, theme: tok.theme };
  function analyse(dt) {
    analyser.getByteFrequencyData(bins);
    let a = 0, b = 0, c = 0;
    for (let i = 1; i < 9; i++) a += bins[i];
    for (let i = 9; i < 120; i++) b += bins[i];
    for (let i = 120; i < 480; i++) c += bins[i];
    const L = clamp((b / 111 - 30) / 130, 0, 1), B = clamp((a / 8 - 60) / 150, 0, 1), Hh = clamp((c / 360 - 10) / 90, 0, 1);
    frame.level = ease(frame.level, L, L > frame.level ? 14 : 3, dt);
    frame.bands.low = ease(frame.bands.low, B, B > frame.bands.low ? 20 : 4, dt);
    frame.bands.mid = ease(frame.bands.mid, L, L > frame.bands.mid ? 14 : 3, dt);
    frame.bands.high = ease(frame.bands.high, Hh, Hh > frame.bands.high ? 12 : 3, dt);
  }
  let beatNum = 0, beatAt = -1e9, tuttiOn = false;
  addEventListener('orch:beat', (e) => {
    const d = e.detail || {};
    beatNum = d.beat ?? 0; beatAt = performance.now();
    if (!live) return;
    call('conductor', 'onBeat', d);
    if (beatNum % 4 === 0) {
      call('fx', 'emit', 'pulse', { position: new THREE.Vector3(PODIUM.x, PODIUM.y + 1.6, PODIUM.z), color: color(tok.accentHi), strength: beatNum === 0 ? 1 : 0.6, beat: beatNum, bar: d.bar });
    }
  });

  const RING = /timpani|kick|tom/, SPARKLE = /glock|cymbal/;
  addEventListener('orch:note', (e) => {
    const d = e.detail || {}, r = recs.get(d.seat);
    if (!r || !live) return;
    if (r.m) { try { r.m.onNote(d); } catch (err) { report('musician.onNote', err); } }
    const head = new THREE.Vector3(r.pos.x, r.pos.y + r.height + 0.12, r.pos.z);
    const col = instColor(r.inst, tok.theme === 'light' ? 'hueLFill' : 'hueL');
    const opts = { position: head, color: col, hue: r.inst.hue ?? 30, vel: d.vel ?? 0.8, midi: d.midi, dur: d.dur, inst: r.inst.id, family: r.inst.family, seat: r.id, live: !!d.live };
    call('fx', 'emit', 'note', opts);
    if (RING.test(r.inst.id)) call('fx', 'emit', 'ring', { ...opts, position: new THREE.Vector3(r.pos.x, r.pos.y + 0.05, r.pos.z) });
    if (SPARKLE.test(r.inst.id) || r.inst.family === 'brass') call('fx', 'emit', 'sparkle', { ...opts, position: head.clone() });
    if (d.live) liveUntil = performance.now() + 1500; // keyboard playing opens the curtain too
    if (d.live && !curtainOpen) setCurtains(true);
  });

  // ---------- curtains ----------
  let curtainOpen = false, closeTimer = 0, theaterOn = false, liveUntil = 0;
  function setCurtains(open, opts = {}) {
    clearTimeout(closeTimer);
    if (open === curtainOpen && !opts.force) return;
    curtainOpen = open;
    call('hall', 'setCurtains', open, { instant: !!opts.instant, curtainCall: !!opts.curtainCall, reducedMotion: ctx.reducedMotion });
  }
  function musicDrivesCurtains() {
    const any = seats.some((s) => s.active);
    if (any) setCurtains(true);
    else if (curtainOpen && wasPlaying) {
      clearTimeout(closeTimer);
      closeTimer = setTimeout(() => { if (!seats.some((s) => s.active) && performance.now() > liveUntil) setCurtains(false, { curtainCall: true }); }, 1500);
    }
    wasPlaying = any;
  }
  let wasPlaying = false;
  addEventListener('orch:change', () => { relayout(); musicDrivesCurtains(); });
  addEventListener('orch:theater', (e) => {
    theaterOn = !!e.detail?.on;
    canvas.classList.toggle('is-theater', theaterOn);
    fit();
    if (theaterOn) setCurtains(true);
  });

  // ---------- theme ----------
  function applyTheme() {
    tok = readTokens(); ctx.tok = tok; frame.theme = tok.theme;
    applyLightTheme();
    for (const name of ['hall', 'fx', 'post', 'director', 'conductor']) call(name, 'applyTheme', tok);
    for (const r of recs.values()) if (r.m) { try { r.m.applyTheme(tok); } catch (err) { report('musician.applyTheme', err); } }
    spots.forEach((s) => s.group && s.col.copy(spotColor(s.group)));
  }
  addEventListener('orch:theme', () => requestAnimationFrame(applyTheme));

  // ---------- section spotlights (<= 8, no shadows) ----------
  const spots = SPOTS;
  const spotColor = (g) => { const r = [...recs.values()].find((x) => x.group === g); return new THREE.Color().setStyle(`hsl(${r?.inst.hue ?? 40}, 85%, ${tok.theme === 'light' ? 70 : 64}%)`); };
  // hall.spotAnchors (Vector3s or Object3Ds on the lighting bridge): each section spot hangs from the nearest one
  const ancTmp = new THREE.Vector3(), ancWant = new THREE.Vector3();
  function anchorFor(p) {
    const list = mods.hall?.spotAnchors;
    if (!Array.isArray(list) || !list.length) return null;
    ancWant.set(p.x * 0.7, 11.5, p.z + 7.5);
    let best = null, bd = Infinity;
    for (const a of list) {
      if (!a) continue;
      if (a.isObject3D) a.getWorldPosition(ancTmp); else if (Number.isFinite(a.x)) ancTmp.set(a.x, a.y, a.z); else continue;
      const d = ancTmp.distanceToSquared(ancWant);
      if (d < bd) { bd = d; best = best || new THREE.Vector3(); best.copy(ancTmp); }
    }
    return best;
  }
  // fx.beam (optional): a visible light cone through the haze for every lit section spot
  function beamFor(s, L, dist) {
    const fx = mods.fx;
    if (typeof fx?.beam !== 'function' || (errs.get('fx.beam') || 0) >= 3) return;
    try {
      if (!s.beam || s.beamOf !== fx) {
        if (s.cur < 0.01) return;
        s.beam = fx.beam(L.position, L.target.position, { color: s.col, angle: L.angle / RAD * 0.8, intensity: 0 }); s.beamOf = fx;
        s.bColor = s.col.getHex(); s.bAt = L.position.clone(); s.bTo = L.target.position.clone();
      }
      const b = s.beam;
      if (s.bColor !== s.col.getHex()) { b.setColor(s.col); s.bColor = s.col.getHex(); }
      if (s.bAt.distanceToSquared(L.position) > 1e-4) { b.setSource(L.position); s.bAt.copy(L.position); }
      if (s.bTo.distanceToSquared(L.target.position) > 1e-4) { b.setTarget(L.target.position); s.bTo.copy(L.target.position); }
      b.setIntensity(s.cur * (tok.theme === 'light' ? 0.55 : 1) * (0.75 + frame.level * 0.4));
    } catch (err) { report('fx.beam', err); s.beam = null; s.beamOf = mods.fx; }
  }
  function updateSpots(dt) {
    const act = new Map(); // group -> {n, x, y, z, minX, maxX}
    for (const r of recs.values()) {
      if (r.leaving || !r.seat.active) continue;
      let a = act.get(r.group); if (!a) act.set(r.group, (a = { n: 0, x: 0, y: 0, z: 0, ext: 0, list: [] }));
      a.n++; a.x += r.pos.x; a.y += r.pos.y; a.z += r.pos.z; a.list.push(r);
    }
    for (const a of act.values()) { a.x /= a.n; a.y /= a.n; a.z /= a.n; for (const r of a.list) a.ext = Math.max(a.ext, Math.hypot(r.pos.x - a.x, r.pos.z - a.z)); }
    const ranked = [...act.entries()].sort((p, q) => q[1].n - p[1].n).slice(0, spots.length).map(([g]) => g);
    const lit = curtainOpen ? 1 : 0;
    for (const s of spots) {
      if (s.group && !ranked.includes(s.group)) s.want = 0;
      else if (s.group) s.want = lit;
    }
    for (const g of ranked) {
      if (spots.some((s) => s.group === g)) continue;
      const free = spots.find((s) => !s.group || (s.want === 0 && s.cur < 0.03));
      if (!free) continue;
      free.group = g; free.col.copy(spotColor(g)); free.want = lit;
      const a = act.get(g); free.pos.set(a.x, a.y, a.z);
    }
    for (const s of spots) {
      s.cur = ease(s.cur, s.want, s.want > s.cur ? 2.2 : 1.6, dt);
      if (s.cur < 0.003 && s.want === 0) { s.group = null; s.cur = 0; }
      const a = s.group && act.get(s.group);
      if (a) s.pos.lerp(new THREE.Vector3(a.x, a.y, a.z), 1 - Math.exp(-3 * dt));
      const L = s.light;
      L.intensity = s.cur * LT.spot * (0.8 + frame.level * 0.5);
      L.color.copy(s.col);
      const anc = anchorFor(s.pos);
      if (anc) L.position.copy(anc); else L.position.set(s.pos.x * 0.7, 11.5, s.pos.z + 7.5);
      L.target.position.set(s.pos.x, s.pos.y + 0.5, s.pos.z);
      const dist = L.position.distanceTo(L.target.position), ext = a ? a.ext : 1;
      L.angle = clamp(Math.atan((ext + 1.4) / dist), 0.07, 0.5);
      beamFor(s, L, dist);
    }
  }

  // ---------- picking ----------
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  function pickAt(px, py) {
    ndc.set((px / W) * 2 - 1, -(py / H_) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const cp = mods.conductor.pickables || (mods.conductor.object3d ? [mods.conductor.object3d] : []);
    const owners = new Map();
    const targets = [];
    for (const o of cp) { owners.set(o, 'conductor'); targets.push(o); }
    if (curtainOpen) {
      for (const r of recs.values()) {
        if (!r.m || r.leaving || r.appear < 0.5) continue;
        for (const o of r.m.pickables || [r.obj]) { owners.set(o, r); targets.push(o); }
      }
    }
    const hits = ray.intersectObjects(targets, true);
    for (const h of hits) {
      let o = h.object;
      while (o && !owners.has(o)) o = o.parent;
      if (o) return owners.get(o);
    }
    return null;
  }

  let ptr = null, ptrDirty = false, down = null;
  const local = (e) => { const b = canvas.getBoundingClientRect(); return [e.clientX - b.left, e.clientY - b.top]; };
  canvas.addEventListener('pointermove', (e) => {
    ptr = local(e); ptrDirty = true;
    if (down && !down.moved && Math.hypot(e.clientX - down.x, e.clientY - down.y) >= 5) { down.moved = true; call('director', 'onUserInput', { type: 'drag' }); }
    else if (down?.moved) call('director', 'onUserInput', { type: 'drag' });
  });
  canvas.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY, moved: false, button: e.button }; ptr = local(e); ptrDirty = true; });
  canvas.addEventListener('pointerleave', () => { ptr = null; ptrDirty = true; });
  canvas.addEventListener('pointercancel', () => { down = null; });
  canvas.addEventListener('wheel', () => call('director', 'onUserInput', { type: 'wheel' }), { passive: true });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  canvas.addEventListener('pointerup', (e) => {
    const d = down; down = null;
    if (!d || d.moved) return;
    const [px, py] = local(e);
    const h = pickAt(px, py);
    const loopKey = e.button === 2 || d.button === 2 || e.shiftKey || e.altKey;
    if (h === 'conductor') { seats.some((s) => s.active) ? O.stopAll() : O.tutti(); return; }
    if (!h) { if (!curtainOpen && e.button === 0) setCurtains(true); return; }
    if (loopKey) O.setLoop(h.seat, !h.seat.loop); else O.toggle(h.seat);
    dispatchEvent(new CustomEvent('orch:select', { detail: { inst: h.seat.inst, seat: h.id, family: h.inst.family, source: 'stage3d' } }));
  });

  // ---------- hover label (DOM) ----------
  const label = document.createElement('div');
  label.className = 's3d-label'; label.setAttribute('aria-hidden', 'true');
  label.innerHTML = '<b></b><span></span>';
  wrap.append(label);
  const [lTitle, lState] = label.children;
  const vtmp = new THREE.Vector3();
  let labelFor = null, labelText = '';
  function updateLabel() {
    const target = hover || (sel.seat != null ? recs.get(sel.seat) : null);
    let title = '', state = '', hue = 42, pos = null;
    if (target === 'conductor') {
      const o = mods.conductor.object3d;
      if (o) { o.getWorldPosition(vtmp); pos = vtmp.clone().add(new THREE.Vector3(0, 2.15, 0)); }
      title = 'The conductor'; state = seats.some((s) => s.active) ? 'click to stop everyone' : 'click for tutti';
    } else if (target && !target.leaving && target.obj) {
      const r = target, layers = r.inst.layers, layer = layers && layers.length ? layers[r.seat.k % layers.length] : '';
      title = `${r.inst.name || r.inst.id} ${roman(r.seat.k + 1)}` + (layer ? ` · ${layer}` : '');
      state = r.seat.active ? (r.seat.loop ? 'playing · looping' : 'playing once') : r.seat.loop ? 'resting · will loop' : 'resting · plays once';
      hue = r.inst.hue ?? 30;
      pos = vtmp.set(r.pos.x, r.pos.y + r.height * (r.obj.scale.y / (r.base.y || 1)) + 0.32, r.pos.z);
    } else if (hover === null && ptr && !curtainOpen) {
      title = 'The curtain is down'; state = 'click to raise it'; hue = 350;
      pos = null;
    }
    if (!title) { if (labelFor) { label.classList.remove('is-on'); labelFor = null; } return; }
    const text = title + '|' + state;
    if (text !== labelText) { lTitle.textContent = title; lState.textContent = state; labelText = text; label.style.setProperty('--h', hue); }
    let x, y;
    if (pos) { pos.project(camera); x = (pos.x * 0.5 + 0.5) * W; y = (-pos.y * 0.5 + 0.5) * H_; }
    else if (ptr) { x = ptr[0]; y = ptr[1] - 18; }
    else return;
    const lw = label.offsetWidth || 160, lh = label.offsetHeight || 44;
    x = clamp(x, lw / 2 + 8, W - lw / 2 - 8); y = clamp(y, lh + 8, H_ - 8);
    label.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -100%)`;
    if (!labelFor) label.classList.add('is-on');
    labelFor = target || 'curtain';
  }

  // ---------- size, visibility, adaptive quality ----------
  let W = 1, H_ = 1;
  function fit() {
    const w = wrap.clientWidth, h = wrap.clientHeight; if (!w || !h) return;
    W = w; H_ = h;
    renderer.setPixelRatio(dpr);
    renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix();
    call('post', 'setSize', w, h);
  }
  new ResizeObserver(fit).observe(wrap);
  let onScreen = true, live = false, raf = 0, last = 0, avg = 16.7, lastDrop = 0;
  new IntersectionObserver((es) => { onScreen = es[0].isIntersecting; kick(); }).observe(wrap);
  document.addEventListener('visibilitychange', kick);
  function running() { return live && onScreen && !document.hidden && root.dataset.stage === '3d'; }
  function kick() { if (running() && !raf) { last = performance.now(); raf = requestAnimationFrame(tick); } }

  // ---------- frame loop ----------
  const t0 = performance.now();
  let prevTuttiOn = false;
  function tick(now) {
    raf = 0;
    if (!running()) return;
    raf = requestAnimationFrame(tick);
    const ms = now - last; last = now;
    const dt = Math.min(0.05, Math.max(0.001, ms / 1000));
    // adaptive resolution: slow frames step the pixel ratio toward 1
    avg += (ms - avg) * 0.05;
    if (avg > 22 && dpr > 1 && now - lastDrop > 2000 && now - t0 > 3000) { dpr = Math.max(1, dpr - 0.25); lastDrop = now; avg = 16.7; fit(); }

    frame.t = (now - t0) / 1000; frame.dt = dt; frame.bpm = O.bpm || 84;
    analyse(dt);
    let playing = 0; for (const s of seats) if (s.active) playing++;
    frame.playing = playing; frame.total = seats.length;
    const spb = 60 / frame.bpm, since = (now - beatAt) / 1000 / spb;
    frame.beat = since < 2 ? (beatNum + Math.min(since, 0.999)) % LOOP : beatNum;
    tuttiOn = frame.total > 3 && playing / frame.total >= 0.8;
    frame.tutti = ease(frame.tutti, tuttiOn ? 1 : 0, tuttiOn ? 1.1 : 0.9, dt);
    if (tuttiOn && !prevTuttiOn) {
      call('director', 'onTutti');
      call('fx', 'emit', 'goldrain', { position: new THREE.Vector3(0, 9, -4), color: color(tok.accentHi), strength: 1, duration: 4 });
    }
    prevTuttiOn = tuttiOn;

    // musicians glide to their seats, pop in, shrink away when removed
    for (const [id, r] of recs) {
      if (r.delay > 0) { r.delay -= dt; continue; }
      r.appear = ease(r.appear, r.leaving ? 0 : 1, r.leaving ? 7 : 3.4, dt);
      if (r.leaving && r.appear < 0.02) {
        if (r.obj) { scene.remove(r.obj); try { r.m.dispose?.(); } catch (err) { report('musician.dispose', err); } }
        recs.delete(id); if (hover === r) hover = null; continue;
      }
      if (!r.obj) continue;
      const k = 1 - Math.exp(-4 * dt);
      const before = r.pos.distanceTo(vtmp.set(r.tx, r.ty, r.tz));
      r.pos.x += (r.tx - r.pos.x) * k; r.pos.z += (r.tz - r.pos.z) * k; r.pos.y += (r.ty - r.pos.y) * k;
      let dr = r.try - r.ry; dr = Math.atan2(Math.sin(dr), Math.cos(dr)); r.ry += dr * k;
      const hop = before > 0.05 ? Math.min(0.25, before * 0.12) : 0; // a little lift while changing seats
      r.obj.position.set(r.pos.x, r.pos.y + hop, r.pos.z);
      r.obj.rotation.y = r.ry;
      const s = smooth(clamp(r.appear, 0, 1));
      r.obj.scale.copy(r.base).multiplyScalar(Math.max(0.001, s));
      r.obj.visible = r.appear > 0.01;
      try { r.m.update(frame); } catch (err) { report('musician.update', err); }
    }

    if (ptrDirty) {
      ptrDirty = false;
      const h = ptr && !down?.moved ? pickAt(ptr[0], ptr[1]) : null;
      if (h !== hover) { hover = h; syncSelection(); }
      canvas.style.cursor = hover || (ptr && !curtainOpen) ? 'pointer' : '';
    }

    // lights breathe with the music
    const quiet = playing ? 1 : 0;
    houseLv = ease(houseLv, quiet, 1.4, dt);
    key.intensity = (LT.key + (LT.keyPlay - LT.key) * houseLv) * (curtainOpen ? 1 : 0.75);
    hemi.intensity = LT.hemi * (1 - 0.25 * houseLv * (tok.theme === 'dark' ? 1 : 0.3));
    rim.intensity = LT.rim * (1 + frame.tutti * 0.6);
    updateSpots(dt);

    call('hall', 'update', frame);
    call('conductor', 'update', frame);
    call('fx', 'update', frame);
    call('director', 'update', frame);
    updateLabel();
    call('post', 'render', frame);
  }
  let houseLv = 0;

  // ---------- go ----------
  fit();
  relayout();
  call('hall', 'setCurtains', false, { instant: true, reducedMotion: ctx.reducedMotion });
  curtainOpen = false;
  // the house opens with a reveal
  setTimeout(() => setCurtains(true), ctx.reducedMotion ? 0 : 700);
  for (const name of ['hall', 'fx', 'post', 'director', 'conductor']) call(name, 'applyTheme', tok);

  window.__stage3d = { THREE, scene, camera, renderer, ctx, mods, realness, get seats3d() { return recs; }, frame, setCurtains, relayout };
  console.info('[stage3d] 3D stage up · quality', quality, '· modules', Object.entries(realness).map(([k, v]) => `${k}:${v ? 'real' : 'stub'}`).join(' '));

  return {
    pause() { live = false; if (raf) { cancelAnimationFrame(raf); raf = 0; } label.classList.remove('is-on'); labelFor = null; },
    resume() { live = true; fit(); kick(); },
  };
}
