/** Shared UIKit layout and typography for the research tool's passive UI views.
 * No domain state, no hand-rolled interaction surfaces. All dimensions are cm.
 * Package names reflect the installed IK/UIKit 4.0, not the pre-4.0 skill aliases.
 */
import {Billboard} from "InteractionKit.lspkg/Components/Interaction/Billboard/Billboard"
import {BackPlate} from "UIKit.lspkg/Scripts/BackPlate"
import {FlexLayout} from "UIKit.lspkg/Scripts/Components/Layout2D/Flex/FlexLayout"
import {FlexItem} from "UIKit.lspkg/Scripts/Components/Layout2D/Flex/FlexItem"
import {FlexAlign, FlexDirection, FlexJustify} from "UIKit.lspkg/Scripts/Components/Layout2D/Flex/FlexTypes"

export const TYPE_SCALE = {
  Headline1: {size: 68, weight: 700},
  Body: {size: 50, weight: 500},
  Caption: {size: 46, weight: 500},
}
export type TextRole = keyof typeof TYPE_SCALE

/** Painted glyph corners in world space, after Flex and Billboard have laid out the text. */
export function textWorldCorners(text: Text): vec3[] {
  const glyphs = text.getBoundingBox(), matrix = text.getTransform().getWorldTransform()
  return [glyphs.left, glyphs.right].flatMap((x) => [glyphs.bottom, glyphs.top].map((y) => matrix.multiplyPoint(new vec3(x, y, 0))))
}

export function obj(parent: SceneObject, name: string, position?: vec3): SceneObject {
  const child = global.scene.createSceneObject(name)
  child.setParent(parent)
  if (position) child.getTransform().setLocalPosition(position)
  return child
}

/** Screen-aligned cards also follow camera up; otherwise a settled X/Y billboard can retain roll. */
export function faceViewer(root: SceneObject, screenAligned = false): void {
  const billboard = root.createComponent(Billboard.getTypeName()) as Billboard
  billboard.xAxisEnabled = true
  billboard.yAxisEnabled = true
  billboard.zAxisEnabled = screenAligned
  billboard.uprightBandEnabled = false
  billboard.axisBufferDegrees = vec3.zero()
  billboard.axisEasing = vec3.one()
}

export function flex(parent: SceneObject, width: number, height: number,
    direction = FlexDirection.Column, gap = 0.3, padding = 0): FlexLayout {
  const layout = parent.createComponent(FlexLayout.getTypeName()) as FlexLayout
  layout.autoDiscoverItemsOnStart = false
  layout.onInitialized.add(() => {
    layout.width = width
    layout.height = height
    layout.direction = direction
    layout.alignItems = FlexAlign.Center
    layout.justifyContent = FlexJustify.Center
    layout.rowGap = gap
    layout.columnGap = gap
    layout.paddingTop = padding
    layout.paddingBottom = padding
    layout.paddingLeft = padding
    layout.paddingRight = padding
  })
  return layout
}

export function panelContent(parent: SceneObject, name: string, plateSize: vec2,
    contentSize = plateSize, gap = 0.3): SceneObject {
  const plate = parent.createComponent(BackPlate.getTypeName()) as BackPlate
  plate.size = plateSize
  const content = obj(parent, name, new vec3(0, 0, 0.6))
  flex(content, contentSize.x, contentSize.y, FlexDirection.Column, gap)
  return content
}

export function cell(parent: SceneObject, name: string, width: number, height: number,
    builder: (child: SceneObject) => void): SceneObject {
  const child = obj(parent, name, new vec3(0, 0, 0.02))
  const item = child.createComponent(FlexItem.getTypeName()) as FlexItem
  item.overrideWidth = width
  item.overrideHeight = height
  item.flexGrow = 0
  item.flexShrink = 0
  builder(child)
  const layout = parent.getComponent(FlexLayout.getTypeName()) as FlexLayout
  if (!layout) throw new Error(`Atrophy UI: ${parent.name} needs a FlexLayout`)
  layout.addItems([item])
  return child
}

export function addText(parent: SceneObject, name: string, value: string,
    role: TextRole, width: number, height: number): Text {
  let text: Text
  cell(parent, name, width, height, (child) => {
    text = child.createComponent("Component.Text") as Text
    text.text = value
    text.depthTest = true
    text.size = TYPE_SCALE[role].size
    text.weight = TYPE_SCALE[role].weight
    text.horizontalAlignment = HorizontalAlignment.Center
    text.verticalAlignment = VerticalAlignment.Center
    text.horizontalOverflow = HorizontalOverflow.Overflow
    text.verticalOverflow = VerticalOverflow.Overflow
    text.layoutRect = Rect.create(-width / 2, width / 2, -height / 2, height / 2)
    text.textFill.color = new vec4(1, 1, 1, 1)
  })
  return text!
}
