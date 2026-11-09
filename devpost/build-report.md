# Build report: Where Does the Atrophy Go?

Evidence curated on 2026-11-09. Lens Studio 5.24.1; single-user Spectacles Interactive Preview. This report describes the current scripts and medical assets, not earlier dial, switch, Reset, lobe-atlas or information-panel builds.

## Current implementation

- `AtrophyPlacement.ts` uses the official Surface Placement package to place one table-relative scene set.
- `AtrophyMain.ts` owns the single morph state. Real Spectacles Interaction Kit drag input moves the carried brain on the shared arc, with a smooth follow and exact endpoint settling. Duplicate carried geometry hides at the endpoints; its input handle remains usable.
- `AtrophyWarpUI.ts` keeps Warp colour on: subject cortex and cuts stay neutral, common-space anatomy has the full map, and moving anatomy builds colour with Main's same morph weight. There is no standalone Warp legend or control in this script.
- `AtrophySliceFocus.ts` defaults to the independently selected largest-region key slices. Selecting a tile switches to a paired canonical level and highlights its planes; selecting it again restores the key pair.
- `AtrophyInspect.ts` lifts a snapshot after a stationary 0.5-second pinch. Spectacles Interaction Kit supplies translation, rotation and two-hand scale. Release returns and destroys the copy while source brains stay on the table.
- `AtrophyClinicians.ts` supplies three seated, scripted Bitmoji stand-ins, gaze following and threshold-triggered speech. The ending is generated from the measured endpoint metadata: “Same region: 24.1 → 7.5 mL. A spatial warp, not disease.”

## Raw-to-assets reconstruction

The producer is now included in [`../pipeline/`](../pipeline/README.md), with a pinned environment, public raw-image downloader, fresh registration, mask measurements, mesh/texture export and an independent reference-measurement check. It uses no frozen temporary transform or parent-project module.

A new complete reconstruction was run on **2026-11-09**, in a fresh work directory and separate asset-output directory. It downloaded the original P0006 image again, validated the snapshot size and SHA-256, and estimated a new affine + SyN registration. The included Lens assets were not overwritten.

| Check | Result | Retained source |
| --- | --- | --- |
| Original OpenNeuro ds007036 1.1.3 image | 13,590,971 bytes; SHA-256 `6b6fceb505dab7d7ffe75c1eb7745c405a3ee2ad23ff4c420ee29a85002f5eac` | [download log](evidence/raw-download.log), [source identity](../pipeline/scan-source.json) |
| Seed and ITK threads | 20261104; one thread | [producer log](evidence/raw-rebuild.log), `pipeline/src/modules/register.py` |
| Fresh registration / scan processing | 218.410 s / 249.425 s | [producer log](evidence/raw-rebuild.log) |
| Full register/slices/compare/assets run | 272.90 s; peak resident memory 4367.2 MiB | [producer log](evidence/raw-rebuild.log) |
| Exact subject / MNI mask volumes | 24.06786456999029 / 7.517 mL | [verification JSON](evidence/raw-rebuild-verification.json) |
| Display values | 24.1 / 7.5 mL | [verification JSON](evidence/raw-rebuild-verification.json) |
| Subject / MNI key slices | scanner z −16 mm, 1188 mm² / MNI z 19 mm, 728 mm² | [verification JSON](evidence/raw-rebuild-verification.json) |
| All paired slice levels and every key-slice candidate area | Exact match to the included reference | [verification JSON](evidence/raw-rebuild-verification.json), [reference measurements](../pipeline/reference-measurements.json) |
| Pyright inside the actual `ants-reg` environment | 0 errors, 0 warnings, 0 informations | [Pyright output](evidence/pipeline-pyright.log) |

The earlier [two-independent-run proof](evidence/p0006-reproducibility.json) records identical brain/subject-region/MNI-region mask file hashes, voxel hashes and affines for two raw reconstructions in the same environment. The [new portable-run audit](evidence/raw-rebuild-audit.json) compares those masks again and records negative checks: a wrong volume and a wrong raw input must both be rejected. Bitwise reproducibility is not asserted across platforms.

ANTsPy 0.6.3 performs affine + SyN onto TemplateFlow MNI152NLin2009cAsym / ICBM152 2009c, with a 2 mm registration reference and 1 mm output. P0006's canonical raw z crop is `[45:234]`; image intensities are retained. A 600-second per-scan hard deadline is unchanged. Resumption now also checks the raw checksum, as well as source path, full registration signature and all required derivatives.

The selected region is the largest binary-opened dark-fluid component satisfying the original smoothed forward-Jacobian rule. It is a transform-conditioned pocket, not a full ventricle-system segmentation. The full affine+SyN pullback Jacobian, `dV_subject / dV_MNI`, supplies common-space colour. Actual mask voxel counts supply the endpoint volumes; clipped colours and smoothed meshes do not.

The [medical asset audit](evidence/ants-assets-audit.json) retains the finite-field/accessor, neutral-versus-Warp geometry, key-area and common-only-overlay checks for the current medical payload. Its mesh endpoint approximation is disclosed: the common-space mesh error exceeds the unchanged 3% audit threshold, so `approximate=true` and `endpoints_pinned=true` remain in the offline curve metadata. The Lens neither evaluates nor displays that curve. No geometry rescaling or tolerance widening was used.

NumPy/Apple Accelerate floating warnings and PyVista future warnings remain visible in the fresh producer log. Required coordinate fields and exported geometry have explicit finite-value checks; the complete run and reference-measurement verification passed. No warning filter was added.

## Preview evidence

The current `AtrophyLeafIndex.ts` registers **13 distinct scenarios**, 01–08 and 10–14. Scenario 14 is the projection-clearance test; it is not the former dial scenario. The [result index](evidence/leaf-results.json) points to the original native log excerpt for each pass. All 13 have an actual `PASSED` terminal; the projection test also passed at a second eye pose. A transport timeout is not treated as a pass.

These are retained records from the latest complete `inspect-atomic-interact-ready` Preview collection. Repository preparation did not open Lens Studio, run these scenarios again or deploy to a device. [Successful compilation](evidence/lens-recompile.json) and the following [runtime refresh](evidence/lens-runtime-refresh.json) are separate evidence, not interchangeable checks.

| Scenario | Native terminal time | Original native excerpt |
| --- | --- | --- |
| 01 startup | 02:07:23.809 | [log](evidence/leaf/native-atrophy-01-startup-startup-9445426.log) |
| 02 endpoints | 02:07:53.139 | [log](evidence/leaf/native-atrophy-02-endpoints-endpoints-9487521.log) |
| 03 smooth morph | 02:08:45.657 | [log](evidence/leaf/native-atrophy-03-smooth-morph-morph-9524665.log) |
| 04 billboard slices | 02:08:55.739 | [log](evidence/leaf/native-atrophy-04-billboard-slices-slices-9563960.log) |
| 05 readability | 02:09:05.951 | [log](evidence/leaf/native-atrophy-05-readability-readability-9605270.log) |
| 06 far-field input | 02:09:27.702 | [log](evidence/leaf/native-atrophy-06-ik-far-field-far-field-9642422.log) |
| 07 demo sweep | 02:09:50.145 | [log](evidence/leaf/native-atrophy-07-demo-sweep-demo-sweep-9681792.log) |
| 08 clinicians | 02:10:20.437 | [log](evidence/leaf/native-atrophy-08-clinicians-clinicians-9720834.log) |
| 10 Warp view | 02:10:53.188 | [log](evidence/leaf/native-atrophy-10-warp-view-warp-9765300.log) |
| 11 placement | 02:31:54.157 | [log](evidence/leaf/native-atrophy-11-placement-placement-9951467.log) |
| 12 slice focus | 02:32:11.526 | [log](evidence/leaf/native-atrophy-12-slice-focus-slice-focus-9988741.log) |
| 13 inspection copy | 02:32:35.040 | [log](evidence/leaf/native-atrophy-13-inspect-copy-inspect-10028269.log) |
| 14 projection clearance, original eye | 02:32:57.318 | [log](evidence/leaf/native-atrophy-14-projection-clearance-projection-10069230.log) |
| 14 projection clearance, capture eye | 02:33:19.563 | [log](evidence/leaf/native-atrophy-14-projection-clearance-projection-10135500.log) |

The runtime record retains the known depth-format fallback and external-service authentication warnings. These are not presented as fixed. [Evidence checksums](evidence/manifest.json) identify the retained files; obsolete layouts and screenshots have been removed from this public evidence folder.

## Limits and attribution

- Preview proves the tested logic and geometry. It does not establish real-device hand tracking, long-term comfort, performance, clinical usability or shared-user synchronization.
- The video includes a scientific explainer and reconstructed Preview footage. It is not a wearable-camera capture or proof that its extra explanatory diagrams exist inside the Lens.
- One scan is shown in two geometries. Its spatial-warp compression is not observed disease progression, tissue loss or diagnostic severity.
- ICBM152's MNI/McGill copyright and template licence, OpenNeuro CC0 source and the ANTsPy/TemplateFlow Apache notices are retained in [`../NOTICE`](../NOTICE) and [`../third-party-licenses/`](../third-party-licenses/). The TemplateFlow client's licence does not replace the template licence.
- This repository preparation is local draft work only. No commit, push, upload, publication, device deployment or submission was performed.
