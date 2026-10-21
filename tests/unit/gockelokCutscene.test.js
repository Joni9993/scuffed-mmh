import { afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { CINE_LEN, cineShot, tickCine, endCine } from '../../src/game/monsters/gockelokCutscene.js';

afterEach(() => vi.unstubAllGlobals());
function setup({ seen = false, coop = false, authority = true } = {}) {
  const store = new Map(seen ? [['sh.gockelok.cineSeen', '1']] : []);
  vi.stubGlobal('localStorage', { getItem: key => store.get(key), setItem: (key, value) => store.set(key, value) });
  const p = { local: true, pos: new THREE.Vector3(0, 0, 8), rot: 0, invuln: 0 };
  const ctx = { players: [p], player: p, world: { heightAt: () => 3 }, scene: new THREE.Scene(),
    rig: { cine: null, snap: vi.fn() }, hud: { cinema: vi.fn() }, bus: { emit: vi.fn() },
    input: { b: { context: { pressed: false } } }, net: coop ? {} : null,
    app: { touch: { setVisible: vi.fn() } }, fx: { spark: vi.fn(), shake: vi.fn(), glitch: vi.fn(), flash: vi.fn() } };
  const m = { id: 'boss', ctx, authority, alive: true, gockelForm: 'reveal', formTime: 0, rot: 0,
    pos: new THREE.Vector3(), revealPos: { x: 5, z: 6 }, nodes: { head: new THREE.Group() } };
  return { m, ctx, p, store };
}

describe('optional local Gockelok cinematic', () => {
  it('keeps preview completion in memory without reading or writing saved viewing progress', () => {
    const { m, ctx, store } = setup({ seen: true }); ctx.gockelokPreview = true;
    const read = vi.spyOn(globalThis.localStorage, 'getItem'), write = vi.spyOn(globalThis.localStorage, 'setItem');
    tickCine(m, 1 / 60);
    expect(m.cine.skippable).toBe(false);
    m.formTime = CINE_LEN - .8; tickCine(m, 1 / 60); endCine(m);
    expect(ctx.gockelokPreviewSeen).toBe(true); expect(read).not.toHaveBeenCalled(); expect(write).not.toHaveBeenCalled();
    expect(store.get('sh.gockelok.cineSeen')).toBe('1');
    m.formTime = 0; tickCine(m, 1 / 60); expect(m.cine.skippable).toBe(true); endCine(m);
  });
  it('protects first viewing, saves completion, and releases input, HUD and GPU resources on exit', () => {
    const { m, ctx, p, store } = setup(), skip = vi.fn();
    tickCine(m, 1 / 60, skip);
    expect(ctx.cineLock).toBe(true); expect(p.invuln).toBe(.5);
    const glow = m.cine.glow, disposeGeo = vi.spyOn(glow.geometry, 'dispose'), disposeMat = vi.spyOn(glow.material, 'dispose');
    m.formTime = 1; ctx.input.b.context.pressed = true; tickCine(m, 1 / 60, skip);
    expect(skip).not.toHaveBeenCalled(); expect(ctx.cineLock).toBe(true);
    ctx.input.b.context.pressed = false; m.formTime = CINE_LEN - .8; tickCine(m, 1 / 60, skip);
    expect(store.get('sh.gockelok.cineSeen')).toBe('1');
    m.gockelForm = 'eye'; tickCine(m, 1 / 60, skip);
    expect(ctx.cineLock).toBe(false); expect(ctx.rig.cine).toBeNull(); expect(ctx.hud.cinema).toHaveBeenLastCalledWith(null);
    expect(disposeGeo).toHaveBeenCalledOnce(); expect(disposeMat).toHaveBeenCalledOnce();
    expect(ctx.app.touch.setVisible).toHaveBeenLastCalledWith(true);
    endCine(m); expect(disposeGeo).toHaveBeenCalledOnce();
  });
  it('lets repeat solo viewings skip, while a coop guest only releases its own camera', () => {
    for (const coop of [false, true]) {
      const { m, ctx } = setup({ seen: true, coop, authority: !coop }), skip = vi.fn(() => { m.gockelForm = 'eye'; });
      tickCine(m, 1 / 60, skip); m.formTime = 1; ctx.input.b.context.pressed = true; tickCine(m, 1 / 60, skip);
      expect(skip).toHaveBeenCalledTimes(coop ? 0 : 1); expect(ctx.cineLock).toBe(false);
      expect(m.gockelForm).toBe(coop ? 'reveal' : 'eye');
    }
  });
  it('uses the synchronized fall position and snaps only when a camera shot changes', () => {
    const { m } = setup(); m.cine = {};
    for (const t of [0, 2.3, 4.3, 6.5]) {
      const first = cineShot(m, t), next = cineShot(m, t + .01);
      expect(first.snap).toBe(true); expect(next.snap).toBe(false); expect(first.owner).toBe(m.id);
      for (const point of [first.pos, first.look]) for (const value of Object.values(point)) expect(Number.isFinite(value)).toBe(true);
      expect(first.look.x).toBe(5); expect(first.look.z).toBe(6); expect(first.pos.y).toBeGreaterThanOrEqual(4);
    }
  });
});
