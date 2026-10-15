// Light (Matinée) / dark (Evening) theme for Pocket Orchestra. Owned by T7.
// API: getTheme() -> 'light'|'dark', setTheme(t, {origin?, persist?}), toggleTheme({origin?}).
// Sets <html data-theme>, persists in localStorage 'orch-theme', dispatches window `orch:theme {theme}`
// AFTER the new tokens are live (read them with getComputedStyle(document.documentElement)).
// Self-mounts the toggle button (bottom-left). Styles live in theme.css.

const KEY = 'orch-theme';
const FONTS = 'https://fonts.googleapis.com/css2?family=Bodoni+Moda:ital,opsz,wght@0,6..96,400..800;1,6..96,400..800&family=Jost:wght@400..600&display=swap';
const root = document.documentElement;
const darkMq = matchMedia('(prefers-color-scheme: dark)');
const calmMq = matchMedia('(prefers-reduced-motion: reduce)');
const valid = (t) => t === 'light' || t === 'dark';

function stored() {
  try { const t = localStorage.getItem(KEY); return valid(t) ? t : null; } catch { return null; }
}
function store(t) {
  try { localStorage.setItem(KEY, t); } catch { /* private mode / blocked storage: theme still works for this visit */ }
}
const systemTheme = () => (darkMq.matches ? 'dark' : 'light');

let target = null; // theme requested but not painted yet (a View Transition paints on the next frame)

export function getTheme() {
  if (target) return target;
  const t = root.dataset.theme;
  return valid(t) ? t : (stored() || systemTheme());
}

let button = null;

function paint(t) {
  root.dataset.theme = t;
  let meta = document.querySelector('meta[name="theme-color"]');
  if (!meta) { meta = document.createElement('meta'); meta.name = 'theme-color'; document.head.append(meta); }
  meta.content = getComputedStyle(root).getPropertyValue('--bg').trim() || (t === 'dark' ? '#0d0709' : '#f4ecdc');
  if (button) {
    button.setAttribute('aria-pressed', String(t === 'dark'));
    button.title = t === 'dark' ? 'Evening (dark). Switch to Matinée (light)' : 'Matinée (light). Switch to Evening (dark)';
  }
}

function announce(t) {
  window.dispatchEvent(new CustomEvent('orch:theme', { detail: { theme: t } }));
}

function originPoint(origin) {
  if (origin && Number.isFinite(origin.x) && Number.isFinite(origin.y)) return origin;
  const r = button?.getBoundingClientRect();
  return r && r.width ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : { x: 32, y: innerHeight - 32 };
}

let fadeTimer = 0;
function swap(t, origin) {
  const update = () => { if (target === t) target = null; paint(t); announce(t); };
  if (calmMq.matches || document.visibilityState === 'hidden') { update(); return; }

  if (button) { button.classList.remove('is-flipping'); void button.offsetWidth; button.classList.add('is-flipping'); }

  if (typeof document.startViewTransition === 'function') {
    // Spotlight iris: the new theme opens out of the switch like a follow-spot widening on stage.
    const { x, y } = originPoint(origin);
    const r = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
    let vt;
    try { vt = document.startViewTransition(update); } catch { update(); return; }
    vt.ready.then(() => {
      root.animate(
        { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${r}px at ${x}px ${y}px)`] },
        { duration: 820, easing: 'cubic-bezier(.65, 0, .25, 1)', pseudoElement: '::view-transition-new(root)' },
      );
    }).catch(() => {});
    return;
  }
  // Fallback: a plain cross-fade of colors.
  clearTimeout(fadeTimer);
  root.classList.add('theme-fading');
  update();
  fadeTimer = setTimeout(() => root.classList.remove('theme-fading'), 700);
}

export function setTheme(t, { origin, persist = true } = {}) {
  if (!valid(t)) return getTheme();
  if (persist) store(t);
  if (t === getTheme()) { if (!target) paint(t); return t; }
  target = t;
  swap(t, origin);
  return t;
}

export function toggleTheme(opts = {}) {
  return setTheme(getTheme() === 'dark' ? 'light' : 'dark', opts);
}

function mountToggle() {
  if (button || document.querySelector('.orch-theme')) return;
  button = document.createElement('button');
  button.type = 'button';
  button.className = 'orch-theme';
  button.setAttribute('aria-label', 'Evening (dark theme)');
  button.innerHTML = `
    <span class="tt-word tt-matinee" aria-hidden="true">Matinée</span>
    <span class="tt-track" aria-hidden="true">
      <span class="tt-star s1"></span><span class="tt-star s2"></span><span class="tt-star s3"></span><span class="tt-star s4"></span><span class="tt-star s5"></span>
      <span class="tt-cloud c1"></span><span class="tt-cloud c2"></span>
      <span class="tt-orb"><span class="tt-rays"></span><span class="tt-knob"></span></span>
    </span>
    <span class="tt-word tt-evening" aria-hidden="true">Evening</span>
    <span class="tt-flash" aria-hidden="true"></span>`;
  button.addEventListener('click', (e) => {
    // keyboard "clicks" have no pointer position: open the iris from the switch itself
    const origin = e.detail > 0 ? { x: e.clientX, y: e.clientY } : undefined;
    toggleTheme({ origin });
  });
  button.addEventListener('animationend', (e) => { if (e.animationName === 'tt-flash') button.classList.remove('is-flipping'); });
  document.body.append(button);
}

function ensureFonts() {
  if (document.querySelector('link[href*="fonts.googleapis.com"][href*="Bodoni"]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = FONTS;
  document.head.append(link);
}

// ---- boot ----
paint(valid(root.dataset.theme) ? root.dataset.theme : (stored() || systemTheme()));
ensureFonts();
if (document.body) mountToggle(); else addEventListener('DOMContentLoaded', mountToggle, { once: true });
paint(root.dataset.theme);
announce(root.dataset.theme);

// Follow the OS until the user picks a theme themselves (also re-checked when the tab comes back into view).
const followSystem = () => { if (!stored()) setTheme(systemTheme(), { persist: false }); };
darkMq.addEventListener('change', followSystem);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') followSystem(); });
// Keep several open tabs in step.
addEventListener('storage', (e) => { if (e.key === KEY && valid(e.newValue)) setTheme(e.newValue, { persist: false }); });
