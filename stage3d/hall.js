// Pocket Orchestra — 3D concert hall (Wave 4, module B).
// export buildHall(ctx) -> { group, update(frame), setCurtains(open, opts), applyTheme(tok), spotAnchors }
// Coordinates (meters, Y up): stage floor y=0, lip z≈0 (curved apron reaches z≈3.7 at centre), upstage -z to -11,
// house at z>0 on a raked floor from y=-1.1. Risers + podium follow the Wave 4 contract exactly.
// Everything static is merged into one mesh per material; seats, audience, organ pipes, crystals and footlights
// are instanced; the curtains are deformed on the GPU. No per-frame allocations.
import { makeBuckets, mergeGeoms, parseColor, cssOf } from './hall/util.js';
import { makeWoodTextures, makeVelvetTexture, makeFringeTexture, makeRopeTexture } from './hall/textures.js';
import { buildCurtains } from './hall/curtains.js';
import { buildPlatform, pipeShader } from './hall/platform.js';
import { buildProscenium } from './hall/proscenium.js';
import { buildHouse } from './hall/house.js';

function makeEnv(THREE, renderer, light) {
  const scene = new THREE.Scene();
  const geos = [], matsL = [];
  const mesh = (geo, color, side = THREE.FrontSide) => {
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, side }));
    geos.push(geo); matsL.push(m.material);
    scene.add(m);
    return m;
  };
  const room = mesh(new THREE.BoxGeometry(44, 22, 44), light ? new THREE.Color(0.55, 0.48, 0.4) : new THREE.Color(0.035, 0.022, 0.02), THREE.BackSide);
  room.position.y = 6;
  const panel = (w, h, pos, color) => {
    const m = mesh(new THREE.PlaneGeometry(w, h), color, THREE.DoubleSide);
    m.position.set(pos[0], pos[1], pos[2]);
    m.lookAt(0, 3, 0);
  };
  panel(16, 3, [0, 15, 13], light ? new THREE.Color(3.2, 2.9, 2.5) : new THREE.Color(6.5, 4.8, 3.2));
  panel(12, 2.4, [0, 11, -9], light ? new THREE.Color(1.6, 1.3, 1.0) : new THREE.Color(2.2, 1.5, 1.0));
  panel(34, 5, [0, -5, 6], light ? new THREE.Color(0.9, 0.62, 0.38) : new THREE.Color(0.5, 0.26, 0.14));
  panel(6, 10, [-19, 7, 6], light ? new THREE.Color(1.4, 1.35, 1.3) : new THREE.Color(0.35, 0.18, 0.14));
  panel(6, 10, [19, 7, 6], light ? new THREE.Color(1.4, 1.35, 1.3) : new THREE.Color(0.35, 0.18, 0.14));
  for (const [x, y, z] of [[-8, 12.5, 9], [8, 12.5, 9], [0, 12.5, 16]]) {
    const s = mesh(new THREE.SphereGeometry(0.8, 12, 8), light ? new THREE.Color(9, 8, 6) : new THREE.Color(16, 12, 7));
    s.position.set(x, y, z);
  }
  const pm = new THREE.PMREMGenerator(renderer);
  const rt = pm.fromScene(scene, 0.015);
  pm.dispose();
  geos.forEach((g) => g.dispose());
  matsL.forEach((m) => m.dispose());
  return rt.texture;
}

export function buildHall(ctx) {
  const { THREE } = ctx;
  const group = new THREE.Group();
  group.name = 'hall';
  const aniso = Math.min(8, ctx.renderer?.capabilities?.getMaxAnisotropy?.() || 4);

  // ---- textures + environment ----
  const wood = makeWoodTextures(THREE, aniso);
  const velvetTex = makeVelvetTexture(THREE, { kind: 'curtain' });
  const valanceTex = makeVelvetTexture(THREE, { kind: 'valance', w: 256, h: 256 });
  const fringeTex = makeFringeTexture(THREE);
  const ropeTex = makeRopeTexture(THREE);
  ropeTex.repeat.set(26, 1);
  let envs = { dark: null, light: null };
  try {
    if (ctx.renderer) envs = { dark: makeEnv(THREE, ctx.renderer, false), light: makeEnv(THREE, ctx.renderer, true) };
  } catch (e) { console.warn('[hall] env map skipped', e); }

  // ---- shared materials (a handful; colours set by applyTheme) ----
  const Std = (o) => new THREE.MeshStandardMaterial(o);
  const Phys = (o) => new THREE.MeshPhysicalMaterial(o);
  const mats = {
    wood: Phys({ map: wood.map, roughnessMap: wood.roughnessMap, roughness: 1, metalness: 0, clearcoat: 0.5, clearcoatRoughness: 0.16 }),
    fascia: Std({ color: 0x140b08, roughness: 0.45, metalness: 0.05 }),
    gold: Std({ color: 0xdcaa48, metalness: 1, roughness: 0.3, side: THREE.DoubleSide }),
    plaster: Std({ color: 0xf2e8d6, roughness: 0.9 }),
    ceiling: Std({ color: 0xf2e8d6, roughness: 0.95 }),
    panel: Std({ color: 0x5a3520, roughness: 0.55 }),
    panelHi: Std({ color: 0x6a4027, roughness: 0.5 }),
    dark: Std({ color: 0x0b0809, roughness: 0.8 }),
    carpet: Std({ color: 0x5a1420, roughness: 1 }),
    cloud: Std({ color: 0xeadbc0, roughness: 0.6 }),
    velvet: Phys({ color: 0x8c1d2e, roughness: 0.85, sheen: 1, sheenRoughness: 0.4, sheenColor: 0xff8090 }),
    valance: Phys({ map: valanceTex.map, roughnessMap: valanceTex.orm, metalnessMap: valanceTex.orm, roughness: 1, metalness: 1, sheen: 1, sheenRoughness: 0.4, sheenColor: 0xff8090, side: THREE.DoubleSide }),
    curtain: Phys({ map: velvetTex.map, roughnessMap: velvetTex.orm, metalnessMap: velvetTex.orm, roughness: 1, metalness: 1, sheen: 1, sheenRoughness: 0.42, sheenColor: 0xff8090, side: THREE.DoubleSide }),
    fringe: Std({ map: fringeTex, color: 0xffffff, metalness: 0.85, roughness: 0.35, alphaTest: 0.45, side: THREE.DoubleSide }),
    rope: Std({ map: ropeTex, color: 0xffffff, metalness: 0.85, roughness: 0.4 }),
    pipe: Std({ color: 0xe4e0d6, metalness: 1, roughness: 0.17 }),
    crystal: Std({ color: 0xffffff, metalness: 1, roughness: 0.04, flatShading: true }),
    bulb: new THREE.MeshBasicMaterial({ color: 0xffd8a0 }),
    footBulb: new THREE.MeshBasicMaterial({ color: 0xffffff }),
    candle: Std({ color: 0xf6efe2, roughness: 0.6 }),
    seat: Phys({ color: 0x8c1d2e, roughness: 0.8, sheen: 1, sheenRoughness: 0.45, sheenColor: 0xff8090 }),
    audienceHead: Std({ color: 0xffffff, roughness: 0.85 }),
    audienceBody: Std({ color: 0xffffff, roughness: 0.9 }),
  };
  pipeShader(THREE, mats.pipe);
  const envMats = ['wood', 'gold', 'fringe', 'rope', 'pipe', 'crystal', 'curtain', 'valance', 'velvet', 'seat', 'fascia', 'panel', 'panelHi'];

  // ---- build parts ----
  const buckets = makeBuckets(THREE);
  const add = buckets.add;
  const platform = buildPlatform(ctx, mats, add);
  buildProscenium(ctx, mats, add);
  const curtains = buildCurtains(ctx, mats, add);
  const house = buildHouse(ctx, mats, add);
  group.add(platform.group, curtains.group, house.group);

  const KEY_MAT = { floor: 'wood', riserTop: 'wood', podiumTop: 'wood', riserFascia: 'fascia' };
  const SHADOW_CAST = new Set(['riserTop', 'riserFascia', 'podiumTop']);
  const SHADOW_RECV = new Set(['floor', 'riserTop', 'riserFascia', 'podiumTop', 'fascia', 'carpet', 'panel', 'plaster']);
  for (const [key, list] of buckets.map) {
    const mat = mats[KEY_MAT[key] || key];
    if (!mat) { console.warn('[hall] no material for', key); continue; }
    const mesh = new THREE.Mesh(mergeGeoms(THREE, list), mat);
    mesh.name = 'hall-' + key;
    mesh.castShadow = SHADOW_CAST.has(key);
    mesh.receiveShadow = SHADOW_RECV.has(key);
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    group.add(mesh);
  }
  ctx.scene?.add(group);

  // ---- theme ----
  let theme = 'dark';
  let houseLevel = 0.3;
  const P = {
    glow: new THREE.Color(), gold: new THREE.Color(), velvet: new THREE.Color(), velvetHi: new THREE.Color(), velvetLo: new THREE.Color(),
  };
  const bulbBase = new THREE.Color(1, 0.84, 0.6);
  const plasterEm = new THREE.Color();
  const C = (tok, k, fb, out) => parseColor(THREE, tok?.[k], fb, out);

  function applyTheme(tok = {}) {
    const bg = C(tok, 'bg', '#0d0709', new THREE.Color());
    const lum = 0.2126 * bg.r + 0.7152 * bg.g + 0.0722 * bg.b;
    theme = tok.theme === 'light' || tok.theme === 'dark' ? tok.theme : lum > 0.35 ? 'light' : 'dark';
    const light = theme === 'light';
    const white = new THREE.Color(1, 1, 1);
    C(tok, 'velvet', light ? '#8c1d2e' : '#6a0f22', P.velvet);
    C(tok, 'velvetHi', light ? '#b8384a' : '#9b1c33', P.velvetHi);
    C(tok, 'velvetLo', light ? '#4f0b17' : '#2e0610', P.velvetLo);
    C(tok, 'glow', '#ffc468', P.glow);
    const accent = C(tok, light ? 'accentHi' : 'accent', light ? '#c99a3e' : '#d6b26c', new THREE.Color());
    P.gold.set('#dcaa48').lerp(accent, 0.35);
    const stageBg = C(tok, 'stageBg', light ? '#e8d9bd' : '#0a0609', new THREE.Color());
    const stageFloor = C(tok, 'stageFloor', light ? '#a4703f' : '#3b2415', new THREE.Color());

    mats.gold.color.copy(P.gold);
    mats.rope.color.copy(white).lerp(P.gold, 0.25);
    mats.fringe.color.copy(white).lerp(P.gold, 0.15);
    mats.wood.color.copy(white).lerp(stageFloor, light ? 0.08 : 0.5);
    mats.fascia.color.set(light ? '#3b2416' : '#120907');
    mats.plaster.color.copy(light ? bg.clone().lerp(white, 0.3).lerp(P.gold, 0.05) : P.velvetLo.clone().lerp(stageBg, 0.45));
    mats.ceiling.color.copy(light ? bg.clone().lerp(white, 0.45) : stageBg.clone().lerp(P.velvetLo, 0.3));
    mats.panel.color.set(light ? '#b48a5a' : '#2c1610');
    mats.panelHi.color.set(light ? '#d2ae7c' : '#3c1f15');
    mats.carpet.color.copy(P.velvet).multiplyScalar(light ? 0.72 : 0.42);
    mats.cloud.color.set(light ? '#efe2c8' : '#2a1913');
    mats.pipe.color.set(light ? '#e7e3da' : '#ead6a8');
    mats.pipe.userData.uniforms.uShimmer.value.copy(P.glow).lerp(white, 0.2);
    mats.velvet.color.copy(P.velvet);
    mats.seat.color.copy(P.velvet).multiplyScalar(light ? 1 : 0.75);
    for (const m of [mats.velvet, mats.seat, mats.curtain, mats.valance]) {
      m.sheenColor.copy(P.velvetHi).lerp(white, light ? 0.12 : 0.04).multiplyScalar(light ? 0.95 : 0.8);
      m.sheenRoughness = 0.36;
    }
    mats.audienceHead.color.setScalar(light ? 1 : 0.5);
    mats.audienceBody.color.setScalar(light ? 1 : 0.5);
    const css = (c) => cssOf(THREE, c);
    const goldLo = P.gold.clone().multiplyScalar(0.45);
    velvetTex.draw(css(P.velvet), css(P.velvetLo.clone().lerp(P.velvet, 0.5)), css(P.gold), css(goldLo));
    valanceTex.draw(css(P.velvet), css(P.velvetLo), css(P.gold), css(goldLo));

    const env = light ? envs.light : envs.dark;
    for (const k of envMats) {
      const m = mats[k];
      if (env && m.envMap !== env) { m.envMap = env; m.needsUpdate = true; }
      m.envMapIntensity = k === 'gold' ? (light ? 1.0 : 0.75) : k === 'crystal' ? 2.4 : k === 'pipe' ? (light ? 1.0 : 0.8) : k === 'wood' ? (light ? 0.6 : 0.45) : light ? 0.5 : 0.3;
    }
    plasterEm.copy(mats.plaster.color);
    platform.applyTheme(theme, P);
    house.applyTheme(theme, P);
    curtains.syncMaterials();
  }

  function update(frame = {}) {
    const dt = Math.min(0.1, frame.dt || 0);
    const light = theme === 'light';
    const target = light ? (frame.playing ? 0.8 : 1.0) : (frame.playing ? 0.12 : 0.32);
    houseLevel += (target - houseLevel) * (1 - Math.exp(-dt * 1.6));
    const lv = frame.level || 0;
    mats.bulb.color.copy(bulbBase).multiplyScalar(0.35 + 3.2 * houseLevel * (1 + 0.25 * lv));
    mats.plaster.emissive.copy(plasterEm).multiplyScalar(light ? 0.16 * houseLevel : 0);
    mats.ceiling.emissive.copy(mats.ceiling.color).multiplyScalar(light ? 0.12 * houseLevel : 0);
    curtains.update(frame);
    platform.update(frame, houseLevel);
    house.update(frame, houseLevel);
  }

  applyTheme(ctx.tok || {});
  update({ t: 0, dt: 0, level: 0, bands: { low: 0, mid: 0, high: 0 }, beat: 0, playing: 0 });

  return {
    group,
    update,
    setCurtains: curtains.setCurtains,
    applyTheme,
    spotAnchors: house.spotAnchors,
  };
}
