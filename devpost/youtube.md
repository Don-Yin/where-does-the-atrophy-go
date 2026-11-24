# YouTube video (Round 2)

Uploaded 2026-11-24: https://youtu.be/C-fxrHdHAcM

## Title
Where Does the Atrophy Go? | Learn AR with SPECS

## Description
A Spectacles Lens for students. Three brains share one table: a patient's scan in subject space, a copy you move, and the standard MNI brain in common space. Pinch, then drag the copy onto the standard brain and watch it reshape. The selected fluid filled region (the lateral ventricles) reads 24.1 mL in subject space and 7.5 mL in common space.

The scan never changed, so where did the volume go? Each common-space cell stands for a different amount of the original brain. Weighting every cell by its local volume change (offline Jacobian weighting) gives about 23.6 mL again, while the shape stays warped. Processing changes the image, not the patient's brain.

How this was recorded: Lens Studio Preview with scripted simulated-hand input, not on Spectacles hardware. The live clip plays at 2× speed.
Built during Round 1 (draft 1292333, not submitted in time); entered here following Joe Holmes's invitation on Nov 10.
Planned with plan-lens and built with CLAD through Lens Studio's MCP tools, driven from the Pi coding agent. Narration uses a synthetic voice.

Credits and sources
Brain scan: OpenNeuro ds007036, CC0. https://openneuro.org/datasets/ds007036
Reference template: ICBM 152 Nonlinear Asymmetrical template version 2009c, supplied through TemplateFlow. Copyright (C) 1993–2004 Louis Collins, McConnell Brain Imaging Centre, Montreal Neurological Institute, McGill University.
Offline processing: ANTsPy and the TemplateFlow Python client, Apache-2.0.
Room plate: AI-generated from a public-domain photo. Source photograph: Conference Room at the Guy Bradley Visitor Center, Anthony Sleiman / National Park Service, public domain in the United States, via Wikimedia Commons. https://commons.wikimedia.org/wiki/File:Conference_Room_at_the_Guy_Bradley_Visitor_Center_(53412700646).jpg
Gesture-guide artwork: Material Symbols by Google, Apache-2.0.
Preview avatars: Bitmoji stand-ins from Snap.
