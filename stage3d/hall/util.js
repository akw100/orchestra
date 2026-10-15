// Shared helpers for the 3D hall: dimensions, seeded RNG, colour parsing, static-geometry buckets.

// Hall dimensions (meters, Y up). Riser numbers are the Wave 4 contract; the rest is the hall's own.
export const DIM = {
  stageHalfW: 11.4,          // stage-house side walls
  backZ: -11,                // upstage wall
  houseY: -1.1,              // house floor
  curtainZ: 1.62,            // main curtain line (behind the proscenium, in front of the podium)
  wallZ0: 2.3, wallZ1: 2.72, // proscenium wall slab
  openA: 10.4, openB: 2.1, openYc: 7.5,   // opening: straight jambs to y=7.5, elliptical head peaking at 9.6
  frameA: 11.75, frameB: 3.15,            // gilded frame outer edge
  houseHalfW: 15.5, houseBackZ: 29, ceilY: 15.5,
  rows: 24, row0Z: 5.7, rowDZ: 0.95, rowDY: 0.17,
};
export const apronZ = (x) => 2.95 + 0.75 * (1 - Math.min(1, (x / DIM.stageHalfW) ** 2));
export const RISER = {
  cz: 1.6,
  R: (t) => 4.2 + 1.55 * t,
  A: (t) => ((78 - 7 * t) * Math.PI) / 180,
  H: (t) => 0.32 * t,
};
export const rowZ = (i) => DIM.row0Z + DIM.rowDZ * i;
export const rowY = (i) => DIM.houseY + DIM.rowDY * (i + 1);

export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Theme tokens use modern CSS syntax ("rgb(214 150 40 / 0.38)") that THREE.Color.setStyle rejects.
export function parseColor(THREE, str, fallback = '#808080', out = new THREE.Color()) {
  const s = String(str ?? '').trim();
  if (!s) return out.set(fallback);
  if (s[0] === '#') {
    const hex = s.length === 9 ? s.slice(0, 7) : s.length === 5 ? s.slice(0, 4) : s;
    try { return out.set(hex); } catch { return out.set(fallback); }
  }
  const m = s.match(/^(rgba?|hsla?)\(([^)]*)\)/i);
  if (m) {
    const n = m[2].split(/[\s,/]+/).filter(Boolean);
    if (m[1][0].toLowerCase() === 'r') {
      const v = n.slice(0, 3).map((x) => (x.endsWith('%') ? parseFloat(x) * 2.55 : parseFloat(x)) / 255);
      if (v.every(Number.isFinite)) return out.setRGB(v[0], v[1], v[2], THREE.SRGBColorSpace);
    } else {
      const h = parseFloat(n[0]) / 360, sat = parseFloat(n[1]) / 100, l = parseFloat(n[2]) / 100;
      if ([h, sat, l].every(Number.isFinite)) return out.setHSL(((h % 1) + 1) % 1, sat, l, THREE.SRGBColorSpace);
    }
  }
  try { out.setStyle(s); } catch { out.set(fallback); }
  return out;
}

export const cssOf = (THREE, c) => '#' + c.getHexString(THREE.SRGBColorSpace);

// ---- static geometry buckets: everything that never moves is merged into one mesh per material ----
export function makeBuckets(THREE) {
  const map = new Map();
  return {
    add(key, geom) {
      const g = geom.index ? geom.toNonIndexed() : geom;
      if (!g.attributes.normal) g.computeVertexNormals();
      if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(g);
      if (g !== geom) geom.dispose();
    },
    map,
  };
}

export function mergeGeoms(THREE, list) {
  let n = 0;
  for (const g of list) n += g.attributes.position.count;
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = new Float32Array(n * 2);
  let o = 0;
  for (const g of list) {
    const c = g.attributes.position.count;
    pos.set(g.attributes.position.array.subarray(0, c * 3), o * 3);
    nor.set(g.attributes.normal.array.subarray(0, c * 3), o * 3);
    uv.set(g.attributes.uv.array.subarray(0, c * 2), o * 2);
    o += c;
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.computeBoundingSphere();
  out.computeBoundingBox();
  return out;
}

// Split a non-indexed geometry with groups (e.g. ExtrudeGeometry: 0 caps, 1 sides) into one geometry per group.
export function splitGroups(THREE, geom) {
  const g = geom.index ? geom.toNonIndexed() : geom;
  const out = {};
  const groups = g.groups.length ? g.groups : [{ start: 0, count: g.attributes.position.count, materialIndex: 0 }];
  for (const gr of groups) {
    const part = new THREE.BufferGeometry();
    for (const name of ['position', 'normal', 'uv']) {
      const a = g.attributes[name];
      if (!a) continue;
      part.setAttribute(name, new THREE.BufferAttribute(a.array.slice(gr.start * a.itemSize, (gr.start + gr.count) * a.itemSize), a.itemSize));
    }
    (out[gr.materialIndex] ||= []).push(part);
  }
  return out;
}

// Transform helper: returns geom after applying translate/rotate/scale (rot = Euler xyz in radians).
const _m = { m: null, q: null, e: null, p: null, s: null };
export function place(THREE, geom, { pos = [0, 0, 0], rot = [0, 0, 0], scale = [1, 1, 1] } = {}) {
  _m.m ||= new THREE.Matrix4(); _m.q ||= new THREE.Quaternion(); _m.e ||= new THREE.Euler();
  _m.p ||= new THREE.Vector3(); _m.s ||= new THREE.Vector3();
  _m.e.set(rot[0], rot[1], rot[2]);
  _m.q.setFromEuler(_m.e);
  _m.m.compose(_m.p.set(pos[0], pos[1], pos[2]), _m.q, _m.s.set(scale[0], scale[1], scale[2]));
  geom.applyMatrix4(_m.m);
  return geom;
}

// Extrude a plan-view shape (shape x = world x, shape y = -world z) between two heights.
export function extrudeY(THREE, shape, y0, y1, extra = {}) {
  const g = new THREE.ExtrudeGeometry(shape, { depth: y1 - y0, bevelEnabled: false, steps: 1, curveSegments: 24, ...extra });
  g.rotateX(-Math.PI / 2);
  g.translate(0, y0, 0);
  return g;
}

// Tube through a list of [x,y,z] points.
export function tube(THREE, pts, radius, segs = 64, radial = 8, closed = false) {
  const curve = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(p[0], p[1], p[2])), closed, 'centripetal');
  return new THREE.TubeGeometry(curve, segs, radius, radial, closed);
}

// Opening / frame outline of the proscenium: straight jambs from y0 up to yc, then a semi-ellipse.
export function archPoints(a, b, yc, y0, n = 48) {
  const pts = [[-a, y0], [-a, yc]];
  for (let i = 1; i < n; i++) {
    const th = Math.PI - (Math.PI * i) / n;
    pts.push([a * Math.cos(th), yc + b * Math.sin(th)]);
  }
  pts.push([a, yc], [a, y0]);
  return pts;
}
