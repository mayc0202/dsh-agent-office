# Night Shift · DSH 插件版

把 DeepSeek Harness 的全部会话变成一间实时 3D 办公室：右下角一个「夜班」按钮，点开就是全屏面板。
3D 场景用 **Three.js** 自绘（楼层、工位、Agent 小人、霓虹灯牌、动态状态动画），不依赖第三方页面模板，也不依赖 ntfy 或常驻外部进程。

![全局视角](screenshot.png)

![单层聚焦](screenshot-focus.png)

## 特性

- 🎨 **夜景 3D 办公室**：透视镜头、楼层按活跃工作区自动增加；每层有沙发、咖啡吧、大屏、玻璃机房、彩色货架；
- 🌃 **蓝色夜景城市**：四周程序化高楼 + 蓝色灯光/窗光，室内霓虹（COFFEE/楼层灯带/橙色 NIGHT SHIFT）；
- 🐱 **Catora 猫猫 Agent**：用 catora-cat 的 logo / 表情差分 PNG 做成平面贴图立牌（Three.js Sprite），**永远面向相机**，颜色按 Agent 调色；表情随状态切换（工作/等待/卡住/完成/待机），空闲时飘「Z」睡觉；

- 🏢 **3D 实时办公室**：Three.js 自绘的错层办公室——每层有工位、显示器、会议桌、白板、服务器机柜、玻璃护栏和吊灯；每个会话是一个简洁的立方体 Agent（按状态做呼吸/浮动脉冲，工作/等待/卡住/待机各有反馈）；
- 🖱️ **楼层聚焦**：左键点任意楼层（或左侧楼层列表）→ 只显示并看清这一层；右键 /「全局视角」按钮 / `Esc` 回到整栋楼的全局视角；
- 📡 **真实数据**：状态、今日执行次数、本周/今日 **Token 用量** 全部来自本机会话日志，数字不编造；
- 🖱️ **可交互**：拖动旋转、滚轮缩放、点击立方体或名字看详情、详情卡 ×/Esc 关闭；
- 🧩 **原生插件**：bundle 插件，装完即用（宿主路由 + 浏览器半侧悬浮按钮），无外部依赖；
- 🔒 **只读本机**：只读 `$DSH_HOME/sessions`，不联网、不上传，没有频道名/密钥要配。

## 安装

### 方式 A：从 GitHub 安装（推荐）

DSH 侧边栏 → **插件** → 安装组合包，填：

```
github:mayc0202/dsh-night-shift
```

或命令行：

```bash
DSH="/Applications/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh"
"$DSH" plugin --profile desktop add github:mayc0202/dsh-night-shift
```

安装后在「插件」页勾选 **Night Shift**（或把 `dsh-night-shift` 追加到
`~/.dsh/profiles/desktop/package.json` 的 `dsh.profile.bundles`），重启 DSH 生效。

### 方式 B：本地目录

```bash
git clone https://github.com/mayc0202/dsh-night-shift
"$DSH" plugin --profile desktop add link:"$(pwd)/dsh-night-shift"
```

### 安装后

- 右下角出现「夜班」按钮，点开全屏面板，`Esc` 关闭；
- 或直接访问 `http://127.0.0.1:<DSH端口>/night-shift/`。

## 先预览（不安装）

```bash
npm install          # 安装 three / esbuild（仅构建/预览需要）
node dev/dev-server.mjs
# 打开 http://127.0.0.1:8899/night-shift/
```

`dev/dev-server.mjs` 只起一个最小 HTTP 服务（同一份面板 + 同款 API），用于验证页面与数据。

![悬浮按钮 + 全屏面板](screenshot-client.png)

## 工作原理

| 半侧 | 文件 | 作用 |
| --- | --- | --- |
| 宿主 | `lib/index.js` | 在 DSH 的 Web 服务器上挂 `GET /night-shift/`（页面）和 `GET /night-shift/api/state`（数据） |
| 数据 | `lib/state.js` | 读 `~/.dsh/sessions/<workspace>/<session>/session.v4.jsonl.zstd`（多帧 zstd 逐帧解压，按 mtime 缓存）；从 `turn/start|end`、`tool/call`、`assistant/message.usage`、`approval/asked|decided`、`ask_user_question` 推导状态与用量 |
| 客户端 | `lib/client.js` | 右下角「夜班」悬浮按钮 + 全屏 iframe 覆盖层，可「在新标签打开」 |
| 3D 页面 | `lib/panel.html` | 单文件构建产物（Three.js 场景 + HUD），同源轮询 API |
| 页面源码 | `panel-src/` + `panel/build.mjs` | 可读源码 + esbuild 打包脚本 |

数据口径：

- 名册：最近 `activeWindowHours`（默认 24 小时）内活跃的会话，最多 `maxAgents`（默认 7）个，名字取会话标题；
- 楼层：会话所在工作区（`Harness` / `Catora` / 其他）；
- 今日执行：当天 `turn/start` 次数；
- 本周占比：该会话本周（周一至今）Token 占全部展示会话的百分比；
- 今日/本周 Token：`assistant/message` 里 `usage.totalTokens` 的真实累计。

## 配置

在 profile 的 `cordis.patch.yml` 里加 `config`（或改本包 patch）：

```yaml
- insert:
    - id: night-shift
      name: dsh-night-shift
      config:
        maxAgents: 7            # 名册最多显示几个会话
        activeWindowHours: 24   # 只统计最近多少小时内活跃的会话
        sessionsDir: null       # 默认 $DSH_HOME/sessions
```

## 开发构建

```bash
npm install
node panel/build.mjs     # panel-src/ → lib/panel.html（单文件）
node dev/dev-server.mjs  # 本地预览
node --check lib/index.js lib/state.js lib/client.js
```

## 交互

| 操作 | 结果 |
| --- | --- |
| 左键点楼层 / 左侧「楼层」 | 聚焦该层，只显示这一层 |
| 右键 / 顶栏「全局视角」/ `Esc` | 回到整栋楼全局视角 |
| 拖动 / 滚轮 | 旋转 / 缩放（聚焦时也可以） |
| 点机器人或名字标签 / 左侧榜单 | 打开该会话详情卡 |
| `Esc` | 有详情卡时先关卡片，再按一次回全局 |

## 已知限制

- 只读本机会话日志；日志是追加写的多帧 zstd，正在写入时最后一帧可能不完整（会跳过不完整部分）；
- 只展示最近活跃的会话，更早的会话不会进入名册；
- 3D 场景按最多 4 个团队楼层设计。

## 许可

MIT（见 `LICENSE`）。打包产物内联了 Three.js（MIT，© three.js authors），见 `NOTICE`。

---

## English

**Night Shift** is a DSH plugin that turns every DeepSeek Harness session into a live 3D office built with Three.js.

- Install: `dsh plugin --profile desktop add github:mayc0202/dsh-night-shift`, enable **Night Shift** in the plugin manager, restart DSH. A floating「夜班」button appears in the bottom-right corner; clicking it opens `/night-shift/`.
- Data: reads `$DSH_HOME/sessions/**/session.v4.jsonl.zstd` (read-only, no network). Status, turn counts and token usage are derived from `turn/*`, `tool/call`, `assistant/message.usage` and approval events.
- Preview: `npm install && node dev/dev-server.mjs` → http://127.0.0.1:8899/night-shift/
- License: MIT; bundled Three.js is MIT (see `NOTICE`).
