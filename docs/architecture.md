# Moltworker Architecture

## Three-Layer Stack

```
User (Browser/Telegram/Discord/Slack)
  │
  ▼
Cloudflare Worker (Edge)          ← src/index.ts, Hono app
  │  - CF Access JWT auth
  │  - WebSocket relay
  │  - Request proxying
  ▼
Sandbox Container                 ← Dockerfile + start-openclaw.sh
  │  - OpenClaw gateway (port 18789)
  │  - AI chat, channel bots, skills
  ▼
R2 Storage                        ← Optional persistence
     - Config, workspace, skills synced every 5 min
```

## Worker (Edge Tier)

The Cloudflare Worker is a Hono app that handles:

1. **Routing** — public routes (health, logos), protected routes (admin, debug), catch-all proxy
2. **Authentication** — CF Access JWT validation for admin routes, gateway token for Control UI
3. **WebSocket relay** — Intercepts WS connections, injects gateway token, relays messages bidirectionally
4. **Container lifecycle** — Creates/retrieves Sandbox Durable Object, starts OpenClaw process, waits for port 18789

### Middleware Chain (in order)
1. Logging (redacted sensitive params)
2. Sandbox initialization (Durable Object)
3. Public routes (no auth)
4. Config validation (checks API keys exist)
5. CF Access auth (JWT)
6. Protected routes (admin, debug, CDP)
7. Catch-all → proxy to container

### Key Source Files
- `src/index.ts` — Main app + middleware
- `src/types.ts` — `MoltbotEnv` interface (all secrets/bindings)
- `src/auth/` — CF Access JWT validation
- `src/gateway/env.ts` — Worker secrets → container env var mapping
- `src/gateway/process.ts` — Start OpenClaw, wait for port
- `src/gateway/r2.ts` — Mount R2 via s3fs
- `src/gateway/sync.ts` — Rsync to R2
- `src/routes/` — All route handlers

## Container (Compute Tier)

Runs on `cloudflare/sandbox:0.7.0` with Node.js 22 and OpenClaw installed globally.

### Startup Flow (`start-openclaw.sh`)
1. **Restore from R2** — If backup exists and is newer than local, copy config/workspace/skills
2. **Force re-onboard** — `openclaw onboard --non-interactive` with current env vars
3. **Patch config** — Inline Node.js script sets: channels (Telegram/Discord/Slack), gateway auth token, model override, trusted proxies
4. **Start gateway** — `openclaw gateway --port 18789 --verbose --allow-unconfigured --bind lan`

### Container Paths
- `/root/.openclaw/openclaw.json` — OpenClaw config
- `/root/clawd/` — Workspace (IDENTITY.md, MEMORY.md, memory/, assets/)
- `/root/clawd/skills/` — Installed skills
- `/data/moltbot/` — R2 mount point (when mounted)

## R2 Storage (Persistence Tier)

### Backup Structure
```
R2 bucket (moltbot-data):
├── .last-sync              ← ISO timestamp
├── openclaw/               ← Config files
│   └── openclaw.json
├── workspace/              ← Agent workspace
│   ├── IDENTITY.md
│   ├── MEMORY.md
│   ├── memory/
│   └── assets/
└── skills/                 ← Custom skills
```

### Sync
- **Automatic**: Cron every 5 minutes (`*/5 * * * *`)
- **Manual**: `POST /api/admin/storage/sync`
- Uses `rsync` to sync `/root/.openclaw/` and `/root/clawd/` to `/data/moltbot/`

### Restore
On startup, compares `.last-sync` timestamps. If R2 is newer, restores. Supports legacy migration from `.clawdbot/` format.

## Adding a New Secret

Three files must be updated:
1. `src/types.ts` — Add to `MoltbotEnv` interface
2. `src/gateway/env.ts` — Add passthrough in `buildEnvVars()`
3. `start-openclaw.sh` — Use in config patch if needed

## Container Rebuild

Change the `# Build cache bust:` comment in `Dockerfile` to force a fresh image build.

## Costs

~$34.50/mo for 24/7 standard-1 instance (0.5 vCPU, 4 GiB RAM, 8 GB disk) + $5 Workers Paid plan. Configure `SANDBOX_SLEEP_AFTER` to reduce costs.
