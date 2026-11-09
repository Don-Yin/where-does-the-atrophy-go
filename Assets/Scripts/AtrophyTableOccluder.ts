/** A depth-only prism with the measured tabletop's four corners; reuse the authored invisible material. */
export function buildTableOccluder(corners: readonly (readonly number[])[], depth: number): RenderMesh {
  if (corners.length !== 4 || !(depth > 0)) throw new Error("The table occluder needs four corners and a positive depth")
  const positions = [0, -depth].flatMap(y => corners.flatMap(([x, z]) => [x, y, z]))
  const indices = [0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7]
  for (let a = 0; a < 4; a++) {
    const b = (a+1)%4
    indices.push(a, b, a+4, b, b+4, a+4)
  }
  const builder = new MeshBuilder([{name: "position", components: 3}])
  builder.topology = MeshTopology.Triangles
  builder.indexType = MeshIndexType.UInt16
  builder.appendVerticesInterleaved(positions)
  builder.appendIndices(indices)
  builder.updateMesh()
  return builder.getMesh()
}
