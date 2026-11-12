/**
 * Headless visual check. Builds nothing: run `npm run build` first.
 *   npm run shots                 -> shots/*.png at 1440x900
 *   npm run shots -- --mobile     -> 390x844
 *   CHROME=/path/to/chrome npm run shots
 *
 * Fails (exit 1) on: shader compile/link error, any console error, NaN in the sim, or a page that
 * renders as one flat colour (which means the shader silently produced nothing).
 * Software GL is slow, so the sim is advanced deterministically through window.__molten.engine.advance().
 */
import { preview } from 'vite';
import puppeteer from 'puppeteer-core';
import { mkdirSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const mobile = process.argv.includes('--mobile');
const W = mobile ? 390 : 1440, H = mobile ? 844 : 900;
const chrome = process.env.CHROME || [
  process.env.ProgramFiles && `${process.env.ProgramFiles}/Google/Chrome/Application/chrome.exe`,
  process.env['ProgramFiles(x86)'] && `${process.env['ProgramFiles(x86)']}/Google/Chrome/Application/chrome.exe`,
  process.env.LOCALAPPDATA && `${process.env.LOCALAPPDATA}/Google/Chrome/Application/chrome.exe`,
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].filter(Boolean).find((p) => existsSync(p));
if (!chrome) { console.error('Set CHROME=/path/to/chrome'); process.exit(2); }

const out = resolve('shots'); mkdirSync(out, { recursive: true });
const server = await preview({ preview: { port: 4173, strictPort: false, host: '127.0.0.1' } });
const base = server.resolvedUrls.local[0];

const browser = await puppeteer.launch({
  executablePath: chrome, headless: 'new', pipe: true,
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  defaultViewport: { width: W, height: H, deviceScaleFactor: 1, isMobile: mobile, hasTouch: mobile },
});
const page = await browser.newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(String(e)));

let failed = false;
const fail = (msg) => { console.error('FAIL:', msg); failed = true; };

await page.goto(base + '?debug=1', { waitUntil: 'load' });
await page.waitForFunction(() => window.__molten && window.__molten.engine, { timeout: 15000 });
const status = await page.evaluate(() => ({ ok: window.__molten.engine.ok, error: window.__molten.engine.error }));
if (!status.ok) { fail('engine not ok: ' + status.error); }

// sculpture uniforms must use the bounds from the same synchronous frame after a scroll
if (status.ok) {
  const sculptureSync = await page.evaluate(() => {
    const m = window.__molten, engine = m.engine;
    const wasRunning = engine.running, wasCalm = engine.calm, initialY = window.scrollY;
    const path = document.getElementById('path');
    const slots = Array.from(path.querySelectorAll('[data-sculpture]'));
    const pathTop = path.getBoundingClientRect().top + window.scrollY;
    const pathBottom = path.getBoundingClientRect().bottom + window.scrollY;
    const maxY = document.documentElement.scrollHeight - innerHeight;
    const samples = [
      { name: 'path-start', y: pathTop + 1 },
      ...slots.map((el) => {
        const rect = el.getBoundingClientRect();
        return { name: `slot-${el.dataset.sculpture}-center`, y: rect.top + window.scrollY + rect.height / 2 - innerHeight / 2 };
      }),
      { name: 'after-path', y: pathBottom + innerHeight + 1 },
    ];
    const mismatches = [];
    let compared = 0, exitVisible = -1, maxError = 0;
    const check = (name) => {
      const width = engine.cssW, height = engine.cssH, actual = engine.renderer.sculptRects;
      let visibleCount = 0;
      for (const el of slots) {
        const rect = el.getBoundingClientRect(), model = Number(el.dataset.sculpture), i = model * 4;
        const visible = rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.top < height
          && rect.right > 0 && rect.left < width;
        if (visible) visibleCount++;
        const expected = [
          (rect.left + rect.width / 2 - width / 2) / height,
          (height / 2 - rect.top - rect.height / 2) / height,
          visible ? rect.width / (2 * height) : 0,
          visible ? rect.height / (2 * height) : 0,
        ];
        for (let k = 0; k < 4; k++) {
          const error = Math.abs(actual[i + k] - expected[k]);
          maxError = Math.max(maxError, error);
          compared++;
          if (error > 0.00002) mismatches.push({ sample: name, model, component: k, expected: expected[k], actual: actual[i + k], error });
        }
      }
      if (name === 'after-path') exitVisible = visibleCount;
    };

    engine.stop();
    try {
      for (const sample of samples) {
        window.scrollTo({ top: Math.min(maxY, Math.max(0, sample.y)), behavior: 'instant' });
        engine.advance(1 / 60);
        check(sample.name);
      }
      // Calm must keep the same synchronous bounds update path.
      engine.setCalm(true);
      m.sculptures.setCalm(true);
      const middle = slots[Math.floor(slots.length / 2)];
      const rect = middle.getBoundingClientRect();
      window.scrollTo({ top: Math.min(maxY, Math.max(0, rect.top + window.scrollY + rect.height / 2 - innerHeight / 2)), behavior: 'instant' });
      engine.advance(1 / 60);
      check('path-calm-mid');
    } finally {
      engine.setCalm(wasCalm);
      m.sculptures.setCalm(wasCalm);
      window.scrollTo({ top: initialY, behavior: 'instant' });
      engine.advance(1 / 60);
      if (wasRunning) engine.start();
    }
    return { compared, maxError, exitVisible, mismatches: mismatches.slice(0, 12) };
  });
  if (sculptureSync.mismatches.length || sculptureSync.exitVisible !== 0) {
    fail('sculpture bounds were stale after scrolling: ' + JSON.stringify(sculptureSync));
  }
  console.log('sculpture sync:', JSON.stringify(sculptureSync));
}

const names = ['intro', 'work', 'about', 'thread', 'drip', 'contact'];
const stats = [];
for (let i = 0; i < names.length; i++) {
  // jump to the section centre, let the DOM settle, then advance the sim 4s so springs settle
  await page.evaluate((i) => {
    const m = window.__molten;
    const s = document.querySelectorAll('.sec')[i];
    const r = s.getBoundingClientRect();
    window.scrollTo(0, Math.max(0, r.top + scrollY + r.height / 2 - innerHeight / 2));
  }, i);
  await new Promise((r) => setTimeout(r, 120));
  await page.evaluate(() => { const m = window.__molten; m.engine.setProgress(m.reel.progress()); m.engine.advance(4); });
  const info = await page.evaluate(() => {
    const m = window.__molten, e = m.engine, s = e.sim;
    let live = 0; for (let k = 0; k < 32; k++) if (s.r[k] > 0.003) live++;
    const bad = [...s.x, ...s.y, ...s.r].some((v) => !Number.isFinite(v));
    return { p: +m.reel.progress().toFixed(2), live, bad, scale: e.quality.scale, drops: s.stats.drops, merges: s.stats.merges };
  });
  stats.push({ name: names[i], ...info });
  if (info.bad) fail('NaN in sim at ' + names[i]);
  await page.screenshot({ path: `${out}/${mobile ? 'm-' : ''}${i}-${names[i]}.png` });
}

// flat-image check on the hero: the canvas must contain real variation
const variance = await page.evaluate(() => {
  const m = window.__molten; m.engine.setProgress(0); m.engine.advance(0.1);
  const c = document.getElementById('metal');
  const t = document.createElement('canvas'); t.width = 64; t.height = 64;
  const g = t.getContext('2d'); g.drawImage(c, 0, 0, 64, 64);
  const d = g.getImageData(0, 0, 64, 64).data; let mn = 255, mx = 0;
  for (let k = 0; k < d.length; k += 4) { const v = (d[k] + d[k + 1] + d[k + 2]) / 3; if (v < mn) mn = v; if (v > mx) mx = v; }
  return mx - mn;
});
if (variance < 40) fail('canvas looks flat (luma range ' + variance + ')');

// interaction smoke test: sweep the pointer across the hero and make sure nothing breaks
await page.evaluate(() => window.scrollTo(0, 0));
await page.mouse.move(W * 0.2, H * 0.5);
for (let k = 0; k < 24; k++) { await page.mouse.move(W * (0.2 + k * 0.03), H * 0.5 + Math.sin(k) * 80); await page.evaluate(() => window.__molten.engine.advance(0.02)); }
await page.mouse.down(); await page.evaluate(() => window.__molten.engine.advance(0.3)); await page.mouse.up();
await page.evaluate(() => window.__molten.engine.advance(0.6));
await page.screenshot({ path: `${out}/${mobile ? 'm-' : ''}6-pointer.png` });

// native section links update the hash and navigate to the corresponding section
await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
await page.focus('.hero-actions a[href="#work"]');
await page.keyboard.press('Enter');
try {
  await page.waitForFunction(() => location.hash === '#work'
    && document.querySelector('#work h2').getBoundingClientRect().top >= document.querySelector('.nav').getBoundingClientRect().bottom
    && document.querySelector('#work h2').getBoundingClientRect().bottom < innerHeight, { timeout: 5000 });
} catch { fail('Work link did not navigate to #work'); }

await page.evaluate(() => { location.hash = '#path'; });
try {
  await page.waitForFunction(() => {
    const title = document.querySelector('#path h2').getBoundingClientRect();
    return title.top >= document.querySelector('.nav').getBoundingClientRect().bottom && title.bottom < innerHeight;
  }, { timeout: 5000 });
} catch { fail('The Path heading is obscured after navigating to #path'); }

// finite reel: no visual twin, progress clamps to the final scene, and the page stays at its end
const end = await page.evaluate(async () => {
  window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' });
  await new Promise((r) => setTimeout(r, 100));
  const m = window.__molten;
  return {
    y: scrollY,
    maxY: document.documentElement.scrollHeight - innerHeight,
    progress: m.reel.progress(),
    clones: document.querySelectorAll('.sec--clone').length,
  };
});
if (end.clones !== 0 || Math.abs(end.y - end.maxY) > 2 || Math.abs(end.progress - 5) > 0.01) {
  fail('finite end did not clamp to the final scene: ' + JSON.stringify(end));
}

// the contact link returns to the real top anchor
await page.click('#contact a[href="#top"]');
try {
  await page.waitForFunction(() => location.hash === '#top' && scrollY < 24, { timeout: 5000 });
} catch { fail('Back to top link did not return to #top'); }

// Calm remains an interactive, persistent preference
const calm = await page.evaluate(() => {
  const button = document.getElementById('calm');
  const before = button.getAttribute('aria-pressed');
  button.click();
  const toggled = button.getAttribute('aria-pressed');
  button.click();
  return { before, toggled, restored: button.getAttribute('aria-pressed') };
});
if (calm.toggled === calm.before || calm.restored !== calm.before) fail('Calm toggle did not toggle and restore');

// Secondary pages load without errors; capture the projects and archive for visual QA.
const casePages = [
  'projects/toyota-automation.html',
  'projects/ratventure.html',
  'projects/project-optimus.html',
  'case-study.html',
];
for (const p of [...casePages, 'quick-view.html', 'resume.html']) {
  const r = await page.goto(base + p, { waitUntil: 'load' });
  if (!r.ok()) fail(p + ' returned ' + r.status());
  if (casePages.includes(p)) {
    await page.screenshot({ path: `${out}/${mobile ? 'm-' : ''}case-${p.split('/').at(-1).replace('.html', '')}.png`, fullPage: true });
  }
}

console.table(stats);
console.log('finite end:', JSON.stringify(end), ' Calm:', JSON.stringify(calm), ' luma range:', variance.toFixed(0));
if (errors.length) { fail('console errors:\n  ' + errors.join('\n  ')); }

await browser.close();
await server.close();
console.log(failed ? 'RESULT: FAIL' : 'RESULT: PASS  (screenshots in ./shots)');
process.exit(failed ? 1 : 0);
