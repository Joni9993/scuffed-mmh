import { protectReduction } from '../combat.js';

// Ground hazards and ground feedback: lava damage (10/s), footstep dust/splash + step sounds per ground type.
export const LAVA_DPS = 10;
export const MUD_SPEED_MUL = 0.7;
const TICK = 0.5; // lava damage is applied in 5 HP ticks every 0.5 s (= 10 per second)

const STEP = {
  grass: { color: '#7aa648', n: 2, speed: 1.6, up: 0 },
  rock: { color: '#bfb6c8', n: 3, speed: 1.9, up: 0 },
  mud: { color: '#5a3d24', n: 5, speed: 2.4, up: 1 },
  lava: { color: '#ff8a2a', n: 4, speed: 2.6, up: 1 },
  slag: { color: '#6a5a50', n: 3, speed: 1.8, up: 0 },
  metal: { color: '#a89c90', n: 2, speed: 2.0, up: 0 },
  toxic: { color: '#8aff4a', n: 5, speed: 2.4, up: 1 },
};
const STEP_SFX = { slag: 'rock', metal: 'rock', toxic: 'mud' }; // existing step sounds reused for the Rostwerke ground types
export const TOXIC_DELAY = 1.5; // standing in Giftschlamm this long -> Gift status

export function createHazards(layout) {
  const st = new Map(); // player -> { lx, lz, dist, lavaT }
  const of = (p) => {
    let s = st.get(p);
    if (!s) { s = { lx: p.pos.x, lz: p.pos.z, dist: 0, lavaT: 0.3, toxT: 0, side: 1 }; st.set(p, s); }
    return s;
  };

  function update(dt, hunt) {
    for (const p of hunt.players) {
      const s = of(p);
      const g = layout.groundType(p.pos.x, p.pos.z);
      const moved = Math.hypot(p.pos.x - s.lx, p.pos.z - s.lz);
      s.lx = p.pos.x; s.lz = p.pos.z;
      const grounded = p.state === 'free' || p.state === 'roll';
      // ---- footsteps: one every ~1.5 m while moving on foot (roll gets a heavier burst of dust)
      if (grounded && moved > 0.002 && moved < 2) {
        s.dist += moved;
        const stride = p.sprinting ? 2.1 : 1.5;
        if (s.dist >= stride) {
          s.dist = 0;
          s.side = -s.side;
          const f = STEP[g];
          const fx = hunt.fx;
          const at = { x: p.pos.x, y: p.pos.y + 0.08, z: p.pos.z };
          fx?.spark(at, f.n + (p.state === 'roll' ? 3 : 0), f.color, f.speed);
          hunt.bus.emit('sfx', { name: `step_${STEP_SFX[g] ?? g}`, pos: p.pos, run: p.sprinting ? 1 : 0 });
        }
      }
      // ---- lava
      if (g === 'lava' && p.state !== 'ko' && p.alive !== false) {
        s.lavaT += dt;
        if (s.lavaT >= TICK) {
          s.lavaT -= TICK;
          // compensate Lumpen so lava really deals 10 HP/s; i-frames of a roll still protect
          const res = p.takeHit({ dmg: (LAVA_DPS * TICK) / (1 - protectReduction(p.protect)), knock: 'none', key: 'lava', sourcePos: null });
          if (res === 'hit' && hunt.fx) {
            hunt.fx.flash('rgba(255,120,24,.32)', 0.3);
            hunt.fx.spark({ x: p.pos.x, y: p.pos.y + 0.3, z: p.pos.z }, 7, '#ff9a30', 3.5);
          }
          hunt.bus.emit('sfx', { name: 'sizzle', pos: p.pos });
        }
      } else s.lavaT = Math.min(s.lavaT, 0.3);
      // ---- Giftschlamm (Rostwerke): after TOXIC_DELAY s of standing in it the Pirscher is poisoned (refreshed while he stays)
      if (g === 'toxic' && grounded && p.alive !== false) {
        s.toxT += dt;
        if (s.toxT >= TOXIC_DELAY) {
          if (!p.status?.poison || p.status.poison.t < 6) { p.addStatus?.('poison', { t: 8 }); hunt.fx?.spark({ x: p.pos.x, y: p.pos.y + 0.4, z: p.pos.z }, 6, '#9be15a', 2.5); }
        }
      } else s.toxT = Math.max(0, s.toxT - dt * 2);
    }
  }
  return { update };
}
