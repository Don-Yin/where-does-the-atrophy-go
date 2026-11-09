/** What makes a Bitmoji clinician read as NHS staff beyond the scrub colour: short sleeves ("bare below the elbows") cut into the Bitmoji's
 * own top, and an NHS-blue lanyard with a white ID card on the chest. Lengths are metres in the Bitmoji's mesh frame (the glTF's own unit).
 */
import {findSceneObjectByName} from "Leaf.lspkg/Utils/common/Utils"
import {obj} from "./AtrophyLayoutUI"

/** A unit cube, the same mesh as the table occluder. */
const BOX = requireAsset("../Meshes/TableBox.mesh") as RenderMesh
/** The sleeve ends this far from the shoulder joint toward the elbow (1 = the elbow), so the whole forearm is skin. */
const SLEEVE_END = 0.6
/** Vertices farther than this from an arm's axis belong to the torso, which the sleeve cut must leave alone. */
const ARM_REACH = 0.12
/** The lanyard is carried by this bone, which the chest of the top is skinned to. */
const CHEST_BONE = "C_spine0003_bind_JNT"

/** NHS blue (#005EB8), as the linear base colour the Bitmoji material multiplies into its textures. */
export const NHS_BLUE = new vec4(0, 0.112, 0.479, 1)
const CARD_WHITE = new vec4(1, 1, 1, 1)
/** Each strap runs from `neckX` beside the collar down to the card's clip in `links` straight pieces, each lying on the chest where it is. */
const STRAP = {width: 0.014, thickness: 0.004, neckX: 0.05, neckY: 0.765, links: 4}
const CARD = {width: 0.048, height: 0.072, thickness: 0.004, topY: 0.68, band: 0.014}
/** How far the lanyard stands off the cloth, so it never z-fights with it. */
const CLEARANCE = 0.002

/** Source vertices and modified indices actually uploaded; LEAF must never read built-mesh buffers. */
export interface UniformGeometry {positions: Float32Array; indices: number[]; bones: string[]; inverseBind: mat4[]}

/** Replaces the top's mesh with one whose sleeves end at the last ring of vertices short of `SLEEVE_END` of the way down each upper arm: every
 * triangle of the arm that reaches past that plane (square to the arm in the bind pose) is collapsed to a point, and the ring left behind is the
 * clean edge. The collapsed triangles stay in the index list as zero-area ones: taking them out of it, or clipping them exactly at the plane with
 * appended vertices, left a shard of sleeve floating beside each head. */
export function shortenSleeves(top: RenderMeshVisual): UniformGeometry {
  const mesh = top.mesh
  const bones = mesh.extractBoneNames(), inverses = mesh.extractBoneInverseMatrices()
  const bind = (name: string) => inverses[bones.indexOf(name)].inverse().multiplyPoint(vec3.zero())
  const positions = mesh.getVertexDataForAttribute("position")
  const arms = ["L", "R"].map((side) => {
    const shoulder = bind(`${side}_armUpper0001_bind_JNT`), upperArm = bind(`${side}_armLower0001_bind_JNT`).sub(shoulder)
    const axis = upperArm.normalize(), end = shoulder.add(upperArm.uniformScale(SLEEVE_END))
    const offset = (v: number) => new vec3(positions[3 * v], positions[3 * v + 1], positions[3 * v + 2]).sub(end)
    /** Signed distance past the cut plane: positive is the part to remove. */
    const past = (v: number) => offset(v).dot(axis)
    return {past, onArm: (v: number) => offset(v).sub(axis.uniformScale(past(v))).length < ARM_REACH}
  })

  const indices = Array.from(mesh.getIndexBuffer())
  for (let i = 0; i < indices.length; i += 3) {
    const triangle = indices.slice(i, i + 3)
    if (arms.some(({past, onArm}) => triangle.every(onArm) && triangle.some((v) => past(v) > 0))) indices[i + 1] = indices[i + 2] = indices[i]
  }
  const builder = MeshBuilder.createFromMesh(mesh)
  builder.eraseIndices(0, builder.getIndicesCount())
  builder.appendIndices(indices)
  builder.updateMesh()
  top.mesh = builder.getMesh()
  return {positions, indices, bones, inverseBind: inverses}
}

/** An NHS-blue lanyard (two straps from the sides of the neck down to a clip) with a white ID card under it, resting on the front of `top`'s chest
 * and carried by the chest bone so it sways with the torso. `fabric` is the Bitmoji material, cloned once per colour. */
export function addLanyard(avatar: SceneObject, top: RenderMeshVisual, fabric: Material): void {
  const mesh = top.mesh
  const positions = mesh.getVertexDataForAttribute("position")
  /** The front-most point of the top within a window of the chest (grown until it holds a vertex): the surface the lanyard lies on. */
  const front = (x: number, y: number, halfWidth: number, halfHeight: number) => {
    let z = -Infinity
    for (let grow = 1; z === -Infinity; grow *= 1.5) {
      for (let i = 0; i < positions.length; i += 3) {
        if (Math.abs(positions[i] - x) <= halfWidth * grow && Math.abs(positions[i + 1] - y) <= halfHeight * grow) z = Math.max(z, positions[i + 2])
      }
    }
    return z
  }
  const paint = (colour: vec4) => {
    const material = fabric.clone()
    material.mainPass["baseColorFactor"] = colour
    return material
  }
  const blue = paint(NHS_BLUE), white = paint(CARD_WHITE)
  // The skin puts a mesh point where boneWorld × inverseBind sends it, and the rig loads in a different pose from its bind pose; the inverse bind
  // matrix alone takes the mesh's frame into the bone's, so a lanyard laid out in mesh metres below it lies on the top exactly as the skin does.
  const group = obj(findSceneObjectByName(CHEST_BONE, avatar), "Lanyard")
  group.getTransform().setLocalTransform(mesh.extractBoneInverseMatrices()[mesh.extractBoneNames().indexOf(CHEST_BONE)])
  /** A box of `size` centred on `centre`, long along `along` and as thin as possible toward the front. */
  const part = (name: string, material: Material, centre: vec3, size: vec3, along = vec3.up()) => {
    const y = along.normalize(), z = vec3.forward().sub(y.uniformScale(y.dot(vec3.forward()))).normalize(), x = y.cross(z)
    const axis = (v: vec3, length: number) => new vec4(v.x * length, v.y * length, v.z * length, 0)
    const piece = obj(group, name)
    piece.getTransform().setLocalTransform(mat4.fromColumns(axis(x, size.x), axis(y, size.y), axis(z, size.z), new vec4(centre.x, centre.y, centre.z, 1)))
    const visual = piece.createComponent("Component.RenderMeshVisual") as RenderMeshVisual
    visual.mesh = BOX
    visual.mainMaterial = material
  }

  const cardY = CARD.topY - CARD.height / 2
  const cardZ = front(0, cardY, CARD.width / 2, CARD.height / 2) + CARD.thickness / 2 + CLEARANCE
  for (const side of [-1, 1]) {
    /** The strap's centre line `k` of the way from the collar (0) to the clip (1). */
    const strap = (k: number) => {
      const x = side * STRAP.neckX * (1 - k), y = STRAP.neckY + (CARD.topY - STRAP.neckY) * k
      return new vec3(x, y, k === 1 ? cardZ : front(x, y, 0.015, 0.012) + STRAP.thickness / 2 + CLEARANCE)
    }
    for (let link = 0; link < STRAP.links; link++) {
      const from = strap(link / STRAP.links), along = strap((link + 1) / STRAP.links).sub(from)
      part("Strap", blue, from.add(along.uniformScale(0.5)), new vec3(STRAP.width, along.length, STRAP.thickness), along)
    }
  }
  part("IdCard", white, new vec3(0, cardY, cardZ), new vec3(CARD.width, CARD.height, CARD.thickness))
  part("IdCardBand", blue, new vec3(0, CARD.topY - CARD.band / 2, cardZ + CARD.thickness / 2), new vec3(CARD.width, CARD.band, CARD.thickness / 4))
}
