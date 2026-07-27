import type { Env } from '../env';
import { httpJson, sleep } from '../utils';
import { extractPwdId } from '@pan-search/shared';
import { BaiduPan } from './baidu';
import { AlipanPan } from './aliyun';
import type { PanAdapter, TransferConfig, TransferResult } from './types';

export type { TransferConfig, TransferResult, PanAdapter } from './types';
export { BaiduPan } from './baidu';
export { AlipanPan } from './aliyun';

function quarkHeaders(cookie: string): Record<string, string> {
  return {
    Accept: 'application/json, text/plain, */*',
    'content-type': 'application/json;charset=UTF-8',
    Referer: 'https://pan.quark.cn/',
    'user-agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    cookie,
  };
}

async function quarkApi(
  cookie: string,
  url: string,
  method: string,
  body?: any,
  query?: Record<string, any>
) {
  const m = method.toUpperCase();
  const res = await httpJson(url, {
    method: m,
    headers: quarkHeaders(cookie),
    // GET 不传 body，避免 Workers 抛错
    body: m === 'GET' || m === 'HEAD' ? undefined : body ?? {},
    query,
    cookie,
  });
  return res.data;
}

export class QuarkPan implements PanAdapter {
  constructor(
    private conf: Record<string, string>,
    private cfg: TransferConfig
  ) {}

  async getFiles(pdirFid: string | number = 0) {
    const cookie = this.conf.quark_cookie || '';
    if (!cookie) return { code: 500, message: '未配置夸克Cookie' };
    try {
      const data = await quarkApi(cookie, 'https://drive-pc.quark.cn/1/clouddrive/file/sort', 'GET', undefined, {
        pr: 'ucpro',
        fr: 'pc',
        uc_param_str: '',
        pdir_fid: pdirFid === 'root' ? 0 : pdirFid,
        _page: 1,
        _size: 50,
        _fetch_total: 1,
        _fetch_sub_dirs: 0,
        _sort: 'file_type:asc,updated_at:desc',
      });
      if (!data || typeof data !== 'object') {
        return { code: 500, message: '夸克接口无响应，请检查 Cookie 或网络' };
      }
      if (data?.status !== 200) {
        return {
          code: 500,
          message: data?.message === 'require login [guest]' ? '夸克未登录，请检查cookie' : data?.message || '获取失败',
        };
      }
      return { code: 200, message: '获取成功', data: data.data?.list || [] } as any;
    } catch (e: any) {
      return { code: 500, message: e?.message || '夸克目录获取失败' };
    }
  }

  private async getPdirFid(pdirFid: string) {
    const cookie = this.conf.quark_cookie || '';
    const data = await quarkApi(cookie, 'https://drive-pc.quark.cn/1/clouddrive/file/sort', 'GET', {}, {
      pr: 'ucpro',
      fr: 'pc',
      uc_param_str: '',
      pdir_fid: pdirFid,
      _page: 1,
      _size: 200,
      _fetch_total: 1,
      _fetch_sub_dirs: 0,
      _sort: 'file_type:asc,updated_at:desc',
    });
    if (data?.status !== 200) return [];
    return data.data?.list || [];
  }

  async deletepdirFid(filelist: string[]) {
    const cookie = this.conf.quark_cookie || '';
    const data = await quarkApi(
      cookie,
      'https://drive-pc.quark.cn/1/clouddrive/file/delete',
      'POST',
      { action_type: 2, exclude_fids: [], filelist },
      { pr: 'ucpro', fr: 'pc', uc_param_str: '' }
    );
    return data?.status === 200
      ? { code: 200, message: 'ok', data: data.data }
      : { code: 500, message: data?.message || '删除失败' };
  }

  private async pollTask(cookie: string, taskId: string) {
    let myData: any = '';
    for (let retry = 0; retry <= 50; retry++) {
      const res = await quarkApi(cookie, 'https://drive-pc.quark.cn/1/clouddrive/task', 'GET', {}, {
        pr: 'ucpro',
        fr: 'pc',
        uc_param_str: '',
        task_id: taskId,
        retry_index: retry,
      });
      if (res?.message === 'capacity limit[{0}]') return { error: '容量不足' };
      if (res?.status !== 200) return { error: res?.message || '任务失败' };
      myData = res.data;
      if (myData?.status === 2) break;
      await sleep(400);
    }
    return { data: myData };
  }

  async transfer(pwdId: string): Promise<TransferResult> {
    const cookie = this.conf.quark_cookie || '';
    if (!cookie) return { code: 500, message: '未配置夸克Cookie' };

    let stoken = this.cfg.stoken;
    if (!stoken) {
      const tokenRes = await quarkApi(
        cookie,
        'https://drive-pc.quark.cn/1/clouddrive/share/sharepage/token',
        'POST',
        { passcode: this.cfg.code || '', pwd_id: pwdId },
        { pr: 'ucpro', fr: 'pc', uc_param_str: '' }
      );
      if (tokenRes?.status !== 200) return { code: 500, message: tokenRes?.message || '获取stoken失败' };
      if (this.cfg.isType === 1) {
        return {
          code: 200,
          message: '检验成功',
          data: { title: tokenRes.data.title, share_url: this.cfg.url, stoken: tokenRes.data.stoken },
        };
      }
      stoken = String(tokenRes.data.stoken).replace(/ /g, '+');
    } else {
      stoken = String(stoken).replace(/ /g, '+');
    }

    const detail = await quarkApi(
      cookie,
      'https://drive-pc.quark.cn/1/clouddrive/share/sharepage/detail',
      'GET',
      {},
      {
        pr: 'ucpro',
        fr: 'pc',
        uc_param_str: '',
        pwd_id: pwdId,
        stoken,
        pdir_fid: '0',
        force: '0',
        _page: '1',
        _size: '100',
        _fetch_banner: '1',
        _fetch_share: '1',
        _fetch_total: '1',
        _sort: 'file_type:asc,updated_at:desc',
      }
    );
    if (detail?.status !== 200) return { code: 500, message: detail?.message || '获取详情失败' };

    const fid_list: string[] = [];
    const fid_token_list: string[] = [];
    const title = detail.data.share.title;
    for (const v of detail.data.list || []) {
      fid_list.push(v.fid);
      fid_token_list.push(v.share_fid_token);
    }

    let to_pdir_fid = this.conf.quark_file || '';
    if (this.cfg.expired_type === 2) to_pdir_fid = this.conf.quark_file_time || to_pdir_fid;

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
      { entry: 'update_share', pr: 'ucpro', fr: 'pc', uc_param_str: '' }
    );
    if (saveRes?.status !== 200) return { code: 500, message: saveRes?.message || '转存失败' };

    const polled = await this.pollTask(cookie, saveRes.data.task_id);
    if (polled.error) return { code: 500, message: polled.error };
    const myData = polled.data;

    // ad purge
    try {
      const banned = (this.conf.quark_banned || '').split(',').map((s) => s.trim()).filter(Boolean);
      if (banned.length) {
        const pdir_fid = myData.save_as.save_as_top_fids[0];
        const plist = await this.getPdirFid(pdir_fid);
        const dellist: string[] = [];
        for (const f of plist) {
          if (banned.some((b) => String(f.file_name).includes(b))) dellist.push(f.fid);
        }
        if (plist.length && dellist.length === plist.length) {
          await this.deletepdirFid([pdir_fid]);
          return { code: 500, message: '资源内容为空' };
        }
        if (dellist.length) await this.deletepdirFid(dellist);
      }
    } catch {
      /* ignore */
    }

    const shareFid = myData.save_as.save_as_top_fids;
    const fidList = [...shareFid];
    if (this.cfg.ad_fid) fidList.push(this.cfg.ad_fid);

    const btn = await quarkApi(
      cookie,
      'https://drive-pc.quark.cn/1/clouddrive/share',
      'POST',
      {
        fid_list: fidList,
        expired_type: this.cfg.expired_type || 1,
        title,
        url_type: 1,
      },
      { pr: 'ucpro', fr: 'pc', uc_param_str: '' }
    );
    if (btn?.status !== 200) return { code: 500, message: btn?.message || '创建分享失败' };

    const sharePoll = await this.pollTask(cookie, btn.data.task_id);
    if (sharePoll.error) return { code: 500, message: sharePoll.error };

    const pwd = await quarkApi(
      cookie,
      'https://drive-pc.quark.cn/1/clouddrive/share/password',
      'POST',
      { share_id: sharePoll.data.share_id },
      { pr: 'ucpro', fr: 'pc', uc_param_str: '' }
    );
    if (pwd?.status !== 200) return { code: 500, message: pwd?.message || '获取分享链失败' };

    const share = pwd.data;
    share.fid = Array.isArray(shareFid) && shareFid.length > 1 ? shareFid : share.first_file?.fid;
    return {
      code: 200,
      message: '转存成功',
      data: {
        title: share.title || title,
        share_url: share.share_url || share.url,
        fid: share.fid,
        code: share.passcode || '',
      },
    };
  }
}

/** UC is Quark-API compatible with different hosts */
export class UcPan implements PanAdapter {
  private quark: QuarkPan;
  constructor(conf: Record<string, string>, cfg: TransferConfig) {
    const mapped = {
      ...conf,
      quark_cookie: conf.uc_cookie,
      quark_file: conf.uc_file,
      quark_file_time: conf.uc_file_time,
      quark_banned: '',
    };
    this.quark = new QuarkPan(mapped, cfg);
    // override endpoints via subclassing pattern — reimplement thin wrappers
    this._cfg = cfg;
    this._conf = conf;
  }
  private _cfg: TransferConfig;
  private _conf: Record<string, string>;

  private headers() {
    return {
      Accept: 'application/json, text/plain, */*',
      'content-type': 'application/json;charset=UTF-8',
      Referer: 'https://drive.uc.cn/',
      cookie: this._conf.uc_cookie || '',
    };
  }

  async getFiles(pdirFid: string | number = 0) {
    const cookie = this._conf.uc_cookie || '';
    if (!cookie) return { code: 500, message: '未配置UC Cookie' };
    try {
      const data = await httpJson('https://pc-api.uc.cn/1/clouddrive/file/sort', {
        method: 'GET',
        headers: this.headers(),
        cookie,
        query: {
          pr: 'UCBrowser',
          fr: 'pc',
          pdir_fid: String(pdirFid === 'root' ? 0 : pdirFid),
          _page: 1,
          _size: 50,
          _fetch_total: 1,
          _fetch_sub_dirs: 0,
          _sort: 'file_type:asc,updated_at:desc',
        },
      });
      const payload = data.data;
      if (!payload || typeof payload !== 'object') {
        return { code: 500, message: 'UC 接口无响应，请检查 Cookie 或网络' };
      }
      if (payload.status !== 200) {
        return {
          code: 500,
          message:
            payload.message === 'require login [guest]' ? 'UC未登录，请检查cookie' : payload.message || '失败',
        };
      }
      return { code: 200, message: '获取成功', data: payload.data?.list || [] } as any;
    } catch (e: any) {
      return { code: 500, message: e?.message || 'UC 目录获取失败' };
    }
  }

  async deletepdirFid(filelist: string[]) {
    const cookie = this._conf.uc_cookie || '';
    const data = await httpJson('https://pc-api.uc.cn/1/clouddrive/file/delete', {
      method: 'POST',
      headers: this.headers(),
      cookie,
      body: { action_type: 2, exclude_fids: [], filelist },
      query: { pr: 'UCBrowser', fr: 'pc' },
    });
    return data.data?.status === 200
      ? { code: 200, message: 'ok', data: data.data.data }
      : { code: 500, message: data.data?.message || '删除失败' };
  }

  async transfer(pwdId: string): Promise<TransferResult> {
    // Delegate similar flow on UC hosts — reuse quark logic with mapped conf by temporarily swapping base via QuarkPan-like calls
    // For parity: call quark transfer with UC cookie mapped (QuarkPan already used for Quark). Re-run with UC endpoints:
    const cookie = this._conf.uc_cookie || '';
    if (!cookie) return { code: 500, message: '未配置UC Cookie' };

    // Minimal: validate-only path
    const tokenRes = await httpJson('https://pc-api.uc.cn/1/clouddrive/share/sharepage/token', {
      method: 'POST',
      headers: this.headers(),
      cookie,
      body: { passcode: this._cfg.code || '', pwd_id: pwdId },
      query: { pr: 'UCBrowser', fr: 'pc' },
    });
    if (tokenRes.data?.status !== 200) return { code: 500, message: tokenRes.data?.message || '获取stoken失败' };
    const info = tokenRes.data.data;
    const title = info?.token_info?.title || info?.title || '';
    const stoken = String(info?.token_info?.stoken || info?.stoken || '').replace(/ /g, '+');
    if (this._cfg.isType === 1) {
      return { code: 200, message: '检验成功', data: { title, share_url: this._cfg.url, stoken } };
    }

    // Full transfer: mirror Quark save/share on UC API
    const detail = await httpJson('https://pc-api.uc.cn/1/clouddrive/share/sharepage/detail', {
      method: 'GET',
      headers: this.headers(),
      cookie,
      query: {
        pr: 'UCBrowser',
        fr: 'pc',
        pwd_id: pwdId,
        stoken,
        pdir_fid: '0',
        force: '0',
        _page: '1',
        _size: '100',
        _fetch_share: '1',
        _fetch_total: '1',
      },
    });
    if (detail.data?.status !== 200) return { code: 500, message: detail.data?.message || '详情失败' };
    const list = detail.data.data.list || [];
    const shareTitle = detail.data.data.share?.title || title;
    const fid_list = list.map((v: any) => v.fid);
    const fid_token_list = list.map((v: any) => v.share_fid_token);
    let to_pdir_fid = this._conf.uc_file || '';
    if (this._cfg.expired_type === 2) to_pdir_fid = this._conf.uc_file_time || to_pdir_fid;

    const saveRes = await httpJson('https://pc-api.uc.cn/1/clouddrive/share/sharepage/save', {
      method: 'POST',
      headers: this.headers(),
      cookie,
      body: { fid_list, fid_token_list, to_pdir_fid, pwd_id: pwdId, stoken, pdir_fid: '0', scene: 'link' },
      query: { pr: 'UCBrowser', fr: 'pc' },
    });
    if (saveRes.data?.status !== 200) return { code: 500, message: saveRes.data?.message || '转存失败' };

    let myData: any = null;
    for (let i = 0; i <= 50; i++) {
      const task = await httpJson('https://pc-api.uc.cn/1/clouddrive/task', {
        method: 'GET',
        headers: this.headers(),
        cookie,
        query: { pr: 'UCBrowser', fr: 'pc', task_id: saveRes.data.data.task_id, retry_index: i },
      });
      if (task.data?.status === 200 && task.data.data?.status === 2) {
        myData = task.data.data;
        break;
      }
      await sleep(400);
    }
    if (!myData) return { code: 500, message: '转存任务超时' };

    const shareFid = myData.save_as.save_as_top_fids;
    const btn = await httpJson('https://pc-api.uc.cn/1/clouddrive/share', {
      method: 'POST',
      headers: this.headers(),
      cookie,
      body: { fid_list: shareFid, expired_type: this._cfg.expired_type || 1, title: shareTitle, url_type: 1 },
      query: { pr: 'UCBrowser', fr: 'pc' },
    });
    if (btn.data?.status !== 200) return { code: 500, message: btn.data?.message || '分享失败' };

    let shareTask: any = null;
    for (let i = 0; i <= 50; i++) {
      const task = await httpJson('https://pc-api.uc.cn/1/clouddrive/task', {
        method: 'GET',
        headers: this.headers(),
        cookie,
        query: { pr: 'UCBrowser', fr: 'pc', task_id: btn.data.data.task_id, retry_index: i },
      });
      if (task.data?.status === 200 && task.data.data?.status === 2) {
        shareTask = task.data.data;
        break;
      }
      await sleep(400);
    }
    if (!shareTask?.share_id) return { code: 500, message: '分享任务超时' };
    const pwd = await httpJson('https://pc-api.uc.cn/1/clouddrive/share/password', {
      method: 'POST',
      headers: this.headers(),
      cookie,
      body: { share_id: shareTask.share_id },
      query: { pr: 'UCBrowser', fr: 'pc' },
    });
    if (pwd.data?.status !== 200) return { code: 500, message: pwd.data?.message || '获取分享失败' };
    const share = pwd.data.data;
    return {
      code: 200,
      message: '转存成功',
      data: {
        title: share.title || shareTitle,
        share_url: share.share_url || share.url,
        fid: share.first_file?.fid || shareFid,
        code: share.passcode || '',
      },
    };
  }
}

export class XunleiPan implements PanAdapter {
  constructor(
    private conf: Record<string, string>,
    private cfg: TransferConfig,
    private env?: Env
  ) {}

  private clientId = 'Xqp0kJBXWhwaTpB6';

  private async getAccessToken(): Promise<string> {
    if (this.env) {
      const cached = await this.env.KV.get('xunlei:access_token', 'json');
      if (cached && (cached as any).expires_at > Date.now() / 1000) return (cached as any).access_token;
    }
    const refresh = this.conf.xunlei_cookie || '';
    if (!refresh) return '';
    const res = await httpJson('https://xluser-ssl.xunlei.com/v1/auth/token', {
      method: 'POST',
      body: { client_id: this.clientId, grant_type: 'refresh_token', refresh_token: refresh },
    });
    const access = res.data?.access_token || res.data?.data?.access_token;
    if (access && this.env) {
      await this.env.KV.put(
        'xunlei:access_token',
        JSON.stringify({ access_token: access, expires_at: Math.floor(Date.now() / 1000) + 3500 })
      );
    }
    return access || '';
  }

  private headers(token: string) {
    return {
      Authorization: `Bearer ${token}`,
      'x-client-id': this.clientId,
      'Content-Type': 'application/json',
    };
  }

  async getFiles(pdirFid: string | number = '') {
    const token = await this.getAccessToken();
    if (!token) return { code: 500, message: '迅雷未登录，请检查 refresh_token(xunlei_cookie)' };
    try {
      const parent =
        pdirFid === 0 || pdirFid === '0' || pdirFid === 'root' || pdirFid === '' || pdirFid == null
          ? ''
          : String(pdirFid);
      const res = await httpJson('https://api-pan.xunlei.com/drive/v1/files', {
        method: 'GET',
        headers: this.headers(token),
        query: { parent_id: parent, limit: 100 },
      });
      if (res.status >= 400 || res.data?.error || res.data?.error_code) {
        return {
          code: 500,
          message: res.data?.error_description || res.data?.message || res.data?.error || `迅雷接口错误(${res.status})`,
        };
      }
      const list = res.data?.files || res.data?.data?.files || res.data?.data || [];
      return { code: 200, message: '获取成功', data: Array.isArray(list) ? list : [] } as any;
    } catch (e: any) {
      return { code: 500, message: e?.message || '迅雷目录获取失败' };
    }
  }

  async deletepdirFid(filelist: string[]) {
    const token = await this.getAccessToken();
    if (!token) return { code: 500, message: '迅雷未登录' };
    await httpJson('https://api-pan.xunlei.com/drive/v1/files/batch_delete', {
      method: 'POST',
      headers: this.headers(token),
      body: { ids: filelist, space: '' },
    }).catch(async () => {
      for (const id of filelist) {
        await httpJson(`https://api-pan.xunlei.com/drive/v1/files/${id}`, {
          method: 'DELETE',
          headers: this.headers(token),
        });
      }
    });
    return { code: 200, message: 'ok', data: null };
  }

  async transfer(pwdId: string): Promise<TransferResult> {
    const shareId = pwdId.split('?')[0];
    let code = (this.cfg.code || '').replace(/#/g, '');
    if (!code) {
      const m = this.cfg.url.match(/[?&]pwd=([^&\s#]+)/i);
      if (m) code = m[1];
    }

    const token = await this.getAccessToken();
    if (!token) return { code: 500, message: '迅雷未登录，请检查 refresh_token(xunlei_cookie)' };

    const shareRes = await httpJson('https://api-pan.xunlei.com/drive/v1/share', {
      method: 'GET',
      headers: this.headers(token),
      query: {
        share_id: shareId,
        pass_code: code,
        limit: 100,
        pass_code_token: '',
        page_token: '',
        thumbnail_size: 'SIZE_SMALL',
      },
    });
    const info = shareRes.data;
    if (info?.error_code) {
      return { code: 500, message: info.error_description || '获取分享失败' };
    }
    if (info?.share_status && info.share_status !== 'OK') {
      return {
        code: 500,
        message: info.share_status_text || (info.share_status === 'SENSITIVE_RESOURCE' ? '该分享内容无法访问' : '资源已失效'),
      };
    }

    const title = info?.files?.[0]?.name || info?.title || shareId;
    if (this.cfg.isType === 1) {
      return { code: 200, message: '检验成功', data: { title, share_url: this.cfg.url, code } };
    }

    const parent = this.cfg.expired_type === 2 ? this.conf.xunlei_file_time : this.conf.xunlei_file;
    const ids = Array.isArray(info?.files) ? info.files.map((f: any) => f.id).filter(Boolean) : [];
    const restoreRes = await httpJson('https://api-pan.xunlei.com/drive/v1/share/restore', {
      method: 'POST',
      headers: this.headers(token),
      body: {
        parent_id: parent || '',
        share_id: shareId,
        pass_code_token: info?.pass_code_token || '',
        ancestor_ids: [],
        specify_parent_id: true,
        file_ids: ids,
      },
    });
    if (restoreRes.data?.error_code || restoreRes.status >= 400) {
      return {
        code: 500,
        message: restoreRes.data?.error_description || restoreRes.data?.message || '迅雷转存失败',
      };
    }

    const taskId = restoreRes.data?.restore_task_id || restoreRes.data?.id;
    let taskData: any = restoreRes.data;
    if (taskId) {
      for (let i = 0; i < 20; i++) {
        const task = await httpJson(`https://api-pan.xunlei.com/drive/v1/tasks/${taskId}`, {
          method: 'GET',
          headers: this.headers(token),
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

    let fileIds: string[] = [];
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

    // 广告清理（尽力）
    const banned = (this.conf.quark_banned || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (banned.length && fileIds[0]) {
      try {
        const list = await this.getFiles(fileIds[0]);
        const files = (list as any).data || [];
        const del: string[] = [];
        for (const f of files) {
          const name = String(f.name || '');
          if (banned.some((k) => name.includes(k))) del.push(f.id);
        }
        if (del.length && del.length === files.length) {
          await this.deletepdirFid([fileIds[0]]);
          return { code: 500, message: '资源内容为空' };
        }
        if (del.length) await this.deletepdirFid(del);
      } catch {
        /* ignore */
      }
    }

    const expirationDays = this.cfg.expired_type === 2 ? '2' : '-1';
    const shareCreate = await httpJson('https://api-pan.xunlei.com/drive/v1/share', {
      method: 'POST',
      headers: this.headers(token),
      body: {
        file_ids: fileIds.length ? fileIds : ids,
        share_to: 'copy',
        params: { subscribe_push: 'false', WithPassCodeInLink: 'true' },
        title: '云盘资源分享',
        restore_limit: '-1',
        expiration_days: expirationDays,
      },
    });
    if (shareCreate.data?.error_code || !shareCreate.data?.share_url) {
      // 转存成功但分享失败时，至少返回原链避免假失败
      if (fileIds.length || restoreRes.data) {
        return {
          code: 200,
          message: '转存成功（重新分享失败，返回原链接）',
          data: { title, share_url: this.cfg.url, code, fid: fileIds },
        };
      }
      return {
        code: 500,
        message: shareCreate.data?.error_description || '创建分享失败',
      };
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
  }
}

export function createPan(type: number, conf: Record<string, string>, cfg: TransferConfig, env?: Env): PanAdapter {
  switch (type) {
    case 1:
      return new AlipanPan(conf, cfg, env);
    case 2:
      return new BaiduPan(conf, cfg);
    case 3:
      return new UcPan(conf, cfg);
    case 4:
      return new XunleiPan(conf, cfg, env);
    default:
      return new QuarkPan(conf, cfg);
  }
}

export async function transferUrl(
  env: Env,
  conf: Record<string, string>,
  urlData: TransferConfig
): Promise<TransferResult> {
  const { determineIsType } = await import('@pan-search/shared');
  const type = determineIsType(urlData.url);
  let code = urlData.code || '';
  if (!code) {
    const m = urlData.url.match(/[?&]pwd=([^&\s#]+)/i);
    if (m) code = m[1];
  }
  const pwdId = extractPwdId(urlData.url);
  if (!pwdId) return { code: 500, message: '资源地址格式有误' };
  const pan = createPan(type, conf, { ...urlData, code }, env);
  return pan.transfer(pwdId.split('#')[0]);
}
