/** Coordinates the one continuous interaction. The brain handle emits drag events; this is the
 * sole owner of morph state and middle-brain visibility/translation.
 * The placed root owns the shared table frame. It must not build UI or alter scan data.
 */
import {Interactable} from "InteractionKit.lspkg/Components/Interaction/Interactable/Interactable"
import {DragInteractorEvent} from "InteractionKit.lspkg/Core/Interactor/InteractorEvent"
import {AtrophyBrainController} from "./AtrophyBrainController"
import {ENDPOINT_EPSILON} from "./AtrophyData"
import {buildTravelPathMesh, sampleTravelArc, TravelPathMesh, TravelSample} from "./AtrophyTravelPath"

@component
export class AtrophyMain extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">Where Does the Atrophy Go? – interaction</span>')
  @ui.group_start("References")
  @input
  @hint("Pinch target on the carried brain (collider + Interactable); Main moves it with the morph")
  brainHandle!: Interactable
  @input
  @hint("Controller on the translating/morphing brain")
  morphBrain!: AtrophyBrainController
  @input
  @hint("Authored subject-space brain root / translation endpoint")
  subjectAnchor!: SceneObject
  @input
  @hint("Authored common-space brain root / translation endpoint")
  commonAnchor!: SceneObject
  @input
  @hint("Authored dashed guide on the table; its mesh is built from the shared travel arc once at startup")
  travelPath!: RenderMeshVisual
  @ui.group_end
  @ui.group_start("Settings")
  @input
  @hint("Seconds to follow a drag smoothly; the endpoint settles exactly")
  @widget(new SliderWidget(0.02, 0.3, 0.01))
  followSeconds: number = 0.08
  @ui.group_end

  private targetWeight = 0
  private currentWeight = 0
  private ready = false
  travelGeometry!: TravelPathMesh
  hasDragged = false
  placementVersion = 0
  /** Inspect arbitrates a stationary long pinch versus a moving short pinch; Main still owns all morph state. */
  allowMorphDrag: (event: DragInteractorEvent) => boolean = () => true
  handleDetached = false

  onAwake(): void {
    this.createEvent("OnStartEvent").bind(() => {
      if (!this.brainHandle || !this.morphBrain || !this.subjectAnchor || !this.commonAnchor || !this.travelPath) {
        throw new Error("Atrophy: required scene inputs are not wired")
      }
      const inGuide = this.travelPath.getTransform().getInvertedWorldTransform()
      this.travelGeometry = buildTravelPathMesh(
        inGuide.multiplyPoint(this.subjectAnchor.getTransform().getWorldPosition()),
        inGuide.multiplyPoint(this.commonAnchor.getTransform().getWorldPosition()),
      )
      this.travelPath.mesh = this.travelGeometry.mesh
      this.brainHandle.onDragStart.add((event) => this.pull(event))
      this.brainHandle.onDragUpdate.add((event) => this.pull(event))
      // Do not disable the middle root until all child OnStart events ran.
      this.ready = true
      console.log("Atrophy ready: P0006, pinch-drag brain, two endpoints, seven slices per space")
    })
    this.createEvent("UpdateEvent").bind(() => {
      if (!this.ready) return
      const factor = 1 - Math.exp(-getDeltaTime() / this.followSeconds)
      this.currentWeight += (this.targetWeight - this.currentWeight) * factor
      if (Math.abs(this.targetWeight - this.currentWeight) < ENDPOINT_EPSILON) this.currentWeight = this.targetWeight
      this.applyMorph()
    })
  }

  /** 1 cm of hand travel along the current arc tangent moves the brain 1 cm; weight is normalized arc distance. */
  private pull(event: DragInteractorEvent): void {
    if (!this.allowMorphDrag(event)) return
    const hand = event.planecastDragVector
    if (!hand) return
    const sample = this.travelAt(this.targetWeight)
    const along = hand.dot(sample.tangent)
    // A ray parallel to the drag plane yields no finite point this frame.
    if (!Number.isFinite(along)) return
    this.requestMorphWeight(this.targetWeight + along / sample.length)
  }

  /** The brain emits intent; only Main clamps, records interaction and applies the smoothed morph. */
  private requestMorphWeight(weight: number): void {
    if (!Number.isFinite(weight)) throw new Error("Atrophy: morph intent must be finite")
    const target = Math.max(0, Math.min(1, weight))
    if (Math.abs(target - this.targetWeight) > 0.00001) this.hasDragged = true
    this.targetWeight = target
  }

  private applyMorph(): void {
    const root = this.morphBrain.sceneObject
    const position = this.travelAt(this.currentWeight).position
    root.getTransform().setWorldPosition(position)
    // The handle stays enabled at the endpoints, when the morph root is hidden.
    if (!this.handleDetached) this.brainHandle.getTransform().setWorldPosition(position)
    root.enabled = this.currentWeight > ENDPOINT_EPSILON && this.currentWeight < 1 - ENDPOINT_EPSILON
    this.morphBrain.setWeight(this.currentWeight)
  }

  /** Shared world-space sample for the brain, drag driver and LEAF assertions, in the authored table plane. */
  travelAt(weight: number): TravelSample {
    return sampleTravelArc(this.subjectAnchor.getTransform().getWorldPosition(), this.commonAnchor.getTransform().getWorldPosition(), weight, this.getTransform().up)
  }

  /** Prepare the initial Placement; dragging home does not restart onboarding or create another morph owner. */
  preparePlacement(): void {
    this.targetWeight = this.currentWeight = 0
    this.hasDragged = false
    this.placementVersion++
    if (this.ready) this.applyMorph()
  }

  get morphWeight(): number { return this.currentWeight }
  get intendedWeight(): number { return this.targetWeight }
}
