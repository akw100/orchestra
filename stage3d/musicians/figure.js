// The performer: sculpted low-poly figure in concert black with articulated arms (2-bone IK),
// plus chairs, throne, bench and a music stand with a warm lamp. Origin at the feet, facing +Z.
import { T, MAT, S, TAU, clamp, geo, merge, cyl, box, ball, lathe, param, mesh } from './kit.js';

const SUIT = '#17161b', SHIRT = '#f4f1ea', SHOE = '#08080a', GOWN = '#141218';
export const L1 = 0.29, L2 = 0.27; // upper arm, forearm (m)
export const SHOULDER_Y = 0.48, SHOULDER_X = 0.19;
export const MOUTH = [0, 0.667, 0.1]; // torso space
const PROFILE = [[0, -0.03], [0.13, -0.03], [0.152, 0.06], [0.146, 0.18], [0.16, 0.3], [0.18, 0.4], [0.192, 0.47], [0.178, 0.52], [0.125, 0.556], [0.062, 0.572], [0.046, 0.6], [0, 0.6]];
const rAt = (y) => { for (let i = 1; i < PROFILE.length; i++) { const [r0, y0] = PROFILE[i - 1], [r1, y1] = PROFILE[i]; if (y <= y1 && y1 > y0) return r0 + (r1 - r0) * ((y - y0) / (y1 - y0)); } return 0.05; };

// ---------- body geometries (shared) ----------
function torsoGeo(kind) {
  return geo('torso-' + kind, () => {
    const body = lathe(PROFILE, 20).scale(1, 1, 0.64);
    // shirt front: a V-shaped curved panel that follows the chest
    const shirt = param(8, 8, (u, v, p) => {
      const y = 0.3 + v * 0.27, half = 0.03 + v * 0.42, a = (u * 2 - 1) * half, r = rAt(y) * 1.018;
      p.set(r * Math.sin(a), y, r * Math.cos(a) * 0.64 + 0.002);
    });
    const parts = [[body, SUIT], [shirt, SHIRT],
      [new T.TorusGeometry(0.05, 0.012, 6, 16).rotateX(Math.PI / 2).scale(1, 1, 0.8).translate(0, 0.575, 0.004), SHIRT]];
    const tie = kind === 'tails' ? SHIRT : SUIT;
    parts.push([new T.ConeGeometry(0.024, 0.042, 6).rotateZ(Math.PI / 2).translate(0.022, 0.548, 0.086), tie]);
    parts.push([new T.ConeGeometry(0.024, 0.042, 6).rotateZ(-Math.PI / 2).translate(-0.022, 0.548, 0.086), tie]);
    parts.push([ball(0.011, 0, 0.548, 0.09), tie]);
    if (kind === 'tails') { // tailcoat: two long tails behind + waistcoat hint
      for (const s of [-1, 1]) parts.push([box(0.11, 0.6, 0.016, 0, -0.27, 0, 0.1, 0, 0).translate(s * 0.062, 0.06, -0.095), SUIT]);
      parts.push([box(0.12, 0.08, 0.012, 0, 0.34, 0.112, 0.18), SHIRT]);
    } else {
      parts.push([box(0.035, 0.012, 0.004, 0.1, 0.43, 0.105, -0.12, 0.45), SHIRT]); // pocket square
    }
    return merge(parts, true);
  });
}
function legsGeo(kind) {
  return geo('legs-' + kind, () => {
    const p = [];
    if (kind === 'seated' || kind === 'wide') {
      const w = kind === 'wide' ? 0.13 : 0, kz = kind === 'wide' ? 0.39 : 0.43;
      p.push([ball(0.16, 0, 0.5, 0, 1, 0.55, 0.75), SUIT]);
      for (const s of [-1, 1]) {
        const kx = s * (0.11 + w), fx = s * (0.115 + w * 1.15);
        p.push([cyl([s * 0.095, 0.5, 0], [kx, 0.49, kz], 0.078, 0.063, 10), SUIT]);
        p.push([ball(0.063, kx, 0.49, kz), SUIT]);
        p.push([cyl([kx, 0.49, kz], [fx, 0.07, kz + 0.03], 0.057, 0.045, 10), SUIT]);
        p.push([ball(0.058, fx, 0.04, kz + 0.09, 0.85, 0.6, 2.0), SHOE]);
      }
    } else if (kind === 'gown') {
      p.push([lathe([[0, 0.98], [0.15, 0.97], [0.17, 0.8], [0.21, 0.45], [0.27, 0.06], [0.3, 0.0], [0, 0]], 20).scale(1, 1, 0.82), GOWN]);
      for (const s of [-1, 1]) p.push([ball(0.05, s * 0.09, 0.03, 0.24, 0.9, 0.6, 1.6), SHOE]);
    } else {
      p.push([ball(0.155, 0, 0.93, 0, 1, 0.55, 0.75), SUIT]);
      for (const s of [-1, 1]) {
        p.push([cyl([s * 0.09, 0.93, 0], [s * 0.1, 0.5, 0.02], 0.078, 0.062, 10), SUIT]);
        p.push([ball(0.062, s * 0.1, 0.5, 0.02), SUIT]);
        p.push([cyl([s * 0.1, 0.5, 0.02], [s * 0.105, 0.07, -0.01], 0.058, 0.046, 10), SUIT]);
        p.push([ball(0.058, s * 0.105, 0.04, 0.06, 0.85, 0.6, 2.0), SHOE]);
      }
    }
    return merge(p, true);
  });
}
const headGeo = () => geo('head', () => merge([
  ball(0.1, 0, 0.115, 0, 0.88, 1.06, 0.96, 20, 14),
  cyl([0, -0.03, -0.01], [0, 0.07, 0], 0.046, 0.042, 10),
  ball(0.017, 0, 0.11, 0.094, 0.8, 1.3, 1.1, 8, 6),
  ball(0.02, 0.087, 0.11, -0.005, 0.5, 1, 0.8, 8, 6), ball(0.02, -0.087, 0.11, -0.005, 0.5, 1, 0.8, 8, 6),
]));
const eyesGeo = () => geo('eyes', () => merge([ball(0.011, 0.031, 0.135, 0.082, 1, 1, 0.7, 8, 6), ball(0.011, -0.031, 0.135, 0.082, 1, 1, 0.7, 8, 6),
  box(0.026, 0.005, 0.006, 0.032, 0.155, 0.083, 0, 0, -0.12), box(0.026, 0.005, 0.006, -0.032, 0.155, 0.083, 0, 0, 0.12)]));
const mouthGeo = () => geo('mouth', () => ball(0.019, 0, 0, 0, 1.3, 1, 0.45, 10, 8));
const cap = (theta, s = 1) => new T.SphereGeometry(0.106 * s, 22, 12, 0, TAU, 0, theta).scale(0.9, 1.06, 1).translate(0, 0.121, -0.008);
const back = () => new T.SphereGeometry(0.104, 16, 8, Math.PI, Math.PI, 0.35 * Math.PI, 0.3 * Math.PI).scale(0.9, 1.06, 1).translate(0, 0.117, -0.006);
export const HAIR_STYLES = 6;
function hairGeo(style) {
  return geo('hair-' + style, () => {
    switch (style) {
      case 0: return merge([cap(0.42 * Math.PI), back()]); // short
      case 1: return merge([cap(0.5 * Math.PI), back(), ball(0.046, 0, 0.18, -0.1)]); // bun
      case 2: return merge([cap(0.5 * Math.PI), new T.CylinderGeometry(0.096, 0.112, 0.27, 16, 1, true, Math.PI / 2, Math.PI).translate(0, 0.0, -0.006)]); // long
      case 3: return merge([cap(0.45 * Math.PI), new T.SphereGeometry(0.111, 22, 6, Math.PI / 2 + 0.78, TAU - 1.56, 0.42 * Math.PI, 0.22 * Math.PI).scale(0.92, 1.08, 1.02).translate(0, 0.118, -0.006)]); // bob
      case 4: return merge([new T.SphereGeometry(0.104, 18, 8, 0, TAU, 0, 0.34 * Math.PI).scale(0.9, 1.06, 1).translate(0, 0.122, -0.022), back()]); // receding crop
      default: { // curls
        const p = [cap(0.47 * Math.PI, 1.04), back()];
        for (let i = 0; i < 9; i++) { const a = (i / 9) * TAU; p.push(ball(0.036, Math.sin(a) * 0.07, 0.19 + Math.cos(a * 2) * 0.01, Math.cos(a) * 0.07 - 0.02, 1, 0.8, 1, 8, 6)); }
        return merge(p);
      }
    }
  });
}
const upperGeo = () => geo('upper', () => merge([[ball(0.056, 0, 0, 0), SUIT], [cyl([0, 0, 0], [0, -L1, 0], 0.05, 0.043, 10), SUIT], [ball(0.044, 0, -L1, 0), SUIT]], true));
const foreGeo = () => geo('fore', () => merge([[cyl([0, 0, 0], [0, -L2 + 0.03, 0], 0.042, 0.035, 10), SUIT], [cyl([0, -L2 + 0.04, 0], [0, -L2 + 0.004, 0], 0.037, 0.036, 10), SHIRT]], true));
const handGeo = (s) => geo('hand' + s, () => merge([ball(0.041, 0, -0.05, 0, 0.8, 1.15, 0.46, 10, 8), ball(0.016, s * 0.03, -0.03, 0.012, 1, 2, 1, 8, 6)]));

// ---------- furniture ----------
export const chairGeo = () => geo('chair', () => {
  const frame = [];
  for (const [x, z] of [[-0.2, 0.17], [0.2, 0.17], [-0.2, -0.2], [0.2, -0.2]]) frame.push(cyl([x, 0, z], [x, 0.43, z * 0.95], 0.014, 0.016, 6));
  for (const x of [-0.2, 0.2]) frame.push(cyl([x, 0.43, -0.2], [x, 0.93, -0.27], 0.015, 0.013, 6));
  frame.push(box(0.44, 0.03, 0.4, 0, 0.425, -0.02));
  return { frame: merge(frame), pad: merge([box(0.43, 0.06, 0.4, 0, 0.465, -0.02), box(0.4, 0.27, 0.035, 0, 0.75, -0.245, -0.12)]) };
});
export const throneGeo = () => geo('throne', () => {
  const f = [cyl([0, 0, 0], [0, 0.44, 0], 0.02, 0.018, 8)];
  for (let i = 0; i < 3; i++) { const a = (i / 3) * TAU + 0.5; f.push(cyl([0, 0.18, 0], [Math.sin(a) * 0.3, 0, Math.cos(a) * 0.3], 0.011, 0.011, 5)); }
  return { frame: merge(f), pad: new T.CylinderGeometry(0.18, 0.17, 0.08, 20).translate(0, 0.47, 0) };
});
export const benchGeo = () => geo('bench', () => {
  const f = [];
  for (const [x, z] of [[-0.36, 0.13], [0.36, 0.13], [-0.36, -0.13], [0.36, -0.13]]) f.push(box(0.04, 0.42, 0.04, x, 0.21, z));
  f.push(box(0.82, 0.05, 0.34, 0, 0.43, 0));
  return { frame: merge(f), pad: box(0.8, 0.06, 0.33, 0, 0.47, 0) };
});
export function standGeo(H) {
  return geo('stand' + H, () => {
    const tilt = 0.38, f = [cyl([0, 0, 0], [0, H - 0.12, 0], 0.012, 0.01, 8)];
    for (let i = 0; i < 3; i++) { const a = (i / 3) * TAU; f.push(cyl([0, 0.2, 0], [Math.sin(a) * 0.27, 0.005, Math.cos(a) * 0.27], 0.008, 0.008, 5)); }
    const desk = box(0.5, 0.34, 0.01, 0, 0, 0).rotateY(Math.PI).rotateX(tilt).translate(0, H, 0);
    const ledge = box(0.5, 0.014, 0.05, 0, 0, -0.024).rotateX(tilt).translate(0, H - 0.17 * Math.cos(tilt), -0.17 * Math.sin(tilt));
    const arm = cyl([0, H + 0.15, 0.06], [0, H + 0.25, -0.06], 0.005, 0.005, 5);
    f.push(desk, ledge, arm);
    const paper = new T.PlaneGeometry(0.46, 0.31).rotateY(Math.PI).rotateX(tilt).translate(0, H + 0.004, -0.0085);
    const shade = new T.ConeGeometry(0.045, 0.05, 14, 1, true).rotateX(-0.9).translate(0, H + 0.235, -0.09);
    const bulb = ball(0.016, 0, H + 0.222, -0.098, 1, 1, 1, 10, 8);
    const glow = new T.PlaneGeometry(0.62, 0.44).rotateY(Math.PI).rotateX(tilt).translate(0, H + 0.01, -0.02);
    return { metal: merge([...f, shade]), paper, bulb, glow };
  });
}

// ---------- the figure ----------
// opts: {posture: 'seated'|'standing'|'gown', tone, hair, hairStyle, tails}
export class Figure {
  constructor(parent, opts) {
    const root = new T.Group(); root.name = 'figure'; parent.add(root);
    this.root = root; this.outlined = [];
    const standing = opts.posture === 'standing' || opts.posture === 'gown';
    this.hipY = standing ? 0.93 : 0.5;
    const legs = mesh(legsGeo(opts.posture), MAT.cloth, root); this.outlined.push(legs);
    const torso = new T.Group(); torso.position.set(0, this.hipY, 0); root.add(torso); this.torso = torso;
    this.body = mesh(torsoGeo(opts.tails ? 'tails' : 'suit'), MAT.cloth, torso); this.outlined.push(this.body);
    const head = new T.Group(); head.position.set(0, 0.6, 0.005); torso.add(head); this.head = head;
    const skin = MAT.skins[opts.tone % MAT.skins.length];
    this.outlined.push(mesh(headGeo(), skin, head));
    mesh(eyesGeo(), MAT.eye, head, false);
    this.hair = mesh(hairGeo(opts.hairStyle), MAT.hairs[opts.hair % MAT.hairs.length], head); this.outlined.push(this.hair);
    this.mouth = mesh(mouthGeo(), MAT.mouth, head, false); this.mouth.position.set(0, 0.066, 0.087); this.mouth.scale.set(1, 0.32, 1);
    this.arms = [1, -1].map((s) => { // index 0 = left (+X), 1 = right (-X)
      const sh = new T.Group(); sh.position.set(s * SHOULDER_X, SHOULDER_Y, 0); torso.add(sh);
      const up = mesh(upperGeo(), MAT.cloth, sh);
      const el = new T.Group(); el.position.set(0, -L1, 0); sh.add(el);
      const fo = mesh(foreGeo(), MAT.cloth, el);
      const wr = new T.Group(); wr.position.set(0, -L2, 0); el.add(wr);
      const hand = mesh(handGeo(s), skin, wr);
      this.outlined.push(up, fo);
      return { s, sh, el, wr, hand, t: new T.Vector3(s * 0.2, 0.05, 0.1), pole: new T.Vector3(s, -0.4, -0.3), space: 0, flex: 0 };
    });
    this.inv = new T.Matrix4();
    this.lean = 0; this.swayX = 0; this.swayZ = 0; this.turn = 0; this.lift = 0; this.breath = 0;
    this.headX = 0; this.headY = 0; this.headZ = 0;
    // selection shells (hidden until selected)
    this.shells = this.outlined.map((o) => { const sh = new T.Mesh(o.geometry, MAT.outline[0]); sh.visible = false; sh.castShadow = false; o.add(sh); return sh; });
    this.selLevel = -1;
  }
  setSelected(level) {
    const q = level < 0.06 ? -1 : Math.min(3, Math.floor(level * 4 - 0.001));
    if (q === this.selLevel) return; this.selLevel = q;
    for (const sh of this.shells) { sh.visible = q >= 0; if (q >= 0) sh.material = MAT.outline[q]; }
  }
  // hand target: space 0 = torso, 1 = root (figure) space
  target(i, x, y, z, space = 0) { const a = this.arms[i]; a.t.set(x, y, z); a.space = space; return a; }
  targetV(i, v, space = 0) { const a = this.arms[i]; a.t.copy(v); a.space = space; return a; }
  pole(i, x, y, z) { this.arms[i].pole.set(x, y, z); }
  applyBody() {
    const t = this.torso;
    t.position.y = this.hipY + this.lift;
    t.rotation.set(this.lean + this.swayX, this.turn, this.swayZ, 'YXZ');
    t.scale.set(1, 1 + this.breath, 1 + this.breath * 0.6);
    this.head.rotation.set(this.headX, this.headY, this.headZ, 'YXZ');
    t.updateMatrix(); this.inv.copy(t.matrix).invert();
  }
  solve() { for (const a of this.arms) solveArm(a, this.inv); }
}

// two-bone IK: shoulder basis from (upper arm dir, bend axis), elbow = rotation about local X
function solveArm(a, inv) {
  const tg = S.a.copy(a.t); if (a.space === 1) tg.applyMatrix4(inv);
  const Sp = a.sh.position, D = S.b.subVectors(tg, Sp);
  let d = D.length(); if (d < 1e-5) { D.set(0, -1, 0); d = 1e-5; }
  const dir = D.multiplyScalar(1 / d);
  d = clamp(d, 0.06, L1 + L2 - 0.002);
  let cosA = (L1 * L1 + d * d - L2 * L2) / (2 * L1 * d); cosA = clamp(cosA, -1, 1);
  const sinA = Math.sqrt(1 - cosA * cosA);
  const pole = S.c.copy(a.pole); pole.addScaledVector(dir, -pole.dot(dir));
  if (pole.lengthSq() < 1e-6) { pole.set(0, 0, -1).addScaledVector(dir, -dir.z); if (pole.lengthSq() < 1e-6) pole.set(1, 0, 0); }
  pole.normalize();
  const E = S.d.copy(Sp).addScaledVector(dir, L1 * cosA).addScaledVector(pole, L1 * sinA); // elbow
  const u = S.e.subVectors(E, Sp).normalize();
  const Tc = S.f.copy(Sp).addScaledVector(dir, d);
  const fdir = S.g.subVectors(Tc, E).normalize();
  const X = S.h.crossVectors(u, fdir);
  if (X.lengthSq() < 1e-8) X.crossVectors(u, pole);
  if (X.lengthSq() < 1e-8) X.set(1, 0, 0);
  X.normalize();
  const Y = S.u.copy(u).negate(), Z = S.w.crossVectors(X, Y);
  S.m.makeBasis(X, Y, Z); a.sh.quaternion.setFromRotationMatrix(S.m);
  const fy = fdir.dot(Y), fz = fdir.dot(Z);
  a.el.rotation.set(Math.atan2(-fz, -fy), 0, 0);
  a.wr.rotation.set(a.flex, 0, 0);
}
