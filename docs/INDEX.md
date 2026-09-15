# grok-bot-tcd 文档索引

> 仓库：`grok-bot-0.18-reconstructed`  
> 原则：本目录收敛 **部署、排障、进度、经验**；代码在 `source/`，脚本在 `scripts/`。

---

## 必读

| 文档 | 内容 |
|------|------|
| [PROGRESS.md](./PROGRESS.md) | **当前进度与未完成项**（先看这个） |
| [GROK-BOT-TCD-运营手册.md](./GROK-BOT-TCD-运营手册.md) | 为什么做、架构、能力、步骤、QA 总册 |
| [BROWSER-EGRESS-AND-CLASH.md](./BROWSER-EGRESS-AND-CLASH.md) | 浏览器/出站、mason1 Clash、探测证据 |
| [WEBSEARCH-AUTH-ROOT-CAUSE.md](./WEBSEARCH-AUTH-ROOT-CAUSE.md) | WebSearch 黄三角根因（OpenRouter ≠ 云搜索） |
| [经验摘要.md](./经验摘要.md) | 十句踩坑速查 |

## 仓库内其它文档

| 路径 | 内容 |
|------|------|
| [ARCHITECTURE.md](./ARCHITECTURE.md) | 早期架构笔记 |
| [ANDROID_REALTIME_ARCHITECTURE.md](./ANDROID_REALTIME_ARCHITECTURE.md) | Android 实时相关 |
| [PUBLISHING.md](./PUBLISHING.md) | 发布相关 |
| [../README.md](../README.md) | 项目 README |
| [../PROVENANCE.md](../PROVENANCE.md) | 来源/重建 provenance |
| [../SECURITY.md](../SECURITY.md) | 安全 |
| [../scripts/](../scripts/) | 启动与运维脚本（含 `launch-mason1-computer.sh`） |
| [../cases/](../cases/) | 案例与运行证据（若有） |

## 本机运行态（不在 git 时也要知道）

| 对象 | 路径 |
|------|------|
| Mac App | `/Applications/grok-bot-tcd.app` |
| UserData | `~/Library/Application Support/Grok Bot Reconstructed Intel` |
| 推理 env | `…/sand-data/tcd-inference.env` |
| mason1 Computer | `mason1:~/grok-bot-computer/` 容器 `grok-bot-local-vm` |
| asar 备份 | `/tmp/grok-bot-tcd-app.asar.bak-*` |

## 更新约定

1. 每完成一块能力（聊天 / 浏览器 / 回调），更新 `PROGRESS.md` 状态表。  
2. 重大排障写进对应专题文档，并在 `PROGRESS.md` 链过去。  
3. 密钥只写「存在哪里」，不写明文。
