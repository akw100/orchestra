// Multiplayer: everyone who opens the same ?room= link shares one orchestra.
// Peer to peer over WebRTC (Trystero). Public Nostr relays only carry the few-second handshake: no server of ours.
// Every browser plays the full mix itself, so only seat state (active / loop / count), tempo, the piece and the songbook song travel.
// Each person can claim one instrument; a claimed instrument only follows its claimant.
import * as O from './audio.js';
import { joinRoom, selfId } from 'https://cdn.jsdelivr.net/npm/trystero@0.26.0/+esm';

const roomId = (new URLSearchParams(location.search).get('room') || 'main').replace(/[^a-z0-9-]/gi, '').slice(0, 32) || 'main';
const inviteUrl = `${location.origin}${location.pathname}?room=${roomId}`;

// ponytail: full mesh, every browser connects to every other. Comfortable up to ~10-15 people per room.
const room = joinRoom({ appId: 'akw100-pocket-orchestra' }, roomId);
const seatMsg = room.makeAction('seats');
const tempoMsg = room.makeAction('tempo');
const pieceMsg = room.makeAction('piece');
const songMsg = room.makeAction('song');
const whoMsg = room.makeAction('who');

const store = (k, v) => { try { return v === undefined ? localStorage.getItem(k) : localStorage.setItem(k, v); } catch { return null; } };
const me = { name: store('orch-name') || '', inst: null };
const peers = {}; // peerId -> { name, inst }
const known = {}; // inst -> { snap, at }: the state the room agreed on; at = 0 means untouched
let tempo = { bpm: O.bpm, at: 0 }; // last writer wins, so a newcomer's default tempo never overrides the room
let piece = { id: O.piece.id, at: 0 }; // the work on the stands, same rule
let song = { title: '', at: 0 }; // the songbook's song ('' = free play), same rule
let applying = false;

const seatsOf = (inst) => O.seats.filter((s) => s.inst === inst);
const snapOf = (inst) => seatsOf(inst).map((s) => ({ a: s.active, l: s.loop }));
const fresh = (inst) => Array.from({ length: O.byId[inst].copies }, () => ({ a: false, l: true }));
const same = (p, q) => p.length === q.length && p.every((x, i) => x.a === q[i].a && x.l === q[i].l);
// a "play once" seat running out by itself isn't news: every browser ends it at the same point
const settled = (p, q) => p.length === q.length && p.every((x, i) => x.l === q[i].l && (x.a === q[i].a || (!q[i].l && !q[i].a)));
const ownerOf = (inst) => (me.inst === inst ? selfId : Object.keys(peers).find((id) => peers[id].inst === inst));
const nextAt = (at) => Math.max(Date.now(), at + 1); // monotonic even if this device's clock is behind

function apply(inst, snap) {
  applying = true;
  try {
    while (O.sectionSize(inst) < snap.length) O.addSeat(inst);
    while (O.sectionSize(inst) > snap.length && O.sectionSize(inst) > 1) O.removeSeat(inst);
    seatsOf(inst).forEach((s, i) => {
      const { a, l } = snap[i];
      if (a && !s.active) O.play(s, l);
      else if (!a && s.active) O.stop(s);
      else if (s.loop !== l) O.setLoop(s, l);
    });
  } finally { applying = false; }
}

// ---------- local changes -> room ----------
let queued = false;
addEventListener('orch:change', () => { if (!applying && !queued) { queued = true; queueMicrotask(sync); } });
function sync() {
  queued = false;
  for (const inst of Object.keys(O.byId)) {
    const snap = snapOf(inst), cur = (known[inst] ??= { snap: fresh(inst), at: 0 });
    if (same(cur.snap, snap)) continue;
    if (settled(cur.snap, snap)) { cur.snap = snap; continue; }
    const owner = ownerOf(inst);
    if (owner && owner !== selfId) { apply(inst, cur.snap); nudge(inst); continue; } // someone else's instrument: undo
    known[inst] = { snap, at: nextAt(cur.at) };
    seatMsg.send({ inst, ...known[inst] });
  }
  render();
}

addEventListener('orch:tempo', (e) => {
  if (e.detail?.from === 'net') return;
  const bpm = Number(e.detail?.bpm ?? O.bpm);
  if (!Number.isFinite(bpm)) return;
  tempo = { bpm, at: nextAt(tempo.at) };
  tempoMsg.send(tempo);
});

// a local pick (queued, cancelled or turned) differs from the agreed piece; applying a remote one doesn't, so no echo
addEventListener('orch:song', (e) => {
  if (e.detail?.id === piece.id) return;
  piece = { id: e.detail.id, at: nextAt(piece.at) };
  pieceMsg.send(piece);
});

addEventListener('orch:songbook', (e) => {
  if (e.detail?.from === 'net' || typeof e.detail?.title !== 'string' || e.detail.title === song.title) return;
  song = { title: e.detail.title, at: nextAt(song.at) };
  songMsg.send(song);
});

// ---------- room -> local (peers can send anything: validate every field) ----------
seatMsg.onMessage = (d, { peerId }) => {
  const inst = d?.inst, at = Number(d?.at);
  if (!Object.hasOwn(O.byId, inst) || !Array.isArray(d.snap) || !d.snap.length || !(at > (known[inst]?.at ?? 0))) return;
  const owner = ownerOf(inst);
  if (owner && owner !== peerId) return; // only the claimant moves a claimed instrument
  known[inst] = { snap: d.snap.slice(0, 16).map((x) => ({ a: !!x?.a, l: x?.l !== false })), at };
  apply(inst, known[inst].snap);
};
tempoMsg.onMessage = (d) => {
  const bpm = Number(d?.bpm), at = Number(d?.at);
  if (!(bpm >= 30 && bpm <= 300) || !(at > tempo.at)) return;
  tempo = { bpm, at };
  O.setBpm(bpm);
  dispatchEvent(new CustomEvent('orch:tempo', { detail: { bpm, from: 'net' } }));
  const hud = document.querySelector('.k-bpm b'); // ponytail: keys.js only refreshes on slider input; firing one would echo
  if (hud) hud.textContent = bpm;
};
pieceMsg.onMessage = (d) => {
  const at = Number(d?.at);
  if (!O.PIECES.some((p) => p.id === d?.id) || !(at > piece.at)) return;
  piece = { id: d.id, at };
  O.setPiece(d.id);
};
songMsg.onMessage = (d) => {
  const at = Number(d?.at);
  if (typeof d?.title !== 'string' || d.title.length > 80 || !(at > song.at)) return;
  song = { title: d.title, at };
  dispatchEvent(new CustomEvent('orch:songbook', { detail: { title: d.title, from: 'net' } }));
};
whoMsg.onMessage = (d, { peerId }) => {
  const inst = Object.hasOwn(O.byId, d?.inst) ? d.inst : null;
  peers[peerId] = { name: String(d?.name ?? '').slice(0, 20), inst };
  if (inst && inst === me.inst && peerId < selfId) { me.inst = null; whoMsg.send(me); } // both grabbed it: lower id keeps it
  render();
};
room.onPeerJoin = (id) => {
  whoMsg.send(me, { target: id });
  for (const [inst, k] of Object.entries(known)) if (k.at) seatMsg.send({ inst, ...k }, { target: id });
  if (tempo.at) tempoMsg.send(tempo, { target: id });
  if (piece.at) pieceMsg.send(piece, { target: id });
  if (song.at) songMsg.send(song, { target: id });
  render();
};
room.onPeerLeave = (id) => { delete peers[id]; render(); };

// ---------- UI: a slim bar between the masthead and the stage ----------
document.head.append(Object.assign(document.createElement('link'), { rel: 'stylesheet', href: new URL('net.css', import.meta.url).href }));
const bar = document.createElement('section');
bar.className = 'mp';
bar.setAttribute('aria-label', 'Multiplayer');
bar.innerHTML = `
  <span class="mp-room"><i aria-hidden="true"></i><span class="mp-status">Connecting…</span></span>
  <label>Name <input class="mp-name" type="text" maxlength="20" placeholder="Your name"></label>
  <label>I play <select class="mp-inst"></select></label>
  <button type="button" class="mp-invite">Invite</button>
  <label><input class="mp-sound" type="checkbox" checked> Sound on this device</label>
  <span class="mp-tap" hidden>Tap anywhere to hear the room</span>
  <div class="mp-qr" hidden><canvas></canvas><a></a></div>`;
const stage = document.querySelector('.proscenium');
if (stage) stage.before(bar); else document.querySelector('main').prepend(bar);
const q = (s) => bar.querySelector(s);

q('.mp-name').value = me.name;
q('.mp-name').addEventListener('input', (e) => { me.name = e.target.value.slice(0, 20); store('orch-name', me.name); whoMsg.send(me); });
q('.mp-inst').addEventListener('change', (e) => {
  me.inst = e.target.value || null;
  whoMsg.send(me);
  render();
  if (me.inst) dispatchEvent(new CustomEvent('orch:select', { detail: { inst: me.inst, family: O.byId[me.inst].family, source: 'net' } }));
});
q('.mp-invite').addEventListener('click', async () => {
  const box = q('.mp-qr');
  box.hidden = !box.hidden;
  if (box.hidden) return;
  Object.assign(q('.mp-qr a'), { href: inviteUrl, textContent: inviteUrl });
  navigator.clipboard?.writeText(inviteUrl).then(() => { q('.mp-invite').textContent = 'Link copied'; }, () => {});
  const { default: QR } = await import('https://cdn.jsdelivr.net/npm/qrcode@1.5.4/+esm');
  QR.toCanvas(q('.mp-qr canvas'), inviteUrl, { width: 180, margin: 1 });
});

// mute this device only (phones in the room let the projector play): a gain between the analyser and the speakers
const out = O.ctx.createGain();
O.analyser.disconnect();
O.analyser.connect(out).connect(O.ctx.destination);
q('.mp-sound').addEventListener('change', (e) => { out.gain.value = e.target.checked ? 1 : 0; });

// remote players can start seats before this page was clicked; browsers only allow sound after a gesture
const showTap = () => { q('.mp-tap').hidden = O.ctx.state === 'running'; };
O.ctx.addEventListener('statechange', showTap);
showTap();
for (const ev of ['pointerup', 'keydown']) addEventListener(ev, () => { if (O.ctx.state !== 'running') O.ctx.resume(); }, true);

const reduce = matchMedia('(prefers-reduced-motion: reduce)');
function nudge(inst) {
  const el = document.querySelector(`.strip[data-inst="${inst}"]`);
  if (el && !reduce.matches) el.animate([{ translate: '-5px' }, { translate: '5px' }, { translate: '0' }], { duration: 220 });
}

function render() {
  const n = Object.keys(peers).length;
  q('.mp-status').textContent = n ? `Room ${roomId} · ${n + 1} here` : `Room ${roomId} · waiting for players`;
  q('.mp-room').classList.toggle('live', n > 0);
  const sel = q('.mp-inst');
  if (document.activeElement !== sel) {
    sel.replaceChildren(new Option('Just listening', ''), ...O.INSTRUMENTS.map((inst) => {
      const owner = ownerOf(inst.id), other = owner && owner !== selfId;
      const o = new Option(other ? `${inst.name} (${peers[owner].name || 'taken'})` : inst.name, inst.id, false, owner === selfId);
      o.disabled = !!other;
      return o;
    }));
  }
  document.querySelectorAll('.strip[data-inst]').forEach((el) => {
    const owner = ownerOf(el.dataset.inst), other = owner && owner !== selfId;
    el.classList.toggle('mp-mine', owner === selfId);
    el.classList.toggle('mp-taken', !!other);
    if (other) el.dataset.owner = peers[owner].name || 'Taken'; else delete el.dataset.owner;
  });
}
render();
