"""Atrophy assets for the Lens: register T1 scans, cut slices, compare, Jacobian-weight and export.

    micromamba run -n ants-reg python pipeline/run.py [--steps ...] [--scan NAME]

Paths default to this repository. See pipeline/README.md for raw download and path overrides.
"""
import argparse
import logging

from src.utils.paths import RESULTS

STEPS = ("register", "slices", "compare", "weighted", "assets")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--steps", nargs="+", choices=STEPS, default=list(STEPS))
    parser.add_argument("--scan", default="ds007036_sub-P0006_ses-01", help="scan used for weighted volume and Lens asset export")
    parser.add_argument("--only-scan", help="limit registration, slices and comparison to one raw scan")
    parser.add_argument("--no-profile", action="store_true", help="skip the default pyinstrument html report")
    parser.add_argument("--resources", action="store_true", help="log wall, cpu, and peak rss for this run")
    return parser.parse_args()


def main(args: argparse.Namespace) -> None:
    if "register" in args.steps:
        from src.modules import register
        register.main(args.only_scan)
    if "slices" in args.steps:
        from src.modules import slices
        slices.main(args.only_scan)
    if "compare" in args.steps:
        from src.modules import compare
        compare.main(args.only_scan)
    if "weighted" in args.steps:
        from src.modules import weighted_volume
        weighted_volume.main(args.scan)
    if "assets" in args.steps:
        from src.modules import lens_assets
        lens_assets.main(args.scan)


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    args = parse_args()
    from src.utils.profiling import profiled, run_resources

    with run_resources(enabled=args.resources), profiled(None if args.no_profile else RESULTS / "profile" / "run.html"):
        main(args)
