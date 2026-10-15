// Pocket Orchestra 3D: the camera director (Wave 4, module E).
//
//   createDirector(ctx) -> { update(frame), focus(target), onTutti(), onUserInput(),
//                            shot(name, opts?), reset(), applyTheme(tok), getState(),
//                            dispose(), shots }
//
// Contract coordinates: metres, Y up. Stage floor y=0, lip z=0, back wall z=-11, stage
// x in [-9.5, 9.5]; house at z>0 with its floor at y=-1.1. Riser tier t sits at y=0.32t on
// an arc centred at (0,0,1.6), seat-row radius 4.2+1.55t, spanning ±(78-7t)° from -z.
// Conductor podium at (0,0,0.9), top y=0.22, facing -z.
//
// How it works. The camera is described as a "rig": a look-at point plus yaw, pitch,
// distance and fov (yaw 0 = camera on the audience side of its target, pitch > 0 = looking
// down). Choreography produces a base rig every frame (eased arcs between rigs, holds,
// sequences), adds a breathing drift and a beat-synced sway, converts it to a position,
// keeps that position inside the hall (cranes up instead of backing through the house wall,
// stays above heads over the risers), and critically damped springs (exact solution, so
// frame-rate independent) smooth position, look-at and fov. update() allocates nothing.
//
// Optional ctx extras: ctx.bounds = { houseX, stageX, zMin, zMax, yMax, houseFloor } to
// match the real hall; ctx.reducedMotion is re-read every frame (a getter is fine).

const PI = Math.PI;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const smoother = (t) => t * t * t * (t * (t * 6 - 15) + 10);
const inOutSine = (t) => 0.5 - 0.5 * Math.cos(PI * t);
const inOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - ((-2 * t + 2) ** 3) / 2);
const wrapPi = (a) => { a = (a + PI) % (2 * PI); if (a < 0) a += 2 * PI; return a - PI; };

// Framings. tx/ty/tz = look-at, w/h = half-width/half-height (m) that must stay in frame,
// fov = base vertical fov (deg), dmin/dmax clamp the fitted distance.
const SHOT_DEFS = {
  overview:   { tx: 0,   ty: 1.0,  tz: -4.3, yaw: 0,     pitch: 0.21, w: 10.2, h: 5.4, fov: 38, dmin: 12,  dmax: 30 },
  strings:    { tx: 0,   ty: 0.95, tz: -2.1, yaw: 0.22,  pitch: 0.34, w: 6.3,  h: 2.9, fov: 36, dmin: 7.5, dmax: 20 },
  winds:      { tx: 0,   ty: 1.4,  tz: -5.7, yaw: -0.2,  pitch: 0.47, w: 4.8,  h: 1.9, fov: 34, dmin: 8.5, dmax: 17 },
  brass:      { tx: 0,   ty: 1.75, tz: -7.3, yaw: 0.24,  pitch: 0.53, w: 5.6,  h: 2.1, fov: 34, dmin: 9.5, dmax: 18 },
  percussion: { tx: 5.2, ty: 2.0,  tz: -7.3, yaw: -0.48, pitch: 0.44, w: 4.0,  h: 1.8, fov: 34, dmin: 8.5, dmax: 15 },
  drums:      { tx: 7.0, ty: 1.9,  tz: -5.6, yaw: -0.82, pitch: 0.38, w: 3.2,  h: 1.7, fov: 34, dmin: 8,   dmax: 14 },
  conductor:  { tx: 0,   ty: 1.42, tz: 0.9,  yaw: 2.76,  pitch: 0.05, w: 1.4,  h: 0.95, fov: 40, dmin: 2.3, dmax: 2.6 },
  audience:   { tx: 1.4, ty: -0.3, tz: 7.6,  yaw: -2.55, pitch: 0.36, w: 9,    h: 4,   fov: 42, dmin: 12,  dmax: 15 },
  // internal choreography framings (not public shot names)
  tuttiCrane: { tx: 0,   ty: 1.0,  tz: -5.0, yaw: -0.46, pitch: 0.64, w: 10,   h: 5,   fov: 42, dmin: 13,  dmax: 24 },
  tuttiTrack: { tx: 0,   ty: 1.3,  tz: -4.5, yaw: 0.42,  pitch: 0.27, w: 7.2,  h: 3.2, fov: 37, dmin: 9.5, dmax: 22 },
  lowLeft:    { tx: 0,   ty: 1.3,  tz: -4.8, yaw: -0.62, pitch: 0.11, w: 7,    h: 3,   fov: 34, dmin: 10,  dmax: 20 },
  lowRight:   { tx: 0,   ty: 1.3,  tz: -4.8, yaw: 0.62,  pitch: 0.11, w: 7,    h: 3,   fov: 34, dmin: 10,  dmax: 20 },
  birdseye:   { tx: 0,   ty: 0.6,  tz: -5.0, yaw: 0.12,  pitch: 0.80, w: 9.5,  h: 5.5, fov: 40, dmin: 12,  dmax: 13 },
  podium:     { tx: 0,   ty: 1.35, tz: -1.4, yaw: 0.07,  pitch: 0.16, w: 3.6,  h: 1.6, fov: 35, dmin: 6,   dmax: 9 },
};
const SHOT_NAMES = ['overview', 'strings', 'winds', 'brass', 'percussion', 'drums', 'conductor', 'audience'];

const MOVE = 1, HOLD = 2;
const USER_HOLD = 8;        // s the user's view is kept after the last input
const FOCUS_HOLD = 7.5;     // s a focus is held before easing back to the overview
const SHOT_HOLD = 12;       // s a named shot is held (shot(name, {hold: Infinity}) to lock it)
const TOUR_AFTER = 16;      // s of idle overview while music plays before an auto tour
const DRAG_PX = 5;          // the core treats < 5 px as a click: never consume those

export function createDirector(ctx) {
  const { THREE, camera } = ctx;
  const canvas = ctx.canvas || null;
  // houseRake: the house floor may rise toward the back (m per m past rakeZ0); prosc*: the proscenium
  // wall slab the camera may only pass through its opening. Defaults are conservative for any hall.
  const B = Object.assign({
    houseX: 12.5, stageX: 9.0, zMin: -10.3, zMax: 19, yMax: 12, houseFloor: -1.1, houseRake: 0.18, rakeZ0: 4.75,
    proscZ0: 2.0, proscZ1: 3.05, proscHalfW: 9.8, proscTop: 7.3,
  }, ctx.bounds || null);
  const houseMinY = (z) => B.houseFloor + 1.6 + B.houseRake * Math.max(0, z - B.rakeZ0); // seated heads + margin

  // ---------- rigs ----------
  const newRig = () => ({ tx: 0, ty: 0, tz: 0, yaw: 0, pitch: 0, dist: 10, fov: 38 });
  const copyRig = (d, s) => { d.tx = s.tx; d.ty = s.ty; d.tz = s.tz; d.yaw = s.yaw; d.pitch = s.pitch; d.dist = s.dist; d.fov = s.fov; return d; };
  const rigs = {};
  for (const k in SHOT_DEFS) rigs[k] = newRig();
  const focusRig = newRig(), openRig = newRig(), userRig = newRig();
  const cur = newRig();      // base rig after choreography (no drift)
  const from = newRig();     // start of the current move
  const goal = newRig();     // cur + drift + sway
  const focusPos = new THREE.Vector3();
  let focusRadius = 1.5, focusLabel = '';

  let aspect = 0, narrow = 0;
  function fovFor(base) { return base + 9 * narrow; }
  function fitDist(w, h, fov, dmin, dmax) {
    const tv = Math.tan((fov * PI) / 360);
    return clamp(Math.max(h / tv, (w * (1 - 0.18 * narrow)) / (tv * aspect)), dmin, dmax);
  }
  function layoutShot(r, d) {
    r.tx = d.tx; r.ty = d.ty; r.tz = d.tz; r.yaw = d.yaw; r.pitch = d.pitch;
    r.fov = fovFor(d.fov);
    r.dist = fitDist(d.w, d.h, r.fov, d.dmin, d.dmax);
  }
  function layoutFocus() {
    const p = focusPos, r = clamp(focusRadius || 2.2, 2.2, 12); // a lone player still gets some context
    const depth = clamp(-p.z, 0, 11);
    focusRig.tx = p.x * 0.94;                 // nudged toward the podium so the conductor stays in play
    focusRig.ty = p.y + 0.05;
    focusRig.tz = lerp(p.z, 0.9, 0.06);
    if (p.z > 3.5) { // something in the house: look back at it from the stage
      focusRig.yaw = wrapPi(PI + Math.atan2(0.4 * p.x, 9)); focusRig.pitch = 0.3;
    } else {
      focusRig.yaw = Math.atan2(-0.72 * p.x, 9 + 0.3 * depth);
      focusRig.pitch = 0.19 + 0.032 * depth + (r > 3 ? 0.05 : 0);
    }
    focusRig.fov = fovFor(r > 3 ? 36 : 34);
    // sections are wide, shallow arcs: frame their width generously, their height less so
    focusRig.dist = fitDist(r * 1.15 + 0.6, Math.min(r, 1.6 + 0.3 * r) + 0.4, focusRig.fov, r > 3 ? 8 : 6, 26);
  }
  function layoutOpening() {
    // back of the house, just above the audience's heads, long lens
    openRig.tx = 0; openRig.ty = 0.7; openRig.tz = -3.2; openRig.yaw = -0.12; openRig.fov = fovFor(29);
    const zStart = Math.min(B.zMax - 0.4, 18.5);
    openRig.dist = (zStart - openRig.tz) / Math.cos(openRig.yaw);
    openRig.pitch = Math.asin(clamp((houseMinY(zStart) + 0.35 - openRig.ty) / openRig.dist, -0.2, 0.35));
  }
  function relayout() {
    for (const k in SHOT_DEFS) layoutShot(rigs[k], SHOT_DEFS[k]);
    layoutFocus(); layoutOpening();
  }

  // ---------- program: a short list of moves/holds, then a follow-up ----------
  const steps = [];
  for (let i = 0; i < 8; i++) steps.push({ kind: 0, rig: null, dur: 0, ease: inOutCubic, pitchDelay: 0, bump: 1, lift: 0 });
  let nSteps = 0, stepIdx = 0, stepT0 = 0, programName = '', programThen = 'idle', programAt = -99;
  let mode = 'idle';          // 'idle' | 'program' | 'user'
  let idleSince = 0, tourIdx = 0, lastTuttiAt = -99, snap = true, started = false;
  let shotName = 'overview';

  function begin(name, then) { nSteps = 0; programName = name; programThen = then; }
  function addMove(rig, dur, ease = inOutCubic, pitchDelay = 0, bump = 1, lift = 0) {
    const s = steps[nSteps++]; s.kind = MOVE; s.rig = rig; s.dur = dur; s.ease = ease; s.pitchDelay = pitchDelay; s.bump = bump; s.lift = lift;
  }
  function addHold(dur) {
    const s = steps[nSteps++]; s.kind = HOLD; s.rig = nSteps > 1 ? steps[nSteps - 2].rig : cur; s.dur = dur;
  }
  function run() { mode = 'program'; programAt = now; stepIdx = -1; next(); }
  function next() {
    stepIdx++;
    if (stepIdx >= nSteps) { finish(); return; }
    const s = steps[stepIdx];
    stepT0 = now;
    if (s.kind === MOVE) {
      copyRig(from, cur);
      if (rm || s.dur <= 0) { copyRig(cur, s.rig); snap = true; next(); }
    }
  }
  function finish() {
    if (programThen === 'overview') { goOverview(4); return; }
    mode = 'idle'; idleSince = now; shotName = 'overview';
  }
  function goOverview(dur) {
    shotName = 'overview'; focusLabel = '';
    begin('return', 'idle'); addMove(rigs.overview, dur); run();
  }
  function moveDur(to) {
    const dx = to.tx - cur.tx, dy = to.ty - cur.ty, dz = to.tz - cur.tz;
    const dd = Math.sqrt(dx * dx + dy * dy + dz * dz);
    return clamp(1.5 + 0.11 * dd + 0.55 * Math.abs(wrapPi(to.yaw - cur.yaw)) + 0.02 * Math.abs(to.dist - cur.dist), 1.8, 3.6);
  }
  function interp(p, s) {
    const to = s.rig, e = s.ease(p);
    const pe = s.pitchDelay > 0 ? smoother(clamp((p - s.pitchDelay) / (1 - s.pitchDelay), 0, 1)) : e;
    cur.tx = lerp(from.tx, to.tx, e); cur.ty = lerp(from.ty, to.ty, e); cur.tz = lerp(from.tz, to.tz, e);
    const dyaw = wrapPi(to.yaw - from.yaw);
    cur.yaw = from.yaw + dyaw * e;
    cur.pitch = lerp(from.pitch, to.pitch, pe);
    // swinging far around (house side <-> stage side): crane up over the players on the way
    const swing = clamp((Math.abs(dyaw) - 1) / 1.4, 0, 1);
    if (swing > 0) cur.pitch += swing * 0.55 * Math.sin(PI * e);
    if (s.lift) cur.pitch += s.lift * Math.sin(PI * pe);
    // dolly out a little while arcing, then push back in: reads as one continuous crane/arc
    const dx = to.tx - from.tx, dz = to.tz - from.tz;
    const bump = s.bump * clamp(0.1 * Math.sqrt(dx * dx + dz * dz) + 0.22 * Math.abs(dyaw) * Math.min(from.dist, to.dist), 0, 4);
    cur.dist = lerp(from.dist, to.dist, e) + bump * Math.sin(PI * e);
    cur.fov = lerp(from.fov, to.fov, s.ease === inOutCubic ? inOutSine(p) : e);
  }

  // ---------- user control ----------
  let userUntil = 0, userYaw0 = 0, zoomGoal = 10, velYaw = 0, velPitch = 0, dragging = false, pinching = false;
  let engagedUntil = -1, theaterOn = false, lastResetAt = -99, lastTapAt = -99, lastTapX = 0, lastTapY = 0;
  const ptr = [{ id: -1, x: 0, y: 0, sx: 0, sy: 0, ts: 0 }, { id: -1, x: 0, y: 0, sx: 0, sy: 0, ts: 0 }];
  let pinchD0 = 1, pinchDist0 = 10, lastMoveTs = 0;

  function enterUser() {
    if (mode !== 'user') {
      // start from where the camera actually is (springs + drift included), so nothing jumps
      const dx = P[0] - L[0], dy = P[1] - L[1], dz = P[2] - L[2];
      const d = Math.max(0.5, Math.sqrt(dx * dx + dy * dy + dz * dz));
      userRig.tx = L[0]; userRig.ty = L[1]; userRig.tz = L[2];
      userRig.yaw = Math.atan2(dx, dz); userRig.pitch = Math.asin(clamp(dy / d, -1, 1)); userRig.dist = d; userRig.fov = F[0];
      userYaw0 = userRig.yaw; zoomGoal = d; velYaw = velPitch = 0;
      driftAmt = 0; mode = 'user'; programName = 'user';
    }
    userUntil = now + USER_HOLD;
  }
  function onUserInput(info) {
    // drags and wheel on our canvas are handled by our own listeners (which know whether the
    // wheel is zooming or the page is scrolling): don't freeze the camera for those twice
    const type = info && info.type;
    if (canvas && (type === 'wheel' || type === 'drag')) return;
    // a focus()/shot() issued by the same gesture wins over the freeze
    if (mode === 'program' && now - programAt < 0.35) { engagedUntil = now + USER_HOLD; return; }
    enterUser();
  }
  const slotOf = (id) => (ptr[0].id === id ? ptr[0] : ptr[1].id === id ? ptr[1] : null);
  const activeCount = () => (ptr[0].id !== -1) + (ptr[1].id !== -1);
  const rotK = (e) => (e.pointerType === 'touch' ? 0.007 : 0.0046);

  function onDown(e) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const s = ptr[0].id === -1 ? ptr[0] : ptr[1].id === -1 ? ptr[1] : null;
    if (!s) return;
    s.id = e.pointerId; s.x = s.sx = e.clientX; s.y = s.sy = e.clientY; s.ts = e.timeStamp;
    if (activeCount() === 2) {
      enterUser(); pinching = true; dragging = false; engagedUntil = now + USER_HOLD;
      pinchD0 = Math.max(10, Math.hypot(ptr[0].x - ptr[1].x, ptr[0].y - ptr[1].y)); pinchDist0 = userRig.dist;
    }
  }
  function onMove(e) {
    const s = slotOf(e.pointerId);
    if (!s) return;
    const dx = e.clientX - s.x, dy = e.clientY - s.y;
    if (pinching && activeCount() === 2) {
      s.x = e.clientX; s.y = e.clientY;
      const d = Math.max(10, Math.hypot(ptr[0].x - ptr[1].x, ptr[0].y - ptr[1].y));
      zoomGoal = clamp(pinchDist0 * pinchD0 / d, 1.8, 32);
      userRig.yaw -= dx * 0.5 * rotK(e); userRig.pitch += dy * 0.5 * rotK(e); // two-finger drag orbits too
      userUntil = now + USER_HOLD;
      return;
    }
    if (!dragging) {
      if (Math.hypot(e.clientX - s.sx, e.clientY - s.sy) < DRAG_PX) return;
      dragging = true; enterUser(); velYaw = velPitch = 0; lastMoveTs = e.timeStamp;
      engagedUntil = now + USER_HOLD; // after a drag the wheel zooms instead of scrolling the page
      try { canvas.setPointerCapture(e.pointerId); } catch { /* not capturable */ }
    }
    s.x = e.clientX; s.y = e.clientY;
    const k = rotK(e);
    userRig.yaw -= dx * k; userRig.pitch += dy * k;
    const edt = Math.max(1 / 240, (e.timeStamp - lastMoveTs) / 1000);
    lastMoveTs = e.timeStamp;
    velYaw = clamp(lerp(velYaw, (-dx * k) / edt, 0.35), -1.8, 1.8);
    velPitch = clamp(lerp(velPitch, (dy * k) / edt, 0.35), -1.0, 1.0);
    userUntil = now + USER_HOLD;
  }
  function onUp(e) {
    const s = slotOf(e.pointerId);
    if (!s) return;
    const moved = Math.hypot(e.clientX - s.sx, e.clientY - s.sy);
    s.id = -1;
    if (pinching) {
      pinching = false;
      const o = ptr[0].id !== -1 ? ptr[0] : ptr[1].id !== -1 ? ptr[1] : null;
      if (o) { o.sx = o.x; o.sy = o.y; dragging = true; } // the remaining finger keeps orbiting, no jump
      return;
    }
    if (dragging && activeCount() === 0) {
      dragging = false;
      if (e.timeStamp - lastMoveTs > 90) velYaw = velPitch = 0; // released after a pause: no flick
      try { canvas.releasePointerCapture(e.pointerId); } catch { /* fine */ }
      userUntil = now + USER_HOLD;
    }
    // double-tap (touch) resets; mouse uses dblclick
    if (e.type === 'pointerup' && e.pointerType === 'touch' && moved < DRAG_PX && !dragging) {
      if (now - lastTapAt < 0.32 && Math.hypot(e.clientX - lastTapX, e.clientY - lastTapY) < 30) { lastTapAt = -99; reset(); }
      else { lastTapAt = now; lastTapX = e.clientX; lastTapY = e.clientY; }
    }
  }
  function onWheel(e) {
    // zoom only when the camera is "engaged" so the page can still scroll past the stage
    const doc = document.documentElement;
    const pageScrolls = doc.scrollHeight > window.innerHeight + 2;
    if (!(e.ctrlKey || e.metaKey || theaterOn || !pageScrolls || now < engagedUntil)) return;
    e.preventDefault();
    let dy = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1);
    if (e.ctrlKey) dy *= 4; // trackpad pinch arrives as small ctrl+wheel deltas
    enterUser();
    zoomGoal = clamp(zoomGoal * Math.exp(clamp(dy, -240, 240) * 0.0016), 1.8, 32);
    engagedUntil = now + USER_HOLD;
  }
  function onDbl() { if (now - lastResetAt > 0.4) reset(); }
  function onTheater(e) { theaterOn = !!(e && e.detail && e.detail.on); setTouchAction(); }
  function setTouchAction() {
    // in the page: vertical swipes still scroll; in theater (full viewport): everything orbits
    if (canvas && canvas.style) canvas.style.touchAction = theaterOn ? 'none' : 'pan-y';
  }
  if (canvas) {
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('dblclick', onDbl);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    window.addEventListener('orch:theater', onTheater);
    setTouchAction();
  }

  // ---------- springs (state as plain arrays: no allocation) ----------
  const P = [0, 5, 14], PV = [0, 0, 0], L = [0, 1, -4], LV = [0, 0, 0], F = [38], FV = [0];
  const gp = new THREE.Vector3(), gl = new THREE.Vector3(), lookV = new THREE.Vector3();
  function spring(x, v, i, target, omega, dt) {
    const delta = x[i] - target, tmp = (v[i] + omega * delta) * dt, e = Math.exp(-omega * dt);
    x[i] = target + (delta + tmp) * e;
    v[i] = (v[i] - omega * tmp) * e;
  }

  // keep a camera position inside the hall and above heads
  function clampPos(p, l) { // returns true when it had to move the point
    const ox = p.x, oy = p.y, oz = p.z;
    if (p.z > B.zMax) {
      // crane up instead of backing through the house wall: same distance, steeper angle
      const dx = p.x - l.x, dy = p.y - l.y, dz = p.z - l.z;
      const d2 = dx * dx + dy * dy + dz * dz, s = (B.zMax - l.z) / dz;
      if (dz > 0 && s > 0 && s < 1) {
        const hx = dx * s, hz = dz * s, ny = Math.sqrt(Math.max(0, d2 - hx * hx - hz * hz));
        p.x = l.x + hx; p.z = B.zMax; p.y = l.y + (dy >= 0 ? ny : -ny);
      } else p.z = B.zMax;
    }
    if (p.y > B.yMax) p.y = B.yMax;
    // back wall / side walls: dolly in along the line of sight instead of sliding sideways,
    // so the angle the user (or a shot) chose survives and the camera never ends up in a wing
    const dx = p.x - l.x, dy = p.y - l.y, dz = p.z - l.z;
    let s = 1;
    if (p.z < B.zMin && dz < 0) s = Math.min(s, (B.zMin - l.z) / dz);
    const hx0 = p.z < 0.4 ? B.stageX : B.houseX;
    if (Math.abs(p.x) > hx0 && dx !== 0) s = Math.min(s, ((dx > 0 ? hx0 : -hx0) - l.x) / dx);
    if (s < 1) { s = Math.max(0.05, s); p.x = l.x + dx * s; p.y = l.y + dy * s; p.z = l.z + dz * s; }
    if (p.z < B.zMin) p.z = B.zMin;
    const hx = p.z < 0.4 ? B.stageX : B.houseX;
    p.x = clamp(p.x, -hx, hx);
    let minY = p.z > 0.3 ? houseMinY(p.z) : 0.45;
    // the proscenium wall: only through its opening
    if (p.z > B.proscZ0 && p.z < B.proscZ1) {
      p.x = clamp(p.x, -B.proscHalfW, B.proscHalfW);
      if (p.y > B.proscTop) p.y = B.proscTop;
    }
    // over the risers: stay clear of the players' heads (continuous, so no pops)
    const rz = p.z - 1.6, r = Math.sqrt(p.x * p.x + rz * rz);
    if (p.z < 1.2 && r > 3.3 && r < 11.4) {
      const tf = clamp((r - 4.2) / 1.55, 0, 4);
      const ang = Math.abs(Math.atan2(p.x, -rz)) * 180 / PI;
      if (ang < 82 - 7 * tf) minY = Math.max(minY, 0.32 * tf + 1.95);
    }
    if (p.y < minY) p.y = minY;
    return Math.abs(p.x - ox) + Math.abs(p.y - oy) + Math.abs(p.z - oz) > 0.01;
  }

  // ---------- frame state ----------
  let now = 0, rm = !!ctx.reducedMotion, driftAmt = 0, lvl = 0, playF = 0, lastFovSet = -1, tok = ctx.tok || null;
  let beat = 0;

  function startOpening() {
    relayout();
    copyRig(cur, openRig);
    shotName = 'overview';
    if (rm) { copyRig(cur, rigs.overview); snap = true; mode = 'idle'; idleSince = now; return; }
    begin('opening', 'idle');
    // glide in over the audience, crane up late, the long lens opening out to the overview
    addMove(rigs.overview, 7.2, inOutSine, 0.06, 0, 0.3);
    run();
    snap = true;
  }

  function startTour() {
    const n = tourIdx++ % 4;
    if (rm) { // reduced motion: a cross-cut to a static framing, hold, cut back
      const pick = ['strings', 'winds', 'brass', 'conductor'][n];
      shotName = pick; begin('tour', 'overview'); addMove(rigs[pick], 0); addHold(8); run(); return;
    }
    if (n === 0) { begin('tour:sweep', 'overview'); addMove(rigs.lowLeft, 4.5, inOutCubic, 0, 0.6); addMove(rigs.lowRight, 11, inOutSine, 0, 0.2); }
    else if (n === 1) { begin('tour:crane', 'overview'); addMove(rigs.birdseye, 7, inOutSine, 0, 0.3); addHold(2.5); }
    else if (n === 2) { begin('tour:podium', 'overview'); addMove(rigs.podium, 9, inOutSine, 0, 0.3); addHold(2); }
    else {
      begin('tour:sections', 'overview');
      addMove(rigs.strings, 3.4); addHold(3); addMove(rigs.winds, 3.4); addHold(3); addMove(rigs.brass, 3.4); addHold(3);
    }
    run();
  }

  // ---------- public API ----------
  function update(frame) {
    frame = frame || {};
    let dt = +frame.dt;
    if (!(dt > 0)) dt = 1 / 60;
    if (dt > 0.1) dt = 0.1;
    now += dt;
    rm = !!ctx.reducedMotion;
    syncAspect();
    if (!started) { started = true; startOpening(); }

    const level = clamp(+frame.level || 0, 0, 1);
    lvl += (level - lvl) * (1 - Math.exp(-dt * 3));
    playF += ((frame.playing > 0 ? 1 : 0) - playF) * (1 - Math.exp(-dt * 1.2));
    beat = +frame.beat || 0;

    // --- choreography -> cur
    if (mode === 'user') {
      if (rm) velYaw = velPitch = 0; // reduced motion: no flick-coasting
      if (!dragging && !pinching) {
        userRig.yaw += velYaw * dt; userRig.pitch += velPitch * dt;
        const k = Math.exp(-dt * 5); velYaw *= k; velPitch *= k;
      }
      // orbit limits: from the house side never swing round behind the orchestra
      if (Math.abs(userYaw0) < 1.6) userRig.yaw = clamp(userRig.yaw, -1.05, 1.05);
      else userRig.yaw = clamp(userRig.yaw, userYaw0 - 0.9, userYaw0 + 0.9);
      userRig.pitch = clamp(userRig.pitch, 0.02, 1.32);
      userRig.dist += (zoomGoal - userRig.dist) * (1 - Math.exp(-dt * 10));
      copyRig(cur, userRig);
      if (now > userUntil && !dragging && !pinching) goOverview(3.6);
    } else if (mode === 'program') {
      const s = steps[stepIdx];
      if (s.kind === MOVE) {
        const p = rm ? 1 : (now - stepT0) / s.dur; // reduced motion switched on mid-move: cut
        if (p >= 1) { copyRig(cur, s.rig); if (rm) snap = true; next(); } else interp(p, s);
      } else {
        copyRig(cur, s.rig);
        if (now - stepT0 >= s.dur) next();
      }
    } else {
      copyRig(cur, rigs.overview);
      if (frame.playing > 0 && now - idleSince > (rm ? 14 : TOUR_AFTER)) startTour();
      else if (!(frame.playing > 0)) idleSince = Math.max(idleSince, now - TOUR_AFTER * 0.5);
    }

    // --- drift + beat sway -> goal
    copyRig(goal, cur);
    const dTarget = rm || mode === 'user' ? 0
      : mode === 'idle' ? 1
      : programName === 'focus' || programName === 'shot' ? 0.5 : 0.35;
    driftAmt = rm ? 0 : driftAmt + (dTarget - driftAmt) * (1 - Math.exp(-dt * 0.7));
    if (driftAmt > 0.001) {
      const k = driftAmt, t = now;
      goal.yaw += k * (0.048 * Math.sin(t * 0.163) + 0.016 * Math.sin(t * 0.41 + 1.3));
      goal.pitch += k * 0.014 * Math.sin(t * 0.23 + 0.7);
      goal.dist *= 1 + k * 0.025 * Math.sin(t * 0.131 + 2.1);
      goal.tx += k * 0.28 * Math.sin(t * 0.107 + 0.4);
      goal.ty += k * 0.07 * Math.sin(t * 0.19 + 2.0);
      // beat sway: a pendulum over two beats, a slight lean-in per bar, louder = a touch more
      const sw = k * playF * (0.25 + 0.75 * lvl) * (1 + clamp(+frame.tutti || 0, 0, 1));
      goal.yaw += sw * 0.0095 * Math.sin(PI * beat);
      goal.ty += sw * 0.035 * Math.sin(PI * beat + 0.6);
      goal.dist *= 1 - sw * 0.012 * (0.5 - 0.5 * Math.cos(PI * beat * 0.5));
    }

    // --- rig -> goal position, kept inside the hall
    const cp = Math.cos(goal.pitch);
    gl.set(goal.tx, goal.ty, goal.tz);
    gp.set(goal.tx + goal.dist * Math.sin(goal.yaw) * cp, goal.ty + goal.dist * Math.sin(goal.pitch), goal.tz + goal.dist * Math.cos(goal.yaw) * cp);
    if (clampPos(gp, gl) && mode === 'user') {
      // the user pushed into a wall/floor/heads: adopt the clamped view so nothing winds up past it
      const dx = gp.x - gl.x, dy = gp.y - gl.y, dz = gp.z - gl.z, d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (d > 0.5) {
        userRig.yaw = Math.atan2(dx, dz); userRig.pitch = Math.asin(clamp(dy / d, -1, 1));
        userRig.dist = d; if (zoomGoal > d) zoomGoal = d;
      }
    }

    // --- springs
    if (snap) {
      P[0] = gp.x; P[1] = gp.y; P[2] = gp.z; L[0] = gl.x; L[1] = gl.y; L[2] = gl.z; F[0] = goal.fov;
      PV[0] = PV[1] = PV[2] = LV[0] = LV[1] = LV[2] = FV[0] = 0;
      snap = false;
    } else {
      const w = mode === 'user' ? 9 : 4.2;
      spring(P, PV, 0, gp.x, w, dt); spring(P, PV, 1, gp.y, w, dt); spring(P, PV, 2, gp.z, w, dt);
      spring(L, LV, 0, gl.x, w, dt); spring(L, LV, 1, gl.y, w, dt); spring(L, LV, 2, gl.z, w, dt);
      spring(F, FV, 0, goal.fov, 3.2, dt);
    }
    gp.set(P[0], P[1], P[2]); gl.set(L[0], L[1], L[2]);
    clampPos(gp, gl);
    camera.position.copy(gp);
    lookV.copy(gl);
    camera.lookAt(lookV);
    if (Math.abs(F[0] - lastFovSet) > 0.001) {
      camera.fov = F[0]; lastFovSet = F[0];
      camera.updateProjectionMatrix();
    }
  }

  // API calls can arrive before the first frame (a restored selection, say): no opening then,
  // start from the overview so the requested move has somewhere sensible to come from
  function syncAspect() {
    if (Math.abs(camera.aspect - aspect) > 0.004 || aspect === 0) {
      aspect = camera.aspect > 0 ? camera.aspect : 1.6;
      narrow = clamp((1.45 - aspect) / 0.8, 0, 1);
      relayout();
    }
  }
  function apiEnter() {
    rm = !!ctx.reducedMotion;
    syncAspect();
    if (!started) { started = true; copyRig(cur, rigs.overview); snap = true; mode = 'idle'; idleSince = now; }
  }

  function focus(target) {
    if (!target || !target.position) {
      // selection cleared: leave a focus/shot hold early; never cut short the opening or the user's view
      if (started && mode === 'program' && programName === 'focus') goOverview(3.2);
      return;
    }
    apiEnter();
    if (dragging || pinching) return; // the user is mid-gesture: leave the camera in their hands
    const p = target.position, label = target.label ? String(target.label) : '';
    if (/conduct/i.test(label) || (Math.abs(p.x) < 0.8 && Math.abs(p.z - 0.9) < 0.8)) { shot('conductor', { hold: FOCUS_HOLD }); focusLabel = label || 'conductor'; return; }
    const same = mode === 'program' && programName === 'focus' && focusPos.distanceToSquared(p) < 0.25;
    focusPos.copy(p); focusRadius = +target.radius || 1.4; focusLabel = label;
    if (same) { // the same thing again: just keep holding it
      if (steps[stepIdx].kind === HOLD) stepT0 = now;
      return;
    }
    layoutFocus();
    shotName = '';
    begin('focus', 'overview');
    addMove(focusRig, moveDur(focusRig));
    addHold(FOCUS_HOLD);
    run();
  }

  function shot(name, opts) {
    apiEnter();
    const key = SHOT_NAMES.includes(name) ? name : 'overview';
    if (key === 'overview') { goOverview(rm ? 0 : clamp(moveDur(rigs.overview), 2.2, 3.6)); return; }
    const hold = opts && opts.hold != null ? +opts.hold : SHOT_HOLD;
    shotName = key; focusLabel = '';
    begin('shot', 'overview');
    addMove(rigs[key], key === 'conductor' || key === 'audience' ? Math.max(3, moveDur(rigs[key])) : moveDur(rigs[key]));
    addHold(hold > 0 ? hold : Infinity);
    run();
  }

  function onTutti() {
    apiEnter();
    if (mode === 'user' && (dragging || pinching)) return;
    if (programName === 'tutti' && mode === 'program') return;
    if (now - lastTuttiAt < 6) return;
    lastTuttiAt = now; shotName = ''; focusLabel = '';
    begin('tutti', 'overview');
    if (rm) { addMove(rigs.tuttiCrane, 0); addHold(6); }
    else {
      addMove(rigs.tuttiCrane, 2.7, inOutCubic, 0, 0.5);    // crane up and out
      addMove(rigs.tuttiTrack, 8.5, inOutSine, 0, 0.15);    // sweep across the orchestra, pushing in, descending
      addHold(1.2);
    }
    run();
  }

  function reset() {
    apiEnter();
    lastResetAt = now; velYaw = velPitch = 0; dragging = pinching = false; userUntil = 0;
    if (mode === 'user') mode = 'idle';
    goOverview(rm ? 0 : 2.6);
  }

  function applyTheme(t) { tok = t || tok; } // the camera is theme-neutral; kept for the contract

  function getState() {
    return {
      mode, program: programName, step: mode === 'program' ? stepIdx : -1, shot: shotName, focus: focusLabel,
      userHold: mode === 'user' ? Math.max(0, +(userUntil - now).toFixed(2)) : 0,
      dragging, pinching, reducedMotion: rm, aspect: +aspect.toFixed(3), drift: +driftAmt.toFixed(2),
      position: [+P[0].toFixed(2), +P[1].toFixed(2), +P[2].toFixed(2)],
      target: [+L[0].toFixed(2), +L[1].toFixed(2), +L[2].toFixed(2)],
      fov: +F[0].toFixed(1), t: +now.toFixed(2), theme: tok && tok.theme,
    };
  }

  function dispose() {
    if (!canvas) return;
    canvas.removeEventListener('pointerdown', onDown);
    canvas.removeEventListener('pointermove', onMove);
    canvas.removeEventListener('wheel', onWheel);
    canvas.removeEventListener('dblclick', onDbl);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', onUp);
    window.removeEventListener('orch:theater', onTheater);
  }

  return { update, focus, onTutti, onUserInput, shot, reset, applyTheme, getState, dispose, shots: SHOT_NAMES.slice() };
}

export const SHOTS = SHOT_NAMES;
