# Secrets Reference

All secrets managed via `npx wrangler secret put` or Cloudflare dashboard (Workers → Settings → Variables and Secrets).

## Currently Set (Production)

```
ANTHROPIC_API_KEY          # Anthropic API key for Claude
CF_ACCESS_AUD              # CF Access application audience tag
CF_ACCESS_TEAM_DOMAIN      # CF Access team domain (e.g. myteam.cloudflareaccess.com)
CF_ACCOUNT_ID              # Cloudflare account ID
DEBUG_ROUTES               # "true" to enable /debug/* endpoints
DEV_MODE                   # "true" to skip auth (local dev only)
MOLTBOT_GATEWAY_TOKEN      # Gateway token for Control UI access (?token=...)
R2_ACCESS_KEY_ID           # R2 API token access key
R2_SECRET_ACCESS_KEY       # R2 API token secret
TELEGRAM_BOT_TOKEN         # Telegram bot token from @BotFather
```

## Optional (Not Currently Set)

```
OPENCLAW_MODEL             # Model override (default: anthropic/claude-sonnet-4-5)
WEBHOOK_SECRET             # Shared secret for /webhook/* endpoints (TradingView alerts)
TELEGRAM_DM_POLICY         # "pairing" (default) or "open"
DISCORD_BOT_TOKEN          # Discord bot token
DISCORD_DM_POLICY          # "pairing" (default) or "open"
SLACK_BOT_TOKEN            # Slack bot token
SLACK_APP_TOKEN            # Slack app token
CDP_SECRET                 # Shared secret for /cdp browser automation
WORKER_URL                 # Public worker URL (required for CDP)
SANDBOX_SLEEP_AFTER        # Container sleep timeout: "never" (default), "10m", "1h"
R2_BUCKET_NAME             # Override R2 bucket name (default: moltbot-data)

# AI Gateway (alternative to direct ANTHROPIC_API_KEY)
CLOUDFLARE_AI_GATEWAY_API_KEY
CF_AI_GATEWAY_ACCOUNT_ID
CF_AI_GATEWAY_GATEWAY_ID
CF_AI_GATEWAY_MODEL        # "provider/model-id" e.g. "workers-ai/@cf/meta/llama-3.3-70b"
```

## Debug URLs

Replace `TOKEN` with your `MOLTBOT_GATEWAY_TOKEN`:

- **Control UI**: `https://moltbot-sandbox.jona-jell.workers.dev/?token=TOKEN`
- **Admin UI**: `https://moltbot-sandbox.jona-jell.workers.dev/_admin/`
- **Process list**: `https://moltbot-sandbox.jona-jell.workers.dev/debug/processes?token=TOKEN`
- **Process logs**: `https://moltbot-sandbox.jona-jell.workers.dev/debug/logs?id=PROC_ID&token=TOKEN`
- **Container config**: `https://moltbot-sandbox.jona-jell.workers.dev/debug/container-config?token=TOKEN`
- **Env vars**: `https://moltbot-sandbox.jona-jell.workers.dev/debug/env?token=TOKEN`

## Webhook URLs

- **TradingView**: `https://moltbot-sandbox.jona-jell.workers.dev/webhook/tradingview?secret=WEBHOOK_SECRET`
  - POST with alert text as body
  - Goes through OpenClaw agent → lands in memory/transcripts → delivers to Telegram
