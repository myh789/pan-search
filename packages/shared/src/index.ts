export const PAN_TYPE = {
  QUARK: 0,
  ALIYUN: 1,
  BAIDU: 2,
  UC: 3,
  XUNLEI: 4,
} as const;

export type PanType = (typeof PAN_TYPE)[keyof typeof PAN_TYPE];

export const PAN_LABELS: Record<number, string> = {
  0: '夸克',
  1: '阿里',
  2: '百度',
  3: 'UC',
  4: '迅雷',
};

export function determineIsType(url: string): PanType {
  if (/alipan\.com|aliyundrive\.com/i.test(url)) return 1;
  if (/baidu\.com/i.test(url)) return 2;
  if (/uc\.cn/i.test(url)) return 3;
  if (/xunlei\.com/i.test(url)) return 4;
  return 0;
}

/** Align with PHP parsePanLinks: one link per line, optional title/code. */
export function parsePanLinks(input: string): Array<{ url: string; title: string; code: string }> {
  const lines = input
    .split(/\n/)
    .map((s) => s.trim())
    .filter(Boolean);
  const out: Array<{ url: string; title: string; code: string }> = [];
  for (const item of lines) {
    const baiduFmt = item.match(/链接:?\s*(https?:\/\/[^\s]+)\s*提取码:?\s*([a-zA-Z0-9]{4})/i);
    if (baiduFmt) {
      let url = baiduFmt[1].trim();
      const code = baiduFmt[2].trim();
      if (code && !/[?&]pwd=/.test(url)) url += (url.includes('?') ? '&' : '?') + 'pwd=' + code;
      out.push({ url, title: '', code });
      continue;
    }
    const urlMatch = item.match(/https?:\/\/[^\s]+/);
    if (!urlMatch) continue;
    let url = urlMatch[0].replace(/[，,]+$/, '');
    let code = '';
    const pwd = item.match(/[?&]pwd=([^,\s&]+)/i);
    if (pwd) code = pwd[1];
    else {
      const comma = item.match(/,\s*([a-zA-Z0-9]{4})\s*$/);
      if (comma) {
        code = comma[1];
        if (!/[?&]pwd=/.test(url)) url += (url.includes('?') ? '&' : '?') + 'pwd=' + code;
      }
    }
    const before = item.slice(0, item.indexOf(urlMatch[0])).trim().replace(/[:：]\s*$/, '');
    out.push({ url, title: before, code });
  }
  return out;
}

export function extractPwdId(url: string): string | null {
  const clean = url.split('?entry=')[0] ?? url;
  const idx = clean.indexOf('s/');
  if (idx === -1) return null;
  return clean.slice(idx + 2).split('#')[0] || null;
}

export function jok<T = unknown>(message = 'success', data: T | null = null) {
  return { code: 200, message, data };
}

export function jerr(message = 'error', code = 500) {
  return { code, message, data: null };
}

export type TransferJob = {
  type: 'transfer' | 'transfer_batch' | 'import_batch' | 'transfer_all';
  logId?: number;
  items?: Array<{ title?: string; url: string; code?: string; categoryId?: number }>;
  url?: string;
  code?: string;
  expiredType?: number;
  isType?: number;
  isSave?: number;
  categoryId?: number;
  apiKey?: string;
};

export type SearchLineType = 'api' | 'html' | 'tg' | 'kk';

export interface SiteConf {
  [key: string]: string;
}
