// Initialize audio context
let synth = null;
let reverb, delay, distortion, filter, chorus;
let currentInstrumentType = 'Synth';
let currentOctave = 4;
let minOctave = 0;
let maxOctave = 8;
let activeKeys = new Set(); // Track which keys are currently pressed
let userLayout = 'qwerty'; // Default layout

// Keyboard layouts
const keyboardLayouts = {
    qwerty: ['a', 'w', 's', 'e', 'd', 'f', 't', 'g', 'y', 'h', 'u', 'j', 'k'],
    azerty: ['q', 'z', 's', 'e', 'd', 'f', 't', 'g', 'y', 'h', 'u', 'j', 'k'],
    qwertz: ['a', 'w', 's', 'e', 'd', 'f', 't', 'g', 'z', 'h', 'u', 'j', 'k'],
    dvorak: ['a', ',', 'o', 'e', '.', 'u', 'k', 'i', 'x', 'd', 'b', 'h', 'n']
};

// Detect user's keyboard layout (approximate detection)
function detectKeyboardLayout() {
    // This is a simplified detection. In reality, browser APIs don't give us direct access to keyboard layout.
    // We'll provide a selector for users to choose their layout.
    const savedLayout = localStorage.getItem('keyboardLayout');
    if (savedLayout && keyboardLayouts[savedLayout]) {
        return savedLayout;
    }
    return 'qwerty'; // Default
}

// Initialize effects
function initEffects() {
    reverb = new Tone.Reverb({ decay: 1.5, wet: 0.3 }).toDestination();
    delay = new Tone.FeedbackDelay({ delayTime: 0.25, feedback: 0.3, wet: 0.3 }).connect(reverb);
    distortion = new Tone.Distortion({ distortion: 0, wet: 0 }).connect(delay);
    filter = new Tone.Filter({ frequency: 1000, type: 'lowpass' }).connect(distortion);
    chorus = new Tone.Chorus({ frequency: 1.5, delayTime: 3.5, depth: 0.7, wet: 0.3 }).connect(filter);
    chorus.start();
}

// Initialize synth
function initSynth(type) {
    if (synth) {
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

    // All available waveforms in Tone.js
    const allWaveforms = ['sine', 'square', 'triangle', 'sawtooth', 'pulse', 'pwm'];
    const extendedWaveforms = [...allWaveforms, 'sine2', 'sine3', 'sine4', 'sine5', 'sine6', 'sine7', 'sine8', 
                                'square2', 'square3', 'square4', 'square5', 'square6', 'square7', 'square8',
                                'triangle2', 'triangle3', 'triangle4', 'triangle5', 'triangle6', 'triangle7', 'triangle8',
                                'sawtooth2', 'sawtooth3', 'sawtooth4', 'sawtooth5', 'sawtooth6', 'sawtooth7', 'sawtooth8'];

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
            { name: 'Polyphony', id: 'polyphony', min: 1, max: 32, step: 1, default: 4 },
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

    controls.forEach(control => {
        const controlGroup = document.createElement('div');
        controlGroup.className = 'control-group';

        if (control.type === 'wave') {
            controlGroup.innerHTML = `
                <div class="control-label">
                    <span>${control.name}</span>
                </div>
                <select class="wave-select" data-control="${control.id}">
                    ${control.values.map(val => 
                        `<option value="${val}" ${val === control.default ? 'selected' : ''}>${val}</option>`
                    ).join('')}
                </select>
            `;
        } else {
            controlGroup.innerHTML = `
                <div class="control-label">
                    <span>${control.name}</span>
                    <span class="control-value" id="${control.id}Value">${control.default}${control.suffix || ''}</span>
                </div>
                <input type="range" 
                       id="${control.id}" 
                       min="${control.min}" 
                       max="${control.max}" 
                       step="${control.step}" 
                       value="${control.default}">
            `;
        }

        controlsDiv.appendChild(controlGroup);
    });

    // Add event listeners
    controls.forEach(control => {
        if (control.type === 'wave') {
            const select = document.querySelector(`[data-control="${control.id}"]`);
            select.addEventListener('change', (e) => {
                updateSynthParameter(control.id, e.target.value);
            });
        } else {
            const slider = document.getElementById(control.id);
            const valueDisplay = document.getElementById(`${control.id}Value`);
            
            slider.addEventListener('input', (e) => {
                const value = parseFloat(e.target.value);
                valueDisplay.textContent = value + (control.suffix || '');
                updateSynthParameter(control.id, value);
            });
        }
    });
}

function updateSynthParameter(param, value) {
    if (!synth) return;

    try {
        switch(param) {
            case 'oscType':
                synth.oscillator.type = value;
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
                synth.envelope.attack = value;
                if (synth.voice0) {
                    synth.voice0.envelope.attack = value;
                    synth.voice1.envelope.attack = value;
                }
                break;
            case 'decay':
                synth.envelope.decay = value;
                if (synth.voice0) {
                    synth.voice0.envelope.decay = value;
                    synth.voice1.envelope.decay = value;
                }
                break;
            case 'sustain':
                synth.envelope.sustain = value;
                if (synth.voice0) {
                    synth.voice0.envelope.sustain = value;
                    synth.voice1.envelope.sustain = value;
                }
                break;
            case 'release':
                synth.envelope.release = value;
                if (synth.voice0) {
                    synth.voice0.envelope.release = value;
                    synth.voice1.envelope.release = value;
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
            case 'polyphony':
                // Polyphony can't be changed dynamically, requires reinit
                break;
        }
    } catch (error) {
        console.log('Parameter update error:', error);
    }
}

// Create keyboard
function createKeyboard() {
    const keyboard = document.getElementById('keyboard');
    keyboard.innerHTML = ''; // Clear existing keys
    
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

    notes.forEach(n => {
        const keyEl = document.createElement('div');
        keyEl.className = n.white ? 'key' : 'key black';
        keyEl.dataset.note = n.note;
        keyEl.dataset.keyboardKey = n.key;
        keyEl.innerHTML = `
            <span class="keyboard-key-label">${n.key.toUpperCase()}</span>
            <span class="note-label">${n.label}</span>
        `;

        // Accessibility attributes
        keyEl.setAttribute('role', 'button');
        keyEl.setAttribute('aria-label', `${n.label.replace('#', ' sharp')} octave ${currentOctave}`);
        keyEl.setAttribute('tabindex', '0');

        keyEl.addEventListener('mousedown', () => {
            playNote(n.note);
            keyEl.classList.add('pressed');
        });
        keyEl.addEventListener('mouseup', () => {
            stopNote();
            keyEl.classList.remove('pressed');
        });
        keyEl.addEventListener('mouseleave', () => {
            stopNote();
            keyEl.classList.remove('pressed');
        });

        keyboard.appendChild(keyEl);
    });

    // Initialize mobile touch handling
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

function stopNote() {
    if (!synth) return;
    
    setTimeout(() => {
        document.getElementById('currentNote').textContent = '—';
    }, 100);
    
    try {
        synth.triggerRelease();
    } catch (error) {
        console.log('Release error:', error);
    }
}

// Effect controls
document.getElementById('reverb').addEventListener('input', (e) => {
    const value = parseFloat(e.target.value);
    document.getElementById('reverbValue').textContent = value;
    reverb.wet.value = value;
});

document.getElementById('delayTime').addEventListener('input', (e) => {
    const value = parseFloat(e.target.value);
    document.getElementById('delayTimeValue').textContent = value + 's';
    delay.delayTime.value = value;
});

document.getElementById('delayFeedback').addEventListener('input', (e) => {
    const value = parseFloat(e.target.value);
    document.getElementById('delayFeedbackValue').textContent = value;
    delay.feedback.value = value;
});

document.getElementById('distortion').addEventListener('input', (e) => {
    const value = parseFloat(e.target.value);
    document.getElementById('distortionValue').textContent = value;
    distortion.distortion = value;
    distortion.wet.value = value > 0 ? 0.5 : 0;
});

document.getElementById('filterFreq').addEventListener('input', (e) => {
    const value = parseFloat(e.target.value);
    document.getElementById('filterFreqValue').textContent = value + ' Hz';
    filter.frequency.value = value;
});

document.getElementById('chorusRate').addEventListener('input', (e) => {
    const value = parseFloat(e.target.value);
    document.getElementById('chorusRateValue').textContent = value + ' Hz';
    chorus.frequency.value = value;
});

// Instrument selector
document.getElementById('instrumentType').addEventListener('change', (e) => {
    initSynth(e.target.value);
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

// Keyboard shortcuts for octave changes
document.addEventListener('keydown', (e) => {
    // Prevent repeat firing when holding down a key
    if (e.repeat) return;
    
    const key = e.key.toLowerCase();
    
    // Octave controls - using only arrow keys to avoid conflicts
    if (key === 'arrowleft') {
        if (currentOctave > minOctave) {
            currentOctave--;
            document.getElementById('currentOctave').textContent = currentOctave;
            createKeyboard();
            updateOctaveButtons();
        }
        return;
    } else if (key === 'arrowright') {
        if (currentOctave < maxOctave) {
            currentOctave++;
            document.getElementById('currentOctave').textContent = currentOctave;
            createKeyboard();
            updateOctaveButtons();
        }
        return;
    }
    
    // Find the key element that corresponds to this keyboard key
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
    
    // Don't process octave keys
    if (key === 'arrowleft' || key === 'arrowright') return;
    
    const keyElement = document.querySelector(`[data-keyboard-key="${key}"]`);
    if (keyElement && activeKeys.has(key)) {
        activeKeys.delete(key);
        stopNote();
        keyElement.classList.remove('pressed');
    }
});

// Keyboard layout selector
document.getElementById('keyboardLayout').addEventListener('change', (e) => {
    userLayout = e.target.value;
    localStorage.setItem('keyboardLayout', userLayout);
    createKeyboard();
});

// Initialize
async function init() {
    await Tone.start();
    initEffects();
    initSynth('Synth');
    
    // Set user's keyboard layout
    userLayout = detectKeyboardLayout();
    document.getElementById('keyboardLayout').value = userLayout;
    
    createKeyboard();
}

// Start on user interaction
document.body.addEventListener('click', init, { once: true });

// Register Service Worker for PWA
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('service-worker.js')
            .then(registration => {
                console.log('Service Worker registered successfully:', registration.scope);
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
    // Prevent the mini-infobar from appearing on mobile
    e.preventDefault();
    // Stash the event so it can be triggered later
    deferredPrompt = e;
    
    // Show install button
    installBtn.style.display = 'inline-block';
});

installBtn.addEventListener('click', async () => {
    if (!deferredPrompt) {
        return;
    }
    
    // Show the install prompt
    deferredPrompt.prompt();
    
    // Wait for the user to respond to the prompt
    const { outcome } = await deferredPrompt.userChoice;
    console.log(`User response to install prompt: ${outcome}`);
    
    // Clear the deferredPrompt for next time
    deferredPrompt = null;
    installBtn.style.display = 'none';
});

window.addEventListener('appinstalled', () => {
    console.log('PWA installed successfully');
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

// Center keyboard to middle key
function centerKeyboard() {
    const keyboard = document.getElementById('keyboard');
    if (!keyboard) return;

    setTimeout(() => {
        const middleKey = keyboard.querySelector(`[data-note="E${currentOctave}"]`);
        if (middleKey) {
            middleKey.scrollIntoView({
                behavior: 'smooth',
                block: 'nearest',
                inline: 'center'
            });
        }
    }, 100);
}

// Enhanced mobile touch handling
function enhanceMobileTouchHandling() {
    const keyboard = document.getElementById('keyboard');
    if (!keyboard) return;

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
                    const newNote = newKey.dataset.note;

                    touchData.element.classList.remove('pressed');

                    // Legato transition - no audio gap
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
                stopNote();
                touchData.element.classList.remove('pressed');
                activeTouches.delete(touch.identifier);
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
                stopNote();
                touchData.element.classList.remove('pressed');
                activeTouches.delete(touch.identifier);
            }
        });

        if (activeTouches.size === 0) {
            isPlayingNotes = false;
        }
    }

    keyboard.addEventListener('touchstart', handleTouchStart, { passive: false });
    keyboard.addEventListener('touchmove', handleTouchMove, { passive: false });
    keyboard.addEventListener('touchend', handleTouchEnd, { passive: false });
    keyboard.addEventListener('touchcancel', handleTouchCancel, { passive: false });
    keyboard.addEventListener('contextmenu', (e) => e.preventDefault());

    if (window.innerWidth <= 768) {
        updateScrollIndicators();

        // Throttled scroll listener for performance
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
        keyboardSection.addEventListener('touchstart', () => {
            document.body.classList.add('keyboard-active');
        }, { passive: true });

        keyboardSection.addEventListener('touchend', () => {
            document.body.classList.remove('keyboard-active');
        }, { passive: true });
    }

    updateOctaveButtons();
}

// Prevent zoom on double-tap for iOS
let lastTouchEnd = 0;
document.addEventListener('touchend', (e) => {
    const now = Date.now();
    if (now - lastTouchEnd <= 300) {
        e.preventDefault();
    }
    lastTouchEnd = now;
}, { passive: false });
