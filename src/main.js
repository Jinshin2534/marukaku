import { scoreCircle } from './lib/score.js';
import { speedProfile, habitInsight, MIN_TRIES } from './lib/speed.js';
import { synthCircle } from './lib/synth.js';
import { setupCanvas, clear, drawInk, drawResult, drawSpeedChart } from './render.js';
import { createStore } from './store.js';

const $ = (id) => document.getElementById(id);
const canvas = $('pad');
const { ctx, fit: fitCanvas } = setupCanvas(canvas);
const store = createStore();

const state = {
  drawing: false,
  pointerId: null,
  points: [],
  last: null,       // 直近の採点結果
  lastProfile: null,
  colorMode: 'dev',
  demoTimer: null,
  isDemo: false,
};

// ---------- 表示 ----------

function showBest() {
  const b = store.best;
  $('best').hidden = !b;
  if (b) $('best').innerHTML = `ベスト <b>${b.total.toFixed(1)}</b>`;
}

function toast(msg, ms = 2600) {
  const el = $('toast');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toast.t);
  toast.t = setTimeout(() => { el.hidden = true; }, ms);
}

function resetView() {
  clearTimeout(countUp.t);
  $('stamp').hidden = true;
  $('sheet').hidden = true;
  $('toast').hidden = true;
  clear(ctx);
}

// 点数のカウントアップ。rAF が止まる環境でも最終値に着くよう setTimeout で刻む
function countUp(el, target) {
  const steps = 18;
  let i = 0;
  const tick = () => {
    i++;
    const v = i >= steps ? target : target * (1 - (1 - i / steps) ** 3);
    el.textContent = v.toFixed(1);
    if (i < steps) countUp.t = setTimeout(tick, 28);
  };
  clearTimeout(countUp.t);
  tick();
}

function placeStamp(fit) {
  const st = $('stamp');
  const x = Math.min(window.innerWidth - 90, Math.max(90, fit.cx));
  const y = Math.min(window.innerHeight - 60, Math.max(70, fit.cy));
  st.style.left = `${x}px`;
  st.style.top = `${y}px`;
}

const pct = (v) => `${(v * 100).toFixed(1)}%`;

function describeShape(res) {
  const { shape, roundness } = res;
  const parts = [];
  if (roundness.dev < 0.015) {
    parts.push('ほぼ真円です。');
  } else if (shape.kind === 'ellipse') {
    const deg = shape.flatness > 0.15 ? 'はっきり' : 'やや';
    parts.push(`${deg}<b>${shape.direction}</b>の楕円ぎみです（長径と短径の差 ≈ 半径の${Math.round(shape.flatness * 100)}%）。`);
  } else {
    const w = shape.worstSpot;
    parts.push(`<b>${w.clock}時</b>の方向がいちばん${w.bulge ? 'ふくらんで' : 'へこんで'}います（半径の${Math.round(w.rel * 100)}%）。`);
  }
  if (res.closure.sweptDeg < 355) parts.push(`一周に${Math.round(360 - res.closure.sweptDeg)}°足りません。`);
  if (res.overshootDeg > 20) parts.push(`一周を超えた${Math.round(res.overshootDeg)}°ぶんは採点に入れていません。`);
  return parts.join(' ');
}

function describeSpeed(p) {
  if (!p) return '時刻が取れなかったので、速さは測れませんでした。';
  const where = (k) => {
    const f = (k + 0.5) / p.bins;
    return f < 0.2 ? '描き始め' : f < 0.4 ? '前半' : f < 0.6 ? '半周あたり' : f < 0.8 ? '後半' : '描き終わり';
  };
  const evenness = p.cv < 0.12 ? 'とても一定' : p.cv < 0.25 ? 'わりと一定' : p.cv < 0.45 ? 'メリハリあり' : 'かなり緩急あり';
  const fast = where(p.peakBin), slow = where(p.slowBin);
  const pos = fast === slow
    ? `いちばん速い所といちばん溜めた所が、どちらも${fast}にあります。`
    : `いちばん速いのは${fast}、いちばん溜めたのは${slow}。`;
  return `一周 ${(p.durationMs / 1000).toFixed(2)}秒・速さのむら ${Math.round(p.cv * 100)}%（${evenness}）。${pos}`;
}

function describeHabit() {
  const h = habitInsight(store.history);
  if (!h.ready) return `あと<b>${h.need}回</b>描くと、あなたが上手く描けたときの癖（速さ・所要時間と点の関係）を出します。`;
  const r = (v) => (v == null ? '—' : v.toFixed(2));
  if (!h.notes.length) return `${h.n}回ぶんでは、速さのむら（相関 ${r(h.rCv)}）や所要時間（${r(h.rDur)}）と点のあいだにはっきりした関係は見えません。`;
  return `${h.n}回ぶんの傾向: <b>${h.notes.join('、')}</b>（相関 むら${r(h.rCv)} / 時間${r(h.rDur)}）。`;
}

function render(res, { isBest = false, animate = true } = {}) {
  clear(ctx);
  drawResult(ctx, res, state.colorMode);
  if (!animate) return;

  const st = $('stamp');
  st.hidden = false;
  st.classList.toggle('best-new', isBest);
  st.style.animation = 'none';
  void st.offsetWidth;
  st.style.animation = '';
  placeStamp(res.fit);
  $('tier').textContent = state.isDemo ? `${res.tier}（合成デモ）` : res.tier;
  countUp($('num'), res.total);

  $('vRound').innerHTML = `±${pct(res.roundness.dev)} <small>最大 ${pct(res.roundness.maxDev)}・${Math.round(res.roundness.score)}点</small>`;
  $('bRound').style.width = `${res.roundness.score}%`;
  $('vClose').innerHTML = `${Math.round(res.closure.gapPx)}px <small>半径の${Math.round(res.closure.gap * 100)}%・${Math.round(res.closure.score)}点</small>`;
  $('bClose').style.width = `${res.closure.score}%`;
  $('diag').innerHTML = describeShape(res);

  const p = state.lastProfile;
  const bestRel = store.best?.relative && !isBest ? store.best.relative : null;
  if (p) drawSpeedChart($('speedSvg'), p.relative, bestRel, $('meanLabel'));
  else $('speedSvg').innerHTML = '';
  $('pbLegend').hidden = !bestRel;
  $('speedNote').textContent = describeSpeed(p);
  $('habit').innerHTML = state.isDemo ? '合成デモは記録に残しません。' : describeHabit();
  $('meta').textContent = `半径 ${Math.round(res.fit.r)}px・${res.points.length}点`;
  $('sheet').hidden = false;
  $('sheet').scrollTop = 0;
}

// ---------- 採点の流れ ----------

function finish(points, { demo = false } = {}) {
  state.isDemo = demo;
  const res = scoreCircle(points);
  state.last = res;
  if (!res.ok) {
    state.lastProfile = null;
    clear(ctx);
    drawInk(ctx, points, 'rgba(107,100,88,.45)');
    toast(res.message);
    return res;
  }
  const profile = speedProfile(res.points, res.fit);
  state.lastProfile = profile;
  let isBest = false;
  if (!demo) {
    isBest = store.record(
      { total: res.total, cv: profile?.cv ?? null, durationMs: profile?.durationMs ?? null, at: Date.now() },
      profile,
    );
    showBest();
  }
  render(res, { isBest });
  return res;
}

// ---------- 入力 ----------

function stopDemo() {
  clearTimeout(state.demoTimer);
  state.demoTimer = null;
}

function begin(x, y, t) {
  stopDemo();
  resetView();
  $('hint').classList.add('gone');
  state.drawing = true;
  state.points = [{ x, y, t }];
}

function extend(x, y, t) {
  const pts = state.points;
  const prev = pts[pts.length - 1];
  if (prev && prev.x === x && prev.y === y) return;
  pts.push({ x, y, t });
  if (pts.length >= 2) {
    // 増えたぶんだけ描き足す
    drawInk(ctx, [pts[pts.length - 2], pts[pts.length - 1]]);
  }
}

canvas.addEventListener('pointerdown', (e) => {
  if (state.drawing) return; // 二本目の指は無視
  if (e.button !== undefined && e.button > 0) return;
  state.pointerId = e.pointerId;
  try { canvas.setPointerCapture(e.pointerId); } catch { /* 合成イベントでは失敗してよい */ }
  begin(e.clientX, e.clientY, e.timeStamp);
  e.preventDefault();
});

canvas.addEventListener('pointermove', (e) => {
  if (!state.drawing || e.pointerId !== state.pointerId) return;
  const evs = typeof e.getCoalescedEvents === 'function' ? e.getCoalescedEvents() : [];
  for (const ce of evs.length ? evs : [e]) extend(ce.clientX, ce.clientY, ce.timeStamp);
});

function end(e) {
  if (!state.drawing || e.pointerId !== state.pointerId) return;
  state.drawing = false;
  state.pointerId = null;
  extend(e.clientX, e.clientY, e.timeStamp);
  finish(state.points);
}
canvas.addEventListener('pointerup', end);
canvas.addEventListener('pointercancel', end);

// iOS Safari のスクロール・拡大を止める
document.addEventListener('touchmove', (e) => { if (e.target === canvas) e.preventDefault(); }, { passive: false });

window.addEventListener('resize', () => {
  fitCanvas();
  if (state.last?.ok) render(state.last, { animate: false });
});

document.querySelectorAll('.seg button').forEach((b) => {
  b.addEventListener('click', () => {
    state.colorMode = b.dataset.color;
    document.querySelectorAll('.seg button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    if (state.last?.ok) render(state.last, { animate: false });
  });
});

// ---------- 合成デモ ----------

function demo({ seed = Math.floor(Math.random() * 1e6), noise, rx, ry, sweepDeg } = {}) {
  stopDemo();
  resetView();
  $('hint').classList.add('gone');
  const w = window.innerWidth, h = window.innerHeight;
  const r = Math.min(w, h) * 0.28;
  const rnd = (seed % 1000) / 1000;
  const pts = synthCircle({
    cx: w / 2, cy: h * 0.4, r,
    rx: rx ?? r * (1 + (rnd - 0.5) * 0.12), ry: ry ?? r * (1 - (rnd - 0.5) * 0.12),
    noise: noise ?? r * (0.005 + rnd * 0.025),
    sweepDeg: sweepDeg ?? 352 + rnd * 20,
    durationMs: 1100, n: 150, speedWave: 0.3 + rnd * 0.4, seed,
  });
  let i = 1;
  const step = () => {
    drawInk(ctx, [pts[i - 1], pts[i]]);
    i++;
    if (i < pts.length) state.demoTimer = setTimeout(step, pts[i].t - pts[i - 1].t);
    else { state.demoTimer = null; finish(pts, { demo: true }); }
  };
  step();
}
$('demoBtn').addEventListener('click', () => demo());
$('handle').addEventListener('click', () => {
  const open = $('sheet').classList.toggle('peek') === false;
  $('handle').setAttribute('aria-expanded', String(open));
  $('handle').textContent = open ? 'たたむ' : '詳しく見る';
});

showBest();

// ヘッドレス検証用
window.__app = {
  /** 点列をそのまま採点して画面に出す(記録する)。demo:true で記録しない */
  submit: (points, opts) => { stopDemo(); resetView(); $('hint').classList.add('gone'); return finish(points, opts); },
  score: scoreCircle,
  synth: synthCircle,
  demo,
  setColorMode: (m) => document.querySelector(`.seg button[data-color="${m}"]`)?.click(),
  get state() {
    return {
      last: state.last && { ...state.last, points: undefined, residuals: undefined },
      profile: state.lastProfile,
      best: store.best,
      historyLength: store.history.length,
      habit: habitInsight(store.history),
      minTries: MIN_TRIES,
    };
  },
  clearRecords: () => { store.clear(); showBest(); },
};
