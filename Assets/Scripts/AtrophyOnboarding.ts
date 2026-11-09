/** Official translucent gesture guide; capture clocks sample it without changing the live loop. */
import {HandHintsController} from "Surface Placement.lspkg/Scripts/HandHintsController"
import {AtrophyMain} from "./AtrophyMain"
import {ATROPHY_LAYOUT} from "./AtrophyLayout"
import {obj} from "./AtrophyLayoutUI"

@component
export class AtrophyOnboarding extends BaseScriptComponent {
  @input main!: AtrophyMain
  @input handPrefab!: ObjectPrefab
  hand!: SceneObject
  private hint!: HandHintsController
  private anchor!: SceneObject
  private player!: AnimationPlayer
  private captureClock?: {phase: number, started: number, clipTime: number, speed: number, anchor: vec3}

  onAwake(): void {
    this.createEvent("OnStartEvent").bind(() => {
      this.anchor = obj(this.sceneObject, "OnboardingHandPath")
      this.anchor.getTransform().setLocalScale(vec3.one().uniformScale(0.7))
      this.hand = this.handPrefab.instantiate(this.sceneObject)
      this.hand.name = "OnboardingHand"
      this.hint = this.hand.getComponent(HandHintsController.getTypeName()) as HandHintsController
      this.hint.enableHint(this.anchor.getTransform())
      this.hint.playFarPinch()
      this.player = this.hand.getComponent("Component.AnimationPlayer") as AnimationPlayer
    })
    this.createEvent("UpdateEvent").bind(() => this.updateHint())
  }

  private updateHint(): void {
    if (!this.hand) return
    this.hand.enabled = !this.main.hasDragged
    if (this.main.hasDragged) return
    const phase = this.captureClock?.phase ?? getTime() % 4
    this.anchor.getTransform().setWorldPosition(this.anchorAt(phase))
    this.anchor.getTransform().setWorldRotation(this.main.getTransform().getWorldRotation())
  }

  private anchorAt(phase: number): vec3 {
    const progress = Math.max(0, Math.min(1, (phase - 1) / 2))
    const rise = this.main.getTransform().getWorldTransform().multiplyDirection(vec3.up().uniformScale(ATROPHY_LAYOUT.onboardingHeight))
    return this.main.travelAt(progress * 0.75).position.add(rise)
  }

  /** Balance with releaseCaptureClock after one six-tile snapshot, including on failure. */
  lockCaptureClock(phase: number): void {
    if (this.captureClock) throw new Error("Onboarding capture clock is already locked")
    if (!Number.isFinite(phase) || phase < 0 || phase >= 4) throw new Error("Onboarding capture phase must be in [0,4) seconds")
    const clip = this.player.getClip("Pinch_Far")
    if (!(clip.duration > 0)) throw new Error("Native Pinch_Far animation has no duration")
    this.captureClock = {phase, started: getTime(), clipTime: this.player.getClipCurrentTime("Pinch_Far"), speed: clip.playbackSpeed, anchor: this.anchorAt(phase)}
    clip.playbackSpeed = 0
    this.player.playClipAt("Pinch_Far", phase % clip.duration)
    this.player.forceUpdate(0)
    this.updateHint()
  }

  releaseCaptureClock(): void {
    const clock = this.captureClock
    if (!clock) throw new Error("Onboarding capture clock is not locked")
    const clip = this.player.getClip("Pinch_Far")
    clip.playbackSpeed = clock.speed
    this.player.playClipAt("Pinch_Far", (clock.clipTime + (getTime() - clock.started) * clock.speed) % clip.duration)
    this.captureClock = undefined
    this.updateHint()
  }

  captureSnapshot() {
    const anchor = this.anchor.getTransform().getWorldPosition(), hand = this.hand.getTransform().getWorldPosition()
    const clip = this.player.getClip("Pinch_Far")
    return {phase_seconds: this.captureClock?.phase ?? null, clip_seconds: this.player.getClipCurrentTime("Pinch_Far"),
      clip_duration: clip.duration, playback_speed: clip.playbackSpeed, hand_enabled: this.hand.enabled,
      anchor_position: [anchor.x, anchor.y, anchor.z], hand_position: [hand.x, hand.y, hand.z],
      locked_anchor_position: this.captureClock ? [this.captureClock.anchor.x, this.captureClock.anchor.y, this.captureClock.anchor.z] : null,
      restore_playback_speed: this.captureClock?.speed ?? null}
  }
}
