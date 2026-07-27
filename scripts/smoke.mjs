async function main() {
  const cap = await fetch('http://127.0.0.1:8787/admin/system/getCaptcha').then((r) => r.json());
  const svg = Buffer.from(cap.data.image.split(',')[1], 'base64').toString();
  const code = (svg.match(/>(\d{4})</) || [])[1];
  const login = await fetch('http://127.0.0.1:8787/admin/admin/login', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      admin_account: 'admin',
      admin_password: 'Admin123!',
      captcha: code,
      captcha_token: cap.data.token,
      plat: 'web',
    }),
  }).then((r) => r.json());
  const t = login.data.access_token;
  const add = await fetch('http://127.0.0.1:8787/admin/source/add', {
    method: 'POST',
    headers: { access_token: t, 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      title: '测试资源ABC',
      url: 'https://pan.quark.cn/s/abcdefg',
      is_type: '0',
      source_category_id: '1',
    }),
  }).then((r) => r.json());
  console.log('ADD', add.code, add.message);

  const search = await fetch(
    'http://127.0.0.1:8787/api/search/index?title=' + encodeURIComponent('测试') + '&search_type=1'
  ).then((r) => r.json());
  console.log('SEARCH', search.data.total_result, search.data.items?.[0]?.title);

  const listPage = await fetch('http://127.0.0.1:8787/s/' + encodeURIComponent('测试')).then((r) => r.text());
  console.log('LIST', listPage.includes('测试资源ABC'));

  const sm = await fetch('http://127.0.0.1:8787/sitemap.xml');
  console.log('SITEMAP', sm.status, sm.headers.get('content-type'));

  const ar = await fetch('http://127.0.0.1:8787/qfadmin/');
  const at = await ar.text();
  console.log('ADMINSPA', ar.status, at.includes('root') || at.includes('module'));

  const open = await fetch('http://127.0.0.1:8787/api/open/transfer', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ api_key: 'change-me', url: 'https://pan.quark.cn/s/abcdefg', isType: '1' }),
  }).then((r) => r.json());
  console.log('OPEN', open.code, open.message);

  const line = await fetch('http://127.0.0.1:8787/admin/api_list/add', {
    method: 'POST',
    headers: { access_token: t, 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      name: 'demo',
      type: 'api',
      pantype: '0',
      url: 'https://example.com',
      method: 'GET',
      fixed_params: '{}',
      field_map: '{}',
      weight: '1',
      count: '5',
    }),
  }).then((r) => r.json());
  console.log('LINE', line.code, line.message);

  const es = await fetch('http://127.0.0.1:8787/api/other/web_search?title=test&is_type=0');
  const reader = es.body.getReader();
  const { value } = await reader.read();
  console.log('SSE', es.status, new TextDecoder().decode(value).slice(0, 120).replace(/\n/g, '|'));
  reader.cancel();

  const dr = await fetch('http://127.0.0.1:8787/d/1');
  const dt = await dr.text();
  console.log('DETAIL', dr.status, dt.includes('测试'));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
