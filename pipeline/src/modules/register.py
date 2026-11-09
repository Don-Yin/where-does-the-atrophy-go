"""ANTs affine + SyN onto TemplateFlow ICBM152 2009c; no bundled template or atlas."""
import hashlib
import json
import logging
import os
import shutil
import signal
import time
from pathlib import Path
from typing import Any, cast

from src.modules.slices import canonical
from src.utils.paths import DER, PIPELINE, RAW, TEMPLATE, template_path

# Configure ITK BEFORE importing ANTs; fixed seed + one thread retains the same affine+SyN method.
os.environ["ITK_GLOBAL_DEFAULT_NUMBER_OF_THREADS"] = "1"

# isort: split
import ants
import nibabel as nib
import numpy as np
from ants.config import set_ants_deterministic
from scipy import ndimage as nd

logger = logging.getLogger(__name__)
SEED, MAX_SCAN_SECONDS = 20261104, 600
THREADS = int(os.environ["ITK_GLOBAL_DEFAULT_NUMBER_OF_THREADS"])
PARAMETERS = {"type_of_transform": "SyN", "aff_metric": "mattes", "aff_sampling": 32,
              "aff_random_sampling_rate": 0.2, "syn_metric": "CC", "syn_sampling": 4,
              "reg_iterations": (120, 80, 40, 20), "grad_step": 0.2, "flow_sigma": 3,
              "total_sigma": 0, "mask_all_stages": False, "singleprecision": True,
              "use_legacy_histogram_matching": False}
# Fixed, previously reviewed neck-crop ranges on canonical raw data. No image values are altered.
# P0006 is exactly the raw [45:234] crop used in the feasibility measurement.
CROP_Z = {"ds007036_sub-P0001_ses-01": (60, 249), "ds007036_sub-P0002_ses-01": (52, 241),
          "ds007036_sub-P0006_ses-01": (45, 234), "ds007036_sub-P0007_ses-01": (60, 249),
          "ds007036_sub-P0009_ses-01": (59, 248), "ds007036_sub-P0013_ses-01": (59, 248),
          "ds007561_sub-03_ses-01": (48, 218)}
DARK, SHRINK = 0.35, 0.5


def volume_ml(path: Path) -> float:
    """Unrounded mask volume on its actual spatial grid, in mL."""
    image = canonical(path)
    return float(np.asarray(image.dataobj).sum() * abs(np.linalg.det(np.asarray(image.affine)[:3, :3])) / 1000)


def coordinate_field(source_path: Path, source, fixed, transforms: list[str]) -> np.ndarray:
    """Resample source RAS physical coordinates, including both affine and nonlinear transforms."""
    image = canonical(source_path)
    ijk = np.indices(image.shape, dtype=np.float32).reshape(3, -1)
    affine = np.asarray(image.affine)
    xyz = (affine[:3, :3] @ ijk + affine[:3, 3:]).T.reshape(*image.shape, 3).astype(np.float32)
    result = np.stack([cast(Any, ants.apply_transforms(fixed=fixed, moving=source.new_image_like(xyz[..., c]),
                                                      transformlist=transforms, interpolator="linear")).numpy()
                       for c in range(3)], axis=-1)
    if not np.isfinite(result).all():
        raise ValueError(f"non-finite coordinate field from {source_path} using {transforms}")
    return result


def select_region(out: Path, moving, fixed, transforms: list[str]) -> dict:
    """Original dark-CSF / forward-J<0.5 / opening / largest-component selection rule."""
    image = canonical(out / "t1.nii.gz")
    data = np.asarray(image.dataobj, np.float32)
    spacing = np.linalg.norm(np.asarray(image.affine)[:3, :3], axis=0)
    brain = np.asarray(canonical(out / "brain_mask.nii.gz").dataobj) > 0.5
    coords = np.asarray(canonical(out / "mni_coords_in_t1.nii.gz").dataobj, np.float32)
    gradients = np.stack([np.stack(np.gradient(nd.gaussian_filter(coords[..., c], 2), *spacing), -1)
                          for c in range(3)], -2)
    ratio = np.linalg.det(gradients)
    depth = np.asarray(nd.distance_transform_edt(brain, sampling=spacing))
    threshold = float(DARK * np.percentile(data[depth > 20], 75))
    labels, count = cast(tuple[np.ndarray, int], nd.label(nd.binary_opening((data < threshold) & brain & (ratio < SHRINK))))
    sizes = np.bincount(labels.ravel())
    sizes[0] = 0
    if count == 0:
        raise ValueError(f"no region survives dark threshold {threshold} and forward-J<{SHRINK}: {out}")
    region = labels == int(np.argmax(sizes))
    nib.save(nib.Nifti1Image(region.astype(np.uint8), image.affine), out / "ventricles.nii.gz")
    warped = ants.apply_transforms(fixed=fixed, moving=moving.new_image_like(region.astype(np.float32)),
                                   transformlist=transforms, interpolator="nearestNeighbor")
    ants.image_write(warped, str(out / "ventricles_mni.nii.gz"))
    nib.save(nib.Nifti1Image(ratio.astype(np.float32), image.affine), out / "native-to-mni-ratio-sigma2.nii.gz")
    return {"dark_fraction": DARK, "forward_j_limit": SHRINK, "sigma_voxels": 2,
            "dark_threshold": threshold, "components": int(count), "voxels": int(region.sum()),
            "mean_forward_j": float(ratio[region].mean()),
            "subject_ml": volume_ml(out / "ventricles.nii.gz"),
            "mni_ml": volume_ml(out / "ventricles_mni.nii.gz")}


def register_one(raw: Path) -> None:
    """Regenerate a scan from its recorded raw source, or resume only a complete identical ANTs run."""
    name = raw.name.removesuffix("_T1w.nii.gz")
    crop = CROP_Z[name]
    out = DER / name
    with raw.open("rb") as stream:
        raw_sha256 = hashlib.file_digest(stream, "sha256").hexdigest()
    signature = json.loads(json.dumps({"pipeline": PIPELINE, "template": TEMPLATE, "parameters": PARAMETERS,
                                       "seed": SEED, "threads": THREADS, "raw_crop_z_indices": crop,
                                       "raw_sha256": raw_sha256}))
    complete = ("t1.nii.gz", "t1_brain.nii.gz", "brain_mask.nii.gz", "t1_brain_mni.nii.gz",
                "ventricles.nii.gz", "ventricles_mni.nii.gz", "mni_coords_in_t1.nii.gz",
                "subject_coords_in_mni.nii.gz", "t1_to_mni_jac.nii.gz", "native-to-mni-ratio-sigma2.nii.gz",
                "ants-0GenericAffine.mat", "ants-1Warp.nii.gz", "ants-1InverseWarp.nii.gz")
    if out.exists():
        source = out / "source.txt"
        if not source.exists() or source.read_text().strip() != str(raw):
            raise ValueError(f"refusing to replace {out}: source.txt must record {raw}")
        record = out / "registration.json"
        if (record.exists() and json.loads(record.read_text())["signature"] == signature
                and all((out / file).is_file() for file in complete)):
            logger.info("%s already registered with the same inputs and ANTs configuration", name)
            return
        logger.info("%s replacing obsolete or incomplete derivatives from the same source", name)
        shutil.rmtree(out)
    out.mkdir(parents=True)
    (out / "source.txt").write_text(str(raw) + "\n")
    logger.info("%s source=%s crop-z=%s template=%s", name, raw, crop, TEMPLATE)
    started = time.perf_counter()
    image = canonical(raw)
    data = np.asarray(image.dataobj, np.float32)[:, :, crop[0]:crop[1]]
    affine = np.asarray(image.affine).copy()
    affine[:3, 3] = (affine @ [0, 0, crop[0], 1])[:3]
    t1 = out / "t1.nii.gz"
    nib.save(nib.Nifti1Image(data, affine), t1)
    moving: Any = ants.image_read(str(t1))
    ref1, ref2 = template_path(), template_path(resolution=2)
    fixed1: Any = ants.image_read(str(ref1))
    fixed2: Any = ants.image_read(str(ref2))
    mask1: Any = ants.image_read(str(template_path("mask")))
    mask2: Any = ants.image_read(str(template_path("mask", 2)))
    dilated = mask2.new_image_like(nd.binary_dilation(mask2.numpy() > 0.5, iterations=3).astype(np.float32))
    set_ants_deterministic(on=False, seed_value=SEED)
    np.random.seed(SEED)
    logger.info("%s affine + SyN registration started", name)
    registration_start = time.perf_counter()
    reg = ants.registration(fixed=fixed2, moving=moving, mask=dilated, outprefix=str(out / "ants-"),
                            verbose=True, **PARAMETERS)
    registration_seconds = time.perf_counter() - registration_start
    logger.info("%s registration finished in %.3f s; warping brain mask, T1, coordinates and ROI", name, registration_seconds)
    probability: Any = ants.apply_transforms(fixed=moving, moving=mask1, transformlist=reg["invtransforms"], interpolator="linear")
    brain = np.asarray(nd.binary_fill_holes(probability.numpy() > 0.5))
    ants.image_write(moving.new_image_like(brain.astype(np.float32)), str(out / "brain_mask.nii.gz"))
    brain_t1 = moving.new_image_like(moving.numpy() * brain)
    ants.image_write(brain_t1, str(out / "t1_brain.nii.gz"))
    ants.image_write(ants.apply_transforms(fixed=fixed1, moving=brain_t1, transformlist=reg["fwdtransforms"],
                                          interpolator="linear"), str(out / "t1_brain_mni.nii.gz"))
    coordinates = coordinate_field(ref1, fixed1, moving, reg["invtransforms"])
    nib.save(nib.Nifti1Image(coordinates, affine), out / "mni_coords_in_t1.nii.gz")
    coordinates = coordinate_field(t1, moving, fixed1, reg["fwdtransforms"])
    nib.save(nib.Nifti1Image(coordinates, canonical(ref1).affine), out / "subject_coords_in_mni.nii.gz")
    region = select_region(out, moving, fixed1, reg["fwdtransforms"])
    # This composed image transform is MNI -> subject (pullback), INCLUDING affine.
    composed = ants.apply_transforms(fixed=fixed1, moving=moving, transformlist=reg["fwdtransforms"],
                                     compose=str(out / "full-pullback-"))
    jac = ants.create_jacobian_determinant_image(fixed1, composed, do_log=False, geom=True)
    if not np.isfinite(jac.numpy()).all():
        raise ValueError(f"non-finite full pullback Jacobian for {name}: {composed}")
    ants.image_write(jac, str(out / "t1_to_mni_jac.nii.gz"))
    record = {"pipeline": PIPELINE, "signature": signature, "source": str(raw),
              "template_reference": {"1mm": str(ref1), "2mm": str(ref2)},
              "fwdtransforms": reg["fwdtransforms"], "invtransforms": reg["invtransforms"],
              "region": region, "registration_seconds": registration_seconds,
              "total_seconds": time.perf_counter() - started,
              "jacobian_convention": "full affine+SyN MNI pullback: dV_subject / dV_MNI"}
    (out / "registration.json").write_text(json.dumps(record, indent=2))
    logger.info("%s done: %.6f -> %.6f mL in %.3f s", name, region["subject_ml"], region["mni_ml"], record["total_seconds"])


def main(only: str | None = None) -> None:
    """Register the selected real scan, or every raw scan, with progress and source validation."""
    raws = sorted(RAW.glob("*_T1w.nii.gz"))
    if only is not None:
        raws = [raw for raw in raws if raw.name == f"{only}_T1w.nii.gz"]
    if not raws:
        raise ValueError(f"no raw T1 scan matches {only!r} under {RAW}")
    for i, raw in enumerate(raws, 1):
        logger.info("[%s/%s] %s (seed=%s threads=%s deadline=%ss)", i, len(raws), raw.name, SEED, THREADS, MAX_SCAN_SECONDS)
        signal.alarm(MAX_SCAN_SECONDS)
        try:
            register_one(raw.resolve())
        finally:
            signal.alarm(0)
