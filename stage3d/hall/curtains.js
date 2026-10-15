// Main house curtains (two velvet halves deformed on the GPU), their bullion fringe, rope tiebacks with
// tassels, and a swagged valance with jabots, fringe and tassels.
import { DIM, place, tube } from './util.js';

const CW = 10.75;   // fabric width of one half when closed (meets at x = 0, hides under the frame at |x| > 10.4)
const CH = 9.75;    // track height
const FL = 0.30;    // fringe length (hem sits this high when closed so the fringe kisses the floor)
const QT = 0.36;    // fabric height (0 hem .. 1 track) where the tieback grips
const YT = 3.35;    // world height of the tieback
const ZC = DIM.curtainZ;

// GLSL: fabric coordinate st = (p: 0 leading edge .. 1 outer edge, q: 0 hem .. 1 track) → object position.
const DRAPE = /* glsl */ `
uniform float uTop;      // open amount at the track (spring, may overshoot)
uniform float uHem;      // open amount at the hem (lags the top, sways)
uniform float uSide;     // -1 house left half, +1 house right half
uniform float uTime;
uniform float uBreath;   // idle air movement
uniform float uFlutter;  // hem flutter while moving
attribute vec2 aDrape;
const float CW = ${CW.toFixed(3)};
const float CH = ${CH.toFixed(3)};
const float FL = ${FL.toFixed(3)};
const float QT = ${QT.toFixed(3)};
const float YT = ${YT.toFixed(3)};
const float ZC = ${ZC.toFixed(3)};
vec3 drape(vec2 st) {
  float p = st.x;
  float q = st.y;
  float o = mix(uHem, uTop, pow(clamp(q, 0.0, 1.0), 0.55));
  float oc = clamp(o, 0.0, 1.0);
  // closed: hangs straight
  float dC = mix(-0.04, CW, p);
  float yC = mix(FL, CH, q);
  // open: gathered to the side and tied back (hourglass swag)
  float dTop = mix(6.6, CW, p);
  float dTie = mix(CW - 1.35, CW - 0.30, p);
  float dHem = mix(CW - 2.35, CW - 0.05, p);
  float yHem = mix(FL + 0.95, FL, pow(clamp(p, 0.0, 1.0), 0.6));
  float dO; float yO;
  if (q > QT) {
    float t = (q - QT) / (1.0 - QT);
    yO = mix(YT, CH, t);
    dO = mix(dTie, dTop, pow(max(t, 0.0), 0.72));
  } else {
    float t = q / QT;
    yO = mix(yHem, YT, t);
    float u = 1.0 - t;
    dO = mix(dHem, dTie, 1.0 - u * u);
  }
  float d = mix(dC, dO, o);
  float y = mix(yC, yO, oc);
  // pleats: constant count in fabric space, so they bunch and deepen as the half gathers
  float pinch = exp(-pow((q - QT) / 0.17, 2.0)) * oc;
  float amp = mix(0.2, 0.36, oc) * (1.0 + 0.6 * pinch);
  amp *= 0.82 + 0.18 * sin(p * 41.0 + 1.3) + 0.10 * sin(p * 97.0 + q * 0.7);
  amp *= smoothstep(0.0, 0.02, p);
  float th = p * 6.2831853 * 15.0 + 0.55 * sin(p * 17.0 + q * 2.1) + (1.0 - q) * 0.4 * sin(p * 23.0);
  float f = sin(th) + 0.22 * sin(2.0 * th + 1.1);
  float z = ZC - amp * (0.55 + 0.45 * f);
  d += amp * 0.22 * cos(th);
  // air: a slow billow, stronger low; flutter while the hem is travelling
  float low = (1.0 - q) * (1.0 - q);
  z += uBreath * (0.35 + 0.65 * (1.0 - q)) * 0.05 * sin(uTime * 0.55 + p * 5.0 + q * 1.7 + uSide);
  z += uFlutter * low * 0.16 * sin(p * 11.0 - uTime * 3.1 + uSide);
  y += uFlutter * low * 0.05 * sin(p * 7.0 + uTime * 2.3);
  z += uSide > 0.0 ? -0.05 : 0.0;   // right half hangs just behind the left at the overlap
  return vec3(uSide * d, y, z);
}
`;

const CURTAIN_NORMAL = /* glsl */ `
vec3 dPos = drape(aDrape);
vec3 dPu = drape(aDrape + vec2(0.0012, 0.0));
vec3 dPv = drape(aDrape + vec2(0.0, 0.003));
vec3 objectNormal = normalize(cross(dPu - dPos, dPv - dPos));
#ifdef USE_TANGENT
vec3 objectTangent = vec3( tangent.xyz );
#endif
`;

const FRINGE_NORMAL = /* glsl */ `
vec3 dHemP = drape(vec2(aDrape.x, 0.0));
vec3 dPu = drape(vec2(aDrape.x + 0.0012, 0.0));
vec3 dPv = drape(vec2(aDrape.x, 0.003));
vec3 objectNormal = normalize(cross(dPu - dHemP, dPv - dHemP));
float sw = (1.0 - aDrape.y);
vec3 dPos = dHemP + vec3(0.0, -FL * sw, 0.0);
dPos.z += sw * (0.02 * sin(uTime * 1.7 + aDrape.x * 40.0) + uFlutter * 0.08 * sin(uTime * 4.0 + aDrape.x * 13.0));
#ifdef USE_TANGENT
vec3 objectTangent = vec3( tangent.xyz );
#endif
`;

function drapeify(mat, uniforms, fringe) {
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\n' + DRAPE)
      .replace('#include <beginnormal_vertex>', fringe ? FRINGE_NORMAL : CURTAIN_NORMAL)
      .replace('#include <begin_vertex>', 'vec3 transformed = dPos;');
  };
  mat.customProgramCacheKey = () => (fringe ? 'po-hall-fringe' : 'po-hall-curtain');
  return mat;
}

// CPU twin of the GLSL (no pleats) for placing the tieback rope on the gathered bundle.
function drapeCPU(p, q, top, hem) {
  const o = hem + (top - hem) * Math.pow(Math.min(1, Math.max(0, q)), 0.55);
  const oc = Math.min(1, Math.max(0, o));
  const dC = -0.04 + (CW + 0.04) * p, yC = FL + (CH - FL) * q;
  const dTie = CW - 1.35 + 1.05 * p;
  return { d: dC + (dTie - dC) * o, y: yC + (YT - yC) * oc, o: oc };
}

function tasselGeometry(THREE, len = 0.72, r = 1) {
  // profile bottom → top, closed at both ends
  const P = [
    [0.0, -0.69], [0.11, -0.68], [0.095, -0.56], [0.06, -0.38], [0.05, -0.35], [0.042, -0.33],
    [0.052, -0.31], [0.036, -0.29], [0.042, -0.27], [0.072, -0.24], [0.078, -0.19], [0.05, -0.14],
    [0.016, -0.12], [0.016, 0.0], [0.0, 0.0],
  ];
  const k = len / 0.69;
  const pts = P.map(([x, y]) => new THREE.Vector2(x * r * Math.max(0.8, k * 0.9), y * k));
  return new THREE.LatheGeometry(pts, 14);
}

export function buildCurtains(ctx, mats, add, tex) {
  const { THREE } = ctx;
  const group = new THREE.Group();
  group.name = 'curtains';
  const low = ctx.quality === 'low';
  const SX = low ? 90 : 150, SY = low ? 48 : 80;

  // ---- curtain halves ----
  const geo = new THREE.PlaneGeometry(1, 1, SX, SY);
  geo.setAttribute('aDrape', geo.attributes.uv.clone());
  const fgeo = new THREE.PlaneGeometry(1, 1, low ? 160 : 300, 1);
  fgeo.setAttribute('aDrape', fgeo.attributes.uv.clone());
  {
    const uv = fgeo.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * 36);
  }
  const halves = [];
  for (const side of [-1, 1]) {
    const uniforms = {
      uTop: { value: 1 }, uHem: { value: 1 }, uSide: { value: side }, uTime: { value: 0 },
      uBreath: { value: ctx.reducedMotion ? 0 : 1 }, uFlutter: { value: 0 },
    };
    const mat = drapeify(mats.curtain.clone(), uniforms, false);
    const fmat = drapeify(mats.fringe.clone(), uniforms, true);
    const g = geo.clone();
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(side * 5.4, CH / 2, ZC), 9.5);
    const fg = fgeo.clone();
    fg.boundingSphere = new THREE.Sphere(new THREE.Vector3(side * 5.4, 1.5, ZC), 7.5);
    const mesh = new THREE.Mesh(g, mat);
    mesh.name = side < 0 ? 'curtain-left' : 'curtain-right';
    mesh.receiveShadow = true;
    const fringe = new THREE.Mesh(fg, fmat);
    group.add(mesh, fringe);
    halves.push({ side, uniforms, mat, fmat, mesh, fringe });
  }
  geo.dispose(); fgeo.dispose();

  // ---- tiebacks: rope loop around the gathered bundle + tassel on a cord ----
  const ringPts = [];
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    ringPts.push([Math.cos(a) * 0.62, Math.sin(a * 2) * 0.03, Math.sin(a) * 0.38]);
  }
  const ringGeo = tube(THREE, ringPts, 0.045, 64, 8, true);
  const tasselGeo = tasselGeometry(THREE, 0.78, 1.25);
  const cordGeo = tube(THREE, [[0, 0, 0.38], [0.02, -0.12, 0.42], [0.0, -0.3, 0.44]], 0.014, 12, 5);
  const tiebacks = [];
  for (const side of [-1, 1]) {
    const g = new THREE.Group();
    const ring = new THREE.Mesh(ringGeo, mats.rope);
    const hang = new THREE.Group();
    hang.position.set(0, -0.3, 0.44);
    const tassel = new THREE.Mesh(tasselGeo, mats.gold);
    hang.add(tassel);
    g.add(ring, new THREE.Mesh(cordGeo, mats.rope), hang);
    group.add(g);
    tiebacks.push({ side, g, ring, hang });
  }

  // ---- valance: 5 swags with horizontal drape folds, jabots between, fringe and tassels ----
  const VS = 5, VX0 = -11.0, VX1 = 11.0, VT = 9.95, VZ = 2.02;
  const vnx = low ? 140 : 240, vny = low ? 16 : 28;
  const swag = (s) => { const f = (s * VS) % 1; return 4 * f * (1 - f); };
  const vBottom = (s) => 9.05 - 1.05 * swag(s);
  const vZ = (s, v) => {
    const sg = swag(s);
    return VZ + 0.36 * sg * Math.sin(Math.PI * Math.pow(v, 0.85)) +
      0.075 * sg * Math.sin(v * Math.PI * 7 + 0.4) * (1 - v * 0.5) +
      0.05 * Math.pow(1 - sg, 3) * Math.sin(s * Math.PI * 2 * 70);
  };
  {
    const vg = new THREE.PlaneGeometry(1, 1, vnx, vny);
    const p = vg.attributes.position, uv = vg.attributes.uv;
    for (let i = 0; i < p.count; i++) {
      const s = uv.getX(i), v = uv.getY(i);
      const yb = vBottom(s);
      p.setXYZ(i, VX0 + (VX1 - VX0) * s, yb + (VT - yb) * v, vZ(s, v));
    }
    vg.computeVertexNormals();
    add('valance', vg);
    // fringe following the scalloped edge
    const fg = new THREE.PlaneGeometry(1, 1, vnx * 2, 1);
    const fp = fg.attributes.position, fuv = fg.attributes.uv;
    for (let i = 0; i < fp.count; i++) {
      const s = fuv.getX(i), v = fuv.getY(i);
      const yb = vBottom(s);
      fp.setXYZ(i, VX0 + (VX1 - VX0) * s, yb - 0.34 * (1 - v) + 0.02, vZ(s, 0) + 0.01);
      fuv.setX(i, s * 76);
    }
    fg.computeVertexNormals();
    const fm = new THREE.Mesh(fg, mats.fringe);
    fm.name = 'valance-fringe';
    group.add(fm);
    // jabots + tassels at the four interior hanging points
    for (let k = 1; k < VS; k++) {
      const x = VX0 + ((VX1 - VX0) * k) / VS;
      const jg = new THREE.PlaneGeometry(1, 1, 14, 12);
      const jp = jg.attributes.position, juv = jg.attributes.uv;
      for (let i = 0; i < jp.count; i++) {
        const s = juv.getX(i), v = juv.getY(i);
        const yb = 7.55 + 0.55 * Math.abs(s - 0.5) * 2;
        const w = 0.78 * (0.75 + 0.25 * v);
        jp.setXYZ(i, x + (s - 0.5) * w, yb + (VT - 0.05 - yb) * v, VZ + 0.2 + 0.09 * Math.abs(Math.sin(s * Math.PI * 3)) + 0.04 * (1 - v));
      }
      jg.computeVertexNormals();
      add('valance', jg);
      const t = tasselGeometry(THREE, 0.7, 1.15);
      add('gold', place(THREE, t, { pos: [x, 9.0, VZ + 0.36] }));
      // gilt boss where the swags are caught up
      add('gold', place(THREE, new THREE.SphereGeometry(0.13, 16, 10), { pos: [x, 9.12, VZ + 0.32], scale: [1, 1, 0.6] }));
    }
  }

  // ---- curtain physics: a driven spring at the track and a looser one at the hem ----
  const st = { top: 1, hem: 1, vt: 0, vh: 0, drive: 1, from: 1, to: 1, el: 1, dur: 3 };
  const ease = (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);

  function setCurtains(open, opts = {}) {
    const to = open ? 1 : 0;
    let dur = opts.duration ?? (open ? 3.4 : 2.8);
    if (ctx.reducedMotion) dur = Math.min(dur, 0.9);
    if (dur <= 0) {
      st.top = st.hem = st.drive = st.from = st.to = to;
      st.vt = st.vh = 0; st.el = st.dur = 1;
      return;
    }
    st.from = st.drive; st.to = to; st.el = 0; st.dur = dur;
  }

  let swayT = 0;
  function update(frame) {
    const dt = Math.min(0.05, Math.max(0, frame.dt || 0));
    st.el += dt;
    const k = Math.min(1, st.el / (st.dur * 0.78));
    st.drive = st.from + (st.to - st.from) * ease(k);
    const sc = 3 / Math.max(0.6, st.dur);
    const K1 = 60 * sc * sc, C1 = 10 * sc * (ctx.reducedMotion ? 1.6 : 1);
    const K2 = 15 * sc * sc, C2 = 3.0 * sc * (ctx.reducedMotion ? 2.6 : 1);
    const n = Math.max(1, Math.ceil(dt / (1 / 120)));
    const h = dt / n;
    for (let i = 0; i < n; i++) {
      st.vt += (K1 * (st.drive - st.top) - C1 * st.vt) * h;
      st.top += st.vt * h;
      st.vh += (K2 * (st.top - st.hem) - C2 * st.vh) * h;
      st.hem += st.vh * h;
    }
    const flutter = ctx.reducedMotion ? 0 : Math.min(1, Math.abs(st.vh) * 0.9 + Math.abs(st.vt) * 0.3);
    const breath = ctx.reducedMotion ? 0 : 0.7 + 0.6 * (frame.level || 0);
    for (const hv of halves) {
      const u = hv.uniforms;
      u.uTop.value = st.top; u.uHem.value = st.hem; u.uTime.value = frame.t || 0;
      u.uFlutter.value = flutter; u.uBreath.value = breath;
    }
    // tiebacks ride the gathered bundle; when closed they hang hidden behind the frame jambs
    const tie = drapeCPU(0.5, QT, st.top, st.hem);
    const reveal = Math.min(1, Math.max(0, (tie.o - 0.25) / 0.6));
    swayT += dt;
    for (const tb of tiebacks) {
      const hookD = CW + 0.35;
      const d = hookD + (tie.d - hookD) * reveal;
      tb.g.position.set(tb.side * d, YT + (1 - reveal) * 0.2, ZC - 0.26 + (1 - reveal) * 0.2);
      const s = 0.35 + 0.65 * reveal;
      tb.ring.scale.set(s, 1, s);
      tb.hang.position.z = 0.44 * s;
      tb.hang.rotation.z = ctx.reducedMotion ? 0 : Math.sin(swayT * 1.9 + tb.side) * 0.06 + st.vh * 0.25 * tb.side;
      tb.hang.rotation.x = ctx.reducedMotion ? 0 : Math.sin(swayT * 1.3 + 1 + tb.side) * 0.04;
    }
  }

  // clones share maps with the base materials; copy the scalar/colour state after a theme change
  function syncMaterials() {
    for (const hv of halves) {
      for (const [dst, src] of [[hv.mat, mats.curtain], [hv.fmat, mats.fringe]]) {
        dst.color.copy(src.color);
        if (dst.sheenColor && src.sheenColor) dst.sheenColor.copy(src.sheenColor);
        dst.envMapIntensity = src.envMapIntensity;
        dst.emissive.copy(src.emissive);
        dst.needsUpdate = false;
      }
    }
  }

  return { group, setCurtains, update, syncMaterials, state: st };
}
