"""Focused regression checks for physical-volume weighting and its pipeline entry."""
import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

import nibabel as nib
import numpy as np
from src.modules.slices import canonical
from src.modules.weighted_volume import JACOBIAN_CONVENTION, measure
from src.utils.paths import PIPELINE
from verify import verify

PIPELINE_DIR = Path(__file__).resolve().parents[1]


class WeightedVolumeTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.subject = self.save("subject.nii.gz", np.ones((2, 2, 2)), np.diag([5, 5, 5, 1]))
        mask = np.zeros((2, 2, 2))
        mask[0, 0, 0] = mask[1, 1, 1] = 1
        self.common = self.save("common.nii.gz", mask)
        weights = mask.copy()
        weights[0, 0, 0], weights[1, 1, 1] = 2, 8
        self.jacobian = self.save("jacobian.nii.gz", weights)

    def save(self, name, data, affine=None):
        path = self.root / name
        path.parent.mkdir(parents=True, exist_ok=True)
        nib.save(nib.Nifti1Image(np.asarray(data, np.float32), np.eye(4) if affine is None else affine), path)
        return path

    def measure(self):
        return measure(self.subject, self.common, self.jacobian)

    def test_unclipped_weights_use_the_affine_determinant(self):
        affine = np.array([[2, 1, 0, 10], [0, 3, 0, -4], [0, 0, 4, 7], [0, 0, 0, 1]])
        for path in (self.common, self.jacobian):
            self.save(path.name, canonical(path).get_fdata(), affine)
        result = self.measure()
        self.assertAlmostEqual(result["measurement"]["voxel_mm3"], 24)
        self.assertAlmostEqual(result["measurement"]["weighted_mm3"], 240)
        self.assertAlmostEqual(result["volumes_ml"]["mni"], 0.048)
        self.assertAlmostEqual(result["volumes_ml"]["jacobian_weighted"], 0.24)
        self.assertAlmostEqual(result["volumes_ml"]["subject"], 1)
        self.assertAlmostEqual(result["resampling_difference_percent"], 76)
        self.assertFalse(result["exact_recovery_verified"])

    def test_equivalent_storage_orientation_is_canonicalized(self):
        image = canonical(self.jacobian).as_reoriented([[0, -1], [1, 1], [2, 1]])
        nib.save(image, self.jacobian)
        self.assertAlmostEqual(self.measure()["measurement"]["weighted_mm3"], 10)

    def test_different_grid_or_shape_is_rejected(self):
        affine = np.eye(4)
        affine[0, 3] = 1
        self.save(self.jacobian.name, np.ones((2, 2, 2)), affine)
        with self.assertRaisesRegex(ValueError, "grid mismatch.*common.nii.gz.*jacobian.nii.gz"):
            self.measure()
        self.save(self.jacobian.name, np.ones((2, 2, 3)))
        with self.assertRaisesRegex(ValueError, "shape mismatch"):
            self.measure()

    def test_empty_nonbinary_or_nonfinite_mask_is_rejected(self):
        for value in (0, 0.25, np.nan):
            with self.subTest(value=value):
                self.save(self.common.name, np.full((2, 2, 2), value))
                with self.assertRaisesRegex(ValueError, "empty common-space mask|finite binary mask"):
                    self.measure()

    def test_invalid_jacobian_is_rejected_only_inside_the_mask(self):
        original = canonical(self.jacobian).get_fdata()
        for value in (0, -1, np.nan, np.inf):
            with self.subTest(value=value):
                weights = original.copy()
                weights[0, 0, 0] = value
                self.save(self.jacobian.name, weights)
                with self.assertRaisesRegex(ValueError, "invalid Jacobian weights.*jacobian.nii.gz.*values="):
                    self.measure()
        weights = original.copy()
        weights[0, 1, 0] = np.nan
        self.save(self.jacobian.name, weights)
        self.assertEqual(self.measure()["measurement"]["weighted_mm3"], 10)

    def test_invalid_subject_volume_is_rejected(self):
        self.save(self.subject.name, np.zeros((2, 2, 2)))
        with self.assertRaisesRegex(ValueError, "invalid subject mask volume.*subject.nii.gz"):
            self.measure()

    def run_cli(self, *, no_profile=False, invalid=False):
        folder = self.root / "work" / "derivatives" / "example"
        folder.mkdir(parents=True)
        for source, name in ((self.subject, "ventricles.nii.gz"), (self.common, "ventricles_mni.nii.gz"),
                             (self.jacobian, "t1_to_mni_jac.nii.gz")):
            nib.save(canonical(source), folder / name)
        signature = {"template": "synthetic-template"}
        (folder / "registration.json").write_text(json.dumps({"pipeline": PIPELINE, "signature": signature,
                                                               "jacobian_convention": JACOBIAN_CONVENTION}))
        if invalid:
            self.save("work/derivatives/example/t1_to_mni_jac.nii.gz", np.zeros((2, 2, 2)))
        command = [sys.executable, str(PIPELINE_DIR / "run.py"), "--steps", "weighted", "--scan", "example"]
        if no_profile:
            command.append("--no-profile")
        result = subprocess.run(command, env=os.environ | {"ATROPHY_WORK_DIR": str(self.root / "work"),
                                                          "ATROPHY_RESULTS_DIR": str(self.root / "results")},
                                capture_output=True, text=True, check=False)
        return result, self.root / "results"

    def test_cli_writes_result_profile_and_passes_fixed_reference_verification(self):
        process, results = self.run_cli()
        self.assertEqual(process.returncode, 0, process.stderr)
        weighted = results / "tables" / "weighted-volume.json"
        facts = json.loads(weighted.read_text())
        self.assertEqual(facts["scan"], "example")
        self.assertEqual(facts["measurement"]["weighted_mm3"], 10)
        self.assertGreater((results / "profile" / "run.html").stat().st_size, 0)
        reference = json.loads((PIPELINE_DIR / "reference-measurements.json").read_text())
        reference.update(scan="example", template=facts["template"], registration=facts["registration"],
                         ventricle_ml={key: facts["display_ml"][key] for key in ("subject", "mni")},
                         ventricle_ml_exact={key: facts["volumes_ml"][key] for key in ("subject", "mni")})
        reference["registration"]["raw_sha256"] = json.loads((PIPELINE_DIR / "scan-source.json").read_text())["sha256"]
        facts["registration"] = reference["registration"]
        weighted.write_text(json.dumps(facts))
        reference["weighted_volume"] = {key: facts["measurement"][key] for key in ("mask_voxels", "voxel_mm3", "weighted_mm3")}
        reference["weighted_volume"].update(jacobian_weighted_ml=facts["volumes_ml"]["jacobian_weighted"],
                                             resampling_difference_percent=facts["resampling_difference_percent"])
        (self.root / "region.json").write_text(json.dumps(reference))
        expected = self.root / "reference.json"
        expected.write_text(json.dumps(reference))
        self.assertEqual(verify(self.root, expected, weighted)["status"], "PASS")
        facts["measurement"]["weighted_mm3"] += 1
        weighted.write_text(json.dumps(facts))
        with self.assertRaisesRegex(ValueError, "weighted result differs at weighted_mm3"):
            verify(self.root, expected, weighted)

    def test_cli_failure_is_nonzero_and_still_writes_profile(self):
        process, results = self.run_cli(invalid=True)
        self.assertNotEqual(process.returncode, 0)
        self.assertIn("invalid Jacobian weights", process.stderr)
        self.assertFalse((results / "tables" / "weighted-volume.json").exists())
        self.assertGreater((results / "profile" / "run.html").stat().st_size, 0)

    def test_cli_no_profile_is_explicit_opt_out(self):
        process, results = self.run_cli(no_profile=True)
        self.assertEqual(process.returncode, 0, process.stderr)
        self.assertTrue((results / "tables" / "weighted-volume.json").is_file())
        self.assertFalse((results / "profile").exists())


if __name__ == "__main__":
    unittest.main()
