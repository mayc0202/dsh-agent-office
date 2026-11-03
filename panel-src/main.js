import * as THREE from 'three'
import { gsap } from 'gsap'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'
import faceDefault from './assets/exp-default.png'
import faceHappy from './assets/exp-happy.png'
import faceSleepy from './assets/exp-sleepy.png'
import faceDizzy from './assets/exp-dizzy.png'
import faceSurprised from './assets/exp-surprised.png'
import faceThinking from './assets/exp-thinking.png'
import faceLoved from './assets/exp-loved.png'

const API = '/night-shift/api/state'
const FLOOR_GAP = 4.0
const W = 9
const D = 6.5
const OFFSET_X = 0
const OFFSET_Z = 0
const TEAM_COLORS = ['#ff7a45', '#7fa8ff', '#b79bff', '#3de1c6']
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
scene.background = new THREE.Color(0x050a14)
scene.fog = new THREE.FogExp2(0x050a14, 0.0085)

const aspectOf = () => stage.clientWidth / Math.max(1, stage.clientHeight)
const camera = new THREE.PerspectiveCamera(36, aspectOf(), 0.1, 400)
camera.position.set(16, 12, 20)
camera.updateProjectionMatrix()

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' })
renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1))
renderer.setSize(stage.clientWidth, stage.clientHeight)
renderer.toneMapping = THREE.ACESFilmicToneMapping
renderer.toneMappingExposure = 1.5
renderer.outputColorSpace = THREE.SRGBColorSpace
stage.appendChild(renderer.domElement)

const composer = new EffectComposer(renderer)
composer.addPass(new RenderPass(scene, camera))
const bloom = new UnrealBloomPass(new THREE.Vector2(stage.clientWidth, stage.clientHeight), 0.55, 0.8, 0.72)
composer.addPass(bloom)

const labelRenderer = new CSS2DRenderer()
labelRenderer.setSize(stage.clientWidth, stage.clientHeight)
Object.assign(labelRenderer.domElement.style, { position: 'absolute', inset: '0', pointerEvents: 'none' })
labelLayer.appendChild(labelRenderer.domElement)

const CAM_DIR = new THREE.Vector3(0.9, 0.88, 0.9).normalize()
const controls = new OrbitControls(camera, renderer.domElement)
controls.enableDamping = true
controls.dampingFactor = 0.075
controls.enablePan = false
controls.minDistance = 9
controls.maxDistance = 80
controls.minPolarAngle = 0.32
controls.maxPolarAngle = 1.3
controls.target.set(0, 2.4, 0)

/* ------------------------------------------------------------------ *
 * 光照 / 环境
 * ------------------------------------------------------------------ */
const hemi = new THREE.HemisphereLight(0x4a6a9c, 0x060c16, 1.45)
scene.add(hemi)
const key = new THREE.DirectionalLight(0xcfe2ff, 2.0)
key.position.set(16, 30, 18)
scene.add(key)
const rim = new THREE.DirectionalLight(0x4a7cff, 0.9)
rim.position.set(-20, 14, -18)
scene.add(rim)
const fill = new THREE.DirectionalLight(0x8fbaff, 0.6)
fill.position.set(-12, 8, 20)
scene.add(fill)

const ground = new THREE.Mesh(
  new THREE.CircleGeometry(90, 72),
  new THREE.MeshStandardMaterial({ color: 0x070d18, roughness: 0.9, metalness: 0.25 }),
)
ground.rotation.x = -Math.PI / 2
ground.position.y = -1.6
scene.add(ground)

const grid = new THREE.GridHelper(180, 90, 0x0e2438, 0x081525)
grid.position.y = -1.58
grid.material.transparent = true
grid.material.opacity = 0.5
scene.add(grid)

const horizon = new THREE.Mesh(
  new THREE.RingGeometry(44, 45.6, 120),
  new THREE.MeshBasicMaterial({ color: 0x1a5a44, transparent: true, opacity: 0.35, side: THREE.DoubleSide }),
)
horizon.rotation.x = -Math.PI / 2
horizon.position.y = -1.55
horizon.visible = false
scene.add(horizon)

/* 夜晚写字楼天际线（背景楼群） */
const city = new THREE.Group()
city.position.y = -1.55
scene.add(city)
const makeWindowTexture = () => {
  const canvas = document.createElement('canvas')
  canvas.width = 128
  canvas.height = 256
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#04070d'
  ctx.fillRect(0, 0, 128, 256)
  for (let y = 5; y < 250; y += 9) {
    for (let x = 5; x < 122; x += 9) {
      if (Math.random() > 0.64) {
        const r = Math.random()
        ctx.fillStyle = r > 0.86 ? 'rgba(255,214,160,.95)'
          : r > 0.44 ? 'rgba(140,205,255,.95)' : 'rgba(95,235,255,.85)'
        ctx.fillRect(x, y, 2.8, 4)
      }
    }
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping
  texture.repeat.set(2.4, 3.2)
  return texture
}
const cityWindowTextures = [makeWindowTexture(), makeWindowTexture(), makeWindowTexture()]
const cityMats = [0, 1, 2].map(i => new THREE.MeshBasicMaterial({
  map: cityWindowTextures[i],
  color: [0x5f86a8, 0x567c9e, 0x6f95b5][i],
}))
const cityBeacons = []
const cameraAzimuth = Math.atan2(0.95, 0.62)
const angleDiff = (a, b) => {
  let d = a - b
  while (d > Math.PI) d -= Math.PI * 2
  while (d < -Math.PI) d += Math.PI * 2
  return Math.abs(d)
}
let placed = 0
while (placed < 26) {
  const band = placed < 8 ? 0 : placed < 18 ? 1 : 2
  const radius = band === 0 ? 34 + Math.random() * 12
    : band === 1 ? 50 + Math.random() * 18 : 72 + Math.random() * 26
  const angle = Math.random() * Math.PI * 2
  if (band < 2 && angleDiff(angle, cameraAzimuth) < 0.55) continue
  const height = band === 0 ? 8 + Math.random() * 12
    : band === 1 ? 10 + Math.random() * 18 : 12 + Math.random() * 26
  const width = band === 0 ? 3.6 + Math.random() * 4
    : band === 1 ? 3.2 + Math.random() * 4.5 : 3 + Math.random() * 5.5
  const depth = band === 0 ? 3.6 + Math.random() * 4
    : band === 1 ? 3.2 + Math.random() * 4.5 : 3 + Math.random() * 5.5
  const building = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), cityMats[placed % 3])
  building.position.set(Math.cos(angle) * radius, height / 2, Math.sin(angle) * radius)
  building.rotation.y = Math.random() * Math.PI
  city.add(building)
  if (Math.random() < 0.5) {
    const beaconColor = [0xff5a5a, 0x5be7ff, 0xffc46b][placed % 3]
    const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 8), new THREE.MeshBasicMaterial({ color: beaconColor, transparent: true, opacity: 0.85 }))
    beacon.position.set(building.position.x, height + 0.3, building.position.z)
    beacon.userData.baseColor = beacon.material.color.clone()
    beacon.userData.phase = Math.random() * Math.PI * 2
    city.add(beacon)
    cityBeacons.push(beacon)
  }
  if (Math.random() < 0.45) {
    const stripColor = [0x2f9fff, 0x5be7ff, 0xb18cff][placed % 3]
    const strip = new THREE.Mesh(new THREE.BoxGeometry(0.07, height * 0.7, 0.07), new THREE.MeshBasicMaterial({ color: stripColor, transparent: true, opacity: 0.75 }))
    strip.position.set(building.position.x + Math.cos(angle + Math.PI / 2) * (width / 2 + 0.03), height * 0.5, building.position.z + Math.sin(angle + Math.PI / 2) * (depth / 2 + 0.03))
    city.add(strip)
  }
  placed += 1
}
/* 星尘 *//* 星尘 *//* 星尘 *//* 星尘 */
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
    color: 0x7fffd0,
    size: 0.05,
    transparent: true,
    opacity: 0.3,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  }))
  scene.add(points)
  return points
})()

/* ------------------------------------------------------------------ *
 * 昼夜主题
 * ------------------------------------------------------------------ */
const NIGHT_THEME = {
  bg: new THREE.Color(0x050a14),
  hemiSky: new THREE.Color(0x4a6a9c),
  hemiGround: new THREE.Color(0x060c16),
  key: new THREE.Color(0xcfe2ff),
  rim: new THREE.Color(0x4a7cff),
  fill: new THREE.Color(0x8fbaff),
  ground: new THREE.Color(0x070d18),
  city: new THREE.Color(0x7fa8c8),
  hemiI: 1.45, keyI: 2.0, rimI: 0.9, fillI: 0.6,
  exposure: 1.5, bloom: 0.55, dust: 0.3, grid: 0.5, neon: 1,
}
const DAY_THEME = {
  bg: new THREE.Color(0xa9c7dc),
  hemiSky: new THREE.Color(0xe8f4ff),
  hemiGround: new THREE.Color(0x93a2a4),
  key: new THREE.Color(0xfff2dc),
  rim: new THREE.Color(0xd2e6ff),
  fill: new THREE.Color(0xffe9c9),
  ground: new THREE.Color(0x8fa5b6),
  city: new THREE.Color(0xeef3f7),
  hemiI: 2.4, keyI: 3.2, rimI: 0.55, fillI: 0.45,
  exposure: 1.18, bloom: 0.18, dust: 0.05, grid: 0.18, neon: 0.5,
}
let themeMode = 'night'
let themeMix = 0
let themeTarget = 0
let themeLights = []

function setTheme(mode, immediate = false) {
  themeMode = mode === 'day' ? 'day' : 'night'
  themeTarget = themeMode === 'day' ? 1 : 0
  if (immediate) themeMix = themeTarget
  document.body.classList.toggle('day', themeMode === 'day')
  const mark = $('#themeToggle')
  if (mark) {
    mark.setAttribute('aria-label', themeMode === 'day' ? '当前：白天' : '当前：夜晚')
    mark.title = '昼夜跟随系统时间（06:00–18:00 白天）'
  }
}

function applyThemeFrame() {
  themeMix += (themeTarget - themeMix) * 0.07
  if (Math.abs(themeTarget - themeMix) < 0.002) themeMix = themeTarget
  const mix = themeMix
  scene.background.copy(NIGHT_THEME.bg).lerp(DAY_THEME.bg, mix)
  scene.fog.color.copy(NIGHT_THEME.bg).lerp(DAY_THEME.bg, mix)
  hemi.color.copy(NIGHT_THEME.hemiSky).lerp(DAY_THEME.hemiSky, mix)
  hemi.groundColor.copy(NIGHT_THEME.hemiGround).lerp(DAY_THEME.hemiGround, mix)
  hemi.intensity = NIGHT_THEME.hemiI + (DAY_THEME.hemiI - NIGHT_THEME.hemiI) * mix
  key.color.copy(NIGHT_THEME.key).lerp(DAY_THEME.key, mix)
  key.intensity = NIGHT_THEME.keyI + (DAY_THEME.keyI - NIGHT_THEME.keyI) * mix
  rim.color.copy(NIGHT_THEME.rim).lerp(DAY_THEME.rim, mix)
  rim.intensity = NIGHT_THEME.rimI + (DAY_THEME.rimI - NIGHT_THEME.rimI) * mix
  fill.color.copy(NIGHT_THEME.fill).lerp(DAY_THEME.fill, mix)
  fill.intensity = NIGHT_THEME.fillI + (DAY_THEME.fillI - NIGHT_THEME.fillI) * mix
  ground.material.color.copy(NIGHT_THEME.ground).lerp(DAY_THEME.ground, mix)
  grid.material.opacity = NIGHT_THEME.grid + (DAY_THEME.grid - NIGHT_THEME.grid) * mix
  bloom.strength = NIGHT_THEME.bloom + (DAY_THEME.bloom - NIGHT_THEME.bloom) * mix
  renderer.toneMappingExposure = NIGHT_THEME.exposure + (DAY_THEME.exposure - NIGHT_THEME.exposure) * mix
  dust.material.opacity = NIGHT_THEME.dust + (DAY_THEME.dust - NIGHT_THEME.dust) * mix
  for (const material of cityMats) material.color.copy(NIGHT_THEME.city).lerp(DAY_THEME.city, mix)
  const neonMaterial = neonSign?.material
  if (neonMaterial) neonMaterial.opacity = NIGHT_THEME.neon + (DAY_THEME.neon - NIGHT_THEME.neon) * mix
  for (const item of themeLights) item.light.intensity = item.night + (item.day - item.night) * mix
}

function syncThemeByClock(immediate = false) {
  const hour = new Date().getHours()
  const isDay = hour >= 6 && hour < 18
  setTheme(isDay ? 'day' : 'night', immediate)
}
syncThemeByClock(true)
setInterval(() => syncThemeByClock(false), 60_000)

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
  ctx.shadowColor = 'rgba(255,106,61,.85)'
  ctx.shadowBlur = 36
  ctx.fillStyle = '#ffe9dd'
  ctx.fillText('CATORA', 512, 78)
  ctx.shadowBlur = 0
  ctx.font = '500 28px ui-monospace, Menlo, monospace'
  ctx.fillStyle = 'rgba(190,170,155,.85)'
  ctx.fillText('DEEPSEEK HARNESS — LIVE SESSION OFFICE', 512, 150)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false }))
  sprite.scale.set(5.2, 1.0, 1)
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

/* Catora 猫猫表情（始终面向相机） */
const FACE_SRC = {
  default: faceDefault,
  happy: faceHappy,
  sleepy: faceSleepy,
  dizzy: faceDizzy,
  surprised: faceSurprised,
  thinking: faceThinking,
  loved: faceLoved,
}
const faceTextures = {}
const faceLoader = new THREE.TextureLoader()
for (const [name, src] of Object.entries(FACE_SRC)) {
  const texture = faceLoader.load(src)
  texture.colorSpace = THREE.SRGBColorSpace
  faceTextures[name] = texture
}
const CUSTOM_FACE_KEY = 'night-shift-custom-face'
let customFaceTexture = null
const FACE_FOR_STATUS = {
  working: 'happy',
  need_me: 'surprised',
  stuck: 'dizzy',
  done: 'loved',
  resting: 'sleepy',
}
const zTexture = (() => {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 128
  const ctx = canvas.getContext('2d')
  ctx.clearRect(0, 0, 128, 128)
  ctx.font = '900 96px Inter, system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = '#d8f1ff'
  ctx.shadowColor = 'rgba(120,200,255,.9)'
  ctx.shadowBlur = 14
  ctx.fillText('Z', 64, 70)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
})()

const floorTexture = (() => {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 256
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#241d18'
  ctx.fillRect(0, 0, 256, 256)
  ctx.strokeStyle = 'rgba(255,160,110,.1)'
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
    // CSS2D 标签是独立 DOM，scene 移除后渲染器不会回收，必须手动删掉，否则重建会累积重影
    if (object.isCSS2DObject && object.element) {
      object.element.remove()
      return
    }
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
const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false

function robotFor(agent, index = 0, sitY = 0) {
  const group = new THREE.Group()
  const color = new THREE.Color(agent.color || '#3de1c6')
  const tint = color.clone().lerp(new THREE.Color(0xffffff), 0.28)
  const accent = new THREE.Color((STATUS[agent.status] ?? STATUS.resting).color)
  const baseY = 0.4 + sitY
  const expr = FACE_FOR_STATUS[agent.status] ?? 'default'

  // 接触阴影
  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(0.75, 0.75),
    new THREE.MeshBasicMaterial({ map: shadowTexture, transparent: true, opacity: 0.62, depthWrite: false }),
  )
  shadow.rotation.x = -Math.PI / 2
  shadow.position.y = 0.02
  group.add(shadow)

  // 猫猫立绘：Sprite 永远面向相机（Grok Bot 那种平面感）
  const faceMat = new THREE.SpriteMaterial({
    map: customFaceTexture ?? faceTextures[expr],
    color: customFaceTexture ? 0xffffff : tint,
    transparent: true,
    depthWrite: false,
    toneMapped: false,
  })
  const face = new THREE.Sprite(faceMat)
  face.scale.set(0.6, 0.6, 1)
  face.position.y = baseY
  group.add(face)

  // 猫咪上下浮动的 GSAP 循环（用统一相位对象驱动，tick 里再乘幅度）
  const motion = { bob: 0.5 }
  if (!reduceMotion) {
    gsap.fromTo(motion, { bob: 0 }, {
      bob: 1,
      duration: 1.9,
      repeat: -1,
      yoyo: true,
      ease: 'sine.inOut',
      delay: Math.random() * 1.8,
    })
  }

  // 坐垫上的猫影（随浮动变化）
  let seatShadow = null
  if (sitY > 0) {
    seatShadow = new THREE.Mesh(
      new THREE.PlaneGeometry(0.84, 0.58),
      new THREE.MeshBasicMaterial({ map: shadowTexture, transparent: true, opacity: 0.46, depthWrite: false }),
    )
    seatShadow.rotation.x = -Math.PI / 2
    seatShadow.position.set(0, 0.55, 0.02)
    group.add(seatShadow)
  }

  // 状态环 + 地面光晕
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.24, 0.28, 44),
    new THREE.MeshBasicMaterial({ color: accent, transparent: true, opacity: 0.9, side: THREE.DoubleSide }),
  )
  ring.rotation.x = -Math.PI / 2
  ring.position.y = 0.03
  group.add(ring)
  const ripples = []
  for (let k = 0; k < 2; k++) {
    const ripple = new THREE.Mesh(
      new THREE.RingGeometry(0.4, 0.46, 44),
      new THREE.MeshBasicMaterial({ color: accent, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }),
    )
    ripple.rotation.x = -Math.PI / 2
    ripple.position.y = 0.035
    ripple.visible = false
    group.add(ripple)
    ripples.push(ripple)
  }
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTexture, color: accent, transparent: true, opacity: 0.3,
    blending: THREE.AdditiveBlending, depthWrite: false,
  }))
  glow.scale.set(0.8, 0.8, 1)
  glow.position.y = 0.05
  group.add(glow)

  // 睡觉 Z
  const zzz = []
  for (let i = 0; i < 3; i++) {
    const z = new THREE.Sprite(new THREE.SpriteMaterial({
      map: zTexture, color: 0xbfe8ff, transparent: true, depthWrite: false, toneMapped: false,
    }))
    z.scale.setScalar(0.15)
    z.position.set(0.24, baseY + 0.5, 0.05)
    z.visible = false
    group.add(z)
    zzz.push(z)
  }

  // 等待确认感叹号
  const badgeCanvas = document.createElement('canvas')
  badgeCanvas.width = badgeCanvas.height = 128
  const bctx = badgeCanvas.getContext('2d')
  bctx.clearRect(0, 0, 128, 128)
  bctx.fillStyle = '#ffb86b'
  bctx.beginPath(); bctx.arc(64, 64, 46, 0, Math.PI * 2); bctx.fill()
  bctx.fillStyle = '#1a1208'
  bctx.font = '900 64px Inter, system-ui, sans-serif'
  bctx.textAlign = 'center'
  bctx.textBaseline = 'middle'
  bctx.fillText('!', 64, 68)
  const badgeTexture = new THREE.CanvasTexture(badgeCanvas)
  badgeTexture.colorSpace = THREE.SRGBColorSpace
  const badge = new THREE.Sprite(new THREE.SpriteMaterial({ map: badgeTexture, transparent: true, depthWrite: false }))
  badge.scale.set(0.2, 0.2, 1)
  badge.position.y = baseY + 0.6
  badge.visible = (STATUS[agent.status] ?? STATUS.resting) === 'need_me'
  group.add(badge)

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
  label.position.set(index % 2 === 0 ? -0.06 : 0.06, baseY + 0.62 + (index % 3) * 0.05, 0)
  group.add(label)

  // 命中体
  const hit = new THREE.Mesh(
    new THREE.CylinderGeometry(0.38, 0.38, 0.8, 8),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }),
  )
  hit.position.y = 0.38
  hit.userData.agentId = agent.id
  group.add(hit)

  group.userData = {
    agentId: agent.id,
    index,
    parts: { face, faceMat, ring, glow, badge, label, zzz, ripples, motion, seatShadow, shadow, tint, baseY },
  }
  return group
}

/* 显示器内容 */
function drawMonitorScreen(entry, status, overload) {
  const { canvas, ctx, texture, color } = entry
  const w = canvas.width
  const h = canvas.height
  const now = Date.now()
  ctx.clearRect(0, 0, w, h)
  if (status === 'resting' || status === 'done') {
    // 黑屏 / 关机待机
    ctx.fillStyle = '#010306'
    ctx.fillRect(0, 0, w, h)
    ctx.fillStyle = 'rgba(110,150,180,.16)'
    ctx.font = '500 13px ui-monospace, Menlo, monospace'
    ctx.fillText('STANDBY', 24, h - 20)
    ctx.fillStyle = (Math.floor(now / 1200) % 2) ? 'rgba(90,220,150,.5)' : 'rgba(90,220,150,.12)'
    ctx.beginPath(); ctx.arc(w - 26, h - 22, 4, 0, Math.PI * 2); ctx.fill()
    texture.needsUpdate = true
    return
  }
  const warn = overload || status === 'stuck'
  if (warn) {
    ctx.fillStyle = '#2a070b'
    ctx.fillRect(0, 0, w, h)
    ctx.strokeStyle = '#ff5a5a'
    ctx.lineWidth = 6
    ctx.strokeRect(4, 4, w - 8, h - 8)
    ctx.fillStyle = '#ff9a9a'
    ctx.font = '700 30px Inter, ui-monospace, Menlo, monospace'
    ctx.fillText('⚠ HIGH LOAD', 28, 54)
    ctx.fillStyle = 'rgba(255,160,160,.85)'
    ctx.font = '500 19px ui-monospace, Menlo, monospace'
    ctx.fillText('执行任务时间过长', 28, 92)
    for (let i = 0; i < 5; i++) {
      const bw = 60 + ((i * 71) % 320)
      ctx.fillStyle = i % 2 === 0 ? 'rgba(255,90,90,.85)' : 'rgba(255,60,60,.45)'
      ctx.fillRect(28, 122 + i * 24, bw, 10)
    }
    ctx.fillStyle = (Math.floor(now / 450) % 2) ? '#ffd2d2' : 'rgba(255,210,210,.25)'
    ctx.font = '700 18px ui-monospace, Menlo, monospace'
    ctx.fillText('PLEASE CHECK TASK', 28, h - 22)
    texture.needsUpdate = true
    return
  }
  // 代码编辑器
  ctx.fillStyle = '#0a1520'
  ctx.fillRect(0, 0, w, h)
  ctx.fillStyle = 'rgba(255,255,255,.055)'
  ctx.fillRect(0, 0, w, 34)
  for (const [i, dot] of ['#ff5f56', '#ffbd2e', '#27c93f'].entries()) {
    ctx.fillStyle = dot
    ctx.beginPath(); ctx.arc(18 + i * 16, 17, 4.5, 0, Math.PI * 2); ctx.fill()
  }
  ctx.fillStyle = 'rgba(233,240,248,.8)'
  ctx.font = '600 13px ui-monospace, Menlo, monospace'
  ctx.fillText('agent.js — ' + (status === 'working' ? 'WORKING' : 'PAUSED'), 74, 22)
  ctx.fillStyle = color
  ctx.fillText('●', w - 40, 22)
  const rows = 7
  const scroll = Math.floor(now / 1600) % 20
  const palette = ['rgba(120,170,255,.9)', 'rgba(150,220,160,.9)', 'rgba(255,205,130,.9)', 'rgba(200,150,255,.9)', 'rgba(160,200,235,.45)']
  for (let i = 0; i < rows; i++) {
    const y = 58 + i * 30
    ctx.fillStyle = 'rgba(120,150,180,.35)'
    ctx.font = '500 12px ui-monospace, Menlo, monospace'
    ctx.fillText(String((i + scroll) % 99).padStart(2, ' '), 14, y + 10)
    const indent = 28 + ((i * 3) % 4) * 14
    let x = indent
    const segs = 2 + ((i + scroll) % 3)
    for (let k = 0; k < segs; k++) {
      const segW = 26 + ((i * 43 + k * 67 + scroll * 11) % 120)
      ctx.fillStyle = palette[(i + k + scroll) % palette.length]
      ctx.fillRect(x, y, segW, 9)
      x += segW + 8
    }
    if (i === 3 && Math.floor(now / 500) % 2 === 0) {
      ctx.fillStyle = 'rgba(120,220,255,.9)'
      ctx.fillRect(indent + 6, y + 14, 2, 12)
    }
  }
  ctx.fillStyle = 'rgba(120,150,180,.4)'
  ctx.font = '500 12px ui-monospace, Menlo, monospace'
  ctx.fillText('Ln ' + (3 + scroll) + ', Col 18   UTF-8   LF', 14, h - 14)
  texture.needsUpdate = true
}

function workstation(agent, spot) {
  const group = new THREE.Group()
  const color = new THREE.Color(agent.color || '#3de1c6')

  const deskMat = new THREE.MeshStandardMaterial({ color: 0x3a2b1e, roughness: 0.55, metalness: 0.3 })
  const metalMat = new THREE.MeshStandardMaterial({ color: 0x3b3029, roughness: 0.45, metalness: 0.55 })
  const desk = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.07, 0.75), deskMat)
  desk.position.set(spot.x, 0.55, spot.z + 0.55)
  group.add(desk)
  const deskEdge = new THREE.Mesh(
    new THREE.BoxGeometry(1.9, 0.02, 0.02),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.5 }),
  )
  deskEdge.position.set(spot.x, 0.515, spot.z + 0.93)
  group.add(deskEdge)
  for (const dx of [-0.72, 0.72]) {
    for (const dz of [-0.24, 0.24]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.55, 0.06), metalMat)
      leg.position.set(spot.x + dx, 0.28, spot.z + 0.55 + dz)
      group.add(leg)
    }
  }

  // 显示器（面向相机，屏幕清晰可见）
  const monitorX = spot.x - 0.5
  const monitorZ = spot.z + 0.42
  const tilt = 0.18
  const frame = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.56, 0.06), new THREE.MeshStandardMaterial({ color: 0x1a2634, roughness: 0.3, metalness: 0.6 }))
  frame.position.set(monitorX, 0.92, monitorZ)
  frame.rotation.y = tilt
  group.add(frame)
  const monitorCanvas = document.createElement('canvas')
  monitorCanvas.width = 512
  monitorCanvas.height = 300
  const monitorCtx = monitorCanvas.getContext('2d')
  const monitorTexture = new THREE.CanvasTexture(monitorCanvas)
  monitorTexture.colorSpace = THREE.SRGBColorSpace
  monitorTexture.anisotropy = 4
  const screen = new THREE.Mesh(
    new THREE.PlaneGeometry(0.82, 0.48),
    new THREE.MeshBasicMaterial({ map: monitorTexture, toneMapped: false }),
  )
  screen.position.set(monitorX + 0.01, 0.92, monitorZ + 0.035)
  screen.rotation.y = tilt
  group.add(screen)
  // 屏幕柔光
  const screenGlow = new THREE.Mesh(
    new THREE.PlaneGeometry(1.2, 0.8),
    new THREE.MeshBasicMaterial({ map: glowTexture, color: new THREE.Color(agent.color || '#3de1c6'), transparent: true, opacity: 0.2, blending: THREE.AdditiveBlending, depthWrite: false }),
  )
  screenGlow.position.set(monitorX + 0.005, 0.92, monitorZ + 0.015)
  screenGlow.rotation.y = tilt
  group.add(screenGlow)
  const monitorEntry = {
    canvas: monitorCanvas,
    ctx: monitorCtx,
    texture: monitorTexture,
    glow: screenGlow,
    agentId: agent.id,
    color: agent.color || '#3de1c6',
  }
  monitorScreens.push(monitorEntry)
  drawMonitorScreen(monitorEntry, agent.status ?? 'resting', false)
  const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.22, 8), metalMat)
  stand.position.set(monitorX, 0.7, monitorZ - 0.02)
  group.add(stand)
  const foot = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.025, 0.16), metalMat)
  foot.position.set(monitorX, 0.6, monitorZ - 0.02)
  group.add(foot)

  // 办公椅（猫猫坐在上面；靠最前缘的工位放不下就不放）
  const seatZ = spot.z + 1.55
  if (seatZ + 0.35 <= D / 2) {
    const chairX = spot.x + 0.2
    const chairMat = new THREE.MeshStandardMaterial({ color: 0x2a3a4c, roughness: 0.78, metalness: 0.2 })
    const padColor = color.clone().lerp(new THREE.Color(0x1a222c), 0.68)
    // 座椅朝办公桌：靠背在靠镜头这一侧，座面朝桌子
    const chairSeat = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.08, 0.62), chairMat)
    chairSeat.position.set(chairX, 0.45, seatZ)
    group.add(chairSeat)
    const cushion = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.05, 0.5), new THREE.MeshStandardMaterial({ color: padColor, roughness: 0.85 }))
    cushion.position.set(chairX, 0.5, seatZ)
    group.add(cushion)
    const chairBack = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.26, 0.06), chairMat)
    chairBack.position.set(chairX, 0.63, seatZ + 0.33)
    group.add(chairBack)
    for (const dx of [-0.26, 0.26]) {
      for (const dz of [-0.24, 0.24]) {
        const chairLeg = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.45, 8), metalMat)
        chairLeg.position.set(chairX + dx, 0.225, seatZ + dz)
        group.add(chairLeg)
      }
    }
    // 踏脚横杆（朝向桌子一侧）
    const footrest = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.62, 8), metalMat)
    footrest.rotation.z = Math.PI / 2
    footrest.position.set(chairX, 0.28, seatZ - 0.26)
    group.add(footrest)
  }

  const keyboard = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.02, 0.15), metalMat)
  keyboard.position.set(spot.x + 0.24, 0.6, spot.z + 0.82)
  group.add(keyboard)

  const plate = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.16, 0.02), new THREE.MeshBasicMaterial({ color: 0x0e151d }))
  plate.position.set(spot.x + 0.6, 0.63, spot.z + 0.86)
  group.add(plate)
  const plateDot = new THREE.Mesh(new THREE.CircleGeometry(0.035, 12), new THREE.MeshBasicMaterial({ color }))
  plateDot.position.set(spot.x + 0.55, 0.63, spot.z + 0.872)
  group.add(plateDot)

  return group
}

/* ------------------------------------------------------------------ *
 * 楼层
 * ------------------------------------------------------------------ */
function floorOffset(index) {
  return new THREE.Vector3(index * OFFSET_X, index * FLOOR_GAP, index * OFFSET_Z)
}

function floorSpots(count) {
  const grid = [
    [-2.7, -1.2], [0, -1.2], [2.7, -1.2],
    [-2.7, 1.2], [0, 1.2], [2.7, 1.2],
    [-1.35, 2.2], [1.35, 2.2],
  ]
  return grid.slice(0, clamp(count, 1, grid.length)).map(([x, z]) => ({ x, z }))
}

function fmtTokens(value) {
  const n = Number(value) || 0
  if (n >= 1e9) return (n / 1e9).toFixed(2) + 'B'
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M'
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K'
  return String(Math.round(n))
}

function drawTokenBoard(entry, week, today, share, count) {
  const { canvas, ctx, texture } = entry
  const w = canvas.width
  const h = canvas.height
  ctx.clearRect(0, 0, w, h)
  ctx.fillStyle = 'rgba(6,12,18,.92)'
  ctx.fillRect(0, 0, w, h)
  ctx.strokeStyle = entry.color
  ctx.lineWidth = 6
  ctx.strokeRect(3, 3, w - 6, h - 6)
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  ctx.fillStyle = 'rgba(233,240,248,.62)'
  ctx.font = '600 32px ui-monospace, Menlo, monospace'
  ctx.fillText('楼层 ' + String(entry.index + 1).padStart(2, '0') + ' · ' + entry.team.toUpperCase(), 40, 74)
  ctx.fillStyle = 'rgba(233,240,248,.5)'
  ctx.font = '500 28px ui-monospace, Menlo, monospace'
  ctx.fillText('本周 TOKEN', 40, 146)
  ctx.fillStyle = '#f2f7fd'
  ctx.font = '900 142px Inter, ui-monospace, Menlo, monospace'
  ctx.fillText(fmtTokens(week), 36, 292)
  ctx.fillStyle = 'rgba(233,240,248,.6)'
  ctx.font = '500 28px ui-monospace, Menlo, monospace'
  ctx.fillText('今日 ' + fmtTokens(today) + '  ·  ' + count + ' 个会话', 40, 366)
  const barX = 40
  const barY = 414
  const barW = w - 80
  const barH = 20
  ctx.fillStyle = 'rgba(255,255,255,.1)'
  ctx.fillRect(barX, barY, barW, barH)
  ctx.fillStyle = entry.color
  ctx.fillRect(barX, barY, Math.max(6, barW * Math.min(1, Math.max(0, share))), barH)
  ctx.fillStyle = 'rgba(233,240,248,.5)'
  ctx.font = '500 24px ui-monospace, Menlo, monospace'
  ctx.fillText('占本周 ' + Math.round(share * 100) + '%', barX, barY + 66)
  texture.needsUpdate = true
}

function refreshTokenBoards(list) {
  if (!floors.length) return
  const stats = new Map()
  let total = 0
  for (const agent of list) {
    const team = agent.team || '未分组'
    const cur = stats.get(team) ?? { week: 0, today: 0, count: 0 }
    cur.week += Number(agent.tokens_week) || 0
    cur.today += Number(agent.tokens_today) || 0
    cur.count += 1
    stats.set(team, cur)
    total += Number(agent.tokens_week) || 0
  }
  for (const entry of tokenBoards) {
    const s = stats.get(entry.team) ?? { week: 0, today: 0, count: 0 }
    drawTokenBoard(entry, s.week, s.today, total > 0 ? s.week / total : 0, s.count)
  }
}

function buildFloor(team, index, teamAgents) {
  const group = new THREE.Group()
  const offset = floorOffset(index)
  group.position.copy(offset)
  const teamColor = new THREE.Color(TEAM_COLORS[index % TEAM_COLORS.length])
  const accentColor = teamColor.clone().lerp(new THREE.Color(0xffffff), 0.25)

  const slab = new THREE.Mesh(
    new THREE.BoxGeometry(W, 0.42, D),
    new THREE.MeshStandardMaterial({ color: 0x241c16, roughness: 0.7, metalness: 0.28 }),
  )
  slab.position.y = -0.21
  group.add(slab)
  const edges = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(W + 0.04, 0.46, D + 0.04)),
    new THREE.LineBasicMaterial({ color: teamColor, transparent: true, opacity: 0.85 }),
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
    new THREE.BoxGeometry(W, 3.15, 0.16),
    new THREE.MeshPhysicalMaterial({
      color: 0x8fc8ff,
      metalness: 0.02,
      roughness: 0.05,
      transparent: true,
      opacity: 0.085,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  )
  wall.position.set(0, 1.57, -D / 2 + 0.1)
  group.add(wall)
  const ledBand = new THREE.Mesh(new THREE.BoxGeometry(W - 0.6, 0.035, 0.02), new THREE.MeshBasicMaterial({ color: teamColor, transparent: true, opacity: 0.95 }))
  ledBand.position.set(0, 2.82, -D / 2 + 0.25)
  group.add(ledBand)
  const ledBand2 = new THREE.Mesh(new THREE.BoxGeometry(W - 1.6, 0.02, 0.02), new THREE.MeshBasicMaterial({ color: teamColor, transparent: true, opacity: 0.28 }))
  ledBand2.position.set(0, 0.4, -D / 2 + 0.25)
  group.add(ledBand2)

  // 大屏：本工作区 TOKEN 用量
  const boardCanvas = document.createElement('canvas')
  boardCanvas.width = 1024
  boardCanvas.height = 512
  const bctx = boardCanvas.getContext('2d')
  const boardTexture = new THREE.CanvasTexture(boardCanvas)
  boardTexture.colorSpace = THREE.SRGBColorSpace
  const tokenBoard = { canvas: boardCanvas, ctx: bctx, texture: boardTexture, team, index, color: `#${teamColor.getHexString()}` }
  drawTokenBoard(tokenBoard, 0, 0, 0, teamAgents.length)
  tokenBoards.push(tokenBoard)
  const board = new THREE.Mesh(
    new THREE.PlaneGeometry(3.0, 1.5),
    new THREE.MeshBasicMaterial({ map: boardTexture, transparent: true, depthWrite: false, toneMapped: false }),
  )
  board.position.set(-0.3, 1.9, -D / 2 + 0.22)
  group.add(board)

  // 吊灯
  const shadeMat = new THREE.MeshStandardMaterial({ color: 0x1b2532, roughness: 0.45, metalness: 0.7 })
  const bulbMat = new THREE.MeshBasicMaterial({ color: 0xfff1dc })
  for (const lx of [-3.5, 1.7, 3.5]) {
    const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.7, 4), shadeMat)
    cord.position.set(lx, 2.4, -1.1)
    group.add(cord)
    const shade = new THREE.Mesh(new THREE.ConeGeometry(0.34, 0.28, 14, 1, true), shadeMat)
    shade.position.set(lx, 2.08, -1.1)
    group.add(shade)
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.11, 12, 10), bulbMat)
    bulb.position.set(lx, 1.98, -1.1)
    group.add(bulb)
    const light = new THREE.PointLight(0xffd8b0, 7, 10, 2)
    light.position.set(lx, 1.95, -1.1)
    group.add(light)
    themeLights.push({ light, night: 7, day: 2.2 })
  }

  // 吊灯之间的电线
  const cableMat = new THREE.MeshStandardMaterial({ color: 0x090c10, roughness: 0.5, metalness: 0.55 })
  const cableZ = -1.1
  const cablePoints = [
    new THREE.Vector3(-W / 2 + 0.12, 2.94, cableZ),
    new THREE.Vector3(-3.5, 2.9, cableZ),
    new THREE.Vector3(-0.9, 2.7, cableZ),
    new THREE.Vector3(1.7, 2.9, cableZ),
    new THREE.Vector3(2.6, 2.76, cableZ),
    new THREE.Vector3(3.5, 2.9, cableZ),
    new THREE.Vector3(W / 2 - 0.12, 2.94, cableZ),
  ]
  const cableCurve = new THREE.CatmullRomCurve3(cablePoints)
  const cable = new THREE.Mesh(new THREE.TubeGeometry(cableCurve, 64, 0.016, 6, false), cableMat)
  group.add(cable)
  // 每个灯从主电线垂下的短线
  for (const lx of [-3.5, 1.7, 3.5]) {
    const drop = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.16, 6), cableMat)
    drop.position.set(lx, 2.82, cableZ)
    group.add(drop)
    const clip = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.035, 0.05), cableMat)
    clip.position.set(lx, 2.9, cableZ)
    group.add(clip)
  }

  const accentLight = new THREE.PointLight(teamColor, 4.6, 14, 2)
  accentLight.position.set(0, 2.2, -3.2)
  group.add(accentLight)
  themeLights.push({ light: accentLight, night: 4.6, day: 2.2 })
  const warmFill = new THREE.PointLight(0xffb27a, 3.4, 12, 2)
  warmFill.position.set(0, 2.2, 1.5)
  group.add(warmFill)
  themeLights.push({ light: warmFill, night: 3.4, day: 1.6 })

  // 大屏（会话作战面板）
  const dashCanvas = document.createElement('canvas')
  dashCanvas.width = 1024
  dashCanvas.height = 512
  const dctx = dashCanvas.getContext('2d')
  dctx.fillStyle = '#08141f'
  dctx.fillRect(0, 0, 1024, 512)
  dctx.fillStyle = 'rgba(255,255,255,.05)'
  dctx.fillRect(0, 0, 1024, 56)
  dctx.fillStyle = teamColor.getStyle()
  dctx.beginPath(); dctx.arc(34, 28, 8, 0, Math.PI * 2); dctx.fill()
  dctx.fillStyle = 'rgba(240,246,252,.95)'
  dctx.font = '600 26px ui-monospace, Menlo, monospace'
  dctx.fillText('SESSION OPS · ' + team.toUpperCase(), 56, 36)
  dctx.fillStyle = 'rgba(160,200,235,.75)'
  dctx.font = '500 18px ui-monospace, Menlo, monospace'
  dctx.fillText('LIVE', 940, 36)
  // 柱状图
  for (let b = 0; b < 14; b++) {
    const h2 = 40 + ((b * 67) % 170)
    const x = 60 + b * 44
    dctx.fillStyle = b % 4 === 0 ? teamColor.getStyle() : 'rgba(120,170,220,.35)'
    dctx.fillRect(x, 300 - h2, 24, h2)
  }
  // 折线
  dctx.strokeStyle = 'rgba(255,180,120,.9)'
  dctx.lineWidth = 3
  dctx.beginPath()
  for (let x = 0; x < 380; x += 12) {
    const y = 430 - Math.sin(x * 0.03 + 1) * 40 - (x % 60) * 0.2
    if (x === 0) dctx.moveTo(620 + x, y)
    else dctx.lineTo(620 + x, y)
  }
  dctx.stroke()
  dctx.fillStyle = 'rgba(160,200,235,.5)'
  dctx.font = '500 16px ui-monospace, Menlo, monospace'
  dctx.fillText('TOKENS / HOUR', 620, 470)
  const dashTexture = new THREE.CanvasTexture(dashCanvas)
  dashTexture.colorSpace = THREE.SRGBColorSpace
  const dash = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 0.95), new THREE.MeshBasicMaterial({ map: dashTexture, toneMapped: false }))
  dash.position.set(W * 0.3, 1.55, -D / 2 + 0.2)
  group.add(dash)
  const dashGlow = new THREE.Mesh(
    new THREE.PlaneGeometry(2.4, 1.3),
    new THREE.MeshBasicMaterial({ map: glowTexture, color: teamColor, transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false }),
  )
  dashGlow.position.set(W * 0.3, 1.55, -D / 2 + 0.18)
  group.add(dashGlow)

  // 机房（玻璃房 + 机柜）
  const serverRoom = new THREE.Group()
  serverRoom.position.set(W / 2 - 1.0, 0, -D / 2 + 0.95)
  const cageMat = new THREE.MeshStandardMaterial({ color: 0x6f9bc4, transparent: true, opacity: 0.06, roughness: 0.1, metalness: 0.1, depthWrite: false, side: THREE.DoubleSide })
  const cage = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.6, 1.3), cageMat)
  cage.position.y = 0.8
  serverRoom.add(cage)
  const cageEdges = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(1.4, 1.6, 1.3)),
    new THREE.LineBasicMaterial({ color: 0x9fc7e6, transparent: true, opacity: 0.35 }),
  )
  cageEdges.position.y = 0.8
  serverRoom.add(cageEdges)
  const rackMat2 = new THREE.MeshStandardMaterial({ color: 0x0b1118, roughness: 0.55, metalness: 0.6 })
  const serverLeds = []
  for (const dx of [-0.3, 0.3]) {
    const rack2 = new THREE.Mesh(new THREE.BoxGeometry(0.4, 1.0, 0.4), rackMat2)
    rack2.position.set(dx, 0.56, 0)
    serverRoom.add(rack2)
    for (let r = 0; r < 5; r++) {
      const led2 = new THREE.Mesh(
        new THREE.BoxGeometry(0.22, 0.02, 0.02),
        new THREE.MeshBasicMaterial({ color: [0x3de1c6, 0x7dd3a0, 0xffb86b, 0x6f9bff][r % 4] }),
      )
      led2.position.set(dx, 0.24 + r * 0.17, 0.21)
      led2.userData.baseColor = led2.material.color.clone()
      led2.userData.phase = r * 1.3 + dx * 4
      serverLeds.push(led2)
      serverRoom.add(led2)
    }
  }
  group.userData.serverLeds = serverLeds
  group.add(serverRoom)

  // 彩色货架（参考原版的彩色格子）
  const shelf = new THREE.Group()
  shelf.position.set(-W / 2 + 0.26, 0, -0.4)
  shelf.rotation.y = Math.PI / 2
  const shelfMat = new THREE.MeshStandardMaterial({ color: 0x1b2430, roughness: 0.7, metalness: 0.3 })
  for (const y of [0.5, 1.15, 1.8]) {
    const plank = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.05, 0.35), shelfMat)
    plank.position.y = y * 0.7
    shelf.add(plank)
  }
  for (const sx of [-0.44, 0.44]) {
    const side = new THREE.Mesh(new THREE.BoxGeometry(0.05, 1.4, 0.35), shelfMat)
    side.position.set(sx, 0.7, 0)
    shelf.add(side)
  }
  const blockColors = [0xff7a45, 0x6f9bff, 0xffd166, 0x3de1c6, 0xb18cff, 0xff6b6b, 0x7dd3a0]
  for (let i = 0; i < 18; i++) {
    const block = new THREE.Mesh(
      new THREE.BoxGeometry(0.15, 0.11, 0.15),
      new THREE.MeshStandardMaterial({ color: blockColors[i % blockColors.length], roughness: 0.55, metalness: 0.1 }),
    )
    block.position.set(-0.3 + (i % 6) * 0.12, 0.42 + Math.floor(i / 6) * 0.44, 0.02 + ((i * 7) % 3) * 0.04)
    shelf.add(block)
  }
  group.add(shelf)

  // 咖啡吧
  const coffee = new THREE.Group()
  coffee.position.set(-3.4, 0, -2.65)
  const counter = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.9, 0.5), new THREE.MeshStandardMaterial({ color: 0x2a211a, roughness: 0.65, metalness: 0.25 }))
  counter.position.y = 0.45
  coffee.add(counter)
  const machine = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.42, 0.4), new THREE.MeshStandardMaterial({ color: 0x1a222c, roughness: 0.35, metalness: 0.7 }))
  machine.position.set(-0.35, 1.05, 0)
  coffee.add(machine)
  const machineLight = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.03, 0.02), new THREE.MeshBasicMaterial({ color: 0x6fe7ff }))
  machineLight.position.set(-0.35, 1.16, 0.21)
  coffee.add(machineLight)
  for (let c = 0; c < 3; c++) {
    const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.045, 0.09, 10), new THREE.MeshStandardMaterial({ color: 0xe9e2d6, roughness: 0.6 }))
    cup.position.set(0.3 + c * 0.18, 0.95, 0.12)
    coffee.add(cup)
  }
  const coffeeSignCanvas = document.createElement('canvas')
  coffeeSignCanvas.width = 256
  coffeeSignCanvas.height = 96
  const cctx = coffeeSignCanvas.getContext('2d')
  cctx.clearRect(0, 0, 256, 96)
  cctx.font = '700 54px Inter, sans-serif'
  cctx.textAlign = 'center'
  cctx.textBaseline = 'middle'
  cctx.shadowColor = 'rgba(255,120,200,.9)'
  cctx.shadowBlur = 18
  cctx.fillStyle = '#ffd9f0'
  cctx.fillText('COFFEE', 128, 50)
  const coffeeTex = new THREE.CanvasTexture(coffeeSignCanvas)
  coffeeTex.colorSpace = THREE.SRGBColorSpace
  const coffeeSign = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.42), new THREE.MeshBasicMaterial({ map: coffeeTex, transparent: true }))
  coffeeSign.position.set(0, 1.65, 0.05)
  coffee.add(coffeeSign)
  group.add(coffee)

  // 霓虹墙角灯带
  const neonA = new THREE.Mesh(new THREE.BoxGeometry(0.05, 2.2, 0.05), new THREE.MeshBasicMaterial({ color: 0xff4fa3 }))
  neonA.position.set(W / 2 - 0.3, 1.3, D / 2 - 0.3)
  group.add(neonA)
  const neonB = new THREE.Mesh(new THREE.BoxGeometry(0.05, 2.2, 0.05), new THREE.MeshBasicMaterial({ color: 0x5be7ff }))
  neonB.position.set(-W / 2 + 0.3, 1.3, D / 2 - 0.3)
  group.add(neonB)



  // 工位
  const spots = floorSpots(teamAgents.length)
  const children = []
  teamAgents.forEach((agent, i) => {
    const spot = spots[i]
    const ws = workstation(agent, spot)
    group.add(ws)
    // 猫咪坐在工位前的办公椅上；靠前边缘放不下时退回工位右侧
    const chairZ = spot.z + 1.55
    const canSit = chairZ + 0.35 <= D / 2
    const robot = robotFor(agent, i, canSit ? 0.425 : 0)
    if (canSit) {
      robot.position.set(spot.x + 0.2, 0.02, chairZ)
    } else {
      const catHalf = 0.4
      const catX = clamp(spot.x + 1.375, -W / 2 + catHalf + 0.05, W / 2 - catHalf - 0.05)
      robot.position.set(catX, 0.02, spot.z + 0.55)
    }
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
let tokenBoards = []
let monitorScreens = []
let lastMonitorDraw = 0
const monitorState = new Map()
const LOAD_WARN_MS = 5 * 60 * 1000

function applyCustomFaceToAll() {
  for (const [, entry] of agentsById) {
    const parts = entry.robot?.userData?.parts
    if (!parts?.faceMat) continue
    const expr = FACE_FOR_STATUS[entry.agent.status ?? 'resting'] ?? 'default'
    parts.faceMat.map = customFaceTexture ?? faceTextures[expr]
    parts.faceMat.color.set(customFaceTexture ? 0xffffff : parts.tint ?? 0xffffff)
    parts.faceMat.needsUpdate = true
  }
}

function loadCustomFace() {
  let data = ''
  try { data = localStorage.getItem(CUSTOM_FACE_KEY) ?? '' } catch {}
  if (!data) {
    customFaceTexture = null
    applyCustomFaceToAll()
    return
  }
  faceLoader.load(data, texture => {
    texture.colorSpace = THREE.SRGBColorSpace
    customFaceTexture = texture
    applyCustomFaceToAll()
  })
}

window.addEventListener('storage', event => {
  if (event.key === CUSTOM_FACE_KEY) loadCustomFace()
})
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
let zoomGoal = null
let tower = null
let loading = true

function viewScale() {
  return clamp(1638 / Math.max(900, window.innerWidth), 0.82, 1.5)
}

function globalPose(floorsCount) {
  const height = Math.max(0, (floorsCount - 1) * FLOOR_GAP)
  const centerX = ((floorsCount - 1) * OFFSET_X) / 2
  const centerZ = ((floorsCount - 1) * OFFSET_Z) / 2
  const dist = (13.5 + floorsCount * 2.5) * viewScale()
  const target = new THREE.Vector3(centerX, height / 2 + 1.2, centerZ)
  return {
    target,
    position: new THREE.Vector3(centerX + dist * 0.42, target.y + dist * 0.82, centerZ + dist * 0.9),
  }
}

function focusPose(floor) {
  const center = floor.offset.clone()
  const target = center.clone().add(new THREE.Vector3(0, 1.2, 0))
  return {
    target,
    position: target.clone().add(new THREE.Vector3(7.4, 6.0, 10.2).multiplyScalar(clamp(viewScale(), 0.95, 1.2))),
  }
}

function applyPose() {
  if (focusFloor !== null) {
    const floor = floors.find(item => item.index === focusFloor)
    if (floor === undefined) return
    const pose = focusPose(floor)
    targetGoal = pose.target
    cameraGoal = pose.position
    controls.minDistance = 6
    controls.maxDistance = 40
  } else {
    const pose = globalPose(floors.length)
    targetGoal = pose.target
    cameraGoal = pose.position
    controls.minDistance = 9
    controls.maxDistance = 80
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
    // 保持当前镜头距离与朝向，只平移到该 Agent，避免点选时突然拉近
    const viewOffset = new THREE.Vector3().subVectors(camera.position, controls.target)
    if (viewOffset.length() < 4) viewOffset.copy(CAM_DIR).multiplyScalar(18)
    cameraGoal = targetGoal.clone().add(viewOffset)
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
  const headTokens = $('#headTokens')
  const headBalance = $('#headBalance')
  const wake = agents.reduce((sum, agent) => sum + (Number(agent.runs_today) || 0), 0)
  if (headTokens) {
    headTokens.textContent = fmt(usage.tokens_week || 0)
    headTokens.parentElement.title = `本周 ${fmt(usage.tokens_week || 0)} tokens · 今日 ${fmt(usage.tokens_today || 0)} · 每天唤醒 ${wake} 次`
  }
  if (headBalance) headBalance.parentElement.title = 'DeepSeek 平台余额'
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
  const glyphEl = $('#cardGlyph')
  glyphEl.textContent = ''
  glyphEl.style.backgroundImage = `url(${faceDefault})`
  glyphEl.style.backgroundSize = '82% 82%'
  glyphEl.style.backgroundRepeat = 'no-repeat'
  glyphEl.style.backgroundPosition = 'center'
  glyphEl.style.backgroundColor = `${agent.color}22`
  glyphEl.style.border = `1px solid ${agent.color}66`
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
  for (const [, entry] of agentsById) {
    const motion = entry.robot?.userData?.parts?.motion
    if (motion) gsap.killTweensOf(motion)
  }
  if (tower !== null) {
    scene.remove(tower)
    disposeGroup(tower)
  }
  tower = new THREE.Group()
  scene.add(tower)
  floors = []
  tokenBoards = []
  monitorScreens = []
  themeLights = []
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
  neonSign.position.set((teams.length - 1) * OFFSET_X * 0.5, height + 5.2, (teams.length - 1) * OFFSET_Z * 0.5)
  selectedId = null
  focusFloor = null
  $('#focusChip').hidden = true
  const pose = globalPose(teams.length)
  controls.target.copy(pose.target)
  camera.position.copy(pose.position)
  targetGoal = null
  cameraGoal = null
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
  applyThemeFrame()

  const focusedTeam = focusFloor === null ? null : floors.find(floor => floor.index === focusFloor)?.team
  for (const [id, entry] of agentsById) {
    const { agent, robot } = entry
    const parts = robot.userData.parts
    const status = agent.status ?? 'resting'
    const visible = focusFloor === null || agent.team === focusedTeam
    robot.visible = visible
    if (!visible) continue

    const working = status === 'working'
    const sleeping = status === 'resting'
    const phase = (id.charCodeAt(2) || 0) * 0.7
    const amp = working ? 0.09 : 0.055
    const bob = reduceMotion ? 0 : (parts.motion.bob * 2 - 1) * amp
    parts.face.position.y = parts.baseY + bob
    if (parts.seatShadow) {
      parts.seatShadow.material.opacity = Math.max(0.08, 0.46 - bob * 2.4)
      const sk = 1 - bob * 0.7
      parts.seatShadow.scale.set(sk, sk, 1)
    }

    // 表情只随状态切换；有自定义猫咪图片时优先使用
    const expr = FACE_FOR_STATUS[status] ?? 'default'
    if (customFaceTexture) {
      if (parts.faceMat.map !== customFaceTexture) {
        parts.faceMat.map = customFaceTexture
        parts.faceMat.needsUpdate = true
      }
      parts.faceMat.color.set(0xffffff)
    } else {
      if (parts.faceMat.map !== faceTextures[expr]) {
        parts.faceMat.map = faceTextures[expr]
        parts.faceMat.needsUpdate = true
      }
      parts.faceMat.color.copy(parts.tint)
    }

    // 呼吸/浮动
    const breathe = sleeping ? 1 + Math.sin(t * 1.5 + phase) * 0.02 : 1 + Math.sin(t * 2.2 + phase) * 0.012
    parts.face.scale.set(0.6 * breathe, 0.6 * breathe, 1)

    const statusColor = STATUS[status]?.color ?? STATUS.resting.color
    parts.ring.material.color.set(statusColor)
    parts.glow.material.color.set(statusColor)
    parts.ring.rotation.z = status === 'stuck' ? t * 2.6 : 0
    const ringPulse = working ? 1 + Math.sin(t * 3.4 + phase) * 0.08
      : status === 'need_me' ? 1 + Math.sin(t * 5 + phase) * 0.1 : 1
    parts.ring.scale.setScalar(ringPulse * (id === selectedId ? 1.24 : 1))
    for (let k = 0; k < parts.ripples.length; k++) {
      const ripple = parts.ripples[k]
      const selected = id === selectedId
      ripple.visible = selected
      if (!selected) continue
      const p = ((t * 0.5 + k * 0.5) % 1)
      ripple.scale.setScalar(1 + p * 1.1)
      ripple.material.opacity = (1 - p) * 0.3
    }
    parts.glow.material.opacity = working ? 0.34 + Math.sin(t * 3.4 + phase) * 0.1
      : status === 'need_me' ? 0.32 : status === 'stuck' ? 0.32 : 0.14

    // 空闲睡觉：飘 Z
    for (let k = 0; k < 3; k++) {
      const z = parts.zzz[k]
      z.visible = sleeping
      if (!sleeping) continue
      const p = ((t * 0.42 + k * 0.34) % 1)
      z.position.set(0.24 + p * 0.16, parts.baseY + 0.45 + p * 0.45, 0.06)
      z.material.opacity = Math.sin(p * Math.PI) * 0.95
      z.scale.setScalar(0.1 + p * 0.12)
    }

    // 等待确认感叹号
    parts.badge.visible = status === 'need_me'
    if (parts.badge.visible) parts.badge.position.y = parts.baseY + 0.62 + Math.sin(t * 4 + phase) * 0.025

    const labelEl = parts.label.element
    if (labelEl) {
      const topTeam = floors.length ? floors[floors.length - 1].team : null
      // 严格对齐时下层被上层挡住，全局视角只显示顶层标签（聚焦时正常显示当前层）
      parts.label.visible = visible && (focusFloor !== null || agent.team === topTeam)
      labelEl.classList.toggle('on', id === selectedId)
    }
  }

  // 显示器：工作=代码 / 休息=黑屏 / 超时=红色负载
  const nowMs = Date.now()
  if (nowMs - lastMonitorDraw > 420) {
    lastMonitorDraw = nowMs
    for (const entry of monitorScreens) {
      const agent = agentsById.get(entry.agentId)?.agent
      if (!agent) continue
      const status = agent.status ?? 'resting'
      const state = monitorState.get(entry.agentId) ?? { status: 'resting', since: nowMs }
      if (state.status !== status) {
        state.status = status
        state.since = nowMs
      }
      monitorState.set(entry.agentId, state)
      const overload = status === 'working' && nowMs - state.since > LOAD_WARN_MS
      drawMonitorScreen(entry, status, overload)
      const glowColor = overload || status === 'stuck' ? '#ff5a5a' : status === 'resting' || status === 'done' ? '#16202a' : entry.color
      entry.glow.material.color.set(glowColor)
      entry.glow.material.opacity = overload ? 0.42 : status === 'resting' || status === 'done' ? 0.05 : 0.2
    }
  }

  // 机柜 LED 闪烁
  for (const floor of floors) {
    const leds = floor.group.userData.serverLeds
    if (!leds) continue
    for (const led of leds) {
      const blink = 0.2 + 0.8 * (0.5 + 0.5 * Math.sin(t * 5.5 + led.userData.phase + floor.index * 2))
      led.material.color.copy(led.userData.baseColor).multiplyScalar(0.25 + blink * 0.9)
    }
  }

  // 城市信标闪烁
  for (const beacon of cityBeacons) {
    const pulse = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t * 1.8 + beacon.userData.phase))
    beacon.material.opacity = pulse
    beacon.material.color.copy(beacon.userData.baseColor).multiplyScalar(0.6 + pulse * 0.8)
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

async function refreshBalance() {
  const headBalance = $('#headBalance')
  try {
    const response = await fetch('/night-shift/api/balance', { cache: 'no-store' })
    const data = await response.json()
    if (!headBalance) return
    if (!data?.ok) {
      headBalance.textContent = '—'
      headBalance.parentElement.title = data?.error ? String(data.error) : '余额不可用'
      return
    }
    const symbol = data.currency === 'USD' ? '$' : '¥'
    const amount = Number.parseFloat(data.balance)
    const bonus = Number.parseFloat(data.bonus_balance || '0')
    headBalance.textContent = `${symbol}${Number.isFinite(amount) ? amount.toFixed(2) : '—'}`
    headBalance.parentElement.title = `赠金 ${symbol}${Number.isFinite(bonus) ? bonus.toFixed(2) : '0.00'} · 更新 ${new Date(data.updated_at ?? Date.now()).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`
  } catch {
    if (headBalance) {
      headBalance.textContent = '—'
      headBalance.parentElement.title = '余额连接失败'
    }
  }
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
    refreshTokenBoards(list)
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
loadCustomFace()
poll()
setInterval(poll, 2000)
refreshBalance()
setInterval(refreshBalance, 60_000)
tick()
setTimeout(() => $('#hint').classList.add('hide'), 9000)
