import { Hono } from 'hono';
import type { Env, AppVariables } from '../env';
import { jok, jerr, parsePanLinks, determineIsType } from '@pan-search/shared';
import {
  createCaptcha,
  verifyCaptcha,
  loginAdmin,
  resolveAccess,
  getMenuForAdmin,
  assertNodeAccess,
  revokeAccess,
} from '../services/auth';
import { getConf, getConfRowsForAdmin, setConf, invalidateConf } from '../services/conf';
import { fillSourceMeta } from '../services/ai';
import { encodePassword, nowSec, randString } from '../utils';
import { createPan } from '../pan';
import { createSourceLog } from '../queue/transfer';
import { insertSource } from '../services/source';
import {
  bumpAdminStats,
  getAdminStats,
  getCachedApiList,
  getCachedCategories,
  invalidateApiListCache,
  invalidateCategories,
  onSourceMutated,
} from '../services/cache';

export const adminRoutes = new Hono<{ Bindings: Env; Variables: AppVariables }>();

adminRoutes.use('*', async (c, next) => {
  const path = c.req.path;
  if (
    path.endsWith('/system/getCaptcha') ||
    path.endsWith('/admin/login') ||
    path.includes('/admin/login')
  ) {
    return next();
  }
  // normalize: allow /admin/system/getCaptcha etc without auth
  const action = path.split('/').pop();
  if (action === 'getCaptcha' || action === 'login') return next();

  const token = c.req.header('access_token') || c.req.query('access_token') || '';
  const access = await resolveAccess(c.env, token);
  if (!access) return c.json(jerr('请先登录', 401));
  c.set('adminId', access.access_admin);
  c.set('adminGroup', access.admin_group);
  await next();
});

adminRoutes.get('/system/getCaptcha', async (c) => {
  const data = await createCaptcha(c.env);
  return c.json(jok('ok', data));
});

adminRoutes.post('/admin/login', async (c) => {
  const body = await c.req.parseBody();
  const okCap = await verifyCaptcha(c.env, String(body.captcha_token || ''), String(body.captcha || ''));
  if (!okCap) return c.json(jerr('验证码错误'));
  const ip = c.req.header('cf-connecting-ip') || '';
  const res = await loginAdmin(
    c.env,
    String(body.admin_account || body.account || ''),
    String(body.admin_password || body.password || ''),
    String(body.plat || 'web'),
    ip
  );
  if (!res.ok) return c.json(jerr(res.message));
  return c.json(jok('登录成功', res.data));
});

adminRoutes.post('/admin/logout', async (c) => {
  const token = c.req.header('access_token') || '';
  await revokeAccess(c.env, token);
  return c.json(jok('已退出'));
});

adminRoutes.get('/admin/getMyInfo', async (c) => {
  const id = c.get('adminId');
  const withMenu = c.req.query('with_menu') === '1';
  const row = await c.env.DB.prepare(
    'SELECT admin_id, admin_account, admin_name, admin_truename, admin_email, admin_idcard, admin_group FROM admin WHERE admin_id = ?'
  )
    .bind(id)
    .first();
  if (!withMenu) return c.json(jok('ok', row));
  const menu = await getMenuForAdmin(c.env, c.get('adminGroup') || 0);
  return c.json(jok('ok', { ...row, menu }));
});

/** 概况页统计：KV 缓存，不走三次列表 COUNT */
adminRoutes.get('/system/stats', async (c) => {
  const force = c.req.query('force') === '1';
  const stats = await getAdminStats(c.env, force);
  return c.json(jok('ok', stats));
});

adminRoutes.post('/admin/updateMyInfo', async (c) => {
  const body = await c.req.parseBody();
  const id = c.get('adminId');
  if (!id) return c.json(jerr('未登录', 401));
  const name = String(body.admin_name || '').trim();
  if (!name) return c.json(jerr('昵称必须填写'));
  await c.env.DB.prepare(
    'UPDATE admin SET admin_name=?, admin_truename=?, admin_email=?, admin_idcard=?, admin_updatetime=? WHERE admin_id=?'
  )
    .bind(
      name,
      String(body.admin_truename || ''),
      String(body.admin_email || ''),
      String(body.admin_idcard || ''),
      nowSec(),
      id
    )
    .run();
  return c.json(jok('资料已更新'));
});

adminRoutes.post('/admin/motifyPassword', async (c) => {
  const body = await c.req.parseBody();
  const admin = await c.env.DB.prepare('SELECT * FROM admin WHERE admin_id = ?').bind(c.get('adminId')).first<any>();
  const oldHash = await encodePassword(String(body.old_password || ''), admin.admin_salt);
  if (oldHash !== admin.admin_password) return c.json(jerr('原密码错误'));
  const salt = randString(4);
  const hash = await encodePassword(String(body.new_password || ''), salt);
  await c.env.DB.prepare('UPDATE admin SET admin_password = ?, admin_salt = ?, admin_updatetime = ? WHERE admin_id = ?')
    .bind(hash, salt, nowSec(), admin.admin_id)
    .run();
  return c.json(jok('修改成功'));
});

// ---- conf ----
adminRoutes.get('/conf/getBaseConfig', async (c) => {
  const rows = await getConfRowsForAdmin(c.env);
  return c.json(jok('ok', rows));
});

adminRoutes.get('/conf/getList', async (c) => {
  const type = c.req.query('conf_type');
  let sql = 'SELECT * FROM conf WHERE 1=1';
  const params: any[] = [];
  if (type !== undefined && type !== '') {
    sql += ' AND conf_type = ?';
    params.push(Number(type));
  }
  sql += ' ORDER BY conf_sort DESC';
  const rows = await c.env.DB.prepare(sql).bind(...params).all();
  const { maskSecret } = await import('../services/secret');
  const items = (rows.results || []).map((r: any) =>
    r.conf_key === 'ai_api_key' && r.conf_value ? { ...r, conf_value: maskSecret(String(r.conf_value)) } : r
  );
  return c.json(jok('ok', { items, total: items.length }));
});

adminRoutes.post('/conf/updateBaseConfig', async (c) => {
  const ct = c.req.header('content-type') || '';
  let body: Record<string, any> = {};
  if (ct.includes('application/json')) {
    body = (await c.req.json().catch(() => ({}))) as Record<string, any>;
  } else {
    body = (await c.req.parseBody()) as Record<string, any>;
  }
  let touchAli = false;
  let touchXunlei = false;
  for (const [k, v] of Object.entries(body)) {
    if (['access_token', 'plat', 'version'].includes(k)) continue;
    await setConf(c.env, k, String(v ?? ''));
    if (k === 'Authorization' || k === 'ali_drive_id') touchAli = true;
    if (k === 'xunlei_cookie') touchXunlei = true;
  }
  // Token 变更后清掉网盘 access_token 缓存，避免沿用旧凭证
  if (touchAli) {
    await c.env.KV.delete('aliyun:token');
    await c.env.KV.delete('aliyun:access_token');
  }
  if (touchXunlei) {
    await c.env.KV.delete('xunlei:access_token');
    await c.env.KV.delete('xunlei:captcha');
  }
  return c.json(jok('保存成功'));
});

adminRoutes.post('/system/clean', async (c) => {
  await invalidateConf(c.env);
  const list = await c.env.KV.list({ prefix: 'ranking:' });
  for (const k of list.keys) await c.env.KV.delete(k.name);
  await c.env.KV.delete('site:conf');
  await c.env.KV.delete('sitemap:xml');
  await invalidateCategories(c.env);
  await invalidateApiListCache(c.env);
  await onSourceMutated(c.env, 0);
  const { invalidateSearchIndex, rebuildSearchIndex } = await import('../services/search-index');
  await invalidateSearchIndex(c.env);
  const total = await rebuildSearchIndex(c.env, true);
  return c.json(jok(total != null ? `清理完成，搜索索引已重建（${total} 条）` : '清理完成'));
});

// ---- source ----
adminRoutes.get('/source/getList', async (c) => {
  const page = Number(c.req.query('page') || 1);
  const pageSize = Number(c.req.query('page_size') || 20);
  const title = c.req.query('title') || c.req.query('keyword') || '';
  const categoryId = Number(c.req.query('source_category_id') || 0);
  const where = ['is_delete = 0'];
  const params: any[] = [];
  if (title) {
    where.push('title LIKE ?');
    params.push(`%${title}%`);
  }
  if (categoryId) {
    where.push('source_category_id = ?');
    params.push(categoryId);
  }
  const whereSql = `WHERE ${where.join(' AND ')}`;
  const total = await c.env.DB.prepare(`SELECT COUNT(*) as c FROM source ${whereSql}`).bind(...params).first<{ c: number }>();
  let items: D1Result<any>;
  try {
    items = await c.env.DB.prepare(
      `SELECT * FROM source ${whereSql} ORDER BY is_top DESC, source_id DESC LIMIT ? OFFSET ?`
    )
      .bind(...params, pageSize, (page - 1) * pageSize)
      .all();
  } catch {
    // 未执行 0006 迁移时无 is_top 列，回退避免后台空白
    items = await c.env.DB.prepare(
      `SELECT * FROM source ${whereSql} ORDER BY source_id DESC LIMIT ? OFFSET ?`
    )
      .bind(...params, pageSize, (page - 1) * pageSize)
      .all();
  }
  return c.json(jok('ok', { items: items.results || [], total: total?.c || 0, page, page_size: pageSize }));
});

adminRoutes.post('/source/detail', async (c) => {
  const body = await c.req.parseBody();
  const id = Number(body.source_id);
  if (!id) return c.json(jerr('缺少ID'));
  const row = await c.env.DB.prepare('SELECT * FROM source WHERE source_id = ? AND is_delete = 0').bind(id).first();
  if (!row) return c.json(jerr('资源不存在', 404));
  return c.json(jok('ok', row));
});

adminRoutes.post('/source/add', async (c) => {
  const body = await c.req.parseBody();
  if (!body.title || !body.url) return c.json(jerr('标题和地址必填'));
  const id = await insertSource(c.env, {
    title: String(body.title),
    url: String(body.url),
    description: String(body.description || ''),
    is_type: Number(body.is_type || 0),
    code: String(body.code || ''),
    source_category_id: Number(body.source_category_id || 0),
    vod_content: String(body.vod_content || ''),
    status: Number(body.status ?? 1),
  });
  await onSourceMutated(c.env, 1);
  return c.json(jok('添加成功', { source_id: id }));
});

adminRoutes.post('/source/update', async (c) => {
  const body = await c.req.parseBody();
  const id = Number(body.source_id);
  if (!id) return c.json(jerr('缺少ID'));
  const hasTop = body.is_top !== undefined && body.is_top !== '';
  if (hasTop) {
    await c.env.DB.prepare(
      `UPDATE source SET title=?, url=?, description=?, is_type=?, code=?, source_category_id=?, vod_content=?, status=?, is_top=?, update_time=? WHERE source_id=?`
    )
      .bind(
        String(body.title || ''),
        String(body.url || ''),
        String(body.description || ''),
        Number(body.is_type || 0),
        String(body.code || ''),
        Number(body.source_category_id || 0),
        String(body.vod_content || ''),
        Number(body.status ?? 1),
        Number(body.is_top) ? 1 : 0,
        nowSec(),
        id
      )
      .run();
  } else {
    await c.env.DB.prepare(
      `UPDATE source SET title=?, url=?, description=?, is_type=?, code=?, source_category_id=?, vod_content=?, status=?, update_time=? WHERE source_id=?`
    )
      .bind(
        String(body.title || ''),
        String(body.url || ''),
        String(body.description || ''),
        Number(body.is_type || 0),
        String(body.code || ''),
        Number(body.source_category_id || 0),
        String(body.vod_content || ''),
        Number(body.status ?? 1),
        nowSec(),
        id
      )
      .run();
  }
  const { markSearchIndexDirty } = await import('../services/search-index');
  await markSearchIndexDirty(c.env);
  return c.json(jok('更新成功'));
});

adminRoutes.post('/source/toggleTop', async (c) => {
  const body = await c.req.parseBody();
  const id = Number(body.source_id);
  if (!id) return c.json(jerr('缺少ID'));
  const row = await c.env.DB.prepare('SELECT is_top FROM source WHERE source_id = ? AND is_delete = 0')
    .bind(id)
    .first<{ is_top: number }>();
  if (!row) return c.json(jerr('资源不存在', 404));
  const next = Number(row.is_top) ? 0 : 1;
  await c.env.DB.prepare('UPDATE source SET is_top = ?, update_time = ? WHERE source_id = ?')
    .bind(next, nowSec(), id)
    .run();
  const { markSearchIndexDirty } = await import('../services/search-index');
  await markSearchIndexDirty(c.env);
  return c.json(jok(next ? '已置顶' : '已取消置顶', { is_top: next }));
});

/** 一键 AI 填充关键词（description）与介绍（vod_content）；已有字段不覆盖 */
adminRoutes.post('/source/aiFill', async (c) => {
  const body = await c.req.parseBody();
  const ids = String(body.ids || body.source_id || '')
    .split(',')
    .map(Number)
    .filter(Boolean);
  if (!ids.length) return c.json(jerr('请选择资源'));
  if (ids.length > 20) return c.json(jerr('单次最多 20 条'));

  // 强制读最新 conf，避免刚配完 Key 仍命中旧 KV 缓存
  const conf = await getConf(c.env, true);
  if ((conf.ai_enabled ?? '1') === '0') {
    return c.json(jerr('AI 填充未启用：请到 基础设置 → AI设置 打开开关'));
  }
  if (!(c.env.AGNES_API_KEY || conf.ai_api_key || '').trim()) {
    return c.json(
      jerr('未配置 AI API Key：请到 基础设置 → AI设置 填写 Agnes 密钥并保存（或设置 Secret AGNES_API_KEY）')
    );
  }

  const results: { source_id: number; ok: boolean; message: string }[] = [];
  let filled = 0;
  let skipped = 0;

  for (const id of ids) {
    const row = await c.env.DB.prepare(
      'SELECT source_id, title, description, vod_content FROM source WHERE source_id = ? AND is_delete = 0'
    )
      .bind(id)
      .first<{ source_id: number; title: string; description: string; vod_content: string }>();
    if (!row) {
      results.push({ source_id: id, ok: false, message: '不存在' });
      continue;
    }
    try {
      const out = await fillSourceMeta(c.env, row, conf);
      if (out.skipped) {
        skipped++;
        results.push({ source_id: id, ok: true, message: out.reason || '跳过' });
        continue;
      }
      const desc = out.description != null ? out.description : row.description || '';
      const intro = out.vod_content != null ? out.vod_content : row.vod_content || '';
      await c.env.DB.prepare(
        'UPDATE source SET description = ?, vod_content = ?, update_time = ? WHERE source_id = ?'
      )
        .bind(desc, intro, nowSec(), id)
        .run();
      filled++;
      results.push({ source_id: id, ok: true, message: '已填充' });
    } catch (e: any) {
      results.push({ source_id: id, ok: false, message: e?.message || '失败' });
    }
  }

  if (filled > 0) {
    const { markSearchIndexDirty } = await import('../services/search-index');
    await markSearchIndexDirty(c.env);
  }

  return c.json(
    jok(
      [
        `完成：填充 ${filled}，跳过 ${skipped}，失败 ${results.filter((r) => !r.ok).length}`,
        skipped
          ? `跳过原因：${
              [...new Set(results.filter((r) => r.ok && r.message !== '已填充').map((r) => r.message))].join('；') || '未知'
            }`
          : '',
        results.find((r) => !r.ok)?.message ? `失败示例：${results.find((r) => !r.ok)!.message}` : '',
      ]
        .filter(Boolean)
        .join('\n'),
      {
        filled,
        skipped,
        results,
      }
    )
  );
});

adminRoutes.post('/source/delete', async (c) => {
  const body = await c.req.parseBody();
  const ids = String(body.ids || body.source_id || '')
    .split(',')
    .map(Number)
    .filter(Boolean);
  for (const id of ids) {
    await c.env.DB.prepare('UPDATE source SET is_delete = 1, update_time = ? WHERE source_id = ?').bind(nowSec(), id).run();
  }
  await onSourceMutated(c.env, -ids.length);
  return c.json(jok('删除成功'));
});

adminRoutes.post('/source/transfer', async (c) => {
  const body = await c.req.parseBody();
  const type = Number(body.type || 2); // 1=直接导入(不转存) 2=转存分享导入
  const urlsRaw = String(body.urls || body.url || '');
  if (!urlsRaw.trim()) return c.json(jerr('参数不能为空'));
  const parsed = parsePanLinks(urlsRaw);
  if (!parsed.length) return c.json(jerr('未解析到有效链接'));
  if (parsed.length > 500) return c.json(jerr('一次最多 500 条'));
  const categoryId = Number(body.source_category_id || 0);
  const isImport = type === 1;
  const logId = await createSourceLog(c.env, isImport ? '批量转入链接' : '批量转存他人链接', parsed.length);
  const items = parsed.map((x) => ({
    url: x.url,
    code: x.code || undefined,
    title: x.title || undefined,
    categoryId,
  }));
  await c.env.TRANSFER_QUEUE.send({
    type: isImport ? 'import_batch' : 'transfer_batch',
    logId,
    categoryId,
    items,
  });
  return c.json(jok('已提交任务，稍后查看结果', { logId, count: parsed.length, mode: isImport ? 'import' : 'transfer' }));
});

adminRoutes.post('/source/imports', async (c) => {
  const body = await c.req.json<{ items?: any[]; source_category_id?: number; mode?: string }>().catch(() => null);
  if (!body?.items?.length) return c.json(jerr('无导入数据（请前端 SheetJS 解析后提交 items）'));
  const categoryId = Number(body.source_category_id || 0);
  // excel / direct: 仅入库不转存不校验（对齐原版表格导入）
  if (!body.mode || body.mode === 'excel' || body.mode === 'direct') {
    let n = 0;
    for (const x of body.items) {
      const url = String(x.url || '').trim();
      if (!url) continue;
      const title = String(x.title || '').replace(/^\d+[\.\-]/, '').trim() || url;
      await insertSource(c.env, {
        title,
        url,
        is_type: determineIsType(url),
        code: String(x.code || ''),
        source_category_id: Number(x.source_category_id || categoryId),
      });
      n++;
    }
    if (!n) return c.json(jerr('无可导入的资源，请检查表格格式'));
    return c.json(jok(`导入成功${n}个资源`, { count: n }));
  }
  const mode = body.mode === 'import' ? 'import_batch' : 'transfer_batch';
  const logId = await createSourceLog(c.env, mode === 'import_batch' ? '批量转入链接' : '批量转存他人链接', body.items.length);
  await c.env.TRANSFER_QUEUE.send({
    type: mode as any,
    logId,
    categoryId,
    items: body.items.map((x) => ({
      title: x.title,
      url: x.url,
      code: x.code,
      categoryId: x.source_category_id || categoryId,
    })),
  });
  return c.json(jok('已提交导入任务', { logId }));
});

adminRoutes.get('/source/getFiles', async (c) => handleGetFiles(c));
adminRoutes.post('/source/getFiles', async (c) => handleGetFiles(c));

async function handleGetFiles(c: any) {
  try {
    const conf = await getConf(c.env, true);
    const body = c.req.method === 'POST' ? await c.req.parseBody().catch(() => ({})) : {};
    const type = Number(c.req.query('type') || (body as any).type || 0);
    const pdirRaw = String(c.req.query('pdir_fid') ?? (body as any).pdir_fid ?? '');
    const pdir =
      pdirRaw === '' || pdirRaw === '0' || pdirRaw === 'root'
        ? type === 1
          ? 'root'
          : type === 2
            ? '/'
            : type === 4
              ? ''
              : '0'
        : pdirRaw;
    const pan = createPan(type, conf, { url: '' }, c.env);
    const res = await pan.getFiles(pdir);
    if (res.code !== 200) return c.json(jerr(res.message || '获取失败'));
    const list = Array.isArray((res as any).data) ? (res as any).data : [];
    const normalized = list.map((f: any) => {
      // 按网盘对齐原版 cascader 的 value/label/是否文件夹字段
      let id = '';
      let name = '-';
      let isDir = false;
      if (type === 0 || type === 3) {
        id = String(f.fid || '');
        name = f.file_name || f.name || '-';
        isDir = f.dir === true || f.dir === 1 || f.dir === '1';
      } else if (type === 1) {
        id = String(f.file_id || '');
        name = f.name || '-';
        isDir = f.type === 'folder';
      } else if (type === 2) {
        id = String(f.path || f.fs_id || '');
        name = f.server_filename || f.name || '-';
        isDir = f.isdir == 1 || f.isdir === '1' || f.isdir === true;
      } else if (type === 4) {
        id = String(f.id || '');
        name = f.name || '-';
        isDir = f.kind === 'drive#folder';
      } else {
        id = String(f.fid || f.file_id || f.fs_id || f.id || f.path || '');
        name = f.file_name || f.server_filename || f.name || '-';
        isDir = !!(f.dir || f.isdir || f.type === 'folder' || f.kind === 'drive#folder');
      }
      return { ...f, _id: id, _name: name, _is_dir: !!isDir };
    });
    normalized.sort((a: any, b: any) => Number(b._is_dir) - Number(a._is_dir));
    return c.json(jok('获取成功', normalized));
  } catch (e: any) {
    return c.json(jerr(e?.message || '账号检测失败，请检查 Cookie/Token'));
  }
}

adminRoutes.post('/source/transferAll', async (c) => {
  const body = await c.req.parseBody().catch(() => ({} as any));
  const categoryId = Number(body.source_category_id || 0);
  await c.env.TRANSFER_QUEUE.send({ type: 'transfer_all', categoryId: categoryId || undefined });
  return c.json(jok('已提交全部转存任务'));
});

// category
adminRoutes.get('/source_category/getList', async (c) => {
  const rows = await getCachedCategories(c.env);
  return c.json(jok('ok', { items: rows }));
});

adminRoutes.post('/source_category/add', async (c) => {
  const body = await c.req.parseBody();
  const t = nowSec();
  await c.env.DB.prepare(
    'INSERT INTO source_category (name, image, sort, status, is_sys, is_update, is_type, create_time, update_time) VALUES (?, ?, ?, ?, 0, ?, ?, ?, ?)'
  )
    .bind(
      String(body.name || ''),
      String(body.image || ''),
      Number(body.sort || 0),
      Number(body.status || 0),
      Number(body.is_update ?? 1),
      Number(body.is_type || 0),
      t,
      t
    )
    .run();
  await invalidateCategories(c.env);
  return c.json(jok('添加成功'));
});

adminRoutes.post('/source_category/update', async (c) => {
  const body = await c.req.parseBody();
  await c.env.DB.prepare(
    'UPDATE source_category SET name=?, image=?, sort=?, status=?, is_update=?, is_type=?, update_time=? WHERE source_category_id=?'
  )
    .bind(
      String(body.name || ''),
      String(body.image || ''),
      Number(body.sort || 0),
      Number(body.status || 0),
      Number(body.is_update ?? 1),
      Number(body.is_type || 0),
      nowSec(),
      Number(body.source_category_id)
    )
    .run();
  await invalidateCategories(c.env);
  return c.json(jok('更新成功'));
});

adminRoutes.post('/source_category/delete', async (c) => {
  const body = await c.req.parseBody();
  const id = Number(body.source_category_id);
  const row = await c.env.DB.prepare('SELECT is_sys FROM source_category WHERE source_category_id = ?').bind(id).first<any>();
  if (row?.is_sys === 1) return c.json(jerr('系统分类不可删除'));
  await c.env.DB.prepare('DELETE FROM source_category WHERE source_category_id = ?').bind(id).run();
  await invalidateCategories(c.env);
  return c.json(jok('删除成功'));
});

adminRoutes.post('/source_category/setStatus', async (c) => {
  const body = await c.req.parseBody();
  const allowed = ['is_update', 'is_type', 'status'] as const;
  const field = allowed.includes(body.field as any) ? String(body.field) : 'status';
  await c.env.DB.prepare(`UPDATE source_category SET ${field} = ?, update_time = ? WHERE source_category_id = ?`)
    .bind(Number(body.value), nowSec(), Number(body.source_category_id))
    .run();
  await invalidateCategories(c.env);
  return c.json(jok('ok'));
});

// api_list
adminRoutes.get('/api_list/getList', async (c) => {
  const rows = await getCachedApiList(c.env);
  return c.json(jok('ok', { items: rows }));
});

adminRoutes.post('/api_list/add', async (c) => {
  const body = await c.req.parseBody();
  const t = nowSec();
  await c.env.DB.prepare(
    `INSERT INTO api_list (name, type, pantype, url, method, fixed_params, headers, field_map, count, html_item, html_title, html_url, html_type, html_url2, weight, status, create_time, update_time)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      String(body.name || ''),
      String(body.type || 'api'),
      Number(body.pantype || 0),
      String(body.url || ''),
      String(body.method || 'GET'),
      String(body.fixed_params || '{}'),
      String(body.headers || '{}'),
      String(body.field_map || '{}'),
      Number(body.count || 10),
      String(body.html_item || ''),
      String(body.html_title || ''),
      String(body.html_url || ''),
      Number(body.html_type || 0),
      String(body.html_url2 || ''),
      Number(body.weight || 0),
      Number(body.status ?? 1),
      t,
      t
    )
    .run();
  await invalidateApiListCache(c.env);
  await bumpAdminStats(c.env, { lines: 1 });
  return c.json(jok('添加成功'));
});

adminRoutes.post('/api_list/update', async (c) => {
  const body = await c.req.parseBody();
  await c.env.DB.prepare(
    `UPDATE api_list SET name=?, type=?, pantype=?, url=?, method=?, fixed_params=?, headers=?, field_map=?, count=?, html_item=?, html_title=?, html_url=?, html_type=?, html_url2=?, weight=?, status=?, update_time=? WHERE id=?`
  )
    .bind(
      String(body.name || ''),
      String(body.type || 'api'),
      Number(body.pantype || 0),
      String(body.url || ''),
      String(body.method || 'GET'),
      String(body.fixed_params || '{}'),
      String(body.headers || '{}'),
      String(body.field_map || '{}'),
      Number(body.count || 10),
      String(body.html_item || ''),
      String(body.html_title || ''),
      String(body.html_url || ''),
      Number(body.html_type || 0),
      String(body.html_url2 || ''),
      Number(body.weight || 0),
      Number(body.status ?? 1),
      nowSec(),
      Number(body.id)
    )
    .run();
  await invalidateApiListCache(c.env);
  return c.json(jok('更新成功'));
});

adminRoutes.post('/api_list/delete', async (c) => {
  const body = await c.req.parseBody();
  await c.env.DB.prepare('DELETE FROM api_list WHERE id = ?').bind(Number(body.id)).run();
  await invalidateApiListCache(c.env);
  await bumpAdminStats(c.env, { lines: -1 });
  return c.json(jok('删除成功'));
});

adminRoutes.post('/api_list/enable', async (c) => {
  const body = await c.req.parseBody();
  await c.env.DB.prepare('UPDATE api_list SET status = 1 WHERE id = ?').bind(Number(body.id)).run();
  await invalidateApiListCache(c.env);
  return c.json(jok('ok'));
});

adminRoutes.post('/api_list/disable', async (c) => {
  const body = await c.req.parseBody();
  await c.env.DB.prepare('UPDATE api_list SET status = 0 WHERE id = ?').bind(Number(body.id)).run();
  await invalidateApiListCache(c.env);
  return c.json(jok('ok'));
});

// logs / feedback
adminRoutes.get('/source_log/getList', async (c) => {
  const rows = await c.env.DB.prepare('SELECT * FROM source_log ORDER BY source_log_id DESC LIMIT 100').all();
  return c.json(jok('ok', { items: rows.results || [] }));
});

adminRoutes.post('/source_log/delete', async (c) => {
  const body = await c.req.parseBody();
  const ids = String(body.ids || body.source_log_id || '')
    .split(',')
    .map(Number)
    .filter(Boolean);
  if (!ids.length) return c.json(jerr('未选择日志'));
  for (const id of ids) {
    await c.env.DB.prepare('DELETE FROM source_log WHERE source_log_id = ?').bind(id).run();
  }
  return c.json(jok('删除成功'));
});

adminRoutes.get('/feedback/getList', async (c) => {
  const page = Number(c.req.query('page') || 1);
  const pageSize = Number(c.req.query('page_size') || 50);
  // total 走概况统计缓存，避免每次列表再 COUNT
  const stats = await getAdminStats(c.env);
  const rows = await c.env.DB.prepare('SELECT * FROM feedback ORDER BY id DESC LIMIT ? OFFSET ?')
    .bind(pageSize, (page - 1) * pageSize)
    .all();
  return c.json(jok('ok', { items: rows.results || [], total: stats.feedback, page, page_size: pageSize }));
});

adminRoutes.post('/feedback/delete', async (c) => {
  const body = await c.req.parseBody();
  const ids = String(body.ids || body.id || '')
    .split(',')
    .map(Number)
    .filter(Boolean);
  if (!ids.length) return c.json(jerr('未选择需求'));
  for (const id of ids) {
    await c.env.DB.prepare('DELETE FROM feedback WHERE id = ?').bind(id).run();
  }
  await bumpAdminStats(c.env, { feedback: -ids.length });
  return c.json(jok('删除成功'));
});

// attach upload to R2
adminRoutes.post('/attach/uploadImage', async (c) => {
  const form = await c.req.parseBody();
  const file = form.file;
  if (!file || typeof file === 'string') return c.json(jerr('未选择文件'));
  const f = file as File;
  const key = `uploads/${Date.now()}_${f.name}`;
  await c.env.R2.put(key, await f.arrayBuffer(), { httpMetadata: { contentType: f.type } });
  const t = nowSec();
  await c.env.DB.prepare(
    'INSERT INTO attach (attach_name, attach_path, attach_type, attach_size, attach_admin, attach_createtime, attach_updatetime) VALUES (?, ?, ?, ?, ?, ?, ?)'
  )
    .bind(f.name, key, f.type, f.size, c.get('adminId') || 0, t, t)
    .run();
  return c.json(jok('上传成功', { path: `/api/tool/file?key=${encodeURIComponent(key)}`, key }));
});

adminRoutes.post('/attach/delete', async (c) => {
  const body = await c.req.parseBody();
  const ids = String(body.ids || body.attach_id || '')
    .split(',')
    .map(Number)
    .filter(Boolean);
  if (!ids.length) return c.json(jerr('未选择附件'));
  for (const id of ids) {
    const row = await c.env.DB.prepare('SELECT * FROM attach WHERE attach_id = ?').bind(id).first<any>();
    if (!row) continue;
    try {
      await c.env.R2.delete(row.attach_path);
    } catch {
      /* ignore */
    }
    await c.env.DB.prepare('DELETE FROM attach WHERE attach_id = ?').bind(id).run();
  }
  return c.json(jok('删除成功'));
});

adminRoutes.get('/attach/getList', async (c) => {
  const page = Number(c.req.query('page') || 1);
  const pageSize = Number(c.req.query('page_size') || 20);
  const total = await c.env.DB.prepare('SELECT COUNT(*) as c FROM attach').first<{ c: number }>();
  const rows = await c.env.DB.prepare('SELECT * FROM attach ORDER BY attach_id DESC LIMIT ? OFFSET ?')
    .bind(pageSize, (page - 1) * pageSize)
    .all();
  return c.json(jok('ok', { items: rows.results || [], total: total?.c || 0, page, page_size: pageSize }));
});

// admin / group / node CRUD (simplified)
adminRoutes.get('/admin/getList', async (c) => {
  if (!(await assertNodeAccess(c.env, c.get('adminGroup') || 0, 'admin', 'index'))) return c.json(jerr('无权限', 403));
  const rows = await c.env.DB.prepare(
    'SELECT admin_id, admin_account, admin_name, admin_email, admin_group, admin_status, admin_createtime FROM admin ORDER BY admin_id'
  ).all();
  return c.json(jok('ok', { items: rows.results || [] }));
});

adminRoutes.post('/admin/add', async (c) => {
  const body = await c.req.parseBody();
  const salt = randString(4);
  const hash = await encodePassword(String(body.admin_password || 'Admin123!'), salt);
  const t = nowSec();
  await c.env.DB.prepare(
    'INSERT INTO admin (admin_account, admin_password, admin_salt, admin_name, admin_group, admin_ipreg, admin_status, admin_createtime, admin_updatetime) VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)'
  )
    .bind(
      String(body.admin_account),
      hash,
      salt,
      String(body.admin_name || body.admin_account),
      Number(body.admin_group || 1),
      c.req.header('cf-connecting-ip') || '',
      t,
      t
    )
    .run();
  return c.json(jok('添加成功'));
});

adminRoutes.post('/admin/update', async (c) => {
  const body = await c.req.parseBody();
  const id = Number(body.admin_id);
  if (!id) return c.json(jerr('缺少ID'));
  if (id === 1 && Number(body.admin_group) && Number(body.admin_group) !== 1) {
    return c.json(jerr('不可修改超管用户组'));
  }
  const name = String(body.admin_name || '');
  const group = Number(body.admin_group || 1);
  const pwd = String(body.admin_password || '');
  if (pwd) {
    const salt = randString(4);
    const hash = await encodePassword(pwd, salt);
    await c.env.DB.prepare(
      'UPDATE admin SET admin_name=?, admin_group=?, admin_password=?, admin_salt=?, admin_updatetime=? WHERE admin_id=?'
    )
      .bind(name, group, hash, salt, nowSec(), id)
      .run();
  } else {
    await c.env.DB.prepare('UPDATE admin SET admin_name=?, admin_group=?, admin_updatetime=? WHERE admin_id=?')
      .bind(name, group, nowSec(), id)
      .run();
  }
  return c.json(jok('更新成功'));
});

adminRoutes.post('/admin/delete', async (c) => {
  const body = await c.req.parseBody();
  const ids = String(body.ids || body.admin_id || '')
    .split(',')
    .map(Number)
    .filter(Boolean);
  for (const id of ids) {
    if (id === 1) continue;
    const row = await c.env.DB.prepare('SELECT admin_group FROM admin WHERE admin_id = ?').bind(id).first<{ admin_group: number }>();
    if (row?.admin_group === 1) continue;
    await c.env.DB.prepare('DELETE FROM admin WHERE admin_id = ?').bind(id).run();
  }
  return c.json(jok('删除成功'));
});

adminRoutes.post('/admin/disable', async (c) => {
  const body = await c.req.parseBody();
  const id = Number(body.admin_id);
  if (id === 1) return c.json(jerr('不可禁用超管'));
  await c.env.DB.prepare('UPDATE admin SET admin_status = 1, admin_updatetime = ? WHERE admin_id = ?')
    .bind(nowSec(), id)
    .run();
  return c.json(jok('已禁用'));
});

adminRoutes.post('/admin/enable', async (c) => {
  const body = await c.req.parseBody();
  await c.env.DB.prepare('UPDATE admin SET admin_status = 0, admin_updatetime = ? WHERE admin_id = ?')
    .bind(nowSec(), Number(body.admin_id))
    .run();
  return c.json(jok('已启用'));
});

adminRoutes.get('/group/getList', async (c) => {
  const rows = await c.env.DB.prepare('SELECT * FROM groups').all();
  return c.json(jok('ok', { items: rows.results || [] }));
});

adminRoutes.post('/group/add', async (c) => {
  const body = await c.req.parseBody();
  const name = String(body.group_name || '').trim();
  if (!name) return c.json(jerr('组名必填'));
  const t = nowSec();
  await c.env.DB.prepare(
    'INSERT INTO groups (group_name, group_desc, group_status, group_createtime, group_updatetime) VALUES (?, ?, 0, ?, ?)'
  )
    .bind(name, String(body.group_desc || ''), t, t)
    .run();
  return c.json(jok('添加成功'));
});

adminRoutes.post('/group/update', async (c) => {
  const body = await c.req.parseBody();
  const gid = Number(body.group_id);
  if (!gid || gid === 1) return c.json(jerr('不可修改超管组'));
  await c.env.DB.prepare(
    'UPDATE groups SET group_name = ?, group_desc = ?, group_status = ?, group_updatetime = ? WHERE group_id = ?'
  )
    .bind(String(body.group_name || ''), String(body.group_desc || ''), Number(body.group_status || 0), nowSec(), gid)
    .run();
  return c.json(jok('更新成功'));
});

adminRoutes.post('/group/delete', async (c) => {
  const body = await c.req.parseBody();
  const gid = Number(body.group_id);
  if (!gid || gid === 1) return c.json(jerr('不可删除超管组'));
  const used = await c.env.DB.prepare('SELECT admin_id FROM admin WHERE admin_group = ? LIMIT 1').bind(gid).first();
  if (used) return c.json(jerr('该组仍有管理员，无法删除'));
  await c.env.DB.prepare('DELETE FROM auth WHERE auth_group = ?').bind(gid).run();
  await c.env.DB.prepare('DELETE FROM groups WHERE group_id = ?').bind(gid).run();
  return c.json(jok('删除成功'));
});

adminRoutes.post('/group/disable', async (c) => {
  const body = await c.req.parseBody();
  const gid = Number(body.group_id);
  if (!gid || gid === 1) return c.json(jerr('不可禁用超管组'));
  await c.env.DB.prepare('UPDATE groups SET group_status = 1, group_updatetime = ? WHERE group_id = ?')
    .bind(nowSec(), gid)
    .run();
  return c.json(jok('已禁用'));
});

adminRoutes.post('/group/enable', async (c) => {
  const body = await c.req.parseBody();
  await c.env.DB.prepare('UPDATE groups SET group_status = 0, group_updatetime = ? WHERE group_id = ?')
    .bind(nowSec(), Number(body.group_id))
    .run();
  return c.json(jok('已启用'));
});

adminRoutes.get('/group/getAuthorize', async (c) => {
  const gid = Number(c.req.query('group_id'));
  const nodes = await c.env.DB.prepare('SELECT * FROM node ORDER BY node_order DESC').all();
  const auths = await c.env.DB.prepare('SELECT auth_node FROM auth WHERE auth_group = ?').bind(gid).all<{ auth_node: number }>();
  return c.json(jok('ok', { nodes: nodes.results || [], checked: (auths.results || []).map((a) => a.auth_node) }));
});

adminRoutes.post('/group/authorize', async (c) => {
  const body = await c.req.parseBody();
  const gid = Number(body.group_id);
  if (gid === 1) return c.json(jerr('超管无需授权'));
  await c.env.DB.prepare('DELETE FROM auth WHERE auth_group = ?').bind(gid).run();
  const ids = String(body.node_ids || '')
    .split(',')
    .map(Number)
    .filter(Boolean);
  const t = nowSec();
  for (const nid of ids) {
    await c.env.DB.prepare(
      'INSERT INTO auth (auth_group, auth_node, auth_status, auth_createtime, auth_updatetime) VALUES (?, ?, 0, ?, ?)'
    )
      .bind(gid, nid, t, t)
      .run();
  }
  return c.json(jok('授权成功'));
});

adminRoutes.get('/node/getList', async (c) => {
  const rows = await c.env.DB.prepare('SELECT * FROM node ORDER BY node_order DESC, node_id ASC').all();
  return c.json(jok('ok', { items: rows.results || [] }));
});

adminRoutes.get('/log/getList', async (c) => {
  const rows = await c.env.DB.prepare('SELECT * FROM log ORDER BY id DESC LIMIT 200').all();
  return c.json(jok('ok', { items: rows.results || [] }));
});
