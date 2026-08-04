# EdgeOne 精简版（资源姐搜索）

本目录是 **独立部署包**，不修改仓库里 Cloudflare Worker 原文件。

品牌默认名：**资源姐搜索**。上传包：`npm run pack` → `pansoso-edgeone-upload.zip`。

## 功能范围

| 功能 | 说明 |
|------|------|
| 首页搜索 | 居中搜索框；夸克 / 百度 / 迅雷切换；热榜（豆瓣/百度风云榜等，可换一批） |
| 全网搜 | SSE 拉线路；**金钱模式**结果 URL AES 加密；线路最多 3 路并行 |
| 验链 | 结果出齐后验前若干条；百度失效链（如分享取消）会剔除；前 8 条全挂则继续下一批 |
| 转存 | **夸克 / 百度 / 迅雷**完整转存后再分享；百度失败回退原链；提取码成功一般为 `6666` |
| 定时清理 | `edgeone.json` → 每天 03:00 清理临时转存；另有懒清理 |
| 后台 `/qfadmin/` | 线路 / 网盘 Cookie 与目录 / 屏蔽词 / 转存参数 / 导入示例线路 |

## 存储

全部业务数据落在 **EdgeOne Blob**（默认命名空间 `pansearch`），包括：

- `db/conf.json` 站点与 Cookie、网盘开关  
- `db/api_list.json` 全网搜线路  
- `db/admin.json` 管理员  
- `db/access/*` 登录会话  
- `db/temp/*` 临时转存资源  
- `db/hot/*` 热榜缓存  

**不需要** D1 / R2 / Queues。

## 目录

```
edgeone/
  edgeone.json
  package.json
  index.html            # 前台
  qfadmin/              # 管理端
  lib/                  # Blob / 搜 / 夸克·百度·迅雷转存 / 热榜 / 清理
  cloud-functions/
    api/[[default]].js  # /api/*
    api/ping.js
    cron/cleanup.js
  scripts/pack-upload.mjs
```

## 快速部署

```bash
cd edgeone
npm run pack
```

控制台 **直接上传** `pansoso-edgeone-upload.zip`，然后打开：

1. `/api/ping` → JSON  
2. `/api/blob-init` → 初始化 Blob  
3. `/qfadmin/` → 默认 `admin` / `Admin123!`（务必修改）  
4. 配置夸克/百度/迅雷 Cookie 与转存目录 → **导入示例线路**

详细步骤见 [`../edgeone-md/`](../edgeone-md/)。
