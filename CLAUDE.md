# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

moltworker runs [OpenClaw](https://github.com/openclaw/openclaw) (personal AI assistant) in a Cloudflare Sandbox container. The Worker handles routing, auth, and WebSocket proxying; the container runs the OpenClaw gateway.

## Commands

```bash
npm run build          # Build worker + admin UI (Vite)
npm run deploy         # Build + wrangler deploy
npm run dev            # Vite dev server
npm run start          # wrangler dev (local worker)
npm run typecheck      # tsc --noEmit
npm run lint           # oxlint src/
npm run lint:fix       # oxlint --fix src/
npm run format         # oxfmt --write src/
npm run format:check   # oxfmt --check src/
npm run test           # vitest run
npm run test:watch     # vitest (watch mode)
npm run test:coverage  # vitest run --coverage
```

Run a single test file: `npx vitest run src/auth/jwt.test.ts`

## Architecture

### Three-Layer Stack

1. **Cloudflare Worker** (`src/index.ts`) — Hono app on the edge. Handles request routing, CF Access JWT auth, WebSocket relay, and proxies everything else to the container on port 18789.
2. **Sandbox Container** (`Dockerfile` + `start-openclaw.sh`) — Runs `openclaw gateway`. Handles AI chat, Telegram/Discord/Slack bots, skills execution.
3. **R2 Storage** — Optional persistence. Cron syncs config/workspace/skills every 5 min via rsync.

### Worker Source Layout (`src/`)

- `index.ts` — Main Hono app with middleware chain (logging → sandbox init → public routes → config validation → CF Access auth → protected routes → catch-all proxy)
- `types.ts` — `MoltbotEnv` interface (all Worker env bindings/secrets)
- `config.ts` — Centralized constants
- `auth/` — CF Access JWT validation middleware (`jose` library)
- `gateway/` — Container management:
  - `env.ts` — Maps Worker secrets → container env vars (`buildEnvVars`)
  - `process.ts` — Starts OpenClaw gateway process, waits for port 18789
  - `r2.ts` — Mounts R2 bucket via s3fs
  - `sync.ts` — Rsync config/workspace/skills to R2
  - `utils.ts` — WebSocket relay, health checks
- `routes/` — Route handlers:
  - `public.ts` — Unauthenticated (health, logos, status)
  - `api.ts` — Admin API (device approval, storage sync, gateway restart)
  - `admin-ui.ts` — React admin UI pages
  - `debug.ts` — Debug endpoints (processes, logs, env, config)
  - `cdp.ts` — Chrome DevTools Protocol WebSocket shim (via Browser Rendering binding)
- `client/` — React admin UI (Vite-built, served from ASSETS binding at `/_admin/`)

### Container Startup Flow (`start-openclaw.sh`)

1. Restore config/workspace/skills from R2 if backup is newer
2. Force re-onboard: `openclaw onboard --non-interactive` (picks up current env vars)
3. Patch config via inline Node.js script (channels, gateway auth, model override, trusted proxies)
4. Start: `openclaw gateway --port 18789`

### Key Env Var Mapping

Worker secret `MOLTBOT_GATEWAY_TOKEN` → container env `OPENCLAW_GATEWAY_TOKEN`. The `buildEnvVars()` function in `src/gateway/env.ts` handles all mappings. When adding a new secret, update three places:
1. `src/types.ts` — Add to `MoltbotEnv` interface
2. `src/gateway/env.ts` — Add passthrough line
3. `start-openclaw.sh` — Use in config patch if needed

### Skills

Skills live in `./skills/` and are copied into the container at build time (`COPY skills/ /root/clawd/skills/`). Each skill is a directory with a `SKILL.md` metadata file. Currently includes `cloudflare-browser` for CDP-based browser automation.

### Forcing Container Rebuild

Change the `# Build cache bust:` comment in `Dockerfile` to force a fresh container image build.

### Windows

Shell scripts must have LF line endings. The Dockerfile runs `sed -i 's/\r$//'` on `start-openclaw.sh` as a safeguard.
