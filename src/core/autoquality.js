// Auto quality: if the average fps over WINDOW seconds of real hunt frames is below MIN_FPS, drop the render width 480 -> 360 once.
export const AQ_MIN_FPS = 45, AQ_WINDOW = 4;
export class AutoQuality {
  constructor({ minFps = AQ_MIN_FPS, window = AQ_WINDOW } = {}) { this.minFps = minFps; this.window = window; this.reset(); }
  reset() { this.t = 0; this.n = 0; this.done = false; }
  /** dt = real frame time (s). Returns true exactly once, when quality should drop. Hitches (> 0.5 s, tab switches) are ignored. */
  sample(dt) {
    if (this.done || !(dt > 0) || dt > 0.5) return false;
    this.t += dt; this.n++;
    if (this.t < this.window) return false;
    const fps = this.n / this.t;
    this.t = 0; this.n = 0;
    if (fps < this.minFps) { this.done = true; return true; }
    return false;
  }
}
