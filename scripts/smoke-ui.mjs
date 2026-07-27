import { aesEncrypt, aesDecrypt } from '../apps/worker/src/utils.ts';

// quick node test won't work for workers types - use fetch smoke instead
async function main() {
  // clear conf cache by calling clean after login
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
  await fetch('http://127.0.0.1:8787/admin/system/clean', {
    method: 'POST',
    headers: { access_token: t, 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ access_token: t }),
  });

  const home = await fetch('http://127.0.0.1:8787/').then((r) => r.text());
  console.log('THEME', home.includes('--theme-background: #fafafa') || home.includes('#fafafa'));
  console.log('HOME_STRUCT', home.includes('homeBox') && home.includes('headerBox') && home.includes('最新更新'));
  console.log('CSS_LEN', (home.match(/\.homeBox/g) || []).length > 0);

  const list = await fetch('http://127.0.0.1:8787/s/' + encodeURIComponent('测试') + '.html').then((r) => r.text());
  console.log('LIST_HTML', list.includes('searchList') && list.includes('筛选') && list.includes('本地搜'));
  console.log('LIST_ITEM', list.includes('测试资源ABC'));

  const detail = await fetch('http://127.0.0.1:8787/d/1.html').then((r) => r.text());
  console.log('DETAIL', detail.includes('detailBox') && detail.includes('资源分类'));

  const sm = await fetch('http://127.0.0.1:8787/sitemap.xml').then((r) => r.text());
  console.log('SITEMAP_ABS', sm.includes('http://127.0.0.1:8787/d/'));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
