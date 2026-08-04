import { getConf, listTempSources, removeTempSource } from './db.js';
import { deletePanFids } from './pan.js';
import { nowSec } from './utils.js';
import { KEYS, blobGet, blobSet } from './blob.js';

export async function cleanupTempSources() {
  const conf = await getConf();
  const ttlMin = Math.max(5, Math.min(10080, Number(conf.temp_source_ttl) || 30));
  const cutoff = nowSec() - ttlMin * 60;
  const rows = await listTempSources();
  let removed = 0;
  for (const row of rows) {
    if (Number(row.create_time || 0) >= cutoff) continue;
    try {
      let fids = [];
      try {
        const parsed = typeof row.fid === 'string' ? JSON.parse(row.fid) : row.fid;
        fids = Array.isArray(parsed) ? parsed : row.fid ? [String(row.fid)] : [];
      } catch {
        fids = row.fid ? [String(row.fid)] : [];
      }
      if (fids.length) {
        await deletePanFids(conf, row.is_type, fids);
      }
    } catch {
      /* ignore pan delete errors */
    }
    await removeTempSource(row.source_id);
    removed++;
  }
  return { removed, scanned: rows.length, ttlMin };
}

/** 简易分布式锁，避免并发清理 */
export async function withLock(name, ttlSec, fn) {
  const key = KEYS.lock(name);
  const cur = await blobGet(key);
  const now = nowSec();
  if (cur?.until && Number(cur.until) > now) {
    return { skipped: true, reason: 'locked' };
  }
  await blobSet(key, { until: now + ttlSec });
  try {
    const result = await fn();
    return { skipped: false, result };
  } finally {
    await blobSet(key, { until: 0 });
  }
}
