# 圈圈音源 (lx-quanquan-sources)

洛雪音乐（lx-music）自定义音源脚本合集，由圈圈编写与维护喵。

## 直接使用

**最终版：[`圈圈音源.js`](./圈圈音源.js)**，v14，oiapi 双平台解析。

在洛雪音乐的「自定义源」里导入该文件即可，脚本声明了 5 个音乐平台：酷我 `kw`、咪咕 `mg`、QQ `tx`、网易云 `wy`、酷狗 `kg`。

## 免责声明

**使用前必读：[DISCLAIMER.md](./DISCLAIMER.md)**

本仓库为个人技术学习与脚本留存用途，脚本不含任何音频文件，不提供破解或绕过付费的功能，按「现状」提供且不附带任何担保，使用风险由使用者自行承担，请遵守你所在地区的法律法规喵。

## 技术说明

- 后端接口：`https://oiapi.net/api/`，经 `lx.request` 调用，带 12s 超时兜底。
- 解析容错：`toObj`（字符串转对象）加 `pickUrl`（`data.url` → `url` → 正则匹配 `"url":"..."` → 裸链接）。
- 关键点：歌曲信息在 `payload.info.musicInfo` 里取 `name / singer / source / type`，不在顶层 `info`。
- 降级链：`[源平台+歌名歌手] → [另一平台+歌名歌手] → [源平台+纯歌名] → [另一平台+纯歌名]`，四级都失败才 reject `all failed`。
- 音质：`320k` 时把 URL 中的 `bitrate$128` 替换为 `bitrate$320`。

## 目录

| 路径 | 内容 |
| --- | --- |
| `圈圈音源.js` | 最终版 v14（与 `history/lx_v14.js` 逐字节一致） |
| `history/` | v3 到 v14 全部迭代版本 |
| `probes/` | 探针与打包文件（`lx_probe*.js`、`lx_bundle.js`） |
| `sources/` | 收集的第三方音源 |
| `sources/_upstream/` | 上游最新版快照 |
| `disable_list.json` / `targets.json` / `resolved.json` | 本地配置与解析结果 |

## 说明

本仓库仅为脚本留存与备份，不含任何音频文件；脚本可用性依赖上游接口，接口变动即可能失效喵。
