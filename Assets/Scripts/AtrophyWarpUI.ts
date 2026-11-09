/** Always-on progressive Warp colours; the brain is the only morph control. */
import {AtrophyBrainController} from "./AtrophyBrainController"
import {AtrophySlicesUI} from "./AtrophySlicesUI"
@component
export class AtrophyWarpUI extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">Atrophy – progressive Warp colours</span>')
  @input subjectBrain!: AtrophyBrainController
  @input commonBrain!: AtrophyBrainController
  @input morphBrain!: AtrophyBrainController
  @input subjectSlices!: AtrophySlicesUI
  @input commonSlices!: AtrophySlicesUI

  onAwake(): void {
    this.createEvent("OnStartEvent").bind(() => {
      if (!this.subjectBrain || !this.commonBrain || !this.morphBrain || !this.subjectSlices || !this.commonSlices) {
        throw new Error("Atrophy Warp: wire all three brains and both slice rows")
      }
      this.subjectBrain.setWarp(false)
      this.subjectSlices.setWarp(false)
      this.commonBrain.setWarp(true)
      this.morphBrain.setWarp(true)
      this.commonSlices.setWarp(true)
      console.log("Atrophy Warp ready: always on, Main-owned progressive colour")
    })
  }
}
