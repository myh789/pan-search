const TOKEN_KEY = 'ps_access_token';

export function getToken() {
  return localStorage.getItem(TOKEN_KEY) || '';
}
export function setToken(t: string) {
  localStorage.setItem(TOKEN_KEY, t);
}
export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

async function req(path: string, options: RequestInit & { form?: Record<string, any> } = {}) {
  const headers: Record<string, string> = {
    ...(options.headers as any),
    access_token: getToken(),
    plat: 'web',
    version: '1.0',
  };
  let body = options.body;
  if (options.form) {
    const fd = new URLSearchParams();
    for (const [k, v] of Object.entries(options.form)) {
      if (v !== undefined && v !== null) fd.set(k, String(v));
    }
    fd.set('access_token', getToken());
    body = fd;
    headers['Content-Type'] = 'application/x-www-form-urlencoded';
  }
  const res = await fetch(path, { ...options, headers, body });
  const text = await res.text();
  let json: any;
  try {
    json = JSON.parse(text);
  } catch {
    return { code: res.status || 500, message: text.slice(0, 200) || '服务器返回非 JSON' };
  }
  if (json.code === 401) {
    clearToken();
    location.href = '/qfadmin/login';
  }
  return json;
}

export const api = {
  get: (path: string, init?: RequestInit) => req(path, init),
  postForm: (path: string, form: Record<string, any>, init?: RequestInit) =>
    req(path, { method: 'POST', form, ...init }),
  postJson: (path: string, data: unknown, init?: RequestInit) =>
    req(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
      ...init,
    }),
};
