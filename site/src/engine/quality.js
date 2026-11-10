/**
 * Adaptive render scale. The fragment shader is the only expensive thing in the page,
 * so we trade resolution for frame time. Call tick(frameMs) every frame.
 */
export class Quality {
  constructor({ min = 0.5, max = 1, start = 0.85 } = {}) {
    this.min = min; this.max = max; this.scale = Math.min(max, Math.max(min, start));
    this.ema = 16; this.cool = 0; this.changed = false;
  }

  tick(ms) {
    this.changed = false;
    if (ms > 100) return false; // tab was hidden / stalled, ignore
    this.ema += (ms - this.ema) * 0.08;
    this.cool--;
    if (this.cool > 0) return false;
    let s = this.scale;
    if (this.ema > 21 && s > this.min) s = Math.max(this.min, s - 0.1);
    else if (this.ema < 12.5 && s < this.max) s = Math.min(this.max, s + 0.05);
    if (Math.abs(s - this.scale) > 1e-4) {
      this.scale = s; this.cool = 45; this.changed = true; this.ema = 16;
      return true;
    }
    return false;
  }
}
