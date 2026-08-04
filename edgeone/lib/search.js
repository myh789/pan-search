import { determineIsType, httpJson } from './utils.js';

function extractUrls(text, pantype) {
  const patterns = {
    0: /https?:\/\/pan\.quark\.cn\/s\/[A-Za-z0-9]+/g,
    1: /https?:\/\/www\.(?:alipan|aliyundrive)\.com\/s\/[A-Za-z0-9]+/g,
    2: /https?:\/\/pan\.baidu\.com\/s\/[A-Za-z0-9_\-]+/g,
    3: /https?:\/\/(?:drive|fast)\.uc\.cn\/s\/[A-Za-z0-9]+/g,
    4: /https?:\/\/pan\.xunlei\.com\/s\/[A-Za-z0-9_\-]+/g,
  };
  const re = patterns[pantype] || patterns[0];
  return [...new Set(String(text || '').match(re) || [])];
}

function shareIdToPanUrl(id, pantype) {
  const bases = {
    0: `https://pan.quark.cn/s/${id}`,
    1: `https://www.alipan.com/s/${id}`,
    2: `https://pan.baidu.com/s/${id}`,
    3: `https://drive.uc.cn/s/${id}`,
    4: `https://pan.xunlei.com/s/${id}`,
  };
  return bases[pantype] || bases[0];
}

function resolvePanUrl(raw, pantype) {
  const absolute = extractUrls(raw, pantype);
  if (absolute.length) return absolute[0];
  const m = String(raw || '').match(/\/s\/([A-Za-z0-9_\-]+)/);
  if (m) return shareIdToPanUrl(m[1], pantype);
  return null;
}

function stripHtml(s) {
  return String(s || '')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

function getByPath(obj, path) {
  return String(path || '')
    .split('.')
    .reduce((a, k) => (a == null ? undefined : a[k]), obj);
}

function pickStr(...vals) {
  for (const v of vals) {
    if (v == null || v === '') continue;
    const s = String(v).replace(/\s+/g, ' ').trim();
    if (s) return s;
  }
  return '';
}

function mapFields(obj, fieldMap) {
  const title = fieldMap.title
    ? getByPath(obj, fieldMap.title)
    : obj.title || obj.note || obj.name || obj.taskname;
  const url = fieldMap.url ? getByPath(obj, fieldMap.url) : obj.url || obj.link || obj.shareurl;
  if (!title || !url) return null;
  const times = pickStr(
    fieldMap.times ? getByPath(obj, fieldMap.times) : '',
    obj.datetime,
    obj.times,
    obj.time,
    obj.updated_at,
    obj.create_time
  );
  const code = pickStr(
    fieldMap.code ? getByPath(obj, fieldMap.code) : '',
    obj.code,
    obj.pwd,
    obj.password,
    obj.extract_code
  );
  return {
    title: String(title).replace(/\s+/g, ' ').trim().slice(0, 200),
    url: String(url),
    ...(times ? { times } : {}),
    ...(code ? { code } : {}),
  };
}

function parseHtmlHits(html, pantype, keyword, limit) {
  const hits = [];
  const seen = new Set();
  const re =
    /href=["'](\/s\/[A-Za-z0-9_\-]+)["'][\s\S]*?(?:name=["']content-title["'][^>]*>|class=["'][^"']*content-title[^"']*["'][^>]*>)([\s\S]*?)<\/div>/gi;
  let m;
  while ((m = re.exec(html)) && hits.length < limit) {
    const url = resolvePanUrl(m[1], pantype);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    hits.push({ title: stripHtml(m[2]) || keyword, url });
  }
  if (hits.length) return hits;
  const idRe = /href=["']\/s\/([A-Za-z0-9_\-]+)["']/gi;
  while ((m = idRe.exec(html)) && hits.length < limit) {
    const url = shareIdToPanUrl(m[1], pantype);
    if (seen.has(url)) continue;
    seen.add(url);
    hits.push({ title: keyword, url });
  }
  for (const u of extractUrls(html, pantype)) {
    if (hits.length >= limit) break;
    if (seen.has(u)) continue;
    seen.add(u);
    hits.push({ title: keyword, url: u });
  }
  return hits;
}

function normUrlKey(u) {
  return String(u || '')
    .trim()
    .replace(/[?#].*$/, '')
    .replace(/\/+$/, '')
    .toLowerCase();
}

export async function runLine(line, keyword) {
  const pantype = Number(line.pantype || 0);
  const limit = Math.max(1, Math.min(30, Number(line.count) || 10));
  let fixed = {};
  try {
    fixed = JSON.parse(line.fixed_params || '{}');
  } catch {
    fixed = {};
  }
  const headers = {};
  try {
    Object.assign(headers, JSON.parse(line.headers || '{}'));
  } catch {
    /* ignore */
  }
  let fieldMap = {};
  try {
    fieldMap = JSON.parse(line.field_map || '{}');
  } catch {
    fieldMap = {};
  }

  const type = Number(line.type || 0); // 0 json api, 1 html
  let url = String(line.url || '');
  url = url.replace(/\{keyword\}/g, encodeURIComponent(keyword));

  if (type === 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 60_000);
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          ...headers,
        },
        signal: controller.signal,
      });
      const html = await res.text();
      return parseHtmlHits(html, pantype, keyword, limit);
    } catch (e) {
      if (e?.name === 'AbortError') {
        const err = new Error('接口异常');
        err.code = 'TIMEOUT';
        throw err;
      }
      throw e;
    } finally {
      clearTimeout(timer);
    }
  }

  const method = String(line.method || 'GET').toUpperCase();
  const body = { ...fixed };
  for (const [k, v] of Object.entries(body)) {
    if (typeof v === 'string') body[k] = v.replace(/\{keyword\}/g, keyword);
  }
  const res = await httpJson(url, {
    method,
    headers,
    body: method === 'GET' ? undefined : body,
    query: method === 'GET' ? body : undefined,
    timeout: 60_000,
  });
  const data = res.data;
  let arr = [];
  const listPath = fieldMap.list || fieldMap.data;
  if (listPath) {
    const byPath = getByPath(data, listPath);
    if (Array.isArray(byPath)) arr = byPath;
  }
  if (!arr.length) {
    if (Array.isArray(data)) arr = data;
    else if (Array.isArray(data?.data)) arr = data.data;
    else if (Array.isArray(data?.list)) arr = data.list;
    else if (Array.isArray(data?.data?.list)) arr = data.data.list;
    else if (Array.isArray(data?.result)) arr = data.result;
    else if (Array.isArray(data?.data?.merged_by_type?.quark)) arr = data.data.merged_by_type.quark;
  }

  const hits = [];
  for (const row of arr) {
    if (hits.length >= limit) break;
    const mapped = mapFields(row, fieldMap);
    if (!mapped) continue;
    const resolved = resolvePanUrl(mapped.url, pantype) || mapped.url;
    hits.push({ ...mapped, url: resolved });
  }
  return hits;
}

function sendDone(send, reason, extra = {}) {
  send(`data: [DONE]${JSON.stringify({ reason, ...extra })}\n\n`);
}

export async function streamWebSearch({ conf, lines, title, isType, isShow, transferUrl, aesEncrypt }) {
  const encoder = new TextEncoder();
  const banKeywords = String(conf.ban_keywords || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const blocked = banKeywords.some((k) => k && title.includes(k));

  return new ReadableStream({
    async start(controller) {
      const send = (s) => controller.enqueue(encoder.encode(s));
      if (!title) {
        sendDone(send, 'empty_query');
        controller.close();
        return;
      }
      if (blocked) {
        sendDone(send, 'banned');
        controller.close();
        return;
      }
      const list = (lines || []).filter((l) => Number(l.status) === 1);
      const filtered =
        Number(isType) < 0 ? list : list.filter((l) => Number(l.pantype) === Number(isType));
      if (!filtered.length) {
        sendDone(send, 'no_lines');
        controller.close();
        return;
      }

      const seenUrls = new Set();
      let sent = 0;
      let lineErrors = 0;
      let lineNo = 0;
      const sorted = [...filtered].sort((a, b) => Number(b.weight || 0) - Number(a.weight || 0));
      // 有限并行：更快出结果、多线路交叉去重后资源更多
      const CONC = Math.min(3, sorted.length);
      let cursor = 0;
      const workers = Array.from({ length: CONC }, async () => {
        while (cursor < sorted.length) {
          const idx = cursor++;
          const line = sorted[idx];
          const no = idx + 1;
          lineNo = Math.max(lineNo, no);
          send(`data: 线路：${no}\n\n`);
          try {
            const results = await runLine(line, title);
            for (const item of results) {
              const key = normUrlKey(item.url);
              if (!key || seenUrls.has(key)) continue;
              seenUrls.add(key);
              item.is_type = determineIsType(item.url);
              item.pantype = Number(item.is_type ?? line.pantype ?? 0);
              const out = { ...item };
              delete out.line;
              if (aesEncrypt) out.url = aesEncrypt(item.url);
              send(`data: ${JSON.stringify(out)}\n\n`);
              sent += 1;
            }
          } catch (e) {
            lineErrors += 1;
            const msg =
              e?.code === 'TIMEOUT' || e?.message === '接口异常' ? '接口异常' : e?.message || '接口异常';
            send(`data: ${JSON.stringify({ error: msg })}\n\n`);
          }
        }
      });
      await Promise.all(workers);

      let reason = 'ok';
      if (!sent) {
        reason = lineErrors >= lineNo && lineNo > 0 ? 'all_failed' : 'no_results';
      }
      sendDone(send, reason, { count: sent });
      controller.close();
    },
  });
}
