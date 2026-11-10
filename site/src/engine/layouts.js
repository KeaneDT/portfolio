/**
 * Layouts: where the metal wants to be in each section.
 *
 * A layout is a pure function (ctx, L) that fills L with anchors for the 24 anchored blob slots
 * plus a target for the orb. The sim springs chase the anchors, so layouts only describe intent;
 * all the inertia, overshoot and merging comes from the sim.
 *
 * ctx = { aspect, t, mobile, rects }
 *   aspect  width / height of the viewport
 *   t       seconds
 *   rects   world-space rects of DOM elements bound with engine.bind(key, elements):
 *           rects.cards[i] = { x, y, w, h }  (centre + size, height-1 units, y up)
 *
 * World: viewport height = 1, x in [-aspect/2, aspect/2], y in [-0.5, 0.5].
 */

import { ANCHORED } from './sim.js';

export const SECTIONS = ['intro', 'about', 'work', 'thread', 'drip', 'contact'];

export class Layout {
  constructor() {
    this.x = new Float32Array(ANCHORED); this.y = new Float32Array(ANCHORED);
    this.r = new Float32Array(ANCHORED); this.k = new Float32Array(ANCHORED).fill(1);
    this.drip = new Float32Array(ANCHORED);
    this.orb = { x: 0, y: 0, R: 0.2, yaw: 0, clay: 0 };
  }

  clear() {
    this.r.fill(0); this.drip.fill(0); this.k.fill(1);
  }

  put(i, x, y, r, k = 1, drip = 0) {
    if (i < 0 || i >= ANCHORED) return;
    this.x[i] = x; this.y[i] = y; this.r[i] = r; this.k[i] = k; this.drip[i] = drip;
  }
}

const TAU = Math.PI * 2;
const unit = (ctx) => (ctx.mobile ? 0.78 : 1);

/** Hero: orb centre stage with small beads in loose orbit. Big pools sit low in the corners. */
function intro(ctx, L) {
  const u = unit(ctx), a = ctx.aspect, t = ctx.t;
  L.orb.x = ctx.mobile ? 0 : 0.17 * a; L.orb.y = ctx.mobile ? 0.12 : 0.04; L.orb.R = 0.27 * u; L.orb.yaw = 0; L.orb.clay = 0;
  for (let i = 0; i < 10; i++) {
    const ph = (i / 10) * TAU, sp = 0.18 + (i % 3) * 0.06;
    const rad = (0.42 + (i % 4) * 0.07) * u;
    const ang = ph + t * sp * (i % 2 ? 1 : -1);
    L.put(i, Math.cos(ang) * rad * 1.5, Math.sin(ang) * rad * 0.75, (0.016 + (i % 3) * 0.011) * u, 0.9 + (i % 3) * 0.2);
  }
  L.put(10, -a * 0.5 + 0.1, -0.5 + 0.02, 0.17 * u, 0.6);
  L.put(11, a * 0.5 - 0.12, -0.5 + 0.02, 0.2 * u, 0.6);
  L.put(12, 0, -0.5 - 0.01, 0.14 * u, 0.5);
}

/** About: orb slides left and turns; a slow lava-lamp cluster rises on the right. */
function about(ctx, L) {
  const u = unit(ctx), a = ctx.aspect, t = ctx.t;
  const side = ctx.mobile ? 0 : -0.26 * a;
  L.orb.x = side; L.orb.y = ctx.mobile ? 0.28 : 0.0; L.orb.R = (ctx.mobile ? 0.15 : 0.23); L.orb.yaw = 0.95; L.orb.clay = 0.35;
  // the lava-lamp cluster pools under the orb so the copy on the other side stays readable
  const cx = ctx.mobile ? 0 : side, cy = ctx.mobile ? -0.36 : -0.3;
  for (let i = 0; i < 5; i++) {
    const ph = i * 2.3;
    L.put(i, cx + Math.sin(t * 0.21 + ph) * 0.2 * u, cy + Math.sin(t * 0.17 * (1 + i * 0.13) + ph * 1.3) * 0.1 * u,
      (0.05 + (i % 3) * 0.022) * u, 0.7);
  }
  for (let i = 7; i < 9; i++) L.put(i, cx + Math.cos(t * 0.3 + i) * 0.3 * u, cy + Math.sin(t * 0.26 + i * 2) * 0.14 * u, 0.018 * u, 1.1);
}

/** Work: metal oozes around the glass project cards (DOM-bound). Orb becomes a small mascot top-right. */
function work(ctx, L) {
  const u = unit(ctx), a = ctx.aspect, t = ctx.t;
  L.orb.x = a * 0.5 - 0.1 * u; L.orb.y = ctx.mobile ? 0.3 : 0.27; L.orb.R = ctx.mobile ? 0.045 : 0.06; L.orb.yaw = -0.7; L.orb.clay = 0;
  const cards = (ctx.rects && ctx.rects.cards) || [];
  let n = 0;
  for (let c = 0; c < Math.min(cards.length, 4); c++) {
    const k = cards[c];
    const sgn = c % 2 ? -1 : 1;
    // two beads hugging opposite corners + one bead that creeps along the bottom edge
    L.put(n++, k.x - sgn * (k.w / 2 + 0.005), k.y + k.h / 2 - 0.02, 0.055 * u, 1.0);
    L.put(n++, k.x + sgn * (k.w / 2 + 0.005), k.y - k.h / 2 + 0.02, 0.075 * u, 0.8);
    L.put(n++, k.x + Math.sin(t * 0.5 + c * 2) * k.w * 0.34, k.y - k.h / 2 - 0.004, 0.034 * u, 1.2);
  }
  if (!cards.length) {
    for (let i = 0; i < 6; i++) L.put(i, Math.sin(t * 0.3 + i) * 0.5 * a, -0.2 + Math.cos(t * 0.2 + i) * 0.3, 0.05 * u);
  }
}

/** Thread: a beaded strand that follows the timeline line, necking between beads. */
function thread(ctx, L) {
  const u = unit(ctx), a = ctx.aspect, t = ctx.t;
  const cards = (ctx.rects && ctx.rects.thread) || [];
  const cx = (cards.length ? cards[0].x : ctx.mobile ? -a * 0.38 : -a * 0.18) - (ctx.mobile ? 0.035 : 0.045);
  L.orb.x = ctx.mobile ? a * 0.28 : a * 0.3; L.orb.y = 0.0; L.orb.R = ctx.mobile ? 0.1 : 0.2; L.orb.yaw = -0.9; L.orb.clay = 0.6;
  const N = 15;
  for (let i = 0; i < N; i++) {
    const y = 0.56 - (i / (N - 1)) * 1.12;
    L.put(i, cx + Math.sin(t * 0.8 + i * 0.9) * 0.025 * u, y, (0.032 + 0.009 * Math.sin(i * 1.7 + t)) * u, 1.3);
  }
}

/** Drip: a ceiling pool sheds droplets that fall into a lake at the bottom. */
function drip(ctx, L) {
  const u = unit(ctx), a = ctx.aspect, t = ctx.t;
  L.orb.x = 0; L.orb.y = -0.34; L.orb.R = ctx.mobile ? 0.1 : 0.16; L.orb.yaw = 0.0; L.orb.clay = 0;
  const top = 0.5, n = ctx.mobile ? 3 : 5;
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1) - 0.5) * a * 0.85 + Math.sin(t * 0.3 + i) * 0.02;
    L.put(i, x, top - 0.01, (0.09 + (i % 2) * 0.045) * u * (ctx.mobile ? 0.7 : 1), 0.8, 1.0 + (i % 3) * 0.25);
  }
  const m = ctx.mobile ? 4 : 7;
  for (let i = 0; i < m; i++) {
    const x = (i / (m - 1) - 0.5) * a * 1.05;
    L.put(8 + i, x, -0.5 + 0.015 + Math.sin(t * 0.9 + i * 1.3) * 0.012, (0.1 + (i % 2) * 0.05) * u, 0.7);
  }
}

/** Contact: one long liquid band across the screen with the orb riding it. */
function contact(ctx, L) {
  const u = unit(ctx), a = ctx.aspect, t = ctx.t;
  L.orb.x = ctx.mobile ? 0 : 0.3 * a; L.orb.y = ctx.mobile ? -0.1 : -0.02; L.orb.R = ctx.mobile ? 0.12 : 0.18; L.orb.yaw = 0; L.orb.clay = 0;
  const n = ctx.mobile ? 8 : 16;
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1) - 0.5) * (a + 0.1);
    L.put(i, x, -0.27 + Math.sin(x * 4.2 + t * 0.9) * 0.035, (0.05 + 0.014 * Math.sin(i * 2.1 + t * 0.7)) * u, 1.1);
  }
  L.put(n, -a * 0.5 + 0.04, -0.5, 0.12 * u, 0.7);
  L.put(n + 1, a * 0.5 - 0.04, -0.5, 0.12 * u, 0.7);
}

export const LAYOUT_FNS = { intro, about, work, thread, drip, contact };

const _tmp = SECTIONS.map(() => new Layout());

/** Evaluate layout i into a scratch Layout (reused every frame, no allocation). */
export function evalLayout(i, ctx) {
  const L = _tmp[i];
  L.clear();
  LAYOUT_FNS[SECTIONS[i]](ctx, L);
  return L;
}

const smooth = (t) => t * t * (3 - 2 * t);

/**
 * Blend two layouts and write the result into sim.anchor* arrays and the orb target.
 * Slots that are empty in one layout inherit the other's position so they grow in place
 * instead of flying across the screen.
 */
export function blendInto(A, B, t, sim, orb) {
  const s = smooth(Math.min(Math.max(t, 0), 1));
  for (let i = 0; i < ANCHORED; i++) {
    const ra = A.r[i], rb = B.r[i];
    let xa = A.x[i], ya = A.y[i], xb = B.x[i], yb = B.y[i];
    if (ra <= 0 && rb > 0) { xa = xb; ya = yb; }
    if (rb <= 0 && ra > 0) { xb = xa; yb = ya; }
    sim.anchorX[i] = xa + (xb - xa) * s;
    sim.anchorY[i] = ya + (yb - ya) * s;
    sim.anchorR[i] = ra + (rb - ra) * s;
    sim.anchorK[i] = A.k[i] + (B.k[i] - A.k[i]) * s;
    sim.anchorDrip[i] = A.drip[i] + (B.drip[i] - A.drip[i]) * s;
  }
  const o = orb;
  o.setTarget({
    x: A.orb.x + (B.orb.x - A.orb.x) * s,
    y: A.orb.y + (B.orb.y - A.orb.y) * s,
    R: A.orb.R + (B.orb.R - A.orb.R) * s,
    yaw: A.orb.yaw + (B.orb.yaw - A.orb.yaw) * s,
    clay: A.orb.clay + (B.orb.clay - A.orb.clay) * s,
  });
}
