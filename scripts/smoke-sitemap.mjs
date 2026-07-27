async function main() {
  const cap = await fetch('http://127.0.0.1:8787/admin/system/getCaptcha').then((r) => r.json());
  console.log('cap', cap.code);
  const svg = Buffer.from(cap.data.image.split(',')[1], 'base64').toString();
  const code = (svg.match(/>(\d{4})</) || [])[1];
  console.log('code', code);
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
  console.log('login', login);
  if (login.code !== 200) process.exit(1);
  await fetch('http://127.0.0.1:8787/admin/system/clean', {
    method: 'POST',
    headers: {
      access_token: login.data.access_token,
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({}),
  });
  const sm = await fetch('http://127.0.0.1:8787/sitemap.xml').then((r) => r.text());
  console.log('SITEMAP', sm.slice(0, 220));
  console.log('ABS', sm.includes('http://127.0.0.1:8787/d/'));
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
