"""Export real ANTs-derived cortex, ROI morphs, slices and measurement metadata to the Lens.

Neutral cortex has no atlas labels. The ROI is the original dark-CSF / forward-J<0.5
largest-component rule, not a complete ventricle segmentation or a longitudinal disease measure.
All mapped geometry and full pullback-J colours come from the scan's affine + SyN transform.
"""
import json
import logging
import struct
from pathlib import Path
from typing import cast

import nibabel as nib
import numpy as np
import pyvista as pv
from scipy import ndimage as nd
from skimage.filters import threshold_multiotsu

from src.modules.compare import volume_curve
from src.modules.register import volume_ml
from src.modules.slices import (
    MNI_Z,
    WARP_ALPHA,
    WARP_LOG2_CLIP,
    canonical,
    key_slice,
    sample,
    tiles,
    warp_rgb,
)
from src.utils.paths import DER, TEMPLATE, scans, template_path
from src.utils.paths import LENS_ASSETS as OUT

logger = logging.getLogger(__name__)
BRAIN_RGB, VENT_RGB = (0.75, 0.75, 0.75), (1.0, 0.34, 0.15)


def contour(mask: np.ndarray, affine: np.ndarray, triangles: int, sigma=0.8, smooth=(8, 10)) -> pv.PolyData:
    """Largest mask surface in physical mm, with the existing smoothing and decimation recipe."""
    grid = pv.ImageData(dimensions=mask.shape)
    grid.point_data["v"] = nd.gaussian_filter(mask.astype(np.float32), sigma).ravel(order="F")
    mesh = grid.contour([0.5], scalars="v").connectivity("largest").extract_surface().triangulate().smooth(n_iter=smooth[0])
    mesh.points = (affine @ np.c_[mesh.points, np.ones(mesh.n_points)].T)[:3].T
    return normals(mesh.decimate(max(0.0, 1 - triangles / mesh.n_cells)).smooth(n_iter=smooth[1]))


def mesh(mask_path: Path, triangles: int) -> pv.PolyData:
    """Barely smoothed closed ROI surface, retaining voxel-scale detail."""
    image = canonical(mask_path)
    return contour(np.asarray(image.dataobj) > 0, np.asarray(image.affine), triangles, 0.5, (3, 0))


def gyri(t1_brain: Path, triangles: int) -> pv.PolyData:
    """Grey-matter / CSF boundary from multi-Otsu, with enclosed CSF filled for the outer surface."""
    image = canonical(t1_brain)
    data = np.asarray(image.dataobj, np.float32)
    threshold = float(threshold_multiotsu(data[data > 0], 3)[0])
    result = contour(np.asarray(nd.binary_fill_holes(nd.gaussian_filter(data, 0.6) > threshold)),
                     np.asarray(image.affine), triangles)
    logger.info("%s gyri threshold=%s triangles=%s", t1_brain, round(threshold), result.n_cells)
    return result


def normals(surface: object) -> pv.PolyData:
    """Orient and recompute per-vertex normals after changing physical geometry."""
    return cast(pv.PolyData, cast(pv.PolyData, surface).compute_normals(auto_orient_normals=True))


def morph(name: str, surface: pv.PolyData) -> pv.PolyData:
    """Carry each vertex to MNI using the saved full ANTs physical coordinate field."""
    target = surface.copy()
    target.points = sample(canonical(DER / name / "mni_coords_in_t1.nii.gz"), surface.points)
    return normals(target)


def shift_of(surface: pv.PolyData, target: pv.PolyData) -> np.ndarray:
    """Mean displacement used to recenter a morph without breaking shared registration."""
    return (target.points - surface.points).mean(0)


def planes(src: pv.PolyData, dst: pv.PolyData, z_src: list, z_dst: list) -> tuple[pv.PolyData, pv.PolyData, np.ndarray]:
    """Seven faint axial sheets with solid 1.2 mm frames, in subject and template coordinates."""
    rim, out = 1.2, []
    for surface, zs in ((src, z_src), (dst, z_dst)):
        lo, hi = np.array(surface.bounds[::2]), np.array(surface.bounds[1::2])
        centre, half = (lo + hi)[:2] / 2, (hi - lo)[:2] * 0.55
        points = []
        for z in zs:
            for size in (half, half - rim):
                points += [[centre[0] + sx * size[0], centre[1] + sy * size[1], z]
                           for sx, sy in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
        out.append(np.array(points, float))
    faces = []
    for k in range(len(z_src)):
        outer, inner = 8 * k, 8 * k + 4
        faces += [[3, inner, inner + 1, inner + 2], [3, inner, inner + 2, inner + 3]]
        for j in range(4):
            a, b = j, (j + 1) % 4
            faces += [[3, outer + a, outer + b, inner + b], [3, outer + a, inner + b, inner + a]]
    rgba = np.tile([[0.85, 0.85, 0.85, 0.95]] * 4 + [[0.85, 0.85, 0.85, 0.12]] * 4, (len(z_src), 1))
    source, target = (pv.PolyData(points, np.array(faces).ravel()) for points in out)
    for surface in (source, target):
        surface.point_data["Normals"] = np.tile([0.0, 0.0, 1.0], (surface.n_points, 1)).astype(np.float32)
    return source, target, rgba


def glb(path: Path, surface: pv.PolyData, rgb: tuple | np.ndarray, target: pv.PolyData | None = None,
        origin=None, shift=None, groups: list[str] | None = None) -> None:
    """glTF 2.0 in metres, optional equal-face groups and a named mni morph target.

    Shared origins/shifts keep cortex and region registered. COLOR_0 is normalised RGBA bytes,
    as required by the Lens importer; warp variants alter colour only, never runtime buffers.
    """
    origin = surface.points.mean(0) if origin is None else origin
    rgba = np.asarray(rgb, np.float64)
    rgba = rgba if rgba.shape[-1] == 4 else np.concatenate([rgba, np.ones(rgba.shape[:-1] + (1,))], -1)
    arrays = [surface.faces.reshape(-1, 4)[:, 1:].astype(np.uint32).ravel(),
              ((surface.points - origin) * 0.001).astype(np.float32),
              np.asarray(surface.point_data["Normals"], np.float32),
              np.broadcast_to(np.rint(rgba * 255), (surface.n_points, 4)).astype(np.uint8)]
    if target is not None:
        target_origin = origin + (shift_of(surface, target) if shift is None else shift)
        arrays += [((target.points - target_origin) * 0.001).astype(np.float32) - arrays[1],
                   np.asarray(target.point_data["Normals"], np.float32) - arrays[2]]
    blob, views, accessors = b"", [], []
    for k, array in enumerate(arrays):
        views.append({"buffer": 0, "byteOffset": len(blob), "byteLength": array.nbytes,
                      "target": 34963 if k == 0 else 34962})
        accessor = {"bufferView": k, "componentType": {np.uint32: 5125, np.float32: 5126, np.uint8: 5121}[array.dtype.type],
                    "count": array.size if k == 0 else len(array), "type": "SCALAR" if k == 0 else f"VEC{array.shape[1]}"}
        if array.dtype == np.uint8:
            accessor["normalized"] = True
        if k in (1, 4):
            accessor |= {"min": array.min(0).tolist(), "max": array.max(0).tolist()}
        accessors.append(accessor)
        blob += array.tobytes()
    if not all(np.isfinite(array).all() for array in arrays):
        raise ValueError(f"non-finite geometry in exported mesh: {path}")
    primitive = {"attributes": {"POSITION": 1, "NORMAL": 2, "COLOR_0": 3}, "indices": 0}
    meshdef = {"name": path.stem, "primitives": [primitive]}
    if target is not None:
        primitive["targets"] = [{"POSITION": 4, "NORMAL": 5}]
        meshdef |= {"weights": [0.0], "extras": {"targetNames": ["mni"]}}
    meshes, nodes = [meshdef], [{"name": path.stem, "mesh": 0}]
    if groups is not None:
        if not groups or len(arrays[0]) % (3 * len(groups)):
            raise ValueError("GLB groups must partition equal numbers of whole triangles")
        count = len(arrays[0]) // len(groups)
        meshes, nodes = [], []
        for i, name in enumerate(groups):
            index = len(accessors)
            accessors.append(accessors[0] | {"byteOffset": i * count * 4, "count": count})
            meshes.append(meshdef | {"name": name, "primitives": [primitive | {"indices": index}]})
            nodes.append({"name": name, "mesh": i})
    doc = {"asset": {"version": "2.0", "generator": "exp_001_atrophy_assets"}, "scene": 0,
           "scenes": [{"nodes": list(range(len(nodes)))}], "nodes": nodes, "meshes": meshes,
           "buffers": [{"byteLength": len(blob)}], "bufferViews": views, "accessors": accessors}
    js = json.dumps(doc).encode()
    js += b" " * (-len(js) % 4)
    blob += b"\0" * (-len(blob) % 4)
    path.write_bytes(struct.pack("<III", 0x46546C67, 2, 28 + len(js) + len(blob))
                     + struct.pack("<II", len(js), 0x4E4F534A) + js + struct.pack("<II", len(blob), 0x004E4942) + blob)


def main(name: str) -> None:
    """Export the selected completed ANTs run, with exact-mask and rounded display measurements."""
    scans(name)
    registration = json.loads((DER / name / "registration.json").read_text())
    (OUT / "slices").mkdir(parents=True, exist_ok=True)
    vent = DER / name / "ventricles.nii.gz"
    patient = gyri(DER / name / "t1_brain.nii.gz", 90_000)
    vmesh, origin = mesh(vent, 30_000), patient.points.mean(0)
    patient_mni = morph(name, patient)
    jacobian_path = DER / name / "t1_to_mni_jac.nii.gz"
    jacobian, cortex_j = canonical(jacobian_path), {}
    head, mask = canonical(template_path()), canonical(template_path("mask"))
    template_brain = DER / "template-brain.nii.gz"
    nib.save(nib.Nifti1Image(np.asarray(head.dataobj, np.float32) * (np.asarray(mask.dataobj) > 0.5), head.affine), template_brain)
    template = gyri(template_brain, 90_000)
    for label, source, target, mni_points, centre in (("patient", patient, patient_mni, patient_mni.points, origin),
                                                    ("template", template, None, template.points, None)):
        values = sample(jacobian, mni_points)
        glb(OUT / f"{label}.glb", source, BRAIN_RGB, target, centre)
        glb(OUT / f"{label}-warp.glb", source, warp_rgb(values), target, centre)
        cortex_j[label] = {"vertices": source.n_points, "min": float(values.min()), "max": float(values.max())}
    glb(OUT / "ventricles.glb", vmesh, VENT_RGB, morph(name, vmesh), origin)
    zs = json.loads((DER / "slices/slices.json").read_text())["subject_z_mm"][name]
    sheet, sheet_mni, rgba = planes(patient, template, zs, list(MNI_Z))
    glb(OUT / "planes.glb", sheet, rgba, sheet_mni, origin, shift=template.points.mean(0) - origin,
        groups=[f"Plane{i}" for i in range(len(MNI_Z))])
    orientation = {"subject": tiles(DER / name / "t1_brain.nii.gz", vent, zs, None, "subject"),
                   "common": tiles(DER / name / "t1_brain_mni.nii.gz", DER / name / "ventricles_mni.nii.gz", list(MNI_Z),
                                   (0.0, -18.0, 0.0), "common", jacobian)}
    exact = {"subject": volume_ml(vent), "mni": volume_ml(DER / name / "ventricles_mni.nii.gz")}
    display = {space: round(value, 1) for space, value in exact.items()}
    facts = {"scan": name, "region": "lateral ventricle region compressed by the warp (image-segmented)",
             "registration": registration["signature"], "template": TEMPLATE, "raw_source": registration["source"],
             "ventricle_ml": display, "ventricle_ml_exact": exact,
             "mni_z_mm": list(MNI_Z), "subject_z_mm": zs, "slice_orientation": orientation,
             "key_slice": {"subject": key_slice(DER / name / "t1_brain.nii.gz", vent, None, "subject"),
                           "common": key_slice(DER / name / "t1_brain_mni.nii.gz", DER / name / "ventricles_mni.nii.gz",
                                               (0.0, -18.0, 0.0), "common", jacobian)},
             "volume_curve": volume_curve(OUT / "ventricles.glb", display),
             "warp_jacobian": {"source": str(jacobian_path), "units": "patient volume per template volume",
                               "transform": "full affine+SyN geometric pullback Jacobian", "colour": "RdBu_r",
                               "log2_clip": WARP_LOG2_CLIP, "slice_alpha": WARP_ALPHA,
                               "blue": "stretched into template (J < 1)", "red": "squeezed into template (J > 1)",
                               "cortex": cortex_j, "subject_display": "neutral cortex and slices; no Jacobian overlay",
                               "morph_display": "neutral to full J vertex colour, weighted by the current morph weight",
                               "common_sampling": "MNI world -> MNI Jacobian", "caveat": "spatial warp, not atrophy"},
             "triangles": {"patient": patient.n_cells, "ventricles": vmesh.n_cells}}
    (OUT / "region.json").write_text(json.dumps(facts, indent=1))
    logger.info("exported %s: %s; key slices %s", name, display,
                {space: {key: value[key] for key in ("world_z_mm", "area_mm2")} for space, value in facts["key_slice"].items()})
