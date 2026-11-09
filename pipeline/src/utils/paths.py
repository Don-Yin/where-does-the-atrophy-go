"""Repository-local producer paths, with explicit environment overrides for isolated rebuilds."""
import os
from pathlib import Path

PIPELINE_DIR = Path(__file__).resolve().parents[2]
REPOSITORY = PIPELINE_DIR.parent
RESULTS = Path(os.environ.get("ATROPHY_RESULTS_DIR", PIPELINE_DIR / ".results")).expanduser().resolve()
RAW = Path(os.environ.get("ATROPHY_RAW_DIR", PIPELINE_DIR / "raw")).expanduser().resolve()
WORK = Path(os.environ.get("ATROPHY_WORK_DIR", PIPELINE_DIR / ".intermediates")).expanduser().resolve()
DER = WORK / "derivatives"
LENS_ASSETS = Path(os.environ.get("ATROPHY_ASSET_DIR", REPOSITORY / "Assets/Brain")).expanduser().resolve()
TEMPLATE = "MNI152NLin2009cAsym"
TEMPLATEFLOW_HOME = Path(os.environ.get("TEMPLATEFLOW_HOME", WORK / "templateflow")).expanduser().resolve()
PIPELINE = "antspy-affine-syn-2009c"

# TemplateFlow owns its cache; registration configures ITK before importing ANTs.
os.environ["TEMPLATEFLOW_HOME"] = str(TEMPLATEFLOW_HOME)


def template_path(kind: str = "T1w", resolution: int = 1) -> Path:
    """Resolve the template's own full-head T1 or brain mask, never distribution-bundled data."""
    from templateflow import TemplateFlowClient

    path = TemplateFlowClient().get(TEMPLATE, resolution=resolution, suffix=kind, extension=".nii.gz",
                                    desc="brain" if kind == "mask" else None)
    if not isinstance(path, Path):
        raise TypeError(f"expected one {TEMPLATE} {kind} {resolution}mm image, got {path!r}")
    return path


def results_dir(*parts: str) -> Path:
    """Return a nested .results/ subdirectory, creating it if needed."""
    target = RESULTS.joinpath(*parts)
    target.mkdir(parents=True, exist_ok=True)
    return target


def scans(only: str | None = None) -> list[str]:
    """Completed ANTs scans only; a legacy output is never a resumable ANTs result."""
    import json

    names = []
    if not DER.is_dir():
        raise ValueError(f"no registrations under {DER}; run the register step first")
    for path in sorted(DER.iterdir()):
        record = path / "registration.json"
        if (record.exists() and json.loads(record.read_text())["pipeline"] == PIPELINE
                and (only is None or path.name == only)):
            names.append(path.name)
    if only is not None and not names:
        raise ValueError(f"no completed {PIPELINE} registration for scan {only!r} under {DER}")
    return names
