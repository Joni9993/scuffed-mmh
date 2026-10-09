/** Global sim time scaling (Glitch-Konter slow-mo). Slow-mo timers run in real time. */
export const time = {
  scale: 1,
  manual: 1,
  _slow: 0,
  _slowScale: 1,
  slowmo(duration, scale) { this._slow = duration; this._slowScale = scale; },
  /** realDt: unscaled seconds. */
  tick(realDt) {
    if (this._slow > 0) {
      this._slow -= realDt;
      const k = this._slow < 0.1 ? 1 - this._slow / 0.1 : 0; // ease back out
      this.scale = this._slowScale + (1 - this._slowScale) * k;
      if (this._slow <= 0) { this._slow = 0; this.scale = 1; }
    } else this.scale = 1;
    this.scale *= this.manual;
  },
  reset() { this.scale = 1; this._slow = 0; },
};

/** Per-entity hitstop helper: returns true if the entity is frozen this step. */
export function consumeHitstop(entity, dt) {
  if (entity.hitstop > 0) {
    entity.hitstop = Math.max(0, entity.hitstop - dt);
    return true;
  }
  return false;
}
