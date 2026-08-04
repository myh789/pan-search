/**
 * 网盘转存：夸克 / 百度 / 迅雷
 */
import { httpJson, determineIsType } from './utils.js';
import { transferBaidu, testBaiduCookie, listBaiduFolders, deleteBaiduPaths } from './pan-baidu.js';
import { transferXunlei, testXunleiCookie, listXunleiFolders, deleteXunleiFids } from './pan-xunlei.js';

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function quarkHeaders(cookie) {
  return {
    Cookie: cookie,
    Accept: 'application/json, text/plain, */*',
    'Content-Type': 'application/json',
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    Referer: 'https://pan.quark.cn/',
    Origin: 'https://pan.quark.cn',
  };
}

async function quarkApi(cookie, url, method = 'GET', body, query) {
  try {
    const res = await httpJson(url, {
      method,
      headers: quarkHeaders(cookie),
      cookie,
      body: method === 'GET' ? undefined : body,
      query,
      timeout: 60_000,
    });
    return res.data;
  } catch (e) {
    if (e?.code === 'TIMEOUT' || e?.message === '接口异常') {
      return { status: 500, message: '接口异常' };
    }
    return { status: 500, message: e?.message || '接口异常' };
  }
}

function extractPwdId(url) {
  const m = String(url || '').match(/\/s\/([A-Za-z0-9_\-]+)/);
  return m ? m[1] : '';
}

async function pollTask(cookie, taskId) {
  let myData = '';
  for (let retry = 0; retry <= 50; retry++) {
    const res = await quarkApi(cookie, 'https://drive-pc.quark.cn/1/clouddrive/task', 'GET', undefined, {
      pr: 'ucpro',
      fr: 'pc',
      uc_param_str: '',
      task_id: taskId,
      retry_index: retry,
    });
    if (res?.message === '接口异常') return { error: '接口异常' };
    if (res?.message === 'capacity limit[{0}]') return { error: '容量不足' };
    if (res?.status !== 200) return { error: res?.message || '任务失败' };
    myData = res.data;
    if (myData?.status === 2) break;
    await sleep(400);
  }
  return { data: myData };
}

/** 分页拉取分享根目录全部条目（文件夹由夸克递归转存），避免只拿第一页 */
async function collectShareList(cookie, pwdId, stoken) {
  const seen = new Set();
  const fid_list = [];
  const fid_token_list = [];
  let title = '';

  for (let page = 1; page <= 20; page++) {
    const detail = await quarkApi(
      cookie,
      'https://drive-pc.quark.cn/1/clouddrive/share/sharepage/detail',
      'GET',
      undefined,
      {
        pr: 'ucpro',
        fr: 'pc',
        uc_param_str: '',
        pwd_id: pwdId,
        stoken,
        pdir_fid: '0',
        force: '0',
        _page: String(page),
        _size: '50',
        _fetch_banner: '1',
        _fetch_share: '1',
        _fetch_total: '1',
        _sort: 'file_type:asc,updated_at:desc',
      }
    );
    if (detail?.message === '接口异常') return { error: '接口异常' };
    if (detail?.status !== 200) {
      if (page === 1) return { error: detail?.message || '获取详情失败' };
      break;
    }
    if (!title && detail.data?.share?.title) title = detail.data.share.title;
    const list = detail.data?.list || [];
    if (!list.length) break;
    for (const v of list) {
      const fid = v.fid;
      if (!fid || seen.has(fid)) continue;
      seen.add(fid);
      fid_list.push(fid);
      fid_token_list.push(v.share_fid_token);
    }
    const total = Number(detail.data?.metadata?._total || detail.metadata?._total || 0);
    if (list.length < 50) break;
    if (total && fid_list.length >= total) break;
    if (fid_list.length >= 300) break;
  }

  return { title, fid_list, fid_token_list };
}

async function transferQuark(conf, cfg) {
  const cookie = (conf.quark_cookie || '').trim();
  if (!cookie) return { code: 500, message: '未配置夸克Cookie' };
  const pwdId = extractPwdId(cfg.url);
  if (!pwdId) return { code: 500, message: '资源地址格式有误' };

  let stoken = cfg.stoken;
  if (!stoken) {
    const tokenRes = await quarkApi(
      cookie,
      'https://drive-pc.quark.cn/1/clouddrive/share/sharepage/token',
      'POST',
      { passcode: cfg.code || '', pwd_id: pwdId },
      { pr: 'ucpro', fr: 'pc', uc_param_str: '' }
    );
    if (tokenRes?.status !== 200) return { code: 500, message: tokenRes?.message || '获取stoken失败' };
    if (cfg.isType === 1) {
      return {
        code: 200,
        message: '检验成功',
        data: { title: tokenRes.data.title, share_url: cfg.url, stoken: tokenRes.data.stoken },
      };
    }
    stoken = String(tokenRes.data.stoken).replace(/ /g, '+');
  } else {
    stoken = String(stoken).replace(/ /g, '+');
    // 验链模式：已有 stoken 直接视为有效，禁止误入转存
    if (cfg.isType === 1) {
      return {
        code: 200,
        message: '检验成功',
        data: { title: '资源', share_url: cfg.url, stoken },
      };
    }
  }

  const collected = await collectShareList(cookie, pwdId, stoken);
  if (collected.error) return { code: 500, message: collected.error };
  const { fid_list, fid_token_list } = collected;
  const title = collected.title || '资源';
  if (!fid_list.length) return { code: 500, message: '分享内容为空' };

  let to_pdir_fid = conf.quark_file || '';
  if (cfg.expired_type === 2) to_pdir_fid = conf.quark_file_time || to_pdir_fid;

  const saveRes = await quarkApi(
    cookie,
    'https://drive-pc.quark.cn/1/clouddrive/share/sharepage/save',
    'POST',
    {
      fid_list,
      fid_token_list,
      to_pdir_fid,
      pwd_id: pwdId,
      stoken,
      pdir_fid: '0',
      scene: 'link',
    },
    { pr: 'ucpro', fr: 'pc', uc_param_str: '' }
  );
  if (saveRes?.status !== 200) return { code: 500, message: saveRes?.message || '转存失败' };
  const polled = await pollTask(cookie, saveRes.data.task_id);
  if (polled.error) return { code: 500, message: polled.error };

  const fileIds = (polled.data?.save_as?.save_as_top_fids || []).filter(Boolean);
  if (!fileIds.length) {
    return { code: 500, message: '转存未得到文件，请检查夸克 Cookie 与转存目录 FID' };
  }
  const shareBody = {
    fid_list: fileIds,
    title,
    url_type: 1,
    expired_type: 1,
  };
  const btn = await quarkApi(
    cookie,
    'https://drive-pc.quark.cn/1/clouddrive/share',
    'POST',
    shareBody,
    { pr: 'ucpro', fr: 'pc', uc_param_str: '' }
  );
  if (btn?.status !== 200) return { code: 500, message: btn?.message || '创建分享失败' };
  const sharePoll = await pollTask(cookie, btn.data.task_id);
  if (sharePoll.error) return { code: 500, message: sharePoll.error };

  const shareId = sharePoll.data?.share_id || btn.data?.share_id;
  if (!shareId) return { code: 500, message: '未获取到分享 ID' };

  const shareInfo = await quarkApi(
    cookie,
    'https://drive-pc.quark.cn/1/clouddrive/share/password',
    'POST',
    { share_id: shareId },
    { pr: 'ucpro', fr: 'pc', uc_param_str: '' }
  );
  if (shareInfo?.status !== 200) {
    return { code: 500, message: shareInfo?.message || '获取分享链失败' };
  }
  const share = shareInfo?.data || {};
  let shareUrl = share.share_url || share.url || '';
  const pass = share.passcode || '';
  if (pass && shareUrl && !/[?&]pwd=/.test(shareUrl)) {
    shareUrl += (shareUrl.includes('?') ? '&' : '?') + 'pwd=' + encodeURIComponent(pass);
  }
  // 绝不回退第三方原链：赚的是转存后的自有分享
  if (!shareUrl) {
    return { code: 500, message: '未获取到分享链接，请稍后重试' };
  }

  return {
    code: 200,
    message: '转存成功',
    data: {
      title: share.title || title,
      share_url: shareUrl,
      code: pass,
      fid: fileIds,
    },
  };
}

export async function deleteQuarkFids(conf, fids) {
  const cookie = (conf.quark_cookie || '').trim();
  if (!cookie || !fids?.length) return { code: 200, message: 'skip' };
  const data = await quarkApi(
    cookie,
    'https://drive-pc.quark.cn/1/clouddrive/file/delete',
    'POST',
    { action_type: 2, exclude_fids: [], filelist: fids },
    { pr: 'ucpro', fr: 'pc', uc_param_str: '' }
  );
  return data?.status === 200
    ? { code: 200, message: 'ok' }
    : { code: 500, message: data?.message || '删除失败' };
}

export async function transferUrl(conf, urlData) {
  const type = determineIsType(urlData.url);
  let code = urlData.code || '';
  if (!code) {
    const m = String(urlData.url).match(/[?&]pwd=([^&\s#]+)/i);
    if (m) code = m[1];
  }
  const cfg = { ...urlData, code };
  if (type === 2) return transferBaidu(conf, cfg);
  if (type === 4) return transferXunlei(conf, cfg);
  if (type === 0) return transferQuark(conf, cfg);
  return { code: 500, message: `暂不支持该网盘类型（${type}）的转存` };
}

export async function testCookie(conf, pantype, overrideCookie = '') {
  const t = Number(pantype);
  if (t === 0) {
    const cookie = String(overrideCookie || conf.quark_cookie || '').trim();
    if (!cookie) return { code: 500, message: '未配置夸克Cookie' };
    const data = await quarkApi(cookie, 'https://drive-pc.quark.cn/1/clouddrive/file/sort', 'GET', undefined, {
      pr: 'ucpro',
      fr: 'pc',
      uc_param_str: '',
      pdir_fid: '0',
      _page: 1,
      _size: 1,
      _fetch_total: 1,
    });
    const ok = data?.status === 200 || data?.code === 0 || data?.code === 200;
    if (ok) return { code: 200, message: '夸克 Cookie 有效，已登录', data: { pantype: 0 } };
    const msg = data?.message || data?.error_msg || '夸克未登录，请检查 cookie';
    return { code: 500, message: msg === 'require login [guest]' ? '夸克未登录，请检查 cookie' : msg };
  }
  if (t === 2) return testBaiduCookie(conf, overrideCookie);
  if (t === 4) return testXunleiCookie(conf, overrideCookie);
  const map = {
    1: ['Authorization', '阿里'],
    3: ['uc_cookie', 'UC'],
  };
  const [key, name] = map[t] || [];
  if (!key) return { code: 500, message: '未知网盘类型' };
  if (!(conf[key] || '').trim()) return { code: 500, message: `未配置${name}凭证` };
  return { code: 200, message: `${name}凭证已填写` };
}

/** 统一列目录：夸克/百度/迅雷，返回 { pdir_fid, items:[{fid,name}] } */
export async function listPanFolders(conf, pantype, pdirFid, overrideCookie = '') {
  const t = Number(pantype);
  if (t === 0) return listQuarkFolders(conf, pdirFid, overrideCookie);
  if (t === 2) return listBaiduFolders(conf, pdirFid, overrideCookie);
  if (t === 4) return listXunleiFolders(conf, pdirFid, overrideCookie);
  return { code: 500, message: '精简版目前支持夸克 / 百度 / 迅雷文件夹浏览' };
}

export async function deletePanFids(conf, isType, fids) {
  const t = Number(isType);
  if (t === 0) return deleteQuarkFids(conf, fids);
  if (t === 2) return deleteBaiduPaths(conf, fids);
  if (t === 4) return deleteXunleiFids(conf, fids);
  return { code: 200, message: 'skip' };
}

function extractQuarkList(data) {
  if (!data || typeof data !== 'object') return [];
  if (Array.isArray(data.data?.list)) return data.data.list;
  if (Array.isArray(data.list)) return data.list;
  if (Array.isArray(data.data)) return data.data;
  return [];
}

/** 列出夸克目录（仅文件夹），支持进入子目录 */
export async function listQuarkFolders(conf, pdirFid = '0', overrideCookie = '') {
  const cookie = String(overrideCookie || conf.quark_cookie || '').trim();
  if (!cookie) return { code: 500, message: '未配置夸克Cookie' };
  const fid = !pdirFid || pdirFid === 'root' ? '0' : String(pdirFid);
  try {
    const data = await quarkApi(cookie, 'https://drive-pc.quark.cn/1/clouddrive/file/sort', 'GET', undefined, {
      pr: 'ucpro',
      fr: 'pc',
      uc_param_str: '',
      pdir_fid: fid,
      _page: 1,
      _size: 200,
      _fetch_total: 1,
      _fetch_sub_dirs: 0,
      _sort: 'file_type:asc,updated_at:desc',
    });
    if (!data || typeof data !== 'object') {
      return { code: 500, message: '夸克接口无响应，请检查 Cookie 或网络' };
    }
    const ok = data.status === 200 || data.code === 0 || data.code === 200;
    if (!ok) {
      const msg = data?.message || data?.error_msg || '获取失败';
      return {
        code: 500,
        message: msg === 'require login [guest]' ? '夸克未登录，请检查 cookie' : msg,
      };
    }
    const list = extractQuarkList(data);
    const folders = list
      .filter((f) => Number(f.file_type) === 0 || f.dir === true || f.is_dir === true)
      .map((f) => ({
        fid: String(f.fid || ''),
        name: String(f.file_name || f.name || f.fid || ''),
        updated_at: f.updated_at || f.update_time || null,
      }))
      .filter((f) => f.fid);
    return {
      code: 200,
      message: folders.length ? `获取成功，共 ${folders.length} 个文件夹` : '当前目录下没有文件夹',
      data: { pdir_fid: fid, items: folders },
    };
  } catch (e) {
    return { code: 500, message: e?.message || '夸克目录获取失败' };
  }
}

