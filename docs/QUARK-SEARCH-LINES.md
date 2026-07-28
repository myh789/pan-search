# 夸克全网搜线路手册（手动添加）

后台路径：**资源 → 接口配置 → 添加线路**。本页只作对照，**不内置到后台按钮**。

网盘类型选 **夸克网盘**（`pantype = 0`）。`{keyword}` 会自动替换成用户搜索词。

公共源可能随时失效，以你后台「试搜」为准。

---

## 一、JSON 接口（类型选「接口」）

通用填法：

| 字段 | 建议值 |
|------|--------|
| 类型 | `api` / 接口 |
| 方法 | `GET` |
| 请求地址 | 见下表 URL |
| 固定参数 | 见下表 |
| 字段映射 | `{"list":"data.merged_by_type.quark","title":"note","url":"url"}` |
| 返回条数 | `8`～`10` |
| 权重 | 数字越大越优先 |

### 1. PanHunt（推荐）

- 名称：`PanHunt夸克`
- URL：`https://s.panhunt.com/api/search`
- 固定参数：

```json
{"kw":"{keyword}","cloud_types":"quark","res":"merge","src":"all"}
```

### 2. PanHunt · 仅插件（偏国内插件源）

- 名称：`PanHunt插件夸克`
- URL：同上
- 固定参数：

```json
{"kw":"{keyword}","cloud_types":"quark","res":"merge","src":"plugin"}
```

### 3. so.252035

- 名称：`252035夸克`
- URL：`https://so.252035.xyz/api/search`
- 固定参数：

```json
{"kw":"{keyword}","cloud_types":"quark","res":"merge","src":"all"}
```

### 4. so.252035 · 仅插件

- 名称：`252035插件夸克`
- URL：同上
- 固定参数：

```json
{"kw":"{keyword}","cloud_types":"quark","res":"merge","src":"plugin"}
```

> `pansou.app` 经常不稳定，可不加。自建 PanSou 时 URL 换成你的域名 + `/api/search`，参数与上相同。

---

## 二、国内网页（类型选「网页」）

Worker 已识别 `alipansou.com` / `aipanso.com` 等列表页结构；HTML 解析字段可留空。

| 名称建议 | URL |
|----------|-----|
| 猫狸盘搜夸克 | `https://www.alipansou.com/search?k={keyword}&p=quark&s=0&t=-1` |
| AI盘搜夸克 | `https://aipanso.com/search?k={keyword}&p=quark&s=0&t=-1` |

- 方法：`GET`
- 条数：`10`
- 权重：可略低于 JSON 线路（例如 20～22）

---

## 三、TG 频道（类型选「TG频道」）

「地址」填**频道用户名**（不要带 `@` / 完整 URL）：

| 名称建议 | 地址（频道名） |
|----------|----------------|
| TG-QuarkShare | `Quark_Share_Channel` |
| TG-NewQuark | `NewQuark` |
| TG-ypquark | `ypquark` |

条数建议 `6`，权重可低于网页源。

---

## 四、KK（类型选「KK」）

| 名称建议 | URL |
|----------|-----|
| KK夸克 | `https://m.kkkba.com` |

方法一般用 `POST`，条数 `8` 左右。

---

## 五、建议优先级（权重示例）

1. PanHunt / 252035（`src=all`）— 30 / 26  
2. 同上插件源 — 28 / 24  
3. 猫狸 / AI盘搜 — 22 / 20  
4. TG — 10～14  
5. KK — 8  

可多开几条备用；全网搜会按权重与开关选用。

---

## 六、自检

1. 保存线路后点后台试搜（夸克）  
2. 前台搜一个冷门词，切到「全网搜」看是否刷出结果  
3. 某条长期无结果 → 关掉该线路或换源  

音乐 / 无损向线路（过滤词、音乐 TG 频道）见 [MUSIC-SEARCH-LINES.md](./MUSIC-SEARCH-LINES.md)。

相关部署步骤见 [DEPLOY-CLOUDFLARE.md](./DEPLOY-CLOUDFLARE.md)。
