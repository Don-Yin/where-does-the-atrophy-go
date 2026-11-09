/** One seated-table layout, in authored cm. Placement applies its one shared world scale to every view and target,
 * except the clinicians and the table occluder: they stand in for real people and the real table, so they keep real size (world cm). */
import {buildTableOccluder} from "./AtrophyTableOccluder"

const ENDPOINT_SPACING = 72
export const ATROPHY_LAYOUT = {
  scale: 0.8,
  endpointSpacing: ENDPOINT_SPACING,
  tile: 4,
  tileGap: 0.4,
  sliceColumns: 4,
  sliceRowGap: 1.4,
  // The unchanged physical grids sit farther behind the heads to fit the centre field without shrinking.
  // Independent outward offsets align their projected centres with their own brains.
  sliceScale: 1.8,
  sliceOutset: [36.5, 44.5],
  slicePosition: [58.5, -210],
  labelWidth: 18,
  labelScale: 0.6,
  labelInset: 12,
  // Smaller upright plates clear the entire bowed brain sweep while staying inside the centre display.
  labelPosition: [3.3, 52],
  focusHeight: 22,
  focusCardWidth: 24,
  focusCardHeight: 16,
  focusImageHeight: 9.5,
  // Preserve the table composition and reticle anchor when decorative objects are removed.
  placementMargin: 35.75,
  onboardingHeight: 3,
  // Real world cm in the Lens's placed table frame, with -z away from the viewer.
  // These offsets and the projection check do not read a Preview room or background table.
  clinicianSpacing: 65,
  bubbleScale: 0.94,
  bubbleBeside: [30, 34, 30],
  bubbleRise: 13,
  // Three far-side chairs; head size, seated height and gaze limits are unchanged.
  clinicianPosition: [0.430893344, -37, -137.927913557],
  // Depth-only tabletop fitted to east-seated.png; local +z runs from its far edge toward the viewer.
  tableOccluder: {
    centre: [3.59591472, 0, -73.897856131], yawDegrees: -0.49999518, depth: 75,
    corners: [[-75.448193336, 0], [75.448193336, 0], [69.72453729, 137.984670064], [-81.171849383, 137.984670064]],
  },
} as const

function realSize(transform: Transform, worldCm: readonly number[], worldScale: readonly number[]): void {
  const k = 1 / ATROPHY_LAYOUT.scale
  transform.setLocalPosition(new vec3(worldCm[0], worldCm[1], worldCm[2]).uniformScale(k))
  transform.setLocalScale(new vec3(worldScale[0], worldScale[1], worldScale[2]).uniformScale(k))
}

/** Run before child OnStart events, so paths, SIK targets and downloaded clinicians all use this same frame. */
export function layoutAtrophySet(root: SceneObject): void {
  root.getTransform().setLocalScale(vec3.one().uniformScale(ATROPHY_LAYOUT.scale))
  for (let i = 0; i < root.getChildrenCount(); i++) {
    const child = root.getChild(i), transform = child.getTransform(), position = transform.getLocalPosition()
    const side = child.name.startsWith("Subject") ? -1 : child.name.startsWith("Common") ? 1 : 0
    if (side && ["SubjectBrain", "CommonBrain", "SubjectSpaceUI", "CommonSpaceUI", "SubjectSlices", "CommonSlices"].includes(child.name)) {
      const label = child.name.endsWith("SpaceUI"), slices = child.name.endsWith("Slices")
      const [y, z] = label ? ATROPHY_LAYOUT.labelPosition : slices ? ATROPHY_LAYOUT.slicePosition : [position.y, position.z]
      const inset = label ? ATROPHY_LAYOUT.labelInset : slices ? -ATROPHY_LAYOUT.sliceOutset[side < 0 ? 0 : 1] : 0
      transform.setLocalPosition(new vec3(side * (ATROPHY_LAYOUT.endpointSpacing / 2 - inset), y, z))
      if (label || slices) transform.setLocalScale(vec3.one().uniformScale(label ? ATROPHY_LAYOUT.labelScale : ATROPHY_LAYOUT.sliceScale))
    } else if (child.name === "AtrophySliceFocus") {
      transform.setLocalPosition(new vec3(0, ATROPHY_LAYOUT.focusHeight, position.z))
    } else if (child.name === "Clinicians") {
      realSize(transform, ATROPHY_LAYOUT.clinicianPosition, [1, 1, 1])
    } else if (child.name === "TableOccluder") {
      const table = ATROPHY_LAYOUT.tableOccluder
      realSize(transform, table.centre, [1, 1, 1])
      transform.setLocalRotation(quat.angleAxis(table.yawDegrees * Math.PI / 180, vec3.up()))
      const visual = child.getComponent("Component.RenderMeshVisual") as RenderMeshVisual
      visual.mesh = buildTableOccluder(table.corners, table.depth)
    }
  }
}
