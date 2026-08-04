# 全网搜线路

## 原则

| 网盘 | 线路类型 |
|------|----------|
| 夸克 | JSON（`type=0`）或 HTML（`type=1`）均可 |
| **百度** | **只要 JSON**（PanSou / PanHunt 等），不要网页抓取 |
| **迅雷** | **只要 JSON** |

导入示例线路时，会清理百度 / 迅雷的 HTML 线路，并补齐默认 JSON 种子。

## 搜索行为

- 按当前前台网盘类型筛 `pantype` + `status=启用`  
- 最多 **3 路并行** 请求，降低总耗时  
- SSE 下发；金钱模式对 URL 做 AES  

## 默认百度 JSON（导入后）

种子来自 `lib/db.js` 的 `DEFAULT_BAIDU_LINES`，大致包括：

- PanSou / PanHunt 类：`all` / `plugin` / `tg` 等通道  
- 每条 `count` 约 20–25  
- `field_map` 映射 `url`、`title`、`password`、`datetime`  

同名同址线路再次导入可升级 `count` / `field_map` / `weight`，不会盲目重复堆叠。

## 自建线路示例（JSON）

```json
{
  "name": "示例百度 JSON",
  "type": "0",
  "pantype": "2",
  "url": "https://example.com/api/search?kw={keyword}&cloud_types=baidu",
  "count": 20,
  "weight": 10,
  "status": "1",
  "field_map": "{\"list\":\"data\",\"url\":\"url\",\"title\":\"title\",\"password\":\"password\",\"datetime\":\"datetime\"}"
}
```

HTML 线路仅建议用于夸克；百度/迅雷勿加。

## 部署后必做

重新上传 zip 后，后台打开 **全网搜线路 → 导入示例线路**，否则线上仍可能是旧的少量线路。
