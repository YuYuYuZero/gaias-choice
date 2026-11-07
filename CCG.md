# H5 Game Project Rules (2D / Phaser)

## Project Identity
- Project Type: 2D H5 game
- Engine: Phaser 3 (CDN, no build step)
- Primary Language: JavaScript (browser ES2020)
- Target Platform: Web (runs in iframe)
- Current Milestone: prototype

## Directory Rules
- 入口 `index.html`：基建（CDN + 错误上报），**不要改**。
- `game.js`：游戏逻辑，**自由编辑**。
- `assets/`：图片/音频资产，相对路径引用。

## Conventions
- 单文件优先：逻辑集中在 `game.js`。
- 只用全局 `Phaser`，不 import 业务模块、不用打包语法。
- 自适应铺满：`scale.mode = Phaser.Scale.FIT`。
- 每次有意义改动后预览验证；预览报错则自行修复。
- 资产缺失时用 Graphics 程序化绘制占位，能跑优先。
- 手感：特效用全局 `Juice.*`（见 `juice.js` 头部 API），音效用全局 `SFX.*`（见 `sfx.js` 头部 API）。两者 index.html 已自动加载，直接调用即可，都无需外部资源。关键事件（受击/得分/跳跃/爆炸/胜负）同时配一个 `Juice.*` 视觉 + 一个 `SFX.*` 声音。
- Game Feel / VFX：每个游戏至少使用 3 种不同 `Juice.*` 动效，且覆盖“输入反馈 + 游戏事件反馈 + 状态变化反馈”。常用组合：按钮/卡牌 `Juice.buttonPress`，角色待机 `Juice.idleBob` 或 `Juice.pulse`，受击 `Juice.hitFlash` + `Juice.damageNumber` + `Juice.screenShake`，得分/拾取 `Juice.popText` 或 `Juice.floatingText` + `Juice.coinFly`，爆炸/碰撞 `Juice.burst`/`Juice.sparks`/`Juice.shockwave`，胜利 `Juice.confetti`，血条/进度 `Juice.progressTween`，切场 `Juice.sceneTransition`。不要手搓重复 tween/粒子 helper，优先直接调用这些稳定 API。
- 背景音乐：若生成了 BGM（`assets/bgm.mp3`），用 `SFX.playMusic('assets/bgm.mp3')` 循环播放（首次用户手势后自动开始，满足浏览器自动播放限制），`SFX.toggleMute()` 做静音开关，`SFX.setMusicVolume(0~1)` 调音量。
- 开场视频：`generate_game_video` 返回媒体库 URL 后，先调用 `startGame()` 让游戏在底层预加载，再调用全局 `Intro.play(videoUrl)`（见 `intro.js`，index.html 已自动加载）在上层全屏播放：**object-fit:contain 保持原比例、竖屏不裁不拉不横**，自带跳过按钮，播完/跳过/失败/超时都会同步释放点击遮罩。写法：`startGame(); if (videoUrl) Intro.play(videoUrl);`。**禁止用视频回调门控游戏启动**，否则视频结束后才下载大资源会长时间黑屏；别手搓 `<video>`，别用 object-fit:cover。
- 联网游戏：模板已加载全局 `YorollOnline`，禁止自行实现 WebSocket、登录、房间、计分、存档或排行榜后端。只有用户明确要求联机/多人/排行榜/云存档时才启用。先完整阅读 `ONLINE.md`，再写 `online-game.json` 声明 `mode/max_players/world/actions/score_rules`。大厅调用 `createRoom/joinRoom/quickMatch` 只是接入的第一步；有连续移动的玩法必须用 `createMovementController` 做本地预测、服务端确认校正和远端插值，禁止直接用 state 的 `x/y` 覆盖可见精灵。玩法还必须监听 `state/action/finished/error`，用 `sendPlayerState` 同步本角色血量/动画等扩展状态、`sendAction` 上报离散意图，并由动态房主用 `setSharedState` 发布金币/敌人/关卡等可恢复共享快照。计时统一读 `elapsedMs()`。只同步房间/READY 而玩法仍各端自跑，判为未完成。
- 图片缩放：**一律用全局 `Fit.*`（见 `fit.js` 头部 API），绝不手动 `setDisplaySize(w,h)` 变比例、不 `setScale(sx,sy)` 非等比**。角色/图标 `Fit.height(obj,px)` 或 `Fit.contain(obj,w,h)`；背景 `Fit.cover(obj,w,h)`。按钮、HUD、弹窗、进度槽默认用 Phaser Graphics/Shape 程序化绘制；只有确实使用 text-safe UI 切图时，才用 `Fit.panel(scene,x,y,key,w,h)` 做 9-slice，边框不变形。
- 文字适配：按钮、HUD、弹窗、结算面板上的文字必须用 `Fit.text(textObj, boxW, boxH, minPx)` 或 `Fit.label(scene,x,y,text,style,boxW,boxH,minPx)` 量过后再显示；不得让文字超出底框、被裁切或盖住边框。
- 品质闭环：每个游戏必须有核心循环、胜利、失败/死亡/超时/资源耗尽、结算、重玩入口、分数/升级/解锁/资源成长之一；不能只做素材展示。
- 动效硬指标：每个游戏至少 8 个可见反馈，核心玩法 >=4、UI 操作 >=2、升级/胜负/结算 >=2。优先用 `Juice.*` / `VFX.*` 和 `SFX.*`，例如 `buttonPress`、`pulse`、`damageNumber`、`burst`、`coinFly`、`progressTween`、`sceneTransition`、`confetti`。
- 差异化：把主题色、字体、圆角、阴影、动效节奏、布局区域比例、敌人/资源/关卡/事件参数写成常量或配置，并按用户题材真实调整。模板只能当工程骨架，不能只换背景、名字和图片。
- 速度优先：先保证可玩闭环和程序化 UI，再生成高级素材。独立图片/BGM 在同一轮并行发起；视频和高级美术是 best-effort，失败时用静图/程序化兜底继续交付。
- 24项验收：在 `design.md` 或 `asset_manifest/design.json` 维护 `qualityChecklist24`，覆盖玩家目标、核心循环、操作反馈、胜利、失败、结算重玩、成长、难度递进、选择取舍、主题数据、AI/随机/环境变化、关卡/任务变化、theme tokens、三屏布局变体、统一 art direction、内容资产接入、程序化 UI chrome、文本适配、8 个动效、SFX/BGM、运动状态、视频 best-effort、并行素材速度预算、胜/败/重玩实测兜底。

## Fields (for system prompt placeholders)
- engine: Phaser 3
- game_type: 2D game
- main_scene: game.js
- target_platform: Web
- current_milestone: prototype
