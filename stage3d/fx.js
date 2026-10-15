// Pocket Orchestra 3D: particle effects + volumetric beams (owned by 3D-D).
// createFX(ctx) -> { emit(type, opts), beam(from, to, opts), update(frame), applyTheme(tok), dispose() }
//   emit types: 'note' | 'ring' | 'sparkle' | 'goldrain' | 'pulse'. Ambient dust is always on.
// Everything is GPU-animated: CPU only writes spawn parameters into pooled ring buffers
// (dirty-range uploads, zero per-frame allocations). One blend mode for both themes:
// premultiplied ONE / ONE_MINUS_SRC_ALPHA, where alpha 0 = additive (Evening) and alpha > 0 = "over" (Matinée).

const GLYPHS = ['♪', '♫', '♩', '♬', '\u{1D11E}', '\u{1D122}', '♯', '♭']; // ♪ ♫ ♩ ♬ 𝄞 𝄢 ♯ ♭
const PODIUM = [0, 0, 0.9];
const MAXB = 16; // beams that light the dust
const CELL_LOW = [2, 5, 0, 2], CELL_HIGH = [0, 3, 4, 1, 6], CELL_MID = [0, 1, 2, 3, 0, 1, 7];

// Riser surface height under (x, z) from the stage contract (tiers 1..4, arc centre z=1.6).
function surfaceY(x, z) {
  const dz = z - 1.6, r = Math.hypot(x, dz);
  const t = Math.floor((r - 3.42) / 1.55);
  if (t < 1 || t > 4) return 0;
  const a = Math.abs(Math.atan2(x, -dz)) * 57.29578;
  return a <= 78 - 7 * t ? 0.32 * t : 0;
}

// ---------- shared GLSL ----------
const COMMON = /* glsl */ `
float h11(float n){ return fract(sin(n)*43758.5453123); }
vec3 rotAx(vec3 v, vec3 k, float a){ float c = cos(a), s = sin(a); return v*c + cross(k, v)*s + k*dot(k, v)*(1.0 - c); }
float vnoise(vec3 x){
  vec3 i = floor(x), f = fract(x); f = f*f*(3.0 - 2.0*f);
  float n = i.x + i.y*57.0 + i.z*113.0;
  return mix(mix(mix(h11(n), h11(n+1.0), f.x), mix(h11(n+57.0), h11(n+58.0), f.x), f.y),
             mix(mix(h11(n+113.0), h11(n+114.0), f.x), mix(h11(n+170.0), h11(n+171.0), f.x), f.y), f.z);
}
`;
const DEAD = 'gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 0.0; return;';

// ---------- glyphs: R = crisp glyph, G = soft glow ----------
const GLYPH_VS = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>
attribute vec4 aMisc;  // birth, life, size(m), cell
attribute vec4 aMove;  // vx, vz, rise, seed
attribute vec3 aColor;
uniform float uTime, uPx, uMaxPt, uRM;
varying vec3 vColor; varying float vAlpha, vAng, vHot; varying vec2 vCell;
${COMMON}
void main(){
  float age = uTime - aMisc.x, u = age / aMisc.y;
  if (u < 0.0 || u > 1.0) { ${DEAD} }
  float seed = aMove.w;
  vec3 p = position;
  p.y += aMove.z * (1.0 - (1.0 - u)*(1.0 - u));
  p.xz += aMove.xy * age * (1.0 - 0.5*u);
  float t = uTime*0.7; vec3 q = p*0.9;
  vec3 curl = vec3(sin(q.y*1.7 + t + seed*6.283) + 0.6*sin(q.z*2.3 - t*1.3),
                   0.25*sin(q.x*1.9 + t*1.1 + seed*3.0),
                   cos(q.y*1.5 - t*0.9 + seed*4.0) + 0.6*cos(q.x*2.1 + t*1.2));
  p += curl * 0.17 * u * (1.0 - 0.8*uRM);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  #include <logdepthbuf_vertex>
  float pop = smoothstep(0.0, 0.07, u) * (1.0 + 0.5*exp(-age*7.0)*(1.0 - uRM));
  gl_PointSize = min(aMisc.z * pop * (1.0 - 0.25*u) * uPx / max(-mv.z, 0.1), uMaxPt);
  vAlpha = smoothstep(0.0, 0.04, u) * (1.0 - smoothstep(0.55, 1.0, u));
  vAng = (sin(age*2.3 + seed*9.0)*0.38 + (seed - 0.5)*0.5) * (1.0 - uRM);
  vCell = vec2(mod(aMisc.w, 4.0), floor(aMisc.w / 4.0));
  vColor = aColor; vHot = exp(-age*4.0);
}`;
const GLYPH_FS = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_fragment>
uniform sampler2D uAtlas; uniform float uAdd;
varying vec3 vColor; varying float vAlpha, vAng, vHot; varying vec2 vCell;
void main(){
  #include <logdepthbuf_fragment>
  vec2 c = gl_PointCoord - 0.5; float s = sin(vAng), co = cos(vAng);
  c = mat2(co, -s, s, co) * c + 0.5;
  if (c.x < 0.0 || c.y < 0.0 || c.x > 1.0 || c.y > 1.0) discard;
  vec4 tx = texture2D(uAtlas, vec2((vCell.x + c.x) * 0.25, 1.0 - (vCell.y + c.y) * 0.5));
  float core = tx.r, glow = tx.g;
  vec3 hot = mix(vColor, vec3(1.0), 0.3 + 0.45*vHot);
  vec3 dark = vColor * glow * 0.85 + hot * core * (1.5 + 2.2*vHot);
  float ha = glow * 0.5 * (1.0 - core);
  vec3 light = vColor * core + vec3(1.0, 0.97, 0.9) * ha;
  float la = core + ha;
  gl_FragColor = vec4(mix(light, dark, uAdd) * vAlpha, mix(la, 0.0, uAdd) * vAlpha);
}`;

// ---------- sparkles: 4-point glints ----------
const SPARK_VS = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>
attribute vec4 aVel;   // vx, vy, vz, gravity
attribute vec4 aMisc;  // birth, life, size, seed
attribute vec3 aColor;
uniform float uTime, uPx, uMaxPt;
varying vec3 vColor; varying float vAlpha, vTw, vRot;
void main(){
  float age = uTime - aMisc.x, u = age / aMisc.y;
  if (u < 0.0 || u > 1.0) { ${DEAD} }
  float drag = 2.4, k = (1.0 - exp(-age*drag)) / drag;
  vec3 p = position + aVel.xyz * k - vec3(0.0, 0.5*aVel.w*age*age, 0.0);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  #include <logdepthbuf_vertex>
  float tw = 0.55 + 0.45*sin(age*(18.0 + aMisc.w*20.0) + aMisc.w*40.0);
  gl_PointSize = min(aMisc.z * (0.4 + 0.6*tw) * sqrt(1.0 - u) * uPx / max(-mv.z, 0.1), uMaxPt);
  vAlpha = smoothstep(0.0, 0.06, u) * (1.0 - u); vTw = tw; vRot = aMisc.w*3.0 + age*1.5;
  vColor = aColor;
}`;
const SPARK_FS = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_fragment>
uniform float uAdd;
varying vec3 vColor; varying float vAlpha, vTw, vRot;
void main(){
  #include <logdepthbuf_fragment>
  vec2 c = (gl_PointCoord - 0.5) * 2.0;
  float s = sin(vRot), co = cos(vRot); vec2 d = mat2(co, -s, s, co) * c;
  float r2 = dot(c, c); if (r2 > 1.0) discard;
  float core = exp(-r2*22.0);
  float rays = exp(-abs(d.x)*26.0)*exp(-d.y*d.y*2.6) + exp(-abs(d.y)*26.0)*exp(-d.x*d.x*2.6);
  float halo = exp(-r2*5.0)*0.25;
  float I = (core*1.4 + rays*0.9*vTw + halo) * (1.0 - r2);
  vec3 dark = mix(vColor, vec3(1.0), core*0.7) * I * 2.6;
  float la = clamp(core*1.1 + rays*0.75 + halo*0.6, 0.0, 1.0);
  vec3 light = mix(vColor, vec3(1.0, 0.96, 0.85), core*0.6) * la;
  gl_FragColor = vec4(mix(light, dark, uAdd) * vAlpha, mix(la, 0.0, uAdd) * vAlpha);
}`;

// ---------- gold rain: tumbling lit confetti that lands on the risers ----------
const RAIN_VS = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>
attribute vec3 aStart;
attribute vec4 aMisc;   // birth, life, landY, seed
attribute vec4 aShape;  // w, h, spin, fallSpeed
attribute vec3 aColor;
uniform float uTime;
varying vec3 vColor; varying float vShade, vSpec, vFade, vSeed;
${COMMON}
void main(){
  float age = uTime - aMisc.x;
  if (age < 0.0 || age > aMisc.y) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
  float seed = aMisc.w, tl = (aStart.y - aMisc.z) / aShape.w, ta = min(age, tl);
  vec3 c = aStart;
  c.y = max(aStart.y - aShape.w*age, aMisc.z + 0.006 + seed*0.004);
  float sw = 0.25 + 0.35*fract(seed*7.13);
  c.x += sin(ta*2.1 + seed*12.0)*sw + 0.3*sin(ta*0.7 + seed*3.0);
  c.z += cos(ta*1.7 + seed*9.0)*sw*0.6;
  vec3 axis = normalize(vec3(sin(seed*31.0), cos(seed*17.0), sin(seed*11.0) + 0.3));
  float ang = ta*aShape.z + seed*6.283;
  vec3 lp = vec3(position.x*aShape.x, position.y*aShape.y, 0.0);
  vec3 rp = rotAx(lp, axis, ang), rn = rotAx(vec3(0.0, 0.0, 1.0), axis, ang);
  float fl = smoothstep(tl, tl + 0.14, age), r = seed*6.283;
  vec3 flatP = vec3(lp.x*cos(r) - lp.y*sin(r), 0.0, lp.x*sin(r) + lp.y*cos(r));
  rp = mix(rp, flatP, fl); rn = normalize(mix(rn, vec3(0.0, 1.0, 0.0), fl) + 1e-4);
  vec4 wp = modelMatrix * vec4(c + rp, 1.0);
  vec3 V = normalize(cameraPosition - wp.xyz);
  if (dot(rn, V) < 0.0) rn = -rn;
  vec3 L = normalize(vec3(0.25, 1.0, 0.55));
  vShade = 0.32 + 0.68*max(dot(rn, L), 0.0);
  vSpec = pow(max(dot(reflect(-L, rn), V), 0.0), 22.0);
  vFade = smoothstep(0.0, 0.2, age) * (1.0 - smoothstep(aMisc.y - 0.9, aMisc.y, age));
  vColor = aColor; vSeed = seed;
  gl_Position = projectionMatrix * viewMatrix * wp;
  #include <logdepthbuf_vertex>
}`;
const RAIN_FS = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_fragment>
uniform float uAdd;
varying vec3 vColor; varying float vShade, vSpec, vFade, vSeed;
void main(){
  #include <logdepthbuf_fragment>
  float h = fract(sin(dot(gl_FragCoord.xy + vSeed*91.0, vec2(12.9898, 78.233)))*43758.5453);
  if (h > vFade) discard;
  vec3 glint = vec3(1.0, 0.92, 0.72) * vSpec;
  vec3 col = vColor * vShade + glint * mix(0.9, 3.2, uAdd);
  gl_FragColor = vec4(col, 1.0);
}`;

// ---------- rings: floor / drum-head shockwaves ----------
const RING_VS = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>
attribute vec3 aCenter;
attribute vec4 aMisc;  // birth, life, maxR, width
attribute vec3 aColor;
uniform float uTime;
varying vec2 vL; varying vec3 vColor; varying float vU, vW;
void main(){
  float age = uTime - aMisc.x, u = age / aMisc.y;
  if (u < 0.0 || u > 1.0) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
  vL = position.xz * 1.15; vU = u; vW = aMisc.w; vColor = aColor;
  vec3 p = aCenter + vec3(vL.x*aMisc.z, 0.0, vL.y*aMisc.z);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  #include <logdepthbuf_vertex>
}`;
const RING_FS = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_fragment>
uniform float uAdd;
varying vec2 vL; varying vec3 vColor; varying float vU, vW;
void main(){
  #include <logdepthbuf_fragment>
  float d = length(vL);
  float r = 1.0 - pow(1.0 - vU, 3.0);
  float w = vW * (0.6 + vU);
  float band = exp(-pow((d - r)/w, 2.0));
  float r2 = r*0.68; float band2 = exp(-pow((d - r2)/(w*0.7), 2.0));
  float inner = (1.0 - smoothstep(0.0, r, d)) * 0.18;
  float I = (band + 0.4*band2 + inner) * pow(1.0 - vU, 1.4) * smoothstep(1.15, 1.0, d);
  vec3 dark = mix(vColor, vec3(1.0), band*0.35) * I * 2.2;
  float la = clamp(I*0.85, 0.0, 1.0);
  gl_FragColor = vec4(mix(vColor*la, dark, uAdd), mix(la, 0.0, uAdd));
}`;

// ---------- downbeat pulse: light ripple on the stage floor + riser tops ----------
const PULSE_VS = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>
varying vec3 vW;
void main(){
  vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
  #include <logdepthbuf_vertex>
}`;
const PULSE_FS = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_fragment>
uniform float uTime, uAdd;
uniform vec4 uP[4];      // birth, amp, speed, -
uniform vec3 uOrigin, uColor;
varying vec3 vW;
${COMMON}
void main(){
  #include <logdepthbuf_fragment>
  vec2 dv = vW.xz - uOrigin.xz; float d = length(dv);
  float n = vnoise(vec3(vW.xz*1.3, uTime*0.4));
  float I = 0.0;
  for (int i = 0; i < 4; i++) {
    float age = uTime - uP[i].x;
    if (age < 0.0 || age > 2.4) continue;
    float r = age * uP[i].z, w = 0.28 + age*0.55, f = 1.0 - age/2.4;
    float dd = d + (n - 0.5)*0.5;
    I += (exp(-pow((dd - r)/w, 2.0)) + 0.35*exp(-pow((dd - r*0.6)/(w*0.6), 2.0))) * f*f * uP[i].y;
    I += exp(-d*d*0.9) * exp(-age*4.0) * uP[i].y * 0.7;
  }
  float onStage = smoothstep(9.6, 8.6, abs(vW.x)) * smoothstep(-11.0, -10.0, vW.z) * smoothstep(0.1, -0.2, vW.z);
  float apron = 1.0 - smoothstep(0.8, 1.4, length(vW.xz - uOrigin.xz));
  I *= max(onStage, apron) * (0.8 + 0.4*n);
  if (I < 0.002) discard;
  vec3 dark = uColor * I * 0.9;
  float la = clamp(I*0.45, 0.0, 0.7);
  gl_FragColor = vec4(mix(uColor*la, dark, uAdd), mix(la, 0.0, uAdd));
}`;

// ---------- ambient dust: motes, much brighter inside beams ----------
const DUST_VS = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>
attribute vec4 aSeed;
uniform float uTime, uPx, uMaxPt, uBase, uLevel, uRM;
uniform int uBN;
uniform vec4 uBA[${MAXB}]; // apex.xyz, cos(half angle)
uniform vec4 uBD[${MAXB}]; // dir.xyz, length
uniform vec4 uBC[${MAXB}]; // color.rgb, intensity
varying vec3 vColor; varying float vAlpha;
void main(){
  float sp = 1.0 - 0.75*uRM;
  vec3 q = fract(position + vec3(0.006, 0.004, 0.003) * uTime * (0.4 + aSeed.x) * sp);
  vec3 p = vec3(-9.5, 0.15, -11.2) + q * vec3(19.0, 7.0, 12.0);
  p += vec3(sin(uTime*0.31 + aSeed.y*20.0), 0.6*sin(uTime*0.23 + aSeed.z*20.0), cos(uTime*0.27 + aSeed.w*20.0)) * 0.3 * sp;
  vec3 e = smoothstep(0.0, 0.06, q) * (1.0 - smoothstep(0.94, 1.0, q));
  vec3 lit = vec3(0.0);
  for (int i = 0; i < ${MAXB}; i++) {
    if (i >= uBN) break;
    vec3 v = p - uBA[i].xyz; float along = dot(v, uBD[i].xyz);
    if (along <= 0.0 || along > uBD[i].w) continue;
    float c = along / length(v);
    lit += uBC[i].rgb * uBC[i].a * smoothstep(uBA[i].w, mix(uBA[i].w, 1.0, 0.45), c);
  }
  float L = max(max(lit.r, lit.g), lit.b);
  float tw = 0.6 + 0.4*sin(uTime*(1.5 + aSeed.y*3.0) + aSeed.x*30.0);
  vAlpha = e.x*e.y*e.z * tw * (uBase*(0.7 + 0.6*uLevel) + L*1.6);
  vColor = mix(vec3(1.0, 0.93, 0.8), lit / max(L, 1e-3), clamp(L, 0.0, 0.7));
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  #include <logdepthbuf_vertex>
  gl_PointSize = clamp((0.022 + 0.022*aSeed.w) * (1.0 + 0.5*min(L, 1.0)) * uPx / max(-mv.z, 0.1), 1.2, uMaxPt);
  if (vAlpha < 0.004) gl_PointSize = 0.0;
}`;
const DUST_FS = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_fragment>
uniform float uAdd;
varying vec3 vColor; varying float vAlpha;
void main(){
  #include <logdepthbuf_fragment>
  vec2 c = gl_PointCoord - 0.5; float r2 = dot(c, c)*4.0;
  if (r2 > 1.0) discard;
  float I = exp(-r2*3.5) * vAlpha;
  gl_FragColor = vec4(vColor * I * mix(0.9, 1.8, uAdd), mix(I*0.8, 0.0, uAdd));
}`;

// ---------- beams: soft cones with fresnel falloff + scrolling haze ----------
const BEAM_VS = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>
varying vec3 vW, vNv, vV; varying float vAlong;
void main(){
  vAlong = -position.y;
  vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz;
  vec4 mv = viewMatrix * w; vV = mv.xyz;
  vNv = normalize(normalMatrix * normal);
  gl_Position = projectionMatrix * mv;
  #include <logdepthbuf_vertex>
}`;
const BEAM_FS = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_fragment>
uniform float uTime, uAdd, uI, uRM;
uniform vec3 uColor;
varying vec3 vW, vNv, vV; varying float vAlong;
${COMMON}
void main(){
  #include <logdepthbuf_fragment>
  float f = abs(dot(normalize(vNv), normalize(-vV)));
  float soft = pow(f, 1.7);
  float axial = smoothstep(0.0, 0.22, vAlong) * (1.0 - 0.25*vAlong) * (1.0 - 0.4*smoothstep(0.7, 1.0, vAlong));
  float sp = 1.0 - 0.8*uRM;
  float n = vnoise(vW*vec3(1.4, 0.45, 1.4) + vec3(0.0, -uTime*0.22*sp, uTime*0.07*sp));
  float n2 = vnoise(vW*3.7 + vec3(uTime*0.18*sp, 0.0, -uTime*0.11*sp));
  float haze = 0.5 + 0.45*n + 0.22*n2;
  float I = soft * axial * haze * uI;
  vec3 dark = uColor * I * 0.2;
  float la = clamp(I*0.12, 0.0, 0.4);
  gl_FragColor = vec4(mix(uColor*la, dark, uAdd), mix(la, 0.0, uAdd));
}`;
const POOL_FS = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_fragment>
uniform float uTime, uAdd, uI;
uniform vec3 uColor;
varying vec2 vL;
${COMMON}
void main(){
  #include <logdepthbuf_fragment>
  float d = length(vL);
  if (d > 1.0) discard;
  float n = vnoise(vec3(vL*3.0, uTime*0.3));
  float I = (exp(-d*d*2.6)*0.8 + 0.35*smoothstep(1.0, 0.82, d)*smoothstep(0.55, 0.85, d)) * (0.85 + 0.3*n) * uI * smoothstep(1.0, 0.9, d);
  vec3 dark = uColor * I * 0.3;
  float la = clamp(I*0.32, 0.0, 0.5);
  gl_FragColor = vec4(mix(uColor*la, dark, uAdd), mix(la, 0.0, uAdd));
}`;
const POOL_VS = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>
varying vec2 vL;
void main(){
  vL = position.xy;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  #include <logdepthbuf_vertex>
}`;

// ---------- helpers ----------
const rnd = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

let normCanvas = null;
function cssToColor(THREE, out, css, fallback) {
  if (css == null || css === '') { out.set(fallback); return 1; }
  if (typeof css !== 'string') { out.set(css); return 1; }
  try {
    if (!normCanvas) normCanvas = document.createElement('canvas').getContext('2d');
    normCanvas.fillStyle = '#000'; normCanvas.fillStyle = css.trim();
    const s = normCanvas.fillStyle; // '#rrggbb' or 'rgba(r, g, b, a)'
    const m = /rgba?\(([^)]+)\)/.exec(s);
    if (m) { const p = m[1].split(',').map(Number); out.setRGB(p[0] / 255, p[1] / 255, p[2] / 255, THREE.SRGBColorSpace); return p[3] ?? 1; }
    out.setStyle(s); return 1;
  } catch { out.set(fallback); return 1; }
}
const pct = (v, d) => { const n = parseFloat(v); return Number.isFinite(n) ? n / 100 : d; };

function buildAtlas(THREE) {
  const cell = 128, cv = document.createElement('canvas');
  cv.width = cell * 4; cv.height = cell * 2;
  const g = cv.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, cv.width, cv.height);
  const stack = '"Noto Music","Apple Symbols","Segoe UI Symbol","Bravura","Segoe UI Emoji","DejaVu Sans","Arial Unicode MS",serif';
  // clefs live in the SMP; if the font stack draws a tofu box (not tall), fall back to note glyphs
  const glyphs = GLYPHS.slice();
  g.font = `96px ${stack}`;
  const m = g.measureText(glyphs[4]);
  const hgt = m.actualBoundingBoxAscent + m.actualBoundingBoxDescent, wid = m.actualBoundingBoxLeft + m.actualBoundingBoxRight;
  if (!(hgt > wid * 1.45)) { glyphs[4] = '♫'; glyphs[5] = '♩'; }
  g.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 8; i++) {
    const ch = glyphs[i], cx = (i % 4) * cell + cell / 2, cy = Math.floor(i / 4) * cell + cell / 2;
    let px = 84;
    g.font = `${px}px ${stack}`;
    let mm = g.measureText(ch);
    let h = mm.actualBoundingBoxAscent + mm.actualBoundingBoxDescent, w = mm.actualBoundingBoxLeft + mm.actualBoundingBoxRight;
    const fit = Math.min((cell * 0.66) / Math.max(h, 1), (cell * 0.66) / Math.max(w, 1));
    px = Math.max(20, Math.min(110, px * fit));
    g.font = `${px}px ${stack}`;
    mm = g.measureText(ch);
    const x = cx - (mm.actualBoundingBoxRight - mm.actualBoundingBoxLeft) / 2;
    const y = cy + (mm.actualBoundingBoxAscent - mm.actualBoundingBoxDescent) / 2;
    g.textAlign = 'left'; g.textBaseline = 'alphabetic';
    // glow (green) via the off-canvas shadow trick (works without ctx.filter)
    g.save();
    g.shadowColor = '#00ff00'; g.shadowOffsetX = 4000;
    g.fillStyle = '#00ff00';
    g.shadowBlur = 16; g.fillText(ch, x - 4000, y);
    g.shadowBlur = 6; g.fillText(ch, x - 4000, y);
    g.restore();
    g.fillStyle = '#ff0000'; g.fillText(ch, x, y);
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.NoColorSpace;
  tex.generateMipmaps = true; tex.minFilter = THREE.LinearMipmapLinearFilter; tex.magFilter = THREE.LinearFilter;
  tex.anisotropy = 1;
  return tex;
}

// pooled ring buffer over a set of (Instanced)BufferAttributes, uploading only the dirty range
function makePool(cap, attrs) {
  const pool = { cap, head: 0, dmin: 1, dmax: 0, full: false, attrs };
  pool.alloc = () => {
    const i = pool.head; pool.head = (i + 1) % cap;
    if (pool.dmin > pool.dmax) { pool.dmin = pool.dmax = i; }
    else if (i < pool.dmin) pool.full = true;
    else pool.dmax = i;
    return i;
  };
  pool.flush = () => {
    if (pool.dmin > pool.dmax && !pool.full) return;
    for (const a of attrs) {
      a.clearUpdateRanges();
      if (!pool.full) a.addUpdateRange(pool.dmin * a.itemSize, (pool.dmax - pool.dmin + 1) * a.itemSize);
      a.needsUpdate = true;
    }
    pool.dmin = 1; pool.dmax = 0; pool.full = false;
  };
  return pool;
}

export function createFX(ctx) {
  const { THREE, scene, renderer } = ctx;
  const reduced = !!ctx.reducedMotion, low = ctx.quality === 'low';
  const CAP = {
    glyph: reduced ? 96 : low ? 256 : 512,
    spark: reduced ? 160 : low ? 600 : 1200,
    rain: reduced ? 0 : low ? 600 : 1400,
    ring: 48,
    dust: reduced ? 90 : low ? 170 : 340,
  };

  const root = new THREE.Group(); root.name = 'fx';
  scene.add(root);
  const noRay = () => {};

  // shared uniforms (same {value} objects referenced by every material)
  const U = {
    uTime: { value: 0 }, uAdd: { value: 1 }, uPx: { value: 800 }, uMaxPt: { value: 256 }, uRM: { value: reduced ? 1 : 0 },
  };
  try {
    const gl = renderer.getContext();
    const r = gl.getParameter(gl.ALIASED_POINT_SIZE_RANGE);
    if (r && r[1]) U.uMaxPt.value = Math.min(r[1], 512);
  } catch {}

  const blend = {
    transparent: true, depthWrite: false, depthTest: true,
    blending: THREE.CustomBlending, blendEquation: THREE.AddEquation,
    blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
    blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor,
  };
  const mk = (vs, fs, uniforms, extra) => new THREE.ShaderMaterial({ vertexShader: vs, fragmentShader: fs, uniforms, ...blend, ...extra });
  const dynAttr = (geo, name, size, n, Ctor = THREE.BufferAttribute, fill = 0) => {
    const arr = new Float32Array(n * size); if (fill) arr.fill(fill);
    const a = new Ctor(arr, size); a.setUsage(THREE.DynamicDrawUsage); geo.setAttribute(name, a); return a;
  };
  const DEAD_BIRTH = -1e7;
  const killBirth = (a, n) => { for (let i = 0; i < n; i++) a.array[i * a.itemSize] = DEAD_BIRTH; };
  const finish = (obj, order) => { obj.frustumCulled = false; obj.renderOrder = order; obj.raycast = noRay; root.add(obj); return obj; };

  // ---------------- glyphs ----------------
  const atlas = buildAtlas(THREE);
  const gGeo = new THREE.BufferGeometry();
  const gPos = dynAttr(gGeo, 'position', 3, CAP.glyph);
  const gMisc = dynAttr(gGeo, 'aMisc', 4, CAP.glyph); killBirth(gMisc, CAP.glyph);
  for (let i = 0; i < CAP.glyph; i++) gMisc.array[i * 4 + 1] = 1;
  const gMove = dynAttr(gGeo, 'aMove', 4, CAP.glyph);
  const gCol = dynAttr(gGeo, 'aColor', 3, CAP.glyph);
  const gMat = mk(GLYPH_VS, GLYPH_FS, { uTime: U.uTime, uPx: U.uPx, uMaxPt: U.uMaxPt, uRM: U.uRM, uAdd: U.uAdd, uAtlas: { value: atlas } });
  finish(new THREE.Points(gGeo, gMat), 9).name = 'fx-glyphs';
  const gPool = makePool(CAP.glyph, [gPos, gMisc, gMove, gCol]);

  // ---------------- sparkles ----------------
  const sGeo = new THREE.BufferGeometry();
  const sPos = dynAttr(sGeo, 'position', 3, CAP.spark);
  const sVel = dynAttr(sGeo, 'aVel', 4, CAP.spark);
  const sMisc = dynAttr(sGeo, 'aMisc', 4, CAP.spark); killBirth(sMisc, CAP.spark);
  for (let i = 0; i < CAP.spark; i++) sMisc.array[i * 4 + 1] = 1;
  const sCol = dynAttr(sGeo, 'aColor', 3, CAP.spark);
  const sMat = mk(SPARK_VS, SPARK_FS, { uTime: U.uTime, uPx: U.uPx, uMaxPt: U.uMaxPt, uAdd: U.uAdd });
  finish(new THREE.Points(sGeo, sMat), 8).name = 'fx-sparkles';
  const sPool = makePool(CAP.spark, [sPos, sVel, sMisc, sCol]);

  // ---------------- gold rain ----------------
  let rPool = null, rStart, rMisc, rShape, rCol, rMat;
  if (CAP.rain > 0) {
    const base = new THREE.PlaneGeometry(1, 1);
    const rGeo = new THREE.InstancedBufferGeometry();
    rGeo.index = base.index; rGeo.setAttribute('position', base.getAttribute('position'));
    rGeo.instanceCount = CAP.rain;
    rStart = dynAttr(rGeo, 'aStart', 3, CAP.rain, THREE.InstancedBufferAttribute);
    rMisc = dynAttr(rGeo, 'aMisc', 4, CAP.rain, THREE.InstancedBufferAttribute); killBirth(rMisc, CAP.rain);
    for (let i = 0; i < CAP.rain; i++) rMisc.array[i * 4 + 1] = 1;
    rShape = dynAttr(rGeo, 'aShape', 4, CAP.rain, THREE.InstancedBufferAttribute, 1);
    rCol = dynAttr(rGeo, 'aColor', 3, CAP.rain, THREE.InstancedBufferAttribute);
    rMat = new THREE.ShaderMaterial({ vertexShader: RAIN_VS, fragmentShader: RAIN_FS, uniforms: { uTime: U.uTime, uAdd: U.uAdd }, side: THREE.DoubleSide });
    finish(new THREE.Mesh(rGeo, rMat), 5).name = 'fx-goldrain';
    rPool = makePool(CAP.rain, [rStart, rMisc, rShape, rCol]);
  }

  // ---------------- rings ----------------
  const ringBase = new THREE.PlaneGeometry(2, 2); ringBase.rotateX(-Math.PI / 2);
  const ringGeo = new THREE.InstancedBufferGeometry();
  ringGeo.index = ringBase.index; ringGeo.setAttribute('position', ringBase.getAttribute('position'));
  ringGeo.instanceCount = CAP.ring;
  const ringC = dynAttr(ringGeo, 'aCenter', 3, CAP.ring, THREE.InstancedBufferAttribute);
  const ringM = dynAttr(ringGeo, 'aMisc', 4, CAP.ring, THREE.InstancedBufferAttribute); killBirth(ringM, CAP.ring);
  for (let i = 0; i < CAP.ring; i++) ringM.array[i * 4 + 1] = 1;
  const ringCol = dynAttr(ringGeo, 'aColor', 3, CAP.ring, THREE.InstancedBufferAttribute);
  const ringMat = mk(RING_VS, RING_FS, { uTime: U.uTime, uAdd: U.uAdd }, { side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  finish(new THREE.Mesh(ringGeo, ringMat), 3).name = 'fx-rings';
  const ringPool = makePool(CAP.ring, [ringC, ringM, ringCol]);

  // ---------------- pulse overlays (floor + riser tops) ----------------
  const pulseU = {
    uTime: U.uTime, uAdd: U.uAdd,
    uP: { value: [0, 1, 2, 3].map(() => new THREE.Vector4(DEAD_BIRTH, 0, 8, 0)) },
    uOrigin: { value: new THREE.Vector3(...PODIUM) }, uColor: { value: new THREE.Color(1, 0.8, 0.5) },
  };
  const pulseMat = mk(PULSE_VS, PULSE_FS, pulseU, { polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
  const pulseGeos = [];
  {
    const floor = new THREE.PlaneGeometry(19.4, 13, 1, 1); floor.rotateX(-Math.PI / 2); floor.translate(0, 0.012, -4.6);
    pulseGeos.push(floor);
    for (let t = 1; t <= 4; t++) {
      const R = 4.2 + 1.55 * t, span = (78 - 7 * t) * Math.PI / 180;
      const g = new THREE.RingGeometry(R - 0.78, R + 0.77, 48, 1, Math.PI / 2 - span, span * 2);
      g.rotateX(-Math.PI / 2); g.translate(0, 0.32 * t + 0.012, 1.6);
      pulseGeos.push(g);
    }
    for (const g of pulseGeos) finish(new THREE.Mesh(g, pulseMat), 2).name = 'fx-pulse';
  }
  let pulseSlot = 0;

  // ---------------- dust ----------------
  const dGeo = new THREE.BufferGeometry();
  {
    const p = new Float32Array(CAP.dust * 3), s = new Float32Array(CAP.dust * 4);
    for (let i = 0; i < p.length; i++) p[i] = Math.random();
    for (let i = 0; i < s.length; i++) s[i] = Math.random();
    dGeo.setAttribute('position', new THREE.BufferAttribute(p, 3));
    dGeo.setAttribute('aSeed', new THREE.BufferAttribute(s, 4));
  }
  const dustU = {
    uTime: U.uTime, uPx: U.uPx, uMaxPt: U.uMaxPt, uRM: U.uRM, uAdd: U.uAdd,
    uBase: { value: 0.16 }, uLevel: { value: 0 }, uBN: { value: 0 },
    uBA: { value: Array.from({ length: MAXB }, () => new THREE.Vector4()) },
    uBD: { value: Array.from({ length: MAXB }, () => new THREE.Vector4()) },
    uBC: { value: Array.from({ length: MAXB }, () => new THREE.Vector4()) },
  };
  finish(new THREE.Points(dGeo, mk(DUST_VS, DUST_FS, dustU)), 7).name = 'fx-dust';

  // ---------------- beams ----------------
  const coneGeo = new THREE.CylinderGeometry(0.035, 1, 1, 48, 1, true);
  coneGeo.translate(0, -0.5, 0); // apex ring at y=0, base at y=-1
  const poolGeo = new THREE.PlaneGeometry(2, 2); // local xy in [-1,1]; rotated flat per mesh
  const beams = [];
  const _v = new THREE.Vector3(), _q = new THREE.Quaternion(), _down = new THREE.Vector3(0, -1, 0);

  // ---------------- theme state ----------------
  const th = {
    dark: true, hueS: 0.72, hueL: 0.7, hueLFill: 0.52,
    gold: new THREE.Color(), glow: new THREE.Color(), cream: new THREE.Color(1, 0.95, 0.85), velvet: new THREE.Color(), accent: new THREE.Color(),
  };
  const rainPal = [new THREE.Color(), new THREE.Color(), new THREE.Color(), new THREE.Color(), new THREE.Color(), new THREE.Color()];
  const tmpC = new THREE.Color(), tmpC2 = new THREE.Color(), hsl = { h: 0, s: 0, l: 0 };
  let currentTheme = '';

  function setMode(dark) {
    th.dark = dark;
    U.uAdd.value = dark ? 1 : 0;
    dustU.uBase.value = dark ? 0.16 : 0.0;
    pulseU.uColor.value.copy(dark ? th.glow : th.cream);
    for (const b of beams) b._recolor();
  }

  function applyTheme(tok = {}) {
    const bgCol = new THREE.Color();
    cssToColor(THREE, bgCol, tok.stageBg || tok.bg, 0x0a0609);
    const bgL = bgCol.getHSL(hsl, THREE.SRGBColorSpace).l;
    const theme = tok.theme || (bgL > 0.4 ? 'light' : 'dark');
    currentTheme = theme;
    th.hueS = pct(tok.hueS, theme === 'light' ? 0.66 : 0.72);
    th.hueL = pct(tok.hueL, theme === 'light' ? 0.24 : 0.7);
    th.hueLFill = pct(tok.hueLFill, theme === 'light' ? 0.42 : 0.52);
    cssToColor(THREE, th.accent, tok.accentHi || tok.accent, 0xf2d99c);
    cssToColor(THREE, th.glow, tok.glow, 0xffc468);
    cssToColor(THREE, th.velvet, tok.velvetHi || tok.velvet, 0x9b1c33);
    th.gold.setRGB(1, 0.78, 0.36, THREE.SRGBColorSpace);
    if (theme === 'light') th.gold.setRGB(0.86, 0.6, 0.16, THREE.SRGBColorSpace);
    // confetti palette: golds, ivory, a velvet accent
    rainPal[0].setRGB(0.98, 0.78, 0.33, THREE.SRGBColorSpace);
    rainPal[1].setRGB(0.93, 0.69, 0.25, THREE.SRGBColorSpace);
    rainPal[2].setRGB(1.0, 0.86, 0.55, THREE.SRGBColorSpace);
    rainPal[3].setRGB(0.8, 0.56, 0.2, THREE.SRGBColorSpace);
    rainPal[4].setRGB(1.0, 0.96, 0.86, THREE.SRGBColorSpace);
    rainPal[5].copy(th.velvet);
    setMode(theme !== 'light');
  }

  // theme-aware colour for an emitted effect
  function tint(out, c, fallback) {
    if (c == null) out.copy(fallback);
    else if (c.isColor) out.copy(c);
    else cssToColor(THREE, out, c, fallback);
    out.getHSL(hsl, THREE.SRGBColorSpace);
    if (!th.dark) out.setHSL(hsl.h, Math.max(hsl.s, th.hueS), th.hueLFill, THREE.SRGBColorSpace);
    else if (hsl.l < 0.55 && hsl.s > 0.05) out.setHSL(hsl.h, hsl.s, 0.62, THREE.SRGBColorSpace);
    return out;
  }
  const P = (o, k, d) => (o && Number.isFinite(o[k]) ? o[k] : d);

  // ---------------- emitters ----------------
  function spark(x, y, z, vx, vy, vz, grav, life, size, c) {
    const i = sPool.alloc(), t = U.uTime.value;
    const a = sPos.array; a[i * 3] = x; a[i * 3 + 1] = y; a[i * 3 + 2] = z;
    const v = sVel.array; v[i * 4] = vx; v[i * 4 + 1] = vy; v[i * 4 + 2] = vz; v[i * 4 + 3] = grav;
    const m = sMisc.array; m[i * 4] = t; m[i * 4 + 1] = life; m[i * 4 + 2] = size; m[i * 4 + 3] = Math.random();
    const cc = sCol.array; cc[i * 3] = c.r; cc[i * 3 + 1] = c.g; cc[i * 3 + 2] = c.b;
  }

  function emitNote(o) {
    const pos = o.position || o, vel = clamp(P(o, 'vel', 0.8), 0, 1), midi = P(o, 'midi', 67);
    tint(tmpC, o.color, th.accent);
    const hi = clamp((midi - 36) / 60, 0, 1);
    const n = !reduced && vel > 0.75 ? 2 : 1;
    for (let k = 0; k < n; k++) {
      const i = gPool.alloc(), t = U.uTime.value;
      const a = gPos.array; a[i * 3] = pos.x + rnd(-0.08, 0.08); a[i * 3 + 1] = pos.y + rnd(-0.03, 0.06); a[i * 3 + 2] = pos.z + rnd(-0.08, 0.08);
      const m = gMisc.array;
      m[i * 4] = t + k * 0.09; m[i * 4 + 1] = (reduced ? 1.6 : rnd(1.9, 2.8)) * (k ? 0.8 : 1);
      m[i * 4 + 2] = (0.3 + vel * 0.26) * (k ? 0.6 : 1);
      let cell;
      if (Number.isFinite(o.glyph)) cell = o.glyph & 7;
      else if (midi < 48) cell = CELL_LOW[(midi + k) & 3];
      else if (midi > 79) cell = CELL_HIGH[(midi + k) % 5];
      else cell = CELL_MID[(midi + k) % 7];
      m[i * 4 + 3] = cell;
      const mv = gMove.array, ang = Math.random() * Math.PI * 2, sp = reduced ? 0.04 : rnd(0.05, 0.2);
      mv[i * 4] = Math.cos(ang) * sp; mv[i * 4 + 1] = Math.sin(ang) * sp * 0.6;
      mv[i * 4 + 2] = (reduced ? 0.7 : 1.1) + hi * 1.3 + vel * 0.35; mv[i * 4 + 3] = Math.random();
      const c = gCol.array; c[i * 3] = tmpC.r; c[i * 3 + 1] = tmpC.g; c[i * 3 + 2] = tmpC.b;
    }
    if (!reduced && vel > 0.55) {
      tmpC2.copy(tmpC).lerp(th.dark ? th.cream : th.gold, 0.4);
      for (let k = 0; k < 2; k++) spark(pos.x, pos.y + 0.05, pos.z, rnd(-0.4, 0.4), rnd(0.4, 1.0), rnd(-0.4, 0.4), 0.6, rnd(0.45, 0.8), rnd(0.05, 0.08), tmpC2);
    }
  }

  function emitSparkle(o) {
    const pos = o.position || o, vel = clamp(P(o, 'vel', 0.8), 0, 1);
    tint(tmpC, o.color, th.gold);
    const n = Math.round(P(o, 'count', 8 + vel * 14) * (reduced ? 0.35 : low ? 0.6 : 1));
    const speed = P(o, 'speed', 1.3 + vel * 1.4) * (reduced ? 0.4 : 1), spread = P(o, 'spread', 0.08);
    for (let k = 0; k < n; k++) {
      const u = Math.random() * 2 - 1, a = Math.random() * Math.PI * 2, r = Math.sqrt(1 - u * u), s = speed * rnd(0.35, 1);
      tmpC2.copy(tmpC).lerp(th.dark ? th.cream : th.gold, Math.random() * 0.5);
      spark(pos.x + rnd(-spread, spread), pos.y + rnd(-spread, spread), pos.z + rnd(-spread, spread),
        r * Math.cos(a) * s, Math.abs(u) * s * 0.8 + 0.5, r * Math.sin(a) * s, rnd(0.8, 1.8), rnd(0.55, 1.1), rnd(0.06, 0.12) * (0.8 + vel * 0.4), tmpC2);
    }
  }

  function emitRing(o) {
    const pos = o.position || o, vel = clamp(P(o, 'vel', 0.8), 0, 1);
    tint(tmpC, o.color, th.accent);
    const i = ringPool.alloc(), t = U.uTime.value;
    const c = ringC.array; c[i * 3] = pos.x; c[i * 3 + 1] = pos.y + 0.015; c[i * 3 + 2] = pos.z;
    const m = ringM.array;
    m[i * 4] = t; m[i * 4 + 1] = P(o, 'life', 0.9 + vel * 0.5); m[i * 4 + 2] = P(o, 'radius', 0.9 + vel * 1.6); m[i * 4 + 3] = P(o, 'width', 0.05);
    const cc = ringCol.array; cc[i * 3] = tmpC.r; cc[i * 3 + 1] = tmpC.g; cc[i * 3 + 2] = tmpC.b;
  }

  function emitPulse(o) {
    const s = pulseU.uP.value[pulseSlot]; pulseSlot = (pulseSlot + 1) & 3;
    s.set(U.uTime.value, clamp(P(o, 'strength', 1), 0, 2) * (reduced ? 0.6 : 1), reduced ? 5 : 8, 0);
    if (o && o.position) pulseU.uOrigin.value.set(o.position.x, o.position.y, o.position.z);
    if (o && o.color) tint(pulseU.uColor.value, o.color, th.glow);
    else pulseU.uColor.value.copy(th.dark ? th.glow : th.cream);
  }

  // gold rain is spawned over time in update()
  let rainUntil = -1, rainRate = 0, rainAcc = 0, glitterAcc = 0;
  function emitGoldrain(o) {
    if (!rPool) { emitPulse({ strength: 0.8 }); return; }
    const dur = P(o, 'duration', 3), amt = clamp(P(o, 'intensity', 1), 0.1, 2);
    rainUntil = U.uTime.value + dur;
    rainRate = (CAP.rain * 0.82 * amt) / (dur + 0.3);
  }
  function spawnRain(n) {
    const t = U.uTime.value;
    for (let k = 0; k < n; k++) {
      const i = rPool.alloc();
      const x = rnd(-9, 9), z = rnd(-10.2, -0.3), y = rnd(5.6, 7.6);
      const speed = rnd(1.5, 2.5), land = surfaceY(x, z);
      const s = rStart.array; s[i * 3] = x; s[i * 3 + 1] = y; s[i * 3 + 2] = z;
      const m = rMisc.array; m[i * 4] = t - Math.random() * 0.03; m[i * 4 + 1] = (y - land) / speed + rnd(0.8, 1.6); m[i * 4 + 2] = land; m[i * 4 + 3] = Math.random();
      const sh = rShape.array, leaf = Math.random() < 0.3;
      sh[i * 4] = leaf ? rnd(0.06, 0.09) : rnd(0.035, 0.055); sh[i * 4 + 1] = leaf ? rnd(0.06, 0.09) : rnd(0.07, 0.11);
      sh[i * 4 + 2] = rnd(3, 9) * (Math.random() < 0.5 ? -1 : 1); sh[i * 4 + 3] = speed;
      const pc = rainPal[Math.random() < 0.08 ? 5 : (Math.random() * 5) | 0];
      const c = rCol.array; c[i * 3] = pc.r; c[i * 3 + 1] = pc.g; c[i * 3 + 2] = pc.b;
    }
  }

  function emit(type, opts = {}) {
    switch (type) {
      case 'note': return emitNote(opts);
      case 'sparkle': return emitSparkle(opts);
      case 'ring': return emitRing(opts);
      case 'pulse': return emitPulse(opts);
      case 'goldrain': return emitGoldrain(opts);
      default: return undefined;
    }
  }

  // ---------------- beam handles ----------------
  function beam(from, to, opts = {}) {
    const color = new THREE.Color();
    let colorSrc = opts.color ?? null;
    const u = { uTime: U.uTime, uAdd: U.uAdd, uRM: U.uRM, uI: { value: 0 }, uColor: { value: new THREE.Color() } };
    const pu = { uTime: U.uTime, uAdd: U.uAdd, uI: { value: 0 }, uColor: { value: new THREE.Color() } };
    const cone = new THREE.Mesh(coneGeo, mk(BEAM_VS, BEAM_FS, u, { side: THREE.DoubleSide }));
    finish(cone, 6).name = 'fx-beam';
    let pool = null;
    if (opts.pool !== false) {
      pool = new THREE.Mesh(poolGeo, mk(POOL_VS, POOL_FS, pu, { polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }));
      pool.rotation.x = -Math.PI / 2;
      finish(pool, 4).name = 'fx-beam-pool';
    }
    const b = {
      apex: new THREE.Vector3(from.x, from.y, from.z), target: new THREE.Vector3(to.x, to.y, to.z),
      dir: new THREE.Vector3(0, -1, 0), len: 1, cosHalf: 0.97, cur: 0, goal: P(opts, 'intensity', 1), radius: 0,
      angle: P(opts, 'angle', 11) * Math.PI / 180, fixedR: P(opts, 'radius', 0), color, cone, pool, dead: false, rank: -1,
    };
    b._recolor = () => {
      if (colorSrc == null) color.copy(th.dark ? th.glow : th.cream);
      else if (colorSrc.isColor) color.copy(colorSrc);
      else cssToColor(THREE, color, colorSrc, th.glow);
      if (!th.dark) color.lerp(th.cream, 0.55);
      u.uColor.value.copy(color); pu.uColor.value.copy(color);
    };
    b._layout = () => {
      _v.subVectors(b.target, b.apex);
      b.len = Math.max(_v.length(), 0.05);
      b.dir.copy(_v).divideScalar(b.len);
      const R = b.fixedR > 0 ? b.fixedR : b.len * Math.tan(b.angle);
      b.radius = R; b.cosHalf = Math.cos(Math.atan2(R, b.len));
      cone.position.copy(b.apex);
      cone.quaternion.setFromUnitVectors(_down, b.dir);
      cone.scale.set(R, b.len, R);
      if (pool) {
        // footprint of the cone on a horizontal plane through the target
        const tilt = Math.max(Math.abs(b.dir.y), 0.3);
        pool.position.set(b.target.x, b.target.y + 0.02, b.target.z);
        pool.scale.set(R * 1.2 / tilt, R * 1.2, 1);
        pool.rotation.set(-Math.PI / 2, 0, Math.atan2(-b.dir.z, b.dir.x));
      }
    };
    b._recolor(); b._layout();
    beams.push(b);
    return {
      setIntensity(v) { b.goal = clamp(+v || 0, 0, 2); },
      setColor(c) { colorSrc = c; b._recolor(); },
      setTarget(v3) { b.target.set(v3.x, v3.y, v3.z); b._layout(); },
      setSource(v3) { b.apex.set(v3.x, v3.y, v3.z); b._layout(); },
      dispose() {
        if (b.dead) return; b.dead = true;
        root.remove(cone); cone.material.dispose();
        if (pool) { root.remove(pool); pool.material.dispose(); }
        const k = beams.indexOf(b); if (k >= 0) beams.splice(k, 1);
      },
      get intensity() { return b.cur; },
    };
  }

  // ---------------- per frame ----------------
  const tmpSize = new THREE.Vector2();
  let clock = 0;
  function update(frame = {}) {
    const dt = clamp(Number.isFinite(frame.dt) ? frame.dt : 1 / 60, 0, 0.1);
    clock += dt; U.uTime.value = clock;
    if (frame.theme && frame.theme !== currentTheme) { currentTheme = frame.theme; setMode(frame.theme !== 'light'); }

    const cam = ctx.camera;
    renderer.getDrawingBufferSize(tmpSize);
    U.uPx.value = cam && cam.isPerspectiveCamera ? (tmpSize.y * (cam.zoom || 1)) / (2 * Math.tan((cam.fov * Math.PI) / 360)) : tmpSize.y * 0.08;
    dustU.uLevel.value += ((frame.level || 0) - dustU.uLevel.value) * Math.min(1, dt * 3);

    // gold rain + falling glitter
    if (rPool && clock < rainUntil) {
      rainAcc += rainRate * dt;
      const n = rainAcc | 0; rainAcc -= n; if (n) spawnRain(Math.min(n, 64));
      glitterAcc += (low ? 25 : 60) * dt;
      while (glitterAcc >= 1) {
        glitterAcc -= 1;
        tmpC2.copy(th.gold).lerp(th.cream, Math.random() * 0.6);
        spark(rnd(-9, 9), rnd(3, 6.5), rnd(-10, -0.5), rnd(-0.2, 0.2), rnd(-0.3, 0), rnd(-0.2, 0.2), 0.35, rnd(1.2, 2.2), rnd(0.05, 0.1), tmpC2);
      }
    }

    // beams: ease intensity, feed the brightest MAXB to the dust shader
    const k = Math.min(1, dt * 4);
    for (let j = 0; j < beams.length; j++) {
      const b = beams[j];
      b.cur += (b.goal - b.cur) * k;
      const vis = b.cur > 0.003;
      b.cone.visible = vis; if (b.pool) b.pool.visible = vis;
      b.cone.material.uniforms.uI.value = b.cur * (th.dark ? 1 : 0.9);
      if (b.pool) b.pool.material.uniforms.uI.value = b.cur;
      b.rank = -1;
    }
    let nb = 0;
    for (; nb < MAXB; nb++) {
      let best = null;
      for (let j = 0; j < beams.length; j++) { const b = beams[j]; if (b.rank < 0 && b.cur > 0.02 && (!best || b.cur > best.cur)) best = b; }
      if (!best) break;
      best.rank = nb;
      dustU.uBA.value[nb].set(best.apex.x, best.apex.y, best.apex.z, best.cosHalf);
      dustU.uBD.value[nb].set(best.dir.x, best.dir.y, best.dir.z, best.len);
      dustU.uBC.value[nb].set(best.color.r, best.color.g, best.color.b, best.cur);
    }
    dustU.uBN.value = nb;

    gPool.flush(); sPool.flush(); ringPool.flush(); if (rPool) rPool.flush();
  }

  function dispose() {
    for (const b of beams.slice()) { b.dead = true; b.cone.material.dispose(); if (b.pool) b.pool.material.dispose(); }
    beams.length = 0;
    root.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
    poolGeo.dispose(); coneGeo.dispose(); atlas.dispose();
    scene.remove(root);
  }

  applyTheme(ctx.tok || {});
  return { emit, beam, update, applyTheme, dispose, object3d: root, caps: CAP };
}
