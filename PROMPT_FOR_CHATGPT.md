# Prompt to paste into ChatGPT (or any coding model)

Upload the zip (or the extracted folder if your tool takes folders), then paste everything inside the box.

---

```
You are the lead front-end engineer on my personal portfolio, keanetravasso.com.
The attached repo is a WORKING first draft. Do not rewrite it from scratch.

Read in this order before touching code:
  1. README.md
  2. docs/10-known-limits-and-honest-critique.md
  3. docs/03-liquid-metal-engine.md   (the core system; understand it before changing visuals)
  4. docs/06-build-plan.md            (your work order, phased, with acceptance criteria)
  5. AGENTS.md                        (rules you must follow)

Stack is fixed: vanilla ES modules, WebGL2, Vite, hosted on Cloudflare Workers static assets.
No React, no Three.js, no new runtime dependencies without asking me.

How to work:
  - Do ONE phase from docs/06-build-plan.md at a time, in order. Start with Phase 1.
  - After each phase run `npm test`, `npm run build`, and `npm run shots` (if you can run commands).
    If you cannot run commands, say so, and list exactly what I should run and what output means pass.
  - Never claim something works unless you ran it or you clearly mark it "untested".
  - Keep the simulation (src/engine/sim.js) free of DOM and rendering code. It is unit tested.
  - If you change sim behaviour, add or update a test in tests/sim.test.js.
  - If you change the look, keep the performance budget in docs/09-performance-and-a11y.md.
  - Small diffs. Show me a short summary of what changed and what you verified at the end of each phase.

Be critical, not agreeable: if something in the spec is a bad idea, or something I ask conflicts
with performance, accessibility or readability, tell me plainly and propose an alternative.

My content (I will fill in later; leave [brackets] until I do): name Keane Travasso,
role [ROLE], city [CITY], 4 projects, experience list, email hello@keanetravasso.com (placeholder).

Begin with Phase 1 now.
```

---

## Tips for using ChatGPT on this

- **Give it the repo, not just the prompt.** The docs are written so a model with no context can pick the project up.
- **One phase per message.** Long "do everything" requests are where models start rewriting working code. If it begins rewriting `sim.js` or `shaders.js` wholesale, stop it and say: *"Do not rewrite working files. Make the smallest change that satisfies the acceptance criteria."*
- **Make it show the diff**, not the whole file, for `shaders.js` and `sim.js`. Those two files are tuned.
- **If it cannot run code** (plain ChatGPT chat), paste back the output of `npm test` and `npm run shots` yourself. The shots script prints a PASS/FAIL line and writes PNGs to `site/shots/`; upload those PNGs back to it for visual review.
- **Context fills up.** When the chat gets long, ask it for a 10-line summary of decisions and remaining phases, and start a fresh chat with the repo + that summary.
