# 优化计划(spec → Plan)— 2026-06-20

把 `docs/optimization/` 的优化 spec 转化为可执行实现计划的成果。由 10 位专家(均
`claude-opus-4.8`)实读源码后各出一份**中文**报告,整合为一份 final design doc。
(本批文档应 owner 要求用中文,属对「文档默认英文」惯例的有意豁免。)

先读 final design doc;10 份专家报告是其支撑材料。

- [`2026-06-20-final-design-doc.md`](2026-06-20-final-design-doc.md)
  — **整合最终设计文档**:目标/约束、跨切面架构决策、超出 spec 的新发现、依赖图与关键路径、
  Sprint 1–3 + Backlog 任务 backlog(T0-*..T18-*)、风险登记、开放决策、WS→任务可追溯矩阵、测试在环。

专家报告:
- [`2026-06-20-plan-01-software-architect.md`](2026-06-20-plan-01-software-architect.md) — 架构骨架 / 依赖图 / 风险
- [`2026-06-20-plan-02-backend-architect.md`](2026-06-20-plan-02-backend-architect.md) — 服务端 moves 设计
- [`2026-06-20-plan-03-game-designer.md`](2026-06-20-plan-03-game-designer.md) — combo 公式 / joker / 中文规则文案
- [`2026-06-20-plan-04-ux-researcher.md`](2026-06-20-plan-04-ux-researcher.md) — 旅程 / 原因码文案 / 等候室 / tap-to-place
- [`2026-06-20-plan-05-ui-designer.md`](2026-06-20-plan-05-ui-designer.md) — 牌桌托盘 / 对比度 token / 移动端 / 等候层
- [`2026-06-20-plan-06-frontend-developer.md`](2026-06-20-plan-06-frontend-developer.md) — memo / 回调 ref / TurnTimer / bundle
- [`2026-06-20-plan-07-database-optimizer.md`](2026-06-20-plan-07-database-optimizer.md) — 持久化选型 / 接入 / GC
- [`2026-06-20-plan-08-devops-automator.md`](2026-06-20-plan-08-devops-automator.md) — 测试在环 / 校验脚本 / 部署
- [`2026-06-20-plan-09-security-architect.md`](2026-06-20-plan-09-security-architect.md) — 服务器权威 / 房间泄露 / playerView / 聊天
- [`2026-06-20-plan-10-project-manager.md`](2026-06-20-plan-10-project-manager.md) — Sprint 拆解 / 任务 backlog / 可追溯矩阵

这些是设计文档,非实现。数值标 `[PLACEHOLDER]` 的为待 playtest 的调参假设。
