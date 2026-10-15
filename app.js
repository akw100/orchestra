import * as O from './audio.js';

const $ = (s, el = document) => el.querySelector(s);
const sections = $('#sections');

function render() {
  sections.innerHTML = '';
  for (const inst of O.INSTRUMENTS) {
    const card = document.createElement('section');
    card.className = 'card'; card.style.setProperty('--hue', inst.hue);
    const list = O.seats.filter((s) => s.inst === inst.id);
    card.innerHTML = `
      <header><h2>${inst.name}</h2><span class="fam">${inst.family}</span>
        <span class="count"><button data-a="rm" title="Remove a player">−</button>${list.length}<button data-a="add" title="Add a player">+</button></span></header>
      <div class="seats">${list.map((s) => `
        <div class="seat ${s.active ? 'on' : ''}" data-seat="${s.id}">
          <button class="disc" data-a="toggle" title="Play / stop">${s.k + 1}</button>
          <button class="loop ${s.loop ? 'is' : ''}" data-a="loop" title="${s.loop ? 'Looping' : 'Plays once'}">${s.loop ? '↻' : '1×'}</button>
        </div>`).join('')}</div>
      <div class="modes">
        <button data-a="all">All</button><button data-a="most">Most</button>
        <button data-a="allbutone">All but one</button><button data-a="solo">Solo</button><button data-a="none">None</button>
      </div>`;
    card.addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      const seat = O.seats.find((s) => s.id === +b.closest('.seat')?.dataset.seat);
      const a = b.dataset.a;
      if (a === 'toggle') O.toggle(seat);
      else if (a === 'loop') O.setLoop(seat, !seat.loop);
      else if (a === 'add') O.addSeat(inst.id);
      else if (a === 'rm') O.removeSeat(inst.id);
      else O.section(inst.id, a);
    });
    sections.append(card);
  }
}
window.addEventListener('orch:change', render);
window.addEventListener('orch:note', (e) => {
  const el = $(`[data-seat="${e.detail.seat}"] .disc`); if (!el) return;
  el.classList.remove('hit'); void el.offsetWidth; el.classList.add('hit');
});
window.addEventListener('orch:beat', (e) => { $('#beat').textContent = `bar ${e.detail.bar + 1} · beat ${(e.detail.beat % 4) + 1}`; });

$('#tutti').onclick = O.tutti;
$('#stop').onclick = O.stopAll;
$('#bpm').oninput = (e) => { O.setBpm(+e.target.value); $('#bpmv').textContent = e.target.value; };
render();
