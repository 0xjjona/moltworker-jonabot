# OpenClaw Knowledge Base

General reference for OpenClaw concepts, APIs, and configuration. Sourced from [docs.openclaw.ai](https://docs.openclaw.ai/).

## Overview

OpenClaw is a self-hosted gateway that connects chat apps (Telegram, WhatsApp, Discord, iMessage, Slack, Signal, etc.) to AI agents. It runs as a single process, routes messages, manages sessions, and executes skills/tools.

- GitHub: 60,000+ stars
- ClawHub skill registry: 5,700+ community skills
- Supports 15+ chat channels
- Node.js 22+ required

## Architecture

Hub-and-spoke model:
- **Gateway** — central orchestrator (port 18789 default)
- **Channels** — chat platform adapters (Telegram, WhatsApp, etc.)
- **Agent Runtime** — processes messages with AI model
- **Skills** — extensible tool bundles
- **Memory** — persistent markdown files
- **Sessions** — isolated conversation threads
- **Cron** — built-in job scheduler
- **Hooks/Webhooks** — event-driven automation

Config lives at `~/.openclaw/openclaw.json`.

---

## Sessions

Sessions are the core isolation mechanism. Each session is an independent conversation thread with its own history.

### How Session Keys Work

Sessions are created on-demand. The `sessionKey` determines isolation:

| Source | Key Format | Isolation |
|--------|-----------|-----------|
| DMs (default) | `agent:<agentId>:<mainKey>` | All DMs share one session |
| DMs (per-peer) | `agent:<agentId>:dm:<peerId>` | One session per person |
| Groups | `agent:<agentId>:<channel>:group:<id>` | One per group |
| Cron jobs | `cron:<jobId>` | One per cron job |
| Webhooks | `hook:<uuid>` (default) or custom `sessionKey` | One per webhook call, or persistent if you reuse the key |

### Session Lifecycle

- **Daily reset**: Sessions expire at 4:00 AM gateway time (configurable)
- **Idle reset**: Optional `idleMinutes` sliding window
- **Manual**: `/new` or `/reset` commands start fresh
- **Context pruning**: Old tool results trimmed before LLM calls (transcripts preserved)

### What's Shared vs Isolated

| Shared (all sessions) | Isolated (per session) |
|----------------------|----------------------|
| `MEMORY.md` (long-term memory) | Conversation history |
| `IDENTITY.md`, `AGENTS.md` (persona) | JSONL transcripts |
| Installed skills | Session-specific context |
| Model configuration | |

### DM Scope Options

Configure in `openclaw.json` under `sessions.dmScope`:
- `main` — all DMs share one session (default)
- `per-peer` — isolated by sender
- `per-channel-peer` — isolated by channel + sender
- `per-account-channel-peer` — full isolation

---

## Memory

Plain markdown files are the source of truth. The model only retains what's written to disk.

### Two Layers

1. **`MEMORY.md`** — curated long-term storage (preferences, facts, decisions). Loaded in private sessions only (not groups).
2. **`memory/YYYY-MM-DD.md`** — daily append-only logs. Today's + yesterday's loaded at session start.

### Automatic Memory Flush

Before context compaction, OpenClaw triggers a silent turn reminding the model to save important info to disk. Runs once per compaction cycle.

### Memory Search

Two tools:
- **`memory_search`** — vector similarity + BM25 keyword search across markdown files (~400 token chunks)
- **`memory_get`** — read specific memory files by path

Search backends: SQLite (default), QMD (experimental local), or remote embeddings (OpenAI/Gemini/Voyage).

Hybrid search: 70% vector + 30% BM25 by default.

---

## Skills

Skills are extensible tool bundles with a `SKILL.md` metadata file.

### Directory Structure

```
skills/
└── my-skill/
    ├── SKILL.md          # Required: metadata + instructions
    └── scripts/
        └── tool.js       # Optional: executable scripts
```

### SKILL.md Format

```yaml
---
name: my-skill
description: "What this skill does"
metadata:
  openclaw:
    emoji: "📊"
    requires:
      env: ["API_KEY"]
      bins: ["node"]
    user-invocable: true
---

# Instructions

Markdown instructions for the agent on how/when to use this skill.
Use `{baseDir}` to reference the skill's directory.
```

### Loading Precedence

1. `<workspace>/skills/` (highest priority)
2. `~/.openclaw/skills/` (managed)
3. Bundled skills (lowest)

Same-name skills: workspace wins over managed wins over bundled.

### ClawHub

Public skill registry at clawhub.com:
```bash
clawhub install <skill-slug>    # Install a skill
clawhub update --all            # Update all
clawhub sync --all              # Sync
```

### Configuration

Override skill settings in `openclaw.json`:
```json
{
  "skills": {
    "entries": {
      "my-skill": {
        "enabled": true,
        "env": { "API_KEY": "value" }
      }
    }
  }
}
```

### Token Cost

Skills are injected as XML into the system prompt. Cost: ~195 chars base + ~97 chars per skill.

---

## Webhooks (HTTP API)

External HTTP endpoints to trigger agent actions. Enable in config:

```json
{
  "hooks": {
    "enabled": true,
    "token": "shared-secret",
    "path": "/hooks"
  }
}
```

### Authentication

In order of preference:
1. `Authorization: Bearer <token>` header (recommended)
2. `x-openclaw-token: <token>` header
3. `?token=<token>` query param (deprecated)

### POST /hooks/agent — Isolated Agent Turn

The main endpoint for automations. Runs an agent turn in its own session.

```json
{
  "message": "Your prompt here",
  "sessionKey": "my-automation",
  "name": "Morning Briefing",
  "deliver": true,
  "channel": "telegram",
  "to": "1444376737",
  "model": "anthropic/claude-sonnet-4-5",
  "thinking": "medium",
  "timeoutSeconds": 120
}
```

| Field | Required | Description |
|-------|----------|-------------|
| `message` | Yes | The prompt |
| `sessionKey` | No | Reuse for multi-turn conversations. Default: random `hook:<uuid>` |
| `name` | No | Human label for session summaries |
| `deliver` | No | Send response to chat channel (default: true) |
| `channel` | No | `telegram`, `whatsapp`, `discord`, `slack`, `signal`, `imessage`, `last` |
| `to` | No | Recipient ID (chat ID, phone number, etc.) |
| `model` | No | Model override |
| `thinking` | No | `low`, `medium`, `high` |
| `timeoutSeconds` | No | Max run duration |

**Response**: 202 Accepted (async)

**Key insight**: Reusing the same `sessionKey` across calls maintains conversation context. Different keys = completely isolated.

### POST /hooks/wake — System Event (Main Session)

Injects a system event into the main session:

```json
{
  "text": "New email received",
  "mode": "now"
}
```

**Response**: 200 OK (sync)

### Custom Mapped Endpoints

Define custom webhook names via `hooks.mappings` for transforming arbitrary payloads (e.g., Gmail, GitHub).

---

## Cron Jobs

Built-in scheduler. Jobs persist across gateway restarts at `~/.openclaw/cron/jobs.json`.

### Two Session Modes

**Main session** (`--session main`): Enqueues system event into normal heartbeat flow. Uses existing conversation context.

**Isolated session** (`--session isolated`): Runs in fresh `cron:<jobId>` session. No history carryover. Best for background/noisy tasks.

### CLI Examples

```bash
# Morning briefing to Telegram every day at 7am
openclaw cron add \
  --name "Morning brief" \
  --cron "0 7 * * *" \
  --tz "Europe/Berlin" \
  --session isolated \
  --message "Generate my morning briefing: weather, calendar, news, todos." \
  --announce \
  --channel telegram \
  --to "1444376737"

# One-shot reminder in 20 minutes
openclaw cron add \
  --name "Check trades" \
  --at "20m" \
  --session main \
  --system-event "Check open positions" \
  --wake now \
  --delete-after-run

# Weekly deep analysis with Opus
openclaw cron add \
  --name "Weekly review" \
  --cron "0 18 * * 5" \
  --tz "Europe/Berlin" \
  --session isolated \
  --message "Generate weekly trading review" \
  --model opus \
  --thinking high \
  --announce \
  --channel telegram \
  --to "1444376737"
```

### Delivery Options

```json
{
  "delivery": {
    "mode": "announce",
    "channel": "telegram",
    "to": "1444376737",
    "bestEffort": true
  }
}
```

Modes: `announce` (deliver to chat) or `none` (run silently).

Telegram topics: `-1001234567890:topic:123`

### Model & Thinking Overrides

Cron jobs can override the model per-job:
```json
{
  "payload": {
    "kind": "agentTurn",
    "message": "Deep analysis prompt",
    "model": "opus",
    "thinking": "high"
  }
}
```

### Failure Handling

Exponential backoff: 30s → 1m → 5m → 15m → 60m. Resets after success.

---

## Multi-Agent Routing

Run multiple isolated "brains" on one gateway.

### What Defines an Agent

Each agent has:
- **Workspace** — files, persona (AGENTS.md, SOUL.md, USER.md)
- **State directory** — `~/.openclaw/agents/<agentId>/agent/`
- **Session store** — `~/.openclaw/agents/<agentId>/sessions/`
- **Auth profiles** — separate credentials per agent

Never reuse `agentDir` across agents.

### Routing Priority

Messages route by specificity (most precise wins):
1. Peer match (exact DM/group/channel ID)
2. Guild ID (Discord)
3. Team ID (Slack)
4. Account ID + channel
5. Channel-level match
6. Default agent

### Use Cases

- **Multiple people, one gateway**: Each person gets their own agent with separate personality and data
- **Split one channel across agents**: Route different WhatsApp DMs to different agents by sender
- **Channel-based assignment**: WhatsApp → fast everyday agent, Telegram → deep-thinking agent

### Per-Agent Sandbox & Tools

Agents can have independent:
- Sandbox modes (`off`, `all`)
- Tool allow/deny lists
- Permission levels

---

## Hooks (Internal Event System)

Different from webhooks. Hooks are TypeScript functions that run inside the gateway on events.

### Structure

```
hooks/
└── my-hook/
    ├── HOOK.md       # Metadata (YAML frontmatter)
    └── handler.ts    # TypeScript handler
```

### Events

| Event | When |
|-------|------|
| `command:new` | User issues `/new` |
| `command:reset` | User issues `/reset` |
| `command:stop` | User issues `/stop` |
| `agent:bootstrap` | Before workspace injection |
| `gateway:startup` | After channels start |

### Bundled Hooks

| Hook | Purpose |
|------|---------|
| `session-memory` | Saves session context to `memory/` on `/new` |
| `command-logger` | Logs commands to JSONL |
| `boot-md` | Runs `BOOT.md` on startup |

---

## Channels

Supported: WhatsApp, Telegram, Discord, iMessage, Slack, Signal, LINE, Matrix, Mattermost, MS Teams, Google Chat, Feishu, Zalo.

Features across channels: text, images, audio, documents, location, reactions.

### Telegram-Specific

- Bot token from @BotFather
- DM policy: `pairing` (default, requires pairing code) or `open`
- Group/topic support with forum topic delivery
- Topic format: `-1001234567890:topic:123`

---

## CLI Reference (Key Commands)

```bash
openclaw gateway              # Start the gateway
openclaw onboard              # Setup wizard
openclaw status               # Check gateway status
openclaw skills list          # List installed skills
openclaw skills install <name> # Install from ClawHub
openclaw cron list            # List cron jobs
openclaw cron add             # Add a cron job
openclaw hooks list           # List hooks
openclaw memory search <query> # Search memory
openclaw sessions list        # List sessions
openclaw models list          # List available models
openclaw doctor               # Diagnostics
```

---

## Configuration Reference

Main config: `~/.openclaw/openclaw.json`

Key sections:
```json5
{
  // Model
  "model": "anthropic/claude-sonnet-4-5",

  // Gateway
  "gateway": {
    "port": 18789,
    "token": "auth-token",
    "trustedProxies": ["127.0.0.1"]
  },

  // Sessions
  "sessions": {
    "dmScope": "main",
    "resetTime": "04:00",
    "idleMinutes": null
  },

  // Channels
  "channels": {
    "telegram": { "token": "bot-token", "dmPolicy": "open" }
  },

  // Webhooks
  "hooks": {
    "enabled": true,
    "token": "webhook-secret",
    "path": "/hooks"
  },

  // Cron
  "cron": {
    "enabled": true,
    "maxConcurrentRuns": 1
  },

  // Skills
  "skills": {
    "entries": {},
    "load": { "extraDirs": [], "watch": true }
  }
}
```

---

## Doc Links

Full docs: [docs.openclaw.ai](https://docs.openclaw.ai/)

| Topic | URL |
|-------|-----|
| Getting Started | [/start/getting-started](https://docs.openclaw.ai/start/getting-started.md) |
| Sessions | [/concepts/session](https://docs.openclaw.ai/concepts/session.md) |
| Memory | [/concepts/memory](https://docs.openclaw.ai/concepts/memory.md) |
| Skills | [/tools/skills](https://docs.openclaw.ai/tools/skills.md) |
| Webhooks | [/automation/webhook](https://docs.openclaw.ai/automation/webhook.md) |
| Cron Jobs | [/automation/cron-jobs](https://docs.openclaw.ai/automation/cron-jobs.md) |
| Hooks | [/automation/hooks](https://docs.openclaw.ai/automation/hooks.md) |
| Multi-Agent | [/concepts/multi-agent](https://docs.openclaw.ai/concepts/multi-agent.md) |
| Telegram | [/channels/telegram](https://docs.openclaw.ai/channels/telegram.md) |
| Configuration | [/gateway/configuration](https://docs.openclaw.ai/gateway/configuration.md) |
| CLI Reference | [/cli/index](https://docs.openclaw.ai/cli/index.md) |
| Showcase | [/start/showcase](https://docs.openclaw.ai/start/showcase.md) |
| Environment Vars | [/help/environment](https://docs.openclaw.ai/help/environment.md) |
| Security | [/gateway/security](https://docs.openclaw.ai/gateway/security/index.md) |
| Troubleshooting | [/gateway/troubleshooting](https://docs.openclaw.ai/gateway/troubleshooting.md) |
