#!/usr/bin/env node
// Fetch technical indicators for a symbol
// Usage: node technicals.js AAPL
//        node technicals.js EURUSD=X

const yahooFinance = require('yahoo-finance2').default;

function calcSMA(closes, period) {
  if (closes.length < period) return null;
  const slice = closes.slice(0, period);
  return slice.reduce((a, b) => a + b, 0) / period;
}

function calcRSI(closes, period = 14) {
  if (closes.length < period + 1) return null;
  let gains = 0, losses = 0;
  for (let i = 0; i < period; i++) {
    const diff = closes[i] - closes[i + 1]; // newest first
    if (diff > 0) gains += diff;
    else losses -= diff;
  }
  if (losses === 0) return 100;
  const rs = (gains / period) / (losses / period);
  return 100 - (100 / (1 + rs));
}

function calcATR(highs, lows, closes, period = 14) {
  if (highs.length < period + 1) return null;
  const trs = [];
  for (let i = 0; i < period; i++) {
    const tr = Math.max(
      highs[i] - lows[i],
      Math.abs(highs[i] - closes[i + 1]),
      Math.abs(lows[i] - closes[i + 1])
    );
    trs.push(tr);
  }
  return trs.reduce((a, b) => a + b, 0) / period;
}

async function main() {
  const symbol = process.argv[2];
  if (!symbol) {
    console.error(JSON.stringify({ error: 'Usage: node technicals.js SYMBOL' }));
    process.exit(1);
  }

  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - 365);

  const result = await yahooFinance.historical(symbol, {
    period1: startDate,
    period2: endDate,
    interval: '1d',
  });

  if (!result || result.length < 20) {
    console.error(JSON.stringify({ error: 'Insufficient data', count: result?.length }));
    process.exit(1);
  }

  // Sort newest first
  result.sort((a, b) => new Date(b.date) - new Date(a.date));

  const closes = result.map(r => r.close);
  const highs = result.map(r => r.high);
  const lows = result.map(r => r.low);

  const current = closes[0];
  const prevDayHigh = highs[1];
  const prevDayLow = lows[1];

  // 52-week high/low
  const week52High = Math.max(...highs.slice(0, 252));
  const week52Low = Math.min(...lows.slice(0, 252));

  // SMA at 1 month ago (for trend check)
  const sma200_1mo = closes.length >= 222 ? calcSMA(closes.slice(22), 200) : null;

  const output = {
    symbol: symbol.replace('=X', ''),
    price: current,
    sma20: calcSMA(closes, 20),
    sma50: calcSMA(closes, 50),
    sma150: calcSMA(closes, 150),
    sma200: calcSMA(closes, 200),
    sma200_1moAgo: sma200_1mo,
    rsi14: calcRSI(closes, 14),
    atr14: calcATR(highs, lows, closes, 14),
    pdh: prevDayHigh,
    pdl: prevDayLow,
    week52High,
    week52Low,
    distFromHigh: ((current - week52High) / week52High * 100),
    distFromLow: ((current - week52Low) / week52Low * 100),
    aboveSMA20: current > calcSMA(closes, 20),
    aboveSMA50: current > calcSMA(closes, 50),
    aboveSMA150: current > calcSMA(closes, 150),
    aboveSMA200: current > calcSMA(closes, 200),
    dataPoints: result.length,
  };

  // Round numeric values
  for (const [k, v] of Object.entries(output)) {
    if (typeof v === 'number') output[k] = Math.round(v * 10000) / 10000;
  }

  console.log(JSON.stringify(output, null, 2));
}

main().catch(err => {
  console.error(JSON.stringify({ error: err.message }));
  process.exit(1);
});
