// Oscilloscope / spectrum analyser drawn on the CRT canvas, tapping the signal after the limiter.

/* ============================================
   SCOPE — oscilloscope / spectrum on the CRT
   Taps the signal after the limiter (what you actually hear).
   ============================================ */
export const scope = (() => {
    const canvas = document.getElementById('scopeCanvas');
    if (!canvas) return { start() {}, setMode() {}, level: () => 0 };

    const ctx = canvas.getContext('2d');
    const WAVE_SIZE = 2048;   // samples per frame — ~46 ms at 44.1 kHz, enough for a 22 Hz period
    const FFT_SIZE = 1024;    // bins — bin width ~21.5 Hz, log axis from ~21 Hz to Nyquist
    const MIN_DB = -100;
    const MAX_DB = -10;
    // Canvas colours come from the theme tokens (re-read on 'theme-change')
    let TRACE, TRACE_GLOW, GRID, GRID_STRONG, LABEL, PERSISTENCE, BACKGROUND, FILL_TOP, FILL_BOTTOM;
    function readColors() {
        const cs = getComputedStyle(document.documentElement);
        const ch = (name) => cs.getPropertyValue(name).trim().replace(/\s+/g, ' ');
        const accent = ch('--cyan-rgb');
        const hex = cs.getPropertyValue('--text-secondary').trim();
        const label = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)).join(' ');
        TRACE = `rgb(${accent})`;
        TRACE_GLOW = `rgb(${accent} / 0.55)`;
        GRID = `rgb(${accent} / 0.08)`;
        GRID_STRONG = `rgb(${accent} / 0.2)`;
        LABEL = `rgb(${label} / 0.7)`;
        BACKGROUND = `rgb(${ch('--bg-deep-rgb')})`;
        PERSISTENCE = `rgb(${ch('--bg-deep-rgb')} / 0.4)`; // bg-primary at low alpha = phosphor afterglow
        FILL_TOP = `rgb(${accent} / 0.35)`;
        FILL_BOTTOM = `rgb(${accent} / 0.02)`;
    }
    readColors();

    const labels = {
        wave: 'Oscilloscope showing the output waveform',
        spectrum: 'Spectrum analyser showing the output frequencies'
    };

    let waveform = null;
    let fft = null;
    let rafId = null;
    let width = 0;
    let height = 0;
    let mode = localStorage.getItem('scopeMode') === 'spectrum' ? 'spectrum' : 'wave';
    let sampleRate = 44100;
    let lastPeak = 0; // peak of the last drawn waveform frame, 0..1
    let lastMaxDb = -Infinity; // loudest bin of the last drawn spectrum frame

    function resize() {
        const rect = canvas.getBoundingClientRect();
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        width = Math.max(1, Math.round(rect.width));
        height = Math.max(1, Math.round(rect.height));
        canvas.width = Math.round(width * dpr);
        canvas.height = Math.round(height * dpr);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.fillStyle = BACKGROUND;
        ctx.fillRect(0, 0, width, height);
    }

    // Log-frequency x position for a given Hz (spectrum mode)
    function xForHz(hz) {
        const minHz = sampleRate / (2 * FFT_SIZE); // bin 1
        const maxHz = sampleRate / 2;
        const t = (Math.log(hz) - Math.log(minHz)) / (Math.log(maxHz) - Math.log(minHz));
        return t * width;
    }

    function drawGrid() {
        ctx.lineWidth = 1;
        ctx.strokeStyle = GRID;
        ctx.beginPath();
        for (let i = 1; i < 8; i++) {
            const x = Math.round((i / 8) * width) + 0.5;
            ctx.moveTo(x, 0); ctx.lineTo(x, height);
        }
        for (let i = 1; i < 4; i++) {
            const y = Math.round((i / 4) * height) + 0.5;
            ctx.moveTo(0, y); ctx.lineTo(width, y);
        }
        ctx.stroke();

        ctx.font = '10px "Share Tech Mono", monospace';
        ctx.fillStyle = LABEL;
        ctx.textBaseline = 'bottom';

        if (mode === 'wave') {
            // Zero line
            ctx.strokeStyle = GRID_STRONG;
            ctx.beginPath();
            const mid = Math.round(height / 2) + 0.5;
            ctx.moveTo(0, mid); ctx.lineTo(width, mid);
            ctx.stroke();
            ctx.textAlign = 'left';
            ctx.fillText(`${(WAVE_SIZE / 2 / sampleRate * 1000).toFixed(0)} ms`, 4, height - 3);
        } else {
            // Frequency ticks on the log axis
            ctx.strokeStyle = GRID_STRONG;
            ctx.beginPath();
            const ticks = [['100', 100], ['1k', 1000], ['10k', 10000]];
            for (const [, hz] of ticks) {
                const x = Math.round(xForHz(hz)) + 0.5;
                ctx.moveTo(x, 0); ctx.lineTo(x, height);
            }
            ctx.stroke();
            ctx.textAlign = 'center';
            for (const [text, hz] of ticks) ctx.fillText(text, xForHz(hz), height - 3);
            ctx.textAlign = 'left';
            ctx.fillText('Hz', 4, height - 3);
        }
    }

    function drawWave() {
        const values = waveform.getValue(); // Float32Array in -1..1
        const n = values.length;
        const span = n >> 1;

        // Trigger on the first rising zero-crossing so periodic waves hold still
        // instead of scrolling. Falls back to the buffer start for noise/silence.
        let start = 0;
        for (let i = 1; i < span; i++) {
            if (values[i - 1] < 0 && values[i] >= 0) { start = i; break; }
        }

        const amp = (height / 2) * 0.9;
        const mid = height / 2;
        let peak = 0;
        ctx.beginPath();
        for (let i = 0; i < span; i++) {
            const v = values[start + i];
            if (v > peak) peak = v; else if (-v > peak) peak = -v;
            const x = (i / (span - 1)) * width;
            const y = mid - v * amp;
            if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        lastPeak = peak;
        strokeTrace();
    }

    function drawSpectrum() {
        const values = fft.getValue(); // Float32Array of dB, index = bin
        const n = values.length;
        const logMax = Math.log(n);

        let maxDb = -Infinity;
        ctx.beginPath();
        ctx.moveTo(0, height);
        for (let i = 1; i < n; i++) {
            const x = (Math.log(i) / logMax) * width;
            if (values[i] > maxDb) maxDb = values[i];
            const db = Math.min(MAX_DB, Math.max(MIN_DB, values[i]));
            const y = height - ((db - MIN_DB) / (MAX_DB - MIN_DB)) * height;
            ctx.lineTo(x, y);
        }
        ctx.lineTo(width, height);
        lastMaxDb = maxDb;

        const fill = ctx.createLinearGradient(0, 0, 0, height);
        fill.addColorStop(0, FILL_TOP);
        fill.addColorStop(1, FILL_BOTTOM);
        ctx.fillStyle = fill;
        ctx.fill();
        strokeTrace();
    }

    function strokeTrace() {
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        // Wide, soft pass = phosphor bloom; thin, bright pass = the beam
        ctx.lineWidth = 4;
        ctx.strokeStyle = TRACE_GLOW;
        ctx.stroke();
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = TRACE;
        ctx.stroke();
    }

    // Perf: when nothing is playing the trace is a flat line, so after a short
    // run of silent frames the loop drops from 60 fps to ~12 fps and comes back
    // to full rate on the first frame with signal.
    const IDLE_AFTER_FRAMES = 30;
    const IDLE_INTERVAL_MS = 80;
    let idleFrames = 0;
    let idleTimer = null;

    function isSilent() {
        return mode === 'wave' ? lastPeak < 0.002 : lastMaxDb < -90;
    }

    function render() {
        // Fade instead of clear: previous traces linger like a real CRT phosphor
        ctx.fillStyle = PERSISTENCE;
        ctx.fillRect(0, 0, width, height);
        drawGrid();
        if (mode === 'wave') drawWave(); else drawSpectrum();

        idleFrames = isSilent() ? idleFrames + 1 : 0;
        if (idleFrames > IDLE_AFTER_FRAMES) {
            idleTimer = setTimeout(() => { idleTimer = null; rafId = requestAnimationFrame(render); }, IDLE_INTERVAL_MS);
        } else {
            rafId = requestAnimationFrame(render);
        }
    }

    function stop() {
        if (rafId) cancelAnimationFrame(rafId);
        if (idleTimer) clearTimeout(idleTimer);
        rafId = null;
        idleTimer = null;
    }

    function run() {
        if (!rafId && !idleTimer && waveform) render();
    }

    function setMode(next) {
        mode = next === 'spectrum' ? 'spectrum' : 'wave';
        localStorage.setItem('scopeMode', mode);
        canvas.setAttribute('aria-label', labels[mode]);
        document.querySelectorAll('.scope-btn').forEach(btn => {
            const active = btn.dataset.scopeMode === mode;
            btn.classList.toggle('active', active);
            btn.setAttribute('aria-pressed', String(active));
        });
    }

    // Called once audio is running: tap the master bus and start drawing.
    function start(source) {
        if (waveform) return;
        sampleRate = Tone.context.sampleRate;
        waveform = new Tone.Waveform(WAVE_SIZE);
        fft = new Tone.FFT({ size: FFT_SIZE, smoothing: 0.75 });
        source.connect(waveform);
        source.connect(fft);
        resize();
        run();
    }

    document.querySelectorAll('.scope-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            setMode(btn.dataset.scopeMode);
            btn.blur();
        });
    });

    document.addEventListener('visibilitychange', () => {
        if (document.hidden) stop(); else run();
    });

    if (typeof ResizeObserver !== 'undefined') {
        new ResizeObserver(() => { if (waveform) resize(); }).observe(canvas);
    } else {
        window.addEventListener('resize', () => { if (waveform) resize(); });
    }

    setMode(mode);
    document.addEventListener('theme-change', () => { readColors(); resize(); });
    resize();
    drawGrid();

    return { start, setMode, level: () => lastPeak };
})();
