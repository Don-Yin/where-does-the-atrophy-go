/** Capture-only native clock checks; the live onboarding loop is restored on release. */
import {ScenarioConfig} from "Leaf.lspkg/Scenarios/scenario/ScenarioConfig"
import {expect} from "Leaf.lspkg/Utils/common/Expect"
import {findSceneObjectByName, sleep} from "Leaf.lspkg/Utils/common/Utils"
import {AtrophyOnboarding} from "./AtrophyOnboarding"
import {AtrophyClinicians} from "./AtrophyClinicians"
import {Billboard} from "InteractionKit.lspkg/Components/Interaction/Billboard/Billboard"
import {scheduleNativeMatte} from "./AtrophyNativeCapture"

type CapturePose = {group: AtrophyClinicians; billboards: {component: Billboard; axes: boolean[]}[]}
let lockedPose: CapturePose | undefined

export async function onboardingCapture(config: ScenarioConfig): Promise<void> {
  const action = config.getOrThrow("capture_action"), phase = Number(config.getOrThrow("capture_phase_seconds"))
  if (action === "render-png") {
    if (!lockedPose) throw new Error("Native RenderTarget export requires a locked native pose")
    const owner = findSceneObjectByName("AtrophyOnboarding").getComponent(AtrophyOnboarding.getTypeName()) as AtrophyOnboarding
    scheduleNativeMatte(owner, config.getOrThrow("capture_tile"), config.getOrThrow("capture_transaction"))
    return
  }
  // A camera rotation does not move the seated eye. Retain native settled transforms
  // exactly while capturing its six views and black/white pair, then resume live tracking.
  if (action === "pose-lock") {
    if (lockedPose) throw new Error("The native capture pose is already locked")
    const root = findSceneObjectByName("AtrophyExperience")
    const billboards = (root.getComponentsInDescendants(Billboard.getTypeName(), false, true) as Billboard[])
      .map(component => ({component, axes: [component.xAxisEnabled, component.yAxisEnabled, component.zAxisEnabled]}))
    const group = findSceneObjectByName("Clinicians").getComponent(AtrophyClinicians.getTypeName()) as AtrophyClinicians
    group.lockCapturePose()
    billboards.forEach(({component}) => { component.xAxisEnabled = component.yAxisEnabled = component.zAxisEnabled = false })
    lockedPose = {group, billboards}
    console.log(`Atrophy native exact pose locked: ${billboards.length} settled native billboards and three clinicians`)
    return
  }
  if (action === "pose-release") {
    if (!lockedPose) throw new Error("The native capture pose is not locked")
    lockedPose.billboards.forEach(({component, axes}) => {
      [component.xAxisEnabled, component.yAxisEnabled, component.zAxisEnabled] = axes
    })
    lockedPose.group.releaseCapturePose()
    console.log(`Atrophy native exact pose released: ${lockedPose.billboards.length} native billboards and gaze/speech clocks restored`)
    lockedPose = undefined
    return
  }
  const hint = findSceneObjectByName("AtrophyOnboarding").getComponent(AtrophyOnboarding.getTypeName()) as AtrophyOnboarding
  const check = () => {
    const state = hint.captureSnapshot()
    expect(state.phase_seconds).toBe(phase)
    expect(state.playback_speed).toBe(0)
    expect(state.clip_seconds).toBeCloseTo(phase % state.clip_duration, 5)
    expect(state.hand_enabled).toBe(true)
    expect(state.locked_anchor_position).toBeTruthy()
    if (!state.locked_anchor_position) throw new Error("Native hint capture clock has no anchor")
    state.anchor_position.forEach((value, i) => {
      expect(value).toBeCloseTo(state.locked_anchor_position![i], 4)
      expect(state.hand_position[i]).toBeCloseTo(value, 3)
    })
    return state
  }
  if (action === "lock") {
    hint.lockCaptureClock(phase)
    const before = hint.captureSnapshot()
    await sleep(900)
    const after = check()
    expect(after.clip_seconds).toBeCloseTo(before.clip_seconds, 5)
  } else if (action === "check") check()
  else if (action === "release") {
    const before = hint.captureSnapshot()
    hint.releaseCaptureClock()
    const resumed = hint.captureSnapshot()
    await sleep(250)
    const after = hint.captureSnapshot()
    expect(before.phase_seconds).toBe(phase)
    expect(after.phase_seconds).toBe(null)
    expect(after.playback_speed).toBe(before.restore_playback_speed)
    if (after.hand_enabled) expect((after.clip_seconds - resumed.clip_seconds + after.clip_duration) % after.clip_duration).toBeGreaterThan(0.05)
  } else throw new Error(`Unknown native hint capture action: ${action}`)
  console.log(`Atrophy native hint capture ${action} tile ${config.getOrThrow("capture_tile")}: ${JSON.stringify(hint.captureSnapshot())}`)
}
