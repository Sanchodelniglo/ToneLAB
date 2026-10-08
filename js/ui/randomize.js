// Randomize: new values for every knob, wave and effect of the current instrument.
// Writes through the same inputs as a hand gesture (value + input/change event), so
// knobs, readouts, scope and engine follow; the instrument type stays as it is.
import { state } from '../state.js';
import { setEffect, effectHandlers } from '../audio/effects.js';
import { showCustomPreset } from '../audio/presets.js';

// Controls we never touch: loudness stays where the player set it.
const SKIP = new Set(['volume']);
// Range shaping: the raw random t in 0..1 is bent so most results stay playable.
const BEND = { attack: 3, modAttack: 3, filterAttack: 3, modulationIndex: 2, filterQ: 2, vibratoAmount: 2, spread: 2, release: 2, decay: 2, modRelease: 2, filterDecay: 2, filterRelease: 2 };
// Floors that keep the sound audible and the filter open enough.
const FLOOR = { sustain: 0.2, filterCutoff: 150 };
// Delay feedback above this runs away into a wall of noise.
const FEEDBACK_MAX = 0.65;

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
        if (SKIP.has(id) || (id === 'spread' && !anyFat)) return;
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
        else if (key === 'distortion') v = randomIn(parseFloat(slider.min), max, parseFloat(slider.step), 3); // mostly clean
        else v = randomIn(parseFloat(slider.min), max, parseFloat(slider.step), key.endsWith('Mix') || key === 'reverb' ? 1.5 : 1);
        setEffect(key, v);
    }
}

function randomize() {
    if (!state.audioInitialized) return;
    randomizeSynth();
    randomizeEffects();
    showCustomPreset('Random');
}

document.querySelectorAll('[data-randomize]').forEach(btn => btn.addEventListener('click', () => {
    randomize();
    btn.blur(); // keep the computer keyboard playing notes
}));

export { randomize };
