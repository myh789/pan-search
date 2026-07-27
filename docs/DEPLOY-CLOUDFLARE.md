# Cloudflare 部署教程（PanSearch 重写版）

本教程说明如何把仓库里的 **Cloudflare 重写版**（Workers + D1 + KV + R2 + Queues）跑起来并上线。  
原 ThinkPHP 代码仍在仓库根目录，仅作对照，**不会**部署到 Cloudflare。

相关文档：

- [mysql-to-d1.md](./mysql-to-d1.md) — 旧站数据迁移  
- [PARITY.md](./PARITY.md) — 功能对齐与已知限制  
- 示例配置：根目录 `wrangler.toml.example`、`.dev.vars.example`

---

## 1. 你将得到什么

| 地址 | 说明 |
|------|------|
| `/` | 前台（浅色 UI，对齐原版布局） |
| `/s/关键词.html` | 搜索列表（本地搜 / 全网搜） |
| `/d/ID.html` | 资源详情 |
| `/qfadmin/` | 管理后台 |
| `/api/*` | 对外开放与前台接口（已开 CORS） |
| `/health` | 健康检查（探活 D1） |
| `/robots.txt` | 爬虫规则 |
| `/sitemap.xml` | 站点地图 |

技术栈：Hono Worker、D1（SQLite）、KV、R2、Queues、Cron。

---

## 2. 环境要求

- Node.js **18+**（建议 20/22）
- npm 9+
- Cloudflare 账号
- **使用仓库内的 Wrangler**（已 pin `wrangler@^3.109`），避免全局装到 v4 导致配置不兼容：

```bash
# 推荐：始终用项目本地
npx wrangler --version
npx wrangler login
```

> 不建议 `npm i -g wrangler` 拉到最新 v4 后直接用；本项目按 Wrangler 3 编写。

建议使用 **Workers Paid**：Queues、较长转存请求更稳。

### Windows 提示

- 在仓库根目录用 PowerShell / Windows Terminal 执行命令
- 管道写文件请指定 UTF-8，例如：  
  `node scripts/convert-mysql-dump.js dump.sql | Out-File converted.sql -Encoding utf8`
- `wrangler login` 会打开浏览器；若卡住可换管理员终端或检查代理

---

## 3. 本地开发

```bash
npm install

# 可选：本地密钥
copy .dev.vars.example .dev.vars   # Windows
# cp .dev.vars.example .dev.vars   # macOS/Linux

npx wrangler d1 migrations apply pan-search --local
npm run build:admin
npx wrangler dev --port 8787
# 或 npm run dev
```

可选单独调试管理端（代理到 8787）：

```bash
npm run dev:admin
```

### 默认账号

| 项 | 值 |
|----|-----|
| 账号 | `admin` |
| 密码 | `Admin123!`（或 `.dev.vars` / Secret 里的 `ADMIN_BOOTSTRAP_PASSWORD`） |

访问：

- 前台 http://127.0.0.1:8787/  
- 后台 http://127.0.0.1:8787/qfadmin/  
- 健康检查 http://127.0.0.1:8787/health  

冒烟：

```bash
npm run smoke
npm run smoke:ui
npm run smoke:sitemap
```

---

## 4. 创建 Cloudflare 资源

```bash
npx wrangler d1 create pan-search
npx wrangler kv namespace create pan-search-kv
npx wrangler r2 bucket create pan-search-uploads
npx wrangler queues create pan-transfer
```

记下 D1 的 `database_id`、KV 的 `id`。

---

## 5. 配置 `wrangler.toml`

可复制示例再改：

```bash
copy wrangler.toml.example wrangler.toml   # 若你想从干净模板重建
```

把占位 ID 换成真实值：

| 字段 | 来源 |
|------|------|
| `d1_databases.database_id` | `d1 create` 输出 |
| `kv_namespaces.id` | `kv namespace create` 输出 |
| `r2_buckets.bucket_name` | 与创建的桶名一致 |
| `queues.*.queue` | 与创建的队列名一致 |

### 变量与密钥对照

| 名称 | 放哪 | 说明 |
|------|------|------|
| `APP_NAME` | `[vars]` | 展示名 |
| `SYSTEM_SALT` | `[vars]` | 预留；管理员密码实际用每用户 `admin_salt` |
| `ENCRYPT_KEY` / `ENCRYPT_IV` | `[vars]` 或 **Secret** | 全网搜 URL 加解密；**生产务必改**；迁旧数据时需与旧站一致 |
| `ADMIN_BOOTSTRAP_PASSWORD` | **Secret** / `.dev.vars` | 仅当库中仍是 `BOOTSTRAP` 占位密码时生效 |
| `api_key`（库表 `conf`） | 后台「基础设置」 | Open API 密钥；种子为 `change-me`，**必须改** |

推荐生产密钥：

```bash
npx wrangler secret put ADMIN_BOOTSTRAP_PASSWORD
npx wrangler secret put ENCRYPT_KEY
npx wrangler secret put ENCRYPT_IV
```

若用 Secret 覆盖加密密钥，请从 `[vars]` 删掉明文 `ENCRYPT_*`，避免混淆。

---

## 6. 正式部署

```bash
npx wrangler d1 migrations apply pan-search --remote
npm run build:admin
npx wrangler deploy
# 或：npm run deploy
```

### 6.1 自定义域名与 HTTPS

1. Dashboard → Workers → 你的 Worker → **Domains & Routes / Triggers**  
2. 添加自定义域名（域名需已接入同一 Cloudflare 账号）  
3. 状态变为 **Active** 后，HTTPS 由 Cloudflare 自动签发  
4. 区分 `*.workers.dev` 与自定义域；绑域后到后台点 **清理缓存**，再打开 `/sitemap.xml` 确认是绝对 URL  

### 6.2 验证 Queue 消费者

部署后确认：

1. Dashboard → Queues → `pan-transfer` → 已挂上本 Worker 为 consumer  
2. 后台「资源管理」提交一条批量转存，或调用 Open API（`isType=0`）  
3. 「资源日志」出现进度；Workers 日志无持续 retry  

本地可用 `wrangler queues` 相关命令查看（以当前 wrangler 帮助为准）。

---

## 7. 上线后必做（安全清单）

公开流量前请完成：

- [ ] 登录后台，**修改管理员密码**（概况页「修改密码」）
- [ ] 「基础设置」把 **`api_key`** 从 `change-me` 改成随机串
- [ ] 修改 **`ENCRYPT_KEY` / `ENCRYPT_IV`**（无旧加密数据时可任意；有旧数据则与旧站一致）
- [ ] 配置网盘 Cookie（至少夸克）与转存目录 fid
- [ ] （可选）配置全网搜线路、`transfer_feed_url`
- [ ] 点一次 **清理缓存**

### 7.1 账号管理

| 配置项 | 说明 |
|--------|------|
| `quark_cookie` + 目录 fid | 主推，转存最完整 |
| `uc_*` | UC |
| `baidu_*` | 可列目录；完整转存仍有限 |
| `xunlei_cookie` | refresh_token |
| `Authorization` + `ali_drive_id` | 阿里 token 与 drive_id |

### 7.2 附件 / Logo

「附件管理」或「基础设置」里图片字段旁的 **上传** → 写入 R2，再保存配置。

### 7.3 用户组

「用户组」可新建组、勾选菜单节点授权；超管组（id=1）无需授权。

---

## 8. 常用接口

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/health` | 健康检查 |
| GET | `/api/search/index` | 本地搜索 |
| GET | `/api/other/web_search?title=&is_type=` | 全网搜 SSE |
| POST | `/api/other/save_url` | 全网结果转存 |
| POST | `/api/open/transfer` | 开放转存（`api_key`） |
| GET | `/api/source/day` | 触发日更 |
| ALL | `/api/wechat/serve` | 微信公众号（签名校验仍简化，生产慎用） |
| POST | `/api/chatbot` | Chatbot 回调 |

```bash
curl -X POST "https://你的域名/api/open/transfer" \
  -d "api_key=你的密钥" \
  -d "url=https://pan.quark.cn/s/xxxx" \
  -d "isType=1"
```

---

## 9. 从旧 PHP / MySQL 迁数据

见 [mysql-to-d1.md](./mysql-to-d1.md)。

---

## 10. 目录结构

```
pan-search/
├── apps/worker/           # Hono Worker
├── apps/admin/            # 管理端 React → dist
├── packages/shared/
├── drizzle/migrations/
├── scripts/               # smoke / CSS bundle / MySQL 转换
├── docs/
├── wrangler.toml          # 本地/部署配置（含占位 ID 时勿直接上生产）
├── wrangler.toml.example
├── .dev.vars.example
└── package.json
```

---

## 11. 常见问题

**部署报 D1/KV id 无效**  
`wrangler.toml` 仍是 `00000000-...` 或未替换 `REPLACE_WITH_*`。

**`/qfadmin/` 白屏**  
先 `npm run build:admin` 再 deploy；强刷浏览器。

**全网搜获取链接失败**  
检查夸克 Cookie / 临时目录；加密模式需走前台「获取链接」（`save_url`）。

**转存无结果**  
看「资源日志」与 Queue 消费者；Paid 更稳。

**百度/阿里报尚未完全移植**  
完整转存以夸克、UC 为主；百度/阿里可列目录与 `isType=1` 校验。

**配置不生效**  
后台「清理缓存」。

**Cron 本地不跑**  
`wrangler dev` 默认不触发；用 `--test-scheduled` 或看线上 Triggers。

**微信接入**  
当前签名校验简化，仅适合联调；生产需自行补全验签后再接。

---

## 12. 验收清单

- [ ] `/health` 返回 `code:200` 且 `db:true`
- [ ] 首页 / 搜索 / 详情正常
- [ ] `/qfadmin/` 可登录，可改密
- [ ] 附件可上传，Logo 可显示
- [ ] 夸克目录可浏览
- [ ] 全网搜 SSE 有输出
- [ ] `/sitemap.xml` 为绝对 URL
- [ ] 错误 `api_key` 被拒绝

更细记录见 [PARITY.md](./PARITY.md)。
