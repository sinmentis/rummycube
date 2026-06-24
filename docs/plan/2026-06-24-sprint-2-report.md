# RummyCube 优化 · Sprint 2 实施报告（stage report）

**日期:** 2026-06-24 · **分支:** `feat/optimization-sprint2`(基于 `main` @ ef3717d,未推送)· **owner:** @sinmentis
**计划来源:** `docs/plan/2026-06-20-final-design-doc.md`(Sprint 2 = P1)

## 1. 结果概述

Sprint 2 全部 11 个执行单元(S2-U1…U11)+ 1 个由终审发现的 Critical 修复,已实现、逐个评审通过并整合。

- **覆盖的 workstream:** SEC(playerView)、WS-9(combo 重设计 + juice 门控)、WS-5(回合/计时可读)、
  WS-8(对比度 + 键盘 + 命中区)、WS-7(移动端:牌架可达 / 聊天 FAB / 控件不出屏)、WS-6(邀请面板)、
  WS-2(首回合 coach card,Sprint 1 顺延项)。
- **owner 决策(本轮锁定):** combo = manipulation 加权;移动端聊天 = FAB 折叠;包含 playerView。
- **测试:** jest **140 → 197**(+57),全绿;生产 `npm run build` 成功且产物无 `console.log`。
- **提交:** 13 个 commit(见 §3)。Conventional Commits + Co-authored-by trailer,未推送。
- **终审(whole-branch,opus):** YES-WITH-FIXES —— Sprint 2 改动本身核实干净;唯一阻断项是一个**既有**的
  生产启动崩溃(见 §4),已修复并实测服务器可启动。

## 2. 执行方式

沿用 subagent-driven-development:每单元一个全新 implementer(TDD)+ 一个 reviewer(规范 + 质量双判),
Critical/Important 必修。全部子代理 `claude-opus-4.8`。文件不冲突的单元做了流水化(如 playerView∥combo、
chat FAB∥对比度);Board.jsx/board.css 密集的尾段串行。进度写入 `.git/sdd/progress.md` ledger。

## 3. 完成的工作(按单元)

| 单元 | 内容 | WS | commit |
|---|---|---|---|
| S2-U1 | `playerView`:对每个客户端隐藏对手手牌 + 摸牌堆(保留计数/栈长度) | SEC | e5905a5 |
| S2-U2 | combo 按 manipulation 加权(组数 + 重排并入)而非张数,freeze 前算入 `lastPlay` | WS-9 | 498ac06 |
| S2-U3 | juice 按归属门控(对手不震屏/不响 win;拖拽中不 kick)+ 减轻有效提交 paint | WS-9 | e9d2adf |
| S2-U4 | 回合横幅 + 计时环中心秒数(色觉安全) | WS-5 | b5bfd1f |
| S2-U5 | 橙色 `#a85c08`(4.24:1)+ ✓/✕ 非颜色第二通道 | WS-8 | 61adf4d |
| S2-U8 | 窄屏聊天折叠成可点 FAB(桌面保持常驻) | WS-7 | 8d879b0 |
| S2-U6 | 键盘 Undo/Redo(Ctrl/Cmd+Z/Y,含可编辑元素守卫)+ ~44px 移动命中区 | WS-8 | ac36922, 15bffae |
| S2-U7 | 牌架在 390px 可横向滚动触达全部 22 列 | WS-7 | 6e30a93 |
| S2-U9 | 限制棋盘高度 + 内部滚动,使控件/牌架始终在屏;座位头像不压牌架 | WS-7 | 8b31e12 |
| S2-U10 | 邀请面板更清晰(「Need more players?」+ 大号房间码/复制) | WS-6 | b5edd0a |
| S2-U11 | 一次性首回合 coach card(localStorage 记忆,不盖棋盘) | WS-2 | 9434830 |
| FIX | 服务端 ESM 入口加 `.js` 扩展名,修复生产容器启动崩溃 | — | dec0d8a |

## 4. 终审 Critical(已修复)

- **生产容器启动崩溃(既有,非本轮回归):** `src/rummikub/dndUtil.js` 用了无扩展名的 `import "./constants"`。
  Dockerfile 的 `CMD ["node","src/server.js"]` 以原生 Node ESM 直接运行(`"type":"module"`,无打包器/loader),
  该 import 在 Node ESM 下非法,导致容器 `ERR_MODULE_NOT_FOUND` 立即退出。两个实现子代理在本地起服务时都撞到。
  线上当前仍跑着 Sprint 1 之前的旧镜像,所以未暴露——但**下次部署会崩**。
- **修复:** 改成 `./constants.js`(commit dec0d8a)。已**实测**按 Dockerfile 入口启动:`node src/server.js` →
  `App serving`,`/games -> ["RummyCube"]`;终审确认这是服务端可达 `.js` 图里唯一的无扩展名 import。

## 5. 关键不变量(经终审跨分支核实)

- **服务器权威/反作弊不退化:** 本轮 `moves.js` 仅新增 manipulation 评分(在 `applyValidMove`、freeze 前);
  Sprint 1 的 `forceEndTurn`/`submitMeld`/`forfeitTurn`/到点守卫原样保留;无新增客户端信任。
- **playerView 纯函数且安全:** `cloneDeep` 不改服务端 G;跨 `tilePositions`/`prevTilePositions`/undo-redo 快照
  隐藏对手手牌;摸牌堆按长度脱敏(`fill(0)`,`0` 不与真实 tile id 冲突);`handCounts` 保计数、栈长度保 Undo/Redo。
- 应用内文案英文;juice 受 `prefers-reduced-motion` + mute 门控。

## 6. 测试与验证(owner 可复现)

- `npx jest` → 33→**40 套件 / 197 用例**全绿(新增:player-view、comboMath/last-play、resolve-juice、
  ring-seconds/turn-banner、contrast+glyph、chat-fab、keyboard-undo-redo、build-row-occupancy、
  invite-panel、coach-card 等)。
- `npm run build` 成功;产物无 `console.log`/`RENDER BOARD`。
- 服务端入口实测可启动(见 §4)。

## 7. 遗留事项(post-merge backlog,终审判定不阻断)

- **combo 调参:** `comboLabel` 3/5/7 阈值在新评分区间下大多落到「ON FIRE」;`W_GROUP/W_INTEG/W_PLACE` 与阈值均
  `[PLACEHOLDER]`,需 playtest 调参与重设阈值。
- 文案/细节:对手出牌的「+points」浮字仍显示(已门控其它特效);移动端邀请条命中区 36px(AA 合格,未达 44px AAA);
  coach card 说「runs/sets」而 Sort 按钮说「runs/colours」,术语待统一。
- 单 chunk 566 kB(拆包是 WS-13/Sprint 3);若干 RTL `act()` 既有告警。

## 8. 下一步

- 合并:rebase/fast-forward 到 `main`(线性);**强烈建议合并后重新部署**(本轮含 Critical 启动修复 + Sprint 1/2
  的全部 UX/安全改进,线上仍是旧镜像)。
- Sprint 3(P2):WS-10(降低空闲)、WS-11(joker 深度)、WS-12(断线,先架构 spike)、WS-13(持久化 + 拆包)、
  WS-14(tap-to-place)。注意 WS-13 持久化前需先把 `node-persist` 加入 dependencies(见 Sprint 1 报告/项目 memory)。
