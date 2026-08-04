import { createHash, createCipheriv, createDecipheriv, randomBytes } from 'crypto';

export function nowSec() {
  return Math.floor(Date.now() / 1000);
}

export function randString(len = 32) {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const buf = randomBytes(len);
  let s = '';
  for (let i = 0; i < len; i++) s += chars[buf[i] % chars.length];
  return s;
}

export function sha1Hex(input) {
  return createHash('sha1').update(String(input), 'utf8').digest('hex');
}

export function encodePassword(password, salt) {
  return sha1Hex(password + salt + password + salt);
}

export function env(name, fallback = '') {
  return process.env[name] || fallback;
}

export function encryptKey() {
  return env('ENCRYPT_KEY', 'verveu0v87e80ru0ev0euv3f2f3').slice(0, 32).padEnd(32, '0');
}

export function encryptIv() {
  return env('ENCRYPT_IV', 'k1h2i3o4b5b6o7b8').slice(0, 16).padEnd(16, '0');
}

export function aesEncrypt(plain) {
  const cipher = createCipheriv('aes-256-cbc', Buffer.from(encryptKey(), 'utf8'), Buffer.from(encryptIv(), 'utf8'));
  return Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]).toString('base64');
}

export function aesDecrypt(b64) {
  const decipher = createDecipheriv('aes-256-cbc', Buffer.from(encryptKey(), 'utf8'), Buffer.from(encryptIv(), 'utf8'));
  return Buffer.concat([decipher.update(Buffer.from(String(b64), 'base64')), decipher.final()]).toString('utf8');
}

export function jok(message, data = null) {
  return { code: 200, message, data };
}

export function jerr(message, data = null) {
  return { code: 400, message, data };
}

export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...headers },
  });
}

export function html(body, status = 200) {
  return new Response(body, {
    status,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}

export function determineIsType(url) {
  const u = String(url || '');
  if (/aliyundrive|alipan\.com/i.test(u)) return 1;
  if (/pan\.baidu\.com/i.test(u)) return 2;
  if (/(?:drive|fast)\.uc\.cn/i.test(u)) return 3;
  if (/pan\.xunlei\.com/i.test(u)) return 4;
  return 0;
}

export async function httpJson(url, options = {}) {
  let finalUrl = url;
  if (options.query) {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(options.query)) {
      if (v !== undefined && v !== null) qs.set(k, String(v));
    }
    finalUrl += (finalUrl.includes('?') ? '&' : '?') + qs.toString();
  }
  const method = (options.method || 'GET').toUpperCase();
  const headers = {
    Accept: 'application/json, text/plain, */*',
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    ...(options.headers || {}),
  };
  if (options.cookie) headers.Cookie = options.cookie;
  let body;
  if (options.body !== undefined && method !== 'GET' && method !== 'HEAD') {
    if (typeof options.body === 'string') body = options.body;
    else {
      body = JSON.stringify(options.body);
      headers['Content-Type'] = headers['Content-Type'] || 'application/json;charset=UTF-8';
    }
  }
  const timeoutMs = Number(options.timeout ?? 60_000);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(finalUrl, { method, headers, body, signal: controller.signal });
    const text = await res.text();
    let data = null;
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
    return { status: res.status, data, text };
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

export async function parseBody(request) {
  const ct = request.headers.get('content-type') || '';
  if (ct.includes('application/json')) {
    return (await request.json().catch(() => ({}))) || {};
  }
  if (ct.includes('application/x-www-form-urlencoded') || ct.includes('multipart/form-data')) {
    const fd = await request.formData();
    const out = {};
    for (const [k, v] of fd.entries()) out[k] = typeof v === 'string' ? v : v.name;
    return out;
  }
  const text = await request.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    const params = new URLSearchParams(text);
    const out = {};
    for (const [k, v] of params.entries()) out[k] = v;
    return out;
  }
}
