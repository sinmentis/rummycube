# RummyCube 优化 · Sprint 1 实施报告（stage report）

**日期:** 2026-06-23 · **分支:** `feat/optimization`（基于 `main`，未推送）· **owner:** @sinmentis
**计划来源:** `docs/plan/2026-06-20-final-design-doc.md`（Sprint 1 = P0）

## 1. 结果概述

Sprint 1 全部 15 个执行单元（U1–U15）+ 1 个由终审发现的安全修复，已实现、逐个评审通过并整合。

- **覆盖的 workstream:** WS-1（安全自解释提交，完整）、WS-2（How-to-play 弹窗 + 大厅 hero + joker 标签）、
  WS-3（牌桌托盘 + 掉落引导 + `resolveDropSlot` 落子校验）、WS-4（性能,完整:回调稳定 + 牌格 memo +
  计时下沉 + 生产剥离 console）、WS-6（等候室核心）、加 T0 工具链修复与 SEC-1/SEC-1b 安全修复。
- **测试:** jest **84 → 140** 用例（+56），33 套件全绿；生产 `npm run build` 成功且产物无 `console.log`。
- **提交:** 20 个 commit（见 §4）。全部 Conventional Commits，含 Co-authored-by trailer，未推送。
- **终审（whole-branch review，opus）:** YES-WITH-FIXES —— 四条绑定不变量全部成立；唯一阻断项 SEC-1b 已修复。

## 2. 执行方式

采用 subagent-driven-development:每个单元 = 一个全新 implementer 子代理实现（TDD:先写失败测试→实现→通过→提交），
随后一个 reviewer 子代理做「规范符合 + 代码质量」双重评审,Critical/Important 必修后才标记完成。所有子代理运行在
`claude-opus-4.8`。文件不互相污染的单元做了 reviewer∥implementer 流水化以省时;Board.jsx 密集的尾段串行执行。
进度写入本地 ledger（`.git/sdd/progress.md`）以抗压缩中断。

## 3. 完成的工作（按单元）

| 单元 | 内容 | WS | commit |
|---|---|---|---|
| U1 | 修复损坏的 `npm run build`（→`vite build`）+ 接入 jsdom/RTL jest | T0-1/2 | 2153b44, e145ed8 |
| U2 | `createMatch` 设 `unlisted:true`（房间码/玩家名不再公开列出） | SEC-1 | 17b8d8d |
| U3 | `submitRejectReason(G,ctx)` 原因码 + 两个校验器共享单一事实源 | WS-1 | b13f79e |
| U4 | 服务端 `submitMeld`（无效即 no-op,不回滚/不抽/不结束回合） | WS-1 | 89faadd |
| U5 | 显式 `forfeitTurn`（回滚+罚抽,独立于 forceEndTurn） | WS-1 | 436a827 |
| U6 | 客户端接线:Submit meld 非破坏 + 内联英文原因 + Draw 禁用 + 放弃回合 | WS-1 | 625d775, 9674925 |
| U7 | How-to-play 弹窗（导航栏）+ 大厅 hero | WS-2 | 4055a1b |
| U8 | 纯函数 `resolveDropSlot`（单选吸附 / 多选连续否则拒绝） | WS-3 | 7c9a194 |
| U9 | 牌桌「托盘」框 + 极淡网格 + 掉落态 CSS 契约 | WS-3 | d2d7c88 |
| U10 | 把 `resolveDropSlot` 接入实拖拽 + 掉落引导提示（含按玩家划分手牌占用的修复） | WS-3 | edb9bf3, e1d73a2 |
| U11 | 启用 JSX-in-jest（`@babel/preset-react`）+ Board 回调用 ref 稳定 + 删调试日志 | WS-4 | b403630, b9ebe8c |
| U12 | 牌格改传布尔 prop + `React.memo`（选 1 张只重渲染 ≤2 格）+ joker aria-label | WS-4 | 01bb913 |
| U13 | 计时下沉到每个头像自管 + null `TurnDeadlineWatcher`（Board 不再每 tick 重渲染） | WS-4 | b4279d2 |
| U14 | 生产构建剥离 console/debugger + 聊天背景改不透明 + bundle 校验脚本 | WS-4 | bd435bb |
| U15 | 等候室遮罩「{已加入} of {总数}」+ 等待时禁用整盘交互 | WS-6 | 151234f |
| SEC-1b | playAgain 也带 `unlisted`,重赛不再泄露房间码/玩家名（终审发现） | SEC | 1fcf6bc |

## 4. 关键不变量（经终审跨分支核实）

- **服务器权威 / 反作弊不退化:** `forceEndTurn` 的到点守卫与「超时即破坏」路径原样保留;新 move
  (`submitMeld`/`forfeitTurn`) 首行校验 `playerID === ctx.currentPlayer`,不触碰 `timerExpireAt`,不让客户端裁定合法性。
- **手动无效提交端到端非破坏:** 客户端在拒绝时不调用任何破坏性 move,牌留原位,回合不结束;经 solo Playwright
  冒烟实证（盘面 3→3、手牌 11→11、红按钮 + 内联「…at least 30 — you have N」）。
- **计时/memo/dnd 三处重构相互兼容**,无悬挂引用;生产产物干净。
- 应用内文案为英文;juice 受 `prefers-reduced-motion` + mute 门控。

## 5. 测试与验证（owner 可复现）

- `npx jest` → 33 套件 / **140** 用例全绿（含新增:reason 码、submitMeld no-op、forfeitTurn、resolveDropSlot、
  按玩家手牌占用、牌格 memo 渲染计数、计时下沉渲染计数 + 单发 watcher、等候室遮罩等)。
- `npm run build` → 成功;`grep` 产物无 `console.log`/`RENDER BOARD`。
- 安全:REST 冒烟验证创建的对局与 playAgain 对局都不在 `GET /games/RummyCube` 列表中,但仍可按 id 加入。

## 6. 遗留事项（post-merge backlog,终审判定不阻断合并）

- **无 `playerView`（中高）:** 完整 `G.tilePositions`（含对手手牌）下发到每个客户端 —— 这是**既有**问题,本 Sprint
  未引入也未回归;属真实反作弊缺口,建议作为独立任务(Sprint 2/3)补 `playerView`。
- **boardgame.io 仍信任请求体的 `unlisted`:** SEC-1b 是客户端修复;服务端信任请求体属 vendor 行为,出范围。
- 开发脚本陈旧:`scripts/preview/*.mjs` 仍点击已改名的「End」;`smoke-timer.mjs` 抓取的是 reducer 日志（联机
  master 才打印）——需更新为观察服务端 stdout。均为 dev-only,无运行时影响。
- `src/server.js` 不加载 `.env`,本地 solo 冒烟需显式传 `REACT_APP_*`（生产用 `node --env-file`,无影响）。
- 单 chunk 566 kB（拆包是 WS-13/Sprint 3）;RTL `act()` 警告为库内部既有噪音。
- **T2-2 首回合 coach card 顺延:** 计划里属 WS-2,但需 in-match `ctx`,为避免与 Board.jsx 串行争用,本 Sprint 未做,
  顺延到 Sprint 2 的 Board 链或 WS-5 一并做。

## 7. 下一步

- 合并方式:rebase 到 `main`(保持线性历史)或开 PR。分支当前领先 `main` 20 个 commit,未推送。
- Sprint 2（P1）:WS-5（回合/计时可读）、WS-7（移动端布局)、WS-8（对比度/可达性)、WS-9（combo 重设计)
  + WS-6 邀请面板打磨 + T2-2 coach card;开工前需 owner 拍板开放决策 #2（combo 加权）。
