# Outlina Clone Website

A 1:1 reproduction of [outlina.ai](https://outlina.ai/) including the custom WebGL shader, exact typography, vector assets, and responsive UI.

## Features

- **Custom WebGL Wave & Bloom Shader (`wave.js`)**:
  - Procedural vertex wave deformation with multi-harmonic sine oscillations
  - 2D Simplex Noise by Ian McEwan / Ashima Arts (MIT)
  - Domain-warped dual-drift noise field with dynamic blue-to-gold chromatic palette
  - Multi-pass Bloom pipeline (separable 12-tap soft blur + 24-tap wide bloom + composite grain pass)
  - Glass bevel rim refraction shader using signed distance field (SDF) box calculation
- **Exact Typography**:
  - **Tiempos Headline** (`tiempos`) for the main title
  - **Saans** (`saans`) for the secondary UI text and descriptions
  - **Outlina Inter / Inter Variable** for forms, buttons, and navigation
  - **Overused Grotesk** for editor manuscript and labels
- **Interactive UI**:
  - Interactive "Join the waitlist" form with real-time email validation and loading states
  - Floating product card preview with glassmorphic borders
  - Interactive channel idea carousel with previous / next pagination (`1 / 3`)
  - Full manuscript review editor with simulated AI revision composer tooltip
  - User profile menu and sidebar collapse functionality

## How to Run

You can run this project with any local web server:

### Option 1: Python
```bash
cd outlina-clone
python3 -m http.server 3000
```
Then open `http://localhost:3000` in your browser.

### Option 2: Node.js (npx serve)
```bash
cd outlina-clone
npx serve .
```

### Option 3: Deploy to Vercel or Netlify
This is a purely static site with zero external runtime dependencies. You can drag and drop the `outlina-clone` folder directly onto [Vercel](https://vercel.com) or [Netlify](https://www.netlify.com).

## Customizing Shader Parameters (`wave.js`)

You can easily adjust the wave animation inside `wave.js`:
- **Speed**: Adjust `t = 0.2 * u_time` in `waveFragmentShader` or `t = 0.7 * u_time` in `waveVertexShader`
- **Colors**: Edit `cool`, `pale`, `gold`, and `amber` RGB vectors in `waveFragmentShader`
- **Grain intensity**: Change the multiplier in `colour += vec3(.08, .08, .07) * grain * amount * 15.0;`
- **Bloom strength**: Edit the bloom factor in `bloomCompositeFragmentShader` (`bloom * 0.35`)
