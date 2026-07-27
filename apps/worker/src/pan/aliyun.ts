import type { Env } from '../env';
import { httpJson } from '../utils';
import type { PanAdapter, TransferConfig, TransferResult } from './types';

function aliHeaders(token: string): Record<string, string> {
  return {
    Accept: 'application/json, text/plain, */*',
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    Origin: 'https://www.alipan.com',
    Referer: 'https://www.alipan.com/',
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    'X-Canary': 'client=web,app=share,version=v2.3.1',
  };
}

export class AlipanPan implements PanAdapter {
  constructor(
    private conf: Record<string, string>,
    private cfg: TransferConfig,
    private env?: Env
  ) {}

  private driveId() {
    return this.conf.ali_drive_id || '';
  }

  private async getAccessToken(): Promise<string> {
    const refresh = this.conf.Authorization || '';
    if (!refresh) return '';

    if (this.env) {
      const cached = await this.env.KV.get('aliyun:token', 'json');
      if (
        cached &&
        (cached as any).access_token &&
        (cached as any).refresh_token === refresh &&
        (cached as any).expires_at > Date.now() / 1000
      ) {
        return (cached as any).access_token;
      }
    }

    // Authorization 一般为 refresh_token；若已是 access_token 也可尝试直用
    const res = await httpJson('https://api.aliyundrive.com/token/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: { refresh_token: refresh },
    });
    const access = res.data?.access_token || '';
    if (access && this.env) {
      await this.env.KV.put(
        'aliyun:token',
        JSON.stringify({
          access_token: access,
          refresh_token: refresh,
          expires_at: Math.floor(Date.now() / 1000) + 3500,
        })
      );
    }
    if (access) return access;
    // fallback: treat conf as access token
    if (refresh.length > 20) {
      if (this.env) await this.env.KV.put('aliyun:access_token', refresh, { expirationTtl: 3600 });
      return refresh;
    }
    return '';
  }

  async getFiles(pdirFid: string | number = 'root') {
    const token = await this.getAccessToken();
    if (!token) return { code: 500, message: '阿里未登录，请配置 Authorization(refresh_token)' };
    const driveId = this.driveId();
    if (!driveId) return { code: 500, message: '未配置 ali_drive_id' };
    const res = await httpJson('https://api.aliyundrive.com/adrive/v3/file/list', {
      method: 'POST',
      headers: aliHeaders(token),
      body: {
        all: false,
        drive_id: driveId,
        fields: '*',
        limit: 100,
        order_by: 'updated_at',
        order_direction: 'DESC',
        parent_file_id: pdirFid === 0 || pdirFid === '0' ? 'root' : String(pdirFid),
        url_expire_sec: 14400,
      },
    });
    if (res.data?.message) return { code: 500, message: res.data.message };
    return { code: 200, message: '获取成功', data: res.data?.items || [] } as any;
  }

  async deletepdirFid(filelist: string[]) {
    const token = await this.getAccessToken();
    if (!token) return { code: 500, message: '阿里未登录' };
    const driveId = this.driveId() || '0';
    await httpJson('https://api.aliyundrive.com/adrive/v4/batch', {
      method: 'POST',
      headers: aliHeaders(token),
      body: {
        requests: filelist.map((id) => ({
          body: { file_id: id, drive_id: driveId },
          headers: { 'Content-Type': 'application/json' },
          id,
          method: 'POST',
          url: '/recyclebin/trash',
        })),
        resource: 'file',
      },
    });
    return { code: 200, message: 'ok', data: null };
  }

  async transfer(shareId: string): Promise<TransferResult> {
    const token = await this.getAccessToken();
    if (!token) return { code: 500, message: '阿里未登录，请配置 Authorization(refresh_token)' };

    const infoRes = await httpJson('https://api.aliyundrive.com/adrive/v3/share_link/get_share_by_anonymous', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: { share_id: shareId },
    });
    const infos = infoRes.data;
    if (!infos?.file_infos) {
      return { code: 500, message: infos?.message || '获取分享信息失败' };
    }

    if (this.cfg.isType === 1) {
      return {
        code: 200,
        message: '检验成功',
        data: { title: infos.share_name || shareId, share_url: this.cfg.url },
      };
    }

    const driveId = this.driveId();
    if (!driveId) return { code: 500, message: '未配置 ali_drive_id' };
    let toParent = this.cfg.expired_type === 2 ? this.conf.ali_file_time : this.conf.ali_file;
    if (!toParent) return { code: 500, message: '未配置阿里转存目录 ali_file' };

    const tokenRes = await httpJson('https://api.aliyundrive.com/v2/share_link/get_share_token', {
      method: 'POST',
      headers: aliHeaders(token),
      body: { share_id: shareId },
    });
    const shareToken = tokenRes.data?.share_token;
    if (!shareToken) return { code: 500, message: tokenRes.data?.message || '获取 share_token 失败' };

    const batchBody = {
      requests: (infos.file_infos as any[]).map((value, key) => ({
        body: {
          auto_rename: true,
          file_id: value.file_id,
          share_id: shareId,
          to_drive_id: driveId,
          to_parent_file_id: toParent,
        },
        headers: { 'Content-Type': 'application/json' },
        id: String(key),
        method: 'POST',
        url: '/file/copy',
      })),
      resource: 'file',
    };

    const saveRes = await httpJson('https://api.aliyundrive.com/adrive/v4/batch', {
      method: 'POST',
      headers: { ...aliHeaders(token), 'X-Share-Token': shareToken },
      body: batchBody,
    });
    const responses = saveRes.data?.responses;
    if (!responses?.length) {
      return { code: 500, message: saveRes.data?.message || '转存请求失败，无响应数据' };
    }
    const body0 = responses[0]?.body;
    if (body0?.code) return { code: 500, message: body0.message || '转存失败' };

    const fileIdList = responses.map((r: any) => r.body?.file_id).filter(Boolean);
    if (!fileIdList.length) return { code: 500, message: '转存失败，未返回文件' };

    const shareRes = await httpJson('https://api.aliyundrive.com/adrive/v2/share_link/create', {
      method: 'POST',
      headers: aliHeaders(token),
      body: {
        drive_id: driveId,
        expiration: '',
        share_pwd: '',
        file_id_list: fileIdList,
      },
    });
    if (!shareRes.data?.share_url) {
      return { code: 500, message: shareRes.data?.message || '创建分享失败' };
    }

    return {
      code: 200,
      message: '转存成功',
      data: {
        title: shareRes.data.share_title || infos.share_name || shareId,
        share_url: shareRes.data.share_url,
        fid: shareRes.data.file_id_list || fileIdList,
      },
    };
  }
}
