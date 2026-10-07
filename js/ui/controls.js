// Instrument control panel: help hints, knob/slider style toggle, per-synth control
// rendering (updateControls) and the instrument selector.
import { initSynth, updateSynthParameter } from '../audio/synth.js';
import { synthDescriptions, updatePresetBar } from '../audio/presets.js';
import { updateSliderFill, attachKnobToSlider } from './knobs.js';

// Hints are collapsed behind a "?" button so the grid stays compact.
function helpButton(id, name, desc) {
    if (!desc) return '';
    return `<button type="button" class="help-btn" aria-label="What does ${name} do?" aria-expanded="false" aria-controls="${id}Hint">?</button>`;
}

function hintParagraph(id, desc) {
    return desc ? `<p class="control-hint" id="${id}Hint" hidden>${desc}</p>` : '';
}

// One delegated listener covers instrument knobs (rebuilt per synth) and the static effects rack.
document.addEventListener('click', (e) => {
    const btn = e.target.closest('.help-btn');
    if (!btn) return;
    const hint = document.getElementById(btn.getAttribute('aria-controls'));
    if (!hint) return;
    const open = hint.hidden;
    hint.hidden = !open;
    btn.setAttribute('aria-expanded', String(open));
});

// Escape closes every open hint
document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    document.querySelectorAll('.help-btn[aria-expanded="true"]').forEach(btn => {
        btn.setAttribute('aria-expanded', 'false');
        const hint = document.getElementById(btn.getAttribute('aria-controls'));
        if (hint) hint.hidden = true;
    });
});

// Control style: knobs (default) or sliders. The range input is always the
// source of truth; the knob is a skin on top of it, so switching is CSS only.
const CONTROL_STYLE_KEY = 'controlStyle';
function setControlStyle(style) {
    style = style === 'sliders' ? 'sliders' : 'knobs';
    document.body.dataset.controls = style;
    try { localStorage.setItem(CONTROL_STYLE_KEY, style); } catch (e) { /* private mode */ }
    document.querySelectorAll('.view-btn').forEach(btn => {
        const active = btn.dataset.controls === style;
        btn.classList.toggle('active', active);
        btn.setAttribute('aria-pressed', String(active));
    });
}

document.querySelectorAll('.view-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        setControlStyle(btn.dataset.controls);
        btn.blur();
    });
});

let storedControlStyle = 'knobs';
try { storedControlStyle = localStorage.getItem(CONTROL_STYLE_KEY) || 'knobs'; } catch (e) { /* private mode */ }
setControlStyle(storedControlStyle);

// Double-click a slider to reset it, same gesture as the knobs
document.addEventListener('dblclick', (e) => {
    const slider = e.target.closest('input[type="range"]');
    if (!slider || slider.dataset.defaultValue === undefined) return;
    slider.value = slider.dataset.defaultValue;
    slider.dispatchEvent(new Event('input', { bubbles: true }));
});

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
    const extendedWaveforms = [...allWaveforms, 'sine2', 'sine3', 'sine4', 'sine5', 'sine6', 'sine7', 'sine8',
                                'square2', 'square3', 'square4', 'square5', 'square6', 'square7', 'square8',
                                'triangle2', 'triangle3', 'triangle4', 'triangle5', 'triangle6', 'triangle7', 'triangle8',
                                'sawtooth2', 'sawtooth3', 'sawtooth4', 'sawtooth5', 'sawtooth6', 'sawtooth7', 'sawtooth8'];

    // Human-readable descriptions for each parameter
    const descs = {
        oscType: 'Wave shape \u2014 sine is pure, triangle soft, square hollow, sawtooth bright; try sawtooth for leads, sine for sub bass.',
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
            { name: 'Oscillator Type', id: 'oscType', type: 'wave', values: extendedWaveforms, default: 'sine' },
            { name: 'Attack', id: 'attack', min: 0, max: 2, step: 0.001, default: 0.05, suffix: 's' },
            { name: 'Decay', id: 'decay', min: 0, max: 2, step: 0.01, default: 0.1, suffix: 's' },
            { name: 'Sustain', id: 'sustain', min: 0, max: 1, step: 0.01, default: 0.3 },
            { name: 'Release', id: 'release', min: 0, max: 5, step: 0.01, default: 1, suffix: 's' },
            { name: 'Volume', id: 'volume', min: -60, max: 0, step: 1, default: -10, suffix: ' dB' }
        ],
        'AMSynth': [
            { name: 'Harmonicity', id: 'harmonicity', min: 0.5, max: 10, step: 0.1, default: 3 },
            { name: 'Oscillator Type', id: 'oscType', type: 'wave', values: extendedWaveforms, default: 'sine' },
            { name: 'Modulation Type', id: 'modType', type: 'wave', values: extendedWaveforms, default: 'square' },
            { name: 'Attack', id: 'attack', min: 0, max: 2, step: 0.001, default: 0.05, suffix: 's' },
            { name: 'Decay', id: 'decay', min: 0, max: 2, step: 0.01, default: 0.1, suffix: 's' },
            { name: 'Sustain', id: 'sustain', min: 0, max: 1, step: 0.01, default: 0.3 },
            { name: 'Release', id: 'release', min: 0, max: 5, step: 0.01, default: 1, suffix: 's' },
            { name: 'Mod Attack', id: 'modAttack', min: 0, max: 2, step: 0.001, default: 0.5, suffix: 's' },
            { name: 'Mod Release', id: 'modRelease', min: 0, max: 5, step: 0.01, default: 0.5, suffix: 's' }
        ],
        'FMSynth': [
            { name: 'Harmonicity', id: 'harmonicity', min: 0.5, max: 10, step: 0.1, default: 3 },
            { name: 'Modulation Index', id: 'modulationIndex', min: 0, max: 100, step: 1, default: 10 },
            { name: 'Oscillator Type', id: 'oscType', type: 'wave', values: extendedWaveforms, default: 'sine' },
            { name: 'Modulation Type', id: 'modType', type: 'wave', values: extendedWaveforms, default: 'square' },
            { name: 'Attack', id: 'attack', min: 0, max: 2, step: 0.001, default: 0.05, suffix: 's' },
            { name: 'Decay', id: 'decay', min: 0, max: 2, step: 0.01, default: 0.1, suffix: 's' },
            { name: 'Sustain', id: 'sustain', min: 0, max: 1, step: 0.01, default: 0.3 },
            { name: 'Release', id: 'release', min: 0, max: 5, step: 0.01, default: 1, suffix: 's' },
            { name: 'Mod Attack', id: 'modAttack', min: 0, max: 2, step: 0.001, default: 0.2, suffix: 's' },
            { name: 'Mod Release', id: 'modRelease', min: 0, max: 5, step: 0.01, default: 0.5, suffix: 's' }
        ],
        'MembraneSynth': [
            { name: 'Pitch Decay', id: 'pitchDecay', min: 0.001, max: 1, step: 0.001, default: 0.05, suffix: 's' },
            { name: 'Octaves', id: 'octaves', min: 0.5, max: 16, step: 0.5, default: 10 },
            { name: 'Oscillator Type', id: 'oscType', type: 'wave', values: extendedWaveforms, default: 'sine' },
            { name: 'Attack', id: 'attack', min: 0, max: 2, step: 0.001, default: 0.001, suffix: 's' },
            { name: 'Decay', id: 'decay', min: 0, max: 2, step: 0.01, default: 0.4, suffix: 's' },
            { name: 'Sustain', id: 'sustain', min: 0, max: 1, step: 0.01, default: 0.01 },
            { name: 'Release', id: 'release', min: 0, max: 5, step: 0.01, default: 1.4, suffix: 's' }
        ],
        'MetalSynth': [
            { name: 'Frequency', id: 'frequency', min: 50, max: 1000, step: 1, default: 200, suffix: ' Hz' },
            { name: 'Harmonicity', id: 'harmonicity', min: 0.1, max: 20, step: 0.1, default: 5.1 },
            { name: 'Modulation Index', id: 'modulationIndex', min: 0, max: 100, step: 1, default: 32 },
            { name: 'Resonance', id: 'resonance', min: 500, max: 8000, step: 10, default: 4000, suffix: ' Hz' },
            { name: 'Octaves', id: 'octaves', min: 0.1, max: 8, step: 0.1, default: 1.5 },
            { name: 'Attack', id: 'attack', min: 0, max: 2, step: 0.001, default: 0.001, suffix: 's' },
            { name: 'Decay', id: 'decay', min: 0, max: 5, step: 0.01, default: 1.4, suffix: 's' },
            { name: 'Release', id: 'release', min: 0, max: 5, step: 0.01, default: 0.2, suffix: 's' }
        ],
        'MonoSynth': [
            { name: 'Oscillator Type', id: 'oscType', type: 'wave', values: extendedWaveforms, default: 'square' },
            { name: 'Filter Q', id: 'filterQ', min: 0, max: 20, step: 0.1, default: 6 },
            { name: 'Filter Cutoff', id: 'filterCutoff', min: 20, max: 20000, step: 10, default: 1000, suffix: ' Hz' },
            { name: 'Attack', id: 'attack', min: 0, max: 2, step: 0.001, default: 0.05, suffix: 's' },
            { name: 'Decay', id: 'decay', min: 0, max: 2, step: 0.01, default: 0.1, suffix: 's' },
            { name: 'Sustain', id: 'sustain', min: 0, max: 1, step: 0.01, default: 0.9 },
            { name: 'Release', id: 'release', min: 0, max: 5, step: 0.01, default: 1, suffix: 's' },
            { name: 'Filter Attack', id: 'filterAttack', min: 0, max: 2, step: 0.001, default: 0.06, suffix: 's' },
            { name: 'Filter Decay', id: 'filterDecay', min: 0, max: 2, step: 0.01, default: 0.2, suffix: 's' },
            { name: 'Filter Sustain', id: 'filterSustain', min: 0, max: 1, step: 0.01, default: 0.5 },
            { name: 'Filter Release', id: 'filterRelease', min: 0, max: 5, step: 0.01, default: 2, suffix: 's' }
        ],
        'NoiseSynth': [
            { name: 'Noise Type', id: 'noiseType', type: 'wave', values: ['white', 'brown', 'pink'], default: 'white' },
            { name: 'Attack', id: 'attack', min: 0, max: 2, step: 0.001, default: 0.05, suffix: 's' },
            { name: 'Decay', id: 'decay', min: 0, max: 2, step: 0.01, default: 0.1, suffix: 's' },
            { name: 'Sustain', id: 'sustain', min: 0, max: 1, step: 0.01, default: 0.3 },
            { name: 'Release', id: 'release', min: 0, max: 5, step: 0.01, default: 1, suffix: 's' }
        ],
        'PluckSynth': [
            { name: 'Attack Noise', id: 'attackNoise', min: 0.1, max: 20, step: 0.1, default: 1 },
            { name: 'Dampening', id: 'dampening', min: 500, max: 10000, step: 10, default: 4000, suffix: ' Hz' },
            { name: 'Resonance', id: 'resonance', min: 0, max: 1, step: 0.01, default: 0.7 }
        ],
        'PolySynth': [
            { name: 'Oscillator Type', id: 'oscType', type: 'wave', values: extendedWaveforms, default: 'sine' },
            { name: 'Attack', id: 'attack', min: 0, max: 2, step: 0.001, default: 0.05, suffix: 's' },
            { name: 'Decay', id: 'decay', min: 0, max: 2, step: 0.01, default: 0.1, suffix: 's' },
            { name: 'Sustain', id: 'sustain', min: 0, max: 1, step: 0.01, default: 0.3 },
            { name: 'Release', id: 'release', min: 0, max: 5, step: 0.01, default: 1, suffix: 's' }
        ],
        'DuoSynth': [
            { name: 'Vibrato Amount', id: 'vibratoAmount', min: 0, max: 1, step: 0.01, default: 0.5 },
            { name: 'Vibrato Rate', id: 'vibratoRate', min: 0, max: 20, step: 0.1, default: 5, suffix: ' Hz' },
            { name: 'Harmonicity', id: 'harmonicity', min: 0.5, max: 10, step: 0.01, default: 1.5 },
            { name: 'Voice 0 Osc', id: 'voice0Type', type: 'wave', values: extendedWaveforms, default: 'sine' },
            { name: 'Voice 1 Osc', id: 'voice1Type', type: 'wave', values: extendedWaveforms, default: 'sine' },
            { name: 'Attack', id: 'attack', min: 0, max: 2, step: 0.001, default: 0.05, suffix: 's' },
            { name: 'Decay', id: 'decay', min: 0, max: 2, step: 0.01, default: 0.1, suffix: 's' },
            { name: 'Sustain', id: 'sustain', min: 0, max: 1, step: 0.01, default: 0.3 },
            { name: 'Release', id: 'release', min: 0, max: 5, step: 0.01, default: 1, suffix: 's' }
        ]
    };

    const controls = controlSets[type] || controlSets['Synth'];
    let controlIndex = 0;

    controls.forEach(control => {
        const controlGroup = document.createElement('div');
        controlGroup.className = 'control-group';
        const uniqueId = `ctrl_${control.id}_${controlIndex++}`;

        const desc = descs[control.id] || '';

        if (control.type === 'wave') {
            const labelId = `${uniqueId}_label`;
            controlGroup.innerHTML = `
                <div class="control-label">
                    <label id="${labelId}" for="${uniqueId}">${control.name}</label>
                    ${helpButton(uniqueId, control.name, desc)}
                </div>
                ${hintParagraph(uniqueId, desc)}
                <select class="wave-select" id="${uniqueId}" data-control="${control.id}" aria-labelledby="${labelId}">
                    ${control.values.map(val =>
                        `<option value="${val}" ${val === control.default ? 'selected' : ''}>${val}</option>`
                    ).join('')}
                </select>
            `;
        } else {
            controlGroup.innerHTML = `
                <div class="control-label">
                    <label for="${uniqueId}">${control.name}</label>
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

        controlsDiv.appendChild(controlGroup);
    });

    // Add event listeners
    controls.forEach((control, i) => {
        const uniqueId = `ctrl_${control.id}_${i}`;
        if (control.type === 'wave') {
            const select = document.getElementById(uniqueId);
            select.addEventListener('change', (e) => {
                updateSynthParameter(control.id, e.target.value);
                e.target.blur();
            });
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
}

// Instrument selector
document.getElementById('instrumentType').addEventListener('change', (e) => {
    initSynth(e.target.value);
    updateControls(e.target.value);
    e.target.blur();
});

export { updateControls, setControlStyle };
