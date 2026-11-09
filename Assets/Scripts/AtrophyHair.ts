/** The female clinician's complete, licensed hairstyle (Asset Library: Blonde Curly Wig).
 * The mesh includes the scalp and flowing locks; it replaces, rather than extends, Bitmoji's short cap.
 * All lengths below are in the Bitmoji glTF's mesh metres. No runtime mesh buffers are read or rebuilt.
 */
import {obj} from "./AtrophyLayoutUI"

/** Fit the library's human-proportioned wig to the taller Bitmoji skull. The lower edge reaches below the clavicles. */
const FIT = new vec3(1.15, 1.7, 1.4)
/** Seat the curl roots in the scalp; the wave's outer crest still rises above the native cap. */
const CROWN_CLEARANCE = 0.065

/** Attach the entire hair to the head in bind-pose coordinates, exactly as Bitmoji skins its original cap.
 * The original cap supplies its native inverse bind matrix and bounds only, then is disabled. */
export function attachLongHair(cap: RenderMeshVisual, head: SceneObject, mesh: RenderMesh, material: Material): RenderMeshVisual {
  const source = cap.mesh
  const inverse = source.extractBoneInverseMatrices()[source.extractBoneNames().indexOf("C_head_bind_JNT")]
  const anchor = obj(head, "LongHair")
  anchor.getTransform().setLocalTransform(inverse)
  const at = new vec3(
    -(mesh.aabbMin.x + mesh.aabbMax.x) * FIT.x / 2,
    source.aabbMax.y + CROWN_CLEARANCE - mesh.aabbMax.y * FIT.y,
    source.aabbMax.z + 0.025 - mesh.aabbMax.z * FIT.z,
  )
  const hair = obj(anchor, "ChestnutWaves", at)
  hair.getTransform().setLocalScale(FIT)
  const visual = hair.createComponent("Component.RenderMeshVisual") as RenderMeshVisual
  visual.mesh = mesh
  visual.mainMaterial = material
  cap.enabled = false
  console.log(`Atrophy long hair: source ${mesh.name}, fit ${FIT}, offset ${at}, cap ${source.aabbMin}..${source.aabbMax}`)
  return visual
}
