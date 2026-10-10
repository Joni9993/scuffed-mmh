import { describe, it, expect } from 'vitest';
import { prettyAttack, createDeathlog, DEATHLOG_CAP, DEATHLOG_KEY } from '../../src/meta/deathlog.js';

const mem = () => { const d = {}; return { d, getItem: (k) => d[k] ?? null, setItem: (k, v) => { d[k] = v; } }; };

describe('deathlog', () => {
  it('normalisiert alte Projektil-Keys beim Laden und beim Erfassen', () => {
    const st = mem();
    st.d[DEATHLOG_KEY] = JSON.stringify([{ m: 'brathalos', a: 'feuerteppich@415.35:t2', n: 3, q: 1 }, { m: 'brathalos', a: 'brathalos_feuerteppich', n: 2, q: 0 }, { m: 'barrotz', a: 'spritzer@12:m0', n: 1, q: 0 }]);
    const dl = createDeathlog(() => st);
    expect(dl.all().find((e) => e.a === 'brathalos_feuerteppich')).toMatchObject({ n: 5, q: 1 });
    expect(dl.all().some((e) => e.a === 'barrotz_spritzer')).toBe(true);
    dl.record('brathalos', 'brathalos_feuer@1.5:f0');
    expect(dl.all().some((e) => e.a === 'brathalos_feuer')).toBe(true);
    expect(prettyAttack('brathalos_flammenstoss')).toBe('Flammenstoß');
    expect(prettyAttack('x_foo_bar')).toBe('Foo bar');
  });
  it('zaehlt, sortiert, persistiert', () => {
    const st = mem(), dl = createDeathlog(() => st);
    dl.record('jaggo', 'biss'); dl.record('jaggo', 'biss', true); dl.record('barrotz', 'stampf');
    expect(dl.top(5)[0]).toMatchObject({ a: 'biss', n: 2, q: 1 });
    const dl2 = createDeathlog(() => st);
    expect(dl2.top(1)[0].n).toBe(2);
    expect(dl2.exportText()).toContain('jaggo\tBiss\t2\t1');
  });
  it('Cap 200', () => {
    const st = mem(), dl = createDeathlog(() => st);
    for (let i = 0; i < 250; i++) dl.record('m', 'a' + i);
    expect(dl.all().length).toBeLessThanOrEqual(DEATHLOG_CAP);
    expect(JSON.parse(st.d[DEATHLOG_KEY]).length).toBeLessThanOrEqual(DEATHLOG_CAP);
  });
  it('kaputter Storage crasht nicht', () => {
    const dl = createDeathlog(() => { throw new Error('x'); });
    dl.record('m', 'a'); expect(dl.top().length).toBe(1);
    expect(createDeathlog(() => ({ getItem: () => '{kaputt' })).top()).toEqual([]);
  });
});
