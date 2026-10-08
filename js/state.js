// Shared mutable state (former top-level lets of script.js) plus the keyboard layout,
// dead-key and note-label tables every module reads.

// Initialize audio context
export const state = {
    synth: null,
    reverb: null,
    delay: null,
    distortion: null,
    filter: null,
    chorus: null,
    limiter: null,
    currentInstrumentType: 'Synth',
    currentOctave: 4,
    minOctave: 0,
    maxOctave: 7,
    activeKeys: new Set(),
    activeTouches: new Map(),
    hold: false,              // HOLD (latch) switch on the keyboard panel
    heldNotes: new Set(),     // notes latched by HOLD, e.g. 'C4'; they ring until unlatched
    arpDown: new Set(),       // notes physically down while the arp runs (HOLD off): feed the pattern, drop on release
    userLayout: 'qwerty',
    noteNotation: localStorage.getItem('noteNotation') || 'english',
    oscSpread: 20,            // detune in cents for fat waves; re-applied whenever the wave becomes fat
    audioInitialized: false
};

// Keyboard layouts — 2 octaves (25 notes: C to C)
// Bottom row = octave 1, top row = octave 2
export const keyboardLayouts = {
    qwerty: ['a','w','s','e','d','f','t','g','y','h','u','j','k','o','l','p',';','\'','[',']'],
    azerty: ['q','z','s','e','d','f','t','g','y','h','u','j','k','o','l','p','m','ù','^','$'],
    qwertz: ['a','w','s','e','d','f','t','g','z','h','u','j','k','o','l','p','ö','ä','ü','+'],
    dvorak: ['a',',','o','e','.','u','k','i','x','d','b','h','n','l','s',';','q','j','w','v']
};

// Map physical key codes to layout characters for dead keys
export const deadKeyCodeMap = {
    'BracketLeft': '^',
    'BracketRight': '$'
};

// Note display labels by notation system
export const noteLabels = {
    english: { 'C': 'C', 'C#': 'C#', 'D': 'D', 'D#': 'D#', 'E': 'E', 'F': 'F', 'F#': 'F#', 'G': 'G', 'G#': 'G#', 'A': 'A', 'A#': 'A#', 'B': 'B' },
    solfege: { 'C': 'Do', 'C#': 'Do#', 'D': 'Ré', 'D#': 'Ré#', 'E': 'Mi', 'F': 'Fa', 'F#': 'Fa#', 'G': 'Sol', 'G#': 'Sol#', 'A': 'La', 'A#': 'La#', 'B': 'Si' }
};

export function getDisplayLabel(noteLabel) {
    return noteLabels[state.noteNotation]?.[noteLabel] || noteLabel;
}

// Detect user's keyboard layout
export function detectKeyboardLayout() {
    const savedLayout = localStorage.getItem('keyboardLayout');
    if (savedLayout && keyboardLayouts[savedLayout]) {
        return savedLayout;
    }
    return 'qwerty';
}
