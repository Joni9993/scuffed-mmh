import { time } from './time.js';

export const DT = 1 / 60;

/**
 * Fixed 60 Hz simulation with variable-rate rendering.
 * update(dt) gets DT * time.scale (slow-mo); render(alpha) once per frame.
 */
export function createLoop({ update, render, maxSteps = 6 }) {
  let acc = 0, last = 0, raf = 0, running = false;
  const frame = (now) => {
    if (!running) return;
    raf = requestAnimationFrame(frame);
    const real = Math.min(0.25, (now - last) / 1000);
    last = now;
    time.tick(real);
    acc += real;
    let steps = 0;
    while (acc >= DT && steps < maxSteps) {
      update(DT * time.scale);
      acc -= DT;
      steps++;
    }
    if (steps === maxSteps) acc = 0;
    render(acc / DT);
  };
  return {
    start() {
      if (running) return;
      running = true;
      last = performance.now();
      raf = requestAnimationFrame(frame);
    },
    stop() { running = false; cancelAnimationFrame(raf); },
    /** Deterministic stepping for tests: n sim steps at scale 1, then a render. */
    step(n = 1) {
      for (let i = 0; i < n; i++) { time.tick(DT); update(DT * time.scale); }
      render(0);
    },
  };
}
