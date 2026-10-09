// Scene registry. A scene = { enter(app, opts), exit(), update(dt), render(alpha) }.
// Add lobby by adding ONE line here and calling app.goto('<name>', opts).
import { titleScene } from './title.js';
import { huntScene } from './hunt.js';
import { hubScene } from './hub.js'; // [P]
import { resultsScene } from './results.js'; // [P]
import { lobbyScene } from './lobby.js'; // [N]

export const scenes = {
  title: titleScene,
  hunt: huntScene,
  hub: hubScene, // [P]
  results: resultsScene, // [P]
  lobby: lobbyScene, // [N]
};
