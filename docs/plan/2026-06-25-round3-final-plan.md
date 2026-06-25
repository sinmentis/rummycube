# RummyCube · 第三轮 · Final Plan(combo 调参 + joker 取回 UI + backlog 清理)

> **给执行者:** 用 `superpowers:subagent-driven-development` 逐任务实施(每任务全新 implementer TDD + reviewer 双判)。完整技术细节见
> `docs/optimization/2026-06-25-round3-review-1-game-design.md`(combo 曲线)与 `…-review-2-frontend.md`(712 行 backbone,签名/行号已实测)。

**Goal:** 让 combo 分级有意义(ON FIRE 只给大操作)、把 joker 取回改经典 1 张并接上拖拽 UI,并清掉 moveTiles 幽灵-undo、DRY、权威掉线指示、视觉/无障碍遗留。

**Architecture:** combo 仅改 `comboMath.js` 三常量 + 阈值(纯函数);joker 取回 = 简化的权威 move + 一个纯 `jokerSwapTarget` 判定 + `onDragEnd` 新分支(排在挤位**之前**);其余是服务端加固 + 纯 helper 抽取 + 叶子接线 + CSS。不改 Rummikub 规则(除 joker 张数)、不改服务器权威、合法性仍提交时裁定。

**Tech Stack:** boardgame.io 0.50(server-authoritative)、React 18 + Vite、@dnd-kit 6.3.1、jest + RTL。

## Global Constraints(红线,逐条 verbatim)

- **服务器权威/反作弊不退化:** `retrieveJoker`/`moveTiles`/`insertTilesWithPush` 仍仅当前玩家、当前回合;非法 → `INVALID_MOVE`(immer 丢弃整张草稿);客户端 `jokerSwapTarget`/`resolveDropDispatch` 只读 `G.tilePositions`、**从不写**,只决定派发哪个 move。
- **合法性裁定时机不变:** joker 换 / 挤位 / 摆放是几何操作;run/set 合法性仍 `isBoardValid` / 提交时裁定。客户端复算 `representedValue` 用与服务端**同一组**纯函数(`extractSeqs`/`freezeSeqJokers`/`getTileValue`);漂移由服务端 `INVALID_MOVE` 兜底。
- **门控/无障碍:** 新动画进 `@media (prefers-reduced-motion: no-preference)`(不在 JS 读 `matchMedia`,jsdom 无);焦点环 + 键盘路径提升可达。
- **应用内文案英文**(`NICE`/`COMBO`/`ON FIRE` 不变;Hints tooltip 英文)。**无新依赖**;**`node src/server.js` 可启动**(新 import 显式 `.js`、无环、无 JSX);**构建无新增 `console.log`**;**`timePerTurn` 毫秒**。
- **既有能力不回归**(长按整组、挤位、tap-to-place、键盘 Undo/Redo、断线/同步、超时公告、Hints、主/次按钮、Exit、give-up 两次点击)。WS-D 是**等价重构**,以既有 T3/T4 测试回归绿为门。

## File Structure

**新建:** `src/rummikub/seats/seatConnection.js`(`seatConnected`)、`src/rummikub/components/useTilePlacementHotkeys.js`、各自测试。
**修改:** `juice/comboMath.js`(WS-A)、`dndUtil.js`(`jokerSwapTarget` + `resolveDropDispatch` + `boardRowTiles` 用常量)、`moves.js`(retrieveJoker 1 张 / moveTiles 传播 / insertTilesWithPush 复用)、`Game.js`(retrieveJoker 签名同步)、`Board.jsx`(joker-swap 分支 + dispatchDrop 收口 + 键盘接线 + hints tooltip)、`PlayerAvatar.jsx`/`TableSeats.jsx`(seatConnected)、`HintsToggle.jsx`、`board.css`(WS-F + `.hints-tip`)、`src/tests/retrieve-joker.test.js`(签名改 2 实参)。

## 可调参数([PLACEHOLDER],playtest 可调)

| 参数 | 值 | 说明 |
|---|---|---|
| `W_GROUP` / `W_INTEG` / `W_PLACE` | 3 / 3 / **0** | score = 3×(groups+rearranged);张数不计分(体量由 +points 浮字另显) |
| `comboLabel` 阈值 | **3 / 6 / 9** | NICE=1 操作单位 / COMBO=2 / ON FIRE=3 |
| `JOKER_RETRIEVE_TILES_NEEDED` | 2 → **1** | 经典规则(已定) |
| WS-G 键盘 v1 | Enter/Space 送第一空格 | cursor 选格版顺延 |

---

## Task T1 — WS-A combo 调参(纯,独立先做)

**Files:** Modify `src/rummikub/juice/comboMath.js`;Test `src/tests/combo-math.test.js`(新或扩)。**只改这一个文件。**

**改动(见 review-1):** `W_GROUP=3, W_INTEG=3, W_PLACE=0`;`comboLabel`:`n>=9 'ON FIRE' | n>=6 'COMBO' | n>=3 'NICE' | else ''`。`manipulationScore` 签名不变(保留 `placed` 形参作旋钮)。**加一行守卫注释**:说明「可达分恒为 3 的倍数 {3,6,9,…},故 `ComboOverlay.jsx:6` 硬编码 tier(3/5/7)与本 label 永远同档;若日后改权重产生 4/5/7/8 等夹缝分值,须连带调 ComboOverlay/Board flash 门控」。**不改** ComboOverlay/Board/moves.js。

- [ ] **Step 1 失败测试**:出牌矩阵——单组堆牌(groups=1,rearranged=0,placed=1..13)恒 `score=3`→`NICE`(与张数无关);2 组或 1 组+1 重排 `score=6`→`COMBO`;多组+重排 `score≥9`→`ON FIRE`;空 `score=0`→`''`。覆盖 `comboLabel(3/6/9)` 边界。
- [ ] **Step 2 跑测试确认失败**(`npx jest combo-math`)。
- [ ] **Step 3 实现** 三常量 + 阈值 + 守卫注释。
- [ ] **Step 4 跑测试确认通过**(+ 既有 comboMath/comboLabel 测试更新为新阈值)。
- [ ] **Step 5 提交** `feat(combo): rebalance manipulation score so ON FIRE is earned`。

---

## Task T2 — `jokerSwapTarget` 纯 helper(WS-B 地基)

**Files:** Modify `src/rummikub/dndUtil.js`(+`jokerSwapTarget`,+`BOARD_GRID_ID` import 若缺);Test `src/tests/joker-swap-target.test.js`。可并行。

**Interface — Produces:** `jokerSwapTarget(tilePositions, cell, draggedTileId) -> {ok:true, jokerId, representedValue} | {ok:false}`(见 review-2 §B.2,逐字采用)。判定:`cell` 上是已结算(非 tmp)board joker、其所在 seq 合法、被拖手牌值 == joker 代表值(`extractSeqs→freezeSeqJokers→getTileValue`);从不 mutate。

- [ ] **Step 1 失败测试**:匹配牌→`{ok,jokerId,representedValue}`;值不匹配→`{ok:false}`;cell 非 joker→false;joker 是 tmp→false;joker 不在合法组(断序)→false;拖的是 joker 本身→false。
- [ ] **Step 2 跑测试确认失败**。
- [ ] **Step 3 实现**。
- [ ] **Step 4 跑测试确认通过**。
- [ ] **Step 5 提交** `feat(board): jokerSwapTarget pure helper`。

---

## Task T3 — `seatConnected` 纯 helper(WS-E 地基)

**Files:** Create `src/rummikub/seats/seatConnection.js`、`src/tests/seat-connection.test.js`。可并行。

**Interface — Produces:** `seatConnected(connected, seat, metaConnected) -> bool|undefined`(见 review-2 §E.2):`connected` 是数组且 `connected[seat]` 有定义 → 用权威值;否则回退 `metaConnected`。

- [ ] **Step 1 失败测试**:权威 `false`→断线;权威 `true`→在线;`connected[seat]===undefined`→回退 metadata;`connected` 非数组→回退。
- [ ] **Step 2 跑测试确认失败**。
- [ ] **Step 3 实现**。
- [ ] **Step 4 跑测试确认通过**。
- [ ] **Step 5 提交** `feat(seats): seatConnected authoritative helper`。

---

## Task T4 — WS-B 服务端 `retrieveJoker` 改单张

**Files:** Modify `src/rummikub/moves.js`(`JOKER_RETRIEVE_TILES_NEEDED 2→1`、`retrieveJoker(_, jokerTileId, tileId)` 正文简化、R7 删可能 unused 的 `deactivateTileVariant` import)、`Game.js`(签名同步,仍注册);Test `src/tests/retrieve-joker.test.js`(**改 2 实参**)。**moves.js 串行。依赖无(纯服务端)。**

**实现(见 review-2 §B.4,逐字采用):** 单张:必须当前玩家手牌、非 joker、`getTileValue===representedValue`;换该手牌到 joker 板位(`tmp:false,playerID:null`),joker 回手位;换后 `!isBoardValid` → `INVALID_MOVE`(no-op)。保留「仅当前玩家、joker 须在合法组、不结束回合/不抽牌」。

- [ ] **Step 1 失败测试**(reducer,沿用 retrieve-joker harness,改 2 实参):成功换(joker 回手位、代表牌上板);**值不匹配→`INVALID_MOVE`**(替换原「缺第二张」用例);非当前玩家→拒;换后非法→no-op(G 不变);joker 非 board/为 tmp/非 joker→拒。
- [ ] **Step 2 跑测试确认失败**。
- [ ] **Step 3 实现** + Game.js + 清 unused import(grep 核实)。
- [ ] **Step 4 跑测试确认通过** + `node src/server.js` 启动核验。
- [ ] **Step 5 提交** `feat(joker): classic single-tile retrieveJoker`。

---

## Task T5 — WS-C `moveTiles` 加固(传播 INVALID_MOVE + 空值守卫)

**Files:** Modify `src/rummikub/moves.js`(`moveTiles` `:78-130`、`insertTile` `:85-117`);Test `src/tests/move-tiles-propagate.test.js`。**moves.js 串行(T4 之后)。**

**实现(见 review-2 §C.2):** `moveTiles` 的 `insertTile` 调用**传播返回值**——任一返回 `INVALID_MOVE` 则 `moveTiles` 返回 `INVALID_MOVE`(immer 丢弃,含 `:80` 已 push 的 `gameStateStack` 快照一并回滚);`insertTile` 开头加 `if (!currPos) return INVALID_MOVE`。不改合法移动行为。

- [ ] **Step 1 失败测试**(reducer):构造一个会触发 `insertTile` 拒绝的 moveTiles → **G 不变且 `gameStateStack.length` 不增**(锁死幽灵 undo);既有 moveTiles/last-play/forfeit/tap-to-place 测试保持绿。
- [ ] **Step 2 跑测试确认失败**。
- [ ] **Step 3 实现**。
- [ ] **Step 4 跑测试确认通过**。
- [ ] **Step 5 提交** `fix(board): propagate insertTile INVALID_MOVE; guard missing tile`。

---

## Task T6 — WS-D `resolveDropDispatch` 共享 helper + boardRowTiles 复用/常量

**Files:** Modify `src/rummikub/dndUtil.js`(+`resolveDropDispatch`,`boardRowTiles` 用 `BOARD_GRID_ID`)、`moves.js`(`insertTilesWithPush` 复用 `boardRowTiles`);Test `src/tests/resolve-drop-dispatch.test.js`。**依赖 T2(jokerSwapTarget)。**

**Interface — Produces:** `resolveDropDispatch({tilePositions, target, primaryId, selection, playerID, boardCols, handCols, allowJokerSwap}) -> {kind:'joker'|'push'|'snap'|'reject', args:Array}`。**(rubber-duck 规范化)** 统一返回 `{kind, args}`:`args` 是要传给对应 move 的实参数组(`joker`→`[jokerId, primaryId]`、`push`→`[T,row,'b',{id},ordered]`、`snap`→`[col,row,gridId,{id},selection]`、`reject`→`[]`);**本形态为准,覆盖 review-2 §D.2 里 `{move}`/`{reject}` 的草图**。T7 的 `dispatchDrop` 一律 `switch(d.kind)`。优先级:**joker-swap → push → snap → reject**。`insertTilesWithPush` 内联收集行改为调 `boardRowTiles`。

- [ ] **Step 1 失败测试**(纯):joker 匹配→`kind:'joker'`;board 占位→`'push'`(`insertWithPush` 非 null)/`'reject'`(null);全空/越界/hand→`'snap'`;越界仍 snap(不 reject)。
- [ ] **Step 2 跑测试确认失败**。
- [ ] **Step 3 实现** + insertTilesWithPush 复用 + boardRowTiles 常量。
- [ ] **Step 4 跑测试确认通过**(+ 既有 insert-tiles-with-push 回归绿)。
- [ ] **Step 5 提交** `refactor(board): shared resolveDropDispatch; reuse boardRowTiles`。

---

## Task T7 — WS-B/WS-D Board 落点收口(joker-swap 分支 + dispatchDrop)

**Files:** Modify `src/rummikub/components/Board.jsx`(`onDragEnd`/`onCellTap` 经 `resolveDropDispatch` 派发,joker-swap **先于** push);Test `src/tests/board-joker-swap-dispatch.test.js`。**Board 串行段①;依赖 T6。**

**实现(见 review-2 §B.3/§D.3):** `onDragEnd`/`onCellTap` 调 `dispatchDrop`(用 T6 的 `resolveDropDispatch`)→ `switch(kind)` 调 `moves.retrieveJoker` / `moves.insertTilesWithPush` / `moves.moveTiles` / `buzz`。**R1:** joker-swap 必须在挤位之前(joker 格被占,漏前置会被挤开而非取回)。**(rubber-duck 修正)joker-swap 仅 DRAG 路径**:`GridSlot` 只在**空格**挂 `onCellTap`(占位的 joker 格根本不触发 tap),故 `onCellTap` 走同一 `dispatchDrop` 但目标恒为空格 → `jokerSwapTarget` 返回 `{ok:false}`、自然只命中 push/snap;**无需改 `GridSlot`,也不写 onCellTap-joker 测试**。

- [ ] **Step 1 失败测试**(RTL,mock moves):拖**匹配**牌到 board joker → 调 `moves.retrieveJoker(jokerId,id)`(不调 insertTilesWithPush/moveTiles);拖**不匹配**牌到 joker → 走 `moves.insertTilesWithPush`(挤位);全空 board 目标 → `moveTiles`;`onCellTap` 经同一 `dispatchDrop`(目标恒空格 → 只命中 push/snap,**不测 joker**)。
- [ ] **Step 2 跑测试确认失败**。
- [ ] **Step 3 实现**(既有 board-insert-push-dispatch/tap-to-place 回归绿)。
- [ ] **Step 4 跑测试确认通过** + `npm run build` 绿。
- [ ] **Step 5 提交** `feat(joker): drag a matching tile onto a board joker to retrieve it`。

---

## Task T8 — WS-G tap-to-place 键盘路径(最小 v1)

**Files:** Create `src/rummikub/components/useTilePlacementHotkeys.js`;Modify `Board.jsx`;Test `src/tests/keyboard-tap-to-place.test.js`。**Board 串行段②。**

**实现(见 review-2 §G,镜像 `useUndoRedoHotkeys`):** 聚焦一张手牌后 Enter/Space → 经 `dispatchDrop`/`resolveDropSlot` 把它放到 `firstFreeBoardCell`(v1 不做 cursor 选格);仅你的回合可用、editable-target 让位、聚焦 board 牌 no-op。

- [ ] **Step 1 失败测试**(RTL,tap-to-place client harness):`el.focus()` 手牌 + `keyDown Enter` → 牌落 board、`gameStateStack` +1、`play('place')`;`currentPlayer:'1'`→无 move;聚焦 board 牌→no-op。
- [ ] **Step 2 跑测试确认失败**。
- [ ] **Step 3 实现**。
- [ ] **Step 4 跑测试确认通过**。
- [ ] **Step 5 提交** `feat(a11y): keyboard tap-to-place for a focused hand tile`。

---

## Task T9 — WS-H 首次开启 Hints 一次性 tooltip

**Files:** Modify `src/rummikub/components/Board.jsx`/`HintsToggle.jsx`、`board.css`(`.hints-tip`);Test `src/tests/hints-tip.test.js`。**Board 串行段③。**

**实现(见 review-2 §H,键 `rummycube:hintsTipSeen`):** 首次「关→开」Hints 时弹一次性非阻塞 tooltip `These highlight tiles you can add to a group already on the table. You still need your 30-point opening meld first.`,带 `Got it`;持久化后不再弹。进入动画门控。

- [ ] **Step 1 失败测试**(RTL,hints-toggle harness):首次点开 → tooltip 现 + `localStorage['rummycube:hintsTipSeen']==='1'`;预置 flag → 点开不现;`Got it`→移除。
- [ ] **Step 2 跑测试确认失败**。
- [ ] **Step 3 实现**。
- [ ] **Step 4 跑测试确认通过**。
- [ ] **Step 5 提交** `feat(assist): one-time tooltip on first Hints enable`。

---

## Task T10 — WS-E PlayerAvatar 用权威 G.connected

**Files:** Modify `src/rummikub/components/PlayerAvatar.jsx`(纯展示不变)、`Board.jsx`(selfAvatar)、`TableSeats.jsx`;Test `src/tests/player-avatar-connected.test.js`。**依赖 T3;可与 Board 串行段并行(不同接线点)。**

**实现(见 review-2 §E.3):** selfAvatar `isConnected={seatConnected(G.connected, Number(playerID), selfData.isConnected)}`;TableSeats `isConnected={seatConnected(connected, data.id, data.isConnected)}`(Board 把 `G.connected` 传给 TableSeats)。

- [ ] **Step 1 失败测试**(RTL):`G.connected[seat]===false`→显示掉线徽标;`G.connected` 缺省→回退 metadata `isConnected`。
- [ ] **Step 2 跑测试确认失败**。
- [ ] **Step 3 实现**。
- [ ] **Step 4 跑测试确认通过**。
- [ ] **Step 5 提交** `feat(net): drive disconnect badge from authoritative G.connected`。

---

## Task T11 — WS-F 视觉 / 无障碍 CSS

**Files:** Modify `src/rummikub/components/board.css`;Test `src/tests/board-visual-ws-f.test.js`(源断言,同 `board-layout-css.test.js` 风格)。**board.css 串行(T9 的 `.hints-tip` 类名定稿后)。**

**实现(见 review-2 §F):** ① `.primary-action`/`.secondary-action` 复用 `.icon-button` 的 `:focus-visible` 双环;② `.rack-tools` 断点与控件区对齐(560→820)+ 窄屏不重叠(`.controls-tools{position:relative}`);③ `.timeout-toast` `white-space:normal` + `max-width`,极窄屏不截断;④ 聊天留白槽 `.board-container` 底色改 `var(--felt)` 去缝。

- [ ] **Step 1**:实现四块 CSS。
- [ ] **Step 2 源断言测试**:两 action 类 `:focus-visible` 含双环色;`.rack-tools` 微调在 `max-width:820px`;`.timeout-toast` 含 `white-space:normal`+`max-width`;`.board-container` 背景 `var(--felt)`。
- [ ] **Step 3 全量** `npx jest` 全绿 + `npm run build` 绿。
- [ ] **Step 4 提交** `fix(ui): focus rings, rack-tools alignment, toast wrap, gutter seam`。

---

## 执行说明

- **串行热点:** `moves.js`(T4→T5→T6 部分)、`Board.jsx`(T7→T8→T9)、`board.css`(T11 + T9 的 `.hints-tip`)。纯件(T1/T2/T3)与 T10 可与串行段并行。
- 推荐顺序:**T1 → T2 → T3 → T4 → T5 → T6 → T7 → T8 → T9 → T10 → T11**。
- 全部完成后整支终审 + 全量 `npx jest` + `npm run build`(无新 `console.log`)+ `node src/server.js` 启动。

## rubber-duck 重点盯防(实现期)

- **R1(高)joker-swap 优先级**:必须早于挤位(joker 格被占)。T7 的「匹配→retrieveJoker、不匹配→insertTilesWithPush」两路是回归锁。
- **R2** `representedValue` 客户端/服务端一致(同一组纯函数;断序→`{ok:false}` 安全降级)。
- **R3** WS-C 草稿回滚:`gameStateStack.push` 在 insertTile 之前,`INVALID_MOVE` 必须连它一起回滚(测 `gameStateStack.length` 不增)。
- **R4** WS-D 行参数用 `result.row`;`selection` 含 `primaryId`。
- **R5/R6/R7** 键盘焦点依赖 dnd-kit `tabIndex:0`(测用 `el.focus()` 不依赖);WS-F 像素真机复验;删 unused `deactivateTileVariant` import。

## Self-Review(spec 覆盖)

- WS-A→T1 ✅;WS-B→T2(helper)+T4(move)+T7(分支)✅;WS-C→T5 ✅;WS-D→T6+T7 ✅;WS-E→T3+T10 ✅;WS-F→T11 ✅;WS-G→T8 ✅;WS-H→T9 ✅。
- 类型一致:`jokerSwapTarget→{ok,jokerId,representedValue}`(T2 定、T6/T7 用);`seatConnected→bool`(T3 定、T10 用);`resolveDropDispatch→{kind,args}`(T6 定、T7 `switch(kind)`);`retrieveJoker(_,jokerId,tileId)`(T4 定、T7 调)。
- 占位扫描:无 TODO/TBD;combo 权重/阈值给定值;WS-G cursor 版明确顺延为 v1。
- combo 守卫:ComboOverlay 不改靠「可达分=3 的倍数」不变量,plan 要求 T1 加守卫注释记录该依赖。✅
- rubber-duck(gpt-5.5)复核已并入:① joker-swap **仅 DRAG**(GridSlot 占位格不触发 onCellTap,无需改 GridSlot,不写 onCellTap-joker 测试);② `resolveDropDispatch` 统一 `{kind,args}` 形态(覆盖 review-2 的 `{move}` 草图)。其余(combo 量纲对齐、joker 优先级、retrieveJoker 简化、moveTiles 回滚、边界约定、T8-T11)经核实无阻断。✅
