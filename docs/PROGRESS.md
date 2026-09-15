# grok-bot-tcd 进度看板

> 导出时间：2026-09-14 20:36（本地）  
> 更新位置：本文件（仓库 `docs/PROGRESS.md`）  
> 总册：`docs/GROK-BOT-TCD-运营手册.md`

---

## 0. 一句话状态

**对话已通（ChainFuel `grok-4.6`）。Computer 在 mason1 上在线。openrouter 跳过 Cursor Sign in。WebSearch 已改本地 HTTP（C2）。公网出站仍半通。**

---

## 1. 目标拆解

| 目标 | 状态 | 证据 / 备注 |
|------|------|-------------|
| Intel Mac 可跑 grok-bot-tcd | ✅ | `/Applications/grok-bot-tcd.app` + Intel UserData |
| Computer 自建（不官方 anyrun） | ✅ | mason1 `grok-bot-local-vm` + SSH 隧道 |
| 推理走私有 ChainFuel | ✅ | openrouter → `https://chainfuel.tap365.org/v1`，`grok-4.6` |
| 多轮中文对话 | ✅ | UI 有完整回复；openrouter requests≥6 |
| 无回复 / accepted-awaiting-echo | ✅ 已修 | asar 曾写死 openrouter.ai；已改 ChainFuel/env |
| Disk Saver 黄条 | ⚠️ 仍在 | mason1 磁盘 ~88% / 剩 14G |
| 打开浏览器并上网 | ❌ | Chrome 组件在；海外 TLS 仍差 |
| WebSearch「搜百度新闻」 | ⚠️ 代码已落地 | C2 本地 search/fetch；需重启后的会话验收 W2 |
| 研究回调 / 自动剪辑 | 📋 设计 | 运营手册 §4，未实现代码 |
| 文档收敛到本仓库 | ✅ 进行中 | `docs/INDEX.md` 起 |

---

## 2. 已完成工作（按时间线）

### 2.1 客户端与 Computer

- [x] 重建包 / Intel shell（0.47 x64）+ reconstructed 逻辑  
- [x] 应用名 / 启动：`grok-bot-tcd`，`scripts/launch-mason1-computer.sh`  
- [x] mason1 部署：`~/grok-bot-computer`（host-main、tcd-host、gateway token）  
- [x] Mac ↔ mason1 端口转发：1340 gateway，6080/6081 noVNC，1337 exec-daemon  
- [x] 健康检查：`GET /health` + Bearer token  

### 2.2 推理

- [x] `inferenceProvider=openrouter`  
- [x] `tcd-inference.env`：`OPENROUTER_*` / `SAND_OPENROUTER_*` → ChainFuel  
- [x] Mac `sand-secrets.json` 持久化 `OPENROUTER_API_KEY`  
- [x] launch 脚本同步官方 secrets 时 **保留** OpenRouter key  
- [x] **关键修复**：打包 `app.asar` 硬编码 `https://openrouter.ai/api/v1` → 读 env / ChainFuel  
  - 备份：`/tmp/grok-bot-tcd-app.asar.bak-*`  
- [x] 容器内 / Mac 直打 ChainFuel completions → 200  

### 2.3 会话与卡死

- [x] 清理失败 outbox（`accepted-awaiting-echo`）  
- [x] 重启 container 清 busy  
- [x] active agent 切到可用会话；旧会话标 Archive  
- [x] 清 disk-pressure episode（仍可能因 88% 再触发 Disk Saver）  

### 2.4 文档

- [x] `docs/GROK-BOT-TCD-运营手册.md`  
- [x] `docs/INDEX.md` / `PROGRESS.md` / 浏览器与 WebSearch 专题（本轮）  

---

## 3. 进行中 / 阻塞

### 3.1 浏览器与搜网页（当前 P0 阻塞）

| 子问题 | 状态 | 说明 |
|--------|------|------|
| Chrome 二进制 + Xvfb + noVNC | ✅ 有 | 右侧能看到 Chrome 图标 |
| 容器 curl 百度 | ⚠️ 半通 | 时常 200，不稳定 |
| 容器 curl example.com / google | ❌ | 宿主机同样失败（非仅 Docker） |
| mason1 Clash | ⚠️ 在跑 | `/usr/local/bin/clash`，`*:7890`，API `*:9090` v1.18.0 |
| 经 Clash 访问海外站 | ❌ 差 | CONNECT 能建，TLS 常 reset；节点/规则可能坏 |
| WebSearch 工具 | ⚠️ 已改绑定 | openrouter → `local-web-tools`（百度/DDG HTML；可选 Brave/Serper/Tavily） |
| 顶栏 re-authenticate | ⚠️ | Cursor 凭证仍可能提示其它云功能；WebSearch 不再依赖它 |
| `browserEnabled` 日志 | ⚠️ | 运行镜像 `browserEnabled:false`；重建 daemon `computerUseSupported:false` |
| 本地 WebSearch 实现（openrouter 分支） | ✅ 源码+运行态 | `local-web-tools.ts` + mason1 `tcd-host/host-main.cjs` |

### 3.2 磁盘

- mason1：`/` 约 **91G/109G（88%）**  
- 触发 Disk Saver Agent + 黄条  
- 未授权清理大目录（docker-projects 等）  

### 3.3 业务扩展

- 回调 API / 剪辑入队：仅设计，无代码落地  

---

## 4. 下一步（建议顺序）

```
P0-1  文档与进度已收敛本仓库
P0-2  WebSearch C2 已落地（源码 + mason1 host-main）；待 UI 会话验收「搜百度新闻」
P0-3  修出站：评估 mason1 Clash 节点；或 ChainFuel 侧挂代理给 box 用
P0-4  Shell curl 兜底：openrouter system prompt 已写「失败用 curl 读国内页」
P0-5  磁盘降到压力线以下，减少 Disk Saver
P1    computer-use / browserUse 真桌面演示
P1    研究 JSON → HMAC 回调 → 剪辑 queue
```

### 关于 Clash（用户问：有用吗）

**有用，但是「出口基础设施」，不是「搜网页工具」本身。**

- Clash 在 mason1 上 **进程在、7890 监听**，容器经 `172.17.0.1:7890` 能打到代理。  
- 经 Clash 访问海外站 **TLS 经常被重置** → 节点/订阅质量问题，不是「没挂代理」。  
- 百度等直连往往比 Clash 更稳。  
- **即使 Clash 完美，WebSearch 黄三角仍会在**：工具调的是 Cursor 云，不是 box 出站。  

详见：`docs/BROWSER-EGRESS-AND-CLASH.md`。

### 关于 ChainFuel 内部挂代理（用户提示）

可行方向：

1. box / host 的 `HTTP_PROXY` 指向 ChainFuel 提供的代理入口（若已有）；或  
2. 本地 WebSearch/WebFetch 服务部署在能出网的节点，由 host-main 调用；或  
3. 搜索 API 走 ChainFuel 兼容层（若产品侧提供）。  

需与 ChainFuel 实际代理协议（HTTP/SOCKS、鉴权）对齐后再写死配置。

---

## 5. 运行态快照（2026-09-14 20:36）

| 项 | 值 |
|----|-----|
| App | grok-bot-tcd 已安装 |
| Mac settings | openrouter / grok-4.6 / maxMode true / egressTunnel false |
| openrouter 请求计数 | ≥6 |
| mason1 容器 | `grok-bot-local-vm` Up |
| 磁盘 | 88%，剩 14G |
| Clash | pid 1415，7890+9090 listen |
| 隧道 | 依赖 `launch-mason1-computer.sh` |

### 常用命令

```bash
# 启动
cd /Users/houzi/code/06-production-business-money-live/grok-bot-0.18-reconstructed
./scripts/launch-mason1-computer.sh

# health
TOKEN=$(python3 -c 'import json;print(json.load(open(
  "/Users/houzi/Library/Application Support/Grok Bot Reconstructed Intel/sand-data/local-docker-vm.json"
))["token"])')
curl -sS -H "authorization: Bearer $TOKEN" http://127.0.0.1:1340/health
```

---

## 6. 风险与回滚

| 变更 | 回滚 |
|------|------|
| app.asar ChainFuel 补丁 | 从 `/tmp/grok-bot-tcd-app.asar.bak-*` 还原 |
| launch 脚本保留 OR key | git 还原 `scripts/launch-mason1-computer.sh` |
| mason1 tcd-host bind | 去掉 mount，回镜像内 host-main |
| 容器 env / 代理注入（若后续做） | 去掉 env，docker restart |
| mason1 host-main C2 补丁 | `~/grok-bot-computer/tcd-host/host-main.cjs.bak-*` 还原后 `docker restart grok-bot-local-vm` |

---

## 7. 协作记录（多 AI）

| 角色 | 结果 |
|------|------|
| 主 Agent（本会话） | 部署、推理修复、探测、文档 |
| explore 子 Agent | WebSearch 绑 Cursor 云的完整调用链（见 WEBSEARCH 文档） |
| Codex/Turing/gchat | 本轮工具不可用或输出无效；未采纳 |
| Claude Code 复核 | 本机 CLI 不可用；以本地探测+源码阅读验收 |

---

## 8. 变更日志（文档）

| 日期 | 项 |
|------|-----|
| 2026-09-14 | 初版运营手册 |
| 2026-09-14 | INDEX / PROGRESS / BROWSER-CLASH / WEBSEARCH 专题；进度导出本仓库 |
| 2026-09-14 | C2 本地 WebSearch/WebFetch：`local-web-tools.ts` + production 分流；mason1 host-main 热补丁 |
