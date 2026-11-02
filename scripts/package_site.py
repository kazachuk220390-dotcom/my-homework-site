"""Build a portable static-site handoff without development files or dependencies."""
from pathlib import Path
from shutil import copy2, copytree, rmtree
from zipfile import ZipFile, ZIP_DEFLATED

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "dist"
RELEASE = ROOT / "release"
PUBLIC_FILES = ("index.html", "styles.css", "app.js", "robots.txt", ".nojekyll")


def main():
    for name in PUBLIC_FILES:
        if not (ROOT / name).is_file():
            raise FileNotFoundError(name)
    if OUTPUT.exists():
        rmtree(OUTPUT)
    OUTPUT.mkdir()
    for name in PUBLIC_FILES:
        copy2(ROOT / name, OUTPUT / name)
    copytree(ROOT / "assets", OUTPUT / "assets")
    RELEASE.mkdir(exist_ok=True)
    archive = RELEASE / "sumnauka-review-v0.1.zip"
    with ZipFile(archive, "w", ZIP_DEFLATED) as bundle:
        for file in sorted(OUTPUT.rglob("*")):
            if file.is_file():
                bundle.write(file, file.relative_to(OUTPUT))
    print(f"Static site: {OUTPUT}")
    print(f"Upload archive: {archive}")


if __name__ == "__main__":
    main()
