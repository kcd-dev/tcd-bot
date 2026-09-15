# 浏览器出站与 mason1 Clash 经验

> 更新：2026-09-14  
> 相关：`PROGRESS.md`、`WEBSEARCH-AUTH-ROOT-CAUSE.md`、`GROK-BOT-TCD-运营手册.md`

---

## 1. 结论先讲

| 问题 | 答案 |
|------|------|
| mason1 上有没有代理？ | **有**。进程 `/usr/local/bin/clash`（类 Clash 内核，不是 macOS ClashX GUI） |
| 端口？ | HTTP/mixed **`*:7890`**，控制器 **`*:9090`**（version v1.18.0）；本机还有 **`127.0.0.1:9050`（tor）** |
| 对 grok-bot 浏览器有用吗？ | **作为出站通道有用，但当前节点质量差，且解决不了 WebSearch 鉴权** |
| 容器怎么用？ | Docker bridge 网关一般是 `172.17.0.1`，可 `--proxy http://172.17.0.1:7890` |
| 用户说的 ClashX？ | Mac 上叫 ClashX；**服务器上是 Linux clash 守护进程**。概念同类（规则代理），部署形态不同 |

---

## 2. 为什么「有 Chrome 还是搜不了」

三层必须同时满足：

```
① 工具层：WebSearch / browserUse / Shell
② 出站层：DNS + 直连或 Clash 节点可用
③ 桌面层：Xvfb + box-chrome + CDP
```

现状：

- ③ **基本有**（Chrome 进程、noVNC、CDP 9223/9225 曾连上 session-sync）  
- ② **半通**（百度直连常 200；example.com 宿主机直接 refused；经 Clash 海外 TLS 常 reset）  
- ① **WebSearch 走 Cursor 云** → 与 Clash 无关，见 `WEBSEARCH-AUTH-ROOT-CAUSE.md`

截图里「我去搜百度新闻」后黄三角：优先是 **① 鉴权/工具拒绝**，不是单纯「没 Clash」。

---

## 3. 探测证据（2026-09-14）

### 3.1 进程与端口

```
/usr/local/bin/clash   pid ~1415
LISTEN *:7890
LISTEN *:9090   → GET /version → {"version":"v1.18.0"}
LISTEN 127.0.0.1:9050  → tor
```

### 3.2 宿主机

| URL | 直连 | `http://127.0.0.1:7890` |
|-----|------|-------------------------|
| baidu.com | 常 200 | 200 |
| example.com | 000 refused | 000 / TLS 问题 |
| httpbin.org/ip | 有时 200 | CONNECT 200 后 **SSL reset** |
| chainfuel.tap365.org | 200 | 经代理反而易失败 |

说明：

- 国内站 **不必** 强行走 Clash。  
- 海外站 Clash **能接 CONNECT**，但 **TLS 被重置** → 上游节点、规则或 SNI 问题，不是端口没开。  
- ChainFuel 直连已通；聊天不依赖 Clash。

### 3.3 容器 `grok-bot-local-vm`

| 探测 | 结果 |
|------|------|
| `curl https://www.baidu.com` | 常 200 |
| `curl https://example.com` | 失败（与宿主机一致） |
| `curl --proxy http://172.17.0.1:7890 https://www.baidu.com` | 200 |
| 同上海外站 | reset / 失败 |
| `BROWSER=/usr/local/bin/box-chrome` | 已在容器 env |
| Chrome 打开 example.com | 离线页 / handshake failed |

### 3.4 网络模式

```
NetworkMode=bridge
Dns=[]   # 用 Docker 默认 / 内置 resolv
Gateway≈172.17.0.1
```

无 `HTTP_PROXY` 注入容器时，默认与宿主机同命运（GFW/路由）。

---

## 4. Clash 怎么用才「有用」

### 4.1 适用场景

- Agent **Shell curl** 读海外文档  
- Chrome 打开需代理的站点  
- 未来本地 WebFetch 实现  

### 4.2 不适用场景

- 修复 Cursor `RunWebSearch` 的 login rejected  
- 替代 ChainFuel 聊天（聊天已直连）  
- 节点 TLS 全挂时硬开代理（会更差）

### 4.3 推荐注入方式（待实施，最小改动）

**方案 A — 仅给需要代理的进程**

```bash
# 容器内临时验证
export http_proxy=http://172.17.0.1:7890
export https_proxy=http://172.17.0.1:7890
export ALL_PROXY=http://172.17.0.1:7890
export NO_PROXY=127.0.0.1,localhost,chainfuel.tap365.org,172.17.0.0/16
curl -I https://目标
```

Chrome：

```bash
google-chrome-stable --proxy-server="http://172.17.0.1:7890" ...
```

**方案 B — docker 重启时写入 env**（持久）

在 mason1 启动容器的 compose/run 增加上述变量；`NO_PROXY` 必须包含 ChainFuel，避免推理被坏节点拖死。

**方案 C — ChainFuel 侧挂代理**（用户建议）

若 `https://chainfuel.tap365.org/` 可提供统一出口：

- box 只访问 ChainFuel 的 fetch/search 接口  
- 出站策略集中在 ChainFuel，mason1 可不依赖本机 Clash 质量  

### 4.4 修复 Clash 节点质量（运维）

1. 打开 `http://127.0.0.1:9090`（或带 secret 的 external-controller）看 proxies 延迟  
2. 换可用节点 / 更新订阅  
3. 验收：`curl -x http://127.0.0.1:7890 -I https://example.com` 稳定 200  
4. 再注入容器  

在节点未修好前，**不要**全局强制代理。

---

## 5. 与 Disk Saver / 低磁盘

- 磁盘 88% 会自动 Disk Saver，占用 Agent 与注意力  
- 不直接导致 Clash 失败，但加重「演示网页」体验差  
- 清盘需 Mason 授权大目录归档  

---

## 6. 验收清单（出站）

| ID | 命令 / 动作 | 通过 |
|----|-------------|------|
| E1 | 宿主机 `curl -I https://www.baidu.com` | 200 |
| E2 | 宿主机 `curl -x http://127.0.0.1:7890 -I https://example.com` | 200（Clash 健康） |
| E3 | 容器直连百度 | 200 |
| E4 | 容器经 `172.17.0.1:7890` example.com | 200 |
| E5 | Chrome `--proxy-server` 打开目标页 + CDP title | 非 ERR_ 页 |
| E6 | Agent「用 curl 读取 news.baidu.com 标题」 | 有正文（Shell 路径） |

E6 可在 E2 失败时仍做（国内直连）。

---

## 7. 经验摘要

1. **Clash 在 mason1 上是 Linux clash，不是 Mac ClashX**；端口 7890 可用。  
2. **有 Clash ≠ 海外网通**；要看 TLS 是否 reset。  
3. **有 Chrome ≠ 能搜网页**；WebSearch 是另一条 Cursor 云链路。  
4. **ChainFuel 直连优先**，代理务必 `NO_PROXY` 掉推理域名。  
5. 短期演示国内内容：优先 **Shell curl 直连**，别死磕 WebSearch 工具卡片。  

---

## 8. 回滚

- 去掉容器 `HTTP_PROXY*` 后 `docker restart grok-bot-local-vm`  
- 勿改 Clash 配置前备份 `config.yaml`（路径以 `external-controller` / 进程 cwd 为准）  
