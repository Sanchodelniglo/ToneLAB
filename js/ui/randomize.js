// Randomize: new values for every knob, wave and effect of the current instrument.
// Writes through the same inputs as a hand gesture (value + input/change event), so
// knobs, readouts, scope and engine follow; the instrument type stays as it is.
import { state } from '../state.js';
import { setEffect, effectHandlers, EFFECT_DEFAULTS } from '../audio/effects.js';
import { showCustomPreset } from '../audio/presets.js';

// Range shaping: the raw random t in 0..1 is bent so most results stay playable.
const BEND = { attack: 3, modAttack: 3, filterAttack: 3, modulationIndex: 2, filterQ: 2, spread: 2, release: 2, decay: 2, modRelease: 2, filterDecay: 2, filterRelease: 2 };
// Floors that keep the sound audible and the filter open enough.
const FLOOR = { sustain: 0.2, filterCutoff: 150 };
// Delay feedback above this runs away into a wall of noise.
const FEEDBACK_MAX = 0.65;
// Special effects: most rolls leave them off, so a random sound is not always wobbling or crushed.
const MOSTLY_OFF = new Set(['phaserMix', 'tremoloDepth', 'crushBits']);

const pick = (list) => list[Math.floor(Math.random() * list.length)];

function randomIn(min, max, step, bend = 1, log = false) {
    const t = Math.pow(Math.random(), bend);
    let v = log ? min * Math.pow(max / min, t) : min + (max - min) * t;
    if (step > 0) {
        v = min + Math.round((v - min) / step) * step;
        v = Number(v.toFixed(Math.max(0, (String(step).split('.')[1] || '').length)));
    }
    return Math.min(max, Math.max(min, v));
}

function randomSlider(slider, id) {
    const min = parseFloat(slider.min), max = parseFloat(slider.max), step = parseFloat(slider.step);
    const lo = Math.max(min, FLOOR[id] ?? min);
    const log = lo > 0 && max / lo >= 20; // frequency-like ranges sweep evenly in pitch
    return randomIn(lo, max, step, BEND[id] || 1, log);
}

function randomizeSynth() {
    const controls = [...document.querySelectorAll('#controls [data-control]')];
    // Waves first: Spread only means something on a fat wave, so it waits for the result.
    controls.filter(el => el.tagName === 'SELECT').forEach(el => {
        el.value = pick([...el.options]).value;
        el.dispatchEvent(new Event('change', { bubbles: true }));
    });
    const anyFat = controls.some(el => el.tagName === 'SELECT' && el.value.startsWith('fat'));
    controls.filter(el => el.type === 'range').forEach(el => {
        const id = el.dataset.control;
        if (id === 'spread' && !anyFat) return;
        el.value = randomSlider(el, id);
        el.dispatchEvent(new Event('input', { bubbles: true }));
    });
}

function randomizeEffects() {
    for (const key of Object.keys(effectHandlers)) {
        const slider = document.getElementById(key);
        if (!slider) continue;
        const max = key === 'delayFeedback' ? Math.min(FEEDBACK_MAX, parseFloat(slider.max)) : parseFloat(slider.max);
        let v;
        if (key === 'filterFreq') v = randomIn(800, max, parseFloat(slider.step), 1, true); // never a muffled mess
        else if (MOSTLY_OFF.has(key) && Math.random() < 0.6) v = EFFECT_DEFAULTS[key];
        else if (key === 'crushBits') v = randomIn(3, 8, 1); // 2 bits is just noise, 9+ is clean
        else if (key === 'crushMix') v = randomIn(0.5, max, parseFloat(slider.step)); // a crush you can hear
        else if (key === 'distortion') v = randomIn(parseFloat(slider.min), max, parseFloat(slider.step), 3); // mostly clean
        else v = randomIn(parseFloat(slider.min), max, parseFloat(slider.step), key.endsWith('Mix') || key === 'reverb' ? 1.5 : 1);
        setEffect(key, v);
    }
}

// Init: the plainest sound that still plays. Every knob back to its own default (all audible),
// envelopes become a gate (on while the key is down), every effect knob at its minimum, except
// Tone (open, no distortion) and Crusher (clean), which would mute or crush it; Out is not an effect knob.
const KEEP = { filterFreq: 10000, distortion: 0, crushBits: 10, crushMix: 1 };
// Gate envelope: A 0, D 0, S full, R 0, only where a Sustain knob exists (MetalSynth has none:
// A 0 + D 0 there would be silence, so it keeps its defaults). The Mod Envelope has a fixed full
// sustain and only A and R knobs: both go to 0.
const GATES = [['attack', 'decay', 'sustain', 'release'], ['filterAttack', 'filterDecay', 'filterSustain', 'filterRelease']];
const MOD_GATE = { modAttack: 0, modRelease: 0 };

function initSound() {
    if (!state.audioInitialized) return;
    state.autoInput = true; // not the player's hand: Learn goals ignore these events
    try {
        const controls = [...document.querySelectorAll('#controls [data-control]')];
        controls.filter(el => el.tagName === 'SELECT').forEach(el => {
            el.value = [...el.options].find(o => o.defaultSelected)?.value ?? el.value;
            el.dispatchEvent(new Event('change', { bubbles: true }));
        });
        const gate = { ...MOD_GATE }; // knobs the instrument does not have are never looked up
        GATES.forEach(([a, d, s, r]) => {
            if (controls.some(el => el.dataset.control === s)) Object.assign(gate, { [a]: 0, [d]: 0, [s]: 1, [r]: 0 });
        });
        controls.filter(el => el.type === 'range').forEach(el => {
            el.value = gate[el.dataset.control] ?? el.dataset.defaultValue;
            el.dispatchEvent(new Event('input', { bubbles: true }));
        });
        for (const key of Object.keys(effectHandlers)) setEffect(key, KEEP[key] ?? parseFloat(document.getElementById(key).min));
    } finally {
        state.autoInput = false;
    }
    showCustomPreset('Init');
}

function randomize() {
    if (!state.audioInitialized) return;
    state.autoInput = true; // not the player's hand: Learn goals ignore these events
    try {
        randomizeSynth();
        randomizeEffects();
    } finally {
        state.autoInput = false;
    }
    showCustomPreset('Random');
}

document.querySelectorAll('[data-init]').forEach(btn => btn.addEventListener('click', () => {
    initSound();
    btn.blur(); // keep the computer keyboard playing notes
}));

document.querySelectorAll('[data-randomize]').forEach(btn => btn.addEventListener('click', () => {
    randomize();
    btn.blur(); // keep the computer keyboard playing notes
}));

export { randomize };
