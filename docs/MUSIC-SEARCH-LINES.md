# 音乐 / 无损网盘搜线路手册（手动添加）

后台路径：**资源 → 接口配置 → 添加线路**。本页只作对照，**不内置到后台按钮**。

用途：全网搜偏「歌手 / 专辑 / FLAC / 无损」这类结果。通用夸克源见 [QUARK-SEARCH-LINES.md](./QUARK-SEARCH-LINES.md)。

**重要**：添加时「搜索场景」选 **音乐**（`scene = 1`）。前台勾选「音乐」后只请求这些线路；不勾选则只走场景为「资源」的线路。

网盘类型一般选 **夸克网盘**（`pantype = 0`）。公共源会变，以后台「试搜」为准。

前台搜词建议：`歌手名`、`专辑名 flac`、`歌名 无损`（比只搜歌名更容易命中合集帖）。
首页搜索框左侧下拉选「资源 / 音乐」；结果页也可点「音乐搜」。选音乐会打开 `/s/关键词.html?music=1` 并只走音乐线路。

---

## 一、JSON 接口 · 带音乐向过滤（类型选「接口」）

字段映射统一：

```json
{"list":"data.merged_by_type.quark","title":"note","url":"url"}
```

方法：`GET`；条数：`8`～`10`。

### 1. PanHunt · 音乐过滤（推荐）

- 名称：`PanHunt音乐夸克`
- URL：`https://s.panhunt.com/api/search`
- 固定参数：

```json
{
  "kw": "{keyword}",
  "cloud_types": "quark",
  "res": "merge",
  "src": "all",
  "filter": "{\"include\":[\"flac\",\"FLAC\",\"无损\",\"wav\",\"APE\",\"HiFi\"],\"exclude\":[\"短剧\",\"影视\"]}"
}
```

### 2. so.252035 · 音乐过滤

- 名称：`252035音乐夸克`
- URL：`https://so.252035.xyz/api/search`
- 固定参数：同上（只换 URL）

### 3. PanHunt · 指定音乐相关 TG 频道

- 名称：`PanHunt音乐TG夸克`
- URL：`https://s.panhunt.com/api/search`
- 固定参数：

```json
{
  "kw": "{keyword}",
  "cloud_types": "quark",
  "res": "merge",
  "src": "tg",
  "channels": "Lossless_Yinyue,FLMdongtianfudi,baicaoZY,QuarkFree,leoziyuan,yydf_hzl,jxwpzy"
}
```

> `channels` 为英文逗号分隔的**频道用户名**（不要 `@`）。可按试搜结果增删。

### 4. 仅插件源（国内插件偏多）

- 名称：`PanHunt音乐插件`
- URL：`https://s.panhunt.com/api/search`
- 固定参数：

```json
{
  "kw": "{keyword}",
  "cloud_types": "quark",
  "res": "merge",
  "src": "plugin",
  "filter": "{\"include\":[\"flac\",\"无损\",\"音乐\"],\"exclude\":[]}"
}
```

---

## 二、TG 频道直连（类型选「TG频道」）

「地址」只填频道名。偏音乐 / 无损合集，可多开几条：

| 名称建议 | 地址（频道名） | 备注 |
|----------|----------------|------|
| TG-无损音乐 | `Lossless_Yinyue` | 夸克无损专题 |
| TG-FLM资源 | `FLMdongtianfudi` | 常有无损合集帖 |
| TG-百草资源 | `baicaoZY` | 合集 / 专辑包较多 |
| TG-QuarkFree | `QuarkFree` | 含 SACD / 无损条目 |
| TG-leoziyuan | `leoziyuan` | 杂资源含音乐 |
| TG-一亩地 | `yydf_hzl` | 杂资源含音乐 |
| TG-精选网盘 | `jxwpzy` | 偶发车载 / HiFi 合集 |

- 条数：`6`～`8`
- 权重：可低于 JSON（例如 12～18）

通用夸克频道（`Quark_Share_Channel` 等）也会夹带 `#音乐` / `#无损音乐` 标签，可按需另加，见夸克手册。

---

## 三、国内网页（类型选「网页」）

与夸克手册相同站点，靠**搜词带 flac/无损**筛结果即可：

| 名称建议 | URL |
|----------|-----|
| 猫狸盘搜音乐 | `https://www.alipansou.com/search?k={keyword}&p=quark&s=0&t=-1` |
| AI盘搜音乐 | `https://aipanso.com/search?k={keyword}&p=quark&s=0&t=-1` |

方法 `GET`，条数 `10`，权重约 `16`～`20`。

---

## 四、建议权重（示例）

1. PanHunt / 252035 + `filter` 音乐词 — 28 / 26  
2. PanHunt 指定音乐 TG `channels` — 24  
3. 插件 + filter — 22  
4. 网页源 — 18  
5. 单个音乐 TG — 12～16  

可与普通夸克线路并存；用户搜「周杰伦 flac」时多源一起出结果。

---

## 五、自检

1. 后台试搜关键词：`周杰伦 flac` 或 `无损音乐`  
2. 看返回标题是否带 FLAC / 无损 / 专辑字样  
3. 某频道长期空结果 → 关掉或从 `channels` 里去掉  
4. `filter` 过严会无结果，可先去掉 `exclude` 再试  

相关： [QUARK-SEARCH-LINES.md](./QUARK-SEARCH-LINES.md) · [DEPLOY-CLOUDFLARE.md](./DEPLOY-CLOUDFLARE.md)
