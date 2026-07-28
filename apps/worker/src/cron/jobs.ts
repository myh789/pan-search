import type { Env } from '../env';
import { createPan } from '../pan';
import { nowSec, httpJson } from '../utils';
import { processTransferJob } from '../queue/transfer';
import { getConf } from '../services/conf';

/** Cleanup temp sources older than conf.temp_source_ttl minutes (default 30) */
export async function cronCleanupTemp(env: Env) {
  const conf = await getConf(env);
  const ttlMin = Math.max(5, Math.min(10080, Number(conf.temp_source_ttl) || 30));
  const cutoff = nowSec() - ttlMin * 60;
  const rows = await env.DB.prepare(
    'SELECT source_id, fid, is_type FROM source WHERE is_time = 1 AND create_time < ? AND is_delete = 0'
  )
    .bind(cutoff)
    .all<any>();
  for (const row of rows.results || []) {
    try {
      if (row.fid) {
        let fids: string[] = [];
        try {
          fids = JSON.parse(row.fid);
          if (!Array.isArray(fids)) fids = [String(row.fid)];
        } catch {
          fids = [String(row.fid)];
        }
        const pan = createPan(row.is_type || 0, conf, { url: '' }, env);
        await pan.deletepdirFid(fids);
      }
    } catch {
      /* ignore */
    }
    await env.DB.prepare('UPDATE source SET is_delete = 1, update_time = ? WHERE source_id = ?')
      .bind(nowSec(), row.source_id)
      .run();
  }
}

/** Every 12 hours: ranking refresh */
export async function cronRanking(env: Env) {
  const { refreshAllRankings } = await import('../services/ranking');
  await refreshAllRankings(env);
}

/** Daily 03:00 UTC: transfer_all */
export async function cronDailyTransfer(env: Env) {
  const lock = await env.KV.get('lock:daily_transfer');
  if (lock) return;
  await env.KV.put('lock:daily_transfer', '1', { expirationTtl: 2400 });
  await processTransferJob(env, { type: 'transfer_all' });
}

export async function handleScheduled(event: ScheduledEvent, env: Env) {
  const cron = (event as any).cron as string | undefined;
  // Prefer Cloudflare cron expression when present
  if (cron === '0 */12 * * *') {
    await cronRanking(env);
    return;
  }
  if (cron === '0 3 * * *') {
    await cronDailyTransfer(env);
    return;
  }
  // default */10 cleanup + rebuild search index when dirty
  await cronCleanupTemp(env);
  const { cronRebuildSearchIndex } = await import('../services/search-index');
  await cronRebuildSearchIndex(env);
}
