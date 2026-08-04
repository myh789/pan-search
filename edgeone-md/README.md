# EdgeOne 精简版文档

对应目录：[`../edgeone/`](../edgeone/)（**资源姐搜索** · EdgeOne Pages + Blob）。

| 文档 | 内容 |
|------|------|
| [ARCHITECTURE.md](./ARCHITECTURE.md) | 架构、路由、转存与验链 |
| [CONFIG.md](./CONFIG.md) | 环境变量、Blob 配置项、网盘字段 |
| [DEPLOY.md](./DEPLOY.md) | 打包上传与上线检查 |
| [SEARCH-LINES.md](./SEARCH-LINES.md) | 全网搜线路（夸克可 HTML；**百度/迅雷仅 JSON**） |
| [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) | 常见故障（含百度验链/转存） |

仓库另有 Cloudflare 版文档在 [`../docs/`](../docs/)，与本目录无关。

## 产品能力摘要（2026-08）

- 前台品牌默认：**资源姐搜索**；夸克 / 百度 / 迅雷切换  
- 全网搜 SSE：线路最多 **3 路并行**；金钱模式 URL AES 加密  
- 验链：结果出齐后分批检测；失效剔除；百度以 `/share/list` 为准（分享取消等）  
- 转存：夸克 / 百度 / 迅雷；百度失败回退原链；成功二次分享提取码多为 `6666`  
- 热榜：豆瓣 / 百度风云榜等 + Blob 缓存；可换一批  
- 后台 `/qfadmin/`：Cookie、目录、线路、「导入示例线路」  
