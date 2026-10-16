import { describe, it, expect } from 'vitest';
import { fitCircle, fitCircleAlgebraic } from './fit.js';
import { synthCircle } from './synth.js';

describe('fitCircle', () => {
  it('完全な円の中心と半径をそのまま返す', () => {
    const f = fitCircle(synthCircle({ cx: 310, cy: -40, r: 87 }));
    expect(f.cx).toBeCloseTo(310, 6);
    expect(f.cy).toBeCloseTo(-40, 6);
    expect(f.r).toBeCloseTo(87, 6);
    expect(f.rms).toBeLessThan(1e-6);
  });

  it('半周の弧でも中心と半径を当てる', () => {
    const f = fitCircle(synthCircle({ cx: 0, cy: 0, r: 50, sweepDeg: 180 }));
    expect(f.cx).toBeCloseTo(0, 5);
    expect(f.cy).toBeCloseTo(0, 5);
    expect(f.r).toBeCloseTo(50, 5);
  });

  it('ぶれのある円では rms がぶれの大きさ程度になる', () => {
    const f = fitCircle(synthCircle({ r: 150, noise: 6, n: 400, seed: 3 }));
    expect(f.r).toBeGreaterThan(145);
    expect(f.r).toBeLessThan(155);
    expect(f.rms).toBeGreaterThan(3);
    expect(f.rms).toBeLessThan(9);
  });

  it('幾何的フィットは代数的フィット以下の残差になる(偏った弧)', () => {
    const pts = synthCircle({ r: 100, sweepDeg: 120, noise: 4, seed: 9 });
    const alg = fitCircleAlgebraic(pts);
    const geo = fitCircle(pts);
    const rms = (c) => Math.sqrt(pts.reduce((s, p) => s + (Math.hypot(p.x - c.cx, p.y - c.cy) - c.r) ** 2, 0) / pts.length);
    expect(geo.rms).toBeLessThanOrEqual(rms(alg) + 1e-9);
  });

  it('一直線や点が足りないときは null', () => {
    expect(fitCircle([{ x: 0, y: 0 }, { x: 1, y: 1 }])).toBeNull();
    const line = Array.from({ length: 20 }, (_, i) => ({ x: i, y: 2 * i }));
    expect(fitCircleAlgebraic(line)).toBeNull();
  });

  it('平行移動しても半径は変わらない(大きな座標でも安定)', () => {
    const a = fitCircle(synthCircle({ cx: 0, cy: 0, r: 80, noise: 3, seed: 5 }));
    const b = fitCircle(synthCircle({ cx: 1e5, cy: 1e5, r: 80, noise: 3, seed: 5 }));
    expect(b.r).toBeCloseTo(a.r, 4);
  });
});
