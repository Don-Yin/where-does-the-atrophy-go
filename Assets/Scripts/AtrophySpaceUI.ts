/** Passive endpoint label, authored independently from the brain it annotates.
 * The common-space flag selects metadata, never changes the registration.
 */
import {REGION} from "./AtrophyData"
import {ATROPHY_LAYOUT} from "./AtrophyLayout"
import {addText, faceViewer, panelContent} from "./AtrophyLayoutUI"

@component
export class AtrophySpaceUI extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">Atrophy – endpoint label</span>')
  @ui.group_start("Settings")
  @input
  @hint("False: patient / subject coordinates. True: template / MNI coordinates")
  commonSpace: boolean = false
  @ui.group_end

  onAwake(): void {
    this.sceneObject.createComponent("Component.Canvas")
    const width = ATROPHY_LAYOUT.labelWidth
    const content = panelContent(this.sceneObject, "SpaceLabelContent",
      new vec2(width, 9), new vec2(width, 8.5))
    addText(content, this.commonSpace ? "CommonSpaceLabel" : "SubjectSpaceLabel",
      this.commonSpace ? "Common space\n(MNI)" : "Subject space", "Headline1", width - 1, 3.3)
    addText(content, this.commonSpace ? "CommonRegionVolume" : "SubjectRegionVolume",
      `${(this.commonSpace ? REGION.ventricle_ml.mni : REGION.ventricle_ml.subject).toFixed(1)} mL`,
      "Headline1", width - 1, 2)
    addText(content, this.commonSpace ? "CommonVolumeContext" : "SubjectVolumeContext",
      this.commonSpace ? "Same region\nafter warp" : "P0006 · FTD\nventricle region", "Caption", width - 1, 2.6)
    faceViewer(this.sceneObject, true)
  }
}
