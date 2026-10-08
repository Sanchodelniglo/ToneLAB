// On-screen keyboard: key rendering, octave/layout/notation controls, computer-keyboard
// input, and the mobile multi-touch handling.
import { state, keyboardLayouts, deadKeyCodeMap, getDisplayLabel } from '../state.js';
import { playNote, stopNote } from '../audio/synth.js';

/* ============================================
   NOTE ON/OFF WITH HOLD (LATCH)
   Every input path (mouse, computer keyboard, touch) goes through noteOn /
   noteOff so HOLD behaves the same everywhere.
   ============================================ */

function keysForNote(note) {
    return document.querySelectorAll(`.key[data-note="${note}"]`);
}

// Start a note. With HOLD on, pressing a key that is already latched releases
// it instead and returns false, so the caller must not track that press.
// Mono instruments have a single voice: a new note takes over any latched one.
function noteOn(note, el) {
    // Arp running: keys only edit the note set, the arp does the playing.
    // HOLD on = latch (tap again to drop), HOLD off = only while pressed.
    if (state.arp?.on) {
        if (state.hold) {
            if (state.heldNotes.has(note)) {
                state.heldNotes.delete(note);
                keysForNote(note).forEach(k => k.classList.remove('pressed'));
                return false;
            }
            state.heldNotes.add(note);
        } else {
            state.arpDown.add(note);
        }
        el.classList.add('pressed');
        return true;
    }
    if (state.hold && state.heldNotes.has(note)) {
        unlatch(note);
        return false;
    }
    if (state.hold && state.currentInstrumentType !== 'PolySynth') {
        clearHeldVisuals();
    }
    playNote(note);
    el.classList.add('pressed');
    return true;
}

// End a press. With HOLD on the note latches and keeps its .pressed look;
// otherwise it is released as usual.
function noteOff(note, el) {
    if (state.hold) {
        state.heldNotes.add(note);
        return;
    }
    if (state.arp?.on) {
        state.arpDown.delete(note);
        el.classList.remove('pressed');
        return;
    }
    el.classList.remove('pressed');
    stopNote(note);
}

function unlatch(note) {
    state.heldNotes.delete(note);
    keysForNote(note).forEach(k => k.classList.remove('pressed'));
    if (state.arp?.on) return; // the arp owns the voice
    stopNote(note);
    // stopNote blanks the readout when nothing is physically pressed; if other
    // notes are still latched, show the most recent one instead.
    if (state.heldNotes.size > 0) {
        const last = Array.from(state.heldNotes).pop();
        const el = document.getElementById('currentNote');
        if (el) el.textContent = getDisplayLabel(last.replace(/\d+/, '')) + (last.match(/\d+/)?.[0] || '');
    }
}

// Forget latched notes without releasing the voice (mono: the new attack owns it)
function clearHeldVisuals() {
    state.heldNotes.forEach(note => keysForNote(note).forEach(k => k.classList.remove('pressed')));
    state.heldNotes.clear();
}

// Release every latched note: HOLD switched off, or the instrument changed.
function releaseHeld() {
    Array.from(state.heldNotes).forEach(unlatch);
}

function setHold(on) {
    state.hold = on;
    const btn = document.getElementById('holdBtn');
    if (btn) {
        btn.setAttribute('aria-pressed', String(on));
        btn.classList.toggle('active', on);
    }
    if (!on) releaseHeld();
    document.dispatchEvent(new CustomEvent('hold-change', { detail: { on } }));
}

// Haptic tick. Only meaningful inside a touch handler (Android needs the user
// gesture; iOS has no API, so the guard simply skips it there).
function vibrate(ms) {
    if (typeof navigator.vibrate === 'function') navigator.vibrate(ms);
}

// Create keyboard
// Pocket layout (< 1024px): as many octaves as fit at a thumb-wide white key,
// capped by the computer-key mapping (two octaves). Desktop keys are fixed
// width, always two octaves.
const MIN_WHITE_KEY_PX = 46;
const MAX_OCTAVES = 2;
const pocketQuery = window.matchMedia('(max-width: 1023px)');
let drawnOctaves = 0;

function octaveCountFor() {
    if (!pocketQuery.matches) return MAX_OCTAVES;
    const keyboard = document.getElementById('keyboard');
    const width = keyboard?.clientWidth || window.innerWidth;
    return Math.max(1, Math.min(MAX_OCTAVES, Math.floor(width / (7 * MIN_WHITE_KEY_PX))));
}

// Rotating the phone or resizing the window changes how many octaves fit
let resizeTimer = null;
window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
        if (state.audioInitialized && octaveCountFor() !== drawnOctaves) createKeyboard();
    }, 120);
});

function createKeyboard() {
    const keyboard = document.getElementById('keyboard');
    keyboard.innerHTML = '';

    const keys = keyboardLayouts[state.userLayout];
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

    const octaveCount = octaveCountFor();
    drawnOctaves = octaveCount;
    const notes = [];
    let keyIndex = 0;
    for (let oct = 0; oct < octaveCount; oct++) {
        const octNum = state.currentOctave + oct;
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

        // Mouse handlers. The flag makes mouseup/mouseleave a no-op when the
        // mousedown only unlatched a held note (noteOn returned false).
        let mouseHeld = false;
        keyEl.addEventListener('mousedown', () => {
            mouseHeld = noteOn(n.note, keyEl);
        });
        const mouseRelease = () => {
            if (!mouseHeld) return;
            mouseHeld = false;
            noteOff(n.note, keyEl);
        };
        keyEl.addEventListener('mouseup', mouseRelease);
        keyEl.addEventListener('mouseleave', mouseRelease);

        // Keyboard activation (Enter/Space) for accessibility
        let keyHeld = false;
        keyEl.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                if (e.repeat || keyHeld) return;
                keyHeld = noteOn(n.note, keyEl);
            }
        });
        keyEl.addEventListener('keyup', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                if (!keyHeld) return;
                keyHeld = false;
                noteOff(n.note, keyEl);
            }
        });

        keyboard.appendChild(keyEl);
    });

    // Latched notes keep ringing across octave/layout rebuilds: restore their lit look
    state.heldNotes.forEach(note => keysForNote(note).forEach(k => k.classList.add('pressed')));

    // Initialize mobile touch handling (only once)
    enhanceMobileTouchHandling();
}

// HOLD (latch) toggle
document.getElementById('holdBtn')?.addEventListener('click', () => {
    setHold(!state.hold);
});

// Switching instrument rebuilds the synth (controls.js): drop the latched notes with it.
// controls.js registers first (module order), so by now the old voice has been released.
// Instrument switch releases latched notes, unless the arp is playing them
// on the new sound
document.getElementById('instrumentType')?.addEventListener('change', () => { if (!state.arp?.on) releaseHeld(); });

// Octave controls
document.getElementById('octaveUp').addEventListener('click', () => {
    if (state.currentOctave < state.maxOctave) {
        state.currentOctave++;
        document.getElementById('currentOctave').textContent = state.currentOctave;
        createKeyboard();
        updateOctaveButtons();
        if (pocketQuery.matches) {
            centerKeyboard();
        }
    }
});

document.getElementById('octaveDown').addEventListener('click', () => {
    if (state.currentOctave > state.minOctave) {
        state.currentOctave--;
        document.getElementById('currentOctave').textContent = state.currentOctave;
        createKeyboard();
        updateOctaveButtons();
        if (pocketQuery.matches) {
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
        if (state.currentOctave > state.minOctave) {
            state.currentOctave--;
            document.getElementById('currentOctave').textContent = state.currentOctave;
            createKeyboard();
            updateOctaveButtons();
        }
        return;
    } else if (key === 'arrowright' && !isFormControl) {
        e.preventDefault();
        if (state.currentOctave < state.maxOctave) {
            state.currentOctave++;
            document.getElementById('currentOctave').textContent = state.currentOctave;
            createKeyboard();
            updateOctaveButtons();
        }
        return;
    }

    // Note playing — only block if focused on a select or text input (where letter keys have native behavior)
    if (tag === 'SELECT' || tag === 'TEXTAREA' || (tag === 'INPUT' && document.activeElement.type !== 'range')) return;

    const keyElement = document.querySelector(`[data-keyboard-key="${key}"]`);
    if (keyElement && !state.activeKeys.has(key)) {
        if (noteOn(keyElement.dataset.note, keyElement)) {
            state.activeKeys.add(key);
        }
    }
});

document.addEventListener('keyup', (e) => {
    let key = e.key.toLowerCase();
    if (key === 'dead' && deadKeyCodeMap[e.code]) {
        key = deadKeyCodeMap[e.code];
    }

    if (key === 'arrowleft' || key === 'arrowright') return;

    const keyElement = document.querySelector(`[data-keyboard-key="${key}"]`);
    if (keyElement && state.activeKeys.has(key)) {
        state.activeKeys.delete(key);
        noteOff(keyElement.dataset.note, keyElement);
    }
});

// Keyboard layout selector
document.getElementById('keyboardLayout').addEventListener('change', (e) => {
    state.userLayout = e.target.value;
    localStorage.setItem('keyboardLayout', state.userLayout);
    createKeyboard();
    e.target.blur();
});

// Note notation selector
document.getElementById('noteNotation').value = state.noteNotation;
document.getElementById('noteNotation').addEventListener('change', (e) => {
    state.noteNotation = e.target.value;
    localStorage.setItem('noteNotation', state.noteNotation);
    createKeyboard();
    e.target.blur();
});

/* ============================================
   ENHANCED MOBILE TOUCH OPTIMIZATION
   ============================================ */

// Multi-touch state management
let isPlayingNotes = false;

// Configuration
const touchConfig = {
    slideGestureEnabled: true,
    hapticDuration: 8,
    touchMoveThreshold: 5
};

// Update octave button states
function updateOctaveButtons() {
    const octaveUpBtn = document.getElementById('octaveUp');
    const octaveDownBtn = document.getElementById('octaveDown');

    if (octaveUpBtn && octaveDownBtn) {
        octaveUpBtn.disabled = state.currentOctave >= state.maxOctave;
        octaveDownBtn.disabled = state.currentOctave <= state.minOctave;
        octaveUpBtn.setAttribute('aria-disabled', state.currentOctave >= state.maxOctave);
        octaveDownBtn.setAttribute('aria-disabled', state.currentOctave <= state.minOctave);
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
            const middleKey = keyboard.querySelector(`[data-note="E${state.currentOctave}"]`);
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

        if (key && !state.activeTouches.has(touch.identifier)) {
            const note = key.dataset.note;

            // A tap on a latched key releases it and is not tracked as a touch
            if (!noteOn(note, key)) return;

            state.activeTouches.set(touch.identifier, {
                key: key.dataset.note,
                note: note,
                element: key,
                startX: touch.clientX,
                startY: touch.clientY
            });

            vibrate(touchConfig.hapticDuration);
        }
    });
}

function handleTouchMove(e) {
    if (!touchConfig.slideGestureEnabled) return;

    e.preventDefault();

    Array.from(e.changedTouches).forEach(touch => {
        const touchData = state.activeTouches.get(touch.identifier);
        if (!touchData) return;

        const deltaX = Math.abs(touch.clientX - touchData.startX);
        const deltaY = Math.abs(touch.clientY - touchData.startY);

        if (deltaX > touchConfig.touchMoveThreshold || deltaY > touchConfig.touchMoveThreshold) {
            const element = document.elementFromPoint(touch.clientX, touch.clientY);
            const newKey = element?.closest('.key');

            if (newKey && newKey !== touchData.element) {
                const oldNote = touchData.note;
                const oldEl = touchData.element;
                const newNote = newKey.dataset.note;

                // Legato glide: leaving the old key ends its press (it latches
                // under HOLD; mono voices keep sounding since the touch is still
                // active, so the new attack slides the pitch), then the new key starts.
                noteOff(oldNote, oldEl);

                touchData.element = newKey;
                touchData.note = newNote;
                touchData.key = newNote;

                // Sliding onto an already-latched key just adopts it: no retrigger
                if (!(state.hold && state.heldNotes.has(newNote))) {
                    noteOn(newNote, newKey);
                    vibrate(touchConfig.hapticDuration);
                }
            }
        }
    });
}

function handleTouchEnd(e) {
    e.preventDefault();

    Array.from(e.changedTouches).forEach(touch => {
        const touchData = state.activeTouches.get(touch.identifier);

        if (touchData) {
            state.activeTouches.delete(touch.identifier);
            noteOff(touchData.note, touchData.element);
        }
    });

    if (state.activeTouches.size === 0) {
        isPlayingNotes = false;
    }
}

function handleTouchCancel(e) {
    e.preventDefault();

    Array.from(e.changedTouches).forEach(touch => {
        const touchData = state.activeTouches.get(touch.identifier);

        if (touchData) {
            state.activeTouches.delete(touch.identifier);
            noteOff(touchData.note, touchData.element);
        }
    });

    if (state.activeTouches.size === 0) {
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

    if (pocketQuery.matches) {
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

// Key labels: the note name and the computer key are two independent
// toggles (chips in the keyboard bar, rows in the ⋯ sheet). Computer keys
// default to off on touch devices, where there is no keyboard to map.
const KEY_LABEL_STORE = { note: 'noteLabels', key: 'keyLabels' };
const KEY_LABEL_DATA = { note: 'noteLabels', key: 'keyLabels' };

function setKeyLabel(kind, on) {
    document.body.dataset[KEY_LABEL_DATA[kind]] = on ? 'on' : 'off';
    document.querySelectorAll(`.chip[data-key-label="${kind}"]`).forEach(btn => {
        btn.classList.toggle('active', on);
        btn.setAttribute('aria-pressed', String(on));
    });
    try { localStorage.setItem(KEY_LABEL_STORE[kind], on ? 'on' : 'off'); } catch (_) { /* private mode */ }
}

document.querySelectorAll('.chip[data-key-label]').forEach(btn => {
    btn.addEventListener('click', () => {
        setKeyLabel(btn.dataset.keyLabel, btn.getAttribute('aria-pressed') !== 'true');
        btn.blur();
    });
});

for (const kind of ['note', 'key']) {
    let stored = null;
    try { stored = localStorage.getItem(KEY_LABEL_STORE[kind]); } catch (_) { /* private mode */ }
    const fallback = kind === 'key' && pocketQuery.matches ? 'off' : 'on';
    setKeyLabel(kind, (stored || fallback) === 'on');
}

export { createKeyboard, updateOctaveButtons, updateScrollIndicators, centerKeyboard, releaseHeld, setHold };
