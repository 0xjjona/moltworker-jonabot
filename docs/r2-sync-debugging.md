# R2 Sync Debugging Session (2026-02-09)

## Problem
"Sync aborted: no config file found" error when clicking backup in admin UI, even though R2 was mounted and the config file existed at `/root/.openclaw/openclaw.json`.

## Investigation Steps

### 1. Checked gateway status
Hit `/api/status` — returned `{"ok":true,"status":"running"}`. Gateway was healthy.

### 2. Checked R2 mount via wrangler tail
`wrangler tail --format json` showed:
- `isR2Mounted check: true` — R2 was mounted via s3fs at `/data/moltbot`
- `mount | grep s3fs` confirmed: `s3fs on /data/moltbot type fuse.s3fs (rw,nosuid,nodev,relatime,user_id=0,group_id=0)`

### 3. Checked config file existence
Process list from `/debug/processes` showed:
- `test -f /root/.openclaw/openclaw.json` — exitCode 0 (file exists)
- `test -f /root/.clawdbot/clawdbot.json` — exitCode 1 (legacy path doesn't exist, expected)

### 4. Found the bug
The cron sync log showed: `"Sync aborted: no config file found"` with empty output from the config check command. The `Config check output:` log line showed empty string — stdout wasn't being captured.

## Root Cause
`syncToR2()` in `src/gateway/sync.ts` used this pattern:

```ts
const proc = await sandbox.startProcess('if [ -f ... ]; then echo "FOUND:openclaw"; ...');
await waitForProcess(proc, 10000);  // polls proc.status in a loop
const logs = await proc.getLogs();   // stdout is EMPTY
```

`startProcess()` + manual polling + `getLogs()` has a race condition in `@cloudflare/sandbox` v0.7.0. For short-lived commands, the process completes before `getLogs()` can capture the output. The stdout is lost.

## Fix
Replaced all three `startProcess` + `waitForProcess` + `getLogs` calls in `syncToR2()` with `sandbox.exec()`:

```ts
const result = await sandbox.exec('if [ -f ... ]; then echo "FOUND:openclaw"; ...');
const output = result.stdout;  // works reliably
```

`sandbox.exec()` waits for the command to complete internally and returns stdout/stderr/exitCode directly. No manual polling needed.

### Changes made
- **`src/gateway/sync.ts`** — Replaced 3 command executions:
  1. Config directory check (`if [ -f ... ]`)
  2. Rsync sync command
  3. Timestamp file read (`cat .last-sync`)
- Removed `waitForProcess` import (still used in `src/routes/api.ts`)

## Verification
After deploying, clicked "Backup Now" in admin UI:
- Sync completed successfully
- R2 bucket `moltbot-data` now contains: `openclaw/`, `skills/`, `workspace/`, `.last-sync`
- Last backup timestamp: 2026-02-09 10:30:44

## Cloudflare Sandbox API Reference

### `sandbox.exec(command)` — One-shot commands
- Waits for completion automatically
- Returns `{ stdout, stderr, exitCode }` reliably
- Use for: file checks, rsync, cat, any command where you need the output

### `sandbox.startProcess(command)` — Background processes
- Returns immediately, process runs in background
- Use `proc.waitForPort()` to wait for a server to be ready
- Use `proc.waitForLog(pattern)` to wait for specific output
- Use `proc.waitForExit()` to wait for completion
- `proc.getLogs()` is unreliable for short-lived commands
- Use for: gateway process, long-running servers

### `sandbox.mountBucket(name, path, options)` — R2 mounting
- Mounts R2 bucket via s3fs FUSE into the container filesystem
- Requires: `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `CF_ACCOUNT_ID`
- Endpoint format: `https://{CF_ACCOUNT_ID}.r2.cloudflarestorage.com`

## Remaining Cleanup
- `src/routes/api.ts` still uses `startProcess` + `waitForProcess` pattern — consider migrating to `exec()`
- `src/gateway/r2.ts` uses `startProcess` for mount checks — works but could be cleaner with `exec()`
