// Procedural canvas textures for the hall: plank floor, velvet (with gold braid), bullion fringe, rope.
import { rng } from './util.js';

const canvas = (w, h) => {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
};

// Stage floor: 1024 px = 4 m. Planks run up/downstage (canvas vertical = world depth).
export function makeWoodTextures(THREE, anisotropy = 8) {
  const S = 1024, PLANKS = 20, pw = S / PLANKS;
  const r = rng(1907);
  const col = canvas(S, S), rough = canvas(S, S);
  const c = col.getContext('2d'), g = rough.getContext('2d');
  c.fillStyle = '#c48e55'; c.fillRect(0, 0, S, S);
  g.fillStyle = 'rgb(105,105,105)'; g.fillRect(0, 0, S, S);
  const segs = [];
  for (let i = 0; i < PLANKS; i++) {
    let y = r() * S;
    const end = y + S;
    while (y < end) {
      const len = Math.min(end - y, 300 + r() * 420);
      segs.push({ x: i * pw, y, len, tone: r(), rough: r(), seed: (r() * 1e9) | 0 });
      y += len;
    }
  }
  const draw = (fn) => { for (const s of segs) for (const off of [0, -S]) fn(s, s.y + off); };
  draw((s, y) => {
    // base tone: honey with per-plank variation
    const l = 52 + s.tone * 12, h = 30 + s.tone * 6;
    c.fillStyle = `hsl(${h} ${48 + s.tone * 10}% ${l}%)`;
    c.fillRect(s.x, y, pw, s.len);
    const pr = rng(s.seed);
    // long grain streaks
    for (let k = 0; k < 18; k++) {
      const gx = s.x + pr() * pw, amp = 1 + pr() * 3, freq = 0.004 + pr() * 0.01, ph = pr() * 6.28;
      c.strokeStyle = pr() < 0.6 ? `rgba(92,52,20,${0.06 + pr() * 0.14})` : `rgba(255,226,170,${0.05 + pr() * 0.08})`;
      c.lineWidth = 0.6 + pr() * 1.6;
      c.beginPath();
      for (let yy = 0; yy <= s.len; yy += 12) {
        const xx = Math.min(s.x + pw - 1, Math.max(s.x + 1, gx + Math.sin(yy * freq + ph) * amp));
        yy ? c.lineTo(xx, y + yy) : c.moveTo(xx, y + yy);
      }
      c.stroke();
    }
    // the odd cathedral figure / knot
    if (pr() < 0.35) {
      const ky = y + pr() * s.len, kx = s.x + pw * (0.3 + pr() * 0.4);
      for (let k = 0; k < 6; k++) {
        c.strokeStyle = `rgba(80,42,14,${0.12 - k * 0.015})`;
        c.lineWidth = 1;
        c.beginPath(); c.ellipse(kx, ky, 2 + k * 3, 10 + k * 14, 0, 0, Math.PI * 2); c.stroke();
      }
    }
    const gr = 88 + s.rough * 50;
    g.fillStyle = `rgb(${gr},${gr},${gr})`;
    g.fillRect(s.x, y, pw, s.len);
    // seams (ends + sides): dark in colour, rough in roughness
    c.fillStyle = 'rgba(40,20,8,0.75)';
    c.fillRect(s.x, y, pw, 2);
    c.fillRect(s.x, y, 1.6, s.len);
    g.fillStyle = 'rgb(225,225,225)';
    g.fillRect(s.x, y, pw, 2);
    g.fillRect(s.x, y, 1.6, s.len);
  });
  // a little scuffing / wax variation over everything
  for (let k = 0; k < 900; k++) {
    const x = r() * S, y = r() * S, w = 6 + r() * 60;
    g.fillStyle = `rgba(${r() < 0.5 ? '255,255,255' : '0,0,0'},${0.03 + r() * 0.05})`;
    g.fillRect(x, y, w * 0.2, w);
  }
  const map = new THREE.CanvasTexture(col);
  map.colorSpace = THREE.SRGBColorSpace;
  const roughnessMap = new THREE.CanvasTexture(rough);
  for (const t of [map, roughnessMap]) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(0.25, 0.25); // world-meter UVs → 4 m tile
    t.anisotropy = anisotropy;
  }
  return { map, roughnessMap };
}

// Velvet with gold braid. One texture for the curtain halves (u: 0 lead edge → 1 outer, v: 0 hem → 1 top),
// redrawn on theme change because the braid must stay gold while the velvet follows the token.
export function makeVelvetTexture(THREE, { w = 512, h = 1024, kind = 'curtain' } = {}) {
  const col = canvas(w, h), orm = canvas(w, h);
  const map = new THREE.CanvasTexture(col);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 4;
  const ormTex = new THREE.CanvasTexture(orm);
  const draw = (velvet, velvetLo, gold, goldLo) => {
    const c = col.getContext('2d'), g = orm.getContext('2d');
    const r = rng(77);
    c.fillStyle = velvet; c.fillRect(0, 0, w, h);
    // pile streaks (vertical), very subtle
    for (let i = 0; i < w; i += 1) {
      const a = r() * 0.035;
      c.fillStyle = r() < 0.5 ? `rgba(0,0,0,${a})` : `rgba(255,255,255,${a * 0.5})`;
      c.fillRect(i, 0, 1, h);
    }
    g.fillStyle = 'rgb(0,215,0)'; g.fillRect(0, 0, w, h); // G roughness .84, B metalness 0
    const band = (y0, y1, color, metal = true) => {
      c.fillStyle = color; c.fillRect(0, y0, w, y1 - y0);
      g.fillStyle = metal ? 'rgb(0,80,255)' : 'rgb(0,215,0)'; g.fillRect(0, y0, w, y1 - y0);
    };
    const vband = (x0, x1, color) => {
      c.fillStyle = color; c.fillRect(x0, 0, x1 - x0, h);
      g.fillStyle = 'rgb(0,80,255)'; g.fillRect(x0, 0, x1 - x0, h);
    };
    if (kind === 'curtain') {
      const Y = (v) => h - v * h; // v (0 hem → 1 top) → canvas y
      // darker hem band, then two gold braids with a diamond pattern on the wide one
      c.fillStyle = velvetLo; c.fillRect(0, Y(0.075), w, Y(0) - Y(0.075));
      band(Y(0.06), Y(0.048), gold);
      c.fillStyle = goldLo;
      for (let x = 0; x < w; x += 10) { c.beginPath(); c.moveTo(x, Y(0.054)); c.lineTo(x + 5, Y(0.06)); c.lineTo(x + 10, Y(0.054)); c.lineTo(x + 5, Y(0.048)); c.closePath(); c.fill(); }
      band(Y(0.03), Y(0.025), gold);
      band(Y(0.0115), Y(0.0), gold);
      // leading-edge braid (u = 0 is the edge that meets the other half)
      vband(0, 5, gold); vband(5, 7, goldLo); vband(11, 14, gold);
      // faint vertical shading every pleat so the folds read even flat-lit
      for (let i = 0; i < 13; i++) {
        const x = (i / 13) * w;
        const gr = c.createLinearGradient(x, 0, x + w / 13, 0);
        gr.addColorStop(0, 'rgba(0,0,0,0.0)'); gr.addColorStop(0.5, 'rgba(0,0,0,0.10)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
        c.fillStyle = gr; c.fillRect(x + 14, 0, w / 13, Y(0.075));
      }
    } else {
      // valance: braid hugs the scalloped bottom edge (v near 0) and the top
      band(h - 0.14 * h, h - 0.105 * h, gold);
      band(h - 0.075 * h, h - 0.06 * h, gold);
      band(0, 0.03 * h, gold);
    }
    map.needsUpdate = true;
    ormTex.needsUpdate = true;
  };
  return { map, orm: ormTex, draw };
}

// Bullion fringe: twisted gold cords hanging from a woven header. RGBA, alpha-tested.
export function makeFringeTexture(THREE) {
  const w = 128, h = 64;
  const cv = canvas(w, h), c = cv.getContext('2d');
  const r = rng(5);
  c.clearRect(0, 0, w, h);
  // header band
  const hg = c.createLinearGradient(0, 0, 0, 12);
  hg.addColorStop(0, '#6b4510'); hg.addColorStop(0.4, '#fff2c4'); hg.addColorStop(1, '#b07d24');
  c.fillStyle = hg; c.fillRect(0, 0, w, 12);
  for (let x = 0; x < w; x += 4) {
    const len = 12 + (h - 14) * (0.86 + r() * 0.14);
    const sg = c.createLinearGradient(x, 0, x + 3, 0);
    sg.addColorStop(0, '#8a5a18'); sg.addColorStop(0.45, '#ffe9b0'); sg.addColorStop(1, '#7a4e12');
    c.fillStyle = sg; c.fillRect(x, 10, 3, len - 10);
    // twist: diagonal darker ticks along the cord
    c.fillStyle = 'rgba(70,40,8,0.55)';
    for (let y = 14; y < len - 2; y += 4) c.fillRect(x, y, 3, 1);
    c.fillStyle = '#e8c06a';
    c.fillRect(x, len - 3, 3, 3); // knot at the tip
  }
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

// Rope twist for tiebacks and the podium rail.
export function makeRopeTexture(THREE) {
  const s = 64, cv = canvas(s, s), c = cv.getContext('2d');
  c.fillStyle = '#d9a845'; c.fillRect(0, 0, s, s);
  for (let i = -s; i < s * 2; i += 16) {
    c.strokeStyle = '#fff0bf'; c.lineWidth = 4;
    c.beginPath(); c.moveTo(i, 0); c.lineTo(i + s, s); c.stroke();
    c.strokeStyle = '#6b4510'; c.lineWidth = 3;
    c.beginPath(); c.moveTo(i + 8, 0); c.lineTo(i + 8 + s, s); c.stroke();
  }
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
