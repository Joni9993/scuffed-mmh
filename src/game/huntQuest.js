import { getQuest } from '../data/quests.js';
import { glitchQuest } from '../data/glitchTiers.js';

/** Scene options contain a weapon tier as well as a hunt difficulty; only glitchTier selects rules. */
export function resolveHuntQuest(opts = {}) {
  return glitchQuest(getQuest(opts.quest ?? 'jaggo'), { ...opts, tier: opts.glitchTier ?? 0 });
}
