import { EventEmitter } from 'node:events';

/** Fault-injectable signaling/DataChannel simulator; production Net/Session code is left intact. */
export class FakePeer extends EventEmitter {
  static peers = new Map(); static n = 0; static blocked = false;
  constructor(id) {
    super(); this.id = id ?? `anon-${++FakePeer.n}`; this.open = false; this.destroyed = false; this.disconnected = false; this.connections = new Set();
    setTimeout(() => {
      if (this.destroyed) return;
      if (FakePeer.peers.has(this.id)) { this.emit('error', { type: 'unavailable-id' }); return; }
      FakePeer.peers.set(this.id, this); this.open = true; this.emit('open', this.id);
    }, 1);
  }
  connect(id) {
    const conn = new FakeConnection(); this.connections.add(conn);
    setTimeout(() => {
      const target = FakePeer.peers.get(id);
      if (!target || target.destroyed || FakePeer.blocked) { this.emit('error', { type: 'peer-unavailable' }); return; }
      const other = new FakeConnection(); conn.other = other; other.other = conn; target.connections.add(other);
      target.emit('connection', other); conn.open = other.open = true; conn.emit('open'); other.emit('open');
    }, 1);
    return conn;
  }
  reconnect() { this.disconnected = false; setTimeout(() => this.emit('open', this.id), 1); }
  destroy() {
    if (this.destroyed) return; this.destroyed = true; this.open = false;
    if (FakePeer.peers.get(this.id) === this) FakePeer.peers.delete(this.id);
    for (const conn of this.connections) conn.close(); this.emit('close');
  }
  static reset() { for (const p of this.peers.values()) p.destroy(); this.peers.clear(); this.n = 0; this.blocked = false; }
}
class FakeConnection extends EventEmitter {
  constructor() { super(); this.open = false; this.sent = []; this.bufferSize = 0; this.dataChannel = { bufferedAmount: 0 }; }
  send(data) { if (!this.open) throw Error('closed channel'); this.sent.push(data); const copy = JSON.parse(JSON.stringify(data)); setTimeout(() => { if (this.other?.open) this.other.emit('data', copy); }, 1); }
  close() { if (!this.open) return; this.open = false; this.emit('close'); if (this.other?.open) { this.other.open = false; this.other.emit('close'); } }
}

export function memoryStorage() { const map = new Map(); return { getItem: k => map.get(k) ?? null, setItem: (k, v) => map.set(k, String(v)), removeItem: k => map.delete(k), clear: () => map.clear() }; }
