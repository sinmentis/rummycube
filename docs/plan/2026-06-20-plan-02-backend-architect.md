# RummyCube 优化 · 服务端 Moves 设计(Backend Architect)

> 权威来源:`docs/optimization/2026-06-20-rummycube-optimization-spec.md`(WS-1..WS-18)。
> 本文把 spec 中「服务端 / 游戏逻辑」工作转化为**实现级设计**(不是最终代码)。
> 覆盖 WS-1(安全可解释提交)、WS-9(combo 评分位置)、WS-11(joker 取回)、WS-12(断线连接状态)、WS-13(持久化接入,服务端侧)。
> 所有数值阈值标 `[PLACEHOLDER]`,以现有 env 常量为准(`FIRST_MOVE_SCORE_LIMIT` 等)。
> 原则:**保持服务器权威**;不削弱 `forceEndTurn` 到点反作弊;`G.prevTilePositions` 每回合重置,manipulation 评分必须在回合内、freeze 之前算。

---

## 0. 现状核实(带真实行号)

所有结论基于以下已读源码,后续设计的「插入点」均引用这些行号。

### moves.js
- `drawTile({G,ctx,playerID,events}, doRollback=true)`:`moves.js:28-55`。
  - 守卫 `playerID !== ctx.currentPlayer → INVALID_MOVE`(`:29`)。
  - 罚抽:`doRollback` 时先 `rollbackChanges`(`:30-32`);抽 `firstMoveDone ? 2 : 1` 张(`:35`);末尾 `events.endTurn()`(`:54`)。**抽牌即结束回合**。
- `endTurn({G,ctx,playerID,events})`:`moves.js:127-140`。
  - 当前玩家守卫(`:128-131`);脏盘 `isBoardHasNewTiles → validatePlayerMove`(`:133-135`);干净盘 `drawTile(..., !isBoardValid(G))`(`:138`)。
- `forceEndTurn({G,ctx,events})`:`moves.js:142-157`。
  - **到点守卫**:`!G.timerExpireAt || getSecTs() < G.timerExpireAt → INVALID_MOVE`(`:148-150`)。脏盘 `validatePlayerMove`(`:153`),干净盘 `drawTile`(`:155`)。
- `rollbackChanges(G, player, ctx)`:`moves.js:159-173`。tmp 牌回手、非 tmp 牌恢复 `prevTilePositions`(`:162-170`),`freezeTmpTiles`(`:172`)。
- `validatePlayerMove(G, ctx, playerID, events)`:`moves.js:219-251`。
  - 首move 分支 `isFirstMove → isFirstMoveValid`(`:223-225`),否则 `isMoveValid`(`:228`)。
  - **有效块** `:230-246`:`firstMoveDone[player]=true`(`:232`)→ `getFormedGroups`(`:235`)→ 统计 tmp 牌 points,**joker 计 0**(`:236-237`)→ 写 `G.lastPlay`(`:238-244`)→ `freezeTmpTiles`(`:245`)→ `events.endTurn()`(`:246`)。
  - **无效块** `:247-250`:`drawTile({G,ctx,playerID,events})`(罚抽 + 回滚 + 结束回合)。
- `onPlayPhaseBegin`:`moves.js:253-257`,写 `timerExpireAt = getSecTs()+timePerTurn`(`:255`)。
- `onTurnBegin({G,ctx})`:`moves.js:259-269`。重置 `gameStateStack/redoMoveStack`(`:262-263`),**`G.prevTilePositions = original(G.tilePositions)`(`:267`)** — manipulation 基线每回合被抹掉。**无 `matchData`/`isConnected`**。
- `onTurnEnd`:`moves.js:271-275`,`timerExpireAt=null` + `checkGameOver`。

### moveValidation.js
- `freezeTmpTiles(G)`:`moveValidation.js:6-14`。
- `isBoardHasNewTiles(G)`:`moveValidation.js:16-23`(任一 tmp 即脏)。
- `extractSeqs(G)`:`moveValidation.js:25-66`(按 row 分组、按 col 连续切段)。
- `isBoardValid(G)`:`moveValidation.js:69-77`。
- `isMoveValid(G,ctx)`:`moveValidation.js:79-100`。无新牌 `→false`(`:90-93`,`console.debug("MOVE FAIL: NO NEW TILE")`);任一段非法 `→false`(`:94-98`)。**裸布尔返回**。
- `isFirstMove(G,ctx)`:`moveValidation.js:103-104`(`!firstMoveDone[currentPlayer]`)。
- `isFirstMoveValid(G,ctx)`:`moveValidation.js:105-145`。混合旧+新段 `→false`(`:109-125`,`MIXED`);任一段 `countSeqScore===0 →false`(`:128-133`,`INV SEQ`);**`score` 是局部变量**,`score < FIRST_MOVE_SCORE_LIMIT →false`(`:140-143`,`NOT ENOUGH SCORE`)。**裸布尔返回**。
- `isSubmitAccepted(G,ctx)`:`moveValidation.js:149-154`(已有纯函数:脏盘 + 首move/常规校验)。
- `getFormedGroups(G)`:`moveValidation.js:158-162`(含本回合 tmp 且 `isSequenceValid` 的段)。

### util.js
- `getTileValue` 位运算 `tile & 0xf`:`util.js:55-57`;`getTileColor`:`util.js:59-61`;`setTileValue`:`util.js:67-71`。
- `isJoker`:`util.js:101-107`(value===14)。
- `countSeqScore`:`util.js:243-302`;`isSequenceValid = countSeqScore>0`:`util.js:304-307`。
- `freezeJokersInRun`:`util.js:158-230`;`freezeJokersInGroup`:`util.js:232-240`(把 joker 冻结为代表牌,**含代表值**)。
- `getSecTs`:`util.js:430`。

### Game.js
- `setup`:`Game.js:10-48`;`lastPlay: null` 初值(`:46`);`prevTilePositions: tilePositions`(`:40`)。
- 顶层 `moves` 注册块:`Game.js:65-77`(新 move 在此挂载)。
- `play.onBegin = onPlayPhaseBegin`(`:62`);`turn.onBegin/onEnd`(`:78-82`);`turn.activePlayers: {all: Stage.NULL}`(`:79`)。

### server.js
- `Server({games, apiOrigins, origins})`:`server.js:13-17`(**未传 `db` → InMemory**)。
- `/api/stats` 中间件用 `server.app.context.db`:`server.js:25-45`(`:29` 取 db、`:31-34` listMatches/fetch)。
- `Server` 形参签名:`node_modules/boardgame.io/dist/cjs/server.js:3994` → `Server({games, db, transport, https, uuid, origins, apiOrigins, generateCredentials, authenticateCredentials})`。`DBFromEnv` 支持 `FLATFILE_DIR → FlatFile`,否则 `InMemory`(`server.js:2866-2872`)。

### 客户端调用点(仅为说明关系,本任务不改)
- `Board.jsx:154-173` 的 `endTurn()` 最终 `moves.endTurn()`(`:173`);`drawTile`(`:146-147`);`forceEndTurn`(`:178-183`)。
- `matchData`/`selfData.isConnected` 仅在 UI 消费(`Board.jsx:26, 293, 301`)— **非权威 game state**。

---

## 1. 新增/改动 moves 总览

| move | 阶段 | 谁可调 | 无效时 | 有效时 | 结束回合 | 抽牌 |
|---|---|---|---|---|---|---|
| `submitMeld` (新) | play | 当前玩家 | `INVALID_MOVE` no-op(**不回滚/不抽/不结束**) | freeze+lastPlay+`events.endTurn()` | 仅有效时 | 否 |
| `submitRejectReason` (新,纯函数,非 move) | — | — | 返回 `{code,...}` | 返回 `{code:'OK'}` | — | — |
| `forfeitTurn` (新) | play | 当前玩家 | — | 回滚+罚抽+结束 | 是 | 是 |
| `retrieveJoker` (新, WS-11) | play | 当前玩家 | `INVALID_MOVE` no-op | 桌面 joker 回手、两真牌上桌(仍 tmp) | 否 | 否 |
| `endTurn` (保留) | play | 当前玩家 | 现状不变(脏无效→罚抽) | 现状不变 | 是 | 视情况 |
| `forceEndTurn` (保留, **不动**) | play | 任意玩家(到点后) | — | 到点回滚+罚抽 | 是 | 是 |
| `validatePlayerMove` (改, WS-9) | 内部 | — | drawTile | freeze 前插入 manipulation 评分 | — | — |

> **关键设计原则**:`submitMeld` 与 `endTurn` 解耦。客户端「提交码」按钮改调 `submitMeld`(WS-1 spec `:44`);`endTurn` 保留给「不提交、改抽牌」与旧路径,语义不变以免破坏 `last-play.test.js`、`force-end-turn.test.js`。

---

## 2. WS-1 — 安全可解释提交

### 2.1 `submitRejectReason(G, ctx)` — 纯函数(挂 `moveValidation.js`)

**签名**:`submitRejectReason(G, ctx) -> { code, score?, required?, group? }`
**code 枚举**:`'OK' | 'NO_NEW_TILE' | 'BELOW_30' | 'RUN_TOO_SHORT' | 'INVALID_GROUP' | 'MIXED_FIRST_MOVE'`

**读** `G`:`tilePositions`(经 `extractSeqs`)、`firstMoveDone[ctx.currentPlayer]`。**不写** `G`。**不读** `lastPlay`(spec `:43` 明确:reason 自带 score,不复用 combo)。

**判定顺序**(短路,先廉价后严格):

1. `!isBoardHasNewTiles(G)` → `{code:'NO_NEW_TILE'}`(对应 `isMoveValid` 的 `:90-93`)。
2. `seqs = extractSeqs(G)`。逐段算 `countSeqScore`:
   - 段长 `< 3` 且含本回合 tmp → `{code:'RUN_TOO_SHORT', group: <段 tileId[]>}`(`countSeqScore` 在 `util.js:245-247` 对 `<3` 返回 0)。
   - 段长 `>=3` 但 `countSeqScore===0`(颜色/数值结构非法)→ `{code:'INVALID_GROUP', group: <段>}`(`isFirstMoveValid` `INV SEQ` `:130-133`;`isMoveValid` `:94-98`)。
3. 首move 专属:`isFirstMove(G,ctx)===true` 时:
   - 存在旧+新混段 → `{code:'MIXED_FIRST_MOVE', group: <混段>}`(`isFirstMoveValid` `:109-125`)。
   - 计 `score = Σ 仅 tmp 起始段的 seqScore`(复刻 `:127-139`),若 `score < FIRST_MOVE_SCORE_LIMIT` → `{code:'BELOW_30', score, required: FIRST_MOVE_SCORE_LIMIT}`。
4. 全通过 → `{code:'OK'}`。

> `FIRST_MOVE_SCORE_LIMIT` 来自 env(`constants.js:7`),文案侧用 `required` 回传,避免硬编码 `[PLACEHOLDER]`(实测默认 30)。

**重构 `isFirstMoveValid`/`isMoveValid`**(spec `:43`):
- 保持两者**布尔签名不变**(被 `validatePlayerMove`/`isSubmitAccepted` 调用,不可破坏接口)。
- 内部改为 `return submitRejectReason(G,ctx).code === 'OK'` 的等价实现,或抽出共享 `_evaluate(G,ctx) -> {code, score}` 私有函数,两布尔函数与 `submitRejectReason` 都委托它。**推荐后者**:消除规则重复,保证「按钮文案」与「服务端裁决」永不分叉(单一事实源)。

**不变量**:`submitRejectReason` 纯只读,对同一 `G` 幂等;`code==='OK' ⟺ isSubmitAccepted(G,ctx)===true`(必须有契约测试断言这条等价)。

### 2.2 `submitMeld({G, ctx, playerID, events})` — 新 move

**签名**:`submitMeld({G, ctx, playerID, events})`,无入参。
**守卫**:`playerID !== ctx.currentPlayer → INVALID_MOVE`。
**读**:`tilePositions`、`firstMoveDone`、(WS-9)`prevTilePositions`。**写(仅有效时)**:`firstMoveDone[player]`、`lastPlay`、freeze `tilePositions[*].tmp`。

**逻辑**:
```
function submitMeld({G, ctx, playerID, events}) {
  if (playerID !== ctx.currentPlayer) return INVALID_MOVE
  const reason = submitRejectReason(G, ctx)          // 纯函数
  if (reason.code !== 'OK') {
    G.lastReject = { seat: playerID, ...reason, ts: getSecTs() }  // 见下「可选」
    return INVALID_MOVE                               // 不回滚/不抽/不结束,tmp 牌留桌
  }
  applyValidMove(G, ctx, playerID, events)            // 抽取自 validatePlayerMove:230-246
}
```
- **有效路径** 必须与 `validatePlayerMove` 的有效块**共用同一函数 `applyValidMove`**(把 `moves.js:230-246` 抽成内部函数),保证 `endTurn`/`forceEndTurn`/`submitMeld` 三条路径写出**完全一致**的 `lastPlay`(含 WS-9 manipulation 分、WS-11 joker 分)。
- **无效路径** 返回 `INVALID_MOVE`:boardgame.io 会**丢弃整个 action**,`G` 不变,因此 `tilePositions/hand/tilesPool/currentPlayer` 全部不动(满足 spec `:50` 验收)。

**`G.lastReject`(可选,推荐)**:`INVALID_MOVE` 会回滚 G,所以**写进 G 的 `lastReject` 也会被丢弃**——客户端拿不到。两种方案:
- **方案 A(推荐,纯客户端)**:客户端在调用 `submitMeld` 前,本地跑 `submitRejectReason(G,ctx)` 渲染文案(它是纯函数,可在前端 import)。服务端 `submitMeld` 只做**权威否决**。WS-1 文案不需要服务端回传——避免「INVALID_MOVE 吞掉 reason」的悖论。**跨专业依赖**:Frontend 负责 import `submitRejectReason` 映射文案(spec `:46`)。
- 方案 B:reason 不走 `submitMeld`,另设一个**只读探针 move** 或在常规 state 中由前端计算。**结论**:采用 A,服务端不引入「写 G 又被回滚」的反模式。

**与现有路径关系**:
- `endTurn`(`:127-140`)**保留不变**——它仍处理「干净盘抽牌」和向后兼容;现有测试不动。
- 客户端「提交」按钮改调 `submitMeld`(原 `Board.jsx:173` 的 `moves.endTurn()`),「抽牌」按钮仍 `moves.drawTile`。这是前端改动,本设计仅约定契约。

**结束回合 / 抽牌**:无效=都不;有效=`events.endTurn()`,不抽。

### 2.3 `forfeitTurn({G, ctx, playerID, events})` — 新 move(显式弃权)

**签名**:`forfeitTurn({G, ctx, playerID, events})`。
**守卫**:`playerID !== ctx.currentPlayer → INVALID_MOVE`(**不复用** `forceEndTurn`:后者到点前必拒,无法做即时弃权,spec `:45`)。
**逻辑**:`rollbackChanges(G, ctx.currentPlayer, ctx)` → `drawTile({G,ctx,playerID,events})`(罚抽+结束),或直接复用 `drawTile(..., true)`(其 `:30-32` 内部已回滚)。**推荐**:`drawTile({G,ctx,playerID,events}, true)` 一行,语义=「主动放弃本回合改动并罚抽」。
**读写**:同 `drawTile`(回滚 tmp、抽 1/2 张、`events.endTurn()`)。
**结束回合**:是。**抽牌**:是(惩罚)。

> **不变量**:`forfeitTurn` 与 `forceEndTurn` 的**惩罚结果一致**,但触发条件正交——`forfeitTurn` 任意时刻(本人意愿),`forceEndTurn` 仅到点(任意人,反作弊)。二者都不绕过 `rollbackChanges`+罚抽。

### 2.4 `forceEndTurn` — **保持不变**

不改一行(`moves.js:142-157`)。到点守卫 `:148-150` 是反作弊核心(spec `:45, :168`)。任何「手动弃权」需求由 `forfeitTurn` 承接,**严禁**放宽 `forceEndTurn` 的时间守卫。

---

## 3. WS-9 — manipulation/combo 评分位置(精确插入点)

### 3.1 基线为何只能在回合内算
`onTurnBegin`(`moves.js:259-269`)在 `:267` 执行 `G.prevTilePositions = original(G.tilePositions)` —— 上回合棋面快照,**下回合开始即被覆盖**。`onTurnBegin({G,ctx})` 还**没有 `matchData`**。故评分必须在**本回合结束动作内、`freezeTmpTiles` 之前**完成(spec `:120, :179, :193`)。

### 3.2 精确插入点
在 `validatePlayerMove`(`moves.js:219-251`)的**有效块**,夹在 `getFormedGroups`(`:235`)与 `freezeTmpTiles`(`:245`)之间;并把整块抽成 `applyValidMove(G,ctx,player,events)` 供 `submitMeld` 复用(§2.2)。

```
// applyValidMove(G, ctx, player, events):  (= 现 moves.js:230-246 + WS-9)
G.firstMoveDone[player] = true                          // :232 不变
const groups = getFormedGroups(G)                        // :235 不变
const tmp    = Object.values(G.tilePositions)
                 .filter(p => p && p.gridId===BOARD_GRID_ID && p.tmp)   // :236 不变
// —— WS-9 在此插入(freeze 之前)——
const manip  = computeManipulationScore(G, groups, tmp)  // 新,见 §3.3,纯函数
// —— WS-11 joker 代表值并入 points,见 §4.3 ——
const points = tmp.reduce((s,p)=> s + tileScore(G, p), 0) // 改:joker 用代表值,非 0
G.lastPlay = {
  seat: player, count: tmp.length, points,
  groups: groups.map(seq => seq.map(Number)),
  manipulation: manip,                                   // 新字段
  ts: getSecTs(),
}
freezeTmpTiles(G)                                         // :245 不变(必须在评分之后)
events.endTurn()                                         // :246 不变
```

> **顺序硬约束**:`computeManipulationScore` 依赖 tmp 标志与 `G.prevTilePositions` 区分「新放牌」「被重排的既有牌」。一旦 `freezeTmpTiles` 把 `tmp` 清掉(`moveValidation.js:9-11`),信息即丢失。故评分**必须**在 `:245` 之前。

### 3.3 `computeManipulationScore(G, groups, tmp)` — 纯函数(挂新模块 `src/rummikub/scoring.js` 或 `juice/comboMath.js`)

**评分输入**:
- **formed/extended groups**:`groups`(= `getFormedGroups(G)`,本回合参与的合法段)。
- **新放置牌**:`tmp`(`gridId===BOARD_GRID_ID && tmp===true`)。
- **被重排的既有牌**:对每个 board 上 `tmp===false` 的牌,比较 `G.tilePositions[id]` 与 `G.prevTilePositions[id]` 的 `{row,col}`,位置变化者即「manipulation 搬动的既有牌」。

**评分公式(草案,权重待产品确认,标 `[PLACEHOLDER]`)**:
```
manipulation = W_GROUPS  [PLACEHOLDER] * (本回合形成/扩展的 distinct group 数)
             + W_REARRANGE[PLACEHOLDER] * (位置变化的既有牌数)
             + W_TILES   [PLACEHOLDER] * tmp.length          // tile-count 仅次要项
```
spec `:124` 验收:「1 张牌搬动形成 2 组」的 manipulation 值必须 > 「3 张平铺直放」。故 `W_GROUPS`、`W_REARRANGE` 必须显著大于 `W_TILES`。

**不变量**:
- 纯函数,只读 `G.prevTilePositions`/`tilePositions`,对 setup 期 `prevTilePositions===tilePositions`(`Game.js:40`)时退化为 0 搬动(首move 无既有牌可搬)。
- 不依赖 `matchData`/连接状态。
- 结果写入 `G.lastPlay.manipulation`,**回合内一次性**,WS-13 持久化后从 match log 读取,**不得**事后客户端重算(基线已失)。

---

## 4. WS-11 — Joker 取回 move + joker 计分

### 4.1 `retrieveJoker({G, ctx, playerID}, jokerTileId, realTileIdA, realTileIdB)` — 新 move

**意图**:用手上两张「与桌面 joker 当前代表牌(值+色)匹配」的真牌,换回该 joker 到手,**当且仅当换后棋面仍合法**(spec `:138`)。

**签名**:`retrieveJoker({G, ctx, playerID}, jokerTileId, realTileIdA, realTileIdB)`。
**入参**:桌面 joker 的 `tileId`;手上两张真牌 `tileId`(理论上换回 joker 只需 1 张同代表牌即可还原段,但 spec 明确要「两张匹配真牌」作为成本/深度,故按规则取两张并把其一上桌补位、另一? — 见下「待核实」)。

**读**:`tilePositions`(joker 位置/段、两真牌在手归属)、`prevTilePositions`(回滚)。**写**:`gameStateStack`(undo 快照,与 `moveTiles` `:76` 一致)、`tilePositions`(joker→手、真牌→桌 tmp)。

**判定**:
1. `playerID !== ctx.currentPlayer → INVALID_MOVE`。
2. `isJoker(jokerTileId)` 且其 `gridId===BOARD_GRID_ID`,否则 `INVALID_MOVE`(`util.js:101-107`)。
3. `realTileIdA/B` 都在 `playerID` 手中(`gridId===HAND_GRID_ID && playerID` 匹配),否则 `INVALID_MOVE`。
4. 计算 joker 在其所属段的**代表牌**:对该段跑 `freezeJokersInRun`/`freezeJokersInGroup`(`util.js:158-240`)得 joker 冻结值+色;校验两真牌之一(或匹配数量,见待核实)的 `getTileValue/getTileColor` 等于代表牌。
5. **试演**:把 joker 移回手、补位真牌放到 joker 原 `{row,col}`(tmp=true),对结果 `extractSeqs` + `isBoardValid`(`moveValidation.js:69-77`)校验;**任一段非法 → 回退试演并 `INVALID_MOVE`(no-op)**。
6. 成功:提交试演结果;补位真牌保持 `tmp=true`(本回合可继续操作),joker 进手。**不结束回合、不抽牌**(玩家随后还要正常 `submitMeld`/`endTurn`)。

**结束回合/抽牌**:都不(它是回合内的盘面操作,类似 `moveTiles`)。

**不变量**:
- 失败时**严格 no-op**(像 `submitMeld` 无效:返回 `INVALID_MOVE`,boardgame.io 丢弃 action)。注意若中途已直接改了 `G`,需保证整条路径在确认合法前**只在副本/或最后一步才写** —— 推荐先纯函数 `tryRetrieveJoker(G, ...)` 返回 `{ok, nextPositions}`,move 仅在 `ok` 时落盘,避免依赖框架回滚。
- 取回后 board 仍满足 `isBoardValid`,且**牌张守恒**(joker 入手、真牌上桌,总数不变)。

### 4.2 待核实(WS-11 规则细节)
- 「两张真牌」的语义:Rummikub 标准规则是**一张**与 joker 代表牌相同(值+色)的真牌即可换回 joker。spec `:138` 写「the two real tiles matching a table joker's value+color」可能指「joker 在 run 中代表某值,需该值两种来源」或「set 中两张同值不同色」。**标记待核实**——需产品/GD 明确「两张」的确切定义,再定 §4.1 第 4 步的匹配条数。设计骨架不变,仅匹配谓词随之调整。

### 4.3 Joker 计分并入 `lastPlay.points`
**现状**:`validatePlayerMove` `:237` 对 joker 计 0(`isJoker(p.id) ? 0 : getTileValue(p.id)`)。WS-11 要 joker 按**代表值**计分(spec `:138-139`)。

**改法**(§3.2 的 `tileScore(G, p)`):
```
function tileScore(G, p) {
  if (!isJoker(p.id)) return getTileValue(p.id)
  // joker:找到其所属段,freeze 得代表值
  const seq = sequenceContaining(G, p.id)          // 由 extractSeqs 定位
  const frozen = isSameColor(seq) ? freezeJokersInRun(seq) : freezeJokersInGroup(seq)
  const rep = frozen && frozen.find(t => /* 对应该 joker 槽位 */)
  return rep ? getTileValue(rep) : 0               // freeze 失败兜底 0
}
```
**位置**:在 §3.2 的 `points` reduce 内替换原 `:237` lambda。**仅统计本回合 tmp 牌**(与现状一致),故只有「本回合新上桌的 joker」按代表值计入 `lastPlay.points`;桌面既有 joker 不重复计。

**验收**(spec `:139`):构造「一张 joker 代表某值」的 run,断言 `lastPlay.points` 含该代表值(而非 0)。

---

## 5. WS-12 — 连接状态进入权威 state(spike + 推荐)

### 5.1 根因(已核实)
- `onConnectionChange` 只写 **match metadata**(`node_modules/boardgame.io/dist/cjs/server.js:3636` `metadata.players[playerID].isConnected = connected`),**不触碰 `G`**。
- `onTurnBegin({G,ctx})`(`moves.js:259-269`)**拿不到** metadata/`isConnected`。
- 客户端 `selfData.isConnected`(`Board.jsx:301`)是 UI 投影,**不可信**(spec `:143-144, :168`)。
- 结论:**当前架构无法在 move 内读到连接状态**,「为断线座位收缩 `timerExpireAt`」不可直接实现。

### 5.2 方案选项

| 选项 | 机制 | 写入 G? | 可信? | 复杂度 | 说明 |
|---|---|---|---|---|---|
| A. 自定义 SocketIO transport / 子类 override `onConnectionChange` | 在 `Server({transport})` 注入,override 后既更新 metadata 又 `storageAPI.fetch` 当前 state、`G.connected[seat]=connected`、`setState` | 是 | 是(服务端) | M-L | 触达 `server.js:3606` 那段;需小心与框架内部状态机/log 一致 |
| B. boardgame.io plugin(`api`/`flush`) | 插件维护连接镜像,在每个 action 的 `fnWrap` 注入 `G.connected` | 部分 | 是 | M | 插件**也拿不到** socket 连接事件源,仍需 A 喂数据;不单独成立 |
| C. server middleware + 心跳 move | 客户端定期发 `heartbeat` move | 是 | **否** | S | 依赖客户端自报,易作弊,**排除**(spec `:144`) |
| D. 旁路:onConnectionChange 后由服务端**代发**一个权威 system move | override 中调 master 提交一个 `_setConnection` 内部 move | 是 | 是 | M | 比 A 更贴合 boardgame.io action 流,state/log 自洽 |

### 5.3 推荐
**A 与 D 的结合**:
1. **Spike 产出**:子类化 / 包装 boardgame.io 的 transport,使其在 `onConnectionChange(matchID, playerID, _, connected)`(`server.js:3606`)里,除原 metadata 行为外,**额外**通过 master 提交一个**服务端发起、不可被客户端调用**的内部 move `_setConnection(seat, connected)`,把 `G.connected[seat] = connected` 写入权威 state(走正常 action/log,保证持久化与重连同步一致)。`_setConnection` 在 `Game.js` 注册但仅信任服务端来源(或用单独 plugin namespace)。
2. **派生效果**(后续,非 spike):
   - `onTurnBegin` 改为:若 `G.connected[ctx.currentPlayer]===false`,把 `timerExpireAt = getSecTs() + GRACE_MS [PLACEHOLDER]`(远小于 `timePerTurn`),实现**断线座位宽限期收缩**。
   - 累计 `G.disconnectTurns[seat]`,达 `N [PLACEHOLDER]` 回合 → 自动 `forfeitTurn` 等价处理 / vote-to-skip;终局把剩余手牌按 `countPoints`(`util.js:309-329`)折算最终分(spec `:144`)。
3. **明确**:任何 `G.connected` 的真值**只能由服务端 transport 写**;客户端 flag 仅用于乐观 UI,服务端裁决以 `G.connected` 为准。

**Spike 文档交付物**(spec `:145`):一页说明「连接事件 → `_setConnection` move → `G.connected` → `onTurnBegin` 收缩」链路 + 一个 jest/smoke:断线的活动座位在 `GRACE_MS` 内自动 advance,而非耗满 `timePerTurn`。

**待核实**:boardgame.io 0.50 是否允许 `Server({transport})` 干净注入自定义 SocketIO 且能从 transport 调 master 提交内部 move;若不行,退化为 D 的「在 master 层 patch」或 fork。先 spike 验证再估时。

---

## 6. WS-13(服务端侧)— 持久化接入

### 6.1 精确接入点
`server.js:13-17` 的 `Server({...})` 增加 `db`:
```
import {FlatFile} from 'boardgame.io/dist/cjs/server.js';   // 或 SQLite/Postgres adapter
const server = Server({
  games: [Rummikub],
  apiOrigins: allowedOrigins,
  origins: allowedOrigins,
  db: new FlatFile({ dir: process.env.FLATFILE_DIR || './data/bgio' }),  // 新增
});
```
- 形参支持见 `node_modules/boardgame.io/dist/cjs/server.js:3994`(`Server({games, db, ...})`)。
- 或纯运维方式:设 `FLATFILE_DIR` env,框架 `DBFromEnv`(`server.js:2866-2872`)自动用 FlatFile —— 但**显式传 `db` 更可控**,且为将来换 SQLite/Postgres 留接口。
- **生产建议**:FlatFile 适合单实例小流量;多实例/高并发上 SQLite(`@boardgame.io/storage-*`)或 Postgres adapter。当前部署单容器(`Dockerfile`)→ FlatFile 先行,接口对齐 `db.listMatches/db.fetch/db.setMetadata`(`/api/stats` 已用,`server.js:31-34`)。

### 6.2 与 `/api/stats`、重连的关系
- `/api/stats`(`server.js:25-45`)已通过 `server.app.context.db` 读 `listMatches`/`fetch`。换 InMemory→FlatFile **无需改这段**,但重启后计数**持久**(现状 InMemory 重启清零,spec `:167`)。
- **重连**:FlatFile 让重启/redeploy 期间的进行中对局可被重新 `sync`,WS-12 的 `G.connected` 与 §5.3 的 `_setConnection` move 走 action log,持久化后**重连 state 自洽**。
- **WS-9 依赖**:`lastPlay.manipulation` 落 match log 后,统计/回放从持久层读,**不重算**(基线已失,§3.1)。

### 6.3 迁移与安全
- **零停机**:FlatFile 是新存储,无既有 schema 迁移;切换需 expand-contract——先双读(InMemory 运行中对局自然结束)、新对局走 FlatFile;或接受一次重启窗口(小流量可接受)。
- **数据目录**:`FLATFILE_DIR` 须挂持久卷(Docker volume),否则容器重建仍丢;`./data` 加入 `.gitignore` 与备份脚本。
- **隐私**:match state 含玩家昵称;`/api/stats` 已刻意只暴露聚合数(`server.js:23-24`),持久化后**不得**新增泄露 matchID/昵称的端点。

---

## 7. 不变量 / 并发 / 作弊 汇总

| 关注点 | 约束 |
|---|---|
| 服务器权威 | 所有 move 在服务端裁决;`submitRejectReason` 客户端仅作 UI 预判,服务端 `submitMeld` 终判(§2.2) |
| `forceEndTurn` 反作弊 | 到点守卫 `moves.js:148-150` **不削弱**;手动弃权走独立 `forfeitTurn`(§2.3-2.4) |
| no-op 语义 | `submitMeld`/`retrieveJoker` 无效时返回 `INVALID_MOVE`,框架丢弃 action,`G` 不变(满足 spec `:50`) |
| 写后回滚反模式 | 不在 `INVALID_MOVE` 前向 `G` 写「想回传」的数据(会被丢弃)。reason 走客户端纯函数(§2.2 方案 A) |
| 评分时序 | manipulation/joker 评分**必须** freeze 前(`moves.js:245` 之前),否则 tmp/baseline 丢失(§3) |
| 路径一致性 | `endTurn`/`forceEndTurn`/`submitMeld` 的有效路径共用 `applyValidMove`,`lastPlay` 永不分叉 |
| 连接可信度 | `G.connected` 仅服务端 transport 写;客户端 `isConnected` 不可信(§5.3) |
| 牌张守恒 | `retrieveJoker` 前后 board+hand 牌总数不变;`forfeitTurn` 罚抽符合 `firstMoveDone ? 2 : 1`(`moves.js:35`) |
| 当前玩家守卫 | 所有写盘 move 首行 `playerID !== ctx.currentPlayer → INVALID_MOVE` |

---

## 8. Jest 测试点(沿用 `src/tests` 风格:`Client` + `Local()` 或纯函数 + `boardOf`)

> 参考:`last-play.test.js`(Client 跨客户端读 `G.lastPlay`)、`force-end-turn.test.js`(负 `timePerTurn` 制造过期)、`submit-accepted.test.js`/`comboMath.test.js`(纯函数 + `boardOf` 工厂)。

**WS-1**
- `submitRejectReason`:为每个 code 构造盘面,断言 `{code}`;`BELOW_30` 断言 `score` 与 `required`;合法盘 → `OK`。契约:`code==='OK' ⟺ isSubmitAccepted===true`。
- `submitMeld` 无效盘:断言返回 INVALID_MOVE **且** `G.tilePositions`、手牌数、`tilesPool.length`、`ctx.currentPlayer` 全不变(spec `:50`)。
- `submitMeld` 合法盘:断言 freeze(tmp→false)、`lastPlay` 写入、`currentPlayer` 推进。
- `forfeitTurn`:断言回滚(tmp 牌回手)+ 罚抽(手牌 +1/+2)+ 回合推进;非当前玩家调用 → INVALID_MOVE。
- `forceEndTurn`:复用现 `force-end-turn.test.js`,断言**行为不变**(回归保护)。

**WS-9**
- `computeManipulationScore`:1 张搬动形成 2 组 > 3 张平铺直放(spec `:124`)。
- 端到端:跑 `submitMeld` 合法路径,从**另一个** client 读 `G.lastPlay.manipulation`(同 `last-play.test.js` 跨客户端模式),断言 freeze 前已算入。

**WS-11**
- `retrieveJoker` 成功:两真牌在手且换后 `isBoardValid` → joker 入手、真牌上桌、no 回合结束。
- `retrieveJoker` 失败:换后盘面非法 / 真牌不在手 / 目标非 joker → INVALID_MOVE 且 `G` 不变。
- joker 计分:含 joker 的合法 run 经 `submitMeld`,断言 `lastPlay.points` 含 joker 代表值(非 0)(spec `:139`)。

**WS-12**
- spike smoke:模拟 `_setConnection(seat,false)` 后 `onTurnBegin`,断言断线活动座位 `timerExpireAt - now <= GRACE_MS` 而非 `timePerTurn`(spec `:145`)。
- `G.connected` 只能服务端写:断言客户端无法直接调用 `_setConnection`(move 不在公开 `moves` 或被来源校验拒绝)。

**WS-13**
- 服务端注入 `db: FlatFile`(临时目录)后,`server.app.context.db.listMatches` 可用;重启(重新构造 Server 指向同目录)后进行中对局可 `fetch`。(可作集成测试,非纯 jest;最小化为 db adapter 接口契约测试。)

---

## 9. 工作量 / 依赖 / 开放问题

| WS | 工作量 | 依赖 | 备注 |
|---|---|---|---|
| WS-1 `submitRejectReason` + 重构 | **S-M** | 无(纯函数,前置) | 单一事实源:布尔函数委托 `_evaluate` |
| WS-1 `submitMeld` | **M** | `applyValidMove` 抽取 | 前端按钮改调(跨专业) |
| WS-1 `forfeitTurn` | **S** | `drawTile`/`rollbackChanges` 复用 | |
| WS-9 manipulation 评分 | **M** | `applyValidMove`(与 submitMeld 共用)、`prevTilePositions` | 权重待产品定 `[PLACEHOLDER]` |
| WS-11 `retrieveJoker` + joker 计分 | **M-L** | `freezeJokersInRun/Group`、`extractSeqs` | 「两张真牌」规则待核实 |
| WS-12 连接状态 spike | **M-L** | 自定义 transport / master 注入可行性待验 | spike 先行再估时(spec `:180`) |
| WS-13 服务端 db | **S(FlatFile)** / **M(SQLite/PG)** | 持久卷运维;与 WS-12 合排(spec `:167`) | 与 `/api/stats`/重连绑定 |

**跨专业依赖**:
- **Frontend**:提交按钮 `endTurn → submitMeld`(`Board.jsx:173`);import 纯函数 `submitRejectReason` 渲染 reject 文案(spec `:46`);Draw 按钮 visible-but-disabled;`retrieveJoker` 的拖拽手势(两真牌拖到桌面 joker);连接状态 UI 用 `G.connected`(权威)替代 `selfData.isConnected`。
- **Game Design / Product**:WS-9 权重 `W_GROUPS/W_REARRANGE/W_TILES`;WS-11「两张真牌」精确规则;WS-12 `GRACE_MS`、`N` 弃权回合数。
- **DevOps**:`FLATFILE_DIR` 持久卷、备份;WS-12 自定义 transport 的部署形态。

**开放问题**:
1. WS-1 reject reason 是否需服务端回传?**建议否**(纯客户端跑 `submitRejectReason`,避开 INVALID_MOVE 吞 G 的悖论)。若产品坚持服务端权威文案,需改用「只读探针」机制,代价更高。
2. WS-11「两张真牌」的标准 Rummikub 语义确认(`待核实`,§4.2)。
3. WS-12 boardgame.io 0.50 能否干净注入自定义 transport 并从中提交内部 move(`待核实`,§5.3);否则 fork/patch。
4. WS-9 manipulation 权重与「headline 数字」体感需与 GD 对齐(spec open question `:184`)。
5. `submitMeld` 与 `endTurn` 长期是否合并?**当前保留二者**以护住现有测试与「不提交改抽牌」路径;待 WS-1 落地稳定后再评估。

---
*本文仅为设计;未改动任何源码文件,未 commit。行号基于 2026-06-20 main 分支快照,实现时以实际为准。*
