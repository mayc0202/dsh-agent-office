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
import faceSlits from './assets/exp-slits.png'
import faceUneven from './assets/exp-uneven.png'

const API = '/agent-office/api/state'
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
scene.fog = new THREE.FogExp2(0x050a14, 0.0044)

// 晚霞天空：粉橙地平线、深蓝夜空、轻微云带
const skyTexture = (() => {
  const canvas = document.createElement('canvas')
  canvas.width = 2048
  canvas.height = 1024
  const ctx = canvas.getContext('2d')
  const grad = ctx.createLinearGradient(0, 0, 0, 1024)
  grad.addColorStop(0, '#01040c')
  grad.addColorStop(0.24, '#030b1a')
  grad.addColorStop(0.38, '#081529')
  grad.addColorStop(0.45, '#2b2b52')
  grad.addColorStop(0.48, '#5d3a55')
  grad.addColorStop(0.495, '#e18a62')
  grad.addColorStop(0.515, '#b56e58')
  grad.addColorStop(0.56, '#4b2a3c')
  grad.addColorStop(1, '#080b14')
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, 2048, 1024)
  const sun = ctx.createRadialGradient(640, 520, 0, 640, 520, 420)
  sun.addColorStop(0, 'rgba(255,220,170,.65)')
  sun.addColorStop(.2, 'rgba(255,155,100,.32)')
  sun.addColorStop(1, 'rgba(255,120,80,0)')
  ctx.fillStyle = sun
  ctx.fillRect(0, 0, 2048, 1024)
  for (let i = 0; i < 7; i++) {
    const y = 418 + i * 13
    const cloud = ctx.createLinearGradient(0, y, 2048, y)
    cloud.addColorStop(0, 'rgba(255,185,145,0)')
    cloud.addColorStop(.3 + i * .03, `rgba(255,190,155,${.05 + i * .008})`)
    cloud.addColorStop(.62, `rgba(255,155,125,${.035 + i * .006})`)
    cloud.addColorStop(1, 'rgba(255,185,145,0)')
    ctx.fillStyle = cloud
    ctx.fillRect(0, y, 2048, 2 + i * .6)
  }
  for (let i = 0; i < 60; i++) {
    const x = Math.random() * 2048
    const y = Math.random() * 360
    ctx.fillStyle = `rgba(255,235,210,${.15 + Math.random() * .35})`
    ctx.fillRect(x, y, 1.2, 1.2)
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.mapping = THREE.EquirectangularReflectionMapping
  return texture
})()
scene.background = skyTexture

const aspectOf = () => stage.clientWidth / Math.max(1, stage.clientHeight)
const camera = new THREE.PerspectiveCamera(50, aspectOf(), 0.1, 900)
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

const pmrem = new THREE.PMREMGenerator(renderer)
scene.environment = pmrem.fromEquirectangular(skyTexture).texture
scene.environmentIntensity = 0.62

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
const sunsetLight = new THREE.DirectionalLight(0xff9b68, 1.1)
sunsetLight.position.set(-38, 16, -34)
scene.add(sunsetLight)

const ground = new THREE.Mesh(
  new THREE.CircleGeometry(560, 110),
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

/* 方块夜城：倒角方块堆叠 + 细缝 + 抛光金块 */
const city = new THREE.Group()
city.position.y = -1.55
scene.add(city)
const cityBeacons = []
const cityWindowMats = []
const cityGoldMats = []
const cityNeonMats = []
const cityBillboardMats = []
const cityBillboards = []
const animatedAdScreens = []
const cityTowerGroups = []
let cityTowerOrder = 0

const cityBlockGeometry = new RoundedBoxGeometry(1, 1, 1, 2, 0.075)
const makeFacadeTexture = () => {
  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 512
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#02050b'
  ctx.fillRect(0, 0, 256, 512)
  for (let row = 0; row < 34; row++) {
    for (let col = 0; col < 12; col++) {
      const x = 8 + col * 20
      const y = 10 + row * 14
      if (Math.random() > 0.67) {
        const r = Math.random()
        ctx.fillStyle = r > 0.82 ? 'rgba(255,206,150,.94)'
          : r > 0.4 ? 'rgba(150,210,255,.9)' : 'rgba(105,240,255,.78)'
        ctx.fillRect(x, y, 9, 4)
        if (Math.random() > 0.8) {
          ctx.fillStyle = 'rgba(255,255,255,.5)'
          ctx.fillRect(x + 2, y + 1, 2, 1)
        }
      }
    }
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping
  return texture
}
for (let i = 0; i < 3; i++) {
  const texture = makeFacadeTexture()
  cityWindowMats.push(new THREE.MeshStandardMaterial({
    color: 0x03080f,
    roughness: 0.72,
    metalness: 0.12,
    emissive: 0xffffff,
    emissiveMap: texture,
    emissiveIntensity: 1.35,
    envMapIntensity: 0.22,
    fog: false,
  }))
}
for (const color of [0xd6a13c, 0xc4882b, 0xe9bd68]) {
  cityGoldMats.push(new THREE.MeshPhysicalMaterial({
    color,
    roughness: 0.13,
    metalness: 1,
    clearcoat: 1,
    clearcoatRoughness: 0.08,
    emissive: 0xc77418,
    emissiveIntensity: 0.42,
    envMapIntensity: 2.4,
    fog: false,
  }))
}

// 无文字、无商标的户外广告画面
const makeAdTexture = (kind) => {
  const canvas = document.createElement('canvas')
  canvas.width = 512
  canvas.height = 288
  const ctx = canvas.getContext('2d')
  const bg = ctx.createLinearGradient(0, 0, 512, 288)
  if (kind === 0) { bg.addColorStop(0, '#17101a'); bg.addColorStop(.55, '#4a1828'); bg.addColorStop(1, '#e06d4e') }
  else if (kind === 1) { bg.addColorStop(0, '#071326'); bg.addColorStop(.62, '#123c58'); bg.addColorStop(1, '#7ad4dc') }
  else if (kind === 2) { bg.addColorStop(0, '#120b19'); bg.addColorStop(.5, '#3d1746'); bg.addColorStop(1, '#f09a64') }
  else { bg.addColorStop(0, '#030915'); bg.addColorStop(.55, '#0b2440'); bg.addColorStop(1, '#fb815a') }
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, 512, 288)
  ctx.globalCompositeOperation = 'lighter'
  const glow = ctx.createRadialGradient(390, 90, 4, 390, 90, 190)
  glow.addColorStop(0, 'rgba(255,228,180,.75)')
  glow.addColorStop(.4, 'rgba(255,140,100,.22)')
  glow.addColorStop(1, 'rgba(255,100,80,0)')
  ctx.fillStyle = glow
  ctx.fillRect(0, 0, 512, 288)
  ctx.globalCompositeOperation = 'source-over'
  if (kind === 0) {
    // 香水瓶
    ctx.fillStyle = 'rgba(255,235,215,.92)'
    ctx.beginPath(); ctx.roundRect(228, 96, 104, 142, 22); ctx.fill()
    ctx.fillStyle = 'rgba(255,255,255,.5)'
    ctx.fillRect(244, 116, 20, 98)
    ctx.fillStyle = '#3a1a18'
    ctx.fillRect(256, 72, 48, 26)
    ctx.fillStyle = 'rgba(255,190,140,.8)'
    ctx.beginPath(); ctx.ellipse(280, 170, 30, 42, 0, 0, Math.PI * 2); ctx.fill()
  } else if (kind === 1) {
    // 抽象织物
    ctx.strokeStyle = 'rgba(230,250,255,.08)'
    ctx.lineWidth = 2
    for (let i = 0; i < 10; i++) { ctx.beginPath(); ctx.moveTo(0, 40 + i * 26); ctx.bezierCurveTo(160, 10 + i * 22, 340, 210 - i * 12, 512, 60 + i * 20); ctx.stroke() }
    ctx.strokeStyle = 'rgba(206,242,255,.88)'
    ctx.lineWidth = 7
    ctx.beginPath(); ctx.moveTo(82, 226); ctx.bezierCurveTo(168, 74, 332, 232, 454, 62); ctx.stroke()
    ctx.strokeStyle = 'rgba(255,255,255,.45)'
    ctx.lineWidth = 2
    ctx.beginPath(); ctx.moveTo(132, 236); ctx.bezierCurveTo(214, 100, 336, 242, 424, 86); ctx.stroke()
  } else if (kind === 2) {
    // 腕表 / 金色圆环
    ctx.strokeStyle = 'rgba(255,215,155,.9)'
    ctx.lineWidth = 3
    for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(386, 138, 28 + i * 19, 0, Math.PI * 2); ctx.stroke() }
    ctx.fillStyle = 'rgba(245,230,210,.95)'
    ctx.beginPath(); ctx.arc(386, 138, 22, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = '#2a1720'
    ctx.fillRect(380, 104, 12, 68)
    ctx.fillStyle = 'rgba(255,200,150,.35)'
    ctx.fillRect(80, 64, 154, 4)
    ctx.fillRect(80, 82, 98, 2)
  } else {
    // 抽象车身 / 光轨
    ctx.strokeStyle = 'rgba(255,145,110,.75)'
    ctx.lineWidth = 5
    ctx.beginPath(); ctx.moveTo(42, 218); ctx.bezierCurveTo(180, 186, 306, 234, 486, 174); ctx.stroke()
    ctx.strokeStyle = 'rgba(150,225,255,.8)'
    ctx.lineWidth = 2
    ctx.beginPath(); ctx.moveTo(24, 198); ctx.bezierCurveTo(180, 158, 310, 206, 496, 150); ctx.stroke()
    ctx.fillStyle = 'rgba(8,18,30,.92)'
    ctx.beginPath(); ctx.moveTo(112, 226); ctx.bezierCurveTo(178, 190, 320, 190, 404, 226); ctx.lineTo(388, 246); ctx.lineTo(130, 246); ctx.closePath(); ctx.fill()
    ctx.fillStyle = 'rgba(180,235,255,.9)'
    ctx.beginPath(); ctx.arc(160, 242, 6, 0, Math.PI * 2); ctx.arc(360, 242, 6, 0, Math.PI * 2); ctx.fill()
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}
const adTextures = [makeAdTexture(0), makeAdTexture(1), makeAdTexture(2), makeAdTexture(3)]

const addBillboard = (radius, angle, y, seed) => {
  const texture = adTextures[seed % adTextures.length]
  const width = 5.6 + (seed % 3) * 1.3
  const height = width * .56
  const material = new THREE.MeshBasicMaterial({ map: texture, toneMapped: false, fog: false })
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(width, height), material)
  const centerX = Math.cos(angle) * radius
  const centerZ = Math.sin(angle) * radius
  const toCamX = 16 - centerX
  const toCamZ = 20 - centerZ
  const len = Math.hypot(toCamX, toCamZ) || 1
  const nx = toCamX / len
  const nz = toCamZ / len
  plane.position.set(centerX + nx * 2.6, y, centerZ + nz * 2.6)
  plane.rotation.y = Math.atan2(nx, nz)
  city.add(plane)
  cityBillboardMats.push(material)
  cityBillboards.push(plane)
  // 广告屏上的动态视频感叠层：光带、粒子和扫描线
  const overlayCanvas = document.createElement('canvas')
  overlayCanvas.width = 256
  overlayCanvas.height = 144
  const overlayCtx = overlayCanvas.getContext('2d')
  const overlayTexture = new THREE.CanvasTexture(overlayCanvas)
  overlayTexture.colorSpace = THREE.SRGBColorSpace
  const overlayMaterial = new THREE.MeshBasicMaterial({ map: overlayTexture, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, fog: false })
  const overlay = new THREE.Mesh(new THREE.PlaneGeometry(width * 0.98, height * 0.98), overlayMaterial)
  overlay.position.set(plane.position.x + nx * 0.02, y, plane.position.z + nz * 0.02)
  overlay.rotation.copy(plane.rotation)
  city.add(overlay)
  animatedAdScreens.push({ ctx: overlayCtx, texture: overlayTexture, width: 256, height: 144, phase: seed * 0.73 + Math.random() * 2, screen: plane })
  const glow = new THREE.Mesh(
    new THREE.PlaneGeometry(width * 1.45, height * 1.9),
    new THREE.MeshBasicMaterial({ map: glowTexture, color: 0xffb07a, transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
  )
  glow.position.set(plane.position.x + nx * 0.02, y, plane.position.z + nz * 0.02)
  glow.rotation.copy(plane.rotation)
  city.add(glow)
}

function drawAdOverlay(ad, t) {
  const { ctx, width: w, height: h } = ad
  ctx.clearRect(0, 0, w, h)
  ctx.globalCompositeOperation = 'lighter'
  // 斜向流动光带
  const sweep = ((t * 0.115 + ad.phase) % 1.45) - 0.2
  const x = sweep * w
  const grad = ctx.createLinearGradient(x - 36, 0, x + 70, h)
  grad.addColorStop(0, 'rgba(255,160,110,0)')
  grad.addColorStop(0.45, 'rgba(255,190,145,.26)')
  grad.addColorStop(0.55, 'rgba(170,230,255,.18)')
  grad.addColorStop(1, 'rgba(120,190,255,0)')
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, w, h)
  // 漂浮光点
  for (let i = 0; i < 7; i++) {
    const px = (Math.sin(t * 0.23 + i * 2.1 + ad.phase) * 0.5 + 0.5) * w
    const py = (Math.cos(t * 0.31 + i * 1.7) * 0.5 + 0.5) * h
    const a = 0.08 + (Math.sin(t * 0.9 + i) * 0.5 + 0.5) * 0.18
    ctx.fillStyle = `rgba(255,220,190,${a})`
    ctx.beginPath(); ctx.arc(px, py, 1.4 + (i % 3), 0, Math.PI * 2); ctx.fill()
  }
  // 扫描线
  const lineY = ((t * 0.06 + ad.phase) % 1) * h
  ctx.fillStyle = 'rgba(190,235,255,.08)'
  ctx.fillRect(0, lineY, w, 1)
  ctx.globalCompositeOperation = 'source-over'
  ad.texture.needsUpdate = true
}

const addCityTower = (radius, angle, height, baseWidth, detail = 1) => {
  const towerOrder = cityTowerOrder++
  const group = new THREE.Group()
  group.position.set(Math.cos(angle) * radius, 0, Math.sin(angle) * radius)
  group.rotation.y = Math.random() * Math.PI
  city.add(group)
  cityTowerGroups.push({ group, delay: towerOrder * 0.009 })
  const segments = Math.max(3, Math.round(height / (detail > 0 ? 2.7 : 4.2)))
  let y = 0
  let width = baseWidth
  let depth = baseWidth * (0.78 + Math.random() * 0.32)
  const goldTower = Math.random() < 0.035
  const goldCrown = Math.random() < (height > 18 ? 0.14 : 0.035)
  for (let i = 0; i < segments; i++) {
    const h = Math.max(1.6, height / segments) * (0.82 + Math.random() * 0.26)
    width *= 0.965 + Math.random() * 0.02
    depth *= 0.965 + Math.random() * 0.02
    const gold = goldTower || (i === segments - 1 && goldCrown) || Math.random() < 0.045
    const material = gold
      ? cityGoldMats[(i + Math.round(radius)) % cityGoldMats.length]
      : cityWindowMats[(i + Math.round(angle * 10)) % cityWindowMats.length]
    const block = new THREE.Mesh(cityBlockGeometry, material)
    block.scale.set(width, h, depth)
    block.position.set((Math.random() - 0.5) * 0.1, y + h / 2, (Math.random() - 0.5) * 0.1)
    block.rotation.y = (Math.random() - 0.5) * 0.06
    group.add(block)
    y += h + 0.105
    if (detail > 0 && Math.random() < 0.38) {
      const stripColor = [0xff5a9a, 0x54e9ff, 0xffc26b, 0x8d7dff][Math.floor(Math.random() * 4)]
      const strip = new THREE.Mesh(
        new THREE.BoxGeometry(0.13, h * 0.82, 0.13),
        new THREE.MeshBasicMaterial({ color: stripColor, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, fog: false }),
      )
      strip.position.set(width / 2 + 0.03, y - h / 2, depth / 2 + 0.03)
      group.add(strip)
      cityNeonMats.push(strip.material)
    }
  }
  // 屋顶细缝金冠
  const crown = new THREE.Mesh(cityBlockGeometry, cityGoldMats[Math.floor(Math.random() * cityGoldMats.length)])
  crown.scale.set(width * 0.72, 0.28, depth * 0.72)
  crown.position.y = y + 0.14
  group.add(crown)
  if (Math.random() < 0.5) {
    const color = [0xff5a5a, 0x5be7ff, 0xffc46b][Math.floor(Math.random() * 3)]
    const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 8), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, toneMapped: false }))
    beacon.position.y = y + 0.35
    beacon.userData.baseColor = beacon.material.color.clone()
    beacon.userData.phase = Math.random() * Math.PI * 2
    group.add(beacon)
    cityBeacons.push(beacon)
  }
  if (detail > 0 && height > 11 && radius < 105 && Math.random() < 0.55) addBillboard(radius, angle, y * (0.45 + Math.random() * 0.28), Math.round(radius + angle * 10))
}

const cameraAzimuth = Math.atan2(0.95, 0.62)
const angleDiff = (a, b) => {
  let d = a - b
  while (d > Math.PI) d -= Math.PI * 2
  while (d < -Math.PI) d += Math.PI * 2
  return Math.abs(d)
}
// 以默认视角为背景，集中排布可见天际线；两侧再补少量楼群
const backgroundAngle = cameraAzimuth + Math.PI
const layerPlan = [
  { count: 10, radius: 94, spread: 20, height: 11, hVar: 13, width: 3.8, detail: 1 },
  { count: 12, radius: 124, spread: 26, height: 15, hVar: 18, width: 4.2, detail: 1 },
  { count: 12, radius: 158, spread: 32, height: 20, hVar: 24, width: 4.6, detail: 1 },
  { count: 12, radius: 198, spread: 40, height: 26, hVar: 30, width: 5.0, detail: 0 },
  { count: 10, radius: 248, spread: 50, height: 34, hVar: 36, width: 5.4, detail: 0 },
]
for (const layer of layerPlan) {
  for (let i = 0; i < layer.count; i++) {
    const angle = backgroundAngle + (Math.random() - 0.5) * 2.2
    const radius = layer.radius + Math.random() * layer.spread
    const height = layer.height + Math.random() * layer.hVar
    const width = layer.width + Math.random() * 3.2
    addCityTower(radius, angle, height, width, layer.detail)
  }
}
// 两侧补楼，让城市从办公室两侧延伸出去
for (let i = 0; i < 14; i++) {
  const angle = cameraAzimuth + (Math.random() > 0.5 ? 1 : -1) * (0.55 + Math.random() * 1.35)
  const radius = 96 + Math.random() * 150
  addCityTower(radius, angle, 11 + Math.random() * 34, 3.4 + Math.random() * 5, 0)
}

// 低层街区填满天际线底部
for (let i = 0; i < 28; i++) {
  const angle = backgroundAngle + (Math.random() - 0.5) * 2.5
  const radius = 86 + Math.random() * 145
  addCityTower(radius, angle, 5 + Math.random() * 8, 5.5 + Math.random() * 8, 0)
}

// 办公室周围的近景方块街区，填满地面
for (let i = 0; i < 44; i++) {
  const angle = Math.random() * Math.PI * 2
  const radius = 52 + Math.random() * 32
  if (radius < 62 && angleDiff(angle, cameraAzimuth) < 0.62) continue
  addCityTower(radius, angle, 2.5 + Math.random() * 5.5, 1.8 + Math.random() * 2.4, 0)
}
// 中景高楼，填满办公室与远处天际线之间的空隙
for (let i = 0; i < 20; i++) {
  const angle = backgroundAngle + (Math.random() - 0.5) * 2.6
  addCityTower(70 + Math.random() * 32, angle, 8 + Math.random() * 12, 2.8 + Math.random() * 2.6, 0)
}
// 固定几块大型户外广告，保证正面视角能看到
addBillboard(104, backgroundAngle - 0.34, 15, 11)
addBillboard(128, backgroundAngle + 0.28, 19, 12)
addBillboard(164, backgroundAngle - 0.08, 25, 13)
addBillboard(94, backgroundAngle + 0.58, 12, 14)

// 更远处的剪影，制造望不到边的层次
for (let i = 0; i < 18; i++) {
  const angle = Math.random() * Math.PI * 2
  const radius = 320 + Math.random() * 90
  addCityTower(radius, angle, 36 + Math.random() * 48, 6 + Math.random() * 8, 0)
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
    color: 0xffd0a0,
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
  ground: new THREE.Color(0x182435),
  city: new THREE.Color(0xeef3f7),
  hemiI: 2.4, keyI: 3.2, rimI: 0.55, fillI: 0.45,
  exposure: 1.18, bloom: 0.18, dust: 0.05, grid: 0.32, neon: 0.65,
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
  for (const material of cityWindowMats) material.emissiveIntensity = 1.35 - mix * 0.5
  for (const material of cityGoldMats) material.emissiveIntensity = 0.28 - mix * 0.1
  for (const material of cityNeonMats) material.opacity = 0.85 - mix * 0.22
  for (const material of cityBillboardMats) material.opacity = 0.96 - mix * 0.18
  const neonMaterial = neonSign?.material
  if (neonMaterial) neonMaterial.opacity = NIGHT_THEME.neon + (DAY_THEME.neon - NIGHT_THEME.neon) * mix
  sunsetLight.intensity = 1.25 - mix * 0.85
  for (const item of [...themeLights, ...annexLights]) item.light.intensity = item.night + (item.day - item.night) * mix
  const weatherDim = weatherMode === 'storm' ? 0.86 : weatherMode === 'rain' || weatherMode === 'snow' ? 0.92 : weatherMode === 'cloudy' ? 0.95 : weatherMode === 'wind' ? 0.98 : 1
  hemi.intensity *= weatherDim
  key.intensity *= weatherDim
  rim.intensity *= weatherDim
  fill.intensity *= weatherDim
  scene.fog.density = 0.0085 * (weatherMode === 'rain' || weatherMode === 'snow' || weatherMode === 'storm' ? 1.06 : 1)
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
  ctx.font = '900 72px Inter, "PingFang SC", system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.shadowColor = 'rgba(77,107,254,.95)'
  ctx.shadowBlur = 40
  ctx.fillStyle = '#eaf1ff'
  ctx.fillText('DEEPSEEK HARNESS', 512, 74)
  ctx.shadowBlur = 0
  ctx.font = '500 26px ui-monospace, Menlo, monospace'
  ctx.fillStyle = 'rgba(160,190,255,.9)'
  ctx.fillText('LIVE SESSION OFFICE', 512, 146)
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
  slits: faceSlits,
  uneven: faceUneven,
}
const faceTextures = {}
const faceLoader = new THREE.TextureLoader()
for (const [name, src] of Object.entries(FACE_SRC)) {
  const texture = faceLoader.load(src)
  texture.colorSpace = THREE.SRGBColorSpace
  faceTextures[name] = texture
}
const CUSTOM_FACE_KEY = 'agent-office-custom-face'
let customFaceTexture = null
let customFaceData = ''
const FACE_FOR_STATUS = {
  working: 'uneven',
  need_me: 'surprised',
  stuck: 'dizzy',
  done: 'loved',
  resting: 'slits',
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


const sweatTexture = (() => {
  const canvas = document.createElement('canvas')
  canvas.width = 64
  canvas.height = 96
  const ctx = canvas.getContext('2d')
  ctx.clearRect(0, 0, 64, 96)
  ctx.fillStyle = '#bfeaff'
  ctx.beginPath()
  ctx.moveTo(32, 8)
  ctx.bezierCurveTo(46, 30, 55, 48, 55, 62)
  ctx.bezierCurveTo(55, 79, 45, 89, 32, 89)
  ctx.bezierCurveTo(19, 89, 9, 79, 9, 62)
  ctx.bezierCurveTo(9, 48, 18, 30, 32, 8)
  ctx.fill()
  ctx.fillStyle = 'rgba(255,255,255,.85)'
  ctx.beginPath()
  ctx.ellipse(23, 58, 5, 9, -0.35, 0, Math.PI * 2)
  ctx.fill()
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
})()

const scribbleTexture = (() => {
  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 160
  const ctx = canvas.getContext('2d')
  ctx.clearRect(0, 0, 256, 160)
  const strokes = [
    [[34, 92], [64, 34], [92, 112], [124, 40], [154, 108], [186, 48], [224, 96]],
    [[48, 54], [92, 78], [60, 126], [126, 92], [172, 124], [208, 66]],
    [[78, 24], [104, 66], [144, 26], [168, 74], [208, 32]],
  ]
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  for (const pass of [{ color: 'rgba(255,255,255,.18)', width: 13 }, { color: '#0b0d10', width: 8 }]) {
    ctx.strokeStyle = pass.color
    ctx.lineWidth = pass.width
    for (const points of strokes) {
      ctx.beginPath()
      ctx.moveTo(points[0][0], points[0][1])
      for (let i = 1; i < points.length - 1; i += 2) {
        const [cx, cy] = points[i]
        const [x, y] = points[i + 1]
        ctx.quadraticCurveTo(cx, cy, x, y)
      }
      ctx.stroke()
    }
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
})()
const OVERLOAD_COLOR = new THREE.Color(0xff5a5a)

const keyboardTexture = (() => {
  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 96
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#0a1017'
  ctx.fillRect(0, 0, 256, 96)
  const cols = 14
  const rows = 4
  const keyW = 14
  const keyH = 14
  const gap = 2
  const startX = (256 - (cols * (keyW + gap) - gap)) / 2
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = startX + c * (keyW + gap)
      const y = 10 + r * (keyH + gap)
      ctx.fillStyle = (r === 2 && c > 4 && c < 9) ? '#24445a' : '#1c2a36'
      ctx.beginPath(); ctx.roundRect(x, y, keyW, keyH, 2); ctx.fill()
      ctx.fillStyle = 'rgba(150,220,255,.22)'
      ctx.fillRect(x + 2, y + 2, keyW - 4, 2)
    }
  }
  // spacebar + underglow
  ctx.fillStyle = '#1c2a36'
  ctx.beginPath(); ctx.roundRect(62, 74, 132, 13, 3); ctx.fill()
  ctx.fillStyle = 'rgba(80,220,255,.55)'
  ctx.fillRect(4, 91, 248, 2)
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

/* ------------------------------------------------------------------ *
 * 天气：云层 / 雨 / 雪 / 风
 * ------------------------------------------------------------------ */
const weatherGroup = new THREE.Group()
scene.add(weatherGroup)
const weatherCloudTexture = (() => {
  const canvas = document.createElement('canvas')
  canvas.width = 512
  canvas.height = 192
  const ctx = canvas.getContext('2d')
  ctx.clearRect(0, 0, 512, 192)
  for (const [x, y, rx, ry, alpha] of [[120, 108, 160, 26, .16], [260, 84, 210, 22, .14], [400, 112, 170, 20, .13], [190, 132, 130, 14, .11], [340, 64, 120, 16, .1]]) {
    const grad = ctx.createRadialGradient(x, y, 0, x, y, rx)
    grad.addColorStop(0, `rgba(230,242,250,${alpha})`)
    grad.addColorStop(.5, `rgba(196,214,228,${alpha * .55})`)
    grad.addColorStop(1, 'rgba(170,195,214,0)')
    ctx.fillStyle = grad
    ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); ctx.fill()
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
})()
const weatherClouds = []
for (let i = 0; i < 7; i++) {
  const material = new THREE.SpriteMaterial({ map: weatherCloudTexture, color: 0x8d9dab, transparent: true, opacity: 0, depthWrite: false, toneMapped: false })
  const cloud = new THREE.Sprite(material)
  cloud.scale.set(17 + (i % 3) * 3, 2.8 + (i % 2) * .8, 1)
  cloud.position.set(-16 + (i * 5.1) % 32, 6.2 + (i % 4) * .9, 4 + (i * 3.1) % 13)
  cloud.userData = { baseX: cloud.position.x, baseY: cloud.position.y, baseZ: cloud.position.z, phase: i * 0.9 }
  weatherGroup.add(cloud)
  weatherClouds.push(cloud)
}

const WEATHER_COUNT = 560
const weatherPositions = new Float32Array(WEATHER_COUNT * 3)
const weatherGeometry = new THREE.BufferGeometry()
weatherGeometry.setAttribute('position', new THREE.BufferAttribute(weatherPositions, 3))
const weatherPointTexture = (() => {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 64
  const ctx = canvas.getContext('2d')
  const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32)
  grad.addColorStop(0, 'rgba(255,255,255,1)')
  grad.addColorStop(0.5, 'rgba(235,250,255,.8)')
  grad.addColorStop(1, 'rgba(235,250,255,0)')
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, 64, 64)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
})()
const weatherMaterial = new THREE.PointsMaterial({ map: weatherPointTexture, alphaTest: 0.02, color: 0x9fd4ff, size: 0.055, transparent: true, opacity: 0, depthWrite: false, toneMapped: false, sizeAttenuation: true })
const weatherPoints = new THREE.Points(weatherGeometry, weatherMaterial)
weatherPoints.frustumCulled = false
weatherPoints.visible = false
weatherGroup.add(weatherPoints)
const rainPositions = new Float32Array(WEATHER_COUNT * 6)
const rainGeometry = new THREE.BufferGeometry()
rainGeometry.setAttribute('position', new THREE.BufferAttribute(rainPositions, 3))
const rainMaterial = new THREE.LineBasicMaterial({ color: 0x9fd4ff, transparent: true, opacity: 0, depthWrite: false, toneMapped: false })
const rainLines = new THREE.LineSegments(rainGeometry, rainMaterial)
rainLines.frustumCulled = false
rainLines.visible = false
weatherGroup.add(rainLines)
const RAIN_COUNT = 80
rainGeometry.setDrawRange(0, RAIN_COUNT * 2)
const weatherParticles = []
let weatherMode = 'clear'
let weatherWind = 0
let weatherCloudLevel = 0
let weatherPointLevel = 0

function seedWeatherParticles(mode) {
  const isWind = mode === 'wind'
  const isSnow = mode === 'snow'
  for (let i = 0; i < WEATHER_COUNT; i++) {
    const x = (Math.random() - 0.5) * (isWind ? 34 : 26)
    const y = isWind ? 1.5 + Math.random() * 7 : Math.random() * 18
    const z = (Math.random() - 0.5) * (isWind ? 22 : 24)
    weatherParticles[i] = { x, y, z, speed: isSnow ? 0.035 + Math.random() * 0.035 : 0.16 + Math.random() * 0.2, drift: Math.random() * 2 - 1 }
    weatherPositions[i * 3] = x
    weatherPositions[i * 3 + 1] = y
    weatherPositions[i * 3 + 2] = z
  }
  weatherGeometry.attributes.position.needsUpdate = true
}

function setWeather(mode, wind = 0) {
  weatherMode = ['clear', 'cloudy', 'rain', 'snow', 'wind', 'storm'].includes(mode) ? mode : 'clear'
  weatherWind = Number.isFinite(wind) ? wind : 0
  const wet = weatherMode === 'rain' || weatherMode === 'storm'
  const snow = weatherMode === 'snow'
  const windy = weatherMode === 'wind'
  weatherPoints.visible = snow || windy
  rainLines.visible = wet
  weatherMaterial.color.set(snow ? 0xe6f5ff : 0xcfe8ff)
  weatherMaterial.size = snow ? 0.17 : 0.06
  if (wet) rainGeometry.setDrawRange(0, RAIN_COUNT * 2)
  if (wet || snow || windy) seedWeatherParticles(weatherMode)
}

const WEATHER_ICONS = {
  sun: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"><circle cx="8" cy="8" r="3.1"/><path d="M8 1.2v1.5M8 13.3v1.5M1.2 8h1.5M13.3 8h1.5M3.2 3.2l1 1M11.8 11.8l1 1M12.8 3.2l-1 1M4.2 11.8l-1 1"/></svg>',
  cloud: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"><path d="M4.2 11.2h7.1a2.7 2.7 0 0 0 .2-5.4 4 4 0 0 0-7.6-1.1A3.3 3.3 0 0 0 4.2 11.2Z"/></svg>',
  rain: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"><path d="M4.2 9.8h7.1a2.7 2.7 0 0 0 .2-5.4 4 4 0 0 0-7.6-1.1A3.3 3.3 0 0 0 4.2 9.8Z"/><path d="M5.2 12.3l-.6 1.3M8.1 12.3l-.6 1.3M11 12.3l-.6 1.3"/></svg>',
  snow: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"><path d="M4.2 9.8h7.1a2.7 2.7 0 0 0 .2-5.4 4 4 0 0 0-7.6-1.1A3.3 3.3 0 0 0 4.2 9.8Z"/><path d="M5 12.4h.01M8 13.2h.01M11 12.4h.01"/></svg>',
  wind: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"><path d="M1.5 5.5h8.2a2.1 2.1 0 1 0-2.1-2.1M1.5 8.5h11.2a2.1 2.1 0 1 1-2.1 2.1M2.8 11.5h5.1"/></svg>',
  storm: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"><path d="M4.2 9.4h7.1a2.7 2.7 0 0 0 .2-5.4 4 4 0 0 0-7.6-1.1A3.3 3.3 0 0 0 4.2 9.4Z"/><path d="M8.7 9.7 6.8 12.4h2.5l-1 2.1"/></svg>',
}

function weatherPresentation(code, wind) {
  const c = Number(code)
  const w = Number(wind)
  if (c >= 95) return { label: '雷雨', icon: WEATHER_ICONS.storm, mode: 'storm' }
  if (c >= 71 && c <= 86) return { label: '下雪', icon: WEATHER_ICONS.snow, mode: 'snow' }
  if ((c >= 51 && c <= 67) || (c >= 80 && c <= 82)) return { label: '下雨', icon: WEATHER_ICONS.rain, mode: 'rain' }
  if (c === 45 || c === 48) return { label: '有雾', icon: WEATHER_ICONS.cloud, mode: 'cloudy' }
  if (c === 2) return { label: '多云', icon: WEATHER_ICONS.cloud, mode: 'cloudy' }
  if (c === 3) return { label: '阴天', icon: WEATHER_ICONS.cloud, mode: 'cloudy' }
  if (w >= 28) return { label: '大风', icon: WEATHER_ICONS.wind, mode: 'wind' }
  return { label: '晴天', icon: WEATHER_ICONS.sun, mode: 'clear' }
}

function updateWeatherNow(code, temperature, wind) {
  const el = $('#weatherNow')
  const icon = $('#weatherIcon')
  const label = $('#weatherLabel')
  if (!el || !icon || !label) return
  const temp = Number(temperature)
  if (!Number.isFinite(temp)) {
    el.hidden = true
    return
  }
  const presentation = weatherPresentation(code, wind)
  icon.innerHTML = presentation.icon
  label.textContent = `今天 ${presentation.label} ${Math.round(temp)}°`
  el.title = `今天 · ${presentation.label} · ${Math.round(temp)}°C · 风速 ${Math.round(Number(wind) || 0)} km/h`
  el.hidden = false
}

function refreshWeather() {
  let location = null
  try {
    const raw = localStorage.getItem('agent-office-weather-location')
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Number.isFinite(parsed?.lat) && Number.isFinite(parsed?.lon)) location = parsed
    }
  } catch {}
  if (!location) {
    setWeather('clear')
    const el = $('#weatherNow')
    if (el) el.hidden = true
    return
  }
  fetch(`/agent-office/api/weather?lat=${encodeURIComponent(location.lat)}&lon=${encodeURIComponent(location.lon)}`, { cache: 'no-store' })
    .then(response => response.ok ? response.json() : null)
    .then(data => {
      if (!data?.ok) {
        setWeather('clear')
        const el = $('#weatherNow')
        if (el) el.hidden = true
        return
      }
      const code = Number(data.code)
      let mode = 'clear'
      if (code >= 95) mode = 'storm'
      else if (code >= 71 && code <= 86) mode = 'snow'
      else if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) mode = 'rain'
      else if (code === 2 || code === 3 || code === 45 || code === 48) mode = 'cloudy'
      else if (Number(data.wind) >= 28) mode = 'wind'
      setWeather(mode, Number(data.wind))
      updateWeatherNow(data.code, data.temperature, data.wind)
    })
    .catch(() => setWeather('clear'))
}

function updateWeatherFrame(t) {
  const cloudy = weatherMode === 'cloudy' || weatherMode === 'wind'
  weatherCloudLevel += ((cloudy ? 1 : 0) - weatherCloudLevel) * 0.025
  for (const cloud of weatherClouds) {
    cloud.material.opacity = weatherCloudLevel * 0.22
    cloud.position.x = cloud.userData.baseX + Math.sin(t * 0.035 + cloud.userData.phase) * 2.2
    cloud.position.z = cloud.userData.baseZ + Math.cos(t * 0.03 + cloud.userData.phase) * 1.2
  }
  const active = weatherPoints.visible
  const wet = weatherMode === 'rain' || weatherMode === 'storm'
  weatherPointLevel += (((active || wet) ? 1 : 0) - weatherPointLevel) * 0.06
  weatherMaterial.opacity = weatherPointLevel * (weatherMode === 'snow' ? 0.6 : 0.5)
  rainMaterial.opacity = weatherPointLevel * 0.3
  if (wet) {
    for (let i = 0; i < RAIN_COUNT; i++) {
      const p = weatherParticles[i]
      if (!p) continue
      p.y -= p.speed * 0.95
      p.x += weatherWind * 0.0015 + p.drift * 0.0012
      if (p.y < 0) { p.y = 17; p.x = (Math.random() - 0.5) * 26; p.z = (Math.random() - 0.5) * 24 }
      rainPositions[i * 6] = p.x
      rainPositions[i * 6 + 1] = p.y
      rainPositions[i * 6 + 2] = p.z
      rainPositions[i * 6 + 3] = p.x + weatherWind * 0.0025
      rainPositions[i * 6 + 4] = p.y - 0.22
      rainPositions[i * 6 + 5] = p.z
    }
    rainGeometry.attributes.position.needsUpdate = true
  } else if (active) {
    for (let i = 0; i < WEATHER_COUNT; i++) {
      const p = weatherParticles[i]
      if (!p) continue
      if (weatherMode === 'wind') {
        p.x += 0.11 + Math.abs(weatherWind) * 0.002
        p.y += Math.sin(t * 1.3 + p.drift) * 0.004
        if (p.x > 18) p.x = -18
      } else if (weatherMode === 'snow') {
        p.y -= p.speed * 0.55
        p.x += Math.sin(t * 1.4 + p.drift * 5) * 0.006
        if (p.y < 0) { p.y = 16; p.x = (Math.random() - 0.5) * 26 }
      } else {
        p.y -= p.speed
        p.x += (weatherWind * 0.0015 + p.drift * 0.001)
        if (p.y < 0) { p.y = 17; p.x = (Math.random() - 0.5) * 26; p.z = (Math.random() - 0.5) * 24 }
      }
      weatherPositions[i * 3] = p.x
      weatherPositions[i * 3 + 1] = p.y
      weatherPositions[i * 3 + 2] = p.z
    }
    weatherGeometry.attributes.position.needsUpdate = true
  }
}

window.addEventListener('storage', event => {
  if (event.key === 'agent-office-weather-location') refreshWeather()
})

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
        if (material.map && material.map !== glowTexture && material.map !== shadowTexture && material.map !== floorTexture && material.map !== sweatTexture && material.map !== scribbleTexture && material.map !== keyboardTexture) material.map.dispose()
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

  // 正常工作：大汗淋漓；长时间工作：红温 + 头顶乱线
  const sweat = []
  for (let i = 0; i < 4; i++) {
    const mat = new THREE.SpriteMaterial({ map: sweatTexture, transparent: true, opacity: 0, depthWrite: false, toneMapped: false, color: 0xbfeaff })
    const drop = new THREE.Sprite(mat)
    drop.scale.set(0.095, 0.145, 1)
    drop.visible = false
    group.add(drop)
    sweat.push({ sprite: drop, phase: i / 4, x: i % 2 === 0 ? -0.27 : 0.27, drift: i < 2 ? -0.04 : 0.04 })
  }
  const scribbleGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture, color: 0xff4a4a, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }))
  scribbleGlow.scale.set(1.0, 0.62, 1)
  scribbleGlow.position.set(0, baseY + 1.55, 0.03)
  group.add(scribbleGlow)
  const scribble = new THREE.Sprite(new THREE.SpriteMaterial({ map: scribbleTexture, transparent: true, opacity: 0, depthWrite: false, toneMapped: false }))
  scribble.scale.set(0.84, 0.5, 1)
  scribble.position.set(0, baseY + 1.55, 0.04)
  group.add(scribble)

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
    parts: { face, faceMat, ring, glow, badge, label, zzz, ripples, motion, seatShadow, shadow, tint, baseY, sweat, scribble, scribbleGlow },
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

  // 键盘：底座 + 键帽贴图 + 底部氛围灯
  const keyboardBase = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.03, 0.18), new THREE.MeshStandardMaterial({ color: 0x111923, roughness: 0.45, metalness: 0.4 }))
  keyboardBase.position.set(spot.x + 0.24, 0.575, spot.z + 0.8)
  group.add(keyboardBase)
  const keyboardTop = new THREE.Mesh(
    new THREE.PlaneGeometry(0.49, 0.16),
    new THREE.MeshBasicMaterial({ map: keyboardTexture, toneMapped: false }),
  )
  keyboardTop.rotation.x = -Math.PI / 2
  keyboardTop.position.set(spot.x + 0.24, 0.592, spot.z + 0.8)
  group.add(keyboardTop)
  const keyboardGlow = new THREE.Mesh(
    new THREE.BoxGeometry(0.48, 0.006, 0.012),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8, toneMapped: false }),
  )
  keyboardGlow.position.set(spot.x + 0.24, 0.58, spot.z + 0.9)
  group.add(keyboardGlow)

  // 鼠标垫 + 鼠标 + 滚轮
  const mousePad = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.008, 0.22), new THREE.MeshStandardMaterial({ color: 0x101923, roughness: 0.92, metalness: 0.05 }))
  mousePad.position.set(spot.x + 0.63, 0.588, spot.z + 0.83)
  group.add(mousePad)
  const mouse = new THREE.Mesh(
    new RoundedBoxGeometry(0.09, 0.04, 0.13, 3, 0.018),
    new THREE.MeshStandardMaterial({ color: 0x1c2835, roughness: 0.5, metalness: 0.25 }),
  )
  mouse.position.set(spot.x + 0.63, 0.61, spot.z + 0.82)
  mouse.rotation.y = -0.2
  group.add(mouse)
  const wheel = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.018, 0.035), new THREE.MeshBasicMaterial({ color }))
  wheel.position.set(spot.x + 0.63, 0.64, spot.z + 0.79)
  group.add(wheel)

  // 键盘 / 鼠标线缆
  const cableMat = new THREE.MeshStandardMaterial({ color: 0x607385, roughness: 0.38, metalness: 0.3 })
  const keyboardCable = new THREE.Mesh(
    new THREE.TubeGeometry(new THREE.CatmullRomCurve3([
      new THREE.Vector3(spot.x + 0.24, 0.592, spot.z + 0.71),
      new THREE.Vector3(spot.x + 0.18, 0.592, spot.z + 0.62),
      new THREE.Vector3(spot.x - 0.06, 0.592, spot.z + 0.54),
      new THREE.Vector3(spot.x - 0.34, 0.592, spot.z + 0.48),
      new THREE.Vector3(spot.x - 0.48, 0.6, spot.z + 0.42),
    ], false, 'centripetal'), 18, 0.008, 5, false),
    cableMat,
  )
  group.add(keyboardCable)
  const mouseCable = new THREE.Mesh(
    new THREE.TubeGeometry(new THREE.CatmullRomCurve3([
      new THREE.Vector3(spot.x + 0.63, 0.6, spot.z + 0.76),
      new THREE.Vector3(spot.x + 0.64, 0.592, spot.z + 0.62),
      new THREE.Vector3(spot.x + 0.34, 0.592, spot.z + 0.54),
      new THREE.Vector3(spot.x - 0.08, 0.592, spot.z + 0.48),
      new THREE.Vector3(spot.x - 0.46, 0.6, spot.z + 0.42),
    ], false, 'centripetal'), 18, 0.007, 5, false),
    cableMat,
  )
  group.add(mouseCable)



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
  shelf.position.set(-W / 2 + 0.38, 0, -0.4)
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
  if (selectedId !== null) {
    const entry = agentsById.get(selectedId)
    if (entry) renderCard(entry.agent)
  }
}

function loadCustomFace() {
  let data = ''
  try { data = localStorage.getItem(CUSTOM_FACE_KEY) ?? '' } catch {}
  if (!data) {
    customFaceTexture = null
    customFaceData = ''
    applyCustomFaceToAll()
    return
  }
  customFaceData = data
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
let introPlayed = false
let introTl = null

function viewScale() {
  return clamp(1638 / Math.max(900, window.innerWidth), 0.82, 1.5)
}

function globalPose(floorsCount) {
  const height = Math.max(0, (floorsCount - 1) * FLOOR_GAP)
  const centerX = ((floorsCount - 1) * OFFSET_X) / 2
  const centerZ = ((floorsCount - 1) * OFFSET_Z) / 2
  const dist = (19 + floorsCount * 3) * viewScale() * 0.72
  const target = new THREE.Vector3(centerX + 3.6, height / 2 + 1.0, centerZ + 0.8)
  return {
    target,
    position: new THREE.Vector3(centerX + dist * 0.55, target.y + dist * 0.32, centerZ + dist * 1.08),
  }
}

function focusPose(floor) {
  const box = new THREE.Box3().setFromObject(floor.group)
  const center = box.getCenter(new THREE.Vector3())
  const size = box.getSize(new THREE.Vector3())
  const radius = Math.max(size.x, size.z * 1.08, size.y * 1.5)
  const zoom = Math.min(2, Math.max(1, window.visualViewport?.scale || 1))
  const dist = radius * 1.3 * clamp(viewScale(), 0.95, 1.2) * zoom
  const target = center.clone().add(new THREE.Vector3(0, -0.5, 0))
  return {
    target,
    position: target.clone().add(new THREE.Vector3(0, dist * 0.58, dist)),
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
  if (annex) annex.visible = !focused
  if (mcpGroup) mcpGroup.visible = !focused
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
  if (focused && cameraGoal !== null && targetGoal !== null) {
    camera.position.copy(cameraGoal)
    controls.target.copy(targetGoal)
    cameraGoal = null
    targetGoal = null
    controls.update()
  }
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
    const floor = floors.find(item => item.team === entry.agent.team)
    const world = new THREE.Vector3()
    entry.robot.getWorldPosition(world)
    targetGoal = floor ? floor.offset.clone().add(new THREE.Vector3(0, 1.2, 0)) : world.clone().add(new THREE.Vector3(0, 1.0, 0))
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
  $('#checkBody').innerHTML = checks.map(item => `<div class="check ${item.ok ? 'ok' : ''}"><i><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 8.5l3 3 6-6"/></svg></i><span>${item.text}</span></div>`).join('')
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
  const feedBody = $('#feedBody')
  feedBody.innerHTML = activities.length === 0
    ? '<div class="evt empty">等待状态变化…</div>'
    : [...activities].reverse().map(item => {
      const status = STATUS[item.status] ?? STATUS.resting
      return `<div class="evt"><span class="t">${new Date(item.time).toTimeString().slice(0, 5)}</span><i style="background:${status.color}"></i><b>${esc(item.name)}</b><span>${esc(item.text)}</span></div>`
    }).join('')
  requestAnimationFrame(() => { feedBody.scrollTop = feedBody.scrollHeight })
}

let cardHideTimer = null

function renderCard(agent) {
  const card = $('#card')
  if (agent === null) {
    if (!card.classList.contains('show') || card.classList.contains('is-out')) return
    card.classList.add('is-out')
    clearTimeout(cardHideTimer)
    cardHideTimer = setTimeout(() => card.classList.remove('show', 'is-out'), 160)
    return
  }
  clearTimeout(cardHideTimer)
  card.classList.remove('is-out')
  card.classList.add('show')
  const status = STATUS[agent.status] ?? STATUS.resting
  const floor = floors.find(item => item.team === agent.team)
  $('#cardTeam').textContent = floor === undefined ? agent.team : `楼层 ${floor.index + 1} · ${agent.team}`
  const glyphEl = $('#cardGlyph')
  glyphEl.textContent = ''
  glyphEl.style.backgroundImage = `url(${customFaceData || faceDefault})`
  glyphEl.style.backgroundSize = '82% 82%'
  glyphEl.style.backgroundRepeat = 'no-repeat'
  glyphEl.style.backgroundPosition = 'center'
  glyphEl.style.backgroundColor = customFaceData ? 'transparent' : `${agent.color}22`
  glyphEl.style.border = customFaceData ? '1px solid var(--line-2)' : `1px solid ${agent.color}66`
  $('#cardName').textContent = agent.name
  $('#cardSub').textContent = agent.schedule
  const statusEl = $('#cardStatus')
  statusEl.textContent = `● ${status.label}`
  statusEl.dataset.status = agent.status
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


/* ------------------------------------------------------------------ *
 * 右侧 Annex：教室布局（讲台 + 通用/备考/题库三席）
 * ------------------------------------------------------------------ */
const ANNEX_X = 9.6
const ANNEX_Z = 0.3
const ANNEX_W = 7.2
const ANNEX_D = 6.0
let annex = null
let annexLights = []
let mcpCurve = null
let mcpBeads = []
let mcpDashes = []
let mcpGroup = null
let mcpSign = null
let sciFiIcons = []
let studyClock = null
let annexCats = []

function drawStudyClock(seconds, alarm) {
  if (!studyClock) return
  const ctx = studyClock.ctx
  const w = 512
  const h = 512
  const total = Math.max(0, Math.min(25 * 60, seconds))
  const mm = String(Math.floor(total / 60)).padStart(2, '0')
  const ss = String(total % 60).padStart(2, '0')
  ctx.clearRect(0, 0, w, h)
  ctx.save()
  ctx.translate(256, 256)
  // 背后柔光
  const glow = ctx.createRadialGradient(0, 0, 40, 0, 0, 240)
  glow.addColorStop(0, alarm ? 'rgba(255,92,92,.34)' : 'rgba(80,210,255,.24)')
  glow.addColorStop(1, 'rgba(80,210,255,0)')
  ctx.fillStyle = glow
  ctx.beginPath(); ctx.arc(0, 0, 240, 0, Math.PI * 2); ctx.fill()
  // 铃铛
  ctx.fillStyle = '#263744'
  ctx.strokeStyle = alarm ? '#ff6b6b' : '#9fe7ff'
  ctx.lineWidth = 10
  for (const x of [-104, 104]) {
    ctx.beginPath(); ctx.arc(x, -190, 54, Math.PI, 0); ctx.fill(); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(x - 54, -190); ctx.lineTo(x + 54, -190); ctx.stroke()
  }
  // 支脚
  ctx.lineCap = 'round'
  ctx.beginPath(); ctx.moveTo(-110, 190); ctx.lineTo(-160, 248); ctx.stroke()
  ctx.beginPath(); ctx.moveTo(110, 190); ctx.lineTo(160, 248); ctx.stroke()
  // 表身
  ctx.fillStyle = '#e9e2d2'
  ctx.beginPath(); ctx.arc(0, 0, 170, 0, Math.PI * 2); ctx.fill()
  ctx.lineWidth = 22
  ctx.strokeStyle = alarm ? '#d84343' : '#294654'
  ctx.beginPath(); ctx.arc(0, 0, 170, 0, Math.PI * 2); ctx.stroke()
  // 内圈
  ctx.fillStyle = alarm ? '#3a1418' : '#112029'
  ctx.beginPath(); ctx.arc(0, 0, 140, 0, Math.PI * 2); ctx.fill()
  ctx.strokeStyle = alarm ? '#ff8f8f' : '#8fe7ff'
  ctx.lineWidth = 3
  ctx.beginPath(); ctx.arc(0, 0, 140, 0, Math.PI * 2); ctx.stroke()
  // 数字
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = alarm ? '#ffb3b3' : '#9fe7ff'
  ctx.font = '600 26px ui-monospace, Menlo, monospace'
  ctx.fillText('FOCUS  TIMER', 0, -88)
  ctx.fillStyle = alarm ? '#ffd0d0' : '#f2fbff'
  ctx.font = '800 98px ui-monospace, Menlo, monospace'
  ctx.fillText(mm + ':' + ss, 0, 8)
  ctx.fillStyle = alarm ? '#ff8f8f' : 'rgba(159,231,255,.75)'
  ctx.font = '600 22px "PingFang SC", system-ui, sans-serif'
  ctx.fillText(alarm ? '时间到' : '备考倒计时', 0, 72)
  // 顶部小灯
  ctx.fillStyle = alarm ? '#ff6b6b' : '#7dd3a0'
  ctx.beginPath(); ctx.arc(0, -118, 7, 0, Math.PI * 2); ctx.fill()
  ctx.restore()
  studyClock.texture.needsUpdate = true
}

function buildAnnex() {
  annex = new THREE.Group()
  annex.position.set(ANNEX_X, 0, ANNEX_Z)
  annex.scale.setScalar(0.84)
  scene.add(annex)

  const wood = new THREE.MeshStandardMaterial({ color: 0x2a2119, roughness: 0.72, metalness: 0.2 })
  const dark = new THREE.MeshStandardMaterial({ color: 0x17212b, roughness: 0.5, metalness: 0.5 })
  const metal = new THREE.MeshStandardMaterial({ color: 0x334654, roughness: 0.35, metalness: 0.75 })
  const glass = new THREE.MeshStandardMaterial({ color: 0x8fc8ff, transparent: true, opacity: 0.06, roughness: 0.08, metalness: 0.1, depthWrite: false, side: THREE.DoubleSide })
  const cyan = new THREE.MeshBasicMaterial({ color: 0x7fd7ff, toneMapped: false })
  const warm = new THREE.MeshBasicMaterial({ color: 0xffcf9a, toneMapped: false })
  const box = (w, h, d, mat, x, y, z, parent = annex) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat)
    mesh.position.set(x, y, z)
    parent.add(mesh)
    return mesh
  }

  // 地板 / 边线
  box(ANNEX_W, 0.3, ANNEX_D, wood, 0, -0.15, 0)
  const top = new THREE.Mesh(new THREE.PlaneGeometry(ANNEX_W - 0.18, ANNEX_D - 0.18), new THREE.MeshStandardMaterial({ map: floorTexture, roughness: 0.8, metalness: 0.25 }))
  top.rotation.x = -Math.PI / 2
  top.position.y = 0.012
  annex.add(top)
  const edge = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(ANNEX_W + 0.04, 0.34, ANNEX_D + 0.04)),
    new THREE.LineBasicMaterial({ color: 0x8fd4ff, transparent: true, opacity: 0.75 }),
  )
  annex.add(edge)

  // 玻璃外墙（正面留空）
  box(ANNEX_W, 2.35, 0.05, glass, 0, 1.18, -ANNEX_D / 2 + 0.08)
  box(0.05, 2.35, ANNEX_D, glass, -ANNEX_W / 2 + 0.08, 1.18, 0)
  box(0.05, 2.35, ANNEX_D, glass, ANNEX_W / 2 - 0.08, 1.18, 0)
  for (const [x, z] of [[-ANNEX_W / 2 + 0.08, -ANNEX_D / 2 + 0.08], [ANNEX_W / 2 - 0.08, -ANNEX_D / 2 + 0.08], [-ANNEX_W / 2 + 0.08, ANNEX_D / 2 - 0.08], [ANNEX_W / 2 - 0.08, ANNEX_D / 2 - 0.08]]) {
    box(0.09, 2.45, 0.09, dark, x, 1.22, z)
  }
  box(ANNEX_W, 0.06, 0.06, metal, 0, 2.38, -ANNEX_D / 2 + 0.08)
  box(0.06, 0.06, ANNEX_D, metal, -ANNEX_W / 2 + 0.08, 2.38, 0)
  box(0.06, 0.06, ANNEX_D, metal, ANNEX_W / 2 - 0.08, 2.38, 0)
  box(ANNEX_W - 1.0, 0.025, 0.02, cyan, 0, 2.31, -ANNEX_D / 2 + 0.16)

  // 教室布局：讲台在后墙，三张工位面朝讲台
  // 1) 通用工位
  const frosted = new THREE.MeshStandardMaterial({ color: 0xdcefff, transparent: true, opacity: 0.16, roughness: 0.86, metalness: 0.02, depthWrite: false, side: THREE.DoubleSide })
  function addFrostedHeader(parent, x = 0, width = 1.28, y = 1.16, z = -0.38) {
    box(width, 0.42, 0.035, frosted, x, y, z, parent)
    box(width, 0.025, 0.05, metal, x, y + 0.23, z, parent)
    box(width, 0.025, 0.05, metal, x, y - 0.23, z, parent)
  }
  function addDesk(x, z, matTop = wood) {
    const g = new THREE.Group()
    g.position.set(x, 0, z)
    box(1.16, 0.055, 0.62, matTop, 0, 0.72, 0, g)
    for (const [lx, lz] of [[-0.5, -0.24], [0.5, -0.24], [-0.5, 0.24], [0.5, 0.24]]) {
      box(0.055, 0.7, 0.055, dark, lx, 0.36, lz, g)
    }
    box(0.62, 0.4, 0.045, dark, 0, 0.95, -0.18, g)
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.54, 0.3), cyan)
    screen.position.set(0, 0.95, -0.155)
    g.add(screen)
    box(0.5, 0.055, 0.06, warm, 0, 0.76, 0.3, g)
    // 椅子（面向讲台 -z）
    box(0.42, 0.06, 0.4, dark, 0, 0.45, 0.55, g)
    box(0.42, 0.5, 0.06, dark, 0, 0.7, 0.75, g)
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.42, 8), metal)
    stem.position.set(0, 0.22, 0.55)
    g.add(stem)
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.23, 0.23, 0.03, 16), dark)
    base.position.set(0, 0.02, 0.55)
    g.add(base)
    annex.add(g)
    addFrostedHeader(g)
    return g
  }
  addDesk(-2.35, 0.85)

  // 2) 备考隔间：同一排的学习桌 + 透明磨砂隐私隔板
  const studyDesk = addDesk(0, 0.85)
  // 两侧磨砂挡板，形成半包围学习位
  box(0.035, 1.15, 1.15, frosted, -0.72, 0.85, 0.12, studyDesk)
  box(0.035, 1.15, 1.15, frosted, 0.72, 0.85, 0.12, studyDesk)

  // 备考倒计时闹钟
  const clockCanvas = document.createElement('canvas')
  clockCanvas.width = clockCanvas.height = 512
  const clockCtx = clockCanvas.getContext('2d')
  const clockTexture = new THREE.CanvasTexture(clockCanvas)
  clockTexture.colorSpace = THREE.SRGBColorSpace
  const clockSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: clockTexture, transparent: true, depthWrite: false, toneMapped: false }))
  clockSprite.position.set(0, 2.45, 0.85)
  clockSprite.scale.set(0.98, 0.98, 1)
  annex.add(clockSprite)
  studyClock = {
    sprite: clockSprite,
    ctx: clockCtx,
    texture: clockTexture,
    endAt: Date.now() + 25 * 60 * 1000,
    lastSecond: -1,
    alarmAt: 0,
  }
  drawStudyClock(25 * 60, false)
  box(0.035, 0.025, 1.15, metal, -0.72, 1.51, 0.12, studyDesk)
  box(0.035, 0.025, 1.15, metal, 0.72, 1.51, 0.12, studyDesk)

  // 3) 题库工位：科幻桌面 + 浮动 OCR / 数据库 / 试卷投影
  const sci = new THREE.Group()
  sci.position.set(2.35, 0, 0.85)
  box(1.16, 0.07, 0.62, metal, 0, 0.72, 0, sci)
  for (const [lx, lz] of [[-0.5, -0.24], [0.5, -0.24], [-0.5, 0.24], [0.5, 0.24]]) {
    box(0.05, 0.7, 0.05, dark, lx, 0.36, lz, sci)
  }
  // 全息桌屏
  const holoCanvas = document.createElement('canvas')
  holoCanvas.width = 256
  holoCanvas.height = 128
  const hctx = holoCanvas.getContext('2d')
  hctx.clearRect(0, 0, 256, 128)
  hctx.strokeStyle = 'rgba(110,220,255,.7)'
  hctx.lineWidth = 2
  for (let x = 0; x <= 256; x += 24) {
    hctx.beginPath(); hctx.moveTo(x, 0); hctx.lineTo(x, 128); hctx.stroke()
  }
  for (let y = 0; y <= 128; y += 24) {
    hctx.beginPath(); hctx.moveTo(0, y); hctx.lineTo(256, y); hctx.stroke()
  }
  hctx.fillStyle = 'rgba(120,230,255,.16)'
  hctx.fillRect(16, 22, 224, 20)
  hctx.fillRect(16, 62, 150, 10)
  hctx.fillRect(16, 86, 190, 10)
  const holoTexture = new THREE.CanvasTexture(holoCanvas)
  holoTexture.colorSpace = THREE.SRGBColorSpace
  const holo = new THREE.Mesh(new THREE.PlaneGeometry(0.86, 0.42), new THREE.MeshBasicMaterial({ map: holoTexture, transparent: true, opacity: 0.55, depthWrite: false, toneMapped: false, side: THREE.DoubleSide }))
  holo.position.set(0, 1.08, -0.08)
  holo.rotation.x = -0.18
  sci.add(holo)
  box(0.5, 0.055, 0.06, cyan, 0, 0.76, 0.3, sci)
  // 椅子
  box(0.42, 0.06, 0.4, dark, 0, 0.45, 0.55, sci)
  box(0.42, 0.5, 0.06, dark, 0, 0.7, 0.75, sci)
  const sciStem = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.42, 8), metal)
  sciStem.position.set(0, 0.22, 0.55)
  sci.add(sciStem)
  const sciBase = new THREE.Mesh(new THREE.CylinderGeometry(0.23, 0.23, 0.03, 16), dark)
  sciBase.position.set(0, 0.02, 0.55)
  sci.add(sciBase)
  annex.add(sci)
  addFrostedHeader(sci)
  const halo = new THREE.Mesh(
    new THREE.RingGeometry(0.4, 0.44, 48),
    new THREE.MeshBasicMaterial({ color: 0x6fdcff, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }),
  )
  halo.rotation.x = -Math.PI / 2
  halo.position.set(2.35, 1.58, 0.98)
  annex.add(halo)

  // 浮动图标：OCR 相机 / 数据库 / 试卷（billboard，远看也清楚）
  const iconCanvas = (draw) => {
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 160
    const ctx = canvas.getContext('2d')
    ctx.clearRect(0, 0, 160, 160)
    ctx.strokeStyle = '#9fe7ff'
    ctx.fillStyle = '#9fe7ff'
    ctx.lineWidth = 7
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.shadowColor = 'rgba(80,200,255,.9)'
    ctx.shadowBlur = 10
    draw(ctx)
    const texture = new THREE.CanvasTexture(canvas)
    texture.colorSpace = THREE.SRGBColorSpace
    return texture
  }
  const iconSprite = (texture, x, y, z, scale = 0.4) => {
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false, toneMapped: false }))
    sprite.scale.set(scale, scale, 1)
    sprite.position.set(2.35 + x, y, 0.85 + z)
    sprite.material.opacity = 0
    annex.add(sprite)
    sprite.userData.baseY = y
    sprite.userData.baseScale = scale
    sprite.userData.phase = sciFiIcons.length * 0.9
    sciFiIcons.push(sprite)
    return sprite
  }

  const ocrTexture = iconCanvas(ctx => {
    ctx.beginPath(); ctx.roundRect(32, 44, 78, 58, 10); ctx.stroke()
    ctx.beginPath(); ctx.arc(73, 73, 17, 0, Math.PI * 2); ctx.stroke()
    ctx.beginPath(); ctx.arc(73, 73, 6, 0, Math.PI * 2); ctx.fill()
    ctx.fillRect(42, 34, 22, 10)
    ctx.font = '700 15px ui-monospace, Menlo, monospace'
    ctx.textAlign = 'center'
  })
  const dbTexture = iconCanvas(ctx => {
    for (let i = 0; i < 3; i++) {
      const y = 48 + i * 24
      ctx.beginPath(); ctx.ellipse(80, y, 28, 9, 0, 0, Math.PI * 2); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(52, y); ctx.lineTo(52, y + 22); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(108, y); ctx.lineTo(108, y + 22); ctx.stroke()
      ctx.beginPath(); ctx.ellipse(80, y + 22, 28, 9, 0, 0, Math.PI * 2); ctx.stroke()
    }
    ctx.font = '700 15px ui-monospace, Menlo, monospace'
    ctx.textAlign = 'center'
  })
  const paperTexture = iconCanvas(ctx => {
    ctx.beginPath(); ctx.roundRect(46, 28, 68, 92, 5); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(98, 28); ctx.lineTo(114, 44); ctx.lineTo(98, 44); ctx.closePath(); ctx.stroke()
    for (let i = 0; i < 5; i++) {
      ctx.beginPath(); ctx.moveTo(60, 54 + i * 13); ctx.lineTo(100, 54 + i * 13); ctx.stroke()
    }
    ctx.font = '700 15px ui-monospace, Menlo, monospace'
    ctx.textAlign = 'center'
  })

  iconSprite(ocrTexture, 0, 2.12, 0.12, 0.95)
  iconSprite(dbTexture, 0, 2.12, 0.12, 0.95)
  iconSprite(paperTexture, 0, 2.12, 0.12, 0.95)

  // 讲台（教室最前面，背靠后墙，面向三张工位）
  const podium = new THREE.Group()
  podium.position.set(0, 0, -1.95)
  box(1.35, 0.14, 0.95, dark, 0, 0.07, 0, podium)
  const lectern = box(0.7, 0.98, 0.5, wood, 0, 0.56, 0, podium)
  lectern.rotation.x = -0.04
  const topPlate = box(0.86, 0.06, 0.58, metal, 0, 1.08, 0, podium)
  topPlate.rotation.x = -0.16
  const panel = new THREE.Mesh(new THREE.PlaneGeometry(0.46, 0.26), cyan)
  panel.position.set(0, 0.64, 0.256)
  podium.add(panel)
  const mic = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.36, 6), metal)
  mic.position.set(0.2, 1.22, 0.02)
  mic.rotation.z = -0.22
  podium.add(mic)
  const micHead = new THREE.Mesh(new THREE.SphereGeometry(0.04, 10, 10), cyan)
  micHead.position.set(0.24, 1.4, 0.02)
  podium.add(micHead)
  annex.add(podium)
  // 讲台后的黑板/示教板
  box(3.3, 1.25, 0.04, dark, 0, 1.55, -2.86)
  box(3.1, 0.03, 0.05, cyan, 0, 2.18, -2.83)

  // 讲台 + 三席的猫咪图片
  const addAnnexCat = (x, y, z, tint, scale = 0.48, shadowY = null) => {
    const material = new THREE.SpriteMaterial({ map: faceTextures.happy, color: tint, transparent: true, depthWrite: false, toneMapped: false })
    const sprite = new THREE.Sprite(material)
    sprite.scale.set(scale, scale, 1)
    sprite.position.set(x, y, z)
    annex.add(sprite)
    annexCats.push({ sprite, baseY: y, phase: annexCats.length * 1.3 })
    if (shadowY !== null) {
      const shadow = new THREE.Mesh(new THREE.PlaneGeometry(scale * 1.5, scale * 1.15), new THREE.MeshBasicMaterial({ map: shadowTexture, transparent: true, opacity: 0.34, depthWrite: false }))
      shadow.rotation.x = -Math.PI / 2
      shadow.position.set(x, shadowY, z)
      annex.add(shadow)
    }
  }
  addAnnexCat(-2.35, 0.74, 1.28, 0x7fa8ff, 0.46, 0.56)
  addAnnexCat(0, 0.74, 1.28, 0xff6347, 0.46, 0.56)
  addAnnexCat(2.35, 0.74, 1.28, 0x5ee7ff, 0.46, 0.56)
  addAnnexCat(0, 1.5, -1.85, 0xffffff, 0.6, null)

  // Annex 上方 Catora 招牌
  const annexSignCanvas = document.createElement('canvas')
  annexSignCanvas.width = 640
  annexSignCanvas.height = 160
  const actx = annexSignCanvas.getContext('2d')
  actx.clearRect(0, 0, 640, 160)
  actx.font = '900 76px Inter, "PingFang SC", system-ui, sans-serif'
  actx.textAlign = 'center'
  actx.textBaseline = 'middle'
  actx.shadowColor = 'rgba(90,190,255,.85)'
  actx.shadowBlur = 32
  actx.fillStyle = '#e9f6ff'
  actx.fillText('CATORA', 320, 80)
  const annexSignTexture = new THREE.CanvasTexture(annexSignCanvas)
  annexSignTexture.colorSpace = THREE.SRGBColorSpace
  const annexSign = new THREE.Sprite(new THREE.SpriteMaterial({ map: annexSignTexture, transparent: true, depthWrite: false, toneMapped: false }))
  annexSign.scale.set(2.8, 0.7, 1)
  annexSign.position.set(0, 3.35, -0.9)
  annex.add(annexSign)

  // 室内灯
  const lightWarm = new THREE.PointLight(0xffd8b0, 2.6, 11, 2)
  lightWarm.position.set(0, 2.15, 0.4)
  annex.add(lightWarm)
  annexLights.push({ light: lightWarm, night: 2.6, day: 1.1 })
  const lightCool = new THREE.PointLight(0x8fc8ff, 1.8, 10, 2)
  lightCool.position.set(0, 2.3, -1.8)
  annex.add(lightCool)
  annexLights.push({ light: lightCool, night: 1.8, day: 0.8 })

  // MCP 虚线 + 流光 + 暂未接通标牌
  mcpGroup = new THREE.Group()
  scene.add(mcpGroup)
  mcpCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(4.55, 2.55, 0.35),
    new THREE.Vector3(5.15, 3.35, 0.55),
    new THREE.Vector3(5.8, 3.05, 0.8),
    new THREE.Vector3(6.58, 2.3, 1.14),
  ])
  const pts = mcpCurve.getPoints(90)
  const cableGeo = new THREE.BufferGeometry().setFromPoints(pts)
  const cable = new THREE.Line(cableGeo, new THREE.LineDashedMaterial({
    color: 0x2f7fff, dashSize: 0.2, gapSize: 0.16, transparent: true, opacity: 0.9,
  }))
  cable.computeLineDistances()
  mcpGroup.add(cable)

  // 沿曲线流动的短划，形成可见的“流光”
  const dashGeo = new THREE.BoxGeometry(0.18, 0.05, 0.05)
  const dashMat = new THREE.MeshBasicMaterial({ color: 0x2f7fff, transparent: true, opacity: 0.95, depthWrite: false, toneMapped: false })
  for (let i = 0; i < 8; i++) {
    const dash = new THREE.Mesh(dashGeo, dashMat)
    mcpGroup.add(dash)
    mcpDashes.push({ mesh: dash, phase: i / 8 })
  }

  const beadGeo = new THREE.SphereGeometry(0.042, 8, 8)
  const beadMat = new THREE.MeshBasicMaterial({ color: 0x66b8ff, transparent: true, opacity: 0.95, depthWrite: false, toneMapped: false })
  for (let i = 0; i < 9; i++) {
    const bead = new THREE.Mesh(beadGeo, beadMat)
    mcpGroup.add(bead)
    mcpBeads.push({ mesh: bead, phase: i / 9 })
  }

  const signCanvas = document.createElement('canvas')
  signCanvas.width = 512
  signCanvas.height = 160
  const sctx = signCanvas.getContext('2d')
  sctx.clearRect(0, 0, 512, 160)
  sctx.shadowColor = 'rgba(64,170,255,.95)'
  sctx.shadowBlur = 22
  sctx.strokeStyle = '#62c8ff'
  sctx.lineWidth = 10
  sctx.lineCap = 'round'
  const drawX = (cx, cy, size) => {
    sctx.beginPath(); sctx.moveTo(cx - size, cy - size); sctx.lineTo(cx + size, cy + size); sctx.stroke()
    sctx.beginPath(); sctx.moveTo(cx + size, cy - size); sctx.lineTo(cx - size, cy + size); sctx.stroke()
  }
  drawX(82, 78, 13)
  drawX(430, 78, 13)
  sctx.fillStyle = '#e2f5ff'
  sctx.textAlign = 'center'
  sctx.textBaseline = 'middle'
  sctx.font = '700 52px ui-monospace, Menlo, monospace'
  sctx.fillText('MCP', 256, 84)
  const signTex = new THREE.CanvasTexture(signCanvas)
  signTex.colorSpace = THREE.SRGBColorSpace
  mcpSign = new THREE.Sprite(new THREE.SpriteMaterial({ map: signTex, transparent: true, depthWrite: false, depthTest: true, toneMapped: false }))
  mcpSign.position.set(5.55, 3.62, 1.02)
  mcpSign.scale.set(1.85, 0.58, 1)
  mcpSign.visible = true
  mcpGroup.add(mcpSign)

  const signGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture, color: 0x3f9dff, transparent: true, opacity: 0.24, blending: THREE.AdditiveBlending, depthWrite: false }))
  signGlow.position.copy(mcpSign.position)
  signGlow.scale.set(2.0, 0.62, 1)
  signGlow.visible = true
  mcpGroup.add(signGlow)


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
  if (annex) annex.visible = true
  if (mcpGroup) mcpGroup.visible = true
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
  updateWeatherFrame(t)
  if (t - (drawAdOverlay.last || 0) > 0.09) {
    drawAdOverlay.last = t
    for (const ad of animatedAdScreens) drawAdOverlay(ad, t)
  }
  if (mcpCurve && mcpBeads.length > 0) {
    const flow = clock.getElapsedTime()
    for (const bead of mcpBeads) {
      const p = mcpCurve.getPointAt((flow * 0.11 + bead.phase) % 1)
      bead.mesh.position.copy(p)
      bead.mesh.scale.setScalar(0.75 + 0.35 * Math.sin(flow * 5 + bead.phase * 18))
    }
    const axis = new THREE.Vector3(1, 0, 0)
    const point = new THREE.Vector3()
    const tangent = new THREE.Vector3()
    for (const dash of mcpDashes) {
      const t = (flow * 0.075 + dash.phase) % 1
      mcpCurve.getPointAt(t, point)
      mcpCurve.getTangentAt(t, tangent)
      dash.mesh.position.copy(point)
      dash.mesh.quaternion.setFromUnitVectors(axis, tangent.normalize())
    }
    if (mcpSign) mcpSign.position.y = 3.62 + Math.sin(flow * 0.9) * 0.02
    if (studyClock) {
      const now = Date.now()
      if (now >= studyClock.endAt) {
        if (!studyClock.alarmAt) studyClock.alarmAt = now
        if (now - studyClock.alarmAt > 8000) {
          studyClock.endAt = now + 25 * 60 * 1000
          studyClock.alarmAt = 0
        }
      }
      const remainMs = Math.max(0, studyClock.endAt - now)
      const remainSec = Math.ceil(remainMs / 1000)
      if (remainSec !== studyClock.lastSecond) {
        studyClock.lastSecond = remainSec
        drawStudyClock(remainSec, remainMs === 0)
      }
      studyClock.sprite.position.y = 2.45 + Math.sin(flow * 1.1) * 0.03
    }

    for (const cat of annexCats) {
      cat.sprite.position.y = cat.baseY + Math.sin(flow * 1.7 + cat.phase) * 0.065
    }

    // 三个图标轮流展示：一次只亮一个，淡入淡出
    const iconCycle = 2.4
    const activeIcon = Math.floor(flow / iconCycle) % Math.max(1, sciFiIcons.length)
    for (let i = 0; i < sciFiIcons.length; i++) {
      const icon = sciFiIcons[i]
      const on = i === activeIcon
      icon.material.opacity += ((on ? 1 : 0) - icon.material.opacity) * 0.14
      const targetScale = icon.userData.baseScale * (on ? 1.12 : 0.86)
      icon.scale.x += (targetScale - icon.scale.x) * 0.14
      icon.scale.y += (targetScale - icon.scale.y) * 0.14
      icon.position.y = icon.userData.baseY + Math.sin(flow * 2.2 + icon.userData.phase) * 0.04 + (on ? 0.04 : 0)
    }
  }

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
    const nowMs = Date.now()
    if (working) {
      if (!entry.workingSince) entry.workingSince = nowMs
    } else {
      entry.workingSince = 0
    }
    const overloaded = working && entry.workingSince > 0 && nowMs - entry.workingSince > LOAD_WARN_MS
    const amp = working ? 0.09 : 0.055
    const bob = reduceMotion ? 0 : (parts.motion.bob * 2 - 1) * amp
    parts.face.position.y = parts.baseY + bob
    if (parts.seatShadow) {
      parts.seatShadow.material.opacity = Math.max(0.08, 0.46 - bob * 2.4)
      const sk = 1 - bob * 0.7
      parts.seatShadow.scale.set(sk, sk, 1)
    }

    // 表情只随状态切换；有自定义猫咪图片时优先使用
    const expr = overloaded ? 'dizzy' : (FACE_FOR_STATUS[status] ?? 'default')
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
      parts.faceMat.color.copy(parts.tint).lerp(OVERLOAD_COLOR, overloaded ? 0.55 : 0)
    }

    // 正常工作：汗滴；长时间工作：红温乱线
    const sweaty = working && !overloaded
    for (const drop of parts.sweat) {
      drop.sprite.visible = sweaty
      if (!sweaty) continue
      const p = (t * 0.55 + drop.phase) % 1
      drop.sprite.position.set(drop.x + Math.sin(t * 2 + drop.phase * 8) * drop.drift, parts.baseY + 0.26 - p * 0.34, 0.12)
      drop.sprite.material.opacity = Math.sin(p * Math.PI) * 0.92
      drop.sprite.scale.set(0.085 + p * 0.03, 0.13 + p * 0.05, 1)
    }
    parts.scribble.visible = overloaded
    parts.scribbleGlow.visible = overloaded
    if (overloaded) {
      const jitter = Math.sin(t * 17 + phase) * 0.012
      parts.scribble.position.set(jitter, parts.baseY + 1.55 + Math.sin(t * 3.2 + phase) * 0.03, 0.04)
      parts.scribble.rotation = Math.sin(t * 6 + phase) * 0.08
      parts.scribble.material.opacity = 0.96
      parts.scribbleGlow.position.copy(parts.scribble.position)
      parts.scribbleGlow.position.z = 0.02
      parts.scribbleGlow.material.opacity = 0.26 + Math.sin(t * 8 + phase) * 0.08
    }

    // 呼吸/浮动
    const breathe = sleeping ? 1 + Math.sin(t * 1.5 + phase) * 0.02 : 1 + Math.sin(t * 2.2 + phase) * 0.012
    parts.face.scale.set(0.6 * breathe, 0.6 * breathe, 1)

    const statusColor = overloaded ? '#ff5a5a' : (STATUS[status]?.color ?? STATUS.resting.color)
    parts.ring.material.color.set(statusColor)
    parts.glow.material.color.set(statusColor)
    parts.ring.rotation.z = status === 'stuck' ? t * 2.6 : 0
    const ringPulse = overloaded ? 1 + Math.sin(t * 6.5 + phase) * 0.12
      : working ? 1 + Math.sin(t * 3.4 + phase) * 0.08
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
    parts.glow.material.opacity = overloaded ? 0.38 + Math.sin(t * 6.5 + phase) * 0.08
      : working ? 0.34 + Math.sin(t * 3.4 + phase) * 0.1
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
    const response = await fetch('/agent-office/api/balance', { cache: 'no-store' })
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

function finishIntro() {
  if (introTl) {
    introTl.kill()
    introTl = null
  }
  for (const floor of floors) {
    floor.group.scale.set(1, 1, 1)
    floor.group.position.y = floor.offset.y
  }
  if (annex) {
    annex.visible = true
    annex.scale.setScalar(0.84)
    annex.position.y = 0
  }
  if (mcpGroup) {
    mcpGroup.visible = true
    mcpGroup.scale.set(1, 1, 1)
  }
  city.scale.y = 1
  for (const tower of cityTowerGroups) tower.group.scale.y = 1
  for (const billboard of cityBillboards) billboard.visible = true
  for (const material of cityNeonMats) material.opacity = 0.85
  const pose = globalPose(floors.length)
  controls.target.copy(pose.target)
  camera.position.copy(pose.position)
  controls.update()
  document.body.classList.remove('intro')
  const intro = $('#intro')
  if (intro) {
    intro.classList.add('done')
    setTimeout(() => intro.remove(), 650)
  }
  introPlayed = true
}

function playIntro() {
  if (introPlayed) return
  const intro = $('#intro')
  if (!intro) return
  introPlayed = true
  intro.addEventListener('click', () => finishIntro(), { once: true })
  if (reduceMotion) {
    finishIntro()
    return
  }
  if (annex) {
    annex.visible = true
    annex.scale.setScalar(0.02)
    annex.position.y = -2.4
  }
  if (mcpGroup) {
    mcpGroup.visible = true
    mcpGroup.scale.setScalar(0.01)
  }
  for (const floor of floors) {
    floor.group.scale.set(0.02, 0.02, 0.02)
    floor.group.position.y = floor.offset.y - 5.5
  }
  const pose = globalPose(floors.length)
  camera.position.set(pose.position.x + 26, pose.position.y + 15, pose.position.z + 26)
  controls.target.copy(pose.target)
  controls.update()
  for (const billboard of cityBillboards) billboard.visible = false
  for (const material of cityNeonMats) material.opacity = 0
  city.scale.y = 0.001

  introTl = gsap.timeline()
  introTl.to({ value: 0 }, { value: 1, duration: 2.4, ease: 'none' }, 0)
  introTl.to(camera.position, { x: pose.position.x, y: pose.position.y, z: pose.position.z, duration: 3.6, ease: 'power2.inOut' }, 0.15)
  introTl.to(controls.target, { x: pose.target.x, y: pose.target.y, z: pose.target.z, duration: 3.6, ease: 'power2.inOut' }, 0.15)
  floors.forEach((floor, i) => {
    introTl.to(floor.group.scale, { x: 1, y: 1, z: 1, duration: 0.85, ease: 'back.out(1.35)' }, 0.25 + i * 0.3)
    introTl.to(floor.group.position, { y: floor.offset.y, duration: 0.85, ease: 'power2.out' }, 0.25 + i * 0.3)
  })
  introTl.to(city.scale, { y: 1, duration: 1.35, ease: 'power3.out' }, 0.15)
  if (annex) {
    introTl.to(annex.scale, { x: 0.84, y: 0.84, z: 0.84, duration: 0.95, ease: 'back.out(1.25)' }, 1.05)
    introTl.to(annex.position, { y: 0, duration: 0.95, ease: 'power2.out' }, 1.05)
  }
  if (mcpGroup) introTl.to(mcpGroup.scale, { x: 1, y: 1, z: 1, duration: 0.8, ease: 'power2.out' }, 1.45)
  introTl.call(() => document.body.classList.remove('intro'), null, 3.45)
  introTl.to(intro, { opacity: 0, duration: 0.5, onComplete: () => intro.remove() }, 3.5)
  setTimeout(() => { if (document.body.classList.contains('intro')) finishIntro() }, 6000)
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
      if (!introPlayed) playIntro()
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
  setWeather,
  finishIntro,
}
rebuild([])
$('#offline').classList.add('show')
$('#offline').textContent = '正在读取本机会话…'
buildAnnex()
loadCustomFace()
refreshWeather()
poll()
setInterval(poll, 2000)
refreshBalance()
setInterval(refreshBalance, 60_000)
tick()
/* 浏览器缩放时，把 HUD 重新贴到可视区域，避免左右被裁 */
function fitHudToViewport() {
  const vv = window.visualViewport
  const visual = vv && (Math.abs((vv.scale || 1) - 1) > 0.02 || vv.width < window.innerWidth - 2)
  const top = document.querySelector('#top')
  const left = document.querySelector('#left')
  const right = document.querySelector('#right')
  const feed = document.querySelector('#feed')
  if (!top || !left || !right || !feed) return
  const centered = [document.querySelector('#focusChip'), document.querySelector('#hint'), document.querySelector('#offline')].filter(Boolean)
  const centerInViewport = () => {
    const v = window.visualViewport
    const width = v ? v.width : window.innerWidth
    const offset = v ? v.offsetLeft : 0
    for (const el of centered) {
      el.style.left = `${offset + width / 2}px`
      el.style.right = 'auto'
      el.style.transform = 'translateX(-50%)'
    }
  }
  centerInViewport()
  if (!visual) {
    for (const el of [top, left, right, feed]) {
      el.style.removeProperty('left')
      el.style.removeProperty('right')
      el.style.removeProperty('width')
      el.style.removeProperty('top')
      el.style.removeProperty('bottom')
      el.style.removeProperty('max-height')
    }
    return
  }
  const vw = vv.width
  const margin = 12
  const leftWidth = left.getBoundingClientRect().width
  const rightWidth = right.getBoundingClientRect().width
  const gap = 12
  const vh = vv.height
  const oy = vv.offsetTop || 0
  const hs = Number.parseFloat(getComputedStyle(left).zoom) || 1
  top.style.left = `${margin / hs}px`
  top.style.right = 'auto'
  top.style.width = `${(vw - margin * 2) / hs}px`
  top.style.top = `${(oy + 12) / hs}px`
  left.style.left = `${margin / hs}px`
  left.style.top = `${(oy + 70) / hs}px`
  left.style.maxHeight = `${Math.max(180, vh - 84) / hs}px`
  right.style.left = `${(vw - margin - rightWidth) / hs}px`
  right.style.right = 'auto'
  right.style.top = `${(oy + 70) / hs}px`
  right.style.bottom = 'auto'
  right.style.maxHeight = `${Math.max(180, vh - 84) / hs}px`
  feed.style.left = `${(margin + leftWidth + gap) / hs}px`
  feed.style.right = 'auto'
  feed.style.width = `${Math.max(160, vw - margin * 2 - leftWidth - rightWidth - gap * 2) / hs}px`
  feed.style.top = `${Math.max(oy + 120, oy + vh - feed.offsetHeight - 12) / hs}px`
  feed.style.bottom = 'auto'
}
function resetPageScroll() {
  try {
    window.scrollTo(0, 0)
    document.documentElement.scrollTop = 0
    document.documentElement.scrollLeft = 0
    document.body.scrollTop = 0
    document.body.scrollLeft = 0
  } catch {}
}
window.addEventListener('resize', () => { resetPageScroll(); fitHudToViewport() })
window.addEventListener('orientationchange', () => { resetPageScroll(); fitHudToViewport() })
window.visualViewport?.addEventListener('resize', fitHudToViewport)
window.visualViewport?.addEventListener('scroll', fitHudToViewport)
resetPageScroll()
fitHudToViewport()
setTimeout(() => { resetPageScroll(); fitHudToViewport() }, 50)
setTimeout(() => { resetPageScroll(); fitHudToViewport() }, 500)
setTimeout(() => $('#hint').classList.add('hide'), 9000)
setTimeout(() => { if (!introPlayed) finishIntro() }, 9000)
