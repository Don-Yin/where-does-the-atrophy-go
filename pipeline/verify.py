"""Check a completed rebuild against the Lens's committed measurement metadata."""
import argparse
import json
import math
from pathlib import Path

from src.utils.paths import LENS_ASSETS, PIPELINE_DIR, RESULTS


def verify(assets: Path, reference: Path, weighted: Path) -> dict:
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
    measurement = json.loads(weighted.read_text())
    for field in ("scan", "template", "registration"):
        if measurement[field] != actual[field]:
            raise ValueError(f"weighted result differs at {field}: {measurement[field]!r} != {actual[field]!r}")
    for space in ("subject", "mni"):
        if measurement["volumes_ml"][space] != actual["ventricle_ml_exact"][space]:
            raise ValueError(f"weighted result differs at volumes_ml.{space}: {measurement['volumes_ml'][space]!r} "
                             f"!= {actual['ventricle_ml_exact'][space]!r}")
    checks = measurement["measurement"] | {
        "jacobian_weighted_ml": measurement["volumes_ml"]["jacobian_weighted"],
        "resampling_difference_percent": measurement["resampling_difference_percent"],
    }
    for field, value in expected["weighted_volume"].items():
        if not math.isclose(checks[field], value, rel_tol=0, abs_tol=1e-8):
            raise ValueError(f"weighted result differs at {field}: {checks[field]!r} != {value!r}")
    return {"status": "PASS", "exact_mask_ml": actual["ventricle_ml_exact"],
            "display_ml": actual["ventricle_ml"], "raw_sha256": source["sha256"],
            "weighted_ml": measurement["volumes_ml"]["jacobian_weighted"],
            "weighted_mm3": measurement["measurement"]["weighted_mm3"],
            "resampling_difference_percent": measurement["resampling_difference_percent"],
            "weighted_result": str(weighted),
            "key_slices": {space: {field: actual["key_slice"][space][field]
                                   for field in ("world_z_mm", "area_mm2")}
                           for space in ("subject", "common")},
            "matched_fields": fields + ["key_slice.subject", "key_slice.common", "weighted_volume"]}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--assets", type=Path, default=LENS_ASSETS)
    parser.add_argument("--reference", type=Path, default=PIPELINE_DIR / "reference-measurements.json")
    parser.add_argument("--weighted", type=Path, default=RESULTS / "tables" / "weighted-volume.json")
    args = parser.parse_args()
    print(json.dumps(verify(args.assets, args.reference, args.weighted), indent=2))
