# 跨行搬家空间管理 — 实现计划(自动整理 第二份)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 当一次落牌的整理需要的列数超出本行空闲窗口时,把挡路的完整块横向平移 / 跨行搬家(允许连锁、方向朝中心)给簇腾地方,只有整盘塞不下才拒绝 —— 取代第一份引擎里的直接 reject。

**Architecture:** 新增纯函数 DOM-free 模块 `src/rummikub/arrange/space.js`(`extractBlocks` 抽出每行连续块 → `findSlot` 行内找够宽空位 → `relocateForCluster` 簇优先顺序放置、连锁、确定、可终止)。`arrangeBoard` 在 `layoutCluster` 会 reject 时改为:整行重排簇 → 抽出其余块 → `relocateForCluster` → 合并 placements。move / dispatch / layout / partition / cluster 都不改(move 已支持任意 `{row,col}` placements)。

**Tech Stack:** React 18 / boardgame.io 0.50 / Jest 29。纯 JS,无新依赖。

**Spec:** `docs/superpowers/specs/2026-06-27-auto-arrange-spacemgmt-design.md`(§B 算法、§C findSlot、§F worked examples = 测试 oracle)。主 spec `2026-06-27-auto-arrange-design.md` §6.4 是行为来源。

## Global Constraints

- 纯函数、**DOM-free**(在 `server-graph-dom-free.test.js` 守的内核里);**不得**出现 `document/window/navigator`(包括变量/参数名 —— 该守卫 grep 源码;用 `bounds`/`cols` 等)。无新依赖。
- **确定性**:相同输入 → 完全相同输出(客户端乐观 == 服务端权威)。每个排序/找位顺序固定,不依赖对象遍历顺序。
- **绝不拆/重排块**:每个 block 整体平移(`col → slot.start + 同序偏移`)。
- **move 原子性不变**:`arrangeBoard` 仍纯函数;reject → move `INVALID_MOVE` → draft 丢弃。一次 undo 恢复整盘(move 落牌前一个 snapshot)。
- **常见路径零回归**:簇放得进 `freeWindow` 时,完全走第一份逻辑,**不调任何 space 代码**,placements 只含簇内牌。
- 代码、标识符、文件名、函数名、commit message 用**英文**;Conventional Commits + trailer `Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>`。
- Lint:不新增 ERROR(现有 2 个 App.jsx:29 / Hand.jsx:11 不算)。
- 板尺寸:`BOARD_COLS=32`、`BOARD_ROWS=9`、`BOARD_GRID_ID='b'`(constants.js)。牌编码:整数 `variant<<6|color<<4|value`;测试用 `buildTileObj(value,color,variant)`(从 `../rummikub/util`)+ `COLOR`(从 `../rummikub/constants`),`r(3,1)` 是与 `r(3)` 不同的第二张红3。
- **不做**:主动整桌居中/紧凑化(只在搬家时按候选行顺序偏好中心);不滚动缩放(第三份)。

## File Structure

- **Create** `src/rummikub/arrange/space.js` — `extractBlocks`、`relocateForCluster`(导出)+ 内部 `findSlot`/`freeGaps`/`rowsByCenter`。
- **Modify** `src/rummikub/arrange/index.js` — `arrangeBoard` 接入空间管理(reject 分支)。
- **Create tests** `src/tests/arrange-space.test.js`(extractBlocks/findSlot/relocateForCluster 单元,**C1 连锁在此层直接验证**)、`src/tests/arrange-space-board.test.js`(arrangeBoard 集成:#9 平移 / R1 reject / #0 零回归)、`src/tests/arrange-move-crossrow.test.js`(move 级 Client 跨行 + undo)。

---

### Task 1: `space.js` — `extractBlocks`

**Files:**
- Create: `src/rummikub/arrange/space.js`
- Test: `src/tests/arrange-space.test.js`

**Interfaces:**
- Produces: `extractBlocks(tilePositions, excludeIds) -> Block[]`,`Block = {row, start, width, tiles}`(`tiles` 是 tileId 数组,**按列升序**,占 `[start, start+width-1]`)。每行扫成 maximal 连续段;`excludeIds`(簇内 tile)被排除。

- [ ] **Step 1: 写失败测试**

```js
// src/tests/arrange-space.test.js
import {extractBlocks} from '../rummikub/arrange/space';
import {buildTileObj} from '../rummikub/util';
import {COLOR} from '../rummikub/constants';
const r = (v, variant = 0) => buildTileObj(v, COLOR.red, variant);
const b = v => buildTileObj(v, COLOR.blue, 0);

function tp(entries) { // entries: [tileId, col, row]
  const o = {};
  for (const [id, col, row] of entries) o[id] = {id, col, row, gridId: 'b'};
  return o;
}

test('extractBlocks splits each row into contiguous segments, excluding cluster tiles', () => {
  // row 2: r1 r2 r3 (cols 0-2) | gap | r5 (col 4);  row 3: b1 b2 (cols 10-11)
  const positions = tp([[r(1), 0, 2], [r(2), 1, 2], [r(3), 2, 2], [r(5), 4, 2], [b(1), 10, 3], [b(2), 11, 3]]);
  const blocks = extractBlocks(positions, [r(5)]); // r5 is the cluster, excluded
  // remaining: [r1 r2 r3] @row2 start0 w3 ; [b1 b2] @row3 start10 w2
  const norm = blocks.map(x => ({row: x.row, start: x.start, width: x.width, tiles: x.tiles}))
    .sort((a, c) => a.row - c.row || a.start - c.start);
  expect(norm).toEqual([
    {row: 2, start: 0, width: 3, tiles: [r(1), r(2), r(3)]},
    {row: 3, start: 10, width: 2, tiles: [b(1), b(2)]},
  ]);
});
```

- [ ] **Step 2: 跑红**

Run: `npx jest src/tests/arrange-space.test.js`
Expected: FAIL — "Cannot find module '../rummikub/arrange/space'"。

- [ ] **Step 3: 实现**

```js
// src/rummikub/arrange/space.js
import {BOARD_GRID_ID} from "../constants.js";

// Every maximal contiguous-column segment of board tiles, one per row, excluding
// the cluster's tiles. tiles are in ascending-column order, so tile index i sits
// at column start+i (used to shift a whole block when it relocates).
export function extractBlocks(tilePositions, excludeIds) {
    const exclude = new Set([...excludeIds].map(Number));
    const byRow = new Map();
    for (const id in tilePositions) {
        const p = tilePositions[id];
        if (!p || p.gridId !== BOARD_GRID_ID || exclude.has(Number(id))) continue;
        if (!byRow.has(p.row)) byRow.set(p.row, []);
        byRow.get(p.row).push({id: Number(id), col: p.col});
    }
    const blocks = [];
    for (const [row, tiles] of byRow) {
        tiles.sort((a, b) => a.col - b.col);
        let seg = [tiles[0]];
        for (let i = 1; i < tiles.length; i++) {
            if (tiles[i].col === tiles[i - 1].col + 1) seg.push(tiles[i]);
            else { blocks.push(toBlock(row, seg)); seg = [tiles[i]]; }
        }
        blocks.push(toBlock(row, seg));
    }
    return blocks;
}

function toBlock(row, seg) {
    return {row, start: seg[0].col, width: seg.length, tiles: seg.map(s => s.id)};
}
```

- [ ] **Step 4: 跑绿**

Run: `npx jest src/tests/arrange-space.test.js`
Expected: PASS (1 test)。

- [ ] **Step 5: commit**

```bash
git add src/rummikub/arrange/space.js src/tests/arrange-space.test.js
git commit -m "feat(arrange): extractBlocks — per-row contiguous segments (cluster excluded)

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 2: `space.js` — `findSlot`(+ `freeGaps`, `rowsByCenter`)

**Files:**
- Modify: `src/rummikub/arrange/space.js`(新增内部函数)
- Test: `src/tests/arrange-space.test.js`(追加)

**Interfaces:**
- Produces(模块内部,但本任务用一个**测试专用导出** `__test` 暴露以便单测):`findSlot(block, finalized, centerRow, rows, cols) -> {row, start} | null`。`finalized` 是 `Map<row, Array<[s,e]>>`(已敲定占用区间)。候选行顺序:`block.row` 优先,再按 `(|row-centerRow|, row)`。行内可用空位 = `[0, cols-1]` 去掉每个已敲定 `[s,e]` 各向外扩 1 列(保 ≥1 空列分隔)。本行选离 `block.start` **最近**的对齐位置;跨行选**最靠左**。无位 → `null`。

- [ ] **Step 1: 追加失败测试**

```js
// 追加到 src/tests/arrange-space.test.js
import {__test} from '../rummikub/arrange/space';
const {findSlot} = __test;
const blk = (row, start, width) => ({row, start, width, tiles: Array.from({length: width}, (_, i) => 1000 + i)});

test('findSlot slides within the block row to the nearest free slot (>=1 gap from finalized)', () => {
  // cluster finalized at row 2 cols [0,10]; a width-3 block originally at col 11
  const finalized = new Map([[2, [[0, 10]]]]);
  const slot = findSlot(blk(2, 11, 3), finalized, 4, 9, 32);
  // free in row 2 is [12,31] (cols 0..11 blocked by [0,10] expanded to [0,11]); nearest to 11 -> 12
  expect(slot).toEqual({row: 2, start: 12});
});

test('findSlot relocates toward centre when the own row has no room', () => {
  // row 2 fully blocked; centre row 4 free
  const finalized = new Map([[2, [[0, 31]]]]);
  const slot = findSlot(blk(2, 5, 3), finalized, 4, 9, 32);
  expect(slot).toEqual({row: 4, start: 0});   // own row none -> nearest-to-centre row 4, leftmost
});

test('findSlot returns null when nothing fits anywhere', () => {
  const finalized = new Map();
  for (let r = 0; r < 9; r++) finalized.set(r, [[0, 31]]); // every row full
  expect(findSlot(blk(2, 5, 3), finalized, 4, 9, 32)).toBeNull();
});
```

- [ ] **Step 2: 跑红**

Run: `npx jest src/tests/arrange-space.test.js`
Expected: FAIL — `__test` / `findSlot` undefined。

- [ ] **Step 3: 实现(追加到 space.js)**

```js
// Free column intervals [gs,ge] of [0,cols-1] after removing each finalized
// interval expanded by one column on each side (so a placed block keeps >=1
// empty column from every finalized block; board edges need no margin).
function freeGaps(occ, cols) {
    const blocked = occ
        .map(([s, e]) => [Math.max(0, s - 1), Math.min(cols - 1, e + 1)])
        .sort((a, b) => a[0] - b[0]);
    const gaps = [];
    let cur = 0;
    for (const [s, e] of blocked) {
        if (s > cur) gaps.push([cur, s - 1]);
        cur = Math.max(cur, e + 1);
    }
    if (cur <= cols - 1) gaps.push([cur, cols - 1]);
    return gaps;
}

// All rows except `exclude`, ordered by distance to the board centre then row.
function rowsByCenter(rows, exclude, centerRow) {
    const rs = [];
    for (let r = 0; r < rows; r++) if (r !== exclude) rs.push(r);
    rs.sort((a, b) => Math.abs(a - centerRow) - Math.abs(b - centerRow) || a - b);
    return rs;
}

// Find a landing slot for `block`: its own row first (nearest to its current
// start = least horizontal move), then rows toward the board centre (leftmost
// free slot). Avoids only FINALIZED occupancy (so cascade can push not-yet-
// placed blocks). Returns {row, start} or null.
function findSlot(block, finalized, centerRow, rows, cols) {
    const candidates = [block.row, ...rowsByCenter(rows, block.row, centerRow)];
    for (const r of candidates) {
        const occ = finalized.get(r) || [];
        const gaps = freeGaps(occ, cols);
        if (r === block.row) {
            let best = null, bestDist = Infinity;
            for (const [gs, ge] of gaps) {
                if (ge - gs + 1 < block.width) continue;
                const s = Math.max(gs, Math.min(block.start, ge - block.width + 1));
                const d = Math.abs(s - block.start);
                if (d < bestDist) { best = s; bestDist = d; }
            }
            if (best !== null) return {row: r, start: best};
        } else {
            for (const [gs, ge] of gaps) {
                if (ge - gs + 1 >= block.width) return {row: r, start: gs};
            }
        }
    }
    return null;
}

// Test-only handle so the pure helpers can be unit-tested without exporting them
// into the module's public surface.
export const __test = {findSlot, freeGaps, rowsByCenter};
```

- [ ] **Step 4: 跑绿**

Run: `npx jest src/tests/arrange-space.test.js`
Expected: PASS (4 tests)。

- [ ] **Step 5: commit**

```bash
git add src/rummikub/arrange/space.js src/tests/arrange-space.test.js
git commit -m "feat(arrange): findSlot — nearest in-row / toward-centre cross-row free slot

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 3: `space.js` — `relocateForCluster`(连锁、确定、可终止)

**Files:**
- Modify: `src/rummikub/arrange/space.js`(新增导出)
- Test: `src/tests/arrange-space.test.js`(追加)

**Interfaces:**
- Consumes: `findSlot`(同文件)、`BOARD_GRID_ID`。
- Produces: `relocateForCluster(blocks, cluster, rows, cols) -> {placements} | {reject:true}`。`cluster = {row, start, end}`(占 `[start,end]`,固定)。把 `blocks` 按「离簇由近到远」确定性排序后逐个 `findSlot` 放置、放好即敲定;**只对真正移动了的块**写 `placements`(`{tileId: {gridId:'b', row, col}}`);任一块无处可放 → `{reject:true}`。连锁来自:放后续块时其原位可能已被敲定占用 → 被迫另寻位置。

- [ ] **Step 1: 追加失败测试**

```js
// 追加到 src/tests/arrange-space.test.js
import {relocateForCluster} from '../rummikub/arrange/space';

test('a same-row neighbour slides; an untouched far block does not move', () => {
  // cluster row 2 [0,10]; neighbour [b? width3] at row2 start11; a far block row5 start0 width3
  const neighbour = {row: 2, start: 11, width: 3, tiles: [b(1), b(2), b(3)]};
  const far = {row: 5, start: 0, width: 3, tiles: [r(7), r(8), r(9)]};
  const res = relocateForCluster([neighbour, far], {row: 2, start: 0, end: 10}, 9, 32);
  // neighbour slides to cols 12-14 (row 2); far block untouched -> no placement entry
  expect(res.placements[b(1)]).toEqual({gridId: 'b', row: 2, col: 12});
  expect(res.placements[b(3)]).toEqual({gridId: 'b', row: 2, col: 14});
  expect(res.placements[r(7)]).toBeUndefined();   // far, unmoved
});

test('cascade: a block pushed onto another row relocates the block already there', () => {
  // cluster fills row 2 [0,31] (no in-row room). neighbour originally row2 -> must go cross-row.
  // row 4 (centre) already has a block at [0,2]; the incoming block takes [0,..] only if free,
  // else the centre rows fill and the resident is pushed too. Construct so BOTH move.
  const incoming = {row: 2, start: 5, width: 30, tiles: Array.from({length: 30}, (_, i) => 2000 + i)};
  const resident = {row: 4, start: 0, width: 3, tiles: [r(1), r(2), r(3)]};
  const res = relocateForCluster([incoming, resident], {row: 2, start: 0, end: 31}, 9, 32);
  // incoming (width 30) can't fit row 2; goes to centre row 4 at col 0; resident's [0,2] now
  // overlaps finalized -> resident relocates to another row. Both have placements; rows differ.
  expect(res.reject).toBeUndefined();
  expect(res.placements[2000].row).toBe(4);            // incoming landed on row 4
  expect(res.placements[r(1)]).toBeTruthy();           // resident was pushed (cascade)
  expect(res.placements[r(1)].row).not.toBe(4);        // resident no longer on row 4
});

test('reject when the board is full', () => {
  const blocks = [{row: 0, start: 0, width: 3, tiles: [r(1), r(2), r(3)]}];
  // cluster occupies row 0 fully; every other row pre-finalized-full is simulated by a wide block per row
  const full = [];
  for (let row = 1; row < 9; row++) full.push({row, start: 0, width: 32, tiles: [row * 100]});
  const res = relocateForCluster([...blocks, ...full], {row: 0, start: 0, end: 31}, 9, 32);
  expect(res.reject).toBe(true);
});

test('deterministic: shuffled block input yields identical placements', () => {
  const n = {row: 2, start: 11, width: 3, tiles: [b(1), b(2), b(3)]};
  const f = {row: 5, start: 0, width: 3, tiles: [r(7), r(8), r(9)]};
  const a = relocateForCluster([n, f], {row: 2, start: 0, end: 10}, 9, 32);
  const c = relocateForCluster([f, n], {row: 2, start: 0, end: 10}, 9, 32);
  expect(c.placements).toEqual(a.placements);
});
```

- [ ] **Step 2: 跑红**

Run: `npx jest src/tests/arrange-space.test.js`
Expected: FAIL — `relocateForCluster` undefined。

- [ ] **Step 3: 实现(追加到 space.js)**

```js
// Sequential cluster-priority placement. The cluster is fixed (highest
// priority); every other block is placed once, in a deterministic order (nearest
// to the cluster first), into space free of FINALIZED blocks, then finalized.
// Cascade emerges: placing a block over a not-yet-finalized block forces that
// block to relocate when its turn comes. Finalized region only grows, each block
// is placed once -> terminates. Unmovable block -> reject. Only blocks that
// actually moved get a placement entry.
export function relocateForCluster(blocks, cluster, rows, cols) {
    const centerRow = (rows - 1) / 2;
    const clusterCenter = (cluster.start + cluster.end) / 2;
    const finalized = new Map([[cluster.row, [[cluster.start, cluster.end]]]]);

    const ordered = blocks.slice().sort((a, b) => {
        const ra = Math.abs(a.row - cluster.row), rb = Math.abs(b.row - cluster.row);
        if (ra !== rb) return ra - rb;
        const ca = Math.abs(a.start + a.width / 2 - clusterCenter);
        const cb = Math.abs(b.start + b.width / 2 - clusterCenter);
        if (ca !== cb) return ca - cb;
        if (a.row !== b.row) return a.row - b.row;
        return a.start - b.start;
    });

    const placements = {};
    for (const block of ordered) {
        const slot = findSlot(block, finalized, centerRow, rows, cols);
        if (!slot) return {reject: true};
        if (!finalized.has(slot.row)) finalized.set(slot.row, []);
        finalized.get(slot.row).push([slot.start, slot.start + block.width - 1]);
        if (slot.row === block.row && slot.start === block.start) continue; // no move
        for (let i = 0; i < block.tiles.length; i++) {
            placements[block.tiles[i]] = {gridId: BOARD_GRID_ID, row: slot.row, col: slot.start + i};
        }
    }
    return {placements};
}
```

- [ ] **Step 4: 跑绿**

Run: `npx jest src/tests/arrange-space.test.js`
Expected: PASS (8 tests)。

- [ ] **Step 5: commit**

```bash
git add src/rummikub/arrange/space.js src/tests/arrange-space.test.js
git commit -m "feat(arrange): relocateForCluster — cascade space management (deterministic, terminating)

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 4: 接入 `arrangeBoard` + 集成测试

**Files:**
- Modify: `src/rummikub/arrange/index.js`
- Test: `src/tests/arrange-space-board.test.js`

**Interfaces:**
- Consumes: `extractBlocks`、`relocateForCluster`(space.js);`BOARD_ROWS`(constants)。
- 行为:`arrangeBoard` 先按现状 `layoutCluster` 进 `freeWindow`;**放得下 → 原样返回**(零回归)。**reject 时**:用整行 `{left:0, right:BOARD_COLS-1}` 重排簇 → 若仍 reject(`W>32`)→ `{ok:false}`;否则取簇占用 `[clStart,clEnd]`,`extractBlocks(tilePositions, cluster.tiles)`,`relocateForCluster(others, {row, start:clStart, end:clEnd}, BOARD_ROWS, BOARD_COLS)`;reject → `{ok:false}`;否则合并**簇 placements + 搬家 placements** 返回 `{ok:true}`。

- [ ] **Step 1: 写失败测试**

```js
// src/tests/arrange-space-board.test.js
import {arrangeBoard} from '../rummikub/arrange/index';
import {buildTileObj} from '../rummikub/util';
import {COLOR} from '../rummikub/constants';
const r = (v, variant = 0) => buildTileObj(v, COLOR.red, variant);
const b = v => buildTileObj(v, COLOR.blue, 0);

function tp(entries) { const o = {}; for (const [id, col, row] of entries) o[id] = {id, col, row, gridId: 'b'}; return o; }

test('#0 zero-regression: a drop that fits the row triggers no relocation', () => {
  // r1 r2 r3 at row 0 cols 0-2; neighbour b far at col 20; drop r4 at col 3 (fits)
  const positions = tp([[r(1), 0, 0], [r(2), 1, 0], [r(3), 2, 0], [r(4), 3, 0], [b(1), 20, 0], [b(2), 21, 0], [b(3), 22, 0]]);
  const res = arrangeBoard(positions, {droppedIds: [r(4)], row: 0, col: 3});
  expect(res.ok).toBe(true);
  // only the cluster (r1..r4) is placed; the far b-block is untouched (no placement entry)
  expect(res.placements[b(1)]).toBeUndefined();
  expect(res.placements[r(4)].row).toBe(0);
});

test('#9 slide: cluster needs 11 cols, neighbour 2 gaps away slides right', () => {
  // row 0: red run 1..9 at cols 0-8 (valid); b1 b2 b3 at cols 11-13.
  // Drop the second r5 INSIDE the run (col 4, on top of r5). Dropping it at the right edge
  // (col 9) would bridge the 1-col gap to b1 (col 11) and pull b1..b3 into the cluster, so the
  // slide path never runs. Col 4 keeps the cluster span [0,8] -> 2-col gap -> b1..b3 stay separate.
  const entries = [];
  for (let v = 1; v <= 9; v++) entries.push([r(v), v - 1, 0]);
  entries.push([b(1), 11, 0], [b(2), 12, 0], [b(3), 13, 0], [r(5, 1), 4, 0]); // dup-5 dropped inside the run
  const res = arrangeBoard(tp(entries), {droppedIds: [r(5, 1)], row: 0, col: 4});
  expect(res.ok).toBe(true);
  // cluster {r1..r9,dup5} -> 12345 _ 56789 occupies cols 0-10; b1 b2 b3 slide to 12-14 (>=1 gap)
  const bcols = [res.placements[b(1)].col, res.placements[b(2)].col, res.placements[b(3)].col].sort((x, y) => x - y);
  expect(bcols).toEqual([12, 13, 14]);
  expect(res.placements[b(1)].row).toBe(0);
});

test('R1 reject: cluster must grow but no row can absorb the displaced neighbour -> ok:false', () => {
  const entries = [];
  // row 0: red run 1..9 (cols 0-8) + a wide blue neighbour filling cols 11..31 (width 21, separate by a 2-col gap)
  for (let v = 1; v <= 9; v++) entries.push([r(v), v - 1, 0]);
  for (let c = 11; c <= 31; c++) entries.push([2000 + c, c, 0]);
  // rows 1..8: completely full (32 wide each) -> no cross-row room
  for (let row = 1; row <= 8; row++) for (let c = 0; c < 32; c++) entries.push([3000 + row * 100 + c, c, row]);
  entries.push([r(5, 1), 4, 0]);                       // drop dup-5 inside the run -> cluster {r1..r9,dup5}
  const res = arrangeBoard(tp(entries), {droppedIds: [r(5, 1)], row: 0, col: 4});
  // cluster reflows to 11 cols (0-10); the 21-wide neighbour cannot fit row 0's 20-col remainder
  // and every other row is full -> 9 blocks competing for 8 free rows -> pigeonhole -> reject.
  expect(res.ok).toBe(false);
});
```
注:R1 里的 `2000+`/`3000+` 是不会与真实牌 int 冲突的占位 id(真实牌 int ≤ 126);`extractBlocks`/`relocateForCluster` 只做几何,不调 `getTileValue`,而填充牌都在簇外(2 格间隔),`identifyCluster` 不会把它们并进簇,故不会被当真实牌解析。

- [ ] **Step 2: 跑红**

Run: `npx jest src/tests/arrange-space-board.test.js`
Expected: 仅 **#9 红**（旧 `arrangeBoard` 遇 freeWindow 溢出直接 `{ok:false}`,b-block 不搬,`bcols≠[12,13,14]`）。**#0 绿**（零回归,本就走老路径）、**R1 绿**（旧逻辑遇 reject 也返回 `ok:false`,该断言是防回归护栏,实现后仍绿）。

- [ ] **Step 3: 实现(改 index.js)**

```js
// src/rummikub/arrange/index.js
import {BOARD_COLS, BOARD_ROWS, BOARD_GRID_ID} from "../constants.js";
import {identifyCluster} from "./cluster.js";
import {partitionCluster} from "./partition.js";
import {layoutCluster} from "./layout.js";
import {extractBlocks, relocateForCluster} from "./space.js";

export function arrangeBoard(tilePositions, drop) {
    const {droppedIds, row, col} = drop;
    const cluster = identifyCluster(tilePositions, row, droppedIds);
    if (!cluster.tiles.length) return {placements: {}, ok: true};

    const part = partitionCluster(cluster.tiles, cluster.preDropValidBlocks);
    const dropSide = col <= cluster.span.left ? "left" : "right";
    const bounds = freeWindow(tilePositions, row, cluster.tiles, cluster.span);
    const inRow = layoutCluster(part, dropSide, cluster.span, bounds);
    if (!inRow.reject) {
        return {placements: toPlacements(inRow.cols, row), ok: true};   // common path: fits, no relocation
    }

    // Space management: re-lay the cluster across the whole row, relocate neighbours.
    const full = layoutCluster(part, dropSide, cluster.span, {left: 0, right: BOARD_COLS - 1});
    if (full.reject) return {placements: {}, ok: false};               // cluster wider than the board
    const clCols = Object.values(full.cols);
    const clStart = Math.min(...clCols), clEnd = Math.max(...clCols);
    const others = extractBlocks(tilePositions, cluster.tiles);
    const reloc = relocateForCluster(others, {row, start: clStart, end: clEnd}, BOARD_ROWS, BOARD_COLS);
    if (reloc.reject) return {placements: {}, ok: false};
    return {placements: {...toPlacements(full.cols, row), ...reloc.placements}, ok: true};
}

function toPlacements(cols, row) {
    const placements = {};
    for (const id in cols) placements[id] = {gridId: BOARD_GRID_ID, row, col: cols[id]};
    return placements;
}

// (freeWindow unchanged — keep the existing definition below.)
```
保留现有 `freeWindow` 函数不动。注意 import 行新增 `BOARD_ROWS` 与 `{extractBlocks, relocateForCluster}`。

- [ ] **Step 4: 跑绿 + 全量**

Run: `npx jest src/tests/arrange-space-board.test.js`
Expected: PASS (3 tests)。
Run: `npx jest 2>&1 | tail -5`
Expected: 全绿(既有 arrange/move 测试不回归)。

- [ ] **Step 5: commit**

```bash
git add src/rummikub/arrange/index.js src/tests/arrange-space-board.test.js
git commit -m "feat(arrange): arrangeBoard relocates neighbours on overflow instead of rejecting

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 5: move 级跨行测试 + 全量验证

**Files:**
- Test: `src/tests/arrange-move-crossrow.test.js`

**Interfaces:**
- Consumes: 既有 move `insertTilesWithPush`(已应用任意 `{row,col}` placements)+ `makeMatch` 测试工厂。
- 行为:一个 Client+Local 测试,构造一行的簇展开会挤动同行邻居,落牌后断言**邻居出现在新列**(或新行),且**一次 undo 整盘恢复**。

- [ ] **Step 1: 写失败测试(其实应直接绿 —— 它验证 Task 4 的端到端;先确认它能跑)**

```js
// src/tests/arrange-move-crossrow.test.js
import {Client} from 'boardgame.io/client';
import {Local} from 'boardgame.io/multiplayer';
import {makeMatch} from './__helpers__/makeMatch';
import {buildTileObj} from '../rummikub/util';
import {COLOR, BOARD_GRID_ID, HAND_GRID_ID} from '../rummikub/constants';
const r = (v, variant = 0) => buildTileObj(v, COLOR.red, variant);
const b = v => buildTileObj(v, COLOR.blue, 0);

test('a drop that overflows the row slides the neighbour, and one undo restores it', () => {
  const tilePositions = {};
  for (let v = 1; v <= 9; v++) { const id = r(v); tilePositions[id] = {id, col: v - 1, row: 0, gridId: BOARD_GRID_ID}; }
  [b(1), b(2), b(3)].forEach((id, i) => { tilePositions[id] = {id, col: 11 + i, row: 0, gridId: BOARD_GRID_ID}; });
  const dup = r(5, 1);
  tilePositions[dup] = {id: dup, col: 0, row: 0, gridId: HAND_GRID_ID, playerID: '0'};
  const game = makeMatch({tilePositions, prevTilePositions: tilePositions, firstMoveDone: [true, true]});
  // give player 1 a spare tile + make player 0 current (mirror arrange-move.test.js harness)
  tilePositions[b(9)] = {id: b(9), col: 0, row: 0, gridId: HAND_GRID_ID, playerID: '1'};
  const c0 = Client({game, multiplayer: Local(), playerID: '0'});
  const c1 = Client({game, multiplayer: Local(), playerID: '1'});
  c0.start(); c1.start();
  c0.events.endPhase(); c1.events.endPhase();
  // ensure player 0 is current: if not, end player 1's turn first (harness detail)
  if (c0.getState().ctx.currentPlayer !== '0') { c1.moves.endTurn?.(); }

  const before = c0.getState().G.tilePositions[b(1)].col;            // 11
  c0.moves.insertTilesWithPush(4, 0, BOARD_GRID_ID, {id: dup}, [dup]); // drop dup-5 INSIDE the run (col 4)
  const after = c0.getState().G.tilePositions[b(1)];
  expect(after.col).toBeGreaterThan(before);                          // b-block slid right (separate neighbour)
  expect(after.row).toBe(0);

  c0.moves.undo();
  expect(c0.getState().G.tilePositions[b(1)].col).toBe(before);       // one undo restores the whole arrangement
});
```

- [ ] **Step 2: 跑测试**

Run: `npx jest src/tests/arrange-move-crossrow.test.js`
Expected: PASS（若 harness 的 currentPlayer 细节需微调,参照 `src/tests/arrange-move.test.js` 里已验证的写法对齐；断言不变）。

- [ ] **Step 3: 全量 + 构建 + lint + DOM-free + boot**

Run: `npx jest 2>&1 | tail -5`（全绿）
Run: `npm run build 2>&1 | tail -3`（OK）
Run: `npm run lint 2>&1 | tail -3`（仅 2 个已知 error,无新增）
Run: `grep -rn "document\|window\|navigator" src/rummikub/arrange/`（空 —— 含 space.js）
Run: `PORT=9362 node --env-file=.env src/server.js &`(记 PID),`curl -s localhost:9362/games` → `["RummyCube"]`,然后 `kill <PID>`
顺手:把 `../rummikub/arrange/space.js` 加进 `src/tests/server-graph-dom-free.test.js` 的 `SERVER_GRAPH_MODULES` 列表(守住新模块 DOM-free)。

- [ ] **Step 4: commit**

```bash
git add src/tests/arrange-move-crossrow.test.js src/tests/server-graph-dom-free.test.js
git commit -m "test(arrange): cross-row move + undo end-to-end; guard space.js DOM-free

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## 最终验证(合并前)

- [ ] `npx jest` 全绿;`npm run build` OK;`npm run lint` 无新 error;`grep` arrange/ 无 DOM;server boot `/games` == `["RummyCube"]`。
- [ ] 本地视觉冒烟:`npx vite preview` + 本地后端,把一行铺满到需要挤动邻居,落牌看邻居是否平移/跨行、undo 是否整盘恢复。
- [ ] whole-branch review → finishing-a-development-branch(ff-merge)→ 部署(podman build + bake 检查 + restart + live `/games` + 跨行落牌冒烟)。

## 已知限制 / 后续

- **不主动整桌居中**(沿用主 spec):居中只是搬家时的候选行顺序偏好。
- **贪心、非最优**:`relocateForCluster` 是确定性贪心,极端近满盘可能在「更聪明的打包本可塞下」时仍 reject —— 接受(reject 是最后兜底,9×32≫在场牌,现实不触发)。
- **后续(第三份)不滚动自适应缩放**:把牌搬到别的行后玩家可能要滚动才看到;第三份解决「看不到」。

## Self-Review

- **Spec coverage**:§A 触发/流程 → Task 4;§B `relocateForCluster`(连锁/确定/终止)→ Task 3;§C `findSlot`/`freeGaps`/候选行 → Task 2;块抽取 → Task 1;§D 不变量(不拆/簇留原行/纯/确定/move 原子/零回归)→ 各任务测试 + Task 4 的 #0;§F worked examples:例 #9(平移+跨行触发)→ Task 4 集成;**C1(连锁)→ Task 3 单元**(直接喂 `relocateForCluster` 一个「incoming 占走 resident 的行 → resident 被迫再搬」的最小连锁夹具,断言两块都移且落在不同行;arrangeBoard 层不再重复构造近满盘连锁,避免脆弱夹具);R1(reject)→ Task 4 集成(整盘鸽笼:9 块抢 8 空行 → `ok:false`);例 0(零回归)→ Task 4。move 端到端 + undo → Task 5。无遗漏。
- **类型一致**:`extractBlocks→Block[]{row,start,width,tiles}`;`findSlot(block,finalized:Map,centerRow,rows,cols)→{row,start}|null`;`relocateForCluster(blocks,{row,start,end},rows,cols)→{placements}|{reject}`;`placements[id]={gridId,row,col}`;`arrangeBoard→{placements,ok}` 全程一致。
- **无占位符**:每个代码步骤含完整可运行代码与确切命令。
