# Source selection and visual review

## Inventory

- `.results/ar-recapture-20261107/` contains the existing native-preview proof images, reconstructed video frames, storyboards and seam-review crops. The source provenance in `capture-audit.json` identifies the opening sequence as real Lens Studio Preview states with mouse input and offline six-tile reconstruction.
- `lens/devpost/evidence/` contains JSON and logs, including the LEAF integration-test evidence. Both a file-tool search and an exact recursive on-disk check found **no raster images** there.
- `docs/video/demo-explainer/reports/moving-lens-frames/` contains useful already-captioned stills. Those were reviewed, but their extra labels and orange display-simulation graphics make them less suitable than clean crops of the earlier frames.

## First ten candidates viewed

| Candidate | Useful content | Decision |
|---|---|---|
| `.results/ar-recapture-20261107/opening.rgb-frames/frame-135.png` | Moving brain separate from the endpoints | Selected for drag comparison |
| `.results/ar-recapture-20261107/final-layout-static-source.rgb-frames/frame-0.png` | Whole scene and Preview hand | Reviewed; lower-endpoint state gives less separation |
| `.results/ar-recapture-20261107/inspect-atomic/storyboard/closeups-004000ms.png` | Three separated brains, paired slice card, warp colour | Main source for cover, overview, slices and warp detail |
| `.results/ar-recapture-20261107/inspect-atomic/storyboard/closeups-011000ms.png` | End-state region shape | Reviewed; overlaps an endpoint |
| `.results/ar-recapture-20261107/inspect-atomic/storyboard/closeups-021500ms.png` | Inspection copy raised above source | Confirmed against the inspection-specific storyboard; used that equivalent source |
| `docs/video/demo-explainer/reports/moving-lens-frames/three-brains.png` | Three brains with explanatory captions | Reviewed; extra captions avoided |
| `docs/video/demo-explainer/reports/moving-lens-frames/drag.png` | Drag with an editorial gesture icon | Reviewed; original mouse-preview state preferred |
| `docs/video/demo-explainer/reports/moving-lens-frames/warp.png` | Colour developing on moving brain | Reviewed; label overlays avoided |
| `.results/ar-recapture-20261107/closeups.rgb-frames/frame-270.png` | Region and common-space detail | Reviewed; endpoint overlap |
| `.results/ar-recapture-20261107/inspect-centred/storyboard/closeups-014000ms.png` | Common-space end state | Reviewed; endpoint overlap |

Additional native proof images, opening frames and inspection storyboard frames were viewed to check the reconstruction provenance and choose useful before/after states. The drag's starting state uses `opening.rgb-frames/frame-0.png`; the inspection uses `inspect-atomic/inspect-storyboard/closeups-021500ms.png`.

## Editorial treatment

1. Crop before embedding. No uncropped source screenshot is embedded in an exported SVG, so the removed identifier cards cannot be recovered by opening the SVG source.
2. Keep the original brain, slice, region and deformation pixels. Only crop, scale, add titles and connect enlargements. No retouching, invented anatomy, regenerated room or new AI imagery.
3. Leave the endpoint cards and lower source captions outside every crop. The Devpost cover therefore has no volume numbers.
4. Keep the Preview, mouse-input, offline-reconstruction and room-source disclosures visible. Avatars remain labelled as Bitmoji stand-ins. Do not imply device testing or a clinician study.
5. Use the active slice-zoom helper for slice, warp and inspection detail: square contextual boxes, nearest-neighbour enlargement, white halos, fading bands behind the images and palette colours chosen from nearby pixels. The active helper and style hashes are recorded in `manifest.json`.
6. Visually inspect all seven final JPEGs at export resolution. The selected region remains coral, distinct from deformation colour; the slice card retains left/right letters and coordinate labels.

## Local checks

Run `node lens/devpost/gallery/validate-gallery.mjs` to recheck dimensions, file hashes, maximum crop boundaries, the under-5-MB limit and optical character recognition results. The Devpost cover is exactly 3:2; the YouTube cover is exactly 1280 × 720. See `review/validation.json` and `review/privacy-ocr.txt` for the recorded results. `review/contact-sheet.jpg` is a local overview, not an extra gallery asset.

No Lens Studio tool, device, new image generator, upload, registration, form save, submission, commit or push was used for this gallery task.
