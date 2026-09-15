# grok-bot-tcd 运营手册

> 版本：2026-09-14  
> 适用：Mac Intel 客户端 + mason1 自建 Computer + ChainFuel `grok-4.6`  
> 产品立场：在 ChatGPT 之后，Grok / Grok Bot 是最值得做成「可运营桌面智能体」的 AI 产品形态之一。  
> **文档入口**：[INDEX.md](./INDEX.md) · **进度**：[PROGRESS.md](./PROGRESS.md) · **浏览器/Clash**：[BROWSER-EGRESS-AND-CLASH.md](./BROWSER-EGRESS-AND-CLASH.md) · **WebSearch 根因**：[WEBSEARCH-AUTH-ROOT-CAUSE.md](./WEBSEARCH-AUTH-ROOT-CAUSE.md)

---

## 1. 为什么要这么做

### 1.1 产品判断

ChatGPT 证明了「对话即接口」。Grok Bot（桌面端 + Computer）往前多走了三步：

| 维度 | 普通聊天产品 | Grok Bot / grok-bot-tcd |
|------|--------------|-------------------------|
| 交互 | 浏览器 Tab | 原生桌面 App，常驻、可多 Agent |
| 执行面 | 几乎只有文本 | 远程 Linux 桌面 + 浏览器 + 工具链 |
| 模型主权 | 绑定厂商账号与配额 | 可换路由：Cursor / OpenRouter / 自建 ChainFuel |
| 业务接入 | 难二次封装 | 可做 webhook、队列、回调、剪辑流水线 |
| 数据边界 | 会话在云端 | Computer 与密钥可放在自己的机器上 |

所以「为什么要做 grok-bot-tcd」不是为了再做一个聊天窗口，而是为了：

1. **把 Grok 从「能聊」升级成「能干活」**（桌面、浏览器、脚本、媒体）。
2. **把推理入口收归自己**（ChainFuel），避免官方配额、地区、账号风控卡死。
3. **把 Computer 放在自己服务器**（mason1），不依赖官方 anyrun / 第三方托管。
4. **为后续业务留接口**：研究结论可回调、自动剪辑可入队、多 Agent 可编排。

### 1.2 为什么认为它是 ChatGPT 之后最好的 AI 产品形态

这不是「模型 benchmark 第一」的声明，而是 **产品形态** 判断：

1. **人机比更接近真实工作**：不是只吐字，而是能在一台「电脑」上点、看、搜、改。
2. **多 Agent 工作区**：Disk Saver、研究 Agent、剪辑 Agent 可以并行存在，而不是单线程一个 chat。
3. **可私有化路径清晰**：客户端壳 + 远程 box + 自选推理，三层可拆。
4. **与创作者/运营场景契合**：搜 X、读网页、整理信息、驱动下游剪辑/发布，比纯 Chat 更接近「助理」。
5. **可被工程化**：一旦对话稳定，就能挂 callback、队列、SOP，变成生产线，而不是玩具。

ChatGPT 仍是最强通用对话底座之一；Grok Bot 的价值在于 **把「助理」装进可操作的计算机里**。  
grok-bot-tcd 的目标，是把这条路径做成 **可重启、可验收、可扩展** 的私有部署。

### 1.3 本项目要解决的真实问题

历史踩坑（已部分修复）：

- Intel Mac 跑 arm64 包 → 用 0.47 x64 shell + reconstructed 逻辑。
- Mac 无 Docker → Computer 放到 mason1，SSH 端口转发。
- 官方 Computer / 登录依赖 → 自建 box + gateway token。
- 推理无回复 → 安装包曾 **写死** `openrouter.ai`，已改为 ChainFuel。
- Disk Saver / 低磁盘 → mason1 磁盘约 88%，系统自动开清盘 Agent（提示，不阻断聊天）。

---

## 2. 当前架构（事实快照）

```
┌──────────────────────────────┐
│  Mac：grok-bot-tcd.app       │
│  UserData: Grok Bot          │
│  Reconstructed Intel         │
│  inferenceProvider=openrouter│
│  model=grok-4.6              │
└──────────────┬───────────────┘
               │ SSH -L 1340/1337/… 
               │ launch-mason1-computer.sh
               ▼
┌──────────────────────────────┐
│  mason1：grok-bot-local-vm   │
│  gateway :1340               │
│  desktop Xvfb + noVNC        │
│  box-chrome / google-chrome  │
│  host-main（tcd 补丁）        │
└──────────────┬───────────────┘
               │ HTTPS
               ▼
┌──────────────────────────────┐
│  ChainFuel                   │
│  https://chainfuel.tap365.org│
│  /v1/chat/completions        │
│  model: grok-4.6             │
└──────────────────────────────┘
```

### 2.1 关键路径

| 角色 | 路径 / 入口 |
|------|-------------|
| 客户端 | `/Applications/grok-bot-tcd.app`（**不要**从 Finder 打开） |
| 用户数据 | `~/Library/Application Support/Grok Bot Reconstructed Intel` |
| 启动脚本 | `grok-bot-0.18-reconstructed/scripts/launch-mason1-computer.sh` |
| 官方 Grok Bot | `/Applications/Grok Bot.app` + `~/Library/Application Support/Grok Bot`（独立，禁止互拷 secrets） |

### 2.1.1 与官方 Grok Bot 并存（隔离）

| | 官方 | TCD |
|--|------|-----|
| App | `/Applications/Grok Bot.app` | `/Applications/grok-bot-tcd.app` |
| Bundle ID | `com.anysphere.sand` | `com.tcd.grok-bot` |
| 用户数据 | `~/Library/Application Support/Grok Bot` | `~/Library/Application Support/Grok Bot Reconstructed Intel` |
| 打开方式 | Finder / Dock | **只**用 `scripts/launch-mason1-computer.sh`（带 `--user-data-dir`） |
| Computer 端口 | 本机 Docker 若启用会占 1340 | mason1 隧道占 1340/1337/6080 |

不要同时开两套 Computer。不要从 Finder 点 TCD 或 `Grok Bot 0.18 Reconstructed Intel.app`。`launch-intel-macos.sh` 不是 TCD 入口。
| 推理环境 | `…/sand-data/tcd-inference.env`（`OPENROUTER_*` → ChainFuel） |
| 远程 Computer | mason1 容器 `grok-bot-local-vm` |
| 远程配置 | `~/grok-bot-computer/tcd-host/`（host-main、box-secrets、inference） |
| 隧道端口 | `1340` gateway，`6080/6081` noVNC，`1337` exec-daemon |

### 2.2 2026-09-14 验收基线

| 项 | 状态 |
|----|------|
| 多轮中文对话 | 已通（openrouter 请求计数已增长） |
| ChainFuel smoke | 容器与 Mac 均可 200 |
| gateway health | 隧道 `http://127.0.0.1:1340/health` → 200 |
| noVNC | 6080/6081 → 200 |
| 容器内 Chrome 二进制 | 存在（`box-chrome` / `google-chrome`） |
| 容器访问公网网页 | **当前失败**（example.com / baidu 连不上） |
| 容器访问 ChainFuel | **成功** |
| mason1 磁盘 | 约 **88% / 剩 14G**（会触发 Disk Saver 黄条） |
| `egressTunnelEnabled` | **false** |

---

## 3. Grok / Grok Bot 能做什么

分三层：**已验收**、**硬件具备但网络未通**、**业务扩展（你的研究方向）**。

### 3.1 已验收（P0）

1. **多轮对话**：中文问答、能力说明、连续追问。  
2. **自选模型路由**：OpenRouter 兼容协议 → ChainFuel → `grok-4.6`。  
3. **远程 Computer 在线**：gateway + 虚拟桌面进程存活。  
4. **多 Agent 侧边栏**：可新建会话；系统可自动生成 Disk Saver。  
5. **本地持久化**：secrets、settings、transcript、outbox。

### 3.2 产品能力清单（设计目标 / 官方形态）

Grok Bot 类产品通常宣传或内置：

- 搜索与整理信息  
- 打开并阅读网页  
- X（Twitter）搜用户、帖子、线程  
- 本机/远程桌面操作（computer use）  
- 插件 / MCP / 本地工具  
- 多 Agent 并行与通知  

**对本部署的诚实映射：**

| 能力 | 当前本部署 | 说明 |
|------|------------|------|
| 对话 | ✅ | ChainFuel 已通 |
| 远程桌面画面 | ⚠️ 基础设施在 | Xvfb + noVNC 在；需 UI 里打开 Computer 视图 |
| 打开浏览器进程 | ⚠️ 二进制在 | Chrome 在容器内；**公网出站当前不通** |
| 真正打开外网网页 | ❌ 当前 | curl example/baidu 失败；需修 egress/DNS/代理 |
| 上 X 操作 | ❌ 当前 | 依赖浏览器出站 + 登录态 |
| 插件 | ⚠️ | UI 有 Plugins；未做业务验收 |
| Disk Saver | ✅ 会自动出现 | 磁盘压力触发，非故障 |

### 3.3 直接回答：能不能打开浏览器？

**短答：**

- **进程层面**：可以。容器里有 Chrome，也有虚拟显示（`:1` / `:2`）。  
- **业务层面（打开百度/X/任意网站）**：以 2026-09-14 探测为准，**还不行**——box 出站访问公网失败，只有 ChainFuel 等少数目标可达。  
- **你在 App 里看到的「能聊」**：走的是 Mac/路由 → ChainFuel，**不经过** box 浏览器。

要让「打开浏览器并上网」变成真能力，需要单独做一节网络工程（见 §6.3、§7）。

---

## 4. 你的研究方向：回调接口、自动剪辑、可编排

目标不是停在聊天，而是 **Grok 结论 / 动作 → 你的系统**。

### 4.1 推荐分层

```
┌─────────────┐     ┌──────────────┐     ┌─────────────────┐
│ grok-bot-tcd│────▶│ 编排层        │────▶│ 业务执行          │
│ 对话/工具   │     │ queue/webhook │     │ 剪辑/发布/入库    │
└─────────────┘     └──────────────┘     └─────────────────┘
                           │
                           ▼
                    回调你的 API
                    (HMAC / API Key)
```

### 4.2 可落接口形态（建议）

| 接口 | 用途 | 输入示例 | 输出 |
|------|------|----------|------|
| `POST /hooks/grok/turn-finished` | 一轮对话结束回调 | agentId, transcript tail, model | 200 + jobId |
| `POST /hooks/grok/research-result` | 研究结果结构化落库 | title, bullets, sources[] | docId |
| `POST /jobs/edit/enqueue` | 自动剪辑入队 | mediaUri, script, style | queueId |
| `GET  /jobs/{id}` | 查询剪辑/发布状态 | id | status, artifacts |
| `POST /hooks/grok/tool-event` | 工具调用审计 | tool, args hash, ok/fail | ack |

安全约定（强制）：

- 回调带 `X-Timestamp` + `X-Signature`（HMAC-SHA256）或固定服务 Key。  
- 只收 **结构化 JSON**，不收任意 shell。  
- 剪辑/发布 worker **不**直接暴露给模型；模型只入队。

### 4.3 与现有资产的衔接（你环境里已有方向）

不必新造平行宇宙，优先挂已有能力：

- **ChainFuel / SubLB**：推理与账号池（已用于 grok-4.6）。  
- **grok-queue / rabbitmq-worker**：异步任务与结果回拉。  
- **自动剪辑 / 口播 / 小红书成片技能**：Grok 出分镜与文案 → enqueue 剪辑 job。  
- **X 发文 / 搜索技能**：待 box 出站修好后，由 Computer 或独立 CLI 执行，结果回调。

### 4.4 「研究 → 回调 → 剪辑」最小闭环（设计）

1. 你在 grok-bot-tcd 里做研究对话，要求输出 **固定 JSON schema**（标题、要点、素材链接、剪辑指令）。  
2. 客户端或旁路 watcher 识别 schema → `POST /hooks/grok/research-result`。  
3. 编排层写入 DB，并 `enqueue` 剪辑任务。  
4. Worker 出片后回调/写对象存储，Bark 或桌面通知你验收。  
5. 失败进死信，不阻塞下一轮对话。

---

## 5. 步骤（从零到可聊 + 到可扩展）

### 5.1 每日开机（可聊）

```bash
# 在 Mac 上
cd ~/code/06-production-business-money-live/grok-bot-0.18-reconstructed
./scripts/launch-mason1-computer.sh
```

脚本会：

1. 同步/保留登录与 `OPENROUTER_API_KEY`  
2. 确保 `boxRuntime=local-docker`、`inferenceProvider=openrouter`  
3. 拉取 mason1 gateway token  
4. 建立 SSH 隧道（1340 等）  
5. 等待 health 200  
6. 启动 `grok-bot-tcd.app` 并注入 ChainFuel 环境变量

验收：

```bash
TOKEN=$(python3 -c 'import json;print(json.load(open(
  "/Users/houzi/Library/Application Support/Grok Bot Reconstructed Intel/sand-data/local-docker-vm.json"
))["token"])')
curl -sS -H "authorization: Bearer $TOKEN" http://127.0.0.1:1340/health
# 期望：ok=true, isBusy 最终可为 false
```

App 内：

1. 点 **+** 新建会话（尽量不要长期挂在 Disk Saver）  
2. 发：`ping，用三个字回复`  
3. 应很快收到模型回复

### 5.2 推理配置（ChainFuel）

`sand-data/tcd-inference.env` 典型内容：

```bash
export OPENROUTER_API_KEY='sk-...'
export OPENROUTER_BASE_URL='https://chainfuel.tap365.org/v1'
export SAND_OPENROUTER_BASE_URL='https://chainfuel.tap365.org/v1'
export SAND_OPENROUTER_MODEL='grok-4.6'
```

注意：

- 旧版 asar 曾硬编码 `https://openrouter.ai/api/v1`，会导致「有 key 也不回」。  
- 当前安装包应已改为读环境变量 / ChainFuel；若重装官方包需重新打补丁或用 reconstructed 构建。  
- `launch-mason1-computer.sh` 会把 key 合并进 `sand-secrets.json`，避免被官方 secrets 同步冲掉。

### 5.3 远程 Computer（mason1）

```bash
ssh mason1
docker ps --filter name=grok-bot-local-vm
docker restart grok-bot-local-vm   # 卡死 busy 时
```

常用修复：

- 重写 `box-secrets.json`（`OPENROUTER_API_KEY`）  
- 清空 `host-disk-pressure-reminders.json` 的 active episode  
- `active-agent.json` 切到正常 Agent（非卡死的旧 id）

### 5.4 业务扩展步骤（回调 / 剪辑）

1. 定 schema：研究输出 JSON 字段冻结一版。  
2. 实现一个 **只收回调** 的 HTTPS 服务（HMAC）。  
3. 用「假 transcript」打一次回调 smoke。  
4. 再接剪辑 enqueue（可先 noop worker 只写日志）。  
5. 最后才把 grok-bot 会话或旁路 watcher 接上。  
6. 全程保留失败死信与人工重放入口。

### 5.5 负责任务清单（建议按周跑）

| ID | 任务 | 通过标准 | 当前预期 |
|----|------|----------|----------|
| A1 | 冷启动 launch 脚本 | health 200，App 起进程 | ✅ 应通过 |
| A2 | 三字回复 ping | 30s 内有 assistant 文本 | ✅ 应通过 |
| A3 | 中文多轮 | 连续 3 轮不丢上下文 | ✅ 应通过 |
| A4 | 设置里 provider=openrouter | settings 与 UI 一致 | ✅ |
| A5 | ChainFuel 直打 | Mac curl completions 200 | ✅ |
| B1 | 打开 Computer 画面 | noVNC 或 App 内桌面可见 | ⚠️ 测 UI |
| B2 | box 内 curl example.com | HTTP 200 | ❌ 先修网络 |
| B3 | box 内 headless 打开 example.com | dump-dom 含 Example Domain | ❌ 依赖 B2 |
| B4 | 让 Agent「打开浏览器访问某页并总结」 | 总结含页内关键词 | ❌ 依赖 B2/B3 |
| C1 | 研究 JSON 回调 | 你的 hook 收到签名正确的 body | 待建 |
| C2 | 剪辑入队 noop | queue 有 job，status=queued | 待建 |
| C3 | 剪辑出片回调 | artifacts 路径可读 | 待建 |

---

## 6. QA：可能遇到的问题

### 6.1 对话类

| 现象 | 常见原因 | 处理 |
|------|----------|------|
| 发出去一直没回复 | asar 仍指向 openrouter.ai；缺 `OPENROUTER_API_KEY`；outbox 卡在 `accepted-awaiting-echo` | 查 env/asar；清 outbox blob；重启 App |
| 只有 Thinking 转圈 | Agent busy 卡死；worker 挂了 | `docker restart grok-bot-local-vm`；换新会话 |
| Router error: … | key 无效、模型名错、ChainFuel 5xx | 直打 completions 定位 |
| 回复很慢 | maxMode、链路远、模型 thinking | 关 maxMode 对比；看 ChainFuel 延迟 |
| 侧边栏只有 Disk Saver | 磁盘压力自动 Agent | 新建 +；腾 mason1 磁盘 |

### 6.2 Computer / 隧道

| 现象 | 常见原因 | 处理 |
|------|----------|------|
| Can't reach computer | 隧道断、容器停、token 不一致 | 重跑 launch；`docker start`；对齐 `local-docker-vm.json` |
| health 404 on `/` | 正常，应用 `/health` | 不要用 `/` 当探针 |
| Routine Sync Failed | 无官方 egress / api2.cursor.sh | 可忽略（不影响 ChainFuel 聊） |
| isBusy 一直 true | 旧 turn 未结束 | 重启容器；换 agentId |
| SSH mason1 直连 6002 失败 | 应用别名走 FRP（如 82:6000） | 用 `ssh mason1` 配置，不要盲写 IP |

### 6.3 浏览器 / 联网

| 现象 | 常见原因 | 处理 |
|------|----------|------|
| 说能打开网页但失败 | box **无公网出站** | 给容器加代理/DNS/egress tunnel |
| Chrome 二进制在但 dump 空 | 无显示或沙箱/网络 | 先修 curl 出站，再测 headless |
| 登录 X/站点 | 无 cookie、风控、无 egress | 先通网，再谈登录态注入 |
| egressTunnelEnabled=false | 默认关闭 | 评估安全后按官方机制开启或自建出口 |

**当前探测结论（务必写进 QA 预期）：**

- `chainfuel.tap365.org`：通  
- `example.com` / `baidu.com`：不通  
→ 「打开浏览器演示上网」**在修网络前应标为预期失败**，不要当成模型能力回归。

### 6.4 磁盘 / Disk Saver

| 现象 | 常见原因 | 处理 |
|------|----------|------|
| 黄条 low disk | mason1 ~88% | 归档大目录、清日志/镜像（授权后） |
| 自动出现 Disk Saver Agent | forever-box 磁盘压力逻辑 | 正常；聊天用新会话 |
| disk-pressure ledger invalid | 文件格式被写坏 | 重置为 versioned 空 pending |

### 6.5 密钥与配置

| 现象 | 常见原因 | 处理 |
|------|----------|------|
| 重启后 key 丢了 | 官方 sand-secrets 同步覆盖 | launch 脚本已保留 OPENROUTER；检查 tcd-inference.env |
| box-secrets 为空 | 容器卷被重置 | 从 env 重写；tcd-host 留副本 |
| 模型不是 grok-4.6 | settings / env 不一致 | 对齐 Mac settings 与 `SAND_OPENROUTER_MODEL` |

### 6.6 业务回调 / 剪辑

| 现象 | 常见原因 | 处理 |
|------|----------|------|
| 回调 401 | 签名时钟偏移 | 允许 ±300s；打日志不打 key |
| 重复入队 | 无幂等键 | 用 turnId/clientNonce 去重 |
| 模型胡写 JSON | 无 schema 约束 | 系统提示 + 本地 JSON Schema 校验，失败回问 |
| 剪辑 worker 被模型直接调 | 工具面过大 | 只暴露 enqueue，不暴露 ffmpeg |

---

## 7. 打开浏览器：落地路线（若要做真演示）

按优先级：

1. **先让 box 出站**  
   - 容器内：`curl -I https://example.com` 必须 200。  
   - 手段：HTTP/SOCKS 代理、正确 DNS、或 egress tunnel；注意与「不连官方 Computer」策略一致。  

2. **再验 Chrome**  
   - headless dump-dom example.com  
   - 有头模式：`DISPLAY=:1` + 截图 / noVNC 肉眼看  

3. **再验 Agent 工具链**  
   - 提示词：「打开 https://example.com，用一句话概括标题」  
   - 通过标准：回复含 Example Domain，且 turn 成功结束  

4. **最后才做 X/登录态**  
   - 高风控，单独会话、单独 cookie 仓，禁止与生产号混用  

在出站修复前，对外话术应是：

> 对话智能已接通 Grok；远程电脑与浏览器组件已部署；公网浏览待网络出口就绪。

而不是：「已经能上网冲浪」。

---

## 8. 安全与边界

1. **密钥**：只存在 `tcd-inference.env` / `sand-secrets` / box-secrets；日志脱敏。  
2. **生产写操作**：剪辑发布、发 X、改 DNS，必须人工确认或二次门禁。  
3. **删除**：磁盘清理用归档（mv），禁止对 mason1 盲 `rm -rf`。  
4. **官方账号**：本方案刻意弱化官方 Computer；Routine Sync 失败可接受。  
5. **模型输出**：不可直接当 shell；回调只认 schema。  

---

## 9. 一页纸总结

| 问题 | 答案 |
|------|------|
| 为什么做 | 把 Grok 做成可私有、可路由、可接生产线的桌面智能体 |
| 为什么值得 | ChatGPT 之后，最接近「真助理」的产品形态之一 |
| 现在能做什么 | 稳定中文多轮；ChainFuel grok-4.6；远程 Computer 在线 |
| 能不能打开浏览器 | 组件在，**公网出站未通 → 业务上还不能演示上网** |
| 研究怎么变接口 | 结构化输出 → HMAC 回调 → 队列 → 剪辑/发布 worker |
| 日常怎么开 | `./scripts/launch-mason1-computer.sh` |
| 最大噪音 | mason1 磁盘 88% → Disk Saver 黄条 |
| 最大缺口 | box 公网 egress |

---

## 10. 变更与回滚备忘

| 日期 | 变更 | 回滚 |
|------|------|------|
| 2026-09-14 | asar 推理 baseURL 改为 ChainFuel/env | `/tmp/grok-bot-tcd-app.asar.bak-*` 拷回 app.asar |
| 2026-09-14 | launch 脚本保留 OPENROUTER_API_KEY | git 还原 `scripts/launch-mason1-computer.sh` |
| 2026-09-14 | mason1 tcd-host 挂载 host-main / inference | 停用 bind mount，回官方 host-main |

---

## 11. 文档维护

- 仓库路径：`docs/GROK-BOT-TCD-运营手册.md`  
- 更新触发：推理入口变更、Computer 主机变更、egress 打通、回调/剪辑上线  
- 每次更新至少重跑：A1、A2、A5；涉及浏览器时加 B2  

---

*本文描述的是 grok-bot-tcd 私有部署与运营事实，不构成对 xAI / OpenAI 官方产品的法律或商业背书。*
