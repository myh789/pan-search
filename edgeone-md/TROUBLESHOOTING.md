# 排障

## 部署失败 / 函数 500

1. 确认项目 Root 是 **`edgeone`**，不是仓库根。  
2. 看构建日志是否安装了 `@edgeone/pages-blob`。  
3. `edgeone.json` → `cloudFunctions.nodejs.includeFiles` 需包含 `lib/**`。  
4. `maxDuration` 建议 ≥ 60（转存轮询可能较久）。

## Blob 控制台一直空 / 未创建

1. 控制台 **不能手动创建**，必须 SDK 写入后自动出现。  
2. 部署后打开：`https://域名/api/blob-init`  
3. 成功应见 `code: 200` 与 `setJSON` 步骤；再回 **存储 → Blob** 刷新。  
4. 若返回 HTML/404：部署根目录不对，`/api` 没进 Cloud Functions。  
5. 若 `Cannot find module '@edgeone/pages-blob'`：检查 `edgeone/package.json` 依赖并重新部署。  
6. 直接上传缺 Token：配齐 `PAGES_PROJECT_ID` + `PAGES_BLOB_DEPLOY_CREDENTIAL` 后重新部署。

## 后台登录报「接口返回非 JSON」且预览是 `<!DOCTYPE html>`

说明 `/api/admin/login` **没有进 Cloud Functions**，回落成了首页静态页。

1. 打开 `https://你的域名/api/ping`  
   - 仍是首页 → Root Directory = `edgeone`，产物含 `cloud-functions/`  
   - 是 JSON → 再开 `/api/blob-init`，然后登录  
2. 函数入口须为 `export default async function onRequest(context)`。  
3. 默认账号 `admin` / `Admin123!`；硬刷新后再试。

## `/api/health` 报 Blob 相关错误

- 确认走的是 **Cloud Functions**，不是纯静态。  
- Blob 在 Functions 内免密；本地脚本访问需 `projectId` + `token`。

## 全网搜无结果 / 百度线路很少

- 后台是否有启用线路；是否点过 **「导入示例线路」**。  
- 百度/迅雷应只有 JSON；HTML 会被导入逻辑清掉。  
- 先用浏览器直接打开线路 URL 验证。  
- 是否命中「关键词屏蔽」。

## 验链：失效链仍显示「有效」

- **百度**：必须以 `/share/list` 为准；已取消分享时 verify 仍可能成功（如 errno `-21`）。  
- 当前版已按 list 判定；若线上仍误判，请重新上传最新 zip。  
- 前若干条全挂会继续检下一批，不是只检一批就停。

## 转存失败

### 通用

- Cookie / token 是否过期（后台「测试登录」）。  
- 正式 / 临时目录是否配置正确。  
- 函数地域建议大陆（如 `ap-guangzhou`）。

### 夸克

- `quark_cookie`、`quark_file`、`quark_file_time`（fid）。

### 百度

| 现象 | 处理 |
|------|------|
| 一直回原链 / `original: true` | 看 toast 或接口 `message`；常见是 Cookie 无效、目录不对、会员/风控 |
| Cookie 无效 | 须含 **`BDUSS=`**；后台「测试登录」应通过 |
| 二次分享死链 / errno `-3` | 应用网盘目录真实 `fs_id`（勿用分享侧 id）；已修复请重部署 |
| 成功标志 | 弹窗提取码多为 **`6666`**（原链回退则是原提取码如 `dS8m`） |
| 网盘里旧文件夹 | 旧版转存遗留，不能当作当前版成功证据 |

### 迅雷

- token 失效：**不验链、不转存**，直接返回原链（预期行为）。

## 复制按钮无反应

- 部分环境 `clipboard` 会失败；已有 `execCommand` 回退。  
- toast 被挡：刷新最新前台；必要时看浏览器权限。

## Blob「Body has already been read」

- 配置读取应只读一次 body（text 再 `JSON.parse`）。重部署含 `lib/blob.js` 的包即可。

## 定时清理不跑

- 重新部署以同步 `schedules`。  
- 手动：`POST /cron/cleanup`（若配置了 `CRON_SECRET` 需带上）。  
- 后台「立即清理临时资源」。  
- 检查 `create_time` 与 `temp_source_ttl`。

## 与官方文档

- [Blob 存储](https://pages.edgeone.ai/zh/document/blob-storage)  
- [edgeone.json](https://pages.edgeone.ai/document/edgeone-json)  
- [Cloud Functions](https://pages.edgeone.ai/document/cloud-functions)
