// Multi-Jagd „Revierstreit" (GDD 16.6, NEXT.md §4): zwei Brocken bekämpfen sich, bis die Pirscher zu viel Druck machen
// oder 60 s vergangen sind - dann verbünden sie sich. Host-autoritativ: Brocken-gegen-Brocken-Treffer nur hier (Host/Solo).
import { overlap } from './hitbox.js';
import { onTemple } from './world/smaragdkuesteLayout.js';

export const REVIER = {
  ALLY_T: 60, // s Revierkampf (läuft erst, wenn ein Pirscher in der Nähe ist), dann Bündnis
  STRONG_PCT: 0.08, STRONG_WIN: 10, // Pirscher-Schaden > 8 % Max-HP eines Brockens in 10 s -> Bündnis
  NEAR: 45, // m: ab hier läuft die Uhr
  DMG_K: 12, // Monster-Angriffe sind auf Spieler-Leben (~20-40) getrimmt; gegen Brocken-HP (Tausende) hochskaliert
  FLOOR: 0.6, // der Revierkampf allein drückt keinen Brocken unter 60 % seiner HP
};

/** Brocken-HP (und Teil-HP) auf Faktor f skalieren (Multi-Jagd: 65 %). */
export function scaleBoss(m, f) {
  if (!m || f === 1) return;
  m.maxHp = Math.round(m.maxHp * f);
  m.hp = m.maxHp;
  for (const p of m.parts ?? []) {
    if (!p.breakHp || !Number.isFinite(p.hp)) continue;
    p.breakHp = Math.round(p.breakHp * f);
    p.hp = p.breakHp;
  }
}

export class Revier {
  /** ctx = Hunt (oder Test-Ctx mit players/bus/fx); monsters = die zwei Brocken. */
  /**
   * opts.apex (Krachfaust, Spec 4.7): `monsters` = [Apex]. Der Apex greift alles Lebende an, was seinen Tempel betritt (auch Kleinvieh), und jeder andere
   * Brocken im Tempel zielt auf ihn. Kein Buendnis, keine Uhr (phase bleibt 'clash'), Pirscher-Druck zaehlt nicht.
   */
  constructor(ctx, monsters, { apex = false } = {}) {
    this.ctx = ctx;
    this.monsters = monsters;
    this.apex = apex;
    this.phase = 'clash'; // clash | allied
    this.clock = 0; // eigene Uhr (s), unabhängig von Brocken-Zeit
    this.t = 0; // Revierkampf-Zeit seit Pirscher-Nähe
    this.armed = false;
    this.log = new Map(); // monster.id -> [{t, dmg}] Pirscher-Schaden
    this.hits = 0; // Zähler Brocken-gegen-Brocken-Treffer
    ctx.revier = this;
  }

  /** Gegner im Revierkampf (nur solange Kampf-Phase und lebendig), sonst null. */
  rivalOf(m) {
    if (this.apex) {
      if (!m.alive) return null;
      if (this.monsters.includes(m)) { // der Apex: naechster anderer lebender Brocken im Tempel
        let best = null, bd = Infinity;
        for (const o of this.ctx.monsters ?? []) {
          if (o === m || !o.alive || !onTemple(o.pos.x, o.pos.z)) continue;
          const d = (o.pos.x - m.pos.x) ** 2 + (o.pos.z - m.pos.z) ** 2;
          if (d < bd) { bd = d; best = o; }
        }
        return best;
      }
      const a = this.monsters.find((x) => x.alive);
      return a && onTemple(m.pos.x, m.pos.z) ? a : null; // andere Brocken im Tempel wehren sich gegen den Apex
    }
    if (this.phase !== 'clash') return null;
    const o = this.monsters.find((x) => x !== m && x.alive);
    return o && m.alive ? o : null;
  }

  update(dt) {
    this.clock += dt;
    if (this.apex) return;
    if (this.phase !== 'clash') return;
    if (!this.armed) {
      const near = REVIER.NEAR * REVIER.NEAR;
      this.armed = this.ctx.players.some((p) => p.alive && this.monsters.some((m) => m.alive && (p.pos.x - m.pos.x) ** 2 + (p.pos.z - m.pos.z) ** 2 < near));
      if (!this.armed) return;
    }
    this.t += dt;
    if (this.t >= REVIER.ALLY_T) this.ally('timer');
  }

  /** Pirscher-Schaden an einem Brocken (von Monster.applyDamage). */
  noteDamage(monster, dmg) {
    if (this.apex || this.phase !== 'clash') return;
    this.armed = true;
    const l = this.log.get(monster.id) ?? this.log.set(monster.id, []).get(monster.id);
    l.push({ t: this.clock, dmg });
    while (l.length && this.clock - l[0].t > REVIER.STRONG_WIN) l.shift();
    if (l.reduce((s, e) => s + e.dmg, 0) > monster.maxHp * REVIER.STRONG_PCT) this.ally('strong');
  }

  ally(reason) {
    if (this.phase !== 'clash') return;
    this.phase = 'allied';
    this.reason = reason;
    for (const m of this.monsters) {
      if (!m.alive) continue;
      m.target = null; m.retargetT = 0;
      m.recover = Math.max(m.recover ?? 0, 0.6);
      m.discovered = true;
    }
    this.ctx.bus?.emit('revierAlly', { reason });
  }

  /** Hit-Formen des angreifenden Brockens gegen den Rivalen testen (nur Host/Solo). */
  resolve(att, inst, hits) {
    if (this.apex && this.monsters.includes(att)) { // Apex: jeder lebende Brocken/Kleinvieh im Tempel kann getroffen werden
      for (const vic of this.ctx.monsters ?? []) if (vic !== att && vic.alive && onTemple(vic.pos.x, vic.pos.z)) this.#strike(att, vic, inst, hits);
      return;
    }
    const vic = this.rivalOf(att);
    if (vic) this.#strike(att, vic, inst, hits);
  }

  #strike(att, vic, inst, hits) {
    for (const h of hits) {
      const k = vic.id + '|' + h.idx;
      if (inst.hitSet.has(k)) continue;
      let best = null;
      for (const e of vic.hurtParts()) if (overlap(h.shape, e.sphere) && (!best || e.part.factor > best.part.factor)) best = e;
      if (!best) continue;
      inst.hitSet.add(k);
      if (!(h.dmg > 0)) continue;
      const room = vic.minor ? vic.hp : vic.hp - vic.maxHp * REVIER.FLOOR; // Kleinvieh darf sterben
      if (room <= 0) continue;
      const dmg = Math.min(room, h.dmg * att.dmgMul * REVIER.DMG_K * Math.max(0.5, best.part.factor));
      const at = { x: best.pos.x, y: best.pos.y, z: best.pos.z };
      vic.applyDamage({ dmg, partId: best.part.id, elemDmg: 0, blunt: 0, attackerId: att.id, revier: true });
      this.hits++;
      this.ctx.fx?.spark?.(at, 10, '#ffb060', 5);
      this.ctx.fx?.number?.({ x: at.x, y: at.y + 0.6, z: at.z }, Math.round(dmg), 'hit');
      this.ctx.bus?.emit('revierHit', { attacker: att, victim: vic, part: best.part.id, dmg });
    }
  }
}
