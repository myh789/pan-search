/**
 * 独立最小探针：/api/blob-init
 */
import { getStore, listStores } from '@edgeone/pages-blob';

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' },
  });
}

function injectEnv(context) {
  const envObj = context?.env;
  if (!envObj || typeof envObj !== 'object') return;
  for (const [k, v] of Object.entries(envObj)) {
    if (v != null && (process.env[k] == null || process.env[k] === '')) {
      process.env[k] = String(v);
    }
  }
}

function env(name) {
  return process.env[name] || '';
}

function resolveGetStoreArgs() {
  const name = env('BLOB_STORE_NAME') || 'pansearch';
  const projectId = env('PAGES_PROJECT_ID') || env('EDGEONE_PROJECT_ID') || env('BLOB_PROJECT_ID');
  const token =
    env('PAGES_BLOB_DEPLOY_CREDENTIAL') ||
    env('EDGEONE_API_TOKEN') ||
    env('BLOB_TOKEN') ||
    env('PAGES_API_TOKEN');

  if (token && projectId) return { name, projectId, token, consistency: 'strong' };
  if (token && !projectId) {
    throw new Error(
      '缺少 PAGES_PROJECT_ID。请在环境变量填写 makers-xlqbnbrrklva（控制台项目 URL 中的 ID）'
    );
  }
  return { name, consistency: 'strong' };
}

export default async function onRequest(context) {
  injectEnv(context);
  const steps = [];
  const present = {
    PAGES_PROJECT_ID: !!env('PAGES_PROJECT_ID'),
    EDGEONE_PROJECT_ID: !!env('EDGEONE_PROJECT_ID'),
    PAGES_BLOB_DEPLOY_CREDENTIAL: !!env('PAGES_BLOB_DEPLOY_CREDENTIAL'),
    EDGEONE_API_TOKEN: !!env('EDGEONE_API_TOKEN'),
    BLOB_TOKEN: !!env('BLOB_TOKEN'),
  };
  try {
    steps.push('import_ok');
    const args = resolveGetStoreArgs();
    steps.push(`getStore_mode:${args.token ? 'token' : 'platform'}`);
    const store = getStore(args);
    const STORE_NAME = args.name;

    const key = `db/_ping_${Date.now()}.json`;
    const payload = { ok: true, at: new Date().toISOString(), store: STORE_NAME };
    await store.setJSON(key, payload);
    steps.push(`setJSON(${key})`);

    const read = await store.get(key, { type: 'json', consistency: 'strong' });
    steps.push('get_strong_ok');

    let stores = null;
    try {
      const listed = args.token
        ? await listStores({ projectId: args.projectId, token: args.token })
        : await listStores();
      stores = listed?.stores || listed;
      steps.push('listStores_ok');
    } catch (e) {
      steps.push('listStores_skip:' + (e?.message || e));
    }

    return json({
      code: 200,
      message: 'Blob 写入成功，命名空间应已自动创建',
      data: {
        store: STORE_NAME,
        key,
        wrote: payload,
        read,
        stores,
        steps,
        present,
        region: context?.server?.region || null,
        hint: '回到控制台「存储 → Blob 存储」刷新',
      },
    });
  } catch (e) {
    return json(
      {
        code: 500,
        message: e?.message || String(e),
        data: {
          steps,
          present,
          hint:
            '直接上传部署需在控制台配置环境变量：PAGES_PROJECT_ID=makers-xlqbnbrrklva，以及 PAGES_BLOB_DEPLOY_CREDENTIAL 或 EDGEONE_API_TOKEN（Makers「API Token」页创建）。正确探针地址是 /api/blob-init（不是 /blob-init）。',
          stack: String(e?.stack || '').slice(0, 1200),
        },
      },
      500
    );
  }
}
