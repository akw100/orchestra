// Background visual: spectrum glow + a burst per note. Placeholder for the full stage.
import { analyser, byId } from './audio.js';

const cv = document.getElementById('stage'), g = cv.getContext('2d');
const data = new Uint8Array(analyser.frequencyBinCount);
const sparks = [];
const fit = () => { cv.width = innerWidth * devicePixelRatio; cv.height = innerHeight * devicePixelRatio; };
addEventListener('resize', fit); fit();

addEventListener('orch:note', (e) => {
  const { inst, midi, vel } = e.detail;
  sparks.push({ x: Math.random() * cv.width, y: cv.height * (1 - (midi - 30) / 70), r: 0, a: vel, hue: byId[inst].hue });
});

(function frame() {
  const W = cv.width, H = cv.height;
  g.fillStyle = 'rgba(15,13,20,0.25)'; g.fillRect(0, 0, W, H);
  analyser.getByteFrequencyData(data);
  const n = 96, bw = W / n;
  for (let i = 0; i < n; i++) {
    const v = data[Math.floor(Math.pow(i / n, 2) * data.length * 0.5)] / 255;
    g.fillStyle = `hsla(${30 + i * 2}, 70%, 55%, ${v * 0.18})`;
    g.fillRect(i * bw, H - v * H * 0.5, bw - 2, v * H * 0.5);
  }
  for (let i = sparks.length - 1; i >= 0; i--) {
    const s = sparks[i]; s.r += 3 * devicePixelRatio; s.a *= 0.94;
    g.strokeStyle = `hsla(${s.hue}, 90%, 65%, ${s.a})`; g.lineWidth = 2 * devicePixelRatio;
    g.beginPath(); g.arc(s.x, s.y, s.r, 0, Math.PI * 2); g.stroke();
    if (s.a < 0.02) sparks.splice(i, 1);
  }
  requestAnimationFrame(frame);
})();
