import * as THREE from 'three'

function disposeMaterial(
  material: THREE.Material,
  disposedMaterials: Set<THREE.Material>,
  disposedTextures: Set<THREE.Texture>,
) {
  if (disposedMaterials.has(material)) return
  disposedMaterials.add(material)

  for (const value of Object.values(material)) {
    if ((value as THREE.Texture | undefined)?.isTexture) {
      const texture = value as THREE.Texture
      if (!disposedTextures.has(texture)) {
        disposedTextures.add(texture)
        texture.dispose()
      }
    }
  }

  material.dispose()
}

export function disposeObject3D(root: THREE.Object3D) {
  const disposedGeometries = new Set<THREE.BufferGeometry>()
  const disposedMaterials = new Set<THREE.Material>()
  const disposedTextures = new Set<THREE.Texture>()

  root.traverse((obj) => {
    const geometry = (obj as THREE.Mesh).geometry as THREE.BufferGeometry | undefined
    if (geometry && !disposedGeometries.has(geometry)) {
      disposedGeometries.add(geometry)
      geometry.dispose()
    }

    const material = (obj as THREE.Mesh | THREE.Sprite).material as THREE.Material | THREE.Material[] | undefined
    if (!material) return

    const materials = Array.isArray(material) ? material : [material]
    for (const mat of materials) {
      disposeMaterial(mat, disposedMaterials, disposedTextures)
    }
  })
}
