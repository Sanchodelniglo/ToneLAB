// Synth engine: instrument construction and config, parameter updates, and note
// triggering with the monotonic trigger clock.
import { state, getDisplayLabel } from '../state.js';

// Initialize synth
// The "Playing:" readout is optional (the desktop bar dropped it); any
// element with id currentNote still receives the note name.
function setNoteReadout(text) {
    const el = document.getElementById('currentNote');
    if (el) el.textContent = text;
}

function initSynth(type) {
    if (state.synth) {
        // Clear active state before disposing
        state.activeKeys.clear();
        state.activeTouches.clear();
        document.querySelectorAll('.key.pressed').forEach(k => k.classList.remove('pressed'));
        setNoteReadout('\u2014');
        // Let the old voice ring out instead of cutting it with a click,
        // then free it once its longest plausible release tail has passed.
        const old = state.synth;
        try {
            if (typeof old.releaseAll === 'function') old.releaseAll();
            else if (typeof old.triggerRelease === 'function') old.triggerRelease();
        } catch (e) { /* some synths have nothing to release */ }
        setTimeout(() => old.dispose(), 6000); // longest preset release is 4 s
    }

    const synthConfig = getSynthConfig(type);
    state.oscSpread = 20; // the Spread knob is rebuilt at its default with the controls

    switch(type) {
        case 'Synth':
            state.synth = new Tone.Synth(synthConfig).connect(state.chorus);
            break;
        case 'AMSynth':
            state.synth = new Tone.AMSynth(synthConfig).connect(state.chorus);
            break;
        case 'FMSynth':
            state.synth = new Tone.FMSynth(synthConfig).connect(state.chorus);
            break;
        case 'MembraneSynth':
            state.synth = new Tone.MembraneSynth(synthConfig).connect(state.chorus);
            break;
        case 'MetalSynth':
            state.synth = new Tone.MetalSynth(synthConfig).connect(state.chorus);
            break;
        case 'MonoSynth':
            state.synth = new Tone.MonoSynth(synthConfig).connect(state.chorus);
            break;
        case 'NoiseSynth':
            state.synth = new Tone.NoiseSynth(synthConfig).connect(state.chorus);
            break;
        case 'PluckSynth':
            state.synth = new Tone.PluckSynth(synthConfig).connect(state.chorus);
            break;
        case 'PolySynth':
            state.synth = new Tone.PolySynth(Tone.Synth, synthConfig).connect(state.chorus);
            break;
        case 'DuoSynth':
            state.synth = new Tone.DuoSynth(synthConfig).connect(state.chorus);
            break;
    }

    state.currentInstrumentType = type;
    // updateControls(type) is now called by the caller right after initSynth(type)
    // (ui/controls.js, main.js) to avoid a synth <-> controls import cycle.
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

// fatsine / fatsquare / fattriangle / fatsawtooth: 3 detuned copies (Tone FatOscillator)
const isFat = (type) => typeof type === 'string' && type.startsWith('fat');

// AM/FM synths expose harmonicity and modulationIndex as Signals (.value),
// MetalSynth exposes them as plain numbers. Write whichever the synth has.
function setParam(target, prop, value) {
    const current = target[prop];
    if (current && typeof current === 'object' && 'value' in current) {
        current.value = value;
    } else {
        target[prop] = value;
    }
}

function updateSynthParameter(param, value) {
    if (!state.synth) return;

    try {
        switch(param) {
            case 'oscType':
                if (state.currentInstrumentType === 'PolySynth') {
                    state.synth.set({ oscillator: { type: value } });
                    if (isFat(value)) state.synth.set({ oscillator: { spread: state.oscSpread } });
                } else {
                    state.synth.oscillator.type = value;
                    if (isFat(value)) state.synth.oscillator.spread = state.oscSpread;
                }
                break;
            case 'spread':
                // Tone ignores spread on non-fat waves, so keep it and apply it when the wave turns fat
                state.oscSpread = value;
                if (state.currentInstrumentType === 'PolySynth') {
                    state.synth.set({ oscillator: { spread: value } });
                } else if (state.synth.voice0) {
                    state.synth.voice0.oscillator.spread = value;
                    state.synth.voice1.oscillator.spread = value;
                } else if (state.synth.oscillator) {
                    state.synth.oscillator.spread = value;
                }
                break;
            case 'modType':
                if (state.synth.modulation) state.synth.modulation.type = value;
                break;
            case 'noiseType':
                if (state.synth.noise) state.synth.noise.type = value;
                break;
            case 'voice0Type':
                if (state.synth.voice0) {
                    state.synth.voice0.oscillator.type = value;
                    if (isFat(value)) state.synth.voice0.oscillator.spread = state.oscSpread;
                }
                break;
            case 'voice1Type':
                if (state.synth.voice1) {
                    state.synth.voice1.oscillator.type = value;
                    if (isFat(value)) state.synth.voice1.oscillator.spread = state.oscSpread;
                }
                break;
            case 'attack':
                if (state.currentInstrumentType === 'PolySynth') {
                    state.synth.set({ envelope: { attack: value } });
                } else if (state.synth.voice0) {
                    state.synth.voice0.envelope.attack = value;
                    state.synth.voice1.envelope.attack = value;
                } else {
                    state.synth.envelope.attack = value;
                }
                break;
            case 'decay':
                if (state.currentInstrumentType === 'PolySynth') {
                    state.synth.set({ envelope: { decay: value } });
                } else if (state.synth.voice0) {
                    state.synth.voice0.envelope.decay = value;
                    state.synth.voice1.envelope.decay = value;
                } else {
                    state.synth.envelope.decay = value;
                }
                break;
            case 'sustain':
                if (state.currentInstrumentType === 'PolySynth') {
                    state.synth.set({ envelope: { sustain: value } });
                } else if (state.synth.voice0) {
                    state.synth.voice0.envelope.sustain = value;
                    state.synth.voice1.envelope.sustain = value;
                } else {
                    state.synth.envelope.sustain = value;
                }
                break;
            case 'release':
                if (state.currentInstrumentType === 'PolySynth') {
                    state.synth.set({ envelope: { release: value } });
                } else if (state.synth.voice0) {
                    state.synth.voice0.envelope.release = value;
                    state.synth.voice1.envelope.release = value;
                } else {
                    state.synth.envelope.release = value;
                }
                break;
            case 'modAttack':
                if (state.synth.modulationEnvelope) state.synth.modulationEnvelope.attack = value;
                break;
            case 'modRelease':
                if (state.synth.modulationEnvelope) state.synth.modulationEnvelope.release = value;
                break;
            case 'harmonicity':
                setParam(state.synth, 'harmonicity', value);
                break;
            case 'modulationIndex':
                setParam(state.synth, 'modulationIndex', value);
                break;
            case 'pitchDecay':
                if (state.synth.pitchDecay !== undefined) state.synth.pitchDecay = value;
                break;
            case 'octaves':
                if (state.synth.octaves !== undefined) state.synth.octaves = value;
                break;
            case 'frequency':
                if (state.synth.frequency) state.synth.frequency.value = value;
                break;
            case 'resonance':
                if (state.synth.resonance !== undefined) state.synth.resonance = value;
                break;
            case 'filterQ':
                if (state.synth.filter) state.synth.filter.Q.value = value;
                break;
            case 'filterCutoff':
                if (state.synth.filter) state.synth.filter.frequency.value = value;
                break;
            case 'filterAttack':
                if (state.synth.filterEnvelope) state.synth.filterEnvelope.attack = value;
                break;
            case 'filterDecay':
                if (state.synth.filterEnvelope) state.synth.filterEnvelope.decay = value;
                break;
            case 'filterSustain':
                if (state.synth.filterEnvelope) state.synth.filterEnvelope.sustain = value;
                break;
            case 'filterRelease':
                if (state.synth.filterEnvelope) state.synth.filterEnvelope.release = value;
                break;
            case 'attackNoise':
                if (state.synth.attackNoise !== undefined) state.synth.attackNoise = value;
                break;
            case 'dampening':
                if (state.synth.dampening !== undefined) state.synth.dampening = value;
                break;
            case 'vibratoAmount':
                if (state.synth.vibratoAmount) state.synth.vibratoAmount.value = value;
                break;
            case 'vibratoRate':
                if (state.synth.vibratoRate) state.synth.vibratoRate.value = value;
                break;
            case 'volume':
                state.synth.volume.value = value;
                break;
        }
    } catch (error) {
        console.log('Parameter update error:', error);
    }
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
    if (!state.synth) return;

    // Display note in chosen notation (e.g. "C#4" → "Do#4")
    const noteName = note.replace(/\d+/, '');
    const octaveNum = note.match(/\d+/)?.[0] || '';
    setNoteReadout(getDisplayLabel(noteName) + octaveNum);

    const trigger = (time) => {
        if (state.currentInstrumentType === 'NoiseSynth') {
            state.synth.triggerAttack(time);
        } else if (state.currentInstrumentType === 'MetalSynth') {
            // MetalSynth inherits Monophonic.triggerAttack(note, time): the note sets
            // its base frequency. Pass the Frequency knob's value so the pitch stays
            // on the knob and every key fires the same hit. Its envelope has no
            // sustain, so the hit decays on its own and needs no release.
            state.synth.triggerAttack(state.synth.frequency.value, time);
        } else {
            state.synth.triggerAttack(note, time);
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
    if (!state.synth) return;

    try {
        if (state.currentInstrumentType === 'MetalSynth') {
            // MetalSynth uses triggerAttackRelease, no manual release needed
        } else if (state.currentInstrumentType === 'PolySynth' && note) {
            state.synth.triggerRelease(note);
        } else if (state.currentInstrumentType === 'NoiseSynth') {
            // NoiseSynth has no note concept — release when all inputs are up
            if (state.activeKeys.size === 0 && state.activeTouches.size === 0) {
                state.synth.triggerRelease();
            }
        } else if (state.activeKeys.size === 0 && state.activeTouches.size === 0) {
            state.synth.triggerRelease();
        }
    } catch (error) {
        console.log('Release error:', error);
    }

    if (state.activeKeys.size === 0 && state.activeTouches.size === 0) {
        setNoteReadout('\u2014');
    }
}

// Arpeggiator step: scheduled ahead on the Transport clock, attack + release
// in one call. Keeps the live trigger clock behind it so a key pressed by hand
// never lands before a scheduled step.
function triggerArpStep(note, duration, time, velocity = 1) {
    if (!state.synth) return;
    lastTriggerTime = Math.max(lastTriggerTime, time);
    try {
        const type = state.currentInstrumentType;
        if (type === 'NoiseSynth') {
            state.synth.triggerAttackRelease(duration, time, velocity);
        } else if (type === 'MetalSynth') {
            state.synth.triggerAttackRelease(state.synth.frequency.value, duration, time, velocity);
        } else {
            state.synth.triggerAttackRelease(note, duration, time, velocity);
        }
    } catch (error) {
        console.log('Arp step error:', error);
    }
}

// Silence every voice now (arp start / stop, so held keys do not stay on)
function releaseAllVoices() {
    if (!state.synth) return;
    try {
        if (typeof state.synth.releaseAll === 'function') state.synth.releaseAll();
        else state.synth.triggerRelease();
    } catch (_) { /* nothing sounding */ }
    setNoteReadout('\u2014');
}

// Debug accessors for the trigger clock (window.ToneLAB smoke-test surface).
function getLastTriggerTime() { return lastTriggerTime; }
function bumpLastTriggerTime(seconds) { lastTriggerTime += seconds; }

export { getSynthConfig, initSynth, updateSynthParameter, nextTriggerTime, playNote, stopNote, triggerArpStep, releaseAllVoices, getLastTriggerTime, bumpLastTriggerTime };
