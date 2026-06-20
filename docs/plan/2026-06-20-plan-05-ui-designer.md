# RummyCube 优化 · 视觉与布局规格(UI Designer)

**日期:** 2026-06-20 · **作者角色:** UI Designer agent · **状态:** 实现级规格草案(不改代码)
**权威来源:** `docs/optimization/2026-06-20-rummycube-optimization-spec.md`(WS-3 / WS-5 / WS-6 / WS-7 / WS-8 / WS-15)
**背景评审:** `…/2026-06-20-rummycube-review-3-ui.md`、`…/2026-06-20-rummycube-review-5-persona.md`
**视觉系统:** A1 Classic(绿绒桌 / 象牙斜角牌 / 木质牌架)
**适用样式表:** `src/rummikub/theme/classic.css`、`src/rummikub/components/{board.css,chat.css,lobby.css}`
**适用组件:** `Board.jsx`、`GridContainer.jsx`、`GridSlot.jsx`、`Tile.jsx`、`PlayerAvatar.jsx`、`TableSeats.jsx`

> 约定:本文所有 `[PLACEHOLDER]` 表示数值/颜色待定(给了起步建议值);标「待核实」表示无法从代码确认的论断。
> 标识符 / CSS / 代码一律英文,说明用中文。所有论断附 `文件:行` 或选择器。

---

## 0. 现状核实(已读源码确认)

| 事实 | 位置 | 影响的 WS |
|---|---|---|
| 空棋盘格只在 `isOver` 时着色 `rgba(71,179,86,0.43)`,空格无任何引导 | `GridSlot.jsx:40-43` | WS-3 |
| 「graph-paper border removed for the felt look」——`div.grid-item` 无边框/无网格线 | `board.css:84-93` | WS-3 |
| `.board { min-height:100vh; padding:2.5vh 1vw 3vh }` 把控制行挤到屏幕最底 | `board.css:18-24` | WS-7 |
| `--c-orange:#cc7a14`,象牙面 `--tile-face-solid:#f4ecd6` | `classic.css:8,19` | WS-8 |
| 橙色数字实测 **2.80:1**(< WCAG 3:1 下限);黑 14.5 / 蓝 7.7 / 红 5.8 健康 | 计算见 §3 | WS-8 |
| End 仅以色相区分:`.end-valid`(绿)vs `.end-invalid`(红),无非颜色通道 | `board.css:357-367` | WS-8 |
| 每张牌有效/无效高亮仅靠色相:valid `rgba(159,255,113,.68)` / invalid `rgba(255,174,174,.88)` | `Tile.jsx:50-54` | WS-8 |
| 计时环颜色由 JS 算 `rgb(red,0,blue)` 蓝→红渐变,环心无秒数 | `PlayerAvatar.jsx:18-23,36-58` | WS-5 |
| `.tile-count` 徽章 `background:red`,是系统里唯一纯红/白元素 | `board.css:256-270` | WS-15 |
| `.rack-self` 绝对定位 `left:6px; bottom:calc(100%+2px)`,骑在牌架左上角外 | `board.css:54-59`;`Board.jsx:295` | WS-15 |
| `.controls-wrapper button { font-family:cheva }` 与 Poppins 体系冲突 | `board.css:70-72` | WS-15 |
| 移动端聊天 `62vw` 钉在右上 `z-index:65`,压住 `.sidenav`(z-index 8)的「Tiles left」 | `chat.css:185-188`;`board.css:25` | WS-7 |
| 移动端格宽 `repeat(32/22, 8.4vw)`,牌架可横滚但 HUD 与聊天争同一角 | `board.css:588-611` | WS-7 |
| 不存在「等候层」组件,仅 `TableSeats` 内 `player-pending`「Seat N waiting…」 | `TableSeats.jsx:30`(grep 确认无 overlay) | WS-6 |
| 桌面格:`grid-container` 列宽 `2.2vw`、行高 `7vh`,`Centered` 按 `cols*colWidth vw` 居中 | `GridContainer.jsx:4-20,41` | WS-3/WS-7 |

---

## 1. 设计 Token 表(新增到 `classic.css :root`)

> 原则:复用既有 `--brass` / `--felt-vignette` / `--avatar-glow`,只新增「托盘 / 横幅 / 等候层 / 层级 / 命中目标」缺失的 token。所有新 token 命名沿用现有 `--kebab-case` 习惯。

### 1.1 颜色 token

```css
:root {
  /* —— WS-8:橙色数字修正(核心可读性)—— */
  /* 现 #cc7a14 = 2.80:1(不合格)。建议主用 #a85c08 = 4.24:1(>3:1 且逼近 4.5:1)。 */
  --c-orange: #a85c08;            /* [PLACEHOLDER] 主选 4.24:1;保守下限 #b5650a=3.69:1;更强 #9e5606=4.70:1 */

  /* —— WS-3:牌桌「托盘」—— */
  --tray-border: var(--brass-soft);                 /* 1px 黄铜内描边,复用现有 rgba(205,162,75,.5) */
  --tray-inset-shadow: inset 0 0 48px rgba(0,0,0,.42),
                       inset 0 0 0 1px rgba(205,162,75,.30);  /* 暗角 + 极细内框 */
  --tray-bg: rgba(0,0,0,.10);                       /* 比绒面略沉,把托盘从背景里「抠」出来 */
  --grid-line: rgba(255,255,255,.04);               /* 极淡网格线(spec 指定值) */
  --grid-line-strong: rgba(255,255,255,.07);        /* [PLACEHOLDER] 每 5 列的稍重对齐线,可选 */

  /* —— WS-3:拖拽态高亮 —— */
  --drop-valid: rgba(120,210,140,.30);              /* 合法落点(空且连续足够) */
  --drop-valid-ring: rgba(150,240,170,.85);         /* 合法落点 1px 内描边,第二通道 */
  --drop-empty: rgba(255,255,255,.06);              /* 拖拽进行时,所有空格的微提示 */
  --drop-reject: rgba(220,80,70,.26);               /* 连续空格不足 → 拒收预警 */

  /* —— WS-5:回合横幅 —— */
  --turn-you-bg: linear-gradient(180deg, rgba(255,196,92,.95), rgba(205,162,75,.92));
  --turn-you-ink: #2b1708;                          /* 深棕字,在亮金底 ≥ 7:1 */
  --turn-other-bg: rgba(0,0,0,.42);                 /* 他人回合:沉底 */
  --turn-other-ink: var(--cream);
  --turn-dot: var(--avatar-glow);                   /* 「● 轮到你」圆点,复用暖金 */
  --timer-num-ink: var(--cream);                    /* 环心秒数颜色 */
  --timer-warn: #ff5a3c;                            /* 最后数秒警示(与 combo-fire 同色) */

  /* —— WS-6:等候层 —— */
  --wait-scrim: rgba(18,40,28,.72);                 /* 半透明遮罩,偏绒色而非纯黑 */
  --wait-panel-bg: var(--parchment);                /* 复用羊皮纸面板 */
  --wait-panel-border: var(--parchment-border);
  --spinner-track: rgba(205,162,75,.25);
  --spinner-head: var(--brass);

  /* —— WS-15:计数徽章改色(去掉刺眼纯红)—— */
  --badge-bg: linear-gradient(180deg,#e7c879,#cda24b);  /* 黄铜面 */
  --badge-ink: #2b1708;                              /* 深棕字,黄铜底 ≥ 7:1 */
  --badge-rim: rgba(43,23,8,.55);                    /* 墨色描边,取代 2px white */
  --alert-red: #b3162a;                              /* 纯红仅保留给「真告警」,复用 --c-red */
}
```

### 1.2 间距 / 圆角 / 阴影 / 命中目标 token

```css
:root {
  /* 4px 基准的间距阶梯(项目现用裸 px / vh 混杂,建议引入 token 统一) */
  --sp-1: 4px;  --sp-2: 8px;  --sp-3: 12px; --sp-4: 16px;
  --sp-6: 24px; --sp-8: 32px;

  /* 圆角阶梯(贴合现有:牌 5px、按钮 12px、面板 14px、徽章 999px) */
  --r-tile: 5px; --r-btn: 12px; --r-panel: 14px; --r-pill: 999px;

  /* 命中目标(WS-8:移动端 ≥ 44px;桌面 ≥ 36px) */
  --hit-min: 44px;          /* 触屏最小命中尺寸 */
  --hit-min-desktop: 36px;

  /* 牌桌托盘最大宽度(WS-3:居中、收束;桌面 32 列 × 2.2vw ≈ 70.4vw) */
  --tray-max-w: 1180px;     /* [PLACEHOLDER] 需在 1366 / 1440 实测,使 32 列恰好容纳且左右留呼吸 */
}
```

### 1.3 z-index 层级表(统一,消除当前争抢)

> 现状混乱:`.sidenav` z-index 8、`.table-seats` 6、`.chat-root` 65、`.tile-drag-layer` 100、`.combo-overlay` 40、`.fx-flash` 60。WS-7 的核心 bug 正是聊天(65)压住 HUD(8)。建议确立单一阶梯并把 HUD 提升、聊天收口。

| 层 | 建议 z-index token | 现值 / 位置 | 说明 |
|---|---|---|---|
| 牌桌托盘 / 网格 | `--z-board: 1` | 隐含 0 | 基底 |
| 座位头像(只读) | `--z-seats: 6` | `board.css:188` 不变 | 不拦拖拽(`pointer-events:none`) |
| 回合横幅(WS-5) | `--z-banner: 12` | 新增 | 贴近牌架,高于座位 |
| HUD 侧栏 `.sidenav` | `--z-hud: 30` | 现 `8`(`board.css:25`)→**提升** | 必须高于移动端聊天气泡 |
| 拖拽中的牌影 | `--z-drag: 100` | `board.css:130` 不变 | 始终最高交互层 |
| 聊天面板(桌面) | `--z-chat: 65` | `chat.css:7` 不变 | 桌面右上,与 HUD 不重叠 |
| 聊天气泡(移动 FAB) | `--z-chat-fab: 28` | 新增 | **低于** HUD(30),解决遮挡 |
| Combo / FX | `--z-fx: 60` | `board.css` 不变 | 短暂特效 |
| 等候层遮罩(WS-6) | `--z-wait: 80` | 新增 | 盖住棋盘,低于拖拽层与 GameOverModal |
| GameOverModal | `--z-modal: 120` | 待核实 | 最高模态 |

```css
:root {
  --z-board:1; --z-seats:6; --z-banner:12; --z-chat-fab:28; --z-hud:30;
  --z-fx:60; --z-chat:65; --z-wait:80; --z-drag:100; --z-modal:120;
}
```

### 1.4 第二通道(非颜色)字形方案 —— WS-8 核心

| 信号 | 颜色通道(保留) | **新增非颜色通道** | 落地选择器 |
|---|---|---|---|
| End 有效 | 绿底绿字 `.end-valid` | 标签前置 `✓`,文案「✓ 结束回合 / ✓ End」;另加左侧 3px 实心边条 | `board.css:357-363` + `Board.jsx:192` 标签 |
| End 无效 | 红底红字 `.end-invalid` | 标签前置 `✕`,文案「✕ End」;左侧改虚线边条 + 轻微 `letter-spacing` | `board.css:364-367` + `Board.jsx:192` |
| 每张牌「有效」高亮 | 绿底 `rgba(159,255,113,.68)` | 右上角小 `✓` 角标(`.tile-subscript` 已存在但空,见 `Tile.jsx:36`,可复用) | `Tile.jsx:36,50-54` |
| 每张牌「无效」高亮 | 粉底 `rgba(255,174,174,.88)` | 右上角小 `✕` 角标 + 1px 虚线描边 | `Tile.jsx:36,50-54` |
| 计时环临界 | 蓝→红渐变 | 环心秒数变色 + **数字加粗放大 + 脉冲**(不靠红色单独表意) | `PlayerAvatar.jsx` + 新 `.timer-num` |
| 轮到你 | 暖金高亮环 | 文字横幅「● 轮到你」(`●` 形状本身即第二通道) | WS-5,见 §5 |

> 角标用 `::after` 伪元素 + Unicode `✓ U+2713` / `✕ U+2715`,避免引入图标资源;字号 `clamp(9px,1.1vw,12px)`,位于 `.tile` 右上 `top:1px;right:2px`。
> **灰度验收:** 截图转灰度后,End 两态的边条样式(实/虚)+ 字形(✓/✕)可区分;每张牌角标可区分。

---

## 2. WS-3 牌桌「托盘」设计

**目标:** 把 `.ref` / `.grid-container` 从「不可见虚空」变为一个有边界的离散对象,并在拖拽时给出落点引导。**纯 CSS + 一处轻量 className,无 markup 风险。**

### 2.1 托盘容器(`.ref` 包住 `Centered>Grid`,见 `Board.jsx:224`、`GridContainer.jsx:70-74`)

```css
/* 桌面:把 .ref 做成内嵌、暗角、居中、限宽的「托盘」 */
.ref {
  max-width: var(--tray-max-w);          /* [PLACEHOLDER] 1180px 起步 */
  margin: 1.5vh auto 0;
  padding: clamp(8px, 1.4vh, 18px);
  border-radius: var(--r-panel);
  background: var(--tray-bg);
  border: 1px solid var(--tray-border);  /* 1px 黄铜内描边 */
  box-shadow: var(--tray-inset-shadow);  /* 暗角 inset + 极细内框 */
}
```

### 2.2 极淡网格线(替代被删除的 graph-paper,`board.css:84`)

> 不给每个 `.grid-item` 描边(会像方格纸),改用 `.grid-container` 的 `repeating-linear-gradient` 画极淡列/行线,列宽 `2.2vw`、行高 `7vh`(`GridContainer.jsx:17-18`)。

```css
div.grid-container {
  background-image:
    repeating-linear-gradient(90deg, var(--grid-line) 0 1px, transparent 1px 2.2vw),
    repeating-linear-gradient(0deg,  var(--grid-line) 0 1px, transparent 1px 7vh);
  background-position: 0 0;
}
/* 可选:每 5 列一条稍重对齐线,帮助数花色长度(--grid-line-strong) */
```

> ⚠️ 待核实:`grid-container` 的实际单元起点与 `repeating-linear-gradient` 的 0 点需对齐;若 `Centered` 的 `cols*colWidth vw`(`GridContainer.jsx:6-7`)与视口取整有亚像素误差,线会与格错位 → 验收时在 1366 / 1440 实测,必要时改用 `background-size: 2.2vw 7vh` 配单格渐变。

### 2.3 拖拽开始的落点高亮(配合 spec 的 `resolveDropSlot`)

视觉契约(逻辑由 WS-3 的 `resolveDropSlot` 提供,UI 只消费状态类):

| 状态 | 触发 | 视觉 |
|---|---|---|
| 拖拽进行中,所有空格 | `DndContext onDragStart`(`Board.jsx:316`)给 `.board` 加 `.is-dragging` | 空 `.grid-item` 浅显 `--drop-empty`,让网格「亮起来」 |
| 当前指针最近的合法连续落点 | `resolveDropSlot` 返回的目标格集合加 `.slot-valid` | `--drop-valid` 填充 + `--drop-valid-ring` 1px 内描边(第二通道) |
| 连续空格不足 → 将被拒收 | 返回 reject 时,候选区加 `.slot-reject` | `--drop-reject` 红晕 + 顶部 `not-allowed` 光标提示 |

```css
.board.is-dragging .grid-item:empty { background-color: var(--drop-empty); }
.grid-item.slot-valid  { background-color: var(--drop-valid);
                         box-shadow: inset 0 0 0 1px var(--drop-valid-ring); }
.grid-item.slot-reject { background-color: var(--drop-reject); cursor: not-allowed; }
```

> 现 `GridSlot.jsx:42` 的 `isOver` 内联底色建议保留作「正悬停单格」的即时反馈,但底色统一改用 `--drop-valid`,与上表一致(去掉硬编码 `rgba(71,179,86,0.43)`)。

**WS-3 验收**
- Playwright(solo):拖拽开始时空 `.grid-item` 出现可见 `.is-dragging` 着色;最近合法落点带 `.slot-valid` 类;单张牌偏移 < 半格仍提交(Undo 可用)。
- 视觉:托盘有可见黄铜边 + 暗角,在 1366×768 与 390×844 截图中棋盘是一个「离散对象」而非整片绿。
- 灰度:网格线在灰度下仍可辨列对齐(`rgba(255,255,255,.04)` 在绿绒上为极淡亮线,待核实是否需提到 `.05`)。

---

## 3. WS-8 橙色数字对比度(实测计算)

象牙面 `--tile-face-solid: #f4ecd6`(`classic.css:19`)。WCAG 相对亮度公式实测:

| 候选 `--c-orange` | 对比度(:1) | 判定 |
|---|---|---|
| `#cc7a14`(现值) | **2.80** | ✗ 低于 3:1 下限 |
| `#b5650a` | 3.69 | ✓ 过线(保守) |
| **`#a85c08`(建议主选)** | **4.24** | ✓ 舒适,逼近 4.5:1 |
| `#9e5606` | 4.70 | ✓ 更强,仍明显为橙 |
| `#8f4e05` | 5.47 | ✓ 偏褐,可能与红混淆,慎用 |

**建议:** `--c-orange: #a85c08`(4.24:1)。仍与红 `#b3162a`、蓝 `#13478f`、黑 `#1c1c1c` 明确区分,且把核心阅读任务拉到舒适区。**纯 token 改动,`classic.css:8` 一行,无 markup。**

**验收:** 自动化对比度计算 ≥ 3:1(实测 4.24:1);灰度下橙仍可与红区分(亮度差足够)。

---

## 4. (并入 §1.4)第二通道总表 —— 见上文 1.4

---

## 5. WS-5 回合横幅 + 计时环秒数

### 5.1 回合横幅(新元素,挂在 `.board` 内、牌架上方;近视线落点)

文案:`currentPlayer === playerID` → 「● 轮到你」;否则「{name} 的回合」。
位置:置于 `boardGrid` 与 `hand-buttons` 之间(`Board.jsx:331` 前),`z-index: var(--z-banner)`。

```css
.turn-banner {
  display: inline-flex; align-items: center; gap: var(--sp-2);
  margin: var(--sp-2) auto 0; padding: 6px 16px;
  border-radius: var(--r-pill);
  font-family: 'Poppins', system-ui, sans-serif; font-weight: 700; font-size: .95rem;
  box-shadow: 0 2px 8px rgba(0,0,0,.3);
}
.turn-banner.is-you   { background: var(--turn-you-bg);   color: var(--turn-you-ink); }
.turn-banner.is-other { background: var(--turn-other-bg); color: var(--turn-other-ink); }
.turn-banner .dot {           /* 「●」第二通道:形状即语义 */
  width: 9px; height: 9px; border-radius: 50%;
  background: var(--turn-dot); box-shadow: 0 0 8px var(--turn-dot);
}
@media (prefers-reduced-motion: no-preference) {
  .turn-banner.is-you .dot { animation: turn-dot-pulse 1.4s ease-in-out infinite; }
}
@keyframes turn-dot-pulse { 0%,100%{opacity:.65} 50%{opacity:1} }
```

> 首回合微文案(WS-5):横幅下方一行小字「计时环归零后,你的回合会自动结束」,首回合后淡出(状态由前端 onboarding 标志控制,见跨专业依赖)。

### 5.2 计时环中心秒数(改 `PlayerAvatar.jsx` + 新 CSS)

现 SVG 环已存在(`PlayerAvatar.jsx:36-58`),环心无数字。新增居中 `<text>` 或叠加 `div.timer-num` 显示 `Math.ceil(timeLeft)`:

```css
.timer-num {
  position: absolute; top: 50%; left: 50%; transform: translate(-50%,-50%);
  font-family: 'Poppins', system-ui, sans-serif; font-weight: 800;
  font-size: clamp(13px, 1.4vw, 18px); color: var(--timer-num-ink);
  text-shadow: 0 1px 2px rgba(0,0,0,.55); z-index: 1; pointer-events: none;
}
.timer-num.is-warning {            /* 第二通道:不只变红,还放大+脉冲 */
  color: var(--timer-warn); font-size: clamp(15px, 1.7vw, 22px);
}
@media (prefers-reduced-motion: no-preference) {
  .timer-num.is-warning { animation: timer-warn-pulse .8s ease-in-out infinite; }
}
@keyframes timer-warn-pulse { 0%,100%{transform:translate(-50%,-50%) scale(1)} 50%{transform:translate(-50%,-50%) scale(1.18)} }
```

> 触发 `is-warning` 的阈值建议 `timeLeft <= 5`s [PLACEHOLDER];与 `PlayerAvatar.jsx:18-23` 现有蓝→红渐变并存(渐变保留作连续通道,数字+脉冲作离散通道)。
> ⚠️ 性能注意(跨 WS-4):秒数变化会触发重渲染;spec WS-4 要求把计时下沉到自包含 `<TurnTimer>`,本秒数应在该组件内驱动,勿让 `Board` 每 tick 重渲。

**WS-5 验收:** Playwright 你的回合时横幅文案为「轮到你」;环心存在递减的数字;非纯色相区分(有 `●` 形状 + 数字 + 脉冲)。

---

## 6. WS-6 等候层(新组件 + 样式)

> 现无 overlay(grep 确认),`TableSeats.jsx:30` 仅有微弱「Seat N waiting…」。WS-6 需:半透明遮罩 + spinner + 房间码 + 大「复制链接」按钮 + 禁用棋盘。挂在 `ctx.phase === 'playersJoin'`(参考 `Board.jsx:31`)。

```css
.waiting-overlay {
  position: absolute; inset: 0; z-index: var(--z-wait);
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: var(--sp-4);
  background: var(--wait-scrim);
  backdrop-filter: blur(2px);            /* 轻模糊,提示「不可玩」 */
}
.waiting-panel {
  background: var(--wait-panel-bg); border: 1px solid var(--wait-panel-border);
  border-radius: var(--r-panel); padding: var(--sp-8) var(--sp-6);
  text-align: center; max-width: 360px; box-shadow: 0 16px 40px rgba(0,0,0,.5);
  color: var(--ink);
}
.waiting-title { font-family:'Poppins'; font-weight:800; font-size:1.15rem; color: var(--ink); }
.waiting-sub   { font-size:.9rem; color: var(--ink-soft); margin-top: var(--sp-1); }  /* 「已加入 1 / 2」 */

/* Spinner:纯 CSS 黄铜环,呼应 A1 主题 */
.waiting-spinner {
  width: 44px; height: 44px; border-radius: 50%;
  border: 4px solid var(--spinner-track); border-top-color: var(--spinner-head);
  margin: 0 auto var(--sp-2);
}
@media (prefers-reduced-motion: no-preference) {
  .waiting-spinner { animation: spin 1s linear infinite; }
}
@keyframes spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) {
  .waiting-spinner { border-top-color: var(--spinner-head); opacity:.8; } /* 静态环,不转 */
}

/* 房间码 + 大复制按钮(复用 invite-copy 视觉语言,加大命中) */
.waiting-code {
  font-family:'Poppins', ui-monospace, monospace; font-weight:800;
  font-size:1.4rem; letter-spacing:.08em; color: var(--ink);
  background: rgba(0,0,0,.06); border-radius: var(--r-btn);
  padding: 8px 16px; margin: var(--sp-2) 0; user-select: all;
}
.waiting-copy {                          /* 大按钮,命中 ≥ 44px */
  min-height: var(--hit-min); min-width: 200px;
  font-family:'Poppins'; font-weight:700; font-size:1rem; color: var(--badge-ink);
  background: var(--badge-bg); border: none; border-radius: var(--r-btn);
  box-shadow: 0 3px 0 #9c7a2f, 0 2px 6px rgba(0,0,0,.3); cursor: pointer;
}
```

棋盘禁用:遮罩本身拦截点击即可;另给 `.board.is-waiting` 加 `pointer-events:none` 兜底,或对 `.ref` / `.hand-buttons` 降透明度 `opacity:.6`(spec「dim/disable the board」)。

**WS-6 验收:** Playwright 新建 2 人房显示遮罩「已加入 1 / 2」;第二人加入前棋盘不可交互;复制按钮命中 ≥ 44px。

---

## 7. WS-7 移动端布局(390px 断点,桌面同时收益)

> 现断点 `@media (max-width:820px)`(`board.css:467`)。390px 是验收宽度。下列建议在该断点内补充/修正。

### 7.1 牌架:横向滚动 / 自适应,所有手牌可达

现 `.hand-buttons > div:first-child { overflow-x:auto }` + `repeat(22, 8.4vw)` 已可横滚(`board.css:594-611`),但评审仍见「最右一张被裁」。修正:

```css
@media (max-width: 820px) {
  .hand-buttons > div:first-child {
    overflow-x: auto; -webkit-overflow-scrolling: touch;
    scroll-padding-inline: 8px; padding-inline: 6px;   /* 两端留白,最后一张不贴边被裁 */
  }
  .hand-buttons .grid-container {
    grid-template-columns: repeat(22, minmax(34px, 8.4vw)) !important; /* 保底 34px,避免过窄 */
    width: max-content;                                  /* 让滚动容器量到全部列 */
  }
}
```

> ⚠️ 待核实:裁切是否因父级 `max-width:96vw`(`board.css:597`)+ `.hand-buttons` 内边距吃掉最右列;实测 390 时打印 `scrollWidth` 验证。

### 7.2 聊天:窄屏收成可点气泡(FAB),不再常驻面板

现 `chat.css:185-188` 移动端仍是 `62vw` 常驻面板压住 HUD。改为:

```css
@media (max-width: 820px) {
  .chat-panel { display: none; }            /* 默认收起 */
  .chat-panel.is-open { display: flex; position: fixed; inset: auto 4px 64px 4px;
                        width: auto; max-width: none; max-height: 50vh; z-index: var(--z-chat); }
  .chat-fab {                                /* 右下角气泡,低于 HUD */
    position: fixed; right: 10px; bottom: 10px; z-index: var(--z-chat-fab);
    width: var(--hit-min); height: var(--hit-min); border-radius: 50%;
    background: var(--wood-bar); color: var(--cream); border:1px solid var(--brass-soft);
    box-shadow: 0 4px 12px rgba(0,0,0,.4); display:flex; align-items:center; justify-content:center;
  }
  .chat-fab .unread {                        /* 未读用黄铜徽章,不用纯红 */
    position:absolute; top:-2px; right:-2px; background: var(--badge-bg); color: var(--badge-ink);
    min-width:18px; height:18px; border-radius:999px; font-size:.62rem;
  }
}
```

### 7.3 HUD(剩余张数 / 邀请)不被聊天遮挡

- `.sidenav` z-index `8 → var(--z-hud)=30`(`board.css:25`),高于 `--z-chat-fab=28`。
- 移动端 `.sidenav` 已是顶部静态条(`board.css:512-525`);确保它在 flex 列里**占一行**(`flex:0 0 auto` 已有),聊天 FAB 在右下角,二者不再争右上角。
- 「Tiles left」`tile-pool-counter` 与 invite 同在该条内,不再被 `62vw` 面板覆盖。

### 7.4 四座位头像不裁切牌架

现 `.seat-*` 绝对定位(`board.css:184-210`),移动端 avatar 46px(`board.css:529-533`)。建议:

```css
@media (max-width: 820px) {
  .table-seats { display: none; }   /* 对手头像移入顶部 .sidenav 的 player-list(已 row 排列,board.css:534-541) */
}
```

> 即移动端不在绒面四角放绝对定位头像(会压住小棋盘/牌架),改为顶部条内一行小头像。自家头像见 §8。

### 7.5 控制行「首屏可见」(桌面 + 移动端)—— UI-5 修复

**桌面**(`board.css:18-24`):`.board { min-height:100vh }` + 固定高度网格把 Sort/Draw/Submit/Undo/Redo 推到屏底。修正:

```css
/* 桌面:限制棋盘高度,为牌架+控制行预留空间,使控制行在首屏 */
@media (min-width: 821px) {
  .board { min-height: 0; }                      /* 去掉 100vh 强制 */
  .board-container { min-height: calc(100vh - var(--nav-h)); }
  .ref { max-height: 52vh; overflow: auto; }     /* [PLACEHOLDER] 棋盘区限高,给牌架+控制行让位 */
  .hand-buttons { margin-bottom: 2vh; }          /* 牌架与控制行整体上移,clear the fold */
}
```

**移动端**已是 `flex` 列、牌架钉底(`board.css:483-489,592`);确保 `.controls-wrapper`(`board.css:614`)在 `.hand-buttons` 内、始终随牌架可见即可。控制按钮命中见 §8。

**WS-7 验收(Playwright @ 390×844):**
- 每张手牌都在可横滚牌架内可达(无裁切):断言每个 `.grid-item .tile` 的 `boundingBox` 在 `.hand-buttons` 滚动容器 `scrollWidth` 范围内。
- 聊天不遮挡「Tiles left」:断言 `.tile-pool-counter` 与聊天气泡 `.chat-fab` 的 `boundingBox` 不相交;面板默认 `display:none`。
- 控制行可见:断言 `.controls-wrapper` 在视口内(`y + height <= 844`)。
- 无 `pageerror`。

---

## 8. WS-8 / WS-15 收尾

### 8.1 命中目标 ≥ 44px(WS-8)

```css
@media (max-width: 820px) {
  .rummikub-button { min-height: var(--hit-min); padding: 10px 16px; }  /* 现 8px 14px 偏小,board.css:629 */
  .chat-fab, .waiting-copy { min-height: var(--hit-min); min-width: var(--hit-min); }
}
.invite-copy { min-height: var(--hit-min-desktop); }  /* 桌面 ≥ 36px */
```

### 8.2 控制按钮字体统一(WS-15)

`board.css:70-72` 的 `.controls-wrapper button { font-family: cheva }` → 改 Poppins,与牌面 / 牌架 / lobby 一致:

```css
.controls-wrapper button { font-family: 'Poppins', system-ui, sans-serif; font-weight: 700; }
```

### 8.3 牌架收束 / 居中(WS-15)

`.hand-buttons` 已 `width:fit-content; margin:auto`(`board.css:44-46`),但手牌 22 列宽留大片空木。建议让内层手牌网格按实际手牌列数收束并居中:

```css
.hand-buttons .grid-container { justify-content: center; }   /* 桌面手牌居中,减少右侧空木板 */
```
> ⚠️ 待核实:`HAND_COLS=22`(`constants.js:5`)是固定列;若要真正 `fit-content` 需逻辑层按手牌数动态定列(超出本视觉规格,记为跨专业依赖)。视觉层先做「居中 + 网格线弱化空格」缓解。

### 8.4 自家头像入牌架预留凹槽 + 计数徽章改色(WS-15)

`.rack-self` 现 `bottom:calc(100%+2px)`(骑在牌架外,`board.css:54-59`)→ 改为牌架顶部预留 padding 的「凹槽」:

```css
.hand-buttons { padding-top: 34px; }            /* [PLACEHOLDER] 预留顶部凹槽高度,容纳自家头像 */
.rack-self { left: 10px; bottom: auto; top: 4px; }  /* 坐进凹槽,徽章不再骑边 */
```

计数徽章 `.tile-count` 去纯红(`board.css:256-270`):

```css
.tile-count {
  background: var(--badge-bg); color: var(--badge-ink);
  border: 1.5px solid var(--badge-rim);          /* 墨色描边替代 2px white */
}
```
> 纯红 `--alert-red` 仅保留给真告警(如断线 `avatar-offline` 已是深灰,可不动)。

**WS-8 / WS-15 验收:**
- 所有交互元素移动端命中 ≥ 44px(Playwright 量 `boundingBox` 宽高)。
- 控制按钮 `font-family` 计算值含 `Poppins`(非 `cheva`)。
- 自家头像徽章完全落在牌架轮廓内(不与牌架边相交);徽章为黄铜非纯红。
- 灰度下整套界面无「靠颜色单独传意」的关键信号(End / 牌高亮 / 计时 / 回合 都有第二通道)。

---

## 9. 落地优先级(纯视觉,按 ROI)

| 优先 | 项 | 文件 | 工作量 |
|---|---|---|---|
| P0 | `--c-orange:#a85c08`(WS-8 可读性) | `classic.css:8` | S(一行) |
| P0 | 牌桌托盘 + 网格线(WS-3) | `board.css` `.ref`/`.grid-container` | M |
| P0 | 桌面去 `min-height:100vh` + 棋盘限高(WS-7 控制行上屏) | `board.css:18-24` | S |
| P0 | 移动端聊天收 FAB + HUD z-index 提升(WS-7 遮挡) | `chat.css:185`、`board.css:25` | M |
| P1 | End ✓/✕ 第二通道 + 牌角标(WS-8) | `board.css:357-367`、`Tile.jsx:36` | S-M |
| P1 | 等候层(WS-6) | 新组件 + `board.css` | M |
| P1 | 回合横幅 + 环心秒数(WS-5) | 新元素 + `PlayerAvatar.jsx` | S-M |
| P2 | 控制字体 Poppins / 头像凹槽 / 徽章改色(WS-15) | `board.css` 多处 | S |

---

## 10. 跨专业依赖(交给其他角色 / WS)

1. **WS-3 落点逻辑:** `.slot-valid` / `.slot-reject` 类需后端/前端逻辑 `resolveDropSlot(pointerRect, gridRect, occupancy, selectionLength)` 提供(spec WS-3),本规格只定义这些类的视觉。`moves.moveTiles`(`moves.js:114-121`)无预检,resolver 必须先跑。
2. **WS-4 性能:** 计时环秒数(§5.2)与回合横幅勿引发 `Board` 每 tick 重渲;需 spec WS-4 的自包含 `<TurnTimer>` 与 `React.memo` 改造落地后再挂。
3. **WS-5 首回合微文案 / WS-2 onboarding:** 横幅下方「计时环归零自动结束回合」的显隐依赖 onboarding「首回合」标志(WS-2),非纯 CSS。
4. **WS-6 状态:** 等候层显隐绑定 `ctx.phase === 'playersJoin'` 与 `joined/n` 计数(`Board.jsx:31`),复制链接动作复用现有 `invite-copy` 逻辑。
5. **WS-15 真 `fit-content` 牌架:** 需逻辑层按手牌数动态定列(`HAND_COLS=22` 现为固定),超出视觉层。
6. **聊天 FAB 开合:** 需 React 状态(`is-open` 类切换),前端实现。

---

## 11. 开放问题(待 owner / 评审确认)

1. **橙色取值:** 主选 `#a85c08`(4.24:1)还是更强 `#9e5606`(4.70:1)?后者更稳但略偏褐,需确认不与红混淆。`[PLACEHOLDER]`
2. **托盘 `--tray-max-w`:** 1180px 起步未在 1366/1440 实测;32 列 ×2.2vw 在大屏是否需放宽到 `vw` 而非固定 px?`[PLACEHOLDER]`
3. **网格线可见度:** spec 指定 `rgba(255,255,255,.04)`,但绒面较深时可能几乎不可见;是否允许提到 `.05`–`.06`?`待核实`
4. **移动端对手头像:** 建议 `.table-seats` 在 820px 隐藏、头像并入顶部条 —— 是否接受失去「四方位」桌感以换取不裁切?
5. **计时警示阈值:** `timeLeft <= 5s` 触发放大脉冲是否合适?与 `G.timePerTurn` 比例联动更稳?`[PLACEHOLDER]`
6. **棋盘限高 `52vh`:** 在 768px 笔记本与大屏是否都让控制行稳定上屏?需实测调参。`[PLACEHOLDER]`
7. **聊天移动端:** spec Open question 3 仍在「FAB vs 常驻缩小」二选一 —— 本规格按推荐取 FAB,待 owner 拍板。

---

*—— 报告结束。本文为视觉/布局实现级规格,未改动任何代码,未提交。*
