// The house: raked stepped floor, instanced velvet seats + audience (idle sway, bob with the music), side
// boxes in two tiers with gilt balustrades, rear balcony, lighting bridge, ceiling, crystal chandeliers,
// sconces, a warm house light, and the follow-spot anchor fixtures.
import { DIM, rowZ, rowY, extrudeY, place, tube, rng } from './util.js';

const HW = DIM.houseHalfW;
const TIERS = [3.6, 7.0];
const BOX_Z0 = 4.4, BOX_N = 5, BOX_L = 4.0;
const BALC_Y = 5.4;
const balcZ = (x) => 22.2 - 1.3 * (1 - (x / HW) ** 2);
const CHANDELIERS = [[0, 12.3, 16.0, 1.15], [-7.8, 12.8, 9.5, 0.85], [7.8, 12.8, 9.5, 0.85]];

function audienceShader(mat, uniforms, key) {
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;\nuniform float uBob;\nuniform float uBeat;\nuniform float uIdle;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        #ifdef USE_INSTANCING
        float ph = float(gl_InstanceID) * 1.618;
        float hy = max(transformed.y - 0.62, 0.0);
        transformed.x += hy * uIdle * (0.035 * sin(uTime * 0.37 + ph * 3.1) + uBob * 0.06 * sin(uBeat + ph));
        transformed.z += hy * uIdle * 0.03 * sin(uTime * 0.29 + ph * 2.3);
        transformed.y += uIdle * uBob * 0.02 * max(0.0, sin(uBeat * 2.0 + ph)) * step(0.6, transformed.y);
        #endif`);
  };
  mat.customProgramCacheKey = () => 'po-hall-aud-' + key;
}

function crystalShader(mat, uniforms) {
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying float vGl;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        #ifdef USE_INSTANCING
        vGl = fract(sin(float(gl_InstanceID) * 12.9898) * 43758.5453) * 80.0;
        #else
        vGl = 0.0;
        #endif`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;\nuniform float uGlint;\nuniform vec3 uGlintCol;\nvarying float vGl;')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        float tw = pow(max(0.0, sin(uTime * 1.9 + vGl)), 28.0);
        totalEmissiveRadiance += uGlintCol * (0.08 + tw * uGlint);`);
  };
  mat.customProgramCacheKey = () => 'po-hall-crystal';
}

export function buildHouse(ctx, mats, add) {
  const { THREE } = ctx;
  const group = new THREE.Group();
  group.name = 'house';
  const low = ctx.quality === 'low';
  const r = rng(2026);
  const seats = [];      // {x,y,z,yaw}
  const people = [];     // {x,y,z,yaw,s}
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), V = new THREE.Vector3(), S = new THREE.Vector3(), E = new THREE.Euler();

  // ---- raked floor: one carpeted step per row ----
  add('carpet', place(THREE, new THREE.BoxGeometry(2 * HW, 0.3, rowZ(0) - 0.475 - DIM.wallZ1), { pos: [0, DIM.houseY - 0.15, (rowZ(0) - 0.475 + DIM.wallZ1) / 2] }));
  for (let i = 0; i < DIM.rows; i++) {
    const z0 = rowZ(i) - 0.475, z1 = i === DIM.rows - 1 ? DIM.houseBackZ : rowZ(i) + 0.475;
    const y = rowY(i);
    add('carpet', place(THREE, new THREE.BoxGeometry(2 * HW, y - DIM.houseY + 0.3, z1 - z0), { pos: [0, (y + DIM.houseY - 0.3) / 2, (z0 + z1) / 2] }));
    add('gold', place(THREE, new THREE.BoxGeometry(2 * HW, 0.025, 0.03), { pos: [0, y - 0.01, z0 - 0.012] }));
    const z = rowZ(i) + 0.05;
    for (let x = -13.6; x <= 13.61; x += 0.58) {
      if (Math.abs(x) > 3.9 && Math.abs(x) < 5.0) continue;
      if (low && i % 2) continue;
      const yaw = Math.atan2(x, z + 1.5);
      seats.push({ x, y, z, yaw });
      if (r() < 0.82) people.push({ x, y, z, yaw: yaw + (r() - 0.5) * 0.25, s: 0.9 + r() * 0.2 });
    }
  }

  // ---- house walls, ceiling, cornice ----
  const H = DIM.ceilY;
  for (const sx of [-1, 1]) {
    add('plaster', place(THREE, new THREE.BoxGeometry(0.3, H - DIM.houseY + 0.4, DIM.houseBackZ - DIM.wallZ1), { pos: [sx * (HW + 0.15), (H + DIM.houseY - 0.4) / 2, (DIM.houseBackZ + DIM.wallZ1) / 2] }));
    add('gold', place(THREE, new THREE.BoxGeometry(0.25, 0.22, DIM.houseBackZ - DIM.wallZ1), { pos: [sx * (HW - 0.1), H - 0.25, (DIM.houseBackZ + DIM.wallZ1) / 2] }));
  }
  add('plaster', place(THREE, new THREE.BoxGeometry(2 * HW + 0.6, H - DIM.houseY + 0.4, 0.3), { pos: [0, (H + DIM.houseY - 0.4) / 2, DIM.houseBackZ + 0.15] }));
  add('ceiling', place(THREE, new THREE.BoxGeometry(2 * HW + 0.6, 0.3, DIM.houseBackZ - DIM.wallZ0 + 0.3), { pos: [0, H + 0.15, (DIM.houseBackZ + DIM.wallZ0) / 2] }));
  {
    const ring = (rx, rz, cz, rad, y = H - 0.06) => {
      const pts = [];
      for (let i = 0; i < 48; i++) { const a = (i / 48) * Math.PI * 2; pts.push([Math.cos(a) * rx, y, cz + Math.sin(a) * rz]); }
      add('gold', tube(THREE, pts, rad, 160, 8, true));
    };
    ring(11.5, 8.6, 14.5, 0.09);
    ring(10.9, 8.1, 14.5, 0.04);
    ring(4.2, 3.0, 16.0, 0.06);
    for (const [cx, cy, cz, s] of CHANDELIERS) {
      add('gold', place(THREE, new THREE.CylinderGeometry(0.7 * s, 0.85 * s, 0.1, 32), { pos: [cx, H - 0.05, cz] }));
      add('gold', place(THREE, new THREE.TorusGeometry(0.95 * s, 0.05, 6, 40), { pos: [cx, H - 0.04, cz], rot: [Math.PI / 2, 0, 0] }));
    }
  }

  // ---- side boxes: two tiers, five boxes per side, gilt balustrades, velvet cushions, sconces ----
  const bulbsGeo = [];
  const bulb = (x, y, z, s = 1) => bulbsGeo.push(place(THREE, new THREE.SphereGeometry(0.06 * s, 10, 8), { pos: [x, y, z], scale: [1, 1.5, 1] }));
  {
    const balProf = [[0, 0], [0.05, 0], [0.05, 0.04], [0.03, 0.08], [0.055, 0.2], [0.03, 0.32], [0.025, 0.36], [0.045, 0.4], [0, 0.4]].map(([a, b]) => new THREE.Vector2(a, b));
    const baluster = new THREE.LatheGeometry(balProf, 8);
    const L = BOX_N * BOX_L, zc = BOX_Z0 + L / 2, fx = HW - 2.0;
    for (const sx of [-1, 1]) {
      for (const yT of TIERS) {
        add('plaster', place(THREE, new THREE.BoxGeometry(2.0, 0.36, L), { pos: [sx * (HW - 1.0), yT - 0.18, zc] }));
        add('gold', place(THREE, new THREE.BoxGeometry(0.1, 0.1, L), { pos: [sx * (fx - 0.02), yT - 0.33, zc] }));
        add('plaster', place(THREE, new THREE.BoxGeometry(0.16, 0.56, L), { pos: [sx * fx, yT + 0.28, zc] }));
        add('gold', place(THREE, new THREE.BoxGeometry(0.24, 0.06, L), { pos: [sx * fx, yT + 0.58, zc] }));
        add('gold', place(THREE, new THREE.BoxGeometry(0.03, 0.05, L), { pos: [sx * (fx - 0.09), yT + 0.1, zc] }));
        add('gold', tube(THREE, [[sx * fx, yT + 1.02, BOX_Z0], [sx * fx, yT + 1.02, BOX_Z0 + L]], 0.035, 2, 8));
        add('velvet', place(THREE, new THREE.BoxGeometry(0.18, 0.09, L), { pos: [sx * fx, yT + 1.09, zc] }));
        for (let z = BOX_Z0 + 0.15; z < BOX_Z0 + L - 0.1; z += low ? 0.4 : 0.24) {
          add('gold', place(THREE, baluster.clone(), { pos: [sx * fx, yT + 0.61, z] }));
        }
        for (let k = 0; k <= BOX_N; k++) {
          const z = BOX_Z0 + k * BOX_L;
          add('plaster', place(THREE, new THREE.BoxGeometry(2.0, 3.0, 0.16), { pos: [sx * (HW - 1.0), yT + 1.5, z] }));
          add('gold', place(THREE, new THREE.BoxGeometry(0.2, 0.18, 0.26), { pos: [sx * (fx + 0.05), yT + 3.0 - 0.1, z] }));
          // sconce: plate, arm, flame bulb
          add('gold', place(THREE, new THREE.BoxGeometry(0.04, 0.3, 0.16), { pos: [sx * (fx + 0.02), yT + 1.7, z] }));
          add('gold', tube(THREE, [[sx * fx, yT + 1.62, z], [sx * (fx - 0.16), yT + 1.66, z], [sx * (fx - 0.22), yT + 1.8, z]], 0.014, 8, 5));
          add('gold', place(THREE, new THREE.CylinderGeometry(0.045, 0.03, 0.05, 10), { pos: [sx * (fx - 0.22), yT + 1.82, z] }));
          bulb(sx * (fx - 0.22), yT + 1.9, z, 0.9);
        }
        // little velvet pelmet over each box opening
        for (let k = 0; k < BOX_N; k++) {
          const z = BOX_Z0 + (k + 0.5) * BOX_L;
          add('velvet', place(THREE, new THREE.BoxGeometry(0.12, 0.36, BOX_L - 0.3), { pos: [sx * (fx + 0.06), yT + 2.78, z] }));
          add('gold', place(THREE, new THREE.BoxGeometry(0.13, 0.03, BOX_L - 0.3), { pos: [sx * (fx + 0.05), yT + 2.6, z] }));
          for (const dz of [-1.1, 0, 1.1]) {
            if (r() < 0.75) {
              const zz = z + dz + (r() - 0.5) * 0.3, x = sx * (HW - 1.0 + (r() - 0.5) * 0.4);
              people.push({ x, y: yT, z: zz, yaw: Math.atan2(x, zz + 1.5), s: 0.9 + r() * 0.2, box: true });
              seats.push({ x, y: yT, z: zz, yaw: Math.atan2(x, zz + 1.5) });
            }
          }
        }
      }
    }
    baluster.dispose();
  }

  // ---- rear balcony: curved front, stepped rows, rail; two follow-spot fixtures on the rail ----
  {
    const s = new THREE.Shape(), back = DIM.houseBackZ;
    s.moveTo(-HW, -back);
    for (let i = 0; i <= 48; i++) { const x = -HW + (2 * HW * i) / 48; s.lineTo(x, -balcZ(x)); }
    s.lineTo(HW, -back); s.closePath();
    add('plaster', extrudeY(THREE, s, BALC_Y - 0.45, BALC_Y));
    const front = (dz, y) => { const pts = []; for (let i = 0; i <= 48; i++) { const x = -HW + (2 * HW * i) / 48; pts.push([x, y, balcZ(x) + dz]); } return pts; };
    const ps = new THREE.Shape();
    for (let i = 0; i <= 48; i++) { const x = -HW + (2 * HW * i) / 48; i ? ps.lineTo(x, -balcZ(x)) : ps.moveTo(x, -balcZ(x)); }
    for (let i = 48; i >= 0; i--) { const x = -HW + (2 * HW * i) / 48; ps.lineTo(x, -(balcZ(x) + 0.16)); }
    add('plaster', extrudeY(THREE, ps, BALC_Y, BALC_Y + 0.95));
    add('gold', tube(THREE, front(-0.02, BALC_Y - 0.44), 0.07, 120, 8));
    add('gold', tube(THREE, front(-0.03, BALC_Y + 0.35), 0.03, 120, 6));
    add('gold', tube(THREE, front(0.08, BALC_Y + 0.98), 0.05, 120, 8));
    add('velvet', tube(THREE, front(0.08, BALC_Y + 1.06), 0.07, 120, 8));
    for (let k = 0; k < 4; k++) {
      const yy = BALC_Y + 0.12 + 0.36 * k;
      const fz = (x) => balcZ(x) + 0.9 + 0.95 * k;
      const st = new THREE.Shape();
      for (let i = 0; i <= 32; i++) { const x = -HW + (2 * HW * i) / 32; i ? st.lineTo(x, -(fz(x) - 0.45)) : st.moveTo(x, -(fz(x) - 0.45)); }
      st.lineTo(HW, -DIM.houseBackZ); st.lineTo(-HW, -DIM.houseBackZ); st.closePath();
      add('carpet', extrudeY(THREE, st, BALC_Y, yy));
      for (let x = -13.8; x <= 13.81; x += 0.6) {
        if (low && k % 2) continue;
        const z = fz(x), yaw = Math.atan2(x, z + 1.5);
        seats.push({ x, y: yy, z, yaw });
        if (r() < 0.7) people.push({ x, y: yy, z, yaw: yaw + (r() - 0.5) * 0.2, s: 0.9 + r() * 0.2 });
      }
    }
  }

  // ---- lighting bridge across the house ceiling ----
  add('dark', place(THREE, new THREE.BoxGeometry(18, 0.45, 1.1), { pos: [0, 14.75, 12.0] }));
  add('gold', place(THREE, new THREE.BoxGeometry(18, 0.06, 0.05), { pos: [0, 14.52, 12.57] }));

  // ---- follow-spot fixtures at the anchors, aimed at centre stage ----
  const anchors = [
    new THREE.Vector3(0, 14.3, 12.0),
    new THREE.Vector3(-7.2, BALC_Y + 1.55, balcZ(-7.2) + 0.45),
    new THREE.Vector3(7.2, BALC_Y + 1.55, balcZ(7.2) + 0.45),
    new THREE.Vector3(-4.6, 14.3, 12.0),
    new THREE.Vector3(4.6, 14.3, 12.0),
  ];
  {
    const aim = new THREE.Vector3(0, 1.4, -3.5), dir = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    for (const a of anchors) {
      dir.subVectors(aim, a).normalize();
      const q = new THREE.Quaternion().setFromUnitVectors(up, dir);
      const e = new THREE.Euler().setFromQuaternion(q);
      const back = a.clone().addScaledVector(dir, -0.32);
      add('dark', place(THREE, new THREE.CylinderGeometry(0.11, 0.14, 0.6, 14), { pos: [back.x, back.y, back.z], rot: [e.x, e.y, e.z] }));
      add('gold', place(THREE, new THREE.TorusGeometry(0.13, 0.02, 6, 20).rotateX(Math.PI / 2), { pos: [a.x, a.y, a.z], rot: [e.x, e.y, e.z] }));
      add('dark', place(THREE, new THREE.BoxGeometry(0.05, 0.4, 0.05), { pos: [back.x, back.y - 0.28, back.z] }));
    }
  }

  // ---- chandeliers: gilt frame (static), flame bulbs (static, brightness via material), crystals (instanced) ----
  const crystals = [];
  for (const [cx, cy, cz, s] of CHANDELIERS) {
    const P = (x, y, z) => [cx + x * s, cy + y * s, cz + z * s];
    add('gold', place(THREE, new THREE.CylinderGeometry(0.025, 0.025, DIM.ceilY - cy - 0.9 * s, 6), { pos: [cx, (DIM.ceilY + cy + 0.9 * s) / 2, cz] }));
    const col = [[0, -0.95], [0.08, -0.9], [0.15, -0.65], [0.1, -0.35], [0.18, -0.12], [0.13, 0.1], [0.07, 0.4], [0.13, 0.68], [0.05, 0.9], [0, 0.95]];
    add('gold', place(THREE, new THREE.LatheGeometry(col.map(([a, b]) => new THREE.Vector2(a, b)), 20), { pos: P(0, 0, 0), scale: [s, s, s] }));
    const rings = [[1.5, -0.2, 16, 7, 3], [1.0, 0.35, 10, 5, 2], [0.55, 0.8, 8, 0, 1]];
    for (const [rr, ry, cups, fest, pend] of rings) {
      add('gold', place(THREE, new THREE.TorusGeometry(rr, 0.03, 6, 64).rotateX(Math.PI / 2), { pos: P(0, ry, 0), scale: [s, s, s] }));
      for (let j = 0; j < cups; j++) {
        const a = (j / cups) * Math.PI * 2, a2 = ((j + 1) / cups) * Math.PI * 2;
        const x = Math.cos(a) * rr, z = Math.sin(a) * rr;
        add('gold', place(THREE, new THREE.CylinderGeometry(0.055, 0.035, 0.07, 10), { pos: P(x, ry + 0.04, z), scale: [s, s, s] }));
        add('candle', place(THREE, new THREE.CylinderGeometry(0.022, 0.022, 0.12, 8), { pos: P(x, ry + 0.13, z), scale: [s, s, s] }));
        bulb(...P(x, ry + 0.23, z), s * 0.85);
        for (let k = 1; k <= fest; k++) {
          const f = k / (fest + 1), aa = a + (a2 - a) * f;
          crystals.push([...P(Math.cos(aa) * rr, ry - 0.05 - 0.26 * Math.sin(Math.PI * f), Math.sin(aa) * rr), s * 0.8, aa]);
        }
        for (let k = 0; k < pend; k++) crystals.push([...P(x, ry - 0.1 - 0.13 * k, z), s * (k === pend - 1 ? 1.4 : 0.9), a]);
      }
      if (rr === 1.5) {
        for (let k = 0; k < 8; k++) {
          const a = (k / 8) * Math.PI * 2 + 0.2;
          add('gold', tube(THREE, [P(0.12 * Math.cos(a), 0.05, 0.12 * Math.sin(a)), P(0.8 * Math.cos(a), -0.45, 0.8 * Math.sin(a)), P(1.48 * Math.cos(a), -0.2, 1.48 * Math.sin(a))], 0.022 * s, 16, 5));
        }
      }
    }
    for (let l = 0; l < 5; l++) {
      const n = 14 - 2 * l, rr = 0.5 - 0.09 * l;
      for (let j = 0; j < n; j++) {
        const a = (j / n) * Math.PI * 2 + l * 0.3;
        crystals.push([...P(Math.cos(a) * rr, -1.0 - 0.17 * l, Math.sin(a) * rr), s, a]);
      }
    }
    crystals.push([...P(0, -1.95, 0), s * 2.2, 0]);
  }
  for (const g of bulbsGeo) add('bulb', g);
  const crystalMesh = new THREE.InstancedMesh(new THREE.OctahedronGeometry(1, 0), mats.crystal, crystals.length);
  crystalMesh.name = 'chandelier-crystals';
  crystals.forEach(([x, y, z, s, a], i) => {
    E.set(0, a + i * 0.37, 0);
    M.compose(V.set(x, y, z), Q.setFromEuler(E), S.set(0.042 * s, 0.085 * s, 0.042 * s));
    crystalMesh.setMatrixAt(i, M);
  });
  group.add(crystalMesh);

  // ---- seats + audience (two instanced meshes that share the same idle shader + instance order) ----
  const seatGeo = (() => {
    const parts = [
      place(THREE, new THREE.BoxGeometry(0.5, 0.1, 0.46), { pos: [0, 0.44, 0.02] }),
      place(THREE, new THREE.BoxGeometry(0.52, 0.66, 0.08), { pos: [0, 0.8, 0.26], rot: [-0.12, 0, 0] }),
      place(THREE, new THREE.BoxGeometry(0.05, 0.08, 0.44), { pos: [0.28, 0.64, 0.05] }),
      place(THREE, new THREE.BoxGeometry(0.05, 0.08, 0.44), { pos: [-0.28, 0.64, 0.05] }),
      place(THREE, new THREE.BoxGeometry(0.05, 0.6, 0.06), { pos: [0.28, 0.3, 0.1] }),
      place(THREE, new THREE.BoxGeometry(0.05, 0.6, 0.06), { pos: [-0.28, 0.3, 0.1] }),
    ];
    const g = new THREE.BufferGeometry();
    const flat = parts.map((p) => p.toNonIndexed());
    let n = 0; for (const p of flat) n += p.attributes.position.count;
    const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = new Float32Array(n * 2);
    let o = 0;
    for (const p of flat) { pos.set(p.attributes.position.array, o * 3); nor.set(p.attributes.normal.array, o * 3); uv.set(p.attributes.uv.array, o * 2); o += p.attributes.position.count; }
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    return g;
  })();
  const seatMesh = new THREE.InstancedMesh(seatGeo, mats.seat, seats.length);
  seatMesh.name = 'house-seats';
  seats.forEach((p, i) => {
    E.set(0, p.yaw, 0);
    M.compose(V.set(p.x, p.y, p.z), Q.setFromEuler(E), S.set(1, 1, 1));
    seatMesh.setMatrixAt(i, M);
  });
  seatMesh.receiveShadow = true;
  group.add(seatMesh);

  const headGeo = place(THREE, new THREE.SphereGeometry(0.105, 9, 6), { pos: [0, 1.18, 0.1], scale: [1, 1.15, 1.08] });
  const bodyGeo = (() => {
    const a = place(THREE, new THREE.SphereGeometry(0.22, 9, 5), { pos: [0, 0.88, 0.14], scale: [1, 0.5, 0.58] }).toNonIndexed();
    const b = place(THREE, new THREE.CylinderGeometry(0.17, 0.19, 0.42, 9, 1, true), { pos: [0, 0.66, 0.15], scale: [1, 1, 0.6] }).toNonIndexed();
    const c = place(THREE, new THREE.CylinderGeometry(0.045, 0.05, 0.14, 6, 1, true), { pos: [0, 1.02, 0.12] }).toNonIndexed();
    const g = new THREE.BufferGeometry();
    for (const name of ['position', 'normal', 'uv']) {
      const arr = [a, b, c].map((x) => x.attributes[name].array);
      const out = new Float32Array(arr.reduce((s, x) => s + x.length, 0));
      let o = 0; for (const x of arr) { out.set(x, o); o += x.length; }
      g.setAttribute(name, new THREE.BufferAttribute(out, name === 'uv' ? 2 : 3));
    }
    return g;
  })();
  const audUniforms = { uTime: { value: 0 }, uBob: { value: 0 }, uBeat: { value: 0 }, uIdle: { value: ctx.reducedMotion ? 0 : 1 } };
  audienceShader(mats.audienceHead, audUniforms, 'head');
  audienceShader(mats.audienceBody, audUniforms, 'body');
  const heads = new THREE.InstancedMesh(headGeo, mats.audienceHead, people.length);
  const bodies = new THREE.InstancedMesh(bodyGeo, mats.audienceBody, people.length);
  heads.name = 'audience-heads'; bodies.name = 'audience-bodies';
  const hairC = [], clothC = [];
  people.forEach((p, i) => {
    E.set(0, p.yaw, 0);
    M.compose(V.set(p.x, p.y, p.z), Q.setFromEuler(E), S.set(p.s, p.s * (0.95 + r() * 0.1), p.s));
    heads.setMatrixAt(i, M);
    bodies.setMatrixAt(i, M);
    const grey = r() < 0.18;
    hairC.push(grey ? [0, 0, 0.55 + r() * 0.2] : [0.05 + r() * 0.06, 0.25 + r() * 0.35, 0.08 + r() * 0.35]);
    clothC.push([r(), 0.15 + r() * 0.35, 0.14 + r() * 0.32]);
  });
  heads.frustumCulled = bodies.frustumCulled = true;
  group.add(heads, bodies);

  // ---- house light: one warm point light under the central chandelier ----
  const houseLamp = new THREE.PointLight(0xffd9a0, 0, 0, 2);
  houseLamp.position.set(0, 11.2, 15.5);
  group.add(houseLamp);

  const cUni = { uTime: { value: 0 }, uGlint: { value: 1 }, uGlintCol: { value: new THREE.Color(1, 0.9, 0.75) } };
  crystalShader(mats.crystal, cUni);

  const tmp = new THREE.Color();
  function applyTheme(theme, P) {
    const light = theme === 'light';
    people.forEach((_, i) => {
      const [hh, hs, hl] = hairC[i], [ch, cs, cl] = clothC[i];
      heads.setColorAt(i, tmp.setHSL(hh, hs, light ? hl : hl * 0.35, THREE.SRGBColorSpace));
      bodies.setColorAt(i, tmp.setHSL(ch, cs, light ? cl : cl * 0.3, THREE.SRGBColorSpace));
    });
    heads.instanceColor.needsUpdate = bodies.instanceColor.needsUpdate = true;
    cUni.uGlintCol.value.copy(P.glow).lerp(tmp.setRGB(1, 1, 1), 0.5);
    houseLamp.color.copy(P.glow).lerp(tmp.setRGB(1, 0.95, 0.85), 0.4);
  }
  function update(frame, house) {
    const t = frame.t || 0, lv = frame.level || 0;
    audUniforms.uTime.value = t;
    audUniforms.uBeat.value = (frame.beat || 0) * Math.PI;
    audUniforms.uBob.value += ((frame.playing ? lv : 0) - audUniforms.uBob.value) * 0.05;
    cUni.uTime.value = t;
    cUni.uGlint.value = (0.6 + 2.4 * lv) * (0.4 + 0.6 * house);
    houseLamp.intensity = 260 * house * house + 6;
  }
  return { group, update, applyTheme, spotAnchors: anchors };
}
