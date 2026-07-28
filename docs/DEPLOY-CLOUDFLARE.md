# Cloudflare 部署教程（点哪填哪）

本教程按 **网页点击 + 改配置文件** 说明如何把本仓库的 Cloudflare 版上线。  
原 ThinkPHP 代码仍在仓库里，仅作对照，**不要**往 Cloudflare 上传那套 PHP。

相关说明：

- [FEATURES.md](./FEATURES.md) — 功能清单对照（含置顶 / AI）  
- [PARITY.md](./PARITY.md) — 功能对齐与已知限制  
- [mysql-to-d1.md](./mysql-to-d1.md) — 旧站数据迁移  

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
| `AGNES_API_KEY` | （可选）Agnes AI 密钥；优先于后台「AI设置」里的 Key |

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

> 之后每次仓库新增迁移（如 `0005_temp_source_ttl`、`0006_source_top_ai`），上线前都要再执行一次  
> `npx wrangler d1 migrations apply pan-search --remote`。  
> `0006` 会加资源置顶列，并写入 AI 配置项（Agnes）。

### 做法 B：在 D1 网页控制台手工执行 SQL（适合不想用终端）

1. 打开 [控制台](https://dash.cloudflare.com) → **Workers 和 Pages**（或 **存储与数据库**）→ **D1**  
2. 点开数据库 **`pan-search`**  
3. 点 **控制台** / **Console**  
4. **首次建站**：按文件名从小到大，把 `drizzle/migrations/` 里每个 `.sql` 整份粘贴执行（`0000` → `0001` → …）  
5. **已在线、只需补 0005/0006**（置顶 + AI + 临时 TTL）：下面 SQL **一条一条**执行；若提示列已存在 / duplicate，跳过该条即可。

#### B1. 置顶字段（缺了会导致后台资源列表空白）

```sql
ALTER TABLE source ADD COLUMN is_top INTEGER NOT NULL DEFAULT 0;
```

```sql
CREATE INDEX IF NOT EXISTS idx_source_is_top ON source(is_top DESC, source_id DESC);
```

#### B2. AI 配置项（Key 留空，稍后在后台「AI设置」填写）

```sql
INSERT INTO conf (conf_key, conf_value, conf_title, conf_desc, conf_spec, conf_type, conf_status, conf_sort, conf_system, conf_createtime, conf_updatetime)
SELECT 'ai_enabled', '1', '启用 AI 填充', '开启后可在资源管理一键生成关键词标签与资源介绍（已有内容不覆盖）', 2, 5, 1, 99, 1, strftime('%s','now'), strftime('%s','now')
WHERE NOT EXISTS (SELECT 1 FROM conf WHERE conf_key = 'ai_enabled');
```

```sql
INSERT INTO conf (conf_key, conf_value, conf_title, conf_desc, conf_spec, conf_type, conf_status, conf_sort, conf_system, conf_createtime, conf_updatetime)
SELECT 'ai_base_url', 'https://apihub.agnes-ai.com/v1', 'AI Base URL', 'OpenAI 兼容接口根地址，默认 Agnes', 0, 5, 1, 98, 1, strftime('%s','now'), strftime('%s','now')
WHERE NOT EXISTS (SELECT 1 FROM conf WHERE conf_key = 'ai_base_url');
```

```sql
INSERT INTO conf (conf_key, conf_value, conf_title, conf_desc, conf_spec, conf_type, conf_status, conf_sort, conf_system, conf_createtime, conf_updatetime)
SELECT 'ai_model', 'agnes-2.5-flash', 'AI 模型', '默认 Agnes 2.5 Flash', 0, 5, 1, 97, 1, strftime('%s','now'), strftime('%s','now')
WHERE NOT EXISTS (SELECT 1 FROM conf WHERE conf_key = 'ai_model');
```

```sql
INSERT INTO conf (conf_key, conf_value, conf_title, conf_desc, conf_spec, conf_type, conf_status, conf_sort, conf_system, conf_createtime, conf_updatetime)
SELECT 'ai_api_key', '', 'AI API Key', 'Agnes API Key；也可通过 wrangler secret put AGNES_API_KEY 注入（Secret 优先）', 0, 5, 1, 96, 1, strftime('%s','now'), strftime('%s','now')
WHERE NOT EXISTS (SELECT 1 FROM conf WHERE conf_key = 'ai_api_key');
```

```sql
UPDATE conf SET conf_content = '关闭=>0
开启=>1' WHERE conf_key = 'ai_enabled' AND (conf_content IS NULL OR conf_content = '');
```

#### B3. 临时资源 TTL（可选）

```sql
INSERT INTO conf (conf_key, conf_value, conf_title, conf_desc, conf_spec, conf_type, conf_status, conf_sort, conf_system, conf_createtime, conf_updatetime)
SELECT 'temp_source_ttl', '30', '临时资源保留时长', '全网搜转存后的临时文件与分享链接，超过该分钟数后自动删除网盘文件并软删库记录。建议 15～120，默认 30。Cron 每 10 分钟扫描一次。', 0, 1, 1, 5, 1, strftime('%s','now'), strftime('%s','now')
WHERE NOT EXISTS (SELECT 1 FROM conf WHERE conf_key = 'temp_source_ttl');
```

#### B4. 自检

```sql
SELECT COUNT(*) AS c FROM source WHERE is_delete = 0;
```

```sql
PRAGMA table_info(source);
```

结果里应能看到 `is_top` 列；`c` 应与前台资源数量大致一致。

> **不要**把 Agnes API Key 写进 D1 控制台公开展示的 SQL；到后台 **AI设置** 填写，或 Worker 机密里加 `AGNES_API_KEY`。

执行完 SQL 后：后台点一次 **清理缓存**，再刷新资源管理。

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
| 4 | **基础设置 → AI设置** | 填 Agnes API Key（模型默认 `agnes-2.5-flash`）；也可用终端 `npx wrangler secret put AGNES_API_KEY`（Secret 优先于后台） |
| 5 | **账号管理** | 至少填好夸克 Cookie 和目录 fid（主推夸克） |
| 6 | （可选）全网搜线路、`transfer_feed_url` 等 | 按需要填 |
| 7 | 点 **清理缓存** | 让新配置立刻生效；同时会**重建本地搜索 KV 索引** |

资源管理支持：**置顶**、**AI 智能填充**（只补空的关键词标签 / 资源介绍）。

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

### 用户需求

打开 **用户需求**：可单条删除或勾选后 **批量删除**。

### 基础设置

按 Tab 切换「基础 / SEO / 前端模版 / 搜索 / **AI设置** / 微信 / 上传 / 其他」；开关类为分段按钮，颜色可点色盘，图片可上传。点 **保存配置** 只保存当前 Tab。

**AI设置**（迁移 `0006` 后出现）：

| 配置项 | 说明 |
|--------|------|
| 启用 AI 填充 | 关闭后资源管理「AI」按钮不可用 |
| AI Base URL | 默认 `https://apihub.agnes-ai.com/v1` |
| AI 模型 | 默认 `agnes-2.5-flash` |
| AI API Key | Agnes 密钥；已保存时显示 `********`，不改请保持；也可用 `npx wrangler secret put AGNES_API_KEY`（Secret 优先） |

**搜索设置**中可改 `temp_source_ttl`（临时资源保留分钟数，默认 30）。

部署或更新后，请执行数据库迁移（至少含 `0004_conf_content`、`0005_temp_source_ttl`、`0006_source_top_ai`），开关文案与 AI/置顶能力才会完整。

### 资源置顶与 AI 填充

打开 **资源管理**：

- **置顶 / 取消置顶**：置顶资源在后台列表与前台搜索靠前  
- **AI / AI 智能填充**：按标题生成关键词标签与资源介绍；**已有内容不覆盖**；编辑弹窗也可点「智能填充」  

**使用 AI 前必须先配 Key**，否则会提示「未配置 AI API Key」（旧版可能显示「填充 0，跳过 N」）：

1. **系统 → 基础设置 → AI设置** → 填写完整 `sk-…` → 保存  
2. 或 Worker → **设置 → 变量和机密** → 添加 Secret `AGNES_API_KEY`  
3. 点 **清理缓存** 后再试  

| 提示 | 含义 |
|------|------|
| 未配置 AI API Key | Key 为空；按上面步骤填写 |
| AI 填充未启用 | `ai_enabled` 为关闭 |
| 关键词与介绍均已存在，跳过 | 该条两个字段都有内容，按设计不覆盖 |
| 填充成功 | 空字段已写入 |

模型文档：[Agnes 2.5 Flash](https://agnes-ai.com/zh-Hans/docs/agnes-25-flash)

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

开放转存可用任意能发「表单 POST」的工具（浏览器插件、Apifox 等），字段包括：

- `api_key`：后台基础设置中的密钥  
- `url`：分享链接  
- `code`：提取码（可选，也可写在 url 的 `pwd=` 里）  
- `isType`：`0` 转存分享（默认**同步**返回新分享链）；`1` 只校验不转存  
- `expired_type`：`1` 正式目录；`2` 临时目录  
- `isSave`：`1` 同时写入资源库  
- `async`：填 `1` 时才进队列异步（一般不用）

支持夸克 / UC / 百度 / 阿里 / 迅雷（需在「账号管理」配好 Cookie/Token 与转存目录）。

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

**百度 / 阿里转存失败**  
确认账号管理已填 Cookie/Token、目录，以及阿里 `ali_drive_id`；完整转存链路已实现，失败多为凭证或风控。

**改了配置前台还是旧的 / 本地搜索结果偏旧**  
后台点 **清理缓存**（会重建搜索 KV 索引）。资源刚导入后最多约 10 分钟由 Cron 自动重建；着急可手动清缓存。

**前台有「最新更新」，后台资源管理却是空的**  
多半缺 `is_top` 列。按本页「做法 B」执行 B1 两条 SQL，再清理缓存并刷新。若仍空：重新 `npm run deploy` 后重试。

**AI 显示「填充 0，跳过 N」或「未配置 AI API Key」**  
不是「已有内容」；请到 **基础设置 → AI设置** 填写 Agnes Key 并保存，再清理缓存。网页执行的迁移 SQL **不会**自动写入密钥。

**AI 提示未配置 Key / 置顶按钮无效**  
确认已执行 B1～B2（或 `0006` 迁移），并已部署最新 Worker。

**本地开发时定时任务不跑**  
正常；线上 Worker 的 Cron 才会按触发器跑。

**微信接入**  
当前验签简化，只适合联调；正式对外前需自行补全验签。

**Windows 上中文乱码**  
用 Cursor 打开文件确认是 UTF-8；迁库生成的 SQL 用 UTF-8 保存。

---

## 验收时在浏览器里勾这些

- [ ] 打开 `/health`，能看到成功且数据库为 true  
- [ ] 首页、搜索、详情能打开；「最新更新」有数据时，后台资源管理也能看到  
- [ ] `/qfadmin/` 能登录，概况页能改密码  
- [ ] 附件能上传，Logo 能显示  
- [ ] 夸克目录能浏览  
- [ ] 全网搜有内容刷出  
- [ ] D1 已有 `is_top`；资源可置顶  
- [ ] AI设置已填 Key；智能填充能写入空的关键词/介绍（已有字段不覆盖）  
- [ ] `/sitemap.xml` 里是正式域名  
- [ ] 故意填错 `api_key` 会被拒绝  

更细对照见 [FEATURES.md](./FEATURES.md)、[PARITY.md](./PARITY.md)。
