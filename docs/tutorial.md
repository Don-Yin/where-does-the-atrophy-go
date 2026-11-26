# Tutorial: Why Does a Brain Region Shrink After Registration?

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

The fixed, included reference is [`pipeline/reference-measurements.json`](../pipeline/reference-measurements.json): `ventricle_ml_exact.subject`, `ventricle_ml_exact.mni` and `weighted_volume.jacobian_weighted_ml`, respectively. The included Lens displays the unweighted endpoints from [`Assets/Brain/region.json`](../Assets/Brain/region.json), keys `ventricle_ml` and `ventricle_ml_exact`. The weighted measurement is a pipeline result, **not a new Lens readout**.

## Before you start

- Use macOS or Linux with [Micromamba](https://mamba.readthedocs.io/en/latest/installation/micromamba-installation.html). The registration's POSIX timeout is not supported by this entry point on Windows.
- Run commands from this repository's root. Use the pinned [`pipeline/environment.yml`](../pipeline/environment.yml), whose environment is named `ants-reg`; do not substitute a system Python.
- Allow several GB of disk space and internet access for the original image and TemplateFlow references. Registration runs offline on your computer, not inside Lens Studio. A fixed per-scan deadline fails explicitly on an unexpectedly slow run.
- Start with the single example fetched below. If you have added other raw scans, see [scan selection and path overrides](../pipeline/README.md); `--only-scan` limits registration/comparison, whereas `--scan` selects the weighted measurement and asset export.

The raw image is from [OpenNeuro ds007036, snapshot 1.1.3](https://openneuro.org/datasets/ds007036/versions/1.1.3), the CC0 7TEA / ALS–FTD spectrum dataset. [`pipeline/scan-source.json`](../pipeline/scan-source.json) records the exact image, download URL, byte count and snapshot checksum. The downloader verifies that identity; raw images and private transforms are not shipped here.

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

Registration resumes only when the raw path, checksum, full configuration and required derivatives match. For an independent new registration, select a new `ATROPHY_WORK_DIR` as described in the [pipeline instructions](../pipeline/README.md). Reproducibility was checked on the same Mac and pinned environment; bitwise equality across platforms is not claimed.

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
