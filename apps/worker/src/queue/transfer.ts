import type { Env } from '../env';
import type { TransferJob } from '@pan-search/shared';
import { determineIsType } from '@pan-search/shared';
import { getConf } from '../services/conf';
import { transferUrl } from '../pan';
import { findDuplicate, insertSource } from '../services/source';
import { nowSec } from '../utils';
import { httpJson } from '../utils';

export async function processTransferJob(env: Env, job: TransferJob) {
  const conf = await getConf(env);
  if (job.type === 'transfer' && job.url) {
    const res = await transferUrl(env, conf, {
      url: job.url,
      code: job.code,
      isType: job.isType || 0,
      expired_type: job.expiredType || 1,
    });
    if (res.code === 200 && job.isSave === 1 && res.data) {
      await insertSource(env, {
        title: res.data.title,
        url: res.data.share_url,
        is_type: determineIsType(res.data.share_url),
        code: res.data.code || job.code,
        fid: typeof res.data.fid === 'string' ? res.data.fid : JSON.stringify(res.data.fid || ''),
        is_time: job.expiredType === 2 ? 1 : 0,
        source_category_id: job.categoryId || 0,
      });
    }
    return res;
  }

  if ((job.type === 'transfer_batch' || job.type === 'import_batch') && job.items?.length) {
    const logId = job.logId;
    let newNum = 0,
      skipNum = 0,
      failNum = 0;
    const fails: string[] = [];
    for (const item of job.items) {
      try {
        const isType = determineIsType(item.url);
        const dup = await findDuplicate(env, item.title || item.url, isType);
        if (dup) {
          skipNum++;
          continue;
        }
        const res = await transferUrl(env, conf, {
          url: item.url,
          code: item.code,
          isType: job.type === 'import_batch' ? 1 : 0,
          expired_type: 1,
        });
        if (res.code !== 200 || !res.data) {
          failNum++;
          fails.push(res.message);
          continue;
        }
        await insertSource(env, {
          title: item.title || res.data.title,
          url: res.data.share_url,
          is_type: determineIsType(res.data.share_url),
          code: res.data.code || item.code,
          fid: typeof res.data.fid === 'string' ? res.data.fid : JSON.stringify(res.data.fid || ''),
          source_category_id: item.categoryId || job.categoryId || 0,
        });
        newNum++;
      } catch (e: any) {
        failNum++;
        fails.push(e?.message || 'error');
      }
    }
    if (logId) {
      await env.DB.prepare(
        'UPDATE source_log SET new_num = ?, skip_num = ?, fail_num = ?, fail_dec = ?, update_time = ?, end_time = ? WHERE source_log_id = ?'
      )
        .bind(newNum, skipNum, failNum, fails.slice(0, 5).join(';'), nowSec(), nowSec(), logId)
        .run();
    }
    return { code: 200, message: 'batch done', data: { newNum, skipNum, failNum } };
  }

  if (job.type === 'transfer_all') {
    const feed = conf.transfer_feed_url;
    if (!feed) return { code: 500, message: '未配置转存聚合源 transfer_feed_url' };
    let ids: number[] = [];
    if (job.categoryId) {
      ids = [job.categoryId];
    } else {
      const cats = await env.DB.prepare('SELECT source_category_id FROM source_category WHERE is_update = 1').all<{
        source_category_id: number;
      }>();
      ids = (cats.results || []).map((c) => c.source_category_id);
    }
    for (const catId of ids) {
      let page = 1;
      while (page < 20) {
        const res = await httpJson(`${feed.replace(/\/$/, '')}/api/search`, {
          method: 'GET',
          query: { page_no: page, page_size: 100, type: 2, day: 2, category_id: catId },
        });
        const list = res.data?.data?.items || res.data?.items || res.data?.data || [];
        if (!Array.isArray(list) || !list.length) break;
        await processTransferJob(env, {
          type: 'transfer_batch',
          categoryId: catId,
          items: list.map((x: any) => ({ title: x.title, url: x.url, code: x.code, categoryId: catId })),
        });
        page++;
      }
    }
    return { code: 200, message: 'transfer_all done' };
  }

  return { code: 400, message: 'unknown job' };
}

export async function createSourceLog(env: Env, name: string, total: number) {
  const t = nowSec();
  const res = await env.DB.prepare(
    'INSERT INTO source_log (name, total_num, create_time, update_time) VALUES (?, ?, ?, ?)'
  )
    .bind(name, total, t, t)
    .run();
  return res.meta.last_row_id as number;
}
