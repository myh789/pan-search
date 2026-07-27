# MySQL → D1 迁移

从旧 ThinkPHP 站迁数据到 Cloudflare D1 时使用。部署步骤总览见 [DEPLOY-CLOUDFLARE.md](./DEPLOY-CLOUDFLARE.md)。

## 步骤

1. 在旧站导出 SQL（或按表 CSV）：

```bash
mysqldump -u USER -p DB_NAME \
  qf_source qf_source_category qf_api_list qf_conf qf_admin qf_group qf_node qf_auth \
  qf_access qf_attach qf_feedback qf_source_log qf_user qf_token qf_log qf_days \
  --no-create-info --complete-insert > dump.sql
```

2. 表名映射（去掉 `qf_` 前缀；`qf_group` → `groups`）：

| MySQL | D1 |
|-------|-----|
| qf_source | source |
| qf_source_category | source_category |
| qf_api_list | api_list |
| qf_conf | conf |
| qf_admin | admin |
| qf_group | groups |
| qf_node | node |
| qf_auth | auth |
| qf_access | access |
| qf_attach | attach |
| qf_feedback | feedback |
| qf_source_log | source_log |
| qf_user | user |
| qf_token | token |
| qf_log | log |
| qf_days | days |

3. 转换并导入：

```bash
# 表名/语法转换（保守替换，复杂转义请人工检查）
node scripts/convert-mysql-dump.js dump.sql > converted.sql

# 先应用 schema + 种子（若库已 migrate 可跳过）
npx wrangler d1 migrations apply pan-search --remote

# 导入前如与种子冲突：可先清空业务表，或去掉 converted.sql 里的 admin/分类/conf 插入
npx wrangler d1 execute pan-search --remote --file=./converted.sql
```

4. 导入后：后台登录 → **清理缓存**（或删除 KV：`site:conf`、`sitemap:xml`、`ranking:*`）。

## 注意

- 密码哈希算法与旧站一致（sha1 + salt）；管理员可直接迁，也可用默认 `admin` / `Admin123!` 后改密。
- 网盘 Cookie 等敏感配置迁完请在后台核对，不要提交到公开仓库。
- `ENCRYPT_KEY` / `ENCRYPT_IV` 若与旧站不一致，旧加密链接无法解密；生产请与旧站保持一致或全量重新加密。
