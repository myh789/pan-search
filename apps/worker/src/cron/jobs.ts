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
  const conf = await getConf(env);
  const cats = await env.DB.prepare(
    'SELECT source_category_id, name, is_sys, is_type FROM source_category WHERE status = 0'
  ).all<any>();
  const limit = Number(conf.ranking_num) || 10;
  for (const cat of cats.results || []) {
    if (cat.is_sys === 1 && cat.is_type === 0) {
      // try quark trending
      try {
        const res = await httpJson('https://biz.quark.cn/api/trending/ranking/getYingshiRanking', {
          method: 'GET',
          query: { rank_type: 1, page: 1, page_size: limit },
        });
        const list = (res.data?.data?.list || res.data?.list || []).slice(0, limit).map((x: any, i: number) => ({
          title: x.title || x.name,
          id: 0,
          times: '',
          rank: i + 1,
        }));
        await env.KV.put(`ranking:${cat.name}`, JSON.stringify(list), { expirationTtl: 43200 });
      } catch {
        // fallback local
        const local = await env.DB.prepare(
          `SELECT title, source_id as id, create_time as time FROM source WHERE status=1 AND is_delete=0 AND is_time=0 AND source_category_id=? ORDER BY create_time DESC LIMIT ?`
        )
          .bind(cat.source_category_id, limit)
          .all<any>();
        const list = (local.results || []).map((x, i) => ({
          title: x.title,
          id: x.id,
          times: '',
          rank: i + 1,
        }));
        await env.KV.put(`ranking:${cat.name}`, JSON.stringify(list), { expirationTtl: 43200 });
      }
    } else {
      const local = await env.DB.prepare(
        `SELECT title, source_id as id FROM source WHERE status=1 AND is_delete=0 AND is_time=0 AND source_category_id=? ORDER BY create_time DESC LIMIT ?`
      )
        .bind(cat.source_category_id, limit)
        .all<any>();
      await env.KV.put(
        `ranking:${cat.name}`,
        JSON.stringify((local.results || []).map((x, i) => ({ ...x, rank: i + 1, times: '' }))),
        { expirationTtl: 43200 }
      );
    }
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
