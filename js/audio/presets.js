// Synth descriptions, factory presets, preset application and the preset bar UI.
import { state, store } from '../state.js';
import { updateSynthParameter } from './synth.js';
import { setEffect, EFFECT_DEFAULTS, effectHandlers } from './effects.js';
import { updateSliderFill } from '../ui/knobs.js';
import { createKeyboard, updateOctaveButtons } from '../ui/keyboard.js';
import { refreshWavePreview } from '../ui/wavePreview.js';

const synthDescriptions = {
    'FMSynth': 'Frequency Modulation: a second oscillator bends the pitch of the first, creating glassy, harmonically rich tones \u2014 the sound of 80s keyboards like the DX7. Start with Electric Piano, then raise Modulation Index to hear it brighten.',
    'MembraneSynth': 'A sine wave whose pitch drops fast on every hit, like a struck drum head. Load Kick Drum and play the lowest keys, then lengthen Pitch Decay to turn it into a tom or a disco syndrum.',
    'MetalSynth': 'Six clashing FM oscillators make inharmonic, metallic noise for cymbals, hats and gongs \u2014 the pitch comes from the Frequency knob, not the key you press. Try Closed Hat, then raise Decay to open it up.',
    'MonoSynth': 'One voice with a resonant filter and its own filter envelope \u2014 the classic analog bass and lead machine. Start with Acid Bass, then turn Filter Q and Filter Decay to hear the squelch change.',
    'NoiseSynth': 'Random noise shaped by an envelope \u2014 no pitch, so every key sounds the same. Try Snare Hit for percussion, then lengthen Attack and Release to turn it into wind or a riser.',
    'PluckSynth': 'Physical model of a plucked string (Karplus-Strong): a short noise burst rings through a tuned delay and fades naturally. Start with Nylon Guitar, then lower Dampening for a muted tone or raise Resonance for longer sustain.',
    'PolySynth': 'One oscillator shaped by a volume envelope, able to play several notes at once \u2014 the simplest synth and the best place to learn the basics. Hold a few keys down to build chords. Start with Dreamy Pad and play a three-note chord, then shorten Attack to turn it into stabs.',
};

const synthPresets = {
    'FMSynth': [
        { name: 'Electric Piano', octave: 3, effects: { reverb: 0.25, reverbSize: 2, delayTime: 0.3, delayFeedback: 0.2, delayMix: 0.12, distortion: 0, filterFreq: 4500, chorusRate: 1.2, chorusMix: 0.2 }, params: { harmonicity: 3, modulationIndex: 10, oscType: 'sine', modType: 'sine', attack: 0.005, decay: 1.6, sustain: 0.1, release: 1.2, modAttack: 0.005, modRelease: 0.4 } },
        { name: 'Glass Bell', octave: 5, effects: { reverb: 0.45, reverbSize: 5, delayTime: 0.4, delayFeedback: 0.35, delayMix: 0.2, distortion: 0, filterFreq: 9000, chorusRate: 0.5, chorusMix: 0.15 }, params: { harmonicity: 3.5, modulationIndex: 12, oscType: 'sine', modType: 'sine', attack: 0.001, decay: 2, sustain: 0, release: 3, modAttack: 0, modRelease: 2 } },
        { name: 'DX Bass', octave: 2, effects: { reverb: 0.05, reverbSize: 0.8, delayTime: 0.25, delayFeedback: 0, delayMix: 0, distortion: 0.15, filterFreq: 2500, chorusRate: 1.5, chorusMix: 0 }, params: { harmonicity: 1, modulationIndex: 4, oscType: 'sine', modType: 'sine', attack: 0.005, decay: 0.35, sustain: 0.5, release: 0.2, modAttack: 0.005, modRelease: 0.2 } },
        { name: 'Sci-Fi Laser', octave: 4, effects: { reverb: 0.35, reverbSize: 3, delayTime: 0.22, delayFeedback: 0.55, delayMix: 0.35, distortion: 0.05, filterFreq: 9000, chorusRate: 5, chorusMix: 0.2 }, params: { harmonicity: 7, modulationIndex: 40, oscType: 'sine', modType: 'sawtooth', attack: 0.001, decay: 0.4, sustain: 0.2, release: 1.5, modAttack: 0.3, modRelease: 1.2 } },
        { name: 'Neon Brass', octave: 3, effects: { reverb: 0.3, reverbSize: 2.5, delayTime: 0.3, delayFeedback: 0.2, delayMix: 0.1, distortion: 0, filterFreq: 5000, chorusRate: 0.9, chorusMix: 0.3 }, params: { harmonicity: 1, modulationIndex: 6, oscType: 'sine', modType: 'sine', attack: 0.06, decay: 0.3, sustain: 0.75, release: 0.4, modAttack: 0.12, modRelease: 0.3 } },
        { name: 'Marimba', octave: 4, effects: { reverb: 0.25, reverbSize: 1.8, delayTime: 0.25, delayFeedback: 0, delayMix: 0, distortion: 0, filterFreq: 6000, chorusRate: 1.5, chorusMix: 0 }, params: { harmonicity: 4, modulationIndex: 3, oscType: 'sine', modType: 'sine', attack: 0.001, decay: 0.5, sustain: 0, release: 0.3, modAttack: 0.001, modRelease: 0.1 } },
        { name: 'Grit Bass', octave: 2, effects: { reverb: 0.05, reverbSize: 0.8, delayTime: 0.25, delayFeedback: 0, delayMix: 0, distortion: 0.3, filterFreq: 1500, chorusRate: 1.5, chorusMix: 0 }, params: { harmonicity: 0.5, modulationIndex: 20, oscType: 'sine', modType: 'square', attack: 0.005, decay: 0.3, sustain: 0.6, release: 0.2, modAttack: 0.005, modRelease: 0.2 } },
        { name: 'Ice Pad', octave: 4, effects: { reverb: 0.55, reverbSize: 7, delayTime: 0.45, delayFeedback: 0.4, delayMix: 0.2, distortion: 0, filterFreq: 6000, chorusRate: 0.4, chorusMix: 0.5 }, params: { harmonicity: 2, modulationIndex: 8, oscType: 'sine', modType: 'triangle', attack: 1, decay: 1, sustain: 0.6, release: 3.5, modAttack: 1.5, modRelease: 3 } },
    ],
    'MembraneSynth': [
        { name: 'Kick Drum', octave: 1, effects: { reverb: 0.05, reverbSize: 0.5, delayTime: 0, delayFeedback: 0, delayMix: 0, distortion: 0.08, filterFreq: 4000, chorusRate: 1.5, chorusMix: 0 }, params: { pitchDecay: 0.04, octaves: 6, oscType: 'sine', attack: 0.001, decay: 0.45, sustain: 0.01, release: 0.4 } },
        { name: 'Floor Tom', octave: 2, effects: { reverb: 0.25, reverbSize: 1.8, delayTime: 0, delayFeedback: 0, delayMix: 0, distortion: 0, filterFreq: 5000, chorusRate: 1.5, chorusMix: 0 }, params: { pitchDecay: 0.1, octaves: 3, oscType: 'sine', attack: 0.001, decay: 0.7, sustain: 0.02, release: 0.8 } },
        { name: 'Syndrum', octave: 3, effects: { reverb: 0.3, reverbSize: 2.5, delayTime: 0.3, delayFeedback: 0.35, delayMix: 0.25, distortion: 0, filterFreq: 6000, chorusRate: 1.5, chorusMix: 0 }, params: { pitchDecay: 0.25, octaves: 2.5, oscType: 'triangle', attack: 0.001, decay: 0.6, sustain: 0, release: 0.4 } },
        { name: '808 Sub', octave: 1, effects: { reverb: 0.03, reverbSize: 0.5, delayTime: 0, delayFeedback: 0, delayMix: 0, distortion: 0.3, filterFreq: 1200, chorusRate: 1.5, chorusMix: 0 }, params: { pitchDecay: 0.02, octaves: 3, oscType: 'sine', attack: 0.001, decay: 1.8, sustain: 0.3, release: 2.5 } },
        { name: 'Laser Zap', octave: 3, effects: { reverb: 0.2, reverbSize: 1.5, delayTime: 0.15, delayFeedback: 0.5, delayMix: 0.3, distortion: 0, filterFreq: 6000, chorusRate: 1.5, chorusMix: 0 }, params: { pitchDecay: 0.12, octaves: 5, oscType: 'square', attack: 0.001, decay: 0.25, sustain: 0, release: 0.2 } },
        { name: 'Simmons Tom', octave: 3, effects: { reverb: 0.6, reverbSize: 0.9, delayTime: 0, delayFeedback: 0, delayMix: 0, distortion: 0.05, filterFreq: 5000, chorusRate: 1.5, chorusMix: 0 }, params: { pitchDecay: 0.06, octaves: 2, oscType: 'sine', attack: 0.001, decay: 0.35, sustain: 0, release: 0.15 } },
        { name: 'Conga', octave: 3, effects: { reverb: 0.15, reverbSize: 1, delayTime: 0, delayFeedback: 0, delayMix: 0, distortion: 0, filterFreq: 6000, chorusRate: 1.5, chorusMix: 0 }, params: { pitchDecay: 0.008, octaves: 1.5, oscType: 'sine', attack: 0.001, decay: 0.25, sustain: 0, release: 0.1 } },
        { name: 'Industrial Kick', octave: 1, effects: { reverb: 0.1, reverbSize: 0.7, delayTime: 0, delayFeedback: 0, delayMix: 0, distortion: 0.6, filterFreq: 3000, chorusRate: 1.5, chorusMix: 0 }, params: { pitchDecay: 0.06, octaves: 4, oscType: 'sine', attack: 0.001, decay: 0.5, sustain: 0, release: 0.3 } },
    ],
    'MetalSynth': [
        { name: 'Closed Hat', octave: 4, effects: { reverb: 0.08, reverbSize: 0.6, delayTime: 0, delayFeedback: 0, delayMix: 0, distortion: 0, filterFreq: 10000, chorusRate: 1.5, chorusMix: 0 }, params: { frequency: 400, harmonicity: 5.1, modulationIndex: 32, resonance: 7000, octaves: 1, attack: 0.001, decay: 0.08, release: 0.03 } },
        { name: 'Open Hat', octave: 4, effects: { reverb: 0.15, reverbSize: 1, delayTime: 0, delayFeedback: 0, delayMix: 0, distortion: 0, filterFreq: 10000, chorusRate: 1.5, chorusMix: 0 }, params: { frequency: 400, harmonicity: 5.1, modulationIndex: 32, resonance: 6000, octaves: 1.5, attack: 0.001, decay: 0.5, release: 0.2 } },
        { name: 'Crash', octave: 4, effects: { reverb: 0.35, reverbSize: 3, delayTime: 0, delayFeedback: 0, delayMix: 0, distortion: 0, filterFreq: 10000, chorusRate: 1.5, chorusMix: 0 }, params: { frequency: 300, harmonicity: 8, modulationIndex: 40, resonance: 5000, octaves: 2, attack: 0.001, decay: 2.5, release: 1.5 } },
        { name: 'Gong', octave: 3, effects: { reverb: 0.5, reverbSize: 7, delayTime: 0, delayFeedback: 0, delayMix: 0, distortion: 0, filterFreq: 4000, chorusRate: 0.3, chorusMix: 0.3 }, params: { frequency: 90, harmonicity: 2.3, modulationIndex: 15, resonance: 700, octaves: 1, attack: 0.01, decay: 4.5, release: 3 } },
        { name: 'Ride Cymbal', octave: 4, effects: { reverb: 0.25, reverbSize: 2, delayTime: 0, delayFeedback: 0, delayMix: 0, distortion: 0, filterFreq: 9000, chorusRate: 1.5, chorusMix: 0 }, params: { frequency: 350, harmonicity: 5.1, modulationIndex: 28, resonance: 5500, octaves: 1.2, attack: 0.001, decay: 1.8, release: 0.8 } },
        { name: 'Cowbell', octave: 4, effects: { reverb: 0.12, reverbSize: 0.8, delayTime: 0, delayFeedback: 0, delayMix: 0, distortion: 0, filterFreq: 6000, chorusRate: 1.5, chorusMix: 0 }, params: { frequency: 560, harmonicity: 1.5, modulationIndex: 2, resonance: 2500, octaves: 0.5, attack: 0.001, decay: 0.35, release: 0.1 } },
        { name: 'Anvil', octave: 3, effects: { reverb: 0.4, reverbSize: 1.5, delayTime: 0, delayFeedback: 0, delayMix: 0, distortion: 0.3, filterFreq: 5000, chorusRate: 1.5, chorusMix: 0 }, params: { frequency: 180, harmonicity: 3.3, modulationIndex: 20, resonance: 3000, octaves: 1, attack: 0.001, decay: 0.6, release: 0.3 } },
        { name: 'Wind Chime', octave: 5, effects: { reverb: 0.6, reverbSize: 6, delayTime: 0.4, delayFeedback: 0.45, delayMix: 0.3, distortion: 0, filterFreq: 10000, chorusRate: 0.5, chorusMix: 0.3 }, params: { frequency: 900, harmonicity: 12, modulationIndex: 6, resonance: 8000, octaves: 0.5, attack: 0.001, decay: 3, release: 2 } },
    ],
    'MonoSynth': [
        { name: 'Acid Bass', octave: 2, effects: { reverb: 0.08, reverbSize: 1, delayTime: 0.19, delayFeedback: 0.3, delayMix: 0.15, distortion: 0.3, filterFreq: 6000, chorusRate: 1.5, chorusMix: 0 }, params: { oscType: 'sawtooth', filterQ: 10, filterCutoff: 600, attack: 0.005, decay: 0.2, sustain: 0.5, release: 0.1, filterAttack: 0.005, filterDecay: 0.2, filterSustain: 0.1, filterRelease: 0.2 } },
        { name: 'Thick Lead', octave: 4, effects: { reverb: 0.25, reverbSize: 2.2, delayTime: 0.3, delayFeedback: 0.35, delayMix: 0.22, distortion: 0.12, filterFreq: 7000, chorusRate: 0.8, chorusMix: 0.2 }, params: { oscType: 'square', filterQ: 2, filterCutoff: 3000, attack: 0.02, decay: 0.2, sustain: 0.85, release: 0.3, filterAttack: 0.03, filterDecay: 0.4, filterSustain: 0.6, filterRelease: 0.5 } },
        { name: 'Wah Bass', octave: 2, effects: { reverb: 0.1, reverbSize: 1.2, delayTime: 0.25, delayFeedback: 0, delayMix: 0, distortion: 0.1, filterFreq: 4000, chorusRate: 1.5, chorusMix: 0 }, params: { oscType: 'sawtooth', filterQ: 8, filterCutoff: 400, attack: 0.01, decay: 0.3, sustain: 0.7, release: 0.2, filterAttack: 0.12, filterDecay: 0.45, filterSustain: 0.2, filterRelease: 0.4 } },
        { name: 'Muted Pluck', octave: 3, effects: { reverb: 0.3, reverbSize: 2.5, delayTime: 0.28, delayFeedback: 0.4, delayMix: 0.3, distortion: 0, filterFreq: 6000, chorusRate: 0.7, chorusMix: 0.15 }, params: { oscType: 'square', filterQ: 4, filterCutoff: 1500, attack: 0.001, decay: 0.25, sustain: 0, release: 0.2, filterAttack: 0.001, filterDecay: 0.12, filterSustain: 0, filterRelease: 0.2 } },
        { name: 'Outrun Bass', octave: 2, effects: { reverb: 0.05, reverbSize: 0.8, delayTime: 0.25, delayFeedback: 0, delayMix: 0, distortion: 0.15, filterFreq: 5000, chorusRate: 1.5, chorusMix: 0 }, params: { oscType: 'sawtooth', filterQ: 2, filterCutoff: 300, attack: 0.003, decay: 0.15, sustain: 0.6, release: 0.1, filterAttack: 0.001, filterDecay: 0.15, filterSustain: 0.3, filterRelease: 0.2 } },
        { name: 'Scream Lead', octave: 4, effects: { reverb: 0.3, reverbSize: 3, delayTime: 0.375, delayFeedback: 0.4, delayMix: 0.25, distortion: 0.45, filterFreq: 6500, chorusRate: 0.6, chorusMix: 0.15 }, params: { oscType: 'sawtooth', filterQ: 6, filterCutoff: 800, attack: 0.01, decay: 0.4, sustain: 0.9, release: 0.4, filterAttack: 0.2, filterDecay: 0.6, filterSustain: 0.7, filterRelease: 0.6 } },
        { name: 'Slow Sweep', octave: 2, effects: { reverb: 0.5, reverbSize: 6, delayTime: 0.5, delayFeedback: 0.5, delayMix: 0.25, distortion: 0, filterFreq: 4000, chorusRate: 0.3, chorusMix: 0.5 }, params: { oscType: 'pwm', filterQ: 12, filterCutoff: 100, attack: 1.2, decay: 1, sustain: 0.9, release: 3, filterAttack: 2, filterDecay: 2, filterSustain: 0.4, filterRelease: 4 } },
        { name: 'Pew Zap', octave: 5, effects: { reverb: 0.2, reverbSize: 1.5, delayTime: 0.2, delayFeedback: 0.4, delayMix: 0.25, distortion: 0, filterFreq: 8000, chorusRate: 1.5, chorusMix: 0 }, params: { oscType: 'square', filterQ: 18, filterCutoff: 200, attack: 0.001, decay: 0.3, sustain: 0, release: 0.1, filterAttack: 0.001, filterDecay: 0.08, filterSustain: 0, filterRelease: 0.1 } },
        { name: 'Unison Bass', octave: 2, effects: { reverb: 0.05, reverbSize: 0.8, delayTime: 0.25, delayFeedback: 0, delayMix: 0, distortion: 0.12, filterFreq: 3000, chorusRate: 1.5, chorusMix: 0 }, params: { oscType: 'fatsawtooth', spread: 12, filterQ: 3, filterCutoff: 500, attack: 0.005, decay: 0.25, sustain: 0.7, release: 0.15, filterAttack: 0.001, filterDecay: 0.2, filterSustain: 0.4, filterRelease: 0.2 } },
    ],
    'NoiseSynth': [
        { name: 'Snare Hit', octave: 4, effects: { reverb: 0.2, reverbSize: 0.9, delayTime: 0, delayFeedback: 0, delayMix: 0, distortion: 0.1, filterFreq: 8000, chorusRate: 1.5, chorusMix: 0 }, params: { noiseType: 'white', attack: 0.001, decay: 0.18, sustain: 0, release: 0.1 } },
        { name: 'Hand Clap', octave: 4, effects: { reverb: 0.25, reverbSize: 1, delayTime: 0.011, delayFeedback: 0.35, delayMix: 0.5, distortion: 0, filterFreq: 3500, chorusRate: 1.5, chorusMix: 0 }, params: { noiseType: 'white', attack: 0.001, decay: 0.12, sustain: 0, release: 0.08 } },
        { name: 'Wind Gust', octave: 4, effects: { reverb: 0.5, reverbSize: 5, delayTime: 0.4, delayFeedback: 0.3, delayMix: 0.15, distortion: 0, filterFreq: 1200, chorusRate: 0.3, chorusMix: 0.6 }, params: { noiseType: 'pink', attack: 0.8, decay: 0.5, sustain: 0.6, release: 2.5 } },
        { name: 'Hiss Riser', octave: 4, effects: { reverb: 0.45, reverbSize: 4, delayTime: 0.25, delayFeedback: 0.5, delayMix: 0.25, distortion: 0, filterFreq: 9000, chorusRate: 2, chorusMix: 0.3 }, params: { noiseType: 'white', attack: 2, decay: 0.1, sustain: 1, release: 2.5 } },
        { name: 'Gated Snare', octave: 4, effects: { reverb: 0.7, reverbSize: 1.2, delayTime: 0, delayFeedback: 0, delayMix: 0, distortion: 0.15, filterFreq: 7000, chorusRate: 1.5, chorusMix: 0 }, params: { noiseType: 'white', attack: 0.001, decay: 0.3, sustain: 0, release: 0.2 } },
        { name: 'Shaker', octave: 4, effects: { reverb: 0.1, reverbSize: 0.5, delayTime: 0, delayFeedback: 0, delayMix: 0, distortion: 0, filterFreq: 10000, chorusRate: 1.5, chorusMix: 0 }, params: { noiseType: 'white', attack: 0.02, decay: 0.06, sustain: 0, release: 0.04 } },
        { name: 'Thunder', octave: 4, effects: { reverb: 0.6, reverbSize: 9, delayTime: 0.5, delayFeedback: 0.3, delayMix: 0.15, distortion: 0.3, filterFreq: 400, chorusRate: 0.2, chorusMix: 0.3 }, params: { noiseType: 'brown', attack: 0.05, decay: 2, sustain: 0.3, release: 4 } },
        { name: 'Radio Static', octave: 4, effects: { reverb: 0.15, reverbSize: 1, delayTime: 0.08, delayFeedback: 0.6, delayMix: 0.4, distortion: 0.8, filterFreq: 3000, chorusRate: 7, chorusMix: 0.3 }, params: { noiseType: 'white', attack: 0.001, decay: 0.4, sustain: 0.1, release: 0.2 } },
    ],
    'PluckSynth': [
        { name: 'Nylon Guitar', octave: 3, effects: { reverb: 0.25, reverbSize: 2, delayTime: 0.3, delayFeedback: 0.2, delayMix: 0.1, distortion: 0, filterFreq: 6000, chorusRate: 0.8, chorusMix: 0.1 }, params: { attackNoise: 1.5, dampening: 3000, resonance: 0.92 } },
        { name: 'Harp', octave: 4, effects: { reverb: 0.5, reverbSize: 4.5, delayTime: 0.4, delayFeedback: 0.25, delayMix: 0.15, distortion: 0, filterFreq: 9000, chorusRate: 0.6, chorusMix: 0.15 }, params: { attackNoise: 0.6, dampening: 6500, resonance: 0.97 } },
        { name: 'Banjo', octave: 4, effects: { reverb: 0.12, reverbSize: 1.2, delayTime: 0.25, delayFeedback: 0, delayMix: 0, distortion: 0, filterFreq: 8000, chorusRate: 1.5, chorusMix: 0 }, params: { attackNoise: 6, dampening: 5000, resonance: 0.82 } },
        { name: 'Pluck Bass', octave: 2, effects: { reverb: 0.05, reverbSize: 0.8, delayTime: 0.25, delayFeedback: 0, delayMix: 0, distortion: 0.1, filterFreq: 2500, chorusRate: 1.5, chorusMix: 0 }, params: { attackNoise: 2, dampening: 1200, resonance: 0.85 } },
        { name: 'Crystal Arp', octave: 5, effects: { reverb: 0.45, reverbSize: 4, delayTime: 0.375, delayFeedback: 0.55, delayMix: 0.35, distortion: 0, filterFreq: 9000, chorusRate: 1, chorusMix: 0.3 }, params: { attackNoise: 0.4, dampening: 9000, resonance: 0.95 } },
        { name: 'Funk Clav', octave: 3, effects: { reverb: 0.1, reverbSize: 1, delayTime: 0.25, delayFeedback: 0, delayMix: 0, distortion: 0.2, filterFreq: 5000, chorusRate: 1.2, chorusMix: 0.2 }, params: { attackNoise: 8, dampening: 4000, resonance: 0.7 } },
        { name: 'Fuzz Guitar', octave: 3, effects: { reverb: 0.25, reverbSize: 2, delayTime: 0.3, delayFeedback: 0.3, delayMix: 0.15, distortion: 0.6, filterFreq: 3500, chorusRate: 0.8, chorusMix: 0.1 }, params: { attackNoise: 3, dampening: 3500, resonance: 0.96 } },
        { name: 'Wood Block', octave: 4, effects: { reverb: 0.15, reverbSize: 0.8, delayTime: 0, delayFeedback: 0, delayMix: 0, distortion: 0, filterFreq: 8000, chorusRate: 1.5, chorusMix: 0 }, params: { attackNoise: 12, dampening: 2000, resonance: 0.3 } },
    ],
    'PolySynth': [
        { name: 'Dreamy Pad', octave: 3, effects: { reverb: 0.5, reverbSize: 6, delayTime: 0.45, delayFeedback: 0.35, delayMix: 0.2, distortion: 0, filterFreq: 3000, chorusRate: 0.5, chorusMix: 0.55 }, params: { oscType: 'triangle', attack: 1.2, decay: 0.5, sustain: 0.8, release: 4 } },
        { name: 'Synth Brass', octave: 3, effects: { reverb: 0.25, reverbSize: 2, delayTime: 0.2, delayFeedback: 0.2, delayMix: 0.1, distortion: 0.05, filterFreq: 4500, chorusRate: 1, chorusMix: 0.3 }, params: { oscType: 'sawtooth', attack: 0.05, decay: 0.25, sustain: 0.6, release: 0.4 } },
        { name: 'Organ', octave: 3, effects: { reverb: 0.3, reverbSize: 2.2, delayTime: 0.25, delayFeedback: 0, delayMix: 0, distortion: 0.08, filterFreq: 5000, chorusRate: 6, chorusMix: 0.3 }, params: { oscType: 'square5', attack: 0.01, decay: 0.05, sustain: 1, release: 0.15 } },
        { name: 'Glass Keys', octave: 4, effects: { reverb: 0.4, reverbSize: 3.5, delayTime: 0.3, delayFeedback: 0.3, delayMix: 0.18, distortion: 0, filterFreq: 9000, chorusRate: 0.8, chorusMix: 0.2 }, params: { oscType: 'triangle', attack: 0.005, decay: 0.8, sustain: 0.1, release: 2 } },
        { name: 'Juno Strings', octave: 3, effects: { reverb: 0.45, reverbSize: 4, delayTime: 0.3, delayFeedback: 0.2, delayMix: 0.1, distortion: 0, filterFreq: 2500, chorusRate: 0.6, chorusMix: 0.7 }, params: { oscType: 'sawtooth', attack: 0.6, decay: 0.4, sustain: 0.85, release: 1.8 } },
        { name: 'Neon Stab', octave: 3, effects: { reverb: 0.3, reverbSize: 2.5, delayTime: 0.375, delayFeedback: 0.35, delayMix: 0.25, distortion: 0.05, filterFreq: 4500, chorusRate: 1, chorusMix: 0.25 }, params: { oscType: 'sawtooth', attack: 0.001, decay: 0.18, sustain: 0, release: 0.15 } },
        { name: 'Vapor Keys', octave: 3, effects: { reverb: 0.55, reverbSize: 7, delayTime: 0.5, delayFeedback: 0.4, delayMix: 0.25, distortion: 0, filterFreq: 1800, chorusRate: 0.3, chorusMix: 0.6 }, params: { oscType: 'triangle3', attack: 0.01, decay: 1.2, sustain: 0.3, release: 1.5 } },
        { name: 'Arcade Chords', octave: 4, effects: { reverb: 0.1, reverbSize: 1, delayTime: 0.16, delayFeedback: 0.3, delayMix: 0.2, distortion: 0, filterFreq: 8000, chorusRate: 1.5, chorusMix: 0 }, params: { oscType: 'pulse', attack: 0, decay: 0.1, sustain: 0.6, release: 0.05 } },
        { name: 'Supersaw Pad', octave: 3, effects: { reverb: 0.5, reverbSize: 6, delayTime: 0.45, delayFeedback: 0.3, delayMix: 0.15, distortion: 0, filterFreq: 3500, chorusRate: 0.4, chorusMix: 0.3 }, params: { oscType: 'fatsawtooth', spread: 35, attack: 0.8, decay: 0.5, sustain: 0.85, release: 3 } },
        { name: 'Trance Chords', octave: 3, effects: { reverb: 0.3, reverbSize: 2.5, delayTime: 0.375, delayFeedback: 0.45, delayMix: 0.3, distortion: 0.03, filterFreq: 5000, chorusRate: 1, chorusMix: 0.1 }, params: { oscType: 'fatsawtooth', spread: 30, attack: 0.005, decay: 0.3, sustain: 0.2, release: 0.3 } },
        { name: 'Sharp Lead', octave: 4, effects: { reverb: 0.2, reverbSize: 1.8, delayTime: 0.3, delayFeedback: 0.3, delayMix: 0.2, distortion: 0.1, filterFreq: 7000, chorusRate: 0.6, chorusMix: 0.15 }, params: { oscType: 'sawtooth', attack: 0.01, decay: 0.15, sustain: 0.7, release: 0.3 } },
        { name: 'Sub Bass', octave: 2, effects: { reverb: 0.05, reverbSize: 0.8, delayTime: 0.25, delayFeedback: 0, delayMix: 0, distortion: 0, filterFreq: 3000, chorusRate: 1.5, chorusMix: 0 }, params: { oscType: 'sine', attack: 0.01, decay: 0.2, sustain: 0.8, release: 0.25 } },
        { name: 'Soft Flute', octave: 4, effects: { reverb: 0.4, reverbSize: 3, delayTime: 0.35, delayFeedback: 0.25, delayMix: 0.15, distortion: 0, filterFreq: 4000, chorusRate: 4.5, chorusMix: 0.25 }, params: { oscType: 'triangle', attack: 0.12, decay: 0.2, sustain: 0.7, release: 0.6 } },
        { name: 'Chip Square', octave: 4, effects: { reverb: 0.1, reverbSize: 1, delayTime: 0.18, delayFeedback: 0.35, delayMix: 0.25, distortion: 0, filterFreq: 8000, chorusRate: 1.5, chorusMix: 0 }, params: { oscType: 'square', attack: 0, decay: 0.05, sustain: 0.8, release: 0.1 } },
        { name: 'Pulse Pluck', octave: 4, effects: { reverb: 0.25, reverbSize: 2, delayTime: 0.25, delayFeedback: 0.45, delayMix: 0.3, distortion: 0, filterFreq: 5000, chorusRate: 1.2, chorusMix: 0.2 }, params: { oscType: 'pulse', attack: 0.001, decay: 0.18, sustain: 0, release: 0.15 } },
        { name: 'Toy Piano', octave: 5, effects: { reverb: 0.2, reverbSize: 1.2, delayTime: 0.25, delayFeedback: 0, delayMix: 0, distortion: 0, filterFreq: 7000, chorusRate: 1.5, chorusMix: 0 }, params: { oscType: 'square3', attack: 0.001, decay: 0.6, sustain: 0, release: 0.4 } },
        { name: 'Tape Pad', octave: 3, effects: { reverb: 0.5, reverbSize: 6, delayTime: 0.5, delayFeedback: 0.4, delayMix: 0.2, distortion: 0.04, filterFreq: 1800, chorusRate: 0.3, chorusMix: 0.7 }, params: { oscType: 'sawtooth3', attack: 1.5, decay: 0.8, sustain: 0.7, release: 3.5 } },
        { name: 'Reese Bass', octave: 2, effects: { reverb: 0.08, reverbSize: 1, delayTime: 0.25, delayFeedback: 0, delayMix: 0, distortion: 0.2, filterFreq: 900, chorusRate: 0.4, chorusMix: 0.6 }, params: { oscType: 'sawtooth', attack: 0.01, decay: 0.3, sustain: 0.9, release: 0.3 } },
        { name: 'Super Saw', octave: 4, effects: { reverb: 0.3, reverbSize: 2.5, delayTime: 0.375, delayFeedback: 0.35, delayMix: 0.22, distortion: 0.05, filterFreq: 6500, chorusRate: 0.5, chorusMix: 0.1 }, params: { oscType: 'fatsawtooth', spread: 28, attack: 0.02, decay: 0.2, sustain: 0.8, release: 0.5 } }
    ]
};

// One line per preset on why it sounds like that (tooltip on the preset
// controls). Keyed "Type/Name"; presets without a line show nothing.
const presetHints = {
    "PolySynth/Sharp Lead": "A bright melody sound. The sawtooth wave has many overtones. A fast attack and a little distortion make it cut through.",
    "PolySynth/Sub Bass": "A deep bass that you feel more than hear. The sine wave has no overtones. All effects are off, so only the low note stays.",
    "PolySynth/Soft Flute": "A soft, breathy sound. The triangle wave is gentle. The slow attack makes each note fade in like a blown flute.",
    "PolySynth/Chip Square": "The sound of an old game console. The square wave is hollow. The instant attack and the short echo make it blip.",
    "PolySynth/Pulse Pluck": "A short blip for fast melodies. The pulse wave is thin. Sustain is zero, so each note dies at once. The delay repeats it.",
    "PolySynth/Toy Piano": "A small metal tine, like a toy piano. The square 2 wave has only two overtones. The fast decay keeps it short.",
    "PolySynth/Tape Pad": "A soft chord bed, like an old cassette. The slow attack swells in. The dark filter and the slow chorus make it wobble.",
    "PolySynth/Reese Bass": "A thick, moving bass. The chorus adds a slightly out of tune copy of the sawtooth. The two copies beat against each other.",
    "PolySynth/Super Saw": "The trance lead. The fat sawtooth stacks three copies, 28 cents apart. They drift against each other, and the sound gets wide.",
    "FMSynth/Electric Piano": "The electric piano of 80s ballads. Harmonicity 3 and a quick modulator envelope make the bright tine attack.",
    "FMSynth/Glass Bell": "A glass bell. Harmonicity 3.5 makes a tone that is not in tune. The high Modulation Index adds brightness, and the tail is long.",
    "FMSynth/DX Bass": "A punchy 80s bass. Harmonicity 1 keeps it in tune. A low Modulation Index keeps it round, and the modulator stops fast.",
    "FMSynth/Sci-Fi Laser": "A laser zap. Harmonicity 7 and Modulation Index 40 make wild overtones. The long echo repeats each zap.",
    "FMSynth/Neon Brass": "A synth brass. Harmonicity 1 stays in tune. The modulator fades in a bit late, which makes the brassy swell.",
    "FMSynth/Marimba": "A wooden bar, like a marimba. Harmonicity 4 adds a high overtone. A low Modulation Index and a short decay keep it soft.",
    "FMSynth/Grit Bass": "A dirty bass. A square modulator below the note and a high Modulation Index growl. Distortion adds the bite.",
    "FMSynth/Ice Pad": "A glassy chord bed. Harmonicity 2 adds an octave. The modulation fades in over a second, so the sound gets brighter as you hold it.",
    "MembraneSynth/Kick Drum": "A tight kick drum. The pitch drops six octaves in 40 ms. The short decay stops it fast.",
    "MembraneSynth/Floor Tom": "A low tom. The pitch drops less and more slowly than the kick. The longer decay makes it round.",
    "MembraneSynth/Syndrum": "The disco drum. The triangle wave sweeps down slowly over a wide range. The echo repeats the sweep.",
    "MembraneSynth/808 Sub": "The booming 808 kick. The pitch drops only a little. The decay is long, and the distortion makes it heavy.",
    "MembraneSynth/Laser Zap": "A laser zap. The square wave dives five octaves. The echo repeats it. It starts at octave 3 so the sweep stays audible.",
    "MembraneSynth/Simmons Tom": "An 80s electronic tom. The pitch drops fast. A loud but very short reverb makes the gated room sound.",
    "MembraneSynth/Conga": "A hand drum. The pitch drops a tiny amount, very fast. The short decay makes the slap.",
    "MembraneSynth/Industrial Kick": "A crunchy kick. The pitch drops four octaves. Distortion at 0.6 adds the crunch.",
    "MetalSynth/Closed Hat": "A closed hi-hat. The metal tones do not fit a note, so it sounds like noise. The 80 ms decay keeps it tight.",
    "MetalSynth/Open Hat": "An open hi-hat. Same metal as the closed hat. The half-second decay lets it sizzle.",
    "MetalSynth/Crash": "A crash cymbal. A wider Harmonicity and a higher Modulation Index add more clang. The long decay washes into the reverb.",
    "MetalSynth/Gong": "A gong. The Frequency is low and the Resonance is dark. The 4.5 s decay rings in a huge room.",
    "MetalSynth/Ride Cymbal": "A ride cymbal. The metal is like the hats, but the decay is long and the Resonance is lower.",
    "MetalSynth/Cowbell": "An 808 cowbell. Two tones a fifth apart with almost no modulation make the clank.",
    "MetalSynth/Anvil": "A hammer on steel. The Frequency is low and the tones do not fit a note. Distortion and a short room add the clang.",
    "MetalSynth/Wind Chime": "Wind chimes. The Frequency is high and Harmonicity 12 adds glassy tones. The echo and the reverb make them float.",
    "MonoSynth/Acid Bass": "The 303 acid bass. The filter has high Q and a snappy filter envelope, so each note squelches. Distortion adds drive.",
    "MonoSynth/Thick Lead": "A fat solo sound. The square wave goes through a half-open filter. Full sustain holds the note, and chorus widens it.",
    "MonoSynth/Wah Bass": "A bass that says wah. The filter Q is high and the filter attack is slow, so each note opens up.",
    "MonoSynth/Muted Pluck": "A short, muted pluck. Sustain is zero and the filter closes fast. The echo repeats the pluck.",
    "MonoSynth/Outrun Bass": "The driving outrun bass. The filter opens for a moment on each note. Light distortion adds drive.",
    "MonoSynth/Scream Lead": "A screaming lead. The filter opens slowly with high Q, then heavy distortion makes it scream.",
    "MonoSynth/Slow Sweep": "A slow filter sweep. The filter has very high Q and opens over two seconds. The pwm wave adds movement.",
    "MonoSynth/Pew Zap": "A laser chirp. The filter Q is near maximum. The filter snaps shut in 80 ms, so each note goes pew.",
    "MonoSynth/Unison Bass": "A thick bass. Three sawtooths only 12 cents apart stay in tune but move. The low filter keeps the weight.",
    "NoiseSynth/Snare Hit": "A snare body. A burst of white noise with a short decay. A small reverb adds a little room.",
    "NoiseSynth/Hand Clap": "A hand clap. The delay repeats the noise after 11 ms, so it sounds like several hands.",
    "NoiseSynth/Wind Gust": "Wind. Pink noise fades in slowly. The dark filter and the wide chorus make it blow.",
    "NoiseSynth/Hiss Riser": "A build-up riser. White noise fades in over two seconds. The reverb and the delay make it grow.",
    "NoiseSynth/Gated Snare": "The 80s gated snare. A noise burst goes into a loud but very short reverb.",
    "NoiseSynth/Shaker": "A shaker. Bright white noise with a tiny soft attack and a fast decay.",
    "NoiseSynth/Thunder": "Thunder. Brown noise is deep. The low filter, the distortion and the huge reverb make it rumble.",
    "NoiseSynth/Radio Static": "A detuned radio. Heavy distortion on the noise, then a fast echo with high feedback makes it crackle.",
    "PluckSynth/Nylon Guitar": "A nylon guitar. A soft pick, medium dampening and a string that rings for a while.",
    "PluckSynth/Harp": "A harp. A very soft pick and a bright string. The big reverb adds the hall.",
    "PluckSynth/Banjo": "A banjo. A hard pick and a string that stops fast make the twang.",
    "PluckSynth/Pluck Bass": "A plucked bass. Dark dampening two octaves down. A little distortion adds warmth.",
    "PluckSynth/Crystal Arp": "A shimmering arpeggio sound. A soft pick and a bright string. The long delay repeats each note in time.",
    "PluckSynth/Funk Clav": "A funky clavinet. A hard pick and a short string. A little distortion adds drive.",
    "PluckSynth/Fuzz Guitar": "A fuzz guitar. The string rings for a long time, and heavy distortion makes it fuzzy.",
    "PluckSynth/Wood Block": "A wood block. A very hard pick and almost no string ring leave only a dry knock.",
    "PolySynth/Dreamy Pad": "A dreamy chord bed. Triangle chords with a slow attack. The dark filter, the chorus and the long reverb make it soft.",
    "PolySynth/Synth Brass": "80s synth brass. Sawtooth chords with a short attack. The chorus makes them wide.",
    "PolySynth/Organ": "A drawbar organ. The square 3 wave has odd overtones. The attack is instant and the sustain is full.",
    "PolySynth/Glass Keys": "Glassy electric keys. Triangle chords with a long decay and no sustain.",
    "PolySynth/Juno Strings": "A string ensemble, like a Juno. Sawtooth chords with a slow attack. The thick chorus makes the strings.",
    "PolySynth/Neon Stab": "Punchy chord stabs. Sawtooth chords that stop at once. The delay repeats them in time.",
    "PolySynth/Vapor Keys": "Washed-out vaporwave keys. Soft keys with a dark filter. The slow chorus and the huge reverb blur them.",
    "PolySynth/Arcade Chords": "8-bit console chords. Thin pulse chords with an organ-like envelope.",
    "PolySynth/Supersaw Pad": "A wide chord bed. Each note is three detuned sawtooths, so a three-note chord has nine voices. The slow attack and the big reverb make it float.",
    "PolySynth/Trance Chords": "Pumping trance chords. Fat sawtooth stabs with a short sustain. The dotted-eighth delay fills the gaps.",
};

function presetHint(type, name) {
    return presetHints[`${type}/${name}`] || '';
}

// User presets: same shape as the factory ones, per instrument type, in localStorage.
// They sit after the factory ones, so a preset index >= factory count means "mine".
const userPresets = {};
try {
    for (const [type, list] of Object.entries(JSON.parse(store.get('userPresets')) || {})) {
        userPresets[type] = Array.isArray(list) ? list.filter(p => p && typeof p.name === 'string' && p.params && typeof p.params === 'object') : [];
    }
} catch (_) { /* corrupt or blocked storage: start empty */ }

const factoryCount = (type) => synthPresets[type]?.length || 0;
const presetsFor = (type) => [...(synthPresets[type] || []), ...(userPresets[type] || [])];
const persistUserPresets = () => store.set('userPresets', JSON.stringify(userPresets));

// The floppy button opens the dialog; it is lit while one of my presets is loaded (then the dialog edits it).
function syncPresetActions(isUser) {
    const label = isUser ? 'Rename, update or delete this preset' : 'Save the sound as a preset';
    document.querySelectorAll('[data-preset-save]').forEach(btn => {
        btn.classList.toggle('editing', isUser);
        btn.setAttribute('aria-label', label);
        btn.title = label;
    });
}

// The current sound as a preset: every instrument control, the effects rack and the octave.
function snapshotPreset(name) {
    const params = {};
    document.querySelectorAll('#controls [data-control]').forEach(el => {
        params[el.dataset.control] = el.type === 'range' ? parseFloat(el.value) : el.value;
    });
    const effects = {};
    for (const key of Object.keys(effectHandlers)) effects[key] = parseFloat(document.getElementById(key).value);
    return { name, octave: state.currentOctave, effects, params };
}

function activePreset() {
    const type = document.getElementById('instrumentType').value;
    const index = parseInt(document.getElementById('presetSelect').value, 10);
    const mine = index - factoryCount(type);
    return { type, mine: mine >= 0 ? mine : -1 };
}

/* ---------- save / edit dialog ---------- */

const dialog = document.getElementById('presetDialog');
const nameInput = document.getElementById('presetName');
const newBtn = dialog.querySelector('[data-preset-op="new"]');
const delBtn = dialog.querySelector('[data-preset-op="delete"]');
const mainBtn = dialog.querySelector('[data-preset-op="main"]');
const toast = document.getElementById('toast');
let toastTimer = null;

function showToast(text) {
    toast.textContent = text;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 2000);
}

function resetDelete() {
    delBtn.classList.remove('armed');
    delBtn.textContent = 'Delete';
}

function openPresetDialog() {
    const { type, mine } = activePreset();
    const current = mine >= 0 ? userPresets[type][mine] : null;
    document.getElementById('presetDialogTitle').textContent = current ? 'Edit preset' : 'Save preset';
    document.getElementById('presetDialogHint').textContent = current
        ? 'Update replaces this preset with the sound you hear now. Rename it here too.'
        : `Keeps the knobs, wave, effects and octave of this ${document.getElementById('instrumentType').selectedOptions[0].textContent}.`;
    nameInput.value = current ? current.name : '';
    newBtn.hidden = delBtn.hidden = !current;
    mainBtn.textContent = current ? 'Update' : 'Save';
    resetDelete();
    dialog.showModal();
    nameInput.select();
}

// Save a new preset, or (default on an edit) replace the loaded one; either way it ends up loaded.
function commitPreset(asNew) {
    const { type, mine } = activePreset();
    const name = nameInput.value.trim();
    const list = (userPresets[type] ||= []);
    const replace = mine >= 0 && !asNew;
    if (replace) list[mine] = snapshotPreset(name); else list.push(snapshotPreset(name));
    persistUserPresets();
    updatePresetBar(type);
    applyPreset(type, factoryCount(type) + (replace ? mine : list.length - 1));
    dialog.close();
    showToast(`${replace ? 'Updated' : 'Saved'} "${name}"`);
}

// Two clicks: the first arms the button ("Sure?"), the second deletes.
function deletePreset() {
    if (!delBtn.classList.contains('armed')) {
        delBtn.classList.add('armed');
        delBtn.textContent = 'Sure?';
        return;
    }
    const { type, mine } = activePreset();
    if (mine < 0) return;
    const [gone] = userPresets[type].splice(mine, 1);
    persistUserPresets();
    updatePresetBar(type);
    showCustomPreset('Custom'); // the sound stays as it is
    dialog.close();
    showToast(`Deleted "${gone.name}"`);
}

function applyPreset(type, presetIndex) {
    const preset = presetsFor(type)[presetIndex];
    if (!preset) return;
    const isUser = presetIndex >= factoryCount(type);

    // Apply each param to the synth engine and update UI controls
    const controlsDiv = document.getElementById('controls');
    for (const [param, value] of Object.entries(preset.params)) {
        updateSynthParameter(param, value);

        const el = controlsDiv.querySelector(`[data-control="${param}"]`);
        if (!el) continue;

        if (el.tagName === 'SELECT') {
            el.value = value;
            refreshWavePreview(el);
        } else {
            el.value = value;
            const valueDisplay = document.getElementById(`${el.id}Value`);
            if (valueDisplay) {
                // Extract suffix from current display text (e.g. " Sec", " Hz", " dB")
                const suffix = valueDisplay.textContent.replace(/^[\d.\-]+/, '');
                valueDisplay.textContent = value + suffix;
            }
            el.setAttribute('aria-valuenow', value);
            updateSliderFill(el);
        }
    }

    // Set octave if preset specifies one
    if (preset.octave !== undefined && preset.octave !== state.currentOctave) {
        state.currentOctave = preset.octave;
        document.getElementById('currentOctave').textContent = state.currentOctave;
        createKeyboard();
        updateOctaveButtons();
    }

    // Apply the full effects rack: keys the preset omits fall back to defaults,
    // so every preset sounds the same regardless of what was selected before.
    const fx = { ...EFFECT_DEFAULTS, ...(preset.effects || {}) };
    for (const key of Object.keys(effectHandlers)) {
        setEffect(key, fx[key]);
    }

    document.dispatchEvent(new Event('presetapplied')); // previews that mirror the knobs (envelope curves) redraw

    // Update active preset button, the desktop select and every name / hint slot
    document.querySelectorAll('#presetBar .preset-btn').forEach(btn => btn.classList.remove('active'));
    const activeBtn = document.querySelector(`#presetBar .preset-btn[data-preset="${presetIndex}"]`);
    if (activeBtn) activeBtn.classList.add('active');
    syncPresetSelects(String(presetIndex), 'Pick a preset');
    setPresetHintText(isUser ? '' : presetHint(type, preset.name));
    syncPresetActions(isUser);
}

// Every preset select (desktop row, pocket strip) shows the same option; '' picks the placeholder,
// whose text is the name of a sound that is not a preset ("Random", "Custom").
function syncPresetSelects(index, placeholder) {
    document.querySelectorAll('.preset-select').forEach(select => {
        select.options[0].textContent = placeholder;
        select.value = index;
    });
}

// Shows a name that is not one of the 8 presets (e.g. "Random"): nothing active, no hint.
function showCustomPreset(name) {
    document.querySelectorAll('#presetBar .preset-btn').forEach(btn => btn.classList.remove('active'));
    syncPresetSelects('', name); // no option matches: the placeholder shows the name
    setPresetHintText('');
    syncPresetActions(false);
}

// Fills every preset-hint slot; the ? buttons are disabled while there is
// nothing to show (no preset picked yet, or a preset without a line).
function setPresetHintText(text) {
    document.querySelectorAll('[data-preset-hint]').forEach(el => {
        el.textContent = text;
        if (!text) el.hidden = true;
    });
    document.querySelectorAll('.preset-help').forEach(btn => {
        btn.disabled = !text;
        if (!text) btn.setAttribute('aria-expanded', 'false');
    });
}

function updatePresetBar(type) {
    const bar = document.getElementById('presetBar');
    bar.innerHTML = '';

    const presets = presetsFor(type);
    if (!presets.length) return;
    const factory = factoryCount(type);

    const label = document.createElement('span');
    label.className = 'preset-label';
    label.textContent = 'Presets:';
    bar.appendChild(label);

    presets.forEach((preset, i) => {
        const btn = document.createElement('button');
        btn.className = 'preset-btn';
        btn.textContent = preset.name;
        btn.dataset.preset = i;
        btn.title = i < factory ? presetHint(type, preset.name) : '';
        btn.addEventListener('click', () => applyPreset(type, i));
        bar.appendChild(btn);
    });

    // The selects (desktop row, pocket strip); the buttons above stay the source of truth
    document.querySelectorAll('.preset-select').forEach(select => {
        select.innerHTML = '<option value="" disabled selected>Pick a preset</option>';
        let mine = null;
        presets.forEach((preset, i) => {
            const opt = document.createElement('option');
            opt.value = String(i);
            opt.textContent = preset.name;
            if (i < factory) { select.appendChild(opt); return; }
            if (!mine) { mine = document.createElement('optgroup'); mine.label = 'My presets'; select.appendChild(mine); }
            mine.appendChild(opt);
        });
        select.onchange = () => { if (select.value !== '') applyPreset(type, parseInt(select.value, 10)); };
    });
    setPresetHintText('');
    syncPresetActions(false);
}

document.querySelectorAll('[data-preset-save]').forEach(btn => btn.addEventListener('click', openPresetDialog));
document.getElementById('presetForm').addEventListener('submit', (e) => { e.preventDefault(); commitPreset(false); });
newBtn.addEventListener('click', () => { if (nameInput.reportValidity()) commitPreset(true); });
delBtn.addEventListener('click', deletePreset);
dialog.querySelector('[data-dialog-close]').addEventListener('click', () => dialog.close());
dialog.addEventListener('click', (e) => { if (e.target === dialog) dialog.close(); }); // the backdrop

export { synthDescriptions, synthPresets, presetHints, presetsFor, applyPreset, updatePresetBar, showCustomPreset };
