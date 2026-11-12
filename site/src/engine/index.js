import { LiquidSim, OrbSim } from './sim.js';
import { Renderer } from './renderer.js';
import { Quality } from './quality.js';
import { SurfaceWaves } from './surface.js';
import { SECTIONS, evalLayout, blendInto } from './layouts.js';

/**
 * Engine: owns the sim, the renderer and the loop.
 * The page tells it three things: scroll position (setProgress), pointer (setPointer) and which DOM
 * elements the layouts should hug (bind). Everything else is internal.
 */
export class Engine {
  constructor(canvas, opts = {}) {
    this.canvas = canvas;
    this.debug = !!opts.debug;
    this.renderer = new Renderer(canvas, { preserve: !!opts.preserve });
    this.ok = this.renderer.ok;
    this.error = this.renderer.error;
    this.sim = new LiquidSim({ seed: opts.seed ?? 7, aspect: 1.6, params: { singlePool: true, freq: 0.72 } });
    this.surface = new SurfaceWaves();
    this.orb = new OrbSim();
    this.quality = new Quality({ min: 0.5, max: opts.maxScale ?? 1, start: opts.startScale ?? 0.85 });
    this.progress = 0;      // continuous section index in [0, N - 1]
    this.calm = !!opts.calm;
    this.ptr = { x: 0, y: 0, present: false, down: false, px: 0, py: 0 };
    this.bound = {};        // key -> Element[]
    this.rects = {};
    this.time = 0;
    this.last = 0;
    this.running = false;
    this.cssW = 1; this.cssH = 1;
    this.scrollAngle = 0;
    this._raf = 0;
    this.sim.setCalm(this.calm);
    this._onVis = () => { if (document.hidden) this.stop(); else this.start(); };
    document.addEventListener('visibilitychange', this._onVis);
    this.resize();
  }

  get N() { return SECTIONS.length; }

  setCalm(b) { this.calm = !!b; this.sim.setCalm(this.calm); }
  setProgress(p) { this.progress = p; }

  /** Four optional sculpture slots, expressed in height-normalized viewport coordinates. */
  setSculptures(rects, poses) { this.renderer.setSculptures(rects, poses); }

  /** pixel coordinates relative to the viewport */
  setPointer(px, py, present, down) {
    const p = this.ptr;
    p.px = px; p.py = py; p.present = present; p.down = down;
  }

  bind(key, elements) { this.bound[key] = Array.from(elements); }

  resize() {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.cssW = w; this.cssH = h;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.renderer.resize(w, h, this.dpr, this.quality.scale);
    this.sim.setAspect(w / h);
    this.surface.setAspect(w / h);
  }

  _readRects() {
    const W = this.cssW, H = this.cssH;
    for (const key in this.bound) {
      const out = this.rects[key] || (this.rects[key] = []);
      out.length = 0;
      for (const el of this.bound[key]) {
        const r = el.getBoundingClientRect();
        if (r.bottom < -H * 0.5 || r.top > H * 1.5) { out.push({ x: 0, y: -2, w: 0, h: 0 }); continue; }
        out.push({
          x: (r.left + r.width / 2 - W / 2) / H,
          y: (H / 2 - (r.top + r.height / 2)) / H,
          w: r.width / H, h: r.height / H,
        });
      }
    }
  }

  start() {
    if (this.running || !this.ok) return;
    this.running = true;
    this.last = performance.now();
    const loop = (now) => {
      if (!this.running) return;
      this._raf = requestAnimationFrame(loop);
      this.frame(now);
    };
    this._raf = requestAnimationFrame(loop);
  }

  stop() { this.running = false; cancelAnimationFrame(this._raf); }

  /** One frame. Public so tests / screenshot scripts can drive it deterministically. */
  frame(now, dtOverride, skipRender = false) {
    const ms = now - this.last; this.last = now;
    const dt = dtOverride ?? Math.min(ms / 1000, 0.1);
    this.time += dt;
    if (dtOverride === undefined && this.quality.tick(ms)) {
      this.renderer.resize(this.cssW, this.cssH, this.dpr, this.quality.scale);
    }

    const W = this.cssW, H = this.cssH, aspect = W / H;
    this._readRects();
    // Calm keeps the authored paths still; pointer and spring motion are reduced by the sim.
    const ctx = { aspect, t: this.calm ? 0 : this.time, mobile: aspect < 0.9, rects: this.rects };

    const lastScene = this.N - 1;
    const p = Math.max(0, Math.min(this.progress, lastScene));
    const i = Math.floor(p), j = Math.min(i + 1, lastScene);
    const A = evalLayout(i, ctx);
    const B = i === j ? A : evalLayout(j, ctx);
    blendInto(A, B, p - i, this.sim, this.orb);

    const world = {
      x: (this.ptr.px - W / 2) / H,
      y: (H / 2 - this.ptr.py) / H,
      present: this.ptr.present,
      down: this.ptr.down,
    };
    this.sim.step(dt, world);
    this.surface.step(dt, { calm: this.calm, ripples: this.sim.ripples });
    this.orb.step(dt, world, this.ptr.down, this.calm);
    this.scrollAngle += (p * 0.9 - this.scrollAngle) * Math.min(1, dt * 6); // lagged so reflections glide

    if (!skipRender) {
      this.renderer.render({
        time: this.time, scroll: this.scrollAngle, calm: this.calm,
        ptr: world, sim: this.sim, orb: this.orb, surface: this.surface,
      });
    }
  }

  /** Deterministically advance the simulation by `seconds` at 60 fps and render the last frame. Used by tests and screenshots. */
  advance(seconds) {
    const n = Math.max(1, Math.ceil(seconds * 60));
    for (let k = 0; k < n; k++) this.frame(this.last, 1 / 60, k < n - 1);
  }

  dispose() {
    this.stop();
    document.removeEventListener('visibilitychange', this._onVis);
  }
}
