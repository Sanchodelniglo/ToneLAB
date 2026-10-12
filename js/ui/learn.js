// Learn mode (Settings, off by default): a guided path through every knob of the Mono Synth and the
// effects rack, one knob per step. Learn starts from zero: every knob still to learn sits at 0 (or its
// minimum), except the few the sound needs before their turn (Sustain, the cutoffs, effect rates), which
// wait at a playable value and drop to zero when their step comes.
// Effects are heard solo: when a step moves on to the next effect, the one just learned goes back to off
// (its zero / waiting value). The values the player chose are kept and all come back together at the end.
// The current section is framed and its knob marked; later sections are dimmed but usable (suggest,
// never lock). Only the player's own moves on the current knob count: RND sets state.autoInput, preset
// loads send no events, and the zeroing below writes with autoInput on.
import { state, store } from '../state.js';
import { showToast } from '../audio/presets.js';

const LEARN_TYPE = 'MonoSynth'; // the only synth with Oscillator + Envelope + Filter + Filter Envelope

// A filter needs overtones to remove (a sine has none), and a filter sweep is masked by a slow amp attack
// or an open cutoff. Before those steps Learn sets up the sound, only when needed, and says what it changed.
const num = (ctl) => parseFloat(ctlValue(ctl));
function richWave() {
    if (/saw|square|pulse|pwm/.test(ctlValue('oscType'))) return '';
    setCtl('oscType', 'sawtooth');
    return 'Learn picked a sawtooth: a filter needs overtones to remove.';
}
function sweepReady() {
    const notes = [richWave()];
    if (num('attack') > 0.02) { setCtl('attack', 0.005); notes.push('a short amp Attack'); }
    if (num('filterCutoff') > 400) { setCtl('filterCutoff', 200); notes.push('a low Cutoff'); }
    const set = notes.slice(1);
    return [notes[0], set.length ? `Learn set ${set.join(' and ')} so you hear the sweep.` : ''].filter(Boolean).join(' ');
}

// ctl = data-control (instrument) or element id (effects); start = its zero; wait = playable value before its step;
// prep = sets up the sound before the step, returns a note for the player
const STEPS = [
    { set: 'Oscillator', ctl: 'oscType', name: 'Wave', start: 'sine',
      task: 'Try 3 different wave shapes: each one has its own colour.', done: (v, p) => p.waves.size >= 3 },
    { set: 'Oscillator', ctl: 'spread', name: 'Spread', start: 0,
      task: 'Pick a fat wave, then turn Spread above 30 ct: three copies drift apart and the sound gets wide.',
      done: (v) => v > 30 && ctlValue('oscType').startsWith('fat') },
    { set: 'Envelope', ctl: 'attack', name: 'Attack', start: 0,
      task: 'Turn Attack above 0.5 s: each note fades in.', done: (v) => v > 0.5 },
    { set: 'Envelope', ctl: 'sustain', name: 'Sustain', start: 0, wait: 1,
      task: 'Sustain is at 0, so the note dies after the attack. Raise it above 0.5 to hold the note while you press.', done: (v) => v > 0.5 },
    { set: 'Envelope', ctl: 'decay', name: 'Decay', start: 0,
      task: 'Turn Decay above 0.5 s: after the attack, the note now falls slowly to the Sustain level.', done: (v) => v > 0.5 },
    { set: 'Envelope', ctl: 'release', name: 'Release', start: 0,
      task: 'Turn Release above 1 s: the note keeps ringing after you let go.', done: (v) => v > 1 },
    { set: 'Filter', ctl: 'filterCutoff', prep: richWave, name: 'Cutoff', start: 20, wait: 20000,
      task: 'The filter is closed, so the sound is dark and dull. Turn Cutoff above 800 Hz to open it.', done: (v) => v > 800 },
    { set: 'Filter', ctl: 'filterQ', prep: richWave, name: 'Q', start: 0,
      task: 'Turn Q above 8: a peak rings at the cutoff. Move Cutoff again to hear it whistle.', done: (v) => v > 8 },
    { set: 'Filter Envelope', ctl: 'filterAttack', prep: sweepReady, name: 'Attack', start: 0,
      task: 'Turn the filter Attack above 0.3 s: the brightness swells in on each note.', done: (v) => v > 0.3 },
    { set: 'Filter Envelope', ctl: 'filterDecay', prep: sweepReady, name: 'Decay', start: 0,
      task: 'Turn the filter Decay above 0.5 s: after the swell, the brightness falls slowly.', done: (v) => v > 0.5 },
    { set: 'Filter Envelope', ctl: 'filterSustain', prep: sweepReady, name: 'Sustain', start: 0,
      task: 'Raise the filter Sustain above 0.5: the sound stays bright while you press.', done: (v) => v > 0.5 },
    { set: 'Filter Envelope', ctl: 'filterRelease', prep: sweepReady, name: 'Release', start: 0,
      task: 'Turn the filter Release above 1 s: the brightness fades out after you let go.', done: (v) => v > 1 },

    { set: 'Reverb', ctl: 'reverb', name: 'Mix', start: 0,
      task: 'Turn the Reverb Mix above 0.3: the sound gets a room around it.', done: (v) => v > 0.3 },
    { set: 'Reverb', ctl: 'reverbSize', name: 'Size', start: 0.1, wait: 2.5,
      task: 'Turn Size above 4 s: the room gets bigger and the tail longer.', done: (v) => v > 4 },
    { set: 'Delay', ctl: 'delayMix', name: 'Mix', start: 0,
      task: 'Turn the Delay Mix above 0.3: you hear echoes.', done: (v) => v > 0.3 },
    { set: 'Delay', ctl: 'delayTime', name: 'Time', start: 0, wait: 0.25,
      task: 'Time is 0, so the echo sits on the note. Turn it above 0.3 s to space the echoes out.', done: (v) => v > 0.3 },
    { set: 'Delay', ctl: 'delayFeedback', name: 'Feedback', start: 0, wait: 0.3,
      task: 'Turn Feedback above 0.5: each echo repeats again and again.', done: (v) => v > 0.5 },
    { set: 'Tone', ctl: 'filterFreq', name: 'Cutoff', start: 100, wait: 10000,
      task: 'This filter acts on everything after the synth. It is closed: turn Cutoff above 3000 Hz.', done: (v) => v > 3000 },
    { set: 'Tone', ctl: 'distortion', name: 'Distortion', start: 0,
      task: 'Turn Distortion above 0.3: the sound gets grit.', done: (v) => v > 0.3 },
    { set: 'Chorus', ctl: 'chorusMix', name: 'Mix', start: 0,
      task: 'Turn the Chorus Mix above 0.4: a wobbling copy makes the sound wide.', done: (v) => v > 0.4 },
    { set: 'Chorus', ctl: 'chorusRate', name: 'Rate', start: 0.1, wait: 1.5,
      task: 'Turn the Chorus Rate above 3 Hz: the wobble gets faster.', done: (v) => v > 3 },
    { set: 'Phaser', ctl: 'phaserMix', name: 'Mix', start: 0,
      task: 'Turn the Phaser Mix above 0.4: a sweeping notch moves through the sound.', done: (v) => v > 0.4 },
    { set: 'Phaser', ctl: 'phaserRate', name: 'Rate', start: 0.1, wait: 0.5,
      task: 'Turn the Phaser Rate above 2 Hz: the sweep speeds up.', done: (v) => v > 2 },
    { set: 'Tremolo', ctl: 'tremoloDepth', name: 'Depth', start: 0,
      task: 'Turn the Tremolo Depth above 0.5: the volume pulses.', done: (v) => v > 0.5 },
    { set: 'Tremolo', ctl: 'tremoloRate', name: 'Rate', start: 0.5, wait: 5,
      task: 'Turn the Tremolo Rate above 8 Hz: the pulse turns into a flutter.', done: (v) => v > 8 },
    { set: 'Crusher', ctl: 'crushBits', name: 'Bits', start: 10,
      task: 'Lower Bits under 6: fewer bits, the grit of an old game console.', done: (v) => v < 6 },
    { set: 'Crusher', ctl: 'crushMix', name: 'Mix', start: 0, wait: 1,
      task: 'Mix is at 0, so the crushed sound is gone. Raise it above 0.5 to blend it back in.', done: (v) => v > 0.5 }
];

const FX_SETS = new Set(['Reverb', 'Delay', 'Tone', 'Chorus', 'Phaser', 'Tremolo', 'Crusher']);
const offValue = (s) => s.wait ?? s.start;

let learn = { on: false, stage: 0, kept: {} }; // kept: effect knob → the value the player chose
try { learn = { ...learn, ...JSON.parse(store.get('learn')) }; } catch (_) { /* nothing saved yet */ }
const progress = { waves: new Set(), ready: false, note: '' }; // current step only, not saved; ready = goal reached, waits for Next; note = what prep changed

const bar = document.getElementById('learnBar');
const stepEl = document.getElementById('learnStep');
const taskEl = document.getElementById('learnTask');
const skipBtn = document.getElementById('learnSkip');
const save = () => store.set('learn', JSON.stringify({ on: learn.on, stage: learn.stage, kept: learn.kept }));

const ctlEl = (ctl) => document.querySelector(`#controls [data-control="${ctl}"]`) || document.getElementById(ctl);
const ctlValue = (ctl) => ctlEl(ctl)?.value ?? '';
const isComplete = () => learn.stage >= STEPS.length;
const isGuiding = () => learn.on && !isComplete() && state.currentInstrumentType === LEARN_TYPE;

// Write a knob the way a hand would (knob, readout, engine follow), but flagged as code
function setCtl(ctl, value) {
    const el = ctlEl(ctl);
    if (!el) return;
    state.autoInput = true;
    try {
        el.value = value;
        el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
    } finally {
        state.autoInput = false;
    }
}

// Every knob still to learn back to its zero (the current one) or its waiting value (later ones);
// effects already learned go off, so the current effect plays solo
function zeroAhead() {
    if (!isGuiding()) return;
    const current = STEPS[learn.stage].set;
    STEPS.forEach((s, i) => {
        if (i > learn.stage || (FX_SETS.has(s.set) && s.set !== current)) setCtl(s.ctl, offValue(s));
    });
    startStep(STEPS[learn.stage]);
}

// The knob of the step to its zero, after its prep (the prep may move other knobs)
function startStep(s) {
    progress.note = s.prep?.() || '';
    setCtl(s.ctl, s.start);
}

// A section is learned when all its steps are behind, next when it holds the current step
function setState(name) {
    const idx = STEPS.map((s, i) => (s.set === name ? i : -1)).filter(i => i >= 0);
    if (!idx.length) return null;
    if (idx.every(i => i < learn.stage)) return 'is-learned';
    if (idx.includes(learn.stage)) return 'is-next';
    return 'is-later';
}

function mark(el, cls) {
    el.classList.remove('is-learned', 'is-next', 'is-later');
    if (cls) el.classList.add(cls);
}

// The phone shows the whole rack as one FX page: it takes the state of the effect sets
function pageState(page) {
    if (!page.classList.contains('effect-controls')) return setState(page.getAttribute('aria-label'));
    const states = [...page.querySelectorAll('.control-set')].map(s => setState(s.getAttribute('aria-label'))).filter(Boolean);
    if (states.includes('is-next')) return 'is-next';
    return states.every(s => s === 'is-learned') ? 'is-learned' : 'is-later';
}

// Phone tabs follow their page (tabs and pages share one order, see mobile.js pageList)
function markTabs() {
    const guiding = isGuiding();
    const pages = [...document.querySelectorAll('#pages > #controls > .control-set, #pages > .effect-controls, #pages > .arp-set:not([hidden])')];
    document.querySelectorAll('#tabBar .tab-btn').forEach((tab, i) => mark(tab, guiding && pages[i] ? pageState(pages[i]) : null));
}

function apply() {
    const guiding = isGuiding();
    bar.hidden = !learn.on;
    skipBtn.hidden = !guiding;
    // The goal never moves on by itself: the player keeps listening, then presses Next
    skipBtn.textContent = progress.ready ? 'Next \u25B8' : 'Skip';
    skipBtn.classList.toggle('active', progress.ready);
    bar.classList.toggle('is-ready', guiding && progress.ready);
    document.querySelectorAll('#controls .control-set, .effects-rack .control-set')
        .forEach(set => mark(set, guiding ? setState(set.getAttribute('aria-label')) : null));
    document.querySelectorAll('.learn-focus').forEach(el => el.classList.remove('learn-focus'));
    if (guiding) ctlEl(STEPS[learn.stage].ctl)?.closest('.control-group')?.classList.add('learn-focus');
    markTabs();
    document.querySelectorAll('[data-learn]').forEach(btn => {
        btn.classList.toggle('active', learn.on);
        btn.setAttribute('aria-pressed', String(learn.on));
    });
    if (!learn.on) return;
    if (isComplete()) {
        stepEl.textContent = 'Learn';
        taskEl.textContent = 'Done: every knob is yours. Load a preset and look at what it changes.';
    } else if (!guiding) {
        stepEl.textContent = `Learn ${learn.stage + 1}/${STEPS.length}`;
        taskEl.textContent = 'Learn follows the Mono Synth. Switch back to it to go on.';
    } else {
        const s = STEPS[learn.stage];
        stepEl.textContent = `Learn ${learn.stage + 1}/${STEPS.length} · ${s.set} · ${s.name}${progress.ready ? ' \u2713' : ''}`;
        taskEl.textContent = progress.ready ? 'That is it. Play with it as long as you like, then press Next.' : [s.task, progress.note].filter(Boolean).join(' ');
    }
}

function advance() {
    const done = STEPS[learn.stage];
    if (FX_SETS.has(done.set)) learn.kept[done.ctl] = ctlValue(done.ctl);
    learn.stage++;
    progress.waves.clear();
    progress.ready = false;
    const next = STEPS[learn.stage];
    if (isGuiding()) {
        // Moving on to another effect: the one just learned goes off, the next plays solo
        if (FX_SETS.has(done.set) && next.set !== done.set) {
            STEPS.filter(s => s.set === done.set).forEach(s => setCtl(s.ctl, offValue(s)));
        }
        startStep(next);
    } else if (!next) {
        // The end: every effect the player set comes back, all together
        Object.entries(learn.kept).forEach(([ctl, v]) => setCtl(ctl, v));
    }
    save();
    apply();
    showToast(next ? `${done.set} ${done.name} done. Next: ${next.name}` : 'Learn complete: all your effects together');
}

function setLearn(on) {
    learn.on = on;
    save();
    // Learn starts on the Mono Synth (only after audio started: before that, it is the default anyway)
    const type = document.getElementById('instrumentType');
    if (on && state.audioInitialized && state.currentInstrumentType !== LEARN_TYPE) {
        type.value = LEARN_TYPE;
        type.dispatchEvent(new Event('change', { bubbles: true })); // rebuilds the controls: 'controlsbuilt' zeroes them
    } else if (on) {
        zeroAhead();
    }
    apply();
}

function onPlayerInput(e) {
    if (!isGuiding() || state.autoInput) return;
    const step = STEPS[learn.stage];
    if (e.target !== ctlEl(step.ctl)) return; // only the knob being learned counts
    if (step.ctl === 'oscType' && e.type === 'change') progress.waves.add(e.target.value);
    const ready = step.done(parseFloat(e.target.value), progress);
    if (ready !== progress.ready) {
        progress.ready = ready;
        apply();
    }
}

document.addEventListener('input', onPlayerInput);
document.addEventListener('change', onPlayerInput);
document.addEventListener('controlsbuilt', () => { zeroAhead(); apply(); });
new MutationObserver(markTabs).observe(document.getElementById('tabBar'), { childList: true, subtree: true });

document.querySelectorAll('[data-learn]').forEach(btn => btn.addEventListener('click', () => { setLearn(!learn.on); btn.blur(); }));
document.querySelectorAll('[data-learn-restart]').forEach(btn => btn.addEventListener('click', () => {
    learn.stage = 0;
    learn.kept = {};
    progress.waves.clear();
    progress.ready = false;
    setLearn(true);
    btn.blur();
}));
skipBtn.addEventListener('click', () => { if (!isComplete()) advance(); skipBtn.blur(); });

apply();

export { STEPS };
