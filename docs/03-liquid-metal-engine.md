# 03 · The liquid-metal engine (read this before changing anything visual)

## Why the first version felt fake, and what replaced it
The earlier prototypes moved blobs on analytic orbits (`x = cos(t·k)`), shaded them with a flat 2D fake normal, and drew the cursor trail as time-decaying circles. Result: blobs passed through each other, nothing had weight, and the metal looked flat.

The engine now has two halves with a strict boundary:

```
 DOM / scroll / pointer ──▶ layouts.js ──▶ sim.js (CPU physics) ──▶ pack() ──▶ shaders.js (GPU shading)
          intent (where)        (anchors)       (how it moves)        2 small arrays       (what it looks like)
```

## 1. The simulation (`src/engine/sim.js`)

World space: viewport height = 1, `x ∈ [-aspect/2, aspect/2]`, y **up**. Up to **32 blob slots**:

| Slots | Role |
|---|---|
| `0–23` (ANCHORED) | "Identity" blobs. Each is a **spring** chasing an anchor the layout supplies. Radius also relaxes toward the anchor's radius, so blobs grow and shrink in place. |
| `24–30` (FREE) | Free droplets: pinched off by drips or sheared off by the cursor. Gravity (drips only), air drag, repel when overlapped, merge when they touch. |
| `31` (POINTER) | The cursor droplet. Follows the pointer on its own spring, grows with speed and while pressed. |

Fixed internal step **1/120 s** with an accumulator (max 12 substeps, `dt` clamped to 0.1 s so a backgrounded tab cannot explode the sim). Deterministic: same seed + same inputs = same state.

### What gives it weight and liquidity
1. **Under-damped springs** (ζ ≈ 0.52). Everything overshoots and settles. This single choice is most of the "liquid" feel. Calm mode switches to ζ = 1 (critically damped, no overshoot).
2. **Mass-dependent response.** Spring frequency scales with `(0.12/r)^0.25`: big blobs are slow, small ones snappy.
3. **Cohesion (surface tension).** Between blobs closer than `cohRange·(ri+rj)`, a smooth attraction pulls them together so necks form; free droplets also **repel** when deeply overlapped so they don't collapse. Forces are split by mass (`r²`) so small blobs move more than big ones.
4. **Stretch along velocity**, area-preserving: in the shader the blob's length along `e` is scaled by `l = 1+s` and its width by `1/l`. Stretch low-passes toward `speed·gain` with τ = 90 ms.
5. **Wobble mode.** A damped radial oscillator per blob (3.4 Hz, ζ = 0.14). It is *kicked* by merges, drips detaching, press/release, and shear-offs, then rings down.
6. **Pointer physics.** Nearby metal is *entrained* along pointer velocity (Gaussian kernel, width = `pointerSigma + r`), pushed away slightly when the pointer moves fast, and **attracted while pressed**. Press emits a shock wave (outward impulse + ripple); release kicks a wobble.
7. **Shear.** If pointer speed > `splitSpeed` and it passes within 0.05 of a big blob (`r ≥ 0.07`), a droplet is sheared off with area conserved (`r² = r_big² − r_drop²`), with a cooldown.
8. **Drips.** Anchored blobs with `drip > 0` accumulate `dripGrow`; the anchor sags and the blob elongates (`forced` stretch ∝ g²), then at g ≥ 1 a droplet spawns, falls under gravity, and is **absorbed** into whatever it hits: the absorber's area grows by the droplet's area, its wobble is kicked proportional to impact speed, and a **ripple** is emitted at the impact point.
9. **Ripples.** Up to 8 ring waves `(x, y, age, amp)`; the shader perturbs the surface normal by `sin(ring·70)` under a Gaussian envelope. Amplitude decays `e^(−1.5 t)`.

### Tuning knobs (`DEFAULTS` in `sim.js`)
| Param | Default | Effect |
|---|---|---|
| `freq` | 1.15 Hz | How fast anchors are reached. Raise for snappier, lower for lazier. |
| `zeta` | 0.52 | **<0.4 jelly, 0.5–0.65 liquid, >0.8 feels like UI easing, not liquid.** |
| `cohesion`, `cohRange` | 2.4, 1.9 | Neck formation strength / range. |
| `repulsion`, `repRange` | 16, 0.55 | Stops free droplets collapsing into one. |
| `entrain`, `poke`, `attract` | 3.6, 1.4, 8 | How strongly the cursor drags / shoves / pulls. |
| `splitSpeed` | 1.7 | Pointer speed (world units/s) to shear a droplet. Lower = easier to split. |
| `wobbleFreq`, `wobbleZeta` | 3.4, 0.14 | Ring-down character after impacts. |
| `stretchGain`, `stretchMax` | 0.5, 0.6 | How much speed elongates blobs. Above ~0.8 blobs look like sausages. |
| `dripGrow` | 0.55 | Drip cycles per second at rate 1. |
| `vmax` | 4 | Hard speed cap (stability). |

`tests/sim.test.js` encodes the contract: converges, **overshoots when not calm**, does not overshoot when calm, deterministic, drips detach and merge, merge conserves area, fast swipe splits, a 20-second random pointer storm never yields NaN/runaway, huge `dt` is safe.

## 2. Layouts (`src/engine/layouts.js`)
Each section is a function `(ctx, L) → fills L` placing up to 24 anchors `{x, y, r, k, drip}` plus an orb target `{x, y, R, yaw, clay}`.
- `k` scales that anchor's spring frequency (heavier/lighter feel per blob).
- `ctx.rects` carries world-space rects of bound DOM elements (see `engine.bind`). `work` uses them to hug the cards; `thread` uses the timeline line.
- Layouts run **every frame**, so they can be animated (orbits, lava-lamp drift) and DOM-tracking.
- Between sections `blendInto(A, B, t, …)` lerps anchors with a smoothstep. A slot that is empty in one layout **inherits the other's position** so it grows in place rather than flying across the screen. A test asserts radii are continuous across every boundary, including the wrap 5→0.
- Layouts decide *intent only*. All inertia, overshoot and merging comes from the sim, which is why transitions never look like keyframes.

## 3. The shader (`src/engine/shaders.js`), one pass
1. **Field.** For each live blob: anisotropic distance `q² = (d·e)²/l² + (d·e⊥)²·l²` (stretch along velocity `e`, length `l = 1+stretch`), weight `w = (r²/q²)^KF` with `KF = 1.6`. `f = Σw`. The surface is `f = 1`. (`KF > 1` keeps blobs compact; with plain `1/d²` falloff, distant blobs bloat each other. That was a visible bug in the first render.)
2. **Analytic gradient** `∇f` accumulated in the same loop. This gives (a) an anti-aliased edge from the distance estimate `sd = (f−1)/|∇f|` without a second pass, and (b) normals with no finite differences (≈3× cheaper than sampling the field 3 more times).
3. **Dome normals.** Height `H = √(1 − f^(−1/KF))` is *exactly* a sphere's height profile for one blob and blends smoothly across necks. Normal = `normalize(−Reff·∇H, 1)` where `Reff` is the weight-averaged radius.
4. **Environment** (`env(dir)`): procedural studio. Near-black sky gradient, a razor horizon line, a big key softbox upper-left, a tall cool strip right, a soft warm rim behind, a faint floor band, an orbiting glint, and a cursor light. Everything is built from `rectMask` shapes in (azimuth, height) space so edges stay **crisp** when reflected. The environment rotates with scroll (`uScroll`), so reflections glide as the user scrolls.
5. **Orb.** Raymarched SDF inside a bounding circle: sphere + 3 low-order wobble modes + a pointer bulge + a ridged skin that rotates with `yaw` (so rotation is visible on a symmetric sphere). Chrome ↔ clay is a `mix`. AA from the minimum ray distance for the silhouette.
6. **Finish.** Extended-Reinhard tone map, gamma, ±1.5/255 grain (hides banding in the dark gradients).

### Look rules (learned the hard way)
- Authoring colours in *linear*. A "dark" `0.02` becomes mid-grey after gamma. The background is `0.0022`.
- Hard-edged bright shapes on near-black = chrome. Soft gradients = grey glass. If it ever looks like glass, the environment got too soft or too bright.
- Keep the warm rim wide and dim: when it was thin and bright it read as a beige sticker strip on the blobs.
- Fresnel haze is kept small (`0.12`); more makes the metal look foggy.

## 4. Interaction map
| Input | Effect |
|---|---|
| Scroll | Section blend, orb yaw, environment rotation |
| Pointer move | Cursor droplet, entrain/poke nearby metal, cursor light in reflections, orb leans toward it |
| Fast swipe over a big blob | Shears off a droplet |
| Press | Shock wave + ripple, attract metal, orb bulges |
| Release | Wobble snap-back |
| Calm toggle / reduced-motion | ζ→1, no wobble, no ripples, no drips, cohesion ×0.4. The sim **ignores the pointer entirely** (no cursor droplet, no entrain, no shear); only the cursor light in the reflections stays. |

## 5. Ideas not yet built (in order of payoff)
1. **Orb merges into the field** (add the orb as a big blob so necks form between it and nearby beads). Today it is composited on top.
2. **Screen-space refraction** of the page behind thin metal edges.
3. **Velocity-driven environment smear** (anisotropic highlights on fast blobs).
4. **Audio-free "tick" on merges** as haptics on mobile (`navigator.vibrate`, off by default).
