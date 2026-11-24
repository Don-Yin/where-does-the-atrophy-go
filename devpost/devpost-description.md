# Where Does the Atrophy Go?

## Inspiration
To study brain shrinkage, researchers need to compare differently shaped brains. Subject space keeps a scan in its own geometry. Common space aligns scans to a shared reference so corresponding locations can be compared. That alignment stretches and squeezes the image, which can also change a direct volume count. I wanted to make this tension visible: the processing that helps us compare brains can also change the measurement we are trying to interpret.

## What it does
*Where Does the Atrophy Go?* is a Spectacles Lens for students, built and demonstrated in **Lens Studio Preview**.

Three real-size brains share one table: a patient's scan in subject space, a copy you move, and the standard MNI brain in common space. Pinch, then drag the copy along a curved guide onto the standard brain. Follow the coral selected fluid filled region (the lateral ventricles) as it changes shape while the original stays in view. The Lens labels read **24.1 mL** in subject space and **7.5 mL** in common space, although the scan never changed. Drag back to revisit the original geometry.

The interaction is the explanation: it makes the software's stretching and squeezing visible, so a smaller region in the transformed image can be connected to a smaller direct count. Paired scan slices link the three-dimensional shape to the underlying scan; blue warp colour shows stretching and red shows squeezing.

The accompanying demo then accounts for that squeezing in an **offline volume-weighting example**. Each transformed image cell receives a local volume weight, called the Jacobian, for the original volume it represents. Adding these weighted cells gives **about 23.6 mL**, close to the original 24.1 mL, while the shape stays warped. The lesson centres on distinguishing a change introduced by image processing from a physical change in the brain.

Supporting tools serve that comparison: Surface Placement positions the brain-and-slice set together; selecting a slice enlarges its subject/common pair and highlights the corresponding planes; a stationary long pinch lifts an inspection copy that returns on release.

## Why augmented reality
The AR design makes the two spaces a persistent tabletop comparison. The original stays fixed, the shared reference stays alongside it, and the learner moves a copy between them. The learner can follow one region being squeezed while still looking at its original shape, with a stable spatial reference throughout the change.

This is the role of AR in the lesson: make the transformation something the learner controls and compares in place, connecting the change of coordinates to its measurement consequence. The calculation is prepared offline; the spatial interaction teaches what that calculation means.

## Who it's for
Students, educators and brain-imaging researchers who want to explore why registration—the alignment of a scan to a reference—can change a direct measurement. The Preview lesson is designed to connect that question to a spatial brain model and its scan slices through direct manipulation.

## How I built it
- **Plan:** The Learn SPECS `plan-lens` interview workflow turned the idea into the project's design brief, including the spatial interaction and Preview done criteria.
- **Build:** I used **CLAD**, Snap's building-agent workflow, through the **Lens Studio Model Context Protocol (MCP)** tools, driven from **Pi**, my coding agent. TypeScript scripts coordinate the scene. **Spectacles Interaction Kit (SIK)** supplies interaction, while UI Kit supplies spatial panels and layout.
- **Prepare the data:** I used ANTsPy to align a public brain scan to a reference supplied through TemplateFlow offline, then exported brain meshes, morph targets, slices, region outlines and deformation colours. The Lens reuses those prepared assets. A shared morph state keeps the moving brain's shape, position and progressive colour in step.
- **Test:** I used **LEAF**, the Lens integration-testing framework, for Interactive Preview scenarios covering placement, startup, morph endpoints and continuity, slice facing and selection, inspection copies, and progressive warp colour. Preview captures supported visual review alongside the automated checks.

## How the demo was recorded
The video's live clip is a continuous recording of Lens Studio Preview, played at 2× speed. The pinch and drag come from scripted simulated-hand input; nothing was recorded on Spectacles hardware, and no clinician session is claimed. The volume-weighting animation after the live clip is an offline explanation, not a Lens feature.

## Round 2 entry note
Built during Round 1 (draft 1292333, not submitted in time); entered here following Joe Holmes's invitation on Nov 10.

## Challenges
The central challenge was keeping the measurement story tied to the same scan. The unchanged original needed to remain visible while the copy reshaped, and the brain geometry, paired slices and deformation colours needed to stay consistent with the saved transformation. Readable spatial layout and a shared interaction state support that comparison.

## What I learned
The interaction needs a scientific question, not just a collection of features. Keeping the original beside the moving copy gives the transformation a clear point: inspect what processing does before interpreting its measurements. I also learned to keep interaction state shared, make slice orientation explicit and pair automated scenario checks with visual review of the Preview.

## What's next
Gather feedback on the clarity of this Preview lesson, then refine its captions, tutorial pacing and spatial layout. Continue extending the LEAF checks as the presentation evolves.

## Built with
Lens Studio, TypeScript, plan-lens, CLAD, Pi, Model Context Protocol, Spectacles Interaction Kit, UI Kit, Surface Placement, LEAF, Python, ANTsPy and TemplateFlow.

## Credits
- **Brain scan:** [OpenNeuro ds007036](https://openneuro.org/datasets/ds007036), CC0.
- **Reference template:** ICBM 152 Nonlinear Asymmetrical template version 2009c, supplied through TemplateFlow. Copyright (C) 1993–2004 Louis Collins, McConnell Brain Imaging Centre, Montreal Neurological Institute, McGill University. The copyright notice and complete template permission text are retained in the project's `NOTICE` and `third-party-licenses/icbm152-2009c.txt`.
- **Offline processing:** [ANTsPy](https://github.com/ANTsX/ANTsPy) and the [TemplateFlow Python client](https://github.com/templateflow/python-client), Apache-2.0. Their licence texts are retained in `third-party-licenses/`.
- **Room plate:** **AI-generated from a public-domain photo**. Source photograph: *Conference Room at the Guy Bradley Visitor Center*, Anthony Sleiman / National Park Service, public domain in the United States, [via Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Conference_Room_at_the_Guy_Bradley_Visitor_Center_(53412700646).jpg).
- **Gesture-guide artwork:** [Material Symbols](https://github.com/google/material-design-icons) by Google, Apache-2.0.
- **Preview avatars:** Bitmoji stand-ins from Snap.
- **Narration:** synthetic voice.
