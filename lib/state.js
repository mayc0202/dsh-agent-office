/**
 * Night Shift 数据层：把 DeepSeek Harness 的会话日志转成 3D 面板要的名册 / 事件 / 用量。
 *
 * 只读 ~/.dsh/sessions 下的 session.v4.jsonl.zstd；同一文件按 mtime+size 缓存，
 * 没变化就不会重复解压。
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { zstdDecompressSync } from 'node:zlib'
import { createHash } from 'node:crypto'
import { homedir } from 'node:os'

const COLORS = ['#2D84F5', '#B79BFF', '#E5695A', '#6FD49A', '#7FD8E8', '#E9C17A', '#FF6A3D', '#8FB0FF']
const SHAPES = ['cube', 'hex', 'tri', 'blob', 'drop', 'ghost', 'star', 'orb']
const DAY = 86400000
// 会话日志是追加写的多帧 zstd：逐帧解压后再拼成 JSONL（同 dsh-synapse 的做法）。
const ZSTD_MAGIC = Buffer.from([0x28, 0xb5, 0x2f, 0xfd])

export function decodeSessionLog(buffer) {
  const offsets = []
  let index = buffer.indexOf(ZSTD_MAGIC, 0)
  while (index !== -1) {
    offsets.push(index)
    index = buffer.indexOf(ZSTD_MAGIC, index + 4)
  }
  if (offsets.length === 0) return null
  const parts = []
  for (let i = 0; i < offsets.length; i += 1) {
    const end = i + 1 < offsets.length ? offsets[i + 1] : buffer.length
    try {
      parts.push(zstdDecompressSync(buffer.subarray(offsets[i], end)))
    } catch {
      // 正在写入的日志可能截断在帧中间：已完整的帧仍然可用。
      break
    }
  }
  return parts.length === 0 ? null : Buffer.concat(parts).toString('utf8')
}

export function aid(sessionId) {
  return 's-' + createHash('sha1').update(String(sessionId)).digest('hex').slice(0, 10)
}

export function humanAge(sec) {
  if (sec < 60) return '刚刚'
  if (sec < 3600) return Math.floor(sec / 60) + ' 分钟前'
  if (sec < 86400) return Math.floor(sec / 3600) + ' 小时前'
  return Math.floor(sec / 86400) + ' 天前'
}

export function teamOf(cwd) {
  if (String(cwd).includes('DeepSeek Harness')) return 'Harness'
  if (String(cwd).includes('/Catora')) return 'Catora'
  return '其他'
}

function short(text, n) {
  const flat = String(text ?? '').replace(/\s+/g, ' ').trim()
  return flat.length > n ? flat.slice(0, n) + '…' : flat
}

function base(path) {
  return String(path ?? '').replace(/\/+$/, '').split('/').pop() || String(path ?? '')
}

function actionText(name, args) {
  let a = {}
  try {
    a = typeof args === 'string' ? JSON.parse(args) : (args ?? {})
  } catch {
    a = {}
  }
  switch (name) {
    case 'bash': return '运行命令 · ' + short(a.description ?? a.command ?? '', 46)
    case 'read': return '读取 ' + short(base(a.file_path), 40)
    case 'write': return '写入 ' + short(base(a.file_path), 40)
    case 'edit': return '修改 ' + short(base(a.file_path), 40)
    case 'grep': return '检索 ' + short(a.pattern, 40)
    case 'glob': return '查找文件 · ' + short(a.pattern, 36)
    case 'web_search':
    case 'web_fetch': return '联网检索'
    case 'present': return '交付产出文件'
    case 'todo_write': return '更新任务清单'
    case 'job_output': return '查看后台任务'
    case 'subagent':
    case 'subagent_fork': return '派发子任务'
    case 'workflow': return '运行工作流'
    case 'ask_user_question': return '等待你回答'
    default: return short(name, 20)
  }
}

/** 解析单个会话日志，返回面板需要的精简状态。 */
function parseSession(file, cache) {
  let stat
  try {
    stat = statSync(file)
  } catch {
    return null
  }
  const key = stat.mtimeMs + ':' + stat.size
  const hit = cache.get(file)
  if (hit !== undefined && hit.key === key) return hit.rec
  let text
  try {
    text = decodeSessionLog(readFileSync(file))
    if (text === null) throw new Error('empty zstd log')
  } catch {
    return hit === undefined ? null : hit.rec
  }

  const now = Date.now()
  const today = new Date()
  const today0 = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()
  const week0 = today0 - ((today.getDay() + 6) % 7) * DAY

  let id = ''
  let cwd = ''
  let title = ''
  let lastMs = 0
  let lastType = ''
  let turnBalance = 0
  let turnsToday = 0
  let tokensToday = 0
  let tokensWeek = 0
  let lastTool = null
  const toolOpen = new Map()
  const asked = new Map()
  const decided = new Set()

  for (const line of text.split('\n')) {
    if (line.trim() === '') continue
    let event
    try {
      event = JSON.parse(line)
    } catch {
      continue
    }
    const type = event.type
    const data = event.data ?? {}
    const tsMs = Number(event.time ?? 0)
    if (type === 'session') {
      id = event.id ?? id
      cwd = event.cwd ?? cwd
      continue
    }
    if (tsMs > 0) {
      lastMs = Math.max(lastMs, tsMs)
      lastType = type
    }
    switch (type) {
      case 'session/title':
        if (typeof data.title === 'string' && data.title !== '') title = data.title
        break
      case 'turn/start':
        turnBalance += 1
        if (tsMs >= today0) turnsToday += 1
        break
      case 'turn/end':
        turnBalance = Math.max(0, turnBalance - 1)
        break
      case 'assistant/message': {
        const tokens = (data.usage ?? {}).totalTokens ?? 0
        if (tsMs >= today0) tokensToday += tokens
        if (tsMs >= week0) tokensWeek += tokens
        break
      }
      case 'tool/call':
        lastTool = { name: data.name ?? '', args: data.arguments ?? '', at: tsMs }
        toolOpen.set(data.callId, data.name ?? '')
        break
      case 'tool/result':
        toolOpen.delete(data.toolCallId)
        break
      case 'approval/asked':
        asked.set(data.id, data)
        break
      case 'approval/decided':
        decided.add(data.id)
        break
      default:
        break
    }
  }

  const age = lastMs > 0 ? now - lastMs : Number.POSITIVE_INFINITY
  const pending = [...asked.entries()].filter(([askedId]) => !decided.has(askedId)).map(([, value]) => value)
  const waitingForAnswer = [...toolOpen.values()].includes('ask_user_question')

  let status = 'resting'
  let label = '空闲待机'
  if (pending.length > 0) {
    status = 'need_me'
    label = '等待你确认：' + short(pending[0].reason ?? pending[0].toolName ?? '操作', 56)
  } else if (waitingForAnswer) {
    status = 'need_me'
    label = '等待你回答问题'
  } else if (turnBalance > 0) {
    if (age > Number(cache.stuckMs ?? 600000)) {
      status = 'stuck'
      label = '执行停滞 ' + Math.floor(age / 60000) + ' 分钟'
    } else {
      status = 'working'
      label = lastTool === null ? '处理任务中' : actionText(lastTool.name, lastTool.args)
    }
  } else if ((lastType === 'turn/end' || lastType === 'deliverables/presented') && age < Number(cache.doneMs ?? 180000)) {
    status = 'done'
    label = '任务完成'
  }

  const rec = {
    id: id !== '' ? id : base(file.replace('/session.v4.jsonl.zstd', '')),
    cwd,
    title,
    lastTime: lastMs,
    ageMs: Number.isFinite(age) ? age : 0,
    open: turnBalance > 0,
    status,
    label,
    turnsToday,
    tokensToday,
    tokensWeek,
    lastTool: lastTool === null ? '' : lastTool.name,
  }
  cache.set(file, { key, rec })
  return rec
}

/** 扫一遍会话目录，返回面板消息。 */
export function createNightShiftStore(options = {}) {
  const sessionsDir = options.sessionsDir ?? join(process.env.DSH_HOME || join(homedir(), '.dsh'), 'sessions')
  const maxAgents = Number(options.maxAgents ?? 8)
  const activeWindowMs = Number(options.activeWindowHours ?? 48) * 3600 * 1000
  const cache = new Map()
  cache.stuckMs = 600000
  cache.doneMs = 180000

  function files() {
    const out = []
    let spaces = []
    try {
      spaces = readdirSync(sessionsDir, { withFileTypes: true }).filter(entry => entry.isDirectory())
    } catch {
      return out
    }
    for (const space of spaces) {
      let sessions = []
      try {
        sessions = readdirSync(join(sessionsDir, space.name), { withFileTypes: true }).filter(entry => entry.isDirectory())
      } catch {
        continue
      }
      for (const session of sessions) {
        out.push(join(sessionsDir, space.name, session.name, 'session.v4.jsonl.zstd'))
      }
    }
    return out
  }

  function collect() {
    const recs = []
    const now = Date.now()
    for (const file of files()) {
      // 先用文件 mtime 过滤：超过活跃窗口的日志不再解压（计入本周用量的窗口与其一致）
      let stat
      try {
        stat = statSync(file)
      } catch {
        continue
      }
      if (now - stat.mtimeMs > activeWindowMs) continue
      const rec = parseSession(file, cache)
      if (rec === null) continue
      if (rec.ageMs > activeWindowMs && !rec.open) continue
      recs.push(rec)
    }
    // 按团队分组后轮转挑选：保证多个团队（楼层）都能出现
    const byTeam = new Map()
    for (const rec of recs) {
      const team = teamOf(rec.cwd)
      if (!byTeam.has(team)) byTeam.set(team, [])
      byTeam.get(team).push(rec)
    }
    for (const list of byTeam.values()) {
      list.sort((a, b) => {
        if (a.open !== b.open) return a.open ? -1 : 1
        return b.lastTime - a.lastTime
      })
    }
    const teams = [...byTeam.keys()]
    const picked = []
    const perTeam = new Map()
    let round = 0
    while (picked.length < maxAgents) {
      let added = false
      for (const team of teams) {
        const list = byTeam.get(team)
        if (list.length <= round) continue
        if ((perTeam.get(team) ?? 0) >= 6) continue
        picked.push(list[round])
        perTeam.set(team, (perTeam.get(team) ?? 0) + 1)
        added = true
        if (picked.length >= maxAgents) break
      }
      if (!added) break
      round += 1
    }
    return picked
  }

  function buildAgents(recs) {
    const totalWeek = recs.reduce((sum, rec) => sum + rec.tokensWeek, 0)
    let shares = recs.map(() => 0)
    if (totalWeek > 0) {
      const raw = recs.map(rec => (rec.tokensWeek / totalWeek) * 100)
      const ints = raw.map(value => Math.floor(value))
      let rest = 100 - ints.reduce((sum, value) => sum + value, 0)
      const order = raw
        .map((value, index) => ({ index, frac: value - ints[index] }))
        .sort((a, b) => b.frac - a.frac)
      for (const item of order.slice(0, Math.max(0, rest))) ints[item.index] += 1
      shares = ints
    }
    const used = new Map()
    return recs.map((rec, index) => {
      let name = short(rec.title !== '' ? rec.title : base(rec.cwd), 16) || '会话' + rec.id.slice(-4)
      const count = (used.get(name) ?? 0) + 1
      used.set(name, count)
      if (count > 1) name = name.slice(0, 14) + count
      return {
        id: aid(rec.id),
        name,
        team: teamOf(rec.cwd),
        color: COLORS[index % COLORS.length],
        shape: SHAPES[index % SHAPES.length],
        schedule: rec.open ? '运行中 · ' + humanAge(rec.ageMs / 1000) : '最后活跃 ' + humanAge(rec.ageMs / 1000),
        runs_today: rec.turnsToday,
        usage_pct: shares[index],
        tokens_today: rec.tokensToday,
        tokens_week: rec.tokensWeek,
        status: rec.status,
      }
    })
  }

  function state() {
    const recs = collect()
    const agents = buildAgents(recs)
    const tokensWeek = recs.reduce((sum, rec) => sum + rec.tokensWeek, 0)
    const tokensToday = recs.reduce((sum, rec) => sum + rec.tokensToday, 0)
    const roster = { type: 'roster', snapshot: true, agents, bots: agents }
    const usage = { type: 'usage', tokens_week: tokensWeek, tokens_today: tokensToday, span: '本周（周一至今）', agents: recs.length }
    const events = recs.map(rec => ({
      type: 'event',
      bot: aid(rec.id),
      status: rec.status,
      text: short(rec.label, 80),
      runs_today: rec.turnsToday,
    }))
    return { generatedAt: Date.now(), messages: [roster, usage], events, sessions: recs.length }
  }

  return { state, sessionsDir, files }
}
