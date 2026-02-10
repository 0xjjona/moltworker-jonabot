#!/usr/bin/env node
// Minervini Trend Template stock screener
// Usage: node screener.js [watchlist.json]

const yahooFinance = require('yahoo-finance2').default;
const fs = require('fs');
const path = require('path');

function calcSMA(closes, period) {
  if (closes.length < period) return null;
  return closes.slice(0, period).reduce((a, b) => a + b, 0) / period;
}

function calcRSI(closes, period = 14) {
  if (closes.length < period + 1) return null;
  let gains = 0, losses = 0;
  for (let i = 0; i < period; i++) {
    const diff = closes[i] - closes[i + 1];
    if (diff > 0) gains += diff;
    else losses -= diff;
  }
  if (losses === 0) return 100;
  const rs = (gains / period) / (losses / period);
  return 100 - (100 / (1 + rs));
}

async function analyzeStock(symbol) {
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - 365);

  const result = await yahooFinance.historical(symbol, {
    period1: startDate,
    period2: endDate,
    interval: '1d',
  });

  if (!result || result.length < 200) return null;

  result.sort((a, b) => new Date(b.date) - new Date(a.date));
  const closes = result.map(r => r.close);
  const highs = result.map(r => r.high);
  const lows = result.map(r => r.low);

  const price = closes[0];
  const sma50 = calcSMA(closes, 50);
  const sma150 = calcSMA(closes, 150);
  const sma200 = calcSMA(closes, 200);
  const sma200_1mo = closes.length >= 222 ? calcSMA(closes.slice(22), 200) : null;
  const rsi = calcRSI(closes, 14);
  const week52High = Math.max(...highs.slice(0, 252));
  const week52Low = Math.min(...lows.slice(0, 252));

  if (!sma50 || !sma150 || !sma200) return null;

  // Minervini criteria
  const criteria = {
    priceAbove150: price > sma150,
    priceAbove200: price > sma200,
    sma150Above200: sma150 > sma200,
    sma200Trending: sma200_1mo ? sma200 > sma200_1mo : false,
    within25OfHigh: ((week52High - price) / week52High * 100) <= 25,
    above30FromLow: ((price - week52Low) / week52Low * 100) >= 30,
    priceAbove50: price > sma50,
  };

  const score = Object.values(criteria).filter(Boolean).length;
  const pass = score >= 6; // At least 6 of 7 criteria

  return {
    symbol,
    price: Math.round(price * 100) / 100,
    sma50: Math.round(sma50 * 100) / 100,
    sma150: Math.round(sma150 * 100) / 100,
    sma200: Math.round(sma200 * 100) / 100,
    rsi: Math.round(rsi * 10) / 10,
    week52High: Math.round(week52High * 100) / 100,
    week52Low: Math.round(week52Low * 100) / 100,
    distFromHigh: Math.round((price - week52High) / week52High * 1000) / 10,
    score,
    pass,
    criteria,
  };
}

async function main() {
  const watchlistPath = process.argv[2] || path.join(__dirname, '..', 'watchlist.json');
  const watchlist = JSON.parse(fs.readFileSync(watchlistPath, 'utf8'));
  const stocks = watchlist.stocks || [];

  if (stocks.length === 0) {
    console.log(JSON.stringify({ error: 'No stocks in watchlist' }));
    process.exit(1);
  }

  const results = [];
  // Process in batches of 5 to avoid rate limits
  for (let i = 0; i < stocks.length; i += 5) {
    const batch = stocks.slice(i, i + 5);
    const batchResults = await Promise.all(
      batch.map(async (symbol) => {
        try {
          return await analyzeStock(symbol);
        } catch (err) {
          return { symbol, error: err.message };
        }
      })
    );
    results.push(...batchResults.filter(Boolean));
  }

  // Sort by score descending, then by distance from high
  results.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return (b.distFromHigh || -100) - (a.distFromHigh || -100);
  });

  console.log(JSON.stringify({
    scanned: stocks.length,
    passing: results.filter(r => r.pass).length,
    results,
  }, null, 2));
}

main().catch(err => {
  console.error(JSON.stringify({ error: err.message }));
  process.exit(1);
});
