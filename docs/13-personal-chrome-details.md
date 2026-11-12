# 13 · Personal details and chrome role sculptures

## Intent

Owner request: bring more personality to About and interests, add slowly rotating, playable chrome 3D objects matched to timeline rows, and add static metal detail across the site. Preserve live liquid-metal layouts, verified profile content, popup-only photography and the existing vanilla ES module / WebGL2 stack.

## Design

- SMUAI: a three-ring gyroscope with a central node, representing connected ideas and programmes.
- Teaching: an open book, representing shared learning.
- Army logistics: a transport wheel with hub and spokes, representing the transport role without using an unsupported insignia.
- SMU education: a graduation cap, with the degree still clearly marked as expected.
- Objects turn slowly left/right, support deliberate horizontal drag and keyboard arrows, and settle with damped inertia. No pointer-driven light source. Calm and reduced-motion stop the new movement.
- Role text stays on dark reading surfaces; model slots remain transparent to reveal actual WebGL objects.
- About uses warmer, source-grounded copy. Interests use authored film, puzzle and paddle motifs; no invented favourites, achievements or personal stories.
- Static polish: restrained silver details on section headers, project indices and a personal seal. Do not add a second ambient animation system.

## Engineering and bounds

Use the existing canvas and one fragment pass. Small procedural signed-distance models are evaluated only in bounded role slots. GLSL remains in engine/shaders.js, with no simulation changes, external mesh downloads or runtime dependencies. DOM interaction lives in site/sculptures.js; main.js connects Calm and dialog pause. Rectangles are cached and refreshed at most once per frame when layout changes. No per-frame DOM writes.

The existing <40 KB gzip JS and <150 KB first-paint transfer goals still apply. These are implementation targets, not a claim of measured hardware FPS. Continue existing no-WebGL and context-loss fallbacks; static authored SVG motifs remain available when live models cannot render. All model/SVG artwork is authored for this site; no third-party asset license needed.

## Acceptance

- All four objects visibly match their role, show depth and chrome reflections, rotate slowly, and respond to drag/keyboard without hijacking vertical touch scrolling.
- Calm freezes motion and interactions. Offscreen/hidden/dialog states do not run unnecessary model animation. Photo popups retain behavior.
- Main text remains readable and main-flow photography remains absent.
- npm test, npm run build, npm run shots and mobile shots pass. Inspect actual desktop/mobile renderings and a targeted manipulation/Calm/fallback check; report hardware and browser limits honestly.
- No commit, push, host change or publication without explicit new authorization.

## Verified outcome

Completed locally, checked on 11 November 2026; handover updated 12 November 2026. Four real raymarched chrome sculptures share the existing single WebGL fragment pass. Slow left/right rotation, drag inertia, arrow keys and Home reset are implemented. Main.js connects Calm, modal pause and pointer handling. Authored SVG fallbacks remain available without WebGL. Role slots are intentionally non-overlapping.

About and interests now use warmer profile-grounded copy, a KT chrome seal and original film/puzzle/kayak motifs. Static silver rules and project accents span the page. All photographs remain inside detail popups. A visual QA spacing defect in About was fixed; mobile facts now stack clearly. Navigation now aligns taller sections to their beginning so headings stay below the fixed header.

Verification: npm test 29/29; final production build; desktop and mobile npm run shots RESULT PASS; final JS 21.13 KB gzip. Chromium/SwiftShader runtime checks passed actual model rendering, idle rotation, keyboard and mouse drag, Calm freeze, modal/offscreen pause, no-WebGL fallback, no main-flow photographs, and no GL/console errors. A separate mobile touch check passed horizontal rotation and native vertical scrolling. Tall-section navigation placed the Path heading at 119.5px desktop and 116.17px mobile, below the 64px header. Visual QA inspected all four models and relevant desktop/mobile sections; targeted recheck passed both fixes.

Not verified: real-device GPU frame rates, full browser/device matrix, comprehensive accessibility audit, or actual WebGL context-loss recovery in a browser (controller path was checked in isolation). No new dependency, commit, push or deployment was made.
