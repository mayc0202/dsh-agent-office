import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'

const API = '/night-shift/api/state'
const FLOOR_GAP = 3.8
const W = 14
const D = 9
const TEAM_COLORS = ['#3de1c6', '#5b8cff', '#a78bfa', '#ffb86b']
const STATUS = {
  working: { label: '工作中', color: '#3de1c6' },
  need_me: { label: '等待中', color: '#ffb86b' },
  stuck: { label: '卡住', color: '#ff6b6b' },
  done: { label: '已完成', color: '#7dd3a0' },
  resting: { label: '待机', color: '#6b7280' },
}

const $ = selector => document.querySelector(selector)
const fmt = value => {
  const n = Number(value) || 0
  if (n >= 1e9) return (n / 1e9).toFixed(2) + 'B'
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M'
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'k'
  return String(Math.round(n))
}
const esc = value => String(value ?? '').replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch])
const clamp = (v, a, b) => Math.max(a, Math.min(b, v))

/* ---------------- 场景 ---------------- */
const stage = $('#stage')
const labelLayer = $('#labels')
const scene = new THREE.Scene()
scene.background = new THREE.Color(0x05070a)
scene.fog = new THREE.FogExp2(0x05070a, 0.0085)

const camera = new THREE.PerspectiveCamera(38, stage.clientWidth / Math.max(1, stage.clientHeight), 0.1, 400)
camera.position.set(17, 13, 20)

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' })
renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1))
renderer.setSize(stage.clientWidth, stage.clientHeight)
renderer.toneMapping = THREE.ACESFilmicToneMapping
renderer.toneMappingExposure = 1.32
renderer.outputColorSpace = THREE.SRGBColorSpace
stage.appendChild(renderer.domElement)

const composer = new EffectComposer(renderer)
composer.addPass(new RenderPass(scene, camera))
const bloom = new UnrealBloomPass(new THREE.Vector2(stage.clientWidth, stage.clientHeight), 0.3, 0.65, 0.9)
composer.addPass(bloom)

const labelRenderer = new CSS2DRenderer()
labelRenderer.setSize(stage.clientWidth, stage.clientHeight)
Object.assign(labelRenderer.domElement.style, { position: 'absolute', inset: '0', pointerEvents: 'none' })
labelLayer.appendChild(labelRenderer.domElement)

const controls = new OrbitControls(camera, renderer.domElement)
controls.enableDamping = true
controls.dampingFactor = 0.07
controls.enablePan = false
controls.minDistance = 12
controls.maxDistance = 80
controls.minPolarAngle = 0.32
controls.maxPolarAngle = 1.48
controls.target.set(0, 2.4, 0)

scene.add(new THREE.HemisphereLight(0x45607f, 0x070c12, 1.45))
const key = new THREE.DirectionalLight(0xdfe9ff, 1.8)
key.position.set(14, 28, 12)
scene.add(key)
const rim = new THREE.DirectionalLight(0x3de1c6, 0.7)
rim.position.set(-18, 12, -16)
scene.add(rim)
const fill = new THREE.DirectionalLight(0x8fb3d9, 0.5)
fill.position.set(-10, 9, 20)
scene.add(fill)

// 地面 + 网格
const ground = new THREE.Mesh(
  new THREE.CircleGeometry(80, 64),
  new THREE.MeshStandardMaterial({ color: 0x080d13, roughness: 0.88, metalness: 0.25 }),
)
ground.rotation.x = -Math.PI / 2
ground.position.y = -1.2
scene.add(ground)
const grid = new THREE.GridHelper(180, 60, 0x101823, 0x0b1118)
grid.position.y = -1.18
grid.material.transparent = true
grid.material.opacity = 0.55
scene.add(grid)

// 地平线光晕
const halo = new THREE.Mesh(
  new THREE.RingGeometry(40, 41.2, 96),
  new THREE.MeshBasicMaterial({ color: 0x14324a, transparent: true, opacity: 0.5, side: THREE.DoubleSide }),
)
halo.rotation.x = -Math.PI / 2
halo.position.y = -1.15
scene.add(halo)

const shadowTexture = (() => {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 128
  const ctx = canvas.getContext('2d')
  const grad = ctx.createRadialGradient(64, 64, 0, 64, 64, 64)
  grad.addColorStop(0, 'rgba(0,0,0,.68)')
  grad.addColorStop(0.5, 'rgba(0,0,0,.32)')
  grad.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, 128, 128)
  return new THREE.CanvasTexture(canvas)
})()

const glowTexture = (() => {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 128
  const ctx = canvas.getContext('2d')
  const grad = ctx.createRadialGradient(64, 64, 0, 64, 64, 64)
  grad.addColorStop(0, 'rgba(255,255,255,1)')
  grad.addColorStop(0.35, 'rgba(255,255,255,.45)')
  grad.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, 128, 128)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
})()

/* ---------------- 霓虹招牌 / 星尘 ---------------- */
const neonSign = (() => {
  const canvas = document.createElement('canvas')
  canvas.width = 1024
  canvas.height = 192
  const ctx = canvas.getContext('2d')
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  ctx.font = '900 92px Inter, "PingFang SC", system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.shadowColor = 'rgba(61,225,198,.9)'
  ctx.shadowBlur = 42
  ctx.fillStyle = '#eafffb'
  ctx.fillText('NIGHT SHIFT', 512, 78)
  ctx.shadowBlur = 0
  ctx.font = '500 30px ui-monospace, Menlo, monospace'
  ctx.fillStyle = 'rgba(138,148,163,.9)'
  ctx.fillText('DEEPSEEK HARNESS · SESSION OFFICE', 512, 150)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false }))
  sprite.scale.set(5.6, 1.05, 1)
  sprite.position.set(0, 5, 0)
  scene.add(sprite)
  return sprite
})()

const dust = (() => {
  const count = 320
  const positions = new Float32Array(count * 3)
  for (let i = 0; i < count; i++) {
    positions[i * 3] = (Math.random() - 0.5) * 70
    positions[i * 3 + 1] = Math.random() * 26 - 1
    positions[i * 3 + 2] = (Math.random() - 0.5) * 70
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  const points = new THREE.Points(geometry, new THREE.PointsMaterial({ color: 0x7fa8c9, size: 0.055, transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending }))
  scene.add(points)
  return points
})()

/* ---------------- 数据状态 ---------------- */
let agents = []
let floors = []
let usage = { tokens_week: 0, tokens_today: 0, span: '本周（周一至今）' }
let selectedId = null
let hoveredId = null
let structureSig = ''
let state = 'idle'
const agentObjects = new Map() // id -> { root, ring, glow, monitor, label, body, hoverT }
const floorObjects = []
const activities = []
const lastSeen = new Map()
let cameraGoal = null
let targetGoal = null

function toastEvent(agent, status, text) {
  const prev = lastSeen.get(agent.id)
  const sig = status + '|' + text
  if (prev === sig) return
  lastSeen.set(agent.id, sig)
  if (status === 'resting' && prev === undefined) return
  activities.unshift({ time: Date.now(), id: agent.id, name: agent.name, status, text })
  activities.length = Math.min(activities.length, 5)
}

/* ---------------- 构建 ---------------- */
function teamList(list) {
  const seen = []
  for (const agent of list) {
    if (!seen.includes(agent.team)) seen.push(agent.team)
  }
  return seen.slice(0, 4)
}

function disposeGroup(group) {
  group.traverse(object => {
    if (object.geometry) object.geometry.dispose()
    if (object.material) {
      const materials = Array.isArray(object.material) ? object.material : [object.material]
      for (const material of materials) {
        if (material.map && material.map !== glowTexture) material.map.dispose()
        material.dispose()
      }
    }
  })
}

function cssLabel(className, html) {
  const div = document.createElement('div')
  div.className = className
  div.innerHTML = html
  return new CSS2DObject(div)
}

function buildFloor(team, index, teamAgents) {
  const group = new THREE.Group()
  group.position.set(index * 2.4, index * FLOOR_GAP, -index * 2.9)
  const color = TEAM_COLORS[index % TEAM_COLORS.length]
  const teamColor = new THREE.Color(color)

  const slab = new THREE.Mesh(
    new THREE.BoxGeometry(W, 0.5, D),
    new THREE.MeshStandardMaterial({ color: 0x1b2534, roughness: 0.66, metalness: 0.42 }),
  )
  slab.position.y = -0.25
  group.add(slab)

  // 地板纹理
  const floorCanvas = document.createElement('canvas')
  floorCanvas.width = 256
  floorCanvas.height = 256
  const fctx = floorCanvas.getContext('2d')
  fctx.fillStyle = '#1b2533'
  fctx.fillRect(0, 0, 256, 256)
  fctx.strokeStyle = 'rgba(80,110,150,.16)'
  fctx.lineWidth = 2
  for (let i = 0; i <= 256; i += 64) {
    fctx.beginPath(); fctx.moveTo(i, 0); fctx.lineTo(i, 256); fctx.stroke()
    fctx.beginPath(); fctx.moveTo(0, i); fctx.lineTo(256, i); fctx.stroke()
  }
  const floorTexture = new THREE.CanvasTexture(floorCanvas)
  floorTexture.wrapS = floorTexture.wrapT = THREE.RepeatWrapping
  floorTexture.repeat.set(4, 2.5)
  floorTexture.colorSpace = THREE.SRGBColorSpace
  const floorTop = new THREE.Mesh(
    new THREE.PlaneGeometry(W - 0.1, D - 0.1),
    new THREE.MeshStandardMaterial({ map: floorTexture, roughness: 0.78, metalness: 0.28 }),
  )
  floorTop.rotation.x = -Math.PI / 2
  floorTop.position.y = 0.012
  group.add(floorTop)

  // 地板拼缝
  const seamMat = new THREE.LineBasicMaterial({ color: 0x22303f, transparent: true, opacity: 0.5 })
  for (let gx = -W / 2 + 2; gx < W / 2; gx += 2) {
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(gx, 0.01, -D / 2), new THREE.Vector3(gx, 0.01, D / 2)]), seamMat)
    group.add(line)
  }

  // 四角立柱
  const columnMat = new THREE.MeshStandardMaterial({ color: 0x1a2532, roughness: 0.6, metalness: 0.5 })
  for (const [cx, cz] of [[-W / 2 + 0.25, -D / 2 + 0.25], [W / 2 - 0.25, -D / 2 + 0.25], [-W / 2 + 0.25, D / 2 - 0.25], [W / 2 - 0.25, D / 2 - 0.25]]) {
    const col = new THREE.Mesh(new THREE.BoxGeometry(0.2, 3.3, 0.2), columnMat)
    col.position.set(cx, 1.65, cz)
    group.add(col)
    const cap = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.06, 0.26), new THREE.MeshBasicMaterial({ color: teamColor, transparent: true, opacity: 0.85 }))
    cap.position.set(cx, 3.32, cz)
    group.add(cap)
  }

  const edge = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(W + 0.04, 0.54, D + 0.04)),
    new THREE.LineBasicMaterial({ color: teamColor, transparent: true, opacity: 0.42 }),
  )
  group.add(edge)

  // 墙面编号牌
  const boardCanvas = document.createElement('canvas')
  boardCanvas.width = 512
  boardCanvas.height = 256
  const bctx = boardCanvas.getContext('2d')
  bctx.clearRect(0, 0, 512, 256)
  bctx.fillStyle = 'rgba(61,225,198,.10)'
  bctx.fillRect(0, 0, 512, 256)
  bctx.font = '900 150px ui-monospace, Menlo, monospace'
  bctx.fillStyle = 'rgba(233,238,245,.16)'
  bctx.textAlign = 'center'
  bctx.textBaseline = 'middle'
  bctx.fillText(String(index + 1).padStart(2, '0'), 256, 118)
  bctx.font = '600 28px ui-monospace, Menlo, monospace'
  bctx.fillStyle = 'rgba(233,238,245,.5)'
  bctx.fillText(team.toUpperCase(), 256, 215)
  const boardTexture = new THREE.CanvasTexture(boardCanvas)
  boardTexture.colorSpace = THREE.SRGBColorSpace
  const board = new THREE.Mesh(
    new THREE.PlaneGeometry(3.2, 1.6),
    new THREE.MeshBasicMaterial({ map: boardTexture, transparent: true, depthWrite: false }),
  )
  board.position.set(-W * 0.22, 1.9, -D / 2 + 0.36)
  group.add(board)

  // 吊灯
  const shadeMat = new THREE.MeshStandardMaterial({ color: 0x18202b, roughness: 0.6, metalness: 0.6 })
  const bulbMat = new THREE.MeshBasicMaterial({ color: 0xfff0d8 })
  for (const lx of [-3.4, 0, 3.4]) {
    const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 1.0, 4), shadeMat)
    cord.position.set(lx, 2.95, -1.2)
    group.add(cord)
    const shade = new THREE.Mesh(new THREE.ConeGeometry(0.36, 0.3, 12, 1, true), shadeMat)
    shade.position.set(lx, 2.4, -1.2)
    group.add(shade)
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 10), bulbMat)
    bulb.position.set(lx, 2.26, -1.2)
    group.add(bulb)
    const lampLight = new THREE.PointLight(0xffe6c2, 3.2, 9, 2)
    lampLight.position.set(lx, 2.2, -1.2)
    group.add(lampLight)
  }

  // 背墙
  const wall = new THREE.Mesh(
    new THREE.BoxGeometry(W, 3.4, 0.3),
    new THREE.MeshStandardMaterial({ color: 0x16202d, roughness: 0.8, metalness: 0.32 }),
  )
  wall.position.set(0, 1.7, -D / 2 + 0.15)
  group.add(wall)
  const neon = new THREE.Mesh(
    new THREE.PlaneGeometry(W * 0.58, 0.1),
    new THREE.MeshBasicMaterial({ color: teamColor, transparent: true, opacity: 0.55 }),
  )
  neon.position.set(0, 2.55, -D / 2 + 0.32)
  group.add(neon)
  const wash = new THREE.Mesh(
    new THREE.PlaneGeometry(W * 0.6, 1.2),
    new THREE.MeshBasicMaterial({ color: teamColor, transparent: true, opacity: 0.05, side: THREE.DoubleSide }),
  )
  wash.position.set(0, 1.9, -D / 2 + 0.31)
  group.add(wash)

  // 墙面窗带
  const mullionMat = new THREE.MeshStandardMaterial({ color: 0x0e151d, roughness: 0.7, metalness: 0.4 })
  for (const wy of [1.2, 2.0]) {
    const ribbon = new THREE.Mesh(
      new THREE.BoxGeometry(W - 0.4, 0.5, 0.03),
      new THREE.MeshBasicMaterial({ color: 0x2b3f57, transparent: true, opacity: 0.35 }),
    )
    ribbon.position.set(0, wy, -D / 2 + 0.33)
    group.add(ribbon)
  }
  for (let mx = -W / 2 + 1; mx < W / 2; mx += 1.4) {
    const mullion = new THREE.Mesh(new THREE.BoxGeometry(0.04, 2.0, 0.03), mullionMat)
    mullion.position.set(mx, 1.55, -D / 2 + 0.35)
    group.add(mullion)
  }

  // 墙面竖向灯条
  for (const wx of [-W * 0.36, W * 0.36]) {
    const strip = new THREE.Mesh(
      new THREE.BoxGeometry(0.06, 2.4, 0.05),
      new THREE.MeshBasicMaterial({ color: teamColor, transparent: true, opacity: 0.55 }),
    )
    strip.position.set(wx, 1.45, -D / 2 + 0.34)
    group.add(strip)
  }
  // 服务器机柜
  const rack = new THREE.Mesh(
    new THREE.BoxGeometry(0.9, 2.0, 0.7),
    new THREE.MeshStandardMaterial({ color: 0x0d131b, roughness: 0.6, metalness: 0.5 }),
  )
  rack.position.set(W / 2 - 1.1, 1.0, -D / 2 + 0.9)
  group.add(rack)
  const ledColors = [0x3de1c6, 0x7dd3a0, 0xffb86b, 0x5b8cff]
  for (let r = 0; r < 6; r++) {
    const led = new THREE.Mesh(
      new THREE.BoxGeometry(0.3, 0.03, 0.02),
      new THREE.MeshBasicMaterial({ color: ledColors[r % ledColors.length] }),
    )
    led.position.set(W / 2 - 1.1, 0.35 + r * 0.28, -D / 2 + 1.26)
    group.add(led)
  }

  // 楼层牌
  const floorLabel = cssLabel('floorlbl', `FLOOR ${String(index + 1).padStart(2, '0')} <b>${esc(team)}</b> · ${teamAgents.length} 个会话`)
  floorLabel.center.set(0.5, 0.5)
  floorLabel.position.set(0, 3.15, -D / 2 + 0.35)
  group.add(floorLabel)

  // 点光
  const point = new THREE.PointLight(teamColor, 6, 18, 2)
  point.position.set(0, 2.2, -2)
  group.add(point)
  const ceiling = new THREE.PointLight(0xdfe9ff, 7, 16, 2)
  ceiling.position.set(0, 3.0, 1.2)
  group.add(ceiling)

  // 桌面 + 屏幕
  const spots = floorSpots(teamAgents.length)
  teamAgents.forEach((agent, i) => {
    const spot = spots[i]
    const dx = i % 2 === 0 ? 1.35 : -1.35
    const deskX = spot.x + dx
    const desk = new THREE.Mesh(
      new THREE.BoxGeometry(2.0, 0.1, 1.0),
      new THREE.MeshStandardMaterial({ color: 0x1e2937, roughness: 0.55, metalness: 0.45 }),
    )
    desk.position.set(deskX, 0.72, spot.z)
    group.add(desk)
    const legGeo = new THREE.BoxGeometry(0.09, 0.72, 0.09)
    const legMat = new THREE.MeshStandardMaterial({ color: 0x2a3848, roughness: 0.8 })
    for (const lx of [-0.85, 0.85]) {
      for (const lz of [-0.36, 0.36]) {
        const leg = new THREE.Mesh(legGeo, legMat)
        leg.position.set(deskX + lx, 0.36, spot.z + lz)
        group.add(leg)
      }
    }
    const screen = new THREE.Mesh(
      new THREE.PlaneGeometry(0.92, 0.54),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(agent.color || color), transparent: true, opacity: 0.5 }),
    )
    screen.position.set(deskX, 1.16, spot.z + 0.05)
    screen.rotation.x = -0.2
    group.add(screen)
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.26, 6), legMat)
    stem.position.set(deskX, 0.85, spot.z + 0.05)
    group.add(stem)
    const keyboard = new THREE.Mesh(
      new THREE.BoxGeometry(0.6, 0.03, 0.2),
      new THREE.MeshStandardMaterial({ color: 0x2f3d4d, roughness: 0.7 }),
    )
    keyboard.position.set(deskX, 0.79, spot.z + 0.42)
    group.add(keyboard)
    const chairMat = new THREE.MeshStandardMaterial({ color: 0x27333f, roughness: 0.75 })
    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.07, 0.5), chairMat)
    seat.position.set(deskX, 0.46, spot.z + 0.95)
    group.add(seat)
    const back = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.55, 0.06), chairMat)
    back.position.set(deskX, 0.75, spot.z + 1.2)
    group.add(back)

    group.add(buildAgent(agent, spot, index, screen))
  })

  // 角落绿植
  const leafMat = new THREE.MeshStandardMaterial({ color: 0x1c5c46, roughness: 0.7, emissive: 0x0a2118, emissiveIntensity: 0.6 })
  const potMat = new THREE.MeshStandardMaterial({ color: 0x1b2028, roughness: 0.85 })
  for (const [x, z] of [[-W / 2 + 1.3, -D / 2 + 1.2], [W / 2 - 1.3, D / 2 - 1.4]]) {
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.26, 0.42, 10), potMat)
    pot.position.set(x, 0.21, z)
    group.add(pot)
    const leaves = new THREE.Mesh(new THREE.IcosahedronGeometry(0.5, 1), leafMat)
    leaves.position.set(x, 0.82, z)
    leaves.scale.set(1, 1.28, 1)
    group.add(leaves)
  }

  return { group, color, team }
}

function floorSpots(count) {
  const base = [
    [-4.6, -1.7], [0, -1.7], [4.6, -1.7],
    [-4.6, 2.2], [0, 2.2], [4.6, 2.2],
    [-2.3, 0.2], [2.3, 0.2], [0, 0.2],
  ]
  return base.slice(0, clamp(count, 1, base.length)).map(([x, z]) => ({ x, z }))
}

function buildAgent(agent, spot, floorIndex, screen) {
  const group = new THREE.Group()
  group.position.set(spot.x, 0.25, spot.z)
  group.scale.setScalar(1.45)
  const color = new THREE.Color(agent.color || '#3de1c6')
  const status = STATUS[agent.status] ?? STATUS.resting

  const bodyShape = {
    cube: () => new THREE.BoxGeometry(0.66, 0.66, 0.66),
    tri: () => new THREE.ConeGeometry(0.44, 0.8, 4),
    hex: () => new THREE.CylinderGeometry(0.36, 0.4, 0.62, 6),
    ghost: () => new THREE.SphereGeometry(0.42, 24, 18),
    star: () => new THREE.OctahedronGeometry(0.46),
    orb: () => new THREE.SphereGeometry(0.42, 24, 18),
    pill: () => new THREE.CapsuleGeometry(0.3, 0.36, 8, 16),
    drop: () => new THREE.SphereGeometry(0.38, 20, 16),
    blob: () => new THREE.IcosahedronGeometry(0.44, 1),
  }
  const bodyGeo = (bodyShape[agent.shape] ?? bodyShape.cube)()
  const bodyMat = new THREE.MeshStandardMaterial({
    color,
    emissive: color,
    emissiveIntensity: 0.32,
    roughness: 0.32,
    metalness: 0.22,
  })
  const body = new THREE.Mesh(bodyGeo, bodyMat)
  body.position.y = 0.62
  group.add(body)

  // 眼睛
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0xf4fbff })
  for (const dx of [-0.13, 0.13]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.055, 10, 8), eyeMat)
    eye.position.set(dx, 0.68, 0.33)
    group.add(eye)
  }
  // 天线
  const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.34, 6), new THREE.MeshBasicMaterial({ color }))
  antenna.position.set(0.16, 1.14, 0)
  antenna.rotation.z = -0.25
  group.add(antenna)
  const tip = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffffff }))
  tip.position.set(0.2, 1.32, 0)
  group.add(tip)

  // 命中体（透明，方便射线）
  const hit = new THREE.Mesh(new THREE.SphereGeometry(0.95, 10, 8), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }))
  hit.position.y = 0.8
  hit.userData.agentId = agent.id
  group.add(hit)

  // 状态环
  const ringMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(status.color), transparent: true, opacity: 0.85, side: THREE.DoubleSide })
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.58, 0.66, 40), ringMat)
  ring.rotation.x = -Math.PI / 2
  ring.position.y = 0.02
  group.add(ring)

  // 地面光斑
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTexture,
    color: new THREE.Color(status.color),
    transparent: true,
    opacity: 0.5,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  }))
  glow.scale.set(2.4, 2.4, 1)
  glow.position.y = 0.06
  group.add(glow)

  // 接触阴影
  const contact = new THREE.Mesh(
    new THREE.PlaneGeometry(1.9, 1.9),
    new THREE.MeshBasicMaterial({ map: shadowTexture, transparent: true, opacity: 0.85, depthWrite: false }),
  )
  contact.rotation.x = -Math.PI / 2
  contact.position.y = 0.025
  group.add(contact)

  // 名字标签
  const labelDiv = document.createElement('div')
  labelDiv.className = 'lbl'
  labelDiv.innerHTML = `<span class="badge" style="background:${agent.color}"></span>${esc(agent.name)}<em>${Math.round(agent.usage_pct || 0)}%</em>`
  labelDiv.addEventListener('pointerdown', event => {
    event.stopPropagation()
    selectAgent(agent.id, true)
  })
  const label = new CSS2DObject(labelDiv)
  label.center.set(0.5, 1.15)
  label.position.set(0, 1.5, 0)
  group.add(label)

  group.userData = { agentId: agent.id, floorIndex, screen }
  return group
}

function rebuild(teamNames, list) {
  for (const group of [...scene.children]) {
    if (group.userData.tower) {
      scene.remove(group)
      disposeGroup(group)
    }
  }
  floorObjects.length = 0
  agentObjects.clear()

  const tower = new THREE.Group()
  tower.userData.tower = true
  scene.add(tower)

  teamNames.forEach((team, index) => {
    const teamAgents = list.filter(agent => agent.team === team || (team === teamNames[teamNames.length - 1] && !teamNames.includes(agent.team)))
    const { group } = buildFloor(team, index, teamAgents)
    tower.add(group)
    floorObjects.push({ group, team, index, agents: teamAgents })
    for (const agent of teamAgents) {
      const object = group.children.find(child => child.userData && child.userData.agentId === agent.id)
      if (object !== undefined) agentObjects.set(agent.id, object)
    }
  })

  const height = (teamNames.length - 1) * FLOOR_GAP
  const offsetX = ((teamNames.length - 1) * 2.4) / 2
  const offsetZ = -((teamNames.length - 1) * 2.9) / 2
  neonSign.position.set(offsetX * 2, height + 3.0, offsetZ * 2)
  const centerY = height / 2 + 1.2
  targetGoal = new THREE.Vector3(offsetX, centerY, offsetZ)
  cameraGoal = null
  controls.target.copy(targetGoal)
  const dist = 17 + teamNames.length * 3
  camera.position.set(offsetX + dist * 0.78, centerY + dist * 0.47, offsetZ + dist * 0.92)
  controls.update()
}

/* ---------------- 更新 ---------------- */
function updateAgents(list) {
  for (const agent of list) {
    const object = agentObjects.get(agent.id)
    if (object === undefined) continue
    const status = STATUS[agent.status] ?? STATUS.resting
    const ring = object.children.find(child => child.geometry instanceof THREE.RingGeometry)
    if (ring) ring.material.color.set(status.color)
    const glow = object.children.find(child => child.isSprite)
    if (glow) glow.material.color.set(status.color)
    const body = object.children.find(child => child.isMesh && child.userData.agentId === undefined && child.material && child.material.emissive)
    if (body) body.material.emissiveIntensity = agent.status === 'working' ? 0.55 : agent.status === 'stuck' ? 0.75 : 0.28
    const labelDiv = object.children.find(child => child.isCSS2DObject)?.element
    if (labelDiv) {
      labelDiv.innerHTML = `<span class="badge" style="background:${agent.color}"></span>${esc(agent.name)}<em>${Math.round(agent.usage_pct || 0)}%</em>`
      labelDiv.classList.toggle('on', selectedId === agent.id)
    }
    object.userData.status = agent.status
    const screen = object.userData.screen
    if (screen) {
      screen.material.color.set(agent.color || '#3de1c6')
      screen.material.opacity = agent.status === 'working' ? 0.55 : agent.status === 'resting' ? 0.12 : 0.3
    }
  }
}

/* ---------------- HUD ---------------- */
function renderHUD(list) {
  const counts = { working: 0, need_me: 0, stuck: 0, resting: 0 }
  for (const agent of list) {
    if (agent.status === 'working') counts.working++
    else if (agent.status === 'need_me') counts.need_me++
    else if (agent.status === 'stuck') counts.stuck++
    else counts.resting++
  }
  $('#pills').innerHTML = `
    <span class="pill working"><i></i><b>${counts.working}</b>工作中</span>
    <span class="pill need"><i></i><b>${counts.need_me}</b>等待中</span>
    <span class="pill stuck"><i></i><b>${counts.stuck}</b>卡住</span>
    <span class="pill"><i></i><b>${counts.resting}</b>待机</span>`
  $('#clock').innerHTML = `<i></i><span>实时 · ${new Date().toTimeString().slice(0, 5)}</span>`

  // 榜单
  const rows = [...list].sort((a, b) => (b.usage_pct || 0) - (a.usage_pct || 0))
  $('#boardBody').innerHTML = rows.length === 0
    ? '<div class="evt empty">暂无活跃会话</div>'
    : rows.map(agent => {
      const status = STATUS[agent.status] ?? STATUS.resting
      return `<div class="row ${agent.id === selectedId ? 'on' : ''}" data-id="${esc(agent.id)}">
        <span class="dot" style="background:${esc(agent.color)};box-shadow:0 0 8px ${esc(agent.color)}55"></span>
        <div class="row__main">
          <div class="row__name">${esc(agent.name)}</div>
          <div class="row__sub">${esc(status.label)} · ${esc(agent.schedule)}</div>
          <div class="row__bar"><i style="width:${clamp(Number(agent.usage_pct) || 0, 2, 100)}%;background:linear-gradient(90deg,${esc(agent.color)}88,${esc(agent.color)})"></i></div>
        </div>
        <span class="row__pct">${Math.round(agent.usage_pct || 0)}%</span>
      </div>`
    }).join('')

  // 楼层
  $('#floorCount').textContent = String(floors.length)
  $('#floorBody').innerHTML = floors.map((floor, index) => `
    <div class="floor ${floor.team === activeFloorTeam ? 'on' : ''}" data-team="${esc(floor.team)}">
      <span class="floor__no">${index + 1}</span>
      <span>${esc(floor.team)}</span>
      <span class="floor__ct">${floor.agents.length} 个</span>
    </div>`).join('')

  // 用量
  $('#meterBig').innerHTML = `${fmt(usage.tokens_week || 0)}<small>tokens</small>`
  $('#meterToday').textContent = fmt(usage.tokens_today || 0)
  $('#meterSpan').textContent = usage.span || '周一至今'
  const wake = list.reduce((sum, agent) => sum + (Number(agent.runs_today) || 0), 0)
  $('#meterWake').textContent = String(wake)

  // 检查
  const checks = [
    { ok: !list.some(agent => agent.status === 'stuck'), text: '没有卡住的会话' },
    { ok: !list.some(agent => agent.status === 'need_me'), text: '没有等待你确认的会话' },
    { ok: wake < 50, text: '每天唤醒少于 50 次' },
  ]
  const done = checks.filter(item => item.ok).length
  $('#checkScore').textContent = `${done}/${checks.length}`
  $('#checkBody').innerHTML = checks.map(item => `<div class="check ${item.ok ? 'ok' : ''}"><i>✓</i>${item.text}</div>`).join('')

  // 动态
  $('#feedBody').innerHTML = activities.length === 0
    ? '<div class="evt empty">等待状态变化…</div>'
    : activities.map(item => {
      const status = STATUS[item.status] ?? STATUS.resting
      return `<div class="evt"><span class="t">${new Date(item.time).toTimeString().slice(0, 5)}</span><i style="background:${status.color};box-shadow:0 0 6px ${status.color}"></i><b>${esc(item.name)}</b><span>${esc(item.text)}</span></div>`
    }).join('')

  renderCard(list.find(agent => agent.id === selectedId) ?? null)
}

let activeFloorTeam = null

function renderCard(agent) {
  const card = $('#card')
  if (agent === null) {
    card.classList.remove('show')
    return
  }
  card.classList.add('show')
  const status = STATUS[agent.status] ?? STATUS.resting
  const floorIndex = Math.max(0, floors.findIndex(floor => floor.agents.some(item => item.id === agent.id)))
  $('#cardTeam').textContent = `楼层 ${floorIndex + 1} · ${agent.team}`
  $('#cardGlyph').textContent = '◆'
  $('#cardGlyph').style.background = `linear-gradient(150deg, ${agent.color}55, ${agent.color}18)`
  $('#cardGlyph').style.color = agent.color
  $('#cardGlyph').style.border = `1px solid ${agent.color}66`
  $('#cardName').textContent = agent.name
  $('#cardSub').textContent = agent.schedule
  const statusEl = $('#cardStatus')
  statusEl.textContent = `● ${status.label}`
  statusEl.style.color = status.color
  statusEl.style.borderColor = status.color + '66'
  statusEl.style.background = status.color + '18'
  $('#cardRuns').textContent = String(agent.runs_today ?? 0)
  $('#cardShare').textContent = `${Math.round(agent.usage_pct || 0)}%`
  $('#cardTokens').textContent = fmt(agent.tokens_today || 0)
  $('#cardSched').textContent = agent.schedule
  $('#cardNow').textContent = agent.status === 'resting' ? '空闲待机' : (lastText[agent.id] ?? '—')
}

/* ---------------- 选择/聚焦 ---------------- */
const lastText = new Map()

function selectAgent(id, focus = false) {
  selectedId = id
  renderHUD(agents)
  for (const [agentId, object] of agentObjects) {
    const labelDiv = object.children.find(child => child.isCSS2DObject)?.element
    if (labelDiv) labelDiv.classList.toggle('on', agentId === id)
  }
  if (focus) {
    const object = agentObjects.get(id)
    if (object) {
      const world = new THREE.Vector3()
      object.getWorldPosition(world)
      targetGoal = new THREE.Vector3(world.x, world.y + 1.0, world.z)
      const offset = new THREE.Vector3().subVectors(camera.position, controls.target).normalize().multiplyScalar(17)
      cameraGoal = targetGoal.clone().add(new THREE.Vector3(offset.x, Math.max(8, offset.y), offset.z))
    }
  }
}

function clearSelection() {
  selectedId = null
  renderHUD(agents)
  for (const [, object] of agentObjects) {
    const labelDiv = object.children.find(child => child.isCSS2DObject)?.element
    if (labelDiv) labelDiv.classList.remove('on')
  }
}

/* ---------------- 交互 ---------------- */
const raycaster = new THREE.Raycaster()
const pointer = new THREE.Vector2()
let pointerDown = null

function pickAgent(event) {
  const rect = renderer.domElement.getBoundingClientRect()
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1
  raycaster.setFromCamera(pointer, camera)
  const hits = []
  for (const object of agentObjects.values()) {
    object.traverse(child => {
      if (child.isMesh && child.userData.agentId !== undefined) hits.push(child)
    })
  }
  const hit = raycaster.intersectObjects(hits, false)[0]
  return hit === undefined ? null : hit.object.userData.agentId
}

renderer.domElement.addEventListener('pointerdown', event => {
  pointerDown = { x: event.clientX, y: event.clientY }
})
renderer.domElement.addEventListener('pointerup', event => {
  if (pointerDown === null) return
  const moved = Math.hypot(event.clientX - pointerDown.x, event.clientY - pointerDown.y)
  pointerDown = null
  if (moved > 6) return
  const id = pickAgent(event)
  if (id !== null) selectAgent(id, true)
  else clearSelection()
})
renderer.domElement.addEventListener('pointermove', event => {
  const id = pickAgent(event)
  if (id === hoveredId) return
  hoveredId = id
  renderer.domElement.style.cursor = id === null ? 'grab' : 'pointer'
})
renderer.domElement.addEventListener('pointerleave', () => {
  hoveredId = null
  renderer.domElement.style.cursor = 'grab'
})

document.addEventListener('pointerdown', event => {
  if (event.target.closest('#boardBody') === null) return
  const row = event.target.closest('.row')
  if (row !== null) selectAgent(row.dataset.id, true)
})
document.addEventListener('pointerdown', event => {
  const floor = event.target.closest('.floor')
  if (floor === null) return
  const team = floor.dataset.team
  activeFloorTeam = team
  const index = floors.findIndex(item => item.team === team)
  if (index >= 0) {
    targetGoal = new THREE.Vector3(0, index * FLOOR_GAP + 1.2, 0)
    cameraGoal = null
  }
  renderHUD(agents)
})
$('#cardx').addEventListener('click', clearSelection)
document.addEventListener('keydown', event => {
  if (event.key === 'Escape') clearSelection()
})
window.addEventListener('resize', () => {
  const w = stage.clientWidth
  const h = Math.max(1, stage.clientHeight)
  camera.aspect = w / h
  camera.updateProjectionMatrix()
  renderer.setSize(w, h)
  composer.setSize(w, h)
  bloom.setSize(w, h)
  labelRenderer.setSize(w, h)
})

/* ---------------- 数据 ---------------- */
async function poll() {
  try {
    const response = await fetch(API, { cache: 'no-store' })
    if (!response.ok) throw new Error('HTTP ' + response.status)
    const data = await response.json()
    $('#offline').classList.remove('show')
    const roster = (data.messages ?? []).find(message => message.type === 'roster')
    const usageMessage = (data.messages ?? []).find(message => message.type === 'usage')
    const list = roster?.agents ?? []
    usage = usageMessage ?? usage
    const teams = teamList(list)
    const sig = JSON.stringify({ teams, ids: list.map(agent => agent.id), structure: list.map(agent => agent.team) })
    if (sig !== structureSig) {
      structureSig = sig
      agents = list
      rebuild(teams, list)
      floors = floorObjects.map(floor => ({ team: floor.team, agents: floor.agents }))
      if (selectedId !== null && !agentObjects.has(selectedId)) clearSelection()
    } else {
      agents = list
      floors = floorObjects.map(floor => ({ team: floor.team, agents: list.filter(agent => agent.team === floor.team) }))
      updateAgents(list)
    }
    for (const event of data.events ?? []) lastText.set(event.bot, event.text)
    for (const agent of list) toastEvent(agent, agent.status, lastText.get(agent.id) ?? '')
    renderHUD(list)
  } catch (error) {
    $('#offline').classList.add('show')
  }
}

/* ---------------- 动画 ---------------- */
const clock = new THREE.Clock()
function tick() {
  const t = clock.getElapsedTime()
  requestAnimationFrame(tick)

  for (const [id, object] of agentObjects) {
    const status = object.userData.status ?? 'resting'
    const ring = object.children.find(child => child.geometry instanceof THREE.RingGeometry)
    const glow = object.children.find(child => child.isSprite)
    if (status === 'working') {
      const pulse = 1 + Math.sin(t * 3.2) * 0.08
      if (ring) ring.scale.set(pulse, pulse, 1)
      if (glow) glow.material.opacity = 0.42 + Math.sin(t * 3.2) * 0.12
    } else if (status === 'stuck') {
      if (ring) ring.rotation.z = t * 2.4
      if (glow) glow.material.opacity = 0.35 + Math.sin(t * 8) * 0.2
    } else if (status === 'need_me') {
      if (ring) ring.scale.setScalar(1 + Math.sin(t * 5) * 0.1)
      if (glow) glow.material.opacity = 0.3
    } else {
      if (ring) ring.scale.setScalar(1)
      if (glow) glow.material.opacity = 0.16
    }
    if (id === selectedId && ring) ring.scale.multiplyScalar(1.25)
    const labelDiv = object.children.find(child => child.isCSS2DObject)?.element
    if (labelDiv) labelDiv.classList.toggle('on', id === selectedId)
  }

  if (cameraGoal !== null) {
    camera.position.lerp(cameraGoal, 0.08)
    if (camera.position.distanceTo(cameraGoal) < 0.25) cameraGoal = null
  }
  if (targetGoal !== null) {
    controls.target.lerp(targetGoal, 0.08)
    if (controls.target.distanceTo(targetGoal) < 0.05) targetGoal = null
  }
  controls.update()
  dust.rotation.y = t * 0.012
  composer.render()
  labelRenderer.render(scene, camera)
}

/* ---------------- 调试 ---------------- */
window.__NS = { scene, camera, controls, get agents() { return agents }, get floors() { return floors }, agentObjects }

/* ---------------- 启动 ---------------- */
rebuild([], [])
renderHUD([])
poll()
setInterval(poll, 2000)
tick()
setTimeout(() => $('#hint').classList.add('hide'), 8000)
