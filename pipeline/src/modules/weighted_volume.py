"""Measure the selected common-space mask with the full, unclipped pullback Jacobian."""
import json
import logging
from pathlib import Path

import numpy as np

from src.modules.register import volume_ml
from src.modules.slices import canonical
from src.utils.paths import DER, results_dir, scans

logger = logging.getLogger(__name__)
JACOBIAN_CONVENTION = "full affine+SyN MNI pullback: dV_subject / dV_MNI"


def measure(subject_path: Path, common_path: Path, jacobian_path: Path) -> dict:
    """Sum J times actual voxel volume over the binary MNI mask, without resampling or clipping."""
    common, jacobian = canonical(common_path), canonical(jacobian_path)
    if len(common.shape) != 3 or common.shape != jacobian.shape:
        raise ValueError(f"mask/Jacobian shape mismatch: {common_path} {common.shape}, {jacobian_path} {jacobian.shape}")
    affine = np.asarray(common.affine)
    if not np.allclose(affine, np.asarray(jacobian.affine), rtol=0, atol=1e-8):
        raise ValueError(f"mask/Jacobian grid mismatch: {common_path} affine={affine.tolist()}, "
                         f"{jacobian_path} affine={np.asarray(jacobian.affine).tolist()}")
    data = np.asarray(common.dataobj)
    if not np.all((data == 0) | (data == 1)):
        raise ValueError(f"expected a finite binary mask at {common_path}; values={np.unique(data)[:10].tolist()}")
    mask = data > 0.5
    count = int(mask.sum())
    if count == 0:
        raise ValueError(f"empty common-space mask at {common_path}")
    voxel_mm3 = abs(float(np.linalg.det(affine[:3, :3])))
    if not np.isfinite(voxel_mm3) or voxel_mm3 <= 0:
        raise ValueError(f"invalid voxel volume at {common_path}: {voxel_mm3} mm3")
    weights = np.asarray(jacobian.dataobj)[mask].astype(np.float64)
    bad = ~np.isfinite(weights) | (weights <= 0)
    if np.any(bad):
        raise ValueError(f"invalid Jacobian weights inside {common_path}: {jacobian_path}, "
                         f"count={int(bad.sum())}, values={weights[bad][:10].tolist()}")
    native_ml = volume_ml(subject_path)
    if not np.isfinite(native_ml) or native_ml <= 0:
        raise ValueError(f"invalid subject mask volume at {subject_path}: {native_ml} mL")
    weighted_mm3 = float(weights.sum(dtype=np.float64) * voxel_mm3)
    volumes = {"subject": native_ml, "mni": count * voxel_mm3 / 1000,
               "jacobian_weighted": weighted_mm3 / 1000}
    return {
        "inputs": {"subject_mask": str(subject_path), "common_mask": str(common_path),
                   "jacobian": str(jacobian_path)},
        "jacobian_convention": JACOBIAN_CONVENTION,
        "definition": "sum(J * voxel_mm3) over the nearest-neighbour-warped binary MNI mask; no colour clipping",
        "measurement": {"mask_voxels": count, "voxel_mm3": voxel_mm3, "weighted_mm3": weighted_mm3,
                        "mm3_per_ml": 1000,
                        "jacobian": {"min": float(weights.min()), "mean": float(weights.mean()),
                                     "max": float(weights.max())}},
        "volumes_ml": volumes,
        "display_ml": {key: round(value, 1) for key, value in volumes.items()},
        "resampling_difference_percent": 100 * (native_ml - volumes["jacobian_weighted"]) / native_ml,
        "percentage_definition": "100 * (subject_ml - jacobian_weighted_ml) / subject_ml; unrounded values",
        "caveat": "approximate recovery after nearest-neighbour mask resampling and discretisation; spatial warp, not atrophy",
        "exact_recovery_verified": False,
    }


def main(name: str) -> dict:
    """Write one selected completed registration's reproducible weighted-volume result."""
    scans(name)
    folder = DER / name
    registration = json.loads((folder / "registration.json").read_text())
    if registration["jacobian_convention"] != JACOBIAN_CONVENTION:
        raise ValueError(f"unexpected Jacobian convention at {folder / 'registration.json'}: "
                         f"{registration['jacobian_convention']!r}; expected {JACOBIAN_CONVENTION!r}")
    paths = [folder / file for file in ("ventricles.nii.gz", "ventricles_mni.nii.gz", "t1_to_mni_jac.nii.gz")]
    logger.info("measuring weighted volume from %s", paths)
    facts = {"scan": name, "registration": registration["signature"], "template": registration["signature"]["template"],
             **measure(*paths)}
    path = results_dir("tables") / "weighted-volume.json"
    path.write_text(json.dumps(facts, indent=2) + "\n")
    logger.info("wrote %s: volumes_ml=%s resampling_difference_percent=%s", path,
                facts["volumes_ml"], facts["resampling_difference_percent"])
    return facts
