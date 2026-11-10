/**
 * Liquid-metal simulation. Pure JS, no DOM, deterministic given a seed.
 *
 * World space: height = 1 unit, y points UP, x spans [-aspect/2, aspect/2].
 * Blob slots:
 *   0 .. ANCHORED-1     follow layout anchors with an under-damped spring (the "identity" blobs)
 *   FREE0 .. +FREE_N-1  free droplets: pinched off by drips or sheared off by the pointer
 *   POINTER             the cursor droplet
 *
 * What makes it read as liquid rather than "circles on sine waves":
 *   1. Anchors are springs with ~0.5 damping ratio, so everything overshoots and settles.
 *   2. Bigger blobs are slower (weight), small ones are quick.
 *   3. Cohesion pulls blobs that are nearly touching together (necks form in the renderer);
 *      free droplets also repel when deeply overlapped so they do not collapse.
 *   4. Every blob stretches along its velocity (volume preserving) and rings after impacts
 *      (a damped radial wobble mode).
 *   5. Drips grow, elongate, pinch off, fall under gravity and are absorbed with a ripple.
 *   6. The pointer drags nearby metal along, shears droplets off a big blob when swiped fast,
 *      and pulls metal toward it while pressed, then releases with a wobble.
 */

export const MAX_BLOBS = 32;
export const ANCHORED = 24;
export const FREE0 = 24;
export const FREE_N = 7;
export const POINTER = 31;
export const MAX_RIPPLES = 8;

const TAU = Math.PI * 2;
const MIN_R = 0.003;

export const DEFAULTS = {
  freq: 1.15, // anchor spring frequency (Hz)
  zeta: 0.52, // anchor damping ratio; < 1 gives overshoot
  wobbleFreq: 3.4, // radial ring-down frequency (Hz)
  wobbleZeta: 0.14,
  cohesion: 2.4,
  cohRange: 1.9, // x (ri + rj)
  repulsion: 16,
  repRange: 0.55, // x (ri + rj), free droplets only
  entrain: 3.6, // pointer drags metal along its velocity
  poke: 1.4, // pointer pushes metal away
  attract: 8.0, // pull while pressed
  pointerSigma: 0.2,
  gravity: 1.7,
  airDrag: 0.45,
  stretchGain: 0.5,
  stretchMax: 0.6,
  stretchTau: 0.09,
  radiusTau: 0.28,
  vmax: 4,
  splitSpeed: 1.7,
  splitCooldown: 0.16,
  mergeFrac: 0.42,
  dripGrow: 0.55, // drip cycles per second at rate 1
  step: 1 / 120,
};

export function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class LiquidSim {
  constructor(opts = {}) {
    this.p = { ...DEFAULTS, ...(opts.params || {}) };
    this.rng = mulberry32(opts.seed ?? 1);
    this.aspect = opts.aspect ?? 1.6;
    const n = MAX_BLOBS;
    const F = () => new Float32Array(n);
    this.x = F(); this.y = F(); this.vx = F(); this.vy = F();
    this.r = F(); this.rT = F();
    this.wob = F(); this.wobV = F();
    this.stretch = F(); this.dirx = F(); this.diry = F();
    this.grav = F(); // 0/1 gravity flag
    this.fx = F(); this.fy = F();
    this.forced = F(); // extra stretch (drips)
    // layout inputs for the anchored slots
    this.anchorX = F(); this.anchorY = F(); this.anchorR = F(); this.anchorK = F(); this.anchorDrip = F();
    this.dripPhase = F();
    this.dripGrow = F();
    this.ripples = [];
    this.time = 0;
    this.acc = 0;
    this.calm = false;
    this.splitCd = 0;
    this._pointerWasDown = false;
    this._ptrPrev = null;
    this.stats = { merges: 0, drops: 0, splits: 0 };
    this.reset(true);
  }

  setAspect(a) { this.aspect = a; }

  setCalm(b) { this.calm = !!b; }

  /** Scatter anchored blobs so the first frames gather into the layout (the intro). */
  reset(scatter = true) {
    for (let i = 0; i < MAX_BLOBS; i++) {
      this.x[i] = scatter ? (this.rng() - 0.5) * this.aspect * 1.3 : 0;
      this.y[i] = scatter ? (this.rng() - 0.5) * 1.3 : 0;
      this.vx[i] = this.vy[i] = 0;
      this.r[i] = 0; this.rT[i] = 0;
      this.wob[i] = this.wobV[i] = 0;
      this.stretch[i] = 0; this.dirx[i] = 1; this.diry[i] = 0;
      this.grav[i] = 0;
      this.anchorK[i] = 1;
      this.dripPhase[i] = this.rng();
      this.dripGrow[i] = this.rng() * 0.6;
    }
    this.ripples.length = 0;
  }

  emitRipple(x, y, amp) {
    if (this.calm) return;
    if (this.ripples.length >= MAX_RIPPLES) this.ripples.shift();
    this.ripples.push({ x, y, age: 0, amp });
  }

  _freeSlot() {
    for (let i = FREE0; i < FREE0 + FREE_N; i++) if (this.r[i] < MIN_R) return i;
    return -1;
  }

  _spawn(x, y, vx, vy, r, grav) {
    const i = this._freeSlot();
    if (i < 0) return -1;
    this.x[i] = x; this.y[i] = y; this.vx[i] = vx; this.vy[i] = vy;
    this.r[i] = r; this.rT[i] = r; this.wob[i] = 0; this.wobV[i] = 0;
    this.stretch[i] = 0; this.grav[i] = grav ? 1 : 0;
    const s = Math.hypot(vx, vy);
    if (s > 1e-3) { this.dirx[i] = vx / s; this.diry[i] = vy / s; }
    return i;
  }

  _kill(i) {
    this.r[i] = 0; this.rT[i] = 0; this.vx[i] = this.vy[i] = 0; this.wob[i] = this.wobV[i] = 0; this.grav[i] = 0;
  }

  /** Advance by dt seconds with fixed internal substeps. pointer = {x,y,present,down} in world space. */
  step(dt, pointer) {
    dt = Math.min(Math.max(dt, 0), 0.1);
    this.acc += dt;
    const h = this.p.step;
    let guard = 0;
    while (this.acc >= h && guard++ < 12) {
      this._substep(h, pointer, h);
      this.acc -= h;
    }
    if (guard >= 12) this.acc = 0;
  }

  _substep(h, pointer) {
    const p = this.p;
    const n = MAX_BLOBS;
    const calm = this.calm;
    this.time += h;

    // pointer kinematics
    let ptr = null;
    if (pointer && pointer.present && !calm) {
      let pvx = 0, pvy = 0;
      if (this._ptrPrev) {
        pvx = (pointer.x - this._ptrPrev.x) / h;
        pvy = (pointer.y - this._ptrPrev.y) / h;
      }
      // low-pass the pointer velocity
      const prev = this._ptrV || { x: 0, y: 0 };
      const a = 1 - Math.exp(-h / 0.045);
      this._ptrV = { x: prev.x + (pvx - prev.x) * a, y: prev.y + (pvy - prev.y) * a };
      this._ptrPrev = { x: pointer.x, y: pointer.y };
      ptr = { x: pointer.x, y: pointer.y, vx: this._ptrV.x, vy: this._ptrV.y, down: !!pointer.down };
      ptr.speed = Math.hypot(ptr.vx, ptr.vy);
    } else {
      this._ptrPrev = null;
      this._ptrV = { x: 0, y: 0 };
    }

    // 1. forces
    const fx = this.fx, fy = this.fy;
    fx.fill(0); fy.fill(0);
    const zeta = calm ? 1.0 : p.zeta;
    const freqScale = calm ? 1.5 : 1.0;

    for (let i = 0; i < ANCHORED; i++) {
      const rt = this.anchorR[i];
      this.rT[i] = rt;
      if (this.r[i] < MIN_R && rt < MIN_R) continue;
      const k = this.anchorK[i];
      // drips hang lower while they grow
      let ay = this.anchorY[i];
      if (this.anchorDrip[i] > 0 && !calm) ay -= 0.07 * this.dripGrow[i] * this.dripGrow[i];
      const rr = Math.max(this.r[i], 0.04);
      const w = TAU * p.freq * freqScale * k * clamp(Math.pow(0.12 / rr, 0.25), 0.7, 1.4);
      fx[i] += w * w * (this.anchorX[i] - this.x[i]) - 2 * zeta * w * this.vx[i];
      fy[i] += w * w * (ay - this.y[i]) - 2 * zeta * w * this.vy[i];
    }

    for (let i = FREE0; i < FREE0 + FREE_N; i++) {
      if (this.r[i] < MIN_R) continue;
      if (this.grav[i]) fy[i] -= p.gravity;
      fx[i] -= p.airDrag * this.vx[i];
      fy[i] -= p.airDrag * this.vy[i];
    }

    // pair forces: cohesion (necks) + repulsion for free droplets
    for (let i = 0; i < n; i++) {
      const ri = this.r[i];
      if (ri < MIN_R || i === POINTER) continue;
      for (let j = i + 1; j < n; j++) {
        const rj = this.r[j];
        if (rj < MIN_R || j === POINTER) continue;
        const dx = this.x[j] - this.x[i], dy = this.y[j] - this.y[i];
        const d2 = dx * dx + dy * dy;
        const s = ri + rj;
        const far = p.cohRange * s;
        if (d2 > far * far) continue;
        const d = Math.sqrt(d2) + 1e-6;
        const nx = dx / d, ny = dy / d;
        let f = 0;
        const freeAny = i >= FREE0 || j >= FREE0;
        const rep = p.repRange * s;
        if (freeAny && d < rep) f = -p.repulsion * (1 - d / rep);
        else if (d > rep) {
          const u = (d - rep) / (far - rep);
          f = p.cohesion * Math.sin(Math.PI * u);
        }
        if (calm) f *= 0.4;
        const mi = ri * ri, mj = rj * rj, mt = mi + mj;
        fx[i] += nx * f * (mj / mt); fy[i] += ny * f * (mj / mt);
        fx[j] -= nx * f * (mi / mt); fy[j] -= ny * f * (mi / mt);
      }
    }

    // pointer interaction
    this._pointerForces(h, ptr);

    // drips
    if (!calm) this._drips(h);

    // 2. integrate
    const vmax = p.vmax;
    const wk = TAU * p.wobbleFreq;
    const wc = 2 * p.wobbleZeta * wk;
    const radA = 1 - Math.exp(-h / p.radiusTau);
    const stA = 1 - Math.exp(-h / p.stretchTau);
    for (let i = 0; i < n; i++) {
      if (i === POINTER) continue;
      if (this.r[i] < MIN_R && this.rT[i] < MIN_R) continue;
      let vx = this.vx[i] + fx[i] * h;
      let vy = this.vy[i] + fy[i] * h;
      const sp = Math.hypot(vx, vy);
      if (sp > vmax) { vx *= vmax / sp; vy *= vmax / sp; }
      this.vx[i] = vx; this.vy[i] = vy;
      this.x[i] += vx * h; this.y[i] += vy * h;
      // radius relaxes toward target (anchored only; free droplets keep their volume)
      if (i < ANCHORED) this.r[i] += (this.rT[i] - this.r[i]) * radA;
      // wobble
      if (calm) { this.wob[i] *= 0.9; this.wobV[i] *= 0.9; }
      else {
        this.wobV[i] += (-wk * wk * this.wob[i] - wc * this.wobV[i]) * h;
        this.wob[i] = clamp(this.wob[i] + this.wobV[i] * h, -0.45, 0.45);
      }
      // stretch along velocity
      const tgt = Math.min(p.stretchMax, sp * p.stretchGain + this.forced[i]);
      this.stretch[i] += (calm ? 0 - this.stretch[i] : tgt - this.stretch[i]) * stA;
      if (sp > 0.04) {
        const k = 1 - Math.exp(-h / 0.05);
        let dx = this.dirx[i] + (vx / sp - this.dirx[i]) * k;
        let dy = this.diry[i] + (vy / sp - this.diry[i]) * k;
        const l = Math.hypot(dx, dy) || 1;
        this.dirx[i] = dx / l; this.diry[i] = dy / l;
      }
      if (!Number.isFinite(this.x[i] + this.y[i] + this.r[i] + this.vx[i] + this.vy[i])) this._reviveBlob(i);
    }

    this._merge();
    this._cull();

    // ripples
    for (let k = this.ripples.length - 1; k >= 0; k--) {
      const rp = this.ripples[k];
      rp.age += h;
      rp.amp *= Math.exp(-h * 1.5);
      if (rp.amp < 0.01 || rp.age > 3) this.ripples.splice(k, 1);
    }
    this.splitCd = Math.max(0, this.splitCd - h);
  }

  _reviveBlob(i) {
    this.x[i] = this.anchorX[i] || 0; this.y[i] = this.anchorY[i] || 0;
    this.vx[i] = this.vy[i] = 0; this.wob[i] = this.wobV[i] = 0; this.stretch[i] = 0;
    if (i >= ANCHORED) this._kill(i); else this.r[i] = 0;
  }

  _pointerForces(h, ptr) {
    const p = this.p;
    const fx = this.fx, fy = this.fy;
    // the cursor droplet
    const i = POINTER;
    if (ptr) {
      const rT = 0.034 + 0.045 * Math.min(ptr.speed / 1.6, 1) + (ptr.down ? 0.04 : 0);
      if (this.r[i] < MIN_R) { this.x[i] = ptr.x; this.y[i] = ptr.y; this.vx[i] = this.vy[i] = 0; }
      this.r[i] += (rT - this.r[i]) * (1 - Math.exp(-h / 0.12));
      const w = TAU * 3.2, z = 0.75;
      const ax = w * w * (ptr.x - this.x[i]) - 2 * z * w * this.vx[i];
      const ay = w * w * (ptr.y - this.y[i]) - 2 * z * w * this.vy[i];
      this.vx[i] += ax * h; this.vy[i] += ay * h;
      this.x[i] += this.vx[i] * h; this.y[i] += this.vy[i] * h;
      const sp = Math.hypot(this.vx[i], this.vy[i]);
      this.stretch[i] += (Math.min(p.stretchMax, sp * p.stretchGain) - this.stretch[i]) * (1 - Math.exp(-h / p.stretchTau));
      if (sp > 0.04) { this.dirx[i] = this.vx[i] / sp; this.diry[i] = this.vy[i] / sp; }
    } else {
      this.r[i] += (0 - this.r[i]) * (1 - Math.exp(-h / 0.15));
      if (this.r[i] < MIN_R) this.r[i] = 0;
    }
    if (!ptr) {
      if (this._pointerWasDown) this._pointerWasDown = false;
      return;
    }

    // press start: shock wave
    if (ptr.down && !this._pointerWasDown) {
      this.emitRipple(ptr.x, ptr.y, 1.0);
      for (let b = 0; b < MAX_BLOBS; b++) {
        if (b === POINTER || this.r[b] < MIN_R) continue;
        const dx = this.x[b] - ptr.x, dy = this.y[b] - ptr.y;
        const d = Math.hypot(dx, dy) + 1e-4;
        const g = Math.exp(-(d * d) / 0.12);
        this.vx[b] += (dx / d) * 0.9 * g; this.vy[b] += (dy / d) * 0.9 * g;
        this.wobV[b] += 3.5 * g;
      }
    }
    // release: snap-back wobble
    if (!ptr.down && this._pointerWasDown) {
      for (let b = 0; b < MAX_BLOBS; b++) {
        if (b === POINTER || this.r[b] < MIN_R) continue;
        const d = Math.hypot(this.x[b] - ptr.x, this.y[b] - ptr.y);
        this.wobV[b] += 2.5 * Math.exp(-(d * d) / 0.2);
      }
    }
    this._pointerWasDown = ptr.down;

    for (let b = 0; b < MAX_BLOBS; b++) {
      if (b === POINTER || this.r[b] < MIN_R) continue;
      const dx = this.x[b] - ptr.x, dy = this.y[b] - ptr.y;
      const d = Math.hypot(dx, dy) + 1e-4;
      const sigma = p.pointerSigma + this.r[b];
      const g = Math.exp(-(d * d) / (sigma * sigma));
      if (g < 0.01) continue;
      const ux = dx / d, uy = dy / d;
      // drag along pointer velocity, push away a little when moving
      fx[b] += p.entrain * g * ptr.vx + p.poke * g * ux * Math.min(ptr.speed, 2);
      fy[b] += p.entrain * g * ptr.vy + p.poke * g * uy * Math.min(ptr.speed, 2);
      if (ptr.down) {
        const s2 = sigma * 1.8;
        const g2 = Math.exp(-(d * d) / (s2 * s2));
        fx[b] -= p.attract * g2 * ux; fy[b] -= p.attract * g2 * uy;
      }
    }

    // shear a droplet off a big blob when swiped fast
    if (ptr.speed > p.splitSpeed && this.splitCd <= 0) {
      let best = -1, bd = 1e9;
      for (let b = 0; b < FREE0; b++) {
        if (this.r[b] < 0.07) continue;
        const d = Math.hypot(this.x[b] - ptr.x, this.y[b] - ptr.y) - this.r[b];
        if (d < 0.05 && d < bd) { bd = d; best = b; }
      }
      if (best >= 0) {
        const rs = 0.026 + this.rng() * 0.014;
        const rb = this.r[best];
        const ux = (ptr.x - this.x[best]), uy = (ptr.y - this.y[best]);
        const ul = Math.hypot(ux, uy) || 1;
        const s = this._spawn(this.x[best] + (ux / ul) * rb * 0.85, this.y[best] + (uy / ul) * rb * 0.85,
          ptr.vx * 0.55 + (this.rng() - 0.5) * 0.4, ptr.vy * 0.55 + (this.rng() - 0.5) * 0.4, rs, false);
        if (s >= 0) {
          this.r[best] = Math.sqrt(Math.max(rb * rb - rs * rs, 0));
          this.wobV[best] += 4;
          this.splitCd = p.splitCooldown;
          this.stats.splits++;
        }
      }
    }
  }

  _drips(h) {
    const p = this.p;
    for (let i = 0; i < ANCHORED; i++) {
      const rate = this.anchorDrip[i];
      if (rate <= 0 || this.r[i] < 0.04) { this.forced[i] = 0; continue; }
      this.dripGrow[i] += h * rate * p.dripGrow * (0.75 + 0.5 * this.dripPhase[i]);
      const g = this.dripGrow[i];
      this.forced[i] = Math.min(0.5, g * g * 0.5);
      if (g >= 1) {
        const rd = 0.042 + 0.012 * this.dripPhase[i];
        const s = this._spawn(this.x[i], this.y[i] - this.r[i] * 0.9, this.vx[i] * 0.2, -0.12, rd, true);
        this.dripGrow[i] = 0;
        this.forced[i] = 0;
        this.wobV[i] += 3;
        this.dripPhase[i] = this.rng();
        if (s >= 0) this.stats.drops++;
      }
    }
  }

  _merge() {
    const p = this.p;
    for (let i = FREE0; i < FREE0 + FREE_N; i++) {
      const ri = this.r[i];
      if (ri < MIN_R) continue;
      for (let j = 0; j < MAX_BLOBS; j++) {
        if (j === i || j === POINTER) continue;
        const rj = this.r[j];
        if (rj < MIN_R) continue;
        const d = Math.hypot(this.x[j] - this.x[i], this.y[j] - this.y[i]);
        if (d > p.mergeFrac * (ri + rj)) continue;
        if (j >= FREE0 && rj < ri) continue; // the larger free droplet absorbs, handled when loop reaches it
        const mi = ri * ri, mj = rj * rj;
        const rel = Math.hypot(this.vx[i] - this.vx[j], this.vy[i] - this.vy[j]);
        if (j < ANCHORED) {
          // absorbed into an anchored blob: it swells, rings, and ripples
          this.r[j] = Math.sqrt(mi + mj);
          this.vx[j] += (this.vx[i] * mi) / (mi + mj) * 0.4;
          this.vy[j] += (this.vy[i] * mi) / (mi + mj) * 0.4;
          this.wobV[j] += 3 + 5 * Math.min(rel, 2);
          this.emitRipple(this.x[i], this.y[i], clamp(0.35 + rel * 0.5, 0.35, 1));
        } else {
          const t = mi + mj;
          this.x[j] = (this.x[i] * mi + this.x[j] * mj) / t; this.y[j] = (this.y[i] * mi + this.y[j] * mj) / t;
          this.vx[j] = (this.vx[i] * mi + this.vx[j] * mj) / t; this.vy[j] = (this.vy[i] * mi + this.vy[j] * mj) / t;
          this.r[j] = Math.sqrt(t); this.rT[j] = this.r[j];
          this.wobV[j] += 3 + 4 * Math.min(rel, 2);
        }
        this.stats.merges++;
        this._kill(i);
        break;
      }
    }
  }

  _cull() {
    const lim = this.aspect * 0.5 + 0.6;
    for (let i = FREE0; i < FREE0 + FREE_N; i++) {
      if (this.r[i] < MIN_R) continue;
      if (this.y[i] < -0.5 - this.r[i] - 0.1 || Math.abs(this.x[i]) > lim || this.y[i] > 0.9) this._kill(i);
    }
  }

  /** Pack render state into two Float32Array(MAX_BLOBS*4): A=(x,y,r,stretch) B=(dirx,diry,0,0). */
  pack(A, B) {
    for (let i = 0; i < MAX_BLOBS; i++) {
      const r = this.r[i] * (1 + this.wob[i]);
      const o = i * 4;
      A[o] = this.x[i]; A[o + 1] = this.y[i]; A[o + 2] = r > MIN_R ? r : 0; A[o + 3] = this.stretch[i];
      B[o] = this.dirx[i]; B[o + 1] = this.diry[i]; B[o + 2] = 0; B[o + 3] = 0;
    }
  }

  packRipples(R) {
    R.fill(0);
    for (let k = 0; k < this.ripples.length && k < MAX_RIPPLES; k++) {
      const rp = this.ripples[k];
      R[k * 4] = rp.x; R[k * 4 + 1] = rp.y; R[k * 4 + 2] = rp.age; R[k * 4 + 3] = rp.amp;
    }
  }
}

/**
 * Placeholder head. A sphere with spring-driven position/size, wobble modes excited by motion
 * and impacts, and a bulge that leans toward the pointer. Replace later with a real head mesh.
 */
export class OrbSim {
  constructor() {
    this.x = 0; this.y = 0; this.vx = 0; this.vy = 0;
    this.R = 0; this.RV = 0;
    this.yaw = 0; this.yawV = 0; this.pitch = 0;
    this.m = [0, 0, 0]; this.mV = [0, 0, 0];
    this.bulge = 0; this.bulgeAng = 0;
    this.clay = 0;
    this.vis = 0;
    this.t = { x: 0, y: 0, R: 0, yaw: 0, clay: 0 };
    this._lastSpeed = 0;
  }

  setTarget(t) { Object.assign(this.t, t); }

  impulse(k) { for (let i = 0; i < 3; i++) this.mV[i] += k * (i === 2 ? 1 : (i ? -0.7 : 0.9)); }

  step(dt, pointer, down, calm) {
    dt = Math.min(dt, 0.05);
    const w = TAU * (calm ? 1.7 : 1.0), z = calm ? 1.0 : 0.55;
    const ax = w * w * (this.t.x - this.x) - 2 * z * w * this.vx;
    const ay = w * w * (this.t.y - this.y) - 2 * z * w * this.vy;
    const aR = w * w * (this.t.R - this.R) - 2 * z * w * this.RV;
    this.vx += ax * dt; this.vy += ay * dt; this.RV += aR * dt;
    this.x += this.vx * dt; this.y += this.vy * dt;
    this.R = Math.max(0, this.R + this.RV * dt);
    // yaw follows scroll with a little lag
    const wy = TAU * 1.4;
    this.yawV += (wy * wy * (this.t.yaw - this.yaw) - 2 * 0.8 * wy * this.yawV) * dt;
    this.yaw += this.yawV * dt;
    this.clay += (this.t.clay - this.clay) * (1 - Math.exp(-dt / 0.35));
    this.vis = this.R > 0.004 ? 1 : 0;

    // motion excites the wobble modes
    const speed = Math.hypot(this.vx, this.vy) + Math.abs(this.RV);
    const dv = speed - this._lastSpeed;
    this._lastSpeed = speed;
    if (!calm) {
      this.mV[0] += this.vx * dt * 3.0;
      this.mV[1] += this.vy * dt * 3.0;
      this.mV[2] += dv * 0.5;
    }
    const wk = TAU * 2.6, wc = 2 * 0.16 * wk;
    for (let i = 0; i < 3; i++) {
      this.mV[i] += (-wk * wk * this.m[i] - wc * this.mV[i]) * dt;
      this.m[i] = clamp(this.m[i] + this.mV[i] * dt, -0.3, 0.3);
      if (calm) { this.m[i] *= 0.9; this.mV[i] *= 0.9; }
    }

    // lean toward the pointer
    let bT = 0;
    if (pointer && pointer.present && !calm && this.R > 0.01) {
      const dx = pointer.x - this.x, dy = pointer.y - this.y;
      const d = Math.hypot(dx, dy);
      bT = 0.16 * Math.exp(-Math.max(d - this.R, 0) / (this.R * 1.4)) + (down ? 0.05 : 0);
      this.bulgeAng = Math.atan2(dy, dx);
      if (down && !this._down) this.impulse(6);
    }
    this._down = down;
    this.bulge += (bT - this.bulge) * (1 - Math.exp(-dt / 0.12));
  }

  pack(o0, o1, o2) {
    o0[0] = this.x; o0[1] = this.y; o0[2] = this.R; o0[3] = this.vis;
    o1[0] = this.yaw; o1[1] = this.pitch; o1[2] = this.bulge; o1[3] = this.bulgeAng;
    o2[0] = this.m[0]; o2[1] = this.m[1]; o2[2] = this.m[2]; o2[3] = this.clay;
  }
}

export function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
