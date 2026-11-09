"""Compare the measured region volumes of completed ANTs registrations."""
import json
import logging
import struct
from pathlib import Path

import numpy as np

from src.modules.register import volume_ml
from src.utils.paths import DER, results_dir, scans

logger = logging.getLogger(__name__)


def volume_curve(path: Path, endpoints: dict) -> dict:
    """Compare the closed GLB's signed-tetrahedron volume with mask endpoints; preserve the 3% rule."""
    blob = path.read_bytes()
    size = struct.unpack_from("<I", blob, 12)[0]
    doc, start = json.loads(blob[20:20 + size]), 28 + size

    def data(index):
        acc = doc["accessors"][index]
        view = doc["bufferViews"][acc["bufferView"]]
        width = {"SCALAR": 1, "VEC3": 3}[acc["type"]]
        return np.frombuffer(blob, {5125: np.uint32, 5126: np.float32}[acc["componentType"]],
                             count=acc["count"] * width, offset=start + view.get("byteOffset", 0)).reshape(-1, width)

    faces = data(0).reshape(-1, 3)
    points, delta = data(1).astype(float) * 1000, data(4).astype(float) * 1000
    edges = np.sort(faces[:, [[0, 1], [1, 2], [2, 0]]].reshape(-1, 2), axis=1)
    if not np.all(np.unique(edges, axis=0, return_counts=True)[1] == 2):
        raise ValueError(f"region mesh is not closed: {path}")
    weights, volumes = np.linspace(0, 1, 17), []
    for weight in weights:
        tri = (points + weight * delta)[faces]
        volumes.append(abs(np.einsum("ij,ij->i", tri[:, 0], np.cross(tri[:, 1], tri[:, 2])).sum()) / 6000)
    coefficients = np.polynomial.polynomial.polyfit(weights, volumes, 3)
    residual = float(np.max(np.abs(np.polynomial.polynomial.polyval(weights, coefficients) - volumes)))
    reference = np.array([endpoints["subject"], endpoints["mni"]])
    errors = np.abs(np.array(volumes)[[0, -1]] / reference - 1)
    approximate = bool(np.any(errors > 0.03))
    fitted = coefficients.copy()
    if approximate:  # explicit existing calibration, never claim an inaccurate mesh matches the masks
        correction = reference - np.polynomial.polynomial.polyval([0, 1], coefficients)
        fitted[:2] += [correction[0], correction[1] - correction[0]]
    return {"source": path.name, "method": "closed-mesh signed tetrahedra; cubic fit; coefficients ascending in w",
            "coefficients_ml": fitted.tolist(), "mesh_coefficients_ml": coefficients.tolist(),
            "mesh_endpoint_ml": {"subject": volumes[0], "mni": volumes[-1]},
            "endpoint_relative_error": {"subject": float(errors[0]), "mni": float(errors[1])},
            "endpoint_tolerance": 0.03, "approximate": approximate, "endpoints_pinned": approximate,
            "max_fit_residual_ml": residual, "samples": [{"weight": float(w), "mesh_ml": v} for w, v in zip(weights, volumes, strict=True)]}


def main(only: str | None = None) -> list[dict]:
    """Read actual NN masks; round displayed values only after calculating volume ratios."""
    rows = []
    names = scans(only)
    for i, name in enumerate(names, 1):
        subject = volume_ml(DER / name / "ventricles.nii.gz")
        mni = volume_ml(DER / name / "ventricles_mni.nii.gz")
        rows.append({"scan": name, "subject_ml": round(subject, 1), "mni_ml": round(mni, 1),
                     "subject_ml_exact": subject, "mni_ml_exact": mni,
                     "kept": round(mni / subject, 4), "difference_ml": round(subject - mni, 1)})
        logger.info("[%s/%s] %s", i, len(names), json.dumps(rows[-1]))
    path = results_dir("tables") / (f"{only}-validation.json" if only is not None else "scan-comparison.json")
    path.write_text(json.dumps(rows, indent=1))
    return rows
