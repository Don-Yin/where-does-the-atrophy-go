/** Inspect regression uses real SIK held-hand input; assertions read transforms, FileMesh references and uniforms only. */
import {expect} from "Leaf.lspkg/Utils/common/Expect"
import {findSceneObjectByName, sleep, waitUntil} from "Leaf.lspkg/Utils/common/Utils"
import {findInteractableByName} from "Leaf.lspkg/Interactors/InteractableUtils"
import {InteractorInputType} from "InteractionKit.lspkg/Core/Interactor/Interactor"
import {InteractableManipulation} from "InteractionKit.lspkg/Components/Interaction/InteractableManipulation/InteractableManipulation"
import {AtrophyInspect} from "./AtrophyInspect"
import {AtrophyBrainController} from "./AtrophyBrainController"
import {AtrophyLeafInteractor, main} from "./AtrophyLeafInteractor"
import {MORPH_TARGET} from "./AtrophyData"

export async function inspectCopies(): Promise<void> {
  const flow = main(), inspector = flow.sceneObject.getComponent(AtrophyInspect.getTypeName()) as AtrophyInspect
  const driver = new AtrophyLeafInteractor()
  await driver.dragTo(0.5, 0.6, 700, 0.001)
  expect(flow.morphWeight).toBeCloseTo(0.5, 2)
  expect(inspector.activeCopy).toBe(undefined) // long moving drags must not turn into Inspect
  const right = new AtrophyLeafInteractor("InspectRight"), left = new AtrophyLeafInteractor("InspectLeft")
  right.inputType = InteractorInputType.RightHand
  left.inputType = InteractorInputType.LeftHand
  const brains = ["Subject", "Common", "Morph"].map((side) => findSceneObjectByName(`${side}Brain`).getComponent(AtrophyBrainController.getTypeName()) as AtrophyBrainController)
  const unchanged = brains.map((brain) => brain.getTransform().getWorldTransform())
  const handleBasis = flow.brainHandle.getTransform().getLocalRotation()
  const handleScale = flow.brainHandle.getTransform().getLocalScale()
  for (const [index, name] of ["SubjectInspectHandle", "CommonInspectHandle", "BrainHandle"].entries()) {
    const target = findInteractableByName(name), brain = brains[index]
    const weight = flow.morphWeight, intended = flow.intendedWeight
    const manipulation = target.sceneObject.getComponent(InteractableManipulation.getTypeName()) as InteractableManipulation
    await right.pinchHold(target)
    await sleep(180)
    expect(inspector.activeCopy).toBe(undefined) // no early lift
    await waitUntil(() => inspector.activeCopy !== undefined, 1500,
      () => `Inspect did not lift ${name} after the native hold threshold`)
    const copy = inspector.activeCopy
    expect(copy).toBeTruthy()
    if (!copy) throw new Error(`Inspect did not lift ${name}`)
    expect(inspector.activeSource.sceneObject.isSame(brain.sceneObject)).toBe(true)
    expect(inspector.snapshotWeight).toBeCloseTo(brain.morphWeight, 5)
    expect(inspector.snapshotWarp).toBe(brain.warpEnabled)
    expect(manipulation.getManipulateRoot().getSceneObject().isSame(copy)).toBe(true)
    expect(manipulation.isManipulating()).toBe(true)
    const cortex = findSceneObjectByName("InspectCortex", copy).getComponentInDescendants("Component.RenderMeshVisual", false, true) as RenderMeshVisual
    const original = brain.cortex.getComponentInDescendants("Component.RenderMeshVisual", false, true) as RenderMeshVisual
    expect(cortex.mesh.isSame(original.mesh)).toBe(true)
    expect(cortex.getMaterial(1).isSame(original.getMaterial(1))).toBe(false)
    if (brain.cortexMorphs) expect(cortex.getBlendShapeWeight(MORPH_TARGET)).toBeCloseTo(brain.morphWeight, 5)
    if (brain.warpEnabled) expect(cortex.getMaterial(1).mainPass.vertexColorWeight).toBeCloseTo(brain.morphWeight, 5)
    const transform = copy.getTransform(), lifted = transform.getWorldPosition()
    expect(lifted.sub(brain.getTransform().getWorldPosition()).dot(flow.getTransform().up)).toBeGreaterThan(6)
    await right.moveHeld(new vec3(0, 15, 12))
    expect(transform.getWorldPosition().distance(lifted)).toBeGreaterThan(10)
    const beforeTurn = transform.getWorldRotation()
    await right.turnHeld(quat.fromEulerAngles(0.4, 0.2, 0))
    expect(quat.angleBetween(beforeTurn, transform.getWorldRotation())).toBeGreaterThan(0.1)
    const beforeScale = transform.getWorldScale().x
    await left.pinchHold(target, new vec3(-6, 0, 0))
    await sleep(150)
    await left.moveHeld(new vec3(-9, 0, 0))
    await sleep(250)
    expect(transform.getWorldScale().x).toBeGreaterThan(beforeScale * 1.08)
    expect(transform.getWorldScale().x).toBeLessThan(beforeScale * 2.51)
    await left.releaseHeld()
    await sleep(100)
    expect(inspector.activeCopy).toBeTruthy() // one hand still holds it
    expect(flow.morphWeight).toBeCloseTo(weight, 5)
    expect(flow.intendedWeight).toBeCloseTo(intended, 5)
    brains.forEach((item, i) => {
      expect(item.getTransform().getWorldPosition().distance(unchanged[i].multiplyPoint(vec3.zero()))).toBeLessThan(0.01)
    })
    await right.releaseHeld()
    await sleep(150)
    expect(inspector.activeCopy).toBeTruthy() // visible float-back, not an immediate destroy
    await waitUntil(() => inspector.activeCopy === undefined, 1500,
      () => `${name} copy did not return; triggering interactors=${target.triggeringInteractor}`)
    expect(inspector.activeCopy).toBe(undefined)
    expect(flow.handleDetached).toBe(false)
    expect(quat.angleBetween(flow.brainHandle.getTransform().getLocalRotation(), handleBasis)).toBeLessThan(0.001)
    expect(flow.brainHandle.getTransform().getLocalScale().distance(handleScale)).toBeLessThan(0.001)
    console.log(`Atrophy Inspect checked ${brain.sceneObject.name}: snapshot w=${brain.morphWeight.toFixed(9)}, warp=${brain.warpEnabled}; lift, translate, turn, two-hand scale, one-hand release, return; table unchanged`)
  }
  await driver.dragTo(0.7)
  expect(flow.morphWeight).toBeGreaterThan(0.65)
  expect(inspector.activeCopy).toBe(undefined)
}
