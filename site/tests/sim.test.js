import test from 'node:test';
import assert from 'node:assert/strict';
import { LiquidSim, OrbSim, ANCHORED, FREE0, FREE_N, POINTER, MAX_BLOBS, mulberry32 } from '../src/engine/sim.js';
import { Layout, evalLayout, blendInto, SECTIONS } from '../src/engine/layouts.js';

function simWithAnchor(opts = {}) {
  const s = new LiquidSim({ seed: 3, aspect: 1.6, ...opts });
  s.anchorX[0] = 0.3; s.anchorY[0] = -0.1; s.anchorR[0] = 0.1; s.anchorK[0] = 1;
  return s;
}
const run = (s, sec, ptr = { present: false }) => { for (let t = 0; t < sec * 60; t++) s.step(1 / 60, ptr); };
const area = (s) => { let a = 0; for (let i = 0; i < MAX_BLOBS; i++) if (i !== POINTER) a += s.r[i] * s.r[i]; return a; };

test('anchored blob converges to its anchor and its radius', () => {
  const s = simWithAnchor();
  run(s, 6);
  assert.ok(Math.hypot(s.x[0] - 0.3, s.y[0] + 0.1) < 0.003);
  assert.ok(Math.abs(s.r[0] - 0.1) < 0.002);
});

test('anchor spring overshoots (it is under-damped, that is what reads as liquid)', () => {
  const s = simWithAnchor();
  s.x[0] = -0.4; s.y[0] = -0.1; s.r[0] = 0.1;
  let maxX = -9;
  for (let t = 0; t < 240; t++) { s.step(1 / 60, { present: false }); maxX = Math.max(maxX, s.x[0]); }
  assert.ok(maxX > 0.3 + 0.01, `expected overshoot, max x was ${maxX}`);
});

test('calm mode removes overshoot', () => {
  const s = simWithAnchor();
  s.setCalm(true);
  s.x[0] = -0.4; s.y[0] = -0.1; s.r[0] = 0.1;
  let maxX = -9;
  for (let t = 0; t < 360; t++) { s.step(1 / 60, { present: false }); maxX = Math.max(maxX, s.x[0]); }
  assert.ok(maxX < 0.3 + 0.01, `calm should not overshoot, max x was ${maxX}`);
});

test('deterministic for a given seed', () => {
  const a = simWithAnchor({ seed: 11 }), b = simWithAnchor({ seed: 11 });
  const ptr = { x: 0.2, y: 0, present: true, down: false };
  run(a, 2, ptr); run(b, 2, ptr);
  for (let i = 0; i < MAX_BLOBS; i++) assert.equal(a.x[i], b.x[i]);
});

test('drips grow, detach, fall and are absorbed into the pool', () => {
  const s = new LiquidSim({ seed: 5 });
  // pool at the top, lake at the bottom
  s.anchorX[0] = 0; s.anchorY[0] = 0.45; s.anchorR[0] = 0.12; s.anchorDrip[0] = 1.5;
  s.anchorX[1] = 0; s.anchorY[1] = -0.48; s.anchorR[1] = 0.2;
  run(s, 14);
  assert.ok(s.stats.drops >= 2, `drops=${s.stats.drops}`);
  assert.ok(s.stats.merges >= 1, `merges=${s.stats.merges}`);
});

test('absorbing a droplet conserves area', () => {
  const s = new LiquidSim({ seed: 1 });
  s.anchorX[0] = 0; s.anchorY[0] = 0; s.anchorR[0] = 0.1;
  run(s, 3);
  const before = s.r[0] * s.r[0];
  const rd = 0.04;
  s._spawn(0.01, 0.0, 0, 0, rd, false);
  const total = before + rd * rd;
  // hold the anchor radius at the merged size so relaxation does not shrink it back
  for (let t = 0; t < 30; t++) { s.anchorR[0] = Math.sqrt(total); s.step(1 / 60, { present: false }); }
  assert.ok(Math.abs(s.r[0] * s.r[0] - total) < 2e-4);
  for (let i = FREE0; i < FREE0 + FREE_N; i++) assert.ok(s.r[i] < 0.003);
});

test('fast pointer swipe across a big blob shears off a droplet', () => {
  const s = new LiquidSim({ seed: 2 });
  s.anchorX[0] = 0; s.anchorY[0] = 0; s.anchorR[0] = 0.16;
  run(s, 3);
  let x = -0.4;
  for (let t = 0; t < 40; t++) { x += 0.04; s.step(1 / 60, { x, y: 0.12, present: true, down: false }); }
  assert.ok(s.stats.splits >= 1, `splits=${s.stats.splits}`);
});

test('pointer storm never produces NaN or runaway values', () => {
  const s = new LiquidSim({ seed: 9 });
  for (let i = 0; i < 12; i++) { s.anchorX[i] = Math.cos(i) * 0.4; s.anchorY[i] = Math.sin(i) * 0.3; s.anchorR[i] = 0.04 + (i % 3) * 0.03; s.anchorDrip[i] = i % 4 ? 0 : 1; }
  const rng = mulberry32(42);
  for (let t = 0; t < 60 * 20; t++) {
    const ptr = { x: (rng() - 0.5) * 2, y: (rng() - 0.5), present: rng() > 0.1, down: rng() > 0.7 };
    s.step(1 / 60 + rng() * 0.05, ptr);
    for (let i = 0; i < MAX_BLOBS; i++) {
      assert.ok(Number.isFinite(s.x[i] + s.y[i] + s.r[i] + s.vx[i] + s.vy[i] + s.wob[i] + s.stretch[i]), `non-finite at ${t}/${i}`);
      assert.ok(Math.abs(s.x[i]) < 20 && Math.abs(s.y[i]) < 20);
      assert.ok(s.r[i] < 0.5);
    }
  }
});

test('large dt is clamped (tab switching must not explode the sim)', () => {
  const s = simWithAnchor();
  s.step(5, { present: false });
  assert.ok(Number.isFinite(s.x[0]));
});

test('pack() writes zero radius for dead blobs and finite numbers otherwise', () => {
  const s = simWithAnchor();
  run(s, 1);
  const A = new Float32Array(MAX_BLOBS * 4), B = new Float32Array(MAX_BLOBS * 4);
  s.pack(A, B);
  assert.ok(A[2] > 0);
  assert.equal(A[(ANCHORED - 1) * 4 + 2], 0);
  assert.ok([...A, ...B].every(Number.isFinite));
});

test('orb springs to target and wobbles when it moves', () => {
  const o = new OrbSim();
  o.setTarget({ x: 0.3, y: 0.1, R: 0.2, yaw: 1, clay: 1 });
  let maxM = 0;
  for (let t = 0; t < 360; t++) { o.step(1 / 60, null, false, false); maxM = Math.max(maxM, Math.abs(o.m[0]) + Math.abs(o.m[1])); }
  assert.ok(Math.abs(o.x - 0.3) < 0.004 && Math.abs(o.R - 0.2) < 0.004);
  assert.ok(maxM > 0.005, 'expected wobble while moving');
  assert.ok(Math.abs(o.m[0]) < 0.01, 'wobble must settle');
});

test('every layout fills only valid slots and blending is continuous', () => {
  const ctx = { aspect: 1.6, t: 1.3, mobile: false, rects: { cards: [0, 1, 2, 3].map((i) => ({ x: (i % 2 ? 0.3 : -0.3), y: 0.1 - i * 0.1, w: 0.4, h: 0.25 })), thread: [{ x: -0.3, y: 0, w: 0.001, h: 1 }] } };
  const s = new LiquidSim();
  const orb = new OrbSim();
  for (let i = 0; i < SECTIONS.length; i++) {
    const L = evalLayout(i, ctx);
    assert.ok(L instanceof Layout);
    assert.ok([...L.x, ...L.y, ...L.r].every(Number.isFinite), SECTIONS[i]);
    assert.ok(L.r.some((r) => r > 0), `${SECTIONS[i]} should place at least one blob`);
    assert.ok(L.r.every((r) => r < 0.3));
  }
  // continuity across a section boundary: t=0.999 of i equals t=0 of i+1
  for (let i = 0; i < SECTIONS.length; i++) {
    const j = (i + 1) % SECTIONS.length;
    blendInto(evalLayout(i, ctx), evalLayout(j, ctx), 1, s, orb);
    const end = Float32Array.from(s.anchorR);
    blendInto(evalLayout(j, ctx), evalLayout((j + 1) % SECTIONS.length, ctx), 0, s, orb);
    for (let k = 0; k < ANCHORED; k++) assert.ok(Math.abs(end[k] - s.anchorR[k]) < 1e-6, `radius jump at ${SECTIONS[i]}->${SECTIONS[j]} slot ${k}`);
  }
});

test('mobile aspect still yields valid layouts', () => {
  const ctx = { aspect: 0.5, t: 0, mobile: true, rects: {} };
  for (let i = 0; i < SECTIONS.length; i++) {
    const L = evalLayout(i, ctx);
    assert.ok([...L.x, ...L.y, ...L.r].every(Number.isFinite), SECTIONS[i]);
  }
});
