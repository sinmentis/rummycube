# 不滚动自适应盘面 — 实现计划 (自动整理 第三份 / 收尾)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 9 行盘面在常规视口内一屏全显、无需竖向滚动;空间不够低于清晰度下限时才回退到滚动。纯 CSS。

**Architecture:** 把盘面网格(仅 `.ref` 内)行高从写死的 `7vh` 改成 `repeat(9, minmax(var(--board-row-min,34px), 1fr))`,让 `.ref` 成为 flex 列、网格 `height:100%` 撑满,9 行均分可用高度。牌与 faint 格线从钉死的 `7vh` 改成跟随格子。手牌网格、引擎、move、JS 一律不动。

**Tech Stack:** 纯 CSS(`src/rummikub/components/board.css`)。React 18 / Vite。无新依赖。

**Spec:** `docs/superpowers/specs/2026-06-28-no-scroll-fit-design.md`(§B 机制、§C 牌/格线、§F 验证)。

## Global Constraints

- 纯 CSS,**不改** `GridContainer.jsx` 逻辑、手牌网格行高、引擎、move、游戏状态(理想只改 `board.css`)。inline `gridTemplateRows: repeat(rows,7vh)` 用 `.ref .grid-container { … !important }` 覆盖(复刻既有手机端列宽 `!important` 覆盖,board.css:1115)。
- 仅作用于盘面(`.ref` 内);手牌牌(rack 内、`.ref` 外)保持 44px 触摸尺寸不变。
- 桌面 54vh 托盘 cap(board.css:48)+ 抬高 rack 美学**保留**。
- `repeat(9,…)` 的 9 镜像 `BOARD_ROWS`(与既有 `repeat(32,…)` 镜像 `BOARD_COLS` 约定一致)。
- 清晰度下限做成 CSS 变量 `--board-row-min`,默认 `34px`,可调。
- 无新依赖;lint 不新增 error(现有 2 个 App.jsx:29 / Hand.jsx:11 不算)。
- 代码/标识符/注释/commit 英文;Conventional Commits + trailer `Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>`。

## File Structure

- **Modify** `src/rummikub/components/board.css` — 唯一改动文件。6 处编辑(下列 Task 步骤逐一给出确切前后文)。

---

### Task 1: 盘面行高自适应 + 牌/格线跟随(纯 CSS)

**Files:**
- Modify: `src/rummikub/components/board.css`
- Verify: playwright 三视口冒烟(无 jest 单测 — CSS 布局 jsdom 测不了,见 §F)

**Interfaces:**
- Consumes: GridContainer 渲染的 `.ref > div`(Centered 包裹,inline `width`)→ `.grid-container`(inline `gridTemplateColumns/Rows`);`BOARD_ROWS=9`、`BOARD_COLS=32`。
- Produces: 盘面 `.ref` 内 9 行均分高度、不滚(够高时);牌/格线随格子缩放。无新选择器导出,无 JS 契约变化。

- [ ] **Step 1: `.ref` 改 flex 列(撑起高度链)**

board.css 当前(75-79):
```css
.ref {
    flex: 1 1 auto;
    min-height: 0;
    overflow: auto;
}
```
改为:
```css
.ref {
    flex: 1 1 auto;
    min-height: 0;
    overflow: auto;
    display: flex;
    flex-direction: column;
}

/* The GridContainer "Centered" wrapper: stretch to fill .ref's height so the
   grid's 1fr rows have a definite height to divide (else 1fr collapses to the
   tile min and the fit never happens). Width stays from its inline style. */
.ref > div {
    flex: 1 1 auto;
    min-height: 0;
}
```
`display:flex` 只在基础 `.ref` 声明 → 桌面 + 手机都生效(手机 `.ref` 不重置 display)。`.ref > div` 基础规则同样两端通用(手机 `.ref > div` 只设 width/margin,不重置 flex)。

- [ ] **Step 2: 盘面网格行高自适应 + 高度填满 + 竖向格线对齐**

board.css 当前(331-347,U9 托盘规则)末尾的 background 段:
```css
    background-image:
        linear-gradient(to right, rgba(255, 255, 255, .04) 1px, transparent 1px),
        linear-gradient(to bottom, rgba(255, 255, 255, .04) 1px, transparent 1px);
    background-size: 2.2vw 7vh, 2.2vw 7vh;
    background-position: 0 0;
}
```
把这个 `.ref div.grid-container` 规则补上行高自适应 + 填满高度,并把竖向格线尺寸由 `7vh` 改 `calc(100% / 9)`(网格容器高 = 9 行总高)。将上面整段替换为:
```css
    background-image:
        linear-gradient(to right, rgba(255, 255, 255, .04) 1px, transparent 1px),
        linear-gradient(to bottom, rgba(255, 255, 255, .04) 1px, transparent 1px);
    /* Cell lines follow the now-responsive row height: vertical = 1/9 of the
       container height; horizontal stays at the fixed desktop col (2.2vw). */
    background-size: 2.2vw calc(100% / 9), 2.2vw calc(100% / 9);
    background-position: 0 0;
    /* Fill .ref so 1fr rows divide the available height; clamp each row to a
       legibility floor, then .ref's overflow:auto takes over (scroll fallback). */
    height: 100%;
    margin-top: 0;
    grid-template-rows: repeat(9, minmax(var(--board-row-min, 34px), 1fr)) !important;
}
```
(`margin-top:0` 抵掉全局 `.grid-container { margin-top:1.5vh }`,免得 `height:100%` 再加 1.5vh 溢出;托盘边框已经框住网格。`!important` 覆盖 GridContainer 写在元素上的 inline `repeat(9,7vh)`。)

- [ ] **Step 3: 盘面牌填满格子(桌面基础规则)**

新增基础规则(放在基础 `div.tile` 规则附近,约 409 行之后):盘面格子内补 2px 内距当牌间缝,牌填满。
```css
/* Board cells size responsively (Step 2), so board tiles fill their cell
   instead of the fixed 2.0vw/5.4vh of the base .tile. A 2px cell padding keeps
   a constant inter-tile gap at any cell size. Hand tiles (outside .ref) keep
   their 44px touch size. */
.ref .grid-item {
    padding: 2px;
}
.ref div.tile {
    width: 100%;
    height: 100%;
    font-size: clamp(9px, 1.4vw, 22px);
}
```
`.ref div.tile`(0,2,1)胜过基础 `div.tile`(0,1,1)。手机端 `.ref div.tile`(在 @media 内,1167)在 ≤820 覆盖本规则,见 Step 4。

- [ ] **Step 4: 手机端跟随(格线竖向 + 牌填满)**

board.css 手机 `.ref .grid-container`(1114-1118)当前:
```css
    .ref .grid-container {
        grid-template-columns: repeat(32, minmax(0, 1fr)) !important;
        /* keep the faint cell lines aligned to the fitted mobile track */
        background-size: calc(100% / 32) 7vh, calc(100% / 32) 7vh;
    }
```
竖向 `7vh` → `calc(100% / 9)`:
```css
    .ref .grid-container {
        grid-template-columns: repeat(32, minmax(0, 1fr)) !important;
        /* keep the faint cell lines aligned to the fitted mobile track */
        background-size: calc(100% / 32) calc(100% / 9), calc(100% / 32) calc(100% / 9);
    }
```
board.css 手机 `.ref div.tile`(1167-1175)当前 `height: 5.4vh;` → 填满格子 `height: 100%;`(其余行不动):
```css
    .ref div.tile {
        width: 100%;
        height: 100%;
        min-width: 0;
        min-height: 0;
        border-radius: 3px;
        font-size: clamp(8px, 2.6vw, 14px);
        overflow: hidden;
    }
```
(行高自适应规则已在 Step 2 的基础 `.ref div.grid-container` 里,两端通用,手机无需重复。)

- [ ] **Step 5: 构建 + lint + 全量 jest**

```bash
npm run build 2>&1 | tail -3        # OK
npm run lint 2>&1 | tail -3         # 仅 2 个已知 error,无新增
npx jest 2>&1 | tail -5             # 全绿(确认没碰坏 visual-system-a.test.js 等)
```
Expected: build OK;lint 2 个 baseline error;jest 全绿(本改动不增/改 jest 测试)。

- [ ] **Step 6: playwright 三视口冒烟(合并前手动门禁)**

本地起 vite preview + 后端(或直接对 live 之外的本地构建),用 playwright:
1. **桌面 1280×800**:进对局,盘面铺到第 8-9 行 → 断言 `.ref` 无竖向滚动:`scrollHeight - clientHeight <= 1`;牌可读(字号 ≥ ~12px)。
2. **手机 390×844**:同样 9 行全显、`.ref` 不滚。
3. **极矮 1280×360**:应**回退滚动** `scrollHeight > clientHeight`;不报错、布局不崩、rack 仍在底部可见。

记录三个视口的 `scrollHeight/clientHeight` 数值。若桌面/手机仍微溢出,调 `--board-row-min`(默认 34px)或 `.ref` padding,直到 1-2 不滚、3 兜底滚。

- [ ] **Step 7: commit**

```bash
git add src/rummikub/components/board.css
git commit -m "feat(board): fit the 9-row board to the viewport, no vertical scroll

Row height was hard-coded 7vh (63vh for 9 rows), forcing a vertical scroll
inside the 54vh desktop tray and the shorter mobile board region. Make board
rows minmax(--board-row-min,1fr) filling .ref, so the 9 rows share the
available height (no scroll) down to a legibility floor, then overflow:auto
takes over. Board tiles and the faint cell lines follow the responsive cell.
Hand grid, engine, and moves unchanged.

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## 最终验证(合并前)

- [ ] `npm run build` OK;`npm run lint` 无新 error;`npx jest` 全绿。
- [ ] playwright 三视口:桌面 + 手机不滚、极矮窗兜底滚,数值记录在案。
- [ ] finishing-a-development-branch(ff-merge)→ 部署(podman build + bake 检查 + restart + live `/games` + 三视口线上复跑冒烟)。

## 已知限制 / 后续

- 下限以下仍滚动是有意为之(用户选定乙);极小屏全显需更激进缩放/横向折行,YAGNI 不做。
- 高度受限时牌略变矮(横宽不变);嫌矮再上等比缩放(本计划不含)。
- 自动整理三份至此收尾。

## Self-Review

- **Spec coverage**:§A 根因 → Task 描述;§B 行高 `minmax(floor,1fr)` + flex 高度链 + `!important` → Step 1-2;§C 牌填满 + 格线 `calc(100%/9)` → Step 3-4;§D 保留项(54vh cap / 手牌 / 无依赖)→ Global Constraints;§F 验证(build/lint/jest + 三视口)→ Step 5-6。无遗漏。
- **占位符扫描**:无 TBD;每处编辑给出确切前后 CSS;floor 是具体 `var(--board-row-min,34px)`。
- **一致性**:`.ref`/`.ref > div`/`.ref .grid-container`/`.ref div.tile`/`.ref .grid-item` 选择器全程一致;桌面基础规则两端通用、手机 @media 只覆盖列宽/格线/牌字号,行高规则只在基础写一次(DRY)。
- **右尺寸**:CSS 单一视觉交付,拆开会出现「行自适应了但牌溢出」的中间坏态,故合为一个 Task。验证靠 playwright 实视口而非 jest。
