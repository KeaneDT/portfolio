# AGENTS.md — rules for any coding agent in this repo

## Ground rules
1. **Do not rewrite working code.** `site/src/engine/sim.js`, `shaders.js`, `layouts.js` are tuned and tested. Make the smallest change that meets the task.
2. **Stack is fixed:** vanilla ES modules, WebGL2, Vite. No framework, no Three.js, no new runtime dependency without asking the owner.
3. **Verify, don't assume.** Run `npm test`, `npm run build`, `npm run shots` from `site/`. State what you ran. If you could not run something, label the claim *untested*.
4. **Owner-facing honesty.** If a request hurts performance, readability or accessibility, say so and propose an alternative. Do not just comply.

## Architecture rules (these keep the project maintainable)
- `src/engine/sim.js` is **pure JS, no DOM, no WebGL**. Deterministic for a given seed. Every behaviour change needs a test in `tests/sim.test.js`.
- `src/engine/shaders.js` is the only place GLSL lives. One fragment shader, one pass. Uniform array sizes (32 blobs, 8 ripples) are shared constants with `sim.js`: change both or neither.
- `src/engine/layouts.js` describes **intent** (where metal wants to be). Never put physics in a layout. Layouts must be allocation-free per frame and must tolerate `ctx.rects` being empty.
- `src/engine/index.js` is the only module that touches both the sim and the renderer. Page code talks to `Engine` (`setProgress`, `setPointer`, `bind`, `setCalm`), never to the sim directly.
- Page code lives in `src/site/` and `src/main.js`. CSS tokens in `tokens.css`; no hard-coded colours elsewhere.
- Do not read layout (`getBoundingClientRect`) more than once per frame, and never write to the DOM in the render loop.

## Do not break
- **Calm mode** (`engine.setCalm`) and `prefers-reduced-motion`: motion must visibly reduce, not just slow.
- **No-WebGL fallback** (`.no-gl` class): the page must remain fully usable and attractive without the canvas.
- **Keyboard + screen reader:** the canvas is `aria-hidden`; all content is real DOM text. Keep focus rings.
- **Text contrast over metal:** body copy must never sit directly on bright chrome. Use the layout to keep metal away from copy, or a glass panel.
- **The reel wrap** (`reel.js`): the clone section must stay pixel-identical to section 0 in height.

## Definition of done for any change
- `npm test` passes
- `npm run build` succeeds
- `npm run shots` prints `RESULT: PASS` (desktop, and `-- --mobile` if you touched layout/CSS)
- You looked at the screenshots in `site/shots/` for the sections you touched
- You report: what changed, what you ran, what you did **not** verify

## Style
- Plain, small functions. Comments explain *why*, not *what*.
- No dead code, no commented-out experiments, no TODO without an owner-visible entry in `docs/06-build-plan.md`.
