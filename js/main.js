// Entry point: pulls in every module (load-time listeners run on import), starts audio
// on the first click via init(), and exposes a small window.ToneLAB debug surface.
import './theme.js';
import './crt.js';
import { state, detectKeyboardLayout } from './state.js';
import { initEffects, initMasterVolume, setEffect } from './audio/effects.js';
import { initSynth, playNote, stopNote, nextTriggerTime, getLastTriggerTime, bumpLastTriggerTime } from './audio/synth.js';
import { applyPreset } from './audio/presets.js';
import { updateControls } from './ui/controls.js';
import { createKeyboard } from './ui/keyboard.js';
import { scope } from './ui/scope.js';
import './pwa.js';
import './ui/mobile.js';
import './ui/randomize.js';
import { initArp, setArp } from './ui/arp.js';
import { buildTextPicker } from './ui/wavePreview.js';
import './ui/learn.js';

// Every select in the page gets the wave picker look (wave selects get theirs in controls.js)
document.querySelectorAll('select:not(.wave-select)').forEach(buildTextPicker);

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
        scope.start(state.limiter);
        initMasterVolume();
        initSynth('MonoSynth');
        updateControls('MonoSynth');

        state.userLayout = detectKeyboardLayout();
        document.getElementById('keyboardLayout').value = state.userLayout;

        createKeyboard();
        initArp();
        state.audioInitialized = true;


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
            const content = overlay.querySelector('.audio-overlay-tap');
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
        if (!state.audioInitialized) init();
    });
}

// Also allow any click if overlay was somehow missed
document.body.addEventListener('click', () => {
    if (!state.audioInitialized) init();
}, { once: true });

// Debug surface for scripts/smoke.sh (open index.html#debug); the app itself never reads it.
if (location.hash === '#debug') window.ToneLAB = {
    state,
    playNote,
    stopNote,
    scope,
    setEffect,
    updateControls,
    applyPreset,
    get learnSteps() { return import('./ui/learn.js').then(m => m.STEPS); },
    setArp,
    // Same contract as the old initSynth, which rebuilt the control panel itself.
    initSynth: (type) => { initSynth(type); updateControls(type); },
    nextTriggerTime: () => nextTriggerTime(),
    bumpLastTriggerTime,
    get lastTriggerTime() { return getLastTriggerTime(); }
};
