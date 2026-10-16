import { describe, it, expect } from 'vitest';
import { scoreCircle, curve, tierOf, clockHour, trimToOneTurn, ROUND_SCALE } from './score.js';
import { synthCircle } from './synth.js';
import { unwrappedAngles } from './geom.js';

const score = (o) => scoreCircle(synthCircle({ r: 120, seed: 4, ...o }));

describe('点数曲線', () => {
  it('0 で 100 点、scale で 50 点、単調に下がる', () => {
    expect(curve(0, 0.1)).toBe(100);
    expect(curve(0.1, 0.1)).toBeCloseTo(50, 9);
    let prev = 101;
    for (let x = 0; x <= 1; x += 0.01) {
      const v = curve(x, ROUND_SCALE);
      expect(v).toBeLessThan(prev);
      prev = v;
    }
  });
  it('多少いびつでも 0 点にはならない(ゲームとして気持ちよく)', () => {
    expect(curve(0.3, ROUND_SCALE)).toBeGreaterThan(9);
  });
  it('称号は点数のしきい値で決まる', () => {
    expect(tierOf(100)).toBe('神の円');
    expect(tierOf(92)).toBe('達人');
    expect(tierOf(0)).toBe('それは円？');
  });
});

describe('scoreCircle: 採点の手応え', () => {
  it('完全な円は 100 点', () => {
    const s = score({});
    expect(s.ok).toBe(true);
    expect(s.total).toBe(100);
    expect(s.tier).toBe('神の円');
  });

  it('ていねいな手描き(ばらつき約2.5%)は 90 点台', () => {
    const s = score({ noise: 2.4 });
    expect(s.total).toBeGreaterThanOrEqual(90);
    expect(s.total).toBeLessThan(100);
  });

  it('ふつうの手描き(約6%)は 70〜85 点。厳しすぎない', () => {
    const s = score({ noise: 6 });
    expect(s.total).toBeGreaterThan(70);
    expect(s.total).toBeLessThan(85);
  });

  it('ぶれが増えるほど点が下がる', () => {
    const totals = [0, 2, 4, 8, 16].map((noise) => score({ noise }).total);
    for (let i = 1; i < totals.length; i++) expect(totals[i]).toBeLessThan(totals[i - 1]);
  });

  it('楕円は潰れるほど点が下がり、楕円と診断される', () => {
    const a = score({ rx: 132, ry: 108 });
    const b = score({ rx: 150, ry: 90 });
    expect(a.total).toBeGreaterThan(b.total);
    expect(b.shape.kind).toBe('ellipse');
    expect(b.shape.direction).toBe('横長');
    expect(score({ rx: 90, ry: 150 }).shape.direction).toBe('縦長');
    expect(score({ rx: 150, ry: 90, tilt: Math.PI / 4 }).shape.direction).toBe('右下がりの斜め');
  });

  it('ガタつき(高い周波数のぶれ)は楕円とは言わない', () => {
    expect(score({ noise: 10 }).shape.kind).toBe('wobble');
  });

  it('始点と終点のずれは closure だけを下げ、roundness は保つ', () => {
    const tidy = score({});
    const gap = score({ sweepDeg: 330 });
    expect(gap.roundness.score).toBeCloseTo(tidy.roundness.score, 1);
    expect(gap.closure.score).toBeLessThan(40);
    expect(gap.closure.sweptDeg).toBeCloseTo(330, 0);
    expect(gap.total).toBeLessThan(tidy.total);
  });

  it('終点が内側に入り込む(らせん気味)と closure が下がる', () => {
    const s = score({ endRadiusDelta: -30 });
    expect(s.closure.gapPx).toBeGreaterThan(20);
    expect(s.closure.score).toBeLessThan(score({ endRadiusDelta: -5 }).closure.score);
  });

  it('一周を超えたぶんは切り落として採点し、その量を返す', () => {
    const s = score({ sweepDeg: 420 });
    expect(s.total).toBe(100);
    expect(s.overshootDeg).toBeCloseTo(60, 0);
    expect(s.closure.sweptDeg).toBeCloseTo(360, 3);
  });

  it('向き・位置・大きさを変えても同じ点', () => {
    const base = score({ noise: 5 }).total;
    expect(score({ noise: 5, cx: 900, cy: 40 }).total).toBeCloseTo(base, 6);
    expect(scoreCircle(synthCircle({ r: 240, noise: 10, seed: 4 })).total).toBeCloseTo(base, 1);
  });

  it('時計回りでも反時計回りでも同じ点', () => {
    const cw = score({ noise: 5 });
    const ccw = score({ noise: 5, ccw: true });
    expect(ccw.ok).toBe(true);
    expect(Math.abs(ccw.total - cw.total)).toBeLessThan(3);
  });

  it('描く速さのむらで点が変わらない(弧長で取り直しているため)', () => {
    const even = score({ noise: 5, n: 400 });
    const uneven = score({ noise: 5, n: 400, speedWave: 0.8 });
    expect(Math.abs(uneven.total - even.total)).toBeLessThan(1.5);
  });

  it('描き始めの角度によらない', () => {
    expect(score({ start: 1.3 }).total).toBe(100);
  });
});

describe('scoreCircle: 測れないときは点をつけない', () => {
  it('点が少ない', () => {
    expect(scoreCircle(synthCircle({ n: 8 })).reason).toBe('too-few');
  });
  it('線が短い', () => {
    expect(scoreCircle(synthCircle({ r: 15 })).reason).toBe('too-short');
  });
  it('一直線は円ではない', () => {
    const line = Array.from({ length: 50 }, (_, i) => ({ x: i * 6, y: i * 3 + 0.01 * i * i }));
    const s = scoreCircle(line);
    expect(s.ok).toBe(false);
    expect(s.reason).toBe('not-circle');
  });
  it('半周の弧は一周ではない', () => {
    const s = score({ sweepDeg: 200 });
    expect(s.reason).toBe('not-closed');
    expect(s.message).toMatch(/一周/);
  });
  it('小さすぎる円', () => {
    const s = scoreCircle(synthCircle({ r: 26, sweepDeg: 400, n: 120 }));
    expect(s.reason).toBe('too-small');
  });
  it('行ったり来たりの往復は採点しない', () => {
    const fwd = synthCircle({ sweepDeg: 360, n: 60 });
    const zig = [];
    // 少し進んでは戻る、を繰り返す
    for (let i = 0; i + 6 < fwd.length; i += 3) zig.push(...fwd.slice(i, i + 6), ...fwd.slice(i + 1, i + 5).reverse());
    expect(scoreCircle(zig).reason).toBe('scribble');
  });
  it('理由には人に読めるメッセージがつく', () => {
    expect(scoreCircle([]).message).toBeTruthy();
  });
});

describe('補助関数', () => {
  it('clockHour: 画面座標の向きを時計の何時に', () => {
    expect(clockHour(0)).toBe(3);
    expect(clockHour(Math.PI / 2)).toBe(6);
    expect(clockHour(Math.PI)).toBe(9);
    expect(clockHour(-Math.PI / 2)).toBe(12);
  });
  it('trimToOneTurn: ちょうど一周の位置で切る', () => {
    const pts = synthCircle({ cx: 0, cy: 0, r: 10, sweepDeg: 450, start: 0 });
    const t = trimToOneTurn(pts, unwrappedAngles(pts, 0, 0));
    const last = t[t.length - 1];
    expect(last.x).toBeCloseTo(10, 1);
    expect(last.y).toBeCloseTo(0, 1);
  });
  it('diagnose: 一番外れた方向を時計で返す', () => {
    // 3時の方向だけ外にふくらんだ円
    const pts = synthCircle({ r: 120, n: 360, start: 0 }).map((p) => {
      const th = Math.atan2(p.y - 200, p.x - 200);
      const bump = 15 * Math.exp(-((th / 0.25) ** 2));
      return { ...p, x: p.x + bump * Math.cos(th), y: p.y + bump * Math.sin(th) };
    });
    const s = scoreCircle(pts);
    expect(s.shape.worstSpot.clock).toBe(3);
    expect(s.shape.worstSpot.bulge).toBe(true);
  });
});
