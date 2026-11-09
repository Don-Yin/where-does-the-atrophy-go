/** A row-major grid of seven scan-bound axial tiles under an authored root.
 * Every tile uses UIKit layout/BackPlate; the whole 4+3 grid faces the viewer as one plane.
 * Subject cuts are paired to the MNI plane they map onto, never labeled as native MNI coordinates.
 * R/L is baked after affine-based radiological resampling; coral outlines and common-space J are separate Images.
 */
import {BackPlate} from "UIKit.lspkg/Scripts/BackPlate"
import {FlexDirection} from "UIKit.lspkg/Scripts/Components/Layout2D/Flex/FlexTypes"
import {REGION} from "./AtrophyData"
import {ATROPHY_LAYOUT} from "./AtrophyLayout"
import {addText, cell, faceViewer, flex, obj, panelContent} from "./AtrophyLayoutUI"

const IMAGE_MATERIAL = requireAsset("../Materials/ImageMaterial.mat") as Material
const REGION_MATERIAL = requireAsset("../Materials/AtrophyRegion.mat") as Material
const SUBJECT_SLICES: Texture[] = [
  requireAsset("../Brain/slices/subject-0.png") as Texture,
  requireAsset("../Brain/slices/subject-1.png") as Texture,
  requireAsset("../Brain/slices/subject-2.png") as Texture,
  requireAsset("../Brain/slices/subject-3.png") as Texture,
  requireAsset("../Brain/slices/subject-4.png") as Texture,
  requireAsset("../Brain/slices/subject-5.png") as Texture,
  requireAsset("../Brain/slices/subject-6.png") as Texture,
]
const COMMON_SLICES: Texture[] = [
  requireAsset("../Brain/slices/common-0.png") as Texture,
  requireAsset("../Brain/slices/common-1.png") as Texture,
  requireAsset("../Brain/slices/common-2.png") as Texture,
  requireAsset("../Brain/slices/common-3.png") as Texture,
  requireAsset("../Brain/slices/common-4.png") as Texture,
  requireAsset("../Brain/slices/common-5.png") as Texture,
  requireAsset("../Brain/slices/common-6.png") as Texture,
]
const SUBJECT_OUTLINES: Texture[] = [
  requireAsset("../Brain/slices/subject-outline-0.png") as Texture,
  requireAsset("../Brain/slices/subject-outline-1.png") as Texture,
  requireAsset("../Brain/slices/subject-outline-2.png") as Texture,
  requireAsset("../Brain/slices/subject-outline-3.png") as Texture,
  requireAsset("../Brain/slices/subject-outline-4.png") as Texture,
  requireAsset("../Brain/slices/subject-outline-5.png") as Texture,
  requireAsset("../Brain/slices/subject-outline-6.png") as Texture,
]
const COMMON_OUTLINES: Texture[] = [
  requireAsset("../Brain/slices/common-outline-0.png") as Texture,
  requireAsset("../Brain/slices/common-outline-1.png") as Texture,
  requireAsset("../Brain/slices/common-outline-2.png") as Texture,
  requireAsset("../Brain/slices/common-outline-3.png") as Texture,
  requireAsset("../Brain/slices/common-outline-4.png") as Texture,
  requireAsset("../Brain/slices/common-outline-5.png") as Texture,
  requireAsset("../Brain/slices/common-outline-6.png") as Texture,
]

const COMMON_WARP: Texture[] = [
  requireAsset("../Brain/slices/common-warp-0.png") as Texture,
  requireAsset("../Brain/slices/common-warp-1.png") as Texture,
  requireAsset("../Brain/slices/common-warp-2.png") as Texture,
  requireAsset("../Brain/slices/common-warp-3.png") as Texture,
  requireAsset("../Brain/slices/common-warp-4.png") as Texture,
  requireAsset("../Brain/slices/common-warp-5.png") as Texture,
  requireAsset("../Brain/slices/common-warp-6.png") as Texture,
]

export type SliceLevel = number | "key"
export interface SliceImageStack {image: Image; outline: Image; warp?: Image}
const KEY_SUBJECT = [requireAsset("../Brain/slices/subject-key-0.png"), requireAsset("../Brain/slices/subject-key-outline-0.png")] as Texture[]
const KEY_COMMON = [requireAsset("../Brain/slices/common-key-0.png"), requireAsset("../Brain/slices/common-key-outline-0.png"), requireAsset("../Brain/slices/common-key-warp-0.png")] as Texture[]

@component
export class AtrophySlicesUI extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">Atrophy – seven axial slices</span>')
  @ui.group_start("Settings")
  @input
  @hint("Select template slices and MNI z labels; false selects subject-space cuts")
  commonSpace: boolean = false
  @ui.group_end

  onSelect: (level: number) => void = () => {}
  private warp = false
  private warpImages: SceneObject[] = []

  get warpEnabled(): boolean { return this.warp }
  setWarp(enabled: boolean): void {
    this.warp = this.commonSpace && enabled
    this.warpImages.forEach((image) => { image.enabled = this.warp })
  }

  onAwake(): void {
    this.sceneObject.createComponent("Component.Canvas")
    const {tile, tileGap, sliceColumns: columns, sliceRowGap: rowGap} = ATROPHY_LAYOUT
    const count = Math.min(columns, REGION.mni_z_mm.length), width = count * tile + (count - 1) * tileGap
    const rows = Math.ceil(REGION.mni_z_mm.length / columns), rowHeight = tile + 2.6
    flex(this.sceneObject, width, rows * (rowHeight + rowGap) + 4.2, FlexDirection.Column, rowGap)
    const heading = addText(this.sceneObject, this.commonSpace ? "CommonSliceHeading" : "SubjectSliceHeading",
      this.commonSpace ? "MNI axial planes\nz (mm)" : "Subject cuts →\nMNI planes · z (mm)",
      "Body", width, 4.2)
    // The row hangs in front of the clinicians' pale blue scrubs, which swallow plain white text.
    heading.outlineSettings.enabled = true
    heading.outlineSettings.fill.color = new vec4(0, 0, 0, 1)
    const side = this.commonSpace ? "Common" : "Subject"
    const textures = this.commonSpace ? COMMON_SLICES : SUBJECT_SLICES
    for (let r = 0; r < rows; r++) cell(this.sceneObject, `${side}SliceRow${r}`, width, rowHeight, (row) => {
      flex(row, width, rowHeight, FlexDirection.Row, tileGap)
      textures.slice(r * columns, (r + 1) * columns).forEach((_, column) => {
        const i = r * columns + column
        cell(row, `${side}SliceTile${i}`, tile, rowHeight, (root) => {
          const content = panelContent(root, "SliceContent",
            new vec2(tile, tile + 2.6), new vec2(tile, tile + 2.4))
          this.addSliceImage(content, `${side}SliceImage${i}`, i, tile)
          const plate = root.getComponent(BackPlate.getTypeName()) as BackPlate
          plate.onInitialized.add(() => plate.interactable.onTriggerEnd.add(() => this.onSelect(i)))
          const level = REGION.mni_z_mm[i].toFixed(0)
          addText(content, `${side}SliceCut${i}`, `${this.commonSpace ? "z " : "to z "}${level}`,
            "Caption", tile, 1.6)
        })
      })
    })
    // One billboard keeps neighbouring enlarged tiles upright and disjoint, without nested per-tile rotations.
    faceViewer(this.sceneObject, true)
  }

  /** Shared image stack for the row and enlarged card; both keep the original affine-derived texture and aspect. */
  addSliceImage(parent: SceneObject, name: string, level: SliceLevel, height: number): SliceImageStack {
    const texture = this.textures(level)[0]
    const stack = {} as SliceImageStack
    cell(parent, name, height * texture.getWidth() / texture.getHeight(), height, (imageObject) => {
      const image = imageObject.createComponent("Component.Image") as Image
      stack.image = image
      const material = IMAGE_MATERIAL.clone()
      material.mainPass.baseTex = texture
      material.mainPass.depthTest = true
      material.mainPass.depthWrite = false
      image.clearMaterials()
      image.addMaterial(material)
      const overlay = (suffix: string, depth: number, colour: vec4): Image => {
        const root = obj(imageObject, name.includes("Focus") ? `${name}${suffix}` : `${this.commonSpace ? "Common" : "Subject"}Slice${suffix}${level}`, new vec3(0, 0, depth * 0.02))
        const layer = root.createComponent("Component.Image") as Image
        const paint = material.clone()
        paint.mainPass.baseColor = colour
        layer.clearMaterials(); layer.addMaterial(paint)
        layer.setRenderOrder(image.getRenderOrder() + depth)
        return layer
      }
      if (this.commonSpace) {
        stack.warp = overlay("Warp", 1, vec4.one())
        stack.warp.sceneObject.enabled = this.warp
        this.warpImages.push(stack.warp.sceneObject)
      }
      stack.outline = overlay("Outline", 2, REGION_MATERIAL.mainPass.baseColor)
    })
    this.setSliceLevel(stack, level)
    return stack
  }

  private textures(level: SliceLevel): Texture[] {
    if (level === "key") return this.commonSpace ? KEY_COMMON : KEY_SUBJECT
    return this.commonSpace ? [COMMON_SLICES[level], COMMON_OUTLINES[level], COMMON_WARP[level]] : [SUBJECT_SLICES[level], SUBJECT_OUTLINES[level]]
  }

  setSliceLevel(stack: SliceImageStack, level: SliceLevel): void {
    const [image, outline, warp] = this.textures(level)
    stack.image.mainMaterial.mainPass.baseTex = image
    stack.outline.mainMaterial.mainPass.baseTex = outline
    if (stack.warp) stack.warp.mainMaterial.mainPass.baseTex = warp
  }
}
