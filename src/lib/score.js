// 真円度の採点。半径のばらつき(roundness)と、描き始め/描き終わりのずれ(closure)を分けて出す。
// 測れない入力には点数をつけず、理由を返す(正直さ)。

import { fitCircle, radialResiduals } from './fit.js';
import { dedupe, pathLength, resampleByArcLength, unwrappedAngles } from './geom.js';

export const LIMITS = {
  minPoints: 12,
  minLengthPx: 150,
  minRadiusPx: 30,
  minSweepDeg: 270,
  maxBacktrack: 0.2, // 逆回りした角度の合計 / 一周
};

// 点数曲線。x が scale のとき 50 点、0 で 100 点、なだらかに 0 へ近づく。
// 指数関数より裾が重いので、多少いびつでも 0 点にはならず、上位では差がちゃんと出る。
export function curve(x, scale) {
  return 100 / (1 + (x / scale) ** 2);
}
export const ROUND_SCALE = 0.1;  // 半径のばらつき 10% で 50 点
export const CLOSE_SCALE = 0.25; // 端のずれが半径の 25% で 50 点
export const WEIGHTS = { roundness: 0.75, closure: 0.25 };

export const TIERS = [
  [97, '神の円'],
  [92, '達人'],
  [85, 'うまい'],
  [75, 'なかなか'],
  [60, 'まる'],
  [40, 'いびつ'],
  [0, 'それは円？'],
];
export function tierOf(total) {
  return TIERS.find(([min]) => total >= min)[1];
}

const REASONS = {
  'too-few': '点が少なすぎて測れません。もう少しゆっくり、大きく描いてください。',
  'too-short': '線が短すぎます。ぐるっと一周描いてください。',
  'not-circle': '円には見えません。ぐるっと一周描いてください。',
  'not-closed': '一周の3/4に届いていません。ぐるっと一周してください。',
  'too-small': '円が小さすぎて、指のぶれと区別がつきません。もっと大きく。',
  'scribble': '行ったり来たりが多すぎます。一方向にぐるっと描いてください。',
};
const fail = (reason, extra = {}) => ({ ok: false, reason, message: REASONS[reason], ...extra });

/** 一周(2π)を超えたぶんを切り落とす。角度は unwrappedAngles の値。 */
export function trimToOneTurn(points, angles) {
  const k = angles.findIndex((a) => a >= 2 * Math.PI);
  if (k <= 0) return points.slice();
  const a = points[k - 1], b = points[k];
  const u = (2 * Math.PI - angles[k - 1]) / (angles[k] - angles[k - 1] || 1);
  const cut = {
    x: a.x + (b.x - a.x) * u,
    y: a.y + (b.y - a.y) * u,
    t: a.t != null && b.t != null ? a.t + (b.t - a.t) * u : undefined,
  };
  return [...points.slice(0, k), cut];
}

function backtrackRatio(angles) {
  let back = 0;
  for (let i = 1; i < angles.length; i++) {
    const d = angles[i] - angles[i - 1];
    if (d < 0) back -= d;
  }
  return back / (2 * Math.PI);
}

/** 画面座標(y下向き)の角度を時計の「何時」に。 */
export function clockHour(theta) {
  const deg = (theta * 180) / Math.PI; // 0 = 3時, 90 = 6時
  let h = Math.round(((deg + 90) / 30) % 12);
  if (h <= 0) h += 12;
  return h;
}

/**
 * 半径残差を角度で分解して、いびつさの正体を言葉にする。
 * 2倍周波数成分が強ければ「楕円」、そうでなければ最も外れた方向を指す。
 */
export function diagnose(points, fit, residuals) {
  const n = points.length;
  let a2 = 0, b2 = 0, ss = 0;
  let worst = 0;
  for (let i = 0; i < n; i++) {
    const th = Math.atan2(points[i].y - fit.cy, points[i].x - fit.cx);
    a2 += residuals[i] * Math.cos(2 * th);
    b2 += residuals[i] * Math.sin(2 * th);
    ss += residuals[i] * residuals[i];
    if (Math.abs(residuals[i]) > Math.abs(residuals[worst])) worst = i;
  }
  a2 *= 2 / n; b2 *= 2 / n;
  const amp = Math.hypot(a2, b2);
  const share = ss > 0 ? (amp * amp) / 2 / (ss / n) : 0; // k=2 成分が説明する分散の割合
  const flatness = (2 * amp) / fit.r; // おおよそ (長径-短径)/半径
  const thW = Math.atan2(points[worst].y - fit.cy, points[worst].x - fit.cx);
  const worstSpot = {
    index: worst,
    theta: thW,
    clock: clockHour(thW),
    bulge: residuals[worst] > 0, // true=ふくらみ / false=へこみ
    rel: Math.abs(residuals[worst]) / fit.r,
  };
  if (share > 0.5 && flatness > 0.04) {
    // 長軸の向き(画面上)。0=横, π/2=縦
    let axis = Math.atan2(b2, a2) / 2;
    axis = ((axis % Math.PI) + Math.PI) % Math.PI;
    const deg = (axis * 180) / Math.PI;
    const dir = deg < 22.5 || deg >= 157.5 ? '横長' : deg >= 67.5 && deg < 112.5 ? '縦長' : deg < 90 ? '右下がりの斜め' : '右上がりの斜め';
    return { kind: 'ellipse', direction: dir, axisDeg: deg, flatness, share, worstSpot };
  }
  return { kind: 'wobble', flatness, share, worstSpot };
}

/**
 * フリーハンドの軌跡を採点する。
 * @param {{x:number,y:number,t?:number}[]} raw 描いた順の点
 */
export function scoreCircle(raw) {
  const pts = dedupe(raw);
  if (pts.length < LIMITS.minPoints) return fail('too-few');
  if (pathLength(pts) < LIMITS.minLengthPx) return fail('too-short');

  // 一次フィット → 一周に切り詰め → 再フィット
  let fit = fitCircle(resampleByArcLength(pts, 200));
  if (!fit) return fail('not-circle');
  let angles = unwrappedAngles(pts, fit.cx, fit.cy);
  const swept0 = angles[angles.length - 1];
  if ((swept0 * 180) / Math.PI < 120) return fail('not-circle', { sweptDeg: (swept0 * 180) / Math.PI });
  if ((swept0 * 180) / Math.PI < LIMITS.minSweepDeg) {
    return fail('not-closed', { sweptDeg: (swept0 * 180) / Math.PI });
  }
  const trimmed = trimToOneTurn(pts, angles);
  const sample = resampleByArcLength(trimmed, 240);
  fit = fitCircle(sample) || fit;
  angles = unwrappedAngles(trimmed, fit.cx, fit.cy);
  const swept = angles[angles.length - 1];

  if (fit.r < LIMITS.minRadiusPx) return fail('too-small', { r: fit.r });
  if (backtrackRatio(angles) > LIMITS.maxBacktrack) return fail('scribble');
  if ((swept * 180) / Math.PI < LIMITS.minSweepDeg) {
    return fail('not-closed', { sweptDeg: (swept * 180) / Math.PI });
  }

  const sampleRes = radialResiduals(sample, fit);
  const dev = fit.rms / fit.r;
  const maxDev = Math.max(...sampleRes.map(Math.abs)) / fit.r;
  const roundScore = curve(dev, ROUND_SCALE);

  const s = trimmed[0], e = trimmed[trimmed.length - 1];
  const gapPx = Math.hypot(e.x - s.x, e.y - s.y);
  const gap = gapPx / fit.r;
  const closeScore = curve(gap, CLOSE_SCALE);

  const total = Math.round((WEIGHTS.roundness * roundScore + WEIGHTS.closure * closeScore) * 10) / 10;

  return {
    ok: true,
    total,
    tier: tierOf(total),
    fit: { cx: fit.cx, cy: fit.cy, r: fit.r },
    roundness: { score: roundScore, dev, maxDev },
    closure: { score: closeScore, gap, gapPx, sweptDeg: (swept * 180) / Math.PI },
    overshootDeg: Math.max(0, ((swept0 - 2 * Math.PI) * 180) / Math.PI),
    shape: diagnose(sample, fit, sampleRes),
    points: trimmed,
    residuals: radialResiduals(trimmed, fit),
  };
}
