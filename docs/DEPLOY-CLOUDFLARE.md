# Cloudflare 部署教程（点哪填哪）

本教程按 **网页点击 + 改配置文件** 说明如何把本仓库的 Cloudflare 版上线。  
原 ThinkPHP 代码仍在仓库里，仅作对照，**不要**往 Cloudflare 上传那套 PHP。

相关说明：

- [mysql-to-d1.md](./mysql-to-d1.md) — 旧站数据迁移  
- [PARITY.md](./PARITY.md) — 功能对齐与已知限制  

---

## 你会得到什么

部署成功后，用浏览器打开你的域名，大致是：

| 打开地址 | 看到什么 |
|----------|----------|
| 网站首页 `/` | 前台搜索页 |
| `/s/关键词.html` | 搜索结果 |
| `/d/数字.html` | 资源详情 |
| `/qfadmin/` | 管理后台登录页 |
| `/health` | 应显示正常、数据库连通 |

默认后台账号（上线后马上改）：

- 账号：`admin`
- 密码：`Admin123!`

---

## 开始前准备好这些

1. 一台电脑，已安装 **Node.js 20 或 22**  
   - 打开 [https://nodejs.org](https://nodejs.org) → 点绿色 **LTS** 下载 → 一直「下一步」装完  
   - 装完可在开始菜单里看到 Node，不必记命令。
2. 一个 **Cloudflare 账号**（没有就去 [https://dash.cloudflare.com](https://dash.cloudflare.com) 注册）。
3. 本项目文件夹已下载到电脑（例如 `F:\github\pan-search`）。
4. 用 **Cursor** 或 **VS Code** 打开这个文件夹（文件 → 打开文件夹 → 选项目根目录）。
5. 建议开通 Cloudflare **Workers 付费计划**（Queues、转存更稳）；免费也能先试，但队列可能受限。

> 本项目配置按 **Wrangler 3** 写的。不要单独去全局装最新版 Wrangler 4，后面用到终端时，一律在本项目文件夹里操作即可。

---

## 第一步：登录 Cloudflare 控制台

1. 浏览器打开 [https://dash.cloudflare.com](https://dash.cloudflare.com)
2. 登录你的账号
3. 看左侧菜单，后面步骤都会在这里点：
   - **Workers 和 Pages**（有的界面写作 Workers & Pages）
   - **R2**
   - 以及 Workers 下面的 **D1**、**KV**、**Queues**（有的在「存储与数据库」分组里）

---

## 第二步：在网页上创建 4 个资源

名字建议照下面填，后面改配置时不容易对不上。

### 2.1 创建 D1 数据库（存业务数据）

1. 左侧点 **Workers 和 Pages**（或 **存储与数据库**）→ 点 **D1**
2. 点右上角 **创建数据库** / **Create database**
3. 名称输入框填：`pan-search`
4. 位置选离用户近的（国内访问可先选默认）
5. 点 **创建**
6. 进入刚建好的库 → 找到 **Database ID**（一长串类似 `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`）
7. **复制** 到记事本，标上「D1」

### 2.2 创建 KV（缓存）

1. 左侧点 **Workers 和 Pages** → **KV**
2. 点 **创建命名空间** / **Create namespace**
3. 标题填：`pan-search-kv`
4. 点创建
5. 在列表里点进去，复制 **Namespace ID**，标上「KV」

### 2.3 创建 R2 桶（放上传的图片/附件）

1. 左侧点 **R2**
2. 若提示开通，按页面点同意开通（有免费额度）
3. 点 **创建存储桶** / **Create bucket**
4. 名称填：`pan-search-uploads`
5. 点创建  
（桶名后面配置里要原样一致，一般不用单独记 ID）

### 2.4 创建队列（异步转存）

1. 左侧找到 **Queues**（多在 Workers 相关菜单下）
2. 点 **创建队列** / **Create queue**
3. 名称填：`pan-transfer`
4. 点创建

到这里，记事本里至少应有：**D1 的 ID**、**KV 的 ID**。

---

## 第三步：改项目里的配置文件

在 Cursor / VS Code 左侧文件树找到项目根目录。

### 3.1 打开 `wrangler.toml`

若没有这个文件，把 `wrangler.toml.example` **复制一份**，改名为 `wrangler.toml`（右键 → 复制 → 粘贴 → 重命名）。

用编辑器打开 `wrangler.toml`，找到下面几处，**只改引号里的内容**：

| 在文件里找这一行附近 | 改成什么 |
|----------------------|----------|
| `database_id = "..."` | 粘贴第二步复制的 **D1 Database ID** |
| `id = "..."`（在 `kv_namespaces` 那一段） | 粘贴 **KV Namespace ID** |
| `bucket_name = "..."` | 保持 `pan-search-uploads`（与 R2 桶名一致） |
| `queue = "pan-transfer"`（两处：生产者和消费者） | 保持与队列名一致 |

`[vars]` 里建议在正式上线前改掉：

| 字段 | 怎么填 |
|------|--------|
| `APP_NAME` | 网站显示名，例如 `我的网盘站` |
| `ENCRYPT_KEY` | 随便一串较长英文数字（**不要用示例里的 CHANGE_ME**） |
| `ENCRYPT_IV` | **必须正好 16 个字符**，例如 `a1b2c3d4e5f6g7h8` |

> 若你要从旧 PHP 站迁「全网搜加密链接」，这里的 KEY/IV 必须和旧站 `.env` 里一致，否则旧链接解不开。

保存文件（Ctrl + S）。

### 3.2 （可选）本地密钥文件 `.dev.vars`

只在本机调试时需要：

1. 把 `.dev.vars.example` 复制一份，改名为 `.dev.vars`
2. 打开后可改 `ADMIN_BOOTSTRAP_PASSWORD=` 后面的密码  
3. 这个文件不要上传到公开仓库（项目已忽略它）

---

## 第四步：在 Cloudflare 网页绑定密钥（正式环境）

部署成功、能看到 Worker 之后再做也行；上线前务必完成。

1. 打开 [控制台](https://dash.cloudflare.com) → **Workers 和 Pages**
2. 点你的 Worker（名称一般是 `pan-search`）
3. 上方点 **设置** / **Settings**
4. 找到 **变量和机密** / **Variables and Secrets**（或「环境变量」）
5. 点 **添加**，类型选 **Secret（机密）**，逐个加：

| 变量名 | 值怎么填 |
|--------|----------|
| `ADMIN_BOOTSTRAP_PASSWORD` | 你想用的初始管理员密码（仅数据库还是占位密码时生效） |
| `ENCRYPT_KEY` | 与 `wrangler.toml` 里一致，或更强的随机串 |
| `ENCRYPT_IV` | 正好 16 个字符 |

若密钥已放进「机密」，建议把 `wrangler.toml` 的 `[vars]` 里明文 `ENCRYPT_KEY` / `ENCRYPT_IV` **删掉或改成占位**，避免两处不一致。

点保存 / Deploy 让配置生效。

---

## 第五步：初始化数据库表（远程）

有两种做法，任选其一。

### 做法 A（推荐）：用编辑器底部终端点几下

1. 在 Cursor 顶部菜单点 **Terminal（终端）** → **New Terminal（新建终端）**
2. 确认左下角/提示路径是在项目根目录（能看到 `wrangler.toml` 的那一层）
3. 在闪烁光标处，**整行粘贴**下面文字，每粘贴一行按一次回车，等它跑完再贴下一行：

```text
npm install
```

```text
npx wrangler d1 migrations apply pan-search --remote
```

第一行是装依赖；第二行是把表结构写进 Cloudflare 上的 D1。  
若弹出登录 Cloudflare，按提示在浏览器点允许即可。

### 做法 B：在 D1 网页控制台手工执行 SQL

1. 控制台 → **D1** → 点开 `pan-search`
2. 点 **控制台** / **Console**
3. 用编辑器依次打开项目里 `drizzle/migrations/` 下的 `0000_....sql`、`0001_....sql`…  
4. 把每个文件里的 SQL **复制到网页控制台** → 点执行  
（顺序必须按文件名从小到大，漏执行会导致缺表。）

---

## 第六步：打包后台并发布到 Cloudflare

仍在项目根目录的终端里，依次执行（同样是粘贴后回车）：

```text
npm run build:admin
```

```text
npx wrangler deploy
```

也可以只粘贴一行：

```text
npm run deploy
```

（会先打包管理后台再发布。）

发布成功后，终端或网页会给出类似：

`https://pan-search.你的子域.workers.dev`

用浏览器打开它；再访问 `/qfadmin/` 试登录。

---

## 第七步：绑自定义域名（HTTPS 自动有）

1. 控制台 → **Workers 和 Pages** → 点开 `pan-search`
2. 点 **设置** → **域和路由** / **Domains & Routes**（或 **触发器 Triggers**）
3. 点 **添加自定义域** / **Add Custom Domain**
4. 输入框填你的域名，例如 `pan.example.com`  
   （这个域名的 DNS 必须已经加在**同一个** Cloudflare 账号下）
5. 按提示确认；等状态变成 **Active**
6. 用 `https://你的域名/` 打开前台；用 `https://你的域名/qfadmin/` 打开后台  
7. HTTPS 证书由 Cloudflare 自动处理，一般不用自己上传证书

绑好域名后：进后台点一次 **清理缓存**，再打开 `/sitemap.xml`，确认里面是你的正式域名，而不是 `workers.dev`。

---

## 第八步：确认队列已挂上消费者

1. 控制台 → **Queues** → 点开 `pan-transfer`
2. 看 **Consumers（消费者）** 里是否有 Worker `pan-search`
3. 若没有：回到 Worker → **设置** → **绑定**，确认队列绑定存在；或重新执行一次第六步的发布

自测：后台「资源管理」提交一条转存，或调开放接口；然后到「资源日志」看是否有进度。

---

## 第九步：上线后在后台点这些（安全必做）

用浏览器打开：`https://你的域名/qfadmin/`

| 顺序 | 点哪里 | 做什么 |
|------|--------|--------|
| 1 | 用 `admin` / 初始密码登录 | 进后台 |
| 2 | **概况** → 「修改密码」 | 改成自己的强密码并保存 |
| 3 | **基础设置** | 找到 `api_key`，把 `change-me` 改成一长串随机字符并保存 |
| 4 | **账号管理** | 至少填好夸克 Cookie 和目录 fid（主推夸克） |
| 5 | （可选）全网搜线路、`transfer_feed_url` 等 | 按需要填 |
| 6 | 点 **清理缓存** | 让新配置立刻生效 |

### 账号管理里常见填写项

| 界面字段 | 填什么 |
|----------|--------|
| 夸克 Cookie + 目录 fid | 浏览器登录夸克后复制 Cookie；目录用后台「网盘目录」浏览后填 |
| UC 相关 | UC Cookie / 目录 |
| 百度相关 | 可浏览目录；完整转存能力仍有限 |
| 迅雷 | 一般是 refresh_token 类字段 |
| 阿里 Authorization + ali_drive_id | 阿里 token 与 drive_id |

### 附件 / Logo

1. 打开 **附件管理**，或 **基础设置** 里带「上传」按钮的图片项  
2. 点 **上传** → 选本地图片  
3. 保存基础设置  
图片会进 R2，前台即可显示。

### 用户组

1. 打开 **用户组**  
2. 可新建组、勾选菜单权限  
3. 超管组（一般是 id=1）不用单独授权  

### 资源批量导入

打开 **资源管理** → **批量导入**：

- **直接导入**：校验链接后直接入库，**不会**转存到你的网盘（适合批量粘贴已有分享链）  
- **转存分享导入**：先转存再分享入库（需已在账号管理配好 Cookie / 目录）  

**表格导入**只写库、不转存（与原版一致）。任务进度可到 **资源日志** 查看。

---

## 本机调试（可选）

想在自己电脑上看效果时：

1. 确认已做过：依赖安装、本地迁移、打包后台（见第五、六步同类操作，迁移时用带 `--local` 的那次即可）
2. 终端粘贴：

```text
npx wrangler d1 migrations apply pan-search --local
```

```text
npm run build:admin
```

```text
npx wrangler dev --port 8787
```

3. 浏览器打开：
   - 前台 [http://127.0.0.1:8787/](http://127.0.0.1:8787/)
   - 后台 [http://127.0.0.1:8787/qfadmin/](http://127.0.0.1:8787/qfadmin/)
   - 健康检查 [http://127.0.0.1:8787/health](http://127.0.0.1:8787/health)

单独改管理界面时，可再开一个终端运行 `npm run dev:admin`（会连到上面的 8787）。

---

## 常用地址一览（部署后）

把「你的域名」换成 `workers.dev` 或自定义域即可在浏览器地址栏直接打开：

| 地址 | 用途 |
|------|------|
| `/health` | 看服务是否正常 |
| `/api/search/index` | 本地搜索接口 |
| `/api/other/web_search` | 全网搜（流式） |
| `/api/open/transfer` | 开放转存（需正确 `api_key`） |
| `/api/wechat/serve` | 微信（验签仍简化，生产慎用） |
| `/api/chatbot` | Chatbot 回调 |

开放转存可用任意能发「表单 POST」的工具（浏览器插件、Apifox 等），字段包括：`api_key`、`url`、`isType`（`1` 同步，`0` 进队列）。

---

## 从旧 PHP / MySQL 迁数据

按 [mysql-to-d1.md](./mysql-to-d1.md) 操作。迁完后加密相关 KEY/IV 必须与旧站一致。

---

## 项目里主要看哪些文件夹

| 位置 | 是什么 |
|------|--------|
| `apps/worker` | 前台 + 接口（跑在 Worker 上） |
| `apps/admin` | 管理后台界面（发布前会打包进 `dist`） |
| `drizzle/migrations` | 数据库表结构 |
| `wrangler.toml` | Cloudflare 绑定与变量（上线前必须填真实 ID） |
| `docs/` | 本教程与其它说明 |

---

## 常见问题（对照现象处理）

**网页报 D1 / KV 无效**  
打开 `wrangler.toml`，看 `database_id`、KV 的 `id` 是否还是 `00000000-...` 或 `REPLACE_WITH_...`，改成第二步复制的真实 ID，再重新发布一次。

**打开 `/qfadmin/` 白屏**  
常见原因：管理端 JS/CSS 路径在 `/qfadmin/assets/...`，但静态资源实际挂在站点根目录，旧 Worker 未做路径转发时脚本 404，页面只剩空的 `#root`。  
处理：用当前代码重新「打包后台 + 发布」；浏览器 F12 → 网络，确认 JS 为 200；再 Ctrl+F5。  
若被跳到首页，多半是静态资源把 `index.html` 重定向到了 `/`，当前版本已关掉该行为。

**全网搜拿不到链接**  
到「账号管理」检查夸克 Cookie 和临时目录；加密模式需在前台走「获取链接」。

**转存一直没结果**  
到 Queues 确认消费者已挂上；看后台「资源日志」；付费计划更稳。

**百度 / 阿里提示未完全移植**  
完整转存优先用夸克、UC；百度、阿里目前偏目录与校验。

**改了配置前台还是旧的**  
后台点 **清理缓存**。

**本地开发时定时任务不跑**  
正常；线上 Worker 的 Cron 才会按触发器跑。

**微信接入**  
当前验签简化，只适合联调；正式对外前需自行补全验签。

**Windows 上中文乱码**  
用 Cursor 打开文件确认是 UTF-8；迁库生成的 SQL 用 UTF-8 保存。

---

## 验收时在浏览器里勾这些

- [ ] 打开 `/health`，能看到成功且数据库为 true  
- [ ] 首页、搜索、详情能打开  
- [ ] `/qfadmin/` 能登录，概况页能改密码  
- [ ] 附件能上传，Logo 能显示  
- [ ] 夸克目录能浏览  
- [ ] 全网搜有内容刷出  
- [ ] `/sitemap.xml` 里是正式域名  
- [ ] 故意填错 `api_key` 会被拒绝  

更细的对齐说明见 [PARITY.md](./PARITY.md)。
