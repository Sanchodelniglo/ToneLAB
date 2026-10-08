// Instrument control panel: help hints, knob/slider style toggle, per-synth control
// rendering (updateControls) and the instrument selector.
import { initSynth, updateSynthParameter } from '../audio/synth.js';
import { synthDescriptions, updatePresetBar } from '../audio/presets.js';
import { updateSliderFill, attachKnobToSlider } from './knobs.js';
import { buildWavePicker, refreshWavePreview, waveLabel } from './wavePreview.js';

// Hints are collapsed behind a "?" button so the grid stays compact.
function helpButton(id, name, desc) {
    if (!desc) return '';
    return `<button type="button" class="help-btn" aria-label="What does ${name} do?" aria-expanded="false" aria-controls="${id}Hint">?</button>`;
}

function hintParagraph(id, desc) {
    return desc ? `<p class="control-hint" id="${id}Hint" hidden>${desc}</p>` : '';
}

// One delegated listener covers instrument knobs (rebuilt per synth) and the static effects rack.
function closeHint(btn) {
    const hint = document.getElementById(btn.getAttribute('aria-controls'));
    if (hint) { hint.hidden = true; hint.style.transform = ''; }
    btn.setAttribute('aria-expanded', 'false');
}

function closeAllHints(except) {
    document.querySelectorAll('.help-btn[aria-expanded="true"]').forEach(btn => { if (btn !== except) closeHint(btn); });
}

// Keep the popover inside the viewport: cells at the edge of a page would
// otherwise push it off screen (it is absolute inside the cell).
function fitHint(hint) {
    hint.style.transform = '';
    const r = hint.getBoundingClientRect();
    const margin = 8;
    let dx = 0;
    if (r.right > window.innerWidth - margin) dx = window.innerWidth - margin - r.right;
    if (r.left + dx < margin) dx = margin - r.left;
    if (dx) hint.style.transform = `translateX(${dx}px)`;
}

document.addEventListener('click', (e) => {
    const btn = e.target.closest('.help-btn');
    if (!btn) return;
    const hint = document.getElementById(btn.getAttribute('aria-controls'));
    if (!hint) return;
    if (btn.getAttribute('aria-expanded') === 'true') { closeHint(btn); return; }
    closeAllHints(btn); // one at a time
    // Header popovers (instrument / preset ?) hang under their own button,
    // not under the start of the row; the mobile scope strip one spans the strip
    hint.hidden = false; // offsetParent is null while hidden
    if (hint.classList.contains('type-hint') && !btn.closest('.scope-preset') && btn.offsetParent === hint.offsetParent) {
        hint.style.left = `${btn.offsetLeft}px`;
    }
    btn.setAttribute('aria-expanded', 'true');
    fitHint(hint);
});

// Tap anywhere else closes a pinned hint
document.addEventListener('pointerdown', (e) => {
    if (e.target.closest('.help-btn, .control-hint')) return;
    closeAllHints();
});

// Escape closes every open hint
document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    closeAllHints();
});

// Control style: knobs (default) or sliders. The range input is always the
// source of truth; the knob is a skin on top of it, so switching is CSS only.
const CONTROL_STYLE_KEY = 'controlStyle';
function setControlStyle(style) {
    style = style === 'sliders' ? 'sliders' : 'knobs';
    document.body.dataset.controls = style;
    try { localStorage.setItem(CONTROL_STYLE_KEY, style); } catch (e) { /* private mode */ }
    // Only the Knobs / Sliders pair: .view-btn is a shared skin (the ⋯ sheet
    // reuses it for other toggles)
    document.querySelectorAll('.view-btn[data-controls]').forEach(btn => {
        const active = btn.dataset.controls === style;
        btn.classList.toggle('active', active);
        btn.setAttribute('aria-pressed', String(active));
    });
}

document.querySelectorAll('.view-btn[data-controls]').forEach(btn => {
    btn.addEventListener('click', () => {
        setControlStyle(btn.dataset.controls);
        btn.blur();
    });
});

// First visit on a touch device starts in slider mode: dragging a knob on a
// phone is fiddly. The toggle still works and the choice is remembered.
let storedControlStyle = null;
try { storedControlStyle = localStorage.getItem(CONTROL_STYLE_KEY); } catch (e) { /* private mode */ }
if (!storedControlStyle) {
    const coarse = typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;
    storedControlStyle = coarse ? 'sliders' : 'knobs';
}
setControlStyle(storedControlStyle);

// Double-click a slider to reset it, same gesture as the knobs
document.addEventListener('dblclick', (e) => {
    const slider = e.target.closest('input[type="range"]');
    if (!slider || slider.dataset.defaultValue === undefined) return;
    slider.value = slider.dataset.defaultValue;
    slider.dispatchEvent(new Event('input', { bubbles: true }));
});

// Semantic grouping of the instrument knobs: every control id belongs to a
// named set, with a few per-synth overrides where the same id means something
// else (MetalSynth's harmonicity is tone colour, not an operator ratio).
const GROUP_BY_ID = {
    oscType: 'Oscillator', spread: 'Oscillator', volume: 'Oscillator',
    attack: 'Envelope', decay: 'Envelope', sustain: 'Envelope', release: 'Envelope',
    harmonicity: 'Operators', modulationIndex: 'Operators', modType: 'Operators',
    modAttack: 'Mod Envelope', modRelease: 'Mod Envelope',
    pitchDecay: 'Pitch', octaves: 'Pitch',
    frequency: 'Tone', resonance: 'Tone',
    filterQ: 'Filter', filterCutoff: 'Filter',
    filterAttack: 'Filter Envelope', filterDecay: 'Filter Envelope', filterSustain: 'Filter Envelope', filterRelease: 'Filter Envelope',
    noiseType: 'Noise',
    attackNoise: 'String', dampening: 'String',
    vibratoAmount: 'Vibrato', vibratoRate: 'Vibrato',
    voice0Type: 'Voices', voice1Type: 'Voices'
};
const GROUP_OVERRIDES = {
    AMSynth: { oscType: 'Operators' },
    FMSynth: { oscType: 'Operators' },
    MembraneSynth: { oscType: 'Pitch' },
    MetalSynth: { harmonicity: 'Tone', modulationIndex: 'Tone', octaves: 'Tone' },
    PluckSynth: { resonance: 'String' },
    DuoSynth: { harmonicity: 'Voices', spread: 'Voices' }
};
function groupFor(type, id) {
    return GROUP_OVERRIDES[type]?.[id] || GROUP_BY_ID[id] || 'Controls';
}

// Returns the grid inside the named set, creating the set on first use.
// Visible label drops the set name ("Filter Cutoff" inside FILTER → "Cutoff").
// Help buttons and hints keep the full name.
function shortName(name, group) {
    const words = name.split(' ');
    if (words.length > 1 && words[0].toLowerCase() === group.split(' ')[0].toLowerCase()) {
        return words.slice(1).join(' ');
    }
    return name;
}

// Each set is a grid with one 84px column per knob and two per wave picker,
// so a set is exactly as wide as its cells (no orphan wrap, no guesswork).
function sizeControlSets(root = document) {
    root.querySelectorAll('.control-set').forEach(set => {
        const cells = [...set.querySelectorAll('.control-group')];
        const cols = cells.reduce((n, cell) => n + (cell.querySelector('.wave-select') ? 2 : 1), 0);
        set.style.setProperty('--cols', cols);
        set.style.setProperty('--cells', cells.length);
    });
}

function setGrid(container, sets, name) {
    if (!sets.has(name)) {
        const set = document.createElement('section');
        set.className = 'control-set';
        set.setAttribute('role', 'group');
        set.setAttribute('aria-label', name);
        const title = document.createElement('h3');
        title.className = 'control-set-title';
        title.textContent = name;
        const grid = document.createElement('div');
        grid.className = 'controls-grid';
        set.appendChild(title);
        set.appendChild(grid);
        container.appendChild(set);
        sets.set(name, grid);
    }
    return sets.get(name);
}

function updateControls(type) {
    const controlsDiv = document.getElementById('controls');

    // Clean up knob drag listeners before destroying DOM
    controlsDiv.querySelectorAll('.knob-container').forEach(knob => {
        if (knob._dragController) knob._dragController.abort();
    });

    controlsDiv.innerHTML = '';

    const descEl = document.getElementById('synthDescription');
    if (descEl) descEl.textContent = synthDescriptions[type] || '';

    updatePresetBar(type);

    const allWaveforms = ['sine', 'square', 'triangle', 'sawtooth', 'pulse', 'pwm'];
    // "<shape>N" = first N partials. Square and triangle only have odd harmonics,
    // so squareN with even N sounds identical to N-1 and sineN is always a sine.
    // Only the distinct shapes are listed.
    const extendedWaveforms = [...allWaveforms,
                                'square3', 'square5', 'square7',
                                'triangle3', 'triangle5', 'triangle7',
                                'sawtooth2', 'sawtooth3', 'sawtooth4', 'sawtooth5', 'sawtooth6', 'sawtooth7', 'sawtooth8'];
    // "fat<shape>" = 3 detuned copies (unison) for supersaw leads and pads; the Spread knob sets the detune.
    // Only on the plain-oscillator synths, where a thick voice is the point.
    const fatWaveforms = [...extendedWaveforms, 'fatsine', 'fattriangle', 'fatsquare', 'fatsawtooth'];

    // Human-readable descriptions for each parameter
    const descs = {
        oscType: 'Wave shape \u2014 sine is pure, triangle soft, square hollow, sawtooth bright; numbered ones keep only those harmonics, so fewer = softer; fat ones stack 3 detuned copies.',
        spread: 'Detune between the 3 copies of a fat wave, in cents \u2014 only works on fat waves; try 20-30 for a lush supersaw, 60+ for a sour swarm.',
        attack: 'Fade-in time \u2014 low hits instantly, high swells in; try 0.01s for stabs and drums, 1s+ for slow pads.',
        decay: 'Time to fall from the peak to the sustain level \u2014 try 0.1s for snappy plucks, 1s+ for ringing keys.',
        sustain: 'Level held while the key is down \u2014 0 makes a pluck that dies away, 0.8+ gives a steady organ-like note.',
        release: 'Fade-out after you let go \u2014 0.1s is tight and dry; try 2-4s for pads that linger and blend.',
        volume: 'Loudness in dB, 0 is the maximum \u2014 try about -14 dB for buzzy square/sawtooth, -8 dB for soft sines.',
        harmonicity: 'Pitch ratio between the two oscillators \u2014 whole numbers stay musical; try 1.5 for a fifth, 3.5 for bells.',
        modType: 'Wave of the modulator \u2014 sine gives smooth tones, square and sawtooth add buzz; start with sine for clean keys.',
        modulationIndex: 'Modulation depth \u2014 low is soft and pure, high is bright and harsh; try 5-10 for keys, 40+ for clangs.',
        modAttack: 'How fast the modulation fades in \u2014 0 bites bright at once; try 0.5s+ for tones that morph as you hold.',
        modRelease: 'How long the modulation lingers after release \u2014 short keeps tails clean; try 1-2s for evolving decays.',
        pitchDecay: 'Speed of the pitch drop \u2014 short is punchy, long is a sweep; try 0.03s for a kick, 0.2s+ for a disco tom.',
        octaves: 'Size of the sweep \u2014 low is subtle, high is dramatic; try 6 for a kick drum, 1-1.5 for crisp hi-hats.',
        frequency: 'Base pitch of the metal in Hz \u2014 low sounds like a gong, high like a hat; try 80 for gongs, 400 for hats.',
        resonance: 'Ring control \u2014 on metals it sets brightness in Hz (try 7000 for hats); on plucks, near 1 sustains longer.',
        filterQ: 'Resonant peak at the cutoff \u2014 0 is smooth, high squeals and whistles; try 10+ for acid squelch.',
        filterCutoff: 'Brightness \u2014 low is dark and muffled, high is open; sweep it while holding a note to hear the classic filter move.',
        filterAttack: 'How fast the filter opens on each note \u2014 0 gives a bright click; try 0.1-0.3s for a slow "wow" sweep.',
        filterDecay: 'How fast the filter closes after opening \u2014 short makes blips; try 0.2s for acid bass, 0.5s+ for wahs.',
        filterSustain: 'How open the filter stays while held \u2014 0 closes fully for plucks; try 0.6+ to keep leads bright.',
        filterRelease: 'How long the filter takes to close after release \u2014 short is tight; try 1s+ for a darkening tail.',
        noiseType: 'Noise color \u2014 white is hissy, pink balanced, brown deep and rumbly; try white for snares, pink for wind.',
        attackNoise: 'Strength of the pick burst \u2014 low is a soft fingertip, high is a hard pick; try 5+ for a twangy banjo.',
        dampening: 'How fast high tones die out \u2014 low is muffled like a muted bass; try 6000+ Hz for a bright harp shimmer.',
        vibratoAmount: 'Depth of the pitch wobble \u2014 0 is steady, 1 is seasick; try 0.1 for a singing lead, 0.8 for alien warble.',
        vibratoRate: 'Speed of the pitch wobble \u2014 slow sways, fast flutters; try 5 Hz for natural vibrato, 10+ for odd effects.',
        voice0Type: 'Wave of the first voice \u2014 sawtooth is rich and bright, triangle soft; try sawtooth for leads.',
        voice1Type: 'Wave of the second voice \u2014 pick a different shape from voice 0, e.g. square under a sawtooth, for a thicker blend.'
    };

    const controlSets = {
        'Synth': [
            { name: 'Oscillator Type', id: 'oscType', type: 'wave', values: fatWaveforms, default: 'sine' },
            { name: 'Spread', id: 'spread', min: 0, max: 100, step: 1, default: 20, suffix: ' ct' },
            { name: 'Attack', id: 'attack', min: 0, max: 2, step: 0.001, default: 0.05, suffix: ' Sec' },
            { name: 'Decay', id: 'decay', min: 0, max: 2, step: 0.01, default: 0.1, suffix: ' Sec' },
            { name: 'Sustain', id: 'sustain', min: 0, max: 1, step: 0.01, default: 0.3 },
            { name: 'Release', id: 'release', min: 0, max: 5, step: 0.01, default: 1, suffix: ' Sec' },
            { name: 'Volume', id: 'volume', min: -60, max: 0, step: 1, default: -10, suffix: ' dB' }
        ],
        'AMSynth': [
            { name: 'Harmonicity', id: 'harmonicity', min: 0.5, max: 10, step: 0.1, default: 3 },
            { name: 'Oscillator Type', id: 'oscType', type: 'wave', values: extendedWaveforms, default: 'sine' },
            { name: 'Modulation Type', id: 'modType', type: 'wave', values: extendedWaveforms, default: 'square' },
            { name: 'Attack', id: 'attack', min: 0, max: 2, step: 0.001, default: 0.05, suffix: ' Sec' },
            { name: 'Decay', id: 'decay', min: 0, max: 2, step: 0.01, default: 0.1, suffix: ' Sec' },
            { name: 'Sustain', id: 'sustain', min: 0, max: 1, step: 0.01, default: 0.3 },
            { name: 'Release', id: 'release', min: 0, max: 5, step: 0.01, default: 1, suffix: ' Sec' },
            { name: 'Mod Attack', id: 'modAttack', min: 0, max: 2, step: 0.001, default: 0.5, suffix: ' Sec' },
            { name: 'Mod Release', id: 'modRelease', min: 0, max: 5, step: 0.01, default: 0.5, suffix: ' Sec' }
        ],
        'FMSynth': [
            { name: 'Harmonicity', id: 'harmonicity', min: 0.5, max: 10, step: 0.1, default: 3 },
            { name: 'Modulation Index', id: 'modulationIndex', min: 0, max: 100, step: 1, default: 10 },
            { name: 'Oscillator Type', id: 'oscType', type: 'wave', values: extendedWaveforms, default: 'sine' },
            { name: 'Modulation Type', id: 'modType', type: 'wave', values: extendedWaveforms, default: 'square' },
            { name: 'Attack', id: 'attack', min: 0, max: 2, step: 0.001, default: 0.05, suffix: ' Sec' },
            { name: 'Decay', id: 'decay', min: 0, max: 2, step: 0.01, default: 0.1, suffix: ' Sec' },
            { name: 'Sustain', id: 'sustain', min: 0, max: 1, step: 0.01, default: 0.3 },
            { name: 'Release', id: 'release', min: 0, max: 5, step: 0.01, default: 1, suffix: ' Sec' },
            { name: 'Mod Attack', id: 'modAttack', min: 0, max: 2, step: 0.001, default: 0.2, suffix: ' Sec' },
            { name: 'Mod Release', id: 'modRelease', min: 0, max: 5, step: 0.01, default: 0.5, suffix: ' Sec' }
        ],
        'MembraneSynth': [
            { name: 'Pitch Decay', id: 'pitchDecay', min: 0.001, max: 1, step: 0.001, default: 0.05, suffix: ' Sec' },
            { name: 'Octaves', id: 'octaves', min: 0.5, max: 16, step: 0.5, default: 10 },
            { name: 'Oscillator Type', id: 'oscType', type: 'wave', values: extendedWaveforms, default: 'sine' },
            { name: 'Attack', id: 'attack', min: 0, max: 2, step: 0.001, default: 0.001, suffix: ' Sec' },
            { name: 'Decay', id: 'decay', min: 0, max: 2, step: 0.01, default: 0.4, suffix: ' Sec' },
            { name: 'Sustain', id: 'sustain', min: 0, max: 1, step: 0.01, default: 0.01 },
            { name: 'Release', id: 'release', min: 0, max: 5, step: 0.01, default: 1.4, suffix: ' Sec' }
        ],
        'MetalSynth': [
            { name: 'Frequency', id: 'frequency', min: 50, max: 1000, step: 1, default: 200, suffix: ' Hz' },
            { name: 'Harmonicity', id: 'harmonicity', min: 0.1, max: 20, step: 0.1, default: 5.1 },
            { name: 'Modulation Index', id: 'modulationIndex', min: 0, max: 100, step: 1, default: 32 },
            { name: 'Resonance', id: 'resonance', min: 500, max: 8000, step: 10, default: 4000, suffix: ' Hz' },
            { name: 'Octaves', id: 'octaves', min: 0.1, max: 8, step: 0.1, default: 1.5 },
            { name: 'Attack', id: 'attack', min: 0, max: 2, step: 0.001, default: 0.001, suffix: ' Sec' },
            { name: 'Decay', id: 'decay', min: 0, max: 5, step: 0.01, default: 1.4, suffix: ' Sec' },
            { name: 'Release', id: 'release', min: 0, max: 5, step: 0.01, default: 0.2, suffix: ' Sec' }
        ],
        'MonoSynth': [
            { name: 'Oscillator Type', id: 'oscType', type: 'wave', values: fatWaveforms, default: 'square' },
            { name: 'Spread', id: 'spread', min: 0, max: 100, step: 1, default: 20, suffix: ' ct' },
            { name: 'Filter Q', id: 'filterQ', min: 0, max: 20, step: 0.1, default: 6 },
            { name: 'Filter Cutoff', id: 'filterCutoff', min: 20, max: 20000, step: 10, default: 1000, suffix: ' Hz' },
            { name: 'Attack', id: 'attack', min: 0, max: 2, step: 0.001, default: 0.05, suffix: ' Sec' },
            { name: 'Decay', id: 'decay', min: 0, max: 2, step: 0.01, default: 0.1, suffix: ' Sec' },
            { name: 'Sustain', id: 'sustain', min: 0, max: 1, step: 0.01, default: 0.9 },
            { name: 'Release', id: 'release', min: 0, max: 5, step: 0.01, default: 1, suffix: ' Sec' },
            { name: 'Filter Attack', id: 'filterAttack', min: 0, max: 2, step: 0.001, default: 0.06, suffix: ' Sec' },
            { name: 'Filter Decay', id: 'filterDecay', min: 0, max: 2, step: 0.01, default: 0.2, suffix: ' Sec' },
            { name: 'Filter Sustain', id: 'filterSustain', min: 0, max: 1, step: 0.01, default: 0.5 },
            { name: 'Filter Release', id: 'filterRelease', min: 0, max: 5, step: 0.01, default: 2, suffix: ' Sec' }
        ],
        'NoiseSynth': [
            { name: 'Noise Type', id: 'noiseType', type: 'wave', values: ['white', 'brown', 'pink'], default: 'white' },
            { name: 'Attack', id: 'attack', min: 0, max: 2, step: 0.001, default: 0.05, suffix: ' Sec' },
            { name: 'Decay', id: 'decay', min: 0, max: 2, step: 0.01, default: 0.1, suffix: ' Sec' },
            { name: 'Sustain', id: 'sustain', min: 0, max: 1, step: 0.01, default: 0.3 },
            { name: 'Release', id: 'release', min: 0, max: 5, step: 0.01, default: 1, suffix: ' Sec' }
        ],
        'PluckSynth': [
            { name: 'Attack Noise', id: 'attackNoise', min: 0.1, max: 20, step: 0.1, default: 1 },
            { name: 'Dampening', id: 'dampening', min: 500, max: 10000, step: 10, default: 4000, suffix: ' Hz' },
            { name: 'Resonance', id: 'resonance', min: 0, max: 1, step: 0.01, default: 0.7 }
        ],
        'PolySynth': [
            { name: 'Oscillator Type', id: 'oscType', type: 'wave', values: fatWaveforms, default: 'sine' },
            { name: 'Spread', id: 'spread', min: 0, max: 100, step: 1, default: 20, suffix: ' ct' },
            { name: 'Attack', id: 'attack', min: 0, max: 2, step: 0.001, default: 0.05, suffix: ' Sec' },
            { name: 'Decay', id: 'decay', min: 0, max: 2, step: 0.01, default: 0.1, suffix: ' Sec' },
            { name: 'Sustain', id: 'sustain', min: 0, max: 1, step: 0.01, default: 0.3 },
            { name: 'Release', id: 'release', min: 0, max: 5, step: 0.01, default: 1, suffix: ' Sec' }
        ],
        'DuoSynth': [
            { name: 'Vibrato Amount', id: 'vibratoAmount', min: 0, max: 1, step: 0.01, default: 0.5 },
            { name: 'Vibrato Rate', id: 'vibratoRate', min: 0, max: 20, step: 0.1, default: 5, suffix: ' Hz' },
            { name: 'Harmonicity', id: 'harmonicity', min: 0.5, max: 10, step: 0.01, default: 1.5 },
            { name: 'Voice 0 Osc', id: 'voice0Type', type: 'wave', values: fatWaveforms, default: 'sine' },
            { name: 'Voice 1 Osc', id: 'voice1Type', type: 'wave', values: fatWaveforms, default: 'sine' },
            { name: 'Spread', id: 'spread', min: 0, max: 100, step: 1, default: 20, suffix: ' ct' },
            { name: 'Attack', id: 'attack', min: 0, max: 2, step: 0.001, default: 0.05, suffix: ' Sec' },
            { name: 'Decay', id: 'decay', min: 0, max: 2, step: 0.01, default: 0.1, suffix: ' Sec' },
            { name: 'Sustain', id: 'sustain', min: 0, max: 1, step: 0.01, default: 0.3 },
            { name: 'Release', id: 'release', min: 0, max: 5, step: 0.01, default: 1, suffix: ' Sec' }
        ]
    };

    const controls = controlSets[type] || controlSets['Synth'];
    let controlIndex = 0;

    const sets = new Map();
    controls.forEach(control => {
        const controlGroup = document.createElement('div');
        controlGroup.className = 'control-group';
        const uniqueId = `ctrl_${control.id}_${controlIndex++}`;

        const desc = descs[control.id] || '';
        const group = groupFor(type, control.id);
        const label = shortName(control.name, group);

        if (control.type === 'wave') {
            const labelId = `${uniqueId}_label`;
            controlGroup.innerHTML = `
                <div class="control-label">
                    <label id="${labelId}" for="${uniqueId}">${label}</label>
                    ${helpButton(uniqueId, control.name, desc)}
                </div>
                ${hintParagraph(uniqueId, desc)}
                <select class="wave-select" id="${uniqueId}" data-control="${control.id}" aria-labelledby="${labelId}">
                    ${control.values.map(val =>
                        `<option value="${val}" ${val === control.default ? 'selected' : ''}>${waveLabel(val)}</option>`
                    ).join('')}
                </select>
            `;
        } else {
            controlGroup.innerHTML = `
                <div class="control-label">
                    <label for="${uniqueId}">${label}</label>
                    <span class="control-value" id="${uniqueId}Value">${control.default}${control.suffix || ''}</span>
                    ${helpButton(uniqueId, control.name, desc)}
                </div>
                ${hintParagraph(uniqueId, desc)}
                <input type="range"
                       id="${uniqueId}"
                       data-control="${control.id}"
                       data-default-value="${control.default}"
                       min="${control.min}"
                       max="${control.max}"
                       step="${control.step}"
                       value="${control.default}"
                       aria-valuenow="${control.default}"
                       aria-valuemin="${control.min}"
                       aria-valuemax="${control.max}">
            `;
        }

        setGrid(controlsDiv, sets, group).appendChild(controlGroup);
    });

    // Add event listeners
    controls.forEach((control, i) => {
        const uniqueId = `ctrl_${control.id}_${i}`;
        if (control.type === 'wave') {
            const select = document.getElementById(uniqueId);
            select.addEventListener('change', (e) => {
                updateSynthParameter(control.id, e.target.value);
                refreshWavePreview(select);
            });
            buildWavePicker(select, `${uniqueId}_label`);
        } else {
            const slider = document.getElementById(uniqueId);
            const valueDisplay = document.getElementById(`${uniqueId}Value`);

            slider.addEventListener('input', (e) => {
                const value = parseFloat(e.target.value);
                valueDisplay.textContent = value + (control.suffix || '');
                slider.setAttribute('aria-valuenow', value);
                updateSynthParameter(control.id, value);
                updateSliderFill(slider);
            });
            updateSliderFill(slider);
        }
    });

    // Attach knobs to new controls
    controlsDiv.querySelectorAll('input[type="range"]').forEach(slider => {
        if (!slider.parentElement.querySelector('.knob-container')) {
            attachKnobToSlider(slider);
        }
    });
    sizeControlSets(controlsDiv);
    syncSpread();
}

// Static effects sets (index.html) get their column count once
sizeControlSets(document);

// Spread only does something on a fat wave: grey the control out (slider, knob and
// keyboard) while no wave in the set is fat. Waves announce changes via 'wavesync'.
function syncSpread() {
    const slider = document.querySelector('#controls [data-control="spread"]');
    if (!slider) return;
    const anyFat = [...document.querySelectorAll('#controls select[data-control]')].some(sel => sel.value.startsWith('fat'));
    slider.disabled = !anyFat;
    slider.closest('.control-group')?.classList.toggle('is-disabled', !anyFat);
    const knob = slider.parentElement.querySelector('.knob-container');
    if (knob) {
        knob.setAttribute('aria-disabled', String(!anyFat));
        knob.setAttribute('tabindex', anyFat ? '0' : '-1');
    }
}
document.addEventListener('wavesync', syncSpread);

// Instrument selector
document.getElementById('instrumentType').addEventListener('change', (e) => {
    initSynth(e.target.value);
    updateControls(e.target.value);
    e.target.blur();
});

export { updateControls, setControlStyle };
