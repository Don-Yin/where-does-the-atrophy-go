/** Shared LEAF helper for the one drag flow. Drives real SIK drag events on the brain handle,
 * not controller setters. Scene names come from the authored roots.
 */
import {DefaultLeafInteractor} from "Leaf.lspkg/Interactors/interactor/DefaultLeafInteractor"
import {findInteractableByName} from "Leaf.lspkg/Interactors/InteractableUtils"
import {findSceneObjectByName, nextFrame, sleep, waitUntil} from "Leaf.lspkg/Utils/common/Utils"
import {Interactable} from "InteractionKit.lspkg/Components/Interaction/Interactable/Interactable"
import {InteractorTriggerType, TargetingMode} from "InteractionKit.lspkg/Core/Interactor/Interactor"
import {AtrophyMain} from "./AtrophyMain"
import {INSPECT_DRAG_SLOP_CM} from "./AtrophyInspect"

export function main(): AtrophyMain {
  return findSceneObjectByName("AtrophyExperience").getComponent(AtrophyMain.getTypeName()) as AtrophyMain
}

export class AtrophyLeafInteractor extends DefaultLeafInteractor {
  /** Sustained direct SIK input for Inspect: control the simulated hand, never the manipulated object. */
  async pinchHold(target: Interactable, offset = vec3.zero()): Promise<void> {
    this.eventTimeoutMs = 5000
    this.targetingMode = TargetingMode.Direct
    // onHoverEnter is aggregate (it does not fire for the second hand); target this hand and let SIK dispatch its native per-interactor event.
    await this.setTarget(target)
    await nextFrame()
    this.endPoint = target.getTransform().getWorldPosition().add(offset)
    this.startPoint = this.endPoint.add(new vec3(0, 0, 5))
    await nextFrame()
    this.setTriggerType(InteractorTriggerType.Select)
    await sleep(100)
  }

  async moveHeld(delta: vec3, milliseconds = 400): Promise<void> {
    const step = delta.uniformScale(0.1)
    for (let i = 0; i < 10; i++) {
      this.startPoint = this.startPoint.add(step)
      this.endPoint = this.endPoint.add(step)
      await sleep(milliseconds / 10)
    }
  }

  async turnHeld(rotation: quat): Promise<void> {
    this.startPoint = this.endPoint.add(rotation.multiplyVec3(this.startPoint.sub(this.endPoint)))
    await sleep(400)
  }

  async releaseHeld(): Promise<void> {
    this.setTriggerType(InteractorTriggerType.None)
    await nextFrame()
    await this.exitHover()
    this.targetingMode = TargetingMode.Indirect
  }

  /** cmPerFrame caps hand speed; ms is the planned travel time, not a fixed frame budget. */
  async dragTo(value: number, cmPerFrame = 0.6, ms = 700, tolerance = 0.018): Promise<void> {
    const handle = findInteractableByName("BrainHandle"), flow = main()
    const length = flow.travelAt(0).length, origin = flow.intendedWeight, error = value - origin
    const endStop = value <= 0 || value >= 1, limit = endStop ? 0 : tolerance
    if (Math.abs(error) > limit) {
      const direction = Math.sign(error), share = Math.abs(error) + (endStop ? 0.1 : 0)
      const duration = share * length < INSPECT_DRAG_SLOP_CM ? Math.min(ms, 300) : ms
      this.eventTimeoutMs = 5000
      await this.enterHover(handle)
      await nextFrame()
      const started = getTime()
      this.setTriggerType(InteractorTriggerType.Select)
      const frames: {elapsed_ms: number; delta_ms: number; intended_weight: number}[] = []
      try {
        // Keep one real SIK pinch until the observed target is reached, even when GPU work costs frames.
        await waitUntil(() => {
          const elapsed = (getTime() - started) * 1000
          frames.push({elapsed_ms: elapsed, delta_ms: getDeltaTime()*1000, intended_weight: flow.intendedWeight})
          if (elapsed >= duration && Math.abs(value - flow.intendedWeight) <= limit) return true
          const progress = Math.min(1, (elapsed + getDeltaTime() * 1000) / duration)
          const planned = origin + direction * share * progress
          const remaining = Math.max(0, direction * (planned - flow.intendedWeight) * length)
          const step = direction * Math.min(cmPerFrame, remaining)
          const delta = flow.travelAt(flow.intendedWeight).tangent.uniformScale(step)
          this.overrideDragVector = delta
          this.startPoint = this.startPoint.add(delta)
          this.endPoint = this.endPoint.add(delta)
          return false
        // The explicit per-frame speed cap also bounds the required frame count. Allow a 5 fps Preview to deliver it.
         }, Math.max(5000, duration + 3000, share * length / cmPerFrame * 200 + 3000), () => `Brain drag did not reach ${value}: intent=${flow.intendedWeight}`)
      } catch (error) {
        console.log("Atrophy LEAF drag per-frame timing: " + JSON.stringify({from: origin, to: value, error: String(error),
          frames: frames.map(frame => ({...frame, fps: frame.delta_ms > 0 ? 1000/frame.delta_ms : null}))}))
        throw error
      } finally {
        this.setTriggerType(InteractorTriggerType.None)
        this.overrideDragVector = undefined
        await nextFrame()
        await this.exitHover()
      }
    }
    await waitUntil(() => Math.abs(flow.morphWeight - flow.intendedWeight) < 0.00001, 3000,
      () => `Brain drag did not settle: intent=${flow.intendedWeight}, observed=${flow.morphWeight}`)
  }
}
