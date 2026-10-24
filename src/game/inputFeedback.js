import { canRoll } from './vitals.js';

export const INPUT_NOTICES = {
  stamina: 'Zu wenig Puste', recovery: 'Noch in der Bewegung', item: 'Item erst fertig benutzen', pinned: 'Gerade festgehalten', down: 'Noch am Aufstehen', ko: 'Erst wieder aufrappeln', target: 'Kein Brocken in Reichweite', energy: 'Glitch noch nicht geladen', timing: 'Noch nicht bereit',
};
export function rollBlockReason(p) {
  if (p.state === 'ko') return 'ko';
  if (p.state === 'pinned') return 'pinned';
  if (p.state === 'down') return 'down';
  if (!canRoll(p.v)) return 'stamina';
  if (p.itemUse) return 'item';
  if (p.state !== 'free' || !p.weapon.canRollCancel()) return 'recovery';
  return 'timing';
}
export function blockedInput(player, action, reason) {
  if (player.local) player.ctx.bus?.emit('inputBlocked', { player, action, reason });
}
export function specialHint(p) {
  if (!(p?.weapon?.wucht >= 100)) return '';
  return ['gs', 'bow'].includes(p.weaponId) ? 'Finisher · Tipp' : 'Finisher · halten';
}
