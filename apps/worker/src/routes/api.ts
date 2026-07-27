import { Hono } from 'hono';
import type { Env, AppVariables } from '../env';
import { jok, jerr } from '@pan-search/shared';
import { getConf } from '../services/conf';
import { getSourceList, getSourceDetail } from '../services/source';
import { streamWebSearch } from '../services/search-lines';
import { aesDecrypt, nowSec } from '../utils';
import { transferUrl } from '../pan';
import { determineIsType } from '@pan-search/shared';
import { insertSource } from '../services/source';

export const apiRoutes = new Hono<{ Bindings: Env; Variables: AppVariables }>();

apiRoutes.get('/search/index', async (c) => {
  const conf = await getConf(c.env);
  const data = await getSourceList(c.env, conf, c.req.query() as any);
  return c.json(jok('获取成功', data));
});

apiRoutes.get('/search/getDetail', async (c) => {
  const id = Number(c.req.query('id'));
  const data = await getSourceDetail(c.env, id);
  if (!data) return c.json(jerr('不存在'));
  return c.json(jok('获取成功', data));
});

apiRoutes.get('/search/getNew', async (c) => {
  const conf = await getConf(c.env);
  const q = c.req.query() as any;
  q.page_size = q.page_size || 20;
  const data = await getSourceList(c.env, conf, q);
  return c.json(jok('获取成功', data));
});

apiRoutes.get('/search/getHot', async (c) => {
  const conf = await getConf(c.env);
  const cats = await c.env.DB.prepare('SELECT name FROM source_category WHERE status = 0 ORDER BY sort DESC').all<{
    name: string;
  }>();
  const hot: any[] = [];
  for (const cat of cats.results || []) {
    const cached = await c.env.KV.get(`ranking:${cat.name}`, 'json');
    hot.push({ name: cat.name, list: cached || [] });
  }
  return c.json(jok('获取成功', { conf: { ranking_num: conf.ranking_num }, hot }));
});

apiRoutes.get('/search/getCategory', async (c) => {
  const rows = await c.env.DB.prepare(
    'SELECT source_category_id, name, image, sort, is_type FROM source_category WHERE status = 0 ORDER BY sort DESC'
  ).all();
  return c.json(jok('获取成功', rows.results || []));
});

apiRoutes.get('/tool/getConfig', async (c) => {
  const conf = await getConf(c.env);
  const pub = {
    app_name: conf.app_name,
    app_title: conf.app_title,
    app_subname: conf.app_subname,
    logo: conf.logo,
    home_theme: conf.home_theme,
    home_background: conf.home_background,
    home_color: conf.home_color,
    is_quan: conf.is_quan,
    pc_type: conf.pc_type,
    search_tips: conf.search_tips,
    qcode: conf.qcode,
    app_demand: conf.app_demand,
  };
  return c.json(jok('ok', pub));
});

apiRoutes.post('/tool/feedback', async (c) => {
  const body = await c.req.parseBody();
  const content = String(body.content || '');
  if (!content) return c.json(jerr('内容不能为空'));
  await c.env.DB.prepare('INSERT INTO feedback (content, create_time, update_time) VALUES (?, ?, ?)')
    .bind(content, nowSec(), nowSec())
    .run();
  const { bumpAdminStats } = await import('../services/cache');
  await bumpAdminStats(c.env, { feedback: 1 });
  return c.json(jok('提交成功'));
});

apiRoutes.get('/tool/ranking', async (c) => {
  const { cronRanking } = await import('../cron/jobs');
  await cronRanking(c.env);
  return c.json(jok('已刷新'));
});

apiRoutes.get('/other/web_search', async (c) => {
  const conf = await getConf(c.env);
  const title = c.req.query('title') || '';
  const is_type = Number(c.req.query('is_type') || 0);
  const is_show = Number(c.req.query('is_show') || 0);
  const stream = await streamWebSearch(c.env, conf, title, is_type, is_show);
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
});

apiRoutes.post('/other/save_url', async (c) => {
  const conf = await getConf(c.env);
  const body = await c.req.json<{ url?: string; code?: string; stoken?: string }>().catch(() => ({} as any));
  let url = body.url || '';
  try {
    if (url && !url.startsWith('http')) url = await aesDecrypt(c.env, url);
    if (typeof url !== 'string') url = String(url);
  } catch {
    return c.json(jerr('链接解密失败'));
  }
  const res = await transferUrl(c.env, conf, {
    url,
    code: body.code,
    stoken: body.stoken,
    expired_type: 2,
    isType: 0,
  });
  if (res.code !== 200 || !res.data) return c.json(jerr(res.message));
  const id = await insertSource(c.env, {
    title: res.data.title,
    url: res.data.share_url,
    is_type: determineIsType(res.data.share_url),
    code: res.data.code,
    fid: typeof res.data.fid === 'string' ? res.data.fid : JSON.stringify(res.data.fid || ''),
    is_time: 1,
  });
  const { onSourceMutated } = await import('../services/cache');
  await onSourceMutated(c.env, 1);
  return c.json(jok('临时资源获取成功', { id, ...res.data }));
});

apiRoutes.get('/other/all_search', async (c) => {
  const conf = await getConf(c.env);
  const title = c.req.query('title') || '';
  if (!title) return c.json(jerr('请输入要看的内容'));
  const local = await getSourceList(c.env, conf, { title, page_size: 5, is_time: 1 });
  if (local.items.length) return c.json(jok('临时资源获取成功', local.items));

  const cacheKey = `search:${title}`;
  const cached = await c.env.KV.get(cacheKey, 'json');
  if (cached) return c.json(jok('临时资源获取成功', cached));

  const { getCachedApiList, onSourceMutated } = await import('../services/cache');
  const lines = await getCachedApiList(c.env, 0);
  const { runLine } = await import('../services/search-lines');
  const out: any[] = [];
  for (const line of lines) {
    if (out.length >= 2) break;
    const hits = await runLine(line, title);
    for (const hit of hits) {
      if (out.length >= 2) break;
      const res = await transferUrl(c.env, conf, { url: hit.url, expired_type: 2, isType: 0 });
      if (res.code === 200 && res.data) {
        const id = await insertSource(c.env, {
          title: res.data.title || hit.title,
          url: res.data.share_url,
          is_type: determineIsType(res.data.share_url),
          code: res.data.code,
          fid: typeof res.data.fid === 'string' ? res.data.fid : JSON.stringify(res.data.fid || ''),
          is_time: 1,
        });
        out.push({ id, title: res.data.title, url: res.data.share_url, is_time: 1 });
      }
    }
  }
  if (out.length) await onSourceMutated(c.env, out.length);
  await c.env.KV.put(cacheKey, JSON.stringify(out), { expirationTtl: 60 });
  return c.json(jok('临时资源获取成功', out));
});

apiRoutes.get('/other/delete_search', async (c) => {
  const { cronCleanupTemp } = await import('../cron/jobs');
  await cronCleanupTemp(c.env);
  return c.json(jok('清理完成'));
});

apiRoutes.post('/open/transfer', async (c) => {
  const conf = await getConf(c.env);
  const body = await c.req.parseBody();
  if (conf.api_key && conf.api_key !== String(body.api_key || c.req.query('api_key') || '')) {
    return c.json(jerr('api_key错误'));
  }
  const url = String(body.url || '');
  if (!url) return c.json(jerr('资源地址不能为空'));
  const expired_type = Number(body.expired_type || 1);
  const isSave = Number(body.isSave || 0);
  const isType = Number(body.isType || 0);
  // async=1 时走队列（可选）；默认与原版一致：同步转存并返回分享链
  const useQueue = String(body.async || '') === '1' && isType !== 1;

  if (useQueue) {
    await c.env.TRANSFER_QUEUE.send({
      type: 'transfer',
      url,
      code: String(body.code || ''),
      expiredType: expired_type,
      isType: 0,
      isSave,
    });
    return c.json(jok('已提交转存任务', { queued: true }));
  }

  const res = await transferUrl(c.env, conf, {
    url,
    code: String(body.code || ''),
    isType,
    expired_type,
  });
  if (res.code !== 200 || !res.data) return c.json(jerr(res.message));

  if (isSave === 1) {
    await insertSource(c.env, {
      title: res.data.title,
      url: res.data.share_url,
      is_type: determineIsType(res.data.share_url),
      code: res.data.code || String(body.code || ''),
      fid: typeof res.data.fid === 'string' ? res.data.fid : JSON.stringify(res.data.fid || ''),
      is_time: expired_type === 2 ? 1 : 0,
    });
    const { onSourceMutated } = await import('../services/cache');
    await onSourceMutated(c.env, 1);
  }
  return c.json(jok(isType === 1 ? '获取成功' : '转存成功', res.data));
});

apiRoutes.get('/source/day', async (c) => {
  const locked = await c.env.KV.get('lock:daily_transfer');
  if (locked) return c.json(jerr('该接口今天已经执行过，请稍后再试！'));
  await c.env.KV.put('lock:daily_transfer', '1', { expirationTtl: 2400 });
  await c.env.TRANSFER_QUEUE.send({ type: 'transfer_all' });
  return c.json(jok('已提交任务，稍后查看结果'));
});

apiRoutes.get('/index/index', (c) => c.json(jok('hello', { name: 'pan-search-cf' })));
