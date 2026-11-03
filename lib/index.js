/**
 * Night Shift —— DSH 插件宿主半侧。
 *
 * 在 DSH 现有 Web 服务器上挂三条路由：
 *   GET /night-shift/           3D 办公室页面（单文件面板）
 *   GET /night-shift/api/state  实时名册 / 事件 / Token 用量（读本机会话日志）
 *
 * 不依赖 ntfy、不依赖外部进程；面板与 DSH 同源，直接轮询本机 API。
 */
import { readFile } from 'node:fs/promises'
import { createNightShiftStore } from './state.js'

export const name = 'night-shift'
export const inject = ['webServer']

const PANEL = new URL('./panel.html', import.meta.url)

export function apply(ctx, config) {
  const store = createNightShiftStore({
    sessionsDir: config?.sessionsDir,
    maxAgents: config?.maxAgents,
    activeWindowHours: config?.activeWindowHours,
  })

  const send = (res, type, body, code = 200) => {
    res.writeHead(code, {
      'content-type': type,
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    })
    res.end(body)
  }
  const json = (res, payload, code = 200) => send(res, 'application/json; charset=utf-8', JSON.stringify(payload), code)

  const trusted = new Set(['localhost', '127.0.0.1', ...[...(config?.trustedHosts ?? [])].map(host => String(host).trim().toLowerCase()).filter(Boolean)])
  const hostTrusted = req => trusted.has(String(req.headers.host ?? '').replace(/:\d+$/, '').toLowerCase())

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/night-shift',
    handler: (_req, res) => {
      res.writeHead(302, { location: '/night-shift/' })
      res.end()
    },
  }), 'night-shift: redirect')

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/night-shift/',
    handler: async (_req, res) => {
      try {
        send(res, 'text/html; charset=utf-8', await readFile(PANEL, 'utf8'))
      } catch (error) {
        ctx.logger.error(error instanceof Error ? error : new Error(String(error)))
        send(res, 'text/plain; charset=utf-8', 'Night Shift 页面暂时不可用', 500)
      }
    },
  }), 'night-shift: page')

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/night-shift/api/state',
    handler: (req, res) => {
      if (!hostTrusted(req)) return json(res, { error: '不被信任的 Host' }, 403)
      try {
        return json(res, store.state())
      } catch (error) {
        ctx.logger.error(error instanceof Error ? error : new Error(String(error)))
        return json(res, { error: '状态暂时不可用' }, 500)
      }
    },
  }), 'night-shift: api')
}
