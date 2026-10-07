// PWA plumbing: service-worker registration with update reload, and the install prompt button.

// Register Service Worker for PWA
if ('serviceWorker' in navigator) {
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
            .then(registration => {
                // Listen for updates
                registration.addEventListener('updatefound', () => {
                    const newWorker = registration.installing;
                    newWorker.addEventListener('statechange', () => {
                        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                            newWorker.postMessage('SKIP_WAITING');
                        }
                    });
                });
            })
            .catch(error => {
                console.log('Service Worker registration failed:', error);
            });
    });
}

// PWA Install prompt
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
