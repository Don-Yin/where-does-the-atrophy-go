/** Owns material assignment and blend-shape application for one authored brain.
 * Expects cortex/region visual roots, never creates or changes scan geometry.
 */
import {MORPH_TARGET} from "./AtrophyData"

const CORTEX_DEPTH = requireAsset("../Materials/BrainDepth.mat") as Material
const CORTEX = requireAsset("../Materials/BrainSurface.mat") as Material
const WARP_MATERIAL = requireAsset("../Materials/BrainLobes.mat") as Material
const REGION_MATERIAL = requireAsset("../Materials/AtrophyRegion.mat") as Material
const PLANES_MATERIAL = requireAsset("../Materials/BrainPlanes.mat") as Material

@component
export class AtrophyBrainController extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">Atrophy – brain and carried ventricle region</span>')
  @ui.group_start("References")
  @input
  @hint("Authored GLB instance of the cortex; scale 100 and upright X rotation -90°")
  cortex!: SceneObject
  @input
  @hint("Authored ventricle GLB instance with the same coordinate frame")
  region!: SceneObject
  @input
  @hint("Authored seven-plane GLB instance (subject z at weight 0, MNI z at weight 1)")
  planes!: SceneObject
  @input
  @hint("Offline Jacobian colour set: identical cortex vertices and morph target, only vertex colours differ")
  warpMesh!: RenderMesh
  @ui.group_end
  @ui.group_start("Settings")
  @input
  @hint("False only for the static template cortex, which has no blend shape")
  cortexMorphs: boolean = true
  @input
  @hint("Fixed endpoint weight: subject 0, common 1; Main updates the morphing brain")
  @widget(new SliderWidget(0, 1, 0.01))
  initialWeight: number = 0
  @ui.group_end

  private cortexMeshes: RenderMeshVisual[] = []
  private regionMeshes: RenderMeshVisual[] = []
  private planeMeshes: RenderMeshVisual[] = []
  private anatomicalMesh!: RenderMesh
  private warpMaterial!: Material
  private focusLevel = -1
  private focusMaterial!: Material
  private weight = 0
  private warp = false

  get warpEnabled(): boolean { return this.warp }
  get morphWeight(): number { return this.weight }

  /** Snapshot existing FileMesh references, blend weights and private materials; no mesh-buffer reads or new geometry. */
  inspectCopy(parent: SceneObject): SceneObject {
    const copy = global.scene.createSceneObject("InspectCopy")
    copy.setParent(parent)
    copy.getTransform().setWorldTransform(this.getTransform().getWorldTransform())
    for (const [name, source] of [["Cortex", this.cortex], ["Region", this.region], ["Planes", this.planes]] as const) {
      const child = copy.copyWholeHierarchy(source)
      child.name = `Inspect${name}`
      const visuals = child.getComponentsInDescendants("Component.RenderMeshVisual", false, true)
      visuals.forEach((visual) => {
        const materials = Array.from({length: visual.getMaterialsCount()}, (_, i) => visual.getMaterial(i).clone())
        visual.clearMaterials()
        materials.forEach((material) => visual.addMaterial(material))
        if (name !== "Cortex" || this.cortexMorphs) visual.setBlendShapeWeight(MORPH_TARGET, this.weight)
      })
    }
    return copy
  }

  onAwake(): void {
    this.createEvent("OnStartEvent").bind(() => {
      if (!this.cortex || !this.region || !this.planes || !this.warpMesh) {
        throw new Error(`Atrophy: wire cortex/region/planes/warpMesh on ${this.sceneObject.name}`)
      }
      this.cortexMeshes = this.cortex.getComponentsInDescendants("Component.RenderMeshVisual", false, true)
      this.regionMeshes = this.region.getComponentsInDescendants("Component.RenderMeshVisual", false, true)
      this.planeMeshes = this.planes.getComponentsInDescendants("Component.RenderMeshVisual", false, true)
      if (this.cortexMeshes.length !== 1 || this.regionMeshes.length !== 1 || this.planeMeshes.length !== 7) {
        throw new Error(`Atrophy: expected one cortex, one region and seven plane meshes on ${this.sceneObject.name}`)
      }
      this.focusMaterial = PLANES_MATERIAL.clone()
      // Ignore the sheet's authored 0.12 vertex alpha while selected: a full teal fill remains legible at 1 m.
      this.focusMaterial.mainPass.vertexColorWeight = 0
      this.focusMaterial.mainPass.baseColor = new vec4(0, 0.9, 0.85, 0.42)
      this.planeMeshes.sort((a, b) => a.sceneObject.name.localeCompare(b.sceneObject.name))
      this.anatomicalMesh = this.cortexMeshes[0].mesh
      // Per-brain uniform: a shared material would make common=1 overwrite morph=w.
      this.warpMaterial = WARP_MATERIAL.clone()
      this.setWarp(this.warp)
      const cortexOrder = this.cortexMeshes[0].getRenderOrder()
      this.regionMeshes.forEach((mesh) => {
        mesh.clearMaterials(); mesh.addMaterial(REGION_MATERIAL); mesh.setRenderOrder(cortexOrder + 2)
      })
      this.planeMeshes.forEach((mesh) => {
        mesh.clearMaterials(); mesh.addMaterial(PLANES_MATERIAL); mesh.setRenderOrder(cortexOrder + 1)
      })
      this.setFocus(this.focusLevel)
      this.setWeight(this.initialWeight)
    })
  }

  setWeight(weight: number): void {
    if (!Number.isFinite(weight) || weight < 0 || weight > 1) {
      throw new Error(`Atrophy: invalid morph weight ${weight}`)
    }
    this.weight = weight
    if (this.warpMaterial) this.warpMaterial.mainPass.vertexColorWeight = weight
    if (this.cortexMorphs) this.cortexMeshes.forEach((mesh) => mesh.setBlendShapeWeight(MORPH_TARGET, weight))
    this.regionMeshes.forEach((mesh) => mesh.setBlendShapeWeight(MORPH_TARGET, weight))
    this.planeMeshes.forEach((mesh) => mesh.setBlendShapeWeight(MORPH_TARGET, weight))
  }

  get selectedLevel(): number { return this.focusLevel }

  setFocus(level: number): void {
    this.focusLevel = level
    this.planeMeshes.forEach((mesh, i) => {
      mesh.mainMaterial = i === level ? this.focusMaterial : PLANES_MATERIAL
    })
  }

  /** Toggle the offline J colour set once; setWeight only updates its cheap shader uniform and blend shape. */
  setWarp(enabled: boolean): void {
    this.warp = enabled
    this.cortexMeshes.forEach((mesh) => {
      mesh.mesh = enabled ? this.warpMesh : this.anatomicalMesh
      mesh.clearMaterials()
      mesh.addMaterial(CORTEX_DEPTH)
      mesh.addMaterial(enabled ? this.warpMaterial : CORTEX)
      if (this.cortexMorphs) mesh.setBlendShapeWeight(MORPH_TARGET, this.weight)
    })
  }
}
