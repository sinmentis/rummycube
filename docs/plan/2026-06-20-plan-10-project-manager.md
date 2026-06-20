# RummyCube 优化 · 任务拆解与 Sprint 计划(Senior Project Manager)

> **来源(权威)**:`docs/optimization/2026-06-20-rummycube-optimization-spec.md`(WS-1..WS-18,含 Recommended sequencing / Dependency notes / Open questions / Revision log)。
> **环境约束(已核实)**:单人维护、本地 VM(rootless Podman + Cloudflare Tunnel)、无外部 CI;迭代靠本地 `npm test`(jest,见 `jest.config.cjs`)+ Playwright smoke(`scripts/*.mjs`,通过 `SMOKE_URL`/`CHROMIUM_PATH` 调用)+ `podman` 重新部署。重启即清空对局(InMemory)。
> **不变量(全程保持)**:服务器权威校验 + `forceEndTurn` 截止反作弊不削弱;所有 juice 受 `prefers-reduced-motion` + mute 双门控。
> **本文档不改代码、不 commit。** 所有估时标 `[PLACEHOLDER]`,旁附 S/M/L 量级参考。
> **代码事实定位**:游戏逻辑在 `src/rummikub/`(`moves.js`、`moveValidation.js`、`Game.js`、`components/`、`hooks/`);测试在 `src/tests/`(jest);smoke 脚本在 `scripts/`。无法确认处标「待核实」。

---

## 0. TDD 节奏(每个任务统一遵循)

每个任务按 `writing-plans` 的红绿循环执行,**这是每条任务 DoD 的隐含前缀**:

1. **写失败测试**(jest 单测优先于实现;UI/集成用对应 Playwright smoke)。
2. **最小实现**让测试通过。
3. **跑全量** `npm test` 绿 + 相关 smoke 绿。
4. **本地 podman 重部署冒烟**(涉及前端/服务器行为时)。
5. **单条提交**(bite-sized,可独立评审回滚)。

> 报告里每条任务的「验收」列只列该任务**新增**的关键断言/命令;「全量 `npm test` 绿 + 现有 drag/multidrag/touch/timer smoke 不回归」是所有任务的通用退出条件,不逐条重复。

---

## 1. Sprint 计划

### Sprint 1 — P0:新手「赛前 + 第一回合」安全/可读/可教/顺滑

- **目标**:把 persona 的两个首跳出点(等候室、首回合 ≥30 首牌的无解释惩罚)堵上,并消除计时器满盘重渲染的卡顿。
- **范围**:WS-1(安全自解释提交)、WS-2(首跑引导)、WS-3(可读牌桌面)、WS-4(性能快赢)、**WS-6 等候室核心**(spec 明确提升至 Sprint 1;invite 面板打磨可拖到 Sprint 2)。
- **退出标准(exit criteria)**:
  1. 在无效首牌上点「提交」**不再**回滚/罚抽/结束回合;按钮变红并就地显示**带原因码**的内联文案(WS-1)。
  2. `forceEndTurn` 超时路径与新 `forfeitTurn` 仍按旧逻辑回滚+罚抽(反作弊未削弱)——jest 证明。
  3. 新手能从导航栏打开「How to play」,首回合 coach card 出现且 dismiss 后持久不再弹(WS-2)。
  4. 牌桌有可见托盘边框 + 拖拽时合法空位高亮;多选落子遵守「连续空位足够才落、否则整体拒绝」(WS-3)。
  5. 计时器 tick 不再重渲染 `GridContainer`;选中单张只重渲染变化的 tile;生产 bundle 无 `console.log`/`RENDER BOARD`(WS-4)。
  6. 新建 2 人房显示「1 of 2」等候遮罩,第二人加入前棋盘不可交互(WS-6 核心)。
- **可玩状态**:被邀请的新手可顺利经过等候室、看懂规则、安全地尝试并理解第一回合,且操作不卡。

### Sprint 2 — P1:回合可读性、移动端、可达性、combo 重设计

- **目标**:把「能完成第一回合」升级为「在桌面与手机上都看得清、点得到、玩得爽」。
- **范围**:WS-5(回合/计时可读)、WS-7(移动端布局 + 控件不沉底)、WS-8(对比度 + 可达性)、WS-9(combo 重设计)、(若拖延)WS-6 invite 面板打磨。
- **退出标准**:
  1. 轮到你时有「● 你的回合」横幅 + 环心剩余**秒数**(数字、非纯色编码),最后几秒有脉冲告警(WS-5)。
  2. 390×844 下每张手牌都在可滚动 rack 内不被裁切;chat 折叠为可点气泡,不压住「Tiles left」HUD;控件行在首屏内(WS-7)。
  3. 橙色数字对比度 ≥3:1;提交有效/无效有 ✓/✕ 非色彩第二通道;Ctrl+Z/Ctrl+Y 可撤销/重做(WS-8)。
  4. combo 改为「操纵/重组」加权:1 张操纵成 2 组 > 3 张平铺堆叠;`lastPlay` 携带 **freeze 前**算出的操纵分;对手出牌与本地拖拽中不触发 `fx.kick`(WS-9)。
- **可玩状态**:手机玩家与色觉障碍玩家都能流畅完整对局;combo 反馈奖励技巧而非囤牌且不打扰旁观者。

### Sprint 3 — P2:降低空闲、joker 深度、断线、网络韧性、输入替代

- **目标**:中段体验与韧性。**WS-12 先做架构 spike 再估时**。
- **范围**:WS-10(降低 downtime)、WS-11(joker 深度)、WS-12(断线处理,spike 先行)、WS-13(网络韧性 + 持久化)、WS-14(输入替代)。
- **退出标准**:
  1. 手牌中能延展桌面组的 tile 被高亮 + 「可出张数」计数(纯函数 `playableTiles` 有单测)(WS-10)。
  2. joker 回收移动可用且仅在棋盘保持合法时成功;joker 以其代表值计入 `lastPlay.points`(WS-11)。
  3. 有 spike 文档说明「连接状态如何进入权威 state」;断线活动座位在 grace 窗口内自动推进而非耗满 `timePerTurn`(WS-12)。
  4. build 产出 >1 chunk 且主 chunk 明显变小;强制断 socket 显示「reconnecting」横幅;持久化后端落地使重连/统计在重启后可存(WS-13)。
  5. 两次点击(tap tile → tap destination)可落子,无需拖拽(WS-14)。
- **可玩状态**:对局在断线/重启/弱网下不轻易崩;非拖拽用户也能玩。

### Backlog — P3:打磨

- **范围**:WS-15(视觉打磨)、WS-16(留存与重赛)、WS-17(首页清晰度)、WS-18(清理)。
- **退出标准**:各自 spec 验收达成;WS-18 的 jest 断言(undo 栈不超 N、bundle 无 F8 debugger 监听、文案统一「Room code」)绿。
- **可玩状态**:体验细节收尾,首页不再像「鬼城」。

---

## 2. 任务 backlog 表

> **粒度**:每条尽量 30–60 分钟可实现、可独立测试与评审。估时列 `量级 / [PLACEHOLDER]`(人日待填)。
> **依赖**列填前置任务 ID;空白表示无 Sprint 内强依赖。
> 通用退出条件(全量 `npm test` 绿、现有 smoke 不回归、podman 重部署冒烟)对所有任务生效,不在表内重复。

### Sprint 1(P0)

| 任务ID | 标题 | WS | 依赖 | 估时 | DoD(完成定义) | 验收(命令/断言) |
|---|---|---|---|---|---|---|
| T1-1 | `submitRejectReason(G,ctx)` 纯函数 + 重构 `isFirstMoveValid`/`isMoveValid` 暴露 reason+score | WS-1 | — | M / [PLACEHOLDER] | 在 `moveValidation.js` 加纯函数返回 `{code,score?,required?,group?}`,`code ∈ {BELOW_30,RUN_TOO_SHORT,INVALID_GROUP,MIXED_FIRST_MOVE,NO_NEW_TILE,OK}`;两个布尔校验函数复用其 `code==='OK'`;**不引用** `lastPlay`/combo points 作为无效原因 | `npm test`:对构造盘面逐一返回各 `code`(`BELOW_30` 带 `score`);合法盘面 → `OK` |
| T1-2 | 新增当前玩家 move `submitMeld`(无效即 no-op,有效走旧 valid 路径) | WS-1 | T1-1 | M / [PLACEHOLDER] | 无效返回 `INVALID_MOVE` 且**不**改 `G.tilePositions`/手牌数/`tilesPool`/`ctx.currentPlayer`(无回滚、无罚抽、不结束回合);有效则 freeze + 写 `lastPlay` + `events.endTurn()` | jest:无效盘面 `submitMeld` 后上述四项均不变;有效盘面 freeze+`lastPlay`+回合结束 |
| T1-3 | 新增 `forfeitTurn`(显式确认放弃 → 回滚+罚抽);保持 `forceEndTurn` 不变 | WS-1 | T1-1 | S / [PLACEHOLDER] | `forfeitTurn` 是独立 move(不复用 `forceEndTurn`,后者在截止前 reject);超时路径逻辑零改动 | jest:截止后 `forceEndTurn` 仍回滚+罚抽(不变);当前玩家 `forfeitTurn` 以显式意图回滚+罚抽 |
| T1-4 | 客户端接线:「Submit meld」按钮调 `submitMeld`、内联原因文案、Draw 可见但禁用 | WS-1 | T1-2 | M / [PLACEHOLDER] | 暂存 tile 时「End」改名「Submit meld」并调 `submitMeld`;拒绝时 tile 留原位 + 红按钮旁内联映射 `code`(+`score`/`required`)→ 文案;Draw 保持可见禁用(tooltip「Clear your placed tiles to draw instead」) | Playwright(solo):放 2 tile → 按钮红 + 内联原因;点击后棋盘不变;无 `pageerror` |
| T2-1 | 导航栏「How to play」常驻入口 + 轻量规则 modal(静态) | WS-2 | — | M / [PLACEHOLDER] | modal 含目标、抽/出、run/set 定义、≥30 首牌、joker、回合计时;无后端 | Playwright:点导航栏打开 modal,含字符串「30」与「run」/「set」 |
| T2-2 | 一次性首回合 coach card(localStorage flag) | WS-2 | — | S / [PLACEHOLDER] | 首回合显示目标 + 「首次出牌须 run/set 合计 ≥30」;dismiss 写 localStorage | Playwright:dismiss 后重开对局页不再自动弹 |
| T2-3 | joker 悬停/长按标签 +  lobby hero 行与 2-3 条说明 bullet | WS-2 | — | S / [PLACEHOLDER] | joker 暴露可访问标签「Joker (wildcard)」;Create/Join 标签上方加 hero + bullets | 视觉/可达性:joker tile 有 accessible label;lobby 文案存在 |
| T3-1 | 纯函数 `resolveDropSlot(pointerRect,gridRect,occupancy,selectionLength)` | WS-3 | — | M / [PLACEHOLDER] | 单 tile 吸附最近空位;多选要求 `selectionLength` **连续**空位,不足则整体**拒绝**(不部分/重叠放置);不改 `moveTiles` 契约 | jest:单 tile 吸附最近空;3 选落到 2 空位被拒(不部分放);落到 3 空位连续放置 |
| T3-2 | 牌桌「托盘」框 + 极淡网格(纯 CSS) | WS-3 | — | S / [PLACEHOLDER] | `.ref`/`.grid-container` 加 brass 1px 内边 + `--felt-vignette` inset + 居中 `max-width`;恢复 `rgba(255,255,255,.04)` 网格线;无 markup 改动 | Playwright(solo):截图显示托盘边框 + 列可辨;现有 drag smoke 不回归 |
| T3-3 | 拖拽起始高亮合法空位 + 在 `moveTiles` 前接入 `resolveDropSlot` | WS-3 | T3-1 | M / [PLACEHOLDER] | drag-start 给空 `.grid-item` 加 class/state;落子前先跑 resolver,再走 `moves.moveTiles` | Playwright(solo):拖拽中可见 droppable 标记;单 tile 偏移 <半格仍提交(Undo 可用) |
| T4-1 | 抽出自包含 `<TurnTimer>`/avatar-ring(自管 tick 或 CSS `animation-duration` 驱动) | WS-4 | — | M / [PLACEHOLDER] | 倒计时移出 `Board.jsx:264` 的 `useTurnTimer`,`Board` 不再随 tick 重渲染 | RTL:计时 tick **不**重渲染 `GridContainer` |
| T4-2 | `isSelected` 布尔下传 + `Tile`/`GridSlot`/`GridContainer` 包 `React.memo` | WS-4 | T4-3 | M / [PLACEHOLDER] | 在 `GridContainer` 算 membership,下传布尔(不再传 `selectedTiles` 数组);去掉 memo 边界的无用 pass-through props(如 `hoverPosition`)或加自定义 comparator | RTL:选中单 tile 只重渲染变化的 tile,不是全部 ~330 |
| T4-3 | 用 ref 稳定 `handleTileSelectionCb`/`handleLongPressCb`,去 per-render/per-tick 日志 | WS-4 | — | S / [PLACEHOLDER] | 回调从 ref 读 `G`/selection 使依赖空/稳定;删除 `console.log(state)` 与 `RENDER BOARD`/per-tick 日志 | RTL:回调 identity 在多次选择间稳定;源码不含上述日志 |
| T4-4 | `vite.config` `esbuild.drop:['console','debugger']` + chat 不透明背景 + dev-only render counter | WS-4 | T4-1,T4-2 | S / [PLACEHOLDER] | 生产构建剥离 console/debugger;chat `backdrop-filter:blur(4px)` 换 ~`.9` 实色;导出仅 dev 的渲染计数器(生产剥离) | Playwright(solo):生产 bundle 无 `console.log`;~5s 空闲无 per-tick 日志 |
| T6-1 | 等候室核心:等候遮罩 +「{joined} of {n}」+ 棋盘禁用(Sprint 1) | WS-6 | — | M / [PLACEHOLDER] | `playersJoin` 期间显示遮罩 + spinner;棋盘 dim/不可交互直到满员 | Playwright:新建 2 人房显示「1 of 2」;第二人加入前棋盘不可交互 |

### Sprint 2(P1)

| 任务ID | 标题 | WS | 依赖 | 估时 | DoD | 验收 |
|---|---|---|---|---|---|---|
| T5-1 | 回合横幅 + 环心剩余秒数 + 首回合微文案 + 最后几秒脉冲 | WS-5 | T1-1, T4-1 | S-M / [PLACEHOLDER] | 「● 你的回合 / {name}'s turn」横幅近 rack;环心渲染剩余整秒;首回合提示「ring 跑完自动结束」;色觉安全(非纯色) | Playwright:你的回合横幅读「Your turn」且环心秒数存在并递减;非仅靠颜色区分 |
| T6-2 | invite 面板打磨:room code + 大号 Copy-link + 重标「Need more players? Share this room」 | WS-6 | T6-1 | S / [PLACEHOLDER] | 暴露房间码 + 复制按钮;重命名 invite 面板 | Playwright:房间码与 Copy-link 可见可点 |
| T7-1 | 可滚动 / auto-fit rack(390px 全手牌可达) | WS-7 | — | M / [PLACEHOLDER] | rack 横向滚动/auto-fit,所有手牌可达不裁切 | Playwright 390×844:无手牌被裁切 |
| T7-2 | chat 折叠为可点气泡/FAB(窄屏)+ HUD z-index/预留行 | WS-7 | — | M / [PLACEHOLDER] | 窄屏 chat 非常驻,点击展开;tiles-left/invite HUD 不压在 chat 下 | Playwright 390×844:chat 不与「Tiles left」HUD 重叠;无 `pageerror` |
| T7-3 | 控件行提到首屏(cap board 高度 + 预留 rack)+ 4 座 avatar 不裁切/重叠 | WS-7 | — | M / [PLACEHOLDER] | 解决 `.board` `min-height:100vh` 把 Sort/Draw/Submit/Undo/Redo 顶到底边(UI-5);桌/手机控件始终可见;avatar 不压 rack | Playwright(768px 与 390px):控件行在视口内可见 |
| T8-1 | 橙色加深至 ≥3:1 + 提交态/每 tile 校验态加 ✓/✕ 非色彩通道 | WS-8 | T1-1 | S-M / [PLACEHOLDER] | `--c-orange` → `#b5650a`+;End 有效/无效 + 每 tile 高亮加 glyph | 计算对比度 ≥3:1;灰度下 End 态可辨(有 glyph) |
| T8-2 | 移动端 hit target 趋向 44px + Ctrl+Z/Ctrl+Y 撤销/重做 | WS-8 | — | S / [PLACEHOLDER] | tile 触控目标增大;键盘 Undo/Redo 绑定 | Playwright:键盘 Undo/Redo 生效 |
| T9-1 | 在 `validatePlayerMove` 内 **freeze 前**算操纵分并写 `G.lastPlay` | WS-9 | — | M / [PLACEHOLDER] | 以「形成/延展的 distinct 组 + 重组并入的旧桌 tile」重定基,tile-count 为次要项;必须在 `freezeTmpTiles()`/`events.endTurn()` 前算(`G.prevTilePositions` 在 `onTurnBegin moves.js:267` 被重置);不在客户端事后重算 | jest:1 张操纵成 2 组的 combo 值 > 3 张平铺堆叠;`lastPlay` 携带 freeze 前算的操纵分 |
| T9-2 | juice 按归属缩放的门控谓词(对手出牌/本地拖拽中无 kick) | WS-9 | — | S / [PLACEHOLDER] | 纯谓词:自家出牌全特效;对手出牌静音、无 `fx.kick`、无 win-sting;本地有 active drag/selection 时不 `fx.kick` | jest:对手 `lastPlay` 与本地拖拽/选择进行中均返回「no kick」 |
| T9-3 | 减少有效提交的 paint 尖峰(confetti 或 flash 二选一;board-kick 改 transform-only) | WS-9 | T9-2 | M / [PLACEHOLDER] | confetti OR flash 不并发;`board-kick` 移到 `will-change:transform` 的 wrapper(非 20-box-shadow `.board` 子树);`celebrateGroups` glow 限于提交的 run | Playwright(solo):提交有效牌无明显掉帧/无双重特效;现有 celebrate smoke 不回归 |

### Sprint 3(P2)

| 任务ID | 标题 | WS | 依赖 | 估时 | DoD | 验收 |
|---|---|---|---|---|---|---|
| T10-1 | 纯函数 `playableTiles(hand,board)` + 手牌可延展高亮 + 「可出张数」计数 | WS-10 | — | S / [PLACEHOLDER] | 纯 helper:桌上有 run/set 且手中有匹配 tile → 标记;不匹配 → 不标;UI 标记 + 计数 | jest:构造盘面单测(匹配标记、非匹配不标);Playwright(solo,尽量 seeded 而非随机发牌):标记渲染 |
| T10-2 | (later)对手回合私有半透明 planning overlay(本回合校验/对账) | WS-10 | T10-1 | L / [PLACEHOLDER] | 半透明计划层,自回合 reconcile;**见开放决策 #4——若仅做高亮则降级入 Backlog** | Playwright:overlay 渲染且自回合校验 |
| T11-1 | joker 回收 move(两张匹配值+色的真 tile 拖到桌面 joker 上,仅当棋盘仍合法) | WS-11 | — | M-L / [PLACEHOLDER] | 拥有两张匹配 tile 且回收后棋盘合法才成功,否则拒绝 | jest:满足条件回收成功;否则拒绝 |
| T11-2 | joker 以代表值计入 combo/celebration 评分 | WS-11 | T11-1, T9-1 | S-M / [PLACEHOLDER] | joker 携带其代表值参与 `lastPlay.points` | jest:joker 对 `lastPlay.points` 贡献其代表值 |
| T12-1 | **架构 spike**:连接状态进入权威 game state 的方案文档 | WS-12 | — | M / [PLACEHOLDER] | 文档说明:可信服务端 middleware / boardgame.io plugin / 服务器 `onConnectionChange` 写 `G.connected[seat]`;**绝不信任客户端连接 flag**;说明 `onTurnBegin` 无 `matchData`/`isConnected`(`moves.js:259-268`)的限制 | spike 文档评审通过(连接状态如何到达 game state) |
| T12-2 | 实现:把连接状态镜像进 `G.connected[seat]`(按 spike 方案) | WS-12 | T12-1 | M / [PLACEHOLDER] | 服务端可信地写入权威 state | jest/smoke:断线写入 `G.connected[seat]` |
| T12-3 | 折叠断线座位 grace 截止 + 跨 N 断线回合的 vote-skip/forfeit(余牌转最终分) | WS-12 | T12-2 | M / [PLACEHOLDER] | 断线活动座位 grace 窗口内自动推进;N 回合后可投票跳过/判负 | jest/smoke:断线活动座位在 grace 窗口内自动推进,而非耗满 `timePerTurn` |
| T13-1 | 持久化后端(FlatFile 或 SQLite,见开放决策 #5) | WS-13 | T9-1 | M / [PLACEHOLDER] | `src/server.js` 配 `db`(当前无 → InMemory,重启清空);重连/统计在重启后可存;**前置于 T13-2 重连与统计持久** | 重启后进行中对局 + `/api/stats` 仍在;`server-stats.test.js` 不回归 |
| T13-2 | 「reconnecting…」横幅 + 提交后「syncing」线索直到 `G` 确认 | WS-13 | T13-1 | M / [PLACEHOLDER] | 暴露 boardgame.io 连接状态;socket 断显示 banner;提交移动到 `G` 确认前显示 syncing | Playwright:强制断 socket 显示 reconnecting 横幅(参考 `scripts/smoke-reconnect.mjs`) |
| T13-3 | bundle 拆分(`manualChunks` vendor/boardgame.io)+ 按方法 lodash 导入 + `React.lazy` 重组件 + 移除未用 bootstrap | WS-13 | — | M / [PLACEHOLDER] | 拆 563KB;`React.lazy` GameOverModal/confetti/ComboOverlay;若未用则删 `bootstrap`/`react-bootstrap` | build 产出 >1 chunk 且主 chunk 明显变小 |
| T14-1 | tap-tile → tap-destination 非拖拽落子模式 | WS-14 | — | M / [PLACEHOLDER] | 两次点击落子作为拖拽 fallback | Playwright:无拖拽两次点击可落子 |
| T14-2 | 键盘光标 + Enter 落子路径 | WS-14 | T14-1 | M / [PLACEHOLDER] | 键盘可选 tile 与目标并 Enter 确认 | Playwright/RTL:键盘路径落子成功 |

### Backlog(P3)

| 任务ID | 标题 | WS | 依赖 | 估时 | DoD | 验收 |
|---|---|---|---|---|---|---|
| T15-1 | 视觉打磨:控件 Poppins、rack 趋 `fit-content`/居中、self-avatar 进 rack notch + brass-on-ink 计数徽章、cap board 高度 | WS-15 | — | S / [PLACEHOLDER] | 按 UI-5/6/7 调整 | 视觉验收 + 控件清首屏 |
| T16-1 | per-nickname localStorage 统计(games/wins/best combo)上首页 | WS-16 | — | S-M / [PLACEHOLDER] | 首页展示本地统计 | 数据写读正确 |
| T16-2 | 房内一键重赛 + ready check(替代重发链接) | WS-16 | — | M / [PLACEHOLDER] | 房内重赛带 ready check | Playwright:重赛流程可走通 |
| T17-1 | 首页清晰度:hero「what is this」+ 低数值文案软化 + 显式「Try solo」入口(surface `0 · solo test`) | WS-17 | — | S / [PLACEHOLDER] | 首页讲清是什么;「0 players online」不再像死站;solo 入口外露 | 文案/入口存在 |
| T18-1 | 清理:统一「Room code」文案、移除生产 `F8→debugger`(`App.jsx:25-31`)、cap undo 快照栈深 | WS-18 | — | S / [PLACEHOLDER] | 文案统一;F8 监听不入 bundle;undo 栈不超 N | jest:回合内 undo 栈 ≤N;bundle 无 F8 监听;join 文案处处「Room code」 |

---

## 3. 关键路径与并行机会

### 关键路径(最长依赖链)

```
WS-1: T1-1 → T1-2 → T1-4            (Sprint 1 内最重的服务器改动;reason code 是下游 WS-5/WS-8 的输入)
WS-4: T4-3 → T4-2 → T4-4           (memo 依赖 isSelected/回调稳定,否则是 no-op)
WS-9: T9-1(pre-freeze 操纵分) ─────► WS-13: T13-1(持久化读 lastPlay) ─► T13-2(重连/统计持久)
WS-12: T12-1(spike) → T12-2 → T12-3 (spike 未出方案前不可估时,整链阻塞)
```

**跨 Sprint 关键链**:`T1-1 → T5-1/T8-1`(reason code 喂回合可读 + 教学线索);`T9-1 → T13-1 → T13-2`(操纵分必须先在 freeze 前落到 `lastPlay`,持久化才有东西可读)。

### 简单甘特设想(Sprint 内)

- **Sprint 1**
  - 轨道 A(服务器):`T1-1 → T1-2 → T1-3`(并行可做 T1-3 与 T1-2,均只依赖 T1-1)→ `T1-4`。
  - 轨道 B(前端性能):`T4-3 → T4-2 → T4-4`;`T4-1` 可独立并行(再汇入 T4-4)。
  - 轨道 C(无强依赖,任意穿插):`T2-1`、`T2-2`、`T2-3`、`T3-2`、`T6-1`、`T3-1`(→`T3-3`)。
  - **建议先行**:`T1-1`(解锁 WS-1 链 + 跨 Sprint 下游)与 `T4-3`(解锁 memo 链)。
- **Sprint 2**:`T5-1` 等 `T1-1`+`T4-1` 完成;WS-7 三条(T7-1/2/3)互不依赖可并行;`T9-1`/`T9-2` 并行,`T9-3` 接 `T9-2`;`T8-1` 接 `T1-1`(用 reason code 做第二通道教学)。
- **Sprint 3**:`T12-1` spike **第一件事**,完成前不估 T12-2/3;`T13-1` 接 `T9-1`,且是 `T13-2` 前置;`T13-3`、`T10-1`、`T11-1`、`T14-1` 互不依赖可并行。

### 并行机会小结(单人维护下也利于「成批写测试再实现」)

- WS-2 的 T2-1/2-2/2-3 与 WS-3 的 T3-2 是纯前端静态/CSS,**零服务器依赖**,最适合作为 Sprint 1 的「填空」任务穿插在等服务器评审时做。
- 纯函数任务(`submitRejectReason` T1-1、`resolveDropSlot` T3-1、`playableTiles` T10-1、juice 谓词 T9-2)可**先写满 jest 再实现**,彼此独立。

---

## 4. 范围控制

### 现在不做 / 延后(明确裁剪)

- **WS-10 full planning/ghost overlay(T10-2)**:spec 把它标为「Later: L」。建议 **Sprint 3 仅做 `playableTiles` 高亮(T10-1)**,overlay 视开放决策 #4 默认**降级入 Backlog**。
- **WS-6 invite 面板打磨(T6-2)**:Sprint 1 只交付等候核心(T6-1),打磨拖到 Sprint 2。spec 原文即如此切分。
- **WS-12 实现(T12-2/T12-3)**:在 spike(T12-1)给出「连接状态如何进权威 state」方案前,**不排期、不估时**(spec dependency note 明确)。
- **WS-16 留存/重赛、WS-15 视觉打磨**:P3,在 P0–P2 全绿前不动。
- **不引入后台常驻进程**:所有 smoke 用一次性 `node scripts/*.mjs`,不留守护进程;不新增需常驻的 watcher/服务(符合本仓约定与环境约束)。
- **不做的非目标(spec Non-goals)**:登录/账号/变现/增长机制、新玩法变体、A1 Classic 美术大改 —— 一律拒绝纳入 backlog。

### 5 个开放决策对排期的影响与建议默认值

| # | 决策 | spec 默认 | 建议默认(本计划采用) | 对排期影响 |
|---|---|---|---|---|
| 1 | 无效提交(WS-1) | 非破坏性 `submitMeld` no-op,罚抽仅在 `forceEndTurn` 超时路径;可选显式 `forfeitTurn` | **采用 spec 默认**:no-op 提交 + 提供显式 `forfeitTurn`(T1-3) | 已含 T1-2/T1-3,无额外影响 |
| 2 | combo 重设计(WS-9) | 操纵加权评分 | **采用操纵加权**(T9-1) | 决定 T9-1 算法形态;若改「保留 tile-count 仅去囤牌激励」,T9-1 工作量略降但仍需 pre-freeze |
| 3 | 移动端 chat(WS-7) | 手机折叠为气泡(推荐) | **折叠为气泡**(T7-2) | 不影响排期;仅 T7-2 实现方式 |
| 4 | planning/ghost(WS-10) | 全 overlay 还是仅高亮 | **先仅高亮(T10-1)**,overlay(T10-2)入 Backlog | 直接决定 T10-2 是否进 Sprint 3 |
| 5 | 持久化后端(WS-13) | FlatFile vs SQLite | **建议 SQLite**(可查询、便于 `/api/stats` 与重连排障,仍自托管);若想最省事则 FlatFile | 决定 T13-1 实现;与 WS-13 同期,T9-1 须先于 T13-1 |

> 这些默认值是**建议**,需 owner(@sinmentis)拍板。决策 #1/#2/#5 直接影响服务器与评分/持久化的实现形态,**建议在 Sprint 1 启动前确认 #1、Sprint 2 前确认 #2、Sprint 3 前确认 #4/#5**。

---

## 5. 里程碑与可交付(每 Sprint 末「可玩/可验证」状态)

- **M1(Sprint 1 末)**:被邀请的新手能经过「等候室(1 of 2)→ 看 How-to-play → 安全尝试第一回合(无效提交不再毁牌、有红字解释)」,且自家回合无计时器卡顿、生产无调试日志。**可玩 solo + 2 人本地房**;`forceEndTurn` 反作弊与服务器权威完好。
- **M2(Sprint 2 末)**:桌面与 390px 手机都能完整、清晰、可达地对局;色觉障碍可辨提交态;combo 反馈奖励重组、不打扰旁观。**完整一局在手机上可玩**。
- **M3(Sprint 3 末)**:对局在断线/弱网/重启下更稳(grace 自动推进、reconnecting 横幅、持久化后重启不丢局与统计);非拖拽用户可两次点击落子;首屏 bundle 更小。
- **M4(Backlog 收尾)**:视觉打磨、首页清晰、清理项落地(undo 栈封顶、无 F8 debugger、文案统一)。

---

## 6. 风险与假设登记表

| ID | 类型 | 描述 | 影响 | 缓解 |
|---|---|---|---|---|
| R1 | 假设 | 重启即清空对局(`src/server.js` 无 `db` → InMemory) | 重启丢进行中局 + `/api/stats`;重连在重启期失败 | 直到 WS-13 T13-1 落地前,避免在重启窗口操作;部署选低峰;尽快排期 T13-1 |
| R2 | 风险 | 无外部 CI,质量全靠本地 `npm test` + 手动 smoke | 回归可能漏网 | 每任务强制 TDD(先红测);维护 `scripts/*.mjs` smoke 套件;合并前本地全量 + 相关 smoke |
| R3 | 风险 | 单人维护,带宽有限 | Sprint 易拖期 | bite-sized 任务可独立提交;纯函数/CSS 任务可碎片化穿插;估时留 `[PLACEHOLDER]` 由 owner 校准 |
| R4 | 风险 | WS-1 误削弱 `forceEndTurn` 反作弊 | 作弊面扩大 | T1-2/T1-3 严格分离:no-op 提交 vs 超时罚抽;jest 锁定超时路径不变 |
| R5 | 风险 | WS-4 memo 若不先做 isSelected/回调稳定则为 no-op | 性能改动白费 | 强制依赖顺序 `T4-3 → T4-2`;RTL 渲染计数器证明只重渲染变化 tile |
| R6 | 风险 | WS-9 操纵分若在 freeze 后/客户端算则永远拿不到基线(`G.prevTilePositions` 每 `onTurnBegin` 重置) | combo 评分错误且不可持久化 | T9-1 必须在 `validatePlayerMove` freeze 前算并写 `lastPlay`;jest 断言 `lastPlay` 携带 pre-freeze 分 |
| R7 | 不确定 | WS-12 连接状态进权威 state 的可行方案未定(`onTurnBegin` 无 `matchData`/`isConnected`) | 无法估时,可能需 boardgame.io plugin/server hook | spike(T12-1)先行;未出方案不排期实现 |
| R8 | 风险 | Playwright smoke 依赖随机发牌时不稳定(WS-10) | 测试 flaky | T10-1 用纯函数单测 + 尽量 seeded/constructed 状态(spec 已建议) |
| R9 | 假设 | smoke 通过 `SMOKE_URL`/`CHROMIUM_PATH` 一次性运行,不留常驻进程 | 与环境约束一致 | 沿用 `scripts/*.mjs` 现有约定;不新增守护进程 |
| R10 | 待核实 | 估时人日需 owner 校准;`bootstrap`/`react-bootstrap` 是否真未用需扫描确认 | 影响 T13-3 删依赖范围 | T13-3 实施前 grep 确认用量;估时由 owner 填 `[PLACEHOLDER]` |

---

## 7. WS → 任务 可追溯矩阵

| WS | P 级 | Sprint | 覆盖任务 | 状态 |
|---|---|---|---|---|
| WS-1 安全自解释提交 | P0 | 1 | T1-1, T1-2, T1-3, T1-4 | ✅ 全覆盖 |
| WS-2 首跑引导 | P0 | 1 | T2-1, T2-2, T2-3 | ✅ |
| WS-3 可读牌桌面 | P0 | 1 | T3-1, T3-2, T3-3 | ✅ |
| WS-4 性能快赢 | P0 | 1 | T4-1, T4-2, T4-3, T4-4 | ✅ |
| WS-5 回合/计时可读 | P1 | 2 | T5-1 | ✅ |
| WS-6 等候室 | P0→1(核心)/P1(打磨) | 1 + 2 | T6-1(核心), T6-2(打磨) | ✅ |
| WS-7 移动端布局 | P1 | 2 | T7-1, T7-2, T7-3 | ✅ |
| WS-8 可达性/对比度 | P1 | 2 | T8-1, T8-2 | ✅ |
| WS-9 combo 重设计 | P1 | 2 | T9-1, T9-2, T9-3 | ✅ |
| WS-10 降低 downtime | P2 | 3 | T10-1(高亮), T10-2(overlay,可降级 Backlog) | ✅ |
| WS-11 joker 深度 | P2 | 3 | T11-1, T11-2 | ✅ |
| WS-12 断线处理 | P2 | 3 | T12-1(spike), T12-2, T12-3 | ✅(实现待 spike) |
| WS-13 网络韧性 + 持久化 | P2 | 3 | T13-1, T13-2, T13-3 | ✅ |
| WS-14 输入替代 | P2 | 3 | T14-1, T14-2 | ✅ |
| WS-15 视觉打磨 | P3 | Backlog | T15-1 | ✅ |
| WS-16 留存与重赛 | P3 | Backlog | T16-1, T16-2 | ✅ |
| WS-17 首页清晰度 | P3 | Backlog | T17-1 | ✅ |
| WS-18 清理 | P3 | Backlog | T18-1 | ✅ |

**覆盖缺口检查**:18 个 WS **全部有任务覆盖,无遗漏**。

**需 owner 注意的「软缺口」/开放问题**:

1. **跨切面「持久化」**(spec Cross-cutting):已并入 WS-13 的 T13-1,建议与 WS-13 同期 —— 但它实为 WS-12 重连与统计持久的**隐性前置**,若 WS-12 先做需注意顺序。
2. **WS-12 实现不可估时**:T12-2/T12-3 的估时与方案均依赖 T12-1 spike 结论,**当前为占位**。
3. **WS-10 T10-2** 是否进 Sprint 3 取决于开放决策 #4;默认降级 Backlog。
4. **5 个开放决策**(见 §4)需 owner 拍板,其中 #1/#2/#5 影响服务器/评分/持久化实现形态,建议按 §4 时点确认。
5. 所有 `[PLACEHOLDER]` 人日估时待 owner 校准;`bootstrap` 删除范围(T13-3)实施前需 grep 核实(标「待核实」)。
