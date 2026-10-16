// 描く速さの変化。「どこで速く、どこで溜めたか」を一周の進み具合に沿って見せる。

import { unwrappedAngles } from './geom.js';

/**
 * 一周を bins 等分し、各区間の平均の速さ(px/s)を返す。
 * 時刻が無い・時間が0の入力では null(測れないものは測れないと言う)。
 */
export function speedProfile(points, center, bins = 24) {
  if (points.length < 3 || points.some((p) => p.t == null)) return null;
  const dur = points[points.length - 1].t - points[0].t;
  if (!(dur > 0)) return null;
  const ang = unwrappedAngles(points, center.cx, center.cy);
  const total = Math.max(ang[ang.length - 1], 1e-9);
  const dist = new Array(bins).fill(0);
  const time = new Array(bins).fill(0);
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i];
    const dt = b.t - a.t;
    if (!(dt > 0)) continue; // 同時刻の点は距離ごと前区間に寄せず捨てる
    const mid = (ang[i - 1] + ang[i]) / 2 / total;
    const k = Math.min(bins - 1, Math.max(0, Math.floor(mid * bins)));
    dist[k] += Math.hypot(b.x - a.x, b.y - a.y);
    time[k] += dt;
  }
  const speeds = dist.map((d, k) => (time[k] > 0 ? (d / time[k]) * 1000 : null));
  const valid = speeds.filter((v) => v != null);
  if (valid.length < bins / 2) return null;
  const mean = valid.reduce((s, v) => s + v, 0) / valid.length;
  const sd = Math.sqrt(valid.reduce((s, v) => s + (v - mean) ** 2, 0) / valid.length);
  const relative = speeds.map((v) => (v == null ? null : v / mean));
  let peak = 0, slow = 0;
  speeds.forEach((v, k) => {
    if (v == null) return;
    if (speeds[peak] == null || v > speeds[peak]) peak = k;
    if (speeds[slow] == null || v < speeds[slow]) slow = k;
  });
  return {
    bins,
    speeds,
    relative,
    mean,
    cv: sd / mean, // 速さのむら(変動係数)
    durationMs: dur,
    peakBin: peak,
    slowBin: slow,
  };
}

/** ピアソン相関。n<3 や分散0は null。 */
export function correlation(xs, ys) {
  const n = Math.min(xs.length, ys.length);
  if (n < 3) return null;
  let mx = 0, my = 0;
  for (let i = 0; i < n; i++) { mx += xs[i]; my += ys[i]; }
  mx /= n; my /= n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) {
    sxy += (xs[i] - mx) * (ys[i] - my);
    sxx += (xs[i] - mx) ** 2;
    syy += (ys[i] - my) ** 2;
  }
  if (sxx === 0 || syy === 0) return null;
  return sxy / Math.sqrt(sxx * syy);
}

/**
 * 自分の履歴から「上手く描けたときの癖」を言う。
 * 試行が少ないうちは言わない(MIN_TRIES 回まで)。
 */
export const MIN_TRIES = 6;
export function habitInsight(history) {
  const h = history.filter((r) => Number.isFinite(r.total) && Number.isFinite(r.cv) && Number.isFinite(r.durationMs));
  if (h.length < MIN_TRIES) return { ready: false, need: MIN_TRIES - h.length };
  const totals = h.map((r) => r.total);
  const rCv = correlation(h.map((r) => r.cv), totals);
  const rDur = correlation(h.map((r) => r.durationMs), totals);
  const notes = [];
  const strong = 0.3;
  if (rCv != null && Math.abs(rCv) >= strong) {
    notes.push(rCv < 0 ? '速さが一定なほど点が高い' : 'メリハリをつけたほうが点が高い');
  }
  if (rDur != null && Math.abs(rDur) >= strong) {
    notes.push(rDur > 0 ? 'ゆっくり描いたほうが点が高い' : '素早く描いたほうが点が高い');
  }
  return { ready: true, n: h.length, rCv, rDur, notes };
}
