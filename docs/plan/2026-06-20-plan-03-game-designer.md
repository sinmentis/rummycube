# RummyCube 优化 · 玩法与数值设计(Game Designer)

> 权威来源:`docs/optimization/2026-06-20-rummycube-optimization-spec.md`(WS-2/5/9/10/11/12),
> 配合 `review-1-game-design.md`、`review-5-persona.md`。
> 本文只覆盖各 WS 的「玩法与数值」部分,转化为实现级、可调参设计。**不改代码、不 commit。**
> 标识符/代码用英文,设计说明用中文。所有未定数值标 `[PLACEHOLDER]`,需经 playtest 校准。

## 0. 已核实约束与现状(给出 file:line)

| 事实 | 出处 |
|---|---|
| 每回合计时默认 **10s**(`timePerTurn = (setupData?…:10)*1000`) | `src/rummikub/Game.js:36` |
| 起手 14 张(`REACT_APP_TILES_TO_DRAW=14`) | `.env.production:5`、`constants.js:6` |
| 首墙 ≥30(`REACT_APP_FIRST_MOVE_SCORE_LIMIT=30`) | `.env.production:6`、`moveValidation.js:140` |
| 当前 combo 分 = 本回合新放 tmp 张数 | `comboMath.js:16-18` `submitComboCount` |
| combo 等级 3/5/7 → NICE/COMBO/ON FIRE | `comboMath.js:1-6` `comboLabel` |
| 组合分数/`lastPlay` 在 `validatePlayerMove` 内、`freezeTmpTiles` **之前**算 | `moves.js:235-245`(freeze 在 246) |
| `lastPlay.points` 把 joker 记 **0 分** | `moves.js:237` `isJoker(p.id) ? 0 : getTileValue(p.id)` |
| 终局手牌里 joker 折 **30 分** | `util.js:319,341` `isJoker(tile) ? 30 : getTileValue` |
| `G.prevTilePositions` 每回合 `onTurnBegin` 重置(基线下回合即丢失) | `moves.js:267` |
| `onTurnBegin({G,ctx})` 拿不到 `matchData`/`isConnected` | `moves.js:259-268`(spec WS-12) |
| 服务器权威;`forceEndTurn` 在 `getSecTs() < timerExpireAt` 时拒绝(反作弊) | `moves.js:142-150` |
| `getFormedGroups(G)` 已能取「含本回合 tmp 牌且合法的组」 | `moveValidation.js:158-162` |
| 桌面 run 提取(按行扫描连续列) | `moveValidation.js:25-66` `extractSeqs` |
| 桌面整体合法性 | `moveValidation.js:69-77` `isBoardValid` |
| joker 冻结代表值(run/group) | `util.js:158-240` `freezeJokersInRun/Group` |

> **关键工程约束(贯穿 WS-9/11):** manipulation(重排)分必须在 `validatePlayerMove` 内、`freezeTmpTiles()` 之前,对比 `G.prevTilePositions` 计算并写入 `G.lastPlay`;下回合基线即被 `onTurnBegin`(`moves.js:267`)清掉,**不可事后/客户端重算**。

---

# WS-9 · Combo 评分重设计(奖励技巧,不奖励囤牌)

## 9.1 为什么旧「按张数计分」激励囤牌(设计论证)

旧公式 `submitComboCount = 本回合放下的 tmp 张数`(`comboMath.js:16-18`),等级阈值 3/5/7(`comboLabel`)。它的激励结构有三个问题:

1. **奖励「一次放多」而非「放得巧」。** 玩家要拿 ON FIRE(≥7 张),最优策略是**攥着牌不出**,等手里能一次性铺 7 张时再出 —— 这正是囤牌。Rummikub 的核心乐趣(拆解重排桌面把牌挤进去)得 0 combo,而开局把起手墙一股脑倒出反而 ON FIRE。奖励指向了**最不需要技巧**的进度表达(review-1 Finding 2)。
2. **拖慢节奏、放大停机时间。** 囤牌让每个人的回合更长、出牌更少,4 人局空等被进一步拉长(review-1 Finding 4)。
3. **对旁观者不公。** 旧 `lastPlay` 特效在所有客户端同样触发(review-1 Finding 5),对手得分时你的屏幕也被 kick。

**结论:** 把「形成/延伸的不同组数」和「靠重排既有桌面牌并入的张数」设为主奖励,张数仅作微弱尾项。让一次精巧的 1 张 manipulation 拿到比「无脑倒 3 张」更高的 combo。

## 9.2 评分公式(实现级)

在 `validatePlayerMove`(`moves.js:235`,freeze 前)新增纯函数
`scoreManipulation(G) -> { groupsFormed, tilesIntegrated, tilesPlaced, comboScore }`,与现有 `getFormedGroups` 并列。

**输入定义(全部 freeze 前可得):**

- `tmpTiles` = `Object.values(G.tilePositions).filter(p => p.gridId==='b' && p.tmp)` —— 本回合放上桌的牌(`moves.js:236` 同款)。
- `movedExisting` = 满足「`p.gridId==='b'` 且 **非 tmp**,且 `G.prevTilePositions[id]` 存在,且 `(row,col)` 相对 prev **发生变化**」的桌面牌集合 —— 即「被重排的既有桌面牌」(review-1 Finding 2 给出的可检测定义)。
- `groupsFormed` = `getFormedGroups(G)` 的长度 —— 本回合新形成/延伸的合法组数(`moveValidation.js:158`)。
- `tilesIntegrated` = `tmpTiles` 中,落在「同时含被重排既有牌」的合法组里的张数(即「靠重排把手牌并入」的张数)。判定:对每个 `getFormedGroups` 的组,若该组里 `movedExisting∩组 非空`,则该组内的 tmp 张数计入 `tilesIntegrated`。
- `tilesPlaced` = `tmpTiles.length`(尾项)。

**主公式:**

```
comboScore =  W_GROUP   * groupsFormed
           +  W_INTEG   * tilesIntegrated
           +  W_PLACE   * tilesPlaced          // 尾项,权重最小
```

**等级(替换 comboLabel 的张数阈值,改用 comboScore 阈值):**

```
comboScore >= T_FIRE  -> 'ON FIRE'   ("大师级重排")
comboScore >= T_COMBO -> 'COMBO'     ("漂亮的并入")
comboScore >= T_NICE  -> 'NICE'
否则                  -> ''
```

**核心约束(验收用):** 「1 张 manipulation 形成 2 组」必须 **>** 「3 张无重排平铺」:

```
W_GROUP*2 + W_INTEG*1 + W_PLACE*1   >   W_GROUP*1 + W_PLACE*3
=> W_GROUP + W_INTEG  >  2*W_PLACE         （基准取值满足:5+3 > 2*1）
```

> **庆祝点数 `lastPlay.points`(展示数,沿用现机制 `moves.js:241`):** 与 `comboScore` 分离 —— `points` 是「这次出牌的桌面点数」用于飘字;`comboScore` 决定特效等级。WS-11 要求 `points` 把 joker 按代表值计(见 §11.3),修掉 `moves.js:237` 的 joker=0。

## 9.3 调参表(数值全为 [PLACEHOLDER])

| 变量 | 基准值 | 最小 | 最大 | 调参备注 |
|---|---|---|---|---|
| `W_GROUP`(每个形成/延伸的组) | `[PLACEHOLDER] 5` | 3 | 8 | 主奖励;调高=更鼓励「一手开多组」。 |
| `W_INTEG`(每张靠重排并入的牌) | `[PLACEHOLDER] 3` | 2 | 6 | manipulation 的核心奖励;必须使 §9.2 不等式成立。 |
| `W_PLACE`(每张放下的牌,尾项) | `[PLACEHOLDER] 1` | 0 | 2 | 设 0 可彻底消除「按张数」激励;保留 1 给纯铺牌一点正反馈避免新手挫败。 |
| `T_NICE` | `[PLACEHOLDER] 6` | 4 | 8 | ≈ 一次延伸 1 组 + 并入 1 张即可触发,给新手够得着的甜头。 |
| `T_COMBO` | `[PLACEHOLDER] 12` | 9 | 16 | ≈ 2 组或 1 组 + 数张并入。 |
| `T_FIRE` | `[PLACEHOLDER] 20` | 16 | 28 | 留给真正的大重排;手感测试:开局倒墙不应轻易达到。 |
| `PARTICLE_NICE/COMBO/FIRE` | `8 / 18 / 40` | — | — | 沿用 `comboMath.js:8-10` `particleCount`,按新等级映射。 |

## 9.4 Juice 门控规则(自家全特效 / 对手弱化 / 拖拽不 kick)

新增纯谓词 `resolveJuice({ lastPlay, localSeat, isDragging }) -> { kick, sound, spotlight, particles, intensity }`,在 `Board.jsx` 的 `lastPlay` effect(review-1 Finding 5 指 ~66-86)消费:

| 情形 | `kick` | `sound` | `spotlight` | `particles` | `intensity` |
|---|---|---|---|---|---|
| 自家出牌(`lastPlay.seat === localSeat`)且未拖拽 | ✅ | ✅ 胜利 sting | 大(仅高亮本次提交的组) | 满(按等级) | `full` |
| 对手出牌(`seat !== localSeat`) | ❌ 无 kick | ❌ 无 win-sting(改轻 tick) | 小 | 减半 | `muted` |
| **本地正在拖拽/有选中**(`isDragging===true`)无论谁 | ❌ 永不 kick | 可保留轻音 | 不打断 | 可延后 | 按上面但强制 `kick=false` |

> 配合 spec WS-9 的渲染优化:confetti 与 flash 二选一;`board-kick` 改 transform-only(`will-change:transform`)的 wrapper,而非 20-box-shadow 的 `.board` 子树;`celebrateGroups` 只点亮本次提交的组(`lastPlay.groups`,`moves.js:242`)。

## 9.5 体验目标 / 输入 / 输出 / 失败态 / 调参杠杆 / 验收

- **玩家体验目标:** 「我靠拆桌面把这张牌挤进去了」比「我一次倒了一堆」更被表彰;对手得分不抢戏、不打断我的操作。
- **输入:** `G.tilePositions`(含 tmp)、`G.prevTilePositions`(freeze 前)、`localSeat`、`isDragging`。
- **输出:** `G.lastPlay.comboScore` + 等级标签 + 门控后的特效集合。
- **失败态:**(a)基线已被 `onTurnBegin` 清掉 → 必须 freeze 前算(否则 `movedExisting` 恒空,manipulation 永远 0);(b)`getFormedGroups` 为空但 board 合法(纯重排无新组)→ 仍应按 `tilesIntegrated` 给分;(c)对手特效错误地触发 kick。
- **调参杠杆:** `W_GROUP / W_INTEG / W_PLACE`、三个阈值、`muted` 强度系数。
- **验收(怎样算好玩了):**
  1. Jest:「1 张 manipulation 形成 2 组」的 `comboScore` > 「3 张无重排平铺」;`lastPlay` 携带 freeze 前算出的 manipulation 分。
  2. Jest:`resolveJuice` 对「对手的 `lastPlay`」与「本地正在拖拽」均返回 `kick=false`。
  3. 手感:开局倒起手墙 ≤ COMBO;一次跨组重排能摸到 ON FIRE。
  4. 观察指标:平均回合时长下降、人均出牌回合数上升(囤牌减少的代理指标)。

---

# WS-2 · 新手教学「中文规则原文」(可直接放进 modal / coach card)

> 文案要求:简洁、口语、零术语堆砌。下列中文可直接落地。modal = 导航栏「怎么玩」常驻入口;coach card = 首回合一次性提示(localStorage flag,关掉不再弹)。

## 2.1 「怎么玩」Modal 全文(中文)

> **标题:怎么玩 RummyCube**
>
> **目标**
> 最先把手里的牌全部打到桌上的人获胜。
>
> **每个回合二选一**
> - **出牌:** 把手里的牌摆成合法的组,放到桌上。
> - **抽牌:** 如果出不了(或不想出),点「抽牌」,摸一张,回合结束。
>
> **什么是合法的组**(每组至少 3 张)
> - **顺子(run):** 同色、数字相连。例:红 4–红 5–红 6。
> - **同数(set):** 同数字、不同颜色。例:红 7–黑 7–蓝 7。
>
> **第一次出牌:至少 30 分**
> 你这一局**第一次**出牌,摆出的牌点数加起来要 **≥ 30 分**(牌面数字之和)才算数。够 30 分破墙之后,以后出牌就没有这个限制了。
>
> **百搭(Joker)**
> 那张笑脸牌是**百搭**,能顶替任何一张牌凑成顺子或同数。它在手里没出掉时算 30 分,尽量别留在手上。
>
> **回合计时**
> 每个回合有 **10 秒**倒计时(房间可调)。计时圈走完,你的回合会**自动结束**。

## 2.2 首回合 Coach Card 全文(中文,一次性)

> **轮到你了 — 先破墙**
> 你这一局的**第一次出牌要凑够 30 分**:把同色相连的牌(顺子)或同数字不同色的牌(同数)摆到桌上,每组至少 3 张,点数加起来 ≥ 30。
> 出不了?点「抽牌」摸一张,这一轮就过。
> *(知道了 ✕)*

## 2.3 Joker 悬停/长按标签

> `Joker(百搭)`

## 2.4 体验目标 / 输入输出 / 失败态 / 杠杆 / 验收

- **体验目标:** 规则naive 的 Mei 在第一个真实回合前就知道目标、抽牌 vs 出牌、≥30、joker、计时(review-5 Finding 1)。
- **输入:** 静态内容,无后端;localStorage flag 控制 coach card 是否再弹。
- **输出:** modal 文本 + 首回合卡片 + joker label。
- **失败态:** 文案过长没人读(spec「在情境里教,而非靠没人看的弹窗」)→ 保持上面这种短句;coach card 只在**首回合**且未 dismiss 时出现。
- **调参杠杆:** coach card 触发时机(首回合开始 vs 第一次点出牌)、文案长度。
- **验收:** Playwright:导航栏「怎么玩」打开的 modal 含字符串「30」与「顺子」/「同数」;关闭后再进对局页不再自动弹 coach card(spec WS-2 验收)。

---

# WS-5 · 回合 / 计时表达(玩法措辞,中文)

> 让计时与轮次状态可读、可预期,且不靠颜色单通道(色盲安全)。

## 5.1 文案表

| 场景 | 中文措辞 |
|---|---|
| 轮到自己 | `● 轮到你了` |
| 轮到他人 | `● {名字} 的回合` |
| 计时圈中心 | 剩余**秒数**数字(如 `7`),随时间递减 |
| 首回合微提示 | `计时圈走完,你的回合会自动结束` |
| 最后几秒警告 | 圈体轻微脉冲 + 文案 `快没时间了…`(`< WARN_SECONDS` 时) |
| 自动结束后(自己未出牌) | `时间到,已自动结束你的回合` |

## 5.2 调参表

| 变量 | 基准值 | 最小 | 最大 | 调参备注 |
|---|---|---|---|---|
| `timePerTurn`(房间默认) | `10s`(`Game.js:36`) | 10s | 60s | 房主可在 setupData 调;4 人局长时长会放大停机(配合 WS-10)。 |
| `WARN_SECONDS`(警告脉冲阈值) | `[PLACEHOLDER] 3s` | 2s | 5s | 触发圈体脉冲 + 「快没时间了」。 |

## 5.3 体验目标 / 失败态 / 验收

- **体验目标:** 玩家随时知道「是不是我」「还剩几秒」「时间到会怎样」(review-5 Finding 6/8)。
- **失败态:** 仅靠蓝→红渐变(色盲不可辨)→ 必须有数字 + 文字第二通道。
- **验收:** Playwright:自己回合时 banner 显示「轮到你了」,中心秒数存在且递减;非颜色单通道(spec WS-5 验收)。

---

# WS-10 · 减少等待(可打出提示 + 规划模式)

## 10.1 「可打出提示」判定规则

新增**纯函数** `playableTiles(handTiles, boardSeqs) -> Set<tileId>`(spec WS-10 要求可单测,不依赖随机发牌):

**判定逻辑(对手里每张牌 `t`):**
标记为「可打出」当且仅当存在某个桌面合法组 `seq`(由 `extractSeqs(G)` 取、`isSequenceValid` 过滤,`moveValidation.js:25-77`),使得把 `t` 加入后仍合法,即:

1. **延伸顺子:** `seq` 是同色 run,且 `t` 同色、数值等于 `min(seq)-1` 或 `max(seq)+1`(含 13→1 环绕由现有 `countSeqScore` 规则,`util.js:273` 谨慎处理,默认不环绕)。
2. **延伸同数:** `seq` 是 set(同数不同色),长度 < 4,且 `t` 数值相同、颜色不在组里(`isDiffColor`,`util.js:120`)。
3. **(可选 P2 扩展)** `t` 能与手里其它牌新开一组 ≥3 —— 第一版**先不做**,只标「能延伸桌面既有组」的牌(spec 措辞:which rack tiles can currently extend a board group)。

**输出附加:** `playableCount = playableTiles.size` —— rack 上显示「你手里有 N 张能打」。

> joker 特例:joker 在手时**总是**可标为「可打出」(它几乎总能延伸某组),但第一版可保守地不把 joker 计入 count,避免误导。标 `[待核实]`:是否把 joker 计入 `playableCount`。

## 10.2 规划模式(planning mode)玩法约束

| 约束 | 规则 |
|---|---|
| **私有** | 规划覆盖层只在本地客户端,**不写入** `G`、不广播,对手不可见。 |
| **可在对手回合摆放** | 在别人回合可把牌拖到半透明 ghost 层预排,**不触发**任何服务器 move(现 `fromHandToBoard` 需 `currentPlayer`,规划层绕过它,纯本地)。 |
| **轮到你时校验/和解** | 你的回合开始时,把 ghost 布局尝试落到真实 board:逐组用 `isSequenceValid`/`isBoardValid` 校验;**若桌面在你等待期间变了**(对手改了你预排所依赖的组),自动 reconcile:能落的落、冲突的退回手牌并提示 `桌面变了,这步没排上`。 |
| **不可作弊** | 规划层不能提前结束回合、不能提前 freeze;真正生效仍走服务器 `validatePlayerMove`。 |

## 10.3 体验目标 / 输入输出 / 失败态 / 杠杆 / 验收

- **体验目标:** 4 人局里 75% 的等待时间有事可做、轮到自己时秒出(review-1 Finding 4)。
- **输入:** `handTiles`、`boardSeqs`(`extractSeqs`);规划层:本地 ghost 位置。
- **输出:** 可打出牌高亮 + count;规划层 reconcile 结果。
- **失败态:**(a)桌面变更使预排失效 → 必须 reconcile 而非静默丢弃;(b)把规划层误当真实 move 广播(作弊面);(c)提示把不合法的牌标成可打。
- **调参杠杆:** 是否含 joker、是否含「新开组」判定、reconcile 的提示强度。
- **验收:** Jest:`playableTiles` 在构造态(桌面有 run/set + 手里有匹配牌→标记;不匹配→不标)通过;Playwright(solo,seeded 态):标记可见(spec WS-10 验收)。

---

# WS-11 · Joker 深度

## 11.1 取回规则(玩法层)

新增当前玩家 move `retrieveJoker(G, ctx, jokerTileId, tileA, tileB)`:

**前置条件(全部满足才允许):**
1. `jokerTileId` 是桌面上(`gridId==='b'`)一张 joker(`isJoker`,`util.js:101`)。
2. 该 joker 在其所在合法组里代表的**值+(顺子时)颜色**已知 —— 由 freeze 时记录的代表值得到(见 §11.3)。
3. 玩家**手里**拥有 `tileA`、`tileB`,且其中**至少一张**真实牌的(值,颜色)正好等于 joker 当前代表的那张牌。
   - 经典 Rummikub 取回:用「与 joker 代表的同一张真牌」换出 joker。本实现要求玩家提供能**顶上 joker 位置**的真牌。
   - 标 `[待核实]`:产品上是要求 1 张顶替牌还是「两张真牌」(review-1 Finding 3 措辞为「the two real tiles matching a table joker's value+color」)。设计默认:**1 张顶替真牌**换回 joker;`tileB` 参数预留给「需要两张才能维持组合法」的边界。
4. **取回后桌面仍整体合法**(`isBoardValid(G)` 为真)—— 这是硬门槛。

**效果:** joker 从桌面回到该玩家手牌;顶替真牌落到 joker 原位;若桌面任一组因此 < 3 或非法 → **拒绝**(no-op,不结束回合,类似 WS-1 `submitMeld` 的非破坏性拒绝)。

## 11.2 取回调参表

| 变量 | 基准值 | 最小 | 最大 | 调参备注 |
|---|---|---|---|---|
| `JOKER_RETRIEVE_REQUIRES_MELD_SAME_TURN` | `[PLACEHOLDER] true` | — | — | 是否要求「取回 joker 的同一回合必须再用它出牌」(经典规则常见限制,防止纯薅 joker)。默认 true。 |
| `JOKER_RETRIEVE_TILES_NEEDED` | `[PLACEHOLDER] 1` | 1 | 2 | 顶替所需真牌数(见 §11.1 待核实)。 |

## 11.3 Joker 计分按代表值

- **桌面/庆祝计分:** 修 `moves.js:237` —— `lastPlay.points` 里 joker 不再记 0,而是按**代表值**计:freeze 时(`freezeJokersInRun/Group`,`util.js:158-240`)已把 joker `setTileValue` 成代表值,因此在 freeze **之前**先用同样规则求出代表值并计入 `points`(与 §9 同一「freeze 前计算」窗口)。
- **终局手牌罚分:** 维持 joker = 30 分(`util.js:319,341`),**不改** —— 这是「别把 joker 留手上」的压力来源,与「桌面 joker 按代表值庆祝」并不冲突。

## 11.4 体验目标 / 失败态 / 验收

- **体验目标:** joker 成为高技巧、高戏剧性的「大摆动」操作,而非死机制(review-1 Finding 3)。
- **失败态:** 取回后桌面出现非法组却放行(必须 `isBoardValid` 把关);joker 庆祝仍显示 0 分。
- **调参杠杆:** §11.2 两个开关。
- **验收:** Jest:拥有匹配真牌且取回后桌面合法 → 成功;否则拒绝;joker 以代表值计入 `lastPlay.points`(spec WS-11 验收)。

---

# WS-12 · 断线弃权的玩法规则

> **架构前置(spec WS-12,已核实):** `onTurnBegin` 拿不到 `matchData/isConnected`(`moves.js:259-268`);连线状态需经服务器可信中间件/插件镜像进**权威 `G`**(如 `G.connected[seat]`),**绝不信客户端上报的连线 flag**。下列为玩法层规则,落地在该 spike 之后。

## 12.1 玩法规则

| 阶段 | 规则 |
|---|---|
| **宽限期(grace)** | 当 `G.connected[currentPlayer] === false`,把该座位的 `timerExpireAt` 折叠为 `getSecTs() + DISCONNECT_GRACE`(远短于 `timePerTurn`),让其回合**快速自动抽牌并轮转**,而非全场枯等 10–60s(review-1 Finding 6)。 |
| **连续 N 回合后弃权** | 某座位**连续** `FORFEIT_AFTER_TURNS` 个本人回合都处于断线(用权威 `G.connected` + 一个 `G.missedTurns[seat]` 计数器),触发**自动弃权**:该座位移出轮转,其余玩家继续。 |
| **(可选)投票跳过** | 在自动弃权前,允许主机/多数玩家手动 vote-to-skip 该断线座位(spec WS-12)。第一版可只做自动弃权,vote 为 `[PLACEHOLDER]` 增项。 |
| **剩余手牌折算最终分** | 弃权座位的剩余手牌按 `util.js:countPoints` 同规则折算成**负分**计入最终结算(joker=30、其余=牌面值),并把这些分计给当时的赢家/在场玩家。具体归属规则标 `[PLACEHOLDER]`(见调参表)。 |
| **重连** | 若该座位在弃权**之前**重连(`G.connected[seat]` 转 true),清零 `missedTurns[seat]`,恢复正常 `timePerTurn`。弃权后重连不恢复(本局已出局)。 |

## 12.2 调参表(数值全为 [PLACEHOLDER])

| 变量 | 基准值 | 最小 | 最大 | 调参备注 |
|---|---|---|---|---|
| `DISCONNECT_GRACE`(断线座位回合宽限) | `[PLACEHOLDER] 5s` | 3s | 10s | review-1 建议 5s;太短则瞬时网络抖动也被罚,太长则拖慢全场。 |
| `FORFEIT_AFTER_TURNS`(连续断线几回合后弃权) | `[PLACEHOLDER] 3` | 2 | 5 | 该座位连续 N 个本人回合断线即出局。 |
| `FORFEIT_SCORE_MODE`(剩余手牌折算归属) | `[PLACEHOLDER] 'to_table'` | — | — | `to_table`=负分计该玩家、正分均摊给在场玩家;`to_winner`=全给最终赢家。需与现 `countPoints`(`util.js:309`)的零和口径对齐。 |
| `RECONNECT_RESETS_MISSED` | `[PLACEHOLDER] true` | — | — | 弃权前重连是否清零 `missedTurns`。默认 true(对短暂掉线友好)。 |

## 12.3 体验目标 / 输入输出 / 失败态 / 杠杆 / 验收

- **体验目标:** 一个掉线/挂机玩家不再让全场每轮枯等;不惩罚短暂抖动;rage-quit 不毁整局(review-1 Finding 6)。
- **输入:** 权威 `G.connected[seat]`(来自 spike)、`G.missedTurns[seat]`、剩余手牌。
- **输出:** 折叠后的 `timerExpireAt`、弃权事件、最终分折算。
- **失败态:**(a)信任客户端 flag → 被伪造作弊;(b)抖动一次即弃权 → 误伤(用 grace + 连续计数缓冲);(c)弃权折分破坏 `countPoints` 零和口径。
- **调参杠杆:** §12.2 四个变量。
- **验收:** 先出 spike 文档(连线状态如何进权威 `G`);然后 Jest/smoke:断线的当前座位在 grace 窗口内自动轮转,而非等满 `timePerTurn`(spec WS-12 验收)。

---

# 附录 A · 跨 WS 工程依赖(给实现者)

1. **§9 / §11 共享「freeze 前计算」窗口:** manipulation 分(§9.2)与 joker 代表值计分(§11.3)都必须在 `validatePlayerMove`(`moves.js:235`)、`freezeTmpTiles()`(`moves.js:246`)之前完成,并写进 `G.lastPlay`;`G.prevTilePositions` 下回合即被 `onTurnBegin`(`moves.js:267`)清掉。
2. **§9 门控依赖本地 UI 状态:** `resolveJuice`(§9.4)需要 `localSeat` 与 `isDragging`,这些不在 `G` 里 —— 在 `Board.jsx` 的 `lastPlay` effect 里取(review-1 Finding 5 指 ~66-86)。
3. **§12 阻塞于 spike:** 连线状态进权威 `G` 之前,§12 全部规则无法落地(spec WS-12 已降级为架构 spike)。
4. **WS-1(本文未覆盖,但耦合):** §11 取回拒绝、规划模式校验都应复用 WS-1 的「非破坏性拒绝 + 具名 reject code」范式,而非旧的 rollback+罚抽路径。

---

# 附录 B · 开放问题 / 待核实

1. `[待核实]` §11.1:joker 取回到底要 **1 张顶替真牌**还是 **2 张真牌**?review-1 措辞为「the two real tiles」,但经典 Rummikub 多为「用代表的那一张真牌换回」。设计默认 1 张,需产品定。
2. `[待核实]` §11.2:取回 joker 是否强制「同回合必须再用掉它」(`JOKER_RETRIEVE_REQUIRES_MELD_SAME_TURN`)。
3. `[待核实]` §10.1:`playableCount` 是否计入 joker。
4. `[PLACEHOLDER]` §9.3:`W_GROUP/W_INTEG/W_PLACE` 与三个阈值,必须 playtest 校准;唯一硬约束是 §9.2 不等式(1 张 2 组 > 3 张平铺)。
5. `[PLACEHOLDER]` §12.2:`FORFEIT_SCORE_MODE` 折分归属须与 `countPoints`(`util.js:309-329`)零和口径对齐,避免总分不守恒。
6. 决策项(spec Open Q2):combo 采用「manipulation 加权」(本文默认)还是「保留张数但只去掉囤牌激励 + 去掉旁观者 kick」?本文按前者设计,后者可视为把 `W_PLACE` 调高、`W_GROUP/W_INTEG` 调低的退化情形。
