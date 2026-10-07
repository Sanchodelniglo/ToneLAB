// On-screen keyboard: key rendering, octave/layout/notation controls, computer-keyboard
// input, and the mobile multi-touch handling.
import { state, keyboardLayouts, deadKeyCodeMap, getDisplayLabel } from '../state.js';
import { playNote, stopNote } from '../audio/synth.js';

// Create keyboard
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

    const isMobile = window.innerWidth <= 768;
    const octaveCount = isMobile ? 1 : 2;
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

// Octave controls
document.getElementById('octaveUp').addEventListener('click', () => {
    if (state.currentOctave < state.maxOctave) {
        state.currentOctave++;
        document.getElementById('currentOctave').textContent = state.currentOctave;
        createKeyboard();
        updateOctaveButtons();
        if (window.innerWidth <= 768) {
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
        state.activeKeys.add(key);
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
    if (keyElement && state.activeKeys.has(key)) {
        const note = keyElement.dataset.note;
        state.activeKeys.delete(key);
        keyElement.classList.remove('pressed');
        stopNote(note);
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
    hapticDuration: 15,
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

            state.activeTouches.set(touch.identifier, {
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
        const touchData = state.activeTouches.get(touch.identifier);
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
                if (state.currentInstrumentType === 'PolySynth') {
                    try { state.synth.triggerRelease(oldNote); } catch(err) { /* ignore */ }
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
        const touchData = state.activeTouches.get(touch.identifier);

        if (touchData) {
            touchData.element.classList.remove('pressed');
            state.activeTouches.delete(touch.identifier);
            stopNote(touchData.note);
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
            touchData.element.classList.remove('pressed');
            state.activeTouches.delete(touch.identifier);
            stopNote(touchData.note);
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

export { createKeyboard, updateOctaveButtons, updateScrollIndicators, centerKeyboard };
