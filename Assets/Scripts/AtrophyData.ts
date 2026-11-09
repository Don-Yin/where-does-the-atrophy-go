/** Fixed public-scan metadata. Owns data validation, not UI or registration. */
export interface AtrophyRegionData {
  scan: string
  region: string
  ventricle_ml: {subject: number; mni: number}
  mni_z_mm: number[]
  subject_z_mm: number[]
  key_slice: {[space: string]: {
    world_z_mm: number
    coordinate_space: string
    area_mm2: number
    grid_step_mm: number
    mask_source: string
    texture_prefix: string
    candidates: {world_z_mm: number; area_mm2: number}[]
  }}
  slice_orientation: {[space: string]: {
    source_axis_codes: string[]
    source_affine: number[][]
    display: string
    image_x_world_mm: number[]
    image_y_world_mm: number[]
  }}
}

export const REGION = JSON.parse(
  (requireAsset("../Brain/region.json") as JsonAsset).getString(),
) as AtrophyRegionData

if (REGION.mni_z_mm.length !== 7 || REGION.subject_z_mm.length !== 7) {
  throw new Error("Atrophy: the scan must provide seven paired slice levels")
}

for (const space of ["subject", "common"]) {
  const key = REGION.key_slice[space]
  if (!key || !Number.isFinite(key.world_z_mm) || key.area_mm2 <= 0 || !key.candidates.length ||
      key.area_mm2 !== Math.max(...key.candidates.map((candidate) => candidate.area_mm2))) {
    throw new Error(`Atrophy: invalid largest-ROI key slice for ${space}`)
  }
}

export const MORPH_TARGET = "mni"
export const ENDPOINT_EPSILON = 0.001
