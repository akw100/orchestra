// Procedural instrument geometry, cached per type and shared by every seat.
// Each builder returns {materialName: BufferGeometry} (merged per material) plus anchors.
import { T, TAU, geo, merge, cyl, box, ball, lathe, tube } from './kit.js';

// ---------- bowed strings: violin-family body (length along +Y, top face +Z), bow along +X ----------
const VIOLIN_R = [[0, -0.178], [0.066, -0.168], [0.098, -0.136], [0.104, -0.092], [0.092, -0.052], [0.064, -0.026], [0.056, 0], [0.064, 0.026], [0.081, 0.052], [0.085, 0.09], [0.075, 0.128], [0.046, 0.157], [0, 0.166]];
export const violin = () => geo('violin', () => {
  const pts = [...VIOLIN_R, ...VIOLIN_R.slice(1, -1).reverse().map(([x, y]) => [-x, y])].map(([x, y]) => new T.Vector2(x, y));
  const sh = new T.Shape(); sh.moveTo(pts[0].x, pts[0].y); sh.splineThru([...pts.slice(1), pts[0]]);
  const body = new T.ExtrudeGeometry(sh, { depth: 0.03, bevelEnabled: true, bevelThickness: 0.006, bevelSize: 0.005, bevelSegments: 2, curveSegments: 6, steps: 1 }).translate(0, 0, -0.015);
  const scroll = new T.TorusGeometry(0.013, 0.0065, 6, 16, 1.6 * Math.PI).rotateY(Math.PI / 2).translate(0, 0.375, 0.006);
  const varnish = merge([body, box(0.024, 0.13, 0.018, 0, 0.225, 0.012), box(0.02, 0.075, 0.026, 0, 0.325, 0.006), scroll]);
  const eb = [box(0.03, 0.27, 0.007, 0, 0.175, 0.033), box(0.034, 0.1, 0.006, 0, -0.118, 0.026), box(0.06, 0.04, 0.012, 0.03, -0.158, 0.028),
    box(0.005, 0.066, 0.003, 0.036, -0.02, 0.0215, 0, 0, 0.12), box(0.005, 0.066, 0.003, -0.036, -0.02, 0.0215, 0, 0, -0.12)];
  for (let i = 0; i < 4; i++) eb.push(cyl([-0.026, 0.305 + i * 0.016, 0.006], [0.026, 0.305 + i * 0.016, 0.006], 0.0038, 0.0045, 6));
  const strings = [];
  for (const x of [-0.0105, -0.0035, 0.0035, 0.0105]) strings.push(cyl([x, -0.07, 0.043], [x * 0.7, 0.31, 0.037], 0.0008, 0.0008, 3));
  return { varnish, ebony: merge(eb), maple: box(0.042, 0.003, 0.021, 0, -0.03, 0.032), string: merge(strings) };
});
export const VIOLIN_NECK_Y = 0.27, VIOLIN_CONTACT = [0, -0.012, 0.045];
export const endpin = () => geo('endpin', () => merge([cyl([0, -0.183, 0], [0, -0.36, 0], 0.004, 0.0015, 6), cyl([0, -0.175, 0], [0, -0.19, 0], 0.009, 0.008, 8)]));
export const bow = () => geo('bow', () => ({
  ebony: merge([cyl([0, 0, 0], [0.72, 0, 0], 0.0045, 0.0028, 6), box(0.04, 0.02, 0.011, 0.022, -0.011, 0), box(0.012, 0.017, 0.006, 0.716, -0.007, 0)]),
  silver: cyl([-0.004, 0, 0], [0.012, 0, 0], 0.0052, 0.0052, 8),
  bowhair: box(0.69, 0.0018, 0.008, 0.37, -0.0145, 0),
}));
export const BOW_HAIR_Y = -0.0155;

// ---------- woodwinds (mouth end at local origin, body along +Y, keys on +Z) ----------
export const flute = () => geo('flute', () => {
  const p = [cyl([0, -0.06, 0], [0, 0.62, 0], 0.0096, 0.0096, 12), cyl([0, -0.075, 0], [0, -0.06, 0], 0.011, 0.011, 12), box(0.024, 0.032, 0.004, 0, 0, 0.011)];
  for (let i = 0; i < 13; i++) p.push(cyl([0, 0.16 + i * 0.034, 0.008], [0, 0.16 + i * 0.034, 0.0125], 0.0072, 0.0072, 10));
  p.push(cyl([0.009, 0.15, 0.006], [0.009, 0.6, 0.006], 0.0016, 0.0016, 4));
  return { silver: merge(p), eye: ball(0.0045, 0, 0, 0.0132, 1.4, 1, 0.3, 8, 6) };
});
export const clarinet = () => geo('clarinet', () => {
  const body = lathe([[0, 0], [0.006, 0], [0.0115, 0.04], [0.0125, 0.045], [0.0125, 0.075], [0.0145, 0.077], [0.0145, 0.135], [0.0128, 0.137], [0.0128, 0.6], [0.016, 0.635], [0.024, 0.675], [0.034, 0.705], [0.037, 0.712], [0.033, 0.714], [0, 0.714]], 16);
  const s = [new T.TorusGeometry(0.0128, 0.0025, 6, 14).rotateX(Math.PI / 2).translate(0, 0.03, 0)];
  for (const y of [0.075, 0.137, 0.38, 0.6]) s.push(new T.TorusGeometry(0.0138, 0.0018, 6, 14).rotateX(Math.PI / 2).translate(0, y, 0));
  for (let i = 0; i < 9; i++) s.push(cyl([0, 0.18 + i * 0.045, 0.011], [0, 0.18 + i * 0.045, 0.017], 0.006, 0.006, 8));
  s.push(cyl([0.007, 0.16, 0.012], [0.007, 0.58, 0.012], 0.0016, 0.0016, 4), cyl([-0.007, 0.25, 0.012], [-0.007, 0.56, 0.012], 0.0016, 0.0016, 4));
  return { ebony: body, silver: merge(s) };
});

// ---------- brass (mouthpiece at local origin) ----------
const bell = (len, r0, r1, k = 3.2, seg = 24) => { const p = []; for (let i = 0; i <= 14; i++) { const t = i / 14; p.push([r0 + (r1 - r0) * Math.pow(t, k), t * len]); } p.push([r1 + 0.004, len], [r1 - 0.002, len - 0.004]); return lathe(p, seg); };
export const trumpet = () => geo('trumpet', () => { // bell along +Y, valve caps toward +Z
  const p = [lathe([[0.004, 0.0], [0.013, 0.004], [0.011, 0.016], [0.006, 0.035], [0.0055, 0.08]], 14)];
  p.push(tube([[0, 0.078, 0], [0, 0.2, 0], [0, 0.3, 0.0], [0, 0.345, 0.03], [0, 0.3, 0.06], [0, 0.15, 0.06], [0, 0.06, 0.06], [-0.012, 0.022, 0.085], [-0.022, 0.06, 0.11], [-0.022, 0.18, 0.11], [-0.022, 0.29, 0.11]], 0.0056, 90, 7));
  p.push(tube([[0, 0.25, 0.06], [0.03, 0.235, 0.075], [0.03, 0.185, 0.075], [0.0, 0.17, 0.06]], 0.0048, 24, 6)); // valve slide
  p.push(bell(0.2, 0.0056, 0.062, 3.4).translate(-0.022, 0.29, 0.11));
  for (let i = 0; i < 3; i++) {
    const y = 0.13 + i * 0.026;
    p.push(cyl([0, y, 0.025], [0, y, 0.098], 0.0112, 0.0112, 12), cyl([0, y, 0.098], [0, y, 0.12], 0.0025, 0.0025, 5), cyl([0, y, 0.12], [0, y, 0.126], 0.0085, 0.0085, 10));
  }
  return { brass: merge(p) };
});
export const horn = () => geo('horn', () => { // built in torso orientation: X = player's left, Y up, Z forward
  const C = [-0.1, -0.22, 0.2];
  const p = [lathe([[0.004, 0], [0.012, 0.004], [0.01, 0.014], [0.005, 0.034], [0.0048, 0.06]], 12).rotateX(Math.PI / 2)];
  p.push(new T.TorusGeometry(0.105, 0.0068, 7, 48).rotateY(Math.PI / 2).translate(...C));
  p.push(new T.TorusGeometry(0.084, 0.006, 6, 40).rotateY(Math.PI / 2).translate(C[0] - 0.02, C[1] + 0.006, C[2]));
  p.push(new T.TorusGeometry(0.064, 0.0055, 6, 36).rotateY(Math.PI / 2).translate(C[0] + 0.018, C[1] - 0.01, C[2] + 0.01));
  p.push(tube([[0, 0, 0.058], [0, -0.04, 0.1], [-0.04, -0.09, 0.16], [-0.09, -0.115, 0.2]], 0.0052, 30, 6));
  p.push(tube([[-0.1, -0.325, 0.2], [-0.12, -0.36, 0.13], [-0.15, -0.37, 0.06], [-0.17, -0.37, 0.02]], 0.009, 24, 8));
  const b = bell(0.28, 0.009, 0.15, 3.0, 28);
  b.applyQuaternion(new T.Quaternion().setFromUnitVectors(new T.Vector3(0, 1, 0), new T.Vector3(-0.28, -0.04, -1).normalize())).translate(-0.17, -0.37, 0.02);
  p.push(b);
  for (let i = 0; i < 3; i++) p.push(cyl([-0.035, -0.13 - i * 0.03, 0.235], [0.01, -0.13 - i * 0.03, 0.235], 0.0115, 0.0115, 12));
  p.push(cyl([0.012, -0.12, 0.24], [0.04, -0.16, 0.26], 0.004, 0.004, 5));
  return { brass: merge(p) };
});
export const HORN_VALVE = [0.02, -0.16, 0.24], HORN_BELL = [-0.2, -0.375, -0.05];

// ---------- harp: string plane x = 0, player behind the soundbox at z < 0.1 ----------
export const HARP_N = 34;
const neckY = (z) => 1.36 + 0.33 * Math.pow((z - 0.06) / 0.86, 1.4) + 0.05 * Math.sin(z * 7.5);
const boardY = (z) => 0.16 + ((0.52 - z) / 0.42) * 1.06; // soundboard line: z 0.52 (y .16) -> z 0.10 (y 1.22)
export const harpString = (i, out) => { const z = 0.13 + (1 - i / (HARP_N - 1)) * 0.37; out.set(0, boardY(z) + 0.03, z); return neckY(z) - 0.035; }; // returns top y
export const harp = () => geo('harp', () => {
  const wood = [box(0.3, 0.1, 0.5, 0, 0.05, 0.68), box(0.24, 0.05, 0.44, 0, 0.125, 0.68)];
  const sb0 = [0, 0.1, 0.56], sb1 = [0, 1.28, 0.06];
  const sbox = cyl(sb0, sb1, 0.15, 0.055, 8); sbox.scale(1, 1, 1); wood.push(sbox);
  const neckPts = []; for (let i = 0; i <= 10; i++) { const z = 0.06 + (i / 10) * 0.86; neckPts.push([0, neckY(z) + (i === 0 ? -0.04 : 0), z]); }
  wood.push(tube(neckPts, 0.032, 40, 8).scale(0.8, 1, 1));
  const gold = [cyl([0, 0.1, 0.92], [0, 1.72, 0.92], 0.034, 0.03, 12), lathe([[0.04, 0], [0.06, 0.05], [0.05, 0.1], [0.07, 0.15], [0.03, 0.2], [0, 0.22]], 12).translate(0, 1.7, 0.92),
    new T.TorusGeometry(0.045, 0.01, 6, 14).rotateX(Math.PI / 2).translate(0, 0.14, 0.92), box(0.26, 0.012, 0.46, 0, 0.102, 0.68)];
  for (let i = 0; i < 7; i++) gold.push(box(0.012, 0.02, 0.03, (i % 2 ? 1 : -1) * 0.07, 0.03, 0.5 + i * 0.05));
  return { maple: merge(wood), gold: merge(gold) };
});

// ---------- grand piano: pianist at origin, keyboard front edge z 0.38, tail toward +z ----------
export const PIANO_W = 52, PIANO_KEY_W = 1.22 / 52, PIANO_X0 = 0.61, PIANO_KEY_Y = 0.753, PIANO_KEY_Z = 0.42;
export const PIANO_MAP = (() => { // midi -> {i (instance), black, x}
  const m = {}; let w = 0, b = 0;
  for (let n = 21; n <= 108; n++) {
    const pc = n % 12, black = [1, 3, 6, 8, 10].includes(pc);
    if (black) { m[n] = { i: b++, black: true, x: PIANO_X0 - w * PIANO_KEY_W }; }
    else { m[n] = { i: w, black: false, x: PIANO_X0 - (w + 0.5) * PIANO_KEY_W }; w++; }
  }
  return m;
})();
function pianoShape(inset = 0) {
  const s = new T.Shape(), k = 1 - inset;
  const P = (x, z) => [x * k, 0.55 + inset * 0.4 + (z - 0.55) * k];
  s.moveTo(...P(0.75, 0.55)); s.lineTo(...P(-0.75, 0.55)); s.lineTo(...P(-0.75, 1.0));
  s.bezierCurveTo(...P(-0.75, 1.5), ...P(-0.18, 1.45), ...P(0.04, 1.95));
  s.bezierCurveTo(...P(0.22, 2.35), ...P(0.75, 2.42), ...P(0.75, 2.1)); s.lineTo(...P(0.75, 0.55));
  return s;
}
export const piano = () => geo('piano', () => {
  const ext = (sh, depth) => new T.ExtrudeGeometry(sh, { depth, bevelEnabled: true, bevelThickness: 0.008, bevelSize: 0.008, bevelSegments: 2, curveSegments: 18 }).rotateX(Math.PI / 2);
  const lac = [ext(pianoShape(), 0.28).translate(0, 0.98, 0)];
  for (const [x, z] of [[0.64, 0.68], [-0.64, 0.68], [0.5, 2.15]]) lac.push(cyl([x, 0.04, z], [x, 0.72, z], 0.032, 0.05, 10));
  lac.push(box(1.3, 0.035, 0.22, 0, 0.705, 0.45), box(0.07, 0.12, 0.25, 0.655, 0.75, 0.445), box(0.07, 0.12, 0.25, -0.655, 0.75, 0.445), box(1.24, 0.07, 0.03, 0, 0.79, 0.545));
  lac.push(box(0.03, 0.55, 0.03, 0.06, 0.38, 0.74), box(0.03, 0.55, 0.03, -0.06, 0.38, 0.74), box(0.2, 0.04, 0.12, 0, 0.1, 0.74));
  lac.push(box(0.62, 0.22, 0.012, 0, 1.08, 0.66, -0.25)); // music desk
  const lid = new T.ExtrudeGeometry(pianoShape(), { depth: 0.02, bevelEnabled: false, curveSegments: 18 }).rotateX(Math.PI / 2).translate(-0.75, 0.02, 0);
  const gold = [new T.ExtrudeGeometry(pianoShape(0.07), { depth: 0.012, bevelEnabled: false, curveSegments: 18 }).rotateX(Math.PI / 2).translate(0, 0.93, 0)];
  for (const x of [-0.05, 0, 0.05]) gold.push(box(0.025, 0.012, 0.09, x, 0.07, 0.68));
  for (const [x, z] of [[0.64, 0.68], [-0.64, 0.68], [0.5, 2.15]]) gold.push(ball(0.03, x, 0.03, z));
  const strings = [];
  for (let i = 0; i < 26; i++) { const x = 0.55 - i * 0.045, z1 = 2.1 - Math.pow(i / 25, 0.8) * 1.0; strings.push(box(0.003, 0.002, z1 - 0.72, x, 0.945, (0.72 + z1) / 2, 0, (i / 25) * -0.3)); }
  const prop = cyl([-0.62, 0.99, 1.3], [-0.38, 1.765, 1.3], 0.009, 0.009, 6);
  return { lacquer: merge(lac), lid: lid, gold: merge(gold), string: merge(strings), prop,
    white: box(PIANO_KEY_W * 0.94, 0.022, 0.15, 0, 0, 0), black: box(0.012, 0.022, 0.095, 0, 0, 0) };
});
export const PIANO_LID_ANGLE = -0.62, PIANO_PAPER = [0, 1.09, 0.652];

// ---------- glockenspiel (player standing at origin) ----------
export const GLOCK_N = 15, GLOCK_SHARPS = [0, 1, 3, 4, 5, 7, 8, 10, 11, 12]; // sharp after natural index i
export const glockBarX = (i) => 0.33 - i * 0.047;
export const glock = () => geo('glock', () => {
  const frame = [box(0.78, 0.07, 0.36, 0, 0.8, 0.47), cyl([-0.3, 0, 0.36], [0.3, 0.77, 0.58], 0.012, 0.012, 6), cyl([0.3, 0, 0.36], [-0.3, 0.77, 0.58], 0.012, 0.012, 6),
    cyl([-0.3, 0, 0.58], [0.3, 0.77, 0.36], 0.012, 0.012, 6), cyl([0.3, 0, 0.58], [-0.3, 0.77, 0.36], 0.012, 0.012, 6)];
  const felt = [box(0.74, 0.012, 0.025, 0, 0.84, 0.36), box(0.74, 0.012, 0.025, 0, 0.84, 0.47), box(0.74, 0.012, 0.025, 0, 0.852, 0.52), box(0.74, 0.012, 0.025, 0, 0.852, 0.6)];
  return { ebony: merge(frame), rubber: merge(felt), bar: box(0.036, 0.012, 1, 0, 0, 0) };
});
export const mallet = (head = 0.017, len = 0.32) => geo('mallet' + head + len, () => ({ maple: cyl([0, 0, 0], [0, len, 0], 0.0045, 0.004, 6), head: ball(head, 0, len, 0, 1, 1, 1, 10, 8) }));
export const stick = () => geo('stick', () => ({ maple: merge([cyl([0, -0.03, 0], [0, 0.38, 0], 0.0075, 0.005, 7), ball(0.0065, 0, 0.385, 0, 1, 1.4, 1, 8, 6)]) }));

// ---------- timpani ----------
export const timp = (r) => geo('timp' + r, () => {
  const bowl = lathe([[r + 0.012, 0], [r + 0.01, -0.06], [r * 0.96, -0.2], [r * 0.82, -0.36], [r * 0.5, -0.48], [0, -0.5]], 28);
  const chrome = [new T.TorusGeometry(r + 0.012, 0.012, 8, 40).rotateX(Math.PI / 2).translate(0, 0.012, 0)];
  for (let i = 0; i < 3; i++) { const a = (i / 3) * TAU + 0.6; chrome.push(cyl([Math.sin(a) * r * 0.7, -0.3, Math.cos(a) * r * 0.7], [Math.sin(a) * r * 0.95, -0.78, Math.cos(a) * r * 0.95], 0.014, 0.012, 6)); }
  for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU; chrome.push(cyl([Math.sin(a) * (r + 0.02), 0.01, Math.cos(a) * (r + 0.02)], [Math.sin(a) * (r + 0.03), -0.12, Math.cos(a) * (r + 0.03)], 0.006, 0.006, 5)); }
  chrome.push(box(0.12, 0.02, 0.22, 0, -0.76, -r * 0.6));
  return { copper: bowl, chrome: merge(chrome), head: new T.SphereGeometry(r / Math.sin(0.32), 32, 4, 0, TAU, 0, 0.32).scale(1, 0.35, 1).translate(0, -(r / Math.sin(0.32)) * Math.cos(0.32) * 0.35 + 0.006, 0) };
});

// ---------- drum kit pieces ----------
const hoop = (r, y, t = 0.014) => new T.TorusGeometry(r, t, 8, 36).rotateX(Math.PI / 2).translate(0, y, 0);
export const drum = (r, h) => geo('drum' + r + h, () => {
  const lugs = [];
  for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU; lugs.push(box(0.016, h * 0.42, 0.022, Math.sin(a) * (r + 0.01), 0, Math.cos(a) * (r + 0.01), 0, a, 0)); }
  return { shell: new T.CylinderGeometry(r, r, h, 32, 1, true), chrome: merge([hoop(r + 0.004, h / 2), hoop(r + 0.004, -h / 2), ...lugs]), head: new T.CircleGeometry(r, 32).rotateX(-Math.PI / 2).translate(0, h / 2 + 0.002, 0) };
});
export const cymbal = (r) => geo('cym' + r, () => lathe([[0, 0.028], [0.018, 0.026], [r * 0.2, 0.02], [r * 0.24, 0.012], [r * 0.6, 0.005], [r, -0.006], [r - 0.002, -0.009], [r * 0.6, 0.002], [r * 0.24, 0.009], [r * 0.2, 0.016], [0.018, 0.022], [0, 0.024]], 40));
export const standPole = (a, b, r = 0.011) => cyl(a, b, r, r * 0.85, 7);
export const tripod = (x, z, r = 0.26, y = 0.22) => { const p = []; for (let i = 0; i < 3; i++) { const a = (i / 3) * TAU + 0.3; p.push(cyl([x, y, z], [x + Math.sin(a) * r, 0.005, z + Math.cos(a) * r], 0.008, 0.008, 5)); } return p; };
export const choirFolder = () => geo('folder', () => ({ cover: box(0.23, 0.31, 0.008, 0.115, 0, 0), page: box(0.215, 0.29, 0.004, 0.11, 0, 0.007), pageB: box(0.215, 0.29, 0.004, 0.11, 0, -0.007) }));
