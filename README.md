# Keane Travasso — portfolio

Live preview: [keanedt.github.io/portfolio](https://keanedt.github.io/portfolio/)

A personal portfolio for Keane Travasso, an SMU Information Systems undergraduate in Singapore. It brings together selected automation, software and data projects; experience and education; and an original interactive liquid-chrome visual system. The site is built with vanilla JavaScript modules, WebGL2 and Vite.

The GitHub Pages URL above is the current public site. The intended custom domain, `keanetravasso.com`, is not connected yet. Contact details in the site include an unconfirmed template email address; check it before relying on it.

## What the site includes

- Six scroll sections: Intro, About, Work, Path, Notes and Contact, with section navigation and a continuous reel that wraps downward.
- Four featured projects—Task and Invoice Automation, Myoko Days, PolyEarth and LCU Judging Platform—plus a More Projects popup for three additional projects.
- About, project and experience detail popups, with profile photos kept inside the relevant popups.
- Four interactive chrome role models for SMUAI, teaching, Army logistics and SMU education. Drag horizontally or focus a model and use the left and right arrow keys; Home resets its rotation. On touch screens, horizontal drags rotate the model while vertical scrolling remains available.
- A Calm control and support for the system reduced-motion preference.
- A no-WebGL fallback, including static illustrations for the role models. Site text and navigation remain real HTML and usable without the canvas.
- Secondary pages at `site/case-study.html`, `site/resume.html` and `site/quick-view.html` for direct links and fallback navigation.

## The liquid-chrome engine

The fixed-light chrome material is drawn in one WebGL2 fragment pass. A deterministic CPU simulation drives 24 ordered control points in a 32-slot field; section layouts shape them into continuous forms. A heightfield adds broad surface folds and damped interaction waves, while an analytic gradient supplies smooth normals. A fixed studio environment creates the reflections, so the lighting does not follow the pointer or scroll position. The pointer produces a restrained deformation rather than routine detached splashes.

The same shader also draws four procedural signed-distance role models in bounded page slots. They rotate slowly and support direct manipulation, keyboard control and Calm mode. They share the existing render pass and do not add a runtime library.

This is a controlled surface effect, not a full fluid solver. Automated rendering and interaction checks used Chromium with software WebGL (SwiftShader). Real-device GPU frame rates, a broad browser/device matrix and a complete accessibility audit have not been verified.

## Run locally

Use Node.js `^20.19.0` or `>=22.12.0` for the locked Vite version. Node.js 24 is used by the GitHub Pages workflow. npm is included with Node.js.

```bash
cd site
npm ci
npm run dev
```

Vite prints the local development URL (usually `http://localhost:5173`). The dependencies are build and development tools; the published site does not load an npm runtime framework or a third-party runtime library.

## Build and checks

Run these from `site/`:

```bash
npm test
npm run build
npm run preview
```

`npm test` runs 29 Node.js unit tests for the simulation, layouts and surface waves. `npm run build` writes the production site to `site/dist/`. `npm run preview` serves that build locally.

The screenshot check uses headless Chrome or Chromium and the built preview. It checks rendered sections, pointer interaction, reel wrapping, secondary page responses, and shader or console errors. It writes screenshots to `site/shots/` (these generated shots are not a committed current-design reference).

```bash
npm run shots
npm run shots -- --mobile
```

If Chrome is not found automatically, set `CHROME` to its executable path. PowerShell:

```powershell
$env:CHROME = 'C:\path\to\chrome.exe'
npm run shots
```

Bash:

```bash
CHROME=/path/to/chrome npm run shots
```

The mobile shot preset uses a 390 × 844 viewport. These checks use software GL and do not establish hardware performance.

## Publish to GitHub Pages

The workflow in `.github/workflows/pages.yml` builds `site/` with Node.js 24 and deploys to GitHub Pages. It runs when changes are pushed to `codex/portfolio` or `main`, or when manually started in GitHub Actions. Pages must be configured to use **GitHub Actions** as its build and deployment source. The workflow derives the correct project-site base path and site URL from Pages configuration.

The current preview is [`https://keanedt.github.io/portfolio/`](https://keanedt.github.io/portfolio/). Publishing on Pages does not configure DNS or connect the `keanetravasso.com` custom domain.

The repository also contains a Cloudflare Workers static-assets configuration (`site/wrangler.jsonc`) and an optional `npm run deploy` script. That is an alternative deployment path, not the active publishing workflow; it requires Cloudflare account setup and authorization. See [`docs/07-deploy-cloudflare.md`](docs/07-deploy-cloudflare.md) and [`docs/11-github-pages-preview.md`](docs/11-github-pages-preview.md) for deployment details and route differences.

## Editing content and assets

- Edit section copy, project cards and static page content in `site/index.html`, `site/case-study.html`, `site/resume.html` and `site/quick-view.html`.
- Popup content is stored in `site/index.html` templates and connected by `site/src/site/details.js`.
- Section layouts are in `site/src/engine/layouts.js`; simulation and surface waves are in `site/src/engine/sim.js` and `site/src/engine/surface.js`; GLSL is in `site/src/engine/shaders.js`.
- Page behavior is in `site/src/main.js` and `site/src/site/`; styling is in `site/src/styles/`.
- Static assets live in `site/public/`. Font sources and licenses are recorded in `site/public/fonts/SOURCES.md`; the Inter fonts are distributed under the SIL Open Font License 1.1. Profile-photo sources and authorized popup placement are documented in `docs/12-profile-content-sources.md`.
- Keep biography, dates, project contributions and contact information grounded in the documented sources. `docs/12-profile-content-sources.md` explains the profile source, what was and was not verified, and editorial limits.

## Repository map

```text
README.md                     Project overview and current run/deploy guide
AGENTS.md                     Engineering conventions and verification requirements
.github/workflows/pages.yml   GitHub Pages build and deploy workflow
docs/                         Product, engineering, content and deployment notes
reference/                    Original design references; not a current screenshot set
site/
  index.html                  Main portfolio and popup content templates
  case-study.html             Project details page and popup fallback
  resume.html                 Résumé page and profile detail fallback
  quick-view.html             Compact portfolio page
  src/engine/                 Simulation, layouts, WebGL renderer, shader and surface
  src/site/                   Reel, detail popup and interactive sculpture behavior
  src/styles/                 Tokens, base styles and section styles
  public/                     Fonts, profile photos and static metadata/assets
  tests/                      Node.js unit tests
```

## Project notes

The docs include the original design proposal and implementation plan as well as current implementation notes. For current portfolio behavior, read [`docs/11-live-metal-research.md`](docs/11-live-metal-research.md), [`docs/12-profile-content-sources.md`](docs/12-profile-content-sources.md) and [`docs/13-personal-chrome-details.md`](docs/13-personal-chrome-details.md). Earlier docs may describe an earlier project phase and should not be treated as a complete description of the current site.

There is no project-wide open-source license declaration. Do not assume the profile text or photos are reusable. Third-party font license and asset provenance are recorded alongside the assets.
