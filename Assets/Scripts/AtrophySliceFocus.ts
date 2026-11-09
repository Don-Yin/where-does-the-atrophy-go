/** The default largest-ROI pair and tile-selected paired levels share one card. No runtime resampling or mesh reads. */
import {FlexDirection} from "UIKit.lspkg/Scripts/Components/Layout2D/Flex/FlexTypes"
import {AtrophyBrainController} from "./AtrophyBrainController"
import {AtrophySlicesUI, SliceImageStack} from "./AtrophySlicesUI"
import {addText, cell, faceViewer, flex, obj, panelContent} from "./AtrophyLayoutUI"
import {REGION} from "./AtrophyData"
import {ATROPHY_LAYOUT} from "./AtrophyLayout"

@component
export class AtrophySliceFocus extends BaseScriptComponent {
  @input subject!: AtrophySlicesUI
  @input common!: AtrophySlicesUI
  @input subjectBrain!: AtrophyBrainController
  @input commonBrain!: AtrophyBrainController
  @input morphBrain!: AtrophyBrainController

  selectedLevel = -1
  private heading!: Text
  private pairs: {slices: AtrophySlicesUI; stack: SliceImageStack; caption: Text}[] = []

  onAwake(): void {
    this.sceneObject.createComponent("Component.Canvas")
    const card = obj(this.sceneObject, "SliceFocus")
    const width = ATROPHY_LAYOUT.focusCardWidth, pairWidth = width - 2, tileWidth = (pairWidth - 1) / 2
    const content = panelContent(card, "SliceFocusContent", new vec2(width, ATROPHY_LAYOUT.focusCardHeight), new vec2(width - 1, ATROPHY_LAYOUT.focusCardHeight - 1))
    this.heading = addText(content, "SliceFocusHeading", "", "Body", width - 1, 2.5)
    const pairHeight = ATROPHY_LAYOUT.focusImageHeight + 3
    cell(content, "SliceFocusPair", pairWidth, pairHeight, (row) => {
      flex(row, pairWidth, pairHeight, FlexDirection.Row, 1)
      for (const [name, slices] of [["Subject", this.subject], ["Common", this.common]] as const) {
        cell(row, `${name}FocusTile`, tileWidth, pairHeight, (tile) => {
          flex(tile, tileWidth, pairHeight, FlexDirection.Column, 0.2)
          const stack = slices.addSliceImage(tile, `${name}FocusImage`, "key", ATROPHY_LAYOUT.focusImageHeight)
          const caption = addText(tile, `${name}FocusCut`, "", "Body", tileWidth, 2.8)
          this.pairs.push({slices, stack, caption})
        })
      }
    })
    faceViewer(card)
    this.close()
    this.createEvent("OnStartEvent").bind(() => {
      this.subject.onSelect = this.common.onSelect = (level) => this.select(level)
    })
  }

  select(level: number): void {
    if (!Number.isInteger(level) || level < 0 || level >= REGION.mni_z_mm.length) throw new Error(`Invalid Slice focus level ${level}`)
    this.show(this.selectedLevel === level ? -1 : level)
  }

  close(): void { this.show(-1) }

  private show(level: number): void {
    this.selectedLevel = level
    this.heading.text = level < 0 ? "Key slice · largest ROI" : `Paired level · MNI z ${REGION.mni_z_mm[level]} mm`
    this.pairs.forEach(({slices, stack, caption}) => {
      slices.setSliceLevel(stack, level < 0 ? "key" : level)
      if (level < 0) {
        const key = REGION.key_slice[slices.commonSpace ? "common" : "subject"]
        caption.text = slices.commonSpace ? `MNI space\nz ${key.world_z_mm} mm` : `Subject cut\nscanner z ${key.world_z_mm} mm`
      } else caption.text = `${slices.commonSpace ? "MNI space" : "Subject cut →"}\nz ${REGION.mni_z_mm[level]} mm`
    })
    for (const brain of [this.subjectBrain, this.commonBrain, this.morphBrain]) brain.setFocus(level)
  }
}
