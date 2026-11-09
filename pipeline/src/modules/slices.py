"""Seven world-axial slices and shared image sampling, independent of external presentation code."""
import json
import logging
from pathlib import Path
from typing import cast

import nibabel as nib
import numpy as np
from matplotlib import colormaps
from PIL import Image, ImageDraw, ImageFont
from scipy.ndimage import binary_erosion, gaussian_filter, map_coordinates

from src.utils.paths import DER, LENS_ASSETS, PIPELINE_DIR, scans

logger = logging.getLogger(__name__)
# Portable export of the shared recipe; resolve world positions on every image's own affine.
MNI_Z = tuple(json.loads((PIPELINE_DIR / "axial-slices.json").read_text())["requested_mni_z_mm"])
HALF, UP = (90, 108), 2
WARP_LOG2_CLIP, WARP_ALPHA = 1.5, 0.65
OUT = DER / "slices"


def canonical(path: Path) -> nib.Nifti1Image:
    """Read an image in closest RAS orientation, preserving its oblique physical affine."""
    image = nib.as_closest_canonical(nib.load(path))
    if image.affine is None:
        raise ValueError(f"image has no spatial affine: {path}")
    return cast(nib.Nifti1Image, image)


def sample(img: nib.Nifti1Image, world: np.ndarray, order: int = 1) -> np.ndarray:
    """Image values at physical RAS points (..., 3); explicit zero outside the image."""
    vox = np.linalg.inv(np.asarray(img.affine)) @ np.c_[world.reshape(-1, 3), np.ones(world[..., 0].size)].T
    data = np.asarray(img.dataobj, np.float32)
    if data.ndim == 4:
        return np.stack([map_coordinates(data[..., c], vox[:3], order=order, cval=0.0)
                         for c in range(data.shape[3])], -1).reshape(*world.shape[:-1], data.shape[3])
    return map_coordinates(data, vox[:3], order=order, cval=0.0).reshape(world.shape[:-1])


def slice_axes(centre: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """The one shared 181 x 217 mm display-grid contract, before radiological mirroring."""
    return (centre[0] + np.arange(-HALF[0], HALF[0] + 1, dtype=float),
            centre[1] + np.arange(HALF[1], -HALF[1] - 1, -1, dtype=float))


def axial_grid(x: np.ndarray, y: np.ndarray, z: float) -> np.ndarray:
    """Physical RAS points for one world-axial plane."""
    return np.stack(np.broadcast_arrays(x[None, :], y[:, None], np.full((1, 1), z)), -1)


def cut(img: nib.Nifti1Image, z: float, centre: np.ndarray, hi: float) -> Image.Image:
    """One 1 mm world-axial grid, nearest-upsampled; increasing RAS x before display mirroring."""
    world = axial_grid(*slice_axes(centre), z)
    grey = (np.clip(sample(img, world) / hi, 0, 1) * 255).astype(np.uint8)
    return Image.fromarray(np.kron(grey, np.ones((UP, UP), np.uint8)))


def warp_rgb(values: np.ndarray) -> np.ndarray:
    """RdBu_r at log2(full pullback J); reject invalid foreground rather than inventing values."""
    if not np.all(np.isfinite(values) & (values > 0)):
        raise ValueError(f"invalid sampled Jacobian: min={np.nanmin(values)}, max={np.nanmax(values)}")
    return colormaps["RdBu_r"]((np.clip(np.log2(values), -WARP_LOG2_CLIP, WARP_LOG2_CLIP) / WARP_LOG2_CLIP + 1) / 2)[..., :3]


def tiles(t1: Path, vent: Path, zs: list, centre, prefix: str, jacobian: nib.Nifti1Image | None = None) -> dict:
    """Export radiological Lens tiles and separate outlines; J overlays exist only in common space."""
    img, mask = canonical(t1), canonical(vent)
    affine = np.asarray(img.affine)
    a = np.asarray(img.dataobj, np.float32)
    hi = float(np.percentile(a[a > 0], 99.5))
    centre = (affine @ [*np.argwhere(a > 0).mean(0), 1])[:3] if centre is None else np.asarray(centre)
    x, y = slice_axes(centre)
    for k, z in enumerate(zs):
        grey = cut(img, z, centre, hi).transpose(Image.Transpose.FLIP_LEFT_RIGHT)
        draw, font = ImageDraw.Draw(grey), ImageFont.load_default(size=44)
        draw.text((8, 8), "R", fill=255, font=font)
        draw.text((grey.width - 8, 8), "L", fill=255, font=font, anchor="ra")
        grey.convert("RGB").save(LENS_ASSETS / "slices" / f"{prefix}-{k}.png")
        world = axial_grid(x, y, z)
        region = np.kron((sample(mask, world, order=0) > 0.5)[:, ::-1], np.ones((UP, UP), bool))
        edge = region & ~np.asarray(binary_erosion(region, iterations=2), dtype=bool)
        rgba = np.full((*region.shape, 4), 255, np.uint8)
        rgba[..., 3] = edge.astype(np.uint8) * 255
        Image.fromarray(rgba).save(LENS_ASSETS / "slices" / f"{prefix}-outline-{k}.png")
        if jacobian is not None:
            inside, values = sample(img, world) > 0, sample(jacobian, world)
            # Outside the foreground is transparent, not an invented Jacobian observation.
            colour = np.rint(warp_rgb(np.where(inside, values, 1)) * 255).astype(np.uint8)
            overlay = np.dstack([colour, inside.astype(np.uint8) * round(WARP_ALPHA * 255)])
            overlay = np.repeat(np.repeat(overlay[:, ::-1], UP, axis=0), UP, axis=1)
            Image.fromarray(overlay).save(LENS_ASSETS / "slices" / f"{prefix}-warp-{k}.png")
    return {"source": str(t1), "source_axis_codes": list(nib.aff2axcodes(affine)),
            "source_affine": affine.tolist(), "display": "radiological: image left=R, right=L, top=A",
            "letters": {"image_left": "R", "image_right": "L"},
            "image_x_world_mm": [float(x[-1]), float(x[0])], "image_y_world_mm": [float(y[0]), float(y[-1])]}


def key_slice(t1: Path, vent: Path, centre, prefix: str, jacobian: nib.Nifti1Image | None = None) -> dict:
    """Maximum ROI area on the same 1 mm world-axial grid as tiles; each space is independent."""
    img, mask = canonical(t1), canonical(vent)
    data = np.asarray(img.dataobj, np.float32)
    centre = (np.asarray(img.affine) @ [*np.argwhere(data > 0).mean(0), 1])[:3] if centre is None else np.asarray(centre)
    foreground = np.argwhere(np.asarray(mask.dataobj) > 0.5)
    if not len(foreground):
        raise ValueError(f"key slice requires a non-empty ROI volume: {vent}")
    affine = np.asarray(mask.affine)
    world_z = (affine[2, :3] @ foreground.T) + affine[2, 3]
    zs = np.arange(np.ceil(world_z.min()), np.floor(world_z.max()) + 1)
    x, y = slice_axes(centre)
    areas = []
    for z in zs:
        world = axial_grid(x, y, z)
        areas.append(int(np.count_nonzero(sample(mask, world, order=0) > 0.5)))
    best = int(np.argmax(areas))  # inferior tie-break on ascending z
    z = float(zs[best])
    orientation = tiles(t1, vent, [z], centre, f"{prefix}-key", jacobian)
    return {"world_z_mm": z, "coordinate_space": "MNI" if prefix == "common" else "subject scanner world",
            "area_mm2": areas[best], "mask_source": str(vent), "orientation": orientation,
            "method": "maximum nearest-neighbour ROI area on the exported 1 mm world-axial grid; inferior tie-break",
            "grid_step_mm": 1, "texture_prefix": f"{prefix}-key-0",
            "candidates": [{"world_z_mm": float(level), "area_mm2": area} for level, area in zip(zs, areas, strict=True)]}


def subject_planes(name: str) -> list[float]:
    """Mean subject scanner-world z mapped onto each common-space brain plane by ANTs."""
    coords = canonical(DER / name / "subject_coords_in_mni.nii.gz")
    brain = canonical(DER / name / "t1_brain_mni.nii.gz")
    xyz, inside = np.asarray(coords.dataobj, np.float32), np.asarray(brain.dataobj) > 0
    affine = np.asarray(coords.affine)
    planes = []
    for z in MNI_Z:
        k = round((z - affine[2, 3]) / affine[2, 2])
        if not inside[:, :, k].any():
            raise ValueError(f"no mapped brain foreground for {name} at MNI z={z} mm (k={k})")
        planes.append(round(float(xyz[:, :, k, 2][inside[:, :, k]].mean()), 1))
    return planes


def render(img: nib.Nifti1Image, planes: list[float], path: Path) -> None:
    """Diagnostic 3D brain and its world-axial slice planes; transform voxels by the full affine."""
    import pyvista as pv

    grid = pv.ImageData(dimensions=img.shape)
    grid.point_data["v"] = gaussian_filter((np.asarray(img.dataobj) > 0).astype(np.float32), 1.5).ravel(order="F")
    brain = grid.contour([0.5], scalars="v").smooth(n_iter=30)
    brain.points = (np.asarray(img.affine) @ np.c_[brain.points, np.ones(brain.n_points)].T)[:3].T
    lo, hi = np.array(brain.bounds[::2]), np.array(brain.bounds[1::2])
    centre = (lo + hi) / 2
    plot = pv.Plotter(off_screen=True, window_size=[900, 900])
    plot.add_mesh(brain, color="#bfbfbf", smooth_shading=True, specular=0.2)
    for z in planes:
        sheet = pv.Plane(center=(centre[0], centre[1], z), direction=(0, 0, 1),
                         i_size=(hi - lo)[0] * 1.1, j_size=(hi - lo)[1] * 1.1)
        plot.add_mesh(sheet, color="#e9e4d8", opacity=0.2)
        plot.add_mesh(sheet.extract_feature_edges(boundary_edges=True), color="#e9e4d8", line_width=2)
    plot.camera.focal_point = centre
    plot.camera.position = centre + 600 * np.array([-1.0, 0.12, 0.22])
    plot.camera.up = (0, 0, 1)
    plot.camera.view_angle = 30
    shot = plot.screenshot(transparent_background=True, return_img=True)
    plot.close()
    if shot is None:
        raise RuntimeError(f"3D slice render returned no image: {path}")
    alpha = np.nonzero(shot[..., 3] > 0)
    Image.fromarray(shot[alpha[0].min():alpha[0].max() + 1, alpha[1].min():alpha[1].max() + 1]).save(path)


def row(name: str, space: str, n: int) -> None:
    """3D diagnostic on the left, the seven radiological tiles inferior to superior on the right."""
    tiles = [Image.open(OUT / f"{name}-{space}-{k}.png") for k in range(n)]
    brain = Image.open(OUT / f"{name}-{space}-3d.png")
    h = tiles[0].height
    brain = brain.resize((round(brain.width * h / brain.height), h))
    canvas = Image.new("RGB", (brain.width + sum(t.width + 8 for t in tiles), h), "black")
    canvas.paste(brain, (0, 0), brain)
    x = brain.width + 8
    for tile in tiles:
        canvas.paste(tile, (x, 0))
        x += tile.width + 8
    canvas.save(OUT / f"{name}-{space}-row.png")


def main(only: str | None = None) -> None:
    """Regenerate selected or all scan slices and update the one shared slice-level manifest."""
    OUT.mkdir(parents=True, exist_ok=True)
    names = scans(only)
    manifest = OUT / "slices.json"
    facts: dict = json.loads(manifest.read_text()) if only is not None and manifest.exists() else {"subject_z_mm": {}}
    facts["mni_z_mm"] = list(MNI_Z)
    for i, name in enumerate(names, 1):
        planes = subject_planes(name)
        facts["subject_z_mm"][name] = planes
        for space, img, zs in (("subject", canonical(DER / name / "t1_brain.nii.gz"), planes),
                               ("common", canonical(DER / name / "t1_brain_mni.nii.gz"), list(MNI_Z))):
            data = np.asarray(img.dataobj, np.float32)
            hi = float(np.percentile(data[data > 0], 99.5))
            centre = (np.asarray(img.affine) @ [*np.argwhere(data > 0).mean(0), 1])[:3] if space == "subject" \
                else np.array([0.0, -18.0, 0.0])
            for k, z in enumerate(zs):
                cut(img, z, centre, hi).transpose(Image.Transpose.FLIP_LEFT_RIGHT).save(OUT / f"{name}-{space}-{k}.png")
            render(img, zs, OUT / f"{name}-{space}-3d.png")
            row(name, space, len(zs))
        logger.info("[%s/%s] %s subject z %s", i, len(names), name, planes)
    manifest.write_text(json.dumps(facts, indent=1))
