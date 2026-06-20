# RummyCube 优化 · 架构与计划骨架(Software Architect)

**日期:** 2026-06-20 · **作者角色:** Software Architect · **状态:** 草稿(供后续写正式 Plan 用)
**权威来源:** `docs/optimization/2026-06-20-rummycube-optimization-spec.md`(WS-1..WS-18)
**背景评审:** 同目录 5 份 `2026-06-20-rummycube-review-{1..5}.md`

> 本文档**不是代码**,而是把 spec 转化为可据以拆任务的实现级架构设计。所有数值参数标 `[PLACEHOLDER]`,正式 Plan 阶段定值。论断尽量给 `file:line`;无法确认处标「待核实」。

---

## 0. 现状事实基线(已读代码核实)

| 事实 | 证据 |
|------|------|
| 单 Node 进程同时跑 boardgame.io Server + 托管 `build/` 静态前端,端口 9119 | `src/server.js:13-18,21,47-56` |
| 服务器**未配 `db`** → boardgame.io 默认 InMemory,重启清空对局与 `/api/stats` | `src/server.js:13-17`(无 `db:` 字段);spec L167 |
| `/api/stats` 通过中间件读 `server.app.context.db` 聚合元数据,只暴露计数 | `src/server.js:25-45` |
| 客户端 `endTurn()` 在 `setTimeout` 内**总调用 `moves.endTurn()`** | `Board.jsx:154-175`(L173) |
| 服务端 `endTurn` 对脏盘面走 `validatePlayerMove`;无效 → `drawTile()`(罚抽)+ `rollbackChanges()` + `events.endTurn()` | `moves.js:127-140, 219-251`(L249) |
| `forceEndTurn` 仅在 `getSecTs() >= G.timerExpireAt` 时才允许(反作弊) | `moves.js:142-157`(L148-150) |
| 校验函数 `isFirstMoveValid`/`isMoveValid` 返回**裸 boolean**,原因仅 `console.debug`,below-30 分数为局部变量 | `moveValidation.js:79-100, 105-145`(L127,L140-143) |
| `G.lastPlay.points` **仅在有效路径**设置(freeze 之前算) | `moves.js:230-244` |
| `G.prevTilePositions` 每回合在 `onTurnBegin` 重置为当前盘面 | `moves.js:259-268`(L267) |
| `onTurnBegin({G, ctx})` **无 `matchData`/`isConnected`** | `moves.js:259`(签名只有 `{G,ctx}`) |
| `isConnected` 仅 boardgame.io match metadata,UI 消费(`PlayerAvatar`),非权威 game state | `Board.jsx:301`;spec L143 |
| `GridSlot`/`Tile`/`GridContainer` 收**整个 `selectedTiles` 数组**(每次换引用)→ `React.memo` 无效 | `GridSlot.jsx:14,19,34`;`GridContainer.jsx:30,51`;`Board.jsx:234,252` |
| `Board` 顶层 `useTurnTimer` 返回 `timeLeft`,400ms tick 触发**整盘重渲染**(~332 槽) | `Board.jsx:264-269`;spec L80 |
| 每次渲染 `console.log('RENDER BOARD')`,move 内多处 `console.log/debug` | `Board.jsx:27`;`moves.js:43-44,129` 等 |
| `handleTileSelectionCb` deps `[G, playerID, state]` 且内含 `console.log(state)` | `Board.jsx:109-112` |
| juice 双门控**未统一**:`reduced()`(reduced-motion)在 `effects.js`,`muted`(localStorage)在 `sfx.js`,各管各 | `juice/effects.js:6-11,13,32,45`;`sound/sfx.js:6-7,46,67,76,81` |
| `fx.kick` 直接 `document.querySelector('.board')` 并切 class,对 20-box-shadow 子树触发重排 | `juice/effects.js:34-40+`;spec L122 |
| 有效 submit 同时放 confetti + flash + kick + celebrateGroups + float + 两次 sfx | `Board.jsx:77-83` |
| `vite.config.js` **无 `esbuild.drop`、无 `manualChunks`** | `vite.config.js` 全文(无相关字段) |
| `bootstrap`/`react-bootstrap` 在依赖中(WS-13 待评估是否可移除) | `package.json` deps |
| 测试:`npm test`(jest),`src/tests/` 现 ~20 个测试文件 | `package.json:scripts.test`;`src/tests/` |
| 构建产物在 `build/`(由 `BUILD_PATH` 决定,默认 `build`) | `vite.config.js` buildPathPlugin |

---

## 1. 架构总览:优化后的模块边界

本轮优化的核心架构主题是:**把"决策与判定"收敛到服务端权威层,把"渲染与反馈"在前端解耦为可独立刷新的子系统,并新增一条"连接状态 → 权威 state"的纵向通道**。

### 1.1 分层视图(目标态)

```
┌─────────────────────────────────────────────────────────────────────┐
│ 前端 (React 18 + Vite + @dnd-kit)                                     │
│                                                                       │
│  渲染层 (memoized)          juice 层 (门控统一)      教学/HUD 层         │
│  ├ Board(协调器,不随tick重渲)  ├ effects (reduced)    ├ HowToPlay 模态    │
│  ├ GridContainer/GridSlot/Tile ├ sfx (muted)          ├ 首回合教学卡       │
│  │  (收 isSelected 布尔)      └ juiceGate(统一谓词)    ├ 等待室 overlay      │
│  ├ <TurnTimer> 自管 tick       └ 拥有权缩放(自己/对手) ├ Turn banner/秒数    │
│  └ 拖放解析 resolveDropSlot                            └ 连接/重连 banner    │
│        │ moves.submitMeld / moveTiles / forfeitTurn / drawTile        │
└────────┼──────────────────────────────────────────────────────────────┘
         │ WebSocket (boardgame.io transport)
┌────────▼──────────────────────────────────────────────────────────────┐
│ 服务端权威 (单 Node 进程, src/server.js)                                │
│                                                                       │
│  moves 层 (意图)            校验/判定层 (纯函数)        评分层 (pre-freeze)│
│  ├ submitMeld (新, 无效no-op) ├ submitRejectReason(新)   └ manipulation   │
│  ├ forfeitTurn (新, 显式罚抽)  ├ isFirstMoveValid/isMoveValid              │
│  ├ forceEndTurn (保留, 到点)   │  (重构:返回 code+score)  在 validatePlayerMove│
│  ├ endTurn / drawTile / moveTiles ├ resolveDropSlot(纯)   内 freeze 之前写   │
│  └ undo/redo                   └ playableTiles(纯)        G.lastPlay         │
│                                                                       │
│  连接状态通道 (新, spike)        持久化层 (新)                            │
│  └ 中间件/插件/onConnectionChange └ InMemory → FlatFile/SQLite           │
│     → 写 G.connected[seat]          (db 注入 Server config)             │
│                                                                       │
│  静态托管: koa-static → build/   ·   /api/stats 聚合中间件               │
└───────────────────────────────────────────────────────────────────────┘
```

### 1.2 各模块边界与单一职责(目标态)

- **moves 层(意图/命令)**:接收玩家意图,做最小权限/阶段校验,委派给校验层与评分层。**新增** `submitMeld`(无效 no-op、有效走 freeze+lastPlay+endTurn)、`forfeitTurn`(显式确认的弃权 → rollback+罚抽)。`forceEndTurn`/`endTurn`/`drawTile`/`moveTiles` 保留语义。
- **校验/判定层(纯函数,`moveValidation.js`)**:盘面合法性判定。重构 `isFirstMoveValid`/`isMoveValid` 以产出**结构化结果**(经 `submitRejectReason`),boolean 退化为 `code === 'OK'`。新增纯函数 `resolveDropSlot`、`playableTiles`,可独立单测。
- **评分层(`validatePlayerMove` 内,freeze 之前)**:manipulation/combo 分数**必须在 freeze 前算**并写入 `G.lastPlay`,因为 `prevTilePositions` 在下一个 `onTurnBegin` 就丢失基线(`moves.js:267`)。
- **连接状态通道(新,纵向)**:把 boardgame.io 的连接事件**镜像进权威 game state**(`G.connected[seat]`),供回合推进与弃权逻辑读取。这是 WS-12 的架构 spike,也是 WS-13 重连体验的依赖之一。
- **持久化层(新,横切)**:由当前 InMemory 切换到 FlatFile 或 SQLite,使重启不清空对局与 `/api/stats`,并支撑重连。
- **渲染层(前端)**:槽/瓦片 memo 化,收 `isSelected` 布尔而非数组;回调经 ref 稳定;计时 tick 下沉到自管组件,使 `Board` 不再随 tick 重渲。
- **juice 层(前端)**:统一 reduced-motion + mute 门控谓词;按"拥有权"缩放(自己全特效/对手柔化);把 `kick` 改为 transform-only 包裹层动画。
- **教学/HUD 层(前端)**:How-to-play 模态、首回合教学卡、等待室 overlay、回合 banner/秒数、重连 banner。静态内容,无后端。

---

## 2. WS-1..WS-18 依赖图与关键路径

### 2.1 依赖矩阵(谁依赖谁)

| WS | 依赖于 | 被谁依赖 | 可与谁并行 |
|----|--------|----------|-----------|
| **WS-1** 安全 submit + reason code | 无(基石) | WS-5(内联诊断)、WS-8(教学高亮第二通道)、WS-9(评分写入路径同在 validatePlayerMove) | WS-2、WS-3、WS-4、WS-6 |
| **WS-2** 新手引导 | 无 | — | WS-1/3/4/6(纯前端静态,几乎全并行) |
| **WS-3** 可读盘面 + resolveDropSlot | 无(纯函数 + CSS) | WS-7(移动端复用布局) | WS-1/2/4 |
| **WS-4** 性能(memo + 回调稳定 + TurnTimer 下沉) | **内部强耦合**:memo 仅在 `isSelected` 布尔 + 回调 ref 稳定后才生效(spec L83,L178) | WS-5(TurnTimer 组件承载秒数/警示)、WS-9(juice 重绘削峰共用渲染边界) | WS-1/2/3 |
| **WS-5** 回合/计时可读 | **WS-1**(reason code 喂内联诊断)、**WS-4**(TurnTimer 组件是 banner/秒数载体) | — | WS-7/8(同一 Sprint) |
| **WS-6** 等待室(已提升至 P0) | 无 | — | WS-1/2/3/4 |
| **WS-7** 移动端布局 | WS-3(盘面框架)、WS-4(控件不随 tick 抖动)宽松依赖 | — | WS-5/8/9 |
| **WS-8** 可达性/对比度 | **WS-1**(无效/有效第二通道 ✓/✕ 依赖 reason)宽松 | — | WS-5/7/9 |
| **WS-9** combo 重设计 + 评分位置 | **WS-1**(评分必须写在 `validatePlayerMove` freeze 前,与 submit 校验同一路径)、**WS-4**(juice 削峰共用渲染边界) | WS-13(持久化前必须先把 manipulation 分写进 G.lastPlay,spec L179) | WS-5/7/8 |
| **WS-10** 减少 downtime(playableTiles) | 无(纯函数 helper) | WS-14(planning 模式可复用) | 多数 P2 项 |
| **WS-11** joker 深度 | 无(评分接入复用 WS-9 lastPlay) | — | WS-10/13/14 |
| **WS-12** 断线处理 | **连接状态 spike**(必须先做);弃权逻辑可借鉴 WS-1 的 `forfeitTurn` | — | spike 期间其它 P2 项可并行 |
| **WS-13** 网络韧性 + 持久化 | **连接状态/重连**(WS-12 同源)、**WS-9 评分需先落 G.lastPlay**、**持久化引入** | WS-12(重连依赖持久化在重启后存活) | bundle 拆分子任务可独立并行 |
| **WS-14** 输入替代(tap-to-place) | WS-3(resolveDropSlot 复用)、WS-10(playableTiles 高亮复用) | — | P2 内并行 |
| **WS-15..18** P3 打磨/清理 | 多为独立小项;WS-18 含 undo 栈封顶(FE-8)、移除 F8 debugger 监听 | — | 高度并行 |

### 2.2 关键路径(Critical Path)

```
WS-1 (服务端 submitMeld + submitRejectReason 结构化 code/score)
  ├─→ WS-5 (内联诊断 / 回合可读) ─┐
  ├─→ WS-8 (无效态第二通道 ✓/✕)  ─┼─→ 第一回合"安全+可读+可教"闭环
  └─→ WS-9 (评分写在同一 validatePlayerMove 路径, freeze 前)
            └─→ WS-13 (持久化读历史前, manipulation 分须已落 G.lastPlay)
                    └─→ WS-12 (重连在重启后存活, 依赖持久化)
                          ↑
WS-12 连接状态 spike (G.connected[seat]) ──┘ (spike 是 WS-12 估算与实现的前置)

WS-4 内部: isSelected 布尔 + 回调 ref 稳定 ──(必要前提)──→ React.memo 才生效
                                            └─→ TurnTimer 下沉 ──→ WS-5 秒数/警示载体
```

**结论:最长链是 `WS-1 → WS-9 → WS-13(持久化)→ WS-12(重连存活)`。** 其中:
- **WS-1 是全局基石**:它产出的 `{code, score, required, group}` 结构是 WS-5/WS-8 教学诊断的数据契约。WS-1 必须在 Sprint 1 内**先于** WS-5/WS-8 落地。
- **WS-9 的评分位置不可改**:必须在 `validatePlayerMove`(`moves.js:219-251`)freeze 前写入 `G.lastPlay`,否则 `prevTilePositions` 基线在 `onTurnBegin`(`moves.js:267`)即丢。这条约束让 WS-9 与 WS-1 共享同一服务端代码路径,建议**同人/同 PR 范围**协调。
- **WS-12 的 spike 是独立前置**:在 spike 结论出来前,WS-12 无法准确估算;但 spike 本身可与 P2 其它项并行。
- **WS-4 内部耦合是隐形关键路径**:不做 `isSelected` 布尔化 + 回调 ref 稳定,`React.memo` 是 no-op(spec L178),三件事必须打包成一个原子工作。

---

## 3. 跨切面决策

### 3.1 持久化(InMemory → FlatFile/SQLite)引入时机

**现状**:`server.js:13-17` 无 `db` 字段 → InMemory,重启即清空对局与 `/api/stats`(`server.js:29` 读 `context.db`)。

**决策**:
- **时机**:与 **WS-13 同 Sprint(P2)** 引入,作为 WS-12 重连"重启后存活"的前置(spec L167,L179)。P0/P1 的 UX 赢点**不依赖**持久化(spec 明确 non-goal,L12),不要提前引入以免拖慢 Sprint 1。
- **选项与取舍**:

  | 选项 | 优点 | 缺点 | 适用 |
  |------|------|------|------|
  | **FlatFile**(`bgio-storage` 风格,挂载卷上文件) | 改动最小(注入 `db: new FlatFile({dir})`);无需新服务 | 不可查询;并发写需留意;容器需持久卷 | **推荐起步**(单进程自托管,体量小) |
  | **SQLite** | 可查询(利于将来 stats/排行);单文件 | 需适配 boardgame.io 的 DB 接口(可能需第三方 adapter,**待核实**可用性);略重 | 若 WS-16 retention 统计落地后升级 |

  **建议**:先 FlatFile 落地重连/stats 持久化;把 SQLite 留作 WS-16(retention/rematch)真正需要查询时的演进项。决策点对应 spec Open question #5。
- **可逆性**:boardgame.io 的 `db` 是注入点,FlatFile→SQLite 切换是配置级,符合"优先可逆决策"原则。

### 3.2 连接状态进入权威 state 的架构方案

**问题**:`onTurnBegin({G,ctx})` 拿不到 `matchData`(`moves.js:259`);`isConnected` 只是 metadata,UI 才消费(`Board.jsx:301`)。要让"为断线座位塌缩 grace 截止"可在 move 里实现,**连接状态必须先进入权威 `G`**。这是 WS-12 的 spike 目标。

| 方案 | 机制 | 优点 | 缺点 / 风险 | 取舍 |
|------|------|------|-------------|------|
| **A. 服务端 Koa 中间件** | 在 `server.app.use` 拦截 transport 的 connect/disconnect,主动改写对应 match 的 `G.connected` | 复用现有中间件位置(`server.js:25`);完全服务端可信 | 需绕过/调用 boardgame.io 内部 API 改写 G,**侵入性强、版本耦合**(0.50);事务边界需小心 | 兜底方案 |
| **B. boardgame.io 插件(Plugin API)** | 用官方 plugin 钩子在每次 action/connection 注入 `G.connected` | 官方扩展点,生命周期清晰 | 插件能否监听**纯连接事件**(非 action)需核实;可能仍需配合传输层信号 | **优先评估** |
| **C. `onConnectionChange` / transport 钩子** | 监听传输层连接变化 → 派发一个**受信服务端 move/事件**写 `G.connected[seat]` | 语义最贴近需求;连接变化直接驱动权威 state | 0.50 是否暴露此钩子**待核实**;需保证只由服务端触发(绝不信客户端连接标志,spec L144) | 若可用则**首选** |

**spike 产物(WS-12 验收前置)**:一页 spike doc,确认 0.50 中 B/C 哪条可用,给出 `G.connected[seat]` 的写入点与触发源(必须服务端可信),再估 WS-12。**绝不接受客户端上报的连接标志。**

**统一原则**:无论 A/B/C,`G.connected` 一旦进入权威 state,断线塌缩 grace、vote-to-skip/forfeit、重连横幅(WS-13)都从这一真相源读取,避免 UI 与权威态分叉。

### 3.3 juice 的 reduced-motion / mute 门控统一

**现状**:两套门控彼此独立——`effects.js:6 reduced()` 管动效,`sfx.js:6 muted` 管声音(`Board.jsx:77-83` 逐个手动调用)。无统一谓词,也无"拥有权"概念。

**决策**:引入**单一门控谓词层**(纯函数,易单测,WS-9 验收要求 jest 测 juice-gating 谓词,spec L125):

```
shouldPlayJuice({ owner, localActive }) ⇒ { kick, confetti, sting, flash, sound }
```
- 输入:`owner`(自己/对手,来自 `G.lastPlay.seat` vs `playerID`)、`localActive`(本地是否有 active drag/selection)、隐含读取 `reduced()` 与 `isMuted()`。
- 规则(spec L121-122):对手的 `lastPlay` → **no `fx.kick`、no win-sting、柔化**;本地有拖拽/选择时 → **no kick**;reduced-motion → 关动效;muted → 关声音。
- 落点:把 `Board.jsx:77-83` 的散装调用收敛到该谓词 + 一个 `playJuice(plan)` 执行器;`kick` 改为 transform-only 包裹层(`will-change: transform`),不再 query `.board` 子树(spec L122)。

这是 WS-9 的一部分,但**谓词层应作为跨切面基础设施**先抽出,供未来所有特效复用。

---

## 4. 建议的 Sprint 切分骨架(P0→P3)

| Sprint | 对应 | 工作流 | 主题与出口判据 |
|--------|------|--------|----------------|
| **Sprint 1** | P0 | WS-1, WS-2, WS-3, WS-4, **WS-6(等待室核心)** | 新手"入场前 + 第一回合"变得安全/可读/可教/流畅。出口:无效 submit 不再破坏盘面(no-op + 内联原因);how-to-play 模态;盘面有落点引导;tick 不再整盘重渲;等待室 overlay 显示 "1 of 2"。 |
| **Sprint 2** | P1 | WS-5, WS-7, WS-8, WS-9(+ WS-6 邀请面板补完) | 回合/计时可读、移动端可用、可达性达标、combo 奖励操作而非囤牌。出口:回合 banner+秒数;390px 无裁剪;橙色对比 ≥3:1 + ✓/✕ 第二通道;manipulation 分写入 `lastPlay`(pre-freeze);juice 谓词单测通过。 |
| **Sprint 3** | P2 | WS-12(**spike 先行**), WS-13(+ 持久化), WS-10, WS-11, WS-14 | 韧性与深度。出口:连接状态进入权威 state 的 spike doc;断线座位在 grace 内自动推进;持久化使重启后重连可用;bundle 拆分多 chunk;playableTiles 高亮;joker 回收 + 计分;tap-to-place。 |
| **Backlog** | P3 | WS-15, WS-16, WS-17, WS-18 | 打磨与清理。出口:undo 栈封顶 `[PLACEHOLDER]`;F8 debugger 监听从 bundle 移除;"Room code" 文案统一;homepage 低计数文案软化。 |

**排期红线**:
- WS-1 必须在 Sprint 1 **早于** WS-5/WS-8 的诊断接入完成(契约先行)。
- WS-4 的 memo + 回调稳定 + TurnTimer 下沉作为**一个原子任务**,不可拆成"先 memo 后稳定"(否则中间态 memo 无效)。
- WS-12 的 spike 应在 Sprint 3 **第一周**出结论,否则下游 WS-13 重连估算失真。

---

## 5. 最终中文 design doc 章节骨架(标题层级建议)

```
# RummyCube 优化设计文档(Design Doc)
## 1. 背景与目标
   ### 1.1 问题陈述(5 份评审收敛的 5 大痛点)
   ### 1.2 目标与非目标(沿用 spec Goal / Non-goals)
   ### 1.3 必须尊重的约束(服务器权威 / forceEndTurn 反作弊 / build 目录 / 无持久化现状)
## 2. 架构总览
   ### 2.1 分层与模块边界(服务端 moves/校验/评分/连接/持久化;前端 渲染/juice/教学)
   ### 2.2 数据流(意图 → 校验 → 评分 → freeze → 广播 → 客户端反馈)
   ### 2.3 权威 state 形态变更(G.connected 新增、lastPlay 字段扩展)
## 3. 工作流详设(按依赖序)
   ### 3.1 WS-1 安全 submit 与 reason code(契约: {code,score,required,group})
   ### 3.2 WS-4 渲染性能(isSelected 布尔 / 回调 ref / TurnTimer 下沉)
   ### 3.3 WS-3 盘面可读与 resolveDropSlot
   ### 3.4 WS-2 / WS-6 教学与等待室
   ### 3.5 WS-5 / WS-8 回合可读与可达性(消费 WS-1 契约)
   ### 3.6 WS-9 combo 重设计与评分位置(pre-freeze)
   ### 3.7 WS-7 移动端布局
   ### 3.8 WS-12 连接状态 spike(方案 A/B/C 取舍)
   ### 3.9 WS-13 网络韧性与持久化
   ### 3.10 WS-10/11/14 深度与输入替代
   ### 3.11 WS-15..18 打磨与清理
## 4. 跨切面决策
   ### 4.1 持久化引入时机与 FlatFile/SQLite 取舍
   ### 4.2 连接状态进入权威 state 的方案
   ### 4.3 juice 门控统一(reduced-motion + mute + 拥有权)
## 5. 测试与验收策略(jest + Playwright smoke;CHROMIUM_PATH;仓库根运行)
## 6. 风险登记表
## 7. 排期(Sprint 1→3 + Backlog)与依赖图
## 8. 开放问题与决策项(对齐 spec Open questions 1-5)
## 9. 附录:文件级改动清单
```

---

## 6. 风险登记表

| # | 风险 | 类型 | 影响 | 缓解 | 负责领域 |
|---|------|------|------|------|----------|
| R1 | `submitMeld` 与现有 `endTurn`/`forceEndTurn`/`drawTile` 路径并存,误把破坏逻辑泄漏到 submit 路径,或反作弊被削弱 | 技术/回归 | 高:破坏 spec 核心承诺或反作弊 | 新增**独立** move;jest 断言 submitMeld 无效时**不改** `tilePositions`/手牌/`tilesPool`/`currentPlayer`(spec L50);保留 `forceEndTurn` 到点门槛(`moves.js:148`)的回归测试 | 服务端/游戏逻辑 |
| R2 | `React.memo` 在未做 `isSelected` 布尔化 + 回调 ref 稳定前是 no-op | 技术 | 中:性能改造白做 | 三件事打包为原子任务;加 dev-only 渲染计数器 + RTL 测试:tick 不重渲 GridContainer、选一张只重渲变化瓦片(spec L88) | 前端 |
| R3 | manipulation 分若在 freeze 后或客户端事后算,基线已丢(`prevTilePositions` 在 `onTurnBegin` 重置,`moves.js:267`) | 技术 | 高:WS-9 评分不可实现 | 强约束:评分写在 `validatePlayerMove` freeze 前(`moves.js:230-245` 区域);jest 断言 `lastPlay` 携带 pre-freeze manipulation 分(spec L124) | 服务端/游戏逻辑 |
| R4 | WS-12 连接状态方案在 boardgame.io 0.50 可能无干净钩子(B/C 可用性待核实) | 集成 | 高:WS-12 无法落地或侵入式 hack | **spike 先行**出结论;绝不信客户端连接标志;A 中间件作兜底 | 服务端架构 |
| R5 | 引入持久化后,旧 InMemory 对局格式与新 store 不兼容;重启迁移 | 集成 | 中:升级期对局丢失 | 选 FlatFile 降低耦合;升级窗口公告;持久卷挂载验证;`/api/stats` 读 db 路径回归(`server.js:29`) | DevOps/服务端 |
| R6 | `resolveDropSlot` 与现有 `moveTiles`(无 preflight,`moves.js:114-121`)契约冲突,多选放置越界/重叠 | 技术/回归 | 中:拖放回归 | resolver 作为**前置纯函数**,保持 `moveTiles` 契约不变;jest 测 3 选 2 空位拒绝、3 空位连续放置(spec L74);保留现有 drag/multidrag smoke 全绿 | 前端 |
| R7 | juice 削峰(去重 confetti/flash、kick 改 transform)若改动 `.board` 子树动画,引入新重排 | 技术/性能 | 中:性能改造引入新卡顿 | kick 改 transform-only 包裹层 + `will-change`(spec L122);保留单一特效;celebrateGroups 仅高亮提交的 run | 前端/juice |
| R8 | `vite.config` 加 `esbuild.drop` + `manualChunks` 误伤(drop 掉必要日志或破坏 chunk 边界) | 技术/构建 | 中:生产构建异常 | 渐进:先 drop console/debugger(spec L85)+ smoke 验证生产包无 `console.log`/`RENDER BOARD`;manualChunks 拆 vendor/boardgame.io 后跑 build + smoke | 前端/构建 |
| R9 | 无持久化下 Playwright smoke 依赖随机发牌,导致 WS-3/WS-10 用例不稳定 | 测试 | 中:CI flaky | 优先纯函数单测(`resolveDropSlot`/`playableTiles`),避免依赖随机 deal(spec L134);需要时用 seeded/构造状态 | QA/前端 |
| R10 | reason code 契约在 WS-1 与 WS-5/WS-8 间不一致(字段漂移) | 集成 | 中:诊断错配 | 在 design doc 固化 `{code,score?,required?,group?}` 契约并先冻结;jest 覆盖每个 code(spec L49) | 服务端 + 前端(契约) |
| R11 | 单进程内存对局 + 无水平扩展:连接状态/计时全在内存,进程崩溃即全丢 | 技术/运维 | 中:可用性 | 持久化(R5)缓解对局丢失;计时基于服务端 `timerExpireAt` 可在重连后重建(`moves.js:255,261`);记录为已知限制 | DevOps/服务端 |

---

## 7. 模块边界与文件职责(新增/改动关键文件)

> 标注 **[新增]** / **[改动]**。单一职责一句话描述。改动文件给出锚点 `file:line`。

### 7.1 服务端

| 文件 | 状态 | 单一职责 | 锚点 / 备注 |
|------|------|----------|-------------|
| `src/rummikub/moves.js` | 改动 | 新增 `submitMeld`(无效 no-op、有效 freeze+lastPlay+endTurn)与 `forfeitTurn`(显式 rollback+罚抽);`validatePlayerMove` 内在 freeze 前算 manipulation 分;清理 `console.log`(L43-44,L129 等) | 现 `endTurn` L127、`validatePlayerMove` L219-251、`onTurnBegin` L259-268 |
| `src/rummikub/moveValidation.js` | 改动 | **新增** `submitRejectReason(G,ctx) ⇒ {code,score?,required?,group?}`;重构 `isFirstMoveValid`/`isMoveValid` 复用之、boolean 退化为 `code==='OK'`;**新增** 纯函数 `resolveDropSlot`、`playableTiles` | 现 L79-145;`getFormedGroups` L158 复用 |
| `src/rummikub/Game.js` | 改动 | 注册新 move(`submitMeld`/`forfeitTurn`);若 WS-12 落地,在 setup 增 `G.connected` 初值;`lastPlay` 字段扩展(manipulation 分) | 现 moves 注册 L65-77、setup L35-47 |
| `src/server.js` | 改动 | 注入 `db`(FlatFile/SQLite)实现持久化;若方案 A,挂连接状态中间件 | 现 Server config L13-17、中间件位 L25 |
| `src/rummikub/juice/*` (服务端无关) | — | — | juice 在前端,见 7.2 |
| **连接状态模块** | 新增 | 把传输层连接事件镜像为 `G.connected[seat]`(plugin 或中间件或 hook,依 spike) | 文件名待 spike 定;**待核实** 0.50 钩子 |
| **持久化适配** | 新增/配置 | boardgame.io `db` provider 配置(FlatFile 起步) | 注入点 `server.js:13-17` |

### 7.2 前端

| 文件 | 状态 | 单一职责 | 锚点 / 备注 |
|------|------|----------|-------------|
| `src/rummikub/components/Board.jsx` | 改动 | 退化为协调器:移除 tick 重渲(下沉 TurnTimer)、删 `RENDER BOARD` 日志(L27)、回调经 ref 稳定(L109-115)、submit 走 `submitMeld` 而非 `endTurn`(L154-175)、按钮文案 End→Submit meld、Draw 可见但禁用 | 现 L26-369 |
| `src/rummikub/components/GridSlot.jsx` | 改动 | 收 `isSelected` 布尔而非 `selectedTiles` 数组;包 `React.memo`;drag-start 时标记可放置空槽 | 现 L14,19,34,40-43 |
| `src/rummikub/components/GridContainer.jsx` | 改动 | 在此**计算** `isSelected` 成员关系下传;去掉未用 pass-through props(如 `hoverPosition`);包 memo | 现 L30,51,62-63 |
| `src/rummikub/components/Tile.jsx` | 改动 | 包 `React.memo`;不再收 `selectedTiles` 数组;joker 可达性标签(WS-2) | 现收 `selectedTiles`(`GridSlot.jsx:34`) |
| **`<TurnTimer>` / avatar-ring** | 新增 | 自管 tick(或 CSS `animation-duration`),承载秒数 + 末秒警示(WS-5);使 Board 不随 tick 重渲 | 替代 `Board.jsx:264-269` 顶层 `useTurnTimer` |
| `src/rummikub/hooks/useTurnTimer.jsx` | 改动 | 计时逻辑迁入自管组件;保留 `onTimeout → forceEndTurn` 契约(`Board.jsx:181-184`) | 现文件 |
| **juiceGate(门控谓词)** | 新增 | 统一 reduced-motion + mute + 拥有权谓词;纯函数易单测 | 收敛 `Board.jsx:77-83` 散装调用 |
| `src/rummikub/juice/effects.js` | 改动 | `kick` 改 transform-only 包裹层(不 query `.board` 子树);削峰(confetti 或 flash 二选一) | 现 `kick` L34+,`reduced()` L6 |
| **HowToPlay 模态 + 首回合教学卡** | 新增 | 静态规则讲解(≥30/run/set/joker/timer)+ localStorage 一次性教学卡 | WS-2;无后端 |
| **等待室 overlay** | 新增 | `playersJoin` 期显示 "{joined} of {n}" + 复制房间码 + 禁用盘面 | WS-6;现 join 检测 `Board.jsx:30-35` |
| **重连/同步 banner** | 新增 | 监听 boardgame.io 连接态,显示 reconnecting/syncing | WS-13 |
| `vite.config.js` | 改动 | `esbuild:{drop:['console','debugger']}` + `build.rollupOptions.manualChunks`(vendor/boardgame.io) | 现无相关字段 |
| `src/App.jsx` | 改动 | 移除生产 F8→debugger 监听 | WS-18(`App.jsx:25-31`,**待核实**确切行号) |

### 7.3 测试

| 文件 | 状态 | 职责 |
|------|------|------|
| `src/tests/submit-reject-reason.test.js` | 新增 | 每个 `code`(+`BELOW_30` 的 `score`)对构造盘面正确返回(spec L49) |
| `src/tests/submit-meld.test.js` | 新增 | 无效 no-op 不改 state;有效 freeze+lastPlay+endTurn(spec L50) |
| `src/tests/forfeit-turn.test.js` | 新增 | `forfeitTurn` 显式 rollback+罚抽;`forceEndTurn` 到点行为不变(spec L51) |
| `src/tests/resolve-drop-slot.test.js` | 新增 | 单选最近空槽;多选连续空位规则(spec L74) |
| `src/tests/playable-tiles.test.js` | 新增 | 构造状态下可延展瓦片标记(spec L134) |
| `src/tests/juice-gate.test.js` | 新增 | 对手 lastPlay / 本地拖拽中 → no kick(spec L125) |
| RTL 渲染计数测试 | 新增 | tick 不重渲 GridContainer;选一张只重渲变化瓦片(spec L88) |
| Playwright smoke(多项) | 新增/改动 | 仓库根运行 + `CHROMIUM_PATH`;solo:无效 submit 红+内联原因且盘面不变 | 

---

## 8. 开放问题(对齐 spec Open questions,需 owner 决策)

1. **WS-1 无效 submit**:默认 `submitMeld` no-op(永不自动抽),罚抽仅留在 `forceEndTurn` 超时路径;是否额外提供显式确认的 `forfeitTurn → draw`?(spec 假设:no-op + 可选显式 forfeit)
2. **WS-9 combo**:采用 manipulation 加权计分(改变headline 手感),还是保留 tile-count 但仅移除囤牌激励 + 旁观者 screen-kick?(spec 假设:manipulation 加权)
3. **WS-12 连接状态方案**:plugin(B)/中间件(A)/onConnectionChange(C)三者在 boardgame.io 0.50 的可用性**待核实**——spike 第一产物即确认此项。
4. **持久化后端**:FlatFile(最简,挂载卷文件)vs SQLite(可查询)?(本文建议 FlatFile 起步,SQLite 留给 WS-16)
5. **WS-10 planning 模式**:仅可玩瓦片高亮(现阶段),还是完整半透明规划 overlay?
6. **WS-7 移动端 chat**:手机折叠为气泡 FAB(推荐),还是保持常驻但缩小?
7. **undo 栈封顶 N**:WS-18 要求封顶但未给值 → `[PLACEHOLDER]`,需定。

---

## 9. 一句话总结

把"判定与评分"全部收敛进服务端 `validatePlayerMove` 同一路径(WS-1 reason code 契约 + WS-9 pre-freeze 评分),前端则沿"渲染解耦(WS-4)/juice 门控统一(WS-9)/教学与连接反馈分层"重构;关键路径是 `WS-1 → WS-9 → 持久化(WS-13)→ 重连(WS-12)`,而 WS-12 的连接状态如何进入权威 `G` 是唯一需要先做 spike 才能估算的不确定项。
