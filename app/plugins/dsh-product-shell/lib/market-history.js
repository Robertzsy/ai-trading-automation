// Read-only chart proxy. Keep credentials on the host and share the relatively
// expensive provider request between the watchlist and selected stock.
const MARKETS = new Set(['cn', 'hk', 'us', 'etf']);
const TTL_MS = 5 * 60 * 1000;

export function historySymbol(market, value) {
  if (!MARKETS.has(market)) throw new Error('market 必须是 cn、hk、us 或 etf');
  const code = String(value ?? '').trim();
  if (market === 'hk') {
    const digits = code.replace(/^hk/i, '');
    if (!/^\d{1,5}$/.test(digits)) throw new Error('港股代码无效');
    return 'hk' + digits.padStart(5, '0');
  }
  if (market === 'us') {
    // Always force the market: a real ticker such as USB must not lose its US.
    if (!/^[a-z][a-z.]{0,9}$/i.test(code)) throw new Error('美股代码无效');
    return 'us' + code.toUpperCase();
  }
  if (!/^(?:(?:sh|sz|bj))?\d{6}$/i.test(code)) throw new Error('股票代码无效');
  return code.toLowerCase();
}

export function createHistoryHandler(engineFetch, sendJson, now = Date.now) {
  const cache = new Map();
  return async (req, res) => {
    if (req.method !== 'GET') {
      sendJson(res, 405, {ok:false, error:'method not allowed'});
      return;
    }
    try {
      const query = new URL(req.url ?? '', 'http://127.0.0.1').searchParams;
      const market = query.get('market') ?? '';
      const symbol = historySymbol(market, query.get('symbol'));
      const key = market + ':' + symbol;
      const previous = cache.get(key);
      if (previous?.pending) {
        sendJson(res, 200, await previous.pending);
        return;
      }
      if (previous?.data && query.get('refresh') !== '1' && now() - previous.time < TTL_MS) {
        sendJson(res, 200, previous.data);
        return;
      }
      // One window supports the sparkline, one year and MA20 warm-up. A bound
      // also prevents arbitrary lookback values fragmenting this small cache.
      const entry = {pending:null, data:null, time:0};
      entry.pending = engineFetch('/api/market/history?symbol=' + encodeURIComponent(symbol) + '&lookback=280', {
        signal:AbortSignal.timeout(60000),
      }).then(payload => {
        const data = {...payload, market, symbol, fetched_at:new Date(now()).toISOString()};
        if (!payload.error && payload.ok !== false && Array.isArray(payload.data) && payload.data.length) {
          entry.data = data;
          entry.time = now();
        } else cache.delete(key);
        return data;
      }).catch(error => { cache.delete(key); throw error; }).finally(() => {entry.pending = null;});
      // Pending entries are never evicted (otherwise concurrent callers could
      // duplicate them); evict the oldest completed request when necessary.
      if (cache.size >= 128) {
        const oldest = [...cache.entries()].find(([, item]) => !item.pending);
        if (oldest) cache.delete(oldest[0]);
      }
      cache.set(key, entry);
      sendJson(res, 200, await entry.pending);
    } catch (error) {
      const invalid = /代码无效|market 必须/.test(String(error?.message));
      sendJson(res, invalid ? 400 : 502, {ok:false, error:invalid ? error.message : '历史行情暂不可用，请稍后重试'});
    }
  };
}
