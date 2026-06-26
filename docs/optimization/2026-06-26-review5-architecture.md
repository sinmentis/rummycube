# RummyCube — Architecture & Maintainability Review (Review 5)

> Date: 2026-06-26 · Lens: 软件架构 / 可维护性 / 技术健康度 · 范围: `src/rummikub/**`, `src/server.js`, build/env
> 非安全审计、非逐行 bug 猎杀。聚焦边界、职责、可演进性。442 测试全绿，是做以下重构的安全网。

## TL;DR

单点最高杠杆: **拆 `Board.jsx`(755 行的 god component)**。它是每一轮 UX 新功能的落点、`gRef`/stale-closure 风险的源头、也是 merge 冲突重灾区。按 `dndUtil.js` + `insertPush.js` 已经示范好的"纯函数 + 单一职责 + 客户端/服务端共享内核"的缝来切:把持久化 UI 偏好、庆祝特效、drop 派发、give-up 确认等抽成 hooks,让 Board 退化成布局壳。

**先落地的零后悔前置项**: 引入 ESLint + `react-hooks/exhaustive-deps`(当前**完全没有**任何静态检查)。它会机械地点出 Board 里那些靠 `gRef.current` 绕过的依赖数组陷阱——正是拆分时必须先看清的东西。成本 S,几乎零风险。

第二梯队是把 `moves.js` 的 turn/掉线裁决与计分逻辑、`util.js` 的 5 个混居领域各自归位。`dndUtil`/`insertPush`/`moveValidation` 三个模块是本仓库的**正面范本**,重构方向就是让其它文件长成它们的样子。

---

## Findings(按杠杆排序;标签: `立即` / `渐进` / `观察`)

### 1. `Board.jsx` 是 god component,职责严重外溢 — Impact: High × Effort: M(可分批) × Risk: Med `立即`

**问题** `src/rummikub/components/Board.jsx`(755 行)在一个函数组件里塞了至少 7 类互不相干的职责:
- 持久化 UI 偏好的 3 套独立 localStorage 状态机: coach card(L46–59)、hints 开关(L64–100)、hints tip(L76–107);
- 一坨瞬时 UI 状态: selection / drag / hover / combo / syncing / give-up-arm / submitReason / invalidTiles(L130–253 散布);
- DnD 编排 + drop 派发接线: `dispatchDrop`/`onDragStart`/`onDragEnd`/`onCellTap`(L198–293);
- "所有人一起庆祝"的命令式特效块,直接读 `G.lastPlay`(L162–188);
- give-up 两段确认状态机(L368–382)、键盘落子(L495–518);
- 大段 JSX 装配(sidebar / tableSeats / avatar / banners / buttons / overlays, L531–735)。

**为什么伤可维护性** 这是所有未来 UX 功能的落点,每轮都往这里加,文件只会更大、更易冲突。更糟的是状态耦合:为了躲 stale closure,代码到处用 `gRef.current`(见 #5),逻辑越集中越难安全地动。一个本应是"加个开关"的改动,现在要在 700 行里找上下文。

**建议(要切的缝)** 抽成聚焦 hooks,Board 只留布局与组装:
- `usePersistentFlag(key)` —— 统一 coach / hints / tip 三处重复的 localStorage 读写模式;
- `useComboCelebration(lastPlay, {localSeat, isDragging})` —— 把 L162–188 的特效副作用搬走,内部复用已有的纯函数 `resolveJuice`(`juice/gating.js`);
- `useGiveUpConfirm(moves)` —— L368–382 整段;
- `useDropDispatch({moves, playerID})` —— drag / tap / keyboard 三条落子路径已经共用 `dispatchDrop`,顺势收进一个 hook,内部持有 G 的当前值(见 #5);
- `useSyncingCue()` —— L152–159。

分批做、每批跑测试即可,442 测试覆盖了行为。先做 #2 再动这里,exhaustive-deps 会帮你确认每次抽取没有漏依赖。

---

### 2. 全仓库零静态检查 / 零类型 — Impact: High(预防性) × Effort: S × Risk: Low `立即`

**问题** 没有 ESLint、Prettier、TypeScript、`tsconfig`、pre-commit 中任何一项(已确认 `package.json` scripts 只有 build/test/serve/dev,无 lint;根目录无 eslint/ts 配置)。对一个用**位运算打包 tile 整数**(`util.js` `buildTileObj`/`getTileValue`)、依赖 **immer draft + `INVALID_MOVE` 丢弃语义**、且 `playerID` 在 string/number 间反复横跳的代码库,这是实打实的速度税。

**证据** `src/rummikub/**` 里 `String(...)` 对 id/playerID/seat 的防御性强转有 **24 处**、`Number(...)` 有 **20 处**——比如 `String(pos.playerID) !== String(playerID)`(`moves.js:179`、`boardUtil.js:17,37`)。这种"stringly-typed 跨边界"正是类型系统一行就能钉死的东西,现在靠人肉强转散落各处。

**建议** 立刻加最小 ESLint(`no-undef`/`no-unused-vars`/`no-shadow` + **`react-hooks/rules-of-hooks` 与 `react-hooks/exhaustive-deps`**),后者直接命中 #1/#5 的依赖数组陷阱。中期可对纯模块(`util`/`dndUtil`/`insertPush`/`moveValidation`)上 JSDoc + `checkJs` 渐进式 TS,先把 tile codec 和 `tilePositions` 的形状标注出来。零运行时风险。

---

### 3. `moves.js` 把"reducer 接线 / turn 裁决 / 掉线策略 / 计分"四件事揉在一起 — Impact: High × Effort: M × Risk: Med `渐进`

**问题** `src/rummikub/moves.js`(570 行)同时承担:
- move reducers(`drawTile`/`moveTiles`/`insertTilesWithPush`/`submitMeld`/`retrieveJoker`…)—— 本该如此;
- turn 生命周期 hooks `onTurnBegin`/`onTurnEnd`/`onPlayPhaseBegin`(L459–533);
- 掉线/弃座**策略**: `GRACE_MS`/`N_FORFEIT_TURNS`(L439–440)、`forfeitSeat`(L468–481)、`lastTimeout` 瞬态的生命周期(L522–524);
- **领域计分**: `applyValidMove`(L300–343)在这里现算 `jokerValueById`、`points`、`manipulationScore`、`rearranged/placed`,构造 `G.lastPlay`。

**为什么伤可维护性** turn/timeout/掉线是**最安全攸关**的服务端权威逻辑,却和 tile 摆放、计分庆祝交织在同一文件。要审计"一个掉线的座位到底怎么被推进/弃座",得在 570 行里跳着读。计分(`applyValidMove` 里的 joker 冻结取值)是**领域逻辑**,放在 move 管线里属于错层——它和 `util.js` 的 `freezeSeqJokers`/`countSeqScore` 是同一个领域。

**建议(要切的缝)**
- `turn.js`: `onTurnBegin`/`onTurnEnd`/`onPlayPhaseBegin` + 掉线策略常量 + `forfeitSeat` + `lastTimeout` 瞬态规则,单独成文件,turn 权威可独立审计/测试;
- `play.js`(或并入计分模块): 把 `applyValidMove` 里构造 `lastPlay` 的那段计分搬到与 `countSeqScore`/`freezeSeqJokers` 同层。move 只负责"判定有效 → 调用计分 → freeze → endTurn"。

---

### 4. `util.js` 是 junk drawer,且让服务端权威代码与 DOM 代码同居 — Impact: Med-High × Effort: M × Risk: Low `渐进`

**问题** `src/rummikub/util.js`(661 行)至少混了 5 个领域:
1. **tile codec**(位打包): `buildTileObj`/`getTileValue`/`getTileColor`/`setTile*`/`deactivateTileVariant`(L47–84);
2. **序列合法性 + 计分**: `countSeqScore`/`isSequenceValid`/`freezeJokersIn*`/`isSameColor|Value|DiffColor`(L115–332);
3. **终局计分**: `countPoints`/`findWinner`(L334–376);
4. **位置投影**: `buildGridsFromTilePositions`/`getHandsTilesGrid`/`getPlayerHandTiles`/`deriveHandCounts`(L501–620);
5. **playerView 隐私边界**: `stripHandTilePositions`/`sanitizeSnapshot`/`playerView`(L545–603)。

更刺眼的是 **DOM 工具** `copyToClipboard`(L466–490,直接摸 `navigator`/`document`)和 `stringToColor` 也在这里——而 `util.js` 被 `moves.js`(**服务端**经 `node src/server.js` 直接执行)import。虽然 tree-shaking 让 server 实际不碰 `copyToClipboard`,但"服务端规则代码与浏览器 DOM 代码同模块"是明确的分层异味。

**为什么伤可维护性** import `getTileValue` 的人被迫拉进整坨无关领域;`playerView` 这种**安全攸关的隐私剥离**淹没在工具堆里,改一处不易看清影响面。

**建议(要切的缝)** 拆成 `tile/codec.js`、`tile/sequence.js`(含 joker freeze)、`scoring.js`(countPoints/findWinner)、`projection.js`(grid 投影)、`playerView.js`(隐私边界——**单独命名最重要**,它是安全缝)。`copyToClipboard`/`stringToColor` 迁到纯前端 util,彻底切断服务端模块对 DOM 的传递依赖。纯函数迁移 + 现有测试,风险低。

---

### 5. 状态模型缺乏成文约定: `gRef` 兜底、`recentlyDrawnTiles` 三段往返 — Impact: Med-High × Effort: M × Risk: Med `渐进`

**问题** Board 维护 `gRef`(每次 render 无依赖更新,L138–139)与 `stateRef`(L136–137),`dispatchDrop`/`onLongPress`/`onCellTap` 都读 `gRef.current.tilePositions` 来躲 stale closure。这能用,但是**临时 ad-hoc 模式重复出现**,没有约定。
更绕的是 `recentlyDrawnTiles`:服务端 `G.recentlyDrawnTiles` → effect 镜像进本地 state(L116–128)→ 800ms 后再调一个**服务端 move** `clearRecentlyDrawnTiles`(`Game.js:86–88`)清掉。一个纯展示性的"刚摸到的牌"高亮,走了 G + 本地 state + 一个清理 move 三条路。

**为什么伤可维护性** 两套"selection/drawn"真相来源容易发散;`gRef` 是 stale-closure 这一整类 bug 的温床,新人很难知道何时该用 `G` 何时该用 `gRef.current`。

**建议** 写下一条约定并落到 `ARCHITECTURE.md`(#7): **G 是唯一权威;本地 state 仅承载纯瞬时 UI(selection/drag/hover);任何需要 `gRef` 的逻辑都说明它应该进 hook 并显式持有当前值**。把 drawn-tiles 高亮简化为纯客户端瞬时态(由 `G.recentlyDrawnTiles` 变化驱动一个本地定时器,去掉回写 move),减少一次 server 往返。配合 #1 的 `useDropDispatch` 一起做。

---

### 6. 测试缺共享 G-factory,14 份手搓 setup 把 G 形状复制了 14 遍 — Impact: Med × Effort: M × Risk: Low `渐进`

**问题** 442 测试是真实力,也是上面所有重构的安全网——这点要肯定。但 14 个 boardgame.io Client 集成测试各自手搓 `{...Rummikub, setup: () => ({...自定义 G})}`(如 `scenario.test.js:14,67`),**没有**共享工厂(`rtl-harness.test.js` 只是 JSX 冒烟,不是工厂)。G 形状被复制 14 次。

**连带成本** WS-12 加了 `connected`/`disconnectTurns`/`forfeited` 后,这些旧 setup 大多没带这些字段,于是**生产代码**在 `onTurnBegin` 里背了一串向后兼容兜底 `if (!Array.isArray(G.connected)) ...`(`moves.js:488–490`)——本质是为测试夹具买单的 shim。

**建议** 加 `makeMatch({hands, pool, firstMoveDone, ...})` 测试工厂,产出**完整且当前**的 G。一来消重,二来可以**删掉**生产代码里的兼容兜底,反向收紧 prod。

---

### 7. 新人 onboarding 无图: 没有 ARCHITECTURE / 不变量文档 — Impact: Med × Effort: S-M × Risk: Low `立即`

**问题** README 是面向玩家的产品介绍;`docs/` 下全是逐轮 review/spec。没有任何文档讲清楚架构**不变量**:`G` 的形状、`tmp` tile 的生命周期、move 契约(**返回 `INVALID_MOVE` ⇒ immer draft 整体丢弃 ⇒ 原子无操作**,这是 `submitMeld`/`retrieveJoker`/`insertTilesWithPush` 的核心约定)、`playerView` 的隐私剥离、undo/redo 的快照模型、客户端预览与服务端 move 共享内核的那条缝。

**为什么伤可维护性** 这些恰恰是"违反了就出诡异多人 bug"的非显然约定。新贡献者只能逆向 570 行 `moves.js` 去猜。

**建议** 写一页 `docs/ARCHITECTURE.md`: ① G 字段表 + 不变量;② move 原子性契约(INVALID_MOVE = abort);③ 模块地图(谁是纯的、谁能被 server import、隐私边界在哪);④ 客户端/服务端共享内核清单(`insertWithPush`/`boardRowTiles`/`orderTilesBySource`)。复利式收益。

---

### 8. 服务端游戏逻辑日志无分级,且每次摸牌打印整副牌序 — Impact: Med × Effort: S × Risk: Low `立即`

**问题** 注意区分: Vite build 通过 `dropConsolePlugin`(`vite.config.js:158–166`)已经把**前端** bundle 的 `console.*` 清掉了——前端没问题。但 `src/server.js` 是 **raw Node ESM 直接执行**,`moves.js` 原样运行,其中 **22 处 `console.*`** 全部在生产服务端跑。热路径上有真问题:`drawTile` 每次摸牌 `console.log(\`tiles pool: ${current(G.tilesPool)}\`)`(`moves.js:47–48`)把**整副剩余牌的顺序**打到 stdout;`onTurnBegin`/`onTurnEnd`/`onPlayPhaseBegin` 每回合 `new Date()` 刷屏(L460/484/530)。

**为什么伤健康度** 容器 512M 内存上限下的日志噪声;牌序进服务端日志虽不直接泄给客户端,但属不必要的状态外溢,也淹没了真正该看的告警。

**建议** 引一个极简带 level 的 logger(或给服务端构建也加一道 console 过滤/`debug` 库),把热路径的 `console.log` 降级为 `debug` 并默认关。成本 S。

---

### 9. 运行时配置无校验 + 一处死代码 — Impact: Low-Med × Effort: S × Risk: Low `立即`

**问题** `constants.js` 在 import 期从 env 解析**游戏规则**且不校验: `TILES_TO_DRAW = parseInt(process.env.REACT_APP_TILES_TO_DRAW)`(L6)、`FIRST_MOVE_SCORE_LIMIT = parseInt(...)`(L7)。变量缺失/拼错时静默得到 `NaN`,并被 Vite 在**构建期烤进 bundle**,直接污染发牌数/首出 30 分门槛这类规则,且无任何早失败。(env 烘焙机制本身的 `.env.production.local` 坑已知,不在此重复;这里说的是**缺校验**。)
另有死代码: `HAND_ROWS = IS_DEV ? 2 : 2`(L3)两个分支都是 2。

**建议** 加一小段 env 断言(关键数值 `Number.isFinite` 否则 build/boot 失败),把"配置错误"从"线上规则诡异"提前到"构建失败"。顺手删掉 `HAND_ROWS` 的死三元。

---

### 10. `connTransport.js` 深耦合 boardgame.io 0.50 私有内部 — Impact: Med(若升级) × Effort: M × Risk: — `观察`

**问题** `src/rummikub/connTransport.js` 为把 socket 连接状态镜像进权威 `G`,伸手进了 boardgame.io **私有内部**: 注释里写死了 bundle 行号(`server.js:3391/3606/3905`)、`new Master(...)` 复制了一个框架私有的 Master(L71)、依赖 `app._io.of(game.name)` 命名空间与 `MATCH-${id}` pubSub 频道命名约定。文档写得**极好**(展示了对框架的深入理解),但也正因此**极度版本脆弱**——一次 boardgame.io 小版本升级很可能静默打破它。

**建议(观察,非立即)** 在 `package.json` 里把 boardgame.io **精确锁版**;加一个聚焦集成测试,断言"一个 socket 断开会把 `G.connected[seat]` 翻成 false";在 `ARCHITECTURE.md` 标注这是升级时的高风险点。只要没有依赖升级计划,维持现状即可。

---

### 11. 正面范本 + 一个发散观察项: DnD 派发层是该被复制的缝 — Impact: Med × Effort: — × Risk: — `观察`

**值得肯定(并作为重构北极星)** `dndUtil.js`(`resolveDropDispatch` L201–241)+ `insertPush.js` + `boardUtil.js` + `moveValidation.js` 是本仓库**最干净**的部分: 纯函数、单一职责、注释到位,且客户端预览与服务端 move **共享同一内核**——`insertTilesWithPush`(`moves.js:145`)与客户端 `resolveDropDispatch` 都调 `insertWithPush`/`boardRowTiles`/`orderTilesBySource`,几何/路由零重复、零发散。#1/#3/#4 的方向就是让 Board/moves/util 长成这个样子。

**一个观察项(发散风险)** 唯独**计分**路径没有这样的共享模块: `applyValidMove` 里现算 joker 代表值与 `manipulationScore` 的逻辑(`moves.js:300–343`)只在服务端存在。今天没问题(客户端不预览分数),但一旦某轮要做"落子即时预览得分/combo",客户端很可能**重新实现**一份,埋下与服务端发散的种子。建议在动 #3 的 `play.js` 时,就把它做成**可被客户端 import 的纯模块**,提前堵住。

---

## 优先级速览

| # | 项 | Impact | Effort | Risk | 标签 |
|---|---|---|---|---|---|
| 1 | 拆 `Board.jsx` god component → hooks | High | M | Med | 立即(分批) |
| 2 | 引入 ESLint + react-hooks(零静态检查) | High | S | Low | 立即 |
| 3 | `moves.js` 拆 turn/掉线/计分 | High | M | Med | 渐进 |
| 4 | `util.js` 拆 5 领域 + 驱逐 DOM 代码 | Med-High | M | Low | 渐进 |
| 5 | 状态模型约定(G 权威 / `gRef` / drawn 往返) | Med-High | M | Med | 渐进 |
| 6 | 测试 G-factory,删生产兼容 shim | Med | M | Low | 渐进 |
| 7 | `ARCHITECTURE.md`(G 形状 + 不变量 + move 契约) | Med | S-M | Low | 立即 |
| 8 | 服务端日志分级 / 停打牌序 | Med | S | Low | 立即 |
| 9 | env 校验 + 删死代码 | Low-Med | S | Low | 立即 |
| 10 | boardgame.io 私有内部耦合 | Med | M | — | 观察 |
| 11 | DnD 层=范本;计分发散风险 | Med | — | — | 观察 |

**下一轮 feature 前的最小集**: #2(半天)+ #7(半天)+ #8/#9(各 1–2h)先清掉低成本健康债,再以 #2 的 exhaustive-deps 为护栏启动 #1 的分批拆分。#3/#4/#5/#6 随后顺势推进。#10/#11 仅观察。
