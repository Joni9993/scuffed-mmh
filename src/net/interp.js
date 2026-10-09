// Snapshot-Interpolation: Puffer mit Sender-Zeitstempeln, gerendert ~100 ms hinter der Gegenwart.
// Reine Logik (unit-getestet).

export const wrapPi = (a) => { a %= Math.PI * 2; if (a > Math.PI) a -= Math.PI * 2; else if (a < -Math.PI) a += Math.PI * 2; return a; };

export class SnapBuffer {
  /**
   * delay: Interpolationsverzögerung in s (100 ms). angleKeys: Schlüssel, die als Winkel (kürzester Weg) interpoliert werden.
   * Zeitbasis: Sender-Zeit `ts`; `off` schätzt (Empfängerzeit - Senderzeit) als gleitendes Minimum -> unempfindlich gegen Jitter.
   */
  constructor({ delay = 0.1, max = 40, angleKeys = ['rot'] } = {}) {
    this.delay = delay; this.max = max; this.angleKeys = new Set(angleKeys);
    this.list = []; this.off = null; this.lastTs = -Infinity;
  }
  get length() { return this.list.length; }
  get latest() { return this.list[this.list.length - 1]?.s ?? null; }
  push(ts, state, now) {
    if (ts <= this.lastTs) return false; // alt / doppelt
    this.lastTs = ts;
    const d = now - ts;
    this.off = this.off === null ? d : d < this.off ? d : this.off + (d - this.off) * 0.02;
    this.list.push({ t: ts, s: state });
    if (this.list.length > this.max) this.list.shift();
    return true;
  }
  /**
   * @returns {{ s: object, cur: object, curT: number, rt: number } | null}  s = interpolierter Zustand (Zahlen), cur = Snapshot (+ Zeit curT) für diskrete Felder, rt = Renderzeit in Senderzeit
   */
  sample(now) {
    const L = this.list;
    if (!L.length || this.off === null) return null;
    const rt = now - this.off - this.delay; // Renderzeit in Senderzeit
    if (rt <= L[0].t) return { s: { ...L[0].s }, cur: L[0].s, curT: L[0].t, rt };
    const last = L[L.length - 1];
    if (rt >= last.t) return { s: { ...last.s }, cur: last.s, curT: last.t, rt }; // kein Extrapolieren
    let i = L.length - 2;
    while (i > 0 && L[i].t > rt) i--;
    const a = L[i], b = L[i + 1];
    const k = (rt - a.t) / (b.t - a.t || 1);
    const out = { ...a.s };
    for (const key in a.s) {
      const x = a.s[key], y = b.s[key];
      if (typeof x !== 'number' || typeof y !== 'number') continue;
      out[key] = this.angleKeys.has(key) ? x + wrapPi(y - x) * k : x + (y - x) * k;
    }
    return { s: out, cur: a.s, curT: a.t, rt };
  }
  clear() { this.list.length = 0; this.off = null; this.lastTs = -Infinity; }
}
