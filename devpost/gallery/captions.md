# Gallery captions — review draft

These are local review assets, not a published submission. Use the five numbered images in order. The Devpost and YouTube thumbnails are separate cover assets.

## Covers

| File | Size | Short caption |
|---|---:|---|
| `devpost-thumbnail.jpg` | 1800 × 1200, 3:2 | Move a brain. Follow the warp. |
| `youtube-thumbnail.jpg` | 1280 × 720 | Move a brain. Follow the warp. |

## Devpost gallery

| Order | File | Short English caption |
|---:|---|---|
| 1 | `01-three-brains.jpg` | Keep the subject, moving brain and shared reference in view. |
| 2 | `02-drag-the-brain.jpg` | Drag the moving brain between the fixed endpoints. |
| 3 | `03-paired-slices.jpg` | Compare the paired slices and the same coral region outline. |
| 4 | `04-warp-colours.jpg` | Cortex colours encode the warp: blue stretches, red squeezes. Coral marks the selected fluid-space region. |
| 5 | `05-inspection-copy.jpg` | A stationary hold lifts an inspection copy; release returns it. |

## Context and disclosures

- **All images:** built from existing Lens Studio Preview captures of mouse-driven interaction, presented as an **offline panoramic reconstruction**. These are not recordings through glasses. The disclosure is printed on every image.
- **Room:** `room: AI-generated from public-domain photo` is retained on every image that shows the room plate. No new room image or AI asset was generated for this gallery.
- **Avatars:** Bitmoji stand-ins, not evidence of a clinician session or user study. The stand-in disclosure is printed on the images.
- **Privacy and measurements:** endpoint identifier and measurement cards, lower source captions, and the original orange display-simulation label are outside the retained crops. No participant identifier or volume number is included in the final artwork. Only already-cropped raster assets are embedded in the saved SVG sources.
- **Scientific meaning:** the warp is a spatial transformation between coordinate spaces, not disease progression, tissue loss or diagnostic severity. “Subject space” means the scan's own coordinates; “common space” is the shared reference. The source slice card's “MNI” means the Montreal Neurological Institute reference space; “ROI” means the selected region of interest. Left/right markings from the source capture are preserved.

## Alternative text

- **Devpost cover:** Three brain views and a paired slice card in a table-based Lens Studio Preview lesson. The coral selected fluid-space region appears in each brain.
- **1 — Three brains:** A neutral subject-space brain, a partly coloured moving brain, and a blue common-space brain sit along the same curved guide. The same coral selected fluid-space region is visible in all three.
- **2 — Drag:** Two captured states show the curved drag: the moving brain overlaps an endpoint before the drag and becomes a separate third brain during the drag.
- **3 — Slices:** The full brain-and-slice layout is shown beside a nearest-neighbour enlargement of its paired slice card. A haloed square and connecting lines identify the exact crop.
- **4 — Warp colours:** A square on the common-space brain connects to a pixel-preserving enlargement. The outer brain carries blue deformation colour, while a separate coral selected fluid-space region remains visible inside.
- **5 — Inspection:** The scene shows an inspection copy above the moving brain, with both endpoint brains still on the table. A square and enlargement show the copy and its source together.
- **YouTube cover:** Title art over a cropped Preview capture of the three brain models, with coral selected fluid-space regions and progressive deformation colour.

## Evidence and rebuilding

`manifest.json` records the source frames, source hashes, exact crop rectangles, exported image hashes and sizes. `review/validation.json` records size, privacy-boundary and optical character recognition checks. `review/contact-sheet.jpg` is for review, not an additional gallery upload.

To rebuild with Node.js, ImageMagick and librsvg available:

```sh
# Point to the active slice-zoom helper when it is not at the local default.
SLICE_ZOOM_HELPER=/path/to/slice-zoom/references/slice_zoom_svg.mjs \
  node lens/devpost/gallery/build-gallery.mjs
```

The slice-zoom helper reads its own `style.json`; this gallery does not vendor or copy its style constants. Rebuilding reads existing local images only; it does not open Lens Studio, capture a new scene, generate AI imagery, or publish anything.
