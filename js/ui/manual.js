// Manual (Settings → Manual): a native dialog like Credits, Esc and the focus trap come with it.
// The key map is drawn on every open, so it shows the layout and note names chosen right now.
import { state, keyboardLayouts, getDisplayLabel } from '../state.js';

const NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

const manual = document.getElementById('manualDialog');
const body = manual.querySelector('.manual-body');
const toc = manual.querySelector('.manual-toc');
const links = [...toc.querySelectorAll('a')];

function drawKeyMap() {
    let white = 0;
    manual.querySelector('.m-piano').innerHTML = keyboardLayouts[state.userLayout].map((ch, i) => {
        const note = NOTES[i % 12];
        const black = note.includes('#');
        // A black key sits on the line between the white key before it and the next one
        const pos = black ? ` style="left: ${(white * 100 / 12).toFixed(3)}%"` : '';
        if (!black) white++;
        return `<span class="m-key${black ? ' black' : ''}"${pos}><b>${ch.toUpperCase()}</b>${getDisplayLabel(note)}</span>`;
    }).join('');
    manual.querySelector('[data-manual-layout]').textContent =
        document.getElementById('keyboardLayout').selectedOptions[0]?.text || state.userLayout;
}

document.querySelectorAll('[data-manual-open]').forEach(btn => btn.addEventListener('click', () => {
    drawKeyMap();
    manual.showModal();
}));
manual.querySelector('[data-dialog-close]').addEventListener('click', () => manual.close());
manual.addEventListener('click', (e) => { if (e.target === manual) manual.close(); }); // the backdrop

// Contents: scroll the chapter into view without writing a #hash into the address
links.forEach(a => a.addEventListener('click', (e) => {
    e.preventDefault();
    manual.querySelector(a.hash).scrollIntoView({ block: 'start' });
}));

// The chapter at the top of the page lights its line in the contents (and, on the phone strip,
// slides that line into view)
const spy = new IntersectionObserver((entries) => {
    const hit = entries.find(en => en.isIntersecting);
    if (!hit) return;
    const a = links.find(l => l.hash === '#' + hit.target.id);
    links.forEach(l => (l === a ? l.setAttribute('aria-current', 'location') : l.removeAttribute('aria-current')));
    if (toc.scrollWidth > toc.clientWidth) toc.scrollLeft = a.offsetLeft - (toc.clientWidth - a.offsetWidth) / 2;
}, { root: body, rootMargin: '-48px 0px -70% 0px' }); // top: under the pinned phone strip
manual.querySelectorAll('.m-chapter').forEach(ch => spy.observe(ch));
