# OpenClaw Internals

How the AI assistant running inside the container actually works.

## Conversation Model

Sessions are **not endless**. Each session runs within the model's context window (Sonnet 4.5 ≈ 200k tokens). When approaching the limit (~4k tokens before full), OpenClaw triggers a **silent memory flush** — a background turn that writes important info to disk before compacting context. The user sees nothing.

After compaction, the session continues with a fresh context loaded from memory files.

## Memory System

All memory is **plain Markdown on disk**. The model only "remembers" what gets written to files.

### Three Layers

| Layer | Location | Loaded When | Purpose |
|---|---|---|---|
| Long-term | `MEMORY.md` | Every private session | Curated facts, preferences, decisions |
| Daily logs | `memory/YYYY-MM-DD.md` | Today's + yesterday's | Running context, day-to-day notes |
| Transcripts | JSONL logs | On-demand (search) | Full audit trail of all sessions |

### How Memory Gets Written
- **Explicitly**: User says "remember that I prefer X" → agent writes to `MEMORY.md`
- **Auto-flush**: Before context compaction, agent silently writes lasting info
- **Daily logs**: Agent appends notes during conversation

### Memory Search
OpenClaw indexes memory files for retrieval:
- **Vector search** — Semantic matching (finds related concepts even with different wording)
- **Keyword matching** — SQLite FTS5 for exact precision
- Tools: `memory_search` and `memory_get`

## Agents

Agents are isolated AI runtimes. Each has:
- Own **workspace** directory (persona, memory, skills)
- Own **session history**
- Own **model configuration**
- Own **tool policies**

### Workspace Files
- `AGENTS.md` — Agent persona and capabilities
- `IDENTITY.md` — Operator information
- `SOUL.md` — Personality traits (optional)
- `TOOLS.md` — Tool usage guidance (optional)
- `skills/` — Installed skill directories

Default workspace: `~/.openclaw/workspace-<agentId>` (main agent uses `/root/clawd/`)

You can run **multiple agents** in one gateway, each with different personalities and tools. Messages are routed to agents via channel bindings.

## Skills

Skills are packaged tool bundles defined by a `SKILL.md` file:

```
skills/
└── my-skill/
    ├── SKILL.md          ← Metadata (name, description, tools, prompts)
    └── scripts/
        └── do-thing.js   ← Executable tools
```

Skills are loaded on-demand or at startup. OpenClaw has 100+ preconfigured skill bundles available.

In moltworker, skills in `./skills/` are baked into the container at build time (`COPY skills/ /root/clawd/skills/`).

## Message Flow

```
1. User sends Telegram message
2. OpenClaw gateway receives it via bot polling
3. Routes to default agent based on channel binding
4. Agent loads: system prompt + AGENTS.md + MEMORY.md + today's daily log + skills
5. Sends full context + user message to AI model (Sonnet 4.5)
6. Model response → sent back to Telegram + logged to JSONL transcript
7. If near context limit → silent memory flush → context compaction → continue
```

## Model Configuration

Set via `OPENCLAW_MODEL` env var (defaults to `anthropic/claude-sonnet-4-5`).

The config patch in `start-openclaw.sh` writes:
```json
{
  "agents": {
    "defaults": {
      "model": { "primary": "anthropic/claude-sonnet-4-5" }
    }
  }
}
```

Can also use CF AI Gateway models via `CF_AI_GATEWAY_MODEL` (format: `provider/model-id`).

## References

- [OpenClaw Docs](https://docs.openclaw.ai/)
- [Memory Docs](https://docs.openclaw.ai/concepts/memory)
- [Gateway Configuration](https://docs.openclaw.ai/gateway/configuration)
- [GitHub](https://github.com/openclaw/openclaw)
