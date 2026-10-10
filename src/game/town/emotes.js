// GDD 13: six quick emotes. Ids on the wire are 1..6 (0 = none).
export const EMOTES = ['Hilfe!', 'Hier!', 'Falle!', 'Danke', 'Los!', 'Oops'];
export const EMOTE_SECS = 2;
/** index (0..5) -> wire id */
export const emoteWire = (i) => (i >= 0 && i < EMOTES.length ? i + 1 : 0);
/** wire id -> text or null */
export const emoteText = (id) => EMOTES[id - 1] ?? null;
