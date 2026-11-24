# Where Does the Atrophy Go?

## Why Does a Brain Region Shrink After Registration?

**A neuroimaging tutorial on subject space, common space and Jacobian weighting.**

This repository is for neuroimaging students and newcomers. You will rebuild a selected fluid region from a public structural brain scan, measure it before and after registration, then use the registration's Jacobian to approximately recover its original volume. The companion Lens lets you drag an interactive copy between the two spaces while the original remains fixed.

The name *Where Does the Atrophy Go?* is a question about an image-processing effect, **not a claim that this example measures atrophy**. It is the same scan in different coordinates: registration changes the image, not the person's brain. Jacobian volume correction is an established method; this project teaches it rather than inventing a new correction or diagnostic tool.

## What you will reproduce

The table points to values produced by the commands below. All paths are relative to this repository (the `lens/` directory in the working checkout).

| Measurement | Unrounded volume → teaching label | Output file and JSON key paths |
| --- | --- | --- |
| Mask in subject space | 24.06786456999029 → **24.1 mL** | `pipeline/.results/tables/weighted-volume.json` → `volumes_ml.subject`, `display_ml.subject` |
| Same selected region, resampled into common space | 7.517 → **7.5 mL** | Same file → `volumes_ml.mni`, `display_ml.mni` |
| Common-space mask with Jacobian weighting | 23.562830890774727 → **23.6 mL** | Same file → `volumes_ml.jacobian_weighted`, `display_ml.jacobian_weighted` |

The fixed, included reference is [`pipeline/reference-measurements.json`](pipeline/reference-measurements.json): `ventricle_ml_exact.subject`, `ventricle_ml_exact.mni` and `weighted_volume.jacobian_weighted_ml`, respectively. The included Lens displays the unweighted endpoints from [`Assets/Brain/region.json`](Assets/Brain/region.json), keys `ventricle_ml` and `ventricle_ml_exact`. The weighted measurement is a pipeline result, **not a new Lens readout**.

## Before you start

- Use macOS or Linux with [Micromamba](https://mamba.readthedocs.io/en/latest/installation/micromamba-installation.html). The registration's POSIX timeout is not supported by this entry point on Windows.
- Run commands from this repository's root. Use the pinned [`pipeline/environment.yml`](pipeline/environment.yml), whose environment is named `ants-reg`; do not substitute a system Python.
- Allow several GB of disk space and internet access for the original image and TemplateFlow references. Registration runs offline on your computer, not inside Lens Studio. A fixed per-scan deadline fails explicitly on an unexpectedly slow run.
- Start with the single example fetched below. If you have added other raw scans, see [scan selection and path overrides](pipeline/README.md); `--only-scan` limits registration/comparison, whereas `--scan` selects the weighted measurement and asset export.

The raw image is from [OpenNeuro ds007036, snapshot 1.1.3](https://openneuro.org/datasets/ds007036/versions/1.1.3), the CC0 7TEA / ALS–FTD spectrum dataset. [`pipeline/scan-source.json`](pipeline/scan-source.json) records the exact image, download URL, byte count and snapshot checksum. The downloader verifies that identity; raw images and private transforms are not shipped here.

## Rebuild from the raw scan

```bash
# Create the pinned environment once, if ants-reg does not already exist.
micromamba env create -f pipeline/environment.yml

# Download the original image, or verify an existing copy against the snapshot.
micromamba run -n ants-reg python pipeline/fetch_raw.py

# Keep the included Lens assets unchanged; put rebuilt assets in ignored results.
export ATROPHY_ASSET_DIR="$PWD/pipeline/.results/rebuilt-lens/Brain"

# Register, prepare slices, compare masks, Jacobian-weight, and export assets.
micromamba run -n ants-reg python pipeline/run.py --resources

# Check the fresh outputs against the fixed reference, including the weighted sum.
micromamba run -n ants-reg python pipeline/verify.py
```

The verifier should report `status: PASS`. It checks the raw checksum, exact endpoint volumes, slice measurements and weighted result; it does not use a newly generated file as its own expected reference. The expected weighted numbers are retained in `reference-measurements.json` under `weighted_volume`.

The output override above protects `Assets/Brain/`. **Without that override, the default full run overwrites the included Lens assets; close Lens Studio first.** Raw inputs go to `pipeline/raw/`, processing state to `pipeline/.intermediates/`, measurement tables to `pipeline/.results/tables/`, and the default-on Pyinstrument report to `pipeline/.results/profile/run.html`. `--no-profile` is the explicit profiling opt-out.

Registration resumes only when the raw path, checksum, full configuration and required derivatives match. For an independent new registration, select a new `ATROPHY_WORK_DIR` as described in the [pipeline instructions](pipeline/README.md). Reproducibility was checked on the same Mac and pinned environment; bitwise equality across platforms is not claimed.

Read the numbers directly rather than measuring a rendered mesh:

```bash
micromamba run -n ants-reg python - <<'PY'
import json
from pathlib import Path

path = Path("pipeline/.results/tables/weighted-volume.json")
data = json.loads(path.read_text())
for key, value in data["volumes_ml"].items():
    print(f"{path} → volumes_ml.{key}: {value} mL")
for key in ("mask_voxels", "voxel_mm3", "weighted_mm3"):
    print(f"{path} → measurement.{key}: {data['measurement'][key]}")
print(f"{path} → resampling_difference_percent: {data['resampling_difference_percent']} %")
PY
```

Once a registration exists, recompute just the correction without exporting or changing any Lens asset:

```bash
micromamba run -n ants-reg python pipeline/run.py --steps weighted --resources
```

This uses the scan selected by `--scan`, the same selection used for asset export. The selected result is written to `pipeline/.results/tables/weighted-volume.json`; choosing another scan replaces that table. Its `inputs`, `registration` and `jacobian_convention` fields identify the masks, configuration and Jacobian used.

## Why the correction works

**Subject space** is the scan's original physical coordinate system. **Common space** is the reference coordinate system used here by the Montreal Neurological Institute (MNI) template, **MNI152NLin2009cAsym / ICBM152 2009c**. Alignment makes corresponding anatomy easier to locate and compare, but an unweighted voxel count in the resampled image measures volume in the *new* coordinates.

The pipeline estimates an affine transform followed by ANTsPy's symmetric normalization (SyN) method for nonlinear registration. The full **pullback Jacobian** is

```text
J = dV_subject / dV_MNI
```

It says how much subject-space volume corresponds locally to a unit of common-space volume. With this convention, `J > 1` means the region was squeezed into the template; `J < 1` means it was stretched. Taking the inverse, using a forward Jacobian, omitting the affine component or summing the display colours would answer a different question.

For the binary selected region, the pipeline calculates

```text
common-space volume = count(mask voxels) × voxel_mm3
weighted volume     = sum(J[mask]) × voxel_mm3
volume in mL        = volume in mm³ / mm3_per_ml
```

Voxel volume comes from the absolute determinant of the mask's physical affine, not an assumption about isotropic spacing. In this example the common mask contains **7517 voxels**, each **1 mm³**, and the unclipped weighted sum is **23562.830890774727 mm³** (`pipeline/.results/tables/weighted-volume.json` → `measurement.mask_voxels`, `measurement.voxel_mm3`, `measurement.weighted_mm3`). The exact conversion is **1000 mm³ per mL** (same file → `measurement.mm3_per_ml`). The module rejects incompatible mask/Jacobian grids, empty or nonbinary common masks, and nonpositive or nonfinite weights inside the region; it does not silently resample or repair them.

**Approximate recovery, not exact equality:** the weighted result is **2.098373446247826% below** the native mask measurement (same file → `resampling_difference_percent`; fixed reference → `pipeline/reference-measurements.json`, `weighted_volume.resampling_difference_percent`). The pipeline uses nearest-neighbour mask resampling and discretized grids/Jacobians. These leave a resampling/discretisation discrepancy; the result must not be presented as exact conservation or as a biological change.

## What this example does not establish

- The coral region is selected by an image-and-warp-conditioned rule: dark fluid, a low forward volume-change factor, binary opening and the largest connected component. It is **not an atlas-defined complete ventricle segmentation**, a cortical lesion, or a disease-severity score. The precise thresholds and crop are in [`pipeline/src/modules/register.py`](pipeline/src/modules/register.py).
- Mask volumes come from actual image voxels. Smoothed display meshes, interpolated morphs and clipped Jacobian colours are not quantitative measurements. Subject and common key slices independently maximize the region's cross-section; they are not one material plane followed through the warp.
- The correction is already familiar in Jacobian-modulated voxel-based morphometry and related registration-based analyses. Native-space methods also exist; not all neuroimaging or AI analysis uses template space.
- This is a single-scan teaching example, not longitudinal evidence of tissue loss, clinical validation or a replacement for a validated segmentation workflow.

## Explore the companion interactive model

You can open the included Lens without rebuilding the medical assets:

1. If cloned with Git, install [Git LFS](https://git-lfs.com/) and run `git lfs pull` to obtain binary assets.
2. Open [`lens.esproj`](lens.esproj) in **Lens Studio 5.24.1** (project file → `studioVersion.major`, `.minor`, `.patch`). Select a Spectacles device profile and Interactive Preview. The stand-in Bitmoji clinicians and their idle animation need internet access on first load.
3. Confirm the surface-placement reticle with a Preview click. Drag the middle brain along the dashed arc to deform the carried copy toward common space; the original stays fixed. At the endpoints the duplicate mesh is hidden, but its handle remains available.
4. Hold a stationary pinch/click to lift an inspection copy, then release it to return it. Select a slice tile to inspect its paired level and highlighted planes; select it again to return to the largest-region slice pair. Look around the table to see the wider layout.

Common-space Warp colour is always enabled and builds progressively on the carried brain. Subject anatomy remains neutral. Red means squeezed into the template; blue means stretched. The seated Bitmoji clinicians are scripted teaching stand-ins, not connected participants. There is no dial, Warp switch, Reset button or live volume calculator in the current Lens.

**Honest scope:** the companion video's live clip is a Lens Studio Preview recording driven by scripted simulated-hand input, played at 2× speed. No Spectacles device use, tracked-user-hand capture, shared-user synchronization, clinician study or device comfort/performance test is claimed. The video explanation of Jacobian weighting is not an additional Lens feature.

## Source, checks and attribution

- [`pipeline/run.py`](pipeline/run.py) exposes `register`, `slices`, `compare`, `weighted`, `assets`; [`weighted_volume.py`](pipeline/src/modules/weighted_volume.py) implements the unclipped voxel sum. [`pipeline/README.md`](pipeline/README.md) gives the full method, pinned raw identity, path overrides and resumption rules.
- Run the focused Python regressions with `cd pipeline && micromamba run -n ants-reg python -m unittest discover -s tests -v`. They cover physical voxel volume, orientation/grid agreement, invalid inputs, pipeline output, profiling and nonzero failure exits.
- [`Assets/Scripts/`](Assets/Scripts/) owns placement, dragging, slices, inspection and scripted clinicians. Existing Lens integration tests (LEAF) and separate compilation/runtime records are indexed in [`devpost/evidence/leaf-results.json`](devpost/evidence/leaf-results.json) and the [build report](devpost/build-report.md). Those retained Preview records are not new device evidence.
- The [design brief](devpost/design-brief.md) and [build account](devpost/devpost-description.md#how-i-built-it) record the interaction design and the use of Snap's building-agent workflow (CLAD) from the Pi coding agent through Lens Studio's Model Context Protocol (MCP) tools. Workflow attribution is not a complete tool-call transcript.

## Licences

Project-authored code is MIT licensed; see [`LICENSE`](LICENSE). That licence does **not** replace third-party terms for Snap packages, Bitmoji, medical data or other content.

The ICBM152 template retains its MNI/McGill copyright and template licence. Downloading through TemplateFlow does not change those terms. ANTsPy and the TemplateFlow client are Apache-2.0; the OpenNeuro data is CC0. No FSL executable, template or atlas is used or shipped in the current medical assets. Keep [`NOTICE`](NOTICE) and [`third-party-licenses/`](third-party-licenses/) with the relevant content.
