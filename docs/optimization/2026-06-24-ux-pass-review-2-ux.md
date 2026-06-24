# RummyCube · 操作清晰度与反馈 UX-pass · 专家报告 2 — UX

**Reviewer:** UX Researcher agent · **Date:** 2026-06-24
**输入 spec:** `docs/optimization/2026-06-24-ux-pass-spec.md`(WS-A 超时反馈 / WS-B playable→可开关 / WS-C 主操作醒目 / WS-D Undo·Redo 图标 / WS-E 首回合提示修复)
**红线遵循:** 应用内文案英文(本报告中文,UI 字符串给精确英文);动画/脉冲/音效一律 `prefers-reduced-motion` + mute 门控;不改 Rummikub 规则、计分、出牌校验、服务器权威。

**方法 / 依据(已逐项核对源码,避免误判):**
- 布局:`.hand-buttons`(`board.css:81`,`position:relative`)内**绝对定位三件套**在牌架上方同一列 `left:6px` 叠放 —— 头像 `.rack-self` `bottom:calc(100%+2px)`(`board.css:95`)、首回合提示 `.turn-hint` `bottom:calc(100%+30px)`(`board.css:462`)、回合横幅 `.turn-banner` `bottom:calc(100%+56px)`(`board.css:433`);三者**几何上必然重叠**。
- 控件:`Sort: runs` / `Sort: colours` / `drawOrEnd`(Submit/Draw/End/Give up turn)/ `Undo` / `Redo` 全部 `.rummikub-button` 等权重(`Board.jsx:608-631`、`board.css:478`),主操作夹在排序与撤销之间(DOM 中间位)。
- “playable” 真实语义(`planning.js:54-108`):**「手里这张牌能直接接到牌桌上某个已存在的合法组合上」**(延长同色顺子一端 / 给同数字 set 补一个缺的颜色),**不含 joker**,且**不考虑首出 30 分门槛** → 首回合会出现「显示 playable 但其实还不能放」的信任陷阱。
- 超时机制(`moves.js:145-160`):到点 `forceEndTurn` → 有暂存牌走 `validatePlayerMove`(合法则提交、不抽牌;非法则回退并抽 1 张),无暂存牌 → `drawTile` 抽 1 张;之后回合移交。`drew` 布尔可由此精确推出。**当前完全无 UI 反馈**。
- 既有可复用件:`G.lastPlay` 全员庆祝广播模型(`Board.jsx:131-159`、`moves.js:262`)= WS-A `G.lastTimeout` 的范本;`recentlyDrawnTiles`/`newlyAdded` 抽牌高亮(`Board.jsx:34,482`)= 可复用让超时所抽之牌“看得见”;计时环 `LOW_TIME_MS=5000` + `.timer-low` class(`PlayerAvatar.jsx:11,42`)已存在 = WS-A `RING_WARN_S` 应直接对齐;mute 经 `isMuted()`/`buzz()` 门控(`sfx.js:6,36,80`);撤销/重做快捷键 `Ctrl/Cmd+Z` = undo、`Ctrl/Cmd+Shift+Z` 与 `Ctrl/Cmd+Y` = redo(`useUndoRedoHotkeys.js`)。

**贯穿全篇的两个人物(persona):**
- **新手休闲玩家(主):** 不熟 Rummikub,多为手机;对 “meld / playable / ring” 这类术语零容忍;最受这四个问题伤害。设计须**诚实反馈 + 明确“现在点哪个” + 不靠颜色单通道**。
- **回头熟练玩家(次):** 懂规则,要快、要安静;希望 Hints 默认关、主操作一步可达、撤销/重做让位。
两类人物在本轮的结论一致 → 验证设计方向正确。

---

## WS-B 「playable」可理解性

### 为什么 “{n} playable” 让人看不懂
1. **形容词无宾语、三义混淆。** “playable” 没有动作对象,玩家会在三种心智模型间猜:①“我这回合**被允许**出的牌”、②“我手里能**自己凑成**合法组合的牌”、③(真实)“能**接到牌桌上已有组合**的牌”。只有 ③ 正确。owner 反馈 “没看懂” 正中此点。
2. **只给数量不给位置。** “{n} playable” 说了几张,没说**接到哪儿**;rack 上的脉冲标记(`.tile-playable-mark`)与 pill 视觉上未明确关联,玩家要自己找。
3. **与首出 30 分规则正面冲突(信任陷阱)。** 首回合你尚未破局,`planning.js` 仍会把“能接桌面组合”的牌计入,但你此刻**一张都放不上去**。看到 “5 playable” 却被拒 → 立刻不信任提示。`planning.js` 本轮不改逻辑 → 该陷阱**必然存在**,只能靠文案兜住(见下,强制要求)。
4. **常驻=噪音。** 对熟练玩家是干扰;这正是 WS-B 改“默认 OFF + 可开关”的依据。

### 建议(精确英文文案)
**术语统一:** 新文案一律把公共牌区称作 **“the table”**(比 “the board” 对休闲玩家更直觉,且 spec 既有 tooltip 已用 “the table”)。

**① pill 文案(Hints 开 + count>0)——替换裸词 “playable”,补足“宾语+动作”:**
- n≥2:`💡 {n} tiles fit the table`
- n=1:`💡 1 tile fits the table`

> 直接回应 owner“看不懂 playable”的最稳做法是**把 “playable” 这个裸词换掉**。若团队坚持保留该词,退一步的保守版为 `💡 {n} playable on the table`(至少补上“接到哪儿”的宾语);但首选 “fit the table”,因为 “fit” 天然表达“能拼上去”。

**② pill 的零状态(Hints 开 + count==0)——必须有,否则“开了像坏了”:**
- `💡 No tiles fit the table yet`

> 当前 `playableHint` 仅 `playableCount > 0` 才渲染(`Board.jsx:531`)。改成**手动开关**后,用户开启却看到空白会以为没生效。零状态 pill 确认“Hints 在工作,只是暂时没有可接的牌”。

**③ 首次开启的一次性 tooltip —— 必须同时点破首出门槛陷阱:**
- 首选(含 caveat):`Highlighted tiles can be added to a group already on the table. You still need your 30-point opening meld first.`
- 若要更短:`Highlighted tiles can be added to a group already on the table.`(但此版**不能**单独用于首回合,否则触发第 3 条陷阱)

> 因 `planning.js` 不改,提示会在破局前就亮牌,tooltip **必须**带 “opening meld first” 这句,否则把新手直接送进“显示可出却被拒”的坑。这是**硬要求**,不是可选润色。

### Hints 开关:标签 / 位置 / 可发现性(默认 OFF)
- **标签随状态显形,语义自解释:**
  - OFF 态可见文案:`💡 Show hints`,`aria-pressed="false"`
  - ON 态可见文案:`💡 Hints on`,`aria-pressed="true"`
  - `title="Highlight tiles that fit the table"`(悬浮补全价值主张)
  - 备选(标签稳定不变):始终显示 `💡 Hints`,只靠 `aria-pressed` + 一个填充/圆点表示开关态 —— 但**默认 OFF 时 `Show hints` 更能解释“点了会发生什么”**,故首选随状态变文案。
- **位置:归入“工具簇”,不与主操作争。** 放进 WS-C 的次要/工具区(与 Undo/Redo 图标同侧的角落),**不要**放在 Submit/Draw 主簇里。它是“偏好开关”,不是“这一步的动作”。
- **可发现性(默认 OFF 的最大风险=永远没人发现):**
  - 主荐:在**首回合 CoachCard 里加一行**指路(见 WS-E 合并方案):`Tip: turn on 💡 Hints to highlight tiles that fit the table.` —— 把“这功能存在”塞进唯一的 onboarding 时机,代价最小、不打扰熟练玩家。
  - 不建议为它单独再加常驻引导气泡(与“默认简洁”冲突)。
- **ON 态要传达什么:**
  1. 按钮自身呈“按下/激活”态(填充 + `aria-pressed="true"`),**非纯色区分**(色盲也能看出按下)。
  2. 有可接牌 → rack 标记脉冲 + pill 计数;无可接牌 → 上面的零状态 pill(证明它在工作)。
  3. 首次 ON → 弹一次上面的 tooltip,之后不再弹(`localStorage` `rummycube:hintsOn` 已记开关态;tooltip 另用一个 `rummycube:hintsTipSeen` 记“已弹过”)。

---

## WS-A 超时反馈

owner 痛点是“**感觉没惩罚**”。本质不是没惩罚(确实抽了 1 张、回合也移交了),而是**这件事没有任何存在感**。所以目标是把“**时间到 → 抽了 1 张(代价)→ 轮到下一家(损失)**”三段**做得无可辩驳地可感知**,尤其是轮到自己被跳过时。

### 公告文案(精确英文,4 格矩阵)
`drew` 布尔来自 `forceEndTurn`(提交成功=未抽,其余=抽 1 张);self/other 由 `lastTimeout.seat === playerID` 区分。统一前缀 `⏱`,无名字时回退 `Player {n+1}`。

| | drew = true(抽了 1 张) | drew = false(暂存合法,自动提交) |
|---|---|---|
| **自己** | `⏱ Time's up — you drew a tile and your turn passed.` | `⏱ Time's up — your turn passed.` |
| **他人** | `⏱ Time's up — {name} drew a tile and passed.` | `⏱ Time's up — {name} passed.` |

> 与 WS-E 首回合微文案**用词一致**(都强调 “draw a tile / turn passes”),让“规则预告”和“真的发生”互相印证,强化“这是有代价的”。
> 可选增强(需多于 `drew` 一个布尔,列为后续):自己 + 未抽其实是“暂存被自动提交”,可更准确地写 `⏱ Time's up — your meld was submitted and your turn passed.`;本轮先用上表通用版,避免误导。

### 出现位置
- **统一一个瞬时 toast,锚定牌桌顶部居中**(`.board` 内、`TableSeats`/计时环行下方;`position:absolute; top:~8px; left:50%; transform:translateX(-50%)`)。理由:计时将尽时所有人的目光都在顶部当前玩家头像/计时环上,公告就该出现在视线落点。
- **视觉必须区别于普通 `.turn-banner`**(换 ⏱ 图标 + 不同底色/描边),否则会被当成“又一次换人”而忽略。
- **自己被跳过时叠加“就在身边”的第二锚点(关键):**
  1. **把超时所抽之牌在 rack 里高亮**——复用既有 `recentlyDrawnTiles`/`newlyAdded` 高亮(`Board.jsx:34,482`):玩家**亲眼看到手牌多了一张**,代价从抽象变具体(若服务端 `forceEndTurn` 抽牌路径接线可行;不可行则降级为仅 toast,标注给前端核可)。
  2. 计时环**可见地走到 0 再移交**(别瞬切),`.timer-low` 脉冲沿用 `RING_WARN_S`。

### 持续时长(可测)
- `TIMEOUT_TOAST_MS` **按对象分级**:自己 = **4500ms**(事关己方损失,给足阅读 + 情绪落点);他人 = **3000ms**(信息性,别拖)。
- 若实现上只想要单一常量:统一 **4000ms** 可接受。
- 去重:同一回合靠 `id` nonce 只显示最近一条;`onTurnBegin` 清 `G.lastTimeout` → 重连不见陈旧公告(spec 已含)。

### 让“你的回合被跳过”无可误认
1. **专属视觉**:⏱ + 与普通横幅不同的配色,不可复用换人横幅样式。
2. **三通道叠加(自己)**:顶部 toast + rack 新牌高亮 + 计时环归零 → 文字/位置/动效三路都说“你超时了,抽了牌,轮到别人”。
3. **回合横幅同步立即翻到下一家**,反向坐实“已经不是你的回合”。
4. **声音**:自己超时给一记轻 `buzz()`(已 mute 门控);**他人超时不发声**(仿 `resolveJuice` own=full / opponent=muted,避免多人房噪音轰炸)。
5. **a11y politeness 分级**:自己用 `role="alert"` / `aria-live="assertive"`(立即播报“你被跳过”);他人用 `role="status"` / `aria-live="polite"`。可用同一 live region,按 seat 是否=自己动态切 politeness。
6. **门控**:toast 的滑入/闪动、环脉冲走 `@media (prefers-reduced-motion: no-preference)`;reduced-motion 下 toast **仍出现**(只是无滑动)、环**仍走到 0**(只是不脉冲)。

---

## WS-E 首回合 onboarding

### 现状两块同时出现且打架
首回合(`isMyTurnBanner && !seen`)会**同时**渲染:
- 自由飘浮的 `.turn-hint`:`When the ring runs out, your turn ends automatically.`(`Board.jsx:546`)——绝对定位,**几何上必然压住头像/横幅**(见开头“方法”),且只在“回合移交他人”时才标已读(`Board.jsx:47-59`),solo/等待**永不移交 → 永不消失**(确认的 bug)。
- 流式 `CoachCard`:`Be first to empty your rack.` / `Your first meld must total at least 30 points in runs/sets.`(`CoachCard.jsx`)。

→ 两块独立 onboarding、信息割裂、还有一块在遮挡头像。

### 建议:合并(首选),而非并列
**把“计时环”那一行并入 CoachCard,首回合只出一块卡。** 理由:
- 两者**同一触发条件**(你的首回合),分两块=注意力分散、要点两次“×”。
- 计时微文案就一行,作为 CoachCard 第三行天衣无缝。
- **遮挡 bug 的根因是那个绝对定位的 `.turn-hint`**;并入流式卡片后,绝对定位冲突**从根上消失**,无需再小心翼翼调 `left/bottom`。
- 一个 “Got it” 收掉全部,且 CoachCard 在 `firstMoveDone[playerID]` 为真(完成首出)后本就自动隐藏(`Board.jsx:554-558`)→ 不会永久滞留。
- (若团队坚持分离:则必须 ①把 `.turn-hint` 移出头像/横幅那一列——改为牌架**下方流式**或头像**右侧**互不遮挡;②按 `FIRST_TURN_HINT_MS` 自动消失兜底。但这只是“缓解”,不如合并“根治”。)

### 合并后的 CoachCard 文案(精确英文)
```
Be first to empty your rack.                                   ← objective(原样)
Your first meld must total at least 30 points in runs/sets.    ← rule(原样)
If your timer runs out, you draw a tile and your turn passes.  ← 新增:并入的计时微文案
[ Got it ]
```
可选第四行(承接 WS-B 可发现性,**淡化/次要样式**,过载时可删):
```
Tip: turn on 💡 Hints to highlight tiles that fit the table.
```

**微文案校正说明(无论合并与否都改):**
- 原 `When the ring runs out, your turn ends automatically.` 两处问题:① “the ring” 假定玩家知道头像那圈是“ring”——多数新手不知;② “ends automatically” **隐瞒了惩罚**(其实你会被抽 1 张)。
- 改为(独立版,若不合并):`When your timer runs out, you draw a tile and your turn passes.` —— 用 “timer” 取代 “ring”,并讲明代价(draw a tile)与后果(turn passes),与 WS-A 公告同源。

### 位置:确保不盖头像/横幅
- CoachCard 在 `.hand-buttons` 内**流式**(handGrid 之后,`Board.jsx:614`),位于牌架**下方**;头像/横幅是牌架**上方**的绝对定位元素 → **天然不重叠**。合并后唯一会盖头像的 `.turn-hint` 被移除,问题闭环。
- 卡片维持 `max-width:360px`、`align-self:center`(`coachCard.css`),手机上不超 `.hand-buttons` 宽度。
- 入场动画 `coachCardIn` 已是 `prefers-reduced-motion: no-preference` 门控(`coachCard.css`),符合红线。

---

## WS-C / WS-D 按钮层级(可用性视角)

### 现状的可用性问题
- **零层级**:6 个按钮同样大小/同色(`.rummikub-button`),回答不了“这一步该点哪个”,每回合都要全扫一遍。
- **主操作被埋**:DOM 顺序是 `Sort runs → Sort colours → [drawOrEnd] → Undo → Redo`(`Board.jsx:608-631`)——最重要的 Submit/Draw 夹在排序和撤销中间。
- **误触风险**:低频“纠错”操作 Undo/Redo 与主操作等权且紧邻 → 想点 Submit 容易点成 Undo。

### WS-C:三层级 + 空间分簇
**① 主操作 `.primary-action`(最大、强调色、强阴影、居中、阅读序最前):** 即 `drawOrEnd` 当前态下“该做的那一个”——
- 有暂存牌:**Submit meld = 主**;`Draw` 降级为**禁用幽灵态**(保留其解释 tooltip `Clear your placed tiles to draw instead`);`Give up turn` 降为**三级 danger**(静音红/描边),与主操作**拉开间距防误触**。
- 无暂存 + 牌堆有牌:`Draw` = 主。
- 牌堆空:`End` = 主。
- 任一时刻常态下**只有一个主按钮**抢眼,直接消解“点哪个”的犹豫。

**② 次要 `.secondary-action`(更小、低饱和、成组):** `Sort: runs` / `Sort: colours` 合成一个分段式 “Sort” 簇,退到一侧。

**③ 工具/图标(见 WS-D):** Undo/Redo 图标 + Hints 开关,收进牌架角落。

**保留不变(硬性):**
- Submit 的**有效性双通道**:`✓`/`✗` 字形(`endStateGlyph`)+ 绿/红(`.end-valid`/`.end-invalid`,`board.css:519-529`)。主样式平时是强调色填充;**一旦暂存,valid/invalid 态的绿/红辉光 + ✓/✗ 覆盖主色**(现逻辑已具备,务必不要被新主样式吃掉)。
- 全部禁用条件、`drawOrEnd` 切换逻辑、键盘可达性不变。
- **命中区 ≥44px**;主按钮可更高(~48–56px)。
- **焦点/阅读序**:主操作优先 → `Give up turn` → Sort 簇 → Undo/Redo 图标(末)。视觉用 `order`/flex 居中,DOM 保持主操作在前(满足键盘/读屏“先到先得”)。

### WS-D:Undo/Redo 图标化 + 移角
- **图标**:`↶` Undo / `↷` Redo(spec 既定),**非纯色区分**(靠字形,色盲/高对比可辨;原 `.undo`/`.redo` 的橙/蓝降为纯装饰)。
- **可访问名(图标无文本替身,必须补):**
  - Undo:`aria-label="Undo"`,`title="Undo last move (Ctrl+Z)"`
  - Redo:`aria-label="Redo"`,`title="Redo last move (Ctrl+Y)"`
  - tooltip 顺带**暴露既有快捷键**(`Ctrl/Cmd+Z` / `Ctrl/Cmd+Y`,已在 `useUndoRedoHotkeys.js`),帮助发现。Mac 可显示 `⌘Z`/`⌘Y`;不做平台判定时统一 `Ctrl` 也可接受。
- **位置**:成对收到**牌架一角**(建议 `.hand-buttons` 右上角绝对定位),与主操作簇**明显留白**隔开,杜绝误触;键盘快捷键、禁用条件、`moves.undo/redo` 全不变。
- **禁用态**:栈空/非你回合/等待/gameover → `disabled`(现已具备)+ 降透明度;**确保禁用时图标仍可辨形**(别只靠变灰)。
- **配对不可拆**:图标 Redo 单独不易懂,保留 Undo/Redo 成对 + tooltip + “undo 后才点亮 redo” 的时序,让 redo 可学习。

---

## 跨工作项:可访问性 & 门控一致性清单(红线)

- [ ] **动效门控**:超时 toast 滑入/闪动、计时环脉冲、任何新动画一律包在 `@media (prefers-reduced-motion: no-preference)`;reduced-motion 下信息**仍可见**(toast 仍现、环仍归零、pill 仍显),只是去掉动。
- [ ] **声音门控**:超时 `buzz()` 经 `isMuted()`(已门控);仅自己超时发声,他人静音。
- [ ] **非颜色第二通道**:Hints 按下态(填充/圆点)、Submit ✓/✗ 字形、Undo/Redo 字形、超时 ⏱ 图标——都不靠纯色。
- [ ] **读屏 politeness**:超时自己 `assertive`、他人 `polite`;Hints pill `role="status" aria-live="polite"`;沿用现有横幅/pill 的 live region 习惯。
- [ ] **命中区**:所有按钮(含图标按钮、Hints 开关)≥44×44px。
- [ ] **playerView 不泄露**:超时公告只含座位/姓名,不含手牌(spec 已列)。
- [ ] **英文 UI**:本报告所有反引号内文案均为可直接落地的英文串。

---

## 可测试验收点汇总(交前端/QA)

| WS | 验收点(可断言) |
|---|---|
| B | 默认不渲染 rack 高亮与 pill;开启后渲染;`localStorage rummycube:hintsOn` 读写正确 |
| B | Hints 开 + count>0 → pill 文案 `💡 {n} tiles fit the table`(n=1 用 `💡 1 tile fits the table`) |
| B | Hints 开 + count==0 → pill 文案 `💡 No tiles fit the table yet`(不隐藏,证明开关生效) |
| B | 首次开启弹一次 tooltip `Highlighted tiles can be added to a group already on the table. You still need your 30-point opening meld first.`;`rummycube:hintsTipSeen` 置位后不再弹 |
| B | 开关有 `aria-pressed`;OFF 文案 `💡 Show hints`、ON 文案 `💡 Hints on` |
| A | `forceEndTurn` 写 `G.lastTimeout`、`onTurnBegin` 清(纯逻辑 jest);deadline 前仍 `INVALID_MOVE` |
| A | 公告按 4 格矩阵渲染正确英文(self/other × drew/未抽);无名回退 `Player {n+1}`(RTL) |
| A | toast 顶部居中、区别于 `.turn-banner`;`TIMEOUT_TOAST_MS` 后消失(self 4500 / other 3000,或统一 4000) |
| A | self 超时:计时环走到 0、rack 高亮新牌(若接线可行)、`assertive` 播报;other:`polite`、不发声 |
| A | 动效/`buzz` 在 reduced-motion / mute 下被抑制,但**文字公告仍出现** |
| E | 首回合只出**一块**卡(合并方案);`.turn-hint` 不再绝对定位压头像/横幅 |
| E | CoachCard 含第三行 `If your timer runs out, you draw a tile and your turn passes.` |
| E | 首回合提示推进假计时后消失并写已读;已读不再现;非你回合不显示(`first-turn-hint.test.js`) |
| C | 主操作带 `.primary-action`、Sort 带 `.secondary-action`(RTL 断言 class);Submit ✓/✗ 与禁用回归不变 |
| D | Undo/Redo 为图标按钮且可访问名 `Undo`/`Redo`、`title` 含快捷键;禁用逻辑与键盘快捷键回归不变 |

## 给前端 / plan 的开放问题(需确认)
1. **超时抽牌高亮**:服务端 `forceEndTurn` 抽牌路径能否复用客户端 `recentlyDrawnTiles` 高亮?不可行则 self 超时降级为“仅 toast + 环归零”,验收点 A 第 4 行相应放宽。
2. **`TIMEOUT_TOAST_MS` 分级 vs 单值**:接受 self 4500 / other 3000 的分级,还是落单一 4000ms?(本报告倾向分级,实现成本低。)
3. **CoachCard 第四行(Hints 指路)**:并入还是省略?(并入可解默认 OFF 的发现性;过载时可删,但需另想 Hints 曝光点。)
4. **`RING_WARN_S` 与既有 `LOW_TIME_MS=5000` 对齐**:直接复用同一阈值与 `.timer-low`,避免双套告警逻辑——确认采纳。
