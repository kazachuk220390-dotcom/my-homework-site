"""Build a portable static-site handoff without development files or dependencies."""
from pathlib import Path
from shutil import copy2, copytree, rmtree
from tempfile import TemporaryDirectory
from zipfile import ZipFile, ZIP_DEFLATED
from check_assets import validate, PUBLIC_FILES

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "dist"
RELEASE = ROOT / "release"


def main():
    report = validate()
    RELEASE.mkdir(exist_ok=True)
    archive = RELEASE / "sumnauka-review-v0.1.zip"
    # Build and validate before replacing an existing working release.
    with TemporaryDirectory(prefix="sumnauka-package-") as temporary:
        staging = Path(temporary) / "site"
        staging.mkdir()
        for name in PUBLIC_FILES:
            copy2(ROOT / name, staging / name)
        copytree(ROOT / "assets", staging / "assets")
        staged_archive = RELEASE / ".sumnauka-review-v0.1.tmp.zip"
        try:
            with ZipFile(staged_archive, "w", ZIP_DEFLATED) as bundle:
                for file in sorted(staging.rglob("*")):
                    if file.is_file():
                        bundle.write(file, file.relative_to(staging))
            with ZipFile(staged_archive) as bundle:
                if bundle.testzip() is not None:
                    raise ValueError("Archive integrity check failed")
            if staged_archive.stat().st_size > 4_000_000:
                raise ValueError("Archive exceeds the 4 MB handoff budget")
            if OUTPUT.exists():
                rmtree(OUTPUT)
            copytree(staging, OUTPUT)
            staged_archive.replace(archive)
        finally:
            staged_archive.unlink(missing_ok=True)
    print(f"Validated: {report['file_count']} files, {report['total_bytes']} bytes, no embedded base64")
    print(f"Static site: {OUTPUT}")
    print(f"Upload archive: {archive}")


if __name__ == "__main__":
    main()
