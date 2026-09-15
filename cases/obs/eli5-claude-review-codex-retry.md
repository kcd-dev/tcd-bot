# Claude ELI5 审查观察：Codex 401 重试证据复核

- 日期：2026-09-06
- 观察：独立 Claude 审查建议删除页面中的“Codex 在 401 后刷新凭据并重试一次”，理由是其收到的简化材料只描述了刷新凭据。
- 复现材料：`source/host/extensions/inference/provider-session.ts` 117–131 的 `codexAuthenticatedFetch()`：先 `perform()`；若状态不是 401 直接返回；若为 401，则 `await refreshCodexCredentials(credentials)`，再调用一次 `perform()` 后返回。
- 修复规则：对外部审查提出的“材料未明确”问题，须回到本轮已核对的原始源码逐行复核；若源码明确，则保留页面事实，并在后续审查材料中提供完整相关代码片段。
- 回归检查点：页面中 Codex 卡片可写“401 时刷新登录信息后重试一次”；不应把它降格为“待确认”。
