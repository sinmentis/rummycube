# RummyCube UX-pass · 专家报告 3 — 视觉 / UI 设计

**Reviewer:** UI Designer agent · **Date:** 2026-06-24 · **分支(拟):** `feat/ux-pass-clarity`
**对应 spec:** `docs/optimization/2026-06-24-ux-pass-spec.md`(WS-A 超时反馈 / WS-C 主次按钮 / WS-D Undo·Redo 图标角落 / WS-E 首回合提示)
**范围:** 只给**呈现层**可直接落地的视觉规格(尺寸 / 颜色 / 间距 / 圆角 / 阴影 / 状态 / 动效门控)。不改规则、不改服务器、不改 `planning.js` 逻辑。
**方法:** 读 `board.css`、`coachCard.css`、`theme/classic.css`、`Board.jsx`、`PlayerAvatar.jsx`;复用既有 token;对所有新配色用 WCAG 公式实算对比度;几何对位用现有绝对定位数值推导。

> 红线(全程遵守):**WCAG AA**(正文 ≥4.5:1)、**移动命中区 ≥44px**、**一切动效受 `prefers-reduced-motion` 门控**、**应用内文案英文**、**色盲第二通道**(✓/✕ 字形、↶/↷ 形状、数字、形状标记,不靠纯色)。

---

## 0. 复用的设计 token 与两条全局新增

**直接复用(`theme/classic.css`)**

| 用途 | token | 值 |
|---|---|---|
| 主操作强调色(brass/金) | `--brass` | `#cda24b` |
| brass 描边(次要/工具描边) | `--brass-soft` | `rgba(205,162,75,.5)` |
| 浅米色文本(深底上) | `--cream` | `#f5edd8` |
| 羊皮纸面 / 描边(次要按钮、提示) | `--parchment` / `--parchment-border` | `…` / `#cbae7e` |
| 墨色文本 | `--ink` / `--ink-soft` | `#3b2c1a` / `#6f5b3e` |
| 有效/无效双通道(沿用) | `.end-valid` / `.end-invalid` + `endStateGlyph`(✓/✕) | `Board.jsx:341-344` |
| 计时环低时颜色 | 现有 JS 蓝→红 + `.timer-low` | `PlayerAvatar.jsx:11,42` |

**全局新增 1 — 统一无障碍焦点环(双环,任意底色都可见)。** 金色按钮上浅蓝单环只有 1.33:1,故用「深内环 + 浅外环」双 `box-shadow`,在金/羊皮纸/绒面/木纹上至少一条边都 ≥3:1:

```css
.primary-action:focus-visible,
.secondary-action:focus-visible,
.icon-button:focus-visible {
    outline: none;
    /* 深海军内环 + 浅蓝外环;跟随 border-radius,跨底色都可见 */
    box-shadow: 0 0 0 2px #0b1f3a, 0 0 0 5px #8fc7ff;
}
```
(浅蓝 `#8fc7ff` 对绒面 `#245733` = 4.74:1;深内环 `#0b1f3a` 对金 `#cda24b` 高对比。)

**全局新增 2 — 动作按钮统一改用 Poppins。** 现 `.controls-wrapper button{font-family:cheva}`(`board.css:112`,review-2 已标其与全站 Poppins/Tiles 冲突)。新 `.primary-action`/`.secondary-action` 显式用 `'Poppins', system-ui, sans-serif`,覆盖 `cheva`。

---

## 1. WS-C — 主操作醒目化 + 控件区重排

**三级视觉权重:** 主(亮金渐变 + 厚 3D 阴影 + 大字)＞ 次(扁平哑光羊皮纸 + 细描边 + 小字)＞ 工具(角落图标,见 §2)。
`Draw` / `Submit meld` / `End`(三者沿用 `drawOrEnd` 切换,`Board.jsx:566-573`,逻辑不变)用 `.primary-action`;`Sort: runs` / `Sort: colours` 降为 `.secondary-action`。

### 1.1 `.primary-action`(主操作)

```css
.primary-action {
    font-family: 'Poppins', system-ui, sans-serif;
    font-weight: 800;
    font-size: 18px;
    letter-spacing: .2px;
    min-height: 52px;          /* > 44px 命中区 */
    padding: 13px 28px;
    min-width: 120px;
    border: none;
    border-radius: 12px;
    color: #2a2012;            /* 深墨 on 金 = 6.75:1 ✓ */
    background: linear-gradient(180deg, #e7c66b 0%, #cda24b 100%);  /* brass */
    /* 厚“底边” + 暖光晕,明显重于次要按钮 */
    box-shadow: 0 4px 0 #9c7a33, 0 6px 16px rgba(0, 0, 0, .42),
                inset 0 1px 0 rgba(255, 255, 255, .45);
    cursor: pointer;
    transition: transform .12s ease, box-shadow .12s ease, filter .12s ease;
}
.primary-action:hover {
    transform: translateY(-2px);
    box-shadow: 0 6px 0 #9c7a33, 0 9px 20px rgba(0, 0, 0, .48),
                inset 0 1px 0 rgba(255, 255, 255, .5);
}
.primary-action:active {
    transform: translateY(1px);
    box-shadow: 0 2px 0 #876a2c, 0 3px 8px rgba(0, 0, 0, .35);
}
.primary-action:disabled {
    filter: saturate(.35) brightness(.92);
    opacity: .5;
    box-shadow: 0 2px 0 #9c7a33;
    transform: none;
    cursor: not-allowed;
}
```

**Submit 保留有效性双通道**(覆盖金底为绿/红 + ✓/✕ 字形,`endStateGlyph`+`endStateClass` 不变):

```css
.primary-action.end-valid {           /* ✓ Submit meld */
    background: linear-gradient(180deg, #c8f5c8 0%, #b6efb6 100%);
    color: #0a5a0a;                   /* 6.46:1 ✓ */
    box-shadow: 0 4px 0 #6cbf6c, 0 0 16px rgba(70, 200, 70, .6);
}
.primary-action.end-invalid {         /* ✕ Submit meld */
    background: linear-gradient(180deg, #ffd2d2 0%, #ffc1c1 100%);
    color: #8a1414;                   /* 6.23:1 ✓ */
    box-shadow: 0 4px 0 #d98686, 0 0 14px rgba(220, 70, 70, .5);
}
```
> 选金做主色而非绿:绿/红是“可提交校验”的语义通道(`end-valid/invalid`),主色用 brass 才不与之撞色;金底上仍能被绿/红覆盖,层级与校验互不打架。

### 1.2 `.secondary-action`(排序,次要)

```css
.secondary-action {
    font-family: 'Poppins', system-ui, sans-serif;
    font-weight: 700;
    font-size: 14px;
    min-height: 44px;          /* 仍满足命中区;靠配色/字号/扁平降权,而非缩小可点区域 */
    padding: 8px 14px;
    border: 1px solid var(--parchment-border, #cbae7e);
    border-radius: 10px;
    color: #5b4a2e;            /* on 哑光羊皮纸 = 6.68:1 ✓ */
    background: #efe3c4;        /* 比主操作更哑、更扁 */
    box-shadow: 0 1px 2px rgba(0, 0, 0, .28);   /* 无厚 3D 边 */
    cursor: pointer;
    transition: background-color .12s ease, transform .1s ease;
}
.secondary-action:hover  { background: #e7d8b4; }
.secondary-action:active { transform: translateY(1px); }
.secondary-action:disabled {
    opacity: .5;
    cursor: not-allowed;
    box-shadow: none;
}
```

### 1.3 控件区布局(`.controls-wrapper`,`board.css:102` / 渲染 `Board.jsx:615-631`)

主操作**居中且最显眼**,次要簇靠左成组,撤销/重做以角落图标独立(§2,绝对定位、不进此流)。用 3 列栅格让主操作**真正居中**、不受次要簇宽度影响:

```css
.controls-wrapper {
    display: grid;
    grid-template-columns: 1fr auto 1fr;  /* 左:次要 | 中:主 | 右:留空 */
    align-items: center;
    gap: 10px;
    margin-top: 1.6vh;
}
.controls-secondary { grid-column: 1; justify-self: start;  display: flex; gap: 8px; }
.controls-primary   { grid-column: 2; justify-self: center; display: flex; gap: 12px; }

/* 窄屏:堆叠,主操作在上、最先被看到 */
@media (max-width: 560px) {
    .controls-wrapper { grid-template-columns: 1fr; }
    .controls-primary, .controls-secondary { grid-column: 1; justify-self: center; }
    .controls-primary   { order: 1; }
    .controls-secondary { order: 2; }
}
```

**建议 JSX 结构**(交前端,本报告不改码):
```jsx
<div className="controls-wrapper">
  <div className="controls-secondary">{sortRunsBtn}{sortColoursBtn}</div>
  <div className="controls-primary">{drawOrEnd}</div>   {/* Submit/Draw/End */}
</div>
{/* undo/redo 不在此 → 见 §2 的 .rack-tools(绝对定位角落) */}
```
> `submit-reason`(`board.css:531`,`flex-basis:100%`)在 grid 下改用 `grid-column:1 / -1; justify-self:center`,跨整行不变。

---

## 2. WS-D — Undo / Redo 图标化 + 移到角落

文字按钮换成 `↶` / `↷` 图标按钮;**形状方向**(逆/顺时针弧箭头)即色盲第二通道,辅以 `aria-label`/`title`。位置:浮于**牌架右上角**,与左上角头像(`.rack-self`)左右对称、远离居中的主操作,且不压牌面。

### 2.1 图标按钮 `.icon-button`

```css
.icon-button {
    width: 44px;               /* 命中区 ≥44px */
    height: 44px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 20px;           /* ↶ / ↷ 字形 */
    line-height: 1;
    border: 1px solid var(--brass-soft, rgba(205, 162, 75, .5));
    border-radius: 10px;
    color: var(--cream, #f5edd8);          /* on 深哑光 = 10.5:1 ✓ */
    background: rgba(20, 16, 10, .42);      /* 安静、低权重 */
    cursor: pointer;
    transition: background-color .12s ease, transform .1s ease, opacity .12s ease;
}
.icon-button:hover  { background: rgba(20, 16, 10, .62); transform: translateY(-1px); }
.icon-button:active { transform: translateY(1px); }
.icon-button:disabled {
    opacity: .38;              /* 明显灰禁,但保留图标轮廓 */
    cursor: not-allowed;
    transform: none;
}
```
(焦点环复用 §0 双环。可选:给 redo 叠加极淡冷调 `box-shadow: inset 0 0 0 1px rgba(120,170,255,.25)`、undo 暖调——纯属加成,辨识仍靠 ↶/↷ 方向。)

### 2.2 角落放置 `.rack-tools`(`.hand-buttons` 内,`board.css:80` 已 `position:relative`)

```css
.rack-tools {
    position: absolute;
    right: 6px;
    bottom: calc(100% + 2px);  /* 浮在牌架上沿、右上角;镜像左上角 .rack-self */
    z-index: 7;
    display: flex;
    gap: 8px;
}
@media (max-width: 560px) {   /* 手机:略缩,避免与右侧对手座位/绒面挤占 */
    .rack-tools { right: 4px; gap: 6px; }
    .icon-button { width: 44px; height: 44px; font-size: 18px; }  /* 保持 44px 命中区 */
}
```
**JSX:** 把 `undoBut`/`redoBut`(`Board.jsx:415-429`)移出 `controls-wrapper`,改成图标按钮放进 `<div className="rack-tools">…</div>`,与 `{selfAvatar}` 同级置于 `.hand-buttons` 内:
```jsx
<button className="icon-button" aria-label="Undo" title="Undo" disabled={…sameGuards…} onClick={() => moves.undo()}>↶</button>
<button className="icon-button" aria-label="Redo" title="Redo" disabled={…sameGuards…} onClick={() => moves.redo()}>↷</button>
```
禁用条件 / `moves.undo|redo` / 键盘快捷键(`useUndoRedoHotkeys`)**完全不变**。
> 兜底(若某机型右上浮层与对手座位相撞):退化为 `controls-wrapper` 第 3 栅格列内 `justify-self:end` 的右对齐工具组,仍远离居中主操作。

---

## 3. WS-A — 超时公告 toast + 计时环最后数秒脉冲

### 3.1 全员公告 toast `.timeout-toast`

沿用 `.connection-cue`(`board.css:1026`)的“顶部居中胶囊”语言,换暖琥珀配色以区分,`⏱` 字形作非色通道。文案(英文,本人/他人/未抽牌三态见 spec WS-A.2)。`TIMEOUT_TOAST_MS=3500` 由 JS 控制出/隐。

```css
.timeout-toast {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 8px 16px;
    border-radius: 999px;
    font-size: 13px;
    font-weight: 700;
    letter-spacing: .2px;
    color: #ffe1a8;                          /* on 深暖底 = 13.2:1 ✓ */
    background: rgba(36, 26, 10, .92);
    border: 1px solid rgba(214, 160, 60, .6);
    box-shadow: 0 6px 16px rgba(0, 0, 0, .45);
    pointer-events: none;
    white-space: nowrap;
}
.timeout-toast .timeout-toast__icon { font-size: 14px; }   /* ⏱,aria-hidden */
```

**与 connection-cue 共存:** 两者都顶部居中——用一个**顶部堆叠容器**承载,绝不重叠:
```css
.top-cue-stack {
    position: absolute;
    top: 10px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 8;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    pointer-events: none;
}
```
(把现有 `{connectionCue}` 与新 `{timeoutToast}` 一并放进 `.top-cue-stack`;现 `.connection-cue` 自身 `position:absolute` 改为 `position:static` 即可入栈。)

**入场动效(reduced-motion 安全):** 默认不位移;允许动效时才滑入:
```css
@keyframes toastIn {
    0%   { opacity: 0; transform: translateY(-6px); }
    100% { opacity: 1; transform: translateY(0); }
}
.timeout-toast { opacity: 1; }                  /* 减弱动效:直接出现 */
@media (prefers-reduced-motion: no-preference) {
    .timeout-toast { animation: toastIn .22s ease both; }
}
```
**无障碍:** 容器 `role="status" aria-live="polite"`(不打断 SR);`⏱` `aria-hidden`,语义全在文本。`playerView` 下只用座位 + 姓名,不含手牌(spec 不变量)。

### 3.2 计时环最后数秒脉冲(扩展现有 `.timer-low`)

`PlayerAvatar.jsx:11` 的 `LOW_TIME_MS=5000` 已等于 `RING_WARN_S=5`,且 `.timer-low` 已在剩 5s 时挂上;现有 `timer-low-pulse`(`board.css:1009`)只缩放**中心秒数**。在此**增加“环”级红色光晕脉冲**(秒数缩放保留):

```css
/* 静态告警(即使 reduced-motion 也有红晕,作为非动效第二通道) */
.timer-ring.timer-low {
    filter: drop-shadow(0 0 5px rgba(226, 59, 59, .65));
}
@keyframes ring-warn-pulse {
    0%, 100% { filter: drop-shadow(0 0 3px rgba(226, 59, 59, .35)); }
    50%      { filter: drop-shadow(0 0 9px rgba(226, 59, 59, .85)); }
}
@media (prefers-reduced-motion: no-preference) {
    .timer-ring.timer-low { animation: ring-warn-pulse .8s ease-in-out infinite; }
}
```
- **门控:** 仅 `no-preference` 时脉冲;reduced-motion 时退化为**静态红晕**(base `filter`)+ 现有可读秒数,告警不丢失。
- **到点可见走到 0:** 现 `.timer-circle{transition:stroke-dashoffset 1s ease}`(`board.css:410`)已让环平滑收到 0,保留即可;实现侧确保 `forceEndTurn` 引发的 UI 更新前让 0 帧渲染一拍(JS 层,非本报告 CSS)。
- 红色 `#e23b3b` 与既有蓝→红描边同向加强;形状/秒数仍是色盲通道,红晕只是加成。

---

## 4. WS-E — 首回合提示 `.turn-hint` 重定位

### 4.1 几何(为何现在重叠)

桌面绝对定位(锚点 = 牌架上沿,向上为正):

| 元素 | left | 垂直占带(牌架上方) | 备注 |
|---|---|---|---|
| `.rack-self` 头像 + 计时环 | 6px | **[2px, 92px]**,右缘≈**96px** | 头像 80px,环 `left:-10/width:100` 外溢 |
| `.turn-banner` | 6px | **[56px, ~88px]** | 高 ≈32px,`nowrap` 右缘可变 |
| `.turn-hint`(现) | 6px | **[30px, ~55px]** | → 落在头像带内、紧贴横幅下 → **重叠** |

### 4.2 主推方案 —— 叠到横幅**上方**(同列继续向上堆,最稳、与现有“左上叠放”一致)

```css
.turn-hint {
    position: absolute;
    left: 6px;
    bottom: calc(100% + 92px);   /* 横幅顶≈88px → 落在其上方,清空头像[2,92]与横幅[56,88] */
    top: auto;
    z-index: 7;
    max-width: 280px;
    padding: 5px 12px;
    border-radius: 10px;
    background: rgba(20, 16, 10, .82);   /* 较现 .7 略提,确保对比与可读 */
    color: #ffe9b8;                       /* = 14.4:1 ✓ */
    font-family: 'Segoe UI', sans-serif;
    font-size: 12.5px;
    line-height: 1.3;
    box-shadow: 0 3px 10px rgba(0, 0, 0, .35);
}
```
读序自上而下:**提示 → 横幅 → 头像 → 牌架**,三者互不遮挡。

**备选方案 —— 放头像右侧**(垂直贴头像底,落在横幅占带之下,故横幅再宽也不撞):
```css
.turn-hint {
    position: absolute;
    left: 102px;                 /* > 头像+环右缘 96px */
    right: auto;
    bottom: calc(100% + 2px);    /* 与头像同底,占带[2,~42] 低于横幅[56,88] */
    top: auto;
    max-width: min(260px, 52vw);
    /* 其余同上(padding/圆角/底色/字号) */
}
@media (max-width: 560px) {       /* 手机头像 46px、环 58 → 右缘≈58px */
    .turn-hint { left: 64px; max-width: min(220px, 64vw); }
}
```

### 4.3 入场动效(门控)+ 文案

```css
@keyframes turnHintIn { 0% { opacity: 0; transform: translateY(4px); } 100% { opacity: 1; transform: translateY(0); } }
@media (prefers-reduced-motion: no-preference) {
    .turn-hint { animation: turnHintIn .25s ease both; }
}
```
- **自动消失**(WS-E.1,`FIRST_TURN_HINT_MS=6000`)及“已读”持久化属 JS/state,本报告只保证重定位后不遮挡。
- **文案校正**(WS-E.3,英文):与 toast 同口径,建议 `"When the timer runs out you draw a tile and your turn passes."`
- **合并 CoachCard**(spec 待定):视觉上 `.coach-card` 已是独立羊皮纸卡(`coachCard.css`),若并入则此环微文案作为 `.coach-card-rule` 第二句,首回合只出一块卡;**推荐合并**以免两块叠现。若保留分离,§4.2/4.3 + 快速自动消失即足够。

---

## 5. 无障碍 / 门控 / 命中区 验收清单(对照 spec §4 不变量)

| 项 | 结论 |
|---|---|
| 正文对比 ≥4.5:1 | 主 6.75 / 次 6.68 / 图标 10.5 / toast 13.2 / 提示 14.4 / Submit 绿 6.46·红 6.23 —— **全过** |
| 非文本 UI(焦点环)≥3:1 | 双环对绒面 4.74 + 深内环对金高对比 —— **过** |
| 移动命中区 ≥44px | 主 52 / 次 44 / 图标 44×44 —— **过** |
| 色盲第二通道 | Submit ✓/✕ 字形、Undo/Redo ↶/↷ 形状、toast ⏱、环内秒数 + 红晕、playable 形状标记 —— **保留** |
| 动效门控 | toast 入场 / 环脉冲 / hint 入场 全包在 `@media (prefers-reduced-motion: no-preference)`;reduced-motion 有静态兜底(红晕、直接出现)—— **过** |
| 应用内文案英文 | toast / aria-label「Undo」「Redo」/ hint 文案均英文 —— **过** |
| 既有能力不回归 | 键盘 Undo/Redo、禁用条件、`endStateClass/Glyph`、`.timer-low` 秒数脉冲、playerView 不泄露 —— **不动** |

## 6. 交前端的 class 改动摘要(仅说明,不改码)

- `submitBut`(`Board.jsx:390`):`'rummikub-button'+endStateClass` → `'primary-action'+endStateClass`(✓/✕ 字形不变)。
- `drawBut` / `endBut` / `forfeitBut`:`'rummikub-button'` → `'primary-action'`。
- `Sort: runs` / `Sort: colours`(`Board.jsx:616-627`):`'rummikub-button'` → `'secondary-action'`。
- `undoBut` / `redoBut`:文字 → `.icon-button` 图标(↶/↷),移入新 `.rack-tools`(`.hand-buttons` 内,与 `selfAvatar` 同级)。
- `controls-wrapper` 内分 `.controls-secondary` + `.controls-primary` 两组(§1.3)。
- `connectionCue` + 新 `timeoutToast` 收进 `.top-cue-stack`;`.connection-cue` 改 `position:static` 入栈。
- 移除/覆盖 `.controls-wrapper button{font-family:cheva}` 对新动作按钮的影响(改 Poppins)。

**Top Pick:** WS-C 的 brass 主操作 + 扁平次要 + 角落图标三级权重——一处建立正确视觉层级,直接回应 owner “Draw/Submit 应更重要”的核心诉求,且零规则/服务器风险。
