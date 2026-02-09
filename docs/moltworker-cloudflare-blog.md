# Moltworker — Cloudflare Blog Reference

Source: [blog.cloudflare.com/moltworker-self-hosted-ai-agent](https://blog.cloudflare.com/moltworker-self-hosted-ai-agent/)

Moltworker is a proof of concept (not a Cloudflare product) that runs OpenClaw (formerly Moltbot) on Cloudflare's Developer Platform instead of dedicated hardware.

## Architecture

```
User → Cloudflare Access (auth) → Worker (router/proxy) → Sandbox Container (OpenClaw gateway)
                                                        ↘ R2 (persistence)
                                                        ↘ Browser Rendering (CDP)
                                                        ↘ AI Gateway (model routing)
```

Six components:
1. **Entrypoint Worker** — Hono app, API router, WebSocket proxy
2. **Sandbox Container** — isolated Linux container running OpenClaw gateway
3. **R2 Object Storage** — persistent filesystem via `sandbox.mountBucket()`
4. **Browser Rendering** — headless Chrome via CDP (screenshots, scraping, form filling)
5. **AI Gateway** — routes model requests to Anthropic/OpenAI with cost tracking and fallback
6. **Zero Trust Access** — JWT-based authentication for admin UI and APIs

## Sandbox SDK

The container SDK provides:

```js
const sandbox = getSandbox(env.Sandbox, 'user-123');
await sandbox.mkdir('/workspace/project/src', { recursive: true });
const version = await sandbox.exec('node -v');  // one-shot command
```

Key methods:
- `sandbox.exec(cmd)` — run command, get stdout/stderr/exitCode
- `sandbox.startProcess(cmd)` — background process (servers)
- `sandbox.mountBucket(name, path, opts)` — mount R2 as filesystem
- `sandbox.mkdir(path, opts)` — create directories

## R2 Storage (Persistence)

Containers are ephemeral — data is lost on restart. R2 solves this:
- `sandbox.mountBucket()` mounts R2 bucket as a filesystem partition via s3fs FUSE
- Stores: session memory, conversation history, workspace files, skills
- Cron sync (rsync) every 5 minutes as backup
- On startup, restores from R2 if backup is newer than local

## Browser Rendering

Two-layer approach:
1. **CDP Proxy** — thin proxy from container to Cloudflare Browser Rendering (Puppeteer)
2. **Skill Injection** — browser skill added to OpenClaw on startup

The agent sees a local Chrome DevTools Protocol port and can:
- Navigate websites
- Fill forms
- Take screenshots
- Capture videos (ffmpeg in container)
- Scrape data

## AI Gateway

Routes AI requests with centralized control:
- Cost tracking and request logs
- Model fallback configuration (e.g., Sonnet → Haiku if rate limited)
- Provider switching without redeployment
- Set `ANTHROPIC_BASE_URL` env var — no code changes needed

## Zero Trust Access

Protects the admin UI and API endpoints:
- Policy-based access (allow by email, group, etc.)
- Automatic JWT tokens on requests
- Worker validates JWT on protected routes
- User activity logging

## Node.js Compatibility

Cloudflare tested the 1,000 most popular npm packages — only 15 (1.5%) didn't work. This means most Node.js code runs directly in Workers/Containers without modification.

## What It Demonstrated

- Route finding via Google Maps (browser automation + screenshots)
- Restaurant search (web browsing + image retrieval)
- Video generation (ffmpeg in container)
- Full AI assistant with Telegram/WhatsApp/Discord integration
- Persistent memory across container restarts

## Deployment

Requirements:
- Cloudflare account
- Workers Paid plan ($5/month minimum — required for Sandbox Containers)
- R2, Browser Rendering, AI Gateway all have free tiers
- GitHub repo: `github.com/cloudflare/moltworker`

## Key Takeaway

Moltworker proves you can run a full self-hosted AI agent on Cloudflare's edge without dedicated hardware. The Worker handles routing and auth, the container runs the agent, R2 provides persistence, and Browser Rendering gives the agent eyes on the web.

It's a proof of concept — Cloudflare said they'd contribute upstream to OpenClaw with Cloudflare-specific skills.
