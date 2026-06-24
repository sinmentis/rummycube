# RummyCube · 第二轮 · Final Plan(退出/反确认/布局 + 长按整组 + 自动吸附挤位)

> **给执行者:** 用 `superpowers:subagent-driven-development` 逐任务实施(每任务一个全新 implementer TDD + 一个 reviewer 双判)。步骤用 `- [ ]` 勾选。
> 完整技术细节见 `docs/optimization/2026-06-24-round2-review-1-frontend.md`(已逐行核对代码 + F2 三 trace)与 `…-review-2-game-design.md`(feel/调参)。

**Goal:** 加退出入口、把 give-up 改成游戏内两次点击确认、修两处布局重叠,并加两个交互玩法——长按拿起整组、拖放自动吸附+插入挤位。

**Architecture:** 纯呈现层 + 两个纯函数(`insertWithPush`/`contiguousGroup`)+ 一个新的服务端权威 move(`insertTilesWithPush`)。挤位是几何排版,合法性仍在提交时裁定;长按只填充现有 `selectedTiles` 多拖管线。

**Tech Stack:** boardgame.io 0.50(server-authoritative)、React 18 + Vite、@dnd-kit(MouseSensor+TouchSensor,distance:6)、react-router-dom 6、jest + RTL。

## Global Constraints(红线,逐条 verbatim,每任务隐含适用)

- **服务器权威/反作弊不退化:** `tilePositions` 的任何改动都经服务端 move;`insertTilesWithPush` 仅 `playerID===ctx.currentPlayer` 且 `destGridId===BOARD_GRID_ID('b')`,非法返回 `INVALID_MOVE`(immer 草稿整体丢弃,G 不变);客户端从不写 `tilePositions`。
- **合法性裁定时机不变:** 挤位/摆放是几何排版,**不调** `isSequenceValid`/`isBoardValid`;run/set 合法性仍在 `submitMeld`/`endTurn→validatePlayerMove` 提交时裁定。
- **应用内 UI 字符串英文**(本 plan 中文)。
- **门控/无障碍:** 新动画进 `@media (prefers-reduced-motion: no-preference)` 或 `fx.reduced()`(`effects.js:4-8`,已带 `window.matchMedia &&` 守卫);文本恒渲染;jsdom 无 `matchMedia`。
- **无新依赖;`node src/server.js` 必须可启动**(`insertPush.js` 纯 `.js`,`moves.js` 对它 `import … from "./insertPush.js"` 显式后缀;新组件只经 Vite 进 Board/App);构建产物**无新增 `console.log`**。
- **`timePerTurn` 是毫秒**(`Game.js:36`);reducer 测试 setup 直接给毫秒,勿 ×1000(见 `last-play.test.js:21`)。
- **关键陷阱:** `insertWithPush(…,maxCol)` 的 `maxCol` = **闭区间末列 31 = BOARD_COLS-1**;`resolveDropSlot`/`isRunFree(…,maxCols)` 的 `maxCols` = **排他计数 32 = BOARD_COLS**。调 `insertWithPush` 一律传 `BOARD_COLS-1`。
- **`useNavigate` 不得进 `Board.jsx`**:8 个测试直渲 `<Board/>` 且不包 Router → 会全挂。Exit 放 `App.jsx`/独立 `ExitButton`(恒在 Router 内);`GameOverModal` 已用 `useNavigate`(安全)。

## File Structure

**新建:** `src/rummikub/insertPush.js`(纯 `insertWithPush`)、`src/rummikub/components/ExitButton.jsx`、对应测试。
**修改:** `dndUtil.js`(+`isRunFree`/`boardRowTiles`)、`moves.js`(+`insertTilesWithPush`,并加固 `insertTile` 的 hand 归属校验)、`Game.js`(注册)、`Board.jsx`(落点分流 + 长按回调 + give-up 状态机)、`boardUtil.js`(+`contiguousGroup`,删死代码 `handleLongPress`/`getNextTile`)、`Tile.jsx`/`GridSlot.jsx`/`GridContainer.jsx`(长按透传)、`src/App.jsx`(挂 ExitButton 顶栏)、`GameOverModal.jsx`(Back to home)、`board.css`(give-up armed + 聊天留白 + 横幅)。

## 可调参数([PLACEHOLDER],playtest 可调)

| 参数 | 默认 | 范围 | 说明 |
|---|---|---|---|
| `LONG_PRESS_MS` | 250 | 180–350 | 长按拿整组触发时长(游戏设计荐 250;spec 200 偏激进) |
| `MOVE_CANCEL_PX` | 6 | — | 移动超此像素则取消长按(与 dnd `distance:6` 对齐) |
| `GIVEUP_CONFIRM_MS` | 3000 | 2000–4000 | 两次点击确认的复位窗口 |
| `GIVEUP_ARM_GUARD_MS` | 400 | 300–600 | arm 后此窗口内忽略第二次点击,挡 rage 双击秒确认 |
| 聊天留白 | 300px+16px | — | 桌面棋盘右留白 = 聊天宽 + 间距 |
| 挤位方向 | 右优先,溢出转左 | — | F2 ripple 方向 |
| `RIPPLE_SLIDE_MS` | (本轮不做) | — | 级联滑动动画——**post-merge polish**,本轮不实现 |

**决策记录:** Exit = **单击**(可重连、非破坏性,不加确认);F2 级联滑动动画**本轮不做**(post-merge);give-up 加 `GIVEUP_ARM_GUARD_MS` rage-guard(游戏设计建议)。

---

## Task T1 — 纯函数 `insertWithPush`(WS-6 算法地基)

**Files:** Create `src/rummikub/insertPush.js`、`src/tests/insert-push.test.js`。**纯、无依赖、可并行先做。**

**Interface — Produces:** `insertWithPush(rowTiles, T, N, maxCol) -> {shifts:{tileId:newCol}, newCols:number[]} | null`。`rowTiles=[{tileId,col}]`(目标行现有占位,不含拖入牌);`T`=落点列;`N`=拖入数;`maxCol`=闭区间末列(31)。`null`=两向都放不下。

**实现(已核对 + 三 trace 通过,见 review-1 §2.1):**
```js
export function insertWithPush(rowTiles, T, N, maxCol) {
    if (T < 0 || T + N - 1 > maxCol) return null;
    const asc = [...rowTiles].sort((a, b) => a.col - b.col);
    const occ = new Set(asc.map(t => t.col));
    let free = true;
    for (let c = T; c < T + N; c++) if (occ.has(c)) { free = false; break; }
    if (free) return {shifts: {}, newCols: cols(T, N)};
    return tryRight(asc, T, N, maxCol) || tryLeft(asc, T, N, maxCol);
}
function cols(T, N) { return Array.from({length: N}, (_, i) => T + i); }
function tryRight(asc, T, N, maxCol) {
    const shifts = {}; let cursor = T + N;
    for (const {tileId, col} of asc) {
        if (col < T) continue;
        if (col < cursor) { if (cursor > maxCol) return null; shifts[tileId] = cursor; cursor += 1; }
        else break;
    }
    return {shifts, newCols: cols(T, N)};
}
function tryLeft(asc, T, N, maxCol) {
    const shifts = {}; let cursor = T - 1;
    for (let i = asc.length - 1; i >= 0; i--) {
        const {tileId, col} = asc[i];
        if (col > T + N - 1) continue;
        if (col > cursor) { if (cursor < 0) return null; shifts[tileId] = cursor; cursor -= 1; }
        else break;
    }
    return {shifts, newCols: cols(T, N)};
}
```

- [ ] **Step 1 失败测试**(纯 jest,仿 `resolve-drop-slot.test.js`):全空吸附(`shifts:{}`);单层右推;**级联右推** `[{a,0},{b,1},{c,2},{d,4},{e,5},{f,6}]` T=3 N=2 maxCol=31 → 新 `[3,4]` 且 `d→? ` —— 用 `1 2 3 _ 7 7 7` 等价构造,断言三个右组各右移 1;右溢出转左(小 maxCol 构造);双向都满→`null`;N=1 插入;空格吸收停止级联;最右列边界(T=31、`T+N-1>maxCol`→null);左溢出→null。
- [ ] **Step 2 跑测试确认失败**(`npx jest insert-push`)。
- [ ] **Step 3 实现** 上面的纯函数。
- [ ] **Step 4 跑测试确认通过**。
- [ ] **Step 5 提交** `feat(board): pure insertWithPush ripple algorithm`。

---

## Task T2 — `dndUtil` 新 helper `isRunFree` / `boardRowTiles`

**Files:** Modify `src/rummikub/dndUtil.js`;Test `src/tests/insert-push-helpers.test.js`(或并入相邻测试)。可并行。

**Interface — Produces:**
```js
// buildRowOccupancy(dndUtil.js:42-53) 返回的是 (col,row)=>bool(两参!)——必须带 row
export function isRunFree(isOccupied, T, N, row, maxCols) {  // maxCols=排他计数(BOARD_COLS=32)
    if (T < 0 || T + N > maxCols) return false;
    for (let c = T; c < T + N; c++) if (isOccupied(c, row)) return false;
    return true;
}
export function boardRowTiles(tilePositions, row, excludeIds) {  // -> [{tileId,col}]
    const ex = new Set((excludeIds || []).map(String)); const out = [];
    for (const id in tilePositions) {
        const p = tilePositions[id];
        if (!p || p.gridId !== 'b' || p.row !== row || ex.has(String(id))) continue;
        out.push({tileId: id, col: p.col});
    }
    return out;
}
```
> **(rubber-duck 修正)** `isOccupied` 是 `(col,row)=>bool`,**必须传 `row`**,否则 `isOccupied(c)` 退化成查 `"c:undefined"`、占位格被当空格 → 误派 `moveTiles` 落占位 → 服务端 `INVALID_MOVE` 静默 no-op。T2/T4 测试都要带 `row`。

- [ ] **Step 1 失败测试**:`isRunFree` 边界(T<0、T+N>maxCols、命中占位、全空);`boardRowTiles` 排除集 + 只取本行 board 牌。
- [ ] **Step 2 跑测试确认失败**。
- [ ] **Step 3 实现**。
- [ ] **Step 4 跑测试确认通过**。
- [ ] **Step 5 提交** `feat(board): isRunFree + boardRowTiles drop helpers`。

---

## Task T3 — 服务端 move `insertTilesWithPush` + `Game.js` 注册

**Files:** Modify `src/rummikub/moves.js`、`src/rummikub/Game.js`;Test `src/tests/insert-tiles-with-push.test.js`(reducer 级,仿 `forfeit-turn.test.js`)。**依赖 T1;`moves.js` 串行。**

**Interface — Consumes:** `insertWithPush`(T1)。**Produces:** move `insertTilesWithPush({G,ctx,playerID}, col, row, destGridId, tileIdObj, selectedTiles)`(与 `moveTiles` 同形)。

**实现(见 review-1 §2.2;要点):** 守卫 `playerID===ctx.currentPlayer` 且 `destGridId==='b'`,否则 `INVALID_MOVE`;`selection` = 含 `tileIdObj.id` 时 `orderTilesBySource(selectedTiles,…)` 否则 `[id]`;收集本行 board 占位(排除 selection)→ `insertWithPush(rowTiles, col, N, BOARD_COLS-1)`;`null`→`INVALID_MOVE`;否则**先 push 一条** `G.gameStateStack.push(getGameState(G))`,再①把 `shifts` 里被推牌只改 `col`,②新牌落 `newCols`(hand→board 置 `{tmp:true,playerID:null}` 且 `playersJoin` 阶段拒绝;board→board 保留 `tmp/playerID`)。全程**不调 `isOverlap`/合法性**。`Game.js`:`import` + 顶层 `moves` 注册(`playersJoin.phase` 不注册)。完整代码见 review-1 §2.2/§2.3,**逐字采用**。

> **(rubber-duck 修正 · 反作弊)** hand→board 分支**必须校验牌的归属**——`insertTile`(`moves.js:99-101`)只查「mover 是当前玩家」、**没查「这张手牌是 mover 自己的」**(`currPos.playerID===playerID`),理论上当前玩家猜到对手手牌 id 即可移动它。新 move 的 hand→board 分支要加:
> ```js
> if (p.gridId === HAND_GRID_ID) {
>     if (String(p.playerID) !== String(playerID)) return INVALID_MOVE;  // 必须:防移动对手手牌
>     if (ctx.phase === 'playersJoin') return INVALID_MOVE;
>     flags = {tmp: true, playerID: null};
> }
> ```
> **并同步加固既有 `moveTiles` 的 `insertTile` fromHandToBoard 分支(同一行检查,`moves.js:99-101`)**——这是与新代码紧耦合的既有反作弊缺口,本任务一并补。reducer 测试加一条:当前玩家试图插入「`playerID` 非本人」的手牌 → `INVALID_MOVE` 且 G 不变。

- [ ] **Step 1 失败测试**(reducer,`Local()`,setup 给毫秒 timePerTurn):级联写入正确(被推牌新 col + 新牌 newCols + tmp);**原子**;`INVALID_MOVE` 路径 `_.cloneDeep` 比对 G 不变(仿 `forfeit-turn.test.js` 第二例);`undo` 一步还原整组;**anti-cheat**(非当前玩家→`INVALID_MOVE` 且 currentPlayer 不变;**插入「`playerID` 非本人」的手牌→`INVALID_MOVE` 且 G 不变**);`destGridId!=='b'`→`INVALID_MOVE`;hand→board 在 `playersJoin` 拒绝。
- [ ] **Step 2 跑测试确认失败**。
- [ ] **Step 3 实现** move + 注册。
- [ ] **Step 4 跑测试确认通过**;并 `node src/server.js` 启动核验(`insertPush.js` 显式 `.js` import)。
- [ ] **Step 5 提交** `feat(board): insertTilesWithPush authoritative move`。

---

## Task T4 — 客户端落点分流(`onDragEnd`/`onCellTap`)

**Files:** Modify `src/rummikub/components/Board.jsx`(替换 `onDragEnd` ~166-191、`onCellTap` ~226-242);`dndUtil.js` import 追加。Test RTL(分流判定)。**依赖 T1/T2/T3;Board 串行段①。**

**Interface — Consumes:** `insertWithPush`(T1)、`isRunFree`/`boardRowTiles`(T2)、`moves.insertTilesWithPush`(T3)。

**实现(见 review-1 §2.4):** board 落点先判**「在界内 且 run 命中占位」**才走挤位;否则(全空目标 / 越界 / hand 行)沿用现有 `resolveDropSlot`+`moveTiles`。命中占位 → `insertWithPush` 预判(`null`→`buzz`+清选区,**不发 move**),否则 `moves.insertTilesWithPush(T,row,'b',{id},ordered)`。保持「失败=非破坏性 buzz+回弹」。

> **(rubber-duck 修正)** 必须把**「越界」与「占位」分开**——只有 `inBounds && occupiedInRun` 才走挤位,否则回退到 `resolveDropSlot`(它对越界/边界会就近吸附到合法 run,不能误判为「拒绝」):
> ```js
> const inBounds = T >= 0 && T + N <= maxCols;          // maxCols=BOARD_COLS(32)
> const occupiedInRun = inBounds && !isRunFree(isOccupied, T, N, row, maxCols);
> if (gridId === BOARD_GRID_ID && occupiedInRun) {
>     const rowTiles = boardRowTiles(gRef.current.tilePositions, row, selection);
>     const plan = insertWithPush(rowTiles, T, N, BOARD_COLS - 1);   // 闭区间末列 31
>     if (!plan) { buzz(); /* 清选区 */ return; }
>     moves.insertTilesWithPush(T, row, gridId, {id}, orderTilesBySource(selection, …)); /* markSyncing/play */ return;
> }
> // 否则:现有 resolveDropSlot + moveTiles(含越界就近吸附与其自身的拒绝)
> ```
> `onCellTap`(`Board.jsx:226-242`)做同样的 board 分流(空格 tap 右侧可能占位 → 同判)。`buildRowOccupancy` 是 `(col,row)=>bool`(T2)。

- [ ] **Step 1 失败测试**(RTL,mock `moves`):board 占位目标拖放 → 调 `moves.insertTilesWithPush`(对的参数);全空目标 → 调 `moves.moveTiles`;`insertWithPush` 返回 null 的目标 → `buzz`、不调 move;hand 行 → 仍 `moveTiles`。
- [ ] **Step 2 跑测试确认失败**。
- [ ] **Step 3 实现** 分流。
- [ ] **Step 4 跑测试确认通过**(+ 全量 jest)。
- [ ] **Step 5 提交** `feat(board): route board drops to insert-push when target is occupied`。

---

## Task T5 — 纯函数 `contiguousGroup`(WS-5 地基)+ 删死代码

**Files:** Modify `src/rummikub/boardUtil.js`(+`contiguousGroup`,**删** `handleLongPress`/`getNextTile`);Test `src/tests/contiguous-group.test.js`。可并行(但同文件删死代码,注意与 T6 协调)。

**Interface — Produces:** `contiguousGroup(tilePositions, pressedTileId) -> tileId[]`(同 grid/row 含按下牌的整段连续 run,列升序;手牌按 `playerID` 隔离,board 不隔离;无邻居→单张)。**实现见 review-1 §3.1,逐字采用。**

- [ ] **Step 1 失败测试**(`buildTileObj` 造 id):左右扩展;空格断组;手牌跨 `playerID` 不串;board 不隔离整桌成组;单张退化;按下牌缺失退化。
- [ ] **Step 2 跑测试确认失败**。
- [ ] **Step 3 实现** + 删 `handleLongPress`/`getNextTile`。
- [ ] **Step 4 跑测试确认通过**。
- [ ] **Step 5 提交** `feat(board): contiguousGroup helper; remove dead handleLongPress`。

---

## Task T6 — 长按 press-timer + 透传链路(WS-5 接线)

**Files:** Modify `src/rummikub/components/Tile.jsx`(pointer press-timer + `firedRef` 抑制 click)、`GridSlot.jsx`/`GridContainer.jsx`(透传 `onLongPress`)、`Board.jsx`(`onLongPressCb`;删旧死透传);改 4 个传旧 prop 的测试。**依赖 T5;Board 串行段②。**

> **(rubber-duck 修正)** 计时器**完全局部于 `Tile`**——用 `onPointerMove`(超 6px)/`onPointerUp`/`onPointerCancel`/`onPointerLeave` 清;**不要**让 Board 的 `onDragStart` 去清(它够不到 Tile 内的 ref)。`onPointerLeave` 必加,防按住后指针滑出本格而计时器悬挂。

**实现(见 review-1 §3.2/3.3,逐字采用):** Tile 用 **`onPointerDown/Move/Up/Cancel`**(避开 sensor 的 `onMouseDown`/`onTouchStart`),`LONG_PRESS_MS=250`、`MOVE_CANCEL_PX=6`;触发 `onLongPress(tile)`,`firedRef` 抑制其后的 `onClick`(否则整组被 toggle 回单张);移动超 6px 清计时;Board `onLongPressCb` 设 `selectedTiles=contiguousGroup(...)`。透传 `Board→GridContainer→GridSlot→Tile` 加 `onLongPress`;删 `Board.jsx` 对 `handleLongPress`/`onLongPressMouseUp`/`longPressTimeoutId`/`handleLongPressCb` 的旧透传与 import;改 `playable-marker`/`turn-timer-render`/`droppable-cue`/`grid-memo` 四个测试里传的旧 dummy prop(换 `onLongPress={()=>{}}`)。

- [ ] **Step 1 失败测试**:对 `Tile` 做 RTL(`fireEvent.pointerDown`+fake timers):按住 ≥250ms → 调 `onLongPress(tile)`;短按(<250ms up)→ 不调 `onLongPress`、走 `onClick` 单选;长按后 `onClick` 被 `firedRef` 抑制;移动超 6px 取消长按。
- [ ] **Step 2 跑测试确认失败**。
- [ ] **Step 3 实现** press-timer + 透传 + 删死码 + 修 4 测试。
- [ ] **Step 4 跑测试确认通过**(+ 全量 jest;4 个被改测试仍绿)。
- [ ] **Step 5 提交** `feat(board): long-press to pick up a whole contiguous group`。

---

## Task T7 — WS-1 Exit 按钮 + GameOver 回主页

**Files:** Create `src/rummikub/components/ExitButton.jsx`;Modify `App.jsx`(挂顶栏)、`GameOverModal.jsx`(Back to home);Test `src/tests/exit-button.test.js`、扩 GameOver 测试。**独立文件,可并行。不碰 Board。**

**实现:**
- `ExitButton.jsx`:内用 `useNavigate()`+`useLocation()`;仅 `pathname.startsWith('/match/')` 时渲染 `<button className="exit-button" onClick={()=>navigate('/')}>Exit</button>`(单击、非破坏性、可重连;不清座位凭证)。挂在 `src/App.jsx` `.navbar`(`src/App.jsx:35-39`,How to play/Mute 旁;该文件恒在 `BrowserRouter` 内,`useNavigate` 安全)。
- `GameOverModal.jsx`:在 `Play Again` 旁加 `<button className="gameover-button gameover-button--secondary" onClick={onBackHome}>Back to home</button>`,`onBackHome` 清 `localStorage['rummycube:match:'+matchId]` 后 `navigate('/')`。

- [ ] **Step 1 失败测试**(RTL + `MemoryRouter`):`ExitButton` 在 `/match/m1` 渲染、在 `/` 不渲染、点击 navigate('/')(mock useNavigate);`GameOverModal` 的 `Back to home` 清 `localStorage['rummycube:match:m1']` + navigate('/')。
- [ ] **Step 2 跑测试确认失败**。
- [ ] **Step 3 实现** ExitButton + 挂载 + GameOver 按钮。
- [ ] **Step 4 跑测试确认通过**。
- [ ] **Step 5 提交** `feat(nav): in-match Exit button + GameOver back-to-home`。

---

## Task T8 — WS-2 Give up 两次点击确认(去 window.confirm)

**Files:** Modify `src/rummikub/components/Board.jsx`(`onForfeitTurn` 状态机 + `forfeitBut` 文案/类)、`board.css`(armed 警示样式)。Test RTL。**Board 串行段③。**

**实现(见 review-1 §4.2,+ 游戏设计的 rage-guard):**
```js
const GIVEUP_CONFIRM_MS = 3000, GIVEUP_ARM_GUARD_MS = 400;
const [giveUpArmed, setGiveUpArmed] = useState(false);
const giveUpTimer = useRef(null), armedAtRef = useRef(0);
const disarm = useCallback(() => { clearTimeout(giveUpTimer.current); setGiveUpArmed(false); }, []);
const onForfeitTurn = useCallback(() => {
    if (giveUpArmed) {
        if (Date.now() - armedAtRef.current < GIVEUP_ARM_GUARD_MS) return; // 挡 rage 双击秒确认
        disarm(); setSubmitReason(''); moves.forfeitTurn(); return;
    }
    setGiveUpArmed(true); armedAtRef.current = Date.now();
    clearTimeout(giveUpTimer.current);
    giveUpTimer.current = setTimeout(() => setGiveUpArmed(false), GIVEUP_CONFIRM_MS);
}, [giveUpArmed, disarm, moves]);
useEffect(() => { disarm(); }, [ctx.currentPlayer, ctx.gameover, disarm]);
// (rubber-duck 修正 + T8 实测修正) 牌面/暂存变化也复位。注意 deps 里**不能**含 giveUpArmed/disarm,
// 否则 arm(false→true)那一帧 effect 会重跑并立刻自我 disarm,两次点击流程直接失效(已实测)。
useEffect(() => { if (giveUpArmed) disarm(); }, [G.tilePositions, hasStaged]);
useEffect(() => () => clearTimeout(giveUpTimer.current), []);
```
按钮:`giveUpArmed ? 'Click again to confirm' : 'Give up turn'` + armed 加 `is-arming`(琥珀 + `⚠` 字形;脉冲动画进 `@media (prefers-reduced-motion: no-preference)`)。提交成功(`onSubmitMeld` 接受分支)也 `disarm()`。文案英文。

- [ ] **Step 1 失败测试**(RTL,fake timers):第一次点不 `forfeitTurn`、文案切 `Click again to confirm`+`is-arming`;armed 内(>400ms)第二次点 → `moves.forfeitTurn`;`advanceTimersByTime(3000)` 后复原且不 forfeit;arm 后 <400ms 的第二点被忽略;切 `currentPlayer` 复位。
- [ ] **Step 2 跑测试确认失败**。
- [ ] **Step 3 实现** 状态机 + CSS。
- [ ] **Step 4 跑测试确认通过**。
- [ ] **Step 5 提交** `feat(turn): two-click in-game give-up confirm`。

---

## Task T9 — WS-3 聊天留白 + WS-4 横幅移位(布局 CSS)

**Files:** Modify `src/rummikub/components/board.css`。Test:视觉为主(CSS 推理 + 真机),可加 DOM 断言。**两处不同选择器,合一任务。**

**实现(见 review-1 §4.3/4.4,逐字采用):**
- WS-3:`@media (min-width: 821px) { .board-container { padding-right: calc(300px + 16px); } }`(对齐聊天 FAB 折叠断点 820px;横向滚动区随之计入留白)。
- WS-4:`.turn-banner { left: 92px; bottom: calc(100% + 26px); }`(头像右侧,6+80+6);移动端 `@media (max-width:820px) { .turn-banner { left: 58px; bottom: calc(100% + 14px); } }`(46px 头像)。保留 `white-space:nowrap` + `z-index:7`。

- [ ] **Step 1**:实现两处 CSS。
- [ ] **Step 2 视觉核验(推理)**:宽屏棋盘内容止于聊天左缘;横幅在头像右侧不压头像;窄屏不溢出。可加一条「`.turn-banner` 存在且不与 `.rack-self` 同锚」的弱 DOM 断言。
- [ ] **Step 3 全量** `npx jest` 全绿。
- [ ] **Step 4 提交** `fix(layout): reserve chat gutter + move turn banner beside avatar`。

---

## 执行说明

- **串行热点:** `Board.jsx`(T4/T6/T8)、`board.css`(T8/T9)、`moves.js`+`Game.js`(T3)。建议 **Board.jsx 三段(T4→T6→T8)同一 implementer 串行或严格排序**,避免 `onDragEnd`/`state`/按钮区互踩。纯 helper(T1/T2/T5)与独立件(T7)先做/可解耦。
- 推荐顺序:**T1 → T2 → T3 → T5 → T4 → T6 → T7 → T8 → T9**(纯函数与 helper 先行,再服务端,再 Board 三段,再独立件与 CSS)。
- 全部完成后整支终审 + 全量 `npx jest`(≥281 绿)+ `npm run build`(无新 `console.log`)+ `node src/server.js` 启动。

## Self-Review(spec 覆盖核对)

- WS-1 Exit → T7。✅ WS-2 give-up 两次点击 → T8。✅ WS-3 聊天留白 → T9。✅ WS-4 横幅 → T9。✅
- WS-5 长按整组 → T5(`contiguousGroup`)+T6(press-timer/透传)。✅
- WS-6 吸附+挤位 → T1(`insertWithPush`)+T2(helper)+T3(server move)+T4(client 分流)。✅
- 不变量(服务器权威/合法性提交时裁定/几何不校验数字/门控/英文/无新依赖/可启动/maxCol 差一/useNavigate 不入 Board/timePerTurn 毫秒)→ Global Constraints + 各任务 acceptance。✅
- 类型一致性:`insertWithPush`→`{shifts,newCols}|null` 在 T1 定、T3/T4 用;`contiguousGroup`→`tileId[]` 在 T5 定、T6 用;`insertTilesWithPush` 签名 T3 定、T4 调,一致。✅
- 占位扫描:无 TODO/TBD;所有代码、文案、参数均给定值。✅
- rubber-duck(gpt-5.5)复核已并入:① `isRunFree` 带 `row`(`isOccupied(c,row)`);② 新 move + 既有 `insertTile` 加 hand 归属校验(反作弊);③ T4 越界与占位分流(保留 `resolveDropSlot` 就近吸附);④ give-up 牌面变化复位;⑤ Exit 在 `src/App.jsx`;⑥ 长按计时器全局部于 Tile(含 `onPointerLeave`)。✅
