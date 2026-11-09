# Where Does the Atrophy Go?

## Inspiration
Brain-imaging research often aligns an individual scan to a shared reference. The geometry of that transformation can be difficult to picture in flat views. I wanted to make the journey something a learner could follow: keep the original anatomy and the reference visible, move a brain between them, and watch a selected region travel with it.

## What it does
*Where Does the Atrophy Go?* is a spatial teaching prototype built and demonstrated in **Lens Studio Interactive Preview**, with mouse-driven interaction.

- **Place the scene.** Surface Placement positions the brain-and-slice set together on the Preview table.
- **Follow the warp.** Pinch-drag the moving brain along a curved guide from subject space—the scan's own coordinates—to common space—the shared reference coordinates. The brain and its coral ventricle region reshape together. Drag back to revisit the original geometry.
- **Read the deformation.** Warp colour builds as the moving brain approaches common space. Blue shows stretching and red shows squeezing. The subject view keeps its neutral anatomy while the common-space view carries the full colour map.
- **Compare the slices.** Viewer-facing axial slice grids retain left/right orientation markings and coral region outlines. Select a slice tile to show its subject/common pair in an enlarged focus card and highlight the corresponding planes on the brains. Select the same tile again to return to the key-slice view.
- **Lift an inspection copy.** A stationary long pinch lifts a copy with its current shape and warp colour. Release returns it while the source brains stay on the table.

## Who it's for
Students, educators and brain-imaging researchers who want a visual way to explore how registration—the alignment of a scan to a reference—changes geometry. The Preview lesson lets a learner connect a spatial brain model with its scan slices through direct manipulation.

## How I built it
- **Plan:** The Learn SPECS `plan-lens` interview workflow turned the idea into the project's design brief, including the spatial interaction and Preview done criteria.
- **Build:** I used **CLAD**, Snap's building-agent workflow, through the **Lens Studio Model Context Protocol (MCP)** tools, driven from **Pi**, my coding agent. TypeScript scripts coordinate the scene. **Spectacles Interaction Kit (SIK)** supplies interaction, while UI Kit supplies spatial panels and layout.
- **Prepare the data:** I used ANTsPy to align a public brain scan to a reference supplied through TemplateFlow offline, then exported brain meshes, morph targets, slices, region outlines and deformation colours. The Lens reuses those prepared assets. A shared morph state keeps the moving brain's shape, position and progressive colour in step.
- **Test:** I used **LEAF**, the Lens integration-testing framework, for Interactive Preview scenarios covering placement, startup, morph endpoints and continuity, slice facing and selection, inspection copies, and progressive warp colour. Preview captures supported visual review alongside the automated checks.

## Challenges
The scene needed to keep brain geometry, slice grids, the focus card and annotations readable together. Each view also had to preserve its relationship to the same scan and saved transformation. Another interaction challenge was distinguishing a moving pinch that morphs the brain from a stationary hold that lifts an inspection copy.

## What I learned
Scientific meaning has to survive every presentation choice. Colour becomes useful when it names a clear spatial change; slices become useful when their orientation and coordinate space stay explicit. I also learned to keep interaction state shared, and to pair automated scenario checks with visual review of the Preview.

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
- **Scanner photograph in the demo:** *MRI machine with patient*, National Institute of Mental Health, National Institutes of Health / NIH Image Gallery, public domain, [via Wikimedia Commons](https://commons.wikimedia.org/wiki/File:MRI_machine_with_patient_(23423505123).jpg).
