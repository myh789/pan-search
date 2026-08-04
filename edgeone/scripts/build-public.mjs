/**
 * 本地可选：把静态页同步到 out/（线上直接上传不需要此步骤）
 * 直接上传包根目录已有 index.html / qfadmin，edgeone.json 已去掉 buildCommand。
 */
import { existsSync, mkdirSync, cpSync, rmSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'out');

for (const f of ['index.html', 's.html', 'qfadmin/index.html', 'cloud-functions/api/ping.js']) {
  if (!existsSync(join(root, f))) {
    console.error('[build] missing', f);
    process.exit(1);
  }
}

if (existsSync(out)) rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
cpSync(join(root, 'index.html'), join(out, 'index.html'));
cpSync(join(root, 's.html'), join(out, 's.html'));
cpSync(join(root, 'qfadmin'), join(out, 'qfadmin'), { recursive: true });
writeFileSync(join(out, '.gitkeep'), '');
console.log('[build] synced static → out/ （仅本地；线上部署勿依赖此脚本）');
