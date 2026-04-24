// Initialize audio context
let synth = null;
let reverb, delay, distortion, filter, chorus;
let currentInstrumentType = 'Synth';
let currentOctave = 4;
let minOctave = 0;
let maxOctave = 8;
let activeKeys = new Set();
let userLayout = 'qwerty';
let audioInitialized = false;

// Keyboard layouts
const keyboardLayouts = {
    qwerty: ['a', 'w', 's', 'e', 'd', 'f', 't', 'g', 'y', 'h', 'u', 'j', 'k'],
    azerty: ['q', 'z', 's', 'e', 'd', 'f', 't', 'g', 'y', 'h', 'u', 'j', 'k'],
    qwertz: ['a', 'w', 's', 'e', 'd', 'f', 't', 'g', 'z', 'h', 'u', 'j', 'k'],
    dvorak: ['a', ',', 'o', 'e', '.', 'u', 'k', 'i', 'x', 'd', 'b', 'h', 'n']
};

// Detect user's keyboard layout
function detectKeyboardLayout() {
    const savedLayout = localStorage.getItem('keyboardLayout');
    if (savedLayout && keyboardLayouts[savedLayout]) {
        return savedLayout;
    }
    return 'qwerty';
}

// Initialize effects
function initEffects() {
    reverb = new Tone.Reverb({ decay: 1.5, wet: 0.3 }).toDestination();
    delay = new Tone.FeedbackDelay({ delayTime: 0.25, feedback: 0.3, wet: 0.3 }).connect(reverb);
    distortion = new Tone.Distortion({ distortion: 0, wet: 0 }).connect(delay);
    filter = new Tone.Filter({ frequency: 5000, type: 'lowpass' }).connect(distortion);
    chorus = new Tone.Chorus({ frequency: 1.5, delayTime: 3.5, depth: 0.7, wet: 0.3 }).connect(filter);
    chorus.start();
}

// Initialize synth
function initSynth(type) {
    if (synth) {
        // Clear active state before disposing
        activeKeys.clear();
        activeTouches.clear();
        document.querySelectorAll('.key.pressed').forEach(k => k.classList.remove('pressed'));
        document.getElementById('currentNote').textContent = '\u2014';
        synth.dispose();
    }

    const synthConfig = getSynthConfig(type);

    switch(type) {
        case 'Synth':
            synth = new Tone.Synth(synthConfig).connect(chorus);
            break;
        case 'AMSynth':
            synth = new Tone.AMSynth(synthConfig).connect(chorus);
            break;
        case 'FMSynth':
            synth = new Tone.FMSynth(synthConfig).connect(chorus);
            break;
        case 'MembraneSynth':
            synth = new Tone.MembraneSynth(synthConfig).connect(chorus);
            break;
        case 'MetalSynth':
            synth = new Tone.MetalSynth(synthConfig).connect(chorus);
            break;
        case 'MonoSynth':
            synth = new Tone.MonoSynth(synthConfig).connect(chorus);
            break;
        case 'NoiseSynth':
            synth = new Tone.NoiseSynth(synthConfig).connect(chorus);
            break;
        case 'PluckSynth':
            synth = new Tone.PluckSynth(synthConfig).connect(chorus);
            break;
        case 'PolySynth':
            synth = new Tone.PolySynth(Tone.Synth, synthConfig).connect(chorus);
            break;
        case 'DuoSynth':
            synth = new Tone.DuoSynth(synthConfig).connect(chorus);
            break;
    }

    currentInstrumentType = type;
    updateControls(type);
}

function getSynthConfig(type) {
    const configs = {
        'Synth': {
            oscillator: { type: 'sine' },
            envelope: { attack: 0.05, decay: 0.1, sustain: 0.3, release: 1 }
        },
        'AMSynth': {
            harmonicity: 3,
            oscillator: { type: 'sine' },
            envelope: { attack: 0.05, decay: 0.1, sustain: 0.3, release: 1 },
            modulation: { type: 'square' },
            modulationEnvelope: { attack: 0.5, decay: 0, sustain: 1, release: 0.5 }
        },
        'FMSynth': {
            harmonicity: 3,
            modulationIndex: 10,
            oscillator: { type: 'sine' },
            envelope: { attack: 0.05, decay: 0.1, sustain: 0.3, release: 1 },
            modulation: { type: 'square' },
            modulationEnvelope: { attack: 0.2, decay: 0, sustain: 1, release: 0.5 }
        },
        'MembraneSynth': {
            pitchDecay: 0.05,
            octaves: 10,
            oscillator: { type: 'sine' },
            envelope: { attack: 0.001, decay: 0.4, sustain: 0.01, release: 1.4 }
        },
        'MetalSynth': {
            frequency: 200,
            envelope: { attack: 0.001, decay: 1.4, release: 0.2 },
            harmonicity: 5.1,
            modulationIndex: 32,
            resonance: 4000,
            octaves: 1.5
        },
        'MonoSynth': {
            oscillator: { type: 'square' },
            filter: { Q: 6, type: 'lowpass', rolloff: -24 },
            envelope: { attack: 0.05, decay: 0.1, sustain: 0.9, release: 1 },
            filterEnvelope: { attack: 0.06, decay: 0.2, sustain: 0.5, release: 2, baseFrequency: 200, octaves: 7 }
        },
        'NoiseSynth': {
            noise: { type: 'white' },
            envelope: { attack: 0.05, decay: 0.1, sustain: 0.3, release: 1 }
        },
        'PluckSynth': {
            attackNoise: 1,
            dampening: 4000,
            resonance: 0.7
        },
        'PolySynth': {
            oscillator: { type: 'sine' },
            envelope: { attack: 0.05, decay: 0.1, sustain: 0.3, release: 1 }
        },
        'DuoSynth': {
            vibratoAmount: 0.5,
            vibratoRate: 5,
            harmonicity: 1.5,
            voice0: {
                oscillator: { type: 'sine' },
                filterEnvelope: { attack: 0.01, decay: 0, sustain: 1, release: 0.5 },
                envelope: { attack: 0.05, decay: 0.1, sustain: 0.3, release: 1 }
            },
            voice1: {
                oscillator: { type: 'sine' },
                filterEnvelope: { attack: 0.01, decay: 0, sustain: 1, release: 0.5 },
                envelope: { attack: 0.05, decay: 0.1, sustain: 0.3, release: 1 }
            }
        }
    };

    return configs[type] || configs['Synth'];
}

function updateControls(type) {
    const controlsDiv = document.getElementById('controls');
    controlsDiv.innerHTML = '';

    const allWaveforms = ['sine', 'square', 'triangle', 'sawtooth', 'pulse', 'pwm'];
    const extendedWaveforms = [...allWaveforms, 'sine2', 'sine3', 'sine4', 'sine5', 'sine6', 'sine7', 'sine8',
                                'square2', 'square3', 'square4', 'square5', 'square6', 'square7', 'square8',
                                'triangle2', 'triangle3', 'triangle4', 'triangle5', 'triangle6', 'triangle7', 'triangle8',
                                'sawtooth2', 'sawtooth3', 'sawtooth4', 'sawtooth5', 'sawtooth6', 'sawtooth7', 'sawtooth8'];

    // Human-readable descriptions for each parameter
    const descs = {
        oscType: 'The basic shape of the sound wave \u2014 sine is smooth, square is buzzy, sawtooth is bright',
        attack: 'How fast the sound fades in when you press a key',
        decay: 'How fast the sound drops from peak to sustain level',
        sustain: 'The volume level held while a key stays pressed',
        release: 'How long the sound fades out after releasing a key',
        volume: 'Overall loudness of the instrument',
        harmonicity: 'Ratio between the two oscillators \u2014 higher = more metallic, bell-like tones',
        modType: 'Shape of the wave that modulates (wobbles) the main sound',
        modulationIndex: 'How much the modulator affects the sound \u2014 higher = wilder, more complex tones',
        modAttack: 'How fast the modulation effect fades in',
        modRelease: 'How long the modulation effect fades out after release',
        pitchDecay: 'How fast the pitch drops after hitting the drum \u2014 short = tight kick, long = tom',
        octaves: 'Range of the pitch sweep \u2014 higher = more dramatic pitch drop',
        frequency: 'Base pitch of the metallic tone',
        resonance: 'How ringy and resonant the metallic sound is',
        filterQ: 'Sharpness of the filter peak \u2014 higher = more resonant, nasal tone',
        filterCutoff: 'Which frequencies get through \u2014 low = dark/muffled, high = bright/open',
        filterAttack: 'How fast the filter opens when you press a key',
        filterDecay: 'How fast the filter closes back down after opening',
        filterSustain: 'How open the filter stays while a key is held',
        filterRelease: 'How long the filter takes to close after releasing a key',
        noiseType: 'Color of the noise \u2014 white is hissy, pink is balanced, brown is rumbly',
        attackNoise: 'Amount of initial pluck brightness \u2014 higher = more pick attack',
        dampening: 'How quickly the high frequencies die out \u2014 low = muffled, high = bright',
        vibratoAmount: 'How much the pitch wobbles \u2014 higher = more wobble',
        vibratoRate: 'Speed of the pitch wobble \u2014 slow = gentle sway, fast = tremolo',
        voice0Type: 'Wave shape for the first voice layer',
        voice1Type: 'Wave shape for the second voice layer'
    };

    const controlSets = {
        'Synth': [
            { name: 'Oscillator Type', id: 'oscType', type: 'wave', values: extendedWaveforms, default: 'sine' },
            { name: 'Attack', id: 'attack', min: 0, max: 2, step: 0.01, default: 0.05, suffix: 's' },
            { name: 'Decay', id: 'decay', min: 0, max: 2, step: 0.01, default: 0.1, suffix: 's' },
            { name: 'Sustain', id: 'sustain', min: 0, max: 1, step: 0.01, default: 0.3 },
            { name: 'Release', id: 'release', min: 0, max: 5, step: 0.01, default: 1, suffix: 's' },
            { name: 'Volume', id: 'volume', min: -60, max: 0, step: 1, default: -10, suffix: ' dB' }
        ],
        'AMSynth': [
            { name: 'Harmonicity', id: 'harmonicity', min: 0.5, max: 10, step: 0.1, default: 3 },
            { name: 'Oscillator Type', id: 'oscType', type: 'wave', values: extendedWaveforms, default: 'sine' },
            { name: 'Modulation Type', id: 'modType', type: 'wave', values: extendedWaveforms, default: 'square' },
            { name: 'Attack', id: 'attack', min: 0, max: 2, step: 0.01, default: 0.05, suffix: 's' },
            { name: 'Decay', id: 'decay', min: 0, max: 2, step: 0.01, default: 0.1, suffix: 's' },
            { name: 'Sustain', id: 'sustain', min: 0, max: 1, step: 0.01, default: 0.3 },
            { name: 'Release', id: 'release', min: 0, max: 5, step: 0.01, default: 1, suffix: 's' },
            { name: 'Mod Attack', id: 'modAttack', min: 0, max: 2, step: 0.01, default: 0.5, suffix: 's' },
            { name: 'Mod Release', id: 'modRelease', min: 0, max: 5, step: 0.01, default: 0.5, suffix: 's' }
        ],
        'FMSynth': [
            { name: 'Harmonicity', id: 'harmonicity', min: 0.5, max: 10, step: 0.1, default: 3 },
            { name: 'Modulation Index', id: 'modulationIndex', min: 0, max: 100, step: 1, default: 10 },
            { name: 'Oscillator Type', id: 'oscType', type: 'wave', values: extendedWaveforms, default: 'sine' },
            { name: 'Modulation Type', id: 'modType', type: 'wave', values: extendedWaveforms, default: 'square' },
            { name: 'Attack', id: 'attack', min: 0, max: 2, step: 0.01, default: 0.05, suffix: 's' },
            { name: 'Decay', id: 'decay', min: 0, max: 2, step: 0.01, default: 0.1, suffix: 's' },
            { name: 'Sustain', id: 'sustain', min: 0, max: 1, step: 0.01, default: 0.3 },
            { name: 'Release', id: 'release', min: 0, max: 5, step: 0.01, default: 1, suffix: 's' },
            { name: 'Mod Attack', id: 'modAttack', min: 0, max: 2, step: 0.01, default: 0.2, suffix: 's' },
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
            { name: 'Attack', id: 'attack', min: 0, max: 2, step: 0.01, default: 0.05, suffix: 's' },
            { name: 'Decay', id: 'decay', min: 0, max: 2, step: 0.01, default: 0.1, suffix: 's' },
            { name: 'Sustain', id: 'sustain', min: 0, max: 1, step: 0.01, default: 0.9 },
            { name: 'Release', id: 'release', min: 0, max: 5, step: 0.01, default: 1, suffix: 's' },
            { name: 'Filter Attack', id: 'filterAttack', min: 0, max: 2, step: 0.01, default: 0.06, suffix: 's' },
            { name: 'Filter Decay', id: 'filterDecay', min: 0, max: 2, step: 0.01, default: 0.2, suffix: 's' },
            { name: 'Filter Sustain', id: 'filterSustain', min: 0, max: 1, step: 0.01, default: 0.5 },
            { name: 'Filter Release', id: 'filterRelease', min: 0, max: 5, step: 0.01, default: 2, suffix: 's' }
        ],
        'NoiseSynth': [
            { name: 'Noise Type', id: 'noiseType', type: 'wave', values: ['white', 'brown', 'pink'], default: 'white' },
            { name: 'Attack', id: 'attack', min: 0, max: 2, step: 0.01, default: 0.05, suffix: 's' },
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
            { name: 'Attack', id: 'attack', min: 0, max: 2, step: 0.01, default: 0.05, suffix: 's' },
            { name: 'Decay', id: 'decay', min: 0, max: 2, step: 0.01, default: 0.1, suffix: 's' },
            { name: 'Sustain', id: 'sustain', min: 0, max: 1, step: 0.01, default: 0.3 },
            { name: 'Release', id: 'release', min: 0, max: 5, step: 0.01, default: 1, suffix: 's' }
        ],
        'DuoSynth': [
            { name: 'Vibrato Amount', id: 'vibratoAmount', min: 0, max: 1, step: 0.01, default: 0.5 },
            { name: 'Vibrato Rate', id: 'vibratoRate', min: 0, max: 20, step: 0.1, default: 5, suffix: ' Hz' },
            { name: 'Harmonicity', id: 'harmonicity', min: 0.5, max: 10, step: 0.1, default: 1.5 },
            { name: 'Voice 0 Osc', id: 'voice0Type', type: 'wave', values: extendedWaveforms, default: 'sine' },
            { name: 'Voice 1 Osc', id: 'voice1Type', type: 'wave', values: extendedWaveforms, default: 'sine' },
            { name: 'Attack', id: 'attack', min: 0, max: 2, step: 0.01, default: 0.05, suffix: 's' },
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
                </div>
                ${desc ? `<p class="control-hint">${desc}</p>` : ''}
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
                </div>
                ${desc ? `<p class="control-hint">${desc}</p>` : ''}
                <input type="range"
                       id="${uniqueId}"
                       data-control="${control.id}"
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
}

// Update slider track fill to reflect current value
function updateSliderFill(slider) {
    const min = parseFloat(slider.min);
    const max = parseFloat(slider.max);
    const val = parseFloat(slider.value);
    const percent = ((val - min) / (max - min)) * 100;
    slider.style.setProperty('--fill-percent', `${percent}%`);
}

function updateSynthParameter(param, value) {
    if (!synth) return;

    try {
        switch(param) {
            case 'oscType':
                if (currentInstrumentType === 'PolySynth') {
                    synth.set({ oscillator: { type: value } });
                } else {
                    synth.oscillator.type = value;
                }
                break;
            case 'modType':
                if (synth.modulation) synth.modulation.type = value;
                break;
            case 'noiseType':
                if (synth.noise) synth.noise.type = value;
                break;
            case 'voice0Type':
                if (synth.voice0) synth.voice0.oscillator.type = value;
                break;
            case 'voice1Type':
                if (synth.voice1) synth.voice1.oscillator.type = value;
                break;
            case 'attack':
                if (currentInstrumentType === 'PolySynth') {
                    synth.set({ envelope: { attack: value } });
                } else if (synth.voice0) {
                    synth.voice0.envelope.attack = value;
                    synth.voice1.envelope.attack = value;
                } else {
                    synth.envelope.attack = value;
                }
                break;
            case 'decay':
                if (currentInstrumentType === 'PolySynth') {
                    synth.set({ envelope: { decay: value } });
                } else if (synth.voice0) {
                    synth.voice0.envelope.decay = value;
                    synth.voice1.envelope.decay = value;
                } else {
                    synth.envelope.decay = value;
                }
                break;
            case 'sustain':
                if (currentInstrumentType === 'PolySynth') {
                    synth.set({ envelope: { sustain: value } });
                } else if (synth.voice0) {
                    synth.voice0.envelope.sustain = value;
                    synth.voice1.envelope.sustain = value;
                } else {
                    synth.envelope.sustain = value;
                }
                break;
            case 'release':
                if (currentInstrumentType === 'PolySynth') {
                    synth.set({ envelope: { release: value } });
                } else if (synth.voice0) {
                    synth.voice0.envelope.release = value;
                    synth.voice1.envelope.release = value;
                } else {
                    synth.envelope.release = value;
                }
                break;
            case 'modAttack':
                if (synth.modulationEnvelope) synth.modulationEnvelope.attack = value;
                break;
            case 'modRelease':
                if (synth.modulationEnvelope) synth.modulationEnvelope.release = value;
                break;
            case 'harmonicity':
                synth.harmonicity.value = value;
                break;
            case 'modulationIndex':
                synth.modulationIndex.value = value;
                break;
            case 'pitchDecay':
                if (synth.pitchDecay !== undefined) synth.pitchDecay = value;
                break;
            case 'octaves':
                if (synth.octaves !== undefined) synth.octaves = value;
                break;
            case 'frequency':
                if (synth.frequency) synth.frequency.value = value;
                break;
            case 'resonance':
                if (synth.resonance !== undefined) synth.resonance = value;
                break;
            case 'filterQ':
                if (synth.filter) synth.filter.Q.value = value;
                break;
            case 'filterCutoff':
                if (synth.filter) synth.filter.frequency.value = value;
                break;
            case 'filterAttack':
                if (synth.filterEnvelope) synth.filterEnvelope.attack = value;
                break;
            case 'filterDecay':
                if (synth.filterEnvelope) synth.filterEnvelope.decay = value;
                break;
            case 'filterSustain':
                if (synth.filterEnvelope) synth.filterEnvelope.sustain = value;
                break;
            case 'filterRelease':
                if (synth.filterEnvelope) synth.filterEnvelope.release = value;
                break;
            case 'attackNoise':
                if (synth.attackNoise !== undefined) synth.attackNoise = value;
                break;
            case 'dampening':
                if (synth.dampening !== undefined) synth.dampening = value;
                break;
            case 'vibratoAmount':
                if (synth.vibratoAmount) synth.vibratoAmount.value = value;
                break;
            case 'vibratoRate':
                if (synth.vibratoRate) synth.vibratoRate.value = value;
                break;
            case 'volume':
                synth.volume.value = value;
                break;
        }
    } catch (error) {
        console.log('Parameter update error:', error);
    }
}

// Create keyboard
function createKeyboard() {
    const keyboard = document.getElementById('keyboard');
    keyboard.innerHTML = '';

    const keys = keyboardLayouts[userLayout];
    const notes = [
        { note: `C${currentOctave}`, white: true, label: 'C', key: keys[0] },
        { note: `C#${currentOctave}`, white: false, label: 'C#', key: keys[1] },
        { note: `D${currentOctave}`, white: true, label: 'D', key: keys[2] },
        { note: `D#${currentOctave}`, white: false, label: 'D#', key: keys[3] },
        { note: `E${currentOctave}`, white: true, label: 'E', key: keys[4] },
        { note: `F${currentOctave}`, white: true, label: 'F', key: keys[5] },
        { note: `F#${currentOctave}`, white: false, label: 'F#', key: keys[6] },
        { note: `G${currentOctave}`, white: true, label: 'G', key: keys[7] },
        { note: `G#${currentOctave}`, white: false, label: 'G#', key: keys[8] },
        { note: `A${currentOctave}`, white: true, label: 'A', key: keys[9] },
        { note: `A#${currentOctave}`, white: false, label: 'A#', key: keys[10] },
        { note: `B${currentOctave}`, white: true, label: 'B', key: keys[11] },
        { note: `C${currentOctave + 1}`, white: true, label: 'C', key: keys[12] }
    ];

    notes.forEach((n, i) => {
        const keyEl = document.createElement('div');
        keyEl.className = n.white ? 'key' : 'key black';
        keyEl.dataset.note = n.note;
        keyEl.dataset.keyboardKey = n.key;
        keyEl.innerHTML = `
            <span class="keyboard-key-label">${n.key.toUpperCase()}</span>
            <span class="note-label">${n.label}</span>
        `;

        // Accessibility
        keyEl.setAttribute('role', 'button');
        const noteOctave = i === notes.length - 1 ? currentOctave + 1 : currentOctave;
        keyEl.setAttribute('aria-label', `${n.label.replace('#', ' sharp')} octave ${noteOctave}`);
        keyEl.setAttribute('tabindex', '0');

        // Mouse handlers
        keyEl.addEventListener('mousedown', () => {
            playNote(n.note);
            keyEl.classList.add('pressed');
        });
        keyEl.addEventListener('mouseup', () => {
            keyEl.classList.remove('pressed');
            stopNote(n.note);
        });
        keyEl.addEventListener('mouseleave', () => {
            keyEl.classList.remove('pressed');
            stopNote(n.note);
        });

        // Keyboard activation (Enter/Space) for accessibility
        keyEl.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                playNote(n.note);
                keyEl.classList.add('pressed');
            }
        });
        keyEl.addEventListener('keyup', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                keyEl.classList.remove('pressed');
                stopNote(n.note);
            }
        });

        keyboard.appendChild(keyEl);
    });

    // Initialize mobile touch handling (only once)
    enhanceMobileTouchHandling();
}

function playNote(note) {
    if (!synth) return;

    document.getElementById('currentNote').textContent = note;

    try {
        if (currentInstrumentType === 'NoiseSynth') {
            synth.triggerAttack();
        } else if (currentInstrumentType === 'MetalSynth') {
            synth.triggerAttack();
        } else {
            synth.triggerAttack(note);
        }
    } catch (error) {
        console.log('Play error:', error);
    }
}

function stopNote(note) {
    if (!synth) return;

    try {
        if (currentInstrumentType === 'PolySynth' && note) {
            // Release specific note for polyphonic synth
            synth.triggerRelease(note);
        } else if (activeKeys.size === 0 && activeTouches.size === 0) {
            // Only release mono synths when all keys/touches are up
            synth.triggerRelease();
        }
    } catch (error) {
        console.log('Release error:', error);
    }

    if (activeKeys.size === 0 && activeTouches.size === 0) {
        document.getElementById('currentNote').textContent = '\u2014';
    }
}

// Effect controls — guarded against pre-init access
document.getElementById('reverb').addEventListener('input', (e) => {
    const value = parseFloat(e.target.value);
    document.getElementById('reverbValue').textContent = value;
    if (reverb) reverb.wet.value = value;
    updateSliderFill(e.target);
});

document.getElementById('delayTime').addEventListener('input', (e) => {
    const value = parseFloat(e.target.value);
    document.getElementById('delayTimeValue').textContent = value + 's';
    if (delay) delay.delayTime.value = value;
    updateSliderFill(e.target);
});

document.getElementById('delayFeedback').addEventListener('input', (e) => {
    const value = parseFloat(e.target.value);
    document.getElementById('delayFeedbackValue').textContent = value;
    if (delay) delay.feedback.value = value;
    updateSliderFill(e.target);
});

document.getElementById('distortion').addEventListener('input', (e) => {
    const value = parseFloat(e.target.value);
    document.getElementById('distortionValue').textContent = value;
    if (distortion) {
        distortion.distortion = value;
        distortion.wet.value = value > 0 ? 0.5 : 0;
    }
    updateSliderFill(e.target);
});

document.getElementById('filterFreq').addEventListener('input', (e) => {
    const value = parseFloat(e.target.value);
    document.getElementById('filterFreqValue').textContent = value + ' Hz';
    if (filter) filter.frequency.value = value;
    updateSliderFill(e.target);
});

document.getElementById('chorusRate').addEventListener('input', (e) => {
    const value = parseFloat(e.target.value);
    document.getElementById('chorusRateValue').textContent = value + ' Hz';
    if (chorus) chorus.frequency.value = value;
    updateSliderFill(e.target);
});

// Initialize slider fills for static effects sliders
document.querySelectorAll('.effect-controls input[type="range"]').forEach(updateSliderFill);

// Instrument selector
document.getElementById('instrumentType').addEventListener('change', (e) => {
    initSynth(e.target.value);
    e.target.blur();
});

// Octave controls
document.getElementById('octaveUp').addEventListener('click', () => {
    if (currentOctave < maxOctave) {
        currentOctave++;
        document.getElementById('currentOctave').textContent = currentOctave;
        createKeyboard();
        updateOctaveButtons();
        if (window.innerWidth <= 768) {
            centerKeyboard();
        }
    }
});

document.getElementById('octaveDown').addEventListener('click', () => {
    if (currentOctave > minOctave) {
        currentOctave--;
        document.getElementById('currentOctave').textContent = currentOctave;
        createKeyboard();
        updateOctaveButtons();
        if (window.innerWidth <= 768) {
            centerKeyboard();
        }
    }
});

// Keyboard shortcuts for octave changes — only when no form control is focused
document.addEventListener('keydown', (e) => {
    if (e.repeat) return;

    const key = e.key.toLowerCase();
    const tag = document.activeElement?.tagName;
    const isFormControl = tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA';

    // Octave controls — skip if a form control is focused
    if (key === 'arrowleft' && !isFormControl) {
        e.preventDefault();
        if (currentOctave > minOctave) {
            currentOctave--;
            document.getElementById('currentOctave').textContent = currentOctave;
            createKeyboard();
            updateOctaveButtons();
        }
        return;
    } else if (key === 'arrowright' && !isFormControl) {
        e.preventDefault();
        if (currentOctave < maxOctave) {
            currentOctave++;
            document.getElementById('currentOctave').textContent = currentOctave;
            createKeyboard();
            updateOctaveButtons();
        }
        return;
    }

    // Note playing — only block if focused on a select or text input (where letter keys have native behavior)
    if (tag === 'SELECT' || tag === 'TEXTAREA' || (tag === 'INPUT' && document.activeElement.type !== 'range')) return;

    const keyElement = document.querySelector(`[data-keyboard-key="${key}"]`);
    if (keyElement && !activeKeys.has(key)) {
        activeKeys.add(key);
        const note = keyElement.dataset.note;
        playNote(note);
        keyElement.classList.add('pressed');
    }
});

document.addEventListener('keyup', (e) => {
    const key = e.key.toLowerCase();

    if (key === 'arrowleft' || key === 'arrowright') return;

    const keyElement = document.querySelector(`[data-keyboard-key="${key}"]`);
    if (keyElement && activeKeys.has(key)) {
        const note = keyElement.dataset.note;
        activeKeys.delete(key);
        keyElement.classList.remove('pressed');
        stopNote(note);
    }
});

// Keyboard layout selector
document.getElementById('keyboardLayout').addEventListener('change', (e) => {
    userLayout = e.target.value;
    localStorage.setItem('keyboardLayout', userLayout);
    createKeyboard();
    e.target.blur();
});

// Initialize
async function init() {
    try {
        await Tone.start();
        initEffects();
        initSynth('Synth');

        userLayout = detectKeyboardLayout();
        document.getElementById('keyboardLayout').value = userLayout;

        createKeyboard();
        audioInitialized = true;

        // Hide overlay
        const overlay = document.getElementById('audioOverlay');
        if (overlay) {
            overlay.classList.add('hidden');
            overlay.addEventListener('transitionend', () => overlay.remove(), { once: true });
        }
    } catch (error) {
        console.error('Audio initialization failed:', error);
        const overlay = document.getElementById('audioOverlay');
        if (overlay) {
            const content = overlay.querySelector('.audio-overlay-content p');
            if (content) {
                content.textContent = 'Audio could not start. Try a different browser or check sound settings.';
                content.style.color = '#ff4444';
            }
        }
    }
}

// Start on overlay click
const audioOverlay = document.getElementById('audioOverlay');
if (audioOverlay) {
    audioOverlay.addEventListener('click', () => {
        if (!audioInitialized) init();
    });
}

// Also allow any click if overlay was somehow missed
document.body.addEventListener('click', () => {
    if (!audioInitialized) init();
}, { once: true });

// Register Service Worker for PWA
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('service-worker.js')
            .then(registration => {
                // Listen for updates
                registration.addEventListener('updatefound', () => {
                    const newWorker = registration.installing;
                    newWorker.addEventListener('statechange', () => {
                        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                            newWorker.postMessage('SKIP_WAITING');
                        }
                    });
                });
            })
            .catch(error => {
                console.log('Service Worker registration failed:', error);
            });
    });
}

// PWA Install prompt
let deferredPrompt;
const installBtn = document.getElementById('installBtn');

window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    installBtn.style.display = 'inline-block';
});

installBtn.addEventListener('click', async () => {
    if (!deferredPrompt) return;

    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    console.log(`User response to install prompt: ${outcome}`);
    deferredPrompt = null;
    installBtn.style.display = 'none';
});

window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    installBtn.style.display = 'none';
});

/* ============================================
   ENHANCED MOBILE TOUCH OPTIMIZATION
   ============================================ */

// Multi-touch state management
const activeTouches = new Map();
let isPlayingNotes = false;

// Configuration
const touchConfig = {
    slideGestureEnabled: true,
    hapticDuration: 15,
    touchMoveThreshold: 5
};

// Update octave button states
function updateOctaveButtons() {
    const octaveUpBtn = document.getElementById('octaveUp');
    const octaveDownBtn = document.getElementById('octaveDown');

    if (octaveUpBtn && octaveDownBtn) {
        octaveUpBtn.disabled = currentOctave >= maxOctave;
        octaveDownBtn.disabled = currentOctave <= minOctave;
        octaveUpBtn.setAttribute('aria-disabled', currentOctave >= maxOctave);
        octaveDownBtn.setAttribute('aria-disabled', currentOctave <= minOctave);
    }
}

// Scroll indicator management
function updateScrollIndicators() {
    const keyboard = document.getElementById('keyboard');
    const leftIndicator = document.getElementById('scrollIndicatorLeft');
    const rightIndicator = document.getElementById('scrollIndicatorRight');

    if (!keyboard || !leftIndicator || !rightIndicator) return;

    const { scrollLeft, scrollWidth, clientWidth } = keyboard;
    const maxScroll = scrollWidth - clientWidth;

    if (scrollLeft <= 5) {
        leftIndicator.classList.add('hidden');
    } else {
        leftIndicator.classList.remove('hidden');
    }

    if (scrollLeft >= maxScroll - 5) {
        rightIndicator.classList.add('hidden');
    } else {
        rightIndicator.classList.remove('hidden');
    }
}

// Center keyboard to middle key — using double RAF instead of setTimeout
function centerKeyboard() {
    const keyboard = document.getElementById('keyboard');
    if (!keyboard) return;

    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            const middleKey = keyboard.querySelector(`[data-note="E${currentOctave}"]`);
            if (middleKey) {
                middleKey.scrollIntoView({
                    behavior: 'smooth',
                    block: 'nearest',
                    inline: 'center'
                });
            }
        });
    });
}

// Stable touch handler references (hoisted to avoid listener accumulation)
function handleTouchStart(e) {
    e.preventDefault();
    e.stopPropagation();

    isPlayingNotes = true;

    Array.from(e.changedTouches).forEach(touch => {
        const element = document.elementFromPoint(touch.clientX, touch.clientY);
        const key = element?.closest('.key');

        if (key && !activeTouches.has(touch.identifier)) {
            const note = key.dataset.note;

            activeTouches.set(touch.identifier, {
                key: key.dataset.note,
                note: note,
                element: key,
                startX: touch.clientX,
                startY: touch.clientY
            });

            playNote(note);
            key.classList.add('pressed');

            if (navigator.vibrate) {
                navigator.vibrate(touchConfig.hapticDuration);
            }
        }
    });
}

function handleTouchMove(e) {
    if (!touchConfig.slideGestureEnabled) return;

    e.preventDefault();

    Array.from(e.changedTouches).forEach(touch => {
        const touchData = activeTouches.get(touch.identifier);
        if (!touchData) return;

        const deltaX = Math.abs(touch.clientX - touchData.startX);
        const deltaY = Math.abs(touch.clientY - touchData.startY);

        if (deltaX > touchConfig.touchMoveThreshold || deltaY > touchConfig.touchMoveThreshold) {
            const element = document.elementFromPoint(touch.clientX, touch.clientY);
            const newKey = element?.closest('.key');

            if (newKey && newKey !== touchData.element) {
                const oldNote = touchData.note;
                const newNote = newKey.dataset.note;

                touchData.element.classList.remove('pressed');

                // Release old note for PolySynth before playing new one
                if (currentInstrumentType === 'PolySynth') {
                    try { synth.triggerRelease(oldNote); } catch(err) { /* ignore */ }
                }

                touchData.element = newKey;
                touchData.note = newNote;
                touchData.key = newKey.dataset.note;

                playNote(newNote);
                newKey.classList.add('pressed');

                if (navigator.vibrate) {
                    navigator.vibrate(8);
                }
            }
        }
    });
}

function handleTouchEnd(e) {
    e.preventDefault();

    Array.from(e.changedTouches).forEach(touch => {
        const touchData = activeTouches.get(touch.identifier);

        if (touchData) {
            touchData.element.classList.remove('pressed');
            activeTouches.delete(touch.identifier);
            stopNote(touchData.note);
        }
    });

    if (activeTouches.size === 0) {
        isPlayingNotes = false;
    }
}

function handleTouchCancel(e) {
    e.preventDefault();

    Array.from(e.changedTouches).forEach(touch => {
        const touchData = activeTouches.get(touch.identifier);

        if (touchData) {
            touchData.element.classList.remove('pressed');
            activeTouches.delete(touch.identifier);
            stopNote(touchData.note);
        }
    });

    if (activeTouches.size === 0) {
        isPlayingNotes = false;
    }
}

// Enhanced mobile touch handling — attaches listeners once
function enhanceMobileTouchHandling() {
    const keyboard = document.getElementById('keyboard');
    if (!keyboard || keyboard.dataset.touchHandled) return;
    keyboard.dataset.touchHandled = 'true';

    keyboard.addEventListener('touchstart', handleTouchStart, { passive: false });
    keyboard.addEventListener('touchmove', handleTouchMove, { passive: false });
    keyboard.addEventListener('touchend', handleTouchEnd, { passive: false });
    keyboard.addEventListener('touchcancel', handleTouchCancel, { passive: false });
    keyboard.addEventListener('contextmenu', (e) => e.preventDefault());

    if (window.innerWidth <= 768) {
        updateScrollIndicators();

        let scrollTimeout;
        keyboard.addEventListener('scroll', () => {
            if (!scrollTimeout) {
                scrollTimeout = setTimeout(() => {
                    updateScrollIndicators();
                    scrollTimeout = null;
                }, 100);
            }
        }, { passive: true });

        centerKeyboard();
    }

    const keyboardSection = document.querySelector('.keyboard-section');
    if (keyboardSection) {
        let savedScrollY = 0;
        keyboardSection.addEventListener('touchstart', () => {
            savedScrollY = window.scrollY;
            document.body.style.top = `-${savedScrollY}px`;
            document.body.classList.add('keyboard-active');
        }, { passive: true });

        keyboardSection.addEventListener('touchend', () => {
            document.body.classList.remove('keyboard-active');
            document.body.style.top = '';
            window.scrollTo(0, savedScrollY);
        }, { passive: true });
    }

    updateOctaveButtons();
}

// Prevent zoom on double-tap — scoped to keyboard only
const keyboardEl = document.getElementById('keyboard');
if (keyboardEl) {
    let lastTouchEnd = 0;
    keyboardEl.addEventListener('touchend', (e) => {
        const now = Date.now();
        if (now - lastTouchEnd <= 300) {
            e.preventDefault();
        }
        lastTouchEnd = now;
    }, { passive: false });
}
