// PWA plumbing: service-worker registration with update reload, and the install prompt button.

// Local dev server: no service worker, and drop any that an earlier visit
// left behind. Otherwise stale-while-revalidate hands you yesterday's JS on
// every first load after an edit.
const isLocalDev = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname) || /^192\.168\.|^10\./.test(location.hostname);

if ('serviceWorker' in navigator && isLocalDev) {
    navigator.serviceWorker.getRegistrations().then(regs => regs.forEach(r => r.unregister()));
    if (window.caches) caches.keys().then(keys => keys.forEach(k => caches.delete(k)));
}

// Register Service Worker for PWA
if ('serviceWorker' in navigator && !isLocalDev) {
    // Reload once when a *new* worker takes over so the page runs the assets
    // that worker just precached. Skipped on first install (no previous
    // controller) so the initial visit is not interrupted.
    const hadController = Boolean(navigator.serviceWorker.controller);
    let reloading = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (!hadController || reloading) return;
        reloading = true;
        window.location.reload();
    });

    window.addEventListener('load', () => {
        navigator.serviceWorker.register('service-worker.js')
            .catch(error => console.log('Service Worker registration failed:', error));
    });
}

// PWA Install prompt
// Credits (Settings → Credits): a native dialog, Esc and the focus trap come with it
const credits = document.getElementById('creditsDialog');
document.querySelectorAll('[data-credits-open]').forEach(btn => btn.addEventListener('click', () => credits.showModal()));
credits.querySelector('[data-dialog-close]').addEventListener('click', () => credits.close());
credits.addEventListener('click', (e) => { if (e.target === credits) credits.close(); }); // the backdrop

// The release number is the service worker cache name (tonelab-synth-vNN): one number to bump.
// No cache (local dev, blocked storage) leaves "dev".
if (window.caches) {
    caches.keys().then(keys => {
        const v = Math.max(0, ...keys.map(k => +(k.match(/^tonelab-synth-v(\d+)$/)?.[1] || 0)));
        if (v) document.getElementById('appVersion').textContent = String(v);
    }).catch(() => { /* storage blocked: stays "dev" */ });
}

let deferredPrompt;
const installBtn = document.getElementById('installBtn');

window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    installBtn.style.display = 'inline-block';
});

installBtn.addEventListener('click', async () => {
    if (!deferredPrompt) return;

    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    console.log(`User response to install prompt: ${outcome}`);
    deferredPrompt = null;
    installBtn.style.display = 'none';
});

window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    installBtn.style.display = 'none';
});
