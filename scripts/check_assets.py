"""Check a small public bundle without printing file contents or image data."""
from hashlib import sha256
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urlsplit
import json
import re

ROOT = Path(__file__).resolve().parents[1]
PUBLIC_FILES = ("index.html", "styles.css", "app.js", "robots.txt", ".nojekyll")
MAX_IMAGE_BYTES = 400 * 1024
MAX_SITE_BYTES = 3_000_000
TEXT_TYPES = {".html", ".css", ".js", ".svg", ".txt"}
IMAGE_TYPES = {".svg", ".webp", ".avif", ".jpg", ".jpeg", ".png"}
ALLOWED_ASSET_TYPES = IMAGE_TYPES | {".woff2"}
ALLOWED_LICENSE_FILES = {"assets/fonts/OFL.txt"}
EMBEDDED_BASE64 = re.compile(r"data:[^\s\"'<>]*;base64\s*,", re.IGNORECASE)
CSS_URL = re.compile(r"url\(\s*(['\"]?)(.*?)\1\s*\)", re.IGNORECASE)


class ImageReferences(HTMLParser):
    def __init__(self):
        super().__init__()
        self.urls = []
        self.styles = []
        self.in_style = False

    def handle_starttag(self, tag, attributes):
        attrs = dict(attributes)
        if tag in {"img", "source", "input"} and attrs.get("src"):
            self.urls.append(attrs["src"])
        if tag in {"img", "source"} and attrs.get("srcset"):
            self.urls.extend(candidate.strip().split()[0]
                             for candidate in attrs["srcset"].split(",") if candidate.strip())
        if tag == "link" and "icon" in attrs.get("rel", "").split() and attrs.get("href"):
            self.urls.append(attrs["href"])
        if tag == "image" and (attrs.get("href") or attrs.get("xlink:href")):
            self.urls.append(attrs.get("href") or attrs["xlink:href"])
        if attrs.get("style"):
            self.styles.append(attrs["style"])
        if tag == "style":
            self.in_style = True

    handle_startendtag = handle_starttag

    def handle_endtag(self, tag):
        if tag == "style":
            self.in_style = False

    def handle_data(self, data):
        if self.in_style:
            self.styles.append(data)


def selected_assets(root):
    """Keep uploaded originals intact; bundle only explicitly selected derivatives."""
    assets = root / "assets"
    if not assets.is_dir() or assets.is_symlink():
        raise ValueError("Missing or symlinked assets directory")
    manifest = root / "site-assets.json"
    if manifest.exists():
        if manifest.is_symlink():
            raise ValueError("Asset manifest must not be a symlink")
        specification = json.loads(manifest.read_text())
        names = specification.get("files")
        if specification.get("version") != 1 or not isinstance(names, list):
            raise ValueError("Unsupported asset manifest")
        if any(not isinstance(name, str) for name in names) or len(set(names)) != len(names):
            raise ValueError("Manifest asset names must be unique strings")
        files = []
        for name in names:
            path = Path(name)
            if (path.is_absolute() or "\\" in name or any(part in {".", ".."} for part in name.split("/"))
                    or not name.startswith("assets/")):
                raise ValueError("Manifest assets must be relative paths inside assets/")
            target = root / path
            if any(parent.is_symlink() for parent in (target, *target.parents) if parent != root and parent.is_relative_to(root)):
                raise ValueError(f"Symlinks are not allowed in selected assets: {name}")
            files.append(target)
        return files
    entries = sorted(assets.rglob("*"))
    if any(path.is_symlink() for path in entries):
        raise ValueError("Symlinks are not allowed in public assets")
    return [path for path in entries if path.is_file()]


def check_image_references(root, files):
    declared = {path.relative_to(root).as_posix() for path in files}
    for source in files:
        if source.suffix.lower() not in {".html", ".css"}:
            continue
        text = source.read_text()
        if source.suffix.lower() == ".html":
            parser = ImageReferences()
            parser.feed(text)
            urls = parser.urls + [match[1] for style in parser.styles for match in CSS_URL.findall(style)]
        else:
            urls = [match[1] for match in CSS_URL.findall(text)]
        for url in urls:
            url = url.strip()
            if not url or url.startswith("#"):
                continue
            if url.startswith("data:"):
                # Existing tiny CSS select arrow, not a photo or a base64 payload.
                if (source.suffix.lower() != ".css" or not url.startswith("data:image/svg+xml,")
                        or len(url) > 2048 or EMBEDDED_BASE64.search(url)):
                    raise ValueError(f"Inline image is not allowed in {source.name}")
                continue
            parsed = urlsplit(url)
            if parsed.scheme or parsed.netloc:
                continue
            image = (root / unquote(parsed.path.lstrip("/"))) if parsed.path.startswith("/") else (source.parent / unquote(parsed.path))
            image = image.resolve()
            if not image.is_relative_to(root.resolve()):
                raise ValueError(f"Image reference escapes the checkout in {source.name}")
            relative = image.relative_to(root.resolve()).as_posix()
            if relative not in declared:
                raise ValueError(f"Image reference is missing from the asset manifest: {relative}")


def validate(root=ROOT):
    files = [root / name for name in PUBLIC_FILES]
    assets = root / "assets"
    files.extend(selected_assets(root))
    report = []
    total = 0
    for path in files:
        if not path.is_file():
            raise ValueError(f"Missing public file: {path.name}")
        if path.is_symlink() or not path.resolve().is_relative_to(root.resolve()):
            raise ValueError(f"Public files must stay inside the checkout: {path.name}")
        relative = path.relative_to(root).as_posix()
        suffix = path.suffix.lower()
        if (path.is_relative_to(assets) and suffix not in ALLOWED_ASSET_TYPES
                and relative not in ALLOWED_LICENSE_FILES):
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
    check_image_references(root, files)
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
