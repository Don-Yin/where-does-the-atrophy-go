# Where Does the Atrophy Go?

A single-user teaching Lens for Spectacles. Place a real public-scan brain and an MNI reference brain on a table, then pinch-drag the carried brain along the curved path between them. The same coral ventricle-fluid region changes shape with the saved spatial warp: **24.1 mL in subject space and 7.5 mL in common space**.

This demonstrates spatial normalization of one scan. The geometric change is not observed disease progression, tissue loss or a diagnostic score.

## Open and use

1. If you cloned with Git, install [Git LFS](https://git-lfs.com/) and run `git lfs pull` to obtain the binary assets.
2. Open `lens.esproj` in **Lens Studio 5.24.1**. Select a Spectacles device profile and Interactive Preview. The stand-in Bitmoji clinicians and their idle clip load from Snap services, so the first run needs internet access.
3. Confirm the horizontal surface reticle with a pinch or Preview tap. Placement moves the whole experience into one table-relative frame.
4. Pinch the carried brain and drag along the dashed arc. It morphs toward common space and back. At either endpoint the duplicate carried mesh is hidden; the handle remains available.
5. Hold a stationary pinch for **0.5 seconds** to lift an inspection copy of any brain. Spectacles Interaction Kit handles its translation, rotation and two-hand scaling. Releasing returns and removes the copy; the table brains stay in place.
6. Select a slice tile to show that paired level in the larger card and highlight its planes. Select it again to return to the default largest-region slice pair.

Warp colour is always enabled in common space and builds progressively on the moving brain. Subject anatomy stays neutral. Red means locally squeezed into the template; blue means stretched. The three seated Bitmoji clinicians are scripted teaching stand-ins, with brain-following gaze and short speech bubbles. They are not connected participants.

There is no dial, Warp switch, Reset button, lobe-atlas view or live mesh-volume readout in the current scripts. Look around the table to inspect the wider composition; this is not a claim that all content fits a single forward-facing display view.

## What the images and numbers mean

- **Subject space** is the original scan's own scanner coordinates. **MNI common space** is the reference coordinate system used by the template.
- The coral region is an image-and-warp-conditioned dark-fluid pocket, selected offline. It is not a complete ventricle segmentation or a measured cortical lesion.
- The displayed volumes come from actual voxel masks. Exact values in [`Assets/Brain/region.json`](Assets/Brain/region.json) are **24.06786456999029 / 7.517 mL**; rounding is only for display.
- Seven common-space slices use MNI z = −34, −20, −6, 8, 22, 36, 50 mm. Subject cuts are representative scanner-world cuts linked to those levels by this scan's own warp, not native-space MNI coordinates. Tiles use radiological orientation: image left is patient R, image right is L, anterior is at the top.
- The default key slices independently maximize the selected region's cross-sectional area: subject scanner z = **−16 mm, 1188 mm²**; MNI z = **19 mm, 728 mm²**. They are not one material plane carried between spaces.
- Colour uses the full affine+SyN pullback Jacobian, `dV_subject / dV_MNI`, a local geometric volume-change factor. The Lens does not infer disease severity from it. The offline mesh-volume curve remains audit metadata and is not evaluated or displayed by the Lens.

## Rebuild from raw OpenNeuro data

The complete producer is included in [`pipeline/`](pipeline/README.md); it does not require this repository's former parent project or precomputed transforms.

```bash
micromamba env create -f pipeline/environment.yml  # once, if ants-reg is absent
micromamba run -n ants-reg python pipeline/fetch_raw.py
micromamba run -n ants-reg python pipeline/run.py \
  --only-scan ds007036_sub-P0006_ses-01 --resources
```

The raw source is [OpenNeuro ds007036 snapshot 1.1.3](https://openneuro.org/datasets/ds007036/versions/1.1.3), 7TEA / ALS–FTD spectrum, CC0, participant sub-P0006. The downloader checks the snapshot's SHA-256. Registration uses ANTsPy affine + SyN and TemplateFlow **MNI152NLin2009cAsym / ICBM152 2009c**, with seed **20261104** and **one ITK thread**. The pipeline documentation includes isolated-output commands, exact verification, environment pins, resumption rules and the 600-second per-scan deadline.

A fresh raw reconstruction on 2026-11-09 reproduced the exact mask volumes, slice levels and key-slice candidate areas. See the [build report](devpost/build-report.md) and [verification result](devpost/evidence/raw-rebuild-verification.json). Reproducibility was checked on the same Mac and pinned environment, not asserted bitwise across platforms.

## Tests and verification limits

[`Assets/Scripts/AtrophyLeafIndex.ts`](Assets/Scripts/AtrophyLeafIndex.ts) currently registers **13 LEAF integration scenarios**: 01–08 and 10–14. Scenario 14 is `atrophy-14-projection-clearance`, not the removed dial test. Run one scenario at a time in Preview; count a result only when its native log reports `PASSED`.

The [retained evidence index](devpost/evidence/leaf-results.json) contains native passes for all 13 distinct scenarios, with a second projection check at the capture eye pose. [Compilation and runtime records](devpost/build-report.md#preview-evidence) are retained separately. These are existing Preview records, not a new device test performed while preparing this repository.

No Spectacles deployment, tracked-user-hand capture, device comfort/performance study, clinician study or shared-user synchronization is claimed. The video uses reconstructed Lens Studio Preview states and explicitly labelled stand-ins; its scientific explainer is not an additional Lens feature.

## Repository map

- `Assets/Scripts/`: interaction, placement, slices, inspection, scripted clinicians and LEAF scenarios.
- `Assets/Brain/`: cortex/region meshes, morph targets, slice images, outlines, common-space Warp overlays and measurement metadata.
- `pipeline/`: raw-image downloader, fixed environment and offline medical asset producer.
- `Packages/`, `Plugins/`: Lens Studio dependencies and the LEAF Preview test plugin.
- `devpost/`: submission-text drafts, build report and a small, cited current-evidence set.
- `third-party-licenses/`: retained ICBM152 and Apache licence texts.

## Licences

Project-authored code is MIT licensed; see [`LICENSE`](LICENSE). That licence does not replace the terms for Snap packages, Bitmoji, medical data or other third-party content.

ICBM152 retains its MNI/McGill copyright and template licence. Downloading through TemplateFlow does not change it. ANTsPy and the TemplateFlow client are Apache-2.0. No FSL executable, template or atlas is used or shipped in the current medical assets. See [`NOTICE`](NOTICE) and [`third-party-licenses/`](third-party-licenses/).
