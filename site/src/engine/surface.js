const FIXED_DT = 1 / 120;
const WAVE_SPEED = 0.28;
const DAMPING = 2.5;
const VISCOSITY = 0.00045;
const MAX_HEIGHT = 0.04;
const MAX_VELOCITY = 0.12;
const MAX_IMPULSE = 0.025;

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

/** A damped, reflecting height field whose gradients fit in one RGBA8 texture. */
export class SurfaceWaves {
  constructor({ size = 48 } = {}) {
    this.size = Math.max(3, Math.floor(Number.isFinite(size) ? size : 48));
    const count = this.size * this.size;
    this.height = new Float32Array(count);
    this.velocity = new Float32Array(count);
    this.scratch = new Float32Array(count);
    this.data = new Uint8Array(count * 4);
    this.version = 0;
    this.aspect = 1;
    this.time = 0;
    this._accumulator = 0;
    this.lastInjected = new WeakSet();
    this._writeData();
  }

  setAspect(aspect) {
    if (!Number.isFinite(aspect) || aspect <= 0) return;
    const next = clamp(aspect, 0.25, 10);
    if (next === this.aspect) return;
    this.aspect = next;
    this._writeData();
  }

  step(dt, { calm = false, ripples = [] } = {}) {
    const elapsed = Number.isFinite(dt) ? clamp(dt, 0, 0.1) : 0;
    this._consumeRipples(ripples, calm);

    if (calm) {
      this.height.fill(0);
      this.velocity.fill(0);
      this.scratch.fill(0);
      this._accumulator = 0;
      this._writeData();
      return;
    }

    this.time += elapsed;
    this._accumulator += elapsed;
    const steps = Math.min(12, Math.floor(this._accumulator / FIXED_DT + 1e-9));
    for (let i = 0; i < steps; i++) this._substep();
    this._accumulator -= steps * FIXED_DT;
    if (this._accumulator < 0) this._accumulator = 0;
    this._writeData();
  }

  impulse(x, y, amp, radius = 0.08) {
    if (![x, y, amp, radius].every(Number.isFinite) || radius <= 0) return false;
    const reach = radius * 3;
    if (x < -this.aspect * 0.5 - reach || x > this.aspect * 0.5 + reach || y < -0.5 - reach || y > 0.5 + reach) return false;

    const strength = clamp(amp, -MAX_IMPULSE, MAX_IMPULSE);
    if (strength === 0) return false;
    const n = this.size;
    const dx = this.aspect / (n - 1), dy = 1 / (n - 1);
    const sigma2 = 2 * radius * radius;
    for (let row = 0; row < n; row++) {
      const wy = 0.5 - row * dy;
      for (let col = 0; col < n; col++) {
        const wx = -this.aspect * 0.5 + col * dx;
        const dist2 = (wx - x) ** 2 + (wy - y) ** 2;
        if (dist2 > 9 * radius * radius) continue;
        const i = row * n + col;
        this.velocity[i] = clamp(this.velocity[i] + strength * Math.exp(-dist2 / sigma2), -MAX_VELOCITY, MAX_VELOCITY);
      }
    }
    return true;
  }

  _consumeRipples(ripples, calm) {
    if (!Array.isArray(ripples)) return;
    for (const ripple of ripples) {
      if (!ripple || typeof ripple !== 'object' || this.lastInjected.has(ripple)) continue;
      this.lastInjected.add(ripple);
      const age = Number.isFinite(ripple.age) ? ripple.age : 0;
      if (calm || age < 0 || age > 0.08) continue;
      if (![ripple.x, ripple.y, ripple.amp].every(Number.isFinite)) continue;
      this.impulse(ripple.x, ripple.y, clamp(ripple.amp * 0.35, -MAX_IMPULSE, MAX_IMPULSE), 0.1);
    }
  }

  _substep() {
    const n = this.size;
    const dx = this.aspect / (n - 1), dy = 1 / (n - 1);
    const invDx2 = 1 / (dx * dx), invDy2 = 1 / (dy * dy);
    const h = this.height, v = this.velocity, nextV = this.scratch;
    const damping = DAMPING;
    const speed2 = WAVE_SPEED * WAVE_SPEED;

    for (let row = 0; row < n; row++) {
      const rowStart = row * n;
      const upRow = row === 0 ? 1 : row - 1;
      const downRow = row === n - 1 ? n - 2 : row + 1;
      for (let col = 0; col < n; col++) {
        const i = rowStart + col;
        const left = rowStart + (col === 0 ? 1 : col - 1);
        const right = rowStart + (col === n - 1 ? n - 2 : col + 1);
        const up = upRow * n + col;
        const down = downRow * n + col;
        const lapH = (h[left] + h[right] - 2 * h[i]) * invDx2 + (h[up] + h[down] - 2 * h[i]) * invDy2;
        const lapV = (v[left] + v[right] - 2 * v[i]) * invDx2 + (v[up] + v[down] - 2 * v[i]) * invDy2;
        const acceleration = speed2 * lapH + VISCOSITY * lapV - damping * v[i];
        nextV[i] = clamp(v[i] + acceleration * FIXED_DT, -MAX_VELOCITY, MAX_VELOCITY);
      }
    }

    for (let i = 0; i < h.length; i++) h[i] = clamp(h[i] + nextV[i] * FIXED_DT, -MAX_HEIGHT, MAX_HEIGHT);
    this.velocity = nextV;
    this.scratch = v;
  }

  _writeData() {
    const n = this.size;
    const dx = this.aspect / (n - 1), dy = 1 / (n - 1);
    const phase = this.time * 0.035;
    let changed = false;
    const encode = (value) => Math.round((clamp(value, -1, 1) * 0.5 + 0.5) * 65535);

    for (let row = 0; row < n; row++) {
      const y = 0.5 - row * dy;
      const upRow = row === 0 ? 1 : row - 1;
      const downRow = row === n - 1 ? n - 2 : row + 1;
      for (let col = 0; col < n; col++) {
        const x = -this.aspect * 0.5 + col * dx;
        const p1 = 3.2 * x - 1.8 * y + phase;
        const p2 = 1.4 * x + 4 * y - 0.7 * phase;
        const p3 = 6.5 * x + 2.8 * y + 0.4 * phase;
        let gx = 0.144 * Math.cos(p1) + 0.049 * Math.cos(p2) + 0.078 * Math.cos(p3);
        let gy = -0.081 * Math.cos(p1) + 0.14 * Math.cos(p2) + 0.0336 * Math.cos(p3);

        const i = row * n + col;
        const left = row * n + (col === 0 ? 1 : col - 1);
        const right = row * n + (col === n - 1 ? n - 2 : col + 1);
        const up = upRow * n + col;
        const down = downRow * n + col;
        gx += (this.height[right] - this.height[left]) / (2 * dx);
        gy += (this.height[up] - this.height[down]) / (2 * dy);

        const magnitude = Math.hypot(gx, gy);
        if (magnitude > 0.6) { gx *= 0.6 / magnitude; gy *= 0.6 / magnitude; }
        const ex = encode(gx), ey = encode(gy), o = i * 4;
        const r = ex >>> 8, g = ex & 255, b = ey >>> 8, a = ey & 255;
        if (this.data[o] !== r || this.data[o + 1] !== g || this.data[o + 2] !== b || this.data[o + 3] !== a) changed = true;
        this.data[o] = r; this.data[o + 1] = g; this.data[o + 2] = b; this.data[o + 3] = a;
      }
    }
    if (changed) this.version++;
  }
}
