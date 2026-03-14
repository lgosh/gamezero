import * as THREE from 'three'

function makeTexture(
  w: number, h: number,
  draw: (ctx: CanvasRenderingContext2D) => void
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  draw(canvas.getContext('2d')!)
  return new THREE.CanvasTexture(canvas)
}

/**
 * Place a billboard sign mesh on the scene.
 * Uses FrontSide — visible from +Z when rotY=0.
 * Adds a solid-color back plane so the sign isn't transparent from behind.
 */
function signMesh(
  scene: THREE.Scene,
  tex: THREE.CanvasTexture,
  x: number, y: number, z: number,
  rotY: number,
  w: number, h: number,
  backColor = 0x111111
) {
  const group = new THREE.Group()
  group.position.set(x, y, z)
  group.rotation.y = rotY

  // Front face
  const frontMat = new THREE.MeshStandardMaterial({
    map: tex,
    side: THREE.FrontSide,
    roughness: 0.3,
    metalness: 0.05,
    emissiveMap: tex,
    emissive: new THREE.Color(0xffffff),
    emissiveIntensity: 0.15,
  })
  const front = new THREE.Mesh(new THREE.PlaneGeometry(w, h), frontMat)
  group.add(front)

  // Solid back (slightly behind, facing -Z in group space)
  const backMat = new THREE.MeshStandardMaterial({ color: backColor, side: THREE.FrontSide })
  const back = new THREE.Mesh(new THREE.PlaneGeometry(w, h), backMat)
  back.position.z = -0.02
  back.rotation.y = Math.PI
  group.add(back)

  scene.add(group)
  return group
}

// ─── TBC Bank ─────────────────────────────────────────────────────────────────

export function addTBCSign(scene: THREE.Scene, x: number, y: number, z: number, rotY = 0) {
  const tex = makeTexture(512, 160, (ctx) => {
    ctx.fillStyle = '#00305e'
    ctx.fillRect(0, 0, 512, 160)

    ctx.strokeStyle = '#1a5fa8'
    ctx.lineWidth = 5
    ctx.strokeRect(6, 6, 500, 148)

    // T logo box
    const lx = 55, ly = 80, sz = 56
    ctx.strokeStyle = '#ffffff'
    ctx.lineWidth = 7
    ctx.strokeRect(lx - sz / 2, ly - sz / 2, sz, sz)
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(lx - 16, ly - 22, 32, 9)
    ctx.fillRect(lx - 6, ly - 13, 12, 34)

    ctx.fillStyle = '#ffffff'
    ctx.font = 'bold 74px Arial, sans-serif'
    ctx.textBaseline = 'middle'
    ctx.fillText('TBC', 108, 65)

    ctx.font = '26px Arial, sans-serif'
    ctx.fillStyle = '#88bbdd'
    ctx.fillText('თიბისი ბანკი', 110, 118)

    ctx.font = '22px Arial, sans-serif'
    ctx.fillStyle = '#5599cc'
    ctx.fillText('BANK', 290, 118)
  })
  signMesh(scene, tex, x, y, z, rotY, 10, 3.2, 0x00203e)
}

// ─── ავერსი Pharmacy ──────────────────────────────────────────────────────────

export function addAversiSign(scene: THREE.Scene, x: number, y: number, z: number, rotY = 0) {
  const tex = makeTexture(512, 160, (ctx) => {
    ctx.fillStyle = '#f8fff8'
    ctx.fillRect(0, 0, 512, 160)

    ctx.fillStyle = '#00853e'
    ctx.fillRect(0, 0, 512, 24)
    ctx.fillRect(0, 136, 512, 24)

    const cx = 70, cy = 80, csz = 48
    ctx.fillStyle = '#00853e'
    ctx.fillRect(cx - csz / 2, cy - csz / 6, csz, csz / 3)
    ctx.fillRect(cx - csz / 6, cy - csz / 2, csz / 3, csz)

    ctx.fillStyle = '#00853e'
    ctx.font = 'bold 64px Arial, sans-serif'
    ctx.textBaseline = 'middle'
    ctx.fillText('ავერსი', 130, 68)

    ctx.font = '24px Arial, sans-serif'
    ctx.fillStyle = '#006630'
    ctx.fillText('AVERSI PHARMACY', 130, 118)
  })
  signMesh(scene, tex, x, y, z, rotY, 9, 2.8, 0xeefaee)
}

// ─── საქართველოს ბანკი (Bank of Georgia) ────────────────────────────────────

export function addBOGSign(scene: THREE.Scene, x: number, y: number, z: number, rotY = 0) {
  const tex = makeTexture(512, 160, (ctx) => {
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, 512, 160)

    ctx.fillStyle = '#e8451a'
    ctx.fillRect(0, 0, 512, 20)

    const cx2 = 68, cy2 = 76
    ctx.fillStyle = '#e8451a'
    ctx.beginPath()
    ctx.moveTo(cx2, cy2 - 42)
    ctx.lineTo(cx2 + 38, cy2)
    ctx.lineTo(cx2, cy2 + 42)
    ctx.lineTo(cx2 - 38, cy2)
    ctx.closePath()
    ctx.fill()
    ctx.fillStyle = '#ffffff'
    ctx.font = 'bold 38px Arial, sans-serif'
    ctx.textBaseline = 'middle'
    ctx.textAlign = 'center'
    ctx.fillText('B', cx2, cy2 + 2)
    ctx.textAlign = 'left'

    ctx.fillStyle = '#e8451a'
    ctx.font = 'bold 64px Arial, sans-serif'
    ctx.fillText('BOG', 130, 65)

    ctx.font = '22px Arial, sans-serif'
    ctx.fillStyle = '#333333'
    ctx.fillText('საქართველოს ბანკი', 128, 116)
  })
  signMesh(scene, tex, x, y, z, rotY, 11, 3.2, 0xfcfcfc)
}

// ─── კარფური (Carrefour) ──────────────────────────────────────────────────────

export function addCarrefourSign(scene: THREE.Scene, x: number, y: number, z: number, rotY = 0) {
  const tex = makeTexture(512, 160, (ctx) => {
    ctx.fillStyle = '#003087'
    ctx.fillRect(0, 0, 512, 160)

    // Stylized C: left red wedge + right blue wedge meeting in middle
    ctx.fillStyle = '#e31837'
    ctx.beginPath()
    ctx.moveTo(18, 18); ctx.lineTo(82, 80); ctx.lineTo(18, 142)
    ctx.closePath()
    ctx.fill()

    ctx.fillStyle = '#0057a5'
    ctx.beginPath()
    ctx.moveTo(100, 18); ctx.lineTo(36, 80); ctx.lineTo(100, 142)
    ctx.closePath()
    ctx.fill()

    ctx.fillStyle = '#ffffff'
    ctx.font = 'bold 64px Arial, sans-serif'
    ctx.textBaseline = 'middle'
    ctx.fillText('კარფური', 120, 68)

    ctx.font = '26px Arial, sans-serif'
    ctx.fillStyle = '#aabbdd'
    ctx.fillText('CARREFOUR', 120, 120)
  })
  signMesh(scene, tex, x, y, z, rotY, 10, 3, 0x001a55)
}

// ─── Tbilisi Mall ─────────────────────────────────────────────────────────────

export function addTbilisiMallSign(scene: THREE.Scene, x: number, y: number, z: number, rotY = 0) {
  const tex = makeTexture(512, 160, (ctx) => {
    // Gradient-like background: dark charcoal
    ctx.fillStyle = '#1a1a2e'
    ctx.fillRect(0, 0, 512, 160)

    // Accent stripe
    ctx.fillStyle = '#d4af37'
    ctx.fillRect(0, 0, 512, 14)
    ctx.fillRect(0, 146, 512, 14)

    // "T" mall logo mark
    const lx = 60, ly = 80
    ctx.fillStyle = '#d4af37'
    ctx.fillRect(lx - 30, ly - 40, 60, 14)  // top bar
    ctx.fillRect(lx - 10, ly - 26, 20, 66)  // stem

    ctx.fillStyle = '#ffffff'
    ctx.font = 'bold 52px Arial, sans-serif'
    ctx.textBaseline = 'middle'
    ctx.fillText('Tbilisi Mall', 120, 65)

    ctx.font = '24px Arial, sans-serif'
    ctx.fillStyle = '#d4af37'
    ctx.fillText('თბილისი მოლი', 122, 118)
  })
  signMesh(scene, tex, x, y, z, rotY, 11, 3.4, 0x0a0a18)
}

// ─── Radisson Hotel ───────────────────────────────────────────────────────────

export function addRadissonSign(scene: THREE.Scene, x: number, y: number, z: number, rotY = 0) {
  const tex = makeTexture(512, 160, (ctx) => {
    ctx.fillStyle = '#1c1c1c'
    ctx.fillRect(0, 0, 512, 160)

    // Thin gold border
    ctx.strokeStyle = '#c9a84c'
    ctx.lineWidth = 4
    ctx.strokeRect(6, 6, 500, 148)

    // R logo mark (circle)
    const lx = 60, ly = 78
    ctx.strokeStyle = '#c9a84c'
    ctx.lineWidth = 5
    ctx.beginPath()
    ctx.arc(lx, ly, 38, 0, Math.PI * 2)
    ctx.stroke()
    ctx.fillStyle = '#c9a84c'
    ctx.font = 'bold 46px Arial, sans-serif'
    ctx.textBaseline = 'middle'
    ctx.textAlign = 'center'
    ctx.fillText('R', lx, ly + 2)
    ctx.textAlign = 'left'

    ctx.fillStyle = '#ffffff'
    ctx.font = 'bold 52px Arial, sans-serif'
    ctx.textBaseline = 'middle'
    ctx.fillText('Radisson', 120, 60)

    ctx.font = '24px Arial, sans-serif'
    ctx.fillStyle = '#c9a84c'
    ctx.fillText('BLU · Tbilisi', 120, 112)
  })
  signMesh(scene, tex, x, y, z, rotY, 11, 3.4, 0x111111)
}

// ─── EuropeBet Casino ─────────────────────────────────────────────────────────

export function addEuropeBetSign(scene: THREE.Scene, x: number, y: number, z: number, rotY = 0) {
  const tex = makeTexture(512, 160, (ctx) => {
    ctx.fillStyle = '#0a1628'
    ctx.fillRect(0, 0, 512, 160)

    // Stars strip along top
    ctx.fillStyle = '#ffd700'
    for (let i = 0; i < 12; i++) {
      const sx = 24 + i * 40, sy = 16
      ctx.beginPath()
      for (let p = 0; p < 5; p++) {
        const angle = (p * 4 * Math.PI) / 5 - Math.PI / 2
        const r2 = p % 2 === 0 ? 7 : 3
        p === 0
          ? ctx.moveTo(sx + Math.cos(angle) * r2, sy + Math.sin(angle) * r2)
          : ctx.lineTo(sx + Math.cos(angle) * r2, sy + Math.sin(angle) * r2)
      }
      ctx.closePath()
      ctx.fill()
    }

    ctx.fillStyle = '#ffd700'
    ctx.font = 'bold 66px Arial, sans-serif'
    ctx.textBaseline = 'middle'
    ctx.fillText('EuropeBet', 28, 88)

    ctx.font = '26px Arial, sans-serif'
    ctx.fillStyle = '#88aaff'
    ctx.fillText('კაზინო · CASINO', 30, 135)
  })
  signMesh(scene, tex, x, y, z, rotY, 10, 3, 0x060e1a)
}

// ─── Adjarabet Casino ─────────────────────────────────────────────────────────

export function addAdjarabetSign(scene: THREE.Scene, x: number, y: number, z: number, rotY = 0) {
  const tex = makeTexture(512, 160, (ctx) => {
    ctx.fillStyle = '#1a0a2e'
    ctx.fillRect(0, 0, 512, 160)

    // Neon-style purple/pink glow effect
    ctx.shadowColor = '#cc44ff'
    ctx.shadowBlur = 18

    ctx.fillStyle = '#cc44ff'
    ctx.font = 'bold 68px Arial, sans-serif'
    ctx.textBaseline = 'middle'
    ctx.fillText('Adjarabet', 30, 70)

    ctx.shadowBlur = 8
    ctx.font = '28px Arial, sans-serif'
    ctx.fillStyle = '#ff88ff'
    ctx.fillText('კაზინო · CASINO', 32, 125)
    ctx.shadowBlur = 0
  })
  signMesh(scene, tex, x, y, z, rotY, 10, 3, 0x0e0018)
}

// ─── Pharmadepo Pharmacy ──────────────────────────────────────────────────────

export function addPharmadepoSign(scene: THREE.Scene, x: number, y: number, z: number, rotY = 0) {
  const tex = makeTexture(512, 160, (ctx) => {
    ctx.fillStyle = '#006633'
    ctx.fillRect(0, 0, 512, 160)

    ctx.strokeStyle = '#ffffff'
    ctx.lineWidth = 5
    ctx.strokeRect(6, 6, 500, 148)

    // Cross symbol
    const cx = 62, cy = 80, sz = 50
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(cx - sz / 2, cy - sz / 6, sz, sz / 3)
    ctx.fillRect(cx - sz / 6, cy - sz / 2, sz / 3, sz)

    ctx.fillStyle = '#ffffff'
    ctx.font = 'bold 58px Arial, sans-serif'
    ctx.textBaseline = 'middle'
    ctx.fillText('Pharmadepo', 118, 68)

    ctx.font = '24px Arial, sans-serif'
    ctx.fillStyle = '#aaffcc'
    ctx.fillText('ფარმადეპო · PHARMACY', 118, 118)
  })
  signMesh(scene, tex, x, y, z, rotY, 11, 3, 0x004422)
}

// ─── Street Name Sign ────────────────────────────────────────────────────────

export function addStreetSign(
  scene: THREE.Scene,
  x: number, z: number,
  rotY = 0,
  label = 'რუსთაველის\nგამზირი'
) {
  const tex = makeTexture(400, 130, (ctx) => {
    ctx.fillStyle = '#003399'
    ctx.fillRect(0, 0, 400, 130)

    ctx.strokeStyle = '#ffffff'
    ctx.lineWidth = 5
    ctx.strokeRect(7, 7, 386, 116)

    ctx.fillStyle = '#ffffff'
    ctx.textBaseline = 'middle'
    ctx.textAlign = 'center'

    // Support two-line labels (split on \n)
    const lines = label.split('\n')
    if (lines.length === 2) {
      ctx.font = 'bold 30px Arial, sans-serif'
      ctx.fillText(lines[0], 200, 38)
      ctx.fillText(lines[1], 200, 74)
      ctx.font = '20px Arial, sans-serif'
      ctx.fillStyle = '#aabbff'
      ctx.fillText('Rustaveli Ave', 200, 108)
    } else {
      ctx.font = 'bold 28px Arial, sans-serif'
      ctx.fillText(label, 200, 50)
      ctx.font = '20px Arial, sans-serif'
      ctx.fillStyle = '#aabbff'
      ctx.fillText('Rustaveli Ave', 200, 96)
    }
  })

  // Group so pole is always behind the sign face
  const group = new THREE.Group()
  group.position.set(x, 0, z)
  group.rotation.y = rotY

  // Pole behind sign (negative z in group space)
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x888888, metalness: 0.6, roughness: 0.4 })
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 4.2, 8), poleMat)
  pole.position.set(0, 2.1, -0.06)
  group.add(pole)

  // Sign face (FrontSide = visible from +Z in group local space, which is where the road is)
  const frontMat = new THREE.MeshStandardMaterial({
    map: tex,
    side: THREE.FrontSide,
    roughness: 0.3,
    emissiveMap: tex,
    emissive: new THREE.Color(0xffffff),
    emissiveIntensity: 0.12,
  })
  const face = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 1.0), frontMat)
  face.position.set(0, 3.9, 0)
  group.add(face)

  // Solid blue back
  const backMat = new THREE.MeshStandardMaterial({ color: 0x003399, side: THREE.FrontSide })
  const back = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 1.0), backMat)
  back.position.set(0, 3.9, -0.01)
  back.rotation.y = Math.PI
  group.add(back)

  scene.add(group)
}
