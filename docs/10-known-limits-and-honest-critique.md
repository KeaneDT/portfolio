# 10 · Known limits and honest critique (read first)

Written to be useful, not flattering.

## What is solid
- The simulation is real physics-flavoured behaviour with tests, not keyframes. It is the part most likely to still feel good in a year.
- The shader is a single pass with an analytic gradient. That is the right architecture for this look and it scales down gracefully.
- The structure (sim / layouts / shader / page) lets you change any one without breaking the others.

## What is NOT done or NOT proven
1. **Not tested on a real GPU or a real phone.** Only software GL. Frame rate on actual devices is unknown. This is the biggest risk to the "premium" feel: a premium look at 20 fps reads as cheap.
2. **The head does not exist yet.** The orb is a stand-in. The strongest hook of the whole concept (your face, in chrome) is the part still unbuilt, and it is the hardest. Budget real time for it (`docs/05`).
3. **Content is placeholder.** The site is currently a beautiful frame around nothing. Visitors remember the work, not the shader.
4. **The infinite reel loops downward only** and has not been tested on iOS Safari.
5. **The orb is composited on top of the metal**, not merged into it. Up close you can see it is a separate object. Merging it into the field is the single biggest remaining realism win.
6. **Layouts are tuned at 1440×900 and 390×844 only.** Other aspect ratios (ultrawide, tablets, short laptops) are expected to need tuning (phase 2).
7. **Readability is by layout convention, not enforced.** Nothing prevents a future change from putting metal behind body text.

## Risks to the *idea*, not the code
- **Gimmick fatigue.** A portfolio with a showpiece hero can read as "this person is a creative technologist" regardless of the owner's actual discipline. If the owner's work is not in that space, the site may overpromise relative to the work. Decide whether the site is *the* portfolio piece or a wrapper for other work, then size the effects accordingly.
- **Infinite scroll vs. "where do I find the thing I want".** Recruiters skim. The header jumps help; keep the work section within one scroll of the hero.
- **Chrome is high-contrast and attention-grabbing.** Used on every screen it fatigues. The layouts already keep it to margins and bands during reading sections; keep that discipline.
- **Maintenance.** The owner said they will maintain it. The shader and sim are specialist code. Mitigation: they are small, commented, and covered by tests; content lives in plain HTML. Resist adding a framework "for maintainability" — it would add more to maintain than it removes.

## Where this draft is weakest visually (candid)
- The About cluster under the orb is busy (many thin reflections in tight necks).
- The orb's clay shading is plain; it reads "grey ball", not "clay". It is a placeholder, but if it ships it needs a better material (subsurface warmth, AO at the neck with the metal).
- The Path strand beads do not yet neck into a continuous liquid string at all sizes.
- No colour. By design, but a single accent used sparingly (e.g. in link hover and one reflection strip) would make the identity more ownable.

## Suggested honest next steps (in order)
1. Real-device performance check (30 minutes, decides everything else).
2. Fill the content and ship with the orb.
3. Then the head.
