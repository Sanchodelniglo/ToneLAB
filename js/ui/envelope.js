// Envelope preview: a small ADSR curve above every envelope set (Envelope, Filter
// Envelope, Mod Envelope) that redraws as the knobs move. Read-only: it follows the
// range inputs, which stay the source of truth.

const SETS = {
    'Envelope':        { a: 'attack',       d: 'decay',       s: 'sustain',       r: 'release' },
    'Filter Envelope': { a: 'filterAttack', d: 'filterDecay', s: 'filterSustain', r: 'filterRelease' },
    // Tone's modulation envelope has a fixed decay of 0 and sustain of 1: only attack and release move
    'Mod Envelope':    { a: 'modAttack',    r: 'modRelease' }
};

const NS = 'http://www.w3.org/2000/svg';
const W = 200, H = 48, PAD = 4, PADB = 12; // PADB: strip under the baseline for the A D S R letters
let uid = 0;
const HOLD = 0.5; // the sustain plateau has no length of its own: a fixed stretch

// Time to width: square root, so a 0.01 s attack and a 2 s attack both stay readable.
// No minimum: a time of 0 is a vertical edge, as it sounds.
const span = (t, max) => Math.sqrt(Math.max(0, t) / max);

function valueOf(set, id) {
    const el = id && set.querySelector(`[data-control="${id}"]`);
    return el ? parseFloat(el.value) : undefined;
}

function curve({ a, d, s, r }) {
    const wa = span(a, 2), wd = span(d, 2), wr = span(r, 5);
    const total = wa + wd + HOLD + wr;
    const x = (w) => PAD + (w / total) * (W - 2 * PAD);
    const y = (level) => H - PADB - level * (H - PAD - PADB);
    const x1 = x(wa), x2 = x(wa + wd), x3 = x(wa + wd + HOLD), x4 = x(total);
    return {
        line: `M${PAD} ${y(0)} L${x1} ${y(1)} L${x2} ${y(s)} L${x3} ${y(s)} L${x4} ${y(0)}`,
        area: `M${PAD} ${y(0)} L${x1} ${y(1)} L${x2} ${y(s)} L${x3} ${y(s)} L${x4} ${y(0)} Z`,
        points: [[x1, y(1)], [x2, y(s)], [x3, y(s)]],
        base: y(0),
        // stage centres (in viewBox units) and widths, for the A D S R letters
        stages: [[(PAD + x1) / 2, x1 - PAD], [(x1 + x2) / 2, x2 - x1], [(x2 + x3) / 2, x3 - x2], [(x3 + x4) / 2, x4 - x3]]
    };
}

function build(set, grid) {
    const box = document.createElement('div');
    box.className = 'env-preview';
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.setAttribute('preserveAspectRatio', 'none');
    svg.setAttribute('role', 'img');
    // Unique gradient id per svg: a gradient defined inside a hidden tab page would not resolve
    const gid = `envFill${uid++}`;
    svg.innerHTML = `<defs><linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#00f0ff" stop-opacity="0.45"/><stop offset="1" stop-color="#00f0ff" stop-opacity="0.02"/></linearGradient></defs>`;
    const mk = (cls, extra = {}) => {
        const path = document.createElementNS(NS, 'path');
        path.setAttribute('class', cls);
        path.setAttribute('vector-effect', 'non-scaling-stroke');
        for (const [k, v] of Object.entries(extra)) path.setAttribute(k, v);
        svg.appendChild(path);
        return path;
    };
    mk('env-base');
    mk('env-guides');
    mk('env-area', { style: `fill:url(#${gid})` });
    mk('env-line');
    // A zero-length round-capped stroke stays a true circle although the svg stretches to fit
    for (let i = 0; i < 3; i++) mk('env-dot');
    box.appendChild(svg);
    // Letters are HTML, not svg text: the svg is stretched and would distort them
    for (const letter of ['A', 'D', 'S', 'R']) {
        const span = document.createElement('span');
        span.className = 'env-stage';
        span.setAttribute('aria-hidden', 'true');
        span.textContent = letter;
        box.appendChild(span);
    }
    grid.parentElement.insertBefore(box, grid);
    return box;
}

function draw(set) {
    const map = SETS[set.getAttribute('aria-label')];
    const box = set.querySelector('.env-preview');
    if (!map || !box) return;
    const a = valueOf(set, map.a), r = valueOf(set, map.r);
    if (a === undefined || r === undefined) return;
    const d = valueOf(set, map.d) ?? 0;
    const s = valueOf(set, map.s) ?? (map.s ? 0 : 1); // a set with a sustain id but no knob (MetalSynth) decays to silence
    const { line, area, points, base, stages } = curve({ a, d, s, r });
    const svg = box.firstChild;
    svg.querySelector('.env-line').setAttribute('d', line);
    svg.querySelector('.env-area').setAttribute('d', area);
    svg.querySelector('.env-base').setAttribute('d', `M${PAD} ${base}H${W - PAD}`);
    svg.querySelector('.env-guides').setAttribute('d', points.map(([px, py]) => `M${px} ${py}V${base}`).join(''));
    svg.querySelectorAll('.env-dot').forEach((dot, i) => {
        dot.setAttribute('d', `M${points[i][0]} ${points[i][1]}h0`);
    });
    // A letter shows only if its stage is wide enough to hold it and the set has that stage:
    // Mod Envelope has just A and R, MetalSynth has no sustain
    box.querySelectorAll('.env-stage').forEach((el, i) => {
        const [cx, width] = stages[i];
        const used = i === 0 || i === 3 || (i === 1 && map.d) || (i === 2 && map.s && set.querySelector(`[data-control="${map.s}"]`));
        el.style.left = `${(cx / W) * 100}%`;
        el.style.opacity = used && width > 12 ? '' : '0';
    });
    const t = (v) => `${Math.round(v * 1000) / 1000} s`;
    svg.setAttribute('aria-label', map.d
        ? `${set.getAttribute('aria-label')} shape: attack ${t(a)}, decay ${t(d)}, sustain ${Math.round(s * 100)} %, release ${t(r)}`
        : `${set.getAttribute('aria-label')} shape: attack ${t(a)}, release ${t(r)}`);
}

// Called after every control rebuild: adds a preview to each envelope set, then draws them
export function attachEnvelopePreviews(root) {
    root.querySelectorAll('.control-set').forEach(set => {
        if (!SETS[set.getAttribute('aria-label')] || set.querySelector('.env-preview')) return;
        const grid = set.querySelector('.controls-grid');
        if (grid) build(set, grid);
    });
    updateEnvelopePreviews(root);
}

export function updateEnvelopePreviews(root = document) {
    root.querySelectorAll('.control-set').forEach(draw);
}

// Knob drags, wheel, keyboard and Randomize all fire 'input' on the range; presets announce themselves
document.addEventListener('input', (e) => {
    const set = e.target.closest?.('.control-set');
    if (set) draw(set);
});
document.addEventListener('presetapplied', () => updateEnvelopePreviews());
