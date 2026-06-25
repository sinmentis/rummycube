# RummyCube · 第三轮 · WS-A combo 调参(earned)· 游戏设计评审报告(review-1 · game-design)

**日期:** 2026-06-25 · **作者:** Game Designer(专家团队) · **针对 spec:** `docs/optimization/2026-06-25-round3-spec.md`(WS-A)
**范围:** 只定 **combo 反馈曲线(权重 / 公式 / 分级阈值 / 调参)** 的设计决策。**不写代码、不改代码。** 仅触 `src/rummikub/juice/comboMath.js` 的纯函数。
**红线(复述,本报告所有建议都服从):** ① 应用内文案保持**英文**(`NICE` / `COMBO` / `ON FIRE` 不变);② **不改 combo 触发管线**——`applyValidMove` 算 `G.lastPlay.combo`、`ComboOverlay` 渲染、`particleCount`/intensity 门控全部原样;③ 不改 Rummikub 规则 / 计分 / 服务器权威;④ 无新依赖;⑤ 动画仍受 `prefers-reduced-motion` 门控。

---

## 0. 核心设计判断(TL;DR)

1. **bug 的本质是「量纲」而非「阈值」**:`manipulationScore = 3*groups + 2*rearranged + 1*placed` 里 `placed`(纯张数)无上限,普通出牌就堆到 7–12,把 3/5/7 的阈值整段淹没。**先修量纲,阈值才有意义。**
2. **推荐方案 = 把 combo 分变成「操作单位计数」**:`W_GROUP = 3`、`W_INTEG = 3`、`W_PLACE = 0`。于是 **`score = 3 × (groups + rearranged)`**——每形成/延伸一个合法组、每重排一张既有牌算「1 个操作单位」,**张数完全不计分**。
3. **分级阈值重设为 3 / 6 / 9**:`NICE`=1 单位、`COMBO`=2 单位、`ON FIRE`=3 单位。语义正好落在 owner 的定义上(`COMBO`=多组或带重排;`ON FIRE`=多组 + 重排)。
4. **纯堆牌再也上不了 ON FIRE 是可证明的**:单组堆牌 `groups=1, rearranged=0` ⇒ `score = 3`(NICE),**与张数 N 无关**;而「多组 + 重排」`groups≥2, rearranged≥1` ⇒ `score ≥ 9`(ON FIRE)。见 §3.3。
5. **触发管线 / ComboOverlay / 粒子门控一行都不用改,且会自然变温和**:本方案刻意保持**小量纲**(可达分 = 3 的倍数 {3,6,9,12,…}),让 ComboOverlay 里**硬编码**的 tier 配色阈值(`>=7 fire / >=5 hot / >=3 warm`)和 Board 的 flash 门控(`n>=3`)继续与新 label 对齐;粒子数 / 抖动 / 音高随分变小而自然降温。详见 §6。
6. **「体量」并没有被埋没**:大牌的体量奖励一直由另一条独立通道 `floatText('+' + lp.points)` 体现(显示 Rummikub 真实点数,随牌面值/张数增长)。把 `W_PLACE` 归零,只是把「体量」从 combo **分级**里拿掉,不是不奖励大牌。

> 一句话:**combo 分级奖励「操作」,`+points` 浮字奖励「体量」,两条通道各司其职。**

---

## 1. 问题确认(已核实)

现状代码:

```js
// src/rummikub/juice/comboMath.js
export const W_GROUP = 3, W_INTEG = 2, W_PLACE = 1;
manipulationScore({groups, rearranged, placed}) = 3*groups + 2*rearranged + 1*placed;
comboLabel(n): n>=7 'ON FIRE' | n>=5 'COMBO' | n>=3 'NICE' | else ''
```

输入口径(来自 `moves.js:303–328` `applyValidMove`,**冻结前**计算):

- `groups` = `getFormedGroups(G)`(`moveValidation.js:184`):**含至少一张本回合新牌(tmp)且合法**的 run/set 数 —— 即本回合形成或延伸的合法组数。任何合法出牌 `groups ≥ 1`。
- `rearranged` = 本回合**位置发生变化的「既有(已结算,非 tmp)」桌面牌**数(`moves.js:323–327`,对照 `prevTilePositions` 基线)—— 即真正的「拆牌重排」操作量。
- `placed` = 本回合从手上落到桌面的 tmp 牌数(`moves.js:321`)—— 纯张数。

**为什么 3/5/7 形同虚设(逐项验证,旧公式):**

| 出牌 | groups | rearr | placed | 旧分 | 旧 label |
|---|---|---|---|---|---|
| 一次摆 4 张单组 | 1 | 0 | 4 | 3+0+4 = **7** | **ON FIRE** |
| 一次堆 7 张单组(纯堆牌) | 1 | 0 | 7 | 3+0+7 = **10** | **ON FIRE** |
| 任意 2 组出牌 | 2 | 0 | 6 | 6+0+6 = **12** | **ON FIRE** |

`placed` 项无封顶、与「组/重排」同量级甚至更大 ⇒ **只要牌一多或组一拼就 ON FIRE**,分级退化成「几乎永远最高档」。这正是 owner 反映的问题。

---

## 2. 设计原则:把 combo 分变成「操作单位」(manipulation unit)

owner 要的是 **earned**:`ON FIRE` 给真正的「拆桌重组」,不是给堆牌。最干净的表达方式 ——

> **每形成/延伸一个合法组 = 1 个操作单位;每重排一张既有牌 = 1 个操作单位;落手牌张数 = 0 个操作单位。combo 分 = 操作单位数 × 3。**

为什么是这个模型:

- **Rummikub 的「技巧」恰恰是 groups + rearranged**:把桌上既有牌拆开、重排,凑出多组新牌 —— 这才是高光时刻。张数多只代表「手里牌多」,不代表操作漂亮。owner 原话:`ON FIRE` 只给「genuine board manipulation」,不给「raw tile-dump volume」。
- **`W_GROUP == W_INTEG` 让量纲是「3 的倍数」**:可达分严格落在 {3, 6, 9, 12, …},分级边界永远落在台阶之间,**不会出现 ComboOverlay 硬编码 tier(3/5/7)与新 label 脱锚的「夹缝分值」**(见 §6.1 论证)。这是「只改 comboMath、其它消费点不动」能成立的关键。
- **`W_PLACE = 0` 是「张数不再驱动庆祝」最强、最可证明的写法**:堆牌 N 张,combo 分恒为 3,与 N 无关 —— 纯堆牌**结构上不可能**爬到 COMBO/ON FIRE。

---

## 3. 重平衡 `manipulationScore`(deliverable #1)

### 3.1 新权重与公式(推荐)

```js
// src/rummikub/juice/comboMath.js —— 仅改这 3 个常量(纯函数,签名不变)
export const W_GROUP = 3; // 每形成/延伸一个合法 run/set:1 个操作单位
export const W_INTEG = 3; // 每重排一张既有(已结算)牌:1 个操作单位(== W_GROUP)
export const W_PLACE = 0; // 张数不计分;体量由 +points 浮字另行体现

export function manipulationScore({groups = 0, rearranged = 0, placed = 0} = {}) {
    return W_GROUP * groups + W_INTEG * rearranged + W_PLACE * placed;
    // ≡ 3 * (groups + rearranged)
}
```

- `manipulationScore` **签名不变**(仍收 `{groups, rearranged, placed}`),`moves.js:328` 调用点**零改动**;`placed` 形参保留(`W_PLACE=0` 时不生效,留作调参旋钮)。
- `particleCount` / `countPlacedThisTurn` / `submitComboCount` **不动**。

### 3.2 量纲一览(操作单位 → 分 → 档)

| 操作单位 `g+r` | combo 分 | 典型出牌 | label |
|---|---|---|---|
| 1 | 3 | 单组出牌(含任意张数堆牌、1 张接龙) | **NICE** |
| 2 | 6 | 两组 **或** 一组 + 一次重排 | **COMBO** |
| 3 | 9 | 多组 + 重排 / 三组 / 重度重排 | **ON FIRE** |
| 4+ | 12+ | 大型拆桌重组 | **ON FIRE** |

### 3.3 关键证明:堆牌上不去、操作上得去(deliverable #1 要求)

**命题 A —— 任意张数的单组堆牌,封顶在 NICE。**
对纯堆牌:`groups = 1, rearranged = 0, placed = N`(任意 `N ≥ 1`):

```
score = 3·1 + 3·0 + 0·N = 3   （与 N 无关）
```

单组、无重排出牌的**全集**满足 `groups=1, rearranged=0`,其分恒为 `3`。
`3 < 6 = COMBO 阈值 < 9 = ON FIRE 阈值` ⇒ **纯张数永远到不了 COMBO,更到不了 ON FIRE。∎**

> 更一般地:任何 `W_PLACE = 0` 的设定下,`max(单组无重排出牌的分) = W_GROUP = 3`,是个与张数无关的**常量上界**;只要它 `< ON FIRE 阈值`,堆牌就不可能 ON FIRE。若改用「封顶」写法(备选方案 §8),对应上界为 `W_GROUP + W_PLACE·PLACED_CAP`,同样必须 `< ON FIRE 阈值`。

**命题 B —— 多组 + 重排,必达 ON FIRE。**
对「多组 + 重排」:`groups ≥ 2, rearranged ≥ 1`:

```
score = 3·groups + 3·rearranged ≥ 3·2 + 3·1 = 9 = ON FIRE 阈值   ⇒ ON FIRE。∎
```

两条命题合起来:**combo 分级只由「操作」决定,与「体量」解耦** —— 正是 owner 要的 earned 曲线。

---

## 4. 重设 `comboLabel` 阈值(deliverable #2)

### 4.1 新阈值(推荐 3 / 6 / 9)

```js
export function comboLabel(n) {
    if (n >= 9) return 'ON FIRE'; // 3 操作单位:多组 + 重排 / 三组 / 重度重排
    if (n >= 6) return 'COMBO';   // 2 操作单位:第二个组 或 一次重排
    if (n >= 3) return 'NICE';    // 1 操作单位:扎实的单组出牌(含任意堆牌)
    return '';                     // 理论上出不现(合法出牌 groups≥1 ⇒ 分≥3)
}
```

语义对齐 owner deliverable #2 的定义:

- **NICE = 扎实的普通出牌**:单组、无重排(占绝大多数出牌,包括大堆牌)。
- **COMBO = 多组 或 带重排**:两组(6)/ 一组 + 一次重排(6)—— 字面命中 owner「multi-group **or** a play with rearrangement」。
- **ON FIRE = 明显的大操作**:多组 **且** 重排(9)/ 三组(9)/ 一组 + 两次重排(9)—— 命中 owner「multiple groups formed **+** tiles rearranged」。

### 4.2 为什么是 3/6/9,以及「3/5/7 与之等价」的安全说明

- 推荐 **3/6/9** 是因为它**自解释**:每升一档 = 多一个操作单位 = +3 分,阈值与台阶一一对应,未来微调权重时含义清晰。
- 在本方案的可达分集合 `{3, 6, 9, 12, …}` 上,**阈值 3/6/9 与现状的 3/5/7 给出完全相同的 label**(3→NICE、6→COMBO、9→ON FIRE;中间的 4/5/7/8 永不出现)。因此:
  - 若希望**改动面再小一点**,保留现状 `3/5/7` 也是**零行为差异**的合法选择(且现有 `comboLabel tiers at 3/5/7` 单测原样全绿)。
  - 若采用 `3/6/9`,只需把该单测的中间断言改成 3/6/9 边界(见 §9)。
- **务必成对理解**:阈值之所以能自由在 3/5/7 ↔ 3/6/9 之间选,前提是**量纲被锁成 3 的倍数**(即 `W_GROUP==W_INTEG` 且 `W_PLACE==0`)。一旦偏离这个前提(例如给 `W_PLACE>0` 或 `W_INTEG≠W_GROUP`),分值会落进 4/5/7/8 等「夹缝」,就可能与 ComboOverlay 的硬编码 tier 脱锚 —— 那时必须改用备选方案 §8 的配套阈值。

---

## 5. 出牌场景矩阵:旧 label vs 新 label(deliverable #3)

> 旧 = `W_GROUP3 / W_INTEG2 / W_PLACE1`(无封顶)+ 阈值 3/5/7。
> 新 = 推荐方案 `W_GROUP3 / W_INTEG3 / W_PLACE0` + 阈值 3/6/9。

| # | 出牌场景 | groups | rearr | placed | 旧分 | 旧 label | 新分 | 新 label |
|---|---|---|---|---|---|---|---|---|
| 1 | 1 张接龙(延伸既有组) | 1 | 0 | 1 | 4 | NICE | **3** | **NICE** |
| 2 | 3 张接龙 / 首出单组 meld | 1 | 0 | 3 | 6 | COMBO | **3** | **NICE** |
| 3 | 一次摆 4 张单组 | 1 | 0 | 4 | 7 | 🔥 ON FIRE | **3** | **NICE** |
| 4 | 一次摆 5 张单组 | 1 | 0 | 5 | 8 | 🔥 ON FIRE | **3** | **NICE** |
| 5 | **一次堆 7 张单组(纯堆牌)** | 1 | 0 | 7 | 10 | 🔥 ON FIRE | **3** | **NICE** |
| 6 | 2 组出牌(run + set) | 2 | 0 | 6 | 12 | ON FIRE | **6** | **COMBO** |
| 7 | 外科手术式:1 张同时凑成 2 组 | 2 | 0 | 1 | 7 | ON FIRE | **6** | **COMBO** |
| 8 | 3 张出牌 **+ 1 次桌面重排** | 1 | 1 | 3 | 8 | ON FIRE | **6** | **COMBO** |
| 9 | 2 组 **+ 1 次重排**(中型操作) | 2 | 1 | 4 | 12 | ON FIRE | **9** | **🔥 ON FIRE** |
| 10 | 大操作:3 组 + 重排 4 张 | 3 | 4 | 5 | 22 | ON FIRE | **21** | **🔥 ON FIRE** |

**读这张表:**

- **旧曲线**:10 行里 **8 行 ON FIRE**(含「4 张单组」「7 张纯堆牌」),分级几乎不分级 —— 与 owner 反映一致。
- **新曲线**:**5 行 NICE(全部单组/无重排,含第 5 行纯堆牌)、3 行 COMBO、2 行 ON FIRE**。
  - **第 5 行(纯堆牌)从 ON FIRE 降到 NICE** —— deliverable #1 的硬指标达成。
  - **第 9 行是 COMBO→ON FIRE 的分水岭**:在「2 组」之上再叠「1 次重排」,才点燃 ON FIRE。**「多组」单独只到 COMBO(第 6 行),必须再加「重排」才 ON FIRE** —— 精确对上 owner「multiple groups **+** rearranged」。
  - **第 7 行(外科手术 1 张凑 2 组)= COMBO = 6 > 第 5 行堆牌 NICE = 3**:漂亮的小操作仍然**压过**大堆牌 —— 这正是 `comboMath.js` 顶部注释最初想要、但被旧 `W_PLACE` 破坏的目标,现在被正确实现并分级。

---

## 6. 消费点分析:确认「只动 comboMath 纯函数」(deliverable #4)

实时庆祝读的「原始分」是 `G.lastPlay.count = manipulationScore(...)`(`moves.js:328–331`),在客户端是 `Board.jsx:141` 的 `const n = lp.count`。下面把**所有**读取 `n`(原始分)或 label 的消费点分三类,逐一确认**不需要改、且会自然降温**。

### 6.1 A 类:读「原始分」+ **硬编码阈值**(改量纲会脱锚 → 本方案刻意保持对齐,故不改)

| 消费点 | 位置 | 硬编码逻辑 | 新方案下是否仍自洽 |
|---|---|---|---|
| ComboOverlay tier 配色 | `ComboOverlay.jsx:6` | `n>=7?'fire':n>=5?'hot':n>=3?'warm':'base'` → 驱动 `.combo-fire/hot/warm` CSS(`board.css:1158–1160`) | ✅ 可达分 {3,6,9,…}:3→warm(配 NICE 金)、6→hot(配 COMBO 橙)、9+→fire(配 ON FIRE 红)。**tier 与 label 永远同档**(详见下方论证) |
| Board flash 门控 | `Board.jsx:153` | `if (g.flash && n >= 3)` 自家出牌闪金光,否则 confetti | ✅ 合法出牌最小分 3 ⇒ 自家每次出牌仍闪光,**行为不变**(本就「每次有效出牌一闪」) |

**为什么 ComboOverlay 的 tier(3/5/7)不会与新 label(3/6/9)打架** —— 因为新公式的**可达分只有 3 的倍数**:

| 可达分 n | ComboOverlay tier(硬编码 3/5/7) | comboLabel(新 3/6/9) | 是否同档 |
|---|---|---|---|
| 3 | `warm` | `NICE` | ✅ |
| 6 | `hot`(≥5) | `COMBO`(≥6) | ✅ |
| 9 | `fire`(≥7) | `ON FIRE`(≥9) | ✅ |
| 12+ | `fire` | `ON FIRE` | ✅ |

会让两者打架的「夹缝分值」是 4/5/7/8 —— 而 `score = 3·(g+r)` **永远生成不出这些值**。所以 tier 配色与 label 在所有真实出牌上严格一致,**ComboOverlay.jsx 一行都不用改**。

> ⚠️ 这条等价**依赖**「量纲是 3 的倍数」。若日后偏离推荐权重(`W_PLACE>0` 或 `W_INTEG≠W_GROUP`)而产生 4/5/7/8 等分值,ComboOverlay 的硬编码 tier 就会与 label 脱锚(例如 7 分会显示红色 `fire` 但 label 仍 `COMBO`)。届时要么把量纲重新对齐、要么连带调 `ComboOverlay.jsx:6` 与 `Board.jsx:153`(已超出 WS-A「只改 comboMath」范围,须另开工作项)。

### 6.2 B 类:读「原始分」+ **连续强度**(分数变小 → 自然降温,无需改)

| 消费点 | 位置 | 公式 | 普通出牌(n=3) | 大操作(n=9–21) |
|---|---|---|---|---|
| confetti 粒子数 | `effects.js:13` | `min(particleCount('balanced')=18 + n*2, 80)` | 24 粒 | 36–60 粒 |
| confetti 初速 | `effects.js:19` | `26 + min(n,8)*2` | 32 | 42(封顶) |
| 屏幕抖动幅度 | `effects.js:40` | `min(3 + n, 9) * scale` | 6px | 9px(封顶) |
| 落子音高 | `sfx.js:69`(`place(n)`) | `150 + min(n,10)*26` | 228Hz | 384–410Hz(封顶) |
| Overlay `×{n}` 数字 | `ComboOverlay.jsx:12` | 直接显示 n | ×3 | ×9–×21 |

旧曲线下普通出牌 `n` 常年 7–12,把这些连续强度**长期顶满**;新曲线把普通出牌压到 `n=3`,**粒子更少、抖动更轻、音更低、数字更小** —— overlay 与粒子**自然变温和**,且**完全无需改动 `effects.js` / `sfx.js`**。这就是 spec 说的「随阈值自然变温和」。

### 6.3 C 类:与本方案无关 / 不读操作分

- **`floatText('+' + lp.points)`(`Board.jsx:156`)**:显示的是 `lp.points`(Rummikub 真实点数 = 牌面值之和,`moves.js:317`),**随体量增长**。这是「体量」的**独立反馈通道**,所以把 `W_PLACE` 归零**不会**让大牌「没有奖励」,只是把体量从 combo 分级里剥离。(设计上正确:分级讲「操作」,浮字讲「点数」。)
- **`countPlacedThisTurn` / `submitComboCount`(`comboMath.js:25–31`)**:`countPlacedThisTurn` 只在 `Board.jsx:345` 的**非法提交回弹**路径用(固定 `fx.kick(6)`/`buzz`,与档位无关);`submitComboCount` 仅被单测引用,**不参与** `G.lastPlay.count` 实时量纲。两者**不受影响、无需改**。

### 6.4 触点确认(deliverable #4 收口)

- ✅ **只改 `src/rummikub/juice/comboMath.js`**:`W_GROUP/W_INTEG/W_PLACE` 三个常量 + `comboLabel` 阈值。`manipulationScore` 签名不变。
- ✅ **零改动**:`moves.js`(`applyValidMove` 调用点)、`ComboOverlay.jsx`、`Board.jsx`、`effects.js`、`sfx.js`、`gating.js`、`board.css`。
- ✅ **触发管线**(`applyValidMove` 算分 → `G.lastPlay` → 各客户端按 `ts` 庆祝)、**intensity 门控**(`resolveJuice`)、**reduced-motion 门控**全部原样。

---

## 7. 可调参数表(default / min / max / 一行 rationale,均 playtest-tunable)

| 参数 | 默认 | min | max | 一行 rationale |
|---|---|---|---|---|
| `W_GROUP` | **3** | 2 | 5 | 每形成/延伸一合法组的「操作单位」分;主信号。改它会整体平移量纲,须连带核对阈值 |
| `W_INTEG` | **3** | 2 | 5 | 每重排一张既有牌的「操作单位」分;**保持 == `W_GROUP`** 才有「3 的倍数」干净量纲与 overlay 对齐 |
| `W_PLACE` | **0** | 0 | 1 | 每张手牌分;**0 = 体量与庆祝解耦(推荐)**;>0 会让纯堆牌重新爬分,**仅在配 `PLACED_CAP` 时使用**(见 §8) |
| `PLACED_CAP` | —(W_PLACE=0 时不适用) | 1 | 2 | 仅当 `W_PLACE>0`:封顶张数贡献;**须 `W_PLACE·CAP < W_INTEG`**,保证「一次重排 > 顶格张数」 |
| `comboLabel` NICE 阈值 | **3** | 3 | 3 | = 1 操作单位 = `W_GROUP`;锚定「每次合法出牌至少 NICE」,不建议动 |
| `comboLabel` COMBO 阈值 | **6** | 5 | 6 | = 2 操作单位;`6` 贴新量纲,`5` 与 overlay `hot` 边界对齐(对可达分二者等价) |
| `comboLabel` ON FIRE 阈值 | **9** | 7 | 9 | = 3 操作单位;`9` 贴新量纲,`7` 与 overlay `fire` 边界对齐(对可达分二者等价) |

**调参心法(playtest 时怎么动):**

- 觉得 **ON FIRE 太罕见** → 不要降 ON FIRE 阈值(会脱锚),而是把它的**触发条件**放宽:保持 9,但因为「3 组无重排 = 9」已能 ON FIRE,实际并不罕见;真要更慷慨,可考虑 `W_INTEG=3` 不变、把 ON FIRE 看作「2 组 + 1 重排」即点燃(现状已是)。
- 觉得 **COMBO 太频繁**(2 组出牌太常见)→ 这是 Rummikub 中后期的正常高光,COMBO 合适;若仍嫌多,可把「单纯 2 组」留在 COMBO、把 ON FIRE 维持在「必须带重排」(现状即如此),不必动数值。
- **先动权重、后动阈值**:阈值是「量纲的解释」,权重是「量纲本身」。任何阈值改动都要回到 §6.1 检查与 ComboOverlay tier 是否仍对齐。

---

## 8. 备选方案:封顶张数(若想保留一点「体量手感」)

owner spec 把 `min(placed, PLACED_CAP)` 与「降 `W_PLACE`」并列为候选。若团队**希望大牌比 1 张接龙在 `×n` / 粒子上略有区别**(一点体量纹理),可改用**封顶**写法:

```js
export const W_GROUP = 2, W_INTEG = 2, W_PLACE = 1; export const PLACED_CAP = 2;
manipulationScore = 2*groups + 2*rearranged + 1*min(placed, PLACED_CAP);
// 阈值必须保持 3 / 5 / 7(不可用 3/6/9)
```

效果(同 §5 场景):1 张接龙=3、3–7 张单组堆牌=**4(封顶)**、2 组=6、1 组+1 重排=6、大操作≥7。**label 分档与推荐方案逐行一致**,仅多了「堆牌 ×4 vs 接龙 ×3」的细微纹理。

**代价 / 注意(为什么不作为首选):**

1. **必须用阈值 3/5/7、不能用 3/6/9** —— 因为封顶后分值会出现 4/5/7/8 等夹缝,只有 3/5/7 能与 ComboOverlay 硬编码 tier **逐值对齐**(`comboLabel` 与 tier 同用 3/5/7 即天然一致)。
2. **`W_GROUP` 必须降到 2** —— 否则 `W_GROUP=3` + 任意 `+1` 张数会把「2 组(6)」顶到 7 = ON FIRE,破坏「多组单独只到 COMBO」。这与 owner spec 表里「`W_GROUP` 维持/上调」的倾向相左。
3. 多一个常量 `PLACED_CAP`、量纲不再是「3 的倍数」那么自解释。
4. **堆牌上界**变为 `W_GROUP + W_PLACE·PLACED_CAP = 2 + 2 = 4 < 7`(命题 A 仍成立,堆牌封顶 NICE)。

> 结论:**推荐 §3 的 `W_PLACE=0`**(更简单、更可证、与 owner「W_PLACE→0、W_GROUP 维持」倾向一致、且 `+points` 浮字已承担体量反馈);封顶方案作为「想要体量纹理」时的备选,代价是失去「3 的倍数」干净量纲并需绑定阈值 3/5/7。

---

## 9. 测试影响(WS-A「纯单测」交付)

`src/tests/comboMath.test.js`:

- **需改**(权重变了,数值断言要更新):
  - `manipulationScore({groups:2, rearranged:0, placed:1})` 现断言 `7` → 新值 **6**(`3*2`)。
  - `manipulationScore({groups:1, rearranged:0, placed:3})` 现断言 `6` → 新值 **3**(`3*1`)。
  - 两条 `toBeGreaterThan` 仍**绿**(`6 > 3`、`3+9=12 > 3`),但语义变了,建议补注释。
- **`comboLabel` 测试**:
  - 若采用推荐的 **3/6/9** → 改中间断言为 `comboLabel(5)='NICE'`、`comboLabel(6)='COMBO'`、`comboLabel(8)='COMBO'`、`comboLabel(9)='ON FIRE'`。
  - 若选择**保留 3/5/7**(§4.2 等价方案)→ 该测试**原样全绿**,无需改。
- **新增**(deliverable #3 矩阵转测试):把 §5 的 9–10 行参数化,断言落入预期分级;**专门加一条**:对 `placed ∈ {4,7,13}` 的单组堆牌(`groups:1, rearranged:0`)断言 `comboLabel(manipulationScore(...)) !== 'ON FIRE'`(且 `=== 'NICE'`)—— 锁死「堆牌不再 ON FIRE」回归。

无其它测试受影响(grep 确认 `comboLabel` / `lastPlay.count` 无快照测试涉及 tier 配色;`submitComboCount` 仅本测试文件引用)。

---

## 10. 实施清单 / 不变量(交付给前端 / implementer)

**改(仅此)** —— `src/rummikub/juice/comboMath.js`:

1. `W_GROUP = 3`、`W_INTEG = 3`、`W_PLACE = 0`(`manipulationScore` 函数体 / 签名不变)。
2. `comboLabel` 阈值 → `9 / 6 / 3`(或保留 `7 / 5 / 3` 等价,见 §4.2)。
3. 更新 §9 的单测 + 新增堆牌回归断言。

**不改(红线):** `moves.js`(`applyValidMove` 调用点)、`ComboOverlay.jsx`(硬编码 tier 靠小量纲自洽)、`Board.jsx`(flash 门控 `n>=3` / `place(n)` / `burstAt` / `kick`)、`effects.js`、`sfx.js`、`gating.js`、`board.css`。

**不变量:**

- 触发管线不变:`applyValidMove` 仍在冻结前算 `G.lastPlay.count = manipulationScore(...)`;每客户端按 `ts` 庆祝;intensity / reduced-motion 门控不动。
- 服务器权威 / 计分 / Rummikub 规则不变;`+points` 浮字(体量通道)不变。
- 应用内文案英文(`NICE` / `COMBO` / `ON FIRE`);无新依赖;`manipulationScore` 签名稳定 ⇒ 调用方零改动。

---

### 附:推荐改动后的 `comboMath.js` 关键片段(参考,勿直接当 patch,以 implementer 落地为准)

```js
export const W_GROUP = 3; // 1 个操作单位 / 形成或延伸的合法组
export const W_INTEG = 3; // 1 个操作单位 / 重排的既有牌(== W_GROUP)
export const W_PLACE = 0; // 张数不计分;体量由 +points 浮字体现

export function manipulationScore({groups = 0, rearranged = 0, placed = 0} = {}) {
    return W_GROUP * groups + W_INTEG * rearranged + W_PLACE * placed; // ≡ 3*(groups+rearranged)
}

export function comboLabel(n) {
    if (n >= 9) return 'ON FIRE'; // ≥3 操作单位
    if (n >= 6) return 'COMBO';   // 2 操作单位
    if (n >= 3) return 'NICE';    // 1 操作单位
    return '';
}
```
