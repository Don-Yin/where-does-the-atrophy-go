/** A stationary long pinch lifts a snapshot. SIK owns its translation/rotation/two-hand scale; Main owns the table morph. */
import {Interactable} from "InteractionKit.lspkg/Components/Interaction/Interactable/Interactable"
import {InteractableManipulation} from "InteractionKit.lspkg/Components/Interaction/InteractableManipulation/InteractableManipulation"
import {DragInteractorEvent} from "InteractionKit.lspkg/Core/Interactor/InteractorEvent"
import StateMachine from "InteractionKit.lspkg/Utils/StateMachine"
import {AtrophyBrainController} from "./AtrophyBrainController"
import {AtrophyMain} from "./AtrophyMain"
import {ENDPOINT_EPSILON} from "./AtrophyData"
import {obj} from "./AtrophyLayoutUI"

export const INSPECT_HOLD_SECONDS = 0.5
export const INSPECT_DRAG_SLOP_CM = 0.8
const RETURN_SECONDS = 0.45

type Grip = {
  handle: Interactable
  manipulation: InteractableManipulation
  source: () => AtrophyBrainController
  down: boolean
  started: number
  distance: number
  dragging: boolean
  copy?: SceneObject
  returning: number
  returnPosition: vec3
  returnRotation: quat
  returnScale: vec3
  weight: number
  warp: boolean
  homeRotation: quat
  homeScale: vec3
}

@component
export class AtrophyInspect extends BaseScriptComponent {
  @input main!: AtrophyMain
  @input subject!: AtrophyBrainController
  @input common!: AtrophyBrainController

  private grips: Grip[] = []
  private poseEvent!: SceneEvent
  private get activeGrip(): Grip | undefined { return this.grips.find((grip) => grip.copy) }
  get activeCopy(): SceneObject | undefined { return this.activeGrip?.copy }
  get activeSource(): AtrophyBrainController | undefined { return this.activeGrip?.source() }
  get snapshotWeight(): number { return this.activeGrip?.weight ?? -1 }
  get snapshotWarp(): boolean { return this.activeGrip?.warp ?? false }

  onAwake(): void {
    this.createEvent("OnStartEvent").bind(() => {
      const endpoint = (name: string, brain: AtrophyBrainController): Interactable => {
        const root = obj(this.sceneObject, name)
        root.getTransform().setWorldTransform(brain.getTransform().getWorldTransform())
        const collider = root.createComponent("Physics.ColliderComponent") as ColliderComponent
        const shape = Shape.createBoxShape()
        shape.size = new vec3(19, 16.5, 16)
        collider.shape = shape
        const handle = root.createComponent(Interactable.getTypeName()) as Interactable
        handle.enableInstantDrag = true
        return handle
      }
      const carried = () => this.main.morphWeight <= ENDPOINT_EPSILON ? this.subject :
        this.main.morphWeight >= 1 - ENDPOINT_EPSILON ? this.common : this.main.morphBrain
      this.grips = [
        this.bind(this.main.brainHandle, carried),
        this.bind(endpoint("SubjectInspectHandle", this.subject), () => this.subject),
        this.bind(endpoint("CommonInspectHandle", this.common), () => this.common),
      ]
      this.main.allowMorphDrag = (event) => this.morphDrag(event)
      console.log("Atrophy Inspect ready: stationary 0.5 s pinch, SIK manipulation, return on release")
    })
    this.poseEvent = this.createEvent("UpdateEvent")
    this.poseEvent.bind(() => this.grips.forEach((grip, index) => this.update(grip, index)))
    this.createEvent("OnDisableEvent").bind(() => this.clear())
  }

  /** Capture-only atomic GPU readback pause; never rewrites a transform or the return clock. */
  pauseNativeReadbacks(captureMode: boolean) {
    if (!captureMode) throw new Error("Inspect readback pause requires native capture mode")
    const grip = this.activeGrip
    if (!grip) return {before: {active: false}, object_identifiers: [],
      restore: () => ({after: {active: false}, restore_ok: true})}
    if (grip.returning < 0 && (!grip.down || !grip.manipulation.isManipulating())) throw new Error("Inspect readback requires the original active native hold or return")
    // Read the existing SIK clock owner, then use its public event enabled flags.
    // Toggling manipulation capabilities instead would end the hold and reset its filters.
    const machine = Reflect.get(grip.manipulation, "state")?.stateMachine as StateMachine
    if (!machine?.updateEvent || !machine.lateUpdateEvent) throw new Error("Active SIK manipulation has no native capture clocks")
    const events = [this.poseEvent, machine.updateEvent, machine.lateUpdateEvent]
    const read = () => ({active: true, event_enabled: events.map(event => event.enabled),
      held: grip.down, returning: grip.returning, triggering_interactor: grip.handle.triggeringInteractor,
      manipulating: grip.manipulation.isManipulating(), state: machine.currentState.name,
      elapsed_seconds: machine.currentState.stateElapsedTime, started_seconds: machine.currentState.stateStartTime,
      capabilities: [grip.manipulation.canTranslate(), grip.manipulation.canRotate(), grip.manipulation.canScale()]})
    const before = read()
    if (before.event_enabled.some(value => typeof value !== "boolean")) throw new Error("Inspect capture clocks have no comparable enabled state")
    const restore = () => {
      events.forEach((event, i) => { event.enabled = before.event_enabled[i] })
      const after = read(), restore_ok = JSON.stringify(before) === JSON.stringify(after)
      if (!restore_ok) throw new Error(`Inspect clock restoration is not identical: ${JSON.stringify({before, after})}`)
      return {after, restore_ok}
    }
    try {
      events.forEach(event => { event.enabled = false })
      if (events.some(event => event.enabled !== false)) throw new Error("Inspect capture clock pause did not read back")
    } catch (error) {
      try { restore() } catch (rollback) { throw new Error(`${String(error)}; pause rollback failed: ${String(rollback)}`) }
      throw error
    }
    return {before, object_identifiers: [grip.handle.sceneObject.uniqueIdentifier, grip.copy.uniqueIdentifier], restore}
  }

  private bind(handle: Interactable, source: () => AtrophyBrainController): Grip {
    handle.allowMultipleInteractors = true
    const manipulation = handle.sceneObject.createComponent(InteractableManipulation.getTypeName()) as InteractableManipulation
    manipulation.minimumScaleFactor = 0.5
    manipulation.maximumScaleFactor = 2.5
    manipulation.enableStretchZ = false
    manipulation.setNewInteractable(handle)
    const grip: Grip = {handle, source, manipulation, down: false, started: 0, distance: 0, dragging: false,
      returning: -1, returnPosition: vec3.zero(), returnRotation: quat.quatIdentity(), returnScale: vec3.one(), weight: 0, warp: false,
      homeRotation: handle.getTransform().getLocalRotation(), homeScale: handle.getTransform().getLocalScale()}
    this.capabilities(grip, false)
    handle.onTriggerStart.add(() => {
      if (grip.copy) return
      grip.down = true
      grip.started = getTime()
      grip.distance = 0
      grip.dragging = false
    })
    const released = () => { if (handle.triggeringInteractor === 0) this.release(grip) }
    handle.onTriggerEnd.add(released)
    handle.onTriggerEndOutside.add(released)
    handle.onTriggerCanceled.add(released)
    return grip
  }

  /** A moving pinch commits to the original morph until release, even if that drag lasts longer than the hold threshold. */
  private morphDrag(event: DragInteractorEvent): boolean {
    const grip = this.grips[0]
    if (!grip || !grip.down) return !grip?.copy
    if (grip.copy) return false
    if (!grip.dragging) {
      grip.distance += event.planecastDragVector?.length ?? 0
      grip.dragging = grip.distance >= INSPECT_DRAG_SLOP_CM
    }
    // Pending short pinches still move the morph immediately; the slop only decides whether a held pinch may lift.
    return true
  }

  private capabilities(grip: Grip, enabled: boolean): void {
    // Manipulation's sticky/filtered pinch is for the lifted copy, not the original morph drag.
    grip.handle.keepHoverOnTrigger = enabled
    grip.handle.useFilteredPinch = enabled
    grip.manipulation.setCanTranslate(enabled)
    grip.manipulation.setCanRotate(enabled)
    grip.manipulation.setCanScale(enabled)
  }

  private update(grip: Grip, index: number): void {
    const hadCopy = !!grip.copy
    const source = grip.source().getTransform()
    if (grip.down && !grip.dragging && !grip.copy && getTime() - grip.started >= INSPECT_HOLD_SECONDS) {
      const brain = grip.source()
      grip.copy = brain.inspectCopy(this.sceneObject)
      grip.weight = brain.morphWeight
      grip.warp = brain.warpEnabled
      const transform = grip.copy.getTransform()
      transform.setWorldPosition(source.getWorldPosition().add(this.main.getTransform().up.uniformScale(8)))
      grip.manipulation.setManipulateRoot(transform)
      if (index === 0) this.main.handleDetached = true
      this.capabilities(grip, true)
      console.log(`Atrophy Inspect lifted ${brain.sceneObject.name}: w=${grip.weight.toFixed(9)}, warp=${grip.warp}`)
    }
    if (grip.copy && grip.returning >= 0) {
      const t = Math.min(1, (getTime() - grip.returning) / RETURN_SECONDS), ease = t * t * (3 - 2 * t)
      const transform = grip.copy.getTransform()
      transform.setWorldPosition(vec3.lerp(grip.returnPosition, source.getWorldPosition(), ease))
      transform.setWorldRotation(quat.slerp(grip.returnRotation, source.getWorldRotation(), ease))
      transform.setWorldScale(vec3.lerp(grip.returnScale, source.getWorldScale(), ease))
      if (t === 1) {
        grip.copy.destroy()
        grip.copy = undefined
        grip.returning = -1
        if (index === 0) this.main.handleDetached = false
      }
    }
    // Leave Main's original handle transform completely alone outside Inspect (including its drag-plane basis).
    if (grip.copy) grip.handle.getTransform().setWorldTransform(grip.copy.getTransform().getWorldTransform())
    else if (index > 0 || hadCopy) this.restoreHandle(grip)
    // The moving handle already covers a static endpoint when close: avoid coincident targets.
    if (index > 0) grip.handle.enabled = !!grip.copy || source.getWorldPosition().distance(this.main.travelAt(this.main.morphWeight).position) > 0.01
  }

  private release(grip: Grip): void {
    grip.down = grip.dragging = false
    this.capabilities(grip, false)
    if (!grip.copy || grip.returning >= 0) return
    grip.returning = getTime()
    const transform = grip.copy.getTransform()
    grip.returnPosition = transform.getWorldPosition()
    grip.returnRotation = transform.getWorldRotation()
    grip.returnScale = transform.getWorldScale()
  }

  private restoreHandle(grip: Grip): void {
    const transform = grip.handle.getTransform()
    transform.setWorldPosition(grip.source().getTransform().getWorldPosition())
    // The brain's authored yaw differs from the drag handle's plane. Restore the handle's own basis, not the brain's.
    transform.setLocalRotation(grip.homeRotation)
    transform.setLocalScale(grip.homeScale)
  }

  private clear(): void {
    this.grips.forEach((grip) => {
      this.capabilities(grip, false)
      if (grip.copy) {
        grip.copy.destroy()
        this.restoreHandle(grip)
      }
      grip.copy = undefined
      grip.down = grip.dragging = false
      grip.returning = -1
    })
    if (this.main) this.main.handleDetached = false
  }
}
