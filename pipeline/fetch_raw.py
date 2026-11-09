"""Download the checksum-pinned, public P0006 T1 image used by the Lens."""
import argparse
import hashlib
import json
from contextlib import closing
from http.client import HTTPSConnection
from pathlib import Path
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parent
SOURCE = json.loads((ROOT / "scan-source.json").read_text())


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def fetch(output_dir: Path) -> Path:
    """Never accept another dataset revision or leave a partial file at the raw input path."""
    output_dir.mkdir(parents=True, exist_ok=True)
    target = output_dir / SOURCE["local_filename"]
    if target.exists():
        if target.stat().st_size != SOURCE["bytes"] or sha256(target) != SOURCE["sha256"]:
            raise ValueError(f"existing raw image does not match ds007036 v1.1.3: {target}")
        print(f"Verified existing raw image: {target}", flush=True)
        return target
    url = SOURCE["download_url"]
    parts = urlsplit(url)
    if parts.scheme != "https" or parts.netloc != "s3.amazonaws.com" or not parts.path.startswith("/openneuro.org/ds007036/"):
        raise ValueError("raw image source must be the public HTTPS OpenNeuro S3 object")
    partial = target.with_name(target.name + ".part")
    try:
        with closing(HTTPSConnection("s3.amazonaws.com", timeout=120)) as connection:
            connection.request("GET", parts.path + ("?" + parts.query if parts.query else ""))
            response = connection.getresponse()
            if response.status != 200:
                raise RuntimeError(f"OpenNeuro download returned HTTP {response.status}")
            with partial.open("wb") as stream:
                while chunk := response.read(1024 * 1024):
                    stream.write(chunk)
        if partial.stat().st_size != SOURCE["bytes"] or sha256(partial) != SOURCE["sha256"]:
            raise ValueError("download does not match the snapshot's annex SHA-256 and size")
        partial.replace(target)
    finally:
        partial.unlink(missing_ok=True)
    print(f"Downloaded and verified ds007036 v1.1.3: {target}", flush=True)
    return target


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output-dir", type=Path, default=ROOT / "raw")
    fetch(parser.parse_args().output_dir.expanduser().resolve())
