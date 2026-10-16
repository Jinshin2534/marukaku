// 軌跡の下ごしらえ。点は {x, y, t?}。

export function pathLength(points) {
  let L = 0;
  for (let i = 1; i < points.length; i++) {
    L += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
  }
  return L;
}

/**
 * 弧長で等間隔に取り直す。描く速さで点の密度が変わると、
 * ゆっくり描いた所ほどフィットへの発言力が増えてしまうので、それを消す。
 */
export function resampleByArcLength(points, count) {
  if (points.length < 2 || count < 2) return points.slice();
  const L = pathLength(points);
  if (L === 0) return [{ ...points[0] }];
  const step = L / (count - 1);
  const out = [{ x: points[0].x, y: points[0].y, t: points[0].t }];
  let acc = 0; // 現在の区間の始点までの弧長
  let target = step;
  for (let i = 1; i < points.length && out.length < count - 1; i++) {
    const a = points[i - 1], b = points[i];
    const seg = Math.hypot(b.x - a.x, b.y - a.y);
    while (seg > 0 && acc + seg >= target && out.length < count - 1) {
      const u = (target - acc) / seg;
      out.push({
        x: a.x + (b.x - a.x) * u,
        y: a.y + (b.y - a.y) * u,
        t: a.t != null && b.t != null ? a.t + (b.t - a.t) * u : undefined,
      });
      target += step;
    }
    acc += seg;
  }
  const last = points[points.length - 1];
  out.push({ x: last.x, y: last.y, t: last.t });
  return out;
}

/** 中心まわりの角度を連続化して返す(ラジアン、始点を0、描いた向きを正)。 */
export function unwrappedAngles(points, cx, cy) {
  const raw = points.map((p) => Math.atan2(p.y - cy, p.x - cx));
  const out = [0];
  let acc = 0;
  for (let i = 1; i < raw.length; i++) {
    let d = raw[i] - raw[i - 1];
    if (d > Math.PI) d -= 2 * Math.PI;
    if (d < -Math.PI) d += 2 * Math.PI;
    acc += d;
    out.push(acc);
  }
  const sign = acc < 0 ? -1 : 1;
  return out.map((a) => a * sign);
}

/** 近すぎる点(同じ位置の連打など)を間引く。 */
export function dedupe(points, minDist = 0.5) {
  const out = [];
  for (const p of points) {
    const q = out[out.length - 1];
    if (!q || Math.hypot(p.x - q.x, p.y - q.y) >= minDist) out.push(p);
  }
  return out;
}
