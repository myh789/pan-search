/**
 * EdgeOne Blob 封装（@edgeone/pages-blob）
 *
 * 直接上传部署通常不会注入 {{PAGES_BLOB_DEPLOY_CREDENTIAL}}，
 * 需在控制台配置环境变量后由本文件显式传给 getStore：
 *   PAGES_PROJECT_ID=makers-xxxxxxxx
 *   PAGES_BLOB_DEPLOY_CREDENTIAL=<Makers API Token>
 * 或 EDGEONE_API_TOKEN / EDGEONE_PROJECT_ID
 */
import { getStore } from '@edgeone/pages-blob';

let _store;
let _storeKey = '';

function env(name, fallback = '') {
  const v = process.env[name];
  return v == null || v === '' ? fallback : String(v);
}

export function storeName() {
  return env('BLOB_STORE_NAME', 'pansearch');
}

/** 供调试：只返回相关 env 键名，不含密钥 */
export function blobEnvStatus() {
  const keys = [
    'PAGES_PROJECT_ID',
    'EDGEONE_PROJECT_ID',
    'BLOB_PROJECT_ID',
    'PAGES_BLOB_DEPLOY_CREDENTIAL',
    'EDGEONE_API_TOKEN',
    'BLOB_TOKEN',
    'PAGES_API_TOKEN',
    'BLOB_STORE_NAME',
  ];
  const present = {};
  for (const k of keys) present[k] = !!env(k);
  return {
    store: storeName(),
    present,
    mode: resolveCreds().mode,
  };
}

function resolveCreds() {
  const name = storeName();
  const projectId = env('PAGES_PROJECT_ID') || env('EDGEONE_PROJECT_ID') || env('BLOB_PROJECT_ID');
  const token =
    env('PAGES_BLOB_DEPLOY_CREDENTIAL') ||
    env('EDGEONE_API_TOKEN') ||
    env('BLOB_TOKEN') ||
    env('PAGES_API_TOKEN');

  if (token && projectId) {
    return { mode: 'token+projectId', opts: { name, projectId, token, consistency: 'strong' } };
  }
  if (token && !projectId) {
    return {
      mode: 'token-missing-projectId',
      opts: null,
      error:
        '已检测到 API Token，但缺少项目 ID。请在环境变量设置 PAGES_PROJECT_ID=makers-xlqbnbrrklva（控制台项目 URL 里可见）',
    };
  }
  // 无显式凭证：依赖平台注入（Git 部署常见；直接上传通常没有）
  return { mode: 'platform-inject', opts: { name, consistency: 'strong' } };
}

export function store() {
  const resolved = resolveCreds();
  if (!resolved.opts) {
    throw new Error(resolved.error || 'Blob 凭证不完整');
  }
  const key = JSON.stringify({
    mode: resolved.mode,
    name: resolved.opts.name,
    projectId: resolved.opts.projectId || '',
    hasToken: !!resolved.opts.token,
  });
  if (!_store || _storeKey !== key) {
    _store = getStore(resolved.opts);
    _storeKey = key;
  }
  return _store;
}

/** 每次请求注入 context.env 后清空缓存，避免沿用旧凭证 */
export function resetBlobStore() {
  _store = undefined;
  _storeKey = '';
}

export async function blobGet(key) {
  try {
    // 只读一次 text 再 JSON.parse，避免 SDK type:json 失败后重读触发
    // "Body is unusable: Body has already been read"
    const text = await store().get(key, { type: 'text', consistency: 'strong' });
    if (text === undefined || text === null || text === '') return null;
    if (typeof text !== 'string') return text;
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  } catch (e) {
    const msg = String(e?.message || e);
    if (msg.includes('not found') || e?.status === 404) return null;
    throw e;
  }
}

export async function blobSet(key, value) {
  const s = store();
  if (typeof value === 'string' || value instanceof Uint8Array) {
    await s.set(key, value);
    return;
  }
  await s.setJSON(key, value);
}

export async function blobDel(key) {
  await store().delete(key);
}

export async function blobList(prefix = '') {
  const out = await store().list({ prefix, directories: false });
  const blobs = out?.blobs || [];
  return blobs.map((b) => (typeof b === 'string' ? b : b.key)).filter(Boolean);
}

export async function blobPing() {
  const name = storeName();
  const s = store();
  const key = 'db/_ping.json';
  const payload = { ok: true, at: Date.now(), store: name };
  await s.setJSON(key, payload);
  const read = await s.get(key, { type: 'json', consistency: 'strong' });
  return { store: name, wrote: true, read, env: blobEnvStatus() };
}

export const KEYS = {
  conf: 'db/conf.json',
  apiList: 'db/api_list.json',
  admin: 'db/admin.json',
  meta: 'db/meta.json',
  searchStats: 'db/search_stats.json',
  access: (token) => `db/access/${token}.json`,
  captcha: (token) => `db/captcha/${token}.json`,
  tempIndex: 'db/temp/_index.json',
  temp: (id) => `db/temp/${id}.json`,
  lock: (name) => `db/lock/${name}.json`,
  xunleiToken: 'db/xunlei_token.json',
  xunleiCaptcha: 'db/xunlei_captcha.json',
  hot: (boardId) => `db/hot/${boardId || 'default'}.json`,
};
