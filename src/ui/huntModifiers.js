import { MUTATORS } from '../data/mutators.js';
import { esc } from './hubKit.js';

/** Read-only rules panel; uses the resolved hunt, including fixed and weekly modifiers. */
export function createHuntModifiers(ctx) {
  return {
    render() {
      const { quest, ids, timeLimit, coop } = ctx.adapter;
      const label = quest.glitchTier ? `Glitch-Stufe ${quest.glitchTier}` : quest.weekly ? 'Wochen-Glitch' : 'Mutatoren';
      return `<div class="fi-h"><b>${esc(label)}</b></div><p>${esc(quest.name)}</p>
        <div class="note">Diese Regeln gelten für diese Jagd gleichzeitig. Zeitlimit: ${Math.floor(timeLimit / 60)}:${String(Math.floor(timeLimit % 60)).padStart(2, '0')}.${coop ? ' Die Jagd läuft im Mehrspielermodus weiter.' : ' Die Jagd pausiert, während du hier liest.'}</div>
        <dl class="modifier-rules">${ids.map(id => MUTATORS[id]).filter(Boolean).map(m => `<div><dt>${esc(m.name)}</dt><dd>${esc(m.desc)}</dd></div>`).join('')}</dl>`;
    },
    click() { return false; },
  };
}
