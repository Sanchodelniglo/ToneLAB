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
let reverb, delay, distortion, filter, chorus;
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
            octaves: 1.5,
            volume: 15
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
    'Synth': 'Basic single-oscillator synthesizer. A great starting point \u2014 clean, simple tones that respond well to waveform and envelope changes. Good for leads, pads, and learning synthesis fundamentals.',
    'AMSynth': 'Amplitude Modulation synthesis. One oscillator controls the volume of another, creating tremolo-like effects and rich harmonic textures. Great for bells, organs, and evolving timbres.',
    'FMSynth': 'Frequency Modulation synthesis. One oscillator modulates the frequency of another, producing complex, harmonically rich sounds. The go-to for electric pianos, metallic tones, and basses.',
    'MembraneSynth': 'Models a vibrating membrane like a drum head. Features a pitch sweep on each hit, making it ideal for kick drums, toms, and percussive booms.',
    'MetalSynth': 'Generates inharmonic, metallic tones using FM synthesis with high modulation. Perfect for cymbals, hi-hats, gongs, and any clangorous sound.',
    'MonoSynth': 'Single-voice synth with a built-in filter and filter envelope. Classic monophonic lead and bass machine \u2014 think acid lines, squelchy basses, and screaming solos.',
    'NoiseSynth': 'Pure noise generator shaped by an amplitude envelope. No pitch \u2014 just texture. Use it for snares, wind effects, risers, and percussive hits.',
    'PluckSynth': 'Physical modeling of a plucked string using Karplus-Strong synthesis. Produces guitar-like, harp, and pizzicato string sounds with natural decay.',
    'PolySynth': 'Polyphonic version of the basic synth \u2014 play multiple notes at once. Ideal for chords, pads, and any time you need more than one voice.',
    'DuoSynth': 'Two voices layered together with independent oscillators and a shared vibrato. Creates thick, detuned sounds perfect for lush pads and rich leads.'
};

const synthPresets = {
    'Synth': [
        { name: 'Warm Pad', octave: 3, effects: { reverb: 0.7, delayTime: 0.4, delayFeedback: 0.4, distortion: 0, filterFreq: 3000, chorusRate: 1.2 }, params: { oscType: 'sine', attack: 0.8, decay: 0.3, sustain: 0.7, release: 3, volume: -10 } },
        { name: 'Sharp Lead', octave: 4, effects: { reverb: 0.15, delayTime: 0.12, delayFeedback: 0.2, distortion: 0.15, filterFreq: 8000, chorusRate: 0.1 }, params: { oscType: 'sawtooth', attack: 0.01, decay: 0.1, sustain: 0.6, release: 0.3, volume: -10 } },
        { name: 'Soft Flute', octave: 4, effects: { reverb: 0.5, delayTime: 0.3, delayFeedback: 0.25, distortion: 0, filterFreq: 4000, chorusRate: 2 }, params: { oscType: 'triangle', attack: 0.15, decay: 0.2, sustain: 0.5, release: 1.5, volume: -10 } },
        { name: 'Retro Square', octave: 3, effects: { reverb: 0.1, delayTime: 0.15, delayFeedback: 0.5, distortion: 0.08, filterFreq: 6000, chorusRate: 0.5 }, params: { oscType: 'square', attack: 0.01, decay: 0.05, sustain: 0.8, release: 0.5, volume: -15 } },
    ],
    'AMSynth': [
        { name: 'Bell Tone', octave: 4, effects: { reverb: 0.6, delayTime: 0.35, delayFeedback: 0.3, distortion: 0, filterFreq: 7000, chorusRate: 0.3 }, params: { harmonicity: 5, oscType: 'sine', modType: 'square', attack: 0.01, decay: 0.8, sustain: 0.1, release: 2, modAttack: 0.01, modRelease: 0.5 } },
        { name: 'Tremolo Organ', octave: 3, effects: { reverb: 0.25, delayTime: 0.1, delayFeedback: 0.15, distortion: 0.1, filterFreq: 5000, chorusRate: 4 }, params: { harmonicity: 2, oscType: 'square', modType: 'sine', attack: 0.05, decay: 0.1, sustain: 0.9, release: 0.8, modAttack: 0.1, modRelease: 1 } },
        { name: 'Wobble', octave: 2, effects: { reverb: 0.4, delayTime: 0.25, delayFeedback: 0.5, distortion: 0.2, filterFreq: 2500, chorusRate: 0.8 }, params: { harmonicity: 1.5, oscType: 'sawtooth', modType: 'sine', attack: 0.1, decay: 0.3, sustain: 0.6, release: 1.5, modAttack: 0.5, modRelease: 2 } },
    ],
    'FMSynth': [
        { name: 'Electric Piano', octave: 3, effects: { reverb: 0.35, delayTime: 0.2, delayFeedback: 0.2, distortion: 0, filterFreq: 6000, chorusRate: 1.5 }, params: { harmonicity: 3, modulationIndex: 14, oscType: 'sine', modType: 'sine', attack: 0.01, decay: 1, sustain: 0.2, release: 1.5, modAttack: 0.01, modRelease: 0.5 } },
        { name: 'Metallic Stab', octave: 4, effects: { reverb: 0.5, delayTime: 0.18, delayFeedback: 0.4, distortion: 0.3, filterFreq: 9000, chorusRate: 0.1 }, params: { harmonicity: 5.5, modulationIndex: 50, oscType: 'sine', modType: 'square', attack: 0.001, decay: 0.3, sustain: 0, release: 0.5, modAttack: 0.01, modRelease: 0.1 } },
        { name: 'Deep Bass', octave: 1, effects: { reverb: 0.1, delayTime: 0, delayFeedback: 0, distortion: 0.12, filterFreq: 1500, chorusRate: 0.3 }, params: { harmonicity: 1, modulationIndex: 5, oscType: 'sine', modType: 'triangle', attack: 0.01, decay: 0.4, sustain: 0.5, release: 0.8, modAttack: 0.05, modRelease: 0.3 } },
        { name: 'Sci-Fi Laser', octave: 4, effects: { reverb: 0.6, delayTime: 0.3, delayFeedback: 0.6, distortion: 0.05, filterFreq: 10000, chorusRate: 6 }, params: { harmonicity: 7, modulationIndex: 80, oscType: 'sine', modType: 'sawtooth', attack: 0.001, decay: 0.5, sustain: 0.1, release: 2, modAttack: 0.01, modRelease: 1.5 } },
    ],
    'MembraneSynth': [
        { name: 'Kick Drum', octave: 1, effects: { reverb: 0.1, delayTime: 0, delayFeedback: 0, distortion: 0.05, filterFreq: 2000, chorusRate: 0.1 }, params: { pitchDecay: 0.05, octaves: 10, oscType: 'sine', attack: 0.001, decay: 0.4, sustain: 0.01, release: 0.5 } },
        { name: 'Floor Tom', octave: 1, effects: { reverb: 0.3, delayTime: 0, delayFeedback: 0, distortion: 0, filterFreq: 3000, chorusRate: 0.1 }, params: { pitchDecay: 0.08, octaves: 6, oscType: 'sine', attack: 0.001, decay: 0.8, sustain: 0.05, release: 1 } },
        { name: 'Boing', octave: 2, effects: { reverb: 0.5, delayTime: 0.2, delayFeedback: 0.5, distortion: 0, filterFreq: 5000, chorusRate: 0.1 }, params: { pitchDecay: 0.3, octaves: 14, oscType: 'sine', attack: 0.001, decay: 1.2, sustain: 0.01, release: 2 } },
        { name: '808 Sub', octave: 1, effects: { reverb: 0.05, delayTime: 0, delayFeedback: 0, distortion: 0.25, filterFreq: 800, chorusRate: 0.1 }, params: { pitchDecay: 0.03, octaves: 4, oscType: 'sine', attack: 0.001, decay: 1.5, sustain: 0.2, release: 3 } },
    ],
    'MetalSynth': [
        { name: 'Hi-Hat', octave: 4, effects: { reverb: 0.1, delayTime: 0, delayFeedback: 0, distortion: 0, filterFreq: 8000, chorusRate: 0.1 }, params: { frequency: 400, harmonicity: 5.1, modulationIndex: 32, resonance: 6000, octaves: 1.5, attack: 0.001, decay: 0.15, release: 0.05 } },
        { name: 'Crash Cymbal', octave: 4, effects: { reverb: 0.6, delayTime: 0.1, delayFeedback: 0.15, distortion: 0, filterFreq: 9000, chorusRate: 0.5 }, params: { frequency: 300, harmonicity: 8, modulationIndex: 40, resonance: 7000, octaves: 2, attack: 0.001, decay: 3, release: 1 } },
        { name: 'Gong', octave: 3, effects: { reverb: 0.8, delayTime: 0.3, delayFeedback: 0.3, distortion: 0, filterFreq: 3000, chorusRate: 0.3 }, params: { frequency: 100, harmonicity: 3, modulationIndex: 20, resonance: 2000, octaves: 0.5, attack: 0.01, decay: 5, release: 3 } },
        { name: 'Clang', octave: 4, effects: { reverb: 0.4, delayTime: 0.15, delayFeedback: 0.5, distortion: 0.15, filterFreq: 7000, chorusRate: 2 }, params: { frequency: 600, harmonicity: 12, modulationIndex: 60, resonance: 5000, octaves: 3, attack: 0.001, decay: 0.5, release: 0.2 } },
    ],
    'MonoSynth': [
        { name: 'Acid Bass', octave: 2, effects: { reverb: 0.1, delayTime: 0.1, delayFeedback: 0.3, distortion: 0.3, filterFreq: 2000, chorusRate: 0.1 }, params: { oscType: 'sawtooth', filterQ: 15, filterCutoff: 800, attack: 0.01, decay: 0.15, sustain: 0.4, release: 0.3, filterAttack: 0.01, filterDecay: 0.3, filterSustain: 0.2, filterRelease: 0.5 } },
        { name: 'Thick Lead', octave: 3, effects: { reverb: 0.2, delayTime: 0.25, delayFeedback: 0.35, distortion: 0.1, filterFreq: 6000, chorusRate: 1.5 }, params: { oscType: 'square', filterQ: 3, filterCutoff: 3000, attack: 0.05, decay: 0.1, sustain: 0.9, release: 0.5, filterAttack: 0.05, filterDecay: 0.2, filterSustain: 0.8, filterRelease: 1 } },
        { name: 'Wah Bass', octave: 2, effects: { reverb: 0.15, delayTime: 0.08, delayFeedback: 0.2, distortion: 0.2, filterFreq: 1500, chorusRate: 0.1 }, params: { oscType: 'sawtooth', filterQ: 10, filterCutoff: 400, attack: 0.01, decay: 0.3, sustain: 0.6, release: 0.5, filterAttack: 0.06, filterDecay: 0.5, filterSustain: 0.1, filterRelease: 1.5 } },
        { name: 'Muted Pluck', octave: 3, effects: { reverb: 0.4, delayTime: 0.2, delayFeedback: 0.4, distortion: 0, filterFreq: 4000, chorusRate: 0.8 }, params: { oscType: 'square', filterQ: 8, filterCutoff: 2000, attack: 0.001, decay: 0.2, sustain: 0, release: 0.3, filterAttack: 0.001, filterDecay: 0.15, filterSustain: 0, filterRelease: 0.3 } },
    ],
    'NoiseSynth': [
        { name: 'Snare Hit', octave: 4, effects: { reverb: 0.2, delayTime: 0, delayFeedback: 0, distortion: 0.1, filterFreq: 7000, chorusRate: 0.1 }, params: { noiseType: 'white', attack: 0.001, decay: 0.15, sustain: 0, release: 0.1 } },
        { name: 'Wind Gust', octave: 4, effects: { reverb: 0.7, delayTime: 0.4, delayFeedback: 0.3, distortion: 0, filterFreq: 2500, chorusRate: 0.5 }, params: { noiseType: 'brown', attack: 0.5, decay: 0.3, sustain: 0.6, release: 2 } },
        { name: 'Hiss Riser', octave: 4, effects: { reverb: 0.5, delayTime: 0.3, delayFeedback: 0.6, distortion: 0, filterFreq: 6000, chorusRate: 3 }, params: { noiseType: 'pink', attack: 1.5, decay: 0.1, sustain: 1, release: 3 } },
        { name: 'Static Burst', octave: 4, effects: { reverb: 0.1, delayTime: 0.05, delayFeedback: 0.7, distortion: 0.5, filterFreq: 9000, chorusRate: 0.1 }, params: { noiseType: 'white', attack: 0.001, decay: 0.05, sustain: 0.3, release: 0.05 } },
    ],
    'PluckSynth': [
        { name: 'Guitar Pick', octave: 3, effects: { reverb: 0.2, delayTime: 0.15, delayFeedback: 0.2, distortion: 0.08, filterFreq: 5000, chorusRate: 0.5 }, params: { attackNoise: 3, dampening: 3500, resonance: 0.9 } },
        { name: 'Harp', octave: 4, effects: { reverb: 0.65, delayTime: 0.3, delayFeedback: 0.25, distortion: 0, filterFreq: 8000, chorusRate: 1.2 }, params: { attackNoise: 0.5, dampening: 6000, resonance: 0.98 } },
        { name: 'Banjo', octave: 3, effects: { reverb: 0.1, delayTime: 0.08, delayFeedback: 0.15, distortion: 0.12, filterFreq: 6000, chorusRate: 0.1 }, params: { attackNoise: 8, dampening: 2500, resonance: 0.7 } },
        { name: 'Dark Pluck', octave: 2, effects: { reverb: 0.5, delayTime: 0.35, delayFeedback: 0.5, distortion: 0, filterFreq: 1500, chorusRate: 0.8 }, params: { attackNoise: 1, dampening: 1000, resonance: 0.85 } },
    ],
    'PolySynth': [
        { name: 'Dreamy Pad', octave: 3, effects: { reverb: 0.8, delayTime: 0.4, delayFeedback: 0.4, distortion: 0, filterFreq: 3500, chorusRate: 1.5 }, params: { oscType: 'sine', attack: 1, decay: 0.3, sustain: 0.8, release: 4 } },
        { name: 'Bright Chords', octave: 3, effects: { reverb: 0.3, delayTime: 0.15, delayFeedback: 0.2, distortion: 0.05, filterFreq: 8000, chorusRate: 2 }, params: { oscType: 'sawtooth', attack: 0.02, decay: 0.2, sustain: 0.5, release: 1 } },
        { name: 'Organ', octave: 3, effects: { reverb: 0.25, delayTime: 0, delayFeedback: 0, distortion: 0.08, filterFreq: 5000, chorusRate: 4.5 }, params: { oscType: 'square', attack: 0.01, decay: 0.05, sustain: 1, release: 0.3 } },
        { name: 'Glass Keys', octave: 5, effects: { reverb: 0.6, delayTime: 0.3, delayFeedback: 0.35, distortion: 0, filterFreq: 9000, chorusRate: 0.8 }, params: { oscType: 'triangle', attack: 0.01, decay: 0.5, sustain: 0.2, release: 2 } },
    ],
    'DuoSynth': [
        { name: 'Lush Pad', octave: 3, effects: { reverb: 0.75, delayTime: 0.35, delayFeedback: 0.35, distortion: 0, filterFreq: 3500, chorusRate: 1.2 }, params: { vibratoAmount: 0.3, vibratoRate: 3, harmonicity: 1.5, voice0Type: 'sine', voice1Type: 'triangle', attack: 0.6, decay: 0.3, sustain: 0.8, release: 3 } },
        { name: 'Detune Lead', octave: 3, effects: { reverb: 0.2, delayTime: 0.2, delayFeedback: 0.3, distortion: 0.15, filterFreq: 7000, chorusRate: 0.5 }, params: { vibratoAmount: 0.1, vibratoRate: 5, harmonicity: 1.01, voice0Type: 'sawtooth', voice1Type: 'sawtooth', attack: 0.02, decay: 0.1, sustain: 0.7, release: 0.5 } },
        { name: 'Alien Voice', octave: 4, effects: { reverb: 0.5, delayTime: 0.25, delayFeedback: 0.6, distortion: 0.1, filterFreq: 5000, chorusRate: 7 }, params: { vibratoAmount: 0.8, vibratoRate: 12, harmonicity: 3, voice0Type: 'square', voice1Type: 'sine', attack: 0.1, decay: 0.4, sustain: 0.5, release: 2 } },
        { name: 'Octave Stack', octave: 2, effects: { reverb: 0.3, delayTime: 0.1, delayFeedback: 0.2, distortion: 0.2, filterFreq: 4500, chorusRate: 1 }, params: { vibratoAmount: 0.05, vibratoRate: 2, harmonicity: 2, voice0Type: 'sawtooth', voice1Type: 'square', attack: 0.05, decay: 0.2, sustain: 0.6, release: 1 } },
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

    // Apply effects and sync UI
    if (preset.effects) {
        const fx = preset.effects;
        const effectMap = {
            reverb:        { engine: () => { if (reverb) reverb.wet.value = fx.reverb; }, displayId: 'reverbValue', suffix: '' },
            delayTime:     { engine: () => { if (delay) delay.delayTime.value = fx.delayTime; }, displayId: 'delayTimeValue', suffix: 's' },
            delayFeedback: { engine: () => { if (delay) delay.feedback.value = fx.delayFeedback; }, displayId: 'delayFeedbackValue', suffix: '' },
            distortion:    { engine: () => { if (distortion) { distortion.distortion = fx.distortion; distortion.wet.value = fx.distortion > 0 ? 0.5 : 0; } }, displayId: 'distortionValue', suffix: '' },
            filterFreq:    { engine: () => { if (filter) filter.frequency.value = fx.filterFreq; }, displayId: 'filterFreqValue', suffix: ' Hz' },
            chorusRate:    { engine: () => { if (chorus) chorus.frequency.value = fx.chorusRate; }, displayId: 'chorusRateValue', suffix: ' Hz' },
        };

        for (const [key, config] of Object.entries(effectMap)) {
            if (fx[key] === undefined) continue;
            config.engine();
            const slider = document.getElementById(key);
            if (slider) {
                slider.value = fx[key];
                updateSliderFill(slider);
            }
            const display = document.getElementById(config.displayId);
            if (display) display.textContent = fx[key] + config.suffix;
        }
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

function playNote(note) {
    if (!synth) return;

    // Display note in chosen notation (e.g. "C#4" → "Do#4")
    const noteName = note.replace(/\d+/, '');
    const octaveNum = note.match(/\d+/)?.[0] || '';
    document.getElementById('currentNote').textContent = getDisplayLabel(noteName) + octaveNum;

    try {
        if (currentInstrumentType === 'NoiseSynth') {
            synth.triggerAttack();
        } else if (currentInstrumentType === 'MetalSynth') {
            const envDecay = synth.envelope?.decay ?? 1.4;
            const envRelease = synth.envelope?.release ?? 0.2;
            synth.triggerAttackRelease(envDecay + envRelease);
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
async function init() {
    try {
        await Tone.start();
        initEffects();
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
