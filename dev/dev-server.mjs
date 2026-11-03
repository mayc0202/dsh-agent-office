#!/usr/bin/env node
/**
 * 开发/自测用最小服务器：不安装 DSH 插件也能打开面板。
 *   node dev/dev-server.mjs        # http://127.0.0.1:8899/agent-office/
 */
import { createServer } from 'node:http'
import { readFileSync } from 'node:fs'
import { createNightShiftStore, fetchDeepSeekBalance } from '../lib/state.js'

const port = Number(process.env.PORT ?? 8899)
const store = createNightShiftStore({})

const server = createServer(async (req, res) => {
  const path = new URL(req.url ?? '/', 'http://dev.local').pathname
  if (path === '/agent-office' || path === '/agent-office/') {
    try {
      const panel = readFileSync(new URL('../lib/panel.html', import.meta.url), 'utf8')
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' })
      res.end(panel)
    } catch (error) {
      res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' })
      res.end(String(error))
    }
    return
  }
  if (path === '/agent-office/api/balance') {
    try {
      const payload = await fetchDeepSeekBalance({})
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
      res.end(JSON.stringify(payload))
    } catch (error) {
      res.writeHead(500, { 'content-type': 'application/json; charset=utf-8' })
      res.end(JSON.stringify({ ok: false, error: String(error) }))
    }
    return
  }
  if (path === '/agent-office/api/state') {
    try {
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
      res.end(JSON.stringify(store.state()))
    } catch (error) {
      res.writeHead(500, { 'content-type': 'application/json; charset=utf-8' })
      res.end(JSON.stringify({ error: String(error) }))
    }
    return
  }
  res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
  res.end('not found')
})

server.listen(port, '127.0.0.1', () => {
  console.log(`智能体办公室 dev server: http://127.0.0.1:${port}/agent-office/  (sessions: ${store.sessionsDir})`)
})
