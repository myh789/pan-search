import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { Env, AppVariables } from './env';
import { apiRoutes } from './routes/api';
import { adminRoutes } from './routes/admin';
import { wechatRoutes } from './routes/wechat';
import { ensureBootstrapAdmin, getConf } from './services/conf';
import { getSourceList, getSourceDetail } from './services/source';
import {
  renderHome,
  renderList,
  renderDetail,
  renderSitemap,
  parseSearchSlug,
  layout,
} from './views/ssr';
import { processTransferJob } from './queue/transfer';
import { handleScheduled } from './cron/jobs';
import type { TransferJob } from '@pan-search/shared';
import { jok } from '@pan-search/shared';

const app = new Hono<{ Bindings: Env; Variables: AppVariables }>();

app.use(
  '/api/*',
  cors({
    origin: '*',
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'access_token', 'plat', 'version', 'X-CSRF-TOKEN'],
  })
);

app.use('*', async (c, next) => {
  const p = c.req.path;
  if (!p.startsWith('/qfadmin/assets') && !p.startsWith('/static/')) {
    await ensureBootstrapAdmin(c.env);
  }
  await next();
});

app.get('/health', async (c) => {
  try {
    const row = await c.env.DB.prepare('SELECT 1 as ok').first<{ ok: number }>();
    return c.json(jok('ok', { db: row?.ok === 1, ts: Date.now() }));
  } catch (e: any) {
    return c.json({ code: 500, message: e?.message || 'db error', data: null }, 500);
  }
});

app.get('/robots.txt', (c) =>
  c.text('User-agent: *\nAllow: /\nDisallow: /qfadmin/\nDisallow: /admin/\nSitemap: /sitemap.xml\n', 200, {
    'Content-Type': 'text/plain; charset=utf-8',
  })
);

app.get('/favicon.ico', async (c) => {
  const conf = await getConf(c.env);
  if (conf.app_icon) return c.redirect(conf.app_icon, 302);
  return c.body(null, 204);
});

app.route('/api', apiRoutes);
app.route('/admin', adminRoutes);
app.route('/wechat', wechatRoutes);

// Chatbot: wechatRoutes defines POST /chatbot → mount under /api
app.post('/api/chatbot', async (c) => {
  const u = new URL(c.req.url);
  u.pathname = '/chatbot';
  return wechatRoutes.fetch(new Request(u.toString(), c.req.raw), c.env);
});
app.all('/api/wechat/serve', (c) => {
  const u = new URL(c.req.url);
  u.pathname = '/serve';
  return wechatRoutes.fetch(new Request(u.toString(), c.req.raw), c.env);
});

app.get('/api/tool/file', async (c) => {
  const key = c.req.query('key');
  if (!key) return c.notFound();
  const obj = await c.env.R2.get(key);
  if (!obj) return c.notFound();
  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  headers.set('etag', obj.httpEtag);
  return new Response(obj.body, { headers });
});

app.get('/', async (c) => {
  const conf = await getConf(c.env);
  return c.html(await renderHome(c.env, conf));
});

app.get('/show', async (c) => {
  const conf = await getConf(c.env);
  const type = c.req.query('type');
  let dayStart = Math.floor(new Date().setHours(0, 0, 0, 0) / 1000);
  if (type) dayStart = Math.floor(new Date(type).setHours(0, 0, 0, 0) / 1000);
  const rows = await c.env.DB.prepare(
    'SELECT source_id as id, title, url, is_type FROM source WHERE status=1 AND is_delete=0 AND create_time BETWEEN ? AND ? ORDER BY source_id DESC LIMIT 500'
  )
    .bind(dayStart, dayStart + 86400)
    .all();
  const body = `<div class="homeBox"><h3 style="padding:20px">每日资源</h3>${(rows.results || [])
    .map((r: any) => `<div style="padding:8px 20px"><a href="/d/${r.id}.html">${r.title}</a></div>`)
    .join('')}</div>`;
  return c.html(layout(conf, { title: '每日资源', body }));
});

async function handleSearch(c: any, slug: string) {
  const conf = await getConf(c.env);
  const { name, page, cate } = parseSearchSlug(slug);
  const list = await getSourceList(c.env, conf, {
    title: name,
    page,
    page_size: 10,
    category_id: cate,
    search_type: 1,
    is_time: 1,
  });
  const categories = (
    await c.env.DB.prepare(
      'SELECT source_category_id, name FROM source_category WHERE status = 0 ORDER BY sort DESC'
    ).all<any>()
  ).results || [];

  const lines = (
    await c.env.DB.prepare(
      'SELECT DISTINCT pantype FROM api_list WHERE status = 1 ORDER BY pantype ASC'
    ).all<{ pantype: number }>()
  ).results || [];
  const panMap: Record<number, string> = { 0: '夸克', 1: '阿里', 2: '百度', 3: 'UC', 4: '迅雷' };
  let panTabs = lines
    .filter((l) => panMap[l.pantype] !== undefined)
    .map((l) => ({ type: l.pantype, name: panMap[l.pantype] }));
  if (!panTabs.length) panTabs = [{ type: 0, name: '夸克' }];

  // If no lines configured, treat 全网搜 as off for UI
  if (!lines.length) conf.is_quan = conf.is_quan === '1' ? '1' : '0';

  return c.html(await renderList(c.env, conf, name, page, cate, list, categories, panTabs));
}

app.get('/s/:slug', (c) => handleSearch(c, c.req.param('slug')));
app.get('/s/', async (c) => {
  const q = c.req.query('q') || c.req.query('name') || '';
  if (!q) return c.redirect('/');
  return c.redirect(`/s/${encodeURIComponent(q)}.html`);
});

app.get('/d/:id', async (c) => {
  const conf = await getConf(c.env);
  const id = String(c.req.param('id')).replace(/\.html$/i, '');
  const item = await getSourceDetail(c.env, Number(id));
  if (!item) return c.html('Not Found', 404);
  return c.html(await renderDetail(c.env, conf, item));
});

app.get('/sitemap.xml', async (c) => {
  const xml = await renderSitemap(c.env, new URL(c.req.url).origin);
  return new Response(xml, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
});

/** Admin Vite build lives at assets root (index.html, assets/*), but is served under /qfadmin/. */
function rewriteAdminAssetRequest(req: Request): Request {
  const url = new URL(req.url);
  const p = url.pathname;
  if (p === '/qfadmin' || p === '/qfadmin/') {
    url.pathname = '/index.html';
  } else if (p.startsWith('/qfadmin/')) {
    url.pathname = p.slice('/qfadmin'.length) || '/';
  }
  return new Request(url.toString(), req);
}

/** ASSETS may 30x /index.html → / ; follow internally so the browser stays on /qfadmin/. */
async function fetchAdminAssets(env: Env, req: Request): Promise<Response> {
  if (!env.ASSETS) {
    return new Response(
      `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Admin</title></head><body>请先构建管理端：npm run build:admin 后再部署</body></html>`,
      { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
    );
  }
  let assetReq = rewriteAdminAssetRequest(req);
  let res = await env.ASSETS.fetch(assetReq);
  for (let hop = 0; hop < 5 && res.status >= 300 && res.status < 400; hop++) {
    const loc = res.headers.get('Location');
    if (!loc) break;
    assetReq = new Request(new URL(loc, assetReq.url).toString(), assetReq);
    res = await env.ASSETS.fetch(assetReq);
  }
  return res;
}

app.get('/qfadmin', (c) => c.redirect('/qfadmin/'));
app.get('/qfadmin/', (c) => fetchAdminAssets(c.env, c.req.raw));
app.get('/qfadmin/*', (c) => fetchAdminAssets(c.env, c.req.raw));

app.notFound(async (c) => {
  if (c.env.ASSETS && c.req.path.startsWith('/qfadmin')) {
    const res = await fetchAdminAssets(c.env, c.req.raw);
    if (res.status !== 404) return res;
  }
  return c.text('Not Found', 404);
});

export default {
  fetch: app.fetch,
  async queue(batch: MessageBatch<TransferJob>, env: Env) {
    for (const msg of batch.messages) {
      try {
        await processTransferJob(env, msg.body);
        msg.ack();
      } catch {
        msg.retry();
      }
    }
  },
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(handleScheduled(event, env));
  },
};
