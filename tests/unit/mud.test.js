import { describe, it, expect, beforeEach } from 'vitest';
import { Player } from '../../src/game/player.js';
import { createBus } from '../../src/core/events.js';
import { createInput } from '../../src/input/input.js';
import { createRng } from '../../src/core/rng.js';
import { time } from '../../src/core/time.js';

const DT = 1 / 60;
function run(ground, seconds = 2) {
  const ctx = {
    world: { heightAt: () => 0, collide: () => {}, groundType: () => ground },
    monsters: [], players: [], bus: createBus(), input: createInput(), rng: createRng(1), cameraYaw: 0,
    fx: { number() {}, spark() {}, shake() {}, flash() {}, glitch() {} }, playerHit() {}, respawn() {},
  };
  const p = new Player({ ctx });
  p.spawnAt(0, 0, 0);
  ctx.players.push(p);
  ctx.input.setStick(0, 1, 't');
  let sprinted = false;
  for (let i = 0; i < Math.round(seconds / DT); i++) { ctx.input.poll(DT); p.update(DT); sprinted ||= p.sprinting; }
  return { p, sprinted };
}
beforeEach(() => time.reset());

describe('Schlamm slows the Pirscher', () => {
  it('on grass a full push ends in a sprint; in mud there is no sprint and the speed is 70 % of running', () => {
    const grass = run('grass');
    expect(grass.sprinted).toBe(true);
    const mud = run('mud');
    expect(mud.sprinted).toBe(false);
    expect(mud.p.speed).toBeCloseTo(6 * 0.7, 1);
  });
  it('worlds without groundType (test arena, old mocks) behave as before', () => {
    const ctx = { world: { heightAt: () => 0, collide: () => {} } };
    expect(ctx.world.groundType?.(0, 0)).toBeUndefined();
  });
});
