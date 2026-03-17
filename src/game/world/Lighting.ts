import * as THREE from 'three'

export interface LightingController {
  setMode: (mode: 'day' | 'night') => void
  getMode: () => 'day' | 'night'
  setShadowCenter: (x: number, z: number) => void
}

export function setupLighting(scene: THREE.Scene): LightingController {
  let mode: 'day' | 'night' = 'day'

  // Day colors
  const daySky = new THREE.Color(0x87ceeb)
  const dayFog = new THREE.Color(0xaad4ee)
  
  // Night colors
  const nightSky = new THREE.Color(0x020408)
  const nightFog = new THREE.Color(0x050810)

  scene.background = daySky
  scene.fog = new THREE.FogExp2(dayFog, 0.0035)

  // Ambient sky + ground hemisphere
  const hemi = new THREE.HemisphereLight(0x87ceeb, 0x8b7355, 0.9)
  hemi.position.set(0, 200, 0)
  scene.add(hemi)

  // Sun (directional) — Warm San Andreas Golden Hour
  const sun = new THREE.DirectionalLight(0xffd27d, 3.2)
  sun.position.set(120, 250, 80)
  sun.castShadow = false
  scene.add(sun)
  scene.add(sun.target)

  // Fill light (bounce off buildings)
  const fill = new THREE.DirectionalLight(0xffaa44, 0.8)
  fill.position.set(-80, 100, -60)
  scene.add(fill)

  // Ambient (gentle global)
  const ambient = new THREE.AmbientLight(0x404468, 0.2)
  scene.add(ambient)

  return {
    setShadowCenter: (x: number, z: number) => {
      sun.target.position.set(x, 0, z)
      sun.target.updateMatrixWorld()
      sun.shadow.camera.updateProjectionMatrix()
    },
    setMode: (newMode) => {
      mode = newMode
      if (mode === 'day') {
        scene.background = daySky
        if (scene.fog instanceof THREE.FogExp2) {
          scene.fog.color = dayFog
          scene.fog.density = 0.0035
        }
        hemi.intensity = 0.9
        sun.intensity = 2.6
        fill.intensity = 0.5
        ambient.intensity = 0.4
      } else {
        scene.background = nightSky
        if (scene.fog instanceof THREE.FogExp2) {
          scene.fog.color = nightFog
          scene.fog.density = 0.008 // thicker night fog
        }
        hemi.intensity = 0.15
        sun.intensity = 0.05 // faint moonlight
        fill.intensity = 0.02
        ambient.intensity = 0.08
      }
      
      // Update emissive objects in the scene
      scene.traverse((obj) => {
        if (obj instanceof THREE.Mesh && obj.material instanceof THREE.MeshStandardMaterial) {
          if (obj.name === 'lamp-lens' || obj.name === 'headlight-lens') {
            obj.material.emissiveIntensity = mode === 'day' ? 1.0 : 8.0
          }
        }
      })
    },
    getMode: () => mode,
  }
}

export function createStreetLamp(
  scene: THREE.Scene,
  x: number,
  z: number,
  rotation = 0
): THREE.Group {
  const group = new THREE.Group()

  const poleMat = new THREE.MeshStandardMaterial({ color: 0x444444, metalness: 0.6, roughness: 0.5 })
  const headMat = new THREE.MeshStandardMaterial({ color: 0x222222, metalness: 0.4, roughness: 0.6 })
  const glassMat = new THREE.MeshStandardMaterial({
    color: 0xffeeaa,
    emissive: new THREE.Color(0xffaa44),
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

  // Lens (emissive glow)
  const lens = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.10, 0.28), glassMat)
  lens.name = 'lamp-lens'
  lens.position.set(1.8, 8.1, 0)
  group.add(lens)
  
  // Actual light source for night (optional performance-wise)
  // For now we'll just use the emissive + bloom.

  // Base
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.28, 0.3, 8), poleMat)
  base.position.set(0, 0.15, 0)
  group.add(base)

  group.position.set(x, 0, z)
  group.rotation.y = rotation

  scene.add(group)
  return group
}
