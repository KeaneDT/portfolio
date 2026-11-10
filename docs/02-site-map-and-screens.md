# 02 · Site map and screens

Six sections in one infinite reel, plus three secondary pages. The section order is also the **layout index** used by the engine (`SECTIONS` in `src/engine/layouts.js`).

```
0 intro ──▶ 1 about ──▶ 2 work ──▶ 3 path ──▶ 4 notes ──▶ 5 contact ──▶ (wraps to 0)
                          │            │
                          ▼            ▼
                  case-study.html   resume.html        quick-view (overlay, phase 5)
```

| # | Section | Purpose | What the metal does | Orb (head placeholder) |
|---|---|---|---|---|
| 0 | **Intro** | Name, role, one line. First 3 seconds. | 10 small beads orbit loosely (springs, so they swing); big pools in the bottom corners. On load everything starts scattered and **gathers** into place. | Right of centre, large, front-facing. Copy on the left. |
| 1 | **About** | Who you are in 3 sentences + 3 facts | Slow lava-lamp cluster pooling under the orb | Slides to the left, turns ~55°, goes clay |
| 2 | **Work** | 4 projects as frosted-glass cards | **DOM-bound**: beads hug each card's corners and creep along its bottom edge; the metal shows through the glass blur | Shrinks to a small mascot, top right |
| 3 | **Path** | Experience timeline + link to résumé | A beaded strand runs down the timeline line, necking between beads | Right side, turned the other way |
| 4 | **Notes** | 3 short beliefs / lessons (or writing) | A ceiling pool **sheds drips** that fall and are absorbed by a lake at the bottom, each impact makes a ripple | Half-sunk in the lake |
| 5 | **Contact** | Email + socials | One long liquid band across the screen; the orb rides it | Faces front, right of the heading |

Screenshots of the current state: `reference/screens/` (desktop `0-…6-`, mobile `m-0-…`).

## Secondary pages
- **case-study.html** — template: summary, problem, approach, outcome, "what I'd do differently". Content-first, no canvas needed.
- **resume.html** — plain HTML résumé + link to a PDF. Must be printable.
- **quick-view.html** — placeholder for the "zoom into the head to open a project" overlay (phase 5). Intended to be an overlay on the home page, not a navigation.

## Navigation
Header links jump to a section (smooth scroll to that section's centre). The **Calm** button toggles reduced motion and is remembered in `localStorage`. On mobile the header links are hidden (the reel *is* the navigation); add a menu only if testing shows people get lost.

## Why these six
- It is the standard hiring-manager path (who → proof → story → contact) with one expressive "notes" slot for personality.
- Each section maps to one *kind* of liquid behaviour, so the metal never repeats itself: orbit, pool, ooze-around-DOM, strand, drip, band.
- If the owner has fewer than 4 strong projects, **cut the work section to 3 cards**, don't pad. `layouts.js` handles any card count 1–4.

## Things deliberately not included
Testimonials carousel, skill-percentage bars, logo walls, a blog engine, a dark/light toggle (the whole look is dark), a custom cursor that replaces the real one (the cursor droplet is additive).
