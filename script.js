// CRT static snow — pauses when tab is hidden
(function() {
    const canvas = document.getElementById('crtStatic');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const W = 512;
    const H = 512;
    canvas.width = W;
    canvas.height = H;
    const imageData = ctx.createImageData(W, H);
    const data = imageData.data;
    let rafId = null;

    function renderStatic() {
        for (let i = 0; i < data.length; i += 4) {
            const v = Math.random() * 255 | 0;
            data[i] = v;
            data[i + 1] = v;
            data[i + 2] = v;
            data[i + 3] = 255;
        }
        ctx.putImageData(imageData, 0, 0);
        rafId = requestAnimationFrame(renderStatic);
    }

    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            cancelAnimationFrame(rafId);
            rafId = null;
        } else if (!rafId) {
            renderStatic();
        }
    });

    renderStatic();
})();

// Initialize audio context
let synth = null;
let reverb, delay, distortion, filter, chorus, limiter;
let currentInstrumentType = 'Synth';
let currentOctave = 4;
let minOctave = 0;
let maxOctave = 7;
let activeKeys = new Set();
let userLayout = 'qwerty';
let noteNotation = localStorage.getItem('noteNotation') || 'english';
let audioInitialized = false;

// Keyboard layouts — 2 octaves (25 notes: C to C)
// Bottom row = octave 1, top row = octave 2
const keyboardLayouts = {
    qwerty: ['a','w','s','e','d','f','t','g','y','h','u','j','k','o','l','p',';','\'','[',']'],
    azerty: ['q','z','s','e','d','f','t','g','y','h','u','j','k','o','l','p','m','ù','^','$'],
    qwertz: ['a','w','s','e','d','f','t','g','z','h','u','j','k','o','l','p','ö','ä','ü','+'],
    dvorak: ['a',',','o','e','.','u','k','i','x','d','b','h','n','l','s',';','q','j','w','v']
};

// Map physical key codes to layout characters for dead keys
const deadKeyCodeMap = {
    'BracketLeft': '^',
    'BracketRight': '$'
};

// Note display labels by notation system
const noteLabels = {
    english: { 'C': 'C', 'C#': 'C#', 'D': 'D', 'D#': 'D#', 'E': 'E', 'F': 'F', 'F#': 'F#', 'G': 'G', 'G#': 'G#', 'A': 'A', 'A#': 'A#', 'B': 'B' },
    solfege: { 'C': 'Do', 'C#': 'Do#', 'D': 'Ré', 'D#': 'Ré#', 'E': 'Mi', 'F': 'Fa', 'F#': 'Fa#', 'G': 'Sol', 'G#': 'Sol#', 'A': 'La', 'A#': 'La#', 'B': 'Si' }
};

function getDisplayLabel(noteLabel) {
    return noteLabels[noteNotation]?.[noteLabel] || noteLabel;
}

// Detect user's keyboard layout
function detectKeyboardLayout() {
    const savedLayout = localStorage.getItem('keyboardLayout');
    if (savedLayout && keyboardLayouts[savedLayout]) {
        return savedLayout;
    }
    return 'qwerty';
}

// Initialize effects
// Chain: Synth → Chorus → Filter → Distortion → Delay → Reverb → Limiter → Destination
function initEffects() {
    // Brick-wall limiter so stacked chords, distortion and hot presets never clip the output.
    limiter = new Tone.Limiter(-1).toDestination();
    reverb = new Tone.Reverb({ decay: EFFECT_DEFAULTS.reverbSize, preDelay: 0.02, wet: EFFECT_DEFAULTS.reverb }).connect(limiter);
    delay = new Tone.FeedbackDelay({ delayTime: EFFECT_DEFAULTS.delayTime, feedback: EFFECT_DEFAULTS.delayFeedback, wet: EFFECT_DEFAULTS.delayMix }).connect(reverb);
    // 2x oversampling tames the aliasing fizz of the waveshaper at high drive.
    distortion = new Tone.Distortion({ distortion: 0, oversample: '2x', wet: 0 }).connect(delay);
    filter = new Tone.Filter({ frequency: EFFECT_DEFAULTS.filterFreq, type: 'lowpass' }).connect(distortion);
    chorus = new Tone.Chorus({ frequency: EFFECT_DEFAULTS.chorusRate, delayTime: 3.5, depth: 0.7, wet: EFFECT_DEFAULTS.chorusMix }).connect(filter);
    chorus.start();
}

// Single source of truth for the effects rack. Every preset is resolved
// against these defaults so switching presets never leaks the previous one.
const EFFECT_DEFAULTS = {
    reverb: 0.3,
    reverbSize: 2.5,
    delayTime: 0.25,
    delayFeedback: 0.3,
    delayMix: 0.3,
    distortion: 0,
    filterFreq: 5000,
    chorusRate: 1.5,
    chorusMix: 0.3
};

// Reverb regenerates its impulse response on every decay change (async + allocation),
// so coalesce knob drags into one regeneration.
let reverbDecayTimer = null;
function setReverbDecay(seconds) {
    clearTimeout(reverbDecayTimer);
    reverbDecayTimer = setTimeout(() => { if (reverb) reverb.decay = seconds; }, 150);
}

const effectHandlers = {
    reverb:        { suffix: '',    apply: v => { if (reverb) reverb.wet.value = v; } },
    reverbSize:    { suffix: 's',   apply: v => setReverbDecay(v) },
    // Ramp instead of jump: a hard delayTime change produces a click / pitch zip.
    delayTime:     { suffix: 's',   apply: v => { if (delay) delay.delayTime.rampTo(v, 0.05); } },
    delayFeedback: { suffix: '',    apply: v => { if (delay) delay.feedback.value = v; } },
    delayMix:      { suffix: '',    apply: v => { if (delay) delay.wet.value = v; } },
    // Wet follows drive so the first few percent add warmth rather than a sudden 50% blend.
    distortion:    { suffix: '',    apply: v => { if (distortion) { distortion.distortion = v; distortion.wet.value = Math.min(1, v * 2); } } },
    filterFreq:    { suffix: ' Hz', apply: v => { if (filter) filter.frequency.rampTo(v, 0.02); } },
    chorusRate:    { suffix: ' Hz', apply: v => { if (chorus) chorus.frequency.value = v; } },
    chorusMix:     { suffix: '',    apply: v => { if (chorus) chorus.wet.value = v; } },
};

// Apply one effect value to the engine and keep the slider/knob/readout in sync.
function setEffect(key, value, { syncSlider = true } = {}) {
    const handler = effectHandlers[key];
    if (!handler) return;
    handler.apply(value);

    const display = document.getElementById(`${key}Value`);
    if (display) display.textContent = value + handler.suffix;

    const slider = document.getElementById(key);
    if (slider) {
        if (syncSlider) slider.value = value;
        slider.setAttribute('aria-valuenow', value);
        updateSliderFill(slider);
    }
}

// Initialize synth
function initSynth(type) {
    if (synth) {
        // Clear active state before disposing
        activeKeys.clear();
        activeTouches.clear();
        document.querySelectorAll('.key.pressed').forEach(k => k.classList.remove('pressed'));
        document.getElementById('currentNote').textContent = '\u2014';
        // Let the old voice ring out instead of cutting it with a click,
        // then free it once its longest plausible release tail has passed.
        const old = synth;
        try {
            if (typeof old.releaseAll === 'function') old.releaseAll();
            else if (typeof old.triggerRelease === 'function') old.triggerRelease();
        } catch (e) { /* some synths have nothing to release */ }
        setTimeout(() => old.dispose(), 2000);
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
            octaves: 1.5,
            volume: -4
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

const synthDescriptions = {
    'Synth': 'One oscillator shaped by a volume envelope \u2014 the simplest synth and the best place to learn the basics. Start with Sharp Lead, then switch Oscillator Type to hear how each wave shape changes the tone.',
    'AMSynth': 'Amplitude Modulation: a second oscillator rapidly varies the volume of the first, adding new overtones. Try Bell Tone first, then turn Harmonicity \u2014 whole numbers sound musical, in-between values ring like bells.',
    'FMSynth': 'Frequency Modulation: a second oscillator bends the pitch of the first, creating glassy, harmonically rich tones \u2014 the sound of 80s keyboards like the DX7. Start with Electric Piano, then raise Modulation Index to hear it brighten.',
    'MembraneSynth': 'A sine wave whose pitch drops fast on every hit, like a struck drum head. Load Kick Drum and play the lowest keys, then lengthen Pitch Decay to turn it into a tom or a disco syndrum.',
    'MetalSynth': 'Six clashing FM oscillators make inharmonic, metallic noise for cymbals, hats and gongs \u2014 the pitch comes from the Frequency knob, not the key you press. Try Closed Hat, then raise Decay to open it up.',
    'MonoSynth': 'One voice with a resonant filter and its own filter envelope \u2014 the classic analog bass and lead machine. Start with Acid Bass, then turn Filter Q and Filter Decay to hear the squelch change.',
    'NoiseSynth': 'Random noise shaped by an envelope \u2014 no pitch, so every key sounds the same. Try Snare Hit for percussion, then lengthen Attack and Release to turn it into wind or a riser.',
    'PluckSynth': 'Physical model of a plucked string (Karplus-Strong): a short noise burst rings through a tuned delay and fades naturally. Start with Nylon Guitar, then lower Dampening for a muted tone or raise Resonance for longer sustain.',
    'PolySynth': 'The basic synth, but able to play several notes at once \u2014 hold a few keys down to build chords. Start with Dreamy Pad and play a three-note chord, then shorten Attack to turn it into stabs.',
    'DuoSynth': 'Two voices layered with a shared vibrato \u2014 Harmonicity sets the pitch of the second voice relative to the first. Try Detune Lead first, then set Harmonicity to 1.5 or 2 to stack a fifth or an octave.'
};

const synthPresets = {
    'Synth': [
        { name: 'Sharp Lead', octave: 4, effects: { reverb: 0.2, reverbSize: 1.8, delayTime: 0.3, delayFeedback: 0.3, delayMix: 0.2, distortion: 0.1, filterFreq: 7000, chorusRate: 0.6, chorusMix: 0.15 }, params: { oscType: 'sawtooth', attack: 0.01, decay: 0.15, sustain: 0.7, release: 0.3, volume: -14 } },
        { name: 'Sub Bass', octave: 2, effects: { reverb: 0.05, reverbSize: 0.8, delayTime: 0.25, delayFeedback: 0, delayMix: 0, distortion: 0, filterFreq: 3000, chorusRate: 1.5, chorusMix: 0 }, params: { oscType: 'sine', attack: 0.01, decay: 0.2, sustain: 0.8, release: 0.25, volume: -8 } },
        { name: 'Soft Flute', octave: 4, effects: { reverb: 0.4, reverbSize: 3, delayTime: 0.35, delayFeedback: 0.25, delayMix: 0.15, distortion: 0, filterFreq: 4000, chorusRate: 4.5, chorusMix: 0.25 }, params: { oscType: 'triangle', attack: 0.12, decay: 0.2, sustain: 0.7, release: 0.6, volume: -10 } },
        { name: 'Chip Square', octave: 4, effects: { reverb: 0.1, reverbSize: 1, delayTime: 0.18, delayFeedback: 0.35, delayMix: 0.25, distortion: 0, filterFreq: 8000, chorusRate: 1.5, chorusMix: 0 }, params: { oscType: 'square', attack: 0, decay: 0.05, sustain: 0.8, release: 0.1, volume: -16 } },
    ],
    'AMSynth': [
        { name: 'Bell Tone', octave: 5, effects: { reverb: 0.45, reverbSize: 4, delayTime: 0.375, delayFeedback: 0.3, delayMix: 0.2, distortion: 0, filterFreq: 9000, chorusRate: 0.5, chorusMix: 0.1 }, params: { harmonicity: 3.5, oscType: 'sine', modType: 'sine', attack: 0.001, decay: 1.8, sustain: 0, release: 2.5, modAttack: 0, modRelease: 1.5 } },
        { name: 'Reed Organ', octave: 3, effects: { reverb: 0.3, reverbSize: 2.2, delayTime: 0.25, delayFeedback: 0, delayMix: 0, distortion: 0.05, filterFreq: 5000, chorusRate: 5.5, chorusMix: 0.35 }, params: { harmonicity: 2, oscType: 'sine', modType: 'square', attack: 0.03, decay: 0.1, sustain: 0.9, release: 0.3, modAttack: 0.01, modRelease: 0.3 } },
        { name: 'Growl Bass', octave: 2, effects: { reverb: 0.1, reverbSize: 1.2, delayTime: 0.25, delayFeedback: 0, delayMix: 0, distortion: 0.25, filterFreq: 1800, chorusRate: 1.5, chorusMix: 0 }, params: { harmonicity: 0.5, oscType: 'sawtooth', modType: 'sine', attack: 0.01, decay: 0.3, sustain: 0.7, release: 0.3, modAttack: 0.4, modRelease: 0.5 } },
        { name: 'Swell Pad', octave: 3, effects: { reverb: 0.55, reverbSize: 6, delayTime: 0.45, delayFeedback: 0.35, delayMix: 0.2, distortion: 0, filterFreq: 3500, chorusRate: 0.4, chorusMix: 0.5 }, params: { harmonicity: 1.5, oscType: 'triangle', modType: 'sine', attack: 1.2, decay: 0.5, sustain: 0.8, release: 3.5, modAttack: 1.5, modRelease: 3 } },
    ],
    'FMSynth': [
        { name: 'Electric Piano', octave: 3, effects: { reverb: 0.25, reverbSize: 2, delayTime: 0.3, delayFeedback: 0.2, delayMix: 0.12, distortion: 0, filterFreq: 4500, chorusRate: 1.2, chorusMix: 0.2 }, params: { harmonicity: 3, modulationIndex: 10, oscType: 'sine', modType: 'sine', attack: 0.005, decay: 1.6, sustain: 0.1, release: 1.2, modAttack: 0.005, modRelease: 0.4 } },
        { name: 'Glass Bell', octave: 5, effects: { reverb: 0.45, reverbSize: 5, delayTime: 0.4, delayFeedback: 0.35, delayMix: 0.2, distortion: 0, filterFreq: 9000, chorusRate: 0.5, chorusMix: 0.15 }, params: { harmonicity: 3.5, modulationIndex: 12, oscType: 'sine', modType: 'sine', attack: 0.001, decay: 2, sustain: 0, release: 3, modAttack: 0, modRelease: 2 } },
        { name: 'DX Bass', octave: 2, effects: { reverb: 0.05, reverbSize: 0.8, delayTime: 0.25, delayFeedback: 0, delayMix: 0, distortion: 0.15, filterFreq: 2500, chorusRate: 1.5, chorusMix: 0 }, params: { harmonicity: 1, modulationIndex: 4, oscType: 'sine', modType: 'sine', attack: 0.005, decay: 0.35, sustain: 0.5, release: 0.2, modAttack: 0.005, modRelease: 0.2 } },
        { name: 'Sci-Fi Laser', octave: 4, effects: { reverb: 0.35, reverbSize: 3, delayTime: 0.22, delayFeedback: 0.55, delayMix: 0.35, distortion: 0.05, filterFreq: 9000, chorusRate: 5, chorusMix: 0.2 }, params: { harmonicity: 7, modulationIndex: 40, oscType: 'sine', modType: 'sawtooth', attack: 0.001, decay: 0.4, sustain: 0.2, release: 1.5, modAttack: 0.3, modRelease: 1.2 } },
    ],
    'MembraneSynth': [
        { name: 'Kick Drum', octave: 1, effects: { reverb: 0.05, reverbSize: 0.5, delayTime: 0, delayFeedback: 0, delayMix: 0, distortion: 0.08, filterFreq: 4000, chorusRate: 1.5, chorusMix: 0 }, params: { pitchDecay: 0.04, octaves: 6, oscType: 'sine', attack: 0.001, decay: 0.45, sustain: 0.01, release: 0.4 } },
        { name: 'Floor Tom', octave: 2, effects: { reverb: 0.25, reverbSize: 1.8, delayTime: 0, delayFeedback: 0, delayMix: 0, distortion: 0, filterFreq: 5000, chorusRate: 1.5, chorusMix: 0 }, params: { pitchDecay: 0.1, octaves: 3, oscType: 'sine', attack: 0.001, decay: 0.7, sustain: 0.02, release: 0.8 } },
        { name: 'Syndrum', octave: 3, effects: { reverb: 0.3, reverbSize: 2.5, delayTime: 0.3, delayFeedback: 0.35, delayMix: 0.25, distortion: 0, filterFreq: 6000, chorusRate: 1.5, chorusMix: 0 }, params: { pitchDecay: 0.25, octaves: 2.5, oscType: 'triangle', attack: 0.001, decay: 0.6, sustain: 0, release: 0.4 } },
        { name: '808 Sub', octave: 1, effects: { reverb: 0.03, reverbSize: 0.5, delayTime: 0, delayFeedback: 0, delayMix: 0, distortion: 0.3, filterFreq: 1200, chorusRate: 1.5, chorusMix: 0 }, params: { pitchDecay: 0.02, octaves: 3, oscType: 'sine', attack: 0.001, decay: 1.8, sustain: 0.3, release: 2.5 } },
    ],
    'MetalSynth': [
        { name: 'Closed Hat', octave: 4, effects: { reverb: 0.08, reverbSize: 0.6, delayTime: 0, delayFeedback: 0, delayMix: 0, distortion: 0, filterFreq: 10000, chorusRate: 1.5, chorusMix: 0 }, params: { frequency: 400, harmonicity: 5.1, modulationIndex: 32, resonance: 7000, octaves: 1, attack: 0.001, decay: 0.08, release: 0.03 } },
        { name: 'Open Hat', octave: 4, effects: { reverb: 0.15, reverbSize: 1, delayTime: 0, delayFeedback: 0, delayMix: 0, distortion: 0, filterFreq: 10000, chorusRate: 1.5, chorusMix: 0 }, params: { frequency: 400, harmonicity: 5.1, modulationIndex: 32, resonance: 6000, octaves: 1.5, attack: 0.001, decay: 0.5, release: 0.2 } },
        { name: 'Crash', octave: 4, effects: { reverb: 0.35, reverbSize: 3, delayTime: 0, delayFeedback: 0, delayMix: 0, distortion: 0, filterFreq: 10000, chorusRate: 1.5, chorusMix: 0 }, params: { frequency: 300, harmonicity: 8, modulationIndex: 40, resonance: 5000, octaves: 2, attack: 0.001, decay: 2.5, release: 1.5 } },
        { name: 'Gong', octave: 3, effects: { reverb: 0.5, reverbSize: 7, delayTime: 0, delayFeedback: 0, delayMix: 0, distortion: 0, filterFreq: 4000, chorusRate: 0.3, chorusMix: 0.3 }, params: { frequency: 90, harmonicity: 2.3, modulationIndex: 15, resonance: 700, octaves: 1, attack: 0.01, decay: 4.5, release: 3 } },
    ],
    'MonoSynth': [
        { name: 'Acid Bass', octave: 2, effects: { reverb: 0.08, reverbSize: 1, delayTime: 0.19, delayFeedback: 0.3, delayMix: 0.15, distortion: 0.3, filterFreq: 6000, chorusRate: 1.5, chorusMix: 0 }, params: { oscType: 'sawtooth', filterQ: 10, filterCutoff: 600, attack: 0.005, decay: 0.2, sustain: 0.5, release: 0.1, filterAttack: 0.005, filterDecay: 0.2, filterSustain: 0.1, filterRelease: 0.2 } },
        { name: 'Thick Lead', octave: 4, effects: { reverb: 0.25, reverbSize: 2.2, delayTime: 0.3, delayFeedback: 0.35, delayMix: 0.22, distortion: 0.12, filterFreq: 7000, chorusRate: 0.8, chorusMix: 0.2 }, params: { oscType: 'square', filterQ: 2, filterCutoff: 3000, attack: 0.02, decay: 0.2, sustain: 0.85, release: 0.3, filterAttack: 0.03, filterDecay: 0.4, filterSustain: 0.6, filterRelease: 0.5 } },
        { name: 'Wah Bass', octave: 2, effects: { reverb: 0.1, reverbSize: 1.2, delayTime: 0.25, delayFeedback: 0, delayMix: 0, distortion: 0.1, filterFreq: 4000, chorusRate: 1.5, chorusMix: 0 }, params: { oscType: 'sawtooth', filterQ: 8, filterCutoff: 400, attack: 0.01, decay: 0.3, sustain: 0.7, release: 0.2, filterAttack: 0.12, filterDecay: 0.45, filterSustain: 0.2, filterRelease: 0.4 } },
        { name: 'Muted Pluck', octave: 3, effects: { reverb: 0.3, reverbSize: 2.5, delayTime: 0.28, delayFeedback: 0.4, delayMix: 0.3, distortion: 0, filterFreq: 6000, chorusRate: 0.7, chorusMix: 0.15 }, params: { oscType: 'square', filterQ: 4, filterCutoff: 1500, attack: 0.001, decay: 0.25, sustain: 0, release: 0.2, filterAttack: 0.001, filterDecay: 0.12, filterSustain: 0, filterRelease: 0.2 } },
    ],
    'NoiseSynth': [
        { name: 'Snare Hit', octave: 4, effects: { reverb: 0.2, reverbSize: 0.9, delayTime: 0, delayFeedback: 0, delayMix: 0, distortion: 0.1, filterFreq: 8000, chorusRate: 1.5, chorusMix: 0 }, params: { noiseType: 'white', attack: 0.001, decay: 0.18, sustain: 0, release: 0.1 } },
        { name: 'Hand Clap', octave: 4, effects: { reverb: 0.25, reverbSize: 1, delayTime: 0.011, delayFeedback: 0.35, delayMix: 0.5, distortion: 0, filterFreq: 3500, chorusRate: 1.5, chorusMix: 0 }, params: { noiseType: 'white', attack: 0.001, decay: 0.12, sustain: 0, release: 0.08 } },
        { name: 'Wind Gust', octave: 4, effects: { reverb: 0.5, reverbSize: 5, delayTime: 0.4, delayFeedback: 0.3, delayMix: 0.15, distortion: 0, filterFreq: 1200, chorusRate: 0.3, chorusMix: 0.6 }, params: { noiseType: 'pink', attack: 0.8, decay: 0.5, sustain: 0.6, release: 2.5 } },
        { name: 'Hiss Riser', octave: 4, effects: { reverb: 0.45, reverbSize: 4, delayTime: 0.25, delayFeedback: 0.5, delayMix: 0.25, distortion: 0, filterFreq: 9000, chorusRate: 2, chorusMix: 0.3 }, params: { noiseType: 'white', attack: 2, decay: 0.1, sustain: 1, release: 2.5 } },
    ],
    'PluckSynth': [
        { name: 'Nylon Guitar', octave: 3, effects: { reverb: 0.25, reverbSize: 2, delayTime: 0.3, delayFeedback: 0.2, delayMix: 0.1, distortion: 0, filterFreq: 6000, chorusRate: 0.8, chorusMix: 0.1 }, params: { attackNoise: 1.5, dampening: 3000, resonance: 0.92 } },
        { name: 'Harp', octave: 4, effects: { reverb: 0.5, reverbSize: 4.5, delayTime: 0.4, delayFeedback: 0.25, delayMix: 0.15, distortion: 0, filterFreq: 9000, chorusRate: 0.6, chorusMix: 0.15 }, params: { attackNoise: 0.6, dampening: 6500, resonance: 0.97 } },
        { name: 'Banjo', octave: 4, effects: { reverb: 0.12, reverbSize: 1.2, delayTime: 0.25, delayFeedback: 0, delayMix: 0, distortion: 0, filterFreq: 8000, chorusRate: 1.5, chorusMix: 0 }, params: { attackNoise: 6, dampening: 5000, resonance: 0.82 } },
        { name: 'Pluck Bass', octave: 2, effects: { reverb: 0.05, reverbSize: 0.8, delayTime: 0.25, delayFeedback: 0, delayMix: 0, distortion: 0.1, filterFreq: 2500, chorusRate: 1.5, chorusMix: 0 }, params: { attackNoise: 2, dampening: 1200, resonance: 0.85 } },
    ],
    'PolySynth': [
        { name: 'Dreamy Pad', octave: 3, effects: { reverb: 0.5, reverbSize: 6, delayTime: 0.45, delayFeedback: 0.35, delayMix: 0.2, distortion: 0, filterFreq: 3000, chorusRate: 0.5, chorusMix: 0.55 }, params: { oscType: 'triangle', attack: 1.2, decay: 0.5, sustain: 0.8, release: 4 } },
        { name: 'Synth Brass', octave: 3, effects: { reverb: 0.25, reverbSize: 2, delayTime: 0.2, delayFeedback: 0.2, delayMix: 0.1, distortion: 0.05, filterFreq: 4500, chorusRate: 1, chorusMix: 0.3 }, params: { oscType: 'sawtooth', attack: 0.05, decay: 0.25, sustain: 0.6, release: 0.4 } },
        { name: 'Organ', octave: 3, effects: { reverb: 0.3, reverbSize: 2.2, delayTime: 0.25, delayFeedback: 0, delayMix: 0, distortion: 0.08, filterFreq: 5000, chorusRate: 6, chorusMix: 0.3 }, params: { oscType: 'square6', attack: 0.01, decay: 0.05, sustain: 1, release: 0.15 } },
        { name: 'Glass Keys', octave: 4, effects: { reverb: 0.4, reverbSize: 3.5, delayTime: 0.3, delayFeedback: 0.3, delayMix: 0.18, distortion: 0, filterFreq: 9000, chorusRate: 0.8, chorusMix: 0.2 }, params: { oscType: 'triangle', attack: 0.005, decay: 0.8, sustain: 0.1, release: 2 } },
    ],
    'DuoSynth': [
        { name: 'Detune Lead', octave: 4, effects: { reverb: 0.2, reverbSize: 2, delayTime: 0.3, delayFeedback: 0.35, delayMix: 0.22, distortion: 0.1, filterFreq: 6500, chorusRate: 0.5, chorusMix: 0.15 }, params: { vibratoAmount: 0.1, vibratoRate: 5.5, harmonicity: 1.01, voice0Type: 'sawtooth', voice1Type: 'sawtooth', attack: 0.02, decay: 0.15, sustain: 0.8, release: 0.4 } },
        { name: 'Lush Pad', octave: 3, effects: { reverb: 0.5, reverbSize: 6, delayTime: 0.45, delayFeedback: 0.35, delayMix: 0.18, distortion: 0, filterFreq: 3000, chorusRate: 0.4, chorusMix: 0.55 }, params: { vibratoAmount: 0.12, vibratoRate: 3.5, harmonicity: 2, voice0Type: 'sawtooth', voice1Type: 'triangle', attack: 0.9, decay: 0.4, sustain: 0.8, release: 3.5 } },
        { name: 'Power Fifths', octave: 3, effects: { reverb: 0.2, reverbSize: 1.8, delayTime: 0.2, delayFeedback: 0.2, delayMix: 0.1, distortion: 0.25, filterFreq: 4500, chorusRate: 1, chorusMix: 0.15 }, params: { vibratoAmount: 0.05, vibratoRate: 5, harmonicity: 1.5, voice0Type: 'sawtooth', voice1Type: 'square', attack: 0.02, decay: 0.2, sustain: 0.7, release: 0.5 } },
        { name: 'Alien Voice', octave: 4, effects: { reverb: 0.4, reverbSize: 4, delayTime: 0.25, delayFeedback: 0.55, delayMix: 0.3, distortion: 0.05, filterFreq: 5000, chorusRate: 3, chorusMix: 0.3 }, params: { vibratoAmount: 0.8, vibratoRate: 9, harmonicity: 3, voice0Type: 'square', voice1Type: 'sine', attack: 0.1, decay: 0.4, sustain: 0.6, release: 1.5 } },
    ]
};

function applyPreset(type, presetIndex) {
    const preset = synthPresets[type]?.[presetIndex];
    if (!preset) return;

    // Apply each param to the synth engine and update UI controls
    const controlsDiv = document.getElementById('controls');
    for (const [param, value] of Object.entries(preset.params)) {
        updateSynthParameter(param, value);

        const el = controlsDiv.querySelector(`[data-control="${param}"]`);
        if (!el) continue;

        if (el.tagName === 'SELECT') {
            el.value = value;
        } else {
            el.value = value;
            const valueDisplay = document.getElementById(`${el.id}Value`);
            if (valueDisplay) {
                // Extract suffix from current display text (e.g. "s", " Hz", " dB")
                const suffix = valueDisplay.textContent.replace(/^[\d.\-]+/, '');
                valueDisplay.textContent = value + suffix;
            }
            el.setAttribute('aria-valuenow', value);
            updateSliderFill(el);
        }
    }

    // Set octave if preset specifies one
    if (preset.octave !== undefined && preset.octave !== currentOctave) {
        currentOctave = preset.octave;
        document.getElementById('currentOctave').textContent = currentOctave;
        createKeyboard();
        updateOctaveButtons();
    }

    // Apply the full effects rack: keys the preset omits fall back to defaults,
    // so every preset sounds the same regardless of what was selected before.
    const fx = { ...EFFECT_DEFAULTS, ...(preset.effects || {}) };
    for (const key of Object.keys(effectHandlers)) {
        setEffect(key, fx[key]);
    }

    // Update active preset button
    document.querySelectorAll('.preset-btn').forEach(btn => btn.classList.remove('active'));
    const activeBtn = document.querySelector(`.preset-btn[data-preset="${presetIndex}"]`);
    if (activeBtn) activeBtn.classList.add('active');
}

function updatePresetBar(type) {
    const bar = document.getElementById('presetBar');
    bar.innerHTML = '';

    const presets = synthPresets[type];
    if (!presets) return;

    const label = document.createElement('span');
    label.className = 'preset-label';
    label.textContent = 'Presets:';
    bar.appendChild(label);

    presets.forEach((preset, i) => {
        const btn = document.createElement('button');
        btn.className = 'preset-btn';
        btn.textContent = preset.name;
        btn.dataset.preset = i;
        btn.addEventListener('click', () => applyPreset(type, i));
        bar.appendChild(btn);
    });
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

// Update slider track fill to reflect current value
function updateSliderFill(slider) {
    const min = parseFloat(slider.min);
    const max = parseFloat(slider.max);
    const val = parseFloat(slider.value);
    const percent = ((val - min) / (max - min)) * 100;
    slider.style.setProperty('--fill-percent', `${percent}%`);
    // Sync knob if it exists
    const knob = slider.parentElement?.querySelector('.knob-container');
    if (knob) updateKnobVisual(knob, percent / 100);
}

// --- Knob system ---
const KNOB_ARC_START = 225; // degrees from top, clockwise — bottom-left
const KNOB_ARC_END = 495;   // 225 + 270 — bottom-right
const KNOB_ARC_RANGE = 270;
const KNOB_RADIUS = 28;
const KNOB_CENTER = 36;

function createKnobSVG(percent) {
    const ns = 'http://www.w3.org/2000/svg';
    const container = document.createElement('div');
    container.className = 'knob-container';
    container.title = 'Drag up/down to adjust \u2022 Double-click to reset';

    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('class', 'knob-svg');
    svg.setAttribute('viewBox', '0 0 72 72');

    // Arc helper: angle in degrees (0 = top) to SVG coords
    function polarToCart(angleDeg, r) {
        const rad = (angleDeg - 90) * Math.PI / 180;
        return { x: KNOB_CENTER + r * Math.cos(rad), y: KNOB_CENTER + r * Math.sin(rad) };
    }

    // Track arc (background)
    const trackStart = polarToCart(KNOB_ARC_START, KNOB_RADIUS);
    const trackEnd = polarToCart(KNOB_ARC_END, KNOB_RADIUS);
    const track = document.createElementNS(ns, 'path');
    track.setAttribute('class', 'knob-track');
    track.setAttribute('d', `M${trackStart.x},${trackStart.y} A${KNOB_RADIUS},${KNOB_RADIUS} 0 1,1 ${trackEnd.x},${trackEnd.y}`);
    svg.appendChild(track);

    // Notches at 0%, 25%, 50%, 75%, 100%
    for (let i = 0; i <= 4; i++) {
        const angle = KNOB_ARC_START + (KNOB_ARC_RANGE * i / 4);
        const inner = polarToCart(angle, KNOB_RADIUS + 2);
        const outer = polarToCart(angle, KNOB_RADIUS + 6);
        const notch = document.createElementNS(ns, 'line');
        notch.setAttribute('class', 'knob-notch');
        notch.setAttribute('x1', inner.x);
        notch.setAttribute('y1', inner.y);
        notch.setAttribute('x2', outer.x);
        notch.setAttribute('y2', outer.y);
        svg.appendChild(notch);
    }

    // Fill arc (value)
    const fill = document.createElementNS(ns, 'path');
    fill.setAttribute('class', 'knob-fill');
    fill.setAttribute('data-knob-fill', '');
    svg.appendChild(fill);

    // Knob body
    const body = document.createElementNS(ns, 'circle');
    body.setAttribute('class', 'knob-body');
    body.setAttribute('cx', KNOB_CENTER);
    body.setAttribute('cy', KNOB_CENTER);
    body.setAttribute('r', KNOB_RADIUS - 6);
    svg.appendChild(body);

    // Indicator line
    const indicator = document.createElementNS(ns, 'line');
    indicator.setAttribute('class', 'knob-indicator');
    indicator.setAttribute('data-knob-indicator', '');
    svg.appendChild(indicator);

    container.appendChild(svg);
    updateKnobVisual(container, percent);
    return container;
}

function updateKnobVisual(container, percent) {
    const ns = 'http://www.w3.org/2000/svg';
    const clamped = Math.max(0, Math.min(1, percent));

    function polarToCart(angleDeg, r) {
        const rad = (angleDeg - 90) * Math.PI / 180;
        return { x: KNOB_CENTER + r * Math.cos(rad), y: KNOB_CENTER + r * Math.sin(rad) };
    }

    // Update fill arc
    const fill = container.querySelector('[data-knob-fill]');
    if (fill) {
        if (clamped <= 0.001) {
            fill.setAttribute('d', '');
        } else {
            const startAngle = KNOB_ARC_START;
            const endAngle = KNOB_ARC_START + KNOB_ARC_RANGE * clamped;
            const start = polarToCart(startAngle, KNOB_RADIUS);
            const end = polarToCart(endAngle, KNOB_RADIUS);
            const largeArc = (endAngle - startAngle) > 180 ? 1 : 0;
            fill.setAttribute('d', `M${start.x},${start.y} A${KNOB_RADIUS},${KNOB_RADIUS} 0 ${largeArc},1 ${end.x},${end.y}`);
        }
    }

    // Update indicator line
    const indicator = container.querySelector('[data-knob-indicator]');
    if (indicator) {
        const angle = KNOB_ARC_START + KNOB_ARC_RANGE * clamped;
        const inner = polarToCart(angle, 8);
        const outer = polarToCart(angle, KNOB_RADIUS - 8);
        indicator.setAttribute('x1', inner.x);
        indicator.setAttribute('y1', inner.y);
        indicator.setAttribute('x2', outer.x);
        indicator.setAttribute('y2', outer.y);
    }
}

function attachKnobToSlider(slider) {
    const min = parseFloat(slider.min);
    const max = parseFloat(slider.max);
    const step = parseFloat(slider.step) || 1;
    const val = parseFloat(slider.value);
    const percent = (val - min) / (max - min);

    const knob = createKnobSVG(percent);
    slider.parentElement.insertBefore(knob, slider.nextSibling);

    // AbortController to clean up document-level listeners on rebuild
    const controller = new AbortController();
    knob._dragController = controller;

    let dragging = false;
    let startY = 0;
    let startValue = 0;

    function onStart(e) {
        dragging = true;
        startY = e.type.startsWith('touch') ? e.touches[0].clientY : e.clientY;
        startValue = parseFloat(slider.value);
        document.body.style.cursor = 'grabbing';
        e.preventDefault();
    }

    function onMove(e) {
        if (!dragging) return;
        const clientY = e.type.startsWith('touch') ? e.touches[0].clientY : e.clientY;
        const deltaY = startY - clientY; // up = positive
        const range = max - min;
        const sensitivity = range / 150; // full range in ~150px drag
        let newVal = startValue + deltaY * sensitivity;
        newVal = Math.round(newVal / step) * step;
        newVal = Math.max(min, Math.min(max, newVal));

        slider.value = newVal;
        slider.dispatchEvent(new Event('input', { bubbles: true }));
    }

    function onEnd() {
        if (!dragging) return;
        dragging = false;
        document.body.style.cursor = '';
    }

    knob.addEventListener('mousedown', onStart);
    knob.addEventListener('touchstart', onStart, { passive: false });
    document.addEventListener('mousemove', onMove, { signal: controller.signal });
    document.addEventListener('touchmove', onMove, { passive: false, signal: controller.signal });
    document.addEventListener('mouseup', onEnd, { signal: controller.signal });
    document.addEventListener('touchend', onEnd, { signal: controller.signal });

    // Double-click to reset to default
    knob.addEventListener('dblclick', () => {
        const defaultVal = slider.dataset.defaultValue;
        if (defaultVal !== undefined) {
            slider.value = defaultVal;
            slider.dispatchEvent(new Event('input', { bubbles: true }));
        }
    });
}

function attachKnobsToAll() {
    document.querySelectorAll('input[type="range"]').forEach(slider => {
        if (!slider.parentElement.querySelector('.knob-container')) {
            attachKnobToSlider(slider);
        }
    });
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
    const notePattern = [
        { label: 'C', white: true },
        { label: 'C#', white: false },
        { label: 'D', white: true },
        { label: 'D#', white: false },
        { label: 'E', white: true },
        { label: 'F', white: true },
        { label: 'F#', white: false },
        { label: 'G', white: true },
        { label: 'G#', white: false },
        { label: 'A', white: true },
        { label: 'A#', white: false },
        { label: 'B', white: true },
    ];

    const isMobile = window.innerWidth <= 768;
    const octaveCount = isMobile ? 1 : 2;
    const notes = [];
    let keyIndex = 0;
    for (let oct = 0; oct < octaveCount; oct++) {
        const octNum = currentOctave + oct;
        for (let i = 0; i < 12 && keyIndex < keys.length; i++, keyIndex++) {
            notes.push({ note: `${notePattern[i].label}${octNum}`, white: notePattern[i].white, label: notePattern[i].label, key: keys[keyIndex] });
        }
    }

    notes.forEach((n, i) => {
        const keyEl = document.createElement('div');
        keyEl.className = n.white ? 'key' : 'key black';
        keyEl.dataset.note = n.note;
        keyEl.dataset.keyboardKey = n.key;
        keyEl.innerHTML = `
            <span class="keyboard-key-label">${n.key.toUpperCase()}</span>
            <span class="note-label">${getDisplayLabel(n.label)}</span>
        `;

        // Accessibility
        keyEl.setAttribute('role', 'button');
        const noteOctave = n.note.match(/\d+/)[0];
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

// Tone.js envelopes refuse two attacks at the exact same time, which happens when
// two keys land in the same audio quantum (chords on a mono synth, fast trills).
// Hand each trigger a strictly increasing timestamp instead of dropping the note.
let lastTriggerTime = 0;
function nextTriggerTime() {
    const t = Math.max(Tone.now(), lastTriggerTime + 0.002);
    lastTriggerTime = t;
    return t;
}

function playNote(note) {
    if (!synth) return;

    // Display note in chosen notation (e.g. "C#4" → "Do#4")
    const noteName = note.replace(/\d+/, '');
    const octaveNum = note.match(/\d+/)?.[0] || '';
    document.getElementById('currentNote').textContent = getDisplayLabel(noteName) + octaveNum;

    const trigger = (time) => {
        if (currentInstrumentType === 'NoiseSynth') {
            synth.triggerAttack(time);
        } else if (currentInstrumentType === 'MetalSynth') {
            // MetalSynth inherits Monophonic.triggerAttack(note, time): the note sets
            // its base frequency. Pass the Frequency knob's value so the pitch stays
            // on the knob and every key fires the same hit. Its envelope has no
            // sustain, so the hit decays on its own and needs no release.
            synth.triggerAttack(synth.frequency.value, time);
        } else {
            synth.triggerAttack(note, time);
        }
    };

    try {
        trigger(nextTriggerTime());
    } catch (error) {
        // Tone refuses a start that lands on a previously scheduled event for the
        // same source. Nudge forward once rather than silently dropping the note.
        if (/start time/i.test(error?.message || '')) {
            try {
                lastTriggerTime += 0.01;
                trigger(nextTriggerTime());
                return;
            } catch (retryError) {
                error = retryError;
            }
        }
        console.log('Play error:', error);
    }
}

function stopNote(note) {
    if (!synth) return;

    try {
        if (currentInstrumentType === 'MetalSynth') {
            // MetalSynth uses triggerAttackRelease, no manual release needed
        } else if (currentInstrumentType === 'PolySynth' && note) {
            synth.triggerRelease(note);
        } else if (currentInstrumentType === 'NoiseSynth') {
            // NoiseSynth has no note concept — release when all inputs are up
            if (activeKeys.size === 0 && activeTouches.size === 0) {
                synth.triggerRelease();
            }
        } else if (activeKeys.size === 0 && activeTouches.size === 0) {
            synth.triggerRelease();
        }
    } catch (error) {
        console.log('Release error:', error);
    }

    if (activeKeys.size === 0 && activeTouches.size === 0) {
        document.getElementById('currentNote').textContent = '\u2014';
    }
}

/* ============================================
   SCOPE — oscilloscope / spectrum on the CRT
   Taps the signal after the limiter (what you actually hear).
   ============================================ */
const scope = (() => {
    const canvas = document.getElementById('scopeCanvas');
    if (!canvas) return { start() {}, setMode() {}, level: () => 0 };

    const ctx = canvas.getContext('2d');
    const WAVE_SIZE = 2048;   // samples per frame — ~46 ms at 44.1 kHz, enough for a 22 Hz period
    const FFT_SIZE = 1024;    // bins — bin width ~21.5 Hz, log axis from ~21 Hz to Nyquist
    const MIN_DB = -100;
    const MAX_DB = -10;
    const TRACE = '#00f0ff';
    const TRACE_GLOW = 'rgba(0, 240, 255, 0.55)';
    const GRID = 'rgba(0, 240, 255, 0.08)';
    const GRID_STRONG = 'rgba(0, 240, 255, 0.2)';
    const LABEL = 'rgba(160, 176, 208, 0.7)';
    const PERSISTENCE = 'rgba(10, 14, 39, 0.4)'; // bg-primary at low alpha = phosphor afterglow

    const labels = {
        wave: 'Oscilloscope showing the output waveform',
        spectrum: 'Spectrum analyser showing the output frequencies'
    };

    let waveform = null;
    let fft = null;
    let rafId = null;
    let width = 0;
    let height = 0;
    let mode = localStorage.getItem('scopeMode') === 'spectrum' ? 'spectrum' : 'wave';
    let sampleRate = 44100;
    let lastPeak = 0; // peak of the last drawn waveform frame, 0..1

    function resize() {
        const rect = canvas.getBoundingClientRect();
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        width = Math.max(1, Math.round(rect.width));
        height = Math.max(1, Math.round(rect.height));
        canvas.width = Math.round(width * dpr);
        canvas.height = Math.round(height * dpr);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.fillStyle = '#0a0e27';
        ctx.fillRect(0, 0, width, height);
    }

    // Log-frequency x position for a given Hz (spectrum mode)
    function xForHz(hz) {
        const minHz = sampleRate / (2 * FFT_SIZE); // bin 1
        const maxHz = sampleRate / 2;
        const t = (Math.log(hz) - Math.log(minHz)) / (Math.log(maxHz) - Math.log(minHz));
        return t * width;
    }

    function drawGrid() {
        ctx.lineWidth = 1;
        ctx.strokeStyle = GRID;
        ctx.beginPath();
        for (let i = 1; i < 8; i++) {
            const x = Math.round((i / 8) * width) + 0.5;
            ctx.moveTo(x, 0); ctx.lineTo(x, height);
        }
        for (let i = 1; i < 4; i++) {
            const y = Math.round((i / 4) * height) + 0.5;
            ctx.moveTo(0, y); ctx.lineTo(width, y);
        }
        ctx.stroke();

        ctx.font = '10px "Share Tech Mono", monospace';
        ctx.fillStyle = LABEL;
        ctx.textBaseline = 'bottom';

        if (mode === 'wave') {
            // Zero line
            ctx.strokeStyle = GRID_STRONG;
            ctx.beginPath();
            const mid = Math.round(height / 2) + 0.5;
            ctx.moveTo(0, mid); ctx.lineTo(width, mid);
            ctx.stroke();
            ctx.textAlign = 'left';
            ctx.fillText(`${(WAVE_SIZE / 2 / sampleRate * 1000).toFixed(0)} ms`, 4, height - 3);
        } else {
            // Frequency ticks on the log axis
            ctx.strokeStyle = GRID_STRONG;
            ctx.beginPath();
            const ticks = [['100', 100], ['1k', 1000], ['10k', 10000]];
            for (const [, hz] of ticks) {
                const x = Math.round(xForHz(hz)) + 0.5;
                ctx.moveTo(x, 0); ctx.lineTo(x, height);
            }
            ctx.stroke();
            ctx.textAlign = 'center';
            for (const [text, hz] of ticks) ctx.fillText(text, xForHz(hz), height - 3);
            ctx.textAlign = 'left';
            ctx.fillText('Hz', 4, height - 3);
        }
    }

    function drawWave() {
        const values = waveform.getValue(); // Float32Array in -1..1
        const n = values.length;
        const span = n >> 1;

        // Trigger on the first rising zero-crossing so periodic waves hold still
        // instead of scrolling. Falls back to the buffer start for noise/silence.
        let start = 0;
        for (let i = 1; i < span; i++) {
            if (values[i - 1] < 0 && values[i] >= 0) { start = i; break; }
        }

        const amp = (height / 2) * 0.9;
        const mid = height / 2;
        let peak = 0;
        ctx.beginPath();
        for (let i = 0; i < span; i++) {
            const v = values[start + i];
            if (v > peak) peak = v; else if (-v > peak) peak = -v;
            const x = (i / (span - 1)) * width;
            const y = mid - v * amp;
            if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        lastPeak = peak;
        strokeTrace();
    }

    function drawSpectrum() {
        const values = fft.getValue(); // Float32Array of dB, index = bin
        const n = values.length;
        const logMax = Math.log(n);

        ctx.beginPath();
        ctx.moveTo(0, height);
        for (let i = 1; i < n; i++) {
            const x = (Math.log(i) / logMax) * width;
            const db = Math.min(MAX_DB, Math.max(MIN_DB, values[i]));
            const y = height - ((db - MIN_DB) / (MAX_DB - MIN_DB)) * height;
            ctx.lineTo(x, y);
        }
        ctx.lineTo(width, height);

        const fill = ctx.createLinearGradient(0, 0, 0, height);
        fill.addColorStop(0, 'rgba(0, 240, 255, 0.35)');
        fill.addColorStop(1, 'rgba(0, 240, 255, 0.02)');
        ctx.fillStyle = fill;
        ctx.fill();
        strokeTrace();
    }

    function strokeTrace() {
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        // Wide, soft pass = phosphor bloom; thin, bright pass = the beam
        ctx.lineWidth = 4;
        ctx.strokeStyle = TRACE_GLOW;
        ctx.stroke();
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = TRACE;
        ctx.stroke();
    }

    function render() {
        // Fade instead of clear: previous traces linger like a real CRT phosphor
        ctx.fillStyle = PERSISTENCE;
        ctx.fillRect(0, 0, width, height);
        drawGrid();
        if (mode === 'wave') drawWave(); else drawSpectrum();
        rafId = requestAnimationFrame(render);
    }

    function stop() {
        if (rafId) cancelAnimationFrame(rafId);
        rafId = null;
    }

    function run() {
        if (!rafId && waveform) render();
    }

    function setMode(next) {
        mode = next === 'spectrum' ? 'spectrum' : 'wave';
        localStorage.setItem('scopeMode', mode);
        canvas.setAttribute('aria-label', labels[mode]);
        document.querySelectorAll('.scope-btn').forEach(btn => {
            const active = btn.dataset.scopeMode === mode;
            btn.classList.toggle('active', active);
            btn.setAttribute('aria-pressed', String(active));
        });
    }

    // Called once audio is running: tap the master bus and start drawing.
    function start(source) {
        if (waveform) return;
        sampleRate = Tone.context.sampleRate;
        waveform = new Tone.Waveform(WAVE_SIZE);
        fft = new Tone.FFT({ size: FFT_SIZE, smoothing: 0.75 });
        source.connect(waveform);
        source.connect(fft);
        resize();
        run();
    }

    document.querySelectorAll('.scope-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            setMode(btn.dataset.scopeMode);
            btn.blur();
        });
    });

    document.addEventListener('visibilitychange', () => {
        if (document.hidden) stop(); else run();
    });

    if (typeof ResizeObserver !== 'undefined') {
        new ResizeObserver(() => { if (waveform) resize(); }).observe(canvas);
    } else {
        window.addEventListener('resize', () => { if (waveform) resize(); });
    }

    setMode(mode);
    resize();
    drawGrid();

    return { start, setMode, level: () => lastPeak };
})();

// Master volume control
document.getElementById('masterVolume').addEventListener('input', (e) => {
    const value = parseInt(e.target.value);
    document.getElementById('masterVolumeValue').textContent = value + '%';
    // Map 0-100 to -Infinity..0 dB (logarithmic)
    Tone.Destination.volume.value = value === 0 ? -Infinity : -60 + (value / 100) * 60;
    updateSliderFill(e.target);
});

// Set initial master volume
function initMasterVolume() {
    const slider = document.getElementById('masterVolume');
    const value = parseInt(slider.value);
    Tone.Destination.volume.value = value === 0 ? -Infinity : -60 + (value / 100) * 60;
    updateSliderFill(slider);
}

// Effect controls — one listener per key in effectHandlers; engine calls are
// guarded against pre-init access inside each handler.
for (const key of Object.keys(effectHandlers)) {
    const slider = document.getElementById(key);
    if (!slider) continue;
    slider.addEventListener('input', (e) => {
        setEffect(key, parseFloat(e.target.value), { syncSlider: false });
    });
}

// Initialize slider fills for static effects sliders
document.querySelectorAll('.effect-controls input[type="range"]').forEach(updateSliderFill);

// Instrument selector
document.getElementById('instrumentType').addEventListener('change', (e) => {
    initSynth(e.target.value);
    e.target.blur();
});

// Attach knobs to effects sliders
attachKnobsToAll();

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

    let key = e.key.toLowerCase();
    // Resolve dead keys (e.g. ^ and $ on AZERTY) via physical key code
    if (key === 'dead' && deadKeyCodeMap[e.code]) {
        key = deadKeyCodeMap[e.code];
        e.preventDefault();
    }
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
    let key = e.key.toLowerCase();
    if (key === 'dead' && deadKeyCodeMap[e.code]) {
        key = deadKeyCodeMap[e.code];
    }

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

// Note notation selector
document.getElementById('noteNotation').value = noteNotation;
document.getElementById('noteNotation').addEventListener('change', (e) => {
    noteNotation = e.target.value;
    localStorage.setItem('noteNotation', noteNotation);
    createKeyboard();
    e.target.blur();
});

// Initialize
let audioInitStarted = false;
async function init() {
    // The overlay click also bubbles to the body fallback listener below, so
    // guard here or the whole audio chain gets built twice.
    if (audioInitStarted) return;
    audioInitStarted = true;
    try {
        await Tone.start();
        initEffects();
        scope.start(limiter);
        initMasterVolume();
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
        audioInitStarted = false; // allow another tap to retry
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
    // Reload once when a *new* worker takes over so the page runs the assets
    // that worker just precached. Skipped on first install (no previous
    // controller) so the initial visit is not interrupted.
    const hadController = Boolean(navigator.serviceWorker.controller);
    let reloading = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (!hadController || reloading) return;
        reloading = true;
        window.location.reload();
    });

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

    // Body scroll lock removed — single-octave mobile keyboard with
    // touch-action: none on keys prevents unwanted page scroll.

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
