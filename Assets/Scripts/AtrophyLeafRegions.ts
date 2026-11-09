/** Native UI geometry for the offline seam audit; no output masks or domain changes. */
import {findSceneObjectByName as object, nextFrame, sleep, withTimeout} from "Leaf.lspkg/Utils/common/Utils"
import {findInteractableByName} from "Leaf.lspkg/Interactors/InteractableUtils"
import {BackPlate} from "UIKit.lspkg/Scripts/BackPlate"
import {AtrophyLeafInteractor, main} from "./AtrophyLeafInteractor"
import {AtrophySliceFocus} from "./AtrophySliceFocus"
import {textWorldCorners} from "./AtrophyLayoutUI"
import {expect} from "Leaf.lspkg/Utils/common/Expect"
import {AtrophyClinicians} from "./AtrophyClinicians"
import {AtrophyPlacement} from "./AtrophyPlacement"
import {RoundedRectangle} from "UIKit.lspkg/Scripts/Visuals/RoundedRectangle/RoundedRectangle"
import {ATROPHY_LAYOUT} from "./AtrophyLayout"

const xyz = (p: vec3): number[] => [p.x, p.y, p.z]
interface RegionQuad {region: string; name: string; kind: string; corners_cm: number[][]}
const quadWorld = (root: SceneObject, size: vec2): vec3[] => [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([x, y]) => root.getTransform().getWorldTransform().multiplyPoint(new vec3(x * size.x / 2, y * size.y / 2, 0)))

/** BackPlate dimensions and painted glyphs, never collider or layout bounds. */
function uiRegions(find: (name: string) => SceneObject = object): RegionQuad[] {
  const regions: RegionQuad[] = []
  const plate = (region: string, name: string) => {
    const root = find(name), back = root.getComponent(BackPlate.getTypeName()) as BackPlate
    if (!back) throw new Error(`Native region ${name} has no BackPlate`)
    regions.push({region, name, kind: "native-backplate-quad", corners_cm: quadWorld(root, back.size).map(xyz)})
  }
  const text = (region: string, name: string) => {
    const component = find(name).getComponent("Component.Text") as Text
    const corners = textWorldCorners(component)
    regions.push({region, name, kind: "native-painted-glyph-quad", corners_cm: [0, 2, 3, 1].map(i => xyz(corners[i]))})
  }
  for (const side of ["Subject", "Common"]) {
    const prefix = side.toLowerCase()
    for (let i = 0; i < 7; i++) {
      const region = `${prefix}-slice-card-${i}`
      plate(region, `${side}SliceTile${i}`)
      text(region, `${side}SliceCut${i}`)
    }
    text(`${prefix}-slice-heading`, `${side}SliceHeading`)
    plate(`${prefix}-label-plate`, `${side}SpaceUI`)
    for (const suffix of ["SpaceLabel", "RegionVolume", "VolumeContext"]) {
      text(`${prefix}-${suffix.replace(/[A-Z]/g, c => `-${c.toLowerCase()}`).slice(1)}`, `${side}${suffix}`)
    }
    text(`${prefix}-focus-cut`, `${side}FocusCut`)
  }
  plate("key-slice-card", "SliceFocus")
  text("key-slice-card", "SliceFocusHeading")
  return regions
}

/** Every authored tile, cut label and title must fit the current centre-view display, without cropping. */
export function checkGridDisplay(): void {
  const camera = object("Camera Object").getComponent("Component.Camera") as Camera
  const view = camera.getTransform().getInvertedWorldTransform(), projection = camera.getProjectionMatrix()
  const limits = [1 / projection.column0.x - 0.003, 1 / projection.column1.y - 0.003]
  const bounds = uiRegions().filter(region => /^(subject|common)-slice-(card-\d+|heading)$/.test(region.region)).map(region => {
    const points = region.corners_cm.map(p => view.multiplyPoint(new vec3(p[0], p[1], p[2])))
    points.forEach(p => expect(-p.z).toBeGreaterThan(1))
    return {name: region.name, region: region.region, max_x: Math.max(...points.map(p => Math.abs(p.x / p.z))),
      max_y: Math.max(...points.map(p => Math.abs(p.y / p.z)))}
  })
  expect(bounds.length).toBe(30) // 14 physical BackPlates, 14 cut labels and both painted titles
  console.log("Atrophy native centre-grid display containment: " + JSON.stringify({limits, quads: bounds}))
  for (const bound of bounds) {
    expect(bound.max_x).toBeLessThan(limits[0])
    expect(bound.max_y).toBeLessThan(limits[1])
  }
}

export async function captureRegionGeometry(): Promise<void> {
  const focus = object("AtrophySliceFocus").getComponent(AtrophySliceFocus.getTypeName()) as AtrophySliceFocus
  const previous = focus.selectedLevel, hand = new AtrophyLeafInteractor()
  if (previous !== 3) {
    await hand.trigger(findInteractableByName("SubjectSliceTile3"))
    await sleep(500)
  }
  const regions = uiRegions(), run = main()
  const placement = object("AtrophyPlacement").getComponent(AtrophyPlacement.getTypeName()) as AtrophyPlacement
  const group = object("Clinicians").getComponent(AtrophyClinicians.getTypeName()) as AtrophyClinicians
  await withTimeout(group.ready, 30000, "Clinicians did not finish spawning for tabletop measurement")
  const top = placement.lastPosition.y, table = object("TableOccluder").getTransform().getWorldTransform()
  const path = run.travelPath.getTransform().getWorldTransform(), vertices = run.travelGeometry.vertices
  console.log("Atrophy native tabletop metadata: " + JSON.stringify({
    schema: "native-tabletop-fit-1", table_plane_y_cm: top, morph_weight: run.morphWeight,
    root_cm: xyz(run.getTransform().getWorldPosition()),
    brain_bases: ["SubjectBrain", "CommonBrain", "MorphBrain"].map(name => {
      const node = object(name), at = node.getTransform().getWorldPosition()
      return {name, enabled: node.enabled, centre_cm: xyz(at), base_on_placed_plane_cm: [at.x, top, at.z]}
    }),
    handle_cm: xyz(run.brainHandle.getTransform().getWorldPosition()),
    table_corners_cm: ATROPHY_LAYOUT.tableOccluder.corners.map(([x, z]) => xyz(table.multiplyPoint(new vec3(x, 0, z)))),
    path_vertices_cm: Array.from({length: vertices.length / 3}, (_, i) => xyz(path.multiplyPoint(new vec3(vertices[i * 3], vertices[i * 3 + 1], vertices[i * 3 + 2])))),
    clinicians: group.clinicians.map(person => ({seat_cm: xyz(person.root.getTransform().getWorldPosition()),
      eyes_cm: ["L_eye_rig_ZRO", "R_eye_rig_ZRO"].map(name => xyz(object(name, person.root).getTransform().getWorldPosition()))})),
  }))
  console.log("Atrophy native region metadata: " + JSON.stringify({schema: "native-ui-region-quads-1", subject_cm: xyz(main().subjectAnchor.getTransform().getWorldPosition()), common_cm: xyz(main().commonAnchor.getTransform().getWorldPosition()), quad_count: regions.length}))
  for (const region of regions) console.log("Atrophy native region quad: " + JSON.stringify(region))
  if (previous !== 3) {
    await hand.trigger(findInteractableByName(`SubjectSliceTile${previous < 0 ? 3 : previous}`))
    await sleep(250)
  }
  if (focus.selectedLevel !== previous) throw new Error("Native region measurement did not restore the selected slice")
}

type Box = {name: string; min: vec2; max: vec2}
const corners = (min: vec3, max: vec3): vec3[] => [min.x, max.x].flatMap(x => [min.y, max.y].flatMap(y => [min.z, max.z].map(z => new vec3(x, y, z))))

/** Conservative local mesh boxes, including cortex, carried region and all seven anatomical sheets. */
function brainCorners(side: string): vec3[] {
  const root = object(`${side}Brain`)
  return root.getComponentsInDescendants("Component.RenderMeshVisual", false, true).flatMap(visual => {
    const transform = visual.getTransform().getWorldTransform()
    return corners(visual.mesh.aabbMin, visual.mesh.aabbMax).map(p => transform.multiplyPoint(p))
  })
}

/** Projection exclusion at the actual seated capture eye, through the full brain sweep and every selected slice.
 * Clinician bounds are deliberately conservative: real mesh world boxes above the Lens's own placed table plane.
 * Nothing reads the Preview room or its CG table. No FOV clipping: off-display cards must also clear the brains.
 */
export async function checkLayoutProjection(): Promise<void> {
  const group = object("Clinicians").getComponent(AtrophyClinicians.getTypeName()) as AtrophyClinicians
  await withTimeout(group.ready, 30000, "Clinicians did not finish spawning for the projection test")
  const camera = object("Camera Object").getTransform(), eye = camera.getWorldPosition()
  // Both fixed seated eyes are required in the capture regression runner: the original
  // 25-degree view and the plate-calibrated 15-degree view. The same strict tolerance applies.
  const seatedEyes = [new vec3(-122.6, -14, -286.4), new vec3(-122.6, -17.6418342590332, -286.4)]
  expect(Math.min(...seatedEyes.map(position => eye.distance(position)))).toBeLessThan(0.1)
  const view = camera.getInvertedWorldTransform()
  const box = (name: string, points: vec3[], padding = 0): Box => {
    const projected = points.map(p => {
      const v = view.multiplyPoint(p), near = -v.z - padding, far = -v.z + padding
      if (!(near > 1)) throw new Error("Projection geometry lies behind the seated eye")
      // A camera-space cube contains the radius-padding sphere under every camera rotation.
      // Scalar bounds avoid constructing eight native vec3 objects for every sample corner.
      return [Math.min((v.x - padding) / near, (v.x - padding) / far), Math.min((v.y - padding) / near, (v.y - padding) / far),
        Math.max((v.x + padding) / near, (v.x + padding) / far), Math.max((v.y + padding) / near, (v.y + padding) / far)]
    })
    if (!projected.length) throw new Error(`No projected geometry for ${name}`)
    return {name, min: new vec2(Math.min(...projected.map(p => p[0])), Math.min(...projected.map(p => p[1]))),
      max: new vec2(Math.max(...projected.map(p => p[2])), Math.max(...projected.map(p => p[3])))}
  }
  const overlaps = (a: Box, b: Box) => Math.min(a.max.x, b.max.x) > Math.max(a.min.x, b.min.x) && Math.min(a.max.y, b.max.y) > Math.max(a.min.y, b.min.y)
  const stationary = ["Subject", "Common"].map(side => {
    for (let node = object(`${side}Brain`); node; node = node.getParent()) expect(node.enabled).toBe(true)
    return box(`${side}Brain`, brainCorners(side))
  })
  // A linear blend stays inside the union of both measured anatomical endpoint bounds.
  const offsets = ["Subject", "Common"].flatMap(side => {
    const origin = object(`${side}Brain`).getTransform().getWorldPosition()
    return brainCorners(side).map(p => p.sub(origin))
  })
  // Inflate by half a sample's arc length in every world direction: the envelope also contains
  // every continuous position between the 97 samples, rather than certifying only 97 instants.
  const halfStep = main().travelAt(0).length / 192
  const swept = Array.from({length: 97}, (_, i) => {
    const at = main().travelAt(i / 96).position
    return box(`MorphBrain@${i}/96`, offsets.map(p => p.add(at)), halfStep)
  })
  const placement = object("AtrophyPlacement").getComponent(AtrophyPlacement.getTypeName()) as AtrophyPlacement
  expect(placement.placed).toBe(true)
  // Surface Placement defines the horizontal table plane, independent of any room render or photo.
  const top = placement.lastPosition.y
  // Cache hierarchy discovery once; repeated full-rig searches exhaust Lens's per-frame host-call budget.
  const clinicianVisuals: RenderMeshVisual[][] = []
  for (const person of group.clinicians) {
    clinicianVisuals.push(person.root.getComponentsInDescendants("Component.RenderMeshVisual", false, true))
    await sleep(50)
  }
  const clinicianBoxes = async (): Promise<Box[]> => {
    const bounds: Box[] = []
    for (const [i, visuals] of clinicianVisuals.entries()) {
      const points = visuals.flatMap(visual => {
        if (!visual.enabled || !visual.sceneObject.enabled) return []
        const min = visual.worldAabbMin(), max = visual.worldAabbMax()
        if (max.y < top) return []
        return corners(new vec3(min.x, Math.max(top, min.y), min.z), max)
      })
      bounds.push(box(`Clinician${i}AboveTable`, points))
      await nextFrame() // native bounds are read one rig per frame, within the engine's host-call budget
    }
    return bounds
  }
  const headNames = new Set(["C_head_GEO", "C_hair_GEO", "C_brow_GEO", "L_eye_GEO", "R_eye_GEO"])
  const faceBoxes = () => clinicianVisuals.map((visuals, i) => box(`Clinician${i}FaceAndHair`, visuals.filter(visual =>
    visual.enabled && visual.sceneObject.enabled && (headNames.has(visual.sceneObject.name) ||
      group.clinicians[i].longHair?.sceneObject.isSame(visual.sceneObject))).flatMap(visual => corners(visual.worldAabbMin(), visual.worldAabbMax()))))
  const speechViews = group.clinicians.map(person => {
    const root = person.bubble.sceneObject
    return {root, text: object("TooltipText", root).getComponent("Component.Text") as Text,
      backing: root.getComponent(RoundedRectangle.getTypeName()) as RoundedRectangle,
      tail: object("TooltipTail", root).getComponent("Component.RenderMeshVisual") as RenderMeshVisual}
  })
  const speechBoxes = () => speechViews.flatMap(({root, text, backing, tail}, i) => {
    if (!text.enabled || text.textFill.color.w < 0.01) return []
    const name = !main().hasDragged && i === 1 ? "OnboardingBubble" : `ClinicianBubble${i}`
    return [box(name, [...quadWorld(root, backing.size), ...textWorldCorners(text), ...corners(tail.worldAabbMin(), tail.worldAabbMax())])]
  })
  expect(main().hasDragged).toBe(false) // include the real native onboarding bubble before the first drag
  const uiNodes = new Map<string, SceneObject>()
  const remember = (node: SceneObject) => {
    uiNodes.set(node.name, node)
    for (let i = 0; i < node.getChildrenCount(); i++) remember(node.getChild(i))
  }
  for (const name of ["SubjectSpaceUI", "CommonSpaceUI", "SubjectSlices", "CommonSlices", "AtrophySliceFocus"]) remember(object(name))
  const findUI = (name: string): SceneObject => {
    const node = uiNodes.get(name)
    if (!node) throw new Error(`Projection UI node missing: ${name}`)
    return node
  }
  await sleep(50)
  const focus = findUI("AtrophySliceFocus").getComponent(AtrophySliceFocus.getTypeName()) as AtrophySliceFocus
  const previous = focus.selectedLevel, failures: string[] = []
  const initialClinicians = await clinicianBoxes(), initialSpeech = speechBoxes(), initialFaces = faceBoxes()
  const measuredUI = () => uiRegions(findUI).map(region => {
    for (let node = findUI(region.name); node; node = node.getParent()) expect(node.enabled).toBe(true)
    return {...box(region.name, region.corners_cm.map(p => new vec3(p[0], p[1], p[2]))), region: region.region}
  })
  const clearGrids = (ui: ReturnType<typeof measuredUI>, faces: Box[], phase: string) => {
    const grids = ui.filter(item => /^(subject|common)-slice-(card-\d+|heading)$/.test(item.region))
    for (const grid of grids) {
      for (const face of faces) if (overlaps(grid, face)) failures.push(`${grid.name}/${face.name}/${phase}`)
      for (const other of ui) if (grid.region !== other.region && overlaps(grid, other)) failures.push(`${grid.name}/${other.name}/${phase}`)
    }
  }
  const layout = ["Subject", "Common"].map(side => {
    const brain = brainCorners(side), regions = uiRegions(findUI)
    const grid = regions.filter(region => region.region.startsWith(`${side.toLowerCase()}-slice-`)).flatMap(region => region.corners_cm)
    const brainTop = Math.max(...brain.map(point => point.y)), brainHeight = brainTop - Math.min(...brain.map(point => point.y))
    const gap = Math.min(...grid.map(point => point[1])) - brainTop
    expect(gap).toBeGreaterThan(brainHeight / 2)
    const card = findUI(`${side}SpaceUI`).getTransform(), label = measuredUI().find(region => region.name === `${side}SpaceUI`)!
    const matrix = object("Camera Object").getComponent("Component.Camera").getProjectionMatrix()
    const roll = Math.atan2(card.right.dot(camera.up), card.right.dot(camera.right)) * 180 / Math.PI
    expect(Math.abs(roll)).toBeLessThan(1)
    expect(Math.max(Math.abs(label.min.x), Math.abs(label.max.x))).toBeLessThan(1 / matrix.column0.x - 0.003)
    expect(Math.max(Math.abs(label.min.y), Math.abs(label.max.y))).toBeLessThan(1 / matrix.column1.y - 0.003)
    expect(Math.min(...regions.find(region => region.name === `${side}SpaceUI`)!.corners_cm.map(point => point[1]))).toBeGreaterThan(top)
    return {side, brain_height_cm: brainHeight, grid_gap_cm: gap, grid_scale: xyz(findUI(`${side}Slices`).getTransform().getLocalScale()),
      label_scale: xyz(card.getLocalScale()), label_roll_deg: roll, label_center_view_y: (label.min.y + label.max.y) / 2}
  })
  expect(Math.abs(layout[0].label_center_view_y - layout[1].label_center_view_y)).toBeLessThan(0.005)
  console.log("Atrophy native revised layout: " + JSON.stringify(layout))
  expect(initialSpeech.some(bubble => bubble.name === "OnboardingBubble")).toBe(true)
  for (const bubble of initialSpeech) for (const face of initialFaces) {
    if (overlaps(bubble, face)) failures.push(`${bubble.name}/${face.name}/onboarding`)
  }
  try {
    for (const level of [-1, 0, 1, 2, 3, 4, 5, 6]) {
      if (focus.selectedLevel !== level) {
        if (level < 0) focus.close()
        else focus.select(level)
        await sleep(150)
      }
      const ui = measuredUI()
      clearGrids(ui, initialFaces, `slice=${level}`)
      const clinicians = initialClinicians, speech = initialSpeech
      for (const brain of [...stationary, ...swept]) for (const other of [...ui, ...clinicians, ...speech]) {
        if (overlaps(brain, other)) failures.push(`${brain.name}/${other.name}/slice=${level}`)
      }
      if (level < 0) {
        for (const b of [...stationary, swept[48], ...ui, ...clinicians, ...initialFaces, ...speech]) console.log("Atrophy projection box: " + JSON.stringify({name: b.name, min: [b.min.x, b.min.y], max: [b.max.x, b.max.y]}))
      }
      console.log(`Atrophy projection checked slice=${level}; overlaps=${failures.length}`)
    }
  } finally {
    if (previous < 0) focus.close()
    else if (focus.selectedLevel !== previous) focus.select(previous)
  }
  // Native input also exercises all speech phases and the real brain-following head poses.
  const hand = new AtrophyLeafInteractor()
  for (const weight of [0.25, 0.5, 0.75, 1, 0]) {
    await hand.dragTo(weight, 0.6, 700, 0.001)
    await sleep(500)
    expect(object("MorphBrain").enabled).toBe(weight > 0 && weight < 1)
    const speech = speechBoxes(), clinicians = await clinicianBoxes(), faces = faceBoxes()
    clearGrids(measuredUI(), faces, `weight=${weight}`)
    for (const bubble of speech) for (const face of faces) {
      if (overlaps(bubble, face)) failures.push(`${bubble.name}/${face.name}/weight=${weight}`)
    }
    for (const brain of [...stationary, ...swept]) for (const other of [...speech, ...clinicians]) {
      if (overlaps(brain, other)) failures.push(`${brain.name}/${other.name}/weight=${weight}`)
    }
    console.log(`Atrophy projection checked weight=${weight}; overlaps=${failures.length}`)
  }
  console.log("Atrophy projection clearance: " + JSON.stringify({eye_cm: xyz(eye), table_plane_y_cm: top, continuous_padding_cm: halfStep, anatomical_samples: 97, slice_states: 8, speech_states: 5, onboarding_bubble: true, faces_and_hair: 3, overlap_count: failures.length, overlaps: failures.slice(0, 30)}))
  expect(failures.length).toBe(0)
}
