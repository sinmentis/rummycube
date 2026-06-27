# 跨行搬家空间管理 — 设计文档(自动整理引擎 第二份)

**日期:** 2026-06-27
**状态:** 设计已确认,待写实现计划
**前置:** 自动整理引擎第一份(核心引擎)已上线(`src/rummikub/arrange/`)。本文档实现主 spec `2026-06-27-auto-arrange-design.md` 的 **§6.4 空间管理**(连锁版),并补上 §10 的 worked example **#9**(目前被第一份延后)。
**范围:** 第二步。第三步(不滚动自适应缩放)仍单独。

## 目标

第一份引擎里,当一次落牌的整理需要的列数超出本行**空闲窗口**(到最近的同行旁观块、留 1 空列)时,直接 `reject`(弹回)。本文档把这个 reject 升级为 §6.4 的**空间管理**:横向平移挡路的完整块 → 跨行搬家 → 允许连锁 → 方向朝牌桌中心 → 只有整盘都塞不下才拒绝。**绝不拆或重排任何块**,只整体搬动;玩家正在落牌的那一簇留在原行展开。

## 背景 —— 现状与接缝

- `arrangeBoard(tilePositions, drop)`(index.js):`identifyCluster` → `partitionCluster` → `freeWindow`(本行不撞邻居的列区间)→ `layoutCluster`;`layoutCluster` 放不下 `freeWindow` 时返回 `{reject:true}` → `arrangeBoard` 返回 `{ok:false}`。
- **move 已支持任意 `{row,col}` placements**(`insertTilesWithPush` 应用 `result.placements` 时直接读 `nr,nc`)。所以跨行搬家**纯粹是引擎改动** —— `arrangeBoard` 只要在 placements 里额外返回「被搬动的旁观块的新位置」,move 不动。
- 这是**纯函数、DOM-free、确定性**的内核(客户端乐观 == 服务端权威)。

## 核心术语:块(block)

把牌桌每行扫一遍,每段**连续占用的列**(col 连续无空隙)是一个 **block**:`{tiles: tileId[], row, start, width}`(`start`=最左列,`width`=tile 数,占 `[start, start+width-1]`)。block 不区分合法/半成品 —— **整体搬动即可,永不拆**,所以"绝不拆牌"对所有牌成立。簇(cluster)是被落牌碰到的那一(几)个 block,由第一份引擎单独处理;空间管理处理**其余所有 block**。

## §A 触发与流程(`arrangeBoard` 改动)

**常见路径不变**:先按第一份的逻辑 `layoutCluster` 进 `freeWindow`。**放得下 → 原样返回,不触发任何搬家**(零额外抖动)。

**仅当 `layoutCluster` 会 reject(簇需要的列超出本行空闲窗口)时**,走空间管理:

1. **把簇重排进整行**(不再受 `freeWindow` 限制,因为同行邻居会被搬走):用整行 `[0, BOARD_COLS-1]` 作 bounds 调 `layoutCluster`,得到簇的 `cols` 与占用 span `[clStart, clEnd]`、宽度 `W`。锚定:`dropSide==='right'` → 左缘贴 `clamp(span.left, 0, BOARD_COLS-W)`,向右生长;`'left'` → 右缘贴 `clamp(span.right, W-1, BOARD_COLS-1)`,向左生长。若 `W > BOARD_COLS` → **reject**(簇本身比整行还宽,几乎不可能)。
2. **收集其余所有 block**(全board 每行的连续段,**排除簇内 tile**)。
3. 调 `relocateForCluster(otherBlocks, {row: clRow, start: clStart, end: clEnd}, BOARD_ROWS, BOARD_COLS)`(§B)→ `{placements}` 或 `{reject:true}`。
4. reject → `arrangeBoard` 返回 `{ok:false}`。否则把**簇的 placements**(步骤1的 cols,row=clRow)与**搬家 placements**(步骤3)**合并**返回 `{placements, ok:true}`。

## §B 搬家算法 `relocateForCluster`(连锁、确定、可终止)

模型:簇是**最高优先级**,固定占 `clRow` 的 `[clStart, clEnd]`(含其内部空隙)。其余每个 block 依次找落脚点,放好即「**敲定**」(此后不再移动)。连锁自然从「放 B 时撞到还没敲定的 C → C 稍后重新安置」产生。

```
relocateForCluster(blocks, cluster, BOARD_ROWS, BOARD_COLS):
  finalized = {}                       # row -> 已敲定的占用区间 [s,e] 列表(含 1 空列语义见 §C)
  finalized[cluster.row] = [[cluster.start, cluster.end]]
  placements = {}
  centerRow = (BOARD_ROWS - 1) / 2
  # 处理顺序(确定性):离簇由近到远 —— 先同行被直接挤的,再按离中心远近
  ordered = sort blocks by (rowDist(b.row, cluster.row), |b.center - cluster.center|, b.row, b.start)
  for b in ordered:
      slot = findSlot(b, finalized, centerRow, BOARD_ROWS, BOARD_COLS)   # §C
      if slot is null: return {reject: true}
      finalized[slot.row].push([slot.start, slot.start + b.width - 1])
      for tile in b.tiles:
          placements[tile] = { gridId:'b', row: slot.row, col: slot.start + (col(tile) - b.start) }
  return {placements}
```

- **连锁**:`findSlot` 只避开 `finalized`(已敲定)的占用,不管还没敲定的 block —— 所以放 B 可以落在 C 的原位上;C 在 `ordered` 里排在后面,轮到它时其原位已被敲定占用 → 它被迫另寻位置(连锁推开)。一次落牌可牵动多行。
- **终止性**:敲定区**只增不减**,每个 block **只放一次**进「尚未敲定」的剩余空间;block 有限 → 必停。任何 block 在所有行都找不到落脚 → reject。
- **确定性**:`ordered` 与 `findSlot` 的候选行/列搜索顺序全固定,不依赖对象遍历顺序 → 乐观==权威。
- **churn 最小**:`findSlot` 对 `b.row` 优先返回**离 `b.start` 最近**的空位 —— 原位若不撞 finalized 就原位不动;只有被挤的 block 才真移动。

## §C `findSlot`(在一行里找够宽、不撞已敲定、留 1 空列的空位)

```
findSlot(b, finalized, centerRow, BOARD_ROWS, BOARD_COLS):
  # 候选行顺序:本行优先(横向平移),再按离中心近、行号小
  rows = [b.row] ++ (allRows except b.row sorted by (|row-centerRow|, row))
  for r in rows:
      occ = sorted finalized[r]                       # 已敲定区间
      # 行内可用空位 = [0, BOARD_COLS-1] 去掉每个 occ 区间各向外扩 1 列(保 ≥1 空列分隔)
      freeIntervals = gaps of [0, BOARD_COLS-1] minus { [s-1, e+1] for [s,e] in occ }
      pick = (r == b.row) ? interval-with-room nearest to b.start
                          : leftmost interval with room >= b.width
      if some free interval has length >= b.width:
          return { row: r, start: chosenStart }       # chosenStart 见下
  return null
```

- **1 空列分隔**:把每个已敲定区间 `[s,e]` 当成 `[s-1, e+1]` 来扣,这样放进剩余空位的 block 与已敲定块之间天然隔 ≥1 空列(板边除外)。
- **本行 chosenStart**:在够宽的空位里,选使 block 离原 `b.start` **最近**的对齐位置(横向平移最小)。
- **跨行 chosenStart**:够宽空位里**最靠左**的对齐位置(确定性;朝中心是靠"候选行顺序"实现的,不是行内列位)。

## §D 不变量(必须保住)

1. **绝不拆/重排块**:`relocateForCluster` 整体平移每个 block(`col → slot.start + offset`,顺序与内部不变)。
2. **簇留原行**:簇固定在 `clRow`,只在行内展开;让位的永远是旁观 block。
3. **手动摆位保留**:不撞 finalized 的 block 留原位;居中只是搬家时的**候选行顺序偏好**,不是常驻引力(沿用主 spec 的取舍)。
4. **纯 + 确定 + DOM-free**:无 `document/window/navigator`(变量别命名 `window`/`document`/`navigator` —— 会触发 `server-graph-dom-free.test.js`)。`relocateForCluster`/`findSlot` 只读输入、产出新对象。
5. **move 原子性不变**:`arrangeBoard` 仍是纯函数;reject → move `INVALID_MOVE` → draft 丢弃。一次 undo 仍恢复整盘(move 落牌前一个 snapshot)。
6. **常见路径零回归**:簇放得进 `freeWindow` 时,完全走第一份逻辑,不调任何搬家代码。

## §E 模块结构

- **新建** `src/rummikub/arrange/space.js` — `extractBlocks(tilePositions, excludeIds)`、`relocateForCluster(blocks, cluster, rows, cols)`、内部 `findSlot`。纯、DOM-free。
- **改** `src/rummikub/arrange/index.js` — `arrangeBoard` 在 `layoutCluster` reject 分支接入 §A 的空间管理(整行重排簇 → extractBlocks → relocateForCluster → 合并 placements / reject)。
- **move / dispatch / layout / partition / cluster 不改**。

## §F Worked examples(测试 oracle)

记号同主 spec:`r5`=红5,`_`=空列,`|`分隔不同块;行用 `R<n>` 标注。

| # | 初始 | 落牌 | 结果 | 说明 |
|---|---|---|---|---|
| 9 | R2: `r1..r9`(9 顺,列0-8);`b1 b2 b3`(列11-13) | 第二张 `r5` | R2: `r12345 _ r56789`(占0-10);`b1 b2 b3` **横向平移**到列12-14(留 1 空列);若右侧无横向空间则**搬到邻行** | 簇要 11 列吃掉到列10,`b123` 让 1 列;本行够则平移,不够则跨行 |
| C1 (连锁) | R2 满到放不下平移;R1 也有块占住目标位 | 触发跨行的落牌 | `b123` 搬到 R1 → 撞 R1 的块 → R1 那块再被推到 R0/R3(离中心近的)→ … | 连锁:一次落牌牵动多行,每块整体不拆 |
| R1 (拒绝) | 构造整盘 9×32 几乎填满、无任何空位 | 需要额外列的落牌 | `arrangeBoard` 返回 `{ok:false}`,move `INVALID_MOVE` 弹回 | 终止性兜底;现实中几乎不可能 |
| 0 (零回归) | R2: `r1 r2 r3`(列0-2),邻居在列10 | `r4` 接右边 | `r1 r2 r3 r4`,**不触发搬家**(进 freeWindow) | 常见路径完全走第一份逻辑 |

例 #9 的右侧若恰好顶到板边(列 31),`b123` 横向无处可去 → 跨行搬到离中心最近、放得下的行。

## §G 测试策略

- **单元(纯函数,大头):** `space.js`:`extractBlocks`(每行连续段、排除簇 tile);`findSlot`(本行最近空位 / 跨行最靠左 / 1 空列分隔 / 候选行朝中心顺序 / 无位返回 null);`relocateForCluster`(原位不动、横向平移、跨行、**连锁**多块、整盘满 reject、确定性 = 同输入同输出)。
- **arrangeBoard 集成:** 例 #9(平移 + 跨行)、C1(连锁牵动多行)、R1(reject)、例 0(零回归:进 freeWindow 时 placements 只含簇、不动任何邻居)。用纯 `arrangeBoard` 调用断言 `placements` 的 row/col。
- **move 级回归:** 既有 `arrange-move.test.js` 等保持绿;新加一个 Client+Local 测试,确认一次跨行落牌后被搬的块出现在新行、且一次 undo 全恢复。
- **确定性:** 同一盘同一落牌产出完全相同 placements(乱序遍历输入不变)。

## §H 不在本文档范围

- **不滚动自适应缩放(第三份):** 缩放格子让整盘一屏可见。本文档假设当前可滚动牌桌;搬家把牌搬到别的行后,玩家可能要滚动才看到 —— 第三份解决「看不到」。
- **主动整桌居中/紧凑化:** 明确不要(沿用主 spec)。居中只是搬家时的候选行顺序偏好。
- 第一份引擎已知限制(不自动生成 13→1 wrap、源行 remove 重整未接 move)不在本文档处理。
