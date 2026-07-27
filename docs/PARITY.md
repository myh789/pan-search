# 功能对齐与已知限制

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
| 前台首页 / 搜索 / 详情 / sitemap（原版 CSS 结构） | ✅ |
| 本地搜索三模式、屏蔽词、SEO 伪静态 `.html` | ✅ |
| 全网搜 SSE（api/html/tg/kk）+ 加密链 + save_url | ✅ |
| 后台资源：添加/编辑/批量删除/表格导入/批量导入（直接入库 / 转存分享） | ✅ |
| 分类 / 线路 / 账号 / 附件 / 用户组 / 改密 / 改资料 | ✅ |
| **网盘转存：夸克、UC、百度、阿里、迅雷（转存后重新分享）** | ✅ |
| **Open API `/api/open/transfer` 默认同步返回分享链**（`async=1` 才进队列） | ✅ |
| Cron、CORS、`/health`、`robots.txt` | ✅ |
| 微信 / Chatbot 回调入口 | ⚠️ 可用但能力简化 |

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

## 还缺 / 偏弱

| 项 | 说明 |
|----|------|
| 微信公众号验签 | 简化逻辑，生产需加固 |
| Chatbot | 缺 AES 解密与搜剧/全网搜指令 |
| 菜单 RBAC 拦路由 | 授权可勾，侧栏仍写死 |
| 参数配置 CRUD / 访问日志页 | 管理增强项 |
| 短信 / iconfont | 占位或简化 |

## 默认值（上线必改）

| 项 | 默认 | 操作 |
|----|------|------|
| 管理员 | `admin` / `Admin123!` | 概况页改密 |
| `api_key` | `change-me` | 基础设置修改 |
| `ENCRYPT_KEY` | 示例值 | vars/secret 修改 |

部署步骤见 [DEPLOY-CLOUDFLARE.md](./DEPLOY-CLOUDFLARE.md)。
