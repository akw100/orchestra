// Stage: plank floor with a curved apron, contract risers, conductor podium, footlights, stage-house walls,
// back-wall paneling, the organ (instanced pipes with a level-driven shimmer) and acoustic ceiling clouds.
import { DIM, RISER, apronZ, extrudeY, splitGroups, place, tube, rng } from './util.js';

function sectorShape(THREE, rIn, rOut, a0, a1, n = 72) {
  const s = new THREE.Shape();
  const cz = RISER.cz;
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    const x = rOut * Math.sin(a), y = rOut * Math.cos(a) - cz;
    i ? s.lineTo(x, y) : s.moveTo(x, y);
  }
  for (let i = n; i >= 0; i--) {
    const a = a0 + ((a1 - a0) * i) / n;
    s.lineTo(rIn * Math.sin(a), rIn * Math.cos(a) - cz);
  }
  return s;
}
const arcPts = (r, A, y, n = 64) => {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const a = -A + (2 * A * i) / n;
    pts.push([r * Math.sin(a), y, RISER.cz - r * Math.cos(a)]);
  }
  return pts;
};

function addExtrude(THREE, add, geom, capKey, sideKey) {
  const parts = splitGroups(THREE, geom);
  for (const g of parts[0] || []) add(capKey, g);
  for (const g of parts[1] || []) add(sideKey, g);
  geom.dispose();
}

export function buildPlatform(ctx, mats, add) {
  const { THREE } = ctx;
  const group = new THREE.Group();
  group.name = 'stage';
  const W = DIM.stageHalfW;

  // ---- stage floor + apron (extruded from the house floor up to y = 0) ----
  {
    const s = new THREE.Shape();
    s.moveTo(-W, -DIM.backZ);
    s.lineTo(W, -DIM.backZ);
    for (let i = 0; i <= 64; i++) {
      const x = W - (2 * W * i) / 64;
      s.lineTo(x, -apronZ(x));
    }
    s.closePath();
    addExtrude(THREE, add, extrudeY(THREE, s, DIM.houseY, 0), 'floor', 'fascia');
    // gilt nosing along the apron lip + a lower bead
    const lip = [], bead = [];
    for (let i = 0; i <= 64; i++) {
      const x = -W + (2 * W * i) / 64;
      lip.push([x, -0.03, apronZ(x) + 0.01]);
      bead.push([x, -0.62, apronZ(x) + 0.012]);
    }
    add('gold', tube(THREE, lip, 0.04, 128, 8));
    add('gold', tube(THREE, bead, 0.022, 128, 6));
  }

  // ---- risers: tiers 1..4 (tier 0 is the stage floor itself) ----
  for (let t = 1; t <= 4; t++) {
    const R = RISER.R(t), A = RISER.A(t), H = RISER.H(t);
    addExtrude(THREE, add, extrudeY(THREE, sectorShape(THREE, R - 0.78, R + 0.77, -A, A), -0.02, H), 'riserTop', 'riserFascia');
    add('gold', tube(THREE, arcPts(R - 0.785, A, H - 0.012), 0.02, 120, 6));
    add('gold', tube(THREE, arcPts(R - 0.783, A, 0.035), 0.012, 120, 5));
  }

  // ---- conductor podium at (0, 0, 0.9), top at 0.22, with a brass rail behind the conductor ----
  {
    const top = new THREE.CylinderGeometry(0.56, 0.56, 0.03, 40);
    place(THREE, top, { pos: [0, 0.205, 0.9] });
    const topParts = splitGroups(THREE, top);
    for (const k in topParts) for (const g of topParts[k]) add(k === '0' ? 'podiumTop' : 'riserFascia', g);
    add('riserFascia', place(THREE, new THREE.CylinderGeometry(0.55, 0.6, 0.19, 40), { pos: [0, 0.095, 0.9] }));
    add('gold', place(THREE, new THREE.TorusGeometry(0.565, 0.022, 6, 48), { pos: [0, 0.2, 0.9], rot: [Math.PI / 2, 0, 0] }));
    add('gold', place(THREE, new THREE.TorusGeometry(0.6, 0.016, 6, 48), { pos: [0, 0.012, 0.9], rot: [Math.PI / 2, 0, 0] }));
    const rail = [];
    for (let i = 0; i <= 24; i++) {
      const a = -1.15 + (2.3 * i) / 24;
      rail.push([0.5 * Math.sin(a), 1.0, 0.9 + 0.5 * Math.cos(a)]);
    }
    add('gold', tube(THREE, rail, 0.022, 48, 8));
    for (const a of [-1.15, 0, 1.15]) {
      add('gold', place(THREE, new THREE.CylinderGeometry(0.016, 0.02, 0.8, 8), { pos: [0.5 * Math.sin(a), 0.6, 0.9 + 0.5 * Math.cos(a)] }));
    }
  }

  // ---- footlights: gilt hoods along the apron lip, instanced bulbs whose glow follows the bands ----
  const FN = ctx.quality === 'low' ? 24 : 36;
  const bulbs = new THREE.InstancedMesh(new THREE.SphereGeometry(0.05, 10, 8), mats.footBulb, FN);
  bulbs.name = 'footlights';
  const footS = new Float32Array(FN);
  {
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
    for (let i = 0; i < FN; i++) {
      const x = -10.1 + (20.2 * i) / (FN - 1);
      const z = apronZ(x) - 0.24;
      const dzdx = (apronZ(x + 0.01) - apronZ(x - 0.01)) / 0.02;
      const yaw = -Math.atan(dzdx);
      footS[i] = x / 10.1;
      m.compose(new THREE.Vector3(x, 0.07, z), q.identity(), new THREE.Vector3(1, 0.8, 1));
      bulbs.setMatrixAt(i, m);
      bulbs.setColorAt(i, new THREE.Color(1, 0.8, 0.5));
      // hood: half-cylinder shell open toward the stage, shielding the house
      const hood = new THREE.CylinderGeometry(0.1, 0.1, 0.34, 14, 1, true, -Math.PI / 2, Math.PI);
      hood.rotateZ(Math.PI / 2);
      e.set(0, yaw, 0);
      add('gold', place(THREE, hood, { pos: [x, 0.06, z + 0.02], rot: [0, yaw, 0] }));
      const cap = new THREE.CylinderGeometry(0.1, 0.1, 0.02, 14, 1, false, -Math.PI / 2, Math.PI);
      add('gold', place(THREE, cap.rotateZ(Math.PI / 2), { pos: [x - 0.17 * Math.cos(yaw), 0.06, z + 0.02 + 0.17 * Math.sin(yaw)], rot: [0, yaw, 0] }));
      add('gold', place(THREE, cap.clone(), { pos: [x + 0.17 * Math.cos(yaw), 0.06, z + 0.02 - 0.17 * Math.sin(yaw)], rot: [0, yaw, 0] }));
    }
    bulbs.instanceMatrix.needsUpdate = true;
  }
  group.add(bulbs);
  const footLight = new THREE.SpotLight(0xffc68a, 0, 30, 0.95, 0.85, 1.6);
  footLight.position.set(0, 0.15, 3.5);
  footLight.target.position.set(0, 3.0, -1.5);
  footLight.castShadow = false;
  group.add(footLight, footLight.target);

  // ---- stage house: side walls, back wall with raised panels and pilasters, ceiling ----
  const B = DIM.backZ, TOPY = 12.6;
  add('panel', place(THREE, new THREE.BoxGeometry(2 * W + 0.6, TOPY + 0.2, 0.3), { pos: [0, TOPY / 2 - 0.1, B - 0.15] }));
  for (const sx of [-1, 1]) {
    add('panel', place(THREE, new THREE.BoxGeometry(0.3, TOPY + 0.2, DIM.wallZ0 - B), { pos: [sx * (W + 0.15), TOPY / 2 - 0.1, (DIM.wallZ0 + B) / 2] }));
  }
  add('dark', place(THREE, new THREE.BoxGeometry(2 * W + 0.6, 0.3, DIM.wallZ0 - B + 0.3), { pos: [0, TOPY + 0.15, (DIM.wallZ0 + B) / 2] }));
  {
    // raised panels either side of the organ
    const cols = [[6.25, 8.05], [8.45, 10.25], [10.45, 11.25]];
    const rows = [[0.5, 2.9], [3.3, 7.1], [7.5, 11.0]];
    for (const sx of [-1, 1]) {
      for (const [a, b] of cols.slice(0, 2)) {
        for (const [y0, y1] of rows) {
          const cx = sx * (a + b) / 2, w = b - a, h = y1 - y0, cy = (y0 + y1) / 2;
          add('panelHi', place(THREE, new THREE.BoxGeometry(w, h, 0.08), { pos: [cx, cy, B + 0.04] }));
          const tr = [[0, h / 2, w, 0.035], [0, -h / 2, w, 0.035], [w / 2, 0, 0.035, h], [-w / 2, 0, 0.035, h]];
          for (const [dx, dy, tw, th] of tr) add('gold', place(THREE, new THREE.BoxGeometry(tw, th, 0.03), { pos: [cx + dx, cy + dy, B + 0.095] }));
        }
      }
      // pilasters with gilt capitals and a chair rail
      for (const px of [6.05, 8.25, 10.35]) {
        add('panel', place(THREE, new THREE.BoxGeometry(0.34, 11.2, 0.22), { pos: [sx * px, 5.6, B + 0.11] }));
        add('gold', place(THREE, new THREE.BoxGeometry(0.46, 0.22, 0.3), { pos: [sx * px, 11.2, B + 0.15] }));
        add('gold', place(THREE, new THREE.BoxGeometry(0.42, 0.1, 0.28), { pos: [sx * px, 0.05, B + 0.14] }));
      }
      // side-wall pilasters + gilt rail
      for (let z = B + 2.2; z < DIM.wallZ0 - 0.5; z += 2.6) {
        add('panel', place(THREE, new THREE.BoxGeometry(0.2, 11.2, 0.36), { pos: [sx * (W - 0.1), 5.6, z] }));
        add('gold', place(THREE, new THREE.BoxGeometry(0.3, 0.2, 0.46), { pos: [sx * (W - 0.12), 11.2, z] }));
      }
      add('gold', place(THREE, new THREE.BoxGeometry(0.06, 0.07, DIM.wallZ0 - B), { pos: [sx * (W - 0.03), 1.05, (DIM.wallZ0 + B) / 2] }));
    }
    add('gold', place(THREE, new THREE.BoxGeometry(2 * W, 0.08, 0.07), { pos: [0, 11.35, B + 0.2] }));
  }

  // ---- organ: case on a plinth, 5 towers/flats of façade pipes + a darker back rank ----
  const pipes = [];
  {
    const r = rng(33);
    const push = (x, L, z, rad, dim = 1) => pipes.push({ x, L, z, rad, dim, ph: r() * 6.28 });
    const foot = 3.45;
    const tower = (cx, n, sp, peak, fall) => {
      for (let i = 0; i < n; i++) {
        const k = i - (n - 1) / 2;
        push(cx + k * sp, peak - fall * Math.abs(k), -10.5, 0.075 + 0.012 * (peak - fall * Math.abs(k)) / 2);
      }
    };
    const flat = (cx, n, sp, lo, rise) => {
      for (let i = 0; i < n; i++) {
        const k = i - (n - 1) / 2;
        push(cx + k * sp, lo + rise * Math.abs(k), -10.48, 0.065 + 0.01 * (lo + rise * Math.abs(k)) / 2);
      }
    };
    tower(0, 9, 0.33, 6.5, 0.32);
    flat(-2.55, 7, 0.27, 3.4, 0.28);
    flat(2.55, 7, 0.27, 3.4, 0.28);
    tower(-4.5, 7, 0.3, 5.6, 0.3);
    tower(4.5, 7, 0.3, 5.6, 0.3);
    for (let i = 0; i < 34; i++) {
      const x = -5.1 + (10.2 * i) / 33;
      push(x, 2.8 + 1.6 * Math.abs(Math.sin(i * 0.55)) + 1.2 * (1 - Math.abs(x) / 5.1), -10.82, 0.06, 0.55);
    }
    const profile = [[0.0, 0], [0.22, 0], [0.9, 0.105], [1.0, 0.125], [1.0, 1.0], [0.92, 1.0]].map(([x, y]) => new THREE.Vector2(x, y));
    const pgeo = new THREE.LatheGeometry(profile, 16);
    const inst = new THREE.InstancedMesh(pgeo, mats.pipe, pipes.length);
    inst.name = 'organ-pipes';
    const ph = new Float32Array(pipes.length);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), s = new THREE.Vector3(), c = new THREE.Color();
    pipes.forEach((p, i) => {
      m.compose(v.set(p.x, foot, p.z), q, s.set(p.rad, p.L, p.rad));
      inst.setMatrixAt(i, m);
      inst.setColorAt(i, c.setScalar(p.dim));
      ph[i] = p.ph;
    });
    pgeo.setAttribute('aPh', new THREE.InstancedBufferAttribute(ph, 1));
    group.add(inst);
    // case: plinth with gilt mouldings, tower crowns, finials
    add('panel', place(THREE, new THREE.BoxGeometry(11.4, foot, 0.75), { pos: [0, foot / 2, -10.7] }));
    add('panelHi', place(THREE, new THREE.BoxGeometry(10.6, 2.2, 0.05), { pos: [0, 1.75, -10.31] }));
    add('gold', place(THREE, new THREE.BoxGeometry(11.6, 0.14, 0.85), { pos: [0, foot - 0.02, -10.66] }));
    add('gold', place(THREE, new THREE.BoxGeometry(11.6, 0.1, 0.82), { pos: [0, 0.05, -10.66] }));
    for (const [cx, w, topY] of [[0, 3.3, foot + 6.75], [-4.5, 2.2, foot + 5.85], [4.5, 2.2, foot + 5.85]]) {
      const arc = [];
      for (let i = 0; i <= 20; i++) {
        const a = Math.PI - (Math.PI * i) / 20;
        arc.push([cx + (w / 2) * Math.cos(a), topY + 0.55 * Math.sin(a), -10.38]);
      }
      add('gold', tube(THREE, arc, 0.06, 40, 8));
      add('gold', place(THREE, new THREE.SphereGeometry(0.17, 14, 10), { pos: [cx, topY + 0.78, -10.38] }));
      add('gold', place(THREE, new THREE.ConeGeometry(0.06, 0.4, 10), { pos: [cx, topY + 1.08, -10.38] }));
      for (const sx of [-1, 1]) {
        add('panel', place(THREE, new THREE.BoxGeometry(0.22, topY - foot, 0.5), { pos: [cx + sx * (w / 2 + 0.11), (topY + foot) / 2, -10.6] }));
        add('gold', place(THREE, new THREE.SphereGeometry(0.11, 12, 8), { pos: [cx + sx * (w / 2 + 0.11), topY + 0.12, -10.4] }));
      }
    }
  }

  // ---- acoustic clouds: curved, tilted panels fanned over the risers ----
  {
    const N = 7;
    for (let i = 0; i < N; i++) {
      const a = -0.75 + (1.5 * i) / (N - 1);
      const rr = i % 2 ? 7.4 : 5.6;
      const g = new THREE.BoxGeometry(3.2, 0.1, 2.0, 16, 1, 1);
      const p = g.attributes.position;
      for (let k = 0; k < p.count; k++) p.setY(k, p.getY(k) - 0.18 * (p.getX(k) / 1.6) ** 2);
      g.computeVertexNormals();
      const x = rr * Math.sin(a), z = RISER.cz - rr * Math.cos(a) - 1.2;
      add('cloud', place(THREE, g, { pos: [x, 10.4 + (i % 2) * 0.55, z], rot: [-0.22, a, 0] }));
      const e = tube(THREE, [[-1.6, 0, 1.0], [0, -0.0, 1.0], [1.6, 0, 1.0]].map(([px, py, pz]) => {
        const yy = py - 0.18 * (px / 1.6) ** 2;
        const v = new THREE.Vector3(px, yy - 0.05, pz).applyEuler(new THREE.Euler(-0.22, a, 0));
        return [v.x + x, v.y + 10.4 + (i % 2) * 0.55, v.z + z];
      }), 0.025, 24, 5);
      add('gold', e);
    }
  }

  // ---- per-frame: footlight glow follows level + bands (low centre, highs at the ends) ----
  const col = new THREE.Color(), base = new THREE.Color(1, 0.75, 0.45);
  let theme = 'dark';
  const state = { lift: 1 };
  function update(frame, house) {
    const t = frame.t || 0, lv = frame.level || 0, b = frame.bands || { low: 0, mid: 0, high: 0 };
    const idle = theme === 'light' ? 0.55 : 1.0;
    for (let i = 0; i < FN; i++) {
      const s = Math.abs(footS[i]);
      const band = s < 0.4 ? b.low + (b.mid - b.low) * (s / 0.4) : b.mid + (b.high - b.mid) * Math.min(1, (s - 0.4) / 0.5);
      const flick = ctx.reducedMotion ? 1 : 0.94 + 0.06 * Math.sin(t * 9.0 + i * 2.7);
      const k = (idle + 2.8 * (0.35 * lv + 0.65 * band)) * flick * state.lift;
      bulbs.setColorAt(i, col.copy(base).multiplyScalar(k));
    }
    bulbs.instanceColor.needsUpdate = true;
    footLight.intensity = (theme === 'light' ? 6 : 14) + 60 * (0.4 * lv + 0.6 * (b.low * 0.5 + b.mid * 0.5));
    if (mats.pipe.userData.uniforms) {
      mats.pipe.userData.uniforms.uTime.value = t;
      mats.pipe.userData.uniforms.uLevel.value = lv;
    }
  }
  function applyTheme(th, P) {
    theme = th;
    footLight.color.copy(P.glow);
    base.copy(P.glow).lerp(new THREE.Color(1, 0.85, 0.6), 0.5);
  }
  return { group, update, applyTheme };
}

// Organ-pipe shimmer: a band of light that climbs the pipes with the music, and a dark mouth on each pipe.
export function pipeShader(THREE, mat) {
  const uniforms = { uTime: { value: 0 }, uLevel: { value: 0 }, uShimmer: { value: new THREE.Color(1, 0.8, 0.5) } };
  mat.userData.uniforms = uniforms;
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aPh;\nvarying float vPh;\nvarying vec3 vPipe;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvPh = aPh;\nvPipe = position;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;\nuniform float uLevel;\nuniform vec3 uShimmer;\nvarying float vPh;\nvarying vec3 vPipe;')
      .replace('#include <color_fragment>', `#include <color_fragment>
        float fr = vPipe.z / max(length(vPipe.xz), 1e-3);
        float mouth = step(0.13, vPipe.y) * step(vPipe.y, 0.165 + 0.02 * fr) * smoothstep(0.8, 0.95, fr);
        diffuseColor.rgb *= 1.0 - 0.9 * mouth;`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        float band = pow(0.5 + 0.5 * sin(vPipe.y * 7.0 - uTime * 2.2 + vPh), 14.0);
        totalEmissiveRadiance += uShimmer * (0.05 + uLevel * (0.25 + 1.6 * band)) * (1.0 - mouth);`);
  };
  mat.customProgramCacheKey = () => 'po-hall-pipe';
  return mat;
}
