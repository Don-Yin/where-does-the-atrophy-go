/** One table-plane arc for the carried brain, its pinch target, dashed guide and LEAF drags.
 * Weight is normalized arc length, not the chord's X coordinate. +X subject → common bows toward local +Z (the viewer).
 */
export const TRAVEL_SAG = 0.18
export const TRAVEL_DASH_COUNT = 15
export const TRAVEL_DASH_CM = 2
export const TRAVEL_WIDTH_CM = 0.5
export const TRAVEL_HEIGHT_CM = 0.12
export const TRAVEL_DASH_SEGMENTS = 2

export type TravelSample = {position: vec3; tangent: vec3; length: number}

/** A circular arc with an 18%-of-span sag. The tangent is unit length; equal weight steps cover equal distances. */
export function sampleTravelArc(from: vec3, to: vec3, weight: number, normal = vec3.up()): TravelSample {
  const chord = to.sub(from), span = chord.length
  if (span <= 0) throw new Error("Atrophy: travel anchors must be distinct")
  const along = chord.normalize(), bow = along.cross(normal).normalize()
  const halfAngle = 2 * Math.atan(2 * TRAVEL_SAG)
  const radius = span / (2 * Math.sin(halfAngle))
  const angle = (Math.max(0, Math.min(1, weight)) - 0.5) * 2 * halfAngle
  return {
    position: vec3.lerp(from, to, 0.5).add(along.uniformScale(radius * Math.sin(angle)))
      .add(bow.uniformScale(radius * (Math.cos(angle) - Math.cos(halfAngle)))),
    tangent: along.uniformScale(Math.cos(angle)).sub(bow.uniformScale(Math.sin(angle))),
    length: 2 * halfAngle * radius,
  }
}

/** The CPU arrays submitted to MeshBuilder are retained for LEAF: never read a runtime-built mesh's native buffers back. */
export type TravelPathMesh = {
  mesh: RenderMesh
  vertices: number[]
  indices: number[]
  dashRanges: [number, number][]
}

/** Builds one mesh, no per-dash objects. Inputs are in the guide's own frame; its authored Y stays on the table. */
export function buildTravelPathMesh(from: vec3, to: vec3): TravelPathMesh {
  from = new vec3(from.x, 0, from.z)
  to = new vec3(to.x, 0, to.z)
  const length = sampleTravelArc(from, to, 0).length
  const gap = (length - TRAVEL_DASH_COUNT * TRAVEL_DASH_CM) / (TRAVEL_DASH_COUNT - 1)
  if (gap <= 0) throw new Error("Atrophy: travel guide is too short for its dashes")
  const vertices: number[] = [], indices: number[] = [], dashRanges: [number, number][] = []
  const triangle = (a: number, b: number, c: number) => indices.push(a, b, c)
  const quad = (a: number, b: number, c: number, d: number) => { triangle(a, b, c); triangle(a, c, d) }
  for (let dash = 0; dash < TRAVEL_DASH_COUNT; dash++) {
    const start = dash * (TRAVEL_DASH_CM + gap), end = start + TRAVEL_DASH_CM
    dashRanges.push([start, end])
    const first = vertices.length / 3
    for (let section = 0; section <= TRAVEL_DASH_SEGMENTS; section++) {
      const distance = start + (end - start) * section / TRAVEL_DASH_SEGMENTS
      const sample = sampleTravelArc(from, to, distance / length)
      const side = sample.tangent.cross(vec3.up()).uniformScale(TRAVEL_WIDTH_CM / 2)
      // Each ring runs clockwise around the tangent: upper left, upper right, lower right, lower left.
      for (const [across, up] of [[-1, 1], [1, 1], [1, -1], [-1, -1]]) {
        const point = sample.position.add(side.uniformScale(across)).add(new vec3(0, up * TRAVEL_HEIGHT_CM / 2, 0))
        vertices.push(point.x, point.y, point.z)
      }
      if (section > 0) {
        const previous = first + (section - 1) * 4, current = previous + 4
        for (let corner = 0; corner < 4; corner++) quad(previous + corner, previous + (corner + 1) % 4, current + (corner + 1) % 4, current + corner)
      }
    }
    quad(first + 3, first + 2, first + 1, first)
    const last = first + TRAVEL_DASH_SEGMENTS * 4
    quad(last, last + 1, last + 2, last + 3)
  }
  const builder = new MeshBuilder([{name: "position", components: 3}])
  builder.topology = MeshTopology.Triangles
  builder.indexType = MeshIndexType.UInt16
  builder.appendVerticesInterleaved(vertices)
  builder.appendIndices(indices)
  builder.updateMesh()
  return {mesh: builder.getMesh(), vertices, indices, dashRanges}
}
