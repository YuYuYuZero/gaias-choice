# 盖娅的选择

一款有分支选择的中文互动叙事游戏。

- [在线演示](https://yuyuyuzero.github.io/gaias-choice/)
- [视频大模型生成与接入指南](docs/VIDEO-GENERATION.md)
- [部署流程](.github/workflows/pages.yml)

## 本地运行

无需安装前端依赖。在仓库根目录执行：

```bash
python3 -m http.server 8000
```

打开 http://localhost:8000 ，点击“开始演示”。不要直接双击 HTML 使用 file:// 打开。

## 两种运行方式

| 方式 | 当前支持 | 需要什么 |
| --- | --- | --- |
| GitHub Pages / 本地静态服务器 | 预制开场视频、固定剧情和分支演示 | 浏览器 |
| 实时 AI 互动 | 前端协议与播放器已包含，独立后端未包含 | 剧情模型、视频模型、会话与任务服务、鉴权、媒体存储 |

Pages 上的演示不会调用视频模型或产生生成费用。`interactive-game.json` 中 `video.enabled: true` 只是配置声明，不会自动创建后端或开通模型。

## 更新发布

修改后提交并推送 `main`，GitHub Actions 的 `Deploy static game to Pages` 自动发布静态资源。Settings → Pages → Source 使用 **GitHub Actions**。无需 npm build 或 Jekyll。

开场视频位于 `assets/videos/opening.mp4`。原始导出把它误命名为 `.glb`，现已根据文件内容改为 `.mp4`，未重新生成。

2026-11-08 首次发布记录：构建成功，部署阶段报 `Timeout reached, aborting!`。这是部署等待超时，不能据此认定游戏代码有编译错误；重试结果以 Actions 和线上访问为准。
