// Arpeggiator: held notes become a running pattern on the shared Tone.Transport.
// Rhythm comes from 16 tappable step lights (mute / accent / length), pitches
// from the notes that are held or latched. keyboard.js feeds state.heldNotes
// and, while the arp is on, never triggers the synth itself.

import { state } from '../state.js';
import { triggerArpStep, releaseAllVoices } from '../audio/synth.js';
import { updateSliderFill } from './knobs.js';

const STORE_KEY = 'arp';
const STEP_COUNT = 16;
const RATES = { '4n': '1/4', '8n': '1/8', '16n': '1/16', '8t': '1/8T' };
const MODES = { up: '↗ Up', down: '↘ Down', updown: '⋀ Up-down', random: '⁂ Random', asplayed: '≡ As played' };

const defaults = {
    on: false,
    mode: 'up',
    rate: '16n',
    bpm: 120,
    octaves: 1,
    gate: 0.6,      // fraction of the step
    swing: 0,       // 0..1
    length: 16,
    steps: Array.from({ length: STEP_COUNT }, () => ({ on: true, accent: false }))
};

let loop = null;
let stepCounter = 0;
let patternIndex = 0;
let runningStep = -1;
let liveNote = null;
let tapTimes = [];
let ui = {};

const $ = (sel) => document.querySelector(sel);

/* ---------- state ---------- */

function load() {
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem(STORE_KEY) || 'null'); } catch (_) { /* ignore */ }
    state.arp = { ...defaults, ...(saved || {}), on: false };
    if (!Array.isArray(state.arp.steps) || state.arp.steps.length !== STEP_COUNT) state.arp.steps = defaults.steps.map(s => ({ ...s }));
}

function save() {
    const { on, ...rest } = state.arp;
    try { localStorage.setItem(STORE_KEY, JSON.stringify(rest)); } catch (_) { /* private mode */ }
}

/* ---------- notes ---------- */

function midi(note) { return Tone.Frequency(note).toMidi(); }
function transpose(note, semis) { return Tone.Frequency(note).transpose(semis).toNote(); }

// Latched notes (HOLD) plus keys physically down right now
function heldNotes() {
    const set = new Set([...state.heldNotes, ...state.arpDown]);
    return Array.from(set);
}

function pattern() {
    const held = heldNotes();
    if (!held.length) return [];
    const base = state.arp.mode === 'asplayed' ? held : [...held].sort((a, b) => midi(a) - midi(b));
    let notes = [];
    for (let o = 0; o < state.arp.octaves; o++) notes = notes.concat(base.map(n => o ? transpose(n, 12 * o) : n));
    switch (state.arp.mode) {
        case 'down': return notes.reverse();
        case 'updown': return notes.length > 2 ? notes.concat(notes.slice(1, -1).reverse()) : notes;
        default: return notes;
    }
}

/* ---------- engine ---------- */

function stepSeconds() {
    return Tone.Time(state.arp.rate).toSeconds();
}

function tick(time) {
    const a = state.arp;
    const step = stepCounter % a.length;
    stepCounter++;
    const notes = pattern();
    const cfg = a.steps[step];
    let note = null;
    if (notes.length && cfg.on) {
        note = a.mode === 'random' ? notes[Math.floor(Math.random() * notes.length)] : notes[patternIndex % notes.length];
    }
    if (notes.length && cfg.on) patternIndex++;
    if (note) {
        const dur = Math.max(0.02, stepSeconds() * (cfg.accent ? Math.min(1, a.gate + 0.25) : a.gate));
        triggerArpStep(note, dur, time, cfg.accent ? 1 : 0.75);
    }
    Tone.Draw.schedule(() => paint(step, note), time);
}

function start() {
    if (loop) return;
    Tone.Transport.bpm.value = state.arp.bpm;
    Tone.Transport.swing = state.arp.swing;
    Tone.Transport.swingSubdivision = state.arp.rate === '4n' ? '8n' : state.arp.rate;
    stepCounter = 0;
    patternIndex = 0;
    loop = new Tone.Loop(tick, state.arp.rate);
    // Start on the next beat so the pattern lands on the grid, not mid-bar
    loop.start(Tone.Transport.state === 'started' ? '@4n' : 0);
    if (Tone.Transport.state !== 'started') Tone.Transport.start();
}

function stop() {
    if (loop) { loop.stop(); loop.dispose(); loop = null; }
    Tone.Transport.stop();
    Tone.Transport.position = 0;
    releaseAllVoices();
    paint(-1, null);
}

function setRate(rate) {
    state.arp.rate = rate;
    if (loop) { loop.interval = rate; Tone.Transport.swingSubdivision = rate === '4n' ? '8n' : rate; }
    save();
}

function setArp(on) {
    on = Boolean(on);
    if (state.arp.on === on) return;
    state.arp.on = on;
    ui.btn?.setAttribute('aria-pressed', String(on));
    ui.btn?.classList.toggle('active', on);
    if (ui.strip) ui.strip.hidden = !on;
    document.body.classList.toggle('arp-on', on);
    document.dispatchEvent(new CustomEvent('arp-change', { detail: { on } }));
    if (on) {
        releaseAllVoices();   // keys already down stop sounding by themselves; the arp takes over
        start();
    } else {
        state.arpDown.clear();
        document.querySelectorAll('.key.pressed').forEach(k => { if (!state.heldNotes.has(k.dataset.note)) k.classList.remove('pressed'); });
        stop();
    }
}

/* ---------- paint ---------- */

function paint(step, note) {
    if (runningStep >= 0 && ui.steps) ui.steps[runningStep]?.classList.remove('running');
    runningStep = step;
    if (step >= 0 && ui.steps) ui.steps[step]?.classList.add('running');
    if (liveNote) document.querySelectorAll(`.key[data-note="${liveNote}"]`).forEach(k => k.classList.remove('arp-playing'));
    liveNote = note;
    if (note) document.querySelectorAll(`.key[data-note="${note}"]`).forEach(k => k.classList.add('arp-playing'));
}

function paintChips() {
    const a = state.arp;
    document.querySelectorAll('[data-arp-cycle]').forEach(chip => {
        const what = chip.dataset.arpCycle;
        chip.textContent = what === 'mode' ? MODES[a.mode] : what === 'rate' ? RATES[a.rate] : String(Math.round(a.bpm));
    });
}

function paintSteps() {
    const a = state.arp;
    ui.steps.forEach((el, i) => {
        el.classList.toggle('off', !a.steps[i].on);
        el.classList.toggle('accent', a.steps[i].accent);
        el.classList.toggle('beyond', i >= a.length);
        el.setAttribute('aria-pressed', String(a.steps[i].on));
    });
    ui.lengthBtns.forEach(b => b.classList.toggle('active', Number(b.dataset.length) === a.length));
}

/* ---------- UI ---------- */

function fillSelect(select, map, current) {
    select.innerHTML = '';
    Object.entries(map).forEach(([value, label]) => {
        const opt = document.createElement('option');
        opt.value = value; opt.textContent = label;
        select.appendChild(opt);
    });
    select.value = current;
}

function bindKnob(input, readout, key, fmt, apply) {
    input.value = state.arp[key];
    readout.textContent = fmt(state.arp[key]);
    updateSliderFill(input);
    input.addEventListener('input', () => {
        const v = parseFloat(input.value);
        state.arp[key] = v;
        readout.textContent = fmt(v);
        updateSliderFill(input);
        apply?.(v);
        save();
    });
}

export function initArp() {
    load();
    ui = {
        btn: $('#arpBtn'),
        strip: $('#arpStrip'),
        mode: $('#arpMode'),
        rate: $('#arpRate'),
        octBtns: [...document.querySelectorAll('[data-arp-oct]')],
        lengthBtns: [...document.querySelectorAll('[data-length]')],
        steps: [...document.querySelectorAll('.arp-step')],
        bpm: $('#arpBpm'), bpmOut: $('#arpBpmValue'),
        gate: $('#arpGate'), gateOut: $('#arpGateValue'),
        swing: $('#arpSwing'), swingOut: $('#arpSwingValue'),
        tap: $('#arpTap')
    };
    if (!ui.btn || !ui.strip) return;

    fillSelect(ui.mode, MODES, state.arp.mode);
    fillSelect(ui.rate, RATES, state.arp.rate);
    ui.mode.addEventListener('change', () => { state.arp.mode = ui.mode.value; patternIndex = 0; save(); ui.mode.blur(); paintChips(); });
    ui.rate.addEventListener('change', () => { setRate(ui.rate.value); ui.rate.blur(); paintChips(); });

    // Quick chips next to the lights: tap cycles mode / rate, BPM +5 (long press -5)
    const cycle = (map, current, dir = 1) => { const keys = Object.keys(map); return keys[(keys.indexOf(current) + dir + keys.length) % keys.length]; };
    document.querySelectorAll('[data-arp-cycle]').forEach(chip => {
        const what = chip.dataset.arpCycle;
        let pressTimer = null; let longPressed = false;
        chip.addEventListener('pointerdown', () => {
            if (what !== 'bpm') return;
            longPressed = false;
            pressTimer = setTimeout(() => { longPressed = true; nudgeBpm(-5); }, 450);
        });
        const clearPress = () => { clearTimeout(pressTimer); pressTimer = null; };
        chip.addEventListener('pointerup', clearPress);
        chip.addEventListener('pointercancel', clearPress);
        chip.addEventListener('pointerleave', clearPress);
        chip.addEventListener('click', () => {
            if (what === 'mode') { ui.mode.value = cycle(MODES, state.arp.mode); ui.mode.dispatchEvent(new Event('change')); }
            else if (what === 'rate') { ui.rate.value = cycle(RATES, state.arp.rate); ui.rate.dispatchEvent(new Event('change')); }
            else if (!longPressed) nudgeBpm(5);
            chip.blur();
        });
    });
    function nudgeBpm(delta) {
        ui.bpm.value = Math.max(Number(ui.bpm.min), Math.min(Number(ui.bpm.max), Number(ui.bpm.value) + delta));
        ui.bpm.dispatchEvent(new Event('input', { bubbles: true }));
    }
    ui.bpm.addEventListener('input', paintChips);
    paintChips();

    ui.octBtns.forEach(b => b.addEventListener('click', () => {
        state.arp.octaves = Number(b.dataset.arpOct);
        ui.octBtns.forEach(x => x.classList.toggle('active', x === b));
        save(); b.blur();
    }));
    ui.octBtns.forEach(x => x.classList.toggle('active', Number(x.dataset.arpOct) === state.arp.octaves));

    ui.lengthBtns.forEach(b => b.addEventListener('click', () => { state.arp.length = Number(b.dataset.length); paintSteps(); save(); b.blur(); }));

    // Step lights: tap = mute, double tap = accent
    ui.steps.forEach((el, i) => {
        let lastTap = 0;
        el.addEventListener('click', () => {
            const now = performance.now();
            const s = state.arp.steps[i];
            if (now - lastTap < 300) {
                s.accent = !s.accent;
                if (s.accent) s.on = true;
            } else {
                s.on = !s.on;
                if (!s.on) s.accent = false;
            }
            lastTap = now;
            paintSteps(); save();
        });
    });
    paintSteps();

    bindKnob(ui.bpm, ui.bpmOut, 'bpm', v => `${Math.round(v)}`, v => { Tone.Transport.bpm.rampTo(v, 0.1); });
    // Touch steppers mirror the knobs (− / + nudge, hold to repeat); the knob
    // stays the source of truth so desktop and mobile share one value
    function stepper(input, minus, plus, readout, step, fmt) {
        const sync = () => { readout.textContent = fmt(Number(input.value)); };
        input.addEventListener('input', sync);
        sync();
        [[minus, -1], [plus, 1]].forEach(([btn, dir]) => {
            let timer = null;
            const nudge = () => {
                const v = Number(input.value) + dir * step;
                input.value = Math.max(Number(input.min), Math.min(Number(input.max), Math.round(v * 1000) / 1000));
                input.dispatchEvent(new Event('input', { bubbles: true }));
            };
            btn.addEventListener('pointerdown', (e) => { e.preventDefault(); nudge(); timer = setTimeout(function rep() { nudge(); timer = setTimeout(rep, 60); }, 400); });
            const end = () => { clearTimeout(timer); timer = null; };
            btn.addEventListener('pointerup', end);
            btn.addEventListener('pointercancel', end);
            btn.addEventListener('pointerleave', end);
        });
    }
    stepper(ui.bpm, $('[data-bpm-step="-1"]'), $('[data-bpm-step="1"]'), $('#arpBpmReadout'), 1, v => String(Math.round(v)));
    document.querySelectorAll('.arp-touch-stepper').forEach(group => {
        const input = document.getElementById(group.dataset.for);
        stepper(input, group.querySelector('[data-dir="-1"]'), group.querySelector('[data-dir="1"]'), group.querySelector('[data-readout]'), Number(group.dataset.step), v => `${Math.round(v * 100)}%`);
    });
    bindKnob(ui.gate, ui.gateOut, 'gate', v => `${Math.round(v * 100)}%`);
    bindKnob(ui.swing, ui.swingOut, 'swing', v => `${Math.round(v * 100)}%`, v => { Tone.Transport.swing = v; });

    // Tap tempo: four taps on the beat
    ui.tap?.addEventListener('click', () => {
        const now = performance.now();
        tapTimes = tapTimes.filter(t => now - t < 2500);
        tapTimes.push(now);
        if (tapTimes.length >= 2) {
            const gaps = tapTimes.slice(1).map((t, i) => t - tapTimes[i]);
            const bpm = Math.round(60000 / (gaps.reduce((a, b) => a + b, 0) / gaps.length));
            const clamped = Math.max(ui.bpm.min, Math.min(ui.bpm.max, bpm));
            ui.bpm.value = clamped;
            ui.bpm.dispatchEvent(new Event('input', { bubbles: true }));
        }
        ui.tap.blur();
    });

    ui.btn.addEventListener('click', () => { setArp(!state.arp.on); ui.btn.blur(); });

}

export { setArp };
