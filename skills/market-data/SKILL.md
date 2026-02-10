---
name: market-data
description: "Fetch real-time market data, technicals, stock screening, and economic calendar for commodities, stocks, and crypto"
metadata:
  openclaw:
    emoji: "📊"
    requires:
      env: ["FINANCE_BOT_TOKEN", "FINANCE_CHAT_ID"]
      bins: ["node"]
    user-invocable: true
---

# Market Data Skill

Provides real-time financial data across commodities, stocks, and crypto. Use this skill whenever the user asks about prices, market conditions, technical analysis, stock screening, or economic events.

**IMPORTANT**: All market data output should be sent via the Finance Bot (separate Telegram bot), NOT in the main conversation. After running any script, pipe the formatted result through `send-telegram.js`.

## Scripts

All scripts are in `{baseDir}/scripts/` and output JSON to stdout.

### 1. fetch-quotes.js — Price & Change Data
```bash
node {baseDir}/scripts/fetch-quotes.js '["AAPL","GC=F","bitcoin"]'
```
- Accepts mixed symbols: stock tickers, commodity futures (`GC=F`, `SI=F`, `CL=F`), crypto ids (`bitcoin`, `ethereum`)
- Returns: price, change, changePercent, volume, dayHigh, dayLow for each
- Crypto uses CoinGecko (free, no key). Stocks/commodities use yahoo-finance2.
- With no args, fetches entire default watchlist.

### 2. technicals.js — Technical Indicators
```bash
node {baseDir}/scripts/technicals.js AAPL
```
- Calculates from 250 days of historical data:
  - SMA 20, 50, 150, 200
  - RSI 14
  - ATR 14
  - Previous Day High/Low (PDH/PDL)
  - 52-week high/low
  - Distance from 52-week high (%)
- Works for stocks, commodities, and forex pairs.

### 3. screener.js — Minervini Trend Template
```bash
node {baseDir}/scripts/screener.js
node {baseDir}/scripts/screener.js /path/to/custom-watchlist.json
```
- Default watchlist: `{baseDir}/watchlist.json` (stocks array)
- Filters stocks matching Mark Minervini's trend template:
  - Price > 150-day SMA > 200-day SMA
  - 200-day SMA trending up (current > 1 month ago)
  - Price within 25% of 52-week high
  - Price at least 30% above 52-week low
- Returns ranked list with score and all indicator values.

### 4. calendar.js — Economic Calendar & Earnings
```bash
node {baseDir}/scripts/calendar.js
node {baseDir}/scripts/calendar.js 7
```
- Arg: number of days to look ahead (default: 3)
- Uses FINNHUB_API_KEY if available, otherwise returns limited data
- Returns: economic events and upcoming earnings with dates, impact, currency

### 5. send-telegram.js — Send via Finance Bot
```bash
node {baseDir}/scripts/send-telegram.js "📊 Market update message here"
echo "message" | node {baseDir}/scripts/send-telegram.js
```
- Sends messages via the separate Finance Telegram Bot (@JonaFinanceBot)
- Auto-chunks messages > 4000 chars
- Supports Markdown formatting
- Falls back to plain text if Markdown parsing fails

## Workflow

When the user asks for market data:
1. Run the appropriate script(s) to fetch data
2. Format the JSON output into a readable Telegram message
3. Send via `send-telegram.js`
4. Confirm to the user: "Sent market data to your Finance Bot"

Example full pipeline:
```bash
# Fetch quotes, then format and send
DATA=$(node {baseDir}/scripts/fetch-quotes.js '["AAPL","NVDA","GC=F","bitcoin"]')
# Format DATA into readable message, then:
node {baseDir}/scripts/send-telegram.js "📊 *Market Snapshot*
...formatted message..."
```

## Watchlist
Default watchlist at `{baseDir}/watchlist.json`. User can edit via file browser or ask you to modify it.

Categories:
- **stocks**: US equities (AAPL, NVDA, etc.)
- **crypto**: CoinGecko IDs (bitcoin, ethereum, etc.)
- **commodities**: Yahoo Finance futures symbols (GC=F for gold, SI=F for silver, CL=F for oil)

## Strategy Files
The user's trading strategies are in `/root/clawd/strategies/`. Read these files to understand their setup criteria when analyzing data. Compare fetched data against strategy rules and flag matches.

## Formatting Guidelines
When sending results via the Finance Bot, format as:
- Use bold for symbol names: *AAPL*
- Use monospace for numbers: `$185.42`
- Use emoji for direction: 📈 up, 📉 down, ➡️ flat
- Group by asset class with headers
- Keep messages concise — summarize, don't dump raw data
- For screener results, show top 10 max with key metrics
- Always compare against user's strategy rules when available

## Example Messages

**Price check:**
```
📊 *Market Snapshot*

*Stocks*
📈 *AAPL* `$185.42` +1.23%
📉 *TSLA* `$248.91` -0.87%

*Commodities*
📈 *Gold* `$2,341.50` +0.45%
➡️ *Silver* `$27.83` -0.12%
📉 *Oil* `$78.42` -1.23%

*Crypto*
📈 *BTC* `$67,450` +2.15%
📉 *ETH* `$3,210` -0.54%
```

**Technical analysis:**
```
📊 *AAPL Technical Analysis*

Price: `$185.42`
SMA 20: `$183.10` ✅ Above
SMA 50: `$179.55` ✅ Above
SMA 150: `$172.30` ✅ Above
SMA 200: `$168.45` ✅ Above
RSI 14: `58.3` (Neutral)
ATR 14: `$3.21`
PDH/PDL: `$186.10` / `$183.75`
52wk High: `$199.62` (-7.1%)

✅ Passes Minervini trend template (6/7 criteria)
```
