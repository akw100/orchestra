// Gilded proscenium: bevelled arch frame with layered beads and rosettes, plaster wall, fluted columns with
// gilt capitals, entablature, spandrel medallions and the keystone cartouche with a raised "PO".
import { DIM, archPoints, place, tube } from './util.js';

function rosette(THREE, r = 0.11) {
  const prof = [[0, 0.05], [0.25, 0.07], [0.45, 0.04], [0.62, 0.06], [0.8, 0.035], [1, 0.0], [0, 0]].map(([x, y]) => new THREE.Vector2(x * r, y * r * 2.2));
  const parts = [new THREE.LatheGeometry(prof.reverse(), 12).rotateX(Math.PI / 2)];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    parts.push(place(THREE, new THREE.SphereGeometry(r * 0.32, 6, 4), { pos: [Math.cos(a) * r * 0.62, Math.sin(a) * r * 0.62, r * 0.12], scale: [1.25, 0.8, 0.55], rot: [0, 0, a] }));
  }
  parts.push(place(THREE, new THREE.SphereGeometry(r * 0.26, 8, 5), { pos: [0, 0, r * 0.22] }));
  return parts;
}

function evenlyAlong(pts, n) {
  const seg = [];
  let L = 0;
  for (let i = 1; i < pts.length; i++) {
    const d = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    seg.push(d); L += d;
  }
  const out = [];
  for (let k = 0; k < n; k++) {
    let target = (L * (k + 0.5)) / n, i = 0;
    while (i < seg.length - 1 && target > seg[i]) { target -= seg[i]; i++; }
    const f = target / seg[i];
    out.push([pts[i][0] + (pts[i + 1][0] - pts[i][0]) * f, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * f]);
  }
  return out;
}

export function buildProscenium(ctx, mats, add) {
  const { THREE } = ctx;
  const { openA, openB, openYc, frameA, frameB, wallZ0, wallZ1, houseHalfW: HW, houseY, ceilY } = DIM;

  // ---- plaster wall the arch sits in ----
  {
    const outer = archPoints(frameA, frameB, openYc, 0);
    const s = new THREE.Shape();
    s.moveTo(-HW, houseY); s.lineTo(-HW, ceilY); s.lineTo(HW, ceilY); s.lineTo(HW, houseY);
    s.lineTo(11.4, houseY); s.lineTo(11.4, 0);
    for (let i = outer.length - 1; i >= 0; i--) s.lineTo(outer[i][0], outer[i][1]);
    s.lineTo(-11.4, 0); s.lineTo(-11.4, houseY); s.closePath();
    const g = new THREE.ExtrudeGeometry(s, { depth: wallZ1 - wallZ0, bevelEnabled: false, curveSegments: 8 });
    g.translate(0, 0, wallZ0);
    add('plaster', g);
  }

  // ---- gilded frame (U-shaped contour, bevelled = rounded moulding) ----
  {
    const outer = archPoints(frameA, frameB, openYc, 0, 64), inner = archPoints(openA, openB, openYc, 0, 64);
    const s = new THREE.Shape();
    outer.forEach(([x, y], i) => (i ? s.lineTo(x, y) : s.moveTo(x, y)));
    for (let i = inner.length - 1; i >= 0; i--) s.lineTo(inner[i][0], inner[i][1]);
    s.closePath();
    const g = new THREE.ExtrudeGeometry(s, { depth: 0.16, bevelEnabled: true, bevelThickness: 0.1, bevelSize: 0.09, bevelSegments: 3, curveSegments: 8 });
    g.translate(0, 0, wallZ1);
    add('gold', g);
    const z = wallZ1 + 0.26;
    const bead = (a, b, y0, zz, r, n = 160) => add('gold', tube(THREE, archPoints(a, b, openYc, y0, 48).map(([x, y]) => [x, y, zz]), r, n, 8));
    bead(openA + 0.02, openB + 0.02, 0.15, z + 0.02, 0.075);
    bead(openA + 0.22, openB + 0.2, 0.3, z + 0.03, 0.03);
    bead(frameA - 0.2, frameB - 0.18, 0.3, z + 0.03, 0.03);
    bead(frameA + 0.05, frameB + 0.05, 0.0, wallZ1 + 0.12, 0.1);
    // rosettes along the middle of the band
    const mid = archPoints((openA + frameA) / 2 + 0.02, (openB + frameB) / 2 + 0.02, openYc, 0.7, 64);
    for (const [x, y] of evenlyAlong(mid, ctx.quality === 'low' ? 22 : 38)) {
      for (const p of rosette(THREE, 0.13)) add('gold', place(THREE, p, { pos: [x, y, z + 0.02] }));
    }
    // plinths at the foot of the jambs
    for (const sx of [-1, 1]) add('gold', place(THREE, new THREE.BoxGeometry(1.6, 0.5, 0.5), { pos: [sx * (openA + frameA) / 2, 0.25, wallZ1 + 0.16] }));
  }

  // ---- columns, pedestals, capitals; entablature with gilt mouldings ----
  for (const sx of [-1, 1]) {
    for (const cx of [12.6, 14.6]) {
      const x = sx * cx, z = wallZ1 + 0.42;
      add('plaster', place(THREE, new THREE.BoxGeometry(1.05, 1.5, 1.05), { pos: [x, houseY + 0.75, z] }));
      add('gold', place(THREE, new THREE.BoxGeometry(1.15, 0.1, 1.15), { pos: [x, houseY + 1.5, z] }));
      add('gold', place(THREE, new THREE.BoxGeometry(1.15, 0.12, 1.15), { pos: [x, houseY + 0.06, z] }));
      const shaft = new THREE.CylinderGeometry(0.34, 0.39, 9.9, 40, 1, true);
      const p = shaft.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const a = Math.atan2(p.getZ(i), p.getX(i));
        const k = 1 - 0.05 * Math.pow(0.5 + 0.5 * Math.cos(a * 20), 2);
        p.setX(i, p.getX(i) * k); p.setZ(i, p.getZ(i) * k);
      }
      shaft.computeVertexNormals();
      add('plaster', place(THREE, shaft, { pos: [x, houseY + 1.5 + 4.95, z] }));
      const base = [[0.0, 0], [0.5, 0], [0.5, 0.08], [0.45, 0.12], [0.47, 0.18], [0.4, 0.24], [0.0, 0.24]];
      add('gold', place(THREE, new THREE.LatheGeometry(base.map(([a, b]) => new THREE.Vector2(a, b)), 32), { pos: [x, houseY + 1.55, z] }));
      const cap = [[0.0, 0], [0.34, 0], [0.36, 0.06], [0.4, 0.2], [0.5, 0.42], [0.6, 0.55], [0.62, 0.62], [0.0, 0.62]];
      add('gold', place(THREE, new THREE.LatheGeometry(cap.map(([a, b]) => new THREE.Vector2(a, b)), 32), { pos: [x, houseY + 11.4, z] }));
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        add('gold', place(THREE, new THREE.SphereGeometry(0.11, 10, 8), { pos: [x + Math.cos(a) * 0.45, houseY + 11.72, z + Math.sin(a) * 0.45], scale: [1, 1.6, 1] }));
      }
      add('gold', place(THREE, new THREE.BoxGeometry(1.3, 0.14, 1.3), { pos: [x, houseY + 12.09, z] }));
    }
  }
  {
    const y0 = houseY + 12.16, z0 = wallZ1, d = 0.95;
    add('plaster', place(THREE, new THREE.BoxGeometry(2 * HW, 1.25, d), { pos: [0, y0 + 0.62, z0 + d / 2] }));
    for (const [dy, h, dz] of [[0.04, 0.1, 0.06], [0.48, 0.06, 0.03], [1.18, 0.16, 0.12], [1.32, 0.1, 0.2]]) {
      add('gold', place(THREE, new THREE.BoxGeometry(2 * HW, h, 0.1), { pos: [0, y0 + dy, z0 + d + dz - 0.04] }));
    }
    // dentils
    for (let x = -HW + 0.2; x < HW; x += 0.36) add('gold', place(THREE, new THREE.BoxGeometry(0.16, 0.14, 0.1), { pos: [x, y0 + 1.03, z0 + d + 0.02] }));
  }

  // ---- spandrel medallions with laurel festoons ----
  for (const sx of [-1, 1]) {
    const x = sx * 10.9, y = 10.0, z = wallZ1 + 0.05;
    add('gold', place(THREE, new THREE.TorusGeometry(0.42, 0.06, 8, 40), { pos: [x, y, z] }));
    add('velvet', place(THREE, new THREE.CylinderGeometry(0.38, 0.38, 0.06, 32).rotateX(Math.PI / 2), { pos: [x, y, z - 0.01] }));
    for (const p of rosette(THREE, 0.22)) add('gold', place(THREE, p, { pos: [x, y, z + 0.03] }));
    const fest = [];
    for (let i = 0; i <= 16; i++) {
      const f = i / 16;
      fest.push([x - sx * (0.5 + 2.6 * f), y + 0.35 - 0.7 * Math.sin(Math.PI * f) + 0.5 * f, z + 0.06]);
    }
    add('gold', tube(THREE, fest, 0.05, 48, 6));
    for (let i = 1; i < 16; i += 2) {
      const [fx, fy, fz] = fest[i];
      add('gold', place(THREE, new THREE.SphereGeometry(0.07, 8, 6), { pos: [fx, fy - 0.03, fz + 0.03], scale: [1.4, 0.8, 0.6], rot: [0, 0, i * 0.7] }));
    }
  }

  // ---- keystone cartouche: scalloped gilt shield, velvet field, raised "PO", plume and C-scrolls ----
  {
    const cx = 0, cy = openYc + frameB + 0.35, cz = wallZ1 + 1.07;
    const sh = new THREE.Shape();
    for (let i = 0; i <= 96; i++) {
      const a = (i / 96) * Math.PI * 2;
      const k = 1 + 0.07 * Math.sin(a * 8) + 0.05 * Math.cos(a * 2);
      const x = Math.cos(a) * 1.08 * k, y = Math.sin(a) * 0.86 * k;
      i ? sh.lineTo(x, y) : sh.moveTo(x, y);
    }
    const g = new THREE.ExtrudeGeometry(sh, { depth: 0.12, bevelEnabled: true, bevelThickness: 0.07, bevelSize: 0.07, bevelSegments: 3 });
    add('gold', place(THREE, g, { pos: [cx, cy, cz - 0.1] }));
    const field = new THREE.Shape();
    field.absellipse(0, 0, 0.8, 0.6, 0, Math.PI * 2, false, 0);
    add('velvet', place(THREE, new THREE.ExtrudeGeometry(field, { depth: 0.05, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.02, bevelSegments: 2 }), { pos: [cx, cy, cz + 0.06] }));
    add('gold', place(THREE, new THREE.TorusGeometry(1, 0.035, 6, 64), { pos: [cx, cy, cz + 0.1], scale: [0.82, 0.62, 1] }));
    // letters
    const P = new THREE.Shape();
    P.moveTo(0, 0); P.lineTo(0.15, 0); P.lineTo(0.15, 0.33); P.lineTo(0.3, 0.33);
    P.absarc(0.3, 0.585, 0.255, -Math.PI / 2, Math.PI / 2, false);
    P.lineTo(0, 0.84); P.closePath();
    const ph = new THREE.Path();
    ph.moveTo(0.15, 0.46); ph.lineTo(0.3, 0.46); ph.absarc(0.3, 0.585, 0.125, -Math.PI / 2, Math.PI / 2, false); ph.lineTo(0.15, 0.71); ph.closePath();
    P.holes.push(ph);
    const O = new THREE.Shape();
    O.absellipse(0, 0, 0.3, 0.42, 0, Math.PI * 2, false, 0);
    const oh = new THREE.Path();
    oh.absellipse(0, 0, 0.16, 0.28, 0, Math.PI * 2, true, 0);
    O.holes.push(oh);
    const lopt = { depth: 0.05, bevelEnabled: true, bevelThickness: 0.018, bevelSize: 0.014, bevelSegments: 2, curveSegments: 24 };
    const sc = 0.62;
    add('gold', place(THREE, new THREE.ExtrudeGeometry(P, lopt), { pos: [cx - 0.5, cy - 0.84 * sc / 2, cz + 0.13], scale: [sc, sc, 1] }));
    add('gold', place(THREE, new THREE.ExtrudeGeometry(O, lopt), { pos: [cx + 0.3, cy, cz + 0.13], scale: [sc, sc, 1] }));
    // plume of leaves above
    for (let i = 0; i < 9; i++) {
      const a = -1.05 + (2.1 * i) / 8;
      const len = 0.55 + 0.25 * Math.cos(a * 1.4);
      add('gold', place(THREE, new THREE.SphereGeometry(0.5, 12, 8), {
        pos: [cx + Math.sin(a) * (0.75 + len * 0.5), cy + 0.7 + Math.cos(a) * (0.25 + len * 0.5), cz - 0.02],
        rot: [0, 0, -a], scale: [0.17, len, 0.06],
      }));
    }
    add('gold', place(THREE, new THREE.SphereGeometry(0.16, 14, 10), { pos: [cx, cy + 1.62, cz] }));
    // C-scrolls and a bottom drop
    for (const sx of [-1, 1]) {
      add('gold', place(THREE, new THREE.TorusGeometry(0.3, 0.06, 8, 28, Math.PI * 1.4), { pos: [cx + sx * 1.25, cy - 0.15, cz - 0.02], rot: [0, sx < 0 ? Math.PI : 0, -0.9] }));
      add('gold', place(THREE, new THREE.SphereGeometry(0.08, 10, 8), { pos: [cx + sx * 1.38, cy - 0.5, cz] }));
    }
    add('gold', place(THREE, new THREE.ConeGeometry(0.16, 0.5, 14), { pos: [cx, cy - 1.05, cz - 0.03], rot: [Math.PI, 0, 0] }));
  }

  return {};
}
