import type { Env } from '../env';
import { createPan } from '../pan';
import { nowSec } from '../utils';
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

/** Daily 03:00 UTC: transfer_all */
export async function cronDailyTransfer(env: Env) {
  const lock = await env.KV.get('lock:daily_transfer');
  if (lock) return;
  await env.KV.put('lock:daily_transfer', '1', { expirationTtl: 2400 });
  await processTransferJob(env, { type: 'transfer_all' });
}

export async function handleScheduled(event: ScheduledEvent, env: Env) {
  const cron = (event as any).cron as string | undefined;
  if (cron === '0 3 * * *') {
    await cronDailyTransfer(env);
    return;
  }
  // 默认整点：清理临时资源 + 脏了才重建搜索索引（已去掉 12h 热榜定时）
  await cronCleanupTemp(env);
  const { cronRebuildSearchIndex } = await import('../services/search-index');
  await cronRebuildSearchIndex(env);
}
