import type { Env } from '../env';
import { encodePassword, nowSec } from '../utils';
import { isSecretMask, maskSecret } from './secret';

const CONF_CACHE_KEY = 'site:conf';
const CONF_ROWS_CACHE_KEY = 'admin:conf:rows';
const BOOTSTRAP_DONE_KEY = 'bootstrap:admin_done';
/** 站点 conf map：KV 缓存 12 小时；同 isolate 再叠一层内存，热路径几乎零 KV 读 */
const CONF_TTL = 43200;
/** 后台 conf 行列表：短缓存，减少 getBaseConfig 打 D1 */
const CONF_ROWS_TTL = 300;
const CONF_MEM_TTL_MS = 120_000;

type ConfMem = { at: number; map: Record<string, string> };

declare global {
  // eslint-disable-next-line no-var
  var __panConf: ConfMem | undefined;
  // eslint-disable-next-line no-var
  var __panBootstrapDone: boolean | undefined;
}

export async function getConf(env: Env, force = false): Promise<Record<string, string>> {
  if (!force) {
    const mem = globalThis.__panConf;
    if (mem && Date.now() - mem.at < CONF_MEM_TTL_MS) return mem.map;

    const cached = await env.KV.get(CONF_CACHE_KEY, 'json');
    if (cached && typeof cached === 'object') {
      const map = cached as Record<string, string>;
      globalThis.__panConf = { at: Date.now(), map };
      return map;
    }
  }
  const rows = await env.DB.prepare('SELECT conf_key, conf_value FROM conf').all<{
    conf_key: string;
    conf_value: string | null;
  }>();
  const map: Record<string, string> = {};
  for (const r of rows.results || []) map[r.conf_key] = r.conf_value ?? '';
  await env.KV.put(CONF_CACHE_KEY, JSON.stringify(map), { expirationTtl: CONF_TTL });
  globalThis.__panConf = { at: Date.now(), map };
  return map;
}

export async function getConfRows(env: Env, force = false): Promise<any[]> {
  if (!force) {
    const cached = await env.KV.get(CONF_ROWS_CACHE_KEY, 'json');
    if (Array.isArray(cached)) return cached;
  }
  const rows = await env.DB.prepare(
    'SELECT * FROM conf WHERE conf_status = 1 ORDER BY conf_type ASC, conf_sort DESC'
  ).all();
  const list = rows.results || [];
  await env.KV.put(CONF_ROWS_CACHE_KEY, JSON.stringify(list), { expirationTtl: CONF_ROWS_TTL });
  return list;
}

/** 返回给后台表单：敏感字段打码，避免密钥出现在浏览器 Network */
export async function getConfRowsForAdmin(env: Env): Promise<any[]> {
  const list = await getConfRows(env);
  return list.map((r) => {
    if (r?.conf_key === 'ai_api_key' && r.conf_value) {
      return { ...r, conf_value: maskSecret(String(r.conf_value)) };
    }
    return r;
  });
}

export async function invalidateConf(env: Env) {
  globalThis.__panConf = undefined;
  await Promise.all([env.KV.delete(CONF_CACHE_KEY), env.KV.delete(CONF_ROWS_CACHE_KEY)]);
}

export async function setConf(env: Env, key: string, value: string) {
  // 打码回传未改动的密钥：跳过写入，避免把 mask 写进库
  if (key === 'ai_api_key' && isSecretMask(value)) return;

  const exists = await env.DB.prepare('SELECT conf_id FROM conf WHERE conf_key = ?').bind(key).first();
  if (exists) {
    await env.DB.prepare('UPDATE conf SET conf_value = ?, conf_updatetime = ? WHERE conf_key = ?')
      .bind(value, nowSec(), key)
      .run();
  } else {
    await env.DB.prepare(
      'INSERT INTO conf (conf_key, conf_value, conf_title, conf_status, conf_system, conf_createtime, conf_updatetime) VALUES (?, ?, ?, 1, 0, ?, ?)'
    )
      .bind(key, value, key, nowSec(), nowSec())
      .run();
  }
  await invalidateConf(env);
}

export async function ensureBootstrapAdmin(env: Env) {
  // isolate 内已确认过则跳过 KV
  if (globalThis.__panBootstrapDone) return;

  const done = await env.KV.get(BOOTSTRAP_DONE_KEY);
  if (done === '1') {
    globalThis.__panBootstrapDone = true;
    return;
  }

  const row = await env.DB.prepare('SELECT admin_id, admin_password, admin_salt FROM admin WHERE admin_id = 1').first<{
    admin_id: number;
    admin_password: string;
    admin_salt: string;
  }>();
  if (!row) {
    await env.KV.put(BOOTSTRAP_DONE_KEY, '1', { expirationTtl: 86400 * 30 });
    globalThis.__panBootstrapDone = true;
    return;
  }
  if (row.admin_password !== 'BOOTSTRAP') {
    await env.KV.put(BOOTSTRAP_DONE_KEY, '1', { expirationTtl: 86400 * 30 });
    globalThis.__panBootstrapDone = true;
    return;
  }
  const pwd = env.ADMIN_BOOTSTRAP_PASSWORD || 'Admin123!';
  const hash = await encodePassword(pwd, row.admin_salt || 'abcd');
  await env.DB.prepare('UPDATE admin SET admin_password = ?, admin_updatetime = ? WHERE admin_id = 1')
    .bind(hash, nowSec())
    .run();
  await env.KV.put(BOOTSTRAP_DONE_KEY, '1', { expirationTtl: 86400 * 30 });
  globalThis.__panBootstrapDone = true;
}
