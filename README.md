# ToneLAB

Interactive Sound Explorer -- turn knobs, twist parameters, and explore how synthesizers shape sound.
It runs in the browser, works offline, and installs as an app.

## Features

### Sound
- **10 synthesizer types**, each with a short description: Synth, AM, FM, Membrane, Metal, Mono, Noise, Pluck, Poly, Duo
- **85 presets**: 8 per synth in two banks, plus 5 fat-wave presets. Each preset sets the knobs, the octave, and the full effects rack. Every preset has a one-line hint for beginners (`?` next to the preset name)
- **Wave picker** with a drawing of each shape. Besides sine, square, triangle, sawtooth, pulse and PWM, it has partial-limited shapes (for example `sawtooth4`) and **fat waves**: three detuned copies of a wave, with a **Spread** knob that sets the detune in cents (only active on a fat wave)
- **Effects rack**: reverb (mix, size), delay (time, feedback, mix), distortion, filter cutoff, chorus (rate, mix), and a brick-wall limiter on the master output
- **Scope**: oscilloscope or log-frequency spectrum of what you hear, after the effects

### Playing
- **2-octave keyboard** with QWERTY, AZERTY (with dead keys), QWERTZ and Dvorak layouts. Octave buttons shift the range
- **HOLD**: latches notes so they keep ringing. Tap a lit key to release it
- **Arpeggiator (ARP)**: held notes become a running pattern. Modes up, down, up-down, random, as-played. 1 to 3 octaves, rate, gate, swing, BPM knob and tap tempo. 16 step lights: tap one to mute it, double-tap to accent it
- **Touch**: glide across keys, haptic tick on note start (where the browser allows it)
- **Note names** as A B C or Do Re Mi, and a switch for the labels printed on the keys

### Controls
- **SVG rotary knobs**: drag up or down (Shift for fine), mouse wheel, arrow keys, double-click to reset. Or switch to **Sliders** (vertical faders). The choice is saved
- **RND**: randomizes the waves, knobs and effects of the current instrument. The volume stays as it is
- **Envelope preview**: a live ADSR curve above every envelope (amp, filter, modulation)
- **Hints**: every control has a `?` that explains it with values to try. The hint stays on screen and clear of the keyboard

### Screen and settings
- **CRT look**: scanlines, RGB phosphors, vignette, flicker, static, and a colour glitch. The **gear** button opens Settings, where each of Scanlines, Vignette, Flicker and Glitch can be turned off. They start off for Flicker and Glitch when the system asks for reduced motion
- **Three layouts**: a one-screen workstation on desktop (1024px and wider), a tablet layout (768 to 1023px wide) that shows every set at once, and a phone layout with tabs, a preset strip on the scope, and a landscape split
- **PWA**: install it as an app, works fully offline (no CDN at runtime)
- **Three colour themes** in Settings (gear): **Cyber** (cyan and magenta, the default), **Sodium** (amber and teal on smoggy blue-black, like a rainy city at night) and **Replicant** (deep green, teal and rose: the palette of the Replicant Runner VS Code theme). The choice is saved. Text colours are tuned for contrast in all of them (see "Colours" below)

## Controls

### Keyboard
- Play notes with your computer keyboard (2 octaves mapped)
- Use the OCT buttons to shift octaves
- The layout is detected automatically and can be changed in the keyboard panel

### Knobs
- **Drag up/down** to change a value (hold **Shift** for fine steps)
- **Double-click** to reset to the default
- A preset sets all knobs, the octave and the effects at once

### Presets
Pick a preset with the arrows or the list. Examples: Acid Bass, Electric Piano, Hi-Hat, Dreamy Pad, Sci-Fi Laser, Super Saw. On a phone, swipe the scope strip to step through presets.

## Tech Stack

- **Tone.js 14.8.49** -- Web Audio synthesis (vendored in `vendor/`)
- **Vanilla JS** -- native ES modules, no framework, no build step
- **CSS3** -- custom properties, 16 imported stylesheets (see structure)
- **PWA** -- service worker, fully offline, installable
- **Fonts** -- Orbitron (logo), Share Tech Mono (UI), Inter (descriptions), self-hosted in `fonts/`

## Deploy

Static site, no build step:

```bash
npx wrangler pages deploy . --project-name=tonelab
```

Or connect the repo to Cloudflare Pages with output directory `/`.

## CRT Effect Stack

| Layer | Technique | Setting |
|-------|-----------|---------|
| Scanlines + RGB | `body::before` -- alternating gradient lines and RGB phosphor columns | Scanlines |
| Vignette | `body::after` -- radial gradient darkening the edges | Vignette |
| Flicker | `.crt-flicker` div -- fast opacity animation (0.10 s cycle) | Flicker |
| Static snow | `#crtStatic` canvas -- tiled noise, stops drawing when off or when the tab is hidden | Flicker |
| Chromatic aberration | 3 keyframe animations (text, box, knob) with staggered delays | Glitch |
| Screen frame | `.crt-screen` wrapper -- inset shadows and an outer glow | always on |

Reference: [Alec Lownes - CRT Display](https://aleclownes.com/2017/02/01/crt-display.html)

## Colours

All colours are tokens in `css/01-tokens.css`. A theme is a block that gives the same tokens new values (`css/15-theme-sodium.css` and `css/16-theme-replicant.css`, selected by `html[data-theme="..."]`). In every theme `cyan` is the primary accent and `magenta` the secondary accent. Solid colours are plain variables (`--accent-cyan`, `--text-primary`). Translucent colours are channel triplets, used as `rgb(var(--cyan-rgb) / 0.25)`. Text uses lifted tints (`--cyan-text`, `--magenta-text`) so it stays readable: body text about 11-12:1 and the secondary accent at least 5.5:1 against the panels.

## Project Structure

```
ToneLAB/
  index.html          Main HTML with CRT overlays and the settings sheet
  js/main.js          Entry: audio init, wiring (native ES modules, no build)
  js/state.js         Shared mutable state + keyboard layouts / note labels
  js/theme.js         Colour theme switch (saved, applied before first paint)
  js/crt.js           CRT toggles (saved) and the static snow canvas
  js/pwa.js           Service worker registration, install prompt
  js/audio/           effects.js (rack, limiter), synth.js (engine, note triggers), presets.js
  js/ui/              controls.js (knob grid, hints), knobs.js (SVG knobs), keyboard.js (keys, HOLD, touch),
                      scope.js (oscilloscope / spectrum), wavePreview.js (wave picker), envelope.js (ADSR preview),
                      randomize.js (RND), arp.js (arpeggiator), mobile.js (phone shell, settings sheet), xypad.js
  styles.css          entry point: @imports css/ in cascade order (the order is the cascade)
  css/                01 tokens · 02 screen (CRT) · 03 panels · 04 controls · 05 keyboard · 06 responsive ·
                      07 scope · 08 desktop · 09 pocket (phone) · 10 effects rack · 11 arp · 12 extras ·
                      13 settings · 14 tablet · 15 Sodium theme · 16 Replicant theme
  manifest.json       PWA manifest
  service-worker.js   Offline caching (precache + stale-while-revalidate)
  fonts/              Self-hosted woff2 fonts + @font-face CSS
  vendor/             Tone.js (MIT, see Tone.js.LICENSE.txt)
  icons/              App icons (192px, 512px)
```

When you add a stylesheet, import it in `styles.css` (in cascade order) and add it to `PRECACHE_URLS` in `service-worker.js`. Bump the cache name there on every release.

## License

MIT

## Credits

- [Tone.js](https://tonejs.github.io/)
- [Google Fonts](https://fonts.google.com/) (Orbitron, Share Tech Mono, Inter -- self-hosted)
- CRT effect inspired by [Alec Lownes](https://aleclownes.com/2017/02/01/crt-display.html)
