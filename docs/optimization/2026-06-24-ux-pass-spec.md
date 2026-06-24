# RummyCube · 操作清晰度与反馈 UX-pass · Spec

**日期:** 2026-06-24 · **owner:** @sinmentis · **来源:** 本轮 brainstorming(线上实测 + owner 决策)
**状态:** 待 owner 评审 → 专家团队 spec→plan → 实施
**实施分支(拟):** `feat/ux-pass-clarity`

---

## 1. 背景与现状(线上实测得到,避免误判)

owner 在 game.shunlyu.com 反馈四个问题。逐项核实当前真实行为:

1. **「倒计时结束后没有真的惩罚」** —— 实际**已经有**惩罚:计时到点后任意在线客户端的 `TurnDeadlineWatcher`
   触发 `forceEndTurn`(`moves.js`),它会 `drawTile`(抽 1 张)并结束回合;有暂存牌则先 `validatePlayerMove`。
   实测一局 solo 放置数分钟,手牌从 14 涨到 29、牌堆 92→77,即连续超时各抽 1 张。**真正缺的是反馈**:
   超时**毫无任何提示**,而且 solo(1 人)时回合立刻转回自己,所以「感觉不到」。机制本身正确,缺的是「存在感/反馈」。

2. **「什么是 playable,没看懂」** —— `.playable-hint`(`Board.jsx` + `planning.js`)显示「{n} playable」并高亮手牌,
   本意是「你手里有几张牌现在能直接接到牌桌上已有的合法组合上」。措辞过于含糊,且默认常驻,新玩家困惑。

3. **「Draw / Submit 按钮应该比其它按钮更重要更常用」** —— 现状 `Draw`、`Submit meld`、`Sort: runs`、
   `Sort: colours`、`Undo`、`Redo`、`End`/`Give up turn` 全部共用同一个 `.rummikub-button` 样式,视觉权重相等,
   主操作淹没在次要操作里。

4. **「Undo/Redo 改图标、挪到别处、让操作更清晰」** —— 现状是与主操作并排的文字按钮,占位且分散注意力。

附带(本轮一并修):**首回合提示 bug** —— `.turn-hint`(「When the ring runs out, your turn ends automatically.」)
`position:absolute; left:6px; bottom:calc(100%+30px)`,与同样 `left:6px` 绝对定位的头像(`.rack-self` +2px)和
回合横幅(`.turn-banner` +56px)**重叠**;且只在「回合移交给别人」时才标记已读(`Board.jsx` 的 effect),
solo/等待场景回合永不移交 → **永不消失**(实测放置数分钟仍常驻)。

## 2. 设计目标与原则(玩家优先)

- **诚实反馈**:每个会改变状态的事件(超时抽牌、回合移交)都要有可感知的反馈;玩家永远知道「刚发生了什么、轮到谁」。
- **主次分明**:最重要/最常用的操作(出牌/摸牌)在视觉上压倒次要操作(排序/撤销)。
- **默认简洁、帮助可选**:对资深玩家不强加「提示」噪音;需要时再开启助手。
- **不改既有规则与服务器权威**:本轮是**呈现层 + 反馈**优化,不改 Rummikub 规则、计分、反作弊、出牌校验。

## 3. 工作项(workstream)

### WS-A 超时反馈(timeout feedback) · 决策 `feedback_only`

- **目标 / 玩家体验:** 计时到点时,玩家清楚地看到「时间到 → 自动抽了 1 张 → 回合移交」,即使 solo 也有存在感。
- **现状:** `forceEndTurn` 抽 1 张 + 结束回合,但无任何 UI 反馈;计时环到 0 也无强调。
- **改动:**
  1. **服务端权威的瞬时标记**(仿 `G.lastPlay`):`forceEndTurn` 触发时写入 `G.lastTimeout = {seat, drew:<bool>, id:<nonce>}`
     (`drew` 取决于是否实际抽牌),在 `onTurnBegin` 清除。**不引入任何客户端信任**——只有 `forceEndTurn`(已被服务端
     deadline 守卫)能写它。
  2. **全员可见公告**:各客户端观察到新的 `G.lastTimeout` 时,弹一条短公告
     `"⏱ Time's up — {name} drew a tile, turn passed"`(本人变体 `"⏱ Time's up — you drew a tile"`);若未抽牌(已成功提交)
     则 `"⏱ Time's up — turn passed"`。短暂自动消失(时长 [PLACEHOLDER])。无 `name` 时回退 `Player {n+1}`。
  3. **最后数秒环脉冲 + 归零**:剩余 < `RING_WARN_S` 秒时计时环脉冲告警;到点先让环可见地走到 0 再移交。
     脉冲/动画受 `prefers-reduced-motion` + mute 门控(沿用现有 juice 门控)。
- **涉及:** `src/rummikub/moves.js`(`forceEndTurn`/`onTurnBegin`)、`Game.js`(setup 初始化 `G.lastTimeout=null`)、
  `Board.jsx` + 新增小组件(公告)、`PlayerAvatar`/计时环组件、`board.css`。
- **输入/输出:** 输入 = 服务端 deadline 到点 + `forceEndTurn`;输出 = `G.lastTimeout` 瞬时态 + 客户端公告/动画。
- **边界与失败态:** 同一回合不重复公告(`id` nonce 去重);快速连续超时只显示最近一条;`playerView` 下公告只用座位+姓名
  (不泄露手牌);`G.lastTimeout` 随 FlatFile 持久化但 `onTurnBegin` 即清,重连不会看到陈旧公告。
- **可调参数:** `RING_WARN_S`(默认 5)[PLACEHOLDER];公告时长 `TIMEOUT_TOAST_MS`(默认 3500)[PLACEHOLDER]。
- **测试:** 纯逻辑——`forceEndTurn` 写 `lastTimeout`、`onTurnBegin` 清除(jest,服务端 reducer);公告组件按 `lastTimeout`
  渲染正确文案(RTL);anti-cheat 不变(deadline 前 `forceEndTurn` 仍 `INVALID_MOVE`)。

### WS-B 「playable」改为可开关助手 · 决策 `toggle`

- **目标 / 玩家体验:** 默认不打扰;想要「能出哪些牌」的帮助时一键开启,且措辞自解释。
- **现状:** 高亮 + 「{n} playable」常驻,措辞含糊。
- **改动:**
  1. 新增 **Hints 开关**(小按钮/复选,文案 `"💡 Hints"`,`aria-pressed`),控制「可出牌高亮 + 计数」整体开/关;
     **默认 OFF**;偏好持久化到 `localStorage`(键 `rummycube:hintsOn`,仿 `coachSeen`)。
  2. 开启时:沿用 `planning.js` 的 `playableTiles` 高亮;计数 pill 改为更直白文案 `"💡 {n} playable"` +
     **首次开启**给一次性 tooltip `"Tiles you can add to a group already on the table."`(英文,应用内文案规范)。
  3. 关闭时:不渲染高亮也不渲染 pill。
- **涉及:** `Board.jsx`(开关状态 + 门控 `playableHint` 与 rack marker)、新增 `HintsToggle`、`board.css`;`planning.js` 不改逻辑。
- **边界与失败态:** 私窗/无 storage → 退化为每局默认 OFF(可接受);开关只影响本地呈现,不发任何 move、不触服务器。
- **可调参数:** 默认态(OFF,已定);tooltip 文案。
- **测试:** 默认不显示高亮/pill;开启后显示;偏好读写 `localStorage`(RTL,沿用 coach-card 测试 harness)。

### WS-C 主操作按钮醒目化 · 决策 `prominent_inline`

- **目标 / 玩家体验:** 一眼看到「这一步该点哪个」。出牌/摸牌主导,排序退居其次。
- **现状:** 所有控件同一 `.rummikub-button`,等权重。
- **改动:**
  1. 新增 `.primary-action` 变体(更大、主/强调色、阴影更强);`Draw` / `Submit meld` / `End`(三者按现有
     `drawOrEnd` 状态切换逻辑**不变**)用主样式,居中、最显眼。
  2. `Sort: runs` / `Sort: colours` 降级为 `.secondary-action`(更小、低饱和),归入次要簇。
  3. 控件区重排为:**主操作簇(居中)** + **次要簇(排序)** + **工具簇(撤销/重做图标,见 WS-D)**;保持 `submit` 的
     ✓/✗ 有效性双通道(色 + 字形)与禁用逻辑不变。
- **涉及:** `Board.jsx`(控件区 JSX 结构)、`board.css`。
- **边界与失败态:** 等待/非你回合/gameover 时禁用态不变;移动端命中区 ≥44px;不破坏键盘可达性。
- **可调参数:** 主按钮配色/尺寸 [PLACEHOLDER]。
- **测试:** 主操作带 `.primary-action`、排序带次要类(RTL 断言 class);现有提交/抽牌行为回归不变。

### WS-D Undo/Redo 图标化并移到角落 · 决策 `icons_corner`

- **目标 / 玩家体验:** 撤销/重做是「修正」类低频操作,不该和主操作抢视觉;图标化 + 移角降低噪音。
- **现状:** 与主操作并排的文字按钮。
- **改动:** 用 `↶` / `↷` 图标按钮替换文字,移到**手牌/牌架区一角**(远离主操作);保留键盘快捷键
  (`useUndoRedoHotkeys`)、禁用条件、与之前完全一致的 `moves.undo/redo`;补 `aria-label="Undo"/"Redo"` + `title`。
- **涉及:** `Board.jsx`、`board.css`。
- **边界与失败态:** 禁用态(无 undo/redo 栈、非你回合、等待、gameover)不变;图标在色盲/高对比下仍可辨(非纯色区分)。
- **可调参数:** 角落位置/图标字形。
- **测试:** 图标按钮有可访问名「Undo」「Redo」;禁用逻辑回归;键盘快捷键仍生效(已有 keyboard-undo-redo 测试)。

### WS-E 首回合提示修复(含文案校正) · 决策 `include_hint_fix`

- **目标 / 玩家体验:** 首回合提示**自己消失**、不遮挡头像/横幅、文案与新的超时反馈一致;不与 CoachCard 叠加成两块。
- **现状:** `.turn-hint` 重叠头像/横幅;仅在回合移交时标记已读 → solo/等待永不消失。
- **改动:**
  1. **自动消失**:提示出现后 `FIRST_TURN_HINT_MS`(默认 6000)[PLACEHOLDER] 计时到点即隐藏并持久化「已读」;保留「回合移交即已读」
     作为兜底(两者先到先生效)。(失败测试已先写:`src/tests/first-turn-hint.test.js`。)
  2. **重定位**:`.turn-hint` 不再与头像/横幅同列堆叠 —— 移到头像右侧(或横幅上方),互不遮挡。
  3. **文案校正**:改为与 WS-A 一致、更准确的措辞,如 `"When the timer runs out you draw a tile and your turn passes."`
  4. **去重(候选,交专家团队定):** 把这条「环」微文案**并入既有 CoachCard**,首回合只出一块卡;若保留分离,则靠
     WS-E.1 的快速自动消失避免长期叠加。
- **涉及:** `Board.jsx`(state/effect)、`board.css`、可能 `CoachCard.jsx`(若合并)。
- **边界与失败态:** 私窗/无 storage → 提示仍按计时消失(本会话内),只是下次再现一次(可接受);只读 `localStorage`,无服务器影响。
- **可调参数:** `FIRST_TURN_HINT_MS`(6000)[PLACEHOLDER];是否合并入 CoachCard(待定)。
- **测试:** 首回合显示 → 推进假计时后消失且写入已读;已读则不再显示;非你回合不显示(`first-turn-hint.test.js`,已起草)。

## 4. 必须保持的不变量

- **服务器权威 / 反作弊不退化:** `forceEndTurn` 的 deadline 守卫、`submitMeld`/`validatePlayerMove`/`forfeitTurn`/抽牌逻辑
  一律不改;`G.lastTimeout` 只能由服务端在 `forceEndTurn` 内写。
- **门控:** 一切动画/脉冲/音效受 `prefers-reduced-motion` + mute 门控(沿用 `juice/gating`)。
- **应用内文案英文**(spec/plan 中文,UI 字符串英文)。
- **playerView 不泄露:** 公告只含座位/姓名,不含手牌内容。
- **既有能力不回归:** 键盘 Undo/Redo、色盲第二通道(✓/✗、提示标记)、移动端命中区/牌架可滚、断线提示、持久化均保持。

## 5. 可调参数汇总([PLACEHOLDER],交专家团队/playtest 定)

| 参数 | 默认 | 说明 |
|---|---|---|
| `RING_WARN_S` | 5 | 计时环开始告警脉冲的剩余秒数 |
| `TIMEOUT_TOAST_MS` | 3500 | 超时公告显示时长 |
| `FIRST_TURN_HINT_MS` | 6000 | 首回合提示自动消失延时 |
| Hints 默认态 | OFF | 可出牌助手默认关闭(已定) |
| 主按钮配色/尺寸 | — | `.primary-action` 视觉规格 |
| 合并 CoachCard | 待定 | 是否把环微文案并入首回合卡 |

## 6. 不在本轮范围

- 不改 Rummikub 规则、计分、joker 取回规则、首出 30 分门槛。
- 不做断线/重连机制本身的改动(WS-12 已上线)。
- 不做 combo 阈值/权重调参(单列 backlog)。
- 不引入新依赖。

## 7. 测试策略

- **纯逻辑 jest**:`forceEndTurn`/`onTurnBegin` 对 `G.lastTimeout` 的写/清;首回合提示 effect(假计时)。
- **RTL(沿用 coach-card harness)**:超时公告文案、Hints 开关默认关/开与持久化、主/次按钮 class、Undo/Redo 图标可访问名与禁用、首回合提示自动消失。
- **手动线上核验(部署后)**:多人真机——超时公告全员可见、环脉冲、主操作醒目、Hints 开关、首回合提示自动消失且不遮挡。
- 全量 jest 必须保持全绿;`npm run build` 通过且产物无 `console.log`;`node src/server.js` 可启动。

## 8. 交付与流程

1. owner 评审本 spec。
2. **专家团队**(游戏设计 / UX / 前端 / 无障碍·a11y / rubber-duck)将 spec 转成 plan:每位出具报告留档于 `docs/optimization/`,
   整合出一份中文 final plan 于 `docs/plan/`。
3. **subagent-driven-development** 逐单元实施(implementer+reviewer,均 opus-4.8;rubber-duck 用 gpt-5.5),每单元 TDD。
4. 整支终审 → 自验(jest/build/server boot)→ Sprint 报告(中文)。
5. 收尾选项(合并/推送/部署)。**注意应用内文案英文、动画门控、服务器权威三条红线。**
