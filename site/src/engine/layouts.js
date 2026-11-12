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

export const SECTIONS = ['intro', 'work', 'about', 'thread', 'drip', 'contact'];

export class Layout {
  constructor() {
    this.x = new Float32Array(ANCHORED); this.y = new Float32Array(ANCHORED);
    this.r = new Float32Array(ANCHORED); this.k = new Float32Array(ANCHORED).fill(1);
    this.drip = new Float32Array(ANCHORED); this.join = new Float32Array(ANCHORED);
    this.orb = { x: 0, y: 0, R: 0.2, yaw: 0, clay: 0 };
  }

  clear() {
    this.r.fill(0); this.drip.fill(0); this.join.fill(0); this.k.fill(1);
  }

  put(i, x, y, r, k = 1, drip = 0) {
    if (i < 0 || i >= ANCHORED) return;
    this.x[i] = x; this.y[i] = y; this.r[i] = r; this.k[i] = k; this.drip[i] = drip;
  }

  link(i, weight = 1) {
    if (i < 0 || i >= ANCHORED - 1) return;
    this.join[i] = Number.isFinite(weight) ? Math.min(1, Math.max(0, weight)) : 0;
  }
}

const TAU = Math.PI * 2;
const validRect = (r) => r && Number.isFinite(r.x) && Number.isFinite(r.y) && Number.isFinite(r.w) && Number.isFinite(r.h) && r.w > 0.04 && r.h > 0.04;

/** Ordered centerline nodes drive a smooth Gaussian liquid field, with broad tapered ends. */
function curveNode(L, i, q, x, y, scale = 1) {
  L.put(i, x, y, (0.075 + 0.025 * Math.sin(Math.PI * q)) * scale, 1);
  if (i < ANCHORED - 1) L.link(i);
}

function hideOrb(L, yaw = 0) {
  L.orb.x = 0; L.orb.y = 0; L.orb.R = 0; L.orb.yaw = yaw; L.orb.clay = 0;
}

const K_ROUTE_X = new Float32Array(6), K_ROUTE_Y = new Float32Array(6);
const K_PATH_X = new Float32Array(32), K_PATH_Y = new Float32Array(32), K_PATH_S = new Float32Array(32);
let kPathCount = 0, kJointA = 0, kJointB = 0;

function pushKPoint(x, y) {
  K_PATH_X[kPathCount] = x; K_PATH_Y[kPathCount] = y; kPathCount++;
}

/** Build and arc-length sample a rounded polyline without per-frame allocations. */
function aboutK(ctx, L) {
  const a = ctx.aspect, cx = ctx.mobile ? 0 : -0.30 * a;
  const left = cx - 0.10 * a, right = ctx.mobile ? 0.26 * a : 0.04 * a;
  const top = ctx.mobile ? -0.12 : 0.34, bottom = ctx.mobile ? -0.48 : -0.34, middle = ctx.mobile ? -0.30 : -0.02;
  K_ROUTE_X[0] = left; K_ROUTE_Y[0] = top;
  K_ROUTE_X[1] = left; K_ROUTE_Y[1] = bottom;
  K_ROUTE_X[2] = left; K_ROUTE_Y[2] = middle;
  K_ROUTE_X[3] = right; K_ROUTE_Y[3] = ctx.mobile ? top : 0.40;
  K_ROUTE_X[4] = left; K_ROUTE_Y[4] = middle;
  K_ROUTE_X[5] = right; K_ROUTE_Y[5] = ctx.mobile ? bottom : -0.40;

  kPathCount = 0; kJointA = kJointB = 0;
  pushKPoint(K_ROUTE_X[0], K_ROUTE_Y[0]);
  for (let v = 1; v < 5; v++) {
    const px = K_ROUTE_X[v - 1], py = K_ROUTE_Y[v - 1];
    const x = K_ROUTE_X[v], y = K_ROUTE_Y[v], nx = K_ROUTE_X[v + 1], ny = K_ROUTE_Y[v + 1];
    const inLength = Math.hypot(x - px, y - py), outLength = Math.hypot(nx - x, ny - y);
    const cut = Math.min(0.05, inLength * 0.18, outLength * 0.18);
    const bx = x + (px - x) * (cut / inLength), by = y + (py - y) * (cut / inLength);
    const ax = x + (nx - x) * (cut / outLength), ay = y + (ny - y) * (cut / outLength);
    pushKPoint(bx, by);
    for (let step = 1; step <= 6; step++) {
      const t = step / 6, u = 1 - t;
      pushKPoint(u * u * bx + 2 * u * t * x + t * t * ax, u * u * by + 2 * u * t * y + t * t * ay);
      if (step === 3 && v === 2) kJointA = kPathCount - 1;
      if (step === 3 && v === 4) kJointB = kPathCount - 1;
    }
  }
  pushKPoint(K_ROUTE_X[5], K_ROUTE_Y[5]);
  K_PATH_S[0] = 0;
  for (let i = 1; i < kPathCount; i++) {
    K_PATH_S[i] = K_PATH_S[i - 1] + Math.hypot(K_PATH_X[i] - K_PATH_X[i - 1], K_PATH_Y[i] - K_PATH_Y[i - 1]);
  }
  const total = K_PATH_S[kPathCount - 1] || 1;
  const jointA = K_PATH_S[kJointA] / total, jointB = K_PATH_S[kJointB] / total;
  for (let i = 0; i < ANCHORED; i++) {
    const q = i / (ANCHORED - 1), target = q * total;
    let seg = 0;
    while (seg < kPathCount - 2 && K_PATH_S[seg + 1] < target) seg++;
    const length = K_PATH_S[seg + 1] - K_PATH_S[seg];
    const t = length > 1e-6 ? (target - K_PATH_S[seg]) / length : 0;
    const x = K_PATH_X[seg] + (K_PATH_X[seg + 1] - K_PATH_X[seg]) * t;
    const y = K_PATH_Y[seg] + (K_PATH_Y[seg + 1] - K_PATH_Y[seg]) * t;
    const near = Math.min(Math.abs(q - jointA), Math.abs(q - jointB));
    let width = 1;
    if (x < left + 0.035 * a && y < middle) width = 0.77;
    if (x > left + 0.035 * a && y > middle) width = 0.77;
    width *= 1 - 0.1 * Math.exp(-((near / 0.045) ** 2));
    L.put(i, x, y, 0.10 * width, 1);
    if (i < ANCHORED - 1) L.link(i);
  }
}

/** Hero: a compact folded comma sits right of the headline. */
function intro(ctx, L) {
  const a = ctx.aspect;
  hideOrb(L);
  for (let i = 0; i < ANCHORED; i++) {
    const q = i / (ANCHORED - 1);
    const theta = q * TAU * 0.82 - 0.2, radius = 0.065 + 0.035 * q;
    const cx = ctx.mobile ? 0 : 0.28 * a, cy = ctx.mobile ? 0.25 - q * 0.18 : 0.08;
    const x = cx + radius * Math.cos(theta) + q * (ctx.mobile ? 0.025 : 0.04);
    const y = cy + radius * Math.sin(theta) - (ctx.mobile ? 0 : q * 0.045);
    curveNode(L, i, q, x, y);
  }
}

/** About: the rounded, open K monogram stays left of the copy. */
function about(ctx, L) {
  hideOrb(L, 0.95);
  aboutK(ctx, L);
}

/** Work: one broad horseshoe stays outside the project-card group. */
function work(ctx, L) {
  const a = ctx.aspect;
  hideOrb(L, -0.7);
  const cards = (ctx.rects && ctx.rects.cards) || [];
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (let c = 0; c < Math.min(cards.length, 4); c++) {
    const k = cards[c];
    if (!validRect(k)) continue;
    minX = Math.min(minX, k.x - k.w / 2); maxX = Math.max(maxX, k.x + k.w / 2);
    minY = Math.min(minY, k.y - k.h / 2); maxY = Math.max(maxY, k.y + k.h / 2);
  }
  const cx = ctx.mobile ? 0 : Number.isFinite(minX) ? (minX + maxX) * 0.5 : 0.16 * a;
  const rx = ctx.mobile ? 0.39 * a : Number.isFinite(minX)
    ? Math.min(Math.max((maxX - minX) * 0.5 + 0.08, 0.28 * a), 0.45 * a) : 0.34 * a;
  const top = ctx.mobile ? -0.07 : Number.isFinite(maxY) ? maxY + 0.055 : 0.3;
  const depth = ctx.mobile ? 0.42 : Number.isFinite(minY) ? Math.max(maxY - minY + 0.12, 0.42) : 0.5;
  for (let i = 0; i < ANCHORED; i++) {
    const q = i / (ANCHORED - 1);
    const x = cx + (2 * q - 1) * rx;
    const y = top - depth * Math.sin(Math.PI * q) ** 2;
    curveNode(L, i, q, x, y, 1.03);
  }
}

/** Thread: an open folded arch curls on the right side of the timeline. */
function thread(ctx, L) {
  const a = ctx.aspect;
  hideOrb(L, -0.9);
  for (let i = 0; i < ANCHORED; i++) {
    const q = i / (ANCHORED - 1);
    const fraction = 0.84, cx = ctx.mobile ? 0 : 0.30 * a, cy = ctx.mobile ? -0.30 : 0;
    const rx = ctx.mobile ? 0.22 * a : 0.20 * a, ry = ctx.mobile ? 0.16 : 0.32;
    let x, y;
    if (q <= fraction) {
      const angle = Math.PI / 4 + (q / fraction) * TAU * 0.75;
      x = cx + rx * Math.cos(angle); y = cy + ry * Math.sin(angle);
    } else {
      const t = (q - fraction) / (1 - fraction), u = 1 - t;
      const sx = cx + rx * Math.cos(Math.PI / 4 + TAU * 0.75);
      const sy = cy + ry * Math.sin(Math.PI / 4 + TAU * 0.75);
      const cx2 = cx + rx * 1.3, cy2 = cy - ry * 0.6;
      const ex = cx + rx * 1.7, ey = cy - ry * 0.86;
      x = u * u * sx + 2 * u * t * cx2 + t * t * ex;
      y = u * u * sy + 2 * u * t * cy2 + t * t * ey;
    }
    curveNode(L, i, q, x, y, 1.08);
  }
}

/** Notes: an expanding ripple coil hangs from the upper edge, clear of the copy. */
function drip(ctx, L) {
  const a = ctx.aspect;
  hideOrb(L);
  for (let i = 0; i < ANCHORED; i++) {
    const q = i / (ANCHORED - 1);
    const angle = ctx.mobile ? -Math.PI / 2 + q * Math.PI * 1.15 : -Math.PI / 2 + q * TAU * 1.35;
    const radius = ctx.mobile ? 0.03 + 0.14 * q : 0.12 + 0.36 * q;
    const cx = ctx.mobile ? 0 : -0.27 * a, cy = ctx.mobile ? -0.30 : 0.05;
    const x = cx + radius * Math.cos(angle), y = cy + radius * Math.sin(angle);
    curveNode(L, i, q, x, y, 1.05);
  }
}

/** Contact: a broad, low wave runs below the text. */
function contact(ctx, L) {
  const a = ctx.aspect, t = ctx.t;
  hideOrb(L);
  for (let i = 0; i < ANCHORED; i++) {
    const q = i / (ANCHORED - 1);
    const phase = (q - 0.88) * TAU * 2.5, d = (q - 0.94) / 0.075;
    const roll = Math.exp(-d * d);
    const x = (q - 0.5) * (ctx.mobile ? 0.82 : 1) * a + 0.04 * a * roll * Math.sin(phase);
    const y = (ctx.mobile ? -0.30 : -0.27) + Math.sin(q * TAU * 0.75 + t * 0.035) * (ctx.mobile ? 0.045 : 0.075)
      + 0.08 * roll * Math.cos(phase);
    curveNode(L, i, q, x, y, 1.0);
  }
}

/** Normalize a 2D tube-area estimate, not actual 3D volume or overlap-union area. */
function normalizeWidth(L, ctx, budget = 1) {
  let linear = 0;
  for (let i = 0; i < ANCHORED - 1; i++) {
    const length = Math.hypot(L.x[i + 1] - L.x[i], L.y[i + 1] - L.y[i]);
    linear += (L.r[i] + L.r[i + 1]) * length;
  }
  const closed = Math.hypot(L.x[ANCHORED - 1] - L.x[0], L.y[ANCHORED - 1] - L.y[0]) < 0.001;
  const cap = closed ? 0 : Math.PI / 2 * (L.r[0] ** 2 + L.r[ANCHORED - 1] ** 2);
  const target = ctx.aspect * (ctx.mobile ? 0.28 : 0.32) * budget;
  const scale = 2 * target / (linear + Math.sqrt(linear * linear + 4 * cap * target));
  for (let i = 0; i < ANCHORED; i++) L.r[i] = Math.max(0.035, Math.min(0.30, L.r[i] * scale));
}

export const LAYOUT_FNS = { intro, about, work, thread, drip, contact };

const _tmp = SECTIONS.map(() => new Layout());

/** Evaluate layout i into a scratch Layout (reused every frame, no allocation). */
export function evalLayout(i, ctx) {
  const L = _tmp[i];
  L.clear();
  LAYOUT_FNS[SECTIONS[i]](ctx, L);
  normalizeWidth(L, ctx, SECTIONS[i] === 'intro' ? (ctx.mobile ? 1.05 : 1.25) : 1);
  return L;
}

const smooth = (t) => t * t * (3 - 2 * t);

/**
 * Blend two layouts and write the result into sim.anchor* arrays and the orb target.
 * Slots that are empty in one layout inherit the other's position so they grow in place
 * instead of flying across the screen.
 */
export function blendInto(A, B, t, sim, orb) {
  const progress = Math.min(Math.max(t, 0), 1);
  const s = smooth(progress);
  for (let i = 0; i < ANCHORED; i++) {
    const lead = 0.5 - i / (ANCHORED - 1);
    const pos = smooth(Math.min(Math.max(progress + Math.sin(Math.PI * progress) * lead * 0.32, 0), 1));
    const ra = A.r[i], rb = B.r[i];
    let xa = A.x[i], ya = A.y[i], xb = B.x[i], yb = B.y[i];
    if (ra <= 0 && rb > 0) { xa = xb; ya = yb; }
    if (rb <= 0 && ra > 0) { xb = xa; yb = ya; }
    sim.anchorX[i] = xa + (xb - xa) * pos;
    sim.anchorY[i] = ya + (yb - ya) * pos;
    sim.anchorR[i] = ra + (rb - ra) * s;
    sim.anchorK[i] = A.k[i] + (B.k[i] - A.k[i]) * s;
    sim.anchorDrip[i] = A.drip[i] + (B.drip[i] - A.drip[i]) * s;
    sim.anchorJoin[i] = A.join[i] + (B.join[i] - A.join[i]) * s;
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
