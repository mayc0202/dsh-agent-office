/**
 * 智能体办公室 —— DSH 插件宿主半侧。
 *
 * 在 DSH 现有 Web 服务器上挂三条路由：
 *   GET /agent-office/               3D 办公室页面（单文件面板）
 *   GET /agent-office/api/state      实时名册 / 事件 / Token 用量（读本机会话日志）
 *
 * 不依赖 ntfy、不依赖外部进程；面板与 DSH 同源，直接轮询本机 API。
 */
import { readFile } from 'node:fs/promises'
import { createNightShiftStore, fetchDeepSeekBalance, fetchWeather } from './state.js'

export const name = 'agent-office'
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
    path: '/agent-office',
    handler: (_req, res) => {
      res.writeHead(302, { location: '/agent-office/' })
      res.end()
    },
  }), 'agent-office: redirect')

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/agent-office/',
    handler: async (_req, res) => {
      try {
        send(res, 'text/html; charset=utf-8', await readFile(PANEL, 'utf8'))
      } catch (error) {
        ctx.logger.error(error instanceof Error ? error : new Error(String(error)))
        send(res, 'text/plain; charset=utf-8', '智能体办公室页面暂时不可用', 500)
      }
    },
  }), 'agent-office: page')

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/agent-office/api/state',
    handler: (req, res) => {
      if (!hostTrusted(req)) return json(res, { error: '不被信任的 Host' }, 403)
      try {
        return json(res, store.state())
      } catch (error) {
        ctx.logger.error(error instanceof Error ? error : new Error(String(error)))
        return json(res, { error: '状态暂时不可用' }, 500)
      }
    },
  }), 'agent-office: api')

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/agent-office/api/weather',
    handler: async (req, res) => {
      if (!hostTrusted(req)) return json(res, { ok: false, error: '不被信任的 Host' }, 403)
      try {
        const url = new URL(req.url ?? '/', 'http://localhost')
        return json(res, await fetchWeather({
          lat: url.searchParams.get('lat'),
          lon: url.searchParams.get('lon'),
        }))
      } catch (error) {
        ctx.logger.error(error instanceof Error ? error : new Error(String(error)))
        return json(res, { ok: false, error: '天气暂时不可用' }, 500)
      }
    },
  }), 'agent-office: weather')

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/agent-office/api/balance',
    handler: async (req, res) => {
      if (!hostTrusted(req)) return json(res, { ok: false, error: '不被信任的 Host' }, 403)
      try {
        return json(res, await fetchDeepSeekBalance({ credentialsPath: config?.credentialsPath, clientVersion: config?.clientVersion }))
      } catch (error) {
        ctx.logger.error(error instanceof Error ? error : new Error(String(error)))
        return json(res, { ok: false, error: '余额暂时不可用' }, 500)
      }
    },
  }), 'agent-office: balance')
}
