import { Engine } from './engine/index.js';
import { createReel } from './site/reel.js';
import { initDetails } from './site/details.js';
import { initSculptures } from './site/sculptures.js';

const params = new URLSearchParams(location.search);
const canvas = document.getElementById('metal');
const root = document.documentElement;
const reelRoot = document.getElementById('reel');

const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
let calm = reduced;
try {
  calm ||= localStorage.getItem('calm') === '1';
} catch {}

const engine = new Engine(canvas, { calm, debug: params.has('debug'), preserve: params.has('debug') });
if (!engine.ok) {
  root.classList.add('no-gl');
  console.warn('[metal] disabled:', engine.error);
}

const reel = createReel(reelRoot);

// DOM elements the layouts hug
engine.bind('cards', document.querySelectorAll('#cards .card'));
engine.bind('thread', document.querySelectorAll('#tl-line'));
const sculptures = initSculptures({ engine, calm });

// calm toggle
const calmBtn = document.getElementById('calm');
const paintCalm = () => calmBtn.setAttribute('aria-pressed', String(engine.calm));
calmBtn.hidden = !engine.ok;
paintCalm();
calmBtn.addEventListener('click', () => {
  engine.setCalm(!engine.calm);
  sculptures.setCalm(engine.calm);
  paintCalm();
  try { localStorage.setItem('calm', engine.calm ? '1' : '0'); } catch {}
});

// pointer: mouse is "present" while inside the window, touch only while a finger is down
let down = false;
const setPtr = (e, present) => engine.setPointer(e.clientX, e.clientY, present && !e.target.closest?.('[data-sculpture]'), down);
addEventListener('pointermove', (e) => setPtr(e, e.pointerType !== 'touch' || down), { passive: true });
addEventListener('pointerdown', (e) => { down = true; setPtr(e, true); }, { passive: true });
addEventListener('pointerup', (e) => { down = false; setPtr(e, e.pointerType !== 'touch'); }, { passive: true });
addEventListener('pointercancel', () => { down = false; engine.setPointer(0, 0, false, false); }, { passive: true });
document.addEventListener('pointerleave', () => engine.setPointer(0, 0, false, false));

// layout and resize
const onResize = () => { engine.resize(); reel.measure(); };
addEventListener('resize', onResize);
new ResizeObserver(() => reel.measure()).observe(document.getElementById('reel'));
if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => reel.measure());

// Sample the current scene position before rendering.
const baseFrame = engine.frame.bind(engine);
engine.frame = (now, dt, skip) => {
  engine.setProgress(reel.progress());
  // Read the slot positions in the frame that draws them.
  if (!skip) sculptures.updateForRender(now);
  baseFrame(now, dt, skip);
};

const details = initDetails({
  onOpen: () => { sculptures.setPaused(true); engine.stop(); },
  onClose: () => { sculptures.setPaused(false); if (!document.hidden) engine.start(); },
});
document.addEventListener('visibilitychange', () => {
  if (details.isOpen) engine.stop();
});

engine.start();

// debug hook for tests and screenshots only
if (params.has('debug')) window.__molten = { engine, reel, sculptures };
