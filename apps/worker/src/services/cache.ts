import type { Env } from '../env';

export const CACHE_KEYS = {
  stats: 'admin:stats',
  categories: 'site:categories',
  apiListAll: 'site:api_list:all',
  apiListPan: (pantype: number) => `site:api_list:pan:${pantype}`,
  panTabs: 'site:pan_tabs',
  homeLatest: (limit: number) => `home:latest:${limit}`,
  access: (token: string) => `access:${token}`,
  captcha: (token: string) => `captcha:${token}`,
  nodes: 'site:nodes:show',
} as const;

export type AdminStats = {
  sources: number;
  lines: number;
  feedback: number;
  updated_at: number;
};

/** 概况页统计：优先 KV，未命中再 COUNT 一次并回填 */
export async function getAdminStats(env: Env, force = false): Promise<AdminStats> {
  if (!force) {
    const cached = await env.KV.get(CACHE_KEYS.stats, 'json');
    if (cached && typeof cached === 'object') return cached as AdminStats;
  }
  const [sources, lines, feedback] = await Promise.all([
    env.DB.prepare('SELECT COUNT(*) as c FROM source WHERE is_delete = 0').first<{ c: number }>(),
    env.DB.prepare('SELECT COUNT(*) as c FROM api_list').first<{ c: number }>(),
    env.DB.prepare('SELECT COUNT(*) as c FROM feedback').first<{ c: number }>(),
  ]);
  const stats: AdminStats = {
    sources: sources?.c || 0,
    lines: lines?.c || 0,
    feedback: feedback?.c || 0,
    updated_at: Math.floor(Date.now() / 1000),
  };
  await env.KV.put(CACHE_KEYS.stats, JSON.stringify(stats), { expirationTtl: 3600 });
  return stats;
}

export async function invalidateAdminStats(env: Env) {
  await env.KV.delete(CACHE_KEYS.stats);
}

/** 增量更新统计（避免反复 COUNT） */
export async function bumpAdminStats(
  env: Env,
  delta: Partial<Pick<AdminStats, 'sources' | 'lines' | 'feedback'>>
) {
  const cur = await getAdminStats(env);
  const next: AdminStats = {
    sources: Math.max(0, cur.sources + (delta.sources || 0)),
    lines: Math.max(0, cur.lines + (delta.lines || 0)),
    feedback: Math.max(0, cur.feedback + (delta.feedback || 0)),
    updated_at: Math.floor(Date.now() / 1000),
  };
  await env.KV.put(CACHE_KEYS.stats, JSON.stringify(next), { expirationTtl: 3600 });
  return next;
}

export async function getCachedCategories(env: Env) {
  const cached = await env.KV.get(CACHE_KEYS.categories, 'json');
  if (Array.isArray(cached)) return cached as any[];
  const rows = await env.DB.prepare(
    'SELECT source_category_id, name, image, is_sys, is_type, status, sort, is_update FROM source_category ORDER BY sort DESC'
  ).all<any>();
  const list = rows.results || [];
  await env.KV.put(CACHE_KEYS.categories, JSON.stringify(list), { expirationTtl: 600 });
  return list;
}

export async function invalidateCategories(env: Env) {
  await env.KV.delete(CACHE_KEYS.categories);
}

export async function getCachedApiList(env: Env, pantype?: number) {
  if (pantype === undefined) {
    const cached = await env.KV.get(CACHE_KEYS.apiListAll, 'json');
    if (Array.isArray(cached)) return cached as any[];
    const rows = await env.DB.prepare('SELECT * FROM api_list ORDER BY weight DESC, id DESC').all<any>();
    const list = rows.results || [];
    await env.KV.put(CACHE_KEYS.apiListAll, JSON.stringify(list), { expirationTtl: 600 });
    return list;
  }
  const key = CACHE_KEYS.apiListPan(pantype);
  const cached = await env.KV.get(key, 'json');
  if (Array.isArray(cached)) return cached as any[];
  const rows = await env.DB.prepare(
    'SELECT * FROM api_list WHERE status = 1 AND pantype = ? ORDER BY weight DESC'
  )
    .bind(pantype)
    .all<any>();
  const list = rows.results || [];
  await env.KV.put(key, JSON.stringify(list), { expirationTtl: 600 });
  return list;
}

export async function getCachedPanTabs(env: Env): Promise<{ type: number; name: string }[]> {
  const cached = await env.KV.get(CACHE_KEYS.panTabs, 'json');
  if (Array.isArray(cached) && cached.length) return cached as { type: number; name: string }[];
  const rows = await env.DB.prepare(
    'SELECT DISTINCT pantype FROM api_list WHERE status = 1 ORDER BY pantype ASC'
  ).all<{ pantype: number }>();
  const panMap: Record<number, string> = { 0: '夸克', 1: '阿里', 2: '百度', 3: 'UC', 4: '迅雷' };
  let tabs = (rows.results || [])
    .filter((l) => panMap[l.pantype] !== undefined)
    .map((l) => ({ type: l.pantype, name: panMap[l.pantype] }));
  if (!tabs.length) tabs = [{ type: 0, name: '夸克' }];
  await env.KV.put(CACHE_KEYS.panTabs, JSON.stringify(tabs), { expirationTtl: 600 });
  return tabs;
}

export async function invalidateApiListCache(env: Env) {
  await env.KV.delete(CACHE_KEYS.apiListAll);
  await env.KV.delete(CACHE_KEYS.panTabs);
  for (const t of [0, 1, 2, 3, 4]) await env.KV.delete(CACHE_KEYS.apiListPan(t));
}

export async function getCachedHomeLatest(env: Env, limit: number) {
  const key = CACHE_KEYS.homeLatest(limit);
  const cached = await env.KV.get(key, 'json');
  if (Array.isArray(cached)) return cached as any[];
  const news = await env.DB.prepare(
    `SELECT title, source_id as id FROM source WHERE status=1 AND is_delete=0 AND is_time=0 ORDER BY create_time DESC LIMIT ?`
  )
    .bind(limit)
    .all<any>();
  const list = news.results || [];
  await env.KV.put(key, JSON.stringify(list), { expirationTtl: 300 });
  return list;
}

export async function invalidateHomeCaches(env: Env) {
  // common limits used by ranking_num
  for (const n of [6, 8, 10, 12, 15, 20, 30]) {
    await env.KV.delete(CACHE_KEYS.homeLatest(n));
  }
  await env.KV.delete('sitemap:xml');
}

/** 资源变更后统一失效 */
export async function onSourceMutated(env: Env, sourceDelta = 0) {
  if (sourceDelta) await bumpAdminStats(env, { sources: sourceDelta });
  else await invalidateAdminStats(env);
  await invalidateHomeCaches(env);
  const { markSearchIndexDirty } = await import('./search-index');
  await markSearchIndexDirty(env);
}
