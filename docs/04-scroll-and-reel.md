# 04 · Scroll, progress and the infinite reel

This records the original infinite-reel design. The current homepage ends at Contact with a native Back to top link. Scene progress still interpolates between section centers and now stops at the first and last scenes.

## Native scroll, always
The page uses real browser scrolling (not a virtual-scroll hijack). Reasons: accessibility, mobile momentum, find-in-page, anchor links, and it does not fight the user. Do **not** introduce Lenis / GSAP ScrollSmoother-style smoothing without a measured reason; if added, it must be disabled under reduced motion.

## Progress `p`
`reel.progress()` returns a continuous section index in `[0, N)`:
- Each section has a centre `c_i` (document coordinates). The viewport centre `y = scrollY + innerHeight/2`.
- `p = i + (y − c_i) / (c_{i+1} − c_i)` for the pair containing `y`.
- This works for sections of **different heights** (the work section is taller than the others) because it interpolates between *centres*, not fixed 100vh steps.
- Engine: `i = floor(p)`, `t = p − i`, blend layout `i` → `(i+1) % N` with smoothstep(`t`).

## The infinite reel
- The DOM has the 6 real sections plus **one visual twin of section 0** appended at the end (`.sec--clone`, `aria-hidden`, `inert`).
- `reel.tick()` (called every frame): if `scrollY ≥ loopHeight − 1`, `scrollTo(0, scrollY − loopHeight)`.
- Because the twin is pixel-identical to section 0 and layout progress is modular (`5 → 0` is just another blend), the jump is invisible.
- The engine **unwraps** progress for the environment rotation (`_wraps`), so reflections never snap back at the seam.
- The twin's content must match section 0 exactly (same heading size, same copy). If you edit the hero copy, edit the twin too. A phase-1 task is to generate the twin from the original in JS so they cannot drift.

### Known limits (be honest with the owner about these)
1. **Loops downward only.** At the very top you cannot scroll "up" into the end. Upward looping needs a second twin plus an initial scroll offset (start the page at `loopHeight`, keep a twin of the last section above the hero). It is doable (phase 4) but it complicates anchor links and the back button.
2. **iOS Safari momentum:** a programmatic `scrollTo` during momentum scrolling can cause a one-frame hitch. Test on a real iPhone. Mitigation if needed: perform the jump only when `scrollY` has been stable for a frame, or switch to a three-copy scheme.
3. **Anchor links** (`#work`) are handled by JS (`data-go`). Direct loads of `/#work` fall back to the browser's default hash scroll (top-aligned, **untested** against the reel). Phase 4 task: read `location.hash` on load and centre the section.
4. **DOM-bound layouts** (`work`, `thread`) bind only to elements in the *real* sections, never the twin. Keep it that way.
5. The reel suits a portfolio of this length. If sections grow long (e.g. 10 projects), an infinite loop becomes disorienting. Cap the content, or loop only the hero.

## Pointer and scroll interplay
- Mouse: pointer is "present" while inside the window.
- Touch: pointer is present **only while a finger is down**, otherwise it would be stuck at the last touch point and keep disturbing the metal.
- Scroll does not move the pointer's world position (it is viewport-relative), so scrolling past a stationary cursor drags metal across it. This is intentional and feels good; do not "fix" it.
