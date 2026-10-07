// XY performance pad: one thumb drives two parameters at once. Targets are
// the existing range inputs (synth controls and effects), so every move goes
// through the same 'input' listeners as a knob — readouts, knobs and the
// engine all follow without the pad knowing anything about them.

const DEFAULTS = {
    Synth: ['filterFreq', 'distortion'],
    PolySynth: ['filterFreq', 'distortion'],
    AMSynth: ['harmonicity', 'filterFreq'],
    FMSynth: ['harmonicity', 'modulationIndex'],
    MetalSynth: ['harmonicity', 'modulationIndex'],
    MembraneSynth: ['pitchDecay', 'octaves'],
    PluckSynth: ['dampening', 'resonance'],
    NoiseSynth: ['attack', 'release'],
    MonoSynth: ['filterCutoff', 'filterQ'],
    DuoSynth: ['vibratoRate', 'vibratoAmount']
};

function clamp01(v) { return Math.max(0, Math.min(1, v)); }

// Frequency-like ranges (big ratio, positive) move logarithmically
function isLog(min, max) { return min > 0 && max / min > 50; }

function toValue(input, t) {
    const min = parseFloat(input.min);
    const max = parseFloat(input.max);
    const step = parseFloat(input.step) || 1;
    const raw = isLog(min, max) ? min * Math.pow(max / min, t) : min + t * (max - min);
    const decimals = (String(step).split('.')[1] || '').length;
    return Math.max(min, Math.min(max, parseFloat((Math.round(raw / step) * step).toFixed(decimals))));
}

function toT(input) {
    const min = parseFloat(input.min);
    const max = parseFloat(input.max);
    const v = parseFloat(input.value);
    if (isLog(min, max)) return clamp01(Math.log(v / min) / Math.log(max / min));
    return clamp01((v - min) / (max - min));
}

function labelFor(input) {
    const group = input.closest('.control-set')?.querySelector('.control-set-title')?.textContent.trim() || '';
    const name = input.parentElement?.querySelector('label')?.textContent.trim() || input.id;
    return group && !name.toLowerCase().startsWith(group.split(' ')[0].toLowerCase()) ? `${group} ${name}` : name;
}

export function initXYPad(root) {
    const pad = root.querySelector('.xy-pad');
    const dot = root.querySelector('.xy-dot');
    const selX = root.querySelector('#xyTargetX');
    const selY = root.querySelector('#xyTargetY');
    const readX = root.querySelector('#xyReadX');
    const readY = root.querySelector('#xyReadY');
    let targets = [];
    let x = null; // { input, key }
    let y = null;

    function collect() {
        const inputs = document.querySelectorAll('#controls input[type="range"], .effect-controls input[type="range"]:not(#masterVolume)');
        targets = [...inputs].map(input => ({ input, key: input.dataset.control || input.id, label: labelFor(input) }));
    }

    function fillSelect(select, current) {
        select.innerHTML = '';
        targets.forEach(t => {
            const opt = document.createElement('option');
            opt.value = t.key;
            opt.textContent = t.label;
            select.appendChild(opt);
        });
        if (current && targets.some(t => t.key === current.key)) select.value = current.key;
    }

    function pick(key) { return targets.find(t => t.key === key) || null; }

    function place() {
        if (x) pad.style.setProperty('--x', toT(x.input));
        if (y) pad.style.setProperty('--y', 1 - toT(y.input));
        const readout = (t) => t ? (document.getElementById(`${t.input.id}Value`)?.textContent.trim() ?? t.input.value) : '';
        readX.textContent = x ? `${x.label}: ${readout(x)}` : '';
        readY.textContent = y ? `${y.label}: ${readout(y)}` : '';
    }

    // Called after the control grid is rebuilt (instrument change)
    function refresh(type) {
        collect();
        // A new instrument gets its own pair; a user choice survives only while it exists
        const wanted = DEFAULTS[type] || [];
        x = pick(wanted[0]) || pick(x?.key) || targets[0] || null;
        y = pick(wanted[1]) || pick(y?.key) || targets[1] || null;
        if (x && y && x === y) y = targets.find(t => t !== x) || null;
        fillSelect(selX, x);
        fillSelect(selY, y);
        place();
    }

    selX.addEventListener('change', () => { x = pick(selX.value); place(); });
    selY.addEventListener('change', () => { y = pick(selY.value); place(); });

    function apply(input, t) {
        const v = toValue(input, t);
        if (parseFloat(input.value) === v) return;
        input.value = v;
        input.dispatchEvent(new Event('input', { bubbles: true }));
    }

    function drive(e) {
        const r = pad.getBoundingClientRect();
        const tx = clamp01((e.clientX - r.left) / r.width);
        const ty = clamp01(1 - (e.clientY - r.top) / r.height);
        if (x) apply(x.input, tx);
        if (y) apply(y.input, ty);
        pad.style.setProperty('--x', tx);
        pad.style.setProperty('--y', 1 - ty);
        place();
    }

    pad.addEventListener('pointerdown', (e) => {
        pad.setPointerCapture(e.pointerId);
        pad.classList.add('is-active');
        drive(e);
        e.preventDefault();
    });
    pad.addEventListener('pointermove', (e) => { if (pad.classList.contains('is-active')) drive(e); });
    const end = (e) => {
        if (!pad.classList.contains('is-active')) return;
        pad.classList.remove('is-active');
        if (pad.hasPointerCapture(e.pointerId)) pad.releasePointerCapture(e.pointerId);
    };
    pad.addEventListener('pointerup', end);
    pad.addEventListener('pointercancel', end);

    // Knobs or presets moving a target: the dot follows
    document.addEventListener('input', (e) => {
        if ((x && e.target === x.input) || (y && e.target === y.input)) place();
    });

    return { refresh };
}
