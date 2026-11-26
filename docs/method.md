# Method

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

- The coral region is selected by an image-and-warp-conditioned rule: dark fluid, a low forward volume-change factor, binary opening and the largest connected component. It is **not an atlas-defined complete ventricle segmentation**, a cortical lesion, or a disease-severity score. The precise thresholds and crop are in [`pipeline/src/modules/register.py`](../pipeline/src/modules/register.py).
- Mask volumes come from actual image voxels. Smoothed display meshes, interpolated morphs and clipped Jacobian colours are not quantitative measurements. Subject and common key slices independently maximize the region's cross-section; they are not one material plane followed through the warp.
- The correction is already familiar in Jacobian-modulated voxel-based morphometry and related registration-based analyses. Native-space methods also exist; not all neuroimaging or AI analysis uses template space.
- This is a single-scan teaching example, not longitudinal evidence of tissue loss, clinical validation or a replacement for a validated segmentation workflow.
