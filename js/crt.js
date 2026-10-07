// CRT static snow overlay for the #crtStatic canvas. Side-effect module, no exports.
//
// Perf: filling 512×512 random pixels every frame cost ~1.6 ms of main-thread
// time per frame (measured). Instead, a handful of noise tiles are generated
// once and each frame just blits one of them at a random offset through a
// repeating pattern — ~0.03 ms per frame, visually indistinguishable.
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

    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            cancelAnimationFrame(rafId);
            rafId = null;
        } else if (!rafId) {
            renderStatic();
        }
    });

    renderStatic();
})();
