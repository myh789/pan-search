import type { Env } from './env';

export async function sha1Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest('SHA-1', data);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function encodePassword(password: string, salt: string): Promise<string> {
  return sha1Hex(password + salt + password + salt);
}

export function nowSec(): number {
  return Math.floor(Date.now() / 1000);
}

export function randString(len = 32): string {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const arr = new Uint8Array(len);
  crypto.getRandomValues(arr);
  return [...arr].map((n) => chars[n % chars.length]).join('');
}

export async function httpJson(
  url: string,
  options: {
    method?: string;
    headers?: Record<string, string>;
    body?: unknown;
    query?: Record<string, string | number | undefined>;
    cookie?: string;
  } = {}
): Promise<{ status: number; data: any; text: string }> {
  let finalUrl = url;
  if (options.query) {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(options.query)) {
      if (v !== undefined && v !== null) qs.set(k, String(v));
    }
    finalUrl += (finalUrl.includes('?') ? '&' : '?') + qs.toString();
  }
  const method = (options.method || 'GET').toUpperCase();
  const headers: Record<string, string> = {
    Accept: 'application/json, text/plain, */*',
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    ...(options.headers || {}),
  };
  if (options.cookie) headers.Cookie = options.cookie;
  let body: string | undefined;
  // Workers/fetch：GET/HEAD 不能带 body，否则直接抛 TypeError → 500 Internal Server Error
  if (options.body !== undefined && method !== 'GET' && method !== 'HEAD') {
    if (typeof options.body === 'string') {
      body = options.body;
    } else {
      body = JSON.stringify(options.body);
      headers['Content-Type'] = headers['Content-Type'] || 'application/json;charset=UTF-8';
    }
  }
  const res = await fetch(finalUrl, { method, headers, body });
  const text = await res.text();
  let data: any = null;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  return { status: res.status, data, text };
}

export async function aesEncrypt(env: Env, value: unknown): Promise<string> {
  // Match PHP openssl_encrypt AES-256-CBC with short key/iv zero-padded with \0
  const keyBytes = new Uint8Array(32);
  const ivBytes = new Uint8Array(16);
  const keySrc = new TextEncoder().encode(env.ENCRYPT_KEY || 'ABCD');
  const ivSrc = new TextEncoder().encode(env.ENCRYPT_IV || '1234567890123456');
  keyBytes.set(keySrc.slice(0, 32));
  ivBytes.set(ivSrc.slice(0, 16));
  const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'AES-CBC' }, false, ['encrypt']);
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-CBC', iv: ivBytes },
    key,
    new TextEncoder().encode(JSON.stringify(value))
  );
  // openssl_encrypt with options=0 returns base64
  const bytes = new Uint8Array(encrypted);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!);
  return btoa(bin);
}

export async function aesDecrypt(env: Env, encrypted: string): Promise<any> {
  const keyBytes = new Uint8Array(32);
  const ivBytes = new Uint8Array(16);
  const keySrc = new TextEncoder().encode(env.ENCRYPT_KEY || 'ABCD');
  const ivSrc = new TextEncoder().encode(env.ENCRYPT_IV || '1234567890123456');
  keyBytes.set(keySrc.slice(0, 32));
  ivBytes.set(ivSrc.slice(0, 16));
  const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'AES-CBC' }, false, ['decrypt']);
  const bin = Uint8Array.from(atob(encrypted), (c) => c.charCodeAt(0));
  const decrypted = await crypto.subtle.decrypt({ name: 'AES-CBC', iv: ivBytes }, key, bin);
  return JSON.parse(new TextDecoder().decode(decrypted));
}

/** Simple Chinese-ish tokenizer: split CJK chars / words and latin tokens */
export function segment(text: string): string[] {
  const cleaned = text.trim().toLowerCase();
  if (!cleaned) return [];
  const tokens = cleaned.match(/[\u4e00-\u9fff]|[a-z0-9]+/gi) || [];
  // also keep bigrams for CJK
  const cjk = cleaned.replace(/[^\u4e00-\u9fff]/g, '');
  const bigrams: string[] = [];
  for (let i = 0; i < cjk.length - 1; i++) bigrams.push(cjk.slice(i, i + 2));
  return [...new Set([...tokens.filter((t) => t.length > 0), ...bigrams])];
}

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
