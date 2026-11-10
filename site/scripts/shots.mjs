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
const chrome = process.env.CHROME || ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].find((p) => existsSync(p));
if (!chrome) { console.error('Set CHROME=/path/to/chrome'); process.exit(2); }

const out = resolve('shots'); mkdirSync(out, { recursive: true });
const server = await preview({ preview: { port: 4173, strictPort: false, host: '127.0.0.1' } });
const base = server.resolvedUrls.local[0];

const browser = await puppeteer.launch({
  executablePath: chrome, headless: 'new',
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

const names = ['intro', 'about', 'work', 'thread', 'drip', 'contact'];
const stats = [];
for (let i = 0; i < names.length; i++) {
  // jump to the section centre, let the DOM settle, then advance the sim 4s so springs settle
  await page.evaluate((i) => {
    const m = window.__molten;
    const s = document.querySelectorAll('.sec:not(.sec--clone)')[i];
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

// reel wrap: jump past the loop height and confirm we land back near the top with continuous progress
const wrap = await page.evaluate(async () => {
  const m = window.__molten; const lh = m.reel.loopHeight;
  window.scrollTo(0, lh - 10); await new Promise((r) => setTimeout(r, 50));
  const before = m.reel.progress();
  window.scrollTo(0, lh + 20); m.reel.tick(); await new Promise((r) => setTimeout(r, 50));
  return { before, after: m.reel.progress(), y: scrollY, lh };
});
if (!(wrap.y < 100)) fail('reel did not wrap: ' + JSON.stringify(wrap));

// secondary pages load without errors
for (const p of ['quick-view.html', 'case-study.html', 'resume.html']) {
  const r = await page.goto(base + p, { waitUntil: 'load' });
  if (!r.ok()) fail(p + ' returned ' + r.status());
}

console.table(stats);
console.log('wrap:', JSON.stringify(wrap), ' luma range:', variance.toFixed(0));
if (errors.length) { fail('console errors:\n  ' + errors.join('\n  ')); }

await browser.close();
await server.close();
console.log(failed ? 'RESULT: FAIL' : 'RESULT: PASS  (screenshots in ./shots)');
process.exit(failed ? 1 : 0);
