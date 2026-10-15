// Pocket Orchestra 3D: built-in stand-ins for the sibling modules (hall, musicians, fx, post, director).
// index.js uses these whenever a real module is missing or throws, so the 3D stage always runs.
// They follow the Wave 4 contract (coordinates in meters, Y up, stage lip at z=0, audience at z>0).

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const ease = (cur, to, rate, dt) => cur + (to - cur) * (1 - Math.exp(-rate * dt));
const TIER_H = 0.32, C_Z = 1.6;
const R = (t) => 4.2 + 1.55 * t;
const MAX_A = (t) => 78 - 7 * t;

// ---------- hall: floor, risers, back wall, podium, simple velvet curtains ----------
function velvetTexture(THREE) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 4;
  const g = c.getContext('2d');
  for (let x = 0; x < 256; x++) {
    const f = 0.55 + 0.45 * Math.sin((x / 256) * Math.PI * 2 * 9) * 0.5 + 0.25 * Math.sin((x / 256) * Math.PI * 2 * 23);
    const v = Math.round(clamp(f, 0.15, 1) * 255);
    g.fillStyle = `rgb(${v},${v},${v})`; g.fillRect(x, 0, 1, 4);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function buildHall(ctx) {
  const { THREE, tok } = ctx;
  const group = new THREE.Group(); group.name = 'hall-stub';
  const floorMat = new THREE.MeshStandardMaterial({ color: tok.stageFloor || '#3b2415', roughness: 0.48, metalness: 0.05 });
  const floor = new THREE.Mesh(new THREE.BoxGeometry(19.4, 0.2, 12.6), floorMat);
  floor.position.set(0, -0.1, -4.9); floor.receiveShadow = true; group.add(floor);

  // riser tiers 1..4 as annular sectors (tier 0 is the stage floor itself)
  const riserMats = [];
  for (let t = 1; t <= 4; t++) {
    const r0 = R(t) - 0.78, r1 = R(t) + 0.77, A = (MAX_A(t) * Math.PI) / 180, seg = 48;
    const s = new THREE.Shape();
    for (let i = 0; i <= seg; i++) { const a = -A + (2 * A * i) / seg; s[i ? 'lineTo' : 'moveTo'](r1 * Math.sin(a), r1 * Math.cos(a)); }
    for (let i = seg; i >= 0; i--) { const a = -A + (2 * A * i) / seg; s.lineTo(r0 * Math.sin(a), r0 * Math.cos(a)); }
    const geo = new THREE.ExtrudeGeometry(s, { depth: TIER_H * t, bevelEnabled: false, curveSegments: 4 });
    geo.rotateX(-Math.PI / 2); // shape y -> -z, extrusion -> +y
    const mat = floorMat.clone(); mat.color.offsetHSL(0, 0, -0.03 * t);
    riserMats.push(mat);
    const m = new THREE.Mesh(geo, mat);
    m.position.z = C_Z; m.receiveShadow = true; m.castShadow = true;
    group.add(m);
  }

  const wallMat = new THREE.MeshStandardMaterial({ color: tok.velvetLo || '#2e0610', roughness: 0.9 });
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(26, 12), wallMat);
  wall.position.set(0, 5, -11.2); wall.receiveShadow = true; group.add(wall);

  const houseMat = new THREE.MeshStandardMaterial({ color: '#120a0b', roughness: 1 });
  const house = new THREE.Mesh(new THREE.PlaneGeometry(40, 30), houseMat);
  house.rotation.x = -Math.PI / 2; house.position.set(0, -1.1, 16.4); group.add(house);

  const gilt = new THREE.MeshStandardMaterial({ color: '#c99a3e', metalness: 1, roughness: 0.32 });
  const podium = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.55, 0.22, 32), floorMat);
  podium.position.set(0, 0.11, 0.9); podium.castShadow = true; podium.receiveShadow = true; group.add(podium);
  const rail = new THREE.Mesh(new THREE.TorusGeometry(0.52, 0.02, 8, 48), gilt);
  rail.rotation.x = Math.PI / 2; rail.position.set(0, 0.22, 0.9); group.add(rail);
  const lip = new THREE.Mesh(new THREE.BoxGeometry(19.4, 0.06, 0.06), gilt);
  lip.position.set(0, 0.0, 1.66); group.add(lip);

  // curtains: two panels pivoting at the outer edges, gathered toward the wings when open
  const tex = velvetTexture(THREE);
  const velMat = new THREE.MeshStandardMaterial({ color: tok.velvet || '#6a0f22', map: tex, roughness: 0.85, side: THREE.DoubleSide });
  const panels = [-1, 1].map((side) => {
    const pivot = new THREE.Group(); pivot.position.set(side * 9.9, 0, 0.3);
    const p = new THREE.Mesh(new THREE.PlaneGeometry(9.9, 8.6), velMat);
    p.position.set(-side * 4.95, 4.3, 0); p.castShadow = true;
    pivot.add(p); group.add(pivot); return pivot;
  });
  const valance = new THREE.Mesh(new THREE.BoxGeometry(20.4, 1.1, 0.3), velMat);
  valance.position.set(0, 8.4, 0.3); group.add(valance);
  const valGilt = new THREE.Mesh(new THREE.BoxGeometry(20.4, 0.08, 0.34), gilt);
  valGilt.position.set(0, 7.86, 0.3); group.add(valGilt);

  let open = 0, want = 0;
  const pose = () => panels.forEach((p) => { p.scale.x = 1 - 0.84 * open; p.children[0].position.z = Math.sin(open * Math.PI) * 0.15; });
  pose();

  return {
    group,
    spotAnchors: [],
    update(f) {
      const step = open < want ? 0.55 : 0.75;
      open = ctx.reducedMotion ? want : clamp(open + Math.sign(want - open) * Math.min(Math.abs(want - open), f.dt * step), 0, 1);
      pose();
    },
    setCurtains(o, opts = {}) { want = o ? 1 : 0; if (opts.instant) { open = want; pose(); } },
    applyTheme(tk) {
      floorMat.color.set(tk.stageFloor); riserMats.forEach((m, i) => { m.color.set(tk.stageFloor); m.color.offsetHSL(0, 0, -0.03 * (i + 1)); });
      wallMat.color.set(tk.theme === 'light' ? tk.velvet : tk.velvetLo); velMat.color.set(tk.velvet);
    },
  };
}

// ---------- musicians: capsule players with a hue-coloured instrument ----------
const STANDING = /glock|timpani|choir|voice|clap/;
function figure(THREE, standing, tok) {
  const g = new THREE.Group();
  const suit = new THREE.MeshStandardMaterial({ color: '#1c1620', roughness: 0.7 });
  const skin = new THREE.MeshStandardMaterial({ color: '#d9a27c', roughness: 0.6 });
  const H = standing ? 1.75 : 1.3;
  if (!standing) {
    const chair = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.06, 0.42), new THREE.MeshStandardMaterial({ color: '#2a1a12', roughness: 0.6 }));
    chair.position.y = 0.45; chair.castShadow = true; g.add(chair);
  }
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.19, standing ? 0.95 : 0.42, 4, 12), suit);
  torso.position.y = standing ? 0.78 : 0.78; torso.castShadow = true; g.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.12, 20, 14), skin);
  head.position.y = H - 0.12; head.castShadow = true; g.add(head);
  return { g, torso, head, H };
}

export function createMusician(ctx, { seat, inst }) {
  const { THREE, tok } = ctx;
  const id = inst?.id || seat.inst, hue = inst?.hue ?? 30;
  const standing = STANDING.test(id);
  const { g, torso, head, H } = figure(THREE, standing, tok);
  const col = new THREE.Color().setStyle(`hsl(${hue}, 70%, 55%)`);
  const instMat = new THREE.MeshStandardMaterial({ color: col, emissive: col.clone(), emissiveIntensity: 0, roughness: 0.35, metalness: 0.3 });
  const big = /cello|contrabass|harp|piano|timpani/.test(id);
  const instrument = new THREE.Mesh(big ? new THREE.BoxGeometry(0.45, 0.9, 0.25) : new THREE.BoxGeometry(0.34, 0.12, 0.12), instMat);
  instrument.position.set(0.08, big ? 0.62 : H - 0.42, 0.26); instrument.castShadow = true; g.add(instrument);
  const ringMat = new THREE.MeshBasicMaterial({ color: tok.accentHi || '#f2d99c', transparent: true, opacity: 0, depthWrite: false });
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.38, 0.46, 40), ringMat);
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.012; g.add(ring);
  let lit = 0, on = false, hit = 0, sel = 0, selT = 0, phase = Math.random() * 6;
  return {
    object3d: g,
    pickables: [torso, head, instrument],
    setActive(v) { on = !!v; },
    onNote(d) { hit = Math.max(hit, 0.6 + (d?.vel ?? 0.8) * 0.4); },
    setSelected(level) { selT = clamp(+level || 0, 0, 2) / 2; },
    update(f) {
      lit = ease(lit, on ? 1 : 0, on ? 5 : 2.4, f.dt); hit *= Math.exp(-7 * f.dt); sel = ease(sel, selT, 10, f.dt);
      instMat.emissiveIntensity = lit * 0.45 + hit * 1.4;
      const s = 1 + hit * 0.12; instrument.scale.set(s, s, s);
      head.position.y = H - 0.12 - hit * 0.03 + (on ? Math.sin(f.t * 2.2 + phase) * 0.012 : 0);
      torso.rotation.z = on ? Math.sin(f.t * 1.3 + phase) * 0.035 : 0;
      ringMat.opacity = sel * 0.85;
    },
    applyTheme(tk) { ringMat.color.set(tk.accentHi || tk.accent); },
    dispose() { g.traverse((o) => { o.geometry?.dispose?.(); }); },
  };
}

// 4/4 baton pattern: right-hand target angles per beat (shoulder pitch, yaw)
const PAT = [[-0.2, 0.0], [0.05, 0.55], [0.0, -0.6], [0.55, 0.1]];
export function createConductor(ctx) {
  const { THREE } = ctx;
  const { g, torso, head } = figure(THREE, true, ctx.tok);
  const arm = new THREE.Group(); arm.position.set(0.22, 1.42, 0.02); g.add(arm);
  const upper = new THREE.Mesh(new THREE.CapsuleGeometry(0.05, 0.42, 4, 8), torso.material);
  upper.rotation.x = Math.PI / 2; upper.position.z = 0.25; arm.add(upper);
  const baton = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.01, 0.42, 6), new THREE.MeshStandardMaterial({ color: '#fffaf0', emissive: '#fff2c4', emissiveIntensity: 0.4 }));
  baton.rotation.x = Math.PI / 2; baton.position.z = 0.68; arm.add(baton);
  let from = [0.3, 0], to = [0.3, 0], t0 = 0, dur = 0.6, now = 0, active = 0;
  return {
    object3d: g,
    pickables: [torso, head, upper],
    onBeat(d) {
      const p = PAT[(d?.beat ?? 0) % 4];
      from = [arm.rotation.x, arm.rotation.y]; to = p; t0 = now; dur = 0.42; active = 1;
    },
    update(f) {
      now = f.t; active = ease(active, f.playing ? 1 : 0, 2, f.dt);
      const k = clamp((now - t0) / dur, 0, 1), e = k * k * (3 - 2 * k);
      const rest = [0.35, 0.05];
      arm.rotation.x = (from[0] + (to[0] - from[0]) * e) * active + rest[0] * (1 - active);
      arm.rotation.y = (from[1] + (to[1] - from[1]) * e) * active + rest[1] * (1 - active);
    },
    applyTheme() {},
  };
}

// ---------- fx: nothing (the real fx.js adds particles) ----------
export function createFX() { return { emit() {}, update() {}, applyTheme() {} }; }

// ---------- post: plain render ----------
export function createPost(ctx) {
  return { render() { ctx.renderer.render(ctx.scene, ctx.camera); }, setSize() {}, applyTheme() {} };
}

// ---------- director: a slow drifting house-centre camera that leans toward the selection ----------
export function createDirector(ctx) {
  const { THREE, camera } = ctx;
  const look = new THREE.Vector3(0, 1.3, -3.6), lookTo = look.clone(), home = look.clone();
  let push = 0, focusAmt = 0;
  return {
    update(f) {
      const back = clamp(1.6 / Math.max(0.3, camera.aspect), 1, 2.4);
      push = ease(push, f.tutti > 0.5 ? 1 : 0, 0.6, f.dt);
      look.lerp(lookTo, 1 - Math.exp(-2 * f.dt));
      const drift = ctx.reducedMotion ? 0 : 1;
      camera.position.set(Math.sin(f.t * 0.06) * 0.8 * drift + (look.x - home.x) * 0.25, 5.2 + 0.4 * back - push * 0.4, 14.2 * back - push * 1.6 - focusAmt * 2);
      camera.lookAt(look);
    },
    focus(target) {
      if (target?.position) { lookTo.copy(target.position).lerp(home, 0.45); focusAmt = 1; }
      else { lookTo.copy(home); focusAmt = 0; }
    },
    onTutti() {},
    onUserInput() {},
    applyTheme() {},
  };
}
