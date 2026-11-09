/** Three stand-in clinicians across the table. Each is a Bitmoji base avatar requested the way Leaf's BitmojiCharacter.lsc
 * requests it, with the body (male or female) chosen per seat; here it is seated and tinted instead of IK-driven. Heads follow
 * the dragged brain and UIKit speech bubbles speak at morph thresholds. Reads AtrophyMain.morphWeight and the MorphBrain /
 * BrainHandle positions only; it never changes morph state. The authored root is the plane the seated feet rest on, behind
 * the table's far edge and under the middle seat; every frame each seat turns to face the live camera.
 */
import WorldCameraFinderProvider from "InteractionKit.lspkg/Providers/CameraProvider/WorldCameraFinderProvider"
import {findSceneObjectByName} from "Leaf.lspkg/Utils/common/Utils"
import {TailDirection, Tooltip} from "UIKit.lspkg/Scripts/Tooltip"
import {REGION} from "./AtrophyData"
import {attachLongHair} from "./AtrophyHair"
import {faceViewer, obj} from "./AtrophyLayoutUI"
import {AtrophyMain} from "./AtrophyMain"
import {ATROPHY_LAYOUT} from "./AtrophyLayout"
import {addLanyard, NHS_BLUE, shortenSleeves, UniformGeometry} from "./AtrophyUniform"

const BITMOJI = require("LensStudio:BitmojiModule") as BitmojiModule
const REMOTE_MEDIA = require("LensStudio:RemoteMediaModule") as RemoteMediaModule
/** Bitmoji rounds mesh and texture quality up to its nearest available step. */
const BITMOJI_QUALITY = 0.5
/** One natural low point of the 7.866667 s idle, selected by the native eye-height survey; no wall-clock drift. */
export const CLINICIAN_IDLE_SECONDS = 5.3
const DEG = Math.PI / 180
/** The three NHS blues the scrubs come in, as the linear base colours the Bitmoji material multiplies into its near-white outfit textures:
 * ceil blue (NHS Light Blue, #41B6E6), NHS blue (#005EB8) and navy (NHS Dark Blue, #003087). The display adds the lens to the room, so the darker
 * the blue the more the wall behind shows through it: ceil blue goes in front of the wall, navy in front of the dark armchair. */
const CEIL_BLUE = new vec4(0.053, 0.468, 0.791, 1)
const NAVY = new vec4(0, 0.03, 0.242, 1)
/** Left to right as the viewer sees them (+X is the viewer's right); `bubble` is the side of the head the speech bubble hangs on.
 * `scrubs` is the one colour of the seat's matching top and trousers. `female` asks Bitmoji for its female base body, replaces its short cap with
 * a licensed long hairstyle and recolours only her iris texture. `skin` and `hair` multiply the base textures (the woman's `hair` tints her brows):
 * light East Asian man with black hair, medium South Asian woman with chestnut/auburn hair, dark brown man with silver hair.
 * The display adds the lens to the room, so dark tones come out lighter than authored. */
const SEATS = [
  {side: -1, female: false, scrubs: NHS_BLUE, bubble: 1, skin: new vec4(1, 0.94, 0.88, 1), hair: new vec4(1, 1, 1, 1)},
  {side: 0, female: true, scrubs: CEIL_BLUE, bubble: 1, skin: new vec4(0.5, 0.3, 0.18, 1), hair: new vec4(6.5, 2.8, 1.3, 1)},
  {side: 1, female: false, scrubs: NAVY, bubble: -1, skin: new vec4(0.3, 0.17, 0.11, 1), hair: new vec4(5, 5, 5, 1)},
]

const THIGH_SLOPE = 8 * DEG // the thigh dips this far below horizontal toward the knee
const SHIN_LEAN = 6 * DEG // the shin leans back from vertical toward the foot
const GAZE_YAW = 75 * DEG
const GAZE_DOWN = 40 * DEG
const GAZE_UP = 25 * DEG
/** Bubbles hang this far toward the viewer along the sight line to the head, which keeps them in front of the
 * slice rows and title; they are scaled down by the same share. */
const BUBBLE_PULL = 0.45
/** A hand that stops just short of either endpoint still counts as arriving. */
const HOME_WEIGHT = 0.02
const MNI_WEIGHT = 0.98

interface Line {speaker: number; text: string}
/** Spoken lines; the line breaks keep each bubble narrow enough for the viewer's frame. */
export const ONBOARDING_LINE = "Pinch the middle brain and drag it to the template"
export const ENDING_LINE = `Same region: ${REGION.ventricle_ml.subject} → ${REGION.ventricle_ml.mni} mL. A spatial warp, not disease.`
const GRAB: Line = {speaker: 1, text: ONBOARDING_LINE.replace(" and ", "\nand ").replace(" to ", "\nto ")}
const HOME: Line = {speaker: 1, text: `Back in her own\nbrain: ${REGION.ventricle_ml.subject} mL.`}
/** Lines on the way across, each shown once the weight reaches `at`. */
const RISING: {at: number; line: Line}[] = [
  {at: 0.3, line: {speaker: 0, text: "The warp squeezes\nher ventricles\ninto the template."}},
  {at: 0.6, line: {speaker: 2, text: "Same region,\nabout a third\nof the volume."}},
  {at: MNI_WEIGHT, line: {speaker: 2, text: ENDING_LINE.replace(": ", ":\n").replace(" mL. ", " mL.\n").replace("warp, ", "warp,\n")}},
]

/** A rig joint with its bind-pose rotation and position in the clinician root's frame. */
interface Bone {node: SceneObject; rest: quat; position: vec3}

export interface Clinician {
  root: SceneObject
  head: SceneObject
  /** Head bind rotation in the root frame. */
  restHead: quat
  bubble: Tooltip
  /** Which side of the head the bubble hangs on: +1 is the viewer's right. */
  bubbleSide: number
  /** Joints held in the seated pose, with their rotation in the root frame. */
  seated: {node: SceneObject; target: quat}[]
  longHair?: RenderMeshVisual
  /** Original and recoloured eye texels, retained for iris-only regression checks without GPU read-back. */
  irises?: {before: Uint8Array; after: Uint8Array; changed: number[]}
  uniformGeometry: UniformGeometry
  /** Fixed-time standing clip; only the explicit seated pose and brain-following gaze move the rig. */
  idlePlayer: AnimationPlayer
}

@component
export class AtrophyClinicians extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">Where Does the Atrophy Go? – clinicians</span>')
  @ui.group_start("References")
  @input
  @hint("Owner of the morph state; only morphWeight and its brain references are read")
  main!: AtrophyMain
  @input
  @hint("Material the Bitmoji glTF is instantiated with: BitmojiMaterial, packed in Leaf's BitmojiCharacter.lsc")
  rigMaterial!: Material
  @input
  @hint("Standing pose sampled at 5.3 seconds: Remote Animation Idle, packed in Leaf's BitmojiCharacter.lsc")
  idleClip!: RemoteReferenceAsset
  @input
  @hint("Complete hair mesh from the licensed Blonde Curly Wig package; attached only to the female head")
  femaleHairMesh!: RenderMesh
  @input
  @hint("Opaque chestnut/auburn strand-textured material; does not change either man's hair")
  femaleHairMaterial!: Material
  @ui.group_end
  @ui.group_start("Settings")
  @input
  @hint("Uniform rig scale; 1.0 is the Bitmoji's own 118 cm. The head keeps the Bitmoji's own proportion and is 24.7 cm wide at 1.0, so 0.68 gives an adult 16.8 cm")
  @widget(new SliderWidget(0.4, 1, 0.01))
  rigScale: number = 0.68
  @input
  @hint("Seconds a spoken line stays up")
  @widget(new SliderWidget(2, 60, 1))
  bubbleSeconds: number = 8
  @ui.group_end

  readonly clinicians: Clinician[] = []
  /** Resolves when all three rigs are downloaded, tinted and seated. */
  ready: Promise<void> = Promise.resolve()

  private stage = 0
  private hideAt = 0
  private round = -1
  private prompting = false
  private endingSaid = false
  private endingVisible = false
  private poseEvent!: SceneEvent
  private speechEvent!: SceneEvent
  private captureStarted?: number

  /** Preserve the native settled pose and speech clock for a lossless matte take. */
  lockCapturePose(): void {
    if (this.captureStarted !== undefined) throw new Error("Clinician capture pose is already locked")
    this.captureStarted = getTime()
    this.poseEvent.enabled = false
    this.speechEvent.enabled = false
  }

  releaseCapturePose(): void {
    if (this.captureStarted === undefined) throw new Error("Clinician capture pose is not locked")
    this.hideAt += getTime() - this.captureStarted
    this.captureStarted = undefined
    this.poseEvent.enabled = true
    this.speechEvent.enabled = true
  }

  onAwake(): void {
    this.createEvent("OnStartEvent").bind(() => {
      if (!this.main || !this.rigMaterial || !this.idleClip || !this.femaleHairMesh || !this.femaleHairMaterial) {
        throw new Error("Atrophy clinicians: wire AtrophyMain, the rig material, idle clip and female hair mesh/material")
      }
      this.ready = Promise.all(SEATS.map((seat, i) => this.spawn(i, seat))).then((all) => {
        this.clinicians.push(...all)
        console.log(`Atrophy clinicians ready: ${all.length} seated`)
      })
    })
    this.speechEvent = this.createEvent("UpdateEvent")
    this.speechEvent.bind(() => this.speak())
    this.poseEvent = this.createEvent("LateUpdateEvent")
    this.poseEvent.bind(() => this.pose())
  }

  private async spawn(index: number, seat: (typeof SEATS)[number]): Promise<Clinician> {
    const root = obj(this.sceneObject, `Clinician${index}`, new vec3(seat.side * ATROPHY_LAYOUT.clinicianSpacing, 0, 0))
    root.getTransform().setLocalScale(vec3.one().uniformScale(this.rigScale))

    // Build active UI before the asynchronous download: Placement may hide the set while the rig loads.
    const bubble = this.bubble(index, seat.bubble)
    const avatar = await this.download(root, seat.female)
    const bone = (name: string): Bone => this.bone(root, avatar, name)
    const visual = (name: string) => findSceneObjectByName(name, avatar).getComponent("Component.RenderMeshVisual") as RenderMeshVisual
    // NHS scrubs: a matching top and trousers, one blue per seat. Skin and hair tint the Bitmoji's own textures; the mouth keeps its untinted teeth.
    for (const [name, colour] of [
      ["outfit_top_GEO", seat.scrubs], ["outfit_bottom_GEO", seat.scrubs],
      ["C_head_GEO", seat.skin], ["body_GEO", seat.skin], ["C_hair_GEO", seat.hair], ["C_brow_GEO", seat.hair],
    ] as const) {
      const mesh = visual(name)
      mesh.mainMaterial = mesh.mainMaterial.clone()
      mesh.mainMaterial.mainPass["baseColorFactor"] = colour
    }
    const longHair = seat.female ? attachLongHair(visual("C_hair_GEO"), bone("C_head_bind_JNT").node, this.femaleHairMesh, this.femaleHairMaterial) : undefined
    const irises = seat.female ? this.hazelEyes(visual("L_eye_GEO"), visual("R_eye_GEO")) : undefined
    // Read the downloaded top for lanyard placement BEFORE replacing it; never read built-mesh buffers.
    addLanyard(avatar, visual("outfit_top_GEO"), this.rigMaterial)
    const uniformGeometry = shortenSleeves(visual("outfit_top_GEO"))

    // Thighs forward, shins down, feet flat; the rig sinks until the feet are back on the floor.
    const seated: Clinician["seated"] = []
    let drop = 0
    for (const s of ["L", "R"]) {
      const hip = bone(`${s}_legUpper0001_bind_JNT`), knee = bone(`${s}_legLower0001_bind_JNT`), foot = bone(`${s}_foot0001_bind_JNT`)
      const thigh = new vec3(0, -Math.sin(THIGH_SLOPE), Math.cos(THIGH_SLOPE))
      const shin = new vec3(0, -Math.cos(SHIN_LEAN), -Math.sin(SHIN_LEAN))
      seated.push(
        {node: hip.node, target: quat.rotationFromTo(knee.position.sub(hip.position).normalize(), thigh).multiply(hip.rest)},
        {node: knee.node, target: quat.rotationFromTo(foot.position.sub(knee.position).normalize(), shin).multiply(knee.rest)},
        {node: foot.node, target: foot.rest})
      const length = (a: Bone, b: Bone) => b.position.sub(a.position).length
      drop = hip.position.y - (foot.position.y + length(knee, foot) * Math.cos(SHIN_LEAN) + length(hip, knee) * Math.sin(THIGH_SLOPE))
    }
    root.getTransform().setLocalPosition(root.getTransform().getLocalPosition().sub(new vec3(0, drop * this.rigScale, 0)))

    const head = bone("C_head_bind_JNT")
    const idlePlayer = await this.stand(avatar)
    return {root, head: head.node, restHead: head.rest, bubble, bubbleSide: seat.bubble, seated, longHair, irises, uniformGeometry, idlePlayer}
  }

  /** The base avatar that BitmojiCharacter requests (full avatar, split clothes, an explicit body so that no Snap user is involved),
   * instantiated under `root`. BitmojiCharacter fixes the body to a male one and offers no option for another, so the request is made here. */
  private async download(root: SceneObject, female: boolean): Promise<SceneObject> {
    const options = Bitmoji3DOptions.create()
    options.requestType = Bitmoji3DOptions.RequestType.Custom
    options.customParams = Bitmoji3DOptions.CustomParams.create()
    options.customParams.avatarScope = Bitmoji3DOptions.AvatarScope.Full
    options.customParams.clothingType = Bitmoji3DOptions.ClothingType.SplitClothes
    options.optimizationParams = Bitmoji3DOptions.OptimizationParams.create()
    options.optimizationParams.meshQuality = BITMOJI_QUALITY
    options.optimizationParams.textureQuality = BITMOJI_QUALITY
    const body = Bitmoji3DOptions.BaseBodyParams.create()
    body.gender = female ? Bitmoji3DOptions.Gender.Female : Bitmoji3DOptions.Gender.Male
    body.bodyType = female ? Bitmoji3DOptions.BodyType.FemaleAverage : Bitmoji3DOptions.BodyType.MaleAverage
    if (female) body.breastType = Bitmoji3DOptions.BreastType.Average

    const resource = await new Promise<Bitmoji3DResource>((resolve) => BITMOJI.requestBaseBitmoji3DResourceWithOptions(options, body, resolve))
    const gltf = await new Promise<GltfAsset>((resolve, reject) => REMOTE_MEDIA.loadResourceAsGltfAsset(resource, resolve, reject))
    const settings = GltfSettings.create()
    settings.convertMetersToCentimeters = true
    settings.optimizeGeometry = true
    settings.storeTriangleOrder = true
    return new Promise((resolve, reject) => gltf.tryInstantiateAsync(root, this.rigMaterial, resolve, reject, () => {}, settings))
  }

  /** Recolour the original coloured iris texels, not the white sclera, neutral pupil or catchlights.
   * Both eyes receive one private cloned material/texture; the two men's shared downloaded materials remain untouched. */
  private hazelEyes(left: RenderMeshVisual, right: RenderMeshVisual): NonNullable<Clinician["irises"]> {
    const material = left.mainMaterial.clone()
    const texture = ProceduralTextureProvider.createFromTexture(material.mainPass["baseColorTexture"] as Texture)
    const provider = texture.control as ProceduralTextureProvider
    const width = texture.getWidth(), height = texture.getHeight()
    const before = new Uint8Array(width * height * 4)
    provider.getPixels(0, 0, width, height, before)
    const after = new Uint8Array(before), changed: number[] = []
    for (let i = 0; i < before.length; i += 4) {
      const r = before[i], g = before[i + 1], b = before[i + 2]
      const hi = Math.max(r, g, b), lo = Math.min(r, g, b)
      // Bitmoji's sclera, pupil and specular highlights are neutral. The iris is its only chromatic region.
      if (hi - lo <= 10 || hi >= 245 || before[i + 3] === 0) continue
      const shade = MathUtils.clamp((0.2126 * r + 0.7152 * g + 0.0722 * b) / 90, 0.45, 1.75)
      after[i] = Math.round(96 * shade)
      after[i + 1] = Math.round(122 * shade)
      after[i + 2] = Math.round(57 * shade)
      changed.push(i)
    }
    if (!changed.length) throw new Error("Atrophy clinician: the base eye texture has no coloured iris texels")
    provider.setPixels(0, 0, width, height, after)
    material.mainPass["baseColorTexture"] = texture
    left.mainMaterial = right.mainMaterial = material
    console.log(`Atrophy hazel-green irises: ${changed.length} recoloured texels in ${width}x${height}; neutral texels unchanged`)
    return {before, after, changed}
  }

  /** Sample one standing pose so the arms hang without a wall-clock-dependent torso/face animation.
   * Native states and their six camera tiles must show the same rig pose; playing idle independently
   * made later pixel cross-fades double the faces and hair. The explicit seated pose and gaze still run. */
  private stand(avatar: SceneObject): Promise<AnimationPlayer> {
    return new Promise((resolve, reject) => this.idleClip.downloadAsset(
      (asset) => {
        const player = avatar.createComponent("Component.AnimationPlayer") as AnimationPlayer
        const clip = AnimationClip.createFromAnimation("idle", asset as AnimationAsset)
        clip.playbackSpeed = 0
        player.addClip(clip)
        player.playClipAt("idle", CLINICIAN_IDLE_SECONDS)
        const evaluated = this.createEvent("LateUpdateEvent")
        evaluated.bind(() => { evaluated.enabled = false; resolve(player) })
      },
      () => reject(new Error("Atrophy clinicians: the standing idle clip did not download")),
    ))
  }

  private bone(root: SceneObject, rig: SceneObject, name: string): Bone {
    const node = findSceneObjectByName(name, rig)
    if (!node) throw new Error(`Atrophy clinicians: the rig has no ${name}`)
    const transform = node.getTransform(), rootTransform = root.getTransform()
    return {
      node,
      rest: rootTransform.getWorldRotation().invert().multiply(transform.getWorldRotation()),
      position: rootTransform.getInvertedWorldTransform().multiplyPoint(transform.getWorldPosition()),
    }
  }

  /** A hidden UIKit tooltip, billboarded to the viewer, with its tail toward the clinician's head; `pose` hangs it beside the head. */
  private bubble(index: number, side: number): Tooltip {
    const root = obj(this.sceneObject, `ClinicianBubble${index}`)
    root.getTransform().setLocalScale(vec3.one().uniformScale(ATROPHY_LAYOUT.bubbleScale * BUBBLE_PULL))
    const tooltip = root.createComponent(Tooltip.getTypeName()) as Tooltip
    tooltip.tailEnabled = true
    tooltip.tailDirection = side > 0 ? TailDirection.Left : TailDirection.Right
    tooltip.tailSize = new vec2(2, 1.4)
    faceViewer(root)
    return tooltip
  }

  private speak(): void {
    if (!this.clinicians.length) return
    if (this.round !== this.main.placementVersion) {
      this.round = this.main.placementVersion
      this.stage = this.hideAt = 0
      this.prompting = this.endingSaid = this.endingVisible = false
    }
    if (!this.main.hasDragged) {
      if (!this.prompting) { this.say(GRAB); this.hideAt = 0; this.prompting = true }
      return
    }
    if (this.prompting) { this.hide(); this.prompting = false }
    const weight = this.main.morphWeight
    // The first-arrival claim belongs only to the MNI endpoint, not a later intermediate view.
    if (this.endingVisible && weight < MNI_WEIGHT) {
      this.hide()
      this.endingVisible = false
    }
    const reached = RISING.filter((step) => weight >= step.at).length
    if (reached > this.stage && (reached < RISING.length || !this.endingSaid)) {
      this.say(RISING[reached - 1].line)
      if (reached === RISING.length) { this.endingSaid = this.endingVisible = true; this.hideAt = 0 }
    } else if (this.stage > 0 && weight <= HOME_WEIGHT) this.say(HOME)
    this.stage = weight <= HOME_WEIGHT ? 0 : Math.max(this.stage, reached)
    if (this.hideAt > 0 && getTime() > this.hideAt) this.hide()
  }

  private hide(): void {
    this.clinicians.forEach((c) => c.bubble.setOn(false))
    this.hideAt = 0
  }

  private say(line: Line): void {
    this.clinicians.forEach((c, i) => {
      if (i === line.speaker) c.bubble.tip = line.text
      c.bubble.setOn(i === line.speaker)
    })
    this.hideAt = getTime() + this.bubbleSeconds
  }

  /** Runs after the animation pass, so these writes override the rig's standing idle clip. */
  private pose(): void {
    const brain = this.main.morphBrain.sceneObject.enabled ? this.main.morphBrain.sceneObject : this.main.brainHandle.sceneObject
    const target = brain.getTransform().getWorldPosition()
    const toLocal = this.sceneObject.getTransform().getInvertedWorldTransform()
    const viewer = toLocal.multiplyPoint(WorldCameraFinderProvider.getInstance().getWorldPosition())
    for (const [index, c] of this.clinicians.entries()) {
      const rootTransform = c.root.getTransform()
      // Square to the viewer, not to the table, so every clinician faces the person who is looking, wherever they walk.
      const toViewer = viewer.sub(rootTransform.getLocalPosition())
      rootTransform.setLocalRotation(quat.angleAxis(Math.atan2(toViewer.x, toViewer.z), vec3.up()))
      const rootRotation = rootTransform.getWorldRotation()
      c.seated.forEach(({node, target}) => node.getTransform().setWorldRotation(rootRotation.multiply(target)))

      const toRoot = rootTransform.getInvertedWorldTransform()
      const gaze = toRoot.multiplyPoint(target).sub(toRoot.multiplyPoint(c.head.getTransform().getWorldPosition()))
      const yaw = MathUtils.clamp(Math.atan2(gaze.x, gaze.z), -GAZE_YAW, GAZE_YAW)
      const pitch = MathUtils.clamp(Math.atan2(gaze.y, Math.hypot(gaze.x, gaze.z)), -GAZE_DOWN, GAZE_UP)
      // Main already smooths the moving brain. Derive gaze from that same current
      // state instead of a second wall-clock filter that differs between capture tiles.
      const look = quat.angleAxis(yaw, vec3.up()).multiply(quat.angleAxis(-pitch, vec3.right()))
      c.head.getTransform().setWorldRotation(rootRotation.multiply(look).multiply(c.restHead))

      // One bubble lane just above the row titles, beside the head and pulled along the viewer's sight line.
      const headAt = toLocal.multiplyPoint(c.head.getTransform().getWorldPosition())
      const beside = headAt.add(headAt.sub(viewer).cross(vec3.up()).normalize().uniformScale(c.bubbleSide * ATROPHY_LAYOUT.bubbleBeside[index]))
        .add(vec3.up().uniformScale(ATROPHY_LAYOUT.bubbleRise))
      c.bubble.sceneObject.getTransform().setLocalPosition(vec3.lerp(viewer, beside, BUBBLE_PULL))
    }
  }

  /** World direction a head is facing: the rig's rest forward, turned by however far the head joint has left rest. */
  gazeDirection(c: Clinician): vec3 {
    const rootRotation = c.root.getTransform().getWorldRotation()
    const turned = c.head.getTransform().getWorldRotation().multiply(rootRotation.multiply(c.restHead).invert())
    return turned.multiplyVec3(rootRotation.multiplyVec3(vec3.forward()))
  }
}
