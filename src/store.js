// 自己ベストと履歴をこのブラウザに保存する。保存できない環境でも動く。
const KEY = 'marukaku.v1';
const MAX_HISTORY = 100;

function load() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY));
    if (v && typeof v === 'object') return { best: v.best ?? null, history: Array.isArray(v.history) ? v.history : [] };
  } catch { /* 読めなければ空から */ }
  return { best: null, history: [] };
}

export function createStore() {
  const data = load();
  const save = () => {
    try { localStorage.setItem(KEY, JSON.stringify(data)); } catch { /* 保存できなくても続行 */ }
  };
  return {
    get best() { return data.best; },
    get history() { return data.history; },
    /** 記録して、自己ベスト更新なら true */
    record(entry, profile) {
      data.history.push(entry);
      if (data.history.length > MAX_HISTORY) data.history.splice(0, data.history.length - MAX_HISTORY);
      const isBest = !data.best || entry.total > data.best.total;
      if (isBest) data.best = { total: entry.total, relative: profile?.relative ?? null, at: entry.at };
      save();
      return isBest;
    },
    clear() { data.best = null; data.history = []; save(); },
  };
}
