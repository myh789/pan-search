import type { Env } from '../env';
import { httpJson } from '../utils';
import { determineIsType } from '@pan-search/shared';
import { transferUrl } from '../pan';
import { aesEncrypt } from '../utils';

export type SearchHit = { title: string; url: string; is_type?: number; stoken?: string };

function extractUrls(text: string, pantype: number): string[] {
  const patterns: Record<number, RegExp> = {
    0: /https?:\/\/pan\.quark\.cn\/s\/[A-Za-z0-9]+/g,
    1: /https?:\/\/www\.(?:alipan|aliyundrive)\.com\/s\/[A-Za-z0-9]+/g,
    2: /https?:\/\/pan\.baidu\.com\/s\/[A-Za-z0-9_\-]+/g,
    3: /https?:\/\/(?:drive|fast)\.uc\.cn\/s\/[A-Za-z0-9]+/g,
    4: /https?:\/\/pan\.xunlei\.com\/s\/[A-Za-z0-9_\-]+/g,
  };
  const re = patterns[pantype] || patterns[0];
  return [...new Set(text.match(re) || [])];
}

function mapFields(obj: any, fieldMap: Record<string, string>): SearchHit | null {
  const title = fieldMap.title ? getByPath(obj, fieldMap.title) : obj.title || obj.name;
  const url = fieldMap.url ? getByPath(obj, fieldMap.url) : obj.url || obj.link;
  if (!title || !url) return null;
  return { title: String(title), url: String(url) };
}

function getByPath(obj: any, path: string) {
  return path.split('.').reduce((a, k) => (a == null ? undefined : a[k]), obj);
}

export async function handleApiLine(line: any, keyword: string): Promise<SearchHit[]> {
  let fixed: any = {};
  try {
    fixed = JSON.parse(line.fixed_params || '{}');
  } catch {
    fixed = {};
  }
  let headers: Record<string, string> = {};
  try {
    headers = JSON.parse(line.headers || '{}');
  } catch {
    headers = {};
  }
  let fieldMap: Record<string, string> = {};
  try {
    fieldMap = JSON.parse(line.field_map || '{}');
  } catch {
    fieldMap = {};
  }

  const params: Record<string, any> = {};
  for (const [k, v] of Object.entries(fixed)) {
    params[k] = typeof v === 'string' ? String(v).replace(/\{keyword\}/g, keyword) : v;
  }

  const method = (line.method || 'GET').toUpperCase();
  const res = await httpJson(line.url, {
    method,
    headers,
    query: method === 'GET' ? params : undefined,
    body: method === 'GET' ? undefined : params,
  });

  const hits: SearchHit[] = [];
  const listPath = fieldMap.list || 'data';
  let list = getByPath(res.data, listPath);
  if (!Array.isArray(list)) {
    // try common shapes
    list = res.data?.data || res.data?.list || res.data?.items || [];
  }
  if (!Array.isArray(list)) list = [];
  const limit = Number(line.count) || 20;
  for (const item of list.slice(0, limit)) {
    const mapped = mapFields(item, fieldMap);
    if (mapped) {
      hits.push(mapped);
    } else {
      const urls = extractUrls(JSON.stringify(item), Number(line.pantype) || 0);
      for (const u of urls) hits.push({ title: keyword, url: u });
    }
  }
  // also scan raw text
  if (!hits.length) {
    for (const u of extractUrls(res.text, Number(line.pantype) || 0).slice(0, limit)) {
      hits.push({ title: keyword, url: u });
    }
  }
  return hits;
}

export async function handleTgLine(line: any, keyword: string): Promise<SearchHit[]> {
  const channel = String(line.url || '').replace(/^@/, '').replace(/^https?:\/\/t\.me\/s\//, '');
  const res = await httpJson(`https://t.me/s/${channel}`, {
    method: 'GET',
    query: { q: keyword },
  });
  const html = res.text || '';
  const hits: SearchHit[] = [];
  const msgs = html.split('tgme_widget_message_wrap');
  for (const m of msgs) {
    const urls = extractUrls(m, Number(line.pantype) || 0);
    if (!urls.length) continue;
    const titleMatch = m.match(/tgme_widget_message_text[^>]*>([\s\S]*?)<\/div>/);
    const title = titleMatch
      ? titleMatch[1].replace(/<[^>]+>/g, '').trim().slice(0, 80)
      : keyword;
    for (const u of urls) hits.push({ title, url: u });
  }
  return hits.slice(0, Number(line.count) || 20);
}

export async function handleHtmlLine(line: any, keyword: string): Promise<SearchHit[]> {
  const url = String(line.url || '').replace(/\{keyword\}/g, encodeURIComponent(keyword));
  const res = await httpJson(url, { method: line.method || 'GET' });
  const html = res.text || '';
  // naive regex extraction using selectors as patterns in attributes/text
  const hits: SearchHit[] = [];
  const itemRe = new RegExp(line.html_item || 'href=["\'](https?://[^"\']+)["\'][^>]*>([^<]+)', 'gi');
  let match: RegExpExecArray | null;
  while ((match = itemRe.exec(html)) && hits.length < (Number(line.count) || 20)) {
    // Prefer pan urls
    const urls = extractUrls(match[0], Number(line.pantype) || 0);
    if (urls.length) {
      hits.push({ title: (match[2] || keyword).trim(), url: urls[0] });
    } else if (line.html_url && match[1]) {
      hits.push({ title: (match[2] || keyword).trim(), url: match[1] });
    }
  }
  if (!hits.length) {
    for (const u of extractUrls(html, Number(line.pantype) || 0).slice(0, Number(line.count) || 20)) {
      hits.push({ title: keyword, url: u });
    }
  }
  return hits;
}

export async function handleKkLine(line: any, keyword: string): Promise<SearchHit[]> {
  // legacy kkkba aggregator
  try {
    const tokenRes = await httpJson('https://m.kkkba.com/v/api/getToken', { method: 'GET' });
    const token = tokenRes.data?.data?.token || tokenRes.data?.token;
    if (!token) return [];
    const res = await httpJson('https://m.kkkba.com/v/api/getJuzi', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', token: String(token) },
      body: { name: keyword, page: 1 },
    });
    const list = res.data?.data || res.data?.list || [];
    const hits: SearchHit[] = [];
    for (const item of list.slice(0, Number(line.count) || 10)) {
      const url = item.url || item.link;
      if (url) hits.push({ title: item.title || item.name || keyword, url });
    }
    return hits;
  } catch {
    return [];
  }
}

export async function runLine(line: any, keyword: string): Promise<SearchHit[]> {
  const type = line.type || 'api';
  if (type === 'tg') return handleTgLine(line, keyword);
  if (type === 'html') return handleHtmlLine(line, keyword);
  if (type === 'kk') return handleKkLine(line, keyword);
  return handleApiLine(line, keyword);
}

export async function verificationUrl(env: Env, conf: Record<string, string>, url: string) {
  const res = await transferUrl(env, conf, { url, isType: 1, expired_type: 1 });
  if (res.code !== 200) return 0;
  return res.data;
}

export async function streamWebSearch(
  env: Env,
  conf: Record<string, string>,
  title: string,
  isType: number,
  isShow: number
): Promise<ReadableStream> {
  const encoder = new TextEncoder();
  const banKeywords = (conf.ban_keywords || '').split(',').map((s) => s.trim()).filter(Boolean);
  const blocked = banKeywords.some((k) => k && title.includes(k));

  return new ReadableStream({
    async start(controller) {
      const send = (s: string) => controller.enqueue(encoder.encode(s));
      if (!title || blocked) {
        send('data: [DONE] 无搜索词\n\n');
        controller.close();
        return;
      }
      const { getCachedApiList } = await import('./cache');
      const list = await getCachedApiList(env, isType);
      if (!list.length) {
        send('data: [DONE] 暂无可用线路\n\n');
        controller.close();
        return;
      }
      for (const line of list) {
        send(`线路：${line.name}\n\n`);
        try {
          const results = await runLine(line, title);
          for (const item of results) {
            item.is_type = determineIsType(item.url);
            if (conf.is_quan_zc === '1') {
              const info = await verificationUrl(env, conf, item.url);
              if (info === 0) continue;
              if (info && (info as any).stoken) (item as any).stoken = (info as any).stoken;
            }
            let out: any = { ...item };
            if (conf.is_quan_type !== '1' && isShow !== 1) {
              out.url = await aesEncrypt(env, item.url);
            }
            send(`data: ${JSON.stringify(out)}\n\n`);
          }
        } catch (e: any) {
          send(`data: ${JSON.stringify({ error: e?.message || 'line error' })}\n\n`);
        }
      }
      send('data: [DONE]\n\n');
      controller.close();
    },
  });
}
