# Case：浏览器 / WebSearch 黄三角（2026-09-14）

## 现象
- 聊天通；「搜百度新闻」后黄三角
- 顶栏 re-authenticate
- Computer 可见 Chrome 图标

## 结论
1. WebSearch → Cursor 云，OpenRouter 不授权
2. mason1 clash :7890 在，海外 TLS 不稳
3. 百度直连常通

## 文档
- `docs/PROGRESS.md`
- `docs/WEBSEARCH-AUTH-ROOT-CAUSE.md`
- `docs/BROWSER-EGRESS-AND-CLASH.md`

## 探测摘要
见上述文档 §探测证据；原始终端日志在 grok session terminal/ 下（不入库）。
