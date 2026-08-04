/**
 * 打包可直接上传的 ZIP：根目录同时含 index.html 与 cloud-functions
 * 用法（在 edgeone/ 下）：npm run pack
 *
 * 注意：不要用资源管理器「压缩」或 PowerShell Compress-Archive 裸压，
 * Windows 会把 [[default]].js 里的 [] 当成通配符，导致 Cloud Functions 丢失。
 */
import {
  createWriteStream,
  existsSync,
  cpSync,
  mkdirSync,
  rmSync,
  writeFileSync,
  readFileSync,
  readdirSync,
  statSync,
} from 'fs';
import { join, dirname, relative } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import { createHash } from 'crypto';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, '.upload-dist');
const zipPath = join(root, 'pansoso-edgeone-upload.zip');

if (existsSync(outDir)) rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

const copy = [
  'index.html',
  's.html',
  'qfadmin',
  'cloud-functions',
  'lib',
  'scripts',
  'package.json',
  'package-lock.json',
  'edgeone.json',
];
for (const name of copy) {
  const src = join(root, name);
  if (!existsSync(src)) {
    if (name === 'package-lock.json') continue;
    console.error('missing', name);
    process.exit(1);
  }
  cpSync(src, join(outDir, name), { recursive: true });
}

// 校验 catch-all 文件名完整（方括号不能丢）
const catchAll = join(outDir, 'cloud-functions', 'api', '[[default]].js');
if (!existsSync(catchAll)) {
  console.error('FATAL: cloud-functions/api/[[default]].js 缺失');
  process.exit(1);
}
const ping = join(outDir, 'cloud-functions', 'api', 'ping.js');
if (!existsSync(ping)) {
  console.error('FATAL: cloud-functions/api/ping.js 缺失');
  process.exit(1);
}

// 尽量带上 pages-blob，避免直接上传不跑 npm install
try {
  execSync('npm install --omit=dev', { cwd: root, stdio: 'inherit' });
} catch {
  console.warn('[pack] npm install failed; zip may miss node_modules');
}
const nm = join(root, 'node_modules', '@edgeone', 'pages-blob');
if (existsSync(nm)) {
  mkdirSync(join(outDir, 'node_modules', '@edgeone'), { recursive: true });
  cpSync(nm, join(outDir, 'node_modules', '@edgeone', 'pages-blob'), { recursive: true });
} else {
  console.warn('[pack] @edgeone/pages-blob 未安装，Blob 相关接口可能失败；/api/ping 仍应可用');
}

if (existsSync(zipPath)) rmSync(zipPath, { force: true });

// 用 tar 打包，保留 [[default]].js 字面文件名（避免 PowerShell [] 通配）
try {
  execSync(`tar -a -cf "${zipPath}" -C "${outDir}" .`, { stdio: 'inherit' });
} catch (e) {
  console.error('[pack] tar 打包失败，请确认 Windows 10+ 自带 tar:', e?.message || e);
  process.exit(1);
}

// 校验 zip 内是否含 ping 与 [[default]]
let listed = '';
try {
  listed = execSync(`tar -tf "${zipPath}"`, { encoding: 'utf8' });
} catch {
  listed = '';
}
const hasPing = /cloud-functions\/api\/ping\.js/.test(listed) || /cloud-functions\\api\\ping\.js/.test(listed);
const hasCatch = listed.includes('[[default]].js');
if (!hasPing || !hasCatch) {
  console.error('[pack] ZIP 内容校验失败');
  console.error('hasPing=', hasPing, 'hasCatchAll=', hasCatch);
  console.error(listed.split(/\r?\n/).slice(0, 40).join('\n'));
  process.exit(1);
}

const buf = readFileSync(zipPath);
const sha = createHash('sha256').update(buf).digest('hex').slice(0, 12);
console.log('\n[pack] OK →', zipPath);
console.log('[pack] size=', buf.length, 'sha256_12=', sha);
console.log('[pack] zip 内含 cloud-functions/api/ping.js 与 [[default]].js');
console.log('\n请到 EdgeOne 控制台 → 项目 pansoso → 直接上传 这个 zip');
console.log('上传后打开: https://pansoso.edgeone.dev/api/ping');
console.log('应看到 JSON: "cloud-functions ok"');
