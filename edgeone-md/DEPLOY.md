# EdgeOne 部署教程（资源姐搜索）

本教程部署的是仓库里的 **`edgeone/`** 独立包：首页 + 全网搜 + 夸克/百度/迅雷转存 + 定时清理 + 后台。  
**不会改动** 原来的 Cloudflare Worker（`apps/worker`）代码。

相关文档：

- [ARCHITECTURE.md](./ARCHITECTURE.md) — 架构与 Blob 键设计  
- [CONFIG.md](./CONFIG.md) — 环境变量与后台配置项  
- [SEARCH-LINES.md](./SEARCH-LINES.md) — 全网搜线路（百度/迅雷仅 JSON）  
- [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) — 排障  

---

## 你会得到什么

| 地址 | 作用 |
|------|------|
| `/` | 首页搜索（资源姐；夸克/百度/迅雷） |
| `/s.html?q=关键词` | 全网搜结果 + 获取资源 / 转存 |
| `/qfadmin/` | 管理后台 |
| `/api/ping` | **Functions 探针（必须先通）** |
| `/hello` | 备用探针 |
| `/api/blob-init` | 触发 Blob 命名空间创建 |
| `/cron/cleanup` | 定时清理入口 |

默认后台：`admin` / `Admin123!`

---

## 开始前准备

1. **Node.js 20+**
2. 腾讯云账号，开通 **EdgeOne Makers / Pages**（[pages.edgeone.ai](https://pages.edgeone.ai) 或腾讯云控制台 EdgeOne）
3. 本仓库已在本地，关注目录：`edgeone/`
4. 建议函数地域选 **中国大陆**（如 `ap-guangzhou`），夸克/百度/迅雷接口对海外出口不友好

---

## 第一步：部署（推荐「直接上传」这个 zip）

本地已准备好上传包（含 `cloud-functions`，文件名带方括号也能打进包）：

```text
f:\github\pan-search\edgeone\pansoso-edgeone-upload.zip
```

在本机重新生成：

```bash
cd edgeone
npm run pack
```

然后：

1. 打开 EdgeOne 控制台项目 **pansoso**（`makers-xlqbnbrrklva`）
2. **部署 / 直接上传** → 选上面这个 zip（不要只传 `out/` 或只传几个 html）
3. 解压后根目录必须同时有：`index.html`、`cloud-functions/`、`package.json`
4. `edgeone.json` **不要**再配 `buildCommand`（上传包里没有完整 scripts 时会构建失败，并导致 `No server-handler detected`）
5. 部署完成后依次打开：
   - `https://pansoso.edgeone.dev/api/ping` → 必须是 JSON  
   - `https://pansoso.edgeone.dev/hello` → 备用 JSON  
   - `https://pansoso.edgeone.dev/api/blob-init` → 创建 Blob  

若 `/api/ping` 仍是首页 HTML：上传包里没有 `cloud-functions`，或上传时多套了一层文件夹。

### 若用 Git 导入

Root Directory 必须设为 **`edgeone`**，且仓库里要有最新的 `cloud-functions/api/ping.js`。Git 部署同样不要依赖已删除的 `buildCommand`（静态文件在 `edgeone/` 根目录）。

---

## 第二步：触发 Blob 创建（重要）

按 [官方文档](https://pages.edgeone.ai/zh/document/blob-storage)：控制台 **不能手动新建**；在 Cloud Functions 里首次调用 `getStore("pansearch")` 并 `set`/`setJSON` 后自动创建。控制台只读浏览。

### 1. 确认部署根目录

Pages 项目根目录必须是 **`edgeone/`**（里面有 `package.json`、`cloud-functions/`、`edgeone.json`），不能是整个 `pan-search` 仓库根。

### 2. 访问探针（部署后再点）

优先打开（独立函数，错误信息最全）：

```text
https://你的域名/api/blob-init
```

或：

```text
https://你的域名/api/blob/init
https://你的域名/api/health
```

**成功**：`code: 200`，且有 `"wrote"` / `setJSON` 相关 `steps`。然后回控制台 **存储 → Blob 存储** 刷新，应出现 **`pansearch`**（可等 10～30 秒再刷）。

**失败**：把返回的 JSON（含 `message` / `stack` / `steps`）对照下面排查，不要只看控制台空页。

| 返回特征 | 原因 | 处理 |
|---------|------|------|
| 整页 HTML / 404 | `/api` 没进 Cloud Functions | 确认根目录是 `edgeone/`，且存在 `cloud-functions/api/` |
| `Cannot find module '@edgeone/pages-blob'` | 依赖未装进函数包 | `package.json` 含该依赖；重新部署让平台执行 `npm install` |
| 其它 500 | SDK/鉴权/运行时问题 | 打开 **日志分析** 看 Cloud Functions 报错 |

`edgeone.json` 中已配置 `externalNodeModules: ["@edgeone/pages-blob"]` 与 `includeFiles: ["lib/**"]`。

---

## 第三步：配置环境变量（直接上传必做）

直接上传**不会**自动注入 Blob 部署凭证，登录报 `Missing: token` 就是这个原因。

在项目 **环境变量 / Secrets** 中添加：

| 变量 | 必填 | 说明 |
|------|------|------|
| `PAGES_PROJECT_ID` | **是** | 填 `makers-xlqbnbrrklva`（控制台项目 URL 里那段） |
| `PAGES_BLOB_DEPLOY_CREDENTIAL` | **是** | 控制台 **API Token** 页创建的 Token（也可用 `EDGEONE_API_TOKEN`） |
| `ADMIN_BOOTSTRAP_PASSWORD` | 建议 | 首启管理员密码，默认 `Admin123!` |
| `ENCRYPT_KEY` / `ENCRYPT_IV` | 建议 | 加密 SSE 链接 |
| `BLOB_STORE_NAME` | 否 | 默认 `pansearch` |
| `CRON_SECRET` | 否 | 保护定时清理接口 |

API Token 创建入口：Makers 控制台 → **API Token** → 创建。

配好后**重新部署**（或至少等环境变量生效），再打开：

```text
https://pansoso.edgeone.dev/api/blob-init
```

（注意路径是 `/api/blob-init`，不是 `/blob-init`。）

| `CRON_SECRET` | 可选 | 若设置，则调用 `/cron/cleanup` 需带 `x-cron-secret` 或 `?secret=` |
| `BLOB_STORE_NAME` | 可选 | 默认 `pansearch` |

`edgeone.json` 里已配置：

- Cloud Functions 地域：`ap-guangzhou`  
- `maxDuration`: 120 秒（全网搜 + 转存较耗时）  
- 定时任务：每天 `0 3 * * *` → `POST /cron/cleanup`（上海时区；免费套餐不能更频）

---

## 第四步：部署

### 方式 A：控制台关联 Git

推送包含 `edgeone/` 的提交 → 自动构建部署。

### 方式 B：EdgeOne CLI（示例）

```bash
cd edgeone
npm install
# 按官方 CLI 登录并关联项目后部署
npx edgeone pages deploy
```

（具体 CLI 子命令以当前官方文档为准。）

### 方式 C：直接上传

把 `edgeone/` 目录打成 zip 上传（需包含 `package.json`、`lib/`、`cloud-functions/`、`public/`、`edgeone.json`）。

---

## 第五步：绑定域名

1. 项目设置 → 自定义域名  
2. 按提示做 CNAME / 证书  
3. 打开 `https://你的域名/` 与 `https://你的域名/qfadmin/`

---

## 第六步：后台初始化

1. 登录 `/qfadmin/`  
2. **Cookies / 目录**  
   - 夸克：Cookie + 正式/临时目录 **fid**；点测试登录  
   - 百度：Cookie 须含 **BDUSS**；目录填路径如 `/转存`、`/临时`；点测试登录  
   - 迅雷：`refresh_token`（失效则搜到原链、不转存）  
3. **全网搜线路**：点 **「导入示例线路」**（百度/迅雷只要 JSON，不要网页线路）  
4. **转存参数**：金钱模式（加密后转存）；TTL 按需  
5. **关键词屏蔽**：按需填写  

然后回首页搜一个词 → 「获取资源」验证：百度成功提取码多为 `6666`，失败则回退原链。

---

## 定时清理说明

- 平台 schedule：`0 3 * * *` → `POST /cron/cleanup`（免费套餐最少每天一次）  
- 另有约 2% 请求触发懒清理，防止定时漏跑  
- 也可在后台点「立即清理临时资源」  
- 若设置了 `CRON_SECRET`，外部 crontab 可：

```bash
curl -X POST "https://你的域名/cron/cleanup" -H "x-cron-secret: 你的密钥"
```

---

## 与 Cloudflare 版差异（摘要）

| 项 | Cloudflare 原版 | EdgeOne 精简版 |
|----|-----------------|----------------|
| 代码位置 | `apps/worker` | `edgeone/`（独立） |
| 数据库 | D1 | Blob JSON |
| 缓存/队列 | KV + Queues | 无 Queues；会话也在 Blob |
| 图片/附件 | R2 | 无（按需求不做上传） |
| 本地资源库 | 有 | 无 |
| 转存网盘 | 多盘 | 夸克 / 百度 / 迅雷完整；其它凭证可存 |

---

## 下一步

部署成功后请立刻修改默认管理员密码（当前精简版通过环境变量重置 bootstrap；生产建议再加改密接口）。  
架构细节见 [ARCHITECTURE.md](./ARCHITECTURE.md)。
