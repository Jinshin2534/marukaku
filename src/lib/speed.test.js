import { describe, it, expect } from 'vitest';
import { speedProfile, correlation, habitInsight, MIN_TRIES } from './speed.js';
import { synthCircle, mulberry32 } from './synth.js';

const C = { cx: 200, cy: 200 };

describe('speedProfile', () => {
  it('一定の速さならむら(CV)はほぼ 0、平均の速さは周長/時間', () => {
    const p = speedProfile(synthCircle({ r: 100, durationMs: 1000, n: 400 }), C);
    expect(p.cv).toBeLessThan(0.01);
    expect(p.mean).toBeCloseTo(2 * Math.PI * 100, -1);
    expect(p.relative.every((v) => Math.abs(v - 1) < 0.02)).toBe(true);
  });

  it('前半速く後半ゆっくりなら、速いのは前半・遅いのは後半', () => {
    const p = speedProfile(synthCircle({ r: 100, n: 400, speedWave: 0.7 }), C);
    expect(p.cv).toBeGreaterThan(0.3);
    expect(p.peakBin).toBeLessThan(p.bins / 2);
    expect(p.slowBin).toBeGreaterThanOrEqual(p.bins / 2);
  });

  it('時刻がない・時間が 0 のときは null', () => {
    const pts = synthCircle({});
    expect(speedProfile(pts.map(({ x, y }) => ({ x, y })), C)).toBeNull();
    expect(speedProfile(pts.map((p) => ({ ...p, t: 5 })), C)).toBeNull();
  });
});

describe('correlation', () => {
  it('完全な正・負の相関と、分散 0 の null', () => {
    expect(correlation([1, 2, 3], [2, 4, 6])).toBeCloseTo(1, 9);
    expect(correlation([1, 2, 3], [3, 2, 1])).toBeCloseTo(-1, 9);
    expect(correlation([1, 1, 1], [1, 2, 3])).toBeNull();
    expect(correlation([1, 2], [1, 2])).toBeNull();
  });
});

describe('habitInsight', () => {
  it(`${MIN_TRIES} 回たまるまでは言わない`, () => {
    const h = Array.from({ length: MIN_TRIES - 1 }, (_, i) => ({ total: 80 + i, cv: 0.2, durationMs: 1000 }));
    expect(habitInsight(h)).toEqual({ ready: false, need: 1 });
  });

  it('むらが小さいほど高得点なら「速さが一定なほど」と言う', () => {
    const rand = mulberry32(2);
    const h = Array.from({ length: 12 }, () => {
      const cv = rand() * 0.5;
      return { cv, total: 95 - cv * 60 + rand() * 3, durationMs: 1000 + rand() * 10 };
    });
    const r = habitInsight(h);
    expect(r.ready).toBe(true);
    expect(r.rCv).toBeLessThan(-0.8);
    expect(r.notes).toContain('速さが一定なほど点が高い');
  });

  it('関係が見えなければ何も言わない', () => {
    const h = [
      { total: 80, cv: 0.1, durationMs: 1000 }, { total: 80, cv: 0.3, durationMs: 1000 },
      { total: 90, cv: 0.1, durationMs: 1000 }, { total: 90, cv: 0.3, durationMs: 1000 },
      { total: 85, cv: 0.2, durationMs: 1000 }, { total: 85, cv: 0.2, durationMs: 1001 },
    ];
    expect(habitInsight(h).notes.filter((n) => n.includes('一定') || n.includes('メリハリ'))).toEqual([]);
  });
});
