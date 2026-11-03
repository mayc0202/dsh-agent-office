import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'

const API = '/night-shift/api/state'
const FLOOR_GAP = 4.7
const W = 15
const D = 10
const OFFSET_X = 2.3
const OFFSET_Z = -2.7
const TEAM_COLORS = ['#3de1c6', '#6f9bff', '#b18cff', '#ffb86b']
const STATUS = {
  working: { label: '工作中', color: '#3de1c6' },
  need_me: { label: '等待中', color: '#ffb86b' },
  stuck: { label: '卡住', color: '#ff6b6b' },
  done: { label: '已完成', color: '#7dd3a0' },
  resting: { label: '待机', color: '#7d8797' },
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

/* ------------------------------------------------------------------ *
 * 渲染器 / 相机
 * ------------------------------------------------------------------ */
const stage = $('#stage')
const labelLayer = $('#labels')
const scene = new THREE.Scene()
scene.background = new THREE.Color(0x04070b)
scene.fog = new THREE.FogExp2(0x04070b, 0.006)

const camera = new THREE.PerspectiveCamera(36, stage.clientWidth / Math.max(1, stage.clientHeight), 0.1, 400)
camera.position.set(16, 12, 20)

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' })
renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1))
renderer.setSize(stage.clientWidth, stage.clientHeight)
renderer.toneMapping = THREE.ACESFilmicToneMapping
renderer.toneMappingExposure = 1.34
renderer.outputColorSpace = THREE.SRGBColorSpace
stage.appendChild(renderer.domElement)

const composer = new EffectComposer(renderer)
composer.addPass(new RenderPass(scene, camera))
const bloom = new UnrealBloomPass(new THREE.Vector2(stage.clientWidth, stage.clientHeight), 0.32, 0.7, 0.86)
composer.addPass(bloom)

const labelRenderer = new CSS2DRenderer()
labelRenderer.setSize(stage.clientWidth, stage.clientHeight)
Object.assign(labelRenderer.domElement.style, { position: 'absolute', inset: '0', pointerEvents: 'none' })
labelLayer.appendChild(labelRenderer.domElement)

const controls = new OrbitControls(camera, renderer.domElement)
controls.enableDamping = true
controls.dampingFactor = 0.075
controls.enablePan = false
controls.minDistance = 12
controls.maxDistance = 90
controls.minPolarAngle = 0.28
controls.maxPolarAngle = 1.44
controls.target.set(0, 2.4, 0)

/* ------------------------------------------------------------------ *
 * 光照 / 环境
 * ------------------------------------------------------------------ */
scene.add(new THREE.HemisphereLight(0x4a6a8c, 0x060a10, 1.45))
const key = new THREE.DirectionalLight(0xe8f1ff, 1.95)
key.position.set(16, 30, 18)
scene.add(key)
const rim = new THREE.DirectionalLight(0x3de1c6, 0.55)
rim.position.set(-20, 14, -18)
scene.add(rim)
const fill = new THREE.DirectionalLight(0x88a9cc, 0.55)
fill.position.set(-12, 8, 20)
scene.add(fill)

const ground = new THREE.Mesh(
  new THREE.CircleGeometry(90, 72),
  new THREE.MeshStandardMaterial({ color: 0x060a10, roughness: 0.9, metalness: 0.25 }),
)
ground.rotation.x = -Math.PI / 2
ground.position.y = -1.6
scene.add(ground)

const grid = new THREE.GridHelper(180, 90, 0x121c27, 0x0a1219)
grid.position.y = -1.58
grid.material.transparent = true
grid.material.opacity = 0.5
scene.add(grid)

const horizon = new THREE.Mesh(
  new THREE.RingGeometry(44, 45.6, 120),
  new THREE.MeshBasicMaterial({ color: 0x173a4f, transparent: true, opacity: 0.55, side: THREE.DoubleSide }),
)
horizon.rotation.x = -Math.PI / 2
horizon.position.y = -1.55
scene.add(horizon)

/* 夜晚城市天际线 */
const city = new THREE.Group()
city.position.y = -1.55
scene.add(city)
const windowTexture = (() => {
  const canvas = document.createElement('canvas')
  canvas.width = 64
  canvas.height = 128
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#000000'
  ctx.fillRect(0, 0, 64, 128)
  for (let y = 8; y < 124; y += 10) {
    for (let x = 6; x < 58; x += 9) {
      if (Math.random() > 0.55) {
        ctx.fillStyle = Math.random() > 0.35 ? 'rgba(255,205,150,.9)' : 'rgba(120,190,255,.75)'
        ctx.fillRect(x, y, 3.4, 5)
      }
    }
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping
  return texture
})()
const cityMat = new THREE.MeshStandardMaterial({
  color: 0x0a1018,
  roughness: 0.85,
  metalness: 0.15,
  emissive: 0x0b1622,
  emissiveIntensity: 0.35,
  emissiveMap: windowTexture,
})
for (let i = 0; i < 64; i++) {
  const angle = Math.random() * Math.PI * 2
  const radius = 48 + Math.random() * 64
  const height = 4 + Math.random() * 18
  const width = 2.4 + Math.random() * 5
  const depth = 2.4 + Math.random() * 5
  const building = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), cityMat)
  building.position.set(Math.cos(angle) * radius, height / 2, Math.sin(angle) * radius)
  building.rotation.y = Math.random() * Math.PI
  city.add(building)
}

/* 星尘 */
const dust = (() => {
  const count = 420
  const positions = new Float32Array(count * 3)
  for (let i = 0; i < count; i++) {
    positions[i * 3] = (Math.random() - 0.5) * 90
    positions[i * 3 + 1] = Math.random() * 34 - 1
    positions[i * 3 + 2] = (Math.random() - 0.5) * 90
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  const points = new THREE.Points(geometry, new THREE.PointsMaterial({
    color: 0x7fa8c9,
    size: 0.05,
    transparent: true,
    opacity: 0.42,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  }))
  scene.add(points)
  return points
})()

/* ------------------------------------------------------------------ *
 * 霓虹招牌
 * ------------------------------------------------------------------ */
const neonSign = (() => {
  const canvas = document.createElement('canvas')
  canvas.width = 1024
  canvas.height = 192
  const ctx = canvas.getContext('2d')
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  ctx.font = '900 88px Inter, "PingFang SC", system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.shadowColor = 'rgba(61,225,198,.85)'
  ctx.shadowBlur = 36
  ctx.fillStyle = '#eafffb'
  ctx.fillText('NIGHT SHIFT', 512, 78)
  ctx.shadowBlur = 0
  ctx.font = '500 28px ui-monospace, Menlo, monospace'
  ctx.fillStyle = 'rgba(138,148,163,.85)'
  ctx.fillText('DEEPSEEK HARNESS — LIVE SESSION OFFICE', 512, 150)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false }))
  sprite.scale.set(6.6, 1.24, 1)
  sprite.position.set(0, 6, 0)
  scene.add(sprite)
  return sprite
})()

/* ------------------------------------------------------------------ *
 * 共享纹理 / 工具
 * ------------------------------------------------------------------ */
const radialTexture = (stops) => {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 128
  const ctx = canvas.getContext('2d')
  const grad = ctx.createRadialGradient(64, 64, 0, 64, 64, 64)
  for (const [offset, color] of stops) grad.addColorStop(offset, color)
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, 128, 128)
  return new THREE.CanvasTexture(canvas)
}
const glowTexture = radialTexture([[0, 'rgba(255,255,255,1)'], [0.35, 'rgba(255,255,255,.42)'], [1, 'rgba(255,255,255,0)']])
const shadowTexture = radialTexture([[0, 'rgba(0,0,0,.72)'], [0.55, 'rgba(0,0,0,.28)'], [1, 'rgba(0,0,0,0)']])

const floorTexture = (() => {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 256
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#1d2836'
  ctx.fillRect(0, 0, 256, 256)
  ctx.strokeStyle = 'rgba(90,125,165,.12)'
  ctx.lineWidth = 2
  for (let i = 0; i <= 256; i += 64) {
    ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, 256); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(256, i); ctx.stroke()
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping
  texture.repeat.set(4, 2.7)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
})()

function disposeGroup(group) {
  group.traverse(object => {
    if (object.geometry) object.geometry.dispose()
    if (object.material) {
      const materials = Array.isArray(object.material) ? object.material : [object.material]
      for (const material of materials) {
        if (material.map && material.map !== glowTexture && material.map !== shadowTexture && material.map !== floorTexture) material.map.dispose()
        material.dispose()
      }
    }
  })
}

/* ------------------------------------------------------------------ *
 * 3D 角色
 * ------------------------------------------------------------------ */
function robotFor(agent, index = 0) {
  const group = new THREE.Group()
  const color = new THREE.Color(agent.color || '#3de1c6')
  const accent = new THREE.Color((STATUS[agent.status] ?? STATUS.resting).color)
  const size = 0.82
  const baseY = 0.06 + size / 2

  // 接触阴影
  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(1.4, 1.4),
    new THREE.MeshBasicMaterial({ map: shadowTexture, transparent: true, opacity: 0.7, depthWrite: false }),
  )
  shadow.rotation.x = -Math.PI / 2
  shadow.position.y = 0.02
  group.add(shadow)

  // 简单的立方体本体
  const cubeMat = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.4,
    metalness: 0.25,
    emissive: color,
    emissiveIntensity: 0.18,
  })
  const cube = new THREE.Mesh(new THREE.BoxGeometry(size, size, size), cubeMat)
  cube.position.y = baseY
  cube.rotation.y = 0.5 + index * 0.45
  group.add(cube)

  // 状态环
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.58, 0.65, 40),
    new THREE.MeshBasicMaterial({ color: accent, transparent: true, opacity: 0.9, side: THREE.DoubleSide }),
  )
  ring.rotation.x = -Math.PI / 2
  ring.position.y = 0.03
  group.add(ring)

  // 地面光晕
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTexture,
    color: accent,
    transparent: true,
    opacity: 0.3,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  }))
  glow.scale.set(2.0, 2.0, 1)
  glow.position.y = 0.05
  group.add(glow)

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
  label.position.set(index % 2 === 0 ? -0.15 : 0.15, size + 0.72 + (index % 3) * 0.12, 0)
  group.add(label)

  // 命中体
  const hit = new THREE.Mesh(
    new THREE.CylinderGeometry(0.95, 0.95, 1.7, 8),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }),
  )
  hit.position.y = 0.85
  hit.userData.agentId = agent.id
  group.add(hit)

  group.userData = {
    agentId: agent.id,
    index,
    parts: { cube, cubeMat, ring, glow, label, baseY },
  }
  return group
}

/* 显示器内容 */
function monitorTexture(agent) {
  const canvas = document.createElement('canvas')
  canvas.width = 512
  canvas.height = 300
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#0d2233'
  ctx.fillRect(0, 0, 512, 300)
  ctx.fillStyle = 'rgba(255,255,255,.05)'
  ctx.fillRect(0, 0, 512, 40)
  ctx.fillStyle = agent.color || '#3de1c6'
  ctx.beginPath(); ctx.arc(26, 20, 6, 0, Math.PI * 2); ctx.fill()
  ctx.fillStyle = 'rgba(240,246,252,.95)'
  ctx.font = '600 19px ui-monospace, Menlo, monospace'
  ctx.fillText('SESSION', 44, 26)
  ctx.fillStyle = 'rgba(170,195,220,.9)'
  ctx.font = '500 15px ui-monospace, Menlo, monospace'
  ctx.fillText('LIVE', 436, 26)
  const lineColor = agent.color || '#3de1c6'
  for (let i = 0; i < 7; i++) {
    const y = 66 + i * 26
    const w = 90 + ((i * 53) % 250)
    ctx.fillStyle = 'rgba(160,200,235,.42)'
    ctx.fillRect(22, y, w, 9)
    ctx.fillStyle = i % 3 === 0 ? lineColor : 'rgba(160,200,235,.42)'
    ctx.fillRect(22, y, 30, 9)
  }
  ctx.strokeStyle = lineColor
  ctx.lineWidth = 2.5
  ctx.globalAlpha = 0.8
  ctx.beginPath()
  for (let x = 0; x < 190; x += 10) {
    const y = 250 - Math.sin(x * 0.09 + 1.2) * 14 - Math.random() * 6
    if (x === 0) ctx.moveTo(300 + x, y)
    else ctx.lineTo(300 + x, y)
  }
  ctx.stroke()
  ctx.globalAlpha = 1
  ctx.fillStyle = 'rgba(138,148,163,.7)'
  ctx.font = '500 12px ui-monospace, Menlo, monospace'
  ctx.fillText('TOKENS', 300, 286)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 4
  return texture
}

/* 工位 */
function workstation(agent, spot) {
  const group = new THREE.Group()
  const color = new THREE.Color(agent.color || '#3de1c6')

  const deskMat = new THREE.MeshStandardMaterial({ color: 0x243244, roughness: 0.5, metalness: 0.42 })
  const metalMat = new THREE.MeshStandardMaterial({ color: 0x2b3949, roughness: 0.45, metalness: 0.6 })
  const desk = new THREE.Mesh(new THREE.BoxGeometry(2.9, 0.1, 1.2), deskMat)
  desk.position.set(spot.x, 0.72, spot.z + 0.72)
  group.add(desk)
  const deskEdge = new THREE.Mesh(
    new THREE.BoxGeometry(2.9, 0.03, 0.03),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.5 }),
  )
  deskEdge.position.set(spot.x, 0.665, spot.z + 1.325)
  group.add(deskEdge)
  for (const dx of [-1.06, 1.06]) {
    for (const dz of [-0.36, 0.36]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.72, 0.08), metalMat)
      leg.position.set(spot.x + dx, 0.36, spot.z + 0.72 + dz)
      group.add(leg)
    }
  }

  // 显示器（面向相机，屏幕清晰可见）
  const monitorX = spot.x - 0.78
  const monitorZ = spot.z + 0.46
  const tilt = 0.18
  const frame = new THREE.Mesh(new THREE.BoxGeometry(1.78, 1.06, 0.07), new THREE.MeshStandardMaterial({ color: 0x1a2634, roughness: 0.3, metalness: 0.6 }))
  frame.position.set(monitorX, 1.5, monitorZ)
  frame.rotation.y = tilt
  group.add(frame)
  const screen = new THREE.Mesh(
    new THREE.PlaneGeometry(1.64, 0.94),
    new THREE.MeshBasicMaterial({ map: monitorTexture(agent), toneMapped: false }),
  )
  screen.position.set(monitorX + 0.015, 1.5, monitorZ + 0.04)
  screen.rotation.y = tilt
  group.add(screen)
  // 屏幕柔光
  const screenGlow = new THREE.Mesh(
    new THREE.PlaneGeometry(2.2, 1.4),
    new THREE.MeshBasicMaterial({ map: glowTexture, color: new THREE.Color(agent.color || '#3de1c6'), transparent: true, opacity: 0.2, blending: THREE.AdditiveBlending, depthWrite: false }),
  )
  screenGlow.position.set(monitorX + 0.01, 1.5, monitorZ + 0.02)
  screenGlow.rotation.y = tilt
  group.add(screenGlow)
  const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.4, 8), metalMat)
  stand.position.set(monitorX, 0.95, monitorZ - 0.02)
  group.add(stand)
  const foot = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.035, 0.26), metalMat)
  foot.position.set(monitorX, 0.76, monitorZ - 0.02)
  group.add(foot)

  const keyboard = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.03, 0.2), metalMat)
  keyboard.position.set(spot.x + 0.28, 0.79, spot.z + 1.0)
  group.add(keyboard)

  const plate = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.16, 0.02), new THREE.MeshBasicMaterial({ color: 0x0e151d }))
  plate.position.set(spot.x + 0.85, 0.82, spot.z + 1.1)
  group.add(plate)
  const plateDot = new THREE.Mesh(new THREE.CircleGeometry(0.035, 12), new THREE.MeshBasicMaterial({ color }))
  plateDot.position.set(spot.x + 0.78, 0.82, spot.z + 1.112)
  group.add(plateDot)

  return group
}

/* ------------------------------------------------------------------ *
 * 楼层
 * ------------------------------------------------------------------ */
function floorOffset(index) {
  return new THREE.Vector3(index * OFFSET_X, index * FLOOR_GAP, -index * 2.7)
}

function floorSpots(count) {
  const grid = [
    [-4.7, -2.5], [0, -2.5], [4.7, -2.5],
    [-4.7, 1.1], [0, 1.1], [4.7, 1.1],
    [-2.35, 3.2], [2.35, 3.2],
  ]
  return grid.slice(0, clamp(count, 1, grid.length)).map(([x, z]) => ({ x, z }))
}

function buildFloor(team, index, teamAgents) {
  const group = new THREE.Group()
  const offset = floorOffset(index)
  group.position.copy(offset)
  const teamColor = new THREE.Color(TEAM_COLORS[index % TEAM_COLORS.length])
  const accentColor = teamColor.clone().lerp(new THREE.Color(0xffffff), 0.25)

  const slab = new THREE.Mesh(
    new THREE.BoxGeometry(W, 0.42, D),
    new THREE.MeshStandardMaterial({ color: 0x172230, roughness: 0.66, metalness: 0.36 }),
  )
  slab.position.y = -0.21
  group.add(slab)
  const edges = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(W + 0.04, 0.46, D + 0.04)),
    new THREE.LineBasicMaterial({ color: teamColor, transparent: true, opacity: 0.55 }),
  )
  group.add(edges)

  const top = new THREE.Mesh(
    new THREE.PlaneGeometry(W - 0.16, D - 0.16),
    new THREE.MeshStandardMaterial({ map: floorTexture, roughness: 0.8, metalness: 0.25 }),
  )
  top.rotation.x = -Math.PI / 2
  top.position.y = 0.012
  top.userData.floorIndex = index
  group.add(top)

  // 玻璃护栏 + 扶手灯
  const glassMat = new THREE.MeshStandardMaterial({
    color: 0x6f9bc4,
    transparent: true,
    opacity: 0.045,
    roughness: 0.12,
    metalness: 0.1,
    depthWrite: false,
    side: THREE.DoubleSide,
  })
  const railMat = new THREE.MeshStandardMaterial({ color: 0x27333f, roughness: 0.4, metalness: 0.7 })
  const railGlow = new THREE.MeshBasicMaterial({ color: teamColor, transparent: true, opacity: 0.16 })
  for (const [px, pz, w, d] of [
    [0, D / 2 - 0.18, W - 0.4, 0.03],
    [-W / 2 + 0.18, 0, 0.03, D - 0.4],
    [W / 2 - 0.18, 0, 0.03, D - 0.4],
  ]) {
    const glass = new THREE.Mesh(new THREE.BoxGeometry(w, 0.82, d), glassMat)
    glass.position.set(px, 0.42, pz)
    group.add(glass)
    const rail = new THREE.Mesh(new THREE.BoxGeometry(w, 0.04, d), railMat)
    rail.position.set(px, 0.84, pz)
    group.add(rail)
    const glow = new THREE.Mesh(new THREE.BoxGeometry(w, 0.01, d), railGlow)
    glow.position.set(px, 0.858, pz)
    group.add(glow)
  }

  // 四角立柱
  const columnMat = new THREE.MeshStandardMaterial({ color: 0x1a2432, roughness: 0.5, metalness: 0.55 })
  for (const [cx, cz] of [[-W / 2 + 0.22, -D / 2 + 0.22], [W / 2 - 0.22, -D / 2 + 0.22], [-W / 2 + 0.22, D / 2 - 0.22], [W / 2 - 0.22, D / 2 - 0.22]]) {
    const column = new THREE.Mesh(new THREE.BoxGeometry(0.16, 3.1, 0.16), columnMat)
    column.position.set(cx, 1.55, cz)
    group.add(column)
    const cap = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.05, 0.22), new THREE.MeshBasicMaterial({ color: accentColor }))
    cap.position.set(cx, 3.12, cz)
    group.add(cap)
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.05, 0.28), columnMat)
    base.position.set(cx, 0.03, cz)
    group.add(base)
  }

  // 背墙
  const wall = new THREE.Mesh(
    new THREE.BoxGeometry(W, 3.15, 0.24),
    new THREE.MeshStandardMaterial({ color: 0x18242f, roughness: 0.8, metalness: 0.3 }),
  )
  wall.position.set(0, 1.57, -D / 2 + 0.12)
  group.add(wall)
  for (let mx = -W / 2 + 1; mx < W / 2; mx += 1.5) {
    const seam = new THREE.Mesh(new THREE.BoxGeometry(0.025, 2.9, 0.02), new THREE.MeshBasicMaterial({ color: 0x1d2a3a }))
    seam.position.set(mx, 1.57, -D / 2 + 0.25)
    group.add(seam)
  }
  const ledBand = new THREE.Mesh(new THREE.BoxGeometry(W - 0.6, 0.035, 0.02), new THREE.MeshBasicMaterial({ color: teamColor, transparent: true, opacity: 0.55 }))
  ledBand.position.set(0, 2.82, -D / 2 + 0.25)
  group.add(ledBand)
  const ledBand2 = new THREE.Mesh(new THREE.BoxGeometry(W - 1.6, 0.02, 0.02), new THREE.MeshBasicMaterial({ color: teamColor, transparent: true, opacity: 0.28 }))
  ledBand2.position.set(0, 0.4, -D / 2 + 0.25)
  group.add(ledBand2)

  // 楼层编号牌
  const boardCanvas = document.createElement('canvas')
  boardCanvas.width = 512
  boardCanvas.height = 256
  const bctx = boardCanvas.getContext('2d')
  bctx.clearRect(0, 0, 512, 256)
  bctx.fillStyle = 'rgba(61,225,198,.06)'
  bctx.fillRect(0, 0, 512, 256)
  bctx.font = '900 150px ui-monospace, Menlo, monospace'
  bctx.fillStyle = 'rgba(233,238,245,.13)'
  bctx.textAlign = 'center'
  bctx.textBaseline = 'middle'
  bctx.fillText(String(index + 1).padStart(2, '0'), 256, 116)
  bctx.font = '600 26px ui-monospace, Menlo, monospace'
  bctx.fillStyle = 'rgba(233,238,245,.46)'
  bctx.fillText(team.toUpperCase(), 256, 212)
  const boardTexture = new THREE.CanvasTexture(boardCanvas)
  boardTexture.colorSpace = THREE.SRGBColorSpace
  const board = new THREE.Mesh(new THREE.PlaneGeometry(3.0, 1.5), new THREE.MeshBasicMaterial({ map: boardTexture, transparent: true, depthWrite: false }))
  board.position.set(-W * 0.24, 1.62, -D / 2 + 0.26)
  group.add(board)

  // 吊灯
  const shadeMat = new THREE.MeshStandardMaterial({ color: 0x1b2532, roughness: 0.45, metalness: 0.7 })
  const bulbMat = new THREE.MeshBasicMaterial({ color: 0xfff1dc })
  for (const lx of [-3.6, 0, 3.6]) {
    const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.7, 4), shadeMat)
    cord.position.set(lx, 2.85, -1.5)
    group.add(cord)
    const shade = new THREE.Mesh(new THREE.ConeGeometry(0.34, 0.28, 14, 1, true), shadeMat)
    shade.position.set(lx, 2.46, -1.5)
    group.add(shade)
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.11, 12, 10), bulbMat)
    bulb.position.set(lx, 2.34, -1.5)
    group.add(bulb)
    const light = new THREE.PointLight(0xffe4c2, 3.6, 9.5, 2)
    light.position.set(lx, 2.3, -1.5)
    group.add(light)
  }
  const accentLight = new THREE.PointLight(teamColor, 2.8, 14, 2)
  accentLight.position.set(0, 2.2, -3.2)
  group.add(accentLight)

  // 服务器机柜
  const rack = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.9, 0.7), new THREE.MeshStandardMaterial({ color: 0x0c131b, roughness: 0.55, metalness: 0.55 }))
  rack.position.set(W / 2 - 1.1, 0.98, -D / 2 + 0.95)
  group.add(rack)
  for (let r = 0; r < 6; r++) {
    const led = new THREE.Mesh(
      new THREE.BoxGeometry(0.32, 0.025, 0.02),
      new THREE.MeshBasicMaterial({ color: [0x3de1c6, 0x7dd3a0, 0xffb86b, 0x6f9bff][r % 4] }),
    )
    led.position.set(W / 2 - 1.1, 0.32 + r * 0.27, -D / 2 + 1.31)
    group.add(led)
  }

  // 绿植
  const potMat = new THREE.MeshStandardMaterial({ color: 0x1a2129, roughness: 0.85 })
  const leafMat = new THREE.MeshStandardMaterial({ color: 0x1f6149, roughness: 0.7, emissive: 0x0a2318, emissiveIntensity: 0.5 })
  for (const [x, z] of [[-W / 2 + 1.2, D / 2 - 1.3], [W / 2 - 1.3, D / 2 - 1.5]]) {
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.24, 0.38, 12), potMat)
    pot.position.set(x, 0.19, z)
    group.add(pot)
    for (let k = 0; k < 3; k++) {
      const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.7 + k * 0.14, 7), leafMat)
      leaf.position.set(x + Math.cos(k * 2.1) * 0.16, 0.55 + k * 0.1, z + Math.sin(k * 2.1) * 0.16)
      leaf.rotation.z = Math.cos(k * 2.1) * 0.2
      leaf.rotation.x = Math.sin(k * 2.1) * 0.2
      group.add(leaf)
    }
  }

  // 会客区（座位没占满时）
  if (teamAgents.length <= 6) {
    const rug = new THREE.Mesh(
      new THREE.PlaneGeometry(3.2, 2.2),
      new THREE.MeshStandardMaterial({ color: 0x101a24, roughness: 0.95, metalness: 0.05 }),
    )
    rug.rotation.x = -Math.PI / 2
    rug.position.set(-3.5, 0.018, 3.2)
    group.add(rug)
    const tableMat = new THREE.MeshStandardMaterial({ color: 0x1d2a38, roughness: 0.6, metalness: 0.35 })
    const table = new THREE.Mesh(new THREE.CylinderGeometry(0.72, 0.72, 0.08, 24), tableMat)
    table.position.set(-3.5, 0.7, 3.2)
    group.add(table)
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.14, 0.7, 12), tableMat)
    leg.position.set(-3.5, 0.35, 3.2)
    group.add(leg)
    const chairMat = new THREE.MeshStandardMaterial({ color: 0x1f2c3a, roughness: 0.7 })
    for (let c = 0; c < 3; c++) {
      const angle = (c / 3) * Math.PI * 2 + 0.5
      const cx = -3.5 + Math.cos(angle) * 1.2
      const cz = 3.2 + Math.sin(angle) * 1.2
      const seat = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.07, 16), chairMat)
      seat.position.set(cx, 0.45, cz)
      group.add(seat)
      const back = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.07), chairMat)
      back.position.set(cx + Math.cos(angle) * 0.24, 0.68, cz + Math.sin(angle) * 0.24)
      back.rotation.y = -angle + Math.PI / 2
      group.add(back)
    }
  }

  // 白板（墙面）
  const boardCanvas2 = document.createElement('canvas')
  boardCanvas2.width = 512
  boardCanvas2.height = 256
  const wb = boardCanvas2.getContext('2d')
  wb.fillStyle = '#0c1721'
  wb.fillRect(0, 0, 512, 256)
  wb.strokeStyle = 'rgba(160,200,235,.55)'
  wb.lineWidth = 3
  wb.beginPath(); wb.moveTo(40, 200); wb.bezierCurveTo(140, 120, 220, 210, 300, 120); wb.stroke()
  wb.strokeStyle = 'rgba(61,225,198,.8)'
  wb.beginPath(); wb.moveTo(40, 200); wb.lineTo(300, 120); wb.stroke()
  wb.fillStyle = 'rgba(160,200,235,.5)'
  for (let r = 0; r < 5; r++) wb.fillRect(330, 60 + r * 24, 130, 8)
  const wbTexture = new THREE.CanvasTexture(boardCanvas2)
  wbTexture.colorSpace = THREE.SRGBColorSpace
  const whiteboard = new THREE.Mesh(
    new THREE.PlaneGeometry(2.0, 1.0),
    new THREE.MeshBasicMaterial({ map: wbTexture }),
  )
  whiteboard.position.set(W * 0.3, 1.75, -D / 2 + 0.26)
  group.add(whiteboard)

  // 工位
  const spots = floorSpots(teamAgents.length)
  const children = []
  teamAgents.forEach((agent, i) => {
    const spot = spots[i]
    group.add(workstation(agent, spot))
    const robot = robotFor(agent, i)
    robot.position.set(spot.x + 1.0, 0.02, spot.z + 1.26)
    robot.userData.floorIndex = index
    group.add(robot)
    children.push({ agent, robot })
  })

  return { group, team, index, offset, children, color: teamColor }
}

/* ------------------------------------------------------------------ *
 * 场景状态
 * ------------------------------------------------------------------ */
let floors = []
let agents = []
let usage = { tokens_week: 0, tokens_today: 0 }
let selectedId = null
let hoveredId = null
let focusFloor = null
let structureSig = ''
let agentsById = new Map()
const lastText = new Map()
const activities = []
const lastSeen = new Map()
let cameraGoal = null
let targetGoal = null
let tower = null
let loading = true

function viewScale() {
  return clamp(1638 / Math.max(900, window.innerWidth), 0.82, 1.5)
}

function globalPose(floorsCount) {
  const height = Math.max(0, (floorsCount - 1) * FLOOR_GAP)
  const centerX = ((floorsCount - 1) * OFFSET_X) / 2
  const centerZ = ((floorsCount - 1) * OFFSET_Z) / 2
  const dist = (15 + floorsCount * 2.6) * viewScale()
  return {
    target: new THREE.Vector3(centerX, height / 2 + 1.35, centerZ),
    position: new THREE.Vector3(centerX + dist * 0.76, height / 2 + 1.35 + dist * 0.46, centerZ + dist * 0.88),
  }
}

function focusPose(floor) {
  const center = floor.offset.clone()
  const scale = clamp(viewScale(), 0.95, 1.3)
  return {
    target: center.clone().add(new THREE.Vector3(0, 1.1, 0)),
    position: center.clone().add(new THREE.Vector3(14.5, 10.2, 18.5).multiplyScalar(scale)),
  }
}

function applyPose() {
  if (focusFloor !== null) {
    const floor = floors.find(item => item.index === focusFloor)
    if (floor === undefined) return
    const pose = focusPose(floor)
    targetGoal = pose.target
    cameraGoal = pose.position
    controls.minDistance = 7
    controls.maxDistance = 42
  } else {
    const pose = globalPose(floors.length)
    targetGoal = pose.target
    cameraGoal = pose.position
    controls.minDistance = 12
    controls.maxDistance = 90
  }
}

function setFloorFocus(index) {
  focusFloor = index
  const focused = index !== null
  for (const floor of floors) {
    const visible = !focused || floor.index === index
    floor.group.visible = visible
    for (const child of floor.children) child.robot.userData.parts.label.visible = visible
  }
  neonSign.visible = !focused
  const chip = $('#focusChip')
  if (focused) {
    const floor = floors.find(item => item.index === index)
    $('#focusText').textContent = `正在查看 ${index + 1}F · ${floor ? floor.team : ''}`
    chip.hidden = false
    $('#hint').classList.add('hide')
  } else {
    chip.hidden = true
  }
  if (selectedId !== null) {
    const entry = agentsById.get(selectedId)
    if (entry === undefined || (focused && entry.agent.team !== floors.find(item => item.index === index)?.team)) clearSelection()
  }
  applyPose()
  renderFloors()
}

function toggleFloorFocus(index) {
  setFloorFocus(focusFloor === index ? null : index)
}

function clearSelection() {
  selectedId = null
  for (const [, entry] of agentsById) {
    const label = entry.robot.userData.parts.label
    if (label.element) label.element.classList.remove('on')
  }
  renderBoard()
  renderCard(null)
}

function selectAgent(id, moveCamera = false) {
  selectedId = id
  for (const [agentId, entry] of agentsById) {
    const label = entry.robot.userData.parts.label
    if (label.element) label.element.classList.toggle('on', agentId === id)
  }
  renderBoard()
  renderCard(agentsById.get(id)?.agent ?? null)
  if (moveCamera && agentsById.get(id)) {
    const entry = agentsById.get(id)
    const world = new THREE.Vector3()
    entry.robot.getWorldPosition(world)
    targetGoal = world.clone().add(new THREE.Vector3(0, 1.0, 0))
    const offset = new THREE.Vector3().subVectors(camera.position, controls.target).normalize().multiplyScalar(13)
    cameraGoal = targetGoal.clone().add(new THREE.Vector3(offset.x, Math.max(6, offset.y), offset.z))
  }
}

/* ------------------------------------------------------------------ *
 * HUD
 * ------------------------------------------------------------------ */
function renderTop() {
  const counts = { working: 0, need_me: 0, stuck: 0, resting: 0 }
  for (const agent of agents) {
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
}

function renderBoard() {
  const rows = [...agents].sort((a, b) => (b.usage_pct || 0) - (a.usage_pct || 0))
  $('#boardBody').innerHTML = rows.length === 0
    ? '<div class="empty">暂无活跃会话<br><span>等待 DSH 会话上报…</span></div>'
    : rows.map(agent => {
      const status = STATUS[agent.status] ?? STATUS.resting
      return `<button type="button" class="row ${agent.id === selectedId ? 'on' : ''}" data-id="${esc(agent.id)}">
        <span class="dot" style="background:${esc(agent.color)}"></span>
        <span class="row__main">
          <span class="row__name">${esc(agent.name)}</span>
          <span class="row__sub">${esc(status.label)} · ${esc(agent.schedule)}</span>
          <span class="row__bar"><i style="width:${clamp(Number(agent.usage_pct) || 0, 2, 100)}%;background:${esc(agent.color)}"></i></span>
        </span>
        <span class="row__pct">${Math.round(agent.usage_pct || 0)}%</span>
      </button>`
    }).join('')
}

function renderFloors() {
  $('#floorCount').textContent = String(floors.length)
  $('#floorBody').innerHTML = floors.map(floor => `
    <button type="button" class="floor ${focusFloor === floor.index ? 'on' : ''}" data-index="${floor.index}">
      <span class="floor__no">${floor.index + 1}</span>
      <span>${esc(floor.team)}</span>
      <span class="floor__ct">${floor.children.length} 个</span>
    </button>`).join('')
}

function renderChecks() {
  const wake = agents.reduce((sum, agent) => sum + (Number(agent.runs_today) || 0), 0)
  const checks = [
    { ok: !agents.some(agent => agent.status === 'stuck'), text: '没有卡住的会话' },
    { ok: !agents.some(agent => agent.status === 'need_me'), text: '没有等待确认的会话' },
    { ok: wake < 50, text: '每天唤醒少于 50 次' },
  ]
  const done = checks.filter(item => item.ok).length
  $('#checkScore').textContent = `${done}/${checks.length}`
  $('#checkBody').innerHTML = checks.map(item => `<div class="check ${item.ok ? 'ok' : ''}"><i>✓</i><span>${item.text}</span></div>`).join('')
}

function renderMeter() {
  $('#meterBig').innerHTML = `${fmt(usage.tokens_week || 0)}<small>tokens</small>`
  $('#meterToday').textContent = fmt(usage.tokens_today || 0)
  $('#meterSpan').textContent = usage.span ? usage.span.replace('（周一至今）', '') : '周一至今'
  const wake = agents.reduce((sum, agent) => sum + (Number(agent.runs_today) || 0), 0)
  $('#meterWake').textContent = String(wake)
}

function renderFeed() {
  $('#feedBody').innerHTML = activities.length === 0
    ? '<div class="evt empty">等待状态变化…</div>'
    : activities.map(item => {
      const status = STATUS[item.status] ?? STATUS.resting
      return `<div class="evt"><span class="t">${new Date(item.time).toTimeString().slice(0, 5)}</span><i style="background:${status.color}"></i><b>${esc(item.name)}</b><span>${esc(item.text)}</span></div>`
    }).join('')
}

function renderCard(agent) {
  const card = $('#card')
  if (agent === null) {
    card.classList.remove('show')
    return
  }
  card.classList.add('show')
  const status = STATUS[agent.status] ?? STATUS.resting
  const floor = floors.find(item => item.team === agent.team)
  $('#cardTeam').textContent = floor === undefined ? agent.team : `楼层 ${floor.index + 1} · ${agent.team}`
  $('#cardGlyph').textContent = '◆'
  $('#cardGlyph').style.background = `linear-gradient(150deg, ${agent.color}55, ${agent.color}14)`
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
  $('#cardNow').textContent = lastText.get(agent.id) ?? (agent.status === 'resting' ? '空闲待机' : '—')
}

function renderAll() {
  renderTop()
  renderBoard()
  renderFloors()
  renderChecks()
  renderMeter()
  renderFeed()
}

/* ------------------------------------------------------------------ *
 * 构建 / 更新
 * ------------------------------------------------------------------ */
function teamList(list) {
  const teams = []
  for (const agent of list) if (!teams.includes(agent.team)) teams.push(agent.team)
  return teams.slice(0, 4)
}

function rebuild(list) {
  if (tower !== null) {
    scene.remove(tower)
    disposeGroup(tower)
  }
  tower = new THREE.Group()
  scene.add(tower)
  floors = []
  agentsById = new Map()
  const teams = teamList(list)
  teams.forEach((team, index) => {
    const teamAgents = list.filter(agent => agent.team === team)
    const floor = buildFloor(team, index, teamAgents)
    tower.add(floor.group)
    floors.push(floor)
    for (const child of floor.children) agentsById.set(child.agent.id, { agent: child.agent, robot: child.robot, floor })
  })
  const height = Math.max(0, (teams.length - 1) * FLOOR_GAP)
  neonSign.position.set((teams.length - 1) * OFFSET_X * 0.5, height + 4.55, (teams.length - 1) * OFFSET_Z * 0.5 + 5.5)
  selectedId = null
  focusFloor = null
  $('#focusChip').hidden = true
  const pose = globalPose(teams.length)
  targetGoal = pose.target
  cameraGoal = pose.position
  controls.update()
}

/* ------------------------------------------------------------------ *
 * 交互
 * ------------------------------------------------------------------ */
const raycaster = new THREE.Raycaster()
const pointer = new THREE.Vector2()
let pointerDown = null

function pick(event) {
  const rect = renderer.domElement.getBoundingClientRect()
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1
  raycaster.setFromCamera(pointer, camera)
  const robotHits = []
  const floorHits = []
  for (const floor of floors) {
    if (!floor.group.visible) continue
    floor.group.traverse(object => {
      if (!object.isMesh) return
      if (object.userData.agentId !== undefined) robotHits.push(object)
      else if (object.userData.floorIndex !== undefined) floorHits.push(object)
    })
  }
  const robotHit = raycaster.intersectObjects(robotHits, false)[0]
  if (robotHit !== undefined) return { kind: 'agent', id: robotHit.object.userData.agentId }
  const floorHit = raycaster.intersectObjects(floorHits, false)[0]
  if (floorHit !== undefined) return { kind: 'floor', index: floorHit.object.userData.floorIndex }
  return null
}

renderer.domElement.addEventListener('pointerdown', event => {
  if (event.button !== 0) return
  pointerDown = { x: event.clientX, y: event.clientY }
})
renderer.domElement.addEventListener('pointerup', event => {
  if (pointerDown === null) return
  const moved = Math.hypot(event.clientX - pointerDown.x, event.clientY - pointerDown.y)
  pointerDown = null
  if (moved > 6) return
  const hit = pick(event)
  if (hit === null) return
  if (hit.kind === 'agent') selectAgent(hit.id, true)
  else toggleFloorFocus(hit.index)
})
renderer.domElement.addEventListener('pointermove', event => {
  const hit = pick(event)
  const id = hit !== null && hit.kind === 'agent' ? hit.id : null
  const overFloor = hit !== null && hit.kind === 'floor'
  if (id === hoveredId) {
    renderer.domElement.style.cursor = id !== null ? 'pointer' : overFloor ? 'pointer' : 'grab'
    return
  }
  hoveredId = id
  renderer.domElement.style.cursor = id !== null || overFloor ? 'pointer' : 'grab'
})
renderer.domElement.addEventListener('pointerleave', () => {
  hoveredId = null
  renderer.domElement.style.cursor = 'grab'
})
renderer.domElement.addEventListener('contextmenu', event => {
  event.preventDefault()
  if (focusFloor !== null) setFloorFocus(null)
})
document.addEventListener('contextmenu', event => {
  if (event.target.closest('#app') === null) return
  event.preventDefault()
  if (focusFloor !== null) setFloorFocus(null)
})
document.addEventListener('click', event => {
  if (event.target.closest('#focusBack') !== null) {
    setFloorFocus(null)
    return
  }
  if (event.target.closest('#cardx') !== null) {
    clearSelection()
    return
  }
  const row = event.target.closest('#boardBody .row')
  if (row !== null) {
    selectAgent(row.dataset.id, true)
    return
  }
  const floor = event.target.closest('#floorBody .floor')
  if (floor !== null) toggleFloorFocus(Number(floor.dataset.index))
})
document.addEventListener('keydown', event => {
  if (event.key !== 'Escape') return
  if (selectedId !== null) clearSelection()
  else if (focusFloor !== null) setFloorFocus(null)
})

/* ---------------- 动画 ---------------- */
const clock = new THREE.Clock()
function tick() {
  const t = clock.getElapsedTime()
  requestAnimationFrame(tick)

  const focusedTeam = focusFloor === null ? null : floors.find(floor => floor.index === focusFloor)?.team
  for (const [id, entry] of agentsById) {
    const { agent, robot } = entry
    const parts = robot.userData.parts
    const status = agent.status ?? 'resting'
    const visible = focusFloor === null || agent.team === focusedTeam
    robot.visible = visible
    if (!visible) continue

    const working = status === 'working'
    const phase = (id.charCodeAt(2) || 0) * 0.7
    const bob = Math.sin(t * (working ? 2.4 : 1.1) + phase) * (working ? 0.045 : 0.018)
    parts.cube.position.y = parts.baseY + bob
    parts.cube.rotation.y = 0.5 + robot.userData.index * 0.45 + (working ? t * 0.9 : t * 0.12)
    parts.cube.rotation.x = working ? Math.sin(t * 2 + phase) * 0.05 : 0
    parts.cubeMat.emissiveIntensity = working ? 0.32 + Math.sin(t * 3.2 + phase) * 0.08
      : status === 'stuck' ? 0.5 : status === 'need_me' ? 0.3 : 0.14

    const statusColor = STATUS[status]?.color ?? STATUS.resting.color
    parts.ring.material.color.set(statusColor)
    parts.glow.material.color.set(statusColor)
    parts.ring.rotation.z = status === 'stuck' ? t * 2.6 : 0
    const ringPulse = working ? 1 + Math.sin(t * 3.4 + phase) * 0.08
      : status === 'need_me' ? 1 + Math.sin(t * 5 + phase) * 0.1 : 1
    parts.ring.scale.setScalar(ringPulse * (id === selectedId ? 1.24 : 1))
    parts.glow.material.opacity = working ? 0.36 + Math.sin(t * 3.4 + phase) * 0.1
      : status === 'need_me' ? 0.34 : status === 'stuck' ? 0.34 : 0.14

    const labelEl = parts.label.element
    if (labelEl) labelEl.classList.toggle('on', id === selectedId)
  }

  if (cameraGoal !== null) {
    camera.position.lerp(cameraGoal, 0.09)
    if (camera.position.distanceTo(cameraGoal) < 0.2) cameraGoal = null
  }
  if (targetGoal !== null) {
    controls.target.lerp(targetGoal, 0.09)
    if (controls.target.distanceTo(targetGoal) < 0.04) targetGoal = null
  }

  dust.rotation.y = t * 0.01
  controls.update()
  composer.render()
  labelRenderer.render(scene, camera)
}

/* ---------------- 数据 ---------------- */
function toastEvent(agent, status, text) {
  const prev = lastSeen.get(agent.id)
  const sig = status + '|' + text
  if (prev === sig) return
  lastSeen.set(agent.id, sig)
  if (status === 'resting' && prev === undefined) return
  activities.unshift({ time: Date.now(), id: agent.id, name: agent.name, status, text })
  activities.length = Math.min(activities.length, 5)
}

async function poll() {
  try {
    const response = await fetch(API, { cache: 'no-store' })
    if (!response.ok) throw new Error('HTTP ' + response.status)
    const data = await response.json()
    const roster = (data.messages ?? []).find(message => message.type === 'roster')
    const usageMessage = (data.messages ?? []).find(message => message.type === 'usage')
    const list = roster?.agents ?? []
    usage = usageMessage ?? usage
    loading = false
    $('#offline').classList.remove('show')
    agents = list
    const teams = teamList(list)
    const sig = JSON.stringify({ teams, ids: list.map(agent => agent.id), teamsOf: list.map(agent => agent.team) })
    if (sig !== structureSig) {
      structureSig = sig
      rebuild(list)
    } else {
      for (const agent of list) {
        const entry = agentsById.get(agent.id)
        if (entry === undefined) continue
        entry.agent = agent
        const labelEl = entry.robot.userData.parts.label.element
        if (labelEl) labelEl.innerHTML = `<span class="badge" style="background:${agent.color}"></span>${esc(agent.name)}<em>${Math.round(agent.usage_pct || 0)}%</em>`
      }
      for (const floor of floors) floor.children = list.filter(agent => agent.team === floor.team).map(agent => ({ agent, robot: agentsById.get(agent.id)?.robot })).filter(item => item.robot)
      if (selectedId !== null && !agentsById.has(selectedId)) clearSelection()
    }
    for (const event of data.events ?? []) lastText.set(event.bot, event.text)
    for (const agent of list) toastEvent(agent, agent.status, lastText.get(agent.id) ?? '')
    renderAll()
    if (selectedId !== null) renderCard(agentsById.get(selectedId)?.agent ?? null)
  } catch (error) {
    $('#offline').textContent = loading ? '正在连接 DSH 会话数据…' : '连接中断，正在重试…'
    $('#offline').classList.add('show')
  }
}

/* ---------------- 窗口 ---------------- */
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

/* ---------------- 启动 ---------------- */
window.__NS = {
  scene,
  camera,
  controls,
  get floors() { return floors },
  get agents() { return agents },
  get focusFloor() { return focusFloor },
  setFloorFocus,
  toggleFloorFocus,
}
rebuild([])
$('#offline').classList.add('show')
$('#offline').textContent = '正在读取本机会话…'
poll()
setInterval(poll, 2000)
tick()
setTimeout(() => $('#hint').classList.add('hide'), 9000)
