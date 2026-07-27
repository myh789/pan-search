import type { Env } from '../env';
import { httpJson, sleep } from '../utils';
import { extractPwdId } from '@pan-search/shared';

export type TransferConfig = {
  url: string;
  code?: string;
  isType?: number;
  expired_type?: number;
  ad_fid?: string;
  stoken?: string;
};

export type TransferResult =
  | { code: 200; message: string; data: { title: string; share_url: string; fid?: any; code?: string; stoken?: string } }
  | { code: number; message: string; data?: null };

export interface PanAdapter {
  getFiles(pdirFid?: string | number): Promise<TransferResult>;
  transfer(pwdId: string): Promise<TransferResult>;
  deletepdirFid(filelist: string[]): Promise<TransferResult>;
}

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
  const res = await httpJson(url, {
    method,
    headers: quarkHeaders(cookie),
    body: body ?? {},
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
    const data = await quarkApi(cookie, 'https://drive-pc.quark.cn/1/clouddrive/file/sort', 'GET', {}, {
      pr: 'ucpro',
      fr: 'pc',
      uc_param_str: '',
      pdir_fid: pdirFid,
      _page: 1,
      _size: 50,
      _fetch_total: 1,
      _fetch_sub_dirs: 0,
      _sort: 'file_type:asc,updated_at:desc',
    });
    if (data?.status !== 200) {
      return {
        code: 500,
        message: data?.message === 'require login [guest]' ? '夸克未登录，请检查cookie' : data?.message || '获取失败',
      };
    }
    return { code: 200, message: '获取成功', data: data.data.list } as any;
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
    const data = await httpJson('https://pc-api.uc.cn/1/clouddrive/file/sort', {
      method: 'GET',
      headers: this.headers(),
      cookie,
      query: {
        pr: 'UCBrowser',
        fr: 'pc',
        pdir_fid: String(pdirFid),
        _page: 1,
        _size: 50,
        _fetch_total: 1,
        _fetch_sub_dirs: 0,
        _sort: 'file_type:asc,updated_at:desc',
      },
      body: {},
    });
    if (data.data?.status !== 200) {
      return {
        code: 500,
        message:
          data.data?.message === 'require login [guest]' ? 'UC未登录，请检查cookie' : data.data?.message || '失败',
      };
    }
    return { code: 200, message: '获取成功', data: data.data.data.list } as any;
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

export class BaiduPan implements PanAdapter {
  constructor(
    private conf: Record<string, string>,
    private cfg: TransferConfig
  ) {}

  async getFiles(pdirFid: string | number = '/') {
    const cookie = this.conf.baidu_cookie || '';
    if (!cookie) return { code: 500, message: '未配置百度Cookie' };
    const dir = pdirFid === 0 ? '/' : String(pdirFid);
    const res = await httpJson('https://pan.baidu.com/api/list', {
      method: 'GET',
      cookie,
      query: { dir, order: 'time', desc: 1, showempty: 0, web: 1, page: 1, num: 100, channel: 'chunlei', app_id: 250528 },
    });
    if (res.data?.errno && res.data.errno !== 0) return { code: 500, message: `百度错误:${res.data.errno}` };
    return { code: 200, message: '获取成功', data: res.data?.list || [] } as any;
  }

  async deletepdirFid(filelist: string[]) {
    const cookie = this.conf.baidu_cookie || '';
    const res = await httpJson('https://pan.baidu.com/api/filemanager', {
      method: 'POST',
      cookie,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `opera=delete&filelist=${encodeURIComponent(JSON.stringify(filelist))}`,
      query: { async: 2, onnest: 'fail', channel: 'chunlei', web: 1, app_id: 250528 },
    });
    return res.data?.errno === 0
      ? { code: 200, message: 'ok', data: res.data }
      : { code: 500, message: `删除失败:${res.data?.errno}` };
  }

  async transfer(pwdId: string): Promise<TransferResult> {
    // Baidu full transfer is complex; support verify + best-effort transfer via share link passthrough when isType=1
    if (this.cfg.isType === 1) {
      return {
        code: 200,
        message: '检验成功',
        data: { title: pwdId, share_url: this.cfg.url, code: this.cfg.code },
      };
    }
    const cookie = this.conf.baidu_cookie || '';
    if (!cookie) return { code: 500, message: '未配置百度Cookie' };
    // Full Baidu transfer port is incomplete vs legacy BaiduWork;
    // fail explicitly instead of fake-success.
    return {
      code: 500,
      message: '百度完整转存尚未在 Cloudflare 版完全移植，请先用夸克/UC，或仅使用 isType=1 校验',
    };
  }
}

export class XunleiPan implements PanAdapter {
  constructor(
    private conf: Record<string, string>,
    private cfg: TransferConfig,
    private env?: Env
  ) {}

  private async getAccessToken(): Promise<string> {
    if (this.env) {
      const cached = await this.env.KV.get('xunlei:access_token', 'json');
      if (cached && (cached as any).expires_at > Date.now() / 1000) return (cached as any).access_token;
    }
    const refresh = this.conf.xunlei_cookie || '';
    if (!refresh) return '';
    const res = await httpJson('https://xluser-ssl.xunlei.com/v1/auth/token', {
      method: 'POST',
      body: { client_id: 'Xqp0kJBXWhwaTpB6', grant_type: 'refresh_token', refresh_token: refresh },
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

  async getFiles(pdirFid: string | number = '') {
    const token = await this.getAccessToken();
    if (!token) return { code: 500, message: '迅雷未登录' };
    const res = await httpJson('https://api-pan.xunlei.com/drive/v1/files', {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}`, 'x-client-id': 'Xqp0kJBXWhwaTpB6' },
      query: { parent_id: String(pdirFid || ''), limit: 100 },
    });
    return { code: 200, message: '获取成功', data: res.data?.files || res.data?.data || [] } as any;
  }

  async deletepdirFid(filelist: string[]) {
    const token = await this.getAccessToken();
    if (!token) return { code: 500, message: '迅雷未登录' };
    for (const id of filelist) {
      await httpJson(`https://api-pan.xunlei.com/drive/v1/files/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}`, 'x-client-id': 'Xqp0kJBXWhwaTpB6' },
      });
    }
    return { code: 200, message: 'ok', data: null };
  }

  async transfer(pwdId: string): Promise<TransferResult> {
    if (this.cfg.isType === 1) {
      return { code: 200, message: '检验成功', data: { title: pwdId, share_url: this.cfg.url, code: this.cfg.code } };
    }
    const token = await this.getAccessToken();
    if (!token) return { code: 500, message: '迅雷未登录，请检查 refresh_token(xunlei_cookie)' };
    try {
      const parent = this.cfg.expired_type === 2 ? this.conf.xunlei_file_time : this.conf.xunlei_file;
      const res = await httpJson('https://api-pan.xunlei.com/drive/v1/share/restore', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'x-client-id': 'Xqp0kJBXWhwaTpB6',
          'Content-Type': 'application/json',
        },
        body: { share_id: pwdId, pass_code: this.cfg.code || '', parent_id: parent || '', file_ids: [] },
      });
      if (res.status >= 400 || res.data?.error) {
        return { code: 500, message: res.data?.error_description || res.data?.message || '迅雷转存失败' };
      }
      return {
        code: 200,
        message: '转存成功',
        data: { title: `迅雷-${pwdId}`, share_url: this.cfg.url, code: this.cfg.code || '', fid: pwdId },
      };
    } catch (e: any) {
      return { code: 500, message: e?.message || '迅雷转存失败' };
    }
  }
}

export class AlipanPan implements PanAdapter {
  constructor(
    private conf: Record<string, string>,
    private cfg: TransferConfig,
    private env?: Env
  ) {}

  private async getAccessToken(): Promise<string> {
    if (this.env) {
      const cached = await this.env.KV.get('aliyun:access_token');
      if (cached) return cached;
    }
    // Authorization conf may already be access token or refresh payload
    const auth = this.conf.Authorization || '';
    if (auth.startsWith('ey') || auth.length > 20) {
      if (this.env) await this.env.KV.put('aliyun:access_token', auth, { expirationTtl: 3600 });
      return auth;
    }
    return '';
  }

  async getFiles(pdirFid: string | number = 'root') {
    const token = await this.getAccessToken();
    if (!token) return { code: 500, message: '阿里未登录' };
    const res = await httpJson('https://api.aliyundrive.com/adrive/v3/file/list', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Referer: 'https://www.alipan.com/',
      },
      body: {
        all: false,
        drive_id: this.conf.ali_drive_id || '2008425230',
        fields: '*',
        limit: 100,
        order_by: 'updated_at',
        order_direction: 'DESC',
        parent_file_id: pdirFid === 0 ? 'root' : String(pdirFid),
        url_expire_sec: 14400,
      },
    });
    if (res.data?.message) return { code: 500, message: res.data.message };
    return { code: 200, message: '获取成功', data: res.data?.items || [] } as any;
  }

  async deletepdirFid(filelist: string[]) {
    const token = await this.getAccessToken();
    if (!token) return { code: 500, message: '阿里未登录' };
    await httpJson('https://api.aliyundrive.com/adrive/v2/batch', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: {
        requests: filelist.map((id) => ({
          body: { drive_id: this.conf.ali_drive_id || '2008425230', file_id: id },
          id,
          method: 'POST',
          url: '/file/delete',
        })),
        resource: 'file',
      },
    });
    return { code: 200, message: 'ok', data: null };
  }

  async transfer(pwdId: string): Promise<TransferResult> {
    if (this.cfg.isType === 1) {
      return { code: 200, message: '检验成功', data: { title: pwdId, share_url: this.cfg.url } };
    }
    const token = await this.getAccessToken();
    if (!token) return { code: 500, message: '阿里未登录，请配置 Authorization' };
    return {
      code: 500,
      message: '阿里完整转存尚未在 Cloudflare 版完全移植，请先用夸克/UC，或仅使用 isType=1 校验',
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
  const pwdId = extractPwdId(urlData.url);
  if (!pwdId) return { code: 500, message: '资源地址格式有误' };
  const pan = createPan(type, conf, urlData, env);
  return pan.transfer(pwdId.split('#')[0]);
}
