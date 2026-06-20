# RummyCube 优化 · 前端实现方案(Frontend Developer)

**日期:** 2026-06-20 · **作者:** Frontend Developer agent · **状态:** 可拆任务的实现方案(非最终代码)
**权威来源:** `docs/optimization/2026-06-20-rummycube-optimization-spec.md`(WS-2/3/4/6/7/13/14)、`docs/optimization/2026-06-20-rummycube-review-4-frontend.md`
**约束:** 不改代码、不 commit。`npm test`(jest);Playwright smoke 从仓库根运行,需 `CHROMIUM_PATH`。

> 本方案中所有论断均带 `file:line`。无法确认处标注「待核实」。标识符 / 代码片段用英文,说明用中文。

---

## 0. 现状核实(已读源码,真实行号)

| 事实 | 位置 |
| --- | --- |
| `useTurnTimer` 在 Board 顶层调用,返回 `timeLeft` 注入整盘 render | `Board.jsx:264-269` |
| `setInterval(tick, 400)`,每 tick `setTimeLeft` | `useTurnTimer.jsx:27`、`useTurnTimer.jsx:17` |
| 每渲染日志 `console.log('RENDER BOARD')` | `Board.jsx:27` |
| 每 tick 日志 `console.log(clamped)` | `useTurnTimer.jsx:16` |
| 每次选牌日志 `console.log(state)`(序列化整个 state) | `Board.jsx:110` |
| `handleTileSelectionCb` deps `[G, playerID, state]`(身份每次选牌都变) | `Board.jsx:109-112` |
| `handleLongPressCb` deps `[G, playerID, longPressTimeoutId]`(捕获 `G`) | `Board.jsx:113-115` |
| `stateRef` 已存在(可用于稳定回调) | `Board.jsx:54-55` |
| `GridContainer` 接收并下传整个 `selectedTiles` 数组 | `GridContainer.jsx:30,51` |
| `GridSlot` 接收 `selectedTiles` 并在内部算 `isSelected` | `GridSlot.jsx:14,19,34` |
| `Tile` 既收 `isSelected` 又收 `selectedTiles`(后者未用,只是透传/噪音) | `Tile.jsx:85` |
| `GridContainer` / `GridSlot` / `Tile` 均无 `React.memo`(components/ 下 0 处 memo) | `GridContainer.jsx:22`、`GridSlot.jsx:6`、`Tile.jsx:85` |
| 每 `GridSlot` 调 `useDroppable`、每 `Tile` 调 `useDraggable` | `GridSlot.jsx:18`、`Tile.jsx:86` |
| `moves.moveTiles` 多选在 `col+index` 落子,无预检 | `moves.js:114-124` |
| `onDragEnd` 解析 over 后直接 `moves.moveTiles(...)` | `Board.jsx:92-100` |
| `moveTilesUseCb` 包了一层 `moves.moveTiles` | `Board.jsx:106-108` |
| 聊天面板 `backdrop-filter: blur(4px)`,背景 `rgba(244,234,210,.58)` | `chat.css:19-21` |
| `Tile.jsx` 顶部 `import _ from "lodash"`(实为 Board.jsx:24 默认整包导入) | `Board.jsx:24` |
| `lodash` 仅用 `_.every`(2 处)| `Board.jsx:31,262` |
| `effects.js` 顶层静态 `import confetti from 'canvas-confetti'` | `juice/effects.js:1` |
| `GameOverModal` 仅在 `ctx.gameover` 时渲染 | `Board.jsx:319-325` |
| `ComboOverlay` 仅 `combo>=2` 才有内容 | `ComboOverlay.jsx:5` |
| `bootstrap` 仅 `index.jsx:5` 引入 CSS;无任何 `react-bootstrap` 组件 import | `index.jsx:5`(grep 全仓 0 处组件用法) |
| 计时环组件 `PlayerAvatarWithTimer` 用 `timeLeft` 经 `useEffect` 驱动 `dashOffset` | `PlayerAvatar.jsx:13-23` |
| `timeLeft` 流向 `TableSeats`(座位环)与 `selfAvatar`(自己环) | `Board.jsx:287`、`Board.jsx:302`、`TableSeats.jsx:27` |
| jest 默认 node 环境;RTL/jsdom 可用(`@testing-library/react@14`、`jest@29`) | `package.json` devDeps、`jest.config.cjs` |
| 现有 smoke 脚本:frontend/multiplayer/reconnect/timer/touch | `scripts/smoke-*.mjs` |

---

## WS-4 — 性能 quick wins(Effort: M)

### 4.1 计时解耦:Board 不再随 tick 重渲染 — **S/M**

**问题根因:** `useTurnTimer` 在 Board 顶层(`Board.jsx:264`)返回 `timeLeft`,被 `TableSeats`(`Board.jsx:287`)与 `selfAvatar`(`Board.jsx:302`)消费 → 每 400ms `setTimeLeft` 触发整个 `RummikubBoard` 重渲染(`Board.jsx:27` 的 'RENDER BOARD' 可证),连带重建 `GridContainer` 全部 ~332 个 `GridSlot`+`Tile`,每个重注册 dnd-kit(`GridSlot.jsx:18`、`Tile.jsx:86`)。

**实现路径(两部分,职责拆开):**

1. **倒计时显示 → 纯 CSS 环(零 React render)。** 改 `PlayerAvatar.jsx`:
   - 删除 `PlayerAvatar.jsx:13-23` 的 `useState(dashOffset)` / `useState(strokeColor)` / `useEffect`。
   - 新增 props:`timerExpireAt`、`timePerTurn`、`isActive`、`showTurnTimer`(替换 `timeLeft`/`totalTime`)。
   - `.timer-circle` 的进度用 CSS `@keyframes`(`strokeDashoffset` 从 0→`CIRCUMFERENCE`,颜色蓝→红)驱动:
     - 在回合开始(`timerExpireAt` 变化)时计算 `remaining = timerExpireAt - getSecTs()`,设 inline style `animationDuration: remaining + 's'`、`animationDelay: -(timePerTurn - remaining) + 's'`(负 delay 让环从「已过去的位置」起跑,解决加入即过半的情况)。
     - `key={timerExpireAt}` 强制每回合重挂载 SVG,重启动画;无需 JS tick。
   - 新增 CSS:在 `PlayerAvatar` 对应样式文件(待核实其 CSS 文件;`board.css` 内含 `.timer-*`?需 grep 确认)加 `@keyframes timer-ring-deplete` 与 `.timer-circle{animation: timer-ring-deplete var(--dur) linear forwards}`。**开放问题:** 颜色蓝→红用 `stroke` 关键帧;Safari 对 `stroke` 动画支持 OK,但 `prefers-reduced-motion` 下应退化为静态(直接显示当前剩余,不动)。
   - `TableSeats.jsx:21-29` 同步改为传 `timerExpireAt`/`timePerTurn` 而非 `timeLeft`。

2. **超时触发 → 隐形 watcher 组件,自管 tick,渲染 null。** 新增 `src/rummikub/components/TurnDeadlineWatcher.jsx`:
   - props:`{timerExpireAt, isActivePlayer, gameover, onTimeout}`。
   - 内部用 `useEffect` 起一个 `setInterval`(可放宽到 1000ms,仅用于触发 `forceEndTurn`,不再驱动 UI 数字),`clamped<=0` 时调 `onTimeout()` 一次(沿用 `useTurnTimer.jsx:9,19-23` 的 `timeoutCalled` ref 防重入)。
   - **关键:返回 `null`** → 它内部 state 变化不触发 Board 重渲染。
   - 在 Board `return` 内挂一处:`<TurnDeadlineWatcher timerExpireAt={showTurnTimer ? G.timerExpireAt : null} isActivePlayer={playerID === ctx.currentPlayer} gameover={ctx.gameover} onTimeout={onTurnTimeout}/>`。
   - 删除 `Board.jsx:264-269` 的 `const timeLeft = useTurnTimer({...})`,以及 `timeLeft` 在 `Board.jsx:287,302` 的传递(改传 `G.timerExpireAt`、`G.timePerTurn`)。
   - `useTurnTimer.jsx` 可保留为 watcher 内部 hook(去掉 `setTimeLeft` 那条 UI 路径),或直接内联到 watcher。建议保留 hook 但改为只返回触发逻辑,删 `console.log(clamped)`(`useTurnTimer.jsx:16`)与 `setTimeLeft`(`:17`)。

> WS-5 需求「环中心显示剩余秒数」与此冲突:纯 CSS 环无法零渲染地显示逐秒数字。**折中:** 数字用一个独立的 `<TurnSeconds>` 叶子组件(自管 1s tick,渲染 null 之外仅一个 `<span>`),只重渲染那个 span,不波及 Board/grid。跨 WS 依赖见下「跨专业依赖」。

### 4.2 `React.memo` 正确包裹 — **M**

**核心陷阱(spec WS-4 已点明,已核实):** 现在把整个 `selectedTiles` 数组下传(`GridContainer.jsx:30,51` → `GridSlot.jsx:14,34` → `Tile.jsx`),数组引用每次选牌都变,`memo` 会被无效化。

**改法:**

1. **`GridContainer` 内算成员关系,下传 `isSelected` 布尔。**
   - `GridContainer.jsx:44-68` 的双重循环里,对每个 `tile` 计算 `const isSelected = !!tile && selectedTiles.indexOf(tile) !== -1`,作为布尔传给 `GridSlot`(`GridContainer.jsx:51` 的 `selectedTiles={selectedTiles}` → 改为 `isSelected={isSelected}`)。
   - `GridSlot.jsx:14` 去掉 `selectedTiles` prop,`:19` 改为直接用 `isSelected` prop(删 `selectedTiles.indexOf` 计算);`:34` 删 `selectedTiles={selectedTiles}` 透传给 `Tile`。
   - `Tile.jsx:85` 去掉未使用的 `selectedTiles` prop(它在 Tile 内部根本没用,只是噪音透传)。
2. **去掉 memo 边界上的无用透传 prop。** `GridSlot` 收了 `hoverPosition`/`setHoverPosition`(`GridSlot.jsx` 未在解构里使用,`GridContainer.jsx:62-63` 仍下传)——确认 `GridSlot` 不用就从 `GridContainer.jsx:62-63` 移除,避免 `hoverPosition` 对象每次变更击穿 memo。**待核实:** `hoverPosition` 实际是否在 `GridSlot`/`Tile` 链路被用(当前 `GridSlot.jsx` 解构里无 `hoverPosition`,疑为死 prop)。
3. **包 `React.memo`:**
   - `Tile`(`Tile.jsx:85`)→ `export const Tile = React.memo(function Tile(...) {...})`。props 全是原始值/稳定回调后,默认浅比较即可。
   - `GridSlot`(`GridSlot.jsx:6`)→ `React.memo`。`tile`(string)、`isSelected`(bool)、`canDnD`(bool)、`isValid` 相关(`validTiles`/`highlightTiles`)。注意 `validTiles` 是数组(`GridContainer.jsx:30,57`):只在 `highlightTiles` 为 true 时用(`GridSlot.jsx:23-24`)。为不击穿 memo,**把 `isValid` 也上提到 `GridContainer` 计算**(`highlightTiles ? validTiles.indexOf(tile)!==-1 : undefined`),下传布尔/undefined,移除 `validTiles`/`highlightTiles` 两个数组 prop 出 memo 边界。
   - `GridContainer`(`GridContainer.jsx:22`)→ `React.memo`。它的 props 多为稳定回调(见 4.3)+ `tiles2dArray`(每次 move 才变,合理)+ `selectedTiles`(用于内部算 isSelected,数组身份变会让 GridContainer 自己重渲染——可接受,因为选牌本就需要它重算成员;关键是 tick 时 selectedTiles 不变,故 tick 下 GridContainer 不渲染)。

> **效果界定:** memo 的收益靠「tick 时所有 props 引用不变」。4.1 让 tick 不再进 Board,4.2+4.3 让选牌只改变化的牌。两者缺一不可。

### 4.3 用 ref 稳定 tile 回调 — **S**

- `handleTileSelectionCb`(`Board.jsx:109-112`):
  - 删 `console.log(state)`(`Board.jsx:110`)。
  - 改为从 `stateRef.current`(`Board.jsx:54`)读 state,deps 降到 `[playerID]`(`G` 也可经一个 `gRef` 读 → deps `[]`)。新增 `const gRef = useRef(G); useEffect(()=>{gRef.current=G});`,回调内用 `gRef.current`、`stateRef.current`。
- `handleLongPressCb`(`Board.jsx:113-115`):同样改用 `gRef.current`,deps 降到 `[]`(`longPressTimeoutId` 是 ref,稳定)。
- `moveTilesUseCb`(`Board.jsx:106-108`)deps `[moves]`:`moves` 身份是否稳定?boardgame.io 每帧可能给新 `moves` 对象 → **待核实**。若不稳,用 `movesRef` 包一层使 deps `[]`。这条对 WS-3 resolver 接入也有用。
- `onTileDragEnd`(`Board.jsx:117-119`)、`onLongPressMouseUp`(`Board.jsx:121-126`)已基本稳定,确认 deps 为 `[]`/`[ref]` 即可。

### 4.4 移除生产 console + 构建期 drop — **S**

- `vite.config.js`:在 `defineConfig` 返回对象加 `esbuild: { drop: ['console', 'debugger'] }`(加在 `return {plugins:[...]}` 同级,`vite.config.js:8-19`)。
- 显式删源码日志(即使被 drop,也避免误读 / 序列化开销):`Board.jsx:27`、`Board.jsx:110`、`useTurnTimer.jsx:16`;顺手清理 `Board.jsx:32` 'ALL PLAYERS JOINED'、`Board.jsx:122` console.debug、`moves.js` 大量 `console.debug`(`moves.js:108` 等)非必需。
- **注意:** `drop:['console']` 会去掉所有 `console.*`,含服务端?——`vite.config` 只管前端 build,`src/server.js` 由 node 跑不受影响,安全。**待核实:** 是否有依赖 `console` 副作用的代码(无)。

### 4.5 聊天 blur → 纯色背景 — **S**

- `chat.css:19-21`:删 `backdrop-filter: blur(4px)` 与 `-webkit-backdrop-filter`,把 `:19` 背景从 `rgba(244,234,210,.58)` 提到 `rgba(244,234,210,.92)`。理由见 review-4 Finding 5:blur 在不断重绘的棋盘上每帧重采样,移动端 GPU 最贵合成操作之一。
- 可选:仅在 chat focus/展开时才开 blur(配合 WS-7 的 FAB 折叠,narrow 下默认不展开 → 默认无 blur)。

### WS-4 测试方法

- **dev-only render 计数器(生产被 drop):** 新增 `src/rummikub/devRenderCounter.js`:
  ```js
  export const __renderCounts = {};
  export function countRender(name){ if (process.env.NODE_ENV!=='production'){ __renderCounts[name]=(__renderCounts[name]||0)+1; } }
  ```
  在 `GridContainer`/`GridSlot`/`Tile`/`RummikubBoard` 函数体首行调 `countRender('GridContainer')` 等。`process.env.NODE_ENV==='production'` 分支在生产被 esbuild 常量折叠 + `drop` 清掉。
- **jest + RTL(`@jest-environment jsdom` docblock):** 新增 `src/tests/board-render-perf.test.jsx`:
  1. 渲染一个最小 `<RummikubBoard>`(mock `G`/`ctx`/`moves`,固定一个 `timerExpireAt`);记录初始 `__renderCounts`。
  2. **tick 断言:** 用 `jest.useFakeTimers()` 推进 ≥1 个 watcher tick,断言 `__renderCounts.GridContainer` 未增加(Board 不随 tick 渲染)。
  3. **选牌断言:** `userEvent.click` 一张牌,断言只有该牌(+原选中牌,若有)对应的 `Tile` 计数 +1,而非全部 ~330 个;断言 `GridContainer` 至多 +1(自身因 selectedTiles 变化重渲一次,但其子 `GridSlot` 中未变化者计数不增)。
  - **关键校验点:** 选 1 张牌后,`Object.values(__renderCounts)` 里 `Tile` 增量 ≤ 2,不是 ~330。
- **Playwright(solo,生产 bundle):** 扩展/新增 `scripts/smoke-frontend.mjs`:
  - 监听 `page.on('console')`,在你的回合 idle ~5s,断言**无任何 `console.log`**、无 'RENDER BOARD'、无每 tick 数字日志。
  - 抓取 `build/assets/index-*.js` 文本,grep 断言不含 `console.log(`(允许极少量第三方残留则用更精确匹配,如不含 `'RENDER BOARD'`)。
- **回归:** `npm test` 全绿;`scripts/smoke-touch.mjs`、`smoke-multiplayer.mjs`、`smoke-timer.mjs` 仍绿(`smoke-timer` 会受 4.1 改动影响,需同步更新断言:从「数字逐 tick 变」改为「环 CSS 动画存在 + 到点自动结束回合」)。

---

## WS-3 — 可读棋盘 + `resolveDropSlot` 纯函数(Effort: M)

### 3.1 纯函数签名与行为

新增到 `src/rummikub/dndUtil.js`(与 `parseSlotId`/`orderTilesBySource` 同文件,便于 jest 直接 import):

```
resolveDropSlot(pointerRect, gridRect, occupancy, selectionLength) -> { gridId, col, row } | null
```

- **入参:**
  - `pointerRect`:拖拽落点矩形(`onDragEnd` 的 `e.over.rect` 或指针位置;**待核实** dnd-kit 提供的具体形状,可能需用 `e.over.id` 已给的 `col/row` 作为「最近 slot」起点,再做 occupancy 校验)。
  - `gridRect`:目标 grid 的边界 + 列宽/行高,用于把 pointer 映射到 `(col,row)`。
  - `occupancy`:`Set`/二维布尔,标记每个 `(col,row)` 是否已被占(从 `buildGridsFromTilePositions` 的结果或 `G.tilePositions` 派生)。
  - `selectionLength`:本次落子的牌数(单选=1)。
- **行为:**
  - **单选(`selectionLength===1`):** 吸附到最近的**空**格;若指针所在格已占,向同行就近找空格;返回该 `(col,row)`。spec 接受「偏移 < 半格仍提交」。
  - **多选(`selectionLength>1`):** 要求从某起点 `col0` 起、同一 `row` 上有 `selectionLength` 个**连续空格**(`col0 .. col0+selectionLength-1` 全空)。以最近的合法连续区间为准;**若任何候选区间都不足,返回 `null`(整体拒绝,不部分落子)**。
  - 越界(超出 `cols`/`rows`)返回 `null`。

### 3.2 接入点(在 `moveTiles` 之前)

- `Board.jsx:92-100` `onDragEnd`:在 `moves.moveTiles(col, row, gridId, {id}, selectedTiles)`(`Board.jsx:97`)**之前**插入:
  ```js
  const sel = stateRef.current.selectedTiles;
  const len = sel.includes(id) ? sel.length : 1;
  const occ = buildOccupancy(G.tilePositions, gridId); // 从 util 派生
  const slot = resolveDropSlot(pointerRect, gridRect, occ, len);
  if (!slot) { play('error'?); setState({selectedTiles:[],lastSelectedTileId:null}); return; } // 拒绝,不落子
  moves.moveTiles(slot.col, slot.row, slot.gridId, {id}, sel);
  ```
- **保持 `moveTiles` 契约不变**(`moves.js:114-124` 仍按 `col+index` 放置):resolver 只负责「算出合法起点 / 拒绝」,不改 server move。
- `gridRect`/`pointerRect` 获取:`e.over.rect`(dnd-kit DroppableRect)+ `e.active.rect.current.translated`。**待核实** dnd-kit 6.x 字段名,需在实现时打印验证。若取不到精确 rect,降级方案:用 `parseSlotId(e.over.id)` 给的 `(col,row)` 作为吸附起点,occupancy 校验连续性即可满足 spec 验收(spec 验收只要求「最近空格 + 连续性拒绝」,不强依赖像素 rect)。
- **拖拽起始高亮空格:** `onDragStart`(`Board.jsx:87-91`)时设一个 `draggingSelLen` state,`GridSlot` 空格(`GridSlot.jsx:40-43`)在拖拽中加一个 `.drop-target` class(CSS `rgba(255,255,255,.06)` 描边),让玩家看到可落点。注意这会让空 slot 在拖拽时重渲一次(可接受,拖拽期一次性)。

### 3.3 棋盘可读性(CSS only,低风险)

- `.ref`/`.grid-container`(`Board.jsx:224` 的 `.ref` 容器、`GridContainer.jsx:15` 的 `.grid-container`):加 brass 1px inner border + `--felt-vignette` inset shadow + 居中 `max-width`(全部在 `board.css`,无 JSX 改动)。
- 恢复极淡网格线:`.grid-item`(`GridSlot.jsx:27,43`)加 `rgba(255,255,255,.04)` 的 `box-shadow`/`outline` 列分隔。

### WS-3 测试方法

- **jest(`src/tests/resolve-drop-slot.test.js`,node 环境,纯函数):**
  - 单牌落到含空格区域 → 吸附最近空格。
  - 3 牌选区落到只有 2 连续空格的区域 → 返回 `null`(断言 `moveTiles` 不被调,棋盘不变)。
  - 3 牌落到 3 连续空格 → 返回起点,`col..col+2` 连续。
  - 越界 → `null`。
- **Playwright(solo):** 拖拽中空 `.grid-item` 出现可见 `.drop-target` 标记;单牌偏移 < 半格仍提交(Undo 变可用,`Board.jsx:207` undoBut disabled 解除)。
- **回归:** `scripts/preview/multidrag-check.mjs`、`smoke-touch.mjs`、`multi-drag-order.test.js`、`order-tiles-by-source.test.js` 仍绿。

---

## WS-13 — bundle 拆分 / lazy(Effort: M)

### 13.1 `manualChunks` 拆 vendor / boardgame.io — **S**

- `vite.config.js` 返回对象加:
  ```js
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'boardgame': ['boardgame.io', 'boardgame.io/react', 'boardgame.io/multiplayer'],
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-fx': ['canvas-confetti'],
        },
      },
    },
  },
  ```
  注意:已有 `buildPathPlugin`(`vite.config.js:107-121`)通过插件设 `build.outDir`,manualChunks 应直接写进主 config 的 `build`(与 plugin 返回的 `build` 会被 Vite 合并;**待核实**合并不冲突,必要时把 manualChunks 也做成一个 plugin 的 `config` 返回以保持风格一致)。

### 13.2 lodash 按方法引入 — **S**

- `Board.jsx:24` `import _ from "lodash"` → 改为 `import every from "lodash/every"`;`Board.jsx:31,262` 的 `_.every(...)` → `every(...)`。全仓仅这 2 处用 lodash(已 grep)。可彻底移除默认整包导入。
- **可选:** `_.every(matchData, item=>item.name)` 可用原生 `matchData.every(...)` 替代,连 lodash 依赖都省掉(需确认 `matchData` 总是数组;`Board.jsx:262` 已 `(matchData||[])`)。**推荐**直接去 lodash。

### 13.3 `React.lazy` 重组件 — **S/M**

- `GameOverModal`(`Board.jsx:17` import、`Board.jsx:319-325` 用):`const GameOverModal = React.lazy(()=>import('./GameOverModal'))`,用 `<Suspense fallback={null}>` 包裹(仅 `ctx.gameover` 时挂载,延迟加载无感)。
- `ComboOverlay`(`Board.jsx:22`、`Board.jsx:329`):同样 lazy + Suspense;它 `combo<2` 时返回 null(`ComboOverlay.jsx:5`),首屏不需要。
- **confetti:** `effects.js:1` 顶层静态 import `canvas-confetti` → 改为在 `burstAt`(`effects.js:12`)内 `await import('canvas-confetti')` 动态加载(首次有效 submit 才拉),使 confetti 进独立 chunk 且不进首屏。注意 `burstAt` 当前是同步函数,改 async 需确认调用方(`Board.jsx:79`)不依赖返回值(不依赖,fire-and-forget,安全)。
- **效果界定:** lazy 后主 chunk 应明显变小(spec 验收:emit >1 chunk + 主 chunk 可测量缩小)。

### 13.4 去 bootstrap / react-bootstrap — **S**

- 已 grep 确认:**无任何 `react-bootstrap` 组件被 import**;`bootstrap` 仅 `index.jsx:5` 引 CSS。
- 行动:删 `index.jsx:5` 的 `import 'bootstrap/dist/css/bootstrap.min.css'`(先视觉回归确认无样式依赖——`board.css:385` 注释提到曾用 bootstrap orange,说明已自定义替代),从 `package.json` 移除 `bootstrap`、`react-bootstrap`。
- **风险/待核实:** landing page / 非对局页面是否裸用 bootstrap class(需 grep `className=.*\b(btn|col-|row|container-fluid)\b` 全仓确认);若有少量,迁到自有 CSS 后再删。

### WS-13 测试方法

- `npm run build` 后断言 `build/assets/` 下 **>1 个 JS chunk**,且主 `index-*.js` 体积较基线下降(脚本 `ls -la build/assets/*.js | awk`)。
- Playwright:首屏 `networkidle` 后断言 `GameOverModal`/confetti 的 chunk 未被请求(`page.on('request')` 过滤);进入 gameover 后才请求。
- 删 bootstrap 后 `smoke-frontend.mjs` 仍绿(rootChildren≥1、无 console error)、视觉无塌陷(对比 `screenshots/`)。

---

## WS-2 — 首次引导(Effort: M)

**落点(新增组件,不改对局核心):**
- 新增 `src/rummikub/components/HowToPlayModal.jsx`:静态内容(目标、draw vs meld、run/set 定义、≥30 首出、joker、计时器),无后端。
- 导航栏加持久「How to play」按钮触发它。**待核实** navbar 组件位置(grep `navbar`/`Navbar`/顶栏组件;可能在 `src/` 根布局而非 `rummikub/`)。
- 新增 `src/rummikub/components/FirstTurnCoach.jsx`:一次性可关闭 coach card,`localStorage` flag(如 `rc_seen_coach`);文案「你的第一手必须 ≥30 分」。挂在 `Board.jsx` `return` 顶部、`playersJoin` 结束后首回合显示。
- joker 标注:`Tile.jsx:30` 渲染 `faSmileBeam` 处加 `title="Joker (wildcard)"` / long-press 提示(复用 `handleLongPressCb`)。
- **最小路径:** 纯展示组件 + 一个 localStorage 标志,零 game-state 改动。**依赖:** 文案与 WS-1(submit 拒绝原因)、WS-5(计时文案)保持一致 → 跨专业依赖。
- **测试:** RTL 断言 modal 内含「≥30」「run」「set」「joker」关键字;coach card 首次显示、关闭后置 localStorage、二次不显示。Playwright:点 How to play 出现 modal;无 pageerror。

---

## WS-6 — 等候室(已提级 P0,Effort: M)

**落点:**
- 新增 `src/rummikub/components/WaitingOverlay.jsx`:`ctx.phase === 'playersJoin'`(`Board.jsx:31` 已有该判断)时覆盖一层:"Waiting for players — {joined} of {n} joined" + spinner;显示 room code(`matchID`)+ 大号 Copy-link 按钮;dim/disable 棋盘。
- 在 `Board.jsx` `return` 内,`ctx.phase==='playersJoin'` 时渲染 `<WaitingOverlay joined={...} n={ctx.numPlayers} matchID={matchID}/>`,并给 `.board` 加 `.board-disabled` class(CSS `pointer-events:none` + 降透明)。
- joined 计算复用 `Board.jsx:262` 的 `allJoined` 逻辑:`(matchData||[]).filter(m=>m.name).length`。
- 邀请面板文案改「Need more players? Share this room」。**待核实** 现有邀请面板组件(可能在 `Sidebar`,`Board.jsx:270-278`)。
- **最小路径:** 一个覆盖层组件 + 一个 disabled class,棋盘已有 phase 信息无需新 state。
- **测试:** Playwright:新建 2 人房显示「1 of 2」、棋盘 `pointer-events:none`;第二人加入后 overlay 消失、可交互。RTL 单测 overlay 文案随 joined/n 变化。

---

## WS-7 — 移动端(Effort: M-L)

**落点(多为 CSS + 少量结构):**
- **rack 横向滚动 / auto-fit:** `handGrid`(`Board.jsx:244-260`)外层在 ≤480px 下 `overflow-x:auto` + `scroll-snap`;`GridContainer` 的 `.grid-container`(`GridContainer.jsx:15-19`)在 narrow 下不缩列宽而是允许横向滚动,保证 390px 下所有手牌可达。**待核实** `colWidth=2.2vw`(`GridContainer.jsx:41`)在 390px 是否导致 22 列溢出(22×2.2vw≈48vw,理论不溢;但 review/spec 报告有「clipped rack tile」→ 实测确认)。
- **chat 折叠 FAB:** 改 `ChatPanel.jsx`:narrow 下默认收起为一个可点气泡,展开才显示面板(配合 WS-4.5 默认无 blur)。新增 `isExpanded` state + CSS media query。
- **HUD z-index / 预留行:** 确保 tiles-left / invite HUD(`Sidebar`)不被 chat 盖住:chat 面板 `z-index` 与 HUD 分层 + 顶部预留一行。
- **座位 avatar 不裁切:** `TableSeats`/`PlayerAvatar` 在 narrow 下缩放定位。
- **控制行上移:** spec 指出 `.board` `min-height:100vh` + grid 固定高把 Sort/Draw/Submit/Undo/Redo(`Board.jsx:332-351`)挤到屏底。cap 棋盘高度 + 为 rack 预留空间,使控制行在 768px 笔记本与移动端都在视口内(CSS,改 `board.css` 的 `.board` 高度策略)。
- **测试:** Playwright 390×844:每张手牌在可滚动 rack 内(无裁切)、chat 不压「Tiles left」HUD、无 pageerror。

---

## WS-14 — tap-to-place(Effort: M-L)

**落点(复用现有选择 + move 链路):**
- 现已有 tap 选牌(`Tile.jsx:88-90` → `handleTileSelectionCb` → `boardUtil.handleTileSelection`)。WS-14 加「tap 牌 → tap 目标空格落子」的非拖拽模式。
- 实现:`GridSlot` 空格(`GridSlot.jsx:40-43`)加 `onClick`:若当前有 `selectedTiles` 且该格为空,调用与 `onDragEnd` 相同的落子路径——**复用 WS-3 的 `resolveDropSlot`**(以该 slot 的 `(col,row)` 为起点做连续性校验)+ `moves.moveTiles`。
- 需要一个 `placementMode` 概念:有选中牌时,空格显示可落高亮(复用 WS-3 的 `.drop-target`),tap 即落。键盘路径(cursor + Enter)作为后续增量:空格 `tabIndex`/方向键移动 cursor、Enter 落子。
- **依赖:** 强依赖 WS-3 `resolveDropSlot`(连续性 / 拒绝逻辑共享);依赖 WS-4.3 稳定回调(否则每次 tap 重渲整盘)。
- **最小路径:** 先做「tap 选牌 → tap 空格落子」,键盘 cursor 留作 follow-up。
- **测试:** Playwright:两次 tap(选牌→空格)完成落子,无拖拽;多选时落到不足连续空格被拒。

---

## 统一测试方法汇总

1. **dev-only render 计数器**(`src/rummikub/devRenderCounter.js`,`process.env.NODE_ENV!=='production'` 守卫 → 生产被 `esbuild drop` + 常量折叠移除)。
2. **jest/RTL**(新增 `*.test.jsx` 带 `@jest-environment jsdom` docblock,因 `jest.config.cjs` 默认 node):
   - tick 不重渲 `GridContainer`(fake timers 推进 watcher,断言计数不增)。
   - 选 1 张牌:`Tile` 重渲增量 ≤2,非 ~330。
3. **jest 纯函数**(node 环境):`resolveDropSlot` 单/多选 + 拒绝 + 越界。
4. **Playwright(solo)**:生产 bundle grep 无 `console.log` / 'RENDER BOARD';idle 5s 无 tick 日志;拖拽空格高亮;首屏不加载 lazy chunk。
5. **回归全绿**:`npm test`;`smoke-frontend/multiplayer/touch/timer/reconnect`(`smoke-timer` 需随 WS-4.1 更新断言)。

---

## 工作量 / 依赖 / 开放问题

| 项 | 工作量 | 依赖 | 开放问题 |
| --- | --- | --- | --- |
| WS-4.1 计时解耦(CSS 环 + watcher) | S/M | 与 WS-5「环中心秒数」需协调 | CSS `stroke` 颜色动画在 Safari 的表现;reduced-motion 退化 |
| WS-4.2 memo + isSelected/isValid 上提 | M | 依赖 4.3 稳定回调才生效 | `hoverPosition` 是否为死 prop(疑似,待核实) |
| WS-4.3 ref 稳定回调 | S | — | `moves` 对象身份是否每帧变(待核实,影响 deps) |
| WS-4.4 console drop | S | — | `build.esbuild.drop` 与现有 plugin config 合并无冲突 |
| WS-4.5 chat blur 去除 | S | 与 WS-7 FAB 折叠协同 | — |
| WS-3 resolveDropSlot | M | 被 WS-14 复用 | dnd-kit 6.x `e.over.rect`/`active.rect` 字段(待核实,有降级方案) |
| WS-13 拆包/lazy/去 bootstrap | M | — | 全仓是否裸用 bootstrap class(待核实);`burstAt` 改 async 调用方安全(已确认) |
| WS-2 引导 | M | 文案对齐 WS-1/WS-5 | navbar 组件位置(待核实) |
| WS-6 等候室 | M | — | 邀请面板组件位置(疑在 Sidebar,待核实) |
| WS-7 移动端 | M-L | 与 WS-4.5 协同 | 390px 实际溢出点需实测 |
| WS-14 tap-to-place | M-L | 强依赖 WS-3、WS-4.3 | 键盘 cursor 路径是否本期做 |

### 跨专业依赖(需与其他角色对齐)
- **WS-4.1 ↔ WS-5(UX):** 纯 CSS 环无法零渲染显秒数;需用独立 `<TurnSeconds>` 叶子组件承载逐秒数字。设计需确认「环 + 中心秒数」的视觉与降级。
- **WS-3 ↔ WS-14 ↔ UI:** `resolveDropSlot` 的连续性 / 拒绝逻辑是拖拽与 tap-to-place 的共享内核;空格高亮样式需 UI 角色给 token(`--felt-vignette`、`.drop-target` 颜色)。
- **WS-2/WS-6 文案 ↔ WS-1(后端 submit 拒绝原因):** 引导与等候室文案须与 server-authoritative 的 `submitRejectReason` 码表一致。
- **WS-13 manualChunks ↔ DevOps:** 拆包后部署 `build/` 产物结构变化(多 chunk),需确认 `deploy.sh`/Dockerfile 不硬编码单 chunk 名。

### 总体开放问题
1. CSS 计时环的颜色过渡 + reduced-motion 退化方案需 UI 确认。
2. dnd-kit rect 字段名需实现时打印验证;已备「用 `e.over.id` 的 col/row 吸附」降级。
3. `moves` 回调身份稳定性需运行时确认,决定 ref 包装范围。
4. bootstrap class 是否在非对局页裸用,决定能否直接删依赖。
5. WS-14 键盘 cursor 是否纳入本期范围(建议拆为 follow-up)。
