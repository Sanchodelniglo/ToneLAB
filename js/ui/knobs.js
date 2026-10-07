// Slider track fill and the rotary knob skin: SVG construction, visual sync, drag handling.

// Update slider track fill to reflect current value
function updateSliderFill(slider) {
    const min = parseFloat(slider.min);
    const max = parseFloat(slider.max);
    const val = parseFloat(slider.value);
    const percent = ((val - min) / (max - min)) * 100;
    slider.style.setProperty('--fill-percent', `${percent}%`);
    // Sync knob if it exists
    const knob = slider.parentElement?.querySelector('.knob-container');
    if (knob) updateKnobVisual(knob, percent / 100);
}

// --- Knob system ---
const KNOB_ARC_START = 225; // degrees from top, clockwise — bottom-left
const KNOB_ARC_END = 495;   // 225 + 270 — bottom-right
const KNOB_ARC_RANGE = 270;
const KNOB_RADIUS = 28;
const KNOB_CENTER = 36;

function createKnobSVG(percent) {
    const ns = 'http://www.w3.org/2000/svg';
    const container = document.createElement('div');
    container.className = 'knob-container';
    container.title = 'Drag up/down to adjust \u2022 Double-click to reset';

    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('class', 'knob-svg');
    svg.setAttribute('viewBox', '0 0 72 72');

    // Arc helper: angle in degrees (0 = top) to SVG coords
    function polarToCart(angleDeg, r) {
        const rad = (angleDeg - 90) * Math.PI / 180;
        return { x: KNOB_CENTER + r * Math.cos(rad), y: KNOB_CENTER + r * Math.sin(rad) };
    }

    // Track arc (background)
    const trackStart = polarToCart(KNOB_ARC_START, KNOB_RADIUS);
    const trackEnd = polarToCart(KNOB_ARC_END, KNOB_RADIUS);
    const track = document.createElementNS(ns, 'path');
    track.setAttribute('class', 'knob-track');
    track.setAttribute('d', `M${trackStart.x},${trackStart.y} A${KNOB_RADIUS},${KNOB_RADIUS} 0 1,1 ${trackEnd.x},${trackEnd.y}`);
    svg.appendChild(track);

    // Notches at 0%, 25%, 50%, 75%, 100%
    for (let i = 0; i <= 4; i++) {
        const angle = KNOB_ARC_START + (KNOB_ARC_RANGE * i / 4);
        const inner = polarToCart(angle, KNOB_RADIUS + 2);
        const outer = polarToCart(angle, KNOB_RADIUS + 6);
        const notch = document.createElementNS(ns, 'line');
        notch.setAttribute('class', 'knob-notch');
        notch.setAttribute('x1', inner.x);
        notch.setAttribute('y1', inner.y);
        notch.setAttribute('x2', outer.x);
        notch.setAttribute('y2', outer.y);
        svg.appendChild(notch);
    }

    // Fill arc (value)
    const fill = document.createElementNS(ns, 'path');
    fill.setAttribute('class', 'knob-fill');
    fill.setAttribute('data-knob-fill', '');
    svg.appendChild(fill);

    // Knob body
    const body = document.createElementNS(ns, 'circle');
    body.setAttribute('class', 'knob-body');
    body.setAttribute('cx', KNOB_CENTER);
    body.setAttribute('cy', KNOB_CENTER);
    body.setAttribute('r', KNOB_RADIUS - 6);
    svg.appendChild(body);

    // Indicator line
    const indicator = document.createElementNS(ns, 'line');
    indicator.setAttribute('class', 'knob-indicator');
    indicator.setAttribute('data-knob-indicator', '');
    svg.appendChild(indicator);

    container.appendChild(svg);
    updateKnobVisual(container, percent);
    return container;
}

function updateKnobVisual(container, percent) {
    const ns = 'http://www.w3.org/2000/svg';
    const clamped = Math.max(0, Math.min(1, percent));

    function polarToCart(angleDeg, r) {
        const rad = (angleDeg - 90) * Math.PI / 180;
        return { x: KNOB_CENTER + r * Math.cos(rad), y: KNOB_CENTER + r * Math.sin(rad) };
    }

    // Update fill arc
    const fill = container.querySelector('[data-knob-fill]');
    if (fill) {
        if (clamped <= 0.001) {
            fill.setAttribute('d', '');
        } else {
            const startAngle = KNOB_ARC_START;
            const endAngle = KNOB_ARC_START + KNOB_ARC_RANGE * clamped;
            const start = polarToCart(startAngle, KNOB_RADIUS);
            const end = polarToCart(endAngle, KNOB_RADIUS);
            const largeArc = (endAngle - startAngle) > 180 ? 1 : 0;
            fill.setAttribute('d', `M${start.x},${start.y} A${KNOB_RADIUS},${KNOB_RADIUS} 0 ${largeArc},1 ${end.x},${end.y}`);
        }
    }

    // Update indicator line
    const indicator = container.querySelector('[data-knob-indicator]');
    if (indicator) {
        const angle = KNOB_ARC_START + KNOB_ARC_RANGE * clamped;
        const inner = polarToCart(angle, 8);
        const outer = polarToCart(angle, KNOB_RADIUS - 8);
        indicator.setAttribute('x1', inner.x);
        indicator.setAttribute('y1', inner.y);
        indicator.setAttribute('x2', outer.x);
        indicator.setAttribute('y2', outer.y);
    }
}

function attachKnobToSlider(slider) {
    const min = parseFloat(slider.min);
    const max = parseFloat(slider.max);
    const step = parseFloat(slider.step) || 1;
    const val = parseFloat(slider.value);
    const percent = (val - min) / (max - min);

    const knob = createKnobSVG(percent);
    slider.parentElement.insertBefore(knob, slider.nextSibling);

    // AbortController to clean up document-level listeners on rebuild
    const controller = new AbortController();
    knob._dragController = controller;

    let dragging = false;
    let startY = 0;
    let startValue = 0;

    function onStart(e) {
        dragging = true;
        startY = e.type.startsWith('touch') ? e.touches[0].clientY : e.clientY;
        startValue = parseFloat(slider.value);
        document.body.style.cursor = 'grabbing';
        e.preventDefault();
    }

    function onMove(e) {
        if (!dragging) return;
        const clientY = e.type.startsWith('touch') ? e.touches[0].clientY : e.clientY;
        const deltaY = startY - clientY; // up = positive
        const range = max - min;
        const sensitivity = range / 150; // full range in ~150px drag
        let newVal = startValue + deltaY * sensitivity;
        newVal = Math.round(newVal / step) * step;
        newVal = Math.max(min, Math.min(max, newVal));

        slider.value = newVal;
        slider.dispatchEvent(new Event('input', { bubbles: true }));
    }

    function onEnd() {
        if (!dragging) return;
        dragging = false;
        document.body.style.cursor = '';
    }

    knob.addEventListener('mousedown', onStart);
    knob.addEventListener('touchstart', onStart, { passive: false });
    document.addEventListener('mousemove', onMove, { signal: controller.signal });
    document.addEventListener('touchmove', onMove, { passive: false, signal: controller.signal });
    document.addEventListener('mouseup', onEnd, { signal: controller.signal });
    document.addEventListener('touchend', onEnd, { signal: controller.signal });

    // Double-click to reset to default
    knob.addEventListener('dblclick', () => {
        const defaultVal = slider.dataset.defaultValue;
        if (defaultVal !== undefined) {
            slider.value = defaultVal;
            slider.dispatchEvent(new Event('input', { bubbles: true }));
        }
    });
}

function attachKnobsToAll() {
    document.querySelectorAll('input[type="range"]').forEach(slider => {
        if (!slider.parentElement.querySelector('.knob-container')) {
            attachKnobToSlider(slider);
        }
    });
}

export { updateSliderFill, createKnobSVG, updateKnobVisual, attachKnobToSlider, attachKnobsToAll };
