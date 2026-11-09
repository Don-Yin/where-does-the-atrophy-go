/** Capture-only raw native RGB readback. Never changes a mesh, hand, face or brain pose. */
import {findSceneObjectByName as object} from "Leaf.lspkg/Utils/common/Utils"
import {AtrophyInspect} from "./AtrophyInspect"

let pending = false
let cameraMessages: SceneEvent
const cameraReceivers = new Map<string, (data: any) => void>()

type Transaction = {views: {tile: string, pose: number[]}[], centre: number[], return_seconds?: number, release_complete?: boolean}

function notify(message: Record<string, unknown>): void {
  // The same native editor-message bridge used by LEAF; no filesystem or network transport.
  //@ts-ignore
  Editor.context.postMessage({type: "AtrophyNativeMatte", ...message})
}

function poseSnapshot(camera: Camera) {
  const nodes = [camera.sceneObject]
  const collect = (node: SceneObject) => {
    nodes.push(node)
    for (let i = 0; i < node.getChildrenCount(); i++) collect(node.getChild(i))
  }
  collect(object("AtrophyExperience"))
  const values = nodes.flatMap(node => {
    const transform = node.getTransform(), p = transform.getLocalPosition(), q = transform.getLocalRotation(), s = transform.getLocalScale()
    return [p.x, p.y, p.z, q.x, q.y, q.z, q.w, s.x, s.y, s.z]
  })
  if (!values.every(Number.isFinite)) throw new Error("A native local transform is not finite")
  const identifiers = nodes.map(node => node.uniqueIdentifier)
  const encode = (ids: string[], numbers: number[]) => JSON.stringify(ids)+":"+Base64.encode(new Uint8Array(new Float64Array(numbers).buffer))
  // Camera rotation is the sole intentional difference between the six views.
  const core = identifiers.map((id, index) => ({id, index})).filter(row => row.id !== camera.sceneObject.uniqueIdentifier)
  const world = encode(core.map(row => row.id), core.flatMap(row => values.slice(row.index*10, row.index*10+10)))
  return {value: encode(identifiers, values), world, nodes: nodes.length,
    identifiers, names: nodes.map(node => node.name), values}
}

function objectState(node: SceneObject) {
  const t = node.getTransform(), v = (p: vec3) => ({x: p.x, y: p.y, z: p.z}), q = (p: quat) => ({x: p.x, y: p.y, z: p.z, w: p.w})
  return {name: node.name, uniqueId: node.uniqueIdentifier, enabled: node.enabled, transform: {
    worldPosition: v(t.getWorldPosition()), localPosition: v(t.getLocalPosition()),
    worldRotation: q(t.getWorldRotation()), localRotation: q(t.getLocalRotation()),
    worldScale: v(t.getWorldScale()), localScale: v(t.getLocalScale())}}
}

// Texture.control requires a valid provider. One shared tiny provider releases each
// finished readback's large storage without allocating another full-size texture.
const releasedReadback = ProceduralTextureProvider.createWithFormat(1, 1, TextureFormat.RGBA8Unorm)

async function encodeNativeFrame(target: Texture) {
  let frame: Texture = null, provider: ProceduralTextureProvider = null, pixels: Uint8Array = null
  try {
    frame = ProceduralTextureProvider.createFromTexture(target)
    const width = frame.getWidth(), height = frame.getHeight()
    pixels = new Uint8Array(width * height * 4)
    provider = frame.control as ProceduralTextureProvider
    provider.getPixels(0, 0, width, height, pixels)
    const samples = [[0, 0], [0.37, 0.31], [0.5, 0.5], [0.69, 0.44], [1, 1]].map(([u, v]) => {
      const x = Math.round(u*(width-1)), y = Math.round(v*(height-1)), i = (y*width+x)*4
      return {x, y, rgba: Array.from(pixels.slice(i, i+4))}
    })
    // Only the CPU readback copy becomes opaque; matte passes recover transmission.
    for (let i = 3; i < pixels.length; i += 4) pixels[i] = 255
    provider.setPixels(0, 0, width, height, pixels)
    const encoded = await new Promise<string>((resolve, reject) => Base64.encodeTextureAsync(frame, resolve,
      () => reject(new Error("Native RenderTarget PNG encoding failed")), CompressionQuality.MaximumQuality, EncodingType.Png))
    return {width, height, samples, encoded}
  } finally {
    if (frame) {
      frame.control = releasedReadback.control
      if (frame.getWidth() !== 1 || frame.getHeight() !== 1) throw new Error("Native readback texture retained its full-size provider")
    }
    provider = null
    frame = null
    pixels = null
  }
}

/** Returns before the native result HUD fades. An Inspect transaction freezes one real pose for all six views. */
export function scheduleNativeMatte(owner: BaseScriptComponent, tile: string, transactionText = ""): void {
  if (pending) throw new Error("Another native RenderTarget export is pending")
  if (!/^s\d{3}-[a-z]+-t[0-5]$/.test(tile)) throw new Error("Native matte tile must identify one configured state/view")
  const tx: Transaction = transactionText ? JSON.parse(transactionText) : null
  const matrixValid = (m: number[]) => Array.isArray(m) && m.length === 16 && m.every(Number.isFinite)
  if (tx && (tx.views.length !== 6 || !matrixValid(tx.centre) || tx.views.some((v, i) =>
    v.tile !== tile.replace(/-t[0-5]$/, `-t${i}`) || !matrixValid(v.pose)) ||
    tx.return_seconds !== undefined && !(Number.isFinite(tx.return_seconds) && tx.return_seconds > 0))) {
    throw new Error("Inspect transaction requires the six configured views and finite native return time")
  }
  if (tx && !cameraMessages) {
    // One enabled listener for the owner's lifetime. Removed MessageEvents retain
    // native host subscriptions/queues; creating one per view eventually floods them.
    cameraMessages = owner.createEvent("MessageEvent")
    cameraMessages.bind((message: MessageEvent) => {
      if (message.data?.type === "AtrophyNativeMatteCameraAck") cameraReceivers.get(message.data.request)?.(message.data)
    })
  }
  pending = true
  const wait = (seconds: number) => new Promise<void>(resolve => {
    const event = owner.createEvent("DelayedCallbackEvent")
    event.bind(() => { owner.removeEvent(event); resolve() })
    event.reset(seconds)
  })
  let nextRequest = 0
  const moveCamera = (index: number) => new Promise<void>((resolve, reject) => {
    const request = `${tile}:${nextRequest++}`, timeout = owner.createEvent("DelayedCallbackEvent")
    const finish = (error?: string) => {
      cameraReceivers.delete(request); owner.removeEvent(timeout)
      if (error) reject(new Error(error)); else resolve()
    }
    cameraReceivers.set(request, data => {
      const expected = index < 0 ? tx.centre : tx.views[index].pose
      if (data.error || !matrixValid(data.pose) || data.pose.some((n: number, i: number) => Math.abs(n-expected[i]) > 0.0001)) {
        finish(`Capture camera assignment failed: ${data.error ?? JSON.stringify(data.pose)}`)
      } else finish()
    })
    timeout.bind(() => finish("Capture camera acknowledgement timed out")); timeout.reset(10)
    notify({kind: "camera-request", tile, request, view_index: index})
  })
  const delayed = owner.createEvent("DelayedCallbackEvent")
  delayed.bind(async () => {
    const camera = object("Camera Object").getComponent("Component.Camera") as Camera
    const target = camera.renderTarget.control as RenderTargetProvider
    const before = {option: target.clearColorOption, color: target.clearColor}
    const failures: string[] = [], perView = new Map<string, string>()
    let pause: ReturnType<AtrophyInspect["pauseNativeReadbacks"]>, pose: ReturnType<typeof poseSnapshot>
    let inspectRestoration: Record<string, unknown>, inspectState: Record<string, unknown>, readbacks = 0
    try {
      if (object("LeafDebugUICamera").enabled) throw new Error("Native LEAF HUD has not faded before GPU readback")
      const inspector = object("AtrophyExperience").getComponent(AtrophyInspect.getTypeName()) as AtrophyInspect
      const freeze = (phase: Record<string, unknown>) => {
        pose = poseSnapshot(camera)
        inspectState = {...phase, copies: inspector.activeCopy ? [objectState(inspector.activeCopy)] : [],
          source: inspector.activeSource ? objectState(inspector.activeSource.sceneObject) : null}
        pause = inspector.pauseNativeReadbacks(true)
        if (poseSnapshot(camera).value !== pose.value) throw new Error("Inspect pause changed the existing native pose")
      }
      if (tx && (tx.return_seconds !== undefined || tx.release_complete)) {
        // Observe the existing private clock, never write it. Pause on the actual
        // native LateUpdate that reaches the requested sample, not after an editor sleep.
        const sampled = new Promise<void>((resolve, reject) => {
          const event = owner.createEvent("LateUpdateEvent"), timeout = owner.createEvent("DelayedCallbackEvent")
          let started: number
          const finish = (error?: unknown) => {
            owner.removeEvent(event); owner.removeEvent(timeout)
            if (error) reject(error); else resolve()
          }
          event.bind(() => {
            try {
              const grip = Reflect.get(inspector, "activeGrip")
              if (grip?.returning >= 0) started = grip.returning
              if (started === undefined) return
              const elapsed = getTime()-started
              if (tx.release_complete ? !inspector.activeCopy : elapsed >= tx.return_seconds) {
                if (!tx.release_complete && !inspector.activeCopy) throw new Error(`Native return passed requested sample ${tx.return_seconds} before capture`)
                freeze({return_started_seconds: started, elapsed_seconds: elapsed, requested_seconds: tx.return_seconds ?? null,
                  released: !inspector.activeCopy})
                finish()
              }
            } catch (error) { finish(error) }
          })
          timeout.bind(() => finish(new Error("Real native Inspect release sample timed out"))); timeout.reset(3)
        })
        notify({kind: "release-request", tile})
        await sampled
      } else freeze({elapsed_seconds: 0, released: false})
      target.clearColorOption = ClearColorOption.CustomColor
      const views = tx ? tx.views : [{tile, pose: null}]
      for (const [background, value] of [["black", 0], ["white", 1], ["black-repeat", 0]] as const) {
        target.clearColor = new vec4(value, value, value, 1)
        for (let index = 0; index < views.length; index++) {
          const view = views[index]
          if (tx) await moveCamera(index)
          await wait(0.35)
          if (object("LeafDebugUICamera").enabled) throw new Error("Native LEAF HUD appeared during GPU readback")
          const after = poseSnapshot(camera)
          if (after.world !== pose.world || !tx && after.value !== pose.value) {
            throw new Error(`Native world pose changed during matte transaction: ${view.tile} ${background}`)
          }
          if (perView.has(view.tile) && perView.get(view.tile) !== after.value) throw new Error(`Native camera/pose was not bit-identical on return to ${view.tile}`)
          perView.set(view.tile, after.value)
          const {width, height, samples, encoded} = await encodeNativeFrame(camera.renderTarget)
          readbacks++
          const size = 4096, count = Math.ceil(encoded.length / size), name = `${view.tile}-${background}`, matrix = camera.getProjectionMatrix()
          const metadata = {tile: name, background, clear_value: value, width, height, characters: encoded.length, chunks: count,
            method: "raw-native-rgb-opaque-readback-copy", readback_provider_released: true, delay_seconds: 6.5,
            pose_node_count: pose.nodes, bit_identical_local_transforms: true, pose_identity_encoding: "float64-bit-patterns-and-native-node-identifiers",
            ...(tx ? {transaction: tile, native_world_pose_bits: pose.world, bit_identical_world_state: true} : {}), samples,
            projection: {m00: matrix.column0.x, m11: matrix.column1.y, m02: matrix.column2.x, m12: matrix.column2.y}}
          console.log("Atrophy native render PNG metadata: " + JSON.stringify({...metadata, native_world_pose_bits: undefined}))
          notify({kind: "metadata", ...metadata})
          for (let part = 0; part < count; part++) notify({kind: "chunk", tile: name, index: part, data: encoded.slice(part*size, (part+1)*size)})
        }
      }
    } catch (error) { failures.push(String(error)) }
    finally {
      // Restore the centre camera while SIK is still paused. No local transform is rewritten.
      try { if (tx && pose) { await moveCamera(-1); await wait(0.35) } }
      catch (error) { failures.push(String(error)) }
      try {
        if (pause) {
          const after = poseSnapshot(camera), nativePoseRestored = after.value === pose.value
          const restored = pause.restore()
          const objects = (snapshot: ReturnType<typeof poseSnapshot>) => pause.object_identifiers.map(identifier => {
            const index = snapshot.identifiers.indexOf(identifier)
            if (index < 0) throw new Error(`Inspect capture object disappeared: ${identifier}`)
            const values = snapshot.values.slice(index*10, (index+1)*10)
            return {name: snapshot.names[index], identifier, values,
              local_transform_bits: Base64.encode(new Uint8Array(new Float64Array(values).buffer))}
          })
          const beforeState = {pause: pause.before, objects: objects(pose)}, afterState = {pause: restored.after, objects: objects(after)}
          const restore_ok = restored.restore_ok && nativePoseRestored && JSON.stringify(beforeState) === JSON.stringify(afterState)
          inspectRestoration = {restore_ok, before: beforeState, after: afterState,
            bit_identical_native_nodes: pose.nodes, bit_identical_native_pose: nativePoseRestored,
            scope: tx ? "one-atomic-six-view-eighteen-readback-transaction" : "only-the-three-native-readbacks",
            centre_camera_restored_before_sik: !!tx, readbacks, released_readback_textures: readbacks}
          if (!restore_ok) throw new Error(`Inspect readback restoration failed: ${JSON.stringify(inspectRestoration)}`)
        }
      } catch (error) { failures.push(String(error)) }
      try { target.clearColorOption = before.option; target.clearColor = before.color }
      catch (error) { failures.push(`RenderTarget restoration failed: ${String(error)}`) }
      pending = false
      owner.removeEvent(delayed)
    }
    if (failures.length) {
      const error = failures.join("; ")
      console.error(`Atrophy native render PNG failed ${tile}: ${error}`)
      notify({kind: "failed", tile, error, inspect_readbacks: inspectRestoration})
    } else notify({kind: "complete", tile, inspect_state: inspectState, restoration: {option: target.clearColorOption,
      color: {x: target.clearColor.x, y: target.clearColor.y, z: target.clearColor.z, w: target.clearColor.w},
      inspect_readbacks: inspectRestoration}})
  })
  delayed.reset(6.5)
}
