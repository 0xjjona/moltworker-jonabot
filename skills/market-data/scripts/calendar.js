#!/usr/bin/env node
// Economic calendar + earnings
// Usage: node calendar.js [days_ahead]
// Requires FINNHUB_API_KEY env var for earnings data

const FINNHUB_KEY = process.env.FINNHUB_API_KEY;

function formatDate(date) {
  return date.toISOString().split('T')[0];
}

async function fetchEarnings(from, to) {
  if (!FINNHUB_KEY) return { skipped: true, reason: 'FINNHUB_API_KEY not set' };

  const url = `https://finnhub.io/api/v1/calendar/earnings?from=${from}&to=${to}&token=${FINNHUB_KEY}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Finnhub earnings error: ${res.status}`);
  const data = await res.json();

  return (data.earningsCalendar || []).map(e => ({
    type: 'earnings',
    symbol: e.symbol,
    date: e.date,
    hour: e.hour === 'bmo' ? 'Before Market Open' : e.hour === 'amc' ? 'After Market Close' : e.hour,
    epsEstimate: e.epsEstimate,
    revenueEstimate: e.revenueEstimate,
  }));
}

async function fetchEconomicCalendar(from, to) {
  if (!FINNHUB_KEY) return { skipped: true, reason: 'FINNHUB_API_KEY not set' };

  const url = `https://finnhub.io/api/v1/calendar/economic?from=${from}&to=${to}&token=${FINNHUB_KEY}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Finnhub economic error: ${res.status}`);
  const data = await res.json();

  return (data.economicCalendar || [])
    .filter(e => e.impact === 'high' || e.impact === 'medium')
    .map(e => ({
      type: 'economic',
      event: e.event,
      country: e.country,
      currency: e.currency,
      date: e.date,
      time: e.time,
      impact: e.impact,
      forecast: e.forecast,
      previous: e.prev,
    }));
}

async function fetchCryptoEvents() {
  // Use CoinGecko's free events endpoint for major crypto events
  try {
    const url = 'https://api.coingecko.com/api/v3/events';
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = await res.json();
    return (data.data || []).slice(0, 10).map(e => ({
      type: 'crypto_event',
      title: e.title,
      description: e.description,
      startDate: e.start_date,
      coins: e.coins?.map(c => c.name) || [],
    }));
  } catch {
    return [];
  }
}

async function main() {
  const daysAhead = parseInt(process.argv[2]) || 3;
  const from = formatDate(new Date());
  const to = formatDate(new Date(Date.now() + daysAhead * 86400000));

  const [earnings, economic, crypto] = await Promise.all([
    fetchEarnings(from, to).catch(err => ({ error: err.message })),
    fetchEconomicCalendar(from, to).catch(err => ({ error: err.message })),
    fetchCryptoEvents().catch(err => ({ error: err.message })),
  ]);

  console.log(JSON.stringify({
    range: { from, to, days: daysAhead },
    earnings,
    economic,
    crypto,
  }, null, 2));
}

main().catch(err => {
  console.error(JSON.stringify({ error: err.message }));
  process.exit(1);
});
