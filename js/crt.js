// CRT static snow overlay for the #crtStatic canvas. Side-effect module, no exports.
// CRT static snow — pauses when tab is hidden
(function() {
    const canvas = document.getElementById('crtStatic');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const W = 512;
    const H = 512;
    canvas.width = W;
    canvas.height = H;
    const imageData = ctx.createImageData(W, H);
    const data = imageData.data;
    let rafId = null;

    function renderStatic() {
        for (let i = 0; i < data.length; i += 4) {
            const v = Math.random() * 255 | 0;
            data[i] = v;
            data[i + 1] = v;
            data[i + 2] = v;
            data[i + 3] = 255;
        }
        ctx.putImageData(imageData, 0, 0);
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
