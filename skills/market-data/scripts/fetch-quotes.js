#!/usr/bin/env node
// Fetch current price + change for mixed symbols (stocks, forex, crypto)
// Usage: node fetch-quotes.js '["AAPL","EURUSD=X","bitcoin"]'
//    or: node fetch-quotes.js AAPL EURUSD=X bitcoin

const yahooFinance = require('yahoo-finance2').default;

const COINGECKO_IDS = new Set([
  'bitcoin', 'ethereum', 'solana', 'ripple', 'cardano', 'dogecoin',
  'polkadot', 'avalanche-2', 'chainlink', 'polygon', 'litecoin',
  'uniswap', 'stellar', 'monero', 'cosmos', 'near', 'aptos',
  'arbitrum', 'optimism', 'sui', 'pepe', 'shiba-inu',
]);

function isCrypto(symbol) {
  return COINGECKO_IDS.has(symbol.toLowerCase());
}

async function fetchCryptoQuotes(ids) {
  if (ids.length === 0) return [];
  const url = `https://api.coingecko.com/api/v3/simple/price?ids=${ids.join(',')}&vs_currencies=usd&include_24hr_change=true&include_24hr_vol=true&include_high_low=true`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`CoinGecko error: ${res.status}`);
  const data = await res.json();

  return ids.map(id => {
    const d = data[id];
    if (!d) return { symbol: id, error: 'Not found' };
    return {
      symbol: id.toUpperCase(),
      type: 'crypto',
      price: d.usd,
      change: d.usd_24h_change ? d.usd * d.usd_24h_change / 100 : null,
      changePercent: d.usd_24h_change || null,
      volume: d.usd_24h_vol || null,
      dayHigh: d.usd_high_24h || null,
      dayLow: d.usd_low_24h || null,
    };
  });
}

async function fetchYahooQuotes(symbols) {
  if (symbols.length === 0) return [];
  const results = [];

  for (const symbol of symbols) {
    try {
      const quote = await yahooFinance.quote(symbol);
      const isForex = symbol.includes('=X');
      const isCommodity = symbol.includes('=F');
      const type = isCommodity ? 'commodity' : isForex ? 'forex' : 'stock';
      const displaySymbol = symbol.replace('=X', '').replace('=F', '');
      results.push({
        symbol: displaySymbol,
        type,
        price: quote.regularMarketPrice,
        change: quote.regularMarketChange,
        changePercent: quote.regularMarketChangePercent,
        volume: quote.regularMarketVolume || null,
        dayHigh: quote.regularMarketDayHigh,
        dayLow: quote.regularMarketDayLow,
        previousClose: quote.regularMarketPreviousClose,
        marketCap: quote.marketCap || null,
      });
    } catch (err) {
      results.push({ symbol, error: err.message });
    }
  }
  return results;
}

async function main() {
  let symbols;
  try {
    symbols = JSON.parse(process.argv[2]);
  } catch {
    symbols = process.argv.slice(2);
  }

  if (!symbols || symbols.length === 0) {
    // Load default watchlist
    const fs = require('fs');
    const path = require('path');
    const watchlist = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'watchlist.json'), 'utf8'));
    symbols = [...(watchlist.stocks || []), ...(watchlist.commodities || []), ...(watchlist.crypto || [])];
  }

  const cryptoIds = symbols.filter(s => isCrypto(s));
  const yahooSymbols = symbols.filter(s => !isCrypto(s));

  const [cryptoResults, yahooResults] = await Promise.all([
    fetchCryptoQuotes(cryptoIds),
    fetchYahooQuotes(yahooSymbols),
  ]);

  const results = [...yahooResults, ...cryptoResults];
  console.log(JSON.stringify(results, null, 2));
}

main().catch(err => {
  console.error(JSON.stringify({ error: err.message }));
  process.exit(1);
});
