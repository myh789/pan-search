import type { Env } from '../env';
import { encodePassword, nowSec } from '../utils';

const CONF_CACHE_KEY = 'site:conf';

export async function getConf(env: Env, force = false): Promise<Record<string, string>> {
  if (!force) {
    const cached = await env.KV.get(CONF_CACHE_KEY, 'json');
    if (cached && typeof cached === 'object') return cached as Record<string, string>;
  }
  const rows = await env.DB.prepare('SELECT conf_key, conf_value FROM conf').all<{
    conf_key: string;
    conf_value: string | null;
  }>();
  const map: Record<string, string> = {};
  for (const r of rows.results || []) map[r.conf_key] = r.conf_value ?? '';
  await env.KV.put(CONF_CACHE_KEY, JSON.stringify(map), { expirationTtl: 300 });
  return map;
}

export async function invalidateConf(env: Env) {
  await env.KV.delete(CONF_CACHE_KEY);
}

export async function setConf(env: Env, key: string, value: string) {
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
  const row = await env.DB.prepare('SELECT admin_id, admin_password, admin_salt FROM admin WHERE admin_id = 1').first<{
    admin_id: number;
    admin_password: string;
    admin_salt: string;
  }>();
  if (!row) return;
  if (row.admin_password !== 'BOOTSTRAP') return;
  const pwd = env.ADMIN_BOOTSTRAP_PASSWORD || 'Admin123!';
  const hash = await encodePassword(pwd, row.admin_salt || 'abcd');
  await env.DB.prepare('UPDATE admin SET admin_password = ?, admin_updatetime = ? WHERE admin_id = 1')
    .bind(hash, nowSec())
    .run();
}
