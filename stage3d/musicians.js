// Pocket Orchestra — 3D musicians + conductor (Wave 4, module C).
//
//   createMusician(ctx, { seat, inst }) -> { object3d, pickables, setActive(on), onNote(detail),
//                                            setSelected(level), update(frame), applyTheme(tok), dispose() }
//   createConductor(ctx) -> { object3d, pickables, onBeat({beat, bar}), update(frame), applyTheme(tok), batonTip }
//
// Origin at the feet, facing local +Z (the core positions/rotates object3d; we only animate children).
// Geometry and materials are module-level caches shared by every seat; no per-frame allocations.
import { T, MAT, S, TAU, clamp, lerp, smooth, hash, spring, sp, init, applySharedTheme, ensureEnv, instMat, mesh, geo, basisQuat, pose, xf, box, merge as mergeGeos } from './musicians/kit.js';
import { Figure, HAIR_STYLES, MOUTH, chairGeo, throneGeo, benchGeo, standGeo } from './musicians/figure.js';
import * as I from './musicians/instruments.js';

const RIG_OF = {
  violin: 'violin', viola: 'violin', cello: 'cello', contrabass: 'cello', flute: 'flute', clarinet: 'clarinet', oboe: 'clarinet', bassoon: 'clarinet',
  trumpet: 'trumpet', trombone: 'trumpet', tuba: 'horn', horn: 'horn', harp: 'harp', piano: 'piano', celesta: 'piano', glockenspiel: 'glock', xylophone: 'glock', marimba: 'glock', vibraphone: 'glock',
  timpani: 'timpani', choir: 'choir', kick: 'kick', snare: 'snare', hihat: 'hihat', toms: 'toms', cymbals: 'cymbals', claps: 'claps',
};
const FAMILY_RIG = { strings: 'violin', woodwinds: 'clarinet', brass: 'trumpet', keys: 'piano', percussion: 'timpani', drums: 'snare', voices: 'choir' };
const LIVE = new Set(); // active musicians (the conductor leans toward them)
const Y = () => new T.Vector3();

// ---------------------------------------------------------------- helpers
function addParts(parts, parent, matOf = {}) {
  const out = {};
  for (const [k, g] of Object.entries(parts)) {
    if (!g || !g.isBufferGeometry) continue;
    const m = matOf[k] || MAT[k]; if (!m) continue;
    out[k] = mesh(g, m, parent);
  }
  return out;
}
const bowQuatLocal = (side) => { // bow frame (X along stick to tip, Y = stick above hair) inside the instrument frame
  S.m.makeBasis(new T.Vector3(-side, 0, 0), new T.Vector3(0, 0, 1), new T.Vector3(-side, 0, 0).cross(new T.Vector3(0, 0, 1)));
  return new T.Quaternion().setFromRotationMatrix(S.m);
};
function axisQuat(tipDir, upHint) { // local X -> tipDir, local Y ~ upHint
  const X = new T.Vector3(...tipDir).normalize(), Yv = new T.Vector3(...upHint);
  Yv.addScaledVector(X, -Yv.dot(X)).normalize();
  S.m.makeBasis(X, Yv, new T.Vector3().crossVectors(X, Yv)); return new T.Quaternion().setFromRotationMatrix(S.m);
}
// point a stick-like object (local +Y) from a to b
function aim(obj, a, b) { obj.position.copy(a); S.u.subVectors(b, a).normalize(); obj.quaternion.setFromUnitVectors(S.up, S.u); }
const WHITE_OF = [0, 0, 1, 1, 2, 3, 3, 4, 4, 5, 5, 6];
const isBlack = (pc) => pc === 1 || pc === 3 || pc === 6 || pc === 8 || pc === 10;
const wIdx = (m) => Math.floor(m / 12) * 7 + WHITE_OF[((m % 12) + 12) % 12];

// ---------------------------------------------------------------- held instruments (torso space)
function heldRig(geoFn, cfg) {
  return {
    posture: 'seated', seat: 'chair', stand: 1.0,
    build(m) {
      m.hold = new T.Group(); m.fig.torso.add(m.hold); m.qP = new T.Quaternion();
      m.parts = addParts(geoFn(), m.hold);
      m.hold.scale.setScalar(cfg.scale || 1);
      m.play = cfg.play(m); m.rest = cfg.rest(m);
      m.lift = sp(0); m.phr = sp(0); m.flut = 0;
      m.vL = Y(); m.vR = Y();
      m.copy(m.rest);
    },
    pose(m, f, dt) {
      const a = smooth(m.act.x), t = f.t;
      spring(m.lift, 0, 9, dt, 0.45);
      const pl = m.play;
      if (cfg.dynamic) cfg.dynamic(m, pl); // e.g. bell lift recomputes the play quaternion
      m.hold.position.lerpVectors(m.rest.p, pl.p, a);
      m.hold.quaternion.slerpQuaternions(m.rest.q, pl.q, a);
      const sc = m.hold.scale;
      for (let i = 0; i < 2; i++) {
        const h = cfg.hands[i], v = i ? m.vR : m.vL;
        xf(v, m.hold.position, m.hold.quaternion, sc, h[0], h[1], h[2]);
        m.fig.targetV(i, v, 0); m.fig.pole(i, ...cfg.poles[i]);
        m.fig.arms[i].flex = (cfg.flex?.[i] || 0) + Math.sin(t * 41 + i * 2.1) * 0.12 * m.noteEnv * a;
      }
      // winds sway with the phrase; brass lean back on the bell lift
      spring(m.phr, 0, 1.6, dt, 0.35);
      const sw = Math.sin(t * 0.9 + m.ph) * 0.035 * a;
      m.fig.swayZ = sw + m.phr.x * 0.06; m.fig.lean = 0.03 + 0.03 * a - m.lift.x * 0.08 + m.phr.x * 0.03;
      m.fig.turn = Math.sin(t * 0.55 + m.ph) * 0.05 * a;
      m.fig.headX = (cfg.headX ?? -0.06) * a + 0.05 * (1 - a); m.fig.headY = (cfg.headY || 0) * a; m.fig.headZ = (cfg.headZ || 0) * a;
    },
    note(m, d) {
      m.lift.v += (cfg.liftKick || 0) * (0.5 + d.vel);
      m.phr.v += (m.k % 2 ? -1 : 1) * (0.6 + d.vel) * 0.8 * (Math.sin(m.t * 1.3 + m.ph) > 0 ? 1 : -1);
    },
  };
}
const fluteRig = heldRig(I.flute, {
  play: () => pose(MOUTH.map((v, i) => v + [0, -0.019, 0.016][i]), [0, 0, 0], [-1, -0.16, 0.32], [0, 1, 0.12]),
  rest: () => pose([-0.13, 0.64, 0.32], [0, 0, 0], [-0.05, -1, 0.14], [0, 0, 1]),
  hands: [[0, 0.16, -0.012], [0, 0.43, -0.012]], poles: [[0.4, -1, -0.2], [-0.6, -1, 0.2]], headZ: -0.1, headX: -0.02,
});
const clarinetRig = heldRig(I.clarinet, {
  play: () => pose(MOUTH.map((v, i) => v + [0, -0.008, 0.012][i]), [0, 0, 0], [0, -0.84, 0.54], [0, 0.5, 0.86]),
  rest: () => pose([-0.09, 0.72, 0.33], [0, 0, 0], [0, -1, 0.12], [0, 0.1, 1]),
  hands: [[0, 0.25, -0.012], [0, 0.47, -0.012]], poles: [[1, -0.5, -0.2], [-1, -0.5, -0.2]], headX: 0.05,
});
const trumpetRig = heldRig(I.trumpet, {
  play: (m) => ({ p: new T.Vector3(...MOUTH).add(new T.Vector3(0, -0.004, 0.012)), q: basisQuat([0, -0.1, 1], [0, 1, 0.1], m.qP) }),
  rest: () => pose([-0.15, 0.13, 0.22], [0, 0, 0], [0.05, 0.4, 0.92], [-1, 0, 0]),
  hands: [[-0.04, 0.165, 0.05], [0, 0.155, 0.13]], poles: [[1, -0.6, -0.3], [-1, -0.8, -0.2]], flex: [0, 0.4],
  dynamic: (m, pl) => basisQuat([0, -0.1 + m.lift.x * 0.3, 1], [0, 1, 0.1 - m.lift.x * 0.3], pl.q), liftKick: 2.2, headX: -0.08 * 0,
});
const hornRig = heldRig(I.horn, {
  play: (m) => ({ p: new T.Vector3(...MOUTH).add(new T.Vector3(0, 0, 0.01)), q: m.qP.identity() }),
  rest: () => ({ p: new T.Vector3(0.02, 0.38, 0.18), q: new T.Quaternion().setFromEuler(new T.Euler(0.55, 0, 0.1)) }),
  hands: [I.HORN_VALVE, I.HORN_BELL], poles: [[1, -0.4, -0.2], [-1, -0.6, -0.4]],
  dynamic: (m, pl) => pl.q.setFromAxisAngle(S.X.set(1, 0, 0), -m.lift.x * 0.28), liftKick: 1.6, headX: 0.04,
});

// ---------------------------------------------------------------- bowed strings
function bowedRig(big) {
  const isBass = big === 'bass', isCello = big === 'cello';
  const sc = isBass ? new T.Vector3(2.9, 2.9, 4.3) : isCello ? new T.Vector3(2.1, 2.1, 3.2) : null;
  const side = big ? -1 : 1;
  return {
    posture: isBass ? 'standing' : isCello ? 'wide' : 'seated', seat: isBass ? null : 'chair', stand: isBass ? 1.32 : 1.0,
    build(m) {
      const parent = big ? m.object3d : m.fig.torso, s1 = m.inst.id === 'viola' ? 1.12 : 1;
      m.space = big ? 1 : 0;
      m.hold = new T.Group(); parent.add(m.hold);
      m.parts = addParts(I.violin(), m.hold);
      if (big) { m.hold.scale.copy(sc); mesh(I.endpin(), MAT.silver, m.hold); } else m.hold.scale.setScalar(s1);
      m.sc = m.hold.scale.clone();
      if (isBass) { m.play = pose([0.07, 0, 0.36], [0, -0.36, 0], [0.16, 1, -0.3], [-0.35, 0.25, 1], 2.9); m.rest = pose([0.08, 0, 0.42], [0, -0.36, 0], [0.1, 1, -0.12], [-0.2, 0.1, 1], 2.9); }
      else if (isCello) { m.play = pose([0.03, 0, 0.53], [0, -0.36, 0], [0.13, 1, -0.4], [-0.25, 0.35, 1], 2.1); m.rest = pose([0.05, 0, 0.62], [0, -0.36, 0], [0.1, 1, -0.16], [-0.1, 0.15, 1], 2.1); }
      else {
        m.play = pose([0.105, 0.565, 0.085], [0, -0.15, 0], [0.7, 0.14, 0.7], [-0.5, 0.86, 0], s1);
        m.rest = pose([0.16, 0.06, 0.3], [0, -0.15, 0], [0.05, 1, 0.18], [0, -0.18, 1], s1);
      }
      m.bow = new T.Group(); parent.add(m.bow); addParts(I.bow(), m.bow);
      m.bowL = bowQuatLocal(side); m.bowQ = new T.Quaternion();
      m.bowRest = big ? { p: new T.Vector3(-0.22, isBass ? 0.86 : 0.56, 0.3), q: axisQuat([0.25, -0.6, 0.75], [0, 1, 0]) }
        : { p: new T.Vector3(-0.15, 0.13, 0.3), q: axisQuat([0.3, -0.32, 0.9], [0, 1, 0]) };
      m.bs = 0.3; m.bt = 0.3; m.bspd = 0; m.bdir = 1; m.neck = sp(0); m.neckT = 0; m.vL = Y(); m.vR = Y(); m.vF = Y();
      m.copy(m.rest);
    },
    pose(m, f, dt) {
      const a = smooth(m.act.x), t = f.t;
      m.hold.position.lerpVectors(m.rest.p, m.play.p, a);
      m.hold.quaternion.slerpQuaternions(m.rest.q, m.play.q, a);
      // bow travel
      const dd = m.bt - m.bs, st = m.bspd * dt;
      m.bs = Math.abs(dd) <= st ? m.bt : m.bs + Math.sign(dd) * st;
      const range = big ? (isBass ? 0.42 : 0.46) : 0.6, s = lerp(0.1, range, m.bs);
      const C = I.VIOLIN_CONTACT, q = m.hold.quaternion, sc_ = m.sc;
      S.a.set(C[0] * sc_.x + side * s, C[1] * sc_.y, C[2] * sc_.z + 0.0155).applyQuaternion(q).add(m.hold.position);
      m.bowQ.multiplyQuaternions(q, m.bowL);
      m.bow.position.lerpVectors(m.bowRest.p, S.a, a);
      m.bow.quaternion.slerpQuaternions(m.bowRest.q, m.bowQ, a);
      // right hand at the frog, left hand on the neck (shifts with pitch, vibrato while a note sounds)
      S.b.set(0.035, 0.012, 0).applyQuaternion(m.bow.quaternion).add(m.bow.position);
      m.vR.copy(S.b);
      spring(m.neck, m.neckT, 10, dt);
      const ny = I.VIOLIN_NECK_Y - m.neck.x * 0.09 + Math.sin(t * 37) * 0.0035 * m.noteEnv * a / (sc_.y);
      xf(m.vL, m.hold.position, q, sc_, 0.0, ny, -0.004);
      m.fig.targetV(0, m.vL, m.space); m.fig.targetV(1, m.vR, m.space);
      if (big) { m.fig.pole(0, 1, -0.2, -0.3); m.fig.pole(1, -1, -0.1, -0.4); }
      else { m.fig.pole(0, 0.15, -1, 0.1); m.fig.pole(1, -1, -0.5, -0.15); }
      m.fig.arms[0].flex = 0.25 * a; m.fig.arms[1].flex = 0.15 * a;
      // body
      const sway = (m.bs - 0.5) * 0.05 * a;
      m.fig.lean = (big ? 0.13 : 0.05) * a + 0.02; m.fig.swayZ = sway + Math.sin(t * 0.8 + m.ph) * 0.02 * a;
      m.fig.turn = (big ? -0.12 : 0.04) * a + sway * 0.6;
      if (big) { m.fig.headX = 0.14 * a; m.fig.headY = 0.25 * a; m.fig.headZ = 0.06 * a; }
      else { m.fig.headX = 0.12 * a; m.fig.headY = 0.3 * a; m.fig.headZ = -0.24 * a; }
    },
    note(m, d) {
      m.bdir = -m.bdir;
      const amp = 0.25 + 0.5 * clamp(d.vel ?? 0.8, 0, 1);
      m.bt = clamp(m.bdir > 0 ? 0.5 + amp * 0.75 : 0.5 - amp * 0.75, 0, 1);
      m.bspd = Math.abs(m.bt - m.bs) / clamp((d.dur || 0.4) * 0.92, 0.1, 2.6);
      const lo = big ? (isBass ? 28 : 36) : m.inst.id === 'viola' ? 48 : 55;
      m.neckT = clamp((d.midi - lo - 7) / 22, 0, 1);
    },
  };
}

// ---------------------------------------------------------------- harp
const harpRig = {
  posture: 'wide', seat: 'chair', stand: null,
  build(m) {
    m.harp = new T.Group(); m.harp.position.set(-0.07, 0, 0.08); m.harp.scale.setScalar(0.9); m.object3d.add(m.harp);
    addParts(I.harp(), m.harp);
    const N = I.HARP_N, g = geo('harpstr', () => new T.CylinderGeometry(0.0016, 0.0016, 1, 4, 1));
    m.str = new T.InstancedMesh(g, MAT.gut, N); m.str.castShadow = false; m.harp.add(m.str);
    m.sBase = []; m.sTop = []; m.amp = new Float32Array(N); m.strCol = [];
    const p = Y();
    for (let i = 0; i < N; i++) {
      const top = I.harpString(i, p); m.sBase.push(p.clone()); m.sTop.push(top);
      const deg = i % 7, c = new T.Color(deg === 0 ? '#c0283a' : deg === 3 ? '#23347a' : '#efe3c4');
      m.strCol.push(c); m.str.setColorAt(i, c);
    }
    m.strDirty = true; m.hand = [sp(26), sp(8)]; m.pl = [sp(0), sp(0)]; m.vL = Y(); m.vR = Y(); m.gold = new T.Color('#ffd27a');
    m.updStrings = (t) => {
      for (let i = 0; i < N; i++) {
        const b = m.sBase[i], len = m.sTop[i] - b.y, a = m.amp[i];
        S.m.makeScale(1, len, 1); S.m.setPosition(b.x + Math.sin(t * 96 + i * 1.7) * a * 0.0045, b.y + len / 2, b.z);
        m.str.setMatrixAt(i, S.m);
        S.col.copy(m.strCol[i]).lerp(m.gold, Math.min(1, a * 1.4)); m.str.setColorAt(i, S.col);
      }
      m.str.instanceMatrix.needsUpdate = true; m.str.instanceColor.needsUpdate = true;
    };
    m.updStrings(0);
  },
  pose(m, f, dt) {
    const a = smooth(m.act.x), t = f.t;
    let any = m.strDirty; m.strDirty = false;
    for (let i = 0; i < I.HARP_N; i++) if (m.amp[i] > 0.002) { m.amp[i] *= Math.exp(-dt * 2.2); any = true; } else if (m.amp[i]) { m.amp[i] = 0; any = true; }
    if (any) m.updStrings(t);
    m.harp.rotation.x = -0.05 * a;
    for (let h = 0; h < 2; h++) {
      const s = spring(m.hand[h], m.hand[h].goal ?? (h ? 8 : 26), 14, dt);
      const pl = spring(m.pl[h], 0, 18, dt, 0.5);
      const i = clamp(Math.round(s), 0, I.HARP_N - 1), b = m.sBase[i], len = m.sTop[i] - b.y;
      const sgn = h ? -1 : 1, v = h ? m.vR : m.vL;
      v.set(sgn * (0.05 + pl * 0.05), b.y + len * 0.45 + pl * 0.03 + Math.sin(t * 1.3 + h) * 0.01, b.z - 0.01);
      v.applyEuler(m.harp.rotation).multiplyScalar(0.9).add(m.harp.position);
      S.b.set(sgn * 0.14, 0.6, 0.3);
      v.lerpVectors(S.b, v, a);
      m.fig.targetV(h, v, 1); m.fig.pole(h, sgn, -0.3, -0.4);
      m.fig.arms[h].flex = -0.3 * a - pl * 0.4;
    }
    m.fig.lean = 0.06 * a; m.fig.swayZ = Math.sin(t * 0.7 + m.ph) * 0.025 * a; m.fig.turn = 0.08 * a;
    m.fig.headX = 0.1 * a; m.fig.headY = 0.22 * a;
  },
  note(m, d) {
    const i = clamp(Math.round(((d.midi - 36) / 52) * (I.HARP_N - 1)), 0, I.HARP_N - 1);
    m.amp[i] = Math.max(m.amp[i], 0.5 + (d.vel ?? 0.8) * 0.5);
    if (i > 0) m.amp[i - 1] = Math.max(m.amp[i - 1], 0.25); if (i < I.HARP_N - 1) m.amp[i + 1] = Math.max(m.amp[i + 1], 0.25);
    const h = i < I.HARP_N * 0.45 ? 1 : 0;
    m.hand[h].goal = i; m.pl[h].v += 6 + 6 * (d.vel ?? 0.8);
  },
};

// ---------------------------------------------------------------- piano
const pianoRig = {
  posture: 'seated', seat: 'bench', stand: null,
  build(m) {
    const P = I.piano();
    m.pn = new T.Group(); m.object3d.add(m.pn);
    addParts({ lacquer: P.lacquer, gold: P.gold, string: P.string, prop: P.prop }, m.pn, { prop: MAT.lacquer, string: MAT.chrome });
    m.lid = new T.Group(); m.lid.position.set(0.75, 0.988, 0); m.lid.rotation.z = I.PIANO_LID_ANGLE; m.pn.add(m.lid); mesh(P.lid, MAT.lacquer, m.lid);
    const paper = mesh(geo('pianoPaper', () => new T.PlaneGeometry(0.5, 0.2).rotateY(Math.PI).rotateX(0.25).translate(...I.PIANO_PAPER)), MAT.paper, m.pn, false); paper.renderOrder = 1;
    m.wk = new T.InstancedMesh(P.white, MAT.ivory, 52); m.bk = new T.InstancedMesh(P.black, MAT.ebony, 36);
    m.wk.castShadow = m.bk.castShadow = false; m.pn.add(m.wk, m.bk);
    m.dep = new Map(); // midi -> {x: depress, until}
    m.setKey = (midi, d) => {
      const k = I.PIANO_MAP[midi]; if (!k) return;
      S.m.makeRotationX(d * 0.06);
      if (k.black) S.m.setPosition(k.x, I.PIANO_KEY_Y + 0.012 - d * 0.008, I.PIANO_KEY_Z + 0.07);
      else S.m.setPosition(k.x, I.PIANO_KEY_Y - 0.011 - d * 0.009, I.PIANO_KEY_Z + 0.035);
      (k.black ? m.bk : m.wk).setMatrixAt(k.i, S.m);
    };
    for (let n = 21; n <= 108; n++) m.setKey(n, 0);
    m.hx = [sp(0.12), sp(-0.12)]; m.hl = [sp(0.05), sp(0.05)]; m.hz = [0, 0]; m.vL = Y(); m.vR = Y();
  },
  pose(m, f, dt) {
    const a = smooth(m.act.x), t = f.t;
    if (m.dep.size) {
      for (const [midi, s] of m.dep) {
        spring(s, t < s.until ? 1 : 0, 40, dt);
        if (t >= s.until && s.x < 0.01) { m.setKey(midi, 0); m.dep.delete(midi); } else m.setKey(midi, clamp(s.x, 0, 1.2));
      }
      m.wk.instanceMatrix.needsUpdate = true; m.bk.instanceMatrix.needsUpdate = true;
    }
    let cx = 0;
    for (let h = 0; h < 2; h++) {
      const x = spring(m.hx[h], m.hx[h].goal ?? (h ? -0.14 : 0.14), 16, dt);
      const hov = 0.035 + Math.max(0, Math.sin(f.beat * Math.PI * 2 + h * 2)) * 0.015;
      const l = spring(m.hl[h], hov, 26, dt, 0.6);
      if (m.hl[h].x < 0) { m.hl[h].x = 0; m.hl[h].v = Math.abs(m.hl[h].v) * 0.25; }
      const v = h ? m.vR : m.vL;
      v.set(x, I.PIANO_KEY_Y + 0.045 + l, I.PIANO_KEY_Z + 0.0 + m.hz[h]);
      S.b.set(h ? -0.13 : 0.13, 0.6, 0.32); v.lerpVectors(S.b, v, a);
      m.fig.targetV(h, v, 1); m.fig.pole(h, h ? -1 : 1, -0.6, -0.5);
      m.fig.arms[h].flex = 0.35 * a - l * 3;
      cx += x;
    }
    m.fig.lean = 0.1 * a + 0.02; m.fig.turn = -cx * 0.25 * a; m.fig.swayZ = -cx * 0.12 * a + Math.sin(t * 0.7 + m.ph) * 0.02 * a;
    m.fig.headX = 0.22 * a; m.fig.headY = -cx * 0.3 * a;
  },
  note(m, d) {
    const k = I.PIANO_MAP[clamp(d.midi, 21, 108)]; if (!k) return;
    const h = d.midi < 60 ? 0 : 1, vel = d.vel ?? 0.8;
    m.hx[h].goal = k.x; m.hz[h] = k.black ? 0.05 : 0;
    m.hl[h].v -= 1.6 + vel * 2.2;
    let s = m.dep.get(d.midi); if (!s) { s = sp(0); m.dep.set(d.midi, s); }
    s.until = m.t + Math.max(0.08, (d.dur || 0.3) * 0.9); s.v += 30;
  },
};

// ---------------------------------------------------------------- mallets & sticks (glock, timpani, drum kit)
function makeSticks(m, kind) {
  const parts = kind === 'stick' ? I.stick() : kind === 'felt' ? I.mallet(0.026, 0.36) : I.mallet(0.017, 0.31);
  m.sticks = [0, 1].map(() => {
    const g = new T.Group(); m.object3d.add(g);
    addParts(parts, g, { head: kind === 'felt' ? MAT.felt : MAT.rubber });
    return g;
  });
  m.len = kind === 'stick' ? 0.36 : kind === 'felt' ? 0.36 : 0.31;
  m.hs = [0, 1].map((h) => ({ p: new T.Vector3(h ? -0.1 : 0.1, 0.9, 0.4), goal: new T.Vector3(h ? -0.1 : 0.1, 0.9, 0.4), lift: sp(0.1), last: -9, off: new T.Vector3(h ? -0.06 : 0.06, 0.09, -0.3) }));
  m.side = 0; m.tip = Y(); m.hnd = Y();
}
// position sticks + hand targets; strike surfaces come from rig state
function poseSticks(m, f, dt, restL, restR, hover = 0.08) {
  const a = smooth(m.act.x);
  const ph = (f.beat * 2) % 1, antic = ph > 0.55 ? smooth((ph - 0.55) / 0.45) : 0;
  for (let h = 0; h < 2; h++) {
    const s = m.hs[h];
    s.p.lerp(s.goal, 1 - Math.exp(-dt * 22));
    const tgt = (hover + antic * 0.06 * (h === m.side ? 1 : 0.4)) * a;
    spring(s.lift, tgt, 30, dt, 0.55);
    if (s.lift.x < 0) { s.lift.x = 0; s.lift.v = Math.abs(s.lift.v) * 0.35; }
    const L = s.lift.x;
    m.tip.copy(s.p); m.tip.y += L + 0.012;
    m.hnd.copy(s.p).add(s.off); m.hnd.y += L * 0.7;
    const rest = h ? restR : restL;
    m.hnd.lerpVectors(rest, m.hnd, a);
    S.c.subVectors(m.tip, m.hnd);
    if (a < 0.999) { S.d.set(h ? -0.1 : 0.1, -0.2, 1).normalize().multiplyScalar(m.len); S.c.lerpVectors(S.d, S.c, a); m.tip.copy(m.hnd).add(S.c); }
    aim(m.sticks[h], m.hnd, m.tip);
    m.fig.targetV(h, m.hnd, 1); m.fig.pole(h, h ? -1 : 1, -0.7, -0.3);
    m.fig.arms[h].flex = -0.2 - L * 2.5;
  }
}
function strike(m, h, point, vel, offset) {
  const s = m.hs[h]; s.goal.copy(point); if (offset) s.off.copy(offset);
  s.lift.v -= 2.4 + 3.2 * clamp(vel, 0.1, 1); s.last = m.t; m.side = h ^ 1;
}
const pickHand = (m, pref) => (m.t - m.hs[pref].last < 0.09 ? pref ^ 1 : pref);

const glockRig = {
  posture: 'standing', seat: null, stand: null,
  build(m) {
    const G = I.glock(); addParts({ ebony: G.ebony, rubber: G.rubber }, m.object3d);
    const nat = I.GLOCK_N, sh = I.GLOCK_SHARPS.length;
    m.bars = new T.InstancedMesh(G.bar, MAT.silver, nat + sh); m.bars.castShadow = false; m.object3d.add(m.bars);
    m.barPos = []; m.flash = new Float32Array(nat + sh); m.barCol = new T.Color('#ffffff'); m.hot = new T.Color('#ffd27a');
    for (let i = 0; i < nat; i++) { const len = 0.2 - i * 0.0062; m.barPos.push([I.glockBarX(i), 0.856, 0.415, len]); }
    I.GLOCK_SHARPS.forEach((j) => { const len = 0.15 - j * 0.004; m.barPos.push([I.glockBarX(j) - 0.0235, 0.868, 0.56, len]); });
    m.barPos.forEach(([x, y, z, len], i) => { S.m.makeScale(1, 1, len); S.m.setPosition(x, y, z); m.bars.setMatrixAt(i, S.m); m.bars.setColorAt(i, m.barCol); });
    makeSticks(m, 'mallet'); m.pt = Y();
    m.restL = new T.Vector3(0.16, 0.85, 0.2); m.restR = new T.Vector3(-0.16, 0.85, 0.2);
  },
  pose(m, f, dt) {
    let any = false;
    for (let i = 0; i < m.flash.length; i++) if (m.flash[i] > 0) { m.flash[i] = Math.max(0, m.flash[i] - dt * 2.2); S.col.copy(m.barCol).lerp(m.hot, m.flash[i]); m.bars.setColorAt(i, S.col); any = true; }
    if (any) m.bars.instanceColor.needsUpdate = true;
    poseSticks(m, f, dt, m.restL, m.restR, 0.07);
    const a = smooth(m.act.x);
    m.fig.lean = 0.16 * a; m.fig.headX = 0.3 * a; m.fig.swayZ = Math.sin(f.t * 0.8 + m.ph) * 0.02 * a;
  },
  note(m, d) {
    const nat = I.GLOCK_N, pc = ((d.midi % 12) + 12) % 12;
    let i = (((wIdx(d.midi) - wIdx(72)) % nat) + nat) % nat;
    if (isBlack(pc)) { const j = I.GLOCK_SHARPS.indexOf(i); i = j >= 0 ? nat + j : i; }
    const [x, y, z] = m.barPos[i]; m.flash[i] = 1;
    const h = pickHand(m, x > 0.0 ? 0 : 1);
    strike(m, h, m.pt.set(x, y + 0.006, z), d.vel ?? 0.8, S.e.set(h ? -0.05 : 0.05, 0.09, -0.3));
  },
};

const timpaniRig = {
  posture: 'standing', seat: null, stand: null,
  build(m) {
    m.drums = [[0.33, 0.36, 0.5], [-0.31, 0.31, 0.47]].map(([x, r, z]) => {
      const g = new T.Group(); g.position.set(x, 0.8, z); m.object3d.add(g);
      const P = I.timp(r); addParts({ copper: P.copper, chrome: P.chrome }, g);
      const head = mesh(P.head, MAT.drumhead, g); head.receiveShadow = true;
      return { g, head, r, rip: sp(0), pt: new T.Vector3(x, 0.83, z - r * 0.5) };
    });
    makeSticks(m, 'felt');
    m.restL = new T.Vector3(0.18, 0.86, 0.22); m.restR = new T.Vector3(-0.18, 0.86, 0.22);
  },
  pose(m, f, dt) {
    for (const d of m.drums) { const r = spring(d.rip, 0, 34, dt, 0.08); d.head.scale.set(1, 1 + r * 1.6, 1); d.g.rotation.z = r * 0.02; }
    poseSticks(m, f, dt, m.restL, m.restR, 0.1);
    const a = smooth(m.act.x);
    m.fig.lean = 0.14 * a; m.fig.headX = 0.25 * a; m.fig.turn = (m.hs[0].p.x + m.hs[1].p.x) * 0.3 * a;
  },
  note(m, d) {
    const k = d.midi < 46 ? 0 : 1, dr = m.drums[k], vel = d.vel ?? 0.8;
    const h = pickHand(m, m.side);
    strike(m, h, S.f.copy(dr.pt).add(S.g.set(h ? -0.05 : 0.05, 0, 0)), vel, S.e.set(h ? -0.07 : 0.07, 0.1, -0.3));
    dr.rip.v -= 3 + vel * 4;
  },
};

// drum kit: one drummer per kit piece (each seat is a piece)
function kitRig(build, note, extra) {
  return {
    posture: 'seated', seat: 'throne', stand: null,
    build(m) {
      makeSticks(m, 'stick');
      m.restL = new T.Vector3(0.14, 0.66, 0.34); m.restR = new T.Vector3(-0.14, 0.66, 0.34);
      m.pt = Y(); build(m);
      for (const s of m.hs) s.goal.copy(s.p.copy(m.home?.[m.hs.indexOf(s)] || s.p));
    },
    pose(m, f, dt) {
      if (extra) extra(m, f, dt);
      poseSticks(m, f, dt, m.restL, m.restR, 0.08);
      const a = smooth(m.act.x);
      m.fig.lean = 0.08 * a; m.fig.headX = 0.12 * a + m.nod.x * 0.15; m.fig.lift = -m.nod.x * 0.01;
      m.fig.swayZ = Math.sin(f.beat * Math.PI) * 0.03 * a;
      spring(m.nod, 0, 14, dt, 0.4);
    },
    note(m, d) { m.nod.v += 1.6 * (d.vel ?? 0.8); note(m, d); },
  };
}
const shellMat = (m) => instMat(m.inst);
function addDrum(m, r, h, x, y, z, tilt = 0) {
  const P = I.drum(r, h), g = new T.Group(); g.position.set(x, y, z); g.rotation.x = -tilt; m.object3d.add(g);
  mesh(P.shell, shellMat(m), g); mesh(P.chrome, MAT.chrome, g); const head = mesh(P.head, MAT.drumhead, g);
  return { g, head, r, h, rip: sp(0), pt: new T.Vector3(0, h / 2 + 0.005, -0.03).applyEuler(g.rotation).add(g.position) };
}
function addStand(m, pts) { mesh(geo('kitstand' + m.inst.id, () => { const p = pts(); return mergeList(p); }), MAT.chrome, m.object3d); }
const mergeList = (list) => { const out = []; for (const g of list) Array.isArray(g) ? out.push(...g) : out.push(g); return mergeGeos(out); };
function ripple(list, dt) { for (const d of list) { const r = spring(d.rip, 0, 40, dt, 0.1); d.head.scale.set(1 + r * 0.015, 1, 1 + r * 0.015); d.head.position.y = r * 0.004; } }

const snareRig = kitRig((m) => {
  m.dr = [addDrum(m, 0.17, 0.13, 0, 0.64, 0.42, 0.12)];
  addStand(m, () => [I.standPole([0, 0.0, 0.42], [0, 0.57, 0.42]), I.tripod(0, 0.42, 0.24, 0.25)]);
  m.home = [S.a.set(0.04, 0, 0).add(m.dr[0].pt).clone(), S.a.set(-0.04, 0, 0).add(m.dr[0].pt).clone()];
}, (m, d) => {
  const h = m.side, dr = m.dr[0];
  strike(m, h, m.pt.copy(dr.pt).add(S.g.set(h ? -0.035 : 0.035, 0, 0)), d.vel < 0.35 ? d.vel * 0.6 : d.vel);
  dr.rip.v += 6 * d.vel;
}, (m, f, dt) => ripple(m.dr, dt));

const hihatRig = kitRig((m) => {
  const x = 0.36, z = 0.34;
  addStand(m, () => [I.standPole([x, 0, z], [x, 0.88, z]), I.tripod(x, z, 0.24, 0.2), I.standPole([x, 0.88, z], [x, 1.02, z], 0.004)]);
  m.hatB = mesh(I.cymbal(0.18), MAT.bronze, m.object3d); m.hatB.position.set(x, 0.88, z); m.hatB.rotation.x = Math.PI;
  m.hatT = mesh(I.cymbal(0.18), MAT.bronze, m.object3d); m.hatT.position.set(x, 0.9, z);
  m.gap = sp(0.004); m.openUntil = 0; m.pedal = 0; m.hx = x; m.hz = z;
  m.home = [new T.Vector3(0.04, 0.705, 0.4), new T.Vector3(x - 0.06, 0.9, z - 0.13)];
}, (m, d) => {
  if (d.midi === 44) { m.gap.v -= 0.6; return; }
  if (d.midi === 46) m.openUntil = m.t + Math.max(0.2, d.dur || 0.3);
  strike(m, 1, m.pt.set(m.hx - 0.06, 0.912 + m.gap.x, m.hz - 0.13), d.vel ?? 0.7, S.e.set(-0.18, 0.1, -0.24));
}, (m, f, dt) => {
  spring(m.gap, m.t < m.openUntil ? 0.03 : 0.004, 30, dt, 0.5);
  if (m.gap.x < 0.001) { m.gap.x = 0.001; m.gap.v = Math.abs(m.gap.v) * 0.3; }
  m.hatT.position.y = 0.884 + m.gap.x + 0.012;
  m.hatT.rotation.z = Math.sin(m.t * 30) * m.gap.v * 0.01;
});

const tomsRig = kitRig((m) => {
  m.dr = [addDrum(m, 0.13, 0.2, 0.16, 0.86, 0.53, 0.45), addDrum(m, 0.145, 0.22, -0.16, 0.85, 0.55, 0.42), addDrum(m, 0.2, 0.34, -0.46, 0.5, 0.3, 0.05)];
  addStand(m, () => [I.standPole([0, 0, 0.62], [0, 0.82, 0.6], 0.014), I.tripod(0, 0.62, 0.28, 0.22), I.standPole([0, 0.78, 0.6], [0.14, 0.8, 0.56], 0.009), I.standPole([0, 0.78, 0.6], [-0.14, 0.8, 0.58], 0.009),
    I.standPole([-0.62, 0, 0.3], [-0.65, 0.5, 0.3], 0.008), I.standPole([-0.3, 0, 0.3], [-0.27, 0.5, 0.3], 0.008), I.standPole([-0.46, 0, 0.12], [-0.46, 0.5, 0.12], 0.008)]);
  m.home = [m.dr[0].pt.clone(), m.dr[1].pt.clone()];
}, (m, d) => {
  const k = d.midi >= 48 ? 0 : d.midi >= 45 ? 1 : 2, dr = m.dr[k];
  const h = k === 0 ? 0 : 1, hh = pickHand(m, h);
  strike(m, hh, dr.pt, d.vel ?? 0.8, S.e.set(hh ? -0.06 : 0.06, 0.09, k === 2 ? -0.2 : -0.3));
  dr.rip.v += 7 * (d.vel ?? 0.8);
}, (m, f, dt) => ripple(m.dr, dt));

const cymbalsRig = kitRig((m) => {
  m.cy = [[0.36, 1.22, 0.5, 0.2, 0.35], [-0.42, 1.03, 0.42, 0.24, 0.25]].map(([x, y, z, r, tilt], i) => {
    const g = new T.Group(); g.position.set(x, y, z); g.rotation.x = -tilt; m.object3d.add(g);
    mesh(I.cymbal(r), MAT.bronze, g);
    return { g, r, tilt, wx: sp(0), wz: sp(0), pt: new T.Vector3(x - (i ? -0.04 : 0.04), y + 0.01, z - r * 0.75) };
  });
  addStand(m, () => [I.standPole([0.42, 0, 0.62], [0.42, 0.9, 0.62]), I.tripod(0.42, 0.62, 0.26, 0.2), I.standPole([0.42, 0.9, 0.62], [0.36, 1.21, 0.5], 0.008),
    I.standPole([-0.5, 0, 0.55], [-0.5, 0.8, 0.55]), I.tripod(-0.5, 0.55, 0.26, 0.2), I.standPole([-0.5, 0.8, 0.55], [-0.42, 1.02, 0.42], 0.008)]);
  m.home = [new T.Vector3(0.12, 0.8, 0.45), new T.Vector3(-0.12, 0.8, 0.45)];
}, (m, d) => {
  const ride = d.midi === 51 || d.midi === 59 || d.midi === 53, c = m.cy[ride ? 1 : 0], vel = d.vel ?? 0.8;
  const h = ride ? 1 : 0;
  strike(m, h, c.pt, vel, S.e.set(ride ? -0.04 : 0.04, 0.06, -0.3));
  c.wx.v += (ride ? 1.2 : 3.2) * vel; c.wz.v += (ride ? -0.6 : -1.8) * vel * (h ? -1 : 1);
}, (m, f, dt) => {
  for (const c of m.cy) {
    spring(c.wx, 0, 9, dt, 0.09); spring(c.wz, 0, 7.5, dt, 0.08);
    c.g.rotation.set(-c.tilt + c.wx.x * 0.4, 0, c.wz.x * 0.4);
  }
});

const kickRig = {
  posture: 'seated', seat: 'throne', stand: null,
  build(m) {
    const g = new T.Group(); g.position.set(0, 0.3, 0.64); m.object3d.add(g); m.kick = g;
    const shell = geo('kickshell', () => new T.CylinderGeometry(0.28, 0.28, 0.38, 36, 1, true).rotateX(Math.PI / 2));
    mesh(shell, shellMat(m), g);
    const hoopG = geo('kickhoop', () => mergeGeos([new T.TorusGeometry(0.292, 0.02, 8, 40).translate(0, 0, 0.19), new T.TorusGeometry(0.292, 0.02, 8, 40).translate(0, 0, -0.19)]));
    mesh(hoopG, MAT.ebony, g);
    const lugs = geo('kicklugs', () => { const p = []; for (let i = 0; i < 10; i++) { const a = (i / 10) * TAU; p.push(box(0.016, 0.022, 0.3, Math.sin(a) * 0.29, Math.cos(a) * 0.29, 0)); } p.push(I.standPole([0.22, -0.12, 0.12], [0.33, -0.3, 0.2], 0.008), I.standPole([-0.22, -0.12, 0.12], [-0.33, -0.3, 0.2], 0.008)); return mergeGeos(p); });
    mesh(lugs, MAT.chrome, g);
    m.front = mesh(geo('kickfront', () => new T.CircleGeometry(0.28, 40).translate(0, 0, 0.191)), MAT.kickHead, g);
    mesh(geo('kickback', () => new T.CircleGeometry(0.28, 40).rotateY(Math.PI).translate(0, 0, -0.191)), MAT.drumhead, g);
    // pedal + beater (pivot at the footboard heel)
    mesh(geo('kickpedal', () => mergeGeos([box(0.08, 0.02, 0.26, -0.1, 0.02, 0.36, -0.12), box(0.1, 0.12, 0.03, -0.1, 0.07, 0.44)])), MAT.steel, m.object3d);
    m.beater = new T.Group(); m.beater.position.set(-0.1, 0.1, 0.43); m.object3d.add(m.beater);
    mesh(geo('beaterrod', () => I.standPole([0, 0, 0], [0, 0.2, 0], 0.004)), MAT.chrome, m.beater);
    mesh(geo('beaterhead', () => new T.SphereGeometry(0.028, 12, 9).translate(0, 0.2, 0)), MAT.felt, m.beater);
    m.beat = sp(-0.55); m.rip = sp(0);
    m.vL = Y(); m.vR = Y();
  },
  pose(m, f, dt) {
    const a = smooth(m.act.x), t = f.t;
    spring(m.beat, -0.55 + 0.25 * (1 - a), 22, dt, 0.6);
    if (m.beat.x > -0.03) { m.beat.x = -0.03; m.beat.v = -Math.abs(m.beat.v) * 0.3; }
    m.beater.rotation.x = m.beat.x;
    const r = spring(m.rip, 0, 32, dt, 0.12);
    m.front.scale.set(1 + r * 0.03, 1 + r * 0.03, 1); m.front.position.z = r * 0.01; m.kick.rotation.z = r * 0.004;
    spring(m.nod, 0, 12, dt, 0.4);
    // hands keep time on the thighs; body nods with the kick
    const tap = Math.max(0, Math.sin(f.beat * Math.PI * 2)) * 0.04 * a;
    m.vL.set(0.13, 0.62 + tap, 0.32 + m.nod.x * 0.02); m.vR.set(-0.13, 0.62 + Math.max(0, Math.sin(f.beat * Math.PI * 2 + Math.PI)) * 0.04 * a, 0.32);
    m.fig.targetV(0, m.vL, 1); m.fig.targetV(1, m.vR, 1); m.fig.pole(0, 1, -0.3, -0.5); m.fig.pole(1, -1, -0.3, -0.5);
    m.fig.lean = 0.06 * a + m.nod.x * 0.08; m.fig.headX = 0.08 * a + m.nod.x * 0.2; m.fig.swayZ = Math.sin(t * 0.9 + m.ph) * 0.02 * a;
  },
  note(m, d) { const v = d.vel ?? 0.8; m.beat.v += 14 + 10 * v; m.rip.v += 8 * v; m.nod.v += 1.8 * v; },
};

const clapsRig = {
  posture: 'standing', seat: null, stand: null,
  build(m) { m.clap = sp(0); m.vL = Y(); m.vR = Y(); },
  pose(m, f, dt) {
    const a = smooth(m.act.x), t = f.t;
    const ph = (f.beat * 2) % 1, open = ph > 0.5 ? smooth((ph - 0.5) / 0.5) * 0.05 : 0; // hands open wider before the grid
    spring(m.clap, 0, 16, dt, 0.7);
    const c = clamp(m.clap.x, 0, 1), w = (0.15 + open) * (1 - c) + 0.012;
    const y = lerp(0.1, 0.4, a) + c * 0.03, z = lerp(0.18, 0.28, a);
    m.vL.set(w, y, z); m.vR.set(-w, y + 0.01, z + 0.01);
    m.fig.targetV(0, m.vL, 0); m.fig.targetV(1, m.vR, 0);
    m.fig.pole(0, 1, -0.6, -0.3); m.fig.pole(1, -1, -0.6, -0.3);
    m.fig.arms[0].flex = -0.7 * a; m.fig.arms[1].flex = -0.7 * a;
    m.fig.lean = 0.04 * a + c * 0.04; m.fig.swayZ = Math.sin(f.beat * Math.PI) * 0.05 * a; m.fig.headX = c * 0.08; m.fig.lift = -c * 0.015;
    m.fig.turn = Math.sin(t * 0.6 + m.ph) * 0.06 * a;
  },
  note(m, d) { m.clap.x = Math.max(m.clap.x, 0.25); m.clap.v += 9 + 6 * (d.vel ?? 0.8); },
};

const choirRig = {
  posture: 'standing', seat: null, stand: null,
  build(m) {
    const F = I.choirFolder();
    m.folder = new T.Group(); m.fig.torso.add(m.folder);
    m.cv = [0, 1].map((i) => { const g = new T.Group(); m.folder.add(g); mesh(F.cover, instMat(m.inst), g); mesh(i ? F.page : F.pageB, MAT.paper, g, false); return g; });
    m.jaw = sp(0); m.jawT = 0; m.jawUntil = 0; m.vL = Y(); m.vR = Y();
  },
  pose(m, f, dt) {
    const a = smooth(m.act.x), t = f.t;
    // folder: closed at the waist -> raised and opened at the chest
    m.folder.position.set(0, lerp(0.05, 0.36, a), lerp(0.25, 0.3, a));
    m.folder.rotation.set(lerp(0.2, -0.55, a), 0, 0);
    m.cv[0].rotation.y = 0.38 * a; m.cv[1].rotation.y = lerp(0.03, Math.PI - 0.38, a);
    for (let i = 0; i < 2; i++) {
      xf(i ? m.vR : m.vL, S.h.set(0, 0, 0), m.cv[i].quaternion, S.w.set(1, 1, 1), 0.2, -0.08, 0);
      const v = i ? m.vR : m.vL; v.applyEuler(m.folder.rotation).add(m.folder.position);
      m.fig.targetV(i, v, 0); m.fig.pole(i, i ? -1 : 1, -1, -0.2);
      m.fig.arms[i].flex = -0.4;
    }
    spring(m.jaw, t < m.jawUntil ? m.jawT : 0, 18, dt, 0.7);
    m.fig.mouth.scale.y = 0.3 + clamp(m.jaw.x, 0, 1.2) * 1.5;
    const sw = Math.sin(f.beat * Math.PI * 0.5 + m.ph * 0.3);
    m.fig.swayZ = sw * 0.035 * a; m.fig.turn = sw * 0.04 * a; m.fig.lean = -0.02 * a;
    m.fig.headX = lerp(0.06, -0.08 - m.jaw.x * 0.1, a); m.fig.headZ = sw * 0.04 * a;
    m.fig.breath = Math.sin(t * 1.4 + m.ph) * 0.006 + m.jaw.x * 0.012;
  },
  note(m, d) { m.jawT = 0.45 + 0.55 * (d.vel ?? 0.8); m.jawUntil = m.t + Math.max(0.15, (d.dur || 0.4) * 0.85); },
};

let RIGS = null, BASS = null;
function makeRigs() {
  if (RIGS) return;
  RIGS = {
    violin: bowedRig(null), cello: bowedRig('cello'), flute: fluteRig, clarinet: clarinetRig, trumpet: trumpetRig, horn: hornRig,
    harp: harpRig, piano: pianoRig, glock: glockRig, timpani: timpaniRig, choir: choirRig,
    kick: kickRig, snare: snareRig, hihat: hihatRig, toms: tomsRig, cymbals: cymbalsRig, claps: clapsRig,
  };
  BASS = bowedRig('bass');
}

// ---------------------------------------------------------------- the musician
const CAPS = new Map();
const capsule = (r, h) => { const k = r + ':' + h; let g = CAPS.get(k); if (!g) { g = new T.CapsuleGeometry(r, Math.max(0.05, h - 2 * r), 4, 8).translate(0, h / 2, 0); CAPS.set(k, g); } return g; };

class Musician {
  constructor(ctx, seat, inst) {
    this.ctx = ctx;
    this.inst = inst; this.id = seat?.id ?? (typeof seat === 'number' ? seat : 0); this.k = seat?.k ?? 0;
    const rigName = RIG_OF[inst.id] || FAMILY_RIG[inst.family] || 'choir';
    this.R = inst.id === 'contrabass' ? BASS : RIGS[rigName];
    const o = new T.Group(); o.name = 'musician:' + (inst.id || '?') + ':' + this.id; this.object3d = o;
    const seed = this.id * 7919 + (inst.hue | 0) * 31 + this.k * 131 + (inst.id || '').length * 977;
    const style = Math.floor(hash(seed + 5) * HAIR_STYLES);
    const gown = this.R === RIGS.choir && (style === 1 || style === 2 || style === 3);
    this.fig = new Figure(o, {
      posture: gown ? 'gown' : this.R.posture, tone: Math.floor(hash(seed) * 6), hair: style === 4 ? 4 : Math.floor(hash(seed + 9) * 6) % 6, hairStyle: style,
    });
    // furniture
    if (this.R.seat) {
      const F = this.R.seat === 'throne' ? throneGeo() : this.R.seat === 'bench' ? benchGeo() : chairGeo();
      const fr = mesh(F.frame, this.R.seat === 'bench' ? MAT.lacquer : MAT.steel, o); fr.receiveShadow = true;
      mesh(F.pad, this.R.seat === 'bench' ? MAT.ebony : MAT.velvet, o);
    }
    if (this.R.stand) {
      const H = this.R.stand, G = standGeo(H), st = new T.Group(); st.position.set(0, 0, H > 1.1 ? 0.78 : 0.8); o.add(st);
      mesh(G.metal, MAT.steel, st); mesh(G.paper, MAT.paper, st, false);
      this.bulb = mesh(G.bulb, MAT.bulbOff, st, false);
      this.glow = mesh(G.glow, MAT.glow, st, false); this.glow.visible = false; this.glow.renderOrder = 2;
    }
    this.act = sp(0); this.want = false; this.liveUntil = -1; this.t = 0; this.noteEnv = 0; this.nod = sp(0);
    this.ph = hash(seed + 99) * TAU; this.sel = 0;
    this.copy = (p) => { if (this.hold) { this.hold.position.copy(p.p); this.hold.quaternion.copy(p.q); } };
    this.R.build(this);
    // cheap pickable: an invisible capsule (plus a box over big instruments)
    const tall = this.R.posture === 'standing' || gown ? 1.78 : 1.35;
    const cap = new T.Mesh(capsule(0.36, tall), MAT.pick); cap.position.z = 0.12; cap.visible = false;
    cap.userData = { seat: this.id, inst: inst.id, kind: 'musician' };
    o.add(cap); this.pickables = [cap];
    if (this.R === RIGS.piano || this.R === RIGS.harp) {
      const b = new T.Mesh(this.R === RIGS.piano ? geo('pickPiano', () => box(1.5, 1.0, 1.9, 0, 0.5, 1.45)) : geo('pickHarp', () => box(0.4, 1.6, 0.9, -0.07, 0.8, 0.5)), MAT.pick);
      b.visible = false; b.userData = cap.userData; o.add(b); this.pickables.push(b);
    }
    o.userData = { seat: this.id, inst: inst.id };
  }
  setActive(on) { this.want = !!on; }
  onNote(d) {
    if (!d) return;
    this.noteEnv = 1;
    if (d.live && !this.want) this.liveUntil = this.t + 1.6;
    try { this.R.note(this, { midi: 60, vel: 0.8, dur: 0.4, ...d }); } catch (e) { /* never break the frame loop */ }
  }
  setSelected(level) {
    const lv = level >= 2 ? 1 : level >= 1 ? 0.62 : clamp(+level || 0, 0, 1); // core passes 0|1|2 (section|player)
    this.sel = lv; this.fig.setSelected(lv);
  }
  update(f) {
    const dt = clamp(f.dt || 0.016, 0, 1 / 20);
    this.t = f.t;
    const on = this.want || this.t < this.liveUntil;
    spring(this.act, on ? 1 : 0, 7.5, dt);
    if (on) LIVE.add(this); else LIVE.delete(this);
    this.noteEnv *= Math.exp(-dt * 3.2);
    const fig = this.fig;
    fig.breath = Math.sin(f.t * 1.5 + this.ph) * 0.007; fig.lift = 0;
    fig.lean = fig.swayX = fig.swayZ = fig.turn = fig.headX = fig.headY = fig.headZ = 0;
    this.R.pose(this, f, dt);
    fig.headX += Math.sin(f.t * 0.37 + this.ph) * 0.03; fig.headY += Math.sin(f.t * 0.23 + this.ph * 2) * 0.05 * (1 - this.act.x);
    fig.applyBody(); fig.solve();
    if (this.bulb) {
      const lit = this.act.x > 0.5;
      if ((this.bulb.material === MAT.bulbOn) !== lit) this.bulb.material = lit ? MAT.bulbOn : MAT.bulbOff;
      const g = this.act.x * (0.9 + this.noteEnv * 0.25);
      this.glow.visible = g > 0.03; this.glow.scale.setScalar(Math.max(0.001, g));
    }
  }
  applyTheme(tok) { applySharedTheme(tok); }
  dispose() {
    LIVE.delete(this);
    this.object3d.parent?.remove(this.object3d);
    this.object3d.traverse((o) => { if (o.isInstancedMesh) o.dispose(); });
  }
}

export function createMusician(ctx, { seat, inst } = {}) {
  init(ctx.THREE); ensureEnv(ctx); makeRigs();
  if (typeof inst === 'string') inst = { id: inst };
  inst = inst || { id: seat?.inst || 'x' };
  if (ctx.tok) applySharedTheme(ctx.tok);
  const m = new Musician(ctx, seat, inst);
  return {
    object3d: m.object3d, pickables: m.pickables,
    setActive: (on) => m.setActive(on), onNote: (d) => m.onNote(d), setSelected: (l) => m.setSelected(l),
    update: (f) => m.update(f), applyTheme: (tok) => m.applyTheme(tok), dispose: () => m.dispose(), _m: m,
  };
}

// ---------------------------------------------------------------- the conductor
// 4/4 pattern in torso space (right hand): ictus points 1 (down), 2 (left = +X), 3 (right = -X), 4 (up)
const ICTUS = [[-0.1, 0.3, 0.46], [0.12, 0.36, 0.44], [-0.36, 0.37, 0.42], [-0.14, 0.52, 0.42]];
const REBOUND = [0.2, 0.17, 0.2, 0.36];
export function createConductor(ctx) {
  init(ctx.THREE); ensureEnv(ctx);
  if (ctx.tok) applySharedTheme(ctx.tok);
  const o = new T.Group(); o.name = 'conductor';
  const fig = new Figure(o, { posture: 'standing', tone: 1, hair: 4, hairStyle: 4, tails: true });
  // score desk in front
  const G = standGeo(1.12), st = new T.Group(); st.position.set(0, 0, 0.62); o.add(st);
  mesh(G.metal, MAT.steel, st); mesh(G.paper, MAT.paper, st, false);
  // baton in the right hand; tip glows
  const baton = new T.Group(); fig.arms[1].wr.add(baton);
  baton.position.set(0, -0.07, 0.01); baton.rotation.x = 0.9;
  mesh(geo('baton', () => mergeGeos([I.standPole([0, 0, 0], [0, -0.42, 0], 0.0032), new T.SphereGeometry(0.011, 10, 8).scale(1, 1.6, 1)])), MAT.baton, baton);
  const tipMesh = mesh(geo('batonTipG', () => new T.SphereGeometry(0.009, 10, 8)), MAT.batonTip, baton, false); tipMesh.position.y = -0.425;
  const halo = new T.Sprite(MAT.glowSprite); halo.position.y = -0.425; halo.scale.setScalar(0.1); halo.renderOrder = 3; baton.add(halo);
  const batonTip = new T.Object3D(); batonTip.position.y = -0.43; baton.add(batonTip);
  const cap = new T.Mesh(capsule(0.4, 1.8), MAT.pick); cap.visible = false; cap.userData = { kind: 'conductor' }; o.add(cap);
  const st8 = { act: sp(0), size: sp(0.6), bounce: sp(0), turn: sp(0), lean: sp(0), t: 0, n: 0, focusX: 0, focusZ: 1, beat: 0, lastBeat: -1, cue: sp(0) };
  const vR = Y(), vL = Y(), A = Y(), B = Y(), Cc = Y(), inv = new T.Matrix4(), wp = Y();
  function onBeat(d = {}) {
    const b = (d.beat ?? 0) % 4, down = b === 0;
    st8.bounce.v -= down ? 1.2 : 0.65;
    if (down && (d.bar ?? 0) === 0) st8.cue.v += 2.5;
  }
  function update(f) {
    const dt = clamp(f.dt || 0.016, 0, 1 / 20), t = f.t;
    st8.t = t;
    const playing = (f.playing || 0) > 0;
    spring(st8.act, playing ? 1 : 0, 4, dt);
    const a = smooth(st8.act.x), tut = clamp(f.tutti || 0, 0, 1);
    spring(st8.size, (0.75 + tut * 0.5 + (f.level || 0) * 0.25), 3, dt);
    spring(st8.bounce, 0, 16, dt, 0.35);
    spring(st8.cue, 0, 4, dt, 0.5);
    // lean toward the active sections (centroid in conductor space), every few frames
    if ((st8.n++ & 7) === 0 && LIVE.size) {
      o.updateMatrixWorld(); inv.copy(o.matrixWorld).invert();
      let x = 0, z = 0;
      for (const m of LIVE) { m.object3d.getWorldPosition(wp).applyMatrix4(inv); x += wp.x; z += wp.z; }
      st8.focusX = x / LIVE.size; st8.focusZ = Math.max(0.5, z / LIVE.size);
    }
    const az = LIVE.size ? clamp(Math.atan2(st8.focusX, st8.focusZ), -0.6, 0.6) : 0;
    spring(st8.turn, az * 0.55 * a, 3, dt); spring(st8.lean, (0.04 + tut * 0.08) * a, 3, dt);
    // baton: quadratic arcs between ictus points, phase-locked to frame.beat
    const beat = ((f.beat || 0) % 16 + 16) % 16, i = Math.floor(beat) % 4, p = beat - Math.floor(beat);
    const I0 = ICTUS[i], I1 = ICTUS[(i + 1) % 4], k = st8.size.x * (i === 3 ? 1.2 : 1);
    const cx = -0.12, cy = 0.42;
    A.set(cx + (I0[0] - cx) * k, cy + (I0[1] - cy) * k, I0[2]); B.set(cx + (I1[0] - cx) * k, cy + (I1[1] - cy) * k, I1[2]);
    Cc.addVectors(A, B).multiplyScalar(0.5); Cc.y += REBOUND[i] * k; Cc.z -= 0.04;
    const e = p < 0.5 ? 0.5 * Math.pow(p * 2, 0.75) : 1 - 0.5 * Math.pow((1 - p) * 2, 1.6); // fast out of the ictus, accelerate into the next
    const u = 1 - e;
    vR.set(u * u * A.x + 2 * u * e * Cc.x + e * e * B.x, u * u * A.y + 2 * u * e * Cc.y + e * e * B.y, u * u * A.z + 2 * u * e * Cc.z + e * e * B.z);
    vR.y += st8.bounce.x * 0.05;
    S.a.set(-0.16, 0.12, 0.2); vR.lerpVectors(S.a, vR, a);
    // left hand: mirrors in tutti, otherwise a softer cue/sustain gesture toward the focus
    const mir = 0.25 + tut * 0.7;
    vL.set(-vR.x * mir + (1 - mir) * (0.2 + st8.turn.x * 0.2), lerp(0.3, vR.y, mir) + st8.cue.x * 0.12 + Math.sin(t * 0.8) * 0.02, lerp(0.3, vR.z, mir) + st8.cue.x * 0.06);
    S.b.set(0.16, 0.12, 0.2); vL.lerpVectors(S.b, vL, a);
    fig.targetV(1, vR, 0); fig.targetV(0, vL, 0);
    fig.pole(1, -1, -0.5, -0.4); fig.pole(0, 1, -0.6, -0.4);
    fig.arms[1].flex = -0.25 + (1 - e) * 0.25 * a; fig.arms[0].flex = -0.3;
    fig.turn = st8.turn.x; fig.lean = st8.lean.x + st8.bounce.x * 0.03; fig.lift = st8.bounce.x * 0.012;
    fig.swayZ = (vR.x + 0.12) * 0.08 * a; fig.headX = 0.1 * a + st8.bounce.x * 0.05; fig.headY = st8.turn.x * 0.6;
    fig.breath = Math.sin(t * 1.3) * 0.007;
    fig.applyBody(); fig.solve();
    halo.scale.setScalar(0.05 + a * 0.05 + (f.level || 0) * 0.06 + Math.max(0, -st8.bounce.x) * 0.05);
  }
  return {
    object3d: o, pickables: [cap], batonTip, onBeat, update,
    applyTheme: (tok) => applySharedTheme(tok), setSelected: (l) => fig.setSelected(l >= 2 ? 1 : l >= 1 ? 0.62 : l), dispose: () => o.parent?.remove(o),
  };
}
