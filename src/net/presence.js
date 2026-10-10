import { MSG, encodeTown, decodeTown } from './protocol.js';
import { SnapBuffer } from './interp.js';
import { nameTag } from './sync.js';

export const RATE_TOWN = 10; // Hz
const nowS = () => performance.now() / 1000;

/**
 * Stadt-Präsenz: sendet den lokalen Pirscher mit ~10 Hz an alle Raum-Mitglieder und interpoliert (100 ms) die anderen.
 * Die Stadt-Szene ruft pro Frame `update(dt, local)` und holt sich mit `remotes()`/`sample(id)` Zustände, die sie auf beliebige
 * Rigs anwendet (z. B. `buildHunterRig`); `attach(id, rig.root)` hängt ein Namensschild in der Mitgliedsfarbe an.
 *   local: { x, y, z, rot, anim?, speed? }
 */
export class Presence {
  constructor(session, { rate = RATE_TOWN } = {}) {
    this.session = session;
    this.rate = rate;
    this.acc = 0;
    this.bufs = new Map();
    this.tags = new Map();
    this.offs = [
      session.on(MSG.TP, (d, from) => {
        if (from === session.myId) return;
        let b = this.bufs.get(from);
        if (!b) { b = new SnapBuffer({ angleKeys: ['rot'] }); this.bufs.set(from, b); }
        const s = decodeTown(d);
        b.push(s.T, s, nowS());
      }),
      session.on('peer-leave', ({ id }) => this.#drop(id)),
      session.on('role', () => { for (const id of [...this.bufs.keys()]) this.#drop(id); }),
    ];
  }
  #drop(id) { this.bufs.delete(id); const t = this.tags.get(id); t?.parent?.remove(t); this.tags.delete(id); }
  update(dt, local) {
    this.acc += dt;
    if (this.acc >= 1 / this.rate) {
      this.acc = Math.min(this.acc - 1 / this.rate, 1 / this.rate);
      if (this.session.members.length > 1) this.session.send(MSG.TP, encodeTown(local, nowS()));
    }
  }
  /** Ids der anderen Mitglieder, von denen Daten da sind. */
  remotes() { return [...this.bufs.keys()]; }
  /** → { x,y,z,rot,anim,speed } (interpoliert) oder null */
  sample(id) {
    const sm = this.bufs.get(id)?.sample(nowS());
    return sm ? { ...sm.s, anim: sm.cur.anim, emote: sm.cur.emote, emoteN: sm.cur.emoteN, color: sm.cur.color, weapon: sm.cur.weapon, gear: sm.cur.gear } : null; // [T] discrete fields from the snapshot
  }
  /** Namensschild über einem Rig-Root anbringen (einmalig je Mitglied). */
  attach(id, root) {
    if (this.tags.has(id)) return this.tags.get(id);
    const m = this.session.member(id);
    const tag = nameTag(m?.name ?? id);
    root.add(tag);
    this.tags.set(id, tag);
    return tag;
  }
  dispose() { for (const f of this.offs) f(); this.offs = []; }
}
