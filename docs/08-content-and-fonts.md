# 08 · Content and fonts

The engine is the easy part. **A portfolio is judged on its content**, and this is the weakest link until the owner fills it in. Everything below is a checklist, not decoration.

## Content checklist (in priority order)
1. **Positioning line** (hero). One sentence: *what you make, for whom*. Test: could a stranger repeat it after 5 seconds? If it contains "passionate", "creative" or "innovative", rewrite it.
2. **Four projects, max.** For each: a 1-line hook (problem → your role → outcome), a hero image or short loop, and a case-study page. Pick for **depth and outcomes**, not variety. Three excellent beats five average.
3. **Case study structure** (see `case-study.html`): summary · problem (with evidence) · approach (the 2–3 decisions that mattered + trade-offs) · outcome (numbers, or a concrete before/after) · what you'd do differently. The last section is the one people remember.
4. **About** in 3 sentences: what you care about, how you work, one human detail. A real photo is better than a stock "about" image; the head/orb stands in until then.
5. **Path**: 3–4 entries, each with one outcome line, not a duty list.
6. **Notes**: three short beliefs or lessons you actually hold. This is where personality lives; keep them specific and opinionated.
7. **Contact**: one email, two or three links. No form (forms need a backend and attract spam).
8. **Résumé**: a clean HTML page + a PDF. Printable.

## Writing rules
- Verbs and outcomes, not adjectives. "Cut onboarding from 9 steps to 4; activation +18%" beats "streamlined the user journey".
- Cut every sentence you can. The metal is the show; the copy is the proof.
- Never put paragraphs over bright metal (see `AGENTS.md`).
- Alt text: decorative canvas is `aria-hidden`; all real images need meaningful `alt`.

## Fonts
The theme wants: a **tight, confident grotesk** for display (large, negative tracking) + a quiet readable sans for body. Constraints: self-hosted, variable WOFF2, one family if possible, total < 100 KB.

Good free candidates (all OFL / free to self-host): **Inter Tight** (current default in `tokens.css`; if not installed it falls back to system sans), **Geist**, **Space Grotesk** (more character), **Instrument Sans**. Choose one display + one body at most.

How to add:
1. Download the variable WOFF2 (e.g. from the fontsource packages or Google Fonts' download) into `site/public/fonts/`.
2. In `base.css`:
```css
@font-face { font-family: "Inter Tight"; src: url("/fonts/InterTight-Variable.woff2") format("woff2"); font-weight: 100 900; font-display: swap; }
```
3. Preload the display file in `<head>` (`<link rel="preload" as="font" type="font/woff2" crossorigin href="/fonts/...">`).
4. Check CLS in Lighthouse; set `size-adjust` on a fallback `@font-face` if the swap shifts layout.

The display type uses a vertical **chrome gradient** (`--chrome` in `tokens.css`) via `background-clip: text`. Keep it for the hero and contact headline only; using it everywhere cheapens it.

## Imagery
Project visuals should be **dark-friendly** (shot on dark, or with generous padding) so they sit well on glass cards. Export WebP/AVIF, ≤ 200 KB each at 1600 px wide, with explicit `width`/`height`. Lazy-load everything below the fold.

## Placeholder inventory (everything still in `[brackets]`)
Title/description meta, role and city, hero lede, about headline/body/3 facts, 4 project cards (+ case study pages), 4 path entries, 3 notes, email (placeholder address), social links, OG image, favicon (a simple chrome orb SVG is in place).
