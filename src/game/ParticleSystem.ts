import * as THREE from 'three'

interface Particle {
  mesh: THREE.Mesh
  velocity: THREE.Vector3
  life: number
  maxLife: number
  type: 'smoke' | 'spark' | 'dust'
}

export class ParticleSystem {
  private particles: Particle[] = []
  private scene: THREE.Scene

  // Pre-created materials for performance
  private smokeMat: THREE.MeshBasicMaterial
  private exhaustMat: THREE.MeshBasicMaterial
  private sparkMat: THREE.MeshBasicMaterial
  private dustMat: THREE.MeshBasicMaterial

  constructor(scene: THREE.Scene) {
    this.scene = scene
    this.smokeMat = new THREE.MeshBasicMaterial({
      color: 0xc8c8c8,
      transparent: true,
      depthWrite: false,
    })
    this.exhaustMat = new THREE.MeshBasicMaterial({
      color: 0xd8d8d8,
      transparent: true,
      depthWrite: false,
    })
    this.sparkMat = new THREE.MeshBasicMaterial({
      color: 0xffaa22,
      transparent: true,
      depthWrite: false,
    })
    this.dustMat = new THREE.MeshBasicMaterial({
      color: 0x8b7355,
      transparent: true,
      depthWrite: false,
    })
  }

  emitExhaust(position: THREE.Vector3) {
    const mat = this.exhaustMat.clone()
    mat.opacity = 0.18 + Math.random() * 0.12
    const size = 0.06 + Math.random() * 0.05
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(size, 4, 4), mat)
    mesh.position.copy(position)
    const vel = new THREE.Vector3(
      (Math.random() - 0.5) * 0.4,
      0.3 + Math.random() * 0.4,
      (Math.random() - 0.5) * 0.4
    )
    this.scene.add(mesh)
    const life = 0.6 + Math.random() * 0.4
    this.particles.push({ mesh, velocity: vel, life, maxLife: life, type: 'smoke' })
  }

  emitSmoke(position: THREE.Vector3, count = 4) {
    for (let i = 0; i < count; i++) {
      this.spawn('smoke', position, 1.2 + Math.random())
    }
  }

  emitSparks(position: THREE.Vector3, count = 12) {
    for (let i = 0; i < count; i++) {
      this.spawn('spark', position, 0.4 + Math.random() * 0.3)
    }
  }

  emitDust(position: THREE.Vector3, count = 6) {
    for (let i = 0; i < count; i++) {
      this.spawn('dust', position, 0.8 + Math.random() * 0.5)
    }
  }

  private spawn(type: 'smoke' | 'spark' | 'dust', pos: THREE.Vector3, life: number) {
    const size = type === 'spark' ? 0.06 : type === 'smoke' ? 0.18 : 0.2
    const geo = new THREE.SphereGeometry(size, 4, 4)
    const mat =
      type === 'smoke'
        ? this.smokeMat.clone()
        : type === 'spark'
        ? this.sparkMat.clone()
        : this.dustMat.clone()
    mat.opacity = type === 'smoke' ? 0.55 : 0.9

    const mesh = new THREE.Mesh(geo, mat)
    mesh.position.copy(pos)

    const spread = type === 'spark' ? 4 : 1.5
    const vel = new THREE.Vector3(
      (Math.random() - 0.5) * spread,
      type === 'spark' ? Math.random() * 4 + 1 : Math.random() * 2 + 0.5,
      (Math.random() - 0.5) * spread
    )

    this.scene.add(mesh)
    this.particles.push({ mesh, velocity: vel, life, maxLife: life, type })
  }

  update(dt: number) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i]
      p.life -= dt

      p.mesh.position.addScaledVector(p.velocity, dt)

      if (p.type === 'spark') {
        p.velocity.y -= 8 * dt
        p.velocity.multiplyScalar(0.92)
      } else {
        p.velocity.y -= 0.3 * dt
        p.velocity.multiplyScalar(0.98)
      }

      const alpha = Math.max(0, p.life / p.maxLife)
      ;(p.mesh.material as THREE.MeshBasicMaterial).opacity = alpha * 0.85
      p.mesh.scale.setScalar(1 + (1 - alpha) * (p.type === 'smoke' ? 4 : 1))

      if (p.life <= 0) {
        this.scene.remove(p.mesh)
        p.mesh.geometry.dispose()
        ;(p.mesh.material as THREE.MeshBasicMaterial).dispose()
        this.particles.splice(i, 1)
      }
    }
  }

  clear() {
    for (const p of this.particles) {
      this.scene.remove(p.mesh)
    }
    this.particles = []
  }
}
