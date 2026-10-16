// 最小二乗による円の当てはめ。
// 1) 代数的フィット(Kåsa法)で初期値を出し、2) 幾何的距離の二乗和を Gauss–Newton で詰める。
// 点は {x, y} の配列。返り値 { cx, cy, r, rms } (rms は半径方向の残差の二乗平均平方根)。

function solve3(m, v) {
  // 3x3 連立方程式をクラメルの公式で解く。特異なら null。
  const det = (a) =>
    a[0][0] * (a[1][1] * a[2][2] - a[1][2] * a[2][1]) -
    a[0][1] * (a[1][0] * a[2][2] - a[1][2] * a[2][0]) +
    a[0][2] * (a[1][0] * a[2][1] - a[1][1] * a[2][0]);
  const d = det(m);
  if (!Number.isFinite(d) || Math.abs(d) < 1e-12) return null;
  const out = [];
  for (let c = 0; c < 3; c++) {
    const mc = m.map((row, i) => row.map((val, j) => (j === c ? v[i] : val)));
    out.push(det(mc) / d);
  }
  return out;
}

/** 代数的フィット: x²+y²+Dx+Ey+F=0 の残差二乗和を最小化。数値安定のため重心で中心化する。 */
export function fitCircleAlgebraic(points) {
  const n = points.length;
  if (n < 3) return null;
  let mx = 0, my = 0;
  for (const p of points) { mx += p.x; my += p.y; }
  mx /= n; my /= n;
  // 正規方程式 A^T A [D E F]^T = A^T b, 行 = [x, y, 1], b = -(x²+y²)
  let sxx = 0, sxy = 0, syy = 0, sx = 0, sy = 0, sxz = 0, syz = 0, sz = 0;
  for (const p of points) {
    const x = p.x - mx, y = p.y - my, z = x * x + y * y;
    sxx += x * x; sxy += x * y; syy += y * y; sx += x; sy += y;
    sxz += x * z; syz += y * z; sz += z;
  }
  const sol = solve3(
    [[sxx, sxy, sx], [sxy, syy, sy], [sx, sy, n]],
    [-sxz, -syz, -sz],
  );
  if (!sol) return null;
  const [D, E, F] = sol;
  const cx = -D / 2, cy = -E / 2;
  const r2 = cx * cx + cy * cy - F;
  if (!(r2 > 0)) return null;
  return { cx: cx + mx, cy: cy + my, r: Math.sqrt(r2) };
}

export function radialResiduals(points, c) {
  return points.map((p) => Math.hypot(p.x - c.cx, p.y - c.cy) - c.r);
}

function rmsOf(arr) {
  let s = 0;
  for (const v of arr) s += v * v;
  return Math.sqrt(s / arr.length);
}

/** 幾何的フィット: Σ(|p-c| - r)² を最小化。失敗したら代数解を返す。 */
export function fitCircle(points, { iterations = 20 } = {}) {
  const init = fitCircleAlgebraic(points);
  if (!init) return null;
  let { cx, cy, r } = init;
  for (let it = 0; it < iterations; it++) {
    // J^T J と J^T e を積む(未知数 cx, cy, r)
    const JtJ = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
    const Jte = [0, 0, 0];
    for (const p of points) {
      const dx = p.x - cx, dy = p.y - cy;
      const d = Math.hypot(dx, dy) || 1e-9;
      const e = d - r;
      const j = [-dx / d, -dy / d, -1];
      for (let a = 0; a < 3; a++) {
        Jte[a] += j[a] * e;
        for (let b = 0; b < 3; b++) JtJ[a][b] += j[a] * j[b];
      }
    }
    const step = solve3(JtJ, Jte.map((v) => -v));
    if (!step || step.some((v) => !Number.isFinite(v))) break;
    cx += step[0]; cy += step[1]; r += step[2];
    if (Math.hypot(step[0], step[1], step[2]) < 1e-9 * Math.max(1, r)) break;
  }
  if (!(r > 0) || !Number.isFinite(cx + cy + r)) {
    return { ...init, rms: rmsOf(radialResiduals(points, init)) };
  }
  const c = { cx, cy, r: Math.abs(r) };
  return { ...c, rms: rmsOf(radialResiduals(points, c)) };
}
