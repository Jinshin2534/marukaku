// 合成の円・楕円の軌跡。テストとデモ描画に使う(実在の誰かの描き方ではない)。

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * @param {object} o
 *  cx, cy, r       中心と半径
 *  rx, ry, tilt    楕円(指定時は r より優先)。tilt はラジアン
 *  sweepDeg        描く角度(360 で一周)
 *  start           描き始めの角度
 *  endRadiusDelta  描き終わりに向けて半径を徐々に変える量(px)。始点と終点のずれを作る
 *  noise           半径方向のぶれ(px, 滑らか)
 *  n               点の数
 *  durationMs      所要時間
 *  speedWave       速さの変化の強さ(0=一定)
 *  seed            乱数シード
 */
export function synthCircle(o = {}) {
  const {
    cx = 200, cy = 200, r = 120, rx, ry, tilt = 0,
    sweepDeg = 360, start = -Math.PI / 2, endRadiusDelta = 0,
    noise = 0, n = 180, durationMs = 1200, speedWave = 0, seed = 1,
    ccw = false,
  } = o;
  const rand = mulberry32(seed);
  const A = rx ?? r, B = ry ?? r;
  const sweep = (sweepDeg * Math.PI) / 180;
  // 滑らかなノイズ: 低周波の正弦の和
  const waves = Array.from({ length: 4 }, (_, i) => ({
    k: 3 + i * 2 + Math.floor(rand() * 3),
    ph: rand() * Math.PI * 2,
    a: (rand() * 0.6 + 0.4) / (i + 1),
  }));
  const norm = waves.reduce((s, w) => s + w.a * w.a, 0) ** 0.5 / Math.SQRT2 || 1;
  const pts = [];
  // 時間の進みかたを歪めて速さを変える: u(s) = s + speedWave*sin(2πs)/(2π)
  for (let i = 0; i < n; i++) {
    const s = i / (n - 1);
    const u = s + (speedWave * Math.sin(2 * Math.PI * s)) / (2 * Math.PI);
    const th = start + (ccw ? -1 : 1) * sweep * u;
    let dr = endRadiusDelta * u;
    if (noise) for (const w of waves) dr += (noise * w.a * Math.sin(w.k * th + w.ph)) / norm;
    const ex = (A + dr) * Math.cos(th - tilt), ey = (B + dr) * Math.sin(th - tilt);
    pts.push({
      x: cx + ex * Math.cos(tilt) - ey * Math.sin(tilt),
      y: cy + ex * Math.sin(tilt) + ey * Math.cos(tilt),
      t: s * durationMs,
    });
  }
  return pts;
}
