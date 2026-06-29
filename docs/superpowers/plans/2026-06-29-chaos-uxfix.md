# Chaos UX 修复 (P0+P1). spec: 07 §3 mockup sp1.html + 08-ui-layout-fixes.md + UX P0 list.
SUB-SKILL subagent-driven. 全 gate chaos; 经典零回归; RTL+CSS-source; trailer; 0lint.
## T1 手牌 side-by-side ledge (杀抽屉): AbilityHand 挂进 .hand-buttons 紧邻 handGrid, 叠卡 always 全显, hover 扇开+selected highlight, 点出; 抽屉仅 ≤820px. bluff toggle 同区.
## T2 桌面 tile 不缩: board cell min 贴近手牌(--board-tile-min ~max(2vw,40px)), .ref .tile-text floor; 落桌≥~90% 手牌大小.
## T3 提示挪到头像高度居中 band: 新 .interrupt-band(~42%); peek/junk/bluff/timeout 在此, 顶部仅系统. peek 选目标: 锁桌(卡 inert)、只头像可点、绑回合倒计时自动取消+退卡, 不再永久蓝条.
## T4 全场施法动画: G.lastCast{from,to,type,blocked} 广播(仿 lastWheel), beam→pulse ~700ms+结算delay; 盾=断beam; bluff 小气泡贴质疑者头像+action 动画; 无目标卡(大风吹)"all" glow 跳过选人.
## verify+deploy.
