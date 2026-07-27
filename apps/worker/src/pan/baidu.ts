import { httpJson } from '../utils';
import type { PanAdapter, TransferConfig, TransferResult } from './types';

const BAIDU_ERRORS: Record<number, string> = {
  [-1]: '链接错误，链接失效或缺少提取码或访问频繁风控',
  [-4]: '无效登录。请退出账号在其他地方的登录',
  [-6]: '请用浏览器无痕模式获取 Cookie 后再试',
  [-7]: '转存失败，转存文件夹名有非法字符，不能包含 < > | * ? \\ :，请改正目录名后重试',
  [-8]: '转存失败，目录中已有同名文件或文件夹存在',
  [-9]: '链接不存在或提取码错误',
  [-10]: '转存失败，容量不足',
  [-12]: '链接错误，提取码错误',
  [-62]: '链接访问次数过多，请手动转存或稍后再试',
  0: '转存成功',
  2: '转存失败，目标目录不存在',
  4: '转存失败，目录中存在同名文件',
  12: '转存失败，转存文件数超过限制',
  20: '转存失败，容量不足',
  105: '链接错误，所访问的页面不存在',
  115: '该文件禁止分享',
};

function errMsg(code: number) {
  return BAIDU_ERRORS[code] ?? `未知错误（错误码：${code}）`;
}

function updateCookieBdclnd(cookie: string, bdclnd: string) {
  const map: Record<string, string> = {};
  for (const pair of cookie.split(';')) {
    const [k, ...rest] = pair.trim().split('=');
    if (k) map[k] = rest.join('=');
  }
  map.BDCLND = bdclnd;
  return Object.entries(map)
    .map(([k, v]) => `${k}=${v}`)
    .join('; ');
}

function baiduHeaders(cookie: string): Record<string, string> {
  return {
    Host: 'pan.baidu.com',
    Connection: 'keep-alive',
    Accept: 'application/json, text/plain, */*',
    Referer: 'https://pan.baidu.com',
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36',
    Cookie: cookie,
  };
}

function extractSurl(linkUrl: string): string {
  const m = linkUrl.match(/\/s\/([a-zA-Z0-9_-]+)/);
  if (m) return m[1];
  // legacy PHP: substr(url, 25, 23)
  return linkUrl.slice(25, 48);
}

function parseShareHtml(html: string): [string, string, string[], string[], string[]] | number {
  const shareid = [...html.matchAll(/"shareid":(\d+?),"/g)].map((m) => m[1]);
  const userId = [...html.matchAll(/"share_uk":"(\d+?)","/g)].map((m) => m[1]);
  const fsId = [...html.matchAll(/"fs_id":(\d+?),"/g)].map((m) => m[1]);
  const names = [...html.matchAll(/"server_filename":"(.+?)","/g)].map((m) => {
    try {
      return JSON.parse(`"${m[1]}"`);
    } catch {
      return m[1];
    }
  });
  const isdir = [...html.matchAll(/"isdir":(\d+?),"/g)].map((m) => m[1]);
  if (!shareid.length || !userId.length || !fsId.length || !names.length || !isdir.length) return -1;
  return [shareid[0], userId[0], fsId, [...new Set(names)], isdir];
}

function containsAd(filename: string, banned: string) {
  if (!banned) return false;
  const lower = filename.toLowerCase();
  return banned
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
    .some((k) => lower.includes(k));
}

class BaiduWork {
  cookie: string;
  bdstoken = '';

  constructor(cookie: string) {
    this.cookie = cookie;
  }

  private async request(
    method: 'GET' | 'POST',
    path: string,
    query: Record<string, string | number> = {},
    form?: Record<string, string>
  ) {
    const headers = baiduHeaders(this.cookie);
    if (form) headers['Content-Type'] = 'application/x-www-form-urlencoded';
    const res = await httpJson(`https://pan.baidu.com${path}`, {
      method,
      headers,
      cookie: this.cookie,
      query,
      body: form ? new URLSearchParams(form).toString() : undefined,
    });
    return typeof res.data === 'object' && res.data ? res.data : { errno: -1 };
  }

  async getBdstoken() {
    const res = await this.request('GET', '/api/gettemplatevariable', {
      clienttype: '0',
      app_id: '38824127',
      web: '1',
      fields: '["bdstoken","token","uk","isdocuser","servertime"]',
    });
    if (res.errno != 0) return res.errno as number;
    return String(res.result?.bdstoken || '');
  }

  async getDirList(folderName: string) {
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
    if (res.errno != 0) return res.errno as number;
    return (res.list || []) as any[];
  }

  async createDir(folderName: string) {
    const res = await this.request(
      'POST',
      '/api/create',
      { a: 'commit', bdstoken: this.bdstoken },
      { path: folderName, isdir: '1', block_list: '[]' }
    );
    return Number(res.errno);
  }

  async verifyPassCode(linkUrl: string, passCode: string) {
    const res = await this.request(
      'POST',
      '/share/verify',
      {
        surl: extractSurl(linkUrl),
        bdstoken: this.bdstoken,
        t: Date.now(),
        channel: 'chunlei',
        web: '1',
        clienttype: '0',
      },
      { pwd: passCode, vcode: '', vcode_str: '' }
    );
    if (res.errno != 0) return Number(res.errno);
    return String(res.randsk || '');
  }

  updateBdclnd(randsk: string) {
    this.cookie = updateCookieBdclnd(this.cookie, randsk);
  }

  async getTransferParams(url: string) {
    const res = await fetch(url, {
      headers: {
        ...baiduHeaders(this.cookie),
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      redirect: 'follow',
    });
    const html = await res.text();
    return parseShareHtml(html);
  }

  async transferFile(paramsList: [string, string, string[]], folderName: string) {
    const res = await this.request(
      'POST',
      '/share/transfer',
      {
        shareid: paramsList[0],
        from: paramsList[1],
        bdstoken: this.bdstoken,
        channel: 'chunlei',
        web: '1',
        clienttype: '0',
        ondup: 'newcopy',
      },
      {
        fsidlist: `[${paramsList[2].join(',')}]`,
        path: `/${folderName.replace(/^\//, '')}`,
      }
    );
    return Number(res.errno);
  }

  async createShare(fsIdCsv: string, expiry: number, password: string) {
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
    if (res.errno != 0) return Number(res.errno);
    return String(res.link || '');
  }

  async batchDeleteFiles(filePaths: string[]) {
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

export class BaiduPan implements PanAdapter {
  constructor(
    private conf: Record<string, string>,
    private cfg: TransferConfig
  ) {}

  async getFiles(pdirFid: string | number = 0) {
    try {
      const cookie = (this.conf.baidu_cookie || '').trim();
      if (!cookie) return { code: 500, message: '未配置百度Cookie' };
      const work = new BaiduWork(cookie);
      // 原版 getFiles 可不拿 bdstoken；有则带上更稳
      const token = await work.getBdstoken();
      if (typeof token === 'string' && token) work.bdstoken = token;
      else if (typeof token === 'number' && token !== 0) {
        // cookie 明显无效时直接返回
        if (token === -6 || token === -4) return { code: 500, message: errMsg(token) };
      }
      const dir =
        pdirFid === 0 || pdirFid === '0' || pdirFid === 'root' || pdirFid === '' ? '/' : String(pdirFid);
      const list = await work.getDirList(dir);
      if (typeof list === 'number') return { code: 500, message: errMsg(list) };
      return { code: 200, message: '获取成功', data: Array.isArray(list) ? list : [] } as any;
    } catch (e: any) {
      return { code: 500, message: e?.message || '百度目录获取失败' };
    }
  }

  async deletepdirFid(filelist: string[]) {
    const cookie = this.conf.baidu_cookie || '';
    if (!cookie) return { code: 500, message: '未配置百度Cookie' };
    const work = new BaiduWork(cookie);
    const token = await work.getBdstoken();
    if (typeof token === 'number') return { code: 500, message: errMsg(token) };
    work.bdstoken = token;
    const res = await work.batchDeleteFiles(filelist);
    return res.errno === 0
      ? { code: 200, message: 'ok', data: res }
      : { code: 500, message: res.message || errMsg(res.errno) };
  }

  async transfer(_pwdId: string): Promise<TransferResult> {
    const cookie = this.conf.baidu_cookie || '';
    if (!cookie) return { code: 500, message: '未配置百度Cookie' };
    const work = new BaiduWork(cookie);
    const token = await work.getBdstoken();
    if (typeof token === 'number') return { code: 500, message: errMsg(token) };
    work.bdstoken = token;

    let linkUrl = this.cfg.url;
    try {
      const u = new URL(this.cfg.url);
      linkUrl = `${u.protocol}//${u.host}${u.pathname}`;
    } catch {
      /* keep */
    }
    let passCode = this.cfg.code || '';
    if (!passCode) {
      const m = this.cfg.url.match(/[?&]pwd=([^&\s]+)/i);
      if (m) passCode = m[1];
    }

    if (passCode) {
      const randsk = await work.verifyPassCode(linkUrl, passCode);
      if (typeof randsk === 'number') return { code: 500, message: errMsg(randsk) };
      work.updateBdclnd(randsk);
    }

    const transferParams = await work.getTransferParams(linkUrl);
    if (typeof transferParams === 'number') return { code: 500, message: errMsg(transferParams) };
    const [shareId, userId, fsIds, fileNames] = transferParams;

    if (this.cfg.isType === 1) {
      return {
        code: 200,
        message: '检验成功',
        data: { title: fileNames[0] || shareId, share_url: this.cfg.url, code: passCode },
      };
    }

    let folderName = this.cfg.expired_type === 2 ? this.conf.baidu_file_time : this.conf.baidu_file;
    if (!folderName) folderName = '/默认转存文件';
    folderName = folderName.replace(/^\//, '');
    for (const ch of ['<', '>', '|', '*', '?', '\\', ':']) {
      if (folderName.includes(ch)) {
        return { code: 500, message: '转存目录名有非法字符，不能包含：< > | * ? \\ :' };
      }
    }

    const dirList0 = await work.getDirList(`/${folderName}`);
    if (typeof dirList0 === 'number') {
      const created = await work.createDir(`/${folderName}`);
      if (created !== 0) return { code: 500, message: errMsg(created) };
    }

    const transferResult = await work.transferFile([shareId, userId, fsIds], folderName);
    if (transferResult !== 0) return { code: 500, message: errMsg(transferResult) };

    const dirList = await work.getDirList(`/${folderName}`);
    if (typeof dirList === 'number') return { code: 500, message: errMsg(dirList) };

    const targetFiles: any[] = [];
    let fsIdList: string[] = [];
    let filePaths: string[] = [];
    const adFilePaths: string[] = [];
    let allAds = true;
    const banned = this.conf.quark_banned || '';

    for (const file of dirList) {
      if (!fileNames.includes(file.server_filename)) continue;
      targetFiles.push(file);
      fsIdList.push(String(file.fs_id));
      const filePath = `/${folderName}/${file.server_filename}`;
      filePaths.push(filePath);
      if (Number(file.isdir) === 1) {
        const sub = await work.getDirList(filePath);
        if (typeof sub !== 'number') {
          for (const subFile of sub) {
            if (containsAd(subFile.server_filename, banned)) {
              adFilePaths.push(`${filePath}/${subFile.server_filename}`);
            } else allAds = false;
          }
        }
      } else if (containsAd(file.server_filename, banned)) {
        adFilePaths.push(filePath);
      } else allAds = false;
    }

    if (!targetFiles.length) return { code: 500, message: '分享失败，找不到刚转存的文件' };

    if (allAds) {
      await work.batchDeleteFiles(filePaths);
      return { code: 500, message: '资源内容为空或所有转存的文件都包含广告内容，已全部删除' };
    }

    if (adFilePaths.length) {
      const del = await work.batchDeleteFiles(adFilePaths);
      if (del.errno === 0) {
        for (const ad of adFilePaths) {
          const idx = filePaths.indexOf(ad);
          if (idx >= 0) {
            filePaths.splice(idx, 1);
            fsIdList.splice(idx, 1);
          }
        }
      }
    }

    if (!fsIdList.length) {
      return { code: 500, message: '资源内容为空或所有转存的文件都包含广告内容，已全部删除' };
    }

    const password = '6666';
    const shareLink = await work.createShare(fsIdList.join(','), 0, password);
    if (typeof shareLink === 'number') return { code: 500, message: errMsg(shareLink) };

    return {
      code: 200,
      message: '文件转存成功',
      data: {
        title: fileNames[0],
        share_url: `${shareLink}?pwd=${password}`,
        fid: filePaths,
        code: password,
      },
    };
  }
}
