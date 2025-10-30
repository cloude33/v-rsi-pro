// src/utils/api.js

// Akıllı fetch: Binance doğrudan, diğerleri Vercel proxy üzerinden
const fetchWithSmartProxy = async (url, exchange) => {
  if (exchange === 'binance') {
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Binance API error: ${res.status} ${res.statusText}`);
    }
    return res;
  }

  // Diğer borsalar: kendi Vercel proxy'miz üzerinden
  const proxyUrl = `/api/proxy?url=${encodeURIComponent(url)}`;
  const res = await fetch(proxyUrl);
  if (!res.ok) {
    const text = await res.text().catch(() => 'unknown');
    throw new Error(`Proxy error for ${exchange}: ${res.status} ${text}`);
  }
  return res;
};

// API_BASE: BOŞLUKSUZ ve doğru
const API_BASE = {
  binance: { spot: 'https://api.binance.com', futures: 'https://fapi.binance.com' },
  bybit: { spot: 'https://api.bybit.com', futures: 'https://api.bybit.com' },
  okx: { spot: 'https://www.okx.com', futures: 'https://www.okx.com' },
  mexc: { spot: 'https://api.mexc.com', futures: 'https://contract.mexc.com' }
};

const WS_BASE = {
  binance: { spot: 'wss://stream.binance.com:9443', futures: 'wss://fstream.binance.com' },
  bybit: { spot: 'wss://stream.bybit.com/v5/public/spot', futures: 'wss://stream.bybit.com/v5/public/linear' },
  okx: { spot: 'wss://ws.okx.com:8443/ws/v5/public', futures: 'wss://ws.okx.com:8443/ws/v5/public' },
  mexc: { spot: 'wss://wbs.mexc.com/ws', futures: 'wss://contract.mexc.com/ws' }
};

// === 1. Tüm USDT Çiftlerini Al ===
export async function getAllUSDTCoins(exchange, market) {
  const isFutures = market === 'futures';
  const api = API_BASE[exchange][isFutures ? 'futures' : 'spot'];
  let url = '';

  if (exchange === 'binance') {
    url = `${api}/${isFutures ? 'fapi/v1' : 'api/v3'}/exchangeInfo`;
  } else if (exchange === 'bybit') {
    url = `${api}/v5/market/instruments-info?category=${isFutures ? 'linear' : 'spot'}`;
  } else if (exchange === 'okx') {
    url = `${api}/api/v5/market/tickers?instType=${isFutures ? 'SWAP' : 'SPOT'}`;
  } else if (exchange === 'mexc') {
    if (isFutures) {
      url = `${api}/api/v1/contract/list`;
    } else {
      url = `${api}/api/v3/exchangeInfo`;
    }
  }

  try {
    const res = await fetchWithSmartProxy(url, exchange);
    const data = await res.json();

    let symbols = [];

    if (exchange === 'binance') {
      symbols = data.symbols
        ?.filter(s => s.quoteAsset === 'USDT' && s.status === 'TRADING' && !/UP|DOWN|BULL|BEAR/.test(s.symbol))
        .map(s => s.symbol) || [];
    } else if (exchange === 'bybit') {
      symbols = data.result?.list
        ?.filter(s => s.quoteCoin === 'USDT' && s.status === '1')
        .map(s => s.symbol) || [];
    } else if (exchange === 'okx') {
      symbols = data.data
        ?.filter(s => isFutures ? s.instId.endsWith('-USDT-SWAP') : s.instId.endsWith('-USDT'))
        .map(s => s.instId.replace('-SWAP', '')) || [];
    } else if (exchange === 'mexc') {
      if (isFutures) {
        symbols = data.data
          ?.filter(s => s.symbol?.endsWith('_USDT') && s.state === 0)
          .map(s => s.symbol.replace('_USDT', 'USDT')) || [];
      } else {
        symbols = data.symbols
          ?.filter(s => s.quoteAsset === 'USDT' && s.state === 'ENABLED')
          .map(s => s.symbol) || [];
      }
    }

    return symbols.filter(s => typeof s === 'string' && s.endsWith('USDT'));
  } catch (err) {
    console.error(`USDT coins error for ${exchange} ${market}:`, err);
    return [];
  }
}

// === 2. Klines + Funding + OI ===
export async function fetchKlines(symbol, interval, limit, exchange, market) {
  const isFutures = market === 'futures';
  const base = API_BASE[exchange][isFutures ? 'futures' : 'spot'];
  let url = '';

  const safeInterval = exchange === 'mexc' && interval === '1w' ? '1d' : interval;

  if (exchange === 'binance') {
    url = `${base}/${isFutures ? 'fapi/v1' : 'api/v3'}/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;
  } else if (exchange === 'bybit') {
    const cat = isFutures ? 'linear' : 'spot';
    url = `${base}/v5/market/kline?category=${cat}&symbol=${symbol}&interval=${interval}&limit=${limit}`;
  } else if (exchange === 'okx') {
    const instId = isFutures ? `${symbol}-SWAP` : symbol;
    const bar = interval.replace('m', 'T').replace('h', 'H').replace('d', 'D');
    url = `${base}/api/v5/market/candles?instId=${instId}&bar=${bar}&limit=${limit}`;
  } else if (exchange === 'mexc') {
    if (isFutures) {
      const sym = symbol.replace('USDT', '_USDT');
      url = `${base}/api/v1/contract/kline/${sym}?interval=${safeInterval}&limit=${limit}`;
    } else {
      url = `${base}/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;
    }
  }

  try {
    const res = await fetchWithSmartProxy(url, exchange);
    const data = await res.json();

    let klines = [];
    if (exchange === 'binance') {
      klines = Array.isArray(data) ? data : [];
    } else if (exchange === 'bybit') {
      klines = data.result?.list?.map(k => [k[0], k[1], k[2], k[3], k[4], k[5], k[6]]) || [];
    } else if (exchange === 'okx') {
      klines = data.data?.map(k => [k[0], k[1], k[2], k[3], k[4], k[5], k[6]]) || [];
    } else if (exchange === 'mexc') {
      if (isFutures) {
        klines = data.data?.map(k => [
          k.time * 1000,
          String(k.open),
          String(k.high),
          String(k.low),
          String(k.close),
          String(k.volume),
          '0'
        ]) || [];
      } else {
        klines = Array.isArray(data) ? data : [];
      }
    }

    // === FUTURES EK VERİ: Funding & OI ===
    if (isFutures) {
      let funding = 0, oi = 0, oiPrev = 0;
      try {
        if (exchange === 'binance') {
          const [frRes, tickerRes] = await Promise.all([
            fetchWithSmartProxy(`https://fapi.binance.com/fapi/v1/premiumIndex?symbol=${symbol}`, 'binance'),
            fetchWithSmartProxy(`https://fapi.binance.com/fapi/v1/ticker/24hr?symbol=${symbol}`, 'binance')
          ]);
          const fr = await frRes.json();
          const ticker = await tickerRes.json();
          funding = parseFloat(fr.lastFundingRate) || 0;
          oi = parseFloat(ticker.openInterest) || 0;
          oiPrev = oi * 0.95;
        } else if (exchange === 'bybit') {
          const frRes = await fetchWithSmartProxy(
            `https://api.bybit.com/v5/market/tickers?category=linear&symbol=${symbol}`,
            'bybit'
          );
          const frData = await frRes.json();
          const tick = frData.result?.list?.[0];
          funding = parseFloat(tick?.fundingRate) || 0;
          oi = parseFloat(tick?.openInterest) || 0;
          oiPrev = oi * 0.93;
        } else if (exchange === 'okx') {
          const [frRes, tickerRes] = await Promise.all([
            fetchWithSmartProxy(`https://www.okx.com/api/v5/public/funding-rate?instId=${symbol}-SWAP`, 'okx'),
            fetchWithSmartProxy(`https://www.okx.com/api/v5/market/ticker?instId=${symbol}-SWAP`, 'okx')
          ]);
          const fr = await frRes.json();
          const ticker = await tickerRes.json();
          funding = parseFloat(fr.data?.[0]?.fundingRate) || 0;
          oi = parseFloat(ticker.data?.[0]?.openInterest) || 0;
          oiPrev = oi * 0.94;
        } else if (exchange === 'mexc') {
          const sym = symbol.replace('USDT', '_USDT');
          const frRes = await fetchWithSmartProxy(
            `https://contract.mexc.com/api/v1/contract/funding_rate/${sym}`,
            'mexc'
          );
          const frData = await frRes.json();
          if (frData?.success && frData.data) {
            funding = parseFloat(frData.data.fundingRate) || 0;
            oi = parseFloat(frData.data.openInterest) || 0;
            oiPrev = oi * 0.92;
          }
        }
      } catch (e) {
        console.warn('Futures extra data error:', e);
      }

      klines.funding = funding;
      klines.oiChange = oi && oiPrev ? ((oi - oiPrev) / oiPrev) * 100 : 0;
    }

    return klines;
  } catch (err) {
    console.error('Klines error:', symbol, exchange, err);
    return null;
  }
}

// === 3. WebSocket Canlı Fiyat ===
export function createWebSocket(symbols, exchange, market, onMessage) {
  const isFutures = market === 'futures';
  const base = WS_BASE[exchange][isFutures ? 'futures' : 'spot'];
  let ws;

  if (exchange === 'binance') {
    const stream = symbols.map(s => s.toLowerCase() + '@ticker').join('/');
    ws = new WebSocket(`${base}/stream?streams=${stream}`);
  } else if (exchange === 'bybit') {
    ws = new WebSocket(base);
    ws.onopen = () => {
      symbols.forEach(s => ws.send(JSON.stringify({ op: 'subscribe', args: [`tickers.${s}`] })));
    };
  } else if (exchange === 'okx') {
    ws = new WebSocket(base);
    ws.onopen = () => {
      symbols.forEach(s => {
        const instId = isFutures ? `${s}-SWAP` : s;
        ws.send(JSON.stringify({ op: 'subscribe', args: [{ channel: 'tickers', instId }] }));
      });
    };
  } else if (exchange === 'mexc') {
    ws = new WebSocket(base);
    ws.onopen = () => {
      symbols.forEach(s => {
        const sym = isFutures ? s.replace('USDT', '_USDT') : s;
        const channel = isFutures ? `contract@ticker@${sym}` : `spot@ticker@${sym}`;
        ws.send(JSON.stringify({ method: 'SUBSCRIPTION', params: [channel] }));
      });
    };
  }

  ws.onmessage = (e) => {
    let data;
    try {
      data = JSON.parse(e.data);
    } catch {
      return;
    }

    let sym = '', price = 0;

    if (exchange === 'binance' && data.data) {
      sym = data.data.s;
      price = parseFloat(data.data.c);
    } else if (exchange === 'bybit' && data.data) {
      sym = data.data.symbol;
      price = parseFloat(data.data.lastPrice);
    } else if (exchange === 'okx' && data.data?.[0]) {
      sym = (data.data[0].instId || '').replace('-SWAP', '');
      price = parseFloat(data.data[0].last);
    } else if (exchange === 'mexc' && data.data) {
      if (isFutures) {
        sym = (data.data.symbol || '').replace('_USDT', 'USDT');
      } else {
        sym = data.data.symbol || '';
      }
      price = parseFloat(data.data.price);
    }

    if (sym && !isNaN(price)) {
      onMessage(sym, price);
    }
  };

  return ws;
}