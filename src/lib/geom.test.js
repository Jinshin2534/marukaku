import { describe, it, expect } from 'vitest';
import { pathLength, resampleByArcLength, unwrappedAngles, dedupe } from './geom.js';

describe('geom', () => {
  it('pathLength は折れ線の長さ', () => {
    expect(pathLength([{ x: 0, y: 0 }, { x: 3, y: 4 }, { x: 3, y: 10 }])).toBe(11);
  });

  it('resample は端点を保ち等間隔に並べる', () => {
    const pts = [{ x: 0, y: 0, t: 0 }, { x: 1, y: 0, t: 10 }, { x: 10, y: 0, t: 20 }];
    const r = resampleByArcLength(pts, 11);
    expect(r).toHaveLength(11);
    r.forEach((p, i) => expect(p.x).toBeCloseTo(i, 9));
    expect(r[1].t).toBeCloseTo(10, 9);
    expect(r[10].t).toBe(20);
  });

  it('unwrappedAngles は向きによらず正に増え、一周で 2π', () => {
    const cw = Array.from({ length: 41 }, (_, i) => ({ x: Math.cos(i * Math.PI / 20), y: Math.sin(i * Math.PI / 20) }));
    const ccw = cw.map((p) => ({ x: p.x, y: -p.y }));
    for (const pts of [cw, ccw]) {
      const a = unwrappedAngles(pts, 0, 0);
      expect(a[a.length - 1]).toBeCloseTo(2 * Math.PI, 9);
      expect(a[10]).toBeCloseTo(Math.PI / 2, 9);
    }
  });

  it('dedupe は同じ位置の連続点を落とす', () => {
    expect(dedupe([{ x: 0, y: 0 }, { x: 0.1, y: 0 }, { x: 2, y: 0 }])).toHaveLength(2);
  });
});
