import test from 'node:test';
import assert from 'node:assert/strict';
import { SurfaceWaves } from '../src/engine/surface.js';

const energy = (surface) => {
  let sum = 0;
  for (let i = 0; i < surface.height.length; i++) sum += surface.height[i] ** 2 + surface.velocity[i] ** 2;
  return sum;
};

test('an impulse propagates to neighboring cells and then decays', () => {
  const s = new SurfaceWaves({ size: 33 });
  assert.equal(s.impulse(0, 0, 0.02, 0.08), true);
  const n = s.size, center = (n >> 1) * n + (n >> 1), neighbor = center + 1;
  assert.ok(s.velocity[center] > 0.01);

  for (let i = 0; i < 24; i++) s.step(1 / 120);
  assert.ok(Math.abs(s.height[neighbor]) > 1e-6, 'wave should reach an adjacent cell');
  const afterPropagation = energy(s);
  for (let i = 0; i < 240; i++) s.step(1 / 120);
  assert.ok(energy(s) < afterPropagation * 0.2, 'unforced wave energy should dissipate');
});

test('the same ripple object injects once even while it remains in the event list', () => {
  const event = { x: 0, y: 0, age: 0, amp: 0.05 };
  const persistent = new SurfaceWaves({ size: 25 });
  const once = new SurfaceWaves({ size: 25 });
  persistent.step(1 / 120, { ripples: [event] });
  once.step(1 / 120, { ripples: [event] });
  persistent.step(1 / 120, { ripples: [event] });
  once.step(1 / 120);
  assert.deepEqual(persistent.velocity, once.velocity);
  assert.deepEqual(persistent.height, once.height);
});

test('calm clears dynamic waves and retains the finite analytic base gradient', () => {
  const s = new SurfaceWaves({ size: 24 });
  s.step(0.1);
  s.impulse(0.1, -0.1, 0.02);
  s.step(1 / 60);
  assert.ok(energy(s) > 0);
  const phase = s.time;
  s.step(1 / 60, { calm: true });
  assert.equal(energy(s), 0);
  assert.equal(s.time, phase, 'calm freezes the base fold phase');
  assert.ok(s.data.some((byte) => byte !== 0), 'base gradient remains encoded');
  assert.ok([...s.height, ...s.velocity, ...s.data].every(Number.isFinite));
});

test('fixed stepping, aspect changes, and RGBA8 encoding stay deterministic and bounded', () => {
  const a = new SurfaceWaves({ size: 20 }), b = new SurfaceWaves({ size: 20 });
  for (const s of [a, b]) {
    s.setAspect(1.7);
    s.impulse(-0.2, 0.12, 0.04, 0.1);
    s.step(5);
  }
  assert.deepEqual(a.data, b.data);
  assert.deepEqual(a.height, b.height);
  assert.deepEqual(a.velocity, b.velocity);
  assert.equal(a.time, 0.1, 'large dt is capped');
  const version = a.version;
  a.step(0);
  assert.equal(a.version, version, 'version changes only when encoded data changes');
  a.setAspect(0.01); b.setAspect(0.01);
  assert.equal(a.aspect, 0.25, 'aspect is bounded to keep the fixed grid CFL-stable');
  a.step(0.1); b.step(0.1);
  assert.deepEqual(a.data, b.data);
  assert.equal(a.setAspect(Number.NaN), undefined);
  assert.ok([...a.height].every((v) => Number.isFinite(v) && Math.abs(v) <= 0.04));
  assert.ok([...a.velocity].every((v) => Number.isFinite(v) && Math.abs(v) <= 0.12));
  assert.ok([...a.data].every((v) => Number.isInteger(v) && v >= 0 && v <= 255));
  assert.ok(a.version >= 1);
});
