# Moltworker Operations Guide

Practical knowledge for running and troubleshooting the moltworker setup. Add findings as you go.

## Key Behavior

### Container Startup Takes Time
- After every deploy, the Durable Object resets and the container restarts from scratch
- Full startup: R2 mount → rsync restore → `openclaw onboard` → config patch → gateway start
- **This takes 2-3 minutes. Be patient. Don't refresh the page repeatedly.**
- Repeatedly loading the site during startup can spawn duplicate gateway processes
- Just open the site once and wait

### Deploys Kill Everything
- Every `npm run deploy` triggers "Durable Object reset because its code was updated"
- This kills all running processes, WebSocket connections, and Telegram polling
- Sessions and memory are restored from R2 backup on next startup (if backup completed)
- Onboard only runs on fresh installs (no config file) — existing config is preserved
- **Never deploy twice in quick succession** — the second deploy kills the first one's startup

### The Bot Debugs Itself
- OpenClaw is an AI agent — when something is wrong, it will try to diagnose and fix itself
- It runs `openclaw status`, reads docs, patches config, and restarts the gateway
- This is useful but burns a lot of tokens (each tool call = full API round trip with system prompt)
- A single debugging session can use 500k+ tokens and take several minutes
- The self-restart causes a "gateway restarting" disconnect (WebSocket close 1012)

## Common Disconnects

| Code | Meaning | Cause |
|------|---------|-------|
| 1006 | Abnormal closure | Durable Object evicted (CPU limit, crash) |
| 1008 | Pairing required | Device not paired — send `/pair` to bot |
| 1012 | Service restart | Gateway restarting (deploy, config change, bot self-fix) |

### Gateway Shows 0 Processes / Never Starts
- The `/api/status` and `/_admin/` endpoints **do not start the gateway** — they only check status
- Only the main page (`/`) or a proxied request triggers `ensureMoltbotGateway()`
- If you're stuck on "Waiting for Moltworker to load" or see 0 processes, visit `https://moltbot-sandbox.jona-jell.workers.dev/` directly
- A Telegram message to the bot will also trigger the gateway start

### "Waiting for Moltworker to load..."
- The gateway hasn't started yet or crashed during startup
- Open the main page (`/`) and wait 2-3 minutes — don't use `/_admin/` or `/api/status`
- If it persists, check `wrangler tail` logs for errors

### Gateway Disconnects After ~5 Minutes
- The cron sync job (rsync over s3fs to R2) can exceed Cloudflare Worker CPU limits
- When the CPU limit is exceeded, the Durable Object is killed, taking the WebSocket with it
- Fixed by reducing cron from every 5 min to every 15 min
- If it still happens, consider increasing to every 30 min in `wrangler.jsonc`

## Known Issues & Fixes

### `cp -a` Fails on Existing Files
- **Symptom**: Gateway exits with code 1, stderr: `cp: cannot create directory ... File exists`
- **Cause**: OpenClaw 2026.2.9 creates default files during install. When R2 backup is restored with `cp -a`, it fails on existing dirs/files. With `set -e`, the script dies.
- **Fix**: Replaced all `cp -a` with `rsync -r --no-times` in `start-openclaw.sh`
- **Note**: `--no-times` is required because s3fs (R2 mount) doesn't support `utimes`

### `plugins.entries.telegram.enabled: false` Override
- **Symptom**: Telegram channel shows as empty in `openclaw status`, bot doesn't respond
- **Cause**: Old R2 backup contains `plugins.entries.telegram.enabled: false` which overrides `channels.telegram.enabled: true`
- **Fix**: Config patch in `start-openclaw.sh` deletes stale `plugins.entries` for configured channels
- **Note**: The bot can also fix this itself via `config.patch` but the fix doesn't survive restarts without the startup script patch

### Zombie Processes from `startProcess()`
- **Symptom**: Dozens of `mount | grep` processes, site extremely slow or unresponsive
- **Cause**: `isR2Mounted()` used `startProcess()` which creates processes that never exit
- **Fix**: Changed to `sandbox.exec()` in `src/gateway/r2.ts`
- **Rule**: Use `sandbox.exec()` for one-shot commands, `startProcess()` only for long-running processes

### Rate Limit 429 (30k tokens/min)
- **Cause**: Anthropic Tier 1 limit. OpenClaw's system prompt is 5-10k tokens, sent with every API call
- **Mitigations**:
  - `bootstrapMaxChars: 8000` in config (default is 20000)
  - Upgrade to Anthropic Tier 2 ($40 spent = 80k tokens/min)
  - Use `/context list` in the bot to see what's consuming tokens

## Environment Variables

Adding a new env var requires updating 3 files:
1. `src/types.ts` — Add to `MoltbotEnv` interface
2. `src/gateway/env.ts` — Add passthrough in `buildEnvVars()`
3. `start-openclaw.sh` — Use in config patch if needed

Set secrets via Cloudflare dashboard (not `wrangler secret put` — can corrupt tokens on Windows).

## Forcing Container Rebuild

Change the `# Build cache bust:` comment in `Dockerfile` to any new value.

## Useful Debug URLs

All require CF Access auth:
- `/debug/processes` — List running container processes
- `/debug/logs` — Recent container logs
- `/debug/config` — Current OpenClaw config
- `/_admin/` — Admin UI (devices, files, storage, gateway controls)

## Cron Sync

- Runs every 15 minutes (configured in `wrangler.jsonc`)
- Syncs config, workspace, and skills from container to R2 via rsync
- If it exceeds CPU limit, it kills the Durable Object — reduce frequency if unstable
- Manual sync: click "Backup Now" in admin UI or hit `/api/admin/storage` POST

## Tips

- After deploying, open the site once and wait — don't spam refresh
- If the bot stops responding on Telegram, try `/pair` first
- Check `wrangler tail` for real-time logs (but the connection breaks on deploys)
- The bot's memory resets on every container restart — R2 backup restores it but there's always a small gap
- Telegram pairing may need to be redone after container restarts
