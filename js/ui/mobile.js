// "Pocket" shell for narrow screens (< 1024px): a 100dvh app instead of a
// scrolling page. Top bar · scope strip (swipe = preset) · tabs · one control
// set per page · keyboard. The DOM stays shared with the desktop layout:
// entering pocket mode moves a few nodes into mobile slots (type stepper into
// the header, secondary controls into the settings sheet, effects into the pages
// carousel) and leaving puts them back exactly where they were.

import { synthPresets, applyPreset } from '../audio/presets.js';
import { initXYPad } from './xypad.js';

// XY pad page: built and working (js/ui/xypad.js), parked until the rest of
// the pocket shell has settled. Flip to true to get the XY tab back.
const XY_PAD = false;

const mq = window.matchMedia('(max-width: 1023px)');
const moved = [];

function moveTo(el, parent, before = null) {
    if (!el || !parent) return;
    moved.push({ el, parent: el.parentNode, next: el.nextSibling });
    parent.insertBefore(el, before);
}

function restoreAll() {
    while (moved.length) {
        const m = moved.pop();
        m.parent.insertBefore(m.el, m.next);
    }
}

const SHEET_ROWS = [
    { sel: '.controls-toggle', title: 'Controls', hint: 'Turn knobs or slide faders. Same parameters, pick what your thumb likes.' },
    { sel: '.scope-modes', title: 'Scope', hint: 'The strip under the instrument: the waveform you hear, or its spectrum.' },
    { sel: '.key-labels-toggle', title: 'Key labels', hint: 'What is printed on each key: the note name, the computer key.' },
    { sel: '.keyboard-controls .instrument-select:has(#noteNotation)', title: 'Note names', hint: 'C D E or Do Re Mi on the keys.' },
    { sel: '.keyboard-controls .instrument-select:has(#keyboardLayout)', title: 'Computer keyboard', hint: 'Only matters with a physical keyboard plugged in.' },
    { sel: '#installBtn', title: 'Install', hint: 'Add ToneLAB to your home screen. Works offline, no browser bar.' }
];

const TAB_NAMES = {
    'Oscillator': 'OSC', 'Envelope': 'ENV', 'Filter': 'FLT', 'Filter Envelope': 'F.ENV',
    'Operators': 'OPS', 'Mod Envelope': 'M.ENV', 'Pitch': 'PITCH', 'Tone': 'TONE',
    'String': 'STR', 'Voices': 'VOICE'
};

const $ = (sel) => document.querySelector(sel);
let xy = null;
let pagesObserver = null;
let presetObserver = null;
let active = false;

/* ---------- pages + tabs ---------- */

function pageList() {
    const pages = $('#pages');
    const pageSel = ':scope > #controls > .control-set, :scope > .effect-controls, :scope > .arp-set:not([hidden])' + (XY_PAD ? ', :scope > .xy-set' : '');
    return [...pages.querySelectorAll(pageSel)];
}

function tabName(page) {
    if (page.classList.contains('effect-controls')) return 'FX';
    if (page.classList.contains('xy-set')) return 'XY';
    if (page.classList.contains('arp-set')) return '\u25CF ARP';
    const title = page.querySelector('.control-set-title')?.textContent.trim() || '';
    return TAB_NAMES[title] || title.slice(0, 5).toUpperCase();
}

function buildTabs() {
    const bar = $('#tabBar');
    const pages = $('#pages');
    bar.innerHTML = '';
    pageList().forEach((page, i) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'tab-btn';
        btn.setAttribute('role', 'tab');
        btn.setAttribute('aria-selected', String(i === 0));
        btn.textContent = tabName(page);
        // Every page is exactly one carousel width; offsetLeft would be measured
        // from the positioned .container and lands one page off in landscape.
        btn.addEventListener('click', () => {
            markTab(i); // highlight now, the scroll event confirms it later
            slideTo(pages, i * pages.clientWidth);
        });
        bar.appendChild(btn);
    });
    pages.scrollTo({ left: 0 });
    syncTabs();
}

// Quick page slide (the browser's smooth scroll takes ~500 ms, too slow for a
// tab tap); instant for people who asked for less motion.
const SLIDE_MS = 120;
const SLIDE_MAX_FRAMES = 8; // ~130 ms at 60 fps, and a cap if the clock stalls
let slideRaf = null;
function slideTo(el, target) {
    cancelAnimationFrame(slideRaf);
    // Mandatory scroll-snap would re-snap every intermediate scrollLeft, so it
    // is paused for the duration of the slide.
    const finish = () => { el.scrollLeft = target; el.style.scrollSnapType = ''; };
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { finish(); return; }
    el.style.scrollSnapType = 'none';
    const from = el.scrollLeft;
    const start = performance.now();
    let frames = 0;
    const step = (now) => {
        frames++;
        const t = Math.min(1, Math.max((now - start) / SLIDE_MS, frames / SLIDE_MAX_FRAMES));
        const eased = 1 - (1 - t) * (1 - t); // ease-out
        if (t >= 1) { finish(); return; }
        el.scrollLeft = from + (target - from) * eased;
        slideRaf = requestAnimationFrame(step);
    };
    slideRaf = requestAnimationFrame(step);
}

function markTab(idx) {
    $('#tabBar').querySelectorAll('.tab-btn').forEach((b, i) => b.setAttribute('aria-selected', String(i === idx)));
}

function syncTabs() {
    const pages = $('#pages');
    const w = pages.clientWidth || 1;
    markTab(Math.round(pages.scrollLeft / w));
}

/* ---------- presets on the scope strip ---------- */

function activePresetIndex() {
    const btn = $('#presetBar .preset-btn.active');
    return btn ? parseInt(btn.dataset.preset, 10) : -1;
}

function syncPresetName() {
    const btn = $('#presetBar .preset-btn.active');
    document.querySelectorAll('[data-preset-name]').forEach(el => { el.textContent = btn ? btn.textContent : 'swipe for presets'; });
}

function stepPreset(step) {
    const type = $('#instrumentType').value;
    const n = synthPresets[type]?.length || 0;
    if (!n) return;
    const next = (activePresetIndex() + step + n * 2) % n;
    applyPreset(type, next);
}

function stepType(step) {
    const select = $('#instrumentType');
    const n = select.options.length;
    select.selectedIndex = (select.selectedIndex + step + n) % n;
    select.dispatchEvent(new Event('change', { bubbles: true }));
}

/* ---------- settings sheet (gear) ---------- */

function openSheet(open) {
    const sheet = $('#moreSheet');
    sheet.hidden = !open;
    $('#moreBtn').setAttribute('aria-expanded', String(open));
    if (open) $('#sheetClose').focus();
}

/* ---------- enter / leave ---------- */

function enter() {
    if (active) return;
    active = true;
    document.body.classList.add('pocket');

    moveTo($('.type-stepper'), $('#typeSlot'));
    // Each secondary control gets a row with a title and a one-line hint
    // The theme and CRT rows are static in the sheet (they are also the desktop settings): pocket rows go above them
    const slots = $('#sheetSlots');
    SHEET_ROWS.forEach(({ sel, title, hint }) => {
        const el = $(sel);
        if (!el) return;
        const row = document.createElement('div');
        row.className = 'sheet-row';
        row.dataset.pocket = '';
        row.innerHTML = `<div class="sheet-row-text"><span class="sheet-row-title">${title}</span><span class="sheet-row-hint">${hint}</span></div>`;
        slots.insertBefore(row, $('#themeRow'));
        moveTo(el, row);
    });
    moveTo($('.effect-controls'), $('#pages'), $('#arpSet'));
    // The whole arp strip becomes the ARP page (lights included); the keyboard box keeps only the ARP switch
    moveTo($('#arpStrip'), $('#arpSet'));
    syncArpTab();

    $('#xySet').hidden = !XY_PAD;
    if (XY_PAD) {
        if (!xy) xy = initXYPad($('#xySet'));
        xy.refresh($('#instrumentType').value);
    }
    buildTabs();

    pagesObserver = new MutationObserver(() => {
        if (!active) return;
        buildTabs();
        xy?.refresh($('#instrumentType').value);
    });
    pagesObserver.observe($('#controls'), { childList: true });

    document.addEventListener('arp-change', syncArpTab);
    presetObserver = new MutationObserver(syncPresetName);
    presetObserver.observe($('#presetBar'), { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
    syncPresetName();
}

// The ARP tab exists only while the arp runs; rebuilt on toggle
function syncArpTab(e) {
    if (!active) return;
    const set = $('#arpSet');
    const on = Boolean(window.ToneLAB?.state?.arp?.on);
    if (set.hidden !== !on) {
        set.hidden = !on;
        buildTabs();
    }
    // Starting the arp lands you on its page
    if (on && e?.detail?.on) {
        const pages = $('#pages');
        const idx = pageList().indexOf(set);
        if (idx >= 0) {
            // Tablet layout hides the tab bar and stacks every set: scroll to the strip instead of sliding
            if (getComputedStyle($('#tabBar')).display === 'none') set.scrollIntoView({ block: 'nearest' });
            else { markTab(idx); slideTo(pages, idx * pages.clientWidth); }
        }
    }
}

function leave() {
    if (!active) return;
    active = false;
    document.removeEventListener('arp-change', syncArpTab);
    document.body.classList.remove('pocket');
    pagesObserver?.disconnect();
    presetObserver?.disconnect();
    openSheet(false);
    restoreAll();
    document.querySelectorAll('#sheetSlots > [data-pocket]').forEach(row => row.remove()); // drop the empty rows
}

/* ---------- wiring (listeners live on static nodes, so they are bound once) ---------- */

document.addEventListener('DOMContentLoaded', () => {
    $('#pages').addEventListener('scroll', () => { if (active) syncTabs(); }, { passive: true });
    document.querySelectorAll('[data-step]').forEach(btn => btn.addEventListener('click', () => stepType(parseInt(btn.dataset.step, 10))));
    document.querySelectorAll('[data-preset-step]').forEach(btn => btn.addEventListener('click', () => stepPreset(parseInt(btn.dataset.presetStep, 10))));

    // Swipe on the scope strip = previous / next preset
    const scope = $('.scope-block');
    let swipeX = null;
    scope.addEventListener('pointerdown', (e) => { if (active && !e.target.closest('button')) swipeX = e.clientX; });
    scope.addEventListener('pointerup', (e) => {
        if (swipeX === null) return;
        const dx = e.clientX - swipeX;
        swipeX = null;
        if (Math.abs(dx) > 40) stepPreset(dx < 0 ? 1 : -1);
    });
    scope.addEventListener('pointercancel', () => { swipeX = null; });

    // Instrument description popover: text mirrors #synthDescription (which
    // lives in the settings sheet in pocket mode). The global help-btn handler in
    // controls.js does the open / close; this fills the text and closes it on
    // outside taps and instrument changes.
    const typeHelp = $('#typeHelp');
    const typeHint = $('#typeHint');
    const closeTypeHint = () => { typeHint.hidden = true; typeHelp.setAttribute('aria-expanded', 'false'); };
    typeHelp.addEventListener('click', () => { typeHint.textContent = $('#synthDescription').textContent; });
    document.addEventListener('pointerdown', (e) => {
        if (!typeHint.hidden && !e.target.closest('.type-stepper')) closeTypeHint();
    });
    $('#instrumentType').addEventListener('change', closeTypeHint);

    // Preset ? popovers (header on desktop, scope strip on mobile): text is
    // filled by applyPreset through data-preset-hint; outside tap closes them
    document.addEventListener('pointerdown', (e) => {
        if (e.target.closest('.preset-stepper-row, .scope-preset')) return;
        document.querySelectorAll('.preset-help[aria-expanded="true"]').forEach(btn => {
            const hint = document.getElementById(btn.getAttribute('aria-controls'));
            if (hint) hint.hidden = true;
            btn.setAttribute('aria-expanded', 'false');
        });
    });

    $('#moreBtn').addEventListener('click', () => openSheet($('#moreSheet').hidden));
    $('#sheetClose').addEventListener('click', () => openSheet(false));
    $('#moreSheet').addEventListener('click', (e) => { if (e.target === e.currentTarget) openSheet(false); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('#moreSheet').hidden) openSheet(false); });

    mq.addEventListener('change', (e) => (e.matches ? enter() : leave()));
    if (mq.matches) enter();
});
