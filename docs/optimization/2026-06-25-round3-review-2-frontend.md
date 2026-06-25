# RummyCube · 第三轮(backlog 清理 + joker 取回 UI + 机械修复)· 前端实现评审(report · frontend)

**评审人:** Frontend Developer agent · **日期:** 2026-06-25
**输入:** `docs/optimization/2026-06-25-round3-spec.md`(已评审 spec)。本报告负责 **WS-B…WS-H**(WS-A combo 调参归游戏设计专家;此处仅列其与前端的接口边界)。
**方法:** 逐行核对 `moves.js` / `Game.js` / `Board.jsx` / `dndUtil.js` / `util.js` / `moveValidation.js` / `insertPush.js` / `PlayerAvatar.jsx` / `TableSeats.jsx` / `HintsToggle.jsx` / `useUndoRedoHotkeys.js` / `Tile.jsx` / `GridSlot.jsx` / `connTransport.js` / `board.css`,以及全量测试基线。
**本报告不改任何代码。** 所有文件名/行号均为实测;签名/正文为实现草图(implementer 落地时以此为准)。

---

## 0. 基线与红线核验(已实测)

| 项 | 结果 |
|---|---|
| `npx jest` | **65 suites / 352 passed**(基线全绿,8.3s) |
| `node --check src/server.js` | ✅ 通过;server 入口显式 `.js`(`server.js:4-7`) |
| 服务端导入图无 JSX | ✅ `moves.js`/`dndUtil.js`/`moveValidation.js`/`util.js`/`insertPush.js` 均不 import `.jsx`/`components/`(实测)。**WS-B/WS-D 会让 `dndUtil.js` 新 import `moveValidation.js`+`util.js`+`insertPush.js`——三者皆 `.js` 且不反向 import `dndUtil`,无环、server boot 不破**(实测:三者 `grep dndUtil` 无命中) |
| jsdom 无 `matchMedia` | ✅ `setupTests.js` 不 polyfill;canonical 守卫 `effects.js` `reduced()`(`window.matchMedia &&`)。本轮新动画一律走 CSS `@media (prefers-reduced-motion: no-preference)`,不在 JS 侧读 matchMedia |
| `timePerTurn` = 毫秒 | ✅ `Game.js:36` `(setupData?…:10)*1000`;新测试 setup 直接给毫秒,勿再 ×1000 |
| 无新依赖 | @dnd-kit/core **6.3.1**、lodash 已在;本轮全部用现有依赖 |
| 无新 `console.log` | 本轮所有改动均不新增 `console.log`(既有 `drawTile`/`onPlayPhaseBegin` 的 log 不动) |

**关键事实(直接决定实现路径):**
- `tilePositions: tileId → {id,col,row,gridId,playerID,tmp?}`;board 牌 `playerID:null`、`tmp:true/false`;hand 牌 `playerID` 为座位字符串(`Game.js:22-28`、`moves.js:116`)。**tile id 本身就是 `buildTileObj` 的编码整数**,作对象键时为数字字符串;`getTileValue/isJoker` 等位运算对数字字符串隐式强转,但本报告所有 helper 一律 `Number(id)` 显式化。
- 占位格(有 tile)在 `GridSlot.jsx:26-27` 仍 `useDroppable` 注册 slot id,故**把手牌拖到桌上 joker 上时 `e.over.id === 'b:jokerCol:jokerRow'`**——这是 WS-B joker-swap 分流能落地的前提(实测 `GridSlot.jsx:23,27`;既有 insert-push 测试也依赖占位格可 droppable)。
- `extractSeqs(G)` / `isBoardValid(G)` / `freezeSeqJokers(seq)` / `isSequenceValid(seq)` **只读 `G.tilePositions` 或纯 tile 数组**(`moveValidation.js:25-66,69-77`、`util.js:255-266,329-332`),故客户端可用 `extractSeqs({tilePositions})` 复算 joker 代表值。
- dnd-kit 6.3.1 `useDraggable().attributes` 默认含 `role` + `tabIndex:0`(实测 `core.cjs.development.js:3404,3431`),Tile 已 `{...attributes}`(`Tile.jsx:151`)。**故非 disabled 的牌天然可聚焦**——手牌 `canDnD={!waiting}`(`Board.jsx:533`)恒可聚焦,WS-G 键盘路径无需新增 `tabIndex`。

---

## WS-B · retrieveJoker = 经典 1 张 + 拖拽 UI

### B.1 涉及文件/签名

| 文件 | 改动 |
|---|---|
| `src/rummikub/moves.js` | `JOKER_RETRIEVE_TILES_NEEDED = 2 → 1`(`:367`);`retrieveJoker(_, jokerTileId, tileA, tileB)` → `retrieveJoker(_, jokerTileId, tileId)`(`:377-423`,正文简化) |
| `src/rummikub/Game.js` | **仅核对,无改动**:`retrieveJoker` 已 import(`:3`)并注册于 `moves`(`:82`);签名变更是位置实参,注册不变 |
| `src/rummikub/dndUtil.js` | **新增纯 helper** `jokerSwapTarget(tilePositions, cell, draggedTileId)` |
| `src/rummikub/components/Board.jsx` | `onDragEnd`(`:167-214`)在挤位分流**之前**新增 joker-swap 分支 |

### B.2 纯 helper 签名 `jokerSwapTarget`

放 `dndUtil.js`(已在 server 图、纯函数)。镜像服务端 `retrieveJoker` 的资格判定(**不含**换后 `isBoardValid`——那是服务端权威,客户端不预判几何破坏)。

```js
// dndUtil.js — 新增 import:
import {BOARD_GRID_ID, HAND_GRID_ID} from "./constants.js";   // 已有 HAND_GRID_ID,补 BOARD_GRID_ID
import {extractSeqs} from "./moveValidation.js";
import {freezeSeqJokers, isSequenceValid, isJoker, getTileValue} from "./util.js";

// 纯判定:落点 cell 上若坐着一张「已结算(非 tmp)、且在合法 run/group 中」的桌面
// joker,且被拖的手牌是一张非 joker、值 == 该 joker 代表值的手牌,则返回
// {ok:true, jokerId, representedValue};否则 {ok:false}。从不 mutate。
// cell = {gridId,col,row}(parseSlotId 的产物)。
export function jokerSwapTarget(tilePositions, cell, draggedTileId) {
    if (!cell || cell.gridId !== BOARD_GRID_ID) return {ok: false};

    // 1) 落点格上的已结算桌面 joker
    let jokerId = null;
    for (const id in tilePositions) {
        const p = tilePositions[id];
        if (!p || p.gridId !== BOARD_GRID_ID || p.row !== cell.row || p.col !== cell.col) continue;
        if (p.tmp) return {ok: false};         // 本回合暂放,不是可取回的结算牌
        if (!isJoker(Number(id))) return {ok: false}; // 落点占用者不是 joker
        jokerId = Number(id);
        break;
    }
    if (jokerId === null) return {ok: false};  // 落点为空格 → 交回既有分流

    // 2) 被拖牌必须是本端手牌、且非 joker(playerView 已剥离他人手牌,故 'h' 即本人)
    const draggedId = Number(draggedTileId);
    const dp = tilePositions[draggedId];
    if (!dp || dp.gridId !== HAND_GRID_ID) return {ok: false};
    if (isJoker(draggedId)) return {ok: false};

    // 3) joker 须在合法序列内 → 冻结求代表值
    const seq = extractSeqs({tilePositions}).find(s => s.some(t => Number(t) === jokerId));
    if (!seq || !isSequenceValid(seq)) return {ok: false};
    const frozen = freezeSeqJokers(seq);
    if (!frozen) return {ok: false};
    const idx = seq.findIndex(t => Number(t) === jokerId);
    const representedValue = getTileValue(frozen[idx]);

    // 4) 值匹配(颜色交服务端换后 isBoardValid 兜底)
    if (getTileValue(draggedId) !== representedValue) return {ok: false};

    return {ok: true, jokerId, representedValue};
}
```

### B.3 `onDragEnd` 分流优先级(joker-swap **先于** insert-push)

落点是 joker 占位格时 `occupiedInRun` 必为 true,若不前置就会被 insert-push 把 joker 挤开——**故 joker-swap 必须排在最前**。在 `Board.jsx:170` `parseSlotId` 之后、`:188` 挤位分支之前插入:

```js
const {gridId, col, row} = parseSlotId(String(e.over.id));
const id = e.active.id;
const selectedTiles = stateRef.current.selectedTiles;
const selectionLength = selectedTiles.length || 1;

// WS-B:单张手牌拖到「值匹配的已结算桌面 joker」上 → 取回 joker(不走 place/push)。
// 必须早于挤位分流(joker 格被占,否则会被当成 occupiedInRun 挤位)。
if (selectionLength === 1 && gridId === BOARD_GRID_ID) {
    const swap = jokerSwapTarget(gRef.current.tilePositions, {gridId, col, row}, id);
    if (swap.ok) {
        moves.retrieveJoker(swap.jokerId, id);   // 客户端只决定路径;服务端是权威
        markSyncing();
        play('place');
        setState({selectedTiles: [], lastSelectedTileId: null});
        return;
    }
}
// …既有 inBounds/occupiedInRun 挤位分流(:186-201)…
// …既有 resolveDropSlot + moveTiles(:202-213)…
```

**完整决策序(onDragEnd):**
1. `!e.over` → return(脱靶,无操作)。
2. **joker-swap**(N==1 且 board 落点是值匹配的已结算 joker)→ `moves.retrieveJoker(jokerId, id)`。
3. board 且 `inBounds && occupiedInRun`:`insertWithPush` 可行 → `moves.insertTilesWithPush`;不可行 → `buzz()`、不发 move。
4. 其余:`resolveDropSlot` → `ok` 调 `moves.moveTiles`;`!ok` → `buzz()`。

**边界(与 spec §3 WS-B 一致):**
- 拖**非匹配**手牌到 joker → `jokerSwapTarget` 返回 `{ok:false}` → 落到第 3 步(把 joker 挤开,纯几何重排,提交时再裁定),既有行为不变。
- N>1(多选拖)→ `selectionLength===1` 不成立 → 不触发取回。
- 拖的是 joker 本身 / joker 不在合法组 / 落点空格 → helper `{ok:false}`,走既有分流。
- 换后破坏棋盘 → **服务端** `retrieveJoker` 末尾 `!isBoardValid → INVALID_MOVE`(immer 丢弃),G 不变。客户端可选地在预判失败时 `buzz()`(本报告**不做**:误判极少且会与既有分流的反馈叠加,保持最小)。

### B.4 服务端 `retrieveJoker` 单张正文草图(`moves.js:377-423`)

```js
const JOKER_RETRIEVE_TILES_NEEDED = 1   // classic:任意单张所代表的牌即可换回

function retrieveJoker({G, ctx, playerID}, jokerTileId, tileId) {
    if (playerID !== ctx.currentPlayer) return INVALID_MOVE

    const jokerId = Number(jokerTileId)
    const jokerPos = G.tilePositions[jokerId]
    if (!jokerPos || jokerPos.gridId !== BOARD_GRID_ID || jokerPos.tmp || !isJoker(jokerId)) {
        return INVALID_MOVE
    }
    const jokerRow = jokerPos.row
    const jokerCol = jokerPos.col

    // joker 须在当前合法序列内 → 冻结求代表值
    const seq = extractSeqs(G).find(s => s.some(t => Number(t) === jokerId))
    if (!seq || !isSequenceValid(seq)) return INVALID_MOVE
    const frozen = freezeSeqJokers(seq)
    if (!frozen) return INVALID_MOVE
    const jokerIndex = seq.findIndex(t => Number(t) === jokerId)
    const representedValue = getTileValue(frozen[jokerIndex])

    // 被换手牌:必须是本玩家手牌、非 joker、值 == 代表值。颜色由换后 isBoardValid 兜底。
    const swapTile = Number(tileId)
    const swapPos = G.tilePositions[swapTile]
    if (!swapPos || swapPos.gridId !== HAND_GRID_ID || String(swapPos.playerID) !== String(playerID)) return INVALID_MOVE
    if (isJoker(swapTile)) return INVALID_MOVE
    if (getTileValue(swapTile) !== representedValue) return INVALID_MOVE

    // 换:手牌占 joker 板位(tmp:false, playerID:null),joker 回手牌原手位(tmp:false)
    const swapRow = swapPos.row
    const swapCol = swapPos.col
    G.tilePositions[swapTile] = {id: swapTile, col: jokerCol, row: jokerRow, gridId: BOARD_GRID_ID, tmp: false, playerID: null}
    G.tilePositions[jokerId]  = {id: jokerId,  col: swapCol,  row: swapRow,  gridId: HAND_GRID_ID,  tmp: false, playerID}

    // 换后非法 → 整体 no-op(immer 丢弃草稿,含上面两处写入一并回滚)
    if (!isBoardValid(G)) {
        return INVALID_MOVE
    }
}
```

**相对现状的删减(`moves.js:398-409`):**
- 删 `[Number(tileA), Number(tileB)].slice(0, NEEDED)` 与 `new Set(candidates).size !== NEEDED` 的「两张不同 id」门槛 → 单张。
- 删 `new Set(candidates.map(deactivateTileVariant)).size !== 1` 的「两张同色」校验 → 单张不需要,颜色交 `isBoardValid` 兜底(spec 明确)。
- `deactivateTileVariant` import 若仅此处用,落地后可能变 unused(`moves.js:19`)——implementer 落地时核 `grep`,若无他用则一并删 import(否则保留)。**实测当前 `moves.js` 仅 `retrieveJoker` 用到它**,故大概率删 import;留 reviewer 复核。
- 保留语义:仅当前玩家、joker 须在合法组、非破坏性(`INVALID_MOVE`→immer 丢弃)、不结束回合/不抽牌。
- **`String(swapPos.playerID) !== String(playerID)`**:现状 `:405` 用严格 `!==`(两侧皆 "0" 字符串可用);本草图改 `String()` 强转,与 `insertTilesWithPush:177` 一致、更稳。属可选硬化,reviewer 定。

### B.5 既有测试需同步(`src/tests/retrieve-joker.test.js`)

现 4 个用例以 `retrieveJoker(BlackJoker, red5a, red5b)` 三实参调用(`:52,73,86,98`),**签名变更后必须改为两实参** `retrieveJoker(BlackJoker, red5a)`:
- 「成功换」:`red5b` 不再需要 → 用例改为手里只有 `red5a` 也能换(放宽断言:`red5b` 相关断言删去)。
- 「缺第二张拒」用例语义消失 → **替换**为新用例:`getTileValue !== representedValue` 的牌拒(值不匹配)。
- 「换后破坏(blue5)」「非当前玩家拒」保留,改两实参。

---

## WS-C · moveTiles 加固(传播 INVALID_MOVE + 空值守卫)

### C.1 涉及/签名:仅 `src/rummikub/moves.js`(`moveTiles` `:78-130`、内嵌 `insertTile` `:85-117`)

**问题坐实:** `insertTile` 在 6 条路径返回 `INVALID_MOVE`(`:88,101,102,107,110,113`),但 `moveTiles` 的调用处(`:124-126` 的 `.map`、`:128` 单张)**丢弃返回值**。又因 `:80` 已先 `G.gameStateStack.push(getGameState(G))`,被拒的插入仍「成功」并留下一条幽灵 undo 快照(`tilePositions` 未变但 `gameStateStack` 多了一条,Undo 被点亮却无视觉变化)。且 `:90` `currPos = G.tilePositions[tileId]` 后 `:92` 直接 `currPos.gridId` 解引用,无空值守卫。

### C.2 修复草图

(1) `insertTile` 开头加空值守卫(`:90` 取 `currPos` 后、`:92` 解引用前):

```js
function insertTile(tileId, destGridId, destRow, destCol) {
    if (isOverlap(G, ctx, destCol, destRow, destGridId, playerID)) {
        console.debug('overlap detected!')
        return INVALID_MOVE;
    }
    let currPos = G.tilePositions[tileId]
    if (!currPos) return INVALID_MOVE          // ← WS-C:防解引用(:92 前)
    let currPlayer = playerID
    let fromHandToBoard = currPos.gridId === HAND_GRID_ID && destGridId === BOARD_GRID_ID
    // …不变…
}
```

(2) `moveTiles` 调用处传播返回值(`:119-129`):

```js
if (selectedTiles.length > 0 && selectedTiles.indexOf(tileId) !== -1) {
    const ordered = orderTilesBySource(selectedTiles, G.tilePositions)
    for (let index = 0; index < ordered.length; index++) {
        if (insertTile(ordered[index], destGridId, row, col + index) === INVALID_MOVE) {
            return INVALID_MOVE     // 任一插入被拒 → 整个 moveTiles 拒(含 :80 的快照,immer 一并丢弃)
        }
    }
} else {
    return insertTile(tileId, destGridId, row, col)   // 单张直接传播
}
```

> `insertTile` 成功路径不显式 `return`(`:116` 写完即落空,返回 `undefined`),`undefined !== INVALID_MOVE`,判定正确。`return INVALID_MOVE` 使整个 reducer 返回 INVALID_MOVE → immer 丢弃**整张草稿**(含 `:80` push 的快照与已写入的前若干张),无部分落子、无幽灵 undo。

### C.3 边界:不改合法移动的行为;只把「本应拒绝」的路径真正拒绝。`:124` 的 `.map` 副作用迭代改为 `for` 是为早退,不改顺序(`ordered` 已是 reading order)。

---

## WS-D · DRY(挤位分流共享 helper + boardRowTiles 复用 + BOARD_GRID_ID 常量)

### D.1 三处重复(逐一坐实)

| 重复 | 位置 |
|---|---|
| 挤位分流分支在 `onDragEnd`/`onCellTap` 各抄一遍 | `Board.jsx:186-213`(drag)与 `:265-290`(tap),逻辑近乎逐行重复(occupancy→inBounds→occupiedInRun→insertWithPush 可行性→push 或 resolveDropSlot+moveTiles) |
| `insertTilesWithPush` 内联重排了 `boardRowTiles` 已做的事 | `moves.js:150-156` 手写「收集本行 board 占用、排除 selection」,与 `dndUtil.js:121-130` `boardRowTiles` 等价 |
| `boardRowTiles` 硬编码 `'b'` | `dndUtil.js:126` `p.gridId !== 'b'` 应为 `BOARD_GRID_ID` |

### D.2 抽共享纯判定 `resolveDropDispatch`(放 `dndUtil.js`)

返回**「调哪个 move + 参数」或「buzz」**的描述符;`onDragEnd`/`onCellTap`(及 WS-G 键盘路径)共用,**优先级只定义一次**。把 WS-B 的 joker-swap 也并入作为第 1 优先级(`onCellTap`/键盘因此也自然支持取回,纯增量、无回归;若团队要把爆炸半径压到只剩 drag,可加 `allowJokerSwap` 旗标,`onDragEnd` 传 true、其余传 false——**本报告推荐统一开启**)。

```js
// dndUtil.js — 复用已有纯件
import {insertWithPush} from "./insertPush.js";

// 决定一次 board/hand 落子/点放应派发的权威 move。纯函数:返回描述符,副作用
// (音效/setState/moves.*)交调用方。优先级:(1) joker 取回 →(2) 越界内挤位 →
// (3) 吸附 moveTiles →(4) 拒绝(buzz)。几何/joker 资格是客户端提示,服务端权威。
//   tilePositions : 活的 G.tilePositions(只读)
//   target        : {gridId,col,row}
//   primaryId     : 主拖/主放牌 id(onDragEnd=e.active.id;onCellTap=selectedTiles[0])
//   selection     : 完整选择数组(调用方保证非空且含 primaryId)
//   playerID      : 占用域(hand 网格按玩家、board 忽略)
//   boardCols/handCols : 列计数(BOARD_COLS=32 / HAND_COLS=22)
export function resolveDropDispatch({tilePositions, target, primaryId, selection, playerID, boardCols, handCols, allowJokerSwap = true}) {
    const {gridId, col, row} = target;
    const N = selection.length;
    const maxCols = gridId === BOARD_GRID_ID ? boardCols : handCols;

    // (1) WS-B:单张 → joker 取回
    if (allowJokerSwap && N === 1 && gridId === BOARD_GRID_ID) {
        const swap = jokerSwapTarget(tilePositions, target, primaryId);
        if (swap.ok) return {move: 'retrieveJoker', args: [swap.jokerId, primaryId], sound: 'place'};
    }

    const isOccupied = buildRowOccupancy(tilePositions, gridId, selection, playerID);
    const inBounds = col >= 0 && col + N <= maxCols;
    const occupiedInRun = inBounds && !isRunFree(isOccupied, col, N, row, maxCols);

    // (2) WS-6:越界内、落在占用 span → 挤位
    if (gridId === BOARD_GRID_ID && occupiedInRun) {
        const rowTiles = boardRowTiles(tilePositions, row, selection);
        const plan = insertWithPush(rowTiles, col, N, boardCols - 1);
        if (!plan) return {reject: true};   // 无处可挤 → buzz
        const ordered = orderTilesBySource(selection, tilePositions);
        return {move: 'insertTilesWithPush', args: [col, row, gridId, {id: primaryId}, ordered], sound: 'place'};
    }

    // (3) 吸附
    const result = resolveDropSlot(target, isOccupied, N, maxCols);
    if (!result.ok) return {reject: true};
    return {move: 'moveTiles', args: [result.cols[0], result.row, gridId, {id: primaryId}, selection], sound: 'place'};
}
```

> 注:现状 `moveTiles` 的行参数 `onDragEnd` 用 `row`、`onCellTap` 用 `result.row`(同值,`resolveDropSlot` 回填 `row`);统一用 `result.row` 安全。`selection` 作 `moveTiles` 第 5 实参(决定多张 ordered 落子),单张时 `[primaryId]`,与现状 `selectedTiles`(单拖时被 `onDragStart` 置 `[id]`)等价。

### D.3 `Board.jsx` 两处收口为薄派发

```js
const dispatchDrop = useCallback((target, primaryId, selection) => {
    const d = resolveDropDispatch({
        tilePositions: gRef.current.tilePositions, target, primaryId, selection,
        playerID, boardCols: BOARD_COLS, handCols: HAND_COLS,
    });
    if (d.reject) { buzz(); }
    else { moves[d.move](...d.args); markSyncing(); if (d.sound) play(d.sound); }
    setState({selectedTiles: [], lastSelectedTileId: null});
}, [moves, playerID, markSyncing]);

// onDragEnd:
const onDragEnd = useCallback((e) => {
    setActiveTile(null); setIsDragActive(false);
    if (!e.over) return;
    const target = parseSlotId(String(e.over.id));
    const id = e.active.id;
    const sel = stateRef.current.selectedTiles.length ? stateRef.current.selectedTiles : [id];
    dispatchDrop(target, id, sel);
}, [dispatchDrop]);

// onCellTap:
const onCellTap = useCallback((gridId, col, row) => {
    const sel = stateRef.current.selectedTiles;
    if (!sel.length) return;
    dispatchDrop({gridId, col, row}, sel[0], sel);
}, [dispatchDrop]);
```

`moves[d.move](...d.args)`:`d.move ∈ {retrieveJoker, insertTilesWithPush, moveTiles}` 全在 `Game.js` `moves` 注册。**回归保证:** 既有 `board-insert-push-dispatch.test.js`(8 用例,断言 push/move 的实参与 buzz)行为不变即绿。

### D.4 `moves.js` `insertTilesWithPush` 复用 `boardRowTiles`(`:149-156`)

```js
import {orderTilesBySource, boardRowTiles} from "./dndUtil.js";   // 补 boardRowTiles
// …
const rowTiles = boardRowTiles(G.tilePositions, row, [...sel]);   // 替换 :150-156 内联循环
```

> `sel` 是 `Set<string>`(`:147`);`boardRowTiles` 内部 `new Set((excludeIds||[]).map(String))`,传 `[...sel]` 即可。语义等价(排除 selection、收集本行 board 占用)。

### D.5 `dndUtil.js` `boardRowTiles` 用常量(`:126`)

```js
import {BOARD_GRID_ID, HAND_GRID_ID} from "./constants.js";   // 补 BOARD_GRID_ID
// …
if (!p || p.gridId !== BOARD_GRID_ID || p.row !== row || ex.has(String(id))) continue;   // :126
```

### D.6 测试:既有 T4/T3(`board-insert-push-dispatch.test.js`、`tap-to-place.test.js`、`insert-tiles-with-push.test.js`)回归绿即可;新增 `resolveDropDispatch` 纯单测(见 §测试)。

---

## WS-E · PlayerAvatar → 权威 `G.connected`

### E.1 现状与涉及

- `PlayerAvatar.jsx:13` 收 `isConnected` prop,`:35,:40` 以 `isConnected === false` 渲染 `.offline` + 🔌 徽标。
- 数据源现为 **metadata**:`Board.jsx:585` selfAvatar `isConnected={selfData.isConnected}`;`TableSeats.jsx:28` `isConnected={data.isConnected}`(`data` 来自 `matchData[seat]`)。
- 权威源 `G.connected[seat]` 已由 WS-12 建立(`Game.js:50` setup `Array(numPlayers).fill(true)`;`moves.js:453-461` `_setConnection` 服务端写;`connTransport.js` 经 socket sync/disconnect 派发;`playerView` 透传 `view.connected`)。

### E.2 抽纯 helper `seatConnected`(放 `src/rummikub/seats/seatConnection.js`,与 `tableLayout.js` 同目录)

```js
// G.connected 是 WS-12 权威 per-seat 标志。WS-12 前的旧局没有它(undefined),
// 回退到 boardgame.io metadata 的 isConnected。仅在显式 false 时判离线;
// undefined/缺失一律读作在线,绝不误报离线徽标。
export function seatConnected(connected, seat, metaConnected) {
    if (Array.isArray(connected) && connected[seat] !== undefined) {
        return connected[seat] !== false;
    }
    return metaConnected !== false;
}
```

### E.3 接线(PlayerAvatar 保持纯展示,值在上游算好)

```js
// Board.jsx selfAvatar(:585):
isConnected={seatConnected(G.connected, Number(playerID), selfData.isConnected)}

// Board.jsx tableSeats(:559-571)新增 prop:
<TableSeats … connected={G.connected} />

// TableSeats.jsx(签名补 connected;:28):
isConnected={seatConnected(connected, data.id, data.isConnected)}
```

> 不改 `PlayerAvatar` 的 `isConnected` 入参契约(降低爆炸半径);只换「喂进去的值」。`G.connected[seat]===false` → helper 返回 false → `isConnected===false` → 徽标显示。

### E.4 测试:`seatConnected` 纯单测(权威 false→断线、权威 true→在线、`undefined`→回退 metadata、`connected` 非数组→回退);RTL(coach-card harness)渲染 Board/TableSeats 断言徽标随 `G.connected` 出现/隐藏(见 §测试)。注意 `disconnect-handling.test.js` 现以 reducer 验 `G.connected` 写入,**不依赖 metadata**,不受影响。

---

## WS-F · 视觉 / 无障碍打磨(`board.css`)

> jsdom 测不了像素;落地以 **CSS 源断言**(`board-layout-css.test.js` 既有风格:`fs.readFileSync` + 正则)守护规则存在,真机复验观感。

### F.1 `.primary-action` / `.secondary-action` 复用 `.icon-button` 焦点环(`:685,:740`)

`.icon-button:focus-visible`(`:159-162`)用双环 `box-shadow: 0 0 0 2px #0b1f3a, 0 0 0 5px #8fc7ff`。两个 action 类目前**无任何 `:focus-visible`**(实测无命中)。新增:

```css
/* WS-F:键盘焦点环与 .icon-button 一致(双环:深蓝内 + 亮蓝外,至少一边 ≥3:1)。
   primary 叠回它的 3D 阴影以不丢立体感;secondary 仅环。 */
.primary-action:focus-visible {
    outline: none;
    box-shadow: 0 0 0 2px #0b1f3a, 0 0 0 5px #8fc7ff,
                0 4px 0 #9c7a33, 0 6px 16px rgba(0, 0, 0, .42);
}
.secondary-action:focus-visible {
    outline: none;
    box-shadow: 0 0 0 2px #0b1f3a, 0 0 0 5px #8fc7ff;
}
```

> `:focus-visible` 只在键盘焦点触发,不影响鼠标。放在 `.primary-action:disabled`(`:714`)之后,等特异性下后定义者胜。

### F.2 `.rack-tools` 断点与控件对齐(`:117` + `@media 560` `:166`)

`.rack-tools`(undo/redo 角标)的手机微调在 `@media (max-width:560px)`,而控件区 `.controls-wrapper` 在 `@media (max-width:820px)` 才重排(`:219`)——560/820 错位,560–820 之间角标仍用桌面偏移。**对齐到 820**:

```css
@media (max-width: 820px) {   /* was 560 */
    .rack-tools { right: 4px; gap: 6px; }
    .icon-button { font-size: 18px; }
}
```

> `.rack-tools` 为 `position:absolute; bottom:calc(100%+2px); z-index:7`(`:117-121`),坐在 rack 上沿、压 `controls` 之上的层级。对齐断点后,角标的收紧与整行重排同步发生,消除中间带的偏移;极窄屏 `right:4px` 保证不压右侧对家座位。**真机复验**它与 `turn-banner`/`playable-hint`(同在 rack 上方)不重叠。

### F.3 `.timeout-toast` 极窄屏不截断(`:1338`,`white-space:nowrap` 在 `:1352`)

`nowrap` 在极窄屏会把长公告(如 "Alice's turn passed — drew 2")裁掉。改为允许换行 + 限宽居中:

```css
.timeout-toast {
    /* …不变… */
    white-space: normal;                 /* was nowrap */
    max-width: min(92vw, 360px);
    text-align: center;
}
```

> toast 是 `display:inline-flex`(`:1339`)、`pointer-events:none`;换行后仍居中。动画 `@media (prefers-reduced-motion: no-preference)`(`:1355`)不动,门控保持。

### F.4 聊天留白槽 felt 缝(`@media(min-width:821px) .board-container` `:30-32`)

`.board-container` 背景是 **flat** `--felt-base: #1c4528`(`:14`),而 `.board` 是 **gradient** `--felt: radial-gradient(…#3a7d4f…#1c4528)` + vignette(`:49-50`)。821px 起 `.board-container { padding-right: calc(300px+16px) }` 让出的右槽露出容器的 flat 底色,与 board 的渐变间产生肉眼可见的缝。最小改:让容器也铺渐变,使留白槽与 board 连续:

```css
.board-container {
    background: var(--felt);          /* was var(--felt-base, #1c4528):flat→gradient 去缝 */
    /* …其余不变… */
}
```

> flat→gradient 比 flat-vs-gradient 顺接得多(渐变 origin 仍有极小差,真机可接受)。**更彻底**的备选:把右槽改由 `.board` 自身 padding 让出(felt 随 board 铺满)、内层 `.ref`/rack 用各自 margin 收口——改动更大、风险更高,**不推荐本轮做**。本轮取一行容器底色改 + 真机复验。

### F.5 测试:`board-layout-css.test.js` 风格新增源断言——两 action 类 `:focus-visible` 含双环色;`.rack-tools` 微调块在 `max-width:820px`;`.timeout-toast` 含 `white-space:normal` + `max-width`;`.board-container` 背景为 `var(--felt)`。

---

## WS-G · tap-to-place 键盘路径(最小 v1)

### G.1 设计(沿用 `useUndoRedoHotkeys` 风格 + editable-target 守卫)

`onCellTap` 仅指针可达(`GridSlot.jsx:47-49` 只在 `hasSelection && canDnD` 给空格挂 `onClick`)。`Board.jsx:292-296` 的 TODO 已指明完整版(roving-tabindex 网格 cursor)超出「便宜即做」的门槛。**v1 最小**:聚焦一张手牌 → Enter/Space 直接把它(经既有派发)放到**第一个空 board 格**(行优先扫描),给键盘用户一条「送上桌」通路。无 cursor、无新 `tabIndex`(dnd-kit 已使非 disabled 牌可聚焦,见 §0)。

新建 `src/rummikub/components/useTilePlacementHotkeys.js`(镜像 `useUndoRedoHotkeys.js`):

```js
import {useEffect} from "react";
import {HAND_GRID_ID} from "../constants";

function isEditableTarget(t) {   // 复制 useUndoRedoHotkeys 的守卫(或抽公共)
    if (!t) return false;
    if (t.isContentEditable) return true;
    const tag = t.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return true;
    return typeof t.closest === 'function'
        && !!t.closest('input, textarea, [contenteditable=""], [contenteditable="true"]');
}

// 聚焦一张手牌 → Enter/Space 把它放上桌。enabled=你的回合;getTilePos 读活 G;
// onPlaceTile 走与 tap 相同的派发。只对手牌(gridId==='h')生效;board 牌按 Tab
// 可聚焦但按键 no-op(v1 不做 board→board)。
export function useTilePlacementHotkeys({enabled, getTilePos, onPlaceTile}) {
    useEffect(() => {
        const handler = (e) => {
            if (isEditableTarget(e.target)) return;
            if (e.key !== 'Enter' && e.key !== ' ' && e.key !== 'Spacebar') return;
            const el = document.activeElement;
            if (!el || !el.id) return;
            const pos = getTilePos(el.id);
            if (!pos || pos.gridId !== HAND_GRID_ID) return;   // 只处理聚焦中的手牌
            if (!enabled) return;                               // 仅你的回合
            e.preventDefault();                                 // 吞掉 Space 滚动
            onPlaceTile(el.id);
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [enabled, getTilePos, onPlaceTile]);
}
```

### G.2 Board 接线 + 目标格

```js
// 第一个可容纳 selectionLen 连续空位的 board 格(行优先、列升序)。复用 buildRowOccupancy+isRunFree。
function firstFreeBoardCell(tilePositions, selectionLen, playerID) {
    const occ = buildRowOccupancy(tilePositions, BOARD_GRID_ID, [], playerID);
    for (let r = 0; r < BOARD_ROWS; r++)
        for (let c = 0; c + selectionLen <= BOARD_COLS; c++)
            if (isRunFree(occ, c, selectionLen, r, BOARD_COLS)) return {col: c, row: r};
    return null;
}

const placeFocusedHandTile = useCallback((tileId) => {
    const sel = stateRef.current.selectedTiles.length && stateRef.current.selectedTiles.includes(String(tileId))
        ? stateRef.current.selectedTiles : [String(tileId)];
    const cell = firstFreeBoardCell(gRef.current.tilePositions, sel.length, playerID);
    if (!cell) { buzz(); return; }
    dispatchDrop({gridId: BOARD_GRID_ID, col: cell.col, row: cell.row}, sel[0], sel);  // 复用 WS-D 派发
}, [dispatchDrop, playerID]);

useTilePlacementHotkeys({
    enabled: !waiting && ctx.currentPlayer === playerID && !ctx.gameover,
    getTilePos: (id) => gRef.current.tilePositions[id],
    onPlaceTile: placeFocusedHandTile,
});
```

> **复用 `dispatchDrop`(WS-D)**:键盘落子与拖/点同一条派发(含 joker-swap/挤位/吸附/拒绝),零分叉。目标格走 `firstFreeBoardCell`(v1 自动靶位:行优先第一处连续空位)。**无 KeyboardSensor**(Board 仅 Mouse/Touch sensor,`Board.jsx:112-114`),故 Enter/Space 不会触发 dnd-kit 键盘拖,无快捷键冲突。

### G.3 边界:仅你的回合可用(`enabled`);聊天输入等 editable target 让位(守卫);board 牌聚焦按键 no-op(v1 只手牌→桌)。完整 cursor 版仍留作后续(TODO 不删,降级为「已交付 v1 送上桌、cursor 待办」)。

### G.4 测试:RTL(tap-to-place 的真 client harness)——`el.focus()` 一张手牌后 `fireEvent.keyDown(el,{key:'Enter'})` → 牌落到 board、`gameStateStack` 增 1、`play('place')`;非你回合(`currentPlayer:'1'`)→ 无 move;聚焦 board 牌按键 → no-op(见 §测试)。

---

## WS-H · 首次开启 Hints 一次性 tooltip

### H.1 设计(键 `rummycube:hintsTipSeen`)

UX-pass T4 跳过的「首次把 💡 Hints 由关→开时弹一句非阻塞说明」。沿用 `coachSeen`/`hintsOn` 的 localStorage 模式(`Board.jsx:45-79`)。

```js
// Board.jsx,紧邻 hintsOn(:63-79):
const HINTS_TIP_KEY = 'rummycube:hintsTipSeen';
const hintsTipSeenRef = useRef(
    (() => { try { return localStorage.getItem(HINTS_TIP_KEY) === '1'; } catch (e) { return false; } })()
);
const [showHintsTip, setShowHintsTip] = useState(false);

const toggleHints = useCallback(() => {
    setHintsOn((on) => {
        const next = !on;
        try { localStorage.setItem(HINTS_KEY, next ? '1' : '0'); } catch (e) {}
        if (next && !hintsTipSeenRef.current) {     // 首次「关→开」
            setShowHintsTip(true);
            hintsTipSeenRef.current = true;
            try { localStorage.setItem(HINTS_TIP_KEY, '1'); } catch (e) {}
        }
        return next;
    });
}, []);
const dismissHintsTip = useCallback(() => setShowHintsTip(false), []);
```

渲染(在 `.controls-tools` 内 `HintsToggle` 旁,`:697-699`),非阻塞 `role="status"`、可手动关 + 自动消失:

```jsx
<div className="controls-tools">
    <HintsToggle on={hintsOn} onToggle={toggleHints}/>
    {showHintsTip && (
        <div className="hints-tip" role="status" aria-live="polite">
            These highlight tiles you can add to a group already on the table. You still need your 30-point opening meld first.
            <button type="button" className="hints-tip__close" aria-label="Dismiss" onClick={dismissHintsTip}>Got it</button>
        </div>
    )}
</div>
```

> 自动消失可用 `useEffect(()=>{ if(!showHintsTip) return; const t=setTimeout(dismissHintsTip, 6000); return ()=>clearTimeout(t); },[showHintsTip])`。文案为 spec 钦定英文原句。

### H.2 board.css(`.hints-tip`,紧邻 `.hints-toggle` `:1408`)

```css
.hints-tip {
    position: absolute;
    bottom: calc(100% + 8px);
    right: 0;
    max-width: min(78vw, 280px);
    padding: 8px 12px;
    border-radius: 10px;
    background: rgba(19, 71, 143, .96);
    color: #fff;
    font-size: clamp(11px, 1vw, 13px);
    line-height: 1.4;
    box-shadow: 0 6px 16px rgba(0, 0, 0, .4);
    z-index: 9;
}
/* 进入动画门控:reduced-motion 直接显示,不滑入 */
@media (prefers-reduced-motion: no-preference) {
    .hints-tip { animation: hints-tip-in .18s ease both; }
}
@keyframes hints-tip-in { 0% {opacity:0; transform: translateY(4px);} 100% {opacity:1; transform: translateY(0);} }
```

> `.controls-tools` 需 `position: relative`(`:205` 现无定位)以让 `.hints-tip` 绝对定位锚定;落地时补一行 `position: relative`。

### H.3 测试:RTL(hints-toggle harness)——首次点开 → tooltip 文案出现 + `localStorage['rummycube:hintsTipSeen']==='1'`;预置 flag → 点开**不**出现 tooltip;`Got it` → 移除(见 §测试)。

---

## 测试计划(全量 jest 保持全绿;新增分层如下)

### 纯 jest(无 React)

| 文件(建议) | 覆盖 |
|---|---|
| `src/tests/joker-swap-target.test.js` | `jokerSwapTarget`:① 值匹配的已结算 joker 格 + 手牌 → `{ok,jokerId,representedValue}`;② 值不匹配 → `{ok:false}`;③ 落点是 tmp 牌/非 joker/空格 → false;④ 拖的是 joker 本身 → false;⑤ joker 不在合法序列 → false;⑥ 拖的是 board 牌(非手牌)→ false;⑦ cell.gridId==='h' → false。构造 `tilePositions` 直接喂(借 `retrieve-joker.test.js` 的 red4/Joker/red6 + red5 布局) |
| `src/tests/resolve-drop-dispatch.test.js` | `resolveDropDispatch` 描述符:① N==1 落 joker 格 → `{move:'retrieveJoker'}`;② board 占用 span → `{move:'insertTilesWithPush'}` + ordered 实参;③ board 空靶 → `{move:'moveTiles'}`;④ 越界(T+N>32)→ 走吸附 moveTiles(不 push);⑤ 满行无处挤 → `{reject:true}`;⑥ hand 网格占用靶 → moveTiles(不 push);⑦ `allowJokerSwap:false` → 不取回 |
| `src/tests/seat-connection.test.js` | `seatConnected`:权威 false→断线、权威 true→在线、`connected[seat]===undefined`→回退 meta、`connected` 非数组→回退 meta、meta `undefined`→在线 |

### reducer(boardgame.io `Client` + `Local()`,沿用 `retrieve-joker.test.js` harness)

| 文件 | 覆盖 |
|---|---|
| `src/tests/retrieve-joker.test.js`(**改造**) | 两实参 `retrieveJoker(joker, tile)`:成功换(joker 回手位、手牌占板位、不结束回合)、值不匹配拒、非当前玩家拒、换后破坏(blue5)no-op。删「缺第二张」用例 |
| `src/tests/move-tiles-propagate.test.js`(新) | WS-C:把已结算 board 牌(`tmp:false`)moveTiles 到 hand → 触发 `insertTile` 的 `else`/INVALID_MOVE → **`G` 不变**(`tilePositions` `toEqual` before)且 **`gameStateStack.length` 不增**(现状会增=幽灵 undo,改后不增);另一例:多张落到占用格(isOverlap)被拒 → 同样 G 不变;**既有合法 moveTiles 仍成功**(回归) |

> 既有 `insert-tiles-with-push.test.js` 须在 `boardRowTiles` 复用后仍绿(WS-D 等价替换)。

### RTL(coach-card harness:mock `@dnd-kit/core` + `GridContainer` + `sfx` + `effects` + `ChatPanel`,驱动 `onDragStart/onDragEnd/onCellTap`;或 tap-to-place 的真 client harness)

| 文件 | 覆盖 |
|---|---|
| `src/tests/board-joker-swap-dispatch.test.js`(新,mock-dnd harness) | 拖**匹配**手牌到 joker 格(`over:'b:1:0'`)→ `moves.retrieveJoker(jokerId, draggedId)` 调用一次、`moveTiles`/`insertTilesWithPush` 未调、`play('place')`;拖**不匹配**手牌到同格 → 走 `insertTilesWithPush`(挤开 joker),`retrieveJoker` 未调;N>1 多选拖到 joker → 不取回 |
| `src/tests/player-avatar-connected.test.js`(新,coach-card harness 渲染真 Board/TableSeats) | `G.connected=[true,false]` → 对家(seat1)出 `.avatar.offline` + 🔌;`G.connected` 缺省、`matchData[1].isConnected:false` → 回退仍显示;两者皆在线 → 无徽标 |
| `src/tests/keyboard-tap-to-place.test.js`(新,tap-to-place 真 client harness) | 聚焦手牌 + `keyDown Enter` → 牌落 board、`gameStateStack` 增 1、`play('place')`、Undo 启用;非你回合 → 无 move;聚焦 board 牌按 Enter → no-op;聊天 input 聚焦时 Enter → 不落子(editable 守卫) |
| `src/tests/hints-tip.test.js`(新,hints-toggle harness) | 首次点 💡 → tooltip 现 + flag 写;预置 `rummycube:hintsTipSeen='1'` → 点开不现;`Got it` → 移除 |

### CSS 源断言(`board-layout-css.test.js` 同风格)

- `src/tests/board-visual-ws-f.test.js`(新):`.primary-action:focus-visible`/`.secondary-action:focus-visible` 含 `#0b1f3a`+`#8fc7ff`;`.rack-tools` 微调块在 `@media (max-width: 820px)`;`.timeout-toast` 含 `white-space: normal` + `max-width`;`.board-container` 背景为 `var(--felt)`;`.hints-tip` 进入动画在 `prefers-reduced-motion: no-preference` 内。

### 红线复验(收尾)

- `npx jest` 全绿(基线 65/352 → 预计 +7 suites 左右)。
- `node --check src/server.js`(显式 `.js`);本地 `node src/server.js` 能起。
- `npm run build` 产物无新增 `console.log`(`grep` 实测)。
- 应用内新增文案均英文(WS-H tooltip、WS-F 无新文案)。

---

## 任务分解(有序;串行热点 vs 可并行)

> **串行热点(同文件互相打架,必须排队、单 PR 内顺序提交):** `Board.jsx`(WS-B 分支 → WS-D 收口 → WS-G 接线 → WS-H 状态)、`moves.js`(WS-B 签名 / WS-C 传播 / WS-D 复用)、`board.css`(WS-F 多块 + WS-H `.hints-tip`)。
> **可并行(纯 helper / 叶子组件 / 新文件,无共享状态):** `jokerSwapTarget`、`resolveDropDispatch`、`seatConnected`、`useTilePlacementHotkeys`、`PlayerAvatar`/`TableSeats` 接线、各自的纯单测。

**阶段 0 — 并行纯件(无依赖,先落 + 单测自证):**
- T0a `dndUtil.js`:`jokerSwapTarget`(+ `BOARD_GRID_ID` import)→ `joker-swap-target.test.js`。
- T0b `seats/seatConnection.js`:`seatConnected` → `seat-connection.test.js`。
- T0c `components/useTilePlacementHotkeys.js` → 形态参考 `keyboard-undo-redo.test.js`(可先建文件)。
- *(这三件互不依赖,可三路并行。)*

**阶段 1 — moves.js(串行,B→C→D 顺序,单文件):**
1. T1 WS-B 服务端:常量 1 + `retrieveJoker` 单张正文 + 改 `retrieve-joker.test.js`(reducer)。
2. T2 WS-C `moveTiles` 传播 + `insertTile` 空值守卫 + `move-tiles-propagate.test.js`。
3. T3 WS-D-part `insertTilesWithPush` 复用 `boardRowTiles`(依赖 T0a 的 import 就绪)+ `boardRowTiles` 用 `BOARD_GRID_ID`(T0a 内一并改)。
   - *T1/T2/T3 改同一文件,串行;但与阶段 0、阶段 3 的纯件并行。*

**阶段 2 — `resolveDropDispatch`(依赖 T0a):**
- T4 `dndUtil.js` 加 `resolveDropDispatch`(用 `jokerSwapTarget`/`buildRowOccupancy`/`isRunFree`/`boardRowTiles`/`resolveDropSlot`/`insertWithPush`)+ `resolve-drop-dispatch.test.js`。

**阶段 3 — Board.jsx(串行,依赖 T0a/T4;B→D→G→H 顺序):**
1. T5 WS-B `onDragEnd` joker-swap 分支(用 `jokerSwapTarget`)+ `board-joker-swap-dispatch.test.js`。
   - *若想 WS-B 独立可发,可先用显式分支;T6 再吸入 `resolveDropDispatch`。*
2. T6 WS-D 收口:`dispatchDrop` + `onDragEnd`/`onCellTap` 改薄(用 T4)→ 既有 `board-insert-push-dispatch.test.js`/`tap-to-place.test.js` 回归绿。
3. T7 WS-G `useTilePlacementHotkeys` + `firstFreeBoardCell` + `placeFocusedHandTile`(复用 `dispatchDrop`)+ `keyboard-tap-to-place.test.js`。
4. T8 WS-H `hintsTipSeen`/`showHintsTip`/`toggleHints` 改 + 渲染 `.hints-tip` + `hints-tip.test.js`。

**阶段 4 — 叶子接线(依赖 T0b,可与阶段 3 并行):**
- T9 WS-E `PlayerAvatar`/`TableSeats`/Board selfAvatar+tableSeats 接 `seatConnected(G.connected,…)` + `player-avatar-connected.test.js`。

**阶段 5 — CSS(串行单文件 `board.css`;WS-H 的 `.hints-tip` 需 T8 类名定稿):**
- T10 WS-F 四块(focus-visible / rack-tools 断点 / timeout-toast / felt 去缝)+ T8 的 `.hints-tip` + `.controls-tools{position:relative}` + `board-visual-ws-f.test.js`。

**阶段 6 — 收尾:** 全量 `jest` + `node --check src/server.js` + `npm run build`(无新 `console.log`)+ 真机复验 WS-F 观感、WS-B 拖拽手感、WS-G 键盘可达。

> **关键路径:** T0a → T4 → T5/T6 → T7(Board.jsx 串行段最长)。WS-A(combo,游戏设计)与本路全并行。T9(WS-E)、阶段 0 纯件、WS-A 可全程并行压缩墙钟。

---

## 风险与不变量复核

**必须保持(逐条对应 spec §4):**
1. **服务器权威/反作弊不退化。** `retrieveJoker` 仍 `playerID!==ctx.currentPlayer→INVALID_MOVE`(`moves.js:378`);非破坏性——换后 `!isBoardValid→INVALID_MOVE`(immer 丢弃整张草稿,含两处 swap 写入)。`moveTiles`/`insertTilesWithPush` 仍仅当前玩家、当前回合。客户端 `jokerSwapTarget`/`resolveDropDispatch` 只读 `G.tilePositions`、**从不写**,仅决定派发哪个 move——服务端是唯一权威。
2. **合法性裁定时机不变。** joker 换、挤位、摆放仍是几何操作;run/set 合法性仍由 `isBoardValid`/提交时 `isMoveValid`/`isFirstMoveValid` 裁定。`jokerSwapTarget` 复算代表值用的是与服务端**同一组**纯函数(`extractSeqs`/`freezeSeqJokers`/`isSequenceValid`),客户端与服务端判定一致;万一漂移,服务端 `INVALID_MOVE` 兜底(no-op),客户端无破坏。
3. **门控/无障碍。** WS-H 进入动画、WS-F toast 动画一律 `@media (prefers-reduced-motion: no-preference)`;**不**在 JS 侧读 `matchMedia`(jsdom 无)。WS-F 焦点环 + WS-G 键盘路径**提升**可达性(WCAG 焦点可见 + 键盘可操作)。
4. **应用内英文**(WS-H tooltip 为钦定英文句);**无新依赖**(全用 @dnd-kit 6.3.1 / lodash / 现有纯件);**`node src/server.js` 可起**(`dndUtil.js` 新增的 `moveValidation`/`util`/`insertPush` import 均 `.js`、无环、无 JSX——已实测);**构建无新 `console.log`**;**`timePerTurn` 毫秒**(测试 setup 直接给毫秒)。
5. **既有能力不回归。** 长按整组、挤位、tap-to-place、键盘 Undo/Redo、断线/同步、超时公告、Hints 开关、主/次按钮、Exit、give-up 两次点击全保留;WS-D 是**等价重构**,以既有 T3/T4 测试回归绿为验收门。

**实现期重点盯防(rubber-duck 优先压):**
- **R1(高)joker-swap 优先级。** 必须早于挤位分流——joker 格被占,漏前置会被 `insertTilesWithPush` 把 joker 挤开而非取回。`board-joker-swap-dispatch.test.js` 的「匹配 → retrieveJoker、不匹配 → insertTilesWithPush」两路是这条的回归锁。
- **R2(中)`representedValue` 客户端/服务端一致。** 都走 `extractSeqs→freezeSeqJokers→getTileValue`;但 `extractSeqs` 依赖 joker 在**连续**board 段内。若 joker 与邻牌间有空格(断序),`find(seq…)`/`isSequenceValid` 失败 → helper `{ok:false}` → 不触发取回(安全降级)。
- **R3(中)WS-C 草稿回滚范围。** `moveTiles:80` 的 `gameStateStack.push` 在任何 `insertTile` 之前;返回 `INVALID_MOVE` 必须让该 push 一并回滚(immer 丢整张草稿)——`move-tiles-propagate.test.js` 断言 `gameStateStack.length` 不增即锁死「幽灵 undo」。
- **R4(中)WS-D 行参数。** `moveTiles` 行用 `result.row`(`resolveDropSlot` 回填),勿用裸 `row`(等值但 `result.row` 更稳);`selection` 作第 5 实参须含 `primaryId`(`onDragStart` 已保证单拖时 `selectedTiles=[id]`)。
- **R5(低)WS-G 焦点依赖。** 依赖 dnd-kit 6.3.1 `attributes.tabIndex:0` 使手牌可聚焦(实测在);若未来升级 dnd-kit 改了该行为,键盘路径需自补 `tabIndex`。`keyboard-tap-to-place.test.js` 用 `el.focus()` 直接验,不依赖该实现细节。
- **R6(低)WS-F 像素。** jsdom 测不了观感;rack-tools 不与 banner/座位重叠、felt 去缝、toast 不截断**必须真机复验**,源断言只锁规则存在。
- **R7(低)`deactivateTileVariant` import。** WS-B 删两张同色校验后,若 `moves.js` 再无他用,`:19` 的 import 变 unused——落地 `grep` 核实后一并删,避免 lint/构建告警(实测当前仅 `retrieveJoker` 用)。

---

*— Frontend Developer agent,2026-06-25。本报告为 plan,不含任何代码改动;签名/行号实测,正文草图供 implementer 落地。*
