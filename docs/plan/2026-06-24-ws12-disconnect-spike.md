# WS-12 断线处理架构 Spike(S3-U6)

> 目标:确认 **如何把玩家连接状态写入权威 boardgame.io game state(`G`)**,使得断线座位的回合能被提前推进、并触发 vote-skip / forfeit。
> 形态:**研究 + 决策文档,不改任何源码**。所有结论基于 `node_modules/boardgame.io@0.50.2` 实际安装代码,均给出路径引用。
> 结论先行:**GO**(本 Sprint 可实现 WS-12 / S3-U7),推荐 **方案 C**(自定义 transport + master 子类代发内部 `_setConnection` move)。下文给出可行性证据、落地草图、风险与 `[PLACEHOLDER]/待核实` 清单。

---

## 0. 版本与问题复述

- 安装版本:`boardgame.io@0.50.2`(`node_modules/boardgame.io/package.json`)。
- 现状(已核实):
  - `onTurnBegin({G, ctx})`(`src/rummikub/moves.js:301-311`)**拿不到** `matchData` / `isConnected`,无法在 move 内判断座位是否断线。
  - `isConnected` 只是 boardgame.io 的 **match metadata**,服务器在连接变化时写入,仅供 UI 消费(`src/rummikub/components/PlayerAvatar.jsx:35,40`;`src/rummikub/components/Board.jsx:447`;`src/rummikub/components/TableSeats.jsx:28`)。它**不在权威 `G` 里**。
  - 框架写 metadata 的唯一位置:`Master.onConnectionChange` → `metadata.players[playerID].isConnected = connected`(`node_modules/boardgame.io/dist/cjs/server.js:3637`,镜像于 `master-9bf9c1d4.js:282`)。**该函数完全不触碰 `G`。**
- 全局约束(`global-constraints.md`):服务端权威不可回退;**绝不信任客户端上报的连接标志**;`forceEndTurn` 到点守卫(`moves.js:148-150`)不可放宽。因此 `G.connected` 的真值**只能由服务端传输层写**。

---

## 1. boardgame.io 0.50 的连接事件链路(已核实)

服务端 SocketIO transport(`server.js:3818` `class SocketIO`)在每个游戏 namespace 上注册连接处理:

```
nsp.on('connection', (socket) => {
  socket.on('sync',  ...) → master.onSync(...) → master.onConnectionChange(matchID, playerID, credentials, true)   // server.js:3917
  socket.on('disconnect', ...) → master.onConnectionChange(matchID, playerID, credentials, false)                   // server.js:3925
})
```

- **连接捕获点确实存在且在服务端**:`socket.on('disconnect')`(`server.js:3919-3927`)与 `socket.on('sync')`(`server.js:3905-3918`)。它们用 `this.clientInfo`(socketID → {matchID, playerID, credentials})还原座位身份(`server.js:3833,3920-3923`)。
- 这些 handler 内部 `new Master(game, app.context.db, TransportAPI(...), app.context.auth)` 是**硬编码**实例化(`server.js:3924`),`Master` 类不是 transport 的可配置项 → 想换 Master 行为必须**子类化 SocketIO 并改写 `init`**(详见 §3)。
- `Server({ transport })` **支持注入自定义 transport**:`server.js:3994` 函数签名含 `transport`,`server.js:4003-4004` 仅在未传时才 `new SocketIO()`。`SocketIO` 已 `exports.SocketIO`(`server.js:4072`),`Master` 已 `exports.Master`(`master.js:18`)。**两者都可被子类化注入,无需 fork。**

### 服务端能否在连接事件里改写权威 `G`?——能

`Master.onUpdate`(`server.js:3407-3512`)已经演示了完整链路,可在 transport override 内复用同一套 API:

```
fetch state (storageAPI.fetch)                         // server.js:3431-3436
→ CreateGameReducer({game})                            // server.js:3446
→ redux.createStore(reducer, state, middleware)        // server.js:3450
→ store.dispatch(action); state = store.getState()     // server.js:3494-3495
→ transportAPI.sendAll({type:'update', args:[matchID,state]})  // server.js:3508-3511
→ storageAPI.setState(key, stateWithoutDeltalog, deltalog)     // server.js:3513,3571
```

`action` 由 `makeMove(type, args, playerID, credentials)` 构造(`turn-order-4ab12333.js:42-45`,`exports.makeMove` at `:1124`)。
**所以:服务端可以在 `onConnectionChange` 里,用同样的 reducer + setState 流程,代发一个 `_setConnection(seat, connected)` move,把 `G.connected[seat]` 写进权威 state,并广播 `update` + 落 FlatFile。** 这正是方案 C。

### 关键前置:`activePlayers: {all: NULL}` 让任意座位都"active"

`onUpdate` 对所有 action 强制校验 `this.game.flow.isPlayerActive(G, ctx, playerID)`(`server.js:3469`)。本游戏 `turn.activePlayers: {all: Stage.NULL}`(`src/rummikub/Game.js:81`)使**每个座位每回合都 active**——所以"为断线座位代发 move"即便它不是 `currentPlayer` 也能通过 active 校验。这是方案 C 能成立的核心条件(若改成只有当前玩家 active,断线座位的 move 会被拒)。

---

## 2. 三个候选方案的可行性(0.50 实测)

| 方案 | 连接事件捕获点 | 写 `G` 机制 | 0.50 可行? | 服务端可信? | 评级 |
|---|---|---|---|---|---|
| **A. Koa/socket 中间件直接改写 G** | `server.app.use`(`src/server.js:25`)拦不到 socket 级 connect/disconnect(Koa 中间件只见 HTTP 请求);真正的 disconnect 事件在 SocketIO 层(`server.js:3919`) | 绕过 reducer 直接 `db.setState` | 勉强(侵入式) | 是 | **兜底** |
| **B. boardgame.io plugin** | **无**。插件钩子只有 `setup / action / api / fnWrap / flush / noClient / playerView`(`turn-order-4ab12333.js:182,361,366,393,434,472-477`),**没有任何连接事件钩子**。插件只在 move/event 经过 reducer 时被触发(`ProcessAction` `turn-order:477-485`) | `fnWrap` 注入 / `action` 钩子 | **否(不单独成立)** | — | **否** |
| **C. 自定义 transport + Master 子类,代发内部 move** | `socket.on('disconnect'/'sync')` → `onConnectionChange`(`server.js:3919-3927`),override 之 | 复用 `onUpdate` 的 reducer→dispatch→setState 流程代发 `_setConnection`(`server.js:3446-3513`) | **是** | 是 | **首选** |

要点:
- **方案 B 直接出局**:插件 API 在 0.50 里**完全没有连接事件入口**,它永远拿不到 socket 的 connect/disconnect,必须由 A 或 C 喂数据。插件只能作为"把 `G.connected` 映射进 ctx/player view"的**辅助**,不是捕获点。
- **方案 A 可行但侵入**:Koa 中间件位于 HTTP 层,看不到 socket 断开;要捕获断开仍得碰 SocketIO 内部。即便捕获到,绕过 reducer 直接 `setState` 会**跳过 action log / immer / 广播**,与框架内部状态机和重连同步容易脱节。留作兜底。
- **方案 C 最贴合框架**:连接事件→标准 action→reducer→log/广播/持久化全自洽,与 boardgame.io 的数据流一致(这与 backend-architect 文档 `2026-06-20-plan-02-backend-architect.md:272,276` 的"方案 D 代发内部 system move"是同一思路,本 spike 已用实际代码逐行验证其可行)。

---

## 3. 推荐方案 C — 落地草图

### 3.1 连接事件在哪里被捕获

子类化 `SocketIO` 与 `Master`,经 `Server({ transport })` 注入(`src/server.js:13` 当前 `Server({games, apiOrigins, origins})`):

```
class ConnAwareMaster extends Master {                    // import { Master } from 'boardgame.io/dist/cjs/master.js'
  async onConnectionChange(matchID, playerID, credentials, connected) {
    const res = await super.onConnectionChange(...);       // 1) 保留原 metadata.isConnected 行为 (server.js:3637)
    if (res && res.error) return res;
    await this._dispatchSetConnection(matchID, playerID, credentials, connected); // 2) 额外写 G
    return res;
  }
  async _dispatchSetConnection(matchID, playerID, credentials, connected) {
    // 复刻 onUpdate 的 fetch→reducer→dispatch→setState→sendAll (server.js:3431-3513)
    // action = makeMove('_setConnection', [connected], playerID, credentials)
    // stateID 取自刚 fetch 的 state._stateID(或把 move 标 ignoreStaleStateID 走 long-form)
  }
}

class ConnAwareSocketIO extends SocketIO {                 // import { SocketIO } from 'boardgame.io/dist/cjs/server.js'
  // override init():复制 server.js:3879-3935 的 ~35 行 namespace 接线,
  // 仅把两处 `new Master(...)`(:3911,:3924)换成 `new ConnAwareMaster(...)`,
  // 并把 disconnect/sync 里的连接处理 add 进 this.getMatchQueue(matchID)(:3941)以串行化。
}
// src/server.js: const server = Server({ games:[Rummikub], origins, apiOrigins, transport: new ConnAwareSocketIO() });
```

> `init` 没有更细的钩子(整段 namespace 接线是一个方法,`server.js:3879`),所以**必须复制约 35 行接线**——这是方案 C 唯一的维护成本(随 0.50 升级需对照)。

### 3.2 内部 move `_setConnection` 如何写权威 `G`(且保持服务端权威)

`Game.js` 注册(顶层 `moves`,从而在 `play` 阶段可用;`play` 阶段无 `moves` override,继承顶层 —— `Game.js:61-63`):

```
_setConnection: ({ G, ctx, playerID }, connected) => {
  // 反作弊:只允许调用者写"自己座位"的 flag。客户端即便伪造该 move,
  // 至多改自己——而真正断开/重连由服务端 socket 事件强制覆盖(server.js:3919/3917),
  // 故权威真值仍来自传输层,不依赖客户端诚实(满足 global-constraints"绝不信客户端连接标志")。
  G.connected[playerID] = connected;
  if (!connected) G.disconnectTurns[playerID] = (G.disconnectTurns[playerID] ?? 0);
}
```

- `setup` 增初值(`Game.js:35-47`):`connected: Array(numPlayers).fill(true)`、`disconnectTurns: Array(numPlayers).fill(0)`。
- **服务端权威保证**:授权真值的触发源是 socket 的 `disconnect`/`sync` 事件(服务端,`server.js:3919/3917`),不是客户端。`_setConnection` 即便公开,客户端最多改**自己**座位——把自己标"断线"只会让自己回合更快被推进(自损,非作弊);标"在线"则会被真实 socket 事件覆盖。故无须为它发明"服务端专用 action 通道"(0.50 **没有**这种通道——transport 代发的 action 与客户端经 `socket.on('update')` 发来的 action 在 master 看来无法区分,见 §5 风险)。

### 3.3 持久化与重连如何自洽

- 代发走的是标准 `setState`(`server.js:3513,3571`),`G.connected` 进 **action log + FlatFile**(`storageAPI.setState`,同步存储 `isSynchronous` 分支 `server.js:2519,2563`)。
- 重连:客户端 `sync` → `master.onSync` 返回最新 state(`server.js:3589-3599`),`G.connected` 随权威 state 一起回放,**重连后 state 自洽**;紧接着 `onConnectionChange(...,true)`(`server.js:3917`)再代发 `_setConnection(seat,true)` 把座位标回在线。
- 与 WS-13 FlatFile 持久化天然合排:重启 / redeploy 后进行中对局可被重新 `sync`,`G.connected` 与 log 一致存活。

### 3.4 `onTurnBegin` 如何塌缩断线座位的宽限期 + N 回合 forfeit/vote-skip

在 `src/rummikub/moves.js:301-311` `onTurnBegin` 内(读权威 `G`,无需 metadata):

```
function onTurnBegin({ G, ctx, events }) {
  const seat = ctx.currentPlayer;
  if (G.connected[seat] === false) {
    G.timerExpireAt = getSecTs() + GRACE_MS;          // [PLACEHOLDER] 远小于 G.timePerTurn → 断线座位宽限期收缩
    G.disconnectTurns[seat] = (G.disconnectTurns[seat] ?? 0) + 1;
    if (G.disconnectTurns[seat] >= N_FORFEIT_TURNS) {  // [PLACEHOLDER]
      // 等价 forfeitTurn:rollback + 罚抽 + endTurn(复用 moves.js:160-167 的 forfeitTurn 路径),
      // 或触发 vote-to-skip。终局把剩余手牌按 countPoints(util.js)折算最终分。
    }
  } else {
    G.timerExpireAt = getSecTs() + G.timePerTurn;      // 现状(moves.js:303)
  }
  G.gameStateStack = []; G.redoMoveStack = [];
  if (G.lastCircle.length) G.lastCircle.push(seat);
  G.prevTilePositions = original(G.tilePositions);
  return G;
}
```

- **关键守卫不变**:塌缩只改 `timerExpireAt`,推进仍走 `forceEndTurn` 到点守卫(`moves.js:148-150`)或显式 `forfeitTurn`(`moves.js:160-167`)——**不放宽**反作弊守卫(global-constraints)。断线座位在 `GRACE_MS` 内被任一在线对手 `forceEndTurn` 推进,而非耗满 `timePerTurn`。
- 座位重连(`G.connected[seat]` 转回 true)后,下个 `onTurnBegin` 自动恢复完整 `timePerTurn`;`disconnectTurns` 计数是否清零见 §6 待核实。

---

## 4. GO / NO-GO 建议

**GO —— 本 Sprint(S3-U7)可实现 WS-12,采用方案 C。**

依据(全部已用 0.50 实际代码核实):
1. 连接捕获点存在且在服务端:`socket.on('disconnect'/'sync')` → `Master.onConnectionChange`(`server.js:3919-3927, 3606`)。
2. 自定义 transport 可干净注入:`Server({transport})`(`server.js:3994,4003-4004`);`SocketIO`/`Master` 均 `exports`(`server.js:4072`,`master.js:18`),无需 fork。
3. 服务端可在连接事件里改写权威 `G`:`onUpdate` 已示范 fetch→reducer→`store.dispatch`→`setState`→`sendAll`(`server.js:3446-3513`),`makeMove` 可用(`turn-order:42`)。
4. `activePlayers:{all:NULL}`(`Game.js:81`)使断线座位仍 active,代发 move 通过 `isPlayerActive`(`server.js:3469`)。
5. 持久化/重连自洽:走标准 `setState` + action log + `onSync`(`server.js:3513,3589`),与 WS-13 FlatFile 合排。

**风险可控、非阻塞**:唯一实质成本是 override `SocketIO.init` 需复制约 35 行 namespace 接线(`server.js:3879-3935`),随 0.50 升级需对照维护。若评审认为该复制不可接受,**兜底为方案 A**(中间件/直接 `setState`),功能不变但与框架数据流耦合更紧。

**不推荐 NO-GO / 推迟**:框架已具备全部必要扩展点,推迟不会降低风险,反而拖慢 WS-13 重连估算(software-architect 文档 `2026-06-20-plan-01-software-architect.md:197` 要求 spike 第一周出结论)。

---

## 5. 风险与缓解

| 风险 | 说明(代码依据) | 缓解 |
|---|---|---|
| `init` 接线需复制 ~35 行 | 0.50 无更细钩子,`init` 是单一大方法(`server.js:3879`) | 复制时加注释标注源行号;升级 0.50 时 diff 对照 |
| 代发与并发 move 竞态 | disconnect handler **未**入 `perMatchQueue`(`server.js:3919-3927` 直接 await,对比 update 走 `getMatchQueue` `:3902,3941`) | 把 `_setConnection` 代发 `add` 进 `this.getMatchQueue(matchID)` 串行化 |
| stateID 失配 | onUpdate 校验 `state._stateID !== stateID`(`server.js:3486`) | 代发前现取 `state._stateID`;或把 `_setConnection` 标 `ignoreStaleStateID` 走 long-form(`server.js:3487`) |
| 无"服务端专用 action"通道 | transport 代发的 action 与客户端 `socket.on('update')`(`server.js:3899`)发来的在 master 看来无法区分 | `_setConnection` 限定只能写**调用者自己座位**(§3.2);真值由 socket 事件强制覆盖,客户端无法借此作弊 |
| `playersJoin` 阶段 move 不可用 | 该阶段 `moves` override 不含 `_setConnection`(`Game.js:50-59`),代发会被 `getMove` 拒(`onUpdate` 仅对 MAKE_MOVE 校验) | 该阶段断线影响小;如需覆盖,在 `playersJoin.moves` 也注册 `_setConnection` |
| 客户端 UI 仍读 metadata `isConnected` | `PlayerAvatar.jsx:35,40` 当前消费 metadata | 落地后改读权威 `G.connected`(WS-13 重连横幅同源),避免 UI 与权威态分叉 |

---

## 6. `[PLACEHOLDER]` / `待核实` 清单

- `[PLACEHOLDER] GRACE_MS` —— 断线座位宽限秒数(远小于 `timePerTurn`)。由 Game Design / Product 定(参 backend-architect `:376`)。
- `[PLACEHOLDER] N_FORFEIT_TURNS` —— 累计多少个断线回合后触发自动 forfeit / vote-skip。
- `待核实` 重连后 `G.disconnectTurns[seat]` 是否清零、还是保留累计(影响"短暂掉线又回来"是否被惩罚)。建议:重连即清零,只惩罚持续断线。
- `待核实` `_setConnection` 是否需同时注册进 `playersJoin.moves`(取决于是否要在 join 阶段追踪连接)。
- `待核实` override `init` 后,与 FlatFile **异步**存储(`isSynchronous=false`,`server.js:2519`)路径的 `await` 顺序是否需额外处理(本 spike 仅核实了同步分支链路;`db` 默认 InMemory/FlatFile 均走 `Sync`,`server.js:2563`)。
- `待核实` vote-to-skip vs 自动 forfeit 的产品选择(本 spike 默认沿用 `forfeitTurn` 等价路径 `moves.js:160-167`)。

---

## 7. 验收交付(供 S3-U7 实现参考)

- 链路:**socket disconnect/sync(`server.js:3919/3917`)→ `ConnAwareMaster.onConnectionChange` 代发 `_setConnection` → reducer/setState 写 `G.connected[seat]`(`server.js:3446-3513`)→ `onTurnBegin` 读 `G.connected` 塌缩 grace + 累计 `disconnectTurns`(`moves.js:301`)→ 达 N 回合 forfeit/vote-skip**。
- 建议测试(S3-U7):jest —— 断线的活动座位在 `GRACE_MS` 内可被 `forceEndTurn` 推进而非耗满 `timePerTurn`;`_setConnection` 只能改自己座位;重连后 `G.connected` 恢复且 `timePerTurn` 复原。Playwright smoke —— 断线 → 头像 offline → 座位在宽限期内自动推进。
