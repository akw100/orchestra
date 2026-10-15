// Shared toolkit for the 3D musicians: THREE handle, cached materials/geometries/textures,
// geometry helpers (merge with vertex colours, cylinders between points, param surfaces),
// springs and scratch objects. Everything here is module-level and shared by every seat.
export let T = null;
export const MAT = {};
export const GEO = new Map();
export const S = {}; // scratch vectors / quats / matrices (never allocate per frame)
export const TAU = Math.PI * 2;
export const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
export function hash(n) { n = Math.imul(n ^ 0x9e3779b9, 2654435761) >>> 0; n ^= n >>> 15; n = Math.imul(n, 2246822519) >>> 0; n ^= n >>> 13; return (n >>> 0) / 4294967296; }

// critically-damped-ish spring on {x, v}; substeps keep it stable for stiff springs
export function spring(s, target, w, dt, z = 1) {
  const n = Math.max(1, Math.ceil((w * dt) / 0.25)), h = dt / n;
  for (let i = 0; i < n; i++) { s.v += (w * w * (target - s.x) - 2 * z * w * s.v) * h; s.x += s.v * h; }
  return s.x;
}
export const sp = (x = 0) => ({ x, v: 0 });

export const SKINS = ['#f2cdb0', '#e2b08c', '#c98e66', '#a86e48', '#7f4c30', '#5b3622'];
export const HAIRS = ['#1d1613', '#3b2417', '#6e4024', '#b98c4f', '#d9d4cb', '#8c3b1f'];

export function init(THREE) {
  if (T) return;
  T = THREE;
  const V = () => new T.Vector3();
  Object.assign(S, {
    a: V(), b: V(), c: V(), d: V(), e: V(), f: V(), g: V(), h: V(), u: V(), w: V(),
    q: new T.Quaternion(), q2: new T.Quaternion(), m: new T.Matrix4(), m2: new T.Matrix4(),
    X: V(), Y: V(), Z: V(), up: new T.Vector3(0, 1, 0), down: new T.Vector3(0, -1, 0), col: new T.Color(),
  });
  makeMaterials();
}

// ---------- colour parsing (theme tokens: #hex, rgb(r g b / a), rgb(r,g,b), hsl(...)) ----------
export function parseColor(str, fallback = '#888888', out = new T.Color()) {
  if (typeof str !== 'string' || !str.trim()) return out.set(fallback);
  const s = str.trim();
  const m = s.match(/^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i);
  if (m) return out.setRGB(+m[1] / 255, +m[2] / 255, +m[3] / 255, T.SRGBColorSpace);
  const h = s.match(/^hsla?\(\s*([\d.]+)(?:deg)?[\s,]+([\d.]+)%[\s,]+([\d.]+)%/i);
  if (h) return out.setHSL((+h[1] % 360) / 360, +h[2] / 100, +h[3] / 100, T.SRGBColorSpace);
  try { return out.setStyle(s); } catch { return out.set(fallback); }
}
export const pct = (v, d) => { const n = parseFloat(v); return Number.isFinite(n) ? n / 100 : d; };

// ---------- textures (drawn once) ----------
function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; t.anisotropy = 4; return t;
}
function sheetTex() {
  return canvasTex(512, 352, (g, w, h) => {
    g.fillStyle = '#f4ead4'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#e7d8b8'; g.fillRect(w / 2 - 2, 0, 4, h);
    let r = 7;
    for (let page = 0; page < 2; page++) {
      const x0 = page * w / 2 + 22, x1 = x0 + w / 2 - 44;
      g.fillStyle = '#3a2a22'; g.font = 'italic 15px Georgia, serif';
      if (!page) g.fillText('Canon', x0 + 70, 26);
      for (let s = 0; s < 7; s++) {
        const y0 = 44 + s * 43;
        g.strokeStyle = 'rgba(40,28,22,.75)'; g.lineWidth = 1.2;
        for (let l = 0; l < 5; l++) { g.beginPath(); g.moveTo(x0, y0 + l * 5); g.lineTo(x1, y0 + l * 5); g.stroke(); }
        for (let x = x0 + 14; x < x1 - 6; x += 13) {
          r = (r * 16807) % 2147483647; const p = r % 11, y = y0 + 22 - p * 2.5;
          g.fillStyle = '#21160f'; g.beginPath(); g.ellipse(x, y, 3.6, 2.6, -0.4, 0, 6.3); g.fill();
          g.fillRect(x + 2.6, y - 15, 1.3, 15);
          if (p < 1 || p > 9) { g.beginPath(); g.moveTo(x - 6, y); g.lineTo(x + 6, y); g.stroke(); }
        }
        g.fillRect(x1 - 1, y0, 2, 20);
      }
    }
  });
}
function logoTex() {
  return canvasTex(512, 512, (g, w) => {
    const c = w / 2, grd = g.createRadialGradient(c, c * 0.8, 20, c, c, c);
    grd.addColorStop(0, '#fbf5e6'); grd.addColorStop(1, '#e6d9bd');
    g.fillStyle = grd; g.fillRect(0, 0, w, w);
    g.strokeStyle = '#b8892f'; g.lineWidth = 14; g.beginPath(); g.arc(c, c, c - 34, 0, TAU); g.stroke();
    g.lineWidth = 3; g.beginPath(); g.arc(c, c, c - 56, 0, TAU); g.stroke();
    g.fillStyle = '#5a0f1e'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = 'italic 700 190px "Bodoni Moda", Didot, "Bodoni 72", Georgia, serif'; g.fillText('PO', c, c + 6);
    g.font = '600 30px Jost, Futura, "Avenir Next", sans-serif'; g.fillStyle = '#7a5418';
    const txt = 'POCKET · ORCHESTRA · ';
    for (let i = 0; i < txt.length; i++) {
      const a = -Math.PI * 0.95 + (i / txt.length) * Math.PI * 0.9;
      g.save(); g.translate(c + Math.cos(a) * (c - 96), c + Math.sin(a) * (c - 96)); g.rotate(a + Math.PI / 2); g.fillText(txt[i], 0, 0); g.restore();
    }
  });
}
function glowTex() {
  return canvasTex(128, 128, (g, w) => {
    const grd = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
    grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.35, 'rgba(255,255,255,.45)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd; g.fillRect(0, 0, w, w);
  });
}

// back-face shell pushed out along normals: gilt selection outline (shared, quantised levels)
function outlineMat(level) {
  const th = (0.005 + 0.011 * level).toFixed(4);
  const m = new T.MeshBasicMaterial({ color: '#f0cf7a', side: T.BackSide, transparent: true, opacity: 0.35 + 0.6 * level, depthWrite: false, toneMapped: false });
  m.onBeforeCompile = (sh) => { sh.vertexShader = sh.vertexShader.replace('#include <begin_vertex>', `vec3 transformed = position + normal * ${th};`); };
  m.customProgramCacheKey = () => 'po-outline-' + th;
  return m;
}

function makeMaterials() {
  const P = (o) => new T.MeshPhysicalMaterial(o), St = (o) => new T.MeshStandardMaterial(o);
  const GLOW = glowTex();
  Object.assign(MAT, {
    cloth: P({ vertexColors: true, roughness: 0.74, sheen: 0.6, sheenRoughness: 0.55, sheenColor: new T.Color('#4c4658') }),
    skins: SKINS.map((c) => St({ color: c, roughness: 0.6 })),
    hairs: HAIRS.map((c) => P({ color: c, roughness: 0.5, sheen: 0.7, sheenRoughness: 0.4, sheenColor: new T.Color(c).multiplyScalar(1.6), side: T.DoubleSide })),
    eye: St({ color: '#160f10', roughness: 0.25 }),
    mouth: St({ color: '#4a1a1e', roughness: 0.8 }),
    ebony: P({ color: '#151113', roughness: 0.3, clearcoat: 0.7, clearcoatRoughness: 0.2 }),
    lacquer: P({ color: '#0c0b0d', roughness: 0.18, clearcoat: 1, clearcoatRoughness: 0.05 }),
    varnish: P({ color: '#5c240c', roughness: 0.5, clearcoat: 0.35, clearcoatRoughness: 0.3, envMapIntensity: 0.5 }),
    maple: P({ color: '#cf9a5c', roughness: 0.42, clearcoat: 0.6, clearcoatRoughness: 0.2 }),
    brass: St({ color: '#e3ad4b', metalness: 0.92, roughness: 0.22 }),
    gold: St({ color: '#dcb45e', metalness: 0.95, roughness: 0.3 }),
    silver: St({ color: '#e6e9ee', metalness: 0.92, roughness: 0.16 }),
    chrome: St({ color: '#bcc1c9', metalness: 0.88, roughness: 0.26 }),
    steel: St({ color: '#26252b', metalness: 0.55, roughness: 0.42 }),
    copper: St({ color: '#c46d3c', metalness: 0.92, roughness: 0.3 }),
    bronze: St({ color: '#dcab4c', metalness: 0.92, roughness: 0.24 }),
    drumhead: St({ color: '#f2ecdf', roughness: 0.62 }),
    felt: St({ color: '#ede6d6', roughness: 1 }),
    rubber: St({ color: '#8e2030', roughness: 0.45 }),
    bowhair: St({ color: '#f1e8d4', roughness: 0.75 }),
    ivory: P({ color: '#f7f2e6', roughness: 0.28, clearcoat: 0.5 }),
    gut: St({ color: '#e9dcc0', roughness: 0.5 }),
    velvet: St({ color: '#8c1d2e', roughness: 0.92 }),
    paper: St({ map: sheetTex(), roughness: 0.92, side: T.DoubleSide }),
    kickHead: St({ map: logoTex(), roughness: 0.55 }),
    bulbOn: new T.MeshBasicMaterial({ color: '#ffe0a3', toneMapped: false }),
    bulbOff: St({ color: '#6c5b42', roughness: 0.5 }),
    glow: new T.MeshBasicMaterial({ map: GLOW, color: '#ffcf8a', transparent: true, opacity: 0.85, blending: T.AdditiveBlending, depthWrite: false, toneMapped: false }),
    batonTip: new T.MeshBasicMaterial({ color: '#fff3cf', toneMapped: false }),
    glowSprite: new T.SpriteMaterial({ map: GLOW, color: '#ffd796', transparent: true, blending: T.AdditiveBlending, depthWrite: false, toneMapped: false }),
    baton: St({ color: '#f5f1e8', roughness: 0.4 }),
    pick: new T.MeshBasicMaterial({ color: 0xff00ff, wireframe: true }),
    outline: [1, 2, 3, 4].map((i) => outlineMat(i / 4)),
    inst: new Map(),
  });
}

// per-instrument lacquer (shared by every seat of that instrument)
let HUE_S = 0.66, HUE_L = 0.42;
export function instMat(inst) {
  const key = inst.id || 'x';
  let m = MAT.inst.get(key);
  if (!m) {
    m = new T.MeshPhysicalMaterial({ roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.08 });
    m.userData.hue = inst.hue ?? 200; MAT.inst.set(key, m); tintInst(m);
  }
  return m;
}
function tintInst(m) { m.color.setHSL((m.userData.hue % 360) / 360, HUE_S * 0.8, HUE_L * 0.72, T.SRGBColorSpace); }

let themeSig = '';
export let DARK = true;
export function applySharedTheme(tok = {}) {
  const sig = [tok.bg, tok.accent, tok.accentHi, tok.velvet, tok.hueS, tok.hueLFill, tok.theme].join('|');
  if (sig === themeSig) return; themeSig = sig;
  const c = S.col; parseColor(tok.bg, '#0d0709', c);
  DARK = tok.theme ? tok.theme === 'dark' : (0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b) < 0.18;
  parseColor(tok.velvet, DARK ? '#6a0f22' : '#8c1d2e', MAT.velvet.color);
  const gilt = tok.accentHi || tok['accent-hi'] || tok.accent;
  MAT.outline.forEach((m) => parseColor(gilt, '#f2d99c', m.color));
  HUE_S = pct(tok.hueS ?? tok['hue-s'], 0.68);
  HUE_L = pct(tok.hueLFill ?? tok['hue-l-fill'], DARK ? 0.52 : 0.42);
  MAT.inst.forEach(tintInst);
  // concert black must read on both stages: more sheen under the evening rig, matte by day
  MAT.cloth.sheen = DARK ? 1 : 0.45;
  MAT.cloth.sheenColor.set(DARK ? '#7a7290' : '#4a4452');
  MAT.glow.opacity = DARK ? 0.95 : 0.55;
  MAT.hairs.forEach((m) => { m.sheen = DARK ? 0.9 : 0.5; });
}

// metals look black without an environment: build a neutral room env once if the scene has none
let envStarted = false;
export function ensureEnv(ctx) {
  if (envStarted) return; envStarted = true;
  const scene = ctx.scene, renderer = ctx.renderer;
  if (!renderer || !ctx.addons) return;
  const apply = (tex) => {
    const list = [MAT.brass, MAT.gold, MAT.silver, MAT.chrome, MAT.steel, MAT.copper, MAT.bronze, MAT.varnish, MAT.maple, MAT.ebony, MAT.lacquer, MAT.ivory, ...MAT.inst.values()];
    list.forEach((m) => { if (!m.envMap) { m.envMap = tex; m.envMapIntensity = m.metalness > 0.5 ? 0.9 : 0.45; m.needsUpdate = true; } });
    MAT.envTex = tex;
  };
  setTimeout(() => {
    if (scene && scene.environment) return; // core provides one: materials pick it up automatically
    ctx.addons('environments/RoomEnvironment.js').then(({ RoomEnvironment }) => {
      if (scene && scene.environment) return;
      const pm = new T.PMREMGenerator(renderer), room = new RoomEnvironment();
      const tex = pm.fromScene(room, 0.04).texture; pm.dispose(); room.dispose?.();
      apply(tex);
    }).catch(() => {});
  }, 0);
}

// ---------- geometry helpers ----------
export function geo(name, fn) { let g = GEO.get(name); if (!g) { g = fn(); GEO.set(name, g); } return g; }

// merge [geometry, colour?] pairs into one non-indexed geometry with position/normal/(color)/(uv)
export function merge(parts, withColor = false, withUV = false) {
  let n = 0;
  const gs = parts.filter(Boolean).map((p) => {
    const [g0, c] = Array.isArray(p) ? p : [p];
    const g = g0.index ? g0.toNonIndexed() : g0;
    if (g !== g0) g0.dispose();
    if (!g.attributes.normal) g.computeVertexNormals();
    n += g.attributes.position.count; return [g, c];
  });
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), col = withColor ? new Float32Array(n * 3) : null, uv = withUV ? new Float32Array(n * 2) : null;
  let o = 0; const cc = new T.Color();
  for (const [g, c] of gs) {
    const cnt = g.attributes.position.count;
    pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3);
    if (col) { cc.set(c ?? '#ffffff'); for (let i = 0; i < cnt; i++) { col[(o + i) * 3] = cc.r; col[(o + i) * 3 + 1] = cc.g; col[(o + i) * 3 + 2] = cc.b; } }
    if (uv && g.attributes.uv) uv.set(g.attributes.uv.array, o * 2);
    o += cnt; g.dispose();
  }
  const out = new T.BufferGeometry();
  out.setAttribute('position', new T.BufferAttribute(pos, 3));
  out.setAttribute('normal', new T.BufferAttribute(nor, 3));
  if (col) out.setAttribute('color', new T.BufferAttribute(col, 3));
  if (uv) out.setAttribute('uv', new T.BufferAttribute(uv, 2));
  out.computeBoundingSphere(); out.computeBoundingBox();
  return out;
}

// cylinder (or cone) from point a to point b
export function cyl(a, b, r1, r2 = r1, seg = 8, open = false) {
  const A = new T.Vector3(...a), B = new T.Vector3(...b), d = B.clone().sub(A), len = d.length();
  const g = new T.CylinderGeometry(r2, r1, len, seg, 1, open);
  g.translate(0, len / 2, 0);
  g.applyQuaternion(new T.Quaternion().setFromUnitVectors(new T.Vector3(0, 1, 0), d.normalize()));
  g.translate(A.x, A.y, A.z);
  return g;
}
export const box = (w, h, d, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) => {
  const g = new T.BoxGeometry(w, h, d);
  if (rx) g.rotateX(rx); if (ry) g.rotateY(ry); if (rz) g.rotateZ(rz);
  return g.translate(x, y, z);
};
export const ball = (r, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1, ws = 12, hs = 9) => new T.SphereGeometry(r, ws, hs).scale(sx, sy, sz).translate(x, y, z);
export const lathe = (pts, seg = 24) => new T.LatheGeometry(pts.map(([r, y]) => new T.Vector2(r, y)), seg);
export function tube(points, r, seg = 48, rs = 7) {
  return new T.TubeGeometry(new T.CatmullRomCurve3(points.map((p) => new T.Vector3(...p))), seg, r, rs, false);
}
// parametric surface: f(u, v, out:Vector3) with u,v in [0,1]
export function param(nu, nv, f) {
  const pos = [], idx = [], p = new T.Vector3();
  for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) { f(i / nu, j / nv, p); pos.push(p.x, p.y, p.z); }
  for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
    const a = j * (nu + 1) + i, b = a + 1, c = a + nu + 1, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
  return g;
}
// orientation from a "long axis" (local +Y) and an "up/face" hint (local +Z)
export function basisQuat(d, u, out = new T.Quaternion()) {
  const Y = S.Y.set(...d).normalize(), Z = S.Z.set(...u);
  Z.addScaledVector(Y, -Z.dot(Y)).normalize();
  const X = S.X.crossVectors(Y, Z);
  S.m.makeBasis(X, Y, Z); return out.setFromRotationMatrix(S.m);
}
// pose whose local `anchor` point lands on `target` (parent space)
export function pose(target, anchor, d, u, scale = 1) {
  const q = basisQuat(d, u), p = new T.Vector3(...anchor).multiplyScalar(scale).applyQuaternion(q);
  return { p: new T.Vector3(...target).sub(p), q };
}
export function mesh(g, m, parent, cast = true) {
  const o = new T.Mesh(g, m); o.castShadow = cast; o.receiveShadow = false; o.matrixAutoUpdate = true;
  if (parent) parent.add(o); return o;
}
// local point of a transformed (p, q, scale) frame into parent space
export function xf(out, p, q, s, x, y, z) { return out.set(x * s.x, y * s.y, z * s.z).applyQuaternion(q).add(p); }
