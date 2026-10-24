import { MSG } from './protocol.js';
import { randomToken } from './resumeIdentity.js';

/** Small, expiring in-memory mailbox: the hunt host may already be on its results screen. */
export function installCompletedResume(session) {
  session.on(MSG.SYNC, (d, from) => {
    const entry = session.completedHunts?.get(d?.round);
    if (!entry || Date.now() > entry.until || d._hunt !== d.round || !entry.members.includes(from) || session.member(from)?.online === false) return;
    const send = payload => session.send(MSG.SYNC, { ...payload, round: d.round, _hunt: d.round }, [from]);
    if (d.a === 'request') {
      const nonce = entry.nonces.get(from) ?? randomToken(); entry.nonces.set(from, nonce);
      send({ a: 'offer', nonce, state: entry.state, personal: entry.personal.get(from) });
    }
    if (d.a === 'ack' && entry.nonces.get(from) === d.nonce) {
      send({ a: 'activate', nonce: d.nonce, state: entry.state, personal: entry.personal.get(from) });
      entry.nonces.delete(from);
    }
  });
}
