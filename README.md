# ToneLab

Interactive Sound Explorer -- turn knobs, twist parameters, and explore how synthesizers shape sound.

## Features

- **10 Synthesizer Types** with descriptions: Synth, AM, FM, Membrane, Metal, Mono, Noise, Pluck, Poly, Duo
- **Presets**: 3-4 per synth type, each with tuned parameters, octave, and effects
- **SVG Rotary Knobs**: Drag up/down to adjust, double-click to reset to default
- **Master Volume** control
- **Effects Chain**: Reverb, Delay, Distortion, Filter, Chorus -- all integrated with presets
- **2-Octave Keyboard**: QWERTY, AZERTY (with dead key support), QWERTZ, Dvorak
- **Note Notation**: Switch between American (A B C) and Solfege (Do Re Mi)
- **CRT Screen Effects**: Scanlines, RGB phosphors, chromatic aberration, vignette, flicker, animated static
- **PWA**: Install as a standalone app, works offline

## Controls

### Keyboard
- Play notes with your computer keyboard (2 octaves mapped)
- Arrow keys to shift octaves
- Layout auto-detected, switchable in the keyboard panel

### Knobs
- **Drag up/down** to change value
- **Double-click** to reset to default
- Presets set all knobs + octave + effects at once

### Presets
Click a preset button to instantly configure the synth, effects, and octave for that sound. Examples: Acid Bass, Electric Piano, Hi-Hat, Dreamy Pad, Sci-Fi Laser...

## Tech Stack

- **Tone.js 14.8.49** -- Web Audio synthesis
- **Vanilla JS** -- No frameworks
- **CSS3** -- CRT effects, SVG knobs, responsive grid
- **PWA** -- Service worker, offline support, installable
- **Fonts** -- Orbitron (logo), Share Tech Mono (UI), Inter (descriptions)

## Deploy

Static site, no build step:

```bash
npx wrangler pages deploy . --project-name=tonelab
```

Or connect the repo to Cloudflare Pages with output directory `/`.

## CRT Effect Stack

| Layer | Technique |
|-------|-----------|
| Scanlines + RGB | `body::before` -- alternating gradient lines + RGB phosphor columns |
| Vignette | `body::after` -- radial gradient darkening edges |
| Flicker | `.crt-flicker` div -- rapid opacity animation (0.10s cycle) |
| Static snow | `#crtStatic` canvas -- 512x512 random pixels at 60fps, pauses on hidden tab |
| Chromatic aberration | 3 keyframe animations (text/box/knob) with staggered delays |
| Screen frame | `.crt-screen` wrapper -- inset shadows + outer glow |

Reference: [Alec Lownes - CRT Display](https://aleclownes.com/2017/02/01/crt-display.html)

## Project Structure

```
ToneLAB/
  index.html          Main HTML with CRT overlays
  script.js           Synth engine, knobs, presets, keyboard, static noise
  styles.css          CRT effects, knob layout, responsive design
  manifest.json       PWA manifest
  service-worker.js   Offline caching
  icons/              App icons (192px, 512px)
```

## License

MIT

## Credits

- [Tone.js](https://tonejs.github.io/)
- [Google Fonts](https://fonts.google.com/)
- CRT effect inspired by [Alec Lownes](https://aleclownes.com/2017/02/01/crt-display.html)
