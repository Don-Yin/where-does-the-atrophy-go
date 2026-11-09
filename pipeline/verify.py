"""Check a completed rebuild against the Lens's committed measurement metadata."""
import argparse
import json
from pathlib import Path

from src.utils.paths import LENS_ASSETS, PIPELINE_DIR


def verify(assets: Path, reference: Path) -> dict:
    actual = json.loads((assets / "region.json").read_text())
    expected = json.loads(reference.read_text())
    fields = ["scan", "template", "ventricle_ml", "ventricle_ml_exact", "mni_z_mm", "subject_z_mm"]
    for field in fields:
        if actual[field] != expected[field]:
            raise ValueError(f"rebuild differs at {field}: {actual[field]!r} != {expected[field]!r}")
    for space in ("subject", "common"):
        for field in ("world_z_mm", "area_mm2", "candidates"):
            if actual["key_slice"][space][field] != expected["key_slice"][space][field]:
                raise ValueError(f"rebuild differs at key_slice.{space}.{field}")
    source = json.loads((Path(__file__).resolve().parent / "scan-source.json").read_text())
    if actual["registration"]["raw_sha256"] != source["sha256"]:
        raise ValueError("rebuild did not use the checksum-pinned raw scan")
    return {"status": "PASS", "exact_mask_ml": actual["ventricle_ml_exact"],
            "display_ml": actual["ventricle_ml"], "raw_sha256": source["sha256"],
            "key_slices": {space: {field: actual["key_slice"][space][field]
                                   for field in ("world_z_mm", "area_mm2")}
                           for space in ("subject", "common")},
            "matched_fields": fields + ["key_slice.subject", "key_slice.common"]}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--assets", type=Path, default=LENS_ASSETS)
    parser.add_argument("--reference", type=Path, default=PIPELINE_DIR / "reference-measurements.json")
    args = parser.parse_args()
    print(json.dumps(verify(args.assets, args.reference), indent=2))
