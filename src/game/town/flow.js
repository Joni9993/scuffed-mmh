// Entry flow of the town (pure, unit-tested): title -> (name) -> room choice -> connecting -> town.
export const FLOW = { NAME: 'name', CHOICE: 'choice', JOIN: 'join', CONNECTING: 'connecting', TOWN: 'town' };

/**
 * First state when the hub scene is entered.
 *  entered: the player is already in the town session (coming back from a hunt)  mode: debug 'solo'|'host'|'join'
 */
export function flowStart({ nameSet = true, entered = false, mode = null } = {}) {
  if (entered) return FLOW.TOWN;
  if (mode === 'solo') return FLOW.TOWN;
  if (mode === 'host' || mode === 'join') return FLOW.CONNECTING;
  return nameSet ? FLOW.CHOICE : FLOW.NAME;
}

/**
 * Events: nameDone | solo | host | joinPrompt | join (code) | ok | fail | back
 * Returns the next state (unchanged for events that make no sense in the current state).
 */
export function flowNext(state, ev) {
  switch (state) {
    case FLOW.NAME: return ev === 'nameDone' ? FLOW.CHOICE : state;
    case FLOW.CHOICE:
      if (ev === 'solo') return FLOW.TOWN;
      if (ev === 'host') return FLOW.CONNECTING;
      if (ev === 'joinPrompt') return FLOW.JOIN;
      return state;
    case FLOW.JOIN:
      if (ev === 'join') return FLOW.CONNECTING;
      if (ev === 'back') return FLOW.CHOICE;
      if (ev === 'solo') return FLOW.TOWN;
      return state;
    case FLOW.CONNECTING:
      if (ev === 'ok') return FLOW.TOWN;
      if (ev === 'fail') return FLOW.CHOICE;
      return state;
    default: return state;
  }
}

/**
 * Scenes are singletons: exit() flags the scene dead / "hunt starting", enter() MUST clear both again, otherwise a panel's
 * onClose bails out (touch controls never come back) and board starts are ignored after returning from a hunt.
 */
export function resetLifecycle(scene) { scene.dead = false; scene.starting = false; return scene; }
