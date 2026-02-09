# Moltworker Setup Guide

Complete guide to deploying OpenClaw on Cloudflare Workers + Sandbox containers.

## Prerequisites

- Node.js 18+
- npm
- Docker Desktop — **must be running before deploy**. If Docker isn't started, `npm run deploy` will fail silently or error out during the container image build step. Start Docker Desktop and wait for it to be fully ready before deploying.
- Cloudflare account with Workers Paid plan
- `wrangler` CLI (`npm install -g wrangler` or use `npx wrangler`)

## 1. Clone and Install

```bash
git clone <repo-url> moltworker
cd moltworker
npm install
```

## 2. Cloudflare Dashboard Setup

### 2a. Create R2 Bucket

1. Cloudflare Dashboard → R2 Object Storage → Create Bucket
2. Name: `moltbot-data`
3. Create an **R2 API Token** (R2 → Manage R2 API Tokens → Create):
   - Permissions: **Object Read & Write**
   - Scope: bucket `moltbot-data`
   - Save the **Access Key ID** and **Secret Access Key**

### 2b. Create Cloudflare Access Application (Optional — for auth)

1. Zero Trust → Access → Applications → Add Application → Self-hosted
2. Application name: `moltbot-sandbox`
3. Domain: `moltbot-sandbox.<your-subdomain>.workers.dev`
4. Add a policy (e.g., allow your email)
5. Copy the **Application Audience (AUD) tag** from the application overview
6. Your team domain is `<team-name>.cloudflareaccess.com`

### 2c. Create Telegram Bot (Optional)

1. Message `@BotFather` on Telegram → `/newbot`
2. Save the bot token (format: `1234567890:ABCxyz...`)

### 2d. Get Anthropic API Key

1. Go to console.anthropic.com → API Keys → Create Key
2. Save the key (starts with `sk-ant-...`)

## 3. Configure `wrangler.jsonc`

The file should already have the container and R2 binding configured. Verify these sections exist:

```jsonc
{
  "containers": [{ "class_name": "MoltbotContainer", "max_instances": 1 }],
  "r2_buckets": [{ "binding": "MOLTBOT_BUCKET", "bucket_name": "moltbot-data" }],
  "triggers": { "crons": ["*/5 * * * *"] }  // R2 sync every 5 min
}
```

## 4. Set Secrets

### CRITICAL: Windows Secret Paste Bug

**Do NOT paste secrets interactively** with `npx wrangler secret put`. On Windows, pasting tokens interactively can corrupt them (e.g., a token becomes `%16`). Use one of these methods instead:

**Method 1 — Cloudflare Dashboard (Recommended)**
Workers & Pages → your worker → Settings → Variables and Secrets → Add

**Method 2 — Echo pipe (CLI)**
```bash
echo YOUR_TOKEN_HERE | npx wrangler secret put SECRET_NAME
```

### Required Secrets

| Secret | Value |
|--------|-------|
| `ANTHROPIC_API_KEY` | Your Anthropic API key |
| `MOLTBOT_GATEWAY_TOKEN` | Any strong random string (used for admin UI auth) |
| `CF_ACCOUNT_ID` | Your Cloudflare account ID (from dashboard URL) |
| `R2_ACCESS_KEY_ID` | From step 2a |
| `R2_SECRET_ACCESS_KEY` | From step 2a |

### Optional Secrets

| Secret | Value |
|--------|-------|
| `TELEGRAM_BOT_TOKEN` | From step 2c |
| `CF_ACCESS_AUD` | From step 2b |
| `CF_ACCESS_TEAM_DOMAIN` | e.g. `myteam.cloudflareaccess.com` |
| `DEBUG_ROUTES` | `true` to enable `/debug/*` endpoints |
| `DEV_MODE` | `true` to skip CF Access auth (for testing) |
| `OPENCLAW_MODEL` | Model override, default: `anthropic/claude-sonnet-4-5` |
| `WEBHOOK_SECRET` | Shared secret for TradingView webhook |
| `SANDBOX_SLEEP_AFTER` | `never` (default) to prevent container sleeping |

> **Accidental secret name leak**: If you accidentally run `npx wrangler secret put sk-ant-api03-...` (using the key AS the name), delete it immediately via `npx wrangler secret delete sk-ant-api03-...` and rotate the key at console.anthropic.com.

## 5. Deploy

1. **Start Docker Desktop** — deploy will fail without it
2. Run:
```bash
npm run deploy
```

First deploy takes several minutes (builds container image). Subsequent deploys are faster unless you change the Dockerfile.

### Forcing a Container Rebuild

If you need a fresh container image (e.g., after updating `start-openclaw.sh` or `Dockerfile`), change the cache bust comment in `Dockerfile`:

```dockerfile
# Build cache bust: v2  ← change this number
```

## 6. Verify Deployment

### Health Check
```
GET https://moltbot-sandbox.<subdomain>.workers.dev/sandbox-health
→ {"status":"ok","service":"moltbot-sandbox","gateway_port":18789}
```

### Gateway Status
```
GET https://moltbot-sandbox.<subdomain>.workers.dev/api/status
→ {"ok":true,"status":"running","processId":"proc_..."}
```

First request after deploy triggers a cold start (1-3 minutes). The gateway needs to download/install OpenClaw inside the container.

### Admin UI
```
https://moltbot-sandbox.<subdomain>.workers.dev/_admin/
```
Requires CF Access authentication (or `DEV_MODE=true`).

### Debug Endpoints (if `DEBUG_ROUTES=true`)
```
/debug/processes?token=YOUR_GATEWAY_TOKEN
/debug/logs?id=PROC_ID&token=YOUR_GATEWAY_TOKEN
/debug/container-config?token=YOUR_GATEWAY_TOKEN
/debug/env?token=YOUR_GATEWAY_TOKEN
/debug/r2-mount?token=YOUR_GATEWAY_TOKEN
```

## 7. R2 Storage Backup

Once deployed with R2 secrets configured:
1. Go to Admin UI → Storage section
2. Click "Backup Now"
3. Should show last backup timestamp and synced directories: `openclaw/`, `skills/`, `workspace/`, `.last-sync`

Automatic cron backup runs every 5 minutes.

## 8. TradingView Webhook (Optional)

To receive TradingView alerts through your bot:

1. Set the `WEBHOOK_SECRET` secret (any strong random string)
2. In TradingView, create an alert and set the webhook URL to:
   ```
   https://moltbot-sandbox.<subdomain>.workers.dev/webhook/tradingview?secret=YOUR_WEBHOOK_SECRET
   ```
3. The alert body text is forwarded to OpenClaw as `[TradingView Alert] <your alert text>` and delivered to Telegram chat `1444376737`
4. Alerts go through the OpenClaw agent (session key: `tradingview-alerts`), so the bot can reason about them

## Important: Container Re-onboard Behavior

The container **force re-onboards on every restart**. `start-openclaw.sh` deletes the OpenClaw config file and runs `openclaw onboard --non-interactive` fresh each time. This means:

- **Any model changes made in the OpenClaw UI will be lost** on next restart/deploy
- To set a persistent model, use the `OPENCLAW_MODEL` env var (e.g., `anthropic/claude-sonnet-4-5`)
- All channel config (Telegram, Discord, etc.) is re-applied from env vars via the inline config patch in `start-openclaw.sh`
- This is intentional — it ensures the container always picks up the latest secrets/env vars

## Troubleshooting

### "Sync aborted: no config file found"

**Likely cause**: Code is using `startProcess()` + `getLogs()` instead of `sandbox.exec()` for one-shot commands. The `getLogs()` call has a race condition and returns empty stdout.

**Fix**: Use `sandbox.exec()` for any command where you need the output. See `src/gateway/sync.ts` for the correct pattern.

### Container returns exit code 126

**Cause**: Windows CRLF line endings in shell scripts. The Dockerfile includes `sed -i 's/\r$//' /root/start-openclaw.sh` as a safeguard, but if you add new scripts, ensure they also get the CRLF fix.

### Cloudflare Access "Unauthorized" loop

**Causes**:
- AUD tag mismatch (recreating the Access application generates a new AUD)
- Team domain typo
- Application domain doesn't match worker URL

**Quick workaround**: Set `DEV_MODE=true` temporarily to bypass auth while debugging.

### Telegram bot not responding / 401 errors

**Cause**: Bot token was corrupted during secret paste (see Windows secret paste bug above). Re-set the token using the dashboard UI or echo pipe method.

### Rate limit 429 on Claude Opus

Anthropic Tier 1 has a 30k input token/min limit for Opus. OpenClaw's system prompt can exceed this.

**Fix**: Set `OPENCLAW_MODEL=anthropic/claude-sonnet-4-5` (this is the default). Only use Opus if your tier supports it.

### Cold start takes forever

First request after deploy or container sleep triggers a full cold start (1-3 min). Set `SANDBOX_SLEEP_AFTER=never` to keep the container alive.

## Architecture Reference

See also:
- [`docs/architecture.md`](./architecture.md) — Three-layer stack overview
- [`docs/secrets-reference.md`](./secrets-reference.md) — All env vars and debug URLs
- [`docs/r2-sync-debugging.md`](./r2-sync-debugging.md) — Detailed R2 sync bug investigation
- [`docs/openclaw-internals.md`](./openclaw-internals.md) — OpenClaw gateway internals

## Adding New Environment Variables

Update three files:
1. `src/types.ts` — Add to `MoltbotEnv` interface
2. `src/gateway/env.ts` — Add passthrough in `buildEnvVars()`
3. `start-openclaw.sh` — Use in config patch if needed

## Sandbox API Quick Reference

| Method | Use For | Stdout Reliable? |
|--------|---------|-----------------|
| `sandbox.exec(cmd)` | One-shot commands (file checks, rsync, cat) | Yes |
| `sandbox.startProcess(cmd)` | Long-running servers (gateway) | Use `waitForLog()`/`waitForPort()` |
| `sandbox.mountBucket(name, path, opts)` | R2 FUSE mount | N/A |

**Never** use `startProcess()` + `getLogs()` for short-lived commands — stdout will be empty.
