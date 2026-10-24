/** Informational text is not a damage number and must survive the damage-number preference. */
export function showNumber(text, remote, mode) {
  if (typeof text !== 'number' && !/^\d+(\.\d+)?$/.test(String(text))) return true;
  return mode !== 'off' && mode !== false && (!remote || mode === 'all');
}
export function numberSlot(numbers, remote, prioritizeOwn) {
  let index = numbers.findIndex(n => n.age > 1);
  if (index >= 0) return index;
  const candidates = numbers.map((n, i) => ({ ...n, i })).filter(n => !prioritizeOwn || n.remote);
  if (!candidates.length) return remote && prioritizeOwn ? -1 : numbers.reduce((old, n, i) => n.age > numbers[old].age ? i : old, 0);
  return candidates.reduce((old, n) => n.age > old.age ? n : old).i;
}
