// Tiny waveform preview drawn under every wave-type select. Pure math, no
// audio: periodic shapes use Tone's own Fourier coefficients so "square4"
// really shows a 4-partial square, noise types use a seeded jitter line.

const TWO_PI = Math.PI * 2;

// Fourier sine coefficient b_k for the basic shapes, as Tone.Oscillator builds them.
function coefficient(base, k) {
    switch (base) {
        case 'sine':
            return k === 1 ? 1 : 0;
        case 'square':
            return k % 2 === 1 ? 2 / (k * Math.PI) : 0;
        case 'triangle':
            return k % 2 === 1 ? (8 / Math.pow(k * Math.PI, 2)) * (((k - 1) / 2) % 2 === 0 ? 1 : -1) : 0;
        case 'sawtooth':
            return (k % 2 === 1 ? 1 : -1) * (2 / (k * Math.PI));
        default:
            return 0;
    }
}

// Exact shapes for the unlimited-partial types, t in [0, 1)
function exact(base, t) {
    switch (base) {
        case 'sine': return Math.sin(TWO_PI * t);
        case 'square': return t < 0.5 ? 1 : -1;
        case 'triangle': return t < 0.25 ? 4 * t : t < 0.75 ? 2 - 4 * t : 4 * t - 4;
        case 'sawtooth': return t < 0.5 ? 2 * t : 2 * t - 2;
        case 'pulse': return t < 0.2 ? 1 : -1;   // Tone.PulseOscillator default width
        case 'pwm': return t < 0.35 ? 1 : -1;    // snapshot of a modulated width
        default: return 0;
    }
}

// Deterministic PRNG so a noise preview does not change on every redraw
function mulberry32(seed) {
    return () => {
        seed |= 0; seed = seed + 0x6D2B79F5 | 0;
        let x = Math.imul(seed ^ seed >>> 15, 1 | seed);
        x = x + Math.imul(x ^ x >>> 7, 61 | x) ^ x;
        return ((x ^ x >>> 14) >>> 0) / 4294967296;
    };
}

function noiseSamples(type, count) {
    const rnd = mulberry32(type === 'white' ? 7 : type === 'pink' ? 11 : 13);
    const out = new Array(count);
    if (type === 'brown') {
        let v = 0;
        for (let i = 0; i < count; i++) { v += (rnd() * 2 - 1) * 0.35; v = Math.max(-1, Math.min(1, v)); out[i] = v; }
    } else if (type === 'pink') {
        let a = 0, b = 0;
        for (let i = 0; i < count; i++) { const w = rnd() * 2 - 1; a = 0.6 * a + 0.4 * w; b = 0.85 * b + 0.15 * w; out[i] = a * 0.6 + b * 0.8; }
    } else {
        for (let i = 0; i < count; i++) out[i] = rnd() * 2 - 1;
    }
    return out;
}

// Fat waves: three copies detuned (exaggerated so the drift shows within 2 periods)
const FAT_DETUNE = [0.92, 1, 1.08];

function periodicSamples(type, count, periods) {
    if (type.startsWith('fat')) {
        const base = type.slice(3);
        const out = new Array(count);
        for (let i = 0; i < count; i++) {
            const t = (i / count) * periods;
            out[i] = FAT_DETUNE.reduce((v, f) => v + exact(base, (t * f) % 1), 0) / FAT_DETUNE.length;
        }
        return out;
    }
    const m = type.match(/^(sine|square|triangle|sawtooth)(\d+)$/);
    const base = m ? m[1] : type;
    const partials = m ? parseInt(m[2], 10) : 0;
    const out = new Array(count);
    for (let i = 0; i < count; i++) {
        const t = (i / count) * periods;
        if (partials > 0) {
            let v = 0;
            for (let k = 1; k <= partials; k++) v += coefficient(base, k) * Math.sin(TWO_PI * k * t);
            out[i] = v;
        } else {
            out[i] = exact(base, t % 1);
        }
    }
    return out;
}

// SVG path "d" for the given type, fitted into w×h with a small margin.
export function wavePath(type, w = 64, h = 20, count = 96) {
    const isNoise = ['white', 'pink', 'brown'].includes(type);
    const samples = isNoise ? noiseSamples(type, count) : periodicSamples(type, count, 2);
    let peak = 0;
    for (const v of samples) peak = Math.max(peak, Math.abs(v));
    const scale = peak > 0 ? (h / 2 - 1.5) / peak : 0;
    const mid = h / 2;
    let d = '';
    for (let i = 0; i < count; i++) {
        const x = (i / (count - 1)) * w;
        const y = mid - samples[i] * scale;
        d += (i === 0 ? 'M' : 'L') + x.toFixed(1) + ' ' + y.toFixed(1);
    }
    return d;
}

// Human label: number = how many harmonics the wave actually contains.
// Tone's "square5" keeps partials 1..5 but square only has odd ones (1, 3, 5)
// → "square 3". Sawtooth has every partial → "sawtooth 5". Base types unchanged.
export function waveLabel(type) {
    if (type.startsWith('fat')) return `fat ${type.slice(3)}`;
    const m = type.match(/^(sine|square|triangle|sawtooth)(\d+)$/);
    if (!m) return type;
    const base = m[1];
    const n = parseInt(m[2], 10);
    if (base === 'sine') return 'sine';
    const count = base === 'sawtooth' ? n : Math.ceil(n / 2);
    return `${base} ${count}`;
}

function previewSVG(type) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'wave-preview');
    svg.setAttribute('viewBox', '0 0 64 20');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', wavePath(type));
    svg.appendChild(path);
    return svg;
}

/* ---- Wave picker: a dropdown that shows the shape next to each name ----
   The native <select> stays in the DOM (hidden) as the source of truth, so
   presets, the engine and the change listener keep working untouched. */

const pickers = new Map(); // select element → picker parts

export function buildWavePicker(select, labelId) {
    // The control grid is rebuilt on every synth switch: drop pickers whose select is gone
    pickers.forEach((_, sel) => { if (!sel.isConnected) pickers.delete(sel); });

    const wrap = document.createElement('div');
    wrap.className = 'wave-picker';

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'wave-picker-btn';
    btn.setAttribute('aria-haspopup', 'listbox');
    btn.setAttribute('aria-expanded', 'false');
    if (labelId) btn.setAttribute('aria-labelledby', `${labelId} ${select.id}Name`);
    btn.appendChild(previewSVG(select.value));
    const name = document.createElement('span');
    name.className = 'wave-picker-name';
    name.id = `${select.id}Name`;
    name.textContent = waveLabel(select.value);
    btn.appendChild(name);

    const list = document.createElement('ul');
    list.className = 'wave-picker-list';
    list.setAttribute('role', 'listbox');
    list.setAttribute('tabindex', '-1');
    list.hidden = true;
    const options = [...select.options].map(opt => {
        const li = document.createElement('li');
        li.className = 'wave-picker-option';
        li.setAttribute('role', 'option');
        li.setAttribute('tabindex', '-1');
        li.dataset.value = opt.value;
        li.setAttribute('aria-selected', String(opt.value === select.value));
        li.appendChild(previewSVG(opt.value));
        const span = document.createElement('span');
        span.textContent = waveLabel(opt.value);
        li.appendChild(span);
        list.appendChild(li);
        return li;
    });

    wrap.appendChild(btn);
    wrap.appendChild(list);
    select.insertAdjacentElement('afterend', wrap);
    select.hidden = true;

    const parts = { wrap, btn, list, options, name };
    pickers.set(select, parts);

    // Keyboard users get focus back on the button; pointer users get it released
    // so the computer keyboard goes straight back to playing notes.
    const choose = (value, viaKeyboard) => {
        if (select.value !== value) {
            select.value = value;
            select.dispatchEvent(new Event('change', { bubbles: true }));
        }
        refreshWavePreview(select);
        close(parts, viaKeyboard);
        if (!viaKeyboard) btn.blur();
    };

    btn.addEventListener('click', () => (list.hidden ? open(parts, select) : close(parts, true)));
    btn.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); open(parts, select); }
    });
    list.addEventListener('click', (e) => {
        const li = e.target.closest('.wave-picker-option');
        if (li) choose(li.dataset.value, false);
    });
    list.addEventListener('keydown', (e) => {
        const current = options.indexOf(document.activeElement);
        const move = (idx) => options[Math.max(0, Math.min(options.length - 1, idx))].focus();
        switch (e.key) {
            case 'ArrowDown': case 'ArrowRight': e.preventDefault(); move(current + 1); break;
            case 'ArrowUp': case 'ArrowLeft': e.preventDefault(); move(current - 1); break;
            case 'Home': e.preventDefault(); move(0); break;
            case 'End': e.preventDefault(); move(options.length - 1); break;
            case 'Enter': case ' ': e.preventDefault(); if (current >= 0) choose(options[current].dataset.value, true); break;
            case 'Escape': e.preventDefault(); close(parts, true); break;
            case 'Tab': close(parts, false); break;
        }
    });
    return wrap;
}

function open(parts, select) {
    // Only one picker open at a time
    pickers.forEach(p => { if (p !== parts) close(p, false); });
    // The panels carry backdrop-filter, which makes them the containing block
    // of fixed descendants: viewport coordinates would land offset. The list
    // lives on <body> while open and goes back into its wrapper on close.
    document.body.appendChild(parts.list);
    parts.list.hidden = false;
    parts.btn.setAttribute('aria-expanded', 'true');
    parts.openedAt = performance.now();
    place(parts);
    const selected = parts.options.find(li => li.dataset.value === select.value) || parts.options[0];
    selected.focus();
    selected.scrollIntoView({ block: 'nearest' });
}

// The list is position: fixed so a scrolling control column (layout ≥1024)
// cannot clip it. Anchor it to the button, flip above when the viewport
// bottom is too close, clamp to the viewport sides.
const LIST_GAP = 4;
const LIST_MIN_WIDTH = 310;
const VIEW_MARGIN = 8;
function place(parts) {
    const { list, btn } = parts;
    const anchor = btn.getBoundingClientRect();
    const width = Math.min(Math.max(anchor.width, LIST_MIN_WIDTH), window.innerWidth - VIEW_MARGIN * 2);
    list.style.width = `${width}px`;
    list.style.left = `${Math.max(VIEW_MARGIN, Math.min(anchor.left, window.innerWidth - width - VIEW_MARGIN))}px`;
    const height = list.offsetHeight;
    const below = anchor.bottom + LIST_GAP;
    const fitsBelow = below + height <= window.innerHeight - VIEW_MARGIN;
    const top = fitsBelow ? below : Math.max(VIEW_MARGIN, anchor.top - LIST_GAP - height);
    list.style.top = `${top}px`;
}

function close(parts, focusButton) {
    if (parts.list.hidden) return;
    parts.list.hidden = true;
    parts.btn.setAttribute('aria-expanded', 'false');
    parts.list.style.cssText = '';
    parts.wrap.appendChild(parts.list);
    if (focusButton) parts.btn.focus();
}

// A fixed popup would detach from its button when the page or the control
// column scrolls, or on resize: close instead of chasing it.
function closeAll() {
    pickers.forEach(parts => close(parts, false));
}
const SCROLL_GRACE_MS = 100; // a scroll queued before the click must not close it
document.addEventListener('scroll', (e) => {
    pickers.forEach(parts => {
        if (parts.list.hidden || parts.list.contains(e.target)) return;
        if (performance.now() - parts.openedAt < SCROLL_GRACE_MS) return;
        close(parts, false);
    });
}, true);
window.addEventListener('resize', closeAll);

// Click outside closes any open picker
document.addEventListener('pointerdown', (e) => {
    pickers.forEach(parts => {
        if (!parts.list.hidden && !parts.wrap.contains(e.target) && !parts.list.contains(e.target)) close(parts, false);
    });
});

// Sync the picker to the select's current value (after a change or a preset)
export function refreshWavePreview(select) {
    const parts = pickers.get(select);
    if (!parts) return;
    parts.btn.querySelector('.wave-preview path').setAttribute('d', wavePath(select.value));
    parts.name.textContent = waveLabel(select.value);
    parts.options.forEach(li => li.setAttribute('aria-selected', String(li.dataset.value === select.value)));
}
