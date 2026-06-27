# 不滚动自适应盘面 — 设计 (自动整理 第三份 / 收尾)

**前置:** 自动整理引擎(第一份)+ 跨行搬家空间管理(第二份)已上线。搬家会把牌挪到别的行,玩家可能要竖向滚动才看得到。本文档实现主 spec `2026-06-27-auto-arrange-design.md` 延后的「不滚动自适应缩放」:让整个 9 行盘面在常规视口内**一屏全可见、无需滚动**,空间实在不够时才回退到滚动(带清晰度下限)。

纯前端 CSS 改动,不动游戏逻辑、不动引擎、不加依赖。

## A. 根因

盘面网格由 `src/rummikub/components/GridContainer.jsx` 渲染,行高**写死** `gridTemplateRows: repeat(${rows}, 7vh)`(第 19 行)。9 行 = 63vh。

- **桌面(≥821px)**:`.ref` 托盘 `max-height: 54vh`(board.css:48),小于 63vh → 竖向滚动。
- **手机(≤820px)**:`.ref` 盘面区 flex 填充(felt 减去顶部条 + 底部 rack),通常短于 63vh → 竖向滚动。
- 横向**已解决**:桌面 32×2.2vw=70.4vw 自适应不溢出;手机 `repeat(32, minmax(0,1fr))` 按屏宽均分。

所以只需把**行高从固定 `7vh` 改成自适应**,让 9 行均分 `.ref` 的可用高度。

## B. 方案:行高自适应 + 清晰度下限(纯 CSS)

把盘面网格(仅 `.ref` 内,手牌网格不动)的行高改为:

```
grid-template-rows: repeat(9, minmax(var(--board-row-min, 34px), 1fr)) !important;
```

- `1fr` 让 9 行均分 `.ref` 的可用高度 → 常规视口下 9 行全显、**不滚动**。
- `minmax(下限, 1fr)`:当可用高度 < 9×下限 时,每行夹到下限、网格总高超过 `.ref` → `.ref` 的 `overflow:auto` 接管滚动。这正是「带清晰度下限的不滚动」(用户选定的乙)。
- `!important`:覆盖 GridContainer 写在元素上的 inline `gridTemplateRows`(复刻现有手机端用 `!important` 覆盖列宽的写法,见 board.css:1115)。`repeat(9, …)` 里的 9 镜像 `BOARD_ROWS`,与手机端 `repeat(32,…)` 镜像 `BOARD_COLS` 的既有约定一致。

**高度链(实现要点)**:`1fr` 要生效,网格容器必须有确定高度。当前链路 `.ref`(flex:1, 有确定高)→ `.ref > div`(GridContainer 的 Centered 包裹,只设了 width)→ `.grid-container`。需让高度向下传递到网格:把 `.ref` 设为 `display:flex; flex-direction:column`,其子 `.ref > div` `flex:1; min-height:0`,`.ref .grid-container` `height:100%`(桌面 + 手机都要)。

**下限 `--board-row-min`**:默认 `34px`(牌约 30px、两位数字约 12px,可读)。做成 CSS 变量,真机观感得实测再调——留这个旋钮。

## C. 牌与格线跟随格子

行高变自适应后,两处原本钉死在 `7vh` 的东西要改成跟随格子:

1. **牌填满格子**:基础 `div.tile` 是 `width:2.0vw; height:5.4vh`(固定),手机端 `.ref div.tile` 也只到 `height:5.4vh`(仍固定)。统一改为盘面牌**填满其格子**:`.ref div.tile { width:100%; height:100%; … }`(留极小内缩当作牌间缝),`font-size` 用 `clamp()` 跟视口缩放(沿用现有 clamp 思路)。`.grid-item` 本就 `width/height:100%` 居中,无需动。手牌牌(在 `.ref` 外、rack 里)保持现有 44px 触摸尺寸不变。
2. **faint 格线对齐**:`.ref div.grid-container` 的 `background-size` 当前是 `2.2vw 7vh`(桌面)/ `calc(100%/32) 7vh`(手机)。竖向 `7vh` 改为 `calc(100% / 9)`(网格容器高 = 9 行总高),让格线随自适应行高对齐。横向桌面保持 `2.2vw`、手机保持 `calc(100%/32)`,均不变。

## D. 保留项 / 不变量

- **桌面 54vh 托盘 cap + 抬高的 rack 美学保留**:9 行缩进 54vh 内即不滚,早期空盘观感、rack 浮于中部的设计都不变。
- **不动**:`GridContainer.jsx` 的逻辑/手牌网格行高、引擎、move、游戏状态。理想下只改 `board.css`;若 inline `7vh` 无法用 `!important` 干净覆盖,允许把 GridContainer 的行高从 inline 提到可被 CSS 覆盖的形式(最小改动,不改手牌行为)。
- **无新依赖**。lint 不新增 error(现有 2 个 App.jsx:29 / Hand.jsx:11 不算)。

## E. 取舍(已与用户确认)

- 甲(纯 CSS 行高自适应)over 乙(整块等比缩放保持牌型,需 aspect-ratio/ResizeObserver,过度工程)over 丙(只修桌面)。
- 代价:高度受限时牌会**略变矮**(横宽不变)。多数桌面窗口几乎无感;嫌矮再上等比缩放。

## F. 验证

CSS 布局改动,jsdom 测不了真实排版,**不写 jest 单测**(YAGNI),改为 playwright 真实视口冒烟,作为合并前手动门禁:

1. 桌面视口(如 1280×800):落一局牌铺到第 8-9 行,`.ref` **无竖向滚动**(`scrollHeight ≈ clientHeight`),牌可读。
2. 手机视口(如 390×844):同样 9 行全显、不滚。
3. 极矮窗口(如 1280×360):应**回退到滚动**(下限生效,`scrollHeight > clientHeight`),不报错、布局不崩。
4. 跑全量 `npx jest` 确认不碰坏 `visual-system-a.test.js` 等既有测试;`npm run build` OK;`npm run lint` 无新 error。

部署后线上再用 playwright 复跑 1-3 冒烟。

## G. 已知限制 / 后续

- 下限以下仍滚动是有意为之(乙);真要极小屏也全显需更激进缩放或横向折行,YAGNI,暂不做。
- 本份只管「看得见」;不主动整桌居中/紧凑(沿用主 spec)。
- 自动整理三份(引擎 / 跨行搬家 / 不滚动自适应)至此收尾。
