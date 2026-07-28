# 功能对齐与已知限制

> 更新日期：2026-07-27

完整功能对照表见 **[FEATURES.md](./FEATURES.md)**（前台 / 转存 / Open API / 后台 / 置顶 / AI 逐项清单）。

## 冒烟命令

需先 `npx wrangler dev`：

```bash
npm run smoke
npm run smoke:ui
npm run smoke:sitemap
```

## 已对齐（主要）

| 模块 | 状态 |
|------|------|
| 前台首页 / 搜索 / 详情 / sitemap（原版 DOM + CSS，侧栏热榜 / 相关资源 / 全网搜 UX） | ✅ |
| 本地搜索三模式、屏蔽词、SEO 伪静态 `.html`、iconfont、扫码弹窗声明 | ✅ |
| 全网搜 SSE（api/html/tg/kk）+ 加密链 + save_url（含 urldecode） | ✅ |
| 临时资源 TTL 可配（`temp_source_ttl`，默认 30 分钟） | ✅ |
| 后台布局：顶栏「概况/资源/系统/配置」+ 左侧子菜单 + 用户下拉 | ✅ |
| 后台资源：添加/编辑/**置顶**/批量删除/表格导入/批量导入（直接入库 / 转存分享） | ✅ |
| **Agnes AI** 一键填充关键词标签 / 资源介绍（已有不覆盖） | ✅ |
| 分类 / 线路（含推荐预设）/ 账号 / 附件 / 用户组 / 改密 / 改资料 / 清缓存 / 访问日志 | ✅ |
| **网盘转存：夸克、UC、百度、阿里、迅雷（转存后重新分享）** | ✅ |
| **Open API `/api/open/transfer` 默认同步返回分享链**（`async=1` 才进队列） | ✅ |
| Cron、CORS、`/health`、`robots.txt` | ✅ |
| 微信 / Chatbot 回调入口 | ⚠️ 可用但能力简化 |
| D1 读优化：stats / conf / 分类 / 线路 KV、同请求 conf 复用、bootstrap 短路 | ✅ |
| **本地搜索 KV 精简索引**（脏标记 + Cron/清缓存重建；无索引回退 D1 LIKE） | ✅ |

## 转存说明（核心）

| 网盘 | 配置 | 行为 |
|------|------|------|
| 夸克 | `quark_cookie` + 目录 fid | 完整：校验 → 转存 → 清广告 → 再分享 |
| UC | `uc_cookie` + 目录 | 完整对齐 |
| 百度 | `baidu_cookie` + 目录路径 | 完整：验证码 → 转存 → 清广告 → 再分享（提取码默认 `6666`） |
| 阿里 | `Authorization`(refresh_token) + `ali_drive_id` + 目录 | 完整：copy → create share |
| 迅雷 | `xunlei_cookie`(refresh_token) + 目录 | 转存 + 轮询任务 + 尽量重新分享 |

后台「批量导入 → 转存分享导入」与 Open API 均走同一套 `transferUrl`。

Open API 字段：`api_key`、`url`、`code`、`isType`（1=只校验）、`expired_type`、`isSave`（1=入库）、可选 `async=1` 异步队列。

## AI 填充（CF 增强）

| 项 | 说明 |
|----|------|
| 模型 | 默认 `agnes-2.5-flash`（[文档](https://agnes-ai.com/zh-Hans/docs/agnes-25-flash)） |
| 配置位置 | 基础设置 → **AI设置**；或 Secret `AGNES_API_KEY`（优先） |
| 行为 | 仅补空的 `description` / `vod_content`；批量上限 20 |
| API | `POST /admin/source/aiFill`（未配 Key 时直接报错说明，不再静默全跳过） |
| 注意 | D1 迁移只建配置项，**不写入密钥**；配完 Key 后点「清理缓存」 |

## 近期迁移（上线前 apply）

| 文件 | 内容 | 网页操作 |
|------|------|----------|
| `0005_temp_source_ttl.sql` | 临时资源保留分钟数 | D1 Console 执行对应 INSERT |
| `0006_source_top_ai.sql` | `is_top` + AI 配置项 | D1 Console 执行 ALTER + AI INSERT |

终端：

```bash
npx wrangler d1 migrations apply pan-search --remote
```

纯网页逐步 SQL 见 [DEPLOY-CLOUDFLARE.md](./DEPLOY-CLOUDFLARE.md) **第五步 → 做法 B**。

## 还缺 / 偏弱

| 项 | 说明 |
|----|------|
| 微信公众号验签 | 简化逻辑，生产需加固 |
| Chatbot | 缺 AES 解密与搜剧/全网搜指令 |
| 菜单 RBAC 拦路由 | 授权可勾，侧栏仍按固定结构 |
| 参数/菜单节点增删 CRUD | 列表与改值已有；完整增删节点未做 |
| 短信 | 占位 |
| 前台 Vue/Element Plus 原库 | 未引入完整依赖；DOM/CSS/交互已按原版 1:1 还原 |

## 默认值（上线必改）

| 项 | 默认 | 操作 |
|----|------|------|
| 管理员 | `admin` / `Admin123!` | 系统 → 修改密码 |
| `api_key` | `change-me` | 基础设置修改 |
| `ENCRYPT_KEY` | 示例值 | vars/secret 修改 |
| Agnes AI | 未配置 | 基础设置 → AI设置，或 `wrangler secret put AGNES_API_KEY` |

部署步骤见 [DEPLOY-CLOUDFLARE.md](./DEPLOY-CLOUDFLARE.md)。
