# WebSearch 黄三角根因（OpenRouter 聊天 ≠ 云搜索）

> 更新：2026-09-14（C2 已落地：openrouter 走本地 WebSearch/WebFetch）  
> 来源：本会话探测 + explore 子 Agent 源码梳理 + 本轮实现  
> 相关：`PROGRESS.md`、`BROWSER-EGRESS-AND-CLASH.md`

---

## 1. 现象

- 用户：`搜网页 看下 最新的百度新闻`  
- 模型：`我去搜一下百度新闻的最新内容。`  
- UI：消息下 **黄色警告三角**；顶栏类似 **were rejected … Run /login to re-authenticate**  
- 右侧 Computer：可见 Chrome 图标，但不代表搜索成功  

聊天（ChainFuel）同时是通的 → **容易误判成「浏览器坏了」**。

---

## 2. 根因一句话

**原先：OpenRouter/ChainFuel 只替换了「对话推理」；`WebSearch` / `WebFetch` 仍调用 Cursor 云端 `AiService.RunWebSearch` / `RunWebFetch`，需要合法 Cursor access token。**  
无私有 JWT 时工具 rejected → 黄三角。与 mason1 Clash 是否在线 **无直接关系**。

**现在（C2）：`inferenceProvider !== cursor` 时，host 绑定改为本地 HTTP 搜索/抓取，不再打 Cursor 云。**

---

## 3. 调用链（源码）

```
LLM turn (openrouter → ChainFuel grok-4.6)     ✅ 已通
        │ tool_call: WebSearch
        ▼
createWebSearchTool  (packages/agent/tools/core/web-search.ts)
        │
        ▼
webSearchService ← production 绑定（按 provider 分流）
        ├─ cursor     → createCursorWebSearchService → Cursor 云
        └─ 其它       → createLocalWebSearchService
                         ├─ Brave / Serper / Tavily（若有 key）
                         ├─ 中文：百度 HTML → DuckDuckGo HTML
                         ├─ 英文：DuckDuckGo HTML → 百度 HTML
                         └─ 新闻词且 SERP 空：抓 news.baidu.com
```

### 关键事实

| 点 | 说明 |
|----|------|
| Provider 切换 | `inference-service.ts`：`cursor` 走 Cursor session；`openrouter` 走 `createProviderPromptSession` **仅推理** |
| Web 工具绑定 | `production.ts`：`cursor` 走 Cursor 云；`openrouter`/`codex`/`claude-code` 走 `local-web-tools.ts` |
| 无 OpenRouter 版 WebSearch | **已补** `createLocalWebSearchService` / `createLocalWebFetchService` |
| OpenRouter key | **不能** 授权 Cursor RunWebSearch；本地工具不需要它 |

### 路径索引（仓库内）

| 职责 | 路径 | 符号 |
|------|------|------|
| WebSearch 工具 | `source/packages/agent/tools/core/web-search.ts` | `createWebSearchTool` |
| WebFetch 工具 | `source/packages/agent/tools/core/web-fetch.ts` | `createWebFetchTool` |
| Cursor 云搜索 | `source/host/extensions/inference/cursor-web-tools.ts` | `createCursorWebSearchService` |
| 本地搜索/抓取 | `source/host/extensions/inference/local-web-tools.ts` | `createLocalWebSearchService` |
| 生产绑定 | `source/host/extensions/inference/production.ts` | `createInferenceProductionExtras` |
| OpenRouter 聊天 | `source/host/extensions/inference/provider-session.ts` | `openRouterExecutor` |
| Provider 切换 | `source/host/extensions/inference/inference-service.ts` | `createHostInference` |
| 工具是否提供 | `source/host/runner/tools/turn-toolset.ts` | turn toolset gates |
| browserUse | `source/host/runner/tools/sand-browser-tools.ts` 等 | CDP / Statsig gate |

---

## 4. 并行噪音（相关但非主因）

| 日志 / UI | 含义 | 是否堵住 WebSearch |
|-----------|------|-------------------|
| `Credential has no usable subject claim` | JWT 无 `sub`，遥测/身份 | 同属 Cursor 凭证平面，强相关信号 |
| `box-store-access … unauthenticated` | Agent Store 未授权 | 影响云同步 profile，非 curl |
| `browserEnabled:false`（运行日志） | 镜像 exec-daemon 浏览器通道关 | 影响 browser 工具，不是 WebSearch RPC |
| 重建 daemon `computerUseSupported:false` | `box-exec-daemon/server.ts` 写死 | computer-use 像素操作弱 |
| standalone `noMonitorComputerUseExecutor` | 无 monitor 时 computer-use 抛错 | 桌面演示路径 |
| 低磁盘 / Disk Saver | 88% | 干扰会话，非黄三角主因 |
| Clash TLS reset | 出站 | 影响 Chrome/curl 海外，不解释 Cursor rejected |

---

## 5. 修复方案对比

### A. Shell curl 兜底（最快，不改鉴权）

- 条件：box Shell 可用 + 国内站直连  
- 做法：提示词/策略要求「搜网页失败时用 `curl` 拉 HTML 摘要」  
- 不消除 WebSearch 工具卡片失败，但 **用户能拿到内容**  
- **不需要** Cursor login  

### B. computer-use / browserUse 开 Chrome（中等）

- 需要真 desktop + CDP + 能力位/feature gate  
- 重建栈对 computer-use 支持不完整  
- 适合「演示打开页面」，仍建议国内直连或修好 Clash  

### C1. 恢复 Cursor login（官方设计）

- 合法 Cursor token → RunWebSearch 可能恢复  
- 与「推理主权在 ChainFuel」目标冲突；依赖官方配额与网络  

### C2. OpenRouter 下本地 WebSearch（已落地）

在 `production.ts` 按 `settings.getInferenceProvider()` 分支：

| provider | WebSearch / WebFetch |
|----------|----------------------|
| `cursor` | 保持 Cursor 云 |
| `openrouter` / `codex` / `claude-code` | `local-web-tools.ts`：Brave/Serper/Tavily（可选 key）或百度/DuckDuckGo HTML；Fetch 为直连 HTTP→可读文本 |

运行态：mason1 容器 `~/grok-bot-computer/tcd-host/host-main.cjs`（agent 在 box 内执行）。回滚：同目录 `host-main.cjs.bak-*`。

可选出口：`SAND_WEB_TOOLS_PROXY` / `HTTPS_PROXY`（直连失败才走代理；不要把 ChainFuel completions 塞进坏节点）。

### 推荐落地顺序

```
1. A  — prompt 已要求 WebSearch 失败时 curl 国内页
2. C2 — 已落地（源码 + mason1 host-main）
3. B  — 真浏览器演示（仍待）
4. C1 — 仅当接受 Cursor 锁
```

---

## 6. 与 Clash / ChainFuel 代理的关系

```
WebSearch(Cursor) ──X── 不走 mason1 Clash
WebSearch(C2 本地) ────── 直连；失败才可选 SAND_WEB_TOOLS_PROXY / Clash
Shell curl / Chrome ────── 可走直连或 Clash 或 ChainFuel 出口
Chat completions ───────── ChainFuel 直连（已通）
```

用户建议「ChainFuel 内部挂代理」：适合 **C2 本地 search/fetch 的上游出站**，或统一 fetch 网关；**不要**把聊天 completions 强行塞进坏节点代理。

---

## 7. 验收标准

| ID | 场景 | 通过 |
|----|------|------|
| W1 | openrouter 聊天 | 多轮正常 |
| W2 | 模型调用 WebSearch（C2） | 无黄三角，有 references（不打 Cursor 云） |
| W3 | Shell：`curl -sL news.baidu.com \| head` | 有 HTML（出站兜底） |
| W4 | 顶栏 login rejected | C2 后 WebSearch 可忽略；其它 Cursor 云功能仍可能提示 |

---

## 8. 经验句

1. **能聊 ≠ 能搜**（两条后端）。  
2. **黄三角 + login rejected** 优先查 Web 工具是否仍绑 Cursor；openrouter 应走本地实现。  
3. **Clash 修的是出站，C2 修的是工具绑定。**  
4. 私有化路线应把 WebSearch/WebFetch 从 Cursor 解耦（C2 已做）。

---

## 9. 算法：OpenRouter 本地 Web 工具分流

- **名称**：OpenRouter 本地 Web 工具分流
- **保证**：`inferenceProvider !== cursor` 时，WebSearch/WebFetch **不**调用 Cursor `AiService.RunWebSearch` / `RunWebFetch`
- **输入**：`settings.json` 的 `inferenceProvider`；工具参数 `searchTerm` 或 URL
- **触发**：host 组 turn toolset 时 `createInferenceProductionExtras.createWebSearch` / `createWebFetch`
- **步骤**：非 cursor → 可选搜索 API → 百度/DuckDuckGo HTML → 新闻词且空结果则抓 `news.baidu.com`；Fetch 则 GET URL 并转可读文本。拦截 localhost/私网。直连失败且配置了代理才走代理。
- **停止条件**：返回 `{ documents[] }` / `{ content }`，或返回工具错误（非 Cursor login rejected）
- **不保证**：海外站 TLS、搜索排序质量、百度跳转链可解出真实 URL、Clash 节点可用
- **落点**：`source/host/extensions/inference/local-web-tools.ts`、`production.ts`；运行态 mason1 `tcd-host/host-main.cjs`  
