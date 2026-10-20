import type { communityTimeline } from '@web/modules/landing/community-freshness'
import { money, type SampleDeal } from '@web/modules/landing/deals'
import * as T from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'

// One world space: +Z is the shop front; camera sees the front and left side.
export function createHawker(canvas: HTMLCanvasElement, deal: SampleDeal, area: string) {
  const renderer = new T.WebGLRenderer({
    canvas,
    alpha: true,
    antialias: true,
    powerPreference: 'low-power',
  })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5))
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = T.PCFSoftShadowMap
  renderer.outputColorSpace = T.SRGBColorSpace
  renderer.toneMapping = T.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.05
  const scene = new T.Scene()
  const camera = new T.OrthographicCamera(-4.8, 4.8, 4.55, -4.55, 0.1, 60)
  camera.position.set(-8, 6.3, 13)
  camera.lookAt(0, 2.15, 0)
  scene.add(new T.HemisphereLight('#fff7dc', '#a19c72', 2.5))
  const sun = new T.DirectionalLight('#ffe5ad', 2.4)
  sun.position.set(-3, 9, 7)
  sun.castShadow = true
  sun.shadow.mapSize.set(1024, 1024)
  Object.assign(sun.shadow.camera, { left: -6, right: 6, top: 7, bottom: -5, near: 0.1, far: 30 })
  sun.shadow.normalBias = 0.035
  sun.shadow.bias = -0.0004
  sun.shadow.radius = 4
  scene.add(sun)
  const fill = new T.DirectionalLight('#fff9e6', 1.3)
  fill.position.set(5, 4, -2)
  scene.add(fill)
  const mats = new Map<string, T.MeshStandardMaterial>()
  const geometries = new Map<string, T.BufferGeometry>()
  const textures: T.Texture[] = []
  const material = (color: string) => {
    let m = mats.get(color)
    if (!m) {
      m = new T.MeshStandardMaterial({ color, roughness: 0.87 })
      mats.set(color, m)
    }
    return m
  }
  const groups = Object.fromEntries(
    ['base', 'counter', 'walls', 'awning', 'sign', 'food', 'decor'].map((k) => {
      const g = new T.Group()
      scene.add(g)
      return [k, g]
    }),
  ) as Record<'base' | 'counter' | 'walls' | 'awning' | 'sign' | 'food' | 'decor', T.Group>
  const mesh = (
    parent: T.Object3D,
    geometry: T.BufferGeometry,
    color: string | T.Material,
    x: number,
    y: number,
    z: number,
  ) => {
    const m = new T.Mesh(geometry, typeof color === 'string' ? material(color) : color)
    m.position.set(x, y, z)
    m.castShadow = true
    m.receiveShadow = true
    parent.add(m)
    return m
  }
  const box = (
    p: T.Object3D,
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    d: number,
    c: string,
    r = 0.04,
  ) => {
    const key = `${w}/${h}/${d}/${r}`
    if (!geometries.has(key)) geometries.set(key, new RoundedBoxGeometry(w, h, d, 2, r))
    return mesh(p, geometries.get(key) as T.BufferGeometry, c, x, y, z)
  }
  const sphere = (
    p: T.Object3D,
    x: number,
    y: number,
    z: number,
    sx: number,
    sy: number,
    sz: number,
    c: string,
  ) => {
    if (!geometries.has('sphere')) geometries.set('sphere', new T.SphereGeometry(1, 16, 12))
    const m = mesh(p, geometries.get('sphere') as T.BufferGeometry, c, x, y, z)
    m.scale.set(sx, sy, sz)
    return m
  }
  const cylinder = (
    p: T.Object3D,
    x: number,
    y: number,
    z: number,
    rt: number,
    rb: number,
    h: number,
    c: string,
  ) => mesh(p, new T.CylinderGeometry(rt, rb, h, 20), c, x, y, z)
  const rod = (p: T.Object3D, a: number[], b: number[], r: number, c: string) => {
    const start = new T.Vector3(...a),
      end = new T.Vector3(...b),
      delta = end.clone().sub(start)
    const m = cylinder(p, 0, 0, 0, r, r, delta.length(), c)
    m.position.copy(start.add(end).multiplyScalar(0.5))
    m.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), delta.normalize())
    return m
  }
  const texture = (w: number, h: number, draw: (c: CanvasRenderingContext2D) => void) => {
    const c = document.createElement('canvas')
    c.width = w
    c.height = h
    const ctx = c.getContext('2d')
    if (!ctx) throw new Error('Canvas texture unavailable')
    draw(ctx)
    const t = new T.CanvasTexture(c)
    t.colorSpace = T.SRGBColorSpace
    t.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy())
    textures.push(t)
    return t
  }
  const plaque = (
    p: T.Object3D,
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    text: string,
    bg = '#fff2cf',
    fg = '#795034',
    font = 64,
  ) => {
    const map = texture(1024, 256, (c) => {
      c.fillStyle = bg
      c.fillRect(0, 0, 1024, 256)
      c.fillStyle = fg
      c.textAlign = 'center'
      c.textBaseline = 'middle'
      c.font = `900 ${font}px "Lobang Pop", sans-serif`
      c.fillText(text, 512, 128, 960)
    })
    const mat = new T.MeshStandardMaterial({ map, roughness: 0.9 })
    const m = mesh(p, new T.PlaneGeometry(w, h), mat, x, y, z)
    return m
  }
  const cream = '#fff0cd',
    green = '#426f3b',
    coral = '#ee6946',
    gold = '#ffc438',
    brown = '#795336'
  // Rounded tiled miniature platform and contact shadow.
  box(groups.base, 0, 0.12, 0, 7.8, 0.28, 4.8, '#e7b65f', 0.24)
  box(groups.base, 0, 0.28, 0, 7.8, 0.14, 4.8, cream, 0.22)
  box(groups.base, 0, 0.36, 0, 7.25, 0.035, 4.28, '#d9c9ac', 0.15)
  for (let x = -3.5; x < 3.6; x += 0.55)
    box(groups.base, x, 0.383, 0, 0.012, 0.008, 4.05, '#eee1c7', 0.002)
  for (let z = -2; z < 2.1; z += 0.55)
    box(groups.base, 0, 0.384, z, 7.1, 0.008, 0.012, '#eee1c7', 0.002)
  const shadowTex = texture(128, 128, (c) => {
    const g = c.createRadialGradient(64, 64, 5, 64, 64, 64)
    g.addColorStop(0, '#73512955')
    g.addColorStop(1, '#73512900')
    c.fillStyle = g
    c.fillRect(0, 0, 128, 128)
  })
  const shadow = mesh(
    groups.base,
    new T.PlaneGeometry(10, 7),
    new T.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false }),
    0,
    -0.05,
    0,
  )
  shadow.rotation.x = -Math.PI / 2
  shadow.castShadow = false
  // Physical walls, side tiles, four posts, and substantial roof cap.
  box(groups.walls, 0, 2.05, -1.1, 5.5, 3.35, 0.18, '#d9d6b2')
  box(groups.walls, -2.65, 2.05, -0.12, 0.16, 3.35, 2.15, '#e9dbbd')
  for (let y = 0.65; y < 3.7; y += 0.37) {
    box(groups.walls, 0, y, -0.995, 5.25, 0.018, 0.012, '#c3bf9c', 0.002)
    box(groups.walls, -2.746, y, -0.12, 0.012, 0.018, 2.12, '#cbbd9f', 0.002)
  }
  for (let x = -2.4; x < 2.6; x += 0.48)
    box(groups.walls, x, 2.04, -0.99, 0.012, 3.2, 0.012, '#c3bf9c', 0.002)
  for (const x of [-2.72, 2.72])
    for (const z of [-1.05, 1])
      box(groups.walls, x, z > 0 ? 1.94 : 2.12, z, 0.25, z > 0 ? 3.14 : 3.5, 0.26, green)
  box(groups.walls, 0, 3.85, -0.56, 5.9, 0.26, 1.7, '#dca83e', 0.1)
  box(groups.walls, 0, 4.01, -0.56, 6.05, 0.16, 1.8, '#f5ce86', 0.1)
  // Front counter, cream rounded top, inset trim, branding.
  box(groups.counter, 0, 1.05, 1, 5.55, 1.35, 1.02, '#bd6a36', 0.12)
  box(groups.counter, 0, 1.08, 1.54, 5.3, 1.13, 0.07, cream, 0.09)
  box(groups.counter, 0, 1.08, 1.588, 5.1, 0.95, 0.035, '#ef9d50', 0.06)
  box(groups.counter, 0, 1.77, 1.01, 5.85, 0.16, 1.24, cream, 0.08)
  plaque(groups.counter, -0.55, 1.08, 1.612, 2.8, 0.35, 'FRESH LOBANGS', '#ef9d50', '#fff0cd', 140)
  for (const x of [-2.08, 2.08]) box(groups.counter, x, 1.08, 1.62, 0.42, 0.035, 0.025, cream, 0.01)
  // Sloping fabric stripes, each with real thickness and a curved front valance.
  for (let i = 0; i < 9; i++) {
    const x = -3.05 + ((i + 0.5) * 6.1) / 9,
      c = i % 2 ? gold : coral
    const stripe = box(groups.awning, x, 3.78, 0.62, 6.1 / 9 + 0.008, 0.055, 2.35, c, 0.015)
    stripe.rotation.x = 0.16
    const shape = new T.Shape(),
      w = 6.1 / 9
    shape.moveTo(-w / 2, 0)
    shape.lineTo(w / 2, 0)
    shape.lineTo(w / 2, -0.22)
    shape.bezierCurveTo(w / 2, -0.59, -w / 2, -0.59, -w / 2, -0.22)
    shape.closePath()
    mesh(
      groups.awning,
      new T.ExtrudeGeometry(shape, {
        depth: 0.065,
        bevelEnabled: true,
        bevelSize: 0.018,
        bevelThickness: 0.018,
        bevelSegments: 2,
        steps: 1,
      }),
      c,
      x,
      3.59,
      1.76,
    )
  }
  rod(groups.awning, [-3.08, 3.98, -0.52], [3.08, 3.98, -0.52], 0.075, brown)
  // Selected deal rendered into a real illuminated board; HTML mirrors its content.
  box(groups.sign, 0, 4.52, -0.36, 5.4, 1.05, 0.24, green, 0.13)
  box(groups.sign, 0, 4.52, -0.2, 5.42, 1.05, 0.15, '#eac16e', 0.13)
  const signMap = texture(1536, 320, (c) => {
    c.fillStyle = '#fff2d1'
    c.fillRect(0, 0, 1536, 320)
    c.fillStyle = brown
    c.textBaseline = 'middle'
    c.font = '900 76px "Lobang Pop", sans-serif'
    c.fillText(deal.restaurant.toUpperCase(), 46, 92, 1130)
    c.font = '42px sans-serif'
    c.fillStyle = '#716447'
    c.fillText(`${area} · Local Favourite`, 46, 173, 1100)
    c.font = '26px sans-serif'
    c.fillText('ILLUSTRATIVE FOOD DEAL', 46, 255)
    c.fillStyle = '#d85936'
    c.font = '900 88px "Lobang Pop", sans-serif'
    c.textAlign = 'center'
    c.fillText(money(deal.price), 1340, 104, 300)
    c.fillStyle = '#897c60'
    c.font = '34px sans-serif'
    c.fillText(money(deal.original), 1340, 182)
    c.fillRect(1264, 181, 150, 2)
    c.fillStyle = '#f6d879'
    c.fillRect(1200, 218, 290, 62)
    c.fillStyle = brown
    c.font = 'bold 30px sans-serif'
    c.fillText(`SAVE ${money(deal.original - deal.price)}`, 1345, 251)
  })
  const signMat = new T.MeshStandardMaterial({
    map: signMap,
    emissive: '#fff0c5',
    emissiveMap: signMap,
    emissiveIntensity: 0.16,
    roughness: 0.9,
  })
  const billboard = mesh(groups.sign, new T.PlaneGeometry(5.16, 0.86), signMat, 0, 4.52, -0.115)
  for (const x of [-1.9, 1.9]) {
    rod(groups.sign, [x, 4.87, -0.35], [x, 5.36, -0.35], 0.04, brown)
    rod(groups.sign, [x, 5.36, -0.35], [x, 5.36, 0.07], 0.045, brown)
    box(groups.sign, x, 5.34, 0.14, 0.44, 0.1, 0.28, brown)
    const light = box(groups.sign, x, 5.282, 0.14, 0.36, 0.012, 0.23, '#ffe9aa')
    ;(light.material as T.MeshStandardMaterial) = new T.MeshStandardMaterial({
      color: '#ffe9aa',
      emissive: '#ffe2a0',
      emissiveIntensity: 1.5,
    })
  }
  // Menu board and utensils on the rear wall.
  box(groups.food, -0.93, 2.02, -0.86, 1.85, 1.65, 0.12, '#ad8755', 0.08)
  box(groups.food, -0.93, 2.02, -0.78, 1.69, 1.49, 0.04, cream, 0.06)
  plaque(groups.food, -0.93, 2.25, -0.75, 1.5, 0.3, "TODAY'S MENU", cream, brown, 120)
  for (let i = 0; i < 4; i++) {
    box(groups.food, -1.1, 2.0 - i * 0.16, -0.735, 0.9, 0.045, 0.01, '#b79969', 0.01)
    box(groups.food, -0.45, 2.0 - i * 0.16, -0.735, 0.09, 0.045, 0.01, '#b79969', 0.01)
  }
  rod(groups.food, [-2.2, 2.95, -0.78], [-1.96, 2.95, -0.78], 0.035, brown)
  for (let i = 0; i < 2; i++) {
    rod(
      groups.food,
      [-2.16 + i * 0.17, 2.92, -0.73],
      [-2.16 + i * 0.17, 2.37, -0.73],
      0.018,
      '#9d9c88',
    )
    sphere(groups.food, -2.16 + i * 0.17, 2.31, -0.73, 0.075, 0.12, 0.025, '#aaa997')
  }
  const pendant = new T.Group()
  groups.food.add(pendant)
  rod(pendant, [0.25, 3.55, 0.1], [0.25, 2.73, 0.1], 0.018, brown)
  mesh(
    pendant,
    new T.SphereGeometry(0.23, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2),
    coral,
    0.25,
    2.5,
    0.1,
  )
  cylinder(pendant, 0.25, 2.5, 0.1, 0.23, 0.23, 0.02, '#ffed9f')
  const interiorLight = new T.PointLight('#ffcc68', 0.8, 2.5)
  interiorLight.position.set(0.25, 2.45, 0.1)
  pendant.add(interiorLight)
  // Hollow ceramic bowls with a rim, countertop rice, sliced chicken and greens.
  const bowl = (p: T.Object3D, x: number, y: number, z: number, r: number) => {
    const points = [
      new T.Vector2(0, 0),
      new T.Vector2(r * 0.35, 0),
      new T.Vector2(r * 0.67, r * 0.2),
      new T.Vector2(r, r * 0.7),
      new T.Vector2(r * 0.9, r * 0.71),
      new T.Vector2(r * 0.55, r * 0.28),
      new T.Vector2(0, r * 0.17),
    ]
    mesh(p, new T.LatheGeometry(points, 24), cream, x, y, z)
  }
  const chickenDeal = /chicken/i.test(deal.restaurant)
  const meal = (x: number, y: number, z: number) => {
    bowl(groups.food, x, y, z, 0.4)
    sphere(groups.food, x, y + 0.24, z, 0.29, 0.13, 0.25, '#fff0c0')
    for (let i = 0; i < 4; i++) {
      const meat = sphere(
        groups.food,
        x - 0.14 + i * 0.095,
        y + 0.34,
        z,
        0.065,
        0.065,
        0.19,
        chickenDeal ? '#f1ca76' : '#d89452',
      )
      meat.rotation.z = 0.2
    }
    for (let i = 0; i < 3; i++)
      sphere(groups.food, x - 0.23 + i * 0.07, y + 0.33, z - 0.16, 0.06, 0.035, 0.045, '#5e943e')
  }
  meal(-0.85, 1.86, 1.17)
  // Transparent cabinet and hanging stylised chickens, all on the same worktop.
  const glass = new T.MeshStandardMaterial({
    color: '#d9ede1',
    transparent: true,
    opacity: 0.1,
    roughness: 0.5,
    depthWrite: false,
  })
  const gx = 1.7,
    gz = 0.54
  for (const x of [1.04, 2.35])
    for (const z of [0.1, 0.98]) rod(groups.food, [x, 1.86, z], [x, 3.04, z], 0.035, '#b4ae96')
  for (const y of [1.86, 3.04]) box(groups.food, gx, y, gz, 1.42, 0.065, 1.01, '#beb7a0')
  mesh(groups.food, new T.PlaneGeometry(1.29, 1.13), glass, gx, 2.45, 1.01)
  rod(groups.food, [1.08, 2.92, 0.52], [2.31, 2.92, 0.52], 0.025, '#999983')
  for (let i = 0; i < (chickenDeal ? 3 : 0); i++) {
    const x = 1.25 + i * 0.43
    rod(groups.food, [x, 2.92, 0.52], [x, 2.75, 0.52], 0.012, brown)
    sphere(groups.food, x, 2.47, 0.52, 0.16, 0.27, 0.14, '#edc674')
    for (const s of [-1, 1]) {
      const wing = sphere(groups.food, x + s * 0.14, 2.49, 0.58, 0.065, 0.16, 0.075, '#deb369')
      wing.rotation.z = s * 0.32
      sphere(groups.food, x + s * 0.07, 2.21, 0.56, 0.055, 0.12, 0.06, '#edc674')
    }
  }
  meal(1.7, 1.9, 0.57)
  // Bowl stacks, sauces and chopstick pot.
  for (let i = 0; i < 4; i++) bowl(groups.food, 0.62, 1.86 + i * 0.085, 1.2, 0.22)
  for (let i = 0; i < 3; i++)
    cylinder(groups.food, -1.9, 1.89 + i * 0.045, 0.75, 0.28, 0.28, 0.045, cream)
  cylinder(groups.food, -1.83, 2.02, 1.27, 0.14, 0.14, 0.32, '#c69a60')
  for (let i = 0; i < 9; i++)
    rod(
      groups.food,
      [-1.91 + i * 0.019, 2.05, 1.27],
      [-1.96 + i * 0.03, 2.5, 1.27 + (i % 3) * 0.03],
      0.014,
      coral,
    )
  for (const [x, c] of [
    [-0.08, '#e67539'],
    [0.23, '#63412d'],
  ] as const) {
    cylinder(groups.food, x, 2.04, 1.19, 0.09, 0.11, 0.35, c)
    cylinder(groups.food, x, 2.26, 1.19, 0.042, 0.045, 0.14, '#e68c55')
  }
  // Side sign, stools and plants frame the reference composition.
  box(groups.decor, -2.91, 2.44, 0.82, 0.13, 1.53, 0.51, '#ad8052', 0.07)
  const sideMap = texture(256, 768, (c) => {
    c.fillStyle = cream
    c.fillRect(0, 0, 256, 768)
    c.fillStyle = '#a74e30'
    c.textAlign = 'center'
    c.textBaseline = 'middle'
    c.font = 'bold 140px serif'
    for (const [i, char] of [...(chickenDeal ? '海南雞飯' : '街坊好味')].entries())
      c.fillText(char, 128, 110 + i * 180)
  })
  const sideText = mesh(
    groups.decor,
    new T.PlaneGeometry(0.45, 1.37),
    new T.MeshStandardMaterial({ map: sideMap, roughness: 0.9 }),
    -2.985,
    2.44,
    0.82,
  )
  sideText.rotation.y = -Math.PI / 2
  const stool = (x: number, z: number) => {
    box(groups.decor, x, 0.91, z, 0.6, 0.13, 0.56, coral, 0.06)
    for (const dx of [-0.21, 0.21])
      for (const dz of [-0.19, 0.19])
        box(groups.decor, x + dx, 0.63, z + dz, 0.09, 0.5, 0.09, coral, 0.025)
  }
  stool(-3.2, 1.15)
  stool(3.15, 0.9)
  const plant = (x: number, z: number, s = 1) => {
    cylinder(groups.decor, x, 0.38 + 0.2 * s, z, 0.23 * s, 0.16 * s, 0.4 * s, '#f3d9a4')
    for (let i = 0; i < 7; i++) {
      const angle = i * 2.4
      const leaf = sphere(
        groups.decor,
        x + Math.cos(angle) * 0.2 * s,
        0.8 * s + 0.25,
        z + Math.sin(angle) * 0.2 * s,
        0.14 * s,
        0.28 * s,
        0.065 * s,
        i % 2 ? '#699b48' : '#7eae51',
      )
      leaf.rotation.z = Math.cos(angle) * 0.8
      leaf.rotation.y = angle
    }
  }
  plant(-2.95, 1.87)
  plant(-1.92, -0.68, 0.55)
  const tree = (x: number, z: number) => {
    rod(groups.decor, [x, 0.4, z], [x, 1.94, z], 0.085, brown)
    rod(groups.decor, [x, 1.2, z], [x + 0.35, 1.6, z], 0.05, brown)
    for (let i = 0; i < 5; i++)
      sphere(
        groups.decor,
        x + Math.sin(i * 2) * 0.3,
        2 + Math.cos(i * 3) * 0.22,
        z + Math.cos(i) * 0.15,
        0.4,
        0.48,
        0.35,
        i % 2 ? '#91b75e' : '#82ab52',
      )
  }
  tree(3.55, 0.35)
  for (const x of [-3.15, -2.8, 2.9, 3.4])
    sphere(groups.decor, x, 0.53, -1.33, 0.29, 0.27, 0.28, '#9cba61')
  // Give every assembly its own pivot and opacity. Large structures settle in
  // place instead of scaling from the world origin and drifting across the shop.
  const sourceMaterials = new Set<T.Material>()
  const pivots = new Map<T.Group, T.Vector3>()
  const fades = new Map<T.Group, { material: T.Material; opacity: number }[]>()
  for (const g of Object.values(groups)) {
    const pivot = new T.Box3().setFromObject(g).getCenter(new T.Vector3())
    for (const child of g.children) child.position.sub(pivot)
    g.position.copy(pivot)
    pivots.set(g, pivot)
    const clones = new Map<T.Material, T.Material>()
    g.traverse((object) => {
      if (!(object instanceof T.Mesh)) return
      const clone = (original: T.Material) => {
        let owned = clones.get(original)
        if (!owned) {
          sourceMaterials.add(original)
          owned = original.clone()
          owned.transparent = true
          clones.set(original, owned)
        }
        return owned
      }
      object.material = Array.isArray(object.material)
        ? object.material.map(clone)
        : clone(object.material)
    })
    fades.set(
      g,
      [...clones.values()].map((material) => ({ material, opacity: material.opacity })),
    )
  }
  const allObjects: { object: T.Object3D; position: T.Vector3; scale: T.Vector3 }[] = []
  for (const key of ['food', 'decor'] as const)
    for (const object of groups[key].children)
      allObjects.push({ object, position: object.position.clone(), scale: object.scale.clone() })
  const render = (motion: ReturnType<typeof communityTimeline>) => {
    for (const [key, g] of Object.entries(groups)) {
      const amount = motion[key as keyof typeof motion]
      g.visible = amount > 0.001
      g.position.copy(pivots.get(g) as T.Vector3)
      g.position.y +=
        (1 - amount) * (key === 'awning' ? 1.1 : -0.65) + Math.sin(amount * Math.PI) * 0.06
      g.scale.setScalar(0.97 + amount * 0.03)
      for (const fade of fades.get(g) ?? []) fade.material.opacity = fade.opacity * amount
    }
    for (let i = 0; i < allObjects.length; i++) {
      const item = allObjects[i]
      const t = allObjects[i].object.parent === groups.food ? motion.food : motion.decor
      const stagger = Math.min(1, Math.max(0, (t - (i % 7) * 0.035) / 0.79))
      item.object.scale.copy(item.scale).multiplyScalar(Math.max(0.001, stagger))
      item.object.position.copy(item.position)
      item.object.position.y += (1 - stagger) * 0.15
    }
    ;(billboard.material as T.MeshStandardMaterial).emissiveIntensity =
      0.16 + Math.sin(motion.handoff * Math.PI) * 0.5
    renderer.render(scene, camera)
  }
  const project = (point: T.Vector3) => {
    const p = point.clone().project(camera)
    return { x: (p.x + 1) / 2, y: (1 - p.y) / 2 }
  }
  return {
    render,
    anchors: () => ({
      sign: project(new T.Vector3(0, 4.52, -0.1)),
      status: project(new T.Vector3(2.1, 1.19, 1.74)),
    }),
    resize(w: number, h: number) {
      renderer.setSize(w, h, false)
      renderLastSize(w, h)
    },
    dispose() {
      const gs = new Set<T.BufferGeometry>(),
        ms = new Set<T.Material>()
      scene.traverse((o) => {
        if (o instanceof T.Mesh) {
          gs.add(o.geometry)
          for (const m of Array.isArray(o.material) ? o.material : [o.material]) ms.add(m)
        }
      })
      for (const g of gs) g.dispose()
      for (const m of ms) m.dispose()
      for (const m of sourceMaterials) m.dispose()
      for (const t of textures) t.dispose()
      renderer.dispose()
    },
  }
  function renderLastSize(w: number, h: number) {
    const aspect = w / h
    camera.left = -4.55 * aspect
    camera.right = 4.55 * aspect
    camera.updateProjectionMatrix()
    camera.updateMatrixWorld()
  }
}
