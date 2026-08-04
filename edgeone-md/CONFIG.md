# 配置项说明

## 环境变量

| 变量 | 默认 | 说明 |
|------|------|------|
| `ADMIN_BOOTSTRAP_PASSWORD` | `Admin123!` | 首次无管理员时写入的密码 |
| `ENCRYPT_KEY` | 内置示例 | AES 密钥（建议自定义，约 32 字符） |
| `ENCRYPT_IV` | 内置示例 | AES IV（建议自定义，16 字符） |
| `CRON_SECRET` | 空 | 非空则清理接口需校验 |
| `BLOB_STORE_NAME` | `pansearch` | Blob 命名空间 |
| `PAGES_PROJECT_ID` | — | 直接上传部署时 **必填**（控制台项目 ID） |
| `PAGES_BLOB_DEPLOY_CREDENTIAL` / `EDGEONE_API_TOKEN` | — | 直接上传时 **必填**（API Token） |

## 后台「转存参数」

| 字段 | 含义 |
|------|------|
| `is_quan_type=0` | **金钱模式**：SSE 加密 URL，前端调 `save_url` 再展示 |
| `is_quan_type=1` | 直链模式：直接展示第三方 URL（不转存） |
| `is_quan_zc=1` | 出结果前先验链（更慢、耗 Cookie） |
| `temp_source_ttl` | 临时资源保留分钟数，超时由 cron / 懒清理删除 |
| `sitename` | 站点名（默认「资源姐搜索」） |

## 网盘开关（conf）

| 字段 | 说明 |
|------|------|
| `enable_quark` / `enable_baidu` / `enable_xunlei` | `1` 启用前台对应标签 |

## Cookies / 目录字段

| 字段 | 用途 |
|------|------|
| `quark_cookie` | 夸克 Cookie（转存必需） |
| `quark_file` / `quark_file_time` | 正式 / 临时目录 **fid** |
| `baidu_cookie` | 百度 Cookie，须含 **`BDUSS=`**（仅 `ab_sr` 不够） |
| `baidu_file` / `baidu_file_time` | 百度转存目录 **路径**，如 `/转存`、`/临时` |
| `xunlei_cookie` | 迅雷 `refresh_token`；失效则跳过转存、直接原链 |
| `Authorization` / `ali_drive_id` / `uc_cookie` | 可存，转存未接完整 |

后台「测试登录」会校验百度 Cookie 是否含 BDUSS。

## 线路字段（api_list）

| 字段 | 说明 |
|------|------|
| `type` | `0` JSON API；`1` HTML 抓取（**仅夸克建议用**；百度/迅雷只用 `0`） |
| `pantype` | 0 夸克 · 1 阿里 · 2 百度 · 3 UC · 4 迅雷 |
| `url` | 可含 `{keyword}` |
| `fixed_params` / `field_map` / `headers` | JSON 字符串；`field_map` 建议含 `url`/`title`/`password`/`datetime` |
| `count` / `weight` / `status` | 条数、权重、启用 |

点后台 **「导入示例线路」** 会写入默认 JSON 线路；百度/迅雷侧会清掉 HTML 线路。详见 [SEARCH-LINES.md](./SEARCH-LINES.md)。

## edgeone.json 定时

免费套餐 **最小间隔 1 天**。

```json
{
  "schedules": [
    {
      "name": "temp-source-cleanup",
      "cron": "0 3 * * *",
      "path": "/cron/cleanup",
      "method": "POST",
      "timezone": "Asia/Shanghai"
    }
  ]
}
```

每天 03:00（上海时区）清理；另有少量懒清理。修改后需重新部署。
