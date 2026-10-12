// Envelope preview: a small ADSR curve above every envelope set (Envelope, Filter
// Envelope, Mod Envelope) that redraws as the knobs move. Read-only: it follows the
// range inputs, which stay the source of truth. While a note sounds, a playhead shows
// where it is on each curve and lights its letter (A, D, S, R).

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
        xs: [PAD, x1, x2, x3, x4],
        y,
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
        <stop offset="0" style="stop-color: rgb(var(--cyan-rgb)); stop-opacity: 0.45"/><stop offset="1" style="stop-color: rgb(var(--cyan-rgb)); stop-opacity: 0.02"/></linearGradient></defs>`;
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
    mk('env-playhead');
    mk('env-head-ring'); // the live dot: a ring under a white centre, bigger than the corner dots
    mk('env-head');
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

// The envelope times of a set, or null when it has no preview
function adsrOf(set) {
    const map = SETS[set.getAttribute('aria-label')];
    const box = set.querySelector('.env-preview');
    if (!map || !box) return null;
    const a = valueOf(set, map.a), r = valueOf(set, map.r);
    if (a === undefined || r === undefined) return null;
    const d = valueOf(set, map.d) ?? 0;
    const s = valueOf(set, map.s) ?? (map.s ? 0 : 1); // a set with a sustain id but no knob (MetalSynth) decays to silence
    return { map, box, a, d, s, r };
}

function draw(set) {
    const env = adsrOf(set);
    if (!env) return;
    const { map, box, a, d, s, r } = env;
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

/* ---- Live playhead: from the last voicestart, through A and D at the knobs' times, resting in S
   while a key is held (it crosses the plateau in 1 s), then through R after voicerelease.
   The animation stops while every playhead rests (a held pad costs nothing); voicerelease and
   knob moves draw again. ---- */
const live = { start: -1, release: -1 }; // performance.now() ms; release -1 = still held
let raf = 0;

// Where the note is at t seconds after its start (release ignored): stage index, fraction, level
function heldAt(t, { a, d, s }) {
    if (t < a) return [0, t / a, t / a];
    if (t < a + d) return [1, (t - a) / d, 1 - (1 - s) * ((t - a) / d)];
    return [2, Math.min(1, t - a - d), s];
}

// Draws one playhead: 'moving', 'resting' (end of S, key held) or false (no note, or release over)
function head(set, now) {
    const env = adsrOf(set);
    if (!env) return false;
    const { box, r } = env;
    let stage, frac, level;
    if (live.release >= 0 && now >= live.release) {
        const tr = (now - live.release) / 1000;
        if (tr >= r) return clearHead(box);
        // The playhead jumps to R and the dot rides the drawn curve down from the sustain level,
        // even when the key went up mid-attack (the curve is the shape to read, not a meter)
        [stage, frac, level] = [3, tr / r, env.s * (1 - tr / r)];
    } else {
        [stage, frac, level] = heldAt((now - live.start) / 1000, env);
    }
    const { xs, y, base } = curve(env);
    const x = xs[stage] + frac * (xs[stage + 1] - xs[stage]);
    const svg = box.firstChild;
    svg.querySelector('.env-playhead').setAttribute('d', `M${x} ${PAD}V${base}`);
    svg.querySelectorAll('.env-head, .env-head-ring').forEach(el => el.setAttribute('d', `M${x} ${y(level)}h0`));
    box.classList.add('is-playing');
    box.querySelectorAll('.env-stage').forEach((el, i) => el.classList.toggle('is-live', i === stage));
    // An arp step has a release time but no voicerelease: it keeps moving until then
    return stage === 2 && frac === 1 && live.release < 0 ? 'resting' : 'moving';
}

function clearHead(box) {
    box.classList.remove('is-playing');
    box.firstChild.querySelector('.env-playhead').setAttribute('d', '');
    box.firstChild.querySelectorAll('.env-head, .env-head-ring').forEach(el => el.setAttribute('d', ''));
    box.querySelectorAll('.env-stage.is-live').forEach(el => el.classList.remove('is-live'));
    return false;
}

// Draws every playhead now and keeps one animation loop going while a note sounds
function frame() {
    cancelAnimationFrame(raf);
    const now = performance.now(); // same clock as live.start / live.release (the rAF stamp is the frame start)
    let moving = false;
    document.querySelectorAll('.control-set').forEach(set => { if (head(set, now) === 'moving') moving = true; });
    raf = moving ? requestAnimationFrame(frame) : 0;
}

document.addEventListener('voicestart', (e) => {
    const now = performance.now();
    live.start = now;
    const seconds = e.detail?.duration;
    live.release = seconds == null ? -1 : now + seconds * 1000; // an arp step brings its own release
    frame(); // show it on the same tick as the key, then animate
});
document.addEventListener('voicerelease', () => {
    if (live.start < 0 || live.release >= 0) return;
    live.release = performance.now();
    frame();
});

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
    if (!set) return;
    draw(set);
    if (live.start >= 0) frame(); // a resting playhead follows the knob (Sustain moves its dot)
});
document.addEventListener('presetapplied', () => updateEnvelopePreviews());
