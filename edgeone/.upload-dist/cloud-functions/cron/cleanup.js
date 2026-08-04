/**
 * 定时清理临时转存资源
 * edgeone.json schedules → POST /cron/cleanup
 */
import { ensureBootstrap } from '../../lib/db.js';
import { cleanupTempSources, withLock } from '../../lib/cleanup.js';
import { jok, json, env } from '../../lib/utils.js';

function injectEnv(context) {
  const envObj = context?.env;
  if (!envObj || typeof envObj !== 'object') return;
  for (const [k, v] of Object.entries(envObj)) {
    if (v != null && (process.env[k] == null || process.env[k] === '')) {
      process.env[k] = String(v);
    }
  }
}

function headerOf(request, name) {
  const h = request?.headers;
  if (!h) return '';
  if (typeof h.get === 'function') return h.get(name) || h.get(name.toLowerCase()) || '';
  return h[name] || h[name.toLowerCase()] || '';
}

export default async function onRequest(context) {
  injectEnv(context);
  const request = context.request;
  try {
    await ensureBootstrap();
    const secret = env('CRON_SECRET', '');
    if (secret) {
      const hdr = headerOf(request, 'x-cron-secret');
      const url = new URL(request.url);
      const q = url.searchParams.get('secret') || '';
      if (hdr !== secret && q !== secret) {
        return json({ code: 401, message: 'unauthorized', data: null }, 401);
      }
    }
    const out = await withLock('cron_cleanup', 500, () => cleanupTempSources());
    return json(jok('cleanup done', out));
  } catch (e) {
    return json({ code: 500, message: e?.message || 'cleanup error', data: null }, 500);
  }
}
