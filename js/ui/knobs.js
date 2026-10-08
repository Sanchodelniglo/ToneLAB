// SVG rotary knobs drawn over hidden range inputs. The input stays the source
// of truth: every gesture here writes slider.value and fires 'input', so the
// listeners in controls.js / effects.js never know a knob exists.

function updateSliderFill(slider) {
    const min = parseFloat(slider.min);
    const max = parseFloat(slider.max);
    const val = parseFloat(slider.value);
    const percent = ((val - min) / (max - min)) * 100;
    slider.style.setProperty('--fill-percent', `${percent}%`);
    const knob = slider.parentElement?.querySelector('.knob-container');
    if (knob) {
        updateKnobVisual(knob, percent / 100);
        syncKnobAria(knob, slider);
    }
}

const KNOB_ARC_START = 225; // degrees from top, clockwise — bottom-left
const KNOB_ARC_RANGE = 270; // to bottom-right
const KNOB_CENTER = 36;
const KNOB_RADIUS = 30;     // arc (track + fill)
const KNOB_BODY = 25;       // cap
const DRAG_PX_FULL_RANGE = 200; // vertical drag distance for min → max
const FINE_FACTOR = 0.15;       // Shift held: slower drag / smaller wheel steps

function polarToCart(angleDeg, r) {
    const rad = (angleDeg - 90) * Math.PI / 180;
    return { x: KNOB_CENTER + r * Math.cos(rad), y: KNOB_CENTER + r * Math.sin(rad) };
}

function arcPath(fromDeg, toDeg, r) {
    const a = polarToCart(fromDeg, r);
    const b = polarToCart(toDeg, r);
    const large = toDeg - fromDeg > 180 ? 1 : 0;
    return `M${a.x.toFixed(2)},${a.y.toFixed(2)} A${r},${r} 0 ${large},1 ${b.x.toFixed(2)},${b.y.toFixed(2)}`;
}

function createKnobSVG(percent) {
    const ns = 'http://www.w3.org/2000/svg';
    const container = document.createElement('div');
    container.className = 'knob-container';
    container.title = 'Drag or scroll to adjust • Shift for fine • Double-click to reset';

    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('class', 'knob-svg');
    svg.setAttribute('viewBox', '0 0 72 72');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');

    const track = document.createElementNS(ns, 'path');
    track.setAttribute('class', 'knob-track');
    track.setAttribute('d', arcPath(KNOB_ARC_START, KNOB_ARC_START + KNOB_ARC_RANGE, KNOB_RADIUS));
    svg.appendChild(track);

    // Tick marks at 0 / 25 / 50 / 75 / 100 %, just outside the arc
    for (let i = 0; i <= 4; i++) {
        const angle = KNOB_ARC_START + (KNOB_ARC_RANGE * i / 4);
        const inner = polarToCart(angle, KNOB_RADIUS + 3);
        const outer = polarToCart(angle, KNOB_RADIUS + 5.5);
        const notch = document.createElementNS(ns, 'line');
        notch.setAttribute('class', 'knob-notch');
        notch.setAttribute('x1', inner.x); notch.setAttribute('y1', inner.y);
        notch.setAttribute('x2', outer.x); notch.setAttribute('y2', outer.y);
        svg.appendChild(notch);
    }

    const fill = document.createElementNS(ns, 'path');
    fill.setAttribute('class', 'knob-fill');
    fill.setAttribute('data-knob-fill', '');
    svg.appendChild(fill);

    const body = document.createElementNS(ns, 'circle');
    body.setAttribute('class', 'knob-body');
    body.setAttribute('cx', KNOB_CENTER);
    body.setAttribute('cy', KNOB_CENTER);
    body.setAttribute('r', KNOB_BODY);
    svg.appendChild(body);

    // Pointer line from near the centre to the rim of the cap
    const indicator = document.createElementNS(ns, 'line');
    indicator.setAttribute('class', 'knob-indicator');
    indicator.setAttribute('data-knob-indicator', '');
    svg.appendChild(indicator);

    container.appendChild(svg);
    updateKnobVisual(container, percent);
    return container;
}

function updateKnobVisual(container, percent) {
    const clamped = Math.max(0, Math.min(1, percent));
    const angle = KNOB_ARC_START + KNOB_ARC_RANGE * clamped;

    const fill = container.querySelector('[data-knob-fill]');
    if (fill) {
        fill.setAttribute('d', clamped <= 0.001 ? '' : arcPath(KNOB_ARC_START, angle, KNOB_RADIUS));
    }

    const indicator = container.querySelector('[data-knob-indicator]');
    if (indicator) {
        const inner = polarToCart(angle, 7);
        const outer = polarToCart(angle, KNOB_BODY - 3);
        indicator.setAttribute('x1', inner.x); indicator.setAttribute('y1', inner.y);
        indicator.setAttribute('x2', outer.x); indicator.setAttribute('y2', outer.y);
    }
}

// The knob is the focusable slider for assistive tech in knob mode (the range
// input is display: none there). Value text comes from the visible readout.
function syncKnobAria(knob, slider) {
    knob.setAttribute('aria-valuenow', slider.value);
    const readout = slider.parentElement?.querySelector('.control-value');
    if (readout) knob.setAttribute('aria-valuetext', readout.textContent.trim());
}

function attachKnobToSlider(slider) {
    const min = parseFloat(slider.min);
    const max = parseFloat(slider.max);
    const step = parseFloat(slider.step) || 1;
    const range = max - min;
    const decimals = (String(step).split('.')[1] || '').length;

    const knob = createKnobSVG((parseFloat(slider.value) - min) / range);
    slider.parentElement.insertBefore(knob, slider.nextSibling);

    knob.setAttribute('role', 'slider');
    knob.setAttribute('tabindex', '0');
    knob.setAttribute('aria-valuemin', min);
    knob.setAttribute('aria-valuemax', max);
    const label = slider.parentElement.querySelector('label');
    if (label) knob.setAttribute('aria-labelledby', label.id || (label.id = `${slider.id}Label`));
    syncKnobAria(knob, slider);

    function setValue(raw) {
        if (slider.disabled) return;
        const snapped = Math.round(raw / step) * step;
        const next = Math.max(min, Math.min(max, parseFloat(snapped.toFixed(decimals))));
        if (next === parseFloat(slider.value)) return;
        slider.value = next;
        slider.dispatchEvent(new Event('input', { bubbles: true }));
    }

    function nudge(steps) {
        setValue(parseFloat(slider.value) + steps * step);
    }

    // ---- drag: vertical, pointer-captured so the gesture survives leaving the knob
    let startY = 0;
    let startValue = 0;

    function onPointerDown(e) {
        if (slider.disabled) return;
        if (e.button !== undefined && e.button !== 0) return;
        startY = e.clientY;
        startValue = parseFloat(slider.value);
        knob.setPointerCapture(e.pointerId);
        knob.classList.add('is-dragging');
        knob.focus({ preventScroll: true });
        e.preventDefault();
    }

    function onPointerMove(e) {
        if (!knob.classList.contains('is-dragging')) return;
        const factor = e.shiftKey ? FINE_FACTOR : 1;
        const delta = (startY - e.clientY) * factor; // up = positive
        setValue(startValue + delta * (range / DRAG_PX_FULL_RANGE));
    }

    function onPointerUp(e) {
        if (!knob.classList.contains('is-dragging')) return;
        knob.classList.remove('is-dragging');
        if (knob.hasPointerCapture(e.pointerId)) knob.releasePointerCapture(e.pointerId);
    }

    knob.addEventListener('pointerdown', onPointerDown);
    knob.addEventListener('pointermove', onPointerMove);
    knob.addEventListener('pointerup', onPointerUp);
    knob.addEventListener('pointercancel', onPointerUp);

    // ---- wheel: one notch = 1 % of the range (or one step if that is bigger).
    // Same on the knob and on the slider itself (vertical fader or rack row):
    // swipe up on a trackpad (natural scrolling: deltaY > 0) turns the value up.
    const onWheel = (e) => {
        if (e.deltaY === 0) return;
        e.preventDefault();
        const notch = Math.max(step, range / 100) * (e.shiftKey ? FINE_FACTOR : 1);
        const direction = e.deltaY > 0 ? 1 : -1;
        setValue(parseFloat(slider.value) + direction * Math.max(step, notch));
    };
    knob.addEventListener('wheel', onWheel, { passive: false });
    slider.addEventListener('wheel', onWheel, { passive: false });

    // ---- keyboard, same as a native range input
    knob.addEventListener('keydown', (e) => {
        const big = Math.max(step, range / 10);
        switch (e.key) {
            case 'ArrowUp': case 'ArrowRight': nudge(1); break;
            case 'ArrowDown': case 'ArrowLeft': nudge(-1); break;
            case 'PageUp': setValue(parseFloat(slider.value) + big); break;
            case 'PageDown': setValue(parseFloat(slider.value) - big); break;
            case 'Home': setValue(min); break;
            case 'End': setValue(max); break;
            default: return;
        }
        e.preventDefault();
    });

    knob.addEventListener('dblclick', () => {
        const defaultVal = slider.dataset.defaultValue;
        if (defaultVal !== undefined) setValue(parseFloat(defaultVal));
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
