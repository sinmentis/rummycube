# Round-4 机制与手感评审（Game Design 视角 · review-1）

> 评审对象：`docs/optimization/2026-06-25-round4-spec.md`（WS-A…WS-F）。
> 深聚焦：**WS-E 挤位留缝**（机制正确性 vs 玩家心智模型）；其次 WS-A/B 取牌手感、WS-D 落点提示、WS-F 超时反馈。
> 方法：所有判断都对照真实代码与真实几何输出（已用 `node` 跑 `insertWithPush` + `extractSeqs` 列切分逻辑验证，见各用例「实测」标注）。
> 约束沿用 spec：服务器权威/anti-cheat 不动；`insertPush.js` 维持「只读几何、不读牌面数值/颜色」契约；动画 `prefers-reduced-motion` 门控 + 第二通道。

---

## 0. 结论速览（TL;DR）

**WS-E 判决：spec 的「桥接」启发式方向正确，可落地，但有两处必须在实现前钉死，否则会把 bug 换个地方复现。**
1. **判别器是「目标格类型」而非牌面数值——正确**：看板用「空列」做组分隔（`extractSeqs` 见 §1），单格空列即足够分隔；落在**两组之间的空格**＝「延长左组 + 推开右组、留 1 缝」，落在**被占格**＝「组内插入、保持相连」。这与直接操纵（你把牌丢在哪）的直觉一致，比任何读数值的启发式都更可预测。
2. **触发条件必须是「dropped block 左右邻列都被占」**（`occ(T-1) && occ(T+N)`），缺一不可——只贴左是「向左延长」（要相连，不留缝）、只贴右是「向左追加到右组头」（同样不留缝）。
3. **留缝方向只能向右开（推右组），开不动就 `reject`（弹回），绝不退回「在空格 T 原地落子」**——后者正是原 bug。spec 里「退回吸附」一词有歧义，**必须实现为 reject/bounce**（§2.3）。

**A/B/D/F 一句话：**
- **WS-A 取牌节奏**：首发 250ms 保留（防误触/防拖拽），但**逐张 step 应从 250ms 降到 ~180ms**——否则第 2 张要等满 500ms（250 arm + 250 step），手感拖。
- **WS-B 拿起动画**：`translateY(-6px) scale(1.04)` 量级合适（介于 `tile-celebrate` 与 `tile-lift` 之间）；**累积的逐张抬起靠 tick 节奏天然错峰，不要再加 CSS animation-delay**（会叠加成延迟感）；过渡时长 < step 间隔。
- **WS-D 落点提示**：把 `isOver` 那块**实色绿 `rgba(71,179,86,.43)` 改为克制的半透明 `.slot-over`**（填充 < .3 + 细描边，读作「可以放这」而非警报）；board-only 作用域能去掉整片手牌格噪声且不损失「点桌面落子」的可发现性。
- **WS-F 超时反馈**：现有 `G.lastTimeout` toast 文案/可达性**已足够**（自己/他人/单人三态、含抽牌数、aria-live）；唯一要补的是**重试等待窗内别让「0」看起来卡死**（复用既有 timer-low-pulse / Syncing 提示，不新增组件）。bug 修复聚焦重试，反馈不扩范围。

---

## 1. WS-E 前置事实：看板如何切分组（回答 spec 点 #1）

`extractSeqs`（`src/rummikub/moveValidation.js:41-63`）按行扫描，关键判定在 **:51**：

```js
if (seq.length === 0 || col === cols[i - 1] + 1) {
    seq.push(tileId);          // 与前一格列号相差 1 → 同一序列
} else {
    seqs.push(seq); seq = [tileId];   // 出现空列 → 收束当前序列、另起一段
}
```

由此得到三条硬事实：

| 事实 | 含义 | 对 WS-E 的影响 |
|---|---|---|
| **任意空列（≥1）即组边界** | `col !== prevCol+1` 就断开 | 「留缝」是对的设计语言 |
| **单格空列已足够分隔** | 不需要 ≥2 格 | 桥接只需开**恰好 1 列**，不用更多 |
| **全连续 span 解析为「一条」序列** | `1234456` 列 0..6 全占 → `[1,2,3,4,4,5,6]` 一段 | 这条序列 `isSequenceValid` 为假（4 出现两次，run 在第二个 4 断裂）→ 整盘 `isBoardValid` 失败。**这就是 bug。** |

> **「留下恰好一个空列」与代码的分组语义精确吻合**：它是**最小**且**充分**的分隔。spec 点 #1 的设计前提成立。

**实测（当前 buggy 行为）**：`123_456`（列 `0,1,2 | gap3 | 4,5,6`）丢 `4`@T=3 →
`insertWithPush` 走 `free` 短路（`insertPush.js:21-23`）→ `{shifts:{}, newCols:[3]}` → 列 `0..6` 全占 → 切分得**一组 `[0..6]`**（非法）。已复现。

---

## 2. WS-E 机制设计（回答 spec 点 #2、#3）

### 2.1 玩家意图的二分，与「目标格类型」判别器

Rummikub 玩家把牌丢向桌面时，心里只有两种意图：

| 意图 | 例子 | 期望结果 | 玩家丢在哪 |
|---|---|---|---|
| **延长左组**（把这张接到某组尾，并与隔壁组分开） | `123_456` + `4` | `1234_456`（留缝） | 丢在**两组之间的空格** |
| **组内插入**（把这张塞进一段里，保持相连） | `1235` + `4` | `12345`（无缝） | 丢在**被占的格**（那个 `5` 上） |

**判别器＝目标格类型**，而不是牌面数值。理由（也是为什么这是「对的」player-intent split）：

- **它由直接操纵驱动**：结果只取决于「光标松开时压在空格还是压在牌上」，玩家看得见、可重复、可学习（"丢缝里＝分开，丢牌上＝塞进去"）。
- **读数值反而更差**：`4` 丢进 `123_456` 既可能想延长左组、也可能想另起。数值无法消歧，还会破坏 `insertPush.js` 的纯几何契约（`:1-5` 注释明示「never validates tile numbers or colors」）。
- **跨工作流协同**：WS-D 让桌面空格在拖拽时点亮成可见落点 → 玩家能**看见**那个「缝格」是一个独立 drop target，判别器的可感知性正好被 WS-D 加强。

### 2.2 边界用例枚举（哪些会让玩家意外，给出期望 vs 启发式实际）

下表每行都已用真实 `insertWithPush` + 列切分**实测**（0-indexed 列；`occ(c)` = 该列被占）。

| # | 场景（before） | drop (val,T,N) | 桥接触发? | 启发式结果 | 期望? | 备注 |
|---|---|---|---|---|---|---|
| 1 | `123_456` `0,1,2\|_\|4,5,6` | (4, **3**, 1) | ✅ `occ(2)&occ(4)` | `[0..3] [5..7]` = `1234_456` | ✅ 一致 | **owner 例**，右组 `456`→`567` |
| 2 | `1235` `0,1,2,3`（连续） | (4, **3**, 1) | ❌ 目标格被占 | 走碰撞 push → `12345` `[0..4]` | ✅ 一致 | 组内插入不回归（既有 `tryRight`） |
| 3 | `123__456`（2 宽缝） | (4, **3**, 1) | ❌ `occ(4)=false` | `[0..3] [5..7]` = `1234_456` | ✅ 一致 | 已分隔，不额外推；走 snap |
| 4 | `123__456`（2 宽缝） | (4, **4**, 1) | ❌ `occ(3)=false` | `[0..2] [4..7]` = `123_4456` | ⚠️ **意外** | 贴右组那格落子 → 与右组黏成 `4456`（非法）。见 §2.5 |
| 5 | `123__789`（2 宽缝） | ([4,5], **3**, 2) | ✅ `occ(2)&occ(5)` | `[0..4] [6..8]` = `12345_789` | ✅ 一致 | **多张桥接**：缝宽 ≥ N 即可 |
| 6 | `xyz_456` 贴右墙 `25,26,27\|_\|29,30,31` | (4, **28**, 1) | ✅ 但开不动 | `null` → **reject** | ✅ 一致 | 右推到 `32 > maxCol` → 弹回，**不黏连** |
| 7 | `abc_de_f` `24,25,26\|_\|28,29\|_\|31` | (x, **27**, 1) | ✅ | `[24..27] [29..31]` | ✅ 一致 | ripple 在内部空列处停：`d,e`28,29→29,30，`f`@31 不动 |
| 8 | `_234` `1,2,3`（左侧空） | (1, **0**, 1) | ❌ `occ(-1)=false` | `1234` `[0..3]` | ✅ 一致 | **向左延长**右组：要相连、不留缝 |
| 9 | `234_` `0,1,2` | (5, **3**, 1) | ❌ `occ(4)=false` | `2345` `[0..3]` | ✅ 一致 | **向右追加**：无右组可分隔，不触发 |

**结论**：除 #4 一处可记录的小 wart 外，桥接在所有「1 宽缝、两组之间」的核心场景（#1/#5/#6/#7）都给出玩家期望；并且正确地**不**在「向左延长 / 向右追加 / 组内插入」（#2/#8/#9）误触。

### 2.3 精确规则 + 两处改动（dispatch 路由 + 几何留缝）

**触发条件（桥接）**：`isBoard && [T,T+N) 全空(in-bounds) && occ(T-1) && occ(T+N)`
**留缝动作**：把从 `T+N` 起的连续 run 整体右移 1 列（ripple，遇空列停，越过 `maxCol` 失败）。
**失败语义**：开不动 → `insertWithPush` 返回 `null` → dispatch **reject（弹回）**。**绝不**在空格 `T` 原地落子。

> ⚠️ **钉死点（最重要）**：spec 点 #3 里「退回吸附」必须实现为 **reject**。
> 因为桥接时目标格 `T` 是**空**的，若退回 `resolveDropSlot` 的 snap，单张会优先选中空的 `T`（`dndUtil.js:69-71`）→ 又落在 `T` → 又黏成非法 merge＝**原 bug 复现**。
> 安全不变量：**桥接最坏只会「弹回」或「产出肉眼可见的非法盘」，绝不静默产出一个看起来合法实则黏连的盘**。

**(a) `insertPush.js` —— `free` 分支加桥接，并新增 `openSeparatorRight`：**

```js
export function insertWithPush(rowTiles, T, N, maxCol) {
    if (T < 0 || T + N - 1 > maxCol) return null;
    const asc = [...rowTiles].sort((a, b) => a.col - b.col);
    const occ = new Set(asc.map(t => t.col));
    let free = true;
    for (let c = T; c < T + N; c++) if (occ.has(c)) { free = false; break; }
    if (free) {
        // WS-E bridge: the dropped block fills the ONLY gap between a left and a
        // right run (both immediate neighbours occupied). A plain free placement
        // would fuse them into one (illegal) contiguous sequence, so re-open a
        // 1-col separator by rippling the right run one column right (stop at the
        // first gap). No room -> null, which the dispatch turns into a reject;
        // NEVER fall back to the plain free placement (that is the original bug).
        if (occ.has(T - 1) && occ.has(T + N)) {
            const shifts = openSeparatorRight(asc, T + N, maxCol);
            return shifts === null ? null : {shifts, newCols: cols(T, N)};
        }
        return {shifts: {}, newCols: cols(T, N)};
    }
    return tryRight(asc, T, N, maxCol) || tryLeft(asc, T, N, maxCol);
}

// Vacate column G by cascading the contiguous occupied run starting at G one
// column right, stopping at the first gap. Returns the shift map, or null if a
// tile would pass maxCol (INCLUSIVE). Same ripple shape as tryRight.
function openSeparatorRight(asc, G, maxCol) {
    const shifts = {}; let cursor = G + 1;
    for (const {tileId, col} of asc) {
        if (col < G) continue;
        if (col < cursor) { if (cursor > maxCol) return null; shifts[tileId] = cursor; cursor += 1; }
        else break;
    }
    return shifts;
}
```

**(b) `dndUtil.js` —— `resolveDropDispatch` 路由：原本只在「目标被占」push，现加桥接分支（`:222-229`）：**

```js
const inBounds = col >= 0 && col + N <= maxCols;
const runIsFree = inBounds && isRunFree(isOccupied, col, N, row, maxCols);
const occupiedInRun = inBounds && !runIsFree;
// WS-E: a free in-bounds span whose immediate left AND right neighbours are both
// occupied is plugging the only gap between two runs -> route to insert/push so
// insertWithPush re-opens a 1-col separator instead of fusing them.
const bridge = isBoard && runIsFree && isOccupied(col - 1, row) && isOccupied(col + N, row);
if (isBoard && (occupiedInRun || bridge)) {
    const rowTiles = boardRowTiles(tilePositions, row, sel);
    const plan = insertWithPush(rowTiles, col, N, boardCols - 1);
    if (!plan) return {kind: 'reject', args: []};
    return {kind: 'push', args: [col, row, BOARD_GRID_ID, {id: primaryId}, orderTilesBySource(sel, tilePositions)]};
}
```

**两点一致性保证（避免「dispatch 路由到 push 但几何又退回原地落子」的灾难）：**
- dispatch 的占用判定 `buildRowOccupancy(tilePositions, gridId, sel, playerID)` 与 `insertWithPush` 内部 `occ`（来自 `boardRowTiles(tilePositions,row,sel)`）**都排除了被拖的 `sel`**（`dndUtil.js:45-57` vs `:124-133`）→ 两边看到同一组占用列 → `isOccupied(T-1)&&isOccupied(T+N)` 与 `occ.has(T-1)&&occ.has(T+N)` **恒等**。
- 服务器 move `insertTilesWithPush` 也调用同一个 `insertWithPush`（`moves.js:160`）→ 改几何即同时改「客户端预览」与「服务器落子」，**单一事实源**，无需碰服务器守卫（满足 spec「服务器权威不动」）。校验仍延后到 submit（`isBoardValid`），桥接产出的 tmp 牌若非法（如玩家把 `7` 丢进 `123_456` 得 `1237_456`）会在 submit 被拒——与现有契约一致，无 anti-cheat 漏洞。

### 2.4 TDD 用例表（before → drop → after）

> 纯单测建议加在 `src/tests/insert-push.test.js`（几何）与 `src/tests/resolve-drop-dispatch.test.js`（路由）。
> `MAX = 31`（INCLUSIVE）；dispatch 侧 `boardCols = 32`（EXCLUSIVE）。下列 after 列号均已实测。

**几何层（`insertWithPush`）：**

| 用例 | rowTiles（id@col） | (T,N,maxCol) | 期望返回 | 期望组（after） |
|---|---|---|---|---|
| `bridge: owner 123_456 drop@gap` | a0 b1 c2 d4 e5 f6 | (3,1,31) | `{shifts:{d:5,e:6,f:7}, newCols:[3]}` | `[0..3] [5..7]` valid |
| `bridge: multi-tile fills 2-wide gap` | a0 b1 c2 g5 h6 i7 | (3,2,31) | `{shifts:{g:6,h:7,i:8}, newCols:[3,4]}` | `[0..4] [6..8]` valid |
| `bridge: ripple stops at inner gap` | a24 b25 c26 d28 e29 f31 | (27,1,31) | `{shifts:{d:29,e:30}, newCols:[27]}` | `[24..27] [29..31]` valid |
| `bridge: no room at right wall -> null` | a25 b26 c27 d29 e30 f31 | (28,1,31) | `null` | （reject，盘不变） |
| `not bridge: 2-wide gap, target T+N free` | a0 b1 c2 d5 e6 f7 | (3,1,31) | `{shifts:{}, newCols:[3]}` | `[0..3] [5..7]` valid |
| `not bridge: append left of a run (occ(T-1)=∅)` | b1 c2 d3 | (0,1,31) | `{shifts:{}, newCols:[0]}` | `[0..3]` contiguous valid |
| `not bridge: append right of a run (occ(T+N)=∅)` | a0 b1 c2 | (3,1,31) | `{shifts:{}, newCols:[3]}` | `[0..3]` contiguous valid |
| `within-run insert unchanged (occupied target)` | a0 b1 c2 e3 | (3,1,31) | `{shifts:{e:4}, newCols:[3]}` | `[0..4]` contiguous（无缝） |

**路由层（`resolveDropDispatch`）：**

| 用例 | 关键布局 | 期望 `kind` | 期望 `args` 要点 |
|---|---|---|---|
| `bridge -> push` | `123_456`，board 行；drop 单张 hand 牌@gap 列 | `push` | `[T,row,'b',{id},ordered]`；`insertWithPush` 给桥接 plan |
| `bridge no-room -> reject` | 右墙满、桥接开不动 | `reject` | `[]`（弹回 buzz） |
| `free non-bridge -> snap`（2 宽缝 / 远处空格） | 目标格空且非桥接 | `snap` | 落在目标列，**不**触发 push |
| `occupied run -> push`（既有不回归） | 目标格被占 | `push` | 同既有 `resolve-drop-dispatch` 绿测 |
| `hand grid never bridges` | 手牌行，左右皆占 | `snap` | push/桥接守卫仅限 `isBoard` |

**no-regression**：`src/tests/insert-push.test.js` 与 `resolve-drop-dispatch.test.js` 现有全部用例须保持绿（桥接只新增 `free && occ(T-1) && occ(T+N)` 这一窄分支，不改碰撞路径）。

### 2.5 已知 wart 与非目标（明示，便于 owner 拍板）

1. **用例 #4：≥2 宽缝里、贴着右组那一格落子** → `123_4456`（与右组黏成非法 `4456`）。
   - 为何不修：要修就得放宽触发条件到「只贴右也算桥接」，但那会和「向右追加要相连」（#9）直接冲突，几何无法两全。
   - 为何可接受：(a) 缝本身已是分隔，玩家很少特意往「贴右那格」丢；(b) 结果是**肉眼可见的非法红盘**、submit 也会拒，可立即重拖恢复；(c) 不违反安全不变量（非静默黏连）。
2. **丢在右组「第一张牌」上**（被占格）→ 走既有碰撞 push，新牌插到组头并把组推开 → `123_4456`（非法）。这是**既有语义**（目标是牌＝「在此插入并推开」），WS-E 不改它。同样可见可恢复。
3. **桥接只向右开缝**：不做「向左推左组」的镜像兜底。已验证向左镜像会让 dropped block 改贴右组、可能黏成非法 run（几何无法保证有效）。故「右开不动＝reject」是更可预测、更安全的选择。

---

## 3. WS-A / WS-B 取牌与拿起手感

### 3.1 WS-A 累积节奏：首发 vs step（回答「是否复合成 500ms」）

现状：`Tile.jsx:13` `LONG_PRESS_MS=250`，`:120-124` 一次性 `setTimeout` 起。spec 提议 `LONG_PRESS_STEP_MS=250`。

**会复合成 500ms：** `firstDelay=step=250` 时，第 1 张 @250ms，第 2 张 @**500ms**（250 arm + 250 step），第 3 张 @750ms……拿 5 张要 1.25s。第 2 张这个 500ms 是最伤手感的点（玩家已经在按，却要再等满一拍）。

**推荐：解耦两个常量。**

| 参数 | 值 | 理由（grounded） |
|---|---|---|
| 首发 arm | **保持 250ms** | 这是**防误触**窗口：要和「点按（click）」「真拖拽」区分，已与 `MOVE_CANCEL_PX=6` / dnd-kit activation 对齐（`Tile.jsx:11-14,131`）。调低会让普通点按误触取牌。 |
| 逐张 step | **降到 ~180ms**（带宽 150–200，`[PLACEHOLDER]` 待感测） | 首发后消歧成本已付清，后续 tick 不需要防误触守卫。250 太慢（5 张 1.25s 像节拍器）；180 时 5 张 ~970ms，读作顺滑的「向右拉链」。 |

**过冲（overshoot）权衡（量化）：** 人从「决定停」到「真松手」约 200–300ms。step=250 过冲 ~1 张；step=180 过冲 ~1–1.5 张；step<100 会「失控冲过头」。180 是速度/过冲的平衡点；过冲 1 张通常仍是玩家想要的整段 run，且可 ctrl-click 取消。

**可选 polish（不强制、记一笔）：** OS key-repeat 式加速（首步 ~220ms 渐快到 ~120ms）适合超长 run，但增加不可预测性，v1 不做。

实现要点（与既有机制共存）：一次性 `setTimeout` 改为 250ms 首发 + `setInterval(step)`；`firedRef` 一旦置真即吞 click（`Tile.jsx:136-142`）；pointer 移动 > 6px / up / cancel / leave 清掉定时器（`:127-134,151-154`）。序列耗尽后多余 tick 空转无害（spec 已定）。

### 3.2 WS-B 拿起动画：量级、错峰、别拖

**量级：** spec 的 `translateY(-6px) scale(1.04)` + 阴影 `0 8px 16px rgba(0,0,0,.35)` 合适。对照既有 token 建立**清晰层级**：

| 状态 | 变换 | 出处 |
|---|---|---|
| selected（本次新增） | `translateY(-6px) scale(1.04)`，阴影 .35 | 建议值 |
| celebrate（成组庆祝） | `translateY(-7px) scale(1.07)` | `board.css:1216-1217` |
| drag-lift（拖拽中） | `scale(1.1) rotate(-3deg)`，drop-shadow .5 | `board.css:1139-1142` |

层级读作 **select < celebrate < drag**——选中应当是三者里最克制的，spec 值正好落在这条线下沿（可在 -5～-6px、scale 1.03～1.05 内微调）。**记得抬 `z-index`**，否则被右邻牌盖住（选中牌往往整段相邻）。

**累积逐张抬起＝靠 tick 天然错峰，别加 CSS 延迟：** 每张进入 `selectedTiles` 时才挂 `.tile-selected`，而 WS-A 每 ~180ms 才并入下一张 → **抬起在时间上本就一张一拍地错峰**，玩家literally看着「拿起的牌堆向右长大」。若再在 CSS 上加 `animation-delay` 错峰，会和 tick 节奏**叠加**成可感延迟。

**别拖（量化护栏）：** 给 transform 配**短过渡**（~120ms ease-out）让每张抬起平滑但快；**过渡时长必须 < step 间隔**（step 180 → 过渡 ≤ 120；step 150 → ≤ 100），否则相邻两张的抬起动画重叠会「糊」。

**减动 & 第二通道：** transform/transition 包在 `@media (prefers-reduced-motion: no-preference)`；减动用户保留静态描边/底色（现状内联 `#c0c0c0` + 2px `#6416ff`，`Tile.jsx:67-71`）作为可辨选中态。spec 方案正确。注意 WS-B 让选中态由 className（`.tile-selected`）驱动，可顺手把 `getTileStyle` 里那段内联底色与之协调（避免内联 backgroundColor 盖过 CSS）。

---

## 4. WS-D 落点提示：从「警报绿」到「可以放这」

**现状（噪声来源）：**
- `.slot-valid`（`board.css:312-318`）：绿底 `rgba(120,200,130,.16)` + 2px 内环 `.55` + 12px 内辉光 `.28`——基础态其实**已经偏柔**。
- 真正刺眼的是 `isOver` 的**内联实色绿 `rgba(71,179,86,.43)`**（`GridSlot.jsx:53`）——近实色、高饱和，读作「GO/警报」。
- 提示对**所有** droppable 空格生效（含整片手牌格，`GridSlot.jsx:46`），拖拽时一大片闪烁。

**「可以放这」应当是邀请感，不是警报。** 视觉寄存器（register）的方向：

| 维度 | 警报（现 isOver） | 邀请（目标） |
|---|---|---|
| 不透明度 | 实色 ~.43 | 半透明 **< .3** |
| 边缘 | 实块填充 | **细描边/虚线**做「这里是落点」的指向 |
| 辉光 | 12px 内辉光（像脉冲警告） | 弱化或去掉 |
| 饱和度 | 高 | 低饱和、柔边 |

**推荐：**
1. 把 `isOver` 内联绿改为独立类 `.slot-over`，比 `.slot-valid` 稍强但仍克制（填充 ~.22–.26、内环略提、**仍半透明**），由 `GridSlot` 在 `isOver && board` 切换。
2. `.slot-valid` 维持/再调柔：低不透明填充 + 1.5px 细内描边（dropzone 惯例），辉光减弱。色相沿用 felt 的 brass-green（与 `board.css:314` 注释一致），只降饱和/不透明度。
3. **board-only 作用域**：把 `slot-valid` / `slot-over` 限定 `gridId === BOARD_GRID_ID`。

**确认：board-only 去噪且不损失可发现性。**
- 手牌格在拖拽时点亮**无意义**（手牌只是存放区，玩家不会策略性地「放进某个手牌格」），去掉这一整片闪烁后画面明显变安静。
- **tap-to-place 的主路径（点桌面空格落子＝出牌）仍点亮**，可发现性保留。
- `onCellTap` 行为不动（`GridSlot.jsx:47-49`、`Board.jsx:282-286`）——只是手牌空格不再挂提示类；真要点手牌空格回收，handler 仍在，且「选中抬起」已表明「我手里拿着牌」。唯一代价：用 tap（非拖拽）整理手牌时手牌格无视觉提示——属边缘操作，可接受（记一笔）。

验收建议加 CSS 源断言：`.slot-valid`/`.slot-over` 不透明度阈值、board-only 作用域、isOver 不再是内联实色绿。

---

## 5. WS-F 超时反馈：现有 toast 是否够

**够。** 强制抽牌真正落地时，`G.lastTimeout` → `TimeoutAnnouncement` → `timeoutToastText` 这套已经是**设计良好**的反馈：

- 三态文案齐全（`timeoutToastText.js:20-37`）：单人 `you auto-drew N tile(s)`、自己 `you drew N tiles, turn passed`、他人 `{name} drew N, turn passed`；`drawCount` 是真实 pool delta（首meld前 1 / 后 2 / 保留 0）。
- 全客户端可见（走 `playerView`）、`role="status"`、自己 `aria-live="assertive"`（`TimeoutAnnouncement.jsx:36`）→ 读屏可达。
- 自己 dwell 4500ms / 他人 3000ms（`Board.jsx:432-440`）、gameover 抑制——细节到位。
- **幂等**：`forceEndTurn` 只在 deadline 守卫通过后写一次 `lastTimeout`（`moves.js:212,228`）；重试副本落到已推进的新回合会被守卫拒（`INVALID_MOVE` 丢弃，不重复写）；toast 又按 `id` 去重（`TimeoutAnnouncement.jsx:21-23`）→ **一次超时＝一条 toast**。`onTurnBegin` 过一整回合才清旧 transient（`moves.js:522-523`），避免渲染前被擦掉。

**唯一值得补、且严格不扩范围的一点：重试等待窗内别让「0」看起来卡死。**
- WS-F 修复引入新的感知缝隙：本地 deadline 到 0 → 服务器（因时钟偏移）拒首发 → 等下一次 `REFIRE_INTERVAL_MS≈1500` 重试被接受，这中间最多 ~1.5–3s 玩家盯着「0」没动静。toast 在服务器**接受**那刻才弹（正确时机）。
- 建议（复用既有、不新增组件）：让 timer ring 的「0」保留既有 `timer-low-pulse`（`board.css:1277-1286`，已减动门控）以示「在走、没冻」；或复用 `Syncing…` connection-cue 模式覆盖这段。authoritative toast 仍在真正抽牌时落地。
- **不做**：不要为这段加新的「正在重试…」文案/弹窗——bug 修复的核心是「重试 + slack」让回合必定推进（`TurnDeadlineWatcher.jsx:25-29` 现在单发即 `clearInterval`，这正是卡 0 根因），反馈侧保持克制即可。

---

## 6. 跨工作流协同 & 风险小结

- **WS-E ⨯ WS-D**：桥接判别器依赖玩家「看见缝格是独立落点」，WS-D 的 board-only 柔提示正好让那个空格在拖拽时可见可瞄——两者相互成全，建议同批验收时一起看「丢进缝里」的端到端手感。
- **WS-A ⨯ WS-B**：取牌 tick 节奏（180ms）即是拿起动画的天然错峰源；两者耦合，建议一并落、一并感测（过渡时长 < step）。
- **风险**：
  - WS-E：中。纯几何、可测；**唯一高危点是「退回吸附」被实现成 snap-at-T**（复现 bug）——已在 §2.3 钉死为 reject，务必在 PR review 卡这条。
  - WS-A/B/D：低（计时 + className + CSS）。
  - WS-F：低-中（纯客户端；测重复发幂等 + 跨回合不泄漏）。
- **基线**：`npx jest` 全绿（新增桥接/路由用例 + CSS 源断言）、`npm run build` 无新 `console.log`、`node src/server.js` 启动 `/games == ["RummyCube"]`。所有数值（180ms step、-6px/1.04、`.slot-over` 不透明度）标 `[PLACEHOLDER]`，feel-test 后定稿。

---

### 附：关键文件锚点
- 分组语义：`moveValidation.js:41-63`（`:51` 是断组判定）、`isBoardValid` `:69-77`
- 几何：`insertPush.js:17-45`（`:21-23` free 短路）
- 路由：`dndUtil.js:201-236`（`:222-229` push 守卫）
- 服务器 move 复用几何：`moves.js:150-188`（`:160`）
- 超时链：`moves.js:206-229`（forceEndTurn）/`:483-527`（onTurnBegin）、`TurnDeadlineWatcher.jsx`、`TimeoutAnnouncement.jsx`、`timeoutToastText.js`
- 取牌/拿起：`Tile.jsx:13,115-156`、`board.css:1138-1162,1201-1218`
- 落点提示：`GridSlot.jsx:46-54`、`board.css:312-324`
