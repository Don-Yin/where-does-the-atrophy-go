/** Placement owns one world pose for the whole Scene set. The official package owns hit testing and confirmation. */
import {SurfacePlacementController} from "Surface Placement.lspkg/Scripts/SurfacePlacementController"
import {PlacementInteraction, PlacementMode, PlacementSettings} from "Surface Placement.lspkg/Scripts/PlacementSettings"
import {AtrophyMain} from "./AtrophyMain"
import {AtrophySliceFocus} from "./AtrophySliceFocus"
import {ATROPHY_LAYOUT, layoutAtrophySet} from "./AtrophyLayout"
import {TRAVEL_WIDTH_CM} from "./AtrophyTravelPath"

@component
export class AtrophyPlacement extends BaseScriptComponent {
  @input sceneSet!: SceneObject
  @input main!: AtrophyMain
  @input focus!: AtrophySliceFocus

  placed = false
  placements = 0
  lastPosition = vec3.zero()
  private surface!: SurfacePlacementController

  /** Keep the surviving table content behind the reticle, with the same front-edge margin. */
  get placementContactLocal(): vec3 {
    const middle = (this.main.subjectAnchor.getTransform().getLocalPosition().x + this.main.commonAnchor.getTransform().getLocalPosition().x) / 2
    const arcFront = this.sceneSet.getTransform().getInvertedWorldTransform().multiplyPoint(this.main.travelAt(0.5).position).z + TRAVEL_WIDTH_CM / 2
    return new vec3(middle, 0, arcFront + ATROPHY_LAYOUT.placementMargin)
  }

  onAwake(): void {
    if (!this.sceneSet || !this.main) throw new Error("Atrophy Placement: wire the whole Scene set and Main")
    layoutAtrophySet(this.sceneSet)
    this.createEvent("OnStartEvent").bind(() => {
      this.surface = SurfacePlacementController.getInstance()
      // Let every authored child initialize before hiding the set; clinicians can finish downloading while hidden.
      const start = this.createEvent("DelayedCallbackEvent")
      start.bind(() => this.startPlacement())
      start.reset(0)
    })
    this.createEvent("OnDisableEvent").bind(() => { if (this.surface) this.surface.stopSurfacePlacement() })
    this.createEvent("OnDestroyEvent").bind(() => { if (this.surface) this.surface.stopSurfacePlacement() })
  }

  private startPlacement(): void {
    this.placed = false
    this.main.preparePlacement()
    this.focus.close()
    this.sceneSet.enabled = false
    const settings = new PlacementSettings(PlacementMode.HORIZONTAL, false, undefined, null, PlacementInteraction.PINCH_OR_TAP)
    this.surface.startSurfacePlacement(settings, (position, rotation) => {
      this.lastPosition = position
      this.sceneSet.getTransform().setWorldRotation(rotation)
      this.sceneSet.getTransform().setWorldPosition(position.sub(rotation.multiplyVec3(this.placementContactLocal.scale(this.sceneSet.getTransform().getWorldScale()))))
      this.placements++
      this.placed = true
      this.sceneSet.enabled = true
      console.log(`Atrophy Placement ${this.placements}: surface (${position.x.toFixed(4)}, ${position.y.toFixed(4)}, ${position.z.toFixed(4)}) cm; whole Scene set`)
    })
  }
}
