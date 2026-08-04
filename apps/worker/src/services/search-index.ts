import type { Env } from '../env';
import { segment } from '../utils';

/** Compact search index row (short keys to shrink KV payload) */
export type SearchIdxRow = {
  i: number; // source_id
  t: string; // title
  d: string; // description (truncated)
  u: string; // url
  c: string; // code
  y: number; // is_type
  g: number; // source_category_id
  p: number; // is_top
  ts: number; // create_time
};

export type SearchIdxMeta = {
  shards: number;
  total: number;
  built_at: number;
};

/** Subset of list query fields used by in-memory filter */
export type SearchIndexQuery = {
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

const META_KEY = 'search:idx:meta';
const DIRTY_KEY = 'search:dirty';
const LOCK_KEY = 'search:rebuild:lock';
const SHARD_PREFIX = 'search:idx:';
const SHARD_SIZE = 5000;
const DESC_MAX = 240;
/** Isolate memory cache TTL — isolate may be reused across requests */
const MEM_TTL_MS = 300_000;

type MemCache = { at: number; rows: SearchIdxRow[] };

declare global {
  // eslint-disable-next-line no-var
  var __panSearchIdx: MemCache | undefined;
}

function shardKey(n: number) {
  return `${SHARD_PREFIX}${n}`;
}

function truncDesc(s: string) {
  const t = String(s || '').trim();
  if (t.length <= DESC_MAX) return t;
  return t.slice(0, DESC_MAX);
}

export async function markSearchIndexDirty(env: Env) {
  globalThis.__panSearchIdx = undefined;
  // 去掉 meta，强制 loadSearchIndex 失效；否则 dirty 过期后仍会读到旧分片（含过期 is_top）
  const ops: Promise<unknown>[] = [env.KV.delete(META_KEY)];
  if ((await env.KV.get(DIRTY_KEY)) !== '1') {
    ops.push(env.KV.put(DIRTY_KEY, '1', { expirationTtl: 86400 * 7 }));
  }
  await Promise.all(ops);
}

export async function isSearchIndexDirty(env: Env) {
  return (await env.KV.get(DIRTY_KEY)) === '1';
}

/** Delete all search index shards + meta (does not clear dirty by itself) */
export async function invalidateSearchIndex(env: Env) {
  const meta = (await env.KV.get(META_KEY, 'json')) as SearchIdxMeta | null;
  const shardCount = meta?.shards || 0;
  const dels: Promise<void>[] = [env.KV.delete(META_KEY)];
  for (let i = 0; i < Math.max(shardCount, 1); i++) dels.push(env.KV.delete(shardKey(i)));
  // also sweep a few extra in case meta was lost
  for (let i = shardCount; i < shardCount + 8; i++) dels.push(env.KV.delete(shardKey(i)));
  await Promise.all(dels);
  globalThis.__panSearchIdx = undefined;
}

/**
 * Full rebuild from D1 (formal sources only: status=1, is_delete=0, is_time=0).
 * Returns built total, or null if lock held / skipped.
 */
export async function rebuildSearchIndex(env: Env, force = false): Promise<number | null> {
  if (!force) {
    const dirty = await isSearchIndexDirty(env);
    const meta = (await env.KV.get(META_KEY, 'json')) as SearchIdxMeta | null;
    if (!dirty && meta && meta.shards > 0) return null;
  }

  const lock = await env.KV.get(LOCK_KEY);
  if (lock) return null;
  await env.KV.put(LOCK_KEY, '1', { expirationTtl: 180 });

  try {
    let list: SearchIdxRow[] = [];
    try {
      const rows = await env.DB.prepare(
        `SELECT source_id, title, description, url, code, is_type, source_category_id, is_top, create_time
         FROM source WHERE status = 1 AND is_delete = 0 AND is_time = 0
         ORDER BY is_top DESC, source_id DESC`
      ).all<{
        source_id: number;
        title: string;
        description: string | null;
        url: string;
        code: string | null;
        is_type: number;
        source_category_id: number;
        is_top: number | null;
        create_time: number;
      }>();
      list = (rows.results || []).map((r) => ({
        i: r.source_id,
        t: r.title || '',
        d: truncDesc(r.description || ''),
        u: r.url || '',
        c: r.code || '',
        y: Number(r.is_type) || 0,
        g: Number(r.source_category_id) || 0,
        p: Number(r.is_top) ? 1 : 0,
        ts: Number(r.create_time) || 0,
      }));
    } catch {
      const rows = await env.DB.prepare(
        `SELECT source_id, title, description, url, code, is_type, source_category_id, create_time
         FROM source WHERE status = 1 AND is_delete = 0 AND is_time = 0
         ORDER BY source_id DESC`
      ).all<{
        source_id: number;
        title: string;
        description: string | null;
        url: string;
        code: string | null;
        is_type: number;
        source_category_id: number;
        create_time: number;
      }>();
      list = (rows.results || []).map((r) => ({
        i: r.source_id,
        t: r.title || '',
        d: truncDesc(r.description || ''),
        u: r.url || '',
        c: r.code || '',
        y: Number(r.is_type) || 0,
        g: Number(r.source_category_id) || 0,
        p: 0,
        ts: Number(r.create_time) || 0,
      }));
    }

    // wipe old shards using previous meta first
    await invalidateSearchIndex(env);

    const shards = Math.max(1, Math.ceil(list.length / SHARD_SIZE) || 1);
    const puts: Promise<void>[] = [];
    for (let s = 0; s < shards; s++) {
      const chunk = list.slice(s * SHARD_SIZE, (s + 1) * SHARD_SIZE);
      puts.push(env.KV.put(shardKey(s), JSON.stringify(chunk), { expirationTtl: 86400 * 30 }));
    }
    const meta: SearchIdxMeta = { shards, total: list.length, built_at: Math.floor(Date.now() / 1000) };
    puts.push(env.KV.put(META_KEY, JSON.stringify(meta), { expirationTtl: 86400 * 30 }));
    await Promise.all(puts);

    await env.KV.delete(DIRTY_KEY);
    globalThis.__panSearchIdx = { at: Date.now(), rows: list };
    return list.length;
  } finally {
    await env.KV.delete(LOCK_KEY);
  }
}

/** Return isolate-warm index rows without touching KV; null if cold. */
export function peekWarmSearchIndex(): SearchIdxRow[] | null {
  const mem = globalThis.__panSearchIdx;
  if (mem && Date.now() - mem.at < MEM_TTL_MS && Array.isArray(mem.rows) && mem.rows.length) {
    return mem.rows;
  }
  return null;
}

/** Load full index into memory (with short isolate cache). */
export async function loadSearchIndex(env: Env): Promise<SearchIdxRow[] | null> {
  const mem = globalThis.__panSearchIdx;
  if (mem && Date.now() - mem.at < MEM_TTL_MS && Array.isArray(mem.rows)) {
    return mem.rows;
  }

  const meta = (await env.KV.get(META_KEY, 'json')) as SearchIdxMeta | null;
  if (!meta || !meta.shards) return null;

  const parts = await Promise.all(
    Array.from({ length: meta.shards }, (_, i) => env.KV.get(shardKey(i), 'json'))
  );
  const rows: SearchIdxRow[] = [];
  for (const p of parts) {
    if (!Array.isArray(p)) return null;
    for (const row of p) rows.push(row as SearchIdxRow);
  }

  globalThis.__panSearchIdx = { at: Date.now(), rows };
  return rows;
}

function matchTitleDesc(row: SearchIdxRow, needle: string): boolean {
  const n = needle.toLowerCase();
  return (row.t || '').toLowerCase().includes(n) || (row.d || '').toLowerCase().includes(n);
}

/**
 * Filter + paginate in memory. Returns null if query can't be served from index
 * (e.g. is_time=1 temporary sources, or day filter needing live D1).
 */
export function searchIndexInMemory(
  rows: SearchIdxRow[],
  conf: Record<string, string>,
  q: SearchIndexQuery
): {
  total_result: number;
  page: number;
  page_size: number;
  items: any[];
} | null {
  // Index only holds formal (is_time=0) sources
  if (Number(q.is_time) === 1) return null;
  if (Number(q.day) === 2) return null;

  const page = Math.max(1, Number(q.page ?? q.page_no) || 1);
  const pageSize = Math.min(50, Math.max(1, Number(q.page_size) || 20));
  const offset = (page - 1) * pageSize;

  let filtered = rows;

  if (q.category_id) {
    const ids = new Set(
      String(q.category_id)
        .split(',')
        .map((s) => Number(s))
        .filter(Boolean)
    );
    if (ids.size) filtered = filtered.filter((r) => ids.has(r.g));
  }
  if (Number(q.type) === 2) {
    filtered = filtered.filter((r) => r.y === 0);
  }

  const title = (q.title || '').trim();
  if (title) {
    const searchMode = Number(conf.search_type ?? 1);
    const parts = segment(title).filter((p) => p.length > 1);
    const tokens = parts.length ? parts : [title];

    if (searchMode === 0) {
      filtered = filtered.filter((r) => matchTitleDesc(r, title));
    } else if (searchMode === 2) {
      filtered = filtered.filter((r) => tokens.some((tok) => matchTitleDesc(r, tok)));
    } else {
      filtered = filtered.filter((r) => tokens.every((tok) => matchTitleDesc(r, tok)));
    }
  }

  // already ordered is_top DESC, source_id DESC from rebuild; re-sort to be safe
  filtered = [...filtered].sort((a, b) => {
    if (b.p !== a.p) return b.p - a.p;
    return b.i - a.i;
  });

  const total = filtered.length;
  const slice = filtered.slice(offset, offset + pageSize);
  const items = slice.map((r) => ({
    id: r.i,
    source_category_id: r.g,
    title: r.t,
    url: r.u,
    description: r.d,
    is_type: r.y,
    code: r.c,
    page_views: 0,
    vod_content: '',
    vod_pic: '',
    time: r.ts,
    times: r.ts ? new Date(r.ts * 1000).toISOString().slice(0, 10) : '',
    is_top: r.p,
  }));

  return { total_result: total, page, page_size: pageSize, items };
}

/** Cron helper: rebuild when dirty or missing */
export async function cronRebuildSearchIndex(env: Env) {
  const dirty = await isSearchIndexDirty(env);
  const meta = (await env.KV.get(META_KEY, 'json')) as SearchIdxMeta | null;
  if (dirty || !meta || !meta.shards) {
    await rebuildSearchIndex(env, true);
  }
}
