# Live metal: research and implementation plan

Owner direction, 11 November 2026: shiny chrome; distinct fluid forms for each section; coherent transitions; gentle viscous interaction. Detached decorative beads, a static hero image, faceted segment joins, and one large flat disc were rejected. Routine splashes and aggressive response are also unwanted.

## Primary sources

- [Evan Wallace: WebGL Water](https://madebyevan.com/webgl-water/) and [water.js](https://github.com/evanw/webgl-water/blob/master/water.js): the demo stores height and vertical velocity, updates neighboring heights with damping, and derives surface normals from height differences. The useful principle is a coherent height surface. Its GPU ping-pong passes and water refraction are not being copied into this portfolio.
- [Pavel Dobryakov: WebGL Fluid Simulation](https://github.com/PavelDoGreat/WebGL-Fluid-Simulation): its source advances velocity and dye with pressure projection, advection and vorticity. That fuller solver is useful for swirling fluid, but has many offscreen passes and does not itself produce reflective metal. It is unnecessary for the owner's restrained motion request.
- [Google Filament: physically based rendering](https://google.github.io/filament/Filament.md.html): metals primarily reflect their environment; Fresnel response, surface normals and roughness govern their appearance. A nearly uniform normal field under broad lighting explains the rejected grey disc. Brighter diffuse-looking fill cannot solve it.

These are method references. Evan's and Pavel's repositories use MIT licenses; no third-party code or assets are copied. Filament is documentation, not a new dependency.

## Chosen design

This is an engineering inference from the sources and the existing engine, not a claim that those demos implement this exact effect.

1. Keep the existing 24 anchored controls, spring simulation, DOM-bound layouts, infinite reel and single WebGL draw. Each section authors one continuous curve with broad, tapered radii, rather than scattered beads or a uniform oval. The planned forms are a folded comma (Intro), K monogram (About), smooth horseshoe around the cards (Work), broad folded arch (Path), expanding ripple coil (Notes), and rolled underline (Contact).
2. Use a smooth Gaussian field for coverage. Its analytic gradient has no closest-segment switch, so the surface does not acquire the rejected seams. Arc-length weighting limits inflation when neighboring samples bunch together.
3. Separate the surface normals from the control-point domes. A small pure-JS height/velocity grid supplies broad low-frequency folds and damped waves. Gaussian contact impulses disturb it gently; no ambient particle splashes are required. Calm clears dynamic waves and freezes the rest shape's phase while retaining its metallic appearance.
4. Pack the two height slopes into a small RGBA8 texture with 16 bits per component. Linear sampling needs no floating-point texture extension. There is one additional texture sample in the material, with no extra GPU render passes or runtime dependency.
5. Light it with a fixed dark studio environment, a broad reflection card and a narrower bright warm-white strip. Neither cursor position nor scroll rotates or brightens the lights. Use a metallic Fresnel approximation and smooth surface normals, rather than equatorial white outlines or a large grey fill. The cursor has a constant target radius; lag and area-preserving stretch convey motion.
6. Keep About and project text on dark reading surfaces. The canvas remains decorative and aria-hidden; content stays in the DOM.

## Material budget and transitions

The width normalizer targets an approximate centreline-tube area, not exact 3D volume or exact screen coverage. The baseline is 0.32 times viewport aspect (0.28 on mobile); the opening reservoir has a 1.25 multiplier. It estimates twice the radius-weighted curve length plus end caps and adjusts width as the path stretches, bounded by a safe radius limit. Self-overlap, clipping and that limit affect the actual visible area. Non-neighbor particle cohesion is disabled for these curve controls so it cannot collapse a planned shape into a lump; neighboring viscosity and rest tension carry motion along the surface. During a section transition, one end leads and the rest follows, with exact poses at section boundaries.

Selected text uses a silver-grey highlight with dark lettering, including the chrome display heading.

## Acceptance and evidence

- Run unit tests, production build, desktop shots and mobile shots.
- Check one continuous shape per section and at intermediate scroll positions; no visible control-node seams or centre singularity.
- Check the cursor causes a bounded, slow deformation and small settling waves, with no routine detached particles.
- Check Calm and reduced-motion retain the chrome material while substantially reducing movement. Check no-WebGL content and reel wrapping.
- Inspect motion captures as well as stills. Do not claim real-device frame rates from SwiftShader. Keep JS below the documented 40 KB gzip budget and record actual build output.

This is a controlled surface model for an interactive portfolio, not a full three-dimensional fluid solver. Owner visual approval remains required before Phase 3.
