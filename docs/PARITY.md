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
| 后台登录验证码、改密、配置、分类、资源（添加/编辑/批量删除/表格导入/批量导入） | ✅ |
| 批量导入「直接导入」校验入库不转存；「转存分享导入」走队列转存 | ✅ |
| 账号管理分盘 Tab、附件 R2、用户组授权、资源日志、反馈 | ✅ |
| 夸克完整转存；UC 对齐；迅雷尽力转存 | ✅ |
| Open API、Cron 清理/热榜/日更、CORS、`/health`、`robots.txt` | ✅ |
| 微信 / Chatbot 回调入口 | ⚠️ 可用但验签简化 |

## 已知限制

| 项 | 说明 |
|----|------|
| 百度完整转存 | 列目录可用；转存返回明确「尚未完全移植」 |
| 阿里完整转存 | 需 `Authorization` + `ali_drive_id`；完整转存未完全移植 |
| 微信公众号 | `/api/wechat/serve` 签名校验简化，生产需加固 |
| 短信 | 占位接口 |
| iconfont | 前台用简易符号代替原版图标字体 |
| `SYSTEM_SALT` | 配置项存在；密码哈希使用每用户 `admin_salt` |

## 默认值（上线必改）

| 项 | 默认 | 操作 |
|----|------|------|
| 管理员 | `admin` / `Admin123!` | 概况页改密 |
| `api_key` | `change-me` | 基础设置修改 |
| `ENCRYPT_KEY` | `ABCD` | vars/secret 修改 |

部署步骤见 [DEPLOY-CLOUDFLARE.md](./DEPLOY-CLOUDFLARE.md)。
