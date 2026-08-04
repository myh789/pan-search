/**
 * /api/* Cloud Function 入口
 * 路径：cloud-functions/api/[[default]].js → /api/**
 */
import { ensureBootstrap, getConf, setConfMany, getApiList, saveApiList, nextId, createSession, getSession, deleteSession, insertTempSource, seedDefaultQuarkLines, bumpSearchStats, getSearchStats } from '../../lib/db.js';
import { encodePassword, jok, jerr, json, parseBody, aesEncrypt, aesDecrypt, determineIsType, env } from '../../lib/utils.js';
import { streamWebSearch } from '../../lib/search.js';
import { transferUrl, testCookie, listPanFolders } from '../../lib/pan.js';
import { cleanupTempSources, withLock } from '../../lib/cleanup.js';
import { KEYS, blobGet, resetBlobStore } from '../../lib/blob.js';
import { getHotList } from '../../lib/hot.js';

/** 把控制台环境变量灌进 process.env，供 lib/* 使用 */
function injectEnv(context) {
  const envObj = context?.env;
  if (!envObj || typeof envObj !== 'object') return;
  for (const [k, v] of Object.entries(envObj)) {
    if (v != null && (process.env[k] == null || process.env[k] === '')) {
      process.env[k] = String(v);
    }
  }
  resetBlobStore();
}

function headerOf(request, name) {
  const h = request?.headers;
  if (!h) return '';
  if (typeof h.get === 'function') return h.get(name) || h.get(name.toLowerCase()) || '';
  return h[name] || h[name.toLowerCase()] || '';
}

function pathOf(request) {
  const url = new URL(request.url);
  // /api/xxx
  return url.pathname.replace(/^\/api/, '') || '/';
}

function tokenOf(request, body = {}) {
  return (
    headerOf(request, 'access_token') ||
    body.access_token ||
    new URL(request.url).searchParams.get('access_token') ||
    ''
  );
}

async function requireAdmin(request, body = {}) {
  const token = tokenOf(request, body);
  const session = await getSession(token);
  if (!session?.admin_id) return null;
  return session;
}

// 必须 export default，否则平台可能不识别 Cloud Function（/api 会回落成首页 HTML）
export default async function onRequest(context) {
  injectEnv(context);
  const request = context.request;
  const method = request.method.toUpperCase();
  const path = pathOf(request);
  const url = new URL(request.url);
  const cors = { 'Access-Control-Allow-Origin': '*' };

  if (method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type,access_token,plat,version',
      },
    });
  }

  // Blob 探针：在 ensureBootstrap 之前执行，避免其它逻辑掩盖 SDK 错误
  if ((path === '/blob/init' || path === '/health') && (method === 'GET' || method === 'POST')) {
    try {
      const { blobPing, storeName } = await import('../../lib/blob.js');
      const ping = await blobPing();
      if (path === '/blob/init') {
        try {
          await ensureBootstrap();
        } catch (bootErr) {
          return json(
            jok('Blob 已写入，bootstrap 失败', {
              store: storeName(),
              ping,
              bootstrap_error: bootErr?.message || String(bootErr),
            }),
            200,
            cors
          );
        }
        return json(
          jok('Blob 已初始化', {
            store: ping.store,
            hint: '控制台「存储 → Blob 存储」刷新；也可用 /api/blob-init 看详细步骤',
            ping,
          }),
          200,
          cors
        );
      }
      await ensureBootstrap();
      return json(jok('ok', { ts: Date.now(), runtime: 'cloud', blob: ping }), 200, cors);
    } catch (e) {
      return json(
        {
          code: 500,
          message: e?.message || 'blob error',
          data: {
            path,
            stack: String(e?.stack || '').slice(0, 1200),
            hint: '优先访问 /api/blob-init；若 Cannot find module，检查 package.json 依赖与部署根目录是否为 edgeone/',
          },
        },
        500,
        cors
      );
    }
  }

  // 登录单独处理：不依赖外层 ensureBootstrap，错误信息直接回给前端
  if (path === '/admin/login' && method === 'POST') {
    try {
      const body = await parseBody(request);
      const account = String(body.admin_account || body.account || 'admin').trim() || 'admin';
      const password = String(body.admin_password || body.password || '');
      if (!password) return json(jerr('请输入密码'), 200, cors);
      await ensureBootstrap();
      const admin = await blobGet(KEYS.admin);
      if (!admin) {
        return json(jerr('管理员未初始化，请先打开 /api/blob-init 触发 Blob 创建后再登录'), 200, cors);
      }
      if (admin.admin_account !== account) return json(jerr('账号或密码错误'), 200, cors);
      const hash = encodePassword(password, admin.admin_salt || 'abcd');
      if (hash !== admin.admin_password) return json(jerr('账号或密码错误'), 200, cors);
      const access_token = await createSession(admin.admin_id);
      return json(jok('登录成功', { access_token, admin_name: admin.admin_name }), 200, cors);
    } catch (e) {
      return json(
        {
          code: 500,
          message: '登录失败：' + (e?.message || String(e)),
          data: {
            hint: '多半是 Blob SDK 不可用。请先访问 /api/blob-init 查看详细错误',
            stack: String(e?.stack || '').slice(0, 800),
          },
        },
        500,
        cors
      );
    }
  }

  try {
    await ensureBootstrap();
    // 顺带做轻量懒清理（定时任务之外的兜底）
    if (Math.random() < 0.02) {
      withLock('lazy_cleanup', 120, () => cleanupTempSources()).catch(() => {});
    }

    if (path === '/tool/getConfig' && method === 'GET') {
      const conf = await getConf();
      const stats = await getSearchStats();
      return json(
        jok('ok', {
          app_name: conf.app_name,
          app_title: conf.app_title,
          app_subname: conf.app_subname,
          is_quan: conf.is_quan,
          is_quan_zc: conf.is_quan_zc || '0',
          pc_type: conf.pc_type,
          enable_quark: conf.enable_quark !== '0' ? '1' : '0',
          enable_baidu: conf.enable_baidu !== '0' ? '1' : '0',
          enable_xunlei: conf.enable_xunlei !== '0' ? '1' : '0',
          search_tips: conf.search_tips || '',
          contact_text: conf.contact_text || '',
          footer_copyright: conf.footer_copyright || '',
          stats: {
            today: stats.today,
            total: stats.total,
          },
        }),
        200,
        cors
      );
    }

    if (path === '/other/hot' && method === 'GET') {
      try {
        const board = url.searchParams.get('board') || url.searchParams.get('type') || '';
        const data = await getHotList(board);
        return json(jok('ok', data), 200, cors);
      } catch (e) {
        return json(jerr(e?.message || '热榜暂不可用'), 200, cors);
      }
    }

    if (path === '/other/web_search' && method === 'GET') {
      const conf = await getConf();
      const title = url.searchParams.get('title') || '';
      const is_type = url.searchParams.has('is_type') ? Number(url.searchParams.get('is_type')) : -1;
      const is_show = Number(url.searchParams.get('is_show') || 0);
      const scene = Number(url.searchParams.get('scene') || 0);
      const enableMap = {
        0: conf.enable_quark !== '0',
        2: conf.enable_baidu !== '0',
        4: conf.enable_xunlei !== '0',
      };
      if (is_type >= 0 && enableMap[is_type] === false) {
        const payload = `data: [DONE]${JSON.stringify({ reason: 'platform_off', count: 0 })}\n\n`;
        return new Response(payload, {
          headers: {
            'Content-Type': 'text/event-stream; charset=utf-8',
            'Cache-Control': 'no-cache',
            Connection: 'keep-alive',
            ...cors,
          },
        });
      }
      if (title) {
        bumpSearchStats().catch(() => {});
      }
      const lines = await getApiList({
        pantype: is_type < 0 ? undefined : is_type,
        scene,
        enabledOnly: true,
      });
      const stream = await streamWebSearch({
        conf,
        lines,
        title,
        isType: is_type,
        isShow: is_show,
        transferUrl,
        aesEncrypt,
      });
      return new Response(stream, {
        headers: {
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
          ...cors,
        },
      });
    }

    if (path === '/other/check_url' && (method === 'POST' || method === 'GET')) {
      const conf = await getConf();
      const body = method === 'POST' ? await parseBody(request) : Object.fromEntries(url.searchParams);
      let rawUrl = String(body.url || '');
      try {
        if (rawUrl && !/^https?:\/\//i.test(rawUrl)) rawUrl = aesDecrypt(rawUrl);
      } catch {
        /* keep raw */
      }
      if (!rawUrl) return json(jerr('资源地址不能为空'), 200, cors);
      // 仅验链：不转存、不写临时库
      const res = await transferUrl(conf, {
        url: rawUrl,
        code: String(body.code || ''),
        stoken: body.stoken,
        expired_type: 1,
        isType: 1,
      });
      if (res.code !== 200 || !res.data) {
        return json(jerr(res.message || '链接无效', { valid: false }), 200, cors);
      }
      return json(
        jok('有效', {
          valid: true,
          title: res.data.title,
          stoken: res.data.stoken || '',
          share_url: res.data.share_url || rawUrl,
        }),
        200,
        cors
      );
    }

    if (path === '/other/save_url' && (method === 'POST' || method === 'GET')) {
      const conf = await getConf();
      const body = method === 'POST' ? await parseBody(request) : Object.fromEntries(url.searchParams);
      let rawUrl = String(body.url || '');
      try {
        if (rawUrl && !/^https?:\/\//i.test(rawUrl)) rawUrl = aesDecrypt(rawUrl);
      } catch {
        /* keep raw */
      }
      if (!rawUrl) return json(jerr('资源地址不能为空'), 200, cors);
      const res = await transferUrl(conf, {
        url: rawUrl,
        code: String(body.code || ''),
        stoken: body.stoken,
        expired_type: 2,
        isType: 0,
      });
      if (res.code !== 200 || !res.data) return json(jerr(res.message || '转存失败'), 200, cors);
      // 百度等回退原链：不入临时库（无需定时删除）
      if (res.data.original) {
        return json(jok(res.message || '已返回原链接', { ...res.data }), 200, cors);
      }
      const row = await insertTempSource({
        title: res.data.title,
        url: res.data.share_url,
        code: res.data.code,
        is_type: determineIsType(res.data.share_url),
        fid: typeof res.data.fid === 'string' ? res.data.fid : JSON.stringify(res.data.fid || []),
      });
      return json(jok('临时资源获取成功', { id: row.source_id, ...res.data }), 200, cors);
    }

    if (path === '/admin/logout' && method === 'POST') {
      const body = await parseBody(request);
      await deleteSession(tokenOf(request, body));
      return json(jok('已退出'), 200, cors);
    }

    // ---- admin protected ----
    const isAdminPath = path.startsWith('/admin/');
    if (isAdminPath) {
      const body = method === 'GET' ? {} : await parseBody(request);
      const session = await requireAdmin(request, body);
      if (!session) return json({ code: 401, message: '未登录', data: null }, 401, cors);

      if (path === '/admin/conf/getMap' && method === 'GET') {
        const conf = await getConf(true);
        const pub = { ...conf };
        // 打码展示敏感字段
        for (const k of ['quark_cookie', 'baidu_cookie', 'uc_cookie', 'xunlei_cookie', 'Authorization']) {
          if (pub[k]) pub[k] = String(pub[k]).slice(0, 6) + '****';
        }
        return json(jok('ok', pub), 200, cors);
      }

      if (path === '/admin/conf/getRaw' && method === 'GET') {
        // 编辑用：返回完整（仅登录后）
        return json(jok('ok', await getConf(true)), 200, cors);
      }

      if (path === '/admin/conf/save' && method === 'POST') {
        const conf = await setConfMany(body);
        return json(jok('保存成功', { keys: Object.keys(body).length }), 200, cors);
      }

      if (path === '/admin/api_list/getList' && method === 'GET') {
        const list = await getApiList();
        return json(jok('ok', { items: list }), 200, cors);
      }

      if (path === '/admin/api_list/seedQuark' && method === 'POST') {
        const out = await seedDefaultQuarkLines({ force: false });
        const parts = [];
        if (out.added) parts.push(`导入 ${out.added} 条 JSON 线路`);
        if (out.removedHtml) parts.push(`移除 ${out.removedHtml} 条百度/迅雷网页线路`);
        return json(
          jok(parts.length ? parts.join('，') : '示例线路已存在，未重复添加', out),
          200,
          cors
        );
      }

      if (path === '/admin/api_list/save' && method === 'POST') {
        const item = body;
        let list = await getApiList();
        if (item.id) {
          list = list.map((x) => (Number(x.id) === Number(item.id) ? { ...x, ...item, id: Number(item.id) } : x));
        } else {
          const id = await nextId('api');
          list.push({
            id,
            name: item.name || '未命名线路',
            type: Number(item.type || 0),
            pantype: Number(item.pantype || 0),
            url: item.url || '',
            method: item.method || 'GET',
            fixed_params: item.fixed_params || '{"keyword":"{keyword}"}',
            headers: item.headers || '{}',
            field_map: item.field_map || '{}',
            count: Number(item.count || 10),
            weight: Number(item.weight || 0),
            status: Number(item.status ?? 1),
            scene: Number(item.scene || 0),
          });
        }
        await saveApiList(list);
        return json(jok('保存成功'), 200, cors);
      }

      if (path === '/admin/api_list/delete' && method === 'POST') {
        let list = await getApiList();
        list = list.filter((x) => Number(x.id) !== Number(body.id));
        await saveApiList(list);
        return json(jok('已删除'), 200, cors);
      }

      if (path === '/admin/api_list/toggle' && method === 'POST') {
        let list = await getApiList();
        list = list.map((x) =>
          Number(x.id) === Number(body.id) ? { ...x, status: Number(body.status) } : x
        );
        await saveApiList(list);
        return json(jok('ok'), 200, cors);
      }

      if (path === '/admin/deposit/test' && method === 'POST') {
        const conf = await getConf(true);
        const pantype = Number(body.pantype ?? 0);
        const cookieOverride = String(
          body.quark_cookie || body.baidu_cookie || body.xunlei_cookie || body.cookie || ''
        );
        const r = await testCookie(conf, pantype, cookieOverride);
        return json(r.code === 200 ? jok(r.message, r.data) : jerr(r.message), 200, cors);
      }

      if (path === '/admin/deposit/folders' && (method === 'GET' || method === 'POST')) {
        const conf = await getConf(true);
        const bodyOrQuery = method === 'GET' ? Object.fromEntries(url.searchParams) : body;
        const pantype = Number(bodyOrQuery.pantype ?? 0);
        const root = pantype === 2 ? '/' : pantype === 4 ? '' : '0';
        const pdir = String(bodyOrQuery.pdir_fid ?? bodyOrQuery.pdir ?? root);
        const cookieOverride = String(
          bodyOrQuery.quark_cookie ||
            bodyOrQuery.baidu_cookie ||
            bodyOrQuery.xunlei_cookie ||
            bodyOrQuery.cookie ||
            ''
        );
        const r = await listPanFolders(conf, pantype, pdir, cookieOverride);
        return json(r.code === 200 ? jok(r.message, r.data) : jerr(r.message, r.data), 200, cors);
      }

      if (path === '/admin/system/cleanup' && method === 'POST') {
        const out = await withLock('manual_cleanup', 300, () => cleanupTempSources());
        return json(jok('清理完成', out), 200, cors);
      }

      if (path === '/admin/me' && method === 'GET') {
        const admin = await blobGet(KEYS.admin);
        return json(jok('ok', { admin_name: admin?.admin_name, account: admin?.admin_account }), 200, cors);
      }

      return json(jerr('未知管理接口: ' + path), 200, cors);
    }

    return json(jerr('Not Found: ' + path), 404, cors);
  } catch (e) {
    return json({ code: 500, message: e?.message || 'server error', data: null }, 500, {
      'Access-Control-Allow-Origin': '*',
    });
  }
}
