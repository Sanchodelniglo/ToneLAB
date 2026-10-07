// Effects rack: Tone.js effect chain, defaults, per-effect handlers, master volume,
// and the load-time listeners/knobs for the static effect sliders.
import { state } from '../state.js';
import { updateSliderFill, attachKnobsToAll } from '../ui/knobs.js';

// Initialize effects
// Chain: Synth → Chorus → Filter → Distortion → Delay → Reverb → Limiter → Destination
function initEffects() {
    // Brick-wall limiter so stacked chords, distortion and hot presets never clip the output.
    state.limiter = new Tone.Limiter(-1).toDestination();
    state.reverb = new Tone.Reverb({ decay: EFFECT_DEFAULTS.reverbSize, preDelay: 0.02, wet: EFFECT_DEFAULTS.reverb }).connect(state.limiter);
    state.delay = new Tone.FeedbackDelay({ delayTime: EFFECT_DEFAULTS.delayTime, feedback: EFFECT_DEFAULTS.delayFeedback, wet: EFFECT_DEFAULTS.delayMix }).connect(state.reverb);
    // 2x oversampling tames the aliasing fizz of the waveshaper at high drive.
    state.distortion = new Tone.Distortion({ distortion: 0, oversample: '2x', wet: 0 }).connect(state.delay);
    state.filter = new Tone.Filter({ frequency: EFFECT_DEFAULTS.filterFreq, type: 'lowpass' }).connect(state.distortion);
    state.chorus = new Tone.Chorus({ frequency: EFFECT_DEFAULTS.chorusRate, delayTime: 3.5, depth: 0.7, wet: EFFECT_DEFAULTS.chorusMix }).connect(state.filter);
    state.chorus.start();
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
    reverbDecayTimer = setTimeout(() => { if (state.reverb) state.reverb.decay = seconds; }, 150);
}

const effectHandlers = {
    reverb:        { suffix: '',    apply: v => { if (state.reverb) state.reverb.wet.value = v; } },
    reverbSize:    { suffix: ' Sec',   apply: v => setReverbDecay(v) },
    // Ramp instead of jump: a hard delayTime change produces a click / pitch zip.
    delayTime:     { suffix: ' Sec',   apply: v => { if (state.delay) state.delay.delayTime.rampTo(v, 0.05); } },
    delayFeedback: { suffix: '',    apply: v => { if (state.delay) state.delay.feedback.value = v; } },
    delayMix:      { suffix: '',    apply: v => { if (state.delay) state.delay.wet.value = v; } },
    // Wet follows drive so the first few percent add warmth rather than a sudden 50% blend.
    distortion:    { suffix: '',    apply: v => { if (state.distortion) { state.distortion.distortion = v; state.distortion.wet.value = Math.min(1, v * 2); } } },
    filterFreq:    { suffix: ' Hz', apply: v => { if (state.filter) state.filter.frequency.rampTo(v, 0.02); } },
    chorusRate:    { suffix: ' Hz', apply: v => { if (state.chorus) state.chorus.frequency.value = v; } },
    chorusMix:     { suffix: '',    apply: v => { if (state.chorus) state.chorus.wet.value = v; } },
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

// Attach knobs to effects sliders
attachKnobsToAll();

export { initEffects, EFFECT_DEFAULTS, effectHandlers, setEffect, initMasterVolume };
