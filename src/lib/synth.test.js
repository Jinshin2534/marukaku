import { describe, it, expect } from 'vitest';
import { synthCircle } from './synth.js';

describe('synthCircle', () => {
  it('同じシードなら同じ軌跡', () => {
    expect(synthCircle({ noise: 5, seed: 7 })).toEqual(synthCircle({ noise: 5, seed: 7 }));
    expect(synthCircle({ noise: 5, seed: 7 })).not.toEqual(synthCircle({ noise: 5, seed: 8 }));
  });
  it('ノイズなしなら全点が半径ちょうど、時刻は 0 から所要時間まで', () => {
    const pts = synthCircle({ cx: 10, cy: 20, r: 50, durationMs: 900 });
    for (const p of pts) expect(Math.hypot(p.x - 10, p.y - 20)).toBeCloseTo(50, 9);
    expect(pts[0].t).toBe(0);
    expect(pts[pts.length - 1].t).toBe(900);
  });
});
