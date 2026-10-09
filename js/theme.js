// Colour themes: "cyber" (default), "sodium" and "replicant". The choice sets html[data-theme], which
// css/15-theme-sodium.css and css/16-theme-replicant.css read; it is saved in localStorage ("theme"). An inline script in
// <head> applies the saved theme before the first paint. JS that draws on canvas (the scope)
// listens for 'theme-change' and re-reads the colours from the CSS variables.
const STORE = 'theme';
const THEMES = { cyber: '#2a1a5e', sodium: '#2b1a0c', replicant: '#0d1a18' }; // value = <meta name="theme-color">

function setTheme(name, { save = true } = {}) {
    if (!(name in THEMES)) name = 'cyber';
    if (name === 'cyber') delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = name;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEMES[name]);
    document.querySelectorAll('[data-theme-choice]').forEach(btn => {
        const on = btn.dataset.themeChoice === name;
        btn.classList.toggle('active', on);
        btn.setAttribute('aria-pressed', String(on));
    });
    if (save) { try { localStorage.setItem(STORE, name); } catch (_) { /* private mode */ } }
    document.dispatchEvent(new CustomEvent('theme-change', { detail: { name } }));
}

let saved = null;
try { saved = localStorage.getItem(STORE); } catch (_) { /* private mode */ }
setTheme(saved, { save: false });

document.querySelectorAll('[data-theme-choice]').forEach(btn => {
    btn.addEventListener('click', () => { setTheme(btn.dataset.themeChoice); btn.blur(); });
});

export { setTheme };
