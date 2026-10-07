// Synth descriptions, factory presets, preset application and the preset bar UI.
import { state } from '../state.js';
import { updateSynthParameter } from './synth.js';
import { setEffect, EFFECT_DEFAULTS, effectHandlers } from './effects.js';
import { updateSliderFill } from '../ui/knobs.js';
import { createKeyboard, updateOctaveButtons } from '../ui/keyboard.js';

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

export { synthDescriptions, synthPresets, applyPreset, updatePresetBar };
