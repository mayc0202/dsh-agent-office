# Night Shift · DSH 插件版

把 DeepSeek Harness 的所有会话变成一间实时 3D 办公室：右下角一个「夜班」按钮，点开就是全屏面板。
面板视觉复刻 Night Shift 原版演示页（配色、楼层、工位、Agent 小人、状态动画），数据全部来自本机会话日志，
**插件版不依赖 ntfy、不需要常驻外部进程**。

![全局视角](screenshot.png)

![楼层视角](screenshot-focus.png)

## 特性

- 🏢 **3D 办公室**：楼层、工位、显示器、绿植、服务器、灯牌；每个会话是一个 Agent 小人，按状态做动画；
- 🖱️ **楼层视角**：点 3D 楼层或左侧「楼层」列表 → 镜头切到该层，其他楼层淡出，只看这一层；
- 📡 **真实数据**：状态（工作中 / 等待中 / 卡住 / 已完成 / 待机）、今日执行次数、本周/今日 Token 全部来自本机会话日志，不编造；
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
| 面板 | `lib/panel.html` | 单文件页面；同源轮询 `/night-shift/api/state`，在页面内绘制 3D 办公室 |

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

## 已知限制

- 只读本机会话日志；日志是追加写的多帧 zstd，正在写入时最后一帧可能不完整（会跳过不完整部分）；
- 只展示最近活跃的会话，更早的会话不会进入名册；
- `lib/panel.html` 为 Night Shift 原版演示页的修改版，版权归原作者，详见 `NOTICE`。

## 许可

插件代码 MIT（见 `LICENSE`）。`lib/panel.html` 为第三方演示页面衍生作品，版权归原作者，详见 `NOTICE`。

---

## English

**Night Shift** is a DSH plugin that turns every DeepSeek Harness session into a live 3D office.
The page's visual design is adapted from the Night Shift demo, with all data coming from local session logs.

- Install: `dsh plugin --profile desktop add github:mayc0202/dsh-night-shift`, enable **Night Shift** in the plugin manager, restart DSH. A floating「夜班」button opens `/night-shift/`.
- Data: reads `$DSH_HOME/sessions/**/session.v4.jsonl.zstd` (read-only, no network). Status, turn counts and token usage are derived from `turn/*`, `tool/call`, `assistant/message.usage` and approval events.
- Preview: `node dev/dev-server.mjs` → http://127.0.0.1:8899/night-shift/
- License: plugin code MIT; `lib/panel.html` is derived from a third-party demo (see `NOTICE`).
