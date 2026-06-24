# RummyCube · 操作清晰度与反馈 UX-pass · Final Plan(整合实现计划)

> **给执行者:** 用 `superpowers:subagent-driven-development` 逐任务实施(每任务一个全新 implementer 走 TDD + 一个 reviewer 双判)。
> 步骤用 `- [ ]` 勾选跟踪。完整技术细节见专家报告 `docs/optimization/2026-06-24-ux-pass-review-1..4-*.md`。

**Goal:** 让 RummyCube 的回合操作「主次分明、反馈诚实、首回合不打扰」——超时给可感知公告、可出牌提示改可开关、Draw/Submit 主按钮化、Undo/Redo 图标移角、首回合提示并入 CoachCard。

**Architecture:** 纯呈现层 + 一处服务器权威瞬时态。唯一服务端改动是 `forceEndTurn` 写、`onTurnBegin` 守卫清一个 `G.lastTimeout` 瞬时态;其余全在 React 组件/CSS。不改 Rummikub 规则/计分/反作弊/出牌校验,无新依赖。

**Tech Stack:** boardgame.io 0.50(server-authoritative)、React 18 + Vite、@dnd-kit、jest + React Testing Library。

## 专家团队与决策(四份报告整合)

- 报告:`review-1-game-design`(超时归因/调参)、`review-2-ux`(文案/交互)、`review-3-ui`(CSS 规格)、`review-4-frontend`(技术骨干/任务拆分)。
- **已解决的分歧(本 plan 拍板):**
  1. **WS-E 采用「并入 CoachCard」**(UX + 游戏设计强烈推荐),而非「分离提示 + 自动消失」。结构上根治「重叠」+「永不消失」两个 bug,
     免去 `firstTurnHintSeen` 状态机与 `FIRST_TURN_HINT_MS`。已据此删除草拟的 `src/tests/first-turn-hint.test.js`。
  2. **超时公告 `timeoutToastText`** 合并两位专家文案:**solo 去掉自相矛盾的「turn passed」**(游戏设计),多人保留(UX),见 T2 文案表。
     瞬时态携带**实际抽牌数 `drawCount`**(首出后超时会抽 **2** 张,`moves.js:38`),文案按 `{n} tile(s)` 复数化,而非写死单数(rubber-duck 复核 #1)。
  6. **GameOver 抑制**(rubber-duck 复核 #2):若超时的自动提交直接结束对局,其后无 `onTurnBegin` 再清 `lastTimeout` → 会在 GameOver 画面残留一条语义错误的「turn passed」。
     故 `TimeoutAnnouncement` 在 `ctx.gameover` 为真时**不显示**(GameOverModal 已接管画面);持久态里残留的 `lastTimeout` 对已结束对局无害(无泄露)。
  3. **可出牌 pill 文案**用 UX 的 `💡 {n} tiles fit the table`(直接消解「playable 没看懂」),开关按状态显示 `💡 Show hints`/`💡 Hints on`。
  4. **WS-A.3 计时环脉冲已存在**(`.timer-low` + `@keyframes timer-low-pulse`,已 `prefers-reduced-motion` 门控,`board.css:1014`),本轮**仅核验**,UI 的红环晕增强为可选。
  5. **公告时长**采 UX 差异化:本人 4500ms、旁观 3000ms([PLACEHOLDER])。

## Global Constraints(红线,逐条 verbatim,每个任务都隐含适用)

- 应用内 UI 字符串**一律英文**(本 plan 与报告中文)。
- 一切动画/脉冲/音效受 `prefers-reduced-motion` + mute 门控;**文本本身永远渲染**(a11y),只有动画进 `@media (prefers-reduced-motion: no-preference)`。`jsdom` 未 mock `matchMedia` → 新动画判定必须带 `window.matchMedia &&` 守卫。
- 服务器权威/反作弊不退化:`G.lastTimeout` **只**在 `forceEndTurn` 的 deadline 守卫**之后**写;`forfeitTurn`、客户端都不写;deadline 前 `forceEndTurn` 仍 `INVALID_MOVE` 且不写瞬时态。
- `playerView` 不泄露:公告载荷仅 `{seat,drew,id}`,取名走公共 `matchData`。
- 不引入新依赖;保留键盘 Undo/Redo、色盲第二通道(✓/✗、`↶/↷` 字形)、移动端命中区 ≥44px、断线/同步 pill、各 `localStorage` 持久化键。
- `node src/server.js` 必须仍可启动(服务端路径保持显式 `.js` 扩展名;新组件只经 Vite 进 `Board.jsx`)。
- 构建产物无 `console.log`(`moves.js` 现有 `console.log` 属既有代码,新增代码勿再加)。
- `timePerTurn` 是**毫秒**(`Game.js:36` 存 `*1000`);Client 驱动测试勿重复 `*1000`。

## File Structure(创建/修改)

**新建:**
- `src/rummikub/timeoutToastText.js` — 纯函数,超时公告文案(仿 `submitReasonText.js`)。
- `src/rummikub/components/TimeoutAnnouncement.jsx` — 顶部居中超时 toast(自管去重 + 自动消失)。
- `src/rummikub/components/HintsToggle.jsx` — `💡` 可出牌提示开关(状态/持久化在 Board)。
- `src/rummikub/components/IconButton.jsx` — 通用图标按钮(Undo/Redo 复用)。
- 对应测试:`src/tests/timeout-toast-text.test.js`、`timeout-announcement.test.js`、`hints-toggle.test.js`、`icon-button.test.js`、`first-timeout-reducer.test.js`(或扩 `force-end-turn.test.js`)。

**修改:**
- `src/rummikub/moves.js` — `forceEndTurn`(写 `lastTimeout`)、`onTurnBegin`(守卫清除)。
- `src/rummikub/Game.js` — `setup` init `lastTimeout:null`。
- `src/rummikub/components/Board.jsx` — 接线四组件 + Hints 状态/门控 + 主/次按钮 class + 移除 `.turn-hint`/`firstTurnHintSeen`(WS-E 并入 CoachCard)。**串行热点**。
- `src/rummikub/components/board.css` — `.timeout-toast`/`.top-cue-stack`、`.primary-action`/`.secondary-action`/`.controls-wrapper` 栅格、`.icon-button`/`.rack-tools`、删 `.turn-hint`(+可选 `.timer-low` 红环晕)。**串行热点**。
- `src/rummikub/components/CoachCard.jsx` — 增一行校正微文案。
- `src/tests/coach-card.test.js`、`player-view.test.js`、`force-end-turn.test.js` — 扩断言。

## 可调参数([PLACEHOLDER],playtest 可调)

| 参数 | 默认 | min | max | 说明 |
|---|---|---|---|---|
| `RING_WARN_S` | 5 | 3 | 8 | =已上线 `LOW_TIME_MS/1000`;最后告警秒数(零回归) |
| `TIMEOUT_TOAST_MS`(self) | 4500 | 2500 | 5000 | 本人需读懂自身后果 |
| `TIMEOUT_TOAST_MS`(other) | 3000 | 2500 | 5000 | 旁观一瞥 |
| Hints 默认态 | OFF | — | — | 已定 |
| 环比例护栏 `RING_CAP` | 0.25 | — | — | **可选/future**:短回合按 25% 提前告警(本轮不强制) |
| 重复超时升级 | 不做 | — | — | future,改规则需 toggle 默认 OFF |

---

## Task T1 — `G.lastTimeout` 服务端瞬时态(骨干,无 Board 改动)

**Files:** Modify `src/rummikub/moves.js`(`forceEndTurn` ~145、`onTurnBegin` ~420)、`src/rummikub/Game.js`(`setup` ~46)。Test `src/tests/force-end-turn.test.js`(扩)、`src/tests/player-view.test.js`(扩)。

**Interfaces — Produces:** `G.lastTimeout: {seat:number, drawCount:number, id:number} | null`。`seat=Number(ctx.currentPlayer)`;`drawCount=` 本次实际抽到的张数(牌堆长度差,首出后超时为 2,牌堆空为 0,合法提交为 0);`id=ctx.turn`。

**关键代码(写入,deadline 守卫之后):**
```js
const player = ctx.currentPlayer
const poolBefore = G.tilesPool.length
if (isBoardHasNewTiles(G)) { validatePlayerMove(G, ctx, player, events) }
else { drawTile({G, ctx, playerID: player, events}, !isBoardValid(G)) }
G.lastTimeout = { seat: Number(player), drawCount: poolBefore - G.tilesPool.length, id: ctx.turn }
```
**关键代码(`onTurnBegin` 末尾,陈旧守卫清除 —— 不可省):**
```js
// 超时自身 endTurn 触发的 begin 与写入同一次更新(此时 id === ctx.turn-1),
// 无条件清会在任何客户端看到前抹掉它(已实测)。过一整回合再清。
if (G.lastTimeout && typeof G.lastTimeout.id === 'number' && G.lastTimeout.id <= ctx.turn - 2) {
    G.lastTimeout = null
}
```
**`Game.js` setup:** 紧挨 `lastPlay: null,` 加 `lastTimeout: null,`。

- [ ] **Step 1 失败测试:** 在 `force-end-turn.test.js` 加:过期 deadline 下非当前玩家 `forceEndTurn` 后,对端读 `G.lastTimeout` = `{seat, drawCount:1, id}`(干净盘、首出前);**`firstMoveDone[seat]=true` 干净盘超时 → `drawCount:2`**;摆一组合法暂存牌 → `drawCount:0`(提交不抽);再驱动一整回合 → `lastTimeout===null`,但**超时那回合内**非空;deadline 前 `forceEndTurn` → `INVALID_MOVE` 且 `lastTimeout` 仍 `null`。在 `player-view.test.js` 断言 `view.lastTimeout` 深拷贝存在且无 tile/手牌字段。
- [ ] **Step 2 跑测试确认失败**(`npx jest force-end-turn player-view`)。
- [ ] **Step 3 实现**:上面三段改动。
- [ ] **Step 4 跑测试确认通过**;并 `node src/server.js` 起服 + `/games` 验证可启动。
- [ ] **Step 5 提交** `feat(turn): record a server-authoritative G.lastTimeout transient on timeout`。

**Acceptance:** reducer 测试全绿;anti-cheat 不变;`playerView` 透传不泄露;服务器可启动。

---

## Task T2 — `timeoutToastText` 纯函数

**Files:** Create `src/rummikub/timeoutToastText.js`、`src/tests/timeout-toast-text.test.js`。可与 T1 并行(不碰 Board)。

**Interface — Produces:** `timeoutToastText(lastTimeout:{seat,drawCount}, playerID, matchData) => string`。「本人」= `String(seat)===String(playerID)`;solo = `matchData.length===1`;无 name 回退 `Player {seat+1}`;复数 `{s} = drawCount === 1 ? '' : 's'`。

**文案表(全英文,`{n}=drawCount`):**
| 条件 | 文案 |
|---|---|
| solo & `drawCount>=1` | `⏱ Time's up — you auto-drew {n} tile{s} (+{n} to your rack).` |
| solo & `drawCount===0` | `⏱ Time's up.` |
| 多人·本人·`drawCount>=1` | `⏱ Time's up — you drew {n} tile{s}, turn passed.` |
| 多人·本人·`drawCount===0` | `⏱ Time's up — turn passed.` |
| 多人·他人·`drawCount>=1` | `⏱ Time's up — {name} drew {n} tile{s}, turn passed.` |
| 多人·他人·`drawCount===0` | `⏱ Time's up — {name}'s turn passed.` |

- [ ] **Step 1 失败测试**:六分支 + 复数(`drawCount` 1 vs 2 → `tile` vs `tiles`)+ name 回退(纯 jest,仿 `submit-reason-text.test.js`)。
- [ ] **Step 2 跑测试确认失败**。
- [ ] **Step 3 实现** 纯函数。
- [ ] **Step 4 跑测试确认通过**。
- [ ] **Step 5 提交** `feat(turn): timeoutToastText copy helper`。

---

## Task T3 — `TimeoutAnnouncement` 组件 + 接线 + CSS

**Files:** Create `src/rummikub/components/TimeoutAnnouncement.jsx`、`src/tests/timeout-announcement.test.js`;Modify `Board.jsx`(接线,与 `connectionCue` 同区 ~590)、`board.css`(`.timeout-toast` + `.top-cue-stack`)。**依赖 T1(形状)+ T2(文案)。**

**Interface — Consumes:** `G.lastTimeout`(T1)、`timeoutToastText`(T2)。
**Props:** `{lastTimeout, playerID, matchData, durationMs?}`。内部 `seenTimeoutIdRef`(init=`lastTimeout?.id`,忽略 mount 值)+ `useEffect`(键 `lastTimeout?.id`)→ 设文案 + `setVisible(true)` + `setTimeout(hide, durationMs)`;卸载清定时器。Board 传 `durationMs = isSelf ? 4500 : 3000`。**GameOver 抑制(rubber-duck #2):** Board 仅在 `!ctx.gameover` 时渲染 `<TimeoutAnnouncement>`(或 gameover 时传 `lastTimeout={null}`),避免结束画面残留错误公告。

**渲染:** `<div className="timeout-toast" role="status" aria-live={isSelf?'assertive':'polite'}>{text}</div>`(可见时)。滑入/淡出进 `@media (prefers-reduced-motion: no-preference)`;reduced-motion 下文本仍立即可读。**CSS:** 顶部居中琥珀(对比 ≥AA),收进 `.top-cue-stack` 与 `connection-cue` 纵向排开、互不重叠;绝对定位、不挡牌、不拦输入(`pointer-events:none`)。详见 review-3-ui。

- [ ] **Step 1 失败测试**(RTL):`lastTimeout=null` 无 toast;rerender 新 `{…id}` → 文案匹配;`advanceTimersByTime(durationMs)` → 消失;**同 id** rerender 不再弹;**新 id** 再弹一次;**`ctx.gameover` 为真时不渲染 toast**。
- [ ] **Step 2 跑测试确认失败**。
- [ ] **Step 3 实现** 组件 + CSS + Board 接线。
- [ ] **Step 4 跑测试确认通过**(+ 全量 jest 不回归)。
- [ ] **Step 5 提交** `feat(turn): all-visible timeout announcement`。

---

## Task T4 — Hints 开关(WS-B)

**Files:** Create `src/rummikub/components/HintsToggle.jsx`、`src/tests/hints-toggle.test.js`;Modify `Board.jsx`(状态/持久化/门控)、`board.css`。`planning.js` 不动。

**Board 状态(仿 `coachSeen`,默认 OFF):** 键 `rummycube:hintsOn`;`toggleHints` 写 localStorage。
**门控:**
```js
const playableTileList = hintsOn && playerID != null ? Array.from(playableTiles(myHandTiles, extractSeqs(G))) : [];
const playableHint = hintsOn ? (
  <div className="playable-hint" role="status" aria-live="polite">
    {playableCount > 0 ? `💡 ${playableCount} tiles fit the table` : '💡 No tiles fit the table yet'}
  </div>) : null;
```
**Toggle:** `<button className="hints-toggle" aria-pressed={on} title="Toggle playable-tile hints">{on ? '💡 Hints on' : '💡 Show hints'}</button>`,收进工具簇。首次开启一次性 tooltip(键 `rummycube:hintsTipSeen`,非阻塞):`These highlight tiles you can add to a group already on the table. You still need your 30-point opening meld first.`(发现性:CoachCard 一行引路,见 T7)。

- [ ] **Step 1 失败测试**(RTL,仿 coach-card harness):无 flag → 无 `.playable-hint`、无 `.tile-playable` marker;点 `💡 Show hints`(`aria-pressed` false→true)→ 出现 marker + pill 且 `localStorage['rummycube:hintsOn']==='1'`;带 flag 重挂默认开。
- [ ] **Step 2 跑测试确认失败**。
- [ ] **Step 3 实现**。
- [ ] **Step 4 跑测试确认通过**。
- [ ] **Step 5 提交** `feat(assist): make playable-tile hints an opt-in toggle`。

---

## Task T5 — 主/次按钮重排(WS-C)

**Files:** Modify `Board.jsx`(button className,~390/407/381/616-627)、`board.css`。**Board 串行热点。**

**改动:** `Submit meld` → `'rummikub-button primary-action' + endStateClass`(**保留** ✓/✗ 双通道);`Draw`/`End` → `'rummikub-button primary-action'`(`drawOrEnd` 切换逻辑不动);`Sort: runs`/`Sort: colours` → `'rummikub-button secondary-action'`。新 CSS:`.primary-action`(brass 渐变 ~`#cda24b`、~52px 高、强 3D 阴影 + 暖光晕、深墨字 ≥AA)、`.secondary-action`(扁平哑光羊皮纸、~44px、小字);`.controls-wrapper` 改栅格让主操作居中、次要分组。移动端命中区 ≥44px。精确 CSS 见 review-3-ui §1。

- [ ] **Step 1 失败测试**(RTL):我方回合 `Draw`/`Submit`/`End` 带 `.primary-action`;`Sort:*` 带 `.secondary-action`;Submit 仍随有效性切 `end-valid`/`end-invalid` + ✓/✗;提交/抽牌行为回归不变。
- [ ] **Step 2 跑测试确认失败**。
- [ ] **Step 3 实现**。
- [ ] **Step 4 跑测试确认通过**。
- [ ] **Step 5 提交** `feat(ui): promote Draw/Submit to primary actions, demote Sort`。

---

## Task T6 — Undo/Redo 图标化移角(WS-D)

**Files:** Create `src/rummikub/components/IconButton.jsx`、`src/tests/icon-button.test.js`;Modify `Board.jsx`(替换 `undoBut`/`redoBut` ~415-429)、`board.css`(`.icon-button` + `.rack-tools`)。**Board 串行热点。**

**Interface:** `IconButton({glyph, label, onClick, disabled})` → `<button className="icon-button" aria-label={label} title={label} disabled={disabled}><span aria-hidden>{glyph}</span></button>`。Board:`<IconButton glyph="↶" label="Undo" disabled={!canUndo} onClick={()=>moves.undo()}/>` + `↷ Redo`。**复用已算好的 `canUndo`/`canRedo`**(与键盘快捷键同源)。放进新 `.rack-tools`(绝对定位、牌架右上角、镜像左上头像、远离主操作)。`.icon-button` 44×44、双环焦点、禁用/hover 态;字形 `↶/↷` 作色盲通道。

- [ ] **Step 1 失败测试**(RTL):存在可访问名 `Undo`/`Redo`;空栈/非我方回合/等待/gameover 时 `disabled`;`keyboard-undo-redo.test.js` 保持全绿。
- [ ] **Step 2 跑测试确认失败**。
- [ ] **Step 3 实现**。
- [ ] **Step 4 跑测试确认通过**。
- [ ] **Step 5 提交** `feat(ui): undo/redo as corner icon buttons`。

---

## Task T7 — 首回合提示并入 CoachCard(WS-E)

**Files:** Modify `Board.jsx`(**移除** `firstTurnHintSeen` state/effect ~38-59、`showFirstTurnHint` ~514、`.turn-hint` 渲染 ~546-550、`FIRST_TURN_HINT_KEY`)、`board.css`(**删** `.turn-hint` ~461-476)、`CoachCard.jsx`(增一行)、`src/tests/coach-card.test.js`(扩断言)。**Board 串行热点。**

**改动:** CoachCard 正文增一行校正微文案 `When the ring runs out, you draw a tile and your turn passes.`(与 T2 toast 同词汇,solo/多人皆成立),并加引路句 `Stuck? Turn on 💡 Hints below.`(对接 T4 默认 OFF 的发现性)。首回合只出 CoachCard 一块卡 → **结构上消灭**「`.turn-hint` 重叠头像/横幅」+「solo 永不消失」两个 bug。

- [ ] **Step 1 失败测试**:扩 `coach-card.test.js`——首回合 CoachCard 含 `/ring runs out/i` 与 `/turn on .*hints/i`;确认 `Board` 不再渲染 `.turn-hint`(`container.querySelector('.turn-hint')` 为 null)。
- [ ] **Step 2 跑测试确认失败**。
- [ ] **Step 3 实现** 移除 `.turn-hint` 全套 + CoachCard 增行。
- [ ] **Step 4 跑测试确认通过**(coach-card 全绿;无 `.turn-hint` 残留)。
- [ ] **Step 5 提交** `feat(onboarding): fold the ring microcopy into the first-turn CoachCard`。

---

## 执行说明

- **Board.jsx / board.css 是 T3–T7 的串行热点**:叶子组件(`TimeoutAnnouncement`/`HintsToggle`/`IconButton`/`timeoutToastText`)与 T1 可并行写;Board/CSS 的接线按 **T1,T2 → T3 → T4 → T5 → T6 → T7** 串行,避免合并冲突。
- 每任务结束跑相关 jest;全部完成后整支终审 + 全量 `npx jest` + `npm run build`(产物无 `console.log`)+ `node src/server.js` 启动核验。
- WS-A.3 计时环脉冲**已存在**(`.timer-low`,已门控),仅核验;UI 红环晕增强为可选(若做,进 `@media (prefers-reduced-motion: no-preference)`)。

## Self-Review(spec 覆盖核对)

- WS-A 超时反馈 → T1(瞬时态)+T2(文案)+T3(公告);环脉冲已存在(核验)。✅
- WS-B playable 改可开关 → T4。✅
- WS-C Draw/Submit 主按钮 → T5。✅
- WS-D Undo/Redo 图标移角 → T6。✅
- WS-E 首回合提示修复 → T7(并入 CoachCard,根治 overlap + 永不消失)。✅
- 不变量(服务器权威/playerView/门控/英文/无新依赖/可启动/timePerTurn 毫秒)→ Global Constraints + 各任务 acceptance。✅
- 类型一致性:`G.lastTimeout {seat:number,drawCount:number,id:number}` 在 T1 写、T2/T3 读,签名一致。✅
- rubber-duck(gpt-5.5)复核:#1 `drawCount` 计数化(首出后超时抽 2 张)、#2 `ctx.gameover` 抑制公告——均已并入 T1/T2/T3。✅
- 占位扫描:无 TODO/TBD;所有文案、class、参数均给定值。✅
