# 06 · Build plan (work order for the coding model)

Do phases **in order**. Each phase ends with the acceptance checks; do not start the next until they pass. After every phase run, from `site/`: `npm test && npm run build && npm run shots` (and `npm run shots -- --mobile` if layout/CSS changed).

## Phase 0 — Baseline (already done in this package)
- Engine, shader, 6 layouts, reel, calm mode, fallback, tests, shots script. Screens in `reference/screens/`.
- **Accept:** `npm test` 13/13, `npm run shots` PASS.

## Phase 1 — Real content and typography
1. Replace every `[bracket]` in `site/index.html` with real copy (see `docs/08`).
2. Self-host one display + body font (variable, WOFF2, `font-display: swap`, preload the display file). Update `--font` in `tokens.css`.
3. Generate the clone section from section 0 in JS at startup so the hero copy can never drift (see `docs/04`).
4. Real `<title>`, description, OG/Twitter tags, canonical, `robots.txt`, `sitemap.xml`, 1200×630 OG image (a screenshot of the hero is fine to start).
5. `404.html` that fits the theme.
- **Accept:** no `[` characters left in shipped HTML; Lighthouse SEO ≥ 95, Accessibility ≥ 95 on desktop; fonts do not cause layout shift (CLS < 0.05).

## Phase 2 — Visual tuning pass (taste, with screenshots)
Work through `npm run shots` PNGs section by section and fix what looks off. Known candidates:
- About: the cluster under the orb shows busy interior reflections; try fewer/larger blobs or lower `cohesion` there.
- Path: beads should neck into a continuous strand; tune count/radius/`k` in `thread()`.
- Notes: top pool must stay clear of the header on short viewports (< 700px high).
- Work: confirm glass cards stay readable when a bead sits behind text (raise `--glass` opacity if not).
- Contrast: sample text over metal; body copy must pass WCAG AA (4.5:1) in every section at every scroll position.
- **Accept:** screenshots reviewed by the owner; no text over bright chrome; no overlap between orb and headings at 1440×900, 1280×720, 1920×1080, 390×844, 768×1024.

## Phase 3 — Interaction polish
1. Intro "gather": on load, blobs start scattered (already) — add a 1.2 s fade-in of the canvas so the first frame is not a pop.
2. Cursor: hide the cursor droplet over text blocks and links (it should not compete with reading).
3. Hover on cards: nudge the nearest beads toward the card (call a new `engine.poke(x, y, strength)` that applies a short impulse; add a sim test).
4. Keyboard: make focus on a card also nudge its beads.
5. Optional: haptic tick on merges for touch (`navigator.vibrate(8)`), **off by default**, behind the Calm toggle's inverse.
- **Accept:** no sim API breakage; new behaviour has tests; calm mode disables all of it.

## Phase 4 — Reel robustness
1. Handle `location.hash` on load and back/forward.
2. Pause the engine when the page is scrolled to a secondary page (already stops when hidden).
3. Upward looping (second twin + start offset) **only if** the owner wants it after seeing the downward-only version. Test on iOS Safari first.
- **Accept:** anchor links work from a cold load; no scroll jank in Chrome, Safari, Firefox; wrap seam invisible in a screen recording.

## Phase 5 — Quick view (zoom to open a project)
Project cards open an overlay: the orb (or head) scales up to fill the screen (`R` → ~0.9), the metal parts, and the project panel fades in over it; close reverses. Implement as a new "layout" state driven by an `engine.setOverlay(0..1)` that overrides the orb target and pushes anchors to the edges; do **not** navigate to a new page.
- **Accept:** open/close is interruptible mid-animation; Esc closes; focus is trapped inside and restored; works with Calm on (cross-fade instead of zoom).

## Phase 6 — The head
Follow `docs/05`. Ship the orb first; this phase happens after launch.
- **Accept:** same performance budget as the orb; same `yaw`/`clay`/wobble/bulge contract; the owner approves the likeness/stylisation from still renders **before** it is wired in.

## Phase 7 — Launch checklist
- Deploy per `docs/07`. Custom domain attached. HTTPS on. `www` → apex redirect.
- Real-device test: iPhone Safari, mid-range Android Chrome, a 5-year-old laptop on integrated graphics. Record frame times (see `docs/09`).
- Analytics: privacy-friendly only (Cloudflare Web Analytics, no cookie banner needed).
- Contact email actually exists (Cloudflare Email Routing → personal inbox) and has been test-sent.

## Backlog (not scheduled)
Orb merging into the metaball field · screen-space refraction · case-study page templates with scroll-linked reveals · a tiny CMS-less content file (`content.json`) so copy edits do not touch HTML.
