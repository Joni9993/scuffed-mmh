/** Tiny event bus. Events: hit, partBreak, monsterState, playerDown, glitchCounter, itemUsed, gathered, carved, questComplete, questFailed, sfx ... */
export function createBus() {
  const map = new Map();
  return {
    on(type, fn) {
      if (!map.has(type)) map.set(type, new Set());
      map.get(type).add(fn);
      return () => map.get(type)?.delete(fn);
    },
    off(type, fn) { map.get(type)?.delete(fn); },
    emit(type, payload) {
      const set = map.get(type);
      if (set) for (const fn of [...set]) fn(payload, type);
      const any = map.get('*');
      if (any) for (const fn of [...any]) fn(payload, type);
    },
    clear() { map.clear(); },
  };
}
/** App-wide bus (menus, audio). A hunt gets its own bus via createBus(). */
export const appBus = createBus();
