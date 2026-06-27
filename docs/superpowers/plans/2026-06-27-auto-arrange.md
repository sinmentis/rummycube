# 牌桌自动整理引擎 — 实现计划(第一份:核心引擎)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让落牌在它落入的那一**簇**内朝合法 run/group 自动重排(语义化),服务端权威地取代现有的纯几何 `insertWithPush`。

**Architecture:** 新增一个纯函数、DOM-free 的 `src/rummikub/arrange/` 包:`cluster`(识别簇)→ `blocks`+`partition`(两遍法求解最优合法切分)→ `layout`(行内布局:规范顺序、空格分隔、散牌、落点选边、放不下则拒绝)→ `index`(`arrangeBoard` 编排)。一个服务端 move 调 `arrangeBoard` 并原子地应用结果;客户端 dispatch 简化为「算出落点 → dispatch arrange move」,保留 joker-retrieve。

**Tech Stack:** React 18 / boardgame.io 0.50 / Jest 29。纯 JS,无新依赖。

**Spec:** `docs/superpowers/specs/2026-06-27-auto-arrange-design.md`(§6 算法、§10 worked examples = 测试 oracle)。

## Global Constraints

- 引擎纯函数、**DOM-free**(加入 `server-graph-dom-free.test.js` 守的内核);不得引用 `document/window/navigator`。无新依赖。
- 引擎**确定性**:相同输入 → 完全相同输出(客户端乐观 == 服务端权威)。每个平手判定固定,绝不依赖遍历顺序。
- **move 原子性**:引擎纯函数算出 `placements`,move 在一次 immer 更新里应用;`ok:false` → `INVALID_MOVE`(draft 丢弃、`G` 不变)。
- 代码、标识符、文件名、函数名、commit message 用**英文**;Conventional Commits + trailer `Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>`。
- Lint 门槛:不新增 ERROR(现有 2 个 App.jsx:29 / Hand.jsx:11 不算)。
- 本计划**不含**跨行搬家/横向平移(§6.4 的 slide/relocate)——见末尾「后续计划」。本计划的空间规则:簇在自己的列区间 + 两侧各 ≥1 个保证空列内布局;放不下则 `ok:false` 拒绝,**绝不移动非簇内的牌**。
- 板尺寸:`BOARD_COLS = 32`、`BOARD_ROWS = 9`、`BOARD_GRID_ID = 'b'`、`HAND_GRID_ID = 'h'`(constants.js)。
- 牌编码:整数 `variant<<6 | color<<4 | value`。`getTileValue`∈1..13、joker value=14;`getTileColor`∈0..3。测试用 `buildTileObj(value, color, variant)`(从 `../rummikub/util` 引入)与 `COLOR`(从 `../rummikub/constants`)构造。

## File Structure

- **Create** `src/rummikub/arrange/cluster.js` — 识别簇 + 落前合法块 + 列区间。
- **Create** `src/rummikub/arrange/blocks.js` — `isValidBlock` + `blocksContaining`(枚举含锚点的合法 run/group)。
- **Create** `src/rummikub/arrange/partition.js` — `bestPartition`(记忆化 DFS,最大覆盖)+ `partitionCluster`(两遍法)。
- **Create** `src/rummikub/arrange/layout.js` — `layoutCluster`(行内布局 + 落点选边 + fit/reject)。
- **Create** `src/rummikub/arrange/index.js` — `arrangeBoard` 编排器。
- **Modify** `src/rummikub/moves.js` — 把 `insertTilesWithPush` move 改为调用 `arrangeBoard`(语义整理取代几何 push)。
- **Modify** `src/rummikub/components/hooks/useDropDispatch.js` + `src/rummikub/dndUtil.js` — dispatch 简化:保留 joker-retrieve,其余统一走 arrange move。
- **Modify/rewrite tests** — `insert-tiles-with-push.test.js` / `board-insert-push-dispatch.test.js` 重写为语义结果。
- **Create tests** — `arrange-cluster.test.js`、`arrange-blocks.test.js`、`arrange-partition.test.js`、`arrange-layout.test.js`、`arrange-board.test.js`。

---

### Task 1: `arrange/cluster.js` — 识别簇

**Files:**
- Create: `src/rummikub/arrange/cluster.js`
- Test: `src/tests/arrange-cluster.test.js`

**Interfaces:**
- Produces: `identifyCluster(tilePositions, row, droppedIds) -> { tiles, span, preDropValidBlocks }`，其中 `tiles` 是簇内 tileId 数组、`span = {left, right}` 是簇占用的列闭区间、`preDropValidBlocks` 是**落前已合法的连续块**(`tileId[][]`)。`droppedIds` 是本次落下的牌的 id(它们已被 move 写进 `(row, col..)`);簇从它们所在列出发、跨 ≤1 空列连到的同行牌,隔 ≥2 空列的不收。**关键**:`preDropValidBlocks` 在计算时**排除 `droppedIds`**(即「落牌之前」的板),否则一张紧贴既有合法组落下的新牌会把那个组并进同一连续段、使它检测不出来,Pass 2 的保护就会失效。

- [ ] **Step 1: 写失败测试**

```js
// src/tests/arrange-cluster.test.js
import {identifyCluster} from '../rummikub/arrange/cluster';
import {buildTileObj} from '../rummikub/util';
import {COLOR} from '../rummikub/constants';

const r = (v, variant = 0) => buildTileObj(v, COLOR.red, variant);
// 在一行里铺牌:cols 是 {col: tileId}
function row(map) {
  const tp = {};
  for (const [col, id] of Object.entries(map)) {
    tp[id] = {id: Number(id), col: Number(col), row: 2, gridId: 'b'};
  }
  return tp;
}

test('cluster spans a single ≤1 gap but stops at a ≥2 gap', () => {
  // cols: 0,1,2 then gap at 3, tile at 4 (≤1 gap -> in); gap 5,6, tile at 7 (≥2 gap -> out)
  const tp = row({0: r(1), 1: r(2), 2: r(3), 4: r(5), 7: r(8)});
  const c = identifyCluster(tp, 2, [r(5)]);     // dropped tile sits at col 4
  expect(new Set(c.tiles)).toEqual(new Set([r(1), r(2), r(3), r(5)]));
  expect(c.span).toEqual({left: 0, right: 4});
});

test('pre-drop valid blocks EXCLUDE the just-dropped tile', () => {
  // 1-2-3 is a committed run; r5 (col 4) is the tile just dropped -> excluded
  const tp = row({0: r(1), 1: r(2), 2: r(3), 4: r(5)});
  const c = identifyCluster(tp, 2, [r(5)]);
  expect(c.preDropValidBlocks).toEqual([[r(1), r(2), r(3)]]);
});
```

- [ ] **Step 2: 跑红**

Run: `npx jest src/tests/arrange-cluster.test.js`
Expected: FAIL — "Cannot find module '../rummikub/arrange/cluster'"。

- [ ] **Step 3: 实现**

```js
// src/rummikub/arrange/cluster.js
import {isSequenceValid} from "../tile/sequence.js";

// Identify the cluster a drop lands in: the maximal set of same-row tiles
// reachable from the dropped tiles' columns across gaps of <=1 empty column.
// Tiles separated by >=2 empty columns are a different region and excluded.
// Also returns the cluster's occupied column span and the contiguous sub-runs
// that were already valid runs/groups BEFORE this drop — computed by EXCLUDING
// the just-dropped tiles, so an adjacent drop can't hide a committed set.
export function identifyCluster(tilePositions, row, droppedIds) {
    const dropped = new Set(droppedIds.map(Number));
    const inRow = [];
    for (const id in tilePositions) {
        const p = tilePositions[id];
        if (p && p.gridId === "b" && p.row === row) inRow.push({id: Number(id), col: p.col});
    }
    inRow.sort((a, b) => a.col - b.col);
    if (!inRow.length) return {tiles: [], span: {left: null, right: null}, preDropValidBlocks: []};

    const dropCols = inRow.filter(t => dropped.has(t.id)).map(t => t.col);
    if (!dropCols.length) return {tiles: [], span: {left: null, right: null}, preDropValidBlocks: []};

    // grow left and right from the dropped columns across <=1 gaps
    let lo = Math.min(...dropCols), hi = Math.max(...dropCols);
    let changed = true;
    while (changed) {
        changed = false;
        for (const {col} of inRow) {
            if (col < lo && col >= lo - 2) { lo = col; changed = true; }      // <=1 empty col between
            if (col > hi && col <= hi + 2) { hi = col; changed = true; }
        }
    }
    const members = inRow.filter(t => t.col >= lo && t.col <= hi);
    const tiles = members.map(t => t.id);
    const left = members[0].col, right = members[members.length - 1].col;

    // pre-drop valid blocks: contiguous (no-gap) runs among the NON-dropped
    // members that pass isSequenceValid (the board as it was before this drop).
    const pre = members.filter(t => !dropped.has(t.id));
    const preDropValidBlocks = [];
    if (pre.length) {
        let seg = [pre[0]];
        for (let i = 1; i < pre.length; i++) {
            if (pre[i].col === pre[i - 1].col + 1) seg.push(pre[i]);
            else { pushIfValid(seg, preDropValidBlocks); seg = [pre[i]]; }
        }
        pushIfValid(seg, preDropValidBlocks);
    }
    return {tiles, span: {left, right}, preDropValidBlocks};
}

function pushIfValid(seg, out) {
    if (seg.length >= 3) {
        const ids = seg.map(t => t.id);
        if (isSequenceValid(ids)) out.push(ids);
    }
}
```

- [ ] **Step 4: 跑绿**

Run: `npx jest src/tests/arrange-cluster.test.js`
Expected: PASS (2 tests)。

- [ ] **Step 5: commit**

```bash
git add src/rummikub/arrange/cluster.js src/tests/arrange-cluster.test.js
git commit -m "feat(arrange): identify the drop cluster + pre-drop valid blocks

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 2: `arrange/blocks.js` — 枚举含锚点的合法块

**Files:**
- Create: `src/rummikub/arrange/blocks.js`
- Test: `src/tests/arrange-blocks.test.js`

**Interfaces:**
- Consumes: `isSequenceValid`(tile/sequence.js)、`getTileValue`/`getTileColor`/`isJoker`(tile/codec.js)。
- Produces:
  - `isValidBlock(tiles) -> boolean`（`tiles` 已按拟用顺序排列；run 需值序+joker 在空位,group 顺序无关）。
  - `blocksContaining(rem, anchor) -> tileId[][]`：在剩余牌 `rem`(数组)中,枚举**包含 `anchor`** 的所有合法 run/group,每个块按其合法顺序返回。`anchor` 必须是非 joker(joker 作为填充牌出现在别的锚点块里)。**不**生成 13→1 wrap(v1 已知限制,见 §risks)。

- [ ] **Step 1: 写失败测试**

```js
// src/tests/arrange-blocks.test.js
import {isValidBlock, blocksContaining} from '../rummikub/arrange/blocks';
import {buildTileObj, RedJoker} from '../rummikub/util';
import {COLOR} from '../rummikub/constants';

const t = (v, c, variant = 0) => buildTileObj(v, c, variant);
const r = v => t(v, COLOR.red), b = v => t(v, COLOR.blue), k = v => t(v, COLOR.black);

test('isValidBlock accepts a run, a group, and a joker run; rejects junk', () => {
  expect(isValidBlock([r(1), r(2), r(3)])).toBe(true);     // run
  expect(isValidBlock([r(5), b(5), k(5)])).toBe(true);     // group
  expect(isValidBlock([r(5), RedJoker, r(7)])).toBe(true); // run with mid joker = 5,6,7
  expect(isValidBlock([r(1), r(2)])).toBe(false);          // too short
  expect(isValidBlock([r(1), b(2), k(9)])).toBe(false);    // nonsense
});

test('blocksContaining finds the run and group through the anchor', () => {
  // rem has a red run 4-5-6 and a 5-group; anchor red 5 sits in both
  const rem = [r(4), r(5), r(6), b(5), k(5)];
  const blocks = blocksContaining(rem, r(5));
  const asSets = blocks.map(bl => new Set(bl));
  expect(asSets).toContainEqual(new Set([r(4), r(5), r(6)]));
  expect(asSets).toContainEqual(new Set([r(5), b(5), k(5)]));
});

test('blocksContaining uses a joker to fill a run gap', () => {
  const rem = [r(5), r(7), RedJoker];
  const blocks = blocksContaining(rem, r(5));
  // expect a run 5,(J=6),7 in value order with the joker in the middle slot
  expect(blocks.some(bl => bl.length === 3 && bl[0] === r(5) && bl[2] === r(7))).toBe(true);
});
```

- [ ] **Step 2: 跑红**

Run: `npx jest src/tests/arrange-blocks.test.js`
Expected: FAIL — module not found。

- [ ] **Step 3: 实现**

```js
// src/rummikub/arrange/blocks.js
import {isSequenceValid} from "../tile/sequence.js";
import {getTileValue, getTileColor, isJoker} from "../tile/codec.js";

// A block is valid iff isSequenceValid accepts it in the given order. Runs must
// arrive in value order with jokers seated in their gap slots; groups are
// order-independent (the predicates skip jokers).
export function isValidBlock(tiles) {
    return tiles.length >= 3 && isSequenceValid(tiles);
}

// Enumerate every valid run/group (in valid order) drawn from `rem` that
// includes the non-joker `anchor`. Jokers in `rem` are used as wild fillers.
// Does NOT generate a 13->1 wrap run (rare; documented v1 limitation).
export function blocksContaining(rem, anchor) {
    const out = [];
    if (isJoker(anchor)) return out;                 // jokers fill other anchors' blocks
    const av = getTileValue(anchor), ac = getTileColor(anchor);
    const jokers = rem.filter(isJoker);

    // ---- GROUPS: same value av, distinct colours (others != anchor colour), +jokers, size 3..4
    const seen = new Set([ac]);
    const others = [];
    for (const tile of rem) {
        if (isJoker(tile) || getTileValue(tile) !== av) continue;
        const c = getTileColor(tile);
        if (seen.has(c)) continue;
        seen.add(c);
        others.push(tile);
    }
    for (const subset of subsetsUpTo(others, 3)) {   // anchor + up to 3 others = max 4 colours
        for (let j = 0; j <= jokers.length; j++) {
            const size = 1 + subset.length + j;
            if (size < 3 || size > 4) continue;
            const block = [anchor, ...subset, ...jokers.slice(0, j)];
            if (isValidBlock(block)) out.push(block);
        }
    }

    // ---- RUNS: same colour ac, consecutive values containing av, jokers fill gaps, len>=3
    const haveVal = new Map();                        // value -> a tile of that colour/value
    for (const tile of rem) {
        if (isJoker(tile) || getTileColor(tile) !== ac) continue;
        const v = getTileValue(tile);
        if (!haveVal.has(v)) haveVal.set(v, tile);
    }
    for (let lo = Math.max(1, av - 12); lo <= av; lo++) {
        for (let hi = av; hi <= Math.min(13, lo + 12); hi++) {
            if (hi - lo + 1 < 3) continue;
            const block = [];
            let used = 0, ok = true;
            for (let v = lo; v <= hi; v++) {
                if (v === av) block.push(anchor);
                else if (haveVal.has(v)) block.push(haveVal.get(v));
                else if (used < jokers.length) block.push(jokers[used++]);
                else { ok = false; break; }
            }
            if (ok && isValidBlock(block)) out.push(block);
        }
    }
    return out;
}

// All subsets of `arr` with size 0..maxSize, deterministic order.
function subsetsUpTo(arr, maxSize) {
    const res = [[]];
    for (let i = 0; i < arr.length; i++) {
        const cur = res.length;
        for (let j = 0; j < cur; j++) {
            if (res[j].length < maxSize) res.push([...res[j], arr[i]]);
        }
    }
    return res;
}
```

- [ ] **Step 4: 跑绿**

Run: `npx jest src/tests/arrange-blocks.test.js`
Expected: PASS (3 tests)。

- [ ] **Step 5: commit**

```bash
git add src/rummikub/arrange/blocks.js src/tests/arrange-blocks.test.js
git commit -m "feat(arrange): enumerate valid run/group blocks through an anchor (jokers wild)

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 3: `arrange/partition.js` — `bestPartition`(最大覆盖)

**Files:**
- Create: `src/rummikub/arrange/partition.js`
- Test: `src/tests/arrange-partition.test.js`

**Interfaces:**
- Consumes: `blocksContaining`(blocks.js)。
- Produces: `bestPartition(tiles) -> { blocks, leftover }`：把 `tiles`(tileId 数组)切成若干合法块,**最大化覆盖牌数,其次块数最少**,确定性。`blocks` 是 `tileId[][]`(各按合法顺序),`leftover` 是 `tileId[]`。

- [ ] **Step 1: 写失败测试**

```js
// src/tests/arrange-partition.test.js
import {bestPartition} from '../rummikub/arrange/partition';
import {buildTileObj} from '../rummikub/util';
import {COLOR} from '../rummikub/constants';
const r = (v, variant = 0) => buildTileObj(v, COLOR.red, variant);
const b = v => buildTileObj(v, COLOR.blue, 0), k = v => buildTileObj(v, COLOR.black, 0);
const sizes = blocks => blocks.map(bl => bl.length).sort();

test('splits a 5-run + duplicate 3 into two valid runs, zero leftover', () => {
  // {1,2,3,3,4,5} -> 123 + 345
  const p = bestPartition([r(1), r(2), r(3), r(3, 1), r(4), r(5)]);
  expect(p.leftover).toEqual([]);
  expect(sizes(p.blocks)).toEqual([3, 3]);
});

test('covers one run and leaves an unmakeable remainder (size only — leftover identity is a tie)', () => {
  // {r5,r6,r7,b7,k7} has no all-valid partition; max coverage is 3 (a run OR the
  // 7-group), leaving 2 loose. WHICH 3 it keeps is a tie -> assert sizes only.
  // The "keep the pre-drop run" guarantee is partitionCluster's Pass 2 job (Task 4).
  const p = bestPartition([r(5), r(6), r(7), b(7), k(7)]);
  expect(p.blocks).toHaveLength(1);
  expect(p.blocks[0].length).toBe(3);
  expect(p.leftover).toHaveLength(2);
});
```

- [ ] **Step 2: 跑红**

Run: `npx jest src/tests/arrange-partition.test.js`
Expected: FAIL — module not found。

- [ ] **Step 3: 实现**

```js
// src/rummikub/arrange/partition.js
import {blocksContaining} from "./blocks.js";

// Best partition of a tile multiset into valid blocks: maximise covered tiles,
// then fewest blocks, deterministically. Memoised DFS over the remaining sorted
// multiset; at each node either drop the smallest tile to leftover or use it as
// the anchor of a valid block.
export function bestPartition(tiles) {
    const memo = new Map();
    function go(rem) {                       // rem: sorted tileId[]
        if (rem.length < 3) return {blocks: [], leftover: rem.slice(), covered: 0, n: 0};
        const key = rem.join(",");
        const hit = memo.get(key);
        if (hit) return hit;
        // baseline: rem[0] is leftover
        const dropSub = go(rem.slice(1));
        let best = {blocks: dropSub.blocks, leftover: [rem[0], ...dropSub.leftover],
                    covered: dropSub.covered, n: dropSub.n};
        // try rem[0] as the anchor of each candidate block
        for (const block of blocksContaining(rem, rem[0])) {
            const sub = go(removeAll(rem, block));
            const cand = {blocks: [block, ...sub.blocks], leftover: sub.leftover,
                          covered: block.length + sub.covered, n: 1 + sub.n};
            if (cand.covered > best.covered || (cand.covered === best.covered && cand.n < best.n)) {
                best = cand;
            }
        }
        memo.set(key, best);
        return best;
    }
    const res = go([...tiles].sort((a, b) => a - b));
    return {blocks: res.blocks, leftover: res.leftover};
}

// Remove one occurrence of each id in `block` from sorted `rem`, return a new sorted array.
function removeAll(rem, block) {
    const out = rem.slice();
    for (const id of block) {
        const i = out.indexOf(id);
        if (i !== -1) out.splice(i, 1);
    }
    return out;
}
```

- [ ] **Step 4: 跑绿**

Run: `npx jest src/tests/arrange-partition.test.js`
Expected: PASS (2 tests)。

- [ ] **Step 5: commit**

```bash
git add src/rummikub/arrange/partition.js src/tests/arrange-partition.test.js
git commit -m "feat(arrange): bestPartition — max-coverage valid split (memoised DFS)

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 4: `arrange/partition.js` — `partitionCluster`(两遍法)

**Files:**
- Modify: `src/rummikub/arrange/partition.js`(新增导出函数)
- Test: `src/tests/arrange-partition.test.js`(追加)

**Interfaces:**
- Consumes: `bestPartition`(同文件)。
- Produces: `partitionCluster(clusterTiles, preDropValidBlocks) -> { blocks, leftover }`。两遍法:**Pass 1** 若 `bestPartition` 覆盖全部牌(零 leftover)→ 直接用(允许拆既有块)。**Pass 2** 否则:把每个 `preDropValidBlocks` 固定保留,只对其余牌跑 `bestPartition`,固定块 + 新块为 `blocks`、其余为 `leftover`。

- [ ] **Step 1: 追加失败测试**

```js
// 追加到 src/tests/arrange-partition.test.js
import {partitionCluster} from '../rummikub/arrange/partition';

test('Pass1: all-valid split is taken even though it breaks the pre-drop 5-run', () => {
  const pre = [[r(1), r(2), r(3), r(4), r(5)]];
  const p = partitionCluster([r(1), r(2), r(3), r(3, 1), r(4), r(5)], pre);
  expect(p.leftover).toEqual([]);
  expect(sizes(p.blocks)).toEqual([3, 3]);   // 123 + 345
});

test('Pass2: no all-valid -> pre-drop run preserved, new tiles leftover', () => {
  const pre = [[r(5), r(6), r(7)]];
  const p = partitionCluster([r(5), r(6), r(7), b(7), k(7)], pre);
  expect(p.blocks).toEqual([[r(5), r(6), r(7)]]);     // run kept intact
  expect(new Set(p.leftover)).toEqual(new Set([b(7), k(7)]));
});
```

- [ ] **Step 2: 跑红**

Run: `npx jest src/tests/arrange-partition.test.js`
Expected: FAIL — `partitionCluster` is not a function。

- [ ] **Step 3: 实现(追加到 partition.js)**

```js
// Two-pass cluster partition encoding the owner's rule: break an existing valid
// block only if the whole cluster ends all-valid (Pass 1); otherwise keep every
// pre-drop valid block and arrange only the rest (Pass 2).
export function partitionCluster(clusterTiles, preDropValidBlocks) {
    const all = bestPartition(clusterTiles);
    if (all.leftover.length === 0) return all;          // Pass 1: all-valid, breaking allowed

    // Pass 2: fix pre-drop valid blocks, partition the remainder.
    const fixed = preDropValidBlocks.map(b => b.slice());
    let rest = clusterTiles.slice();
    for (const block of fixed) rest = removeOnce(rest, block);
    const sub = bestPartition(rest);
    return {blocks: [...fixed, ...sub.blocks], leftover: sub.leftover};
}

function removeOnce(arr, block) {
    const out = arr.slice();
    for (const id of block) { const i = out.indexOf(id); if (i !== -1) out.splice(i, 1); }
    return out;
}
```

- [ ] **Step 4: 跑绿**

Run: `npx jest src/tests/arrange-partition.test.js`
Expected: PASS (4 tests)。

- [ ] **Step 5: commit**

```bash
git add src/rummikub/arrange/partition.js src/tests/arrange-partition.test.js
git commit -m "feat(arrange): partitionCluster two-pass (break only if cluster goes all-valid)

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 5: `arrange/layout.js` — 行内布局 + 落点选边 + fit/reject

**Files:**
- Create: `src/rummikub/arrange/layout.js`
- Test: `src/tests/arrange-layout.test.js`

**Interfaces:**
- Consumes: `partitionCluster` 的输出 `{blocks, leftover}`、簇 `span`、`getTileValue`/`getTileColor`/`isJoker`(分散牌用)。
- Produces: `layoutCluster({blocks, leftover}, dropSide, span, window) -> { cols } | { reject: true }`。`cols` 是 `{tileId: col}`(行不变,只给列)。`window = {left, right}` 是簇**允许占用的列闭区间**(由编排器算出 —— 簇与最近的非簇牌之间留 ≥1 空列,否则到板边),保证**绝不与非簇内的牌碰撞**。规则:合法块按其(合法)顺序铺、按最小点数升序排列、块间隔 1 空列;散牌与块隔 ≥1 空列,能凑一起的散牌聚拢、不相干的隔开;**散牌贴在哪一侧 = `dropSide`**(`'left'` → 散牌单元排在合法块**左边**;`'right'` → 排右边)。锚定:`dropSide==='right'` 让左缘贴 `span.left`、向右生长;`'left'` 让右缘贴 `span.right`、向左生长;锚定结果钳进 `window`。总宽度超出 `window` 容量则 `{reject:true}`(**绝不移动非簇内的牌**)。

`dropSide` 由编排器(Task 6)按落点列与 `span` 决定:落点 ≤ `span.left` → `'left'`,否则 `'right'`(平手归右)。

散牌分组规则(同一组聚拢):两张散牌**相关** = 同点数(半个 group)或同色且点数差 1(半条 run)。把 leftover 用并查集按「相关」聚成小组,小组内相邻、小组之间隔 1 空列。

- [ ] **Step 1: 写失败测试**

```js
// src/tests/arrange-layout.test.js
import {layoutCluster} from '../rummikub/arrange/layout';
import {buildTileObj} from '../rummikub/util';
import {COLOR} from '../rummikub/constants';
const r = v => buildTileObj(v, COLOR.red, 0);
const b = v => buildTileObj(v, COLOR.blue, 0), k = v => buildTileObj(v, COLOR.black, 0), y = v => buildTileObj(v, COLOR.yellow, 0);

// helper: render cols map to a compact "a b _ c" string by column
function renderRow(cols) {
  const byCol = Object.entries(cols).map(([id, c]) => ({id: Number(id), c})).sort((x, y) => x.c - y.c);
  let out = [], prev = byCol[0].c;
  for (const {id, c} of byCol) { while (c > prev) { out.push('_'); prev++; } out.push(String(id)); prev = c + 1; }
  return out.join(' ');
}

test('two valid blocks are separated by exactly one gap, ascending', () => {
  const part = {blocks: [[r(1), r(2), r(3)], [r(3, 1), r(4), r(5)]], leftover: []};
  const res = layoutCluster(part, 'right', {left: 0, right: 5}, {left: 0, right: 31});
  // 1 2 3 _ 3 4 5
  expect(renderRow(res.cols)).toBe(`${r(1)} ${r(2)} ${r(3)} _ ${r(3, 1)} ${r(4)} ${r(5)}`);
});

test('leftover sits >=1 gap on the drop side (right)', () => {
  const part = {blocks: [[r(5), r(6), r(7)]], leftover: [b(7), k(7)]};
  const res = layoutCluster(part, 'right', {left: 0, right: 2}, {left: 0, right: 31});
  // r5 r6 r7 _ b7 k7
  expect(renderRow(res.cols)).toBe(`${r(5)} ${r(6)} ${r(7)} _ ${b(7)} ${k(7)}`);
});

test('leftover sits on the LEFT when dropSide is left', () => {
  const part = {blocks: [[r(5), r(6), r(7)]], leftover: [b(7), k(7)]};
  const res = layoutCluster(part, 'left', {left: 0, right: 2}, {left: 0, right: 31});
  // b7 k7 _ r5 r6 r7
  expect(renderRow(res.cols)).toBe(`${b(7)} ${k(7)} _ ${r(5)} ${r(6)} ${r(7)}`);
});

test('unrelated leftover tiles are gap-separated', () => {
  const part = {blocks: [[r(5), r(6), r(7)]], leftover: [b(7), y(2)]};
  const res = layoutCluster(part, 'right', {left: 0, right: 2}, {left: 0, right: 31});
  // r5 r6 r7 _ b7 _ y2  (order of the two singleton leftovers is deterministic by tile int)
  expect(renderRow(res.cols)).toMatch(/_ \d+ _ \d+$/);
});

test('rejects when the window is too narrow to fit the layout', () => {
  const part = {blocks: [[r(1), r(2), r(3)], [r(3, 1), r(4), r(5)]], leftover: []};
  const res = layoutCluster(part, 'right', {left: 30, right: 31}, {left: 30, right: 31}); // width 7 > 2
  expect(res.reject).toBe(true);
});
```

- [ ] **Step 2: 跑红**

Run: `npx jest src/tests/arrange-layout.test.js`
Expected: FAIL — module not found。

- [ ] **Step 3: 实现**

```js
// src/rummikub/arrange/layout.js
import {getTileValue, getTileColor, isJoker} from "../tile/codec.js";

// Lay the cluster's blocks + leftover into columns (row unchanged). Valid blocks
// keep their solver order, are ordered left-to-right by smallest value, and are
// separated by one empty column. Leftover keeps >=1 gap from blocks; related
// loose tiles (same value, or same colour & adjacent value) stay together,
// unrelated ones are gap-separated. Leftover units sit on the `dropSide`. The
// run of units is anchored to `span` on the drop side and clamped into `window`
// (the columns the cluster may occupy without touching a non-cluster tile);
// overflowing the window rejects (never moves a non-cluster tile).
export function layoutCluster({blocks, leftover}, dropSide, span, window) {
    const orderedBlocks = blocks.slice().sort((a, b) => minVal(a) - minVal(b));
    const groups = groupLeftover(leftover);
    const units = dropSide === "left" ? [...groups, ...orderedBlocks] : [...orderedBlocks, ...groups];
    if (!units.length) return {cols: {}};

    const width = units.reduce((s, u) => s + u.length, 0) + (units.length - 1);
    if (width > window.right - window.left + 1) return {reject: true};

    let start = dropSide === "left" ? span.right - width + 1 : span.left;
    start = Math.max(window.left, Math.min(start, window.right - width + 1)); // clamp into window
    const cols = {};
    let c = start;
    for (const unit of units) { for (const id of unit) cols[id] = c++; c++; /* one gap */ }
    return {cols};
}

// Smallest non-joker value in a block (jokers don't anchor ordering).
function minVal(block) {
    let m = 99;
    for (const id of block) if (!isJoker(id)) m = Math.min(m, getTileValue(id));
    return m === 99 ? 0 : m;
}

// Cluster leftover into "related" groups: same value (partial group) OR same
// colour & adjacent value (partial run). Union-find over the loose tiles.
function groupLeftover(leftover) {
    const n = leftover.length;
    const parent = leftover.map((_, i) => i);
    const find = i => (parent[i] === i ? i : (parent[i] = find(parent[i])));
    const related = (a, b) => {
        if (isJoker(a) || isJoker(b)) return true;     // a joker pairs with anything loose
        const sameVal = getTileValue(a) === getTileValue(b);
        const sameColAdj = getTileColor(a) === getTileColor(b) && Math.abs(getTileValue(a) - getTileValue(b)) === 1;
        return sameVal || sameColAdj;
    };
    for (let i = 0; i < n; i++)
        for (let j = i + 1; j < n; j++)
            if (related(leftover[i], leftover[j])) parent[find(i)] = find(j);
    const groups = new Map();
    for (let i = 0; i < n; i++) {
        const r = find(i);
        if (!groups.has(r)) groups.set(r, []);
        groups.get(r).push(leftover[i]);
    }
    return [...groups.values()];
}
```

- [ ] **Step 4: 跑绿**

Run: `npx jest src/tests/arrange-layout.test.js`
Expected: PASS (4 tests)。

- [ ] **Step 5: commit**

```bash
git add src/rummikub/arrange/layout.js src/tests/arrange-layout.test.js
git commit -m "feat(arrange): in-row layout — separators, leftover grouping, drop-side, fit/reject

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 6: `arrange/index.js` — `arrangeBoard` 编排器

**Files:**
- Create: `src/rummikub/arrange/index.js`
- Test: `src/tests/arrange-board.test.js`

**Interfaces:**
- Consumes: `identifyCluster`、`partitionCluster`、`layoutCluster`。
- Produces: `arrangeBoard(tilePositions, drop) -> { placements, ok }`,`drop = {droppedIds, row, col}`。流程:把 `droppedIds` 视为已落在 `(row, 从 col 起的连续列)` → `identifyCluster` → `partitionCluster` → 按 `col` vs `span` 定 `dropSide` → `layoutCluster`。`placements` = `{tileId: {gridId:'b', row, col}}`(仅簇内牌);`reject` → `{placements:{}, ok:false}`。**纯函数、确定性**。

- [ ] **Step 1: 写失败测试**

```js
// src/tests/arrange-board.test.js
import {arrangeBoard} from '../rummikub/arrange/index';
import {buildTileObj} from '../rummikub/util';
import {COLOR} from '../rummikub/constants';
const r = (v, variant = 0) => buildTileObj(v, COLOR.red, variant);

function rowAt(map, row = 2) {
  const tp = {};
  for (const [col, id] of Object.entries(map)) tp[id] = {id: Number(id), col: Number(col), row, gridId: 'b'};
  return tp;
}
const colOf = (res, id) => res.placements[id].col;

test('inserting a duplicate 3 into 1-2-3-4-5 yields 123 _ 345', () => {
  // existing run at cols 0..4, the dropped duplicate-3 already written at col 5 by the move
  const tp = rowAt({0: r(1), 1: r(2), 2: r(3), 3: r(4), 4: r(5), 5: r(3, 1)});
  const res = arrangeBoard(tp, {droppedIds: [r(3, 1)], row: 2, col: 5});
  expect(res.ok).toBe(true);
  // the six tiles occupy 0..6 as 1 2 3 _ 3 4 5 (some order); assert the gap pattern via columns
  const cols = [r(1), r(2), r(3), r(3, 1), r(4), r(5)].map(id => colOf(res, id)).sort((a, b) => a - b);
  expect(cols).toEqual([0, 1, 2, 4, 5, 6]);   // exactly one gap at col 3
});
```

- [ ] **Step 2: 跑红**

Run: `npx jest src/tests/arrange-board.test.js`
Expected: FAIL — module not found。

- [ ] **Step 3: 实现**

```js
// src/rummikub/arrange/index.js
import {BOARD_COLS, BOARD_GRID_ID} from "../constants.js";
import {identifyCluster} from "./cluster.js";
import {partitionCluster} from "./partition.js";
import {layoutCluster} from "./layout.js";

// Pure, deterministic. Given the board after the dropped tiles were written at
// (row, col..), reflow the cluster they landed in toward valid blocks. Returns
// {placements: {tileId: {gridId:'b', row, col}}, ok}. ok:false => reject (the
// move turns it into INVALID_MOVE, a non-destructive snap-back).
export function arrangeBoard(tilePositions, drop) {
    const {droppedIds, row, col} = drop;
    const cluster = identifyCluster(tilePositions, row, droppedIds);
    if (!cluster.tiles.length) return {placements: {}, ok: true};

    const part = partitionCluster(cluster.tiles, cluster.preDropValidBlocks);
    const dropSide = col <= cluster.span.left ? "left" : "right";
    const window = freeWindow(tilePositions, row, cluster.tiles, cluster.span);
    const laid = layoutCluster(part, dropSide, cluster.span, window);
    if (laid.reject) return {placements: {}, ok: false};

    const placements = {};
    for (const id in laid.cols) {
        placements[id] = {gridId: BOARD_GRID_ID, row, col: laid.cols[id]};
    }
    return {placements, ok: true};
}

// The column range [left, right] the cluster may occupy without touching a
// non-cluster tile in the same row (one empty column kept between them, or the
// board edge). Guarantees the layout never collides with or fuses into a
// neighbour set.
function freeWindow(tilePositions, row, clusterTiles, span) {
    const inCluster = new Set(clusterTiles);
    let leftNeighbor = -2, rightNeighbor = BOARD_COLS + 1;
    for (const id in tilePositions) {
        const p = tilePositions[id];
        if (!p || p.gridId !== BOARD_GRID_ID || p.row !== row || inCluster.has(Number(id))) continue;
        if (p.col < span.left && p.col > leftNeighbor) leftNeighbor = p.col;
        if (p.col > span.right && p.col < rightNeighbor) rightNeighbor = p.col;
    }
    return {left: leftNeighbor + 2, right: rightNeighbor - 2};
}
```

- [ ] **Step 4: 跑绿**

Run: `npx jest src/tests/arrange-board.test.js`
Expected: PASS (1 test)。

- [ ] **Step 5: commit**

```bash
git add src/rummikub/arrange/index.js src/tests/arrange-board.test.js
git commit -m "feat(arrange): arrangeBoard orchestrator (cluster -> partition -> layout)

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 7: 接入 move — `insertTilesWithPush` 改用 `arrangeBoard`

**Files:**
- Modify: `src/rummikub/moves.js`(`insertTilesWithPush` 函数,见现状 `function insertTilesWithPush({G, ctx, playerID}, col, row, destGridId, tileIdObj, selectedTiles)`)
- Test: `src/tests/arrange-move.test.js`

**Interfaces:**
- Consumes: `arrangeBoard`(arrange/index.js)。
- 行为:沿用现有签名与守卫(currentPlayer、destGridId==='b'、hand→board 的 playerID/phase 校验、`gameStateStack.push(getGameState(G))` 一次快照)。**先**把 `selection` 的牌写到 `(row, col..)`(临时落点,hand→board 置 `{tmp:true, playerID:null}`、board→board 保持 flags),**再**调 `arrangeBoard(G.tilePositions, {droppedIds: selection, row, col})`;`ok:false` → `INVALID_MOVE`(immer 丢弃整个 draft,等于没落);`ok:true` → 把 `placements` 写回 `G.tilePositions`(只改 col/row)。

- [ ] **Step 1: 写失败测试**

```js
// src/tests/arrange-move.test.js
import {Client} from 'boardgame.io/client';
import {Local} from 'boardgame.io/multiplayer';
import {makeMatch} from './__helpers__/makeMatch';
import {buildTileObj} from '../rummikub/util';
import {COLOR, BOARD_GRID_ID, HAND_GRID_ID} from '../rummikub/constants';
const r = (v, variant = 0) => buildTileObj(v, COLOR.red, variant);

test('dropping a duplicate 3 onto a board 1-2-3-4-5 reflows to 123 _ 345', () => {
  const tilePositions = {};
  // committed red run 1..5 on the board, row 0, cols 0..4
  [1, 2, 3, 4, 5].forEach((v, i) => { const id = r(v); tilePositions[id] = {id, col: i, row: 0, gridId: BOARD_GRID_ID}; });
  // a duplicate red 3 in player 0's hand
  const dup = r(3, 1);
  tilePositions[dup] = {id: dup, col: 0, row: 0, gridId: HAND_GRID_ID, playerID: '0'};
  const game = makeMatch({tilePositions, prevTilePositions: tilePositions, firstMoveDone: [true, true]});
  const c0 = Client({game, multiplayer: Local(), playerID: '0'});
  c0.start();
  c0.events.endPhase();

  c0.moves.insertTilesWithPush(5, 0, BOARD_GRID_ID, {id: dup}, [dup]); // drop the dup at col 5

  const {G} = c0.getState();
  const cols = [r(1), r(2), r(3), dup, r(4), r(5)].map(id => G.tilePositions[id].col).sort((a, b) => a - b);
  expect(cols).toEqual([0, 1, 2, 4, 5, 6]); // 1 2 3 _ 3 4 5
});
```

- [ ] **Step 2: 跑红**

Run: `npx jest src/tests/arrange-move.test.js`
Expected: FAIL —（仍是旧几何 push 的结果,列不符）。

- [ ] **Step 3: 实现(替换 `insertTilesWithPush` 的 push 段为 arrange)**

```js
// src/rummikub/moves.js — replace the body of insertTilesWithPush with:
function insertTilesWithPush({G, ctx, playerID}, col, row, destGridId, tileIdObj, selectedTiles) {
    if (playerID !== ctx.currentPlayer) return INVALID_MOVE;
    if (destGridId !== BOARD_GRID_ID) return INVALID_MOVE;

    const tileId = tileIdObj.id;
    const selection = (selectedTiles.length && selectedTiles.indexOf(tileId) !== -1)
        ? orderTilesBySource(selectedTiles, G.tilePositions)
        : [tileId];

    // 1) write the dropped tiles to the landing columns (col, col+1, ...) as tmp.
    for (let i = 0; i < selection.length; i++) {
        const id = selection[i];
        const p = G.tilePositions[id];
        if (!p) return INVALID_MOVE;
        let flags;
        if (p.gridId === HAND_GRID_ID) {
            if (String(p.playerID) !== String(playerID)) return INVALID_MOVE;
            if (ctx.phase === 'playersJoin') return INVALID_MOVE;
            flags = {tmp: true, playerID: null};
        } else if (p.gridId === BOARD_GRID_ID) {
            flags = {tmp: p.tmp, playerID: p.playerID};
        } else {
            return INVALID_MOVE;
        }
        G.tilePositions[id] = {id, col: col + i, row, gridId: BOARD_GRID_ID, ...flags};
    }

    // 2) reflow the cluster the drop landed in (pure, server-authoritative).
    const result = arrangeBoard(G.tilePositions, {droppedIds: selection, row, col});
    if (!result.ok) return INVALID_MOVE;   // immer discards the draft -> non-destructive snap-back

    // 3) one snapshot so a single undo restores the whole arrangement.
    if (ctx.currentPlayer === playerID) G.gameStateStack.push(getGameState(G));

    for (const id in result.placements) {
        const p = G.tilePositions[id];
        const {row: nr, col: nc} = result.placements[id];
        G.tilePositions[id] = {...p, row: nr, col: nc};
    }
}
```
并在 moves.js 顶部加 `import {arrangeBoard} from "./arrange/index.js";`(显式 `.js` 以便 `node src/server.js` 启动)。`insertWithPush`/`boardRowTiles` 若不再被 moves.js 引用,移除该 import(避免新 lint warning;`insertPush.js` 文件保留给后续计划的横向平移复用)。

> 注意 immer:步骤 1 在 draft 上写了临时落点,步骤 2 的 `arrangeBoard` 读的是 draft 当前的 `G.tilePositions`(含临时落点)——这正是 `arrangeBoard` 期望的「牌已落下后的板」。步骤 2 返回 `ok:false` 时直接 `return INVALID_MOVE`,boardgame.io 丢弃整个 draft,步骤 1 的临时写入一并作废。

- [ ] **Step 4: 跑绿 + 全量**

Run: `npx jest src/tests/arrange-move.test.js`
Expected: PASS。
Run: `npx jest 2>&1 | tail -5`
Expected: 仅 Task 8 将重写的旧 push 测试(`insert-tiles-with-push`、`board-insert-push-dispatch`)可能红 —— 这是预期(行为变更),Task 8 修。其余绿。

- [ ] **Step 5: commit**

```bash
git add src/rummikub/moves.js src/tests/arrange-move.test.js
git commit -m "feat(arrange): insertTilesWithPush move calls arrangeBoard (semantic reflow)

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 8: dispatch 收尾 + 重写旧几何 push 测试

**Files:**
- Modify: `src/rummikub/dndUtil.js`(`resolveDropDispatch`)、`src/rummikub/components/hooks/useDropDispatch.js`(如需)
- Rewrite: `src/tests/insert-tiles-with-push.test.js`、`src/tests/board-insert-push-dispatch.test.js`
- 视情况 update: `src/tests/multi-drag-order.test.js`、`src/tests/tap-to-place.test.js`

**Interfaces:**
- `resolveDropDispatch` 保留 joker-retrieve 分支(`kind:'joker'`);把原来 `occupiedInRun || bridge` 的几何判定去掉,**board 落点统一返回 `{kind:'push', args:[col, row, BOARD_GRID_ID, {id: primaryId}, selection]}`**(沿用现有 `moves.insertTilesWithPush` 入口,现在它内部走 arrange)。hand 落点仍走 `snap`(`moves.moveTiles`)。这样客户端不再做几何决策,语义整理全在 move 里(服务端权威 + 客户端乐观一致)。

- [ ] **Step 1: 改 `resolveDropDispatch`**

把 board 分支简化为(保留 joker-swap 在最前):
```js
// after the joker-swap block, for a board target:
if (isBoard) {
    const inBounds = col >= 0 && col + N <= boardCols;
    if (!inBounds) {
        const result = resolveDropSlot(target, isOccupied, N, maxCols);
        if (!result.ok) return {kind: 'reject', args: []};
        return {kind: 'snap', args: [result.cols[0], row, gridId, {id: primaryId}, selection]};
    }
    return {kind: 'push', args: [col, row, BOARD_GRID_ID, {id: primaryId}, orderTilesBySource(sel, tilePositions)]};
}
```
（hand 落点维持原 snap 逻辑不变。）若 `insertWithPush`/`boardRowTiles` 不再被 dndUtil.js 引用则移除其 import。

- [ ] **Step 2: 重写旧测试为语义断言**

`insert-tiles-with-push.test.js`:删掉断言「几何挤开」的用例,替换为 §10 的语义结果。完整模板(放进文件,照此把 §10 其余单行例子补齐):
```js
// src/tests/insert-tiles-with-push.test.js  (rewritten for the semantic engine)
import {Client} from 'boardgame.io/client';
import {Local} from 'boardgame.io/multiplayer';
import {makeMatch} from './__helpers__/makeMatch';
import {buildTileObj} from '../rummikub/util';
import {COLOR, BOARD_GRID_ID, HAND_GRID_ID} from '../rummikub/constants';
const r = v => buildTileObj(v, COLOR.red, 0);

// §10 #2: placing 7-8-9 right next to a committed 1-2-3 auto-separates them with
// a gap (123 _ 789) instead of fusing into an invalid 123789.
test('a run dropped flush against another run is auto-separated by a gap', () => {
  const tp = {};
  [1, 2, 3].forEach((v, i) => { const id = r(v); tp[id] = {id, col: i, row: 0, gridId: BOARD_GRID_ID}; });
  [7, 8, 9].forEach((v, i) => { const id = r(v); tp[id] = {id, col: 10 + i, row: 0, gridId: HAND_GRID_ID, playerID: '0'}; });
  const game = makeMatch({tilePositions: tp, prevTilePositions: tp, firstMoveDone: [true, true]});
  const c0 = Client({game, multiplayer: Local(), playerID: '0'});
  c0.start(); c0.events.endPhase();

  // drop 7-8-9 at col 3 (immediately right of the 1-2-3 occupying cols 0..2)
  c0.moves.insertTilesWithPush(3, 0, BOARD_GRID_ID, {id: r(7)}, [r(7), r(8), r(9)]);

  const {G} = c0.getState();
  const c = id => G.tilePositions[id].col;
  // 1 2 3 _ 7 8 9  -> exactly one empty column between the two runs
  expect([c(r(1)), c(r(2)), c(r(3))].sort((a, b) => a - b)).toEqual([0, 1, 2]);
  expect([c(r(7)), c(r(8)), c(r(9))].sort((a, b) => a - b)).toEqual([4, 5, 6]);
});
```
`board-insert-push-dispatch.test.js`:把「dispatch 返回 push 计划且 move 几何挤开」的断言,改为「dispatch board 落点返回 `kind:'push'`、move 后列呈 §10 语义结果」(同样用上面这套 Client harness)。

> 实现者:用上面这套 Client harness 风格,逐条把 §10 表里属于「单行、无跨行」的例子(#1、#2、#3、#5、#5b、#7、#7b、#8、#10、#11)写成断言;需要 joker 的用 `RedJoker`/`BlackJoker`(从 `../rummikub/util` 引入)。#9(跨行让位)不在本计划范围,不要写。每条断言列模式(空格位置),不必断言绝对列以外的细节。

- [ ] **Step 3: 跑相关测试**

Run: `npx jest src/tests/insert-tiles-with-push.test.js src/tests/board-insert-push-dispatch.test.js src/tests/board-joker-swap-dispatch.test.js src/tests/multi-drag-order.test.js src/tests/tap-to-place.test.js`
Expected: 全绿(joker-swap 不变;multi-drag/tap 若布局结果变了就更新其期望为新语义结果)。

- [ ] **Step 4: 全量 + 构建 + lint + DOM-free**

Run: `npx jest 2>&1 | tail -5`（全绿）
Run: `npm run build 2>&1 | tail -3`（OK）
Run: `npm run lint 2>&1 | tail -3`（仅 2 个已知 error,无新增）
Run: `npx jest src/tests/server-graph-dom-free.test.js`（绿 —— 注意:若希望守住 arrange/ 的 DOM-free,可把 `arrange/cluster|blocks|partition|layout|index` 加进该测试的 SERVER_GRAPH_MODULES 列表,本步顺手加上)

- [ ] **Step 5: commit**

```bash
git add -A
git commit -m "feat(arrange): route board drops through the semantic move; rewrite geometric-push tests

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## 最终验证(合并前)

- [ ] `npx jest` 全绿;`npm run build` OK;`npm run lint` 无新 error;`PORT=9261 node --env-file=.env src/server.js` → `/games` == `["RummyCube"]`。
- [ ] DOM-free:`grep -rn "document\|window\|navigator" src/rummikub/arrange/` 为空。
- [ ] 本地视觉冒烟:`npx vite preview` + 本地后端,开一局,验证 §10 的几个例子(尤其 #1 `123_345`、#3 合并、#5 散牌选边)。
- [ ] 整盘:whole-branch review → finishing-a-development-branch(ff-merge)→ 部署(podman build + bake 检查 + restart + live `/games` + 落牌冒烟)。

## 已知限制 / 后续计划

- **不生成 13→1 wrap 顺子**:求解器不会主动把 `11 12 13 1` 拼出来(`isSequenceValid` 仍接受玩家手动摆的 wrap)。罕见,v1 不做。
- **稳定性平手**:Pass 1 多个等价全合法切分时按确定性 first-found,未做「最少移动」启发式。§10 例子不依赖它;可作后续打磨。
- **后续计划(第二份,§6.4 空间管理)**:横向平移完整组让位 + 跨行搬家 + 连锁 + 居中方向偏好(§10 例 #9)。本计划放不下时直接拒绝,绝不移动非簇内牌;后续计划把「拒绝」升级为「让位/搬家」。`insertPush.js` 的列位移可复用。
- **后续计划(第三份,不滚动自适应)**:去掉 `.ref overflow:auto`,按可用面积缩放格子,整桌一屏可见。

## Self-Review

- **Spec coverage**:§6.1→Task 1;§6.2(两遍法/joker/有界 DFS)→Task 2-4;§6.3(顺序/分隔/散牌/选边)→Task 5;§8 架构(纯引擎/服务端 move/原子性/取代几何 push)→Task 6-8;§10 例 #1-8,#10,#11 → Task 1-8 的测试;§6.4(空间管理)与例 #9 **明确移到后续计划**(本计划范围说明 + 已知限制已注明)。无遗漏。
- **类型一致**:`identifyCluster→{tiles,span,preDropValidBlocks}`、`blocksContaining→tileId[][]`、`bestPartition/partitionCluster→{blocks,leftover}`、`layoutCluster→{cols}|{reject}`、`arrangeBoard→{placements,ok}`、`placements[id]={gridId,row,col}` 全程一致。
- **无占位符**:每个代码步骤含完整可运行代码与确切命令。
