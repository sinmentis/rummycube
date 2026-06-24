# RummyCube · 第二轮(退出/反确认/布局 + 长按整组 + 自动吸附挤位)· 前端实现评审(report · frontend)

**评审人:** Frontend Developer agent · **日期:** 2026-06-24
**输入:** `docs/optimization/2026-06-24-round2-spec.md`(已评审 spec,6 个工作项 WS-1…WS-6)
**方法:** 逐行核对 `Board.jsx` / `GridContainer.jsx` / `GridSlot.jsx` / `Tile.jsx` / `moves.js` / `Game.js` / `dndUtil.js` / `boardUtil.js` / `moveValidation.js` / `constants.js` / `Match.jsx` / `App.jsx` / `index.jsx` / `GameOverModal.jsx` / `board.css` / `chat.css`,以及测试基线(`npx jest` → **55 suites / 281 tests 全绿**,7.2s)。
**本报告不改任何代码。** 所有文件名/行号均已实测。

---

## 0. 基线与红线核验(已实测)

| 项 | 结果 |
|---|---|
| `npx jest` | 55 suites / **281 passed**(基线全绿) |
| 服务端导入图无 JSX | ✅ `Game.js`/`moves.js`/`moveValidation.js`/`util.js`/`orderTiles.js` 均不 import `.jsx`/`components/`(`grep` 实测);新 `insertPush.js`、`contiguousGroup` 必须 `.js`、显式 `.js` 后缀 |
| `timePerTurn` = 毫秒 | ✅ `Game.js:36` `(setupData?…:10) * 1000`;reducer 测试 setup 里**直接给毫秒、勿再 ×1000**(见 `last-play.test.js:21` `timePerTurn:60`) |
| jsdom 无 `matchMedia` | ✅ `setupTests.js` 不 polyfill;canonical 守卫是 `effects.js:4-8` `reduced()`(`typeof window!=='undefined' && window.matchMedia && …`)。Board 已 `import * as fx`,JS 侧用 `fx.reduced()` 即可 |
| 无新依赖 | @dnd-kit/core 6.3.1、react-router-dom 6.30、lodash 已在;本轮全部可用现有依赖实现 |

---

## 1. 架构事实核对(对照 spec 的「已核实事实」)

**全部确认,另有 3 处需要修正/补强,直接影响实现路径:**

| spec 断言 | 核对 | 备注 |
|---|---|---|
| `tilePositions: tileId→{id,col,row,gridId,playerID,tmp?}` | ✅ `Game.js:22-28`、`moves.js:114` | board 牌 `playerID:null`、`tmp:true/false`;hand 牌 `playerID` 为座位字符串 |
| `BOARD_GRID_ID='b'`/`BOARD_ROWS=9`/`BOARD_COLS=32`/`HAND_GRID_ID='h'`/`HAND_COLS=22` | ✅ `constants.js:8-10,5,3` | |
| `makeSlotId='gridId:col:row'`(col 在前) | ✅ `dndUtil.js:3-10` | `parseSlotId` 同序 |
| 连续占位=一组、空一格断组 | ✅ `extractSeqs` `moveValidation.js:25-66` | 列升序扫描,`col===cols[i-1]+1` 续组 |
| `resolveDropSlot` 纯、同行空位吸附、多张需连续空 run、从不位移 | ✅ `dndUtil.js:62-104` | **maxCols 是「排他计数」=32**(`<maxCols`,`dndUtil.js:67,84`) |
| `moveTiles`/`insertTile`/`isOverlap` 碰撞即 `INVALID_MOVE` | ✅ `moves.js:61-128` | |
| `DndContext` + Mouse/Touch sensor、均 `{distance:6}`、无 delay/Pointer/Keyboard sensor | ✅ `Board.jsx:111-114` | |
| 每 tile `useDraggable({id:tile})`,div 带 `{...listeners}{...attributes} onClick` + `touchAction:'none'` | ✅ `Tile.jsx:89,100-102` | |
| `onDragEnd` 走 `parseSlotId→buildRowOccupancy→resolveDropSlot→moveTiles` | ✅ `Board.jsx:166-191` | |
| `onCellTap` 只挂空格(`GridSlot.jsx:44-47`) | ✅ | 占位格渲染 Tile、无 onClick→tap;**故 tap 只能落空格**(WS-6 tap 分流见 §2.4) |
| `handleLongPress` 是死代码 | ✅ **已坐实** | `Board.jsx:457,478` 透传给 `GridContainer`,但 `GridContainer` 的解构(`GridContainer.jsx:23-38`)**根本没有 `handleLongPress`/`onLongPressMouseUp`**,`GridSlot` 也只把 `handleTileSelection` 给 `Tile`(`GridSlot.jsx:34`)。`boardUtil.js:114-149` 只向右走、按 `isSequenceValid` 停 |
| 多拖管线已就绪(`state.selectedTiles` 驱动) | ✅ `onDragStart` `Board.jsx:160-165`、`DragOverlay` `Board.jsx:645-653`(整组渲染)、`onDragEnd` 传 `selectedTiles` 给 `moveTiles` | |

**⚠ 修正点(实现必须按此走):**

1. **顶栏不在 `Board.jsx`,在 `App.jsx`。** spec §WS-1「涉及:Board.jsx(顶栏渲染)」与代码不符:`How to play`/`Mute` 实际在 `App.jsx:35-39` 的 `.navbar`(全局,在 `BrowserRouter` 内,`index.jsx:17-19`)。Board 内并无 How-to-play/Mute 栏。**这决定 Exit 按钮的放置与 useNavigate 的安全位置(见 §4.1,关键陷阱)。**
2. **`useNavigate` 直接加到 `Board.jsx` 会打挂 8 个测试。** 8 个测试直接 `render(<Board/>)` **且不包 Router、不 mock react-router**(`coach-card`/`primary-actions`/`tap-to-place`/`hints-toggle`/`icon-button`/`board-waiting-overlay`/`timeout-announcement`/`board-reconnect-cue`)。现状之所以不挂,是因为 `GameOverModal`(唯一用 `useNavigate` 的子件,`GameOverModal.jsx:13`)被 `lazy` 且仅 `ctx.gameover` 时渲染,会触发它的测试都**显式 mock 掉 GameOverModal**(`timeout-announcement.test.js:15-18`)。
3. **`insertWithPush` 的 `maxCol` 是「闭区间末列=31」,而 `resolveDropSlot` 的 `maxCols` 是「排他计数=32」。** 两者约定不同,客户端调用 `insertWithPush` 必须传 `BOARD_COLS-1`(=31),否则差一越界(见 §2.5)。

---

## 2. WS-6 深挖(自动吸附 + 插入挤位,最高风险)

### 2.1 纯函数 `insertWithPush`(新文件 `src/rummikub/insertPush.js`)

```js
// src/rummikub/insertPush.js —— 纯、无依赖、可被服务端(.js)与客户端共用
// rowTiles: 目标行现有占位 [{tileId, col}](不含被拖入的 selection)
// T: 落点列(指针所在列);N: 拖入牌数;maxCol: 闭区间末列 = BOARD_COLS-1 = 31
// 返回 {shifts:{tileId:newCol}, newCols:number[]} | null(两向都放不下)
export function insertWithPush(rowTiles, T, N, maxCol) {
    // 新牌恒落 [T..T+N-1];该区间本身越界 → 直接拒绝(两向 ripple 都救不了)
    if (T < 0 || T + N - 1 > maxCol) return null;
    const asc = [...rowTiles].sort((a, b) => a.col - b.col);

    // 快路径:目标 [T..T+N-1] 全空 → 纯吸附(等同现状,服务端幂等兜底)
    const occ = new Set(asc.map(t => t.col));
    let free = true;
    for (let c = T; c < T + N; c++) if (occ.has(c)) { free = false; break; }
    if (free) return {shifts: {}, newCols: cols(T, N)};

    return tryRight(asc, T, N, maxCol) || tryLeft(asc, T, N, maxCol);
}

function cols(T, N) { return Array.from({length: N}, (_, i) => T + i); }

// 右向 ripple(主):新牌占 [T..T+N-1],与其冲突的连续段整体右移,遇空格吸收即停
function tryRight(asc, T, N, maxCol) {
    const shifts = {};
    let cursor = T + N;                    // 第一张被推牌的目标列
    for (const {tileId, col} of asc) {
        if (col < T) continue;             // 落点左侧:不动
        if (col < cursor) {                // 与新牌或前一张被推牌冲突
            if (cursor > maxCol) return null;   // 右侧到边 → 右向失败
            shifts[tileId] = cursor; cursor += 1;
        } else {
            break;                         // 右侧有空格吸收 → 停止级联
        }
    }
    return {shifts, newCols: cols(T, N)};
}

// 左向 ripple(右向失败时的镜像回退)
function tryLeft(asc, T, N, maxCol) {
    const shifts = {};
    let cursor = T - 1;
    for (let i = asc.length - 1; i >= 0; i--) {   // 按 col 降序
        const {tileId, col} = asc[i];
        if (col > T + N - 1) continue;     // 落点右侧:不动
        if (col > cursor) {
            if (cursor < 0) return null;        // 左侧到边 → 左向失败
            shifts[tileId] = cursor; cursor -= 1;
        } else {
            break;                         // 左侧有空格吸收 → 停止级联
        }
    }
    return {shifts, newCols: cols(T, N)};
}
```

**与 spec 伪代码逐条对齐**(spec §WS-6 line 81-101);`null`=两向都失败(`buzz`,不落子,不改 G)。

**Rubber-duck 三条 trace(均与代码一致):**

- **级联右推** `1 2 3 _ 7 7 7` 放 `4 5` 于 T=3、N=2、maxCol=31:目标 `[3,4]` 中 col4 被占 → 非全空。tryRight:cursor=5;`7a@4`(4<5)→5,cursor=6;`7b@5`(5<6)→6,cursor=7;`7c@6`(6<7)→7。`{shifts:{7a:5,7b:6,7c:7}, newCols:[3,4]}` → 行变 `1 2 3 4 5 7 7 7`(三个 7 整体右移 1)。✅ 与 spec line 76 期望一致。
- **右溢出转左**(maxCol=7 缩例,`a@5 b@6 c@7` 放 1 张于 T=6):tryRight cursor=7;`b@6`(6<7)→7,cursor=8;`c@7`(7<8)→ cursor 8>7 → **右向 null**。tryLeft cursor=5;降序 `c@7`(>6,跳)、`b@6`(6>5)→5,cursor=4、`a@5`(5>4)→4。`{shifts:{b:5,a:4}, newCols:[6]}` → `4 5 6 7` 连续。✅
- **左侧空格吸收停止级联**(maxCol=5,`a@2 _ b@4 c@5` 放 1 张于 T=4):tryRight cursor=5;`b@4`→5,cursor=6;`c@5`→ 6>5 **右向 null**。tryLeft cursor=3;降序 `c@5`(>4,跳)、`b@4`(4>3)→3,cursor=2、`a@2`(2>2 假)→ **break**。`{shifts:{b:3}, newCols:[4]}` → a 留 2、b→3、新@4、c 留 5。✅ 空格被一次性吸收,a 不动。

**输出列两两互异(可证):** 右向被推牌占 `[T+N, cursor-1]`、未推牌 `col ≥ cursor > 被推牌上界`、新牌占 `[T, T+N-1] < T+N`;被排除的 selection 旧列空出。左向镜像同理。**故写回时不会双占同列**——这是「一次 move 原子完成、中途不触发 `isOverlap` 误判」的算法保证。

### 2.2 服务端 move `insertTilesWithPush`(`moves.js`,镜像 `moveTiles` 签名)

```js
// moves.js —— 与 moveTiles({G,ctx,playerID}, col,row,destGridId,tileIdObj,selectedTiles) 同形
import {insertWithPush} from "./insertPush.js";   // 显式 .js,服务端可启动

function insertTilesWithPush({G, ctx, playerID}, col, row, destGridId, tileIdObj, selectedTiles) {
    const T = col;
    // 反作弊:仅当前玩家、仅 board 行启用挤位(hand 行继续走 moveTiles)
    if (playerID !== ctx.currentPlayer) return INVALID_MOVE;
    if (destGridId !== BOARD_GRID_ID) return INVALID_MOVE;

    const tileId = tileIdObj.id;
    const selection = (selectedTiles.length && selectedTiles.indexOf(tileId) !== -1)
        ? orderTilesBySource(selectedTiles, G.tilePositions)   // 阅读序,与 moveTiles 一致
        : [tileId];
    const N = selection.length;
    const sel = new Set(selection.map(String));

    // 目标行现有占位(排除被拖入的 selection)
    const rowTiles = [];
    for (const id in G.tilePositions) {
        const p = G.tilePositions[id];
        if (!p || p.gridId !== BOARD_GRID_ID || p.row !== row) continue;
        if (sel.has(String(id))) continue;
        rowTiles.push({tileId: id, col: p.col});
    }

    const plan = insertWithPush(rowTiles, T, N, BOARD_COLS - 1);
    if (!plan) return INVALID_MOVE;       // immer 草稿整体丢弃 → G 不变(non-destructive 拒绝)

    // 仅在确认可行后入栈一条 → 一次撤销还原整组挤位(镜像 moveTiles:79 的语义)
    if (ctx.currentPlayer === playerID) G.gameStateStack.push(getGameState(G));

    // ① 被推 board 牌:只改 col,保留 id/row/gridId/tmp/playerID
    for (const id in plan.shifts) {
        const p = G.tilePositions[id];
        G.tilePositions[id] = {...p, col: plan.shifts[id]};
    }
    // ② 新牌落 newCols,按来源套 moveTiles 的 flags(不调 isOverlap)
    for (let i = 0; i < selection.length; i++) {
        const id = selection[i];
        const p = G.tilePositions[id];
        if (!p) return INVALID_MOVE;
        let flags;
        if (p.gridId === HAND_GRID_ID) {            // hand→board
            if (ctx.phase === 'playersJoin') return INVALID_MOVE;   // 同 moves.js:100
            flags = {tmp: true, playerID: null};
        } else if (p.gridId === BOARD_GRID_ID) {    // board→board(同回合可重排已提交牌与 tmp 牌)
            flags = {tmp: p.tmp, playerID: p.playerID};
        } else {
            return INVALID_MOVE;
        }
        G.tilePositions[id] = {id: p.id, col: plan.newCols[i], row, gridId: BOARD_GRID_ID, ...flags};
    }
}
```

**关键点 & 与现有移动语义一致性:**
- **原子性**:被推牌只改 `col`、新牌直接落最终列——全程不调 `isOverlap`,因此中途不会误判(`insertWithPush` 已保证终态列互异);单次 reducer 调用内完成,`INVALID_MOVE` → immer 丢弃整张草稿 → `G` 原封不动(与 `submitMeld` 的 no-op 契约一致,`moves.js:371-374`)。
- **栈与撤销**:只 push 一条 `getGameState(G)`(快照 `original(G.tilePositions/prevTilePositions)`,`util.js:459`),`undo`(`moves.js:195-216`)按现有逻辑还原 board 牌+本家 hand 牌 → 一次撤销把「被推 + 新落」全部回退。Redo 同理。
- **playerView 不泄露**:只写 board(公共)行与被插入的 selection;hand→board 后变公共 tmp 牌,无对手手牌暴露。
- **几何不校验数字**:不调用任何 `isSequenceValid`/`isBoardValid`;合法性仍由提交时(`submitMeld`/`endTurn→validatePlayerMove`)裁定(spec 不变量 §4)。
- **manipulationScore 影响**:被推牌 `col` 变化会被 `applyValidMove` 的 `rearranged` 计数(`moves.js:264-268`,对比 `prevTilePositions`)计入——这正是「重排奖励」,期望行为,无需特殊处理。

### 2.3 `Game.js` 注册

`moves.js` 末尾 `export` 增加 `insertTilesWithPush`(`moves.js:497-515` 列表内)。`Game.js`:
- `import` 行(`Game.js:3`)追加 `insertTilesWithPush`;
- 顶层 `moves`(`Game.js:72-88`)注册 `insertTilesWithPush`;
- **`playersJoin.phase.moves`(`Game.js:55-67`)不注册**——挤位是对局期玩法,join 阶段排序用 `moveTiles` 即可(且 move 内已 `ctx.phase==='playersJoin'` 拒绝 hand→board)。

### 2.4 客户端落点分流(`Board.jsx`)

**先用纯函数在客户端判定「吸附 vs 挤位 vs 拒绝」(与现状 `resolveDropSlot` 同构:客户端算、服务端再权威校验),给即时 `buzz` 反馈、并保持 server 权威。**

`onDragEnd`(替换 `Board.jsx:166-191`):

```js
const onDragEnd = useCallback((e) => {
    setActiveTile(null); setIsDragActive(false);
    if (!e.over) return;
    const {gridId, col: T, row} = parseSlotId(String(e.over.id));
    const id = e.active.id;
    const selectedTiles = stateRef.current.selectedTiles;
    const selection = selectedTiles.length ? selectedTiles : [id];
    const N = selection.length;
    const isOccupied = buildRowOccupancy(gRef.current.tilePositions, gridId, selection, playerID);
    const maxCols = gridId === BOARD_GRID_ID ? BOARD_COLS : HAND_COLS;

    // WS-6:仅 board,且目标 run [T..T+N-1] 命中占位 → 挤位
    if (gridId === BOARD_GRID_ID && !isRunFree(isOccupied, T, N, row, maxCols)) {
        const rowTiles = boardRowTiles(gRef.current.tilePositions, row, selection);
        const plan = insertWithPush(rowTiles, T, N, BOARD_COLS - 1);   // 注意:闭区间末列
        if (!plan) { buzz(); setState({selectedTiles: [], lastSelectedTileId: null}); return; }
        const ordered = orderTilesBySource(selection, gRef.current.tilePositions);
        moves.insertTilesWithPush(T, row, gridId, {id}, ordered);
        markSyncing(); play('place');
        setState({selectedTiles: [], lastSelectedTileId: null});
        return;
    }
    // 全空目标 / hand 行:沿用现状吸附
    const result = resolveDropSlot({gridId, col: T, row}, isOccupied, N, maxCols);
    if (!result.ok) { buzz(); setState({selectedTiles: [], lastSelectedTileId: null}); return; }
    moves.moveTiles(result.cols[0], row, gridId, {id}, selectedTiles);
    markSyncing(); play('place');
    setState({selectedTiles: [], lastSelectedTileId: null});
}, [moves, playerID, markSyncing]);
```

两个**新纯 helper**(放 `dndUtil.js`,与 `buildRowOccupancy`/`resolveDropSlot` 同窝):
```js
export function isRunFree(isOccupied, T, N, row, maxCols) {
    if (T < 0 || T + N > maxCols) return false;
    for (let c = T; c < T + N; c++) if (isOccupied(c, row)) return false;
    return true;
}
export function boardRowTiles(tilePositions, row, excludeIds) {     // [{tileId, col}]
    const ex = new Set((excludeIds || []).map(String));
    const out = [];
    for (const id in tilePositions) {
        const p = tilePositions[id];
        if (!p || p.gridId !== 'b' || p.row !== row || ex.has(String(id))) continue;
        out.push({tileId: id, col: p.col});
    }
    return out;
}
```

`onCellTap`(`Board.jsx:226-242`)做**同样的 board 分流**:tap 只落空格,但空格右侧可能占位(如 tap 空 col3、col4 占位、N=2),故空格 tap 也要 `isRunFree` 判定 → 占则 `insertTilesWithPush`、空则 `moveTiles`。hand 行不变。

`Board.jsx:6` 的 import 追加 `isRunFree, boardRowTiles`;新增 `import {insertWithPush} from "../insertPush"`(`.jsx` 内可省后缀,Vite 解析)。

### 2.5 ⚠ 差一陷阱(务必写进任务卡)
- `insertWithPush(…, maxCol)` 的 `maxCol` = **闭区间末列 31** = `BOARD_COLS-1`。
- `resolveDropSlot(…, maxCols)`/`isRunFree(…, maxCols)` 的 `maxCols` = **排他计数 32** = `BOARD_COLS`(沿用 `dndUtil.js:67,84` 语义)。
- 客户端与服务端调 `insertWithPush` 一律传 `BOARD_COLS - 1`。单测要专门覆盖最右列边界(T=31、T+N-1=31、T+N>32 转左/拒绝)。

---

## 3. WS-5 长按拿整组

### 3.1 纯函数 `contiguousGroup`(`boardUtil.js`,替换死掉的 `handleLongPress`)

```js
// boardUtil.js —— 纯;按下牌所在 grid/row 上、含按下牌的整段连续 run(列升序=阅读序)
// 手牌额外按 playerID 隔离;board 牌 playerID:null 不隔离
export function contiguousGroup(tilePositions, pressedTileId) {
    const p = tilePositions[pressedTileId];
    if (!p) return [pressedTileId];
    const {gridId, row, col, playerID} = p;
    const byCol = {};
    for (const id in tilePositions) {
        const q = tilePositions[id];
        if (!q || q.gridId !== gridId || q.row !== row) continue;
        if (gridId === HAND_GRID_ID && String(q.playerID) !== String(playerID)) continue;
        byCol[q.col] = id;
    }
    const group = [pressedTileId];
    for (let c = col - 1; byCol[c] != null; c--) group.unshift(byCol[c]);
    for (let c = col + 1; byCol[c] != null; c++) group.push(byCol[c]);
    return group;
}
```

退化与隔离:无邻居 → `[pressedTileId]`;空格断组(`byCol[c]` 缺失即停);手牌跨 `playerID` 不串(board 因 `playerID:null` 不隔离,正好整桌可成组)。**不复用 `boardUtil.js:114-149` 的 `handleLongPress`**(它只向右、按 `isSequenceValid` 停,语义错)与 `getNextTile`(仅被 `handleLongPress` 调,删除 `handleLongPress` 后变孤儿,一并清掉)。

### 3.2 长按激活:Tile 本地 press-timer(替换死代码,推荐方案)

**为什么不复活 `handleLongPress`**:它向右逐张 `setTimeout` 自走+合法性停,与「整组一次性拿起」语义不符。改为 **Tile 叶子组件内的 press-timer**,触发后只填 `selectedTiles=contiguousGroup(...)`,随后交给现有 `distance:6` 拖拽管线带走整组。

**与 dnd-kit 共存的关键(已核对 sensor 类型):** 本仓用 **MouseSensor + TouchSensor**(`Board.jsx:111-114`),其 activator 是 `onMouseDown`/`onTouchStart`(经 `{...listeners}` 注入,`Tile.jsx:100`)。**故 press-timer 用 `onPointerDown/Move/Up/Cancel`**——pointer 事件与 mouse/touch 事件**键名不冲突**(React 不会用我们的 `onPointerDown` 覆盖 listeners 的 `onMouseDown`),`touchAction:'none'`(`Tile.jsx:102`)已就位。

Tile 新增(签名见 §5):
```js
// Tile.jsx 内
const pressTimer = useRef(null), startXY = useRef(null), firedRef = useRef(false);
const LONG_PRESS_MS = 200, MOVE_CANCEL_PX = 6;   // 与 dnd distance:6 对齐

const onPointerDown = (e) => {
    if (!canDnD) return;
    firedRef.current = false;
    startXY.current = {x: e.clientX, y: e.clientY};
    pressTimer.current = setTimeout(() => { firedRef.current = true; onLongPress?.(tile); }, LONG_PRESS_MS);
};
const onPointerMove = (e) => {                    // 移动超阈 → 让位给单张拖拽
    if (!pressTimer.current || !startXY.current) return;
    const dx = e.clientX - startXY.current.x, dy = e.clientY - startXY.current.y;
    if (dx*dx + dy*dy > MOVE_CANCEL_PX*MOVE_CANCEL_PX) { clearTimeout(pressTimer.current); pressTimer.current = null; }
};
const cancel = () => { clearTimeout(pressTimer.current); pressTimer.current = null; };  // up/cancel/leave
const onClick = (e) => {
    if (firedRef.current) { firedRef.current = false; return; }   // 长按已触发 → 抑制单选
    handleTileSelection(tile, e.shiftKey, e.ctrlKey || e.metaKey);
};
useEffect(() => () => clearTimeout(pressTimer.current), []);
```

**交互对账:**
- **短按(tap)**:down→(计时)→up 早于 200ms→`cancel` 清计时→`onClick` 走现有单选/toggle(`Tile.jsx:91-93`)。不变。
- **按住不动 ≥200ms**:计时触发→`onLongPress(tile)`→Board 设 `selectedTiles=contiguousGroup(...)`;随后 up 也会触发一次 `click`,被 `firedRef` 抑制(避免把整组又 toggle 回单张)。
- **按住后拖**:超 6px → `onPointerMove` 清计时(若 200ms 未到 → 单张拖);若先满 200ms 选中整组再拖 → `onDragStart`(`Board.jsx:160-165`)因 `selectedTiles` 已含按下牌而**保留整组**,`DragOverlay`(`Board.jsx:645-653`)整组渲染,`onDragEnd` 整组落子(§2.4)。
- **保险**:Board 的 `onDragStart` 额外清一次计时器(belt-and-suspenders),防计时在拖拽激活后才触发。

**Board 回调:**
```js
const onLongPressCb = useCallback((tileId) => {
    setState({selectedTiles: contiguousGroup(gRef.current.tilePositions, tileId), lastSelectedTileId: tileId});
}, []);
```

### 3.3 透传链路(把死接线接活)
`Board → GridContainer → GridSlot → Tile` 增 `onLongPress`(及可选 `longPressMs`):
- `GridContainer.jsx:23-38` 解构新增 `onLongPress`,并在 `GridSlot`(`:58-73`)透传;
- `GridSlot.jsx:7-21` 解构新增 `onLongPress`,占位格分支(`:24-37`)传给 `Tile`;
- 删除现有从未被解构的 `handleLongPress`/`onLongPressMouseUp` 透传(`Board.jsx:457-458,478-479`)与 `onLongPressMouseUp`/`longPressTimeoutId`(`Board.jsx:198,249-254`)、`handleLongPressCb`(`Board.jsx:211-213`),并清 `Board.jsx:22` 对 `handleLongPress` 的 import。
- **连带改测试**(传了 dummy 旧 prop 的):`playable-marker.test.js:31-32`、`turn-timer-render.test.js:36-37`、`droppable-cue.test.js:30-31`、`grid-memo.test.js:42-43`(去掉 `handleLongPress`/`onLongPressMouseUp`,可换 `onLongPress={()=>{}}`);`board-callback-stability.test.js` 注释提到 `handleLongPressCb`(只更注释,断言是通用 ref 模式、不挂)。

---

## 4. WS-1 / WS-2 / WS-3 / WS-4

### 4.1 WS-1 退出 + GameOver 回主页(含 Router 陷阱)

**Exit 按钮——推荐放 `App.jsx` 顶栏(`.navbar`),而非 Board(规避 §1 修正点 2 的 8 测试连锁):**
- `App.jsx` 恒在 `BrowserRouter` 内(`index.jsx:17`),`useNavigate` 安全;Board 直渲测试不受影响。
- 顶栏正是「How to play / Mute 一带」(spec 原意),语义自然(旁边已有 `<a href="/">RummyCube</a>`,但那是整页跳转;Exit 用 SPA `navigate('/')`)。
- 仅在对局路由显示:用 `useLocation()`,`pathname.startsWith('/match/')` 时渲染。抽成叶子件 `ExitButton.jsx`(内含 `useNavigate`+`useLocation`),便于 MemoryRouter 单测。
- **非破坏性**:座位凭证(`localStorage['rummycube:match:<id>']`,`Match.jsx:18,23`)**保留**→ 主页可重进重连;不发任何服务端「离开」move。
- **备选(若 owner 坚持放 Board)**:Board 内渲染 `ExitButton`,但须给 8 个 Board 测试统一包 `MemoryRouter` 或 mock `react-router-dom`。成本明显更高,**不推荐**。

**GameOver 回主页**(`GameOverModal.jsx`,已有 `useNavigate`,无 Router 风险):在 `Play Again` 旁加 `Back to home`:
```js
function onBackHome() {
    try { localStorage.removeItem(`rummycube:match:${matchId}`); } catch (e) {}  // 结算后不再自动重连
    navigate('/');
}
```
`matchId` 已是 prop(`GameOverModal.jsx:11`)。文案英文。

### 4.2 WS-2 Give up 两次点击(本地状态机,去 `window.confirm`)

替换 `onForfeitTurn`(`Board.jsx:320-325`):
```js
const GIVEUP_CONFIRM_MS = 3000;
const [giveUpArmed, setGiveUpArmed] = useState(false);
const giveUpTimer = useRef(null);
const disarm = useCallback(() => { clearTimeout(giveUpTimer.current); setGiveUpArmed(false); }, []);
const onForfeitTurn = useCallback(() => {
    if (giveUpArmed) { disarm(); setSubmitReason(''); moves.forfeitTurn(); return; }
    setGiveUpArmed(true);
    clearTimeout(giveUpTimer.current);
    giveUpTimer.current = setTimeout(() => setGiveUpArmed(false), GIVEUP_CONFIRM_MS);
}, [giveUpArmed, disarm, moves]);
// 切回合/gameover/卸载/提交成功 → 立即复位
useEffect(() => { disarm(); }, [ctx.currentPlayer, ctx.gameover, disarm]);
useEffect(() => () => clearTimeout(giveUpTimer.current), []);
```
按钮(`forfeitBut`,`Board.jsx:413-419`):`giveUpArmed ? 'Click again to confirm' : 'Give up turn'`,armed 加警示类 `is-arming`。`board.css` 警示样式;若带脉冲动画,用 `@media (prefers-reduced-motion: no-preference)` 门控(纯 CSS,无需 JS;如确需 JS 判定则 `fx.reduced()`)。文案英文。

### 4.3 WS-3 聊天 dock 留白槽(CSS)

**断点对齐**:聊天在 `@media (max-width:820px)` 折叠为 FAB(`chat.css:233`);故留白只在 **`@media (min-width:821px)`** 生效(常驻态)。聊天面板 `width:300px; max-width:42vw`(`chat.css:14-15`),`right:8px`(`chat.css:5`)。

**改法**:宽屏给棋盘容器右侧预留 = 聊天宽+间距:
```css
@media (min-width: 821px) {
    .board-container { padding-right: calc(300px + 16px); }   /* 聊天宽 + 间距,止于聊天左缘 */
}
```
- `.board-container` 现 `overflow:hidden`(`board.css:13-20`);其内 `.board`(`overflow:hidden`,`board.css:29-39`)→ `.ref`(`overflow:auto`,横向滚动区,`board.css:45-49`)。给 `.board-container` 加右 padding 会收窄内容盒,居中网格(`GridContainer` `margin:0 auto`)与 `.hand-buttons`(`max-width:94vw; margin auto`)整体左移、止于聊天左缘;`.ref` 的可滚宽度随之计入留白(满足 spec「横向滚动区计入留白」)。
- 仅常驻时生效;窄屏 FAB 折叠区不留白(避免「既折叠又留白」的中间带)。
- **jsdom 测不了像素**:加一条 DOM 断言「宽屏类存在」即可,主验真机(见 §6)。

### 4.4 WS-4 「Your turn」横幅移到头像右侧(CSS)

`.turn-banner`(`board.css:559-562`)现 `left:6px; bottom:calc(100% + 56px)`,压在 80px 头像(`.avatar` `board.css:439`,`.rack-self` `left:6px; bottom:calc(100%+2px)` `board.css:95-100`)上。改为头像右侧、垂直对齐头像中部:
```css
.turn-banner { left: 92px; bottom: calc(100% + 26px); }   /* 6 + 80 + ~6 间距 */
```
**移动端**:`@media (max-width:820px)` 头像缩到 46px(`board.css:913`),`left:92px` 会偏右 → 该断点内补 `.turn-banner { left: 58px; bottom: calc(100% + 14px); }`(6+46+~6)。`white-space:nowrap`(`board.css:575`)+ `z-index:7` 维持;长名「{name}'s turn」窄屏不溢出/不挡牌。`turnBannerLabel` 既有单测(`turn-banner.test.js`,纯 helper)不受 CSS 影响。

---

## 5. 组件/模块分解与 prop 接口

| 模块 | 类型 | 签名 / prop | 文件 |
|---|---|---|---|
| `insertWithPush(rowTiles,T,N,maxCol)` | 新纯函数 | → `{shifts,newCols}|null` | **新** `src/rummikub/insertPush.js` |
| `isRunFree(isOccupied,T,N,row,maxCols)` / `boardRowTiles(tilePositions,row,excludeIds)` | 新纯 helper | → bool / `[{tileId,col}]` | `dndUtil.js` |
| `insertTilesWithPush({G,ctx,playerID},col,row,destGridId,tileIdObj,selectedTiles)` | 新服务端 move | INVALID_MOVE/写回 | `moves.js` + `Game.js` 注册 |
| `contiguousGroup(tilePositions,pressedTileId)` | 新纯函数 | → `tileId[]` | `boardUtil.js`(删 `handleLongPress`/`getNextTile`) |
| `ExitButton` | 新叶子件 | 无 prop(内用 `useNavigate`/`useLocation`) | **新** `src/rummikub/components/ExitButton.jsx`,挂 `App.jsx` 顶栏 |
| `Tile` | 改 | 新增 `onLongPress(tileId)`、可选 `longPressMs`;内置 pointer press-timer + `firedRef` 抑制 click | `Tile.jsx` |
| `GridSlot` | 改 | 新增 `onLongPress` 透传给 `Tile` | `GridSlot.jsx` |
| `GridContainer` | 改 | 新增 `onLongPress` 解构+透传;移除未用的 `handleLongPress`/`onLongPressMouseUp` | `GridContainer.jsx` |
| `Board` | 改 | 落点分流(`onDragEnd`/`onCellTap`)、`onLongPressCb`、give-up 状态机、`GameOver` 不变;**不引入 `useNavigate`** | `Board.jsx` |
| `GameOverModal` | 改 | 加 `Back to home`(`navigate('/')`+清 localStorage 键) | `GameOverModal.jsx` |

可调参数(集中常量,默认值取自 spec §5):`GIVEUP_CONFIRM_MS=3000`、`LONG_PRESS_MS=200`、`MOVE_CANCEL_PX=6`、聊天留白 `300px+16px`、挤位右优先。

---

## 6. 测试计划

**A. 纯 jest(无 Router/DOM,最高价值)** — 仿 `resolve-drop-slot.test.js`(`(col)=>taken.includes(col)` 风格):
- `insertWithPush`:全空吸附(`shifts:{}`)、单层右推、**级联右推 `1 2 3 _ 7 7 7`+`4 5`@3**、右溢出转左、双向都满→`null`、N=1 插入、空格吸收停止级联、最右列边界(maxCol=31)、`T+N-1>maxCol`→`null`、左溢出→`null`。
- `contiguousGroup`(用 `buildTileObj(value,color,variant)` 造 id,`util.js:47`):左右扩展、空格断组、手牌跨 `playerID` 不串、board 不隔离、单张退化、按下牌缺失退化。
- `isRunFree`/`boardRowTiles`:边界与排除集。

**B. reducer 级(`boardgame.io/client` + `Local()`,仿 `forfeit-turn.test.js`/`last-play.test.js`)** — `setup` 直接给毫秒 `timePerTurn`:
- `insertTilesWithPush`:级联写入正确(被推牌新 col + 新牌 newCols + tmp)、**原子**(一次 move 后无中间态)、`INVALID_MOVE` 路径 G 不变(`_.cloneDeep` 比对,仿 `forfeit-turn.test.js` 第二例)、`undo` 一步还原整组、**anti-cheat**(非当前玩家发→`INVALID_MOVE` 且 currentPlayer 不变,镜像 `force-end-turn.test.js`/`forfeit-turn.test.js`)、`destGridId!=='b'`→`INVALID_MOVE`、hand→board 在 `playersJoin` 拒绝。

**C. RTL(沿用 `coach-card.test.js` harness:mock `GridContainer`/`sfx`/`effects`/`ChatPanel`,直渲 Board,`moves` 传 jest.fn)**:
- WS-2:第一次点不 `forfeitTurn`、文案/类切 `Click again to confirm`;armed 内第二次点触发 `moves.forfeitTurn`;`jest.advanceTimersByTime(3000)` 后复原且不 forfeit;切 `currentPlayer` 复位(fake timers)。
- WS-5:对一个 mock Tile 触发 `onLongPress` → 断言 `setState`/选区=整组;tap 仍单选;按住后 `firedRef` 抑制 click。**注**:`coach-card` harness mock 了 `GridContainer`,需用更轻的局部 harness 或直接对 `Tile` 做 RTL(`fireEvent.pointerDown`+fake timers)+ 对 `contiguousGroup` 纯测兜底。
- WS-1:`ExitButton` 包 `MemoryRouter`(`initialEntries:['/match/m1']` vs `['/']`)断言仅 match 路由显示、点击 `navigate('/')`(mock `useNavigate`);`GameOverModal` 包 `MemoryRouter` 断言 `Back to home` 清 `localStorage['rummycube:match:m1']` + navigate。

**D. 视觉(CSS 推理 + 部署真机)**:WS-3 留白(`min-width:821px`)、WS-4 横幅不压头像。jsdom 仅加「宽屏带留白类/横幅类存在」的 DOM 断言。

**E. 全量**:`npx jest` 保持 281+ 全绿;`npm run build` 通过且产物**无新增 `console.log`**(新代码勿留日志);`node src/server.js` 可启动(`insertPush.js` 纯 `.js`、`moves.js` 显式 `.js` import)。

---

## 7. 有序任务拆解(标注串行热点与可并行)

**串行热点(易冲突,需排队/同人连做):** `Board.jsx`(WS-1 备选/WS-2/WS-5/WS-6 都碰)、`board.css`(WS-2/WS-3/WS-4)、`moves.js`+`Game.js`(WS-6)。
**可并行(纯 helper + 叶子件,先做、解耦):** `insertPush.js`、`contiguousGroup`、`dndUtil` 新 helper、`ExitButton.jsx`、`GameOverModal.jsx`、各 CSS 块。

1. **[并行] T1 纯函数 `insertWithPush` + 单测**(`insertPush.js`)— TDD,WS-6 算法地基,先于服务端。
2. **[并行] T2 `dndUtil` 新 helper `isRunFree`/`boardRowTiles` + 单测**。
3. **T3 服务端 `insertTilesWithPush` + `Game.js` 注册 + reducer 测**(依赖 T1;`moves.js` 串行)。
4. **T4 客户端落点分流**(`Board.jsx` `onDragEnd`/`onCellTap`,依赖 T1/T2/T3;Board 串行段①)。
5. **[并行] T5 `contiguousGroup` + 单测**(`boardUtil.js`;同文件删 `handleLongPress`/`getNextTile`)。
6. **T6 长按 press-timer 透传**(`Tile.jsx`/`GridSlot.jsx`/`GridContainer.jsx` + `Board.jsx` `onLongPressCb`,依赖 T5;Board 串行段②;改 4 个传旧 prop 的测试)。
7. **[并行] T7 WS-1**:`ExitButton.jsx` + 挂 `App.jsx` 顶栏;`GameOverModal` `Back to home` + 清键 + 测(独立文件,完全解耦)。
8. **T8 WS-2 give-up 状态机**(`Board.jsx` 串行段③ + `board.css` armed 样式 + RTL)。
9. **[并行] T9 WS-3 留白 CSS**(`board.css` `min-width:821px`)+ **T10 WS-4 横幅 CSS**(`board.css` `.turn-banner` 桌面+移动块)——两者 `board.css` 不同选择器,可与 T8 协调顺序避冲突。
10. **T11 整支自验**:`npx jest` 全绿 + `npm run build`(查无新 `console.log`)+ `node src/server.js` 启动。

> Board.jsx 三段(T4/T6/T8)建议**同一 implementer 串行**或严格排序合并,避免 `onDragEnd`/`state`/按钮区互踩。

---

## 8. 风险与不变量复核(实施时逐条回归)

1. **maxCol 差一**(§2.5):`insertWithPush` 闭区间 31 vs `resolveDropSlot` 排他 32 —— 最易出 bug,单测专测右边界。
2. **dnd 与 press-timer 抢手势**:必须用 `onPointer*`(非 `onMouse*`/`onTouch*`,后者是 sensor activator),`onClick` 用 `firedRef` 抑制长按后的误单选;移动超 6px 清计时;Board `onDragStart` 兜底清计时。
3. **`useNavigate` 不入 Board**:否则 8 个直渲 Board 的测试(无 Router)全挂。Exit 放 `App.jsx`/`ExitButton`(恒在 Router 内);`GameOverModal` 已在安全区。
4. **挤位原子性**:全程不调 `isOverlap`/合法性;`INVALID_MOVE` → immer 丢弃整草稿;单条 `gameStateStack`(一步撤销)。
5. **anti-cheat 不退化**:`insertTilesWithPush` 仅 `playerID===ctx.currentPlayer` 且 `destGridId==='b'`;hand→board 在 `playersJoin` 拒绝(镜像 `moveTiles:100`)。
6. **playerView**:挤位只动 board 公共行 + 被插入 selection,无对手手牌泄露。
7. **门控/无障碍**:新动画走 `@media (prefers-reduced-motion: no-preference)` 或 `fx.reduced()`(jsdom 无 matchMedia,守卫已就位 `effects.js:4-8`)。
8. **既有能力不回归**:多选/多拖、tap-to-place、键盘 Undo/Redo、断线/同步、各持久化键、超时公告、Hints、主/次按钮——挤位分流只在「board 占位目标」新增分支,空目标/hand 完全沿用旧路径。
9. **`timePerTurn` 毫秒**:reducer 测 setup 直接给毫秒(`last-play.test.js:21`),勿 ×1000。
10. **`console.log`**:新代码不留(spec/构建红线);现存的 `moves.js`/`Game.js` 既有日志不在本轮范围。
11. **删 `handleLongPress`/`getNextTile`/旧透传**:确认无其它引用(已 grep:仅 Board+4 测试传 dummy prop,随 T6 一并处理)。

---

**结论:** 6 个工作项全部可在现有依赖与架构内落地;最高风险集中在 WS-6 的纯算法(已 rubber-duck 三 trace 通过)与 maxCol 差一、以及 WS-5 的 pointer/press-timer 与 dnd 的共存。WS-1 须修正 spec 的「Board 顶栏」假设、改放 `App.jsx`/独立 `ExitButton` 以规避 8 测试的 Router 连锁。建议按 §7 顺序、Board.jsx 三段串行推进。
