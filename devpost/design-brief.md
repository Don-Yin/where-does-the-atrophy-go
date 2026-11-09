---
status: approved
---

# Design brief: Where Does the Atrophy Go?

<!-- Filled in by plan-lens from the learner's interview. Use the learner's words. Mark any value they didn't choose as (default). -->

## The one spatial moment
A researcher and a surgeon stand at a table in a research core discussion room. Real-size brains sit side by side: the patient's brain in subject space on one side, the template brain in common space on the other. Pinching the patient's brain and pulling it across the table morphs a third brain between them. The same coral ventricle region changes shape as the brain is warped from subject space into common space; labels under the two end brains show the measured mask volumes. The researcher's disease modelling is done on the template after registration, so this is how they see how the atrophy they report maps onto the brain the surgeon actually looks at.

## Why it belongs on glasses
- Uses: draws in the world (real-size brains on a real table); shares your view (the people in the room still see each other and the same brains).
- Why it's better than the phone or laptop version: in VR, or in a laptop viewer, the people in the discussion can't see each other or the shared table. Here the researcher and the surgeon talk over the same brains. Everyone can walk around the three brains and compare the atrophy shape in depth, instead of reading it off fixed slice axes.

## Product or overlay
- Type: product. The brains, the drag and the slices are the experience.
- What the real version would sense: nothing. A later version might register the model to a real patient brain, which is out of scope here.
- Stand-in for the preview: the dining table in Lens Studio's Colorful Home room stands in for the room's table (revised 2026-11-01; the earlier virtual table was removed). Three Bitmoji stand-in clinicians sit across it for the demo video; they follow the dragged brain with their heads and speak in bubbles. The patient's brain is a virtual brain built from a real public FTD scan, not a recognised real brain.
- Data: OpenNeuro ds007036 v1.1.3 (7TEA, ALS–FTD spectrum, licence CC0). It has 6 pure FTD patients with T1 scans: P0001, P0002, P0006, P0007, P0009, P0013. Patient used: P0006 (74, F), retained as the selected demonstration after reviewing all six. The current ANTs pipeline re-selects its region with the same image-and-warp rule. The enlarged ventricles come from the real scan, not a simulated lesion; their compression by registration is not a measure of disease progression.
- Coral region: the part of the patient's enlarged lateral ventricles that the warp compresses to under half its volume, segmented from the T1 itself (no atlas). Mask measurements are 24.1 mL in subject space and 7.5 mL after warp into MNI (x0.31), from `Assets/Brain/region.json`. Deterministic ANTsPy affine + SyN uses TemplateFlow MNI152NLin2009cAsym, seed 20261104 and one ITK thread. The exact mask measurements are 24.06786457 / 7.517 mL. Only the two endpoint measurements are shown; the top information panel and its live mesh-volume label were removed on 2026-11-02 to reduce visual weight. These volumes do not infer a disease-loss percentage.

## Where things live
- Where the user is looking during the main task: down at the table, at the three brains.
- Table: the room's real table (in the preview, the Colorful Home dining table).
- Subject-space brain (patient): on the table, on the left, at real size (about 17 cm long) (default size).
- Common-space brain (template): on the table, on the right, at real size, about 45 cm from the patient brain (default spacing).
- Morphing brain: between the two. When it is pulled to either end it overlaps that end's brain, so only two brains are visible. Anywhere in the middle it sits between them, so three are visible.
- Coral region: the pre-selected, T1-segmented enlarged lateral-ventricle pocket, carried by the same warp on all three brains. It is not a frontal/temporal cortical lesion. Subject cortex stays neutral grey. Morph and common-space cortex carry the always-on progressive Warp map; the coral region stays distinct. There is no lobe atlas or Lobes view.
- 2D slices: the seven axial slices of each view (brain-7-slices convention) float on top of both the subject-space and the common-space brains, and always turn to face the person viewing.
  - The template slices are at MNI z = −34, −20, −6, 8, 22, 36, 50 mm.
  - The patient slices are cut at the subject-space levels that the patient's own warp carries onto those planes. The heading says "Subject cuts → MNI planes" and captions say "to z −34", etc.: a pairing, not a native-space MNI coordinate. Scanner-world cuts remain in `Assets/Brain/region.json`.
  - Both rows use radiological orientation (patient R on image left, L on image right; anterior at the top), confirmed from each NIfTI affine. R/L letters are on every clean grey tile. Each tile has a separate coral-outline Image, tinted from the same material colour as the 3D region; no colour tint is baked into the anatomy.
  - Each tile is about 6 cm (default), in a row about 10 cm above its brain (default).
  - The morphing brain has no slices (default).
- Drag handle: the moving brain itself, a box about the size of the brain, reachable from either end.

## Hands and input
- Morph: pinch the brain (SIK Interactable) and drag it from subject space to common space and back.
- Look: walk around the table and lean in. No other hand actions in this version.
- Targets are big and highlight when aimed at.
- Voice: none.

## When things show
- Brains, atrophy highlight and slices: always present (learner's choice; to be revisited once he sees the visuals).
- End labels "Subject space" and "Common space (MNI)": always present, below each end brain, with "24.1 mL" and "7.5 mL" respectively. There is no top title/summary/captions panel and no live mesh-volume label (revised 2026-11-02). These are spatial-warp mask volumes, not longitudinal atrophy.
- If something needs attention out of view: none.

## Done criteria
Each one can be checked in Lens Studio's preview. (All defaults; the learner considered them self-explanatory.)
1. On start, the real table shows the subject-space brain on the left and the common-space brain on the right, each with the same atrophy region highlighted. (default)
2. With the brain pulled to either end, only two brains are visible. With it in the middle, a third brain sits between them. (default)
3. Dragging the brain morphs the middle brain and its atrophy region smoothly from the subject-space shape to the common-space shape, and back. (default)
4. Seven axial slices float above both end brains and stay facing the viewer while they walk around the table. (default)
5. Labels and slices are readable from about 1 m away. (default)

## Out of scope
- Choosing the atrophy region in the Lens (it is pre-selected).
- Several people sharing one Lens. The preview can't show it; the video covers it in narration.
- Real-time registration, and recognising or registering to a real brain.
- Inferring a percentage of tissue loss, disease progression or diagnostic severity from registration compression.

## Risks and open questions
- Always-on content: two brains × 7 slices = 14 tiles, plus three brains, inside a view about 37° × 32°. It may feel crowded; the learner kept "always present" until he sees the visuals.
- Data: GENFI and OASIS are ruled out (governance; OASIS is non-commercial and access-controlled). ds007036 is CC0, so the meshes and slices can be published. All six FTD cases were checked offline and P0006 was selected; the current exported meshes, segmentation and paired slices are in `Assets/Brain/`, with measurements and orientation provenance in `region.json`.
- Interesting cases: in severe atrophy, the same atrophy can map to different common-space regions, because subject brains differ in size and shape. Finding such a case is pinned in `../docs/pinned.md` in the parent folder (not in the repo).
- Data preparation happens offline, before the build. CLAD needs: a patient brain mesh with the atrophy region, the same mesh with every vertex carried into common space by the patient's warp (same vertex order, so the morph is a blend between them), a template brain mesh, and the slice images.
- Feel unproven: comfort over time and real hand tracking need real glasses.

## Build notes for CLAD
- Build for SPECS so it runs and can be demonstrated in Lens Studio's preview. No SPECS device is available.
- Use Spectacles Interaction Kit (SIK) and UI Kit for all interactions, so they work with the mouse in Interactive Preview and with LEAF.
- Build any stand-in exactly as described above, and keep it obvious in the scene.
- Use real-world scale in centimeters. Keep content inside the user's view during the main task.
- The display is additive: black renders as transparent. Don't rely on black or very dark content to be seen; keep text light and readable from where the user stands.
- Get the basic flow working first, then add detail.
- Write LEAF scenarios for each done criterion, run them in preview, and report which pass. Say which criteria have no test.
- Don't record, identify, or follow people.

## After the build: judge it
This part is for you, after CLAD finishes.

1. **Does it work?** Ask your agent which LEAF tests passed and which done criteria have no test.
2. **Walk around it.** Open the preview in Interactive Preview. Use WASD to move, Q and E to go down and up, and right-drag (or hold Shift) to look around. Clicking acts as a pinch. Stand where a user would and look at the task.
3. **Ask the three questions.**
   - Does it use what I'm looking at?
   - Does it put something in my space, where it belongs?
   - Does it free my hands or let me keep my eyes up?
   - Would it be just as good on a phone? If so, what would make it need the glasses?
4. **Check comfort.**
   - Everything I need is in view while I do the task. Nothing sits at the edges, behind me, or stuck to my face.
   - Every control is within reach of someone standing there.
   - Text reads easily from where I stand. No dark UI disappearing.
   - Things show when needed and get out of the way.
5. **Label what you know.** Write "logic proven" next to anything the tests and preview show working, and "feel unproven" next to anything only real glasses could tell you (comfort over time, real hand tracking, real recognition).
6. **Fix with design notes, not code.** Tell your agent what to change in design terms, for example: "Move the step card 15 cm lower and next to the pan. Make the Next button twice as big. Re-run the tests." If a fix takes under a minute, like nudging a panel, do it yourself in the scene.
7. **Submit.** Record a video under 3 minutes of your Lens in the preview, public on YouTube. Make your repo public with your Lens Studio project and this `devpost/` folder. Details are on the hackathon site: https://learn-specs.devpost.com/resources
