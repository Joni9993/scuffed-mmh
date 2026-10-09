import { Hunt } from '../game/hunt.js';

/** Scene wrapper: enter(app, opts) builds a Hunt, exit() disposes it. */
export const huntScene = {
  hunt: null,
  enter(app, opts) { this.hunt = new Hunt(app, opts); return this.hunt; },
  exit() { this.hunt?.dispose(); this.hunt = null; },
  update(dt) { this.hunt?.update(dt); },
  render(alpha) { this.hunt?.render(alpha); },
};
