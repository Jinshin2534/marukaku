// キャンバスへの描画。ロジックは持たない。

const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

export function setupCanvas(canvas) {
  const ctx = canvas.getContext('2d');
  const fit = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    canvas.width = Math.round(window.innerWidth * dpr);
    canvas.height = Math.round(window.innerHeight * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  fit();
  return { ctx, fit };
}

export function clear(ctx) {
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.restore();
}

/** 描いている最中の線(墨) */
export function drawInk(ctx, pts, color = css('--ink')) {
  if (pts.length < 2) return;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = color;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.stroke();
}

/** -1..1 を 藍 ← 墨 → 朱 に */
function diverging(v) {
  const t = Math.max(-1, Math.min(1, v));
  const ink = [35, 32, 27], ai = [45, 95, 138], shu = [200, 64, 42];
  const to = t < 0 ? ai : shu, a = Math.abs(t);
  const c = ink.map((x, i) => Math.round(x + (to[i] - x) * a));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

/** 区間ごとの速さ(px/ms)。前後数点でならす。 */
export function segmentSpeeds(pts, win = 3) {
  const out = [];
  for (let i = 1; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1 - win)], b = pts[Math.min(pts.length - 1, i + win)];
    let d = 0;
    for (let j = Math.max(1, i - win); j <= Math.min(pts.length - 1, i + win); j++) {
      d += Math.hypot(pts[j].x - pts[j - 1].x, pts[j].y - pts[j - 1].y);
    }
    const dt = b.t - a.t;
    out.push(dt > 0 ? d / dt : null);
  }
  return out;
}

/**
 * 採点結果を描く。mode: 'dev'(半径のずれで色分け) | 'speed'(速さで色分け)
 */
export function drawResult(ctx, result, mode = 'dev') {
  const { fit, points: pts, residuals, shape } = result;

  // 当てはめた円(点線)
  ctx.save();
  ctx.setLineDash([6, 7]);
  ctx.strokeStyle = 'rgba(200,64,42,.55)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(fit.cx, fit.cy, fit.r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();

  // 中心
  ctx.fillStyle = 'rgba(200,64,42,.5)';
  ctx.beginPath();
  ctx.arc(fit.cx, fit.cy, 2.5, 0, Math.PI * 2);
  ctx.fill();

  // 描いた線を色分け
  let values;
  if (mode === 'speed') {
    const sp = segmentSpeeds(pts);
    const valid = sp.filter((v) => v != null).sort((a, b) => a - b);
    const med = valid[Math.floor(valid.length / 2)] || 1;
    values = sp.map((v) => (v == null ? 0 : Math.log2(v / med) / 1)); // 2倍速で真っ赤、半分で真っ青
  } else {
    values = [];
    for (let i = 1; i < pts.length; i++) {
      values.push(((residuals[i] + residuals[i - 1]) / 2 / fit.r) / 0.08); // 8%ずれで最大色
    }
  }
  ctx.lineCap = 'round';
  ctx.lineWidth = 5;
  for (let i = 1; i < pts.length; i++) {
    ctx.strokeStyle = diverging(values[i - 1]);
    ctx.beginPath();
    ctx.moveTo(pts[i - 1].x, pts[i - 1].y);
    ctx.lineTo(pts[i].x, pts[i].y);
    ctx.stroke();
  }

  // 始点と終点、そのずれ
  const s = pts[0], e = pts[pts.length - 1];
  ctx.save();
  ctx.setLineDash([2, 4]);
  ctx.strokeStyle = css('--ink-soft');
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(s.x, s.y);
  ctx.lineTo(e.x, e.y);
  ctx.stroke();
  ctx.restore();
  ctx.fillStyle = css('--ok');
  ctx.beginPath();
  ctx.arc(s.x, s.y, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = css('--ink');
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(e.x, e.y, 6, 0, Math.PI * 2);
  ctx.stroke();

  // いちばん外れた所
  if (mode === 'dev' && result.roundness.dev > 0.015) {
    const w = pts.length ? nearestByAngle(pts, fit, shape.worstSpot) : null;
    if (w) {
      ctx.strokeStyle = 'rgba(35,32,27,.5)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(w.x, w.y, 14, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
}

// diagnose の index はリサンプル後の点を指すので、角度が一番近い元の点を探す
function nearestByAngle(pts, fit, spot) {
  const target = spot.theta;
  let best = null, bd = Infinity;
  for (const p of pts) {
    let d = Math.atan2(p.y - fit.cy, p.x - fit.cx) - target;
    d = Math.abs(Math.atan2(Math.sin(d), Math.cos(d)));
    if (d < bd) { bd = d; best = p; }
  }
  return best;
}

/** 速さのグラフ(SVG)。relative は平均=1 の配列(null あり) */
export function drawSpeedChart(svg, relative, bestRelative, meanLabel) {
  const W = 300, H = 90, pad = 6;
  const all = [...relative, ...(bestRelative || [])].filter((v) => v != null);
  const max = Math.max(1.6, ...all) * 1.05;
  const toPath = (arr) => {
    const n = arr.length;
    let d = '';
    arr.forEach((v, i) => {
      if (v == null) return;
      const x = (i + 0.5) * (W / n);
      const y = H - pad - (v / max) * (H - 2 * pad);
      d += `${d ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`;
    });
    return d;
  };
  const yMean = H - pad - (1 / max) * (H - 2 * pad);
  if (meanLabel) meanLabel.style.top = `${(yMean / H) * 100}%`;
  svg.innerHTML = `
    <line x1="0" x2="${W}" y1="${yMean}" y2="${yMean}" stroke="var(--line)" stroke-width="1" vector-effect="non-scaling-stroke"/>
    ${bestRelative ? `<path d="${toPath(bestRelative)}" fill="none" stroke="var(--ink-soft)" stroke-width="1.5" stroke-dasharray="3 3" vector-effect="non-scaling-stroke"/>` : ''}
    <path d="${toPath(relative)}" fill="none" stroke="var(--ai)" stroke-width="2.5" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>`;
}
