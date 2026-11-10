# 09 · Performance, accessibility, robustness

## Performance model
One full-screen fragment shader is the whole cost. Per pixel: ≤ 32 blob iterations (early-out for dead slots), 8 ripple checks only where metal covers, and an orb raymarch (≤ 56 steps) **only inside the orb's bounding circle**. The sim is ~32 blobs on the CPU: negligible.

### Budget
| Target | Goal |
|---|---|
| Desktop integrated GPU, 1440×900 @ DPR 2 | 60 fps at render scale ≥ 0.75 |
| Mid-range phone | 30–60 fps at render scale 0.5–0.7 |
| JS shipped | < 40 KB gzip (currently ≈ 12 KB) |
| Total transfer for first paint (no images) | < 150 KB |

### Adaptive resolution (`quality.js`)
Frame-time EMA; if > 21 ms the render scale steps down by 0.1 (min 0.5), if < 12.5 ms it steps up by 0.05 (max 1). 45-frame cooldown between changes. The canvas is CSS-stretched, and the shader's grain hides the softness. DPR is capped at 2.

### Other levers already in place
- Engine **stops** when the tab is hidden (`visibilitychange`).
- `dt` clamped, sim substeps capped (no spiral of death).
- Layouts, packing and blending reuse preallocated buffers. A few small objects are still allocated per frame/substep (bound-rect list, pointer state in `sim._substep`). Harmless at this size, but the first thing to remove if a real device shows GC hitches.
- `getBoundingClientRect` read once per frame for bound elements only.

### Levers to pull if a real device is slow (in this order)
1. Lower `maxScale` / `startScale` in the `Engine` options (`main.js`).
2. Reduce loop count: cap the blob loop at the highest live slot (pass `uCount`).
3. Skip ripples on low tiers (`uCalm`-style flag).
4. Render the environment to a small cube/octahedral texture once and sample it instead of evaluating `env()` per pixel (the biggest shader cost after the loop).
5. Pause the sim step (not the render) when nothing is moving.

### What is NOT verified
All shader/visual verification so far ran on **software GL (SwiftShader) in headless Chrome**. It proves the shader compiles, runs, and looks right. It says **nothing about real-GPU frame rates**. The first real-device test (iPhone Safari + a cheap Android + an old laptop) is a launch blocker; log `engine.quality.scale` and frame time (`?debug=1` exposes `window.__molten`).

## Accessibility
- All content is real DOM text; the canvas is `aria-hidden`. Skip link present. Focus rings visible (`:focus-visible`).
- **Calm mode**: button in the header, persisted. Also auto-enabled by `prefers-reduced-motion`. Calm removes overshoot, wobble, ripples, drips, pointer interaction; it does not remove the metal (the look stays), it removes the *motion*.
- Contrast: copy is `#b8c0cc`+ on `#07080a` (≈ 10:1). The risk is **copy over bright metal**; see `AGENTS.md` and phase 2.
- The reel's cloned section is `aria-hidden` + `inert` so screen readers and tab order do not see the hero twice.
- Motion sensitivity: nothing flashes; fastest luminance changes are sub-3 Hz glints, but a **photosensitivity review** by someone who is sensitive is worthwhile before launch.
- Touch targets ≥ 44 px (the nav is hidden on mobile; the Calm button is ~32 px, enlarge in phase 2).

## Robustness
- No WebGL2 → `.no-gl` (static gradient background, full content). Context loss is handled (`webglcontextlost/restored`).
- Shader compile/link errors set `engine.error`; the page logs once and falls back instead of throwing.
- `npm run shots` fails on any console error, NaN in sim state, flat/blank canvas, or a broken reel wrap.
- Fuzz test: a 20 s random pointer storm with random `dt` never produces NaN or out-of-range positions.

## Browser support target
Evergreen Chrome/Edge/Firefox/Safari (WebGL2 is available in Safari 15+). `backdrop-filter` has a `-webkit-` prefix already; without it, glass cards degrade to a flat translucent fill.
