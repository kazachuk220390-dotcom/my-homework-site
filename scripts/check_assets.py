"""Check a small public bundle without printing file contents or image data."""
from hashlib import sha256
from pathlib import Path
import json
import re

ROOT = Path(__file__).resolve().parents[1]
PUBLIC_FILES = ("index.html", "styles.css", "app.js", "robots.txt", ".nojekyll")
MAX_IMAGE_BYTES = 400 * 1024
MAX_SITE_BYTES = 3_000_000
TEXT_TYPES = {".html", ".css", ".js", ".svg", ".txt"}
IMAGE_TYPES = {".svg", ".webp", ".avif", ".jpg", ".jpeg", ".png"}
ALLOWED_ASSET_TYPES = IMAGE_TYPES | {".woff2"}
EMBEDDED_BASE64 = re.compile(r"data:[^\s\"'<>]*;base64\s*,", re.IGNORECASE)


def validate(root=ROOT):
    files = [root / name for name in PUBLIC_FILES]
    assets = root / "assets"
    if not assets.is_dir():
        raise ValueError("Missing assets directory")
    entries = sorted(assets.rglob("*"))
    if any(path.is_symlink() for path in entries):
        raise ValueError("Symlinks are not allowed in public assets")
    files.extend(path for path in entries if path.is_file())
    report = []
    total = 0
    for path in files:
        if not path.is_file():
            raise ValueError(f"Missing public file: {path.name}")
        if path.is_symlink() or not path.resolve().is_relative_to(root.resolve()):
            raise ValueError(f"Public files must stay inside the checkout: {path.name}")
        relative = path.relative_to(root).as_posix()
        suffix = path.suffix.lower()
        if path.is_relative_to(assets) and suffix not in ALLOWED_ASSET_TYPES:
            raise ValueError(f"Unsupported public asset: {relative}")
        size = path.stat().st_size
        if suffix in IMAGE_TYPES and size > MAX_IMAGE_BYTES:
            raise ValueError(f"Optimize image first: {relative} ({size} bytes; limit {MAX_IMAGE_BYTES})")
        total += size
        if total > MAX_SITE_BYTES:
            raise ValueError(f"Public bundle too large: {total} bytes; limit {MAX_SITE_BYTES}")
        data = path.read_bytes()
        if suffix in TEXT_TYPES and EMBEDDED_BASE64.search(data.decode("utf-8")):
            raise ValueError(f"Embedded base64 is not allowed: {relative}; use a separate asset file")
        report.append({"path": relative, "bytes": len(data), "sha256": sha256(data).hexdigest()})
    return {"total_bytes": total, "file_count": len(report), "files": report}


def main():
    report = validate()
    release = ROOT / "release"
    release.mkdir(exist_ok=True)
    (release / "asset-report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    print(f"Assets OK: {report['file_count']} files, {report['total_bytes']} bytes, no embedded base64")
    print("Small size/hash report: release/asset-report.json")


if __name__ == "__main__":
    main()
