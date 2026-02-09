# Trading & Investing Integration Plan

How to turn Moltworker into a trading assistant using OpenClaw skills, webhooks, and automations.

## What's Already Built

- **TradingView webhook** — alerts POST to `/webhook/tradingview`, forwarded to OpenClaw agent, delivered to Telegram
- **PDH/PDL strategy doc** in `docs/forex-strat/summary.md` — full entry checklist, rules, journal notes
- **Browser automation skill** — can screenshot websites via CDP
- **R2 persistence** — workspace/memory backed up every 5 min
- **Hooks API** — `/hooks/agent` accepts messages with delivery targets and session keys

## What People Are Doing

### AI Trading Tools in the Wild
- **Trade Ideas (Holly AI)** — runs hundreds of simulations nightly, identifies best-performing strategies, makes live trade suggestions based on technical patterns and backtesting
- **TrendSpider** — automates technical analysis, AI Strategy Lab for building ML models without code
- **Tickeron** — AI pattern recognition scanning 40+ chart patterns in real-time across stocks, ETFs, forex, crypto
- **PineConnector** — bridges TradingView alerts to MT4/MT5 for auto-execution in under 1 second
- **TradersPost / WunderTrading / 3Commas** — webhook-to-broker bridges that convert TradingView alerts into live orders

### What We Can Do That They Can't
Our setup is unique because the AI agent has **full context** — it knows your strategy rules, your trade history, your risk parameters, and can reason about whether a setup is valid before acting. Commercial bots just execute blindly.

## Skill Ideas (Prioritized)

### Tier 1 — Quick Wins

#### 1. TradingView Alert Parser
**What**: Structured JSON alerts from TradingView instead of plain text. The agent parses pair, direction, timeframe, key levels, and validates against your rules.

**TradingView alert message format** (set this in your alert):
```json
{"pair":"EURUSD","direction":"long","tf":"15m","pdl":1.0850,"sweep":true,"displacement":true}
```

**Agent behavior**: Receives alert → checks against PDH/PDL checklist → responds with "Valid setup" or "Missing: H1 MSB not confirmed" → logs to journal.

#### 2. Trade Journal Automation
**What**: Agent auto-logs every trade to a structured markdown file in memory.

**Flow**: You tell the bot "Entered long EURUSD at 1.0855, SL 1.0830, TP 1.0905" → agent calculates R:R, logs entry with timestamp, reminds you of weekly trade count.

**Weekly review**: Ask the bot "Weekly review" → summarizes wins/losses, R:R stats, rule compliance, emotional notes.

#### 3. Strategy Rules in MEMORY.md
**What**: Move your PDH/PDL entry checklist into the bot's permanent memory so it always has context.

The agent can then:
- Remind you of rules before entries
- Say "You already have 2 trades this week" (your max)
- Validate setups against the checklist when you describe them

### Tier 2 — More Useful

#### 4. Chart Screenshot on Alert
**What**: When TradingView alert fires → browser skill auto-captures chart screenshot → sends to Telegram alongside the alert analysis.

Uses the existing `cloudflare-browser` CDP skill. You'd configure a TradingView chart URL template per pair.

#### 5. Daily Forex Briefing (Cron)
**What**: Morning cron job that:
- Fetches economic calendar (Forex Factory / Investing.com via browser scrape)
- Identifies high-impact news events for EUR/USD and GBP/USD
- Checks if today is NFP, FOMC, ECB, etc.
- Sends Telegram summary: "Today: ECB rate decision 13:45 UTC. Avoid trading EUR pairs 30 min before/after."

#### 6. Stock Scanner (Qullamaggie/Minervini)
**What**: Skill that queries free APIs for breakout candidates matching the Minervini trend template:
- Price above 150-day and 200-day SMA
- 150-day SMA above 200-day SMA
- RS rating high (relative to S&P 500)
- Price within 25% of 52-week high
- Volume expansion on breakout days

**Data sources** (free tier):
- Yahoo Finance API (via `yahoo-finance2` npm package)
- Alpha Vantage (500 requests/day free)
- Finviz screener (browser scrape via CDP skill)
- Twelve Data API (800 requests/day free)

**Delivery**: Daily Telegram message with top 5-10 candidates, or on-demand via "scan breakouts" command.

### Tier 3 — Advanced

#### 7. Position Tracker
**What**: Track open positions in agent memory. Agent knows your current exposure, can calculate portfolio risk, warns if you're overexposed to one pair/sector.

#### 8. Backtesting Assistant
**What**: You describe a setup → agent uses browser skill to pull historical data → runs simple backtest logic in a Node.js script → reports win rate and expectancy.

#### 9. Multi-Timeframe Confluence Check
**What**: When you get a 15m alert, agent auto-checks H1 and H4 context using TradingView's API or browser scrape. Reports confluence score.

#### 10. Broker Integration (PineConnector-style)
**What**: Forward validated alerts to MT4/MT5 via PineConnector or a broker API. Only after agent confirms the setup passes all checklist items.

**Risk**: This is auto-execution. Only do this after extensive testing with paper trading.

## Webhook Enhancement Plan

### Current Flow
```
TradingView → POST /webhook/tradingview → plain text → agent → Telegram
```

### Enhanced Flow
```
TradingView → POST /webhook/tradingview → structured JSON → agent validates → Telegram
                                                          → screenshot capture
                                                          → journal entry
                                                          → (optional) broker execution
```

### Session Key Strategy
- `tradingview-alerts` — general alerts (current)
- `eurusd-setups` — EUR/USD specific with pair context
- `gbpusd-setups` — GBP/USD specific
- `stock-scanner` — daily stock scan results
- `trade-journal` — journal entries and reviews

## Free Data APIs for Trading

| API | Free Tier | Good For |
|-----|-----------|----------|
| Yahoo Finance (`yahoo-finance2`) | Unlimited (unofficial) | Stock quotes, historical data, fundamentals |
| Alpha Vantage | 25 req/day (free key) | Forex rates, technical indicators |
| Twelve Data | 800 req/day | Real-time and historical for stocks/forex |
| Finnhub | 60 req/min | Stock quotes, news, earnings calendar |
| Exchange Rates API | 250 req/month | Forex rates |
| Finviz (scrape) | N/A (browser) | Stock screener with Minervini-style filters |
| Forex Factory (scrape) | N/A (browser) | Economic calendar, news events |

## Sources
- [Benzinga — Best AI Stock Trading Bots 2026](https://www.benzinga.com/money/best-ai-stock-trading-bots-software)
- [Monday.com — Best AI for Stock Trading](https://monday.com/blog/ai-agents/best-ai-for-stock-trading/)
- [Pragmatic Coders — Top AI Trading Tools](https://www.pragmaticcoders.com/blog/top-ai-tools-for-traders)
- [PineConnector — TradingView to MT4/MT5](https://www.pineconnector.com/)
- [TradersPost — TradingView Automated Trading](https://traderspost.io/signals/tradingview)
- [TrendSpider — No-Code Trading Bots](https://trendspider.com/product/trade-timing-and-execution-tools/)
