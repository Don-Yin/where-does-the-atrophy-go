# Rebuild the medical assets from raw data

This is the repository-local copy of the number/asset producer used for the Lens. It starts with an original OpenNeuro NIfTI image, computes a new affine + SyN registration, re-selects the same image-and-warp-conditioned fluid region, measures both voxel masks and the Jacobian-weighted common mask, and writes a weighted results table plus `Assets/Brain/region.json`, meshes and textures. **No saved transform, parent checkout, `/tmp` file, FSL installation or atlas is needed.** Registration is offline, not a Lens runtime feature.

## Environment and one-command rebuild

Run from the root of this repository, on macOS or Linux with [Micromamba](https://mamba.readthedocs.io/en/latest/installation/micromamba-installation.html). The registration timeout uses POSIX `signal.alarm`; Windows is not supported by this entry point. Internet access is required for the public raw image and the four TemplateFlow T1/brain-mask references (1 and 2 mm). Allow several GB of working space.

```bash
# Once, when this environment does not exist:
micromamba env create -f pipeline/environment.yml

# Fetch the original scan, checking both its size and snapshot SHA-256:
micromamba run -n ants-reg python pipeline/fetch_raw.py

# Register from raw, prepare slices, measure/weight masks and export all Lens assets:
micromamba run -n ants-reg python pipeline/run.py \
  --only-scan ds007036_sub-P0006_ses-01 \
  --scan ds007036_sub-P0006_ses-01 --resources

# Compare exact mask volumes, the weighted sum and key-slice areas with the fixed reference:
micromamba run -n ants-reg python pipeline/verify.py
```

The verifier reads the fixed `pipeline/reference-measurements.json`, not the just-written output as its own reference. It also reads `pipeline/.results/tables/weighted-volume.json` (override with `--weighted PATH`), verifies its scan, template and registration against the exported assets, and checks its endpoint and weighted measurements. The default export overwrites `Assets/Brain/`; close Lens Studio before regenerating assets. `environment.yml` pins ANTsPy 0.6.3, TemplateFlow 25.1.2 and the image/mesh libraries on Python 3.11. Reproducibility was checked on the same Mac and environment, not asserted bitwise across platforms. A scan has a **600-second hard deadline**; an unexpectedly slow machine will fail rather than silently change settings.

For optional editor type checking, `pyrightconfig.json` expects a local, ignored `.venv` link to the installed environment. From the repository root:

```bash
ln -s "$(micromamba run -n ants-reg python -c 'import sys; print(sys.prefix)')" .venv
```

This link is not required to run the producer and is never committed.

## Raw source and immutable identity

- Dataset: [OpenNeuro ds007036, snapshot 1.1.3](https://openneuro.org/datasets/ds007036/versions/1.1.3), 7TEA / ALS–FTD spectrum, CC0.
- BIDS image: `sub-P0006/ses-01/anat/sub-P0006_ses-01_T1w.nii.gz`.
- Local name: `raw/ds007036_sub-P0006_ses-01_T1w.nii.gz` under this directory. The prefix distinguishes datasets; it does not modify the image.
- Original file: **13,590,971 bytes**, SHA-256 `6b6fceb505dab7d7ffe75c1eb7745c405a3ee2ad23ff4c420ee29a85002f5eac`.
- `scan-source.json` records the snapshot's Git-annex pointer and the public S3 object version used by `fetch_raw.py`. A size/checksum mismatch fails. An existing different file is not overwritten.

If you already downloaded the dataset, copy this one original BIDS file to the local name above and run `fetch_raw.py` to validate it. Raw images and private processing intermediates are not shipped in the repository.

## Method and outputs

1. Read the raw image in its closest RAS orientation. Crop P0006 canonical z indices `[45:234]`, preserving original intensities and the physical affine.
2. Run ANTsPy affine + SyN against TemplateFlow `MNI152NLin2009cAsym` / ICBM152 2009c, with the 2 mm registration reference and 1 mm output grid. Full parameters are in `src/modules/register.py`; seed **20261104** and **one ITK thread** are set before ANTs is imported.
3. Select the largest binary-opened dark-fluid component where the smoothed forward volume-change factor is below 0.5. The dark threshold is 0.35 times the deep-brain 75th-percentile intensity; coordinate fields use sigma=2-voxel smoothing. This is a transform-conditioned pocket, **not a complete ventricle segmentation**.
4. Carry its mask into MNI with nearest-neighbour resampling. Volume is the mask voxel sum times the absolute affine determinant, divided by 1000 to convert cubic millimetres to millilitres. The expected exact values are **24.06786456999029 / 7.517 mL**, rounded only for display to **24.1 / 7.5 mL**.
5. Sum the full affine+SyN pullback Jacobian, `dV_subject / dV_MNI`, over the common-space binary mask and multiply by the actual voxel volume. The result is **23.562830890774727 mL**, displayed as **23.6 mL** (`.results/tables/weighted-volume.json` → `volumes_ml.jacobian_weighted`, `display_ml.jacobian_weighted`). It is **2.098373446247826% below** the native measurement (same file → `resampling_difference_percent`): approximate recovery after nearest-neighbour resampling and discretisation, not exact equality. The sum uses unclipped weights; incompatible grids or invalid weights inside the mask fail explicitly.
6. Export neutral cortex, the coral region with an `mni` morph target, common-space Jacobian colours, slice grids/outlines and the default key-slice pair. Colours use the same full pullback Jacobian. Mask volumes are not calculated from the smoothed meshes or clipped colours.

The seven requested MNI levels come from `axial-slices.json`, a portable export of the shared `reader-facing-mni-z-seven-v1` recipe. Each image resolves world coordinates using its own affine. Native cuts are representative scanner-world cuts linked by this scan's warp, not native-space MNI coordinates. The two default key slices are selected independently as the largest ROI cross-section in each space; they are not a single material plane followed through the warp.

Folders, all relative to this directory:

| Folder | Contents |
| --- | --- |
| `raw/` | Original checksum-verified image (ignored) |
| `.intermediates/derivatives/<scan>/` | Newly estimated affine/forward/inverse warps, coordinate fields, masks, `source.txt`, `registration.json` (ignored) |
| `.intermediates/templateflow/` | TemplateFlow-owned reference cache (ignored) |
| `.intermediates/derivatives/slices/` | Slice-level manifest and diagnostic images (ignored) |
| `.results/tables/` | Exact mask comparison and selected-scan `weighted-volume.json` (ignored) |
| `.results/profile/` | Default-on Pyinstrument HTML; `--no-profile` is the explicit opt-out (ignored) |
| `../Assets/Brain/` | Default public asset output, including `region.json` |

The five steps can also be selected with `--steps register slices compare weighted assets`. Once registration exists, `--steps weighted` recomputes only the correction and never writes to Lens assets. `--scan` selects the scan for weighting and asset export; `--only-scan` limits registration, slices and comparison. The selected weighted result replaces `.results/tables/weighted-volume.json`; its `inputs`, `registration` and `jacobian_convention` fields identify its provenance. Resumption requires the same recorded raw path, **raw checksum**, full configuration and every required derivative. To force an independent reconstruction, use a new work directory, rather than copying old transforms.

## Rebuild without changing the included Lens assets

```bash
export ATROPHY_WORK_DIR="$PWD/pipeline/.intermediates/fresh-check"
export ATROPHY_ASSET_DIR="$PWD/pipeline/.results/fresh-check/Brain"
micromamba run -n ants-reg python pipeline/run.py \
  --only-scan ds007036_sub-P0006_ses-01 --resources
micromamba run -n ants-reg python pipeline/verify.py
```

Other explicit overrides are `ATROPHY_RAW_DIR`, `ATROPHY_RESULTS_DIR` and `TEMPLATEFLOW_HOME`; use absolute paths. Defaults never refer to a parent project. Do not point a fresh registration at an old derivative directory whose recorded source has changed; the producer intentionally refuses that replacement.

## Focused regression checks

```bash
cd pipeline
micromamba run -n ants-reg python -m unittest discover -s tests -v
```

The tests exercise unclipped weights, physical affine determinants, storage orientation, invalid grids/masks/weights, the selected pipeline output, fixed-reference verification, default profiling, `--no-profile`, and nonzero failure propagation.

## Scientific and licence boundaries

One scan is shown in two coordinate spaces. Compression by registration is **not observed disease progression, tissue loss or diagnostic severity**. The selected region is not an atlas-defined entire ventricle system. The offline mesh-volume curve is audit metadata; the Lens displays the two measured mask endpoints, not that curve.

OpenNeuro data is CC0. The ICBM152 template retains its own MNI/McGill copyright and licence; the TemplateFlow client's Apache licence does not replace it. ANTsPy and the TemplateFlow client are Apache-2.0. See [`../NOTICE`](../NOTICE) and [`../third-party-licenses/`](../third-party-licenses/). Project-authored pipeline code is MIT.
