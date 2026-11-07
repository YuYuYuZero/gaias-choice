# 视频大模型生成与接入指南

## 1. 这个项目现在怎样处理视频

`game.js` 管理剧情与播放，`interactive.js` 是实时服务客户端，`interactive-game.json` 保存故事规则和开场首帧。首帧是 `assets/opening.webp`。

**当前源码没有视频模型的服务端实现，也没有可在 GitHub Pages 上运行的模型后端。** 原平台运行时会提供游戏 ID、会话和服务地址。独立部署到 Pages 后，这些能力不会随源码一起迁移；当前“开始演示”播放本地预制片段和固定分支。

调用关系：

```text
玩家行动 → 你部署的后端 → 剧情模型生成下一幕/镜头提示词
                        → 视频模型创建异步任务 → 查询同一任务
                        → 下载并持久化 MP4 → 返回任务结果
浏览器播放器 ← 你后端的受鉴权视频接口
```

下面先介绍最容易使用的“本地生成、替换开场视频”，再介绍实时方案。本文提供操作步骤，本次维护没有提交收费视频生成任务。

## 2. 用 ArkCLI 生成一个开场视频

适合先做可展示的成品；生成后上传 MP4，访客无需模型账号。

### 安装和登录

需要 Node.js/npm 和火山方舟账号；确保账号具有视频模型权限与可用额度。

```bash
npm install -g @volcengine/ark-cli
arkcli auth status
# 未登录时执行，并在浏览器完成授权：
arkcli auth login volc-sso
```

### 查询可用模型

```bash
arkcli resources list --modality video
```

从返回的可用资源中选模型或接入点；不要照抄别人的模型 ID。平台 profile 通常返回 `ep-...` 接入点，Agent Plan 可能返回模型名，Coding Plan 自身不包含视觉模型。

```bash
VIDEO_MODEL='替换成上一步返回的可用模型或接入点ID'
# 如果是模型名，查询参数；ep- 开头的接入点跳过此查询：
arkcli models get "$VIDEO_MODEL" --transform supported_params
```

只使用实际支持的时长、比例和分辨率。模型名需要完整可调用版本时，从模型详情的 `primary_version` 获取版本，不要猜日期或版本号；接入点直接使用原 ID。

### 生成：使用现有首帧保持人物一致

在仓库根目录运行。下面会创建真实视频任务并消耗模型额度。

```bash
mkdir -p .generated
arkcli +gen --modality video --model "$VIDEO_MODEL"   --input @assets/opening.webp   --save-to .generated --open   '以参考图作为首帧。写实电影质感，女孩短黑发、橄榄绿工装外套、白帆布鞋，站在海边小镇屋顶的绿色水箱旁。微风轻轻吹动衣角，远处天空缓慢出现一个淡淡的环。镜头缓慢推进，保持人物和屋顶结构一致，冷灰绿色调，无字幕，无切镜。'
```

若模型支持，可在命令中额外加入 `--ratio 16:9 --duration 5 --resolution 720p`；并非每个模型都支持这些组合。需要同步等待可加 `--wait`。

默认视频是异步任务。记录返回的 `task_id`，queued/running 表示排队或生成中，不要重复提交：

```bash
arkcli gen get '替换成task_id' --save-to .generated --open
```

隔一段时间查询同一个任务。返回 succeeded 后确认 `local_path`，本地查看视频，检查人物、镜头、时长和内容；失败时查看错误原因，修改后再提交新任务。优先保存本地文件，不要把临时签名下载地址当永久素材地址。

### 放入游戏并重新发布

```bash
# 把这里的路径替换成返回的真实 local_path：
cp '.generated/实际任务文件.mp4' assets/videos/opening.mp4
python3 -m http.server 8000
```

浏览器打开 http://localhost:8000，点击“开始演示”，确认新片段可播放。现有播放逻辑仅在演示开场使用此片段，后续分支不会因此变成实时生成视频。`DEMO_CLIP.remote` 仍是旧片段兜底地址；更换开场后若也要替换远端兜底，请将其更新为你自己的长期可访问 MP4 地址。

```bash
git add assets/videos/opening.mp4
git commit -m "Update opening video"
git push origin main
```

Pages 会自动重新部署。控制片段体积，超过 GitHub 单文件限制时改用对象存储/CDN，并修改 `game.js` 的 `DEMO_CLIP` 地址。

## 3. 如果要每次选择都实时生成新视频

这需要额外开发和部署后端，不能仅靠修改 `video.enabled`、设置模型名或添加 API Key 完成。建议先在本地完成一段视频生成，再完成一轮交互，最后部署公网服务。

### 服务端调用视频 API 的最小示例

以下仅在**服务端或本地终端**运行。`ARK_API_KEY` 通过服务端密钥管理/环境变量提供，不写到 JS、HTML、Git 仓库或前端构建参数中。`ARK_VIDEO_MODEL` 使用账号实际可用的模型/接入点 ID。

```bash
# 环境中先配置 ARK_API_KEY 和 ARK_VIDEO_MODEL。
# 使用 Python 构造 JSON，避免提示词/模型 ID 的引号破坏请求体。
python3 - <<'PYCODE' > /tmp/gaia-video-request.json
import json, os
print(json.dumps({
    "model": os.environ["ARK_VIDEO_MODEL"],
    "content": [
        {"type": "text", "text": "镜头缓慢推进，海边屋顶微风吹动女孩衣角，保持人物一致，无字幕。"},
        {"type": "image_url", "image_url": {"url": "https://yuyuyuzero.github.io/gaias-choice/assets/opening.webp"}}
    ]
}))
PYCODE
curl --fail-with-body https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks   -H "Authorization: Bearer $ARK_API_KEY"   -H 'Content-Type: application/json'   --data-binary @/tmp/gaia-video-request.json
```

记录返回的 `id`，随后查询：

```bash
TASK_ID='替换成返回的id'
curl --fail-with-body "https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks/$TASK_ID"   -H "Authorization: Bearer $ARK_API_KEY"
```

任务 succeeded 后从 `content.video_url` 获取结果并保存到自己的媒体存储。failed 时处理服务端错误；排队时继续查原任务。首帧格式、参数与支持能力以所选模型官方文档为准。

### 与现有前端对接

`interactive.js` 的基地址规则是：`服务地址/api/v1/sessions/{gameId}/interactive`，也可提供以 `/interactive` 结尾的完整地址。后端必须匹配已有协议，不能直接把这个地址设为方舟 API URL。

| 相对接口 | 职责 |
| --- | --- |
| POST `/start` | 创建会话，返回 play_id、access_token、opening 和 capabilities.video |
| POST `/opening` | 接收 play_id/request_id，创建开场视频任务 |
| POST `/turn` | 接收 play_id/parent_id/action/request_id 等，生成剧情与视频 |
| GET `/plays/{play_id}/jobs/{request_id}` | 查询原任务，返回当前状态、node 等 |
| GET `/plays/{play_id}/jobs/{request_id}/video` | 返回视频二进制，供客户端转为 blob 播放 |
| POST `/frames` | 接收播放节点与末帧，用于保持下一幕连续性 |
| GET `/plays/{play_id}` | 恢复该会话已有节点和任务 |

字段的完整校验请逐项对应 `interactive.js` 的 `start`、`remember`、`submitPending`、`prepareVideo` 与恢复逻辑。此表是接入清单，不是已实现的后端。

在部署好的后端通过联调后，在 `game.js` 中创建 SDK 的位置显式传入配置，例如：

```javascript
var sdk = window.YorollInteractive && window.YorollInteractive.create({
  gameId: 'gaias-choice',
  endpoint: 'https://你的后端域名',
  onStatus: onStatus,
  media: PLAYER_CONFIG.media
});
```

后端加载本仓库故事配置，调用剧情模型生成叙事、选项及镜头描述，再调用视频模型。用 request_id 做幂等，持久化 provider task ID；网络超时后查原任务，避免一次点击重复计费。模型凭证留在后端，浏览器仅持有本次游玩的受限凭证。对公开站点设置登录/配额/限流，限制每人轮次、并发和视频时长。

Pages 与后端跨域时，当前客户端使用 `credentials: include` 与 Authorization，因此后端要允许确切的 `https://yuyuyuzero.github.io` Origin、允许凭据、处理 OPTIONS，并允许 Content-Type/Authorization。不能用通配符 Origin 配合凭据。视频接口也需要相同跨域策略。

验收至少覆盖：开场生成、两次不同选择生成不同后续片段、刷新恢复、超时查原任务、模型失败时保留上一幕、手机点击播放。仅返回视频 URL 或看到“排队中”不算接入完成。

## 4. Pages 部署排查

仓库 Settings → Pages → Source 选 GitHub Actions。查看 Actions 的 `Deploy static game to Pages`：准备资源 → 上传站点产物 → deploy。

- 如果构建成功但 deploy 超时，查看 deployment 错误和 GitHub 服务状态，再手动 Re-run failed jobs；无需因此改剧情代码。
- 发布成功但页面资源 404：检查相对路径与大小写，本站在 `/gaias-choice/` 子路径，避免 `/assets/...` 这种根路径。
- 网页可打开但实时 AI 不工作：检查是否部署了上述独立后端，Pages 不执行模型服务。
- 视频不播放：确认实际格式、Content-Type、下载是否完整及浏览器播放手势；本项目开场素材现为 `.mp4`。

## 参考

- [方舟官方视频生成教程](https://docs.volcengine.com/docs/ark/video-generation-tutorial)
- [GitHub 官方 Pages 发布 Action](https://github.com/actions/deploy-pages)
- CLI 参数以已安装版本的 `arkcli +gen --help`、`arkcli gen get --help` 为准。
