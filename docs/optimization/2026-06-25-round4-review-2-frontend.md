# RummyCube Round-4 · Frontend 实现骨架（review-2 / frontend backbone）

> 喂给后续 TDD 实施计划。所有签名/行号都已对照 **当前真实代码** 核实（非臆测）。
> 代码/标识符/CSS/测试名一律英文；本文档散文中文。
> 我的深度负责：WS-A / WS-B / WS-C / WS-D / WS-F；WS-E 正确性由 game-design 专家共同负责（§E 仅给前端 backbone 触点）。
> 约束：服务器权威 + anti-cheat 守卫不改；动画一律 `@media (prefers-reduced-motion: no-preference)` 门控并保留非动画第二通道。
> 基线：本文引用的 `turn-timer-render` / `long-press` / `contiguous-group` / `droppable-cue` 四个套件当前全绿（21 tests passed，已实跑确认）。

---

## 现状签名速查（已核实 file:line）

| 符号 | 位置 | 当前签名 / 值 |
| --- | --- | --- |
| `LONG_PRESS_MS` | `Tile.jsx:13` | `= 250` |
| `MOVE_CANCEL_PX` | `Tile.jsx:14` | `= 6`（与 dnd-kit sensor `distance:6` 对齐，见 `Board.jsx:141-142`）|
| `getTileStyle(selected, isDragging, isValid, position, index, newlyAdded)` | `Tile.jsx:57` | 选中 = `#c0c0c0` 底 + `2px solid #6416ff` 边（L67-71）；face `cursor:'move'`（L82）|
| `TilePreview({tile, isSelected, isDragging, isValid, isPlayable, position, boardGriBoundingBox, index, newlyAdded})` | `Tile.jsx:24` | face `className="tile tile-clickable border-dark ..."`（L43）|
| `onPointerDown` 单次 `setTimeout(onLongPress, 250)` | `Tile.jsx:120-124` | `firedRef`（L101/117/121/137）吞 click |
| 指针 handlers | `Tile.jsx:151-156` | `onPointerUp/Cancel/Leave={clearPressTimer}`；wrapper `cursor: canDnD?'grab':'default'`（L156）|
| `useDraggable({id: tile, disabled: !canDnD})` | `Tile.jsx:97` | `isDragging` 仅用于 wrapper opacity，**未** 传入 TilePreview |
| `contiguousGroup(tilePositions, pressedTileId)` | `boardUtil.js:9-24` | 左 `unshift`（L21）+ 右 `push`（L22）；HAND 按 playerID 隔离（L17）|
| `onLongPressCb(tileId)` | `Board.jsx:266-271` | `setState({selectedTiles: contiguousGroup(...).map(String), lastSelectedTileId: String(tileId)})` |
| `dispatchDrop(target, primaryId, selection)` | `Board.jsx:198-224` | `resolveDropDispatch` → `joker/push/snap/reject`；reject 清选区 |
| `onCellTap(gridId, col, row)` | `Board.jsx:282-286` | 选区非空才走 `dispatchDrop`（tap-to-place）|
| `onDragStart` | `Board.jsx:225-230` | 拖的 id 已在选区则保留多选（L229）|
| `onTurnTimeout` | `Board.jsx:381-384` | `if (ctx.gameover) return; moves.forceEndTurn()` |
| `<TurnDeadlineWatcher timerExpireAt={showTurnTimer ? G.timerExpireAt : null} onTimeout={onTurnTimeout}/>` | `Board.jsx:683-685` | — |
| DragOverlay clone | `Board.jsx:732-739` | `<TilePreview tile={id}/>`（未传 `isDragging`/`canDnD`）|
| `GridSlot` 空格 | `GridSlot.jsx:46-54` | `isTapTarget=(isDragActive||hasSelection)&&canDnD` → `.slot-valid`；`isOver` 内联 `rgba(71,179,86,.43)`（L53）|
| `gridId` 进 GridSlot | `GridContainer.jsx:66` | board=`'b'`、hand=`'h'`（`constants.js:9-10`）|
| `BOARD_GRID_ID='b'` / `HAND_GRID_ID='h'` | `constants.js:9-10` | — |
| `.grid-item.slot-valid` | `board.css:312-318` | 绿底 `rgba(120,200,130,.16)` + `inset 0 0 0 2px ...` + `inset 0 0 12px ...` |
| `div.tile` | `board.css:341-362` | `position:relative`（L343）；`transition:transform .12s, box-shadow .12s`（L361）|
| `div.tile:hover` | `board.css:365-368` | `transform:translateY(-2px)` |
| `.tile-clickable` | `board.css:382-384` | `cursor:pointer`（被 face 内联 cursor 覆盖）|
| `.tile-lift .tile { cursor:grabbing }` | `board.css:1143` | DragOverlay clone 用 |
| reduced-motion 门控样板 | `board.css:1157-1162` | `@media (prefers-reduced-motion: no-preference){ ... }` |
| `TurnDeadlineWatcher` | `TurnDeadlineWatcher.jsx:9-39` | `firedRef` 单发锁死 + `clearInterval`（L28）；`setInterval(check,400)`（L33）|
| `getSecTs()` | `util.js:455-457` | `return (new Date).getTime()` —— **毫秒**（命名误导）|
| `forceEndTurn` 守卫 | `moves.js:206-214` | `if (!G.timerExpireAt || getSecTs() < G.timerExpireAt) return INVALID_MOVE` |
| `resolveDropDispatch({...})` | `dndUtil.js:201` | 折叠 joker/push/snap/reject |
| `insertWithPush(rowTiles, T, N, maxCol)` 的 `free` 短路 | `insertPush.js:17-23` | 目标列全空即直接放下 |

---

## §A · 长按逐张取牌（B 模式 · 250ms · 右向累积）

### 责任切分

**`Tile.jsx`（只管计时，不懂序列）**
- 新常量 `LONG_PRESS_STEP_MS = 250`（与 `LONG_PRESS_MS` 同值，正因为同值，**一个 `setInterval(250)` 即可**：首发落在 250ms = tick1，之后每 250ms = tick2/3…）。
- `onPointerDown`（替换 `Tile.jsx:120-124` 的单次 `setTimeout`）：

```js
const tickRef = useRef(0);
// onPointerDown:
if (!canDnD) return;
firedRef.current = false;
tickRef.current = 0;
startXY.current = {x: e.clientX, y: e.clientY};
clearPressTimer();
pressTimer.current = setInterval(() => {
    firedRef.current = true;          // 首 tick 起即吞掉随后的 click
    tickRef.current += 1;
    onLongPress?.(tile, tickRef.current);
}, LONG_PRESS_STEP_MS);
```

- `clearPressTimer`（`Tile.jsx:103-108`）把 `clearTimeout` 换成 `clearInterval`（语义对齐；jsdom/浏览器里 id 通用，但仍按类型用对）。
- 取消通路 **不变**：`onPointerMove` 超 `MOVE_CANCEL_PX(6)` → `clearPressTimer`（`Tile.jsx:127-134`）；`onPointerUp/Cancel/Leave={clearPressTimer}`（L151-156）；卸载 `useEffect(()=>()=>clearPressTimer())`（L144）。
- `firedRef` 吞 click 逻辑（`Tile.jsx:136-142`）不动：首 tick 即置真，松手后那一发 click 被吞，选区不被还原成单张。

**`Board.jsx`（拥有右向序列）**
- 改 `onLongPressCb`（`Board.jsx:266-271`）签名为 `(tileId, count)`，每次按 `count` 取右向序列前 N 张：

```js
const onLongPressCb = useCallback((tileId, count) => {
    const seq = tilesRightward(gRef.current.tilePositions, tileId).map(String);
    const n = Math.min(count, seq.length);
    setState(prev => {
        const next = seq.slice(0, n);
        // idempotent guard：序列耗尽后的多余 tick 不再 setState（空转无害、零重渲染）
        if (prev.selectedTiles.length === next.length &&
            prev.selectedTiles.every((id, i) => id === next[i])) return prev;
        return {selectedTiles: next, lastSelectedTileId: String(tileId)};
    });
}, []);
```

- import 从 `contiguousGroup` 换成 `tilesRightward`（`Board.jsx:22`）。

### `tilesRightward` 签名 + 算法（= `contiguousGroup` 去掉左向 `unshift`）

放在 `boardUtil.js`，与现 `contiguousGroup` 并列（或替换之）：

```js
// Pure: [pressedId, ...右侧同 grid/row 连续列 id]，列升序，遇空格停。
// HAND_GRID_ID 按 playerID 隔离；board(playerID:null) 不隔离。左侧即使相连也永不含。
export function tilesRightward(tilePositions, pressedTileId) {
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
    for (let c = col + 1; byCol[c] != null; c++) group.push(byCol[c]);  // 只右向，无 L21 的左向 unshift
    return group;
}
```

### 回调契约（采纳「tick-count」方案）

- `onLongPress(tile, count)`，`count` 从 1 起每 tick +1。
- Board 端 **无状态**：每 tick 用 `gRef.current.tilePositions` 重算 `seq`，`slice(0, count)` 写入选区。重算而非缓存 → 对回合内 board 变化天然鲁棒，且 setState 幂等。
- 「**首发 + 每 tick 扩展**」的等价替代（不采纳，列出供 plan 取舍）：`onLongPress(tile)` 首发 + `onLongPressExtend(tile)` 每 tick；缺点是 Board 需自存 tick 计数与「当前序列」，跨 tick 有状态、更易错。tick-count 更简单。

### 终止与共存

- **什么停计时**：序列耗尽 **不** 显式停 timer——Board 的幂等 guard 让多余 tick 变成「无 setState 的空转」（spec「空转无害」）。timer 真正停止只发生在 up/cancel/leave/move>6px。可选优化：若想连空转都省掉，可让 Board 在 `count >= seq.length` 时回调一个 `false` 让 Tile `clearPressTimer`；**不推荐**（多一条回传通路，收益仅省几次 no-op interval）。
- **与 dnd-kit 拖拽共存**：`MOVE_CANCEL_PX(6) === sensor distance(6)`（`Board.jsx:141-142`）。移动 >6px：`clearPressTimer` 停 tick，dnd-kit 接管拖拽；此前已累积的 `selectedTiles` 留在 Board state，`onDragStart`（`Board.jsx:229`）因「拖的 id 已在选区」而保留多选 → 直接进既有多拖管线。零冲突。

### 测试

- **纯单测** `src/tests/tiles-rightward.test.js`（镜像 `contiguous-group.test.js`，用 `buildTileObj` + `expectGroup` 辅助）：
  - `left neighbor is never included`（按右端/中间，左侧相连仍不含）；
  - `a gap stops the rightward run`；
  - `HAND runs isolated by playerID`（右邻是别家牌 → 不并）；
  - `board tiles (playerID null) not isolated`；
  - `single tile with no right neighbor → [self]`；
  - `pressed id missing → [self]`。
- **Tile 计时 RTL** 扩展 `src/tests/long-press.test.js`（已用 `jest.useFakeTimers()` + `createEvent` 钉 `clientX/Y`，harness `renderTile`）：
  - `each 250ms tick fires onLongPress with an incrementing count`：`pointerDown` → +250 → `toHaveBeenCalledWith(tile, 1)`；+250 → `(tile, 2)`；+250 → `(tile, 3)`。
  - `pointerUp stops further ticks`：tick1 后 `pointerUp`，再 advance 750ms → 调用次数不增。
  - `move >6px cancels before first tick`（复用现有 `pointerEventWithCoords`）。
  - `the click after the first tick is swallowed`（沿用现有断言，firedRef 一次性）。
- **集成（可选）** 复用 `tap-to-place.test.js` 的 live headless `Client({game, numPlayers:2, playerID:'0'})` + `render(<ClientBoard/>)` harness：board 上 `123` 长按中间张，断言选区只向右长、遇空格停、左侧永不进。

### 风险

- **R-A1**：`setInterval` 比单 `setTimeout` 多了「持续触发」面，必须确保 4 条取消通路（up/cancel/leave/move）都改走 `clearInterval`，否则 tick 泄漏。`long-press.test.js` 既有 7 个取消用例可回归兜底。
- **R-A2**：每 tick `setState` 触发 Board 重渲染；幂等 guard 保证序列耗尽后零重渲染。若不加 guard，长按不放会以 4Hz 持续重渲整棵 tile 树。

---

## §B · 选中「拿起」动画

### className 接线

- `TilePreview`（`Tile.jsx:41-43`）face div 的 className 追加 `tile-selected`：

```js
className={"tile tile-clickable border-dark"
    + (isSelected === true ? " tile-selected" : "")
    + (newlyAdded === true ? " tile-drawn" : "")
    + (isPlayable === true ? " tile-playable" : "")}
```

- `getTileStyle` 里的选中内联底色/边（`Tile.jsx:67-71`）**保留** —— 它就是 reduced-motion 的静态第二通道（始终生效，不进媒体门控）。spec「不再只靠内联底色」由「抬起感来自 class」满足；内联底色降级为 fallback。

### `.tile.tile-selected` CSS（新增，放在 `board.css` R4 动画区 ~L1136 附近）

```css
/* WS-B: selected tile reads as "picked up". transform/shadow gated by
   reduced-motion; the inline selected bg+border from getTileStyle is the
   always-on static second channel. div.tile is already position:relative
   (board.css:343) so z-index needs no extra positioning. */
@media (prefers-reduced-motion: no-preference) {
    .tile.tile-selected {
        transform: translateY(-6px) scale(1.04);
        box-shadow: 0 8px 16px rgba(0, 0, 0, .35);
        z-index: 5;
        transition: transform .12s ease, box-shadow .12s ease;
    }
}
```

- 与 `div.tile:hover{transform:translateY(-2px)}`（L365-368）的覆盖关系：`.tile.tile-selected` 特异度 (0,2,0) > `div.tile:hover` (0,1,1)，且源序在后 → 选中态稳压 hover，不会被悬停的 -2px 抢走。
- `transition` 复用 `div.tile`（L361）已有的 `transform .12s` 即可平滑；上面显式写一遍是为了媒体块内自洽，可省。
- 减动用户：媒体块不命中 → 无位移，仅剩内联 `#c0c0c0` 底 + `2px #6416ff` 边，选中态依旧可辨。

### 源断言测试

`src/tests/board-visual-*.test.js`（镜像 `board-visual-ws-f.test.js` 的 `fs.readFileSync(board.css)` + 正则）：

- `.tile.tile-selected` 含 `translateY(-6px)` 且含 `scale(1.04)`：
  `expect(boardCss).toMatch(/\.tile\.tile-selected\s*\{[^}]*translateY\(-6px\)[^}]*scale\(1\.04\)/)`
- 该规则在 reduced-motion 门控内：
  `expect(boardCss).toMatch(/@media\s*\(prefers-reduced-motion:\s*no-preference\)\s*\{[^@]*\.tile\.tile-selected/)`
- 接线侧（可选 RTL）：`render(<TilePreview ... isSelected />)`，断言 face `classList.contains('tile-selected')`。

### 风险

- **R-B1**：低。纯 CSS + 一个 className。唯一坑是 z-index 上下文——已确认 `div.tile` 自带 `position:relative`，无需额外定位。

---

## §C · 光标换套（去掉 face 的 `move`）

### 具体改动

`getTileStyle`（`Tile.jsx:82`）把 `cursor:'move'` 换成按 `canDnD`/`isDragging` 分支：

```js
cursor: !canDnD ? 'default' : (isDragging ? 'grabbing' : 'grab'),
```

为此 `getTileStyle` / `TilePreview` 需要 `canDnD`：

- `TilePreview` 签名加 `canDnD = true`（默认 true，使未传该 prop 的 DragOverlay clone 仍按可拖渲染），传入 `getTileStyle(isSelected, isDragging, isValid, position, index, newlyAdded, canDnD)`。
- 在格内的 `Tile` 渲染处（`Tile.jsx:157-163`）补 `canDnD={canDnD}`。**不** 传 `isDragging` —— 格内源牌拖拽时是隐藏的（wrapper opacity 0.4，L156），可见的是 DragOverlay 克隆，所以源牌 face 恒 `grab` 即可；非可拖牌 face 变 `default`（修掉当前恒 `move`）。

### 与 DragOverlay `.tile-lift .tile{cursor:grabbing}`（board.css:1143）的交互（重点）

- 改完后 face 的 cursor 是 **内联**，内联优先级高于样式表类规则。DragOverlay clone（`Board.jsx:736-737`）当前 `<TilePreview tile={id}/>` 不带 `isDragging` → `getTileStyle` 算出 `grab` 内联，会 **盖过** `.tile-lift .tile{cursor:grabbing}`，克隆变成「张开手」而非「握拳」——回归。
- **修法**：给 overlay 的两处 `TilePreview` 传 `isDragging={true}`（`canDnD` 走默认 true）→ 内联得 `grabbing`，与 `.tile-lift` 规则一致：

```jsx
// Board.jsx:735-737
{state.selectedTiles.includes(activeTile)
    ? orderTilesBySource(state.selectedTiles, G.tilePositions).map(id => <TilePreview key={id} tile={id} isDragging={true}/>)
    : <TilePreview tile={activeTile} isDragging={true}/>}
```

- `.tile-lift .tile{cursor:grabbing}`（L1143）保留作防御性 fallback（与内联同值，无害）。

### 测试

- **源断言**（cheap guard，镜像 css 源测但读 `Tile.jsx`）：`expect(tileJsx).not.toMatch(/cursor:\s*'move'/)`。
- **行为 RTL**（`TilePreview` 已导出）：
  - `render(<TilePreview tile isSelected={false}/>)` 默认 canDnD → face `style.cursor === 'grab'`；
  - `canDnD={false}` → `'default'`；
  - `isDragging={true}` → `'grabbing'`。

### 风险

- **R-C1**：极低，但若漏改 DragOverlay 的 `isDragging` 透传，会把「握拳」回退成「张开手」。R-C 测试的 `grabbing` 用例可兜底。

---

## §D · 落点提示：只提示桌面 + 调柔

### GridSlot 作用域门控（board-only）

`GridSlot.jsx` import `BOARD_GRID_ID`，把视觉类限定到 board grid（`gridId` 已在 props，`GridContainer.jsx:66` 传入）：

```js
import {BOARD_GRID_ID} from "../constants";
// ...
const isBoard = gridId === BOARD_GRID_ID;
const isTapTarget = (isDragActive || hasSelection) && canDnD && isBoard;   // 原 L46 末尾加 && isBoard
// onClick / onCellTap 接线（L47-49）原样不动 —— 仅视觉作用域改，行为不改
return <div
    ref={setNodeRef}
    onClick={onClick}
    className={'grid-item'
        + (isTapTarget ? ' slot-valid' : '')
        + ((isOver && canDnD && isBoard) ? ' slot-over' : '')}/>  // 替换 L53 的内联实色绿
```

- **关键澄清**：`onClick`（`GridSlot.jsx:47-49`，由 `hasSelection && canDnD && onCellTap` 决定）**不** 加 `isBoard` 门控 → 手牌空格仍可点按落子（tap-to-place 行为完全不变），只是不再亮 `.slot-valid`/`.slot-over`。这正合 spec「保持 tap-to-place 行为不变，仅改视觉与作用域」。
- 内联 `style={{backgroundColor:(canDnD&&isOver)?...}}`（L53）整段删除，改由 `.slot-over` 类承载。

### CSS：调柔 `.slot-valid` + 新 `.slot-over`

替换 `board.css:312-318`，并在其后新增 `.slot-over`：

```css
.grid-item.slot-valid {
    border-radius: 6px;
    /* 更淡填充 + 细虚线内描边，读作「轻盈可落」，弱化辉光 */
    background-color: rgba(120, 200, 130, .08);
    box-shadow: inset 0 0 0 1px rgba(150, 210, 120, .35);
}

.grid-item.slot-over {
    border-radius: 6px;
    /* 比 slot-valid 稍强但克制，取代原 rgba(71,179,86,.43) 实色绿 */
    background-color: rgba(120, 200, 130, .22);
    box-shadow: inset 0 0 0 2px rgba(150, 210, 120, .55);
}
```

（数值是骨架建议，可在实施时微调；要点：`slot-valid` 比现状显著更淡、去掉 `inset 0 0 12px` 辉光；`slot-over` 用 alpha .22 取代刺眼的 .43 实色。）

### 测试

扩展 `src/tests/droppable-cue.test.js`（已有 `GridContainer` + `DndContext` harness，`gridId="b"`）：

- 现有三例（drag 时 board 空格亮 / 无 drag 不亮 / 不可拖不亮）保持。
- 新增 `gridId="h"` 渲染：`isDragActive:true, canDnD:true` → `container.querySelectorAll('.slot-valid').length === 0`（手牌永不亮）。
- 源断言（board-visual）：`.slot-valid` 已无 `inset 0 0 12px`（辉光移除）；`.slot-over` 规则存在且 alpha 不再是 `.43`：
  `expect(boardCss).not.toMatch(/rgba\(71,\s*179,\s*86,\s*0?\.43\)/)`。
- tap-to-place 不回归：复用 `tap-to-place.test.js` live-Client harness 确认手牌/桌面落子路径不变。

### 风险

- **R-D1**：低。注意 `onClick` 不门控、只门控视觉，否则会误伤手牌 tap-to-place。

---

## §E · 挤位留缝（co-owned，仅前端 backbone 触点）

> 几何正确性（`insertWithPush` 桥接 / `resolveDropDispatch` 路由）由 game-design 专家共同负责；此处只确认 **前端接线无需新增**。

- 拖拽/点按落子都已汇入 `dispatchDrop`（`Board.jsx:198-224`）→ `resolveDropDispatch`（`dndUtil.js:201`）→ `kind==='push'` 时 `moves.insertTilesWithPush(...d.args)`（L208-209）。
- WS-E 的「桥接留缝」落在两个 **纯函数**：`insertWithPush` 的 `free` 短路（`insertPush.js:21-23`，目标列全空即直接放）要加「左右皆占 → ripple 右推留 1 格」判定；`resolveDropDispatch` 的 push-vs-snap 判定加「桥接」分支。**Board / GridSlot / Tile 无改动**——dispatch 已正确路由 'push'。
- 前端层唯一要确认的：reject 分支（`Board.jsx:214-219`，右推到 `maxCol` 放不下 → 退回吸附而非非法黏连）由纯函数返回 `snap`/`reject`，dispatchDrop 既有 switch 直接覆盖，无需改 UI。
- 测试归属纯 jest：`insert-tiles-with-push` / `resolve-drop-dispatch` 桥接用例（非本前端 backbone 范围）。

---

## §F · TurnDeadlineWatcher 重试 + slack（卡 0 bug）

### 根因复述（已核实）

`TurnDeadlineWatcher.jsx:23-30` 到点只 `onTimeout()` 一次，随即 `firedRef=true` + `clearInterval`（L28）。服务器守卫 `moves.js:212` `getSecTs() < G.timerExpireAt → INVALID_MOVE`。当笔记本墙钟 **快于** VM，这唯一一次早于服务器 deadline 被拒，watcher 永不重试 → 卡 0。`getSecTs()`（`util.js:455-457`）实为 ms。

### 重写（纯客户端；服务器守卫不动）

替换 `TurnDeadlineWatcher.jsx` 整个组件：去 `firedRef` 单发锁，改「节流重试 + slack」，interval 保活，`timerExpireAt` 变化 re-arm，卸载清理。

```js
import {useEffect, useRef} from "react";
import {getSecTs} from "../util";

const TICK_MS = 400;                 // 沿用现 tick 频率（board.css/render 隔离不变）
const FIRE_SLACK_MS = 500;           // 本地 deadline 后再等 ~500ms 才首发，抵消「客户端偏快」早发被拒
const REFIRE_INTERVAL_MS = 1500;     // 已过 deadline 且回合未推进时的重试节流

const TurnDeadlineWatcher = ({timerExpireAt, onTimeout}) => {
    const intervalRef = useRef(null);
    const lastFireRef = useRef(0);   // 上次发 nudge 的 ts（ms），节流用
    const onTimeoutRef = useRef(onTimeout);
    useEffect(() => { onTimeoutRef.current = onTimeout; }, [onTimeout]);

    useEffect(() => {
        lastFireRef.current = 0;     // 新回合：重置节流（自然 re-arm）
        if (!timerExpireAt) return;

        const check = () => {
            const now = getSecTs();
            // slack：必须晚于 deadline FIRE_SLACK_MS 才考虑发
            if (timerExpireAt - now > -FIRE_SLACK_MS) return;
            // 节流：未到 REFIRE_INTERVAL_MS 不重发
            if (now - lastFireRef.current < REFIRE_INTERVAL_MS) return;
            lastFireRef.current = now;
            onTimeoutRef.current();   // 不 clearInterval —— 被拒就下个窗口再试
        };

        check();
        intervalRef.current = setInterval(check, TICK_MS);
        return () => clearInterval(intervalRef.current);   // 卸载/换回合清理，杜绝跨回合泄漏
    }, [timerExpireAt]);

    return null;
};

export default TurnDeadlineWatcher;
```

### 幂等性论证（重复副本落到已推进的新回合）

- 服务器接受首发 → `onTurnEnd` 写 `G.timerExpireAt = null`（`moves.js:531`），`onTurnBegin` 给新回合写 **未来** 的 `timerExpireAt`（`moves.js:503/508`）。Board 收到新 G → `<TurnDeadlineWatcher timerExpireAt={...新值}/>`（`Board.jsx:684`）prop 变 → effect dep `[timerExpireAt]` 变 → **旧 interval cleanup + 新 interval arm + `lastFireRef` 归零**，不叠加计时器。
- 万一旧副本在切换瞬间多发一次 `forceEndTurn`：命中新回合未来的 `timerExpireAt` → `moves.js:212` `getSecTs() < G.timerExpireAt` 成立 → `INVALID_MOVE`，immer draft 丢弃，G 不变（无害幂等）。`onTurnTimeout` 还有 `if (ctx.gameover) return`（`Board.jsx:382`）兜底终局。
- 服务器 `forceEndTurn` 守卫一字不改 —— 仍是 pre-deadline 拒绝的 anti-cheat 权威。

### 假时钟测试计划（新 `src/tests/turn-deadline-watcher.test.js`）

harness 同 `turn-timer-render.test.js`：`jest.useFakeTimers()`（fake timers 同时 mock `Date.now`，已由现绿测验证），`timerExpireAt = getSecTs() + N`，`onTimeout = jest.fn()`，`act(()=>jest.advanceTimersByTime(...))`。

1. **normal path（无偏移）**：`+1000` deadline。advance 1000 → 未发（slack 未到，`remaining=0 > -500`）；再 advance 500（共 +1500，过 deadline+slack）→ `toHaveBeenCalledTimes(1)`；再 advance 1000（未到下一个 REFIRE 窗口且回合「假装」未推进）→ 仍 1（节流）。
2. **client-ahead skew（核心 bug 路径）**：`onTimeout` 为空 jest.fn（模拟服务器持续 INVALID_MOVE、回合未推进、`timerExpireAt` 不变）。advance 到 deadline+slack → 首发（count 1）；advance `REFIRE_INTERVAL_MS(1500)` → 第 2 发；再 1500 → 第 3 发 → 断言 `mock.calls.length >= 3`（证明「首发被拒后持续重试直至接受」）。
3. **server accepts → 停**：承上，rerender 把 `timerExpireAt` 换成新的 **未来** 值（模拟回合推进）→ advance 数秒 → 调用次数不再增长（旧 interval 被 cleanup，新回合未到点）。
4. **timerExpireAt change re-arm**：t1 过点发一次 → rerender t2=future → advance → t2 过点前不发；过 t2+slack 后 **立即** 发（证明 `lastFireRef` 已随 dep 变化归零，不被旧节流卡住），且无重复计时器叠加。
5. **no deadline**：`timerExpireAt={null}` → advance 5000 → 从不发（不变）。

### 风险

- **R-F1（必须处理）**：现有 `turn-timer-render.test.js` 的用例 **「fires onTimeout exactly once, at/after the deadline and not before」（L105-130）会被本改动打破**：
  - L119-123 在 deadline 后仅 +200ms（1200 vs 1000）就断言已发一次；新逻辑要 deadline+`FIRE_SLACK_MS(500)` 才发 → 该断言失败。
  - L126-129 advance +5000 后断言「仍只 1 次」；新逻辑会重试多发 → 失败。
  - **处置**：把该 watcher 用例迁入新 `turn-deadline-watcher.test.js` 并改成上面的 slack/retry 语义；`turn-timer-render.test.js` 只保留「tick 不重渲 GridContainer」(L82)、「no deadline 不发」(L132)、「非 active avatar 不渲染 ring」(L141) 三例（这三例不受影响、仍绿）。TDD plan 须把这条列为「改测」而非「新增」。
- **R-F2**：UI 倒计时可能显示 0 但 nudge 晚 ~500ms 才发——这是有意取舍（spec 明示「UI 可仍显示 0，nudge 稍后发」），非 bug。
- **R-F3**：`getSecTs()` 命名是 ms 不是 sec；`FIRE_SLACK_MS`/`REFIRE_INTERVAL_MS` 均按 ms 与之同量纲，勿被函数名误导。不改 `getSecTs`（服务器 `moves.js` 共用）。

---

## 跨 WS 落地顺序（呼应 spec）

先两个 bug（WS-E、WS-F，价值最高），再手感四项 WS-A→B→C→D；WS-B 与 WS-A 视觉耦合（拿起样式）一并落。验收闸门：全量 `npx jest` 全绿（含 §F 的「改测」R-F1）、`npm run build` 无新 `console.log`、`node src/server.js` 启动 `/games == ["RummyCube"]`。
