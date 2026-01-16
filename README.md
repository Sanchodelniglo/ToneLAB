# ToneLab Synthesizer

Advanced Web Synthesizer built with Tone.js featuring a retro-futuristic cyberpunk design.

## 🎹 Features

- **10 Synthesizer Types**: Synth, AM Synth, FM Synth, Membrane Synth, Metal Synth, Mono Synth, Noise Synth, Pluck Synth, Poly Synth, Duo Synth
- **38+ Waveforms**: sine, square, triangle, sawtooth, pulse, pwm, and numbered variants (sine2-8, square2-8, etc.)
- **Effects Chain**: Reverb, Delay, Distortion, Filter, Chorus
- **Computer Keyboard Support**: Play with QWERTY, AZERTY, QWERTZ, or Dvorak layouts
- **Octave Shifting**: 0-8 octave range controlled by arrow keys
- **PWA Support**: Install as a standalone app, works offline
- **Responsive Design**: Works on desktop and mobile devices

## 📁 Project Structure

```
tonelab/
├── index.html          # Main HTML file
├── styles.css          # All CSS styling
├── script.js           # JavaScript logic
├── manifest.json       # PWA manifest
├── service-worker.js   # Service worker for offline support
└── README.md           # This file
```

## 🚀 Installation & Usage

### Option 1: Local Development
1. Download all files to a folder
2. Open `index.html` in a modern web browser
3. Click anywhere to start the audio context

### Option 2: Web Server (Recommended for PWA features)
1. Host all files on a web server (HTTPS required for PWA)
2. Visit the URL in your browser
3. Click the "📱 Install App" button to install as a PWA

### Option 3: Simple Python Server
```bash
python -m http.server 8000
# Then visit http://localhost:8000
```

## 🎮 Controls

### Keyboard Playing
- **A W S E D F T G Y H U J K** (QWERTY) - Play notes
- **←/→ Arrow Keys** - Change octaves
- Keys are automatically mapped to your selected keyboard layout

### Mouse/Touch
- Click piano keys to play notes
- Adjust sliders to modify parameters
- Select different instruments and waveforms from dropdowns

### Parameters
Each synthesizer has unique parameters:
- **Envelope**: Attack, Decay, Sustain, Release
- **Oscillator**: Waveform type selection
- **Modulation**: Harmonicity, modulation index (AM/FM synths)
- **Filter**: Cutoff frequency, Q factor (MonoSynth)
- And many more instrument-specific controls

### Effects
Global effects can be adjusted in real-time:
- **Reverb**: Room ambience
- **Delay**: Echo effect with time and feedback
- **Distortion**: Overdrive/saturation
- **Filter**: Frequency cutoff
- **Chorus**: Modulation effect

## 🎨 Design Theme

Retro-futuristic cyberpunk aesthetic featuring:
- Neon cyan (#00f0ff) and magenta (#ff00aa) accents
- Dark translucent panels with glow effects
- Orbitron font for headers
- Share Tech Mono for body text
- Smooth animations and hover effects

## 🛠️ Technical Stack

- **Tone.js 14.8.49**: Web Audio synthesis library
- **Vanilla JavaScript**: No frameworks required
- **CSS3**: Modern features (gradients, backdrop-filter, animations)
- **PWA**: Progressive Web App with service worker
- **LocalStorage**: Saves keyboard layout preference

## 📱 PWA Features

- **Installable**: Add to home screen on mobile/desktop
- **Offline**: Works without internet after first load
- **Standalone**: Opens in its own window
- **Fast**: Cached resources for instant loading

## 🔧 Customization

### Changing Colors
Edit CSS variables in `styles.css`:
```css
:root {
    --bg-primary: #0a0e27;
    --accent-cyan: #00f0ff;
    --accent-magenta: #ff00aa;
    /* ... */
}
```

### Adding Instruments
1. Add option to instrument selector in `index.html`
2. Add configuration in `getSynthConfig()` in `script.js`
3. Add controls in `controlSets` object in `script.js`

### Modifying Effects
Edit effect initialization in `initEffects()` function in `script.js`

## 🌐 Browser Compatibility

- Chrome/Edge 90+
- Firefox 88+
- Safari 14+
- Mobile browsers (iOS Safari, Chrome Android)

Requires Web Audio API support.

## 📄 License

Feel free to use and modify for personal or commercial projects.

## 🙏 Credits

- Built with [Tone.js](https://tonejs.github.io/)
- Fonts from [Google Fonts](https://fonts.google.com/)
- Design inspired by retro-futuristic synthesizers

---

Made with ❤️ and ☕ | Enjoy making music! 🎵
