import type { Env } from '../env';
import { nowSec, segment } from '../utils';

export type SourceListQuery = {
  title?: string;
  page?: number;
  page_no?: number;
  page_size?: number;
  category_id?: string;
  search_type?: number | string;
  is_time?: number;
  day?: number;
  type?: number;
};

export async function getSourceList(env: Env, conf: Record<string, string>, q: SourceListQuery) {
  const page = Math.max(1, Number(q.page ?? q.page_no) || 1);
  const pageSize = Math.min(50, Math.max(1, Number(q.page_size) || 20));
  const offset = (page - 1) * pageSize;
  const where: string[] = ['status = 1', 'is_delete = 0'];
  const params: any[] = [];

  if (Number(q.is_time) !== 1) {
    where.push('is_time = 0');
  }
  if (q.category_id) {
    const ids = String(q.category_id)
      .split(',')
      .map((s) => Number(s))
      .filter(Boolean);
    if (ids.length) {
      where.push(`source_category_id IN (${ids.map(() => '?').join(',')})`);
      params.push(...ids);
    }
  }
  if (Number(q.type) === 2) {
    where.push('is_type = 0');
  }
  if (Number(q.day) === 2) {
    const todayStart = Math.floor(new Date().setHours(0, 0, 0, 0) / 1000);
    where.push('create_time BETWEEN ? AND ?');
    params.push(todayStart - 86400, todayStart + 86400);
  }

  let orderBy = 'is_top DESC, source_id DESC';
  const title = (q.title || '').trim();
  if (title) {
    // Align with PHP: 0 exact-ish LIKE, 1 fuzzy = segmented tokens AND (len>1), 2 = OR any token
    const searchMode = Number(conf.search_type ?? 1);
    const parts = segment(title).filter((p) => p.length > 1);
    const tokens = parts.length ? parts : [title];

    if (searchMode === 0) {
      where.push('(title LIKE ? OR description LIKE ?)');
      params.push(`%${title}%`, `%${title}%`);
    } else if (searchMode === 2) {
      const ors = tokens.map(() => '(title LIKE ? OR description LIKE ?)').join(' OR ');
      where.push(`(${ors})`);
      for (const p of tokens) params.push(`%${p}%`, `%${p}%`);
    } else {
      // fuzzy AND of tokens
      for (const p of tokens) {
        where.push('(title LIKE ? OR description LIKE ?)');
        params.push(`%${p}%`, `%${p}%`);
      }
    }
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const countRow = await env.DB.prepare(`SELECT COUNT(*) as c FROM source ${whereSql}`)
    .bind(...params)
    .first<{ c: number }>();
  const total = countRow?.c || 0;
  let items: D1Result<any>;
  try {
    items = await env.DB.prepare(
      `SELECT source_id as id, source_category_id, title, url, description, is_type, code, page_views, vod_content, vod_pic, create_time as time
       FROM source ${whereSql} ORDER BY ${orderBy} LIMIT ? OFFSET ?`
    )
      .bind(...params, pageSize, offset)
      .all<any>();
  } catch {
    // 未执行 0006 时无 is_top，回退排序
    items = await env.DB.prepare(
      `SELECT source_id as id, source_category_id, title, url, description, is_type, code, page_views, vod_content, vod_pic, create_time as time
       FROM source ${whereSql} ORDER BY source_id DESC LIMIT ? OFFSET ?`
    )
      .bind(...params, pageSize, offset)
      .all<any>();
  }

  return {
    total_result: total,
    page,
    page_size: pageSize,
    items: (items.results || []).map((it) => ({
      ...it,
      times: it.time ? new Date(it.time * 1000).toISOString().slice(0, 10) : '',
    })),
  };
}

export async function getSourceDetail(env: Env, id: number) {
  const row = await env.DB.prepare(
    `SELECT s.source_id as id, s.source_category_id, s.title, s.url, s.create_time as time, s.vod_content, s.vod_pic, s.is_type, s.code, s.description, c.name as category_name
     FROM source s LEFT JOIN source_category c ON s.source_category_id = c.source_category_id
     WHERE s.status = 1 AND s.is_delete = 0 AND s.source_id = ?`
  )
    .bind(id)
    .first<any>();
  if (!row) return null;
  // 浏览量：约 10% 概率回写，降低详情页 D1 写放大
  if (Math.random() < 0.1) {
    await env.DB.prepare('UPDATE source SET page_views = page_views + 1 WHERE source_id = ?').bind(id).run();
  }
  row.times = row.time ? new Date(row.time * 1000).toISOString().slice(0, 10) : '';
  delete row.time;
  return row;
}

export async function insertSource(
  env: Env,
  data: {
    title: string;
    url: string;
    description?: string;
    is_type?: number;
    code?: string;
    fid?: string;
    source_category_id?: number;
    is_time?: number;
    vod_content?: string;
    vod_pic?: string;
    status?: number;
  }
) {
  const t = nowSec();
  const res = await env.DB.prepare(
    `INSERT INTO source (title, url, description, is_type, code, fid, source_category_id, is_time, vod_content, vod_pic, status, is_delete, create_time, update_time)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`
  )
    .bind(
      data.title,
      data.url,
      data.description || '',
      data.is_type ?? 0,
      data.code || '',
      data.fid || '',
      data.source_category_id || 0,
      data.is_time || 0,
      data.vod_content || '',
      data.vod_pic || '',
      data.status ?? 1,
      t,
      t
    )
    .run();
  return res.meta.last_row_id;
}

export async function findDuplicate(env: Env, title: string, isType: number) {
  return env.DB.prepare(
    'SELECT source_id FROM source WHERE title = ? AND is_type = ? AND is_delete = 0 LIMIT 1'
  )
    .bind(title, isType)
    .first<{ source_id: number }>();
}

/** 侧栏热榜：对齐原版 hotList（KV ranking + 分类图） */
export async function getHotList(env: Env, limit = 5) {
  const { getCachedCategories } = await import('./cache');
  const cats = (await getCachedCategories(env)).filter((c: any) => Number(c.status) === 0 && Number(c.is_sys) === 1);
  const hotList: { name: string; image: string; list: any[] }[] = [];
  for (const cat of cats) {
    let list: any[] = (await env.KV.get(`ranking:${cat.name}`, 'json')) as any;
    if (!list?.length) {
      const local = await env.DB.prepare(
        `SELECT title, source_id as id FROM source WHERE status=1 AND is_delete=0 AND is_time=0 AND source_category_id=? ORDER BY create_time DESC LIMIT ?`
      )
        .bind(cat.source_category_id, limit)
        .all<any>();
      list = local.results || [];
    }
    hotList.push({
      name: cat.name,
      image: cat.image || '',
      list: (list || []).slice(0, limit),
    });
  }
  return hotList;
}

/** 相关资源：标题分词 LIKE 加权（简化 VicWord） */
export async function getSameList(env: Env, detail: { id: number; title: string }, limit = 10) {
  const cleaned = String(detail.title || '').replace(/[（(][^）)]*[）)]/g, '');
  const tokens = segment(cleaned).filter((t) => t.length > 1).slice(0, 8);
  if (!tokens.length) {
    const rows = await env.DB.prepare(
      `SELECT source_id, title FROM source WHERE status=1 AND is_delete=0 AND is_time=0 AND source_id<>? ORDER BY source_id DESC LIMIT ?`
    )
      .bind(detail.id, limit)
      .all<any>();
    return rows.results || [];
  }
  const weight = tokens.map(() => `(CASE WHEN title LIKE ? OR description LIKE ? THEN 1 ELSE 0 END)`).join('+');
  const params: any[] = [];
  for (const t of tokens) params.push(`%${t}%`, `%${t}%`);
  params.push(detail.id, limit);
  const rows = await env.DB.prepare(
    `SELECT source_id, title, (${weight}) AS w FROM source
     WHERE status=1 AND is_delete=0 AND is_time=0 AND source_id<>?
     ORDER BY w DESC, source_id DESC LIMIT ?`
  )
    .bind(...params)
    .all<any>();
  return rows.results || [];
}
