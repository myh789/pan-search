# 架构说明

## 目标

在 EdgeOne Pages 上跑「资源姐搜索」精简站：

- 前台搜索 + 热榜 + 夸克 / 百度 / 迅雷筛选  
- 全网搜 SSE（金钱模式加密 URL；线路有限并行）  
- 转存后分享（夸克 / 百度 / 迅雷）；百度失败回退原链  
- 临时资源 TTL + 定时 / 懒清理  
- `/qfadmin/` 后台  

**不做**：付费订单、卡密、代理、Telegram、多端原生 App（站点本身可在电脑 / 苹果 / 安卓 / 鸿蒙浏览器使用）。

## 请求路径

| 路径 | 处理 |
|------|------|
| `/`、`/index.html`、`/s.html` | 静态前台 |
| `/qfadmin/*` | 静态管理端 |
| `/api/*` | Cloud Function `api/[[default]].js` |
| `/cron/cleanup` | 定时 + 可手动触发清理 |

函数入口：`export default async function onRequest(context)`。

## 数据层

`lib/blob.js` + `@edgeone/pages-blob`，命名空间默认 `pansearch`。

| Key | 用途 |
|-----|------|
| `db/conf.json` | 站点名、金钱模式、Cookie、网盘开关与目录 |
| `db/api_list.json` | 全网搜线路 |
| `db/admin.json` | 管理员账号 |
| `db/access/{token}` | 登录会话 |
| `db/temp/{id}` | 临时转存（含 `create_time`） |
| `db/hot/{boardId}` | 热榜缓存 |

## 模块分工

| 文件 | 职责 |
|------|------|
| `lib/search.js` | 拉线路、解析 JSON/HTML；最多 3 路并行；去重后 SSE 下发 |
| `lib/pan.js` | 夸克验链 / 转存 / 分享；按 URL 分发到各盘 |
| `lib/pan-baidu.js` | 百度：验链（verify + list）、转存、二次分享；失败可回退原链 |
| `lib/pan-xunlei.js` | 迅雷；无 token 时跳过转存返回原链 |
| `lib/hot.js` | 热榜抓取 + Blob 缓存 |
| `lib/cleanup.js` | 按 TTL 删临时资源与网盘文件 |
| `lib/db.js` | 默认配置、示例线路种子（百度/迅雷仅 JSON）、读写封装 |

## 前台流程（简）

1. 输入关键词 → SSE 全网搜（按当前网盘类型筛线路）。  
2. 结果**扁平列表**展示（不显示线路分组）；金钱模式点「获取资源」走转存。  
3. 验链：有效标「有效」，失效剔除；一批全挂则继续下一批。  
4. 转存成功：弹层展示自有分享链（百度提取码多为 `6666`）；百度失败则回退原链（提取码仍为原链的）。

## 百度链路要点

| 步骤 | 说明 |
|------|------|
| 验链 | 不强制完整登录；`/share/verify` 后必须以 `/share/list` 为准（已取消分享 verify 仍可能成功） |
| surl | API 常用去掉 `/s/` 后开头的 `1` |
| 转存 | Cookie 须含 **BDUSS**；目录为路径如 `/转存` |
| 二次分享 | 只用网盘目录里的真实 `fs_id`（勿用分享侧 id，否则易 errno `-3`） |
| 失败 | `original: true` 回退原链；不入临时库 |

## 与 CF 版差异

- 无 D1 / R2 / Queues，会话与配置均在 Blob。  
- 本包自带前台与 `qfadmin`。  
- 已完整接夸克 / 百度 / 迅雷。  
