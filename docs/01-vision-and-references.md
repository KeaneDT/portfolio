# 01 · Vision and references

## The one-line pitch
A premium, dark, **liquid-chrome** portfolio. Scrolling is an infinite reel. A chrome head sits in the hero and turns as you scroll, and the metal around it behaves like a real liquid: it pools, drips, necks, merges, ripples and reacts to the cursor.

## What the owner said they want
- Theme: **liquid metal / chrome**, premium, nice-fitting animation. Not Disney-style, not photoreal.
- Home screen: a **stylised 3D render of his face** (chrome / clay), turning left→right with scroll before moving on.
- **Infinite scroll** feeling.
- Interactivity in the spirit of the references below.
- Decision made: of the explored directions, **F (Metamorphosis)** merged into **D (liquid chrome metaballs)**. The head morphs between states as the page scrolls, the metal is the connective tissue between sections.

## References (what to take from each, and what not to)
| Reference | Take | Do not copy |
|---|---|---|
| eddy-naboulet.dev | The sense that the page *responds* to you everywhere; playful micro-interaction | Its visual style (different aesthetic) |
| vadimcarazan.com | Zooming into the face to open a project; interaction as navigation | Layout details |
| klad.design | A stylised 3D face as a hero object; confident minimal type | Its colour palette |
| Owner's chrome poster images | The look target: hard white strips on black, mercury-like blobs, high contrast | Any specific artwork (do not reproduce posters) |

## Principles (use these to settle arguments)
1. **The metal is a character, not wallpaper.** If it does not react, it is decoration. Every section should have at least one thing the metal does *because of* the user (scroll, cursor, press).
2. **Readability beats spectacle.** Copy never sits on bright chrome. Layouts push the metal to the margins or behind glass.
3. **Contrast is the chrome.** The look comes from deep blacks and hard-edged highlights. Mid-grey haze reads as "glass" and kills it. (The first render of this draft had exactly that bug; see the environment in `shaders.js`.)
4. **Restraint in colour.** Near-monochrome with a faint cool bias and one warm accent in the reflections. Colour comes from content (project imagery), not chrome.
5. **It must still be a good portfolio with the canvas off.** Hiring managers on a locked-down laptop or a slow phone must still get clear content fast.
6. **One expensive thing.** The full-screen fragment shader is the only heavy item. Everything else stays cheap.

## Who the site is for (decide this explicitly, it drives copy and structure)
Primary audience: *[owner to fill: e.g. recruiters / clients / collaborators]*. A portfolio that tries to speak to everyone reads as generic. The engine does not care; the copy does.
