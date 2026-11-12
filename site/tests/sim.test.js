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
const tubeArea = (L) => {
  let a = 0;
  for (let i = 0; i < ANCHORED - 1; i++) a += (L.r[i] + L.r[i + 1]) * Math.hypot(L.x[i + 1] - L.x[i], L.y[i + 1] - L.y[i]);
  const closed = Math.hypot(L.x[ANCHORED - 1] - L.x[0], L.y[ANCHORED - 1] - L.y[0]) < 0.001;
  if (!closed) a += Math.PI / 2 * (L.r[0] ** 2 + L.r[ANCHORED - 1] ** 2);
  return a;
};
function simWithPool(params = {}) {
  const s = new LiquidSim({ seed: 13, aspect: 1.6, params: { singlePool: true, ...params } });
  for (let i = 0; i < ANCHORED; i++) {
    const a = i / ANCHORED * Math.PI * 2;
    s.x[i] = s.anchorX[i] = Math.cos(a) * 0.32;
    s.y[i] = s.anchorY[i] = Math.sin(a) * 0.25;
    s.r[i] = s.anchorR[i] = 0.02;
    s.anchorJoin[i] = i < ANCHORED - 1 ? 1 : 0;
    s.join[i] = i < ANCHORED - 1 ? 1 : 0;
  }
  return s;
}

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

test('pack contract carries edge weight and anchor rest distance, never a last/free edge', () => {
  const s = new LiquidSim();
  s.join[0] = 0.75; s.join[ANCHORED - 1] = 1;
  s.anchorX[0] = 0.1; s.anchorY[0] = 0.2;
  s.anchorX[1] = 0.4; s.anchorY[1] = 0.6;
  s.dirx[0] = 0.6; s.diry[0] = 0.8;
  const A = new Float32Array(MAX_BLOBS * 4), B = new Float32Array(MAX_BLOBS * 4);
  s.pack(A, B);
  assert.ok(Math.abs(B[0] - 0.6) < 1e-6 && Math.abs(B[1] - 0.8) < 1e-6);
  assert.equal(B[2], 0.75); assert.ok(Math.abs(B[3] - 0.5) < 1e-6);
  assert.equal(B[(ANCHORED - 1) * 4 + 2], 0);
  assert.equal(B[(ANCHORED - 1) * 4 + 3], 0);
  for (let i = FREE0; i < MAX_BLOBS; i++) {
    assert.equal(B[i * 4 + 2], 0); assert.equal(B[i * 4 + 3], 0);
  }
});

test('joined axial viscosity propagates motion while preserving momentum', () => {
  const s = new LiquidSim({ params: { freq: 0, cohesion: 0, cohRange: 0, repulsion: 0 } });
  for (let i = 0; i < 3; i++) {
    s.anchorX[i] = s.x[i] = i * 0.1; s.anchorY[i] = s.y[i] = 0;
    s.anchorR[i] = s.r[i] = 0.08; s.anchorJoin[i] = i < 2 ? 1 : 0;
  }
  s.vx[0] = 1;
  const momentum0 = s.r[0] ** 2 * s.vx[0] + s.r[1] ** 2 * s.vx[1] + s.r[2] ** 2 * s.vx[2];
  run(s, 0.5);
  const momentum1 = s.r[0] ** 2 * s.vx[0] + s.r[1] ** 2 * s.vx[1] + s.r[2] ** 2 * s.vx[2];
  assert.ok(s.vx[1] > 0.05 && s.vx[2] > 0.01, `chain velocity ${s.vx[1]}, ${s.vx[2]}`);
  assert.ok(Math.abs(momentum1 - momentum0) < 1e-4, `momentum changed by ${momentum1 - momentum0}`);
});

test('joined viscosity transfers normal motion across a horizontal curve', () => {
  const s = new LiquidSim({ params: { freq: 0, cohesion: 0, cohRange: 0, repulsion: 0, chainTension: 0 } });
  for (let i = 0; i < 3; i++) {
    s.anchorX[i] = s.x[i] = i * 0.1; s.anchorY[i] = s.y[i] = 0;
    s.anchorR[i] = s.r[i] = 0.08; s.anchorJoin[i] = i < 2 ? 1 : 0;
  }
  s.vy[0] = 1;
  const momentum0 = s.r[0] ** 2 * s.vy[0] + s.r[1] ** 2 * s.vy[1] + s.r[2] ** 2 * s.vy[2];
  run(s, 0.5);
  const momentum1 = s.r[0] ** 2 * s.vy[0] + s.r[1] ** 2 * s.vy[1] + s.r[2] ** 2 * s.vy[2];
  assert.ok(s.vy[1] > 0.05 && s.vy[2] > 0.01, `normal velocity ${s.vy[1]}, ${s.vy[2]}`);
  assert.ok(Math.abs(momentum1 - momentum0) < 1e-4, `normal momentum changed by ${momentum1 - momentum0}`);
});

test('calm mode keeps layout joins but suppresses chain propagation', () => {
  const s = new LiquidSim({ params: { freq: 0, cohesion: 0, cohRange: 0, repulsion: 0 } });
  s.anchorR[0] = s.anchorR[1] = s.r[0] = s.r[1] = 0.08;
  s.anchorX[1] = s.x[1] = 0.1; s.anchorJoin[0] = 1; s.vx[0] = 1;
  s.setCalm(true); run(s, 0.5);
  assert.ok(s.join[0] > 0.8);
  assert.equal(s.vx[1], 0);
});

test('extreme joined motion stays finite and velocity remains capped', () => {
  const s = new LiquidSim({ params: { freq: 0, cohesion: 0, cohRange: 0, chainTension: 1e9, chainViscosity: 1e9, chainForceMax: 1e9 } });
  s.r[0] = s.r[1] = s.anchorR[0] = s.anchorR[1] = 0.1;
  s.x[0] = -1e30; s.x[1] = 1e30; s.vx[0] = 1e30; s.vx[1] = -1e30;
  s.join[0] = 1;
  s.step(1 / 120, { present: false });
  for (let i = 0; i < 2; i++) {
    assert.ok(Number.isFinite(s.x[i] + s.y[i] + s.vx[i] + s.vy[i] + s.r[i]));
    assert.ok(Math.abs(s.vx[i]) <= s.p.vmax + 1e-6);
  }
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

test('every section provides a finite continuous centerline with all join edges', () => {
  const ctx = { aspect: 1.6, t: 1.3, mobile: false, rects: { cards: [0, 1, 2, 3].map((i) => ({ x: (i % 2 ? 0.3 : -0.3), y: 0.1 - i * 0.1, w: 0.4, h: 0.25 })), thread: [{ x: -0.3, y: 0, w: 0.001, h: 1 }] } };
  const s = new LiquidSim();
  const orb = new OrbSim();
  const lengths = [];
  for (let i = 0; i < SECTIONS.length; i++) {
    const L = evalLayout(i, ctx);
    assert.ok(L instanceof Layout);
    assert.ok([...L.x, ...L.y, ...L.r].every(Number.isFinite), SECTIONS[i]);
    assert.ok(L.r.every((r) => r >= 0.034 && r <= 0.301), `${SECTIONS[i]} radii should stay bounded`);
    assert.ok(L.join.slice(0, ANCHORED - 1).every((w) => w === 1), `${SECTIONS[i]} has a broken centerline`);
    assert.equal(L.join[ANCHORED - 1], 0, 'the centerline remains open at its final slot');
    let length = 0, minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (let k = 0; k < ANCHORED - 1; k++) {
      const gap = Math.hypot(L.x[k + 1] - L.x[k], L.y[k + 1] - L.y[k]);
      assert.ok(gap > 0.01 && gap < 0.3, `${SECTIONS[i]} has a discontinuity at ${k}: ${gap}`);
      length += gap;
    }
    for (let k = 0; k < ANCHORED; k++) {
      minX = Math.min(minX, L.x[k]); maxX = Math.max(maxX, L.x[k]);
      minY = Math.min(minY, L.y[k]); maxY = Math.max(maxY, L.y[k]);
    }
    lengths.push(length);
    if (SECTIONS[i] === 'intro') assert.ok(length > 0.38 && length < 0.55, `folded comma length ${length}`);
    const target = ctx.aspect * (SECTIONS[i] === 'intro' ? 0.4 : 0.32), estimate = tubeArea(L);
    assert.ok(estimate > target * 0.65 && estimate < target * 1.35,
      `${SECTIONS[i]} estimated width area ${estimate} should approach ${target}`);
    assert.equal(L.orb.R, 0, `${SECTIONS[i]} must remain a single pool without a separate orb`);
    if (SECTIONS[i] === 'work') {
      assert.ok(L.x[ANCHORED - 1] - L.x[0] > 0.5, 'Projects should remain one open horseshoe without a self-crossing');
    }
    if (SECTIONS[i] === 'about') {
      const midX = (minX + maxX) * 0.5;
      let stemTop = false, stemBottom = false, topTip = false, bottomTip = false, joint = false;
      for (let k = 0; k < ANCHORED; k++) {
        stemTop ||= L.x[k] < minX + 0.1 && L.y[k] > 0.2;
        stemBottom ||= L.x[k] < minX + 0.1 && L.y[k] < -0.2;
        topTip ||= L.x[k] > midX && L.y[k] > 0.2;
        bottomTip ||= L.x[k] > midX && L.y[k] < -0.2;
        joint ||= L.x[k] < minX + 0.1 && Math.abs(L.y[k] + 0.02) < 0.12;
      }
      assert.ok(stemTop && stemBottom && topTip && bottomTip && joint, 'About K should have its stem, junction, and three tips');
      assert.ok(maxX >= 0.03 * ctx.aspect && maxX <= 0.05 * ctx.aspect,
        'desktop About K arms should end near the viewport middle');
      assert.ok(maxY >= 0.36 && minY <= -0.39, 'desktop About K arms should keep a compact vertical span');
      const minWidth = Math.min(...L.r), maxWidth = Math.max(...L.r);
      assert.ok(minWidth / maxWidth > 0.65 && minWidth / maxWidth < 0.8,
        'About K retraced strokes should be narrower with only a gentle junction taper');
    }
    if (SECTIONS[i] === 'thread') {
      assert.ok(maxX - minX > 0.4 && maxY - minY > 0.45, 'Thread should be a broad open arch beside the timeline');
      const opening = Math.hypot(L.x[ANCHORED - 1] - L.x[0], L.y[ANCHORED - 1] - L.y[0]);
      assert.ok(opening > 2 * Math.max(L.r[0], L.r[ANCHORED - 1]), 'Thread arch should stay open beyond its stroke width');
    }
    if (SECTIONS[i] === 'drip') {
      const cx = -0.27 * ctx.aspect, cy = 0.05;
      const r0 = Math.hypot(L.x[0] - cx, L.y[0] - cy), r1 = Math.hypot(L.x[ANCHORED - 1] - cx, L.y[ANCHORED - 1] - cy);
      assert.ok(r1 > r0 * 2.5, 'Notes should expand outward into a distinct ripple coil');
    }
  }
  assert.ok(new Set(lengths.map((v) => Math.round(v * 100))).size >= 4, 'sections should retain different curve forms');
  // continuity across a section boundary: t=0.999 of i equals t=0 of i+1
  for (let i = 0; i < SECTIONS.length; i++) {
    const j = (i + 1) % SECTIONS.length;
    blendInto(evalLayout(i, ctx), evalLayout(j, ctx), 1, s, orb);
    const end = Float32Array.from(s.anchorR);
    assert.ok(s.anchorJoin.slice(0, ANCHORED - 1).every((w) => w === 1));
    assert.equal(s.anchorJoin[ANCHORED - 1], 0);
    blendInto(evalLayout(j, ctx), evalLayout((j + 1) % SECTIONS.length, ctx), 0, s, orb);
    for (let k = 0; k < ANCHORED; k++) assert.ok(Math.abs(end[k] - s.anchorR[k]) < 1e-6, `radius jump at ${SECTIONS[i]}->${SECTIONS[j]} slot ${k}`);
  }
});

test('mobile aspect still yields valid layouts', () => {
  const ctx = { aspect: 0.5, t: 0, mobile: true, rects: {} };
  for (let i = 0; i < SECTIONS.length; i++) {
    const L = evalLayout(i, ctx);
    assert.ok([...L.x, ...L.y, ...L.r].every(Number.isFinite), SECTIONS[i]);
    const target = ctx.aspect * (SECTIONS[i] === 'intro' ? 0.294 : 0.28), estimate = tubeArea(L);
    assert.ok(estimate > target * 0.65 && estimate < target * 1.35,
      `${SECTIONS[i]} mobile width area ${estimate} should approach ${target}`);
    if (SECTIONS[i] === 'intro') {
      let bottom = Infinity;
      for (let k = 0; k < ANCHORED; k++) bottom = Math.min(bottom, L.y[k] - L.r[k]);
      assert.ok(bottom > -0.15, `mobile intro metal should stay above the eyebrow region (bottom=${bottom})`);
    }
    if (SECTIONS[i] === 'thread') {
      const opening = Math.hypot(L.x[ANCHORED - 1] - L.x[0], L.y[ANCHORED - 1] - L.y[0]);
      assert.ok(opening > 2 * Math.max(L.r[0], L.r[ANCHORED - 1]), 'mobile Thread arch should keep an open tail');
    }
    if (SECTIONS[i] === 'about') {
      let maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      for (let k = 0; k < ANCHORED; k++) {
        maxX = Math.max(maxX, L.x[k]);
        minY = Math.min(minY, L.y[k]);
        maxY = Math.max(maxY, L.y[k]);
      }
      assert.ok(maxX >= 0.25 * ctx.aspect && maxX <= 0.27 * ctx.aspect,
        'mobile About K arms should reach the right side of the copy area');
      assert.ok(maxY < 0 && minY > -0.52, 'mobile About K should remain below the copy region');
    }
  }
});

test('section blending leads the head and tail while preserving exact endpoints', () => {
  const a = new Layout(), b = new Layout(), s = new LiquidSim(), orb = new OrbSim();
  for (let i = 0; i < ANCHORED; i++) {
    a.put(i, 0, 0, 0.07); b.put(i, 1, 1, 0.13);
    if (i < ANCHORED - 1) { a.link(i); b.link(i); }
  }
  blendInto(a, b, 0.5, s, orb);
  assert.ok(s.anchorX[0] > s.anchorX[ANCHORED >> 1] && s.anchorX[ANCHORED >> 1] > s.anchorX[ANCHORED - 1]);
  assert.ok(s.anchorR.slice(0, ANCHORED).every((r) => Math.abs(r - 0.1) < 1e-6), 'radius blending should remain global');
  assert.ok(s.anchorJoin.slice(0, ANCHORED - 1).every((w) => w === 1));
  blendInto(a, b, 0, s, orb);
  assert.ok(s.anchorX.slice(0, ANCHORED).every((x) => x === 0));
  blendInto(a, b, 1, s, orb);
  assert.ok(s.anchorX.slice(0, ANCHORED).every((x) => x === 1));
});

test('single-pool cursor contact raises a boundary wave without ambient droplets', () => {
  const s = simWithPool({ freq: 0, cohesion: 0, cohRange: 0 });
  s.anchorDrip.fill(5);
  const p = { x: s.x[0], y: s.y[0], present: true, down: false };
  s.step(1 / 60, p); s.step(1 / 60, p);
  assert.ok(s.r[POINTER] > 0, 'single-pool mode keeps the cursor droplet');
  assert.ok(s.ripples.length > 0, 'rim contact should emit a ripple');
  assert.ok(s.vx.slice(0, ANCHORED).some((v) => Math.abs(v) > 0.02), 'rim contact should disturb boundary nodes');
  assert.equal(s.stats.drops, 0);
  assert.ok(s.r.slice(FREE0, FREE0 + FREE_N).every((r) => r === 0));
  run(s, 2);
  assert.equal(s.stats.drops, 0, 'single-pool mode must not emit ambient drips');
  assert.equal(s._spawn(0, 0, 0, 0, 0.02, false), -1, 'single-pool mode rejects free spawns');
});

test('single-pool rim contact includes the local body radius', () => {
  const makeRimCase = () => {
    const s = simWithPool({ freq: 0, cohesion: 0, cohRange: 0 });
    for (let i = 0; i < ANCHORED; i++) {
      const x = i < 2 ? -0.5 + i : 10 + i;
      const y = i < 2 ? 0 : 10;
      s.x[i] = s.anchorX[i] = x;
      s.y[i] = s.anchorY[i] = y;
      const radius = i === 0 ? 0.04 : i === 1 ? 0.08 : 0.02;
      s.r[i] = s.anchorR[i] = radius;
    }
    run(s, 1, { x: 50, y: 50, present: true, down: false });
    return s;
  };
  const near = makeRimCase();
  const localRadius = (near.r[0] + near.r[1]) * 0.5;
  const offset = near.r[POINTER] + localRadius + 0.005;
  near.step(1 / 60, { x: 0, y: offset, present: true, down: false });
  assert.ok(near.ripples.length > 0, 'cursor just outside the centerline should touch the visible rim');

  const outside = makeRimCase();
  const outsideRadius = (outside.r[0] + outside.r[1]) * 0.5;
  const outsideOffset = outside.r[POINTER] + outsideRadius + 0.025;
  outside.step(1 / 60, { x: 0, y: outsideOffset, present: true, down: false });
  assert.equal(outside.ripples.length, 0, 'cursor beyond the local body radius should not touch the rim');
});

test('single-pool reset starts from a smooth S-chain instead of scattered nodes', () => {
  const s = new LiquidSim({ seed: 2, aspect: 1.6, params: { singlePool: true } });
  for (let i = 0; i < ANCHORED - 1; i++) {
    const j = i + 1;
    const gap = Math.hypot(s.x[j] - s.x[i], s.y[j] - s.y[i]);
    assert.ok(gap > 0.01 && gap < 0.12, `initial S-chain gap ${i}=${gap}`);
  }
});

test('single-pool fast contact stays bounded; calm mode suppresses contact waves', () => {
  const fast = simWithPool({ freq: 0, cohesion: 0, cohRange: 0 });
  fast.step(1 / 60, { x: 0.7, y: 0, present: true, down: false });
  fast.step(1 / 60, { x: fast.x[0], y: fast.y[0], present: true, down: false });
  assert.ok(fast.ripples.length > 0);
  assert.ok(fast.ripples.every((r) => r.amp <= 0.061), 'rim impacts should create small ripples');
  assert.equal(fast.stats.drops, 0);
  assert.ok(fast.r.slice(FREE0, FREE0 + FREE_N).every((r) => r === 0));

  const slow = simWithPool({ freq: 0, cohesion: 0, cohRange: 0 });
  const p = { x: slow.x[0], y: slow.y[0], present: true, down: false };
  slow.step(1 / 60, p); slow.step(1 / 60, p);
  assert.ok(slow.ripples.length > 0);
  assert.equal(slow.stats.drops, 0);

  const calm = simWithPool({ freq: 0, cohesion: 0, cohRange: 0 });
  calm.setCalm(true);
  calm.step(1 / 60, { x: calm.x[0], y: calm.y[0], present: true, down: false });
  assert.equal(calm.ripples.length, 0);
  assert.equal(calm.stats.drops, 0);
});

test('single-pool cursor radius ignores speed and press while its spring lags and settles', () => {
  const s = new LiquidSim({ seed: 8, params: { singlePool: true } });
  const still = { x: 0, y: 0, present: true, down: false };
  run(s, 1, still);
  const slowRadius = s.r[POINTER];
  assert.ok(Math.abs(slowRadius - 0.028) < 1e-4);

  const moved = { x: 0.6, y: 0.2, present: true, down: true };
  s.step(1 / 60, moved);
  assert.ok(Math.hypot(s.x[POINTER] - moved.x, s.y[POINTER] - moved.y) > 0.2, 'cursor body should lag a sudden move');
  assert.ok(s.stretch[POINTER] > 0 && s.stretch[POINTER] <= 0.45);
  run(s, 1, moved);
  assert.ok(Math.hypot(s.x[POINTER] - moved.x, s.y[POINTER] - moved.y) < 0.015, 'cursor spring should settle');
  assert.ok(Math.abs(s.r[POINTER] - slowRadius) < 1e-5, 'speed and press must not grow cursor radius');
  assert.ok(Number.isFinite(s.x[POINTER] + s.y[POINTER] + s.r[POINTER] + s.stretch[POINTER]));
});

test('single-pool creative anchors retain their authored shape after settling', () => {
  const ctx = { aspect: 1.6, t: 0, mobile: false, rects: {} };
  const L = evalLayout(0, ctx), s = new LiquidSim({ seed: 6, aspect: ctx.aspect, params: { singlePool: true } });
  blendInto(L, L, 0, s, new OrbSim());
  run(s, 10);
  let error = 0, minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (let i = 0; i < ANCHORED; i++) {
    error = Math.max(error, Math.hypot(s.x[i] - s.anchorX[i], s.y[i] - s.anchorY[i]));
    minX = Math.min(minX, s.x[i]); maxX = Math.max(maxX, s.x[i]);
    minY = Math.min(minY, s.y[i]); maxY = Math.max(maxY, s.y[i]);
  }
  assert.ok(error < 0.03, `singlePool tracking error ${error}`);
  assert.ok(maxX - minX > 0.1 && maxY - minY > 0.15, 'curve should retain width and height instead of collapsing');
});
