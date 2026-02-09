import { Hono } from 'hono';
import type { AppEnv } from '../types';
import { MOLTBOT_PORT } from '../config';
import { findExistingMoltbotProcess, ensureMoltbotGateway } from '../gateway';
import { mountR2Storage } from '../gateway/r2';

/**
 * Public routes - NO Cloudflare Access authentication required
 *
 * These routes are mounted BEFORE the auth middleware is applied.
 * Includes: health checks, static assets, and public API endpoints.
 */
const publicRoutes = new Hono<AppEnv>();

// GET /sandbox-health - Health check endpoint
publicRoutes.get('/sandbox-health', (c) => {
  return c.json({
    status: 'ok',
    service: 'moltbot-sandbox',
    gateway_port: MOLTBOT_PORT,
  });
});

// GET /logo.png - Serve logo from ASSETS binding
publicRoutes.get('/logo.png', (c) => {
  return c.env.ASSETS.fetch(c.req.raw);
});

// GET /logo-small.png - Serve small logo from ASSETS binding
publicRoutes.get('/logo-small.png', (c) => {
  return c.env.ASSETS.fetch(c.req.raw);
});

// GET /api/status - Public health check for gateway status (no auth required)
publicRoutes.get('/api/status', async (c) => {
  const sandbox = c.get('sandbox');

  try {
    const process = await findExistingMoltbotProcess(sandbox);
    if (!process) {
      return c.json({ ok: false, status: 'not_running' });
    }

    // Process exists, check if it's actually responding
    // Try to reach the gateway with a short timeout
    try {
      await process.waitForPort(18789, { mode: 'tcp', timeout: 5000 });
      return c.json({ ok: true, status: 'running', processId: process.id });
    } catch {
      return c.json({ ok: false, status: 'not_responding', processId: process.id });
    }
  } catch (err) {
    return c.json({
      ok: false,
      status: 'error',
      error: err instanceof Error ? err.message : 'Unknown error',
    });
  }
});

// GET /_admin/assets/* - Admin UI static assets (CSS, JS need to load for login redirect)
// Assets are built to dist/client with base "/_admin/"
publicRoutes.get('/_admin/assets/*', async (c) => {
  const url = new URL(c.req.url);
  // Rewrite /_admin/assets/* to /assets/* for the ASSETS binding
  const assetPath = url.pathname.replace('/_admin/assets/', '/assets/');
  const assetUrl = new URL(assetPath, url.origin);
  return c.env.ASSETS.fetch(new Request(assetUrl.toString(), c.req.raw));
});

// GET /debug/r2-mount - Debug R2 mount (token-protected, bypasses CF Access)
publicRoutes.get('/debug/r2-mount', async (c) => {
  const url = new URL(c.req.url);
  const token = url.searchParams.get('token');
  if (!token || token !== c.env.MOLTBOT_GATEWAY_TOKEN) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const sandbox = c.get('sandbox');
  const env = c.env;

  const result: Record<string, unknown> = {
    has_r2_access_key: !!env.R2_ACCESS_KEY_ID,
    has_r2_secret_key: !!env.R2_SECRET_ACCESS_KEY,
    has_cf_account_id: !!env.CF_ACCOUNT_ID,
    r2_access_key_prefix: env.R2_ACCESS_KEY_ID?.slice(0, 8) || null,
    cf_account_id_prefix: env.CF_ACCOUNT_ID?.slice(0, 8) || null,
  };

  try {
    const mounted = await mountR2Storage(sandbox, env);
    result.mount_success = mounted;
  } catch (err) {
    result.mount_success = false;
    result.mount_error = err instanceof Error ? err.message : String(err);
    result.mount_stack = err instanceof Error ? err.stack : undefined;
  }

  // Check mount table
  try {
    const proc = await sandbox.startProcess('mount');
    let attempts = 0;
    while (proc.status === 'running' && attempts < 10) {
      await new Promise((r) => setTimeout(r, 200));
      attempts++;
    }
    const logs = await proc.getLogs();
    result.mount_table = logs.stdout || '';
  } catch (err) {
    result.mount_table_error = String(err);
  }

  // Check if s3fs is installed
  try {
    const proc = await sandbox.startProcess('which s3fs');
    let attempts = 0;
    while (proc.status === 'running' && attempts < 10) {
      await new Promise((r) => setTimeout(r, 200));
      attempts++;
    }
    const logs = await proc.getLogs();
    result.s3fs_path = (logs.stdout || '').trim();
    result.s3fs_installed = proc.exitCode === 0;
  } catch {
    result.s3fs_installed = false;
  }

  // Check /data/moltbot directory
  try {
    const proc = await sandbox.startProcess('ls -la /data/moltbot/ 2>&1; echo "---"; df -h /data/moltbot/ 2>&1');
    let attempts = 0;
    while (proc.status === 'running' && attempts < 10) {
      await new Promise((r) => setTimeout(r, 200));
      attempts++;
    }
    const logs = await proc.getLogs();
    result.data_dir = (logs.stdout || '').trim();
  } catch (err) {
    result.data_dir_error = String(err);
  }

  return c.json(result);
});

// POST /webhook/tradingview - TradingView alert webhook (forwarded to OpenClaw hooks)
publicRoutes.post('/webhook/tradingview', async (c) => {
  const url = new URL(c.req.url);
  const secret = url.searchParams.get('secret');

  if (!c.env.WEBHOOK_SECRET) {
    return c.json({ error: 'WEBHOOK_SECRET not configured' }, 503);
  }

  if (!secret || secret !== c.env.WEBHOOK_SECRET) {
    return c.json({ error: 'Invalid secret' }, 401);
  }

  const sandbox = c.get('sandbox');

  // Ensure gateway is running
  try {
    await ensureMoltbotGateway(sandbox, c.env);
  } catch (error) {
    return c.json({ error: 'Gateway not ready', details: String(error) }, 503);
  }

  // Read TradingView alert body
  const alertText = await c.req.text();
  if (!alertText) {
    return c.json({ error: 'Empty alert body' }, 400);
  }

  // Forward to OpenClaw's /hooks/agent endpoint
  const hooksToken = c.env.WEBHOOK_SECRET;
  const payload = {
    message: `[TradingView Alert] ${alertText}`,
    deliver: { telegram: { chatId: '1444376737' } },
    sessionKey: 'tradingview-alerts',
  };

  try {
    const response = await sandbox.containerFetch(
      new Request(`http://localhost:${MOLTBOT_PORT}/hooks/agent`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${hooksToken}`,
        },
        body: JSON.stringify(payload),
      }),
      MOLTBOT_PORT,
    );

    console.log('[WEBHOOK] TradingView alert forwarded, status:', response.status);
    return c.json({ ok: true, status: response.status });
  } catch (error) {
    console.error('[WEBHOOK] Failed to forward alert:', error);
    return c.json({ error: 'Failed to forward alert', details: String(error) }, 500);
  }
});

export { publicRoutes };
