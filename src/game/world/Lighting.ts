import * as THREE from 'three'

export function setupLighting(scene: THREE.Scene, renderer: THREE.WebGLRenderer) {
  // Sky (Georgian blue)
  scene.background = new THREE.Color(0x87ceeb)
  scene.fog = new THREE.FogExp2(0xaad4ee, 0.0035)

  // Ambient sky + ground hemisphere
  const hemi = new THREE.HemisphereLight(0x87ceeb, 0x8b7355, 0.9)
  hemi.position.set(0, 200, 0)
  scene.add(hemi)

  // Sun (directional) — afternoon Georgian sun
  const sun = new THREE.DirectionalLight(0xfffce8, 2.6)
  sun.position.set(120, 250, 80)
  sun.castShadow = true
  sun.shadow.mapSize.width = 1024
  sun.shadow.mapSize.height = 1024
  sun.shadow.camera.near = 1
  sun.shadow.camera.far = 400
  sun.shadow.camera.left = -150
  sun.shadow.camera.right = 150
  sun.shadow.camera.top = 150
  sun.shadow.camera.bottom = -150
  sun.shadow.bias = -0.0002
  sun.shadow.normalBias = 0.02
  scene.add(sun)

  // Fill light (bounce off buildings)
  const fill = new THREE.DirectionalLight(0xd4e8ff, 0.5)
  fill.position.set(-80, 100, -60)
  scene.add(fill)

  // Ambient (gentle global)
  const ambient = new THREE.AmbientLight(0x404468, 0.4)
  scene.add(ambient)

  // Street lamps will be added by the world
}

export function createStreetLamp(
  scene: THREE.Scene,
  x: number,
  z: number,
  rotation = 0
): THREE.Group {
  const group = new THREE.Group()

  const poleMat = new THREE.MeshStandardMaterial({ color: 0x666666, metalness: 0.6, roughness: 0.5 })
  const headMat = new THREE.MeshStandardMaterial({ color: 0x333333, metalness: 0.4, roughness: 0.6 })
  const glassMat = new THREE.MeshStandardMaterial({
    color: 0xffeeaa,
    emissive: new THREE.Color(0xffee88),
    emissiveIntensity: 1.0,
  })

  // Pole
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.09, 8.5, 8), poleMat)
  pole.position.set(0, 4.25, 0)
  pole.castShadow = false
  group.add(pole)

  // Arm
  const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.8, 8), poleMat)
  arm.rotation.z = Math.PI / 2
  arm.position.set(0.9, 8.3, 0)
  group.add(arm)

  // Lamp head
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.22, 0.32), headMat)
  head.position.set(1.8, 8.2, 0)
  group.add(head)

  // Lens (emissive glow — no real PointLight to keep draw calls low)
  const lens = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.10, 0.28), glassMat)
  lens.position.set(1.8, 8.1, 0)
  group.add(lens)

  // Base
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.28, 0.3, 8), poleMat)
  base.position.set(0, 0.15, 0)
  group.add(base)

  group.position.set(x, 0, z)
  group.rotation.y = rotation

  scene.add(group)
  return group
}
