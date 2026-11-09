/** Parameterized done-criterion checks. Tests query observed Lens state and
 * use SIK/IK interaction; they do not rename objects or change domain code.
 */
import {Scenario} from "Leaf.lspkg/Scenarios/scenario/Scenario"
import {ScenarioConfig} from "Leaf.lspkg/Scenarios/scenario/ScenarioConfig"
import {expect} from "Leaf.lspkg/Utils/common/Expect"
import {findSceneObjectByName as object, sleep, waitUntil, withTimeout} from "Leaf.lspkg/Utils/common/Utils"
import {findInteractableByName} from "Leaf.lspkg/Interactors/InteractableUtils"
import {createIKInteractor} from "Leaf.lspkg/Interactors/interactor/ik/visualizer/BitmojiAvatar"
import {AtrophyClinicians, Clinician, CLINICIAN_IDLE_SECONDS, ENDING_LINE, ONBOARDING_LINE} from "./AtrophyClinicians"
import {AtrophyLeafInteractor, main} from "./AtrophyLeafInteractor"
import {MORPH_TARGET, REGION} from "./AtrophyData"
import {AtrophyBrainController} from "./AtrophyBrainController"
import {AtrophySlicesUI} from "./AtrophySlicesUI"
import {AtrophyPlacement} from "./AtrophyPlacement"
import {AtrophySliceFocus} from "./AtrophySliceFocus"
import {inspectCopies} from "./AtrophyLeafInspect"
import {onboardingCapture} from "./AtrophyLeafOnboarding"
import {captureRegionGeometry, checkGridDisplay, checkLayoutProjection} from "./AtrophyLeafRegions"
import {INSPECT_DRAG_SLOP_CM} from "./AtrophyInspect"
import {ATROPHY_LAYOUT} from "./AtrophyLayout"
import {Interactable} from "InteractionKit.lspkg/Components/Interaction/Interactable/Interactable"
import {TRAVEL_DASH_CM, TRAVEL_DASH_COUNT, TRAVEL_DASH_SEGMENTS, TRAVEL_HEIGHT_CM, TRAVEL_SAG, TRAVEL_WIDTH_CM} from "./AtrophyTravelPath"

const mesh = (name: string): RenderMeshVisual =>
  object(name).getComponentInDescendants("Component.RenderMeshVisual", false, true)

@component
export class AtrophyLeafScenario extends Scenario {
  async run(config: ScenarioConfig): Promise<void> {
    await sleep(1500)
    const criterion = config.getOrThrow("criterion")
    await this.confirmPlacement()
    if (criterion === "inspect") await inspectCopies()
    else if (criterion === "slice-focus") await this.sliceFocus()
    else if (criterion === "placement") await this.placement()
    else if (criterion === "startup") this.startup()
    else if (criterion === "endpoints") await this.endpoints()
    else if (criterion === "morph") await this.morph()
    else if (criterion === "slices") await this.slices()
    else if (criterion === "readability") this.readability()
    else if (criterion === "far-field") await this.farField()
    else if (criterion === "demo-sweep") await this.demoSweep()
    else if (criterion === "clinicians") await this.clinicians()
    else if (criterion === "warp") await this.warp(config)
    else if (criterion === "capture-phase") await onboardingCapture(config)
    else if (criterion === "capture-regions") await captureRegionGeometry()
    else if (criterion === "projection") await checkLayoutProjection()
    else if (criterion === "capture-pose") {
      // Dense source captures use real SIK; the full Warp criterion above still
      // owns the separate endpoint and progressive-material regression.
      const weight = Number(config.getOrThrow("weight"))
      if (!Number.isFinite(weight) || weight < 0 || weight > 1) throw new Error("Capture pose weight must be in [0,1]")
      const driver = new AtrophyLeafInteractor(), length = main().travelAt(0).length
      // Sub-centimetre targets otherwise remain a native Inspect hold if a
      // preview frame stalls. Approach from a real drag beyond the hold slop.
      if (Math.abs(main().intendedWeight - weight) * length < 2 * INSPECT_DRAG_SLOP_CM) {
        const staging = weight + (weight < 0.5 ? 1 : -1) * 3 * INSPECT_DRAG_SLOP_CM / length
        await driver.dragTo(staging, 0.6, 300, 0.00001)
      }
      await driver.dragTo(weight, 0.6, 300, 0.00001)
      expect(Math.abs(main().morphWeight - weight)).toBeLessThan(0.0001)
      this.noWarpLegend()
      console.log(`Atrophy native capture pose: requested=${weight.toFixed(9)}, observed=${main().morphWeight.toFixed(9)}`)
    }
    else throw new Error(`Unknown Atrophy test criterion ${criterion}`)
  }

  private async confirmPlacement(): Promise<void> {
    const placement = object("AtrophyPlacement").getComponent(AtrophyPlacement.getTypeName()) as AtrophyPlacement
    if (placement.placed) return
    await sleep(500)
    const reticle = object("HorizontalPlacement").getComponentInDescendants(Interactable.getTypeName(), false, true) as Interactable
    await new AtrophyLeafInteractor().trigger(reticle)
    await sleep(1500)
    expect(placement.placed).toBe(true)
  }

  private noWarpLegend(): void {
    for (const name of ["WarpLegend", "WarpLegendFoot", "WarpColourBar", "WarpLegendLabel", "WarpLegendStretched", "WarpLegendSqueezed"]) {
      expect(object(name)).toBeFalsy()
    }
  }

  /** The reticle anchors the same table-relative set; removed decoration cannot move the retained content. */
  private tablePlacement(): void {
    const placement = object("AtrophyPlacement").getComponent(AtrophyPlacement.getTypeName()) as AtrophyPlacement
    const root = main().getTransform(), contact = placement.placementContactLocal
    expect(root.getWorldTransform().multiplyPoint(contact).distance(placement.lastPosition)).toBeLessThan(0.001)
    const middle = (main().subjectAnchor.getTransform().getLocalPosition().x + main().commonAnchor.getTransform().getLocalPosition().x) / 2
    const arcFront = root.getInvertedWorldTransform().multiplyPoint(main().travelAt(0.5).position).z + TRAVEL_WIDTH_CM / 2
    expect(contact.x).toBeCloseTo(middle, 3)
    expect(contact.z - arcFront).toBeCloseTo(ATROPHY_LAYOUT.placementMargin, 3)
    for (const name of ["WarpControls", "MorphDial", "MorphDialRim", "DialIndicator", "WarpOnRing", "WarpToggle", "ResetPedestal", "ResetButton", "DialSubjectStop", "DialMniStop", "DialInstruction"]) {
      expect(object(name)).toBeFalsy()
    }
    this.noWarpLegend()
  }

  private async placement(): Promise<void> {
    const placement = object("AtrophyPlacement").getComponent(AtrophyPlacement.getTypeName()) as AtrophyPlacement
    const count = placement.placements
    const roots = ["SubjectBrain", "CommonBrain", "SubjectSlices", "CommonSlices", "Clinicians", "AtrophyWarp", "MorphTravelPath"]
    const positions = roots.map((name) => object(name).getTransform().getLocalPosition())
    const hand = new AtrophyLeafInteractor()
    const focus = object("AtrophySliceFocus").getComponent(AtrophySliceFocus.getTypeName()) as AtrophySliceFocus
    expect(main().morphWeight).toBe(0)
    expect(main().hasDragged).toBe(false)
    this.tablePlacement()
    // Reach the endpoint before opening the card; its first GPU upload can stall Preview frames.
    await hand.dragTo(1, 1.2, 1400)
    await hand.trigger(findInteractableByName("SubjectSliceTile3"))
    expect(focus.selectedLevel).toBe(3)
    // Returning along the real brain arc changes neither Placement nor the selected cut.
    for (const weight of [0.5, 0]) {
      await hand.dragTo(weight, 0.6, 700, 0.001)
      expect(main().morphWeight).toBeCloseTo(weight, 2)
      this.expectTravelPosition()
      expect(placement.placed).toBe(true)
      expect(object("AtrophyExperience").enabled).toBe(true)
      expect(placement.placements).toBe(count)
      expect(focus.selectedLevel).toBe(3)
      expect(main().hasDragged).toBe(true)
      expect(object("OnboardingHand").enabled).toBe(false)
      this.tablePlacement()
    }
    await hand.trigger(findInteractableByName("SubjectSliceTile3"))
    expect(focus.selectedLevel).toBe(-1)
    roots.forEach((name, i) => {
      const child = object(name)
      expect(child.getParent().isSame(object("AtrophyExperience"))).toBe(true)
      expect(child.getTransform().getLocalPosition().distance(positions[i])).toBeLessThan(0.001)
    })
    expect(main().brainHandle.getTransform().getWorldPosition().distance(main().subjectAnchor.getTransform().getWorldPosition())).toBeLessThan(0.01)
    console.log(`Atrophy Placement checked: real reticle confirmation, brain 0 -> 1 -> 0.5 -> 0; placements=${placement.placements}, table y=${placement.lastPosition.y.toFixed(4)} cm; selected slice and shared roots retained`)
  }

  private async sliceFocus(): Promise<void> {
    const focus = object("AtrophySliceFocus").getComponent(AtrophySliceFocus.getTypeName()) as AtrophySliceFocus
    const hand = new AtrophyLeafInteractor()
    expect(focus.getTransform().getLocalPosition().y).toBe(ATROPHY_LAYOUT.focusHeight)
    const sides = ["Subject", "Common", "Morph"]
    const coral = sides.map((side) => {
      const c = mesh(`${side}Region`).mainMaterial.mainPass.baseColor as vec4
      return [c.x, c.y, c.z, c.w]
    })
    const check = (level: number) => {
      expect(focus.selectedLevel).toBe(level)
      expect(object("SliceFocus").enabled).toBe(true)
      if (level < 0) {
        expect((object("SliceFocusHeading").getComponent("Component.Text") as Text).text).toBe("Key slice · largest ROI")
        for (const side of ["Subject", "Common"]) {
          const key = REGION.key_slice[side === "Subject" ? "subject" : "common"]
          expect(key.area_mm2).toBe(Math.max(...key.candidates.map((candidate) => candidate.area_mm2)))
          expect(key.candidates.find((candidate) => candidate.world_z_mm === key.world_z_mm).area_mm2).toBe(key.area_mm2)
          const image = object(`${side}FocusImage`).getComponent("Component.Image") as Image
          expect((image.mainMaterial.mainPass.baseTex as Texture).name).toBe(`${side.toLowerCase()}-key-0`)
          const caption = (object(`${side}FocusCut`).getComponent("Component.Text") as Text).text
          expect(caption).toBe(side === "Subject" ? `Subject cut\nscanner z ${key.world_z_mm} mm` : `MNI space\nz ${key.world_z_mm} mm`)
          const outline = object(`${side}FocusImageOutline`).getComponent("Component.Image") as Image
          expect((outline.mainMaterial.mainPass.baseTex as Texture).name).toBe(`${side.toLowerCase()}-key-outline-0`)
          expect(outline.sceneObject.enabled).toBe(true)
        }
      }
      for (const [i, side] of sides.entries()) {
        const region = mesh(`${side}Region`).mainMaterial.mainPass.baseColor as vec4
        expect([region.x, region.y, region.z, region.w]).toEqual(coral[i])
        const brain = object(`${side}Brain`).getComponent(AtrophyBrainController.getTypeName()) as AtrophyBrainController
        expect(brain.selectedLevel).toBe(level)
        const planes = brain.planes.getComponentsInDescendants("Component.RenderMeshVisual", false, true)
        expect(planes.length).toBe(7)
        planes.forEach((plane) => {
          const colour = plane.mainMaterial.mainPass.baseColor as vec4
          const selected = plane.sceneObject.name === `Plane${level}`
          expect(colour.x < 0.2).toBe(selected)
          expect(plane.mainMaterial.mainPass.vertexColorWeight).toBe(selected ? 0 : 1)
          if (selected) expect(colour.w).toBeGreaterThan(0.4)
        })
      }
    }
    check(-1)
    for (let level = 0; level < 7; level++) {
      await hand.trigger(findInteractableByName(`SubjectSliceTile${level}`))
      await sleep(150)
      check(level)
      for (const side of ["Subject", "Common"]) {
        const image = object(`${side}FocusImage`).getComponent("Component.Image") as Image
        const original = object(`${side}SliceImage${level}`).getComponent("Component.Image") as Image
        expect((image.mainMaterial.mainPass.baseTex as Texture).isSame(original.mainMaterial.mainPass.baseTex as Texture)).toBe(true)
        expect(image.getTransform().getLocalScale().y).toBeGreaterThan(original.getTransform().getLocalScale().y * 2)
      }
      await hand.trigger(findInteractableByName(`CommonSliceTile${level}`))
      await sleep(100)
      check(-1)
    }
    await hand.trigger(findInteractableByName("CommonSliceTile3"))
    await hand.trigger(findInteractableByName("SubjectSliceTile4"))
    await sleep(150)
    check(4)
    expect(object("CommonFocusImageWarp").enabled).toBe(true)
    for (const weight of [0.25, 0.5]) {
      await hand.dragTo(weight, 0.6, 700, 0.001)
      expect(main().morphWeight).toBeCloseTo(weight, 2)
      expect(object("CommonFocusImageWarp").enabled).toBe(true)
      check(4)
    }
    await hand.trigger(findInteractableByName("SubjectSliceTile4"))
    check(-1)
    expect((object("CommonFocusImageWarp").getComponent("Component.Image") as Image).mainMaterial.mainPass.baseTex.name).toBe("common-key-warp-0")
    console.log(`Atrophy Slice focus: independent largest-ROI key slices subject scanner z=${REGION.key_slice.subject.world_z_mm} mm (${REGION.key_slice.subject.area_mm2} mm2), MNI z=${REGION.key_slice.common.world_z_mm} mm (${REGION.key_slice.common.area_mm2} mm2); seven paired levels, both rows, close/switch, plane groups, Warp and live morph; finish key slice`)
  }

  private startup(): void {
    expect(object("SubjectBrain").enabled).toBe(true)
    expect(object("CommonBrain").enabled).toBe(true)
    const subject = object("SubjectBrain").getTransform().getWorldPosition()
    const common = object("CommonBrain").getTransform().getWorldPosition()
    // AtrophyExperience sits turned on a real table, so only the spacing is a world fact.
    expect(common.distance(subject)).toBeCloseTo(ATROPHY_LAYOUT.endpointSpacing * ATROPHY_LAYOUT.scale, 1)
    // One shared table-plane arc: 18% sag toward local +Z, exact endpoints, equal weight = equal arc distance.
    const flow = main(), inTable = flow.getTransform().getInvertedWorldTransform()
    const subjectAt = inTable.multiplyPoint(subject), commonAt = inTable.multiplyPoint(common)
    const middle = inTable.multiplyPoint(flow.travelAt(0.5).position)
    expect(flow.travelAt(0).position.distance(subject)).toBeLessThan(0.01)
    expect(flow.travelAt(1).position.distance(common)).toBeLessThan(0.01)
    expect(middle.x).toBeCloseTo((subjectAt.x + commonAt.x) / 2, 2)
    expect(middle.y).toBeCloseTo(subjectAt.y, 2)
    expect(middle.z - subjectAt.z).toBeCloseTo(ATROPHY_LAYOUT.endpointSpacing * TRAVEL_SAG, 2)
    const quarters = [0, 0.25, 0.5, 0.75, 1].map((w) => flow.travelAt(w).position)
    for (let i = 2; i < quarters.length; i++) expect(quarters[i].distance(quarters[i - 1])).toBeCloseTo(quarters[1].distance(quarters[0]), 2)

    const path = mesh("MorphTravelPath"), geometry = flow.travelGeometry
    const inGuide = path.getTransform().getInvertedWorldTransform()
    expect(path.mainMaterial.mainPass.depthTest).toBe(true)
    expect(object("MorphTravelPath").getChildrenCount()).toBe(0)
    // Inspect the CPU arrays actually uploaded, plus safe native bounds; never read back a MeshBuilder mesh's buffers.
    expect(geometry.dashRanges.length).toBe(TRAVEL_DASH_COUNT)
    expect(geometry.vertices.length / 3).toBe(TRAVEL_DASH_COUNT * (TRAVEL_DASH_SEGMENTS + 1) * 4)
    expect(geometry.indices.length).toBe(TRAVEL_DASH_COUNT * (TRAVEL_DASH_SEGMENTS * 24 + 12))
    const vertex = (i: number) => new vec3(...geometry.vertices.slice(3 * i, 3 * i + 3) as [number, number, number])
    const length = flow.travelAt(0).length / ATROPHY_LAYOUT.scale
    geometry.dashRanges.forEach(([start, end], dash) => {
      expect(end - start).toBeCloseTo(TRAVEL_DASH_CM, 2)
      if (dash > 0) expect(start - geometry.dashRanges[dash - 1][1]).toBeGreaterThan(1)
      for (let section = 0; section <= TRAVEL_DASH_SEGMENTS; section++) {
        const first = (dash * (TRAVEL_DASH_SEGMENTS + 1) + section) * 4
        const center = vertex(first).add(vertex(first + 1)).add(vertex(first + 2)).add(vertex(first + 3)).uniformScale(0.25)
        const expected = inGuide.multiplyPoint(flow.travelAt((start + (end - start) * section / TRAVEL_DASH_SEGMENTS) / length).position)
        expect(center.distance(new vec3(expected.x, 0, expected.z))).toBeLessThan(0.01)
        expect(vertex(first).distance(vertex(first + 1))).toBeCloseTo(TRAVEL_WIDTH_CM, 3)
        expect(vertex(first + 1).distance(vertex(first + 2))).toBeCloseTo(TRAVEL_HEIGHT_CM, 3)
      }
    })
    expect(geometry.dashRanges[0][0]).toBe(0)
    expect(geometry.dashRanges[TRAVEL_DASH_COUNT - 1][1]).toBeCloseTo(length, 3)
    for (const [axis, i] of [["x", 0], ["y", 1], ["z", 2]] as const) {
      const values = geometry.vertices.filter((_, j) => j % 3 === i)
      expect(path.mesh.aabbMin[axis]).toBeCloseTo(Math.min(...values), 2)
      expect(path.mesh.aabbMax[axis]).toBeCloseTo(Math.max(...values), 2)
    }
    for (const side of ["Subject", "Common", "Morph"]) {
      const brain = object(`${side}Brain`).getComponent(AtrophyBrainController.getTypeName()) as AtrophyBrainController
      expect(brain.warpEnabled).toBe(side !== "Subject")
      // The shared shader must still carry the planes' authored vertex alpha, not draw opaque white sheets.
      const planes = brain.planes.getComponentInDescendants("Component.RenderMeshVisual", false, true)
      expect(planes.mainMaterial.mainPass.vertexColorWeight).toBe(1)
      const grey = mesh(`${side}Cortex`).getMaterial(1).mainPass.baseColor as vec4
      expect(grey.x).toBeCloseTo(0.75, 2)
      expect(grey.x).toBeCloseTo(grey.y, 3)
      expect(grey.y).toBeCloseTo(grey.z, 3)
    }
    expect((object("CommonSlices").getComponent(AtrophySlicesUI.getTypeName()) as AtrophySlicesUI).warpEnabled).toBe(true)
    expect((object("SubjectSlices").getComponent(AtrophySlicesUI.getTypeName()) as AtrophySlicesUI).warpEnabled).toBe(false)
    this.noWarpLegend()
    expect(object("SliceFocus").enabled).toBe(true)
    expect((object("AtrophySliceFocus").getComponent(AtrophySliceFocus.getTypeName()) as AtrophySliceFocus).selectedLevel).toBe(-1)
    const heights: number[] = []
    for (const side of ["Subject", "Common"]) {
      const cortex = mesh(`${side}Cortex`)
      const region = mesh(`${side}Region`)
      const size = cortex.worldAabbMax().sub(cortex.worldAabbMin())
      heights.push(size.y)
      expect(size.y / ATROPHY_LAYOUT.scale).toBeGreaterThan(10)
      expect(size.y / ATROPHY_LAYOUT.scale).toBeLessThan(20)
      expect(Math.max(size.x, size.z) / ATROPHY_LAYOUT.scale).toBeGreaterThan(14)
      expect(cortex.getMaterialsCount()).toBe(2)
      expect(cortex.getMaterial(0).mainPass.depthWrite).toBe(true)
      const colour = cortex.getMaterial(1).mainPass
      expect(colour.depthWrite).toBe(false)
      expect(colour.baseColor.w).toBeCloseTo(0.85, 2)
      expect(region.getRenderOrder()).toBeGreaterThan(cortex.getRenderOrder())
      expect(region.mainMaterial.mainPass.depthTest).toBe(false)
      expect(region.mainMaterial.mainPass.baseColor.x).toBeGreaterThan(0.9)
      expect(region.getBlendShapeWeight(MORPH_TARGET)).toBeCloseTo(side === "Subject" ? 0 : 1, 2)
      expect(object(`${side}Cortex`).getTransform().getLocalScale().x).toBeCloseTo(100, 1)
    }
    // The pinch target starts on the patient brain, is taller than either brain, and no tuner bar remains.
    const handle = findInteractableByName("BrainHandle")
    expect(handle.getTransform().getWorldPosition().distance(subject)).toBeLessThan(0.01)
    expect((handle.colliders[0].shape as BoxShape).size.y * handle.getTransform().getWorldScale().y).toBeGreaterThan(Math.max(...heights))
    expect(object("MorphTuner")).toBeFalsy()
    for (const name of ["AtrophyInfo", "ExperienceTitle", "WarpVolumeSummary", "LiveRegionVolume", "RegionLegend", "ScientificCaveat"]) {
      expect(object(name)).toBeFalsy()
    }
  }

  private async endpoints(): Promise<void> {
    const interactor = new AtrophyLeafInteractor()
    for (const weight of [0, 0.5, 1]) {
      await interactor.dragTo(weight)
      if (weight === 0.5) {
        expect(main().morphWeight).toBeGreaterThan(0.3)
        expect(main().morphWeight).toBeLessThan(0.7)
      } else expect(main().morphWeight).toBeCloseTo(weight, 2)
      this.expectTravelPosition()
      expect(object("MorphBrain").enabled).toBe(weight === 0.5)
    }
  }

  private expectTravelPosition(): void {
    const expected = main().travelAt(main().morphWeight).position
    for (const name of ["MorphBrain", "MorphCortex", "MorphRegion", "BrainHandle"]) {
      expect(object(name).getTransform().getWorldPosition().distance(expected)).toBeLessThan(0.01)
    }
  }

  private async morph(): Promise<void> {
    const interactor = new AtrophyLeafInteractor()
    await interactor.dragTo(0)
    const low = main().morphWeight
    const visuals = [mesh("MorphCortex"), mesh("MorphRegion")]
    await interactor.dragTo(0.5)
    const mid = main().morphWeight
    expect(mid).toBeGreaterThan(low + 0.25)
    visuals.forEach((visual) => expect(visual.getBlendShapeWeight(MORPH_TARGET)).toBeCloseTo(mid, 3))
    const samples: number[] = []
    const sampler = this.createEvent("UpdateEvent")
    sampler.bind(() => samples.push(main().morphWeight))
    try { await interactor.dragTo(1) } finally { sampler.enabled = false }
    expect(samples.some((w) => w > mid + 0.05 && w < 0.95)).toBe(true)
    for (let i = 1; i < samples.length; i++) expect(Math.abs(samples[i] - samples[i - 1])).toBeLessThan(0.2)
    await interactor.dragTo(0)
    expect(main().morphWeight).toBeCloseTo(low, 2)
    visuals.forEach((visual) => expect(visual.getBlendShapeWeight(MORPH_TARGET)).toBeCloseTo(low, 2))
  }

  private async slices(): Promise<void> {
    // The editor's MovePreviewCamera supplies the real tracked viewer pose.
    // Runtime one-shot camera writes are not evidence of a tracked walk.
    const camera = object("Camera Object").getTransform()
    const tiles: SceneObject[] = []
    for (const side of ["Subject", "Common"]) {
      for (let i = 0; i < 7; i++) {
        const tile = object(`${side}SliceTile${i}`)
        expect(tile.enabled).toBe(true)
        const image = object(`${side}SliceImage${i}`).getComponent("Component.Image") as Image
        const outline = object(`${side}SliceOutline${i}`).getComponent("Component.Image") as Image
        expect(image).toBeTruthy()
        expect(outline).toBeTruthy()
        expect(outline.getRenderOrder()).toBeGreaterThan(image.getRenderOrder())
        expect(outline.mainMaterial.mainPass.depthTest).toBe(true)
        expect(outline.mainMaterial.mainPass.depthWrite).toBe(false)
        expect((outline.mainMaterial.mainPass.baseColor as vec4).distance(mesh(`${side}Region`).mainMaterial.mainPass.baseColor)).toBeLessThan(0.001)
        expect(image.flipX).toBe(false) // radiological mirroring is already baked offline
        const size = image.getTransform().getLocalScale(), texture = image.mainMaterial.mainPass.baseTex as Texture
        expect(size.x / size.y).toBeCloseTo(texture.getWidth() / texture.getHeight(), 3)
        tiles.push(tile)
      }
    }
    await sleep(250)
    tiles.forEach((tile) => {
      const transform = tile.getTransform()
      const toViewer = camera.getWorldPosition().sub(transform.getWorldPosition()).normalize()
      expect(transform.forward.dot(toViewer)).toBeGreaterThan(0.98)
    })
    checkGridDisplay()
    const pose = camera.getWorldPosition()
    console.log(`Atrophy slice facing checked at viewer (${pose.x.toFixed(1)}, ${pose.y.toFixed(1)}, ${pose.z.toFixed(1)})`)
  }

  private readability(): void {
    const labels: string[] = []
    for (const side of ["Subject", "Common"]) {
      labels.push(`${side}SpaceLabel`, `${side}RegionVolume`, `${side}VolumeContext`, `${side}SliceHeading`)
      for (let i = 0; i < 7; i++) labels.push(`${side}SliceCut${i}`)
    }
    labels.forEach((name) => {
      const text = object(name).getComponent("Component.Text") as Text
      expect(text.size).toBeGreaterThan(37)
      expect(text.depthTest).toBe(true)
      expect(text.textFill.color.w).toBeGreaterThan(0.9)
      const glyphs = text.getBoundingBox()
      expect(glyphs.getSize().x).toBeLessThan(text.layoutRect.getSize().x + 0.2)
    })
    REGION.mni_z_mm.forEach((level, i) => {
      expect((object(`CommonSliceCut${i}`).getComponent("Component.Text") as Text).text).toBe(`z ${level}`)
      expect((object(`SubjectSliceCut${i}`).getComponent("Component.Text") as Text).text).toBe(`to z ${level}`)
    })
    for (const orientation of Object.values(REGION.slice_orientation)) {
      expect(orientation.display).toBe("radiological: image left=R, right=L, top=A")
      expect(orientation.image_x_world_mm[0]).toBeGreaterThan(orientation.image_x_world_mm[1])
    }
    for (const [side, volume] of [["Subject", `${REGION.ventricle_ml.subject.toFixed(1)} mL`],
                                  ["Common", `${REGION.ventricle_ml.mni.toFixed(1)} mL`]]) {
      const label = object(`${side}RegionVolume`).getComponent("Component.Text") as Text
      expect(label.text).toBe(volume)
      expect(label.size).toBeGreaterThan(50)
    }
    this.tablePlacement()
    // Pixel legibility at ~1 m still needs the saved Preview capture review.
  }

  private async farField(): Promise<void> {
    // Far-field only. Direct IK midpoint convergence stalled in Preview; see
    // devpost/build-report.md. Do not reinterpret this as a direct-reach pass.
    await new AtrophyLeafInteractor().dragTo(0.5)
    const ik = createIKInteractor()
    const handle = findInteractableByName("BrainHandle")
    if (!ik.right.isIndirect(handle)) {
      throw new Error("Far-field test: step back until the brain is beyond arm reach before running")
    }
    // A real IK hand ray pinches the brain mid-path, sweeps it along the path, then pulls it back.
    // IK can end a slide before the arm gets going, so repeat each sweep until the brain has moved.
    const sweep = main().travelAt(main().intendedWeight).tangent.uniformScale(4)
    const start = main().intendedWeight
    for (let i = 0; i < 3 && main().intendedWeight < start + 0.1; i++) await ik.drag(handle, sweep)
    const out = main().intendedWeight
    for (let i = 0; i < 3 && main().intendedWeight > out - 0.1; i++) await ik.drag(handle, sweep.uniformScale(-1))
    const back = main().intendedWeight
    console.log(`Atrophy IK far-field drag: weight ${start.toFixed(2)} -> ${out.toFixed(2)} -> ${back.toFixed(2)}`)
    expect(out).toBeGreaterThan(start + 0.1)
    expect(back).toBeLessThan(out - 0.1)
  }

  /** Three Bitmoji clinicians, a woman between two men: spawned, tinted, dressed as NHS staff, seated facing the live camera, heads tracking the dragged brain, one line per threshold. */
  private async clinicians(): Promise<void> {
    const group = object("Clinicians").getComponent(AtrophyClinicians.getTypeName()) as AtrophyClinicians
    await withTimeout(group.ready, 30000, "Clinicians did not finish spawning")
    const hand = new AtrophyLeafInteractor()
    await hand.dragTo(0)
    const people = group.clinicians
    expect(people.length).toBe(3)
    const spoken = () => people.map((person) => {
      const text = object("TooltipText", person.bubble.sceneObject).getComponent("Component.Text") as Text
      return text.enabled && text.textFill.color.w > 0.9 ? text.text.replace(/\n/g, " ") : ""
    })
    const expectSpoken = async (expected: string[]) => {
      await waitUntil(() => spoken().every((line, i) => line === expected[i]), 1500,
        () => `Clinician bubbles did not finish showing: observed=${spoken()}, expected=${expected}`)
      expect(spoken()).toEqual(expected)
    }
    await sleep(350)
    await expectSpoken(["", ONBOARDING_LINE, ""])
    expect(object("OnboardingHand").enabled).toBe(true)
    console.log(`Atrophy onboarding: ${spoken()[1]}; translucent hand enabled before first drag`)
    const camera = object("Camera Object").getTransform().getWorldPosition()
    const angle = (a: vec3, b: vec3) => Math.acos(Math.max(-1, Math.min(1, a.normalize().dot(b.normalize())))) * 180 / Math.PI
    const level = (v: vec3) => new vec3(v.x, 0, v.z)
    const bone = (person: Clinician, name: string) => object(name, person.root).getTransform().getWorldPosition()
    const handle = () => object("BrainHandle").getTransform().getWorldPosition()
    // The base pose cannot advance between captured states or camera tiles. Keep the real gaze,
    // but check the torso/head translations and arm rotations after two different wall-clock waits.
    people.forEach((person) => expect(person.idlePlayer.getClip("idle").playbackSpeed).toBe(0))
    const pose = () => people.map((person) => ({
      head: object("C_head_bind_JNT", person.root).getTransform().getLocalPosition(),
      chest: object("C_spine0003_bind_JNT", person.root).getTransform().getLocalPosition(),
      arm: object("L_armUpper0001_bind_JNT", person.root).getTransform().getLocalRotation(),
    }))
    const fixed = pose()
    await sleep(900)
    pose().forEach((after, i) => {
      expect(after.head.distance(fixed[i].head)).toBeLessThan(1e-5)
      expect(after.chest.distance(fixed[i].chest)).toBeLessThan(1e-5)
      expect(Math.abs(after.arm.dot(fixed[i].arm))).toBeGreaterThan(1 - 1e-6)
    })
    console.log(`Atrophy deterministic clinicians: idle t=${CLINICIAN_IDLE_SECONDS}, playbackSpeed=0; head/chest translations and arm rotations unchanged after 900 ms`)
    const visualOf = (person: Clinician, name: string) => object(name, person.root).getComponent("Component.RenderMeshVisual") as RenderMeshVisual
    const tint = (person: Clinician, name: string) => visualOf(person, name).mainMaterial.mainPass["baseColorFactor"] as vec4
    const luma = (c: vec4) => 0.2126 * c.x + 0.7152 * c.y + 0.0722 * c.z

    // Three clearly different skin tones (dark, medium, light), the body matching the head so the neck has no seam.
    const tones = people.map((person) => luma(tint(person, "C_head_GEO"))).sort((a, b) => a - b)
    expect(tones[1] / tones[0]).toBeGreaterThan(1.5)
    expect(tones[2] / tones[1]).toBeGreaterThan(1.5)
    people.forEach((person) => expect(luma(tint(person, "body_GEO"))).toBeCloseTo(luma(tint(person, "C_head_GEO"))))

    // NHS scrubs: each seat's top and trousers are one blue, and no two seats wear the same blue.
    const scrubs = people.map((person) => tint(person, "outfit_top_GEO"))
    scrubs.forEach((blue, i) => {
      expect(tint(people[i], "outfit_bottom_GEO").distance(blue)).toBeCloseTo(0)
      expect(blue.z).toBeGreaterThan(blue.y)
      expect(blue.y).toBeGreaterThan(blue.x)
      scrubs.slice(i + 1).forEach((other) => expect(other.distance(blue)).toBeGreaterThan(0.1))
    })

    // Female base body remains distinct; the complete licensed hairstyle REPLACES the cap, not a procedural skirt.
    const topCounts = people.map((person) => person.uniformGeometry.positions.length / 3)
    expect(topCounts[0]).toBe(topCounts[2])
    expect(topCounts[1]).not.toBe(topCounts[0])
    const cap = visualOf(people[0], "C_hair_GEO").mesh
    expect(visualOf(people[2], "C_hair_GEO").mesh.getVertexDataForAttribute("position").length).toBe(cap.getVertexDataForAttribute("position").length)
    for (const i of [0, 2]) {
      expect(visualOf(people[i], "C_hair_GEO").enabled).toBe(true)
      expect(people[i].longHair).toBe(undefined)
      expect(people[i].irises).toBe(undefined)
      expect(tint(people[i], "C_hair_GEO").distance(new vec4(i === 0 ? 1 : 5, i === 0 ? 1 : 5, i === 0 ? 1 : 5, 1))).toBeCloseTo(0)
    }
    expect(visualOf(people[1], "C_hair_GEO").enabled).toBe(false)
    const hair = people[1].longHair, top = people[1].uniformGeometry
    if (!hair) throw new Error("Female clinician has no complete long hairstyle")
    expect(hair.mesh.isSame(group.femaleHairMesh)).toBe(true)
    const anchor = hair.sceneObject.getParent()
    expect(anchor.getParent().isSame(people[1].head)).toBe(true)
    const inverse = cap.extractBoneInverseMatrices()[cap.extractBoneNames().indexOf("C_head_bind_JNT")]
    expect(anchor.getTransform().getLocalPosition().distance(inverse.multiplyPoint(vec3.zero()))).toBeLessThan(1e-5)
    const fit = hair.getTransform().getLocalScale(), offset = hair.getTransform().getLocalPosition()
    const crown = hair.mesh.aabbMax.y * fit.y + offset.y, hem = hair.mesh.aabbMin.y * fit.y + offset.y
    const bindY = (name: string) => top.inverseBind[top.bones.indexOf(name)].inverse().multiplyPoint(vec3.zero()).y
    expect(crown - cap.aabbMax.y).toBeWithinRange(0.06, 0.12)
    expect(hem).toBeLessThan(bindY("L_clavicle_bind_JNT"))
    expect(hem).toBeGreaterThan(bindY("C_spine0003_bind_JNT"))
    // Coverage anti-aliasing softens strand edges without translucent blending or an extra pass.
    expect(hair.mainMaterial.mainPass.blendMode).toBe(BlendMode.AlphaToCoverage)
    expect(hair.mainMaterial.mainPass.depthWrite).toBe(true)
    const chestnut = hair.mainMaterial.mainPass.baseColor as vec4
    expect(chestnut.x).toBeGreaterThan(chestnut.y)
    expect(chestnut.y).toBeGreaterThan(chestnut.z)
    expect(chestnut.w).toBe(1)
    expect(hair.mainMaterial.mainPass.baseTex).not.toBeNull()
    console.log(`Atrophy licensed hair: world width ${((hair.mesh.aabbMax.x - hair.mesh.aabbMin.x) * hair.getTransform().getWorldScale().x).toFixed(2)} cm; bind crown ${crown.toFixed(4)} m, hem ${hem.toFixed(4)} m; head-parented opaque strand texture`)

    // Her private iris texture changes only chromatic pixels. Eye whites, pupils, highlights and alpha are byte-identical.
    const irises = people[1].irises
    if (!irises) throw new Error("Female clinician has no hazel-green iris texture")
    expect(irises.changed.length).toBeGreaterThan(0)
    const changed = new Set(irises.changed)
    expect(irises.after.every((value, i) => i % 4 < 3 && changed.has(i - i % 4) || value === irises.before[i])).toBe(true)
    expect(irises.changed.every((i) => irises.after[i + 1] > irises.after[i] && irises.after[i] > irises.after[i + 2])).toBe(true)
    expect(visualOf(people[1], "L_eye_GEO").mainMaterial.isSame(visualOf(people[1], "R_eye_GEO").mainMaterial)).toBe(true)
    for (const i of [0, 2]) expect(visualOf(people[i], "L_eye_GEO").mainMaterial.isSame(visualOf(people[1], "L_eye_GEO").mainMaterial)).toBe(false)

    // The fitted table box gives the far edge (its -z face) and the top (its highest point).
    const slab = mesh("TableOccluder")
    const tableTop = slab.worldAabbMax().y
    // The seats turn to the live camera every frame, not just at spawn: knock one aside and it squares up again.
    const aside = people[0].root.getTransform()
    aside.setLocalRotation(aside.getLocalRotation().multiply(quat.angleAxis(Math.PI / 2, vec3.up())))
    await sleep(100)
    people.forEach((person, i) => {
      const at = person.root.getTransform().getWorldPosition()
      // Behind the far table edge, and square to the viewer.
      expect(slab.sceneObject.getTransform().getInvertedWorldTransform().multiplyPoint(at).z).toBeLessThan(slab.mesh.aabbMin.z)
      expect(angle(level(person.root.getTransform().forward), level(camera.sub(at)))).toBeLessThan(5)
      // The Bitmoji's own head, unscaled, at an adult 14-17 cm wide; the small rig sits with its eyes just over the table's far edge.
      const skull = visualOf(person, "C_head_GEO").mesh
      const skullCm = (skull.aabbMax.x - skull.aabbMin.x) * person.head.getTransform().getWorldScale().x
      const eyeCm = bone(person, "L_eye_rig_ZRO").y - tableTop
      console.log(`Atrophy clinician ${i}: skull ${skullCm.toFixed(1)} cm wide, eyes ${eyeCm.toFixed(6)} cm above the table top; pinned idle ${CLINICIAN_IDLE_SECONDS} s`)
      // Real people keep real size: the shared set scale does not apply to them.
      expect(skullCm).toBeWithinRange(14, 17)
      expect(eyeCm).toBeWithinRange(8, 20)
      // Seated: thighs forward and level, shins down, feet below the knees.
      const forward = person.root.getTransform().forward
      for (const side of ["L", "R"]) {
        const hip = bone(person, `${side}_legUpper0001_bind_JNT`), knee = bone(person, `${side}_legLower0001_bind_JNT`)
        const foot = bone(person, `${side}_foot0001_bind_JNT`)
        const thigh = knee.sub(hip), shin = foot.sub(knee)
        expect(thigh.dot(forward) / thigh.length).toBeGreaterThan(0.95)
        expect(Math.abs(thigh.y) / thigh.length).toBeLessThan(0.25)
        expect(-shin.y / shin.length).toBeGreaterThan(0.95)
      }
      // Bare below the elbows: the top's sleeves end between the shoulder and the elbow joints (in the bind pose, where the arm runs out along x),
      // so the forearm is the body's own skin.
      const {positions, indices, bones, inverseBind} = person.uniformGeometry
      const joint = (name: string) => inverseBind[bones.indexOf(`L_${name}_bind_JNT`)].inverse().multiplyPoint(vec3.zero()).x
      // The sleeve cut collapses its triangles to a point, so only the triangles that still have area are drawn.
      const drawn = Array.from(indices).filter((_, i) => indices[i - (i % 3)] !== indices[i - (i % 3) + 1])
      const sleeveEnd = Math.max(...drawn.map((v) => Math.abs(positions[3 * v])))
      console.log(`Atrophy clinician ${i}: sleeves end ${(100 * sleeveEnd).toFixed(1)} cm out, between the shoulder at ${(100 * joint("armUpper0001")).toFixed(1)} and the elbow at ${(100 * joint("armLower0001")).toFixed(1)}`)
      expect(sleeveEnd).toBeGreaterThan(joint("armUpper0001"))
      expect(sleeveEnd).toBeLessThan(joint("armLower0001"))

      // An NHS-blue lanyard with a white ID card hangs from the chest bone: the card is below the collar, above the waist and in front of the spine.
      const lanyard = object("Lanyard", person.root)
      expect(lanyard.getParent().name).toBe("C_spine0003_bind_JNT")
      const paint = (name: string) => (object(name, lanyard).getComponent("Component.RenderMeshVisual") as RenderMeshVisual).mainMaterial.mainPass["baseColorFactor"] as vec4
      expect(paint("Strap").z).toBeGreaterThan(paint("Strap").x + 0.3)
      expect(Math.min(paint("IdCard").x, paint("IdCard").y, paint("IdCard").z)).toBeGreaterThan(0.9)
      const inRoot = (point: vec3) => person.root.getTransform().getInvertedWorldTransform().multiplyPoint(point)
      const card = inRoot(bone(person, "IdCard"))
      expect(card.y).toBeLessThan(inRoot(bone(person, "C_neck0001_bind_JNT")).y)
      expect(card.y).toBeGreaterThan(inRoot(bone(person, "C_spine0001_bind_JNT")).y)
      expect(card.z).toBeGreaterThan(inRoot(bone(person, "C_spine0003_bind_JNT")).z)
    })

    // Gaze: each head faces the brain at its own end, then follows it across the table without snapping. Beyond the head
    // joint, the eye bones that the visible eyeballs are skinned to must face it too, and the heads look down at the table
    // (only a little, as the eyes are just over the table's far edge).
    await sleep(800)
    const toBrain = (person: Clinician) => handle().sub(bone(person, "C_head_bind_JNT"))
    const eyeFacing = (person: Clinician) => level(bone(person, "L_eye_bind_JNT").sub(bone(person, "R_eye_bind_JNT"))).cross(vec3.up())
    const gazeError = () => Math.max(...people.map((person) => Math.max(angle(group.gazeDirection(person), toBrain(person)), angle(eyeFacing(person), level(toBrain(person))))))
    const checkGaze = (end: string) => {
      const error = gazeError()
      console.log(`Atrophy clinicians gaze error at the ${end} end: ${error.toFixed(1)} deg`)
      expect(error).toBeLessThan(10)
    }
    checkGaze("subject")
    // Real-size clinicians sit behind the far edge, so how far they look down follows from the placement; facing the brain is checked above.
    people.forEach((person) => expect(group.gazeDirection(person).y).toBeLessThan(0))
    const start = people.map((person) => group.gazeDirection(person))
    const headings = [...start]
    let step = 0
    const sampler = this.createEvent("UpdateEvent")
    sampler.bind(() => people.forEach((person, i) => {
      const now = group.gazeDirection(person)
      step = Math.max(step, angle(now, headings[i]))
      headings[i] = now
    }))
    try { await hand.dragTo(1) } finally { sampler.enabled = false }
    expect(step).toBeLessThan(8)
    // Placement changes the subtended angle; compare against the real endpoint geometry, not an old room's 15° span.
    const observedSpan = () => Math.max(...people.map((person, i) => angle(group.gazeDirection(person), start[i])))
    const expectedSpan = Math.max(...people.map((person, i) => angle(main().commonAnchor.getTransform().getWorldPosition().sub(bone(person, "C_head_bind_JNT")), start[i])))
    await waitUntil(() => Math.abs(observedSpan() - expectedSpan) < 1, 1500,
      () => `Clinician gaze did not settle: observed=${observedSpan()}, expected=${expectedSpan}`)
    expect(Math.abs(observedSpan() - expectedSpan)).toBeLessThan(1)
    console.log(`Atrophy clinicians gaze span: observed ${observedSpan().toFixed(3)}, endpoint geometry ${expectedSpan.toFixed(3)} deg`)
    await sleep(800)
    checkGaze("MNI")
    expect(object("OnboardingHand").enabled).toBe(false)
    await expectSpoken(["", "", ENDING_LINE])
    console.log(`Atrophy ending, first MNI: ${spoken()[2]}`)

    // Leaving MNI must immediately retire its endpoint-only ending, even before returning home.
    await hand.dragTo(0.5)
    await expectSpoken(["", "", ""])
    console.log("Atrophy ending retirement: real brain drag MNI -> 0.5 has no endpoint-only line")

    // Onboarding and ending fire once per Placement; returning home does not bring either hint back.
    await hand.dragTo(0)
    await sleep(1000)
    await expectSpoken(["", `Back in her own brain: ${REGION.ventricle_ml.subject} mL.`, ""])
    await hand.dragTo(0.1)
    // The timed HOME bubble may expire during a slow Preview drag; onboarding must never return.
    expect(spoken().includes(ONBOARDING_LINE)).toBe(false)
    expect(object("OnboardingHand").enabled).toBe(false)
    await hand.dragTo(0.45)
    await expectSpoken(["The warp squeezes her ventricles into the template.", "", ""])
    await hand.dragTo(0.75)
    await expectSpoken(["", "", "Same region, about a third of the volume."])
    await hand.dragTo(1)
    expect(spoken().includes(ENDING_LINE)).toBe(false)
    await hand.dragTo(0)
    await expectSpoken(["", `Back in her own brain: ${REGION.ventricle_ml.subject} mL.`, ""])
    expect(main().hasDragged).toBe(true)
    expect(object("OnboardingHand").enabled).toBe(false)
    console.log("Atrophy clinicians checked: hint, first ending, revised squeeze line, real brain round trips; finish=home")
  }

  /** Real brain SIK drag: subject stays neutral, morph J follows w, common J stays full; Warp never switches off. */
  private async warp(config: ScenarioConfig): Promise<void> {
    const hand = new AtrophyLeafInteractor()
    const target = Number(config.getOrThrow("weight"))
    const brains = ["Subject", "Common", "Morph"].map((side) => {
      const visual = mesh(`${side}Cortex`)
      return {side, visual, original: visual.mesh, grey: visual.getMaterial(1),
        controller: object(`${side}Brain`).getComponent(AtrophyBrainController.getTypeName()) as AtrophyBrainController}
    })
    const check = () => {
      const weight = main().morphWeight
      this.noWarpLegend()
      brains.forEach(({side, controller, visual, original, grey}) => {
        const coloured = side !== "Subject"
        expect(controller.warpEnabled).toBe(coloured)
        expect(visual.mesh.isSame(coloured ? controller.warpMesh : original)).toBe(true)
        expect(visual.getMaterialsCount()).toBe(2)
        if (coloured) {
          expect(visual.getMaterial(1).mainPass.vertexColorWeight).toBeCloseTo(side === "Morph" ? weight : 1, 5)
        } else expect(visual.getMaterial(1).isSame(grey)).toBe(true)
        if (controller.cortexMorphs) expect(visual.getBlendShapeWeight(MORPH_TARGET)).toBeCloseTo(side === "Morph" ? weight : 0, 3)
      })
      expect(mesh("CommonCortex").getMaterial(1).isSame(mesh("MorphCortex").getMaterial(1))).toBe(false)
      for (const side of ["Subject", "Common"]) {
        const row = object(`${side}Slices`).getComponent(AtrophySlicesUI.getTypeName()) as AtrophySlicesUI
        expect(row.warpEnabled).toBe(side === "Common")
        for (let i = 0; i < 7; i++) {
          const grey = object(`${side}SliceImage${i}`).getComponent("Component.Image") as Image
          const outline = object(`${side}SliceOutline${i}`).getComponent("Component.Image") as Image
          expect(outline.sceneObject.enabled).toBe(true)
          if (side === "Subject") {
            expect(object(`SubjectSliceWarp${i}`)).toBeFalsy()
            continue
          }
          const warp = object(`CommonSliceWarp${i}`).getComponent("Component.Image") as Image
          expect(warp.sceneObject.enabled).toBe(true)
          expect(warp.sceneObject.getParent().isSame(grey.sceneObject)).toBe(true)
          expect(warp.getRenderOrder()).toBeGreaterThan(grey.getRenderOrder())
          expect(outline.getRenderOrder()).toBeGreaterThan(warp.getRenderOrder())
          expect(warp.mainMaterial.mainPass.depthTest).toBe(true)
          expect(warp.mainMaterial.mainPass.depthWrite).toBe(false)
          expect((warp.mainMaterial.mainPass.baseColor as vec4).distance(vec4.one())).toBeLessThan(0.001)
          const texture = warp.mainMaterial.mainPass.baseTex as Texture, base = grey.mainMaterial.mainPass.baseTex as Texture
          expect(texture.getWidth()).toBe(base.getWidth())
          expect(texture.getHeight()).toBe(base.getHeight())
          expect(warp.flipX).toBe(false)
          expect(warp.getTransform().getLocalScale().distance(vec3.one())).toBeLessThan(0.001)
        }
      }
    }
    check()
    const samples: number[][] = [], sampler = this.createEvent("UpdateEvent")
    sampler.bind(() => samples.push([main().morphWeight, mesh("MorphCortex").getMaterial(1).mainPass.vertexColorWeight as number]))
    try {
      for (const weight of [0, 0.5, 1, 0]) {
        await hand.dragTo(weight, 0.6, 700, 0.001)
        check()
        expect(main().morphWeight).toBeCloseTo(weight, 2)
        console.log(`Atrophy progressive J: w=${main().morphWeight.toFixed(9)}, subject=0, morph=${(mesh("MorphCortex").getMaterial(1).mainPass.vertexColorWeight as number).toFixed(9)}, common=${mesh("CommonCortex").getMaterial(1).mainPass.vertexColorWeight}; subject overlays=0, common overlays=7`)
      }
    } finally { sampler.enabled = false }
    expect(samples.some(([w]) => w > 0.1 && w < 0.4)).toBe(true)
    samples.forEach(([w, colour]) => expect(colour).toBeCloseTo(w, 5))
    await hand.dragTo(target, 0.6, 700, 0.001)
    check()
    console.log(`Atrophy always-on Warp: brain drag requested w=${target}, observed w=${main().morphWeight.toFixed(9)}; ${samples.length} moving frames matched the material uniform`)
  }

  /** For the demo video: a slow real SIK drag of the brain from subject to MNI (about 6 s), after a 1 s hold. */
  private async demoSweep(): Promise<void> {
    const hand = new AtrophyLeafInteractor()
    await hand.dragTo(0)
    await sleep(1000)
    await hand.dragTo(1, 0.2, 6500)
    await sleep(1500)
    expect(main().morphWeight).toBeGreaterThan(0.95)
  }
}
