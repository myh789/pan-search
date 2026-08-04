/**
 * 迅雷网盘：登录检测 / 列目录 / 转存分享 / 删除（对齐 apps/worker XunleiPan）
 * xunlei_cookie 存的是 refresh_token
 */
import { httpJson } from './utils.js';
import { KEYS, blobGet, blobSet } from './blob.js';
import { setConfMany } from './db.js';

const CLIENT_ID = 'Xqp0kJBXWhwaTpB6';
const DEVICE_ID = '925b7631473a13716b791d7f28289cad';

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function headers(token, captcha = '') {
  return {
    Accept: '*/*',
    'Accept-Language': 'zh-CN,zh;q=0.9',
    Authorization: `Bearer ${token}`,
    Origin: 'https://pan.xunlei.com',
    Referer: 'https://pan.xunlei.com/',
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36',
    'x-client-id': CLIENT_ID,
    'x-device-id': DEVICE_ID,
    ...(captcha ? { 'x-captcha-token': captcha } : {}),
  };
}

async function getAccessToken(conf, overrideRefresh = '') {
  const cached = await blobGet(KEYS.xunleiToken);
  if (cached?.access_token && Number(cached.expires_at) > Date.now() / 1000) {
    return cached.access_token;
  }
  const refresh = String(overrideRefresh || conf.xunlei_cookie || '').trim();
  if (!refresh) return '';
  const res = await httpJson('https://xluser-ssl.xunlei.com/v1/auth/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36',
      Origin: 'https://pan.xunlei.com',
      Referer: 'https://pan.xunlei.com/',
    },
    body: { client_id: CLIENT_ID, grant_type: 'refresh_token', refresh_token: refresh },
    timeout: 60_000,
  });
  const data = res.data || {};
  const access = data.access_token || data.data?.access_token || '';
  const newRefresh = data.refresh_token || data.data?.refresh_token || '';
  if (access) {
    await blobSet(KEYS.xunleiToken, {
      access_token: access,
      expires_at: Math.floor(Date.now() / 1000) + 3500,
    });
  }
  if (newRefresh && newRefresh !== refresh) {
    try {
      await setConfMany({ xunlei_cookie: newRefresh });
      conf.xunlei_cookie = newRefresh;
    } catch {
      /* ignore persist errors */
    }
  }
  return access;
}

async function getCaptchaToken() {
  const cached = await blobGet(KEYS.xunleiCaptcha);
  if (cached?.captcha_token && Number(cached.expires_at) > Date.now() / 1000) {
    return cached.captcha_token;
  }
  const res = await httpJson('https://xluser-ssl.xunlei.com/v1/shield/captcha/init', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: {
      client_id: CLIENT_ID,
      action: 'get:/drive/v1/share',
      device_id: DEVICE_ID,
      meta: {
        username: '',
        phone_number: '',
        email: '',
        package_name: 'pan.xunlei.com',
        client_version: '1.45.0',
        captcha_sign: '1.fe2108ad808a74c9ac0243309242726c',
        timestamp: '1645241033384',
        user_id: '0',
      },
    },
    timeout: 60_000,
  });
  const data = res.data || {};
  const token = data.captcha_token || data.data?.captcha_token || '';
  if (token) {
    const ttl = Math.max(30, Number(data.expires_in || data.data?.expires_in || 300) - 10);
    await blobSet(KEYS.xunleiCaptcha, {
      captcha_token: token,
      expires_at: Math.floor(Date.now() / 1000) + ttl,
    });
  }
  return token;
}

function isFolder(f) {
  if (!f) return false;
  if (f.kind === 'drive#folder' || f.kind === 'folder') return true;
  if (String(f.type || '').toLowerCase() === 'folder') return true;
  if (f.file_extension === undefined && f.mime_type === 'application/vnd.xunlei.folder') return true;
  return false;
}

export async function testXunleiCookie(conf, overrideRefresh = '') {
  const refresh = String(overrideRefresh || conf.xunlei_cookie || '').trim();
  if (!refresh) return { code: 500, message: '未配置迅雷 refresh_token' };
  try {
    // 强制刷新，避免用旧缓存误判
    await blobSet(KEYS.xunleiToken, { access_token: '', expires_at: 0 });
    const token = await getAccessToken(conf, refresh);
    if (!token) return { code: 500, message: '迅雷未登录，请检查 refresh_token' };
    const list = await listXunleiFolders({ ...conf, xunlei_cookie: refresh }, '', refresh);
    if (list.code === 200) {
      return { code: 200, message: '迅雷 refresh_token 有效，已登录', data: { pantype: 4 } };
    }
    return { code: 500, message: list.message || '迅雷登录失败' };
  } catch (e) {
    return { code: 500, message: e?.message || '迅雷登录检测失败' };
  }
}

export async function listXunleiFolders(conf, pdirFid = '', overrideRefresh = '') {
  try {
    const token = await getAccessToken(conf, overrideRefresh);
    if (!token) return { code: 500, message: '迅雷未登录，请检查 refresh_token' };
    const captcha = await getCaptchaToken();
    const parent =
      pdirFid === 0 || pdirFid === '0' || pdirFid === 'root' || pdirFid === '' || pdirFid == null
        ? ''
        : String(pdirFid);
    const res = await httpJson('https://api-pan.xunlei.com/drive/v1/files', {
      method: 'GET',
      headers: headers(token, captcha),
      query: {
        parent_id: parent,
        filters: '{"phase":{"eq":"PHASE_TYPE_COMPLETE"},"trashed":{"eq":false}}',
        with_audit: 'true',
        thumbnail_size: 'SIZE_SMALL',
        limit: 100,
      },
      timeout: 60_000,
    });
    if (res.status >= 400 || res.data?.error || res.data?.error_code) {
      return {
        code: 500,
        message:
          res.data?.error_description || res.data?.message || res.data?.error || `迅雷接口错误(${res.status})`,
      };
    }
    const list = res.data?.files || res.data?.data?.files || [];
    const folders = (Array.isArray(list) ? list : [])
      .filter(isFolder)
      .map((f) => ({
        fid: String(f.id || ''),
        name: String(f.name || f.id || ''),
      }))
      .filter((f) => f.fid);
    return {
      code: 200,
      message: folders.length ? `获取成功，共 ${folders.length} 个文件夹` : '当前目录下没有文件夹',
      data: { pdir_fid: parent || '', items: folders },
    };
  } catch (e) {
    return { code: 500, message: e?.message || '迅雷目录获取失败' };
  }
}

export async function deleteXunleiFids(conf, filelist) {
  try {
    const token = await getAccessToken(conf);
    if (!token) return { code: 500, message: '迅雷未登录' };
    const captcha = await getCaptchaToken();
    const ids = (filelist || []).map(String).filter(Boolean);
    if (!ids.length) return { code: 200, message: 'ok', data: null };
    let res = await httpJson('https://api-pan.xunlei.com/drive/v1/files:batchDelete', {
      method: 'POST',
      headers: { ...headers(token, captcha), 'Content-Type': 'application/json' },
      body: { ids, space: '' },
      timeout: 60_000,
    });
    if (res.status >= 400 || res.data?.error_code) {
      res = await httpJson('https://api-pan.xunlei.com/drive/v1/files/batch_delete', {
        method: 'POST',
        headers: { ...headers(token, captcha), 'Content-Type': 'application/json' },
        body: { ids, space: '' },
        timeout: 60_000,
      });
    }
    if (res.status >= 400 || res.data?.error_code) {
      for (const id of ids) {
        await httpJson(`https://api-pan.xunlei.com/drive/v1/files/${id}`, {
          method: 'DELETE',
          headers: headers(token, captcha),
          timeout: 60_000,
        });
      }
    }
    return { code: 200, message: 'ok', data: null };
  } catch (e) {
    return { code: 500, message: e?.message || '迅雷删除失败' };
  }
}

function extractPwdId(url) {
  const m = String(url || '').match(/\/s\/([A-Za-z0-9_\-]+)/);
  return m ? m[1] : '';
}

function pickCode(cfg) {
  let code = String(cfg.code || '').replace(/#/g, '');
  if (!code) {
    const m = String(cfg.url || '').match(/[?&]pwd=([^&\s#]+)/i);
    if (m) code = m[1];
  }
  return code;
}

function xunleiOriginalFallback(cfg, title, code, reason) {
  const share_url = String(cfg.url || '').trim();
  if (!share_url) {
    return { code: 500, message: reason || '迅雷转存失败' };
  }
  return {
    code: 200,
    message: reason || '已返回原链接',
    data: {
      title: title || '迅雷资源',
      share_url,
      code: String(code || cfg.code || ''),
      fid: [],
      original: true,
    },
  };
}

export async function transferXunlei(conf, cfg) {
  const code = pickCode(cfg);
  const titleHint = '迅雷资源';
  // 验链：未登录也直接放行原链，不做检测/转存
  const isCheck = Number(cfg.isType) === 1;
  const refresh = String(conf.xunlei_cookie || '').trim();

  if (!refresh) {
    if (isCheck) {
      return {
        code: 200,
        message: '未配置迅雷凭证，跳过检测',
        data: { title: titleHint, share_url: cfg.url, code, valid: true, original: true },
      };
    }
    return xunleiOriginalFallback(cfg, titleHint, code, '未配置迅雷 refresh_token，已返回原链接');
  }

  try {
    const shareId = String(extractPwdId(cfg.url) || cfg.url || '')
      .split('?')[0]
      .replace(/^.*\//, '');

    const token = await getAccessToken(conf);
    if (!token) {
      if (isCheck) {
        return {
          code: 200,
          message: '迅雷未登录，跳过检测',
          data: { title: titleHint, share_url: cfg.url, code, valid: true, original: true },
        };
      }
      return xunleiOriginalFallback(cfg, titleHint, code, '迅雷未登录，已返回原链接');
    }
    const captcha = await getCaptchaToken();

    const shareRes = await httpJson('https://api-pan.xunlei.com/drive/v1/share', {
      method: 'GET',
      headers: headers(token, captcha),
      query: {
        share_id: shareId,
        pass_code: code,
        limit: 100,
        pass_code_token: '',
        page_token: '',
        thumbnail_size: 'SIZE_SMALL',
      },
      timeout: 60_000,
    });
    const info = shareRes.data;
    if (info?.error_code) {
      // 鉴权类错误：转存回退原链；验链则跳过
      const msg = info.error_description || '获取分享失败';
      if (/token|auth|login|未登录|unauthorized|401/i.test(String(msg) + String(info.error_code))) {
        if (isCheck) {
          return {
            code: 200,
            message: '迅雷凭证失效，跳过检测',
            data: { title: titleHint, share_url: cfg.url, code, valid: true, original: true },
          };
        }
        return xunleiOriginalFallback(cfg, titleHint, code, `${msg}，已返回原链接`);
      }
      return { code: 500, message: msg };
    }
    if (info?.share_status && info.share_status !== 'OK') {
      return {
        code: 500,
        message:
          info.share_status_text ||
          (info.share_status === 'SENSITIVE_RESOURCE' ? '该分享内容无法访问' : '资源已失效'),
      };
    }

    const title = info?.files?.[0]?.name || info?.title || shareId;
    if (isCheck) {
      return { code: 200, message: '检验成功', data: { title, share_url: cfg.url, code } };
    }

    const parent = Number(cfg.expired_type) === 2 ? conf.xunlei_file_time : conf.xunlei_file;
    const ids = Array.isArray(info?.files) ? info.files.map((f) => f.id).filter(Boolean) : [];
    const restoreRes = await httpJson('https://api-pan.xunlei.com/drive/v1/share/restore', {
      method: 'POST',
      headers: { ...headers(token, captcha), 'Content-Type': 'application/json' },
      body: {
        parent_id: parent || '',
        share_id: shareId,
        pass_code_token: info?.pass_code_token || '',
        ancestor_ids: [],
        specify_parent_id: true,
        file_ids: ids,
      },
      timeout: 60_000,
    });
    if (restoreRes.data?.error_code || restoreRes.status >= 400) {
      const msg = restoreRes.data?.error_description || restoreRes.data?.message || '迅雷转存失败';
      if (/token|auth|login|未登录|unauthorized|401/i.test(String(msg))) {
        return xunleiOriginalFallback(cfg, title, code, `${msg}，已返回原链接`);
      }
      return { code: 500, message: msg };
    }

    const taskId = restoreRes.data?.restore_task_id || restoreRes.data?.id;
    let taskData = restoreRes.data;
    if (taskId) {
      for (let i = 0; i < 20; i++) {
        const task = await httpJson(`https://api-pan.xunlei.com/drive/v1/tasks/${taskId}`, {
          method: 'GET',
          headers: headers(token, captcha),
          timeout: 60_000,
        });
        taskData = task.data || {};
        if (Number(taskData.progress) === 100) break;
        if (taskData.error_code) {
          return { code: 500, message: taskData.error_description || '转存任务失败' };
        }
        await sleep(500);
      }
    }
    if (taskData && Number(taskData.progress) !== 100 && taskId) {
      return { code: 500, message: taskData.message || '转存未完成' };
    }

    let fileIds = [];
    try {
      const trace = taskData?.params?.trace_file_ids;
      if (trace) {
        const parsed = typeof trace === 'string' ? JSON.parse(trace) : trace;
        if (Array.isArray(parsed)) fileIds = parsed.map(String);
        else if (parsed && typeof parsed === 'object') fileIds = Object.values(parsed).map(String);
      }
    } catch {
      /* ignore */
    }
    if (!fileIds.length && ids.length) fileIds = ids;

    const banned = (conf.quark_banned || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (banned.length && fileIds[0]) {
      try {
        const full = await httpJson('https://api-pan.xunlei.com/drive/v1/files', {
          method: 'GET',
          headers: headers(token, captcha),
          query: {
            parent_id: fileIds[0],
            filters: '{"phase":{"eq":"PHASE_TYPE_COMPLETE"},"trashed":{"eq":false}}',
            limit: 100,
          },
          timeout: 60_000,
        });
        const all = full.data?.files || [];
        const del = [];
        for (const f of all) {
          const name = String(f.name || '');
          if (banned.some((k) => name.includes(k))) del.push(f.id);
        }
        if (del.length && del.length === all.length) {
          await deleteXunleiFids(conf, [fileIds[0]]);
          return { code: 500, message: '资源内容为空' };
        }
        if (del.length) await deleteXunleiFids(conf, del);
      } catch {
        /* ignore */
      }
    }

    const expirationDays = Number(cfg.expired_type) === 2 ? '2' : '-1';
    const shareCreate = await httpJson('https://api-pan.xunlei.com/drive/v1/share', {
      method: 'POST',
      headers: { ...headers(token, captcha), 'Content-Type': 'application/json' },
      body: {
        file_ids: fileIds.length ? fileIds : ids,
        share_to: 'copy',
        params: { subscribe_push: 'false', WithPassCodeInLink: 'true' },
        title: '云盘资源分享',
        restore_limit: '-1',
        expiration_days: expirationDays,
      },
      timeout: 60_000,
    });
    if (shareCreate.data?.error_code || !shareCreate.data?.share_url) {
      const msg = shareCreate.data?.error_description || '创建分享失败';
      if (/token|auth|login|未登录|unauthorized|401/i.test(String(msg))) {
        return xunleiOriginalFallback(cfg, title, code, `${msg}，已返回原链接`);
      }
      return { code: 500, message: msg };
    }

    const pass = shareCreate.data.pass_code || code || '';
    const shareUrl = pass
      ? `${shareCreate.data.share_url}${String(shareCreate.data.share_url).includes('?') ? '&' : '?'}pwd=${pass}`
      : shareCreate.data.share_url;

    return {
      code: 200,
      message: '转存成功',
      data: {
        title,
        share_url: shareUrl,
        code: pass,
        fid: fileIds,
      },
    };
  } catch (e) {
    const msg = e?.message || '迅雷转存失败';
    if (/token|auth|login|未登录|unauthorized|401/i.test(String(msg))) {
      if (isCheck) {
        return {
          code: 200,
          message: '迅雷凭证异常，跳过检测',
          data: { title: titleHint, share_url: cfg.url, code, valid: true, original: true },
        };
      }
      return xunleiOriginalFallback(cfg, titleHint, code, `${msg}，已返回原链接`);
    }
    return { code: 500, message: msg };
  }
}
