import type { Env } from '../env';

export const CACHE_KEYS = {
  stats: 'admin:stats',
  categories: 'site:categories',
  apiListAll: 'site:api_list:all',
  /** pantype + scene(0资源/1音乐) */
  apiListPan: (pantype: number, scene = 0) => `site:api_list:pan:${pantype}:s${scene}`,
  panTabs: (scene = 0) => `site:pan_tabs:s${scene}`,
  homeLatest: (limit: number) => `home:latest:${limit}`,
  /** 首页各分类列表（固定 key，内含足够条数供 slice） */
  homeCatLists: 'home:cat_lists',
  access: (token: string) => `access:${token}`,
  captcha: (token: string) => `captcha:${token}`,
  nodes: 'site:nodes:show',
} as const;

/** 读多写少的站点数据：拉长 TTL，降低免费档 KV 读 */
const TTL_CATEGORIES = 3600;
const TTL_API_LIST = 1800;
const TTL_HOME = 1800;
const TTL_STATS = 3600;
const MEM_TTL_MS = 60_000;
/** 分类块一次缓存的条数上限（覆盖 ranking_num） */
const HOME_CAT_FETCH = 15;

type CatMem = { at: number; list: any[] };
type HomeMem = { at: number; list: any[] };
type HomeCatMem = { at: number; map: Record<string, any[]> };

declare global {
  // eslint-disable-next-line no-var
  var __panCategories: CatMem | undefined;
  // eslint-disable-next-line no-var
  var __panHomeLatest: Record<number, HomeMem> | undefined;
  // eslint-disable-next-line no-var
  var __panHomeCatLists: HomeCatMem | undefined;
}

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
  await env.KV.put(CACHE_KEYS.stats, JSON.stringify(stats), { expirationTtl: TTL_STATS });
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
  await env.KV.put(CACHE_KEYS.stats, JSON.stringify(next), { expirationTtl: TTL_STATS });
  return next;
}

export async function getCachedCategories(env: Env) {
  const mem = globalThis.__panCategories;
  if (mem && Date.now() - mem.at < MEM_TTL_MS) return mem.list;

  const cached = await env.KV.get(CACHE_KEYS.categories, 'json');
  if (Array.isArray(cached)) {
    globalThis.__panCategories = { at: Date.now(), list: cached };
    return cached as any[];
  }
  const rows = await env.DB.prepare(
    'SELECT source_category_id, name, image, is_sys, is_type, status, sort, is_update FROM source_category ORDER BY sort DESC'
  ).all<any>();
  const list = rows.results || [];
  await env.KV.put(CACHE_KEYS.categories, JSON.stringify(list), { expirationTtl: TTL_CATEGORIES });
  globalThis.__panCategories = { at: Date.now(), list };
  return list;
}

export async function invalidateCategories(env: Env) {
  globalThis.__panCategories = undefined;
  await env.KV.delete(CACHE_KEYS.categories);
}

/**
 * @param pantype 网盘类型；省略则返回全部（后台列表）
 * @param scene 0=资源全网搜 1=音乐搜；省略 pantype 时忽略
 */
export async function getCachedApiList(env: Env, pantype?: number, scene = 0) {
  if (pantype === undefined) {
    const cached = await env.KV.get(CACHE_KEYS.apiListAll, 'json');
    if (Array.isArray(cached)) return cached as any[];
    const rows = await env.DB.prepare('SELECT * FROM api_list ORDER BY weight DESC, id DESC').all<any>();
    const list = rows.results || [];
    await env.KV.put(CACHE_KEYS.apiListAll, JSON.stringify(list), { expirationTtl: TTL_API_LIST });
    return list;
  }
  const sceneN = Number(scene) === 1 ? 1 : 0;
  const key = CACHE_KEYS.apiListPan(pantype, sceneN);
  const cached = await env.KV.get(key, 'json');
  if (Array.isArray(cached)) return cached as any[];

  let list: any[] = [];
  try {
    const rows = await env.DB.prepare(
      'SELECT * FROM api_list WHERE status = 1 AND pantype = ? AND COALESCE(scene, 0) = ? ORDER BY weight DESC'
    )
      .bind(pantype, sceneN)
      .all<any>();
    list = rows.results || [];
  } catch {
    // 未跑 0007 时无 scene 列：仅资源模式回退全量，音乐模式返回空
    if (sceneN === 1) {
      list = [];
    } else {
      const rows = await env.DB.prepare(
        'SELECT * FROM api_list WHERE status = 1 AND pantype = ? ORDER BY weight DESC'
      )
        .bind(pantype)
        .all<any>();
      list = rows.results || [];
    }
  }
  await env.KV.put(key, JSON.stringify(list), { expirationTtl: TTL_API_LIST });
  return list;
}

export async function getCachedPanTabs(
  env: Env,
  scene = 0
): Promise<{ type: number; name: string }[]> {
  const sceneN = Number(scene) === 1 ? 1 : 0;
  const key = CACHE_KEYS.panTabs(sceneN);
  const cached = await env.KV.get(key, 'json');
  if (Array.isArray(cached) && cached.length) return cached as { type: number; name: string }[];

  const panMap: Record<number, string> = { 0: '夸克', 1: '阿里', 2: '百度', 3: 'UC', 4: '迅雷' };
  let tabs: { type: number; name: string }[] = [];
  try {
    const rows = await env.DB.prepare(
      'SELECT DISTINCT pantype FROM api_list WHERE status = 1 AND COALESCE(scene, 0) = ? ORDER BY pantype ASC'
    )
      .bind(sceneN)
      .all<{ pantype: number }>();
    tabs = (rows.results || [])
      .filter((l) => panMap[l.pantype] !== undefined)
      .map((l) => ({ type: l.pantype, name: panMap[l.pantype] }));
  } catch {
    if (sceneN === 0) {
      const rows = await env.DB.prepare(
        'SELECT DISTINCT pantype FROM api_list WHERE status = 1 ORDER BY pantype ASC'
      ).all<{ pantype: number }>();
      tabs = (rows.results || [])
        .filter((l) => panMap[l.pantype] !== undefined)
        .map((l) => ({ type: l.pantype, name: panMap[l.pantype] }));
    }
  }
  if (!tabs.length) tabs = [{ type: 0, name: '夸克' }];
  await env.KV.put(key, JSON.stringify(tabs), { expirationTtl: TTL_API_LIST });
  return tabs;
}

export async function invalidateApiListCache(env: Env) {
  await env.KV.delete(CACHE_KEYS.apiListAll);
  for (const s of [0, 1]) {
    await env.KV.delete(CACHE_KEYS.panTabs(s));
    for (const t of [0, 1, 2, 3, 4]) await env.KV.delete(CACHE_KEYS.apiListPan(t, s));
  }
  // 兼容旧 key
  await env.KV.delete('site:pan_tabs');
  for (const t of [0, 1, 2, 3, 4]) await env.KV.delete(`site:api_list:pan:${t}`);
}

export async function getCachedHomeLatest(env: Env, limit: number) {
  const memBag = globalThis.__panHomeLatest || (globalThis.__panHomeLatest = {});
  const mem = memBag[limit];
  if (mem && Date.now() - mem.at < MEM_TTL_MS) return mem.list;

  const key = CACHE_KEYS.homeLatest(limit);
  const cached = await env.KV.get(key, 'json');
  if (Array.isArray(cached)) {
    memBag[limit] = { at: Date.now(), list: cached };
    return cached as any[];
  }
  const news = await env.DB.prepare(
    `SELECT title, source_id as id FROM source WHERE status=1 AND is_delete=0 AND is_time=0 ORDER BY create_time DESC LIMIT ?`
  )
    .bind(limit)
    .all<any>();
  const list = news.results || [];
  await env.KV.put(key, JSON.stringify(list), { expirationTtl: TTL_HOME });
  memBag[limit] = { at: Date.now(), list };
  return list;
}

/** 首页分类块：一次 KV 读全部分类最新资源，不再逐个读 ranking:* */
export async function getCachedHomeCatLists(env: Env, limit = HOME_CAT_FETCH): Promise<Record<string, any[]>> {
  const need = Math.min(HOME_CAT_FETCH, Math.max(1, limit));
  const mem = globalThis.__panHomeCatLists;
  if (mem && Date.now() - mem.at < MEM_TTL_MS) {
    const out: Record<string, any[]> = {};
    for (const [k, v] of Object.entries(mem.map)) out[k] = (v || []).slice(0, need);
    return out;
  }

  const key = CACHE_KEYS.homeCatLists;
  const cached = await env.KV.get(key, 'json');
  if (cached && typeof cached === 'object' && !Array.isArray(cached)) {
    const map = cached as Record<string, any[]>;
    globalThis.__panHomeCatLists = { at: Date.now(), map };
    const out: Record<string, any[]> = {};
    for (const [k, v] of Object.entries(map)) out[k] = (v || []).slice(0, need);
    return out;
  }

  const cats = (await getCachedCategories(env)).filter((c: any) => Number(c.status) === 0);
  const map: Record<string, any[]> = {};
  await Promise.all(
    cats.map(async (cat: any) => {
      const rows = await env.DB.prepare(
        `SELECT title, source_id as id FROM source WHERE status=1 AND is_delete=0 AND is_time=0 AND source_category_id=? ORDER BY create_time DESC LIMIT ?`
      )
        .bind(cat.source_category_id, HOME_CAT_FETCH)
        .all<any>();
      map[String(cat.source_category_id)] = rows.results || [];
    })
  );
  await env.KV.put(key, JSON.stringify(map), { expirationTtl: TTL_HOME });
  globalThis.__panHomeCatLists = { at: Date.now(), map };
  const out: Record<string, any[]> = {};
  for (const [k, v] of Object.entries(map)) out[k] = (v || []).slice(0, need);
  return out;
}

export async function invalidateHomeCaches(env: Env) {
  globalThis.__panHomeLatest = undefined;
  globalThis.__panHomeCatLists = undefined;
  await Promise.all([
    env.KV.delete(CACHE_KEYS.homeLatest(15)),
    env.KV.delete(CACHE_KEYS.homeCatLists),
    env.KV.delete('sitemap:xml'),
  ]);
}

/** 资源变更后统一失效 */
export async function onSourceMutated(env: Env, sourceDelta = 0) {
  if (sourceDelta) await bumpAdminStats(env, { sources: sourceDelta });
  else await invalidateAdminStats(env);
  await invalidateHomeCaches(env);
  const { markSearchIndexDirty } = await import('./search-index');
  await markSearchIndexDirty(env);
}
