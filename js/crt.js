// CRT screen effects: the on/off toggles and the static snow canvas. Side-effect module, no exports.
//
// Perf: filling 512×512 random pixels every frame cost ~1.6 ms of main-thread
// time per frame (measured). Instead, a handful of noise tiles are generated
// once and each frame just blits one of them at a random offset through a
// repeating pattern — ~0.03 ms per frame, visually indistinguishable.
// CRT toggles: scanlines, vignette, flicker (flicker overlay + static snow) and glitch
// (colour-split text, boxes and knobs). Each is a data attribute on <body> that the CSS
// reads: data-crt-scan / -vignette / -flicker / -glitch = "on" | "off". Saved in localStorage.
// With no saved choice everything is on, except flicker and glitch when the system asks
// for reduced motion.
const CRT_STORE = 'crt';
const CRT_KEYS = ['scan', 'vignette', 'flicker', 'glitch'];
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

let crtSaved = {};
try { crtSaved = JSON.parse(localStorage.getItem(CRT_STORE)) || {}; } catch (_) { /* private mode or bad JSON */ }

function setCrt(key, on, { save = true } = {}) {
    document.body.dataset['crt' + key[0].toUpperCase() + key.slice(1)] = on ? 'on' : 'off';
    document.querySelectorAll(`[data-crt="${key}"]`).forEach(btn => {
        btn.classList.toggle('active', on);
        btn.setAttribute('aria-pressed', String(on));
    });
    if (save) {
        crtSaved[key] = on;
        try { localStorage.setItem(CRT_STORE, JSON.stringify(crtSaved)); } catch (_) { /* private mode */ }
    }
    document.dispatchEvent(new CustomEvent('crt-change', { detail: { key, on } }));
}

CRT_KEYS.forEach(key => {
    const fallback = !(reducedMotion && (key === 'flicker' || key === 'glitch'));
    setCrt(key, typeof crtSaved[key] === 'boolean' ? crtSaved[key] : fallback, { save: false });
});

document.querySelectorAll('[data-crt]').forEach(btn => {
    btn.addEventListener('click', () => {
        setCrt(btn.dataset.crt, btn.getAttribute('aria-pressed') !== 'true');
        btn.blur(); // keep the computer keyboard playing notes
    });
});

(function() {
    const canvas = document.getElementById('crtStatic');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const W = 512;
    const H = 512;
    const TILE = 256;      // tile size; drawn as a repeating pattern over W×H
    const TILES = 8;       // distinct tiles cycled at random
    canvas.width = W;
    canvas.height = H;

    const patterns = [];
    for (let t = 0; t < TILES; t++) {
        const tile = document.createElement('canvas');
        tile.width = TILE;
        tile.height = TILE;
        const tctx = tile.getContext('2d');
        const img = tctx.createImageData(TILE, TILE);
        const px = new Uint32Array(img.data.buffer);
        for (let i = 0; i < px.length; i++) {
            const v = Math.random() * 255 | 0;
            px[i] = 0xff000000 | (v << 16) | (v << 8) | v; // little-endian ABGR
        }
        tctx.putImageData(img, 0, 0);
        patterns.push(ctx.createPattern(tile, 'repeat'));
    }

    let rafId = null;
    let snowOn = true; // follows the Flicker toggle

    function renderStatic() {
        // Random tile + random sub-tile offset: the eye never sees the repeat.
        const dx = Math.random() * TILE | 0;
        const dy = Math.random() * TILE | 0;
        ctx.save();
        ctx.translate(-dx, -dy);
        ctx.fillStyle = patterns[Math.random() * TILES | 0];
        ctx.fillRect(dx, dy, W, H);
        ctx.restore();
        rafId = requestAnimationFrame(renderStatic);
    }

    function stopSnow() {
        cancelAnimationFrame(rafId);
        rafId = null;
    }

    function startSnow() {
        if (!rafId && snowOn && !document.hidden) renderStatic();
    }

    document.addEventListener('visibilitychange', () => {
        if (document.hidden) stopSnow();
        else startSnow();
    });

    // Flicker switch: the noise stops drawing instead of just being hidden, so it costs nothing
    document.addEventListener('crt-change', (e) => {
        if (e.detail.key !== 'flicker') return;
        snowOn = e.detail.on;
        if (snowOn) startSnow(); else stopSnow();
    });

    // Settings were applied before this ran (see the toggles below): honour them
    snowOn = document.body.dataset.crtFlicker !== 'off';
    startSnow();
})();
