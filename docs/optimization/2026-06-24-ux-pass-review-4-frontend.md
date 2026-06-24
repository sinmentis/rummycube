# RummyCube · 操作清晰度与反馈 UX-pass · 前端实现评审(report #4 / frontend)

**日期:** 2026-06-24 · **作者:** 前端工程(专家团队成员) · **输入 spec:** `docs/optimization/2026-06-24-ux-pass-spec.md`
**定位:** 本报告是 final plan 的**技术骨干**。聚焦文件、函数签名、组件 prop、测试落点。所有结论均对照真实代码核实,
关键的一处框架时序结论(WS-A 的 `onTurnBegin` 清除)经**实测验证**(见 §1.3)。

> **应用内字符串一律英文;本报告中文。** 不改 Rummikub 规则/计分/反作弊/出牌校验;不引入新依赖。

---

## 0. 关键结论(TL;DR)

1. **WS-A 最大坑(已实测):** spec 写「`forceEndTurn` 写 `G.lastTimeout`,在 `onTurnBegin` 清除」。但
   `forceEndTurn` 内部经 `drawTile`/`applyValidMove` 调了 `events.endTurn()`,boardgame.io 会在**同一次状态更新**里
   接着跑 `onTurnEnd → onTurnBegin`。若 `onTurnBegin` **无条件**清 `G.lastTimeout`,瞬时态在任何客户端看到之前就被抹掉。
   **实测证实**(§1.3):naive 清除 → 两个客户端读到的都是 `null`。**修正方案:**`onTurnBegin` 用**陈旧守卫**清除
   (`G.lastTimeout.id <= ctx.turn - 2`),保证瞬时态在「超时后那一回合」全程可见,再于其后的回合开始时清掉。
2. **`playerView` 不需要改。** 它是 `cloneDeep(G)`(`util.js:578`),`G.lastTimeout` 自动透传;其载荷 `{seat,drew,id}`
   不含任何手牌/牌堆内容,天然不泄露。补一条 `player-view.test.js` 断言即可。
3. **WS-A.3 计时环脉冲基本已存在。** `PlayerAvatar.jsx` 的 `LOW_TIME_MS=5000` + `.timer-ring.timer-low`,且
   `@keyframes timer-low-pulse` 已置于 `@media (prefers-reduced-motion: no-preference)`(`board.css:1014`)。
   `RING_WARN_S(默认5) ⇔ LOW_TIME_MS/1000`。本轮 WS-A.3 几乎零新增,只需核验。
4. **WS-E 草拟测试与 spec 改文案冲突:** `src/tests/first-turn-hint.test.js` 的 `HINT_RE = /ring runs out/i`,
   而 spec WS-E.3 要改成 `"When the timer runs out you draw a tile and your turn passes."`(无 "ring")。
   **二选一(交 final plan 定):** 保留 "ring" 字样,或在采用新文案时同步把 `HINT_RE` 改为 `/timer runs out/i`。
   行为断言(自动消失 + 持久化「已读」)才是契约,文案正则是表层。
5. **服务器引导面安全:** 新组件(`TimeoutAnnouncement`/`HintsToggle`/`IconButton`)只被 `Board.jsx` 经 Vite 引入,
   **不在** `server.js → Game.js → moves.js` 这条 native-ESM 路径上,不影响 `node src/server.js`。唯一服务端改动在
   `moves.js`/`Game.js`,且复用已 import 的符号(`getSecTs`、`ctx.turn`),无新 import,扩展名规范不破。

---

## 1. `G.lastTimeout` 瞬时态(WS-A 服务端权威)

### 1.1 形状

```ts
G.lastTimeout: { seat: number, drew: boolean, id: number } | null
```

- `seat`:超时玩家座位号。**注意 `ctx.currentPlayer` 是字符串**('0'/'1'),为满足 `number` 形状用 `Number(player)`。
  (现有 `G.lastPlay.seat` 存的是字符串 `player`,见 `moves.js:263` / `last-play.test.js:41`;此处刻意规整为 number,
  消费端 `matchData[seat]` 与 number 索引兼容,「是不是我」用 `String(seat) === String(playerID)`。)
- `drew`:本次超时是否**真的从牌堆抽到牌**。用**牌堆长度差**判定,天然覆盖「牌堆已空」边界(此时 `drew=false`)。
- `id`:去重/陈旧 nonce。取 `ctx.turn`(单调递增、确定性、可复现,优于 `Date.now()`,且能同时充当 `onTurnBegin` 的陈旧守卫键)。

### 1.2 写入点 —— **只在** `forceEndTurn`(`moves.js:145`)

在 deadline 守卫**之后**、分支**之后**写,确保 deadline 前的 `INVALID_MOVE` 会让 immer 草稿被丢弃、不写入:

```js
function forceEndTurn({G, ctx, events}) {
    if (!G.timerExpireAt || getSecTs() < G.timerExpireAt) {
        return INVALID_MOVE          // anti-cheat 守卫保持原样:此路径绝不写 lastTimeout
    }
    const player = ctx.currentPlayer
    const poolBefore = G.tilesPool.length                 // ← 新增
    if (isBoardHasNewTiles(G)) {
        validatePlayerMove(G, ctx, player, events)        // 有暂存:合法→applyValidMove(不抽);非法→drawTile(抽)
    } else {
        drawTile({G, ctx, playerID: player, events}, !isBoardValid(G))  // 干净盘:抽 1(或 2,见下)
    }
    // ← 新增:服务端权威瞬时态。drew 以牌堆是否真的减少为准。
    G.lastTimeout = {
        seat: Number(player),
        drew: G.tilesPool.length < poolBefore,
        id: ctx.turn,
    }
}
```

- **「drew vs 已提交」如何区分:** 不复制校验逻辑,直接用 `poolBefore > poolAfter`。合法提交走 `applyValidMove`
  (不动牌堆)→ `drew=false`;非法/干净盘走 `drawTile`(pop 牌堆)→ `drew=true`;牌堆空 → `drew=false`。
- **`forfeitTurn` 不写。** 那是玩家主动「弃回合」(`moves.js:162`),非超时,公告只服务于超时语义。保持原样。
- **小注:** `drawTile` 在 `firstMoveDone` 时会抽 2 张(`moves.js:38`)。`drew` 仍正确(长度差>0)。公告文案固定为
  "drew a tile"(单数),与 spec 一致,可接受。

### 1.3 清除点 —— `onTurnBegin`(`moves.js:420`),**必须带陈旧守卫**

**实测验证**(用最小 boardgame.io game 复现「move 内 set + onBegin clear」三种策略):

| 策略 | 超时后 `c1` 读到的 `lastTimeout` | 一整回合后 `c0` 读到 |
|---|---|---|
| `onBegin` **无条件**清 | `null` ❌(任何客户端都看不到) | `null` |
| 永不清(仿 `lastPlay`) | `{seat:0,drew:true,id:1}` ✅ | `{…id:1}`(常驻直到下次覆盖) |
| `onBegin` 守卫清 `id<=turn-2` | `{seat:0,drew:true,id:1}` ✅ | `null` ✅(过一回合即清) |

原因:`forceEndTurn` 触发的 `endTurn` 使**紧接着**的 `onTurnBegin` 与本 move 处于同一次更新。该 begin 时 `ctx.turn === id+1`,
守卫 `id <= ctx.turn-2` 为假 → **不清**(瞬时态在「超时后那回合」全程可见);再下一个 begin `ctx.turn === id+2` → 清。

在 `onTurnBegin` 末尾 `return G` 前加:

```js
// 新增:超时瞬时态过一整回合后清除,使重连不再看到陈旧公告。
// 守卫不可省:超时自身 endTurn 触发的 begin 与写入同一次更新(此时 id === ctx.turn-1),
// 无条件清会在任何客户端观察到之前抹掉它(已实测)。
if (G.lastTimeout && typeof G.lastTimeout.id === 'number' && G.lastTimeout.id <= ctx.turn - 2) {
    G.lastTimeout = null
}
```

> **备选(若 final plan 想更省):** 完全照搬 `lastPlay`——**不清**,纯靠客户端 mount-seen-ref 去重(§1.5)。
> 这同样安全(重连时 mount 值被记为「已读」不弹),但 `G.lastTimeout` 会在 FlatFile 里常驻到下次覆盖。
> 鉴于 task 明确要求「`onTurnBegin` 清除」,**首选守卫清除**。

### 1.4 Game.js setup 初始化(`Game.js:35-52`)

在 `setup` 返回对象里(紧挨 `lastPlay: null,`,`Game.js:46`)加:

```js
lastTimeout: null,
```

### 1.5 `playerView` 透传 + 客户端去重(「只弹一次」)

- **透传:** `playerView`(`util.js:573`)首行 `const view = cloneDeep(G)` 已携带 `lastTimeout`,**无需改动**。
  载荷只有座位/布尔/回合号 → 不泄露手牌。公告取名走 `matchData[seat].name`(公共数据)。
- **去重:** 仿 `Board.jsx:133-159` 的 `seenPlayRef` 模式,按 `id` 去重并忽略 mount/重连时已存在的值:

```js
const seenTimeoutIdRef = useRef(undefined);
useEffect(() => {
  const id = lastTimeout ? lastTimeout.id : null;
  if (seenTimeoutIdRef.current === undefined) { seenTimeoutIdRef.current = id; return; } // 忽略 mount/重连既有值
  if (id === null || id === seenTimeoutIdRef.current) return;
  seenTimeoutIdRef.current = id;
  show(timeoutToastText(lastTimeout, playerID, matchData));   // 弹一次 + 起 TIMEOUT_TOAST_MS 自动消失定时器
}, [lastTimeout ? lastTimeout.id : null]);
```

「快速连续超时只显示最近一条」:每条新 `id` 覆盖文案并重置定时器,自然只剩最新一条。

---

## 2. 组件拆分(小而专、prop 清晰)

> 红线复用:动画/音效门控沿用 `juice/effects.js` 的 `reduced()`(已 `window.matchMedia && …` 守卫)与 `@media
> (prefers-reduced-motion: no-preference)`;**文本本身永远渲染**(a11y),只有动画进媒体查询。`jsdom` **未** mock
> `matchMedia`,任何新动画判定必须带 `window.matchMedia &&` 守卫,否则 RTL 抛错。

### 2.1 `timeoutToastText`(纯函数,仿 `submitReasonText.js`)

`src/rummikub/timeoutToastText.js`

```ts
export function timeoutToastText(
  lastTimeout: {seat:number, drew:boolean},
  playerID: string | null,
  matchData: Array<{id:number, name?:string}>
): string
```

文案(全英文,直接取自 spec WS-A.2):

| 条件 | 文案 |
|---|---|
| `drew && 本人` | `⏱ Time's up — you drew a tile` |
| `drew && 他人` | `⏱ Time's up — {name} drew a tile, turn passed` |
| `!drew`(已成功提交/牌堆空) | `⏱ Time's up — turn passed` |
| 无 `name` 回退 | `Player {seat + 1}` |

「本人」判定:`String(lastTimeout.seat) === String(playerID)`。**纯 jest 单测**,无需 DOM。

### 2.2 `TimeoutAnnouncement`(展示 + 自管去重/自动消失)

`src/rummikub/components/TimeoutAnnouncement.jsx`

```ts
interface TimeoutAnnouncementProps {
  lastTimeout: {seat:number, drew:boolean, id:number} | null;
  playerID: string | null;
  matchData: Array<{id:number, name?:string}>;
  durationMs?: number;   // 默认 TIMEOUT_TOAST_MS = 3500
}
```

- 内部持 `seenTimeoutIdRef`(init = `lastTimeout?.id`,忽略 mount 值)+ `useEffect`(键 `lastTimeout?.id`)→ set 文案 +
  `setVisible(true)` + `setTimeout(hide, durationMs)`;卸载清定时器。
- 渲染:`<div className="timeout-toast" role="status" aria-live="polite">{text}</div>`(可见时)。滑入/淡出动画进
  `@media (prefers-reduced-motion: no-preference)`;文本在 reduced-motion 下仍立即可读。
- Board 接线:`{<TimeoutAnnouncement lastTimeout={G.lastTimeout} playerID={playerID} matchData={matchData}/>}`,
  放在 `.board-kick-layer` 内(`Board.jsx:590` 一带),与 `connectionCue` 同区,绝对定位、不挡牌、不拦输入。

### 2.3 `HintsToggle`(WS-B 开关;状态/持久化留在 Board)

`src/rummikub/components/HintsToggle.jsx`

```ts
interface HintsToggleProps {
  on: boolean;
  onToggle: () => void;   // 切换 + 写 localStorage
}
// <button type="button" className="hints-toggle" aria-pressed={on} title="Toggle playable-tile hints">💡 Hints</button>
```

Board 侧(仿 `coachSeen` 的 `Board.jsx:65-78`):

```js
const HINTS_KEY = 'rummycube:hintsOn';
const [hintsOn, setHintsOn] = useState(() => {
  try { return typeof localStorage !== 'undefined' && localStorage.getItem(HINTS_KEY) === '1'; } catch { return false; }
}); // 默认 OFF
const toggleHints = useCallback(() => setHintsOn(v => {
  const nv = !v; try { localStorage.setItem(HINTS_KEY, nv ? '1' : '0'); } catch {}; return nv;
}), []);
```

门控(`planning.js` 逻辑不动):

```js
const playableTileList = hintsOn && playerID != null ? Array.from(playableTiles(myHandTiles, extractSeqs(G))) : [];
// handGrid 的 playableTiles={playableTileList}(Board.jsx:472)随之为空 → 关时无 rack marker
const playableHint = hintsOn && playableCount > 0 ? (/* pill */) : null;  // Board.jsx:531
```

pill 文案改为 `💡 {n} playable`(`Board.jsx:534`)。首次开启给一次性 tooltip
`"Tiles you can add to a group already on the table."`(可选,持久化键 `rummycube:hintsTipSeen`),非阻塞。

### 2.4 `IconButton` + Undo/Redo(WS-D)

`src/rummikub/components/IconButton.jsx`(通用)

```ts
interface IconButtonProps {
  glyph: string;       // '↶' / '↷'
  label: string;       // 'Undo' / 'Redo' —— 同时作 aria-label 与 title
  onClick: () => void;
  disabled: boolean;
}
// <button type="button" className="icon-button" aria-label={label} title={label} disabled={disabled} onClick={onClick}>
//   <span aria-hidden="true">{glyph}</span></button>
```

替换 `undoBut`/`redoBut`(`Board.jsx:415-429`),**复用已算好的 `canUndo`/`canRedo`**(`Board.jsx:374-375`,与键盘快捷键同源):

```js
<IconButton glyph="↶" label="Undo" disabled={!canUndo} onClick={() => moves.undo()} />
<IconButton glyph="↷" label="Redo" disabled={!canRedo} onClick={() => moves.redo()} />
```

放进 `.hand-buttons` 的角落工具簇(新 `.rack-tools`,绝对定位、远离主操作)。键盘 `useUndoRedoHotkeys`(`Board.jsx:378`)、
`moves.undo/redo`、禁用条件完全不变。**用字形 `↶/↷` 区分**(非纯色),色盲/高对比可辨;Unicode 字形零依赖(FontAwesome
虽已在依赖里,但 glyph 更轻)。

### 2.5 `.primary-action` 重排(WS-C;无新组件,改 className + CSS)

- `Submit meld`:`'rummikub-button primary-action' + endStateClass`(**保留** `end-valid`/`end-invalid` 与 `endStateGlyph`
  的 ✓/✗ 双通道,`Board.jsx:341-344,390-396`)。
- `Draw` / `End`:`'rummikub-button primary-action'`(`drawOrEnd` 切换逻辑 `Board.jsx:566-573` 不动)。
- `Sort: runs` / `Sort: colours`:`'rummikub-button secondary-action'`(`Board.jsx:616-627`)。
- 新 CSS `.primary-action`(更大、主/强调色、强阴影)、`.secondary-action`(更小、低饱和);移动端块(`board.css:855`)
  确保命中区 ≥44px。

### 2.6 首回合提示修复(WS-E)

Board 内既有:`firstTurnHintSeen` state(`Board.jsx:38-45`)、handoff effect(`:47-59`)、`showFirstTurnHint`(`:514`)、
渲染(`:546-550`)。**新增自动消失 effect**(保留 handoff 作兜底,先到先生效):

```js
const FIRST_TURN_HINT_MS = 6000;
const hintTimerRef = useRef(null);
useEffect(() => {
  if (!showFirstTurnHint) return;
  hintTimerRef.current = setTimeout(() => {
    setFirstTurnHintSeen(true);
    try { localStorage.setItem(FIRST_TURN_HINT_KEY, '1'); } catch {}
  }, FIRST_TURN_HINT_MS);
  return () => clearTimeout(hintTimerRef.current);
}, [showFirstTurnHint]);
```

- **重定位:** `.turn-hint`(`board.css:462`)目前 `left:6px; bottom:calc(100%+30px)`,与 `.rack-self`(+2px)、
  `.turn-banner`(+56px)同列堆叠重叠。挪出该列(移到头像右侧或横幅上方,`left:auto`/独立锚点),互不遮挡。
- **文案:** 采用与 WS-A 一致的 `"When the timer runs out you draw a tile and your turn passes."`
  → **同步更新** `first-turn-hint.test.js` 的 `HINT_RE`(见 §0.4 冲突)。

---

## 3. 测试计划

> 复用 harness:**reducer 级**仿 `force-end-turn.test.js` / `last-play.test.js`(`Client` + `Local()`,跨客户端读 `G`);
> **RTL** 仿 `coach-card.test.js` / `first-turn-hint.test.js`(直挂 `Board`,mock `GridContainer`/`sfx`/`effects`/`ChatPanel`)
> 或仿 `playable-marker.test.js` 直挂叶子组件。

### 3.1 纯 jest(reducer / 纯函数)

| 测试 | 断言 | 模板 |
|---|---|---|
| `force-end-turn` 写 `lastTimeout`(干净盘) | 过期 deadline 下非当前玩家 `forceEndTurn` 后,**对端**读到 `G.lastTimeout={seat, drew:true, id}` | `force-end-turn.test.js` |
| `force-end-turn` 写 `lastTimeout`(合法暂存) | 暂存合法组 → `drew:false`(提交不抽) | `last-play.test.js` 摆盘 + 过期 deadline |
| `onTurnBegin` 陈旧守卫清除 | 再推进一整回合后 `G.lastTimeout === null`;但**超时那回合内**仍非空 | 驱动两回合 |
| anti-cheat 回归 | deadline 前 `forceEndTurn` → `INVALID_MOVE` 且 `G.lastTimeout` 保持 `null` | `force-end-turn.test.js:48` 扩断言 |
| `playerView` 透传不泄露 | `view.lastTimeout` 深拷贝存在,且不含任何 tile id/手牌字段 | `player-view.test.js` |
| `timeoutToastText` 四分支 | self+drew / other+drew / !drew / 无 name 回退 `Player {seat+1}` | 纯函数,仿 `submit-reason-text.test.js` |

### 3.2 RTL(挂 Board / 叶子组件)

| 测试 | 断言 |
|---|---|
| `TimeoutAnnouncement` 渲染 | `lastTimeout=null` → 无 toast;rerender 新 `{…id}` → 文案匹配;`advanceTimersByTime(TIMEOUT_TOAST_MS)` → 消失;**同 id** rerender 不再弹;**新 id** 再弹一次 |
| Hints 默认关 | 无 localStorage → 即便存在 playable,也**无** `.playable-hint`、**无** `.tile-playable` |
| Hints 开启 + 持久化 | 点 `💡 Hints`(`aria-pressed` false→true)→ 出现 marker + pill;`localStorage['rummycube:hintsOn']==='1'`;带 flag 重挂默认开 |
| 主/次按钮 class | 我方回合:`Draw`/`Submit`/`End` 带 `.primary-action`;`Sort:*` 带 `.secondary-action`;Submit 仍随有效性切 `end-valid`/`end-invalid` + ✓/✗ |
| 图标按钮 a11y + 禁用 | 存在可访问名 `Undo`/`Redo`;空栈/非我方回合/等待/gameover 时 `disabled`;`keyboard-undo-redo.test.js` 保持全绿 |
| 首回合提示自动消失 | `first-turn-hint.test.js`(已起草):显示 → `advanceTimersByTime(8000)` → 消失且写入 `firstTurnHintSeen='1'`;已读不显示;非我方回合不显示 |

### 3.3 `timePerTurn` 是**毫秒**的坑(Client 驱动测试必读)

`Game.setup` 把 `setupData.timePerTurn * 1000` 存为毫秒(`Game.js:36`);`getSecTs()` 返回 `Date.now()` 毫秒
(`util.js:455`);`TurnDeadlineWatcher`/`useCountdown`/`forceEndTurn` 全按毫秒算。

- **reducer 测试**(`force-end-turn.test.js`)**自带 setup**、直接传**已是毫秒**的 `timePerTurn`:传负值/0 即「deadline 已过」,
  传大值即「远未到」。**不要**再 `*1000`。
- **RTL 挂 Board** 直接喂 `G`(不走 `Client`):`timePerTurn`/`timerExpireAt` 按毫秒直填(harness 用 `timePerTurn:30` 即当毫秒)。
  注意 `showTurnTimer` 要 `allJoined`(`matchData` 各项有 `name`)才为真——harness 已给名字。

---

## 4. 任务拆分(有序、各自可测;标注 Board.jsx/board.css 串行热点)

| # | 任务 | 触碰文件 | 测试 | 依赖 / 备注 |
|---|---|---|---|---|
| **T1** | `G.lastTimeout` 服务端瞬时态:`forceEndTurn` 写入 + `onTurnBegin` 守卫清除 + `setup` init + `player-view` 断言 | `moves.js`、`Game.js`(+ `player-view.test.js`) | 3.1 全部 reducer 项 | **无 Board** 改动,完全独立。**先做**(骨干)。复用 `getSecTs`/`ctx.turn`,无新 import,`node src/server.js` 不受影响 |
| **T2** | `timeoutToastText` 纯函数 | `src/rummikub/timeoutToastText.js` | 3.1 文案四分支 | 独立。可与 T1 并行 |
| **T3** | `TimeoutAnnouncement` + 接线 + CSS | `components/TimeoutAnnouncement.jsx`、**`Board.jsx`**、**`board.css`** | 3.2 announcement | 依赖 T1(形状)+ T2(文案)。组件本体可与 T1/T2 并行写,最后接线 |
| **T4** | Hints 开关:`HintsToggle` + Board 状态/持久化/门控 + CSS | `components/HintsToggle.jsx`、**`Board.jsx`**、**`board.css`** | 3.2 Hints 两项 | `planning.js` 不动 |
| **T5** | 主/次按钮重排 | **`Board.jsx`**、**`board.css`** | 3.2 主/次 class | 与提交/抽牌行为回归不变 |
| **T6** | Undo/Redo 图标化移角 | `components/IconButton.jsx`、**`Board.jsx`**、**`board.css`** | 3.2 图标 a11y/禁用 | 复用 `canUndo/canRedo`;`keyboard-undo-redo` 保持绿 |
| **T7** | 首回合提示:自动消失 effect + 重定位 + 文案 | **`Board.jsx`**、**`board.css`**(可能更新 `first-turn-hint.test.js` 正则) | 3.2 首回合自动消失 | 决策 §0.4 文案冲突 |

**串行热点:`Board.jsx` 与 `board.css` 被 T3–T7 共同改动。** 建议:
- **叶子先行可并行:** `TimeoutAnnouncement`、`HintsToggle`、`IconButton`、`timeoutToastText`(T2)互不相干,可由多 implementer 并行。
- **集成单点:** Board.jsx/board.css 的接线按 T3→T4→T5→T6→T7 串行(或指定单一 owner 负责 Board 整合),避免合并冲突。
- **T1/T2 与所有叶子组件可同时开工**(不碰 Board.jsx)。

---

## 5. 风险 / 须复核的不变量

1. **`onTurnBegin` 同更新竞态(头号风险):** 必须用陈旧守卫(`id <= ctx.turn-2`),**严禁**无条件清。用「两回合」reducer
   测试守住:超时那回合内非空、其后清空。证据见 §1.3。
2. **服务器权威:** `lastTimeout` **只**在 `forceEndTurn` deadline 守卫**之后**写;`forfeitTurn`、客户端都不写。复核 deadline 前
   `INVALID_MOVE` 后 `lastTimeout` 仍 `null`(immer 草稿丢弃)。
3. **playerView 不泄露:** 载荷仅 `{seat,drew,id}`;`cloneDeep` 自动透传。补断言确认无 tile 字段。公告取名走公共 `matchData`。
4. **门控:** toast/hint **文本恒渲染**(a11y),仅动画进 `@media (prefers-reduced-motion: no-preference)`。计时环脉冲
   `.timer-low` 已门控(`board.css:1014`)。`jsdom` 未 mock `matchMedia` → 新动画判定必须 `window.matchMedia &&` 守卫。
5. **`timePerTurn` 毫秒坑:** 见 §3.3,Client 驱动测试勿重复 `*1000`。
6. **扩展名/引导面:** 服务端路径(`server.js→Game.js→moves.js/util.js/constants.js`)保持显式 `.js`;新组件只经 Vite 进
   `Board.jsx`,不在引导面。T1 落地后跑一次 `node src/server.js` 确认可启动。
7. **既有能力不回归:** 键盘 Undo/Redo(复用 `canUndo/canRedo`)、色盲第二通道(`↶/↷` 字形、Submit ✓/✗)、移动端 ≥44px、
   断线/同步 pill、各持久化键全部保留。
8. **`drew` 诚实性:** 牌堆空时 `drew=false` 走 "turn passed";`firstMoveDone` 抽 2 张时 `drew` 仍正确,文案固定单数可接受。
9. **WS-E 文案 vs 草拟测试正则冲突(§0.4):** final plan 必须二选一并保持 `first-turn-hint.test.js` 绿。
10. **无新依赖;应用内英文、动画门控、服务器权威三条红线全程保持。** 构建产物无 `console.log`(注意 `moves.js` 现有
    `console.log` 属既有代码,本轮新增代码不要再加)。

---

### 附:本报告对照核实过的关键代码位

`moves.js:145(forceEndTurn)/162(forfeitTurn)/420(onTurnBegin)/31(drawTile)/276(validatePlayerMove)/262(lastPlay)` ·
`Game.js:36(timePerTurn*1000)/46(lastPlay:null)/95(playerView)` ·
`util.js:455(getSecTs)/526(getPlayerHandTiles)/573(playerView=cloneDeep)` ·
`planning.js:54(playableTiles)` ·
`Board.jsx:38-59(firstTurnHint)/133-159(seenPlayRef 去重)/331(onTurnTimeout)/374-378(canUndo/Redo+hotkeys)/415-429(undo/redoBut)/431-440(playable)/514+546(hint)/531(pill)/566-573(drawOrEnd)/608-634(hand-buttons)` ·
`PlayerAvatar.jsx:11(LOW_TIME_MS)/42(.timer-low)` · `TurnDeadlineWatcher.jsx` · `juice/gating.js` · `juice/effects.js:5(reduced)` ·
`board.css:462(.turn-hint)/478(.rummikub-button)/1014(.timer-low 门控)/1095(.playable-hint)` ·
`tests: coach-card / first-turn-hint / force-end-turn / last-play / player-view / playable-marker / keyboard-undo-redo`。
