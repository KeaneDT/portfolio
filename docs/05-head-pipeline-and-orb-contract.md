# 05 · The head: pipeline and the orb contract

The owner has **photos only**, no scan, and wants a **stylised chrome/clay** head (not photoreal). The site currently renders an **orb**. This file defines (a) exactly what the orb does so a head can replace it without touching the rest, and (b) how to produce the head.

## A. The orb contract (what any replacement must honour)
`OrbSim` (in `sim.js`) → `pack(o0, o1, o2)` → shader uniforms:

```
uO0 = (x, y, R, visible)           world position of centre, radius (viewport height = 1)
uO1 = (yaw, pitch, bulge, bulgeAng) yaw: scroll-driven turn (radians); bulge toward the pointer
uO2 = (m0, m1, m2, clay)           3 wobble-mode amplitudes; clay ∈ [0,1] chrome → matte clay
```
A head implementation must: take the same target `{x, y, R, yaw, clay}` from layouts, render in the same pass or a pass composited under the UI, accept `bulge` (lean toward cursor ≈ small head tilt) and the wobble amplitudes (squash/stretch when the head moves), and keep the chrome↔clay mix.

## B. Three ways to get the head (pick by effort/benefit)

| Option | Effort | Look | Notes |
|---|---|---|---|
| **1. Photo → mesh → stylise in Blender** | Medium (a weekend) | Best, exactly the owner | Use 3–6 photos in a free photogrammetry-from-face tool or FaceBuilder (Blender add-on), clean up, decimate, then convert to a chrome/clay material. Export a **GLB under ~400 KB** (≈15–25k tris, no textures needed for chrome). |
| 2. Commission / AI-assisted base mesh, then sculpt | Medium | Good | Start from a generic head, sculpt toward the owner's features from photos. Less accurate likeness, more stylised. |
| 3. Stay abstract: keep the orb | None | Distinctive, but not "my face" | A legitimate choice. The metal can carry the brand alone. Decide with eyes open. |

**Recommendation:** ship the site with the orb first, finish content, deploy, *then* do Option 1. Do not block launch on the head.

## C. Rendering a real mesh in this stack (no Three.js)
Keep the single-shader architecture where possible:
1. **Bake to a signed distance field** (64³–96³ R8 3D texture) from the mesh offline (a small Node/Python script, add to `scripts/`). The orb raymarcher then samples this SDF instead of `orbSDF()`; normals come from the SDF gradient. Pros: same pass, same environment lighting, trivially merges with the metaball field later, no mesh loader at runtime. Cons: fine detail (eyelids, lips) is limited by resolution. 96³ is usually enough for a stylised head.
2. **Or** render the GLB with a minimal raster pass into an offscreen texture (position+normal), then composite in the main shader. More faithful detail, more code (loader, depth, second program).

Start with (1). The yaw rotation is applied to the sample position, exactly like the ridged skin does now.

## D. What "turns left to right as you scroll" means in numbers
`yaw` target per section is set in `layouts.js` (`L.orb.yaw`). Current values: intro 0, about 0.95, work −0.7, path −0.9, notes 0, contact 0 radians. The orb's yaw spring (1.4 Hz, ζ 0.8) lags slightly so the turn *settles*. For a real head, keep |yaw| ≤ ~1.1 rad (≈63°) so the profile never shows an unflattering side/back of a stylised head; the "turn" sells the 3D without needing a full rotation.

## E. Chrome vs clay
`clay` is a pure shading mix: chrome = environment reflection; clay = soft key light + warm subsurface term. Intro is chrome, About goes clay (more human), Work back to chrome. A head will look much better in clay for the About section, which is why the mix exists.

## F. Privacy note
Photos of the owner never need to leave his machine. The pipeline is offline; only the baked SDF/GLB is shipped. Strip EXIF if any photo is ever committed.
