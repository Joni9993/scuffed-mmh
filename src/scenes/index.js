// Scene registry. A scene = { enter(app, opts), exit(), update(dt), render(alpha) }.
// Add hub / lobby / results by adding ONE line here and calling app.goto('<name>', opts).
import { titleScene } from './title.js';
import { huntScene } from './hunt.js';

export const scenes = {
  title: titleScene,
  hunt: huntScene,
  // hub: hubScene, lobby: lobbyScene, results: resultsScene,
};
