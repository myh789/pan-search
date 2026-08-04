/**
 * 百度网盘：登录检测 / 列目录 / 转存分享 / 删除（对齐 apps/worker BaiduPan）
 */
import { httpJson } from './utils.js';

const BAIDU_ERRORS = {
  [-1]: '链接错误，链接失效或缺少提取码或访问频繁风控',
  [-4]: '无效登录。请退出账号在其他地方的登录',
  [-6]: '请用浏览器无痕模式获取 Cookie 后再试',
  [-7]: '转存失败，转存文件夹名有非法字符，不能包含 < > | * ? \\ :，请改正目录名后重试',
  [-8]: '转存失败，目录中已有同名文件或文件夹存在',
  [-9]: '链接不存在或提取码错误',
  [-10]: '转存失败，容量不足',
  [-12]: '链接错误，提取码错误',
  [-21]: '来晚了，该分享已被取消',
  [-3]: '文件不存在或尚未转存完成',
  [-62]: '链接访问次数过多，请手动转存或稍后再试',
  0: '转存成功',
  2: '转存失败，目标目录不存在',
  4: '转存失败，目录中存在同名文件',
  12: '转存失败，转存文件数超过限制',
  20: '转存失败，容量不足',
  105: '链接错误，所访问的页面不存在',
  115: '该文件禁止分享',
  140: '链接出错或已失效',
  9019: '需要验证，请稍后重试',
};

/** 分享已明确失效（勿再当有效） */
const DEAD_SHARE_ERRNOS = new Set([-21, -9, -12, 105, 140]);

function errMsg(code) {
  return BAIDU_ERRORS[code] ?? `未知错误（错误码：${code}）`;
}

function updateCookieBdclnd(cookie, bdclnd) {
  const map = {};
  for (const pair of cookie.split(';')) {
    const [k, ...rest] = pair.trim().split('=');
    if (k) map[k] = rest.join('=');
  }
  map.BDCLND = bdclnd;
  return Object.entries(map)
    .map(([k, v]) => `${k}=${v}`)
    .join('; ');
}

function baiduHeaders(cookie) {
  // 不手动设 Host：EdgeOne/fetch 环境下强行 Host 易导致异常响应
  return {
    Accept: 'application/json, text/plain, */*',
    Referer: 'https://pan.baidu.com/disk/main',
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    Cookie: cookie,
  };
}

/** 百度 fs_id/fsid 等为大整数，JSON.parse 会丢精度 → 二次分享链「页面不存在」 */
function parseBaiduJson(text) {
  if (text != null && typeof text === 'object') return text;
  const raw = String(text || '');
  const safe = raw.replace(
    /"(fs_id|fsid|shareid|share_id|uk|share_uk|fsId)"\s*:\s*(-?\d+)/g,
    '"$1":"$2"'
  );
  try {
    return JSON.parse(safe);
  } catch {
    try {
      return JSON.parse(raw);
    } catch {
      return { errno: -1 };
    }
  }
}

function appendPwd(link, password) {
  const p = String(password || '').trim();
  if (!p) return String(link || '');
  const url = String(link || '');
  if (/[?&]pwd=/i.test(url)) return url;
  return url + (url.includes('?') ? '&' : '?') + 'pwd=' + encodeURIComponent(p);
}

function cookieBdclnd(cookie) {
  const m = String(cookie || '').match(/(?:^|;\s*)BDCLND=([^;]+)/);
  if (!m) return '';
  try {
    return decodeURIComponent(m[1]);
  } catch {
    return m[1];
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function transferHasSuccess(res) {
  const errno = Number(res?.errno);
  if (errno === 0) return true;
  // 12=批量失败，但 info 里可能有成功项
  if (errno === 12 && Array.isArray(res.info)) {
    return res.info.some((i) => Number(i?.errno) === 0 && (i.fsid != null || i.path));
  }
  return false;
}

/** 心悦：substr(linkUrl, 25, 23)，即 /s/ 后最多 23 位（通常含开头 1） */
function extractSurlXinyue(linkUrl) {
  const s = String(linkUrl || '');
  const q = s.match(/[?&]surl=([a-zA-Z0-9_-]+)/i);
  if (q) return q[1].slice(0, 50);
  const idx = s.indexOf('/s/');
  if (idx >= 0) return s.slice(idx + 3).split(/[?#]/)[0].slice(0, 50);
  return s.slice(25, 48);
}

/** /share/verify、/share/list 常用：去掉路径里开头的 1 */
function extractSurl(linkUrl) {
  let s = extractSurlXinyue(linkUrl);
  if (s.startsWith('1') && s.length > 1) s = s.slice(1);
  return s;
}

/** 心悦原版正则：从分享页 HTML 抠参数 */
function parseShareHtml(html) {
  const text = String(html || '');
  const shareid = [...text.matchAll(/"shareid":(\d+?),"/g)].map((m) => m[1]);
  const userId = [...text.matchAll(/"share_uk":"(\d+?)","/g)].map((m) => m[1]);
  const fsId = [...text.matchAll(/"fs_id":(\d+?),"/g)].map((m) => m[1]);
  const names = [...text.matchAll(/"server_filename":"(.+?)","/g)].map((m) => {
    try {
      return JSON.parse(`"${m[1]}"`);
    } catch {
      return m[1];
    }
  });
  const isdir = [...text.matchAll(/"isdir":(\d+?),"/g)].map((m) => m[1]);
  if (!shareid.length || !userId.length || !fsId.length || !names.length || !isdir.length) return -1;
  return [shareid[0], userId[0], fsId, [...new Set(names)], isdir];
}

function containsAd(filename, banned) {
  if (!banned) return false;
  const lower = filename.toLowerCase();
  return banned
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
    .some((k) => lower.includes(k));
}

/** 百度 ondup=newcopy 会变成 name(1)，需按原名匹配 */
function baseFileName(name) {
  return String(name || '').replace(/\s*\(\d+\)$/, '');
}

function nameMatchesShare(serverName, shareNames) {
  const n = String(serverName || '');
  if (!n) return false;
  if (shareNames.includes(n)) return true;
  const base = baseFileName(n);
  return shareNames.includes(base) || shareNames.some((s) => baseFileName(s) === base || n.startsWith(`${s}(`) || n.startsWith(`${s} (`));
}

/** 从转存目录解析本盘 fs_id（勿用 transfer.info.fsid，那常是分享侧 id → 二次分享 -3） */
function pickTransferredFiles(dirList, folderName, fileNames, toPaths) {
  const list = Array.isArray(dirList) ? dirList : [];
  const fsIdList = [];
  const filePaths = [];
  const wantPaths = new Set((toPaths || []).map((p) => String(p).replace(/\/+/g, '/')));

  if (wantPaths.size) {
    for (const file of list) {
      const p = String(file.path || `/${folderName}/${file.server_filename}`).replace(/\/+/g, '/');
      if (!wantPaths.has(p)) continue;
      fsIdList.push(String(file.fs_id));
      filePaths.push(p);
    }
  }

  if (!fsIdList.length) {
    const newest = new Map();
    for (const file of list) {
      if (!nameMatchesShare(file.server_filename, fileNames)) continue;
      const key = baseFileName(file.server_filename);
      const mt = Number(file.server_mtime || file.local_mtime || 0);
      const prev = newest.get(key);
      if (!prev || mt >= Number(prev.server_mtime || prev.local_mtime || 0)) {
        newest.set(key, file);
      }
    }
    for (const file of newest.values()) {
      fsIdList.push(String(file.fs_id));
      filePaths.push(
        String(file.path || `/${folderName}/${file.server_filename}`).replace(/\/+/g, '/')
      );
    }
  }

  return { fsIdList, filePaths };
}

class BaiduWork {
  constructor(cookie) {
    this.cookie = cookie;
    this.bdstoken = '';
  }

  async request(method, path, query = {}, form) {
    const headers = baiduHeaders(this.cookie);
    if (form) headers['Content-Type'] = 'application/x-www-form-urlencoded';
    const res = await httpJson(`https://pan.baidu.com${path}`, {
      method,
      headers,
      cookie: this.cookie,
      query,
      body: form ? new URLSearchParams(form).toString() : undefined,
      timeout: 60_000,
    });
    const parsed = parseBaiduJson(res.text != null ? res.text : res.data);
    return typeof parsed === 'object' && parsed ? parsed : { errno: -1 };
  }

  async getBdstoken() {
    const res = await this.request('GET', '/api/gettemplatevariable', {
      clienttype: '0',
      app_id: '38824127',
      web: '1',
      fields: '["bdstoken","token","uk","isdocuser","servertime"]',
    });
    if (res.errno != 0) return res.errno;
    return String(res.result?.bdstoken || '');
  }

  async getDirList(folderName) {
    const res = await this.request('GET', '/api/list', {
      order: 'time',
      desc: '1',
      showempty: '0',
      web: '1',
      page: '1',
      num: '1000',
      dir: folderName,
      bdstoken: this.bdstoken,
    });
    if (res.errno != 0) return res.errno;
    return res.list || [];
  }

  async createDir(folderName) {
    const res = await this.request(
      'POST',
      '/api/create',
      { a: 'commit', bdstoken: this.bdstoken },
      { path: folderName, isdir: '1', block_list: '[]' }
    );
    return Number(res.errno);
  }

  async verifyPassCode(linkUrl, passCode) {
    const candidates = [...new Set([extractSurl(linkUrl), extractSurlXinyue(linkUrl)].filter(Boolean))];
    let lastErrno = -1;
    for (const surl of candidates) {
      const res = await this.request(
        'POST',
        '/share/verify',
        {
          surl,
          bdstoken: this.bdstoken,
          t: Date.now(),
          channel: 'chunlei',
          web: '1',
          app_id: '250528',
          clienttype: '0',
        },
        { pwd: passCode, vcode: '', vcode_str: '' }
      );
      if (Number(res.errno) === 0) return String(res.randsk || '');
      lastErrno = Number(res.errno);
    }
    return lastErrno;
  }

  updateBdclnd(randsk) {
    this.cookie = updateCookieBdclnd(this.cookie, randsk);
  }

  /** EdgeOne 上 HTML 常被风控，优先走 /share/list（与心悦目标一致，路径更稳） */
  async getShareListParams(linkUrl) {
    // 只用不带开头 1 的 shorturl；带 1 时百度常直接返回 140，干扰判断
    const surls = [...new Set([extractSurl(linkUrl)].filter(Boolean))];
    let lastErrno = -1;
    const sekey = cookieBdclnd(this.cookie);
    for (const shorturl of surls) {
      const query = {
        web: '1',
        app_id: '250528',
        channel: 'chunlei',
        clienttype: '0',
        desc: '1',
        showempty: '0',
        page: '1',
        num: '100',
        order: 'time',
        shorturl,
        root: '1',
      };
      if (sekey) query.sekey = sekey;
      const res = await this.request('GET', '/share/list', query);
      if (Number(res.errno) !== 0) {
        lastErrno = Number(res.errno);
        // -21=分享已取消：提取码校验仍可能 errno=0，必须以 list 为准
        if (DEAD_SHARE_ERRNOS.has(lastErrno)) return lastErrno;
        continue;
      }
      const shareid = String(res.share_id ?? res.shareid ?? '');
      const uk = String(res.uk ?? res.share_uk ?? '');
      const list = Array.isArray(res.list) ? res.list : [];
      if (!shareid || !uk || !list.length) {
        lastErrno = -1;
        continue;
      }
      const fsIds = list.map((f) => String(f.fs_id));
      const names = list.map((f) => String(f.server_filename || '')).filter(Boolean);
      const isdir = list.map((f) => String(f.isdir ?? 0));
      if (!fsIds.length || !names.length) {
        lastErrno = -1;
        continue;
      }
      return [shareid, uk, fsIds, [...new Set(names)], isdir];
    }
    return lastErrno;
  }

  async getTransferParams(url) {
    const fromApi = await this.getShareListParams(url);
    if (Array.isArray(fromApi)) return fromApi;
    // 已明确失效：不要再扒 HTML（取消页里可能残留旧字段导致误判有效）
    if (typeof fromApi === 'number' && DEAD_SHARE_ERRNOS.has(fromApi)) return fromApi;

    // 回退：心悦原版扒分享页 HTML
    const res = await fetch(url, {
      headers: {
        ...baiduHeaders(this.cookie),
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      redirect: 'follow',
    });
    const html = await res.text();
    if (/分享被取消|分享已过期|链接不存在|啊哦，来晚了|页面不存在/.test(html)) return -21;
    const parsed = parseShareHtml(html);
    return parsed === -1 && typeof fromApi === 'number' ? fromApi : parsed;
  }

  async transferFile(paramsList, folderName) {
    // 对齐心悦：path = '/' + folderName；补 sekey；async=0 避免空 info
    const folder = String(folderName || '').replace(/^\/+/, '');
    const query = {
      shareid: paramsList[0],
      from: paramsList[1],
      bdstoken: this.bdstoken,
      channel: 'chunlei',
      web: '1',
      clienttype: '0',
      app_id: '250528',
      ondup: 'newcopy',
      async: '0',
    };
    const sekey = cookieBdclnd(this.cookie);
    if (sekey) query.sekey = sekey;
    let res = await this.request(
      'POST',
      '/share/transfer',
      query,
      {
        fsidlist: `[${paramsList[2].join(',')}]`,
        path: `/${folder}`,
      }
    );

    // 若走了异步任务，轮询直到结束
    const taskId = res?.task_id || res?.taskid;
    if (taskId && Number(taskId) > 0 && !transferHasSuccess(res)) {
      for (let i = 0; i < 25; i++) {
        await sleep(600);
        const q = await this.request('GET', '/share/taskquery', {
          task_id: String(taskId),
          taskid: String(taskId),
          channel: 'chunlei',
          web: '1',
          clienttype: '0',
          app_id: '250528',
          bdstoken: this.bdstoken,
        });
        if (transferHasSuccess(q) || Number(q?.status) === 0) {
          res = { ...q, errno: Number(q?.errno) === 0 || Number(q?.status) === 0 ? 0 : q?.errno };
          break;
        }
        if (Number(q?.status) === 2 || (Number(q?.errno) > 0 && Number(q?.errno) !== 12)) {
          res = q;
          break;
        }
      }
    }
    return res;
  }

  async createShare(fsIdCsv, expiry, password) {
    const res = await this.request(
      'POST',
      '/share/set',
      {
        channel: 'chunlei',
        bdstoken: this.bdstoken,
        clienttype: '0',
        app_id: '250528',
        web: '1',
      },
      {
        period: String(expiry),
        pwd: password,
        eflag_disable: 'true',
        channel_list: '[]',
        schannel: '4',
        fid_list: `[${fsIdCsv}]`,
      }
    );
    if (Number(res.errno) !== 0) return Number(res.errno);
    let link = String(res.link || '').trim();
    if (!link && res.shorturl) {
      let s = String(res.shorturl).trim().replace(/^\/+/, '');
      if (/^https?:\/\//i.test(s)) link = s;
      else {
        if (s.startsWith('s/')) s = s.slice(2);
        // shorturl 有的已含 1，有的不含；与官网页一致优先用接口 link
        if (!/^1/.test(s) && !/^s\//.test(s)) s = `1${s}`;
        link = `https://pan.baidu.com/s/${s}`;
      }
    }
    if (!/^https?:\/\/pan\.baidu\.com\//i.test(link)) return -1;
    return link;
  }

  async batchDeleteFiles(filePaths) {
    const processed = filePaths
      .filter((p) => p && p !== '/')
      .map((p) => (p.startsWith('/') ? p : `/${p}`));
    if (!processed.length) return { errno: -100, message: '没有有效的文件路径可删除' };
    const res = await this.request(
      'POST',
      '/api/filemanager',
      {
        async: '2',
        onnest: 'fail',
        opera: 'delete',
        bdstoken: this.bdstoken,
        newVerify: '1',
        clienttype: '0',
        app_id: '250528',
        web: '1',
      },
      { filelist: JSON.stringify(processed) }
    );
    return { errno: Number(res.errno), message: errMsg(Number(res.errno)), paths: processed };
  }
}

async function withWork(cookie) {
  const work = new BaiduWork(cookie);
  const token = await work.getBdstoken();
  if (typeof token === 'number') return { error: errMsg(token) };
  if (!token) return { error: '百度未登录，请检查 Cookie' };
  work.bdstoken = token;
  return { work };
}

export async function testBaiduCookie(conf, overrideCookie = '') {
  const cookie = String(overrideCookie || conf.baidu_cookie || '').trim();
  if (!cookie) return { code: 500, message: '未配置百度 Cookie' };
  if (!/(?:^|;\s*)BDUSS=/i.test(cookie)) {
    return {
      code: 500,
      message: 'Cookie 中缺少 BDUSS。请打开 pan.baidu.com 并已登录后，复制整段 Cookie（需含 BDUSS）',
    };
  }
  try {
    const r = await withWork(cookie);
    if (r.error) return { code: 500, message: r.error };
    // 额外探测：能否建分享（比仅拿 bdstoken 更能反映转存能力）
    const probe = await r.work.request('GET', '/api/list', {
      order: 'time',
      desc: '1',
      showempty: '0',
      web: '1',
      page: '1',
      num: '1',
      dir: '/',
      bdstoken: r.work.bdstoken,
    });
    if (Number(probe.errno) !== 0) {
      return { code: 500, message: `已拿到 token，但列目录失败：${errMsg(Number(probe.errno))}` };
    }
    return { code: 200, message: '百度 Cookie 有效，已登录', data: { pantype: 2 } };
  } catch (e) {
    return { code: 500, message: e?.message || '百度登录检测失败' };
  }
}

export async function listBaiduFolders(conf, pdirFid = '/', overrideCookie = '') {
  const cookie = String(overrideCookie || conf.baidu_cookie || '').trim();
  if (!cookie) return { code: 500, message: '未配置百度 Cookie' };
  try {
    const r = await withWork(cookie);
    if (r.error) return { code: 500, message: r.error };
    const dir =
      !pdirFid || pdirFid === '0' || pdirFid === 'root' || pdirFid === '' ? '/' : String(pdirFid);
    const list = await r.work.getDirList(dir);
    if (typeof list === 'number') return { code: 500, message: errMsg(list) };
    const folders = (Array.isArray(list) ? list : [])
      .filter((f) => Number(f.isdir) === 1)
      .map((f) => ({
        fid: String(f.path || `/${String(f.server_filename || '').replace(/^\//, '')}`),
        name: String(f.server_filename || f.path || ''),
      }))
      .filter((f) => f.fid && f.name);
    return {
      code: 200,
      message: folders.length ? `获取成功，共 ${folders.length} 个文件夹` : '当前目录下没有文件夹',
      data: { pdir_fid: dir, items: folders },
    };
  } catch (e) {
    return { code: 500, message: e?.message || '百度目录获取失败' };
  }
}

export async function deleteBaiduPaths(conf, filelist) {
  const cookie = (conf.baidu_cookie || '').trim();
  if (!cookie) return { code: 500, message: '未配置百度 Cookie' };
  try {
    const r = await withWork(cookie);
    if (r.error) return { code: 500, message: r.error };
    const res = await r.work.batchDeleteFiles(filelist);
    return res.errno === 0
      ? { code: 200, message: 'ok', data: res }
      : { code: 500, message: res.message || errMsg(res.errno) };
  } catch (e) {
    return { code: 500, message: e?.message || '百度删除失败' };
  }
}

function buildBaiduOriginalShare(cfg, passCode) {
  let share = String(cfg.url || '').trim();
  if (!share) return '';
  const pwd = String(passCode || cfg.code || '').trim();
  if (pwd && !/[?&]pwd=/i.test(share)) {
    share += (share.includes('?') ? '&' : '?') + 'pwd=' + encodeURIComponent(pwd);
  }
  return share;
}

/** 转存失败（会员限制等）时回退原链，让前台仍能打开 */
function baiduOriginalFallback(cfg, title, passCode, reason) {
  const share_url = buildBaiduOriginalShare(cfg, passCode);
  if (!share_url) {
    return { code: 500, message: reason || '百度转存失败' };
  }
  return {
    code: 200,
    message: reason || '转存失败，已返回原链接',
    data: {
      title: title || '百度资源',
      share_url,
      code: String(passCode || cfg.code || ''),
      fid: [],
      original: true,
    },
  };
}

export async function transferBaidu(conf, cfg) {
  const cookie = (conf.baidu_cookie || '').trim();
  let passCode = cfg.code || '';
  if (!passCode) {
    const m = String(cfg.url || '').match(/[?&]pwd=([^&\s]+)/i);
    if (m) passCode = m[1];
  }
  const titleHint = '百度资源';

  // 验链模式不回退原链（无效就当无效）；鉴权失败则跳过验链，避免误杀可访问链接
  const isCheck = Number(cfg.isType) === 1;
  const allowFallback = !isCheck;

  let linkUrl = cfg.url;
  try {
    const u = new URL(cfg.url);
    linkUrl = `${u.protocol}//${u.host}${u.pathname}`;
  } catch {
    /* keep */
  }

  // 验链：不拿 bdstoken、不登录探测，只 verify + list，显著加快「检测中」
  if (isCheck) {
    try {
      const work = new BaiduWork(cookie || 'BDCLND=');
      if (passCode) {
        const randsk = await work.verifyPassCode(linkUrl, passCode);
        if (typeof randsk === 'number') return { code: 500, message: errMsg(randsk) };
        work.updateBdclnd(randsk);
      }
      const transferParams = await work.getTransferParams(linkUrl);
      if (typeof transferParams === 'number') return { code: 500, message: errMsg(transferParams) };
      const title = transferParams[3]?.[0] || titleHint;
      return {
        code: 200,
        message: '检验成功',
        data: { title, share_url: cfg.url, code: passCode, valid: true },
      };
    } catch (e) {
      return { code: 500, message: e?.message || '链接检测失败' };
    }
  }

  if (!cookie) {
    return baiduOriginalFallback(cfg, titleHint, passCode, '未配置百度 Cookie，已返回原链接');
  }
  try {
    const r = await withWork(cookie);
    if (r.error) {
      return baiduOriginalFallback(cfg, titleHint, passCode, `${r.error}，已返回原链接`);
    }
    const work = r.work;

    if (passCode) {
      const randsk = await work.verifyPassCode(linkUrl, passCode);
      if (typeof randsk === 'number') {
        return baiduOriginalFallback(cfg, titleHint, passCode, `${errMsg(randsk)}，已返回原链接`);
      }
      work.updateBdclnd(randsk);
    }

    const transferParams = await work.getTransferParams(linkUrl);
    if (typeof transferParams === 'number') {
      return baiduOriginalFallback(cfg, titleHint, passCode, `${errMsg(transferParams)}，已返回原链接`);
    }
    const [shareId, userId, fsIds, fileNames] = transferParams;
    const title = fileNames[0] || shareId || titleHint;

    let folderName = Number(cfg.expired_type) === 2 ? conf.baidu_file_time : conf.baidu_file;
    if (!folderName) folderName = '/默认转存文件';
    folderName = String(folderName).replace(/^\//, '');
    for (const ch of ['<', '>', '|', '*', '?', '\\', ':']) {
      if (folderName.includes(ch)) {
        return baiduOriginalFallback(cfg, title, passCode, '转存目录名非法，已返回原链接');
      }
    }

    const dirList0 = await work.getDirList(`/${folderName}`);
    if (typeof dirList0 === 'number') {
      const created = await work.createDir(`/${folderName}`);
      if (created !== 0) {
        return baiduOriginalFallback(cfg, title, passCode, `${errMsg(created)}，已返回原链接`);
      }
    }

    const transferRes = await work.transferFile([shareId, userId, fsIds], folderName);
    if (!transferHasSuccess(transferRes)) {
      return baiduOriginalFallback(
        cfg,
        title,
        passCode,
        `${errMsg(Number(transferRes?.errno))}，已返回原链接`
      );
    }

    // 转存接口里的 fsid 经常是分享侧 id，拿去 createShare 会 -3；只信网盘目录里的真实 fs_id
    const transferredTos = (transferRes.extra?.list || [])
      .map((x) => String(x?.to || '').replace(/\/+/g, '/'))
      .filter(Boolean);

    await sleep(500);
    let dirList = await work.getDirList(`/${folderName}`);
    if (typeof dirList === 'number') {
      await sleep(800);
      dirList = await work.getDirList(`/${folderName}`);
    }
    if (typeof dirList === 'number') {
      return baiduOriginalFallback(cfg, title, passCode, `${errMsg(dirList)}，已返回原链接`);
    }

    const list = Array.isArray(dirList) ? dirList : [];
    let { fsIdList, filePaths } = pickTransferredFiles(list, folderName, fileNames, transferredTos);

    if (!fsIdList.length) {
      return baiduOriginalFallback(cfg, title, passCode, '找不到转存文件，已返回原链接');
    }

    const adFilePaths = [];
    let allAds = true;
    let adChecked = 0;
    const banned = conf.quark_banned || '';

    for (const file of list) {
      const filePath = String(file.path || `/${folderName}/${file.server_filename}`).replace(/\/+/g, '/');
      if (!filePaths.includes(filePath) && !nameMatchesShare(file.server_filename, fileNames)) continue;
      if (Number(file.isdir) === 1) {
        const sub = await work.getDirList(filePath);
        if (typeof sub !== 'number') {
          for (const subFile of sub) {
            adChecked += 1;
            if (containsAd(subFile.server_filename, banned)) {
              adFilePaths.push(`${filePath}/${subFile.server_filename}`);
            } else allAds = false;
          }
        }
      } else {
        adChecked += 1;
        if (containsAd(file.server_filename, banned)) adFilePaths.push(filePath);
        else allAds = false;
      }
    }
    if (!adChecked) allAds = false;

    if (allAds && filePaths.length) {
      await work.batchDeleteFiles(filePaths);
      return baiduOriginalFallback(cfg, title, passCode, '资源疑似广告内容，已返回原链接');
    }

    if (adFilePaths.length) {
      await work.batchDeleteFiles(adFilePaths);
    }

    const password = '6666';
    await sleep(400);

    let shareLink = await work.createShare(fsIdList.join(','), 0, password);
    if (typeof shareLink === 'number') {
      shareLink = await work.createShare(fsIdList.join(','), 7, password);
    }
    if (typeof shareLink === 'number' || !shareLink) {
      // 分享失败不删已转存文件，避免「其实已进网盘却提示失败」；回退原链给用户打开
      return baiduOriginalFallback(
        cfg,
        title,
        passCode,
        `${typeof shareLink === 'number' ? errMsg(shareLink) : '分享链接为空'}，已返回原链接`
      );
    }

    return {
      code: 200,
      message: '文件转存成功',
      data: {
        title,
        share_url: appendPwd(shareLink, password),
        fid: filePaths,
        code: password,
      },
    };
  } catch (e) {
    return baiduOriginalFallback(cfg, titleHint, passCode, `${e?.message || '百度转存失败'}，已返回原链接`);
  }
}
