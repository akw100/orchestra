// Pocket Orchestra 3D: post-processing (owned by 3D-D).
// createPost(ctx) -> { render(frame), setSize(w, h), applyTheme(tok), ready, params, dispose() }
// Pipeline (quality 'high'): RenderPass (MSAA, half-float HDR) -> UnrealBloomPass (only emissive / HDR highlights;
// strength breathes with frame.level, swells with frame.tutti) -> OutputPass (tone mapping + sRGB from the renderer)
// -> Finish pass (vignette, film grain, chromatic aberration at the edges; no grain/CA under reduced motion).
// quality 'low' (or while the addons are still loading, or if they fail): plain renderer.render(scene, camera).
// setSize(w, h) takes CSS pixels, like renderer.setSize; the composer also follows the renderer's size by itself.

const FINISH = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uRes: { value: null },
    uVig: { value: 0.32 },
    uVigColor: { value: null },
    uGrain: { value: 0.035 },
    uCA: { value: 0.006 },
  },
  vertexShader: /* glsl */ `
varying vec2 vUv;
void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
uniform sampler2D tDiffuse; uniform float uTime, uVig, uGrain, uCA; uniform vec2 uRes; uniform vec3 uVigColor;
varying vec2 vUv;
float hash(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
void main(){
  vec2 c = vUv - 0.5;
  float r2 = dot(c, c);
  vec2 off = c * r2 * uCA;
  vec4 base = texture2D(tDiffuse, vUv);
  vec3 col = vec3(texture2D(tDiffuse, vUv + off).r, base.g, texture2D(tDiffuse, vUv - off).b);
  float aspect = uRes.x / max(uRes.y, 1.0);
  vec2 vc = c * vec2(mix(1.0, aspect, 0.5), 1.0);
  float vig = smoothstep(0.28, 0.95, length(vc) * 1.25);
  col = mix(col, col * uVigColor, vig * uVig);
  float lum = dot(col, vec3(0.299, 0.587, 0.114));
  float g = hash(vUv * uRes + fract(uTime * 7.31) * vec2(917.0, 373.0)) - 0.5;
  col += g * uGrain * (0.55 + 0.6 * (1.0 - lum)) * (0.4 + 0.6 * smoothstep(0.0, 0.25, lum));
  gl_FragColor = vec4(col, base.a);
}`,
};

export function createPost(ctx) {
  const { THREE, renderer, scene, camera } = ctx;
  const reduced = !!ctx.reducedMotion;
  const params = {
    // Evening: only HDR highlights (emissive, glyph cores, glints) bloom
    dark: { strength: 0.62, radius: 0.55, threshold: 0.82, vignette: 0.42, grain: 0.04, ca: 0.0065, vigColor: [0.02, 0.01, 0.02] },
    // Matinée: bright hall, so a high threshold and a gentle warm vignette
    light: { strength: 0.22, radius: 0.45, threshold: 1.02, vignette: 0.2, grain: 0.022, ca: 0.0045, vigColor: [0.72, 0.6, 0.48] },
    levelGain: 0.55, tuttiGain: 0.75,
  };
  let dark = true, composer = null, bloom = null, finish = null, enabled = false;
  let lv = 0, tu = 0, clock = 0;
  const cssSize = new THREE.Vector2(), bufSize = new THREE.Vector2();
  const want = { w: 0, h: 0 };

  const ready = ctx.quality === 'low' ? Promise.resolve(false) : load();

  async function load() {
    try {
      const [{ EffectComposer }, { RenderPass }, { UnrealBloomPass }, { ShaderPass }, { OutputPass }] = await Promise.all([
        ctx.addons('postprocessing/EffectComposer.js'),
        ctx.addons('postprocessing/RenderPass.js'),
        ctx.addons('postprocessing/UnrealBloomPass.js'),
        ctx.addons('postprocessing/ShaderPass.js'),
        ctx.addons('postprocessing/OutputPass.js'),
      ]);
      renderer.getSize(cssSize);
      const pr = renderer.getPixelRatio();
      const rt = new THREE.WebGLRenderTarget(Math.max(1, cssSize.x * pr), Math.max(1, cssSize.y * pr), {
        type: THREE.HalfFloatType, samples: 4,
      });
      composer = new EffectComposer(renderer, rt);
      composer.addPass(new RenderPass(scene, camera));
      bloom = new UnrealBloomPass(new THREE.Vector2(cssSize.x, cssSize.y), params.dark.strength, params.dark.radius, params.dark.threshold);
      composer.addPass(bloom);
      composer.addPass(new OutputPass());
      finish = new ShaderPass(FINISH);
      finish.uniforms.uRes.value = new THREE.Vector2(1, 1);
      finish.uniforms.uVigColor.value = new THREE.Color();
      composer.addPass(finish);
      enabled = true;
      sync(true);
      applyMode();
      return true;
    } catch (e) {
      console.warn('[post] post-processing unavailable, rendering directly', e);
      composer = null; enabled = false;
      return false;
    }
  }

  // keep the composer at the renderer's size even if only renderer.setSize was called
  function sync(force) {
    if (!composer) return;
    renderer.getDrawingBufferSize(bufSize);
    const rt = composer.renderTarget1;
    if (!force && rt.width === bufSize.x && rt.height === bufSize.y) return;
    renderer.getSize(cssSize);
    composer.setPixelRatio(renderer.getPixelRatio());
    composer.setSize(want.w || cssSize.x, want.h || cssSize.y);
    finish.uniforms.uRes.value.set(bufSize.x, bufSize.y);
    want.w = want.h = 0;
  }

  function applyMode() {
    if (!finish) return;
    const p = dark ? params.dark : params.light;
    finish.uniforms.uVig.value = p.vignette;
    finish.uniforms.uGrain.value = reduced ? 0 : p.grain;
    finish.uniforms.uCA.value = reduced ? 0 : p.ca;
    finish.uniforms.uVigColor.value.setRGB(p.vigColor[0], p.vigColor[1], p.vigColor[2]);
  }

  function applyTheme(tok = {}) {
    let theme = tok.theme;
    if (!theme) {
      const c = new THREE.Color();
      try { c.setStyle(String(tok.stageBg || tok.bg || '#0a0609').trim()); } catch {}
      theme = c.getHSL({ h: 0, s: 0, l: 0 }, THREE.SRGBColorSpace).l > 0.4 ? 'light' : 'dark';
    }
    dark = theme !== 'light';
    applyMode();
  }

  function render(frame = {}) {
    const dt = Math.min(Math.max(Number.isFinite(frame.dt) ? frame.dt : 1 / 60, 0), 0.1);
    clock += dt;
    if (frame.theme && (frame.theme !== 'light') !== dark) { dark = frame.theme !== 'light'; applyMode(); }
    if (!enabled) { renderer.render(scene, camera); return; }
    sync(false);
    const L = Math.min(Math.max(frame.level || 0, 0), 1), T = Math.min(Math.max(frame.tutti || 0, 0), 1);
    lv += (L - lv) * Math.min(1, dt * (L > lv ? 10 : 2.5));
    tu += (T - tu) * Math.min(1, dt * 1.6);
    const p = dark ? params.dark : params.light;
    bloom.strength = p.strength * (0.75 + params.levelGain * lv + params.tuttiGain * tu);
    bloom.radius = p.radius + 0.18 * tu;
    bloom.threshold = p.threshold - 0.08 * tu;
    finish.uniforms.uTime.value = clock;
    composer.render(dt);
  }

  function setSize(w, h) {
    if (!composer) return;
    want.w = w; want.h = h;
    sync(true);
  }

  function dispose() {
    if (!composer) return;
    composer.renderTarget1.dispose(); composer.renderTarget2.dispose();
    for (const p of composer.passes) p.dispose?.();
    composer = null; enabled = false;
  }

  applyTheme(ctx.tok || {});
  return { render, setSize, applyTheme, ready, params, dispose, get enabled() { return enabled; } };
}
