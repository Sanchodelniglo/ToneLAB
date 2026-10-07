// Entry point: pulls in every module (load-time listeners run on import), starts audio
// on the first click via init(), and exposes a small window.ToneLAB debug surface.
import './crt.js';
import { state, detectKeyboardLayout } from './state.js';
import { initEffects, initMasterVolume, setEffect } from './audio/effects.js';
import { initSynth, playNote, stopNote, nextTriggerTime, getLastTriggerTime, bumpLastTriggerTime } from './audio/synth.js';
import { applyPreset } from './audio/presets.js';
import { updateControls } from './ui/controls.js';
import { createKeyboard } from './ui/keyboard.js';
import { scope } from './ui/scope.js';
import './pwa.js';

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
        initSynth('Synth');
        updateControls('Synth');

        state.userLayout = detectKeyboardLayout();
        document.getElementById('keyboardLayout').value = state.userLayout;

        createKeyboard();
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
        if (!state.audioInitialized) init();
    });
}

// Also allow any click if overlay was somehow missed
document.body.addEventListener('click', () => {
    if (!state.audioInitialized) init();
}, { once: true });

// Debug surface for the smoke test; the app itself never reads it.
window.ToneLAB = {
    state,
    playNote,
    stopNote,
    scope,
    setEffect,
    updateControls,
    applyPreset,
    // Same contract as the old initSynth, which rebuilt the control panel itself.
    initSynth: (type) => { initSynth(type); updateControls(type); },
    nextTriggerTime: () => nextTriggerTime(),
    bumpLastTriggerTime,
    get lastTriggerTime() { return getLastTriggerTime(); }
};
